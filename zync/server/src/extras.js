// Profil-Extras: Geburtstage (mit Kalender), Profil-Song und Gästebuch.
import express from 'express';
import { q, newId, json } from './db.js';
import { dayKey } from './config.js';
import { relationship, friendIds } from './access.js';
import { publicUser, selfUser } from './profile.js';
import { emitToUser, emitToRelated } from './realtime.js';
import { fail, wrap, text } from './http.js';

export const extras = express.Router();

const getUser = (id) => q.get('SELECT * FROM users WHERE id = ?', id);
const refresh = (id) => {
  const u = getUser(id);
  emitToRelated(id, 'user:update', publicUser(u));
  emitToUser(id, 'me:update', selfUser(u));
};
const uploadRef = (v, exts) => (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v) && (!exts || exts.test(v)) ? v : null);

// =====================================================================
// Geburtstage
// =====================================================================
/** Geburtstag eines Nutzers: { date: 'YYYY-MM-DD' (Jahr 0000 = unbekannt), show, age }. */
export const birthdayOf = (u) => json(u?.birthday, null);

function nextOccurrence(month, day, today = dayKey()) {
  const [y] = today.split('-').map(Number);
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const thisYear = `${y}-${mmdd}`;
  const target = thisYear >= today ? thisYear : `${y + 1}-${mmdd}`;
  const days = Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
  return { target, days };
}

/** Öffentlich sichtbar: hat heute Geburtstag (nur wenn „alle“ ihn sehen dürfen). */
export function birthdayToday(u) {
  const b = birthdayOf(u);
  return !!b && b.show === 'everyone' && b.date.slice(5) === dayKey().slice(5);
}

extras.put('/me/birthday', wrap((req) => {
  const b = req.body || {};
  if (b.day === null || b.day === '') {
    q.run('UPDATE users SET birthday = NULL WHERE id = ?', req.user.id);
  } else {
    const day = Math.round(Number(b.day));
    const month = Math.round(Number(b.month));
    const year = b.year ? Math.round(Number(b.year)) : 0;
    const thisYear = Number(dayKey().slice(0, 4));
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) fail(400, 'Ungültiges Datum');
    if (year && (year < thisYear - 120 || year > thisYear)) fail(400, 'Ungültiges Jahr');
    const probe = new Date(Date.UTC(year || 2000, month - 1, day));
    if (probe.getUTCDate() !== day) fail(400, 'Diesen Tag gibt es in dem Monat nicht');
    const show = ['friends', 'everyone', 'nobody'].includes(b.show) ? b.show : 'friends';
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    q.run('UPDATE users SET birthday = ? WHERE id = ?', JSON.stringify({ date, show, age: !!b.age && !!year }), req.user.id);
  }
  refresh(req.user.id);
  return { ok: true };
}));

/** Geburtstage von dir und deinen Freunden, sortiert nach dem nächsten Termin. */
extras.get('/birthdays', wrap((req) => {
  const today = dayKey();
  const ids = [req.user.id, ...friendIds(req.user.id)];
  const list = [];
  for (const id of ids) {
    const u = getUser(id);
    const b = birthdayOf(u);
    if (!b || (id !== req.user.id && b.show === 'nobody')) continue;
    const [y, m, d] = b.date.split('-').map(Number);
    const next = nextOccurrence(m, d, today);
    list.push({
      userId: id,
      day: d,
      month: m,
      inDays: next.days,
      today: next.days === 0,
      turns: b.age && y ? Number(next.target.slice(0, 4)) - y : null,
      next: next.target,
    });
  }
  return list.sort((a, b) => a.inDays - b.inDays);
}));

// =====================================================================
// Profil-Song
// =====================================================================
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|flac)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif)$/i;

