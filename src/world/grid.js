// The tile map every district is built on: tile types, per-tile heights,
// path-finding flow field and body-vs-world collision.
import { clamp } from '../core/util.js';
import { P, W } from '../core/state.js';

export const T = 4;          // world units per tile
export const WH = 4.5;       // default wall / sewer ceiling-ledge height
export const G = 32;         // gravity

/** Tile ids. Solid tiles have a top height in `M.hgt` you can stand on. */
export const TL = { WALL: 0, FLOOR: 1, WATER: 2, DRY: 3, ACID: 4, CREV: 5, METAL: 6, PIT: 7, FENCE: 8, GRASS: 9, ROAD: 10 };

export const M = {
  kind: 'sewer',
  W: 40, H: 40, half: 80,
  grid: new Uint8Array(1600), hgt: new Float32Array(1600), seen: new Uint8Array(1600), secret: new Uint8Array(1600),
  flow: new Int16Array(1600).fill(-1), spawnTiles: [],
};

export function allocMap(w, kind) {
  M.W = M.H = w;
  M.half = w * T / 2;
  M.kind = kind;
  M.grid = new Uint8Array(w * w);
  M.hgt = new Float32Array(w * w).fill(WH);
  M.seen = new Uint8Array(w * w);
  M.secret = new Uint8Array(w * w); // 1 = gnawable wall disguised as solid brick
  M.flow = new Int16Array(w * w).fill(-1);
  M.spawnTiles = [];
}

export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const gi = (gx, gz) => gz * M.W + gx;
export const inG = (gx, gz) => gx >= 0 && gz >= 0 && gx < M.W && gz < M.H;
export const toG = v => Math.floor(v / T + M.W / 2);
export const toW = g => (g - M.W / 2 + 0.5) * T;
export const tAt = (gx, gz) => (inG(gx, gz) ? M.grid[gi(gx, gz)] : 0);
export const tileAt = (x, z) => tAt(toG(x), toG(z));
export const topAt = (gx, gz) => (inG(gx, gz) ? M.hgt[gi(gx, gz)] : 12);

/** Walkable for the flow field (ground mobs path through these). */
export const OPEN = t => t === 1 || t === 2 || t === 4 || t === 9 || t === 10;
/** Dry walkable ground (for placing props and spawning). */
export const DRY = t => t === 1 || t === 9 || t === 10;
/** Brick and concrete walls you can climb without augments. */
export const CLIMB = t => t === 0 || t === 3 || t === 8;
export const solidFor = (t, isP) => t === 0 || t === 6 || t === 3 || t === 8 || (t === 5 && !(isP && P.squeeze));

/** Height of whatever you would stand on at (x, z). */
export function floorY(x, z, isP) {
  const gx = toG(x), gz = toG(z), t = tAt(gx, gz);
  if (t === 7) return -9;
  if (t === 2 || t === 4) return -0.9;
  if (solidFor(t, isP)) return topAt(gx, gz);
  return 0;
}

export function bfs(sx, sy, pass) {
  const n = M.W * M.H, d = new Int16Array(n).fill(-1), q = new Int32Array(n);
  let h = 0, t = 0;
  if (!inG(sx, sy)) return d;
  d[gi(sx, sy)] = 0;
  q[t++] = gi(sx, sy);
  while (h < t) {
    const c = q[h++], x = c % M.W, y = (c / M.W) | 0, nd = d[c] + 1;
    for (const [dx, dy] of N4) {
      const X = x + dx, Y = y + dy;
      if (!inG(X, Y)) continue;
      const k = gi(X, Y);
      if (d[k] >= 0 || !pass(M.grid[k])) continue;
      d[k] = nd;
      q[t++] = k;
    }
  }
  return d;
}

/** Walk down a distance field from (gx, gz) towards its source. */
export function descend(d, gx, gz, maxN = 80) {
  const out = [];
  let x = gx, y = gz;
  if (!inG(x, y) || d[gi(x, y)] < 0) return out;
  for (let n = 0; n < maxN; n++) {
    out.push(gi(x, y));
    const cd = d[gi(x, y)];
    if (cd <= 0) break;
    let bx = -1, by = -1;
    for (const [dx, dy] of N4) {
      const X = x + dx, Y = y + dy;
      if (inG(X, Y) && d[gi(X, Y)] >= 0 && d[gi(X, Y)] < cd) { bx = X; by = Y; break; }
    }
    if (bx < 0) break;
    x = bx; y = by;
  }
  return out;
}

export function nearOpen(gx, gz) {
  if (OPEN(tAt(gx, gz))) return [gx, gz];
  for (let r = 1; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (OPEN(tAt(gx + dx, gz + dy))) return [gx + dx, gz + dy];
  }
  return [gx, gz];
}

export const roomTiles = r => {
  const o = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inG(x, y) && DRY(M.grid[gi(x, y)])) o.push([x, y]);
  return o;
};
/** Floor tiles of a room that touch a wall, with the wall direction. */
export const wallAdj = r => {
  const o = [];
  for (const [x, y] of roomTiles(r)) for (const [dx, dy] of N4) {
    const t = tAt(x + dx, y + dy);
    if (t === 0 || t === 6) o.push({ x, y, dx, dy, t, h: topAt(x + dx, y + dy) });
  }
  return o;
};

