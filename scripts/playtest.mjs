// Automated playtest. A bot (src/qa/bot.js) plays the game through its real
// inputs and reports on three things:
//   performance  update/frame cost, memory and draw calls over long sessions,
//                spikes and leaks, and a horde stress test
//   playability  static level checks on many generated districts, autonomous
//                exploration (stuck spots, falling out of the world, walls you
//                end up inside), plain-language goals, and the critical path
//                district after district (progression blockers)
//   enjoyment    novice/average/expert bots across classes: survival, deaths,
//                time-to-kill, level curve, economy, boss fight length
// Usage: node scripts/playtest.mjs [--quick] [--suites=static,goals,critical,explore,perf,stress,balance]
// Writes scripts/out/playtest/report.json and REPORT.md (+ anomaly screenshots).
// Exits non-zero on playability failures (errors, blockers, broken levels).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const SUITES = (args.find(a => a.startsWith('--suites=')) || '').slice(9).split(',').filter(Boolean);
const want = s => !SUITES.length || SUITES.includes(s);
const OUT = new URL('./out/playtest/', import.meta.url).pathname;
mkdirSync(OUT + 'shots', { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = await createServer({ server: { port: 5191, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
const errors = [];
page.on('pageerror', e => errors.push({ msg: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' | ') }));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push({ msg: 'console: ' + m.text() }); });
const S = (fn, a) => page.evaluate(fn, a);
const sleep = ms => page.waitForTimeout(ms);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

await page.goto('http://localhost:5191/?debug');
await page.waitForFunction(() => window.__scurry && window.__scurry.qa && document.querySelector('#overlay h1'), null, { timeout: 60000 });
await S(() => { __scurry.G.mode = 'survival'; });

const report = { when: new Date().toISOString(), quick: QUICK, perf: {}, playability: {}, balance: {}, errors, anomalies: [], verdict: {} };
let shotN = 0;

/** Wait for any district transition to finish (and clear level-up screens) so the world is whole. */
async function settle() {
  for (let i = 0; i < 60; i++) {
    const st = await S(() => __scurry.G.state);
    if (st === 'play') return;
    if (st === 'levelup') await S(() => { const o = __scurry.qa.bot && document.querySelector('.card'); if (o) o.click(); });
    await sleep(100);
  }
}
/** Start a run and a bot session. */
async function begin(cls, opts) {
  await S(([cls, opts]) => { const s = __scurry; s.G.mode = 'survival'; s.G.daily = false; s.meta.startAt = 'row'; s.qa.stop(); s.startRun(cls); s.qa.start(opts); }, [cls, opts]);
}
/** Fast-forward up to `secs` of game time in chunks; waits out district transitions. */
async function play(secs, chunk = 4, stopOnDistrict = false) {
  let left = secs, status = 'ok';
  const wallCap = Date.now() + Math.max(60000, secs * 1500);
  while (left > 0 && Date.now() < wallCap) {
    const before = await S(() => __scurry.qa.telemetry().simTime);
    status = await S(c => __scurry.qa.sim(c), Math.min(chunk, left));
    const after = await S(() => __scurry.qa.telemetry().simTime);
    left -= Math.max(0.05, after - before);
    await shootAnomalies();
    if (status === 'dead' || status === 'goal' || (stopOnDistrict && (status === 'district' || status === 'trans'))) break;
    if (status === 'trans') { await sleep(800); continue; }
    if (status !== 'ok' && status !== 'district') { await sleep(150); }
  }
  return status;
}
/** Screenshot the scene for each new anomaly (best effort: the moment it was caught). */
async function shootAnomalies() {
  const n = await S(() => __scurry.qa.telemetry().anomalies.filter(a => !a.shot).length);
  if (!n) return;
  await sleep(120);
  const path = `shots/anomaly-${++shotN}.png`;
  await page.screenshot({ path: OUT + path });
  await S(p => { for (const a of __scurry.qa.telemetry().anomalies) if (!a.shot) a.shot = p; }, path);
}
const tele = () => S(() => { const T = __scurry.qa.telemetry(); return JSON.parse(JSON.stringify({ ...T, updMs: T.updMs.slice(-6000) })); });
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const med = a => pct(a, 50);
const r1 = v => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- static level checks
if (want('static')) {
  log('static level checks');
  const runs = QUICK ? 3 : 10, out = [];
  for (let r = 0; r < runs; r++) {
    await S(() => { const s = __scurry; s.qa.stop(); s.G.mode = 'survival'; s.meta.startAt = 'row'; s.startRun('brawler'); });
    for (let d = 0; d < 4; d++) {
      await sleep(200);
      const res = await S(() => { const s = __scurry; return { name: s.M.kind + ' ' + document.getElementById('zoneName').textContent, seed: s.run.seed, district: s.run.district, ...s.qa.staticChecks() }; });
      out.push(res);
      await settle();
      await S(() => __scurry.exitRoad());
      await sleep(600);
      await settle();
    }
    await settle();
    await S(() => __scurry.enterSewer());
    await sleep(600);
    await settle();
    out.push(await S(() => { const s = __scurry; return { name: 'sewer ' + document.getElementById('zoneName').textContent, seed: s.run.seed, ...s.qa.staticChecks() }; }));
  }
  const issues = out.flatMap(o => o.issues.map(i => ({ ...i, where: o.name, seed: o.seed })));
  report.playability.static = {
    districts: out.length, errors: issues.filter(i => i.sev === 'error'), warnings: issues.filter(i => i.sev === 'warn'),
    avgReachTiles: Math.round(out.reduce((a, o) => a + o.reachTiles, 0) / out.length),
    interiors: out.reduce((a, o) => a + o.interiors, 0), setPieces: out.filter(o => o.tram || o.crane).length, viaAbility: out.reduce((a, o) => a + (o.viaAbility || 0), 0),
  };
  log(`  ${out.length} districts, ${report.playability.static.errors.length} errors, ${report.playability.static.warnings.length} warnings`);
}

// ---------------------------------------------------------------- plain-language goals
if (want('goals')) {
  log('plain-language goals');
  const goals = [
    ['clear the nests', 'brawler', 240], ['kill the boss', 'slinger', 420], ['go inside a building', 'sneak', 120],
    ['loot every chest', 'tank', 300], ['fail the run', 'warlock', 300],
  ];
  report.playability.goals = [];
  for (const [goal, cls, budget] of goals) {
    await begin(cls, { profile: 'expert', goal, assist: goal !== 'fail the run' });
    const status = await play(QUICK ? budget * 0.6 : budget);
    const T = await tele();
    const met = status === 'goal' || (await S(() => __scurry.qa.goalMet()));
    report.playability.goals.push({ goal, cls, met, simSecs: r1(T.simTime), parsed: await S(g => __scurry.qa.parseGoal(g), goal), anomalies: T.anomalies.length });
    report.anomalies.push(...T.anomalies.map(a => ({ ...a, suite: 'goals:' + goal })));
    log(`  "${goal}": ${met ? 'met' : 'NOT met'} in ${r1(T.simTime)}s`);
  }
}

// ---------------------------------------------------------------- critical path (regression)
if (want('critical')) {
  log('critical path');
  const target = QUICK ? 2 : 4;
  await begin('brawler', { profile: 'expert', goal: 'progress', assist: true });
  const perDistrict = [];
  let tStart = 0;
  for (let d = 0; d < target; d++) {
    const st = await play(420, 4, true);
    if (st === 'trans' || st === 'district') await sleep(1200); // let the transition land
    const s = await S(() => ({ tier: __scurry.run.tier, time: __scurry.run.time, boss: !!__scurry.G.boss, bossDone: __scurry.run.bossDone, exits: (__scurry.G.exits || []).length, state: __scurry.G.state, obj: __scurry.run.obj && __scurry.run.obj.kind }));
    perDistrict.push({ district: d, reachedNext: s.tier > d, secs: r1(s.time - tStart), status: st, ...s });
    tStart = s.time;
    if (s.tier <= d) break;
    await sleep(900);
  }
  const T = await tele();
  report.playability.critical = { target, reached: perDistrict.filter(p => p.reachedNext).length, perDistrict, anomalies: T.anomalies.length };
  report.perf.districtMemory = T.distMem;
  report.anomalies.push(...T.anomalies.map(a => ({ ...a, suite: 'critical' })));
  log(`  reached ${report.playability.critical.reached}/${target} districts`);
}

// ---------------------------------------------------------------- exploration
if (want('explore')) {
  log('autonomous exploration');
  const res = [];
  for (const cls of QUICK ? ['roof'] : ['roof', 'tank', 'sneak']) {
    await begin(cls, { profile: 'expert', goal: 'explore the district', assist: true });
    await play(QUICK ? 240 : 420);
    const c = await S(() => { const s = __scurry, B = s.qa.bot, M = s.M; let walk = 0; for (let k = 0; k < M.grid.length; k++) { const t = M.grid[k]; if (t === 1 || t === 2 || t === 9 || t === 10) walk++; } return { visited: B.visited.size, walk }; });
    const T = await tele();
    res.push({ cls, coverage: r1(c.visited / Math.max(1, c.walk) * 100), visited: c.visited, walkable: c.walk, stuck: T.anomalies.filter(a => a.kind === 'stuck').length, other: T.anomalies.filter(a => a.kind !== 'stuck').map(a => a.kind) });
    report.anomalies.push(...T.anomalies.map(a => ({ ...a, suite: 'explore:' + cls })));
    log(`  ${cls}: ${res[res.length - 1].coverage}% of walkable tiles, ${res[res.length - 1].stuck} stuck spots`);
  }
  report.playability.explore = res;
}

// ---------------------------------------------------------------- performance under load
if (want('stress')) {
  log('horde stress');
  await begin('brawler', { profile: 'average', goal: 'survive', assist: true });
  await play(5);
  const rows = [];
  for (const n of QUICK ? [50, 150, 220] : [25, 50, 100, 150, 220]) {
    await S(n => { __scurry.st.dmg = 0; __scurry.run.weapons.length = 0; __scurry.qa.stressSetup(n, __scurry.spawnEnemy); }, n); // the rat holds fire so the horde stays at full size
    const u0 = await S(() => __scurry.qa.telemetry().updMs.length);
    await play(3, 3);
    const T = await tele();
    const upd = T.updMs.slice(u0);
    const frames = await S(() => __scurry.qa.frameProbe(20));
    const live = await S(() => __scurry.W.enemies.length);
    rows.push({ mobs: live, updP50: r1(med(upd)), updP95: r1(pct(upd, 95)), frameP50: r1(med(frames)), frameP95: r1(pct(frames, 95)) });
    log(`  ${live} mobs: update p95 ${rows[rows.length - 1].updP95}ms, frame p50 ${rows[rows.length - 1].frameP50}ms`);
  }
  report.perf.stress = rows;
}

// ---------------------------------------------------------------- balance (and long-session perf)
if (want('balance') || want('perf')) {
  log('balance: skill profiles x classes');
  const classes = QUICK ? ['brawler', 'slinger'] : ['brawler', 'plague', 'slinger', 'warlock', 'tank', 'sneak', 'roof'];
  const profiles = ['novice', 'average', 'expert'];
  const eps = QUICK ? 1 : 3, cap = QUICK ? 300 : 900;
  const episodes = [];
  const updAll = [], frameAll = [], mem = [];
  for (const prof of profiles) for (const cls of classes) for (let i = 0; i < eps; i++) {
    await begin(cls, { profile: prof, goal: 'progress' });
    let status = 'ok', probes = 0;
    for (let t = 0; t < cap && status !== 'dead'; t += 30) {
      status = await play(30, 6);
      if (probes++ % 3 === 0) { const f = await S(() => __scurry.qa.frameProbe(12)); frameAll.push(...f.map(ms => ({ ms, n: 0 }))); }
    }
    const T = await tele();
    const s = await S(() => ({ time: __scurry.run.time, tier: __scurry.run.tier, level: __scurry.run.level, kills: __scurry.run.kills, scrap: __scurry.run.scrap + (__scurry.run.scrapSpent || 0), state: __scurry.G.state, perfects: __scurry.run.perfects || 0 }));
    updAll.push(...T.updMs);
    mem.push(...T.samples.map(x => ({ ...x, ep: episodes.length })));
    const ttk = {};
    for (const k in T.ttk) ttk[k] = r1(med(T.ttk[k]));
    episodes.push({ prof, cls, died: s.state === 'dead', secs: r1(s.time), district: s.tier, level: s.level, kills: s.kills, scrapPerMin: r1(s.scrap / Math.max(1, s.time / 60)), dmgTaken: Math.round(T.dmgTaken), hurt: T.hurt, ttk, levels: T.levels, bosses: T.bosses, perfects: s.perfects, deathBy: T.deaths[0] ? T.deaths[0].by : null });
    report.anomalies.push(...T.anomalies.map(a => ({ ...a, suite: `balance:${prof}:${cls}` })));
    log(`  ${prof.padEnd(7)} ${cls.padEnd(7)} ${s.state === 'dead' ? 'died' : 'alive'} at ${r1(s.time)}s, district ${s.tier + 1}, lvl ${s.level}, ${s.kills} kills`);
  }
  report.balance.episodes = episodes;
  // Per profile: survival, depth, levels, economy, time-to-kill, boss fights.
  report.balance.byProfile = profiles.map(p => {
    const e = episodes.filter(x => x.prof === p);
    const lvlAt = m => med(e.map(x => { const l = x.levels.filter(l => l.t <= m * 60); return l.length ? l[l.length - 1].lvl : 1; }));
    const gaps = e.flatMap(x => x.levels.map((l, i) => l.t - (i ? x.levels[i - 1].t : 0)));
    const ttk = {};
    for (const x of e) for (const k in x.ttk) (ttk[k] || (ttk[k] = [])).push(x.ttk[k]);
    const hurt = {};
    for (const x of e) for (const k in x.hurt) hurt[k] = (hurt[k] || 0) + x.hurt[k];
    const tot = Object.values(hurt).reduce((a, b) => a + b, 0) || 1;
    return {
      profile: p, episodes: e.length, deathRate: r1(e.filter(x => x.died).length / e.length * 100), medianSurvival: r1(med(e.map(x => x.secs))),
      medianDistrict: med(e.map(x => x.district + 1)), lvlAt3: lvlAt(3), lvlAt5: lvlAt(5), lvlAt10: lvlAt(10),
      medianLevelGap: r1(med(gaps)), maxLevelGap: r1(Math.max(0, ...gaps)), scrapPerMin: r1(med(e.map(x => x.scrapPerMin))),
      ttk: Object.fromEntries(Object.entries(ttk).map(([k, v]) => [k, r1(med(v))])),
      topDamage: Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, Math.round(v / tot * 100)]),
      bossFights: e.flatMap(x => x.bosses).map(b => r1(b.secs)), perfects: med(e.map(x => x.perfects)),
    };
  });
  report.balance.byClass = classes.map(c => { const e = episodes.filter(x => x.cls === c); return { cls: c, deathRate: r1(e.filter(x => x.died).length / e.length * 100), medianSurvival: r1(med(e.map(x => x.secs))), medianLevel: med(e.map(x => x.level)), medianKills: med(e.map(x => x.kills)) }; });
  // Long-session performance and memory (leaks are judged per district entry, below).
  report.perf.session = {
    simSteps: updAll.length, updP50: r1(med(updAll)), updP95: r1(pct(updAll, 95)), updP99: r1(pct(updAll, 99)), updMax: r1(Math.max(0, ...updAll)),
    frameP50: r1(med(frameAll.map(f => f.ms))), frameP95: r1(pct(frameAll.map(f => f.ms), 95)),
    peakParts: Math.max(0, ...mem.map(m => m.parts)), peakGibs: Math.max(0, ...mem.map(m => m.gibs)), peakEnemies: Math.max(0, ...mem.map(m => m.enemies)), peakCalls: await S(() => __scurry.qa.telemetry().calls || 0),
    heapPeakMB: Math.max(0, ...mem.map(m => m.heapMB)),
  };
}

