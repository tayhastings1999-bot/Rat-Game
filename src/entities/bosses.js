// District bosses. Each has three phases (at 66% and 33% HP) that add new
// attacks, erratic movement that changes direction without warning, and a
// timed action queue for multi-part patterns.
import * as THREE from 'three';
import { rand, angD, pick, TAU, $ } from '../core/util.js';
import { G, P, W, run, st, meta } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { GEO, bodyMat } from '../render/models.js';
import { fx, puff, boom, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, toW, floorY } from '../world/grid.js';
import { BOSSES, curD, isSewer } from '../data/world.js';
import { glob } from '../combat/arsenal.js';
import { hurtP, dropGem, scrapDrop, dropKey } from '../combat/combat.js';
import { warn, puddle } from '../combat/hazards.js';
import { spawnEnemy, mobState, moveBody, groundChase, flyTo, wait, cone, aimShot, lobAt, pounceAt, chargeStart, swoop } from './mobs.js';
import { banner } from '../ui/hud.js';
import { addChest } from '../world/build.js';
import { openGate, checkUnlocks } from '../game/flow.js';

const BASE_R = { ghoul: 0.62, tick: 0.4, brute: 0.9, crow: 0.5, drone: 0.95, ratking: 1.25 };
const BASE_H = { ghoul: 1.3, tick: 0.55, brute: 2.1, crow: 0.6, drone: 1.8, ratking: 1.7 };
const ROMAN = ['I', 'II', 'III'];

export function spawnBoss() {
  const kind = curD().boss, B = BOSSES[kind];
  const hp = Math.round(B.hp * (1 + 0.7 * run.tier) * (1 + (run.T || 0) * 0.06));
  // Wake as far from the rat as the horde can walk.
  let k = -1, bd = -1;
  for (const t of M.spawnTiles) if (M.flow[t] > bd) { bd = M.flow[t]; k = t; }
  const x = k >= 0 ? toW(k % M.W) : P.x + 10, z = k >= 0 ? toW((k / M.W) | 0) : P.z + 10;
  const mesh = new THREE.Mesh(GEO[B.geo].body, bodyMat());
  mesh.add(new THREE.Mesh(GEO[B.geo].glow, new THREE.MeshBasicMaterial({ vertexColors: true })));
  mesh.scale.setScalar(B.sc);
  mesh.castShadow = true;
  scene.add(mesh);
  const gy = floorY(x, z);
  const b = {
    type: B.geo, kind, name: B.name, boss: true, heavy: true, fly: !!B.fly, mesh,
    x, y: B.fly ? gy + 5 : gy, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp,
    spd: B.spd * (run.spdM || 1), dmg: 16 * (run.dmgM || 1) * (1 + 0.15 * run.tier),
    r: BASE_R[B.geo] * B.sc * 0.75, h: BASE_H[B.geo] * B.sc, sc: 1, col: B.col, blood: B.blood,
    flash: 0, slow: 0, ang: 0, pT: 0, pD: 0, bT: 0, bD: 0, dT: 0, tT: 0, wind: 0, atkCd: 0, lunge: 0, ward: 0,
    phase: 1, cd: 2.2, st: 'move', tt: 0, tel: 0, seq: [], last: '', mvT: 0, mvDir: 1, oa: rand(0, TAU), ow: 1, hv: 0, mass: 8, bar: true,
  };
  W.enemies.push(b);
  G.boss = b;
  $('bossLabel').textContent = `${B.name.toUpperCase()} · I`;
  banner('Something big has woken', 'Sniff it out (F), or keep your distance');
  sfx('boss');
  G.shake = 0.5;
  boom(x, gy + 1.5, z, 6, 0xff3a20);
}

/** Queue fn to run after `t` seconds (boss-local timeline). */
const later = (e, t, fn) => e.seq.push({ t, fn });

