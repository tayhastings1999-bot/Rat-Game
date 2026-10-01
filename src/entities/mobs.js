// The horde: spawning (threat-scaled, corrupted elites, mutated sewer mobs),
// movement helpers, telegraphed attack patterns per mob type, and the
// per-frame enemy update.
import * as THREE from 'three';
import { rand, randi, clamp, angD, pick, keep, TAU, PI2 } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { GEO, bodyMat } from '../render/models.js';
import { fx, puff, spark, blood, boom, dnum, swipeFx } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { banner } from '../ui/hud.js';
import { M, G as GRAV, toW, tileAt, floorY, solidFor, flowDir, collideBody } from '../world/grid.js';
import { EN, isSewer } from '../data/world.js';
import { CORRUPT } from '../data/items.js';
import { glob } from '../combat/arsenal.js';
import { hit, hurtP, kill, gainXP, aoe } from '../combat/combat.js';
import { warn, puddle } from '../combat/hazards.js';
import { bossAI } from './bosses.js';
import { owlAI } from '../game/light.js';
import { thiefAI } from '../game/objectives.js';

const CORRUPT_KEYS = Object.keys(CORRUPT);

// ---------- spawning ----------
/**
 * Staggered roster: each mob type joins the horde at a set point in the run
 * (seconds of run time, plus 45s per cleared district), announced with a
 * banner, and fades in over a minute instead of arriving at full strength.
 */
export const ROSTER = {
  surface: [['mawling', 0], ['roach', 30], ['bat', 70], ['crow', 120], ['tick', 180], ['cat', 280], ['wasp', 360], ['ghoul', 450], ['moth', 540], ['brute', 640], ['shade', 750]],
  sewer: [['mawling', 0], ['tick', 0], ['roach', 30], ['bat', 70], ['ghoul', 120], ['bloat', 180], ['moth', 250], ['shade', 330], ['brute', 420], ['wasp', 500]],
};
const WEIGHT = { mawling: 4, roach: 2, bat: 1.6, crow: 2, tick: 2, cat: 1.3, wasp: 1.3, ghoul: 1.4, bloat: 1.3, moth: 1, brute: 0.8, shade: 1 };
export const INTRO = {
  mawling: ['Mawlings', 'They bite up close and pounce from mid range'],
  roach: ['Roaches', 'They swarm in packs and scale walls'],
  bat: ['Infected bats', 'They screech, then dive: roll through the dive'],
  crow: ['Crows', 'They circle overhead, swoop and throw feathers'],
  tick: ['Ticks', 'They dart in bursts and spit blood'],
  cat: ['Feral cats', 'They pounce harder when you are hurt: dodge the red ring'],
  wasp: ['Wasps', 'Jittery darts, and every third one comes straight at you'],
  ghoul: ['Ghouls', 'Slow, but their slam and poison spit hurt'],
  bloat: ['Bloats', 'They keep their distance and lob poison'],
  moth: ['Moths', 'They blink around and drop poison clouds'],
  brute: ['Brutes', 'They charge in straight lines: sidestep'],
  shade: ['Shades', 'They blink behind you: keep moving'],
};
const rosterClock = () => (run.time || 0) + (run.tier || 0) * 45;
const roster = () => ROSTER[isSewer() ? 'sewer' : 'surface'];

export function pickType() {
  const t = rosterClock(), TL = run.T || 0, mix = {};
  for (const [k, at] of roster()) {
    if (t < at) continue;
    const ramp = clamp((t - at) / 60, 0.15, 1), heavy = k === 'brute' || k === 'ghoul' || k === 'shade' ? 1 + Math.min(1, TL * 0.05) : 1;
    mix[k] = WEIGHT[k] * ramp * heavy;
  }
  let tot = 0;
  for (const k in mix) tot += mix[k];
  let r = Math.random() * tot;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return 'mawling';
}

/** Announce newly unlocked mob types with a banner and a small introductory group. */
function rosterIntros(dt) {
  if (!run.seenMobs) run.seenMobs = {};
  run.introCd = (run.introCd || 0) - dt;
  if (run.introCd > 0) return;
  const t = rosterClock();
  for (const [k, at] of roster()) {
    if (t < at || run.seenMobs[k]) continue;
    run.seenMobs[k] = true;
    if (at === 0 || G.mode === 'trial') continue;
    run.introCd = 8; // one new threat every few seconds at most
    banner('New threat · ' + INTRO[k][0], INTRO[k][1]);
    const n = k === 'brute' || k === 'ghoul' ? 1 : 3;
    for (let i = 0; i < n && M.spawnTiles.length; i++) {
      const s = M.spawnTiles[randi(0, M.spawnTiles.length - 1)];
      spawnEnemy(k, toW(s % M.W) + rand(-1, 1), toW((s / M.W) | 0) + rand(-1, 1), { plain: true });
    }
    return; // one introduction at a time
  }
}

/**
 * o.elite forces a corrupted elite, o.plain forbids one, o.sc scales the body,
 * o.corrupt picks a specific corruption.
 */
