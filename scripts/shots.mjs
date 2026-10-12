// Art-pass screenshots + frame-cost probe on the production build.
// Usage: npm run build && OUT=/path/ LABEL=before node scripts/shots.mjs
// Captures title, Nest, city and sewer gameplay, a 2-player co-op frame and a
// 150-enemy horde, then prints draw calls, triangles and ms/frame (SwiftShader:
// compare runs against each other, not against real hardware).
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT || new URL('./out/shots/', import.meta.url).pathname, L = process.env.LABEL || 'shot';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 5191, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const S = (fn, a) => page.evaluate(fn, a);
const shot = n => page.screenshot({ path: `${OUT}${L}-${n}.png` });
const settle = () => S(() => { const s = __scurry; s.god(true); Object.assign(s.run, { evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 }); s.G.testNoTally = true; });
const playing = async () => { for (let i = 0; i < 30 && (await S(() => __scurry.G.state)) !== 'play'; i++) { await page.keyboard.press(i % 2 ? 'Digit1' : 'Escape'); await page.waitForTimeout(150); } };
const horde = n => S(n => { const s = __scurry, P = s.P; for (let i = 0; i < n; i++) { const a = i * 2.4, r = 3 + (i % 9) * 1.2; s.spawnEnemy(i % 3 ? 'mawling' : 'roach', P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, { plain: true, force: true }); } }, n);
const perf = () => S(() => new Promise(res => {
  const info = __scurry.renderer.info, pf = __scurry.G.perf;
  info.autoReset = false;
  let n = 0, calls = 0, tris = 0;
  const t0 = performance.now();
  const f = () => {
    if (n++) { calls = Math.max(calls, info.render.calls); tris = Math.max(tris, info.render.triangles); }
    info.reset();
    if (n < 120) requestAnimationFrame(f);
    else { info.autoReset = true; res({ msPerFrame: +((performance.now() - t0) / n).toFixed(1), drawCalls: calls, triangles: tris, updMs: +pf.upd.toFixed(2), syncMs: +pf.sync.toFixed(2), drawMs: +pf.draw.toFixed(2), enemies: __scurry.W.enemies.length }); }
  };
  requestAnimationFrame(f);
}));

await page.goto('http://localhost:5191/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await shot('01-title');
await page.click('[data-slot="1"]');
await page.waitForTimeout(1200);
await shot('02-nest');
await page.click('.card[data-k="brawler"]');
await page.waitForTimeout(2500);
await playing(); await settle();
await horde(10);
await page.waitForTimeout(2000);
await shot('03-city');
const city = await perf();
await S(() => { const s = __scurry; s.run.keys = 1; s.enterSewer(); });
await page.waitForTimeout(4000);
await playing(); await settle();
await horde(10);
await page.waitForTimeout(2000);
await shot('04-sewer');
await S(() => __scurry.menu());
await page.waitForTimeout(800);
await page.click('[data-pn="2"]');
await page.click('.card[data-k="slinger"]');
await page.waitForTimeout(2500);
await playing(); await settle();
await S(() => { const s = __scurry; s.asPlayer(1, () => { s.P.x += 4; s.P.z += 2; }); });
await horde(14);
await page.waitForTimeout(2000);
await shot('05-coop');
await horde(140);
await page.waitForTimeout(2500);
await shot('06-horde');
const hordeP = await perf();
console.log(JSON.stringify({ label: L, city, horde: hordeP, errors }, null, 1));
await browser.close();
await new Promise(r => server.httpServer.close(r));
