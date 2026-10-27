import { q } from './db.js';

export function getMember(serverId, userId) {
  return q.get('SELECT * FROM members WHERE server_id = ? AND user_id = ?', serverId, userId) || null;
}

export function isAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

export function isDmMember(channelId, userId) {
  return !!q.get('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?', channelId, userId);
}

export function dmMemberIds(channelId) {
  return q.all('SELECT user_id FROM dm_members WHERE channel_id = ?', channelId).map((r) => r.user_id);
}

/** Liefert den Kanal, wenn der Nutzer Zugriff hat – sonst null. */
export function channelForUser(channelId, userId) {
  const ch = q.get('SELECT * FROM channels WHERE id = ?', channelId);
  if (!ch) return null;
  if (ch.server_id) {
    const m = getMember(ch.server_id, userId);
    if (!m) return null;
    ch.member = m;
    return ch;
  }
  return isDmMember(ch.id, userId) ? ch : null;
}

export function relationship(userId, targetId) {
  return q.get('SELECT type FROM relationships WHERE user_id = ? AND target_id = ?', userId, targetId)?.type || 0;
}

export function friendIds(userId) {
  return q.all('SELECT target_id FROM relationships WHERE user_id = ? AND type = 1', userId).map((r) => r.target_id);
}

export function serverIdsOf(userId) {
  return q.all('SELECT server_id FROM members WHERE user_id = ?', userId).map((r) => r.server_id);
}