export function spawnEnemy(type, x, z, o = {}) {
  if (W.enemies.length >= 220 && !o.force) return null; // story-critical spawns (thief, champion, bounty) ignore the cap
  const D = EN[type], gy = floorY(x, z);
  if (gy > 1.2 && !D.fly && !o.roof) return null;
  const sewer = isSewer();
  const eliteP = run.time < 90 ? 0 : Math.min(0.3, 0.02 + (run.T || 0) * 0.012 + (sewer ? 0.07 : 0));
  const el = !o.plain && (!!o.elite || Math.random() < eliteP);
  const mut = sewer && G.mode !== 'trial';
  const hpm = (run.hpM || 1) * (el ? 2 : 1) * (mut ? 1.5 : 1), sc = (D.sc || 1) * (el ? 1.3 : 1) * (o.sc || 1);
  const e = {
    type, x, y: D.fly ? gy + 2.2 : gy, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0,
    hp: D.hp * hpm * (o.sc ? o.sc : 1) * (o.hpMul || 1), maxHp: D.hp * hpm * (o.sc ? o.sc : 1) * (o.hpMul || 1), mini: !!o.mini, name: o.name,
    spd: D.spd * rand(0.9, 1.1) * (run.spdM || 1) * (mut ? 1.1 : 1), dmg: D.dmg * (run.dmgM || 1) * 1.25 * (mut ? 1.25 : 1),
    r: D.r * (el ? 1.3 : 1) * (o.sc || 1), h: D.h * (el ? 1.3 : 1) * (o.sc || 1), sc, xp: D.xp * (el ? 4 : 1),
    fly: D.fly, col: D.col, blood: D.blood, flash: 0, slow: 0, atk: rand(1, 2.5), ph: rand(0, 6), ang: rand(0, TAU),
    elite: el, mut, corrupt: el ? o.corrupt || pick(CORRUPT_KEYS) : null, bar: D.bar || el,
    pT: 0, pD: 0, bT: 0, bD: 0, dT: 0, tT: 0, lunge: 0, acid: 0, wind: 0, atkCd: 0, ward: 0, trailT: 0, wardT: 0,
    st: 'move', tt: 0, cd: rand(0.6, 1.6), jk: 0, lat: 0, oa: rand(0, TAU), ow: (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.2),
    ax: x, az: z, hv: rand(0.3, 0.9), darts: 0, bl: rand(1.5, 3), tel: 0, mass: (D.mass || 1) * (el ? 1.5 : 1), ai: !!MOBAI[type],
  };
  W.enemies.push(e);
  spark(e.x, e.y + 0.5, e.z, 1.2, el ? CORRUPT[e.corrupt].col : 0xff3a20);
  if (type === 'roach' && !o.pack) for (let i = 0; i < 3; i++) spawnEnemy('roach', x + rand(-1.5, 1.5), z + rand(-1.5, 1.5), { pack: 1, plain: true });
  return e;
}

// ---------- movement ----------
function fallChk(e, g) {
  if (!g) { e.peak = Math.max(e.peak ?? e.y, e.y); return; }
  const f = (e.peak ?? e.y) - e.y;
  e.peak = e.y;
  if (f > 2.6 && !e.dead) {
    hit(e, f * 11, null, 0, 'bonk');
    dnum(e.x, e.y + e.h + 0.4, e.z, 'SPLAT', 'crit');
    puff(e.x, e.y + 0.2, e.z, 0x9a8a7a, 8, 3);
    sfx('splat');
  }
}
export function moveBody(e, dt, vx, vz) {
  e.x += (vx + e.kx) * dt;
  e.z += (vz + e.kz) * dt;
  const py = e.y;
  e.vy -= GRAV * dt;
  e.y += e.vy * dt;
  const g = collideBody(e, py, e.r, e.h, false);
  fallChk(e, g);
  return g;
}
const slowMul = e => st.foeSpd * (e.slow > 0 ? 0.5 : 1) * (e.y < G.tideY - 0.2 ? 0.55 : 1) * ((tileAt(e.x, e.z) === 2 && e.y < -0.4) ? 0.65 : 1);

export function groundChase(e, dt, sp, lat = 0) {
  const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  const dir = flowDir(e);
  let mx, mz;
  if (dir && d > 3) { mx = dir[0]; mz = dir[1]; } else { mx = dx / d; mz = dz / d; }
  if (lat) {
    const ox = mx;
    mx += lat * mz;
    mz -= lat * ox;
    const l = Math.hypot(mx, mz) || 1;
    mx /= l; mz /= l;
  }
  sp *= slowMul(e);
  if (sp > 0) e.ang = Math.atan2(mx, mz);
  const g = moveBody(e, dt, mx * sp, mz * sp);
  if (e.hw && P.y > e.y + 0.6 && d < 8) {
    if (e.type === 'roach') e.vy = 7; // roaches scale walls like the rat does
    else if (g) e.vy = Math.sqrt(2 * GRAV * (Math.min(P.y - e.y, 6) + 1));
  }
  return g;
}
export function flyTo(e, dt, tx, ty, tz, sp) {
  const vx = tx - e.x, vz = tz - e.z, l = Math.hypot(vx, vz) || 1, s = Math.min(sp * st.foeSpd * (e.slow > 0 ? 0.5 : 1), l / Math.max(dt, 0.001));
  e.x += (vx / l * s + e.kx) * dt;
  e.z += (vz / l * s + e.kz) * dt;
  const fy = Math.max(ty, floorY(e.x, e.z) + 0.8);
  e.y += (fy - e.y) * Math.min(1, 3 * dt);
  e.vy = 0;
  collideBody(e, e.y, e.r, e.h, false);
  if (l > 0.3) e.ang = Math.atan2(vx, vz);
}

