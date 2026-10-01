// A lightweight vertex skeleton for instanced creatures. Every model part is
// given to one bone (body, head, four legs, tail, two wings) from where it
// sits, and the vertex shader swings it around a pivot from a few numbers per
// instance. That keeps hundreds of mobs on one draw call each while they walk
// with real strides, coil before they strike, flinch away from hits, flap,
// sniff around and look at you.
import * as THREE from 'three';
import { clamp, angD } from '../core/util.js';
import { G } from '../core/state.js';

export const BONE = { body: 0, head: 1, fl: 2, fr: 3, bl: 4, br: 5, tail: 6, wl: 7, wr: 8 };

/**
 * Per-model rig. Parts are classified by their centre:
 *   wings  |x| > wingX (and y > wingY)
 *   legs   y < legY and |x| > legX   (front/back by legMidZ, or alternating
 *          by legStep for many-legged bugs so they walk in tripods)
 *   head   z > headZ or y > headY
 *   tail   z < tailZ
 * K = [leg swing, head push, tail sway, wing flap], lift = foot lift height,
 * stride = ground covered per full gait cycle (model units).
 */
export const RIGS = {
  mawling: { legY: 0.2, legX: 0.1, legMidZ: 0.07, headZ: 0.3, tailZ: -0.4, neck: [0, 0.42, 0.25], tailRoot: [0, 0.5, -0.4], K: [0.7, 0.14, 0.35, 0], lift: 0.06, stride: 0.9 },
  tick: { legY: 0.5, legX: 0.25, legStep: 0.16, legZ0: 0.2, legRoot: [0.2, 0.46], headZ: 0.25, tailZ: -0.12, neck: [0, 0.35, 0.22], tailRoot: [0, 0.4, -0.05], K: [0.55, 0.1, 0.12, 0], lift: 0.08, stride: 0.7 },
  roach: { legY: 0.12, legX: 0.15, legStep: 0.18, legZ0: 0.15, legRoot: [0.12, 0.12], headZ: 0.3, tailZ: -9, neck: [0, 0.15, 0.3], tailRoot: [0, 0.15, -0.3], K: [0.6, 0.06, 0, 0], lift: 0.05, stride: 0.55 },
  ghoul: { legY: 0.5, legX: 0.25, legMidZ: 0, headZ: 0.6, tailZ: -0.9, neck: [0, 0.95, 0.55], tailRoot: [0, 0.9, -0.85], K: [0.55, 0.22, 0.25, 0], lift: 0.12, stride: 1.9 },
  bloat: { legY: 0.2, legX: 0.25, legMidZ: 0, headZ: 0.3, headY: 0.5, headBoth: true, tailZ: -9, neck: [0, 0.75, 0.2], tailRoot: [0, 0, 0], K: [0.5, 0.12, 0, 0], lift: 0.05, stride: 1.2 },
  bat: { wingX: 0.3, legY: -9, headZ: 0.15, tailZ: -9, neck: [0, 0.36, 0.12], tailRoot: [0, 0, 0], wingRoot: [0.14, 0.34], K: [0, 0.08, 0, 0.9], lift: 0, stride: 1 },
  brute: { legY: 0.8, legX: 0.25, legMidZ: 0, headZ: 0.7, tailZ: -0.9, neck: [0, 1.4, 0.75], tailRoot: [0, 1.25, -0.8], K: [0.5, 0.25, 0.3, 0], lift: 0.14, stride: 2.4 },
  cat: { legY: 0.6, legX: 0.15, legMidZ: 0, headZ: 0.6, tailZ: -1.0, neck: [0, 1.15, 0.5], tailRoot: [0, 1.05, -0.85], K: [0.6, 0.18, 0.5, 0], lift: 0.12, stride: 2.2 },
  owl: { wingX: 0.5, legY: 0.15, legX: 0.05, legMidZ: -9, headY: 0.85, headZ: 9, tailZ: -0.45, neck: [0, 0.85, 0.1], tailRoot: [0, 0.45, -0.35], wingRoot: [0.3, 0.72], K: [0.2, 0.1, 0.15, 0.75], lift: 0, stride: 1 },
  crow: { wingX: 0.3, legY: -9, headZ: 0.25, tailZ: -0.35, neck: [0, 0.4, 0.25], tailRoot: [0, 0.3, -0.3], wingRoot: [0.18, 0.34], K: [0, 0.1, 0.2, 0.8], lift: 0, stride: 1 },
  moth: { wingX: 0.3, legY: -9, headZ: 0.3, tailZ: -0.3, neck: [0, 0.42, 0.25], tailRoot: [0, 0.4, -0.2], wingRoot: [0.1, 0.42], K: [0, 0.08, 0.1, 0.7], lift: 0, stride: 1 },
  wasp: { wingX: 0.25, wingY: 0.5, legY: -9, headZ: 0.2, tailZ: -0.15, neck: [0, 0.42, 0.18], tailRoot: [0, 0.4, -0.12], wingRoot: [0.08, 0.56], K: [0, 0.1, 0.25, 0.6], lift: 0, stride: 1 },
  shade: { legY: 0.7, legX: 0.25, legMidZ: -9, headY: 0.95, headZ: 9, tailZ: -9, neck: [0, 0.9, 0.1], tailRoot: [0, 0, 0], legRoot: [0.3, 0.8], K: [0.9, 0.2, 0, 0], lift: 0.05, stride: 1.4 },
  ratling: { legY: 0.15, legX: 0.1, legMidZ: 0, headZ: 0.3, tailZ: -0.5, neck: [0, 0.3, 0.3], tailRoot: [0, 0.26, -0.4], K: [0.8, 0.1, 0.45, 0], lift: 0.05, stride: 0.7 },
  drone: { legY: 1.0, legX: 0.25, legMidZ: 9, wingX: 0.9, wingY: 1.4, headZ: 9, tailZ: -9, neck: [0, 1.3, 0], tailRoot: [0, 0, 0], wingRoot: [0.5, 1.45], legRoot: [0.35, 1.1], K: [0.3, 0, 0, 0.12], lift: 0, stride: 1 },
  shieldrat: { legY: 0.3, legX: 0.1, legMidZ: 0, headY: 0.85, headZ: 9, tailZ: -0.6, neck: [0, 0.85, 0.1], tailRoot: [0, 0.45, -0.55], K: [0.6, 0.12, 0.3, 0], lift: 0.07, stride: 1.1 },
  priest: { legY: -9, headY: 1.15, headX: 0.25, headZ: 9, tailZ: -9, neck: [0, 1.15, 0.05], tailRoot: [0, 0, 0], K: [0, 0.12, 0, 0], lift: 0, stride: 1.2 },
  lurker: { legY: 0.6, legX: 0.2, legMidZ: 0, legRoot: [0.32, 0.72], headZ: 0.5, headY: 0.95, headBoth: true, tailZ: -9, neck: [0, 0.9, 0.35], tailRoot: [0, 0, 0], K: [0.85, 0.2, 0, 0], lift: 0.1, stride: 1.6 },
  mimic: { legY: 0.2, legX: 0.1, legMidZ: 0, headY: 0.97, headZ: 9, tailZ: -9, neck: [0, 1.04, -0.42], tailRoot: [0, 0, 0], K: [0.9, 0, 0, 0], jaw: 1.2, lift: 0.08, stride: 0.6 },
  spitter: { legY: 0.32, legX: 0.18, legMidZ: 0, headZ: 0.32, tailZ: -9, neck: [0, 0.6, 0.2], tailRoot: [0, 0, 0], K: [0.5, 0.18, 0, 0], jaw: 0.5, lift: 0.1, stride: 1.0 },
  ratking: { legY: -9, headZ: 9, tailZ: -9, neck: [0, 1.2, 0], tailRoot: [0, 0, 0], K: [0, 0, 0, 0], lift: 0, stride: 1.6 },
};
const DEF = { jaw: 0, headX: 99, legY: -9, legX: 0, legMidZ: 0, headZ: 9, headY: 99, tailZ: -9, wingX: 99, wingY: -99, neck: [0, 0, 0], tailRoot: [0, 0, 0], wingRoot: [0, 0], K: [0, 0, 0, 0], lift: 0, stride: 1 };
export const rigOf = k => ({ ...DEF, ...(RIGS[k] || {}) });