/** Direction along the flow field towards the player, or null if already close. */
export function flowDir(e) {
  const gx = toG(e.x), gz = toG(e.z);
  if (!inG(gx, gz)) return null;
  const d = M.flow[gi(gx, gz)];
  if (d <= 1) return null;
  let best = null, bd = d;
  for (const [dx, dy] of N8) {
    const X = gx + dx, Y = gz + dy;
    if (!inG(X, Y)) continue;
    const dd = M.flow[gi(X, Y)];
    if (dd < 0 || dd >= bd) continue;
    if (dx && dy && (!OPEN(tAt(gx + dx, gz)) || !OPEN(tAt(gx, gz + dy)))) continue;
    bd = dd;
    best = [X, Y];
  }
  if (!best) return null;
  const vx = toW(best[0]) - e.x, vz = toW(best[1]) - e.z, l = Math.hypot(vx, vz) || 1;
  return [vx / l, vz / l];
}

// ---------- platform index ----------
/**
 * Static platforms (crates, cars, props, lines...) bucketed by tile so a body
 * only tests the ones near it. Movable junk (W.objs) is checked separately.
 */
let platCells = new Map(), stamp = 0;
export function indexPlats() {
  platCells = new Map();
  for (const p of W.plats) {
    if (p.dyn) continue;
    const x0 = toG(p.x - p.w / 2), x1 = toG(p.x + p.w / 2), z0 = toG(p.z - p.d / 2), z1 = toG(p.z + p.d / 2);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      if (!inG(gx, gz)) continue;
      const k = gi(gx, gz);
      let l = platCells.get(k);
      if (!l) platCells.set(k, (l = []));
      l.push(p);
    }
  }
}
/** Call fn once for every platform that could overlap a circle of radius R at (x, z). */
export function forPlatsNear(x, z, R, fn) {
  const s = ++stamp, x0 = toG(x - R - 0.1), x1 = toG(x + R + 0.1), z0 = toG(z - R - 0.1), z1 = toG(z + R + 0.1);
  for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
    const l = platCells.get(gi(gx, gz));
    if (!l) continue;
    for (const p of l) { if (p._s === s) continue; p._s = s; fn(p); }
  }
  for (const o of W.objs) fn(o);
}

// ---------- collision ----------
const GROUND = { ground: true };
/**
 * Resolve a cylinder (radius R, height H) against solid tiles and platforms.
 * Returns what the body stands on (a platform, a tile-top marker) or null.
 * Sets b.hw when it pushed against a wall (b.wt = tile, b.wtop = wall top).
 */
export function collideBody(b, prevY, R, H, isP) {
  b.hw = false;
  b.blocked = null;
  let g = null;
  const cx = toG(b.x), cz = toG(b.z);
  for (let gz = cz - 1; gz <= cz + 1; gz++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
    const t = tAt(gx, gz);
    if (!solidFor(t, isP)) continue;
    const top = topAt(gx, gz);
    if (b.y >= top - 0.08) continue;
    const x0 = (gx - M.W / 2) * T, x1 = x0 + T, z0 = (gz - M.H / 2) * T, z1 = z0 + T;
    const qx = clamp(b.x, x0, x1), qz = clamp(b.z, z0, z1), dx = b.x - qx, dz = b.z - qz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    // Small ledges (fences, low walls) step up automatically when falling onto them.
    if (top - b.y < 0.45 && b.vy <= 0) { b.y = top; b.vy = 0; continue; }
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      b.x += dx / d * (R - d);
      b.z += dz / d * (R - d);
    } else {
      const l = b.x - x0, r = x1 - b.x, u = b.z - z0, o = z1 - b.z, m = Math.min(l, r, u, o);
      if (m === l) b.x = x0 - R; else if (m === r) b.x = x1 + R; else if (m === u) b.z = z0 - R; else b.z = z1 + R;
    }
    b.hw = true;
    b.wt = t;
    b.wtop = top;
  }
  const visit = p => {
    if (p === b || p.carried) return;
    const hw = p.w / 2 + R, hd = p.d / 2 + R, lx = b.x - p.x, lz = b.z - p.z;
    if (lx > hw || lx < -hw || lz > hd || lz < -hd) return;
    const top = p.y, bot = p.y - p.th;
    if (b.vy <= 0 && prevY >= top - 0.1 && b.y <= top + 0.001) { b.y = top; b.vy = 0; g = p; }
    // Thin platforms (power lines) are one-way: stand on them, pass through from below.
    else if (!p.thin && b.vy > 0 && prevY + H <= bot + 0.05 && b.y + H > bot) { b.y = bot - H; b.vy = 0; }
    else if (b.y < top - 0.1 && b.y + H > bot) {
      if (top - b.y < 0.45 && b.vy <= 0) { b.y = top; b.vy = 0; g = p; return; }
      b.blocked = p;
      if (p.thin) return; // power lines: walk under them
      if (hw - Math.abs(lx) < hd - Math.abs(lz)) b.x = p.x + Math.sign(lx || 1) * hw;
      else b.z = p.z + Math.sign(lz || 1) * hd;
    }
  };
  forPlatsNear(b.x, b.z, R, visit);
  const gy = floorY(b.x, b.z, isP);
  if (b.y <= gy + 0.001 && b.vy <= 0 && gy - b.y <= 1.05) {
    if (!g || gy >= g.y) { b.y = gy; b.vy = 0; g = GROUND; }
  }
  b.x = clamp(b.x, -M.half + 1, M.half - 1);
  b.z = clamp(b.z, -M.half + 1, M.half - 1);
  return g;
}

/** True if any solid tile blocks the segment a→b (used to keep buildings from hiding the rat). */
export function segBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz), n = Math.ceil(L / 0.7);
  for (let i = 2; i <= n; i++) {
    const u = i / n, x = ax + dx * u, y = ay + dy * u, z = az + dz * u, gx = toG(x), gz = toG(z), t = tAt(gx, gz);
    if ((t === 0 || t === 6 || t === 3) && y < topAt(gx, gz) - 0.2) return true;
  }
  return false;
}
