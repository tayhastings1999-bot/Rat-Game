// Stage 5 · Hybrid soak (deterministic driver + bots, hours to days).
// The driver keeps the game running through its real UI: pick a class card,
// let a bot play (rotating class and skill) until it dies or a time cap, click
// "Play again" on the death screen, and reload the page every few cycles so
// the game boots again from its
// save. Between cycles it forces garbage collection and records:
//   leaks         JS heap after GC, GPU geometries/textures, scene objects
//   degradation   game-logic cost per 100 mobs, stuck mobs, physics anomalies
//   saves         every scurry.* save parses; meta stays sane (finite, never
//                 negative, runs count up by one per run, lifetime totals never
//                 shrink) and survives a reload unchanged
// Trends are fitted per hour; the report is flushed every few minutes so a
// crash or a cancelled job still leaves results.
// Usage: node scripts/soak.mjs [--hours=24] [--cap=900] [--flush=5]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? +a.split('=')[1] : d; };
const HOURS = arg('hours', 24), CAP = arg('cap', 900), FLUSH_MIN = arg('flush', 5);
const OUT = new URL('./out/soak/', import.meta.url).pathname;
mkdirSync(OUT + 'shots', { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await createServer({ server: { port: 5188, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 560 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push({ t: Date.now(), msg: e.message, stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') }));
page.on('console', m => { if (m.type() === 'error') errors.push({ t: Date.now(), msg: 'console: ' + m.text() }); });
page.on('crash', () => errors.push({ t: Date.now(), msg: 'PAGE CRASHED' }));
const S = (fn, a) => page.evaluate(fn, a);
const sleep = ms => page.waitForTimeout(ms);
const t0 = Date.now(), until = t0 + HOURS * 3600e3;
const hrs = () => (Date.now() - t0) / 3600e3;
const log = (...a) => console.log(`[${hrs().toFixed(2)}h]`, ...a);

const CLASSES = ['brawler', 'plague', 'slinger', 'warlock', 'tank', 'sneak', 'roof'], PROFILES = ['novice', 'average', 'expert'];
const cycles = [], saveIssues = [], anomalies = [];
let lastFlush = Date.now(), lastMeta = null;

async function boot() {
  await page.goto('http://localhost:5188/?debug');
  await page.waitForFunction(() => window.__scurry && window.__scurry.qa && document.querySelector('#overlay h1'), null, { timeout: 60000 });
  await S(() => { __scurry.G.mode = 'survival'; });
}
/** Validate every save key and the meta invariants; compare with the previous snapshot. */
async function checkSaves(label) {
  const r = await S(() => {
    const out = { bad: [], meta: null };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('scurry')) continue;
      try { JSON.parse(localStorage.getItem(k)); } catch (e) { out.bad.push(`${k} does not parse`); }
    }
    try { out.meta = JSON.parse(localStorage.getItem('scurry.meta')); } catch (e) { out.bad.push('scurry.meta missing or corrupt'); }
    const walk = (o, p) => { for (const [k, v] of Object.entries(o || {})) { if (typeof v === 'number' && (!Number.isFinite(v) || v < -1)) out.bad.push(`${p}${k} = ${v}`); else if (v && typeof v === 'object') walk(v, p + k + '.'); } };
    walk(out.meta, 'meta.');
    return out;
  });
  for (const b of r.bad) saveIssues.push({ at: label, hrs: +hrs().toFixed(2), issue: b });
  const m = r.meta;
  if (m && lastMeta) {
    for (const k of ['kills', 'bosses', 'maxDistrict']) if ((m[k] ?? 0) < (lastMeta[k] ?? 0)) saveIssues.push({ at: label, hrs: +hrs().toFixed(2), issue: `meta.${k} went down ${lastMeta[k]} → ${m[k]}` });
  }
  return m;
}
async function measure() {
  await S(() => { if (window.gc) { window.gc(); window.gc(); } });
  return S(() => {
    const s = __scurry, ri = s.renderer.info;
    return { heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0, geo: ri.memory.geometries, tex: ri.memory.textures, scene: s.scene.children.length };
  });
}
/** Least-squares slope per hour. */
function slope(pts) {
  if (pts.length < 3) return 0;
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0) || 1;
  return num / den;
}
function analyse() {
  const after = cycles.slice(Math.min(3, Math.floor(cycles.length / 4))); // skip warm-up
  const fit = k => +slope(after.map(c => [c.hrs, c.mem[k]])).toFixed(2);
  const cost = +slope(after.filter(c => c.costPer100 > 0).map(c => [c.hrs, c.costPer100])).toFixed(3);
  const verdict = [];
  const span = after.length ? after[after.length - 1].hrs - after[0].hrs : 0;
  const trend = { heapMBPerHour: fit('heapMB'), geoPerHour: fit('geo'), texPerHour: fit('tex'), sceneObjectsPerHour: fit('scene'), logicMsPer100MobsPerHour: cost };
  if (span > 0.5) {
    if (trend.heapMBPerHour > 15) verdict.push(`JS heap after GC grows ${trend.heapMBPerHour} MB/hour (leak)`);
    if (trend.geoPerHour > 60) verdict.push(`GPU geometries grow ${trend.geoPerHour}/hour (leak)`);
    if (trend.texPerHour > 4) verdict.push(`GPU textures grow ${trend.texPerHour}/hour (leak)`);
    if (trend.sceneObjectsPerHour > 10) verdict.push(`scene objects grow ${trend.sceneObjectsPerHour}/hour (leak)`);
    const c0 = after[0] && after[0].costPer100;
    if (c0 && cost > c0 * 0.25) verdict.push(`game logic gets slower by ${cost}ms per 100 mobs per hour (degradation)`);
  }
  if (saveIssues.length) verdict.push(`${saveIssues.length} save-file issue(s)`);
  const crash = errors.filter(e => /CRASH/.test(e.msg)).length;
  if (crash) verdict.push(`${crash} page crash(es)`);
  if (errors.length) verdict.push(`${errors.length} runtime error(s)`);
  const phys = anomalies.filter(a => ['nan-position', 'fell-out-of-world', 'inside-wall', 'out-of-bounds', 'enemy-nan', 'levelup-loop', 'empty-levelup'].includes(a.kind));
  if (phys.length) verdict.push(`${phys.length} physics/state anomaly(ies): ${[...new Set(phys.map(a => a.kind))].join(', ')}`);
  return { trend, verdict, spanHours: +span.toFixed(2) };
}
function flush(final = false) {
  const A = analyse();
  const simH = cycles.reduce((a, c) => a + c.simSecs, 0) / 3600;
  const rep = { started: new Date(t0).toISOString(), hours: +hrs().toFixed(2), final, cycles: cycles.length, simulatedHours: +simH.toFixed(2), reloads: cycles.filter(c => c.reloaded).length, ...A, saveIssues, errors: errors.slice(0, 50), anomalies: anomalies.slice(0, 100), samples: cycles };
  writeFileSync(OUT + 'soak.json', JSON.stringify(rep, null, 1));
  const L = [`# Soak test`, '', `${rep.hours}h wall clock · ${rep.cycles} runs · ${rep.simulatedHours} simulated hours of play · ${rep.reloads} reloads from save · **${A.verdict.length ? 'ISSUES' : 'CLEAN'}**${final ? '' : ' (in progress)'}`, ''];
  if (A.verdict.length) { L.push(...A.verdict.map(v => '- ' + v), ''); }
  L.push('| Trend (per hour, after warm-up) | Value |', '|---|---|', ...Object.entries(A.trend).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('| Run | Hours | Class | Profile | Sim secs | Outcome | Heap after GC | Geometries | Textures | Scene objects | Logic ms/100 mobs | Stuck mobs |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  const pick = cycles.length > 40 ? cycles.filter((c, i) => i % Math.ceil(cycles.length / 40) === 0 || i === cycles.length - 1) : cycles;
  for (const c of pick) L.push(`| ${c.n} | ${c.hrs} | ${c.cls} | ${c.prof} | ${c.simSecs} | ${c.outcome} | ${c.mem.heapMB} MB | ${c.mem.geo} | ${c.mem.tex} | ${c.mem.scene} | ${c.costPer100} | ${c.stuckMobs} |`);
  if (saveIssues.length) L.push('', '## Save issues', '', ...saveIssues.slice(0, 30).map(s => `- ${s.hrs}h ${s.at}: ${s.issue}`));
  writeFileSync(OUT + 'SOAK.md', L.join('\n') + '\n');
  if (final && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, L.join('\n') + '\n');
  lastFlush = Date.now();
  return A;
}

await boot();
lastMeta = await checkSaves('boot');
log(`soak for ${HOURS}h, runs capped at ${CAP} game-seconds`);
for (let n = 1; Date.now() < until; n++) {
  const cls = CLASSES[n % CLASSES.length], prof = PROFILES[n % PROFILES.length];
  try {
    // Deterministic: start the run through the real menu card.
    if ((await S(() => __scurry.G.state)) !== 'menu') await S(() => __scurry.menu());
    await page.click('#mS').catch(() => {});
    await page.click(`.card[data-k="${cls}"]`, { timeout: 5000 }).catch(() => {});
    await sleep(250);
    if ((await S(() => __scurry.G.state)) === 'menu') await S(c => __scurry.startRun(c), cls); // a locked class card does nothing: start through the API
    await S(p => __scurry.qa.start({ profile: p, goal: 'progress' }), prof);
    // AI: play until death or the cap.
    let simmed = 0, outcome = 'cap';
    while (simmed < CAP) {
      const st = await S(() => __scurry.qa.sim(10));
      simmed = await S(() => __scurry.qa.telemetry().simTime);
      if (st === 'dead') { outcome = 'died'; break; }
      if (st === 'trans') await sleep(800);
      if (st !== 'ok' && st !== 'district' && st !== 'trans' && st !== 'goal') { await sleep(200); if ((await S(() => __scurry.G.state)) === 'menu') { outcome = 'menu?'; break; } }
    }
    const T = await S(() => { const T = __scurry.qa.telemetry(); const u = T.updMs.slice(-3000), s = T.samples; return { simTime: T.simTime, anomalies: T.anomalies.map(a => ({ kind: a.kind, pos: a.pos, district: a.district })), upd: u.reduce((a, b) => a + b, 0) / Math.max(1, u.length), mobs: s.reduce((a, x) => a + x.enemies, 0) / Math.max(1, s.length), stuck: s.reduce((a, x) => a + (x.stuckMobs || 0), 0) / Math.max(1, s.length), tier: __scurry.run.tier }; });
    anomalies.push(...T.anomalies.map(a => ({ ...a, run: n, hrs: +hrs().toFixed(2) })));
    await S(() => __scurry.qa.stop());
    // Deterministic: leave through the real death-screen button, or die on purpose at the cap.
    if (outcome === 'cap') await S(() => { if (__scurry.G.state !== 'dead') __scurry.die(); });
    await page.click('#again', { timeout: 5000 }).catch(async () => { await S(() => __scurry.menu()); });
    // Every 10th run, reload: the game must boot again from its save, unchanged.
    let reloaded = false;
    const before = await checkSaves(`run ${n}`);
    if (before && lastMeta && (before.runs ?? 0) !== (lastMeta.runs ?? 0) + 1) saveIssues.push({ at: `run ${n}`, hrs: +hrs().toFixed(2), issue: `meta.runs ${lastMeta.runs} → ${before.runs} (expected +1)` });
    if (n % 10 === 0) {
      await boot();
      const after = await S(() => JSON.parse(JSON.stringify(__scurry.meta)));
      for (const k of ['salvage', 'kills', 'runs']) if ((after[k] ?? 0) !== (before[k] ?? 0)) saveIssues.push({ at: `reload after run ${n}`, hrs: +hrs().toFixed(2), issue: `meta.${k} ${before[k]} saved, ${after[k]} loaded` });
      reloaded = true;
    }
    lastMeta = before || lastMeta;
    const mem = await measure();
    cycles.push({ n, hrs: +hrs().toFixed(3), cls, prof, simSecs: Math.round(T.simTime), outcome, district: T.tier + 1, mem, costPer100: T.mobs > 5 ? +(T.upd / T.mobs * 100).toFixed(3) : 0, stuckMobs: +T.stuck.toFixed(1), reloaded });
    if (n % 10 === 0 || n < 4) log(`run ${n}: ${cls}/${prof} ${outcome} after ${Math.round(T.simTime)}s · heap ${mem.heapMB}MB geo ${mem.geo} tex ${mem.tex} scene ${mem.scene}`);
  } catch (e) {
    errors.push({ t: Date.now(), msg: 'driver: ' + e.message });
    log('driver error, rebooting:', e.message);
    await page.screenshot({ path: `${OUT}shots/driver-${n}.png` }).catch(() => {});
    await boot().catch(() => {});
  }
  if (Date.now() - lastFlush > FLUSH_MIN * 60e3) { const A = flush(); log(`checkpoint: ${cycles.length} runs, ${A.verdict.length ? A.verdict.join('; ') : 'clean'}`); }
}
const A = flush(true);
log(A.verdict.length ? 'SOAK ISSUES: ' + A.verdict.join('; ') : 'soak clean');
await browser.close();
await server.close();
process.exit(A.verdict.length ? 1 : 0);