/** Bake bone index (rb) and pivot (rp) attributes into a merged creature geometry. */
export function rigGeo(geo, key) {
  if (geo.userData.rigged) return geo;
  const R = rigOf(key), pc = geo.attributes.pc, pt = geo.attributes.pt, n = geo.attributes.position.count;
  const rb = new Float32Array(n), rp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i), s = x < 0 ? -1 : 1;
    let b = BONE.body, p = [0, 0, 0];
    if (Math.abs(x) > R.wingX && y > R.wingY) { b = s < 0 ? BONE.wl : BONE.wr; p = [s * R.wingRoot[0], R.wingRoot[1], z]; }
    else if (y < R.legY && Math.abs(x) > R.legX) {
      let front;
      if (R.legStep) front = Math.round((R.legZ0 - z) / R.legStep) % 2 === 0;
      else front = z > R.legMidZ;
      b = (front ? BONE.fl : BONE.bl) + (s > 0 ? 1 : 0);
      p = R.legRoot ? [s * R.legRoot[0], R.legRoot[1], z] : [x, pt.getY(i), z];
    } else if (Math.abs(x) < R.headX && (R.headBoth ? z > R.headZ && y > R.headY : z > R.headZ || y > R.headY)) { b = BONE.head; p = R.neck; }
    else if (z < R.tailZ) { b = BONE.tail; p = R.tailRoot; }
    rb[i] = b;
    rp.set(p, i * 3);
  }
  geo.setAttribute('rb', new THREE.BufferAttribute(rb, 1));
  geo.setAttribute('rp', new THREE.BufferAttribute(rp, 3));
  geo.userData.rigged = true;
  return geo;
}

