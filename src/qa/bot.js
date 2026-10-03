// Automated playtester. An agent that plays Scurry through the same inputs a
// player uses (the touch stick, roll, special, signature, shriek, E), at one
// of three skill levels, toward a plain-language goal. It records telemetry
// as it goes: frame cost, memory, entity counts, combat and economy metrics,
// and anomalies (stuck, fell out of the world, inside a wall, spikes, errors)
// with the last ten seconds of game state attached so they can be replayed.
//
// The harness (scripts/playtest.mjs) drives it through window.__scurry.qa.
// `sim(seconds)` fast-forwards: it steps the game logic directly, without
// rendering, so long sessions take minutes instead of hours.
import { rand, pick } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { renderer, world } from '../render/renderer.js';
import { M, gi, inG, toG, toW, tAt, topAt, solidFor, N4, N8 } from '../world/grid.js';
import { update } from '../game/update.js';
import { sync, animate } from '../game/sync.js';
import { stick, keys, startRoll, useSpecial, pressE, chewTarget } from '../entities/player.js';
import { useSig, SIGS } from '../game/signature.js';
import { shriek } from '../game/swarm.js';
import { currentOffers, choose } from '../ui/screens.js';
import { objTargets } from '../game/objectives.js';

// ---------- skill profiles ----------
export const PROFILES = {
  // Reacts late, rarely dodges, wanders into crowds, picks upgrades at random.
  novice: { react: 0.65, dodge: 0.15, kite: 0.15, special: 0.25, sig: 0.1, heal: 0.25, loot: 0.3, pick: 'random', jitter: 0.45 },
  // Reacts in a third of a second, dodges half the time, kites a little.
  average: { react: 0.32, dodge: 0.5, kite: 0.55, special: 0.6, sig: 0.5, heal: 0.55, loot: 0.6, pick: 'greedy', jitter: 0.2 },
  // Near-perfect reads, rolls through wind-ups, keeps its range, builds evolutions.
  expert: { react: 0.12, dodge: 0.9, kite: 0.9, special: 0.9, sig: 0.9, heal: 0.85, loot: 0.9, pick: 'build', jitter: 0.05 },
};
const RANGED = { slinger: 1, warlock: 1, plague: 1, roof: 1 };

// ---------- plain-language goals ----------
/** Turns "reach the manhole" / "kill the boss" / "fail the run" into a goal id. */
export function parseGoal(text = '') {
  const t = text.toLowerCase();
  if (/die|fail|lose/.test(t)) return 'die';
  if (/manhole|sewer|descend/.test(t)) return 'manhole';
  if (/nest/.test(t)) return 'nests';
  if (/boss/.test(t)) return 'boss';
  if (/chest|loot/.test(t)) return 'loot';
  if (/building|inside|interior|indoors/.test(t)) return 'interior';
  if (/explore|map|everywhere|cover/.test(t)) return 'explore';
  if (/survive|stay alive/.test(t)) return 'survive';
  return 'progress'; // default: the critical path, district after district
}

// ---------- state ----------
const B = {
  on: false, profile: PROFILES.average, goal: 'progress', goalText: '', assist: false,
  t: 0, thinkT: 0, dir: [0, 0], sprint: false, target: null, field: null, fieldK: -1, fieldT: 0,
  stuckT: 0, stuckX: 0, stuckZ: 0, unstick: 0, banned: new Set(), visited: new Set(), seenWind: new Map(),
  ring: [], ringT: 0, sampleT: 0, done: null,
};
const T = {}; // telemetry, reset per session
function resetTelemetry() {
  Object.assign(T, {
    steps: 0, simTime: 0, updMs: [], frames: [], anomalies: [], samples: [], errors: [],
    hurt: {}, hurtN: 0, dmgTaken: 0, kills: {}, ttk: {}, levels: [], scrap: [], districts: [], bosses: [],
    distMem: [], deaths: [], dodges: 0, rollsTried: 0, perfects0: run.perfects || 0, peakEnemies: 0, xpRate: [],
  });
}
resetTelemetry();

