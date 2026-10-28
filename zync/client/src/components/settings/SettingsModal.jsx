import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, User, Palette, Sparkles, MessageSquare, Mic, Bell, Keyboard, Lock, LogOut, Smartphone, AppWindow, Info, ArrowLeft, CircleUser, Monitor, Box,
} from 'lucide-react';
import { useStore, closeSettings, logout, toast, openModal } from '../../lib/store.js';
import { useSettings, setSetting, resetSettings, THEMES, ACCENTS, prettyShortcut } from '../../lib/settings.js';
import { LOGO_VARIANTS } from '../../lib/logo.js';
import { api } from '../../lib/api.js';
import { cx } from '../../lib/format.js';
import { Section, Switch, Slider, Segmented, Field, Spinner, useTilt } from '../ui.jsx';
import { Logo } from '../Logo.jsx';
import { Avatar } from '../Avatar.jsx';
import { ProfileSettings } from './ProfileSettings.jsx';
import { VoiceSettings, KeyCapture } from './VoiceSettings.jsx';

function AccountSettings() {
  const me = useStore((s) => s.me);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [uname, setUname] = useState({ username: me.username, password: '' });
  const [busy, setBusy] = useState(null);
  const changePw = async (e) => {
    e.preventDefault();
    setBusy('pw');
    try {
      await api('/me/password', { method: 'POST', body: pw });
      toast('Passwort geändert – andere Geräte wurden abgemeldet.', 'success');
      setPw({ current: '', next: '' });
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  };
  const changeName = async (e) => {
    e.preventDefault();
    setBusy('name');
    try {
      await api('/me', { method: 'PATCH', body: uname });
      toast('Benutzername geändert', 'success');
      setUname((u) => ({ ...u, password: '' }));
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  };
  return (
    <>
      <div className="account-card" style={{ '--p1': me.style?.accent1 || '#7c5cff', '--p2': me.style?.accent2 || '#00d4ff' }}>
        <div className="ac-banner" />
        <div className="ac-row">
          <Avatar userId={me.id} size={80} />
          <div>
            <h2>{me.displayName}</h2>
            <div className="muted">@{me.username}</div>
          </div>
          <button type="button" className="btn primary" onClick={() => useStore.setState({ settings: 'profile' })}>Profil bearbeiten</button>
        </div>
      </div>
      <Section title="Benutzername">
        <form onSubmit={changeName} className="grid-2 align-end">
          <Field label="Neuer Benutzername"><input className="input" value={uname.username} onChange={(e) => setUname({ ...uname, username: e.target.value.toLowerCase() })} /></Field>
          <Field label="Aktuelles Passwort"><input className="input" type="password" value={uname.password} onChange={(e) => setUname({ ...uname, password: e.target.value })} autoComplete="current-password" /></Field>
          <button type="submit" className="btn secondary" disabled={busy || uname.username === me.username || !uname.password}>{busy === 'name' ? <Spinner size={16} /> : 'Benutzernamen ändern'}</button>
        </form>
      </Section>
      <Section title="Passwort">
        <form onSubmit={changePw} className="grid-2 align-end">
          <Field label="Aktuelles Passwort"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="Neues Passwort"><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <button type="submit" className="btn secondary" disabled={busy || !pw.current || pw.next.length < 6}>{busy === 'pw' ? <Spinner size={16} /> : 'Passwort ändern'}</button>
        </form>
      </Section>
      <Section title="Sitzung">
        <button type="button" className="btn danger" onClick={() => openModal('confirm', { title: 'Abmelden?', text: 'Du kannst dich jederzeit wieder anmelden.', confirm: 'Abmelden', danger: true, onConfirm: async () => { closeSettings(); await logout(); } })}><LogOut size={16} /> Abmelden</button>
      </Section>
    </>
  );
}

const POPULAR_GAMES = ['Minecraft', 'Fortnite', 'Valorant', 'League of Legends', 'Roblox', 'Counter-Strike 2', 'GTA V', 'Rocket League', 'Apex Legends', 'Genshin Impact', 'EA SPORTS FC', 'Call of Duty', 'Overwatch 2', 'Brawl Stars', 'Clash Royale', 'Among Us', 'Terraria', 'Stardew Valley', 'Elden Ring', 'Rainbow Six Siege'];

function ActivitySection() {
  const activity = useStore((s) => s.users[s.me.id]?.activity);
  const s = useSettings();
  const [name, setName] = useState('');
  const setActivity = (n) => api('/me/activity', { method: 'PATCH', body: { name: n, source: 'manual' } }).then(() => toast(n ? `🎮 Aktivität: ${n}` : 'Aktivität entfernt', 'success')).catch((e) => toast(e.message, 'error'));
  return (
    <Section title="Aktivität" desc="Zeig deinen Freunden, was du gerade spielst. Die Spielzeit zählt für Badges wie „100h gezockt“ und „Spiele entdeckt“.">
      {activity?.name ? (
        <div className="activity-now">
          <span>🎮 Du spielst gerade <b>{activity.name}</b>{activity.source === 'desktop' ? ' (automatisch erkannt)' : ''}</span>
          <button type="button" className="btn ghost sm" onClick={() => setActivity('')}>Beenden</button>
        </div>
      ) : (
        <form className="copy-field" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { setActivity(name.trim()); setName(''); } }}>
          <input className="input" list="zync-games" value={name} onChange={(e) => setName(e.target.value)} placeholder="Was spielst du gerade?" maxLength={64} />
          <datalist id="zync-games">{POPULAR_GAMES.map((g) => <option key={g} value={g} />)}</datalist>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Setzen</button>
        </form>
      )}
      <Switch checked={s.detectGames} onChange={(v) => setSetting({ detectGames: v })} label="Spiele automatisch erkennen" desc={window.zyncDesktop ? 'Die Desktop-App erkennt bekannte Spiele und setzt deine Aktivität. Es wird nur der Spielname übertragen.' : 'Funktioniert in der Zync-Desktop-App.'} />
    </Section>
  );
}

