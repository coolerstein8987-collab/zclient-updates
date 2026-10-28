// Zync-Helfer: alles, wofür man auf Discord extra Bots braucht – eingebaut.
// Willkommen, Auto-Rolle, Level/XP, Wortfilter & Spamschutz, Umfragen, Gewinnspiele,
// Erinnerungen und geplante Nachrichten.
import express from 'express';
import { q, tx, newId, BOTS, json, serializeMember } from './db.js';
import { channelForUser, getMember, dmMemberIds, relationship } from './access.js';
import { memberPerms, PERMS } from './perm.js';
import { emitToServer } from './realtime.js';
import { postMessage, refreshMessage } from './post.js';
import { onMessageCreated, claimBlocks } from './features.js';
import { bus } from './bus.js';
import { HttpError, fail, wrap, text } from './http.js';

export const helpers = express.Router();

const DEFAULTS = {
  welcome: { on: false, channelId: null, text: 'Willkommen {user} auf **{server}**! 🎉 Schön, dass du da bist.' },
  autoRole: { on: false, roleId: null },
  levels: { on: false, channelId: null },
  filter: { on: false, words: [], links: false, spam: true },
};

export function helperConfig(serverId) {
  const c = json(q.get('SELECT helpers FROM servers WHERE id = ?', serverId)?.helpers, {});
  return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { ...v, ...(c[k] || {}) }]));
}

const can = (serverId, userId, perm) => (memberPerms(serverId, userId).perms & perm) === perm;
const textChannelOf = (serverId, id) => (id ? q.get("SELECT * FROM channels WHERE id = ? AND server_id = ? AND type = 'text'", id, serverId) : null);
const firstTextChannel = (serverId) => q.get("SELECT * FROM channels WHERE server_id = ? AND type = 'text' ORDER BY position, created_at LIMIT 1", serverId);
const userName = (id) => q.get('SELECT username FROM users WHERE id = ?', id)?.username || 'jemand';

// ---------- Einstellungen ----------
helpers.get('/servers/:id/helpers', wrap((req) => {
  if (!can(req.params.id, req.user.id, PERMS.MANAGE_SERVER)) fail(403, 'Dafür brauchst du das Recht „Server verwalten“');
  return helperConfig(req.params.id);
}));

helpers.patch('/servers/:id/helpers', wrap((req) => {
  const sid = req.params.id;
  if (!can(sid, req.user.id, PERMS.MANAGE_SERVER)) fail(403, 'Dafür brauchst du das Recht „Server verwalten“');
  const cur = helperConfig(sid);
  const b = req.body || {};
  if (b.welcome) {
    cur.welcome = {
      on: !!b.welcome.on,
      channelId: textChannelOf(sid, b.welcome.channelId)?.id || null,
      text: text(b.welcome.text, 500) || DEFAULTS.welcome.text,
    };
  }
  if (b.autoRole) {
    const role = b.autoRole.roleId ? q.get('SELECT * FROM roles WHERE id = ? AND server_id = ?', String(b.autoRole.roleId), sid) : null;
    if (role && (role.permissions & PERMS.ADMIN)) fail(400, 'Eine Admin-Rolle kann nicht automatisch vergeben werden.');
    cur.autoRole = { on: !!b.autoRole.on && !!role, roleId: role?.id || null };
  }
  if (b.levels) cur.levels = { on: !!b.levels.on, channelId: textChannelOf(sid, b.levels.channelId)?.id || null };
  if (b.filter) {
    cur.filter = {
      on: !!b.filter.on,
      words: [...new Set((Array.isArray(b.filter.words) ? b.filter.words : []).map((w) => text(String(w), 40).toLowerCase()).filter(Boolean))].slice(0, 100),
      links: !!b.filter.links,
      spam: b.filter.spam !== false,
    };
  }
  q.run('UPDATE servers SET helpers = ? WHERE id = ?', JSON.stringify(cur), sid);
  return cur;
}));

