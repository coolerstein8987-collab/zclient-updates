// Flammen (Streaks), Stories, Aufgaben & Shop, Badges/Stats, Claims, Aktivität, Soundboard.
import express from 'express';
import { q, tx, newId, json, serializeServer, serializeMessages } from './db.js';
import { dayKey, yesterdayKey, msUntilMidnight } from './config.js';
import { relationship, friendIds, getMember, dmMemberIds } from './access.js';
import { publicUser, selfUser, activeClaimOf, serializeClaim, inWindow } from './profile.js';
import {
  CATALOG, ALL_DONE_BONUS, questState, progressQuest, addPoints, ownedIds, statsFor, badgesFor,
} from './progress.js';
import { emitToUser, emitToRelated, emitToChannel, onlineUserIds, voiceUserIds } from './realtime.js';

export const features = express.Router();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const wrap = (fn) => async (req, res, next) => {
  try {
    const r = await fn(req, res);
    if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) {
    next(e);
  }
};
const getUser = (id) => q.get('SELECT * FROM users WHERE id = ?', id);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
const uploadRef = (v) => (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v) ? v : null);
const refreshUser = (id) => {
  const u = getUser(id);
  if (!u) return;
  emitToRelated(id, 'user:update', publicUser(u));
  emitToUser(id, 'me:update', selfUser(u));
};

// =====================================================================
// Flammen / Streaks (wie Snapchat): beide schreiben sich jeden Tag → +1
// =====================================================================
const MILESTONES = [3, 5, 7, 10, 14, 30, 50, 69, 100, 150, 200, 365, 500, 1000];

export function streakPayload(channelId) {
  const s = q.get('SELECT * FROM streaks WHERE channel_id = ?', channelId);
  if (!s) return { count: 0, best: 0, expiring: false, today: {} };
  const today = dayKey();
  const alive = s.last_day === today || s.last_day === yesterdayKey();
  const days = json(s.days, {});
  return {
    count: alive ? s.count : 0,
    best: s.best,
    lastDay: s.last_day,
    expiring: alive && s.last_day !== today,
    today: Object.fromEntries(Object.entries(days).map(([uid, d]) => [uid, d === today])),
  };
}

function bumpStreak(channelId, userId, members) {
  const today = dayKey();
  const s = q.get('SELECT * FROM streaks WHERE channel_id = ?', channelId) || { count: 0, best: 0, last_day: null, days: '{}' };
  const days = json(s.days, {});
  const wasToday = days[userId] === today;
  days[userId] = today;
  let { count, best } = s;
  let lastDay = s.last_day;
  let milestone = null;
  let completed = false;
  if (members.every((id) => days[id] === today) && lastDay !== today) {
    count = lastDay === yesterdayKey() ? count + 1 : 1;
    lastDay = today;
    best = Math.max(best, count);
    completed = true;
    if (MILESTONES.includes(count)) milestone = count;
  }
  if (wasToday && !completed) return null;
  q.run(
    `INSERT INTO streaks (channel_id, count, best, last_day, days) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET count = excluded.count, best = excluded.best, last_day = excluded.last_day, days = excluded.days`,
    channelId, count, best, lastDay, JSON.stringify(days),
  );
  return { completed, milestone, count };
}

