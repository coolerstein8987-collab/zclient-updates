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
