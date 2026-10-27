import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, Video, X, Download, ExternalLink, ZoomIn, ZoomOut, Hash, Volume2, Search, CheckCircle2, AlertCircle, Info, UserPlus, MessageCircle, Monitor } from 'lucide-react';
import { useStore, dismissIncomingCall, openChannel, openDm, openServer, dmList, dmPartner } from '../lib/store.js';
import { voice } from '../lib/voice.js';
import { cx } from '../lib/format.js';
import { Avatar, ServerIcon } from './Avatar.jsx';
import { useClickOutside } from './ui.jsx';

export function ContextMenu() {
  const menu = useStore((s) => s.menu);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const close = () => useStore.setState({ menu: null });
  useClickOutside(ref, close, !!menu);
  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    const w = el?.offsetWidth || 220;
    const h = el?.offsetHeight || 200;
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - h - 8)),
    });
  }, [menu]);
  useEffect(() => {
    if (!menu) return undefined;
    const esc = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('resize', close); };
  }, [menu]);
  if (!menu) return null;
  return createPortal(
    <div ref={ref} className="context-menu" style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? 'visible' : 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) => {
        if (it.divider) return <div key={i} className="menu-divider" />;
        if (it.custom) return <div key={i}>{it.custom}</div>;
        return (
          <button key={i} type="button" className={cx('menu-item', it.danger && 'danger')} onClick={() => { close(); it.onClick?.(); }}>
            <span className="mi-text">{it.label}{it.hint && <small>{it.hint}</small>}</span>
            {it.icon}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export function Lightbox() {
  const item = useStore((s) => s.lightbox);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    setZoom(1);
    if (!item) return undefined;
    const esc = (e) => e.key === 'Escape' && useStore.setState({ lightbox: null });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [item]);
  if (!item) return null;
  const close = () => useStore.setState({ lightbox: null });
  return createPortal(
    <div className="lightbox" onClick={close}>
      <div className="lb-tools" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} aria-label="Verkleinern"><ZoomOut size={20} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(5, z * 1.25))} aria-label="Vergrößern"><ZoomIn size={20} /></button>
        <a href={item.url} download={item.name} aria-label="Herunterladen"><Download size={20} /></a>
        <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Original öffnen"><ExternalLink size={20} /></a>
        <button type="button" onClick={close} aria-label="Schließen"><X size={22} /></button>
      </div>
      <div className="lb-stage" onWheel={(e) => setZoom((z) => Math.min(5, Math.max(0.5, z * Math.exp(-e.deltaY * 0.0015))))}>
        <img src={item.url} alt={item.name} style={{ transform: `scale(${zoom})` }} onClick={(e) => { e.stopPropagation(); setZoom((z) => (z === 1 ? 2 : 1)); }} />
      </div>
      <div className="lb-name">{item.name}</div>
    </div>,
    document.body,
  );
}

