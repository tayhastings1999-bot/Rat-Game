// Level audit (read-only): structure + bot playthroughs for all 22 levels and lap II.
// Levels play at their real run zone (sewer i = zone 2i+1, city i = zone 2i), with stage gear unless NOGEAR.
// Usage: CHROMIUM=/usr/bin/google-chrome CLS=tank,tank,tank,tank SECS=1500 STEP=20 ONLY='sewer:4:' node tools/audit.mjs bots
//   env: PORT, TAG, OUT (default scripts/out/audit), TRACE=1, GOD=1, NOGEAR=1. Medians: python3 tools/audit-median.py 'logs/*.log'
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
const MODE = process.argv[2] || 'struct';
const CLS = (process.env.CLS || 'tank,slinger,warlock,sneak').split(',');
const SECS = +(process.env.SECS || 360);
const server = await createServer({ server: { port: +(process.env.PORT || 5197), strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const S = (fn, a) => page.evaluate(fn, a);
const sleep = ms => page.waitForTimeout(ms);
await page.goto(`http://localhost:${process.env.PORT || 5197}/?debug`);
await page.waitForFunction(() => window.__scurry && window.__scurry.qa && document.querySelector('#overlay h1'), null, { timeout: 90000 });
await S(() => __scurry.pickSlot(3));
const LV = await S(() => ({ c: __scurry.LEVELS.CITY_LEVELS.length, s: __scurry.LEVELS.SEWER_LEVELS.length, x: Object.keys(__scurry.LEVELS.SECRET_LEVELS) }));
const LEVELS = [
  ...Array.from({ length: LV.c }, (_, i) => ['surface', i, null]),
  ...Array.from({ length: LV.s }, (_, i) => ['sewer', i, null]),
  ...LV.x.map(k => [k === 'garden' ? 'sewer' : 'surface', 0, k]),
  ['surface', LV.c, null], ['sewer', LV.s, null],
];
async function fresh(cls, god, quiet) {
  await S(([c, g, q]) => { const s = __scurry; s.qa.stop(); s.startRun(c); s.god(g); s.run.scabSeen = true; if (q) { s.G.testNoRoles = true; Object.assign(s.run, { evT: 1e9, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 }); } else s.G.testNoRoles = false; }, [cls, god, quiet]);
  for (let i = 0; i < 80; i++) { if (await S(() => __scurry.G.state === 'play' && __scurry.run.time >= 0.15)) break; await sleep(80); }
}
async function level(lv) {
  return S(([layer, i, secret]) => {
    const s = __scurry, r = s.run;
    r.layer = layer; r.secret = secret;
    if (layer === 'sewer') { r.sewerIdx = i; r.district = 0; } else r.district = i;
    r.tier = layer === "sewer" ? 2 * i + 1 : 2 * i; r.nests = 0; r.bossDone = false; // the real run zone: city i, then sewer i, alternate (Toxic Refinery = zone 9)
    const t0 = performance.now();
    r.seed = s.levelSeed(); s.setupWorld(r.seed);
    s.G.state = 'play';
    return { name: s.dName(), buildMs: Math.round(performance.now() - t0) };
  }, lv);
}
const REACH = () => {
  const s = __scurry, M = s.M, P = s.P;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], n = M.W * M.H, inG = (x, y) => x >= 0 && y >= 0 && x < M.W && y < M.H, gi = (x, y) => y * M.W + x;
  const walk = t => t === 1 || t === 2 || t === 4 || t === 9 || t === 10;
  const tg = (x, z) => [Math.floor(x / 4 + M.W / 2), Math.floor(z / 4 + M.H / 2)];
  const [sx, sz] = tg(P.x, P.z), reach = new Uint8Array(n), q = [];
  reach[gi(sx, sz)] = 1; q.push(gi(sx, sz));
  while (q.length) { const c = q.pop(), x = c % M.W, y = (c / M.W) | 0; for (const [dx, dy] of N4) { const X = x + dx, Y = y + dy; if (!inG(X, Y)) continue; const k = gi(X, Y); if (reach[k] || !walk(M.grid[k])) continue; reach[k] = 1; q.push(k); } }
  const ra = reach.slice(), q2 = []; for (let k = 0; k < n; k++) if (ra[k]) q2.push(k);
  while (q2.length) { const c = q2.pop(), x = c % M.W, y = (c / M.W) | 0; for (const [dx, dy] of N4) { const X = x + dx, Y = y + dy; if (!inG(X, Y) || X === 0 || Y === 0 || X === M.W - 1 || Y === M.H - 1) continue; const k = gi(X, Y); if (ra[k] || M.grid[k] === 7) continue; if ((M.grid[k] === 0 || M.grid[k] === 6) && M.roofOK && !M.roofOK[k]) continue; ra[k] = 1; q2.push(k); } }
  const at = (o, R) => { const [gx, gz] = tg(o.x, o.z); return [[0, 0], ...N4].some(([dx, dz]) => inG(gx + dx, gz + dz) && R[gi(gx + dx, gz + dz)]); };
  const how = o => !o ? '-' : at(o, reach) ? 'walk' : at(o, ra) ? 'ability' : 'NO';
  return { how };
};
async function structural(lv) {
  await fresh('tank', true, true);
  const b = await level(lv);
  const r = await S(SRC => {
    const s = __scurry, G = s.G, W = s.W, R = eval('(' + SRC + ')')();
    const nests = W.enemies.filter(e => e.type === 'nest' && !e.dead);
    return {
      issues: s.qa.staticChecks().issues.filter(i => i.sev === 'error').map(i => i.kind).join(','),
      nests: nests.length, nestsHow: [...new Set(nests.map(R.how))].join('/'), manhole: R.how(G.manhole),
      secret: G.secretExit ? R.how(G.secretExit) + ':' + G.secretExit.kind : '-', gates: W.gates.length, lockedChests: W.chests.filter(c => c.locked).length,
      arena: R.how(G.arena), exitsPre: (G.exits || []).map(R.how).join('/') || (G.exitD ? R.how(G.exitD) : '-'), climbs: (W.climbs || []).length, ducts: (W.ductNets || []).length,
      finds: (W.finds || []).map(f => f.kind + ':' + R.how(f)).join(' '),
    };
  }, REACH.toString());
  const done = await S(async SRC => {
    const s = __scurry, G = s.G, W = s.W;
    for (const e of W.enemies.filter(e => e.type === 'nest' && !e.dead)) s.kill(e);
    let t = 0;
    while (t < 20 && !G.boss && !s.run.secret && !G.exitD) { s.qa.stepRaw(0.5); t += 0.5; }
    const boss = G.boss ? { name: G.boss.name, how: eval('(' + SRC + ')')().how(G.boss), fly: !!G.boss.fly } : null;
    if (G.boss) { G.boss.revealed = true; s.kill(G.boss); }
    for (let i = 0; i < 8; i++) s.qa.stepRaw(0.25);
    if (s.run.secret) for (let i = 0; i < 8; i++) s.qa.stepRaw(0.25);
    const R = eval('(' + SRC + ')')(), ex = G.exits && G.exits.length ? G.exits : G.exitD ? [G.exitD] : [];
    return { bossWokeAfter: boss ? t : null, boss: boss && boss.name + ' (' + boss.how + ')', exit: ex.map(e => (e.kind || 'exit') + ':' + R.how(e)).join(' ') || 'NONE', keysAfter: s.run.keys, st: G.state };
  }, REACH.toString());
  return { lv: lv.join(':'), ...b, ...r, ...done };
}
async function botRun(lv, cls) {
  // Realistic gear for this point in a run: city i is stage 2i, sewer i is stage 2i+1 (each sewer follows a city level).
  const stage = lv[0] === 'sewer' ? 2 * lv[1] + 1 : 2 * lv[1];
  if (!process.env.NOGEAR) await S(st => { const m = __scurry.meta, r = Math.min(3, Math.floor(st / 2)); window.__keepShop ||= JSON.stringify({ shop: m.shop || {}, pack: m.pack || {} }); m.shop = { str: r, arm: r, spd: Math.min(3, Math.floor(st / 3)), hide: Math.min(5, st) }; m.pack = { vial: 1, cheese: st >= 2 ? 1 : 0, tail: st >= 4 ? 1 : 0 }; }, stage);
  await fresh(cls, !!process.env.GOD, false);
  const b = await level(lv);
  await S(([LP]) => { const s = __scurry, want = Math.min(s.TUNE.xp.maxLevel, 1 + Math.round(LP * (s.run.tier || 0))); let g = 0; while (s.run.level < want && g++ < 60) s.addXP(s.run.need + 1); s.run.hp = s.st.maxHp; s.G.state = 'play'; s.qa.start({ profile: 'average', goal: 'progress' }); }, [+(process.env.LVPER || 2.5)]);
  let left = SECS, status = 'ok', deaths = 0;
  const t0 = await S(() => __scurry.run.time);
  const trace = [];
  while (left > 0) {
    const c = Math.min(+(process.env.STEP || 20), left);
    status = await S(c => __scurry.qa.sim(c), c);
    if (process.env.TRACE) trace.push(await S(() => { const s = __scurry, B = s.qa.bot; return [Math.round(s.run.time), s.W.enemies.filter(e => e.type === 'nest' && !e.dead).length, s.G.boss ? Math.round(100 * s.G.boss.hp / s.G.boss.maxHp) : -1, B.target && B.target.kind, Math.round(s.qa.telemetry().dmgDealt || 0), s.run.level, Math.round(s.run.hp), s.W.enemies.filter(e => !e.dead && e.type !== 'nest' && Math.hypot(e.x - s.P.x, e.z - s.P.z) < 15).length, s.W.enemies.filter(e => !e.dead && e.type !== 'nest').length].join(' '); }));
    left -= c;
    if (status === 'dead') { deaths++; break; }
    if (status === 'trans' || status === 'district') break;
    if (status !== 'ok') { await S(() => { const s = __scurry; if (s.G.state === 'story' && s.story && s.story.skip) s.story.skip(); }); await sleep(100); }
  }
  const info = await S(() => {
    const s = __scurry, T = s.qa.telemetry(), B = s.qa.bot, G = s.G;
    return { t: +(s.run.time).toFixed(0), nestsLeft: s.W.enemies.filter(e => e.type === 'nest' && !e.dead).length, boss: G.boss ? Math.round(100 * G.boss.hp / G.boss.maxHp) + '%' : s.run.bossDone ? 'dead' : 'none', stuck: T.anomalies.filter(a => /stuck/.test(a.kind)).length, anomalies: [...new Set(T.anomalies.map(a => a.kind))].join(','), stuckAt: T.anomalies.filter(a => a.kind === 'stuck').map(a => `${a.time}s ${a.target}@(${a.tx},${a.tz}) me(${a.pos[0]},${a.pos[1]},${a.pos[2]}) t${a.tile && a.tile.t} in${a.tile && a.tile.inside}`).join(' ; '), tgt: B.target && B.target.kind, by: (T.deaths[0] || {}).by || '', starved: !!s.run.starved, exit: !!(G.exitD || (G.exits || []).length), st: G.state };
  });
  await S(() => __scurry.qa.stop());
  return { trace: trace.join(' | '), lv: lv.join(':'), name: b.name, cls, status, time: info.t - Math.round(t0), deaths, ...info };
}
const out = [];
if (MODE === 'struct') {
  for (const lv of LEVELS) { let r; try { r = await structural(lv); } catch (e) { r = { lv: lv.join(':'), threw: e.message.slice(0, 120) }; } out.push(r); console.log(JSON.stringify(r)); }
} else {
  const only = process.env.ONLY ? process.env.ONLY.split(';') : null;
  for (const lv of LEVELS) for (const c of CLS) { if (only && !only.includes(lv.join(':'))) continue; let r; try { r = await botRun(lv, c); } catch (e) { r = { lv: lv.join(':'), cls: c, status: 'threw ' + e.message.slice(0, 80) }; } out.push(r); console.log(JSON.stringify(r)); }
}
out.push({ errors: errors.slice(0, 10) });
const OUT = process.env.OUT || 'scripts/out/audit'; mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${MODE}${process.env.TAG || ''}.json`, JSON.stringify(out, null, 1));
await browser.close(); await server.close();
