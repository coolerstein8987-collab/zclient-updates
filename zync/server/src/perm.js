// Server-Berechtigungen (Bitmaske) – Besitzer und Admins haben immer alle Rechte.
import { q } from './db.js';
import { getMember } from './access.js';

export const PERMS = {
  ADMIN: 1,
  MANAGE_SERVER: 2,
  MANAGE_CHANNELS: 4,
  MANAGE_ROLES: 8,
  KICK: 16,
  MANAGE_MESSAGES: 32,
  MENTION_EVERYONE: 64,
  MANAGE_NICKNAMES: 128,
};
export const ALL_PERMS = Object.values(PERMS).reduce((a, b) => a | b, 0);

export function memberPerms(serverId, userId) {
  const m = getMember(serverId, userId);
  if (!m) return { member: null, perms: 0 };
  if (m.role === 'owner' || m.role === 'admin') return { member: m, perms: ALL_PERMS };
  let perms = 0;
  for (const r of q.all('SELECT r.permissions FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.server_id = ? AND mr.user_id = ?', serverId, userId)) perms |= r.permissions;
  if (perms & PERMS.ADMIN) perms = ALL_PERMS;
  return { member: m, perms };
}

export function hasPerm(serverId, userId, perm) {
  return (memberPerms(serverId, userId).perms & perm) === perm;
}

/** Höchste Rollen-Position eines Mitglieds (Besitzer/Admin = unendlich). */
export function topPosition(serverId, userId) {
  const m = getMember(serverId, userId);
  if (!m) return -1;
  if (m.role === 'owner') return Infinity;
  if (m.role === 'admin') return 1e9;
  return q.get('SELECT COALESCE(MAX(r.position), -1) AS p FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.server_id = ? AND mr.user_id = ?', serverId, userId).p;
}
