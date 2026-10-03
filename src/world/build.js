// Turns a generated tile map into meshes and fills it with props, loot,
// nests, predators, hazards and exits — for both the city and the sewer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, TAU, PI2, rr, ri, shuffleR, rng } from '../core/util.js';
import { G, W, run } from '../core/state.js';
import { scene, world, hemi, sun, lantern, lampL, buried } from '../render/renderer.js';
import {
  furTex, stoneTex, flameTex, metalTex, dryTex, plywoodTex, waterTex, acidTex, crackTex, arrowTex, texFor,
  asphaltTex, sidewalkTex, grassTex, roofTex, facade, glassTex, secretTex, graffitiTex,
} from '../render/textures.js';
import { Sp, Bx, Cy, Co } from '../render/models.js';
import { clearDecals, ringGeo, discGeo } from '../fx/fx.js';
import { flasks } from '../combat/arsenal.js';
import { M, T, DUCT_TOP, gi, inG, tAt, toW, floorY, topAt, roomTiles, wallAdj, bfs, descend, OPEN, DRY, N4, indexPlats } from './grid.js';
import { populateDucts, applyCutaway } from './ducts.js';
import * as TEX from '../render/textures.js';
const SHARED_TEX = new Set(Object.values(TEX).filter(v => v && v.isTexture));
import { curD, isSewer } from '../data/world.js';
import { OBJ } from '../data/props.js';
import { FUNGI } from '../data/fungi.js';
import { placeTraps } from '../game/traps.js';
import { addPred } from '../entities/mobs.js';
import { buildSetPieces } from './setpieces.js';

export const tileMesh = {};
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const waterMat = new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.78, emissive: 0x0a2018 });
const acidMat = new THREE.MeshBasicMaterial({ map: acidTex, transparent: true, opacity: 0.85 });
export const pitMat = new THREE.MeshBasicMaterial({ color: 0x030202 });

export function mkMesh(geo, mat, x, y, z, par = world) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  par.add(m);
  return m;
}
export function glowSprite(col, s, par, x = 0, y = 0, z = 0, op = 0.8) {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
  g.scale.set(s, s, 1);
  g.position.set(x, y, z);
  par.add(g);
  return g;
}
/** Solid box that bodies collide with and can stand on. `base` lifts it (rooftop clutter). */
export function staticBox(x, z, w, d, h, mat, base = 0) {
  const m = mkMesh(new THREE.BoxGeometry(w, h, d), mat, x, base + h / 2, z);
  const p = { x, z, w, d, y: base + h, th: h, mesh: m };
  W.plats.push(p);
  return p;
}

/** Scale a box's UVs so textures tile per world unit instead of stretching. */
function uvScale(g, u, v) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * u); uv.setY(i, uv.getY(i) * v); }
  return g;
}

// ---------- terrain ----------
export function buildWorld() {
  // Free the last district's GPU resources: geometries, materials, and every texture
  // made for it (facades, signs). Shared module textures stay. (Leak found by the playtest bots.)
  const free = o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      for (const k of ['map', 'emissiveMap']) if (m[k] && !SHARED_TEX.has(m[k])) m[k].dispose();
      m.dispose();
    }
  };
  world.traverse(free);
  for (const o of buried) o.traverse(free); // pieces removed during the district (see bury)
  buried.length = 0;
  world.clear();
  for (const k in tileMesh) delete tileMesh[k];
  const D = curD(), city = M.kind === 'city';
  const floorTex = city ? sidewalkTex : texFor('f', D), brickTex = texFor('b', D);
  const doorMat = lam(0x5a3a2a, { map: metalTex }), inner = [];
  const fl = [], road = [], grass = [], bed = [], wat = [], acd = [], met = [], roofs = [], fence = [];
  const walls = new Map(); // material key -> geometries
  const pushWall = (key, g) => { if (!walls.has(key)) walls.set(key, []); walls.get(key).push(g); };

  // Building ids (same-height connected solids) so each building gets one facade.
  const bid = new Int32Array(M.W * M.H).fill(-1);
  if (city) {
    let n = 0;
    for (let k = 0; k < bid.length; k++) {
      const t = M.grid[k] === 11 ? 0 : M.grid[k];
      if ((t !== 0 && t !== 6) || bid[k] >= 0) continue;
      const h = M.hgt[k], q = [k];
      bid[k] = n;
      while (q.length) {
        const c = q.pop(), x = c % M.W, y = (c / M.W) | 0;
        for (const [dx, dy] of N4) {
          if (!inG(x + dx, y + dy)) continue;
          const j = gi(x + dx, y + dy);
          if (bid[j] < 0 && (M.grid[j] === 11 ? 0 : M.grid[j]) === t && M.hgt[j] === h) { bid[j] = n; q.push(j); }
        }
      }
      n++;
    }
  }

  for (let gz = 0; gz < M.H; gz++) for (let gx = 0; gx < M.W; gx++) {
    const k = gi(gx, gz), t = M.grid[k], cx = toW(gx), cz = toW(gz), h = M.hgt[k];
    if (t === 1 && M.inside[k]) inner.push(new THREE.BoxGeometry(T, 1, T).translate(cx, -0.5, cz));
    else if (t === 1 || t === 3 || t === 5 || t === 8) fl.push(new THREE.BoxGeometry(T, 1, T).translate(cx, -0.5, cz));
    if (t === 10) road.push(new THREE.BoxGeometry(T, 1, T).translate(cx, -0.5, cz));
    if (t === 9) grass.push(new THREE.BoxGeometry(T, 1, T).translate(cx, -0.5, cz));
    if (t === 2 || t === 4) {
      bed.push(new THREE.BoxGeometry(T, 1, T).translate(cx, -1.4, cz));
      (t === 2 ? wat : acd).push(new THREE.PlaneGeometry(T, T).rotateX(-PI2).translate(cx, -0.35, cz));
    }
    if (t === 0 || t === 6) {
      // Only faces that can be seen: a neighbour must be lower than this top.
      const exposed = N4.some(([dx, dy]) => { const n = tAt(gx + dx, gz + dy); return (n !== 0 && n !== 6) || topAt(gx + dx, gz + dy) < h - 0.01; });
      if (exposed) {
        const g = uvScale(new THREE.BoxGeometry(T, h + 1, T), 1, (h + 1) / (city ? 4 : 3.2)).translate(cx, (h - 1) / 2, cz);
        if (t === 6) (city ? pushWall('glass', g) : met.push(g));
        else pushWall(city ? 'f' + (bid[k] % 4) : 'brick', g);
      }
      if (city) roofs.push(new THREE.PlaneGeometry(T, T).rotateX(-PI2).translate(cx, h + 0.01, cz));
    }
    if (t === 3) {
      const hh = h, sec = M.secret[k];
      const m = new THREE.Mesh(uvScale(new THREE.BoxGeometry(T, hh + 1, T), 1, (hh + 1) / (sec ? 3.2 : 4)).translate(0, (hh - 1) / 2, 0), sec === 2 ? doorMat : lam(0xffffff, { map: sec ? secretTex(city ? D.palette[0] : D.brick) : city ? plywoodTex : dryTex }));
      m.position.set(cx, 0, cz);
      m.castShadow = m.receiveShadow = true;
      world.add(m);
      tileMesh[k] = m;
    }
    if (t === 5) {
      const g = new THREE.Group(), alongX = OPEN(tAt(gx - 1, gz)) || tAt(gx - 1, gz) === 5, wm = lam(0xffffff, { map: brickTex }), s = (T - 0.7) / 2;
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(alongX ? new THREE.BoxGeometry(T, h + 1, s) : new THREE.BoxGeometry(s, h + 1, T), wm);
        m.position.set(alongX ? 0 : side * (s / 2 + 0.35), (h - 1) / 2, alongX ? side * (s / 2 + 0.35) : 0);
        m.castShadow = true;
        g.add(m);
      }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(T, 0.5, T), wm);
      cap.position.y = h - 0.25;
      g.add(cap);
      g.position.set(cx, 0, cz);
      world.add(g);
    }
    // Squeeze Network crawlspace: open floor under the building's mass.
    if (t === 11) {
      fl.push(new THREE.BoxGeometry(T, 1, T).translate(cx, -0.5, cz));
      const hh = h - DUCT_TOP;
      pushWall(city ? 'f' + (bid[k] % 4) : 'brick', uvScale(new THREE.BoxGeometry(T, hh, T), 1, hh / (city ? 4 : 3.2)).translate(cx, DUCT_TOP + hh / 2, cz));
      if (city) roofs.push(new THREE.PlaneGeometry(T, T).rotateX(-PI2).translate(cx, h + 0.01, cz));
    }
    // Yard hedges: low enough to jump onto, solid to the horde's path-finding.
    if (t === 8) fence.push(uvScale(new THREE.BoxGeometry(T, h, T), 1.5, 0.7).translate(cx, h / 2, cz));
  }
  const add = (arr, mat, cast, floor) => {
    if (!arr.length) return null;
    const m = new THREE.Mesh(mergeGeometries(arr), mat);
    m.receiveShadow = true;
    m.castShadow = !!cast;
    m.userData.floor = !!floor; // floors and water are never cut away
    world.add(m);
    return m;
  };
  add(fl, lam(0xffffff, { map: floorTex }), false, true);
  add(road, lam(0xffffff, { map: asphaltTex }), false, true);
  add(inner, lam(0xc8a878, { map: plywoodTex }), false, true);
  add(grass, lam(0xffffff, { map: grassTex }), false, true);
  add(bed, lam(0x2a3a30), false, true);
  add(wat, waterMat, false, true);
  add(acd, acidMat, false, true);
  add(met, lam(0xffffff, { map: metalTex }), true);
  add(roofs, lam(0xffffff, { map: roofTex }));
  add(fence, lam(0x3e6a30, { map: furTex, emissive: 0x0a140a }), true);
  for (const [key, arr] of walls) {
    let mat;
    if (key === 'brick') mat = lam(0xffffff, { map: brickTex });
    else if (key === 'glass') mat = new THREE.MeshLambertMaterial({ map: glassTex, emissive: 0x2a3848, emissiveIntensity: 0.6 });
    else {
      const i = +key.slice(1), [map, em] = facade(D.palette[i % D.palette.length], i);
      mat = new THREE.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.9 });
    }
    add(arr, mat, true);
  }
  clearDecals();
}