/** Wird bei jeder neuen Nachricht aufgerufen (Quests, Statistiken, Flammen). */
export function onMessageCreated(ch, authorId, msg) {
  q.run('UPDATE users SET msg_count = msg_count + 1 WHERE id = ?', authorId);
  progressQuest(authorId, 'messages');
  if (msg.sticker) progressQuest(authorId, 'sticker');
  if (msg.attachments?.some((a) => a.voice)) progressQuest(authorId, 'voicemsg');
  if (ch.type !== 'dm') return;
  const members = dmMemberIds(ch.id);
  const res = bumpStreak(ch.id, authorId, members);
  if (!res) return;
  emitToChannel(ch, 'streak:update', { channelId: ch.id, streak: streakPayload(ch.id) });
  if (!res.completed) return;
  for (const uid of members) {
    progressQuest(uid, 'streak');
    q.run('UPDATE users SET best_streak = MAX(best_streak, ?) WHERE id = ?', res.count, uid);
  }
  if (res.milestone) {
    const id = newId();
    q.run(`INSERT INTO messages (id, channel_id, author_id, content, type, created_at) VALUES (?, ?, ?, ?, 'streak', ?)`, id, ch.id, authorId, String(res.milestone), Date.now());
    emitToChannel(ch, 'message:create', serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', id)])[0]);
    for (const uid of members) {
      addPoints(uid, 25);
      refreshUser(uid);
    }
  }
}

// =====================================================================
// Claims: zwei Freunde reservieren sich ein Zeitfenster (z. B. 9–21 Uhr)
// =====================================================================
/** Liefert eine Sperre, wenn `targetId` gerade mit jemand anderem geclaimt ist. */
export function claimBlocks(senderId, targetId) {
  const c = activeClaimOf(targetId);
  if (!c || !inWindow(c.start_min, c.end_min)) return null;
  if (c.from_id === senderId || c.to_id === senderId) return null;
  const partner = c.from_id === targetId ? c.to_id : c.from_id;
  const p = getUser(partner);
  const until = `${String(Math.floor(c.end_min / 60)).padStart(2, '0')}:${String(c.end_min % 60).padStart(2, '0')}`;
  const when = c.start_min === c.end_min ? 'ganztägig' : `bis ${until} Uhr`;
  return { partner, until, message: `🔒 Gerade geclaimt mit @${p?.username || '?'} (${when}) – bitte nicht stören.` };
}

const minutes = (v) => {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1440) return v;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(400, 'Ungültige Uhrzeit');
  return Number(m[1]) * 60 + Number(m[2]);
};

function emitClaim(c) {
  const payload = serializeClaim(c);
  for (const uid of [c.from_id, c.to_id]) {
    const other = uid === c.from_id ? c.to_id : c.from_id;
    emitToUser(uid, 'claim:update', { claim: payload, user: publicUser(getUser(other)) });
  }
}

features.get('/claims', wrap((req) => q.all('SELECT * FROM claims WHERE from_id = ? OR to_id = ?', req.user.id, req.user.id).map(serializeClaim)));

features.post('/claims', wrap((req) => {
  const me = req.user.id;
  const target = getUser(String(req.body.userId || ''));
  if (!target || target.id === me) fail(404, 'Nutzer nicht gefunden');
  if (relationship(me, target.id) !== 1) fail(403, 'Du kannst nur Freunde claimen');
  if (activeClaimOf(me)) fail(409, 'Du bist schon geclaimt – beende das zuerst.');
  if (activeClaimOf(target.id)) fail(409, `${target.display_name} ist schon geclaimt.`);
  if (q.get(`SELECT 1 FROM claims WHERE status = 'pending' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`, me, target.id, target.id, me)) fail(409, 'Es gibt schon eine offene Anfrage');
  const c = { id: newId(), from_id: me, to_id: target.id, start_min: minutes(req.body.start), end_min: minutes(req.body.end), note: text(req.body.note, 60), status: 'pending', created_at: Date.now() };
  q.run('INSERT INTO claims (id, from_id, to_id, start_min, end_min, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', c.id, c.from_id, c.to_id, c.start_min, c.end_min, c.note, c.status, c.created_at);
  emitClaim(c);
  return serializeClaim(c);
}));

features.put('/claims/:id', wrap((req) => {
  const c = q.get('SELECT * FROM claims WHERE id = ?', req.params.id);
  if (!c || c.to_id !== req.user.id || c.status !== 'pending') fail(404, 'Anfrage nicht gefunden');
  if (activeClaimOf(c.from_id) || activeClaimOf(c.to_id)) fail(409, 'Einer von euch ist schon geclaimt');
  q.run(`UPDATE claims SET status = 'active' WHERE id = ?`, c.id);
  q.run(`DELETE FROM claims WHERE status = 'pending' AND id != ? AND (from_id IN (?, ?) OR to_id IN (?, ?))`, c.id, c.from_id, c.to_id, c.from_id, c.to_id);
  const fresh = q.get('SELECT * FROM claims WHERE id = ?', c.id);
  emitClaim(fresh);
  refreshUser(c.from_id);
  refreshUser(c.to_id);
  return serializeClaim(fresh);
}));

features.delete('/claims/:id', wrap((req) => {
  const c = q.get('SELECT * FROM claims WHERE id = ?', req.params.id);
  if (!c || (c.from_id !== req.user.id && c.to_id !== req.user.id)) fail(404, 'Claim nicht gefunden');
  q.run('DELETE FROM claims WHERE id = ?', c.id);
  for (const uid of [c.from_id, c.to_id]) emitToUser(uid, 'claim:remove', { id: c.id, by: req.user.id, status: c.status });
  if (c.status === 'active') { refreshUser(c.from_id); refreshUser(c.to_id); }
  return { ok: true };
}));

