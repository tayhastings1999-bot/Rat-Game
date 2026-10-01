// Low-poly vertex-coloured creature models, merged into one geometry each so
// they can be drawn with instancing. Every entry has a lit `body` and an
// unlit `glow` part (eyes, mouths, lights).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, PI2 } from '../core/util.js';
import { furTex } from './textures.js';
import { ps1 } from './ps1.js';

const V3 = THREE.Vector3;
const EU = new THREE.Euler(), QU = new THREE.Quaternion(), M4 = new THREE.Matrix4();

/** Transform a primitive and bake a flat vertex colour into it. */
export function prt(geo, col, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  M4.compose(new V3(...p), QU.setFromEuler(EU.set(...r)), new V3(...s));
  geo.applyMatrix4(M4);
  const c = new THREE.Color(col), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  // Every vertex remembers its part's centre and top, so rig.js can give
  // whole parts (a leg, an ear, a wing) to one bone and swing them rigidly.
  geo.computeBoundingBox();
  const bb = geo.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const pc = new Float32Array(n * 3), pt = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pc.set([cx, cy, cz], i * 3); pt.set([cx, bb.max.y, cz], i * 3); }
  geo.setAttribute('pc', new THREE.BufferAttribute(pc, 3));
  geo.setAttribute('pt', new THREE.BufferAttribute(pt, 3));
  return geo;
}
// PS1-era budgets: spheres and cylinders are capped at a handful of segments.
export const Sp = (r, w = 6, h = 4) => new THREE.SphereGeometry(r, Math.min(w, 6), Math.min(h, 4));
export const Bx = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const Cy = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, Math.min(s, 6));
export const Co = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
const To = (r, t, a) => new THREE.TorusGeometry(r, t, 3, 7, a);

function spikes(n, col, cx, cy, cz, rx, ry, rz, len, w, seed) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const out = [], up = new V3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const th = rnd() * TAU, ph = rnd() * 1.25;
    const nv = new V3(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th) - 0.25).normalize();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, nv));
    out.push(prt(Co(w, len * (0.7 + rnd() * 0.6), 4), col, [cx + nv.x * rx, cy + nv.y * ry, cz + nv.z * rz], [e.x, e.y, e.z]));
  }
  return out;
}
function maw(x, y, z, s = 1) {
  const p = [prt(Sp(0.16 * s, 6, 4), 0x9a0e0e, [x, y, z], [0, 0, 0], [1, 0.62, 0.5])];
  for (let i = -2; i <= 2; i++) {
    p.push(prt(Co(0.026 * s, 0.1 * s, 3), 0xefe6d2, [x + i * 0.055 * s, y + 0.07 * s, z + 0.04 * s], [Math.PI, 0, 0]));
    p.push(prt(Co(0.026 * s, 0.09 * s, 3), 0xefe6d2, [x + i * 0.055 * s, y - 0.07 * s, z + 0.04 * s]));
  }
  return p;
}
const eyes = (pts, col, r = 0.055) => pts.map(q => prt(Sp(r, 5, 4), col, q));
const MG = g => mergeGeometries(g);

/** A small crouched rat, used for the Rat King's tangled bodies. */
function kingRat(ang, dist, y, s, col) {
  const sx = Math.sin(ang), cz = Math.cos(ang), px = sx * dist, pz = cz * dist, r = [0, ang, 0];
  const at = (f, u = 0) => [px + sx * f, y + u, pz + cz * f];
  return [
    prt(Sp(0.42 * s, 7, 5), col, at(0), r, [0.8, 0.7, 1.4]),
    prt(Sp(0.26 * s, 7, 5), col, at(0.62 * s, 0.12 * s), r),
    prt(Co(0.14 * s, 0.4 * s, 5), col, at(0.95 * s, 0.08 * s), [PI2, ang, 0]),
    ...[-1, 1].map(k => prt(Cy(0.11 * s, 0.11 * s, 0.03, 7), 0xb0786c, [px + sx * 0.6 * s + cz * k * 0.16 * s, y + 0.34 * s, pz + cz * 0.6 * s - sx * k * 0.16 * s], [PI2, ang, 0])),
    ...[0, 1, 2, 3, 4].map(i => prt(Co(0.05 * s, 0.3 * s, 4), 0xc9a860, at(0.3 * s - i * 0.18 * s, 0.3 * s), [-1.1, ang, 0])),
  ];
}