// ---------- props ----------
export function addObj(kind, x, z, y) {
  const O = OBJ[kind], o = { kind, x, z, w: O.w, d: O.d, th: O.h, mass: O.mass, vy: 0, carried: false };
  let g;
  if (kind === 'swab') {
    g = new THREE.Group();
    mkMesh(Cy(0.08, 0.08, 4.2, 5), lam(0xf0ece0), 0, 0, 0, g).rotation.x = PI2;
    for (const s of [-1, 1]) mkMesh(Sp(0.28, 6, 4), lam(0xfaf8f0, { map: furTex }), 0, 0, s * 2.2, g).scale.set(1, 0.8, 1.3);
  } else if (kind === 'cap') {
    g = new THREE.Group();
    mkMesh(Cy(0.6, 0.6, 0.35, 12), lam(O.col, { map: stoneTex }), 0, 0, 0, g);
    mkMesh(Cy(0.4, 0.4, 0.02, 10), lam(0xf0e0d0), 0, 0.18, 0, g);
  } else if (kind === 'sponge') {
    g = new THREE.Group();
    mkMesh(Bx(1.4, 0.6, 1.4), lam(O.col, { map: stoneTex }), 0, 0.15, 0, g);
    mkMesh(Bx(1.4, 0.3, 1.4), lam(0x3a8a4a, { map: stoneTex }), 0, -0.3, 0, g);
  } else if (kind === 'can') {
    g = new THREE.Group();
    mkMesh(Cy(0.6, 0.6, 0.9, 10), lam(O.col, { map: metalTex }), 0, 0, 0, g);
    mkMesh(Cy(0.62, 0.62, 0.12, 10), lam(0xc05030), 0, 0.3, 0, g);
  } else if (kind === 'bin') {
    g = new THREE.Group();
    mkMesh(Cy(0.6, 0.5, 1.3, 10), lam(O.col, { map: metalTex }), 0, 0, 0, g);
    mkMesh(Cy(0.66, 0.66, 0.12, 10), lam(0x4a5a4a, { map: metalTex }), 0, 0.68, 0, g);
  } else {
    g = new THREE.Group();
    const wm = lam(O.col, { map: stoneTex });
    mkMesh(Bx(1.3, 1.2, 1.3), wm, 0, 0, 0, g);
    mkMesh(Bx(1.34, 0.12, 1.34), lam(0x5a3e26), 0, 0.4, 0, g);
    mkMesh(Bx(1.34, 0.12, 1.34), lam(0x5a3e26), 0, -0.4, 0, g);
  }
  world.add(g);
  o.mesh = g;
  o.y = (y ?? floorY(x, z)) + o.th;
  o.dyn = true;
  W.plats.push(o);
  W.objs.push(o);
  syncObj(o);
  return o;
}
export function syncObj(o) {
  o.mesh.position.set(o.x, o.y - o.th / 2, o.z);
  o.mesh.rotation.y = o.kind === 'swab' && o.w > o.d ? PI2 : 0;
}