export const rigTime = { value: 0 };

const RIG_HEAD = `
attribute float rb;
attribute vec3 rp;
#ifdef USE_INSTANCING
attribute vec4 rA;
attribute vec4 rB;
#else
uniform vec4 rA;
uniform vec4 rB;
#endif
uniform vec4 rigK;
uniform float rigL;
uniform float rigJ;
uniform float rigT;
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
// rA = gait phase, gait amount, attack pose (-1 coiled .. +1 struck), seed
// rB = turn lean, head yaw, flinch, wing phase
mat3 rigR(out vec3 off) {
  int b = int(rb + 0.5);
  off = vec3(0.0);
  float ph = rA.x, amp = rA.y, atk = rA.z, seed = rA.w;
  float idle = 1.0 - clamp(amp * 3.0, 0.0, 1.0);
  if (b >= 2 && b <= 5) {
    float s = ph + ((b == 2 || b == 5) ? 0.0 : 3.14159);
    float a = sin(s) * amp * rigK.x;
    if (b < 4) a -= max(atk, 0.0) * 1.1 + min(atk, 0.0) * 0.35;
    else a += max(atk, 0.0) * 0.5 - min(atk, 0.0) * 0.25;
    off.y = max(0.0, -cos(s)) * amp * rigL;
    return rX(a);
  }
  if (b == 1) {
    float sniff = idle * max(0.0, sin(rigT * 0.8 + seed * 3.0)) * sin(rigT * 15.0 + seed) * 0.12;
    float pitch = sin(ph * 2.0) * amp * 0.08 - min(atk, 0.0) * 0.45 - max(atk, 0.0) * (0.12 + rigJ) - rB.z * 0.6 + sniff - abs(sin(ph * 2.0)) * amp * rigJ * 0.5;
    float yaw = rB.y + idle * sin(rigT * 0.55 + seed * 2.0) * 0.35;
    off = vec3(0.0, min(atk, 0.0) * rigK.y * 0.6, atk * rigK.y);
    return rY(yaw) * rX(pitch);
  }
  if (b == 6) {
    float sw = sin(rigT * (2.4 + amp * 7.0) + seed) * rigK.z * (0.45 + amp) + rB.x * 0.9;
    return rY(sw) * rX(sin(rigT * 1.7 + seed) * 0.1 - atk * 0.3 + rB.z * 0.35);
  }
  if (b == 7 || b == 8) {
    float sd = b == 7 ? -1.0 : 1.0;
    return rZ(sd * (sin(rB.w) * rigK.w + rB.x * 0.3 * sd));
  }
  return mat3(1.0);
}
`;

/**
 * Patch a creature material with the rig. Instanced meshes read the pose
 * from per-instance attributes; single meshes (bosses, owls, patrol cats)
 * read it from the returned uniforms.
 */
export function rigMat(mat, key) {
  const R = rigOf(key);
  const u = { rA: { value: new THREE.Vector4(0, 0, 0, Math.random() * 6) }, rB: { value: new THREE.Vector4() }, rigK: { value: new THREE.Vector4(...R.K) }, rigL: { value: R.lift }, rigJ: { value: R.jaw }, rigT: rigTime };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = RIG_HEAD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec3 o_; objectNormal = rigR(o_) * objectNormal; }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec3 o_; mat3 R_ = rigR(o_); transformed = R_ * (transformed - rp) + rp + o_; }');
  };
  const key0 = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => key0 + '|rig';
  mat.userData.rig = u;
  return mat;
}

/** Give an instanced pool its per-instance pose buffers (shared by its body and glow meshes). */
export function rigPool(bodyIM, glowIM, cap) {
  const A = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), B = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  A.setUsage(THREE.DynamicDrawUsage);
  B.setUsage(THREE.DynamicDrawUsage);
  for (const m of [bodyIM, glowIM]) { m.geometry.setAttribute('rA', A); m.geometry.setAttribute('rB', B); }
  bodyIM.userData.rA = A;
  bodyIM.userData.rB = B;
}

