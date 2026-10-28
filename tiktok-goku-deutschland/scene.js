// "Was wäre, wenn Son Goku aus Deutschland käme?" — toy-style 3D sketch comedy.
// Every visual is a pure function of time t (renderAt), so frames can be captured one by one.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W = 1080, H = 1920, D2R = Math.PI / 180;
const V3 = THREE.Vector3;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  outBack: k => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
};
const pulse = (t, t0, a, d) => (t < t0 ? 0 : t - t0 < a ? (t - t0) / a : Math.exp(-(t - t0 - a) / d));
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- timeline cues
const TL = await (await fetch('timeline.json')).json();
const line = i => TL.lines[i - 1];
const cw = (i, w, n = 0) => line(i).words.filter(x => x.w === w)[n].t0;
const C = {
  goku: cw(1, 'Goku'), l2: line(2).start, nicht: cw(2, 'nicht'), juergen: cw(2, 'Jürgen.'),
  l3: line(3).start, kame: cw(3, 'Kamehameha'), antrag: cw(3, 'Antrag.'), dreifach: cw(3, 'dreifacher'),
  l4: line(4).start, ruhe: cw(4, 'Ruhezeiten.'), sonntags: cw(4, 'Sonntags'),
  l5: line(5).start, bahn: cw(5, 'Bahn.'), n20: cw(5, '20'),
  l6: line(6).start, ordentlich: cw(6, 'ordentlich'),
  l7: line(7).start, liege: cw(7, 'Liege'), n6: cw(7, '6'), socken: cw(7, 'Socken'),
  l8: line(8).start, ueber: cw(8, 'über'), n9000: cw(8, '9000.'), steuer: cw(8, 'Steuererklärung:'),
  l9: line(9).start, land: cw(9, 'Land'), schreib: cw(9, "Schreib's"), end: TL.duration,
};
C.land0 = Math.max(0.9, C.goku - 0.1);   // Goku lands from the sky
C.feet = C.socken - 0.08;                // cut to the socks-and-sandals reveal
const CUTS = [C.l2, C.l3, C.l4, C.l5, C.l6, C.l7, C.feet, C.l8, C.l9].map((t, i) => ({ t, dir: i % 2 ? [1, 0] : [0, 1] }));
const SHOT = t => (t < C.l2 ? 1 : t < C.l3 ? 2 : t < C.l4 ? 3 : t < C.l5 ? 4 : t < C.l6 ? 5 : t < C.l7 ? 6 : t < C.feet ? 7 : t < C.l8 ? 7.5 : t < C.l9 ? 8 : 9);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 2000);

const R = mulberry(11);
const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, ...o });
function mesh(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  parent.add(o);
  return o;
}
const rbox = (w, h, d, r = 0.05) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function glowTex() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}
const GLOW = glowTex();
const glow = (color, s, parent = scene) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(s); parent.add(sp); return sp; };

// ---------------------------------------------------------------- sky + lights
const skyU = { top: { value: new THREE.Color(0.18, 0.5, 0.95) }, bot: { value: new THREE.Color(0.75, 0.9, 1.0) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform vec3 top, bot; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6 + .15, 0., 1.); gl_FragColor = vec4(mix(bot, top, h), 1.); }',
}));
scene.add(sky);
const sun = new THREE.DirectionalLight(0xfff3e0, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 });
sun.shadow.bias = -0.0005; sun.shadow.radius = 4;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a7a5a, 1.2);
scene.add(hemi);