/** Chests hold items; cursed chests (red) hold cursed loot. Sewer chests are premium. */
export function addChest(x, y, z, premium = false, cursed = false) {
  const g = new THREE.Group(), w = lam(cursed ? 0x3a1414 : 0x6a4424, { map: stoneTex }), b = lam(cursed ? 0xc02a2a : premium ? 0xb070ff : 0xd9a441, { emissive: cursed ? 0x3a0808 : 0x3a2a08 });
  mkMesh(Bx(1, 0.6, 0.7), w, 0, 0.3, 0, g);
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, -0.35);
  mkMesh(Bx(1.02, 0.25, 0.72), w, 0, 0.12, 0.35, lid);
  g.add(lid);
  mkMesh(Bx(1.05, 0.1, 0.74), b, 0, 0.5, 0, g);
  mkMesh(Bx(0.16, 0.2, 0.1), b, 0, 0.45, 0.37, g);
  glowSprite(cursed ? 0xff2a2a : premium ? 0xb070ff : 0xffc060, 1.6, g, 0, 0.8, 0, 0.5);
  g.position.set(x, y, z);
  g.rotation.y = rand(0, TAU);
  world.add(g);
  W.chests.push({ x, y, z, g, lid, open: false, premium, cursed });
}
export function addCache(x, y, z) {
  const g = new THREE.Group(), fm = lam(0xe8b84a, { emissive: 0x4a3000 });
  mkMesh(Cy(0.45, 0.45, 0.35, 10), fm, 0, 0.2, 0, g);
  mkMesh(Cy(0.3, 0.3, 0.3, 10), fm, 0.2, 0.5, 0.1, g);
  glowSprite(0xffe070, 1.2, g, 0, 0.4, 0, 0.35);
  g.position.set(x, y, z);
  world.add(g);
  W.caches.push({ x, y, z, g, taken: false });
}
export function addBench(x, z, rot) {
  const g = new THREE.Group(), wd = lam(0x5a3e26, { map: stoneTex }), mt = lam(0x8a929a, { map: metalTex });
  mkMesh(Bx(2.2, 0.15, 1.1), wd, 0, 1, 0, g);
  for (const s of [-1, 1]) for (const t of [-1, 1]) mkMesh(Bx(0.12, 1, 0.12), wd, s * 0.95, 0.5, t * 0.45, g);
  mkMesh(Bx(0.4, 0.35, 0.3), mt, -0.6, 1.25, 0, g);
  mkMesh(Cy(0.18, 0.18, 0.2, 8), mt, 0.5, 1.2, 0.1, g);
  mkMesh(Bx(0.6, 0.4, 0.05), new THREE.MeshBasicMaterial({ color: 0x4aa3ff }), 0, 1.5, -0.4, g);
  glowSprite(0x4aa3ff, 2, g, 0, 1.6, 0, 0.5);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  world.add(g);
  W.benches.push({ x, z, g });
  W.plats.push({ x, z, w: 2, d: 1.1, y: 1.07, th: 1.07 });
}
const wallPos = (w, inset = 0.15) => [toW(w.x) + w.dx * (T / 2 - inset), toW(w.y) + w.dy * (T / 2 - inset)];
function addPipe(w) {
  const [x, z] = wallPos(w, 0.3), g = new THREE.Group();
  const m = mkMesh(Cy(0.7, 0.7, 0.6, 12), lam(0x5a6068, { map: metalTex }), 0, 0.75, 0, g);
  m.rotation.x = PI2;
  mkMesh(new THREE.CircleGeometry(0.55, 12), new THREE.MeshBasicMaterial({ color: 0x050404 }), 0, 0.75, 0.31, g);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(-w.dx, -w.dy);
  world.add(g);
  const p = { x: toW(w.x) - w.dx * 0.2, z: toW(w.y) - w.dy * 0.2, ex: toW(w.x) - w.dx * 1.4, ez: toW(w.y) - w.dy * 1.4, g, link: null };
  W.pipes.push(p);
  return p;
}
function addRope(r) {
  const tl = roomTiles(r).filter(([x, y]) => x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1);
  if (!tl.length) return;
  const [cx, cy] = tl[ri(0, tl.length - 1)], x = toW(cx), z = toW(cy);
  const beam = mkMesh(Cy(0.25, 0.25, r.w * T + 2, 8), lam(0x5a6068, { map: metalTex }), toW(r.x) + (r.w * T) / 2 - T / 2, 5, z);
  beam.rotation.z = PI2;
  const can = new THREE.Group();
  mkMesh(Cy(0.7, 0.7, 1, 10), lam(0x7a8a9a, { map: metalTex }), 0, 0, 0, can);
  mkMesh(Cy(0.72, 0.72, 0.14, 10), lam(0xc05030), 0, 0.35, 0, can);
  can.position.set(x, 3.6, z);
  world.add(can);
  const rope = mkMesh(Cy(0.03, 0.03, 1, 4), lam(0xc8b890), x, 4.3, z);
  rope.scale.y = 1.4;
  const wa = wallAdj(r);
  if (!wa.length) return;
  const w = wa[ri(0, wa.length - 1)], [px, pz] = wallPos(w, 0.5);
  const post = mkMesh(Bx(0.3, 2.2, 0.3), lam(0x7a5a3a, { map: stoneTex }), px, 1.1, pz);
  W.inter.push({ kind: 'rope', x: px, z: pz, post, can, rope, cx: x, cz: z, used: false, vy: 0, falling: false });
}
function addWire(w) {
  const [x, z] = wallPos(w, 0.2), g = new THREE.Group();
  mkMesh(Bx(0.8, 0.8, 0.3), lam(0x4a4e54, { map: metalTex }), 0, 1.8, 0, g);
  for (const s of [-1, 1]) mkMesh(Cy(0.04, 0.04, 1.6, 4), lam(s > 0 ? 0xd8342c : 0xf2b233), s * 0.2, 0.9, 0.1, g);
  const sp = glowSprite(0x9ad0ff, 1, g, 0, 1.3, 0.3, 0.9);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(-w.dx, -w.dy);
  world.add(g);
  W.inter.push({ kind: 'wire', x: toW(w.x), z: toW(w.y), wx: x, wz: z, g, sp, used: false, cd: 0 });
}
function addNest(x, z) {
  const g = new THREE.Group();
  mkMesh(Co(1.4, 1.5, 7), lam(0x3a2e24, { map: furTex }), 0, 0.75, 0, g);
  const bone = lam(0xcfc2a4);
  for (let i = 0; i < 9; i++) {
    const a = rand(0, TAU), r = rand(0.5, 1.1);
    const b = mkMesh(Cy(0.07, 0.07, rand(0.6, 1.1), 5), bone, Math.sin(a) * r, rand(0.2, 0.9), Math.cos(a) * r, g);
    b.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  }
  const core = mkMesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0xff3a20 }), 0, 1.3, 0, g);
  glowSprite(0xff3a20, 2.2, g, 0, 1.3, 0, 0.6);
  g.position.set(x, 0, z);
  world.add(g);
  const hp = 260 * (1 + run.tier * 0.5) * (isSewer() ? 1.5 : 1);
  W.enemies.push({ type: 'nest', x, y: 0, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp, r: 1.3, h: 1.8, heavy: true, mesh: g, core, spawnT: rand(1, 4), col: 0x3a2e24, blood: 0x5a1a10, flash: 0, slow: 0, bar: true, pT: 0, bT: 0, dT: 0, tT: 0, ward: 0 });
  run.nests++;
}
function addZone(type, x, z) {
  const g = new THREE.Group();
  g.position.set(x, floorY(x, z) + 0.05, z);
  world.add(g);
  const zn = { type, x, z, g, t: rand(3, 8), mt: rand(20, 32) };
  if (type === 'vent') {
    zn.r = 3.2; zn.a = rand(0, TAU); zn.up = Math.random() < 0.35;
    mkMesh(Cy(1.4, 1.4, 0.1, 10), lam(0x3a3e44, { map: metalTex }), 0, 0, 0, g);
    zn.arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, color: zn.up ? 0xc8f0ff : 0x9ad0ff }));
    zn.arrow.rotation.x = -PI2;
    zn.arrow.position.y = 0.12;
    g.add(zn.arrow);
  }
  if (type === 'grav') {
    zn.r = 5.5; zn.low = Math.random() < 0.5;
    zn.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    zn.ring.rotation.x = -PI2; zn.ring.scale.setScalar(zn.r); g.add(zn.ring);
    zn.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false }));
    zn.disc.rotation.x = -PI2; zn.disc.scale.setScalar(zn.r); g.add(zn.disc);
  }
  if (type === 'decay') {
    zn.r = 4.5; zn.vx = rand(-1, 1); zn.vz = rand(-1, 1); zn.tick = 0; zn.fog = [];
    for (let i = 0; i < 4; i++) zn.fog.push(glowSprite(0x7ab020, rand(4, 6), g, rand(-1.5, 1.5), rand(0.6, 1.6), rand(-1.5, 1.5), 0.35));
  }
  if (type === 'dark') {
    // Zero-visibility pocket: the light dies as you enter. Marked by a faint violet rim.
    zn.r = 7.5;
    const rim = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x6a3a9a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    rim.rotation.x = -PI2; rim.scale.setScalar(zn.r); g.add(rim);
  }
  W.zones.push(zn);
  return zn;
}
function addValve(x, z, i) {
  const g = new THREE.Group();
  mkMesh(Cy(0.18, 0.18, 1.4, 6), lam(0x5a6068, { map: metalTex }), 0, 0.7, 0, g);
  const wh = mkMesh(new THREE.TorusGeometry(0.55, 0.1, 5, 12), lam(0xd8342c), 0, 1.45, 0, g);
  const gl = glowSprite(0xff4a2a, 2.2, g, 0, 1.45, 0, 0.6);
  g.position.set(x, floorY(x, z), z);
  world.add(g);
  W.valves.push({ x, z, g, wh, gl, done: false, i });
}
/** Exit portal: 'road' (next neighbourhood), 'ladder' (sewer → streets), 'drain' (trial finish). */
export function addExit(x, z, kind = 'drain') {
  const g = new THREE.Group();
  const col = kind === 'drain' ? 0xff4a2a : 0x6ad06a;
  if (kind === 'ladder') {
    for (const s of [-1, 1]) mkMesh(Bx(0.15, 7, 0.15), lam(0x8a929a, { map: metalTex }), s * 0.6, 3.5, 0, g);
    for (let i = 0; i < 12; i++) mkMesh(Bx(1.2, 0.08, 0.1), lam(0x8a929a, { map: metalTex }), 0, 0.5 + i * 0.55, 0, g);
  } else {
    const fr = mkMesh(new THREE.TorusGeometry(1.6, 0.28, 6, 20), lam(0x3a3640, { map: metalTex }), 0, 0.05, 0, g);
    fr.rotation.x = PI2;
    mkMesh(new THREE.CircleGeometry(1.45, 20), new THREE.MeshBasicMaterial({ color: 0x050304 }), 0, 0.04, 0, g).rotation.x = -PI2;
  }
  const beam = new THREE.Mesh(Cy(1.5, 1.5, 16, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 8;
  g.add(beam);
  g.position.set(x, floorY(x, z), z);
  world.add(g);
  G.exitD = { x, z, g, beam, kind };
}
/** The manhole down into the sewer. Locked until you carry a sewer key. */
function addManhole(x, z) {
  const g = new THREE.Group();
  const lid = mkMesh(Cy(1.5, 1.5, 0.12, 16), lam(0x4a4a50, { map: metalTex }), 0, 0.06, 0, g);
  for (let i = 0; i < 4; i++) mkMesh(Bx(2.4, 0.03, 0.12), lam(0x2a2a30), 0, 0.13, -0.9 + i * 0.6, g);
  const beam = new THREE.Mesh(Cy(1.5, 1.5, 16, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 8;
  g.add(beam);
  const glow = glowSprite(0xb070ff, 3, g, 0, 0.5, 0, 0.5);
  g.position.set(x, 0, z);
  world.add(g);
  G.manhole = { x, z, g, lid, beam, glow };
}

// ---------- city furniture ----------
function streetLamps(spots) {
  const poles = [], heads = [], mt = lam(0x2a2c30, { map: metalTex });
  const col = curD().lamp;
  for (const s of spots) {
    const x = toW(s.gx) + s.dx * (T / 2 - 0.4), z = toW(s.gy) + s.dy * (T / 2 - 0.4);
    poles.push(new THREE.CylinderGeometry(0.1, 0.14, 5.4, 6).translate(x, 2.7, z));
    heads.push(new THREE.BoxGeometry(0.5, 0.18, 0.9).translate(x + s.dx * 0.4, 5.4, z + s.dy * 0.4));
    glowSprite(col, 2.6, world, x + s.dx * 0.4, 5.2, z + s.dy * 0.4, 0.8);
    W.lamps.push({ x: x + s.dx * 0.4, z: z + s.dy * 0.4, y: 5 });
    W.plats.push({ x, z, w: 0.3, d: 0.3, y: 5.4, th: 5.4, pole: true });
  }
  if (poles.length) {
    const m = new THREE.Mesh(mergeGeometries(poles), mt); m.castShadow = true; world.add(m);
    world.add(new THREE.Mesh(mergeGeometries(heads), lam(0x3a3c42, { emissive: col, emissiveIntensity: 0.35 })));
  }
}
function neonSigns(spots) {
  const D = curD();
  for (const s of shuffleR(spots.slice()).slice(0, 26)) {
    const col = D.neon[ri(0, D.neon.length - 1)], y = Math.min(s.h - 1, rr(2.2, 4.5));
    const x = toW(s.gx) + s.dx * (T / 2 + 0.06), z = toW(s.gy) + s.dy * (T / 2 + 0.06);
    const w = rr(1.2, 2.6), m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.6), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(x, y, z);
    m.rotation.y = Math.atan2(s.dx, s.dy);
    world.add(m);
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, 0.8), new THREE.MeshBasicMaterial({ color: 0x0a080c }));
    fr.position.set(x - s.dx * 0.02, y, z - s.dy * 0.02);
    fr.rotation.y = m.rotation.y;
    world.add(fr);
    glowSprite(col, w * 1.8, world, x + s.dx * 0.3, y, z + s.dy * 0.3, 0.45);
    W.neons.push({ x: x + s.dx * 1.5, y, z: z + s.dy * 1.5 });
  }
}
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x101012, flatShading: true });
const CAR_COLS = [0x7a2a24, 0x2a3a5a, 0x5a5a60, 0x2a4a3a, 0x8a7a50, 0x1e1e22, 0x6a4a6a];
function cars(spots) {
  for (const s of shuffleR(spots.slice()).slice(0, 34)) {
    const x = toW(s.gx) + rr(-0.5, 0.5), z = toW(s.gy) + rr(-0.5, 0.5), alongZ = s.along === 'z';
    if (!DRY(tAt(s.gx, s.gy))) continue;
    const w = alongZ ? 1.8 : 3.6, d = alongZ ? 3.6 : 1.8, col = CAR_COLS[ri(0, CAR_COLS.length - 1)];
    staticBox(x, z, w, d, 1.15, lam(col, { map: stoneTex }), 0.15);
    const cab = mkMesh(new THREE.BoxGeometry(alongZ ? 1.55 : 1.9, 0.7, alongZ ? 1.9 : 1.55), lam(0x1a2230, { emissive: 0x0a1018 }), x, 1.65, z);
    W.plats.push({ x, z, w: alongZ ? 1.55 : 1.9, d: alongZ ? 1.9 : 1.55, y: 2, th: 0.7, mesh: cab });
    // Four wheels merged into one mesh per car.
    const wheels = [];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const g = Cy(0.34, 0.34, 0.3, 8);
      if (alongZ) g.rotateZ(PI2).translate(x + a * (w / 2 - 0.1), 0.34, z + b * (d / 2 - 0.7));
      else g.rotateX(PI2).translate(x + a * (w / 2 - 0.7), 0.34, z + b * (d / 2 - 0.1));
      wheels.push(g);
    }
    world.add(new THREE.Mesh(mergeGeometries(wheels), wheelMat));
  }
}
function dumpsters(spots) {
  const mat = lam(0x2e5a3a, { map: metalTex });
  for (const s of spots) {
    const x = toW(s.gx), z = toW(s.gy), alongX = s.along === 'x';
    staticBox(x, z, alongX ? 2.4 : 1.4, alongX ? 1.4 : 2.4, 1.4, mat);
    const lid = mkMesh(new THREE.BoxGeometry(alongX ? 2.5 : 1.5, 0.1, alongX ? 1.5 : 2.5), lam(0x1e3a26), x, 1.45, z);
    W.bins.push({ x, z, y: 0, r: 1.3, kind: 'dumpster', lid, done: false });
  }
}
function trees(spots) {
  const trunk = lam(0x4a3424, { map: stoneTex }), leaf = lam(0x2e4a26, { map: furTex, emissive: 0x08140a });
  for (const s of spots) {
    const x = toW(s.gx) + rr(-1, 1), z = toW(s.gy) + rr(-1, 1);
    staticBox(x, z, 0.5, 0.5, 2.8, trunk);
    const c = mkMesh(Sp(1.7, 7, 5), leaf, x, 3.6, z);
    c.scale.set(1, 0.8, 1);
    W.plats.push({ x, z, w: 2.4, d: 2.4, y: 3.9, th: 0.6, mesh: c });
  }
}
function powerLines(spots) {
  const wire = [], posts = [];
  for (const s of spots) {
    const a = toW(s.g0), b = toW(s.g1), mid = (a + b) / 2, span = Math.abs(b - a) + T * 0.2;
    if (s.axis === 'x') {
      const z = toW(s.gz);
      W.plats.push({ x: mid, z, w: span, d: 0.35, y: s.h, th: 0.18, thin: true, line: true });
      wire.push(new THREE.CylinderGeometry(0.06, 0.06, span, 5).rotateZ(PI2).translate(mid, s.h - 0.06, z));
      wire.push(new THREE.CylinderGeometry(0.04, 0.04, span, 4).rotateZ(PI2).translate(mid, s.h + 0.7, z + 0.2));
      posts.push(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5).translate(a + T / 2 - 0.3, s.h + 0.4, z));
      posts.push(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5).translate(b - T / 2 + 0.3, s.h + 0.4, z));
    } else {
      const x = toW(s.gx);
      W.plats.push({ x, z: mid, w: 0.35, d: span, y: s.h, th: 0.18, thin: true, line: true });
      wire.push(new THREE.CylinderGeometry(0.06, 0.06, span, 5).rotateX(PI2).translate(x, s.h - 0.06, mid));
      wire.push(new THREE.CylinderGeometry(0.04, 0.04, span, 4).rotateX(PI2).translate(x + 0.2, s.h + 0.7, mid));
      posts.push(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5).translate(x, s.h + 0.4, a + T / 2 - 0.3));
      posts.push(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5).translate(x, s.h + 0.4, b - T / 2 + 0.3));
    }
    W.lines.push(s);
  }
  if (wire.length) {
    world.add(new THREE.Mesh(mergeGeometries(wire), lam(0x121014)));
    world.add(new THREE.Mesh(mergeGeometries(posts), lam(0x5a4a3a, { map: stoneTex })));
  }
}
/** Closest dry tile (spiralling out from cx, cy) that has a wall beside it. */
function nearestWallSpot(cx, cy, maxR = 10) {
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = cx + dx, y = cy + dy;
    if (!DRY(tAt(x, y))) continue;
    for (const [ex, ey] of N4) { const t = tAt(x + ex, y + ey); if (t === 0 || t === 6) return { x, y, dx: ex, dy: ey, t, h: topAt(x + ex, y + ey) }; }
  }
  return null;
}
/** Random interior roof tiles (not on the map edge), for rooftop loot and clutter. */
function roofTiles() {
  const out = [];
  for (let gz = 2; gz < M.H - 2; gz++) for (let gx = 2; gx < M.W - 2; gx++) {
    const k = gi(gx, gz), t = M.grid[k];
    if ((t === 0 || t === 6) && M.hgt[k] < 12 && M.hgt[k] > 3.3) out.push([gx, gz, M.hgt[k]]);
  }
  return shuffleR(out);
}

