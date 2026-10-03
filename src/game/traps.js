// Physics-driven traps. Gnaw a structural weak point and the world does the
// fighting: a frayed cable drops into a puddle and electrifies it, wooden
// pegs give out and a scaffold comes down in tumbling planks, a tie-off
// snaps and a pallet of bricks lands on whatever is underneath.
import * as THREE from 'three';
import { rand, keep, PI2 } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { Bx, Cy } from '../render/models.js';
import { metalTex, stoneTex, flameTex, waterTex } from '../render/textures.js';
import { boom, puff, spark, bolt, fx, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, T, G as GRAV, gi, inG, toG, toW, tAt, floorY, wallAdj, OPEN, DRY, N4, indexPlats } from '../world/grid.js';
import { hit, hurtP, addThreat } from '../combat/combat.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const wood = lam(0x8a6038, { map: stoneTex }), darkWood = lam(0x5a3e24, { map: stoneTex }), steel = lam(0x5a6068, { map: metalTex });
const brick = lam(0x9a4a34, { map: stoneTex }), cableMat = lam(0x141418), pegMat = lam(0xe0b060);
function mk(geo, mat, x, y, z, par = world) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  par.add(m);
  return m;
}
function glow(col, s, par, x, y, z, op = 0.8) {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
  g.scale.set(s, s, 1);
  g.position.set(x, y, z);
  par.add(g);
  return g;
}
const wallFace = (w, inset) => [toW(w.x) + w.dx * (T / 2 - inset), toW(w.y) + w.dy * (T / 2 - inset)];
/** Trap damage keeps pace with the run so traps stay worth setting deep in. */
const scaleDmg = d => d * (1 + 0.35 * (run.tier || 0) + 0.02 * (run.level || 1));

/** Crush everything in a radius (and the rat, if it's standing there). */
function crush(x, z, R, dmg, label) {
  const gy = floorY(x, z);
  let n = 0;
  for (const e of W.enemies) {
    if (e.dead || e.type === 'nest') continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d > R + e.r || e.y > gy + 3) continue;
    const big = e.boss ? Math.max(dmg * 0.6, e.maxHp * 0.05) : dmg;
    hit(e, big, Math.atan2(e.x - x, e.z - z), e.boss ? 4 : 12, 'trap');
    e.stun = Math.max(e.stun || 0, e.boss ? 1.4 : 1.6);
    e.slow = 2;
    n++;
  }
  if (Math.hypot(P.x - x, P.z - z) < R * 0.7 && P.y < gy + 2.5) hurtP(18, { x, z });
  boom(x, gy + 0.6, z, R * 1.8, 0xffd0a0);
  fx('ring', x, gy, z, R, 0xffd0a0, 0.45);
  puff(x, gy + 0.3, z, 0x8a7a6a, 26, 5);
  G.shake = Math.max(G.shake, 0.7);
  sfx('boom');
  if (n >= 3) dnum(x, gy + 2.5, z, `${label} ×${n}`, 'crit');
}

// ---------- falling pieces ----------
/** Loose rigid bodies: planks and loads that fall, tumble, crush once and settle. */
function drop(m, o = {}) {
  W.falling.push({ m, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, sx: o.sx ?? rand(-4, 4), sz: o.sz ?? rand(-4, 4), crush: o.crush || null, rest: false, bounced: 0 });
}
function tickFalling(dt) {
  for (const f of W.falling) {
    if (f.rest) continue;
    const m = f.m;
    f.vy -= GRAV * dt;
    m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt;
    m.rotation.x += f.sx * dt; m.rotation.z += f.sz * dt;
    const gy = floorY(m.position.x, m.position.z) + 0.1;
    if (m.position.y > gy) continue;
    m.position.y = gy;
    if (f.crush) { const c = f.crush; f.crush = null; crush(m.position.x, m.position.z, c.R, c.dmg, c.label); if (c.after) c.after(m.position.x, m.position.z); }
    if (f.bounced++ > 1 || Math.abs(f.vy) < 3) {
      f.rest = true;
      // Settle flat-ish: planks and bricks come to rest lying down.
      m.rotation.x = Math.round(m.rotation.x / PI2) * PI2 * 0.15 + rand(-0.15, 0.15);
      m.rotation.z = rand(-0.2, 0.2);
    } else { f.vy *= -0.3; f.vx *= 0.5; f.vz *= 0.5; f.sx *= 0.5; f.sz *= 0.5; }
  }
  keep(W.falling, f => !f.rest || f.keep);
}

