import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, UserPlus, Check, Clock, MoreHorizontal, Pencil, Phone, Crown, Shield, Ban, UserMinus, Copy } from 'lucide-react';
import { Avatar, CroppedImage, NameTag, ServerIcon } from './Avatar.jsx';
import { useStore, openDmWith, openSettings, openMenu, toast, run, sendMessage, dmList, openPopout } from '../lib/store.js';
import { useSettings } from '../lib/settings.js';
import { api } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.jsx';
import { useFloating, useTilt, useClickOutside } from './ui.jsx';
import { cx, formatDate, hashColor, STATUS_LABEL, copyText } from '../lib/format.js';
import { voice } from '../lib/voice.js';

export const DECORATIONS = [
  { id: '', name: 'Keine' },
  { id: 'aurora', name: 'Aurora-Ring' },
  { id: 'neon', name: 'Neon-Puls' },
  { id: 'fire', name: 'Flammen' },
  { id: 'sakura', name: 'Sakura' },
  { id: 'halo', name: 'Heiligenschein' },
  { id: 'catears', name: 'Katzenohren' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'hearts', name: 'Herzen' },
];

export const EFFECTS = [
  { id: '', name: 'Kein Effekt' },
  { id: 'sparkles', name: 'Funkeln ✨' },
  { id: 'snow', name: 'Schnee ❄️' },
  { id: 'hearts', name: 'Herzen 💕' },
  { id: 'stars', name: 'Sternenhimmel 🌌' },
  { id: 'petals', name: 'Kirschblüten 🌸' },
  { id: 'embers', name: 'Glut 🔥' },
  { id: 'bubbles', name: 'Blasen 🫧' },
];

export const NAME_FONTS = [
  { id: '', name: 'Standard' },
  { id: 'grotesk', name: 'Grotesk' },
  { id: 'serif', name: 'Elegant' },
  { id: 'mono', name: 'Mono' },
  { id: 'script', name: 'Script' },
  { id: 'pixel', name: 'Pixel' },
  { id: 'marker', name: 'Marker' },
];

export const NAME_EFFECTS = [
  { id: '', name: 'Keiner' },
  { id: 'glow', name: 'Glühen' },
  { id: 'shimmer', name: 'Schimmern' },
  { id: 'rainbow', name: 'Regenbogen' },
  { id: 'wave', name: 'Welle' },
];

export function Tag({ label }) {
  return <span className="tag-chip" style={{ '--tag': hashColor(label.toLowerCase(), 75, 65) }}>{label}</span>;
}

