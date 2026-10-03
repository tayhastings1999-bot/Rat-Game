// Stage 1 · Boot gate (deterministic, ~30s). Serves the production build in
// dist/, launches it, checks the menu renders, starts a run through the real
// buttons, confirms the game loop is advancing and drawing, pauses and
// resumes. Any crash or console error fails the build before the heavier
// stages run. Usage: npm run build && node scripts/boot.mjs
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { existsSync } from 'node:fs';

if (!existsSync(new URL('../dist/index.html', import.meta.url))) { console.error('dist/ missing: run npm run build first'); process.exit(1); }
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await preview({ preview: { port: 5190, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', r => errors.push('request failed: ' + r.url()));
const checks = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); checks.push([name, 'ok', Date.now() - t0]); console.log(`ok   ${name}`); }
  catch (e) { checks.push([name, 'FAIL ' + e.message, Date.now() - t0]); console.log(`FAIL ${name}: ${e.message}`); }
};
const S = fn => page.evaluate(fn);

await check('page loads and the menu renders', async () => {
  await page.goto('http://localhost:5190/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#overlay h1', { timeout: 20000 });
  const title = await page.textContent('#overlay h1');
  if (!/Scurry/i.test(title)) throw new Error('menu title is ' + title);
  await page.waitForFunction(() => window.__scurry, null, { timeout: 15000 });
});
await check('every class card is present', async () => {
  const n = await page.locator('.card[data-k]').count();
  if (n < 7) throw new Error(`${n} class cards`);
});
await check('start a run from the menu', async () => {
  await page.click('.card[data-k="brawler"]');
  await page.waitForFunction(() => __scurry.G.state === 'play' || __scurry.G.state === 'levelup', null, { timeout: 15000 });
  if ((await S(() => __scurry.M.kind)) !== 'city') throw new Error('not in the city');
});
await check('the game loop advances and draws', async () => {
  const t0 = await S(() => __scurry.run.time);
  await page.waitForTimeout(2000);
  const s = await S(() => ({ t: __scurry.run.time, x: __scurry.P.x, ok: Number.isFinite(__scurry.P.x + __scurry.P.y + __scurry.P.z), calls: __scurry.renderer.info.render.calls }));
  if (!(s.t > t0)) throw new Error('run time did not advance');
  if (!s.ok) throw new Error('rat position is not finite');
  if (!s.calls) throw new Error('nothing drawn');
  const png = await page.screenshot();
  if (png.length < 20000) throw new Error('screen looks blank');
});
await check('pause and resume', async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => __scurry.G.state === 'paused', null, { timeout: 5000 });
  await page.click('#resumeBtn');
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: 5000 });
});
await check('no errors during boot', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

await browser.close();
await new Promise(r => server.httpServer.close(r));
const failed = checks.filter(c => c[1] !== 'ok');
console.log(failed.length ? `boot gate FAILED (${failed.length})` : 'boot gate passed');
process.exit(failed.length ? 1 : 0);