function PrivacySettings() {
  const me = useStore((s) => s.me);
  const privacy = { friendRequests: 'everyone', serverDms: true, ...(me.privacy || {}) };
  const update = (patch) => api('/me', { method: 'PATCH', body: { privacy: { ...privacy, ...patch } } }).catch((e) => toast(e.message, 'error'));
  return (
    <>
      <Section title="Wer darf dir Freundschaftsanfragen senden?">
        <Segmented value={privacy.friendRequests} onChange={(v) => update({ friendRequests: v })} options={[{ value: 'everyone', label: 'Alle' }, { value: 'mutual', label: 'Gemeinsame Kontakte' }, { value: 'none', label: 'Niemand' }]} />
      </Section>
      <ActivitySection />
      <Section title="Status">
        <Segmented value={me.status} onChange={(v) => api('/me', { method: 'PATCH', body: { status: v } })} options={[{ value: 'online', label: '🟢 Online' }, { value: 'idle', label: '🌙 Abwesend' }, { value: 'dnd', label: '⛔ Nicht stören' }, { value: 'invisible', label: '👻 Unsichtbar' }]} />
        <p className="section-desc">„Nicht stören“ schaltet Benachrichtigungen und Anrufe stumm. „Unsichtbar“ zeigt dich als offline an, du kannst Zync aber normal nutzen.</p>
      </Section>
    </>
  );
}

function ThemePreview({ id, theme, active, onClick }) {
  const [a, b, c] = theme.preview;
  return (
    <button type="button" className={cx('theme-card', active && 'active')} onClick={onClick}>
      <div className="tc-preview" style={{ background: a }}>
        <div className="tc-rail" style={{ background: a }}><i style={{ background: 'var(--accent)' }} /><i style={{ background: c }} /><i style={{ background: c }} /></div>
        <div className="tc-side" style={{ background: b }}><i style={{ background: c }} /><i style={{ background: c }} /><i style={{ background: c }} /></div>
        <div className="tc-main" style={{ background: id === 'hell' || id === 'latte' ? '#fff' : b }}>
          <i style={{ background: c, width: '70%' }} /><i style={{ background: c, width: '45%' }} /><i style={{ background: 'var(--accent)', width: '55%', opacity: 0.8 }} />
        </div>
      </div>
      <div className="tc-label"><b>{theme.name}</b><span>{theme.desc}</span></div>
    </button>
  );
}