// ---------- Willkommen & Auto-Rolle ----------
bus.on('member:join', ({ serverId, userId }) => {
  const cfg = helperConfig(serverId);
  if (cfg.autoRole.on && cfg.autoRole.roleId && q.get('SELECT 1 FROM roles WHERE id = ?', cfg.autoRole.roleId)) {
    q.run('INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)', serverId, userId, cfg.autoRole.roleId);
    const m = getMember(serverId, userId);
    if (m) emitToServer(serverId, 'member:update', serializeMember(m));
  }
  if (cfg.welcome.on) {
    const ch = textChannelOf(serverId, cfg.welcome.channelId) || firstTextChannel(serverId);
    const server = q.get('SELECT name FROM servers WHERE id = ?', serverId);
    if (ch) {
      const content = cfg.welcome.text.replaceAll('{user}', `@${userName(userId)}`).replaceAll('{server}', server?.name || '');
      postMessage(ch, BOTS.helper.id, { content });
    }
  }
});

// ---------- Wortfilter & Spamschutz ----------
const recent = new Map(); // `${channel}:${user}` → [{ content, at }]

/** Wirft einen Fehler, wenn der Filter des Servers die Nachricht blockiert. */
export function filterMessage(ch, userId, content) {
  if (!ch.server_id || !content) return;
  const cfg = helperConfig(ch.server_id).filter;
  if (!cfg.on || can(ch.server_id, userId, PERMS.MANAGE_MESSAGES)) return;
  const lower = content.toLowerCase();
  for (const w of cfg.words) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu').test(lower)) throw new HttpError(400, '🛡️ Deine Nachricht enthält ein Wort, das auf diesem Server nicht erlaubt ist.');
  }
  if (cfg.links && /(https?:\/\/|www\.)\S+/i.test(content)) throw new HttpError(400, '🛡️ Links sind auf diesem Server nur für Moderatoren erlaubt.');
  if (cfg.spam) {
    const key = `${ch.id}:${userId}`;
    const now = Date.now();
    const list = (recent.get(key) || []).filter((m) => now - m.at < 30_000);
    if (list.filter((m) => m.content === lower).length >= 2) throw new HttpError(429, '🛡️ Bitte nicht spammen – das hast du gerade schon geschrieben.');
    list.push({ content: lower, at: now });
    recent.set(key, list.slice(-10));
  }
}

// ---------- Level & XP ----------
/** Gesamt-XP, die man für ein Level braucht (wird pro Level etwas mehr). */
export const xpForLevel = (lvl) => Array.from({ length: lvl }, (_, i) => 5 * i * i + 50 * i + 100).reduce((a, b) => a + b, 0);
export const levelForXp = (xp) => { let l = 0; while (xp >= xpForLevel(l + 1)) l++; return l; };

bus.on('message', ({ ch, msg, authorId }) => {
  if (!ch.server_id || msg.type !== 'default') return;
  const cfg = helperConfig(ch.server_id).levels;
  if (!cfg.on) return;
  const author = q.get('SELECT bot FROM users WHERE id = ?', authorId);
  if (!author || author.bot) return;
  const row = q.get('SELECT * FROM member_xp WHERE server_id = ? AND user_id = ?', ch.server_id, authorId) || { xp: 0, level: 0, last_at: 0 };
  const now = Date.now();
  if (now - row.last_at < 60_000) return; // höchstens einmal pro Minute XP – Spammen lohnt sich nicht
  const xp = row.xp + 15 + Math.floor(Math.random() * 11);
  const level = levelForXp(xp);
  q.run(`INSERT INTO member_xp (server_id, user_id, xp, level, last_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(server_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, last_at = excluded.last_at`, ch.server_id, authorId, xp, level, now);
  if (level > row.level) {
    const target = textChannelOf(ch.server_id, cfg.channelId) || ch;
    postMessage(target, BOTS.helper.id, { content: `🎉 GG @${userName(authorId)} – du bist jetzt **Level ${level}**! ⭐`, meta: { levelUp: level, userId: authorId } });
  }
});

helpers.get('/servers/:id/leaderboard', wrap((req) => {
  if (!getMember(req.params.id, req.user.id)) fail(404, 'Server nicht gefunden');
  const rows = q.all('SELECT user_id, xp, level FROM member_xp WHERE server_id = ? ORDER BY xp DESC LIMIT 50', req.params.id);
  return {
    enabled: helperConfig(req.params.id).levels.on,
    entries: rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, xp: r.xp, level: r.level, next: xpForLevel(r.level + 1), prev: xpForLevel(r.level) })),
  };
}));

