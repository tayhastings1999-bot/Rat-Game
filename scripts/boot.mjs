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
  catch (e) { checks.push([name, 'FAIL ' + e.message, Date.now() - t0]); console.log(`FAIL ${name}: ${e.message}`); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Boot gate::${name}: ${e.message.replace(/\n/g, ' ')}`); }
};
const S = fn => page.evaluate(fn);

await check('page loads and the menu renders', async () => {
  await page.goto('http://localhost:5190/?debug', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#overlay h1', { timeout: 20000 });
  const title = await page.textContent('#overlay h1');
  if (!/Scurry/i.test(title)) throw new Error('menu title is ' + title);
  await page.waitForFunction(() => window.__scurry, null, { timeout: 15000 });
});
await check('save slot screen lists every slot', async () => {
  const n = await page.locator('[data-slot]').count();
  if (n !== 3) throw new Error(`${n} slots`);
  if ((await S(() => __scurry.G.state)) !== 'slots') throw new Error('not on the slot screen');
});
await check('picking a slot opens the Nest with its shop', async () => {
  await page.click('[data-slot="1"]');
  await page.waitForSelector('.card[data-k]', { timeout: 5000 });
  if ((await page.locator('[data-buy]').count()) < 5) throw new Error('shop is missing');
  if ((await S(() => __scurry.save.slot)) !== 1) throw new Error('slot 1 not active');
});
await check('buying an upgrade spends gold and is saved to the slot', async () => {
  await S(() => { __scurry.meta.salvage = 1000; __scurry.renderMenu(); });
  const cost = await S(() => __scurry.shop.price('hide'));
  await page.click('[data-buy="hide"]');
  const r = await S(() => ({ rank: __scurry.shop.rank('hide'), gold: __scurry.meta.salvage, saved: __scurry.readSlot(1).meta.shop.hide }));
  if (r.rank !== 1 || r.saved !== 1) throw new Error('rank ' + JSON.stringify(r));
  if (r.gold !== 1000 - cost) throw new Error('gold ' + r.gold);
  await page.click('[data-buy="vial"]');
  await page.click('[data-buy="fSplit"]');
  await page.click('[data-buy="fIron"]');
});
await check('difficulty is picked in the Nest and saved per slot', async () => {
  await page.click('[data-diff="insane"]');
  if ((await S(() => __scurry.readSlot(1).meta.difficulty)) !== 'insane') throw new Error('not saved');
  await page.click('[data-diff="normal"]');
});
await check('every class card is present', async () => {
  const n = await page.locator('.card[data-k]').count();
  if (n < 7) throw new Error(`${n} class cards`);
});
await check('start a run from the menu', async () => {
  await page.click('.card[data-k="brawler"]');
  await page.waitForFunction(() => __scurry.G.state === 'play' || __scurry.G.state === 'levelup', null, { timeout: 15000 });
  if ((await S(() => __scurry.M.kind)) !== 'city') throw new Error('not in the city');
  const u = await S(() => ({ hp: __scurry.st.maxHp, base: __scurry.TUNE.classes.brawler.hp, add: __scurry.TUNE.shop.hpPer, vials: __scurry.run.vials, v0: __scurry.TUNE.vials.start }));
  if (u.hp !== u.base + u.add) throw new Error(`max HP ${u.hp}, wanted ${u.base + u.add}`);
  if (u.vials !== u.v0 + 1) throw new Error(`vials ${u.vials}`);
  if (Object.keys(await S(() => __scurry.readSlot(1).meta.pack)).length) throw new Error('supplies were not used up');
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
  // A slow runner may have levelled up by now: pick upgrades until back in play.
  for (let i = 0; i < 20 && (await S(() => __scurry.G.state)) !== 'play'; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(150); }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => __scurry.G.state === 'paused', null, { timeout: 5000 });
  await page.click('#resumeBtn');
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: 5000 });
});
await check('held flasks show on the HUD, cycle with B and uncork with V', async () => {
  for (let i = 0; i < 20 && (await S(() => __scurry.G.state)) !== 'play'; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(150); }
  if (!(await page.locator('#slots .slot.flask').count())) throw new Error('no flask slot on the HUD');
  const a = await S(() => __scurry.shop.selFlask());
  await page.keyboard.press('KeyB');
  const b = await S(() => __scurry.shop.selFlask());
  if (!a || !b || a === b) throw new Error(`cycle ${a} -> ${b}`);
  await page.keyboard.press('KeyV');
  const r = await page.evaluate(k => ({ on: __scurry.puOn(k), left: __scurry.run.flasks[k] }), b);
  if (!r.on || r.left !== 0) throw new Error('use ' + JSON.stringify(r));
  if ((await S(() => __scurry.shop.selFlask())) !== a) throw new Error('selection did not move to the remaining flask');
});
await check('a Second Tail cheats death once', async () => {
  await S(() => { __scurry.run.tails = 1; __scurry.run.hp = 0; __scurry.die(); });
  const r = await S(() => ({ st: __scurry.G.state, hp: __scurry.run.hp, tails: __scurry.run.tails }));
  if (r.st === 'dead' || !(r.hp > 0) || r.tails !== 0) throw new Error(JSON.stringify(r));
});
await check('death returns to the Nest with gold banked', async () => {
  await S(() => { __scurry.run.scrap = 77; });
  const g0 = await S(() => __scurry.meta.salvage);
  await S(() => { __scurry.run.hp = 0; __scurry.die(); });
  await page.click('#again');
  await page.waitForFunction(() => __scurry.G.state === 'menu' && document.querySelector('[data-buy]'), null, { timeout: 8000 });
  const g = await S(() => __scurry.readSlot(1).meta.salvage);
  if (g !== g0 + 77) throw new Error(`banked ${g}, wanted ${g0 + 77}`);
});
await check('co-op: two rats, a gamepad moves player 2, party scaling applies', async () => {
  await page.click('[data-pn="2"]');
  for (let i = 0; i < 6 && !/Gamepad 1/.test(await page.textContent('[data-cin="1"]')); i++) await page.click('[data-cin="1"]');
  await S(() => { __scurry.fakePads[0] = { axes: [0, 0, 0, 0], buttons: [] }; });
  await page.click('.card[data-k="brawler"]');
  await page.waitForFunction(() => __scurry.G.state === 'play' || __scurry.G.state === 'levelup', null, { timeout: 15000 });
  for (let i = 0; i < 20 && (await S(() => __scurry.G.state)) !== 'play'; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(150); }
  const s0 = await S(() => ({ on: __scurry.coop.on, n: __scurry.coop.players.length, rp: __scurry.run.players, boss: __scurry.run.bossHpM, want: 1 + __scurry.TUNE.coop.perPlayer.bossHp, x: __scurry.asPlayer(1, () => __scurry.P.x), z: __scurry.asPlayer(1, () => __scurry.P.z), hp: __scurry.asPlayer(1, () => __scurry.run.hp) }));
  if (!s0.on || s0.n !== 2 || s0.rp !== 2) throw new Error('co-op not on ' + JSON.stringify(s0));
  if (Math.abs(s0.boss - s0.want) > 1e-6) throw new Error('boss HP scale ' + s0.boss);
  if (!(s0.hp > 0)) throw new Error('player 2 has no HP');
  await S(() => { __scurry.fakePads[0].axes = [1, 0, 0, 0]; });
  await page.waitForTimeout(1500);
  await S(() => { __scurry.fakePads[0].axes = [0, 0, 0, 0]; });
  const s1 = await S(() => ({ x: __scurry.asPlayer(1, () => __scurry.P.x), z: __scurry.asPlayer(1, () => __scurry.P.z), ok: Number.isFinite(__scurry.P.x) }));
  if (Math.hypot(s1.x - s0.x, s1.z - s0.z) < 0.5) throw new Error('player 2 did not move');
  if (!s1.ok) throw new Error('player 1 position broke');
  if ((await page.locator('#coopHud .cp').count()) !== 2) throw new Error('co-op HUD missing');
});
await check('co-op: a downed rat is revived by a partner, and the run ends only when all are down', async () => {
  await S(() => { __scurry.god(false); __scurry.asPlayer(1, () => { __scurry.run.hp = 0; __scurry.die(); }); });
  const d = await S(() => ({ st: __scurry.G.state, down: __scurry.asPlayer(1, () => !!__scurry.P.downed) }));
  if (d.st !== 'play' || !d.down) throw new Error('not downed ' + JSON.stringify(d));
  await S(() => { const s = __scurry, x = s.P.x + 0.6, z = s.P.z; s.asPlayer(1, () => { s.P.x = x; s.P.z = z; }); });
  await page.waitForFunction(() => !__scurry.asPlayer(1, () => __scurry.P.downed), null, { timeout: 15000 });
  await S(() => { __scurry.asPlayer(1, () => { __scurry.run.hp = 0; __scurry.die(); }); __scurry.run.hp = 0; __scurry.die(); });
  if ((await S(() => __scurry.G.state)) !== 'dead') throw new Error('run did not end');
  if (await S(() => __scurry.coop.on)) throw new Error('co-op still on after the run');
  await page.click('#again');
  await page.waitForSelector('[data-pn="1"]');
  await page.click('[data-pn="1"]');
});
await check('old single-slot saves move into slot 1', async () => {
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('pageerror (migrate): ' + e.message));
  await p2.addInitScript(() => { if (!localStorage.getItem('mig')) { localStorage.setItem('mig', 1); localStorage.setItem('scurry.meta', JSON.stringify({ salvage: 321, runs: 4, nest: { x: 1 } })); localStorage.setItem('scurry.best', JSON.stringify({ time: 90, kills: 12, district: 1 })); } });
  await p2.goto('http://localhost:5190/?debug', { waitUntil: 'load', timeout: 30000 });
  await p2.waitForSelector('[data-slot="1"]', { timeout: 20000 });
  const d = await p2.evaluate(() => JSON.parse(localStorage.getItem('scurry.slot1')));
  if (!d || d.v !== 2 || d.meta.salvage !== 321 || d.best.time !== 90 || d.meta.nest) throw new Error('slot1 ' + JSON.stringify(d));
  await p2.click('[data-slot="1"]');
  await p2.waitForSelector('#hubGold');
  if (!/321 gold/.test(await p2.textContent('#hubGold'))) throw new Error('hub gold wrong');
  await ctx.close();
});
await check('no errors during boot', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

await browser.close();
await new Promise(r => server.httpServer.close(r));
const failed = checks.filter(c => c[1] !== 'ok');
console.log(failed.length ? `boot gate FAILED (${failed.length})` : 'boot gate passed');
process.exit(failed.length ? 1 : 0);
