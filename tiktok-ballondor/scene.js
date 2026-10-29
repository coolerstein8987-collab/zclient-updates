// Ballon d'Or by country — golden balls stack up on a 3D globe. Every visual is a pure function of time t.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mesh as topoMesh } from './node_modules/topojson-client/src/index.js';

const W = 1080, H = 1920, D2R = Math.PI / 180;
const V3 = THREE.Vector3;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: k => 1 - Math.pow(1 - k, 3),
  outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
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
function ll(lat, lon, r = 1) {
  const a = lat * D2R, o = lon * D2R;
  return new V3(Math.cos(a) * Math.cos(o) * r, Math.sin(a) * r, -Math.cos(a) * Math.sin(o) * r);
}
function localFrame(lat, lon) {
  const a = lat * D2R, o = lon * D2R;
  return { U: ll(lat, lon), E: new V3(-Math.sin(o), 0, -Math.cos(o)), N: new V3(-Math.sin(a) * Math.cos(o), Math.cos(a), Math.sin(a) * Math.sin(o)) };
}
const hdr = (r, g, b) => new THREE.Color(r, g, b);

// ---------------------------------------------------------------- timeline cues
const TL = await (await fetch('timeline.json')).json();
const line = i => TL.lines[i - 1];
const cw = (i, w, n = 0) => line(i).words.filter(x => x.w === w)[n].t0;
const C = {
  aber: cw(1, 'Aber'), l2: line(2).start, england: cw(2, 'England'), sechs: cw(2, 'sechs.'),
  l3: line(3).start, pt: cw(3, 'Portugal,'), nl: cw(3, 'Niederlande'), de: cw(3, 'Deutschland:'),
  l4: line(4).start, br: cw(4, 'Brasilien?'), de2: cw(4, 'Deutschland'),
  l5: line(5).start, ar: cw(5, 'Argentinien'), fr: cw(5, 'Frankreich'), einziger: cw(5, 'einziger'), messi: cw(5, 'Messi.'),
  l6: line(6).start, london: cw(6, 'London.'), l7: line(7).start, end: TL.duration,
};
const CUTS = [C.l2, C.l4, C.l5, C.l6, C.l7].map((t, i) => ({ t, dir: i % 2 ? [1, 0] : [0, 1] }));
const SHOT = t => (t < C.l2 ? 1 : t < C.l3 ? 2 : t < C.l4 ? 3 : t < C.l5 ? 4 : t < C.l6 ? 5 : t < C.l7 ? 6 : 7);

// country stacks: one golden ball per men's Ballon d'Or
const COUNTRIES = [
  { key: 'eng', dx: -80, dy: 0, name: 'ENGLAND', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', id: '826', lat: 52.6, lon: -1.6, n: 6, t0: C.england + 0.1, t1: C.sechs + 0.15 },
  { key: 'pt', dx: -60, dy: 0, name: 'PORTUGAL', flag: '🇵🇹', id: '620', lat: 39.7, lon: -8.0, n: 7, t0: C.pt, t1: C.pt + 0.8 },
  { key: 'nl', dx: 40, dy: -60, name: 'NIEDERLANDE', flag: '🇳🇱', id: '528', lat: 52.3, lon: 5.6, n: 7, t0: C.nl, t1: C.nl + 0.8 },
  { key: 'de', dx: 90, dy: 10, name: 'DEUTSCHLAND', flag: '🇩🇪', id: '276', lat: 51.0, lon: 10.4, n: 7, t0: C.de, t1: C.de + 0.8 },
  { key: 'br', name: 'BRASILIEN', flag: '🇧🇷', id: '076', lat: -10.5, lon: -51.5, n: 5, t0: C.br, t1: C.br + 0.75 },
  { key: 'ar', name: 'ARGENTINIEN', flag: '🇦🇷', id: '032', lat: -34.0, lon: -64.5, n: 8, t0: C.ar, t1: C.ar + 0.85 },
  { key: 'fr', name: 'FRANKREICH', flag: '🇫🇷', id: '250', lat: 46.6, lon: 2.4, n: 8, t0: C.fr, t1: C.fr + 0.85 },
];
const LONDON = { lat: 51.51, lon: -0.13 };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 1200);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const loader = new THREE.TextureLoader();
const IMG = 'node_modules/three-globe/example/img/';
const [dayTex, nightTex, waterTex, topoTex, skyTex] = await Promise.all(
  ['earth-blue-marble.jpg', 'earth-night.jpg', 'earth-water.png', 'earth-topology.png', 'night-sky.png'].map(f => loader.loadAsync(IMG + f)));
