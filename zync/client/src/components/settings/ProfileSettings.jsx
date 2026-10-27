import { useMemo, useState } from 'react';
import { Camera, Trash2, Plus, X, Sparkles, ImagePlus } from 'lucide-react';
import { useStore, toast } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Field, Section } from '../ui.jsx';
import { ImageCropper, pickFile } from '../ImageCropper.jsx';
import { ProfileCard, DECORATIONS, EFFECTS, NAME_FONTS, NAME_EFFECTS, Tag } from '../ProfileCard.jsx';
import { Avatar } from '../Avatar.jsx';
import { cx } from '../../lib/format.js';

const TAG_SUGGESTIONS = ['HxH', 'Anime', 'Manga', 'Gaming', 'Valorant', 'Minecraft', 'Fortnite', 'LoL', 'K-Pop', 'Musik', 'Art', 'Coding', 'Fitness', 'Fotografie', 'Night Owl', 'Cozy', 'Aesthetic', 'Y2K', 'Lofi', 'JJK', 'One Piece', 'Naruto', 'Genshin', 'Cosplay', 'Bücher', 'Film', 'Reisen', 'Katzen', 'Hunde', 'Skate'];

const THEME_PRESETS = [
  ['#7c5cff', '#00d4ff'], ['#ff5ca8', '#ffb35c'], ['#2ee6a6', '#2e9bff'], ['#ff6b6b', '#a855f7'], ['#f7d046', '#ff7a45'],
  ['#0f172a', '#334155'], ['#fda4af', '#f0abfc'], ['#14532d', '#84cc16'], ['#1e1b4b', '#be185d'], ['#000000', '#ffffff'],
];

function pickStyle(src) {
  const s = src || {};
  return {
    accent1: s.accent1 || '#7c5cff', accent2: s.accent2 || '#00d4ff', nameColor: s.nameColor || '', nameColor2: s.nameColor2 || '',
    decoration: s.decoration || '', effect: s.effect || '', nameFont: s.nameFont || '', nameEffect: s.nameEffect || '',
    vibe: s.vibe || '', vibeEmoji: s.vibeEmoji || '🎧',
  };
}

