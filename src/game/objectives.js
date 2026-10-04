// Side objectives. Nests are always the main job (clearing them wakes the
// boss). The first district has nothing else; after that each district rolls
// an optional side job that pays a premium chest and gold.
//  - heist:  steal the giant Cheese Wheel and carry it home; the horde surges at you.
//  - rescue: gnaw open three cages; the freed rats run home (they don't fight).
//  - hold:   stand in the beacon's ring until it's lit, under waves of flyers.
//  - hunt:   a gold thief rat runs off with your gold. Catch it three times.
import * as THREE from 'three';
import { rand, pick, PI2 } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { Bx, Cy } from '../render/models.js';
import { metalTex, flameTex } from '../render/textures.js';
import { boom, puff, fx, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, gi, inG, toG, toW, tAt, floorY, roomTiles, OPEN, N8 } from '../world/grid.js';
import { isSewer } from '../data/world.js';
import { scrapDrop } from '../combat/combat.js';
import { spawnEnemy, moveBody } from '../entities/mobs.js';
import { onCage } from './story.js';
import { addChest } from '../world/build.js';
import { banner } from '../ui/hud.js';

const KINDS = ['heist', 'rescue', 'hold', 'hunt', 'nests'];
const HOLD_T = 35;
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const mk = (geo, mat, x, y, z, par = world) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
function beam(col, h = 14) {
  const b = new THREE.Mesh(Cy(1.2, 1.2, h, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  b.position.y = h / 2;
  return b;
}
function glow(col, s, par, y) {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  g.scale.set(s, s, 1);
  g.position.y = y;
  par.add(g);
  return g;
}
const spot = r => { const tl = roomTiles(r); const [x, z] = tl.length ? tl[(Math.random() * tl.length) | 0] : [r.cx, r.cy]; return { x: toW(x), z: toW(z) }; };

/** Roll this district's job (called at the end of world setup). */
export function setupObjective(info, force) {
  G.objInfo = info;
  const kind = force || ((run.tier || 0) === 0 ? 'nests' : pick(KINDS.filter(k => k !== run.lastObj)));
  run.lastObj = kind;
  const far = info.byDist || [], start = G.startRoom;
  const o = { kind, done: false };
  if (kind === 'heist') {
    const r = far[Math.floor(far.length * 0.85)] || far[far.length - 1], s = spot(r), g = new THREE.Group();
    const wheel = mk(Cy(1.1, 1.1, 0.7, 14), lam(0xf2c040, { emissive: 0x3a2800 }), 0, 0.35, 0, g);
    mk(Cy(0.5, 0.5, 0.72, 10), lam(0xd8a020), 0.3, 0.35, 0.2, g);
    glow(0xffd040, 3, g, 0.6);
    g.add(beam(0xffd040));
    g.position.set(s.x, floorY(s.x, s.z), s.z);
    world.add(g);
    const home = { x: toW(start.cx), z: toW(start.cy) }, hg = new THREE.Group();
    const ring = mk(new THREE.RingGeometry(2.2, 2.6, 24).rotateX(-PI2), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), 0, 0.06, 0, hg);
    ring.castShadow = false;
    hg.add(beam(0xffd040, 8));
    hg.position.set(home.x, floorY(home.x, home.z), home.z);
    hg.visible = false;
    world.add(hg);
    Object.assign(o, { x: s.x, z: s.z, g, wheel, home, hg, carried: false });
  } else if (kind === 'rescue') {
    o.cages = [];
    const picks = [0.35, 0.6, 0.85].map(f => far[Math.floor(far.length * f)]).filter(Boolean);
    for (const r of picks) {
      const s = spot(r), g = new THREE.Group(), bar = lam(0x7a7e86, { map: metalTex });
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mk(Cy(0.04, 0.04, 1.3, 4), bar, Math.sin(a) * 0.6, 0.65, Math.cos(a) * 0.6, g); }
      mk(Cy(0.68, 0.68, 0.08, 8), bar, 0, 1.3, 0, g);
      mk(Cy(0.68, 0.68, 0.08, 8), bar, 0, 0.04, 0, g);
      const inmate = mk(Bx(0.5, 0.3, 0.7), lam(0xbab4a8), 0, 0.2, 0, g);
      glow(0x9ad0ff, 1.8, g, 0.8);
      g.position.set(s.x, floorY(s.x, s.z), s.z);
      world.add(g);
      o.cages.push({ x: s.x, z: s.z, y: floorY(s.x, s.z), g, inmate, open: false });
    }
    o.freed = 0;
  } else if (kind === 'hold') {
    // A rooftop if the city has a climbable one at middle distance, else a room.
    let s = null;
    if (!isSewer()) {
      const mid = far[Math.floor(far.length * 0.5)];
      if (mid) for (let r = 1; r < 6 && !s; r++) for (let dz = -r; dz <= r && !s; dz++) for (let dx = -r; dx <= r && !s; dx++) {
        const x = mid.cx + dx, z = mid.cy + dz;
        if (inG(x, z) && tAt(x, z) === 0 && M.hgt[gi(x, z)] <= 7.5 && M.hgt[gi(x, z)] >= 4.5) s = { x: toW(x), z: toW(z) };
      }
    }
    if (!s) s = spot(far[Math.floor(far.length * 0.6)] || start);
    const y = floorY(s.x, s.z), g = new THREE.Group();
    mk(Cy(0.12, 0.16, 2.6, 6), lam(0x5a6068, { map: metalTex }), 0, 1.3, 0, g);
    const lamp = glow(0xff6a3a, 2.4, g, 2.7);
    const ring = mk(new THREE.RingGeometry(3.6, 4, 28).rotateX(-PI2), new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), 0, 0.06, 0, g);
    ring.castShadow = false;
    g.add(beam(0xff6a3a));
    g.position.set(s.x, y, s.z);
    world.add(g);
    Object.assign(o, { x: s.x, z: s.z, y, g, lamp, ring, p: 0, waveT: 3 });
  } else if (kind === 'hunt') {
    Object.assign(o, { caught: 0, thiefT: 2.5, thief: null });
  }
  run.obj = o;
  if (kind !== 'nests') banner(objTitle(kind), objHow(kind));
}
const objTitle = k => ({ heist: 'The Cheese Heist', rescue: 'Rescue the Caged Rats', hold: 'Light the Beacon', hunt: 'Catch the Thief', nests: 'Smash the Nests' }[k]);
const objHow = k => ({ heist: 'Grab the giant wheel and carry it home · the whole district will want it', rescue: 'Gnaw the cages open · freed rats run home to the Nest', hold: 'Stand in the ring until the beacon is lit', hunt: 'A gold thief is stealing your gold · catch it three times', nests: '' }[k]);

