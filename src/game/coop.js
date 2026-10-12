// Local co-op: 2–4 rats on one screen (keyboard split + gamepads).
//
// The game was written around one rat: P (body), st (stats), a handful of per-rat
// run.* fields and G.rat (the model) are module singletons read everywhere. Rather
// than thread a player argument through ~1,500 call sites, co-op keeps each rat's
// copy of that state in a context and swaps it into the singletons while that rat
// is stepped. Between frames the singletons always hold player 1, so keyboard
// events, the HUD and the debug handle keep working unchanged.
//
// Per frame (coopUpdate): every live non-lead rat gets its own step (move, attack,
// status, the enemies and enemy shots nearest to it, pickups, food, drain), then
// the lead (the first rat still standing) runs the normal update, which also
// ticks the world once. Enemies always chase the nearest standing rat because
// each enemy is updated during the pass of the rat nearest to it.
// Friendly fire is off: player attacks only ever hit enemies.
import * as THREE from 'three';
import { G, P, W, run, st } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { CLASSES } from '../data/classes.js';
import { TUNE } from '../tuning.js';
import { makeRat, blob } from '../entities/rat.js';
import { keys, stepPlayer, primary, startRoll, useSpecial, pressE, toggleLock } from '../entities/player.js';
import { updateEnemies } from '../entities/mobs.js';
import { tickPlayerTimers, markSafe, updatePlayerStatus, updateProjectiles, updatePickups } from './update.js';
import { tickHaz } from '../combat/hazards.js';
import { tickTurbo, turboDown, turboUp } from './turbo.js';
import { tickSig, useSig } from './signature.js';
import { tickPowerups } from './powerups.js';
import { throwVial } from './vials.js';
import { eatNearby, drainHealth } from './food.js';
import { comboTick } from './swarm.js';
import { useFlask, cycleFlask } from './shop.js';
import { dnum } from '../fx/fx.js';

/** Co-op state. setup is chosen in the Nest; players exist only during a co-op run. */
export const coop = {
  on: false,
  setup: { n: 1, cls: ['brawler', 'brawler', 'brawler', 'brawler'], input: ['kb1', 'kb2', 'pad0', 'pad1'] },
  players: [],
  active: 0,
};
export const INPUTS = { kb1: 'Keyboard + mouse', kb2: 'Keyboard (arrows + numpad)', pad0: 'Gamepad 1', pad1: 'Gamepad 2', pad2: 'Gamepad 3', pad3: 'Gamepad 4' };

// Per-rat fields kept on run (everything else on run is shared by the party: gold, keys, XP, level, kills).
const RF = ['cls', 'hp', 'turbo', 'vials', 'pu', 'buffs', 'flasks', 'flaskSel', 'cheese', 'tails', 'specT', 'primT', 'growth', 'combo', 'comboT', 'lowWarned', 'blood', 'bloodT'];
// Per-rat fields kept on G (turbo input state, lock-on, aim and attack input).
const GF = ['turboHeld', 'turboKey', 'turboArmT', 'turboFlash', 'lockOn', 'attack', 'aimAt', 'touch', 'rat'];
const pick = (o, ks) => { const r = {}; for (const k of ks) r[k] = o[k]; return r; };
const fill = (o, v) => { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, v); };

function swapOut(p) {
  p.P = { ...P };
  p.st = { ...st };
  p.run = pick(run, RF);
  p.G = pick(G, GF);
}
function swapIn(p) {
  fill(P, p.P);
  fill(st, p.st);
  Object.assign(run, p.run);
  Object.assign(G, p.G);
  coop.active = p.i;
}
/** Run fn with player i's state in the singletons, then put the previous rat back. */
export function asPlayer(i, fn) {
  const cur = coop.players[coop.active], p = coop.players[i];
  if (!p || p === cur) return fn();
  swapOut(cur); swapIn(p);
  try { return fn(); } finally { swapOut(p); swapIn(cur); }
}

/** Number of rats in this run (1 outside co-op). */
export const playerCount = () => (coop.on ? coop.players.length : 1);
/** Live enemy count across every co-op split (the cap checks use this). */
export const enemyTotal = () => (coop.total != null ? coop.total : W.enemies.length);