for (const t of [dayTex, nightTex, skyTex]) t.colorSpace = THREE.SRGBColorSpace;
for (const t of [dayTex, nightTex, waterTex, topoTex]) { t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const GLOW = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.85)'); gr.addColorStop(0.35, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
GLOW.colorSpace = THREE.NoColorSpace;
const glowSprite = (color, s, depthTest = true) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, transparent: true })); sp.scale.setScalar(s); scene.add(sp); return sp; };

// ---------------------------------------------------------------- globe
const GU = { sunDir: { value: new V3(1, 0, 0) }, hud: { value: 0.3 } };
const earthMat = new THREE.ShaderMaterial({
  uniforms: { ...GU, dayMap: { value: dayTex }, nightMap: { value: nightTex }, waterMap: { value: waterTex }, topoMap: { value: topoTex } },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D dayMap, nightMap, waterMap, topoMap; uniform vec3 sunDir; uniform float hud;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 n = normalize(vN);
      vec3 east = normalize(vec3(n.z, 0., -n.x) + vec3(1e-6)); vec3 north = cross(n, east);
      float h0 = texture2D(topoMap, vUv).r, hx = texture2D(topoMap, vUv + vec2(1. / 2048., 0.)).r, hy = texture2D(topoMap, vUv + vec2(0., 1. / 1024.)).r;
      vec3 bn = normalize(n - (east * (hx - h0) + north * (hy - h0)) * 7.);
      float water = texture2D(waterMap, vUv).r;
      vec3 day = texture2D(dayMap, vUv).rgb;
      day = mix(day * vec3(1.1, 1.02, .88), day * vec3(.5, .95, 1.5), water);
      float ndl = dot(n, sunDir);
      float dayMix = smoothstep(-.18, .2, ndl);
      vec3 col = day * (max(dot(bn, sunDir), 0.) * 1.55 + .03);
      vec3 V = normalize(cameraPosition - vW);
      float nh = max(dot(n, normalize(sunDir + V)), 0.);
      col += vec3(1., .86, .68) * (pow(nh, 120.) * .22 + pow(nh, 14.) * .03) * water * dayMix;
      vec3 lights = vec3(1., .7, .35) * smoothstep(.1, .55, dot(texture2D(nightMap, vUv).rgb, vec3(.35, .45, .2))) * 2.4;
      col = col * dayMix + lights * (1. - dayMix) + day * .012;
      float fres = pow(1. - max(dot(n, V), 0.), 2.6);
      col = mix(col, vec3(.22, .55, 1.) * (.15 + 1.3 * clamp(ndl + .3, 0., 1.)), fres * .7);
      float la = asin(clamp(n.y, -1., 1.)) * 57.29578, lo = atan(-n.z, n.x) * 57.29578;
      vec2 g = vec2(lo, la) / 10.;
      vec2 gd = abs(fract(g - .5) - .5) / max(fwidth(g), vec2(1e-4));
      col += vec3(.25, .85, 1.) * (1. - min(min(gd.x, gd.y), 1.)) * .14 * hud;
      gl_FragColor = vec4(col, 1.);
    }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), earthMat));
