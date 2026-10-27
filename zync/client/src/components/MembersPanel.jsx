import { useMemo } from 'react';
import { Crown, Shield, MessageCircle, UserMinus, ShieldPlus, ShieldMinus, Pencil } from 'lucide-react';
import { useStore, openPopout, openMenu, openDmWith, run, openModal } from '../lib/store.js';
import { api } from '../lib/api.js';
import { isAdminRole } from '../lib/perm.js';
import { Avatar, NameTag } from './Avatar.jsx';
import { cx } from '../lib/format.js';

export function memberMenu(e, serverId, userId) {
  const s = useStore.getState();
  const server = s.servers[serverId];
  const me = server?.members[s.me.id];
  const target = server?.members[userId];
  if (!server || !target) return;
  const isMe = userId === s.me.id;
  const canKick = !isMe && target.role !== 'owner' && (me.role === 'owner' || (me.role === 'admin' && target.role === 'member'));
  openMenu(e, [
    { label: 'Profil', icon: <Avatar userId={userId} size={18} decoration={false} />, onClick: () => openPopout(userId, e, serverId) },
    !isMe && { label: 'Nachricht', icon: <MessageCircle size={16} />, onClick: () => openDmWith(userId) },
    (isMe || isAdminRole(me.role)) && { label: 'Spitzname ändern', icon: <Pencil size={16} />, onClick: () => openModal('nickname', { serverId, userId }) },
    me.role === 'owner' && !isMe && target.role === 'member' && { label: 'Zum Admin machen', icon: <ShieldPlus size={16} />, onClick: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { role: 'admin' } }), 'Ist jetzt Admin') },
    me.role === 'owner' && !isMe && target.role === 'admin' && { label: 'Admin entfernen', icon: <ShieldMinus size={16} />, onClick: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { role: 'member' } }), 'Admin-Rechte entfernt') },
    me.role === 'owner' && !isMe && { label: 'Besitz übertragen', icon: <Crown size={16} />, onClick: () => openModal('confirm', { title: 'Server übertragen?', text: `Du wirst Admin und ${s.users[userId]?.displayName} wird Besitzer. Das kannst du nicht selbst rückgängig machen.`, confirm: 'Übertragen', danger: true, onConfirm: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'PATCH', body: { role: 'owner' } }), 'Server übertragen') }) },
    canKick && { divider: true },
    canKick && { label: 'Vom Server entfernen', icon: <UserMinus size={16} />, danger: true, onClick: () => openModal('confirm', { title: 'Mitglied entfernen', text: `${s.users[userId]?.displayName} wird vom Server entfernt und kann nur mit neuer Einladung zurück.`, confirm: 'Entfernen', danger: true, onConfirm: () => run(() => api(`/servers/${serverId}/members/${userId}`, { method: 'DELETE' }), 'Mitglied entfernt') }) },
  ].filter(Boolean));
}

function MemberRow({ userId, serverId, role, offline }) {
  const customStatus = useStore((s) => s.users[userId]?.customStatus);
  return (
    <button
      type="button"
      className={cx('member-row', offline && 'offline')}
      onClick={(e) => openPopout(userId, e, serverId)}
      onContextMenu={(e) => memberMenu(e, serverId, userId)}
    >
      <Avatar userId={userId} size={34} showStatus />
      <div className="mr-text">
        <div className="mr-name">
          <NameTag userId={userId} serverId={serverId} />
          {role === 'owner' && <Crown size={13} className="role-ico owner" />}
          {role === 'admin' && <Shield size={13} className="role-ico admin" />}
        </div>
        {customStatus && <div className="mr-status">{customStatus}</div>}
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
    const members = Object.values(server.members);
    const sortName = (a, b) => (users[a.userId]?.displayName || '').localeCompare(users[b.userId]?.displayName || '');
    const isOn = (m) => presences[m.userId] && presences[m.userId] !== 'offline';
    const online = members.filter(isOn);
    const offline = members.filter((m) => !isOn(m)).sort(sortName);
    return [
      { id: 'owner', title: 'Besitzer', list: online.filter((m) => m.role === 'owner') },
      { id: 'admin', title: 'Admins', list: online.filter((m) => m.role === 'admin').sort(sortName) },
      { id: 'online', title: 'Online', list: online.filter((m) => m.role === 'member').sort(sortName) },
      { id: 'offline', title: 'Offline', list: offline, offline: true },
    ].filter((g) => g.list.length);
  }, [server, presences, users]);
  if (!server) return null;
  return (
    <aside className="side-panel members-panel">
      <div className="sp-scroll">
        {groups.map((g) => (
          <div key={g.id} className="member-group">
            <div className="mg-title">{g.title} — {g.list.length}</div>
            {g.list.map((m) => <MemberRow key={m.userId} userId={m.userId} serverId={serverId} role={m.role} offline={g.offline} />)}
          </div>
        ))}
      </div>
    </aside>
  );
}
