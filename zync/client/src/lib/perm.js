export const isAdminRole = (role) => role === 'owner' || role === 'admin';

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

export const PERM_INFO = [
  { bit: PERMS.ADMIN, name: 'Administrator', desc: 'Alle Rechte – mit Vorsicht vergeben!' },
  { bit: PERMS.MANAGE_SERVER, name: 'Server verwalten', desc: 'Name, Icon, Banner, Tag und Einladungen ändern' },
  { bit: PERMS.MANAGE_CHANNELS, name: 'Kanäle verwalten', desc: 'Kanäle erstellen, bearbeiten und löschen' },
  { bit: PERMS.MANAGE_ROLES, name: 'Rollen verwalten', desc: 'Rollen unter der eigenen erstellen und vergeben' },
  { bit: PERMS.KICK, name: 'Mitglieder entfernen', desc: 'Mitglieder mit niedrigerer Rolle kicken' },
  { bit: PERMS.MANAGE_MESSAGES, name: 'Nachrichten verwalten', desc: 'Fremde Nachrichten löschen und anpinnen' },
  { bit: PERMS.MENTION_EVERYONE, name: '@everyone erwähnen', desc: 'Alle Mitglieder auf einmal benachrichtigen' },
  { bit: PERMS.MANAGE_NICKNAMES, name: 'Spitznamen verwalten', desc: 'Spitznamen anderer Mitglieder ändern' },
];

/** Rechte eines Mitglieds (Client-Spiegel der Server-Logik – nur für die Anzeige). */
export function permsOf(state, serverId, userId) {
  const srv = state.servers[serverId];
  const m = srv?.members[userId];
  if (!m) return 0;
  if (isAdminRole(m.role)) return ALL_PERMS;
  let p = 0;
  for (const id of m.roles || []) p |= srv.roles?.[id]?.permissions || 0;
  return p & PERMS.ADMIN ? ALL_PERMS : p;
}

export const can = (state, serverId, perm) => (permsOf(state, serverId, state.me?.id) & perm) === perm;
