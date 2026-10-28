import { create } from 'zustand';
import { logoDataUrl, logoPng } from './logo.js';

const KEY = 'zync.settings.v1';

export const THEMES = {
  nacht: { name: 'Nacht', desc: 'Standard, tiefes Blau-Schwarz', preview: ['#0b0d12', '#151924', '#1d2230'] },
  amoled: { name: 'AMOLED', desc: 'Echtes Schwarz für OLED', preview: ['#000000', '#0a0a0a', '#141414'] },
  graphit: { name: 'Graphit', desc: 'Klassisch grau', preview: ['#1e1f22', '#2b2d31', '#313338'] },
  hell: { name: 'Hell', desc: 'Klar und freundlich', preview: ['#f3f4f8', '#ffffff', '#e8eaf1'] },
  aurora: { name: 'Aurora', desc: 'Violette Nordlichter', preview: ['#120c24', '#1b1336', '#261b4a'] },
  ozean: { name: 'Ozean', desc: 'Tiefsee-Blau', preview: ['#06141f', '#0b2030', '#112b40'] },
  wald: { name: 'Wald', desc: 'Moosig und ruhig', preview: ['#0b140f', '#122019', '#1a2c22'] },
  sakura: { name: 'Sakura', desc: 'Kirschblüten-Rosa', preview: ['#1c0f16', '#2a1520', '#3a1d2c'] },
  sunset: { name: 'Sunset', desc: 'Warmes Abendrot', preview: ['#1a0e0b', '#271511', '#371e17'] },
  cyber: { name: 'Cyber', desc: 'Neon auf Schwarz', preview: ['#05060a', '#0b0f17', '#101725'] },
  latte: { name: 'Latte', desc: 'Warmes Creme-Hell', preview: ['#f4ede4', '#fbf7f2', '#eadfd2'] },
};

export const ACCENTS = [
  ['#7c5cff', '#00d4ff'], ['#ff5ca8', '#ffb35c'], ['#22c55e', '#06b6d4'], ['#f43f5e', '#a855f7'],
  ['#f59e0b', '#ef4444'], ['#3b82f6', '#8b5cf6'], ['#14b8a6', '#84cc16'], ['#ec4899', '#8b5cf6'],
  ['#e11d48', '#fb923c'], ['#0ea5e9', '#22d3ee'], ['#a3e635', '#22c55e'], ['#ffffff', '#94a3b8'],
];

export const DEFAULTS = {
  // Darstellung
  theme: 'nacht',
  accent: '#7c5cff',
  accent2: '#00d4ff',
  gradientAccent: true,
  uiFont: 'inter',
  fontScale: 100,
  chatFontScale: 100,
  radius: 14,
  density: 'cozy',
  messageStyle: 'classic',
  layout: 'auto',
  saturation: 100,
  floatingPanels: true,
  // Visuelle Effekte & 3D
  background: 'aurora',
  bgIntensity: 60,
  tilt3d: true,
  tiltStrength: 12,
  parallax: true,
  glass: true,
  glassBlur: 18,
  glow: true,
  animations: 'full',
  hover3dIcons: true,
  messageAnimations: true,
  animatedAvatars: 'always',
  // App-Icon
  appIcon: 'aurora',
  // Chat
  time24h: true,
  enterToSend: true,
  markdown: true,
  jumboEmoji: true,
  voiceTranscripts: true,
  aiLanguage: 'Deutsch',
  emojiConvert: true,
  showEmbeds: true,
  autoplayGifs: true,
  spoilers: 'click',
  showTyping: true,
  sendTyping: true,
  showReactions: true,
  groupMinutes: 7,
  imageSize: 'medium',
  showAvatars: true,
  linkify: true,
  confirmDelete: true,
  // Benachrichtigungen
  notifDesktop: false,
  notifSounds: true,
  soundVolume: 60,
  notifDMs: true,
  notifMentions: true,
  notifAllMessages: false,
  soundJoinLeave: true,
  titleBadge: true,
  // Sprache & Video
  inputDevice: 'default',
  outputDevice: 'default',
  camDevice: 'default',
  inputVolume: 100,
  outputVolume: 100,
  inputMode: 'vad',
  autoSensitivity: true,
  sensitivity: -50,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  pttKey: 'KeyV',
  pttDelay: 200,
  audioBitrate: 128,
  camQuality: '720',
  mirrorCam: true,
  streamRes: '1080',
  streamFps: 60,
  streamContent: 'motion',
  streamAudio: true,
  codec: 'auto',
  userVolumes: {},
  soundboardVolume: 60,
  soundboardEnabled: true,
  detectGames: true,
  // Tastenkürzel
  keyMute: 'Ctrl+Shift+KeyM',
  keyDeafen: 'Ctrl+Shift+KeyD',
  keySwitcher: 'Ctrl+KeyK',
  // Sonstiges
  hiddenDms: [],
  collapsed: {},
  favoriteGifs: [],
  recentEmojis: [],
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useSettings = create(() => load());

export const setSetting = (patch) => useSettings.setState(typeof patch === 'function' ? patch(useSettings.getState()) : patch);
export const resetSettings = () => useSettings.setState({ ...DEFAULTS }, true);

let saveTimer;
useSettings.subscribe((s) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* voll / privat */ }
  }, 150);
  applySettings(s);
});

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