// ---------------------------------------------------------------- verdicts
const V = report.verdict, fails = [], warns = [];
if (errors.length) fails.push(`${errors.length} runtime error(s)`);
const st = report.playability.static;
if (st && st.errors.length) fails.push(`${st.errors.length} level error(s) across ${st.districts} districts`);
if (st && st.warnings.length) warns.push(`${st.warnings.length} level warning(s)`);
const cp = report.playability.critical;
if (cp && cp.reached < cp.target) fails.push(`critical path stopped at district ${cp.reached + 1} of ${cp.target}`);
for (const g of report.playability.goals || []) if (!g.met) warns.push(`goal "${g.goal}" not met in ${g.simSecs}s`);
const hard = report.anomalies.filter(a => ['nan-position', 'fell-out-of-world', 'inside-wall', 'enemy-nan'].includes(a.kind));
if (hard.length) fails.push(`${hard.length} physics anomaly(ies): ${[...new Set(hard.map(a => a.kind))].join(', ')}`);
const stuck = report.anomalies.filter(a => a.kind === 'stuck');
if (stuck.length) warns.push(`${stuck.length} stuck spot(s) (check the screenshots: some are bot navigation, some are real snags)`);
const spikes = report.anomalies.filter(a => a.kind === 'update-spike');
if (spikes.length) warns.push(`${spikes.length} simulation spike(s) over 60ms`);
const ps = report.perf.session;
if (ps) {
  if (ps.updP95 > 16) warns.push(`game logic p95 ${ps.updP95}ms per step (budget 16ms)`);
}
// Leaks: GPU geometry/texture counts at the start of each district should stay flat.
const dm = report.perf.districtMemory || [];
if (dm.length >= 3) {
  const a = dm[1], b = dm[dm.length - 1];
  if (b.geo > a.geo * 1.25 + 50) fails.push(`geometries grew from ${a.geo} to ${b.geo} across districts (leak)`);
  if (b.tex > a.tex * 1.25 + 10) fails.push(`textures grew from ${a.tex} to ${b.tex} across districts (leak)`);
}
// Balance targets: frustrating vs boring.
for (const p of report.balance.byProfile || []) {
  if (p.profile === 'novice' && p.medianSurvival < 150) warns.push(`novices die fast (median ${p.medianSurvival}s): early game may be too hard`);
  if (p.profile === 'expert' && p.deathRate === 0 && p.medianDistrict <= 1 && !QUICK) warns.push('experts never die and never progress: may be too easy/slow');
  if (p.maxLevelGap > 120) warns.push(`${p.profile}: a level took ${p.maxLevelGap}s (progression stall)`);
  if (p.medianLevelGap && p.medianLevelGap < 6) warns.push(`${p.profile}: levels every ${p.medianLevelGap}s (level-up spam)`);
  for (const [k, v] of Object.entries(p.ttk)) if (!k.startsWith('boss') && k !== 'nest' && v > 8) warns.push(`${p.profile}: ${k} take ${v}s to kill`);
  const top = p.topDamage[0];
  if (top && top[1] > 45 && !top[0].startsWith('boss')) warns.push(`${p.profile}: ${top[1]}% of damage comes from ${top[0]}`);
  for (const b of p.bossFights) if (b > 240) warns.push(`${p.profile}: a boss fight lasted ${b}s`);
  if (p.bossFights.length && med(p.bossFights) < 25) warns.push(`${p.profile}: bosses die in ${r1(med(p.bossFights))}s (median): boss fights may be too short`);
}
// Class balance: one class never dying while another always does is a red flag.
const bc = report.balance.byClass || [];
if (bc.length > 1) {
  const lo = bc.reduce((a, b) => (b.medianSurvival < a.medianSurvival ? b : a)), hi = bc.reduce((a, b) => (b.medianSurvival > a.medianSurvival ? b : a));
  if (hi.medianSurvival > lo.medianSurvival * 2.5) warns.push(`class gap: ${hi.cls} survives ${hi.medianSurvival}s (median), ${lo.cls} only ${lo.medianSurvival}s`);
}
V.fails = fails; V.warnings = warns; V.pass = !fails.length;
report.anomalies = report.anomalies.map(a => ({ ...a, context: a.context.slice(-12) }));
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
writeFileSync(OUT + 'REPORT.md', markdown(report));
// On GitHub Actions: failures and warnings become annotations, and the report the job summary.
if (process.env.GITHUB_ACTIONS) {
  for (const f of fails) console.log('::error title=Playtest::' + f);
  for (const w of warns.slice(0, 9)) console.log('::warning title=Playtest::' + w);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(report));
}
log(V.pass ? 'PASS' : 'FAIL', fails.join('; '));
if (warns.length) log('warnings:', warns.length);
await browser.close();
await server.close();
process.exit(V.pass ? 0 : 1);

