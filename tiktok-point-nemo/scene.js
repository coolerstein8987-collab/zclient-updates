// Point Nemo — TikTok short. Every visual is a pure function of time t (renderAt), so frames
// can be captured deterministically one by one.
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
function ll(lat, lon, r = 1) {
  const a = lat * D2R, o = lon * D2R;
  return new V3(Math.cos(a) * Math.cos(o) * r, Math.sin(a) * r, -Math.cos(a) * Math.sin(o) * r);
}
function localFrame(lat, lon) {
  const a = lat * D2R, o = lon * D2R;
  return {
    U: ll(lat, lon),
    E: new V3(-Math.sin(o), 0, -Math.cos(o)),
    N: new V3(-Math.sin(a) * Math.cos(o), Math.cos(a), Math.sin(a) * Math.sin(o)),
  };
}

// ---------------------------------------------------------------- timeline cues
const TL = await (await fetch('timeline.json')).json();
const line = i => TL.lines[i - 1];
const cw = (i, w, n = 0) => line(i).words.filter(x => x.w === w)[n].t0;
const C = {
  l2: line(2).start, point: cw(2, 'Point'), mitten: cw(2, 'Mitten'),
  l3: line(3).start, ueber: cw(3, 'Über'), weg: cw(3, 'weg.'), richtung: cw(3, 'In'),
  l4: line(4).start, oft: cw(4, 'Oft'), erde: cw(4, 'Erde,'), sondern: cw(4, 'sondern'),
  station: cw(4, 'Raumstation.'), nur: cw(4, 'Nur'), n400: cw(4, '400'),
  l5: line(5).start, friedhof: cw(5, 'Friedhof'), ueber2: cw(5, 'Über'), n260: cw(5, '260'),
  l6: line(6).start, ab: cw(6, 'ab.'),
  l7: line(7).start, mehr: cw(7, 'mehr'), tap: cw(7, 'verrückte'), end: TL.duration,
};
C.impact = C.ab + 0.12;
C.drop = C.point + 0.12;
const CUTS = [
  { t: C.l2, dir: [0, 1] }, { t: C.l3, dir: [1, 0] }, { t: C.sondern, dir: [0, 1], glitch: 1 },
  { t: C.nur, dir: [1, 0] }, { t: C.l5, dir: [0, 1], glitch: 0.6 }, { t: C.l6, dir: [1, 0] },
  { t: C.l7, dir: [0, 1], flash: 0.7 },
];

// ---------------------------------------------------------------- places
const NEMO = { lat: -48.8767, lon: -123.3933 };
const nemo = ll(NEMO.lat, NEMO.lon);
const nemoF = localFrame(NEMO.lat, NEMO.lon);
const ISLANDS = [
  { name: 'DUCIE ISLAND', sub: 'Pitcairn · 2.688 km', lat: -24.6667, lon: -124.7833 },
  { name: 'MOTU NUI', sub: 'Osterinsel · 2.688 km', lat: -27.2033, lon: -109.425 },
  { name: 'MAHER ISLAND', sub: 'Antarktis · 2.688 km', lat: -72.9667, lon: -126.3667 },
];
const ZONE_R = 2688 / 6371;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 1200);

const loader = new THREE.TextureLoader();
const IMG = 'node_modules/three-globe/example/img/';
const [dayTex, nightTex, waterTex, topoTex, skyTex] = await Promise.all(
  ['earth-blue-marble.jpg', 'earth-night.jpg', 'earth-water.png', 'earth-topology.png', 'night-sky.png'].map(f => loader.loadAsync(IMG + f)));
for (const t of [dayTex, nightTex, skyTex]) t.colorSpace = THREE.SRGBColorSpace;
for (const t of [dayTex, nightTex, waterTex, topoTex]) { t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; }

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<6;i++){f+=a*snoise(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=.5;}return f;}
`;

// Bake a procedural, seamless cloud map once (equirectangular, same layout as the earth maps).
function bakeClouds() {
  const rt = new THREE.WebGLRenderTarget(2048, 1024, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping });
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: NOISE + /* glsl */ `
      varying vec2 vUv;
      void main(){
        float lon = (vUv.x - .5) * 6.2831853, lat = (vUv.y - .5) * 3.1415926;
        vec3 p = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
        vec3 q = vec3(fbm(p * 1.3 + 1.), fbm(p * 1.3 + 5.2), fbm(p * 1.3 + 9.4));
        float c = fbm(p * 2.6 + q * 1.2);
        float al = abs(lat);
        float belt = .2 * exp(-pow((al - .95) / .22, 2.)) + .12 * exp(-pow(lat / .1, 2.)) - .16 * exp(-pow((al - .42) / .14, 2.));
        float cov = smoothstep(.04, .52, c + belt);
        float wisp = fbm(p * 9. + q * 2.) * .5 + .5;
        gl_FragColor = vec4(vec3(cov * (.7 + .3 * wisp)), 1.);
      }`,
  });
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  renderer.setRenderTarget(rt);
  renderer.render(s, new THREE.Camera());
  renderer.setRenderTarget(null);
  return rt.texture;
}
const cloudTex = bakeClouds();

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
function glowSprite(color, scale = 0.05, depthTest = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, transparent: true }));
  s.scale.setScalar(scale);
  scene.add(s);
  return s;
}
const hdr = (r, g, b) => new THREE.Color(r, g, b);

// ---------------------------------------------------------------- earth
const U = {
  sunDir: { value: new V3(1, 0, 0) }, nemoDir: { value: nemo.clone() }, time: { value: 0 },
  zoneR: { value: 0 }, zoneA: { value: 0 }, hud: { value: 0 }, shockR: { value: 0 }, shockA: { value: 0 }, mood: { value: 0 },
};
const earthMat = new THREE.ShaderMaterial({
  uniforms: { ...U, dayMap: { value: dayTex }, nightMap: { value: nightTex }, waterMap: { value: waterTex }, topoMap: { value: topoTex }, cloudMap: { value: cloudTex } },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D dayMap, nightMap, waterMap, topoMap, cloudMap;
    uniform vec3 sunDir, nemoDir;
    uniform float zoneR, zoneA, hud, time, shockR, shockA, mood;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 n = normalize(vN);
      vec3 east = normalize(vec3(n.z, 0., -n.x) + vec3(1e-6));
      vec3 north = cross(n, east);
      float h0 = texture2D(topoMap, vUv).r;
      float hx = texture2D(topoMap, vUv + vec2(1. / 2048., 0.)).r;
      float hy = texture2D(topoMap, vUv + vec2(0., 1. / 1024.)).r;
      vec3 bn = normalize(n - (east * (hx - h0) + north * (hy - h0)) * 7.);
      float water = texture2D(waterMap, vUv).r;
      vec3 day = texture2D(dayMap, vUv).rgb;
      day = mix(day * vec3(1.08, 1.0, .88), day * vec3(.5, .95, 1.5), water);
      float ndl = dot(n, sunDir);
      float lit = max(dot(bn, sunDir), 0.);
      float dayMix = smoothstep(-.18, .2, ndl);
      float cs = texture2D(cloudMap, vUv + vec2(time * .0008 + .0012, -.0006)).r;
      vec3 col = day * (lit * 1.55 + .02) * (1. - cs * .4);
      vec3 V = normalize(cameraPosition - vW);
      float nh = max(dot(n, normalize(sunDir + V)), 0.);
      col += vec3(1., .86, .68) * (pow(nh, 90.) * .55 + pow(nh, 12.) * .05) * water * dayMix * (1. - cs * .9);
      vec3 night = texture2D(nightMap, vUv).rgb;
      float lum = dot(night, vec3(.35, .45, .2));
      vec3 lights = vec3(1., .7, .35) * smoothstep(.1, .55, lum) * 2.4;
      col = col * dayMix + lights * (1. - dayMix) + day * .012;
      float fres = pow(1. - max(dot(n, V), 0.), 2.6);
      col = mix(col, vec3(.22, .55, 1.) * (.15 + 1.3 * clamp(ndl + .3, 0., 1.)), fres * .7);
      col += vec3(1., .35, .1) * exp(-pow(ndl * 7., 2.)) * .05;
      float la = asin(clamp(n.y, -1., 1.)) * 57.29578, lo = atan(-n.z, n.x) * 57.29578;
      vec2 g = vec2(lo, la) / 10.;
      vec2 gd = abs(fract(g - .5) - .5) / max(fwidth(g), vec2(1e-4));
      col += vec3(.25, .85, 1.) * (1. - min(min(gd.x, gd.y), 1.)) * .2 * hud;
      float ang = acos(clamp(dot(n, nemoDir), -1., 1.));
      if (zoneA > .001) {
        float inside = 1. - smoothstep(zoneR - .003, zoneR + .001, ang);
        float ring = exp(-pow((ang - zoneR) / .0035, 2.));
        vec3 e1 = normalize(cross(nemoDir, vec3(0., 1., 0.)));
        vec3 e2 = cross(nemoDir, e1);
        vec3 p = n - nemoDir * dot(n, nemoDir);
        float a = atan(dot(p, e2), dot(p, e1));
        float sweep = pow(fract(a / 6.2831853 + time * .55), 6.) * inside;
        float rr = ang / .0785;
        float conc = (1. - smoothstep(0., 1.4, abs(fract(rr - .5) - .5) / max(fwidth(rr), 1e-4))) * inside;
        col = mix(col, col * .55 + vec3(.22, .02, .06), inside * zoneA * .8);
        col += vec3(1., .16, .32) * (ring * 3. + sweep * .45 + conc * .3) * zoneA;
      }
      if (shockA > .001) {
        float sr = exp(-pow((ang - shockR) / (.006 + shockR * .1), 2.));
        col += vec3(1., .6, .25) * sr * shockA * 4.;
        col += vec3(1., .45, .15) * exp(-ang / .025) * shockA * 3.;
      }
      col *= mix(1., .72, mood);
      gl_FragColor = vec4(col, 1.);
    }`,
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), earthMat);
scene.add(earth);

