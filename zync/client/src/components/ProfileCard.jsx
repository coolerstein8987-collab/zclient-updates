import { useEffect, useMemo, useState } from 'react';
import {
  MessageCircle, UserPlus, Check, Clock, MoreHorizontal, Pencil, Phone, Crown, Shield, Ban, UserMinus, Copy, Lock, Maximize2, Unlock,
} from 'lucide-react';
import { Avatar, CroppedImage, NameTag } from './Avatar.jsx';
import {
  useStore, openDmWith, openSettings, openMenu, toast, run, sendMessage, dmList, openPopout, openModal, memberRoles, storyGroups,
} from '../lib/store.js';
import { useSettings } from '../lib/settings.js';
import { api } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.jsx';
import { useFloating, useTilt, useClickOutside } from './ui.jsx';
import { cx, formatDate, hashColor, STATUS_LABEL, copyText } from '../lib/format.js';
import { voice } from '../lib/voice.js';
import { ServerTagChip, BadgeRow, ProfileWidgets, ActivityLine, ClaimChip, StreakChip, endClaim } from './Social.jsx';
import { openStories } from './Stories.jsx';
import { BirthdayCake, ProfileSong } from './Extras.jsx';

export function Tag({ label }) {
  return <span className="tag-chip" style={{ '--tag': hashColor(label.toLowerCase(), 75, 65) }}>{label}</span>;
}

