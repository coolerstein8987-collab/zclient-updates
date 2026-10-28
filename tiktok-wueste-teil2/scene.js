// Teil 2 — ausgesetzt in der Wüste Ägyptens. Every visual is a pure function of time t (renderAt).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
  so: cw(1, 'So'), l2: line(2).start, es: cw(2, 'Es'), n50: cw(2, '50'), also: cw(2, 'Also'), laufen: cw(2, 'laufen'),
  l3: line(3).start, kleidung: cw(3, 'Kleidung'), sie: cw(3, 'Sie'),
  l4: line(4).start, horn: cw(4, 'Hornvipern'), death: cw(4, 'Deathstalker,'), gift: cw(4, 'giftigsten'),
  l5: line(5).start, ruhig: cw(5, 'Ruhig'), nicht1: cw(5, 'Nicht'), nicht2: cw(5, 'nicht'), hilfe: cw(5, 'Hilfe'),
  l6: line(6).start, wasser: cw(6, 'Wasser'), essen: cw(6, 'Essen?'),
  l7: line(7).start, gewinner: cw(7, 'Gewinner'), end: TL.duration,
};
C.drop = 0.55;
const CUTS = [
  { t: C.so, dir: [0, 1], flash: 0.5 }, { t: C.l2, dir: [1, 0] }, { t: C.laufen, dir: [0, 1] }, { t: C.l3, dir: [1, 0] },
  { t: C.l4, dir: [0, 1], glitch: 0.8 }, { t: C.death, dir: [1, 0], glitch: 0.6 }, { t: C.l5, dir: [0, 1], glitch: 1, flash: 0.35 },
  { t: C.l6, dir: [1, 0], flash: 0.4 },
];
const SHOT = t => (t < C.so ? 1 : t < C.l2 ? 2 : t < C.laufen ? 3 : t < C.l3 ? 4 : t < C.l4 ? 5 : t < C.death ? 6 : t < C.l5 ? 7 : t < C.l6 ? 8 : 9);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 3000);
const globeScene = new THREE.Scene();
const desert = new THREE.Scene();

const loader = new THREE.TextureLoader();
const IMG = 'node_modules/three-globe/example/img/';
const [dayTex, nightTex, waterTex, topoTex, skyTex] = await Promise.all(
  ['earth-blue-marble.jpg', 'earth-night.jpg', 'earth-water.png', 'earth-topology.png', 'night-sky.png'].map(f => loader.loadAsync(IMG + f)));
for (const t of [dayTex, nightTex, skyTex]) t.colorSpace = THREE.SRGBColorSpace;
for (const t of [dayTex, nightTex, waterTex, topoTex]) { t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; }

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.85)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
function glowSprite(scene, color, scale = 0.05, depthTest = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, transparent: true }));
  s.scale.setScalar(scale);
  scene.add(s);
  return s;
}

// ---------------------------------------------------------------- shot 1: globe dive to Egypt
const EGYPT = { lat: 26.3, lon: 28.6 };
const egypt = ll(EGYPT.lat, EGYPT.lon);
const GU = { sunDir: { value: new V3(1, 0, 0) }, hud: { value: 0 } };
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
      day = mix(day * vec3(1.12, 1.0, .86), day * vec3(.5, .95, 1.5), water);
      float ndl = dot(n, sunDir);
      float dayMix = smoothstep(-.18, .2, ndl);
      vec3 col = day * (max(dot(bn, sunDir), 0.) * 1.55 + .02);
      vec3 V = normalize(cameraPosition - vW);
      float nh = max(dot(n, normalize(sunDir + V)), 0.);
      col += vec3(1., .86, .68) * (pow(nh, 90.) * .55 + pow(nh, 12.) * .05) * water * dayMix;
      vec3 night = texture2D(nightMap, vUv).rgb;
      vec3 lights = vec3(1., .7, .35) * smoothstep(.1, .55, dot(night, vec3(.35, .45, .2))) * 2.4;
      col = col * dayMix + lights * (1. - dayMix) + day * .012;
      float fres = pow(1. - max(dot(n, V), 0.), 2.6);
      col = mix(col, vec3(.22, .55, 1.) * (.15 + 1.3 * clamp(ndl + .3, 0., 1.)), fres * .7);
      float la = asin(clamp(n.y, -1., 1.)) * 57.29578, lo = atan(-n.z, n.x) * 57.29578;
      vec2 g = vec2(lo, la) / 10.;
      vec2 gd = abs(fract(g - .5) - .5) / max(fwidth(g), vec2(1e-4));
      col += vec3(.25, .85, 1.) * (1. - min(min(gd.x, gd.y), 1.)) * .2 * hud;
      gl_FragColor = vec4(col, 1.);
    }`,
});
globeScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), earthMat));
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
globeScene.add(new THREE.Mesh(new THREE.SphereGeometry(1.17, 128, 96), atmoMat));
const topo = await (await fetch('node_modules/world-atlas/countries-50m.json')).json();
function lineGeo(ml, r) {
  const pos = [];
  for (const ln of ml.coordinates) for (let i = 0; i < ln.length - 1; i++) {
    const a = ll(ln[i][1], ln[i][0], r), b = ll(ln[i + 1][1], ln[i + 1][0], r);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
const borderMat = new THREE.LineBasicMaterial({ color: hdr(0.3, 1.1, 1.5), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
globeScene.add(new THREE.LineSegments(lineGeo(topoMesh(topo, topo.objects.countries, (a, b) => a !== b), 1.0015), borderMat));
const egyptMat = new THREE.LineBasicMaterial({ color: hdr(4, 0.8, 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
globeScene.add(new THREE.LineSegments(lineGeo(topoMesh(topo, topo.objects.countries, (a, b) => a.id === '818' || b.id === '818'), 1.002), egyptMat));
globeScene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, color: hdr(0.5, 0.5, 0.58), depthWrite: false })));
const ringGeo = new THREE.RingGeometry(0.82, 1, 96);
const marker = new THREE.Group();
marker.position.copy(egypt.clone().multiplyScalar(1.001));
marker.quaternion.setFromUnitVectors(new V3(0, 0, 1), egypt);
globeScene.add(marker);
const mkRing = c => new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
const pulses = [0, 1, 2].map(() => { const m = mkRing(hdr(3, 1.4, 0.4)); marker.add(m); return m; });
const dropRing = mkRing(hdr(3, 2.2, 1.2)); marker.add(dropRing);
const egyptGlow = glowSprite(globeScene, hdr(3, 1.5, 0.5), 0.05);

// ---------------------------------------------------------------- desert world
function vhash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = vhash(xi, yi), b = vhash(xi + 1, yi), c = vhash(xi, yi + 1), d = vhash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
const fbm2 = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.03, y * 2.03) * 0.25 + vnoise(x * 4.1, y * 4.1) * 0.125 + vnoise(x * 8.3, y * 8.3) * 0.0625;
function duneH(x, z) {
  const w = fbm2(x * 0.012, z * 0.012);
  const r1 = 1 - Math.abs(Math.sin(x * 0.042 + z * 0.011 + w * 4));
  const r2 = 1 - Math.abs(Math.sin(x * 0.018 - z * 0.027 + w * 3 + 1.3));
  return Math.pow(r1, 2.4) * 5 + Math.pow(r2, 2.0) * 8 + fbm2(x * 0.004, z * 0.004) * 22 + fbm2(x * 0.2, z * 0.2) * 0.15;
}
const DU = {
  sunDir: { value: new V3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) }, skyCol: { value: new THREE.Color(0.3, 0.45, 0.7) },
  fogCol: { value: new THREE.Color(0.9, 0.8, 0.7) }, uNight: { value: 0 }, uDawn: { value: 0 }, uTime: { value: 0 },
};
const sandVS = /* glsl */ `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const sandFS = /* glsl */ `
  uniform vec3 sunDir, sunCol, skyCol, fogCol; uniform float uNight, uTime;
  varying vec3 vW; varying vec3 vN;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec3 n = normalize(vN);
    float d = distance(cameraPosition, vW);
    float near = smoothstep(60., 2., d);
    float rp = vW.x * 9. + vW.z * 3.5 + vn(vW.xz * .6) * 6.;
    n = normalize(n + vec3(cos(rp) * .16, 0., sin(rp) * .07) * near);
    vec3 base = vec3(.80, .47, .22) * (.86 + .26 * vn(vW.xz * .35)) * (.93 + .12 * vn(vW.xz * 9.));
    float ndl = dot(n, sunDir);
    vec3 col = base * (sunCol * max(ndl, 0.) * 1.35 + skyCol * (.22 + .14 * n.y) + vec3(.2, .09, .04) * max(-ndl, 0.) * .25);
    vec3 V = normalize(cameraPosition - vW);
    float sp = step(.985, h21(floor(vW.xz * 60.))) * pow(max(dot(reflect(-sunDir, n), V), 0.), 20.) * near * (1. - uNight);
    col += sunCol * sp * 3.;
    float f = 1. - exp(-d * .0024);
    float glow = pow(max(dot(-V, sunDir), 0.), 6.) * (1. - uNight);
    col = mix(col, fogCol + sunCol * glow * .25, clamp(f, 0., 1.));
    gl_FragColor = vec4(col, 1.);
  }`;
