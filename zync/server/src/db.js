import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.ZYNC_DATA || path.join(import.meta.dirname, '..', 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'zync.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT,
  avatar_crop TEXT,
  banner TEXT,
  banner_crop TEXT,
  bio TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  style TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'online',
  custom_status TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

-- type: 1 = Freund, 2 = blockiert, 3 = eingehende Anfrage, 4 = ausgehende Anfrage
CREATE TABLE IF NOT EXISTS relationships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_id)
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  icon_crop TEXT,
  banner TEXT,
  banner_crop TEXT,
  description TEXT NOT NULL DEFAULT '',
  accent TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  invite TEXT NOT NULL UNIQUE,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  sticker TEXT,
  reply_to TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'default',
  edited_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS read_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read TEXT NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// ---------- Migrationen (neue Spalten für bestehende Datenbanken) ----------
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('users', 'widgets', "TEXT NOT NULL DEFAULT '[]'");
addColumn('users', 'points', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'owned', "TEXT NOT NULL DEFAULT '[]'");
addColumn('users', 'tag_server', 'TEXT');
addColumn('users', 'activity', 'TEXT');
addColumn('users', 'voice_seconds', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'msg_count', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'best_streak', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'quests_done', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'stories_posted', 'INTEGER NOT NULL DEFAULT 0');
addColumn('servers', 'tag', 'TEXT');
addColumn('servers', 'tag_emoji', 'TEXT');
addColumn('servers', 'tag_color', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  permissions INTEGER NOT NULL DEFAULT 0,
  hoist INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS member_roles (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id)
);
CREATE TABLE IF NOT EXISTS streaks (
  channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_day TEXT,
  days TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  media TEXT,
  media_type TEXT,
  text TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT '{}',
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, expires_at);
CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);
CREATE TABLE IF NOT EXISTS quests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  quest TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, quest)
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playtime (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);
CREATE TABLE IF NOT EXISTS sounds (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🔊',
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Sortierbare IDs (Zeit + Sequenz, base36, feste Länge) – lexikographisch == chronologisch.
const EPOCH = 1735689600000; // 2025-01-01
let lastMs = 0;
let seq = 0;
export function newId() {
  let ms = Date.now() - EPOCH;
  if (ms <= lastMs) {
    seq += 1;
    if (seq >= 1024) { lastMs += 1; seq = 0; }
    ms = lastMs;
  } else {
    lastMs = ms;
    seq = 0;
  }
  return (ms * 1024 + seq).toString(36).padStart(11, '0');
}

export const q = {
  get: (sql, ...args) => db.prepare(sql).get(...args),
  all: (sql, ...args) => db.prepare(sql).all(...args),
  run: (sql, ...args) => db.prepare(sql).run(...args),
};

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const json = (s, fallback) => {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

export function serializeServer(s) {
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    iconCrop: json(s.icon_crop, null),
    banner: s.banner,
    bannerCrop: json(s.banner_crop, null),
    description: s.description,
    accent: s.accent,
    ownerId: s.owner_id,
    invite: s.invite,
    isPublic: !!s.is_public,
    tag: s.tag ? { text: s.tag, emoji: s.tag_emoji || '', color: s.tag_color || '#7c5cff' } : null,
    createdAt: s.created_at,
  };
}

export function serializeChannel(c) {
  return {
    id: c.id,
    serverId: c.server_id,
    type: c.type,
    name: c.name,
    topic: c.topic,
    category: c.category,
    position: c.position,
    createdAt: c.created_at,
  };
}

export function serializeMember(m, roles) {
  const ids = roles ?? q.all('SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?', m.server_id, m.user_id).map((r) => r.role_id);
  return { userId: m.user_id, serverId: m.server_id, nickname: m.nickname, role: m.role, joinedAt: m.joined_at, roles: ids };
}

export function serializeRole(r) {
  return { id: r.id, serverId: r.server_id, name: r.name, color: r.color, icon: r.icon, position: r.position, permissions: r.permissions, hoist: !!r.hoist };
}

export function serializeMessages(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const reacts = q.all(`SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${ph}) ORDER BY created_at`, ...ids);
  const byMsg = new Map();
  for (const r of reacts) {
    if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, new Map());
    const m = byMsg.get(r.message_id);
    if (!m.has(r.emoji)) m.set(r.emoji, []);
    m.get(r.emoji).push(r.user_id);
  }
  const replyIds = [...new Set(rows.map((r) => r.reply_to).filter(Boolean))];
  const replies = new Map();
  if (replyIds.length) {
    const rp = replyIds.map(() => '?').join(',');
    for (const r of q.all(`SELECT id, author_id, content, attachments, sticker FROM messages WHERE id IN (${rp})`, ...replyIds)) {
      replies.set(r.id, {
        id: r.id,
        authorId: r.author_id,
        content: r.content.slice(0, 200),
        hasAttachments: json(r.attachments, []).length > 0 || !!r.sticker,
      });
    }
  }
  return rows.map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    authorId: r.author_id,
    content: r.content,
    attachments: json(r.attachments, []),
    sticker: r.sticker,
    replyTo: r.reply_to ? (replies.get(r.reply_to) || { id: r.reply_to, deleted: true }) : null,
    pinned: !!r.pinned,
    type: r.type,
    editedAt: r.edited_at,
    createdAt: r.created_at,
    reactions: [...(byMsg.get(r.id) || new Map())].map(([emoji, users]) => ({ emoji, users })),
  }));
}