// ---------- hidden areas & dressing ----------
/** Secret walls glow faintly, but only while the rat is sniffing (F). */
function markSecrets() {
  for (let k = 0; k < M.W * M.H; k++) {
    if (M.secret[k] !== 1 || M.grid[k] !== 3) continue;
    const g = glowSprite(0xffe070, 3, world, toW(k % M.W), 1.4, toW((k / M.W) | 0), 0.55);
    g.visible = false;
    W.secrets.push({ k, g });
  }
}
/** Mini-bosses waiting in hidden lairs; they wake when the rat walks in. */
const MINI = {
  surface: [
    { name: 'Alley Tom', type: 'cat', corrupt: 'haste' },
    { name: 'Scrap Brute', type: 'brute', corrupt: 'ward' },
    { name: 'Crow Matriarch', type: 'crow', corrupt: 'leech' },
  ],
  sewer: [
    { name: 'Bloated Queen', type: 'bloat', corrupt: 'split' },
    { name: 'Ghoul Lord', type: 'ghoul', corrupt: 'fire' },
    { name: 'Tick Hive', type: 'tick', corrupt: 'split' },
  ],
};
function setupHidden(hidden, premium) {
  const bone = lam(0xcfc2a4);
  for (const h of hidden) {
    const cx = toW(h.x + (h.w - 1) / 2), cz = toW(h.y + (h.h - 1) / 2);
    if (h.lair) {
      const pool = MINI[isSewer() ? 'sewer' : 'surface'], mb = pool[ri(0, pool.length - 1)];
      W.lairs.push({ ...h, cx, cz, mini: mb, woke: false });
      for (let i = 0; i < 14; i++) {
        const b = mkMesh(Cy(0.07, 0.07, rr(0.5, 1.2), 5), bone, cx + rr(-h.w, h.w) * 1.6, 0.1, cz + rr(-h.h, h.h) * 1.6);
        b.rotation.set(rr(1.2, 1.9), rr(0, 3), 0);
      }
      glowSprite(0xff2a2a, 5, world, cx, 0.6, cz, 0.35);
    } else {
      addChest(cx, 0, cz, premium || rng.next() < 0.5, !premium && rng.next() < 0.3);
      addCache(cx + 2, 0, cz + 1);
    }
  }
}
/** Fire escapes: zig-zag landings up a building face, an easy (stamina-free) way onto the roofs. */
function fireEscapes(n) {
  const mt = lam(0x3a3e44, { map: metalTex }), spots = [];
  for (let gz = 2; gz < M.H - 2; gz++) for (let gx = 2; gx < M.W - 2; gx++) {
    const k = gi(gx, gz);
    if (M.grid[k] !== 0 || M.hgt[k] < 6 || M.hgt[k] >= 12) continue;
    for (const [dx, dz] of N4) if (DRY(tAt(gx + dx, gz + dz)) && tAt(gx - dz, gz + dx) === 0 && tAt(gx + dz, gz - dx) === 0) spots.push([gx, gz, dx, dz, M.hgt[k]]);
  }
  for (const [gx, gz, dx, dz, h] of shuffleR(spots).slice(0, n)) {
    const fx0 = toW(gx) + dx * (T / 2 + 0.55), fz0 = toW(gz) + dz * (T / 2 + 0.55), px = -dz, pz = dx;
    const steps = Math.floor((h - 0.3) / 1.15);
    for (let i = 1; i <= steps; i++) {
      const y = i === steps ? h - 0.3 : i * 1.15, side = i % 2 ? 1 : -1;
      const x = fx0 + px * side * 0.9, z = fz0 + pz * side * 0.9, w = dx ? 1.1 : 1.8, d = dx ? 1.8 : 1.1;
      staticBox(x, z, w, d, 0.12, mt, y - 0.12);
      mkMesh(new THREE.BoxGeometry(dx ? 0.05 : 1.8, 0.6, dx ? 1.8 : 0.05), mt, x + dx * 0.55, y + 0.3, z + dz * 0.55);
    }
    mkMesh(new THREE.BoxGeometry(0.08, h, 0.08), mt, fx0 + px * 1.8, h / 2, fz0 + pz * 1.8);
    mkMesh(new THREE.BoxGeometry(0.08, h, 0.08), mt, fx0 - px * 1.8, h / 2, fz0 - pz * 1.8);
  }
}
/** Small street and sewer clutter. Solid, knee-high, and good for hopping. */
function clutter(city) {
  const open = [];
  // Keep solid clutter off the spawn point so the rat never starts pinned inside a can or heap.
  const sr = G.startRoom;
  for (let k = 0; k < M.W * M.H; k++) if (DRY(M.grid[k]) && !(sr && Math.abs(k % M.W - sr.cx) <= 2 && Math.abs(((k / M.W) | 0) - sr.cy) <= 2)) open.push(k);
  shuffleR(open);
  const place = (n, fn) => { for (let i = 0; i < n && open.length; i++) { const k = open.pop(); fn(toW(k % M.W) + rr(-1.4, 1.4), toW((k / M.W) | 0) + rr(-1.4, 1.4)); } };
  if (city) {
    const red = lam(0xc0302a, { map: metalTex }), cone = lam(0xff7a2a), blue = lam(0x2a4a8a, { map: metalTex }), wood = lam(0x6a4a2e, { map: stoneTex });
    place(14, (x, z) => { staticBox(x, z, 0.5, 0.5, 0.75, red); mkMesh(Sp(0.28, 6, 4), red, x, 0.8, z); });
    place(18, (x, z) => { mkMesh(Co(0.28, 0.8, 6), cone, x, 0.4, z); W.plats.push({ x, z, w: 0.4, d: 0.4, y: 0.8, th: 0.8 }); });
    place(8, (x, z) => { staticBox(x, z, 0.6, 0.5, 1.2, blue); });
    // Trash cans: rummage them for junk.
    const can = lam(0x5a5e62, { map: metalTex });
    place(12, (x, z) => { staticBox(x, z, 0.7, 0.7, 1, can); const lid = mkMesh(Cy(0.42, 0.42, 0.08, 8), can, x, 1.04, z); W.bins.push({ x, z, y: 0, r: 0.6, kind: 'bin', lid, done: false }); });
    place(8, (x, z) => { const rot = rng.next() < 0.5; staticBox(x, z, rot ? 2.2 : 0.7, rot ? 0.7 : 2.2, 0.55, wood); });
    // Graffiti on walls that face alleys and streets.
    let tags = 0;
    for (let k = 0; k < M.W * M.H && tags < 22; k++) {
      if (M.grid[k] !== 0 || rng.next() > 0.08) continue;
      const gx = k % M.W, gz = (k / M.W) | 0;
      for (const [dx, dz] of N4) {
        if (!DRY(tAt(gx + dx, gz + dz))) continue;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshLambertMaterial({ map: graffitiTex(tags), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.position.set(toW(gx) + dx * (T / 2 + 0.03), rr(1.2, 2), toW(gz) + dz * (T / 2 + 0.03));
        m.rotation.y = Math.atan2(dx, dz);
        world.add(m);
        tags++;
        break;
      }
    }
  } else {
    const barrel = lam(0x4a5a3a, { map: metalTex }), rust = lam(0x7a4a2a, { map: metalTex }), bone = lam(0xcfc2a4);
    place(16, (x, z) => { const m = rng.next() < 0.5 ? barrel : rust; staticBox(x, z, 0.9, 0.9, 1.1, m); mkMesh(Cy(0.46, 0.46, 0.08, 10), m, x, 1.12, z); });
    // Junk heaps: the best rummaging in the city.
    place(10, (x, z) => { for (let i = 0; i < 7; i++) { const b = mkMesh(Bx(rr(0.3, 0.7), rr(0.15, 0.4), rr(0.3, 0.7)), rng.next() < 0.5 ? rust : barrel, x + rr(-0.6, 0.6), rr(0.1, 0.4), z + rr(-0.6, 0.6)); b.rotation.set(rr(-0.4, 0.4), rr(0, 3), rr(-0.4, 0.4)); } W.bins.push({ x, z, y: 0, r: 0.9, kind: 'heap', done: false }); });
    place(10, (x, z) => { for (let i = 0; i < 6; i++) { const b = mkMesh(Cy(0.06, 0.06, rr(0.4, 0.9), 5), bone, x + rr(-0.6, 0.6), 0.1, z + rr(-0.6, 0.6)); b.rotation.set(rr(1.3, 1.8), rr(0, 3), 0); } mkMesh(Sp(0.2, 6, 4), bone, x, 0.18, z); });
    // Pipes running along the tunnel walls.
    let n = 0;
    for (let k = 0; k < M.W * M.H && n < 30; k++) {
      if (M.grid[k] !== 0 || rng.next() > 0.1) continue;
      const gx = k % M.W, gz = (k / M.W) | 0;
      for (const [dx, dz] of N4) {
        if (!OPEN(tAt(gx + dx, gz + dz))) continue;
        const g = new THREE.CylinderGeometry(0.22, 0.22, T, 8);
        if (dx) g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
        mkMesh(g, rust, toW(gx) + dx * (T / 2 + 0.25), rr(1.6, 3.4), toW(gz) + dz * (T / 2 + 0.25));
        n++;
        break;
      }
    }
  }
}
/** Rooftop searchlights sweeping the streets (city) and light shafts through grates (sewer). */
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const spotMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
function searchlights(city) {
  if (city) {
    const roofs = [];
    for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 0 && M.hgt[k] >= 8 && M.hgt[k] < 20) roofs.push(k);
    shuffleR(roofs);
    const picked = [];
    for (const k of roofs) {
      const x = toW(k % M.W), z = toW((k / M.W) | 0);
      if (picked.some(p => Math.hypot(p.x - x, p.z - z) < 36)) continue;
      picked.push({ x, z, h: M.hgt[k] });
      if (picked.length >= 4) break;
    }
    const housing = lam(0x3a3c42, { map: metalTex });
    for (const p of picked) {
      mkMesh(Cy(0.5, 0.6, 0.8, 6), housing, p.x, p.h + 0.4, p.z);
      glowSprite(0xfff4d0, 2.2, world, p.x, p.h + 1, p.z, 0.9);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 3.4, 1, 10, 1, true).translate(0, -0.5, 0), beamMat);
      cone.position.set(p.x, p.h + 1, p.z);
      world.add(cone);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(3.4, 14).rotateX(-Math.PI / 2), spotMat);
      world.add(spot);
      W.searches.push({ hx: p.x, hy: p.h + 1, hz: p.z, cx: p.x + rr(-6, 6), cz: p.z + rr(-6, 6), rx: rr(10, 16), rz: rr(10, 16), w: rr(0.25, 0.4), o: rr(0, 6), ph: rr(0, 6), sx: p.x, sz: p.z, R: 3.4, cone, spot });
    }
  } else {
    for (const r of shuffleR(W.rooms.slice()).slice(0, 7)) {
      if (r === G.startRoom) continue;
      const x = toW(r.cx), z = toW(r.cy), y = floorY(x, z);
      const beam = mkMesh(new THREE.CylinderGeometry(1.3, 1.9, 9, 8, 1, true), beamMat, x, y + 4.5, z);
      beam.castShadow = false;
      const pool = mkMesh(new THREE.CircleGeometry(1.9, 12).rotateX(-Math.PI / 2), spotMat, x, y + 0.05, z);
      pool.castShadow = false;
      W.shafts.push({ x, z, R: 1.9 });
    }
  }
}
/** Mushrooms and molds grow in damp corners against walls; the sewer is thick with them. */
const fungusMats = {};
function fungi(city) {
  const spots = [];
  for (let k = 0; k < M.W * M.H; k++) {
    if (!DRY(M.grid[k])) continue;
    const gx = k % M.W, gz = (k / M.W) | 0;
    if (N4.some(([dx, dz]) => tAt(gx + dx, gz + dz) === 0)) spots.push(k);
  }
  shuffleR(spots);
  const kinds = Object.keys(FUNGI), n = Math.min(spots.length, city ? 10 : 16);
  for (let i = 0; i < n; i++) {
    const k = spots[i], kind = kinds[i % kinds.length], F = FUNGI[kind];
    const x = toW(k % M.W) + rr(-1.2, 1.2), z = toW((k / M.W) | 0) + rr(-1.2, 1.2), y = floorY(x, z);
    const mat = fungusMats[kind] || (fungusMats[kind] = lam(F.col, { emissive: F.glow ? F.col : 0x000000, emissiveIntensity: 0.4 }));
    const g = new THREE.Group();
    if (F.mold) {
      for (let j = 0; j < 5; j++) mkMesh(Sp(rr(0.18, 0.32), 6, 3), mat, rr(-0.35, 0.35), 0.02, rr(-0.35, 0.35), g).scale.set(1, 0.35, 1);
    } else {
      const stem = fungusMats.stem || (fungusMats.stem = lam(0xe8dcc0)), spot = fungusMats[kind + 's'] || (fungusMats[kind + 's'] = lam(F.spot));
      for (let j = 0; j < 3; j++) {
        const s = j ? rr(0.5, 0.7) : 1, ox = j ? rr(-0.35, 0.35) : 0, oz = j ? rr(-0.35, 0.35) : 0;
        mkMesh(Cy(0.07 * s, 0.09 * s, 0.4 * s, 5), stem, ox, 0.2 * s, oz, g);
        mkMesh(Sp(0.24 * s, 6, 3), mat, ox, 0.4 * s, oz, g).scale.set(1, 0.6, 1);
        mkMesh(Sp(0.05 * s, 4, 2), spot, ox + 0.1 * s, 0.5 * s, oz, g);
      }
    }
    g.traverse(m => { m.castShadow = false; });
    glowSprite(F.col, 1, g, 0, 0.3, 0, F.glow ? 0.5 : 0.22);
    g.position.set(x, y, z);
    world.add(g);
    W.fungi.push({ x, y, z, g, kind, taken: false });
  }
}
/** Dead-end alleys always end in something worth the detour. */
function deadEndLoot(alleys) {
  for (const a of alleys || []) {
    for (const [x, y] of [[a.x, a.y], [a.x + a.w - 1, a.y + a.h - 1]]) {
      if (!DRY(tAt(x, y))) continue;
      const exits = N4.filter(([dx, dy]) => OPEN(tAt(x + dx, y + dy))).length;
      if (exits !== 1) continue;
      if (rng.next() < 0.5) addCache(toW(x), 0, toW(y)); else addChest(toW(x), 0, toW(y));
    }
  }
}