export const objDone = () => { const o = run.obj; return !o || o.kind === 'none' ? false : o.kind === 'nests' ? run.nests <= 0 : o.done; };
export const carryingWheel = () => !!(run.obj && run.obj.kind === 'heist' && run.obj.carried && !run.obj.done);

function finish(o, x, z) {
  o.done = true;
  const gy = floorY(x, z);
  addChest(x, gy, z, true);
  for (let i = 0; i < 20; i++) scrapDrop(x, gy, z);
  boom(x, gy + 1, z, 6, 0xffd040);
  fx('ring', x, gy, z, 6, 0xffd040, 0.7);
  sfx('level');
  banner(objTitle(o.kind) + ' · done', 'A premium chest and gold');
  run.objDone = (run.objDone || 0) + 1;
}

/** Gnaw targets for the rescue job (called from chewTarget). */
export function cageTarget() {
  const o = run.obj;
  if (!o || o.kind !== 'rescue') return null;
  for (const c of o.cages) if (!c.open && Math.hypot(c.x - P.x, c.z - P.z) < 1.9 && Math.abs(P.y - c.y) < 1.5) return c;
  return null;
}
export function openCage(c) {
  const o = run.obj;
  c.open = true;
  c.inmate.visible = false;
  c.g.children.forEach(m => { if (m.geometry && m.geometry.type === 'CylinderGeometry' && m.position.y > 0.5 && m.position.y < 1) m.rotation.z = rand(-1, 1); });
  puff(c.x, c.y + 0.6, c.z, 0x9ad0ff, 12, 3);
  o.freed++;
  onCage(o);
  dnum(c.x, c.y + 1.8, c.z, `Freed ${o.freed}/${o.cages.length}`, 'info');
  sfx('key');
  if (o.freed >= o.cages.length) finish(o, c.x, c.z);
}

/** The thief: runs from you along the flow field, snatching gems as it goes. */
export function thiefAI(e, dt) {
  const gx = toG(e.x), gz = toG(e.z);
  let best = null, bd = inG(gx, gz) ? M.flow[gi(gx, gz)] : -1;
  for (const [dx, dz] of N8) {
    const X = gx + dx, Z = gz + dz;
    if (!inG(X, Z) || !OPEN(tAt(X, Z))) continue;
    const f = M.flow[gi(X, Z)];
    if (f > bd) { bd = f; best = [X, Z]; }
  }
  let vx, vz;
  if (best) { vx = toW(best[0]) - e.x; vz = toW(best[1]) - e.z; } else { vx = e.x - P.x; vz = e.z - P.z; }
  const l = Math.hypot(vx, vz) || 1, sp = e.spd * (e.slow > 0 ? 0.5 : 1);
  moveBody(e, dt, vx / l * sp, vz / l * sp);
  e.ang = Math.atan2(vx, vz);
  // It scoops up any gold it runs over.
  for (let i = W.scraps.length - 1; i >= 0; i--) {
    const g = W.scraps[i];
    if (Math.abs(g.x - e.x) < 1.2 && Math.abs(g.z - e.z) < 1.2) { e.stash = (e.stash || 0) + 1; W.scraps.splice(i, 1); }
  }
}
/** Called from kill(). */
export function thiefDown(e) {
  const o = run.obj;
  if (!o || o.thief !== e) return;
  o.caught++;
  o.thief = null;
  o.thiefT = 2;
  const gy = floorY(e.x, e.z), n = 8 + Math.round((e.stash || 0) * 1.5);
  for (let i = 0; i < n; i++) scrapDrop(e.x + rand(-1, 1), gy, e.z + rand(-1, 1));
  dnum(e.x, gy + 2, e.z, `Caught ${o.caught}/3`, 'info');
  if (o.caught >= 3) finish(o, e.x, e.z);
}

