// Static level checks, run on every generated district without playing it:
// is everything that matters reachable on foot from the start, are doorways
// and crawlspace mouths clear, are props buried in walls, are there places
// for the horde to spawn. Returns a list of issues (error / warn).
import { G, P, W } from '../core/state.js';
import { M, gi, inG, toG, toW, tAt, topAt, N4 } from '../world/grid.js';

// Acid (4) hurts but can be crossed, as the generators assume.
const walk = t => t === 1 || t === 2 || t === 4 || t === 9 || t === 10;

export function staticChecks() {
  const issues = [];
  const add = (sev, kind, x, z, detail = {}) => issues.push({ sev, kind, x: +(+x).toFixed(1), z: +(+z).toFixed(1), gx: toG(x), gz: toG(z), ...detail });
  // Ground reachable from the start, plus the ring of tiles one step beyond
  // (wall faces where chests and benches stand).
  const sx = toG(P.x), sz = toG(P.z), n = M.W * M.H, reach = new Uint8Array(n), q = [];
  if (inG(sx, sz)) { reach[gi(sx, sz)] = 1; q.push(gi(sx, sz)); }
  while (q.length) {
    const c = q.pop(), x = c % M.W, y = (c / M.W) | 0;
    for (const [dx, dy] of N4) {
      const X = x + dx, Y = y + dy;
      if (!inG(X, Y)) continue;
      const k = gi(X, Y);
      if (reach[k] || !walk(M.grid[k])) continue;
      reach[k] = 1; q.push(k);
    }
  }
  // Second pass: what the rat can reach with its abilities (gnaw boards, squeeze
  // cracks and crawlspaces, hop fences, climb walls onto roofs and back down).
  const reachA = reach.slice(), qa2 = [];
  for (let k = 0; k < n; k++) if (reachA[k]) qa2.push(k);
  while (qa2.length) {
    const c = qa2.pop(), x = c % M.W, y = (c / M.W) | 0;
    for (const [dx, dy] of N4) {
      const X = x + dx, Y = y + dy;
      if (!inG(X, Y) || X === 0 || Y === 0 || X === M.W - 1 || Y === M.H - 1) continue; // the map border is the edge of the world
      const k = gi(X, Y);
      if (reachA[k] || M.grid[k] === 7) continue;
      reachA[k] = 1; qa2.push(k);
    }
  }
  const nearA = (x, z) => { const gx = toG(x), gz = toG(z); return [[0, 0], ...N4].some(([dx, dz]) => inG(gx + dx, gz + dz) && reachA[gi(gx + dx, gz + dz)]); };
  const near = (x, z) => {
    const gx = toG(x), gz = toG(z);
    if (inG(gx, gz) && reach[gi(gx, gz)]) return true;
    return N4.some(([dx, dz]) => inG(gx + dx, gz + dz) && reach[gi(gx + dx, gz + dz)]);
  };
  const onGround = o => (o.y ?? 0) < 0.6;
  // Things the player must be able to walk to (rooftop items are reached by climbing, so skipped).
  const must = [
    ['chest', W.chests.filter(c => !c.open && onGround(c))],
    ['cache', (W.caches || []).filter(c => !c.taken && onGround(c))],
    ['use-point', W.uses.filter(u => !u.done)],
    ['bin', W.bins.filter(b => !b.done)],
    ['nest', W.enemies.filter(e => e.type === 'nest' && !e.dead)],
    ['fungus', (W.fungi || []).filter(f => !f.taken && onGround(f))],
    ['manhole', G.manhole ? [G.manhole] : []],
  ];
  let viaAbility = 0;
  for (const [kind, list] of must) for (const o of list) {
    if (near(o.x, o.z)) continue;
    if (nearA(o.x, o.z)) { viaAbility++; continue; } // behind boards, a crack, a fence or over a roof: by design
    add('error', 'unreachable-' + kind, o.x, o.z);
  }
  // Buried: an item inside a solid tile below its top, or inside a solid prop.
  // (use-points and benches are worked from beside them, so only pickups and nests count.)
  for (const [kind, list] of must) for (const o of list) {
    if (kind === 'use-point' || kind === 'bench' || kind === 'manhole') continue;
    const gx = toG(o.x), gz = toG(o.z), t = tAt(gx, gz), y = o.y ?? 0;
    const inWall = (t === 0 || t === 6) && y < topAt(gx, gz) - 0.5 && Math.min(o.x - (toW(gx) - 2), toW(gx) + 2 - o.x, o.z - (toW(gz) - 2), toW(gz) + 2 - o.z) > 0.6;
    // Another prop's box around it (not its own body, which is centred on it).
    const inProp = W.plats.some(p => !p.thin && Math.hypot(p.x - o.x, p.z - o.z) > 0.35 && Math.abs(p.x - o.x) < p.w / 2 - 0.3 && Math.abs(p.z - o.z) < p.d / 2 - 0.3 && p.y > y + 0.6 && p.y - p.th < y + 0.3);
    if (inWall || inProp) add(kind === 'fungus' || kind === 'bin' ? 'warn' : 'error', 'buried-' + kind, o.x, o.z, { inWall, inProp });
  }
  // The boss lair and every interior must be walkable to.
  if (G.arena && !near(G.arena.x, G.arena.z)) add('error', 'unreachable-lair', G.arena.x, G.arena.z);
  const rooms = new Map();
  for (let k = 0; k < n; k++) if (M.inside[k] && M.grid[k] === 1 && !rooms.has(M.inside[k])) rooms.set(M.inside[k], k);
  for (const [id, k] of rooms) {
    let ok = false;
    for (let j = 0; j < n && !ok; j++) if (M.inside[j] === id && reach[j]) ok = true;
    if (!ok) add('error', 'unreachable-interior', toW(k % M.W), toW((k / M.W) | 0), { id });
  }
  // Solid props standing in doorways or crawlspace mouths, or buried in walls.
  const solidProps = W.plats.filter(p => !p.thin && p.y - p.th < 1.5 && p.y > 0.3);
  for (let k = 0; k < n; k++) {
    if (!M.inside[k] || M.grid[k] !== 1) continue;
    const x = k % M.W, y = (k / M.W) | 0;
    const door = N4.some(([dx, dz]) => inG(x + dx, y + dz) && !M.inside[gi(x + dx, y + dz)] && walk(tAt(x + dx, y + dz)));
    if (!door) continue;
    const cx = toW(x), cz = toW(y);
    if (solidProps.some(p => Math.abs(p.x - cx) < p.w / 2 + 0.6 && Math.abs(p.z - cz) < p.d / 2 + 0.6)) add('error', 'door-blocked', cx, cz);
  }
  for (const net of W.ductNets || []) for (const k of [net.a, net.b]) {
    const x = k % M.W, y = (k / M.W) | 0;
    for (const [dx, dz] of N4) {
      if (!walk(tAt(x + dx, y + dz))) continue;
      const cx = toW(x) + dx * 3.4, cz = toW(y) + dz * 3.4;
      if (solidProps.some(p => Math.abs(p.x - cx) < p.w / 2 + 0.5 && Math.abs(p.z - cz) < p.d / 2 + 0.5)) add('error', 'crawlspace-blocked', cx, cz);
    }
  }
  let buried = 0;
  for (const p of W.plats) {
    const gx = toG(p.x), gz = toG(p.z), t = tAt(gx, gz);
    if ((t === 0 || t === 6) && p.y - p.th < topAt(gx, gz) - 0.5 && p.y < topAt(gx, gz) - 0.1) buried++;
  }
  if (buried > 3) add('warn', 'props-in-walls', P.x, P.z, { count: buried });
  // Somewhere for the horde to come from, and a clear start.
  let ground = 0;
  for (let k = 0; k < n; k++) if (reach[k]) ground++;
  if (ground < 120) add('error', 'tiny-reachable-area', P.x, P.z, { tiles: ground });
  if (W.plats.some(p => !p.thin && Math.abs(p.x - P.x) < p.w / 2 + 0.2 && Math.abs(p.z - P.z) < p.d / 2 + 0.2 && p.y - p.th < P.y + 0.8 && p.y > P.y + 0.1)) add('error', 'start-inside-prop', P.x, P.z);
  return { issues, viaAbility, reachTiles: ground, interiors: rooms.size, uses: W.uses.length, tram: !!W.tram, crane: !!W.crane, rain: false };
}
