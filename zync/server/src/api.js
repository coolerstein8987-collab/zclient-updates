import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import {
  q, tx, newId, serializeServer, serializeChannel, serializeMember, serializeRole, serializeMessages, UPLOAD_DIR,
} from './db.js';
import { publicUser, selfUser, serializeClaim } from './profile.js';
import { PERMS, ALL_PERMS, memberPerms, topPosition } from './perm.js';
import { owns, COSMETIC_TYPES, progressQuest } from './progress.js';
import { features, streakPayload, onMessageCreated, claimBlocks } from './features.js';
import { hashPassword, verifyPassword, createSession, requireAuth, rateLimit } from './auth.js';
import { channelForUser, getMember, dmMemberIds, relationship, friendIds } from './access.js';
import {
  emitToUser, emitToServer, emitToChannel, emitToRelated, broadcastPresence, presenceOf, voiceStatesFor,
  joinServerRoom, leaveServerRoom, leaveServerVoice, dropVoiceChannel,
} from './realtime.js';
import { forgetUpload } from './backup.js';

export const api = express.Router();
api.use(express.json({ limit: '1mb' }));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// ---------- Validierung ----------
const str = (v, max, { min = 0, name = 'Feld' } = {}) => {
  if (v == null) v = '';
  if (typeof v !== 'string') fail(400, `${name} ist ungültig`);
  v = v.trim();
  if (v.length < min) fail(400, `${name} ist zu kurz`);
  if (v.length > max) fail(400, `${name} ist zu lang (max. ${max})`);
  return v;
};
const uploadUrl = (v) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\/uploads\/[\w.-]+$/.test(v)) fail(400, 'Ungültige Datei');
  return v;
};
const crop = (v) => {
  if (v == null) return null;
  const n = (x, lo, hi) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null);
  const c = { cx: n(v.cx, 0, 1), cy: n(v.cy, 0, 1), zoom: n(v.zoom, 1, 10), w: n(v.w, 1, 1e5), h: n(v.h, 1, 1e5) };
  if (Object.values(c).some((x) => x == null)) return null;
  return JSON.stringify(c);
};
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
const USERNAME_RE = /^[a-z0-9_.]{2,32}$/;
const STATUSES = ['online', 'idle', 'dnd', 'invisible'];

function cleanStyle(s) {
  if (!s || typeof s !== 'object') return '{}';
  const pick = (k, max = 40) => (typeof s[k] === 'string' ? s[k].slice(0, max) : undefined);
  const out = {
    accent1: hex(s.accent1) || undefined,
    accent2: hex(s.accent2) || undefined,
    nameColor: hex(s.nameColor) || undefined,
    nameColor2: hex(s.nameColor2) || undefined,
    decoration: pick('decoration'),
    effect: pick('effect'),
    nameFont: pick('nameFont'),
    nameEffect: pick('nameEffect'),
    nameplate: pick('nameplate'),
    frame: pick('frame'),
    vibe: pick('vibe', 80),
    vibeEmoji: pick('vibeEmoji', 16),
  };
  return JSON.stringify(out);
}