export function applySettings(s = useSettings.getState()) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.density = s.density;
  root.dataset.msgstyle = s.messageStyle;
  root.dataset.anim = s.animations;
  root.dataset.font = s.uiFont;
  root.classList.toggle('glass', !!s.glass && s.background !== 'none');
  root.classList.toggle('glow', !!s.glow);
  root.classList.toggle('floating', !!s.floatingPanels);
  root.classList.toggle('icons3d', !!s.hover3dIcons && s.animations !== 'off');
  root.classList.toggle('msg-anim', !!s.messageAnimations && s.animations === 'full');
  root.classList.toggle('sat', s.saturation !== 100);
  const st = root.style;
  st.setProperty('--accent', s.accent);
  st.setProperty('--accent-rgb', hexToRgb(s.accent));
  st.setProperty('--accent-2', s.gradientAccent ? s.accent2 : s.accent);
  st.setProperty('--font-scale', s.fontScale / 100);
  st.setProperty('--chat-scale', s.chatFontScale / 100);
  st.setProperty('--radius', `${s.radius}px`);
  st.setProperty('--glass-blur', `${s.glassBlur}px`);
  st.setProperty('--saturation', s.saturation / 100);
  st.setProperty('--bg-intensity', s.bgIntensity / 100);
  const fav = document.getElementById('app-favicon');
  const icon = logoDataUrl(s.appIcon);
  if (fav && fav.href !== icon) fav.href = icon;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEMES[s.theme]?.preview[0] || '#0b0d12';
  if (window.zyncDesktop?.setIconPng && lastDesktopIcon !== s.appIcon) {
    lastDesktopIcon = s.appIcon;
    logoPng(s.appIcon).then((png) => png && window.zyncDesktop.setIconPng(png));
  }
}
let lastDesktopIcon = null;

/** Tastenkürzel wie "Ctrl+Shift+KeyM" gegen ein KeyboardEvent prüfen. */
export function matchesShortcut(e, combo) {
  if (!combo) return false;
  const parts = combo.split('+');
  const code = parts.pop();
  const want = new Set(parts);
  return e.code === code
    && e.ctrlKey === (want.has('Ctrl') || false)
    && e.shiftKey === want.has('Shift')
    && e.altKey === want.has('Alt')
    && e.metaKey === want.has('Meta');
}

export function shortcutFromEvent(e) {
  if (['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.code);
  return parts.join('+');
}

export function prettyShortcut(combo) {
  if (!combo) return '—';
  return combo.split('+').map((p) => p.replace(/^Key/, '').replace(/^Digit/, '').replace('Backquote', '^').replace('Space', 'Leertaste').replace('Ctrl', 'Strg')).join(' + ');
}
