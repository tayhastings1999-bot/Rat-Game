// Light & shadow. Street lamps, neon, sweeping rooftop searchlights, sewer
// light shafts and the Exterminator's flashlight raise your exposure; in the
// dark you regain stamina faster and predators all but lose you. Max out the
// meter and the cats come running, and an owl takes wing.
import * as THREE from 'three';
import { rand, angD, TAU } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { spark, puff, dnum, fx } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { floorY } from '../world/grid.js';
import { isSewer } from '../data/world.js';
import { hurtP, addThreat } from '../combat/combat.js';
import { spawnEnemy } from '../entities/mobs.js';
import { banner } from '../ui/hud.js';
import { creatureMesh } from '../render/pools.js';

export const EXPO_MAX = 100;
const _up = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3();

/** How lit the rat's spot is right now (0 = pitch dark, 1+ = floodlit). */
export function lightAt(x, y, z) {
  let L = 0;
  const lampsOn = !run.mods.includes('blackout');
  if (lampsOn) for (const l of W.lamps) { const d = Math.hypot(l.x - x, l.z - z); if (d < 6.5) L = Math.max(L, 1 - d / 6.5); }
  if (lampsOn) for (const n of W.neons) { const d = Math.hypot(n.x - x, n.z - z); if (d < 4.5 && Math.abs(n.y - y) < 4) L = Math.max(L, 0.7 * (1 - d / 4.5)); }
  if (run.rain) L *= 0.7; // rain dims the lamps
  for (const s of W.searches) if (Math.hypot(s.sx - x, s.sz - z) < s.R) L = Math.max(L, 1.6);
  for (const s of W.shafts) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.R) L = Math.max(L, 0.95); }
  const b = G.boss;
  if (b && b.kind === 'exterm' && !b.dead) {
    // Its flashlight: a narrow cone out front.
    const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
    if (d < 14 && Math.abs(angD(Math.atan2(dx, dz), b.ang)) < 0.35) L = Math.max(L, 1.3);
  }
  if (!isSewer() && y > 4) L += 0.15; // open rooftops catch the moon
  if (run.moon) L += 0.15;
  return L;
}

function sweep(dt) {
  for (const s of W.searches) {
    s.ph += dt * s.w;
    s.sx = s.cx + Math.sin(s.ph) * s.rx;
    s.sz = s.cz + Math.cos(s.ph * 0.73 + s.o) * s.rz;
    const gy = floorY(s.sx, s.sz);
    s.spot.position.set(s.sx, gy + 0.06, s.sz);
    _d.set(s.sx - s.hx, gy - s.hy, s.sz - s.hz);
    const len = _d.length();
    s.cone.scale.set(1, len, 1);
    s.cone.quaternion.setFromUnitVectors(_up, _d.normalize());
  }
}

export function tickLight(dt) {
  sweep(dt);
  const L = P.inDuct ? 0 : lightAt(P.x, P.y, P.z);
  P.light = L;
  P.shadow = (L < 0.2 || P.smoke) && !P.carry;
  run.expo = run.expo || 0;
  run.expoCd = Math.max(0, (run.expoCd || 0) - dt);
  if (L >= 0.2) run.expo = Math.min(EXPO_MAX, run.expo + L * (P.sprinting ? 20 : 14) * dt);
  else run.expo = Math.max(0, run.expo - (P.squeeze ? 32 : 20) * dt);
  if (run.expo >= EXPO_MAX && run.expoCd <= 0 && G.mode !== 'trial') spotted();
}

function spotted() {
  run.expoCd = 20;
  run.expo = 40;
  sfx('boss');
  let cats = 0;
  for (const e of W.enemies) if (e.pred && e.type !== 'owl' && !e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 55) { e.mode = 'hunt'; e.lost = 0; cats++; dnum(e.x, e.y + 3.4, e.z, '!', 'crit'); }
  if (!isSewer()) {
    const owls = W.enemies.filter(e => e.type === 'owl' && !e.dead).length;
    if (owls < 2) spawnOwl();
    banner('Spotted!', cats ? 'The cats are coming · an owl takes wing · get into the shadows' : 'An owl takes wing · get into the shadows');
  } else {
    for (let i = 0; i < 4; i++) spawnEnemy('bat', P.x + rand(-8, 8), P.z + rand(-8, 8));
    banner('Spotted!', 'Something in the dark heard you');
  }
  addThreat(0.4);
}