// ---------- electrified water ----------
function electrify(x, z, R, tiles, secs = 8) {
  W.shocks.push({ x, z, R, tiles, t: secs, tick: 0 });
  sfx('zap');
  boom(x, floorY(x, z) + 0.3, z, R * 1.2, 0x9ad0ff);
  G.shake = Math.max(G.shake, 0.35);
  addThreat(0.1);
}
/** Water tiles (sewer channels) connected to the drop point, within reach. */
function waterAround(gx, gz, max = 28) {
  const seen = new Set(), q = [[gx, gz]], out = [];
  while (q.length && out.length < max) {
    const [x, z] = q.shift(), k = gi(x, z);
    if (!inG(x, z) || seen.has(k) || tAt(x, z) !== 2 || Math.abs(x - gx) > 4 || Math.abs(z - gz) > 4) continue;
    seen.add(k);
    out.push(k);
    for (const [dx, dz] of N4) q.push([x + dx, z + dz]);
  }
  return new Set(out);
}
const inShock = (s, x, z) => s.tiles ? s.tiles.has(gi(toG(x), toG(z))) : Math.hypot(x - s.x, z - s.z) < s.R;
function tickShocks(dt) {
  for (const s of W.shocks) {
    s.t -= dt;
    s.tick -= dt;
    if (s.glow) s.glow.material.opacity = 0.3 + 0.3 * Math.random();
    if (s.tick > 0) continue;
    s.tick = 0.35;
    // Crackles across the surface.
    const pts = s.tiles ? [...s.tiles].slice(0, 12).map(k => [toW(k % M.W) + rand(-1.5, 1.5), toW((k / M.W) | 0) + rand(-1.5, 1.5)]) : [0, 1, 2, 3].map(() => { const a = rand(0, 6.3), r = rand(0, s.R); return [s.x + Math.sin(a) * r, s.z + Math.cos(a) * r]; });
    if (pts.length > 1) { const a = pts[(Math.random() * pts.length) | 0], b = pts[(Math.random() * pts.length) | 0]; const y = floorY(a[0], a[1]) + 0.15; bolt([[a[0], y, a[1]], [b[0], y, b[1]]]); }
    for (const e of W.enemies) {
      if (e.dead || e.fly || e.type === 'nest' || e.y > floorY(e.x, e.z) + 0.6 || !inShock(s, e.x, e.z)) continue;
      hit(e, scaleDmg(e.boss ? 14 : 24), null, 0, 'trap', true);
      e.slow = 0.6;
      if (!e.boss) e.stun = Math.max(e.stun || 0, 0.3);
      if (Math.random() < 0.3) spark(e.x, e.y + 0.4, e.z, 0.8, 0x9ad0ff);
    }
    if (P.onGround && P.y < floorY(P.x, P.z) + 0.3 && inShock(s, P.x, P.z)) { hurtP(7, null, true); spark(P.x, P.y + 0.4, P.z, 1, 0x9ad0ff); }
  }
  for (const s of W.shocks) if (s.t <= 0 && s.glow) { bury(s.glow); s.glow = null; }
  keep(W.shocks, s => s.t > 0);
}