// ---------------------------------------------------------------- Goku ("Jürgen")
const SKIN = 0xf3c79d, ORANGE = 0xf27a1a, BLUE = 0x1f4fb5, HAIR_BLACK = new THREE.Color(0x141418), HAIR_GOLD = new THREE.Color(0xffd23a);
function faceTexture(expr) {
  return canvasTex(512, 512, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const eye = (cx, side) => {
      g.save(); g.translate(cx, 262);
      if (expr === 'happy') {
        g.strokeStyle = '#111'; g.lineWidth = 16; g.beginPath(); g.arc(0, 18, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else {
        const ry = expr === 'shock' ? 62 : 54;
        g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 9;
        g.beginPath(); g.ellipse(0, 0, 44, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        const ir = expr === 'shock' ? 13 : 27;
        g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(side * 3, 10, ir, ir * 1.35, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(side * 3 - 8, -4, expr === 'shock' ? 4 : 9, 0, Math.PI * 2); g.fill();
        if (expr === 'annoyed') { g.fillStyle = '#f3c79d'; g.fillRect(-52, -70, 104, 62); g.strokeStyle = '#111'; g.lineWidth = 10; g.beginPath(); g.moveTo(-46, -8); g.lineTo(46, -8); g.stroke(); }
      }
      g.restore();
      // eyebrow
      g.strokeStyle = '#111'; g.lineWidth = 18; g.beginPath();
      const by = expr === 'shock' ? 168 : expr === 'happy' ? 190 : 196;
      const tilt = expr === 'determined' || expr === 'annoyed' ? 22 : expr === 'shock' ? -10 : 0;
      g.moveTo(cx - side * 50, by - tilt * -0.2); g.lineTo(cx + side * 42, by + tilt); g.stroke();
    };
    eye(170, 1); eye(342, -1);
    g.strokeStyle = '#111'; g.lineWidth = 9; g.beginPath(); g.moveTo(258, 318); g.lineTo(250, 340); g.lineTo(262, 342); g.stroke();
    if (expr === 'happy' || expr === 'proud') {
      g.fillStyle = '#7a1b1b'; g.strokeStyle = '#111'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(190, 380); g.quadraticCurveTo(256, 470, 322, 380); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ff7f7f'; g.beginPath(); g.ellipse(256, 420, 32, 16, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,110,110,.35)'; g.beginPath(); g.ellipse(120, 350, 34, 18, 0, 0, 7); g.ellipse(392, 350, 34, 18, 0, 0, 7); g.fill();
    } else if (expr === 'shock') {
      g.fillStyle = '#5a1515'; g.strokeStyle = '#111'; g.lineWidth = 8; g.beginPath(); g.ellipse(256, 410, 26, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    } else if (expr === 'annoyed') {
      g.strokeStyle = '#111'; g.lineWidth = 10; g.beginPath(); g.moveTo(215, 405); g.quadraticCurveTo(256, 390, 300, 410); g.stroke();
    } else {
      g.strokeStyle = '#111'; g.lineWidth = 10; g.beginPath(); g.moveTo(210, 395); g.quadraticCurveTo(256, 425, 305, 392); g.stroke();
    }
    if (expr === 'annoyed' || expr === 'shock') {
      g.fillStyle = '#7fd0ff'; g.strokeStyle = '#2a6f9a'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(430, 150); g.quadraticCurveTo(460, 205, 430, 222); g.quadraticCurveTo(400, 205, 430, 150); g.fill(); g.stroke();
    }
  });
}
const FACES = Object.fromEntries(['normal', 'happy', 'proud', 'determined', 'shock', 'annoyed'].map(e => [e, faceTexture(e)]));
function buildGoku() {
  const root = new THREE.Group(), P = {};
  const skin = mat(SKIN, { clearcoat: 0.2 }), orange = mat(ORANGE), blue = mat(BLUE), white = mat(0xf4f4f4, { roughness: 0.8, clearcoat: 0 });
  P.hairMat = mat(HAIR_BLACK.getHex(), { roughness: 0.5, clearcoat: 0.6 });
  const body = new THREE.Group(); root.add(body); P.body = body;
  // legs + feet
  P.legs = [-1, 1].map(s => {
    const leg = new THREE.Group(); leg.position.set(s * 0.15, 0.62, 0); body.add(leg);
    mesh(new THREE.CapsuleGeometry(0.135, 0.3, 6, 16), orange, leg, 0, -0.27, 0);
    const boot = new THREE.Group(); boot.position.set(0, -0.52, 0.02); leg.add(boot);
    const boots = new THREE.Group(); boot.add(boots);
    mesh(rbox(0.22, 0.2, 0.32, 0.07), blue, boots, 0, 0, 0.03);
    mesh(new THREE.TorusGeometry(0.105, 0.025, 8, 20).rotateX(Math.PI / 2), mat(0xffc21a), boots, 0, 0.1, 0.0);
    const sandals = new THREE.Group(); boot.add(sandals);
    mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.2, 16), white, sandals, 0, 0.04, 0);
    mesh(rbox(0.2, 0.09, 0.3, 0.035), white, sandals, 0, -0.04, 0.05);
    mesh(rbox(0.24, 0.035, 0.36, 0.015), mat(0x6b3d1e), sandals, 0, -0.09, 0.05);
    mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 20, Math.PI).rotateY(Math.PI / 2), mat(0x6b3d1e), sandals, 0, -0.06, 0.1);
    return { leg, boots, sandals };
  });
  // torso, undershirt, belt
  mesh(new THREE.CapsuleGeometry(0.27, 0.22, 8, 20).scale(1.12, 1, 0.82), orange, body, 0, 0.94, 0);
  const v = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), blue, body, 0, 1.1, 0.2); v.rotation.z = Math.PI / 4;
  mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.08, 24).scale(1.1, 1, 0.84), blue, body, 0, 0.72, 0);
  mesh(new THREE.SphereGeometry(0.05, 12, 10), blue, body, 0.08, 0.7, 0.25);
  const badge = mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = '900 86px Inter'; g.textAlign = 'center'; g.fillText('J', 64, 94); }) }), body, -0.12, 0.98, 0.224);
  badge.rotation.y = -0.25; badge.castShadow = false;
  // arms (pivot at the shoulder)
  P.arms = [-1, 1].map(s => {
    const arm = new THREE.Group(); arm.position.set(s * 0.33, 1.1, 0); body.add(arm);
    mesh(new THREE.SphereGeometry(0.11, 16, 12), orange, arm, 0, 0, 0);
    mesh(new THREE.CapsuleGeometry(0.075, 0.28, 6, 12), skin, arm, 0, -0.2, 0);
    mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.09, 16), blue, arm, 0, -0.36, 0);
    mesh(new THREE.SphereGeometry(0.095, 16, 12), skin, arm, 0, -0.45, 0);
    return arm;
  });
  // head
  const head = new THREE.Group(); head.position.set(0, 1.52, 0); body.add(head); P.head = head;
  mesh(new THREE.SphereGeometry(0.36, 32, 24), skin, head);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.075, 12, 10).scale(0.6, 1, 0.8), skin, head, s * 0.35, -0.02, 0);
  const faceMat = new THREE.MeshStandardMaterial({ map: FACES.normal, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const face = mesh(new THREE.SphereGeometry(0.3615, 48, 32, Math.PI / 2 - 0.95, 1.9, 0.8, 1.35), faceMat, head);
  face.castShadow = false; face.renderOrder = 2;
  P.faceMat = faceMat;
  // hair: cap + spikes
  mesh(new THREE.SphereGeometry(0.385, 32, 16, 0, Math.PI * 2, 0, 1.5), P.hairMat, head, 0, 0.03, -0.035).rotation.x = -0.6;
  const spike = (dir, len, rad, root = 0.27) => {
    const d = new V3(...dir).normalize();
    const g = new THREE.ConeGeometry(rad, len, 14).translate(0, len / 2, 0);
    const m = mesh(g, P.hairMat, head);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d);
    m.position.copy(d.clone().multiplyScalar(root));
  };
  [[[0, 1, -0.15], 0.62, 0.2], [[0.5, 0.85, -0.3], 0.58, 0.19], [[-0.5, 0.85, -0.3], 0.58, 0.19], [[0.82, 0.45, -0.3], 0.5, 0.17],
   [[-0.82, 0.45, -0.3], 0.5, 0.17], [[0.35, 0.6, -0.85], 0.52, 0.18], [[-0.35, 0.6, -0.85], 0.52, 0.18], [[0, 0.25, -1], 0.48, 0.18],
   [[0.9, 0.0, -0.45], 0.36, 0.14], [[-0.9, 0.0, -0.45], 0.36, 0.14], [[0.25, 0.95, 0.1], 0.45, 0.16], [[-0.25, 0.95, 0.1], 0.45, 0.16]]
    .forEach(([d, l, r]) => spike(d, l, r));
  const bang = (x, dir, len) => { const d = new V3(...dir).normalize(); const g = new THREE.ConeGeometry(0.07, len, 10).translate(0, len / 2, 0); const m = mesh(g, P.hairMat, head, x, 0.26, 0.24); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d); };
  bang(-0.13, [-0.35, -0.55, 0.75], 0.24); bang(0.02, [0.05, -0.75, 0.66], 0.3); bang(0.15, [0.4, -0.55, 0.72], 0.24);
  // sunglasses for the beach
  P.shades = new THREE.Group(); head.add(P.shades);
  for (const s of [-1, 1]) mesh(rbox(0.17, 0.11, 0.03, 0.02), mat(0x111111, { roughness: 0.15 }), P.shades, s * 0.12, 0.03, 0.35);
  mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), mat(0x111111), P.shades, 0, 0.06, 0.36);
  P.setFace = e => { if (faceMat.map !== FACES[e]) { faceMat.map = FACES[e]; faceMat.needsUpdate = true; } };
  P.setFeet = sandals => P.legs.forEach(l => { l.boots.visible = !sandals; l.sandals.visible = sandals; });
  return { root, P };
}
const goku = buildGoku();
scene.add(goku.root);
const G = goku.P;
function pose(t, o = {}) {
  // o: armL/armR as [x, z] rotations, bob, lean, headTilt, legs
  const bob = Math.sin(t * 5.5) * 0.015 * (o.bob ?? 1);
  G.body.position.y = bob + (o.y ?? 0);
  G.body.rotation.x = o.lean ?? 0;
  const [lx, lz] = o.armL ?? [0.1, 0.18], [rx, rz] = o.armR ?? [0.1, -0.18];
  G.arms[0].rotation.set(lx, 0, lz); G.arms[1].rotation.set(rx, 0, rz);
  G.head.rotation.set(o.headX ?? 0, o.headY ?? 0, o.headZ ?? Math.sin(t * 1.7) * 0.03);
  const walk = o.walk ?? 0;
  G.legs[0].leg.rotation.x = Math.sin(walk) * 0.5 + (o.legL ?? 0);
  G.legs[1].leg.rotation.x = -Math.sin(walk) * 0.5 + (o.legR ?? 0);
}

