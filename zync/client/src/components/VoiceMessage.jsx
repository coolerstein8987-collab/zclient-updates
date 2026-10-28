import { useEffect, useRef, useState } from 'react';
import { Trash2, SendHorizontal, Play, Pause } from 'lucide-react';
import { useSettings } from '../lib/settings.js';
import { toast } from '../lib/store.js';
import { cx, formatDuration } from '../lib/format.js';

const MAX_SECONDS = 300;

function pickMime() {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

function downsample(peaks, n = 48) {
  if (!peaks.length) return Array(n).fill(8);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
    out.push(Math.max(...peaks.slice(a, b)));
  }
  const max = Math.max(...out, 1);
  return out.map((v) => Math.max(6, Math.round((v / max) * 100)));
}

/** Aufnahme-Leiste: ersetzt das Eingabefeld, solange aufgenommen wird. */
export function VoiceRecorder({ onSend, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]);
  const [ready, setReady] = useState(false);
  const r = useRef({});
  const s = useSettings.getState();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const audio = { echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGain };
        if (s.inputDevice !== 'default') audio.deviceId = { ideal: s.inputDevice };
        const stream = await navigator.mediaDevices.getUserMedia({ audio });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const mimeType = pickMime();
        const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const chunks = [];
        const peaks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.start(250);
        const started = performance.now();
        const timer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          peaks.push(peak);
          setLevels((l) => [...l.slice(-39), peak]);
          const sec = (performance.now() - started) / 1000;
          setElapsed(sec);
          if (sec >= MAX_SECONDS) finish(true);
        }, 80);
        r.current = { stream, rec, ctx, chunks, peaks, timer, started, mimeType: rec.mimeType || mimeType };
        setReady(true);
      } catch {
        toast('Kein Mikrofonzugriff – erlaube das Mikrofon im Browser.', 'error');
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    const c = r.current;
    clearInterval(c.timer);
    c.stream?.getTracks().forEach((t) => t.stop());
    c.ctx?.close().catch(() => {});
  }

  function finish(send) {
    const c = r.current;
    if (!c.rec || c.done) return;
    c.done = true;
    clearInterval(c.timer);
    const duration = (performance.now() - c.started) / 1000;
    c.rec.onstop = () => {
      cleanup();
      if (!send) return onCancel();
      if (duration < 0.6) {
        toast('Zu kurz – halte länger gedrückt 🎤', 'info');
        return onCancel();
      }
      const type = (c.mimeType || 'audio/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File(c.chunks, `Sprachnachricht.${ext}`, { type });
      onSend(file, Math.round(duration * 10) / 10, downsample(c.peaks));
    };
    c.rec.stop();
  }

  return (
    <div className="voice-recorder">
      <button type="button" className="vr-btn cancel" onClick={() => finish(false)} data-tip="Verwerfen"><Trash2 size={18} /></button>
      <span className="vr-dot" />
      <span className="vr-time">{formatDuration(elapsed * 1000)}</span>
      <div className="vr-wave">
        {Array.from({ length: 40 }, (_, i) => {
          const v = levels[i - (40 - levels.length)] ?? 0;
          return <i key={i} style={{ height: `${Math.max(8, Math.min(100, v * 1.6))}%` }} />;
        })}
      </div>
      <button type="button" className="vr-btn stop" onClick={() => finish(true)} disabled={!ready} data-tip="Senden"><SendHorizontal size={18} /></button>
    </div>
  );
}

let playing = null;

/** Player für Sprachnachrichten mit Wellenform, Spulen und Tempo. */
export function VoicePlayer({ a }) {
  const ref = useRef(null);
  const [state, setState] = useState({ playing: false, t: 0, d: a.duration || 0 });
  const [rate, setRate] = useState(1);
  const bars = a.waveform?.length ? a.waveform : Array.from({ length: 48 }, (_, i) => 20 + ((i * 37) % 60));
  const toggle = () => {
    const el = ref.current;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      el.play().catch(() => toast('Abspielen nicht möglich', 'error'));
    } else el.pause();
  };
  const seek = (e) => {
    const el = ref.current;
    const box = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const d = Number.isFinite(el.duration) ? el.duration : state.d;
    if (d) el.currentTime = p * d;
  };
  const pct = state.d ? state.t / state.d : 0;
  return (
    <div className={cx('voice-player', state.playing && 'playing')}>
      <audio
        ref={ref}
        src={a.url}
        preload="metadata"
        onPlay={() => setState((s) => ({ ...s, playing: true }))}
        onPause={() => setState((s) => ({ ...s, playing: false }))}
        onEnded={(e) => { e.currentTarget.currentTime = 0; setState((s) => ({ ...s, playing: false, t: 0 })); }}
        onTimeUpdate={(e) => setState((s) => ({ ...s, t: e.currentTarget.currentTime }))}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setState((s) => ({ ...s, d: e.currentTarget.duration }))}
      />
      <button type="button" className="vp-play" onClick={toggle} aria-label={state.playing ? 'Pause' : 'Abspielen'}>{state.playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <div className="vp-wave" onClick={seek} role="slider" aria-valuenow={Math.round(pct * 100)} tabIndex={0}>
        {bars.map((v, i) => <i key={i} className={cx(i / bars.length < pct && 'on')} style={{ height: `${v}%` }} />)}
      </div>
      <span className="vp-time">{formatDuration((state.playing || state.t ? state.t : state.d) * 1000)}</span>
      <button type="button" className="vp-rate" onClick={() => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(next); ref.current.playbackRate = next; }}>{rate}×</button>
    </div>
  );
}

