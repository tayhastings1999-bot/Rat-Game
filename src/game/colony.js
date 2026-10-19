// The swarm prototype (open the game with ?swarm): you are the rat king, and your colony
// is everything. It shields you: a hit on you kills rats near you instead (with none near,
// you take it). It is your weapon: hold attack to surge it at the aim point, where rats
// latch on, pin what they outnumber and bite until it drops. It is your currency: spend
// rats on the city's weak points (E at a gnaw point) or throw a few as bait (Q). Kills and
// food breed more. Numbers live in TUNE.colony. Solo only for now.
import { G, P, W, run } from '../core/state.js';
import { TUNE } from '../tuning.js';
import { rand, angD } from '../core/util.js';
import { collideBody, floorY, G as GRAV } from '../world/grid.js';
import { hit } from '../combat/combat.js';
import { swarmIM, swarmGlowIM, swarmIMO, SWARM_CAP, dummy, tmpC } from '../render/pools.js';
import { animTick, writePose } from '../render/rig.js';
import { dnum, puff, spark, blood, decal } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { keys, mouseAim, camBasis } from '../entities/player.js';
import { springTrap } from './traps.js';

export const colony = {
  on: typeof location !== 'undefined' && /[?&]swarm\b/.test(location.search),
  rats: [],
  breed: 0, // fractional rats owed from kills and food
  surgeAt: null, // the aim point while attack is held, else null
  baitCd: 0,
  engaged: new Set(), // enemies with rats on them
  hud: null,
};
const C = () => TUNE.colony;
const d2 = (a, x, z) => (a.x - x) ** 2 + (a.z - z) ** 2;
export const ratCount = () => colony.rats.length;
/** The colony fights for the king while it has rats; with none left he fights alone. */
export const colonyLeads = () => colony.on && colony.rats.length > 0;

// ---------- rats ----------
function addRat(x, z, y) {
  if (colony.rats.length >= C().max) return null;
  const r = { x: x + rand(-0.3, 0.3), z: z + rand(-0.3, 0.3), y: y ?? floorY(x, z), vy: 0, kx: 0, kz: 0, r: 0.2, h: 0.3, ang: rand(0, 6.28), mode: 'follow', tgt: null, t: 0, ph: rand(0, 6.28), sc: rand(0.6, 0.72), tint: rand(0.85, 1.1) };
  colony.rats.push(r);
  return r;
}
/** A surging rat gives up the place it had reserved on its target. */
const unbind = r => { if (r.mode === 'surge' && r.tgt) r.tgt.colBound = Math.max(0, (r.tgt.colBound || 1) - 1); r.tgt = null; };
function killRat(r, quiet) {
  const i = colony.rats.indexOf(r);
  if (i < 0) return;
  unbind(r);
  colony.rats.splice(i, 1);
  run.ratsLost = (run.ratsLost || 0) + 1;
  if (quiet) return;
  blood(r.x, r.y + 0.2, r.z, 0x8a0c0c, null, 3, 3);
  puff(r.x, r.y + 0.2, r.z, 0x8a8478, 3, 2);
  decal(r.x, floorY(r.x, r.z) + 0.011, r.z, rand(0.3, 0.5), 0x6a0a0a);
  sfx('squeak');
}
/** Breed n rats at a spot (a corpse, a meal): they scramble out of it and join the colony. */
function breedAt(n, x, y, z) {
  let made = 0;
  for (let i = 0; i < n; i++) if (addRat(x, z, y)) made++;
  if (!made) return 0;
  run.ratsBred = (run.ratsBred || 0) + made;
  puff(x, y + 0.3, z, 0x8a8478, 4 + made, 2.5);
  dnum(x, y + 1.4, z, `+${made} rat${made > 1 ? 's' : ''}`, 'heal');
  sfx('squeak');
  return made;
}
/** Formation slot i: a sunflower spiral around a point just behind the king. */
function slot(i, n) {
  const back = 0.8 + 0.12 * Math.sqrt(n), cx = P.x - Math.sin(P.facing || 0) * back, cz = P.z - Math.cos(P.facing || 0) * back;
  const rr = C().ring * Math.sqrt(i + 1), a = i * 2.39996;
  return [cx + Math.sin(a) * rr, cz + Math.cos(a) * rr];
}

