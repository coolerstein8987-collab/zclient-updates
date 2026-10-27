import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { login } from '../lib/store.js';
import { useSettings } from '../lib/settings.js';
import { unlockAudio } from '../lib/sounds.js';
import { Spinner, useTilt } from './ui.jsx';
import { Wordmark } from './Logo.jsx';
import { StickerArt } from '../lib/stickers.jsx';

export function Auth() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const appIcon = useSettings((s) => s.appIcon);
  const tiltRef = useTilt(6, true);
  const register = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    unlockAudio();
    setBusy(true);
    setError('');
    try {
      await login(form.username.trim().toLowerCase(), form.password, register, form.displayName.trim() || undefined);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell" ref={tiltRef}>
        <div className="auth-side">
          <Wordmark variant={appIcon} size={44} />
          <h1>{register ? 'Willkommen bei Zync!' : 'Schön, dass du wieder da bist!'}</h1>
          <p>Chatten, Callen & Streamen mit deinen Leuten – in voller Qualität, kostenlos.</p>
          <div className="auth-stickers">
            <StickerArt sticker="hi" size={96} />
            <StickerArt sticker="party" size={96} />
            <StickerArt sticker="cool" size={96} />
          </div>
          <ul className="auth-features">
            <li>🎥 Screen-Share bis 4K/60</li>
            <li>🖼️ GIF-Profilbilder & Banner</li>
            <li>🎨 Designs, 3D & Effekte</li>
          </ul>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <h2>{register ? 'Account erstellen' : 'Anmelden'}</h2>
          {register && (
            <label className="field">
              <span className="field-label">Anzeigename</span>
              <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="So sehen dich andere" maxLength={32} />
            </label>
          )}
          <label className="field">
            <span className="field-label">Benutzername</span>
            <input className="input" required autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="z. B. gon.freecss" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" maxLength={32} />
            {register && <span className="field-hint">a–z, 0–9, Punkt und Unterstrich</span>}
          </label>
          <label className="field">
            <span className="field-label">Passwort</span>
            <div className="pw-wrap">
              <input className="input" required type={show ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 6 : undefined} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label="Passwort anzeigen">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn primary lg block" disabled={busy}>
            {busy ? <Spinner size={18} /> : <>{register ? 'Loslegen' : 'Anmelden'} <ArrowRight size={18} /></>}
          </button>
          <p className="auth-switch">
            {register ? 'Schon einen Account?' : 'Neu hier?'}{' '}
            <button type="button" onClick={() => { setMode(register ? 'login' : 'register'); setError(''); }}>{register ? 'Anmelden' : 'Account erstellen'}</button>
          </p>
        </form>
      </div>
    </div>
  );
}
