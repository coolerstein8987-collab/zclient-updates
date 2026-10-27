import { memo, useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.js';
import { useSettings } from '../lib/settings.js';
import { cx, hashColor, initials } from '../lib/format.js';

/** Stellt ein Bild mit gespeichertem Zuschnitt (Zoom + Mittelpunkt) dar – funktioniert auch mit animierten GIFs. */
export function CroppedImage({ src, crop, aspect = 1, className, alt = '', still = false }) {
  const style = { position: 'absolute' };
  if (crop) {
    const r = crop.w / crop.h;
    const wp = crop.zoom * Math.max(1, r / aspect) * 100;
    const hp = crop.zoom * Math.max(1, aspect / r) * 100;
    Object.assign(style, { width: `${wp}%`, height: `${hp}%`, left: `${50 - crop.cx * wp}%`, top: `${50 - crop.cy * hp}%`, maxWidth: 'none' });
  } else {
    Object.assign(style, { inset: 0, width: '100%', height: '100%', objectFit: 'cover' });
  }
  return (
    <div className={cx('crop-frame', className)}>
      {still ? <StillImage src={src} style={style} /> : <img src={src} alt={alt} style={style} draggable={false} loading="lazy" />}
    </div>
  );
}

/** Erstes Frame eines GIFs als Standbild (für "GIFs nur bei Hover abspielen"). */
export function StillImage({ src, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = ref.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = src;
  }, [src]);
  return <canvas ref={ref} style={style} />;
}

const isAnimated = (src) => /\.(gif|webp)$/i.test(src || '');

export const Avatar = memo(function Avatar({ userId, user: userProp, size = 40, status, showStatus = false, speaking = false, decoration = true, className, onClick, hoverPlay }) {
  const storeUser = useStore((s) => (userId ? s.users[userId] : null));
  const presence = useStore((s) => (showStatus && userId ? s.presences[userId] : null));
  const animMode = useSettings((s) => s.animatedAvatars);
  const [hover, setHover] = useState(false);
  const user = userProp || storeUser;
  const st = status || presence || 'offline';
  const deco = decoration && user?.style?.decoration;
  const still = animMode === 'hover' && isAnimated(user?.avatar) && !hover && !hoverPlay;
  const accent = user?.style?.accent1;
  return (
    <div
      className={cx('avatar', speaking && 'speaking', deco && `deco deco-${deco}`, className)}
      style={{ width: size, height: size, '--av-size': `${size}px` }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="avatar-img" style={!user?.avatar ? { background: accent ? `linear-gradient(135deg, ${accent}, ${user?.style?.accent2 || accent})` : hashColor(user?.id || '?', 55, 45) } : undefined}>
        {user?.avatar
          ? <CroppedImage src={user.avatar} crop={user.avatarCrop} still={still} />
          : <span className="avatar-initials" style={{ fontSize: size * 0.38 }}>{initials(user?.displayName || user?.username)}</span>}
      </div>
      {deco && <span className="deco-layer" />}
      {showStatus && <span className={cx('status-dot', `st-${st}`)} />}
    </div>
  );
});

export function ServerIcon({ server, size = 48, className }) {
  if (!server) return null;
  return (
    <div className={cx('server-icon-img', className)} style={{ width: size, height: size, background: server.icon ? undefined : `linear-gradient(135deg, ${server.accent || hashColor(server.id, 60, 50)}, ${hashColor(server.name, 60, 35)})` }}>
      {server.icon
        ? <CroppedImage src={server.icon} crop={server.iconCrop} />
        : <span style={{ fontSize: size * 0.34 }}>{initials(server.name)}</span>}
    </div>
  );
}

export function NameTag({ userId, user: userProp, serverId, className, onClick }) {
  const user = useStore((s) => userProp || s.users[userId]);
  const nick = useStore((s) => (serverId ? s.servers[serverId]?.members[userId || user?.id]?.nickname : null));
  const st = user?.style || {};
  const style = {};
  if (st.nameColor) {
    if (st.nameColor2 && st.nameEffect !== 'glow') {
      style.backgroundImage = `linear-gradient(90deg, ${st.nameColor}, ${st.nameColor2}, ${st.nameColor})`;
    } else style.color = st.nameColor;
    style['--name-glow'] = st.nameColor;
  }
  return (
    <span className={cx('name-tag', st.nameFont && `nf-${st.nameFont}`, st.nameEffect && `ne-${st.nameEffect}`, st.nameColor2 && st.nameEffect !== 'glow' && 'grad', className)} style={style} onClick={onClick}>
      {nick || user?.displayName || user?.username || 'Unbekannt'}
    </span>
  );
}
