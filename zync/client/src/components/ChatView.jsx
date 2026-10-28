import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hash, Pin, Search, Users, Phone, Video, ArrowLeft, UserCircle2, X, ChevronDown, Upload, MoreVertical, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useStore, loadMessages, ack, displayName, dmPartner, toast, openPopout, openMenu, openModal } from '../lib/store.js';
import { useSettings } from '../lib/settings.js';
import { api } from '../lib/api.js';
import { voice } from '../lib/voice.js';
import { useBackHandler } from '../lib/back.js';
import { cx, formatDay, formatStamp, STATUS_LABEL } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.jsx';
import { isAdminRole, can, PERMS } from '../lib/perm.js';
import { Message } from './Message.jsx';
import { Composer, useAttachments } from './Composer.jsx';
import { Avatar, NameTag } from './Avatar.jsx';
import { MembersPanel } from './MembersPanel.jsx';
import { ProfileCard } from './ProfileCard.jsx';
import { DmCallStage } from './Call.jsx';
import { StreakChip, ClaimChip, ActivityLine } from './Social.jsx';
import { openStoryComposer } from './Stories.jsx';
import { AiEyeButton, AiSummaryButton, AiConsentBanner } from './Ai.jsx';
import { BirthdayBanner } from './Extras.jsx';

function streakMenu(e, channel, partner, meId) {
  const st = channel.streak;
  openMenu(e, [
    { custom: (
      <div className="streak-info">
        <div className="si-big">🔥 {st.count}</div>
        <b>{st.count === 1 ? '1 Tag' : `${st.count} Tage`} Flamme mit {partner?.displayName}</b>
        <span>Rekord: {st.best} · Heute: {st.today?.[meId] ? 'Du ✅' : 'Du ⏳'} {st.today?.[partner?.id] ? `${partner?.displayName} ✅` : `${partner?.displayName} ⏳`}</span>
        {st.expiring && <span className="si-warn">⏳ Schreibt euch heute, sonst erlischt die Flamme!</span>}
      </div>
    ) },
    { label: 'Als Story teilen ✨', onClick: () => openStoryComposer({ kind: 'streak', channelId: channel.id, streak: { partnerId: partner?.id, count: st.count } }) },
  ]);
}
import { Spinner } from './ui.jsx';

function TypingIndicator({ channel }) {
  const typing = useStore((s) => s.typing[channel.id]);
  const show = useSettings((s) => s.showTyping);
  const state = useStore.getState();
  const ids = Object.keys(typing || {}).filter((id) => id !== state.me.id);
  if (!show || !ids.length) return <div className="typing" />;
  const names = ids.map((id) => displayName(state, id, channel.serverId));
  const text = names.length === 1 ? <><b>{names[0]}</b> schreibt…</>
    : names.length === 2 ? <><b>{names[0]}</b> und <b>{names[1]}</b> schreiben…</>
      : names.length === 3 ? <><b>{names[0]}</b>, <b>{names[1]}</b> und <b>{names[2]}</b> schreiben…</>
        : <>Mehrere Leute schreiben…</>;
  return <div className="typing"><span className="typing-dots"><i /><i /><i /></span>{text}</div>;
}

function Welcome({ channel }) {
  const state = useStore.getState();
  if (channel.type === 'dm') {
    const u = dmPartner(state, channel);
    return (
      <div className="chat-welcome">
        <Avatar user={u} size={88} />
        <h1>{u?.displayName}</h1>
        <div className="muted">@{u?.username}</div>
        <p>Das ist der Anfang eurer legendären Unterhaltung mit <b>@{u?.username}</b>. 💬</p>
      </div>
    );
  }
  return (
    <div className="chat-welcome">
      <div className="welcome-hash"><Hash size={44} /></div>
      <h1>Willkommen in #{channel.name}!</h1>
      <p>Das ist der Anfang des Kanals #{channel.name}. {channel.topic}</p>
    </div>
  );
}