// =====================================================================
// Stories (24 h sichtbar für Freunde)
// =====================================================================
const STORY_TTL = 24 * 3600_000;

function serializeStory(s, viewerId) {
  const mine = s.user_id === viewerId;
  const out = {
    id: s.id, userId: s.user_id, kind: s.kind, media: s.media, mediaType: s.media_type, text: s.text,
    style: json(s.style, {}), data: json(s.data, {}), createdAt: s.created_at, expiresAt: s.expires_at,
  };
  if (viewerId) out.viewed = mine || !!q.get('SELECT 1 FROM story_views WHERE story_id = ? AND user_id = ?', s.id, viewerId);
  if (mine) out.viewCount = q.get('SELECT COUNT(*) AS n FROM story_views WHERE story_id = ?', s.id).n;
  return out;
}

function canSeeStories(viewerId, authorId) {
  return viewerId === authorId || relationship(viewerId, authorId) === 1;
}

features.get('/stories', wrap((req) => {
  const me = req.user.id;
  const ids = [me, ...friendIds(me)];
  const rows = q.all(`SELECT * FROM stories WHERE expires_at > ? AND user_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`, Date.now(), ...ids);
  const users = {};
  for (const r of rows) {
    if (!users[r.user_id]) users[r.user_id] = publicUser(getUser(r.user_id));
  }
  return { stories: rows.map((r) => serializeStory(r, me)), users };
}));

const STORY_BGS = ['aurora', 'sunset', 'ocean', 'sakura', 'matcha', 'night', 'fire', 'mono', 'candy', 'galaxy'];

features.post('/stories', wrap((req) => {
  const me = req.user;
  const b = req.body || {};
  const kind = ['media', 'text', 'streak'].includes(b.kind) ? b.kind : fail(400, 'Ungültige Story');
  const count = q.get('SELECT COUNT(*) AS n FROM stories WHERE user_id = ? AND expires_at > ?', me.id, Date.now()).n;
  if (count >= 30) fail(400, 'Maximal 30 aktive Stories');
  const st = b.style && typeof b.style === 'object' ? b.style : {};
  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const style = {
    bg: STORY_BGS.includes(st.bg) ? st.bg : 'aurora',
    color: hex(st.color) || '#ffffff',
    font: ['sans', 'serif', 'mono', 'script', 'marker', 'pixel'].includes(st.font) ? st.font : 'sans',
    sticker: typeof st.sticker === 'string' && /^(builtin:[a-z0-9_]+|\/uploads\/[\w.-]+)$/.test(st.sticker) ? st.sticker : null,
    stickerX: num(st.stickerX, 0, 1, 0.5), stickerY: num(st.stickerY, 0, 1, 0.7), stickerScale: num(st.stickerScale, 0.3, 3, 1),
    textY: num(st.textY, 0, 1, 0.5),
  };
  let media = null;
  let mediaType = null;
  let data = {};
  if (kind === 'media') {
    media = uploadRef(b.media) || fail(400, 'Bild oder Video fehlt');
    mediaType = /^video\//.test(String(b.mediaType)) ? 'video' : 'image';
  }
  if (kind === 'text' && !text(b.text, 300)) fail(400, 'Text fehlt');
  if (kind === 'streak') {
    const ch = q.get(`SELECT c.* FROM channels c JOIN dm_members d ON d.channel_id = c.id WHERE c.id = ? AND d.user_id = ? AND c.type = 'dm'`, String(b.channelId || ''), me.id);
    if (!ch) fail(404, 'Unterhaltung nicht gefunden');
    const sp = streakPayload(ch.id);
    if (sp.count < 1) fail(400, 'Diese Flamme ist erloschen');
    data = { partnerId: dmMemberIds(ch.id).find((id) => id !== me.id), count: sp.count };
  }
  const now = Date.now();
  const id = newId();
  q.run(
    'INSERT INTO stories (id, user_id, kind, media, media_type, text, style, data, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, me.id, kind, media, mediaType, text(b.text, 300), JSON.stringify(style), JSON.stringify(data), now, now + STORY_TTL,
  );
  q.run('UPDATE users SET stories_posted = stories_posted + 1 WHERE id = ?', me.id);
  progressQuest(me.id, 'story');
  const row = q.get('SELECT * FROM stories WHERE id = ?', id);
  const user = publicUser(getUser(me.id));
  emitToUser(me.id, 'story:create', { story: serializeStory(row, me.id), user });
  for (const fid of friendIds(me.id)) emitToUser(fid, 'story:create', { story: { ...serializeStory(row), viewed: false }, user });
  return serializeStory(row, me.id);
}));

