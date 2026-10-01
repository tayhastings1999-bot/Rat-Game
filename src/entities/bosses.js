// District bosses. Each has three phases (at 66% and 33% HP) that add new
// attacks, erratic movement that changes direction without warning, and a
// timed action queue for multi-part patterns.
import * as THREE from 'three';
import { rand, angD, pick, TAU, $ } from '../core/util.js';
import { G, P, W, run, st, meta } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { fx, puff, boom, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, inG, toW, floorY, collideBody } from '../world/grid.js';
import { BOSSES, curD, isSewer } from '../data/world.js';
import { glob } from '../combat/arsenal.js';
import { hurtP, dropGem, scrapDrop, dropKey } from '../combat/combat.js';
import { warn, puddle } from '../combat/hazards.js';
import { spawnEnemy, mobState, moveBody, groundChase, flyTo, wait, cone, aimShot, lobAt, pounceAt, chargeStart, swoop } from './mobs.js';
import { banner } from '../ui/hud.js';
import { brainOf, think, lead, weigh, canAfford, spend, trySidestep, flankPoint } from './brain.js';
import { addChest } from '../world/build.js';
import { contract } from '../game/contracts.js';
import { rankDistrict } from '../game/score.js';
import { openGate, checkUnlocks } from '../game/flow.js';
import { creatureMesh } from '../render/pools.js';

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
  const mesh = creatureMesh(B.geo);
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
  b.label = `${B.name.toUpperCase()} · I`;
  $('bossLabel').textContent = b.label;
  banner('Something big has woken', 'Sniff it out (F), or keep your distance');
  sfx('boss');
  G.shake = 0.5;
  boom(x, gy + 1.5, z, 6, 0xff3a20);
}

// Telegraph language: what each boss move's wind-up glows as.
const BOSS_TK = { hair: 'shot', volley: 'shot', tornado: 'shot', spray: 'shot', missiles: 'shot', gun: 'shot', spit: 'shot', spiral: 'shot', rats: 'shot', snipe: 'shot', storm: 'area', web: 'area', roar: 'area', whip: 'area', gulp: 'area', decree: 'area', slam: 'area', quake: 'area' };

/** Queue fn to run after `t` seconds (boss-local timeline). */
const later = (e, t, fn) => e.seq.push({ t, fn });

