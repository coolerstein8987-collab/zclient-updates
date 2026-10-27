import { create } from 'zustand';
import { useStore, onSocket, toast, getSocket } from './store.js';
import { useSettings } from './settings.js';
import { sounds } from './sounds.js';

export const useVoice = create(() => ({
  channelId: null,
  status: 'idle', // idle | connecting | connected
  muted: false,
  deafened: false,
  video: false,
  screen: false,
  joinedAt: null,
  speaking: {},
  local: { cam: null, screen: null },
  remote: {}, // userId -> { [streamId]: MediaStream }
  peerStates: {},
  ptt: false,
  noMic: false,
}));
const vset = useVoice.setState;
const vget = useVoice.getState;

const STREAM_BITRATE = { 720: [2_500_000, 4_000_000], 1080: [4_500_000, 8_000_000], 1440: [8_000_000, 14_000_000], 2160: [14_000_000, 25_000_000] };
const STREAM_SIZE = { 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
const CAM_SIZE = { 360: [640, 360], 720: [1280, 720], 1080: [1920, 1080] };

const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

class VoiceEngine {
  peers = new Map();
  members = new Set();
  audioEls = new Map(); // key -> { el, userId, streamId }
  analysers = new Map(); // streamId -> { userId, analyser, src }
  containers = null;
  ctx = null;
  raw = null;
  src = null;
  camTrack = null;
  screenTracks = [];
  pttHeld = false;
  pttTimer = null;
  noiseFloor = -60;
  holdUntil = 0;
  loop = null;

  constructor() {
    onSocket((socket) => {
      let first = true;
      socket.on('connect', () => {
        if (!first && this.channelId) {
          const cid = this.channelId;
          this.cleanup(true);
          this.join(cid);
        }
        first = false;
      });
      socket.on('rtc:signal', (msg) => this.onSignal(msg).catch((e) => console.warn('[rtc]', e)));
      socket.on('voice:update', ({ channelId, userId, state }) => this.onVoiceUpdate(channelId, userId, state));
    });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.setPtt(false));
    window.addEventListener('zync:logout', () => this.channelId && this.leave());
    useSettings.subscribe((s, prev) => {
      if (!this.channelId) return;
      if (s.inputDevice !== prev.inputDevice || s.noiseSuppression !== prev.noiseSuppression || s.echoCancellation !== prev.echoCancellation || s.autoGain !== prev.autoGain) {
        this.restartMic();
      }
      if (s.inputVolume !== prev.inputVolume && this.inGain) this.inGain.gain.value = s.inputVolume / 100;
      if (s.outputVolume !== prev.outputVolume || s.userVolumes !== prev.userVolumes || s.outputDevice !== prev.outputDevice) this.applyOutput();
      if (s.audioBitrate !== prev.audioBitrate) this.peers.forEach((p) => this.tuneSenders(p));
    });
  }

  get channelId() { return vget().channelId; }
  get myId() { return useStore.getState().me?.id; }

  // ---------- Audio-Graph ----------
  ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.inGain = ctx.createGain();
    this.inGain.gain.value = useSettings.getState().inputVolume / 100;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.dest = ctx.createMediaStreamDestination();
    this.inGain.connect(this.analyser);
    this.inGain.connect(this.gate).connect(this.dest);
    this.buf = new Float32Array(this.analyser.fftSize);
  }

  async startMic() {
    const s = useSettings.getState();
    const audio = {
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGain,
      channelCount: 1,
      sampleRate: 48000,
    };
    if (s.inputDevice && s.inputDevice !== 'default') audio.deviceId = { exact: s.inputDevice };
    let raw;
    try {
      raw = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e) {
      if (audio.deviceId) {
        delete audio.deviceId;
        raw = await navigator.mediaDevices.getUserMedia({ audio });
      } else throw e;
    }
    this.raw = raw;
    this.src = this.ctx.createMediaStreamSource(raw);
    this.src.connect(this.inGain);
    vset({ noMic: false });
  }

  stopMic() {
    try { this.src?.disconnect(); } catch { /* schon getrennt */ }
    this.raw?.getTracks().forEach((t) => t.stop());
    this.raw = null;
    this.src = null;
  }

  async restartMic() {
    this.stopMic();
    try { await this.startMic(); } catch { vset({ noMic: true }); toast('Mikrofon konnte nicht gestartet werden', 'error'); }
  }

  micLevelDb() {
    if (!this.analyser) return -100;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    return 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-8);
  }

  tick = () => {
    const s = useSettings.getState();
    const v = vget();
    const now = performance.now();
    const db = this.micLevelDb();
    // Adaptive Rauschschwelle für automatische Empfindlichkeit
    if (db < this.noiseFloor) this.noiseFloor = db;
    else this.noiseFloor += 0.05;
    const threshold = s.autoSensitivity ? Math.min(-30, Math.max(-65, this.noiseFloor + 14)) : s.sensitivity;
    if (db > threshold) this.holdUntil = now + 280;
    const active = s.inputMode === 'ptt' ? v.ptt : now < this.holdUntil;
    const open = active && !v.muted && !v.deafened && !v.noMic;
    this.gate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, 0.012);

    const speaking = { [this.myId]: open && (s.inputMode === 'ptt' ? db > -62 : db > threshold - 3) };
    const voice = useStore.getState().voice[this.channelId] || {};
    for (const [streamId, a] of this.analysers) {
      if (voice[a.userId]?.streams?.screen === streamId) continue;
      a.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rdb = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-8);
      if (rdb > -52) speaking[a.userId] = true;
      else if (!(a.userId in speaking)) speaking[a.userId] = false;
    }
    const prev = v.speaking;
    const changed = Object.keys(speaking).some((k) => !!prev[k] !== !!speaking[k]) || Object.keys(prev).some((k) => !(k in speaking));
    if (changed) vset({ speaking });
  };

  // ---------- Beitreten / Verlassen ----------
  async join(channelId) {
    if (!channelId || this.channelId === channelId) return;
    if (this.channelId) this.leave(true);
    const socket = getSocket();
    if (!socket?.connected) return toast('Keine Verbindung zum Server', 'error');
    this.ensureCtx();
    vset({ channelId, status: 'connecting', joinedAt: Date.now(), video: false, screen: false, remote: {}, speaking: {}, peerStates: {} });
    this.containers = { mic: this.dest.stream, cam: new MediaStream(), screen: new MediaStream() };
    try {
      await this.startMic();
    } catch {
      vset({ noMic: true });
      toast('Kein Mikrofonzugriff – du kannst trotzdem zuhören. Prüfe die Browser-Berechtigung.', 'error', 5000);
    }
    if (this.channelId !== channelId) return;
    const { muted, deafened } = vget();
    socket.emit('voice:join', { channelId, state: { muted, deafened } }, (res) => {
      if (res?.error) {
        toast(res.error, 'error');
        return this.cleanup();
      }
      if (this.channelId !== channelId) return;
      vset({ status: 'connected' });
      this.members = new Set(res.peers.map((p) => p.userId));
      for (const p of res.peers) {
        const peer = this.createPeer(p.userId);
        this.attachLocalTracks(peer);
      }
      this.pushState();
      sounds.connect();
    });
    clearInterval(this.loop);
    this.loop = setInterval(this.tick, 50);
  }

  leave(silent = false) {
    if (!this.channelId) return;
    getSocket()?.emit('voice:leave');
    this.cleanup();
    if (!silent) sounds.disconnect();
  }

  cleanup(keepFlags = false) {
    clearInterval(this.loop);
    this.loop = null;
    for (const uid of [...this.peers.keys()]) this.closePeer(uid);
    this.stopMic();
    this.camTrack?.stop();
    this.camTrack = null;
    this.screenTracks.forEach((t) => t.stop());
    this.screenTracks = [];
    this.members.clear();
    if (this.gate) this.gate.gain.value = 0;
    vset((v) => ({
      channelId: null, status: 'idle', joinedAt: null, video: false, screen: false,
      local: { cam: null, screen: null }, remote: {}, speaking: {}, peerStates: {},
      muted: keepFlags ? v.muted : v.muted, deafened: v.deafened,
    }));
  }

  // ---------- Peers ----------
  createPeer(userId) {
    this.closePeer(userId);
    const pc = new RTCPeerConnection({ iceServers: useStore.getState().rtc?.iceServers || [], bundlePolicy: 'max-bundle' });
    const peer = { userId, pc, polite: this.myId > userId, makingOffer: false, ignoreOffer: false, senders: {}, attached: false };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(userId, { description: pc.localDescription });
      } catch (e) {
        console.warn('[rtc] negotiation', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.signal(userId, { candidate });
    pc.ontrack = (e) => this.onTrack(userId, e);
    pc.onsignalingstatechange = () => pc.signalingState === 'stable' && this.tuneSenders(peer);
    pc.onconnectionstatechange = () => {
      vset((v) => ({ peerStates: { ...v.peerStates, [userId]: pc.connectionState } }));
      if (pc.connectionState === 'failed') pc.restartIce?.();
    };
    this.peers.set(userId, peer);
    return peer;
  }

  closePeer(userId) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(userId);
    for (const [key, a] of this.audioEls) {
      if (a.userId === userId) {
        try { a.src?.disconnect(); a.gain?.disconnect(); } catch { /* egal */ }
        a.el.srcObject = null;
        a.el.remove();
        this.audioEls.delete(key);
      }
    }
    for (const [sid, a] of this.analysers) {
      if (a.userId === userId) this.analysers.delete(sid);
    }
    vset((v) => {
      const remote = { ...v.remote };
      delete remote[userId];
      const peerStates = { ...v.peerStates };
      delete peerStates[userId];
      return { remote, peerStates };
    });
  }

  signal(to, data) {
    getSocket()?.emit('rtc:signal', { to, data: JSON.parse(JSON.stringify(data)) });
  }

  attachLocalTracks(peer) {
    if (peer.attached) return;
    peer.attached = true;
    const micTrack = this.containers.mic.getAudioTracks()[0];
    if (micTrack) this.setSender(peer, 'mic', micTrack, this.containers.mic);
    if (this.camTrack) this.setSender(peer, 'cam', this.camTrack, this.containers.cam);
    const [sv, sa] = [this.screenTracks.find((t) => t.kind === 'video'), this.screenTracks.find((t) => t.kind === 'audio')];
    if (sv) this.setSender(peer, 'screen', sv, this.containers.screen);
    if (sa) this.setSender(peer, 'screenAudio', sa, this.containers.screen);
  }

  setSender(peer, kind, track, stream) {
    const existing = peer.senders[kind];
    if (existing) {
      existing.replaceTrack(track).catch(() => {});
      this.tuneSenders(peer);
      return;
    }
    if (!track) return;
    const sender = peer.pc.addTrack(track, stream);
    peer.senders[kind] = sender;
    if (track.kind === 'video') this.preferCodecs(peer.pc, sender);
  }

  preferCodecs(pc, sender) {
    const pref = useSettings.getState().codec;
    const tr = pc.getTransceivers().find((t) => t.sender === sender);
    const caps = window.RTCRtpReceiver?.getCapabilities?.('video')?.codecs;
    if (!tr?.setCodecPreferences || !caps) return;
    const order = { auto: ['video/VP9', 'video/AV1', 'video/H264', 'video/VP8'], av1: ['video/AV1', 'video/VP9', 'video/H264', 'video/VP8'], vp9: ['video/VP9', 'video/VP8', 'video/H264'], h264: ['video/H264', 'video/VP8'], vp8: ['video/VP8', 'video/H264'] }[pref] || [];
    const rank = (c) => {
      const i = order.indexOf(c.mimeType);
      return i === -1 ? order.length : i;
    };
    try {
      tr.setCodecPreferences([...caps].sort((a, b) => rank(a) - rank(b)));
    } catch { /* Browser unterstützt es nicht */ }
  }

  async tuneSenders(peer) {
    const s = useSettings.getState();
    const apply = async (sender, fn) => {
      if (!sender?.track) return;
      try {
        const p = sender.getParameters();
        if (!p.encodings?.length) return;
        fn(p);
        await sender.setParameters(p);
      } catch { /* während Neuverhandlung ignorieren */ }
    };
    await apply(peer.senders.mic, (p) => {
      p.encodings[0].maxBitrate = s.audioBitrate * 1000;
      p.encodings[0].priority = 'high';
      p.encodings[0].networkPriority = 'high';
    });
    await apply(peer.senders.cam, (p) => {
      p.encodings[0].maxBitrate = { 360: 800_000, 720: 2_500_000, 1080: 4_500_000 }[s.camQuality] || 2_500_000;
    });
    await apply(peer.senders.screen, (p) => {
      const [lo, hi] = STREAM_BITRATE[s.streamRes] || STREAM_BITRATE[1080];
      p.encodings[0].maxBitrate = s.streamFps >= 60 ? hi : lo;
      p.encodings[0].maxFramerate = s.streamFps;
      p.degradationPreference = s.streamContent === 'detail' ? 'maintain-resolution' : 'maintain-framerate';
    });
  }

  async onSignal({ from, data }) {
    if (!this.channelId || from === this.myId) return;
    let peer = this.peers.get(from);
    const { description, candidate } = data || {};
    if (!peer) {
      if (!description || description.type !== 'offer') return;
      peer = this.createPeer(from);
      this.members.add(from);
    }
    const { pc } = peer;
    if (description) {
      const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(description);
      if (description.type === 'offer') {
        this.attachLocalTracks(peer);
        await pc.setLocalDescription();
        this.signal(from, { description: pc.localDescription });
      }
    } else if (candidate) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        if (!peer.ignoreOffer) console.warn('[rtc] ice', e);
      }
    }
  }

  onTrack(userId, e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    vset((v) => ({ remote: { ...v.remote, [userId]: { ...v.remote[userId], [stream.id]: stream } } }));
    if (e.track.kind === 'audio') {
      const key = `${stream.id}:${e.track.id}`;
      if (!this.audioEls.has(key)) {
        const trackStream = new MediaStream([e.track]);
        // Das (stumme) Audio-Element hält den WebRTC-Stream in Chrome "am Leben";
        // abgespielt wird über Web Audio, damit Lautstärken bis 200 % möglich sind.
        const el = document.createElement('audio');
        el.autoplay = true;
        el.srcObject = trackStream;
        el.style.display = 'none';
        document.body.appendChild(el);
        const entry = { el, userId, streamId: stream.id, gain: null, src: null };
        try {
          entry.src = this.ctx.createMediaStreamSource(trackStream);
          entry.gain = this.ctx.createGain();
          entry.src.connect(entry.gain).connect(this.ctx.destination);
          el.muted = true;
        } catch {
          entry.gain = null;
        }
        this.audioEls.set(key, entry);
        if (!this.analysers.has(stream.id) && entry.src) {
          const analyser = this.ctx.createAnalyser();
          analyser.fftSize = 1024;
          entry.src.connect(analyser);
          this.analysers.set(stream.id, { userId, analyser, src: entry.src });
        }
        this.applyOutput();
        el.play?.().catch(() => {});
      }
    }
    e.track.onunmute = () => vset((v) => ({ remote: { ...v.remote } }));
  }

  applyOutput() {
    const s = useSettings.getState();
    const { deafened } = vget();
    for (const { el, userId, gain } of this.audioEls.values()) {
      const vol = deafened ? 0 : (s.outputVolume / 100) * ((s.userVolumes[userId] ?? 100) / 100);
      if (gain) gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
      else {
        el.volume = Math.max(0, Math.min(1, vol));
        el.muted = deafened;
      }
    }
    const sink = s.outputDevice && s.outputDevice !== 'default' ? s.outputDevice : '';
    if (this.ctx?.setSinkId && this.ctx.sinkId !== sink) this.ctx.setSinkId(sink).catch(() => {});
  }

  onVoiceUpdate(channelId, userId, state) {
    if (channelId !== this.channelId) return;
    if (userId === this.myId) {
      if (!state && vget().status === 'connected') {
        this.cleanup();
        sounds.disconnect();
      }
      return;
    }
    if (!state) {
      if (this.members.has(userId)) sounds.leave();
      this.members.delete(userId);
      this.closePeer(userId);
    } else if (!this.members.has(userId)) {
      this.members.add(userId);
      sounds.join();
    }
  }

  pushState() {
    const v = vget();
    getSocket()?.emit('voice:state', {
      muted: v.muted || v.noMic,
      deafened: v.deafened,
      video: v.video,
      screen: v.screen,
      streams: { cam: this.containers?.cam.id, screen: this.containers?.screen.id },
    });
  }

  // ---------- Steuerung ----------
  toggleMute() {
    const v = vget();
    if (v.deafened) {
      vset({ deafened: false, muted: false });
      sounds.unmute();
    } else {
      vset({ muted: !v.muted });
      v.muted ? sounds.unmute() : sounds.mute();
    }
    this.applyOutput();
    if (this.channelId) this.pushState();
  }

  toggleDeafen() {
    const v = vget();
    vset({ deafened: !v.deafened });
    v.deafened ? sounds.unmute() : sounds.deafen();
    this.applyOutput();
    if (this.channelId) this.pushState();
  }

  setPtt(on) {
    clearTimeout(this.pttTimer);
    if (on) vset({ ptt: true });
    else this.pttTimer = setTimeout(() => vset({ ptt: false }), useSettings.getState().pttDelay);
  }

  onKey(e, down) {
    const s = useSettings.getState();
    if (s.inputMode !== 'ptt' || e.code !== s.pttKey || isTypingTarget(e.target)) return;
    if (e.repeat) return;
    this.setPtt(down);
  }

  async toggleVideo() {
    if (!this.channelId) return;
    if (vget().video) {
      this.camTrack?.stop();
      this.camTrack = null;
      this.peers.forEach((p) => p.senders.cam?.replaceTrack(null).catch(() => {}));
      vset({ video: false, local: { ...vget().local, cam: null } });
      this.pushState();
      return;
    }
    const s = useSettings.getState();
    const [w, h] = CAM_SIZE[s.camQuality] || CAM_SIZE[720];
    const video = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } };
    if (s.camDevice && s.camDevice !== 'default') video.deviceId = { exact: s.camDevice };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video });
      const track = stream.getVideoTracks()[0];
      track.contentHint = 'motion';
      this.camTrack = track;
      this.peers.forEach((p) => this.setSender(p, 'cam', track, this.containers.cam));
      vset({ video: true, local: { ...vget().local, cam: new MediaStream([track]) } });
      this.pushState();
    } catch {
      toast('Kamera konnte nicht gestartet werden', 'error');
    }
  }

  async toggleScreen() {
    if (!this.channelId) return;
    if (vget().screen) return this.stopScreen();
    const s = useSettings.getState();
    const [w, h] = STREAM_SIZE[s.streamRes] || STREAM_SIZE[1080];
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: s.streamFps, max: s.streamFps } },
        audio: s.streamAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      });
      const [videoTrack] = stream.getVideoTracks();
      const [audioTrack] = stream.getAudioTracks();
      videoTrack.contentHint = s.streamContent === 'detail' ? 'detail' : 'motion';
      if (audioTrack) audioTrack.contentHint = 'music';
      videoTrack.onended = () => this.stopScreen();
      this.screenTracks = [videoTrack, audioTrack].filter(Boolean);
      this.peers.forEach((p) => {
        this.setSender(p, 'screen', videoTrack, this.containers.screen);
        if (audioTrack) this.setSender(p, 'screenAudio', audioTrack, this.containers.screen);
      });
      vset({ screen: true, local: { ...vget().local, screen: new MediaStream([videoTrack]) } });
      this.pushState();
      sounds.streamStart();
    } catch (e) {
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') toast('Bildschirmübertragung nicht möglich', 'error');
    }
  }

  stopScreen() {
    this.screenTracks.forEach((t) => t.stop());
    this.screenTracks = [];
    this.peers.forEach((p) => {
      p.senders.screen?.replaceTrack(null).catch(() => {});
      p.senders.screenAudio?.replaceTrack(null).catch(() => {});
    });
    vset({ screen: false, local: { ...vget().local, screen: null } });
    this.pushState();
  }
}

export const voice = new VoiceEngine();

export async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: all.filter((d) => d.kind === 'audioinput'),
      outputs: all.filter((d) => d.kind === 'audiooutput'),
      cams: all.filter((d) => d.kind === 'videoinput'),
    };
  } catch {
    return { inputs: [], outputs: [], cams: [] };
  }
}