features.post('/stories/:id/view', wrap((req) => {
  const s = q.get('SELECT * FROM stories WHERE id = ? AND expires_at > ?', req.params.id, Date.now());
  if (!s || !canSeeStories(req.user.id, s.user_id)) fail(404, 'Story nicht gefunden');
  if (s.user_id === req.user.id) return { ok: true };
  const reaction = typeof req.body.reaction === 'string' ? req.body.reaction.slice(0, 16) : null;
  q.run(
    `INSERT INTO story_views (story_id, user_id, reaction, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(story_id, user_id) DO UPDATE SET reaction = COALESCE(excluded.reaction, reaction)`,
    s.id, req.user.id, reaction, Date.now(),
  );
  emitToUser(s.user_id, 'story:view', { storyId: s.id, userId: req.user.id, reaction });
  return { ok: true };
}));

features.get('/stories/:id/viewers', wrap((req) => {
  const s = q.get('SELECT * FROM stories WHERE id = ?', req.params.id);
  if (!s || s.user_id !== req.user.id) fail(404, 'Story nicht gefunden');
  const rows = q.all('SELECT user_id, reaction, at FROM story_views WHERE story_id = ? ORDER BY at DESC', s.id);
  return { viewers: rows.map((r) => ({ userId: r.user_id, reaction: r.reaction, at: r.at })), users: Object.fromEntries(rows.map((r) => [r.user_id, publicUser(getUser(r.user_id))])) };
}));

features.delete('/stories/:id', wrap((req) => {
  const s = q.get('SELECT * FROM stories WHERE id = ?', req.params.id);
  if (!s || s.user_id !== req.user.id) fail(404, 'Story nicht gefunden');
  q.run('DELETE FROM stories WHERE id = ?', s.id);
  for (const uid of [s.user_id, ...friendIds(s.user_id)]) emitToUser(uid, 'story:delete', { id: s.id, userId: s.user_id });
  return { ok: true };
}));

// =====================================================================
// Tägliche Aufgaben, Punkte & Shop
// =====================================================================
features.get('/quests', wrap((req) => ({ ...questState(req.user.id), points: getUser(req.user.id).points, resetIn: msUntilMidnight() })));

features.post('/quests/:id/claim', wrap((req) => {
  const me = req.user.id;
  const state = questState(me);
  if (req.params.id === 'bonus') {
    if (state.bonusClaimed || !state.quests.every((x) => x.claimed)) fail(400, 'Erledige zuerst alle Aufgaben');
    tx(() => {
      q.run(`INSERT INTO quests (user_id, day, quest, progress, claimed) VALUES (?, ?, '_bonus', 1, 1) ON CONFLICT(user_id, day, quest) DO UPDATE SET claimed = 1`, me, state.day);
      addPoints(me, ALL_DONE_BONUS);
    });
  } else {
    const qs = state.quests.find((x) => x.id === req.params.id);
    if (!qs) fail(404, 'Aufgabe nicht gefunden');
    if (qs.claimed) fail(400, 'Schon eingesammelt');
    if (qs.progress < qs.goal) fail(400, 'Aufgabe noch nicht erledigt');
    tx(() => {
      q.run('UPDATE quests SET claimed = 1 WHERE user_id = ? AND day = ? AND quest = ?', me, state.day, qs.id);
      addPoints(me, qs.points);
      q.run('UPDATE users SET quests_done = quests_done + 1 WHERE id = ?', me);
    });
  }
  refreshUser(me);
  const next = { ...questState(me), points: getUser(me).points, resetIn: msUntilMidnight() };
  emitToUser(me, 'quests:update', next);
  return next;
}));

features.get('/shop', wrap((req) => {
  const u = getUser(req.user.id);
  return { catalog: CATALOG, owned: [...ownedIds(u)], points: u.points };
}));

features.post('/shop/:id/buy', wrap((req) => {
  const item = CATALOG.find((i) => i.id === req.params.id);
  if (!item) fail(404, 'Item nicht gefunden');
  const u = getUser(req.user.id);
  const owned = ownedIds(u);
  if (owned.has(item.id)) fail(400, 'Gehört dir schon');
  if (u.points < item.price) fail(400, `Dir fehlen noch ${item.price - u.points} Punkte`);
  tx(() => {
    q.run('UPDATE users SET points = points - ?, owned = ? WHERE id = ?', item.price, JSON.stringify([...json(u.owned, []), item.id]), u.id);
  });
  refreshUser(u.id);
  const fresh = getUser(u.id);
  return { owned: [...ownedIds(fresh)], points: fresh.points };
}));

