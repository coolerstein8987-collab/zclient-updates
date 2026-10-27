import { useMemo, useState } from 'react';
import {
  Plus, Compass, Users, Hash, Volume2, ChevronDown, ChevronRight, Settings, UserPlus, LogOut, FolderPlus, X, Mic, MicOff,
  Headphones, HeadphoneOff, PhoneOff, Video, ScreenShare, Search, Bell, Pencil, Copy, Link, Signal, MessageSquarePlus, Trash2, CheckCheck,
} from 'lucide-react';
import {
  useStore, openHome, openServer, openChannel, openDm, openDiscover, openModal, openSettings, openMenu, openPopout,
  isUnread, serverChannels, dmList, dmPartner, run, toast, ack,
} from '../lib/store.js';
import { useSettings, setSetting } from '../lib/settings.js';
import { useVoice, voice } from '../lib/voice.js';
import { api } from '../lib/api.js';
import { isAdminRole } from '../lib/perm.js';
import { cx, STATUS_LABEL, copyText } from '../lib/format.js';
import { Avatar, ServerIcon, NameTag, CroppedImage } from './Avatar.jsx';
import { Logo } from './Logo.jsx';

// ---------- Server-Leiste ----------
function RailItem({ active, unread, mentions, tip, onClick, onContextMenu, children, className }) {
  return (
    <div className={cx('rail-item', active && 'active', unread && 'unread', className)}>
      <span className="rail-pill" />
      <button type="button" className="rail-btn" onClick={onClick} onContextMenu={onContextMenu} data-tip={tip} data-tip-side="right">
        {children}
      </button>
      {mentions > 0 && <span className="badge-count">{mentions > 99 ? '99+' : mentions}</span>}
    </div>
  );
}

export function ServerRail() {
  const view = useStore((s) => s.view);
  const order = useStore((s) => s.serverOrder);
  const servers = useStore((s) => s.servers);
  const channels = useStore((s) => s.channels);
  const lastMessages = useStore((s) => s.lastMessages);
  const readStates = useStore((s) => s.readStates);
  const mentions = useStore((s) => s.mentions);
  const pending = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 3).length);
  const appIcon = useSettings((s) => s.appIcon);
  const st = { lastMessages, readStates };
  const unreadDms = useMemo(() => Object.values(channels).filter((c) => c.type === 'dm' && (mentions[c.id] || 0) > 0), [channels, mentions]);

  const serverMenu = (e, srv) => {
    const me = useStore.getState().me;
    const role = srv.members[me.id]?.role;
    openMenu(e, [
      { label: 'Als gelesen markieren', icon: <CheckCheck size={16} />, onClick: () => serverChannels(useStore.getState(), srv.id).forEach((c) => ack(c.id)) },
      { label: 'Leute einladen', icon: <UserPlus size={16} />, onClick: () => openModal('invite', { serverId: srv.id }) },
      isAdminRole(role) && { label: 'Servereinstellungen', icon: <Settings size={16} />, onClick: () => openModal('serverSettings', { serverId: srv.id }) },
      { label: 'Server-ID kopieren', icon: <Copy size={16} />, onClick: () => copyText(srv.id) },
      role !== 'owner' && { divider: true },
      role !== 'owner' && { label: 'Server verlassen', icon: <LogOut size={16} />, danger: true, onClick: () => openModal('confirm', { title: `${srv.name} verlassen?`, text: 'Du kannst nur mit einer neuen Einladung zurückkehren.', confirm: 'Verlassen', danger: true, onConfirm: () => run(() => api(`/servers/${srv.id}/leave`, { method: 'POST' }), 'Server verlassen') }) },
    ].filter(Boolean));
  };

  return (
    <nav className="server-rail" aria-label="Server">
      <RailItem active={!view.serverId} tip="Direktnachrichten" onClick={openHome} mentions={pending} className="home">
        <Logo variant={appIcon} size={48} />
      </RailItem>
      {unreadDms.map((c) => (
        <RailItem key={c.id} tip={dmPartner(useStore.getState(), c)?.displayName} onClick={() => openDm(c.id)} mentions={mentions[c.id]} unread>
          <Avatar userId={c.recipients?.[0]} size={48} decoration={false} />
        </RailItem>
      ))}
      <div className="rail-sep" />
      <div className="rail-scroll">
        {order.map((id) => {
          const srv = servers[id];
          if (!srv) return null;
          const chs = Object.values(channels).filter((c) => c.serverId === id && c.type === 'text');
          const unread = chs.some((c) => isUnread(st, c.id));
          const m = chs.reduce((n, c) => n + (mentions[c.id] || 0), 0);
          return (
            <RailItem key={id} active={view.serverId === id} unread={unread} mentions={m} tip={srv.name} onClick={() => openServer(id)} onContextMenu={(e) => serverMenu(e, srv)}>
              <ServerIcon server={srv} size={48} />
            </RailItem>
          );
        })}
        <RailItem tip="Server hinzufügen" onClick={() => openModal('createServer')} className="action">
          <Plus size={24} />
        </RailItem>
        <RailItem tip="Server entdecken" active={view.serverId === 'discover'} onClick={openDiscover} className="action">
          <Compass size={24} />
        </RailItem>
      </div>
    </nav>
  );
}

