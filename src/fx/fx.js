// Pooled visual effects: ground rings, pixel sprite animations, lightning,
// particles, blood, gibs, decals and floating damage numbers.
import * as THREE from 'three';
import { rand, randi, TAU, PI2 } from '../core/util.js';
import { G, P, W } from '../core/state.js';
import { scene, camera } from '../render/renderer.js';
import { atlasTex } from '../render/textures.js';
import { decals, dummy, tmpC, _v, DECAL_CAP } from '../render/pools.js';
import { floorY } from '../world/grid.js';
import { sfx } from '../audio/audio.js';

export const ringGeo = new THREE.RingGeometry(0.86, 1, 32);
export const discGeo = new THREE.CircleGeometry(1, 32);

const fxs = [];
/** Expanding ring, flat disc, or pulsing 'warn' telegraph on the ground. */
export function fx(kind, x, y, z, R, col, life, ang = 0, op = 0.8) {
  let f = fxs.find(f => !f.on && f.kind === kind);
  if (!f) {
    const m = new THREE.Mesh(kind === 'disc' || kind === 'warn' ? discGeo : ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -PI2;
    const g = new THREE.Group();
    g.add(m);
    scene.add(g);
    f = { kind, g, m };
    fxs.push(f);
  }
  Object.assign(f, { on: true, life, max: life, R, op });
  f.m.material.color.set(col);
  f.g.position.set(x, y + 0.06, z);
  f.g.visible = true;
  return f;
}

const pfxs = [];
/** Four-frame pixel animation from the FX atlas (row 0 slash, 1 spark, 2 explosion). */
export function pfx(row, x, y, z, size, life, o = {}) {
  const gr = !!o.ground;
  let f = pfxs.find(f => !f.on && f.ground === gr);
  if (!f) {
    const tex = atlasTex(row, 0);
    let obj, mat;
    if (gr) {
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.rotation.x = -PI2;
      obj = new THREE.Group();
      obj.add(m);
    } else {
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      obj = new THREE.Sprite(mat);
    }
    scene.add(obj);
    f = { obj, mat, tex, ground: gr };
    pfxs.push(f);
  }
  Object.assign(f, { on: true, row, life, max: life });
  f.mat.color.set(o.col ?? 0xffffff);
  f.obj.visible = true;
  f.obj.position.set(x, y, z);
  f.obj.scale.set(size, size, size);
  if (gr) f.obj.rotation.y = (o.ang || 0) + Math.PI;
  f.tex.offset.set(0, 1 - (row + 1) * 0.25);
  return f;
}

export function slashFx(A, R, col, from = P) {
  sfx('slash');
  pfx(0, from.x + Math.sin(A) * R * 0.5, from.y + 0.5, from.z + Math.cos(A) * R * 0.5, R * 2.1, 0.2, { ground: true, ang: A, col });
  if (from === P) P.atk = 0.22;
}
// ---------- swipe crescents ----------
/** Unit arc (inner 0.5, outer 1) spanning `span` radians around +z, uv.x along the arc, uv.y across it. */
function arcGeo(span, segs = 22) {
  const pos = [], uv = [], r0 = 0.5, r1 = 1;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, a0 = -span / 2 + span * t0, a1 = -span / 2 + span * t1;
    const P0 = [Math.sin(a0) * r0, 0, Math.cos(a0) * r0], P1 = [Math.sin(a0) * r1, 0, Math.cos(a0) * r1];
    const Q0 = [Math.sin(a1) * r0, 0, Math.cos(a1) * r0], Q1 = [Math.sin(a1) * r1, 0, Math.cos(a1) * r1];
    pos.push(...P0, ...P1, ...Q1, ...P0, ...Q1, ...Q0);
    uv.push(t0, 0, t0, 1, t1, 1, t0, 0, t1, 1, t1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const ARC = { light: arcGeo(2.5), heavy: arcGeo(2.9) };
const swipeVS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// A bright leading edge sweeps along the arc with a fading tail; alpha is posterised for the pixel look.
const swipeFS = `uniform float head,len,op;uniform vec3 col;varying vec2 vUv;
void main(){
  float along=smoothstep(head-len,head,vUv.x)*(1.-step(head,vUv.x));
  float edge=smoothstep(0.,1.,vUv.y);
  float a=along*(0.25+0.75*edge*edge)*op;
  a=floor(a*5.)/5.;
  if(a<=0.)discard;
  gl_FragColor=vec4(col*(0.7+0.9*edge*along),a);
}`;
const swipes = [];
/**
 * Organic melee swipe: a crescent that sweeps across the arc (alternating
 * sides, slightly tilted) instead of a flat stamp. `heavy` is wider and slower.
 */
export function swipeFx(A, R, col, heavy = false, from = P) {
  sfx('slash');
  let f = swipes.find(f => !f.on && f.heavy === heavy);
  if (!f) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { head: { value: 0 }, len: { value: 0.5 }, op: { value: 1 }, col: { value: new THREE.Color() } },
      vertexShader: swipeVS, fragmentShader: swipeFS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(heavy ? ARC.heavy : ARC.light, mat);
    m.frustumCulled = false;
    scene.add(m);
    f = { m, mat, heavy };
    swipes.push(f);
  }
  const side = from === P ? (P.swingSide = -(P.swingSide || 1)) : Math.random() < 0.5 ? -1 : 1;
  const life = heavy ? 0.26 : 0.18;
  Object.assign(f, { on: true, life, max: life });
  f.mat.uniforms.col.value.set(col);
  f.m.position.set(from.x, from.y + (heavy ? 0.5 : 0.6), from.z);
  f.m.rotation.set(0, 0, 0);
  f.m.rotateY(A);
  f.m.rotateZ(side * (0.18 + Math.random() * 0.22));
  f.m.scale.set(R * side, 1, R);
  f.m.visible = true;
  if (from === P) { P.swing = heavy ? 0.3 : 0.24; P.swingHeavy = heavy; }
  return f;
}

export function boom(x, y, z, s, col = 0xffffff) {
  pfx(2, x, y, z, s * 1.3, 0.36, { col });
  if (s >= 2.5) {
    pfx(1, x, y, z, s * 0.9, 0.18);
    fx('ring', x, floorY(x, z), z, s * 0.55, col, 0.3);
    puff(x, y, z, col, Math.min(14, s * 2 | 0), s * 1.2);
    if (s >= 3) sfx('boom');
  }
}
export const spark = (x, y, z, s = 0.9, col = 0xffffff) => pfx(1, x, y, z, s, 0.16, { col });

const bolts = [];
export function bolt(pts) {
  let b = bolts.find(b => !b.on);
  if (!b) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8e8ff, transparent: true }));
    l.frustumCulled = false;
    scene.add(l);
    b = { l };
    bolts.push(b);
  }
  const a = b.l.geometry.attributes.position.array;
  let n = 0;
  for (let i = 0; i < pts.length - 1 && n < 60; i++) {
    const p = pts[i], q = pts[i + 1];
    for (let s = 0; s < 4; s++) {
      const t = s / 4, j = s ? 0.35 : 0;
      a[n * 3] = p[0] + (q[0] - p[0]) * t + rand(-j, j);
      a[n * 3 + 1] = p[1] + (q[1] - p[1]) * t + rand(-j, j);
      a[n * 3 + 2] = p[2] + (q[2] - p[2]) * t + rand(-j, j);
      n++;
    }
  }
  const l = pts[pts.length - 1];
  a[n * 3] = l[0]; a[n * 3 + 1] = l[1]; a[n * 3 + 2] = l[2];
  n++;
  b.l.geometry.setDrawRange(0, n);
  b.l.geometry.attributes.position.needsUpdate = true;
  b.on = true;
  b.life = 0.16;
  b.l.visible = true;
  for (let i = 1; i < pts.length; i++) spark(pts[i][0], pts[i][1], pts[i][2], 1.1, 0xc8e0ff);
  sfx('zap');
}