// ---------- run and level ----------
/** Run start or a new level: the colony comes along, gathered around the king. */
export function colonyPlace() {
  if (!colony.on) { colony.rats.length = 0; return; }
  if (run.colonyN == null) { colony.breed = 0; colony.hunger = 0; colony.baitCd = 0; } // a new run
  const n = run.colonyN ?? C().start;
  colony.rats.length = 0;
  colony.engaged.clear();
  colony.surgeAt = null;
  for (let i = 0; i < n; i++) { const [x, z] = slot(i, n); addRat(x, z, P.y); }
  run.colonyN = colony.rats.length;
  run.colonyPeak = Math.max(run.colonyPeak || 0, run.colonyN);
  ensureHud();
}

// ---------- input (called from player.js) ----------
/** Replaces the primary attack: while attack is held, the colony surges at the aim point. */
export function colonyAim() {
  const T = C(), ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), az = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  let x = null, z = null;
  if (ax || az) {
    // Right stick or arrow keys: a point ahead in that direction, pulled onto the nearest enemy there.
    const { fx, fz, rx, rz } = camBasis(), dx = fx * az + rx * ax, dz = fz * az + rz * ax, l = Math.hypot(dx, dz) || 1;
    x = P.x + dx / l * 7; z = P.z + dz / l * 7;
    let b = null, bd = 5 * 5;
    for (const e of W.enemies) { if (e.dead || e.hidden || e.disguise) continue; const dd = d2(e, x, z); if (dd < bd) { bd = dd; b = e; } }
    if (b) { x = b.x; z = b.z; }
  } else if (G.attack) {
    const m = G.aimAt || mouseAim();
    if (m) { x = m.x; z = m.z; } else { x = P.x + Math.sin(P.facing || 0) * 7; z = P.z + Math.cos(P.facing || 0) * 7; }
  }
  if (x == null) { colony.surgeAt = null; return; }
  const dx = x - P.x, dz = z - P.z, l = Math.hypot(dx, dz);
  if (l > T.surgeRange) { x = P.x + dx / l * T.surgeRange; z = P.z + dz / l * T.surgeRange; }
  colony.surgeAt = { x, z };
  P.facing = Math.atan2(dx, dz);
}
/** Q: throw a few rats as bait. Enemies near where they land chase them instead of you. */
export function colonyBait() {
  const T = C();
  if (colony.baitCd > 0) return true;
  const free = colony.rats.filter(r => r.mode === 'follow');
  if (free.length < T.bait) { dnum(P.x, P.y + 1.6, P.z, `Need ${T.bait} rats`, 'info'); return true; }
  const m = colony.surgeAt || G.aimAt || mouseAim();
  let x = m ? m.x : P.x + Math.sin(P.facing || 0) * 8, z = m ? m.z : P.z + Math.cos(P.facing || 0) * 8;
  const dx = x - P.x, dz = z - P.z, l = Math.hypot(dx, dz);
  if (l > T.surgeRange) { x = P.x + dx / l * T.surgeRange; z = P.z + dz / l * T.surgeRange; }
  free.sort((a, b) => d2(a, P.x, P.z) - d2(b, P.x, P.z));
  for (const r of free.slice(0, T.bait)) Object.assign(r, { mode: 'bait', t: 0, fly: 0.45, sx: r.x, sz: r.z, sy: r.y, bx: x + rand(-0.8, 0.8), bz: z + rand(-0.8, 0.8), tgt: null });
  // Enemies near where it lands, and the ones already on you, go for the bait.
  for (const e of W.enemies) if (!e.dead && !e.boss && e.type !== 'nest' && (d2(e, x, z) < T.baitR * T.baitR || d2(e, P.x, P.z) < T.baitPull * T.baitPull)) { e.lureT = T.baitT; e.lureX = x; e.lureZ = z; }
  colony.baitCd = T.baitCd;
  run.baits = (run.baits || 0) + 1;
  sfx('squeak');
  return true;
}
/** E near a gnaw point: rats run to it and chew it through (and are spent). True if it handled E. */
export function colonySpend() {
  const T = C();
  let t = null, bd = T.gnawR * T.gnawR;
  for (const q of W.traps) { if (q.sprung || q.colony) continue; const dd = (q.gx - P.x) ** 2 + (q.gz - P.z) ** 2; if (dd < bd && Math.abs(P.y - q.gy) < 2) { bd = dd; t = q; } }
  if (!t) return false;
  const free = colony.rats.filter(r => r.mode === 'follow');
  if (free.length < T.gnaw) { dnum(P.x, P.y + 1.6, P.z, `Need ${T.gnaw} rats to chew that`, 'info'); return true; }
  free.sort((a, b) => d2(a, t.gx, t.gz) - d2(b, t.gx, t.gz));
  t.colony = true;
  for (const r of free.slice(0, T.gnaw)) Object.assign(r, { mode: 'gnaw', trap: t, t: 0 });
  dnum(t.gx, t.gy + 1.6, t.gz, `${T.gnaw} rats: ${t.label || 'gnaw it'}`, 'info');
  return true;
}

