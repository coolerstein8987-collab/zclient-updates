import { useEffect, useState } from 'react';
import { Search, Users, Compass, ArrowLeft } from 'lucide-react';
import { useStore, openServer, toast } from '../lib/store.js';
import { api } from '../lib/api.js';
import { ServerIcon, CroppedImage } from './Avatar.jsx';
import { Spinner, useTilt } from './ui.jsx';
import { useSettings } from '../lib/settings.js';
import { hashColor } from '../lib/format.js';

function ServerCard({ s, onJoin }) {
  const { tilt3d, tiltStrength } = useSettings();
  const ref = useTilt(tiltStrength * 0.6, tilt3d);
  return (
    <div ref={ref} className="discover-card">
      <div className="dc-banner" style={{ background: s.banner ? undefined : `linear-gradient(135deg, ${s.accent || hashColor(s.id, 60, 45)}, ${hashColor(s.name, 70, 30)})` }}>
        {s.banner && <CroppedImage src={s.banner} crop={s.bannerCrop} aspect={2.5} />}
      </div>
      <div className="dc-icon"><ServerIcon server={s} size={56} /></div>
      <div className="dc-body">
        <h3>{s.name}</h3>
        <p>{s.description || 'Eine gemütliche Community auf Zync.'}</p>
        <div className="dc-foot">
          <span><Users size={14} /> {s.memberCount} Mitglieder</span>
          <button type="button" className={s.joined ? 'btn secondary sm' : 'btn primary sm'} onClick={() => onJoin(s)}>{s.joined ? 'Öffnen' : 'Beitreten'}</button>
        </div>
      </div>
    </div>
  );
}

export function DiscoverView() {
  const [term, setTerm] = useState('');
  const [list, setList] = useState(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/discover?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }).then(setList).catch((e) => e.name !== 'AbortError' && setList([]));
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [term]);
  const join = async (s) => {
    if (s.joined) return openServer(s.id);
    try {
      await api(`/discover/${s.id}/join`, { method: 'POST' });
      toast(`Willkommen auf ${s.name}! 🎉`, 'success');
      setTimeout(() => openServer(s.id), 300);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="discover-view">
      <header className="chat-header">
        <button type="button" className="icon-btn mobile-only" onClick={() => useStore.setState({ mobilePane: 'nav' })} aria-label="Zurück"><ArrowLeft size={22} /></button>
        <div className="ch-title"><Compass size={22} /><div className="ch-name">Entdecken</div></div>
      </header>
      <div className="discover-scroll">
        <div className="discover-hero">
          <h1>Finde deine Community</h1>
          <p>Von Anime über Gaming bis Lerngruppen – hier ist für jeden was dabei.</p>
          <div className="discover-search">
            <Search size={18} />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Server suchen …" />
          </div>
        </div>
        {!list ? <div className="msg-loading"><Spinner size={28} /></div> : list.length === 0 ? (
          <div className="empty-state">
            <div className="empty-art">🔭</div>
            <p>Keine öffentlichen Server gefunden.</p>
            <p className="muted">Mach deinen eigenen Server in den Servereinstellungen öffentlich, damit andere ihn hier finden.</p>
          </div>
        ) : (
          <div className="discover-grid">{list.map((s) => <ServerCard key={s.id} s={s} onJoin={join} />)}</div>
        )}
      </div>
    </div>
  );
}