const sandMat = new THREE.ShaderMaterial({ uniforms: DU, vertexShader: sandVS, fragmentShader: sandFS });
function terrain(size, segs, cx, cz, lift = 0) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, duneH(x, z) + lift, z); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, sandMat);
  desert.add(m);
  return m;
}
terrain(700, 420, 0, 0);
const PATCH = { x: 24, z: -30 };
terrain(8, 200, PATCH.x, PATCH.z, 0.012);

const skyMat = new THREE.ShaderMaterial({
  uniforms: DU,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir; uniform float uNight, uDawn; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 zen = mix(mix(vec3(.025, .12, .45), vec3(.10, .10, .32), uDawn), vec3(.004, .008, .03), uNight);
      vec3 hor = mix(mix(vec3(.62, .58, .55), vec3(1.3, .45, .16), uDawn), vec3(.02, .035, .09), uNight);
      vec3 col = mix(hor, zen, pow(clamp(h, 0., 1.), .38));
      col = mix(col, hor * .5, clamp(-h * 5., 0., 1.));
      float sd = max(dot(d, sunDir), 0.);
      col += vec3(1., .78, .5) * (pow(sd, 1400.) * 60. + pow(sd, 90.) * .9 + pow(sd, 7.) * .16) * (1. - uNight);
      gl_FragColor = vec4(col, 1.);
    }`,
  side: THREE.BackSide, depthWrite: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), skyMat);
desert.add(sky);

const pointsVS = /* glsl */ `
  attribute float aSize; attribute float aAlpha; uniform float uScale, uAtten; varying float vA;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * mix(1., uScale / -mv.z, uAtten); vA = aAlpha; }`;
const pointsFS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity, uTime, uTwinkle; varying float vA;
  void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = exp(-d * d * 3.5) * (1. - smoothstep(.75, 1., d));
    float tw = 1. - uTwinkle * (.5 + .5 * sin(uTime * 3. + vA * 90.)); gl_FragColor = vec4(uColor * a * vA * uOpacity * tw, 1.); }`;
function pointCloud(scene, n, fill, opts = {}) {
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = fill(i); pos.set([p.pos.x, p.pos.y, p.pos.z], i * 3); size[i] = p.size; alpha[i] = p.alpha ?? 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1000 }, uAtten: { value: opts.atten ?? 0 }, uColor: { value: opts.color ?? hdr(1, 1, 1) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uTwinkle: { value: opts.twinkle ?? 0 } },
    vertexShader: pointsVS, fragmentShader: pointsFS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const R = mulberry(5);
const starFill = () => { const v = new V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(300); return { pos: v, size: 1.2 + Math.pow(R(), 6) * 4.5, alpha: 0.35 + 0.65 * R() }; };
const globeStars = pointCloud(globeScene, 5000, starFill, { twinkle: 0.3 });
const nightStars = pointCloud(desert, 5000, () => { const s = starFill(); s.pos.y = Math.abs(s.pos.y) + 8; return s; }, { twinkle: 0.4 });
const moon = glowSprite(desert, hdr(2.2, 2.4, 3), 60, true);
const moonCore = glowSprite(desert, hdr(6, 6, 6.5), 14, true);
const sandDrift = pointCloud(desert, 700, () => ({ pos: new V3(), size: 0.012 + R() * 0.03, alpha: 0.25 + R() * 0.45 }), { atten: 1, color: hdr(1.3, 1.0, 0.7) });
const driftSeed = Array.from({ length: 700 }, () => [R(), R(), R(), R()]);

const sun = new THREE.DirectionalLight(0xffffff, 3);
desert.add(sun);
const hemi = new THREE.HemisphereLight(0x8fb6ff, 0xc9874a, 0.9);
desert.add(hemi);

