import { useMemo, useState } from 'react';
import { Users, MessageCircle, MoreVertical, Check, X, Search, Phone, UserMinus, Ban, Copy, Compass, Volume2, ArrowLeft, Lock } from 'lucide-react';
import { useStore, openDmWith, openMenu, run, toast, openDiscover, dmList, openPopout, openChannel, openModal } from '../lib/store.js';
import { StoryBar } from './Stories.jsx';
import { StreakChip, ClaimRequests, ActivityLine, ServerTagChip } from './Social.jsx';
import { api } from '../lib/api.js';
import { voice } from '../lib/voice.js';
import { cx, STATUS_LABEL, copyText } from '../lib/format.js';
import { Avatar, NameTag, ServerIcon } from './Avatar.jsx';
import { Spinner } from './ui.jsx';
import { BirthdayCalendar } from './Extras.jsx';

const TABS = [
  { id: 'online', label: 'Online' },
  { id: 'all', label: 'Alle' },
  { id: 'pending', label: 'Ausstehend' },
  { id: 'blocked', label: 'Blockiert' },
  { id: 'birthdays', label: '🎂 Geburtstage' },
];

function AddFriend() {
  const me = useStore((s) => s.me);
  const [name, setName] = useState('');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api('/relationships', { method: 'POST', body: { username: name.trim() } });
      setState({ ok: true, text: `Super! Deine Freundschaftsanfrage an @${name.trim().replace(/^@/, '')} wurde gesendet. 🎉` });
      setName('');
    } catch (err) {
      setState({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="add-friend">
      <h2>Freund hinzufügen</h2>
      <p className="muted">Du kannst Freunde über ihren Zync-Benutzernamen hinzufügen.</p>
      <form className={cx('af-input', state && (state.ok ? 'ok' : 'err'))} onSubmit={submit}>
        <span className="af-at">@</span>
        <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setState(null); }} placeholder="benutzername" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="submit" className="btn primary" disabled={!name.trim() || busy}>{busy ? <Spinner size={16} /> : 'Anfrage senden'}</button>
      </form>
      {state && <p className={state.ok ? 'af-ok' : 'af-err'}>{state.text}</p>}
      <div className="af-cards">
        <div className="af-card">
          <h4>Dein Benutzername</h4>
          <button type="button" className="af-me" onClick={() => { copyText(me.username); toast('Benutzername kopiert!', 'success'); }}>
            @{me.username} <Copy size={14} />
          </button>
          <p className="muted">Schick ihn deinen Freunden, damit sie dich finden.</p>
        </div>
        <div className="af-card clickable" onClick={openDiscover} role="button" tabIndex={0}>
          <Compass size={28} />
          <h4>Neue Leute finden</h4>
          <p className="muted">Entdecke öffentliche Server und Communities.</p>
        </div>
      </div>
    </div>
  );
}

