import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, ImagePlus, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useStore, toast } from '../../lib/store.js';
import { uploadFile } from '../../lib/api.js';
import { cx } from '../../lib/format.js';
import { Field, Segmented, Spinner } from '../ui.jsx';
import { Avatar } from '../Avatar.jsx';
import { pickFile } from '../ImageCropper.jsx';

export const WIDGET_TYPES = [
  { type: 'card', icon: '💌', name: 'Karte', desc: 'Text mit Icon und Bild – z. B. „Letters from you“' },
  { type: 'links', icon: '🔗', name: 'Socials & Links', desc: 'Instagram, TikTok, Roblox, Steam …' },
  { type: 'people', icon: '💞', name: 'Meine Leute', desc: 'Verlinke Freunde: „Mein BF“, „Minecraft Atze“ …' },
  { type: 'gallery', icon: '🖼️', name: 'Galerie', desc: 'Bis zu 6 Bilder (auch GIFs)' },
  { type: 'stats', icon: '🏅', name: 'Erfolge', desc: 'Deine Badges + „Alle Statistiken ansehen“' },
  { type: 'games', icon: '🎮', name: 'Gaming', desc: 'Was du gerade spielst + Spielzeit' },
];

const SOCIAL_PRESETS = [
  ['📸', 'Instagram'], ['🎵', 'TikTok'], ['▶️', 'YouTube'], ['🟣', 'Twitch'], ['🧱', 'Roblox'], ['🎮', 'Steam'],
  ['🎧', 'Spotify'], ['⛏️', 'Minecraft'], ['🐦', 'Twitter'], ['👻', 'Snapchat'], ['💬', 'Line'], ['🌸', 'Pinterest'],
];
const PEOPLE_LABELS = ['Mein BF 💕', 'Meine GF 💖', 'Bester Freund 🤝', 'Beste Freundin 🫶', 'Minecraft Atze ⛏️', 'Duo-Partner 🎮', 'Bro 👊', 'Seelenverwandt ✨'];

const newWidget = (type) => {
  const id = Math.random().toString(36).slice(2, 12);
  const base = { id, type, theme: 'default', title: '' };
  if (type === 'card') return { ...base, title: 'Letters from you', text: '', icon: '♡', image: null, link: null };
  if (type === 'links') return { ...base, title: 'Socials', items: [] };
  if (type === 'people') return { ...base, title: 'Meine Leute', items: [] };
  if (type === 'gallery') return { ...base, title: 'Galerie', images: [] };
  if (type === 'stats') return { ...base, title: 'Erfolge' };
  return { ...base, title: 'Gaming' };
};

function useUpload() {
  const [busy, setBusy] = useState(false);
  const upload = async (accept = 'image/*') => {
    const f = await pickFile(accept);
    if (!f) return null;
    if (f.size > 15 * 1024 * 1024) { toast('Max. 15 MB', 'error'); return null; }
    setBusy(true);
    try { return (await uploadFile(f)).url; } catch (e) { toast(e.message, 'error'); return null; } finally { setBusy(false); }
  };
  return [busy, upload];
}

function IconInput({ value, onChange }) {
  const [busy, upload] = useUpload();
  const isImg = value?.startsWith?.('/uploads/');
  return (
    <div className="icon-input">
      {isImg ? <img src={value} alt="" /> : <input className="input center" value={value || ''} maxLength={4} onChange={(e) => onChange(e.target.value)} placeholder="✦" />}
      <button type="button" className="icon-btn xs" onClick={async () => { const u = await upload(); if (u) onChange(u); }} data-tip="Bild als Icon">{busy ? <Spinner size={12} /> : <ImagePlus size={14} />}</button>
      {isImg && <button type="button" className="icon-btn xs" onClick={() => onChange('✦')} aria-label="Entfernen"><X size={12} /></button>}
    </div>
  );
}