// ---------- attack building blocks (shared with bosses) ----------
/** Wind up for t seconds (flashing red), then run fn. */
export function wait(e, t, fn, up = 0) { e.st = 'wind'; e.tt = t; e.tel = t; e.act = fn; e.up = up; }
export function bite(e, R, dmg) {
  e.lunge = 0.2;
  if (Math.hypot(P.x - e.x, P.z - e.z) < R + e.r * 0.5 && P.y < e.y + e.h + 0.4 && P.y + 0.9 > e.y - 0.4) hurtP(dmg, e);
}
export function cone(e, R, arc, dmg) {
  swipeFx(e.ang, R, 0xff5040, R > 3, e);
  const dx = P.x - e.x, dz = P.z - e.z;
  if (Math.hypot(dx, dz) < R + 0.3 && Math.abs(angD(Math.atan2(dx, dz), e.ang)) < arc && Math.abs(P.y - e.y) < 1.8) hurtP(dmg, e);
}
export function aimShot(e, spd, dmg, col, life = 1.2, off = 0, size = 1, at = null) {
  // Mini-bosses and champions lead you fully; the horde only partly.
  const y0 = e.y + e.h * 0.6, dd = Math.hypot(P.x - e.x, P.z - e.z), lt = Math.max(dd / spd, 0.2), k = e.mini || e.champion ? 1 : 0.6;
  const tx = at ? at.x : P.x + P.vx * lt * k, tz = at ? at.z : P.z + P.vz * lt * k, a = Math.atan2(tx - e.x, tz - e.z) + off;
  const p = glob(e.x, y0, e.z, Math.sin(a) * spd, (P.y + 0.5 - y0) / lt, Math.cos(a) * spd, dmg, col);
  p.life = life * 2;
  p.size = size;
  return p;
}
export function lobAt(e, tx, ty, tz, spd, dmg, col, pud, size = 1.4) {
  const y0 = e.y + e.h * 0.7, D = Math.hypot(tx - e.x, tz - e.z), ft = clamp(D / spd, 0.45, 1.5), g = GRAV * 0.55;
  const p = glob(e.x, y0, e.z, (tx - e.x) / ft, (ty + 0.3 - y0) / ft + 0.5 * g * ft, (tz - e.z) / ft, dmg, col);
  p.g = g;
  p.pud = pud;
  p.size = size;
  p.r = 0.5 + size * 0.3;
  p.life = 4;
  fx('ring', tx, ty, tz, 1.4, 0xff3a20, ft, 0, 0.7);
  return p;
}
export function pounceAt(e, wind, dur, hgt, dmg, R, after, target, roof) {
  let tx = target ? target.x : P.x + P.vx * wind * 0.5, tz = target ? target.z : P.z + P.vz * wind * 0.5;
  if (!roof && solidFor(tileAt(tx, tz), false) && floorY(tx, tz) > P.y + 0.5) { tx = P.x; tz = P.z; }
  const ty = floorY(tx, tz);
  fx('warn', tx, ty, tz, R, 0xff2a1a, wind + dur, 0, 0.45);
  fx('ring', tx, ty, tz, R, 0xff4a2a, wind + dur, 0, 0.9);
  wait(e, wind, e => {
    Object.assign(e, {
      st: 'leap', tt: dur, lt: dur, sx: e.x, sy: e.y, sz: e.z, tx, ty, tz, lh: hgt,
      land: e => {
        puff(e.x, e.y + 0.2, e.z, 0x9a8a7a, 6, 2);
        if (Math.hypot(P.x - e.x, P.z - e.z) < R + 0.3 && Math.abs(P.y - e.y) < 1.6) hurtP(dmg, e);
        if (after && !e.dead) after(e);
      },
    });
  });
}
/** `aim(e)` may return a heading (bosses lead you); `bounces` ricochets off walls, re-aiming each time. */
export function chargeStart(e, wind, spd, dur, aim, bounces = 0) {
  fx('ring', e.x, e.y, e.z, e.r + 1.2, 0xff3a20, wind, 0, 0.9);
  wait(e, wind, e => {
    const a = aim ? aim(e) : Math.atan2(P.x - e.x, P.z - e.z);
    Object.assign(e, { st: 'charge', tt: dur, ct: dur, cx: Math.sin(a), cz: Math.cos(a), cs: spd, hitP: 0, bounces, reaim: aim });
  });
}
export function swoop(e, dur) {
  const px = P.x, py = P.y + 0.5, pz = P.z, p0 = [e.x, e.y, e.z], p2 = [px + (px - e.x), py + 4, pz + (pz - e.z)];
  Object.assign(e, { st: 'swoop', tt: dur, lt: dur, hitP: 0, p0, p2, c: [2 * px - (p0[0] + p2[0]) / 2, Math.max(2 * py - (p0[1] + p2[1]) / 2, floorY(px, pz) + 0.3), 2 * pz - (p0[2] + p2[2]) / 2] });
}