function FriendRow({ rel }) {
  const user = useStore((s) => s.users[rel.id]);
  const status = useStore((s) => s.presences[rel.id] || 'offline');
  const dm = useStore((s) => dmList(s).find((c) => c.recipients?.[0] === rel.id));
  if (!user) return null;
  const act = (fn, msg) => run(fn, msg).catch(() => {});
  const call = async () => {
    await openDmWith(user.id);
    const ch = dmList(useStore.getState()).find((c) => c.recipients?.[0] === user.id);
    if (ch) voice.join(ch.id);
  };
  const more = (e) => openMenu(e, [
    { label: 'Profil', onClick: () => openPopout(user.id, e) },
    { label: 'Sprachanruf', icon: <Phone size={16} />, onClick: call },
    { label: 'Claimen …', icon: <Lock size={16} />, onClick: () => openModal('claim', { userId: user.id }) },
    { divider: true },
    { label: 'Freund entfernen', icon: <UserMinus size={16} />, danger: true, onClick: () => act(() => api(`/relationships/${user.id}`, { method: 'DELETE' }), 'Freund entfernt') },
    { label: 'Blockieren', icon: <Ban size={16} />, danger: true, onClick: () => act(() => api(`/relationships/${user.id}/block`, { method: 'POST' }), 'Blockiert') },
  ]);
  const sub = rel.type === 3 ? 'Eingehende Freundschaftsanfrage' : rel.type === 4 ? 'Ausgehende Freundschaftsanfrage' : rel.type === 2 ? 'Blockiert'
    : user.activity?.name ? <ActivityLine activity={user.activity} short /> : (user.customStatus || STATUS_LABEL[status]);
  return (
    <div className="friend-row" onClick={() => rel.type === 1 && openDmWith(user.id)} onContextMenu={rel.type === 1 ? more : undefined}>
      <Avatar user={user} userId={user.id} size={40} showStatus={rel.type === 1} />
      <div className="fr-text">
        <div className="fr-name"><NameTag user={user} />{user.serverTag && <ServerTagChip tag={user.serverTag} className="sm" interactive={false} />} {rel.type === 1 && <StreakChip streak={dm?.streak} size="sm" />} <span className="fr-username">@{user.username}</span></div>
        <div className="fr-sub">{sub}</div>
      </div>
      <div className="fr-actions" onClick={(e) => e.stopPropagation()}>
        {rel.type === 1 && (
          <>
            <button type="button" className="round-btn" data-tip="Nachricht" onClick={() => openDmWith(user.id)}><MessageCircle size={18} /></button>
            <button type="button" className="round-btn" data-tip="Anrufen" onClick={call}><Phone size={18} /></button>
            <button type="button" className="round-btn" data-tip="Mehr" onClick={more}><MoreVertical size={18} /></button>
          </>
        )}
        {rel.type === 3 && (
          <>
            <button type="button" className="round-btn ok" data-tip="Annehmen" onClick={() => act(() => api(`/relationships/${user.id}`, { method: 'PUT' }), `Du und ${user.displayName} seid jetzt Freunde! 🎉`)}><Check size={18} /></button>
            <button type="button" className="round-btn no" data-tip="Ablehnen" onClick={() => act(() => api(`/relationships/${user.id}`, { method: 'DELETE' }))}><X size={18} /></button>
          </>
        )}
        {rel.type === 4 && <button type="button" className="round-btn no" data-tip="Abbrechen" onClick={() => act(() => api(`/relationships/${user.id}`, { method: 'DELETE' }))}><X size={18} /></button>}
        {rel.type === 2 && <button type="button" className="btn secondary sm" onClick={() => act(() => api(`/relationships/${user.id}`, { method: 'DELETE' }), 'Blockierung aufgehoben')}>Entblocken</button>}
      </div>
    </div>
  );
}

function ActiveNow() {
  const relationships = useStore((s) => s.relationships);
  const voiceStates = useStore((s) => s.voice);
  const channels = useStore((s) => s.channels);
  const servers = useStore((s) => s.servers);
  const friends = new Set(Object.values(relationships).filter((r) => r.type === 1).map((r) => r.id));
  const active = [];
  for (const [cid, room] of Object.entries(voiceStates)) {
    const ch = channels[cid];
    if (!ch?.serverId) continue;
    const inRoom = Object.values(room).filter((p) => friends.has(p.userId));
    if (inRoom.length) active.push({ ch, server: servers[ch.serverId], people: inRoom, streaming: inRoom.some((p) => p.screen) });
  }
  return (
    <aside className="active-now">
      <h3>Gerade aktiv</h3>
      {active.length === 0 ? (
        <div className="an-empty">
          <p><b>Gerade ist es ruhig …</b></p>
          <p className="muted">Wenn Freunde in Sprachkanälen sind oder streamen, siehst du es hier. 🌙</p>
        </div>
      ) : active.map((a) => (
        <button key={a.ch.id} type="button" className="an-card" onClick={() => openChannel(a.ch.serverId, a.ch.id)}>
          <div className="an-head"><ServerIcon server={a.server} size={32} /><div><b>{a.server?.name}</b><div className="muted"><Volume2 size={12} /> {a.ch.name}</div></div></div>
          <div className="an-people">{a.people.map((p) => <Avatar key={p.userId} userId={p.userId} size={28} decoration={false} />)}{a.streaming && <span className="live-pill">LIVE</span>}</div>
        </button>
      ))}
    </aside>
  );
}

