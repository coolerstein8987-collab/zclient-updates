import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, ScreenShare, ScreenShareOff, PhoneOff, Maximize2, Minimize2,
  PictureInPicture2, Settings, Volume2, Radio, Hand, Signal, AudioLines,
} from 'lucide-react';
import { SoundboardPopover } from './Soundboard.jsx';
import { useStore, openSettings, openMenu, displayName } from '../lib/store.js';
import { useSettings, setSetting } from '../lib/settings.js';
import { useVoice, voice } from '../lib/voice.js';
import { cx, formatDuration } from '../lib/format.js';
import { Avatar, CroppedImage } from './Avatar.jsx';
import { useClickOutside, Segmented } from './ui.jsx';

const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

function VideoEl({ stream, mirror, contain, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <video ref={ref} className={cx('tile-video', mirror && 'mirror', contain && 'contain', className)} autoPlay playsInline muted />;
}

function useParticipants(channelId) {
  const room = useStore((s) => s.voice[channelId]);
  return useMemo(() => Object.values(room || {}).sort((a, b) => a.joinedAt - b.joinedAt), [room]);
}

function Tile({ p, kind, channelId, focused, onFocus, serverId }) {
  const me = useStore((s) => s.me);
  const user = useStore((s) => s.users[p.userId]);
  const name = useStore((s) => displayName(s, p.userId, serverId));
  const speaking = useVoice((s) => !!s.speaking[p.userId]);
  const isMe = p.userId === me.id;
  const stream = useVoice((s) => {
    if (kind === 'avatar') return null;
    if (isMe) return kind === 'screen' ? s.local.screen : s.local.cam;
    const id = kind === 'screen' ? p.streams?.screen : p.streams?.cam;
    return s.remote[p.userId]?.[id] || null;
  });
  const mirror = useSettings((s) => s.mirrorCam) && isMe && kind === 'cam';
  const vol = useSettings((s) => s.userVolumes[p.userId] ?? 100);
  const ref = useRef(null);
  const [fs, setFs] = useState(false);
  const [bubbles, setBubbles] = useState([]);
  useEffect(() => {
    if (kind === 'screen') return undefined;
    const fn = (e) => {
      if (e.detail.userId !== p.userId) return;
      const id = Math.random();
      setBubbles((b) => [...b, { id, emoji: e.detail.emoji, name: e.detail.name }]);
      setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== id)), 2200);
    };
    window.addEventListener('zync:sound', fn);
    return () => window.removeEventListener('zync:sound', fn);
  }, [kind, p.userId]);
  useEffect(() => {
    const fn = () => setFs(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);
  const toggleFs = (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else ref.current?.requestFullscreen?.();
  };
  const pip = (e) => {
    e.stopPropagation();
    const v = ref.current?.querySelector('video');
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else v?.requestPictureInPicture?.().catch(() => {});
  };
  const menu = (e) => {
    if (isMe) return;
    openMenu(e, [
      { custom: (
        <div className="menu-slider" onClick={(ev) => ev.stopPropagation()}>
          <div className="menu-slider-label"><Volume2 size={14} /> Lautstärke von {name}: {vol}%</div>
          <input
            type="range" min={0} max={200} value={vol} className="slider" style={{ '--pct': `${vol / 2}%` }}
            onChange={(ev) => setSetting((s) => ({ userVolumes: { ...s.userVolumes, [p.userId]: Number(ev.target.value) } }))}
          />
        </div>
      ) },
      { label: vol === 0 ? 'Stummschaltung aufheben' : 'Für mich stummschalten', onClick: () => setSetting((s) => ({ userVolumes: { ...s.userVolumes, [p.userId]: vol === 0 ? 100 : 0 } })) },
    ]);
  };
  const hasVideo = kind !== 'avatar' && stream;
  const st = user?.style || {};
  return (
    <div
      ref={ref}
      className={cx('tile', `tile-${kind}`, speaking && kind !== 'screen' && 'speaking', focused && 'focused')}
      onClick={() => onFocus?.(`${p.userId}:${kind}`)}
      onContextMenu={menu}
      style={{ '--p1': st.accent1 || '#7c5cff', '--p2': st.accent2 || '#00d4ff' }}
    >
      {hasVideo ? <VideoEl stream={stream} mirror={mirror} contain={kind === 'screen' || fs} /> : (
        <div className="tile-avatar-bg">
          {user?.banner ? <CroppedImage src={user.banner} crop={user.bannerCrop} aspect={2.5} className="tile-banner" /> : <div className="tile-grad" />}
          <Avatar user={user} userId={p.userId} size={focused ? 112 : 76} speaking={speaking} />
        </div>
      )}
      {bubbles.map((b) => <span key={b.id} className="sound-bubble"><span>{b.emoji}</span>{b.name}</span>)}
      <div className="tile-label">
        {kind === 'screen' && <span className="live-pill">LIVE</span>}
        <span className="tile-name">{name}{kind === 'screen' ? ' – Bildschirm' : ''}</span>
        {kind !== 'screen' && (p.deafened ? <HeadphoneOff size={14} className="tile-ico" /> : p.muted ? <MicOff size={14} className="tile-ico" /> : null)}
      </div>
      {hasVideo && (
        <div className="tile-tools">
          {document.pictureInPictureEnabled && <button type="button" onClick={pip} data-tip="Bild-in-Bild"><PictureInPicture2 size={16} /></button>}
          <button type="button" onClick={toggleFs} data-tip={fs ? 'Vollbild beenden' : 'Vollbild'}>{fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        </div>
      )}
    </div>
  );
}

export function CallGrid({ channelId, serverId, compact }) {
  const participants = useParticipants(channelId);
  const [focus, setFocus] = useState(null);
  const tiles = useMemo(() => {
    const t = [];
    for (const p of participants) {
      if (p.screen) t.push({ p, kind: 'screen', key: `${p.userId}:screen` });
      t.push({ p, kind: p.video ? 'cam' : 'avatar', key: `${p.userId}:${p.video ? 'cam' : 'avatar'}` });
    }
    return t;
  }, [participants]);
  const autoFocus = tiles.find((t) => t.kind === 'screen')?.key;
  const focusKey = focus === 'none' ? null : (tiles.some((t) => t.key === focus) ? focus : autoFocus);
  const focused = tiles.find((t) => t.key === focusKey);
  const toggle = (key) => setFocus((f) => (f === key || (!f && key === autoFocus) ? 'none' : key));
  if (!tiles.length) return <div className="call-empty">Noch niemand hier – sei der Erste! 🎧</div>;
  if (focused && tiles.length > 1) {
    return (
      <div className={cx('call-grid spotlight', compact && 'compact')}>
        <div className="spot-main"><Tile {...focused} channelId={channelId} serverId={serverId} focused onFocus={toggle} /></div>
        <div className="spot-strip">{tiles.filter((t) => t !== focused).map((t) => <Tile key={t.key} {...t} channelId={channelId} serverId={serverId} onFocus={toggle} />)}</div>
      </div>
    );
  }
  const n = tiles.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  return (
    <div className={cx('call-grid', compact && 'compact')} style={{ '--cols': cols }}>
      {tiles.map((t) => <Tile key={t.key} {...t} channelId={channelId} serverId={serverId} onFocus={toggle} />)}
    </div>
  );
}

function StreamPopover({ onClose }) {
  const s = useSettings();
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  return (
    <div ref={ref} className="stream-popover">
      <h4><Radio size={16} /> Bildschirm übertragen</h4>
      <div className="sp-label">Auflösung</div>
      <Segmented size="sm" value={s.streamRes} onChange={(v) => setSetting({ streamRes: v })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '1440', label: '1440p' }, { value: '2160', label: '4K' }]} />
      <div className="sp-label">Bildrate</div>
      <Segmented size="sm" value={s.streamFps} onChange={(v) => setSetting({ streamFps: v })} options={[{ value: 15, label: '15 FPS' }, { value: 30, label: '30 FPS' }, { value: 60, label: '60 FPS' }]} />
      <div className="sp-label">Optimiert für</div>
      <Segmented size="sm" value={s.streamContent} onChange={(v) => setSetting({ streamContent: v })} options={[{ value: 'motion', label: '🎮 Flüssig' }, { value: 'detail', label: '📝 Schärfe' }]} />
      <label className="sp-check"><input type="checkbox" checked={s.streamAudio} onChange={(e) => setSetting({ streamAudio: e.target.checked })} /> Systemton mit übertragen</label>
      <button type="button" className="btn primary block" onClick={() => { onClose(); voice.toggleScreen(); }}>Live gehen</button>
      <p className="sp-note">Kostenlos in voller Qualität – kein Abo nötig. ✨</p>
    </div>
  );
}