/** Shared state machine for wind-ups, leaps, charges, dives, swoops and darts. Returns true if it moved the mob. */
export function mobState(e, dt, dx, dz) {
  if (e.stun > 0) { e.stun -= dt; if (!e.fly) moveBody(e, dt, 0, 0); return true; }
  if (e.st === 'wind') {
    e.tt -= dt;
    e.tel = Math.max(0, e.tt);
    if (e.fly) { e.y += e.up * dt; collideBody(e, e.y, e.r, e.h, false); } else moveBody(e, dt, 0, 0);
    e.ang += angD(Math.atan2(dx, dz), e.ang) * Math.min(1, 8 * dt);
    if (e.tt <= 0) { e.st = 'move'; e.tel = 0; const f = e.act; e.act = null; if (f && !e.dead) f(e); }
    return true;
  }
  if (e.st === 'leap') {
    e.tt -= dt;
    const u = clamp(1 - e.tt / e.lt, 0, 1);
    e.x = e.sx + (e.tx - e.sx) * u;
    e.z = e.sz + (e.tz - e.sz) * u;
    e.y = e.sy + (e.ty - e.sy) * u + Math.sin(Math.PI * u) * e.lh;
    e.ang = Math.atan2(e.tx - e.sx, e.tz - e.sz);
    if (e.tt <= 0) { e.y = e.ty; e.vy = 0; e.peak = e.y; e.st = 'move'; const f = e.land; e.land = null; if (f) f(e); }
    return true;
  }
  if (e.st === 'charge') {
    e.tt -= dt;
    moveBody(e, dt, e.cx * e.cs, e.cz * e.cs);
    e.ang = Math.atan2(e.cx, e.cz);
    if (Math.random() < 0.4) puff(e.x, e.y + 0.2, e.z, 0x8a7a6a, 1, 2);
    if (!e.hitP && Math.hypot(P.x - e.x, P.z - e.z) < e.r + 0.6 && Math.abs(P.y - e.y) < 1.6) { e.hitP = 1; hurtP(e.dmg * 1.3, e); }
    if (e.hw && e.bounces > 0) {
      // Ricochet: bounce off the wall and come again at where the rat is heading.
      e.bounces--;
      const a = e.reaim ? e.reaim(e) : Math.atan2(P.x - e.x, P.z - e.z);
      e.cx = Math.sin(a); e.cz = Math.cos(a); e.tt = e.ct; e.hitP = 0;
      e.x += e.cx * 0.6; e.z += e.cz * 0.6;
      G.shake = Math.max(G.shake, 0.25);
      puff(e.x, e.y + 1, e.z, 0x9a8a7a, 8, 3);
      return true;
    }
    if (e.tt <= 0 || e.hw) {
      if (e.hw) { e.stun = e.boss ? 0.9 : 0.7; G.shake = Math.max(G.shake, 0.2); puff(e.x, e.y + 1, e.z, 0x9a8a7a, 8, 3); }
      e.st = 'move';
      if (e.onChargeEnd) { const f = e.onChargeEnd; e.onChargeEnd = null; f(e); }
    }
    return true;
  }
  if (e.st === 'dive') {
    e.tt -= dt;
    const vx = e.tx - e.x, vy = e.ty - e.y, vz = e.tz - e.z, l = Math.hypot(vx, vy, vz) || 1, sp = e.diveSp || 24;
    e.x += vx / l * sp * dt; e.y += vy / l * sp * dt; e.z += vz / l * sp * dt;
    e.pitch = 0.9;
    e.ang = Math.atan2(vx, vz);
    if (!e.hitP && Math.hypot(P.x - e.x, P.z - e.z) < e.r + 0.7 && Math.abs(P.y + 0.5 - e.y) < 1.2 + (e.boss ? 1 : 0)) { e.hitP = 1; hurtP(e.dmg * 1.3, e); }
    if (l < 0.7 || e.tt <= 0 || e.y <= floorY(e.x, e.z) + 0.2) {
      e.st = 'rise'; e.tt = 0.8; e.pitch = 0;
      puff(e.x, e.y, e.z, 0x9a8a7a, 5, 2);
      if (e.onDiveEnd) { const f = e.onDiveEnd; e.onDiveEnd = null; f(e); }
    }
    return true;
  }
  if (e.st === 'rise') {
    e.tt -= dt;
    e.pitch = -0.4;
    flyTo(e, dt, e.x - dx * 0.3, P.y + 4.5, e.z - dz * 0.3, e.spd * 1.2);
    if (e.tt <= 0) { e.st = 'move'; e.pitch = 0; }
    return true;
  }
  if (e.st === 'swoop') {
    e.tt -= dt;
    const u = clamp(1 - e.tt / e.lt, 0, 1), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u, q = i => a * e.p0[i] + b * e.c[i] + c * e.p2[i], ox = e.x, oz = e.z;
    e.x = q(0); e.y = q(1); e.z = q(2);
    e.ang = Math.atan2(e.x - ox, e.z - oz);
    e.roll = Math.sin(u * Math.PI) * 0.9;
    if (!e.hitP && Math.hypot(P.x - e.x, P.z - e.z) < e.r + 0.8 && Math.abs(P.y + 0.5 - e.y) < 1.3 + (e.boss ? 1 : 0)) { e.hitP = 1; hurtP(e.dmg, e); }
    if (e.tt <= 0) { e.st = 'move'; e.roll = 0; }
    return true;
  }
  if (e.st === 'dart') {
    e.tt -= dt;
    e.x += e.cx * dt;
    e.z += e.cz * dt;
    e.y += (e.dy - e.y) * Math.min(1, 8 * dt);
    collideBody(e, e.y, e.r, e.h, false);
    if (!e.hitP && Math.hypot(P.x - e.x, P.z - e.z) < e.r + 0.5 && Math.abs(P.y + 0.5 - e.y) < 1) { e.hitP = 1; hurtP(e.dmg, e); }
    if (e.tt <= 0) { e.st = 'move'; e.hv = rand(0.35, 0.9); }
    return true;
  }
  return false;
}