/** Hooks called by the game (combat.js) while a QA session is running. */
const hooks = {
  hurt(d, from, raw) {
    const k = raw ? 'hazard' : from && from.type ? (from.boss ? 'boss:' + from.kind : from.type) : from ? 'area-attack' : 'projectile';
    T.hurt[k] = (T.hurt[k] || 0) + d;
    T.hurtN++;
    T.dmgTaken += d;
  },
  kill(e) {
    const k = e.boss ? 'boss:' + e.kind : e.type;
    T.kills[k] = (T.kills[k] || 0) + 1;
    // Time to kill: from first engagement (within 10 of the rat) to death.
    if (e.engT != null) (T.ttk[k] || (T.ttk[k] = [])).push(run.time - e.engT);
    if (e.boss) T.bosses.push({ kind: e.kind, secs: run.time - (e.engT ?? e.born ?? run.time), district: run.tier, won: true });
  },
};

// ---------- anomalies ----------
function snapshot() {
  const near = W.enemies.filter(e => !e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 10).slice(0, 4).map(e => `${e.type}@${Math.hypot(e.x - P.x, e.z - P.z).toFixed(1)}`);
  return { t: +run.time.toFixed(2), x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), hp: Math.round(run.hp), st: G.state, n: W.enemies.length, near, goal: B.goal, tgt: B.target && B.target.kind, dir: B.dir.map(v => +v.toFixed(2)) };
}
function anomaly(kind, detail = {}) {
  // One report per kind per spot: don't flood the log with the same stuck corner.
  const key = kind + ':' + toG(P.x) + ',' + toG(P.z);
  if (T.anomalies.some(a => a.key === key)) return;
  const gx = toG(P.x), gz = toG(P.z);
  T.anomalies.push({
    key, kind, ...detail, district: run.tier, layer: run.layer, seed: run.seed, cls: run.cls, time: +run.time.toFixed(1),
    pos: [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)], tile: inG(gx, gz) ? { gx, gz, t: tAt(gx, gz), top: topAt(gx, gz), inside: M.inside[gi(gx, gz)] } : null,
    context: B.ring.slice(-40), shot: null,
  });
}

// ---------- navigation ----------
const walk = t => t === 1 || t === 2 || t === 9 || t === 10;
/** Distance field (in tiles) to a target tile over ground the rat can walk. */
function fieldTo(gx, gz) {
  const k0 = gi(gx, gz);
  if (B.fieldK === k0 && B.field && B.fieldT > 0) return B.field;
  const n = M.W * M.H, d = new Int16Array(n).fill(-1), q = new Int32Array(n);
  let h = 0, t = 0;
  if (!inG(gx, gz)) return d;
  d[k0] = 0; q[t++] = k0;
  while (h < t) {
    const c = q[h++], x = c % M.W, y = (c / M.W) | 0;
    for (const [dx, dy] of N4) {
      const X = x + dx, Y = y + dy;
      if (!inG(X, Y)) continue;
      const k = gi(X, Y);
      if (d[k] >= 0 || !walk(M.grid[k])) continue;
      d[k] = d[c] + 1; q[t++] = k;
    }
  }
  B.field = d; B.fieldK = k0; B.fieldT = 1.5;
  return d;
}
/** Steer toward a world point along the field; returns a unit direction (or null when unreachable). */
function steerTo(x, z) {
  const gx = toG(x), gz = toG(z), px = toG(P.x), pz = toG(P.z);
  if (gx === px && gz === pz) { const l = Math.hypot(x - P.x, z - P.z) || 1; return [(x - P.x) / l, (z - P.z) / l]; }
  // Targets on a wall face (chests against walls): aim for the nearest walkable neighbour.
  let tx = gx, tz = gz;
  if (inG(gx, gz) && !walk(tAt(gx, gz))) {
    let best = null;
    for (const [dx, dz] of N4) if (walk(tAt(gx + dx, gz + dz))) { best = [gx + dx, gz + dz]; break; }
    if (!best) return null;
    [tx, tz] = best;
  }
  const f = fieldTo(tx, tz);
  const here = inG(px, pz) ? f[gi(px, pz)] : -1;
  if (here < 0) return null;
  if (here <= 1) { const l = Math.hypot(x - P.x, z - P.z) || 1; return [(x - P.x) / l, (z - P.z) / l]; }
  let bd = here, bx = 0, bz = 0;
  for (const [dx, dz] of N8) {
    const X = px + dx, Z = pz + dz;
    if (!inG(X, Z)) continue;
    const v = f[gi(X, Z)];
    // Diagonals only when both orthogonal steps are open (no corner cutting).
    if (dx && dz && (!walk(tAt(px + dx, pz)) || !walk(tAt(px, pz + dz)))) continue;
    if (v >= 0 && v < bd) { bd = v; bx = toW(X) - P.x; bz = toW(Z) - P.z; }
  }
  const l = Math.hypot(bx, bz) || 1;
  return [bx / l, bz / l];
}

