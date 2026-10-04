// Hand-shaped places dropped into the random districts, so each one has
// landmarks and a mechanic of its own:
//   Interiors   enterable diners, workshops, apartments and laundromats, with a
//               cutaway view inside (ducts.js) and back doors bolted from within.
//   Tram line   the night tram runs a street every minute or so: get clear, and
//               lure the horde onto the rails. (Cinder Row, sometimes elsewhere)
//   Market      stalls you can rob for loot, but the alarm brings the horde.
//               (Neon Market, sometimes elsewhere)
//   Crane site  work the crane to drop a steel load on the thickest crowd.
//               (Rust Yards, sometimes elsewhere)
//   Gardens     vegetable beds to forage, watched by a guard dog that barks
//               the horde awake. (Hollow Heights, sometimes elsewhere)
//   Rain        some districts are rained on: scent fades faster, lights are
//               dimmer, so sneaking is easier.
//   Arenas      each boss wakes in a lair dressed for it, some with hazards.
//   Bridges     planks laid across alleys between rooftops.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr, ri, rng, shuffleR, PI2, TAU } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { world, scene, camera, bury } from '../render/renderer.js';
import { Bx, Cy, Co, Sp } from '../render/models.js';
import { stoneTex, metalTex, plywoodTex, furTex, roofTex } from '../render/textures.js';
import { M, T, gi, inG, tAt, toW, toG, floorY, DRY, N4, OPEN } from './grid.js';
import { curD } from '../data/world.js';
import { fx, puff, spark, boom, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { banner } from '../ui/hud.js';
import { mkMesh, glowSprite, staticBox, addChest, addCache } from './build.js';
import { hit, hurtP, dropFood, scrapDrop } from '../combat/combat.js';
import { spawnEnemy, addPred } from '../entities/mobs.js';
import { dropLoot } from '../game/progress.js';
import { puddle, warn } from '../combat/hazards.js';
import { clearMouths, nearMouth } from './ducts.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const basic = c => new THREE.MeshBasicMaterial({ color: c });

/** A flat neon sign with text, facing along (dx, dz). */
function sign(text, col, x, y, z, dx, dz, w = 3.2) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0a10'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(4, 4, 248, 56);
  g.fillStyle = col; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 12;
  g.fillText(text, 128, 34);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); // disposed with the district (build.js)
  m.position.set(x, y, z);
  m.rotation.y = Math.atan2(dx, dz);
  world.add(m);
  glowSprite(new THREE.Color(col).getHex(), w * 0.9, world, x + dx * 0.4, y, z + dz * 0.4, 0.35);
  return m;
}
/** A use-point for E (see player.js useTarget). */
/** Somewhere a new prop must not go: a crawlspace mouth, or on top of a chest, cache, nest, bench or bin already placed. */
function blocked(x, z, r = 2.2) {
  if (nearMouth(x, z)) return true;
  const hit = o => Math.hypot(o.x - x, o.z - z) < r;
  return W.chests.some(hit) || (W.caches || []).some(hit) || W.bins.some(hit) || W.enemies.some(e => e.type === 'nest' && hit(e));
}
const usePoint = (x, z, r, label, act, y = 0) => { const u = { x, z, y, r, cr: 0.3, label, act, done: false }; W.uses.push(u); return u; };