const atmoMat = new THREE.ShaderMaterial({
  uniforms: { sunDir: GU.sunDir },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir; varying vec3 vW;
    void main(){
      vec3 ro = cameraPosition, rd = normalize(vW - ro);
      float tca = -dot(ro, rd); vec3 cp = tca < 0. ? ro : ro + rd * tca;
      float h = max(length(cp) - 1., 0.);
      float g = exp(-h / .022) * 1.15 + exp(-h / .075) * .35;
      float l = clamp(dot(normalize(cp), sunDir) * .8 + .45, .04, 1.25);
      gl_FragColor = vec4(mix(vec3(.08, .3, 1.), vec3(.45, .8, 1.), clamp(l, 0., 1.)) * g * l, 1.);
    }`,
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.17, 128, 96), atmoMat));
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, color: hdr(0.5, 0.5, 0.58), depthWrite: false }));
scene.add(sky);
const R = mulberry(4);
{
  const n = 5000, pos = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = new V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(300); pos.set([v.x, v.y, v.z], i * 3); size[i] = 1.2 + Math.pow(R(), 6) * 4.5; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    vertexShader: 'attribute float aSize; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize; }',
    fragmentShader: 'void main(){ float d = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vec3(exp(-d * d * 3.5)) * .8, 1.); }',
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  stars.frustumCulled = false; scene.add(stars); window.__stars = stars;
}
const topo = await (await fetch('node_modules/world-atlas/countries-50m.json')).json();
function lineGeo(ml, r) {
  const pos = [];
  for (const ln of ml.coordinates) for (let i = 0; i < ln.length - 1; i++) {
    const a = ll(ln[i][1], ln[i][0], r), b = ll(ln[i + 1][1], ln[i + 1][0], r);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
scene.add(new THREE.LineSegments(lineGeo(topoMesh(topo, topo.objects.countries, (a, b) => a !== b), 1.0012),
  new THREE.LineBasicMaterial({ color: hdr(0.3, 1.0, 1.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));

// golden football texture for the balls
const ballTex = canvasTex(512, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe58a'); gr.addColorStop(0.5, '#f2b632'); gr.addColorStop(1, '#b8801a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(110,70,10,.85)'; g.lineWidth = 5;
  const hex = (cx, cy, r) => { g.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); } g.stroke(); };
  for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) hex(x * 60 + (y % 2) * 30, y * 52 + 26, 30);
});
const goldMat = new THREE.MeshStandardMaterial({ map: ballTex, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.1, emissive: hdr(0.08, 0.05, 0.01) });
const BALL_R = 0.019;
const ballGeo = new THREE.SphereGeometry(1, 32, 20);
const stacks = COUNTRIES.map(c => {
  const dir = ll(c.lat, c.lon);
  const balls = Array.from({ length: c.n }, () => { const m = new THREE.Mesh(ballGeo, goldMat); scene.add(m); return m; });
  const border = new THREE.LineSegments(lineGeo(topoMesh(topo, topo.objects.countries, (a, b) => a.id === c.id || b.id === c.id), 1.002),
    new THREE.LineBasicMaterial({ color: hdr(3, 2.0, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(border);
  const base = glowSprite(hdr(2.5, 1.7, 0.4), 0.06);
  return { ...c, dir, balls, border, base };
});
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404860, 0.6));

// hero ball for the hook
const hero = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), goldMat);
scene.add(hero);
const heroGlow = glowSprite(hdr(2.2, 1.5, 0.4), 1);
// London pin
const london = ll(LONDON.lat, LONDON.lon);
const pinGroup = new THREE.Group();
pinGroup.position.copy(london.clone().multiplyScalar(1.001));
pinGroup.quaternion.setFromUnitVectors(new V3(0, 0, 1), london);
scene.add(pinGroup);
const ringGeo = new THREE.RingGeometry(0.82, 1, 96);
const pinRings = [0, 1, 2].map(() => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: hdr(3, 0.6, 1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); pinGroup.add(m); return m; });
const pinGlow = glowSprite(hdr(3, 0.7, 1.1), 0.03, false);

// ---------------------------------------------------------------- post
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Number(new URLSearchParams(location.search).get('msaa') ?? 4) });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.55, 0.45, 1.35);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uCA: { value: 0 }, uFlash: { value: 0 }, uBlur: { value: new THREE.Vector2() }, uSeed: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uCA, uFlash, uSeed; uniform vec2 uBlur, uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 samp(vec2 uv){ vec2 c = uv - .5; float k = uCA * (.0025 + dot(c, c) * .02);
      return vec3(texture2D(tDiffuse, uv + c * k * 1.6).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * k * 1.6).b); }
    void main(){
      vec3 col = vec3(0.);
      if (length(uBlur) > .0005) { for (int i = 0; i < 18; i++) { float k = float(i) / 17. - .5; col += samp(vUv + uBlur * k); } col /= 18.; } else col = samp(vUv);
      vec2 c = (vUv - .5) * vec2(1., 1.25);
      col *= mix(1., smoothstep(.98, .28, length(c)), .8);
      col += (hash(vUv * uRes + uSeed * 91.7) - .5) * .035;
      col = mix(col, vec3(1.), clamp(uFlash, 0., 1.));
      gl_FragColor = vec4(col, 1.);
    }`,
});
composer.addPass(finalPass);