// ---------- populate ----------
export function resetLists() {
  for (const k of Object.keys(W)) if (Array.isArray(W[k])) W[k] = [];
  W.cracks = new Map();
  G.exitD = null;
  G.exits = [];
  G.manhole = null;
  for (const f of flasks) { f.on = false; f.m.visible = false; }
}

export function populate(info) {
  const { dist, pockets, byDist, metal, rooms, startRoom } = info;
  const trial = G.mode === 'trial', city = M.kind === 'city', D = curD();
  resetLists();
  W.rooms = rooms;
  G.startRoom = startRoom;
  const others = rooms.filter(r => r !== startRoom);
  const crateM = lam(0x7a5838, { map: stoneTex });

  if (city) {
    streetLamps(info.lampSpots);
    neonSigns(info.neonSpots);
    cars(info.carSpots);
    dumpsters(info.dumpSpots);
    trees(info.treeSpots);
    powerLines(info.lineSpots);
    const roofs = roofTiles();
    // Rooftop clutter: AC units to hop on, water towers on the tall ones.
    for (const [gx, gz, h] of roofs.slice(0, 40)) {
      const x = toW(gx) + rr(-1, 1), z = toW(gz) + rr(-1, 1);
      if (h >= 9 && rng.next() < 0.2) {
        const g = new THREE.Group();
        mkMesh(Cy(1.2, 1.2, 2, 10), lam(0x6a4a30, { map: stoneTex }), 0, 2.2, 0, g);
        mkMesh(Co(1.3, 0.8, 10), lam(0x4a3420), 0, 3.6, 0, g);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mkMesh(Cy(0.08, 0.08, 1.2, 4), lam(0x3a3030), a * 0.8, 0.6, b * 0.8, g);
        g.position.set(x, h, z);
        world.add(g);
        W.plats.push({ x, z, w: 2.2, d: 2.2, y: h + 3.2, th: 2 });
      } else staticBox(x, z, 1.4, 1.4, rr(0.8, 1.3), lam(0x8a8e92, { map: metalTex }), h);
    }
    for (const [gx, gz, h] of roofs.slice(40, 43)) addChest(toW(gx), h, toW(gz));
    for (const [gx, gz, h] of roofs.slice(43, 46)) addCache(toW(gx), h, toW(gz));
    if (!trial && rng.next() < 0.5) { const [gx, gz, h] = roofs[46] || roofs[0]; addChest(toW(gx), h, toW(gz), false, true); }
    // Crate stacks against low walls as stepping stones up to the roofs.
    for (const r of shuffleR(others.slice()).slice(0, 10)) {
      const wa = wallAdj(r).filter(w => w.t === 0 && w.h <= 6);
      if (!wa.length) continue;
      const w = wa[ri(0, wa.length - 1)], cx = toW(w.x), cz = toW(w.y);
      staticBox(cx + w.dx * 1.1, cz + w.dy * 1.1, 1.6, 1.6, 2.3, crateM);
      staticBox(cx - w.dx * 0.6, cz - w.dy * 0.6, 1.5, 1.5, 1.1, crateM);
    }
    for (const r of others) {
      const tl = roomTiles(r);
      for (let i = 0; i < ri(0, 2) && tl.length; i++) { const [x, y] = tl[ri(0, tl.length - 1)]; addObj(['crate', 'bin', 'cap', 'sponge'][ri(0, 3)], toW(x) + rr(-1, 1), toW(y) + rr(-1, 1)); }
    }
    shuffleR(others.filter(r => r.kind !== 'cross')).slice(0, 3).forEach(r => { const tl = roomTiles(r); if (tl.length) { const [x, y] = tl[ri(0, tl.length - 1)]; addChest(toW(x), 0, toW(y)); } });
    shuffleR(others.filter(r => r.kind === 'yard' || r.kind === 'alley')).slice(0, 3).forEach(r => { const tl = roomTiles(r); if (tl.length) { const [x, y] = tl[ri(0, tl.length - 1)]; addCache(toW(x), 0, toW(y)); } });
  } else {
    for (const r of rooms) {
      const wa = wallAdj(r);
      for (let i = 0; i < 2 && wa.length; i++) {
        const w = wa[ri(0, wa.length - 1)], [x, z] = wallPos(w, 0.12);
        W.lamps.push({ x, z, y: 3.2 });
        const g = new THREE.Group();
        mkMesh(Bx(0.3, 0.5, 0.3), lam(0x3a3640), 0, 0, 0, g);
        glowSprite(0xffc070, 2.4, g, 0, 0.1, 0, 0.85);
        g.position.set(x, 3.2, z);
        world.add(g);
      }
      if (r !== startRoom && !r.metal && rng.next() < 0.6) {
        const bw = wa.filter(w => w.t === 0);
        if (bw.length) { const w = bw[ri(0, bw.length - 1)], cx = toW(w.x), cz = toW(w.y); staticBox(cx + w.dx * 1.1, cz + w.dy * 1.1, 1.6, 1.6, 2.3, crateM); staticBox(cx - w.dx * 0.6, cz - w.dy * 0.6, 1.5, 1.5, 1.1, crateM); }
      }
      if (r !== startRoom) { const tl = roomTiles(r); for (let i = 0; i < ri(1, 2) && tl.length; i++) { const [x, y] = tl[ri(0, tl.length - 1)]; addObj(['cap', 'sponge', 'crate'][ri(0, 2)], toW(x) + rr(-1, 1), toW(y) + rr(-1, 1)); } }
    }
    for (const r of metal) {
      const tl = roomTiles(r);
      ['crate', 'sponge', 'cap'].forEach((k, i) => { if (tl.length) { const [x, y] = tl[(i * 3) % tl.length]; addObj(k, toW(x), toW(y)); } });
      const wa = wallAdj(r).filter(w => w.t === 6);
      if (wa.length) { const w = wa[ri(0, wa.length - 1)]; addCache(toW(w.x + w.dx), w.h, toW(w.y + w.dy)); addChest(toW(w.x + w.dx) + 0.5, w.h, toW(w.y + w.dy) + 0.5, !trial); }
    }
    // Cotton swabs next to acid, to lay across as bridges.
    const acid = [];
    for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 4) acid.push(k);
    shuffleR(acid);
    let sw = 0;
    for (const k of acid) {
      if (sw >= 6) break;
      const x = k % M.W, y = (k / M.W) | 0;
      for (const [dx, dy] of N4) {
        if (tAt(x + dx, y + dy) === 1 && !W.objs.some(o => Math.hypot(o.x - toW(x + dx), o.z - toW(y + dy)) < 6)) {
          const o = addObj('swab', toW(x + dx), toW(y + dy));
          if (dx) { o.w = 4.6; o.d = 0.5; }
          syncObj(o);
          sw++;
          break;
        }
      }
    }
    pockets.forEach((cells, i) => { const [x, y] = cells[0]; addCache(toW(x), 0, toW(y)); if (i % 2 === 0) { const [a, b] = cells[3]; addChest(toW(a), 0, toW(b), !trial); } });
    shuffleR(others.slice()).slice(0, 3).forEach(r => { const wa = wallAdj(r).filter(w => w.t === 0); if (wa.length) { const w = wa[ri(0, wa.length - 1)]; addChest(toW(w.x + w.dx), w.h, toW(w.y + w.dy), !trial); } });
    shuffleR(others.slice()).slice(0, 2).forEach(r => { const tl = roomTiles(r); if (tl.length) { const [x, y] = tl[ri(0, tl.length - 1)]; addChest(toW(x), floorY(toW(x), toW(y)), toW(y), !trial, !trial && rng.next() < 0.5); } });
    const dead = [];
    for (let k = 0; k < M.W * M.H; k++) {
      if (M.grid[k] !== 1) continue;
      const x = k % M.W, y = (k / M.W) | 0;
      if (N4.filter(([dx, dy]) => OPEN(tAt(x + dx, y + dy))).length === 1) dead.push(k);
    }
    shuffleR(dead).slice(0, 3).forEach(k => addCache(toW(k % M.W), 0, toW((k / M.W) | 0)));
    shuffleR(others.filter(r => r.w >= 5 && r.h >= 4)).slice(0, 4).forEach(addRope);
    if (!trial) shuffleR(others.slice()).slice(0, 4).forEach(r => addZone('dark', toW(r.cx), toW(r.cy)));
  }

  // Hidden areas and set dressing.
  if (!trial) setupHidden(info.hidden || [], !city);
  markSecrets();
  if (city) { fireEscapes(8); deadEndLoot(info.alleys); }
  clutter(city);
  fungi(city);
  if (!trial) searchlights(city);

  // Shared: workbenches, pipes, live wires, nests or valves, predators, hazards.
  const benchAt = w => { if (w) addBench(toW(w.x) - w.dx * 0.6, toW(w.y) - w.dy * 0.6, Math.atan2(w.dx, w.dy)); };
  benchAt(wallAdj(startRoom)[0] || nearestWallSpot(startRoom.cx, startRoom.cy));
  [byDist[4], byDist[Math.floor(byDist.length * 0.6)]].filter(Boolean).forEach(r => { const wa = wallAdj(r); benchAt(wa.length ? wa[ri(0, wa.length - 1)] : nearestWallSpot(r.cx, r.cy)); });
  for (const r of shuffleR(rooms.slice()).slice(0, 5)) { const wa = wallAdj(r); if (wa.length) addWire(wa[ri(0, wa.length - 1)]); }
  const pr = shuffleR(rooms.filter(r => wallAdj(r).length)).slice(0, 6);
  for (let i = 0; i + 1 < pr.length; i += 2) { const a = wallAdj(pr[i]), b = wallAdj(pr[i + 1]); const p = addPipe(a[ri(0, a.length - 1)]), q = addPipe(b[ri(0, b.length - 1)]); p.link = q; q.link = p; }
  if (trial) {
    byDist.slice(0, 5).filter((r, i) => i % 2 === 1 || i === 4).slice(0, 3).forEach((r, i) => { const tl = roomTiles(r); const [x, y] = tl[Math.floor(tl.length / 2)] || [r.cx, r.cy]; addValve(toW(x) + 1, toW(y) + 1, i); });
    const er = byDist[0];
    addExit(toW(er.cx), toW(er.cy), 'drain');
  } else {
    byDist.slice(0, 10).slice(0, 7).forEach(r => { const tl = roomTiles(r); if (tl.length) { const [x, y] = tl[ri(0, tl.length - 1)]; addNest(toW(x), toW(y)); } });
    if (city) {
      const cand = byDist.slice(Math.floor(byDist.length * 0.3), Math.floor(byDist.length * 0.75)).filter(r => r.kind === 'cross');
      const r = cand[ri(0, Math.max(0, cand.length - 1))] || byDist[Math.floor(byDist.length / 2)];
      addManhole(toW(r.cx), toW(r.cy));
    }
  }
  const pathRooms = shuffleR(others.slice());
  for (let p = 0; p < (trial ? 1 : run.mods.includes('cats') ? 4 : 2); p++) {
    const loop = pathRooms.slice(p * 3, p * 3 + 3);
    if (loop.length < 3) break;
    let path = [];
    for (let i = 0; i < 3; i++) {
      const a = loop[i], b = loop[(i + 1) % 3];
      path = path.concat(descend(bfs(b.cx, b.cy, OPEN), a.cx, a.cy, 400));
    }
    if (path.length > 4) addPred(path);
  }
  if (!trial) placeTraps(rooms, startRoom);
  populateDucts(info.ducts || [], addCache);
  buildSetPieces(info);
  const open = [];
  for (let k = 0; k < M.W * M.H; k++) if (DRY(M.grid[k]) && dist[k] > 4) open.push(k);
  shuffleR(open);
  let oi = 0;
  const nxt = () => { const k = open[oi++ % open.length]; return [toW(k % M.W) + rr(-1, 1), toW((k / M.W) | 0) + rr(-1, 1)]; };
  if (run.mods.includes('currents')) for (let i = 0; i < 9; i++) addZone('vent', ...nxt());
  if (run.mods.includes('gravity')) for (let i = 0; i < 5; i++) addZone('grav', ...nxt());
  if (run.mods.includes('decay')) for (let i = 0; i < 5; i++) addZone('decay', ...nxt());
  if (G.tideMesh) G.tideMesh.material.map.dispose();
  G.tideMesh = null;
  G.tideY = -5;
  if (run.mods.includes('tides')) {
    const wt = waterTex.clone();
    wt.needsUpdate = true;
    wt.repeat.set(M.W, M.H);
    G.tideMesh = new THREE.Mesh(new THREE.PlaneGeometry(M.half * 2, M.half * 2).rotateX(-PI2), new THREE.MeshLambertMaterial({ map: wt, transparent: true, opacity: 0.62, emissive: 0x0a2a24, depthWrite: false }));
    G.tideMesh.visible = false;
    world.add(G.tideMesh);
  }
  if (run.mods.includes('bait')) for (let i = 0; i < 28; i++) {
    const k = open[ri(0, open.length - 1)], x = toW(k % M.W) + rr(-1.5, 1.5), z = toW((k / M.W) | 0) + rr(-1.5, 1.5), g = new THREE.Group();
    mkMesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x9be06a }), 0, 0.3, 0, g);
    glowSprite(0x9be06a, 1.3, g, 0, 0.3, 0, 0.6);
    g.position.set(x, floorY(x, z), z);
    world.add(g);
    W.baits.push({ x, z, m: g, gone: false });
  }
  if (run.mods.includes('collapse')) {
    const fl = [];
    for (let k = 0; k < M.W * M.H; k++) if (DRY(M.grid[k]) && dist[k] > 3) fl.push(k);
    shuffleR(fl).slice(0, Math.floor(fl.length * 0.1)).forEach(k => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.96, T * 0.96).rotateX(-PI2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false }));
      m.position.set(toW(k % M.W), 0.02, toW((k / M.W) | 0));
      world.add(m);
      W.cracks.set(k, { t: -1, m });
    });
  }
  unbury();
  indexPlats();
  // Small props don't cast real-time shadows (cheaper; buildings and big set pieces still do).
  world.traverse(o => {
    if (!o.isMesh || !o.castShadow) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 1.4) o.castShadow = false;
  });
  applyCutaway();
  applyLighting(D, city);
}

