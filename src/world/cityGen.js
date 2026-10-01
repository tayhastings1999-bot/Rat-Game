// Procedural neighbourhood: a jittered street grid, sidewalks, and blocks
// split into lots (buildings of varying heights, parks, fenced yards,
// parking lots) with alleys, boarded-up slots and crevices between them.
import { seedRng, rng, ri, shuffleR } from '../core/util.js';
import { M, TL, allocMap, gi, inG, tAt, bfs, OPEN, N4 } from './grid.js';

const SIZE = 52;

export function genCity(seed, D) {
  seedRng(seed);
  allocMap(SIZE, 'city');
  const W = SIZE, grid = M.grid, hgt = M.hgt;
  grid.fill(TL.WALL);
  hgt.fill(12);
  const set = (x, y, t, h) => { if (inG(x, y)) { grid[gi(x, y)] = t; if (h != null) hgt[gi(x, y)] = h; } };

  // 1. Street grid with jittered spacing.
  const lines = axis => {
    const out = [];
    let p = ri(3, 5);
    while (p + 3 < W - 6) {
      const w = ri(2, 3);
      out.push([p, w]);
      p += w + ri(8, 11);
    }
    return out;
  };
  const roadsX = lines(), roadsZ = lines();
  for (const [x, w] of roadsX) for (let i = 0; i < w; i++) for (let y = 1; y < W - 1; y++) set(x + i, y, TL.ROAD, 0);
  for (const [z, w] of roadsZ) for (let i = 0; i < w; i++) for (let x = 1; x < W - 1; x++) set(x, z + i, TL.ROAD, 0);

  // 2. Blocks between roads (plus the map edge), each ringed by sidewalk.
  const spans = roads => {
    const out = [];
    let s = 1;
    for (const [p, w] of roads) { if (p - s >= 3) out.push([s, p - 1]); s = p + w; }
    if (W - 2 - s >= 2) out.push([s, W - 2]);
    return out;
  };
  const blocks = [];
  for (const [x0, x1] of spans(roadsX)) for (const [z0, z1] of spans(roadsZ)) blocks.push({ x0, x1, z0, z1 });

  const lots = [], alleys = [];
  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0 + 1, h = z1 - z0 + 1;
    const canX = w >= 7, canZ = h >= 7;
    if ((!canX && !canZ) || (depth > 1 && rng.next() < 0.28 && w * h <= 30)) { lots.push({ x: x0, y: z0, w, h }); return; }
    const alongX = canX && (!canZ || w >= h);
    const alley = rng.next() < 0.5;
    if (alongX) {
      const c = ri(x0 + 3, x1 - 3 - (alley ? 1 : 0));
      if (alley) { for (let z = z0; z <= z1; z++) set(c, z, TL.FLOOR, 0); alleys.push({ x: c, y: z0, w: 1, h }); split(x0, z0, c - 1, z1, depth + 1); split(c + 1, z0, x1, z1, depth + 1); }
      else { split(x0, z0, c, z1, depth + 1); split(c + 1, z0, x1, z1, depth + 1); }
    } else {
      const c = ri(z0 + 3, z1 - 3 - (alley ? 1 : 0));
      if (alley) { for (let x = x0; x <= x1; x++) set(x, c, TL.FLOOR, 0); alleys.push({ x: x0, y: c, w, h: 1 }); split(x0, z0, x1, c - 1, depth + 1); split(x0, c + 1, x1, z1, depth + 1); }
      else { split(x0, z0, x1, c, depth + 1); split(x0, c + 1, x1, z1, depth + 1); }
    }
  };
  // One mid-sized block away from the centre is kept whole: a walled compound that becomes the mini-boss lair.
  const eligible = blocks.filter(b => b.x0 > 1 && b.z0 > 1 && b.x1 < W - 2 && b.z1 < W - 2 && b.x1 - b.x0 >= 8 && b.z1 - b.z0 >= 8 && Math.hypot((b.x0 + b.x1) / 2 - W / 2, (b.z0 + b.z1) / 2 - W / 2) > 8);
  const lairBlock = eligible.length ? eligible[ri(0, eligible.length - 1)] : null;
  for (const b of blocks) {
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      const edge = x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1;
      const border = x <= 1 || z <= 1 || x >= W - 2 || z >= W - 2;
      if (edge && !border) set(x, z, TL.FLOOR, 0);
    }
    const ix0 = b.x0 === 1 ? 1 : b.x0 + 1, iz0 = b.z0 === 1 ? 1 : b.z0 + 1, ix1 = b.x1 === W - 2 ? W - 2 : b.x1 - 1, iz1 = b.z1 === W - 2 ? W - 2 : b.z1 - 1;
    if (b === lairBlock) lots.push({ x: ix0, y: iz0, w: ix1 - ix0 + 1, h: iz1 - iz0 + 1, compound: true });
    else if (ix1 - ix0 >= 1 && iz1 - iz0 >= 1) split(ix0, iz0, ix1, iz1, 0);
  }

  // 3. Lot types.
  const pickH = () => D.heights[ri(0, D.heights.length - 1)];
  for (const L of lots) {
    const q = rng.next(), big = L.w >= 3 && L.h >= 3;
    const fill = (t, h) => { for (let y = L.y; y < L.y + L.h; y++) for (let x = L.x; x < L.x + L.w; x++) set(x, y, t, h); };
    if (L.compound) { L.type = 'bldg'; fill(TL.WALL, Math.max(6, pickH())); continue; }
    if (big && q < D.park) { L.type = 'park'; fill(TL.GRASS, 0); }
    else if (big && q < D.park + D.yard) {
      L.type = 'yard'; fill(TL.FLOOR, 0);
      for (let y = L.y; y < L.y + L.h; y++) for (let x = L.x; x < L.x + L.w; x++) {
        if (x === L.x || y === L.y || x === L.x + L.w - 1 || y === L.y + L.h - 1) set(x, y, TL.FENCE, 1.7);
      }
      // Gate(s) facing open ground; a crevice gap on another side.
      const sides = shuffleR([
        [L.x + (L.w >> 1), L.y, 0, -1], [L.x + (L.w >> 1), L.y + L.h - 1, 0, 1],
        [L.x, L.y + (L.h >> 1), -1, 0], [L.x + L.w - 1, L.y + (L.h >> 1), 1, 0],
      ]);
      let gates = 0;
      for (const [x, y, dx, dy] of sides) if (OPEN(tAt(x + dx, y + dy)) && gates < 2) { set(x, y, gates ? TL.CREV : TL.FLOOR, gates ? 1.7 : 0); gates++; }
      if (L.w >= 5 && L.h >= 5 && rng.next() < 0.6) { const sx = L.x + L.w - 3, sy = L.y + 1; for (let y = sy; y < sy + 2; y++) for (let x = sx; x < sx + 2; x++) set(x, y, TL.WALL, 3.2); }
    }
    else if (big && q < D.park + D.yard + D.lot) { L.type = 'lot'; fill(TL.ROAD, 0); }
    else {
      L.type = 'bldg';
      const metal = rng.next() < D.metal;
      fill(metal ? TL.METAL : TL.WALL, pickH());
      L.metal = metal;
    }
  }

  // 4. Boarded slots through wide buildings: chew the plywood (or squeeze the crevice) for a shortcut.
  const slots = [];
  for (const L of shuffleR(lots.filter(l => l.type === 'bldg' && (l.w >= 4 || l.h >= 4))).slice(0, 7)) {
    const alongX = L.w >= L.h;
    const n = alongX ? L.w : L.h, c = alongX ? L.y + (L.h >> 1) : L.x + (L.w >> 1);
    const cells = [];
    for (let i = 0; i < n; i++) cells.push(alongX ? [L.x + i, c] : [c, L.y + i]);
    const [ax, ay] = cells[0], [bx, by] = cells[cells.length - 1];
    const d = alongX ? [1, 0] : [0, 1];
    if (!OPEN(tAt(ax - d[0], ay - d[1])) || !OPEN(tAt(bx + d[0], by + d[1]))) continue;
    const bh = hgt[gi(ax, ay)];
    cells.forEach(([x, y]) => set(x, y, TL.FLOOR, 0));
    const capT = rng.next() < 0.65 ? TL.DRY : TL.CREV;
    set(ax, ay, TL.DRY, 3.4);
    set(bx, by, capT, capT === TL.CREV ? bh : 3.4);
    slots.push(cells);
  }

  // 5. Flooded potholes and chemical spills.
  const road = [];
  for (let k = 0; k < W * W; k++) if (grid[k] === TL.ROAD) road.push(k);
  shuffleR(road);
  const puddles = Math.round(road.length * (D.water || 0) * 0.04), spills = Math.round(road.length * (D.acid || 0) * 0.04);
  for (let i = 0; i < puddles + spills && i < road.length; i++) {
    const k = road[i], x = k % W, y = (k / W) | 0, t = i < puddles ? TL.WATER : TL.ACID;
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (tAt(x + ox, y + oy) === TL.ROAD) set(x + ox, y + oy, t, 0);
  }

  // 6. Rooms (for prop placement and patrols): intersections, road segments, open lots, alleys.
  const rooms = [];
  for (const [x, wx] of roadsX) for (const [z, wz] of roadsZ) rooms.push({ x: x - 1, y: z - 1, w: wx + 2, h: wz + 2, kind: 'cross' });
  for (const L of lots) if (L.type !== 'bldg') rooms.push({ x: L.x, y: L.y, w: L.w, h: L.h, kind: L.type });
  for (const a of alleys) if (a.w * a.h >= 4) rooms.push({ ...a, kind: 'alley' });
  for (const r of rooms) { r.cx = r.x + (r.w >> 1); r.cy = r.y + (r.h >> 1); }

  // 7. Keep only ground reachable from the centre; seal off unreachable pockets as buildings.
  let startRoom = rooms.filter(r => r.kind === 'cross').sort((a, b) => Math.hypot(a.cx - W / 2, a.cy - W / 2) - Math.hypot(b.cx - W / 2, b.cy - W / 2))[0];
  let dist = bfs(startRoom.cx, startRoom.cy, t => OPEN(t) || t === TL.DRY || t === TL.CREV || t === TL.FENCE);
  for (let k = 0; k < W * W; k++) {
    if (OPEN(grid[k]) && dist[k] < 0) { grid[k] = TL.WALL; hgt[k] = 4.5; }
  }
  dist = bfs(startRoom.cx, startRoom.cy, OPEN);
  const live = rooms.filter(r => dist[gi(r.cx, r.cy)] >= 0);
  const byDist = live.filter(r => r !== startRoom).sort((a, b) => dist[gi(b.cx, b.cy)] - dist[gi(a.cx, a.cy)]);

  // 7b. Secrets: hollow out a few big buildings into hidden courtyards behind a
  // cracked (gnawable, disguised) wall; the biggest becomes a mini-boss lair.
  const hidden = [];
  const solidLot = L => { for (let y = L.y; y < L.y + L.h; y++) for (let x = L.x; x < L.x + L.w; x++) { const t = grid[gi(x, y)]; if (t !== TL.WALL && t !== TL.METAL) return false; } return true; };
  const bigLots = shuffleR(lots.filter(L => L.type === 'bldg' && L.w >= 4 && L.h >= 4 && L.x > 1 && L.y > 1 && L.x + L.w < W - 1 && L.y + L.h < W - 1 && solidLot(L)));
  bigLots.sort((a, b) => b.w * b.h - a.w * a.h);
  const lairLot = bigLots.find(L => L.compound) || bigLots.find(L => L.w >= 5 && L.h >= 5) || bigLots[0];
  for (const L of [lairLot, ...shuffleR(bigLots.filter(l => l !== lairLot)).slice(0, 3)].filter(Boolean)) {
    const doors = [];
    for (let x = L.x + 1; x < L.x + L.w - 1; x++) { doors.push([x, L.y, 0, -1]); doors.push([x, L.y + L.h - 1, 0, 1]); }
    for (let y = L.y + 1; y < L.y + L.h - 1; y++) { doors.push([L.x, y, -1, 0]); doors.push([L.x + L.w - 1, y, 1, 0]); }
    const door = shuffleR(doors).find(([x, y, dx, dy]) => { const k = gi(x + dx, y + dy); return OPEN(grid[k]) && dist[k] >= 0; });
    if (!door) continue;
    const h = hgt[gi(L.x, L.y)];
    for (let y = L.y + 1; y < L.y + L.h - 1; y++) for (let x = L.x + 1; x < L.x + L.w - 1; x++) set(x, y, TL.FLOOR, 0);
    const lair = L === lairLot;
    set(door[0], door[1], lair && rng.next() < 0.5 ? TL.CREV : TL.DRY, h);
    if (grid[gi(door[0], door[1])] === TL.DRY) M.secret[gi(door[0], door[1])] = 1;
    hidden.push({ x: L.x + 1, y: L.y + 1, w: L.w - 2, h: L.h - 2, door: [door[0], door[1]], lair });
  }

  // 7c. Enterable buildings: hollow a few more lots into rooms with a street
  // door (and sometimes a back door bolted from the inside). A roof covers
  // them; the camera cuts the walls away when you step in.
  const interiors = [];
  const KINDS = ['diner', 'workshop', 'apartment', 'laundromat'];
  const okLot = (L, lo, hi) => L.type === 'bldg' && !L.compound && Math.min(L.w, L.h) >= lo && Math.max(L.w, L.h) >= 4 && L.w <= hi && L.h <= hi && L.x > 1 && L.y > 1 && L.x + L.w < W - 1 && L.y + L.h < W - 1 && solidLot(L);
  // Roomy lots first; if that leaves the district with fewer than two, accept narrower ones.
  const cands = [...shuffleR(lots.filter(L => okLot(L, 4, 9))), ...shuffleR(lots.filter(L => okLot(L, 3, 12) && !okLot(L, 4, 9)))];
  for (const L of cands) {
    if (interiors.length >= 4 || (interiors.length >= 2 && !okLot(L, 4, 9))) break;
    if (!solidLot(L)) continue;
    const doors = [];
    for (let x = L.x + 1; x < L.x + L.w - 1; x++) { doors.push([x, L.y, 0, -1]); doors.push([x, L.y + L.h - 1, 0, 1]); }
    for (let y = L.y + 1; y < L.y + L.h - 1; y++) { doors.push([L.x, y, -1, 0]); doors.push([L.x + L.w - 1, y, 1, 0]); }
    const reach = ([x, y, dx, dy]) => { const k = gi(x + dx, y + dy); return OPEN(grid[k]) && dist[k] >= 0; };
    const front = shuffleR(doors).find(reach);
    if (!front) continue;
    const back = doors.find(d => reach(d) && Math.abs(d[0] - front[0]) + Math.abs(d[1] - front[1]) > 3 && (d[2] !== front[2] || d[3] !== front[3]));
    const h = hgt[gi(L.x, L.y)], id = interiors.length + 1;
    for (let y = L.y + 1; y < L.y + L.h - 1; y++) for (let x = L.x + 1; x < L.x + L.w - 1; x++) { set(x, y, TL.FLOOR, 0); M.inside[gi(x, y)] = id; }
    set(front[0], front[1], TL.FLOOR, 0);
    M.inside[gi(front[0], front[1])] = id;
    // Back door: bolted from the inside (secret = 2). Unbolt it on your way out for a shortcut.
    if (back) { set(back[0], back[1], TL.DRY, h); M.secret[gi(back[0], back[1])] = 2; }
    const kind = interiors.some(i => i.kind === 'laundromat') || (L.w < 5 && L.h < 5) ? KINDS[(interiors.length + ri(0, 2)) % 3] : rng.next() < 0.7 ? 'laundromat' : KINDS[ri(0, 2)];
    interiors.push({ id, x: L.x + 1, y: L.y + 1, w: L.w - 2, h: L.h - 2, roof: h, door: front, back: back || null, kind });
  }

  // 8. Street furniture spots.
  const lampSpots = [], neonSpots = [], carSpots = [], lineSpots = [], treeSpots = [], dumpSpots = [];
  for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = gi(x, y), t = grid[k];
    if (t === TL.FLOOR) {
      for (const [dx, dy] of N4) if (tAt(x + dx, y + dy) === TL.ROAD && (x * 7 + y * 13) % 5 === 0) { lampSpots.push({ gx: x, gy: y, dx, dy }); break; }
    }
    if (t === TL.WALL || t === TL.METAL) {
      for (const [dx, dy] of N4) if (tAt(x + dx, y + dy) === TL.FLOOR && rng.next() < 0.06) { neonSpots.push({ gx: x, gy: y, dx, dy, h: hgt[k] }); break; }
    }
    if (t === TL.GRASS && rng.next() < 0.18) treeSpots.push({ gx: x, gy: y });
  }
  for (const L of lots) if (L.type === 'lot') for (let y = L.y; y < L.y + L.h; y++) for (let x = L.x; x < L.x + L.w; x++) if (rng.next() < 0.35) carSpots.push({ gx: x, gy: y, along: L.w > L.h ? 'z' : 'x' });
  for (const [x] of roadsX) for (let y = 2; y < W - 2; y++) if (rng.next() < 0.05 && tAt(x, y) === TL.ROAD) carSpots.push({ gx: x, gy: y, along: 'z' });
  for (const [z, w] of roadsZ) for (let x = 2; x < W - 2; x++) if (rng.next() < 0.05 && tAt(x, z + w - 1) === TL.ROAD) carSpots.push({ gx: x, gy: z + w - 1, along: 'x' });
  for (const a of alleys) if (rng.next() < 0.6) dumpSpots.push({ gx: a.x + (a.w >> 1), gy: a.y + (a.h >> 1), along: a.w > a.h ? 'x' : 'z' });
  // Power lines: across a road, roof to roof, when the roofs are close in height.
  for (const [x, w] of roadsX) for (let y = 3; y < W - 3; y += ri(3, 6)) {
    const a = [x - 2, y], b = [x + w + 1, y];
    const ta = tAt(...a), tb = tAt(...b);
    if ((ta === TL.WALL || ta === TL.METAL) && (tb === TL.WALL || tb === TL.METAL)) {
      const ha = hgt[gi(...a)], hb = hgt[gi(...b)];
      if (Math.abs(ha - hb) <= 1.6) lineSpots.push({ axis: 'x', g0: a[0], g1: b[0], gz: y, h: Math.min(ha, hb) });
    }
  }
  for (const [z, w] of roadsZ) for (let x = 3; x < W - 3; x += ri(3, 6)) {
    const a = [x, z - 2], b = [x, z + w + 1];
    const ta = tAt(...a), tb = tAt(...b);
    if ((ta === TL.WALL || ta === TL.METAL) && (tb === TL.WALL || tb === TL.METAL)) {
      const ha = hgt[gi(...a)], hb = hgt[gi(...b)];
      if (Math.abs(ha - hb) <= 1.6) lineSpots.push({ axis: 'z', g0: a[1], g1: b[1], gx: x, h: Math.min(ha, hb) });
    }
  }

  return { rooms: live, startRoom, dist, pockets: [], byDist, metal: [], lots, slots, hidden, alleys, interiors, roadsX, roadsZ, lampSpots, neonSpots, carSpots, lineSpots, treeSpots, dumpSpots };
}