function AppearanceSettings() {
  const s = useSettings();
  return (
    <>
      <Section title="Design" desc="Wähle die Grundstimmung deiner App.">
        <div className="theme-grid">
          {Object.entries(THEMES).map(([id, t]) => <ThemePreview key={id} id={id} theme={t} active={s.theme === id} onClick={() => setSetting({ theme: id })} />)}
        </div>
      </Section>
      <Section title="Akzentfarbe">
        <div className="accent-grid">
          {ACCENTS.map(([a, b]) => (
            <button key={a + b} type="button" className={cx('accent-swatch', s.accent === a && s.accent2 === b && 'active')} style={{ background: s.gradientAccent ? `linear-gradient(135deg, ${a}, ${b})` : a }} onClick={() => setSetting({ accent: a, accent2: b })} aria-label={a} />
          ))}
          <label className="accent-swatch custom" data-tip="Eigene Farbe"><input type="color" value={s.accent} onChange={(e) => setSetting({ accent: e.target.value })} /></label>
          {s.gradientAccent && <label className="accent-swatch custom" data-tip="Zweite Verlaufsfarbe"><input type="color" value={s.accent2} onChange={(e) => setSetting({ accent2: e.target.value })} /></label>}
        </div>
        <Switch checked={s.gradientAccent} onChange={(v) => setSetting({ gradientAccent: v })} label="Farbverlauf-Akzent" desc="Buttons und Highlights mit Verlauf statt einer Farbe." />
      </Section>
      <Section title="Layout">
        <div className="sub-label">Ansicht</div>
        <Segmented value={s.layout} onChange={(v) => setSetting({ layout: v })} options={[{ value: 'auto', label: 'Automatisch', icon: <AppWindow size={15} /> }, { value: 'desktop', label: 'PC', icon: <Monitor size={15} /> }, { value: 'mobile', label: 'Handy', icon: <Smartphone size={15} /> }]} />
        <Switch checked={s.floatingPanels} onChange={(v) => setSetting({ floatingPanels: v })} label="Schwebende Panels" desc="Abgerundete, frei schwebende Bereiche mit Abstand." />
        <div className="sub-label">Nachrichtendarstellung</div>
        <Segmented value={s.messageStyle} onChange={(v) => setSetting({ messageStyle: v })} options={[{ value: 'classic', label: 'Klassisch' }, { value: 'bubbles', label: 'Sprechblasen 💬' }]} />
        <div className="sub-label">Dichte</div>
        <Segmented value={s.density} onChange={(v) => setSetting({ density: v })} options={[{ value: 'cozy', label: 'Gemütlich' }, { value: 'compact', label: 'Kompakt' }, { value: 'spacious', label: 'Luftig' }]} />
      </Section>
      <Section title="Schrift & Form">
        <div className="sub-label">Schriftart</div>
        <Segmented value={s.uiFont} onChange={(v) => setSetting({ uiFont: v })} options={[{ value: 'inter', label: 'Inter' }, { value: 'grotesk', label: 'Space Grotesk' }, { value: 'system', label: 'System' }, { value: 'mono', label: 'Mono' }]} />
        <Slider label="UI-Skalierung" value={s.fontScale} min={80} max={130} step={5} onChange={(v) => setSetting({ fontScale: v })} format={(v) => `${v}%`} />
        <Slider label="Chat-Schriftgröße" value={s.chatFontScale} min={80} max={150} step={5} onChange={(v) => setSetting({ chatFontScale: v })} format={(v) => `${v}%`} />
        <Slider label="Eckenrundung" value={s.radius} min={0} max={24} onChange={(v) => setSetting({ radius: v })} format={(v) => `${v}px`} />
        <Slider label="Farbsättigung" value={s.saturation} min={0} max={150} step={5} onChange={(v) => setSetting({ saturation: v })} format={(v) => `${v}%`} />
      </Section>
    </>
  );
}

