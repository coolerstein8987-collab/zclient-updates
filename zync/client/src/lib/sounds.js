import { useSettings } from './settings.js';

// Alle UI-Sounds werden live synthetisiert – keine Audiodateien nötig.
let ctx;
const audio = () => {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

function tone(notes, { type = 'sine', gain = 0.18, attack = 0.01, release = 0.18 } = {}) {
  const s = useSettings.getState();
  if (!s.notifSounds) return;
  const vol = (s.soundVolume / 100) * gain;
  if (vol <= 0) return;
  const c = audio();
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(c.destination);
  let t = c.currentTime + 0.01;
  for (const [freq, dur, freq2] of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + release);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + release + 0.05);
    t += dur * 0.85;
  }
}

export const sounds = {
  message: () => tone([[880, 0.06], [1320, 0.09]], { type: 'triangle', gain: 0.14 }),
  mention: () => tone([[988, 0.07], [1319, 0.07], [1760, 0.1]], { type: 'triangle', gain: 0.16 }),
  join: () => useSettings.getState().soundJoinLeave && tone([[523, 0.07], [784, 0.12]], { gain: 0.16 }),
  leave: () => useSettings.getState().soundJoinLeave && tone([[784, 0.07], [523, 0.12]], { gain: 0.16 }),
  mute: () => tone([[600, 0.05, 380]], { type: 'square', gain: 0.05 }),
  unmute: () => tone([[380, 0.05, 600]], { type: 'square', gain: 0.05 }),
  deafen: () => tone([[500, 0.06, 250], [250, 0.06]], { type: 'square', gain: 0.05 }),
  connect: () => tone([[392, 0.08], [523, 0.08], [784, 0.14]], { gain: 0.15 }),
  disconnect: () => tone([[784, 0.08], [523, 0.08], [392, 0.14]], { gain: 0.15 }),
  streamStart: () => tone([[660, 0.06], [990, 0.06], [1320, 0.1]], { type: 'triangle', gain: 0.12 }),
  friend: () => tone([[659, 0.08], [831, 0.08], [988, 0.14]], { type: 'triangle', gain: 0.15 }),
  error: () => tone([[220, 0.12], [196, 0.18]], { type: 'sawtooth', gain: 0.06 }),
};

let ringTimer = null;
export function startRinging() {
  stopRinging();
  const ring = () => tone([[784, 0.12], [988, 0.12], [784, 0.12], [988, 0.2]], { type: 'triangle', gain: 0.2 });
  ring();
  ringTimer = setInterval(ring, 2200);
}
export function stopRinging() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}

export function unlockAudio() {
  audio();
}

// ---------- Soundboard ----------
export const SOUNDBOARD = [
  { id: 'airhorn', emoji: '📯', name: 'Airhorn' },
  { id: 'badumtss', emoji: '🥁', name: 'Ba-dum-tss' },
  { id: 'tada', emoji: '🎉', name: 'Tada' },
  { id: 'sad', emoji: '😢', name: 'Sad Trombone' },
  { id: 'boing', emoji: '🦘', name: 'Boing' },
  { id: 'applause', emoji: '👏', name: 'Applaus' },
  { id: 'drumroll', emoji: '🪘', name: 'Trommelwirbel' },
  { id: 'ding', emoji: '🔔', name: 'Ding' },
  { id: 'coin', emoji: '🪙', name: 'Münze' },
  { id: 'laser', emoji: '🔫', name: 'Laser' },
  { id: 'woosh', emoji: '💨', name: 'Woosh' },
  { id: 'heartbeat', emoji: '💓', name: 'Herzschlag' },
];