function phaseUp(e, n) {
  e.phase = n;
  e.invuln = 1.3;
  e.st = 'move';
  e.seq.length = 0;
  e.spd *= 1.15;
  e.cd = 1.4;
  $('bossLabel').textContent = `${e.name.toUpperCase()} · ${ROMAN[n - 1]}`;
  banner(e.name, n === 2 ? 'is enraged' : 'is desperate — it will not go quietly');
  sfx('phase');
  G.shake = 0.7;
  const gy = floorY(e.x, e.z);
  warn(e.x, e.z, 7, 1.1, e.dmg * 1.2, { y: gy, kb: 1, col: 0xff2a60 });
  fx('ring', e.x, gy, e.z, 9, 0xff2a60, 1.1);
  const add = { tabby: 'cat', murder: 'crow', exterm: 'wasp', maw: 'mawling', brood: 'tick', ratking: 'mawling' }[e.kind];
  for (let i = 0; i < 3 + n; i++) spawnEnemy(add, e.x + rand(-4, 4), e.z + rand(-4, 4), { plain: i > 0 });
  if (e.kind === 'ratking' && n === 3) {
    for (let i = 0; i < 2; i++) spawnEnemy('mawling', e.x + rand(-3, 3), e.z + rand(-3, 3), { elite: true, sc: 1.8, corrupt: pick(['haste', 'leech']) });
    dnum(e.x, e.y + e.h + 1, e.z, 'The princes wake', 'info');
  }
}

/** Choose the next attack: weighted, never the same one twice in a row. */
function choose(e, list) {
  const opts = list.filter(a => a.ok !== false && a.id !== e.last);
  let tot = 0;
  for (const a of opts) tot += a.w;
  let r = Math.random() * tot;
  for (const a of opts) { r -= a.w; if (r <= 0) { e.last = a.id; a.go(); return; } }
}

/** Ground-boss erratic strafing: circles at a preferred range, flips direction and dashes at random. */
function strafe(e, dt, d, dx, dz, lo, hi, dashSp) {
  e.mvT -= dt;
  if (e.mvT <= 0) {
    e.mvT = rand(0.45, 1.3) / (1 + 0.2 * (e.phase - 1));
    e.mvDir = Math.random() < 0.5 ? -1 : 1;
    e.dash = Math.random() < 0.25 + 0.1 * e.phase ? rand(0.25, 0.45) : 0;
  }
  if (e.dash > 0) e.dash -= dt;
  const a = Math.atan2(dx, dz), rad = d > hi ? 1 : d < lo ? -0.8 : Math.sin(G.time * 1.7 + e.oa) * 0.3;
  const sp = e.spd * (e.dash > 0 ? dashSp : 1) * st.foeSpd * (e.slow > 0 ? 0.6 : 1);
  const vx = (Math.sin(a) * rad + Math.cos(a) * e.mvDir * 0.9) * sp, vz = (Math.cos(a) * rad - Math.sin(a) * e.mvDir * 0.9) * sp;
  moveBody(e, dt, vx, vz);
  e.ang += angD(a, e.ang) * Math.min(1, 6 * dt);
  if (e.hw) e.mvDir *= -1;
}

// ---------- attack patterns ----------
function fan(e, n, spread, spd, dmg, col, size = 1, life = 1.3) {
  for (let k = 0; k < n; k++) aimShot(e, spd, dmg, col, life, (k - (n - 1) / 2) * spread, size);
}
function ring(e, n, spd, dmg, col, off = 0, y = 1, slow = false) {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + off;
    glob(e.x, e.y + y, e.z, Math.sin(a) * spd, 0, Math.cos(a) * spd, dmg, col, slow);
  }
}
function spiral(e, arms, steps, every, spd, dmg, col) {
  for (let s = 0; s < steps; s++) later(e, s * every, () => {
    for (let a = 0; a < arms; a++) {
      const ang = s * 0.35 + a * TAU / arms;
      glob(e.x, e.y + e.h * 0.5, e.z, Math.sin(ang) * spd, 0, Math.cos(ang) * spd, dmg, col);
    }
  });
}
function rain(e, n, every, R, dmg, pud, col) {
  for (let i = 0; i < n; i++) later(e, i * every, () => {
    const a = rand(0, TAU), r = rand(0, 6), x = P.x + Math.sin(a) * r + P.vx * 0.3, z = P.z + Math.cos(a) * r + P.vz * 0.3;
    warn(x, z, R, 0.8, dmg, { col, fn: pud ? () => puddle(pud, x, z, R, 4, 'e') : null });
  });
}