// =====================================================================
// Statistiken, Aktivität, Server-Vorschau, Soundboard
// =====================================================================
features.get('/users/:id/stats', wrap((req) => {
  const u = getUser(req.params.id);
  if (!u) fail(404, 'Nutzer nicht gefunden');
  const stats = statsFor(u);
  return { stats, badges: badgesFor(u, stats) };
}));

features.patch('/me/activity', wrap((req) => {
  const name = text(req.body.name, 64);
  const source = req.body.source === 'desktop' ? 'desktop' : 'manual';
  const cur = json(req.user.activity, null);
  if (!name) {
    if (source === 'desktop' && cur?.source === 'manual') return { ok: true };
    q.run('UPDATE users SET activity = NULL WHERE id = ?', req.user.id);
  } else {
    if (source === 'desktop' && cur?.source === 'manual') return { ok: true };
    const since = cur?.name === name ? cur.since : Date.now();
    q.run('UPDATE users SET activity = ? WHERE id = ?', JSON.stringify({ type: 'game', name, source, since }), req.user.id);
  }
  refreshUser(req.user.id);
  return { ok: true };
}));

features.get('/servers/:id/preview', wrap((req) => {
  const s = q.get('SELECT * FROM servers WHERE id = ?', req.params.id);
  if (!s) fail(404, 'Server nicht gefunden');
  const joined = !!getMember(s.id, req.user.id);
  if (!s.tag && !s.is_public && !joined) fail(404, 'Server nicht gefunden');
  const srv = serializeServer(s);
  if (!joined) delete srv.invite;
  return {
    server: srv,
    joined,
    members: q.get('SELECT COUNT(*) AS n FROM members WHERE server_id = ?', s.id).n,
    tagWearers: q.get('SELECT COUNT(*) AS n FROM users WHERE tag_server = ?', s.id).n,
  };
}));

features.get('/sounds', wrap((req) => q.all('SELECT id, name, emoji, url FROM sounds WHERE owner_id = ? ORDER BY created_at', req.user.id)));

features.post('/sounds', wrap((req) => {
  const url = uploadRef(req.body.url) || fail(400, 'Audio fehlt');
  if (q.get('SELECT COUNT(*) AS n FROM sounds WHERE owner_id = ?', req.user.id).n >= 24) fail(400, 'Maximal 24 eigene Sounds');
  const s = { id: newId(), name: text(req.body.name, 24) || 'Sound', emoji: text(req.body.emoji, 16) || '🔊', url };
  q.run('INSERT INTO sounds (id, owner_id, name, emoji, url, created_at) VALUES (?, ?, ?, ?, ?, ?)', s.id, req.user.id, s.name, s.emoji, s.url, Date.now());
  emitToUser(req.user.id, 'sound:create', s);
  return s;
}));

features.delete('/sounds/:id', wrap((req) => {
  q.run('DELETE FROM sounds WHERE id = ? AND owner_id = ?', req.params.id, req.user.id);
  emitToUser(req.user.id, 'sound:delete', { id: req.params.id });
  return { ok: true };
}));

// =====================================================================
// Hintergrund-Ticks: Call-Zeit, Spielzeit, abgelaufene Stories
// =====================================================================
export function startTicks() {
  setInterval(() => {
    const now = Date.now();
    for (const uid of voiceUserIds()) {
      q.run('UPDATE users SET voice_seconds = voice_seconds + 60 WHERE id = ?', uid);
      progressQuest(uid, 'voice');
    }
    for (const uid of onlineUserIds()) {
      const u = getUser(uid);
      const act = json(u?.activity, null);
      if (!act?.name || u.status === 'invisible') continue;
      if (act.source === 'manual' && now - act.since > 12 * 3600_000) {
        q.run('UPDATE users SET activity = NULL WHERE id = ?', uid);
        refreshUser(uid);
        continue;
      }
      q.run(
        `INSERT INTO playtime (user_id, game, seconds, last_at) VALUES (?, ?, 60, ?)
         ON CONFLICT(user_id, game) DO UPDATE SET seconds = seconds + 60, last_at = excluded.last_at`,
        uid, act.name, now,
      );
    }
  }, 60_000).unref();
  setInterval(() => q.run('DELETE FROM stories WHERE expires_at < ?', Date.now()), 10 * 60_000).unref();
}