// ---------- combat hooks (called from combat.js and food.js) ----------
/** A hit on the king: rats near him take it instead. True if they did. */
export function colonyShield(d, from) {
  if (!colony.on || !colony.rats.length) return false;
  const T = C(), R2 = T.shieldR * T.shieldR, sx = from ? from.x : P.x, sz = from ? from.z : P.z;
  const near = colony.rats.filter(r => (r.mode === 'follow' || r.mode === 'surge') && d2(r, P.x, P.z) < R2);
  if (!near.length) return false;
  near.sort((a, b) => d2(a, sx, sz) - d2(b, sx, sz));
  const k = Math.min(near.length, Math.max(1, Math.ceil(d / T.ratHp)));
  for (let i = 0; i < k; i++) killRat(near[i]);
  P.inv = Math.max(P.inv, T.shieldInv);
  G.shake = Math.max(G.shake, 0.12);
  dnum(P.x, P.y + 1.7, P.z, `-${k} rat${k > 1 ? 's' : ''}`, 'crit');
  return true;
}
/** An enemy died: its rats come off it, and the colony eats and breeds. */
export function colonyKill(e) {
  if (!colony.on) return;
  colony.breed += (e.xp || 1) * C().breed * (e.type === 'nest' ? 3 : 1);
  const n = Math.floor(colony.breed);
  colony.breed -= n;
  if (n) breedAt(n, e.x, e.y || 0, e.z);
  if (e.colN) G.hitStop = Math.max(G.hitStop, 0.04);
}
/** Food eaten (after the king's heal): the colony feeds too. */
export function colonyFeed(h, x, y, z) {
  if (!colony.on) return;
  colony.breed += h * C().feed;
  const n = Math.floor(colony.breed);
  colony.breed -= n;
  if (n) breedAt(n, x, y, z);
}