// ---------------------------------------------------------------- camera rig (as in part 1)
const base = { alt: 0, el: 90, az: 0, fov: 50, sy: 0, roll: 0, near: 0.02 };
const track = (t, keys) => {
  if (t <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, a] = keys[i], [tb, b] = keys[i + 1];
    if (t <= tb) { const k = E.inOut(seg(t, ta, tb)); const o = {}; for (const key in a) o[key] = lerp(a[key], b[key] ?? a[key], k); return o; }
  }
  return { ...keys[keys.length - 1][1] };
};
function rigAt(t) {
  if (t < C.l2) { const k = E.outExpo(seg(t, 0, 1.6)), k2 = E.out(seg(t, 0, C.l2)); return { ...base, lat: lerp(5, 30, k2), lon: lerp(-80, -15, k2), dist: lerp(10, 3.9, k), roll: lerp(-20, -2, k) }; }
  if (t < C.l4) return { ...base, ...track(t, [[C.l2, { lat: 50.5, lon: 1.0, alt: 1, dist: 1.25, el: 58, az: 0 }], [C.l3, { lat: 49.5, lon: 2.0, alt: 1, dist: 1.4, el: 55, az: 4 }], [C.l4, { lat: 47.5, lon: 2.5, alt: 1, dist: 1.6, el: 52, az: 10 }]]) };
  if (t < C.l5) return { ...base, ...track(t, [[C.l4, { lat: -16, lon: -55, alt: 1, dist: 1.7, el: 60, az: -8 }], [C.l5, { lat: -18, lon: -57, alt: 1, dist: 1.55, el: 56, az: 4 }]]) };
  if (t < C.l6) return { ...base, ...track(t, [[C.l5, { lat: 8, lon: -32, alt: 0, dist: 5.4, el: 90, az: 0, sy: -0.06 }], [C.l6, { lat: 9, lon: -28, alt: 0, dist: 5.1, el: 90, az: 0, sy: -0.06 }]]) };
  if (t < C.l7) return { ...base, ...track(t, [[C.l6, { lat: 49.5, lon: -0.5, alt: 1, dist: 0.9, el: 52, az: 0 }], [C.l7, { lat: 50.3, lon: -0.2, alt: 1, dist: 0.7, el: 48, az: 6 }]]) };
  const k = seg(t, C.l7, C.end);
  return { ...base, lat: lerp(14, 8, k), lon: lerp(-40, -22, k), dist: lerp(5.4, 5.0, E.out(k)), sy: 0.05 };
}
const camRight = new V3(), camUp = new V3(), camBack = new V3();
function applyRig(r, t) {
  const f = localFrame(r.lat, r.lon);
  const T = f.U.clone().multiplyScalar(r.alt);
  const az = r.az * D2R, el = r.el * D2R;
  const Hh = f.N.clone().multiplyScalar(Math.cos(az)).addScaledVector(f.E, Math.sin(az));
  camera.position.copy(T).addScaledVector(f.U, r.dist * Math.sin(el)).addScaledVector(Hh, -r.dist * Math.cos(el));
  camera.up.copy(f.U).multiplyScalar(Math.cos(el)).addScaledVector(Hh, Math.sin(el));
  camera.lookAt(T);
  camera.rotateZ(r.roll * D2R);
  let punch = 0;
  for (const c of CUTS) if (t >= c.t) punch = Math.max(punch, 0.09 * Math.exp(-(t - c.t) / 0.15));
  camera.fov = r.fov * (1 + punch); camera.near = r.near;
  camera.setViewOffset(W, H, 0, r.sy * H, W, H);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = $('ui'), headEl = $('head'), capEl = $('cap'), chipsEl = $('chips'), labelsEl = $('labels'), liveEl = $('live');
const emo = s => s.replace(/(\p{Extended_Pictographic}[️\u{E0020}-\u{E007F}]*|[\u{1F1E6}-\u{1F1FF}]{2})/gu, '<span style="-webkit-text-fill-color:initial">$1</span>');
const count = (c, t) => { let n = 0; for (let i = 0; i < c.n; i++) if (t >= c.t0 + (c.t1 - c.t0) * i / Math.max(1, c.n - 1)) n++; return n; };
const S = k => stacks.find(s => s.key === k);
const HEADS = [
  { t0: 0, t1: C.aber, html: () => `<div class="h2">${emo('🏆')} HARRY KANE GEWINNT</div><div class="h1"><span class="big">BALLON D'OR</span></div>` },
  { t0: C.aber, t1: C.l2, html: () => '<div class="h1">WELCHES LAND<br>HAT DIE MEISTEN?</div>' },
  { t0: C.l2, t1: C.l3, html: t => `<div class="h1"><span class="big">${emo('🏴󠁧󠁢󠁥󠁮󠁧󠁿')} ${count(S('eng'), t)}</span></div><div class="h2">ENGLAND</div>` },
  { t0: C.l3, t1: C.l4, html: () => '<div class="h1"><span class="big">JE 7</span></div><div class="h2">PORTUGAL · NIEDERLANDE · DEUTSCHLAND</div>' },
  { t0: C.l4, t1: C.l5, html: t => `<div class="h1"><span class="big">${emo('🇧🇷')} ${count(S('br'), t)}</span></div><div class="h2${t > C.de2 - 0.05 ? ' red' : ''}">${t > C.de2 - 0.05 ? 'DEUTSCHLAND 7 &gt; BRASILIEN 5' : 'BRASILIEN'}</div>` },
  { t0: C.l5, t1: C.l6, html: t => `<div class="h1"><span class="big">PLATZ 1: JE 8</span></div><div class="h2">${t > C.einziger - 0.05 ? 'ALLE 8 VON LIONEL MESSI' : 'ARGENTINIEN · FRANKREICH'}</div>` },
  { t0: C.l6, t1: C.l7, html: () => '<div class="h1"><span class="big">LONDON</span></div><div class="h2">ERSTMALS NICHT IN FRANKREICH</div>' },
  { t0: C.l7, t1: C.end + 1, html: () => `<div class="h1">WER HOLT<br>DEN NÄCHSTEN?</div><div class="h2">SCHREIB'S IN DIE KOMMENTARE ${emo('👇')}</div>` },
];
const CHUNKS = [];
for (const L of TL.lines) {
  let cur = [];
  const flush = () => { if (cur.length) CHUNKS.push({ line: L.id, words: cur }); cur = []; };
  L.words.forEach((w, i) => {
    cur.push(w);
    const nx = L.words[i + 1];
    if (/[.?!,:]$/.test(w.w) || cur.length >= 3 || (nx && cur.map(x => x.w).join(' ').length + nx.w.length + 1 > (L.id === 1 ? 14 : 17))) flush();
  });
  flush();
}
CHUNKS.forEach((c, i) => {
  const nx = CHUNKS[i + 1], L = line(c.line);
  c.t0 = c.words[0].t0 - 0.05;
  c.t1 = nx ? (nx.line === c.line ? nx.words[0].t0 - 0.05 : Math.min(nx.words[0].t0 - 0.05, L.end + 0.3)) : L.end + 0.3;
});
const labelEls = {};
function label(key, html, cls, x, y, k) {
  let el = labelEls[key];
  if (!el) { el = labelEls[key] = document.createElement('div'); labelsEl.appendChild(el); }
  if (k <= 0.001) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.className = 'lbl ' + (cls || '');
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.opacity = clamp(k * 1.5);
  el.style.transform = `translate(-50%, -100%) scale(${0.6 + 0.4 * E.outBack(clamp(k))})`;
}
const toScreen = v => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }; };
const facing = v => v.clone().normalize().dot(camera.position.clone().sub(v)) > 0;
let lastHead = '', lastCap = '';
function updateUI(t, shot) {
  const hi = HEADS.findIndex(h => t >= h.t0 && t < h.t1);
  if (hi < 0) headEl.style.opacity = 0;
  else {
    const h = HEADS[hi], html = h.html(t);
    if (html !== lastHead) { headEl.innerHTML = html; lastHead = html; }
    const k = h.t0 === 0 ? 0.82 + 0.18 * E.outExpo(seg(t, 0, 0.25)) : E.outExpo(seg(t, h.t0, h.t0 + 0.3)), out = seg(t, h.t1 - 0.08, h.t1);
    headEl.style.opacity = clamp(k * 1.4) * (1 - out);
    headEl.style.transform = `scale(${lerp(1.35, 1, k)}) translateY(${out * -30}px)`;
    headEl.style.filter = `blur(${(1 - k) * 14}px) drop-shadow(0 0 26px ${html.includes('red') ? 'rgba(255,46,99,.55)' : 'rgba(255,200,60,.5)'}) drop-shadow(0 8px 10px rgba(0,0,0,.6))`;
  }
  const ch = CHUNKS.find(c => t >= c.t0 && t < c.t1);
  if (!ch) { capEl.innerHTML = ''; lastCap = ''; }
  else {
    capEl.className = ch.line === 1 ? 'hero' : '';
    const html = ch.words.map((w, i) => {
      const nx = ch.words[i + 1];
      const on = t >= w.t0 - 0.03 && (nx ? t < nx.t0 - 0.03 : true);
      const s = on ? 1 + (w.em ? 0.08 : 0.05) * E.outBack(seg(t, w.t0 - 0.03, w.t0 + 0.1)) : 1;
      return `<span class="cw${on ? ' on' : ''}${w.em ? ' em' : ''}" style="transform:scale(${s.toFixed(3)})">${w.w.replace(/[.,:]$/, '')}</span>`;
    }).join(' ');
    if (html !== lastCap) { capEl.innerHTML = html; lastCap = html; }
    capEl.style.transform = `scale(${lerp(0.75, 1, E.outBack(seg(t, ch.t0, ch.t0 + 0.16))).toFixed(3)})`;
    capEl.style.opacity = clamp(seg(t, ch.t0, ch.t0 + 0.06));
  }
  // final ranking table
  const rk = seg(t, C.l7 + 0.1, C.l7 + 0.5);
  if (shot === 7) {
    const rows = [...stacks].sort((a, b) => b.n - a.n).map((s, i) => `<div class="row" style="opacity:${clamp(seg(t, C.l7 + 0.1 + i * 0.08, C.l7 + 0.3 + i * 0.08) * 1.5).toFixed(2)};transform:translateX(${((1 - E.out(seg(t, C.l7 + 0.1 + i * 0.08, C.l7 + 0.4 + i * 0.08))) * -80).toFixed(0)}px)"><b>${i < 2 ? '1' : i < 5 ? '3' : i + 1}.</b> ${emo(s.flag)} ${s.name}<span>${'●'.repeat(s.n)} ${s.n}</span></div>`).join('');
    const html = `<div class="table">${rows}</div>`;
    if (chipsEl.dataset.html !== html) { chipsEl.innerHTML = html; chipsEl.dataset.html = html; }
    chipsEl.style.opacity = rk;
  } else { chipsEl.innerHTML = ''; chipsEl.dataset.html = ''; }
  liveEl.innerHTML = '<i></i>26.10.2026 · LONDON';
  liveEl.style.opacity = 0.65 + 0.35 * Math.sin(t * 6) ** 2;
  // count labels on top of each stack
  for (const s of stacks) {
    const n = count(s, t);
    const top = s.dir.clone().multiplyScalar(1 + BALL_R * (2 * n + 1.2));
    const p = toScreen(top);
    const show = n > 0 && facing(s.dir) && p.z < 1 && (shot === 2 || shot === 3 || shot === 4 || (shot === 5 && s.n === 8));
    const small = shot === 5;
    label(s.key, `${emo(s.flag)} ${n}${small ? '' : `<small>${s.name}</small>`}`, n === 8 ? 'gold' : '', p.x + (small ? 0 : s.dx || 0), p.y - 10 + (small ? 0 : s.dy || 0), show ? seg(t, s.t0, s.t0 + 0.2) : 0);
  }
  const lp = toScreen(london.clone().multiplyScalar(1.01));
  label('london', `${emo('📍')} LONDON PALLADIUM<small>26.10.2026</small>`, 'red', lp.x, lp.y - 40, shot === 6 ? seg(t, C.l6 + 0.3, C.l6 + 0.6) : 0);
  let wb = 0, wd = [0, 1];
  for (const c of CUTS) { const d = t - c.t; const v = d < 0 ? Math.exp(-((d / 0.06) ** 2)) : Math.exp(-((d / 0.1) ** 2)); if (v > wb) { wb = v; wd = c.dir; } }
  ui.style.transform = `translate(${(wd[0] * wb * 40).toFixed(1)}px, ${(wd[1] * wb * 40).toFixed(1)}px)`;
  ui.style.filter = wb > 0.05 ? `blur(${(wb * 6).toFixed(1)}px)` : 'none';
}