// ---------- setup / teardown ----------
/** Called by startRun once player 1's run is built (run, st, P and G.rat are player 1). */
export function coopStart(freshStats, shopGrowth) {
  coopEnd();
  const n = Math.max(1, Math.min(4, coop.setup.n | 0));
  if (n < 2) return;
  coop.on = true;
  const p1 = { i: 0, input: coop.setup.input[0], blob, prev: {} };
  coop.players = [p1];
  swapOut(p1);
  const base = { ...p1.P }, pr = pick(run, RF);
  for (let i = 1; i < n; i++) {
    const cls = CLASSES[coop.setup.cls[i]] ? coop.setup.cls[i] : 'brawler', C = CLASSES[cls];
    Object.assign(run, pr, { cls, turbo: 0, vials: TUNE.vials.start, pu: {}, buffs: {}, flasks: {}, flaskSel: 0, cheese: 0, tails: 0, specT: 0, primT: 0, growth: shopGrowth(), combo: 0, comboT: 0, lowWarned: false, blood: 0, bloodT: 0 });
    fill(st, freshStats(cls));
    st.salvage = p1.st.salvage; // gold upgrades and difficulty are party-wide
    run.hp = st.maxHp;
    const a = i * Math.PI * 0.5;
    fill(P, { ...base, safe: { ...base.safe }, x: base.x + Math.sin(a) * 1.5, z: base.z + Math.cos(a) * 1.5, carry: null, sig: null, grab: null, inv: 1 });
    const rat = makeRat(C);
    scene.add(rat.g);
    const b = blob.clone();
    scene.add(b);
    const p = { i, input: coop.setup.input[i] || 'pad' + (i - 1), blob: b, prev: {} };
    G.rat = rat;
    Object.assign(G, { turboHeld: false, turboKey: false, turboArmT: 0, turboFlash: 0, lockOn: null, attack: false, aimAt: null, touch: true });
    swapOut(p);
    coop.players.push(p);
  }
  swapIn(p1);
  coop.seed = run.seed;
}
/** Back to one rat (menu, death). */
export function coopEnd() {
  if (coop.on) {
    if (coop.active !== 0) swapIn(coop.players[0]);
    for (const p of coop.players.slice(1)) { scene.remove(p.G.rat.g); scene.remove(p.blob); }
  }
  coop.on = false;
  coop.players = [];
  coop.active = 0;
  coop.total = null;
}

// ---------- input ----------
const KB2 = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD', NumpadEnter: 'Space', Numpad0: 'KeyJ', NumpadDecimal: 'Shift', Numpad1: 'KeyQ', Numpad2: 'KeyG', Numpad3: 'KeyX', Numpad4: 'KeyZ', Numpad5: 'KeyE', Numpad6: 'KeyV', Numpad7: 'KeyB', Numpad8: 'KeyR' };
export const P2_CODES = new Set([...Object.keys(KB2), 'ShiftRight']);
// Standard gamepad: A jump, B use, X attack, Y special, LB dodge, RB turbo, LT vial, RT signature,
// d-pad up flask, d-pad down switch flask, right stick click lock-on. Left stick moves, right stick aims and fires.
const PAD = { 0: 'Space', 1: 'KeyE', 2: 'KeyJ', 3: 'KeyQ', 4: 'Shift', 5: 'KeyX', 6: 'KeyZ', 7: 'KeyG', 12: 'KeyV', 13: 'KeyB', 11: 'KeyR' };
/** Test hook: fake gamepads (index → { axes, buttons }) when the browser has none. */
export const fakePads = {};

function virtualKeys(p, raw) {
  const v = {};
  if (p.input === 'kb1') {
    for (const k in raw) if (raw[k] && !P2_CODES.has(k)) v[k] = true;
    v.attack = G.attack; // mouse / J, kept by input.js
    v.mouse = true;
    return v;
  }
  if (p.input === 'kb2') {
    for (const k in KB2) if (raw[k]) v[KB2[k]] = true;
    if (raw.ShiftRight) v.Shift = true;
    v.attack = !!v.KeyJ;
    return v;
  }
  const idx = +p.input.slice(3), pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = fakePads[idx] || (pads && pads[idx]);
  if (!gp) return v;
  const ax = gp.axes || [], btn = i => { const b = gp.buttons && gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.5 || b === true)); };
  const D = TUNE.coop.deadzone;
  if ((ax[0] || 0) < -D || btn(14)) v.KeyA = true;
  if ((ax[0] || 0) > D || btn(15)) v.KeyD = true;
  if ((ax[1] || 0) < -D) v.KeyW = true;
  if ((ax[1] || 0) > D) v.KeyS = true;
  if ((ax[2] || 0) < -D) v.ArrowLeft = true;
  if ((ax[2] || 0) > D) v.ArrowRight = true;
  if ((ax[3] || 0) < -D) v.ArrowUp = true;
  if ((ax[3] || 0) > D) v.ArrowDown = true;
  for (const b in PAD) if (btn(+b)) v[PAD[b]] = true;
  v.attack = !!v.KeyJ;
  return v;
}

