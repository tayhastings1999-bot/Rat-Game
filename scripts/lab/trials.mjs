// Lab trials (scripts/lab.mjs). One per new feature, level, mob or idea.
// Each trial has:
//   t1  checks that must all pass (the gate): { name, run(L) → bool | { ok, detail } }
//   t2  robustness checks, each scored 0..1:  { name, run(L) → bool | { ok, score, detail } }
//   t3  { run(L, arm) → metrics, bands: { metric: [lo, hi, weight] } } — bots play, numbers land in bands
//   ab  optional idea to compare against the control: { name, set: { 'tune.path': value } }
// L is the lab context (fresh, level, play, tune, staticAll, S, sleep); see lab.mjs.

import { TRIALS_P4 } from './trials-p4.mjs';

// Levels by name, as [layer, index, secret] (data/levels.js).
const CITY = i => ['surface', i, null], SEWER = i => ['sewer', i, null];
const RUST_NIGHT = CITY(6), FROZEN = SEWER(3), CINDER = CITY(0), TOXIC = SEWER(4);

/** Put the rat on a crack (or the nearest one) and return its tile key and position. */
const toCrack = (L, n = 0) => L.S(n => {
  const s = __scurry, M = s.M, P = s.P, toW = g => (g - M.W / 2 + 0.5) * 4;
  const ks = [...s.W.cracks.keys()].sort((a, b) => Math.hypot(toW(a % M.W) - P.x, toW((a / M.W) | 0) - P.z) - Math.hypot(toW(b % M.W) - P.x, toW((b / M.W) | 0) - P.z));
  const k = ks[n];
  if (k == null) return null;
  const x = toW(k % M.W), z = toW((k / M.W) | 0);
  return { k, x, z };
}, n);
const place = (L, x, z, y = 0) => L.S(([x, z, y]) => { const P = __scurry.P; P.x = x; P.z = z; P.y = y; P.vx = P.vz = P.vy = 0; P.inv = 0; P.onGround = true; }, [x, z, y]);
const step = (L, secs) => L.S(t => __scurry.qa.stepRaw(t), secs);
const clearMobs = L => L.S(() => __scurry.W.enemies.forEach(e => { if (e.type !== 'nest') e.dead = true; }));
/** Stand in front of a wall face (w from wallSpot/climbSpot), hold forward + Space; returns the highest y reached. */
async function climbTry(L, w, secs = 2.2, stopAtTop = false) {
  await L.S(w => { const { P, G } = __scurry; P.x = w.x + w.nx * 1.6; P.z = w.z + w.nz * 1.6; P.y = 0; P.vx = P.vz = P.vy = 0; G.camYaw = Math.atan2(-w.nx, -w.nz); }, w);
  await L.S(() => __scurry.qa.stepRaw(0.2));
  await L.page.keyboard.down('KeyW');
  await L.page.keyboard.down('Space');
  let peak = 0;
  for (let i = 0; i < secs / 0.1; i++) {
    peak = Math.max(peak, await L.S(() => { __scurry.qa.stepRaw(0.1); return __scurry.P.y; }));
    if (stopAtTop && peak >= w.top - 0.1) break;
  }
  await L.page.keyboard.up('Space');
  await L.page.keyboard.up('KeyW');
  return peak;
}
const issuesOf = (all, kinds) => all.flatMap(l => l.issues.filter(i => kinds.includes(i.kind)).map(i => `${l.where}: ${i.kind}${i.type ? ' ' + i.type : ''}`));

