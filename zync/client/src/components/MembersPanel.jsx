import { useMemo } from 'react';
import { Crown, Shield, MessageCircle, UserMinus, ShieldPlus, ShieldMinus, Pencil, Tags, Lock } from 'lucide-react';
import { useStore, openPopout, openMenu, openDmWith, run, openModal, memberRoles } from '../lib/store.js';
import { api } from '../lib/api.js';
import { PERMS, permsOf } from '../lib/perm.js';
import { Avatar, NameTag } from './Avatar.jsx';
import { ServerTagChip, ActivityLine } from './Social.jsx';
import { cx } from '../lib/format.js';

export function memberMenu(e, serverId, userId) {
  const s = useStore.getState();
  const server = s.servers[serverId];
  const me = server?.members[s.me.id];
  const target = server?.members[userId];
  if (!server || !target) return;
  const isMe = userId === s.me.id;
  const perms = permsOf(s, serverId, s.me.id);
  const canKick = !isMe && target.role !== 'owner' && !!(perms & PERMS.KICK) && (me.role === 'owner' || target.role === 'member');
  const friend = s.relationships[userId]?.type === 1;
  openMenu(e, [
    { label: 'Profil', icon: <Avatar userId={userId} size={18} decoration={false} />, onClick: () => openPopout(userId, e, serverId) },
    !isMe && { label: 'Nachricht', icon: <MessageCircle size={16} />, onClick: () => openDmWith(userId) },
    !isMe && friend && { label: 'Claimen …', icon: <Lock size={16} />, onClick: () => openModal('claim', { userId }) },
    (isMe || perms & PERMS.MANAGE_NICKNAMES) && { label: 'Spitzname ändern', icon: <Pencil size={16} />, onClick: () => openModal('nickname', { serverId, userId }) },
    !!(perms & PERMS.MANAGE_ROLES) && Object.keys(server.roles || {}).length > 0 && { label: 'Rollen verwalten', icon: <Tags size={16} />, onClick: () => openModal('memberRoles', { serverId, userId }) },
    me.role === 'owner' && !isMe && target.role === 'member' && { label: 'Zum Admin machen', icon: <ShieldPlus size={16} />, onClick: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { role: 'admin' } }), 'Ist jetzt Admin') },
    me.role === 'owner' && !isMe && target.role === 'admin' && { label: 'Admin entfernen', icon: <ShieldMinus size={16} />, onClick: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { role: 'member' } }), 'Admin-Rechte entfernt') },
    me.role === 'owner' && !isMe && { label: 'Besitz übertragen', icon: <Crown size={16} />, onClick: () => openModal('confirm', { title: 'Server übertragen?', text: `Du wirst Admin und ${s.users[userId]?.displayName} wird Besitzer. Das kannst du nicht selbst rückgängig machen.`, confirm: 'Übertragen', danger: true, onConfirm: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { role: 'owner' } }), 'Server übertragen') }) },
    canKick && { divider: true },
    canKick && { label: 'Vom Server entfernen', icon: <UserMinus size={16} />, danger: true, onClick: () => openModal('confirm', { title: 'Mitglied entfernen', text: `${s.users[userId]?.displayName} wird vom Server entfernt und kann nur mit neuer Einladung zurück.`, confirm: 'Entfernen', danger: true, onConfirm: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'DELETE' }), 'Mitglied entfernt') }) },
  ].filter(Boolean));
}

function MemberRow({ userId, serverId, role, offline }) {
  const user = useStore((s) => s.users[userId]);
  const plate = user?.style?.nameplate;
  return (
    <button
      type="button"
      className={cx('member-row', offline && 'offline', plate && `np np-${plate}`)}
      onClick={(e) => openPopout(userId, e, serverId)}
      onContextMenu={(e) => memberMenu(e, serverId, userId)}
    >
      <Avatar userId={userId} size={34} showStatus />
      <div className="mr-text">
        <div className="mr-name">
          <NameTag userId={userId} serverId={serverId} />
          {user?.serverTag && <ServerTagChip tag={user.serverTag} className="sm" interactive={false} />}
          {role === 'owner' && <Crown size={13} className="role-ico owner" />}
          {role === 'admin' && <Shield size={13} className="role-ico admin" />}
        </div>
        {user?.activity?.name ? <div className="mr-status"><ActivityLine activity={user.activity} short /></div>
          : user?.customStatus && <div className="mr-status">{user.customStatus}</div>}
      </div>
    </button>
  );
}

export function MembersPanel({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const presences = useStore((s) => s.presences);
  const users = useStore((s) => s.users);
  const groups = useMemo(() => {
    if (!server) return [];
    const st = { servers: { [serverId]: server } };
    const members = Object.values(server.members);
    const sortName = (a, b) => (users[a.userId]?.displayName || '').localeCompare(users[b.userId]?.displayName || '');
    const isOn = (m) => presences[m.userId] && presences[m.userId] !== 'offline';
    const hoisted = Object.values(server.roles || {}).filter((r) => r.hoist).sort((a, b) => b.position - a.position);
    const used = new Set();
    const out = [];
    const online = members.filter(isOn);
    const owner = online.filter((m) => m.role === 'owner');
    owner.forEach((m) => used.add(m.userId));
    if (owner.length) out.push({ id: 'owner', title: 'Besitzer', list: owner });
    for (const r of hoisted) {
      const list = online.filter((m) => !used.has(m.userId) && memberRoles(st, serverId, m.userId).find((x) => x.hoist)?.id === r.id).sort(sortName);
      list.forEach((m) => used.add(m.userId));
      if (list.length) out.push({ id: r.id, title: `${r.icon ? `${r.icon} ` : ''}${r.name}`, color: r.color, list });
    }
    const admins = online.filter((m) => !used.has(m.userId) && m.role === 'admin').sort(sortName);
    admins.forEach((m) => used.add(m.userId));
    if (admins.length) out.push({ id: 'admin', title: 'Admins', list: admins });
    const rest = online.filter((m) => !used.has(m.userId)).sort(sortName);
    if (rest.length) out.push({ id: 'online', title: 'Online', list: rest });
    const offline = members.filter((m) => !isOn(m)).sort(sortName);
    if (offline.length) out.push({ id: 'offline', title: 'Offline', list: offline, offline: true });
    return out;
  }, [server, presences, users, serverId]);
  if (!server) return null;
  return (
    <aside className="side-panel members-panel">
      <div className="sp-scroll">
        {groups.map((g) => (
          <div key={g.id} className="member-group">
            <div className="mg-title" style={g.color ? { color: g.color } : undefined}>{g.title} — {g.list.length}</div>
            {g.list.map((m) => <MemberRow key={m.userId} userId={m.userId} serverId={serverId} role={m.role} offline={g.offline} />)}
          </div>
        ))}
      </div>
    </aside>
  );
}