function CardEditor({ w, set }) {
  const [busy, upload] = useUpload();
  return (
    <>
      <div className="we-row">
        <IconInput value={w.icon} onChange={(icon) => set({ icon })} />
        <input className="input" value={w.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Titel" />
      </div>
      <textarea className="input" rows={3} maxLength={300} value={w.text} onChange={(e) => set({ text: e.target.value })} placeholder="Text, Zitat, Songtext … z. B. 晚夜微雨问海棠 ˚₊‧" />
      <div className="we-row">
        <button type="button" className="btn secondary sm" onClick={async () => { const u = await upload(); if (u) set({ image: u }); }}>{busy ? <Spinner size={14} /> : <><ImagePlus size={14} /> {w.image ? 'Bild ändern' : 'Bild rechts'}</>}</button>
        {w.image && <><img src={w.image} alt="" className="we-thumb" /><button type="button" className="icon-btn xs" onClick={() => set({ image: null })}><X size={13} /></button></>}
        <input className="input" value={w.link || ''} maxLength={300} onChange={(e) => set({ link: e.target.value || null })} placeholder="Link (optional, https://…)" />
      </div>
    </>
  );
}

function LinksEditor({ w, set }) {
  const setItem = (i, patch) => set({ items: w.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <>
      <input className="input" value={w.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Titel (optional)" />
      {w.items.map((it, i) => (
        <div key={i} className="we-row">
          <IconInput value={it.icon} onChange={(icon) => setItem(i, { icon })} />
          <input className="input" value={it.label} maxLength={30} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Plattform" />
          <input className="input" value={it.value} maxLength={60} onChange={(e) => setItem(i, { value: e.target.value })} placeholder="@name" />
          <input className="input" value={it.url || ''} maxLength={300} onChange={(e) => setItem(i, { url: e.target.value || null })} placeholder="Link (optional)" />
          <button type="button" className="icon-btn xs" onClick={() => set({ items: w.items.filter((_, j) => j !== i) })} aria-label="Entfernen"><Trash2 size={14} /></button>
        </div>
      ))}
      {w.items.length < 8 && (
        <div className="chip-row">
          {SOCIAL_PRESETS.map(([icon, label]) => <button key={label} type="button" className="chip" onClick={() => set({ items: [...w.items, { icon, label, value: '', url: null }] })}>{icon} {label}</button>)}
          <button type="button" className="chip" onClick={() => set({ items: [...w.items, { icon: '✦', label: '', value: '', url: null }] })}>+ Eigenes</button>
        </div>
      )}
    </>
  );
}

function PeopleEditor({ w, set }) {
  const relationships = useStore((s) => s.relationships);
  const users = useStore((s) => s.users);
  const friends = Object.values(relationships).filter((r) => r.type === 1 && !w.items.some((it) => it.userId === r.id)).map((r) => users[r.id]).filter(Boolean);
  const setItem = (i, patch) => set({ items: w.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <>
      <input className="input" value={w.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Titel" />
      <p className="we-hint">Nur Freunde können verlinkt werden. Entfernt dich jemand als Freund, verschwindet er automatisch.</p>
      {w.items.map((it, i) => (
        <div key={it.userId} className="we-person">
          <Avatar userId={it.userId} size={30} decoration={false} />
          <b>{users[it.userId]?.displayName}</b>
          <input className="input" value={it.label} maxLength={40} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="z. B. Mein BF 💕" list="zync-people-labels" />
          <button type="button" className="icon-btn xs" onClick={() => set({ items: w.items.filter((_, j) => j !== i) })} aria-label="Entfernen"><Trash2 size={14} /></button>
        </div>
      ))}
      <datalist id="zync-people-labels">{PEOPLE_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
      {w.items.length < 8 && (friends.length ? (
        <select className="input" value="" onChange={(e) => e.target.value && set({ items: [...w.items, { userId: e.target.value, label: PEOPLE_LABELS[w.items.length % PEOPLE_LABELS.length] }] })}>
          <option value="">+ Freund verlinken …</option>
          {friends.map((u) => <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>)}
        </select>
      ) : <p className="muted">Füge zuerst Freunde hinzu, um sie hier zu verlinken.</p>)}
    </>
  );
}

function GalleryEditor({ w, set }) {
  const [busy, upload] = useUpload();
  return (
    <>
      <input className="input" value={w.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Titel" />
      <div className="we-gallery">
        {w.images.map((src) => (
          <div key={src} className="we-gimg"><img src={src} alt="" /><button type="button" onClick={() => set({ images: w.images.filter((x) => x !== src) })} aria-label="Entfernen"><X size={12} /></button></div>
        ))}
        {w.images.length < 6 && <button type="button" className="we-gadd" onClick={async () => { const u = await upload(); if (u) set({ images: [...w.images, u] }); }}>{busy ? <Spinner size={16} /> : <ImagePlus size={20} />}</button>}
      </div>
    </>
  );
}

export function WidgetEditor({ widgets, onChange }) {
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const update = (id, patch) => onChange(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const move = (i, d) => {
    const next = [...widgets];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="widget-editor">
      {widgets.map((w, i) => {
        const meta = WIDGET_TYPES.find((t) => t.type === w.type);
        const isOpen = open === w.id;
        return (
          <div key={w.id} className={cx('we-item', isOpen && 'open')}>
            <div className="we-head" onClick={() => setOpen(isOpen ? null : w.id)} role="button" tabIndex={0}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="we-icon">{meta?.icon}</span>
              <b>{w.title || meta?.name}</b>
              <span className="muted">{meta?.name}</span>
              <span className="we-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Hoch"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === widgets.length - 1} aria-label="Runter"><ArrowDown size={14} /></button>
                <button type="button" className="danger" onClick={() => onChange(widgets.filter((x) => x.id !== w.id))} aria-label="Löschen"><Trash2 size={14} /></button>
              </span>
            </div>
            {isOpen && (
              <div className="we-body">
                {w.type === 'card' && <CardEditor w={w} set={(p) => update(w.id, p)} />}
                {w.type === 'links' && <LinksEditor w={w} set={(p) => update(w.id, p)} />}
                {w.type === 'people' && <PeopleEditor w={w} set={(p) => update(w.id, p)} />}
                {w.type === 'gallery' && <GalleryEditor w={w} set={(p) => update(w.id, p)} />}
                {(w.type === 'stats' || w.type === 'games') && <Field label="Titel"><input className="input" value={w.title} maxLength={60} onChange={(e) => update(w.id, { title: e.target.value })} /></Field>}
                <div className="sub-label">Stil</div>
                <Segmented size="sm" value={w.theme} onChange={(theme) => update(w.id, { theme })} options={[{ value: 'default', label: 'Standard' }, { value: 'glass', label: 'Glas' }, { value: 'outline', label: 'Umriss' }, { value: 'solid', label: 'Akzent' }]} />
              </div>
            )}
          </div>
        );
      })}
      {widgets.length < 8 && (adding ? (
        <div className="we-types">
          {WIDGET_TYPES.map((t) => (
            <button key={t.type} type="button" className="we-type" onClick={() => { const w = newWidget(t.type); onChange([...widgets, w]); setOpen(w.id); setAdding(false); }}>
              <span className="we-icon">{t.icon}</span><b>{t.name}</b><span>{t.desc}</span>
            </button>
          ))}
        </div>
      ) : <button type="button" className="btn secondary" onClick={() => setAdding(true)}><Plus size={16} /> Widget hinzufügen</button>)}
    </div>
  );
}