// the stranded person
const fig = new THREE.Group();
const figParts = {};
{
  const cloth = new THREE.MeshStandardMaterial({ color: 0xece2cf, roughness: 0.92 });
  const pants = new THREE.MeshStandardMaterial({ color: 0xb79a74, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5b3d, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 });
  const add = (geo, mat, x, y, z, parent = fig) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.17, 0.5, 6, 14), cloth, 0, 1.2, 0);
  add(new THREE.SphereGeometry(0.115, 20, 16), skin, 0, 1.66, 0.01);
  const scarf = add(new THREE.SphereGeometry(0.13, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, 0, 1.67, -0.01);
  scarf.rotation.x = -0.25;
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16), cloth, 0, 1.53, 0);
  add(new THREE.BoxGeometry(0.3, 0.4, 0.15), dark, 0, 1.25, -0.19);
  figParts.legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.09, 0.95, 0); fig.add(p); add(new THREE.CapsuleGeometry(0.075, 0.72, 4, 10), pants, 0, -0.45, 0, p); add(new THREE.BoxGeometry(0.11, 0.07, 0.24), dark, 0, -0.9, 0.04, p); return p; });
  figParts.arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.23, 1.44, 0); fig.add(p); add(new THREE.CapsuleGeometry(0.055, 0.52, 4, 10), cloth, 0, -0.3, 0, p); return p; });
}
desert.add(fig);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
desert.add(blob);
function placeFig(x, z, heading, walk) {
  fig.position.set(x, duneH(x, z), z);
  fig.rotation.y = heading;
  figParts.legs.forEach((l, i) => { l.rotation.x = Math.sin(walk + i * Math.PI) * 0.5; });
  figParts.arms.forEach((a, i) => { a.rotation.x = -Math.sin(walk + i * Math.PI) * 0.4; a.rotation.z = (i ? -1 : 1) * 0.06; });
  blob.position.set(x, duneH(x, z) + 0.02, z);
}
// a crest near the origin for the hero shots
const CREST = (() => { let best = [0, 0, -1e9]; for (let x = -30; x <= 30; x += 1.5) for (let z = -30; z <= 30; z += 1.5) { const h = duneH(x, z); if (h > best[2]) best = [x, z, h]; } return { x: best[0], z: best[1] }; })();

// Hornviper: tapered tube re-built every frame so it can slither
function snakeTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const g = c.getContext('2d'), r = mulberry(9);
  g.fillStyle = '#b98f5e'; g.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,60,30' : '235,210,170'},${0.15 * r()})`; g.fillRect(r() * 1024, r() * 64, 3, 2); }
  for (let x = 30; x < 1000; x += 46) { g.fillStyle = 'rgba(58,36,18,.92)'; g.beginPath(); g.ellipse(x, 24, 12, 9, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + 20, 46, 8, 6, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
const snakeMat = new THREE.MeshStandardMaterial({ map: snakeTexture(), roughness: 0.55, metalness: 0.05 });
const snake = new THREE.Mesh(new THREE.BufferGeometry(), snakeMat);
desert.add(snake);
const snakeHead = new THREE.Group();
{
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0xb48c5e, roughness: 0.5 })); head.scale.set(1.12, 0.6, 1.5); snakeHead.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.6 })); mask.scale.set(1.15, 0.27, 0.5); mask.position.set(0, 0.12, -0.2); snakeHead.add(mask);
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xa47b4f, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120a04, roughness: 0.15, metalness: 0.3 });
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.95, 10), hornMat); horn.position.set(s * 0.55, 0.75, 0.55); horn.rotation.set(-0.35, 0, -s * 0.25); snakeHead.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), eyeMat); eye.position.set(s * 0.82, 0.25, 0.6); snakeHead.add(eye);
  }
}
desert.add(snakeHead);
const SN = { R: 0.03, L: 0.66, x: PATCH.x - 0.6, z: PATCH.z + 0.4 };
function updateSnake(t, strike) {
  const pts = [], n = 60, phase = t * 2.2;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const lx = -SN.L / 2 + s * SN.L + (t - C.l4) * 0.05 - strike * 0.02;
    const lz = 0.09 * Math.sin(s * Math.PI * 3.0 - phase) * (0.2 + 0.8 * Math.sin(Math.PI * s)) * (1 - strike * 0.6) + strike * 0.12 * Math.pow(s, 4);
    const x = SN.x + lx, z = SN.z + lz;
    pts.push(new V3(x, duneH(x, z) + 0.012, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = 140, rad = 12;
  const g = new THREE.TubeGeometry(curve, segs, 1, rad, false);
  const p = g.attributes.position;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs, b0 = curve.getPointAt(s), c = b0.clone();
    const r = SN.R * (0.18 + 0.82 * Math.pow(Math.sin(Math.PI * Math.min(s, 0.97) * 0.52 + 0.05), 0.8)) * (1 - 0.18 * Math.max(0, (s - 0.9) / 0.1));
    c.y += r * 0.72;
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      const ox = p.getX(k) - b0.x, oy = p.getY(k) - b0.y, oz = p.getZ(k) - b0.z;
      p.setXYZ(k, c.x + ox * r, c.y + oy * r * 0.72, c.z + oz * r);
    }
  }
  g.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * 1.6; });
  g.computeVertexNormals();
  snake.geometry.dispose();
  snake.geometry = g;
  const hp = curve.getPointAt(1), tg = curve.getTangentAt(1);
  snakeHead.position.set(hp.x, hp.y + SN.R * 0.75, hp.z).addScaledVector(tg, SN.R * 1.1);
  snakeHead.scale.setScalar(SN.R * 0.9);
  snakeHead.lookAt(snakeHead.position.clone().add(tg));
  return hp;
}