// ---------- interiors ----------
const INT = {
  diner: { name: 'DINER', col: '#ff7ab0', lamp: 0xffc890 },
  workshop: { name: 'GARAGE', col: '#7ad0ff', lamp: null },
  apartment: { name: 'ROOMS', col: '#ffd060', lamp: null },
  laundromat: { name: 'LAUNDRY', col: '#9affd0', lamp: 0xd8f0ff },
};
function buildInterior(I) {
  const x0 = toW(I.x) - T / 2, z0 = toW(I.y) - T / 2, wW = I.w * T, dD = I.h * T, cx = x0 + wW / 2, cz = z0 + dD / 2, R = I.roof;
  // Roof slab (walkable from above, cut away from below) and the lintel over the door.
  mkMesh(Bx(wW, 0.3, dD), lam(0xffffff, { map: roofTex }), cx, R - 0.15, cz);
  W.plats.push({ x: cx, z: cz, w: wW, d: dD, y: R, th: 0.3 });
  const [fx0, fz0, fdx, fdz] = I.door, dx = toW(fx0), dz = toW(fz0);
  const lh = R - 2.8;
  mkMesh(Bx(T, lh, T), lam(0x3a3238, { map: stoneTex }), dx, 2.8 + lh / 2, dz);
  W.plats.push({ x: dx, z: dz, w: T, d: T, y: R, th: lh });
  const D = INT[I.kind];
  sign(D.name, D.col, dx + fdx * (T / 2 + 0.06), 3.4, dz + fdz * (T / 2 + 0.06), fdx, fdz);
  if (D.lamp) {
    mkMesh(Bx(1.6, 0.12, 0.4), basic(D.lamp), cx, R - 0.5, cz);
    glowSprite(D.lamp, 6, world, cx, R - 0.8, cz, 0.35);
    W.lamps.push({ x: cx, z: cz, y: R - 0.5 });
  } else glowSprite(0xffa040, 2, world, cx, 1.2, cz, 0.25);
  // Free tiles: everything but the tiles just inside the doors.
  const tiles = [];
  for (let y = I.y; y < I.y + I.h; y++) for (let x = I.x; x < I.x + I.w; x++) {
    if (Math.abs(x - (fx0 - fdx)) + Math.abs(y - (fz0 - fdz)) === 0) continue;
    if (I.back && Math.abs(x - (I.back[0] - I.back[2])) + Math.abs(y - (I.back[1] - I.back[3])) === 0) continue;
    if (blocked(toW(x), toW(y))) continue; // keep crawlspace mouths and earlier loot clear
    tiles.push([x, y]);
  }
  if (!tiles.length) return;
  shuffleR(tiles);
  const at = i => { const t = tiles[i % tiles.length]; return [toW(t[0]), toW(t[1])]; };
  const wood = lam(0x7a5838, { map: stoneTex }), steel = lam(0xb8c0c8, { map: metalTex });
  if (I.kind === 'diner') {
    const [ax, az] = at(0);
    staticBox(ax, az, 3.2, 1.2, 1.1, lam(0xd04060, { map: stoneTex }));
    mkMesh(Bx(3.3, 0.08, 1.3), lam(0xe8e0d0), ax, 1.14, az);
    for (const s of [-1, 0, 1]) mkMesh(Cy(0.3, 0.3, 0.1, 8), lam(0xd04060), ax + s, 0.75, az + 1.1).castShadow = false;
    const [bx, bz] = at(1);
    staticBox(bx, bz, 1.4, 1.2, 1.2, steel);
    glowSprite(0xff7020, 1.6, world, bx, 1.3, bz, 0.7);
    for (let i = 0; i < 2; i++) { const [fx, fz] = at(2 + i); dropFood(fx, 0, fz); }
    const [qx, qz] = at(4); addCache(qx, 0, qz);
  } else if (I.kind === 'workshop') {
    const [ax, az] = at(0); staticBox(ax, az, 2.2, 1.1, 1.07, wood); // a dead workbench, just furniture now
    for (let i = 1; i < 3; i++) { const [bx, bz] = at(i); staticBox(bx, bz, 1.4, 1.4, rr(0.8, 1.6), wood); }
    for (let i = 0; i < 8; i++) { const [sx, sz] = at(3); scrapDrop(sx + rr(-1, 1), 0, sz + rr(-1, 1)); }
    const [cx2, cz2] = at(4); addChest(cx2, 0, cz2, rng.next() < 0.35);
  } else if (I.kind === 'apartment') {
    const [ax, az] = at(0);
    staticBox(ax, az, 2.8, 1.2, 0.7, lam(0x6a3a5a, { map: furTex }));
    mkMesh(Bx(2.8, 0.8, 0.25), lam(0x6a3a5a, { map: furTex }), ax, 1.1, az - 0.5);
    const [bx, bz] = at(1);
    staticBox(bx, bz, 1.2, 0.5, 1.0, lam(0x2a2a30));
    mkMesh(Bx(1.0, 0.7, 0.08), basic(0x5ad0ff), bx, 1.4, bz);
    glowSprite(0x5ad0ff, 3, world, bx, 1.4, bz + 0.3, 0.4);
    const [cx2, cz2] = at(2); addChest(cx2, 0, cz2, rng.next() < 0.35);
    const [qx, qz] = at(3); addCache(qx, 0, qz);
  } else {
    // Laundromat: a row of washers. Start a spin cycle to drag the horde in and shred it.
    for (let i = 0; i < Math.min(4, tiles.length - 1); i++) {
      const [ax, az] = at(i), g = new THREE.Group();
      mkMesh(Bx(1.8, 1.8, 1.8), lam(0xe8ecf0, { map: metalTex }), 0, 0.9, 0, g);
      const door = mkMesh(new THREE.TorusGeometry(0.55, 0.1, 5, 12), steel, 0, 1, 0.92, g);
      const drum = mkMesh(new THREE.CircleGeometry(0.5, 10), lam(0x6ab0ff, { emissive: 0x1a3048 }), 0, 1, 0.91, g);
      g.position.set(ax, 0, az);
      g.rotation.y = Math.atan2(cx - ax, cz - az);
      world.add(g);
      W.plats.push({ x: ax, z: az, w: 1.8, d: 1.8, y: 1.8, th: 1.8 });
      const wsh = { x: ax, z: az, door, drum, spin: 0, cd: 0 };
      W.washers.push(wsh);
      usePoint(ax, az, 1.6, 'Start a spin cycle (pulls the horde in)', () => spinCycle(wsh));
    }
    const [qx, qz] = at(5); addCache(qx, 0, qz);
  }
}
function spinCycle(w) {
  if (w.cd > 0) { dnum(w.x, 2.2, w.z, 'Still spinning down', 'info'); return false; }
  w.spin = 5; w.cd = 18;
  sfx('phase');
  dnum(w.x, 2.4, w.z, 'SPIN CYCLE', 'crit');
  fx('ring', w.x, 0, w.z, 6, 0x6ab0ff, 0.6);
  return true;
}
/** Back doors are bolted on the inside: unbolt one on your way out for a shortcut. */
export function boltTarget() {
  const gx = toG(P.x), gz = toG(P.z);
  if (!inG(gx, gz) || !M.inside[gi(gx, gz)] || P.y > 2) return null;
  for (const [dx, dz] of N4) {
    const k = gi(gx + dx, gz + dz);
    if (inG(gx + dx, gz + dz) && M.secret[k] === 2 && tAt(gx + dx, gz + dz) === 3) return { x: toW(gx + dx), z: toW(gz + dz), gx: gx + dx, gz: gz + dz, r: 1.6 };
  }
  return null;
}