export const PART_CAP = 700;
export function puff(x, y, z, col, n = 6, s = 3) {
  for (let i = 0; i < n; i++) {
    if (W.parts.length >= PART_CAP) W.parts.shift();
    W.parts.push({ x, y, z, vx: rand(-1, 1) * s, vy: rand(0.3, 1.4) * s, vz: rand(-1, 1) * s, life: rand(0.3, 0.6), c: col, s: 1 });
  }
}
export function blood(x, y, z, col, ang, n, sp = 4) {
  for (let i = 0; i < n; i++) {
    if (W.parts.length >= PART_CAP) W.parts.shift();
    const a = ang == null ? rand(0, TAU) : ang + rand(-0.8, 0.8), v = rand(1.5, sp);
    W.parts.push({ x, y, z, vx: Math.sin(a) * v, vy: rand(2, 6), vz: Math.cos(a) * v, life: 1.4, c: col, b: true, s: rand(0.8, 1.5) });
  }
}
export function decal(x, y, z, s, col) {
  const D = decals[randi(0, 3)];
  dummy.position.set(x, y + 0.02 + Math.random() * 0.02, z);
  dummy.rotation.set(0, rand(0, TAU), 0);
  dummy.scale.set(s, 1, s);
  dummy.updateMatrix();
  D.m.setMatrixAt(D.i, dummy.matrix);
  D.m.setColorAt(D.i, tmpC.setHex(col));
  D.i = (D.i + 1) % DECAL_CAP;
  D.n = Math.min(DECAL_CAP, D.n + 1);
  D.m.count = D.n;
  D.m.instanceMatrix.needsUpdate = true;
  D.m.instanceColor.needsUpdate = true;
}
export function clearDecals() { for (const D of decals) { D.n = 0; D.i = 0; D.m.count = 0; } }

