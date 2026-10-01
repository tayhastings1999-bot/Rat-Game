// Mob roles: each new creature has one job in the horde and one counter.
//  - Lidbearer (shieldrat): blocks hits from the front. Flank it, roll past,
//    or hit it while its lid is down for a bash. Big hits break its guard.
//  - Rot Priest: hangs behind the pack and heals it. Kill it first.
//  - Lurker: waits hidden in alley mouths and wall cracks, bursts out when
//    you pass. Sniff (F) to see them; a pair of eyes glints in the dark.
//  - Bin Mimic: looks like a trash can and rattles now and then. Scent shows
//    it; rummaging it is a bad idea. Drops a weapon crate.
//  - Gob Spitter: keeps its distance, hops away when you close in, spits
//    purple acid volleys. Close the gap or break line of sight.
// Plus pack behaviour: flankers, retreat-when-hurt, rage when an elite falls,
// and creature rivalries (cats eat mawlings, the shriek scatters birds).
import { rand, randi, angD } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { fx, puff, spark, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, toW, tAt, floorY, DRY } from '../world/grid.js';
import { kill } from '../combat/combat.js';
import { isSewer } from '../data/world.js';
import { spawnEnemy, groundChase, steer, seekPoint, moveBody, wait, cone, bite, pounceAt, aimShot } from './mobs.js';