/** Fire the press/release actions keyboard events would for player 1. */
function edgeActions(p, v) {
  const was = p.prev, down = k => v[k] && !was[k];
  if (down('Space')) P.buffer = 0.13;
  if (down('Shift')) startRoll();
  if (down('KeyR')) toggleLock();
  if (down('KeyQ')) useSpecial();
  if (down('KeyG')) useSig();
  if (down('KeyZ')) throwVial();
  if (down('KeyV')) useFlask();
  if (down('KeyB')) cycleFlask();
  if (down('KeyE')) pressE();
  if (down('KeyX')) turboDown();
  if (!v.KeyX && was.KeyX) turboUp();
  if (!v.KeyE && was.KeyE) { P.chewing = false; P.chewT = 0; }
  p.prev = v;
}

// ---------- the split ----------
const alive = () => coop.players.filter(p => !(p.i === coop.active ? P.downed : p.P.downed));
const posOf = p => (p.i === coop.active ? P : p.P);
function nearestIdx(x, z) {
  let bi = coop.active, bd = Infinity;
  for (const p of alive()) { const q = posOf(p), d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; bi = p.i; } }
  return bi;
}
/**
 * In co-op, cut W.enemies (kind 'enemies') or the projectile lists (kind 'proj') down
 * to what belongs to the active rat; returns a function that puts the rest back.
 * Outside co-op it does nothing.
 */
export function coopSplit(kind) {
  if (!coop.on) return () => {};
  const me = coop.active, keepIf = (arr, f) => {
    const rest = [];
    let w = 0;
    for (const x of arr) { if (f(x)) arr[w++] = x; else rest.push(x); }
    arr.length = w;
    return () => { for (const x of rest) arr.push(x); };
  };
  if (kind === 'enemies') {
    coop.total = W.enemies.length;
    const back = keepIf(W.enemies, e => (e._tgt = nearestIdx(e.x, e.z)) === me);
    return () => { back(); coop.total = null; };
  }
  // Enemy shots go to the rat nearest them; player shots stay with the rat that fired them.
  for (const s of W.pproj) if (s.owner == null) s.owner = me;
  const b1 = keepIf(W.eproj, s => nearestIdx(s.x, s.z) === me), b2 = keepIf(W.pproj, s => s.owner === me);
  return () => { b1(); b2(); };
}

/** A non-lead rat's own step. */
function stepOther(dt) {
  tickPlayerTimers(dt);
  stepPlayer(dt / 2);
  stepPlayer(dt / 2);
  primary(dt);
  tickHaz(dt);
  markSafe();
  updatePlayerStatus(dt);
  if (G.state !== 'play') return;
  { const back = coopSplit('enemies'); updateEnemies(dt, G.spawnCap || TUNE.enemies.cap); back(); }
  { const back = coopSplit('proj'); updateProjectiles(dt); back(); }
  comboTick(dt);
  tickSig(dt);
  tickTurbo(dt);
  tickPowerups(dt);
  updatePickups(dt);
  eatNearby();
  drainHealth(dt);
}

/** Downed: a standing rat close by fills the revive bar (TUNE.coop.revive*). */
function tickRevive(p, dt) {
  const q = p.P, C = TUNE.coop;
  const helper = alive().some(o => { const r = posOf(o); return Math.hypot(r.x - q.x, r.z - q.z) < C.reviveR; });
  q.reviveT = helper ? (q.reviveT || 0) + dt : Math.max(0, (q.reviveT || 0) - dt * 0.5);
  if (q.reviveT >= C.reviveTime) {
    q.downed = false; q.reviveT = 0; q.inv = 2;
    p.run.hp = p.st.maxHp * C.reviveHp;
    dnum(q.x, q.y + 1.8, q.z, 'Back up!', 'heal');
  }
}

/** Keep stragglers on screen: anyone beyond the leash (or on a new level) joins the lead. */
function leash(lead) {
  const L = posOf(lead), newMap = coop.seed !== run.seed;
  coop.seed = run.seed;
  for (const p of coop.players) {
    if (p === lead) continue;
    const q = posOf(p);
    if (newMap || Math.hypot(q.x - L.x, q.z - L.z) > TUNE.coop.leash) {
      const a = p.i * 1.7;
      Object.assign(q, { x: L.x + Math.sin(a) * 1.5, y: L.y + 0.2, z: L.z + Math.cos(a) * 1.5, vx: 0, vy: 0, vz: 0, inDuct: L.inDuct, inBldg: L.inBldg });
      q.safe = { x: L.x, y: L.y, z: L.z };
    }
  }
}