// ---------- the night tram ----------
function buildTram(info) {
  // The longest road line that runs most of the way across the map.
  const lines = [...info.roadsX.map(([p, w]) => ({ axis: 'z', p, w })), ...info.roadsZ.map(([p, w]) => ({ axis: 'x', p, w }))];
  let best = null, bn = 0;
  for (const L of lines) {
    let n = 0;
    for (let i = 1; i < M.W - 1; i++) { const t = L.axis === 'z' ? tAt(L.p, i) : tAt(i, L.p); if (t === 10 || t === 2 || t === 4) n++; }
    if (n > bn && Math.abs(L.p - M.W / 2) > 3) { bn = n; best = L; }
  }
  if (!best || bn < M.W * 0.6) return;
  const c = toW(best.p) - T / 2 + best.w * T / 2, a0 = toW(1), a1 = toW(M.W - 2), len = a1 - a0;
  const rails = [], sleepers = [];
  for (const s of [-0.75, 0.75]) rails.push(best.axis === 'z' ? Bx(0.12, 0.12, len).translate(c + s, 0.06, (a0 + a1) / 2) : Bx(len, 0.12, 0.12).translate((a0 + a1) / 2, 0.06, c + s));
  for (let a = a0; a < a1; a += 1.3) sleepers.push(best.axis === 'z' ? Bx(2.2, 0.06, 0.3).translate(c, 0.03, a) : Bx(0.3, 0.06, 2.2).translate(a, 0.03, c));
  const rm = new THREE.Mesh(mergeGeometries(rails), lam(0xb8b8c0, { map: metalTex }));
  const sm = new THREE.Mesh(mergeGeometries(sleepers), lam(0x4a3a2a));
  world.add(rm, sm);
  // Crossing signals where the cross streets meet the line.
  const lights = [];
  for (const [q, w] of best.axis === 'z' ? info.roadsZ : info.roadsX) {
    const along = toW(q) - T / 2 + w * T / 2;
    for (const s of [-1, 1]) {
      const px = best.axis === 'z' ? c + s * 2.6 : along + s * (w * T / 2 + 0.4), pz = best.axis === 'z' ? along + s * (w * T / 2 + 0.4) : c + s * 2.6;
      mkMesh(Cy(0.08, 0.08, 3, 5), lam(0x2a2a30), px, 1.5, pz);
      mkMesh(Bx(0.9, 0.12, 0.12), lam(0xe8e8e8), px, 2.6, pz).rotation.y = best.axis === 'z' ? 0 : PI2;
      lights.push(glowSprite(0xff2a1a, 1.4, world, px, 3.1, pz, 0));
    }
  }
  // The tram itself.
  const g = new THREE.Group();
  mkMesh(Bx(2.6, 2.6, 11), lam(0xd8c8a0, { map: metalTex }), 0, 1.6, 0, g);
  mkMesh(Bx(2.65, 0.7, 10.4), basic(0xffe9a0), 0, 2.1, 0, g);
  mkMesh(Bx(2.7, 0.4, 11.1), lam(0xa02a20), 0, 0.5, 0, g);
  mkMesh(Bx(0.08, 1.6, 0.08), lam(0x2a2a30), 0, 3.6, 0, g);
  for (const s of [-1, 1]) glowSprite(0xfff0c0, 3, g, 0, 1.4, s * 5.6, 0.9);
  g.visible = false;
  world.add(g);
  W.tram = { axis: best.axis, c, a0: a0 - 12, a1: a1 + 12, mesh: g, lights, state: 'idle', t: rand(35, 50), pos: 0, dir: 1, first: true, pass: 1 };
}
function tickTram(dt) {
  const tr = W.tram;
  if (!tr || (G.testNoRoles && !tr.forced)) return; // debug: scripted tests park the tram unless they call it
  const perp = (x, z) => tr.axis === 'z' ? x - tr.c : z - tr.c, along = (x, z) => tr.axis === 'z' ? z : x;
  if (tr.state === 'idle') {
    tr.t -= dt;
    if (tr.t > 0) return;
    tr.state = 'warn'; tr.t = 3.2; tr.dir = Math.random() < 0.5 ? 1 : -1; tr.hitP = false; tr.kills = 0;
    sfx('bell');
    if (tr.first) { tr.first = false; banner('The night tram is coming', 'Get off the rails · lure the horde onto them'); }
    for (let a = tr.a0 + 12; a < tr.a1 - 12; a += 5) { const x = tr.axis === 'z' ? tr.c : a, z = tr.axis === 'z' ? a : tr.c; fx('warn', x, 0, z, 1.6, 0xffb020, 3.2, 0, 0.35); }
  }
  if (tr.state === 'warn') {
    tr.t -= dt;
    const on = Math.floor(tr.t * 4) % 2 === 0;
    tr.lights.forEach((l, i) => { l.material.opacity = (on ? i % 2 : 1 - i % 2) ? 0.95 : 0.1; });
    if (Math.floor(tr.t * 2) !== Math.floor((tr.t + dt) * 2)) sfx('bell');
    if (tr.t <= 0) { tr.state = 'run'; tr.pos = tr.dir > 0 ? tr.a0 : tr.a1; tr.mesh.visible = true; sfx('door'); G.shake = Math.max(G.shake, 0.2); }
    return;
  }
  if (tr.state === 'run') {
    tr.pos += tr.dir * 36 * dt;
    const m = tr.mesh;
    if (tr.axis === 'z') { m.position.set(tr.c, 0, tr.pos); m.rotation.y = 0; } else { m.position.set(tr.pos, 0, tr.c); m.rotation.y = PI2; }
    tr.lights.forEach((l, i) => { l.material.opacity = Math.floor(G.time * 6 + i) % 2 ? 0.9 : 0.15; });
    const near = Math.abs(along(P.x, P.z) - tr.pos);
    if (near < 18) G.shake = Math.max(G.shake, 0.15 * (1 - near / 18));
    if (!tr.hitP && Math.abs(perp(P.x, P.z)) < 1.8 && near < 5.8 && P.y < 3) {
      tr.hitP = true;
      hurtP(40, tr.axis === 'z' ? { x: tr.c, z: P.z - tr.dir } : { x: P.x - tr.dir, z: tr.c });
      dnum(P.x, P.y + 1.8, P.z, 'HIT BY THE TRAM', 'crit');
    }
    for (const e of W.enemies) {
      if (e.dead || e.type === 'nest' || e.rival || e.fly || e.tramHit === tr.pass) continue;
      if (Math.abs(perp(e.x, e.z)) < 1.8 + e.r && Math.abs(along(e.x, e.z) - tr.pos) < 5.8 && e.y < 3) {
        e.tramHit = tr.pass;
        const a = tr.axis === 'z' ? (tr.dir > 0 ? 0 : Math.PI) : (tr.dir > 0 ? PI2 : -PI2);
        hit(e, e.boss ? e.maxHp * 0.06 : 400, a + rand(-0.6, 0.6), e.boss ? 4 : 24, 'tram');
        if (e.dead) tr.kills++;
      }
    }
    if ((tr.dir > 0 && tr.pos > tr.a1) || (tr.dir < 0 && tr.pos < tr.a0)) {
      tr.state = 'idle'; tr.t = rand(45, 65); tr.mesh.visible = false; tr.pass = (tr.pass || 0) + 1;
      tr.lights.forEach(l => { l.material.opacity = 0; });
      if (tr.kills >= 3) { dnum(P.x, P.y + 2.2, P.z, `TRAM ×${tr.kills}`, 'crit'); run.tramKills = (run.tramKills || 0) + tr.kills; }
    }
  }
}