function MessageList({ channel, jumpRef }) {
  const cid = channel.id;
  const messages = useStore((s) => s.messages[cid]);
  const hasMore = useStore((s) => s.hasMore[cid]);
  const server = useStore((s) => (channel.serverId ? s.servers[channel.serverId] : null));
  const meId = useStore((s) => s.me.id);
  const groupMinutes = useSettings((s) => s.groupMinutes);
  const scroller = useRef(null);
  const content = useRef(null);
  const atBottom = useRef(true);
  const prepend = useRef(null);
  const loadingOlder = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [unreadMarker, setUnreadMarker] = useState(null);

  useEffect(() => {
    atBottom.current = true;
    setShowJump(false);
    setUnreadMarker(useStore.getState().readStates[cid] || '');
    if (!useStore.getState().messages[cid]) loadMessages(cid).catch((e) => toast(e.message, 'error'));
  }, [cid]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prepend.current != null) {
      el.scrollTop = el.scrollHeight - prepend.current;
      prepend.current = null;
    } else if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return undefined;
    const ro = new ResizeObserver(() => { if (atBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [cid]);

  const onScroll = async () => {
    const el = scroller.current;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottom.current = bottom;
    setShowJump(!bottom && el.scrollHeight - el.scrollTop - el.clientHeight > 600);
    if (bottom && document.hasFocus()) ack(cid);
    if (el.scrollTop < 400 && hasMore && !loadingOlder.current) {
      loadingOlder.current = true;
      prepend.current = el.scrollHeight - el.scrollTop;
      try { await loadMessages(cid, { older: true }); } catch { prepend.current = null; }
      loadingOlder.current = false;
    }
  };

  const jumpTo = useCallback(async (id) => {
    for (let i = 0; i < 15; i++) {
      const node = scroller.current?.querySelector(`[data-id="${id}"]`);
      if (node) {
        atBottom.current = false;
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setHighlight(id);
        setTimeout(() => setHighlight(null), 2200);
        return;
      }
      if (useStore.getState().hasMore[cid] === false) break;
      prepend.current = scroller.current.scrollHeight - scroller.current.scrollTop;
      await loadMessages(cid, { older: true });
    }
    toast('Nachricht nicht gefunden', 'error');
  }, [cid]);
  useEffect(() => { if (jumpRef) jumpRef.current = jumpTo; }, [jumpRef, jumpTo]);

  const isAdmin = server ? isAdminRole(server.members[meId]?.role) : false;
  const canPin = channel.type === 'dm' || isAdmin;
  const openMedia = useCallback((a) => useStore.setState({ lightbox: a }), []);

  const rows = useMemo(() => {
    if (!messages) return [];
    const out = [];
    let prev = null;
    let markerPlaced = false;
    for (const m of messages) {
      if (!prev || formatDay(prev.createdAt) !== formatDay(m.createdAt)) out.push({ type: 'day', key: `d${m.id}`, label: formatDay(m.createdAt) });
      if (!markerPlaced && unreadMarker != null && unreadMarker !== '' && !m.pending && m.id > unreadMarker && m.authorId !== meId) {
        out.push({ type: 'new', key: 'new' });
        markerPlaced = true;
      }
      const grouped = prev && prev.authorId === m.authorId && prev.type === 'default' && m.type === 'default' && !m.replyTo
        && m.createdAt - prev.createdAt < groupMinutes * 60_000 && formatDay(prev.createdAt) === formatDay(m.createdAt) && out[out.length - 1]?.type === 'msg';
      out.push({ type: 'msg', key: m.nonce || m.id, m, grouped });
      prev = m;
    }
    return out;
  }, [messages, unreadMarker, meId, groupMinutes]);

  return (
    <div className="message-scroller" ref={scroller} onScroll={onScroll}>
      <div className="message-list" ref={content}>
        {!messages && <div className="msg-loading"><Spinner size={28} /></div>}
        {messages && hasMore === false && <Welcome channel={channel} />}
        {messages && hasMore && <div className="msg-loading"><Spinner /></div>}
        {rows.map((r) => (
          r.type === 'day' ? <div key={r.key} className="day-divider"><span>{r.label}</span></div>
            : r.type === 'new' ? <div key={r.key} className="new-divider"><span>NEU</span></div>
              : <Message key={r.key} msg={r.m} grouped={r.grouped} serverId={channel.serverId} isAdmin={isAdmin} canPin={canPin} onOpenMedia={openMedia} onJump={jumpTo} highlighted={highlight === r.m.id} />
        ))}
      </div>
      {showJump && (
        <button type="button" className="jump-bottom" onClick={() => { atBottom.current = true; scroller.current.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }}>
          Zu den neuesten Nachrichten <ChevronDown size={16} />
        </button>
      )}
    </div>
  );
}

function SidePanelResults({ title, onClose, loader, deps, jump, channel }) {
  const [results, setResults] = useState(null);
  const markdown = useSettings((s) => s.markdown);
  useEffect(() => {
    setResults(null);
    loader().then(setResults).catch((e) => { toast(e.message, 'error'); setResults([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <aside className="side-panel results-panel">
      <div className="sp-head"><h3>{title}</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen"><X size={18} /></button></div>
      <div className="sp-scroll">
        {!results && <div className="msg-loading"><Spinner /></div>}
        {results?.length === 0 && <div className="empty-state small">Keine Ergebnisse 🔍</div>}
        {results?.map((m) => (
          <button key={m.id} type="button" className="result-card" onClick={() => jump(m.id)}>
            <div className="rc-head"><Avatar userId={m.authorId} size={22} decoration={false} /><NameTag userId={m.authorId} serverId={channel.serverId} /><time>{formatStamp(m.createdAt)}</time></div>
            <div className="rc-body">{m.content ? renderMarkdown(m.content, { markdown, spoilers: 'click' }) : <span className="muted">📎 Anhang</span>}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function ChatView({ channel }) {
  const isDm = channel.type === 'dm';
  const partner = useStore((s) => (isDm ? dmPartner(s, channel) : null));
  const partnerStatus = useStore((s) => (isDm && partner ? s.presences[partner.id] : null));
  const membersOpen = useStore((s) => s.membersOpen);
  const isMobile = useStore((s) => s.isMobile);
  const [mobileSide, setMobileSide] = useState(false);
  const sideOpen = isMobile ? mobileSide : membersOpen;
  const [panel, setPanel] = useState(null); // null | 'pins' | {search}
  const [search, setSearch] = useState('');
  const [drag, setDrag] = useState(false);
  const attachments = useAttachments();
  const jumpRef = useRef(null);
  const dragDepth = useRef(0);
  const rel = useStore((s) => (partner ? s.relationships[partner.id]?.type : 0));
  const blocked = isDm && rel === 2;

  useEffect(() => { setPanel(null); setSearch(''); setMobileSide(false); }, [channel.id]);
  useEffect(() => {
    const onFocus = () => {
      const el = document.querySelector('.message-scroller');
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) ack(channel.id);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [channel.id]);

  const title = isDm ? partner?.displayName : channel.name;
  const placeholder = isDm ? `Nachricht an @${partner?.username || ''}` : `Nachricht an #${channel.name}`;

  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDrag(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) attachments.add(files);
  };

  const showSide = panel ? 'panel' : sideOpen ? (isDm ? 'profile' : 'members') : null;
  useBackHandler(isMobile && !!showSide, () => { setMobileSide(false); setPanel(null); });
  const aiEnabled = useStore((s) => s.ai?.enabled);
  const canAi = useStore((s) => (channel.serverId ? can(s, channel.serverId, PERMS.MANAGE_CHANNELS) : true));
  const moreMenu = (e) => {
    const me = useStore.getState().me;
    const ai = channel.ai || { on: false, consents: [] };
    const mineOn = channel.serverId ? ai.on : ai.consents?.includes(me.id);
    openMenu(e, [
      { label: 'Angepinnte Nachrichten', icon: <Pin size={16} />, onClick: () => setPanel('pins') },
      aiEnabled && canAi && {
        label: mineOn ? 'KI-Mitlesen ausschalten' : channel.serverId ? 'KI im Kanal einschalten' : 'KI im Chat erlauben',
        icon: mineOn ? <EyeOff size={16} /> : <Eye size={16} />,
        onClick: () => api(`/channels/${channel.id}/ai`, { method: mineOn ? 'DELETE' : 'PUT' }).catch((err) => toast(err.message, 'error')),
      },
      aiEnabled && ai.on && { label: 'Was hab ich verpasst?', icon: <Sparkles size={16} />, onClick: () => openModal('aiSummary', { channelId: channel.id }) },
    ].filter(Boolean));
  };
  const toggleSide = () => {
    setPanel(null);
    if (isMobile) setMobileSide((o) => (panel ? true : !o));
    else useStore.setState((s) => ({ membersOpen: panel ? true : !s.membersOpen }));
  };

  return (
    <div
      className="chat-view"
      onDragEnter={(e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth.current++; setDrag(true); } }}
      onDragLeave={() => { dragDepth.current--; if (dragDepth.current <= 0) setDrag(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <header className="chat-header">
        <button type="button" className="icon-btn mobile-only" onClick={() => useStore.setState({ mobilePane: 'nav' })} aria-label="Zurück"><ArrowLeft size={22} /></button>
        {isDm ? (
          <div className="ch-title" onClick={(e) => partner && openPopout(partner.id, e)}>
            <Avatar user={partner} userId={partner?.id} size={30} showStatus decoration={false} />
            <div>
              <div className="ch-name">{title}</div>
              <div className="ch-sub">{partner?.activity?.name ? <ActivityLine activity={partner.activity} short /> : partner?.customStatus || STATUS_LABEL[partnerStatus || 'offline']}</div>
            </div>
            <span onClick={(e) => e.stopPropagation()}><StreakChip streak={channel.streak} onClick={(e) => streakMenu(e, channel, partner, useStore.getState().me.id)} /></span>
            {partner?.claim && <span className="ch-claim"><ClaimChip claim={partner.claim} viewerId={partner.id} /></span>}
          </div>
        ) : (
          <div className="ch-title">
            <Hash size={22} className="ch-hash" />
            <div className="ch-name">{title}</div>
            {channel.bridge && <span className="bridge-chip" data-tip="Wird mit Discord gespiegelt">🔗 {channel.bridge.name || 'Discord'}</span>}
            {channel.topic && <><span className="ch-divider" /><div className="ch-topic" title={channel.topic}>{channel.topic}</div></>}
          </div>
        )}
        <div className="ch-actions">
          {isDm && !blocked && (
            <>
              <button type="button" className="icon-btn" data-tip="Sprachanruf" onClick={() => voice.join(channel.id)}><Phone size={20} /></button>
              <button type="button" className="icon-btn" data-tip="Videoanruf" onClick={async () => { await voice.join(channel.id); setTimeout(() => voice.toggleVideo(), 600); }}><Video size={20} /></button>
            </>
          )}
          {!isMobile && <AiSummaryButton channel={channel} />}
          {!isMobile && <AiEyeButton channel={channel} />}
          {!isMobile && <button type="button" className={cx('icon-btn', panel === 'pins' && 'active')} data-tip="Angepinnte Nachrichten" onClick={() => setPanel(panel === 'pins' ? null : 'pins')}><Pin size={20} /></button>}
          {isMobile && <button type="button" className="icon-btn" aria-label="Mehr" onClick={(e) => moreMenu(e)}><MoreVertical size={20} /></button>}
          <button type="button" className={cx('icon-btn', !panel && sideOpen && 'active')} data-tip={isDm ? 'Profil anzeigen' : 'Mitgliederliste'} onClick={toggleSide}>
            {isDm ? <UserCircle2 size={20} /> : <Users size={20} />}
          </button>
          <form className="ch-search" onSubmit={(e) => { e.preventDefault(); if (search.trim()) setPanel({ search: search.trim() }); }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen" />
            {search ? <button type="button" onClick={() => { setSearch(''); if (panel?.search) setPanel(null); }}><X size={14} /></button> : <Search size={14} />}
          </form>
        </div>
      </header>

      <div className="chat-body">
        <div className="chat-main">
          {isDm && <DmCallStage channel={channel} />}
          <AiConsentBanner channel={channel} />
          <BirthdayBanner channel={channel} />
          <MessageList channel={channel} jumpRef={jumpRef} />
          <Composer channel={channel} placeholder={placeholder} attachments={attachments} disabled={blocked} />
          <TypingIndicator channel={channel} />
          {drag && (
            <div className="drop-overlay">
              <div className="drop-card"><Upload size={40} /><h3>Dateien hochladen</h3><p>Loslassen, um sie an {isDm ? `@${partner?.username}` : `#${channel.name}`} zu senden (bis 100 MB)</p></div>
            </div>
          )}
        </div>
        {isMobile && showSide && <div className="side-backdrop" onClick={() => { setMobileSide(false); setPanel(null); }} />}
        {showSide === 'members' && <MembersPanel serverId={channel.serverId} />}
        {showSide === 'profile' && partner && (
          <aside className="side-panel dm-profile">
            <ProfileCard userId={partner.id} actions={false} />
          </aside>
        )}
        {showSide === 'panel' && panel === 'pins' && (
          <SidePanelResults title="📌 Angepinnt" channel={channel} onClose={() => setPanel(null)} deps={[channel.id, 'pins']} loader={() => api(`/channels/${channel.id}/pins`)} jump={(id) => jumpRef.current?.(id)} />
        )}
        {showSide === 'panel' && panel?.search && (
          <SidePanelResults title={<><Search size={16} /> „{panel.search}“</>} channel={channel} onClose={() => setPanel(null)} deps={[channel.id, panel.search]} loader={() => api(`/channels/${channel.id}/search?q=${encodeURIComponent(panel.search)}`)} jump={(id) => jumpRef.current?.(id)} />
        )}
      </div>
    </div>
  );
}

