// Class line-up: the menu cards plus a close shot of each class rat running,
// idling and badly hurt. Usage: node scripts/rats.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/rats/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const S = (fn, a) => page.evaluate(fn, a);
await page.goto('http://localhost:5197/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + 'menu.png' });
const classes = (process.env.CLS || 'brawler,plague,slinger,warlock,tank,sneak,roof').split(',');
for (const k of classes) {
  await S(k => __scurry.startRun(k), k);
  await page.waitForTimeout(800);
  await S(() => { const s = __scurry; s.god(true); s.run.expoCd = 1e9; s.run.evT = 1e9; s.run.scabSeen = true; s.run.spawnT = 1e9; s.run.surgeT = 1e9; s.W.enemies.length = 0; s.G.camDist = 4.2; s.G.camPitch = 0.35; s.G.camYaw = s.P.facing + 2.2; });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}${k}-run.png` });
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}${k}-sprint.png` });
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await S(() => { const s = __scurry; s.run.hp = s.st.maxHp * 0.15; s.G.camYaw = s.P.facing + 1.6; });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}${k}-hurt-idle.png` });
  await S(() => { __scurry.G.victoryT = 2.6; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}${k}-victory.png` });
}
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
console.log('done', errors.length);
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