// Deathstalker scorpion built from primitives (local units ~ metres, y = 0 is the ground)
const scorp = new THREE.Group();
const scShell = new THREE.MeshStandardMaterial({ color: 0xe0bd55, roughness: 0.3, metalness: 0.05, emissive: 0x3a2600 });
const scDark = new THREE.MeshStandardMaterial({ color: 0x4a2e10, roughness: 0.25 });
const UPY = new V3(0, 1, 0);
function limb(parent, a, b, r0, r1, mat = scShell) {
  const d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UPY, d.normalize());
  parent.add(m);
  const j = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.15, 8, 6), mat); j.position.copy(a); parent.add(j);
  return m;
}
const ell = (parent, sx, sy, sz, x, y, z, mat = scShell) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m; };
const scBody = new THREE.Group(); scorp.add(scBody);
ell(scBody, 0.016, 0.008, 0.017, 0, 0.017, 0.034);
for (let i = 0; i < 7; i++) ell(scBody, 0.017 - i * 0.0009, 0.0075, 0.0068, 0, 0.0165, 0.016 - i * 0.0095);
const scLegs = new THREE.Group(); scorp.add(scLegs);
const scClaws = new THREE.Group(); scorp.add(scClaws);
const scTail = new THREE.Group(); scorp.add(scTail);
function buildScorpLimbs(t, strike) {
  for (const g of [scLegs, scClaws, scTail]) { g.children.forEach(c => c.geometry.dispose()); g.clear(); }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = 0.03 - k * 0.011, spread = (1.5 - k) * 0.012, step = Math.sin(t * 8 + k * 1.6 + (s > 0 ? Math.PI : 0)) * 0.002;
      const hip = new V3(s * 0.012, 0.015, z), knee = new V3(s * 0.03, 0.03, z + spread * 0.6 + step), foot = new V3(s * 0.046, 0.0, z + spread * 1.6 + step * 2);
      limb(scLegs, hip, knee, 0.0016, 0.0014); limb(scLegs, knee, foot, 0.0014, 0.0007);
    }
    const open = 0.004 + Math.sin(t * 1.8 + s) * 0.002;
    const sh = new V3(s * 0.01, 0.016, 0.046), el = new V3(s * 0.03, 0.022, 0.058), wr = new V3(s * 0.026, 0.019, 0.08);
    limb(scClaws, sh, el, 0.0024, 0.0022); limb(scClaws, el, wr, 0.0022, 0.002);
    const hand = ell(scClaws, 0.0045, 0.0038, 0.011, wr.x, wr.y, wr.z + 0.009);
    limb(scClaws, new V3(wr.x - s * open * 0.3, wr.y, wr.z + 0.018), new V3(wr.x - s * open, wr.y, wr.z + 0.034), 0.0016, 0.0004);
    limb(scClaws, new V3(wr.x + s * 0.001, wr.y, wr.z + 0.018), new V3(wr.x + s * open * 0.4, wr.y, wr.z + 0.033), 0.0016, 0.0004);
  }
  // tail: five segments arching up and forward over the back, then the venom bulb + sting
  const sway = Math.sin(t * 2.1) * 0.08;
  let p = new V3(0, 0.017, -0.05), ang = 0.25;
  for (let i = 0; i < 5; i++) {
    ang += 0.47 + strike * 0.1;
    const dir = new V3(Math.sin(sway) * 0.25, Math.sin(ang), -Math.cos(ang)).normalize();
    const q = p.clone().addScaledVector(dir, 0.0125);
    limb(scTail, p, q, 0.0048 - i * 0.0003, 0.0044 - i * 0.0003, i === 4 ? scDark : scShell);
    p = q;
  }
  const tdir = new V3(Math.sin(sway) * 0.25, Math.sin(ang + 0.55), -Math.cos(ang + 0.55)).normalize();
  const bulb = p.clone().addScaledVector(tdir, 0.006 + strike * 0.008);
  ell(scTail, 0.0055, 0.0055, 0.0065, bulb.x, bulb.y, bulb.z);
  limb(scTail, bulb, bulb.clone().addScaledVector(tdir, 0.008).add(new V3(0, -0.005, 0)), 0.0022, 0.0003, scDark);
}
scorp.scale.setScalar(2.2);
desert.add(scorp);
const SC = { x: PATCH.x + 1.2, z: PATCH.z - 0.5, heading: -2.4 };
function updateScorpion(t, strike) {
  scorp.position.set(SC.x, duneH(SC.x, SC.z) + 0.002, SC.z);
  scorp.rotation.y = SC.heading + Math.sin(t * 0.7) * 0.06;
  buildScorpLimbs(t, strike);
  return scorp.position;
}