// ---------- owl ----------
export function spawnOwl() {
  const mesh = creatureMesh('owl');
  mesh.scale.setScalar(1.5);
  scene.add(mesh);
  const a = rand(0, TAU), hp = 260 * (1 + run.tier * 0.5) * (run.hpM || 1);
  const e = {
    type: 'owl', pred: true, fly: true, mesh, mode: 'hunt', st: 'circle', t: rand(2.5, 4), lost: 0, orb: a,
    x: P.x + Math.sin(a) * 30, y: P.y + 14, z: P.z + Math.cos(a) * 30, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0,
    hp, maxHp: hp, spd: 9, dmg: 30, r: 1, h: 1.6, sc: 1, col: 0x8a7458, blood: 0x9a0c0c, bar: true, flash: 0, slow: 0, ang: 0,
    pT: 0, bT: 0, dT: 0, tT: 0, wind: 0, atkCd: 0, lunge: 0, mass: 2, xp: 12,
  };
  W.enemies.push(e);
  sfx('screech');
  return e;
}

/** Circles overhead, screeches, then dives. Loses you in the shadows. */
export function owlAI(e, dt) {
  e.t -= dt;
  const hidden = P.shadow;
  e.lost = hidden ? e.lost + dt : Math.max(0, e.lost - dt * 2);
  const flyTo = (tx, ty, tz, sp, k = 3) => {
    const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z, l = Math.hypot(dx, dy, dz) || 1;
    const a = 1 - Math.exp(-k * dt);
    e.vx += (dx / l * sp - e.vx) * a; e.vy += (dy / l * sp - e.vy) * a; e.vz += (dz / l * sp - e.vz) * a;
  };
  if (e.st === 'circle') {
    // Wider, lazier circles when it can't see you; gives up after a while in the dark.
    e.orb += dt * (hidden ? 0.35 : 0.7);
    const R = hidden ? 16 : 9;
    flyTo(P.x + Math.sin(e.orb) * R, P.y + 9, P.z + Math.cos(e.orb) * R, e.spd);
    if (e.lost > 8) { e.st = 'leave'; e.t = 4; }
    else if (e.t <= 0 && !hidden) { e.st = 'wind'; e.t = 0.55; sfx('screech'); dnum(e.x, e.y + 2, e.z, '!', 'crit'); }
  } else if (e.st === 'wind') {
    e.vx *= 0.9; e.vy = 2; e.vz *= 0.9;
    e.tx = P.x; e.ty = P.y + 0.5; e.tz = P.z;
    if (e.t <= 0) { e.st = 'dive'; e.t = 1.4; e.hitP = 0; }
  } else if (e.st === 'dive') {
    flyTo(e.tx, e.ty, e.tz, 24, 8);
    if (!e.hitP && Math.hypot(P.x - e.x, P.z - e.z) < e.r + 0.7 && Math.abs(P.y + 0.4 - e.y) < 1.4) {
      e.hitP = 1;
      hurtP(e.dmg, e);
      P.vy = Math.max(P.vy, 6); // talons yank you off your feet
      spark(P.x, P.y + 0.6, P.z, 1.4, 0xffffff);
    }
    if (e.t <= 0 || Math.hypot(e.tx - e.x, e.ty - e.y, e.tz - e.z) < 1) { e.st = 'climb'; e.t = 1.6; puff(e.x, e.y, e.z, 0xd8ccb8, 6, 2); }
  } else if (e.st === 'climb') {
    flyTo(e.x + e.vx, P.y + 10, e.z + e.vz, e.spd * 1.2);
    if (e.t <= 0) { e.st = 'circle'; e.t = rand(3, 5); }
  } else if (e.st === 'leave') {
    flyTo(e.x + (e.x - P.x), P.y + 30, e.z + (e.z - P.z), 14);
    if (e.t <= 0) { e.dead = true; scene.remove(e.mesh); fx('ring', e.x, e.y, e.z, 1, 0xd8ccb8, 0.2); return true; }
  }
  e.x += (e.vx + e.kx) * dt;
  e.y += e.vy * dt;
  e.z += (e.vz + e.kz) * dt;
  e.y = Math.max(e.y, floorY(e.x, e.z) + 0.6);
  e.ang = Math.atan2(e.vx, e.vz);
  e.det = hidden ? 0 : 12;
  e.look = e.st === 'circle' ? Math.atan2(P.x - e.x, P.z - e.z) : e.ang;
  e.pitch = e.st === 'dive' ? 0.6 : e.st === 'climb' ? -0.4 : 0;
  e.roll = e.st === 'circle' ? -0.35 + Math.sin(G.time * 2) * 0.08 : Math.sin(G.time * 9) * (e.st === 'dive' ? 0.05 : 0.25);
  return true;
}