// ---------- market stalls ----------
const AWN = [0xd04040, 0x40a0d0, 0xe0b030, 0x60c060, 0xc060c0];
function buildMarket(lot) {
  const stalls = [];
  for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) if ((x + y) % 2 === 0 && DRY(tAt(x, y))) stalls.push([x, y]);
  shuffleR(stalls);
  for (const [gx, gz] of stalls.filter(([x, y]) => !blocked(toW(x), toW(y), 2.6)).slice(0, 6)) {
    const x = toW(gx), z = toW(gz), col = AWN[ri(0, AWN.length - 1)], rot = rng.next() < 0.5 ? 0 : PI2;
    const g = new THREE.Group();
    mkMesh(Bx(2.6, 1, 1.2), lam(0x6a4a2a, { map: stoneTex }), 0, 0.5, 0, g);
    for (let i = 0; i < 5; i++) mkMesh(Sp(0.16, 5, 4), lam([0xc0c8d0, 0xe06030, 0xd0d040, 0x60b040][i % 4]), -1 + i * 0.5, 1.12, rr(-0.3, 0.3), g);
    for (const s of [-1, 1]) for (const t of [-1, 1]) mkMesh(Cy(0.05, 0.05, 2.6, 4), lam(0x3a2a20), s * 1.25, 1.3, t * 0.55, g);
    const awn = mkMesh(Bx(3, 0.06, 1.8), lam(col, { emissive: col, emissiveIntensity: 0.25 }), 0, 2.6, 0.15, g);
    awn.rotation.x = 0.18;
    const lamp = glowSprite(0xffd890, 2.2, g, 0, 2.2, 0.5, 0.6);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    world.add(g);
    W.plats.push({ x, z, w: rot ? 1.2 : 2.6, d: rot ? 2.6 : 1.2, y: 1, th: 1 });
    const u = usePoint(x, z, 2.2, 'Rob the stall (sets off the alarm)', () => robStall(u, lamp));
  }
  // Strings of lanterns over the lot.
  for (let i = 0; i < 8; i++) glowSprite(AWN[i % AWN.length], 0.9, world, toW(lot.x) + rr(-1, lot.w * T - 3), 3.6 + rr(-0.2, 0.2), toW(lot.y) + rr(-1, lot.h * T - 3), 0.8);
  sign('MARKET', '#ffb040', toW(lot.x) - 1, 4.4, toW(lot.y) - 1, -1, -1, 3.6);
}
function robStall(u, lamp) {
  u.done = true;
  lamp.visible = false;
  for (let i = 0; i < 7; i++) scrapDrop(u.x + rr(-1, 1), 0, u.z + rr(-1, 1));
  dropFood(u.x, 0, u.z);
  if (Math.random() < 0.3) dropLoot(u.x + 1, 0, u.z);
  sfx('screech');
  banner('Stop, thief!', 'The whole market heard that');
  run.robbed = (run.robbed || 0) + 1;
  const n = 5 + (run.tier || 0) * 2;
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), r = rand(8, 13); spawnEnemy(i === 0 && run.time > 120 ? 'shieldrat' : 'mawling', u.x + Math.sin(a) * r, u.z + Math.cos(a) * r, { plain: true }); }
  return true;
}