// ---------------------------------------------------------------- post-processing
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Number(new URLSearchParams(location.search).get('msaa') ?? 4) });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
const renderPass = new RenderPass(globeScene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.8, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uCA: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new V3(1, 1, 1) }, uBlur: { value: new THREE.Vector2() },
    uGlitch: { value: 0 }, uSeed: { value: 0 }, uGrain: { value: 0.04 }, uVig: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) },
    uHeat: { value: 0 }, uTime: { value: 0 }, uRed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uCA, uFlash, uGlitch, uSeed, uGrain, uVig, uHeat, uTime, uRed; uniform vec3 uFlashCol; uniform vec2 uBlur, uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 samp(vec2 uv){ vec2 c = uv - .5; float k = uCA * (.0025 + dot(c, c) * .02);
      return vec3(texture2D(tDiffuse, uv + c * k * 1.6).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * k * 1.6).b); }
    void main(){
      vec2 uv = vUv;
      if (uHeat > 0.) { float m = 1. - smoothstep(.25, .62, uv.y);
        uv.x += (sin(uv.y * 140. + uTime * 7.) + .6 * sin(uv.y * 63. - uTime * 4.3)) * .0016 * uHeat * m;
        uv.y += sin(uv.x * 90. + uTime * 5.) * .0009 * uHeat * m; }
      if (uGlitch > 0.) { float band = floor(uv.y * 26. + uSeed * 7.); if (hash(vec2(band, uSeed)) < .4 * uGlitch) uv.x += (hash(vec2(band, uSeed + 3.)) - .5) * .14 * uGlitch; }
      vec3 col = vec3(0.);
      if (length(uBlur) > .0005) { for (int i = 0; i < 18; i++) { float k = float(i) / 17. - .5; col += samp(uv + uBlur * k); } col /= 18.; } else col = samp(uv);
      if (uGlitch > 0.) { if (hash(vec2(floor(uv.y * 90.), uSeed + 9.)) < .12 * uGlitch) col = col.brg * 1.3; }
      float l = dot(col, vec3(.3, .55, .15));
      col = mix(col, vec3(l * 1.25, l * .35, l * .38), uRed * .55);
      vec2 c = (vUv - .5) * vec2(1., 1.25);
      col *= mix(1., smoothstep(.98, .28, length(c)), uVig * .85);
      col += (hash(vUv * uRes + uSeed * 91.7) - .5) * uGrain;
      col = mix(col, uFlashCol, clamp(uFlash, 0., 1.));
      gl_FragColor = vec4(col, 1.);
    }`,
});
composer.addPass(finalPass);

// ---------------------------------------------------------------- camera per shot
const camRight = new V3(), camUp = new V3(), camBack = new V3();
function lookFrom(pos, target, fov, roll = 0, near = 0.05) {
  camera.position.copy(pos); camera.up.set(0, 1, 0); camera.lookAt(target);
  camera.rotateZ(roll * D2R); camera.fov = fov; camera.near = near;
}
const ground = (x, z, above) => new V3(x, duneH(x, z) + above, z);
function setSunElev(elev, az) {
  const e = elev * D2R, a = az * D2R;
  const d = new V3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  DU.sunDir.value.copy(d);
  return d;
}
function setDesertLight(day, dawn, night) {
  DU.uDawn.value = dawn; DU.uNight.value = night;
  const sc = new THREE.Color(1.0, 0.93, 0.8).lerp(new THREE.Color(1.3, 0.62, 0.3), dawn).lerp(new THREE.Color(0.18, 0.24, 0.42), night);
  DU.sunCol.value.copy(sc);
  DU.skyCol.value.copy(new THREE.Color(0.35, 0.48, 0.78).lerp(new THREE.Color(0.45, 0.32, 0.38), dawn).lerp(new THREE.Color(0.03, 0.05, 0.12), night));
  DU.fogCol.value.copy(new THREE.Color(0.62, 0.58, 0.55).lerp(new THREE.Color(1.1, 0.45, 0.18), dawn).lerp(new THREE.Color(0.02, 0.035, 0.08), night));
  sun.color.copy(sc); sun.intensity = lerp(3.2, 0.9, night);
  hemi.color.copy(DU.skyCol.value); hemi.groundColor.copy(new THREE.Color(0.8, 0.5, 0.28).lerp(new THREE.Color(0.04, 0.05, 0.09), night));
  hemi.intensity = lerp(1.0, 0.5, night);
}
let figWalk = false;
function setupShot(t, shot) {
  figWalk = false;
  if (shot === 1) {
    const k = E.outExpo(seg(t, 0, 1.4)), k2 = E.out(seg(t, 0, C.so));
    const lat = lerp(45, EGYPT.lat - 2, k2), lon = lerp(-10, EGYPT.lon, k2), dist = lerp(9, 1.7, k);
    const f = localFrame(lat, lon);
    camera.position.copy(f.U.clone().multiplyScalar(dist)); camera.up.copy(f.N); camera.lookAt(0, 0, 0);
    camera.rotateZ(lerp(-20, 0, k) * D2R); camera.fov = 50; camera.near = 0.02;
    return;
  }
  const F = CREST;
  if (shot === 2) {
    const k = E.inOut(seg(t, C.so, C.l2));
    placeFig(F.x, F.z, 0.6, 0);
    const a = lerp(200, 236, k) * D2R, r = lerp(7.5, 5.8, k);
    const fp = fig.position;
    lookFrom(new V3(fp.x + Math.sin(a) * r, fp.y + 0.9, fp.z + Math.cos(a) * r), new V3(fp.x, fp.y + 1.35, fp.z), 42, lerp(-4, 0, k));
    return;
  }
  if (shot === 3) {
    const k = seg(t, C.l2, C.laufen);
    placeFig(F.x, F.z, 0.6, 0);
    const x = F.x + 40 + k * 14, z = F.z + 26 - k * 10;
    lookFrom(ground(x, z, 2.6 + k * 0.8), ground(x - 30, z - 60, 8), 46, lerp(3, -2, k));
    return;
  }
  if (shot === 4) {
    const k = seg(t, C.laufen, C.l3);
    const wx = F.x - 3 + k * 2.2, wz = F.z + 1 + k * 1.2;
    placeFig(wx, wz, Math.atan2(2.2, 1.2), (t - C.laufen) * 7);
    figWalk = true;
    const fp = fig.position;
    lookFrom(new V3(fp.x - 9, fp.y + 1.2, fp.z + 8), new V3(fp.x, fp.y + 2.2, fp.z), 40);
    return;
  }
  if (shot === 5) {
    const k = E.inOut(seg(t, C.l3, C.l4));
    placeFig(F.x, F.z, -2.3, 0);
    const fp = fig.position, a = lerp(-30, 5, k) * D2R + -2.3, r = lerp(6.2, 5.2, k);
    lookFrom(new V3(fp.x + Math.sin(a) * r, fp.y + 0.7, fp.z + Math.cos(a) * r), new V3(fp.x, fp.y + 1.45, fp.z), 40);
    return;
  }
  if (shot === 6) {
    const k = E.inOut(seg(t, C.l4, C.death));
    const hx = SN.x + SN.L / 2 + (t - C.l4) * 0.05, hz = SN.z;
    const hp = new V3(hx, duneH(hx, hz), hz);
    const a = lerp(30, 52, k) * D2R, r = lerp(0.52, 0.45, k);
    lookFrom(new V3(hp.x + Math.sin(a) * r, hp.y + lerp(0.17, 0.12, k), hp.z + Math.cos(a) * r), new V3(hp.x - 0.05, hp.y + 0.025, hp.z), 38, 0, 0.01);
    return;
  }
  if (shot === 7 || shot === 8) {
    const k = shot === 7 ? E.inOut(seg(t, C.death, C.l5)) : 1;
    const k8 = shot === 8 ? E.inOut(seg(t, C.l5, C.l6)) : 0;
    const sp = new V3(SC.x, duneH(SC.x, SC.z), SC.z);
    const a = (lerp(-60, -20, k) + k8 * 20) * D2R + SC.heading, r = lerp(0.85, 0.62, k) - k8 * 0.08;
    lookFrom(new V3(sp.x + Math.sin(a) * r, sp.y + lerp(0.3, 0.22, k), sp.z + Math.cos(a) * r), new V3(sp.x, sp.y + 0.04, sp.z), 38, 0, 0.005);
    return;
  }
  // shot 9: night poll + CTA
  const k = E.inOut(seg(t, C.l6, C.end));
  placeFig(F.x, F.z, 2.4, 0);
  const fp = fig.position;
  lookFrom(new V3(fp.x + 10 - k * 2, fp.y + 0.6, fp.z - 9 + k * 2), new V3(fp.x, fp.y + 3.2, fp.z), 44);
}
function shakeAt(t) {
  let a = 0.012 * pulse(t, 0.02, 0.01, 0.35) + 0.01 * pulse(t, C.l5, 0.01, 0.3) + 0.006 * pulse(t, C.gift, 0.01, 0.25);
  for (const c of CUTS) a += 0.004 * pulse(t, c.t, 0.01, 0.12);
  return [a * (Math.sin(t * 61.3) + 0.6 * Math.sin(t * 37.1 + 1.3)), a * (Math.sin(t * 53.7 + 2.1) + 0.6 * Math.sin(t * 29.3))];
}

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = $('ui'), headEl = $('head'), capEl = $('cap'), chipsEl = $('chips'), labelsEl = $('labels'), cardsEl = $('cards'), pollEl = $('poll'), ctaEl = $('cta'), handEl = $('hand'), liveEl = $('live');
const emo = s => s.replace(/(\p{Extended_Pictographic}️?)/gu, '<span style="-webkit-text-fill-color:initial">$1</span>');
const HEADS = [
  { t0: 0, t1: C.so, html: () => '<div class="h1">AUSGESETZT IN<br><span class="big">ÄGYPTEN</span></div>' },
  { t0: C.so, t1: C.l2, html: () => `<div class="h1">SO ÜBERLEBST<br><span class="big">DU</span> ${emo('🏜️')}</div>` },
  { t0: C.l2, t1: C.laufen, html: t => `<div class="h1 red"><span class="big">${Math.round(lerp(25, 50, E.out(seg(t, C.es, C.n50 + 0.45))))}°C</span></div><div class="h2 red">REGEL #1 · HITZE</div>` },
  { t0: C.laufen, t1: C.l3, html: () => `<div class="h1">NUR NACHTS<br><span class="big">LAUFEN</span> ${emo('🌙')}</div>` },
  { t0: C.l3, t1: C.l4, html: () => '<div class="h1"><span class="big">KLEIDUNG AN</span></div><div class="h2">REGEL #2</div>' },
  { t0: C.l4, t1: C.death, html: () => `<div class="h1 red">${emo('⚠️')} <span class="big">HORNVIPER</span></div><div class="h2 red">GIFTSCHLANGE · TARNT SICH IM SAND</div>` },
  { t0: C.death, t1: C.l5, html: () => `<div class="h1 red"><span class="big">DEATHSTALKER</span></div><div class="h2 red">${emo('☠️')} EINER DER GIFTIGSTEN SKORPIONE</div>` },
  { t0: C.l5, t1: C.l6, html: () => '<div class="h1 red"><span class="big">GEBISSEN?</span></div>' },
  { t0: C.l6, t1: C.l7, html: () => '<div class="h1"><span class="big">WAS ZUERST?</span></div><div class="h2">DU ENTSCHEIDEST</div>' },
  { t0: C.l7, t1: C.end + 1, html: t => `<div class="h1"><span class="big">STIMM AB</span> ${emo('👇')}</div>${t > C.gewinner - 0.05 ? '<div class="h2">GEWINNER → NÄCHSTER TEIL</div>' : ''}` },
];
const CHUNKS = [];
for (const L of TL.lines) {
  let cur = [];
  const flush = () => { if (cur.length) CHUNKS.push({ line: L.id, words: cur }); cur = []; };
  L.words.forEach((w, i) => {
    cur.push(w);
    const nx = L.words[i + 1];
    const chars = cur.map(x => x.w).join(' ').length;
    if (/[.?!,:]$/.test(w.w) || cur.length >= 3 || (nx && chars + nx.w.length + 1 > (L.id === 1 ? 14 : 17))) flush();
  });
  flush();
}
CHUNKS.forEach((c, i) => {
  const nx = CHUNKS[i + 1], L = line(c.line);
  c.t0 = c.words[0].t0 - 0.05;
  c.t1 = nx ? (nx.line === c.line ? nx.words[0].t0 - 0.05 : Math.min(nx.words[0].t0 - 0.05, L.end + 0.3)) : L.end + 0.3;
});
const CARDS = [
  { t: C.ruhig, cls: 'ok', ic: '✓', txt: 'RUHIG BLEIBEN', sub: 'STILLHALTEN – GIFT VERTEILT SICH LANGSAMER' },
  { t: C.nicht1, cls: 'no', ic: '✕', txt: 'NICHT AUSSAUGEN', sub: 'HILFT NICHT, SCHADET EHER' },
  { t: C.nicht2, cls: 'no', ic: '✕', txt: 'NICHT ABBINDEN', sub: 'GEWEBE KANN ABSTERBEN' },
  { t: C.hilfe, cls: 'help', ic: '🚑', txt: 'HILFE RUFEN', sub: 'NOTRUF ÄGYPTEN: 123' },
];
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
const win = (t, a, b, fi = 0.18, fo = 0.15) => Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));