/** Per-type AI: movement style plus a set of attacks chosen by distance (and sometimes the rat's HP). */
export const MOBAI = {
  mawling(e, dt, dx, dz, d, sp) {
    e.jk -= dt;
    if (e.jk <= 0) { e.jk = rand(0.3, 0.8); e.lat = rand(-1.2, 1.2); }
    groundChase(e, dt, sp, d < 7 ? e.lat : e.lat * 0.3);
    if (e.cd <= 0) {
      if (d < 1.7) { e.cd = 1; wait(e, 0.26, e => bite(e, 1.5, e.dmg)); }
      else if (d > 2.5 && d < 5.5 && Math.random() < 0.45) { e.cd = 2.2; pounceAt(e, 0.4, 0.42, 1.8, e.dmg * 1.2, 1.4); }
      else e.cd = 0.3;
    }
  },
  roach(e, dt, dx, dz, d, sp) {
    e.jk -= dt;
    if (e.jk <= 0) { e.jk = rand(0.07, 0.2); e.lat = rand(-2.4, 2.4); }
    groundChase(e, dt, sp, d < 3 ? e.lat * 0.4 : e.lat);
    if (e.cd <= 0 && d < e.r + 0.8) { e.cd = 0.8; bite(e, 0.9, e.dmg); }
  },
  tick(e, dt, dx, dz, d, sp) {
    e.jk -= dt;
    if (e.jk <= 0) { e.dash = !e.dash; e.jk = e.dash ? rand(0.18, 0.34) : rand(0.08, 0.22); e.lat = rand(-1.8, 1.8); }
    if (e.dash) groundChase(e, dt, sp * 2.1, e.lat); else moveBody(e, dt, 0, 0);
    if (e.cd <= 0) {
      if (d < 3.6) { e.cd = 1.5; pounceAt(e, 0.22, 0.34, 1.3, e.dmg, 1.2); }
      else if (d < 9 && Math.random() < 0.35) { e.cd = 2; wait(e, 0.25, e => aimShot(e, 14, e.dmg * 0.7, 0xc01818)); }
      else e.cd = 0.4;
    }
  },
  ghoul(e, dt, dx, dz, d, sp) {
    groundChase(e, dt, sp, Math.sin(G.time * 1.3 + e.ph) * 0.7);
    if (e.cd <= 0) {
      if (d < 2.3) { e.cd = 1.5; wait(e, 0.38, e => cone(e, 2.8, 1, e.dmg)); }
      else if (d < 3.6 && Math.random() < 0.4) { e.cd = 3.2; warn(e.x, e.z, 3.4, 0.75, e.dmg * 1.2, { y: e.y, kb: 1 }); wait(e, 0.75, null); }
      else if (d < 8 && Math.random() < 0.5) { e.cd = 3; wait(e, 0.5, e => { for (let k = -2; k <= 2; k++) { const p = aimShot(e, 8, e.dmg * 0.6, 0x9ad040, 1, k * 0.2); p.pud = 'poison'; } }); }
      else e.cd = 0.5;
    }
  },
  bloat(e, dt, dx, dz, d, sp) {
    if (d < 6) groundChase(e, dt, -sp * 0.8, 0.5);
    else if (d > 11) groundChase(e, dt, sp, 0);
    else { const a = Math.atan2(dx, dz) + PI2 * (e.ph > 3 ? 1 : -1); moveBody(e, dt, Math.sin(a) * sp * 0.7, Math.cos(a) * sp * 0.7); }
    e.ang = Math.atan2(dx, dz);
    if (e.cd <= 0) {
      if (d < 4.2 && Math.random() < 0.45) { e.cd = 3; chargeStart(e, 0.5, 13, 0.6); }
      else if (d < 17) { e.cd = 2.3; wait(e, 0.35, e => lobAt(e, P.x + P.vx * 0.6, P.y, P.z + P.vz * 0.6, 11, e.dmg, 0x9be06a, 'poison')); }
      else e.cd = 0.5;
    }
  },
  brute(e, dt, dx, dz, d, sp) {
    groundChase(e, dt, sp, 0);
    if (e.cd <= 0) {
      if (d < 3.4) { e.cd = 2.6; warn(e.x, e.z, 3.9, 0.75, e.dmg * 1.2, { y: e.y, kb: 1 }); wait(e, 0.75, null); }
      else if (d > 4 && d < 13 && Math.random() < 0.55) { e.cd = 3.4; chargeStart(e, 0.65, 17, 0.85); }
      else if (d > 6 && Math.random() < 0.5) { e.cd = 3; wait(e, 0.55, e => lobAt(e, P.x, P.y, P.z, 13, e.dmg, 0x7a6a5a, null, 2.4)); }
      else e.cd = 0.5;
    }
  },
  // Feral cat: telegraphed pounce, a two-hit swipe up close, hairballs at range — more pounces when the rat is hurt.
  cat(e, dt, dx, dz, d, sp) {
    const low = run.hp < st.maxHp * 0.4;
    groundChase(e, dt, sp * (d > 6 ? 1.15 : 0.75), d < 6 ? Math.sin(G.time * 2.2 + e.ph) * 1.1 : 0);
    if (e.cd <= 0) {
      if (d < 2) { e.cd = 1.2; wait(e, 0.24, e => { cone(e, 2.2, 1.1, e.dmg); wait(e, 0.16, e => cone(e, 2.2, 1.1, e.dmg * 0.8)); }); }
      else if (d < 9 && (low || Math.random() < 0.55)) { e.cd = low ? 1.6 : 2.3; pounceAt(e, 0.48, 0.5, 2.4, e.dmg * 1.4, 1.8); }
      else if (d > 4) { e.cd = 2.4; wait(e, 0.4, e => { for (let i = 0; i < (low ? 3 : 1); i++) lobAt(e, P.x + P.vx * 0.5 + rand(-1.5, 1.5) * i, P.y, P.z + P.vz * 0.5 + rand(-1.5, 1.5) * i, 10, e.dmg * 0.8, 0xa08060, null, 1.6); }); }
      else e.cd = 0.3;
    }
  },
  // Infected bat: sine-wave weave, screech then dive-bomb, or a sonic screech ring that slows.
  bat(e, dt, dx, dz, d, sp) {
    const a = Math.atan2(dx, dz), w = Math.cos(G.time * 5 + e.ph) * 1.7, f = d > 2.5 ? 1 : -0.6;
    const vx = (Math.sin(a) * f + Math.cos(a) * w) * sp, vz = (Math.cos(a) * f - Math.sin(a) * w) * sp;
    e.x += (vx * st.foeSpd + e.kx) * dt;
    e.z += (vz * st.foeSpd + e.kz) * dt;
    const ty = Math.max(P.y, floorY(e.x, e.z)) + 1.6 + Math.sin(G.time * 4.3 + e.ph) * 1.1;
    e.y += (ty - e.y) * Math.min(1, 3 * dt);
    collideBody(e, e.y, e.r, e.h, false);
    e.ang = Math.atan2(vx, vz);
    if (e.cd <= 0) {
      if (d < 10 && Math.random() < 0.55) {
        e.cd = 2.6; sfx('screech');
        wait(e, 0.5, e => { const tx = P.x, ty = P.y + 0.5, tz = P.z; fx('ring', tx, floorY(tx, tz), tz, 1.4, 0xff3a20, 0.45, 0, 0.9); Object.assign(e, { st: 'dive', tt: 0.9, tx, ty, tz, hitP: 0 }); }, 3.5);
      } else if (d < 6) { e.cd = 4; sfx('screech'); warn(e.x, e.z, 4.4, 0.85, e.dmg * 0.9, { y: Math.min(e.y - 1, P.y), slow: 1, col: 0xb080ff }); wait(e, 0.85, null); }
      else e.cd = 0.4;
    }
  },
  // Territorial crow: erratic orbit that flips direction, swoops through you, or a three-feather volley.
  crow(e, dt, dx, dz, d, sp) {
    e.oa += dt * e.ow * (1 + 0.5 * Math.sin(G.time * 0.9 + e.ph));
    if (Math.random() < dt * 0.35) e.ow *= -1;
    const r = 6.5 + Math.sin(G.time * 0.7 + e.ph) * 2.5;
    flyTo(e, dt, P.x + Math.sin(e.oa) * r, Math.max(P.y, 0) + 3.4 + Math.sin(G.time * 2.6 + e.ph) * 1.2, P.z + Math.cos(e.oa) * r, sp * 1.7);
    if (e.cd <= 0) {
      if (d < 13 && Math.random() < 0.6) { e.cd = 2.4; sfx('caw'); wait(e, 0.35, e => swoop(e, 1)); }
      else if (d < 16) { e.cd = 2.8; wait(e, 0.3, e => { for (let k = -1; k <= 1; k++) aimShot(e, 19, e.dmg * 0.6, 0x3a3040, 0.9, k * 0.18, 0.7); }); }
      else e.cd = 0.4;
    }
  },
  // Moth: lissajous drift around a lagging anchor, poison dust clouds, blink-teleports.
  moth(e, dt, dx, dz, d, sp) {
    e.ax += (P.x - e.ax) * Math.min(1, 0.5 * dt);
    e.az += (P.z - e.az) * Math.min(1, 0.5 * dt);
    const q = G.time * 1.4 + e.ph;
    flyTo(e, dt, e.ax + Math.sin(q) * 4.5, Math.max(P.y, 0) + 2.2 + Math.sin(q * 2.3) * 1.2, e.az + Math.sin(q * 2) * 3, sp * 2.2);
    e.roll = Math.sin(q * 3) * 0.5;
    if (e.cd <= 0) {
      if (d < 11 && Math.random() < 0.55) { e.cd = 3.2; const tx = P.x + P.vx * 0.4, tz = P.z + P.vz * 0.4; warn(tx, tz, 2.3, 0.75, e.dmg * 0.6, { col: 0x9ad040, fn: () => puddle('poison', tx, tz, 2.3, 5, 'e') }); }
      else { e.cd = 2; puff(e.x, e.y, e.z, 0xd8d0b0, 8, 2); const a = rand(0, TAU); e.x += Math.sin(a) * 5; e.z += Math.cos(a) * 5; e.ax = e.x; e.az = e.z; puff(e.x, e.y, e.z, 0xd8d0b0, 8, 2); }
    }
  },
  // Wasp: jittery hover with instant darts — every third dart goes straight for you.
  wasp(e, dt, dx, dz, d) {
    e.hv -= dt;
    const ty = Math.max(P.y, 0) + 1.6 + Math.sin(G.time * 9 + e.ph) * 0.15;
    e.x += (rand(-2, 2) + e.kx) * dt;
    e.z += (rand(-2, 2) + e.kz) * dt;
    e.y += (ty - e.y) * Math.min(1, 4 * dt);
    collideBody(e, e.y, e.r, e.h, false);
    e.ang += angD(Math.atan2(dx, dz), e.ang) * Math.min(1, 6 * dt);
    if (e.hv <= 0) {
      e.darts++;
      let tx, tz;
      if (e.darts % 3 === 0) { tx = P.x + dx / d * 3; tz = P.z + dz / d * 3; }
      else { const a = rand(0, TAU), r = rand(2, 5); tx = P.x + Math.sin(a) * r; tz = P.z + Math.cos(a) * r; }
      let vx = (tx - e.x) / 0.22, vz = (tz - e.z) / 0.22;
      const l = Math.hypot(vx, vz);
      if (l > 45) { vx *= 45 / l; vz *= 45 / l; }
      Object.assign(e, { st: 'dart', tt: 0.22, cx: vx, cz: vz, dy: ty, hitP: 0 });
      return;
    }
    if (e.cd <= 0 && d < 14) { e.cd = 1.9; wait(e, 0.28, e => aimShot(e, 20, e.dmg * 0.7, 0xf0d040, 0.8, 0, 0.7)); }
  },
  // Shade: weaving approach, blinks behind you and slashes, or fires a slow homing hex.
  shade(e, dt, dx, dz, d, sp) {
    groundChase(e, dt, sp * 0.8, Math.sin(G.time * 3 + e.ph) * 1.6);
    e.bl -= dt;
    if (e.bl <= 0 && d < 22) {
      e.bl = rand(2.2, 3.6) / (run.atkM || 1);
      puff(e.x, e.y + 0.5, e.z, 0x2a1a3a, 10, 2.5);
      for (let i = 0; i < 6; i++) {
        const a = P.facing + Math.PI + rand(-0.9, 0.9), r = rand(1.8, 3), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r, fy = floorY(x, z);
        if (Math.abs(fy - P.y) < 1.2) { e.x = x; e.z = z; e.y = fy; e.vy = 0; break; }
      }
      puff(e.x, e.y + 0.5, e.z, 0x6a3a9a, 10, 2.5);
      spark(e.x, e.y + 0.6, e.z, 1.2, 0xb080ff);
      wait(e, 0.4, e => cone(e, 2.2, 1.2, e.dmg));
    } else if (e.cd <= 0 && d > 5 && d < 16) {
      e.cd = 3;
      wait(e, 0.45, e => { const p = aimShot(e, 7, e.dmg * 0.8, 0x8040c0, 3); p.home = 1; });
    }
  },
};