/** Flesh chunks that bounce, tumble and leave blood where they land. */
export function gore(e, mul = 1) {
  const big = e.boss || e.pred || e.type === 'nest', n = Math.round((big ? 22 : e.h > 1 ? 9 : 5) * mul), s0 = (e.sc || 1) * (big ? 2 : 1);
  for (let i = 0; i < n; i++) {
    if (W.gibs.length >= 400) W.gibs.shift();
    const a = rand(0, TAU), v = rand(2, big ? 9 : 6) * (mul > 1 ? 1.4 : 1);
    W.gibs.push({ x: e.x, y: e.y + e.h * 0.5, z: e.z, vx: Math.sin(a) * v, vy: rand(4, 10), vz: Math.cos(a) * v, rx: rand(0, 6), ry: rand(0, 6), sp: rand(-14, 14), life: rand(5, 9), c: i % 3 === 0 ? e.blood : i % 3 === 1 ? e.col : 0x5a0808, s: rand(0.7, 1.6) * s0, l: rand(1, 2.4), hit: false, rest: false });
  }
}

// ---------- weapon visuals that live with FX ----------
/** Bulwark (Sewer Rat special) shield bubble. */
export const shieldM = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.22, depthWrite: false, wireframe: true }));
shieldM.visible = false;
scene.add(shieldM);

// ---------- damage numbers ----------
const nums = [];
for (let i = 0; i < 48; i++) {
  const d = document.createElement('div');
  d.className = 'num';
  document.body.appendChild(d);
  nums.push(d);
}
let numI = 0;
let numBudget = 0;
/** Floating number. Plain damage numbers are rate-limited so huge fights don't flood the page. */
export function dnum(x, y, z, v, cls = '') {
  if ((cls === '' || cls === 'poison' || cls === 'burn') && numBudget <= 0) return;
  numBudget--;
  _v.set(x, y, z).project(camera);
  if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return;
  const el = nums[numI++ % nums.length];
  el.textContent = v;
  el.className = 'num ' + cls;
  const sx = (_v.x * 0.5 + 0.5) * innerWidth + rand(-10, 10), sy = (-_v.y * 0.5 + 0.5) * innerHeight;
  el.animate([
    { transform: `translate(${sx}px,${sy}px) translate(-50%,-50%) scale(${cls === 'crit' ? 1.5 : 1.15})`, opacity: 1 },
    { transform: `translate(${sx}px,${sy - 46}px) translate(-50%,-50%) scale(1)`, opacity: 0 },
  ], { duration: cls === 'info' ? 1300 : 650, easing: 'cubic-bezier(.2,.7,.3,1)' });
}

/** Advance pooled FX lifetimes (called from the render sync). */
export function tickFx(dt) {
  numBudget = 4;
  for (const f of swipes) {
    if (!f.on) continue;
    f.life -= dt;
    if (f.life <= 0) { f.on = false; f.m.visible = false; continue; }
    const u = 1 - f.life / f.max, e = 1 - Math.pow(1 - u, 3);
    f.mat.uniforms.head.value = e * 1.35;
    f.mat.uniforms.len.value = 0.55;
    f.mat.uniforms.op.value = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
  }
  for (const f of fxs) {
    if (!f.on) continue;
    f.life -= dt;
    const k = 1 - f.life / f.max;
    if (f.life <= 0) { f.on = false; f.g.visible = false; continue; }
    f.g.scale.setScalar(f.kind === 'ring' ? f.R * (0.25 + 0.75 * k) : f.R);
    f.m.material.opacity = f.kind === 'warn' ? (0.18 + 0.4 * k) * (0.75 + 0.25 * Math.sin(G.time * 30)) : f.op * (1 - k);
  }
  for (const f of pfxs) {
    if (!f.on) continue;
    f.life -= dt;
    if (f.life <= 0) { f.on = false; f.obj.visible = false; continue; }
    f.tex.offset.x = Math.min(3, Math.floor((1 - f.life / f.max) * 4)) * 0.25;
  }
  for (const b of bolts) {
    if (!b.on) continue;
    b.life -= dt;
    b.l.material.opacity = Math.max(0, b.life / 0.16);
    if (b.life <= 0) { b.on = false; b.l.visible = false; }
  }
}
export function clearFx() {
  for (const f of swipes) { f.on = false; f.m.visible = false; }
  for (const f of fxs) { f.on = false; f.g.visible = false; }
  for (const f of pfxs) { f.on = false; f.obj.visible = false; }
}