// ---------- goals: where to go next ----------
const reachable = o => o && !B.banned.has(toG(o.x) + ',' + toG(o.z));
const nearestOf = list => { let b = null, bd = 1e9; for (const o of list) { if (!reachable(o)) continue; const d = Math.hypot(o.x - P.x, o.z - P.z); if (d < bd) { bd = d; b = o; } } return b; };
function exploreTarget() {
  // The nearest walkable tile not yet visited, sampled.
  let b = null, bd = 1e9;
  for (let i = 0; i < 160; i++) {
    const k = (Math.random() * M.W * M.H) | 0, x = k % M.W, z = (k / M.W) | 0;
    if (!walk(M.grid[k]) || B.visited.has(k) || B.banned.has(x + ',' + z)) continue;
    const d = Math.hypot(toW(x) - P.x, toW(z) - P.z);
    if (d < bd) { bd = d; b = { x: toW(x), z: toW(z), kind: 'explore' }; }
  }
  return b;
}
function chooseTarget() {
  const pr = B.profile, foods = W.foods;
  if (B.goal === 'die') {
    // Fail on purpose: walk into the thickest danger and do nothing clever.
    if (G.boss && !G.boss.dead) return { x: G.boss.x, z: G.boss.z, kind: 'mob', e: G.boss };
    const m = nearestOf(W.enemies.filter(e => !e.dead && !e.hidden && !e.mesh));
    return m ? { x: m.x, z: m.z, kind: 'mob', e: m } : exploreTarget();
  }
  if (run.hp < st.maxHp * 0.4 && Math.random() < pr.heal && foods.length) { const f = nearestOf(foods); if (f) return { x: f.x, z: f.z, kind: 'food' }; }
  // A Breakthrough trial: the Champion has to die in time or the level cap holds.
  const champ = W.enemies.find(e => e.champion && !e.dead);
  if (champ && B.goal !== 'die') return { x: champ.x, z: champ.z, kind: 'mob', e: champ };
  const exits = G.exits && G.exits.length ? G.exits : G.exitD ? [G.exitD] : [];
  if (B.goal === 'manhole' && G.manhole) return { x: G.manhole.x, z: G.manhole.z, kind: 'manhole' };
  if (B.goal === 'interior') {
    for (let k = 0; k < M.inside.length; k++) if (M.inside[k] && M.grid[k] === 1 && !B.banned.has((k % M.W) + ',' + ((k / M.W) | 0))) return { x: toW(k % M.W), z: toW((k / M.W) | 0), kind: 'interior' };
  }
  if (B.goal === 'explore') return exploreTarget();
  if (B.goal === 'loot' || Math.random() < pr.loot * 0.2) { const c = nearestOf(W.chests.filter(c => !c.open && c.y < 0.6 && !c.cursed)); if (c && (B.goal === 'loot' || Math.hypot(c.x - P.x, c.z - P.z) < 14)) return { x: c.x, z: c.z, kind: 'chest', o: c }; }
  if (exits.length && B.goal !== 'boss' && B.goal !== 'survive') { const e = nearestOf(exits); if (e) return { x: e.x, z: e.z, kind: 'exit' }; }
  const b = G.boss;
  if (b && b.revealed && !b.dead) return { x: b.x, z: b.z, kind: 'boss', e: b };
  if (b && !b.dead && B.goal !== 'survive') return { x: b.x, z: b.z, kind: 'boss', e: b };
  const ot = objTargets().filter(reachable);
  if (ot.length) { const o = nearestOf(ot); if (o) return { x: o.x, z: o.z, kind: 'objective', o }; }
  const nests = W.enemies.filter(e => e.type === 'nest' && !e.dead);
  if (nests.length && B.goal !== 'survive') { const n = nearestOf(nests); if (n) return { x: n.x, z: n.z, kind: 'nest', e: n }; }
  // Nothing to do: hunt the nearest crowd, or explore.
  const mob = nearestOf(W.enemies.filter(e => !e.dead && !e.hidden && !e.disguise && !e.mesh));
  if (mob && Math.random() < 0.6) return { x: mob.x, z: mob.z, kind: 'mob', e: mob };
  return exploreTarget();
}