/** Knocked-back mobs smash into each other for collateral damage (the bonk). */
function bonkPair(a, b) {
  if (!(a.bonk > 0) || b.heavy || b.boss || b.type === 'nest') return;
  const sp = Math.hypot(a.kx, a.kz);
  if (sp < 5) return;
  const ang = Math.atan2(b.x - a.x, b.z - a.z);
  a.bonk = 0;
  a.kx *= 0.5;
  a.kz *= 0.5;
  hit(b, sp * 2.2, ang, sp * 0.35, 'bonk');
  b.bonk = 0.4;
  spark((a.x + b.x) / 2, a.y + 0.6, (a.z + b.z) / 2, 1.2);
  if (Math.random() < 0.5) dnum(b.x, b.y + b.h + 0.4, b.z, 'BONK', 'crit');
  G.shake = Math.max(G.shake, 0.12);
  if (st.mut.recoil) recoilBlast(a);
}
function recoilBlast(e) {
  aoe(e.x, e.y, e.z, 2.4, 22, 5, 'recoil');
  boom(e.x, e.y + 0.5, e.z, 2.6, 0xffb070);
  e.bonk = 0;
}

// ---------- predators (big patrol cats) ----------
export function addPred(path) {
  const mesh = new THREE.Mesh(GEO.cat.body, bodyMat());
  mesh.add(new THREE.Mesh(GEO.cat.glow, new THREE.MeshBasicMaterial({ vertexColors: true })));
  mesh.scale.setScalar(1.6);
  mesh.castShadow = true;
  scene.add(mesh);
  const s = path[0], x = toW(s % M.W), z = toW((s / M.W) | 0), hp = 700 * (1 + run.tier * 0.6) * (run.hpM || 1);
  W.enemies.push({ type: 'brute', pred: true, mesh, path, pi: 0, mode: 'patrol', lost: 0, x, y: 0, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp, spd: 2.6, dmg: 26, r: 1.2, h: 3, sc: 1, col: 0x8a5a30, blood: 0x9a0c0c, heavy: true, bar: true, flash: 0, slow: 0, ang: 0, pT: 0, bT: 0, dT: 0, tT: 0, wind: 0, atkCd: 0, lunge: 0, mass: 4 });
}

