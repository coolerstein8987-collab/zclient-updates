import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SmilePlus, Reply, Pencil, Trash2, MoreHorizontal, Pin, Copy, Hash, Star, Download, FileText, Crown, Shield, CornerUpLeft, RefreshCw, X,
} from 'lucide-react';
import { useStore, openPopout, openMenu, toast, run, openModal, discardFailed, sendMessage } from '../lib/store.js';
import { useSettings, setSetting } from '../lib/settings.js';
import { api } from '../lib/api.js';
import { renderMarkdown } from '../lib/markdown.jsx';
import { isEmojiOnly, QUICK_REACTIONS } from '../lib/emoji.js';
import { stickerFromRef, StickerArt } from '../lib/stickers.jsx';
import { cx, formatTime, formatStamp, formatSize, copyText } from '../lib/format.js';
import { Avatar, NameTag, StillImage } from './Avatar.jsx';
import { VoicePlayer } from './VoiceMessage.jsx';
import { ServerTagChip } from './Social.jsx';
import { StreakStoryArt, openStoryComposer } from './Stories.jsx';
import { ExpressionPicker, rememberEmoji } from './ExpressionPicker.jsx';

const JOIN_PHRASES = [
  'ist gerade reingeschneit. ❄️', 'ist da – macht Platz! 🎉', 'ist dem Server beigetreten. Sag hallo! 👋',
  'ist aufgetaucht. ✨', 'ist gelandet. 🚀', 'hat die Party betreten. 🥳', 'ist mit Snacks gekommen. 🍿',
];

/** Schwebender Picker (Portal) – bleibt immer im sichtbaren Bereich. */
export function FloatingPicker({ anchor, onClose, ...props }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const w = Math.min(420, window.innerWidth - 16);
    const h = Math.min(440, window.innerHeight - 16);
    let left = anchor.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    let top = anchor.top - h - 8;
    if (top < 8) top = Math.min(window.innerHeight - h - 8, anchor.bottom + 8);
    setPos({ left, top, width: w, height: h });
  }, [anchor]);
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', zIndex: 300, ...(pos || { left: -9999, top: 0 }) }}>
      <ExpressionPicker {...props} onClose={onClose} style={{ width: '100%', height: '100%' }} />
    </div>,
    document.body,
  );
}

