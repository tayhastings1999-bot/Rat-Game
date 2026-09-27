// Headless smoke test. Starts the Vite dev server, drives a full loop of the game through window.__scurry and
// real key presses, and fails on any console error or page exception.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t0}ms)`); }
  catch (e) { errors.push(`step "${name}": ${e.message}`); console.log(`FAIL ${name}: ${e.message}`); }
};
const S = (fn, arg) => page.evaluate(fn, arg);
const rawWait = ms => page.waitForTimeout(ms);
/** Wait, then clear any level-up screens the kills produced (picks option 1). */
const wait = async ms => {
  await rawWait(ms);
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__scurry && __scurry.G.state)) === 'levelup'; i++) { await page.keyboard.press('Digit1'); await rawWait(80); }
};
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
const shot = name => page.screenshot({ path: OUT + name + '.png' });

await step('load menu', async () => {
  await page.goto('http://localhost:5199/?debug');
  await page.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
  await wait(1500);
  await shot('01-menu');
});
await step('start brawler run (city)', async () => {
  await page.click('.card[data-k="brawler"]');
  await wait(1500);
  const s = await S(() => ({ state: __scurry.G.state, kind: __scurry.M.kind, enemies: __scurry.W.enemies.length }));
  if (s.state !== 'play' || s.kind !== 'city') throw new Error(JSON.stringify(s));
});
await step('move, jump, roll, attack', async () => {
  await S(() => __scurry.god(true));
  await hold('KeyW', 900);
  await page.keyboard.press('Space');
  await hold('KeyD', 600);
  await page.keyboard.press('ShiftLeft');
  await hold('KeyA', 500);
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyF');
  await wait(2500);
  await shot('02-city-play');
});
await step('level up + choose', async () => {
  await S(() => __scurry.gainXP(60));
  await rawWait(400);
  if ((await S(() => __scurry.G.state)) !== 'levelup') throw new Error('no level-up screen');
  await shot('03-levelup');
  for (let i = 0; i < 12 && (await S(() => __scurry.G.state)) === 'levelup'; i++) { await page.keyboard.press('Digit1'); await wait(150); }
  if ((await S(() => __scurry.G.state)) !== 'play') throw new Error('stuck after level-up');
});
await step('mutation + cursed loot', async () => {
  await S(() => { __scurry.giveItem('razor'); __scurry.giveItem('drink'); __scurry.giveCursed('rabid'); });
  const r = await S(() => ({ muts: __scurry.run.muts, cursed: __scurry.run.cursed, live: __scurry.st.mut.livewire }));
  if (!r.muts.includes('livewire') || !r.live || !r.cursed.includes('rabid')) throw new Error(JSON.stringify(r));
  await wait(1500);
});
await step('city interactions: chest, bench, boards, climb, power line, key, manhole', async () => {
  const tp = (x, z, y) => S(([x, z, y]) => { const P = __scurry.P; P.x = x; P.z = z; P.y = y ?? 0; P.vx = P.vz = P.vy = 0; }, [x, z, y]);
  // Chest
  const chest = await S(() => { const c = __scurry.W.chests.find(c => !c.open && c.y < 1); return c && { x: c.x, z: c.z, y: c.y }; });
  if (chest) {
    const n0 = await S(() => __scurry.run.items.length);
    await tp(chest.x + 1, chest.z, chest.y); await wait(200);
    await page.keyboard.press('KeyE'); await wait(300);
    const n1 = await S(() => __scurry.run.items.length + __scurry.run.cursed.length);
    if (n1 <= n0) throw new Error('chest gave nothing');
  }
  // Workbench
  const b = await S(() => { const b = __scurry.W.benches[0]; return b && { x: b.x, z: b.z }; });
  if (!b) throw new Error('no workbench in the city');
  await tp(b.x + 1.2, b.z); await wait(200);
  await page.keyboard.press('KeyE'); await wait(300);
  if ((await S(() => __scurry.G.state)) !== 'bench') throw new Error('bench did not open');
  await S(() => { __scurry.run.scrap = 100; });
  await page.keyboard.press('Escape'); await wait(200);
  // Gnaw through boards
  const board = await S(() => {
    const { M } = __scurry;
    for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 3) {
      const gx = k % M.W, gz = (k / M.W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = M.grid[(gz + dz) * M.W + gx + dx]; if (n === 1 || n === 10 || n === 9) return { k, gx, gz, dx, dz }; }
    }
    return null;
  });
  if (board) {
    await S(bd => { const { P, M, G } = __scurry, T = 4, toW = g => (g - M.W / 2 + 0.5) * T; P.x = toW(bd.gx) + bd.dx * 2.9; P.z = toW(bd.gz) + bd.dz * 2.9; P.y = 0; P.facing = Math.atan2(-bd.dx, -bd.dz); G.camYaw = P.facing; }, board);
    await page.keyboard.down('KeyW'); await rawWait(250);
    await page.keyboard.down('KeyE'); await rawWait(4500); await page.keyboard.up('KeyE'); await page.keyboard.up('KeyW');
    const t = await S(k => __scurry.M.grid[k], board.k);
    if (t !== 1) throw new Error('boards not gnawed (tile ' + t + ')');
  }
  // Climb a brick building
  const wall = await S(() => {
    const { M } = __scurry;
    for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 0 && M.hgt[k] <= 7.5 && M.hgt[k] >= 4.5) {
      const gx = k % M.W, gz = (k / M.W) | 0;
      if (gx < 3 || gz < 3 || gx > M.W - 4 || gz > M.H - 4) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = M.grid[(gz + dz) * M.W + gx + dx]; if (n === 1 || n === 10) return { gx, gz, dx, dz, h: M.hgt[k] }; }
    }
    return null;
  });
  if (!wall) throw new Error('no climbable wall found');
  await S(w => { const { P, M, G } = __scurry, toW = g => (g - M.W / 2 + 0.5) * 4; P.x = toW(w.gx) + w.dx * 2.6; P.z = toW(w.gz) + w.dz * 2.6; P.y = 0; G.camYaw = Math.atan2(-w.dx, -w.dz); __scurry.run.sta = 100; }, wall);
  await page.keyboard.down('KeyW'); await wait(120); await page.keyboard.press('Space'); await page.keyboard.down('Space');
  await wait(2600);
  await page.keyboard.up('Space'); await wait(400); await page.keyboard.up('KeyW');
  const py = await S(() => __scurry.P.y);
  if (py < wall.h - 0.2) throw new Error(`climb reached y=${py.toFixed(2)} of roof ${wall.h}`);
  await shot('02b-rooftop');
  // Stand on a power line
  const line = await S(() => { const p = __scurry.W.plats.find(p => p.line); return p && { x: p.x, z: p.z, y: p.y }; });
  if (line) {
    await tp(line.x, line.z, line.y + 0.5); await wait(900);
    const y = await S(() => __scurry.P.y);
    if (Math.abs(y - line.y) > 0.05) throw new Error(`power line: y=${y} vs ${line.y}`);
  }
  // Key pickup and the manhole
  await S(() => { const { P } = __scurry; __scurry.dropKey(P.x + 0.5, P.y, P.z); });
  await wait(700);
  if ((await S(() => __scurry.run.keys)) < 1) throw new Error('key not picked up');
  const mh = await S(() => { const m = __scurry.G.manhole; return m && { x: m.x, z: m.z }; });
  if (!mh) throw new Error('no manhole');
  await tp(mh.x + 0.6, mh.z); await wait(200);
  await page.keyboard.press('KeyE'); await wait(1300);
  const s = await S(() => ({ layer: __scurry.run.layer, keys: __scurry.run.keys }));
  if (s.layer !== 'sewer') throw new Error('manhole did not descend ' + JSON.stringify(s));
  await S(() => __scurry.exitLadder()); await wait(1200);
  await S(() => { __scurry.run.district = 0; });
});
await step('corrupted elites spawn and die', async () => {
  await S(() => { const { P } = __scurry; for (const c of ['fire', 'ward', 'split', 'volatile', 'leech', 'haste']) __scurry.spawnEnemy('mawling', P.x + 3, P.z + 3, { elite: true, corrupt: c }); });
  await wait(2000);
  await S(() => { for (const e of __scurry.W.enemies) if (e.corrupt) e.hp = 1; });
  await wait(2500);
});
await step('surface boss: three phases, death, exits', async () => {
  await S(() => __scurry.spawnBoss());
  await wait(2500);
  await shot('04-boss');
  await S(() => __scurry.hurtBoss(0.4));
  await wait(2500);
  await S(() => __scurry.hurtBoss(0.35));
  await wait(3000);
  const ph = await S(() => __scurry.G.boss && __scurry.G.boss.phase);
  if (ph !== 3) throw new Error('boss phase ' + ph);
  await S(() => __scurry.killBoss());
  await wait(1000);
  const s = await S(() => ({ exit: !!__scurry.G.exitD, boss: !!__scurry.G.boss, keys: __scurry.W.keys.length }));
  if (!s.exit || s.boss) throw new Error(JSON.stringify(s));
});
await step('descend into sewer', async () => {
  await S(() => __scurry.enterSewer());
  await wait(1500);
  const s = await S(() => ({ layer: __scurry.run.layer, kind: __scurry.M.kind, state: __scurry.G.state }));
  if (s.layer !== 'sewer' || s.kind !== 'sewer' || s.state !== 'play') throw new Error(JSON.stringify(s));
  await hold('KeyW', 1200);
  await wait(2000);
  await shot('05-sewer');
});
await step('sewer boss + ladder up', async () => {
  await S(() => __scurry.spawnBoss());
  await wait(1500);
  await S(() => __scurry.hurtBoss(0.4));
  await wait(2000);
  await S(() => __scurry.hurtBoss(0.35));
  await wait(2500);
  await S(() => __scurry.killBoss());
  await wait(500);
  await S(() => __scurry.exitLadder());
  await wait(1500);
  const s = await S(() => ({ layer: __scurry.run.layer, district: __scurry.run.district, kind: __scurry.M.kind }));
  if (s.layer !== 'surface' || s.district !== 1 || s.kind !== 'city') throw new Error(JSON.stringify(s));
  await shot('06-district2');
});
await step('every boss type', async () => {
  for (const d of [1, 2, 3]) {
    await S(d => { __scurry.run.district = d; __scurry.spawnBoss(); }, d);
    await wait(1200);
    await S(() => __scurry.hurtBoss(0.4));
    await wait(1200);
    await S(() => __scurry.hurtBoss(0.35));
    await wait(1500);
    await S(() => __scurry.killBoss());
    await wait(300);
  }
  for (const s of [1, 2, 5]) {
    await S(s => { __scurry.run.layer = 'sewer'; __scurry.run.sewerIdx = s; __scurry.spawnBoss(); }, s);
    await wait(1200);
    await S(() => __scurry.hurtBoss(0.4));
    await wait(1200);
    await S(() => __scurry.hurtBoss(0.35));
    await wait(1800);
    await S(() => __scurry.killBoss());
    await wait(300);
  }
  await S(() => { __scurry.run.layer = 'surface'; });
});
await step('boss marathon: each boss in phase 3 for a while', async () => {
  const kinds = [['surface', 0], ['surface', 1], ['surface', 2], ['sewer', 0], ['sewer', 1], ['sewer', 2]];
  for (const [layer, i] of kinds) {
    await S(([layer, i]) => { const r = __scurry.run; r.layer = layer; if (layer === 'sewer') r.sewerIdx = i; else r.district = i; __scurry.spawnBoss(); __scurry.hurtBoss(0.4); }, [layer, i]);
    await wait(1500);
    await S(() => __scurry.hurtBoss(0.3));
    await wait(9000);
    const b = await S(() => __scurry.G.boss && { kind: __scurry.G.boss.kind, phase: __scurry.G.boss.phase, hp: __scurry.G.boss.hp });
    if (!b || b.phase !== 3) throw new Error('boss state ' + JSON.stringify(b));
    await S(() => __scurry.killBoss());
    await wait(300);
  }
  await S(() => { __scurry.run.layer = 'surface'; __scurry.run.district = 1; });
});
await step('music engine running', async () => {
  const m = await S(() => ({ ready: __scurry.audioReady(), bar: __scurry.music.bar, I: __scurry.music.intensity }));
  if (!m.ready || m.bar < 1) throw new Error(JSON.stringify(m));
  console.log('     music:', JSON.stringify(m));
});
await step('level-up reroll', async () => {
  await S(() => { __scurry.run.rerolls = 1; __scurry.gainXP(200); });
  await rawWait(300);
  await page.keyboard.press('KeyR');
  await rawWait(200);
  if ((await S(() => __scurry.run.rerolls)) !== 0) throw new Error('reroll not used');
  await wait(300);
});
await step('pause + map', async () => {
  await page.keyboard.press('Escape');
  await wait(300);
  if ((await S(() => __scurry.G.state)) !== 'paused') throw new Error('not paused');
  await shot('07-pause');
  await page.keyboard.press('Escape');
  await wait(200);
  await page.keyboard.press('KeyM');
  await wait(300);
  await shot('08-map');
  await page.keyboard.press('KeyM');
  await wait(200);
});
await step('death banks salvage', async () => {
  const before = await S(() => __scurry.meta.salvage);
  await S(() => { __scurry.run.scrap = 120; __scurry.die(); });
  await wait(400);
  const after = await S(() => __scurry.meta.salvage);
  if (after < before + 120) throw new Error(`salvage ${before} -> ${after}`);
  await shot('09-dead');
});
await step('nest purchase', async () => {
  await page.keyboard.press('KeyR');
  await wait(1200);
  await page.keyboard.press('KeyN');
  await wait(300);
  await shot('10-nest');
  await page.click('[data-n="hide"]');
  const r = await S(() => __scurry.meta.nest.hide || 0);
  if (r < 1) throw new Error('nest upgrade not bought');
  await page.keyboard.press('Escape');
  await wait(300);
});
await step('new classes play', async () => {
  for (const k of ['tank', 'roof']) {
    await S(k => { __scurry.meta.bought[k] = 1; __scurry.G.mode = 'survival'; __scurry.startRun(k); __scurry.god(true); }, k);
    await wait(600);
    await page.keyboard.press('KeyQ');
    await hold('KeyW', 800);
    await wait(1200);
    await S(() => __scurry.menu());
    await wait(800);
  }
});
await step('ghost trial', async () => {
  await page.click('#mT');
  await wait(300);
  await page.keyboard.press('Digit1');
  await wait(1500);
  const s = await S(() => ({ mode: __scurry.G.mode, valves: __scurry.W.valves.length, kind: __scurry.M.kind }));
  if (s.mode !== 'trial' || s.valves !== 3 || s.kind !== 'sewer') throw new Error(JSON.stringify(s));
  await hold('KeyW', 1000);
  // Turn every valve with E, then walk into the drain.
  for (let i = 0; i < 3; i++) {
    await S(i => { const v = __scurry.W.valves[i], P = __scurry.P; P.x = v.x + 1; P.z = v.z; P.y = 0; P.vx = P.vz = 0; }, i);
    await wait(150);
    await page.keyboard.press('KeyE');
    await wait(150);
  }
  await S(() => { const e = __scurry.G.exitD, P = __scurry.P; P.x = e.x; P.z = e.z; P.y = 0; });
  await wait(600);
  if ((await S(() => __scurry.G.state)) !== 'done') throw new Error('trial did not finish: ' + (await S(() => __scurry.W.valves.map(v => v.done))));
  await shot('10b-trial-done');
  await S(() => __scurry.menu());
  await wait(500);
});
await step('soak: 20s of live horde', async () => {
  await S(() => { __scurry.G.mode = 'survival'; __scurry.startRun('slinger'); __scurry.god(true); __scurry.run.threatBase = 8; });
  for (let i = 0; i < 10; i++) { await hold(['KeyW', 'KeyA', 'KeyS', 'KeyD'][i % 4], 1000); await page.keyboard.press('Space'); await wait(1000); }
  const s = await S(() => ({ n: __scurry.W.enemies.length, T: __scurry.run.T, kills: __scurry.run.kills, state: __scurry.G.state }));
  console.log('     soak:', JSON.stringify(s));
  await shot('11-soak');
});

