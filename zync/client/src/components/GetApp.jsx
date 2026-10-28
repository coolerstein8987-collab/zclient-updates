import { useEffect, useState } from 'react';
import { Download, Smartphone, Copy, Check, Server, MonitorSmartphone } from 'lucide-react';
import { openModal, openSettings, toast } from '../lib/store.js';
import { Section } from './ui.jsx';

/** Läuft Zync gerade in der Android-App? (Die App hängt „ZyncApp/…“ an den User-Agent.) */
export const inZyncApp = typeof navigator !== 'undefined' && /\bZyncApp\//.test(navigator.userAgent);
export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const isIos = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const isStandalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
export const APK_URL = '/downloads/zync.apk';

// Android-Chrome bietet „Installieren“ erst über dieses Event an – wir merken es uns für später.
let installPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
}

let apkCheck = null;
/** Gibt es auf diesem Server schon eine fertig gebaute APK? */
export function useApkAvailable() {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    if (inZyncApp) { setOk(false); return; }
    apkCheck ||= fetch(APK_URL, { method: 'HEAD', cache: 'no-store' })
      .then((r) => r.ok && !/text\/html/.test(r.headers.get('content-type') || ''))
      .catch(() => false);
    let alive = true;
    apkCheck.then((v) => { if (alive) setOk(v); });
    return () => { alive = false; };
  }, []);
  return ok;
}

function CopyServer() {
  const [done, setDone] = useState(false);
  const host = location.host;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(host);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      toast(`Adresse: ${host}`, 'info');
    }
  };
  return (
    <button type="button" className="ga-server" onClick={copy} data-tip="Kopieren">
      <Server size={16} />
      <code>{host}</code>
      {done ? <Check size={16} className="ga-ok" /> : <Copy size={16} />}
    </button>
  );
}

function InApp() {
  const change = () => openModal('confirm', {
    title: 'Server-Adresse ändern?',
    text: 'Die App vergisst die aktuelle Adresse und fragt beim nächsten Start nach einer neuen. Dein Account bleibt auf dem Server erhalten.',
    confirm: 'Ändern',
    onConfirm: () => { location.href = 'zync://setup'; },
  });
  return (
    <Section title="Zync-App für Android" desc="Du nutzt gerade die Zync-App. Neue Funktionen kommen automatisch vom Server – ein Update der App brauchst du dafür nicht.">
      <div className="ga-row">
        <div className="ga-label">Verbunden mit</div>
        <code className="ga-host">{location.host}</code>
      </div>
      <button type="button" className="btn secondary" onClick={change}><Server size={16} /> Server-Adresse ändern</button>
    </Section>
  );
}

export function GetAppSettings() {
  const apk = useApkAvailable();
  const [canPwa, setCanPwa] = useState(!!installPrompt);
  useEffect(() => {
    const on = () => setCanPwa(!!installPrompt);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (inZyncApp) return <InApp />;
  const installPwa = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    setCanPwa(false);
  };
  return (
    <>
      <div className="ga-hero">
        <div className="ga-phone"><Smartphone size={44} /></div>
        <div>
          <h2>Zync aufs Handy</h2>
          <p>Mit eigenem Icon, Vollbild, Zurück-Taste und Mikro/Kamera für Calls – Neuerungen kommen automatisch, ohne App-Update.</p>
        </div>
      </div>

      <Section title="Android-App (APK)" desc={apk === false ? 'Die Android-App wird gerade gebaut – schau in ein paar Minuten nochmal vorbei.' : 'Direkt herunterladen und installieren, ganz ohne Play Store.'}>
        {apk && (
          <a className="btn primary lg ga-download" href={APK_URL} download="Zync.apk">
            <Download size={18} /> Zync für Android herunterladen
          </a>
        )}
        <ol className="ga-steps">
          <li><b>APK öffnen</b> – nach dem Download in der Benachrichtigung oder im Ordner „Downloads“. Warnt Chrome vor der Datei: „Trotzdem herunterladen“.</li>
          <li>Fragt Android nach: <b>„Aus dieser Quelle zulassen“</b> einschalten (nur einmal nötig).</li>
          <li><b>Installieren</b> tippen und Zync öffnen.</li>
          <li>Beim ersten Start diese <b>Server-Adresse</b> eingeben: <CopyServer /></li>
        </ol>
        {!isAndroid && <p className="section-desc">Tipp: Öffne diese Seite am Handy, um die APK direkt dort zu laden.</p>}
      </Section>

      <Section title={isIos ? 'iPhone & iPad' : 'Ohne Download: als Web-App'} desc={isStandalone ? 'Du nutzt Zync bereits als installierte Web-App. 🎉' : undefined}>
        {!isStandalone && (isIos ? (
          <ol className="ga-steps">
            <li>Zync in <b>Safari</b> öffnen.</li>
            <li>Auf <b>Teilen</b> (Quadrat mit Pfeil) tippen.</li>
            <li><b>„Zum Home-Bildschirm“</b> wählen – fertig, Zync startet wie eine App.</li>
          </ol>
        ) : canPwa ? (
          <button type="button" className="btn secondary" onClick={installPwa}><MonitorSmartphone size={16} /> Als Web-App installieren</button>
        ) : (
          <p className="section-desc">Im Browser-Menü (⋮) auf <b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b> tippen. Am iPhone: Safari → Teilen → „Zum Home-Bildschirm“.</p>
        ))}
      </Section>
    </>
  );
}

/** Kleiner Hinweis auf der Anmeldeseite für Android-Nutzer im Browser. */
export function AuthAppLink() {
  const apk = useApkAvailable();
  if (!isAndroid || inZyncApp || !apk) return null;
  return (
    <a className="auth-app-link" href={APK_URL} download="Zync.apk">
      <Smartphone size={16} /> Zync als Android-App laden
    </a>
  );
}

/** Eintrag im „Ich“-Tab am Handy. */
export function MobileAppButton() {
  const apk = useApkAvailable();
  if (inZyncApp || !(isAndroid ? apk : isIos && !isStandalone)) return null;
  return (
    <button type="button" className="mm-btn" onClick={() => openSettings('apps')}>
      <Smartphone size={20} /> {isAndroid ? 'Android-App holen' : 'Zum Home-Bildschirm'}
    </button>
  );
}
