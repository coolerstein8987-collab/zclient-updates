// Discord: „Mit Discord anmelden“ (OAuth2) und die optionale Brücke Zync-Kanal ↔ Discord-Kanal.
// Das Profil wird nur beim ersten Anmelden übernommen – danach gehört es Zync und bleibt hier änderbar.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { q, newId, BOTS, UPLOAD_DIR, serializeChannel } from './db.js';
import { channelForUser } from './access.js';
import { memberPerms, PERMS } from './perm.js';
import { createSession } from './auth.js';
import { emitToChannel, emitToUser, emitToRelated } from './realtime.js';
import { publicUser, selfUser } from './profile.js';
import { postMessage } from './post.js';
import { bus } from './bus.js';
import { getSetting } from './settings.js';
import { publicBase } from './admin.js';
import { fail, wrap, text } from './http.js';

const API = process.env.ZYNC_DISCORD_API || 'https://discord.com/api/v10';
const CDN = process.env.ZYNC_DISCORD_CDN || 'https://cdn.discordapp.com';

/** Öffentliche Routen (vor dem Login). */
export const discordAuth = express.Router();
/** Routen für eingeloggte Nutzer. */
export const discordApi = express.Router();

const creds = () => ({ id: getSetting('discord.clientId'), secret: getSetting('discord.clientSecret') });
const loginReady = () => { const c = creds(); return !!(c.id && c.secret); };

// Kurzlebige Zustände für den OAuth-Ablauf (nur im Speicher)
const states = new Map(); // state → { mode, userId, exp }
const handoffs = new Map(); // einmaliger Code → { token, exp }
const sweep = (m) => { const now = Date.now(); for (const [k, v] of m) if (v.exp < now) m.delete(k); };
const randomKey = () => crypto.randomBytes(18).toString('base64url');