// ---------- Unten: Voice-Panel + Benutzer ----------
function VoicePanel() {
  const v = useVoice();
  const channel = useStore((s) => s.channels[v.channelId]);
  const server = useStore((s) => (channel?.serverId ? s.servers[channel.serverId] : null));
  const partner = useStore((s) => (channel?.type === 'dm' ? dmPartner(s, channel) : null));
  if (!v.channelId) return null;
  const states = Object.values(v.peerStates);
  const bad = states.some((s) => s === 'failed' || s === 'disconnected');
  const goto = () => (channel?.serverId ? openChannel(channel.serverId, channel.id) : openDm(channel.id));
  return (
    <div className="voice-panel">
      <div className="vp-row">
        <div className="vp-info" onClick={goto} role="button" tabIndex={0}>
          <div className={cx('vp-status', v.status !== 'connected' ? 'connecting' : bad ? 'bad' : 'ok')}>
            <Signal size={15} /> {v.status !== 'connected' ? 'Verbinde…' : bad ? 'Verbindungsprobleme' : 'Sprachverbindung aktiv'}
          </div>
          <div className="vp-where">{channel?.type === 'dm' ? `Anruf mit ${partner?.displayName || '…'}` : `${channel?.name} / ${server?.name}`}</div>
        </div>
        <button type="button" className="icon-btn" data-tip="Trennen" onClick={() => voice.leave()}><PhoneOff size={18} /></button>
      </div>
      <div className="vp-actions">
        <button type="button" className={cx('vp-btn', v.video && 'on')} onClick={() => voice.toggleVideo()}><Video size={18} /> Kamera</button>
        {navigator.mediaDevices?.getDisplayMedia && <button type="button" className={cx('vp-btn', v.screen && 'on')} onClick={() => { if (v.screen) voice.stopScreen(); else { goto(); } }}><ScreenShare size={18} /> {v.screen ? 'Live' : 'Stream'}</button>}
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  { id: 'online', desc: '' },
  { id: 'idle', desc: '' },
  { id: 'dnd', desc: 'Du erhältst keine Benachrichtigungen' },
  { id: 'invisible', desc: 'Du wirst als offline angezeigt' },
];

export function UserPanel() {
  const me = useStore((s) => s.me);
  const v = useVoice();
  const statusMenu = (e) => openMenu(e, [
    ...STATUS_OPTIONS.map((o) => ({
      label: STATUS_LABEL[o.id],
      hint: o.desc,
      icon: <span className={`status-dot inline st-${o.id === 'invisible' ? 'offline' : o.id}`} />,
      onClick: () => run(() => api('/me', { method: 'PATCH', body: { status: o.id } })),
    })),
    { divider: true },
    { label: me.customStatus ? 'Status-Text ändern' : 'Status-Text festlegen', icon: <Pencil size={16} />, onClick: () => openModal('customStatus') },
    { label: 'Profil bearbeiten', icon: <Settings size={16} />, onClick: () => openSettings('profile') },
    { label: 'Benutzernamen kopieren', icon: <Copy size={16} />, onClick: () => { copyText(me.username); toast('Kopiert!', 'success'); } },
  ]);
  return (
    <div className="user-panel-wrap">
      <VoicePanel />
      <div className="user-panel">
        <button type="button" className="up-me" onClick={statusMenu}>
          <Avatar userId={me.id} size={36} showStatus status={me.status === 'invisible' ? 'offline' : me.status} />
          <div className="up-text">
            <div className="up-name">{me.displayName}</div>
            <div className="up-sub">{me.customStatus || STATUS_LABEL[me.status]}</div>
          </div>
        </button>
        <button type="button" className={cx('icon-btn', (v.muted || v.noMic) && 'danger-on')} data-tip={v.muted ? 'Stummschaltung aufheben' : 'Stummschalten'} onClick={() => voice.toggleMute()}>
          {v.muted || v.noMic ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        <button type="button" className={cx('icon-btn', v.deafened && 'danger-on')} data-tip={v.deafened ? 'Ton an' : 'Ton aus'} onClick={() => voice.toggleDeafen()}>
          {v.deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
        </button>
        <button type="button" className="icon-btn" data-tip="Einstellungen" onClick={() => openSettings('account')}><Settings size={19} /></button>
      </div>
    </div>
  );
}

// ---------- Home-Seitenleiste (DMs) ----------
export function HomeSidebar() {
  const view = useStore((s) => s.view);
  const channels = useStore((s) => s.channels);
  const lastMessages = useStore((s) => s.lastMessages);
  const readStates = useStore((s) => s.readStates);
  const mentions = useStore((s) => s.mentions);
  const users = useStore((s) => s.users);
  const pending = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 3).length);
  const hidden = useSettings((s) => s.hiddenDms);
  const dms = useMemo(() => dmList({ channels, lastMessages }), [channels, lastMessages]).filter((c) => !hidden.includes(c.id) || c.id === view.channelId || (mentions[c.id] || 0) > 0);
  const st = { lastMessages, readStates };
  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <button type="button" className="search-trigger" onClick={() => useStore.setState({ switcherOpen: true })}>
          <Search size={15} /> Unterhaltung finden
        </button>
      </div>
      <div className="sidebar-scroll">
        <button type="button" className={cx('nav-item big', !view.serverId && !view.channelId && 'active')} onClick={() => { openHome(); if (useStore.getState().isMobile) useStore.setState({ mobileTab: 'friends' }); }}>
          <Users size={22} /> Freunde
          {pending > 0 && <span className="badge-count inline">{pending}</span>}
        </button>
        <button type="button" className={cx('nav-item big', view.serverId === 'discover' && 'active')} onClick={openDiscover}>
          <Compass size={22} /> Entdecken
        </button>
        <div className="section-title">
          <span>Direktnachrichten</span>
          <button type="button" className="icon-btn xs" data-tip="Neue Nachricht" onClick={() => openModal('newDm')}><MessageSquarePlus size={16} /></button>
        </div>
        {dms.length === 0 && <div className="sidebar-empty">Noch keine Unterhaltungen. Füge Freunde hinzu und schreib ihnen! ✌️</div>}
        {dms.map((c) => {
          const uid = c.recipients?.[0];
          const u = users[uid];
          const unread = isUnread(st, c.id) && (mentions[c.id] || 0) > 0;
          return (
            <div key={c.id} className={cx('dm-item', view.channelId === c.id && 'active', unread && 'unread')}>
              <button type="button" className="dm-main" onClick={() => openDm(c.id)} onContextMenu={(e) => openMenu(e, [
                { label: 'Profil', onClick: () => openPopout(uid, e) },
                { label: 'Als gelesen markieren', icon: <CheckCheck size={16} />, onClick: () => ack(c.id) },
                { label: 'Unterhaltung schließen', icon: <X size={16} />, onClick: () => setSetting((s) => ({ hiddenDms: [...s.hiddenDms, c.id] })) },
              ])}>
                <Avatar userId={uid} size={34} showStatus />
                <div className="dm-text">
                  <NameTag userId={uid} className="dm-name" />
                  {u?.customStatus && <div className="dm-sub">{u.customStatus}</div>}
                </div>
                {(mentions[c.id] || 0) > 0 && <span className="badge-count inline">{mentions[c.id]}</span>}
              </button>
              <button type="button" className="dm-close" aria-label="Schließen" onClick={() => { setSetting((s) => ({ hiddenDms: [...s.hiddenDms, c.id] })); if (view.channelId === c.id) openHome(); }}><X size={14} /></button>
            </div>
          );
        })}
      </div>
      <UserPanel />
    </div>
  );
}