const imgRef = (v) => (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v) ? v : null);
const emojiOrImg = (v) => (typeof v === 'string' ? (imgRef(v) || (v.length <= 16 && !/[<>]/.test(v) ? v : null)) : null);
const linkRef = (v) => (typeof v === 'string' && /^https?:\/\/[^\s<>"]{3,300}$/.test(v) ? v : null);
const t = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanWidgets(list, userId) {
  if (!Array.isArray(list)) return '[]';
  const out = [];
  for (const w of list.slice(0, 8)) {
    if (!w || typeof w !== 'object') continue;
    const base = { id: t(w.id, 24) || newId(), type: w.type, title: t(w.title, 60), theme: ['default', 'glass', 'outline', 'solid'].includes(w.theme) ? w.theme : 'default' };
    if (w.type === 'card') {
      out.push({ ...base, text: t(w.text, 300), icon: emojiOrImg(w.icon), image: imgRef(w.image), link: linkRef(w.link) });
    } else if (w.type === 'links') {
      const items = (Array.isArray(w.items) ? w.items : []).slice(0, 8).map((it) => ({ icon: emojiOrImg(it?.icon), label: t(it?.label, 30), value: t(it?.value, 60), url: linkRef(it?.url) })).filter((it) => it.label || it.value);
      out.push({ ...base, items });
    } else if (w.type === 'people') {
      const items = (Array.isArray(w.items) ? w.items : []).slice(0, 8)
        .filter((it) => typeof it?.userId === 'string' && relationship(userId, it.userId) === 1)
        .map((it) => ({ userId: it.userId, label: t(it.label, 40) }));
      out.push({ ...base, items });
    } else if (w.type === 'gallery') {
      out.push({ ...base, images: (Array.isArray(w.images) ? w.images : []).map(imgRef).filter(Boolean).slice(0, 6) });
    } else if (w.type === 'stats' || w.type === 'games') {
      out.push(base);
    }
  }
  return JSON.stringify(out);
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return '[]';
  const seen = new Set();
  const out = [];
  for (const t of tags.slice(0, 15)) {
    if (typeof t !== 'string') continue;
    const v = t.trim().slice(0, 24);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return JSON.stringify(out);
}

const getUser = (id) => q.get('SELECT * FROM users WHERE id = ?', id);
const inviteCode = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);

const wrap = (fn) => async (req, res, next) => {
  try {
    const r = await fn(req, res);
    if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) {
    next(e);
  }
};

// ---------- Auth ----------
const authLimit = rateLimit({ windowMs: 10 * 60_000, max: 30 });

api.post('/auth/register', authLimit, wrap((req) => {
  const username = str(req.body.username, 32, { min: 2, name: 'Benutzername' }).toLowerCase();
  if (!USERNAME_RE.test(username)) fail(400, 'Benutzername: nur a–z, 0–9, _ und . (2–32 Zeichen)');
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 6) fail(400, 'Passwort muss mindestens 6 Zeichen haben');
  if (password.length > 200) fail(400, 'Passwort ist zu lang');
  const displayName = str(req.body.displayName || username, 32, { min: 1, name: 'Anzeigename' });
  if (q.get('SELECT 1 FROM users WHERE username = ?', username)) fail(409, 'Benutzername ist schon vergeben');
  const id = newId();
  const palette = [['#7c5cff', '#00d4ff'], ['#ff5ca8', '#ffb35c'], ['#2ee6a6', '#2e9bff'], ['#ff6b6b', '#a855f7'], ['#f7d046', '#ff7a45']];
  const [accent1, accent2] = palette[Math.floor(Math.random() * palette.length)];
  q.run(
    `INSERT INTO users (id, username, display_name, password, style, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id, username, displayName, hashPassword(password), JSON.stringify({ accent1, accent2 }), Date.now(),
  );
  return { token: createSession(id) };
}));

api.post('/auth/login', authLimit, wrap((req) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const user = q.get('SELECT * FROM users WHERE username = ?', username);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password)) fail(401, 'Benutzername oder Passwort falsch');
  return { token: createSession(user.id) };
}));

api.use(requireAuth);

api.post('/auth/logout', wrap((req) => {
  q.run('DELETE FROM sessions WHERE token = ?', req.token);
  return { ok: true };
}));

// ---------- Bootstrap ----------
api.get('/bootstrap', wrap((req) => {
  const me = req.user;
  const userIds = new Set([me.id]);

  const relationships = q.all('SELECT target_id, type, created_at FROM relationships WHERE user_id = ?', me.id)
    .map((r) => { userIds.add(r.target_id); return { id: r.target_id, type: r.type, since: r.created_at }; });

  const servers = q.all('SELECT s.* FROM servers s JOIN members m ON m.server_id = s.id WHERE m.user_id = ? ORDER BY m.joined_at', me.id)
    .map((s) => {
      const payload = serverPayload(s.id);
      payload.members.forEach((m) => userIds.add(m.userId));
      return payload;
    });

  const dms = q.all(`SELECT c.* FROM channels c JOIN dm_members d ON d.channel_id = c.id WHERE d.user_id = ?`, me.id)
    .map((c) => {
      const recipients = dmMemberIds(c.id).filter((id) => id !== me.id);
      recipients.forEach((id) => userIds.add(id));
      return { ...serializeChannel(c), recipients, streak: streakPayload(c.id) };
    });

  const channelIds = [...servers.flatMap((s) => s.channels.filter((c) => c.type === 'text').map((c) => c.id)), ...dms.map((d) => d.id)];
  const lastMessages = {};
  const mentions = {};
  const readStates = Object.fromEntries(q.all('SELECT channel_id, last_read FROM read_states WHERE user_id = ?', me.id).map((r) => [r.channel_id, r.last_read]));
  for (const cid of channelIds) {
    const last = q.get('SELECT id FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT 1', cid);
    if (last) lastMessages[cid] = last.id;
    const since = readStates[cid] || '';
    const isDm = dms.some((d) => d.id === cid);
    const count = isDm
      ? q.get('SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND id > ? AND author_id != ?', cid, since, me.id).n
      : q.get(`SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND id > ? AND author_id != ? AND (content LIKE ? OR content LIKE '%@everyone%')`, cid, since, me.id, `%@${me.username}%`).n;
    if (count) mentions[cid] = count;
  }

  const users = {};
  const presences = {};
  const ids = [...userIds];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const u of q.all(`SELECT * FROM users WHERE id IN (${chunk.map(() => '?').join(',')})`, ...chunk)) {
      users[u.id] = publicUser(u);
      presences[u.id] = presenceOf(u.id);
    }
  }
  presences[me.id] = me.status === 'invisible' ? 'invisible' : me.status;
  const claims = q.all('SELECT * FROM claims WHERE from_id = ? OR to_id = ?', me.id, me.id).map(serializeClaim);
  for (const c of claims) {
    for (const id of [c.fromId, c.toId]) if (!users[id]) users[id] = publicUser(getUser(id));
  }
  progressQuest(me.id, 'login');

  return {
    user: selfUser(me),
    users,
    presences,
    relationships,
    servers,
    dms,
    readStates,
    lastMessages,
    mentions,
    voice: voiceStatesFor(me.id),
    stickers: q.all('SELECT id, name, url FROM stickers WHERE owner_id = ? ORDER BY created_at', me.id),
    sounds: q.all('SELECT id, name, emoji, url FROM sounds WHERE owner_id = ? ORDER BY created_at', me.id),
    claims,
    rtc: rtcConfig(),
  };
}));

function rtcConfig() {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.ZYNC_TURN_URL) {
    iceServers.push({
      urls: process.env.ZYNC_TURN_URL.split(','),
      username: process.env.ZYNC_TURN_USER,
      credential: process.env.ZYNC_TURN_PASS,
    });
  }
  return { iceServers };
}

// ---------- Ich / Profil ----------
api.patch('/me', wrap((req) => {
  const b = req.body || {};
  const u = req.user;
  const set = {};
  if ('displayName' in b) set.display_name = str(b.displayName, 32, { min: 1, name: 'Anzeigename' });
  if ('bio' in b) set.bio = str(b.bio, 600, { name: 'Bio' });
  if ('pronouns' in b) set.pronouns = str(b.pronouns, 40, { name: 'Pronomen' });
  if ('customStatus' in b) set.custom_status = str(b.customStatus, 128, { name: 'Status' });
  if ('tags' in b) set.tags = cleanTags(b.tags);
  if ('style' in b) {
    set.style = cleanStyle(b.style);
    const st = JSON.parse(set.style);
    for (const type of COSMETIC_TYPES) {
      if (st[type] && !owns(u, type, st[type])) fail(403, 'Dieses Cosmetic hast du noch nicht freigeschaltet – hol es dir im Shop!');
    }
  }
  if ('widgets' in b) set.widgets = cleanWidgets(b.widgets, u.id);
  if ('tagServer' in b) {
    if (b.tagServer) {
      const srv = q.get('SELECT s.tag FROM servers s JOIN members m ON m.server_id = s.id WHERE s.id = ? AND m.user_id = ?', String(b.tagServer), u.id);
      if (!srv?.tag) fail(400, 'Dieser Server hat keinen Tag');
      set.tag_server = String(b.tagServer);
    } else set.tag_server = null;
  }
  if ('avatar' in b) { set.avatar = uploadUrl(b.avatar); set.avatar_crop = crop(b.avatarCrop); }
  if ('banner' in b) { set.banner = uploadUrl(b.banner); set.banner_crop = crop(b.bannerCrop); }
  if ('status' in b) {
    if (!STATUSES.includes(b.status)) fail(400, 'Ungültiger Status');
    set.status = b.status;
  }
  if ('privacy' in b && b.privacy && typeof b.privacy === 'object') {
    set.privacy = JSON.stringify({
      friendRequests: ['everyone', 'mutual', 'none'].includes(b.privacy.friendRequests) ? b.privacy.friendRequests : 'everyone',
      serverDms: b.privacy.serverDms !== false,
    });
  }
  if ('username' in b) {
    const username = str(b.username, 32, { min: 2, name: 'Benutzername' }).toLowerCase();
    if (!USERNAME_RE.test(username)) fail(400, 'Benutzername: nur a–z, 0–9, _ und . (2–32 Zeichen)');
    const other = q.get('SELECT id FROM users WHERE username = ?', username);
    if (other && other.id !== u.id) fail(409, 'Benutzername ist schon vergeben');
    if (!verifyPassword(String(b.password || ''), u.password)) fail(403, 'Passwort falsch');
    set.username = username;
  }
  const keys = Object.keys(set);
  if (keys.length) q.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), u.id);
  const fresh = getUser(u.id);
  emitToRelated(u.id, 'user:update', publicUser(fresh));
  emitToUser(u.id, 'me:update', selfUser(fresh));
  if ('status' in set) broadcastPresence(u.id);
  return selfUser(fresh);
}));

api.post('/me/password', wrap((req) => {
  if (!verifyPassword(String(req.body.current || ''), req.user.password)) fail(403, 'Aktuelles Passwort falsch');
  const next = String(req.body.next || '');
  if (next.length < 6) fail(400, 'Neues Passwort muss mindestens 6 Zeichen haben');
  q.run('UPDATE users SET password = ? WHERE id = ?', hashPassword(next), req.user.id);
  q.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, req.token);
  return { ok: true };
}));

api.get('/users/:id', wrap((req) => {
  const u = getUser(req.params.id);
  if (!u) fail(404, 'Nutzer nicht gefunden');
  const mutualServers = q.all(
    'SELECT a.server_id FROM members a JOIN members b ON a.server_id = b.server_id WHERE a.user_id = ? AND b.user_id = ?',
    req.user.id, u.id,
  ).map((r) => r.server_id);
  const mine = new Set(friendIds(req.user.id));
  const mutualFriends = friendIds(u.id).filter((id) => mine.has(id));
  return { user: publicUser(u), mutualServers, mutualFriends, relationship: relationship(req.user.id, u.id), status: presenceOf(u.id) };
}));

// ---------- Uploads ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      cb(null, `${newId()}${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

api.post('/upload', rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.user.id }), upload.single('file'), wrap((req) => {
  if (!req.file) fail(400, 'Keine Datei');
  return {
    url: `/uploads/${req.file.filename}`,
    name: Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200),
    size: req.file.size,
    type: req.file.mimetype,
  };
}));

// ---------- Eigene Sticker ----------
api.post('/stickers', wrap((req) => {
  const url = uploadUrl(req.body.url);
  if (!url) fail(400, 'Bild fehlt');
  const count = q.get('SELECT COUNT(*) AS n FROM stickers WHERE owner_id = ?', req.user.id).n;
  if (count >= 100) fail(400, 'Maximal 100 eigene Sticker');
  const s = { id: newId(), name: str(req.body.name || 'Sticker', 30), url };
  q.run('INSERT INTO stickers (id, owner_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)', s.id, req.user.id, s.name, s.url, Date.now());
  emitToUser(req.user.id, 'sticker:create', s);
  return s;
}));

api.delete('/stickers/:id', wrap((req) => {
  q.run('DELETE FROM stickers WHERE id = ? AND owner_id = ?', req.params.id, req.user.id);
  emitToUser(req.user.id, 'sticker:delete', { id: req.params.id });
  return { ok: true };
}));

// ---------- Freunde ----------
function setRel(a, b, type) {
  if (type == null) q.run('DELETE FROM relationships WHERE user_id = ? AND target_id = ?', a, b);
  else q.run('INSERT INTO relationships (user_id, target_id, type, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, target_id) DO UPDATE SET type = excluded.type, created_at = excluded.created_at', a, b, type, Date.now());
}
function notifyRel(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const type = relationship(x, y);
    if (type) emitToUser(x, 'relationship:update', { id: y, type, since: Date.now(), user: publicUser(getUser(y)), status: presenceOf(y) });
    else emitToUser(x, 'relationship:remove', { id: y });
  }
}

api.post('/relationships', rateLimit({ windowMs: 60_000, max: 30, key: (req) => req.user.id }), wrap((req) => {
  const raw = String(req.body.username || '').trim().toLowerCase().replace(/^@/, '');
  const target = req.body.userId ? getUser(String(req.body.userId)) : q.get('SELECT * FROM users WHERE username = ?', raw);
  if (!target) fail(404, 'Diesen Nutzer gibt es nicht – prüfe den Benutzernamen.');
  const me = req.user.id;
  if (target.id === me) fail(400, 'Du kannst dich nicht selbst hinzufügen 😄');
  const mine = relationship(me, target.id);
  const theirs = relationship(target.id, me);
  if (mine === 1) fail(400, 'Ihr seid schon befreundet');
  if (theirs === 2) fail(403, 'Anfrage konnte nicht gesendet werden');
  if (mine === 3) {
    tx(() => { setRel(me, target.id, 1); setRel(target.id, me, 1); });
  } else {
    const privacy = JSON.parse(target.privacy || '{}');
    if (privacy.friendRequests === 'none') fail(403, 'Dieser Nutzer nimmt keine Anfragen an');
    if (privacy.friendRequests === 'mutual') {
      const mutual = q.get('SELECT 1 FROM members a JOIN members b ON a.server_id = b.server_id WHERE a.user_id = ? AND b.user_id = ?', me, target.id)
        || friendIds(target.id).some((id) => relationship(me, id) === 1);
      if (!mutual) fail(403, 'Dieser Nutzer nimmt nur Anfragen von gemeinsamen Kontakten an');
    }
    tx(() => { setRel(me, target.id, 4); setRel(target.id, me, 3); });
  }
  notifyRel(me, target.id);
  return { ok: true };
}));

api.put('/relationships/:id', wrap((req) => {
  const me = req.user.id;
  const other = req.params.id;
  if (relationship(me, other) !== 3) fail(400, 'Keine offene Anfrage');
  tx(() => { setRel(me, other, 1); setRel(other, me, 1); });
  notifyRel(me, other);
  broadcastPresence(me);
  broadcastPresence(other);
  return { ok: true };
}));

api.delete('/relationships/:id', wrap((req) => {
  const me = req.user.id;
  const other = req.params.id;
  const mine = relationship(me, other);
  tx(() => {
    setRel(me, other, null);
    if (mine !== 2 && relationship(other, me) !== 2) setRel(other, me, null);
  });
  notifyRel(me, other);
  return { ok: true };
}));

api.post('/relationships/:id/block', wrap((req) => {
  const me = req.user.id;
  const other = req.params.id;
  if (!getUser(other) || other === me) fail(404, 'Nutzer nicht gefunden');
  tx(() => {
    setRel(me, other, 2);
    if (relationship(other, me) !== 2) setRel(other, me, null);
  });
  notifyRel(me, other);
  return { ok: true };
}));

// ---------- Direktnachrichten ----------
api.post('/dms', wrap((req) => {
  const me = req.user.id;
  const other = getUser(String(req.body.userId || ''));
  if (!other || other.id === me) fail(404, 'Nutzer nicht gefunden');
  const existing = q.get(
    `SELECT c.id FROM channels c JOIN dm_members a ON a.channel_id = c.id JOIN dm_members b ON b.channel_id = c.id
     WHERE c.type = 'dm' AND a.user_id = ? AND b.user_id = ?`, me, other.id,
  );
  if (existing) return { ...serializeChannel(q.get('SELECT * FROM channels WHERE id = ?', existing.id)), recipients: [other.id] };
  if (relationship(other.id, me) === 2) fail(403, 'Du kannst diesem Nutzer nicht schreiben');
  const id = newId();
  tx(() => {
    q.run(`INSERT INTO channels (id, type, created_at) VALUES (?, 'dm', ?)`, id, Date.now());
    q.run('INSERT INTO dm_members (channel_id, user_id) VALUES (?, ?), (?, ?)', id, me, id, other.id);
  });
  const ch = serializeChannel(q.get('SELECT * FROM channels WHERE id = ?', id));
  emitToUser(me, 'dm:create', { ...ch, recipients: [other.id], user: publicUser(other), status: presenceOf(other.id) });
  emitToUser(other.id, 'dm:create', { ...ch, recipients: [me], user: publicUser(req.user), status: presenceOf(me) });
  return { ...ch, recipients: [other.id] };
}));

// ---------- Server ----------
const TEMPLATES = {
  friends: { text: [['', 'allgemein'], ['', 'memes'], ['', 'clips-und-fotos']], voice: [['', 'Chillen'], ['', 'Gaming']] },
  gaming: { text: [['Info', 'regeln'], ['Info', 'ankündigungen'], ['Chat', 'allgemein'], ['Chat', 'lfg-mitspieler'], ['Chat', 'clips']], voice: [['Voice', 'Lobby'], ['Voice', 'Squad 1'], ['Voice', 'Squad 2'], ['Voice', 'Stream 🎥']] },
  community: { text: [['Willkommen', 'willkommen'], ['Willkommen', 'regeln'], ['Community', 'allgemein'], ['Community', 'vorstellen'], ['Community', 'kunst-und-edits'], ['Community', 'off-topic']], voice: [['Voice', 'Lounge'], ['Voice', 'Bühne']] },
  study: { text: [['', 'allgemein'], ['', 'hausaufgaben'], ['', 'ressourcen'], ['', 'termine']], voice: [['', 'Lernraum'], ['', 'Pause']] },
  anime: { text: [['Info', 'regeln'], ['Talk', 'allgemein'], ['Talk', 'hxh-talk'], ['Talk', 'seasonal'], ['Talk', 'fanart'], ['Talk', 'manga-spoiler']], voice: [['Watch Party', 'Watch Party 🍿'], ['Watch Party', 'Talk']] },
  blank: { text: [['', 'allgemein']], voice: [['', 'Allgemein']] },
};

function serverPayload(serverId) {
  const s = q.get('SELECT * FROM servers WHERE id = ?', serverId);
  const memberRoles = {};
  for (const r of q.all('SELECT user_id, role_id FROM member_roles WHERE server_id = ?', serverId)) (memberRoles[r.user_id] ||= []).push(r.role_id);
  return {
    ...serializeServer(s),
    channels: q.all('SELECT * FROM channels WHERE server_id = ? ORDER BY position, created_at', serverId).map(serializeChannel),
    members: q.all('SELECT * FROM members WHERE server_id = ?', serverId).map((m) => serializeMember(m, memberRoles[m.user_id] || [])),
    roles: q.all('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC, created_at', serverId).map(serializeRole),
  };
}

const PERM_LABEL = {
  [PERMS.MANAGE_SERVER]: 'Server verwalten',
  [PERMS.MANAGE_CHANNELS]: 'Kanäle verwalten',
  [PERMS.MANAGE_ROLES]: 'Rollen verwalten',
  [PERMS.KICK]: 'Mitglieder entfernen',
  [PERMS.MANAGE_MESSAGES]: 'Nachrichten verwalten',
  [PERMS.MANAGE_NICKNAMES]: 'Spitznamen verwalten',
};

/** owner: nur Besitzer · perm: benötigtes Recht (Besitzer/Admins haben alle). */
function requireServerRole(serverId, userId, { owner = false, perm = 0 } = {}) {
  const { member: m, perms } = memberPerms(serverId, userId);
  if (!m) fail(404, 'Server nicht gefunden');
  if (owner && m.role !== 'owner') fail(403, 'Nur der Besitzer darf das');
  if (perm && (perms & perm) !== perm) fail(403, `Dafür brauchst du das Recht „${PERM_LABEL[perm] || 'Admin'}“`);
  return m;
}

function postSystemMessage(serverId, authorId, type) {
  const ch = q.get(`SELECT * FROM channels WHERE server_id = ? AND type = 'text' ORDER BY position, created_at LIMIT 1`, serverId);
  if (!ch) return;
  const id = newId();
  q.run('INSERT INTO messages (id, channel_id, author_id, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, ch.id, authorId, '', type, Date.now());
  emitToChannel(ch, 'message:create', serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', id)])[0]);
}

api.post('/servers', rateLimit({ windowMs: 60 * 60_000, max: 20, key: (req) => req.user.id }), wrap((req) => {
  const name = str(req.body.name, 60, { min: 1, name: 'Servername' });
  const tpl = TEMPLATES[req.body.template] || TEMPLATES.friends;
  const id = newId();
  const now = Date.now();
  tx(() => {
    q.run(
      'INSERT INTO servers (id, name, icon, icon_crop, description, owner_id, invite, accent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, name, uploadUrl(req.body.icon), crop(req.body.iconCrop), str(req.body.description, 300), req.user.id, inviteCode(), hex(req.body.accent), now,
    );
    q.run(`INSERT INTO members (server_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`, id, req.user.id, now);
    let pos = 0;
    for (const [category, cname] of tpl.text) q.run(`INSERT INTO channels (id, server_id, type, name, category, position, created_at) VALUES (?, ?, 'text', ?, ?, ?, ?)`, newId(), id, cname, category, pos++, now);
    for (const [category, cname] of tpl.voice) q.run(`INSERT INTO channels (id, server_id, type, name, category, position, created_at) VALUES (?, ?, 'voice', ?, ?, ?, ?)`, newId(), id, cname, category, pos++, now);
  });
  joinServerRoom(req.user.id, id);
  const payload = serverPayload(id);
  emitToUser(req.user.id, 'server:create', { server: payload, users: {}, presences: {} });
  return payload;
}));

api.patch('/servers/:id', wrap((req) => {
  const sid = req.params.id;
  requireServerRole(sid, req.user.id, { perm: PERMS.MANAGE_SERVER });
  const b = req.body || {};
  const set = {};
  if ('name' in b) set.name = str(b.name, 60, { min: 1, name: 'Servername' });
  if ('description' in b) set.description = str(b.description, 300);
  if ('icon' in b) { set.icon = uploadUrl(b.icon); set.icon_crop = crop(b.iconCrop); }
  if ('banner' in b) { set.banner = uploadUrl(b.banner); set.banner_crop = crop(b.bannerCrop); }
  if ('accent' in b) set.accent = hex(b.accent);
  if ('isPublic' in b) set.is_public = b.isPublic ? 1 : 0;
  if ('tag' in b) {
    if (b.tag) {
      const tag = String(b.tag.text || '').trim().toUpperCase();
      if (!/^[\p{L}\p{N}]{2,4}$/u.test(tag)) fail(400, 'Server-Tag: 2–4 Buchstaben oder Zahlen');
      set.tag = tag;
      set.tag_emoji = typeof b.tag.emoji === 'string' ? b.tag.emoji.slice(0, 16) : '';
      set.tag_color = hex(b.tag.color) || '#7c5cff';
    } else {
      set.tag = null;
      q.run('UPDATE users SET tag_server = NULL WHERE tag_server = ?', sid);
    }
  }
  const wearers = q.all('SELECT id FROM users WHERE tag_server = ?', sid).map((r) => r.id);
  const keys = Object.keys(set);
  if (keys.length) q.run(`UPDATE servers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), sid);
  const s = serializeServer(q.get('SELECT * FROM servers WHERE id = ?', sid));
  emitToServer(sid, 'server:update', s);
  if ('name' in set || 'icon' in set || 'tag' in set) {
    for (const uid of new Set([...wearers, ...q.all('SELECT id FROM users WHERE tag_server = ?', sid).map((r) => r.id)])) {
      const fresh = getUser(uid);
      emitToRelated(uid, 'user:update', publicUser(fresh));
      emitToUser(uid, 'me:update', selfUser(fresh));
    }
  }
  return s;
}));

api.post('/servers/:id/invite', wrap((req) => {
  requireServerRole(req.params.id, req.user.id, { perm: PERMS.MANAGE_SERVER });
  q.run('UPDATE servers SET invite = ? WHERE id = ?', inviteCode(), req.params.id);
  const s = serializeServer(q.get('SELECT * FROM servers WHERE id = ?', req.params.id));
  emitToServer(req.params.id, 'server:update', s);
  return s;
}));

api.delete('/servers/:id', wrap((req) => {
  const sid = req.params.id;
  requireServerRole(sid, req.user.id, { owner: true });
  for (const c of q.all(`SELECT id FROM channels WHERE server_id = ? AND type = 'voice'`, sid)) dropVoiceChannel(c.id);
  const memberIds = q.all('SELECT user_id FROM members WHERE server_id = ?', sid).map((r) => r.user_id);
  emitToServer(sid, 'server:delete', { id: sid });
  q.run('DELETE FROM servers WHERE id = ?', sid);
  memberIds.forEach((uid) => leaveServerRoom(uid, sid));
  return { ok: true };
}));

function removeMember(sid, uid) {
  leaveServerVoice(uid, sid);
  q.run('DELETE FROM members WHERE server_id = ? AND user_id = ?', sid, uid);
  q.run('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?', sid, uid);
  if (q.get('SELECT 1 FROM users WHERE id = ? AND tag_server = ?', uid, sid)) {
    q.run('UPDATE users SET tag_server = NULL WHERE id = ?', uid);
    const fresh = getUser(uid);
    emitToRelated(uid, 'user:update', publicUser(fresh));
    emitToUser(uid, 'me:update', selfUser(fresh));
  }
  leaveServerRoom(uid, sid);
  emitToUser(uid, 'server:delete', { id: sid });
  emitToServer(sid, 'member:remove', { serverId: sid, userId: uid });
}

api.post('/servers/:id/leave', wrap((req) => {
  const m = requireServerRole(req.params.id, req.user.id);
  if (m.role === 'owner') fail(400, 'Als Besitzer kannst du den Server nur löschen (oder übertrage ihn zuerst).');
  removeMember(req.params.id, req.user.id);
  return { ok: true };
}));

api.patch('/servers/:id/members/:userId', wrap((req) => {
  const sid = req.params.id;
  const me = requireServerRole(sid, req.user.id);
  const target = getMember(sid, req.params.userId);
  if (!target) fail(404, 'Mitglied nicht gefunden');
  const b = req.body || {};
  if ('nickname' in b) {
    if (target.user_id !== req.user.id) requireServerRole(sid, req.user.id, { perm: PERMS.MANAGE_NICKNAMES });
    q.run('UPDATE members SET nickname = ? WHERE server_id = ? AND user_id = ?', str(b.nickname, 32) || null, sid, target.user_id);
  }
  if ('role' in b) {
    if (me.role !== 'owner') fail(403, 'Nur der Besitzer kann Rollen vergeben');
    if (b.role === 'owner') {
      if (target.user_id === req.user.id) fail(400, 'Du bist schon Besitzer');
      tx(() => {
        q.run(`UPDATE members SET role = 'admin' WHERE server_id = ? AND user_id = ?`, sid, req.user.id);
        q.run(`UPDATE members SET role = 'owner' WHERE server_id = ? AND user_id = ?`, sid, target.user_id);
        q.run('UPDATE servers SET owner_id = ? WHERE id = ?', target.user_id, sid);
      });
      emitToServer(sid, 'member:update', serializeMember(getMember(sid, req.user.id)));
      emitToServer(sid, 'server:update', serializeServer(q.get('SELECT * FROM servers WHERE id = ?', sid)));
    } else {
      if (!['admin', 'member'].includes(b.role) || target.role === 'owner') fail(400, 'Ungültige Rolle');
      q.run('UPDATE members SET role = ? WHERE server_id = ? AND user_id = ?', b.role, sid, target.user_id);
    }
  }
  const m = serializeMember(getMember(sid, target.user_id));
  emitToServer(sid, 'member:update', m);
  return m;
}));

api.delete('/servers/:id/members/:userId', wrap((req) => {
  const sid = req.params.id;
  const me = requireServerRole(sid, req.user.id, { perm: PERMS.KICK });
  const target = getMember(sid, req.params.userId);
  if (!target) fail(404, 'Mitglied nicht gefunden');
  if (target.role === 'owner' || (target.role === 'admin' && me.role !== 'owner')) fail(403, 'Dieses Mitglied kannst du nicht entfernen');
  if (me.role === 'member' && topPosition(sid, target.user_id) >= topPosition(sid, req.user.id)) fail(403, 'Du kannst nur Mitglieder mit niedrigerer Rolle entfernen');
  removeMember(sid, target.user_id);
  return { ok: true };
}));

// ---------- Rollen ----------
function cleanRole(b, isOwner) {
  const out = {};
  if ('name' in b) out.name = str(b.name, 32, { min: 1, name: 'Rollenname' });
  if ('color' in b) out.color = hex(b.color);
  if ('icon' in b) out.icon = typeof b.icon === 'string' ? b.icon.slice(0, 16) : null;
  if ('hoist' in b) out.hoist = b.hoist ? 1 : 0;
  if ('permissions' in b) {
    let p = Number(b.permissions) & ALL_PERMS;
    if (!isOwner) p &= ~PERMS.ADMIN;
    out.permissions = p;
  }
  return out;
}

function emitMember(sid, uid) {
  const m = getMember(sid, uid);
  if (m) emitToServer(sid, 'member:update', serializeMember(m));
}

api.post('/servers/:id/roles', wrap((req) => {
  const sid = req.params.id;
  const me = requireServerRole(sid, req.user.id, { perm: PERMS.MANAGE_ROLES });
  if (q.get('SELECT COUNT(*) AS n FROM roles WHERE server_id = ?', sid).n >= 50) fail(400, 'Maximal 50 Rollen');
  const r = { name: 'Neue Rolle', color: '#99aab5', icon: '', hoist: 0, permissions: 0, ...cleanRole(req.body || {}, me.role === 'owner') };
  const pos = (q.get('SELECT MAX(position) AS p FROM roles WHERE server_id = ?', sid).p ?? -1) + 1;
  const id = newId();
  q.run('INSERT INTO roles (id, server_id, name, color, icon, position, permissions, hoist, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, sid, r.name, r.color, r.icon, pos, r.permissions, r.hoist, Date.now());
  const role = serializeRole(q.get('SELECT * FROM roles WHERE id = ?', id));
  emitToServer(sid, 'role:update', role);
  return role;
}));

function roleForManager(req) {
  const role = q.get('SELECT * FROM roles WHERE id = ?', req.params.roleId);
  if (!role) fail(404, 'Rolle nicht gefunden');
  const me = requireServerRole(role.server_id, req.user.id, { perm: PERMS.MANAGE_ROLES });
  if (me.role === 'member' && role.position >= topPosition(role.server_id, req.user.id)) fail(403, 'Du kannst nur Rollen unter deiner höchsten Rolle bearbeiten');
  return { role, me };
}

api.patch('/roles/:roleId', wrap((req) => {
  const { role, me } = roleForManager(req);
  const set = cleanRole(req.body || {}, me.role === 'owner');
  const keys = Object.keys(set);
  if (keys.length) q.run(`UPDATE roles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), role.id);
  const out = serializeRole(q.get('SELECT * FROM roles WHERE id = ?', role.id));
  emitToServer(role.server_id, 'role:update', out);
  return out;
}));

api.delete('/roles/:roleId', wrap((req) => {
  const { role } = roleForManager(req);
  const holders = q.all('SELECT user_id FROM member_roles WHERE role_id = ?', role.id).map((r) => r.user_id);
  q.run('DELETE FROM roles WHERE id = ?', role.id);
  emitToServer(role.server_id, 'role:delete', { id: role.id, serverId: role.server_id });
  holders.forEach((uid) => emitMember(role.server_id, uid));
  return { ok: true };
}));

api.post('/servers/:id/roles/reorder', wrap((req) => {
  const sid = req.params.id;
  requireServerRole(sid, req.user.id, { perm: PERMS.MANAGE_ROLES });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  tx(() => ids.forEach((rid, i) => q.run('UPDATE roles SET position = ? WHERE id = ? AND server_id = ?', ids.length - i, rid, sid)));
  const roles = q.all('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC', sid).map(serializeRole);
  roles.forEach((r) => emitToServer(sid, 'role:update', r));
  return roles;
}));

api.put('/roles/:roleId/members/:userId', wrap((req) => {
  const { role } = roleForManager(req);
  if (!getMember(role.server_id, req.params.userId)) fail(404, 'Mitglied nicht gefunden');
  q.run('INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)', role.server_id, req.params.userId, role.id);
  emitMember(role.server_id, req.params.userId);
  return { ok: true };
}));

api.delete('/roles/:roleId/members/:userId', wrap((req) => {
  const { role } = roleForManager(req);
  q.run('DELETE FROM member_roles WHERE role_id = ? AND user_id = ?', role.id, req.params.userId);
  emitMember(role.server_id, req.params.userId);
  return { ok: true };
}));

// ---------- Einladungen & Entdecken ----------
api.get('/invites/:code', wrap((req) => {
  const s = q.get('SELECT * FROM servers WHERE invite = ?', req.params.code);
  if (!s) fail(404, 'Einladung ungültig oder abgelaufen');
  const members = q.get('SELECT COUNT(*) AS n FROM members WHERE server_id = ?', s.id).n;
  return { server: serializeServer(s), members, joined: !!getMember(s.id, req.user.id) };
}));

function joinServer(s, user) {
  if (!getMember(s.id, user.id)) {
    q.run(`INSERT INTO members (server_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`, s.id, user.id, Date.now());
    joinServerRoom(user.id, s.id);
    const payload = serverPayload(s.id);
    const users = {};
    const presences = {};
    for (const m of payload.members) {
      users[m.userId] = publicUser(getUser(m.userId));
      presences[m.userId] = presenceOf(m.userId);
    }
    emitToServer(s.id, 'member:add', { member: serializeMember(getMember(s.id, user.id)), user: publicUser(user), status: presenceOf(user.id) });
    emitToUser(user.id, 'server:create', { server: payload, users, presences, voice: voiceStatesFor(user.id) });
    postSystemMessage(s.id, user.id, 'join');
  }
  return serverPayload(s.id);
}

api.post('/invites/:code', wrap((req) => {
  const s = q.get('SELECT * FROM servers WHERE invite = ?', req.params.code);
  if (!s) fail(404, 'Einladung ungültig oder abgelaufen');
  return joinServer(s, req.user);
}));

api.get('/discover', wrap((req) => {
  const term = `%${String(req.query.q || '').trim()}%`;
  return q.all(
    `SELECT s.*, (SELECT COUNT(*) FROM members m WHERE m.server_id = s.id) AS member_count
     FROM servers s WHERE s.is_public = 1 AND (s.name LIKE ? OR s.description LIKE ?) ORDER BY member_count DESC LIMIT 60`,
    term, term,
  ).map((s) => ({ ...serializeServer(s), invite: undefined, memberCount: s.member_count, joined: !!getMember(s.id, req.user.id) }));
}));

api.post('/discover/:id/join', wrap((req) => {
  const s = q.get('SELECT * FROM servers WHERE id = ? AND is_public = 1', req.params.id);
  if (!s) fail(404, 'Server nicht gefunden');
  return joinServer(s, req.user);
}));

// ---------- Kanäle ----------
const channelName = (type, v) => {
  const n = str(v, 60, { min: 1, name: 'Kanalname' });
  return type === 'text' ? n.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}\p{Emoji_Presentation}_-]/gu, '') || 'kanal' : n;
};

