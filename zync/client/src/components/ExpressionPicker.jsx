import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, Plus, Star, Clock, Trash2, Upload } from 'lucide-react';
import { CATEGORIES, searchEmojis } from '../lib/emoji.js';
import { STICKERS, StickerArt } from '../lib/stickers.jsx';
import { useSettings, setSetting } from '../lib/settings.js';
import { useStore, toast, openMenu, run } from '../lib/store.js';
import { api, uploadFile } from '../lib/api.js';
import { cx } from '../lib/format.js';
import { useClickOutside, Spinner } from './ui.jsx';
import { pickFile } from './ImageCropper.jsx';

export function rememberEmoji(char) {
  setSetting((s) => ({ recentEmojis: [char, ...s.recentEmojis.filter((e) => e !== char)].slice(0, 24) }));
}

function EmojiTab({ onPick }) {
  const [term, setTerm] = useState('');
  const recent = useSettings((s) => s.recentEmojis);
  const [hover, setHover] = useState(null);
  const scroller = useRef(null);
  const results = useMemo(() => searchEmojis(term), [term]);
  const sections = term ? [{ id: 'search', name: 'Suchergebnisse', emojis: results }] : [
    ...(recent.length ? [{ id: 'recent', name: 'Zuletzt benutzt', icon: <Clock size={16} />, emojis: recent.map((c) => ({ char: c, name: '' })) }] : []),
    ...CATEGORIES,
  ];
  const jump = (id) => scroller.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start' });
  return (
    <div className="ep-emoji">
      <div className="ep-search">
        <Search size={16} />
        <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Emoji suchen (z. B. herz, lachen, fire)" />
      </div>
      <div className="ep-main">
        {!term && (
          <nav className="ep-cats">
            {sections.map((c) => (
              <button key={c.id} type="button" onClick={() => jump(c.id)} data-tip={c.name}>{c.icon || c.emojis[0]?.char}</button>
            ))}
          </nav>
        )}
        <div className="ep-scroll" ref={scroller}>
          {sections.map((c) => (
            <div key={c.id} data-cat={c.id}>
              <div className="ep-cat-title">{c.name}</div>
              <div className="ep-grid">
                {c.emojis.map((e, i) => (
                  <button
                    key={`${e.char}${i}`}
                    type="button"
                    className="ep-emoji-btn"
                    onMouseEnter={() => setHover(e)}
                    onClick={(ev) => { rememberEmoji(e.char); onPick(e.char, ev); }}
                  >{e.char}</button>
                ))}
              </div>
            </div>
          ))}
          {term && !results.length && <div className="ep-empty">Nichts gefunden 🤔</div>}
        </div>
      </div>
      <div className="ep-footer">
        {hover ? <><span className="ep-footer-emoji">{hover.char}</span> <span>{hover.name ? `:${hover.name}:` : ''}</span></> : <span className="muted">Tipp: Tippe :name: im Chat</span>}
      </div>
    </div>
  );
}

function StickerTab({ onPick }) {
  const custom = useStore((s) => s.stickers);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const file = await pickFile('image/png,image/gif,image/webp,image/jpeg');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('Sticker dürfen max. 8 MB groß sein', 'error');
    setBusy(true);
    try {
      const up = await uploadFile(file);
      await api('/stickers', { method: 'POST', body: { url: up.url, name: file.name.replace(/\.[^.]+$/, '').slice(0, 30) } });
      toast('Sticker hinzugefügt ✨', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ep-stickers">
      <div className="ep-cat-title">Zynci – Standardpaket</div>
      <div className="sticker-grid">
        {STICKERS.map((s) => (
          <button key={s.id} type="button" className="sticker-btn" onClick={() => onPick(`builtin:${s.id}`)} data-tip={s.name}>
            <StickerArt sticker={s} size={84} />
          </button>
        ))}
      </div>
      <div className="ep-cat-title">Meine Sticker</div>
      <div className="sticker-grid">
        {custom.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sticker-btn"
            data-tip={s.name}
            onClick={() => onPick(s.url)}
            onContextMenu={(e) => openMenu(e, [{ label: 'Sticker löschen', danger: true, icon: <Trash2 size={16} />, onClick: () => run(() => api(`/stickers/${s.id}`, { method: 'DELETE' })) }])}
          >
            <img src={s.url} alt={s.name} />
          </button>
        ))}
        <button type="button" className="sticker-btn add" onClick={add} disabled={busy}>
          {busy ? <Spinner /> : <><Plus size={24} /><span>Eigener Sticker</span></>}
        </button>
      </div>
    </div>
  );
}

function GifTab({ onGif, onUpload }) {
  const favs = useSettings((s) => s.favoriteGifs);
  return (
    <div className="ep-gifs">
      <div className="ep-gif-head">
        <span className="ep-cat-title">Favoriten</span>
        <button type="button" className="btn secondary sm" onClick={onUpload}><Upload size={14} /> GIF hochladen</button>
      </div>
      {favs.length === 0 ? (
        <div className="ep-empty">
          <Star size={28} />
          <p>Noch keine Lieblings-GIFs.</p>
          <p className="muted">Fahre im Chat über ein GIF oder Bild und klicke auf ⭐, um es hier zu speichern.</p>
        </div>
      ) : (
        <div className="gif-masonry">
          {favs.map((g) => (
            <button
              key={g.url}
              type="button"
              onClick={() => onGif(g)}
              onContextMenu={(e) => openMenu(e, [{ label: 'Aus Favoriten entfernen', danger: true, icon: <Star size={16} />, onClick: () => setSetting((s) => ({ favoriteGifs: s.favoriteGifs.filter((x) => x.url !== g.url) })) }])}
            >
              <img src={g.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpressionPicker({ tab: initialTab = 'emoji', tabs = ['gif', 'sticker', 'emoji'], onEmoji, onSticker, onGif, onUpload, onClose, className, style }) {
  const [tab, setTab] = useState(initialTab);
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const labels = { gif: 'GIFs', sticker: 'Sticker', emoji: 'Emoji' };
  return (
    <div ref={ref} className={cx('expression-picker', className)} style={style} onMouseDown={(e) => e.stopPropagation()}>
      {tabs.length > 1 && (
        <div className="ep-tabs">
          {tabs.map((t) => <button key={t} type="button" className={cx(tab === t && 'active')} onClick={() => setTab(t)}>{labels[t]}</button>)}
        </div>
      )}
      {tab === 'emoji' && <EmojiTab onPick={onEmoji} />}
      {tab === 'sticker' && <StickerTab onPick={onSticker} />}
      {tab === 'gif' && <GifTab onGif={onGif} onUpload={onUpload} />}
    </div>
  );
}
