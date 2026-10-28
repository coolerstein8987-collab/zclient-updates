import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { X, Plus, Eye, Trash2, Send, Image as ImageIcon, Type, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useStore, storyGroups, toast, sendMessage, openModal, closeModal } from '../lib/store.js';
import { api, uploadFile } from '../lib/api.js';
import { cx } from '../lib/format.js';
import { useBackHandler } from '../lib/back.js';
import { STICKERS, StickerArt, stickerFromRef } from '../lib/stickers.jsx';
import { Avatar, NameTag } from './Avatar.jsx';
import { Spinner } from './ui.jsx';
import { pickFile } from './ImageCropper.jsx';
import { timeSince } from './Social.jsx';

const useViewer = create(() => ({ open: false, userId: null }));
export const openStories = (userId) => useViewer.setState({ open: true, userId });
export const openStoryComposer = (props = {}) => openModal('storyComposer', props);

export const STORY_BGS = {
  aurora: 'linear-gradient(160deg, #7c3aed, #06b6d4)',
  sunset: 'linear-gradient(160deg, #f97316, #db2777)',
  ocean: 'linear-gradient(160deg, #0ea5e9, #1e3a8a)',
  sakura: 'linear-gradient(160deg, #fbcfe8, #f472b6)',
  matcha: 'linear-gradient(160deg, #84cc16, #166534)',
  night: 'linear-gradient(160deg, #0f172a, #312e81)',
  fire: 'linear-gradient(160deg, #facc15, #dc2626)',
  mono: 'linear-gradient(160deg, #27272a, #09090b)',
  candy: 'linear-gradient(160deg, #a78bfa, #f9a8d4, #fde68a)',
  galaxy: 'radial-gradient(circle at 30% 20%, #6d28d9, #0b0620 70%)',
};
const FONTS = [['sans', 'Klar'], ['serif', 'Elegant'], ['script', 'Script'], ['marker', 'Marker'], ['mono', 'Mono'], ['pixel', 'Pixel']];
const COLORS = ['#ffffff', '#111111', '#fde047', '#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#c084fc'];
const REACTIONS = ['🔥', '😂', '😍', '😮', '😢', '👏'];

// ---------- Story-Leiste ----------
export function StoryBar() {
  const stories = useStore((s) => s.stories);
  const me = useStore((s) => s.me);
  const groups = useMemo(() => storyGroups({ stories, me }), [stories, me]);
  const mine = groups.find((g) => g.userId === me.id);
  const others = groups.filter((g) => g.userId !== me.id);
  return (
    <div className="story-bar">
      <div className="sb-item">
        <button type="button" className={cx('sb-ring', mine ? (mine.unseen ? '' : 'seen') : 'none')} onClick={() => (mine ? openStories(me.id) : openStoryComposer())} aria-label="Deine Story">
          <Avatar userId={me.id} size={58} decoration={false} />
        </button>
        <button type="button" className="sb-add" onClick={() => openStoryComposer()} aria-label="Story erstellen"><Plus size={14} /></button>
        <span>Deine Story</span>
      </div>
      {others.map((g) => (
        <button key={g.userId} type="button" className="sb-item" onClick={() => openStories(g.userId)}>
          <span className={cx('sb-ring', !g.unseen && 'seen')}><Avatar userId={g.userId} size={58} decoration={false} /></span>
          <NameTag userId={g.userId} className="sb-name" />
        </button>
      ))}
      {others.length === 0 && (
        <div className="sb-empty">
          <b>Noch keine Stories von Freunden</b>
          <span>Teile Momente, die 24 Stunden sichtbar bleiben ✨</span>
        </div>
      )}
    </div>
  );
}