// ---------- per-frame update ----------
export function updateEnemies(dt, cap) {
  for (const e of W.enemies) {
    if (e.dead) continue;
    e.flash -= dt; e.slow -= dt; e.tT -= dt; e.lunge -= dt; e.ward -= dt;
    if (e.invuln > 0) e.invuln -= dt;
    if (!e.fly && e.y < -3) {
      // Fell into a collapsed pit. Bosses climb back out; everything else is gone.
      if (e.boss) { e.x = P.x + rand(-6, 6); e.z = P.z + rand(-6, 6); e.y = floorY(e.x, e.z) + 6; e.vy = 0; continue; }
      e.dead = true; run.kills++; gainXP(e.xp || 1); continue;
    }
    // Poison and burn ticks.
    if (e.pT > 0 || e.bT > 0) {
      e.dT -= dt;
      if (e.dT <= 0) {
        e.dT = 0.5;
        let d = (e.pT > 0 ? e.pD || 3 : 0) * 0.5 + (e.bT > 0 ? e.bD : 0) * 0.5;
        d = Math.max(1, Math.round(d * (e.ward > 0 ? 0.4 : 1)));
        e.hp -= d;
        run.dmgBy.dot = (run.dmgBy.dot || 0) + d;
        run.dmg += d;
        dnum(e.x, e.y + e.h + 0.2, e.z, d, e.bT > 0 ? 'burn' : 'poison');
        if (e.hp <= 0) { kill(e); continue; }
      }
      e.pT -= dt;
      e.bT -= dt;
    }
    if (e.type === 'nest') {
      e.core.scale.setScalar(1 + Math.sin(G.time * 5 + e.x) * 0.15 + (e.flash > 0 ? 0.4 : 0));
      e.spawnT -= dt;
      if (e.spawnT <= 0 && Math.hypot(e.x - P.x, e.z - P.z) < 45) {
        e.spawnT = Math.max(1.4, 3.4 - run.time / 150) / (1 + (run.T || 0) * 0.04);
        if (W.enemies.length < cap + 20) { const a = rand(0, TAU); spawnEnemy(pickType(), e.x + Math.sin(a) * 2, e.z + Math.cos(a) * 2); }
      }
      continue;
    }
    if (e.rival) continue; // rival nests (Squeeze Network) are static; ducts.js runs them
    if (e.thief) { thiefAI(e, dt); continue; }
    if (e.corrupt) tickCorrupt(e, dt);
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    let custom = false;
    if (e.boss) custom = bossAI(e, dt, dx, dz, d);
    else if (e.ai) {
      custom = true;
      const haste = e.corrupt === 'haste';
      e.cd -= dt * (run.atkM || 1) * (haste ? 1.6 : 1);
      if (!mobState(e, dt, dx, dz)) MOBAI[e.type](e, dt, dx, dz, d, e.spd * (haste ? 1.4 : 1));
    }
    if (e.type === 'owl') custom = owlAI(e, dt);
    else if (e.pred && !custom) custom = predAI(e, dt, d);
    if (!custom) {
      // Generic chaser with a telegraphed contact bite (predators on the hunt).
      const sp = e.spd * slowMul(e) * (e.pred ? 2 : 1) * (e.wind > 0 ? 0.12 : 1), dir = flowDir(e);
      let mx, mz;
      if (dir && d > 3) { mx = dir[0]; mz = dir[1]; } else { mx = dx / d; mz = dz / d; }
      e.x += (mx * sp + e.kx) * dt;
      e.z += (mz * sp + e.kz) * dt;
      e.ang = Math.atan2(mx, mz);
      const py = e.y;
      e.vy -= GRAV * dt;
      e.y += e.vy * dt;
      const g = collideBody(e, py, e.r, e.h, false);
      fallChk(e, g);
      if (e.hw && g && P.y > e.y + 0.5 && d < 7) e.vy = Math.sqrt(2 * GRAV * (Math.min(P.y - e.y, 8) + 0.8));
    }
    // Launched mobs that slam into walls with Slingshot Recoil explode.
    if (e.bonk > 0 && e.hw && st.mut.recoil && Math.hypot(e.kx, e.kz) > 5) recoilBlast(e);
    if (tileAt(e.x, e.z) === 4 && e.y < -0.5 && !e.fly) {
      e.acid -= dt;
      if (e.acid <= 0) { e.acid = 0.5; e.hp -= 6 + (e.bonk > 0 ? 30 : 0); blood(e.x, e.y + 0.3, e.z, 0xb8f040, null, 2); if (e.hp <= 0) { kill(e); continue; } }
    }
    const k = Math.exp(-(e.bonk > 0 ? 2 : 7) * dt);
    e.kx *= k;
    e.kz *= k;
    e.bonk = (e.bonk || 0) - dt;
    if (e.ai || e.boss) continue;
    const reach = e.r + 0.5, yok = P.y < e.y + e.h && P.y + 0.9 > e.y - 0.3;
    e.atkCd -= dt * (run.atkM || 1);
    if (e.wind > 0) {
      e.wind -= dt;
      if (e.wind <= 0) { e.lunge = 0.2; if (d < reach + 0.6 && yok) hurtP(e.dmg, e); }
    } else if (e.atkCd <= 0 && d < reach && yok) {
      const big = e.heavy || e.elite || e.type === 'brute';
      e.wind = e.fly ? 0.22 : big ? 0.55 : 0.36;
      e.atkCd = 1 + e.wind;
      if (big) fx('ring', e.x, e.y, e.z, reach + 0.6, 0xff3020, e.wind, 0, 0.9);
    }
  }
  // Separation (and bonks) between bodies, using a coarse spatial grid instead of every pair.
  const cells = new Map(), CS = 2.5;
  let idx = 0;
  for (const e of W.enemies) {
    e._i = idx++;
    if (e.dead || e.type === 'nest') continue;
    const k = Math.floor(e.x / CS) * 4096 + Math.floor(e.z / CS);
    let l = cells.get(k);
    if (!l) cells.set(k, (l = []));
    l.push(e);
  }
  for (const a of W.enemies) {
    if (a.dead || a.type === 'nest') continue;
    const cx = Math.floor(a.x / CS), cz = Math.floor(a.z / CS);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const l = cells.get((cx + ox) * 4096 + cz + oz);
      if (!l) continue;
      for (const b of l) {
        if (b._i <= a._i || b.dead) continue; // each pair once
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-4 && Math.abs(a.y - b.y) < 1.4) {
          bonkPair(a, b);
          bonkPair(b, a);
          const d = Math.sqrt(d2), p = (rr - d) * 0.5 / d, wa = a.heavy ? 0 : b.heavy ? 1 : 0.5;
          a.x -= dx * p * 2 * wa; a.z -= dz * p * 2 * wa;
          b.x += dx * p * 2 * (1 - wa); b.z += dz * p * 2 * (1 - wa);
        }
      }
    }
  }
  keep(W.enemies, e => !e.dead);
}