const cloudMat = new THREE.ShaderMaterial({
  uniforms: { ...U, cloudMap: { value: cloudTex }, opacity: { value: 0.85 } },
  vertexShader: earthMat.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float time, opacity;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 n = normalize(vN);
      float c = texture2D(cloudMap, vUv + vec2(time * .0008, 0.)).r;
      float ndl = dot(n, sunDir);
      vec3 V = normalize(cameraPosition - vW);
      float fres = pow(1. - max(dot(n, V), 0.), 3.);
      vec3 col = vec3(1., .98, .95) * (.03 + 1.3 * max(ndl, 0.)) + vec3(1., .5, .25) * exp(-pow(ndl * 6., 2.)) * .25;
      float a = c * opacity * (.2 + .8 * smoothstep(-.15, .35, ndl)) * (1. - fres * .4);
      gl_FragColor = vec4(col * a, a);
    }`,
  transparent: true, premultipliedAlpha: true, depthWrite: false,
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.007, 160, 110), cloudMat);
scene.add(clouds);

const atmoMat = new THREE.ShaderMaterial({  // camera-height aware limb glow
  uniforms: { sunDir: U.sunDir, intensity: { value: 1 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir; uniform float intensity; varying vec3 vW;
    void main(){
      vec3 ro = cameraPosition, rd = normalize(vW - ro);
      float tca = -dot(ro, rd);
      vec3 cp = tca < 0. ? ro : ro + rd * tca;
      float h = max(length(cp) - 1., 0.);
      float g = exp(-h / .022) * 1.15 + exp(-h / .075) * .35;
      float l = clamp(dot(normalize(cp), sunDir) * .8 + .45, .04, 1.25);
      vec3 col = mix(vec3(.08, .3, 1.), vec3(.45, .8, 1.), clamp(l, 0., 1.)) * g * l * intensity;
      gl_FragColor = vec4(col, 1.);
    }`,
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.17, 128, 96), atmoMat);
scene.add(atmo);

// country borders + coastlines as a holographic overlay
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
const coastMat = new THREE.LineBasicMaterial({ color: hdr(0.3, 1.1, 1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const borderMat = coastMat.clone();
scene.add(new THREE.LineSegments(lineGeo(topoMesh(topo, topo.objects.countries, (a, b) => a === b), 1.0015), coastMat));
scene.add(new THREE.LineSegments(lineGeo(topoMesh(topo, topo.objects.countries, (a, b) => a !== b), 1.0015), borderMat));

// ---------------------------------------------------------------- sky
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, color: hdr(0.55, 0.55, 0.62), depthWrite: false }));
scene.add(sky);
const pointsVS = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute float aT; attribute vec3 aCol;
  uniform float uTime, uScale, uAtten; varying float vA; varying vec3 vC;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    gl_Position = projectionMatrix * mv;
    float pop = aT > 0. ? step(aT, uTime) * (1. + 2.2 * exp(-(uTime - aT) * 7.)) : 1.;
    gl_PointSize = aSize * pop * mix(1., uScale / -mv.z, uAtten);
    vA = aAlpha; vC = aCol;
  }`;
const pointsFS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity, uTime, uTwinkle, uHot; varying float vA; varying vec3 vC;
  void main(){
    float d = length(gl_PointCoord - .5) * 2.;
    float a = exp(-d * d * 3.5) * (1. - smoothstep(.75, 1., d));
    vec3 c = uColor * vC;
    if (uHot > 0.) c = mix(vec3(1., .22, .04) * 3., vec3(1., .9, .65) * 9., pow(vA, 2.5)) * uHot;
    float tw = 1. - uTwinkle * (.5 + .5 * sin(uTime * 3. + vC.r * 60. + vA * 40.));
    gl_FragColor = vec4(c * a * vA * uOpacity * tw, 1.);
  }`;
function pointCloud(n, fill, opts = {}) {
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), at = new Float32Array(n), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = fill(i);
    pos.set([p.pos.x, p.pos.y, p.pos.z], i * 3); size[i] = p.size; alpha[i] = p.alpha ?? 1; at[i] = p.t ?? 0;
    const c = p.col ?? [1, 1, 1]; col.set(c, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('aT', new THREE.BufferAttribute(at, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1000 }, uAtten: { value: opts.atten ?? 0 }, uColor: { value: opts.color ?? hdr(1, 1, 1) },
      uOpacity: { value: 1 }, uTwinkle: { value: opts.twinkle ?? 0 }, uHot: { value: opts.hot ?? 0 } },
    vertexShader: pointsVS, fragmentShader: pointsFS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const R = mulberry(7);
const stars = pointCloud(6500, () => {
  const v = new V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(300);
  const s = Math.pow(R(), 6);
  const tint = R();
  return { pos: v, size: 1.2 + s * 4.5, alpha: 0.35 + 0.65 * R(), col: tint < 0.15 ? [1, 0.82, 0.65] : tint > 0.8 ? [0.7, 0.85, 1.2] : [1, 1, 1] };
}, { twinkle: 0.35 });
const dust = pointCloud(500, () => {
  const v = new V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(1.25 + Math.pow(R(), 0.7) * 5);
  return { pos: v, size: 0.006 + R() * 0.01, alpha: 0.12 + R() * 0.2, col: [0.6, 0.85, 1.2] };
}, { atten: 1 });

// ---------------------------------------------------------------- Point Nemo marker
const qNemo = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), nemo);
const marker = new THREE.Group();
marker.position.copy(nemo.clone().multiplyScalar(1.0008));
marker.quaternion.copy(qNemo);
scene.add(marker);
const ringGeo = new THREE.RingGeometry(0.82, 1, 96);
const mkRingMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const pulses = [0, 1, 2].map(() => { const m = new THREE.Mesh(ringGeo, mkRingMat(hdr(3, 0.5, 0.9))); marker.add(m); return m; });
const dropRing = new THREE.Mesh(ringGeo, mkRingMat(hdr(3, 2.2, 2.5)));
marker.add(dropRing);
const dot = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mkRingMat(hdr(4, 1.2, 1.6)));
marker.add(dot);
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: hdr(3, 0.6, 1.0) }, uOpacity: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a = pow(1. - vUv.y, 1.6); gl_FragColor = vec4(uColor * a * uOpacity, 1.); }',
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const beam = new THREE.Mesh(beamGeo, beamMat);
marker.add(beam);
const nemoGlow = glowSprite(hdr(3, 0.7, 1.1), 0.05);

