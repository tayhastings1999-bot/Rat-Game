// Performance baseline capture, repeated at the end of every rebuild phase.
// Bots (window.__scurry.qa) play each profile for N simulated minutes (new runs
// start after a death until the time is used up). Every simulated minute the
// sim pauses and the harness measures:
//   - update ms per simulation step (with the enemy count at the time)
//   - sync ms (scene sync + animation, timed directly, 30 iterations)
//   - renderer.info over real rendered frames: draw calls, triangles, programs
//   - GPU memory: geometries, textures
//   - scene census: unique geometries, meshes, shadow casters, lights, sprites
// Frame times come from a software renderer (SwiftShader) here, so they're
// recorded but not comparable to a real GPU; CPU costs and counts are.
// Usage: node scripts/baseline.mjs [--minutes=10] [--profiles=expert,average] [--cls=brawler] [--label=phase0]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const MIN = +arg('minutes', 10), PROFILES = arg('profiles', 'expert,average').split(','), CLS = arg('cls', 'brawler'), LABEL = arg('label', 'baseline');
const OUT = new URL('./out/baseline/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await createServer({ server: { port: 5186, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5186/?debug');
await page.waitForFunction(() => window.__scurry, null, { timeout: 30000 });
const S = (f, a) => page.evaluate(f, a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r2 = v => +(+v).toFixed(2);

const startRun = prof => S(([c, p]) => { const s = __scurry; s.qa.stop(); s.G.mode = 'survival'; s.meta.startAt = 'row'; s.startRun(c); s.qa.start({ profile: p, goal: 'survive' }); }, [CLS, prof]);
/** One measurement point: real frames for renderer.info, timed sync, scene census. */
const probe = () => S(async () => {
  const s = __scurry, r = s.renderer;
  r.info.autoReset = false;
  const calls = [], tris = [], ft = [];
  await new Promise(res => {
    let n = 0, last = performance.now();
    const f = now => { if (n > 2) { calls.push(r.info.render.calls); tris.push(r.info.render.triangles); ft.push(now - last); } r.info.reset(); last = now; if (++n < 24) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
  r.info.autoReset = true;
  let sy = 0;
  for (let i = 0; i < 30; i++) { const a = performance.now(); s.sync(1 / 60); s.animate(1 / 60); sy += performance.now() - a; }
  const geos = new Set(); let meshes = 0, casters = 0, lights = 0, sprites = 0, instanced = 0;
  s.scene.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) { meshes++; if (o.geometry) geos.add(o.geometry.uuid); if (o.castShadow) casters++; if (o.isInstancedMesh) instanced++; }
    if (o.isSprite) sprites++;
    if (o.isLight && o.visible) lights++;
  });
  return {
    enemies: s.W.enemies.length, calls: Math.max(...calls), tris: Math.max(...tris), frameMs: ft.sort((a, b) => a - b)[ft.length >> 1],
    programs: (r.info.programs || []).length, geometries: r.info.memory.geometries, textures: r.info.memory.textures,
    syncMs: sy / 30, uniqueGeo: geos.size, meshes, casters, lights, sprites, instanced,
  };
});

const report = { label: LABEL, when: new Date().toISOString(), minutes: MIN, cls: CLS, profiles: {} };
for (const prof of PROFILES) {
  console.log(`[${prof}] ${MIN} simulated minutes`);
  await startRun(prof);
  await sleep(400);
  let simTotal = 0, nextProbe = 60, runs = 1, deaths = 0, peak = 0;
  const steps = [], probes = [];
  let lastT = 0;
  while (simTotal < MIN * 60) {
    const st = await S(() => __scurry.qa.sim(10));
    const t = await S(() => { const T = __scurry.qa.telemetry(); return { sim: T.simTime, upd: T.updMs.slice(-400), n: __scurry.W.enemies.length, peak: T.peakEnemies }; });
    // Pair each new step cost with the enemy count around it.
    const fresh = Math.min(t.upd.length, Math.max(0, Math.round((t.sim - lastT) * 30)));
    for (const ms of t.upd.slice(-fresh)) steps.push([t.n, ms]);
    simTotal += Math.max(0, t.sim - lastT);
    lastT = t.sim;
    peak = Math.max(peak, t.peak, t.n);
    if (st === 'trans') await sleep(800);
    if (simTotal >= nextProbe) { const pr = await probe(); pr.t = Math.round(simTotal); probes.push(pr); nextProbe += 60; console.log(`  ${Math.round(simTotal)}s · ${pr.enemies} enemies · sync ${r2(pr.syncMs)}ms · calls ${pr.calls} · geo ${pr.geometries} · tex ${pr.textures} · programs ${pr.programs}`); }
    if (st === 'dead') { deaths++; runs++; lastT = 0; await startRun(prof); await sleep(400); }
  }
  await S(() => __scurry.qa.stop());
  const ms = steps.map(s => s[1]);
  const bins = [[0, 50], [50, 100], [100, 150], [150, 200], [200, 250], [250, 1e9]].map(([a, b]) => {
    const v = steps.filter(s => s[0] >= a && s[0] < b).map(s => s[1]);
    return { enemies: b > 1e8 ? `${a}+` : `${a}–${b - 1}`, steps: v.length, mean: r2(v.reduce((x, y) => x + y, 0) / Math.max(1, v.length)), p95: r2(pct(v, 0.95)) };
  }).filter(b => b.steps);
  const pk = k => Math.max(...probes.map(p => p[k]));
  report.profiles[prof] = {
    runs, deaths, peakEnemies: peak,
    update: { mean: r2(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length)), p95: r2(pct(ms, 0.95)), max: r2(Math.max(...ms)), over50: ms.filter(v => v > 50).length, steps: ms.length, byEnemies: bins },
    sync: { mean: r2(probes.reduce((a, p) => a + p.syncMs, 0) / Math.max(1, probes.length)), max: r2(pk('syncMs')) },
    peak: { calls: pk('calls'), tris: pk('tris'), programs: pk('programs'), geometries: pk('geometries'), textures: pk('textures'), uniqueGeo: pk('uniqueGeo'), meshes: pk('meshes'), casters: pk('casters'), lights: pk('lights'), sprites: pk('sprites') },
    probes,
  };
}
report.errors = errors.slice(0, 20);
writeFileSync(OUT + LABEL + '.json', JSON.stringify(report, null, 1));