api.post('/servers/:id/channels', wrap((req) => {
  const sid = req.params.id;
  requireServerRole(sid, req.user.id, { perm: PERMS.MANAGE_CHANNELS });
  const type = req.body.type === 'voice' ? 'voice' : 'text';
  const max = q.get('SELECT MAX(position) AS p FROM channels WHERE server_id = ?', sid).p ?? -1;
  const id = newId();
  q.run(
    'INSERT INTO channels (id, server_id, type, name, topic, category, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, sid, type, channelName(type, req.body.name), str(req.body.topic, 300), str(req.body.category, 40), max + 1, Date.now(),
  );
  const ch = serializeChannel(q.get('SELECT * FROM channels WHERE id = ?', id));
  emitToServer(sid, 'channel:create', ch);
  return ch;
}));

api.patch('/channels/:id', wrap((req) => {
  const ch = channelForUser(req.params.id, req.user.id);
  if (!ch || !ch.server_id) fail(404, 'Kanal nicht gefunden');
  requireServerRole(ch.server_id, req.user.id, { perm: PERMS.MANAGE_CHANNELS });
  const b = req.body || {};
  const set = {};
  if ('name' in b) set.name = channelName(ch.type, b.name);
  if ('topic' in b) set.topic = str(b.topic, 300);
  if ('category' in b) set.category = str(b.category, 40);
  if ('position' in b && Number.isInteger(b.position)) set.position = b.position;
  const keys = Object.keys(set);
  if (keys.length) q.run(`UPDATE channels SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(set), ch.id);
  const out = serializeChannel(q.get('SELECT * FROM channels WHERE id = ?', ch.id));
  emitToServer(ch.server_id, 'channel:update', out);
  return out;
}));

api.post('/servers/:id/channels/reorder', wrap((req) => {
  const sid = req.params.id;
  requireServerRole(sid, req.user.id, { perm: PERMS.MANAGE_CHANNELS });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  tx(() => ids.forEach((cid, i) => q.run('UPDATE channels SET position = ? WHERE id = ? AND server_id = ?', i, cid, sid)));
  const channels = q.all('SELECT * FROM channels WHERE server_id = ? ORDER BY position, created_at', sid).map(serializeChannel);
  channels.forEach((c) => emitToServer(sid, 'channel:update', c));
  return channels;
}));

api.delete('/channels/:id', wrap((req) => {
  const ch = channelForUser(req.params.id, req.user.id);
  if (!ch || !ch.server_id) fail(404, 'Kanal nicht gefunden');
  requireServerRole(ch.server_id, req.user.id, { perm: PERMS.MANAGE_CHANNELS });
  if (q.get('SELECT COUNT(*) AS n FROM channels WHERE server_id = ?', ch.server_id).n <= 1) fail(400, 'Der letzte Kanal kann nicht gelöscht werden');
  dropVoiceChannel(ch.id);
  q.run('DELETE FROM channels WHERE id = ?', ch.id);
  emitToServer(ch.server_id, 'channel:delete', { id: ch.id, serverId: ch.server_id });
  return { ok: true };
}));

// ---------- Nachrichten ----------
function accessibleChannel(req, { write = false } = {}) {
  const ch = channelForUser(req.params.id, req.user.id);
  if (!ch) fail(404, 'Kanal nicht gefunden');
  if (write && ch.type === 'voice') fail(400, 'In Sprachkanäle kann man nicht schreiben');
  if (write && !ch.server_id) {
    const other = dmMemberIds(ch.id).find((id) => id !== req.user.id);
    if (other && (relationship(other, req.user.id) === 2 || relationship(req.user.id, other) === 2)) fail(403, 'Nachricht konnte nicht zugestellt werden (blockiert).');
    const block = other && claimBlocks(req.user.id, other);
    if (block) fail(423, block.message);
  }
  return ch;
}

api.get('/channels/:id/messages', wrap((req) => {
  const ch = accessibleChannel(req);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rows = req.query.before
    ? q.all('SELECT * FROM messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT ?', ch.id, String(req.query.before), limit)
    : q.all('SELECT * FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT ?', ch.id, limit);
  const msgs = serializeMessages(rows.reverse());
  const missing = [...new Set(msgs.flatMap((m) => [m.authorId, m.replyTo?.authorId]).filter(Boolean))];
  const users = {};
  for (const id of missing) { const u = getUser(id); if (u) users[id] = publicUser(u); }
  return { messages: msgs, users, hasMore: rows.length === limit };
}));

api.get('/channels/:id/pins', wrap((req) => {
  const ch = accessibleChannel(req);
  return serializeMessages(q.all('SELECT * FROM messages WHERE channel_id = ? AND pinned = 1 ORDER BY id DESC LIMIT 50', ch.id));
}));

api.get('/channels/:id/search', wrap((req) => {
  const ch = accessibleChannel(req);
  const term = String(req.query.q || '').trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  return serializeMessages(q.all(`SELECT * FROM messages WHERE channel_id = ? AND content LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 50`, ch.id, like));
}));

const msgLimit = rateLimit({ windowMs: 5000, max: 12, key: (req) => req.user.id });

api.post('/channels/:id/messages', msgLimit, wrap((req) => {
  const ch = accessibleChannel(req, { write: true });
  const b = req.body || {};
  const content = str(b.content, 4000, { name: 'Nachricht' });
  const attachments = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 10).map((a) => ({
    url: uploadUrl(a?.url),
    name: str(a?.name || 'datei', 200),
    size: Number(a?.size) || 0,
    type: str(a?.type || 'application/octet-stream', 100),
    width: Number(a?.width) || undefined,
    height: Number(a?.height) || undefined,
    spoiler: !!a?.spoiler,
    ...(a?.voice ? {
      voice: true,
      duration: Math.min(600, Math.max(0, Number(a.duration) || 0)),
      waveform: (Array.isArray(a.waveform) ? a.waveform : []).slice(0, 64).map((v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)))),
    } : {}),
  })).filter((a) => a.url);
  let sticker = null;
  if (b.sticker) {
    sticker = String(b.sticker).slice(0, 200);
    if (!/^(builtin:[a-z0-9_]+|\/uploads\/[\w.-]+)$/.test(sticker)) fail(400, 'Ungültiger Sticker');
  }
  if (!content && !attachments.length && !sticker) fail(400, 'Leere Nachricht');
  if (ch.server_id && content.includes('@everyone') && !(memberPerms(ch.server_id, req.user.id).perms & PERMS.MENTION_EVERYONE)) fail(403, 'Du darfst @everyone nicht verwenden');
  let replyTo = null;
  if (b.replyTo) {
    const r = q.get('SELECT id FROM messages WHERE id = ? AND channel_id = ?', String(b.replyTo), ch.id);
    replyTo = r?.id || null;
  }
  const id = newId();
  q.run(
    'INSERT INTO messages (id, channel_id, author_id, content, attachments, sticker, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, ch.id, req.user.id, content, JSON.stringify(attachments), sticker, replyTo, Date.now(),
  );
  q.run('INSERT INTO read_states (user_id, channel_id, last_read) VALUES (?, ?, ?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read = excluded.last_read', req.user.id, ch.id, id);
  const msg = serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', id)])[0];
  emitToChannel(ch, 'message:create', { ...msg, nonce: b.nonce });
  onMessageCreated(ch, req.user.id, msg);
  return msg;
}));

function ownMessage(req, { allowAdmin = false } = {}) {
  const m = q.get('SELECT * FROM messages WHERE id = ?', req.params.id);
  if (!m) fail(404, 'Nachricht nicht gefunden');
  const ch = channelForUser(m.channel_id, req.user.id);
  if (!ch) fail(404, 'Nachricht nicht gefunden');
  const admin = ch.server_id && !!(memberPerms(ch.server_id, req.user.id).perms & PERMS.MANAGE_MESSAGES);
  if (m.author_id !== req.user.id && !(allowAdmin && admin)) fail(403, 'Keine Berechtigung');
  return { m, ch, admin };
}

api.patch('/messages/:id', wrap((req) => {
  const { m, ch } = ownMessage(req);
  const content = str(req.body.content, 4000, { name: 'Nachricht' });
  if (!content && JSON.parse(m.attachments).length === 0 && !m.sticker) fail(400, 'Leere Nachricht');
  q.run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', content, Date.now(), m.id);
  const msg = serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', m.id)])[0];
  emitToChannel(ch, 'message:update', msg);
  return msg;
}));

api.delete('/messages/:id', wrap((req) => {
  const { m, ch } = ownMessage(req, { allowAdmin: true });
  q.run('DELETE FROM messages WHERE id = ?', m.id);
  emitToChannel(ch, 'message:delete', { id: m.id, channelId: ch.id });
  for (const a of JSON.parse(m.attachments || '[]')) {
    const inUse = q.get('SELECT 1 FROM messages WHERE attachments LIKE ? LIMIT 1', `%${a.url}%`);
    if (!inUse) {
      fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(a.url))).catch(() => {});
      forgetUpload(path.basename(a.url));
    }
  }
  return { ok: true };
}));

api.post('/messages/:id/pin', wrap((req) => {
  const m = q.get('SELECT * FROM messages WHERE id = ?', req.params.id);
  const ch = m && channelForUser(m.channel_id, req.user.id);
  if (!ch) fail(404, 'Nachricht nicht gefunden');
  if (ch.server_id && !(memberPerms(ch.server_id, req.user.id).perms & PERMS.MANAGE_MESSAGES)) fail(403, 'Dafür brauchst du das Recht „Nachrichten verwalten“');
  q.run('UPDATE messages SET pinned = ? WHERE id = ?', m.pinned ? 0 : 1, m.id);
  const msg = serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', m.id)])[0];
  emitToChannel(ch, 'message:update', msg);
  return msg;
}));

function reactionTarget(req) {
  const m = q.get('SELECT * FROM messages WHERE id = ?', req.params.id);
  const ch = m && channelForUser(m.channel_id, req.user.id);
  if (!ch) fail(404, 'Nachricht nicht gefunden');
  const emoji = String(req.params.emoji || '');
  if (!emoji || emoji.length > 64) fail(400, 'Ungültiges Emoji');
  return { m, ch, emoji };
}
function emitReactions(m, ch) {
  const msg = serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', m.id)])[0];
  emitToChannel(ch, 'reaction:update', { id: m.id, channelId: ch.id, reactions: msg.reactions });
}

api.put('/messages/:id/reactions/:emoji', wrap((req) => {
  const { m, ch, emoji } = reactionTarget(req);
  const distinct = q.get('SELECT COUNT(DISTINCT emoji) AS n FROM reactions WHERE message_id = ?', m.id).n;
  if (distinct >= 20 && !q.get('SELECT 1 FROM reactions WHERE message_id = ? AND emoji = ?', m.id, emoji)) fail(400, 'Maximal 20 verschiedene Reaktionen');
  const added = q.run('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)', m.id, req.user.id, emoji, Date.now());
  if (added.changes) progressQuest(req.user.id, 'react');
  emitReactions(m, ch);
  return { ok: true };
}));

api.delete('/messages/:id/reactions/:emoji', wrap((req) => {
  const { m, ch, emoji } = reactionTarget(req);
  q.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', m.id, req.user.id, emoji);
  emitReactions(m, ch);
  return { ok: true };
}));

api.post('/channels/:id/ack', wrap((req) => {
  const ch = accessibleChannel(req);
  const last = String(req.body.messageId || '');
  if (!last) fail(400, 'messageId fehlt');
  q.run('INSERT INTO read_states (user_id, channel_id, last_read) VALUES (?, ?, ?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read = MAX(last_read, excluded.last_read)', req.user.id, ch.id, last);
  emitToUser(req.user.id, 'read:update', { channelId: ch.id, messageId: last });
  return { ok: true };
}));

// ---------- Flammen, Stories, Aufgaben, Shop, Claims … ----------
api.use(features);

// ---------- Fehlerbehandlung ----------
api.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Datei ist zu groß (max. 100 MB)' : err.message });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Serverfehler' });
});