function Attachment({ a, onOpen }) {
  const { autoplayGifs, imageSize, spoilers, showEmbeds } = useSettings();
  const favs = useSettings((s) => s.favoriteGifs);
  const [hover, setHover] = useState(false);
  const [revealed, setRevealed] = useState(!a.spoiler || spoilers === 'always');
  const isImg = a.type?.startsWith('image/');
  const isVideo = a.type?.startsWith('video/');
  const isAudio = a.type?.startsWith('audio/') || a.voice;
  if (a.voice) return <VoicePlayer a={a} />;
  const max = { small: 240, medium: 400, large: 560 }[imageSize];
  if ((isImg || isVideo) && showEmbeds) {
    const ratio = a.width && a.height ? a.width / a.height : 16 / 9;
    const w = Math.min(max, a.width || max, max * Math.max(ratio, 0.5));
    const isGif = /gif$/i.test(a.type) || /\.gif$/i.test(a.url);
    const fav = favs.some((f) => f.url === a.url);
    return (
      <div
        className={cx('att-media', !revealed && 'att-spoiler')}
        style={{ width: w, aspectRatio: String(ratio) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {isImg ? (
          isGif && !autoplayGifs && !hover
            ? <div className="gif-still"><StillImage src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><span className="gif-badge">GIF</span></div>
            : <img src={a.url} alt={a.name} loading="lazy" onClick={() => revealed && onOpen(a)} />
        ) : (
          <video src={a.url} controls preload="metadata" playsInline />
        )}
        {!revealed && <button type="button" className="spoiler-cover" onClick={() => setRevealed(true)}>SPOILER</button>}
        {isImg && revealed && (
          <button
            type="button"
            className={cx('att-fav', fav && 'on')}
            data-tip={fav ? 'Aus Favoriten entfernen' : 'Zu GIF-Favoriten'}
            onClick={(e) => {
              e.stopPropagation();
              setSetting((s) => ({ favoriteGifs: fav ? s.favoriteGifs.filter((f) => f.url !== a.url) : [{ url: a.url, width: a.width, height: a.height, type: a.type, name: a.name }, ...s.favoriteGifs].slice(0, 200) }));
            }}
          ><Star size={16} /></button>
        )}
      </div>
    );
  }
  if (isAudio) {
    return (
      <div className="att-file audio">
        <div className="att-file-row"><FileText size={22} /><div><a href={a.url} download={a.name}>{a.name}</a><span>{formatSize(a.size)}</span></div></div>
        <audio src={a.url} controls preload="metadata" />
      </div>
    );
  }
  return (
    <div className="att-file">
      <div className="att-file-row">
        <FileText size={28} />
        <div><a href={a.url} download={a.name}>{a.name}</a><span>{formatSize(a.size)}</span></div>
        <a className="icon-btn" href={a.url} download={a.name} aria-label="Herunterladen"><Download size={18} /></a>
      </div>
    </div>
  );
}

function Sticker({ refId }) {
  const s = stickerFromRef(refId);
  if (!s) return null;
  return (
    <div className="msg-sticker">
      {s.builtin ? <StickerArt sticker={s.builtin} size={150} /> : <img src={s.url} alt="Sticker" />}
    </div>
  );
}

function Reactions({ msg, meId }) {
  const users = useStore((s) => s.users);
  const [picker, setPicker] = useState(null);
  const toggle = (emoji, mine) => api(`/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}`, { method: mine ? 'DELETE' : 'PUT' }).catch((e) => toast(e.message, 'error'));
  if (!msg.reactions?.length) return null;
  return (
    <div className="reactions">
      {msg.reactions.map((r) => {
        const mine = r.users.includes(meId);
        const names = r.users.slice(0, 6).map((id) => users[id]?.displayName || 'Jemand').join(', ') + (r.users.length > 6 ? ` und ${r.users.length - 6} weitere` : '');
        return (
          <button key={r.emoji} type="button" className={cx('reaction', mine && 'mine')} onClick={() => toggle(r.emoji, mine)} data-tip={`${names} hat mit ${r.emoji} reagiert`}>
            <span className="r-emoji">{r.emoji}</span>
            <span className="r-count">{r.users.length}</span>
          </button>
        );
      })}
      <button type="button" className="reaction add" onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())} aria-label="Reaktion hinzufügen"><SmilePlus size={16} /></button>
      {picker && <FloatingPicker anchor={picker} tabs={['emoji']} onEmoji={(c) => { toggle(c, false); setPicker(null); }} onClose={() => setPicker(null)} />}
    </div>
  );
}

function EditBox({ msg, onDone }) {
  const [value, setValue] = useState(msg.content);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [value]);
  const save = async () => {
    const content = value.trim();
    if (content === msg.content) return onDone();
    if (!content && !msg.attachments?.length && !msg.sticker) {
      onDone();
      return openModal('confirm', { title: 'Nachricht löschen?', text: 'Die Nachricht ist leer – soll sie gelöscht werden?', danger: true, confirm: 'Löschen', onConfirm: () => run(() => api(`/messages/${msg.id}`, { method: 'DELETE' })) });
    }
    try {
      await api(`/messages/${msg.id}`, { method: 'PATCH', body: { content } });
      onDone();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
        }}
      />
      <div className="edit-hint">Escape zum <button type="button" onClick={onDone}>Abbrechen</button> • Enter zum <button type="button" onClick={save}>Speichern</button></div>
    </div>
  );
}