export function FriendsView() {
  const [tab, setTab] = useState('online');
  const [term, setTerm] = useState('');
  const relationships = useStore((s) => s.relationships);
  const presences = useStore((s) => s.presences);
  const users = useStore((s) => s.users);
  const claimsPending = useStore((s) => Object.values(s.claims).filter((c) => c.status === 'pending' && c.toId === s.me.id).length);
  const anyClaims = useStore((s) => Object.values(s.claims).some((c) => c.status === 'pending'));
  const pending = Object.values(relationships).filter((r) => r.type === 3).length + claimsPending;
  const list = useMemo(() => {
    const all = Object.values(relationships);
    const t = term.toLowerCase();
    return all
      .filter((r) => (tab === 'online' ? r.type === 1 && presences[r.id] && presences[r.id] !== 'offline'
        : tab === 'all' ? r.type === 1 : tab === 'pending' ? r.type === 3 || r.type === 4 : r.type === 2))
      .filter((r) => !t || users[r.id]?.username.includes(t) || users[r.id]?.displayName.toLowerCase().includes(t))
      .sort((a, b) => (a.type - b.type) || (users[a.id]?.displayName || '').localeCompare(users[b.id]?.displayName || ''));
  }, [relationships, presences, users, tab, term]);
  const label = { online: 'Online', all: 'Alle Freunde', pending: 'Ausstehend', blocked: 'Blockiert' }[tab];

  return (
    <div className="friends-view">
      <header className="chat-header">
        <button type="button" className="icon-btn mobile-only" onClick={() => useStore.setState({ mobilePane: 'nav' })} aria-label="Zurück"><ArrowLeft size={22} /></button>
        <div className="ch-title"><Users size={22} /><div className="ch-name">Freunde</div></div>
        <span className="ch-divider" />
        <nav className="friend-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={cx(tab === t.id && 'active')} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'pending' && pending > 0 && <span className="badge-count inline">{pending}</span>}
            </button>
          ))}
          <button type="button" className={cx('add-friend-tab', tab === 'add' && 'active')} onClick={() => setTab('add')}>Freund hinzufügen</button>
        </nav>
      </header>
      <div className="friends-body">
        <div className="friends-main">
          {tab !== 'add' && <StoryBar />}
          {tab === 'add' ? <AddFriend /> : tab === 'birthdays' ? <BirthdayCalendar /> : (
            <>
              {tab === 'pending' && <ClaimRequests />}
              <div className="friends-search"><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Suchen" /><Search size={16} /></div>
              <div className="friends-count">{label} — {list.length}</div>
              <div className="friends-list">
                {list.map((r) => <FriendRow key={r.id} rel={r} />)}
                {list.length === 0 && !(tab === 'pending' && anyClaims) && (
                  <div className="empty-state">
                    <div className="empty-art">{tab === 'pending' ? '📭' : tab === 'blocked' ? '🛡️' : '🌱'}</div>
                    <p>{tab === 'online' ? 'Gerade ist niemand online. Zeit für eine Pause? ☕' : tab === 'pending' ? 'Keine offenen Anfragen.' : tab === 'blocked' ? 'Du hast niemanden blockiert.' : 'Noch keine Freunde – füge jemanden hinzu!'}</p>
                    {tab !== 'blocked' && <button type="button" className="btn primary" onClick={() => setTab('add')}>Freund hinzufügen</button>}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <ActiveNow />
      </div>
    </div>
  );
}
