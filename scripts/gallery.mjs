// Animation gallery + frame-cost probe. Spawns every creature around the rat,
// takes screenshots mid-action, then fills the street with a full horde and
// reports the average frame time. Usage: node scripts/gallery.mjs [label]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/gallery/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const label = process.argv[2] || 'g';
const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const S = (fn, a) => page.evaluate(fn, a);
await page.goto('http://localhost:5198/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.click(`.card[data-k="${process.env.CLS || 'brawler'}"]`);
await page.waitForTimeout(1500);
await S(() => { const s = __scurry; s.god(true); s.run.expoCd = 1e9; s.run.evT = 1e9; s.run.scabSeen = true; s.run.spawnT = 1e9; s.run.surgeT = 1e9; s.W.enemies.length = 0; s.G.camYaw = 0.6; });
const types = (process.env.TYPES || 'mawling,roach,tick,ghoul,bloat,bat,brute,cat,crow,moth,wasp,shade').split(',');
await S(types => {
  const s = __scurry, P = s.P;
  s.G.demo = s.demoAI; s.G.camDist = 6.5; s.G.camPitch = 0.6; s.G.camYaw = 0; s.G.camDist = 9;
  types.forEach((t, i) => { const c = i % 4, r = (i / 4) | 0; const e = s.spawnEnemy(t, P.x - 4.5 + c * 3, P.z + 3 + r * 3.2, { plain: true, force: true }); if (e) { e.demo = true; e.ax = e.x; e.az = e.z; e.invuln = 1e9; } });
}, types);
for (let i = 0; i < 6; i++) { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}${label}-${i}.png` }); }
// Kill a few to see the ragdolls.
await S(() => { const s = __scurry; s.G.demo = null; s.G.camDist = 11; s.G.camPitch = 0.9; s.W.enemies.forEach(e => { e.invuln = 0; }); s.W.enemies.slice(0, 5).forEach(e => s.hit(e, 9999, Math.random() * 6, 10, 'primary')); });
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}${label}-ragdoll.png` });
// Frame cost with a full horde.
await S(() => { const s = __scurry, P = s.P; s.W.enemies.length = 0; for (let i = 0; i < 200; i++) { const a = Math.random() * 6.28, r = 4 + Math.random() * 18; s.spawnEnemy(i % 3 ? 'mawling' : s.pickType(), P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, { plain: true, force: true }); } });
await page.waitForTimeout(1500);
const ms = await S(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 90) requestAnimationFrame(f); else res((performance.now() - t0) / n); }; requestAnimationFrame(f); }));
const live = await S(() => __scurry.W.enemies.length);
console.log(`${label}: ${live} mobs, ${ms.toFixed(1)} ms/frame`);
await page.screenshot({ path: `${OUT}${label}-horde.png` });
if (errors.length) { console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