let noiseBuf;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function env(c, g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(c, out, type, f, t, dur, peak = 0.5, f2) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(c, g, t, 0.01, peak, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function hit(c, out, t, { freq = 1800, q = 0.8, dur = 0.12, peak = 0.8, type = 'bandpass' } = {}) {
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(c, g, t, 0.003, peak, dur);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
}

const RECIPES = {
  airhorn(c, out, t) {
    for (let i = 0; i < 3; i++) {
      const st = t + i * (i === 2 ? 0.28 : 0.22);
      const len = i === 2 ? 0.7 : 0.16;
      for (const f of [440, 554, 659]) {
        const o = osc(c, out, 'sawtooth', f, st, len, 0.18);
        const lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = 7;
        lg.gain.value = 6;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(st);
        lfo.stop(st + len + 0.05);
      }
    }
  },
  badumtss(c, out, t) {
    osc(c, out, 'sine', 180, t, 0.15, 0.9, 60);
    hit(c, out, t + 0.18, { freq: 1500, dur: 0.12 });
    osc(c, out, 'sine', 180, t + 0.36, 0.15, 0.9, 60);
    hit(c, out, t + 0.55, { freq: 8000, q: 0.3, dur: 0.9, type: 'highpass', peak: 0.5 });
  },
  tada(c, out, t) {
    [523, 659, 784].forEach((f, i) => osc(c, out, 'triangle', f, t + i * 0.08, 0.12, 0.35));
    [523, 659, 784, 1047].forEach((f) => osc(c, out, 'triangle', f, t + 0.3, 0.8, 0.22));
  },
  sad(c, out, t) {
    [392, 370, 349].forEach((f, i) => osc(c, out, 'sawtooth', f, t + i * 0.42, 0.36, 0.2));
    const o = osc(c, out, 'sawtooth', 330, t + 1.26, 1.1, 0.2, 300);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = 8;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t + 1.26);
    lfo.stop(t + 2.4);
  },
  boing(c, out, t) {
    const o = osc(c, out, 'sine', 120, t, 0.6, 0.6, 600);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 18;
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.65);
  },
  applause(c, out, t) {
    for (let i = 0; i < 70; i++) hit(c, out, t + Math.random() * 1.8, { freq: 1200 + Math.random() * 1800, q: 1.2, dur: 0.05, peak: 0.25 + Math.random() * 0.3 });
  },
  drumroll(c, out, t) {
    for (let i = 0; i < 28; i++) hit(c, out, t + i * 0.05, { freq: 1600, dur: 0.06, peak: 0.25 + (i / 28) * 0.5 });
    hit(c, out, t + 1.45, { freq: 7000, q: 0.3, dur: 1.2, type: 'highpass', peak: 0.6 });
    osc(c, out, 'sine', 120, t + 1.45, 0.3, 0.8, 50);
  },
  ding(c, out, t) {
    osc(c, out, 'sine', 1318, t, 1.2, 0.4);
    osc(c, out, 'sine', 2637, t, 0.6, 0.15);
  },
  coin(c, out, t) {
    osc(c, out, 'square', 988, t, 0.08, 0.15);
    osc(c, out, 'square', 1319, t + 0.08, 0.4, 0.15);
  },
  laser(c, out, t) {
    for (let i = 0; i < 3; i++) osc(c, out, 'square', 1600, t + i * 0.14, 0.12, 0.12, 200);
  },
  woosh(c, out, t) {
    const n = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.7);
    const g = c.createGain();
    env(c, g, t, 0.2, 0.7, 0.5);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.8);
  },
  heartbeat(c, out, t) {
    for (const st of [0, 0.22, 0.9, 1.12]) osc(c, out, 'sine', 70, t + st, 0.18, 0.9, 40);
  },
};

/** Spielt einen Soundboard-Sound ab (eingebaut oder hochgeladen). */
export function playSoundboard(sound, volume = 0.6) {
  if (!sound) return;
  if (sound.startsWith('builtin:')) {
    const recipe = RECIPES[sound.slice(8)];
    if (!recipe) return;
    const c = audio();
    const out = c.createGain();
    out.gain.value = volume;
    out.connect(c.destination);
    recipe(c, out, c.currentTime + 0.02);
    setTimeout(() => out.disconnect(), 4000);
  } else {
    const a = new Audio(sound);
    a.volume = Math.min(1, volume);
    a.play().catch(() => {});
    setTimeout(() => a.pause(), 8000);
  }
}