// ---------- Inhalte ----------
function CountUp({ to, duration = 1400 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{n}</>;
}

export function StreakStoryArt({ authorId, partnerId, count, compact }) {
  const users = useStore((s) => s.users);
  const embers = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${-(i % 7) * 0.5}s`, dur: `${2.4 + (i % 5) * 0.6}s`, s: 0.5 + (i % 4) * 0.35 })), []);
  return (
    <div className={cx('streak-story', compact && 'compact')}>
      <div className="ss-glow" />
      <div className="ss-embers">{embers.map((e, i) => <i key={i} style={{ left: e.left, animationDelay: e.delay, animationDuration: e.dur, '--s': e.s }} />)}</div>
      <div className="ss-avatars">
        <div className="ss-a left"><Avatar userId={authorId} size={compact ? 54 : 96} decoration={false} /></div>
        <div className="ss-flame">🔥</div>
        <div className="ss-a right"><Avatar userId={partnerId} size={compact ? 54 : 96} decoration={false} /></div>
      </div>
      <div className="ss-count"><CountUp to={count} /></div>
      <div className="ss-label">{count === 1 ? 'Tag Flamme' : 'Tage Flamme'}</div>
      <div className="ss-names">{users[authorId]?.displayName} & {users[partnerId]?.displayName}</div>
    </div>
  );
}

function StickerLayer({ style }) {
  const st = stickerFromRef(style.sticker);
  if (!st) return null;
  return (
    <div className="story-sticker" style={{ left: `${style.stickerX * 100}%`, top: `${style.stickerY * 100}%`, transform: `translate(-50%, -50%) scale(${style.stickerScale})` }}>
      {st.builtin ? <StickerArt sticker={st.builtin} size={120} /> : <img src={st.url} alt="" />}
    </div>
  );
}

function StoryContent({ story, muted, onVideoDuration, paused }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }, [paused, story.id]);
  const style = story.style || {};
  if (story.kind === 'streak') return <StreakStoryArt authorId={story.userId} partnerId={story.data.partnerId} count={story.data.count} />;
  return (
    <div className="story-content" style={{ background: story.kind === 'text' ? STORY_BGS[style.bg] || STORY_BGS.aurora : '#000' }}>
      {story.kind === 'media' && (
        <>
          <div className="sc-blur" style={{ backgroundImage: story.mediaType === 'image' ? `url(${story.media})` : undefined }} />
          {story.mediaType === 'video'
            ? <video ref={videoRef} src={story.media} className="sc-media" playsInline muted={muted} onLoadedMetadata={(e) => onVideoDuration?.(e.currentTarget.duration)} />
            : <img src={story.media} alt="" className="sc-media" />}
        </>
      )}
      {story.text && (
        <div className={cx('story-text', `sf-${style.font || 'sans'}`, story.kind === 'media' && 'caption')} style={{ color: style.color, top: `${(style.textY ?? 0.5) * 100}%` }}>
          {story.text}
        </div>
      )}
      <StickerLayer style={style} />
    </div>
  );
}

// ---------- Viewer ----------
export function StoryViewer() {
  const { open, userId } = useViewer();
  const stories = useStore((s) => s.stories);
  const me = useStore((s) => s.me);
  const [groups, setGroups] = useState([]);
  const [gi, setGi] = useState(0);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(6);
  const [reply, setReply] = useState('');
  const [viewers, setViewers] = useState(null);
  const [floats, setFloats] = useState([]);
  const [ready, setReady] = useState(false);
  const holdRef = useRef(0);

  useEffect(() => {
    if (!open) { setReady(false); return; }
    const g = storyGroups({ stories: useStore.getState().stories, me });
    const idx = Math.max(0, g.findIndex((x) => x.userId === userId));
    setGroups(g);
    setGi(idx);
    const first = g[idx]?.stories.findIndex((x) => !x.viewed);
    setSi(first > 0 ? first : 0);
    setViewers(null);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const group = groups[gi];
  const snap = group?.stories[si];
  const story = snap ? stories[snap.id] || snap : null;
  const close = () => { useViewer.setState({ open: false }); setPaused(false); };
  useBackHandler(open, close);

  useEffect(() => {
    if (!open || !story) return;
    setDuration(story.kind === 'streak' ? 7 : story.mediaType === 'video' ? 15 : 6);
    setReply('');
    if (story.userId !== me.id && !story.viewed) {
      api(`/stories/${story.id}/view`, { method: 'POST', body: {} }).catch(() => {});
      useStore.setState((s) => (s.stories[story.id] ? { stories: { ...s.stories, [story.id]: { ...s.stories[story.id], viewed: true } } } : {}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, story?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open || !ready) return null;
  if (!story) {
    setTimeout(close, 0);
    return null;
  }

  function next() {
    setViewers(null);
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(0); } else close();
  }
  function prev() {
    setViewers(null);
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].stories.length - 1); }
  }

  const mine = story.userId === me.id;
  const react = (emoji) => {
    api(`/stories/${story.id}/view`, { method: 'POST', body: { reaction: emoji } }).catch(() => {});
    const id = Math.random();
    setFloats((f) => [...f, { id, emoji, x: 20 + Math.random() * 60 }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1800);
  };
  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      const ch = await api('/dms', { method: 'POST', body: { userId: story.userId } });
      useStore.setState((s) => ({ channels: { ...s.channels, [ch.id]: { ...s.channels[ch.id], ...ch } } }));
      await sendMessage(ch.id, { content: `📖 *Antwort auf deine Story:* ${reply.trim()}` });
      toast('Antwort gesendet 💬', 'success');
      setReply('');
      setPaused(false);
    } catch (err) { toast(err.message, 'error'); }
  };
  const showViewers = async () => {
    setPaused(true);
    try { setViewers(await api(`/stories/${story.id}/viewers`)); } catch (err) { toast(err.message, 'error'); }
  };
  const del = async () => {
    try {
      await api(`/stories/${story.id}`, { method: 'DELETE' });
      const rest = group.stories.filter((x) => x.id !== story.id);
      if (!rest.length) close();
      else {
        setGroups((g) => g.map((x, i) => (i === gi ? { ...x, stories: rest } : x)));
        setSi(Math.min(si, rest.length - 1));
      }
    } catch (err) { toast(err.message, 'error'); }
  };

  const onPointerDown = () => { holdRef.current = Date.now(); setPaused(true); };
  const onPointerUp = (e) => {
    const held = Date.now() - holdRef.current > 250;
    setPaused(false);
    if (held || viewers) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) prev(); else next();
  };

  const isPaused = paused || !!viewers || reply.length > 0;

  return createPortal(
    <div className="story-viewer">
      <div className="sv-backdrop" style={{ background: story.kind === 'text' ? STORY_BGS[story.style?.bg] : story.kind === 'streak' ? 'radial-gradient(circle, #7c2d12, #000)' : undefined }} />
      <button type="button" className="sv-nav left" onClick={prev} disabled={gi === 0 && si === 0} aria-label="Zurück"><ChevronLeft size={28} /></button>
      <div className="sv-card">
        <div className="sv-progress">
          {group.stories.map((x, i) => (
            <div key={x.id} className="svp-seg">
              <i
                key={`${story.id}-${i}`}
                className={cx(i < si && 'done', i === si && 'active')}
                style={i === si ? { animationDuration: `${duration}s`, animationPlayState: isPaused ? 'paused' : 'running' } : undefined}
                onAnimationEnd={i === si ? next : undefined}
              />
            </div>
          ))}
        </div>
        <div className="sv-head">
          <Avatar userId={story.userId} size={36} decoration={false} />
          <div className="svh-text"><NameTag userId={story.userId} /><span>vor {timeSince(story.createdAt)}</span></div>
          <div className="svh-actions">
            {story.mediaType === 'video' && <button type="button" onClick={() => setMuted((m) => !m)} aria-label="Ton">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>}
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label="Pause">{isPaused ? <Play size={18} /> : <Pause size={18} />}</button>
            {mine && <button type="button" onClick={del} aria-label="Löschen"><Trash2 size={18} /></button>}
            <button type="button" onClick={close} aria-label="Schließen"><X size={20} /></button>
          </div>
        </div>
        <div className="sv-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerLeave={() => setPaused(false)}>
          <StoryContent story={story} muted={muted} paused={isPaused} onVideoDuration={(d) => setDuration(Math.min(60, Math.max(3, d || 15)))} />
          {floats.map((f) => <span key={f.id} className="sv-float" style={{ left: `${f.x}%` }}>{f.emoji}</span>)}
        </div>
        {mine ? (
          <div className="sv-foot mine">
            <button type="button" className="sv-views" onClick={showViewers}><Eye size={16} /> {story.viewCount || 0} Aufrufe</button>
            <button type="button" className="btn secondary sm" onClick={() => { close(); openStoryComposer(); }}><Plus size={14} /> Neue Story</button>
          </div>
        ) : (
          <div className="sv-foot">
            <form onSubmit={sendReply} className="sv-reply">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Antworten …`} />
              <button type="submit" aria-label="Senden"><Send size={18} /></button>
            </form>
            <div className="sv-reacts">{REACTIONS.map((r) => <button key={r} type="button" onClick={() => react(r)}>{r}</button>)}</div>
          </div>
        )}
        {viewers && (
          <div className="sv-viewers">
            <div className="svv-head"><b><Eye size={16} /> {viewers.viewers.length} Aufrufe</b><button type="button" onClick={() => { setViewers(null); setPaused(false); }}><X size={18} /></button></div>
            {viewers.viewers.length === 0 && <p className="muted">Noch niemand – gleich bestimmt! 👀</p>}
            {viewers.viewers.map((v) => (
              <div key={v.userId} className="svv-row">
                <Avatar user={viewers.users[v.userId]} size={34} decoration={false} />
                <div className="svv-name"><b>{viewers.users[v.userId]?.displayName}</b><span>vor {timeSince(v.at)}</span></div>
                {v.reaction && <span className="svv-react">{v.reaction}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="sv-nav right" onClick={next} aria-label="Weiter"><ChevronRight size={28} /></button>
    </div>,
    document.body,
  );
}

// ---------- Story erstellen ----------
export function StoryComposer({ kind: initialKind = 'text', channelId, streak }) {
  const [kind, setKind] = useState(streak ? 'streak' : initialKind);
  const [text, setText] = useState('');
  const [style, setStyle] = useState({ bg: 'aurora', color: '#ffffff', font: 'sans', sticker: null, stickerX: 0.5, stickerY: 0.72, stickerScale: 1, textY: 0.45 });
  const [media, setMedia] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const me = useStore((s) => s.me);
  const previewRef = useRef(null);
  const drag = useRef(null);
  const set = (p) => setStyle((s) => ({ ...s, ...p }));

  const choose = async () => {
    const file = await pickFile('image/*,video/*');
    if (!file) return;
    const local = URL.createObjectURL(file);
    setKind('media');
    setMedia({ local, type: file.type.startsWith('video/') ? 'video' : 'image', uploading: true });
    setProgress(0);
    try {
      const up = await uploadFile(file, setProgress);
      setMedia({ local, type: file.type.startsWith('video/') ? 'video' : 'image', url: up.url, mime: up.type });
    } catch (e) {
      toast(e.message, 'error');
      setMedia(null);
    }
  };

  const onPointerDown = (what) => (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = what;
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const r = previewRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (drag.current === 'text') set({ textY: y });
    else set({ stickerX: x, stickerY: y });
  };

  const share = async () => {
    setBusy(true);
    try {
      const body = kind === 'streak' ? { kind, channelId } : kind === 'media' ? { kind, media: media?.url, mediaType: media?.mime, text, style } : { kind, text, style };
      await api('/stories', { method: 'POST', body });
      toast('Story geteilt! ✨ Sie ist 24 Stunden sichtbar.', 'success');
      closeModal();
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };

  const canShare = kind === 'streak' || (kind === 'text' ? text.trim() : media?.url);
  const preview = kind === 'streak'
    ? <StreakStoryArt authorId={me.id} partnerId={streak.partnerId} count={streak.count} />
    : (
      <div className="story-content" style={{ background: kind === 'text' ? STORY_BGS[style.bg] : '#000' }}>
        {kind === 'media' && media && (media.type === 'video' ? <video src={media.local} className="sc-media" autoPlay muted loop playsInline /> : <img src={media.local} alt="" className="sc-media" />)}
        {kind === 'media' && !media && <button type="button" className="sc-pick" onClick={choose}><ImageIcon size={36} /><span>Foto oder Video wählen</span></button>}
        {(text || kind === 'text') && (
          <div className={cx('story-text draggable', `sf-${style.font}`, kind === 'media' && 'caption')} style={{ color: style.color, top: `${style.textY * 100}%` }} onPointerDown={onPointerDown('text')}>
            {text || 'Schreib was …'}
          </div>
        )}
        {style.sticker && <div onPointerDown={onPointerDown('sticker')} className="sticker-drag"><StickerLayer style={style} /></div>}
        {media?.uploading && <div className="sc-upload"><Spinner /> {Math.round(progress * 100)}%</div>}
      </div>
    );

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="story-composer">
        <div className="scm-preview" ref={previewRef} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }}>{preview}</div>
        <div className="scm-side">
          <div className="scm-head"><h2>Story erstellen</h2><button type="button" className="icon-btn" onClick={closeModal}><X size={20} /></button></div>
          {kind !== 'streak' && (
            <div className="segmented">
              <button type="button" className={cx(kind === 'text' && 'active')} onClick={() => setKind('text')}><Type size={15} /> Text</button>
              <button type="button" className={cx(kind === 'media' && 'active')} onClick={() => (media ? setKind('media') : choose())}><ImageIcon size={15} /> Foto/Video</button>
            </div>
          )}
          {kind === 'streak' ? (
            <p className="muted">Zeig allen eure 🔥 {streak.count}-Tage-Flamme – mit Animation!</p>
          ) : (
            <>
              <textarea className="input" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'media' ? 'Bildunterschrift (optional)' : 'Was geht ab? ✨'} />
              <div className="sub-label">Schrift</div>
              <div className="chip-row">{FONTS.map(([id, label]) => <button key={id} type="button" className={cx('chip', `sf-${id}`, style.font === id && 'active')} onClick={() => set({ font: id })}>{label}</button>)}</div>
              <div className="sub-label">Textfarbe</div>
              <div className="scm-colors">{COLORS.map((c) => <button key={c} type="button" className={cx(style.color === c && 'active')} style={{ background: c }} onClick={() => set({ color: c })} aria-label={c} />)}</div>
              {kind === 'text' && (
                <>
                  <div className="sub-label">Hintergrund</div>
                  <div className="scm-bgs">{Object.entries(STORY_BGS).map(([id, bg]) => <button key={id} type="button" className={cx(style.bg === id && 'active')} style={{ background: bg }} onClick={() => set({ bg: id })} aria-label={id} />)}</div>
                </>
              )}
              {kind === 'media' && media && <button type="button" className="btn secondary sm" onClick={choose}>Anderes Foto/Video</button>}
              <div className="sub-label">Sticker <small className="muted">(auf der Vorschau verschiebbar)</small></div>
              <div className="scm-stickers">
                <button type="button" className={cx(!style.sticker && 'active')} onClick={() => set({ sticker: null })}>Ohne</button>
                {STICKERS.slice(0, 11).map((st) => (
                  <button key={st.id} type="button" className={cx(style.sticker === `builtin:${st.id}` && 'active')} onClick={() => set({ sticker: `builtin:${st.id}` })}><StickerArt sticker={st} size={40} animate={false} /></button>
                ))}
              </div>
              {style.sticker && <input type="range" className="slider" min={0.4} max={2.5} step={0.05} value={style.stickerScale} style={{ '--pct': `${((style.stickerScale - 0.4) / 2.1) * 100}%` }} onChange={(e) => set({ stickerScale: Number(e.target.value) })} />}
            </>
          )}
          <div className="scm-foot">
            <span className="muted">Sichtbar für deine Freunde · 24 Std.</span>
            <button type="button" className="btn primary" onClick={share} disabled={!canShare || busy || media?.uploading}>{busy ? <Spinner size={16} /> : <>Teilen <Send size={16} /></>}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