function authorizeUrl(req, mode, userId) {
  sweep(states);
  const state = randomKey();
  states.set(state, { mode, userId, exp: Date.now() + 10 * 60_000 });
  const p = new URLSearchParams({
    client_id: creds().id,
    redirect_uri: `${publicBase(req)}/api/auth/discord/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${p}`;
}

discordAuth.get('/auth/config', (req, res) => res.json({ discordLogin: loginReady() }));

discordAuth.get('/auth/discord/start', (req, res) => {
  if (!loginReady()) return res.redirect('/#discord-error=' + encodeURIComponent('Discord-Anmeldung ist auf diesem Server nicht eingerichtet.'));
  res.redirect(authorizeUrl(req, 'login'));
});

async function discordJson(url, init) {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.message || `Discord antwortet mit ${r.status}`);
  return d;
}

/** Bild von Discord herunterladen und als Zync-Upload speichern. */
async function importImage(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || '';
    const ext = type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png';
    const name = `${newId()}${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(await r.arrayBuffer()));
    return `/uploads/${name}`;
  } catch {
    return null;
  }
}
const avatarUrl = (d) => d.avatar && `${CDN}/avatars/${d.id}/${d.avatar}.${d.avatar.startsWith('a_') ? 'gif' : 'png'}?size=512`;
const bannerUrl = (d) => d.banner && `${CDN}/banners/${d.id}/${d.banner}.${d.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`;

function freeUsername(raw) {
  let base = String(raw || 'discord').toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/^\.+|\.+$/g, '').slice(0, 26);
  if (base.length < 2) base = `discord${base}`;
  let name = base;
  for (let i = 2; q.get('SELECT 1 FROM users WHERE username = ?', name); i++) name = `${base}${i}`;
  return name;
}

async function createFromDiscord(d) {
  const id = newId();
  const accent = Number.isInteger(d.accent_color) ? `#${d.accent_color.toString(16).padStart(6, '0')}` : '#5865f2';
  const [avatar, banner] = await Promise.all([avatarUrl(d) && importImage(avatarUrl(d)), bannerUrl(d) && importImage(bannerUrl(d))]);
  q.run(
    `INSERT INTO users (id, username, display_name, password, avatar, banner, style, discord_id, created_at) VALUES (?, ?, ?, '!', ?, ?, ?, ?, ?)`,
    id, freeUsername(d.username), String(d.global_name || d.username || 'Discord-User').slice(0, 32), avatar, banner,
    JSON.stringify({ accent1: accent, accent2: '#06b6d4' }), d.id, Date.now(),
  );
  return id;
}

discordAuth.get('/auth/discord/callback', async (req, res) => {
  const back = (hash) => res.redirect(`/#${hash}`);
  const st = states.get(String(req.query.state || ''));
  states.delete(String(req.query.state || ''));
  if (!st || st.exp < Date.now()) return back(`discord-error=${encodeURIComponent('Die Anmeldung ist abgelaufen – bitte nochmal versuchen.')}`);
  if (req.query.error) {
    // prompt=none klappt nur, wenn schon einmal zugestimmt wurde – sonst mit Zustimmungsseite neu starten
    if (req.query.error === 'consent_required' || req.query.error === 'interaction_required') {
      const url = new URL(authorizeUrl(req, st.mode, st.userId));
      url.searchParams.delete('prompt');
      return res.redirect(url.toString());
    }
    return back(`discord-error=${encodeURIComponent('Anmeldung bei Discord abgebrochen.')}`);
  }
  try {
    const { id, secret } = creds();
    const tok = await discordJson(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: id, client_secret: secret, grant_type: 'authorization_code', code: String(req.query.code || ''),
        redirect_uri: `${publicBase(req)}/api/auth/discord/callback`,
      }),
    });
    const d = await discordJson(`${API}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const linked = q.get('SELECT * FROM users WHERE discord_id = ?', d.id);
    if (st.mode === 'link') {
      if (linked && linked.id !== st.userId) return back(`discord-error=${encodeURIComponent('Dieser Discord-Account ist schon mit einem anderen Zync-Account verbunden.')}`);
      const u = q.get('SELECT * FROM users WHERE id = ?', st.userId);
      if (!u) return back('discord-error=Account%20nicht%20gefunden');
      const set = { discord_id: d.id };
      if (!u.avatar && avatarUrl(d)) set.avatar = await importImage(avatarUrl(d));
      if (!u.banner && bannerUrl(d)) set.banner = await importImage(bannerUrl(d));
      q.run(`UPDATE users SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), u.id);
      const fresh = q.get('SELECT * FROM users WHERE id = ?', u.id);
      emitToUser(u.id, 'me:update', selfUser(fresh));
      emitToRelated(u.id, 'user:update', publicUser(fresh));
      return back('discord=linked');
    }
    const userId = linked ? linked.id : await createFromDiscord(d);
    sweep(handoffs);
    const code = randomKey();
    handoffs.set(code, { token: createSession(userId), exp: Date.now() + 2 * 60_000 });
    return back(`discord=${code}`);
  } catch (e) {
    console.error('Discord-Anmeldung fehlgeschlagen:', e.message);
    return back(`discord-error=${encodeURIComponent(`Discord-Anmeldung fehlgeschlagen: ${e.message}`)}`);
  }
});

// Der Browser tauscht den einmaligen Code gegen ein Login-Token (das Token steht so nie in der URL).
discordAuth.post('/auth/discord/finish', (req, res) => {
  const h = handoffs.get(String(req.body?.code || ''));
  handoffs.delete(String(req.body?.code || ''));
  if (!h || h.exp < Date.now()) return res.status(400).json({ error: 'Der Anmelde-Link ist abgelaufen – bitte nochmal versuchen.' });
  res.json({ token: h.token });
});

discordApi.post('/discord/link', wrap((req) => {
  if (!loginReady()) fail(400, 'Discord ist auf diesem Server nicht eingerichtet');
  return { url: authorizeUrl(req, 'link', req.user.id) };
}));