// ---------------------------------------------------------------- arcs to the nearest land
const arcs = ISLANDS.map((isl, i) => {
  const to = ll(isl.lat, isl.lon);
  const pts = [];
  for (let k = 0; k <= 80; k++) {
    const s = k / 80;
    const p = new V3().copy(nemo).lerp(to, s).normalize();
    pts.push(p.multiplyScalar(1.002 + 0.045 * Math.sin(Math.PI * s)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 160, 0.0028, 6, false);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hdr(0.4, 2.4, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(mesh);
  const head = glowSprite(hdr(2, 4, 5), 0.06);
  const end = glowSprite(hdr(1.2, 3, 4), 0.05);
  return { isl, to, curve, mesh, head, end, n: geo.index.count, t0: C.l3 + 0.25 + i * 0.28, dur: 0.85 };
});

// ---------------------------------------------------------------- ISS
const ISS_R = 1 + 400 / 6371;
const trackAz = (() => {
  const Y = new V3(0, 1, 0);
  const p1 = Y.clone().sub(nemo.clone().multiplyScalar(Y.dot(nemo))).normalize();
  const p2 = new V3().crossVectors(nemo, p1).normalize();
  const b = Math.acos(clamp(Math.cos(51.6 * D2R) / p1.dot(Y), -1, 1));
  const n = p1.clone().multiplyScalar(Math.cos(b)).addScaledVector(p2, Math.sin(b)).normalize();
  if (new V3().crossVectors(n, nemo).dot(nemoF.E) < 0) n.negate();
  window.__issN = n;
  const tng = new V3().crossVectors(n, nemo).normalize();
  return Math.atan2(tng.dot(nemoF.E), tng.dot(nemoF.N)) / D2R;
})();
const issTan = new V3().crossVectors(window.__issN, nemo).normalize();
const issPos = (th, r = ISS_R) => nemo.clone().multiplyScalar(Math.cos(th)).addScaledVector(issTan, Math.sin(th)).multiplyScalar(r);
function issBasis(th) {
  const up = issPos(th, 1).normalize();
  const fwd = issTan.clone().multiplyScalar(Math.cos(th)).addScaledVector(nemo, -Math.sin(th)).normalize();
  const right = new V3().crossVectors(up, fwd).normalize();
  return { up, fwd, right };
}
function panelTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d'); const r = mulberry(3);
  g.fillStyle = '#20150a'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 4; x++) {
    const v = 0.7 + 0.3 * r();
    g.fillStyle = `rgb(${(205 * v) | 0},${(128 * v) | 0},${(48 * v) | 0})`;
    g.fillRect(x * 16 + 1, y * 8 + 1, 14, 6);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const iss = new THREE.Group();
{
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e9e9, metalness: 0.25, roughness: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.28 });
  const gold = new THREE.MeshStandardMaterial({ map: panelTexture(), metalness: 0.55, roughness: 0.3, emissive: hdr(0.1, 0.05, 0.01), side: THREE.DoubleSide });
  const rad = new THREE.MeshStandardMaterial({ color: 0xf7f7f7, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); iss.add(o); return o; };
  const cyl = (r, l, m, x, y, z, ax) => {
    const g = new THREE.CylinderGeometry(r, r, l, 20);
    if (ax === 'z') g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); iss.add(o); return o;
  };
  box(1.0, 0.035, 0.035, metal, 0, 0, 0);
  box(1.0, 0.012, 0.06, metal, 0, 0.012, 0);
  for (const x of [-0.47, -0.37, 0.37, 0.47]) for (const z of [-1, 1]) {
    box(0.085, 0.004, 0.34, gold, x, 0, z * 0.2);
    box(0.008, 0.008, 0.36, metal, x, 0.004, z * 0.2);
  }
  cyl(0.032, 0.46, white, 0, -0.05, 0.02, 'z');
  cyl(0.03, 0.2, white, 0, -0.05, -0.02, 'x');
  cyl(0.026, 0.24, white, 0, -0.05, 0.35, 'z');
  cyl(0.02, 0.1, white, 0, -0.05, -0.25, 'z');
  for (const s of [-1, 1]) box(0.2, 0.003, 0.05, gold, s * 0.13, -0.05, 0.38);
  for (const s of [-1, 1]) box(0.075, 0.003, 0.17, rad, s * 0.17, -0.01, 0.1).rotation.z = s * 0.25;
}
iss.scale.setScalar(0.045);
scene.add(iss);
const issGlow = glowSprite(hdr(3, 1.2, 0.4), 0.05, true);
const issBlinkR = glowSprite(hdr(5, 0.3, 0.3), 0.01, true);
const sun = new THREE.DirectionalLight(0xffffff, 3.4);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404a66, 0.35));
const earthShine = new THREE.HemisphereLight(0x0a1020, 0x3a78c0, 0.9);
scene.add(earthShine);

// orbit ring (dashed, scrolling)
const orbitPts = [];
for (let k = 0; k <= 720; k++) orbitPts.push(issPos((k / 720) * Math.PI * 2));
const orbitMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform float uTime, uOpacity; varying vec2 vUv; void main(){ float d = step(.45, fract(vUv.x * 260. - uTime * 3.)); gl_FragColor = vec4(vec3(.5, 2.2, 3.) * d * uOpacity, 1.); }',
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
const orbit = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(orbitPts, true), 1440, 0.0011, 4, true), orbitMat);
scene.add(orbit);

// 400 km measuring line
const measureMat = new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main(){ float d = step(.4, fract(vUv.y * 14.)); gl_FragColor = vec4(vec3(1.2, 2.6, 3.2) * d * uOpacity, 1.); }',
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
const measure = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), measureMat);
measure.quaternion.setFromUnitVectors(new V3(0, 1, 0), nemo);
measure.position.copy(nemo);
scene.add(measure);

// ---------------------------------------------------------------- space-craft graveyard
const rg = mulberry(42);
function nearNemo(maxAng, r = rg) {
  const a = r() * Math.PI * 2, d = Math.min(maxAng, Math.abs(gauss(r)) * maxAng * 0.45);
  return nemo.clone().multiplyScalar(Math.cos(d)).addScaledVector(nemoF.E.clone().multiplyScalar(Math.cos(a)).addScaledVector(nemoF.N, Math.sin(a)), Math.sin(d)).normalize();
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r() * 0.9999)) * Math.cos(2 * Math.PI * r()); }
const meteorTimes = [0.12, 0.62, 1.05, 1.6, 2.05, 2.55, 2.8, 3.05, 3.25, 3.45, 3.62, 3.8, 4.05, 4.4].map(x => C.l5 + x * ((C.l6 - C.l5 - 0.55) / 4.4));
const MIR_IDX = 2;
const meteors = meteorTimes.map((t0, i) => {
  const hit = i === MIR_IDX ? nearNemo(0.01) : nearNemo(0.075);
  const trail = pointCloud(44, k => ({ pos: new V3(), size: (i === MIR_IDX ? 0.05 : 0.032) * (1 - (k / 44) * 0.75), alpha: Math.pow(1 - k / 44, 1.4) }), { atten: 1, hot: 1 });
  const flash = glowSprite(hdr(6, 3, 1.4), 0.001);
  const ring = new THREE.Mesh(ringGeo, mkRingMat(hdr(3, 1.4, 0.6)));
  ring.quaternion.setFromUnitVectors(new V3(0, 0, 1), hit);
  ring.position.copy(hit.clone().multiplyScalar(1.001));
  scene.add(ring);
  return { t0, dur: i === MIR_IDX ? 0.95 : 0.6 + rg() * 0.25, hit, trail, flash, ring, big: i === MIR_IDX, side: rg() - 0.5, len: 0.9 + rg() * 0.5 };
});
const wreckTimes = [];
const wrecks = pointCloud(260, i => {
  let p, t;
  if (i < meteors.length) { p = meteors[i].hit; t = meteors[i].t0 + meteors[i].dur; }
  else { p = nearNemo(0.11); t = C.ueber2 + 0.1 + Math.pow((i - meteors.length) / (260 - meteors.length), 0.8) * 1.25 + rg() * 0.05; }
  wreckTimes.push(t);
  return { pos: p.clone().multiplyScalar(1.0012), size: 0.0085, alpha: 1, t, col: [1, 0.2, 0.12] };
}, { atten: 1, color: hdr(3, 1, 1) });
wreckTimes.sort((a, b) => a - b);
const wreckCount = t => { let n = 0; for (const w of wreckTimes) if (w <= t) n++; return n; };