// ---------- the crane site ----------
function buildCrane(lot) {
  const x = toW(lot.x) + (lot.w * T) / 2 - T / 2, z = toW(lot.y) + (lot.h * T) / 2 - T / 2, H = 16;
  if (nearMouth(x, z, 6) || blocked(x, z, 3) || blocked(x + 2.4, z + 1.2, 1.8)) return;
  const steel = lam(0xe0b030, { map: metalTex }), dark = lam(0x2a2a30, { map: metalTex });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mkMesh(Bx(0.18, H, 0.18), steel, x + sx * 0.6, H / 2, z + sz * 0.6);
  for (let y = 1; y < H; y += 1.6) for (const s of [-1, 1]) {
    mkMesh(Bx(1.3, 0.08, 0.08), steel, x, y, z + s * 0.6).rotation.z = 0.7;
    mkMesh(Bx(0.08, 0.08, 1.3), steel, x + s * 0.6, y + 0.8, z).rotation.x = 0.7;
  }
  staticBox(x, z, 1.5, 1.5, 0.6, dark);
  const jib = new THREE.Group();
  mkMesh(Bx(0.6, 0.6, 22), steel, 0, 0, 5, jib);
  mkMesh(Bx(1.6, 1.4, 2.2), dark, 0, -0.2, -5.5, jib);
  mkMesh(Bx(1.4, 1.2, 1.4), lam(0x5a8ab0, { emissive: 0x102030 }), 0, -0.9, 0.8, jib);
  const trolley = mkMesh(Bx(0.7, 0.3, 0.9), dark, 0, -0.45, 9, jib);
  const cable = mkMesh(Cy(0.03, 0.03, 1, 4), dark, 0, 0, 9, jib);
  const load = new THREE.Group();
  for (let i = 0; i < 3; i++) mkMesh(Bx(0.5, 0.35, 3.4), lam(0x8a3a2a, { map: metalTex }), -0.55 + i * 0.55, 0, 0, load);
  load.position.set(0, -5, 9);
  jib.add(load);
  jib.position.set(x, H, z);
  world.add(jib);
  glowSprite(0xff3020, 1.2, world, x, H + 0.6, z, 0.9);
  const cab = new THREE.Group();
  mkMesh(Bx(1, 1.2, 0.8), lam(0x3a4a5a, { map: metalTex }), 0, 0.6, 0, cab);
  mkMesh(Bx(0.4, 0.3, 0.05), basic(0x6aff6a), 0, 1.0, 0.42, cab);
  cab.position.set(x + 2.4, 0, z + 1.2);
  world.add(cab);
  W.plats.push({ x: x + 2.4, z: z + 1.2, w: 1, d: 0.8, y: 1.2, th: 1.2 });
  sign('DANGER · CRANE', '#ffd040', x + 2.4, 2.3, z + 1.65, 0, 1, 2.6);
  const cr = { x, z, H, jib, trolley, cable, load, state: 'idle', cd: 0, ang: 0, reach: 9, ty: -5 };
  W.crane = cr;
  usePoint(x + 2.4, z + 1.2, 1.8, 'Work the crane: drop the load on the crowd', () => craneDrop(cr));
}
function craneDrop(cr) {
  if (cr.state !== 'idle' || cr.cd > 0) { dnum(cr.x, 3, cr.z, cr.cd > 0 ? `Crane resets in ${Math.ceil(cr.cd)}s` : 'Busy', 'info'); return false; }
  // Aim at the thickest crowd within reach (or the locked target).
  let best = null, bn = 0;
  for (const e of W.enemies) {
    if (e.dead || e.fly || e.type === 'nest' || e.hidden) continue;
    const d = Math.hypot(e.x - cr.x, e.z - cr.z);
    if (d < 3 || d > 18) continue;
    let n = e.boss ? 6 : 1;
    for (const o of W.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < 3.5) n++;
    if (n > bn) { bn = n; best = e; }
  }
  if (!best) { dnum(cr.x, 3, cr.z, 'Nothing in reach worth crushing', 'info'); return false; }
  cr.state = 'swing'; cr.t = 1.2; cr.tx = best.x; cr.tz = best.z;
  cr.ta = Math.atan2(best.x - cr.x, best.z - cr.z);
  cr.treach = Math.min(17, Math.hypot(best.x - cr.x, best.z - cr.z));
  sfx('door');
  return true;
}
function crushAt(x, z, R, dmg) {
  const gy = floorY(x, z);
  let n = 0;
  for (const e of W.enemies) {
    if (e.dead || e.type === 'nest' || e.fly) continue;
    if (Math.hypot(e.x - x, e.z - z) > R + e.r) continue;
    hit(e, e.boss ? Math.max(dmg * 0.5, e.maxHp * 0.08) : dmg, Math.atan2(e.x - x, e.z - z), 14, 'trap');
    e.stun = Math.max(e.stun || 0, 1.5);
    n++;
  }
  if (Math.hypot(P.x - x, P.z - z) < R * 0.7 && P.y < gy + 2.5) hurtP(20, { x, z });
  boom(x, gy + 0.8, z, R * 2, 0xffd0a0);
  puff(x, gy + 0.3, z, 0x8a7a6a, 30, 6);
  G.shake = Math.max(G.shake, 0.8);
  sfx('boom');
  if (n >= 2) dnum(x, gy + 2.5, z, `CRANE ×${n}`, 'crit');
}
function tickCrane(dt) {
  const cr = W.crane;
  if (!cr) return;
  cr.cd -= dt;
  if (cr.state === 'idle') { cr.ang += dt * 0.08; cr.reach += (9 - cr.reach) * Math.min(1, dt); cr.ty += (-5 - cr.ty) * Math.min(1, dt * 2); }
  else if (cr.state === 'swing') {
    cr.t -= dt;
    cr.ang += Math.atan2(Math.sin(cr.ta - cr.ang), Math.cos(cr.ta - cr.ang)) * Math.min(1, dt * 4);
    cr.reach += (cr.treach - cr.reach) * Math.min(1, dt * 4);
    if (cr.t <= 0) { cr.state = 'drop'; cr.vy = 0; warn(cr.tx, cr.tz, 3.6, 0.9, 0, { col: 0xffb020, silent: true }); cr.t = 0.6; }
  } else if (cr.state === 'drop') {
    cr.t -= dt;
    if (cr.t <= 0) {
      cr.vy -= 40 * dt;
      cr.ty += cr.vy * dt;
      if (cr.H + cr.ty <= floorY(cr.tx, cr.tz) + 0.3) { crushAt(cr.tx, cr.tz, 3.6, 130); cr.state = 'lift'; cr.t = 2; }
    }
  } else if (cr.state === 'lift') {
    cr.t -= dt;
    if (cr.t <= 0) { cr.ty += (-5 - cr.ty) * Math.min(1, dt * 1.5); if (cr.ty > -5.3) { cr.state = 'idle'; cr.cd = 16; } }
  }
  cr.jib.rotation.y = cr.ang;
  cr.trolley.position.z = cr.reach;
  cr.load.position.set(0, cr.ty, cr.reach);
  cr.cable.position.set(0, cr.ty / 2, cr.reach);
  cr.cable.scale.y = Math.max(0.1, -cr.ty);
}