export function EffectLayer({ effect }) {
  const items = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 53) % 100}%`,
    delay: `${-((i * 7) % 11) * 0.7}s`,
    dur: `${6 + ((i * 13) % 7)}s`,
    size: 0.6 + ((i * 17) % 10) / 10,
    hue: (i * 47) % 360,
  })), []);
  if (!effect) return null;
  return (
    <div className={`pc-effect fx-${effect}`} aria-hidden>
      {items.map((it, i) => <i key={i} style={{ left: it.left, animationDelay: it.delay, animationDuration: it.dur, '--s': it.size, '--h': it.hue }} />)}
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

/** Bio mit Markdown – @Erwähnungen werden nur zu Freunden des Profil-Inhabers verlinkt. */
export function BioText({ user }) {
  const markdown = useSettings((s) => s.markdown);
  const users = useStore((s) => s.users);
  const ctx = {
    markdown,
    spoilers: 'click',
    resolveUser: (name) => {
      const id = user.bioLinks?.[name.toLowerCase()];
      return id ? (users[id] || { id, displayName: name }) : null;
    },
    nameOf: (id) => users[id]?.displayName,
    onMention: (id, e) => openPopout(id, e),
  };
  return <>{renderMarkdown(user.bio, ctx)}</>;
}

export function ProfileCard({ userId, user: override, serverId, extra, actions = true, onAction, className, preview = false, hideWidgets = false }) {
  const storeUser = useStore((s) => s.users[userId]);
  const me = useStore((s) => s.me);
  const presence = useStore((s) => s.presences[userId]);
  const rel = useStore((s) => s.relationships[userId]?.type || 0);
  const member = useStore((s) => (serverId ? s.servers[serverId]?.members[userId] : null));
  const server = useStore((s) => (serverId ? s.servers[serverId] : null));
  const roles = useMemo(() => (server ? memberRoles({ servers: { [serverId]: server } }, serverId, userId) : []), [server, serverId, userId]);
  const dm = useStore((s) => dmList(s).find((c) => c.recipients?.[0] === userId));
  const stories = useStore((s) => s.stories);
  const hasStory = useMemo(() => storyGroups({ stories, me }).find((g) => g.userId === userId), [stories, me, userId]);
  const { tilt3d, tiltStrength } = useSettings();
  const tiltRef = useTilt(tiltStrength * 0.5, tilt3d && !preview);
  const user = override || storeUser;
  if (!user) return null;
  const st = user.style || {};
  const isMe = user.id === me?.id;
  const status = isMe ? me.status : presence;

  return (
    <div
      ref={tiltRef}
      className={cx('profile-card', className, preview && 'preview', st.frame && `frame-${st.frame}`)}
      style={{ '--p1': st.accent1 || '#7c5cff', '--p2': st.accent2 || '#00d4ff' }}
    >
      <div className="pc-inner">
        <ProfileBanner user={user} />
        <div className="pc-head">
          <button
            type="button"
            className={cx('pc-avatar-btn', hasStory && (hasStory.unseen ? 'story-ring' : 'story-ring seen'))}
            onClick={() => hasStory && !preview && openStories(user.id)}
            data-tip={hasStory ? 'Story ansehen' : undefined}
          >
            <Avatar user={user} userId={user.id} size={92} showStatus status={status === 'invisible' ? 'offline' : status} className="pc-avatar" />
          </button>
          <BadgeRow badges={user.badges} max={7} userId={user.id} />
        </div>
        <div className="pc-body">
          <div className="pc-names">
            <div className="pc-name-row">
              <NameTag user={user} serverId={serverId} className="pc-display" />
              <BirthdayCake userId={user.id} />
              {user.serverTag && <ServerTagChip tag={user.serverTag} />}
            </div>
            <div className="pc-username">
              @{user.username}
              {user.pronouns && <><span className="dot-sep">•</span>{user.pronouns}</>}
              {!isMe && dm?.streak?.count > 0 && <StreakChip streak={dm.streak} size="sm" />}
            </div>
          </div>
          {(user.customStatus || st.vibe) && (
            <div className="pc-status-bubble">
              {user.customStatus && <div>{user.customStatus}</div>}
              {st.vibe && <div className="pc-vibe"><span>{st.vibeEmoji || '🎧'}</span> {st.vibe}</div>}
            </div>
          )}
          {user.claim && <ClaimChip claim={user.claim} viewerId={user.id} />}
          <ProfileSong song={user.song} />
          <ActivityLine activity={user.activity} />
          {user.tags?.length > 0 && <div className="pc-tags">{user.tags.map((t) => <Tag key={t} label={t} />)}</div>}
          {user.bio && (
            <div className="pc-section">
              <h4>Über mich</h4>
              <div className="pc-bio"><BioText user={user} /></div>
            </div>
          )}
          {!hideWidgets && <ProfileWidgets user={user} />}
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
          {member && (member.role !== 'member' || roles.length > 0) && (
            <div className="pc-section">
              <h4>Rollen</h4>
              <div className="role-chips">
                {member.role === 'owner' && <span className="role-pill owner"><Crown size={12} /> Besitzer</span>}
                {member.role === 'admin' && <span className="role-pill admin"><Shield size={12} /> Admin</span>}
                {roles.map((r) => <span key={r.id} className="role-pill" style={{ '--rc': r.color || '#99aab5' }}><i className="rp-dot" />{r.icon && <span>{r.icon}</span>}{r.name}</span>)}
              </div>
            </div>
          )}
          {extra && (extra.mutualServers?.length > 0 || extra.mutualFriends?.length > 0) && (
            <div className="pc-section pc-mutuals">
              {extra.mutualFriends?.length > 0 && (
                <div>
                  <h4>{extra.mutualFriends.length} gemeinsame Freunde</h4>
                  <div className="mutual-row">{extra.mutualFriends.slice(0, 8).map((id) => <span key={id}><Avatar userId={id} size={28} decoration={false} /></span>)}</div>
                </div>
              )}
            </div>
          )}
          {actions && !preview && <ProfileActions user={user} rel={rel} isMe={isMe} onAction={onAction} serverId={serverId} />}
          {preview && status && <div className="pc-preview-status"><span className={`status-dot inline st-${status === 'invisible' ? 'offline' : status}`} /> {STATUS_LABEL[status]}</div>}
        </div>
      </div>
      <EffectLayer effect={st.effect} />
      {st.frame === 'wings' && <><span className="wing left" /><span className="wing right" /></>}
    </div>
  );
}

function ProfileActions({ user, rel, isMe, onAction, serverId }) {
  const [busy, setBusy] = useState(false);
  const myClaim = useStore((s) => s.users[s.me.id]?.claim);
  const act = async (fn) => {
    setBusy(true);
    try { await fn(); } catch { /* run() zeigt Toast */ } finally { setBusy(false); }
  };
  const full = () => { onAction?.(); openModal('profile', { userId: user.id, serverId }); };
  if (isMe) {
    return (
      <div className="pc-actions">
        <button type="button" className="btn primary" onClick={() => { onAction?.(); openSettings('profile'); }}><Pencil size={16} /> Profil bearbeiten</button>
        <button type="button" className="btn secondary icon-only" data-tip="Vollständiges Profil" onClick={full}><Maximize2 size={16} /></button>
      </div>
    );
  }
  const claimWithThem = myClaim && (myClaim.fromId === user.id || myClaim.toId === user.id) ? myClaim : null;
  const more = (e) => openMenu(e, [
    { label: 'Vollständiges Profil', icon: <Maximize2 size={16} />, onClick: full },
    rel === 1 && !claimWithThem && { label: 'Claimen …', icon: <Lock size={16} />, onClick: () => { onAction?.(); openModal('claim', { userId: user.id }); } },
    claimWithThem && { label: 'Claim beenden', icon: <Unlock size={16} />, onClick: () => endClaim(claimWithThem) },
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
  const [ref, pos] = useFloating(popout?.rect, { width: 340, height: 560 });
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