// ---------- the colony each frame (update.js, after the enemies move) ----------
const canLatch = e => !e.dead && !e.hidden && !e.disguise && !e.reaper && (!e.fly || e.y - floorY(e.x, e.z) < 1.2);
const capOf = e => (e.type === 'nest' ? 10 : Math.round(C().latchPer * Math.max(1, (e.r || 0.45) / 0.45) * (e.boss ? 3 : 1)));
function move(r, tx, tz, sp, dt) {
  const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz), s = Math.min(sp, d * 5);
  let vx = d > 0.05 ? dx / d * s : 0, vz = d > 0.05 ? dz / d * s : 0;
  vx += Math.sin(G.time * 7 + r.ph) * 0.5; vz += Math.cos(G.time * 6 + r.ph * 1.3) * 0.5; // scurry
  r.x += vx * dt; r.z += vz * dt;
  const py = r.y;
  r.vy -= GRAV * dt;
  r.y += r.vy * dt;
  collideBody(r, py, r.r, r.h, false);
  if (s > 0.4) r.ang += angD(Math.atan2(vx, vz), r.ang) * Math.min(1, dt * 14);
}
export function colonyTick(dt) {
  if (!colony.on) return;
  const T = C(), rats = colony.rats;
  colony.baitCd -= dt;
  // Who is engulfed, by how many.
  for (const e of colony.engaged) e.colN = 0;
  colony.engaged.clear();
  for (const r of rats) if (r.mode === 'latch') { if (r.tgt.dead) { r.mode = 'follow'; r.tgt = null; } else { r.tgt.colN = (r.tgt.colN || 0) + 1; colony.engaged.add(r.tgt); } }
  // Surge: rats at home pour toward the aim point; each picks an enemy there with room on it.
  const at = colony.surgeAt;
  let cands = null;
  if (at) {
    cands = W.enemies.filter(e => canLatch(e) && d2(e, at.x, at.z) < T.surgeR * T.surgeR).sort((a, b) => d2(a, at.x, at.z) - d2(b, at.x, at.z));
    for (const e of cands) e.colRoom = capOf(e) - (e.colN || 0) - (e.colBound || 0);
  }
  let i = 0;
  for (const r of rats.slice()) {
    const idx = i++;
    if (r.mode === 'follow' && at) { r.mode = 'surge'; r.t = -(idx % 30) * 0.012; r.tgt = null; }
    if (r.mode === 'surge' && !at) { unbind(r); r.mode = 'follow'; }
    if (r.y < -3) { killRat(r, true); continue; } // into a pit
    switch (r.mode) {
      case 'follow': {
        const [x, z] = slot(idx, rats.length);
        const far = Math.hypot(r.x - P.x, r.z - P.z);
        if (far > T.catchup || (P.y - r.y > 1.2 && far < 4 && (r.t += dt) > 0.6)) { const [sx, sz] = slot(idx, rats.length); r.x = sx; r.z = sz; r.y = P.y; r.vy = 0; r.t = 0; puff(r.x, r.y + 0.2, r.z, 0x8a8478, 2, 1.5); break; }
        move(r, x, z, Math.max(T.spd, Math.hypot(P.vx || 0, P.vz || 0) + 2), dt);
        break;
      }
      case 'surge': {
        r.t += dt;
        if (r.t < 0) { move(r, ...slot(idx, rats.length), T.spd, dt); break; }
        if (r.tgt && (r.tgt.dead || !canLatch(r.tgt))) unbind(r);
        if (!r.tgt && cands) { const e = cands.find(c => c.colRoom > 0); if (e) { r.tgt = e; e.colRoom--; e.colBound = (e.colBound || 0) + 1; } }
        if (r.tgt) {
          const e = r.tgt;
          move(r, e.x, e.z, T.spd * 1.15, dt);
          if (Math.hypot(r.x - e.x, r.z - e.z) < (e.r || 0.45) + 0.45) {
            e.colBound = Math.max(0, (e.colBound || 1) - 1);
            Object.assign(r, { mode: 'latch', la: Math.atan2(r.x - e.x, r.z - e.z) + rand(-0.5, 0.5), lh: rand(0.15, 0.85), t: 0 });
            sfx('squeak');
          }
        } else {
          // Nothing to bite there: mill around the aim point.
          const a = r.ph + G.time * 1.5, rr = 0.6 + (r.ph % 1.5);
          move(r, at.x + Math.sin(a) * rr, at.z + Math.cos(a) * rr, T.spd * 1.15, dt);
        }
        break;
      }
      case 'latch': {
        const e = r.tgt, R = (e.r || 0.45) * 0.85, a = r.la + Math.sin(G.time * 3 + r.ph) * 0.15;
        r.x = e.x + Math.sin(a) * R; r.z = e.z + Math.cos(a) * R;
        r.y = (e.y || 0) + r.lh * (e.h || 1);
        r.ang = Math.atan2(e.x - r.x, e.z - r.z);
        break;
      }
      case 'bait': {
        r.t += dt;
        if (r.fly > 0) {
          // In the air: a short lob to where the bait lands.
          const u = Math.min(1, r.t / r.fly);
          r.x = r.sx + (r.bx - r.sx) * u; r.z = r.sz + (r.bz - r.sz) * u;
          r.y = r.sy + (floorY(r.bx, r.bz) - r.sy) * u + Math.sin(u * Math.PI) * 2.2;
          if (u >= 1) { r.fly = 0; r.vy = 0; puff(r.x, r.y + 0.1, r.z, 0x9a8a7a, 3, 1.5); }
          break;
        }
        move(r, r.bx + Math.sin(G.time * 5 + r.ph) * 1.2, r.bz + Math.cos(G.time * 4 + r.ph) * 1.2, T.spd * 0.7, dt);
        // A lured enemy that reaches the bait eats it.
        let eaten = false;
        for (const e of W.enemies) if (!e.dead && e.lureT > 0 && Math.hypot(e.x - r.x, e.z - r.z) < (e.r || 0.45) + 0.4) { killRat(r); eaten = true; break; }
        if (!eaten && r.t > T.baitT) { r.mode = 'follow'; r.t = 0; }
        break;
      }
      case 'gnaw': {
        const q = r.trap;
        r.t += dt;
        move(r, q.gx + Math.sin(r.ph) * 0.4, q.gz + Math.cos(r.ph) * 0.4, T.spd * 1.2, dt);
        if (!q.sprung && (Math.hypot(r.x - q.gx, r.z - q.gz) < 0.8 || r.t > 2.5)) { springTrap(q); run.gnawed = (run.gnawed || 0) + 1; spark(q.gx, q.gy + 0.5, q.gz, 1.2); sfx('chew'); }
        if (q.sprung && (r.t > 0.4 || Math.hypot(r.x - q.gx, r.z - q.gz) < 1)) killRat(r, true);
        break;
      }
    }
  }
  // Engulfed enemies: pinned if outnumbered, bitten in ticks, and they shake rats off.
  for (const e of colony.engaged) {
    const n = e.colN || 0;
    if (!n || e.dead) continue;
    e.slow = Math.max(e.slow || 0, 0.2);
    if (!e.boss && e.type !== 'nest' && n >= T.pinPer * (e.mass || 1)) {
      if (e.pinX == null) { e.pinX = e.x; e.pinZ = e.z; }
      e.x = e.pinX; e.z = e.pinZ;
    } else e.pinX = null;
    e.colAcc = (e.colAcc || 0) + n * T.biteDps * dt;
    e.colT = (e.colT || 0) - dt;
    if (e.colT <= 0) {
      e.colT = T.biteTick;
      const dmg = e.colAcc;
      e.colAcc = 0;
      if (dmg > 0) { hit(e, dmg, Math.atan2(e.x - P.x, e.z - P.z), 0, 'colony', true); sfx('squeak'); }
    }
    if (e.dead || !e.dmg) continue;
    e.colShake = (e.colShake ?? T.shakeT) - dt * (run.atkM || 1);
    if (e.colShake <= 0) {
      e.colShake = T.shakeT * (e.boss ? 0.6 : 1);
      let k = Math.min(n, Math.max(1, Math.ceil(e.dmg / T.ratHp)));
      e.lunge = 0.2;
      for (const r of rats.slice()) { if (k <= 0) break; if (r.mode === 'latch' && r.tgt === e) { killRat(r); k--; } }
    }
  }
  for (const e of W.enemies) if (e.pinX != null && !colony.engaged.has(e)) e.pinX = null;
  // Upkeep: a big colony is a hungry one. Rats past the first few wander off unless you keep killing and eating.
  colony.hunger = (colony.hunger || 0) + Math.max(0, rats.length - T.upkeepFree) * T.upkeep * dt;
  while (colony.hunger >= 1 && rats.length > T.upkeepFree) {
    colony.hunger -= 1;
    const r = rats.find(q => q.mode === 'follow') || rats[rats.length - 1];
    puff(r.x, r.y + 0.2, r.z, 0x8a8478, 2, 1.2);
    killRat(r, true);
    run.ratsStarved = (run.ratsStarved || 0) + 1;
  }
  run.colonyN = rats.length;
  run.colonyPeak = Math.max(run.colonyPeak || 0, rats.length);
  if (!rats.length && !run.colonyEmptyT) run.colonyEmptyT = run.time;
  if (rats.length) run.colonyEmptyT = 0;
  updateHud();
}

