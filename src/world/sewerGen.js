// Sewer layout: rooms joined by tunnels, water and acid channels, drywall
// shortcuts, crevices, smooth-metal chambers and hidden pockets.
import { seedRng, rng, ri, shuffleR } from '../core/util.js';
import { M, allocMap, gi, inG, tAt, bfs, OPEN, N4, WH } from './grid.js';

export function genSewer(seed, D) {
  seedRng(seed);
  allocMap(40, 'sewer');
  const GW = M.W, GH = M.H, grid = M.grid;
  M.hgt.fill(WH);
  const rooms = [];
  for (let a = 0; a < 700 && rooms.length < 15; a++) {
    const w = ri(4, 8), h = ri(4, 7), x = ri(2, GW - w - 2), y = ri(2, GH - h - 2);
    if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[gi(x, y)] = 1;

  const carve = (ax, ay, bx, by, t) => {
    const set = (x, y) => {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const X = x + ox, Y = y + oy;
        if (X > 0 && Y > 0 && X < GW - 1 && Y < GH - 1 && grid[gi(X, Y)] === 0) grid[gi(X, Y)] = t;
      }
    };
    let x = ax, y = ay;
    while (x !== bx) { set(x, y); x += Math.sign(bx - x); }
    while (y !== by) { set(x, y); y += Math.sign(by - y); }
    set(x, y);
  };
  // Minimum spanning connections plus a few loops.
  const con = [rooms[0]], left = rooms.slice(1), links = [];
  while (left.length) {
    let bi = 0, bj = 0, bd = 1e9;
    left.forEach((r, i) => con.forEach((c, j) => {
      const d = Math.abs(r.cx - c.cx) + Math.abs(r.cy - c.cy);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }));
    const r = left.splice(bi, 1)[0];
    links.push([con[bj], r]);
    con.push(r);
  }
  for (let i = 0; i < 3; i++) {
    const a = rooms[ri(0, rooms.length - 1)], b = rooms[ri(0, rooms.length - 1)];
    if (a !== b) links.push([a, b]);
  }
  const pw = D.water ?? 0.28, pa = D.acid ?? 0.22;
  for (const [a, b] of links) {
    const q = rng.next();
    carve(a.cx, a.cy, b.cx, b.cy, q < pw ? 2 : q < pw + pa ? 4 : 1);
  }
  const startRoom = rooms[0];
  for (const r of rooms) {
    if (r !== startRoom && rng.next() < (pw > 0.3 ? 0.5 : 0.25) && r.w >= 6 && r.h >= 5) {
      for (let y = r.y + 2; y < r.y + r.h - 2; y++) for (let x = r.x + 2; x < r.x + r.w - 2; x++) grid[gi(x, y)] = 2;
    }
  }
  let dist = bfs(startRoom.cx, startRoom.cy, OPEN);
  const byDist = rooms.filter(r => r !== startRoom).sort((a, b) => dist[gi(b.cx, b.cy)] - dist[gi(a.cx, a.cy)]);
  const metal = shuffleR(byDist.slice(2, 9)).slice(0, 2);
  metal.forEach(r => {
    r.metal = true;
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (inG(x, y) && grid[gi(x, y)] === 0) grid[gi(x, y)] = 6;
  });
  // Drywall and crevices where a wall separates two far-apart (by path) floors.
  const cand = [];
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    if (grid[gi(x, y)] !== 0) continue;
    const L = tAt(x - 1, y), Rr = tAt(x + 1, y), U = tAt(x, y - 1), Dn = tAt(x, y + 1);
    let a = null, b = null;
    if (OPEN(L) && OPEN(Rr) && !OPEN(U) && !OPEN(Dn)) { a = gi(x - 1, y); b = gi(x + 1, y); }
    else if (OPEN(U) && OPEN(Dn) && !OPEN(L) && !OPEN(Rr)) { a = gi(x, y - 1); b = gi(x, y + 1); }
    if (a != null && dist[a] >= 0 && dist[b] >= 0 && Math.abs(dist[a] - dist[b]) > 10) cand.push(gi(x, y));
  }
  shuffleR(cand);
  cand.slice(0, 7).forEach(k => { grid[k] = 3; });
  cand.slice(7, 12).forEach(k => { grid[k] = 5; });
  // Sealed pockets behind drywall hold caches and chests.
  const pockets = [];
  for (const r of shuffleR(rooms.filter(r => r !== startRoom && !r.metal)).slice(0, 6)) {
    if (pockets.length >= 4) break;
    for (let tries = 0; tries < 6; tries++) {
      const [dx, dy] = N4[ri(0, 3)];
      let ex, ey;
      if (dx) { ex = dx > 0 ? r.x + r.w : r.x - 1; ey = ri(r.y + 1, r.y + r.h - 2); }
      else { ey = dy > 0 ? r.y + r.h : r.y - 1; ex = ri(r.x + 1, r.x + r.w - 2); }
      const px = ex + dx * 1.5, py = ey + dy * 1.5;
      let ok = grid[gi(ex, ey)] === 0;
      for (let y = Math.round(py) - 2; y <= Math.round(py) + 2 && ok; y++) for (let x = Math.round(px) - 2; x <= Math.round(px) + 2; x++) {
        if (!inG(x, y) || x < 1 || y < 1 || x >= GW - 1 || y >= GH - 1 || grid[gi(x, y)] !== 0) {
          if (!(x === ex && y === ey)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      const cells = [];
      for (let k = 1; k <= 2; k++) for (let s = 0; s < 2; s++) cells.push([ex + dx * k + (dy ? s : 0), ey + dy * k + (dx ? s : 0)]);
      if (cells.some(([x, y]) => !inG(x, y) || grid[gi(x, y)] !== 0)) continue;
      cells.forEach(([x, y]) => { grid[gi(x, y)] = 1; });
      grid[gi(ex, ey)] = 3;
      cells.door = [ex, ey];
      pockets.push(cells);
      break;
    }
  }
  // Half the pockets hide behind walls that look like plain brick.
  for (const c of pockets) if (rng.next() < 0.5) M.secret[gi(...c.door)] = 1;
  // A sealed lair (5x5, or 4x4 if nothing fits) off one of the far rooms, reached
  // through a crevice or a cracked wall. Every wall position is tried, far rooms first.
  const hidden = [];
  const cands = [];
  for (const r of byDist.filter(r => !r.metal)) {
    const order = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) { order.push([r.x - 1, y, -1, 0], [r.x + r.w, y, 1, 0]); }
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) { order.push([x, r.y - 1, 0, -1], [x, r.y + r.h, 0, 1]); }
    cands.push(...shuffleR(order));
  }
  for (const S of [5, 4]) {
    for (const [ex, ey, dx, dy] of cands) {
      const x0 = dx ? (dx > 0 ? ex + 1 : ex - S) : ex - (S >> 1), y0 = dy ? (dy > 0 ? ey + 1 : ey - S) : ey - (S >> 1);
      if (grid[gi(ex, ey)] !== 0 || x0 < 2 || y0 < 2 || x0 + S > GW - 2 || y0 + S > GH - 2) continue;
      let ok = true;
      for (let y = y0 - 1; y <= y0 + S && ok; y++) for (let x = x0 - 1; x <= x0 + S; x++) if (grid[gi(x, y)] !== 0 && !(x === ex && y === ey)) { ok = false; break; }
      if (!ok) continue;
      for (let y = y0; y < y0 + S; y++) for (let x = x0; x < x0 + S; x++) grid[gi(x, y)] = 1;
      const crev = rng.next() < 0.5;
      grid[gi(ex, ey)] = crev ? 5 : 3;
      if (!crev) M.secret[gi(ex, ey)] = 1;
      hidden.push({ x: x0, y: y0, w: S, h: S, door: [ex, ey], lair: true });
      break;
    }
    if (hidden.length) break;
  }
  dist = bfs(startRoom.cx, startRoom.cy, OPEN);
  return { rooms, startRoom, dist, pockets, byDist, metal, hidden };
}