discordApi.delete('/discord/link', wrap((req) => {
  if (req.user.password === '!') fail(400, 'Lege zuerst ein Passwort fest – sonst kannst du dich nicht mehr anmelden.');
  q.run('UPDATE users SET discord_id = NULL WHERE id = ?', req.user.id);
  const fresh = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  emitToUser(req.user.id, 'me:update', selfUser(fresh));
  return { ok: true };
}));

// =====================================================================
// Brücke: Nachrichten zwischen einem Zync-Kanal und einem Discord-Kanal spiegeln
// =====================================================================
const botToken = () => getSetting('discord.botToken');
const botHeaders = () => ({ Authorization: `Bot ${botToken()}`, 'Content-Type': 'application/json' });
let lastBase = process.env.ZYNC_PUBLIC_URL || '';
/** Öffentliche Adresse merken – Discord braucht absolute Links zu Bildern. */
export const notePublicBase = (req) => { if (!process.env.ZYNC_PUBLIC_URL) lastBase = publicBase(req); };
const absolute = (u) => (u && u.startsWith('/') ? `${lastBase}${u}` : u);

const bridges = () => q.all('SELECT * FROM channels WHERE bridge IS NOT NULL').map((c) => ({ ch: c, b: JSON.parse(c.bridge) }));
const bridgeByDiscord = (discordChannelId) => bridges().find((x) => x.b.channelId === discordChannelId);

function requireManager(req) {
  const ch = channelForUser(req.params.id, req.user.id);
  if (!ch || !ch.server_id || ch.type !== 'text') fail(404, 'Textkanal nicht gefunden');
  if (!(memberPerms(ch.server_id, req.user.id).perms & PERMS.MANAGE_CHANNELS)) fail(403, 'Dafür brauchst du das Recht „Kanäle verwalten“');
  return ch;
}

function emitChannel(id) {
  const c = q.get('SELECT * FROM channels WHERE id = ?', id);
  emitToChannel(c, 'channel:update', serializeChannel(c));
}

discordApi.put('/channels/:id/bridge', wrap(async (req) => {
  const ch = requireManager(req);
  if (!botToken()) fail(400, 'Der Owner muss zuerst in der Zync-Verwaltung einen Discord-Bot einrichten.');
  const discordChannelId = text(req.body?.discordChannelId, 30);
  if (!/^\d{15,25}$/.test(discordChannelId)) fail(400, 'Die Discord-Kanal-ID besteht nur aus Ziffern (Rechtsklick auf den Kanal → „Kanal-ID kopieren“).');
  if (bridgeByDiscord(discordChannelId)) fail(409, 'Dieser Discord-Kanal ist schon mit einem Zync-Kanal verbunden.');
  let dc;
  try {
    dc = await discordJson(`${API}/channels/${discordChannelId}`, { headers: botHeaders() });
  } catch {
    fail(400, 'Der Bot findet diesen Discord-Kanal nicht. Ist er in den Discord-Server eingeladen und darf den Kanal sehen?');
  }
  if (dc.type !== 0 && dc.type !== 5) fail(400, 'Das ist kein Textkanal.');
  let hook;
  try {
    hook = await discordJson(`${API}/channels/${discordChannelId}/webhooks`, { method: 'POST', headers: botHeaders(), body: JSON.stringify({ name: 'Zync-Brücke' }) });
  } catch {
    fail(400, 'Der Bot darf in diesem Kanal keine Webhooks erstellen (Recht „Webhooks verwalten“ fehlt).');
  }
  if (ch.bridge) await removeHook(JSON.parse(ch.bridge));
  q.run('UPDATE channels SET bridge = ? WHERE id = ?', JSON.stringify({ channelId: discordChannelId, name: `#${dc.name}`, webhookId: hook.id, webhookToken: hook.token }), ch.id);
  emitChannel(ch.id);
  postMessage(ch, req.user.id, { type: 'bridge', meta: { on: true, name: `#${dc.name}` } });
  return { ok: true, name: `#${dc.name}` };
}));