// ---------- drawing (sync.js) ----------
export function syncColony(dt) {
  if (!colony.on) { swarmIM.count = swarmGlowIM.count = swarmIMO.count = 0; return; }
  const rats = colony.rats, n = Math.min(rats.length, SWARM_CAP);
  for (let i = 0; i < n; i++) {
    const r = rats[i];
    animTick(r, dt, 'ratling', P.x, P.z);
    if (r.mode === 'latch') { r.ap = 0.5 + 0.5 * Math.sin(G.time * 22 + r.ph); r.gam = 0.6; }
    writePose(r, swarmIM.userData.rA, swarmIM.userData.rB, i);
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(r.mode === 'latch' ? -0.7 : 0, r.ang, 0);
    dummy.scale.setScalar(r.sc);
    dummy.updateMatrix();
    swarmIM.setMatrixAt(i, dummy.matrix);
    swarmGlowIM.setMatrixAt(i, dummy.matrix);
    swarmIM.setColorAt(i, tmpC.setScalar(r.tint));
  }
  swarmIM.count = swarmGlowIM.count = swarmIMO.count = n;
  swarmIM.instanceMatrix.needsUpdate = true;
  swarmGlowIM.instanceMatrix.needsUpdate = true;
  if (swarmIM.instanceColor) swarmIM.instanceColor.needsUpdate = true;
  swarmIM.userData.rA.needsUpdate = true;
  swarmIM.userData.rB.needsUpdate = true;
}

// ---------- HUD: the colony count, the number that matters ----------
function ensureHud() {
  if (typeof document === 'undefined') return;
  const hint = document.getElementById('hint');
  if (hint && !hint.dataset.swarm) { hint.dataset.swarm = 1; hint.innerHTML = 'WASD move · MOUSE aim · HOLD CLICK / J surge the colony<br>Q bait (3 rats) · E near a gnaw point: chew it (6 rats)<br>SHIFT dodge · SPACE jump · Z rot vial · X turbo<br>M map · ESC pause'; }
  if (colony.hud) return;
  const d = document.createElement('div');
  d.id = 'colonyHud';
  d.innerHTML = '<b>0</b><span class="px">rats</span>';
  document.body.appendChild(d);
  colony.hud = d;
  colony.shown = -1;
}
function updateHud() {
  if (!colony.hud || colony.shown === colony.rats.length) return;
  const up = colony.rats.length > colony.shown;
  colony.shown = colony.rats.length;
  const b = colony.hud.firstElementChild;
  b.textContent = colony.shown;
  colony.hud.classList.remove('up', 'down');
  void colony.hud.offsetWidth;
  colony.hud.classList.add(up ? 'up' : 'down');
}