// ---------- Umfragen ----------
function writableChannel(req, id) {
  const ch = channelForUser(String(id), req.user.id);
  if (!ch || ch.type === 'voice') fail(404, 'Kanal nicht gefunden');
  if (!ch.server_id) {
    const other = dmMemberIds(ch.id).find((x) => x !== req.user.id);
    if (other && (relationship(other, req.user.id) === 2 || relationship(req.user.id, other) === 2)) fail(403, 'Nachricht konnte nicht zugestellt werden (blockiert).');
    const block = other && claimBlocks(req.user.id, other);
    if (block) fail(423, block.message);
  }
  return ch;
}

helpers.post('/channels/:id/polls', wrap((req) => {
  const ch = writableChannel(req, req.params.id);
  const b = req.body || {};
  const question = text(b.question, 200);
  const options = (Array.isArray(b.options) ? b.options : []).map((o) => text(String(o), 80)).filter(Boolean).slice(0, 10);
  if (!question) fail(400, 'Stell eine Frage');
  if (options.length < 2) fail(400, 'Eine Umfrage braucht mindestens zwei Antworten');
  const hours = Math.min(168, Math.max(0, Number(b.hours) || 0));
  const endsAt = hours ? Date.now() + hours * 3_600_000 : null;
  return postMessage(ch, req.user.id, {
    type: 'poll',
    content: question,
    attach: (id) => q.run('INSERT INTO polls (message_id, question, options, multi, ends_at) VALUES (?, ?, ?, ?, ?)', id, question, JSON.stringify(options), b.multi ? 1 : 0, endsAt),
  });
}));

function specialMessage(req, type) {
  const m = q.get('SELECT * FROM messages WHERE id = ? AND type = ?', req.params.id, type);
  if (!m) fail(404, 'Nachricht nicht gefunden');
  const ch = channelForUser(m.channel_id, req.user.id);
  if (!ch) fail(404, 'Nachricht nicht gefunden');
  return { m, ch };
}

helpers.put('/messages/:id/vote', wrap((req) => {
  const { m, ch } = specialMessage(req, 'poll');
  const poll = q.get('SELECT * FROM polls WHERE message_id = ?', m.id);
  if (poll.ends_at && poll.ends_at < Date.now()) fail(400, 'Die Umfrage ist schon beendet');
  const count = json(poll.options, []).length;
  let picks = [...new Set((Array.isArray(req.body?.options) ? req.body.options : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < count))];
  if (!poll.multi) picks = picks.slice(0, 1);
  tx(() => {
    q.run('DELETE FROM poll_votes WHERE message_id = ? AND user_id = ?', m.id, req.user.id);
    for (const o of picks) q.run('INSERT INTO poll_votes (message_id, user_id, option) VALUES (?, ?, ?)', m.id, req.user.id, o);
  });
  return refreshMessage(ch, m.id);
}));

// ---------- Gewinnspiele ----------
helpers.post('/channels/:id/giveaways', wrap((req) => {
  const ch = writableChannel(req, req.params.id);
  if (!ch.server_id) fail(400, 'Gewinnspiele gibt es nur auf Servern');
  if (!can(ch.server_id, req.user.id, PERMS.MANAGE_SERVER)) fail(403, 'Dafür brauchst du das Recht „Server verwalten“');
  const prize = text(req.body?.prize, 100);
  if (!prize) fail(400, 'Was gibt es zu gewinnen?');
  const minutes = Math.min(10_080, Math.max(1, Math.round(Number(req.body?.minutes) || 60)));
  const winners = Math.min(20, Math.max(1, Math.round(Number(req.body?.winners) || 1)));
  return postMessage(ch, req.user.id, {
    type: 'giveaway',
    content: prize,
    attach: (id) => q.run('INSERT INTO giveaways (message_id, prize, winners, ends_at) VALUES (?, ?, ?, ?)', id, prize, winners, Date.now() + minutes * 60_000),
  });
}));

helpers.post('/messages/:id/enter', wrap((req) => {
  const { m, ch } = specialMessage(req, 'giveaway');
  const g = q.get('SELECT * FROM giveaways WHERE message_id = ?', m.id);
  if (g.ended || g.ends_at < Date.now()) fail(400, 'Das Gewinnspiel ist schon vorbei');
  const inside = q.get('SELECT 1 FROM giveaway_entries WHERE message_id = ? AND user_id = ?', m.id, req.user.id);
  if (inside) q.run('DELETE FROM giveaway_entries WHERE message_id = ? AND user_id = ?', m.id, req.user.id);
  else q.run('INSERT INTO giveaway_entries (message_id, user_id) VALUES (?, ?)', m.id, req.user.id);
  return refreshMessage(ch, m.id);
}));