function TiltDemo() {
  const { tilt3d, tiltStrength } = useSettings();
  const ref = useTilt(tiltStrength, tilt3d);
  return (
    <div ref={ref} className="tilt-demo">
      <Logo size={56} variant={useSettings.getState().appIcon} />
      <div><b>Fahr mit der Maus drüber</b><span>So fühlt sich der 3D-Effekt an</span></div>
    </div>
  );
}

function EffectsSettings() {
  const s = useSettings();
  const bgs = [
    { value: 'none', label: 'Aus' }, { value: 'aurora', label: '🌌 Aurora' }, { value: 'particles', label: '✨ 3D-Partikel' },
    { value: 'grid', label: '🕹️ Retro-Grid' }, { value: 'waves', label: '🌊 Wellen' }, { value: 'orbs', label: '🔮 Orbs' },
  ];
  return (
    <>
      <Section title="Animierter Hintergrund" desc="Lebendige Hintergründe hinter der App – mit Glas-Effekt sieht's am besten aus.">
        <div className="bg-grid">
          {bgs.map((b) => <button key={b.value} type="button" className={cx('bg-opt', `bgp-${b.value}`, s.background === b.value && 'active')} onClick={() => setSetting({ background: b.value })}><span>{b.label}</span></button>)}
        </div>
        <Slider label="Intensität" value={s.bgIntensity} min={10} max={100} onChange={(v) => setSetting({ bgIntensity: v })} format={(v) => `${v}%`} />
        <Switch checked={s.parallax} onChange={(v) => setSetting({ parallax: v })} label="Parallax" desc="Hintergrund bewegt sich leicht mit der Maus (3D-Tiefe)." />
      </Section>
      <Section title="Glas & Licht">
        <Switch checked={s.glass} onChange={(v) => setSetting({ glass: v })} label="Glas-Effekt (Glassmorphism)" desc="Halbtransparente, verschwommene Panels." />
        {s.glass && <Slider label="Unschärfe" value={s.glassBlur} min={0} max={40} onChange={(v) => setSetting({ glassBlur: v })} format={(v) => `${v}px`} />}
        <Switch checked={s.glow} onChange={(v) => setSetting({ glow: v })} label="Neon-Glow" desc="Leuchtende Akzente, Sprech-Ringe und Buttons." />
      </Section>
      <Section title="3D">
        <Switch checked={s.tilt3d} onChange={(v) => setSetting({ tilt3d: v })} label="3D-Tilt auf Karten" desc="Profilkarten und Server-Karten neigen sich zur Maus." />
        {s.tilt3d && <Slider label="Tilt-Stärke" value={s.tiltStrength} min={2} max={30} onChange={(v) => setSetting({ tiltStrength: v })} format={(v) => `${v}°`} />}
        <Switch checked={s.hover3dIcons} onChange={(v) => setSetting({ hover3dIcons: v })} label="3D-Server-Icons" desc="Icons springen beim Hover plastisch nach vorne." />
        <TiltDemo />
      </Section>
      <Section title="Animationen">
        <Segmented value={s.animations} onChange={(v) => setSetting({ animations: v })} options={[{ value: 'full', label: 'Alle' }, { value: 'reduced', label: 'Reduziert' }, { value: 'off', label: 'Aus' }]} />
        <Switch checked={s.messageAnimations} onChange={(v) => setSetting({ messageAnimations: v })} label="Neue Nachrichten animieren" />
        <div className="sub-label">Animierte Profilbilder (GIF)</div>
        <Segmented value={s.animatedAvatars} onChange={(v) => setSetting({ animatedAvatars: v })} options={[{ value: 'always', label: 'Immer abspielen' }, { value: 'hover', label: 'Nur bei Hover' }]} />
      </Section>
    </>
  );
}

