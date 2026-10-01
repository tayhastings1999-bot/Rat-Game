// The Squeeze Network: crawlspaces carved through the building blocks (and
// the sewer's wall mass) that link street to street. Only a squeezing rat
// fits, so it's a stealth highway past the horde and the predators, but it
// has its own dangers: exposed live wires and rival nests that spit at you.
// While you're inside, every building is cut away at knee height so you can
// see the maze from above.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rng, shuffleR, PI2 } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { world, cutPlane } from '../render/renderer.js';
import { Bx, Co, Cy } from '../render/models.js';
import { metalTex, furTex, flameTex } from '../render/textures.js';
import { spark, bolt, dnum, puff } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, T, DUCT_TOP, gi, inG, toG, toW, tAt, tileAt, bfs, OPEN, DRY, N4 } from './grid.js';
import { glob } from '../combat/arsenal.js';
import { hurtP } from '../combat/combat.js';
import { contract } from '../game/contracts.js';

export const DUCT = 11;
/** Where the cutaway slices the buildings while you're inside. */
export const CUT_Y = 1.05;

const border = (x, z) => x < 2 || z < 2 || x > M.W - 3 || z > M.H - 3;
const R = () => rng.next();

/**
 * Carve crawlspaces through solid wall mass. Each one joins two street-side
 * wall faces whose walk-around distance is much longer than the crawl, so it
 * is a genuine shortcut. Runs before the world mesh is built.
 */
