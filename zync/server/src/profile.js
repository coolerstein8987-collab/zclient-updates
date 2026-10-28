// Öffentliche Profil-Daten eines Nutzers (inkl. Widgets, Server-Tag, Badges, Claim).
import { q, json } from './db.js';
import { relationship } from './access.js';
import { topBadges, ownedIds } from './progress.js';
import { minuteOfDay } from './config.js';
import { birthdayToday } from './extras.js';

export function inWindow(startMin, endMin, now = minuteOfDay()) {
  if (startMin === endMin) return true;
  return startMin < endMin ? now >= startMin && now < endMin : now >= startMin || now < endMin;
}

export function activeClaimOf(userId) {
  return q.get(`SELECT * FROM claims WHERE status = 'active' AND (from_id = ? OR to_id = ?)`, userId, userId) || null;
}

/** Mini-Profil für Verweise (Claim-Partner, verlinkte Freunde), damit auch Fremde Name & Bild sehen. */
export function miniUser(id) {
  const u = q.get('SELECT id, username, display_name, avatar, avatar_crop, style FROM users WHERE id = ?', id);
  if (!u) return null;
  const st = json(u.style, {});
  return { id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, avatarCrop: json(u.avatar_crop, null), style: { accent1: st.accent1, accent2: st.accent2, decoration: st.decoration } };
}

export function serializeClaim(c) {
  return {
    id: c.id, fromId: c.from_id, toId: c.to_id, start: c.start_min, end: c.end_min, note: c.note, status: c.status,
    active: c.status === 'active' && inWindow(c.start_min, c.end_min), createdAt: c.created_at,
    users: { [c.from_id]: miniUser(c.from_id), [c.to_id]: miniUser(c.to_id) },
  };
}

function tagOf(u) {
  if (!u.tag_server) return null;
  const s = q.get('SELECT s.id, s.name, s.icon, s.icon_crop, s.tag, s.tag_emoji, s.tag_color FROM servers s JOIN members m ON m.server_id = s.id WHERE s.id = ? AND m.user_id = ?', u.tag_server, u.id);
  if (!s?.tag) return null;
  return { serverId: s.id, text: s.tag, emoji: s.tag_emoji || '', color: s.tag_color || '#7c5cff', serverName: s.name, icon: s.icon, iconCrop: json(s.icon_crop, null) };
}

function widgetsOf(u) {
  return json(u.widgets, []).map((w) => (w.type === 'people'
    ? { ...w, items: (w.items || []).filter((it) => relationship(u.id, it.userId) === 1).map((it) => ({ ...it, user: miniUser(it.userId) })) }
    : w));
}

function bioLinksOf(u) {
  const names = [...new Set([...(u.bio || '').matchAll(/@([a-z0-9_.]{2,32})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 20);
  const links = {};
  for (const name of names) {
    const t = q.get('SELECT id FROM users WHERE username = ?', name);
    if (t && relationship(u.id, t.id) === 1) links[name] = t.id;
  }
  return links;
}

export function publicUser(u) {
  if (!u) return null;
  const claim = activeClaimOf(u.id);
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    ...(u.bot ? { bot: true } : {}),
    avatar: u.avatar,
    avatarCrop: json(u.avatar_crop, null),
    banner: u.banner,
    bannerCrop: json(u.banner_crop, null),
    bio: u.bio,
    pronouns: u.pronouns,
    tags: json(u.tags, []),
    style: json(u.style, {}),
    customStatus: u.custom_status,
    widgets: widgetsOf(u),
    bioLinks: bioLinksOf(u),
    serverTag: tagOf(u),
    activity: json(u.activity, null),
    badges: topBadges(u),
    claim: claim ? serializeClaim(claim) : null,
    song: json(u.song, null),
    ...(birthdayToday(u) ? { birthdayToday: true } : {}),
    createdAt: u.created_at,
  };
}

export function selfUser(u) {
  return {
    ...publicUser(u),
    status: u.status,
    privacy: json(u.privacy, {}),
    points: u.points,
    owned: [...ownedIds(u)],
    tagServer: u.tag_server,
    hasPassword: u.password !== '!',
    birthday: json(u.birthday, null),
    discordLinked: !!u.discord_id,
  };
}
