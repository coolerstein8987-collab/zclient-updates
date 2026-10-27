import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, Camera, CameraOff } from 'lucide-react';
import { useSettings, setSetting, prettyShortcut, shortcutFromEvent } from '../../lib/settings.js';
import { listDevices } from '../../lib/voice.js';
import { sounds } from '../../lib/sounds.js';
import { Section, Switch, Slider, Segmented, Select } from '../ui.jsx';
import { cx } from '../../lib/format.js';

function useDevices() {
  const [devices, setDevices] = useState({ inputs: [], outputs: [], cams: [] });
  useEffect(() => {
    const load = () => listDevices().then(setDevices);
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', load);
  }, []);
  return [devices, () => listDevices().then(setDevices)];
}

function deviceOptions(list, fallback) {
  return [{ value: 'default', label: fallback }, ...list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => ({ value: d.deviceId, label: d.label || `Gerät ${i + 1}` }))];
}

const dbToPct = (db) => Math.max(0, Math.min(100, ((db + 100) / 100) * 100));

function MicTest({ onPermission }) {
  const s = useSettings();
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(-100);
  const [loopback, setLoopback] = useState(false);
  const ref = useRef({});
  const stop = () => {
    const r = ref.current;
    cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    ref.current = {};
    setRunning(false);
    setLevel(-100);
  };
  useEffect(() => stop, []);
  useEffect(() => { if (running) { stop(); start(); } }, [s.inputDevice, s.noiseSuppression, s.echoCancellation, s.autoGain]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const r = ref.current;
    if (!r.gain) return;
    r.gain.gain.value = s.inputVolume / 100;
    r.out.gain.value = loopback ? s.outputVolume / 100 : 0;
  }, [s.inputVolume, s.outputVolume, loopback]);
  const start = async () => {
    try {
      const audio = { echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGain };
      if (s.inputDevice !== 'default') audio.deviceId = { exact: s.inputDevice };
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      onPermission?.();
      const ctx = new AudioContext();
      if (ctx.setSinkId && s.outputDevice !== 'default') ctx.setSinkId(s.outputDevice).catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = s.inputVolume / 100;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const out = ctx.createGain();
      out.gain.value = loopback ? s.outputVolume / 100 : 0;
      src.connect(gain).connect(analyser);
      gain.connect(out).connect(ctx.destination);
      const buf = new Float32Array(analyser.fftSize);
      let smooth = -100;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);
        smooth = db > smooth ? db : smooth * 0.85 + db * 0.15;
        setLevel(smooth);
        ref.current.raf = requestAnimationFrame(tick);
      };
      ref.current = { stream, ctx, gain, out };
      tick();
      setRunning(true);
    } catch {
      setRunning(false);
    }
  };
  const threshold = s.sensitivity;
  const active = s.autoSensitivity ? level > -55 : level > threshold;
  return (
    <div className="mic-test">
      <div className="mt-row">
        <button type="button" className={cx('btn', running ? 'danger' : 'primary')} onClick={running ? stop : start}>
          {running ? <><Square size={14} /> Test beenden</> : <><Mic size={16} /> Mikrofon testen</>}
        </button>
        <label className="sp-check"><input type="checkbox" checked={loopback} onChange={(e) => setLoopback(e.target.checked)} /> Mich selbst hören</label>
      </div>
      <div className="level-meter">
        <div className={cx('lm-fill', active && 'active')} style={{ width: `${dbToPct(level)}%` }} />
        {!s.autoSensitivity && <div className="lm-threshold" style={{ left: `${dbToPct(threshold)}%` }} />}
      </div>
      <div className="lm-hint">{running ? (active ? '🟢 Du wirst übertragen' : '⚪ Zu leise – wird nicht übertragen') : 'Sprich nach dem Start, um deinen Pegel zu sehen.'}</div>
    </div>
  );
}