const AI = {
  // The Horned Tabby: strafing, chained pounces, hairball fans, swipe combos, a slowing roar.
  tabby(e, dt, dx, dz, d) {
    strafe(e, dt, d, dx, dz, 4, 9, 2.4);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    const pounce = (n, first) => pounceAt(e, first ? 0.55 : 0.32, 0.55, 5, dmg * 1.6, 3.6, e => {
      boom(e.x, e.y + 0.5, e.z, 5, 0xffb080);
      G.shake = 0.5;
      if (n > 1) later(e, 0.12, () => pounce(n - 1, false));
    });
    choose(e, [
      { id: 'pounce', w: 3, go: () => { e.cd = 2.6 - p * 0.3; pounce(p, true); } },
      { id: 'hair', w: 2.5, go: () => { e.cd = 2.2; wait(e, 0.45, e => { fan(e, p === 3 ? 11 : 7, 0.16, 12, dmg * 0.7, 0xa08060, 1.6); if (p >= 2) later(e, 0.35, () => fan(e, 6, 0.22, 10, dmg * 0.6, 0xa08060, 1.4)); }); } },
      { id: 'swipe', w: d < 5 ? 4 : 0.3, go: () => { e.cd = 1.4; wait(e, 0.3, e => { cone(e, 3.8, 1.2, dmg); later(e, 0.2, () => cone(e, 3.8, 1.2, dmg * 0.8)); if (p >= 2) later(e, 0.4, () => cone(e, 4.2, 1.4, dmg)); }); } },
      { id: 'frenzy', w: 2, ok: p >= 2, go: () => { e.cd = 2.4; chargeStart(e, 0.45, 20, 0.55); e.onChargeEnd = e => { wait(e, 0.12, e => cone(e, 3.8, 1.3, dmg)); }; } },
      { id: 'roar', w: 1.6, ok: p >= 3, go: () => { e.cd = 3; sfx('phase'); warn(e.x, e.z, 7.5, 0.8, dmg, { y: e.y, slow: 1, kb: 1, col: 0xff9a3a }); wait(e, 0.8, null); for (let i = 0; i < 2; i++) spawnEnemy('cat', e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true }); } },
    ]);
  },

  // The Murder King: an erratic flying orbit, feather volleys, swoops, feather storms, dive-bomb chains, a tornado.
  murder(e, dt, dx, dz, d) {
    e.oa += dt * e.ow * (0.9 + 0.6 * Math.sin(G.time * 0.8)) * (1 + 0.25 * (e.phase - 1));
    if (Math.random() < dt * 0.6) e.ow *= -1;
    const r = 10 + Math.sin(G.time * 0.9) * 3;
    flyTo(e, dt, P.x + Math.sin(e.oa) * r, Math.max(P.y, 0) + 5 + Math.sin(G.time * 2.1) * 2, P.z + Math.cos(e.oa) * r, e.spd * 1.6);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    choose(e, [
      { id: 'volley', w: 3, go: () => { e.cd = 1.8; sfx('caw'); wait(e, 0.35, e => { fan(e, p >= 2 ? 7 : 5, 0.14, 20, dmg * 0.6, 0x3a3040, 0.9, 1.2); if (p >= 2) later(e, 0.3, () => fan(e, 7, 0.14, 20, dmg * 0.6, 0x3a3040, 0.9, 1.2)); }); } },
      { id: 'swoop', w: 2.5, go: () => { e.cd = 2.3; sfx('caw'); wait(e, 0.4, e => swoop(e, 1.1)); } },
      { id: 'storm', w: 2, ok: p >= 2, go: () => { e.cd = 3; wait(e, 0.5, e => { for (let w = 0; w < 3; w++) later(e, w * 0.25, () => ring(e, 20, 9, dmg * 0.5, 0x3a3040, w * 0.15, 0.5)); }); } },
      { id: 'flock', w: 1.4, ok: p >= 2, go: () => { e.cd = 2; for (let i = 0; i < 3 + p; i++) spawnEnemy('crow', e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true }); sfx('caw'); } },
      { id: 'dives', w: 2.2, ok: p >= 3, go: () => {
        e.cd = 4;
        const dive = n => {
          const tx = P.x, ty = P.y + 0.5, tz = P.z;
          warn(tx, tz, 3, 0.55, dmg * 1.2, { y: floorY(tx, tz), kb: 1 });
          wait(e, 0.35, e => {
            Object.assign(e, { st: 'dive', tt: 1, tx, ty, tz, hitP: 0, diveSp: 32 });
            e.onDiveEnd = () => { ring(e, 12, 10, dmg * 0.5, 0x3a3040, 0, 0.3); if (n > 1) later(e, 0.5, () => dive(n - 1)); };
          });
        };
        dive(3);
      } },
      { id: 'tornado', w: 1.5, ok: p >= 3, go: () => { e.cd = 4.5; wait(e, 0.6, e => spiral(e, 3, 26, 0.11, 8, dmg * 0.45, 0x5a5070), 1); } },
    ]);
  },

  // The Exterminator: a jittering pest-control drone — poison spray, snap traps, missiles, machine gun, flamethrower, fumigation.
  exterm(e, dt, dx, dz, d) {
    e.mvT -= dt;
    if (e.mvT <= 0) { e.mvT = rand(0.35, 0.9); e.ow = Math.random() < 0.5 ? -1 : 1; e.oa += rand(-1.2, 1.2); e.hv = rand(7, 11); }
    e.oa += dt * e.ow * 0.9;
    flyTo(e, dt, P.x + Math.sin(e.oa) * (e.hv || 9), Math.max(P.y, 0) + 3.2 + Math.sin(G.time * 3) * 0.6, P.z + Math.cos(e.oa) * (e.hv || 9), e.spd * 1.5);
    e.ang = Math.atan2(dx, dz);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    choose(e, [
      { id: 'spray', w: 3, go: () => { e.cd = 2; wait(e, 0.4, e => { for (let k = 0; k < 6; k++) later(e, k * 0.06, () => { const a = Math.atan2(P.x - e.x, P.z - e.z) + (k - 2.5) * 0.18, r = Math.min(d, 9) * rand(0.6, 1.1); lobAt(e, e.x + Math.sin(a) * r, P.y, e.z + Math.cos(a) * r, 12, dmg * 0.5, 0x9be06a, 'poison', 1.2); }); }); } },
      { id: 'traps', w: 2.4, go: () => { e.cd = 2.3; for (let i = 0; i < 3 + p; i++) { const x = P.x + P.vx * 0.6 + rand(-4, 4), z = P.z + P.vz * 0.6 + rand(-4, 4); warn(x, z, 1.5, 1.2, dmg * 1.3, { col: 0xffd040 }); } } },
      { id: 'missiles', w: 2.2, go: () => { e.cd = 2.8; wait(e, 0.35, e => { for (let i = 0; i < 4 + p; i++) later(e, i * 0.12, () => lobAt(e, P.x + rand(-3, 3), P.y, P.z + rand(-3, 3), 14, dmg, 0xff6a2a, 'fire', 1.8)); }); } },
      { id: 'gun', w: 2.5, ok: p >= 2, go: () => { e.cd = 2.6; wait(e, 0.4, e => { for (let i = 0; i < 16; i++) later(e, i * 0.08, () => aimShot(e, 24, dmg * 0.35, 0xffe060, 0.9, rand(-0.12, 0.12), 0.6)); }); } },
      { id: 'flame', w: 2, ok: p >= 2, go: () => {
        e.cd = 3;
        const a = Math.atan2(P.x - e.x, P.z - e.z);
        for (let i = 1; i <= 7; i++) { const x = e.x + Math.sin(a) * i * 1.8, z = e.z + Math.cos(a) * i * 1.8; later(e, i * 0.07, () => warn(x, z, 1.5, 0.55, dmg * 0.7, { col: 0xff7a2a, fn: () => puddle('fire', x, z, 1.5, 3, 'e') })); }
      } },
      { id: 'fumigate', w: 2, ok: p >= 3, go: () => { e.cd = 4; rain(e, 8, 0.2, 2.6, dmg * 0.6, 'poison', 0x9be06a); e.oa += Math.PI; e.mvT = 0; } },
    ]);
  },

  // The Many-Mouthed: lumbering charges (chained when desperate), spit fans, burrowing ambushes, spirals.
  maw(e, dt, dx, dz, d) {
    if (e.burrow > 0) {
      e.burrow -= dt;
      e.hidden = true;
      e.x += (P.x - e.x) * Math.min(1, 1.6 * dt);
      e.z += (P.z - e.z) * Math.min(1, 1.6 * dt);
      e.y = floorY(e.x, e.z) - e.h * 0.8;
      if (Math.random() < 0.5) puff(e.x, floorY(e.x, e.z) + 0.2, e.z, 0x6a5a4a, 2, 3);
      if (e.burrow <= 0) {
        const tx = e.x, tz = e.z, gy = floorY(tx, tz);
        warn(tx, tz, 3.6, 0.6, e.dmg * 1.5, { y: gy, kb: 1 });
        later(e, 0.6, () => { e.hidden = false; e.y = gy; ring(e, 16, 9, e.dmg * 0.5, 0xff4a2a); G.shake = 0.6; });
      }
      return;
    }
    if (e.hidden) { e.y = floorY(e.x, e.z) - e.h * 0.8; return; }
    groundChase(e, dt, e.spd, Math.sin(G.time * 1.1) * 0.9);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    const charge = n => { chargeStart(e, n < 3 ? 0.4 : 0.7, 19, 0.8); e.onChargeEnd = () => { if (n > 1) later(e, 0.2, () => charge(n - 1)); }; };
    choose(e, [
      { id: 'charge', w: 3, go: () => { e.cd = 3; charge(p >= 3 ? 3 : 1); } },
      { id: 'spit', w: 2.5, go: () => { e.cd = 1.8; wait(e, 0.35, e => { for (let k = 0; k < (p >= 2 ? 7 : 5); k++) { const s = aimShot(e, 10, dmg * 0.6, 0xff4a2a, 1.4, (k - (p >= 2 ? 3 : 2)) * 0.2); if (p >= 2) s.pud = 'poison'; } }); } },
      { id: 'brood', w: 1.5, go: () => { e.cd = 2; for (let i = 0; i < 3 + run.tier; i++) spawnEnemy('mawling', e.x + rand(-2, 2), e.z + rand(-2, 2), { plain: true }); } },
      { id: 'burrow', w: 2.2, ok: p >= 2, go: () => { e.cd = 4; e.burrow = 1.6; puff(e.x, e.y + 0.3, e.z, 0x6a5a4a, 20, 4); sfx('boom'); } },
      { id: 'spiral', w: 2, ok: p >= 3, go: () => { e.cd = 3.5; wait(e, 0.4, e => spiral(e, 3, 24, 0.1, 9, dmg * 0.45, 0xff6a3a)); } },
    ]);
  },

  // The Brood Mother: skittering bursts, tick broods, slowing web rings, hatching egg lobs, leaps, acid rain.
  brood(e, dt, dx, dz, d) {
    e.mvT -= dt;
    if (e.mvT <= 0) { e.dashOn = !e.dashOn; e.mvT = e.dashOn ? rand(0.3, 0.6) : rand(0.2, 0.5); e.lat = rand(-1.6, 1.6); }
    if (e.dashOn) groundChase(e, dt, e.spd * 2, e.lat); else moveBody(e, dt, 0, 0);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    choose(e, [
      { id: 'brood', w: 2, go: () => { e.cd = 2.4; for (let i = 0; i < 3 + run.tier + p; i++) spawnEnemy('tick', e.x + rand(-2.5, 2.5), e.z + rand(-2.5, 2.5), { plain: true }); } },
      { id: 'web', w: 2.5, go: () => { e.cd = 2.6; wait(e, 0.4, e => { ring(e, 18, 6.5, dmg * 0.5, 0xe8e0d0, G.time, 1, true); if (p >= 2) later(e, 0.4, () => ring(e, 18, 6.5, dmg * 0.5, 0xe8e0d0, G.time + 0.17, 1, true)); }); } },
      { id: 'eggs', w: 2.2, ok: p >= 2, go: () => {
        e.cd = 2.8;
        wait(e, 0.35, e => { for (let i = 0; i < 3; i++) { const g = lobAt(e, P.x + rand(-3, 3), P.y, P.z + rand(-3, 3), 11, dmg * 0.6, 0xf0e8c0, null, 2); g.onLand = (x, z) => { for (let k = 0; k < 2; k++) spawnEnemy('tick', x + rand(-0.5, 0.5), z + rand(-0.5, 0.5), { plain: true }); }; } });
      } },
      { id: 'leap', w: 2, ok: p >= 2, go: () => { e.cd = 2.5; pounceAt(e, 0.6, 0.8, 7, dmg * 1.5, 4.4); } },
      { id: 'rain', w: 2, ok: p >= 3, go: () => { e.cd = 3.6; rain(e, 12, 0.22, 2.2, dmg * 0.6, 'poison', 0x9be06a); } },
    ]);
  },

  // The Rat King: rolling, ricocheting charges, tail-whip rings, rat swarms, a vortex that drags you in.
  ratking(e, dt, dx, dz, d) {
    if (e.vortex > 0) {
      e.vortex -= dt;
      const l = d || 1;
      P.vx += -dx / l * 10 * dt * 6;
      P.vz += -dz / l * 10 * dt * 6;
      e.ang += dt * 8;
      moveBody(e, dt, 0, 0);
      if (Math.random() < 0.6) puff(e.x + rand(-3, 3), e.y + 0.3, e.z + rand(-3, 3), 0x8a7a6a, 1, 4);
      return;
    }
    strafe(e, dt, d, dx, dz, 3, 8, 2.8);
    e.ang += dt * 3;
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    const roll = n => { chargeStart(e, n < (p >= 2 ? 3 : 1) ? 0.3 : 0.6, 18, 1); e.onChargeEnd = () => { if (n > 1) roll(n - 1); }; };
    choose(e, [
      { id: 'roll', w: 3, go: () => { e.cd = 2.8; roll(p >= 2 ? 3 : 1); } },
      { id: 'whip', w: d < 7 ? 3 : 0.8, go: () => { e.cd = 2; warn(e.x, e.z, 5.2, 0.7, dmg * 1.1, { y: e.y, kb: 1, col: 0xd8a830 }); wait(e, 0.7, null); } },
      { id: 'swarm', w: 1.6, go: () => { e.cd = 2.2; for (let i = 0; i < 5 + p * 2; i++) spawnEnemy(i % 3 ? 'mawling' : 'roach', e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true }); } },
      { id: 'rats', w: 2.4, ok: p >= 2, go: () => { e.cd = 2; wait(e, 0.35, e => fan(e, 9, 0.15, 17, dmg * 0.55, 0x8a7a6a, 1.2)); } },
      { id: 'vortex', w: 2, ok: p >= 3, go: () => { e.cd = 4; e.vortex = 2.4; sfx('phase'); for (let w = 0; w < 4; w++) later(e, 0.4 + w * 0.5, () => ring(e, 14, 7, dmg * 0.5, 0xd8a830, w * 0.2)); } },
    ]);
  },
};