export function carveDucts() {
  if (G.mode === 'trial') return [];
  const city = M.kind === 'city', want = city ? 7 : 5, nets = [], used = [];
  const openNbr = k => { const x = k % M.W, z = (k / M.W) | 0; for (const [dx, dz] of N4) if (DRY(tAt(x + dx, z + dz))) return gi(x + dx, z + dz); return -1; };
  const edge = [];
  for (let k = 0; k < M.W * M.H; k++) {
    if (M.grid[k] !== 0 || M.secret[k]) continue;
    const x = k % M.W, z = (k / M.W) | 0;
    if (!border(x, z) && openNbr(k) >= 0) edge.push(k);
  }
  shuffleR(edge);
  for (let i = 0; i < edge.length && nets.length < want && i < 90; i++) {
    const A = edge[i], ax = A % M.W, az = (A / M.W) | 0;
    if (M.grid[A] !== 0 || used.some(([x, z]) => Math.abs(x - ax) + Math.abs(z - az) < 5)) continue;
    const aOpen = openNbr(A), open = bfs(aOpen % M.W, (aOpen / M.W) | 0, OPEN);
    // Crawl distance through the wall mass, 14 tiles at most.
    const dist = new Map([[A, 0]]), par = new Map(), q = [A];
    let best = -1, bestGain = 7;
    while (q.length) {
      const c = q.shift(), d = dist.get(c), cx = c % M.W, cz = (c / M.W) | 0;
      if (d >= 3 && c !== A) {
        const bo = openNbr(c);
        if (bo >= 0 && !used.some(([x, z]) => Math.abs(x - cx) + Math.abs(z - cz) < 4)) {
          const walk = open[bo] < 0 ? 60 : open[bo], gain = walk - d;
          if (gain > bestGain) { bestGain = gain; best = c; }
        }
      }
      if (d >= 14) continue;
      for (const [dx, dz] of shuffleR(N4.slice())) {
        const X = cx + dx, Z = cz + dz, k = gi(X, Z);
        if (!inG(X, Z) || border(X, Z) || dist.has(k) || (M.grid[k] !== 0 && M.grid[k] !== DUCT) || M.secret[k]) continue;
        // Stay inside the mass: only the two ends may touch the street.
        if (openNbr(k) >= 0 && M.grid[k] !== DUCT && d + 1 < 3) continue;
        dist.set(k, d + 1);
        par.set(k, c);
        q.push(k);
      }
    }
    if (best < 0) continue;
    const tiles = [];
    for (let c = best; c != null; c = par.get(c)) tiles.push(c);
    tiles.reverse();
    for (const k of tiles) M.grid[k] = DUCT;
    const net = { tiles, a: A, b: best, chamber: null, wire: null };
    // A chamber partway along: a nook just big enough for a nest or a stash.
    if (tiles.length >= 5) {
      const mid = tiles[(tiles.length / 2) | 0], mx = mid % M.W, mz = (mid / M.W) | 0;
      for (const [dx, dz] of shuffleR([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
        const X = mx + dx, Z = mz + dz, k = gi(X, Z);
        if (!inG(X, Z) || border(X, Z) || M.grid[k] !== 0 || M.secret[k] || openNbr(k) >= 0) continue;
        M.grid[k] = DUCT;
        net.chamber = { x: (toW(mx) + toW(X)) / 2, z: (toW(mz) + toW(Z)) / 2, k };
        break;
      }
    }
    const wires = tiles.slice(1, -1).filter(k => !net.chamber || k !== net.chamber.k);
    if (wires.length >= 2 && R() < 0.65) net.wire = wires[(R() * wires.length) | 0];
    used.push([ax, az], [best % M.W, (best / M.W) | 0]);
    nets.push(net);
  }
  return nets;
}

// ---------- world dressing ----------
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const steel = lam(0x5a6068, { map: metalTex });
let cap = null, capI = null;
/** Interiors are cut just above the rat's head. */
export const INT_CUT_Y = 2.6;

/** Wall-face vent frames, rival nests, stashes and live wires. Called at the end of populate(). */
export function populateDucts(nets, addCache) {
  W.ductNets = nets;
  for (const net of nets) {
    for (const k of [net.a, net.b]) { ventFrame(k); clearMouth(k); }
    if (net.chamber) {
      if (R() < 0.55) addRival(net.chamber.x, net.chamber.z);
      else addCache(net.chamber.x, 0, net.chamber.z);
    }
    if (net.wire != null) {
      const x = toW(net.wire % M.W), z = toW((net.wire / M.W) | 0), g = new THREE.Group();
      // A split conduit hanging from the crawlspace ceiling.
      const pipe = new THREE.Mesh(Cy(0.08, 0.08, T, 5), steel);
      pipe.rotation.z = PI2;
      pipe.position.y = 0.85;
      g.add(pipe);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0x9ad0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      sp.scale.set(1.2, 1.2, 1);
      sp.position.y = 0.6;
      g.add(sp);
      g.position.set(x, 0, z);
      world.add(g);
      W.ductWires.push({ k: net.wire, x, z, t: rand(0, 3), sp, tick: 0 });
    }
  }
}
/** Nothing solid may block the way into a crawlspace. */
function clearMouth(k) {
  const x = k % M.W, z = (k / M.W) | 0;
  for (const [dx, dz] of N4) {
    if (!DRY(tAt(x + dx, z + dz))) continue;
    const cx = toW(x) + dx * (T / 2 + 1.4), cz = toW(z) + dz * (T / 2 + 1.4);
    const block = p => !p.thin && Math.abs(p.x - cx) < p.w / 2 + 1.3 && Math.abs(p.z - cz) < p.d / 2 + 1.3 && p.y < 3;
    for (const p of W.plats) if (block(p) && p.mesh) world.remove(p.mesh);
    for (let i = W.plats.length - 1; i >= 0; i--) if (block(W.plats[i])) W.plats.splice(i, 1);
  }
}
/** Re-clear every crawlspace mouth (after later set pieces have been placed). */
export function clearMouths() { for (const net of W.ductNets || []) for (const k of [net.a, net.b]) clearMouth(k); }
/** True if (x, z) is within r of a crawlspace mouth. */
export const nearMouth = (x, z, r = 4.5) => (W.ductNets || []).some(n => [n.a, n.b].some(k => Math.hypot(toW(k % M.W) - x, toW((k / M.W) | 0) - z) < r));
/** A steel lintel and a bent grille over each crawlspace mouth. */
function ventFrame(k) {
  const x = k % M.W, z = (k / M.W) | 0;
  for (const [dx, dz] of N4) {
    if (!DRY(tAt(x + dx, z + dz))) continue;
    const fx0 = toW(x) + dx * (T / 2 + 0.02), fz0 = toW(z) + dz * (T / 2 + 0.02), along = dx === 0;
    const lintel = new THREE.Mesh(Bx(along ? T : 0.2, 0.22, along ? 0.2 : T), steel);
    lintel.position.set(fx0, DUCT_TOP + 0.1, fz0);
    world.add(lintel);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(Bx(0.06, 0.9, 0.06), steel);
      const o = -1.6 + i * 0.35;
      bar.position.set(fx0 + (along ? o : 0), 0.45, fz0 + (along ? 0 : o));
      bar.rotation.set(along ? 0 : 0.35, 0, along ? 0.35 : 0);
      world.add(bar);
    }
    return;
  }
}
function addRival(x, z) {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(Co(0.75, 0.7, 6), lam(0x4a3a2a, { map: furTex }));
  mound.position.y = 0.35;
  g.add(mound);
  const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xb0ff3a }));
  eye.position.y = 0.72;
  g.add(eye);
  g.position.set(x, 0, z);
  world.add(g);
  const hp = 110 * (1 + (run.tier || 0) * 0.45);
  W.enemies.push({ type: 'rivalnest', rival: true, x, y: 0, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp, r: 0.75, h: 0.9, heavy: true, mesh: g, core: eye, cd: rand(1, 2), col: 0x4a3a2a, blood: 0x5a1a10, flash: 0, slow: 0, bar: true, pT: 0, bT: 0, dT: 0, tT: 0, ward: 0, ang: 0 });
}
/** Dark caps over every solid tile, shown only in the cutaway; then arm the cut plane on everything built. */
export function applyCutaway() {
  const geos = [];
  for (let k = 0; k < M.W * M.H; k++) {
    const t = M.grid[k];
    if (t !== 0 && t !== 6 && t !== 3 && t !== 5 && t !== 8) continue;
    geos.push(new THREE.PlaneGeometry(T, T).rotateX(-PI2).translate(toW(k % M.W), CUT_Y + 0.02, toW((k / M.W) | 0)));
  }
  cap = geos.length ? new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0x0c0a10 })) : null;
  if (cap) { cap.visible = false; cap.userData.floor = true; world.add(cap); }
  capI = geos.length ? new THREE.Mesh(mergeGeometries(geos.map(g => g.clone().translate(0, INT_CUT_Y - CUT_Y, 0))), new THREE.MeshBasicMaterial({ color: 0x0c0a10 })) : null;
  if (capI) { capI.visible = false; capI.userData.floor = true; world.add(capI); }
  // Every building, prop and lamp in the district gets sliced by the cut plane; floors and water don't.
  const mats = new Set();
  world.traverse(o => { if (o.material && !o.userData.floor) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); });
  for (const m of mats) { m.clippingPlanes = [cutPlane]; m.needsUpdate = true; }
}

