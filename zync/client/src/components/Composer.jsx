import { useEffect, useMemo, useRef, useState } from 'react';
import { PlusCircle, Smile, Sticker as StickerIcon, X, EyeOff, Eye, FileText, SendHorizontal, Image as ImageIcon } from 'lucide-react';
import { useStore, sendMessage, sendTyping, resetTypingThrottle, toast, displayName } from '../lib/store.js';
import { useSettings } from '../lib/settings.js';
import { uploadFile, imageSize } from '../lib/api.js';
import { convertEmojis, searchEmojis } from '../lib/emoji.js';
import { cx, formatSize } from '../lib/format.js';
import { Avatar } from './Avatar.jsx';
import { ExpressionPicker, rememberEmoji } from './ExpressionPicker.jsx';
import { Spinner } from './ui.jsx';

const MAX_LEN = 4000;
let attSeq = 0;

export function useAttachments() {
  const [items, setItems] = useState([]);
  const add = (files) => {
    for (const file of files) {
      if (file.size > 100 * 1024 * 1024) { toast(`${file.name} ist größer als 100 MB`, 'error'); continue; }
      const id = ++attSeq;
      const preview = file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null;
      setItems((list) => [...list, { id, file, preview, progress: 0, spoiler: false, done: null, error: null }].slice(0, 10));
      (async () => {
        const dims = await imageSize(file);
        try {
          const up = await uploadFile(file, (p) => setItems((l) => l.map((x) => (x.id === id ? { ...x, progress: p } : x))));
          setItems((l) => l.map((x) => (x.id === id ? { ...x, done: { ...up, ...(dims || {}) }, progress: 1 } : x)));
        } catch (e) {
          setItems((l) => l.map((x) => (x.id === id ? { ...x, error: e.message } : x)));
        }
      })();
    }
  };
  const remove = (id) => setItems((l) => {
    const it = l.find((x) => x.id === id);
    if (it?.preview) URL.revokeObjectURL(it.preview);
    return l.filter((x) => x.id !== id);
  });
  const toggleSpoiler = (id) => setItems((l) => l.map((x) => (x.id === id ? { ...x, spoiler: !x.spoiler } : x)));
  const clear = () => setItems([]);
  return { items, add, remove, toggleSpoiler, clear };
}