// ---------- the role AIs (dispatched from updateEnemies) ----------
export const ROLE_AI = {
  shieldrat(e, dt, dx, dz, d, sp) {
    groundChase(e, dt, sp * (d < 3 ? 0.45 : 1), 0);
    if (e.cd <= 0) {
      if (d < 2.5) { e.cd = 1.9; wait(e, 0.5, e => { cone(e, 2.7, 0.9, e.dmg); e.kx -= Math.sin(e.ang) * 2; e.kz -= Math.cos(e.ang) * 2; }, 0, 'melee'); }
      else e.cd = 0.3;
    }
  },
  priest(e, dt, dx, dz, d, sp) {
    e.pkT = (e.pkT || 0) - dt;
    if (e.pkT <= 0) {
      e.pkT = 0.5;
      let n = 0, sx = 0, sz = 0;
      for (const o of W.enemies) {
        if (o === e || o.dead || o.boss || o.type === 'priest' || o.type === 'nest' || o.rival || o.hidden) continue;
        const q = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
        if (q < 144) { n++; sx += o.x; sz += o.z; }
      }
      e.allies = n;
      if (n) { e.gx = sx / n; e.gz = sz / n; }
    }
    let tx = e.x, tz = e.z;
    if (d < 6.5) { tx = e.x - dx / d * 4; tz = e.z - dz / d * 4; }
    else if (e.allies) { const ax = e.gx - P.x, az = e.gz - P.z, l = Math.hypot(ax, az) || 1; tx = e.gx + ax / l * 3.5; tz = e.gz + az / l * 3.5; }
    else if (d > 12) { tx = P.x; tz = P.z; }
    seekPoint(e, dt, tx, tz, sp);
    if (e.cd <= 0) {
      if (e.allies) {
        e.cd = 3.4;
        fx('ring', e.x, e.y, e.z, 7.5, 0x9be06a, 0.7, 0, 0.8);
        wait(e, 0.7, healPulse, 0, 'heal');
      } else if (d < 15) { e.cd = 2.6; wait(e, 0.5, e => { const p = aimShot(e, 7, e.dmg, 0x9be06a, 2.6); p.home = 1; }, 0, 'shot'); }
      else e.cd = 0.5;
    }
  },
  lurker(e, dt, dx, dz, d, sp) {
    if (e.hidden) {
      moveBody(e, dt, 0, 0);
      e.ang += angD(Math.atan2(dx, dz), e.ang) * Math.min(1, dt * 2);
      // The tell: two eyes glint in the crack now and then.
      if (d < 11 && Math.random() < dt * 0.6) for (const s of [-1, 1]) W.parts.push({ x: e.x + Math.cos(e.ang) * 0.12 * s + Math.sin(e.ang) * 0.6, y: e.y + 1, z: e.z - Math.sin(e.ang) * 0.12 * s + Math.cos(e.ang) * 0.6, vx: 0, vy: 0, vz: 0, life: 0.35, c: 0xd0ff60, s: 0.5, ng: true });
      if ((d < 4.6 && Math.abs(P.y - e.y) < 2.2) || e.hurt) burst(e);
      return;
    }
    e.seenT = d < 14 ? 0 : (e.seenT || 0) + dt;
    if (e.seenT > 6) { e.hidden = true; e.bar = false; e.hurt = false; puff(e.x, e.y + 0.5, e.z, 0x2a3028, 8, 2); return; }
    e.jk -= dt;
    if (e.jk <= 0) { e.jk = rand(0.3, 0.7); e.lat = rand(-1.5, 1.5); }
    groundChase(e, dt, sp, d < 6 ? e.lat : 0);
    if (e.cd <= 0) {
      if (d < 2.1) { e.cd = 1.1; wait(e, 0.28, e => cone(e, 2.3, 1.1, e.dmg), 0, 'melee'); }
      else if (d < 7 && Math.random() < 0.5) { e.cd = 2.4; pounceAt(e, 0.35, 0.4, 1.4, e.dmg * 1.2, 1.4); }
      else e.cd = 0.3;
    }
  },
  mimic(e, dt, dx, dz, d, sp) {
    if (e.disguise) {
      moveBody(e, dt, 0, 0);
      e.rt = (e.rt ?? rand(2, 5)) - dt;
      if (d < 9 && e.rt <= 0) { e.rt = rand(3, 6); e.hitT = G.time; e.hitA = e.ang + Math.PI; sfx('rattle'); }
      if (d < 1.9 || e.hurt) revealMimic(e);
      return;
    }
    groundChase(e, dt, sp * (0.55 + 0.9 * Math.max(0, Math.sin(G.time * 7 + e.ph))), 0);
    if (e.cd <= 0) {
      if (d < 2.1) { e.cd = 1.1; wait(e, 0.3, e => bite(e, 1.9, e.dmg), 0, 'melee'); }
      else if (d < 6 && Math.random() < 0.4) { e.cd = 2.2; pounceAt(e, 0.35, 0.45, 1.6, e.dmg * 1.2, 1.4); }
      else e.cd = 0.3;
    }
  },
  spitter(e, dt, dx, dz, d, sp) {
    if (d > 13) groundChase(e, dt, sp, 0);
    else if (d < 7) {
      // Hop back in bursts, still facing you.
      const hop = Math.max(0, Math.sin(G.time * 6 + e.ph));
      steer(e, dt, -dx / d, -dz / d, sp * 1.6 * hop);
      if (hop > 0.95 && (e.vy || 0) === 0) e.vy = 3.5;
    } else {
      const a = Math.atan2(dx, dz) + Math.PI / 2 * (e.ph > 3 ? 1 : -1);
      steer(e, dt, Math.sin(a), Math.cos(a), sp * 0.45);
    }
    if (d <= 13) e.ang = Math.atan2(dx, dz);
    if (e.cd <= 0 && d < 16) {
      e.cd = 2.8;
      wait(e, 0.55, e => { for (let k = -1; k <= 1; k++) aimShot(e, 11, e.dmg * 0.8, 0xb050ff, 1.5, k * 0.22, 1.1); }, 0, 'shot');
    }
  },
};

function healPulse(e) {
  let n = 0;
  for (const o of W.enemies) {
    if (o === e || o.dead || o.boss || o.type === 'nest' || o.rival || o.hp >= o.maxHp) continue;
    if (Math.hypot(o.x - e.x, o.z - e.z) > 7.5) continue;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3);
    n++;
    for (let i = 0; i < 5; i++) { const u = i / 5; W.parts.push({ x: e.x + (o.x - e.x) * u, y: e.y + 1.6 + (o.y + o.h * 0.6 - e.y - 1.6) * u, z: e.z + (o.z - e.z) * u, vx: 0, vy: 0.5, vz: 0, life: 0.5, c: 0x9be06a, s: 0.8, ng: true }); }
    spark(o.x, o.y + o.h * 0.6, o.z, 0.8, 0x9be06a);
  }
  sfx('heal');
  fx('ring', e.x, e.y, e.z, 7.5, 0x9be06a, 0.4);
  if (n) dnum(e.x, e.y + e.h + 0.5, e.z, 'HEALED ' + n, 'poison');
}