// ---------- gardens and the guard dog ----------
function buildGarden(lot) {
  const soil = lam(0x4a3020, { map: furTex }), plank = lam(0x7a5838, { map: stoneTex });
  for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) {
    if ((x + y) % 2 || !DRY(tAt(x, y)) || blocked(toW(x), toW(y), 2.4)) continue;
    const cx = toW(x), cz = toW(y);
    staticBox(cx, cz, 2.6, 1.6, 0.5, plank);
    mkMesh(Bx(2.4, 0.08, 1.4), soil, cx, 0.52, cz);
    for (let i = 0; i < 4; i++) mkMesh(Sp(0.22, 6, 4), lam([0x5aa040, 0x7ac050, 0xd04030][i % 3]), cx - 0.9 + i * 0.6, 0.72, cz + rr(-0.3, 0.3));
    if (rng.next() < 0.5) dropFood(cx, 0.6, cz);
  }
  // A gnome keeps watch.
  const gx = toW(lot.x), gz = toW(lot.y), gn = new THREE.Group();
  mkMesh(Cy(0.25, 0.32, 0.6, 6), lam(0x3060c0), 0, 0.3, 0, gn);
  mkMesh(Sp(0.2, 6, 4), lam(0xf0c8a0), 0, 0.75, 0, gn);
  mkMesh(Co(0.22, 0.5, 6), lam(0xd03030), 0, 1.1, 0, gn);
  gn.position.set(gx, 0, gz);
  world.add(gn);
  // The dog walks the garden's edge.
  const ring = [];
  for (let x = lot.x; x < lot.x + lot.w; x++) ring.push([x, lot.y]);
  for (let y = lot.y; y < lot.y + lot.h; y++) ring.push([lot.x + lot.w - 1, y]);
  for (let x = lot.x + lot.w - 1; x >= lot.x; x--) ring.push([x, lot.y + lot.h - 1]);
  for (let y = lot.y + lot.h - 1; y >= lot.y; y--) ring.push([lot.x, y]);
  const path = ring.filter(([x, y]) => OPEN(tAt(x, y))).map(([x, y]) => gi(x, y));
  if (path.length > 4) addPred(path, { geo: 'dog', sc: 1.25, hp: 380, spd: 3.2, dmg: 18, r: 0.9, h: 2, dog: true });
}

// ---------- rain ----------
let rainIM = null;
const RAIN_N = 420;
function rainOn(on) {
  if (!rainIM) {
    rainIM = new THREE.InstancedMesh(Bx(0.03, 0.9, 0.03), new THREE.MeshBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.45, depthWrite: false }), RAIN_N);
    rainIM.frustumCulled = false;
    rainIM.userData.drops = Array.from({ length: RAIN_N }, () => ({ x: rand(-22, 22), y: rand(0, 18), z: rand(-22, 22) }));
    scene.add(rainIM);
  }
  rainIM.visible = on;
}
const _d = new THREE.Object3D();
function tickRain(dt) {
  if (!rainIM || !rainIM.visible) return;
  const cx = P.x, cz = P.z, cyb = camera.position.y;
  rainIM.userData.drops.forEach((d, i) => {
    d.y -= 26 * dt;
    if (d.y < 0) { d.y = Math.max(cyb, 8) + rand(2, 10); d.x = rand(-22, 22); d.z = rand(-22, 22); if (i % 6 === 0) W.parts.push({ x: cx + d.x, y: floorY(cx + d.x, cz + d.z) + 0.1, z: cz + d.z, vx: 0, vy: 1.2, vz: 0, life: 0.15, c: 0xb0c8e0, s: 0.4, ng: true }); }
    _d.position.set(cx + d.x, d.y, cz + d.z);
    _d.rotation.set(0.12, 0, 0);
    _d.updateMatrix();
    rainIM.setMatrixAt(i, _d.matrix);
  });
  rainIM.instanceMatrix.needsUpdate = true;
}