// ---------------------------------------------------------------- per frame
function renderAt(t) {
  const shot = SHOT(t);
  applyRig(rigAt(t), t);
  camera.updateMatrixWorld();
  camera.matrixWorld.extractBasis(camRight, camUp, camBack);
  const sunDir = camRight.clone().multiplyScalar(-0.5).addScaledVector(camUp, 0.45).addScaledVector(camBack, 0.75).normalize();
  GU.sunDir.value.copy(sunDir);
  sun.position.copy(sunDir);
  sky.position.copy(camera.position); window.__stars.position.copy(camera.position);
  GU.hud.value = shot === 1 ? 0.2 : 0.45;
  // stacks
  for (const s of stacks) {
    s.balls.forEach((b, i) => {
      const ti = s.t0 + (s.t1 - s.t0) * i / Math.max(1, s.n - 1);
      const k = seg(t, ti, ti + 0.22);
      b.visible = k > 0;
      const drop = (1 - E.out(k)) * 0.12;
      b.position.copy(s.dir).multiplyScalar(1 + BALL_R * (2 * i + 1) + drop);
      b.scale.setScalar(BALL_R * E.outBack(k));
      b.quaternion.setFromAxisAngle(s.dir, t * 0.8 + i);
    });
    const done = count(s, t);
    s.border.material.opacity = done > 0 ? 0.55 + 0.35 * pulse(t, s.t1, 0.05, 0.5) : 0;
    s.base.visible = done > 0;
    s.base.position.copy(s.dir).multiplyScalar(1.004);
    s.base.scale.setScalar(0.045 + 0.06 * pulse(t, s.t0, 0.05, 0.4) + (s.n === 8 && done === 8 ? 0.04 * Math.sin(t * 6) ** 2 : 0));
  }
  // hero ball in the hook: big spinning golden ball in front of the globe, then it shrinks away
  const hk = seg(t, C.aber - 0.3, C.l2 - 0.05);
  hero.visible = heroGlow.visible = shot === 1 && hk < 1;
  if (hero.visible) {
    const p = camera.position.clone().addScaledVector(camBack, -2.2).addScaledVector(camUp, 0.05);
    const s = 0.2 * (1 - E.inOut(hk)) * E.outBack(seg(t, 0.05, 0.45));
    hero.position.copy(p).lerp(new V3(0, 0, 0), E.inOut(hk) * 0.6);
    hero.scale.setScalar(Math.max(s, 0.0001)); hero.rotation.set(0.3, t * 1.6, 0.1);
    heroGlow.position.copy(hero.position); heroGlow.scale.setScalar(s * 2.4); heroGlow.material.opacity = 0.35;
  }
  // London pin
  pinGroup.visible = pinGlow.visible = shot === 6;
  if (shot === 6) {
    pinRings.forEach((m, i) => { const ph = (((t - C.l6) * 0.9 + i / 3) % 1 + 1) % 1; m.scale.setScalar(0.003 + ph * 0.03); m.material.opacity = Math.pow(1 - ph, 2); });
    pinGlow.position.copy(london.clone().multiplyScalar(1.002)); pinGlow.scale.setScalar(0.02 * (1 + pulse(t, C.l6 + 0.25, 0.05, 0.3)));
  }
  let wb = 0, wd = [0, 1], ca = 0.2;
  for (const c of CUTS) { const d = t - c.t; const v = d < 0 ? Math.exp(-((d / 0.06) ** 2)) : Math.exp(-((d / 0.1) ** 2)); if (v > wb) { wb = v; wd = c.dir; } ca += 1.4 * pulse(t, c.t, 0.01, 0.15); }
  const fu = finalPass.uniforms;
  fu.uBlur.value.set(wd[0] * wb * 0.06, wd[1] * wb * 0.09);
  fu.uCA.value = ca;
  fu.uFlash.value = 0.25 * Math.exp(-t / 0.08) + 0.25 * pulse(t, C.ar + 0.85, 0.02, 0.12) + 0.2 * pulse(t, C.fr + 0.85, 0.02, 0.12);
  fu.uSeed.value = Math.floor(t * 30) * 0.731 % 17;
  composer.render();
  updateUI(t, shot);
}

const EVENTS = [
  { t: 0, type: 'hit' },
  ...CUTS.map(c => ({ t: c.t, type: 'whoosh' })),
  ...COUNTRIES.flatMap(c => Array.from({ length: c.n }, (_, i) => ({ t: c.t0 + (c.t1 - c.t0) * i / Math.max(1, c.n - 1), type: 'ball', i, n: c.n }))),
  ...COUNTRIES.map(c => ({ t: c.t1 + 0.05, type: c.n === 8 ? 'crowd' : 'blip' })),
  { t: 0.05, type: 'crowd' },
  { t: C.de2, type: 'pop' }, { t: C.einziger, type: 'pop' },
  { t: C.l6 + 0.25, type: 'ping' },
  { t: C.l7, type: 'pop' },
];
window.renderAt = renderAt;
window.EVENTS = EVENTS;
window.CUES = C;
await Promise.all(['138px Anton', '900 82px Inter', '800 30px Inter', '700 26px "DejaVu Sans Mono"'].map(f => document.fonts.load(f)));
await document.fonts.ready;
for (const t of [C.l3 + 1, C.l5 + 1, C.l6 + 0.5, 0.5, 0]) renderAt(t);
window.ready = true;
