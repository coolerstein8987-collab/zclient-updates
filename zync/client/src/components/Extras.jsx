import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Cake, Music2, Play, Pause, Upload, Trash2, Send, PartyPopper, CalendarClock, BookHeart, X } from 'lucide-react';
import { api, uploadFile } from '../lib/api.js';
import { useStore, toast, openModal, sendMessage, openSettings } from '../lib/store.js';
import { cx, formatStamp } from '../lib/format.js';
import { Section, Field, Switch, Spinner, Segmented } from './ui.jsx';
import { Avatar, NameTag } from './Avatar.jsx';
import { pickFile } from './ImageCropper.jsx';
import { StickerArt, stickerFromRef } from '../lib/stickers.jsx';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WISHES = /alles gute|happy birthday|herzlichen glückwunsch|hbd\b|happy bday|feliz cumple|joyeux anniversaire/i;

// =====================================================================
// Konfetti 🎉
// =====================================================================
export function confetti(amount = 120) {
  if (document.documentElement.dataset.animations === 'off') return;
  const box = document.createElement('div');
  box.className = 'confetti-box';
  const colors = ['#8b5cf6', '#06b6d4', '#f472b6', '#fbbf24', '#22c55e', '#f97316', '#ffffff'];
  for (let i = 0; i < amount; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 220}px`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
    if (i % 3 === 0) p.style.borderRadius = '50%';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}

// =====================================================================
// Geburtstage
// =====================================================================
export const useBirthdays = create(() => ({ list: [], loaded: false }));

export async function loadBirthdays({ greet = false } = {}) {
  try {
    const list = await api('/birthdays');
    useBirthdays.setState({ list, loaded: true });
    if (!greet) return;
    const s = useStore.getState();
    const day = new Date().toISOString().slice(0, 10);
    const key = `zync.bday.${s.me.id}.${day}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    if (list.some((b) => b.today && b.userId === s.me.id)) {
      setTimeout(() => { confetti(160); toast(`🎂 Alles Gute zum Geburtstag, ${s.me.displayName}! Hab einen mega Tag 🥳`, 'success', 8000); }, 900);
    }
    const friends = list.filter((b) => b.today && b.userId !== s.me.id);
    if (friends.length) {
      const names = friends.map((b) => s.users[b.userId]?.displayName || 'Jemand').join(', ');
      setTimeout(() => toast(`🎂 Heute ${friends.length > 1 ? 'haben' : 'hat'} ${names} Geburtstag – sag Alles Gute! 🎉`, 'info', 8000), 1500);
    }
  } catch { /* egal */ }
}

/** Hat diese Person heute Geburtstag (soweit ich es sehen darf)? */
export function useIsBirthday(userId) {
  const pub = useStore((s) => !!s.users[userId]?.birthdayToday);
  const priv = useBirthdays((s) => s.list.some((b) => b.userId === userId && b.today));
  return pub || priv;
}

export function BirthdayCake({ userId }) {
  return useIsBirthday(userId) ? <span className="bday-cake" data-tip="Hat heute Geburtstag!">🎂</span> : null;
}

async function dmWith(userId) {
  const s = useStore.getState();
  const existing = Object.values(s.channels).find((c) => c.type === 'dm' && c.recipients?.includes(userId));
  if (existing) return existing.id;
  const ch = await api('/dms', { method: 'POST', body: { userId } });
  useStore.setState((st) => ({ channels: { ...st.channels, [ch.id]: ch } }));
  return ch.id;
}

export async function congratulate(userId) {
  const name = useStore.getState().users[userId]?.displayName || '';
  const cid = await dmWith(userId);
  useStore.setState({ view: { serverId: null, channelId: cid }, mobilePane: 'chat' });
  await sendMessage(cid, { content: `🎉 Alles Gute zum Geburtstag, ${name}! 🎂🥳` });
}

export async function planWishes(b) {
  const name = useStore.getState().users[b.userId]?.displayName || '';
  const cid = await dmWith(b.userId);
  const [y, m, d] = b.next.split('-').map(Number);
  openModal('schedule', { channelId: cid, kind: 'message', title: 'Glückwunsch planen', content: `🎉 Alles Gute zum Geburtstag, ${name}! 🎂🥳`, at: new Date(y, m - 1, d, 0, 0, 0).getTime() });
}