function EffectLayer({ effect }) {
  const items = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 53) % 100}%`,
    delay: `${-((i * 7) % 11) * 0.7}s`,
    dur: `${6 + ((i * 13) % 7)}s`,
    size: 0.6 + ((i * 17) % 10) / 10,
  })), []);
  if (!effect) return null;
  return (
    <div className={`pc-effect fx-${effect}`} aria-hidden>
      {items.map((it, i) => <i key={i} style={{ left: it.left, animationDelay: it.delay, animationDuration: it.dur, '--s': it.size }} />)}
    </div>
  );
}

export function ProfileBanner({ user, height }) {
  const st = user?.style || {};
  return (
    <div className="pc-banner" style={{ height, background: user?.banner ? undefined : `linear-gradient(135deg, ${st.accent1 || '#7c5cff'}, ${st.accent2 || '#00d4ff'})` }}>
      {user?.banner && <CroppedImage src={user.banner} crop={user.bannerCrop} aspect={2.5} />}
    </div>
  );
}

export function ProfileCard({ userId, user: override, serverId, extra, actions = true, onAction, className, preview = false }) {
  const storeUser = useStore((s) => s.users[userId]);
  const me = useStore((s) => s.me);
  const presence = useStore((s) => s.presences[userId]);
  const rel = useStore((s) => s.relationships[userId]?.type || 0);
  const member = useStore((s) => (serverId ? s.servers[serverId]?.members[userId] : null));
  const servers = useStore((s) => s.servers);
  const { tilt3d, tiltStrength, markdown } = useSettings();
  const tiltRef = useTilt(tiltStrength * 0.5, tilt3d && !preview);
  const user = override || storeUser;
  if (!user) return null;
  const st = user.style || {};
  const isMe = user.id === me?.id;
  const status = isMe ? me.status : presence;
  const badges = [];
  if (user.createdAt && user.createdAt < Date.UTC(2027, 0, 1)) badges.push({ icon: '🚀', label: 'Zync-Pionier' });
  if (Object.values(servers).some((s) => s.ownerId === user.id)) badges.push({ icon: '👑', label: 'Server-Gründer' });
  if (rel === 1) badges.push({ icon: '🤝', label: 'Freund' });
  if (user.tags?.length >= 5) badges.push({ icon: '🏷️', label: 'Tag-Sammler' });

  return (
    <div
      ref={tiltRef}
      className={cx('profile-card', className, preview && 'preview')}
      style={{ '--p1': st.accent1 || '#7c5cff', '--p2': st.accent2 || '#00d4ff' }}
    >
      <div className="pc-inner">
        <ProfileBanner user={user} />
        <div className="pc-head">
          <Avatar user={user} userId={user.id} size={92} showStatus status={status === 'invisible' ? 'offline' : status} className="pc-avatar" />
          {badges.length > 0 && (
            <div className="pc-badges">
              {badges.map((b) => <span key={b.label} className="badge" data-tip={b.label}>{b.icon}</span>)}
            </div>
          )}
        </div>
        <div className="pc-body">
          <div className="pc-names">
            <NameTag user={user} serverId={serverId} className="pc-display" />
            <div className="pc-username">
              @{user.username}
              {user.pronouns && <><span className="dot-sep">•</span>{user.pronouns}</>}
            </div>
          </div>
          {(user.customStatus || st.vibe) && (
            <div className="pc-status-bubble">
              {user.customStatus && <div>{user.customStatus}</div>}
              {st.vibe && <div className="pc-vibe"><span>{st.vibeEmoji || '🎧'}</span> {st.vibe}</div>}
            </div>
          )}
          {user.tags?.length > 0 && <div className="pc-tags">{user.tags.map((t) => <Tag key={t} label={t} />)}</div>}
          {user.bio && (
            <div className="pc-section">
              <h4>Über mich</h4>
              <div className="pc-bio">{renderMarkdown(user.bio, { markdown, spoilers: 'click' })}</div>
            </div>
          )}
          <div className="pc-section pc-since">
            <div>
              <h4>Mitglied seit</h4>
              <span>{formatDate(user.createdAt || Date.now())}</span>
            </div>
            {member && (
              <div>
                <h4>Auf dem Server seit</h4>
                <span>{formatDate(member.joinedAt)}</span>
              </div>
            )}
          </div>
          {member && member.role !== 'member' && (
            <div className="pc-section">
              <h4>Rolle</h4>
              <span className={cx('role-pill', member.role)}>{member.role === 'owner' ? <><Crown size={12} /> Besitzer</> : <><Shield size={12} /> Admin</>}</span>
            </div>
          )}
          {extra && (extra.mutualServers?.length > 0 || extra.mutualFriends?.length > 0) && (
            <div className="pc-section pc-mutuals">
              {extra.mutualServers?.length > 0 && (
                <div>
                  <h4>{extra.mutualServers.length} gemeinsame Server</h4>
                  <div className="mutual-row">{extra.mutualServers.slice(0, 6).map((id) => servers[id] && <span key={id} data-tip={servers[id].name}><ServerIcon server={servers[id]} size={28} /></span>)}</div>
                </div>
              )}
              {extra.mutualFriends?.length > 0 && (
                <div>
                  <h4>{extra.mutualFriends.length} gemeinsame Freunde</h4>
                  <div className="mutual-row">{extra.mutualFriends.slice(0, 6).map((id) => <span key={id}><Avatar userId={id} size={28} decoration={false} /></span>)}</div>
                </div>
              )}
            </div>
          )}
          {actions && !preview && <ProfileActions user={user} rel={rel} isMe={isMe} onAction={onAction} />}
          {preview && status && <div className="pc-preview-status"><span className={`status-dot inline st-${status === 'invisible' ? 'offline' : status}`} /> {STATUS_LABEL[status]}</div>}
        </div>
      </div>
      <EffectLayer effect={st.effect} />
    </div>
  );
}

function ProfileActions({ user, rel, isMe, onAction }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn) => {
    setBusy(true);
    try { await fn(); } catch { /* run() zeigt Toast */ } finally { setBusy(false); }
  };
  if (isMe) {
    return (
      <div className="pc-actions">
        <button type="button" className="btn primary block" onClick={() => { onAction?.(); openSettings('profile'); }}><Pencil size={16} /> Profil bearbeiten</button>
      </div>
    );
  }
  const more = (e) => openMenu(e, [
    rel === 1 && { label: 'Freund entfernen', icon: <UserMinus size={16} />, danger: true, onClick: () => run(() => api(`/relationships/${user.id}`, { method: 'DELETE' }), 'Freund entfernt') },
    rel !== 2 && { label: 'Blockieren', icon: <Ban size={16} />, danger: true, onClick: () => run(() => api(`/relationships/${user.id}/block`, { method: 'POST' }), 'Nutzer blockiert') },
    rel === 2 && { label: 'Entblocken', icon: <Ban size={16} />, onClick: () => run(() => api(`/relationships/${user.id}`, { method: 'DELETE' }), 'Blockierung aufgehoben') },
    { label: 'Benutzernamen kopieren', icon: <Copy size={16} />, onClick: () => { copyText(user.username); toast('Kopiert!', 'success'); } },
  ].filter(Boolean));
  return (
    <div className="pc-actions">
      <button type="button" className="btn primary" onClick={() => { onAction?.(); openDmWith(user.id); }}><MessageCircle size={16} /> Nachricht</button>
      {rel === 1 && (
        <button
          type="button"
          className="btn secondary icon-only"
          data-tip="Anrufen"
          onClick={async () => {
            onAction?.();
            await openDmWith(user.id);
            const ch = dmList(useStore.getState()).find((c) => c.recipients?.[0] === user.id);
            if (ch) voice.join(ch.id);
          }}
        ><Phone size={16} /></button>
      )}
      {rel === 0 && <button type="button" disabled={busy} className="btn success" onClick={() => act(() => run(() => api('/relationships', { method: 'POST', body: { userId: user.id } }), 'Freundschaftsanfrage gesendet'))}><UserPlus size={16} /> Hinzufügen</button>}
      {rel === 4 && <button type="button" className="btn secondary" disabled><Clock size={16} /> Gesendet</button>}
      {rel === 3 && <button type="button" disabled={busy} className="btn success" onClick={() => act(() => run(() => api(`/relationships/${user.id}`, { method: 'PUT' }), 'Ihr seid jetzt Freunde!'))}><Check size={16} /> Annehmen</button>}
      <button type="button" className="btn secondary icon-only" onClick={more} aria-label="Mehr"><MoreHorizontal size={16} /></button>
    </div>
  );
}

export function ProfilePopout() {
  const popout = useStore((s) => s.popout);
  const close = () => useStore.setState({ popout: null });
  const [extra, setExtra] = useState(null);
  const [ref, pos] = useFloating(popout?.rect, { width: 340, height: 520 });
  const [msg, setMsg] = useState('');
  const me = useStore((s) => s.me);
  useClickOutside(ref, close, !!popout);
  useEffect(() => {
    setExtra(null);
    setMsg('');
    if (!popout) return undefined;
    const ctrl = new AbortController();
    api(`/users/${popout.userId}`, { signal: ctrl.signal }).then((d) => {
      setExtra(d);
      useStore.setState((s) => ({ users: { ...s.users, [d.user.id]: { ...s.users[d.user.id], ...d.user } } }));
    }).catch(() => {});
    const esc = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => { ctrl.abort(); window.removeEventListener('keydown', esc); };
  }, [popout]);
  if (!popout) return null;
  const sendQuick = async (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    await openDmWith(popout.userId);
    const ch = dmList(useStore.getState()).find((c) => c.recipients?.[0] === popout.userId);
    if (ch) sendMessage(ch.id, { content: msg.trim() });
    close();
  };
  return (
    <div ref={ref} className="popout-layer" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      <ProfileCard userId={popout.userId} serverId={popout.serverId} extra={extra} onAction={close} className="popout" />
      {popout.userId !== me?.id && (
        <form className="popout-quick" onSubmit={sendQuick}>
          <input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Nachricht an @${useStore.getState().users[popout.userId]?.username || ''}`} />
        </form>
      )}
    </div>
  );
}

export { openPopout };