function phaseUp(e, n) {
  e.phase = n;
  e.invuln = 1.3;
  e.st = 'move';
  e.seq.length = 0;
  e.spd *= 1.15;
  e.cd = 1.4;
  e.label = `${e.name.toUpperCase()} · ${ROMAN[n - 1]}`;
  $('bossLabel').textContent = e.label;
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

/**
 * Choose the next attack: weighted by how well it counters the rat's current
 * style (brain.weigh), never the same twice in a row, and only if the boss can
 * afford it from its aggression budget. Broke bosses recover (and are exposed).
 */
function choose(e, list) {
  const opts = list.filter(a => a.ok !== false && a.id !== e.last && canAfford(e, a.cost ?? 4));
  if (!opts.length) return;
  let tot = 0;
  for (const a of opts) { a.ww = a.w * weigh(e, a); tot += a.ww; }
  let r = Math.random() * tot;
  for (const a of opts) { r -= a.ww; if (r <= 0) { e.last = a.id; spend(e, a.cost ?? 4); e.tkNext = BOSS_TK[a.id] || 'melee'; a.go(); e.tkNext = null; return; } }
}

/**
 * Ground-boss strafing at a preferred range. It usually circles the same way
 * you do, which puts it in front of you (a cut-off) rather than chasing, and
 * sometimes breaks the pattern at random.
 */
function strafe(e, dt, d, dx, dz, lo, hi, dashSp) {
  e.mvT -= dt;
  if (e.mvT <= 0) {
    const b = brainOf(e);
    e.mvT = rand(0.45, 1.3) / (1 + 0.2 * (e.phase - 1));
    e.mvDir = Math.random() < 0.45 + 0.1 * e.phase && Math.abs(b.strafe) > 0.2 ? Math.sign(b.strafe) : Math.random() < 0.5 ? -1 : 1;
    e.dash = Math.random() < 0.25 + 0.1 * e.phase ? rand(0.25, 0.45) : 0;
  }
  if (e.dash > 0) e.dash -= dt;
  const a = Math.atan2(dx, dz), rad = d > hi ? 1 : d < lo ? -0.8 : Math.sin(G.time * 1.7 + e.oa) * 0.3;
  const sp = e.spd * (e.dash > 0 ? dashSp : 1) * st.foeSpd * (e.slow > 0 ? 0.6 : 1) * (brainOf(e).exposed > 0 ? 0.5 : 1);
  const vx = (Math.sin(a) * rad + Math.cos(a) * e.mvDir * 0.9) * sp, vz = (Math.cos(a) * rad - Math.sin(a) * e.mvDir * 0.9) * sp;
  moveBody(e, dt, vx, vz);
  e.ang += angD(a, e.ang) * Math.min(1, 6 * dt);
  if (e.hw) e.mvDir *= -1;
}

// ---------- attack patterns ----------
/** Where the rat will be in `t` seconds, leaning toward the side it dodges to. */
function predictAt(e, t, bias = 0.7) {
  const b = brainOf(e), dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1, side = b.roll * bias * Math.min(2.5, t * 3);
  return { x: P.x + P.vx * t * 0.85 + (-dz / d) * side, z: P.z + P.vz * t * 0.85 + (dx / d) * side };
}
/** A fan centred on where the rat will be, not where it is. */
function fan(e, n, spread, spd, dmg, col, size = 1, life = 1.3) {
  const L = lead(e, spd);
  for (let k = 0; k < n; k++) aimShot(e, spd, dmg, col, life, (k - (n - 1) / 2) * spread, size, L);
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
    const q = predictAt(e, 0.8, 0.4), a = rand(0, TAU), r = rand(0, 5), x = q.x + Math.sin(a) * r, z = q.z + Math.cos(a) * r;
    warn(x, z, R, 0.8, dmg, { col, fn: pud ? () => puddle(pud, x, z, R, 4, 'e') : null });
  });
}
/** Marks the ground along the rat's predicted path, one after another. */
function decree(e, n, gap, R, dmg, col, o = {}) {
  for (let i = 0; i < n; i++) later(e, i * gap, () => { const q = predictAt(e, 0.55 + i * 0.1, 0.5); warn(q.x, q.z, R, 0.65, dmg, { col, ...o }); });
}
const leadAim = spd => e => { const L = lead(e, spd, 0.5); return Math.atan2(L.x - e.x, L.z - e.z); };

// The Exterminator's sniper laser.
const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8 }));
laser.visible = false;
laser.frustumCulled = false;
scene.add(laser);

/** A rooftop close to the boss it can leap onto and stalk from. */
function roofNear(e) {
  const gx = Math.floor(e.x / 4 + M.W / 2), gz = Math.floor(e.z / 4 + M.H / 2);
  let best = null, bd = 1e9;
  for (let z = gz - 3; z <= gz + 3; z++) for (let x = gx - 3; x <= gx + 3; x++) {
    if (!inG(x, z) || M.grid[z * M.W + x] !== 0) continue;
    const h = M.hgt[z * M.W + x];
    if (h < 3 || h > 9) continue;
    const d = Math.hypot(toW(x) - P.x, toW(z) - P.z);
    if (d > 6 && d < 16 && d < bd) { bd = d; best = { x: toW(x), z: toW(z) }; }
  }
  return best;
}