const TOAST_ICON = { success: <CheckCircle2 size={18} />, error: <AlertCircle size={18} />, friend: <UserPlus size={18} />, message: <MessageCircle size={18} />, info: <Info size={18} /> };

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', `t-${t.type}`)} onClick={() => useStore.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}>
          {TOAST_ICON[t.type] || TOAST_ICON.info}
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function IncomingCall() {
  const call = useStore((s) => s.incomingCall);
  const user = useStore((s) => (call ? s.users[call.from] : null));
  if (!call) return null;
  const accept = async (video) => {
    dismissIncomingCall(false);
    openDm(call.channelId);
    await voice.join(call.channelId);
    if (video) setTimeout(() => voice.toggleVideo(), 600);
  };
  return createPortal(
    <div className="incoming-call">
      <div className="ic-card" style={{ '--p1': user?.style?.accent1 || '#7c5cff', '--p2': user?.style?.accent2 || '#00d4ff' }}>
        <div className="ic-rings"><span /><span /><span /></div>
        <Avatar user={user} userId={call.from} size={96} />
        <h3>{user?.displayName || 'Jemand'}</h3>
        <p>ruft dich an …</p>
        <div className="ic-actions">
          <button type="button" className="ic-btn decline" onClick={() => dismissIncomingCall(true)} data-tip="Ablehnen"><PhoneOff /></button>
          <button type="button" className="ic-btn video" onClick={() => accept(true)} data-tip="Mit Video annehmen"><Video /></button>
          <button type="button" className="ic-btn accept" onClick={() => accept(false)} data-tip="Annehmen"><Phone /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function QuickSwitcher() {
  const open = useStore((s) => s.switcherOpen);
  const [term, setTerm] = useState('');
  const [index, setIndex] = useState(0);
  const close = () => useStore.setState({ switcherOpen: false });
  useEffect(() => { if (open) { setTerm(''); setIndex(0); } }, [open]);
  const items = useMemo(() => {
    if (!open) return [];
    const s = useStore.getState();
    const t = term.toLowerCase().replace(/^[#@*]/, '');
    const out = [];
    for (const c of dmList(s)) {
      const u = dmPartner(s, c);
      if (u) out.push({ key: c.id, label: u.displayName, hint: `@${u.username}`, icon: <Avatar user={u} size={22} decoration={false} />, go: () => openDm(c.id), text: `${u.displayName} ${u.username}`, kind: '@' });
    }
    for (const c of Object.values(s.channels)) {
      if (!c.serverId) continue;
      const srv = s.servers[c.serverId];
      out.push({ key: c.id, label: c.name, hint: srv?.name, icon: c.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />, go: () => openChannel(c.serverId, c.id), text: c.name, kind: '#' });
    }
    for (const srv of Object.values(s.servers)) {
      out.push({ key: srv.id, label: srv.name, hint: 'Server', icon: <ServerIcon server={srv} size={22} />, go: () => openServer(srv.id), text: srv.name, kind: '*' });
    }
    const prefix = term[0];
    return out
      .filter((it) => (!['#', '@', '*'].includes(prefix) || it.kind === prefix) && (!t || it.text.toLowerCase().includes(t)))
      .slice(0, 12);
  }, [open, term]);
  if (!open) return null;
  const go = (it) => { close(); it?.go(); };
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="switcher">
        <div className="sw-input">
          <Search size={20} />
          <input
            autoFocus
            value={term}
            placeholder="Wohin möchtest du?"
            onChange={(e) => { setTerm(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter') go(items[index]);
            }}
          />
        </div>
        <div className="sw-list">
          {items.map((it, i) => (
            <button key={it.key} type="button" className={cx('sw-item', i === index && 'active')} onMouseEnter={() => setIndex(i)} onClick={() => go(it)}>
              {it.icon}<span>{it.label}</span><small>{it.hint}</small>
            </button>
          ))}
          {!items.length && <div className="muted sw-empty">Nichts gefunden</div>}
        </div>
        <div className="sw-tip">Tipp: Beginne mit <b>@</b> für Personen, <b>#</b> für Kanäle, <b>*</b> für Server</div>
      </div>
    </div>,
    document.body,
  );
}

/** Desktop-App (Electron): Bildschirm/Fenster für die Übertragung auswählen. */
export function ScreenPicker() {
  const [sources, setSources] = useState(null);
  useEffect(() => window.zyncDesktop?.onPickSource?.((list) => setSources(list)), []);
  if (!sources) return null;
  const pick = (id) => { window.zyncDesktop.pickSource(id); setSources(null); };
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-head"><h2><Monitor size={20} /> Was möchtest du übertragen?</h2><button type="button" className="icon-btn" onClick={() => pick(null)}><X size={20} /></button></div>
        <div className="modal-body">
          <div className="source-grid">
            {sources.map((s) => (
              <button key={s.id} type="button" className="source-item" onClick={() => pick(s.id)}>
                <img src={s.thumbnail} alt="" />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}


/** Globale Tooltips für alle Elemente mit data-tip (werden nie abgeschnitten). */
export function TooltipLayer() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return undefined;
    let current = null;
    let timer = 0;
    const over = (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el === current) return;
      current = el;
      clearTimeout(timer);
      if (!el || !el.dataset.tip) { setTip(null); return; }
      timer = setTimeout(() => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        setTip({ text: el.dataset.tip, side: el.dataset.tipSide || 'top', r });
      }, 180);
    };
    const hide = () => { current = null; clearTimeout(timer); setTip(null); };
    document.addEventListener('mouseover', over);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (!tip) return null;
  const { r, side } = tip;
  const style = side === 'right'
    ? { left: r.right + 12, top: r.top + r.height / 2, transform: 'translateY(-50%)' }
    : r.top < 48
      ? { left: Math.min(window.innerWidth - 140, Math.max(140, r.left + r.width / 2)), top: r.bottom + 8, transform: 'translateX(-50%)' }
      : { left: Math.min(window.innerWidth - 140, Math.max(140, r.left + r.width / 2)), top: r.top - 8, transform: 'translate(-50%, -100%)' };
  return createPortal(<div className="tooltip" style={style}>{tip.text}</div>, document.body);
}
