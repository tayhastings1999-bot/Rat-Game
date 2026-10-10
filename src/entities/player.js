// Player movement (run, dodge, climb, squeeze), manual aim and attack with the
// class primary, specials, lock-on and every E-key interaction.
import * as THREE from 'three';
import { angD, $ } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { puff, spark, boom, fx, bolt, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { bury, camera } from '../render/renderer.js';
import { M, G as GRAV, DUCT_TOP, gi, toG, toW, tAt, tileAt, topAt, floorY, solidFor, collideBody } from '../world/grid.js';
import { tileMesh, syncObj, addObj } from '../world/build.js';
import { curD, isSewer } from '../data/world.js';
import { CLASSES } from '../data/classes.js';
import { PRIM, SPECIALS } from '../combat/arsenal.js';
import { nearest, near, aoe, hit, hurtP, scrapDrop } from '../combat/combat.js';
import { giveChest, rummage } from '../game/loot.js';
import { enterSewer } from '../game/flow.js';
import { buffOn } from '../game/forage.js';
import { springTrap, trapTarget, wireIntoWater } from '../game/traps.js';
import { cageTarget, openCage, carryingWheel } from '../game/objectives.js';
import { banner } from '../ui/hud.js';
import { TUNE } from '../tuning.js';
import { diveLand } from '../game/signature.js';
import { boltTarget } from '../world/setpieces.js';
import { tryTurboMove } from '../game/turbo.js';

export const keys = {};
/** On-screen joystick (touch). x = right, y = forward, each -1..1. */
export const stick = { active: false, x: 0, y: 0 };
export const camBasis = () => ({ fx: Math.sin(G.camYaw), fz: Math.cos(G.camYaw), rx: -Math.cos(G.camYaw), rz: Math.sin(G.camYaw) });

/** Movement input from keys or the touch stick: [right, forward, magnitude]. */
function moveInput() {
  if (stick.active && Math.hypot(stick.x, stick.y) > 0.18) return [stick.x, stick.y, Math.min(1, Math.hypot(stick.x, stick.y) * 1.25)];
  return [(keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), 1];
}

export function stepPlayer(dt) {
  const { fx: f1, fz, rx, rz } = camBasis(), [ix, iz, mag] = moveInput();
  let wx = f1 * iz + rx * ix, wz = fz * iz + rz * ix;
  const L = Math.hypot(wx, wz);
  if (L) { wx /= L; wz /= L; P.wx = wx; P.wz = wz; }
  const t = tileAt(P.x, P.z), wet = ((t === 2 || t === 4) && P.y < -0.4) || P.y < G.tideY - 0.2;
  P.squeeze = !!(keys.KeyC || keys.ControlLeft) && P.onGround && !P.carry;
  if (t === 5 && P.y < topAt(toG(P.x), toG(P.z)) - 0.1) P.squeeze = true;
  if (t === 11 && P.y < DUCT_TOP) P.squeeze = true;
  // Walking into a crevice squeezes you in automatically (no extra button needed).
  if (L && P.onGround && !P.carry) { const ax = P.x + wx * 0.7, az = P.z + wz * 0.7, ta = tileAt(ax, az); if ((ta === 5 && P.y < topAt(toG(ax), toG(az)) - 0.1) || (ta === 11 && P.y < DUCT_TOP)) P.squeeze = true; }
  const spd = mag * st.speed * (1 + 0.03 * (run.blood || 0)) * (buffOn('puffcap') ? 1.35 : 1) * (wet ? 0.62 : 1) * (P.squeeze ? 0.55 * st.squeezeMul : 1) * (P.carry ? 1 - P.carry.mass : 1) * (P.gmul > 1.2 ? 0.85 : 1) * (P.slowT > 0 ? 0.6 : 1) * (carryingWheel() ? 0.78 : 1);
  P.rollCd -= dt;
  if (P.roll > 0) {
    P.roll -= dt;
    const rs = st.speed * TUNE.player.rollSpeed;
    P.vx = P.rdx * rs;
    P.vz = P.rdz * rs;
  } else if (P.lock > 0) P.lock -= dt;
  else {
    const ice = curD().ice && P.onGround, a = 1 - Math.exp(-(P.onGround ? (ice ? 3.2 : 16) : 7) * dt);
    P.vx += (wx * spd - P.vx) * a;
    P.vz += (wz * spd - P.vz) * a;
  }
  // Always face the way you move (fixes the old "A doesn't turn" bug); aim only when standing still.
  const face = P.roll > 0 ? Math.atan2(P.rdx, P.rdz) : L ? Math.atan2(wx, wz) : P.aimT > 0 ? P.aim : null;
  if (face != null) P.facing += angD(face, P.facing) * (1 - Math.exp(-16 * dt));
  P.buffer -= dt;
  P.coyote -= dt;
  P.wallT -= dt;
  const canClimb = P.wallT > 0 && P.wallType !== 6 && !P.carry && P.y < P.wallTop + 0.3;
  P.climbing = false;
  // Hold Space against a climbable wall to scale it — from the air, the ground, or a ledge.
  if (keys.Space && canClimb && (!P.onGround || P.wallTop > P.y + 0.5)) {
    P.vy = Math.max(P.vy, 6.5);
    P.climbing = true;
    P.jumping = false;
  }
  if (P.buffer > 0 && !P.squeeze) {
    const j = v => { P.vy = v; P.onGround = false; P.coyote = 0; P.buffer = 0; P.cut = false; P.jumping = true; };
    if (P.onGround || P.coyote > 0) { j(12.5 * (P.gmul < 0.6 ? 1.05 : 1)); puff(P.x, P.y, P.z, 0x9a8a7a, 4, 1.5); }
    else if (P.air > 0 && !canClimb) { P.air--; j(11.5); spark(P.x, P.y + 0.2, P.z, 1.2, 0xc080ff); }
  }
  if (!keys.Space && P.vy > 0 && !P.cut && P.jumping) { P.vy *= 0.5; P.cut = true; }
  if (!P.climbing) P.vy -= GRAV * P.gmul * dt;
  P.vy = Math.max(P.vy, -30);
  const py = P.y;
  P.fallV = -P.vy;
  P.x += P.vx * dt;
  P.y += P.vy * dt;
  P.z += P.vz * dt;
  const g = collideBody(P, py, P.squeeze ? 0.2 : 0.3, P.squeeze ? 0.45 : 0.9, true), was = P.onGround;
  P.onGround = !!g;
  if (P.hw && L) { P.wallT = 0.12; P.wallType = P.wt; P.wallTop = P.wtop; P.wallNX = P.wnx; P.wallNZ = P.wnz; }
  if (g) {
    P.coyote = 0.1;
    P.air = st.jumps;
    P.jumping = false;
    if (!was) {
      puff(P.x, P.y, P.z, 0x9a8a7a, P.fallV > 12 ? 10 : 4, 1.6);
      if (P.slam === 'dive') { P.slam = false; P.lock = 0; diveLand(); } else if (P.slam) {
        P.slam = false;
        P.lock = 0;
        const R = 4.2 * st.area;
        aoe(P.x, P.y, P.z, R, 60, 12, 'special', 0, true);
        boom(P.x, P.y + 0.5, P.z, R * 1.6, 0xff9a5a);
        fx('ring', P.x, P.y, P.z, R, 0xff6a3a, 0.45);
        G.shake = 0.6;
        puff(P.x, P.y + 0.2, P.z, 0x9a8a7a, 20, 5);
      }
    }
  }
  // Sewer water is toxic.
  if (isSewer() && wet && t === 2) P.poisonT = Math.max(P.poisonT, 1.2);
}

// ---------- aim and attack ----------
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hitP = new THREE.Vector3();
/** Where the mouse points on the ground plane at the rat's height (null on touch or before the mouse moves). */
export function mouseAim() {
  if (G.touch || G.mY == null) return null;
  _ndc.set(G.mX / innerWidth * 2 - 1, -(G.mY / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  _plane.constant = -(P.y + 0.4);
  return _ray.ray.intersectPlane(_plane, _hitP) ? _hitP : null;
}
/** Touch: the nearest enemy inside a forward cone (TUNE.aim). */
function coneTarget() {
  const A = TUNE.aim;
  let b = null, bd = A.touchRange * A.touchRange;
  for (const e of W.enemies) {
    if (e.dead || e.hidden || e.disguise) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = dx * dx + dz * dz;
    if (d < bd && Math.abs(angD(Math.atan2(dx, dz), P.facing)) < A.touchCone) { bd = d; b = e; }
  }
  return b;
}
/** Attack held (mouse button, J, or the touch button), or the arrow keys: fire the primary where you aim. */
export function primary(dt) {
  run.primT -= dt;
  if (run.primT > 0 || (P.squeeze && !P.inDuct) || P.chewing) return;
  const PR = PRIM[CLASSES[run.cls].prim];
  const ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), az = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  let dx, dz, t = null;
  const lk = G.lockOn && !G.lockOn.dead ? G.lockOn : null;
  if (ax || az) {
    const { fx: a, fz: b, rx, rz } = camBasis();
    dx = a * az + rx * ax;
    dz = b * az + rz * ax;
  } else if (G.attack) {
    const m = G.aimAt || mouseAim(); // G.aimAt: the QA bot's aim point
    if (lk) { dx = lk.x - P.x; dz = lk.z - P.z; t = lk; }
    else if (m) {
      dx = m.x - P.x; dz = m.z - P.z;
      // Light assist: the enemy nearest the aim point, if one is close to it.
      let bd = 2.2 * 2.2;
      for (const e of W.enemies) { if (e.dead || e.hidden) continue; const d = (e.x - m.x) ** 2 + (e.z - m.z) ** 2; if (d < bd) { bd = d; t = e; } }
      if (t) t.aimD = Math.hypot(m.x - P.x, m.z - P.z);
    } else { t = coneTarget(); if (t) { dx = t.x - P.x; dz = t.z - P.z; } else { dx = Math.sin(P.facing); dz = Math.cos(P.facing); } }
  } else return;
  const L = Math.hypot(dx, dz) || 1;
  dx /= L; dz /= L;
  P.aimDist = Math.min(TUNE.aim.maxRange, L);
  PR.fire(dx, dz, t);
  run.primT = PR.cd * st.cd * st.tear;
  P.aim = Math.atan2(dx, dz);
  P.aimT = 0.35;
}

export function startRoll() {
  if (P.roll > 0 || P.rollCd > 0 || P.squeeze || P.chewing) return;
  if (P.carry) dropCarry();
  const { fx: fx0, fz, rx, rz } = camBasis(), [ix, iz] = moveInput();
  let dx, dz;
  if (ix || iz) { dx = fx0 * iz + rx * ix; dz = fz * iz + rz * ix; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
  else { dx = Math.sin(P.facing); dz = Math.cos(P.facing); }
  const T = TUNE.player;
  P.rdx = dx; P.rdz = dz; P.roll = T.rollTime; P.rollCd = T.rollCd;
  P.inv = Math.max(P.inv, T.rollIframes);
  P.facing = Math.atan2(dx, dz);
  puff(P.x, P.y + 0.1, P.z, 0x9a8a7a, 6, 2);
  sfx('roll');
}

export function toggleLock() {
  if (G.lockOn) { G.lockOn = null; return; }
  let b = null, bd = 28 * 28;
  for (const e of W.enemies) {
    if (e.dead || e.hidden) continue;
    const pri = e.boss ? 0 : e.pred ? 1 : e.type === 'nest' ? 2 : e.elite || e.bar ? 3 : 9;
    if (pri > 3) continue;
    const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2 + pri * 40;
    if (d < bd) { bd = d; b = e; }
  }
  if (!b) b = nearest(14);
  G.lockOn = b || null;
  if (!b) dnum(P.x, P.y + 1.6, P.z, 'Nothing to lock onto', 'info');
}

export function useSpecial() {
  if (P.squeeze) return;
  const S = SPECIALS[CLASSES[run.cls].special];
  if (tryTurboMove('special', () => S.use())) return; // X held: the turbo version, no cooldown
  if (run.specT > 0) return;
  S.use();
  run.specT = S.cd * st.specCd * st.cd;
}

// ---------- interaction ----------
export function useTarget() {
  for (const c of W.chests) {
    if (c.open || Math.hypot(c.x - P.x, c.z - P.z) >= 1.9 || Math.abs(c.y - P.y) >= 1.3) continue;
    return { kind: 'chest', o: c, label: 'Open chest' };
  }
  for (const p of W.pipes) if (Math.hypot(p.x - P.x, p.z - P.z) < 1.8 && P.y < 1.2) return { kind: 'pipe', o: p, label: 'Squeeze into pipe' };
  for (const b of W.bins) if (!b.done && Math.hypot(b.x - P.x, b.z - P.z) < b.r + 1 && P.y < 2) return { kind: 'bin', o: b, label: b.kind === 'dumpster' ? 'Rummage the dumpster' : b.kind === 'bin' ? 'Rummage the trash can' : 'Dig through the junk heap' };
  for (const s of W.uses) if (!s.done && Math.hypot(s.x - P.x, s.z - P.z) < s.r && Math.abs((s.y || 0) - P.y) < 1.6) return { kind: 'set', o: s, label: s.label };
  const bt = boltTarget();
  if (bt) return { kind: 'bolt', o: bt, label: 'Unbolt the back door (a shortcut out)' };
  const mh = G.manhole;
  if (mh && Math.hypot(mh.x - P.x, mh.z - P.z) < 2 && P.y < 0.6) return { kind: 'manhole', o: mh, label: run.keys ? 'Unlock the manhole — descend into the sewer' : 'Manhole (locked — find a sewer key)' };
  return null;
}
export function grabTarget() {
  let b = null, bd = 1.2;
  for (const o of W.objs) {
    if (o.carried) continue;
    const d = Math.hypot(o.x - P.x, o.z - P.z) - Math.max(o.w, o.d) / 2;
    if (d < bd && Math.abs((o.y - o.th) - P.y) < 1.3) { bd = d; b = o; }
  }
  return b;
}
/** The nearest thing you could gnaw right now (the wall you're facing counts as close; objective cages win ties). */
export function chewTarget() {
  const f = P.facing, c = [];
  for (const dd of [0.9, 1.6]) {
    const x = P.x + Math.sin(f) * dd, z = P.z + Math.cos(f) * dd, gx = toG(x), gz = toG(z);
    if (tAt(gx, gz) === 3 && M.secret[gi(gx, gz)] !== 2 && P.y < topAt(gx, gz) - 0.5) { c.push({ d: dd, o: { kind: 'tile', gx, gz, time: 1.2, label: M.secret[gi(gx, gz)] ? 'This wall sounds hollow: gnaw through' : M.kind === 'city' ? 'Gnaw through the boards' : 'Gnaw through drywall' } }); break; }
  }
  for (const it of W.inter) {
    if (it.kind === 'rope' && it.used) continue;
    if (it.kind === 'wire' && it.cd > 0) continue;
    const d = Math.hypot(it.x - P.x, it.z - P.z);
    if (d < 1.9 && P.y < 2) c.push({ d, o: { kind: it.kind, it, time: it.kind === 'wire' ? 0.6 : 0.8, label: it.kind === 'wire' ? 'Gnaw live wires (it bites back)' : 'Gnaw the rope — drop the can' } });
  }
  const t = trapTarget();
  if (t) c.push({ d: Math.hypot(t.gx - P.x, t.gz - P.z), o: { kind: 'trap', t, time: t.time, label: t.label } });
  const cg = cageTarget();
  if (cg) c.push({ d: Math.hypot(cg.x - P.x, cg.z - P.z) * 0.5, o: { kind: 'cage', cg, time: 1.1, label: 'Gnaw the cage open' } });
  if (!c.length) return null;
  c.sort((a, b) => a.d - b.d);
  return c[0].o;
}
export function pressE() {
  if (P.carry) { dropCarry(); return; }
  const u = useTarget();
  // When something to use and something to gnaw are both in reach, E goes to whichever is closer
  // (the wall you're facing counts as very close). The manhole always wins.
  const c0 = u && u.kind !== 'manhole' && chewTarget();
  const cd = c0 ? (c0.kind === 'tile' ? 0.8 : Math.hypot((c0.t ? c0.t.gx : c0.cg ? c0.cg.x : c0.it.x) - P.x, (c0.t ? c0.t.gz : c0.cg ? c0.cg.z : c0.it.z) - P.z)) : 1e9;
  const gnawFirst = c0 && cd < Math.hypot(u.o.x - P.x, u.o.z - P.z) - (u.o.cr ?? u.o.r ?? 0.6);
  if (u && !gnawFirst) { doUse(u); return; }
  // Grab or gnaw: whichever is closer (a cage or board you're facing beats a crate beside you).
  const o = grabTarget(), c = chewTarget();
  const od = o ? Math.hypot(o.x - P.x, o.z - P.z) - Math.max(o.w, o.d) / 2 : 1e9;
  const chd = c ? (c.kind === 'tile' ? 0.4 : Math.hypot((c.t ? c.t.gx : c.cg ? c.cg.x : c.it.x) - P.x, (c.t ? c.t.gz : c.cg ? c.cg.z : c.it.z) - P.z) * 0.5) : 1e9;
  if (o && od <= chd) { P.carry = o; o.carried = true; P.chewing = false; return; }
  if (c) { P.chewing = true; P.chewT = 0; }
}
export function dropCarry() {
  const o = P.carry;
  P.carry = null;
  o.carried = false;
  const f = P.facing;
  if (o.kind === 'swab') { const ax = Math.abs(Math.sin(f)) > Math.abs(Math.cos(f)); o.w = ax ? 4.6 : 0.5; o.d = ax ? 0.5 : 4.6; }
  const half = o.kind === 'swab' ? 2.4 : Math.max(o.w, o.d) / 2;
  let placed = false;
  for (let s = 0.5 + half; s >= 0; s -= 0.25) {
    const x = P.x + Math.sin(f) * s, z = P.z + Math.cos(f) * s;
    if (!objBlocked(o, x, z)) { o.x = x; o.z = z; placed = true; break; }
  }
  if (!placed) { o.x = P.x; o.z = P.z; }
  o.vy = 0;
  syncObj(o);
}
export function objBlocked(o, x, z) {
  for (const [sx, sz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = x + sx * (o.w / 2 - 0.1), pz = z + sz * (o.d / 2 - 0.1), gx = toG(px), gz = toG(pz);
    if (solidFor(tAt(gx, gz), false) && o.y - o.th < topAt(gx, gz) - 0.1) return true;
  }
  return false;
}

export function doUse(u) {
  if (u.kind === 'set') { u.o.act(); return; }
  if (u.kind === 'bolt') { openTile(u.o.gx, u.o.gz); sfx('door'); return; }
  if (u.kind === 'chest') {
    const c = u.o;
    c.open = true;
    c.lid.rotation.x = -1.9;
    boom(c.x, c.y + 0.8, c.z, 2.4, c.cursed ? 0xff3a3a : 0xffd070);
    giveChest(c);
    for (let i = 0; i < 4; i++) scrapDrop(c.x, c.y, c.z);
  }
  if (u.kind === 'bin') rummage(u.o);
  if (u.kind === 'pipe') {
    const p = u.o.link;
    if (!p) return;
    G.state = 'trans';
    $('fade').style.opacity = 1;
    setTimeout(() => {
      P.x = p.ex; P.z = p.ez; P.y = floorY(p.ex, p.ez, true);
      P.vx = P.vz = P.vy = 0;
      G.camPos.set(P.x, P.y + 10, P.z + 8);
      if (P.carry) dropCarry();
      $('fade').style.opacity = 0;
      G.state = 'play';
      G.last = performance.now();
      dnum(P.x, P.y + 1.6, P.z, 'Squeezed through', 'info');
      for (const e of W.enemies) if (e.pred && e.mode === 'hunt') { e.mode = 'patrol'; e.hurt = false; }
    }, 240);
  }
  if (u.kind === 'manhole') {
    if (!run.keys) { dnum(P.x, P.y + 1.6, P.z, 'Locked. Elites and bosses drop sewer keys', 'info'); return; }
    run.keys--;
    enterSewer();
  }
}

/** Remove a gnawable tile (boards, drywall, a cracked secret wall) and open the way. */
export function openTile(gx, gz) {
  const k = gi(gx, gz), secret = M.secret[k];
  M.grid[k] = 1;
  M.hgt[k] = 0;
  M.secret[k] = 0;
  if (secret === 1) { banner('Secret passage', 'Something was hidden back here'); sfx('key'); }
  const m = tileMesh[k];
  if (m) { bury(m); delete tileMesh[k]; }
  const x = toW(gx), z = toW(gz);
  puff(x, 1.5, z, 0xc8b894, 24, 4);
  boom(x, 1.2, z, 3, 0xe8d8b0);
  scrapDrop(x, 0, z);
  scrapDrop(x, 0, z);
  G.flowT = 0;
  dnum(x, 2, z, 'Shortcut', 'info');
  G.shake = Math.max(G.shake, 0.2);
}

export function doChew(c) {
  if (c.kind === 'tile') openTile(c.gx, c.gz);
  if (c.kind === 'trap') springTrap(c.t);
  if (c.kind === 'cage') openCage(c.cg);
  if (c.kind === 'rope') {
    const it = c.it;
    it.used = true;
    bury(it.post);
    it.rope.visible = false;
    it.falling = true;
    it.vy = 0;
    puff(it.x, 1.5, it.z, 0x7a5a3a, 10, 3);
  }
  if (c.kind === 'wire') {
    const it = c.it;
    it.cd = 15;
    it.sp.visible = false;
    const ts = W.enemies.filter(e => !e.dead && Math.hypot(e.x - it.x, e.z - it.z) < 8).slice(0, 10);
    for (const e of ts) { bolt([[it.wx, 1.8, it.wz], [e.x, e.y + e.h * 0.6, e.z]]); hit(e, 90, null, 0, 'trap'); }
    boom(it.wx, 1.8, it.wz, 3, 0x9ad0ff);
    wireIntoWater(it.x, it.z);
    hurtP(6, null, true);
    G.shake = 0.3;
  }
}

/** Rope-dropped paint cans: fall, crush what's below, become a grabbable can. */
export function tickInteractives(dt) {
  for (const it of W.inter) {
    if (it.kind === 'wire') {
      if (it.cd > 0) { it.cd -= dt; if (it.cd <= 0) it.sp.visible = true; }
      else if (Math.random() < 0.05) spark(it.wx, 1.3, it.wz, 0.6, 0x9ad0ff);
    }
    if (it.kind === 'rope' && it.falling) {
      it.vy -= GRAV * dt;
      it.can.position.y += it.vy * dt;
      const gy = floorY(it.cx, it.cz);
      if (it.can.position.y <= gy + 0.5) {
        it.falling = false;
        bury(it.can);
        for (const e of near(it.cx, gy, it.cz, 3.2)) hit(e, 150, Math.atan2(e.x - it.cx, e.z - it.cz), 10, 'trap');
        if (Math.hypot(P.x - it.cx, P.z - it.cz) < 1.4) hurtP(15, { x: it.cx, z: it.cz });
        boom(it.cx, gy + 0.8, it.cz, 6, 0xffd0a0);
        fx('ring', it.cx, gy, it.cz, 3.2, 0xffd0a0, 0.4);
        G.shake = 0.7;
        puff(it.cx, gy + 0.4, it.cz, 0x9a8a7a, 20, 5);
        addObj('can', it.cx, it.cz);
      }
    }
  }
}