function finishGiveaways() {
  for (const g of q.all('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?', Date.now())) {
    const entrants = q.all('SELECT user_id FROM giveaway_entries WHERE message_id = ?', g.message_id).map((r) => r.user_id);
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }
    const won = entrants.slice(0, g.winners);
    q.run('UPDATE giveaways SET ended = 1, result = ? WHERE message_id = ?', JSON.stringify(won), g.message_id);
    const msg = q.get('SELECT * FROM messages WHERE id = ?', g.message_id);
    const ch = msg && q.get('SELECT * FROM channels WHERE id = ?', msg.channel_id);
    if (!ch) continue;
    refreshMessage(ch, g.message_id);
    postMessage(ch, BOTS.helper.id, {
      replyTo: g.message_id,
      content: won.length
        ? `🎉 Glückwunsch ${won.map((id) => `@${userName(id)}`).join(', ')}! Ihr habt **${g.prize}** gewonnen! 🏆`
        : `😢 Beim Gewinnspiel um **${g.prize}** hat leider niemand mitgemacht.`,
    });
  }
}

// ---------- Erinnerungen & geplante Nachrichten ----------
const MAX_AHEAD = 366 * 24 * 3_600_000;

helpers.post('/scheduled', wrap((req) => {
  const b = req.body || {};
  const kind = b.kind === 'reminder' ? 'reminder' : 'message';
  const ch = writableChannel(req, b.channelId);
  const content = text(b.content, 2000);
  if (!content) fail(400, kind === 'reminder' ? 'Woran soll ich dich erinnern?' : 'Die Nachricht ist leer');
  const at = Number(b.at);
  if (!Number.isFinite(at) || at < Date.now() + 30_000) fail(400, 'Wähle einen Zeitpunkt in der Zukunft (mindestens 1 Minute)');
  if (at > Date.now() + MAX_AHEAD) fail(400, 'Höchstens ein Jahr im Voraus');
  if (q.get('SELECT COUNT(*) AS n FROM scheduled WHERE user_id = ?', req.user.id).n >= 50) fail(400, 'Du hast schon 50 geplante Einträge');
  const id = newId();
  q.run('INSERT INTO scheduled (id, kind, user_id, channel_id, content, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, kind, req.user.id, ch.id, content, Math.round(at), Date.now());
  return serializeScheduled(q.get('SELECT * FROM scheduled WHERE id = ?', id));
}));

const serializeScheduled = (r) => ({ id: r.id, kind: r.kind, channelId: r.channel_id, content: r.content, at: r.due_at, createdAt: r.created_at });

helpers.get('/scheduled', wrap((req) => q.all('SELECT * FROM scheduled WHERE user_id = ? ORDER BY due_at', req.user.id).map(serializeScheduled)));

helpers.delete('/scheduled/:id', wrap((req) => {
  q.run('DELETE FROM scheduled WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  return { ok: true };
}));

function runScheduled() {
  for (const s of q.all('SELECT * FROM scheduled WHERE due_at <= ? ORDER BY due_at LIMIT 50', Date.now())) {
    q.run('DELETE FROM scheduled WHERE id = ?', s.id);
    const ch = channelForUser(s.channel_id, s.user_id);
    if (!ch) continue;
    if (s.kind === 'reminder') {
      postMessage(ch, BOTS.helper.id, { content: `⏰ @${userName(s.user_id)} – Erinnerung: ${s.content}`, meta: { reminder: true, userId: s.user_id } });
      continue;
    }
    if (!ch.server_id) {
      const other = dmMemberIds(ch.id).find((x) => x !== s.user_id);
      if (other && (relationship(other, s.user_id) === 2 || relationship(s.user_id, other) === 2)) continue;
    }
    const msg = postMessage(ch, s.user_id, { content: s.content, meta: { scheduled: true } });
    onMessageCreated(ch, s.user_id, msg);
  }
}

export function startHelperTicks() {
  setInterval(() => {
    try {
      finishGiveaways();
      runScheduled();
    } catch (e) {
      console.error('Zync-Helfer:', e);
    }
  }, 10_000).unref();
}