// ---------- boss arenas ----------
const ARENA = {
  tabby(x, z) {
    // A ruined rooftop garden: planters in a ring, a pergola, fairy lights.
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, px = x + Math.sin(a) * 7, pz = z + Math.cos(a) * 7; staticBox(px, pz, 1.2, 1.2, 0.8, lam(0x8a5a3a, { map: stoneTex })); mkMesh(Sp(0.6, 6, 4), lam(0x4a8a3a), px, 1.3, pz); }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mkMesh(Bx(0.25, 4, 0.25), lam(0x6a4a2a), x + sx * 3, 2, z + sz * 3);
    for (let i = 0; i < 6; i++) mkMesh(Bx(6.4, 0.15, 0.2), lam(0x6a4a2a), x, 4, z - 3 + i * 1.2);
    for (let i = 0; i < 14; i++) glowSprite(0xffe090, 0.7, world, x + rr(-3, 3), 3.8, z + rr(-3, 3), 0.9);
  },
  murder(x, z) {
    // A dead tree and perches, heavy with nests.
    mkMesh(Cy(0.5, 0.8, 9, 6), lam(0x3a2e26, { map: furTex }), x, 4.5, z);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, b = mkMesh(Cy(0.12, 0.2, 4, 5), lam(0x3a2e26), x + Math.sin(a) * 1.6, 7 + (i % 2), z + Math.cos(a) * 1.6); b.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); mkMesh(Sp(0.5, 6, 4), lam(0x2a221a, { map: furTex }), x + Math.sin(a) * 3, 8.4 + (i % 2), z + Math.cos(a) * 3); }
    for (let i = 0; i < 20; i++) mkMesh(Bx(0.3, 0.02, 0.1), lam(0x101014), x + rr(-6, 6), 0.03, z + rr(-6, 6)).rotation.y = rand(0, TAU);
  },
  exterm(x, z) {
    // A gassed-out warehouse floor: four vents that blow during the fight.
    W.arenaVents = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const vx = x + sx * 6, vz = z + sz * 6;
      mkMesh(Bx(1.8, 0.1, 1.8), lam(0x4a4e54, { map: metalTex }), vx, 0.05, vz);
      for (let i = 0; i < 4; i++) mkMesh(Bx(1.6, 0.04, 0.12), lam(0x101014), vx, 0.11, vz - 0.6 + i * 0.4);
      W.arenaVents.push({ x: vx, z: vz, sp: glowSprite(0x9be06a, 2, world, vx, 0.6, vz, 0.2), t: rand(2, 6) });
    }
    for (let i = 0; i < 6; i++) staticBox(x + rr(-9, 9), z + rr(-9, 9), 1.4, 1.4, 1.4, lam(0xb04a30, { map: metalTex }));
  },
  maw(x, z) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const r = mkMesh(new THREE.TorusGeometry(2.4, 0.18, 4, 10, Math.PI), lam(0xd8d0b8), x + Math.sin(a) * 6, 0, z + Math.cos(a) * 6); r.rotation.y = a; }
    for (let i = 0; i < 24; i++) mkMesh(Cy(0.08, 0.08, rr(0.6, 1.4), 4), lam(0xd8d0b8), x + rr(-7, 7), 0.1, z + rr(-7, 7)).rotation.set(PI2, rand(0, TAU), 0);
  },
  brood(x, z) {
    W.arenaSacs = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, sx = x + Math.sin(a) * 6, sz = z + Math.cos(a) * 6; mkMesh(Sp(0.8, 6, 4), lam(0xe8e0c8, { emissive: 0x2a1a0a }), sx, 0.7, sz); W.arenaSacs.push({ x: sx, z: sz, t: rand(6, 12) }); }
    for (let i = 0; i < 10; i++) { const m = mkMesh(Bx(0.04, 0.04, 9), lam(0xf0f0f0, { transparent: true, opacity: 0.5 }), x + rr(-5, 5), rr(2, 4), z + rr(-5, 5)); m.rotation.set(rr(-0.3, 0.3), rand(0, TAU), 0); }
  },
  ratking(x, z) {
    // The throne: bones, a tall back and a crown of candles.
    staticBox(x, z - 3, 3, 2.4, 1.2, lam(0xd8d0b8, { map: stoneTex }));
    mkMesh(Bx(3, 4, 0.5), lam(0xd8d0b8, { map: stoneTex }), x, 3, z - 4.1);
    mkMesh(Cy(0.9, 0.9, 0.3, 8), lam(0xd8a830), x, 5.3, z - 4.1);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, cx = x + Math.sin(a) * 8, cz = z + Math.cos(a) * 8; mkMesh(Cy(0.12, 0.12, 0.6, 5), lam(0xf0e8d0), cx, 0.3, cz); glowSprite(0xffb040, 0.8, world, cx, 0.75, cz, 0.9); }
    for (const s of [-1, 1]) { mkMesh(Bx(0.15, 6, 0.15), lam(0x2a2018), x + s * 4, 3, z - 4.5); mkMesh(Bx(1.6, 3, 0.04), lam(0x7a1a2a, { emissive: 0x200408 }), x + s * 4, 4, z - 4.4); }
  },
};
function buildArena(info) {
  const r = info.byDist && info.byDist[0];
  if (!r) return;
  // Centre the lair on dry ground the rat can walk to, in the farthest room that has some
  // (a room's centre can be a pit or deep water; found by the playtest bots).
  let cx = r.cx, cz = r.cy;
  outer: for (const rm of info.byDist) {
    let bd = 1e9, got = null;
    for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) {
      if (!DRY(tAt(x, y)) || !info.dist || info.dist[gi(x, y)] < 0) continue;
      const d = Math.hypot(x - rm.cx, y - rm.cy);
      if (d < bd) { bd = d; got = [x, y]; }
    }
    if (got) { [cx, cz] = got; break outer; }
  }
  const kind = curD().boss, x = toW(cx), z = toW(cz);
  G.arena = { x, z, kind };
  if (ARENA[kind]) ARENA[kind](x, z);
  // A red beam marks the lair from anywhere in the district.
  const beam = new THREE.Mesh(Cy(1.2, 1.2, 40, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.set(x, 20, z);
  world.add(beam);
  G.arena.beam = beam;
}
function tickArena(dt) {
  const b = G.boss;
  if (!b || !b.revealed || b.dead || !G.arena) return;
  for (const v of W.arenaVents || []) {
    v.t -= dt;
    v.sp.material.opacity = v.t < 1 ? 0.8 : 0.2;
    if (v.t > 0) continue;
    v.t = rand(5, 8);
    warn(v.x, v.z, 3, 0.9, 0, { col: 0x9be06a, silent: true, fn: () => puddle('poison', v.x, v.z, 3, 4, 'all') });
  }
  for (const s of W.arenaSacs || []) {
    s.t -= dt;
    if (s.t > 0) continue;
    s.t = rand(9, 14);
    puff(s.x, 0.8, s.z, 0xe8e0c8, 10, 2);
    for (let i = 0; i < 3; i++) spawnEnemy('tick', s.x + rr(-1, 1), s.z + rr(-1, 1), { plain: true });
  }
}

// ---------- rooftop plank bridges ----------
function buildBridges() {
  const plank = lam(0x7a5838, { map: plywoodTex });
  let n = 0;
  for (let gz = 2; gz < M.H - 2 && n < 9; gz++) for (let gx = 2; gx < M.W - 2 && n < 9; gx++) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const a = gi(gx, gz), m = [gx + dx, gz + dz], b = [gx + dx * 2, gz + dz * 2];
      if (M.grid[a] !== 0 || tAt(...m) !== 1 || M.inside[gi(...m)] || tAt(...b) !== 0) continue;
      const ha = M.hgt[a], hb = M.hgt[gi(...b)];
      if (ha < 4 || Math.abs(ha - hb) > 1.4 || rng.next() > 0.08) continue;
      const y = Math.min(ha, hb), x = toW(gx + dx), z = toW(gz + dz), L = T * 2;
      mkMesh(Bx(dx ? L : 1.2, 0.12, dz ? L : 1.2), plank, x, y + 0.06, z);
      W.plats.push({ x, z, w: dx ? L : 1.2, d: dz ? L : 1.2, y: y + 0.12, th: 0.12, thin: true });
      n++;
    }
  }
}