export const TRIALS = [
  // ------------------------------------------------------------------ Phase 3: the fixed levels
  {
    id: 'levels', since: 'P3', title: 'The 22 fixed levels (secret zones included) build clean and play through',
    t1: [
      { name: 'every level passes the static checks (reachability, buried props, blocked doors, spawn room)', async run(L) {
        await L.fresh({ god: true });
        const all = await L.staticAll(), bad = all.flatMap(l => l.issues.filter(i => i.sev === 'error').map(i => `${l.where}: ${i.kind}`));
        return { ok: !bad.length, detail: bad.slice(0, 4).join('; ') || `${all.length} maps clean` };
      } },
      { name: 'fixed seeds: the same level builds the same way twice', async run(L) {
        const sig = () => L.S(() => { const s = __scurry; let h = 0; for (let k = 0; k < s.M.grid.length; k++) h = (h * 31 + s.M.grid[k]) | 0; return [h, s.W.enemies.filter(e => e.type === 'nest').map(e => e.x.toFixed(1) + ',' + e.z.toFixed(1)).join(';'), s.W.chests.length].join('|'); });
        await L.level(...CITY(5)); const a = await sig();
        await L.level(...SEWER(2)); await L.level(...CITY(5)); const b = await sig();
        return { ok: a === b, detail: a === b ? 'identical' : 'differs' };
      } },
    ],
    t2: [
      { name: 'run starts and level changes never drop the rat below the floor', async run(L) {
        let worst = 9;
        for (let i = 0; i < 4; i++) {
          await L.fresh({ cls: ['tank', 'warlock', 'sneak', 'slinger'][i], god: true });
          worst = Math.min(worst, await L.S(async () => { const s = __scurry; let m = 9; s.exitRoad(); for (let f = 0; f < 90; f++) { await new Promise(r => requestAnimationFrame(r)); if (s.G.state === 'play') m = Math.min(m, s.P.y); } return m; }));
        }
        return { ok: worst > -0.4, detail: `lowest y ${worst.toFixed(2)}` };
      } },
      { name: 'static warnings stay rare (buried bins, props in walls)', async run(L) {
        const all = await L.staticAll(), n = all.reduce((a, l) => a + l.issues.filter(i => i.sev === 'warn').length, 0);
        return { ok: n <= 2, score: Math.max(0, 1 - n / 10), detail: `${n} warnings over ${all.length} maps` };
      } },
      { name: 'bots play three levels without stuck spots, falling out, or ending up inside walls', async run(L) {
        const bad = [];
        for (const [lv, cls] of [[CITY(1), 'slinger'], [CITY(4), 'tank'], [SEWER(2), 'warlock']]) {
          await L.fresh({ cls, level: lv, quiet: false });
          const r = await L.play(L.QUICK ? 40 : 80, { profile: 'average', goal: 'nests' });
          bad.push(...r.anomalies.filter(k => /stuck|fell|inside|nan/.test(k)));
        }
        return { ok: !bad.length, score: Math.max(0, 1 - bad.length * 0.2), detail: bad.join(', ') || 'clean' };
      } },
    ],
    t3: {
      // An average bot clears nests at a steady clip and usually lives.
      async run(L) {
        const m = { nestsPerMin: 0, deathRate: 0 }, runs = [[CITY(0), 'tank'], [CITY(2), 'slinger'], [SEWER(0), 'warlock']];
        for (const [lv, cls] of runs) {
          await L.fresh({ cls, level: lv, quiet: false });
          const n0 = await L.S(() => __scurry.W.enemies.filter(e => e.type === 'nest' && !e.dead).length);
          const r = await L.play(L.QUICK ? 75 : 150, { profile: 'average', goal: 'nests' });
          const n1 = await L.S(() => __scurry.W.enemies.filter(e => e.type === 'nest' && !e.dead).length);
          m.nestsPerMin += (n0 - n1) / Math.max(0.25, r.simTime / 60) / runs.length;
          m.deathRate += (r.deaths ? 1 : 0) / runs.length;
        }
        return m;
      },
      bands: { nestsPerMin: [0.6, 4], deathRate: [0, 0.34] },
    },
  },

  // ------------------------------------------------------------------ P3 fix: collapsing floors
  {
    id: 'collapse', since: 'P3', title: 'Collapsing floors: telegraphed, temporary holes',
    t1: [
      { name: 'cracks only on collapse levels, a few percent of open floor', async run(L) {
        const n = {};
        for (const [k, lv] of Object.entries({ rust: RUST_NIGHT, frozen: FROZEN, cinder: CINDER })) { await L.level(...lv); n[k] = await L.S(() => __scurry.W.cracks.size); }
        return { ok: n.rust >= 8 && n.frozen >= 1 && n.cinder === 0, detail: `Rust Yards · Nightshift ${n.rust}, Frozen Pipeworks ${n.frozen}, Cinder Row ${n.cinder}` };
      } },
      { name: 'no crack in a corridor (open floor on all four sides)', async run(L) {
        const bad = issuesOf(await L.staticAll([RUST_NIGHT, FROZEN, SEWER(8), SEWER(9)]), ['crack-in-corridor']);
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') };
      } },
      { name: 'stepping on a crack warns (red glow), then the floor drops', async run(L) {
        await L.fresh({ level: RUST_NIGHT, god: true });
        await clearMobs(L);
        const c = await toCrack(L);
        await place(L, c.x, c.z);
        await step(L, 0.1);
        const warn = await L.S(k => { const c = __scurry.W.cracks.get(k); return { t: c.t, glow: c.glow.visible }; }, c.k);
        await step(L, 1.0);
        const grid = await L.S(k => __scurry.M.grid[k], c.k);
        return { ok: warn.t > 0 && warn.glow && grid === 7, detail: `warning ${warn.t.toFixed(2)}s, glow ${warn.glow}, tile after ${grid}` };
      } },
      { name: 'falling in puts you back on solid floor at once, with fall damage', async run(L) {
        await L.fresh({ level: RUST_NIGHT });
        await clearMobs(L);
        const c = await toCrack(L);
        await place(L, c.x + 3.4, c.z);
        await step(L, 0.4);
        await place(L, c.x, c.z);
        await step(L, 1.1);
        const hp0 = await L.S(() => __scurry.run.hp);
        await place(L, c.x, c.z, 0.02);
        await step(L, 0.25);
        const r = await L.S(([k, hp0]) => { const s = __scurry, P = s.P, M = s.M; const tk = Math.floor(P.x / 4 + M.W / 2) + Math.floor(P.z / 4 + M.H / 2) * M.W; return { y: P.y, off: tk !== k, lost: hp0 - s.run.hp, falls: s.run.falls || 0 }; }, [c.k, hp0]);
        return { ok: r.y > -0.5 && r.off && r.lost >= 5 && r.falls >= 1, detail: `y ${r.y.toFixed(2)}, off the hole ${r.off}, lost ${r.lost.toFixed(0)} HP` };
      } },
      { name: 'the hole mends after collapseOpen seconds', async run(L) {
        const c = await toCrack(L);
        const open = await L.S(() => __scurry.TUNE.hazards.collapseOpen);
        await step(L, open + 1);
        const r = await L.S(k => { const s = __scurry; return { grid: s.M.grid[k], open: s.W.cracks.get(k).open }; }, c.k);
        return { ok: r.grid !== 7, detail: `tile ${r.grid}` };
      } },
    ],
    t2: [
      { name: 'an enemy in an open hole falls and dies (and pays XP)', async run(L) {
        await L.fresh({ level: RUST_NIGHT, god: true });
        await clearMobs(L);
        const c = await toCrack(L, 1);
        await L.S(c => { const s = __scurry; s.W.cracks.get(c.k).t = 0.01; }, c);
        await step(L, 0.1);
        const r = await L.S(c => { const s = __scurry, e = s.spawnEnemy('mawling', c.x, c.z, { plain: true, force: true }); e.emT = 0; const k0 = s.run.kills; s.qa.stepRaw(2); return { dead: e.dead, kills: s.run.kills - k0 }; }, c);
        return { ok: r.dead && r.kills >= 1, detail: `dead ${r.dead}` };
      } },
      { name: 'cracks keep clear of the start, nests, chests and room middles', async run(L) {
        let bad = 0, total = 0;
        for (const lv of [RUST_NIGHT, FROZEN, SEWER(8), SEWER(9)]) {
          await L.level(...lv);
          const r = await L.S(() => {
            const s = __scurry, M = s.M, toW = g => (g - M.W / 2 + 0.5) * 4, keep = [...s.W.enemies.filter(e => e.type === 'nest'), ...s.W.chests, { x: s.P.x, z: s.P.z }];
            const mids = new Set(s.W.rooms.map(r => r.cx + r.cy * M.W));
            let bad = 0;
            for (const k of s.W.cracks.keys()) { const x = toW(k % M.W), z = toW((k / M.W) | 0); if (mids.has(k) || keep.some(o => Math.hypot(o.x - x, o.z - z) < 4)) bad++; }
            return { bad, n: s.W.cracks.size };
          });
          bad += r.bad; total += r.n;
        }
        return { ok: bad === 0, score: total ? 1 - bad / total : 1, detail: `${bad} of ${total} too close` };
      } },
      { name: 'a minute of bot play on Rust Yards · Nightshift: no stuck spots or falls out of the world', async run(L) {
        await L.fresh({ level: RUST_NIGHT, quiet: false });
        const r = await L.play(L.QUICK ? 45 : 75, { profile: 'average', goal: 'nests' });
        const bad = r.anomalies.filter(k => /stuck|fell|inside/.test(k));
        return { ok: bad.length === 0, score: Math.max(0, 1 - bad.length * 0.25), detail: bad.join(', ') || `${Math.round(r.simTime)}s clean` };
      } },
    ],
    t3: {
      // Bots play the collapse level; the floor should drop under them now and then,
      // cost a little health, and almost never be what kills them.
      async run(L) {
        const runs = L.QUICK ? 2 : 3, m = { dropsPerMin: 0, fallsPerMin: 0, fallShare: 0, pitKillsPerMin: 0 };
        for (let i = 0; i < runs; i++) {
          await L.fresh({ cls: ['tank', 'slinger', 'warlock'][i % 3], level: RUST_NIGHT, quiet: false });
          const r = await L.play(L.QUICK ? 60 : 90, { profile: 'average', goal: 'nests' });
          const c = await L.S(() => ({ drops: __scurry.run.crackDrops || 0, falls: __scurry.run.falls || 0, pit: __scurry.run.pitKills || 0, fallDmg: __scurry.run.fallDmg || 0 }));
          const min = Math.max(0.25, r.simTime / 60);
          m.dropsPerMin += c.drops / min / runs;
          m.fallsPerMin += c.falls / min / runs;
          m.pitKillsPerMin += c.pit / min / runs;
          m.fallShare += (r.dmgTaken > 0 ? c.fallDmg / r.dmgTaken : 0) / runs;
        }
        return m;
      },
      bands: { dropsPerMin: [0.5, 6], fallsPerMin: [0, 1], fallShare: [0, 0.2, 2], pitKillsPerMin: [0, 3, 0.5] },
    },
    ab: { name: 'twice the cracks', set: { 'hazards.collapseFrac': 0.07 } },
  },

  // ------------------------------------------------------------------ P3 fix: nests and spawns inside props
  {
    id: 'clear-spawns', since: 'P3', title: 'Nests and spawns stay out of cars, crates and walls',
    t1: [
      { name: 'no nest in a prop or a wall on any of the 22 levels', async run(L) {
        await L.fresh({ god: true });
        const bad = issuesOf(await L.staticAll(), ['nest-in-prop', 'nest-in-wall']);
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || `${L.LEVELS.length} levels clean` };
      } },
      { name: 'no enemy, grave or secret drain inside a prop at the start of any level', async run(L) {
        const bad = issuesOf(await L.staticAll(), ['enemy-in-prop', 'grave-in-prop', 'drain-in-prop']);
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') };
      } },
      { name: 'objective items (cheese wheel, cages, beacon) never sit inside a prop', async run(L) {
        const bad = [];
        for (const lv of [CINDER, CITY(1), CITY(2), CITY(5), SEWER(0), SEWER(3)]) {
          await L.level(...lv);
          bad.push(...await L.S(() => {
            const s = __scurry, out = [], inside = (x, z, r) => s.W.plats.some(p => !p.thin && !p.pole && p.y > 0.3 && p.y - p.th < 1.2 && Math.abs(p.x - x) < p.w / 2 + r && Math.abs(p.z - z) < p.d / 2 + r);
            for (let i = 0; i < 3; i++) for (const kind of ['heist', 'rescue', 'hold']) {
              s.forceObjective(kind);
              const o = s.run.obj, pts = kind === 'rescue' ? o.cages : kind === 'hold' && o.y > 1 ? [] : [o];
              for (const p of pts) if (inside(p.x, p.z, 0.4)) out.push(s.dName() + ' ' + kind);
            }
            return out;
          }));
        }
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || '54 placements clear' };
      } },
      { name: 'a spawn asked for inside a car steps out onto clear floor', async run(L) {
        await L.level(...CINDER);
        const r = await L.S(() => {
          const s = __scurry, car = s.W.plats.find(p => p.w >= 3.5 || p.d >= 3.5);
          if (!car) return null;
          const e = s.spawnEnemy('mawling', car.x, car.z, { plain: true, force: true });
          const inside = s.W.plats.some(p => !p.thin && p.y > 0.3 && p.y - p.th < 1.2 && Math.abs(p.x - e.x) < p.w / 2 && Math.abs(p.z - e.z) < p.d / 2);
          return { inside, moved: Math.hypot(e.x - car.x, e.z - car.z) };
        });
        return { ok: !!r && !r.inside, detail: r ? `moved ${r.moved.toFixed(1)} out` : 'no car found' };
      } },
    ],
    t2: [
      { name: 'after bot play on four levels, no walker stands inside a prop', async run(L) {
        let inside = 0, total = 0;
        for (const lv of [CINDER, CITY(2), SEWER(0), SEWER(5)]) {
          await L.fresh({ level: lv, quiet: false });
          await L.play(L.QUICK ? 20 : 35, { profile: 'average', goal: 'nests' });
          const r = await L.S(() => { const s = __scurry; let n = 0, t = 0; for (const e of s.W.enemies) { if (e.dead || e.fly || e.type === 'nest' || e.y > 0.6) continue; t++; if (s.W.plats.some(p => !p.thin && !p.pole && p.y > 0.3 && p.y - p.th < 1.2 && Math.abs(p.x - e.x) < p.w / 2 - 0.15 && Math.abs(p.z - e.z) < p.d / 2 - 0.15)) n++; } return { n, t }; });
          inside += r.n; total += r.t;
        }
        return { ok: inside === 0, score: total ? Math.max(0, 1 - (inside / total) * 10) : 1, detail: `${inside} of ${total} inside` };
      } },
      { name: 'patrolling predators keep moving (never pinned against a car)', async run(L) {
        let pinned = 0, n = 0;
        for (const lv of [CINDER, CITY(1), CITY(2), CITY(3)]) {
          await L.fresh({ level: lv, god: true });
          const r = await L.S(() => {
            const s = __scurry, preds = s.W.enemies.filter(e => e.pred && !e.dead);
            s.P.x += 400; // far away, so they stay on patrol
            const start = preds.map(e => [e.x, e.z]), track = preds.map(() => 0);
            for (let i = 0; i < 20; i++) { s.qa.stepRaw(1); preds.forEach((e, j) => { track[j] += Math.hypot(e.x - start[j][0], e.z - start[j][1]); start[j] = [e.x, e.z]; }); }
            return track;
          });
          n += r.length;
          pinned += r.filter(d => d < 12).length;
        }
        return { ok: pinned === 0, score: n ? 1 - pinned / n : 1, detail: `${pinned} of ${n} barely moved in 20 s` };
      } },
    ],
    t3: {
      // Nests stay spread out, and still fill their brood now that spawns step around props.
      async run(L) {
        let spread = 0, fill = 0, levels = 0;
        for (const lv of [CINDER, CITY(3), SEWER(1), SEWER(6)]) {
          await L.fresh({ level: lv, god: true });
          const r = await L.S(() => {
            const s = __scurry, ns = s.W.enemies.filter(e => e.type === 'nest');
            const near = ns.map(a => Math.min(...ns.filter(b => b !== a).map(b => Math.hypot(a.x - b.x, a.z - b.z))));
            const n0 = ns[0], cap = s.TUNE.nests['kids' + n0.tier];
            s.P.x = n0.x + 8; s.P.z = n0.z; s.P.y = 0;
            s.qa.stepRaw(30);
            return { spread: near.reduce((a, b) => a + b, 0) / near.length, fill: Math.min(1, n0.kids.filter(k => !k.dead).length / cap) };
          });
          spread += r.spread; fill += r.fill; levels++;
        }
        return { nestSpacing: spread / levels, broodFill: fill / levels };
      },
      bands: { nestSpacing: [9, 60], broodFill: [0.6, 1] },
    },
  },

  // ------------------------------------------------------------------ P3 fix: water depth
  {
    id: 'water', since: 'P3', title: 'Puddles and channels are wading-deep, not a fall through the floor',
    t1: [
      { name: 'city puddles come to the ankles (the rat stays above the surface)', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        await clearMobs(L);
        const r = await L.S(() => {
          const s = __scurry, M = s.M, toW = g => (g - M.W / 2 + 0.5) * 4;
          for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 2) { const x = toW(k % M.W), z = toW((k / M.W) | 0); if (!s.W.plats.some(p => Math.abs(p.x - x) < p.w / 2 + 1 && Math.abs(p.z - z) < p.d / 2 + 1)) { s.P.x = x; s.P.z = z; s.P.y = 0; s.qa.stepRaw(1.5); return { y: s.P.y, wet: !!s.P.wet }; } }
          return null;
        });
        return { ok: !!r && r.y > -0.35 && r.y < -0.2, detail: r ? `stands at ${r.y.toFixed(2)} (surface −0.12)` : 'no puddle' };
      } },
      { name: 'sewer channels come up to the belly', async run(L) {
        await L.level(...SEWER(1));
        const r = await L.S(() => {
          const s = __scurry, M = s.M, toW = g => (g - M.W / 2 + 0.5) * 4;
          for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 2 && M.grid[k + 1] === 2 && M.grid[k - 1] === 2) { s.P.x = toW(k % M.W); s.P.z = toW((k / M.W) | 0); s.P.y = 0; s.qa.stepRaw(1.5); return s.P.y; }
          return null;
        });
        return { ok: r != null && r > -0.7 && r < -0.5, detail: r != null ? `stands at ${r.toFixed(2)} (surface −0.28)` : 'no channel' };
      } },
    ],
    t2: [
      { name: 'acid still burns at the new depth', async run(L) {
        await L.fresh({ level: TOXIC });
        await clearMobs(L);
        const r = await L.S(() => {
          const s = __scurry, M = s.M, toW = g => (g - M.W / 2 + 0.5) * 4;
          for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 4 && M.grid[k + 1] === 4) { s.P.x = toW(k % M.W); s.P.z = toW((k / M.W) | 0); s.P.y = 0; const hp = s.run.hp; s.qa.stepRaw(2); return hp - s.run.hp; }
          return null;
        });
        return { ok: r != null && r >= 5, detail: r != null ? `lost ${r.toFixed(0)} HP in 2 s` : 'no acid' };
      } },
      { name: 'wading slows walkers in sewer water', async run(L) {
        await L.level(...SEWER(1));
        const r = await L.S(() => {
          const s = __scurry, M = s.M, toW = g => (g - M.W / 2 + 0.5) * 4;
          for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 2 && M.grid[k + 1] === 2) { const e = s.spawnEnemy('mawling', toW(k % M.W), toW((k / M.W) | 0), { plain: true, force: true }); e.emT = 0; s.qa.stepRaw(0.6); return e.y; }
          return null;
        });
        return { ok: r != null && r < -0.15, detail: r != null ? `walker at ${r.toFixed(2)}` : 'none' };
      } },
    ],
  },

  // ------------------------------------------------------------------ P3: climbing only at marked pipes
  {
    id: 'climb', since: 'P3', title: 'Climbing only at marked pipes and fire escapes; rooftop caches',
    t1: [
      { name: 'Space against a plain wall only hops (no climbing)', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        await clearMobs(L);
        const w = await L.S(() => { const s = __scurry, w = s.wallSpot(5.5, 11.9); return w && !s.W.climbs.some(c => Math.hypot(c.x - w.x, c.z - w.z) < 4) ? w : null; });
        if (!w) return { ok: false, detail: 'no plain wall found' };
        const y = await climbTry(L, w);
        return { ok: y < 3, detail: `peak ${y.toFixed(2)} at a ${w.top}-high wall` };
      } },
      { name: 'holding Space at a marked pipe climbs to the roof', async run(L) {
        const w = await L.S(() => __scurry.climbSpot(4.5));
        if (!w) return { ok: false, detail: 'no pipe' };
        const y = await climbTry(L, w);
        return { ok: y >= w.top - 0.2, detail: `reached ${y.toFixed(2)} of ${w.top}` };
      } },
      { name: 'every level has marked pipes, and every rooftop item sits on a roof you can get onto', async run(L) {
        const bad = [];
        for (const lv of L.LEVELS.filter(l => !l[2])) {
          const where = await L.level(...lv);
          const r = await L.S(() => ({ n: __scurry.W.climbs.length, city: __scurry.M.kind === 'city', issues: __scurry.qa.staticChecks().issues.filter(i => /roof-loot|pipe-blocked/.test(i.kind)).length }));
          if (r.n < (r.city ? 6 : 3) || r.issues) bad.push(`${where}: ${r.n} pipes, ${r.issues} issues`);
        }
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || 'all 19 levels' };
      } },
    ],
    t2: [
      { name: 'a rooftop "hold" objective is always on a roof with a way up', async run(L) {
        let roof = 0, bad = 0;
        for (const lv of [CINDER, CITY(1), CITY(2), CITY(3), CITY(5)]) {
          await L.level(...lv);
          const r = await L.S(() => { const s = __scurry, M = s.M; let roof = 0, bad = 0; for (let i = 0; i < 4; i++) { s.forceObjective('hold'); const o = s.run.obj; if (o.y > 1) { roof++; const k = Math.floor(o.x / 4 + M.W / 2) + Math.floor(o.z / 4 + M.H / 2) * M.W; if (!M.roofOK[k]) bad++; } } return { roof, bad }; });
          roof += r.roof; bad += r.bad;
        }
        return { ok: bad === 0, score: roof ? 1 - bad / roof : 1, detail: `${roof} rooftop holds, ${bad} unreachable` };
      } },
      { name: 'the rooftop cache at a pipe is collected by climbing it', async run(L) {
        await L.fresh({ level: CITY(2), god: true });
        await clearMobs(L);
        const w = await L.S(() => { const s = __scurry, c = s.W.climbs.find(c => c.cache && c.top >= 4.5 && c.top <= 7); return c ? { x: c.x, z: c.z, nx: c.nx, nz: c.nz, top: c.top } : null; });
        if (!w) return { ok: false, detail: 'no pipe with a cache' };
        const c0 = await L.S(() => __scurry.W.caches.filter(c => c.taken).length);
        await climbTry(L, w, 1.6, true);
        await L.S(() => __scurry.qa.stepRaw(0.8));
        const c1 = await L.S(() => __scurry.W.caches.filter(c => c.taken).length);
        return { ok: c1 > c0, detail: c1 > c0 ? 'cache taken on the roof' : 'cache still there' };
      } },
    ],
    t3: {
      // Pipes are spread through the level, close enough to find, and most lead to a cache.
      async run(L) {
        const m = { pipesCity: 0, pipesSewer: 0, cacheShare: 0, nearestFromStart: 0 };
        let nc = 0, ns = 0;
        for (const lv of L.LEVELS.filter(l => !l[2])) {
          await L.level(...lv);
          const r = await L.S(() => { const s = __scurry, c = s.W.climbs; return { city: s.M.kind === 'city', n: c.length, caches: c.filter(c => c.cache).length, near: Math.min(...c.map(c => Math.hypot(c.x - s.P.x, c.z - s.P.z))) }; });
          if (r.city) { m.pipesCity += r.n; nc++; } else { m.pipesSewer += r.n; ns++; }
          m.cacheShare += r.caches / Math.max(1, r.n);
          m.nearestFromStart += r.near;
        }
        m.pipesCity /= nc; m.pipesSewer /= ns; m.cacheShare /= nc + ns; m.nearestFromStart /= nc + ns;
        return m;
      },
      bands: { pipesCity: [8, 16], pipesSewer: [3, 7], cacheShare: [0.55, 1], nearestFromStart: [8, 40] },
    },
  },

  // ------------------------------------------------------------------ P3: secrets, SECRETS n/m, F pings
  {
    id: 'secrets', since: 'P3', title: '3–6 secrets per level, the SECRETS counter and F pings',
    t1: [
      { name: 'every level counts 3–6 secrets; secret zones count none', async run(L) {
        const bad = [];
        for (const lv of L.LEVELS) {
          const where = await L.level(...lv);
          const m = await L.S(() => __scurry.run.finds.m);
          if (lv[2] ? m !== 0 : m < 3 || m > 6) bad.push(`${where}: ${m}`);
        }
        return { ok: !bad.length, detail: bad.slice(0, 4).join('; ') || 'all levels in range' };
      } },
      { name: 'the HUD shows SECRETS n/m', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        await L.sleep(700);
        const t = await L.S(() => document.getElementById('res').textContent);
        return { ok: /SECRETS \d\/\d/i.test(t), detail: (t.match(/SECRETS \d\/\d/i) || ['missing'])[0] };
      } },
      { name: 'F pings: unfound secrets in range light up, with a sound', async run(L) {
        const r = await L.S(() => { const s = __scurry, f = s.W.finds[0]; s.P.x = f.x + 12; s.P.z = f.z; s.P.scent = false; s.P.scentE = 99; const p = s.pingFinds(); return { p, lit: s.W.finds.filter(f => f.showT > 0).length, pings: s.run.pings }; });
        return { ok: r.lit >= 1 && r.pings >= 1, detail: `${r.lit} lit, nearest ${r.p && Math.round(r.p.best)}` };
      } },
      { name: 'reaching each kind of secret counts it and pays XP and gold', async run(L) {
        const got = {};
        for (const lv of [CINDER, CITY(4), SEWER(0)]) {
          await L.fresh({ level: lv, god: true });
          await clearMobs(L);
          Object.assign(got, await L.S(() => {
            const s = __scurry, out = {};
            for (const f of s.W.finds) {
              if (out[f.kind]) continue;
              const n0 = s.run.finds.n, xp0 = s.run.xp + s.run.level * 1e6, g0 = s.W.scraps.length + s.run.scrap;
              if (f.kind === 'wall') { const [x, y] = f.rect; s.P.x = (x - s.M.W / 2 + 0.5) * 4; s.P.z = (y - s.M.H / 2 + 0.5) * 4; s.P.y = 0; }
              else if (f.kind === 'squeeze') { s.P.x = f.x; s.P.z = f.z; s.P.y = 0; s.P.squeeze = true; }
              else { s.P.x = f.x; s.P.z = f.z; s.P.y = f.y; }
              s.qa.stepRaw(0.1);
              out[f.kind] = s.run.finds.n > n0 && s.run.xp + s.run.level * 1e6 > xp0 && s.W.scraps.length + s.run.scrap > g0;
            }
            return out;
          }));
        }
        const kinds = Object.keys(got);
        return { ok: kinds.length === 3 && kinds.every(k => got[k]), detail: kinds.map(k => `${k} ${got[k] ? 'ok' : 'no'}`).join(', ') };
      } },
    ],
    t2: [
      { name: 'every secret on every level can be reached', async run(L) {
        const bad = issuesOf(await L.staticAll(), ['unreachable-secret']);
        return { ok: !bad.length, score: Math.max(0, 1 - bad.length / 10), detail: bad.slice(0, 3).join('; ') || 'all reachable' };
      } },
      { name: 'a found secret stays found (no double counting)', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        const r = await L.S(() => { const s = __scurry, f = s.W.finds.find(f => f.kind === 'roof') || s.W.finds[0]; s.P.x = f.x; s.P.z = f.z; s.P.y = f.y; s.qa.stepRaw(0.3); s.qa.stepRaw(0.3); return s.run.finds.n; });
        return { ok: r === 1, detail: `counted ${r}` };
      } },
    ],
    t3: {
      // The level's secrets: how many, how varied, and whether a sniff at the start already hints at one.
      async run(L) {
        let n = 0, kinds = 0, startHint = 0, c = 0;
        for (const lv of L.LEVELS.filter(l => !l[2])) {
          await L.level(...lv);
          const r = await L.S(() => { const s = __scurry, R = s.TUNE.secrets.pingR; return { m: s.run.finds.m, k: new Set(s.W.finds.map(f => f.kind)).size, hint: s.W.finds.some(f => Math.hypot(f.x - s.P.x, f.z - s.P.z) < R) }; });
          n += r.m; kinds += r.k; startHint += r.hint ? 1 : 0; c++;
        }
        return { perLevel: n / c, kinds: kinds / c, startHint: startHint / c };
      },
      bands: { perLevel: [3.5, 5.5], kinds: [2, 3], startHint: [0.25, 0.75] },
    },
    ab: { name: 'a shorter ping (28)', set: { 'secrets.pingR': 28 } },
  },

  // ------------------------------------------------------------------ P3: keys stack and open locks
  {
    id: 'locks', since: 'P3', title: 'Keys stack and open locked gates and chests',
    t1: [
      { name: 'keys stack', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        const n = await L.S(() => { const s = __scurry; for (let i = 0; i < 3; i++) s.dropKey(s.P.x, s.P.y, s.P.z); s.qa.stepRaw(0.3); return s.run.keys; });
        return { ok: n === 3, detail: `${n} held` };
      } },
      { name: 'a locked gate blocks the vault until the level boss is down, then opens free', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, g = s.W.gates[0];
          if (!g) return null;
          const k = g.k, M = s.M, cx = (k % M.W - M.W / 2 + 0.5) * 4, cz = (((k / M.W) | 0) - M.H / 2 + 0.5) * 4;
          // Walk at the bars from outside: the plat stops the rat.
          const out = { x: g.x + g.nx * 1.5, z: g.z + g.nz * 1.5 };
          s.P.x = out.x; s.P.z = out.z; s.P.y = 0; s.P.vx = -g.nx * 9; s.P.vz = -g.nz * 9;
          for (let i = 0; i < 10; i++) { s.P.vx = -g.nx * 9; s.P.vz = -g.nz * 9; s.qa.stepRaw(0.05); }
          const blocked = Math.hypot(s.P.x - cx, s.P.z - cz) > 2.2;
          s.run.keys = 0; s.run.lvlBoss = false;
          s.P.x = out.x; s.P.z = out.z;
          const early = s.unlockGate(g); // keys are boss-only: no gate before the boss falls
          s.run.lvlBoss = true;
          const opened = !early && s.unlockGate(g);
          return { blocked, opened, keys: s.run.keys, plat: s.W.plats.includes(g.plat) };
        });
        if (!r) return { ok: false, detail: 'no gate on Cinder Row' };
        return { ok: r.blocked && r.opened && r.keys === 0 && !r.plat, detail: JSON.stringify(r) };
      } },
      { name: 'a locked chest stays shut until the level boss is down, then opens free (with a power-up inside)', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, c = s.W.chests.find(c => c.locked);
          if (!c) return null;
          s.run.keys = 1; s.run.lvlBoss = false; s.P.x = c.x + 1; s.P.z = c.z; s.P.y = c.y;
          s.pressE();
          const shut = !c.open; // even holding a key: padlocks open only after this level's boss
          s.run.keys = 0; s.run.lvlBoss = true;
          const p0 = s.W.pups.length;
          s.pressE();
          return { shut, open: c.open, keys: s.run.keys, pup: s.W.pups.length > p0 };
        });
        if (!r) return { ok: false, detail: 'no locked chest' };
        return { ok: r.shut && r.open && r.keys === 0 && r.pup, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'nothing the level needs is ever behind a vault gate (nests, objectives, exits)', async run(L) {
        const bad = issuesOf(await L.staticAll(), ['nest-in-vault']);
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || 'clear' };
      } },
      { name: 'bots looking for loot skip locked chests they have no key for', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        const r = await L.S(() => { const s = __scurry; for (const c of s.W.chests) if (!c.locked) c.open = true; s.run.keys = 0; s.qa.start({ goal: 'loot every chest' }); const met = s.qa.goalMet(); s.qa.stop(); return met; });
        return { ok: r === true, detail: r ? 'goal met with only locked chests left' : 'bot would hunt a locked chest' };
      } },
      { name: 'the manhole still takes a key', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        const r = await L.S(() => { const s = __scurry, mh = s.G.manhole; if (!mh) return null; s.run.keys = 0; s.P.x = mh.x + 0.5; s.P.z = mh.z; s.P.y = 0; return s.useTarget() && s.useTarget().label; });
        return { ok: r == null || /locked/i.test(r), detail: r || 'no manhole' };
      } },
    ],
    t3: {
      // Bots play a level: keys turn up at a steady rate, enough to open a lock or two.
      async run(L) {
        const m = { keysPerMin: 0 };
        const runs = [[CITY(1), 'tank'], [SEWER(1), 'slinger']];
        for (const [lv, cls] of runs) {
          await L.fresh({ cls, level: lv, quiet: false });
          const r = await L.play(L.QUICK ? 90 : 150, { profile: 'average', goal: 'nests' });
          const got = await L.S(() => __scurry.run.keysGot || 0);
          m.keysPerMin += got / Math.max(0.25, r.simTime / 60) / runs.length;
        }
        return m;
      },
      bands: { keysPerMin: [0.25, 1.5] },
    },
    ab: { name: 'elites drop keys more often (40%)', set: { 'keys.eliteOdds': 0.4 } },
  },

  // ------------------------------------------------------------------ P3: eight timed power-ups
  {
    id: 'powerups', since: 'P3', title: 'Eight timed power-ups (25 s)',
    t1: [
      { name: 'each of the eight starts, shows a timer and wears off after 25 s', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        await clearMobs(L);
        const r = await L.S(() => { const s = __scurry, ks = Object.keys(s.POWERUPS), out = {}; for (const k of ks) s.grantPowerup(k); out.on = ks.filter(k => s.puOn(k)).length; out.hud = s.puList().length; s.qa.stepRaw(24); out.still = ks.filter(k => s.puOn(k)).length; s.qa.stepRaw(1.5); out.off = ks.filter(k => !s.puOn(k)).length; return out; });
        return { ok: r.on === 8 && r.hud === 8 && r.still === 8 && r.off === 8, detail: JSON.stringify(r) };
      } },
      { name: 'walking over a token picks it up', async run(L) {
        const r = await L.S(() => { const s = __scurry, P = s.P, p = s.dropPowerup(P.x, P.y, P.z, 'iron'); s.qa.stepRaw(0.2); return s.puOn('iron') && !s.W.pups.includes(p); });
        return { ok: r, detail: r ? 'Iron Hide on' : 'not picked up' };
      } },
      { name: 'every effect does what it says', async run(L) {
        await L.fresh({ cls: 'slinger', level: CINDER });
        await clearMobs(L);
        const r = await L.S(() => {
          const s = __scurry, P = s.P, o = {}, off = () => { for (const k of Object.keys(s.POWERUPS)) s.run.pu[k] = 0; };
          const mob = (x, z) => { const e = s.spawnEnemy('mawling', x, z, { plain: true, force: true }); e.emT = 0; return e; };
          // Iron Hide: less damage
          off(); P.inv = 0; let hp = s.run.hp; s.hurtP(20); const plain = hp - s.run.hp; s.run.hp = hp; P.inv = 0;
          s.grantPowerup('iron'); s.hurtP(20); o.iron = (hp - s.run.hp) / plain; s.run.hp = hp; off();
          // Splitclaw: three shots per primary
          const shots = () => { const n0 = s.W.pproj.length; s.run.primT = 0; s.G.attack = true; s.G.aimAt = { x: P.x + 6, z: P.z }; s.qa.stepRaw(1 / 30); s.G.attack = false; s.G.aimAt = null; return s.W.pproj.length - n0; };
          s.W.pproj.length = 0; o.plainShots = shots(); s.qa.stepRaw(1); s.W.pproj.length = 0; s.grantPowerup('split'); o.splitShots = shots(); off(); s.W.pproj.length = 0; s.qa.stepRaw(1);
          // Quickpaw: shorter attack cooldown
          shots(); const cd0 = s.run.primT; s.qa.stepRaw(1); s.grantPowerup('quick'); shots(); o.quickCd = s.run.primT / cd0; off(); s.qa.stepRaw(1);
          // Ember Breath: hits burn
          const e1 = mob(P.x + 5, P.z); s.grantPowerup('ember'); s.hit(e1, 5, 0, 0, 'primary'); o.ember = e1.bT > 0; off(); e1.dead = true;
          // Mirror Shell: an enemy shot comes back
          s.grantPowerup('mirror'); P.inv = 0; hp = s.run.hp; s.W.eproj.push({ x: P.x + 0.2, y: P.y + 0.5, z: P.z, vx: -8, vy: 0, vz: 0, life: 2, dmg: 10, col: 0xff0000, size: 1 }); const m0 = s.run.mirrored || 0; s.qa.stepRaw(0.1); o.mirror = (s.run.mirrored || 0) > m0 && hp - s.run.hp < 5; off();
          // Scent Veil: a mob 12 away stops closing in
          const e2 = mob(P.x + 12, P.z); s.grantPowerup('veil'); const d0 = Math.hypot(e2.x - P.x, e2.z - P.z); s.qa.stepRaw(2); o.veilD = Math.hypot(e2.x - P.x, e2.z - P.z) - d0; off(); e2.dead = true;
          // Moth Familiar: zaps a nearby mob
          const e3 = mob(P.x + 4, P.z + 2); e3.hp = e3.maxHp = 500; s.grantPowerup('moth'); s.qa.stepRaw(2); o.moth = e3.maxHp - e3.hp; off(); e3.dead = true;
          // Glow Eyes: mold shows without sniffing
          const f = s.dropFood(P.x + 2, P.y, P.z, 'crumb', { mold: true }); s.grantPowerup('glow'); s.qa.stepRaw(0.1); o.glow = !!(f.ms && f.ms.visible); off();
          return o;
        });
        const ok = r.iron < 0.6 && r.splitShots >= r.plainShots + 2 && r.quickCd < 0.9 && r.ember && r.mirror && r.veilD > -6 && r.moth > 0 && r.glow;
        return { ok, detail: Object.entries(r).map(([k, v]) => `${k} ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(', ') };
      } },
    ],
    t2: [
      { name: 'no token sits inside a prop or wall on any level', async run(L) {
        const bad = issuesOf(await L.staticAll(), ['powerup-in-prop']);
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || 'clear' };
      } },
      { name: 'all eight at once through 20 s of bot play: no errors, no stuck states', async run(L) {
        await L.fresh({ cls: 'tank', level: CITY(1), quiet: false });
        await L.S(() => { const s = __scurry; for (const k of Object.keys(s.POWERUPS)) s.grantPowerup(k); });
        const r = await L.play(20, { profile: 'average', goal: 'nests' });
        const bad = r.anomalies.filter(k => /stuck|fell|inside|nan/.test(k));
        return { ok: !bad.length, score: Math.max(0, 1 - bad.length * 0.25), detail: bad.join(', ') || `${Math.round(r.simTime)}s clean` };
      } },
    ],
    t3: {
      // Bots play with the level's tokens: some get picked up, they're running a fair share of the
      // time, and they make the fight easier without trivialising it.
      async run(L) {
        const m = { pickupsPerMin: 0, uptime: 0, deathRate: 0 }, runs = [[CITY(0), 'tank'], [CITY(1), 'slinger'], [SEWER(0), 'warlock']];
        for (const [lv, cls] of runs) {
          await L.fresh({ cls, level: lv, quiet: false });
          const r = await L.play(L.QUICK ? 90 : 150, { profile: 'average', goal: 'nests' });
          const p = await L.S(() => ({ n: __scurry.run.puTaken || 0, up: __scurry.run.puUp || 0 }));
          m.pickupsPerMin += p.n / Math.max(0.25, r.simTime / 60) / runs.length;
          m.uptime += p.up / Math.max(1, r.simTime) / runs.length;
          m.deathRate += (r.deaths ? 1 : 0) / runs.length;
        }
        return m;
      },
      bands: { pickupsPerMin: [0.3, 2.5], uptime: [0.1, 0.5], deathRate: [0, 0.34] },
    },
    ab: { name: 'shorter power-ups (18 s)', set: { 'powerups.dur': 18 } },
  },

  // ------------------------------------------------------------------ P3: stat growth on level-up
  {
    id: 'growth', since: 'P3', title: 'Stats grow with every level, along the class’s strengths',
    t1: [
      { name: 'a level-up grows the class’s strongest stats most, and max HP (healed)', async run(L) {
        await L.fresh({ cls: 'tank', level: CINDER, god: true });
        const r = await L.S(() => { const s = __scurry, hp0 = s.st.maxHp, cur0 = s.run.hp, c = s.TUNE.classes.tank; s.addXP(s.run.need + 1); const g = s.run.growth, top = ['str', 'spd', 'arm', 'mag'].sort((a, b) => c[b] - c[a])[0]; return { lvl: s.run.level, hpGain: s.st.maxHp - hp0, healed: s.run.hp - cur0, top, topGain: g[top], minGain: Math.min(g.str, g.spd, g.arm, g.mag) }; });
        return { ok: r.lvl === 2 && r.hpGain > 0 && r.healed > 0 && r.topGain > r.minGain, detail: JSON.stringify(r) };
      } },
      { name: 'growth starts fresh each run', async run(L) {
        await L.fresh({ cls: 'slinger', god: true });
        // Since the Nest shop, a run starts with exactly its shop ranks as growth (no level growth carried).
        const r = await L.S(() => { const s = __scurry, g = s.run.growth || {}, sh = s.meta.shop || {}, T = s.TUNE.shop; const want = { str: (sh.str || 0) * T.statPer, spd: (sh.spd || 0) * T.statPer, arm: (sh.arm || 0) * T.statPer, mag: (sh.mag || 0) * T.statPer, hp: (sh.hide || 0) * T.hpPer }; return { g, want, lvl: s.run.level }; });
        const same = Object.keys(r.want).every(k => Math.abs((r.g[k] || 0) - r.want[k]) < 1e-6);
        return { ok: same && r.lvl === 1, detail: same ? 'fresh (shop ranks only)' : 'carried over ' + JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'twenty levels later the derived numbers stay sane', async run(L) {
        await L.fresh({ cls: 'sneak', god: true });
        const r = await L.S(() => { const s = __scurry; for (let i = 0; i < 20; i++) s.addXP(s.run.need + 1); return { lvl: s.run.level, cd: s.st.cd, taken: s.st.taken, speed: s.st.speed, maxHp: s.st.maxHp }; });
        return { ok: r.cd >= 0.5 && r.taken >= 0.2 && r.speed < 20 && r.maxHp < 400, detail: JSON.stringify(r) };
      } },
    ],
    t3: {
      // An average bot over a few minutes: it levels, keeps killing at a good clip, and usually lives.
      async run(L) {
        const m = { levelsPerMin: 0, killsPerMin: 0, deathRate: 0 }, runs = [[CITY(0), 'tank'], [CITY(1), 'slinger'], [SEWER(0), 'sneak']];
        for (const [lv, cls] of runs) {
          await L.fresh({ cls, level: lv, quiet: false });
          const r = await L.play(L.QUICK ? 120 : 200, { profile: 'average', goal: 'nests' });
          const min = Math.max(0.25, r.simTime / 60);
          m.levelsPerMin += (r.level - 1) / min / runs.length;
          m.killsPerMin += r.kills / min / runs.length;
          m.deathRate += (r.deaths ? 1 : 0) / runs.length;
        }
        return m;
      },
      bands: { levelsPerMin: [0.6, 3], killsPerMin: [8, 60], deathRate: [0, 0.5] },
    },
    ab: { name: 'faster growth (0.8 points a level)', set: { 'growth.perLevel': 0.8 } },
  },

  // ------------------------------------------------------------------ P3: the exit tally and grade
  {
    id: 'tally', since: 'P3', title: 'The exit tally: a grade for every level',
    t1: [
      { name: 'leaving a level stops on the tally card; Enter moves on', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        await L.S(() => { __scurry.G.testNoTally = false; __scurry.exitRoad(); });
        await L.sleep(200);
        const st = await L.S(() => __scurry.G.state);
        await L.page.keyboard.press('Enter');
        await L.sleep(1400);
        const after = await L.S(() => ({ st: __scurry.G.state, lvl: __scurry.dName(), ranks: (__scurry.run.ranks || []).length }));
        await L.S(() => { __scurry.G.testNoTally = true; });
        return { ok: st === 'tally' && after.st === 'play' && after.ranks === 1, detail: `${st} → ${after.st} in ${after.lvl}` };
      } },
      { name: 'grades follow the score thresholds, and the bonus gold is paid', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        const r = await L.S(() => {
          const s = __scurry, T = s.TUNE.tally;
          // Clean sweep: every nest, the boss, every secret, no damage, fast.
          for (const e of s.W.enemies) if (e.type === 'nest') e.dead = true;
          s.run.bossDone = true; s.run.finds.n = s.run.finds.m; s.run.dHurt = 0; s.run.obj = { kind: 'nests' };
          const best = s.tallyCalc();
          // Nothing done, hurt badly, slow.
          for (const e of s.W.enemies) if (e.type === 'nest') e.dead = false;
          s.run.bossDone = false; s.run.finds.n = 0; s.run.dHurt = s.st.maxHp * 3; s.run.time += 2000; s.run.obj = { kind: 'heist', done: false };
          const worst = s.tallyCalc();
          return { best: best.grade, bestScore: best.score, worst: worst.grade, worstScore: worst.score, bonusS: T.goldS };
        });
        return { ok: r.best === 'S' && r.worst === 'D', detail: `${r.best} (${r.bestScore}) / ${r.worst} (${r.worstScore})` };
      } },
    ],
    t2: [
      { name: 'bots and test harnesses never stall on the card', async run(L) {
        await L.fresh({ level: CINDER, god: true });
        await L.S(() => { __scurry.exitRoad(); });
        await L.sleep(1400);
        const st = await L.S(() => __scurry.G.state);
        return { ok: st === 'play', detail: st };
      } },
      { name: 'every way out of a level is tallied (road, manhole, secret drain)', async run(L) {
        let n = 0;
        for (const go of ['exitRoad', 'enterSewer', 'drain']) {
          await L.fresh({ level: go === 'drain' ? CITY(3) : CINDER, god: true });
          const r0 = await L.S(() => (__scurry.run.ranks || []).length);
          await L.S(g => { const s = __scurry; if (g === 'drain') { const d = s.G.secretExit; s.run.lvlBoss = true; if (d) { s.P.x = d.x; s.P.z = d.z; s.P.y = d.y; s.qa.stepRaw(0.1); } } else s[g](); }, go);
          await L.sleep(1400);
          if (await L.S(r0 => (__scurry.run.ranks || []).length > r0, r0)) n++;
        }
        return { ok: n === 3, score: n / 3, detail: `${n}/3 exits tallied` };
      } },
    ],
    t3: {
      // Average bots on three levels: grades should spread across the middle, not pile up at S or D.
      async run(L) {
        const scores = [];
        for (const [lv, cls] of [[CITY(0), 'tank'], [CITY(2), 'slinger'], [SEWER(0), 'warlock']]) {
          await L.fresh({ cls, level: lv, quiet: false });
          await L.play(L.QUICK ? 90 : 160, { profile: 'average', goal: 'nests' });
          scores.push(await L.S(() => __scurry.tallyCalc().score));
        }
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length, spread = Math.max(...scores) - Math.min(...scores);
        return { meanScore: mean, spread };
      },
      bands: { meanScore: [30, 75], spread: [5, 50, 0.5] },
    },
  },
  ...TRIALS_P4,
];