/** The co-op frame. solo is update.js's single-rat update (world + the lead rat). */
export function coopUpdate(dt, solo) {
  const raw = { ...keys }, p1 = coop.players[0];
  swapOut(p1);
  let lead = coop.players.find(p => !p.P.downed) || p1;
  for (const p of coop.players) {
    if (p === lead || p.P.downed) continue;
    swapIn(p);
    const v = virtualKeys(p, raw);
    fill(keys, v);
    G.attack = !!v.attack;
    G.touch = !v.mouse; // no mouse: attacks auto-aim at the nearest enemy ahead (touch aim)
    if (p.input !== 'kb1') edgeActions(p, v); // player 1's keyboard acts through input.js events
    stepOther(dt);
    swapOut(p);
    if (G.state !== 'play') break;
  }
  swapIn(lead);
  if (G.state === 'play') {
    const v = virtualKeys(lead, raw);
    fill(keys, v);
    G.attack = !!v.attack;
    G.touch = !v.mouse;
    if (lead.input !== 'kb1') edgeActions(lead, v);
    solo(dt);
    // The lead may have gone down during its own pass: the next frame picks a new one.
  }
  swapOut(lead);
  // Every rat's state is now in its own context: point posOf/alive at the stored copies so
  // tickRevive and leash write to p.P (writes to the singletons would be lost by swapIn(p1)).
  coop.active = -1;
  lead = coop.players.find(p => !p.P.downed) || lead;
  for (const p of coop.players) if (p.P.downed) tickRevive(p, dt);
  leash(lead);
  swapIn(p1);
  fill(keys, raw);
}

/** Death hook (screens.die): go down instead while another rat still stands. True if handled. */
export function coopDown() {
  if (!coop.on || run.abandon) return false;
  const others = coop.players.filter(p => p.i !== coop.active && !p.P.downed);
  if (!others.length) return false;
  P.downed = true;
  P.reviveT = 0;
  run.hp = 0;
  P.vx = P.vz = 0;
  dnum(P.x, P.y + 1.8, P.z, 'Down! Stand next to them to revive', 'crit');
  return true;
}

/** Level-up hook (stats.js growStats): every other rat grows too. */
export function coopGrow(grow) {
  if (!coop.on) return;
  const me = coop.active;
  for (const p of coop.players) if (p.i !== me) asPlayer(p.i, grow);
}

// ---------- drawing ----------
const _c = new THREE.Vector3();
/** Draw every other rat (animate is sync.js's single-rat animation, run per rat). */
export function coopAnimate(dt, animateRat) {
  if (!coop.on) return;
  for (const p of coop.players.slice(1)) asPlayer(p.i, () => { animateRat(dt, p.blob); G.rat.g.rotation.z = P.downed ? 1.4 : 0; });
  if (P.downed && G.rat) G.rat.g.rotation.z = 1.4;
}
/** Camera framing: the middle of every standing rat, and how far apart they are. */
export function coopFrame() {
  if (!coop.on) return null;
  const ps = alive().length ? alive() : coop.players;
  _c.set(0, 0, 0);
  for (const p of ps) { const q = posOf(p); _c.x += q.x; _c.y += q.y; _c.z += q.z; }
  _c.multiplyScalar(1 / ps.length);
  let spread = 0;
  for (const p of ps) { const q = posOf(p); spread = Math.max(spread, Math.hypot(q.x - _c.x, q.z - _c.z)); }
  return { x: _c.x, y: _c.y, z: _c.z, spread };
}
/** HUD strip: one card per rat. */
export function coopHud() {
  if (!coop.on) return '';
  return coop.players.map(p => {
    const cur = p.i === coop.active, q = cur ? P : p.P, r = cur ? run : p.run, s = cur ? st : p.st, C = CLASSES[r.cls];
    const hp = Math.max(0, r.hp) / (s.maxHp || 1);
    return `<div class="cp${q.downed ? ' down' : ''}" style="--rc:${C.rc}"><b class="px">P${p.i + 1} · ${C.name}</b>
      <u><s style="width:${hp * 100}%"></s></u><i style="width:${Math.min(100, (r.turbo || 0) / 3 * 100)}%"></i>
      <span class="px">${q.downed ? `DOWN ${Math.round((q.reviveT || 0) / TUNE.coop.reviveTime * 100)}%` : `${Math.ceil(r.hp)} HP`}${Object.values(r.flasks || {}).reduce((a, b) => a + b, 0) ? ` · ${Object.values(r.flasks).reduce((a, b) => a + b, 0)} flask` : ''}</span></div>`;
  }).join('');
}