extras.put('/me/song', wrap((req) => {
  const b = req.body || {};
  const url = uploadRef(b.url, AUDIO);
  if (!url) fail(400, 'Lade eine Audiodatei hoch (MP3, M4A, OGG …)');
  const song = { url, title: text(b.title, 60) || 'Mein Song', artist: text(b.artist, 60), cover: uploadRef(b.cover, IMAGE) };
  q.run('UPDATE users SET song = ? WHERE id = ?', JSON.stringify(song), req.user.id);
  refresh(req.user.id);
  return song;
}));

extras.delete('/me/song', wrap((req) => {
  q.run('UPDATE users SET song = NULL WHERE id = ?', req.user.id);
  refresh(req.user.id);
  return { ok: true };
}));

// =====================================================================
// Gästebuch
// =====================================================================
const guestbookMode = (u) => json(u?.privacy, {}).guestbook || 'friends';

function canWrite(owner, viewerId) {
  if (owner.id === viewerId || owner.bot) return false;
  const mode = guestbookMode(owner);
  if (mode === 'off') return false;
  if (relationship(owner.id, viewerId) === 2 || relationship(viewerId, owner.id) === 2) return false;
  return mode === 'everyone' || relationship(owner.id, viewerId) === 1;
}

extras.get('/users/:id/guestbook', wrap((req) => {
  const owner = getUser(req.params.id);
  if (!owner) fail(404, 'Nutzer nicht gefunden');
  const mode = guestbookMode(owner);
  const rows = mode === 'off' ? [] : q.all('SELECT * FROM guestbook WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100', owner.id);
  const users = {};
  for (const r of rows) if (!users[r.author_id]) users[r.author_id] = publicUser(getUser(r.author_id));
  return {
    mode,
    canWrite: canWrite(owner, req.user.id),
    entries: rows.map((r) => ({ id: r.id, authorId: r.author_id, text: r.text, sticker: r.sticker, createdAt: r.created_at })),
    users,
  };
}));

extras.post('/users/:id/guestbook', wrap((req) => {
  const owner = getUser(req.params.id);
  if (!owner) fail(404, 'Nutzer nicht gefunden');
  if (!canWrite(owner, req.user.id)) fail(403, guestbookMode(owner) === 'off' ? 'Das Gästebuch ist geschlossen' : 'Nur Freunde können hier schreiben');
  const t = text(req.body?.text, 200);
  const sticker = typeof req.body?.sticker === 'string' && /^(builtin:[a-z0-9_]+|\/uploads\/[\w.-]+)$/.test(req.body.sticker) ? req.body.sticker : null;
  if (!t && !sticker) fail(400, 'Schreib etwas Nettes 💌');
  const since = Date.now() - 86_400_000;
  if (q.get('SELECT COUNT(*) AS n FROM guestbook WHERE owner_id = ? AND author_id = ? AND created_at > ?', owner.id, req.user.id, since).n >= 3) {
    fail(429, 'Du hast heute schon 3 Einträge geschrieben – morgen wieder ✨');
  }
  const id = newId();
  q.run('INSERT INTO guestbook (id, owner_id, author_id, text, sticker, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, owner.id, req.user.id, t, sticker, Date.now());
  const entry = { id, authorId: req.user.id, text: t, sticker, createdAt: Date.now() };
  emitToUser(owner.id, 'guestbook:new', { entry, user: publicUser(req.user) });
  return entry;
}));

extras.delete('/guestbook/:id', wrap((req) => {
  const e = q.get('SELECT * FROM guestbook WHERE id = ?', req.params.id);
  if (!e || (e.owner_id !== req.user.id && e.author_id !== req.user.id)) fail(404, 'Eintrag nicht gefunden');
  q.run('DELETE FROM guestbook WHERE id = ?', e.id);
  return { ok: true };
}));

extras.put('/me/guestbook', wrap((req) => {
  const mode = ['friends', 'everyone', 'off'].includes(req.body?.mode) ? req.body.mode : 'friends';
  const privacy = { ...json(req.user.privacy, {}), guestbook: mode };
  q.run('UPDATE users SET privacy = ? WHERE id = ?', JSON.stringify(privacy), req.user.id);
  refresh(req.user.id);
  return { mode };
}));