// ISS deorbit FX
const issTrail = pointCloud(90, k => ({ pos: new V3(), size: 0.009 * (1 - (k / 90) * 0.6), alpha: Math.pow(1 - k / 90, 1.2) }), { atten: 1, hot: 0.4 });
const debris = pointCloud(90, () => ({ pos: new V3(), size: 0.006 + rg() * 0.01, alpha: 0.6 + rg() * 0.4 }), { atten: 1, hot: 1 });
const debrisDirs = Array.from({ length: 90 }, () => ({ v: new V3(gauss(rg), gauss(rg), gauss(rg)).multiplyScalar(0.04), up: 0.05 + rg() * 0.12, d: rg() }));
const bigFlash = glowSprite(hdr(8, 5, 3), 0.001);

// ---------------------------------------------------------------- post-processing
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Number(new URLSearchParams(location.search).get('msaa') ?? 4) });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.85, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uCA: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new V3(1, 1, 1) }, uBlur: { value: new THREE.Vector2() },
    uGlitch: { value: 0 }, uSeed: { value: 0 }, uGrain: { value: 0.04 }, uVig: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uCA, uFlash, uGlitch, uSeed, uGrain, uVig; uniform vec3 uFlashCol; uniform vec2 uBlur, uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 samp(vec2 uv){
      vec2 c = uv - .5; float k = uCA * (.0025 + dot(c, c) * .02);
      return vec3(texture2D(tDiffuse, uv + c * k * 1.6).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * k * 1.6).b);
    }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.) {
        float band = floor(uv.y * 26. + uSeed * 7.);
        float r = hash(vec2(band, uSeed));
        if (r < .4 * uGlitch) uv.x += (hash(vec2(band, uSeed + 3.)) - .5) * .14 * uGlitch;
      }
      vec3 col = vec3(0.);
      if (length(uBlur) > .0005) {
        for (int i = 0; i < 18; i++) { float k = float(i) / 17. - .5; col += samp(uv + uBlur * k); }
        col /= 18.;
      } else col = samp(uv);
      if (uGlitch > 0.) { float r = hash(vec2(floor(uv.y * 90.), uSeed + 9.)); if (r < .12 * uGlitch) col = col.brg * 1.3; }
      vec2 c = (vUv - .5) * vec2(1., 1.25);
      col *= mix(1., smoothstep(.98, .28, length(c)), uVig * .85);
      col += (hash(vUv * uRes + uSeed * 91.7) - .5) * uGrain;
      col = mix(col, uFlashCol, clamp(uFlash, 0., 1.));
      gl_FragColor = vec4(col, 1.);
    }`,
});
composer.addPass(finalPass);

// ---------------------------------------------------------------- camera
const track = (t, keys) => {
  if (t <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, a] = keys[i], [tb, b] = keys[i + 1];
    if (t <= tb) { const k = E.inOut(seg(t, ta, tb)); const o = {}; for (const key in a) o[key] = lerp(a[key], b[key] ?? a[key], k); return o; }
  }
  return { ...keys[keys.length - 1][1] };
};
const base = { alt: 0, el: 90, az: 0, fov: 50, sx: 0, sy: 0, roll: 0, near: 0.02 };
// ?rig={...} pins the camera for stills (cover, profile picture)
const RIG_OVERRIDE = JSON.parse(new URLSearchParams(location.search).get('rig') || 'null');
function rigAt(t) {
  if (RIG_OVERRIDE) return { ...base, shot: 1, ...RIG_OVERRIDE };
  if (t < C.l2) {
    const k = E.outExpo(seg(t, 0, 1.7)), k2 = E.out(seg(t, 0, C.l2 + 0.5));
    return { ...base, shot: 1, lat: lerp(28, -30, k2), lon: lerp(25, -112, k2), dist: lerp(12, 4.15, k), sy: -0.03, roll: lerp(-28, -3, k), near: 0.05 };
  }
  if (t < C.l3) {
    const k = E.inOut(seg(t, C.l2, C.l3)), kp = E.out(seg(t, C.l2, C.l2 + 1.3));
    return { ...base, shot: 2, lat: lerp(-28, NEMO.lat, kp), lon: lerp(-104, NEMO.lon, kp), alt: 1, dist: lerp(2.5, 1.2, k), el: lerp(90, 72, k), az: lerp(-25, 0, k), sy: lerp(0, -0.05, k), roll: lerp(8, 0, k) };
  }
  if (t < C.sondern) {
    return { ...base, shot: 3, ...track(t, [
      [C.l3, { lat: NEMO.lat - 1.5, lon: NEMO.lon, alt: 1, dist: 1.8, el: 87, az: 0, sy: -0.035 }],
      [C.l4 - 0.1, { lat: NEMO.lat - 1.5, lon: NEMO.lon + 2.5, alt: 1, dist: 2.12, el: 80, az: 6, sy: -0.035 }],
      [C.sondern, { lat: NEMO.lat, lon: NEMO.lon, alt: 1, dist: 1.05, el: 34, az: ((trackAz + 155) % 360 + 540) % 360 - 180, sy: -0.03 }],
    ]) };
  }
  if (t < C.nur) return { ...base, shot: 4, mode: 'iss' };
  if (t < C.l5) {
    const k = E.inOut(seg(t, C.nur, C.l5));
    return { ...base, shot: 5, lat: NEMO.lat, lon: NEMO.lon, alt: 1, dist: lerp(0.47, 0.41, k), el: lerp(2.2, 0.6, k), az: trackAz + 90, sy: -0.13, near: 0.002 };
  }
  if (t < C.l6) {
    const k = E.inOut(seg(t, C.l5, C.l6));
    return { ...base, shot: 6, lat: NEMO.lat + 1.2, lon: NEMO.lon, alt: 1, dist: lerp(1.3, 1.02, k), el: lerp(57, 66, k), az: lerp(198, 180, k), sy: -0.05, roll: lerp(-5, 2, k), near: 0.01 };
  }
  if (t < C.l7) {
    const k = E.inOut(seg(t, C.l6, C.l7));
    return { ...base, shot: 7, lat: NEMO.lat, lon: NEMO.lon, alt: 1, dist: lerp(0.52, 0.45, k), el: lerp(3, 1.4, k), az: trackAz - 90, sy: -0.12, near: 0.002 };
  }
  const k = seg(t, C.l7, C.end);
  return { ...base, shot: 8, lat: lerp(-26, -33, k), lon: lerp(-152, -120, k), dist: lerp(5.0, 4.35, E.out(k)), sy: -0.05, roll: lerp(5, 0, E.out(k)), near: 0.05 };
}
const camRight = new V3(), camUp = new V3(), camBack = new V3();
const MB = { r: new V3(), u: new V3(), b: new V3() };
function applyRig(r, t) {
  if (r.mode === 'iss') {
    const th = -0.035 + (t - C.sondern) * 0.02;
    const b = issBasis(th), p = issPos(th);
    const ang = lerp(-58, 12, E.inOut(seg(t, C.sondern, C.nur))) * D2R;
    const off = b.fwd.clone().multiplyScalar(-Math.cos(ang) * 0.105).addScaledVector(b.right, Math.sin(ang) * 0.105).addScaledVector(b.up, 0.03);
    camera.position.copy(p).add(off);
    camera.up.copy(b.up);
    camera.lookAt(p.clone().addScaledVector(b.up, -0.008));
    camera.rotateZ(lerp(-6, 3, seg(t, C.sondern, C.nur)) * D2R);
    camera.fov = 44; camera.near = 0.002;
  } else {
    const f = localFrame(r.lat, r.lon);
    const T = f.U.clone().multiplyScalar(r.alt);
    const az = r.az * D2R, el = r.el * D2R;
    const Hh = f.N.clone().multiplyScalar(Math.cos(az)).addScaledVector(f.E, Math.sin(az));
    camera.position.copy(T).addScaledVector(f.U, r.dist * Math.sin(el)).addScaledVector(Hh, -r.dist * Math.cos(el));
    camera.up.copy(f.U).multiplyScalar(Math.cos(el)).addScaledVector(Hh, Math.sin(el));
    camera.lookAt(T);
    camera.rotateZ(r.roll * D2R);
    camera.fov = r.fov; camera.near = r.near;
  }
  // zoom punch after every cut
  let punch = 0;
  for (const c of CUTS) if (t >= c.t) punch = Math.max(punch, 0.1 * Math.exp(-(t - c.t) / 0.16));
  camera.fov *= 1 + punch;
  camera.setViewOffset(W, H, (r.sx || 0) * W, (r.sy || 0) * H, W, H);
  camera.updateProjectionMatrix();
}
function shakeAt(t) {
  let a = 0.02 * pulse(t, 0.02, 0.01, 0.35) + 0.04 * pulse(t, C.impact, 0.01, 0.55);
  for (const m of meteors) a += (m.big ? 0.012 : 0.005) * pulse(t, m.t0 + m.dur, 0.01, 0.18);
  for (const c of CUTS) a += 0.004 * pulse(t, c.t, 0.01, 0.12);
  return [a * (Math.sin(t * 61.3) + 0.6 * Math.sin(t * 37.1 + 1.3)), a * (Math.sin(t * 53.7 + 2.1) + 0.6 * Math.sin(t * 29.3))];
}

applyRig(rigAt(C.l5 + 2.5), C.l5 + 2.5);
camera.updateMatrixWorld();
camera.matrixWorld.extractBasis(MB.r, MB.u, MB.b);

// ---------------------------------------------------------------- UI (DOM overlay)
const $ = id => document.getElementById(id);
const ui = $('ui'), headEl = $('head'), capEl = $('cap'), chipsEl = $('chips'), labelsEl = $('labels'), ctaEl = $('cta'), handEl = $('hand'), liveEl = $('live');
const fmt = n => n.toLocaleString('de-DE');
const emo = s => s.replace(/(\p{Extended_Pictographic}️?)/gu, '<span style="-webkit-text-fill-color:initial">$1</span>');
const typed = (s, k) => s.slice(0, Math.round(s.length * clamp(k))) + (k > 0 && k < 1 ? '▌' : '');
const HEADS = [
  { t0: 0, t1: C.l2, html: () => '<div class="h1">DER EINSAMSTE<br><span class="big">ORT DER WELT</span></div>' },
  { t0: C.point, t1: C.l3, html: t => `<div class="h1 red"><span class="big">POINT NEMO</span></div><div class="h2">${typed('48°52′S · 123°23′W', seg(t, C.mitten - 0.4, C.mitten + 0.5))}&nbsp;</div>` },
  { t0: C.l3, t1: C.ueber, html: () => '<div class="h1">NÄCHSTES<br>LAND?</div>' },
  { t0: C.ueber, t1: C.l4, html: t => `<div class="h1"><span class="big">${fmt(Math.round(2688 * E.out(seg(t, C.ueber, C.weg + 0.25))))} KM</span></div><div class="h2${t > C.richtung ? ' red' : ''}">${t > C.richtung ? 'IN JEDE RICHTUNG' : 'BIS ZUM NÄCHSTEN LAND'}</div>` },
  { t0: C.l4, t1: C.sondern, html: t => `<div class="h1">NÄCHSTE<br>MENSCHEN?</div>${t > C.erde ? '<div class="h2 red">NICHT AUF DER ERDE ✕</div>' : ''}` },
  { t0: C.sondern, t1: C.nur, html: () => `<div class="h1"><span class="big">ISS</span> ${emo('🛰️')}</div><div class="h2">INTERNATIONALE RAUMSTATION</div>` },
  { t0: C.nur, t1: C.l5, html: t => `<div class="h1"><span class="big">NUR ${Math.round(400 * E.out(seg(t, C.nur, C.n400 + 0.4)))} KM</span></div><div class="h2">ÜBER DIR ↑</div>` },
  { t0: C.l5, t1: C.ueber2, html: () => '<div class="h1 red">RAUMSCHIFF-<br>FRIEDHOF</div>' },
  { t0: C.ueber2, t1: C.l6, html: t => `<div class="h1 red"><span class="big">${Math.round(lerp(wreckCount(C.ueber2), 260, E.out(seg(t, C.ueber2 + 0.1, C.ueber2 + 1.35))))}${t > C.ueber2 + 1.4 ? '+' : ''}</span></div><div class="h2 red">WRACKS AM MEERESGRUND</div>` },
  { t0: C.l6, t1: C.impact, html: () => `<div class="h1 red">${emo('⚠️')} BALD AUCH<br><span class="big">DIE ISS</span></div><div class="h2 red">GEPLANT: UM 2030</div>` },
  { t0: C.l7, t1: C.end + 1, html: t => `<div class="h1"><span class="big">FOLG MIR</span></div>${t > C.mehr - 0.05 ? `<div class="h2">FÜR MEHR VERRÜCKTE ORTE ${emo('🌍')}</div>` : ''}` },
];
const CHUNKS = [];
for (const L of TL.lines) {
  if (L.id === 7) continue;
  let cur = [];
  const flush = () => { if (cur.length) CHUNKS.push({ line: L.id, words: cur }); cur = []; };
  L.words.forEach((w, i) => {
    cur.push(w);
    const nx = L.words[i + 1];
    const chars = cur.map(x => x.w).join(' ').length;
    if (/[.?!,]$/.test(w.w) || cur.length >= 3 || (nx && chars + nx.w.length + 1 > (L.id === 1 ? 13 : 17))) flush();
  });
  flush();
}
CHUNKS.forEach((c, i) => {
  const nx = CHUNKS[i + 1], L = line(c.line);
  c.t0 = c.words[0].t0 - 0.05;
  c.t1 = nx ? (nx.line === c.line ? nx.words[0].t0 - 0.05 : Math.min(nx.words[0].t0 - 0.05, L.end + 0.3)) : L.end + 0.3;
  c.t1 = Math.min(c.t1, C.l7);
});

const labelEls = {};
function label(key, html, cls, x, y, k) {
  let el = labelEls[key];
  if (!el) { el = labelEls[key] = document.createElement('div'); labelsEl.appendChild(el); }
  if (k <= 0.001) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.className = 'lbl ' + (cls || '');
  const s = 0.6 + 0.4 * E.outBack(clamp(k));
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.opacity = clamp(k * 1.5);
  el.style.transform = `translate(-50%, -100%) scale(${s})`;
}
const toScreen = v => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }; };
function visibleFromCam(p) {
  const o = camera.position, d = p.clone().sub(o); const L = d.length(); d.divideScalar(L);
  const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c;
  if (disc < 0) return true;
  const t1 = -b - Math.sqrt(disc);
  return !(t1 > 0 && t1 < L);
}
const facing = v => v.clone().normalize().dot(camera.position.clone().sub(v)) > 0;
const win = (t, a, b, fi = 0.18, fo = 0.15) => Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));

let lastHead = -1, lastHeadHtml = '', lastCap = '';
function updateUI(t, shot) {
  // headline
  const hi = HEADS.findIndex(h => t >= h.t0 && t < h.t1);
  if (hi < 0) { headEl.style.opacity = 0; lastHead = -1; }
  else {
    const h = HEADS[hi], html = h.html(t);
    if (html !== lastHeadHtml) { headEl.innerHTML = html; lastHeadHtml = html; }
    lastHead = hi;
    const k = h.t0 === 0 ? 0.82 + 0.18 * E.outExpo(seg(t, 0, 0.25)) : E.outExpo(seg(t, h.t0, h.t0 + 0.3)), out = seg(t, h.t1 - 0.08, h.t1);
    headEl.style.opacity = clamp(k * 1.4) * (1 - out);
    headEl.style.transform = `scale(${lerp(1.35, 1, k)}) translateY(${out * -30}px)`;
    headEl.style.filter = `blur(${(1 - k) * 14}px) drop-shadow(0 0 26px ${html.includes('red') ? 'rgba(255,46,99,.55)' : 'rgba(62,232,255,.45)'}) drop-shadow(0 8px 10px rgba(0,0,0,.6))`;
  }
  // captions
  const ch = CHUNKS.find(c => t >= c.t0 && t < c.t1);
  if (!ch) { capEl.innerHTML = ''; lastCap = ''; }
  else {
    capEl.className = ch.line === 1 ? 'hero' : '';
    const enter = E.outBack(seg(t, ch.t0, ch.t0 + 0.16));
    const html = ch.words.map((w, i) => {
      const nx = ch.words[i + 1];
      const on = t >= w.t0 - 0.03 && (nx ? t < nx.t0 - 0.03 : true);
      const s = on ? 1 + (w.em ? 0.08 : 0.05) * E.outBack(seg(t, w.t0 - 0.03, w.t0 + 0.1)) : 1;
      const txt = w.w.replace(/[.,]$/, '');
      return `<span class="cw${on ? ' on' : ''}${w.em ? ' em' : ''}" style="transform:scale(${s.toFixed(3)})">${txt}</span>`;
    }).join(' ');
    if (html !== lastCap) { capEl.innerHTML = html; lastCap = html; }
    capEl.style.transform = `scale(${lerp(0.75, 1, enter).toFixed(3)})`;
    capEl.style.opacity = clamp(seg(t, ch.t0, ch.t0 + 0.06));
  }
  // chips (400 km comparison)
  const ck = win(t, C.n400 + 0.25, C.l5);
  chipsEl.style.opacity = ck;
  chipsEl.style.transform = `translateY(${(1 - E.out(ck)) * 30}px)`;
  if (ck > 0 && !chipsEl.innerHTML) chipsEl.innerHTML = `<div class="chip bad"><small>NÄCHSTES LAND</small>${emo('🏝️')} 2.688 KM</div><div class="chip good"><small>RAUMSTATION</small>${emo('🛰️')} 400 KM</div>`;
  // live readout
  liveEl.innerHTML = t < C.point ? '<i></i>LIVE' : `<i></i>48°52′S 123°23′W`;
  liveEl.style.opacity = 0.65 + 0.35 * Math.sin(t * 6) ** 2;

  // 3D-anchored labels
  const nemoS = toScreen(nemo);
  const nemoVis = facing(nemo);
  let nk = 0, ntext = '📍 POINT NEMO', ncls = 'red';
  if (shot === 2) nk = seg(t, C.drop + 0.25, C.drop + 0.55);
  if (shot === 3) nk = 1 - seg(t, C.l4 + 0.6, C.l4 + 0.9);
  if (shot === 5) { nk = seg(t, C.nur + 0.4, C.nur + 0.7); ntext = '🧍 DU BIST HIER'; }
  if (shot === 6) nk = seg(t, C.l5 + 0.3, C.l5 + 0.6);
  const nOff = shot === 5 ? [-170, 10] : [0, -34];
  label('nemo', emo(ntext), ncls, nemoS.x + nOff[0], nemoS.y + nOff[1], nemoVis ? nk : 0);
  arcs.forEach((a, i) => {
    const s = toScreen(a.to);
    const k = shot === 3 ? Math.min(seg(t, a.t0 + a.dur - 0.05, a.t0 + a.dur + 0.25), 1 - seg(t, C.l4 + 0.4, C.l4 + 0.7)) : 0;
    const dy = a.isl.lat < NEMO.lat ? 90 : -26;
    label('isl' + i, `${a.isl.name}<small>${a.isl.sub}</small>`, '', clamp(s.x + [-110, 150, 0][i], 190, 890), s.y + dy + [0, 30, 0][i], facing(a.to) ? k : 0);
  });
  // ISS label in the approach shot
  if (shot === 3) {
    const th = (t - (C.sondern + 0.25)) * 0.22;
    const p = issPos(th), s = toScreen(p);
    label('iss', emo('🛰️ ISS'), '', s.x, s.y - 40, visibleFromCam(p) && s.z < 1 ? seg(t, C.l4 + 1.2, C.l4 + 1.5) : 0);
  } else label('iss', '', '', 0, 0, 0);
  if (shot === 5) {
    const top = toScreen(nemo.clone().multiplyScalar(ISS_R * 0.5 + 0.5));
    label('m400', '400 KM', '', top.x + 120, top.y + 30, seg(t, C.n400, C.n400 + 0.25));
  } else label('m400', '', '', 0, 0, 0);
  if (shot === 6) {
    const m = meteors[MIR_IDX], s = toScreen(m.hit);
    label('mir', `MIR <small>Raumstation · 2001 · 130 t</small>`, 'red', s.x, s.y - 50, win(t, m.t0 + m.dur, m.t0 + m.dur + 1.8));
  } else label('mir', '', '', 0, 0, 0);

  // CTA
  const ca = seg(t, C.l7 + 0.1, C.l7 + 0.45);
  if (ca > 0) {
    const done = t >= C.tap + 0.05;
    const html = `<div class="avatar">🌍<div class="plus${done ? ' done' : ''}">${done ? '✓' : '+'}</div></div><div class="btn${done ? ' done' : ''}">${done ? 'GEFOLGT ✓' : 'FOLGEN'}</div>${t > C.tap + 0.45 ? '<div class="next">👇 Welcher Ort als Nächstes?</div>' : ''}`;
    if (ctaEl.dataset.html !== html) { ctaEl.innerHTML = html; ctaEl.dataset.html = html; }
    const tapPop = pulse(t, C.tap, 0.05, 0.12);
    ctaEl.style.opacity = clamp(ca * 1.5);
    ctaEl.style.transform = `scale(${(E.outBack(ca) * (1 + 0.04 * Math.sin(t * 9) * (done ? 0 : 1)) - tapPop * 0.06).toFixed(3)})`;
  } else { ctaEl.style.opacity = 0; ctaEl.innerHTML = ''; ctaEl.dataset.html = ''; }
  const hk = seg(t, C.l7 + 0.55, C.tap - 0.05), hout = seg(t, C.tap + 0.35, C.tap + 0.6);
  if (t > C.l7 + 0.55 && hout < 1) {
    const x = lerp(820, 572, E.inOut(hk)), y = lerp(1700, 1262, E.inOut(hk));
    const press = pulse(t, C.tap - 0.02, 0.05, 0.1);
    handEl.style.display = 'block';
    handEl.style.left = x + 'px'; handEl.style.top = y + 'px';
    handEl.style.opacity = 1 - hout;
    handEl.style.transform = `scale(${1 - press * 0.15})`;
  } else handEl.style.display = 'none';

  // whole-UI shake / whip
  const [sx, sy] = shakeAt(t);
  let wb = 0, wd = [0, 1];
  for (const c of CUTS) { const d = t - c.t; const w = d < 0 ? Math.exp(-((d / 0.06) ** 2)) : Math.exp(-((d / 0.1) ** 2)); if (w > wb) { wb = w; wd = c.dir; } }
  ui.style.transform = `translate(${(sx * 900 + wd[0] * wb * 40).toFixed(1)}px, ${(sy * 900 + wd[1] * wb * 40).toFixed(1)}px)`;
  ui.style.filter = wb > 0.05 ? `blur(${(wb * 6).toFixed(1)}px)` : 'none';
}

// ---------------------------------------------------------------- per-frame state
const SUN = { 1: [-0.55, 0.38, 0.75], 2: [-0.5, 0.45, 0.75], 3: [-0.5, 0.45, 0.75], 4: [-0.65, 0.55, 0.5], 5: [-0.55, 0.5, 0.65], 6: [0.75, 0.35, 0.55], 7: [-0.55, 0.5, 0.65], 8: [-0.55, 0.38, 0.75] };
const tmpQ = new THREE.Quaternion();
function placeTrail(pts, posAt, headP, spacing) {
  const a = pts.geometry.attributes.position;
  for (let k = 0; k < a.count; k++) { const p = posAt(Math.max(0, headP - k * spacing)); a.setXYZ(k, p.x, p.y, p.z); }
  a.needsUpdate = true;
}

function renderAt(t) {
  const r = rigAt(t);
  const shot = r.shot;
  applyRig(r, t);
  const [shx, shy] = shakeAt(t);
  camera.rotateX(shx); camera.rotateY(shy);
  camera.updateMatrixWorld();
  camera.matrixWorld.extractBasis(camRight, camUp, camBack);
  const sd = SUN[shot];
  const sunDir = camRight.clone().multiplyScalar(sd[0]).addScaledVector(camUp, sd[1]).addScaledVector(camBack, sd[2]).normalize();
  U.sunDir.value.copy(sunDir);
  sun.position.copy(sunDir);
  U.time.value = t;
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  for (const p of [stars, dust, wrecks, issTrail, debris, ...meteors.map(m => m.trail)]) p.material.uniforms.uTime.value = t;
  const pxScale = H / (2 * Math.tan((camera.fov * D2R) / 2));
  for (const p of [dust, wrecks, issTrail, debris, ...meteors.map(m => m.trail)]) p.material.uniforms.uScale.value = pxScale;
  dust.visible = !RIG_OVERRIDE;  // a near-camera speck reads as a blemish in stills
  stars.material.uniforms.uOpacity.value = shot === 4 || shot === 5 || shot === 7 ? 0.6 : 1;

  // holographic overlay / mood per shot
  const hud = shot === 2 ? seg(t, C.drop, C.drop + 0.5) : shot === 3 ? 1 - 0.6 * seg(t, C.l4, C.l4 + 1) : shot === 6 ? 0.35 : shot === 8 ? 0.4 : shot === 1 ? 0.25 : 0;
  U.hud.value = hud;
  coastMat.opacity = hud * 0.55; borderMat.opacity = hud * 0.3;
  U.mood.value = shot === 6 ? 0.35 : shot === 7 ? 0.25 : 0;
  clouds.visible = true;
  cloudMat.uniforms.opacity.value = shot === 3 || shot === 6 ? 0.55 : 0.85;

  // zone of 2.688 km
  if (shot === 3) { U.zoneR.value = ZONE_R * E.out(seg(t, C.richtung - 0.1, C.richtung + 0.7)); U.zoneA.value = 1 - 0.45 * seg(t, C.l4, C.l4 + 1); }
  else if (shot === 6) { U.zoneR.value = ZONE_R; U.zoneA.value = 0.1; }
  else if (shot === 8) { U.zoneR.value = ZONE_R; U.zoneA.value = 0.45; }
  else { U.zoneA.value = 0; }

  // marker
  const mVis = t >= C.drop && shot !== 4;
  marker.visible = mVis;
  nemoGlow.visible = mVis && facing(nemo);  // drawn without depth test, so hide it on the far side
  if (mVis) {
    const camD = camera.position.distanceTo(nemo);
    const ms = clamp(camD / 1.5, 0.22, 2.6);
    marker.scale.setScalar(ms);
    const dk = seg(t, C.drop, C.drop + 0.45);
    beam.scale.set(0.0018, 0.0018, lerp(0.6, 0.07, E.out(dk)));
    beamMat.uniforms.uOpacity.value = 0.6 + 0.8 * pulse(t, C.drop, 0.02, 0.4);
    pulses.forEach((p, i) => {
      const ph = (((t - C.drop) * 0.85 + i / 3) % 1 + 1) % 1;
      p.scale.setScalar(0.004 + ph * 0.05);
      p.material.opacity = Math.pow(1 - ph, 2) * seg(t, C.drop, C.drop + 0.3);
    });
    const rk = seg(t, C.drop, C.drop + 0.8);
    dropRing.scale.setScalar(0.005 + E.out(rk) * 0.14);
    dropRing.material.opacity = (1 - rk) * (rk > 0 ? 1 : 0);
    dot.scale.setScalar(0.0035 * (1 + 0.25 * Math.sin(t * 8)));
    nemoGlow.position.copy(nemo.clone().multiplyScalar(1.002));
    nemoGlow.scale.setScalar(0.035 * ms * (1 + 1.5 * pulse(t, C.drop, 0.02, 0.3)));
  }

  // arcs
  for (const a of arcs) {
    const k = shot === 3 ? E.inOut(seg(t, a.t0, a.t0 + a.dur)) : 0;
    const fade = shot === 3 ? 1 - 0.7 * seg(t, C.l4 + 0.3, C.l4 + 1.2) : 0;
    a.mesh.visible = k > 0;
    a.mesh.geometry.setDrawRange(0, Math.floor((k * a.n) / 36) * 36);
    a.mesh.material.opacity = fade;
    a.head.visible = k > 0 && k < 1;
    if (a.head.visible) a.head.position.copy(a.curve.getPoint(k));
    a.end.visible = k >= 1;
    a.end.position.copy(a.to.clone().multiplyScalar(1.003));
    a.end.scale.setScalar(0.035 * (1 + 0.3 * Math.sin(t * 7)) * (1 + 2 * pulse(t, a.t0 + a.dur, 0.02, 0.25)));
    a.end.material.opacity = fade;
  }

  // ISS
  let issOn = false, th = 0, issScale = 0.045, heat = 0;
  if (shot === 3) { th = (t - (C.sondern + 0.25)) * 0.22; issOn = t > C.l4 + 0.3; issScale = 0.065; }
  if (shot === 4) { th = -0.035 + (t - C.sondern) * 0.02; issOn = true; }
  if (shot === 5) { th = (t - (C.n400 + 0.12)) * 0.035; issOn = true; issScale = 0.05; }
  orbitMat.uniforms.uOpacity.value = shot === 3 ? seg(t, C.l4 + 0.5, C.l4 + 1.4) * 0.9 : shot === 5 ? 0.5 : 0;
  orbitMat.uniforms.uTime.value = t;
  measureMat.uniforms.uOpacity.value = shot === 5 ? seg(t, C.nur + 0.2, C.nur + 0.4) : 0;
  const mk = E.out(seg(t, C.nur + 0.2, C.n400 + 0.2));
  measure.scale.set(0.0007, (ISS_R - 1) * Math.max(mk, 0.001), 0.0007);
  let issP = issPos(th), issB = issBasis(th);
  if (shot === 7) {
    const s = Math.pow(seg(t, C.l6 + 0.05, C.impact), 1.9);
    const th0 = -0.085;
    const pathAt = q => { const a = th0 * (1 - q); const rr = lerp(ISS_R, 1.0, Math.pow(q, 1.3)); return issPos(a, rr); };
    issOn = t < C.impact;
    issP = pathAt(s);
    issB = issBasis(th0 * (1 - s));
    issScale = 0.04;
    heat = clamp(s * 1.4);
    issTrail.visible = issOn && s > 0.02;
    if (issTrail.visible) placeTrail(issTrail, pathAt, s, 0.003 + 0.006 * s);
    issTrail.material.uniforms.uOpacity.value = clamp(heat * 1.5);
    // debris after impact
    const dk = t - C.impact;
    debris.visible = dk > 0 && dk < 1.4;
    if (debris.visible) {
      const a = debris.geometry.attributes.position;
      debrisDirs.forEach((d, i) => {
        const tt = dk * (0.6 + d.d * 0.8);
        const p = nemo.clone().multiplyScalar(1 + d.up * tt - 0.25 * tt * tt * 0.6).addScaledVector(d.v, tt * 1.4);
        a.setXYZ(i, p.x, p.y, p.z);
      });
      a.needsUpdate = true;
      debris.material.uniforms.uOpacity.value = 1 - seg(dk, 0.4, 1.4);
    }
    const fk = t - C.impact;
    bigFlash.visible = fk > 0;
    bigFlash.position.copy(nemo.clone().multiplyScalar(1.01));
    bigFlash.scale.setScalar(fk > 0 ? 0.04 + 0.35 * E.outExpo(seg(fk, 0, 0.5)) : 0.001);
    bigFlash.material.opacity = fk > 0 ? Math.exp(-fk / 0.35) : 0;
    U.shockR.value = 0.32 * E.out(seg(fk, 0, 1.1));
    U.shockA.value = fk > 0 ? Math.exp(-fk / 0.5) : 0;
  } else { issTrail.visible = false; debris.visible = false; bigFlash.visible = false; U.shockA.value = 0; }
  iss.visible = issOn;
  if (issOn) {
    iss.position.copy(issP);
    iss.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(issB.right, issB.up, issB.fwd));
    if (shot === 7) { tmpQ.setFromAxisAngle(new V3(0.3, 1, 0.2).normalize(), 1.1 + heat * heat * 1.4); iss.quaternion.multiply(tmpQ); }
    if (shot === 5) { tmpQ.setFromEuler(new THREE.Euler(0.35, 1.25, 0)); iss.quaternion.multiply(tmpQ); }
    iss.scale.setScalar(issScale);
    earthShine.position.copy(issP.clone().normalize().negate());
  }
  issGlow.visible = issOn && (shot !== 4);
  issGlow.position.copy(issP);
  issGlow.material.color.copy(heat > 0 ? hdr(4, 1.6, 0.5).multiplyScalar(0.25 + heat * 0.7) : hdr(1.2, 1.6, 2.2));
  issGlow.scale.setScalar(heat > 0 ? 0.012 + heat * 0.03 : shot === 5 ? 0.012 : issScale * 0.9);
  issBlinkR.visible = issOn && shot !== 7;
  issBlinkR.position.copy(issP.clone().addScaledVector(issB.right, issScale * 0.5));
  issBlinkR.scale.setScalar((shot === 4 ? 0.004 : 0.012) * (Math.sin(t * 9) > 0.6 ? 1 : 0.2));

  // meteors & wrecks
  for (const m of meteors) {
    const start = m.hit.clone().addScaledVector(MB.u, 0.9 * m.len).addScaledVector(MB.r, (-0.45 + m.side * 0.5) * m.len).addScaledVector(MB.b, 0.3 * m.len);
    const pathAt = q => start.clone().lerp(m.hit, q).normalize().multiplyScalar(lerp(start.length(), 1.0, q));
    const p = (t - m.t0) / m.dur;
    const live = shot === 6 && p > 0 && p < 1.35;
    m.trail.visible = live;
    if (live) {
      const q = Math.pow(clamp(p), 1.35);
      placeTrail(m.trail, pathAt, q, m.big ? 0.009 : 0.0075);
      m.trail.material.uniforms.uOpacity.value = p < 1 ? 1 : 1 - seg(p, 1, 1.35);
    }
    const fk = t - (m.t0 + m.dur);
    m.flash.visible = shot === 6 && fk > 0 && fk < 0.8;
    m.flash.position.copy(m.hit.clone().multiplyScalar(1.004));
    m.flash.scale.setScalar((m.big ? 0.12 : 0.06) * E.outExpo(seg(fk, 0, 0.12)));
    m.flash.material.opacity = Math.exp(-Math.max(fk, 0) / 0.18);
    m.ring.visible = shot === 6 && fk > 0 && fk < 0.9;
    m.ring.scale.setScalar(0.004 + (m.big ? 0.09 : 0.045) * E.out(seg(fk, 0, 0.8)));
    m.ring.material.opacity = 1 - seg(fk, 0, 0.9);
  }
  wrecks.visible = shot === 6 || shot === 8;
  wrecks.material.uniforms.uOpacity.value = shot === 6 ? 1 : 0.6;

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
  flash = Math.max(flash, 0.25 * Math.exp(-t / 0.08));
  flash = Math.max(flash, 0.35 * pulse(t, C.drop, 0.02, 0.1));
  const ik = t - C.impact;
  if (ik > 0) { flash = Math.max(flash, 0.95 * Math.exp(-ik / 0.18)); ca += 3 * Math.exp(-ik / 0.4); if (ik < 0.35) glitch = Math.max(glitch, 1 - ik / 0.35); }
  for (const m of meteors) if (m.big) ca += 1.5 * pulse(t, m.t0 + m.dur, 0.01, 0.2);
  const fu = finalPass.uniforms;
  fu.uBlur.value.set(wd[0] * wb * 0.06, wd[1] * wb * 0.09);
  fu.uGlitch.value = glitch;
  fu.uSeed.value = Math.floor(t * 30) * 0.731 % 17;
  fu.uFlash.value = flash;
  fu.uFlashCol.value.set(1, ik > 0 ? 0.92 : 1, ik > 0 ? 0.85 : 1);
  fu.uCA.value = ca;
  bloom.strength = 0.85 + (shot === 6 || shot === 7 ? 0.2 : 0);
  atmoMat.uniforms.intensity.value = camera.position.length() < 1.17 ? 0.7 : 1;

  composer.render();
  updateUI(t, shot);
}

// ---------------------------------------------------------------- audio cue sheet for the mixer
const EVENTS = [
  { t: 0, type: 'hit' }, { t: 0, type: 'glitch' },
  ...CUTS.map(c => ({ t: c.t, type: 'whoosh' })),
  { t: C.drop, type: 'ping' },
  ...arcs.map(a => ({ t: a.t0, type: 'zip', dur: a.dur })),
  ...arcs.map(a => ({ t: a.t0 + a.dur, type: 'blip' })),
  { t: C.ueber, type: 'count', dur: C.weg + 0.25 - C.ueber },
  { t: C.richtung - 0.1, type: 'sweep' },
  { t: C.l4 + 1.2, type: 'quindar' },
  { t: C.sondern, type: 'flyby' },
  { t: C.nur, type: 'count', dur: C.n400 + 0.4 - C.nur },
  { t: C.n400 + 0.25, type: 'blip' },
  ...meteors.map(m => ({ t: m.t0, type: 'meteor', dur: m.dur, big: m.big })),
  { t: C.ueber2 + 0.1, type: 'count', dur: 1.3 },
  { t: C.l6 + 0.2, type: 'riser', dur: C.impact - C.l6 - 0.2 },
  { t: C.impact, type: 'boom' },
  { t: C.l7 + 0.1, type: 'pop' },
  { t: C.tap, type: 'tap' },
  { t: C.tap + 0.45, type: 'pop' },
];
window.renderAt = renderAt;
window.projectLL = (lat, lon) => toScreen(ll(lat, lon));
window.EVENTS = EVENTS;
window.CUES = C;
await Promise.all(['138px Anton', '900 82px Inter', '800 30px Inter', '700 26px "DejaVu Sans Mono"'].map(f => document.fonts.load(f)));
await document.fonts.ready;
renderAt(0.5);
renderAt(0);
window.ready = true;