export function CallControls({ compact }) {
  const v = useVoice();
  const inputMode = useSettings((s) => s.inputMode);
  const [streamOpen, setStreamOpen] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const states = Object.values(v.peerStates);
  const quality = states.some((s) => s === 'failed' || s === 'disconnected') ? 'bad' : states.some((s) => s === 'connecting' || s === 'new') ? 'mid' : 'good';
  return (
    <div className={cx('call-controls', compact && 'compact')}>
      <div className="cc-info">
        <Signal size={16} className={`q-${v.status === 'connected' ? quality : 'mid'}`} />
        <span>{v.status === 'connected' ? formatDuration(now - v.joinedAt) : 'Verbinde…'}</span>
      </div>
      <div className="cc-buttons">
        <button type="button" className={cx('cc-btn', (v.muted || v.noMic) && 'off')} onClick={() => voice.toggleMute()} data-tip={v.muted ? 'Stummschaltung aufheben' : 'Stummschalten'}>{v.muted || v.noMic ? <MicOff /> : <Mic />}</button>
        <button type="button" className={cx('cc-btn', v.deafened && 'off')} onClick={() => voice.toggleDeafen()} data-tip={v.deafened ? 'Ton an' : 'Ton aus'}>{v.deafened ? <HeadphoneOff /> : <Headphones />}</button>
        <button type="button" className={cx('cc-btn', v.video && 'on')} onClick={() => voice.toggleVideo()} data-tip={v.video ? 'Kamera aus' : 'Kamera an'}>{v.video ? <Video /> : <VideoOff />}</button>
        {canShareScreen && <div className="cc-stream-wrap">
          <button type="button" className={cx('cc-btn', v.screen && 'on live')} onClick={() => (v.screen ? voice.stopScreen() : setStreamOpen((o) => !o))} data-tip={v.screen ? 'Übertragung beenden' : 'Bildschirm teilen'}>{v.screen ? <ScreenShareOff /> : <ScreenShare />}</button>
          {streamOpen && <StreamPopover onClose={() => setStreamOpen(false)} />}
        </div>}
        {inputMode === 'ptt' && (
          <button
            type="button"
            className={cx('cc-btn ptt', v.ptt && 'on')}
            onPointerDown={() => voice.setPtt(true)}
            onPointerUp={() => voice.setPtt(false)}
            onPointerLeave={() => v.ptt && voice.setPtt(false)}
            data-tip="Gedrückt halten zum Sprechen"
          ><Hand /></button>
        )}
        <div className="cc-stream-wrap">
          <button type="button" className={cx('cc-btn', soundsOpen && 'on')} onClick={() => setSoundsOpen((o) => !o)} data-tip="Soundboard"><AudioLines /></button>
          {soundsOpen && <SoundboardPopover onClose={() => setSoundsOpen(false)} />}
        </div>
        <button type="button" className="cc-btn" onClick={() => openSettings('voice')} data-tip="Sprach-Einstellungen"><Settings /></button>
        <button type="button" className="cc-btn hangup" onClick={() => voice.leave()} data-tip="Auflegen"><PhoneOff /></button>
      </div>
    </div>
  );
}