// ---------- Server-Seitenleiste ----------
function VoiceUsers({ channelId, serverId }) {
  const room = useStore((s) => s.voice[channelId]);
  const speaking = useVoice((s) => s.speaking);
  if (!room) return null;
  return (
    <div className="voice-users">
      {Object.values(room).sort((a, b) => a.joinedAt - b.joinedAt).map((p) => (
        <button key={p.userId} type="button" className="voice-user" onClick={(e) => openPopout(p.userId, e, serverId)}>
          <Avatar userId={p.userId} size={22} speaking={!!speaking[p.userId]} decoration={false} />
          <NameTag userId={p.userId} serverId={serverId} className="vu-name" />
          <span className="vu-icons">
            {p.screen && <span className="live-pill sm">LIVE</span>}
            {p.video && <Video size={13} />}
            {p.deafened ? <HeadphoneOff size={13} /> : p.muted ? <MicOff size={13} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ServerSidebar({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const channels = useStore((s) => s.channels);
  const view = useStore((s) => s.view);
  const meId = useStore((s) => s.me.id);
  const lastMessages = useStore((s) => s.lastMessages);
  const readStates = useStore((s) => s.readStates);
  const mentions = useStore((s) => s.mentions);
  const collapsed = useSettings((s) => s.collapsed);
  const voiceChannel = useVoice((s) => s.channelId);
  const [menuOpen, setMenuOpen] = useState(false);
  const list = useMemo(() => serverChannels({ channels }, serverId), [channels, serverId]);
  const groups = useMemo(() => {
    const g = [];
    for (const c of list) {
      let grp = g.find((x) => x.name === c.category);
      if (!grp) { grp = { name: c.category, channels: [] }; g.push(grp); }
      grp.channels.push(c);
    }
    return g.sort((a, b) => (a.name === '' ? -1 : b.name === '' ? 1 : 0));
  }, [list]);
  if (!server) return <div className="sidebar" />;
  const role = server.members[meId]?.role;
  const admin = isAdminRole(role);
  const st = { lastMessages, readStates };
  const toggleCat = (name) => setSetting((s) => ({ collapsed: { ...s.collapsed, [`${serverId}:${name}`]: !s.collapsed[`${serverId}:${name}`] } }));

  const headMenu = [
    { label: 'Leute einladen', icon: <UserPlus size={16} />, onClick: () => openModal('invite', { serverId }), accent: true },
    admin && { label: 'Servereinstellungen', icon: <Settings size={16} />, onClick: () => openModal('serverSettings', { serverId }) },
    admin && { label: 'Kanal erstellen', icon: <Plus size={16} />, onClick: () => openModal('channel', { serverId }) },
    admin && { label: 'Kategorie erstellen', icon: <FolderPlus size={16} />, onClick: () => openModal('channel', { serverId, categoryOnly: true }) },
    { label: 'Spitzname ändern', icon: <Pencil size={16} />, onClick: () => openModal('nickname', { serverId, userId: meId }) },
    { label: 'Einladungslink kopieren', icon: <Link size={16} />, onClick: () => { copyText(`${location.origin}/invite/${server.invite}`); toast('Link kopiert!', 'success'); } },
    { label: 'Alles als gelesen markieren', icon: <Bell size={16} />, onClick: () => list.forEach((c) => ack(c.id)) },
    role !== 'owner' && { divider: true },
    role !== 'owner' && { label: 'Server verlassen', icon: <LogOut size={16} />, danger: true, onClick: () => openModal('confirm', { title: `${server.name} verlassen?`, text: 'Du kannst nur mit einer neuen Einladung zurückkehren.', confirm: 'Verlassen', danger: true, onConfirm: () => run(() => api(`/servers/${serverId}/leave`, { method: 'POST' }), 'Server verlassen') }) },
  ].filter(Boolean);

  const channelMenu = (e, c) => openMenu(e, [
    c.type === 'text' && { label: 'Als gelesen markieren', icon: <CheckCheck size={16} />, onClick: () => ack(c.id) },
    { label: 'Kanal-Link kopieren', icon: <Link size={16} />, onClick: () => copyText(`#${c.name}`) },
    admin && { label: 'Kanal bearbeiten', icon: <Pencil size={16} />, onClick: () => openModal('channel', { serverId, channelId: c.id }) },
    admin && { divider: true },
    admin && { label: 'Kanal löschen', icon: <Trash2 size={16} />, danger: true, onClick: () => openModal('confirm', { title: `#${c.name} löschen?`, text: 'Alle Nachrichten in diesem Kanal gehen verloren.', confirm: 'Löschen', danger: true, onConfirm: () => run(() => api(`/channels/${c.id}`, { method: 'DELETE' }), 'Kanal gelöscht') }) },
  ].filter(Boolean));

  return (
    <div className="sidebar">
      <div className={cx('server-head', server.banner && 'has-banner')} style={{ '--srv-accent': server.accent || 'var(--accent)' }}>
        {server.banner && <CroppedImage src={server.banner} crop={server.bannerCrop} aspect={2.5} className="server-banner" />}
        <button type="button" className="server-head-btn" onClick={() => setMenuOpen((o) => !o)}>
          <span className="sh-name">{server.name}</span>
          {menuOpen ? <X size={18} /> : <ChevronDown size={18} />}
        </button>
        {menuOpen && (
          <>
            <div className="sh-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="dropdown">
              {headMenu.map((it, i) => (it.divider ? <div key={i} className="menu-divider" /> : (
                <button key={it.label} type="button" className={cx('menu-item', it.danger && 'danger', it.accent && 'accent')} onClick={() => { setMenuOpen(false); it.onClick(); }}>
                  <span>{it.label}</span>{it.icon}
                </button>
              )))}
            </div>
          </>
        )}
      </div>
      <div className="sidebar-scroll">
        {groups.map((g) => {
          const isCollapsed = collapsed[`${serverId}:${g.name}`];
          return (
            <div key={g.name || '_'} className="channel-group">
              {g.name && (
                <div className="category">
                  <button type="button" onClick={() => toggleCat(g.name)}>
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />} {g.name}
                  </button>
                  {admin && <button type="button" className="icon-btn xs" data-tip="Kanal erstellen" onClick={() => openModal('channel', { serverId, category: g.name })}><Plus size={15} /></button>}
                </div>
              )}
              {g.channels.map((c) => {
                const active = view.channelId === c.id;
                const unread = c.type === 'text' && isUnread(st, c.id);
                if (isCollapsed && !active && !unread && !(c.type === 'voice' && useStore.getState().voice[c.id])) return null;
                return (
                  <div key={c.id}>
                    <div className={cx('channel-item', active && 'active', unread && 'unread', c.type === 'voice' && voiceChannel === c.id && 'connected')}>
                      <button
                        type="button"
                        className="ci-main"
                        onClick={() => {
                          openChannel(serverId, c.id);
                          if (c.type === 'voice' && voiceChannel !== c.id) voice.join(c.id);
                        }}
                        onContextMenu={(e) => channelMenu(e, c)}
                      >
                        {c.type === 'voice' ? <Volume2 size={19} /> : <Hash size={19} />}
                        <span className="ci-name">{c.name}</span>
                        {(mentions[c.id] || 0) > 0 && <span className="badge-count inline">{mentions[c.id]}</span>}
                      </button>
                      {admin && <button type="button" className="ci-gear" aria-label="Kanal bearbeiten" onClick={() => openModal('channel', { serverId, channelId: c.id })}><Settings size={14} /></button>}
                    </div>
                    {c.type === 'voice' && <VoiceUsers channelId={c.id} serverId={serverId} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <UserPanel />
    </div>
  );
}