export const GEO = {
  mawling: {
    body: MG([
      prt(Sp(0.42, 8, 6), 0x2e2434, [0, 0.42, 0], [0, 0, 0], [1, 0.85, 1.1]),
      ...spikes(16, 0x1c1622, 0, 0.46, -0.05, 0.4, 0.36, 0.46, 0.32, 0.07, 3),
      ...[-1, 1].flatMap(s => [prt(Co(0.05, 0.18, 4), 0xd8d0c0, [s * 0.22, 0.06, 0.34], [PI2, 0, 0]), prt(Co(0.05, 0.18, 4), 0xd8d0c0, [s * 0.24, 0.06, -0.2], [PI2, 0, 0])]),
      prt(To(0.2, 0.045, Math.PI * 1.6), 0x3a2c3e, [0, 0.62, -0.55], [0, PI2, 0]),
      prt(To(0.12, 0.035, Math.PI * 1.6), 0x3a2c3e, [0, 0.82, -0.72], [0, PI2, 0]),
    ]),
    glow: MG([...maw(0, 0.34, 0.45, 1.3), ...eyes([[-0.15, 0.58, 0.36], [0.15, 0.58, 0.36]], 0xff3020)]),
  },
  tick: {
    body: MG([
      prt(Sp(0.34, 8, 6), 0x6a1616, [0, 0.4, -0.28], [0, 0, 0], [1, 0.8, 1.25]),
      prt(Sp(0.22, 7, 5), 0x3a0c0c, [0, 0.32, 0.16]),
      ...eyes([[-0.13, 0.62, -0.3], [0.13, 0.62, -0.36], [0, 0.66, -0.12]], 0x1a0606, 0.08),
      ...[-1, 1].flatMap(s => [0, 1, 2, 3].flatMap(k => {
        const z = 0.2 - k * 0.16, ya = s * (k - 1.5) * 0.35;
        return [prt(Bx(0.55, 0.05, 0.05), 0x2a0808, [s * 0.32, 0.46, z], [0, ya, s * 0.55]), prt(Bx(0.55, 0.05, 0.05), 0x2a0808, [s * 0.7, 0.24, z - s * ya * 0.25], [0, ya, -s * 0.9])];
      })),
    ]),
    glow: MG([
      ...eyes([[-0.07, 0.38, 0.36], [0.07, 0.38, 0.36], [-0.14, 0.33, 0.33], [0.14, 0.33, 0.33], [-0.04, 0.45, 0.33], [0.04, 0.45, 0.33]], 0xff2a2a, 0.045),
      prt(Co(0.03, 0.13, 3), 0xefe6d2, [-0.05, 0.22, 0.36], [Math.PI, 0, 0]),
      prt(Co(0.03, 0.13, 3), 0xefe6d2, [0.05, 0.22, 0.36], [Math.PI, 0, 0]),
    ]),
  },
  ghoul: {
    body: MG([
      prt(Sp(0.62, 8, 6), 0x2a2028, [0, 0.82, 0], [-0.2, 0, 0], [0.9, 0.85, 1.35]),
      prt(Sp(0.5, 7, 5), 0x221a22, [0, 1.1, -0.25]),
      prt(Sp(0.36, 7, 5), 0x2a2028, [0, 0.92, 0.85], [0, 0, 0], [1.05, 0.95, 1.1]),
      ...spikes(24, 0x15101a, 0, 1.02, -0.1, 0.55, 0.55, 0.8, 0.44, 0.09, 7),
      ...[-1, 1].flatMap(s => [
        prt(Cy(0.1, 0.07, 0.7, 5), 0x1c151c, [s * 0.4, 0.35, 0.62], [0.3, 0, 0]),
        prt(Cy(0.11, 0.08, 0.7, 5), 0x1c151c, [s * 0.44, 0.35, -0.6], [-0.3, 0, 0]),
        ...[-1, 0, 1].map(k => prt(Co(0.035, 0.2, 3), 0xd8d0c0, [s * 0.4 + k * 0.06, 0.05, 0.86], [PI2, 0, 0])),
      ]),
      prt(To(0.32, 0.07, Math.PI * 1.7), 0x2a2028, [0, 1.05, -1.28], [0, PI2, 0]),
      prt(To(0.2, 0.05, Math.PI * 1.6), 0x2a2028, [0.36, 0.72, -1.12], [0.4, PI2, 0]),
      prt(To(0.18, 0.045, Math.PI * 1.6), 0x2a2028, [-0.36, 0.76, -1.06], [-0.4, PI2, 0]),
    ]),
    glow: MG([...maw(0, 0.8, 1.2, 1.45), ...maw(-0.27, 1.0, 1.06, 1), ...maw(0.27, 1.0, 1.06, 1), ...eyes([[-0.14, 1.2, 1.1], [0.14, 1.2, 1.1], [-0.31, 1.14, 1.0], [0.31, 1.14, 1.0]], 0xff3a20)]),
  },
  bloat: {
    body: MG([
      prt(Sp(0.62, 8, 6), 0x8e9a70, [0, 0.74, 0], [0, 0, 0], [1, 1.05, 1]),
      ...[-1, 1].flatMap(s => [prt(Bx(0.05, 0.6, 0.05), 0x5a6a42, [s * 0.3, 0.82, 0.46], [0.3, 0, s * 0.3]), prt(Sp(0.17, 5, 4), 0x6a7650, [s * 0.42, 0.13, 0.3]), prt(Sp(0.17, 5, 4), 0x6a7650, [s * 0.42, 0.13, -0.3])]),
      ...[[0.3, 1.1, -0.2], [-0.35, 0.9, -0.35], [0.1, 1.25, 0.1], [-0.2, 0.5, 0.5]].map(q => prt(Sp(0.11, 5, 4), 0xb8c08a, q)),
    ]),
    glow: MG([prt(Sp(0.25, 6, 4), 0x8a1a0a, [0, 0.7, 0.56], [0, 0, 0], [1, 0.7, 0.4]), ...eyes([[-0.16, 1.06, 0.46], [0.13, 1.13, 0.42], [0, 1.22, 0.34]], 0xffd84a, 0.06)]),
  },
  bat: {
    body: MG([
      prt(Sp(0.24, 7, 5), 0x221c26, [0, 0.3, 0], [0, 0, 0], [0.9, 0.9, 1.2]),
      prt(Sp(0.16, 6, 4), 0x221c26, [0, 0.42, 0.25]),
      prt(Co(0.05, 0.2, 3), 0x221c26, [-0.08, 0.62, 0.22]),
      prt(Co(0.05, 0.2, 3), 0x221c26, [0.08, 0.62, 0.22]),
      ...[-1, 1].flatMap(s => [prt(Bx(0.9, 0.03, 0.5), 0x4a1c24, [s * 0.55, 0.34, -0.02], [0, 0, s * 0.25]), prt(Bx(0.9, 0.05, 0.05), 0x15101a, [s * 0.55, 0.37, 0.22], [0, 0, s * 0.25])]),
    ]),
    glow: MG([...eyes([[-0.06, 0.46, 0.38], [0.06, 0.46, 0.38]], 0xff3a20, 0.04), prt(Co(0.02, 0.08, 3), 0xefe6d2, [-0.03, 0.33, 0.39], [Math.PI, 0, 0]), prt(Co(0.02, 0.08, 3), 0xefe6d2, [0.03, 0.33, 0.39], [Math.PI, 0, 0])]),
  },
  brute: {
    body: MG([
      prt(Sp(0.8, 8, 6), 0x5a2a20, [0, 1.25, 0], [-0.15, 0, 0], [0.85, 0.85, 1.3]),
      prt(Sp(0.6, 7, 5), 0x6a3426, [0, 1.15, 0.5]),
      prt(Sp(0.45, 7, 5), 0x4a2218, [0, 1.62, 1.0]),
      ...[-1, 1].flatMap(s => [
        prt(Co(0.12, 0.75, 5), 0xd8c8a0, [s * 0.3, 2.08, 0.88], [-0.5, 0, s * -0.6]),
        prt(Cy(0.18, 0.14, 1.1, 6), 0x3a1a14, [s * 0.45, 0.55, 0.6]),
        prt(Cy(0.18, 0.14, 1.1, 6), 0x3a1a14, [s * 0.45, 0.55, -0.6]),
        ...[-1, 0, 1].map(k => prt(Co(0.04, 0.22, 3), 0xd8d0c0, [s * 0.45 + k * 0.08, 0.05, 0.82], [PI2, 0, 0])),
      ]),
      ...spikes(12, 0x2a1410, 0, 1.5, -0.2, 0.6, 0.55, 0.9, 0.42, 0.1, 11),
      prt(Cy(0.08, 0.04, 1.4, 5), 0x3a1a14, [0, 1.4, -1.2], [-0.7, 0, 0]),
    ]),
    glow: MG([...eyes([[-0.17, 1.74, 1.36], [0.17, 1.74, 1.36]], 0xffa020, 0.07), ...maw(0, 1.46, 1.42, 1.5)]),
  },
  cat: {
    body: MG([
      prt(Sp(0.5, 9, 6), 0xb8783a, [0, 0.95, -0.1], [0, 0, 0], [0.8, 0.75, 1.5]),
      ...[-0.45, -0.1, 0.25].map(z => prt(Bx(0.62, 0.1, 0.13), 0x5a3014, [0, 1.3, z])),
      prt(Sp(0.36, 8, 6), 0xc08040, [0, 1.3, 0.78], [0, 0, 0], [1, 0.9, 0.95]),
      prt(Co(0.13, 0.32, 4), 0xb8783a, [-0.2, 1.66, 0.72], [0, 0, -0.2]),
      prt(Co(0.13, 0.32, 4), 0xb8783a, [0.2, 1.66, 0.72], [0, 0, 0.2]),
      prt(Sp(0.17, 6, 4), 0xe8d8c0, [0, 1.2, 1.06], [0, 0, 0], [1, 0.7, 0.8]),
      ...[[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.65], [0.25, -0.65]].map(([x, z]) => prt(Cy(0.1, 0.08, 0.8, 5), 0xa06830, [x, 0.4, z])),
      prt(Cy(0.07, 0.05, 1.3, 5), 0xb8783a, [0, 1.35, -1.25], [-0.6, 0, 0]),
      prt(Cy(0.05, 0.03, 0.7, 5), 0x5a3014, [0, 1.95, -1.55], [-0.2, 0, 0]),
    ]),
    glow: MG([...eyes([[-0.14, 1.38, 1.04], [0.14, 1.38, 1.04]], 0xd0ff40, 0.075), prt(Bx(0.03, 0.11, 0.03), 0x101010, [-0.14, 1.38, 1.11]), prt(Bx(0.03, 0.11, 0.03), 0x101010, [0.14, 1.38, 1.11]), ...maw(0, 1.1, 1.14, 0.9)]),
  },
  // Barn owl: the night predator. A pale, broad-winged silhouette with a heart-shaped face.
  owl: {
    body: MG([
      prt(Sp(0.5, 8, 6), 0x8a7458, [0, 0.5, 0], [0.3, 0, 0], [0.85, 1, 0.8]),
      prt(Sp(0.36, 7, 5), 0xb8a080, [0, 1.05, 0.12]),
      prt(Sp(0.3, 6, 4), 0xf0e6d4, [0, 1.03, 0.3], [0, 0, 0], [1, 1.05, 0.35]),
      prt(Co(0.05, 0.16, 4), 0xc8a060, [0, 0.95, 0.46], [PI2 + 0.4, 0, 0]),
      prt(Sp(0.34, 6, 4), 0xe8dcc8, [0, 0.45, 0.2], [0, 0, 0], [0.75, 0.9, 0.5]),
      ...[-1, 1].flatMap(s => [
        prt(Bx(1.3, 0.06, 0.62), 0x7a6448, [s * 0.95, 0.72, -0.02], [0, 0, s * 0.18]),
        prt(Bx(0.8, 0.05, 0.44), 0x5a4834, [s * 1.85, 0.86, -0.1], [0, s * 0.2, s * 0.32]),
        prt(Cy(0.04, 0.03, 0.34, 4), 0x3a3024, [s * 0.14, 0.05, 0.1], [0.3, 0, 0]),
      ]),
      prt(Bx(0.42, 0.05, 0.5), 0x6a5840, [0, 0.4, -0.55], [0.4, 0, 0]),
    ]),
    glow: MG(eyes([[-0.12, 1.08, 0.4], [0.12, 1.08, 0.4]], 0x101010, 0.07).concat(eyes([[-0.12, 1.08, 0.43], [0.12, 1.08, 0.43]], 0xffc020, 0.035))),
  },
  crow: {
    body: MG([
      prt(Sp(0.28, 8, 6), 0x1a181e, [0, 0.3, 0], [0, 0, 0], [0.9, 0.85, 1.4]),
      prt(Sp(0.17, 7, 5), 0x1a181e, [0, 0.45, 0.36]),
      prt(Co(0.06, 0.26, 4), 0xd8a030, [0, 0.43, 0.56], [PI2, 0, 0]),
      prt(Bx(0.3, 0.04, 0.4), 0x121014, [0, 0.3, -0.5], [0.2, 0, 0]),
      ...[-1, 1].flatMap(s => [prt(Bx(0.95, 0.04, 0.42), 0x24222a, [s * 0.6, 0.36, 0], [0, 0, s * 0.3]), prt(Bx(0.45, 0.03, 0.3), 0x121014, [s * 1.15, 0.5, -0.05], [0, 0, s * 0.55])]),
    ]),
    glow: MG(eyes([[-0.08, 0.5, 0.48], [0.08, 0.5, 0.48]], 0xff2a20, 0.035)),
  },
  moth: {
    body: MG([
      prt(Sp(0.2, 7, 5), 0xd8ccb0, [0, 0.4, 0], [0, 0, 0], [0.8, 0.8, 1.6]),
      prt(Sp(0.14, 6, 4), 0xe8dcc0, [0, 0.42, 0.34]),
      ...[-1, 1].flatMap(s => [prt(Bx(0.9, 0.03, 0.7), 0xb8a888, [s * 0.55, 0.45, 0.12], [0, s * 0.2, s * 0.2]), prt(Bx(0.6, 0.03, 0.5), 0x9a8a6a, [s * 0.45, 0.4, -0.3], [0, -s * 0.3, s * 0.15]), prt(Bx(0.02, 0.02, 0.4), 0x5a4a3a, [s * 0.08, 0.55, 0.52], [-0.6, s * 0.4, 0])]),
    ]),
    glow: MG([...eyes([[-0.06, 0.46, 0.44], [0.06, 0.46, 0.44]], 0x9ae040, 0.04), prt(Sp(0.1, 5, 4), 0x9ae040, [-0.6, 0.48, 0.15]), prt(Sp(0.1, 5, 4), 0x9ae040, [0.6, 0.48, 0.15])]),
  },
  wasp: {
    body: MG([
      prt(Sp(0.16, 7, 5), 0x2a2418, [0, 0.4, 0.05]),
      prt(Sp(0.2, 7, 5), 0xe0b020, [0, 0.36, -0.3], [0.3, 0, 0], [0.8, 0.8, 1.3]),
      prt(Bx(0.3, 0.05, 0.06), 0x201a10, [0, 0.4, -0.22]),
      prt(Bx(0.28, 0.05, 0.06), 0x201a10, [0, 0.34, -0.38]),
      prt(Co(0.03, 0.2, 4), 0x101010, [0, 0.28, -0.6], [-PI2 - 0.3, 0, 0]),
      prt(Sp(0.12, 6, 4), 0x2a2418, [0, 0.45, 0.26]),
      ...[-1, 1].map(s => prt(Bx(0.6, 0.02, 0.24), 0xe8f0ff, [s * 0.38, 0.56, 0], [0, s * 0.3, s * 0.35])),
    ]),
    glow: MG(eyes([[-0.06, 0.5, 0.34], [0.06, 0.5, 0.34]], 0xff4020, 0.04)),
  },
  shade: {
    body: MG([
      prt(Sp(0.35, 7, 5), 0x1a1024, [0, 0.6, 0], [0, 0, 0], [0.8, 1.2, 1]),
      prt(Sp(0.25, 7, 5), 0x221430, [0, 1.1, 0.2]),
      ...spikes(10, 0x0e0816, 0, 0.8, -0.1, 0.3, 0.5, 0.35, 0.35, 0.06, 5),
      ...[-1, 1].flatMap(s => [prt(Bx(0.08, 0.6, 0.08), 0x1a1024, [s * 0.34, 0.55, 0.3], [0.5, 0, s * 0.3]), prt(Co(0.04, 0.25, 3), 0xd8d0c0, [s * 0.4, 0.25, 0.55], [PI2, 0, 0])]),
    ]),
    glow: MG([...eyes([[-0.09, 1.15, 0.42], [0.09, 1.15, 0.42]], 0xc070ff, 0.05), ...maw(0, 0.98, 0.42, 0.9)]),
  },
  roach: {
    body: MG([
      prt(Sp(0.28, 7, 5), 0x5a3418, [0, 0.15, 0], [0, 0, 0], [0.85, 0.4, 1.3]),
      prt(Sp(0.12, 6, 4), 0x3a2210, [0, 0.14, 0.36]),
      ...[-1, 1].flatMap(s => [0, 1, 2].map(k => prt(Bx(0.4, 0.03, 0.03), 0x2a180c, [s * 0.26, 0.08, 0.15 - k * 0.18], [0, s * (k - 1) * 0.4, s * 0.3])).concat([prt(Bx(0.02, 0.02, 0.5), 0x2a180c, [s * 0.06, 0.2, 0.62], [-0.2, s * 0.3, 0])])),
    ]),
    glow: MG(eyes([[-0.05, 0.18, 0.46], [0.05, 0.18, 0.46]], 0xff6a20, 0.03)),
  },
  // Nest-mates summoned by the shriek: small, grey, red-eyed.
  ratling: {
    body: MG([
      prt(Sp(0.3, 6, 4), 0x8a8478, [0, 0.28, 0], [0, 0, 0], [0.8, 0.7, 1.5]),
      prt(Co(0.16, 0.42, 5), 0x9a948a, [0, 0.32, 0.5], [PI2, 0, 0]),
      prt(Cy(0.09, 0.09, 0.03, 6), 0xb0786c, [-0.1, 0.46, 0.34], [PI2, 0, 0.4]),
      prt(Cy(0.09, 0.09, 0.03, 6), 0xb0786c, [0.1, 0.46, 0.34], [PI2, 0, -0.4]),
      prt(Cy(0.02, 0.04, 0.7, 4), 0xb88a78, [0, 0.24, -0.72], [-1.3, 0, 0]),
      ...[[-0.14, 0.2], [0.14, 0.2], [-0.14, -0.2], [0.14, -0.2]].map(([x, z]) => prt(Cy(0.04, 0.03, 0.2, 4), 0x5a544a, [x, 0.1, z])),
    ]),
    glow: MG(eyes([[-0.07, 0.4, 0.55], [0.07, 0.4, 0.55]], 0xff3a2a, 0.035)),
  },
  // Lidbearer: a big sewer rat crouched behind a dented trash-can lid. Blocks from the front.
  shieldrat: {
    body: MG([
      prt(Sp(0.42, 8, 6), 0x6a5e54, [0, 0.5, -0.1], [0, 0, 0], [0.85, 0.8, 1.35]),
      prt(Cy(0.5, 0.5, 0.08, 9), 0x8a9098, [0, 0.58, 0.5], [PI2, 0, 0]),
      prt(To(0.38, 0.03, TAU), 0x6a7078, [0, 0.58, 0.55]),
      prt(Bx(0.12, 0.06, 0.12), 0x5a6068, [0, 0.58, 0.58]),
      prt(Sp(0.22, 7, 5), 0x7a6e62, [0, 0.98, 0.22], [0, 0, 0], [0.95, 0.85, 1.1]),
      prt(Co(0.12, 0.3, 5), 0x7a6e62, [0, 0.96, 0.44], [PI2, 0, 0]),
      ...[-1, 1].map(s => prt(Cy(0.09, 0.09, 0.03, 7), 0xb0786c, [s * 0.14, 1.16, 0.16], [PI2, 0, s * 0.4])),
      ...[[-0.22, 0.25], [0.22, 0.25], [-0.24, -0.4], [0.24, -0.4]].map(([x, z]) => prt(Cy(0.07, 0.05, 0.36, 5), 0x4a4038, [x, 0.17, z])),
      prt(Cy(0.04, 0.02, 0.9, 4), 0xb88a78, [0, 0.42, -0.85], [-1.2, 0, 0]),
    ]),
    glow: MG([...eyes([[-0.09, 1.04, 0.36], [0.09, 1.04, 0.36]], 0xff3a2a, 0.045), prt(Sp(0.03, 4, 3), 0xd8d0c0, [0.2, 0.62, 0.56]), prt(Sp(0.03, 4, 3), 0xd8d0c0, [-0.2, 0.5, 0.56])]),
  },
  // Rot Priest: a hooded, robed rat with a skull staff. Heals the horde around it.
  priest: {
    body: MG([
      prt(Co(0.52, 1.35, 7), 0x3a4a2a, [0, 0.66, 0]),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => prt(Co(0.08, 0.22, 3), 0x2a3620, [Math.sin(i * 0.9) * 0.48, 0.08, Math.cos(i * 0.9) * 0.48], [Math.PI, 0, 0])),
      prt(Co(0.27, 0.5, 6), 0x2e3a22, [0, 1.48, -0.02], [-0.2, 0, 0]),
      prt(Sp(0.2, 6, 4), 0x8a8070, [0, 1.3, 0.1]),
      prt(Co(0.1, 0.3, 5), 0x8a8070, [0, 1.27, 0.32], [PI2, 0, 0]),
      prt(Cy(0.03, 0.03, 1.9, 4), 0x4a3a2a, [0.42, 0.95, 0.2]),
      prt(Sp(0.13, 6, 4), 0xe8e0c8, [0.42, 1.92, 0.2]),
      prt(Co(0.04, 0.2, 3), 0xe8e0c8, [0.33, 2.02, 0.2], [0, 0, 0.6]), prt(Co(0.04, 0.2, 3), 0xe8e0c8, [0.51, 2.02, 0.2], [0, 0, -0.6]),
      prt(Cy(0.07, 0.05, 0.5, 5), 0x3a4a2a, [0.3, 1.0, 0.2], [0, 0, 0.9]),
      prt(Cy(0.02, 0.02, 0.4, 3), 0x2a2018, [-0.32, 0.72, 0.28]),
    ]),
    glow: MG([...eyes([[-0.07, 1.36, 0.27], [0.07, 1.36, 0.27]], 0x9be06a, 0.04), ...eyes([[0.38, 1.94, 0.31], [0.46, 1.94, 0.31]], 0x9be06a, 0.035), prt(Sp(0.09, 5, 4), 0x9be06a, [-0.32, 0.48, 0.28])]),
  },
  // Lurker: a lanky wall-crawler that waits in cracks and alley mouths.
  lurker: {
    body: MG([
      prt(Sp(0.4, 8, 6), 0x2a3028, [0, 0.72, -0.05], [0.25, 0, 0], [0.7, 0.75, 1.25]),
      prt(Sp(0.24, 7, 5), 0x343c30, [0, 0.95, 0.55], [0, 0, 0], [0.9, 0.8, 1.3]),
      ...spikes(9, 0x161a14, 0, 0.9, -0.1, 0.25, 0.3, 0.45, 0.3, 0.05, 13),
      ...[-1, 1].flatMap(s => [
        prt(Cy(0.05, 0.04, 0.95, 4), 0x222820, [s * 0.36, 0.48, 0.5], [0.45, 0, s * -0.15]),
        prt(Co(0.04, 0.26, 3), 0xd8d0b0, [s * 0.4, 0.08, 0.78], [PI2 + 0.4, 0, 0]),
        prt(Co(0.04, 0.22, 3), 0xd8d0b0, [s * 0.46, 0.08, 0.72], [PI2 + 0.4, 0, 0]),
        prt(Cy(0.08, 0.05, 0.6, 4), 0x222820, [s * 0.3, 0.3, -0.4], [-0.3, 0, 0]),
      ]),
    ]),
    glow: MG([prt(Bx(0.3, 0.03, 0.03), 0xd0ff60, [0, 0.86, 0.8]), ...eyes([[-0.09, 1.05, 0.76], [0.09, 1.05, 0.76], [-0.15, 1.0, 0.7], [0.15, 1.0, 0.7]], 0xd0ff60, 0.03)]),
  },
  // Bin Mimic: an ordinary dented trash can, until the lid opens on teeth.
  mimic: {
    body: MG([
      prt(Cy(0.42, 0.37, 1.0, 8), 0x5a6068, [0, 0.5, 0]),
      prt(To(0.41, 0.03, TAU), 0x4a5058, [0, 0.3, 0], [PI2, 0, 0]),
      prt(To(0.41, 0.03, TAU), 0x4a5058, [0, 0.7, 0], [PI2, 0, 0]),
      prt(Cy(0.46, 0.46, 0.08, 9), 0x6a7078, [0, 1.04, 0]),
      prt(Bx(0.18, 0.05, 0.06), 0x4a5058, [0, 1.1, 0]),
      ...[[-0.22, 0.2], [0.22, 0.2], [-0.22, -0.2], [0.22, -0.2]].map(([x, z]) => prt(Cy(0.06, 0.04, 0.3, 4), 0x3a2a24, [x, 0.06, z])),
    ]),
    glow: MG([
      prt(Bx(0.22, 0.04, 0.5), 0xc02a3a, [0, 0.96, 0.12], [0.2, 0, 0]),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * TAU; return prt(Co(0.04, 0.14, 3), 0xefe6d2, [Math.sin(a) * 0.36, 1.0, Math.cos(a) * 0.36], [Math.PI, 0, 0]); }),
      ...eyes([[-0.12, 1.01, 0.3], [0.12, 1.01, 0.3]], 0xffd040, 0.05),
    ]),
  },
  // Gob Spitter: a squat toad-rat with a throat sac full of acid. Hangs back and spits.
  spitter: {
    body: MG([
      prt(Sp(0.5, 8, 6), 0x5a6a3a, [0, 0.5, -0.05], [0, 0, 0], [1, 0.72, 1.1]),
      prt(Sp(0.3, 7, 5), 0xb0a060, [0, 0.42, 0.42], [0, 0, 0], [1.1, 0.9, 0.9]),
      prt(Sp(0.28, 7, 5), 0x5a6a3a, [0, 0.74, 0.45], [0, 0, 0], [1.1, 0.8, 1]),
      ...[-1, 1].flatMap(s => [
        prt(Sp(0.12, 6, 4), 0x6a7a44, [s * 0.16, 0.94, 0.5]),
        prt(Sp(0.2, 6, 4), 0x4a5a30, [s * 0.42, 0.24, -0.25], [0, 0, 0], [0.8, 0.7, 1.4]),
        prt(Cy(0.06, 0.05, 0.3, 4), 0x4a5a30, [s * 0.26, 0.14, 0.38]),
      ]),
      ...[[0.2, 0.75, -0.3], [-0.25, 0.7, -0.1], [0.05, 0.85, 0.05]].map(q => prt(Sp(0.08, 5, 4), 0x8a9a5a, q)),
    ]),
    glow: MG([...eyes([[-0.16, 0.98, 0.6], [0.16, 0.98, 0.6]], 0xffe040, 0.06), prt(Bx(0.34, 0.03, 0.04), 0xb050ff, [0, 0.62, 0.72])]),
  },
  // ---- boss-only models (no instancing pool) ----
  drone: {
    body: MG([
      prt(Bx(1.1, 0.5, 1.4), 0x4a4e54, [0, 1.3, 0]),
      prt(Sp(0.5, 8, 5), 0x3a3e44, [0, 1.6, 0.1], [0, 0, 0], [1, 0.6, 1.1]),
      prt(Cy(0.28, 0.28, 0.9, 8), 0x7aa030, [0, 1.35, -0.85], [PI2, 0, 0]),
      ...[0, 1, 2, 3].map(i => prt(Bx(0.18, 0.1, 0.02), i % 2 ? 0x101010 : 0xe8c030, [-0.3 + i * 0.2, 1.3, 0.71])),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([sx, sz]) => [
        prt(Bx(0.9, 0.08, 0.12), 0x2a2e34, [sx * 0.75, 1.45, sz * 0.7], [0, sx * sz * 0.8, 0]),
        prt(Cy(0.5, 0.5, 0.04, 10), 0x8a929a, [sx * 1.05, 1.55, sz * 1.0]),
        prt(Cy(0.06, 0.06, 0.2, 5), 0x2a2e34, [sx * 1.05, 1.48, sz * 1.0]),
      ]),
      prt(Co(0.14, 0.5, 6), 0x5a6068, [0, 0.95, 0.5], [-2.4, 0, 0]),
      prt(Bx(0.1, 0.6, 0.1), 0x2a2e34, [-0.35, 0.8, 0]), prt(Bx(0.1, 0.6, 0.1), 0x2a2e34, [0.35, 0.8, 0]),
    ]),
    glow: MG([prt(Sp(0.16, 7, 5), 0xff2a1a, [0, 1.35, 0.72]), prt(Sp(0.06, 5, 4), 0x9be06a, [0, 0.78, 0.72]), ...eyes([[-0.45, 1.3, 0.71], [0.45, 1.3, 0.71]], 0xff8a2a, 0.05)]),
  },
  ratking: {
    body: MG([
      prt(new THREE.TorusKnotGeometry(0.55, 0.13, 40, 5), 0x9a7a68, [0, 0.75, 0], [PI2, 0, 0]),
      prt(Sp(0.6, 8, 6), 0x5a4a42, [0, 0.7, 0], [0, 0, 0], [1.1, 0.7, 1.1]),
      ...[0, 1, 2, 3, 4, 5].flatMap(i => kingRat(i * TAU / 6 + 0.3, 0.9, 0.55 + (i % 2) * 0.35, 1, i % 2 ? 0x8a8478 : 0x6e6874)),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => prt(Co(0.1, 0.4, 4), 0xe8c040, [Math.sin(i * TAU / 7) * 0.35, 1.45, Math.cos(i * TAU / 7) * 0.35])),
      prt(Cy(0.42, 0.42, 0.14, 12), 0xd8a830, [0, 1.25, 0]),
    ]),
    glow: MG([
      ...[0, 1, 2, 3, 4, 5].flatMap(i => {
        const a = i * TAU / 6 + 0.3, y = 0.55 + (i % 2) * 0.35 + 0.2, d = 0.9 + 0.75;
        return eyes([[Math.sin(a) * d + Math.cos(a) * 0.1, y, Math.cos(a) * d - Math.sin(a) * 0.1], [Math.sin(a) * d - Math.cos(a) * 0.1, y, Math.cos(a) * d + Math.sin(a) * 0.1]], 0xff2a1a, 0.05);
      }),
      prt(Sp(0.12, 6, 4), 0xff4a2a, [0, 1.5, 0]),
    ]),
  },
};

/** Geometry keys that get an instancing pool (bosses use their own meshes). */
export const MOB_GEOS = Object.keys(GEO).filter(k => k !== 'drone' && k !== 'ratking' && k !== 'owl');

/** Creature skin: gouraud-lit vertex colours over a coarse fur texture, with PS1 vertex snap and affine mapping. */
export const bodyMat = () => ps1(new THREE.MeshLambertMaterial({ vertexColors: true, map: furTex }));