/** Returns true: bosses fully own their movement. */
export function bossAI(e, dt, dx, dz, d) {
  if (e.seq.length) {
    for (const s of e.seq) { s.t -= dt; if (s.t <= 0 && !s.done) { s.done = true; if (!e.dead) s.fn(); } }
    e.seq = e.seq.filter(s => !s.done);
  }
  if (e.phase === 1 && e.hp < e.maxHp * 0.66) phaseUp(e, 2);
  else if (e.phase === 2 && e.hp < e.maxHp * 0.33) phaseUp(e, 3);
  if (e.invuln > 0) {
    if (!e.fly) moveBody(e, dt, 0, 0);
    e.ang += dt * 6;
    return true;
  }
  if (!e.hidden && mobState(e, dt, dx, dz)) return true;
  e.cd -= dt * (1 + 0.25 * (e.phase - 1)) * Math.sqrt(run.atkM || 1);
  AI[e.kind](e, dt, dx, dz, d);
  // Contact damage: bosses hurt to touch.
  if (!e.hidden && d < e.r + 0.6 && Math.abs(P.y - e.y) < e.h) hurtP(e.dmg * 0.6, e);
  return true;
}

export function onBossDeath(e) {
  scene.remove(e.mesh);
  G.boss = null;
  $('bossWrap').style.display = 'none';
  G.shake = 1;
  for (const o of W.enemies) if (!o.boss && !o.dead && o.type !== 'nest' && Math.hypot(o.x - e.x, o.z - e.z) < 14) o.hp = Math.min(o.hp, 1);
  const gy = floorY(e.x, e.z);
  for (let i = 0; i < 16; i++) dropGem(e.x + rand(-3, 3), gy, e.z + rand(-3, 3), 14);
  for (let i = 0; i < 30; i++) scrapDrop(e.x, gy, e.z);
  addChest(e.x, gy, e.z, isSewer());
  if (!isSewer()) dropKey(e.x + 1.5, gy, e.z + 1.5);
  run.bossDone = true;
  meta.bosses++;
  run.bosses = (run.bosses || 0) + 1;
  openGate();
  const got = checkUnlocks();
  banner(e.name + ' falls', got.length ? 'Unlocked: ' + got.join(', ') : isSewer() ? 'A ladder leads back to the streets' : 'The road is open — or take the key below');
}