// ---------- the agent ----------
function threatDir() {
  // Seen wind-ups (after the reaction delay) and incoming shots close by.
  const pr = B.profile;
  let hx = 0, hz = 0, n = 0, danger = null;
  for (const e of W.enemies) {
    if (e.dead || e.hidden) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > 9) continue;
    if (d < 10 && e.engT == null) e.engT = run.time;
    if (d < 4) { hx += dx / (d || 1); hz += dz / (d || 1); n++; }
    const winding = e.st === 'wind' || e.wind > 0;
    if (winding && d < (e.boss ? 9 : 4.5)) {
      const since = (e.tel0 || 0.4) - (e.st === 'wind' ? e.tt : e.wind);
      if (since >= pr.react && !B.seenWind.has(e)) { B.seenWind.set(e, Math.random() < pr.dodge); }
      if (B.seenWind.get(e)) danger = danger || { x: e.x, z: e.z };
    } else B.seenWind.delete(e);
  }
  for (const p of W.eproj) {
    const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
    if (d < 3 && (p.vx * -dx + p.vz * -dz) > 0 && Math.random() < pr.dodge * 0.3) danger = danger || { x: p.x, z: p.z };
  }
  return { crowd: n, cx: hx, cz: hz, danger };
}

function think(dt) {
  const pr = B.profile;
  B.thinkT -= dt;
  const th = threatDir();
  // Dodge: roll at right angles to the threat.
  if (th.danger && P.roll <= 0 && P.rollCd <= 0 && run.sta > 20 && B.goal !== 'die') {
    const ax = P.x - th.danger.x, az = P.z - th.danger.z, l = Math.hypot(ax, az) || 1, s = Math.random() < 0.5 ? 1 : -1;
    setDir(-az / l * s * 0.7 + ax / l * 0.7, ax / l * s * 0.7 + az / l * 0.7);
    T.rollsTried++;
    startRoll();
    B.seenWind.clear();
  }
  if (B.thinkT > 0) return;
  B.thinkT = 0.1 + pr.react * 0.3;
  if (!B.target || B.target.done || Math.random() < 0.08 || (B.target.e && B.target.e.dead)) B.target = chooseTarget();
  const tg = B.target;
  let d = [0, 0];
  if (tg) {
    if (tg.e && !tg.e.dead) { tg.x = tg.e.x; tg.z = tg.e.z; }
    const dist = Math.hypot(tg.x - P.x, tg.z - P.z);
    const fight = tg.kind === 'boss' || tg.kind === 'mob' || tg.kind === 'nest';
    const want = fight ? (RANGED[run.cls] ? 6.5 : 1.6) : 0.6;
    if (dist > want) d = steerTo(tg.x, tg.z) || (B.banned.add(toG(tg.x) + ',' + toG(tg.z)), B.target = null, [0, 0]);
    else if (fight && RANGED[run.cls]) { const a = Math.atan2(P.x - tg.x, P.z - tg.z) + 0.9; d = [Math.sin(a), Math.cos(a)]; } // orbit at range
    else if (tg.kind === 'chest' || tg.kind === 'manhole') { pressE(); tg.done = tg.kind === 'chest'; }
    else if (tg.kind === 'objective') { const c = chewTarget(); if (c && c.kind === 'cage') { keys.KeyE = true; if (!P.chewing) pressE(); } }
    else if (tg.kind === 'explore' || tg.kind === 'interior' || tg.kind === 'food') tg.done = true;
  }
  // Kite away from crowds (skilled players don't stand in the middle).
  if (th.crowd >= 3 && Math.random() < pr.kite && B.goal !== 'die') {
    const l = Math.hypot(th.cx, th.cz) || 1;
    d = [d[0] * 0.4 - th.cx / l, d[1] * 0.4 - th.cz / l];
  }
  // Novices wobble.
  d = [d[0] + rand(-pr.jitter, pr.jitter), d[1] + rand(-pr.jitter, pr.jitter)];
  setDir(d[0], d[1]);
  B.sprint = (tg && (tg.kind === 'exit' || tg.kind === 'explore')) || th.crowd >= 4;
  // Abilities.
  if (th.crowd >= 4 && Math.random() < pr.special) useSpecial();
  if (SIGS[run.cls] && th.crowd >= 2 && Math.random() < pr.sig * 0.5) useSig();
  if (run.shriekReady && Math.random() < pr.special) shriek();
}
function setDir(x, z) {
  const l = Math.hypot(x, z);
  B.dir = l > 0.05 ? [x / l, z / l] : [0, 0];
}
function applyInput() {
  // Camera-relative stick, the same path a touch player uses.
  const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw), rx = -Math.cos(G.camYaw), rz = Math.sin(G.camYaw);
  const [x, z] = B.dir;
  stick.active = x !== 0 || z !== 0;
  stick.y = x * fx + z * fz;
  stick.x = x * rx + z * rz;
  keys.ShiftLeft = B.sprint && run.sta > 30;
  if (!(B.target && B.target.kind === 'objective')) keys.KeyE = false;
}

