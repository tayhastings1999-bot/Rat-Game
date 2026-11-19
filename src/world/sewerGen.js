// Sewer layout: rooms joined by tunnels, water and acid channels, drywall
// shortcuts, crevices, smooth-metal chambers and hidden pockets.
import { seedRng, rng, ri, shuffleR } from '../core/util.js';
import { M, allocMap, gi, inG, tAt, bfs, OPEN, N4, WH } from './grid.js';

export function genSewer(seed, D) {
  seedRng(seed);
  const maxRooms = D.rooms || 26;
  const sideN = D.sideRooms || 0;
  // A little more map when we also place nest-free side rooms (beats / detours).
  allocMap(D.map || (maxRooms > 22 || sideN > 2 ? 64 : 56), 'sewer'); // was 40 (15 rooms), then 56
  const GW = M.W, GH = M.H, grid = M.grid;
  M.hgt.fill(WH);
  const rooms = [];
  if (D.spine) {
    // Serpentine room placement so the MST is a long winding hall (Undersewer's pump-hall beat), not a tight cluster.
    const cols = 5, rows = 5;
    const cellW = Math.floor((GW - 4) / cols), cellH = Math.floor((GH - 4) / rows);
    for (let i = 0; i < maxRooms && i < cols * rows; i++) {
      const row = Math.floor(i / cols);
      let col = i % cols;
      if (row % 2) col = cols - 1 - col;
      const innerW = Math.max(4, cellW - 2), innerH = Math.max(4, cellH - 2);
      const w = ri(4, Math.min(8, innerW)), h = ri(4, Math.min(7, innerH));
      const ox = Math.max(0, cellW - w), oy = Math.max(0, cellH - h);
      const x = 2 + col * cellW + (ox ? ri(0, ox) : 0);
      const y = 2 + row * cellH + (oy ? ri(0, oy) : 0);
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
  } else {
    for (let a = 0; a < 1800 && rooms.length < maxRooms; a++) {
      const w = ri(4, 8), h = ri(4, 7), x = ri(2, GW - w - 2), y = ri(2, GH - h - 2);
      const gap = D.spread || 2;
      if (rooms.some(r => x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
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
  const extraLoops = D.loops != null ? D.loops : 3;
  for (let i = 0; i < extraLoops; i++) {
    const a = rooms[ri(0, rooms.length - 1)], b = rooms[ri(0, rooms.length - 1)];
    if (a !== b) links.push([a, b]);
  }
  const pw = D.water ?? 0.28, pa = D.acid ?? 0.22;
  // The pump-hall beat: send the longest vertical MST link(s) along a map edge and stamp a hall there.
  const pumpLinks = [];
  if (D.pumpHall) {
    const n = D.pumpHalls || 1;
    const ranked = links
      .map((pair, i) => ({ pair, i, d: Math.abs(pair[0].cy - pair[1].cy) }))
      .sort((a, b) => b.d - a.d || a.i - b.i);
    for (let i = 0; i < n && i < ranked.length; i++) pumpLinks.push(ranked[i].pair);
  }
  for (const [a, b] of links) {
    const q = rng.next();
    const t = q < pw ? 2 : q < pw + pa ? 4 : 1;
    const pi = pumpLinks.findIndex(p => p[0] === a && p[1] === b);
    if (pi >= 0) {
      if (D.pumpWrap) {
        // A long unique C-shaped hall around the farther rim so the spine crossing cannot be shortcut.
        const left = 2, right = GW - 3, top = 2, bot = GH - 3;
        const viaTop = a.cy + b.cy, viaBot = (bot - a.cy) + (bot - b.cy);
        const rim = viaBot > viaTop ? bot : top;
        carve(a.cx, a.cy, left, a.cy, t);
        carve(left, a.cy, left, rim, t);
        carve(left, rim, right, rim, t);
        carve(right, rim, right, b.cy, t);
        carve(right, b.cy, b.cx, b.cy, t);
        const midx = Math.round(GW / 2);
        const y0 = rim <= top ? 2 : GH - 7, y1 = rim <= top ? 6 : GH - 3;
        for (let y = y0; y <= y1; y++)
          for (let x = midx - 3; x <= midx + 3; x++)
            if (inG(x, y) && (grid[gi(x, y)] === 0 || grid[gi(x, y)] === t)) grid[gi(x, y)] = 1;
      } else {
        const edge = pi % 2 === 0 ? 2 : GW - 3;
        carve(a.cx, a.cy, edge, a.cy, t);
        carve(edge, a.cy, edge, b.cy, t);
        carve(edge, b.cy, b.cx, b.cy, t);
        const midy = Math.round((a.cy + b.cy) / 2);
        const x0 = edge <= 2 ? 2 : GW - 8, x1 = edge <= 2 ? 7 : GW - 3;
        for (let y = midy - 2; y <= midy + 2; y++)
          for (let x = x0; x <= x1; x++)
            if (inG(x, y) && (grid[gi(x, y)] === 0 || grid[gi(x, y)] === t)) grid[gi(x, y)] = 1;
      }
    } else if (D.detour) {
      // A longer B2 path: dog-leg through a waypoint instead of a short L-tunnel (the bot has to walk it between nests).
      const mx = Math.round((a.cx + b.cx) / 2), my = Math.round((a.cy + b.cy) / 2);
      const ox = a.cy === b.cy ? 0 : (rng.next() < 0.5 ? 6 : -6);
      const oy = a.cx === b.cx ? 0 : (rng.next() < 0.5 ? 6 : -6);
      const wx = Math.max(2, Math.min(GW - 3, mx + ox)), wy = Math.max(2, Math.min(GH - 3, my + oy));
      carve(a.cx, a.cy, wx, wy, t);
      carve(wx, wy, b.cx, b.cy, t);
    } else carve(a.cx, a.cy, b.cx, b.cy, t);
  }
  const startRoom = rooms[0];
  for (const r of rooms) {
    if (r !== startRoom && rng.next() < (pw > 0.3 ? 0.5 : 0.25) && r.w >= 6 && r.h >= 5) {
      for (let y = r.y + 2; y < r.y + r.h - 2; y++) for (let x = r.x + 2; x < r.x + r.w - 2; x++) grid[gi(x, y)] = 2;
    }
  }
  // Nest-free side rooms off the mid-route: longer B2 exploration without adding nests.
  if (sideN > 0) {
    for (const r of shuffleR(rooms.filter(r => r !== startRoom))) {
      if (rooms.filter(x => x.side).length >= sideN) break;
      for (const [dx, dy] of shuffleR(N4.slice())) {
        const gap = 2, w = ri(4, 6), h = ri(4, 6);
        const x = dx > 0 ? r.x + r.w + gap : dx < 0 ? r.x - gap - w : r.x + ri(0, Math.max(0, r.w - w));
        const y = dy > 0 ? r.y + r.h + gap : dy < 0 ? r.y - gap - h : r.y + ri(0, Math.max(0, r.h - h));
        if (x < 2 || y < 2 || x + w >= GW - 2 || y + h >= GH - 2) continue;
        if (rooms.some(o => x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y)) continue;
        let ok = true;
        for (let yy = y - 1; yy <= y + h && ok; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (inG(xx, yy) && grid[gi(xx, yy)] !== 0) ok = false;
        if (!ok) continue;
        const side = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), nestFree: true, side: true };
        rooms.push(side);
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[gi(xx, yy)] = 1;
        carve(r.cx, r.cy, side.cx, side.cy, 1);
        break;
      }
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
  const nCut = D.cuts != null ? D.cuts : 12;
  const nDry = Math.min(7, nCut), nCrev = Math.max(0, nCut - nDry);
  cand.slice(0, nDry).forEach(k => { grid[k] = 3; });
  cand.slice(nDry, nDry + nCrev).forEach(k => { grid[k] = 5; });
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