/** Move any ground pickup or nest that ended up inside another prop to the nearest free floor. */
function unbury() {
  const inside = (x, z, own) => W.plats.some(p => !p.thin && Math.hypot(p.x - own.x, p.z - own.z) > 0.35 && Math.abs(p.x - x) < p.w / 2 + 0.6 && Math.abs(p.z - z) < p.d / 2 + 0.6 && p.y > 0.6 && p.y - p.th < 0.5);
  const free = (x, z, o) => DRY(tAt(Math.floor(x / T + M.W / 2), Math.floor(z / T + M.H / 2))) && !inside(x, z, o);
  const items = [...W.chests.filter(c => c.y < 0.6), ...W.caches.filter(c => c.y < 0.6), ...W.enemies.filter(e => e.type === 'nest')];
  for (const o of items) {
    if (!inside(o.x, o.z, o)) continue;
    let spot = null;
    for (let r = 1.2; r <= 9 && !spot; r += 0.8) for (let a = 0; a < 12 && !spot; a++) {
      const x = o.x + Math.sin(a / 12 * TAU) * r, z = o.z + Math.cos(a / 12 * TAU) * r;
      if (free(x, z, o)) spot = [x, z];
    }
    if (!spot) continue;
    [o.x, o.z] = spot;
    const g = o.g || o.mesh;
    if (g) { g.position.x = o.x; g.position.z = o.z; }
  }
}