// ---------------------------------------------------------------- report
function markdown(R) {
  const L = [];
  const tbl = (cols, rows) => { L.push('| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|'); for (const r of rows) L.push('| ' + r.join(' | ') + ' |'); L.push(''); };
  L.push(`# Scurry playtest report`, '', `${R.when} · ${R.quick ? 'quick' : 'full'} run · **${R.verdict.pass ? 'PASS' : 'FAIL'}**`, '');
  if (R.verdict.fails.length) { L.push('**Failures**', ''); R.verdict.fails.forEach(f => L.push('- ' + f)); L.push(''); }
  if (R.verdict.warnings.length) { L.push('**Warnings**', ''); R.verdict.warnings.forEach(f => L.push('- ' + f)); L.push(''); }
  L.push('## Performance', '');
  if (R.perf.session) { const p = R.perf.session; tbl(['Measure', 'Value'], [['Simulated steps', p.simSteps], ['Game logic per step p50 / p95 / p99 / max', `${p.updP50} / ${p.updP95} / ${p.updP99} / ${p.updMax} ms`], ['Rendered frame p50 / p95 (software GPU)', `${p.frameP50} / ${p.frameP95} ms`], ['Peak enemies / particles / gibs', `${p.peakEnemies} / ${p.peakParts} / ${p.peakGibs}`], ['Peak draw calls', p.peakCalls], ['Peak JS heap', p.heapPeakMB + ' MB']]); }
  if (R.perf.stress) tbl(['Mobs', 'Logic p50', 'Logic p95', 'Frame p50', 'Frame p95'], R.perf.stress.map(r => [r.mobs, r.updP50 + ' ms', r.updP95 + ' ms', r.frameP50 + ' ms', r.frameP95 + ' ms']));
  L.push('## Playability', '');
  if (R.perf.districtMemory && R.perf.districtMemory.length) tbl(['District entered', 'Geometries', 'Textures', 'JS heap', 'World objects'], R.perf.districtMemory.map(m => [m.district + 1, m.geo, m.tex, m.heapMB + ' MB', m.objects]));
  if (R.playability.static) { const s = R.playability.static; L.push(`Static checks on ${s.districts} generated districts: ${s.errors.length} errors, ${s.warnings.length} warnings, ${s.interiors} interiors, ~${s.avgReachTiles} tiles reachable on foot each; ${s.viaAbility} items reachable only by climbing, gnawing or squeezing (by design).`, ''); if (s.errors.length) tbl(['Issue', 'Where', 'Tile', 'Seed'], s.errors.slice(0, 25).map(i => [i.kind, i.where, `${i.gx},${i.gz}`, i.seed])); }
  if (R.playability.goals) tbl(['Goal (plain language)', 'Parsed as', 'Class', 'Met', 'Sim time'], R.playability.goals.map(g => [g.goal, g.parsed, g.cls, g.met ? 'yes' : '**no**', g.simSecs + 's']));
  if (R.playability.critical) tbl(['District', 'Reached next', 'Time', 'Objective', 'Boss down'], R.playability.critical.perDistrict.map(p => [p.district + 1, p.reachedNext ? 'yes' : '**no**', p.secs + 's', p.obj || '-', p.bossDone || p.reachedNext ? 'yes' : 'no']));
  if (R.playability.explore) tbl(['Class', 'Coverage', 'Stuck spots', 'Other anomalies'], R.playability.explore.map(e => [e.cls, e.coverage + '%', e.stuck, e.other.join(', ') || '-']));
  if (R.anomalies.length) { L.push('### Anomalies', ''); tbl(['Kind', 'Suite', 'District', 'Pos', 'Tile', 'Screenshot'], R.anomalies.slice(0, 40).map(a => [a.kind, a.suite, a.district + 1, a.pos.join(', '), a.tile ? `${a.tile.gx},${a.tile.gz} t${a.tile.t}` : '-', a.shot || '-'])); L.push('Each anomaly in report.json carries the last seconds of game state (position, HP, nearby enemies, the bot\'s goal and input) for reproduction.', ''); }
  L.push('## Balance', '');
  if (R.balance.byProfile) {
    tbl(['Profile', 'Episodes', 'Death rate', 'Median survival', 'Median district', 'Lvl @3/5/10 min', 'Median level gap', 'Scrap/min', 'Perfect dodges'], R.balance.byProfile.map(p => [p.profile, p.episodes, p.deathRate + '%', p.medianSurvival + 's', p.medianDistrict, `${p.lvlAt3}/${p.lvlAt5}/${p.lvlAt10}`, p.medianLevelGap + 's', p.scrapPerMin, p.perfects]));
    tbl(['Profile', 'Time to kill (median s)', 'Top damage sources', 'Boss fights'], R.balance.byProfile.map(p => [p.profile, Object.entries(p.ttk).sort().map(([k, v]) => `${k} ${v}`).join(', '), p.topDamage.map(([k, v]) => `${k} ${v}%`).join(', '), p.bossFights.length ? p.bossFights.map(s => s + 's').join(', ') : '-']));
    tbl(['Class', 'Death rate', 'Median survival', 'Median level', 'Median kills'], R.balance.byClass.map(c => [c.cls, c.deathRate + '%', c.medianSurvival + 's', c.medianLevel, c.medianKills]));
  }
  if (R.errors.length) { L.push('## Runtime errors', ''); R.errors.slice(0, 20).forEach(e => L.push('- `' + e.msg + '` ' + (e.stack || ''))); L.push(''); }
  L.push('## Not covered', '', 'The bots measure stability, pacing and numbers. They cannot judge feel: whether movement is satisfying, the UI is clear, or the story lands. That still needs people playing.', '');
  return L.join('\n');
}