function burst(e) {
  e.hidden = false;
  e.bar = true;
  e.seenT = 0;
  sfx('screech');
  puff(e.x, e.y + 0.6, e.z, 0x2a3028, 14, 3);
  dnum(e.x, e.y + 1.8, e.z, '!', 'crit');
  G.shake = Math.max(G.shake, 0.15);
  e.cd = 1.4;
  pounceAt(e, 0.2, 0.4, 1.8, e.dmg * 1.3, 1.5);
}

function revealMimic(e) {
  e.disguise = false;
  e.bar = true;
  e.lift = 0.18;
  if (e.bin) e.bin.done = true;
  sfx('screech');
  dnum(e.x, e.y + 1.8, e.z, 'MIMIC!', 'crit');
  puff(e.x, e.y + 1, e.z, 0x6a6258, 12, 2.5);
  G.shake = Math.max(G.shake, 0.15);
  e.cd = 0.2;
  wait(e, 0.35, e => bite(e, 2, e.dmg * 1.2), 0, 'melee');
}
/** Rummaging a mimic's "bin" springs it. Returns true if it was one. */
export function rummageMimic(b) {
  if (!b.mimic) return false;
  b.done = true;
  if (!b.mimic.dead && b.mimic.disguise) revealMimic(b.mimic);
  return true;
}

// ---------- hooks from combat ----------
/** Lidbearer guard: returns the damage multiplier for a hit arriving along `ang`. */
export function guardMul(e, ang, base) {
  if (e.type !== 'shieldrat' || ang == null || e.st === 'wind' || e.recov > 0 || e.stun > 0 || e.st === 'leap') return 1;
  // `ang` points from the attacker to the mob, so the blow comes from ang + PI.
  if (Math.abs(angD(ang + Math.PI, e.ang)) > 1.05) return 1;
  if (base >= 45) {
    e.stun = 1.3;
    dnum(e.x, e.y + e.h + 0.5, e.z, 'GUARD BROKEN', 'crit');
    sfx('clank');
    return 1;
  }
  spark(e.x + Math.sin(e.ang) * 0.6, e.y + 0.6, e.z + Math.cos(e.ang) * 0.6, 0.9, 0xd8e0ff);
  sfx('clank');
  if ((e.blkT || 0) < G.time) { e.blkT = G.time + 0.6; dnum(e.x, e.y + e.h + 0.4, e.z, 'BLOCKED', 'info'); }
  return 0.12;
}

const FLEE = { mawling: 1, cat: 1, tick: 1, shieldrat: 1 };
/** Hurt small fry break off and run, then come back angry. */
export function maybeFlee(e) {
  if (e.fled || e.boss || e.elite || e.mini || e.champion || !FLEE[e.type] || e.hp <= 0 || e.hp > e.maxHp * 0.35) return;
  e.fled = true;
  e.fleeT = rand(1.4, 2.2);
  if (e.st === 'wind') { e.st = 'move'; e.act = null; e.tel = 0; }
}
/** Runs before the mob's own AI; returns true while it is busy fleeing. */
export function tickFlee(e, dt, dx, dz, d) {
  if (e.rage > 0) e.rage -= dt;
  if (!(e.fleeT > 0)) return false;
  e.fleeT -= dt;
  steer(e, dt, -dx / d, -dz / d, e.spd * 1.25);
  if (e.fleeT <= 0) { e.rage = 4; dnum(e.x, e.y + e.h + 0.4, e.z, 'ENRAGED', 'crit'); }
  return true;
}
/** An elite falls: every mob around it howls and fights harder for a few seconds. */
export function packRage(e) {
  if (!e.elite) return;
  let n = 0;
  for (const o of W.enemies) if (!o.dead && !o.boss && o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 10) { o.rage = 5; n++; }
  if (n) { dnum(e.x, e.y + e.h + 1, e.z, 'THE PACK HOWLS', 'crit'); sfx('screech'); }
}
/** Cats will happily eat a mawling instead of you. */
export function catHunt(e, dt, d) {
  if (d < 5 || e.st !== 'move' || e.cd > 0) return false;
  e.huntT = (e.huntT ?? 0) - dt;
  if (e.huntT > 0) return false;
  e.huntT = 0.5;
  let m = null, bd = 30;
  for (const o of W.enemies) {
    if (o.type !== 'mawling' || o.dead || o.elite) continue;
    const q = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
    if (q < bd) { bd = q; m = o; }
  }
  if (!m) return false;
  e.cd = 2.5;
  pounceAt(e, 0.3, 0.45, 1.8, 0, 1.2, c => {
    if (m.dead || Math.hypot(m.x - c.x, m.z - c.z) > 2.2) return;
    m.hp = 0;
    m.lastSrc = 'cat';
    run.catMeals = (run.catMeals || 0) + 1;
    c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.3);
    dnum(c.x, c.y + c.h + 0.5, c.z, '*crunch*', 'info');
    kill(m);
  }, { x: m.x, z: m.z });
  return true;
}
/** The shriek scatters birds and bats for a few seconds. */
export function scatterBirds() {
  let n = 0;
  for (const e of W.enemies) if (!e.dead && (e.type === 'crow' || e.type === 'bat') && Math.hypot(e.x - P.x, e.z - P.z) < 18) { e.scatterT = 4; e.st = 'move'; e.act = null; n++; }
  return n;
}