// ---------- phone-sized touch session ----------
await page.close(); // stop the desktop session's game loop competing for CPU
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tp = await ctx.newPage();
  tp.on('pageerror', e => errors.push('touch pageerror: ' + (e.stack || e.message)));
  tp.on('console', m => { if (m.type() === 'error') errors.push('touch console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(tp);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const center = async sel => { const b = await tp.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  await step('touch: phone menu and start', async () => {
    await tp.goto('http://localhost:5199/?debug');
    await tp.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
    await tp.waitForTimeout(1200);
    await tp.screenshot({ path: OUT + '12-phone-menu.png' });
    await tp.locator('.card[data-k="brawler"]').scrollIntoViewIfNeeded();
    await tp.tap('.card[data-k="brawler"]');
    await tp.waitForTimeout(1200);
    const s = await tp.evaluate(() => ({ state: __scurry.G.state, touch: document.body.classList.contains('touch'), vis: getComputedStyle(document.getElementById('touch')).display }));
    if (s.state !== 'play' || !s.touch || s.vis !== 'block') throw new Error(JSON.stringify(s));
    await tp.evaluate(() => __scurry.god(true));
  });
  await step('touch: stick moves the rat, buttons act', async () => {
    const [sx, sy] = await center('#tStick');
    const p0 = await tp.evaluate(() => [__scurry.P.x, __scurry.P.z]);
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', sx, sy - i * 10); await tp.waitForTimeout(40); }
    await tp.waitForTimeout(1500);
    const mid = await tp.evaluate(() => ({ active: document.querySelector('#tStick i').style.transform, p: [__scurry.P.x, __scurry.P.z] }));
    await touch('touchEnd');
    const moved = Math.hypot(mid.p[0] - p0[0], mid.p[1] - p0[1]);
    if (moved < 2) throw new Error('rat moved only ' + moved.toFixed(2) + ' ' + JSON.stringify(mid));
    await tp.screenshot({ path: OUT + '13-phone-play.png' });
    for (let i = 0; i < 10 && (await tp.evaluate(() => __scurry.G.state)) === 'levelup'; i++) { await tp.tap('.card[data-i="0"]'); await tp.waitForTimeout(150); }
    await tp.evaluate(() => { __scurry.st.xp = 0; }); // no more level-ups mid-test
    await tp.waitForTimeout(300);
    const [jx, jy] = await center('[data-b="jump"]');
    const y0 = await tp.evaluate(() => __scurry.P.y);
    await touch('touchStart', jx, jy);
    let rose = false;
    for (let i = 0; i < 20 && !rose; i++) { await tp.waitForTimeout(50); rose = await tp.evaluate(y0 => __scurry.P.vy > 0 || __scurry.P.y > y0 + 0.3, y0); }
    await touch('touchEnd');
    if (!rose) throw new Error('jump button did nothing');
    const [px, py] = await center('[data-b="pause"]');
    await touch('touchStart', px, py); await touch('touchEnd');
    await tp.waitForTimeout(300);
    if ((await tp.evaluate(() => __scurry.G.state)) !== 'paused') throw new Error('pause button did nothing');
    await tp.tap('#resumeBtn');
    await tp.waitForTimeout(300);
    if ((await tp.evaluate(() => __scurry.G.state)) !== 'play') throw new Error('resume tap did nothing');
  });
  await ctx.close();
}

await browser.close();
await server.close();
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of [...new Set(errors)].slice(0, 30)) console.log(' - ' + e);
  process.exit(1);
}
console.log('\nsmoke test passed');