// ---------- builders ----------
const cableCurve = (a, b, sag) => new THREE.QuadraticBezierCurve3(a, new THREE.Vector3((a.x + b.x) / 2, Math.min(a.y, b.y) - sag, (a.z + b.z) / 2), b);
function addCable(w, sewer) {
  const [px, pz] = wallFace(w, 0.25), ox = toW(w.x), oz = toW(w.y);
  // Puddle (city) or channel water (sewer) the cable hangs over.
  // City puddles sit a tile out from the wall, so the gnaw point at the base stays dry.
  const cx = sewer ? ox : ox - w.dx * 2.6, cz = sewer ? oz : oz - w.dy * 2.6, gy = floorY(cx, cz);
  const g = new THREE.Group();
  world.add(g);
  const top = sewer ? 3.2 : 5;
  if (sewer) mk(Bx(0.7, 0.7, 0.3), steel, px, top, pz, g);
  else { mk(Cy(0.12, 0.16, top + 0.3, 6), darkWood, px, (top + 0.3) / 2, pz, g); mk(Bx(1.4, 0.12, 0.12), darkWood, px, top, pz, g).rotation.y = Math.atan2(w.dx, w.dy); }
  const a = new THREE.Vector3(px - w.dx * 0.2, top, pz - w.dy * 0.2), end = new THREE.Vector3(cx, gy + 2.1, cz);
  const hang = new THREE.Mesh(new THREE.TubeGeometry(cableCurve(a, end, 0.6), 10, 0.05, 4), cableMat);
  g.add(hang);
  const spk = glow(0x9ad0ff, 0.9, g, cx, gy + 2.05, cz, 0.9);
  let puddle = null;
  if (!sewer) {
    puddle = mk(new THREE.CircleGeometry(2.3, 14).rotateX(-PI2), new THREE.MeshLambertMaterial({ map: waterTex, color: 0x5a7a9a, transparent: true, opacity: 0.8, emissive: 0x0a1420 }), cx, gy + 0.03, cz, g);
    puddle.castShadow = false;
  }
  const bx = toW(w.x) + w.dx * 1.2, bz = toW(w.y) + w.dy * 1.2; // gnaw at the base, by the wall
  W.traps.push({ kind: 'cable', sewer, gx: bx, gy: floorY(bx, bz), gz: bz, cx, cz, a, end, g, hang, spk, time: 1, sprung: false, label: sewer ? 'Gnaw the frayed conduit — drop it in the water' : 'Gnaw the frayed cable — drop it in the puddle' });
}
function addScaffold(w) {
  const [fx0, fz0] = wallFace(w, 0), ax = -w.dx, az = -w.dy; // out from the wall
  const lx = Math.abs(w.dx) ? 0 : 1, lz = Math.abs(w.dx) ? 1 : 0; // along the wall
  const depth = 1.7, len = 3.6, cx = fx0 + ax * depth / 2, cz = fz0 + az * depth / 2;
  const parts = [], plats = [];
  for (const s of [-1, 1]) for (const o of [0.15, depth - 0.15]) {
    const px = fx0 + ax * o + lx * s * len / 2, pz = fz0 + az * o + lz * s * len / 2;
    parts.push(mk(Bx(0.16, 4.7, 0.16), darkWood, px, 2.35, pz));
  }
  for (const y of [2.2, 4.4]) {
    const deck = mk(Bx(lx ? len : depth, 0.14, lz ? len : depth), wood, cx, y, cz);
    parts.push(deck);
    const p = { x: cx, z: cz, w: lx ? len : depth, d: lz ? len : depth, y: y + 0.07, th: 0.14, thin: true, scaffold: true };
    W.plats.push(p);
    plats.push(p);
  }
  // Diagonal braces and the pegs that hold it all up.
  const br = mk(Bx(0.08, 2.6, 0.08), darkWood, cx + ax * (depth / 2 - 0.1), 1.1, cz + az * (depth / 2 - 0.1));
  br.rotation.set(lx ? 0 : 0.8, 0, lx ? 0.8 : 0);
  parts.push(br);
  const pegs = [-1, 1].map(s => mk(Cy(0.07, 0.07, 0.4, 5), pegMat, fx0 + ax * (depth - 0.05) + lx * s * len / 2, 0.35, fz0 + az * (depth - 0.05) + lz * s * len / 2));
  pegs.forEach(p => { p.rotation.set(lx ? PI2 : 0, 0, lz ? PI2 : 0); });
  parts.push(...pegs);
  const gx = fx0 + ax * (depth + 0.6), gz = fz0 + az * (depth + 0.6);
  W.traps.push({ kind: 'scaffold', gx, gy: floorY(gx, gz), gz, cx: cx + ax * 1.2, cz: cz + az * 1.2, ax, az, parts, plats, time: 1.2, sprung: false, label: 'Gnaw the scaffold pegs — bring it all down' });
}
function addDebris(w) {
  const [fx0, fz0] = wallFace(w, 0), ax = -w.dx, az = -w.dy, h = Math.min(w.h, 9);
  const hx = fx0 + ax * 2.6, hz = fz0 + az * 2.6, hy = Math.max(4.6, h - 1.6);
  // Jib arm off the roof edge, chain, and a pallet of bricks.
  const arm = mk(Bx(Math.abs(ax) ? 2.8 : 0.2, 0.2, Math.abs(az) ? 2.8 : 0.2), steel, fx0 + ax * 1.4, h - 0.3, fz0 + az * 1.4);
  const chain = mk(Cy(0.03, 0.03, 1, 4), cableMat, hx, 0, hz);
  chain.scale.y = h - 0.3 - (hy + 0.9);
  chain.position.y = (h - 0.3 + hy + 0.9) / 2;
  const load = new THREE.Group();
  mk(Bx(1.7, 0.16, 1.3), wood, 0, 0, 0, load);
  mk(Bx(1.5, 0.9, 1.1), brick, 0, 0.53, 0, load);
  load.position.set(hx, hy, hz);
  world.add(load);
  const mark = mk(new THREE.RingGeometry(2.6, 2.8, 20).rotateX(-PI2), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.18, depthWrite: false }), hx, floorY(hx, hz) + 0.05, hz);
  mark.castShadow = false;
  const post = mk(Bx(0.25, 1.4, 0.25), darkWood, fx0 + ax * 0.3 + (Math.abs(ax) ? 0 : 1.6), 0.7, fz0 + az * 0.3 + (Math.abs(az) ? 0 : 1.6));
  const gx = post.position.x + ax * 0.9, gz = post.position.z + az * 0.9;
  W.traps.push({ kind: 'debris', gx, gy: floorY(gx, gz), gz, hx, hz, arm, chain, load, mark, post, time: 0.9, sprung: false, label: 'Gnaw the tie-off — drop the load' });
}