// ---------- placement ----------
/** A floor tile next to a wall, some distance from the rat; returns a point tucked against the wall. */
function crackSpot(lo, hi, facing) {
  for (let i = 0; i < 80; i++) {
    const gx = randi(3, M.W - 4), gz = randi(3, M.H - 4);
    if (!DRY(tAt(gx, gz))) continue;
    const x0 = toW(gx), z0 = toW(gz), d = Math.hypot(x0 - P.x, z0 - P.z);
    if (d < lo || d > hi) continue;
    if (facing != null && Math.abs(angD(Math.atan2(x0 - P.x, z0 - P.z), facing)) > 1.3) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (tAt(gx + dx, gz + dz) !== 0) continue;
      const x = x0 + dx * 1.3, z = z0 + dz * 1.3;
      if (floorY(x, z) > 0.5) continue;
      return { x, z, ang: Math.atan2(-dx, -dz) };
    }
  }
  return null;
}
function placeLurker(lo, hi, facing) {
  const s = crackSpot(lo, hi, facing);
  if (!s) return null;
  const e = spawnEnemy('lurker', s.x, s.z, { plain: true, force: true });
  if (e) { e.hidden = true; e.bar = false; e.ang = s.ang; }
  return e;
}
function placeMimic() {
  const s = crackSpot(14, 60);
  if (!s) return;
  const e = spawnEnemy('mimic', s.x, s.z, { plain: true, force: true });
  if (!e) return;
  Object.assign(e, { disguise: true, bar: false, ang: s.ang });
  e.bin = { x: e.x, z: e.z, y: e.y, r: 0.6, kind: 'bin', done: false, mimic: e };
  W.bins.push(e.bin);
}
/** Called once a district is built. */
export function placeRoles() {
  if (G.mode === 'trial' || G.testNoRoles) return; // debug: scripted tests keep ambushers out of the way
  const t = run.tier || 0;
  for (let i = 0; i < 2 + Math.min(4, t); i++) placeLurker(t ? 14 : 24, 70);
  for (let i = 0; i < (isSewer() ? 1 : 2) + (t >= 2 ? 1 : 0); i++) placeMimic();
  run.lurkT = 60;
}
/** Every minute or so a lurker slips into a crack ahead of you. */
export function tickRoles(dt) {
  if (G.mode === 'trial' || G.testNoRoles || (run.tier || 0) + (run.time || 0) / 240 < 0.5) return;
  run.lurkT = (run.lurkT ?? 60) - dt;
  if (run.lurkT > 0) return;
  run.lurkT = rand(55, 80);
  let hid = 0;
  for (const e of W.enemies) if (e.type === 'lurker' && e.hidden && !e.dead) hid++;
  if (hid < 3) placeLurker(14, 24, P.facing);
}