export function tickObjective(dt) {
  const o = run.obj;
  if (!o || o.done) return;
  if (o.kind === 'heist') {
    if (!o.carried) {
      o.g.rotation.y += dt * 0.6;
      if (Math.hypot(P.x - o.x, P.z - o.z) < 1.8 && Math.abs(P.y - floorY(o.x, o.z)) < 1.5) {
        o.carried = true;
        o.hg.visible = true;
        o.g.children.forEach(c => { if (c.isMesh && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters.height > 5) c.visible = false; });
        banner('You have the wheel', 'Get it home · it slows you down, and everything smells it');
        sfx('key');
      }
    } else {
      // On your back, bobbing as you run.
      o.g.position.set(P.x - Math.sin(P.facing) * 0.6, P.y + 0.9 + Math.abs(Math.sin(G.time * 10)) * 0.08, P.z - Math.cos(P.facing) * 0.6);
      o.g.scale.setScalar(0.55);
      if (Math.hypot(P.x - o.home.x, P.z - o.home.z) < 2.6) { bury(o.g); finish(o, o.home.x, o.home.z); o.hg.visible = false; }
    }
  } else if (o.kind === 'hold') {
    const inside = Math.hypot(P.x - o.x, P.z - o.z) < 4 && Math.abs(P.y - o.y) < 2.2;
    o.p = Math.max(0, Math.min(HOLD_T, o.p + (inside ? dt : -dt * 0.5)));
    o.ring.material.opacity = inside ? 0.6 + 0.3 * Math.sin(G.time * 8) : 0.4;
    o.lamp.scale.setScalar(2.4 + 3 * o.p / HOLD_T);
    if (inside) {
      o.waveT -= dt;
      if (o.waveT <= 0) {
        o.waveT = 4;
        for (let i = 0; i < 3; i++) { const a = rand(0, 6.3); spawnEnemy(pick(['bat', 'crow']), o.x + Math.sin(a) * 9, o.z + Math.cos(a) * 9); }
      }
    }
    if (o.p >= HOLD_T) finish(o, o.x, o.z);
  } else if (o.kind === 'hunt') {
    if (!o.thief || o.thief.dead) {
      o.thief = null;
      o.thiefT -= dt;
      if (o.thiefT <= 0) {
        const tiles = M.spawnTiles || [];
        for (let i = 0; i < 12 && !o.thief && tiles.length; i++) {
          const k = tiles[(Math.random() * tiles.length) | 0];
          const e = spawnEnemy('mawling', toW(k % M.W), toW((k / M.W) | 0), { plain: true, sc: 1.3, hpMul: 6 + run.tier * 2, force: true });
          if (e) { Object.assign(e, { thief: true, spd: e.spd * 1.55, bar: true, name: 'Thief', xp: 0 }); o.thief = e; }
        }
        for (let i = 0; i < 16 && !o.thief; i++) {
          const a = rand(0, 6.3), r = rand(10, 18), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r, t = tAt(toG(x), toG(z));
          if (t !== 1 && t !== 9 && t !== 10) continue;
          const e = spawnEnemy('mawling', x, z, { plain: true, sc: 1.3, hpMul: 6 + run.tier * 2, force: true });
          if (e) { Object.assign(e, { thief: true, spd: e.spd * 1.55, bar: true, name: 'Thief', xp: 0 }); o.thief = e; }
        }
        if (o.thief) dnum(o.thief.x, o.thief.y + 2, o.thief.z, 'Thief!', 'crit');
        else o.thiefT = 1;
      }
    }
  }
}

/** For the HUD. */
export function objText() {
  const o = run.obj;
  if (!o || o.kind === 'nests' || o.kind === 'none') return null;
  if (o.done) return null;
  if (o.kind === 'heist') return o.carried ? 'Get the Cheese Wheel home (gold ring) · the horde wants it' : 'Steal the giant Cheese Wheel · F to sniff it out';
  if (o.kind === 'rescue') return `Free the caged rats ${o.freed}/${o.cages.length} · hold E to gnaw a cage · F to sniff them out`;
  if (o.kind === 'hold') return `Light the beacon ${Math.round(o.p / HOLD_T * 100)}% · stay inside the ring`;
  if (o.kind === 'hunt') return `Catch the thief ${o.caught}/3 · it's stealing your gold`;
  return null;
}
/** Where the scent and the minimap should point. */
export function objTargets() {
  const o = run.obj;
  if (!o || o.done) return [];
  if (o.kind === 'heist') return [o.carried ? o.home : { x: o.x, z: o.z }];
  if (o.kind === 'rescue') return o.cages.filter(c => !c.open);
  if (o.kind === 'hold') return [{ x: o.x, z: o.z }];
  if (o.kind === 'hunt') return o.thief ? [o.thief] : [];
  return [];
}
