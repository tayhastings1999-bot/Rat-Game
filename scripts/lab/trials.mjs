// Lab trials (scripts/lab.mjs). One per new feature, level, mob or idea.
// Each trial has:
//   t1  checks that must all pass (the gate): { name, run(L) → bool | { ok, detail } }
//   t2  robustness checks, each scored 0..1:  { name, run(L) → bool | { ok, score, detail } }
//   t3  { run(L, arm) → metrics, bands: { metric: [lo, hi, weight] } } — bots play, numbers land in bands
//   ab  optional idea to compare against the control: { name, set: { 'tune.path': value } }
// L is the lab context (fresh, level, play, tune, staticAll, S, sleep); see lab.mjs.

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
      { name: 'static warnings stay rare (buried bins, props in walls)', async run(L) {
        const all = await L.staticAll(), n = all.reduce((a, l) => a + l.issues.filter(i => i.sev === 'warn').length, 0);
        return { ok: n <= 2, score: Math.max(0, 1 - n / 10), detail: `${n} warnings over ${all.length} maps` };
      } },
      { name: 'bots play three levels without stuck spots, falling out, or ending up inside walls', async run(L) {
        const bad = [];
        for (const [lv, cls] of [[CITY(1), 'slinger'], [CITY(4), 'brawler'], [SEWER(2), 'plague']]) {
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
        const m = { nestsPerMin: 0, deathRate: 0 }, runs = [[CITY(0), 'brawler'], [CITY(2), 'roof'], [SEWER(0), 'warlock']];
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
          await L.fresh({ cls: ['brawler', 'slinger', 'roof'][i % 3], level: RUST_NIGHT, quiet: false });
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
];