// ---------- entry points ----------
/** Called from populate() once the base district is dressed. */
export function buildSetPieces(info) {
  W.uses = W.uses || [];
  W.washers = W.washers || [];
  W.tram = null; W.crane = null; W.arenaVents = null; W.arenaSacs = null;
  G.arena = null;
  const city = M.kind === 'city', D = curD();
  buildArena(info);
  if (!city) { run.rain = false; rainOn(false); return; }
  for (const I of info.interiors || []) buildInterior(I);
  const lots = info.lots || [];
  const used = new Set();
  const take = f => { const L = shuffleR(lots.filter(l => !used.has(l) && f(l)))[0]; if (L) used.add(L); return L; };
  const name = D.name, chance = p => rng.next() < p;
  if (name === 'Cinder Row' || chance(0.3)) buildTram(info);
  if (name === 'Neon Market' || chance(0.25)) { const L = take(l => (l.type === 'lot' || l.type === 'park') && l.w >= 3 && l.h >= 3); if (L) buildMarket(L); }
  if (name === 'Rust Yards' || chance(0.25)) { const L = take(l => (l.type === 'lot' || l.type === 'yard') && l.w >= 3 && l.h >= 3); if (L) buildCrane(L); }
  if (name === 'Hollow Heights' || chance(0.25)) { const L = take(l => l.type === 'park' && l.w >= 3 && l.h >= 3); if (L) buildGarden(L); }
  buildBridges();
  clearMouths();
  // Nothing may stand in an interior doorway (street clutter is placed before the interiors are furnished).
  for (const I of info.interiors || []) for (const d of [I.door, I.back].filter(Boolean)) for (const s of [0, 1, -1]) {
    const x = toW(d[0]) - d[2] * s * T, z = toW(d[1]) - d[3] * s * T;
    for (let i = W.plats.length - 1; i >= 0; i--) {
      const p = W.plats[i];
      if (p.thin || p.y > 2.6 || p.y - p.th > 1.5 || Math.abs(p.x - x) > p.w / 2 + 1 || Math.abs(p.z - z) > p.d / 2 + 1) continue;
      if (p.mesh) bury(p.mesh);
      W.plats.splice(i, 1);
    }
  }
  // Anything built on top of a fungus buries it.
  for (const f of W.fungi || []) {
    if (f.taken) continue;
    if (W.plats.some(p => !p.thin && Math.abs(p.x - f.x) < p.w / 2 + 0.3 && Math.abs(p.z - f.z) < p.d / 2 + 0.3 && p.y > f.y + 0.4 && p.y - p.th < f.y + 1)) { f.taken = true; bury(f.g); }
  }
  run.rain = (run.tier || 0) > 0 && (name === 'Hollow Heights' ? chance(0.6) : chance(0.3));
  rainOn(run.rain);
}

export function tickSetPieces(dt) {
  tickTram(dt);
  tickCrane(dt);
  tickArena(dt);
  tickRain(dt);
  for (const w of W.washers || []) {
    w.cd -= dt;
    if (!(w.spin > 0)) { w.drum.rotation.z += dt * 0.5; continue; }
    w.spin -= dt;
    w.drum.rotation.z += dt * 30;
    w.door.position.x = Math.sin(G.time * 40) * 0.03;
    if (Math.random() < 0.4) puff(w.x, 1, w.z, 0xe8f0ff, 1, 2);
    for (const e of W.enemies) {
      if (e.dead || e.boss || e.type === 'nest' || e.fly) continue;
      const dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz);
      if (d > 7) continue;
      e.kx += dx / (d || 1) * 30 * dt; e.kz += dz / (d || 1) * 30 * dt;
      if (d < 2.2) { e.spinT = (e.spinT || 0) - dt; if (e.spinT <= 0) { e.spinT = 0.3; hit(e, 22, null, 0, 'trap', true); spark(e.x, e.y + 0.5, e.z, 0.8, 0x9ad0ff); } }
    }
  }
}