let lastHeadHtml = '', lastCap = '';
function updateUI(t, shot, anchors) {
  const hi = HEADS.findIndex(h => t >= h.t0 && t < h.t1);
  if (hi < 0) headEl.style.opacity = 0;
  else {
    const h = HEADS[hi], html = h.html(t);
    if (html !== lastHeadHtml) { headEl.innerHTML = html; lastHeadHtml = html; }
    const k = h.t0 === 0 ? 0.82 + 0.18 * E.outExpo(seg(t, 0, 0.25)) : E.outExpo(seg(t, h.t0, h.t0 + 0.3)), out = seg(t, h.t1 - 0.08, h.t1);
    headEl.style.opacity = clamp(k * 1.4) * (1 - out);
    headEl.style.transform = `scale(${lerp(1.35, 1, k)}) translateY(${out * -30}px)`;
    headEl.style.filter = `blur(${(1 - k) * 14}px) drop-shadow(0 0 26px ${html.includes('red') ? 'rgba(255,46,99,.55)' : 'rgba(62,232,255,.45)'}) drop-shadow(0 8px 10px rgba(0,0,0,.6))`;
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
  // chips
  let chips = '', ck = 0;
  if (shot === 3 && t > C.also - 0.05) { chips = `<div class="chip good"><small>TAGSÜBER</small>${emo('⛱️')} AB IN DEN SCHATTEN</div>`; ck = win(t, C.also - 0.05, C.laufen); }
  if (shot === 5 && t > C.sie - 0.05) { chips = `<div class="chip good"><small>SCHÜTZT VOR</small>${emo('☀️')} SONNENBRAND</div><div class="chip good"><small>WENIGER</small>${emo('💧')} SCHWEISS</div>`; ck = win(t, C.sie - 0.05, C.l4); }
  if (chipsEl.dataset.html !== chips) { chipsEl.innerHTML = chips; chipsEl.dataset.html = chips; }
  chipsEl.style.opacity = ck;
  chipsEl.style.transform = `translateY(${(1 - E.out(ck)) * 30}px)`;
  liveEl.innerHTML = t < 0.6 ? '<i></i>LIVE' : '<i></i>26°18′N 28°36′E';
  liveEl.style.opacity = 0.65 + 0.35 * Math.sin(t * 6) ** 2;
  // labels
  if (shot === 1) { const s = toScreen(egypt); label('eg', `${emo('📍')} WESTLICHE WÜSTE<small>Ägypten · Sahara</small>`, 'red', s.x, s.y - 40, seg(t, C.drop + 0.2, C.drop + 0.5)); } else label('eg', '', '', 0, 0, 0);
  if (shot === 6 && anchors.snake) { const s = toScreen(anchors.snake); label('sn', 'HORNVIPER<small>Cerastes cerastes</small>', 'red', s.x, s.y - 130, seg(t, C.horn, C.horn + 0.3)); } else label('sn', '', '', 0, 0, 0);
  // checklist
  if (shot === 8) {
    const html = CARDS.filter(c => t >= c.t - 0.05).map(c => `<div class="card ${c.cls}" data-t="${c.t}"><div class="ic">${emo(c.ic)}</div><div>${c.txt}<small>${c.sub}</small></div></div>`).join('');
    if (cardsEl.dataset.html !== html) { cardsEl.innerHTML = html; cardsEl.dataset.html = html; }
    cardsEl.querySelectorAll('.card').forEach(el => { const k = seg(t, Number(el.dataset.t) - 0.05, Number(el.dataset.t) + 0.2); el.style.transform = `translateX(${(1 - E.out(k)) * -120}px) scale(${0.85 + 0.15 * E.outBack(k)})`; el.style.opacity = clamp(k * 2); });
    cardsEl.style.opacity = 1 - seg(t, C.l6 - 0.1, C.l6);
  } else { cardsEl.innerHTML = ''; cardsEl.dataset.html = ''; }
  // poll
  if (shot === 9) {
    const html = `<div class="vote water"><div class="em">💧</div>WASSER<div class="hint">KOMMENTIERE 💧</div></div><div class="vs">VS</div><div class="vote food"><div class="em">🍖</div>ESSEN<div class="hint">KOMMENTIERE 🍖</div></div>`;
    if (pollEl.dataset.html !== html) { pollEl.innerHTML = html; pollEl.dataset.html = html; }
    const [wEl, vsEl, fEl] = pollEl.children;
    const kw = seg(t, C.l6 + 0.05, C.l6 + 0.35), kf = seg(t, C.l6 + 0.2, C.l6 + 0.5), kv = seg(t, C.l6 + 0.35, C.l6 + 0.6);
    const hw = pulse(t, C.wasser, 0.06, 0.35), hf = pulse(t, C.essen, 0.06, 0.35);
    const bob = Math.sin(t * 4) * 0.02 * seg(t, C.l7, C.l7 + 0.3);
    wEl.style.transform = `translateX(${(1 - E.out(kw)) * -500}px) rotate(-4deg) scale(${(1 + hw * 0.12 + bob).toFixed(3)})`;
    fEl.style.transform = `translateX(${(1 - E.out(kf)) * 500}px) rotate(4deg) scale(${(1 + hf * 0.12 - bob).toFixed(3)})`;
    vsEl.style.transform = `scale(${E.outBack(kv).toFixed(3)}) rotate(${(1 - kv) * -90}deg)`;
    pollEl.style.opacity = 1;
  } else { pollEl.innerHTML = ''; pollEl.dataset.html = ''; }
  // follow button during the vote call
  const ca = seg(t, C.gewinner + 0.1, C.gewinner + 0.4);
  if (ca > 0) {
    const html = '<div class="btn">+ FOLGEN FÜR TEIL 3</div>';
    if (ctaEl.dataset.html !== html) { ctaEl.innerHTML = html; ctaEl.dataset.html = html; }
    ctaEl.style.top = '1060px';
    ctaEl.style.opacity = clamp(ca * 1.5);
    ctaEl.style.transform = `scale(${(E.outBack(ca) * (1 + 0.04 * Math.sin(t * 9))).toFixed(3)})`;
  } else { ctaEl.style.opacity = 0; ctaEl.innerHTML = ''; ctaEl.dataset.html = ''; }
  handEl.style.display = 'none';
  const [sx, sy] = shakeAt(t);
  let wb = 0, wd = [0, 1];
  for (const c of CUTS) { const d = t - c.t; const w = d < 0 ? Math.exp(-((d / 0.06) ** 2)) : Math.exp(-((d / 0.1) ** 2)); if (w > wb) { wb = w; wd = c.dir; } }
  ui.style.transform = `translate(${(sx * 900 + wd[0] * wb * 40).toFixed(1)}px, ${(sy * 900 + wd[1] * wb * 40).toFixed(1)}px)`;
  ui.style.filter = wb > 0.05 ? `blur(${(wb * 6).toFixed(1)}px)` : 'none';
}

// ---------------------------------------------------------------- per frame
function renderAt(t) {
  const shot = SHOT(t);
  const isGlobe = shot === 1;
  renderPass.scene = isGlobe ? globeScene : desert;
  setupShot(t, shot);
  let punch = 0;
  for (const c of CUTS) if (t >= c.t) punch = Math.max(punch, 0.1 * Math.exp(-(t - c.t) / 0.16));
  camera.fov *= 1 + punch;
  camera.setViewOffset(W, H, 0, isGlobe ? -0.03 * H : 0, W, H);
  camera.updateProjectionMatrix();
  const [shx, shy] = shakeAt(t);
  camera.rotateX(shx); camera.rotateY(shy);
  camera.updateMatrixWorld();
  camera.matrixWorld.extractBasis(camRight, camUp, camBack);
  const pxScale = H / (2 * Math.tan((camera.fov * D2R) / 2));
  const anchors = {};

  if (isGlobe) {
    GU.sunDir.value.copy(camRight.clone().multiplyScalar(-0.5).addScaledVector(camUp, 0.4).addScaledVector(camBack, 0.75).normalize());
    GU.hud.value = 0.25 + 0.5 * seg(t, C.drop, C.drop + 0.4);
    egyptMat.opacity = seg(t, C.drop, C.drop + 0.3) * (0.7 + 0.3 * Math.sin(t * 10));
    globeStars.position.copy(camera.position);
    globeStars.material.uniforms.uTime.value = t;
    const dk = seg(t, C.drop, C.drop + 0.8);
    marker.visible = egyptGlow.visible = t >= C.drop;
    pulses.forEach((p, i) => { const ph = (((t - C.drop) * 0.9 + i / 3) % 1 + 1) % 1; p.scale.setScalar(0.004 + ph * 0.05); p.material.opacity = Math.pow(1 - ph, 2); });
    dropRing.scale.setScalar(0.005 + E.out(dk) * 0.14); dropRing.material.opacity = 1 - dk;
    egyptGlow.position.copy(egypt.clone().multiplyScalar(1.003));
    egyptGlow.scale.setScalar(0.03 * (1 + 1.5 * pulse(t, C.drop, 0.02, 0.3)));
  } else {
    // light / time of day per shot
    // sun azimuth is set relative to where the camera looks (0 = straight ahead, i.e. backlight)
    const fwd = camBack.clone().negate();
    const azView = Math.atan2(fwd.x, fwd.z) / D2R;
    let elev = 34, off = 150, dawn = 0, night = 0;
    if (shot === 2) { elev = 7; off = 14; dawn = 0.55; }
    if (shot === 3) { elev = 13; off = -12; }
    if (shot === 4) { const k = E.inOut(seg(t, C.laufen, C.laufen + 0.55)); elev = lerp(5, -14, k); off = 8; dawn = Math.sin(Math.PI * Math.min(k * 1.4, 1)) * 0.9; night = E.inOut(seg(t, C.laufen + 0.12, C.laufen + 0.62)); }
    if (shot === 5) { elev = 5; off = -16; dawn = 0.85; }
    if (shot === 6 || shot === 7 || shot === 8) { elev = 40; off = 145; }
    if (shot === 9) { elev = -20; off = 0; night = 1; }
    const sd = setSunElev(elev, azView + off);
    setDesertLight(1, dawn, night);
    sun.position.copy(night > 0.6 ? new V3(-0.4, 0.6, 0.5) : sd);
    sky.position.copy(camera.position);
    nightStars.position.copy(camera.position);
    nightStars.material.uniforms.uOpacity.value = night;
    nightStars.material.uniforms.uTime.value = t;
    nightStars.visible = night > 0.01;
    const moonDir = new V3(-0.35, 0.42, -0.55).normalize();
    moon.visible = moonCore.visible = night > 0.05;
    moon.position.copy(camera.position).addScaledVector(moonDir, 1000); moon.material.opacity = night * 0.5;
    moonCore.position.copy(moon.position); moonCore.material.opacity = night;
    DU.uTime.value = t;
    fig.visible = blob.visible = shot <= 5 || shot === 9;
    snake.visible = snakeHead.visible = shot === 6;
    scorp.visible = shot === 7 || shot === 8;
    if (shot === 6) anchors.snake = updateSnake(t, 0);
    if (shot === 7 || shot === 8) { updateScorpion(t, pulse(t, C.gift, 0.08, 0.25) + (shot === 8 ? 0.4 * pulse(t, C.l5, 0.05, 0.4) : 0)); anchors.scorp = scorp.position.clone().add(new V3(0, 0.12, 0)); }
    // drifting sand
    const a = sandDrift.geometry.attributes.position, cp = camera.position;
    const wind = new V3(-1, 0.05, -0.4).normalize();
    const box = shot >= 6 && shot <= 8 ? 1.2 : 14;
    for (let i = 0; i < a.count; i++) {
      const [r1, r2, r3, r4] = driftSeed[i];
      const tr = ((r1 * box * 2 + (t * (3 + r4 * 4)) * (box / 14)) % (box * 2)) - box;
      const x = cp.x + (r2 - 0.5) * box * 2 + wind.x * tr, z = cp.z + (r3 - 0.5) * box * 2 + wind.z * tr;
      a.setXYZ(i, x, duneH(x, z) + (r4 * r4) * box * 0.12 + 0.01, z);
    }
    a.needsUpdate = true;
    sandDrift.material.uniforms.uScale.value = pxScale * (box < 2 ? 0.12 : 1);
    sandDrift.material.uniforms.uOpacity.value = night > 0.5 ? 0.25 : box < 2 ? 0.5 : 0.8;
  }

  // post FX
  let wb = 0, wd = [0, 1], glitch = 0, flash = 0, ca = 0.25;
  for (const c of CUTS) {
    const d = t - c.t;
    const w = d < 0 ? Math.exp(-((d / 0.06) ** 2)) : Math.exp(-((d / 0.1) ** 2));
    if (w > wb) { wb = w; wd = c.dir; }
    if (c.glitch && d > -0.03 && d < 0.18) glitch = Math.max(glitch, c.glitch * (1 - d / 0.18));
    if (c.flash && d >= 0) flash = Math.max(flash, c.flash * Math.exp(-d / 0.12));
    ca += 1.6 * pulse(t, c.t, 0.01, 0.15);
  }
  if (t < 0.22) glitch = Math.max(glitch, 0.6 * (1 - t / 0.22));
  flash = Math.max(flash, 0.25 * Math.exp(-t / 0.08), 0.3 * pulse(t, C.drop, 0.02, 0.1));
  ca += 2 * pulse(t, C.gift, 0.01, 0.2) + 1.5 * pulse(t, C.l5, 0.01, 0.3);
  const fu = finalPass.uniforms;
  fu.uBlur.value.set(wd[0] * wb * 0.06, wd[1] * wb * 0.09);
  fu.uGlitch.value = glitch;
  fu.uSeed.value = Math.floor(t * 30) * 0.731 % 17;
  fu.uFlash.value = flash;
  fu.uFlashCol.value.set(1, 1, 1);
  fu.uCA.value = ca;
  fu.uTime.value = t;
  fu.uHeat.value = shot === 3 ? 1 : shot === 2 ? 0.6 : 0;
  fu.uRed.value = shot === 8 ? 0.35 + 0.25 * Math.sin(t * 7) ** 2 : shot === 7 ? 0.5 * pulse(t, C.gift, 0.05, 0.4) : 0;
  bloom.strength = isGlobe ? 0.85 : shot === 9 ? 1.0 : 0.7;
  composer.render();
  updateUI(t, shot, anchors);
}

const EVENTS = [
  { t: 0, type: 'hit' }, { t: 0, type: 'glitch' }, { t: C.drop, type: 'ping' },
  ...CUTS.map(c => ({ t: c.t, type: 'whoosh' })),
  { t: C.so, type: 'wind', dur: C.l2 - C.so },
  { t: C.l2, type: 'heat', dur: C.laufen - C.l2 },
  { t: C.es, type: 'count', dur: C.n50 + 0.45 - C.es },
  { t: C.also - 0.05, type: 'pop' },
  { t: C.laufen, type: 'night', dur: C.l3 - C.laufen },
  { t: C.sie - 0.05, type: 'pop' }, { t: C.sie + 0.1, type: 'pop' },
  { t: C.l4 + 0.15, type: 'rasp', dur: C.death - C.l4 - 0.2 },
  { t: C.death, type: 'skitter', dur: C.l5 - C.death },
  { t: C.gift, type: 'strike' },
  { t: C.l5, type: 'alarm' }, { t: C.l5, type: 'heartbeat', dur: C.l6 - C.l5 },
  ...CARDS.map(c => ({ t: c.t, type: c.cls === 'ok' ? 'check' : c.cls === 'no' ? 'buzz' : 'help' })),
  { t: C.l6 + 0.05, type: 'pop' }, { t: C.l6 + 0.2, type: 'pop' }, { t: C.l6 + 0.35, type: 'hitsoft' },
  { t: C.wasser, type: 'blip' }, { t: C.essen, type: 'blip' },
  { t: C.gewinner + 0.1, type: 'tap' },
];
window.renderAt = renderAt;
window.EVENTS = EVENTS;
window.CUES = C;
await Promise.all(['138px Anton', '900 82px Inter', '800 30px Inter', '700 26px "DejaVu Sans Mono"'].map(f => document.fonts.load(f)));
await document.fonts.ready;
renderAt(C.l4 + 0.5);
renderAt(C.death + 0.5);
renderAt(0.5);
renderAt(0);
window.ready = true;