function pickUpgrade() {
  const offers = currentOffers();
  if (!offers || !offers.length) {
    // A level-up screen with nothing to pick is a soft-lock for a real player.
    anomaly('empty-levelup', { pending: run.pendingLv, bt: run.btPick, weapons: run.weapons.map(w => w.id + w.lvl) });
    run.pendingLv = 0; run.btPick = 0; G.state = 'play';
    return;
  }
  const pol = B.profile.pick;
  let o;
  if (pol === 'random') o = pick(offers);
  else {
    const score = x => (x.kind === 'evo' ? 100 : 0) + (x.kind === 'key' ? 60 : 0) + (x.kind === 'rule' ? 50 : 0) + (x.kind === 'up' ? 30 + (pol === 'build' ? (run.weapons.find(w => w.id === x.id) || { lvl: 0 }).lvl * 5 : 0) : 0) + (x.kind === 'new' ? (run.weapons.length < 4 ? 40 : 5) : 0) + (x.kind === 'tome' ? 20 : 0) + (x.kind === 'cursed' ? (pol === 'build' ? -10 : 10) : 0) + Math.random() * 5;
    o = offers.slice().sort((a, b) => score(b) - score(a))[0];
  }
  choose(o);
}

function watchdogs(dt) {
  // Stuck: trying to move, going nowhere.
  B.stuckT += dt;
  if (B.stuckT > 3) {
    const moved = Math.hypot(P.x - B.stuckX, P.z - B.stuckZ);
    if ((B.dir[0] || B.dir[1]) && moved < 0.8 && !P.chewing && G.state === 'play') {
      B.unstick++;
      keys.Space = true; P.buffer = 0.13; // hop
      setDir(rand(-1, 1), rand(-1, 1));
      if (B.unstick >= 3) {
        anomaly('stuck', { target: B.target && B.target.kind, tx: B.target && +B.target.x.toFixed(1), tz: B.target && +B.target.z.toFixed(1) });
        if (B.target) B.banned.add(toG(B.target.x) + ',' + toG(B.target.z));
        B.target = null; B.unstick = 0;
      }
    } else { B.unstick = 0; keys.Space = false; }
    B.stuckT = 0; B.stuckX = P.x; B.stuckZ = P.z;
  }
  // Out of the world / NaN.
  if (!Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) anomaly('nan-position');
  else if (P.y < -6 && tAt(toG(P.x), toG(P.z)) !== 7) anomaly('fell-out-of-world');
  // Inside a wall (not squeezing through a crawlspace).
  const gx = toG(P.x), gz = toG(P.z), t = tAt(gx, gz);
  const depth = Math.min(P.x - (toW(gx) - 2), toW(gx) + 2 - P.x, P.z - (toW(gz) - 2), toW(gz) + 2 - P.z);
  if (inG(gx, gz) && solidFor(t, true) && depth > 0.35 && P.y < topAt(gx, gz) - 0.4 && !P.squeeze && !P.inDuct && !P.climbing) { B.wallT = (B.wallT || 0) + dt; if (B.wallT > 0.6) anomaly('inside-wall', { t }); } else B.wallT = 0;
  // Enemies with broken positions.
  for (const e of W.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) { anomaly('enemy-nan', { type: e.type }); e.dead = true; }
}