// ---------- the per-frame pose of one creature ----------
const TAUF = Math.PI * 2;
/**
 * Advance a creature's animation state from how it actually moved this
 * frame: strides come from distance covered (so feet don't skate), lean from
 * how fast it turned, attack pose from its wind-up / strike / recovery, and
 * a spring for flinches and squash. Returns nothing; reads back via e.an*.
 */
export function animTick(e, dt, key, px, pz) {
  const R = RIGS[key] || DEF;
  if (e.anx == null) { e.anx = e.x; e.anz = e.z; e.gph = Math.random() * TAUF; e.gam = 0; e.ap = 0; e.av = 0; e.lean = 0; e.hyaw = 0; e.flap = Math.random() * TAUF; e.pang = e.ang; e.sq = 0; e.sqv = 0; e.pvy = 0; }
  const step = Math.min(Math.hypot(e.x - e.anx, e.z - e.anz), 2);
  e.anx = e.x; e.anz = e.z;
  const sc = e.sc || 1, k = Math.min(1, dt * 10);
  const v = dt > 0 ? step / dt : 0;
  const airborne = !e.fly && (e.st === 'leap' || Math.abs(e.vy || 0) > 2);
  if (!e.fly) e.gph = (e.gph + step / (R.stride * sc) * TAUF) % (TAUF * 64);
  e.gam += (clamp(v / (R.stride * sc * 2.2), 0, 1) * (airborne ? 0.3 : 1) - e.gam) * k;
  // Turning: lean into the curve, more at speed.
  const w = dt > 0 ? angD(e.ang, e.pang) / dt : 0;
  e.pang = e.ang;
  e.lean += (clamp(-w * 0.07 * (0.3 + e.gam), -0.45, 0.45) * (e.fly ? 1.6 : 1) - e.lean) * Math.min(1, dt * 6);
  // Attack pose: coil during the wind-up, snap out on the strike, then a
  // sprung recovery that overshoots a little and leaves the mob open.
  const winding = e.st === 'wind' || e.wind > 0;
  const striking = e.lunge > 0 || e.st === 'leap' || e.st === 'charge' || e.st === 'dive' || e.st === 'swoop' || e.st === 'dart';
  let tgt = 0;
  if (winding) { const tot = e.tel0 || 0.4, left = e.st === 'wind' ? e.tt : e.wind; tgt = -clamp(1.25 - left / tot, 0.25, 1); }
  else if (striking) tgt = 1;
  if (e.wasStrike && !striking && !e.boss) { e.recov = 0.4; e.openShown = false; }
  e.wasStrike = striking;
  e.recov = (e.recov || 0) - dt;
  const kk = winding ? 90 : striking ? 420 : 150, c = winding ? 16 : striking ? 30 : 11;
  e.av += ((tgt - e.ap) * kk - e.av * c) * dt;
  e.ap = clamp(e.ap + e.av * dt, -1.2, 1.3);
  // Head tracks the rat within a cone.
  if (px != null) {
    const want = clamp(angD(Math.atan2(px - e.x, pz - e.z), e.ang), -0.9, 0.9) * (Math.hypot(px - e.x, pz - e.z) < 16 ? 1 : 0.2);
    e.hyaw += (want - e.hyaw) * Math.min(1, dt * (winding ? 14 : 5));
  }
  // Wings beat faster when climbing or attacking, glide when diving.
  if (e.fly) e.flap += dt * (e.st === 'dive' ? 3 : e.st === 'wind' ? 22 : 12 + v * 0.8);
  // Landing squash (spring).
  if (!e.fly) {
    if (e.pvy < -6 && Math.abs(e.vy || 0) < 0.5) e.sqv -= Math.min(6, -e.pvy * 0.5);
    e.pvy = e.vy || 0;
  }
  e.sqv += (-e.sq * 160 - e.sqv * 12) * dt;
  e.sq = clamp(e.sq + e.sqv * dt, -0.4, 0.4);
  // Flinch: a damped wobble after each hit.
  const ht = e.hitT != null ? G.time - e.hitT : 9;
  e.fl = ht < 0.8 ? Math.exp(-ht * 7) * Math.cos(ht * 26) : 0;
}

/** Write a creature's pose into a buffer slot (instanced) or a uniform pair. */
export function writePose(e, A, B, i) {
  const seed = e.ph || 0;
  if (A.isVector4) { A.set(e.gph, e.gam, e.ap, seed); B.set(e.lean, e.hyaw, e.fl, e.flap); return; }
  A.setXYZW(i, e.gph, e.gam, e.ap, seed);
  B.setXYZW(i, e.lean, e.hyaw, e.fl, e.flap);
}
