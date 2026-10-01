// Set-piece tour: an interior (cutaway), the tram passing, the crane, the
// market, the garden and the boss arena, across the four city districts.
// Usage: node scripts/places.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/places/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5195, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const S = (fn, a) => page.evaluate(fn, a);
const clear = async () => { for (let i = 0; i < 20 && (await S(() => __scurry.G.state)) === 'levelup'; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(80); } };
const calm = () => S(() => { const s = __scurry; s.god(true); Object.assign(s.run, { expoCd: 1e9, evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9, bossAt: 1e9 }); s.W.enemies.forEach(e => { if (!e.mesh && e.type !== 'nest') e.dead = true; }); });
const tp = (x, z, y = 0) => S(([x, z, y]) => { const P = __scurry.P; P.x = x; P.z = z; P.y = y; P.vx = P.vz = P.vy = 0; }, [x, z, y]);
await page.goto('http://localhost:5195/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
await S(() => { __scurry.G.testNoRoles = true; __scurry.startRun('brawler'); });
await page.waitForTimeout(800);
for (let d = 0; d < 4; d++) {
  await clear();
  await calm();
  const info = await S(() => { const s = __scurry, W = s.W; return { name: s.M.kind, d: s.run.district, tram: !!W.tram, crane: !!W.crane, uses: W.uses.length, washers: W.washers.length, rain: s.run.rain, arena: s.G.arena && s.G.arena.kind, dogs: W.enemies.filter(e => e.dog).length, inside: s.M.inside.reduce((a, v) => a + (v ? 1 : 0), 0) }; });
  console.log('district', d, JSON.stringify(info));
  // Step into the first interior.
  const room = await S(() => { const M = __scurry.M; for (let k = 0; k < M.inside.length; k++) if (M.inside[k] && M.grid[k] === 1) return { x: (k % M.W - M.W / 2 + 0.5) * 4, z: (((k / M.W) | 0) - M.H / 2 + 0.5) * 4 }; return null; });
  if (room) { await tp(room.x, room.z); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}d${d}-interior.png` }); console.log('  inBldg', await S(() => __scurry.P.inBldg)); }
  if (info.tram) {
    await S(() => { const t = __scurry.W.tram, P = __scurry.P; t.state = 'idle'; t.t = 0; const tx = t.axis === 'z' ? t.c + 6 : P.x, tz = t.axis === 'z' ? P.z : t.c + 6; P.x = tx; P.z = tz; P.y = 0; __scurry.G.camYaw = t.axis === 'z' ? -Math.PI / 2 : Math.PI; });
    await page.waitForTimeout(3600);
    for (let i = 0; i < 6; i++) { const s = await S(() => { const t = __scurry.W.tram, P = __scurry.P; return Math.abs((t.axis === 'z' ? P.z : P.x) - t.pos); }); if (s < 14) break; await page.waitForTimeout(250); }
    await page.screenshot({ path: `${OUT}d${d}-tram.png` });
  }
  if (info.crane) {
    await S(() => { const c = __scurry.W.crane, s = __scurry; s.P.x = c.x + 6; s.P.z = c.z + 6; s.P.y = 0; for (let i = 0; i < 6; i++) s.spawnEnemy('mawling', c.x + 8 + Math.random(), c.z - 2 + Math.random(), { plain: true, force: true }); });
    await page.waitForTimeout(400);
    await S(() => { const u = __scurry.W.uses.find(u => u.label.startsWith('Work the crane')); u.act(); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}d${d}-crane.png` });
  }
  const stall = await S(() => { const u = __scurry.W.uses.find(u => u.label.startsWith('Rob')); return u && { x: u.x, z: u.z }; });
  if (stall) { await tp(stall.x + 3, stall.z + 3); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}d${d}-market.png` }); }
  const dog = await S(() => { const e = __scurry.W.enemies.find(e => e.dog); return e && { x: e.x, z: e.z }; });
  if (dog) { await tp(dog.x + 9, dog.z + 9); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}d${d}-garden.png` }); }
  const ar = await S(() => __scurry.G.arena && { x: __scurry.G.arena.x, z: __scurry.G.arena.z });
  if (ar) { await tp(ar.x + 4, ar.z + 9); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}d${d}-arena.png` }); }
  if (d < 3) { await S(() => __scurry.exitRoad()); await page.waitForTimeout(2500); }
}
if (errors.length) console.log(errors.slice(0, 6).join('\n'));
console.log('done', errors.length);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