function sample() {
  T.peakEnemies = Math.max(T.peakEnemies, W.enemies.length);
  const mem = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const ri = renderer.info;
  T.samples.push({
    t: +run.time.toFixed(1), district: run.tier, lvl: run.level, hp: Math.round(run.hp), scrap: Math.round(run.scrap), kills: run.kills, threat: +(run.T || 0).toFixed(2),
    enemies: W.enemies.length, parts: W.parts.length, gibs: W.gibs.length, corpses: W.corpses.length, puddles: W.puddles.length, eproj: W.eproj.length, pproj: W.pproj.length,
    geo: ri.memory.geometries, tex: ri.memory.textures, calls: ri.render.calls, objects: world.children.length, heapMB: +(mem / 1048576).toFixed(1),
  });
}

/** One simulation step: the bot thinks, inputs land, the game updates. */
function step(dt) {
  if (G.state === 'levelup') { B.lvlPicks = (B.lvlPicks || 0) + 1; pickUpgrade(); if (B.lvlPicks > 400) { anomaly('levelup-loop', { pending: run.pendingLv }); G.state = 'play'; run.pendingLv = 0; } return; }
  B.lvlPicks = 0;
  if (G.state !== 'play') return;
  G.time += dt;
  let sdt = dt;
  if (G.hitStop > 0) { G.hitStop -= dt; sdt = dt * 0.06; } else if (G.slowMo > 0) { G.slowMo -= dt; sdt = dt * 0.3; }
  B.t += dt;
  const px = toG(P.x), pz = toG(P.z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inG(px + dx, pz + dz)) B.visited.add(gi(px + dx, pz + dz)); // the rat sees the tiles around it
  B.fieldT -= dt;
  think(sdt);
  applyInput();
  const lv = run.level;
  if (B.tierSeen !== run.tier) { if (B.tierSeen != null) T.districts.push({ to: run.tier, t: +run.time.toFixed(1) }); B.tierSeen = run.tier; B.visited.clear(); B.banned.clear(); B.target = null; B.memT = 2; }
  const t0 = performance.now();
  update(sdt);
  const ms = performance.now() - t0;
  T.updMs.push(ms);
  if (ms > 60) anomaly('update-spike', { ms: +ms.toFixed(1), enemies: W.enemies.length });
  T.steps++; T.simTime += sdt;
  if (run.level > lv) T.levels.push({ lvl: run.level, t: +run.time.toFixed(1) });
  if (B.memT > 0 && (B.memT -= dt) <= 0) { const ri = renderer.info; T.distMem.push({ district: run.tier, geo: ri.memory.geometries, tex: ri.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0, objects: world.children.length }); }
  watchdogs(dt);
  B.ringT -= dt;
  if (B.ringT <= 0) { B.ringT = 0.25; B.ring.push(snapshot()); if (B.ring.length > 60) B.ring.shift(); }
  B.sampleT -= dt;
  if (B.sampleT <= 0) { B.sampleT = 5; sample(); }
}