// Markdown summary.
const P = report.profiles, ks = Object.keys(P);
const row = (name, f) => `| ${name} | ${ks.map(k => f(P[k])).join(' | ')} |`;
const md = [`# Baseline · ${LABEL}`, '', `${report.when} · ${CLS} · ${MIN} simulated minutes per profile · SwiftShader (frame times not representative)`, '',
  `| Measure | ${ks.join(' | ')} |`, `|---|${ks.map(() => '---').join('|')}|`,
  row('Runs (deaths)', p => `${p.runs} (${p.deaths})`),
  row('Peak enemies', p => p.peakEnemies),
  row('Update ms mean / p95 / max', p => `${p.update.mean} / ${p.update.p95} / ${p.update.max}`),
  row('Update steps over 50 ms', p => p.update.over50),
  row('Sync ms mean / max', p => `${p.sync.mean} / ${p.sync.max}`),
  row('Draw calls (peak)', p => p.peak.calls),
  row('Triangles (peak)', p => p.peak.tris),
  row('Shader programs', p => p.peak.programs),
  row('GPU geometries / textures', p => `${p.peak.geometries} / ${p.peak.textures}`),
  row('Unique scene geometries', p => p.peak.uniqueGeo),
  row('Meshes', p => p.peak.meshes),
  row('Shadow casters', p => p.peak.casters),
  row('Lights (visible)', p => p.peak.lights),
  row('Sprites', p => p.peak.sprites),
  '', '## Update cost by enemy count', '', ...ks.flatMap(k => [`**${k}**`, '', '| Enemies | Steps | Mean ms | p95 ms |', '|---|---|---|---|', ...P[k].update.byEnemies.map(b => `| ${b.enemies} | ${b.steps} | ${b.mean} | ${b.p95} |`), '']),
  report.errors.length ? `Errors: ${report.errors.join(' · ')}` : 'No page errors.'];
writeFileSync(OUT + LABEL + '.md', md.join('\n') + '\n');
console.log(md.join('\n'));
await browser.close();
await server.close();