function Autocomplete({ items, index, onPick }) {
  if (!items.length) return null;
  return (
    <div className="autocomplete">
      {items.map((it, i) => (
        <button key={it.key} type="button" className={cx('ac-item', i === index && 'active')} onMouseDown={(e) => { e.preventDefault(); onPick(it); }}>
          {it.icon}
          <span className="ac-label">{it.label}</span>
          {it.hint && <span className="ac-hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function Composer({ channel, placeholder, attachments, disabled }) {
  const cid = channel.id;
  const replyTo = useStore((s) => s.replyTo[cid]);
  const users = useStore((s) => s.users);
  const server = useStore((s) => (channel.serverId ? s.servers[channel.serverId] : null));
  const me = useStore((s) => s.me);
  const settings = useSettings();
  const [text, setText] = useState(() => sessionStorage.getItem(`draft:${cid}`) || '');
  const [picker, setPicker] = useState(null);
  const [ac, setAc] = useState({ items: [], index: 0, start: 0 });
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const { items, add, remove, toggleSpoiler, clear } = attachments;

  useEffect(() => {
    setText(sessionStorage.getItem(`draft:${cid}`) || '');
    setPicker(null);
    if (window.matchMedia('(hover: hover)').matches) taRef.current?.focus();
  }, [cid]);
  useEffect(() => {
    try { if (text) sessionStorage.setItem(`draft:${cid}`, text); else sessionStorage.removeItem(`draft:${cid}`); } catch { /* egal */ }
    const el = taRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
    }
  }, [text, cid]);
  useEffect(() => { if (replyTo) taRef.current?.focus(); }, [replyTo]);

  const mentionables = useMemo(() => {
    if (server) return Object.keys(server.members).map((id) => users[id]).filter(Boolean);
    return (channel.recipients || []).map((id) => users[id]).filter(Boolean);
  }, [server, channel.recipients, users]);

  const updateAutocomplete = (value, caret) => {
    const before = value.slice(0, caret);
    const mention = /(^|\s)@([\p{L}\p{N}_.]{0,32})$/u.exec(before);
    const emoji = /(^|\s):([a-z0-9_+-]{2,32})$/i.exec(before);
    if (mention) {
      const t = mention[2].toLowerCase();
      const list = mentionables
        .filter((u) => u.username.includes(t) || u.displayName.toLowerCase().includes(t))
        .slice(0, 8)
        .map((u) => ({ key: u.id, label: displayName(useStore.getState(), u.id, channel.serverId), hint: `@${u.username}`, icon: <Avatar user={u} size={24} decoration={false} />, insert: `@${u.username} ` }));
      if (server && 'everyone'.startsWith(t)) list.push({ key: 'everyone', label: '@everyone', hint: 'Alle benachrichtigen', icon: <span className="ac-emoji">📣</span>, insert: '@everyone ' });
      setAc({ items: list, index: 0, start: caret - mention[2].length - 1 });
    } else if (emoji) {
      const list = searchEmojis(emoji[2], 8).map((e) => ({ key: e.char + e.name, label: `:${e.name}:`, icon: <span className="ac-emoji">{e.char}</span>, insert: e.char }));
      setAc({ items: list, index: 0, start: caret - emoji[2].length - 1 });
    } else if (ac.items.length) setAc({ items: [], index: 0, start: 0 });
  };

  const applyAc = (it) => {
    const el = taRef.current;
    const caret = el.selectionStart;
    const next = text.slice(0, ac.start) + it.insert + text.slice(caret);
    setText(next);
    if (it.label.startsWith(':')) rememberEmoji(it.insert);
    setAc({ items: [], index: 0, start: 0 });
    requestAnimationFrame(() => {
      const pos = ac.start + it.insert.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  const insert = (str) => {
    const el = taRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + str + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + str.length, start + str.length);
    });
  };

  const uploading = items.some((i) => !i.done && !i.error);

  const submit = () => {
    if (disabled) return;
    const content = (settings.emojiConvert ? convertEmojis(text.trim()) : convertEmojis(text.trim(), false));
    const ready = items.filter((i) => i.done);
    if (!content && !ready.length) return;
    if (uploading) return toast('Warte kurz, bis alle Uploads fertig sind ⏳', 'info');
    if (content.length > MAX_LEN) return toast(`Nachricht ist zu lang (${content.length}/${MAX_LEN})`, 'error');
    sendMessage(cid, {
      content,
      attachments: ready.map((i) => ({ ...i.done, spoiler: i.spoiler })),
      replyTo,
    });
    setText('');
    clear();
    resetTypingThrottle();
    useStore.setState((s) => ({ replyTo: { ...s.replyTo, [cid]: null } }));
  };

  const onKeyDown = (e) => {
    if (ac.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAc((a) => ({ ...a, index: (a.index + 1) % a.items.length })); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAc((a) => ({ ...a, index: (a.index - 1 + a.items.length) % a.items.length })); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); applyAc(ac.items[ac.index]); return; }
      if (e.key === 'Escape') { setAc({ items: [], index: 0, start: 0 }); return; }
    }
    if (e.key === 'Escape' && replyTo) useStore.setState((s) => ({ replyTo: { ...s.replyTo, [cid]: null } }));
    if (e.key === 'ArrowUp' && !text) {
      const list = useStore.getState().messages[cid] || [];
      const last = [...list].reverse().find((m) => m.authorId === me.id && !m.pending && m.type === 'default' && m.content);
      if (last) { e.preventDefault(); useStore.setState({ editing: last.id }); }
    }
    const sendCombo = settings.enterToSend ? e.key === 'Enter' && !e.shiftKey : e.key === 'Enter' && (e.ctrlKey || e.metaKey);
    if (sendCombo && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      add(files);
    }
  };

  const sendSticker = (ref) => {
    sendMessage(cid, { sticker: ref, replyTo });
    useStore.setState((s) => ({ replyTo: { ...s.replyTo, [cid]: null } }));
    setPicker(null);
  };
  const sendGif = (g) => {
    sendMessage(cid, { attachments: [{ url: g.url, name: g.name || 'gif.gif', type: g.type || 'image/gif', size: 0, width: g.width, height: g.height }], replyTo });
    useStore.setState((s) => ({ replyTo: { ...s.replyTo, [cid]: null } }));
    setPicker(null);
  };

  const replyName = replyTo ? displayName(useStore.getState(), replyTo.authorId, channel.serverId) : '';

  return (
    <div className="composer-wrap">
      {picker && (
        <ExpressionPicker
          className="composer-picker"
          tab={picker}
          onEmoji={(c, e) => { insert(c); if (!e?.shiftKey) setPicker(null); }}
          onSticker={sendSticker}
          onGif={sendGif}
          onUpload={() => { setPicker(null); fileRef.current?.click(); }}
          onClose={() => setPicker(null)}
        />
      )}
      <Autocomplete items={ac.items} index={ac.index} onPick={applyAc} />
      {replyTo && (
        <div className="reply-bar">
          <span>Antwort an <b>{replyName}</b></span>
          <button type="button" className="icon-btn" onClick={() => useStore.setState((s) => ({ replyTo: { ...s.replyTo, [cid]: null } }))} aria-label="Antwort abbrechen"><X size={16} /></button>
        </div>
      )}
      {items.length > 0 && (
        <div className="att-tray">
          {items.map((it) => (
            <div key={it.id} className={cx('att-tile', it.spoiler && 'spoiler', it.error && 'error')}>
              <div className="att-thumb">
                {it.preview && it.file.type.startsWith('image/') ? <img src={it.preview} alt="" /> : it.preview ? <video src={it.preview} muted /> : <FileText size={36} />}
                {!it.done && !it.error && <div className="att-progress"><span style={{ width: `${it.progress * 100}%` }} /></div>}
              </div>
              <div className="att-name" title={it.file.name}>{it.error || it.file.name}</div>
              <div className="att-size">{formatSize(it.file.size)}</div>
              <div className="att-actions">
                <button type="button" onClick={() => toggleSpoiler(it.id)} data-tip={it.spoiler ? 'Spoiler entfernen' : 'Als Spoiler markieren'}>{it.spoiler ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                <button type="button" className="danger" onClick={() => remove(it.id)} data-tip="Entfernen"><X size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={cx('composer', disabled && 'disabled')}>
        <button type="button" className="composer-btn" onClick={() => fileRef.current?.click()} aria-label="Datei hochladen" data-tip="Datei / Foto hochladen" disabled={disabled}><PlusCircle size={22} /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { add([...e.target.files]); e.target.value = ''; }} />
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={disabled ? 'Du kannst hier nicht schreiben' : placeholder}
          onChange={(e) => {
            setText(e.target.value);
            updateAutocomplete(e.target.value, e.target.selectionStart);
            if (e.target.value) sendTyping(cid);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setAc({ items: [], index: 0, start: 0 }), 150)}
        />
        {text.length > MAX_LEN - 500 && <span className={cx('char-count', text.length > MAX_LEN && 'over')}>{MAX_LEN - text.length}</span>}
        <button type="button" className={cx('composer-btn gif-btn', picker === 'gif' && 'active')} onClick={() => setPicker(picker === 'gif' ? null : 'gif')} data-tip="GIFs" aria-label="GIFs"><ImageIcon size={22} /></button>
        <button type="button" className={cx('composer-btn', picker === 'sticker' && 'active')} onClick={() => setPicker(picker === 'sticker' ? null : 'sticker')} data-tip="Sticker" aria-label="Sticker"><StickerIcon size={22} /></button>
        <button type="button" className={cx('composer-btn emoji-btn', picker === 'emoji' && 'active')} onClick={() => setPicker(picker === 'emoji' ? null : 'emoji')} data-tip="Emoji" aria-label="Emoji"><Smile size={22} /></button>
        <button type="button" className="composer-send" onClick={submit} disabled={disabled || (!text.trim() && !items.some((i) => i.done))} aria-label="Senden">
          {uploading ? <Spinner size={18} /> : <SendHorizontal size={20} />}
        </button>
      </div>
    </div>
  );
}