const AI = {
  // The Horned Tabby: cut-off circling, chained pounces aimed where you're going, feints that punish early rolls,
  // and in later phases it leaps onto a rooftop to stalk you and drops on you from above.
  tabby(e, dt, dx, dz, d) {
    if (e.perch > 0) {
      e.perch -= dt;
      moveBody(e, dt, 0, 0);
      e.ang += angD(Math.atan2(dx, dz), e.ang) * Math.min(1, 6 * dt);
      if (e.perch <= 0) pounceAt(e, 0.7, 0.75, 4, e.dmg * 2, 5, x => { boom(x.x, x.y + 0.5, x.z, 7, 0xffb080); G.shake = 0.8; }, predictAt(e, 1.4));
      return;
    }
    strafe(e, dt, d, dx, dz, 4, 9, 2.4);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    const pounce = (n, first) => pounceAt(e, first ? 0.55 : 0.32, 0.55, 5, dmg * 1.6, 3.6, e => {
      boom(e.x, e.y + 0.5, e.z, 5, 0xffb080);
      G.shake = 0.5;
      if (n > 1) later(e, 0.12, () => pounce(n - 1, false));
    }, predictAt(e, (first ? 0.55 : 0.32) + 0.55));
    choose(e, [
      { id: 'pounce', w: 3, tag: 'gap', go: () => { e.cd = 2.6 - p * 0.3; pounce(p, true); } },
      { id: 'hair', w: 2.5, tag: 'zone', go: () => { e.cd = 2.2; wait(e, 0.45, e => { fan(e, p === 3 ? 11 : 7, 0.16, 12, dmg * 0.7, 0xa08060, 1.6); if (p >= 2) later(e, 0.35, () => fan(e, 6, 0.22, 10, dmg * 0.6, 0xa08060, 1.4)); }); } },
      { id: 'swipe', w: d < 5 ? 4 : 0.3, tag: 'close', cost: 3, go: () => { e.cd = 1.4; wait(e, 0.3, e => { cone(e, 3.8, 1.2, dmg); later(e, 0.2, () => cone(e, 3.8, 1.2, dmg * 0.8)); if (p >= 2) later(e, 0.4, () => cone(e, 4.2, 1.4, dmg)); }); } },
      { id: 'feint', w: 1.8, tag: 'gap', cost: 3, ok: p >= 2, go: () => {
        // Rolled too early? It saw that coming.
        e.cd = 1.8; e.feintT = G.time;
        fx('warn', P.x, P.y, P.z, 3.4, 0xff2a1a, 0.45, 0, 0.45);
        wait(e, 0.45, e => { if (brainOf(e).rolled > e.feintT) { dnum(e.x, e.y + e.h + 1, e.z, 'READ YOU', 'crit'); pounceAt(e, 0.12, 0.4, 3, dmg * 1.4, 3.4, null, predictAt(e, 0.5, 0)); } else cone(e, 4.4, 1.4, dmg * 1.2); });
      } },
      { id: 'frenzy', w: 2, tag: 'gap', ok: p >= 2, go: () => { e.cd = 2.4; chargeStart(e, 0.45, 20, 0.55, leadAim(20)); e.onChargeEnd = e => { wait(e, 0.12, e => cone(e, 3.8, 1.3, dmg)); }; } },
      { id: 'perch', w: 1.6, big: true, cost: 6, ok: p >= 2 && !!roofNear(e), go: () => { e.cd = 3.5; const r = roofNear(e); if (!r) return; pounceAt(e, 0.4, 0.7, 6, 0, 0.1, e => { e.perch = rand(1.1, 1.8); dnum(e.x, e.y + e.h + 1, e.z, 'STALKING', 'info'); }, r, true); } },
      { id: 'roar', w: 1.6, tag: 'close', big: true, cost: 5, ok: p >= 3, go: () => { e.cd = 3; sfx('phase'); warn(e.x, e.z, 7.5, 0.8, dmg, { y: e.y, slow: 1, kb: 1, col: 0xff9a3a }); wait(e, 0.8, null); for (let i = 0; i < 2; i++) spawnEnemy('cat', e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true }); } },
    ]);
  },

  // The Murder King: hovers ahead of where you're running, feather volleys and crossfire aimed at your line,
  // feint swoops, storms, flocks, dive-bomb chains and a tornado.
  murder(e, dt, dx, dz, d) {
    const b = brainOf(e);
    e.oa += dt * e.ow * (0.9 + 0.6 * Math.sin(G.time * 0.8)) * (1 + 0.25 * (e.phase - 1));
    // Drift round to sit in front of you.
    if (Math.hypot(P.vx, P.vz) > 2) e.oa += angD(Math.atan2(P.vx, P.vz), e.oa) * Math.min(1, dt * 0.5);
    if (Math.random() < dt * 0.6) e.ow = Math.random() < 0.6 && Math.abs(b.strafe) > 0.2 ? Math.sign(b.strafe) : -e.ow;
    const r = 10 + Math.sin(G.time * 0.9) * 3;
    flyTo(e, dt, P.x + Math.sin(e.oa) * r, Math.max(P.y, 0) + 5 + Math.sin(G.time * 2.1) * 2, P.z + Math.cos(e.oa) * r, e.spd * 1.6 * (b.exposed > 0 ? 0.5 : 1));
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    choose(e, [
      { id: 'volley', w: 3, tag: 'zone', go: () => { e.cd = 1.8; sfx('caw'); wait(e, 0.35, e => { fan(e, p >= 2 ? 7 : 5, 0.14, 20, dmg * 0.6, 0x3a3040, 0.9, 1.2); if (p >= 2) later(e, 0.3, () => fan(e, 7, 0.14, 20, dmg * 0.6, 0x3a3040, 0.9, 1.2)); }); } },
      { id: 'swoop', w: 2.5, tag: 'gap', go: () => { e.cd = 2.3; sfx('caw'); wait(e, 0.4, e => swoop(e, 1.1)); } },
      { id: 'feint', w: 1.8, tag: 'gap', ok: p >= 2, go: () => {
        // Starts a swoop, pulls up, and comes back for real at where you dodged to.
        e.cd = 2.8; sfx('caw');
        wait(e, 0.35, e => { swoop(e, 1.1); later(e, 0.3, () => { e.st = 'rise'; e.tt = 0.3; later(e, 0.45, () => { sfx('caw'); swoop(e, 0.9); }); }); });
      } },
      { id: 'cross', w: 2, tag: 'zone', ok: p >= 2, go: () => {
        // Crossfire: two volleys from either side converging on your line.
        e.cd = 2.4;
        wait(e, 0.4, e => {
          const L = lead(e, 16), a = Math.atan2(L.x - e.x, L.z - e.z);
          for (const s of [-1, 1]) {
            const ox = e.x + Math.cos(a) * 6 * s, oz = e.z - Math.sin(a) * 6 * s;
            for (let k = 0; k < 5; k++) { const aa = Math.atan2(L.x - ox, L.z - oz) + (k - 2) * 0.08; glob(ox, e.y + 0.5, oz, Math.sin(aa) * 16, (P.y + 0.5 - e.y - 0.5) / 1.2, Math.cos(aa) * 16, dmg * 0.55, 0x3a3040); }
          }
        });
      } },
      { id: 'storm', w: 2, tag: 'zone', ok: p >= 2, go: () => { e.cd = 3; wait(e, 0.5, e => { for (let w = 0; w < 3; w++) later(e, w * 0.25, () => ring(e, 20, 9, dmg * 0.5, 0x3a3040, w * 0.15, 0.5)); }); } },
      { id: 'flock', w: 1.4, tag: 'summon', cost: 3, ok: p >= 2, go: () => { e.cd = 2; for (let i = 0; i < 3 + p; i++) spawnEnemy('crow', e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true }); sfx('caw'); } },
      { id: 'dives', w: 2.2, big: true, cost: 6, ok: p >= 3, go: () => {
        e.cd = 4;
        const dive = n => {
          const q = predictAt(e, 0.7), tx = q.x, ty = P.y + 0.5, tz = q.z;
          warn(tx, tz, 3, 0.55, dmg * 1.2, { y: floorY(tx, tz), kb: 1 });
          wait(e, 0.35, e => {
            Object.assign(e, { st: 'dive', tt: 1, tx, ty, tz, hitP: 0, diveSp: 32 });
            e.onDiveEnd = () => { ring(e, 12, 10, dmg * 0.5, 0x3a3040, 0, 0.3); if (n > 1) later(e, 0.5, () => dive(n - 1)); };
          });
        };
        dive(3);
      } },
      { id: 'tornado', w: 1.5, big: true, cost: 6, ok: p >= 3, go: () => { e.cd = 4.5; wait(e, 0.6, e => spiral(e, 3, 26, 0.11, 8, dmg * 0.45, 0x5a5070), 1); } },
    ]);
  },

  // The Exterminator: a kiting drone. It holds its range, jet-blinks away when you close in, lays traps along
  // your path, and in later phases paints you with a sniper laser before firing where you'll be.
  exterm(e, dt, dx, dz, d) {
    const b = brainOf(e);
    e.mvT -= dt;
    e.blinkCd = (e.blinkCd || 0) - dt;
    if (d < 6 && e.blinkCd <= 0 && e.st === 'move') {
      // Jet-blink: pop out sideways and back to its preferred range.
      e.blinkCd = 5 - e.phase;
      const a = Math.atan2(-dx, -dz) + (Math.random() < 0.5 ? 1 : -1) * rand(0.6, 1.2);
      puff(e.x, e.y, e.z, 0x8a8a8a, 14, 3);
      e.x = P.x + Math.sin(a) * 11; e.z = P.z + Math.cos(a) * 11;
      puff(e.x, e.y, e.z, 0x8a8a8a, 14, 3);
      sfx('roll');
    }
    if (e.mvT <= 0) { e.mvT = rand(0.35, 0.9); e.ow = Math.random() < 0.5 ? -1 : 1; e.oa += rand(-1.2, 1.2); e.hv = rand(9, 12); }
    e.oa += dt * e.ow * 0.9;
    flyTo(e, dt, P.x + Math.sin(e.oa) * (e.hv || 10), Math.max(P.y, 0) + 3.2 + Math.sin(G.time * 3) * 0.6, P.z + Math.cos(e.oa) * (e.hv || 10), e.spd * 1.5 * (b.exposed > 0 ? 0.5 : 1));
    e.ang = Math.atan2(dx, dz);
    // Sniper: the laser tracks you, locks, then fires at where you'll be.
    if (e.snipe > 0) {
      e.snipe -= dt;
      const lock = e.snipe < 0.3, L = lock ? e.snipeAt : lead(e, 40, 0.3);
      if (!lock) e.snipeAt = L;
      laser.visible = true;
      laser.material.opacity = lock ? 1 : 0.35 + 0.2 * Math.sin(G.time * 30);
      laser.geometry.setFromPoints([new THREE.Vector3(e.x, e.y + 0.8, e.z), new THREE.Vector3(L.x, P.y + 0.5, L.z)]);
      if (e.snipe <= 0) {
        laser.visible = false;
        const a = Math.atan2(L.x - e.x, L.z - e.z), D = Math.hypot(L.x - e.x, L.z - e.z) || 1;
        const g = glob(e.x, e.y + 0.8, e.z, Math.sin(a) * 40, (P.y + 0.5 - e.y - 0.8) / (D / 40), Math.cos(a) * 40, e.dmg * 1.7, 0xff3a3a);
        g.size = 0.8;
        sfx('shoot');
      }
      return;
    }
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    choose(e, [
      { id: 'spray', w: 3, tag: 'zone', go: () => { e.cd = 2; wait(e, 0.4, e => { const q = predictAt(e, 0.6, 0.3); for (let k = 0; k < 6; k++) later(e, k * 0.06, () => { const a = Math.atan2(q.x - e.x, q.z - e.z) + (k - 2.5) * 0.18, r = Math.min(Math.hypot(q.x - e.x, q.z - e.z), 9) * rand(0.6, 1.1); lobAt(e, e.x + Math.sin(a) * r, P.y, e.z + Math.cos(a) * r, 12, dmg * 0.5, 0x9be06a, 'poison', 1.2); }); }); } },
      { id: 'traps', w: 2.4, tag: 'punish', go: () => { e.cd = 2.3; for (let i = 0; i < 3 + p; i++) { const q = predictAt(e, 0.5 + i * 0.3, 0.6), x = q.x + rand(-1.5, 1.5), z = q.z + rand(-1.5, 1.5); warn(x, z, 1.5, 1.2, dmg * 1.3, { col: 0xffd040 }); } } },
      { id: 'missiles', w: 2.2, tag: 'zone', big: true, go: () => { e.cd = 2.8; wait(e, 0.35, e => { for (let i = 0; i < 4 + p; i++) later(e, i * 0.12, () => { const q = predictAt(e, 1.2, 0.5); lobAt(e, q.x + rand(-2.5, 2.5), P.y, q.z + rand(-2.5, 2.5), 14, dmg, 0xff6a2a, 'fire', 1.8); }); }); } },
      { id: 'snipe', w: 2.2, tag: 'gap', cost: 5, go: () => { e.cd = 2.4; e.snipe = 1.3 - 0.15 * p; } },
      { id: 'gun', w: 2.5, tag: 'zone', ok: p >= 2, go: () => { e.cd = 2.6; wait(e, 0.4, e => { for (let i = 0; i < 16; i++) later(e, i * 0.08, () => aimShot(e, 24, dmg * 0.35, 0xffe060, 0.9, rand(-0.12, 0.12), 0.6, lead(e, 24, 0.4))); }); } },
      { id: 'flame', w: 2, tag: 'close', ok: p >= 2, go: () => {
        e.cd = 3;
        const a = Math.atan2(P.x - e.x, P.z - e.z);
        for (let i = 1; i <= 7; i++) { const x = e.x + Math.sin(a) * i * 1.8, z = e.z + Math.cos(a) * i * 1.8; later(e, i * 0.07, () => warn(x, z, 1.5, 0.55, dmg * 0.7, { col: 0xff7a2a, fn: () => puddle('fire', x, z, 1.5, 3, 'e') })); }
      } },
      { id: 'fumigate', w: 2, big: true, cost: 6, ok: p >= 3, go: () => { e.cd = 4; rain(e, 8, 0.2, 2.6, dmg * 0.6, 'poison', 0x9be06a); e.oa += Math.PI; e.mvT = 0; } },
    ]);
  },

  // The Many-Mouthed: lead-aimed charges, spit fans, and a burrow that surfaces where you're about to be.
  // Up close it inhales and drags you into its mouths.
  maw(e, dt, dx, dz, d) {
    if (e.burrow > 0) {
      e.burrow -= dt;
      e.hidden = true;
      const q = e.burrowTo || { x: P.x, z: P.z };
      e.x += (q.x - e.x) * Math.min(1, 1.8 * dt);
      e.z += (q.z - e.z) * Math.min(1, 1.8 * dt);
      e.y = floorY(e.x, e.z) - e.h * 0.8;
      if (Math.random() < 0.5) puff(e.x, floorY(e.x, e.z) + 0.2, e.z, 0x6a5a4a, 2, 3);
      if (e.burrow < 0.7 && !e.burrowLock) { e.burrowLock = true; e.burrowTo = predictAt(e, 0.9, 0.6); }
      if (e.burrow <= 0) {
        const tx = e.x, tz = e.z, gy = floorY(tx, tz);
        warn(tx, tz, 3.6, 0.6, e.dmg * 1.5, { y: gy, kb: 1 });
        later(e, 0.6, () => { e.hidden = false; e.y = gy; ring(e, 16, 9, e.dmg * 0.5, 0xff4a2a); G.shake = 0.6; });
      }
      return;
    }
    if (e.hidden) { e.y = floorY(e.x, e.z) - e.h * 0.8; return; }
    if (e.gulp > 0) {
      e.gulp -= dt;
      const l = d || 1;
      P.vx -= dx / l * 38 * dt; P.vz -= dz / l * 38 * dt;
      moveBody(e, dt, 0, 0);
      if (Math.random() < 0.5) puff(P.x, P.y + 0.3, P.z, 0x8a7a6a, 1, 3);
      if (e.gulp <= 0) cone(e, 4, 1.4, e.dmg * 1.5);
      return;
    }
    groundChase(e, dt, e.spd * (brainOf(e).exposed > 0 ? 0.5 : 1), Math.sin(G.time * 1.1) * 0.9);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    const charge = n => { chargeStart(e, n < 3 ? 0.4 : 0.7, 19, 0.8, leadAim(19)); e.onChargeEnd = () => { if (n > 1) later(e, 0.2, () => charge(n - 1)); }; };
    choose(e, [
      { id: 'charge', w: 3, tag: 'gap', go: () => { e.cd = 3; charge(p >= 3 ? 3 : 1); } },
      { id: 'spit', w: 2.5, tag: 'zone', go: () => { e.cd = 1.8; wait(e, 0.35, e => { const n = p >= 2 ? 7 : 5, L = lead(e, 10); for (let k = 0; k < n; k++) { const s = aimShot(e, 10, dmg * 0.6, 0xff4a2a, 1.4, (k - (n - 1) / 2) * 0.2, 1, L); if (p >= 2) s.pud = 'poison'; } }); } },
      { id: 'brood', w: 1.5, tag: 'summon', cost: 3, go: () => { e.cd = 2; for (let i = 0; i < 3 + run.tier; i++) spawnEnemy('mawling', e.x + rand(-2, 2), e.z + rand(-2, 2), { plain: true }); } },
      { id: 'gulp', w: 2, tag: 'close', ok: p >= 2 && d < 9, go: () => { e.cd = 2.8; sfx('phase'); fx('ring', e.x, e.y, e.z, 5, 0xff4a2a, 1.2, 0, 0.7); wait(e, 0.35, e => { e.gulp = 1.2; }); } },
      { id: 'burrow', w: 2.2, tag: 'gap', ok: p >= 2, go: () => { e.cd = 4; e.burrow = 1.6; e.burrowLock = false; e.burrowTo = null; puff(e.x, e.y + 0.3, e.z, 0x6a5a4a, 20, 4); sfx('boom'); } },
      { id: 'spiral', w: 2, big: true, cost: 6, ok: p >= 3, go: () => { e.cd = 3.5; wait(e, 0.4, e => spiral(e, 3, 24, 0.1, 9, dmg * 0.45, 0xff6a3a)); } },
    ]);
  },

  // The Brood Mother: skitters in bursts round to your back, webs your escape line, egg lobs, leaps and acid rain.
  brood(e, dt, dx, dz, d) {
    e.mvT -= dt;
    if (e.mvT <= 0) { e.dashOn = !e.dashOn; e.mvT = e.dashOn ? rand(0.3, 0.6) : rand(0.2, 0.5); e.fl = flankPoint(e, 4); }
    if (e.dashOn && e.fl) {
      const vx = e.fl.x - e.x, vz = e.fl.z - e.z, l = Math.hypot(vx, vz) || 1, sp = e.spd * 2 * (brainOf(e).exposed > 0 ? 0.5 : 1);
      moveBody(e, dt, vx / l * sp, vz / l * sp);
      e.ang = Math.atan2(dx, dz);
    } else moveBody(e, dt, 0, 0);
    if (e.cd > 0) return;
    const p = e.phase, dmg = e.dmg;
    choose(e, [
      { id: 'brood', w: 2, tag: 'summon', cost: 3, go: () => { e.cd = 2.4; for (let i = 0; i < 3 + run.tier + p; i++) spawnEnemy('tick', e.x + rand(-2.5, 2.5), e.z + rand(-2.5, 2.5), { plain: true }); } },
      { id: 'web', w: 2.5, tag: 'zone', go: () => { e.cd = 2.6; wait(e, 0.4, e => { ring(e, 18, 6.5, dmg * 0.5, 0xe8e0d0, G.time, 1, true); if (p >= 2) later(e, 0.4, () => ring(e, 18, 6.5, dmg * 0.5, 0xe8e0d0, G.time + 0.17, 1, true)); }); } },
      { id: 'webline', w: 2, tag: 'punish', go: () => { e.cd = 2.2; decree(e, 3 + p, 0.18, 2, dmg * 0.4, 0xe8e0d0, { slow: 1 }); } },
      { id: 'eggs', w: 2.2, tag: 'zone', ok: p >= 2, go: () => {
        e.cd = 2.8;
        wait(e, 0.35, e => { for (let i = 0; i < 3; i++) { const q = predictAt(e, 1, 0.5); const g = lobAt(e, q.x + rand(-2.5, 2.5), P.y, q.z + rand(-2.5, 2.5), 11, dmg * 0.6, 0xf0e8c0, null, 2); g.onLand = (x, z) => { for (let k = 0; k < 2; k++) spawnEnemy('tick', x + rand(-0.5, 0.5), z + rand(-0.5, 0.5), { plain: true }); }; } });
      } },
      { id: 'leap', w: 2, tag: 'gap', ok: p >= 2, go: () => { e.cd = 2.5; pounceAt(e, 0.6, 0.8, 7, dmg * 1.5, 4.4, null, predictAt(e, 1.4)); } },
      { id: 'rain', w: 2, big: true, cost: 6, ok: p >= 3, go: () => { e.cd = 3.6; rain(e, 12, 0.22, 2.2, dmg * 0.6, 'poison', 0x9be06a); } },
    ]);
  },

  // The Rat King: cut-off strafing, rolls that ricochet off walls and re-aim at you, tail-whip rings, royal
  // decrees stamped along your path, rat swarms, and a vortex that drags you in.
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
    choose(e, [
      { id: 'roll', w: 3, tag: 'gap', go: () => { e.cd = 2.8; chargeStart(e, 0.5, 18, 1, leadAim(18), p); } },
      { id: 'whip', w: d < 7 ? 3 : 0.8, tag: 'close', cost: 3, go: () => { e.cd = 2; warn(e.x, e.z, 5.2, 0.7, dmg * 1.1, { y: e.y, kb: 1, col: 0xd8a830 }); wait(e, 0.7, null); } },
      { id: 'decree', w: 2, tag: 'punish', ok: p >= 2, go: () => { e.cd = 2.4; decree(e, 3 + p, 0.35, 2.6, dmg * 0.9, 0xd8a830); } },
      { id: 'swarm', w: 1.6, tag: 'summon', cost: 3, go: () => { e.cd = 2.2; for (let i = 0; i < 5 + p * 2; i++) spawnEnemy(i % 3 ? 'mawling' : 'roach', e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true }); } },
      { id: 'rats', w: 2.4, tag: 'zone', ok: p >= 2, go: () => { e.cd = 2; wait(e, 0.35, e => fan(e, 9, 0.15, 17, dmg * 0.55, 0x8a7a6a, 1.2)); } },
      { id: 'vortex', w: 2, big: true, cost: 6, ok: p >= 3, go: () => { e.cd = 4; e.vortex = 2.4; sfx('phase'); for (let w = 0; w < 4; w++) later(e, 0.4 + w * 0.5, () => ring(e, 14, 7, dmg * 0.5, 0xd8a830, w * 0.2)); } },
    ]);
  },
};