function AppIconSettings() {
  const s = useSettings();
  return (
    <Section title="App-Icon" desc="Wähle dein Lieblings-Icon. Es ändert das Logo in der App, den Browser-Tab und (in der Desktop-App) das Fenster-Icon.">
      <div className="icon-grid">
        {Object.entries(LOGO_VARIANTS).map(([id, v]) => (
          <button key={id} type="button" className={cx('icon-opt', s.appIcon === id && 'active')} onClick={() => setSetting({ appIcon: id })}>
            <Logo variant={id} size={64} />
            <span>{v.name}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function ChatSettings() {
  const s = useSettings();
  return (
    <>
      <Section title="Nachrichten">
        <Switch checked={s.enterToSend} onChange={(v) => setSetting({ enterToSend: v })} label="Mit Enter senden" desc={s.enterToSend ? 'Shift+Enter für neue Zeile.' : 'Strg+Enter zum Senden, Enter für neue Zeile.'} />
        <Switch checked={s.time24h} onChange={(v) => setSetting({ time24h: v })} label="24-Stunden-Format" />
        <Switch checked={s.showAvatars} onChange={(v) => setSetting({ showAvatars: v })} label="Profilbilder im Chat anzeigen" />
        <Slider label="Nachrichten gruppieren innerhalb von" value={s.groupMinutes} min={0} max={30} onChange={(v) => setSetting({ groupMinutes: v })} format={(v) => (v ? `${v} Min.` : 'nie')} />
        <Switch checked={s.confirmDelete} onChange={(v) => setSetting({ confirmDelete: v })} label="Vor dem Löschen nachfragen" />
      </Section>
      <Section title="Text & Formatierung">
        <Switch checked={s.markdown} onChange={(v) => setSetting({ markdown: v })} label="Markdown darstellen" desc="**fett**, *kursiv*, `Code`, ||Spoiler||, > Zitate, Listen, Überschriften." />
        <Switch checked={s.emojiConvert} onChange={(v) => setSetting({ emojiConvert: v })} label="Emoticons umwandeln" desc=":) wird zu 🙂, <3 zu ❤️ usw." />
        <Switch checked={s.jumboEmoji} onChange={(v) => setSetting({ jumboEmoji: v })} label="Große Emojis" desc="Nachrichten nur aus Emojis werden groß angezeigt." />
        <div className="sub-label">Spoiler</div>
        <Segmented value={s.spoilers} onChange={(v) => setSetting({ spoilers: v })} options={[{ value: 'click', label: 'Bei Klick zeigen' }, { value: 'always', label: 'Immer zeigen' }]} />
      </Section>
      <Section title="Medien">
        <Switch checked={s.showEmbeds} onChange={(v) => setSetting({ showEmbeds: v })} label="Bilder & Videos direkt anzeigen" />
        <Switch checked={s.autoplayGifs} onChange={(v) => setSetting({ autoplayGifs: v })} label="GIFs automatisch abspielen" desc="Sonst spielen sie beim Drüberfahren." />
        <div className="sub-label">Bildgröße</div>
        <Segmented value={s.imageSize} onChange={(v) => setSetting({ imageSize: v })} options={[{ value: 'small', label: 'Klein' }, { value: 'medium', label: 'Mittel' }, { value: 'large', label: 'Groß' }]} />
      </Section>
      <Section title="Interaktion">
        <Switch checked={s.showReactions} onChange={(v) => setSetting({ showReactions: v })} label="Reaktionen anzeigen" />
        <Switch checked={s.showTyping} onChange={(v) => setSetting({ showTyping: v })} label="„… schreibt“ anzeigen" />
        <Switch checked={s.sendTyping} onChange={(v) => setSetting({ sendTyping: v })} label="Anderen zeigen, wenn ich schreibe" />
      </Section>
    </>
  );
}

function NotificationSettings() {
  const s = useSettings();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const enableDesktop = async (v) => {
    if (v && perm !== 'granted' && typeof Notification !== 'undefined') {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') return toast('Benachrichtigungen wurden im Browser blockiert', 'error');
    }
    setSetting({ notifDesktop: v });
  };
  return (
    <>
      <Section title="Desktop-Benachrichtigungen">
        <Switch checked={s.notifDesktop && perm === 'granted'} onChange={enableDesktop} disabled={perm === 'unsupported'} label="Desktop-Benachrichtigungen aktivieren" desc={perm === 'denied' ? 'Im Browser blockiert – erlaube sie in den Seiteneinstellungen.' : 'Auch wenn Zync im Hintergrund ist.'} />
        <Switch checked={s.notifDMs} onChange={(v) => setSetting({ notifDMs: v })} label="Direktnachrichten" />
        <Switch checked={s.notifMentions} onChange={(v) => setSetting({ notifMentions: v })} label="Erwähnungen (@du, @everyone)" />
        <Switch checked={s.notifAllMessages} onChange={(v) => setSetting({ notifAllMessages: v })} label="Alle Servernachrichten" desc="Kann ziemlich viel werden 😅" />
        <Switch checked={s.titleBadge} onChange={(v) => setSetting({ titleBadge: v })} label="Ungelesen-Zähler im Tab/Fenstertitel" />
      </Section>
      <Section title="Sounds">
        <Switch checked={s.notifSounds} onChange={(v) => setSetting({ notifSounds: v })} label="Sounds aktivieren" />
        <Slider label="Lautstärke" value={s.soundVolume} onChange={(v) => setSetting({ soundVolume: v })} format={(v) => `${v}%`} />
        <Switch checked={s.soundJoinLeave} onChange={(v) => setSetting({ soundJoinLeave: v })} label="Beitreten/Verlassen-Sounds im Sprachkanal" />
      </Section>
    </>
  );
}

function KeybindSettings() {
  const s = useSettings();
  const rows = [
    ['keyMute', 'Stummschalten an/aus'],
    ['keyDeafen', 'Ton an/aus'],
    ['keySwitcher', 'Schnellsuche öffnen'],
  ];
  return (
    <>
      <Section title="Tastenkürzel" desc="Klicke auf ein Kürzel und drücke die neue Kombination.">
        {rows.map(([k, label]) => (
          <div key={k} className="row-setting">
            <div className="row-text"><div className="row-label">{label}</div></div>
            <KeyCapture value={s[k]} onChange={(v) => setSetting({ [k]: v })} />
          </div>
        ))}
        <div className="row-setting">
          <div className="row-text"><div className="row-label">Push-to-Talk</div><div className="row-desc">Einstellbar unter Sprache & Video</div></div>
          <span className="kbd">{prettyShortcut(s.pttKey)}</span>
        </div>
      </Section>
      <Section title="Immer verfügbar">
        <div className="kb-list">
          <div><span className="kbd">Enter</span> Nachricht senden</div>
          <div><span className="kbd">Shift + Enter</span> Neue Zeile</div>
          <div><span className="kbd">↑</span> Letzte Nachricht bearbeiten</div>
          <div><span className="kbd">Esc</span> Antwort/Bearbeiten abbrechen</div>
          <div><span className="kbd">Tab</span> Erwähnung/Emoji vervollständigen</div>
          <div><span className="kbd">Shift + Klick</span> Löschen ohne Nachfrage</div>
        </div>
      </Section>
    </>
  );
}

function AboutSettings() {
  const servers = useStore((s) => s.servers);
  return (
    <>
      <div className="about-hero">
        <Logo size={88} variant={useSettings.getState().appIcon} />
        <h1>Zync</h1>
        <p>Verbinde. Teile. Vibe.</p>
        <span className="muted">Version 1.0.0</span>
      </div>
      <Section title="Was Zync besser macht">
        <ul className="feature-list">
          <li>🎥 Bildschirmübertragung bis 4K/60 FPS – kostenlos</li>
          <li>🎙️ Opus-Audio bis 256 kbps, Rauschunterdrückung, Push-to-Talk</li>
          <li>🖼️ Animierte Profilbilder & Banner mit Zuschnitt – kostenlos</li>
          <li>📎 Uploads bis 100 MB, Nachrichten bis 4000 Zeichen</li>
          <li>🎨 11 Designs, eigene Akzentfarben, 3D-Effekte, animierte Hintergründe</li>
          <li>🧩 Eigene Sticker, GIF-Favoriten, Avatar-Dekos und Profil-Effekte</li>
          <li>📱 Läuft im Browser, als Handy-App (PWA) und als Desktop-App</li>
        </ul>
      </Section>
      <Section title="Daten & Zurücksetzen">
        <p className="section-desc">Du bist auf {Object.keys(servers).length} Servern. App-Einstellungen werden pro Gerät gespeichert.</p>
        <button type="button" className="btn danger-ghost" onClick={() => openModal('confirm', { title: 'Einstellungen zurücksetzen?', text: 'Alle App-Einstellungen auf diesem Gerät werden auf Standard gesetzt. Dein Profil bleibt erhalten.', confirm: 'Zurücksetzen', danger: true, onConfirm: () => resetSettings() })}>App-Einstellungen zurücksetzen</button>
      </Section>
    </>
  );
}

const SECTIONS = [
  { group: 'Benutzereinstellungen' },
  { id: 'account', label: 'Mein Account', icon: <User size={18} />, el: AccountSettings },
  { id: 'profile', label: 'Profile', icon: <CircleUser size={18} />, el: ProfileSettings, wide: true },
  { id: 'privacy', label: 'Privatsphäre & Status', icon: <Lock size={18} />, el: PrivacySettings },
  { group: 'App-Einstellungen' },
  { id: 'appearance', label: 'Darstellung', icon: <Palette size={18} />, el: AppearanceSettings },
  { id: 'effects', label: 'Effekte & 3D', icon: <Box size={18} />, el: EffectsSettings },
  { id: 'appicon', label: 'App-Icon', icon: <Sparkles size={18} />, el: AppIconSettings },
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} />, el: ChatSettings },
  { id: 'voice', label: 'Sprache & Video', icon: <Mic size={18} />, el: VoiceSettings },
  { id: 'notifications', label: 'Benachrichtigungen', icon: <Bell size={18} />, el: NotificationSettings },
  { id: 'keybinds', label: 'Tastenkürzel', icon: <Keyboard size={18} />, el: KeybindSettings },
  { group: 'Sonstiges' },
  { id: 'about', label: 'Über Zync', icon: <Info size={18} />, el: AboutSettings },
];

export function SettingsModal() {
  const section = useStore((s) => s.settings);
  const [mobileNav, setMobileNav] = useState(true);
  useEffect(() => {
    if (!section) return undefined;
    setMobileNav(false);
    const esc = (e) => e.key === 'Escape' && !useStore.getState().modal && closeSettings();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [section]);
  if (!section) return null;
  const current = SECTIONS.find((s) => s.id === section) || SECTIONS[1];
  const Comp = current.el;
  return createPortal(
    <div className={cx('settings-layer', mobileNav && 'show-nav')}>
      <nav className="settings-nav">
        <div className="sn-inner">
          <div className="sn-mobile-head"><button type="button" className="icon-btn" onClick={closeSettings}><X size={22} /></button><b>Einstellungen</b></div>
          {SECTIONS.map((s, i) => (s.group
            ? <div key={i} className="sn-group">{s.group}</div>
            : <button key={s.id} type="button" className={cx('sn-item', section === s.id && 'active')} onClick={() => { useStore.setState({ settings: s.id }); setMobileNav(false); }}>{s.icon}{s.label}</button>))}
          <div className="sn-sep" />
          <button type="button" className="sn-item danger" onClick={() => openModal('confirm', { title: 'Abmelden?', text: 'Bis bald! 👋', confirm: 'Abmelden', danger: true, onConfirm: async () => { closeSettings(); await logout(); } })}><LogOut size={18} /> Abmelden</button>
        </div>
      </nav>
      <main className="settings-main">
        <div className={cx('settings-content', current.wide && 'wide')}>
          <div className="sc-head">
            <button type="button" className="icon-btn mobile-only" onClick={() => setMobileNav(true)}><ArrowLeft size={22} /></button>
            <h1>{current.label}</h1>
          </div>
          <Comp />
        </div>
        <button type="button" className="settings-close" onClick={closeSettings} aria-label="Schließen"><X size={22} /><span>ESC</span></button>
      </main>
    </div>,
    document.body,
  );
}