// ---------- the API the harness uses ----------
export const qa = {
  PROFILES,
  parseGoal,
  start({ profile = 'average', goal = 'progress', assist = false } = {}) {
    resetTelemetry();
    Object.assign(B, { tierSeen: null, memT: 0, on: true, profile: PROFILES[profile] || PROFILES.average, profileName: profile, goalText: goal, goal: parseGoal(goal), assist, t: 0, target: null, field: null, fieldK: -1, ring: [], done: null, visited: new Set(), banned: new Set(), seenWind: new Map() });
    G.qa = hooks;
    G.qaHold = true;
    if (assist) { st.taken = 0; st.dmg *= 4; }
    T.start = { district: run.tier, time: run.time, perfects: run.perfects || 0 };
  },
  stop() { B.on = false; G.qa = null; G.qaHold = false; stick.active = false; for (const k of ['ShiftLeft', 'KeyE', 'Space']) keys[k] = false; },
  /** Fast-forward `secs` of game time (stops early on death, district change or goal met). Returns status. */
  sim(secs, dt = 1 / 30) {
    const end = T.simTime + secs, dist0 = run.tier;
    let n = 0;
    let guard = 0;
    while (T.simTime < end && B.on && guard++ < secs / dt * 4 + 50) {
      if (G.state === 'dead') { if (!T.deaths.length || T.deaths[T.deaths.length - 1].t !== run.time) T.deaths.push({ t: +run.time.toFixed(1), district: run.tier, lvl: run.level, by: lastHurt() }); return 'dead'; }
      if (G.state === 'trans') return 'trans';
      if (G.state !== 'play' && G.state !== 'levelup') return G.state;
      step(dt);
      if (++n % 6 === 0) { sync(dt * 6); animate(dt * 6); }
      if (goalMet()) return 'goal';
      if (run.tier !== dist0) return 'district';
    }
    return 'ok';
  },
  goalMet,
  telemetry: () => T,
  /** Rendered-frame cost probe (real rAF frames, with rendering). */
  async frameProbe(n = 30) {
    G.qaHold = true;
    return new Promise(res => {
      const out = [];
      let last = performance.now();
      const f = now => { out.push(now - last); last = now; if (out.length < n) requestAnimationFrame(f); else { T.calls = Math.max(T.calls || 0, renderer.info.render.calls); res(out.slice(2)); } };
      requestAnimationFrame(f);
    });
  },
  /** Heavy-load stress: N mobs, a hail of projectiles and particles; returns frame stats. */
  stressSetup(n, spawn) {
    for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.mesh) e.dead = true;
    const tiles = [];
    for (let k = 0; k < M.grid.length; k++) { const x = toW(k % M.W), z = toW((k / M.W) | 0), t = M.grid[k]; if ((t === 1 || t === 9 || t === 10) && Math.hypot(x - P.x, z - P.z) < 26) tiles.push([x, z]); }
    for (let i = 0; i < n && tiles.length; i++) { const [x, z] = pick(tiles); spawn(i % 3 ? 'mawling' : pick(['tick', 'roach', 'bat', 'crow', 'ghoul', 'shieldrat', 'spitter']), x + rand(-1.5, 1.5), z + rand(-1.5, 1.5), { plain: true, force: true }); }
    for (let i = 0; i < 400; i++) W.parts.push({ x: P.x + rand(-8, 8), y: rand(0, 4), z: P.z + rand(-8, 8), vx: rand(-1, 1), vy: rand(0, 2), vz: rand(-1, 1), life: 3, c: 0xffffff, s: 1, ng: true });
  },
  ring: () => B.ring.slice(),
  takeShot(i) { const a = T.anomalies[i]; return a ? a.context : null; },
  bot: B,
};
function lastHurt() {
  const r = B.ring[B.ring.length - 1];
  return r ? r.near.join(' ') : '';
}
function goalMet() {
  switch (B.goal) {
    case 'manhole': return run.layer === 'sewer';
    case 'boss': return run.bossDone;
    case 'nests': return !W.enemies.some(e => e.type === 'nest' && !e.dead);
    case 'interior': return !!P.inBldg;
    case 'loot': return !W.chests.some(c => !c.open && c.y < 0.6 && !c.cursed && reachable(c));
    case 'die': return G.state === 'dead';
    default: return false;
  }
}