// ---------- springing ----------
export function springTrap(t) {
  t.sprung = true;
  const S = scaleDmg;
  if (t.kind === 'cable') {
    // The frayed end whips down into the water a beat later.
    bury(t.hang);
    const down = new THREE.Vector3(t.cx, floorY(t.cx, t.cz) + 0.05, t.cz);
    t.g.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve(t.a, down, 0.2), 10, 0.05, 4), cableMat));
    t.spk.position.copy(down);
    spark(t.gx, t.gy + 0.6, t.gz, 1.2, 0x9ad0ff);
    setTimeout(() => {
      if (!W.traps.includes(t)) return;
      const tiles = t.sewer ? waterAround(toG(t.cx), toG(t.cz)) : null;
      electrify(t.cx, t.cz, 2.4, tiles && tiles.size ? tiles : null, 9);
      const s = W.shocks[W.shocks.length - 1];
      if (!t.sewer) { s.glow = glow(0x9ad0ff, 5, world, t.cx, floorY(t.cx, t.cz) + 0.2, t.cz, 0.5); }
    }, 450);
  } else if (t.kind === 'scaffold') {
    sfx('door');
    puff(t.gx, 0.4, t.gz, 0x8a6038, 10, 3);
    // Creak, then everything goes.
    setTimeout(() => {
      if (!W.traps.includes(t)) return;
      keep(W.plats, p => !t.plats.includes(p));
      indexPlats();
      t.parts.forEach((m, i) => drop(m, { vx: t.ax * rand(2, 5), vz: t.az * rand(2, 5), vy: rand(0, 2), crush: i === 4 ? { R: 3.2, dmg: S(160), label: 'Scaffold' } : null }));
      // Anyone standing on the decks goes down with it.
      for (const e of W.enemies) if (!e.dead && !e.fly && e.y > 1.5 && Math.hypot(e.x - t.cx, e.z - t.cz) < 3) { e.vy = 0; hit(e, S(60), null, 0, 'trap'); }
    }, 500);
  } else if (t.kind === 'debris') {
    bury(t.post);
    bury(t.chain);
    bury(t.mark);
    puff(t.gx, 0.8, t.gz, 0x8a6038, 8, 2);
    drop(t.load, { sx: rand(-1, 1), sz: rand(-1, 1), crush: { R: 3, dmg: S(220), label: 'Crushed', after: rubble } });
  }
}
/** Fallen bricks leave a low heap you can hop on or hide behind. */
function rubble(x, z) {
  const m = mk(Bx(1.8, 0.55, 1.4), brick, x, floorY(x, z) + 0.27, z);
  m.rotation.y = rand(0, 3);
  W.plats.push({ x, z, w: 1.6, d: 1.3, y: floorY(x, z) + 0.55, th: 0.55, mesh: m });
  indexPlats();
}