// ---------- runtime ----------
let cutK = 0, cutMode = 1;
export function tickDucts(dt) {
  const was = P.inDuct;
  P.inDuct = tileAt(P.x, P.z) === DUCT && P.y < DUCT_TOP;
  if (P.inDuct && !was) contract('duct');
  const gx = toG(P.x), gz = toG(P.z);
  P.inBldg = !P.inDuct && inG(gx, gz) && M.inside[gi(gx, gz)] > 0 && P.y < 2;
  if (P.inDuct) cutMode = 1; else if (P.inBldg) cutMode = 2;
  // Slice the buildings down smoothly as you crawl in (or step inside); restore when you're out.
  cutK += ((P.inDuct || P.inBldg ? 1 : 0) - cutK) * Math.min(1, 10 * dt);
  cutPlane.constant = cutK > 0.02 ? (cutMode === 2 ? INT_CUT_Y : CUT_Y) + (1 - cutK) * 30 : 1e4;
  if (cap) cap.visible = cutMode === 1 && cutK > 0.5;
  if (capI) capI.visible = cutMode === 2 && cutK > 0.5;
  // Live wires: arc for a moment every few seconds. Time your crawl.
  for (const w of W.ductWires) {
    w.t += dt;
    const on = w.t % 3.2 > 2.3;
    w.sp.material.opacity = on ? 0.6 + Math.random() * 0.4 : 0.15;
    if (!on) continue;
    if (Math.random() < dt * 12) bolt([[w.x + rand(-1.8, 1.8), 0.85, w.z + rand(-1.8, 1.8)], [w.x + rand(-1.8, 1.8), 0.05, w.z + rand(-1.8, 1.8)]]);
    w.tick -= dt;
    if (P.inDuct && toG(P.x) === w.k % M.W && toG(P.z) === ((w.k / M.W) | 0) && w.tick <= 0) {
      w.tick = 0.3;
      hurtP(6, null, true);
      spark(P.x, P.y + 0.3, P.z, 1, 0x9ad0ff);
      sfx('zap');
    }
  }
  // Rival nests spit at you when you're in their crawlspace.
  for (const e of W.enemies) {
    if (!e.rival || e.dead) continue;
    e.core.scale.setScalar(1 + Math.sin(G.time * 6 + e.x) * 0.2 + (e.flash > 0 ? 0.5 : 0));
    e.cd -= dt;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    if (e.cd > 0 || !P.inDuct || d > 11) continue;
    e.cd = 1.3;
    const s = 9;
    glob(e.x, 0.6, e.z, dx / d * s, 0, dz / d * s, 9 * (1 + (run.tier || 0) * 0.3), 0xb0ff3a);
    puff(e.x, 0.8, e.z, 0xb0ff3a, 3, 1.5);
  }
}
/** Loot when a rival nest is gnawed or clawed apart. */
export function rivalDeath(e, scrapDrop, dropGem) {
  world.remove(e.mesh);
  for (let i = 0; i < 10; i++) scrapDrop(e.x, 0, e.z);
  dropGem(e.x, 0.3, e.z, 12);
  dnum(e.x, 1.6, e.z, 'Rival nest cleared', 'info');
}
export const ductInfo = () => ({ nets: (W.ductNets || []).length, tiles: (W.ductNets || []).reduce((a, n) => a + n.tiles.length, 0), wires: W.ductWires.length, rivals: W.enemies.filter(e => e.rival && !e.dead).length, first: W.ductNets && W.ductNets[0] ? { a: W.ductNets[0].a, b: W.ductNets[0].b, tiles: W.ductNets[0].tiles } : null });