async function removeHook(b) {
  await fetch(`${API}/webhooks/${b.webhookId}/${b.webhookToken}`, { method: 'DELETE' }).catch(() => {});
}

discordApi.delete('/channels/:id/bridge', wrap(async (req) => {
  const ch = requireManager(req);
  if (ch.bridge) await removeHook(JSON.parse(ch.bridge));
  q.run('UPDATE channels SET bridge = NULL WHERE id = ?', ch.id);
  emitChannel(ch.id);
  postMessage(ch, req.user.id, { type: 'bridge', meta: { on: false } });
  return { ok: true };
}));

// Zync → Discord (per Webhook, mit Name und Bild der Person)
bus.on('message', ({ ch, msg, authorId }) => {
  if (!ch.bridge || authorId === BOTS.discord.id || msg.type !== 'default') return;
  const b = JSON.parse(ch.bridge);
  const u = q.get('SELECT display_name, avatar FROM users WHERE id = ?', authorId);
  const files = (msg.attachments || []).map((a) => absolute(a.url));
  const content = [msg.content, msg.sticker && !msg.sticker.startsWith('builtin:') ? absolute(msg.sticker) : '', ...files].filter(Boolean).join('\n').slice(0, 2000);
  if (!content) return;
  fetch(`${API}/webhooks/${b.webhookId}/${b.webhookToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      username: `${u?.display_name || 'Zync'} · Zync`.slice(0, 80),
      avatar_url: u?.avatar ? absolute(u.avatar) : undefined,
      allowed_mentions: { parse: [] },
    }),
  }).then((r) => { if (!r.ok) console.error('Discord-Brücke: Senden fehlgeschlagen', r.status); }).catch((e) => console.error('Discord-Brücke:', e.message));
});

/** Discord → Zync: eine Discord-Nachricht im verbundenen Zync-Kanal anzeigen. */
export function relayFromDiscord(m) {
  const target = bridgeByDiscord(m.channelId);
  if (!target || (m.webhookId && m.webhookId === target.b.webhookId)) return;
  const parts = [m.content, ...(m.attachments || []), ...(m.stickers || []).map((s) => `[Sticker: ${s}]`)].filter(Boolean);
  if (!parts.length) return;
  postMessage(target.ch, BOTS.discord.id, { content: parts.join('\n').slice(0, 4000), meta: { via: 'discord', name: m.name, avatar: m.avatar } });
}

let client = null;
let clientToken = null;
async function startBridge() {
  const token = botToken();
  if (token === clientToken) return;
  if (client) { Promise.resolve(client.destroy()).catch(() => {}); client = null; }
  clientToken = token;
  if (!token) return;
  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  client.on(Events.MessageCreate, (message) => {
    try {
      relayFromDiscord({
        channelId: message.channelId,
        webhookId: message.webhookId,
        name: message.member?.displayName || message.author.globalName || message.author.username,
        avatar: message.author.displayAvatarURL({ size: 128 }),
        content: message.cleanContent,
        attachments: [...message.attachments.values()].map((a) => a.url),
        stickers: [...message.stickers.values()].map((s) => s.name),
      });
    } catch (e) {
      console.error('Discord-Brücke:', e.message);
    }
  });
  client.on(Events.ClientReady, (c) => console.log(`🔗 Discord-Brücke verbunden als ${c.user.tag}`));
  client.on(Events.Error, (e) => console.error('Discord-Brücke:', e.message));
  try {
    await client.login(token);
  } catch (e) {
    console.error('Discord-Bot konnte sich nicht anmelden:', e.message);
    client = null;
  }
}

export function initDiscord() {
  startBridge();
  bus.on('config', startBridge);
}