function CamPreview() {
  const s = useSettings();
  const [on, setOn] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  useEffect(() => {
    if (!on) return undefined;
    let cancelled = false;
    const video = s.camDevice !== 'default' ? { deviceId: { exact: s.camDevice } } : true;
    navigator.mediaDevices.getUserMedia({ video }).then((stream) => {
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => setOn(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [on, s.camDevice]);
  return (
    <div className="cam-preview">
      {on ? <video ref={videoRef} autoPlay playsInline muted className={cx(s.mirrorCam && 'mirror')} /> : <div className="cam-off"><CameraOff size={36} /><span>Vorschau aus</span></div>}
      <button type="button" className="btn secondary" onClick={() => setOn((o) => !o)}>{on ? <><CameraOff size={16} /> Vorschau beenden</> : <><Camera size={16} /> Kamera testen</>}</button>
    </div>
  );
}

function KeyCapture({ value, onChange, allowModifiersOnly = false }) {
  const [listening, setListening] = useState(false);
  return (
    <button
      type="button"
      className={cx('key-capture', listening && 'listening')}
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={(e) => {
        if (!listening) return;
        e.preventDefault();
        if (e.key === 'Escape') { setListening(false); return; }
        const combo = allowModifiersOnly ? e.code : shortcutFromEvent(e);
        if (!combo) return;
        onChange(combo);
        setListening(false);
      }}
    >
      {listening ? 'Taste drücken…' : prettyShortcut(value)}
    </button>
  );
}

export { KeyCapture };

export function VoiceSettings() {
  const s = useSettings();
  const [devices, reload] = useDevices();
  return (
    <>
      <Section title="Sprache">
        <div className="grid-2">
          <Select label="Eingabegerät" value={s.inputDevice} onChange={(v) => setSetting({ inputDevice: v })} options={deviceOptions(devices.inputs, 'Standard-Mikrofon')} />
          <Select label="Ausgabegerät" value={s.outputDevice} onChange={(v) => setSetting({ outputDevice: v })} options={deviceOptions(devices.outputs, 'Standard-Lautsprecher')} />
        </div>
        <div className="grid-2">
          <Slider label="Eingabelautstärke" value={s.inputVolume} max={200} onChange={(v) => setSetting({ inputVolume: v })} format={(v) => `${v}%`} />
          <Slider label="Ausgabelautstärke" value={s.outputVolume} max={200} onChange={(v) => setSetting({ outputVolume: v })} format={(v) => `${v}%`} />
        </div>
        <MicTest onPermission={reload} />
        <button type="button" className="btn ghost sm" onClick={() => sounds.connect()}><Volume2 size={14} /> Testton abspielen</button>
      </Section>

      <Section title="Eingabemodus">
        <Segmented value={s.inputMode} onChange={(v) => setSetting({ inputMode: v })} options={[{ value: 'vad', label: '🎙️ Sprachaktivierung' }, { value: 'ptt', label: '✋ Push-to-Talk' }]} />
        {s.inputMode === 'ptt' ? (
          <div className="ptt-settings">
            <div className="row-setting">
              <div className="row-text"><div className="row-label">Push-to-Talk-Taste</div><div className="row-desc">Gedrückt halten zum Sprechen (funktioniert, solange Zync im Vordergrund ist).</div></div>
              <KeyCapture value={s.pttKey} onChange={(v) => setSetting({ pttKey: v })} allowModifiersOnly />
            </div>
            <Slider label="Verzögerung beim Loslassen" value={s.pttDelay} min={0} max={1000} step={20} onChange={(v) => setSetting({ pttDelay: v })} format={(v) => `${v} ms`} />
          </div>
        ) : (
          <>
            <Switch checked={s.autoSensitivity} onChange={(v) => setSetting({ autoSensitivity: v })} label="Eingabeempfindlichkeit automatisch bestimmen" desc="Zync passt die Schwelle laufend an dein Umgebungsgeräusch an." />
            {!s.autoSensitivity && <Slider label="Empfindlichkeit" value={s.sensitivity} min={-100} max={0} onChange={(v) => setSetting({ sensitivity: v })} format={(v) => `${v} dB`} desc="Alles unter dieser Schwelle wird nicht übertragen." />}
          </>
        )}
      </Section>

      <Section title="Sprachverarbeitung">
        <Switch checked={s.noiseSuppression} onChange={(v) => setSetting({ noiseSuppression: v })} label="Rauschunterdrückung" desc="Filtert Lüfter, Tastatur und Hintergrundgeräusche." />
        <Switch checked={s.echoCancellation} onChange={(v) => setSetting({ echoCancellation: v })} label="Echounterdrückung" desc="Verhindert, dass andere sich selbst über deine Lautsprecher hören." />
        <Switch checked={s.autoGain} onChange={(v) => setSetting({ autoGain: v })} label="Automatische Verstärkung" desc="Gleicht deine Lautstärke automatisch aus." />
        <div className="sub-label">Audio-Qualität (Bitrate)</div>
        <Segmented value={s.audioBitrate} onChange={(v) => setSetting({ audioBitrate: v })} options={[{ value: 64, label: '64 kbps' }, { value: 96, label: '96 kbps' }, { value: 128, label: '128 kbps' }, { value: 256, label: '256 kbps ✨' }]} />
      </Section>

      <Section title="Video">
        <div className="grid-2">
          <div>
            <Select label="Kamera" value={s.camDevice} onChange={(v) => setSetting({ camDevice: v })} options={deviceOptions(devices.cams, 'Standard-Kamera')} />
            <div className="sub-label">Kameraqualität</div>
            <Segmented size="sm" value={s.camQuality} onChange={(v) => setSetting({ camQuality: v })} options={[{ value: '360', label: '360p' }, { value: '720', label: '720p' }, { value: '1080', label: '1080p' }]} />
            <Switch checked={s.mirrorCam} onChange={(v) => setSetting({ mirrorCam: v })} label="Eigenes Video spiegeln" />
          </div>
          <CamPreview />
        </div>
      </Section>

      <Section title="Bildschirmübertragung" desc="Volle Qualität für alle – ohne Abo.">
        <div className="sub-label">Auflösung</div>
        <Segmented value={s.streamRes} onChange={(v) => setSetting({ streamRes: v })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '1440', label: '1440p' }, { value: '2160', label: '4K' }]} />
        <div className="sub-label">Bildrate</div>
        <Segmented value={s.streamFps} onChange={(v) => setSetting({ streamFps: v })} options={[{ value: 15, label: '15 FPS' }, { value: 30, label: '30 FPS' }, { value: 60, label: '60 FPS' }]} />
        <div className="sub-label">Optimierung</div>
        <Segmented value={s.streamContent} onChange={(v) => setSetting({ streamContent: v })} options={[{ value: 'motion', label: '🎮 Flüssige Bewegung (Spiele)' }, { value: 'detail', label: '📝 Maximale Schärfe (Text/Code)' }]} />
        <Switch checked={s.streamAudio} onChange={(v) => setSetting({ streamAudio: v })} label="Systemton übertragen" desc="Ton von Spielen, Videos oder Tabs mitsenden." />
        <div className="sub-label">Bevorzugter Video-Codec</div>
        <Segmented size="sm" value={s.codec} onChange={(v) => setSetting({ codec: v })} options={[{ value: 'auto', label: 'Auto (VP9)' }, { value: 'av1', label: 'AV1' }, { value: 'h264', label: 'H.264' }, { value: 'vp8', label: 'VP8' }]} />
      </Section>
    </>
  );
}