function predAI(e, dt, d) {
  // Shadows all but hide you; standing in light makes you easy to spot.
  const det = P.inDuct ? 0 : (P.squeeze ? 3.5 : P.sprinting ? 12 : 8.5) * (P.shadow ? 0.3 : 1 + (run.expo || 0) / 100);
  e.det = e.mode === 'hunt' ? 18 : det;
  e.look = e.ang + Math.sin(G.time * 0.9 + (e.ph || 0)) * 0.45;
  if (e.mode === 'patrol') {
    // It sees you inside its view cone (±52°), or senses you when you're right on top of it.
    const inCone = Math.abs(angD(Math.atan2(P.x - e.x, P.z - e.z), e.look)) < 0.9;
    if ((d < det && (inCone || d < det * 0.3) && Math.abs(P.y - e.y) < 3) || e.hurt) { e.mode = 'hunt'; e.lost = 0; dnum(e.x, e.y + 3.4, e.z, '!', 'crit'); return false; }
    const k = e.path[e.pi], tx = toW(k % M.W), tz = toW((k / M.W) | 0), vx = tx - e.x, vz = tz - e.z, l = Math.hypot(vx, vz);
    if (l < 0.8) e.pi = (e.pi + 1) % e.path.length;
    else { e.x += vx / l * e.spd * dt; e.z += vz / l * e.spd * dt; e.ang = Math.atan2(vx, vz); }
    const py = e.y;
    e.vy -= GRAV * dt;
    e.y += e.vy * dt;
    collideBody(e, py, e.r * 0.7, e.h, false);
    return true;
  }
  if (d > 18 || P.smoke || P.inDuct) {
    e.lost += dt;
    if (e.lost > 4) {
      e.mode = 'patrol';
      e.hurt = false;
      let bi = 0, bd = 1e9;
      e.path.forEach((k, i) => { const q = (toW(k % M.W) - e.x) ** 2 + (toW((k / M.W) | 0) - e.z) ** 2; if (q < bd) { bd = q; bi = i; } });
      e.pi = bi;
    }
  } else e.lost = 0;
  return false;
}

function tickCorrupt(e, dt) {
  if (e.corrupt === 'fire') {
    e.trailT -= dt;
    if (e.trailT <= 0) { e.trailT = 0.4; puddle('fire', e.x, e.z, 1.2, 3.5, 'e'); }
  } else if (e.corrupt === 'ward') {
    e.wardT -= dt;
    if (e.wardT <= 0) {
      e.wardT = 0.5;
      for (const o of W.enemies) if (o !== e && !o.dead && !o.boss && Math.hypot(o.x - e.x, o.z - e.z) < 7) o.ward = 0.7;
    }
  }
}

// ---------- spawning tick ----------
/**
 * Spawning ramps with run time and threat: a small cap and slow trickle at
 * first, growing steadily. Surges come every minute or so and are followed by
 * a short lull so there is room to breathe, loot and reposition.
 */
export function spawnTick(dt) {
  const trial = G.mode === 'trial', TL = run.T || 0, mins = run.time / 60;
  rosterIntros(dt);
  const cap = trial ? 45 : Math.min(220, 14 + mins * 9 + TL * 6 + run.tier * 10) * (run.moon ? 1.4 : 1);
  run.lullT = (run.lullT || 0) - dt;
  run.spawnT -= dt;
  if (run.spawnT <= 0 && M.spawnTiles.length) {
    const base = trial ? 2.2 : Math.max(0.18, 1.6 / (1 + TL * 0.12 + mins * 0.05));
    run.spawnT = base * (run.moon ? 0.5 : 1) * (run.lullT > 0 ? 2.5 : 1);
    const n = trial ? 2 : 1 + Math.floor(TL * 0.25);
    for (let i = 0; i < n && W.enemies.length < cap; i++) {
      const k = M.spawnTiles[randi(0, M.spawnTiles.length - 1)];
      spawnEnemy(pickType(), toW(k % M.W) + rand(-1.4, 1.4), toW((k / M.W) | 0) + rand(-1.4, 1.4));
    }
  }
  if (!trial) {
    run.surgeT -= dt;
    if (run.surgeT <= 0 && M.spawnTiles.length) {
      run.surgeT = Math.max(40, 70 - TL * 1.5);
      run.lullT = 12;
      sfx('screech');
      banner('The horde surges', 'Hold on: it thins out after');
      const size = Math.min(40, Math.round(8 + mins * 2 + run.tier * 5));
      for (let i = 0; i < size; i++) {
        const k = M.spawnTiles[randi(0, M.spawnTiles.length - 1)];
        spawnEnemy(i % 3 ? 'mawling' : pickType(), toW(k % M.W) + rand(-1.4, 1.4), toW((k / M.W) | 0) + rand(-1.4, 1.4));
      }
    }
  }
  return cap;
}