/** Returns true: bosses fully own their movement. */
export function bossAI(e, dt, dx, dz, d) {
  if (G.testFreeze) { if (!e.fly) moveBody(e, dt, 0, 0); return true; } // debug: scripted tests hold the boss still
  think(e, dt);
  const b = brainOf(e);
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
  // Staggered: reeling, open to punishment.
  if (b.stagger > 0 && !e.hidden) {
    laser.visible = false;
    e.snipe = 0;
    if (e.fly) { e.y += (floorY(e.x, e.z) + 1.4 - e.y) * Math.min(1, 3 * dt); collideBody(e, e.y, e.r, e.h, false); } else moveBody(e, dt, 0, 0);
    e.roll = Math.sin(G.time * 18) * 0.25;
    return true;
  }
  if (!e.hidden && mobState(e, dt, dx, dz)) return true;
  trySidestep(e);
  e.cd -= dt * (1 + 0.25 * (e.phase - 1)) * Math.sqrt(run.atkM || 1);
  AI[e.kind](e, dt, dx, dz, d);
  // Contact damage: bosses hurt to touch.
  if (!e.hidden && d < e.r + 0.6 && Math.abs(P.y - e.y) < e.h) hurtP(e.dmg * 0.6, e);
  return true;
}
/** For the HUD: what state the boss is in. */
export function bossStatus(e) {
  const b = e.brain;
  if (!b) return '';
  return b.stagger > 0 ? ' · STAGGERED' : b.exposed > 0 ? ' · EXPOSED' : '';
}

export function onBossDeath(e) {
  scene.remove(e.mesh);
  laser.visible = false;
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
  if (G.mode !== 'trial') rankDistrict();
  if (!run.bossHit) contract('flawless');
  run.bossHit = false;
  openGate();
  const got = checkUnlocks();
  banner(e.name + ' falls', got.length ? 'Unlocked: ' + got.join(', ') : isSewer() ? 'A ladder leads back to the streets' : 'The road is open — or take the key below');
}
