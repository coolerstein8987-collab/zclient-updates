import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, Lock, Gamepad2, ChevronRight, ExternalLink, Clock, Sparkles, X } from 'lucide-react';
import { useStore, closeModal, openModal, openServer, openPopout, toast, run, openDmWith } from '../lib/store.js';
import { api } from '../lib/api.js';
import { cx, formatDate } from '../lib/format.js';
import { Modal, Spinner, useFloating, useClickOutside, Field } from './ui.jsx';
import { Avatar, ServerIcon, NameTag } from './Avatar.jsx';
import { ProfileCard, BioText } from './ProfileCard.jsx';
import { Guestbook } from './Extras.jsx';

export const claimWindow = (c) => (c.start === c.end ? 'ganztägig' : `${hhmm(c.start)}–${hhmm(c.end)}`);
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function timeSince(ts) {
  const m = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} Std.`;
  return `${Math.floor(h / 24)} T.`;
}

// ---------- Server-Tag ----------
export function ServerTagChip({ tag, className, interactive = true }) {
  const [anchor, setAnchor] = useState(null);
  if (!tag?.text) return null;
  return (
    <>
      <button
        type="button"
        className={cx('server-tag', className)}
        style={{ '--tag': tag.color || '#7c5cff' }}
        data-tip={tag.serverName ? `Server-Tag von ${tag.serverName}` : undefined}
        onClick={(e) => {
          if (!interactive || !tag.serverId) return;
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ x: r.left, y: r.top, w: r.width, h: r.height });
        }}
      >
        {tag.emoji && <span className="st-emoji">{tag.emoji}</span>}
        <span>{tag.text}</span>
      </button>
      {anchor && <TagPopover tag={tag} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
}

function TagPopover({ tag, anchor, onClose }) {
  const [info, setInfo] = useState(null);
  const [ref, pos] = useFloating(anchor, { width: 300, height: 260, side: 'bottom' });
  useClickOutside(ref, onClose);
  useEffect(() => {
    api(`/servers/${tag.serverId}/preview`).then(setInfo).catch((e) => setInfo({ error: e.message }));
  }, [tag.serverId]);
  const join = async () => {
    try {
      await api(`/discover/${tag.serverId}/join`, { method: 'POST' });
      onClose();
      setTimeout(() => openServer(tag.serverId), 200);
    } catch (e) { toast(e.message, 'error'); }
  };
  return createPortal(
    <div ref={ref} className="tag-popover" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, '--tag': tag.color }}>
      <div className="tp-head">
        <ServerIcon server={info?.server || { id: tag.serverId, name: tag.serverName, icon: tag.icon, iconCrop: tag.iconCrop }} size={52} />
        <div>
          <ServerTagChip tag={tag} interactive={false} />
          <h3>{info?.server?.name || tag.serverName}</h3>
        </div>
      </div>
      {!info ? <div className="tp-loading"><Spinner /></div> : info.error ? <p className="muted">{info.error}</p> : (
        <>
          {info.server.description && <p className="tp-desc">{info.server.description}</p>}
          <div className="tp-stats">
            <span><Users size={14} /> {info.members} Mitglieder</span>
            <span><Sparkles size={14} /> {info.tagWearers} tragen den Tag</span>
          </div>
          {info.joined ? <button type="button" className="btn secondary block" onClick={() => { onClose(); openServer(tag.serverId); }}>Server öffnen</button>
            : info.server.isPublic ? <button type="button" className="btn primary block" onClick={join}>Server beitreten</button>
              : <div className="tp-private"><Lock size={14} /> Privater Server – nur mit Einladung</div>}
        </>
      )}
    </div>,
    document.body,
  );
}

// ---------- Badges ----------
export function BadgeIcon({ badge, size = 'md' }) {
  return (
    <span className={cx('zbadge', `tier-${badge.tier || 'locked'}`, `bs-${size}`)} data-tip={badge.name}>
      <span>{badge.icon}</span>
    </span>
  );
}

export function BadgeRow({ badges = [], max = 8, userId }) {
  if (!badges.length) return null;
  const shown = badges.slice(0, max);
  return (
    <div className="badge-row">
      {shown.map((b) => <BadgeIcon key={b.id} badge={b} size="sm" />)}
      {badges.length > max && <button type="button" className="zbadge more bs-sm" onClick={() => openModal('stats', { userId })}>+{badges.length - max}</button>}
    </div>
  );
}

function StatsModal({ userId }) {
  const user = useStore((s) => s.users[userId]);
  const [data, setData] = useState(null);
  useEffect(() => {
    api(`/users/${userId}/stats`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [userId]);
  const st = data?.stats;
  const tiles = st ? [
    ['🎙️', `${st.voiceHours.toLocaleString('de-DE')}h`, 'im Call'],
    ['🎮', `${st.playHours.toLocaleString('de-DE')}h`, 'gezockt'],
    ['🧭', st.games, 'Spiele entdeckt'],
    ['💬', st.messages.toLocaleString('de-DE'), 'Nachrichten'],
    ['🔥', st.bestStreak, 'beste Flamme'],
    ['📅', st.days, 'Tage dabei'],
  ] : [];
  const maxGame = Math.max(1, ...(st?.topGames || []).map((g) => g.hours));
  return (
    <Modal onClose={closeModal} title={<><Sparkles size={20} /> Erfolge & Statistiken</>} subtitle={user ? `${user.displayName} · @${user.username}` : ''} width={720} className="stats-modal">
      {!data ? <div className="msg-loading"><Spinner size={28} /></div> : (
        <>
          <div className="stat-tiles">
            {tiles.map(([icon, value, label]) => (
              <div key={label} className="stat-tile"><span className="stt-icon">{icon}</span><b>{value}</b><span>{label}</span></div>
            ))}
          </div>
          {st.topGames.length > 0 && (
            <div className="top-games">
              <h4><Gamepad2 size={15} /> Meistgespielt</h4>
              {st.topGames.map((g) => (
                <div key={g.name} className="tg-row">
                  <span className="tg-name">{g.name}</span>
                  <div className="tg-bar"><i style={{ width: `${(g.hours / maxGame) * 100}%` }} /></div>
                  <span className="tg-h">{g.hours}h</span>
                </div>
              ))}
            </div>
          )}
          <h4 className="badges-title">Badges</h4>
          <div className="badge-grid">
            {data.badges.map((b) => {
              const pct = b.next ? Math.min(100, ((b.value || 0) / b.next) * 100) : 100;
              return (
                <div key={b.id} className={cx('badge-card', !b.earned && 'locked')}>
                  <BadgeIcon badge={b} size="lg" />
                  <div className="bc-text">
                    <b>{b.name}</b>
                    <span>{b.desc}</span>
                    {b.next != null && (
                      <div className="bc-progress">
                        <div><i style={{ width: `${pct}%` }} /></div>
                        <small>Nächste Stufe: {Number(b.next).toLocaleString('de-DE')}</small>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- Profil-Widgets ----------
const isImg = (v) => typeof v === 'string' && v.startsWith('/uploads/');
const WidgetIcon = ({ icon, className }) => (icon ? (isImg(icon) ? <img src={icon} alt="" className={cx('wi-img', className)} /> : <span className={cx('wi-emoji', className)}>{icon}</span>) : null);

function Widget({ w, user }) {
  const users = useStore((s) => s.users);
  if (w.type === 'card') {
    return (
      <div className={cx('widget w-card', `wt-${w.theme}`, w.image && 'has-image')}>
        <div className="wc-content">
          {(w.icon || w.title) && <div className="w-head"><WidgetIcon icon={w.icon} />{w.title && <span className="w-title">{w.title}</span>}</div>}
          {w.text && <p className="wc-text">{w.text}</p>}
          {w.link && <a className="wc-link" href={w.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Link öffnen</a>}
        </div>
        {w.image && <div className="wc-image"><img src={w.image} alt="" onClick={() => useStore.setState({ lightbox: { url: w.image, name: w.title || 'Bild' } })} /></div>}
      </div>
    );
  }
  if (w.type === 'links') {
    return (
      <div className={cx('widget w-links', `wt-${w.theme}`)}>
        {w.title && <div className="w-head"><span className="w-title">{w.title}</span></div>}
        <div className="wl-grid">
          {w.items.map((it, i) => {
            const Tag = it.url ? 'a' : 'div';
            return (
              <Tag key={i} className="wl-item" {...(it.url ? { href: it.url, target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <div className="wl-icon"><WidgetIcon icon={it.icon || '✦'} /></div>
                <div className="wl-text"><span className="wl-label">₊˚✦ {it.label}</span><span className="wl-value">{it.value}</span></div>
              </Tag>
            );
          })}
        </div>
      </div>
    );
  }
  if (w.type === 'people') {
    if (!w.items.length) return null;
    return (
      <div className={cx('widget w-people', `wt-${w.theme}`)}>
        {w.title && <div className="w-head"><span className="w-title">{w.title}</span></div>}
        <div className="wp-list">
          {w.items.map((it) => (
            <button key={it.userId} type="button" className="wp-item" onClick={(e) => openPopout(it.userId, e)}>
              <Avatar user={users[it.userId] || it.user} userId={it.userId} size={40} />
              <div className="wp-text">
                <NameTag user={users[it.userId] || it.user} userId={it.userId} />
                <span className="wp-label">{it.label || `@${(users[it.userId] || it.user)?.username || ''}`}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (w.type === 'gallery') {
    if (!w.images.length) return null;
    return (
      <div className={cx('widget w-gallery', `wt-${w.theme}`)}>
        {w.title && <div className="w-head"><span className="w-title">{w.title}</span></div>}
        <div className={cx('wg-grid', `n${Math.min(w.images.length, 4)}`)}>
          {w.images.map((src) => <img key={src} src={src} alt="" onClick={() => useStore.setState({ lightbox: { url: src, name: w.title || 'Bild' } })} />)}
        </div>
      </div>
    );
  }
  if (w.type === 'stats') {
    return (
      <div className={cx('widget w-stats', `wt-${w.theme}`)}>
        <div className="ws-left">
          <div className="w-head"><span className="w-title">{w.title || 'Erfolge'}</span></div>
          <BadgeRow badges={user.badges} max={6} userId={user.id} />
          <button type="button" className="ws-more" onClick={() => openModal('stats', { userId: user.id })}>Alle Statistiken ansehen <ChevronRight size={14} /></button>
        </div>
        <div className="ws-big">{user.badges?.[0]?.icon || '🏅'}</div>
      </div>
    );
  }
  if (w.type === 'games') {
    return (
      <div className={cx('widget w-games', `wt-${w.theme}`)}>
        <div className="w-head"><span className="w-title">{w.title || 'Gaming'}</span></div>
        {user.activity?.name ? <div className="wgm-now"><Gamepad2 size={16} /> Spielt gerade <b>{user.activity.name}</b></div> : <div className="muted">Gerade offline vom Zocken 😴</div>}
        <button type="button" className="ws-more" onClick={() => openModal('stats', { userId: user.id })}>Spielzeit ansehen <ChevronRight size={14} /></button>
      </div>
    );
  }
  return null;
}

export function ProfileWidgets({ user }) {
  if (!user?.widgets?.length) return null;
  return <div className="widgets">{user.widgets.map((w) => <Widget key={w.id} w={w} user={user} />)}</div>;
}

// ---------- Aktivität, Flammen, Claims ----------
export function ActivityLine({ activity, short }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!activity?.name) return null;
  if (short) return <span className="activity-short"><Gamepad2 size={12} /> Spielt {activity.name}</span>;
  return (
    <div className="activity-card">
      <div className="ac-icon"><Gamepad2 size={22} /></div>
      <div>
        <span className="ac-label">Spielt gerade</span>
        <b>{activity.name}</b>
        <span className="ac-time"><Clock size={11} /> seit {timeSince(activity.since)}</span>
      </div>
    </div>
  );
}

export function StreakChip({ streak, onClick, size }) {
  if (!streak?.count) return null;
  return (
    <button type="button" className={cx('streak-chip', streak.expiring && 'expiring', size === 'sm' && 'sm', streak.count >= 100 ? 'legend' : streak.count >= 30 ? 'hot' : '')} onClick={onClick} data-tip={streak.expiring ? 'Schreibt euch heute, sonst erlischt die Flamme!' : `${streak.count} Tage Flamme`}>
      <span className="sc-flame">🔥</span>
      <span>{streak.count}</span>
      {streak.expiring && <span className="sc-hourglass">⏳</span>}
    </button>
  );
}

export function ClaimChip({ claim, viewerId }) {
  const users = useStore((s) => s.users);
  if (!claim) return null;
  const other = claim.fromId === viewerId ? claim.toId : claim.fromId;
  const partnerName = (users[other] || claim.users?.[other])?.displayName || 'jemandem';
  return (
    <div className={cx('claim-chip', claim.active && 'live')} data-tip={`Geclaimt mit ${partnerName} · ${claimWindow(claim)} – ${claim.active ? 'gerade aktiv, andere können nicht schreiben oder anrufen' : 'außerhalb des Zeitfensters'}`}>
      <Lock size={13} />
      <span>Geclaimt mit <b>{partnerName}</b> · {claimWindow(claim)}</span>
    </div>
  );
}

function ClaimModal({ userId }) {
  const user = useStore((s) => s.users[userId]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('21:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const presets = [['09:00', '21:00', 'Tagsüber'], ['18:00', '23:00', 'Abends'], ['20:00', '02:00', 'Nachts'], ['00:00', '00:00', 'Ganztägig']];
  const send = async () => {
    setBusy(true);
    try {
      await api('/claims', { method: 'POST', body: { userId, start, end, note } });
      toast(`🔒 Claim-Anfrage an ${user?.displayName} gesendet`, 'success');
      closeModal();
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal onClose={closeModal} title={<><Lock size={20} /> {user?.displayName} claimen</>} subtitle="Reserviert euch ein tägliches Zeitfenster nur füreinander." width={460}>
      <div className="claim-hero">
        <Avatar userId={useStore.getState().me.id} size={56} />
        <span className="claim-link">🔒</span>
        <Avatar userId={userId} size={56} />
      </div>
      <div className="chip-row">
        {presets.map(([a, b, label]) => <button key={label} type="button" className={cx('chip', start === a && end === b && 'active')} onClick={() => { setStart(a); setEnd(b); }}>{label} {a !== b && `· ${a}–${b}`}</button>)}
      </div>
      <div className="grid-2">
        <Field label="Von"><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Bis"><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Notiz (optional)"><input className="input" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Gaming-Session 🎮" /></Field>
      <ul className="claim-rules">
        <li>In diesem Zeitfenster können euch <b>andere nicht anschreiben oder anrufen</b>.</li>
        <li>Beide müssen zustimmen – {user?.displayName} bekommt eine Anfrage.</li>
        <li>Jeder von euch kann den Claim jederzeit beenden.</li>
      </ul>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={closeModal}>Abbrechen</button>
        <button type="button" className="btn primary" onClick={send} disabled={busy}>{busy ? <Spinner size={16} /> : 'Anfrage senden'}</button>
      </div>
    </Modal>
  );
}

export function ClaimRequests() {
  const claims = useStore((s) => s.claims);
  const me = useStore((s) => s.me.id);
  const users = useStore((s) => s.users);
  const list = Object.values(claims).filter((c) => c.status === 'pending');
  if (!list.length) return null;
  return (
    <div className="claim-requests">
      <div className="friends-count">Claim-Anfragen — {list.length}</div>
      {list.map((c) => {
        const incoming = c.toId === me;
        const other = incoming ? c.fromId : c.toId;
        return (
          <div key={c.id} className="claim-req">
            <Avatar userId={other} size={40} />
            <div className="cr-text">
              <b>{users[other]?.displayName}</b>
              <span>{incoming ? 'möchte dich claimen' : 'Wartet auf Antwort'} · {claimWindow(c)}{c.note ? ` · ${c.note}` : ''}</span>
            </div>
            {incoming && <button type="button" className="btn success sm" onClick={() => run(() => api(`/claims/${c.id}`, { method: 'PUT' })).catch(() => {})}>Annehmen</button>}
            <button type="button" className="btn ghost sm" onClick={() => run(() => api(`/claims/${c.id}`, { method: 'DELETE' })).catch(() => {})}>{incoming ? 'Ablehnen' : 'Zurückziehen'}</button>
          </div>
        );
      })}
    </div>
  );
}

export const endClaim = (claim) => openModal('confirm', {
  title: 'Claim beenden?',
  text: 'Danach können euch wieder alle anschreiben und anrufen.',
  confirm: 'Beenden',
  danger: true,
  onConfirm: () => run(() => api(`/claims/${claim.id}`, { method: 'DELETE' }), '🔓 Claim beendet'),
});

// ---------- Vollständiges Profil ----------
function FullProfileModal({ userId, serverId }) {
  const user = useStore((s) => s.users[userId]);
  const me = useStore((s) => s.me);
  const servers = useStore((s) => s.servers);
  const [tab, setTab] = useState('about');
  const [extra, setExtra] = useState(null);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api(`/users/${userId}`).then(setExtra).catch(() => {});
    api(`/users/${userId}/stats`).then(setStats).catch(() => {});
  }, [userId]);
  if (!user) return null;
  return (
    <Modal onClose={closeModal} width={900} className="full-profile" bare>
      <button type="button" className="fp-close icon-btn" onClick={closeModal} aria-label="Schließen"><X size={20} /></button>
      <div className="fp-layout">
        <div className="fp-left"><ProfileCard userId={userId} serverId={serverId} extra={extra} onAction={closeModal} hideWidgets /></div>
        <div className="fp-right">
          <nav className="fp-tabs">
            {[['about', 'Über mich'], ['widgets', 'Widgets'], ['guestbook', 'Gästebuch'], ['stats', 'Erfolge'], ['mutual', 'Gemeinsam']].map(([id, label]) => (
              <button key={id} type="button" className={cx(tab === id && 'active')} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <div className="fp-body">
            {tab === 'about' && (
              <div className="fp-about">
                <ActivityLine activity={user.activity} />
                {user.bio ? <div className="fp-section"><h4>Über mich</h4><div className="pc-bio"><BioText user={user} /></div></div> : <p className="muted">{user.id === me.id ? 'Erzähl in den Profil-Einstellungen etwas über dich ✨' : 'Noch keine Bio.'}</p>}
                <div className="fp-section"><h4>Mitglied seit</h4><span>{formatDate(user.createdAt)}</span></div>
              </div>
            )}
            {tab === 'guestbook' && <Guestbook userId={userId} />}
            {tab === 'widgets' && (user.widgets?.length ? <ProfileWidgets user={user} /> : <div className="empty-state small">Noch keine Widgets 🧩</div>)}
            {tab === 'stats' && (!stats ? <div className="msg-loading"><Spinner /></div> : (
              <div className="badge-grid compact">
                {stats.badges.filter((b) => b.earned).map((b) => (
                  <div key={b.id} className="badge-card"><BadgeIcon badge={b} size="lg" /><div className="bc-text"><b>{b.name}</b><span>{b.desc}</span></div></div>
                ))}
                <button type="button" className="btn secondary" onClick={() => openModal('stats', { userId })}>Alle Statistiken</button>
              </div>
            ))}
            {tab === 'mutual' && (
              <div className="fp-mutual">
                <h4>Gemeinsame Server</h4>
                {(extra?.mutualServers || []).map((id) => servers[id] && (
                  <button key={id} type="button" className="fp-row" onClick={() => { closeModal(); openServer(id); }}><ServerIcon server={servers[id]} size={32} /> {servers[id].name}</button>
                ))}
                {!extra?.mutualServers?.length && <p className="muted">Keine gemeinsamen Server.</p>}
                <h4>Gemeinsame Freunde</h4>
                {(extra?.mutualFriends || []).map((id) => (
                  <button key={id} type="button" className="fp-row" onClick={() => { closeModal(); openDmWith(id); }}><Avatar userId={id} size={32} /> <NameTag userId={id} /></button>
                ))}
                {!extra?.mutualFriends?.length && <p className="muted">Keine gemeinsamen Freunde.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function socialModal(modal) {
  const p = modal.props || {};
  switch (modal.type) {
    case 'stats': return <StatsModal {...p} />;
    case 'claim': return <ClaimModal {...p} />;
    case 'profile': return <FullProfileModal {...p} />;
    default: return null;
  }
}