export function VoiceRoom({ channel }) {
  const v = useVoice();
  const participants = useParticipants(channel.id);
  const server = useStore((s) => s.servers[channel.serverId]);
  const connectedHere = v.channelId === channel.id;
  return (
    <div className="voice-room">
      {connectedHere ? (
        <>
          <div className="voice-stage"><CallGrid channelId={channel.id} serverId={channel.serverId} /></div>
          <CallControls />
        </>
      ) : (
        <div className="voice-lobby">
          <div className="vl-card">
            <div className="vl-icon"><Volume2 size={40} /></div>
            <h2>{channel.name}</h2>
            <p className="muted">{server?.name}</p>
            <div className="vl-people">
              {participants.length ? participants.map((p) => <Avatar key={p.userId} userId={p.userId} size={48} />) : <span className="muted">Gerade ist niemand hier.</span>}
            </div>
            <button type="button" className="btn primary lg" onClick={() => voice.join(channel.id)}>Beitreten</button>
            <p className="vl-hint">🎙️ Opus bis 256 kbps · 🖥️ Streams bis 4K/60 FPS · 🔒 Direkt-Verbindung (P2P)</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mini-Call-Bühne über einem DM-Chat. */
export function DmCallStage({ channel }) {
  const v = useVoice();
  const participants = useParticipants(channel.id);
  const meId = useStore((s) => s.me.id);
  const inCall = v.channelId === channel.id;
  if (!inCall && !participants.length) return null;
  if (!inCall) {
    const others = participants.filter((p) => p.userId !== meId);
    return (
      <div className="dm-call-banner">
        <div className="dcb-avatars">{others.map((p) => <Avatar key={p.userId} userId={p.userId} size={36} speaking />)}</div>
        <span>Laufender Anruf</span>
        <button type="button" className="btn success" onClick={() => voice.join(channel.id)}>Beitreten</button>
      </div>
    );
  }
  return (
    <div className="dm-call-stage">
      <CallGrid channelId={channel.id} compact />
      <CallControls compact />
    </div>
  );
}