export function ProfileSettings() {
  const me = useStore((s) => s.me);
  const initial = useMemo(() => ({
    displayName: me.displayName, pronouns: me.pronouns, bio: me.bio, tags: me.tags || [], style: pickStyle(me.style),
    avatar: me.avatar, avatarCrop: me.avatarCrop, banner: me.banner, bannerCrop: me.bannerCrop, customStatus: me.customStatus,
  }), [me]);
  const [form, setForm] = useState(initial);
  const [cropper, setCropper] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setStyle = (patch) => setForm((f) => ({ ...f, style: { ...f.style, ...patch } }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const chooseImage = async (kind) => {
    const file = await pickFile('image/png,image/jpeg,image/gif,image/webp,image/avif');
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast('Bild ist größer als 15 MB', 'error');
    setCropper({ kind, file });
  };

  const addTag = (t) => {
    const v = t.trim().slice(0, 24);
    if (!v || form.tags.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    if (form.tags.length >= 15) return toast('Maximal 15 Tags', 'error');
    set({ tags: [...form.tags, v] });
    setTagInput('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const style = Object.fromEntries(Object.entries(form.style).filter(([, v]) => v !== ''));
      await api('/me', { method: 'PATCH', body: { ...form, style } });
      toast('Profil gespeichert ✨', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const previewUser = { ...me, ...form, style: Object.fromEntries(Object.entries(form.style).filter(([, v]) => v !== '')) };

  return (
    <div className="profile-settings">
      <div className="ps-form">
        <Section title="Profilbild & Banner" desc="Animierte GIFs werden unterstützt – kostenlos. Vor dem Speichern kannst du zoomen und den Ausschnitt verschieben.">
          <div className="media-row">
            <div className="media-block">
              <div className="mb-label">Profilbild</div>
              <button type="button" className="avatar-edit" onClick={() => chooseImage('avatar')}>
                <Avatar user={previewUser} size={96} decoration={false} hoverPlay />
                <span className="ae-overlay"><Camera size={22} /> Ändern</span>
              </button>
              <div className="mb-actions">
                <button type="button" className="btn secondary sm" onClick={() => chooseImage('avatar')}><ImagePlus size={14} /> Hochladen</button>
                {form.avatar && <button type="button" className="btn ghost sm" onClick={() => set({ avatar: null, avatarCrop: null })}><Trash2 size={14} /></button>}
              </div>
            </div>
            <div className="media-block grow">
              <div className="mb-label">Banner</div>
              <button type="button" className="banner-edit" onClick={() => chooseImage('banner')} style={{ background: form.banner ? undefined : `linear-gradient(135deg, ${form.style.accent1}, ${form.style.accent2})` }}>
                {form.banner && <BannerPreview src={form.banner} crop={form.bannerCrop} />}
                <span className="ae-overlay"><Camera size={22} /> Banner ändern</span>
              </button>
              <div className="mb-actions">
                <button type="button" className="btn secondary sm" onClick={() => chooseImage('banner')}><ImagePlus size={14} /> Hochladen</button>
                {form.banner && <button type="button" className="btn ghost sm" onClick={() => set({ banner: null, bannerCrop: null })}><Trash2 size={14} /></button>}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Über dich">
          <div className="grid-2">
            <Field label="Anzeigename"><input className="input" value={form.displayName} maxLength={32} onChange={(e) => set({ displayName: e.target.value })} /></Field>
            <Field label="Pronomen"><input className="input" value={form.pronouns} maxLength={40} onChange={(e) => set({ pronouns: e.target.value })} placeholder="z. B. sie/ihr, er/ihm" /></Field>
          </div>
          <Field label="Status-Text"><input className="input" value={form.customStatus} maxLength={128} onChange={(e) => set({ customStatus: e.target.value })} placeholder="Was machst du gerade?" /></Field>
          <Field label={`Über mich (${form.bio.length}/600)`} hint="Markdown funktioniert: **fett**, *kursiv*, ||Spoiler||, Links …">
            <textarea className="input" rows={5} maxLength={600} value={form.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Erzähl was über dich ✨" />
          </Field>
          <div className="grid-vibe">
            <Field label="Emoji"><input className="input center" value={form.style.vibeEmoji} maxLength={16} onChange={(e) => setStyle({ vibeEmoji: e.target.value })} /></Field>
            <Field label="Vibe / Lieblingssong / Gerade am Schauen"><input className="input" value={form.style.vibe} maxLength={80} onChange={(e) => setStyle({ vibe: e.target.value })} placeholder="z. B. Hunter x Hunter – Departure!" /></Field>
          </div>
        </Section>

        <Section title="Tags" desc="Zeig, worauf du stehst – z. B. HxH, Gaming oder Lofi.">
          <div className="tag-editor">
            {form.tags.map((t) => (
              <span key={t} className="tag-edit"><Tag label={t} /><button type="button" onClick={() => set({ tags: form.tags.filter((x) => x !== t) })} aria-label={`${t} entfernen`}><X size={12} /></button></span>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); addTag(tagInput); }} className="tag-input">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag hinzufügen…" maxLength={24} />
              <button type="submit" aria-label="Hinzufügen"><Plus size={14} /></button>
            </form>
          </div>
          <div className="tag-suggestions">
            {TAG_SUGGESTIONS.filter((t) => !form.tags.includes(t)).slice(0, 18).map((t) => <button key={t} type="button" className="chip" onClick={() => addTag(t)}>+ {t}</button>)}
          </div>
        </Section>

        <Section title="Profil-Design" desc="Farbverlauf deiner Profilkarte.">
          <div className="theme-swatches">
            {THEME_PRESETS.map(([a, b]) => (
              <button key={a + b} type="button" className={cx('swatch-pair', form.style.accent1 === a && form.style.accent2 === b && 'active')} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => setStyle({ accent1: a, accent2: b })} aria-label="Farbverlauf" />
            ))}
            <label className="swatch-custom" data-tip="Eigene Farbe 1"><input type="color" value={form.style.accent1} onChange={(e) => setStyle({ accent1: e.target.value })} /></label>
            <label className="swatch-custom" data-tip="Eigene Farbe 2"><input type="color" value={form.style.accent2} onChange={(e) => setStyle({ accent2: e.target.value })} /></label>
          </div>
        </Section>

        <Section title="Avatar-Deko" desc="Animierter Rahmen um dein Profilbild.">
          <div className="deco-grid">
            {DECORATIONS.map((d) => (
              <button key={d.id || 'none'} type="button" className={cx('deco-opt', form.style.decoration === d.id && 'active')} onClick={() => setStyle({ decoration: d.id })}>
                <Avatar user={{ ...previewUser, style: { ...previewUser.style, decoration: d.id } }} size={54} />
                <span>{d.name}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Profil-Effekt">
          <div className="chip-row">
            {EFFECTS.map((e) => <button key={e.id || 'none'} type="button" className={cx('chip', form.style.effect === e.id && 'active')} onClick={() => setStyle({ effect: e.id })}>{e.name}</button>)}
          </div>
        </Section>

        <Section title="Namens-Stil" desc="So sieht dein Name im Chat und auf deinem Profil aus.">
          <div className="sub-label">Schriftart</div>
          <div className="chip-row">
            {NAME_FONTS.map((f) => <button key={f.id || 'none'} type="button" className={cx('chip', `nf-${f.id}`, form.style.nameFont === f.id && 'active')} onClick={() => setStyle({ nameFont: f.id })}>{f.name}</button>)}
          </div>
          <div className="sub-label">Effekt</div>
          <div className="chip-row">
            {NAME_EFFECTS.map((f) => <button key={f.id || 'none'} type="button" className={cx('chip', form.style.nameEffect === f.id && 'active')} onClick={() => setStyle({ nameEffect: f.id })}>{f.name}</button>)}
          </div>
          <div className="sub-label">Farbe</div>
          <div className="color-row">
            <label className="swatch-custom big"><input type="color" value={form.style.nameColor || '#ffffff'} onChange={(e) => setStyle({ nameColor: e.target.value })} /></label>
            <label className="swatch-custom big" data-tip="Zweite Farbe (Verlauf)"><input type="color" value={form.style.nameColor2 || form.style.nameColor || '#ffffff'} onChange={(e) => setStyle({ nameColor2: e.target.value })} /></label>
            <button type="button" className="btn ghost sm" onClick={() => setStyle({ nameColor: '', nameColor2: '' })}>Standardfarbe</button>
          </div>
        </Section>
      </div>

      <div className="ps-preview">
        <div className="sub-label"><Sparkles size={14} /> Live-Vorschau</div>
        <ProfileCard userId={me.id} user={previewUser} preview />
      </div>

      {dirty && (
        <div className="save-bar floating">
          <span>Achtung – du hast ungespeicherte Änderungen!</span>
          <button type="button" className="btn ghost sm" onClick={() => setForm(initial)}>Zurücksetzen</button>
          <button type="button" className="btn success sm" onClick={save} disabled={saving}>{saving ? 'Speichert…' : 'Änderungen speichern'}</button>
        </div>
      )}

      {cropper && (
        <ImageCropper
          file={cropper.file}
          aspect={cropper.kind === 'avatar' ? 1 : 2.5}
          shape={cropper.kind === 'avatar' ? 'circle' : 'rect'}
          title={cropper.kind === 'avatar' ? 'Profilbild anpassen' : 'Banner anpassen'}
          onCancel={() => setCropper(null)}
          onDone={({ url, crop }) => {
            set(cropper.kind === 'avatar' ? { avatar: url, avatarCrop: crop } : { banner: url, bannerCrop: crop });
            setCropper(null);
          }}
        />
      )}
    </div>
  );
}

function BannerPreview({ src, crop }) {
  const r = crop ? crop.w / crop.h : 1;
  const aspect = 2.5;
  if (!crop) return <img src={src} alt="" className="banner-img" />;
  const wp = crop.zoom * Math.max(1, r / aspect) * 100;
  const hp = crop.zoom * Math.max(1, aspect / r) * 100;
  return <img src={src} alt="" style={{ position: 'absolute', width: `${wp}%`, height: `${hp}%`, left: `${50 - crop.cx * wp}%`, top: `${50 - crop.cy * hp}%`, maxWidth: 'none' }} />;
}