export function applyLighting(D, city) {
  const blackout = run.mods && run.mods.includes('blackout');
  if (city) {
    hemi.color.set(0xb0b8e0); hemi.groundColor.set(0x5a4a50); hemi.intensity = blackout ? 0.4 : 1.45;
    sun.color.set(0xc0ccff); sun.intensity = blackout ? 0.3 : 1.0;
    scene.fog = new THREE.Fog(D.fog, blackout ? 8 : 34, blackout ? 40 : 88);
    scene.background = new THREE.Color(D.sky);
  } else {
    hemi.color.set(0xfff0dc); hemi.groundColor.set(0x4a3a32); hemi.intensity = blackout ? 0.35 : 1.25;
    sun.color.set(0xfff0e0); sun.intensity = 1.1;
    scene.fog = blackout ? new THREE.Fog(0x080608, 6, 30) : new THREE.Fog(D.fog, 26, 60);
    scene.background = new THREE.Color(D.fog);
  }
  if (run.rain) { scene.fog.near *= 0.7; scene.fog.far *= 0.8; hemi.intensity *= 0.85; }
  G.fogNear = scene.fog.near;
  G.fogFar = scene.fog.far;
  lantern.intensity = blackout ? 3.4 : city ? 2.4 : 1.8;
  lantern.distance = blackout ? 18 : city ? 16 : 12;
  lampL.forEach(l => l.color.set(D.lamp));
}