export const Message = memo(function Message({ msg, grouped, serverId, isAdmin, canPin, onOpenMedia, onJump, highlighted }) {
  const me = useStore((s) => s.me);
  const author = useStore((s) => s.users[msg.authorId]);
  const member = useStore((s) => (serverId ? s.servers[serverId]?.members[msg.authorId] : null));
  const editing = useStore((s) => s.editing === msg.id);
  const replyAuthor = useStore((s) => (msg.replyTo?.authorId ? s.users[msg.replyTo.authorId] : null));
  const users = useStore((s) => s.users);
  const settings = useSettings();
  const [picker, setPicker] = useState(null);
  const mine = msg.authorId === me.id;

  const ctx = {
    markdown: settings.markdown,
    spoilers: settings.spoilers,
    resolveUser: (name) => Object.values(users).find((u) => u.username === name),
    nameOf: (id) => users[id]?.displayName,
    onMention: (id, e) => openPopout(id, e, serverId),
  };

  if (msg.type === 'streak') {
    const count = Number(msg.content) || 0;
    const channel = useStore.getState().channels[msg.channelId];
    const partnerId = channel?.recipients?.[0];
    return (
      <div className="msg streak-milestone" data-id={msg.id}>
        <div className="sm-card">
          <StreakStoryArt authorId={me.id} partnerId={partnerId} count={count} compact />
          <div className="sm-text">
            <b>🔥 {count}er-Flamme!</b>
            <span>Ihr habt euch {count} Tage am Stück geschrieben. Beide bekommen +25 🪙</span>
            <button type="button" className="btn primary sm" onClick={() => openStoryComposer({ kind: 'streak', channelId: msg.channelId, streak: { partnerId, count } })}>Als Story teilen ✨</button>
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === 'join') {
    const phrase = JOIN_PHRASES[parseInt(msg.id.slice(-3), 36) % JOIN_PHRASES.length];
    return (
      <div className="msg system" data-id={msg.id}>
        <span className="sys-icon">→</span>
        <span><NameTag userId={msg.authorId} serverId={serverId} onClick={(e) => openPopout(msg.authorId, e, serverId)} /> {phrase}</span>
        <time>{formatStamp(msg.createdAt)}</time>
      </div>
    );
  }

  const mentioned = !mine && (msg.content.includes(`@${me.username}`) || msg.content.includes('@everyone') || msg.replyTo?.authorId === me.id);
  const jumbo = settings.jumboEmoji && isEmojiOnly(msg.content);
  const react = (emoji) => {
    rememberEmoji(emoji);
    const has = msg.reactions?.find((r) => r.emoji === emoji)?.users.includes(me.id);
    api(`/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}`, { method: has ? 'DELETE' : 'PUT' }).catch((e) => toast(e.message, 'error'));
  };
  const reply = () => useStore.setState((s) => ({ replyTo: { ...s.replyTo, [msg.channelId]: msg } }));
  const edit = () => useStore.setState({ editing: msg.id });
  const del = (e) => {
    const doDel = () => run(() => api(`/messages/${msg.id}`, { method: 'DELETE' }));
    if (!settings.confirmDelete || e?.shiftKey) return doDel();
    openModal('confirm', { title: 'Nachricht löschen', text: 'Bist du sicher? Das kann nicht rückgängig gemacht werden. (Tipp: Shift+Klick löscht ohne Nachfrage)', danger: true, confirm: 'Löschen', onConfirm: doDel });
  };
  const pin = () => run(() => api(`/messages/${msg.id}/pin`, { method: 'POST' }), msg.pinned ? 'Nachricht gelöst' : 'Nachricht angepinnt 📌');

  const menu = (e) => {
    if (msg.pending) return;
    openMenu(e, [
      { label: 'Reaktion hinzufügen', icon: <SmilePlus size={16} />, onClick: () => setPicker(e.currentTarget?.getBoundingClientRect?.() || { top: e.clientY, bottom: e.clientY, right: e.clientX + 200 }) },
      { label: 'Antworten', icon: <Reply size={16} />, onClick: reply },
      mine && msg.content !== undefined && { label: 'Bearbeiten', icon: <Pencil size={16} />, onClick: edit },
      canPin && { label: msg.pinned ? 'Lösen' : 'Anpinnen', icon: <Pin size={16} />, onClick: pin },
      msg.content && { label: 'Text kopieren', icon: <Copy size={16} />, onClick: () => { copyText(msg.content); toast('Kopiert!', 'success'); } },
      { label: 'Nachrichten-ID kopieren', icon: <Hash size={16} />, onClick: () => copyText(msg.id) },
      (mine || isAdmin) && { divider: true },
      (mine || isAdmin) && { label: 'Nachricht löschen', icon: <Trash2 size={16} />, danger: true, onClick: () => del() },
    ].filter(Boolean));
  };

  const roleIcon = member?.role === 'owner' ? <Crown size={14} className="role-ico owner" /> : member?.role === 'admin' ? <Shield size={14} className="role-ico admin" /> : null;

  return (
    <div
      className={cx('msg', grouped && 'grouped', mentioned && 'mentioned', msg.pending && 'pending', msg.failed && 'failed', mine && 'mine', highlighted && 'highlight', msg.pinned && 'pinned')}
      data-id={msg.id}
      onContextMenu={menu}
      onDoubleClick={(e) => { if (window.matchMedia('(hover: none)').matches) menu(e); }}
    >
      {msg.replyTo && (
        <div className="msg-reply" onClick={() => !msg.replyTo.deleted && onJump?.(msg.replyTo.id)}>
          <CornerUpLeft size={14} className="reply-spine" />
          {msg.replyTo.deleted ? <span className="muted">Ursprüngliche Nachricht wurde gelöscht</span> : (
            <>
              <Avatar user={replyAuthor} userId={msg.replyTo.authorId} size={16} decoration={false} />
              <NameTag user={replyAuthor} userId={msg.replyTo.authorId} serverId={serverId} className="reply-name" />
              <span className="reply-text">{msg.replyTo.content || (msg.replyTo.hasAttachments ? '📎 Anhang' : '…')}</span>
            </>
          )}
        </div>
      )}
      <div className="msg-gutter">
        {grouped
          ? <span className="msg-hover-time">{formatTime(msg.createdAt)}</span>
          : settings.showAvatars && <Avatar user={author} userId={msg.authorId} size={42} onClick={(e) => openPopout(msg.authorId, e, serverId)} className="msg-avatar" />}
      </div>
      <div className="msg-main">
        {!grouped && (
          <div className="msg-head">
            <NameTag user={author} userId={msg.authorId} serverId={serverId} className="msg-author" onClick={(e) => openPopout(msg.authorId, e, serverId)} />
            {author?.serverTag && <ServerTagChip tag={author.serverTag} className="sm" />}
            {roleIcon}
            <time title={new Date(msg.createdAt).toLocaleString('de-DE')}>{formatStamp(msg.createdAt)}</time>
            {msg.pinned && <Pin size={12} className="pin-ico" />}
          </div>
        )}
        {editing ? <EditBox msg={msg} onDone={() => useStore.setState({ editing: null })} /> : msg.content && (
          <div className={cx('msg-content', jumbo && 'jumbo')}>
            {renderMarkdown(msg.content, ctx)}
            {msg.editedAt && <span className="edited" title={formatStamp(msg.editedAt)}> (bearbeitet)</span>}
          </div>
        )}
        {msg.sticker && <Sticker refId={msg.sticker} />}
        {msg.attachments?.length > 0 && (
          <div className={cx('attachments', msg.attachments.length > 1 && 'multi')}>
            {msg.attachments.map((a) => <Attachment key={a.url} a={a} onOpen={onOpenMedia} />)}
          </div>
        )}
        {msg.failed && (
          <div className="msg-failed">
            Nachricht konnte nicht gesendet werden.
            <button type="button" onClick={() => { discardFailed(msg.channelId, msg.nonce); sendMessage(msg.channelId, msg); }}><RefreshCw size={13} /> Erneut</button>
            <button type="button" onClick={() => discardFailed(msg.channelId, msg.nonce)}><X size={13} /> Verwerfen</button>
          </div>
        )}
        {settings.showReactions && <Reactions msg={msg} meId={me.id} />}
      </div>
      {!msg.pending && !editing && (
        <div className="msg-toolbar">
          {QUICK_REACTIONS.slice(0, 3).map((e) => <button key={e} type="button" onClick={() => react(e)} className="tb-emoji">{e}</button>)}
          <button type="button" data-tip="Reaktion" onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())}><SmilePlus size={18} /></button>
          <button type="button" data-tip="Antworten" onClick={reply}><Reply size={18} /></button>
          {mine && msg.content !== '' && <button type="button" data-tip="Bearbeiten" onClick={edit}><Pencil size={18} /></button>}
          {(mine || isAdmin) && <button type="button" data-tip="Löschen" className="danger" onClick={del}><Trash2 size={18} /></button>}
          <button type="button" data-tip="Mehr" onClick={menu}><MoreHorizontal size={18} /></button>
        </div>
      )}
      {picker && <FloatingPicker anchor={picker} tabs={['emoji']} onEmoji={(c) => { react(c); setPicker(null); }} onClose={() => setPicker(null)} />}
    </div>
  );
});