// ---------------------------------------------------------------- sets
const sets = {};
function newSet(name, x) { const g = new THREE.Group(); g.position.set(x, 0, 0); scene.add(g); sets[name] = g; return g; }
function flagTex(kind) {
  return canvasTex(300, 200, (g, w, h) => {
    const bands = (cols, vertical) => cols.forEach((c, i) => { g.fillStyle = c; vertical ? g.fillRect(i * w / cols.length, 0, w / cols.length + 1, h) : g.fillRect(0, i * h / cols.length, w, h / cols.length + 1); });
    if (kind === 'de') bands(['#111', '#dd0000', '#ffce00']);
    if (kind === 'it') bands(['#009246', '#fff', '#ce2b37'], true);
    if (kind === 'fr') bands(['#0055a4', '#fff', '#ef4135'], true);
    if (kind === 'jp') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(w / 2, h / 2, 58, 0, 7); g.fill(); }
    if (kind === 'us') { for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * h / 13, w, h / 13 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.42, h * 0.54); g.fillStyle = '#fff'; for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) g.fillRect(10 + x * 20, 10 + y * 20, 6, 6); }
    if (kind === 'br') { g.fillStyle = '#009c3b'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(w / 2, 18); g.lineTo(w - 22, h / 2); g.lineTo(w / 2, h - 18); g.lineTo(22, h / 2); g.fill(); g.fillStyle = '#002776'; g.beginPath(); g.arc(w / 2, h / 2, 46, 0, 7); g.fill(); }
    if (kind === 'tr') { g.fillStyle = '#e30a17'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(120, 100, 56, 0, 7); g.fill(); g.fillStyle = '#e30a17'; g.beginPath(); g.arc(136, 100, 45, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 26; g.lineTo(196 + Math.cos(a) * r, 100 + Math.sin(a) * r); } g.fill(); }
    if (kind === 'es') { bands(['#aa151b', '#f1bf00', '#f1bf00', '#aa151b']); }
  });
}
function flagMesh(kind, w = 1.2, h = 0.8) {
  const g = new THREE.PlaneGeometry(w, h, 24, 8);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: flagTex(kind), side: THREE.DoubleSide, roughness: 0.7 }));
  m.castShadow = true;
  m.userData.base = Float32Array.from(g.attributes.position.array);
  return m;
}
function waveFlag(m, t, amp = 0.06) {
  const p = m.geometry.attributes.position, b = m.userData.base;
  for (let i = 0; i < p.count; i++) { const x = b[i * 3], u = (x / (m.geometry.parameters.width) + 0.5); p.setZ(i, Math.sin(x * 5 - t * 6) * amp * u); }
  p.needsUpdate = true; m.geometry.computeVertexNormals();
}
function cloudPuff(parent, x, y, z, s, color = 0xffffff, emissive = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const m = mat(color, { roughness: 0.9, clearcoat: 0, emissive, emissiveIntensity: 0.25 });
  [[0, 0, 0, 1], [0.8, -0.1, 0, 0.75], [-0.8, -0.1, 0, 0.7], [0.4, 0.35, 0, 0.7], [-0.35, 0.3, 0.1, 0.65]].forEach(([a, b, c, r]) => mesh(new THREE.SphereGeometry(r * s, 20, 14), m, g, a * s, b * s, c * s));
  return g;
}
function textPanel(w, h, draw, emissive = false) {
  const tex = canvasTex(Math.round(w * 400), Math.round(h * 400), draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), emissive ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  m.receiveShadow = true;
  return m;
}