/** Gnaw point in reach of the rat, for chewTarget(). */
export function trapTarget() {
  for (const t of W.traps) if (!t.sprung && Math.hypot(t.gx - P.x, t.gz - P.z) < 1.9 && Math.abs(P.y - t.gy) < 1.5) return t;
  return null;
}
/** The old live-wire boxes now also electrify any water they're next to. */
export function wireIntoWater(x, z) {
  const gx = toG(x), gz = toG(z);
  for (const t of W.traps) if (t.kind === 'cable' && !t.sewer && Math.hypot(t.cx - x, t.cz - z) < 7) { electrify(t.cx, t.cz, 2.4, null, 5); return; }
  for (let r = 0; r <= 2; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (tAt(gx + dx, gz + dz) !== 2) continue;
    const tiles = waterAround(gx + dx, gz + dz, 16);
    if (tiles.size) { electrify(toW(gx + dx), toW(gz + dz), 2, tiles, 5); return; }
  }
}

export function tickTraps(dt) {
  tickFalling(dt);
  tickShocks(dt);
  for (const t of W.traps) if (t.kind === 'cable' && !t.sprung && Math.random() < dt * 3) spark(t.end.x, t.end.y, t.end.z, 0.5, 0x9ad0ff);
}

// ---------- placement ----------
/**
 * Set traps where they matter: along predator patrol routes first, then
 * busy rooms. City: cables over puddles, scaffolds and brick pallets on tall
 * walls. Sewer: conduits over the channels and wooden shoring.
 */
export function placeTraps(rooms, startRoom) {
  const city = M.kind === 'city';
  const onPath = new Set();
  for (const e of W.enemies) if (e.pred && e.path) for (const k of e.path) onPath.add(k);
  const cands = [];
  for (const r of rooms) {
    if (r === startRoom) continue;
    for (const w of wallAdj(r)) {
      if (w.t !== 0) continue;
      const k = gi(w.x, w.y), tile = tAt(w.x, w.y);
      cands.push({ w, score: (onPath.has(k) ? 10 : 0) + Math.random() * 4, water: tile === 2, dry: DRY(tile) && OPEN(tAt(w.x - w.dx, w.y - w.dy)) });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const used = [];
  const free = (w, R = 12) => {
    const x = toW(w.x), z = toW(w.y);
    if (used.some(u => Math.hypot(u[0] - x, u[1] - z) < R)) return false;
    // Keep clear of props already standing there.
    if (W.plats.some(p => !p.thin && Math.abs(p.x - (x - w.dx * 0.8)) < p.w / 2 + 1.4 && Math.abs(p.z - (z - w.dy * 0.8)) < p.d / 2 + 1.4)) return false;
    used.push([x, z]);
    return true;
  };
  const take = (n, ok, build) => { let c = 0; for (const cd of cands) { if (c >= n) break; if (!cd.taken && ok(cd) && free(cd.w)) { cd.taken = true; build(cd.w); c++; } } };
  if (city) {
    take(4, c => c.dry, w => addCable(w, false));
    // Alternate, so tall walls are shared between scaffolds and brick pallets.
    for (let i = 0; i < 3; i++) { take(1, c => c.dry && c.w.h >= 6, addDebris); take(1, c => c.dry && c.w.h >= 6, addScaffold); }
    // Low-rise districts: settle for shorter walls rather than no climbing traps at all.
    if (!W.traps.some(t => t.kind === 'scaffold')) take(1, c => c.dry && c.w.h >= 4.4, addScaffold);
    if (!W.traps.some(t => t.kind === 'debris')) take(1, c => c.dry && c.w.h >= 4.4, addDebris);
  } else {
    take(3, c => c.water, w => addCable(w, true));
    take(2, c => c.dry && c.w.h >= 4.4, addScaffold);
  }
  indexPlats();
}
export const trapCount = () => ({ n: W.traps.length, kinds: W.traps.map(t => t.kind), shocks: W.shocks.length, falling: W.falling.length });