export function BirthdayCalendar() {
  const { list, loaded } = useBirthdays();
  const me = useStore((s) => s.me);
  useEffect(() => { loadBirthdays(); }, []);
  if (!loaded) return <div className="center-pad"><Spinner /></div>;
  const others = list.filter((b) => b.userId !== me.id);
  const groups = [
    ['🎉 Heute', others.filter((b) => b.today)],
    ['Diese Woche', others.filter((b) => !b.today && b.inDays <= 7)],
    ['Diesen Monat', others.filter((b) => b.inDays > 7 && b.inDays <= 31)],
    ['Später', others.filter((b) => b.inDays > 31)],
  ].filter(([, l]) => l.length);
  return (
    <div className="bday-cal">
      {!me.birthday && (
        <div className="bday-hint">
          <Cake size={18} /> Trag deinen Geburtstag ein, damit deine Freunde ihn nicht verpassen.
          <button type="button" className="btn primary sm" onClick={() => openSettings('privacy')}>Eintragen</button>
        </div>
      )}
      {!others.length && <div className="empty-state"><div className="empty-art">🎂</div><p>Noch keine Geburtstage – sobald deine Freunde ihren eintragen, siehst du sie hier.</p></div>}
      {groups.map(([title, l]) => (
        <div key={title} className="bday-group">
          <div className="friends-count">{title}</div>
          {l.map((b) => (
            <div key={b.userId} className={cx('bday-row', b.today && 'today')}>
              <div className="bday-date"><b>{b.day}.</b><span>{MONTHS[b.month - 1].slice(0, 3)}</span></div>
              <Avatar userId={b.userId} size={40} />
              <div className="bday-main">
                <NameTag userId={b.userId} />
                <span className="muted">{b.today ? 'hat heute Geburtstag! 🥳' : `in ${b.inDays} ${b.inDays === 1 ? 'Tag' : 'Tagen'}`}{b.turns ? ` · wird ${b.turns}` : ''}</span>
              </div>
              {b.today
                ? <button type="button" className="btn primary sm" onClick={() => congratulate(b.userId)}><PartyPopper size={14} /> Gratulieren</button>
                : <button type="button" className="btn secondary sm" onClick={() => planWishes(b)} data-tip="Nachricht um 0:00 Uhr an ihrem Geburtstag"><CalendarClock size={14} /> Glückwunsch planen</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Banner im DM, wenn das Gegenüber Geburtstag hat. */
export function BirthdayBanner({ channel }) {
  const partner = channel.type === 'dm' ? channel.recipients?.[0] : null;
  const bday = useIsBirthday(partner);
  const name = useStore((s) => s.users[partner]?.displayName);
  const shown = useRef(false);
  useEffect(() => {
    if (bday && !shown.current && !sessionStorage.getItem(`bday-confetti:${channel.id}`)) {
      shown.current = true;
      sessionStorage.setItem(`bday-confetti:${channel.id}`, '1');
      setTimeout(() => confetti(90), 400);
    }
  }, [bday, channel.id]);
  if (!partner || !bday) return null;
  return (
    <div className="bday-banner">
      <span className="bday-banner-cake">🎂</span>
      <span><b>{name}</b> hat heute Geburtstag!</span>
      <button type="button" className="btn primary sm" onClick={() => congratulate(partner)}><PartyPopper size={14} /> Gratulieren</button>
    </div>
  );
}

export function BirthdaySettings() {
  const me = useStore((s) => s.me);
  const cur = me.birthday;
  const [y0, m0, d0] = cur ? cur.date.split('-').map(Number) : [0, 0, 0];
  const [day, setDay] = useState(d0 || '');
  const [month, setMonth] = useState(m0 || '');
  const [year, setYear] = useState(y0 || '');
  const [show, setShow] = useState(cur?.show || 'friends');
  const [age, setAge] = useState(!!cur?.age);
  const [busy, setBusy] = useState(false);
  const save = async (clear = false) => {
    setBusy(true);
    try {
      await api('/me/birthday', { method: 'PUT', body: clear ? { day: null } : { day, month, year: year || null, show, age } });
      toast(clear ? 'Geburtstag entfernt' : 'Geburtstag gespeichert 🎂', 'success');
      if (clear) { setDay(''); setMonth(''); setYear(''); }
      loadBirthdays();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const thisYear = new Date().getFullYear();
  return (
    <Section title={<><Cake size={16} /> Geburtstag</>} desc="Deine Freunde sehen ihn im Geburtstagskalender, bekommen eine Erinnerung und können dir um 0:00 Uhr gratulieren.">
      <div className="bday-inputs">
        <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}><option value="">Tag</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}.</option>)}</select>
        <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}><option value="">Monat</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value) || '')}><option value="">Jahr (optional)</option>{Array.from({ length: 100 }, (_, i) => <option key={i} value={thisYear - i}>{thisYear - i}</option>)}</select>
      </div>
      <Field label="Wer sieht ihn?">
        <Segmented value={show} onChange={setShow} options={[{ value: 'friends', label: 'Freunde' }, { value: 'everyone', label: 'Alle' }, { value: 'nobody', label: 'Niemand' }]} />
      </Field>
      {year ? <Switch checked={age} onChange={setAge} label="Alter anzeigen" desc="Freunde sehen, wie alt du wirst." /> : null}
      <div className="admin-row">
        <button type="button" className="btn primary" disabled={!day || !month || busy} onClick={() => save()}>{busy ? <Spinner size={14} /> : <Cake size={15} />} Speichern</button>
        {cur && <button type="button" className="btn ghost" onClick={() => save(true)}>Entfernen</button>}
      </div>
    </Section>
  );
}

// =====================================================================
// Profil-Song 🎵
// =====================================================================
let current = null;

export function ProfileSong({ song }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  if (!song?.url) return null;
  const toggle = (e) => {
    e.stopPropagation();
    const el = ref.current;
    if (el.paused) {
      if (current && current !== el) current.pause();
      current = el;
      el.volume = 0.6;
      el.play().catch(() => toast('Abspielen nicht möglich', 'error'));
    } else el.pause();
  };
  return (
    <div className={cx('pc-song', playing && 'playing')}>
      <audio ref={ref} src={song.url} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPct(0); }} onTimeUpdate={(e) => setPct(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} />
      <div className="song-disc" style={song.cover ? { backgroundImage: `url(${song.cover})` } : undefined}><span /></div>
      <div className="song-text">
        <span className="song-kicker"><Music2 size={11} /> Profil-Song</span>
        <b>{song.title}</b>
        {song.artist && <span className="song-artist">{song.artist}</span>}
        <div className="song-progress"><i style={{ width: `${pct * 100}%` }} /></div>
      </div>
      <button type="button" className="song-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Abspielen'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
    </div>
  );
}

export function SongSettings() {
  const me = useStore((s) => s.me);
  const [form, setForm] = useState(() => ({ url: me.song?.url || '', title: me.song?.title || '', artist: me.song?.artist || '', cover: me.song?.cover || null }));
  const [busy, setBusy] = useState('');
  const upload = async (kind) => {
    const file = await pickFile(kind === 'audio' ? 'audio/*' : 'image/*');
    if (!file) return;
    if (kind === 'audio' && file.size > 15 * 1024 * 1024) { toast('Die Datei ist zu groß (max. 15 MB)', 'error'); return; }
    setBusy(kind);
    try {
      const up = await uploadFile(file);
      setForm((f) => ({ ...f, [kind === 'audio' ? 'url' : 'cover']: up.url, ...(kind === 'audio' && !f.title ? { title: file.name.replace(/\.[^.]+$/, '').slice(0, 60) } : {}) }));
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('save');
    try { await api('/me/song', { method: 'PUT', body: form }); toast('Profil-Song gespeichert 🎵', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  const remove = async () => {
    await api('/me/song', { method: 'DELETE' }).catch(() => {});
    setForm({ url: '', title: '', artist: '', cover: null });
  };
  return (
    <Section title={<><Music2 size={16} /> Profil-Song</>} desc="Ein Song auf deinem Profil – wer dein Profil öffnet, kann ihn abspielen (wie früher bei MySpace 😎).">
      {form.url && <ProfileSong song={{ ...form, title: form.title || 'Mein Song' }} />}
      <div className="admin-row">
        <button type="button" className="btn secondary" onClick={() => upload('audio')} disabled={!!busy}>{busy === 'audio' ? <Spinner size={14} /> : <Upload size={15} />} {form.url ? 'Anderen Song' : 'Song hochladen'}</button>
        <button type="button" className="btn ghost" onClick={() => upload('image')} disabled={!!busy || !form.url}>{busy === 'image' ? <Spinner size={14} /> : null} Cover-Bild</button>
      </div>
      {form.url && (
        <>
          <div className="grid-2">
            <Field label="Titel"><input className="input" value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Künstler"><input className="input" value={form.artist} maxLength={60} onChange={(e) => setForm({ ...form, artist: e.target.value })} /></Field>
          </div>
          <div className="admin-row">
            <button type="button" className="btn primary" onClick={save} disabled={!!busy}>{busy === 'save' ? <Spinner size={14} /> : null} Speichern</button>
            {me.song && <button type="button" className="btn danger-ghost" onClick={remove}><Trash2 size={14} /> Entfernen</button>}
          </div>
        </>
      )}
    </Section>
  );
}

// =====================================================================
// Gästebuch 📖
// =====================================================================
export function Guestbook({ userId }) {
  const me = useStore((s) => s.me);
  const [d, setD] = useState(null);
  const [textValue, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/users/${userId}/guestbook`).then((r) => {
      setD(r);
      useStore.setState((s) => ({ users: { ...r.users, ...s.users } }));
    }).catch((e) => toast(e.message, 'error'));
  }, [userId]);
  if (!d) return <div className="center-pad"><Spinner /></div>;
  const post = async () => {
    setBusy(true);
    try {
      const e = await api(`/users/${userId}/guestbook`, { method: 'POST', body: { text: textValue } });
      setD((x) => ({ ...x, entries: [e, ...x.entries] }));
      setText('');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const del = async (id) => {
    await api(`/guestbook/${id}`, { method: 'DELETE' }).catch(() => {});
    setD((x) => ({ ...x, entries: x.entries.filter((e) => e.id !== id) }));
  };
  if (d.mode === 'off') return <div className="empty-state small">📕 Das Gästebuch ist geschlossen.</div>;
  return (
    <div className="guestbook">
      {d.canWrite && (
        <div className="gb-write">
          <Avatar userId={me.id} size={34} />
          <textarea className="input" rows={2} maxLength={200} value={textValue} onChange={(e) => setText(e.target.value)} placeholder="Hinterlass etwas Nettes 💌" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && textValue.trim()) { e.preventDefault(); post(); } }} />
          <button type="button" className="btn primary" onClick={post} disabled={busy || !textValue.trim()} aria-label="Eintragen"><Send size={15} /></button>
        </div>
      )}
      {!d.canWrite && userId !== me.id && <p className="muted gb-note">{d.mode === 'friends' ? 'Nur Freunde können hier schreiben.' : ''}</p>}
      {!d.entries.length && <div className="empty-state small">📖 Noch keine Einträge{userId === me.id ? ' – deine Freunde können dir hier etwas hinterlassen.' : ' – sei die erste Person!'}</div>}
      <div className="gb-list">
        {d.entries.map((e) => (
          <div key={e.id} className="gb-entry">
            <Avatar userId={e.authorId} size={34} />
            <div className="gb-main">
              <div className="gb-head"><NameTag userId={e.authorId} /> <time>{formatStamp(e.createdAt)}</time></div>
              {e.text && <p>{e.text}</p>}
              {e.sticker && <div className="gb-sticker">{stickerFromRef(e.sticker)?.builtin ? <StickerArt sticker={stickerFromRef(e.sticker).builtin} size={72} /> : <img src={e.sticker} alt="" />}</div>}
            </div>
            {(e.authorId === me.id || userId === me.id) && <button type="button" className="icon-btn xs" onClick={() => del(e.id)} aria-label="Löschen"><X size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuestbookSettings() {
  const me = useStore((s) => s.me);
  const mode = me.privacy?.guestbook || 'friends';
  const set = (m) => api('/me/guestbook', { method: 'PUT', body: { mode: m } }).catch((e) => toast(e.message, 'error'));
  return (
    <Section title={<><BookHeart size={16} /> Gästebuch</>} desc="Auf deinem Profil können andere kurze Nachrichten hinterlassen.">
      <Segmented value={mode} onChange={set} options={[{ value: 'friends', label: 'Freunde dürfen schreiben' }, { value: 'everyone', label: 'Alle' }, { value: 'off', label: 'Aus' }]} />
    </Section>
  );
}