// --- street with a German terraced house
const street = newSet('street', 0);
{
  mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), mat(0x6cc04a, { clearcoat: 0, roughness: 0.95 }), street);
  mesh(rbox(3.0, 0.06, 14, 0.02), mat(0xcfcfcf, { clearcoat: 0 }), street, 0, 0.03, 0).rotation.y = Math.PI / 2;
  const house = new THREE.Group(); house.position.set(0, 0, -3.2); street.add(house);
  mesh(new THREE.BoxGeometry(5.2, 3.4, 3), mat(0xf3e2c0, { clearcoat: 0, roughness: 0.9 }), house, 0, 1.7, 0);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-2.9, 0); roofShape.lineTo(0, 1.9); roofShape.lineTo(2.9, 0); roofShape.closePath();
  const roof = mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 3.4, bevelEnabled: false }), mat(0xb33a2a, { roughness: 0.6 }), house, 0, 3.4, -1.7);
  const win = (x, y) => { const g = new THREE.Group(); g.position.set(x, y, 1.52); house.add(g); mesh(rbox(0.95, 0.95, 0.08, 0.03), mat(0xffffff), g); mesh(new THREE.PlaneGeometry(0.78, 0.78), mat(0x6fb4e8, { roughness: 0.1, clearcoat: 1 }), g, 0, 0, 0.05); mesh(new THREE.BoxGeometry(0.06, 0.78, 0.04), mat(0xffffff), g, 0, 0, 0.07); return g; };
  win(-1.5, 1.4); win(1.5, 1.4); win(1.5, 2.65);
  sets.neighborWin = win(-1.5, 2.65);
  mesh(rbox(0.9, 1.7, 0.12, 0.04), mat(0x7a4a2a), house, 0, 0.85, 1.52);
  mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0xffd23f, { metalness: 0.8 }), house, 0.3, 0.85, 1.62);
  for (const x of [-2.3, -1.5, 1.5, 2.3]) mesh(rbox(0.75, 0.6, 0.6, 0.2), mat(0x2f8f3a, { clearcoat: 0.1 }), street, x, 0.3, -1.4);
  // garden gnome
  const gn = new THREE.Group(); gn.position.set(-0.95, 0, -1.25); street.add(gn);
  mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 14), mat(0x2b62c4), gn, 0, 0.15, 0);
  mesh(new THREE.SphereGeometry(0.1, 14, 10), mat(SKIN), gn, 0, 0.38, 0);
  mesh(new THREE.ConeGeometry(0.1, 0.18, 14).translate(0, -0.09, 0).rotateX(Math.PI), mat(0xffffff), gn, 0, 0.36, 0.06);
  mesh(new THREE.ConeGeometry(0.12, 0.28, 14), mat(0xd62020), gn, 0, 0.56, 0);
  // German flag on a pole
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 10), mat(0xdddddd, { metalness: 0.6 }), street, 2.0, 1.6, -1.0);
  sets.deFlag = flagMesh('de', 1.1, 0.7); sets.deFlag.position.set(2.57, 2.8, -1.0); street.add(sets.deFlag);
  // neighbour Herr Müller (hidden behind the window until he pops out)
  const nb = new THREE.Group(); nb.position.set(-1.5, 2.4, -1.75); street.add(nb); sets.neighbor = nb;
  mesh(new THREE.SphereGeometry(0.32, 24, 16), mat(0xf1c3a0), nb, 0, 0.3, 0);
  mesh(rbox(0.3, 0.07, 0.05, 0.02), mat(0x4a2f1c), nb, 0, 0.2, 0.31);
  for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 20), mat(0x222222), nb, s * 0.11, 0.36, 0.3);
  mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.4, 20), mat(0x8b9bb0), nb, 0, -0.15, 0);
  // the paper form for the Kamehameha permit, three copies
  sets.forms = [0, 1, 2].map(i => {
    const f = textPanel(0.75, 1.0, (g, w, h) => {
      g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.textAlign = 'center';
      g.font = '900 34px Inter'; g.fillText('ANTRAG', w / 2, 60); g.font = '700 22px Inter'; g.fillText('auf Genehmigung eines', w / 2, 96); g.fillText('Energiestrahls (Kamehameha)', w / 2, 124);
      g.textAlign = 'left'; g.font = '600 18px Inter';
      ['Name: Jürgen', 'Kraftlevel: ____', 'Zweck: ____', 'Unterschrift: ____'].forEach((s, k) => { g.fillText(s, 30, 190 + k * 42); g.fillRect(30, 198 + k * 42, w - 60, 2); });
      g.font = '700 18px Inter'; g.fillText(`Formular K-3 · Ausfertigung ${i + 1}/3`, 30, h - 30);
    });
    f.castShadow = true; street.add(f); return f;
  });
  sets.ball = glow(new THREE.Color(0.7, 1.4, 2.6), 0.5, street);
  sets.ballCore = mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 3.5, 5), toneMapped: false }), street);
  sets.ballCore.castShadow = false;
  sets.puff = glow(new THREE.Color(0.9, 0.9, 0.9), 0.1, street);
}
// --- train platform
const platform = newSet('platform', 100);
{
  mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), mat(0x7b7b7b, { clearcoat: 0 }), platform, 0, -1.0, 0);
  mesh(new THREE.BoxGeometry(14, 1.0, 4), mat(0xbdbdbd, { clearcoat: 0, roughness: 0.9 }), platform, 0, -0.5, -0.5);
  mesh(new THREE.BoxGeometry(14, 0.02, 0.15), mat(0xffd400), platform, 0, 0.01, 1.2);
  for (const z of [2.2, 3.4]) mesh(new THREE.BoxGeometry(14, 0.12, 0.1), mat(0x666666, { metalness: 0.7 }), platform, 0, -0.9, z);
  for (let x = -6; x <= 6; x += 0.7) mesh(new THREE.BoxGeometry(0.25, 0.08, 1.8), mat(0x5a4636), platform, x, -0.96, 2.8);
  for (const x of [-0.9, 0.9]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), mat(0x445566), platform, x + 1.6, 1.3, -1.6);
  const board = textPanel(2.6, 0.95, (g, w, h) => {
    g.fillStyle = '#0d1d4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 56px Inter'; g.fillText('ICE 1337', 40, 90);
    g.font = '800 72px Inter'; g.fillText('→ München Hbf', 40, 190); g.fillStyle = '#9fb3ff'; g.font = '700 46px Inter'; g.fillText('Ab 14:05  ·  Gleis 3', 40, 290);
  }, true);
  board.position.set(1.6, 2.4, -1.58); platform.add(board); sets.board = board;
  const delay = textPanel(1.0, 0.36, (g, w, h) => { g.fillStyle = '#ff8a00'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = '900 96px Inter'; g.textAlign = 'center'; g.fillText('+20 MIN', w / 2, 112); }, true);
  delay.position.set(2.4, 1.78, -1.55); platform.add(delay); sets.delay = delay;
  const suitcase = new THREE.Group(); suitcase.position.set(0.85, 0, 0.35); platform.add(suitcase);
  mesh(rbox(0.45, 0.6, 0.25, 0.06), mat(0xd62f2f), suitcase, 0, 0.32, 0);
  mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), mat(0x222222), suitcase, 0, 0.62, 0);
  sets.nimbus = cloudPuff(platform, -0.5, 0.6, 1.0, 0.28, 0xffd23f, 0xffb000);
  const sign = textPanel(0.9, 0.35, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e02020'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14); g.fillStyle = '#e02020'; g.font = '900 64px Inter'; g.textAlign = 'center'; g.fillText('AUSSER BETRIEB', w / 2, 92); });
  sign.position.set(-0.5, 1.05, 1.35); sign.rotation.z = 0.12; sign.scale.setScalar(0.7); platform.add(sign);
}
// --- recycling bins
const bins = newSet('bins', 200);
{
  mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), mat(0x9a9a96, { clearcoat: 0, roughness: 0.95 }), bins);
  mesh(new THREE.BoxGeometry(12, 4, 0.4), mat(0xc0603a, { clearcoat: 0, roughness: 0.9 }), bins, 0, 2, -1.6);
  const cols = [[0xffd21a, 'GELB'], [0x1f5fd6, 'PAPIER'], [0x7a4b26, 'BIO'], [0x2c2c2c, 'REST']];
  sets.binPos = cols.map(([c, txt], i) => {
    const x = -1.95 + i * 1.3, g = new THREE.Group(); g.position.set(x, 0, -0.7); bins.add(g);
    mesh(rbox(1.0, 1.25, 0.95, 0.07), mat(c), g, 0, 0.66, 0);
    const lid = mesh(rbox(1.08, 0.1, 1.05, 0.04), mat(c), g, 0, 1.33, 0);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14).rotateZ(Math.PI / 2), mat(0x222222), g, s * 0.42, 0.1, -0.42);
    const lab = textPanel(0.7, 0.26, (gg, w, h) => { gg.fillStyle = '#fff'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#111'; gg.font = '900 68px Inter'; gg.textAlign = 'center'; gg.fillText(txt, w / 2, 84); });
    lab.position.set(0, 0.85, 0.49); g.add(lab);
    return { x, lid };
  });
  const starTex = n => canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffb43a'); gr.addColorStop(1, '#f07800'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d61f1f';
    const star = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill(); };
    const pts = [[0, 0], [-14, 0, 14, 0], [-14, 8, 14, 8, 0, -14], [-12, -10, 12, -10, -12, 12, 12, 12]];
    const p = n <= 4 ? pts[n - 1] : [-14, -10, 14, -10, 0, 0, -14, 12, 14, 12, 0, 22, 0, -22].slice(0, n * 2);
    for (let i = 0; i < p.length; i += 2) star(64 + p[i] * 1.3, 64 + p[i + 1] * 1.3, 13);
  });
  sets.balls = Array.from({ length: 7 }, (_, i) => mesh(new THREE.SphereGeometry(0.16, 32, 20), new THREE.MeshPhysicalMaterial({ map: starTex(i + 1), roughness: 0.08, clearcoat: 1, transmission: 0.0 }), bins));
}
// --- beach at 6 a.m.
const beach = newSet('beach', 300);
{
  mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), mat(0xf2d9a0, { clearcoat: 0, roughness: 1 }), beach);
  const sea = mesh(new THREE.PlaneGeometry(200, 60).rotateX(-Math.PI / 2), mat(0x24a6c9, { roughness: 0.15, clearcoat: 1 }), beach, 0, 0.02, -36);
  sea.receiveShadow = false;
  sets.loungers = [-2.4, 0, 2.4].map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 0, -1.6); beach.add(g);
    mesh(rbox(0.8, 0.08, 1.9, 0.03), mat(0xffffff), g, 0, 0.42, 0);
    const back = mesh(rbox(0.8, 0.08, 0.8, 0.03), mat(0xffffff), g, 0, 0.7, -0.98); back.rotation.x = -0.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), mat(0xdddddd), g, sx * 0.34, 0.21, sz * 0.8);
    const towel = mesh(new THREE.PlaneGeometry(0.7, 1.8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(128, 256, (gg, w, h) => { for (let k = 0; k < 8; k++) { gg.fillStyle = ['#e02020', '#ffffff', '#ffd21a', '#ffffff'][k % 4]; gg.fillRect(0, k * h / 8, w, h / 8 + 1); } }), roughness: 0.9 }), g, 0, 0.47, 0);
    return { g, towel, i };
  });
  sets.sun = glow(new THREE.Color(3, 1.6, 0.6), 9, beach); sets.sun.position.set(-6, 3.5, -40);
  sets.umbrella = new THREE.Group(); sets.umbrella.position.set(3.4, 0, -2.6); beach.add(sets.umbrella);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), mat(0xeeeeee), sets.umbrella, 0, 1.1, 0);
  mesh(new THREE.ConeGeometry(1.1, 0.45, 16, 1, true), mat(0x2a6fdc, { side: THREE.DoubleSide }), sets.umbrella, 0, 2.25, 0);
}
// --- studio for the power-level gag and the outro
const studio = newSet('studio', 400);
{
  const wallTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#2f8cff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4;
    for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * w / 16, 0); g.lineTo(i * w / 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 16); g.lineTo(w, i * h / 16); g.stroke(); }
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(2, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  sets.studioWall = mesh(new THREE.PlaneGeometry(24, 16), wallMat, studio, 0, 6, -3);
  sets.studioFloor = mesh(new THREE.PlaneGeometry(24, 12).rotateX(-Math.PI / 2), wallMat, studio, 0, 0, 2);
  sets.aura = [0, 1, 2].map(i => glow(new THREE.Color(1.5, 1.1, 0.2), 2, studio));
  // tax-return tower
  sets.papers = new THREE.Group(); sets.papers.position.set(1.15, 0, 0.2); studio.add(sets.papers);
  for (let i = 0; i < 46; i++) { const p = mesh(new THREE.BoxGeometry(0.62, 0.045, 0.85), mat(i % 7 === 3 ? 0xffe9a8 : 0xfafafa, { clearcoat: 0, roughness: 0.9 }), sets.papers, (R() - 0.5) * 0.06, 0.025 + i * 0.047, (R() - 0.5) * 0.05); p.rotation.y = (R() - 0.5) * 0.12; }
  const lab = textPanel(0.62, 0.3, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#c01818'; g.font = '900 48px Inter'; g.textAlign = 'center'; g.fillText('STEUER', w / 2, 60); g.fillText('2026', w / 2, 112); });
  lab.position.set(0, 0.5, 0.43); sets.papers.add(lab);
  sets.flags = ['jp', 'it', 'us', 'br', 'tr', 'fr', 'es'].map(k => { const f = flagMesh(k, 0.75, 0.5); studio.add(f); return f; });
}
// dust ring used on landing
const dust = Array.from({ length: 14 }, () => { const s = glow(new THREE.Color(0.9, 0.85, 0.75), 0.4); s.material.blending = THREE.NormalBlending; return s; });
scene.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

// ---------------------------------------------------------------- post-processing
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Number(new URLSearchParams(location.search).get('msaa') ?? 4) });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.45, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uBlur: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uSeed: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uBlur, uRes; uniform float uFlash, uSeed; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 col = vec3(0.);
      if (length(uBlur) > .0005) { for (int i = 0; i < 16; i++) { float k = float(i) / 15. - .5; col += texture2D(tDiffuse, vUv + uBlur * k).rgb; } col /= 16.; }
      else col = texture2D(tDiffuse, vUv).rgb;
      vec2 c = (vUv - .5) * vec2(1., 1.2);
      col *= mix(1., smoothstep(1.05, .35, length(c)), .45);
      col += (hash(vUv * uRes + uSeed) - .5) * .02;
      col = mix(col, vec3(1.), uFlash);
      gl_FragColor = vec4(col, 1.);
    }`,
});
composer.addPass(finalPass);

// ---------------------------------------------------------------- shots
function lookFrom(pos, target, fov) { camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(target); camera.fov = fov; }
function placeGoku(set, x, z, ry) { goku.root.position.set(sets[set].position.x + x, 0, z); goku.root.rotation.set(0, ry, 0); }
function setLight(set, dir, intensity = 3, top, bot) {
  const o = sets[set].position;
  sun.target.position.set(o.x, 0, 0); sun.position.set(o.x + dir[0] * 12, dir[1] * 12, dir[2] * 12); sun.intensity = intensity;
  if (top) skyU.top.value.set(...top); if (bot) skyU.bot.value.set(...bot);
}
const anchors = {};
function setupShot(t, shot) {
  for (const k of ['street', 'platform', 'bins', 'beach', 'studio']) sets[k].visible = false;
  G.setFeet(false); G.shades.visible = false;
  G.hairMat.color.copy(HAIR_BLACK); G.hairMat.emissive.setRGB(0, 0, 0);
  dust.forEach(d => (d.visible = false));
  sky.visible = true;
  const S = sets;
  if (shot <= 4) {
    S.street.visible = true; waveFlag(S.deFlag, t);
    setLight('street', [0.6, 1.0, 0.8], 3.0, [0.18, 0.5, 0.95], [0.78, 0.9, 1.0]);
    S.neighbor.position.set(-1.5, 2.4, -2.4); S.forms.forEach(f => (f.visible = false)); S.ball.visible = S.ballCore.visible = S.puff.visible = false;
  }
  if (shot === 1) {
    const k = E.in(seg(t, 0, C.land0));
    placeGoku('street', 0, 0.6, 0.25);
    goku.root.position.y = (1 - k) * 9;
    const land = t - C.land0, squash = land > 0 ? Math.exp(-land / 0.18) * Math.sin(land * 30) * 0.12 : 0;
    goku.root.scale.set(1 + squash, 1 - squash, 1 + squash);
    G.setFace(t < C.land0 ? 'determined' : 'happy');
    pose(t, { armL: [t < C.land0 ? -2.6 : 0.1, 0.3], armR: [t < C.land0 ? -2.6 : -0.2, -0.3 - pulse(t, C.land0 + 0.25, 0.1, 0.6) * 2], bob: land > 0 ? 1 : 0, legL: t < C.land0 ? -0.4 : 0, legR: t < C.land0 ? 0.3 : 0 });
    if (land > 0 && land < 1.2) dust.forEach((d, i) => { const a = i / dust.length * Math.PI * 2, r = 0.35 + E.out(seg(land, 0, 0.8)) * 1.4; d.visible = true; d.position.set(Math.cos(a) * r, 0.15 + land * 0.2, 0.6 + Math.sin(a) * r); d.scale.setScalar(0.5 + land * 0.8); d.material.opacity = 0.8 * (1 - seg(land, 0.2, 1.2)); });
    const kc = E.inOut(seg(t, 0, C.l2));
    lookFrom(new V3(lerp(-1.2, 0.4, kc), lerp(1.4, 1.25, kc), lerp(6.8, 5.3, kc)), new V3(0, lerp(2.4, 1.35, E.out(seg(t, 0, C.land0 + 0.3))), 0), 42);
    return;
  }
  goku.root.scale.set(1, 1, 1); goku.root.position.y = 0;
  if (shot === 2) {
    placeGoku('street', 0, 0.6, 0.15);
    G.setFace(t < C.juergen ? 'normal' : 'proud');
    pose(t, { armR: [t > C.juergen ? -0.6 : 0.1, -0.2 - (t > C.juergen ? 0.5 : 0)], armL: [0.1, 0.2] });
    const k = E.inOut(seg(t, C.l2, C.l3));
    lookFrom(new V3(lerp(0.3, 0.1, k), 1.55, lerp(2.4, 1.85, k)), new V3(0, 1.45, 0.6), 38);
    return;
  }
  if (shot === 3) {
    placeGoku('street', 0, 0.4, 0.9);
    const charge = seg(t, C.kame, C.antrag - 0.05), pop = t >= C.antrag;
    G.setFace(pop ? 'annoyed' : 'determined');
    const fwd = pop ? lerp(-1.35, 0.1, E.out(seg(t, C.antrag, C.antrag + 0.5))) : -1.35;
    pose(t, { armL: [fwd, -0.15], armR: [fwd, 0.15], lean: pop ? 0 : 0.08 });
    const hp = new V3(0, 1.05, 0.4).add(new V3(Math.sin(0.9), 0, Math.cos(0.9)).multiplyScalar(0.62));
    S.ball.visible = S.ballCore.visible = !pop && charge > 0;
    const bs = E.out(charge) * (1 + 0.08 * Math.sin(t * 40));
    S.ball.position.copy(hp); S.ballCore.position.copy(hp);
    S.ball.scale.setScalar(0.2 + bs * 0.75); S.ballCore.scale.setScalar(0.2 + bs * 1.1);
    const pk = t - C.antrag;
    S.puff.visible = pop && pk < 0.7; S.puff.position.copy(hp).add(new V3(0, pk * 0.5, 0)); S.puff.scale.setScalar(0.4 + pk * 2.5); S.puff.material.opacity = 1 - seg(pk, 0, 0.7);
    // permit forms drop in front of the camera, then fan out into three copies
    const cam = new V3(2.9, 1.3, 3.0), tgt = new V3(-0.2, 1.2, 0.2);
    S.forms.forEach((f, i) => {
      const fk = E.outBack(seg(t, C.antrag + 0.05, C.antrag + 0.4)), fan = E.outBack(seg(t, C.dreifach, C.dreifach + 0.35));
      f.visible = pop;
      const base = cam.clone().lerp(tgt, 0.52);
      f.position.copy(base).add(new V3((i - 1) * 0.3 * fan, lerp(1.6, 0, fk) + (i - 1) * -0.03 * fan, (1 - i) * 0.02));
      f.scale.setScalar(0.62); f.lookAt(cam); f.rotateZ((i - 1) * 0.18 * fan + (1 - fk) * 0.6);
    });
    lookFrom(cam, tgt, 40);
    return;
  }
  if (shot === 4) {
    placeGoku('street', 0.2, 0.5, 0.35);
    const pk = (t * 3.2) % 1, stop = t > C.ruhe;
    G.setFace(stop ? (t > C.sonntags ? 'shock' : 'annoyed') : 'determined');
    const punch = stop ? 0 : Math.sin(pk * Math.PI);
    pose(t, { armR: [-1.5 * punch, -0.1], armL: [-1.5 * (stop ? 0 : Math.sin(((t * 3.2 + 0.5) % 1) * Math.PI)), 0.1], legL: stop ? 0 : -0.3 * punch, bob: 2 });
    const nk = E.outBack(seg(t, C.ruhe - 0.25, C.ruhe + 0.1));
    S.neighbor.position.set(-1.5, 2.4, lerp(-1.75, -1.25, nk));
    S.neighbor.rotation.z = Math.sin(t * 9) * 0.05 * nk;
    anchors.neighbor = new V3(S.street.position.x - 1.5, 3.05, -1.2);
    const k = E.inOut(seg(t, C.l4, C.l5));
    lookFrom(new V3(lerp(2.2, 1.6, k), lerp(1.6, 1.8, k), lerp(5.8, 5.0, k)), new V3(-0.4, 1.6, -0.4), 42);
    return;
  }
  if (shot === 5) {
    S.platform.visible = true;
    setLight('platform', [0.4, 1.0, 0.7], 2.6, [0.55, 0.65, 0.8], [0.85, 0.88, 0.92]);
    placeGoku('platform', 0.35, 0.2, -0.2);
    const late = t > C.n20;
    G.setFace(late ? 'annoyed' : 'normal');
    pose(t, { armL: [0.1, 0.2], armR: late ? [-1.9, -0.6] : [0.1, -0.2], legR: late ? Math.max(0, Math.sin(t * 14)) * -0.15 : 0, headY: late ? 0.35 : 0 });
    S.delay.visible = late; S.delay.scale.setScalar(E.outBack(seg(t, C.n20, C.n20 + 0.25)));
    S.nimbus.position.y = 0.6 + Math.sin(t * 2) * 0.04; S.nimbus.rotation.z = -0.15;
    const k = E.inOut(seg(t, C.l5, C.l6));
    lookFrom(new V3(lerp(0.7, 1.0, k) + 100, 1.6, lerp(5.8, 5.0, k)), new V3(100.05, 1.4, -0.3), 46);
    return;
  }
  if (shot === 6) {
    S.bins.visible = true;
    setLight('bins', [0.5, 1.0, 0.8], 3.0, [0.18, 0.5, 0.95], [0.78, 0.9, 1.0]);
    placeGoku('bins', -2.0, 0.6, 0.6);
    G.setFace('happy');
    pose(t, { armR: [-1.2 - 0.4 * Math.sin(t * 8), -0.3], armL: [0.1, 0.2] });
    const order = [0, 1, 2, 3, 0, 1, 3];
    S.balls.forEach((b, i) => {
      const t0 = C.l6 + 0.25 + i * ((C.l7 - C.l6 - 0.9) / 7), k = seg(t, t0, t0 + 0.55);
      const target = S.binPos[order[i]];
      const from = new V3(-1.5, 1.15, 0.95), to = new V3(target.x, 1.45, -0.7);
      const p = from.clone().lerp(to, k); p.y += Math.sin(Math.PI * k) * 1.2;
      if (k >= 1) p.y = -5;
      b.position.copy(p); b.rotation.set(t * 3, t * 2, 0);
      b.visible = t > t0 - 0.3;
      if (t <= t0) b.position.set(-1.5, 1.15, 0.95);
      b.visible = t > t0 - 0.02 || i === 0;
    });
    S.binPos.forEach((bp, i) => { let open = 0; S.balls.forEach((_, j) => { if (order[j] === i) { const t0 = C.l6 + 0.25 + j * ((C.l7 - C.l6 - 0.9) / 7); open = Math.max(open, pulse(t, t0 + 0.3, 0.12, 0.3)); } }); bp.lid.rotation.x = -open * 1.1; bp.lid.position.z = -open * 0.35; });
    const k = E.inOut(seg(t, C.l6, C.l7));
    lookFrom(new V3(200 + lerp(-0.5, -0.1, k), 2.6, lerp(8.6, 8.0, k)), new V3(199.7, 1.0, -0.3), 55);
    return;
  }
  if (shot === 7 || shot === 7.5) {
    S.beach.visible = true;
    setLight('beach', [0.5, 0.55, 0.9], 2.6, [0.35, 0.45, 0.85], [1.0, 0.72, 0.5]);
    G.setFeet(true); G.shades.visible = true;
    S.loungers.forEach(l => { const k = l.i === 1 ? E.outBack(seg(t, C.liege - 0.05, C.liege + 0.35)) : 1; l.towel.visible = l.i !== 1 || t > C.liege - 0.05; l.towel.position.y = 0.47 + (1 - k) * 0.8; l.towel.rotation.z = (1 - k) * 0.8; });
    if (shot === 7) {
      placeGoku('beach', 0.9, -0.6, -0.3);
      G.setFace('proud');
      pose(t, { armL: [-0.3, 0.9], armR: [0.1, -0.2] });
      const k = E.inOut(seg(t, C.l7, C.feet));
      lookFrom(new V3(300 + lerp(1.8, 1.4, k), 1.5, lerp(4.4, 3.7, k)), new V3(300.2, 1.0, -1.0), 44);
    } else {
      placeGoku('beach', 0.9, -0.6, -0.3);
      G.setFace('proud');
      pose(t, { armL: [-0.3, 0.9], armR: [0.1, -0.2], bob: 0.3 });
      const k = E.out(seg(t, C.feet, C.l8));
      lookFrom(new V3(300.9 + lerp(0.35, 0.5, k), lerp(0.45, 0.4, k), lerp(1.25, 1.05, k)), new V3(300.9, 0.14, -0.55), 42);
    }
    return;
  }
  if (shot === 8) {
    S.studio.visible = true; sky.visible = false;
    S.studioWall.material.map.offset.set(0, 0);
    setLight('studio', [0.5, 1.0, 1.0], 2.8);
    placeGoku('studio', -0.35, 0.3, 0.2);
    const ss = seg(t, C.ueber - 0.1, C.ueber + 0.3), back = t > C.steuer;
    const gold = back ? 1 - seg(t, C.steuer, C.steuer + 0.25) : ss;
    G.hairMat.color.copy(HAIR_BLACK).lerp(HAIR_GOLD, gold); G.hairMat.emissive.setRGB(0.35 * gold, 0.25 * gold, 0);
    G.setFace(back ? 'shock' : gold > 0.5 ? 'determined' : 'normal');
    pose(t, { armL: [0.2, 0.5 * gold + 0.15], armR: [0.2, -0.5 * gold - 0.15], bob: 1 + gold * 3, y: gold * 0.05 * Math.sin(t * 30) });
    S.aura.forEach((a, i) => { a.visible = gold > 0.02; a.position.set(-0.35, 1.1 + i * 0.3, 0.3); a.scale.setScalar((1.6 + i * 0.35 + Math.sin(t * 12 + i) * 0.15) * gold); a.material.opacity = 0.35 * gold; });
    const pk = E.outBack(seg(t, C.steuer - 0.05, C.steuer + 0.3));
    S.papers.position.y = (1 - pk) * 4; S.papers.visible = t > C.steuer - 0.1;
    S.flags.forEach(f => (f.visible = false));
    const k = E.inOut(seg(t, C.l8, C.l9));
    lookFrom(new V3(400 + lerp(0.6, 0.5, k), 1.5, lerp(4.6, 4.0, k)), new V3(400.2, 1.25, 0), 44);
    return;
  }
  // shot 9: outro with flags orbiting
  S.studio.visible = true; sky.visible = false;
  setLight('studio', [0.4, 1.0, 1.0], 2.8);
  placeGoku('studio', 0, 0.3, 0);
  G.setFace('happy');
  pose(t, { armR: [-0.2, -2.4 + Math.sin(t * 10) * 0.35], armL: [0.1, 0.2], bob: 1.5 });
  S.papers.visible = false; S.aura.forEach(a => (a.visible = false));
  S.flags.forEach((f, i) => {
    const a = t * 0.9 + i / S.flags.length * Math.PI * 2, k = E.outBack(seg(t, C.l9 + 0.05 + i * 0.07, C.l9 + 0.4 + i * 0.07));
    f.visible = true;
    f.position.set(Math.cos(a) * 1.55, 2.25 + Math.sin(a * 2 + i) * 0.2 + (i % 2) * 0.3, 0.3 + Math.sin(a) * 0.9);
    f.scale.setScalar(k * 0.7); f.lookAt(camera.position); waveFlag(f, t + i, 0.04);
  });
  const k = E.inOut(seg(t, C.l9, C.end));
  lookFrom(new V3(400 + lerp(0.2, 0, k), 1.55, lerp(4.8, 4.2, k)), new V3(400, 1.35, 0), 44);
}

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = $('ui'), capEl = $('cap'), chipsEl = $('chips'), labelsEl = $('labels');
// small sign-like chips with ✓ / ✗ badges, as in the reference style
const CHIPS = [
  { t0: 0.15, t1: C.l2, html: () => 'SON GOKU 🇩🇪?' },
  { t0: C.nicht - 0.05, t1: C.juergen - 0.05, html: () => 'GOKU<span class="badge no">✕</span>' },
  { t0: C.juergen - 0.05, t1: C.l3, html: () => 'JÜRGEN<span class="badge ok">✓</span>', cls: 'y' },
  { t0: C.kame - 0.05, t1: C.antrag - 0.05, html: () => 'KAMEHAMEHA?' },
  { t0: C.antrag - 0.05, t1: C.dreifach - 0.05, html: () => 'NUR MIT ANTRAG<span class="badge no">✕</span>' },
  { t0: C.dreifach - 0.05, t1: C.l4, html: () => 'FORMULAR K-3 · 3×<span class="badge ok">✓</span>', cls: 'y' },
  { t0: C.l4 + 0.1, t1: C.ruhe - 0.05, html: () => 'TRAINING 💪' },
  { t0: C.ruhe - 0.05, t1: C.sonntags - 0.05, html: () => 'RUHEZEIT 13–15 UHR<span class="badge no">✕</span>' },
  { t0: C.sonntags - 0.05, t1: C.l5, html: () => 'SONNTAG<span class="badge no">✕</span>' },
  { t0: C.l5 + 0.1, t1: C.bahn - 0.05, html: () => 'WOLKE<span class="badge no">✕</span>' },
  { t0: C.bahn - 0.05, t1: C.n20 - 0.05, html: () => 'DEUTSCHE BAHN<span class="badge ok">✓</span>', cls: 'y' },
  { t0: C.n20 - 0.05, t1: C.l6, html: () => 'PÜNKTLICH?<span class="badge no">✕</span>' },
  { t0: C.l6 + 0.1, t1: C.ordentlich - 0.05, html: () => 'DRAGON BALLS?' },
  { t0: C.ordentlich - 0.05, t1: C.l7, html: () => 'MÜLLTRENNUNG<span class="badge ok">✓</span>', cls: 'y' },
  { t0: C.l7 + 0.1, t1: C.n6 - 0.05, html: () => 'URLAUB 🏖️' },
  { t0: C.n6 - 0.05, t1: C.feet, html: () => '06:00 UHR · RESERVIERT<span class="badge ok">✓</span>', cls: 'y' },
  { t0: C.feet, t1: C.l8, html: () => 'SOCKEN + SANDALEN<span class="badge ok">✓</span>', cls: 'y' },
  { t0: C.ueber - 0.05, t1: C.steuer - 0.05, html: t => `KRAFTLEVEL: ${Math.round(9001 * E.out(seg(t, C.ueber, C.n9000 + 0.3))).toLocaleString('de-DE')}` },
  { t0: C.steuer - 0.05, t1: C.l9, html: () => 'STEUER: 9.001 SEITEN<span class="badge no">✕</span>' },
  { t0: C.land - 0.05, t1: C.end + 1, html: () => 'WELCHES LAND? 👇', cls: 'y' },
];
const WORDS = TL.lines.flatMap(l => l.words.map((w, i) => ({ ...w, next: l.words[i + 1]?.t0 ?? l.end + 0.15 })));
let lastChip = '', lastWord = '';
function updateUI(t, shot) {
  const ch = CHIPS.filter(c => t >= c.t0 && t < c.t1).pop();
  const html = ch ? `<div class="chip ${ch.cls || ''}">${ch.html(t)}</div>` : '';
  if (html !== lastChip) { chipsEl.innerHTML = html; lastChip = html; }
  if (ch) {
    const k = seg(t, ch.t0, ch.t0 + 0.22);
    chipsEl.firstChild.style.transform = `scale(${E.outBack(k).toFixed(3)}) rotate(${((1 - k) * -6).toFixed(2)}deg)`;
    const b = chipsEl.querySelector('.badge'); if (b) b.style.transform = `scale(${E.outBack(seg(t, ch.t0 + 0.12, ch.t0 + 0.32)).toFixed(3)})`;
  }
  const w = WORDS.find(x => t >= x.t0 - 0.03 && t < Math.min(x.next - 0.03, x.t0 + 1.2));
  const wh = w ? `<span class="word${w.em ? ' em' : ''}">${w.w.replace(/[.,:]$/, '')}</span>` : '';
  if (wh !== lastWord) { capEl.innerHTML = wh; lastWord = wh; }
  if (w) capEl.firstChild.style.transform = `scale(${(0.7 + 0.3 * E.outBack(seg(t, w.t0 - 0.03, w.t0 + 0.09))).toFixed(3)})`;
  // neighbour speech bubble
  let bub = labelsEl.firstChild;
  if (!bub) { bub = document.createElement('div'); bub.className = 'bubble'; labelsEl.appendChild(bub); }
  if (shot === 4 && t > C.ruhe + 0.05 && anchors.neighbor) {
    const p = anchors.neighbor.clone().project(camera);
    bub.style.display = 'block'; bub.textContent = t > C.sonntags ? 'HEUTE IST SONNTAG!' : 'RUHESTÖRUNG!';
    bub.style.left = ((p.x * 0.5 + 0.5) * W + 90) + 'px'; bub.style.top = ((-p.y * 0.5 + 0.5) * H + 120) + 'px';
    bub.style.transform = `translate(0, -50%) scale(${E.outBack(seg(t, C.ruhe + 0.05, C.ruhe + 0.3)).toFixed(3)})`;
  } else bub.style.display = 'none';
  let wb = 0, wd = [0, 1];
  for (const c of CUTS) { const d = t - c.t; const v = d < 0 ? Math.exp(-((d / 0.05) ** 2)) : Math.exp(-((d / 0.09) ** 2)); if (v > wb) { wb = v; wd = c.dir; } }
  ui.style.transform = `translate(${(wd[0] * wb * 30).toFixed(1)}px, ${(wd[1] * wb * 30).toFixed(1)}px)`;
}

// ---------------------------------------------------------------- per frame
function renderAt(t) {
  const shot = SHOT(t);
  setupShot(t, shot);
  // camera shake on the landing
  const sh = 0.03 * pulse(t, C.land0, 0.01, 0.25);
  camera.rotateX(Math.sin(t * 61) * sh); camera.rotateY(Math.sin(t * 47 + 1) * sh);
  let punch = 0;
  for (const c of CUTS) if (t >= c.t) punch = Math.max(punch, 0.08 * Math.exp(-(t - c.t) / 0.14));
  camera.fov *= 1 + punch;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  let wb = 0, wd = [0, 1];
  for (const c of CUTS) { const d = t - c.t; const v = d < 0 ? Math.exp(-((d / 0.05) ** 2)) : Math.exp(-((d / 0.09) ** 2)); if (v > wb) { wb = v; wd = c.dir; } }
  finalPass.uniforms.uBlur.value.set(wd[0] * wb * 0.07, wd[1] * wb * 0.09);
  finalPass.uniforms.uFlash.value = 0.5 * pulse(t, C.land0, 0.01, 0.1) + 0.35 * pulse(t, C.antrag, 0.01, 0.08) + 0.4 * pulse(t, C.ueber, 0.01, 0.12);
  finalPass.uniforms.uSeed.value = Math.floor(t * 30) * 7.31 % 101;
  bloom.strength = shot === 3 || shot === 8 ? 0.8 : 0.4;
  composer.render();
  updateUI(t, shot);
}

const EVENTS = [
  { t: 0.05, type: 'fall', dur: C.land0 - 0.05 }, { t: C.land0, type: 'land' },
  ...CUTS.map(c => ({ t: c.t, type: 'whoosh' })),
  ...CHIPS.map(c => ({ t: c.t0, type: 'pop' })),
  ...CHIPS.filter(c => c.html(0).includes('badge ok')).map(c => ({ t: c.t0 + 0.15, type: 'ding' })),
  ...CHIPS.filter(c => c.html(0).includes('badge no')).map(c => ({ t: c.t0 + 0.15, type: 'buzz' })),
  { t: C.kame, type: 'charge', dur: C.antrag - C.kame }, { t: C.antrag, type: 'fizzle' }, { t: C.antrag + 0.3, type: 'paper' }, { t: C.dreifach, type: 'stamp' },
  { t: C.l4 + 0.05, type: 'punches', dur: C.ruhe - C.l4 }, { t: C.ruhe - 0.2, type: 'window' },
  { t: C.l5 + 0.1, type: 'gong' }, { t: C.n20, type: 'sad' },
  ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ t: C.l6 + 0.25 + i * ((C.l7 - C.l6 - 0.9) / 7) + 0.5, type: 'clunk' })),
  { t: C.l7, type: 'beach', dur: C.l8 - C.l7 }, { t: C.liege - 0.05, type: 'whip' },
  { t: C.ueber - 0.1, type: 'powerup', dur: C.steuer - C.ueber }, { t: C.steuer + 0.15, type: 'thud' },
  { t: C.l9, type: 'tada' },
];
window.renderAt = renderAt;
window.EVENTS = EVENTS;
window.CUES = C;
await Promise.all(['900 104px Inter', '900 46px Inter', '800 26px Inter'].map(f => document.fonts.load(f)));
await document.fonts.ready;
for (const t of [0.5, C.l3 + 0.5, C.l5 + 0.5, C.l6 + 0.5, C.l7 + 0.5, C.l8 + 0.5, C.l9 + 0.5, 0]) renderAt(t);
window.ready = true;
