// 3D-Vorschau des Butterfly-Messers: baut die Minecraft-Modelle (Elemente, UVs, Drehungen)
// genau wie das Spiel nach und zeigt sie in der Hand, im Inventar, in der 3. Person oder frei drehbar.
import * as THREE from 'three';

const FACE_VERTS = {
  down: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  up: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  north: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
  south: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
  west: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
  east: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]],
};
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/** Minecraft-Elemente -> BufferGeometry (Koordinaten in Blöcken, 0…1). */
export function buildGeometry(elements) {
  const pos = [], uv = [], nor = [], emi = [], idx = [];
  for (const el of elements) {
    const r = el.rotation;
    const q = r ? new THREE.Quaternion().setFromAxisAngle(AXES[r.axis], THREE.MathUtils.degToRad(r.angle)) : null;
    const origin = r ? new THREE.Vector3(...r.origin) : null;
    const e = (el.light_emission || 0) / 15;
    for (const [face, f] of Object.entries(el.faces)) {
      const [u0, v0, u1, v1] = f.uv;
      const corners = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
      const shift = ((f.rotation || 0) / 90) | 0;
      const base = pos.length / 3;
      const pts = FACE_VERTS[face].map((c) => {
        const p = new THREE.Vector3(c[0] ? el.to[0] : el.from[0], c[1] ? el.to[1] : el.from[1], c[2] ? el.to[2] : el.from[2]);
        if (q) p.sub(origin).applyQuaternion(q).add(origin);
        return p;
      });
      const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[0])).normalize();
      pts.forEach((p, i) => {
        pos.push(p.x / 16, p.y / 16, p.z / 16);
        const [cu, cv] = corners[(i + shift) % 4];
        uv.push(cu / 16, 1 - cv / 16);
        nor.push(n.x, n.y, n.z);
        emi.push(e);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('emission', new THREE.Float32BufferAttribute(emi, 1));
  g.setIndex(idx);
  return g;
}

/** Material mit Minecraft-Licht: zwei feste Lichtrichtungen, 40 % Grundlicht, Leucht-Elemente. */
export function knifeMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      sky: { value: 1.0 },
      guiFlat: { value: 0.0 },
      L0: { value: new THREE.Vector3(0.2, 1.0, -0.7).normalize() },
      L1: { value: new THREE.Vector3(-0.2, 1.0, 0.7).normalize() },
    },
    vertexShader: `
      attribute float emission;
      varying vec2 vUv; varying vec3 vN; varying float vE;
      void main() {
        vUv = uv; vE = emission;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float sky; uniform float guiFlat; uniform vec3 L0; uniform vec3 L1;
      varying vec2 vUv; varying vec3 vN; varying float vE;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.1) discard;
        vec3 n = normalize(vN);
        float d = min(1.0, (max(0.0, dot(L0, n)) + max(0.0, dot(L1, n))) * 0.6 + 0.4);
        float df = 0.55 + 0.45 * abs(n.z) + 0.15 * max(0.0, n.y);
        d = mix(d, min(1.0, df), guiFlat);
        float light = max(sky, vE);
        gl_FragColor = vec4(t.rgb * d * light, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.FrontSide,
  });
}

export function loadTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    });
  });
}

/** Anzeige-Transformation eines Kontexts (wie ItemTransform.apply in Minecraft). */
export function displayMatrix(tr) {
  const m = new THREE.Matrix4();
  if (!tr) return m;
  const t = tr.translation || [0, 0, 0], r = tr.rotation || [0, 0, 0], s = tr.scale || [1, 1, 1];
  m.makeTranslation(t[0] / 16, t[1] / 16, t[2] / 16);
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r.map(THREE.MathUtils.degToRad), 'XYZ'));
  m.multiply(rot).multiply(new THREE.Matrix4().makeScale(...s));
  return m;
}

/** Item-Gruppe: Anzeige-Transformation + Verschiebung um −0.5 (Modellmitte). */
export function itemObject(geometry, material, transform) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(transform).multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5));
  return mesh;
}

/** Spieler (Steve-Farben) für die 3.-Person-Ansicht; gibt die Gruppe der rechten Hand zurück. */
export function playerRig(scene) {
  const root = new THREE.Group();
  root.scale.set(-1, -1, 1);
  root.position.y = 1.501;
  scene.add(root);
  const box = (parent, from, to, color) => {
    const g = new THREE.BoxGeometry((to[0] - from[0]) / 16, (to[1] - from[1]) / 16, (to[2] - from[2]) / 16);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
    m.position.set((from[0] + to[0]) / 32, (from[1] + to[1]) / 32, (from[2] + to[2]) / 32);
    parent.add(m);
    return m;
  };
  const part = (pivot, rot) => {
    const g = new THREE.Group();
    g.position.set(pivot[0] / 16, pivot[1] / 16, pivot[2] / 16);
    g.quaternion.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'ZYX'));
    root.add(g);
    return g;
  };
  box(part([0, 0, 0], [0, 0, 0]), [-4, -8, -4], [4, 0, 4], 0xc69c78);          // Kopf
  box(part([0, 0, 0], [0, 0, 0]), [-4, 0, -2], [4, 12, 2], 0x2fb0b8);          // Körper
  box(part([1.9, 12, 0], [0, 0, 0]), [-2, 0, -2], [2, 12, 2], 0x3b4fa8);       // Bein L
  box(part([-1.9, 12, 0], [0, 0, 0]), [-2, 0, -2], [2, 12, 2], 0x3b4fa8);      // Bein R
  box(part([5, 2, 0], [0, 0, 0]), [-1, -2, -2], [3, 10, 2], 0xc69c78);         // Arm L
  const arm = part([-5, 2, 0], [-0.31415927, 0, 0]);                           // Arm R (hält Item)
  box(arm, [-3, -2, -2], [1, 10, 2], 0xc69c78);
  const hand = new THREE.Group();
  hand.matrixAutoUpdate = false;
  hand.matrix.makeRotationX(-Math.PI / 2)
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(-1 / 16, 0.125, -0.625));
  arm.add(hand);
  return hand;
}

export function firstPersonMatrix(display) {
  return new THREE.Matrix4().makeTranslation(0.56, -0.52, -0.72).multiply(displayMatrix(display.firstperson_righthand));
}
