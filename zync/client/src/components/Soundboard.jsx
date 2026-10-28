import { useRef, useState } from 'react';
import { Plus, Trash2, Volume2 } from 'lucide-react';
import { useStore, getSocket, toast, openMenu, run } from '../lib/store.js';
import { useSettings, setSetting } from '../lib/settings.js';
import { SOUNDBOARD } from '../lib/sounds.js';
import { api, uploadFile } from '../lib/api.js';
import { useClickOutside, Spinner } from './ui.jsx';
import { pickFile } from './ImageCropper.jsx';

export function SoundboardPopover({ onClose }) {
  const mine = useStore((s) => s.sounds);
  const vol = useSettings((s) => s.soundboardVolume);
  const [upload, setUpload] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  const play = (sound, name, emoji) => getSocket()?.emit('sound:play', { sound, name, emoji });

  const choose = async () => {
    const file = await pickFile('audio/*');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Sounds dürfen max. 2 MB groß sein', 'error');
    setUpload({ file, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), emoji: '🔊' });
  };
  const save = async () => {
    setBusy(true);
    try {
      const up = await uploadFile(upload.file);
      await api('/sounds', { method: 'POST', body: { url: up.url, name: upload.name, emoji: upload.emoji } });
      setUpload(null);
      toast('Sound hinzugefügt 🔊', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div ref={ref} className="soundboard">
      <div className="sbd-head">
        <h4>🔊 Soundboard</h4>
        <label className="sbd-vol" data-tip="Lautstärke für dich"><Volume2 size={14} />
          <input type="range" className="slider" min={0} max={100} value={vol} style={{ '--pct': `${vol}%` }} onChange={(e) => setSetting({ soundboardVolume: Number(e.target.value) })} />
        </label>
      </div>
      <div className="sbd-grid">
        {SOUNDBOARD.map((s) => (
          <button key={s.id} type="button" className="sbd-btn" onClick={() => play(`builtin:${s.id}`, s.name, s.emoji)}>
            <span className="sbd-emoji">{s.emoji}</span><span>{s.name}</span>
          </button>
        ))}
        {mine.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sbd-btn own"
            onClick={() => play(s.url, s.name, s.emoji)}
            onContextMenu={(e) => openMenu(e, [{ label: 'Sound löschen', danger: true, icon: <Trash2 size={16} />, onClick: () => run(() => api(`/sounds/${s.id}`, { method: 'DELETE' })) }])}
          >
            <span className="sbd-emoji">{s.emoji}</span><span>{s.name}</span>
          </button>
        ))}
        <button type="button" className="sbd-btn add" onClick={choose}><Plus size={18} /><span>Eigener Sound</span></button>
      </div>
      {upload && (
        <div className="sbd-upload">
          <input className="input" value={upload.emoji} maxLength={4} onChange={(e) => setUpload({ ...upload, emoji: e.target.value })} style={{ width: 56, textAlign: 'center' }} />
          <input className="input" value={upload.name} maxLength={24} onChange={(e) => setUpload({ ...upload, name: e.target.value })} placeholder="Name" />
          <button type="button" className="btn primary sm" onClick={save} disabled={busy || !upload.name.trim()}>{busy ? <Spinner size={14} /> : 'Speichern'}</button>
        </div>
      )}
      <p className="sbd-hint">Alle im Call hören deinen Sound. Rechtsklick auf eigene Sounds zum Löschen.</p>
    </div>
  );
}
