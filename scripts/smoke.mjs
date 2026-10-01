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
/** Poll a page condition (clearing level-ups) until it holds or time runs out; returns the last value. */
const until = async (fn, ms = 5000, arg) => {
  let v;
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { v = await S(fn, arg); if (v) return v; await wait(100); }
  return v;
};
/** Like until(), but leaves level-up screens alone. */
const rawUntil = async (fn, ms = 5000, arg) => {
  let v;
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { v = await S(fn, arg); if (v) return v; await rawWait(100); }
  return v;
};
/** Hold E until fn() holds, re-pressing only if gnawing stopped (re-pressing resets gnaw progress). */
const gnawUntil = async (fn, ms = 12000, arg) => {
  await page.keyboard.down('KeyE');
  const t0 = Date.now();
  let ok = false;
  while (!(ok = await S(fn, arg)) && Date.now() - t0 < ms) {
    await wait(150);
    if (!(await S(() => __scurry.P.chewing))) { await page.keyboard.up('KeyE'); await page.keyboard.down('KeyE'); }
  }
  await page.keyboard.up('KeyE');
  return ok;
};
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
const shot = name => page.screenshot({ path: OUT + name + '.png' });

await step('load menu', async () => {
  await page.goto('http://localhost:5199/?debug');
  await page.waitForFunction(() => window.__scurry && document.querySelector('#overlay h1'), null, { timeout: 30000 });
  await S(() => { __scurry.G.testNoRoles = true; }); // placed lurkers and mimics would ambush scripted steps
  await wait(1500);
  await shot('01-menu');
});
await step('start brawler run (city)', async () => {
  await page.click('.card[data-k="brawler"]');
  await wait(1500);
  const s = await S(() => ({ state: __scurry.G.state, kind: __scurry.M.kind, enemies: __scurry.W.enemies.length }));
  if (s.state !== 'play' || s.kind !== 'city') throw new Error(JSON.stringify(s));
  const co = await S(() => ({ c: __scurry.run.contracts.length, open: __scurry.run.coldOpen }));
  if (co.c !== 3 || !co.open) throw new Error('no contracts or cold open ' + JSON.stringify(co));
  await S(() => { __scurry.run.expoCd = 1e9; __scurry.run.evT = 1e9; __scurry.run.scabSeen = true; }); // no owls, district events or Scab mid-script
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
    await S(bd => { const { P, M, G, W } = __scurry, T = 4, toW = g => (g - M.W / 2 + 0.5) * T; for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); P.x = toW(bd.gx) + bd.dx * 2.9; P.z = toW(bd.gz) + bd.dz * 2.9; P.y = 0; P.facing = Math.atan2(-bd.dx, -bd.dz); G.camYaw = P.facing; }, board);
    await page.keyboard.down('KeyW'); await until(() => !!__scurry.chewTarget(), 4000);
    await gnawUntil(k => __scurry.M.grid[k] === 1, 12000, board.k);
    await page.keyboard.up('KeyW');
    const t = await S(k => __scurry.M.grid[k], board.k);
    if (t !== 1) throw new Error('boards not gnawed (tile ' + t + ')');
  }
  // Climb a brick building
  const wall = await S(() => { const w = __scurry.wallSpot(4.5, 6); return w && { ...w, h: w.top }; });
  if (!wall) throw new Error('no climbable wall found');
  await S(() => { if (__scurry.P.carry) __scurry.dropCarry(); for (const e of __scurry.W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); });
  await S(w => { const { P, G } = __scurry; P.x = w.x + w.nx * 1.6; P.z = w.z + w.nz * 1.6; P.y = 0; P.vx = P.vz = 0; G.camYaw = Math.atan2(-w.nx, -w.nz); __scurry.run.sta = 100; }, wall);
  await page.keyboard.down('KeyW'); await wait(120); await page.keyboard.press('Space'); await page.keyboard.down('Space');
  await until(h => __scurry.P.y >= h - 0.2, 7000, wall.h);
  const py = await S(() => __scurry.P.y);
  await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  if (py < wall.h - 0.2) throw new Error(`climb reached y=${py.toFixed(2)} of roof ${wall.h} ` + (await S(() => { const P = __scurry.P; return JSON.stringify({ st: __scurry.G.state, x: P.x, z: P.z, wt: P.wallType, sta: __scurry.run.sta, carry: !!P.carry, sq: P.squeeze }); })) + ' ' + JSON.stringify(wall));
  await shot('02b-rooftop');
  // Stand on a power line
  const line = await S(() => { const p = __scurry.W.plats.find(p => p.line); return p && { x: p.x, z: p.z, y: p.y }; });
  if (line) {
    // Clear the area so a stray bite can't knock the rat off mid-check.
    await S(() => { for (const e of __scurry.W.enemies) if (!e.boss && e.type !== 'nest') e.hp = 0; });
    // Erratic Currents vents can shove the rat off; give it a few tries.
    let y = 0;
    for (let i = 0; i < 3 && Math.abs(y - line.y) > 0.05; i++) { await tp(line.x, line.z, line.y + 0.5); await wait(900); y = await S(() => __scurry.P.y); }
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
await step('staggered roster, secrets, lairs, melee kit', async () => {
  await S(() => { __scurry.G.mode = 'survival'; __scurry.startRun('brawler'); __scurry.god(true); __scurry.run.expoCd = 1e9; __scurry.run.evT = 1e9; __scurry.run.scabSeen = true; });
  await wait(600);
  // Early on only mawlings spawn; later types unlock on schedule with a banner.
  const early = await S(() => { const s = new Set(); for (let i = 0; i < 200; i++) s.add(__scurry.pickType()); return [...s]; });
  if (early.length !== 1 || early[0] !== 'mawling') throw new Error('early roster ' + early);
  await S(() => { __scurry.run.time = 170; });
  const seen = (await until(() => Object.keys(__scurry.run.seenMobs).includes('roach') && Object.keys(__scurry.run.seenMobs), 5000)) || await S(() => Object.keys(__scurry.run.seenMobs));
  if (!seen.includes('roach')) throw new Error('roster intros not firing: ' + seen);
  await S(() => { __scurry.run.time = 5; });
  // Secret wall: gnaw it open.
  const sec = await S(() => { const { M } = __scurry; for (let k = 0; k < M.W * M.H; k++) if (M.secret[k] && M.grid[k] === 3) { const gx = k % M.W, gz = (k / M.W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = M.grid[(gz + dz) * M.W + gx + dx]; if ((n === 1 || n === 10 || n === 9) && M.flow[(gz + dz) * M.W + gx + dx] >= 0) return { k, gx, gz, dx, dz }; } } return null; });
  if (!sec) throw new Error('no reachable secret wall in the city');
  await S(bd => { const { P, M, G } = __scurry, toW = g => (g - M.W / 2 + 0.5) * 4; P.x = toW(bd.gx) + bd.dx * 2.9; P.z = toW(bd.gz) + bd.dz * 2.9; P.y = 0; P.facing = Math.atan2(-bd.dx, -bd.dz); G.camYaw = P.facing; }, sec);
  await page.keyboard.down('KeyW'); await until(() => !!__scurry.chewTarget(), 4000);
  // E may open a chest standing right there first; keep pressing until the wall is being gnawed.
  await gnawUntil(k => __scurry.M.grid[k] === 1, 12000, sec.k);
  await page.keyboard.up('KeyW');
  if ((await S(k => __scurry.M.grid[k], sec.k)) !== 1) throw new Error('secret wall not gnawed');
  // Lair: walk in, mini-boss wakes; kill it, hoard appears.
  const lair = await S(() => { const L = __scurry.W.lairs[0]; return L && { x: L.cx, z: L.cz }; });
  if (!lair) throw new Error('no lair generated');
  const chests0 = await S(() => __scurry.W.chests.length);
  await S(l => { const P = __scurry.P; P.x = l.x; P.z = l.z; P.y = 0; }, lair);
  await wait(600);
  const mini = await S(() => { const e = __scurry.W.enemies.find(e => e.mini); return e && { name: e.name, hp: Math.round(e.hp) }; });
  if (!mini) throw new Error('mini-boss did not wake');
  console.log('     mini-boss:', JSON.stringify(mini));
  await shot('03b-lair');
  await S(() => { const e = __scurry.W.enemies.find(e => e.mini); e.hp = 0; __scurry.kill(e); });
  await wait(1200);
  if ((await S(() => __scurry.W.chests.length)) <= chests0) throw new Error('mini-boss left no hoard');
  // Melee kit: kills stack bloodlust.
  await S(() => { const { P } = __scurry; for (let i = 0; i < 4; i++) { const e = __scurry.spawnEnemy('mawling', P.x + 1.5, P.z + 0.5, { plain: true }); if (e) e.hp = 1; } });
  await wait(1500);
  await shot('03c-swipe');
  if (!((await S(() => __scurry.run.blood || 0)) > 0)) throw new Error('bloodlust did not stack');
});
await step('scramble, wall-bounce, foraging', async () => {
  await S(() => { __scurry.G.testFreeze = true; __scurry.W.zones.length = 0; }); // hold any boss still, and no vents shoving the rat, through the scripted steps
  // Hold off level-up screens through the scripted movement/junk/light steps.
  await wait(100);
  await S(() => { const r = __scurry.run; r.needHold = r.need; r.need = 1e12; });
  const w = await S(() => __scurry.wallSpot());
  if (!w) throw new Error('no tall wall');
  await S(() => { if (__scurry.P.carry) __scurry.dropCarry(); });
  await S(w => { const { P, G, W } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); P.x = w.x + w.nx * 2.5; P.z = w.z + w.nz * 2.5; P.y = 0; P.vx = P.vy = P.vz = 0; G.camYaw = Math.atan2(-w.nx, -w.nz); G.lockOn = null; }, w);
  await rawWait(200);
  await S(() => { __scurry.run.sta = __scurry.st.staMax; });
  await page.keyboard.down('KeyW'); await rawWait(150); await page.keyboard.down('ShiftLeft');
  let peak = 0, scr = false;
  for (let i = 0; i < 70 && peak < 2; i++) { await rawWait(60); const r = await S(() => ({ y: __scurry.P.y, s: __scurry.P.scramble })); peak = Math.max(peak, r.y); if (r.s > 0) scr = true; }
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  if (!scr || peak < 2) throw new Error(`scramble: triggered=${scr} peak=${peak.toFixed(2)} ` + (await S(() => { const P = __scurry.P; return JSON.stringify({ s: __scurry.G.state, carry: !!P.carry, lock: P.lock, sq: P.squeeze, sta: __scurry.run.sta, y: P.y, x: P.x, z: P.z, yaw: __scurry.G.camYaw, lockOn: !!__scurry.G.lockOn, wt: P.wallType, wtop: P.wallTop }); })) + ' wall ' + JSON.stringify(w));
  // Bounce off the wall mid-scramble.
  await S(w => { const { P, G } = __scurry; P.x = w.x + w.nx * 2.5; P.z = w.z + w.nz * 2.5; P.y = 0; P.vx = P.vy = P.vz = 0; G.camYaw = Math.atan2(-w.nx, -w.nz); }, w);
  await page.keyboard.down('KeyW'); await rawWait(150); await page.keyboard.down('ShiftLeft');
  let chain = 0;
  for (let i = 0; i < 80 && !chain; i++) { await rawWait(50); if (await S(() => __scurry.P.scramble > 0)) { await page.keyboard.press('Space'); await rawWait(80); chain = await S(() => __scurry.P.chain); } }
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  if (!chain) throw new Error('wall-bounce did not chain');
  const f = await S(() => { const f = __scurry.W.fungi.find(f => !f.taken); return f && { x: f.x, y: f.y, z: f.z, k: f.kind }; });
  if (!f) throw new Error('no fungi in district');
  await S(f => { const P = __scurry.P; P.x = f.x; P.z = f.z; P.y = f.y; P.vx = P.vz = 0; }, f);
  const t = await until(k => (__scurry.run.buffs || {})[k] || 0, 4000, f.k);
  if (!(t > 8)) throw new Error('fungus buff ' + f.k + ' = ' + t);
  await shot('03b-forage');
});
await step('volatile junk + rummaging', async () => {
  const bin = await S(() => { const b = __scurry.W.bins.find(b => !b.done); return b && { x: b.x, z: b.z, r: b.r }; });
  if (!bin) throw new Error('no bins to rummage');
  await S(b => { const P = __scurry.P; P.x = b.x + b.r + 0.6; P.z = b.z; P.y = 0; P.vx = P.vz = 0; }, bin);
  await until(() => { const u = __scurry.useTarget(); return u && u.kind === 'bin'; }, 3000);
  for (let i = 0; i < 5 && !(await S(b => __scurry.W.bins.find(o => o.x === b.x && o.z === b.z).done, bin)); i++) { await page.keyboard.press('KeyE'); await wait(200); }
  if (!(await S(b => __scurry.W.bins.find(o => o.x === b.x && o.z === b.z).done, bin))) throw new Error('rummage did nothing');
  await S(() => { for (const k of ['volt', 'blade', 'rag', 'sinker']) if (!__scurry.run.junk.includes(k)) __scurry.giveJunk(k); });
  const s0 = await S(() => ({ n: __scurry.run.junk.length, tox: __scurry.st.toxImmune, heal: __scurry.st.healMul, noScr: __scurry.st.noScramble, sta: __scurry.st.staMax }));
  if (s0.n !== 4 || !s0.tox || s0.heal > 0.3 || !s0.noScr) throw new Error('junk stats ' + JSON.stringify(s0));
  // Roll with the battery: electric trail.
  let trail = 0;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 4 && !trail; i++) {
    await S(() => { const { P, run, st } = __scurry; run.sta = st.staMax; P.rollCd = 0; P.chewing = false; P.squeeze = false; });
    await page.keyboard.press('ShiftLeft');
    trail = await rawUntil(() => __scurry.W.volt.length, 1500);
  }
  await page.keyboard.up('KeyW');
  if (!trail) throw new Error('no electric trail');
  // Razor blade bleeds; the sinker slams.
  await S(() => { const { P, G, M } = __scurry, r = G.startRoom; P.x = (r.cx - M.W / 2 + 0.5) * 4; P.z = (r.cy - M.H / 2 + 0.5) * 4; P.y = 0; P.vx = P.vz = 0; for (let i = 0; i < 6; i++) __scurry.spawnEnemy('mawling', P.x + 1.5 + i * 0.3, P.z + 0.8, { hpMul: 30 }); });
  await wait(1500);
  if (!(await S(() => __scurry.W.enemies.some(e => e.bleed > 0) || __scurry.run.dmgBy.dot > 0))) throw new Error('no bleed stacks');
  await S(() => { __scurry.run.specT = 0; });
  await page.keyboard.press('KeyQ');
  await rawWait(60);
  const slam = await S(() => __scurry.P.slam);
  if (slam !== 'sinker') throw new Error('sinker slam not armed: ' + slam);
  await wait(1500);
  await shot('03c-junk');
  // The volt's still-curse gets the rat out of its way.
  await S(() => { __scurry.run.stillT = 0; });
});
await step('light, shadow, exposure, owl', async () => {
  const L = await S(() => ({ lamps: __scurry.W.lamps.length, search: __scurry.W.searches.length }));
  if (!L.lamps || !L.search) throw new Error('no light sources ' + JSON.stringify(L));
  // Stand in a searchlight spot: exposure climbs fast.
  await S(() => { const { W, run } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest') e.hp = 0; run.expo = 0; run.expoCd = 0; });
  // Pin searchlight 0 over dry ground in the start room so the rat can stand in it.
  await S(() => { const { P, W, G, M } = __scurry, r = G.startRoom, s = W.searches[0]; P.x = (r.cx - M.W / 2 + 0.5) * 4; P.z = (r.cy - M.H / 2 + 0.5) * 4; P.y = 0; P.vx = P.vz = 0; s.cx = P.x; s.cz = P.z; s.rx = s.rz = 0; });
  const got = await until(() => { const { P, W, run } = __scurry, sl = W.searches[0]; P.x = sl.sx; P.z = sl.sz; P.vx = P.vz = 0; return run.expo > 15 && run.expo; }, 6000) || await S(() => __scurry.run.expo);
  if (!(got > 15)) throw new Error('searchlight exposure ' + got + ' ' + (await S(() => { const { P, W, G, run } = __scurry, s = W.searches[0]; return JSON.stringify({ st: G.state, L: P.light, sh: P.shadow, d: Math.hypot(P.x - s.sx, P.z - s.sz), y: P.y, cd: run.expoCd, n: W.searches.length }); })));
  await shot('03d-searchlight');
  // Max it out: spotted → an owl takes wing.
  await S(() => { const { P, W, run } = __scurry, sl = W.searches[0]; P.x = sl.sx; P.z = sl.sz; P.vx = P.vz = 0; run.expoCd = 0; run.expo = 100; });
  await wait(300);
  const owl = await S(() => __scurry.W.enemies.some(e => e.type === 'owl'));
  if (!owl) throw new Error('no owl after being spotted');
  const seen = new Set();
  // Stay in the searchlight so the owl can see its prey.
  for (let i = 0; i < 100 && !seen.has('dive'); i++) { await rawWait(250); const s = await S(() => { const { W, P } = __scurry, sl = W.searches[0]; P.x = sl.sx; P.z = sl.sz; const o = W.enemies.find(e => e.type === 'owl'); return o && o.st; }); if (s) seen.add(s); }
  await shot('03e-owl');
  if (!seen.has('wind') && !seen.has('dive')) throw new Error('owl never dove: ' + [...seen]);
  // Find a dark spot: shadows mean faster stamina and a hidden rat.
  const dark = await S(() => { const { W, M } = __scurry; for (const r of W.rooms) { const x = (r.cx - M.W / 2 + 0.5) * 4, z = (r.cy - M.H / 2 + 0.5) * 4; if (__scurry.lightAt(x, 0, z) < 0.1) return { x, z }; } return null; });
  if (!dark) throw new Error('no dark spot in the district');
  await S(d => { const P = __scurry.P; P.x = d.x; P.z = d.z; P.y = 0; P.vx = P.vz = 0; }, dark);
  await wait(400);
  if (!(await S(() => __scurry.P.shadow))) throw new Error('not in shadow at a dark spot');
  await S(() => { for (const e of __scurry.W.enemies) if (e.type === 'owl') __scurry.kill(e); const r = __scurry.run; r.expoCd = 1e9; r.need = r.needHold; });
  await wait(300);
  if (await S(() => __scurry.W.enemies.some(e => e.type === 'owl'))) throw new Error('owl did not die');
});
await step('advanced scent: gauge, prints, gnaw points, view cones', async () => {
  await S(() => { const r = __scurry.run; if (r.needHold) { r.need = r.needHold; r.needHold = 0; } });
  await S(() => { const { P, G, M, W, st, run } = __scurry, r = G.startRoom; P.x = (r.cx - M.W / 2 + 0.5) * 4; P.z = (r.cy - M.H / 2 + 0.5) * 4; P.y = 0; P.vx = P.vz = 0; P.scent = false; P.scentE = st.scentMax; run.expo = 0; run.expoCd = 1e9; for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); });
  await page.keyboard.press('KeyF');
  await until(() => __scurry.P.scent && __scurry.scentInfo().paths > 0 && (__scurry.P.scentE < __scurry.st.scentMax - 0.3 || __scurry.st.rag), 5000);
  const a = await S(() => ({ on: __scurry.P.scent, e: __scurry.P.scentE, max: __scurry.st.scentMax, rag: __scurry.st.rag, ...__scurry.scentInfo() }));
  if (!a.on || !(a.e < a.max - 0.3 || a.rag) || !a.paths || !a.gnaw) throw new Error('scent ' + JSON.stringify(a));
  // An elite on the move leaves fresh prints.
  await S(() => { const { P } = __scurry, e = __scurry.spawnEnemy('mawling', P.x + 3, P.z, { elite: true }); if (e) { e.spd = 0; e.tag = 'walker'; } });
  for (let i = 0; i < 6; i++) { await S(() => { const e = __scurry.W.enemies.find(e => e.tag === 'walker'); if (e) e.x += 1.3; }); await rawWait(80); }
  // A cat facing +z: stand behind it (unseen), then in front of it (seen). A pinned searchlight keeps the rat lit;
  // the rat's weapons are holstered so nothing wakes the cat but its eyes.
  const cat = await S(() => {
    const { P, M, W, run, st } = __scurry;
    for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e);
    run.wHold = run.weapons.slice(); run.weapons.length = 0; st.volt = false; st.mut = {}; run.primT = 1e9; run.needHold2 = run.need; run.need = 1e12;
    const gx = Math.round(P.x / 4 + M.W / 2 - 0.5), gz = Math.round(P.z / 4 + M.H / 2 - 0.5), k = (gz + 4) * M.W + gx;
    __scurry.addPred([k, k]);
    const e = W.enemies[W.enemies.length - 1];
    e.spd = 0; e.x = (gx - M.W / 2 + 0.5) * 4; e.z = P.z + 1; e.ang = 0; P.x = e.x;
    const s = W.searches[0]; if (s) { s.cx = P.x; s.cz = P.z; s.rx = s.rz = 0; s.R = 8; }
    P.z = e.z - 4.5; P.x = e.x; P.vx = P.vz = 0;
    return { z: e.z };
  });
  await wait(700);
  await until(() => __scurry.scentInfo().cones > 0, 3000);
  const behind = await S(() => __scurry.W.enemies.find(e => e.pred && e.type !== 'owl').mode);
  await S(c => { const P = __scurry.P; P.z = c.z + 4.5; P.vx = P.vz = 0; }, cat);
  await until(() => __scurry.W.enemies.find(e => e.pred && e.type !== 'owl').mode === 'hunt', 4000);
  const front = await S(() => __scurry.W.enemies.find(e => e.pred && e.type !== 'owl').mode);
  const info = await S(() => __scurry.scentInfo());
  await shot('03f-scent');
  if (behind !== 'patrol' || front !== 'hunt') throw new Error(`cat vision: behind=${behind} front=${front} ` + (await S(() => { const { P } = __scurry, e = __scurry.W.enemies.find(e => e.pred && e.type !== 'owl'); return JSON.stringify({ det: e.det, look: e.look, ang: e.ang, d: Math.hypot(P.x - e.x, P.z - e.z), dy: P.y - e.y, sh: P.shadow, L: P.light, hurt: e.hurt, ex: e.x, ez: e.z, px: P.x, pz: P.z }); })));
  if (!info.prints || !info.cones) throw new Error('scent overlay ' + JSON.stringify(info));
  await S(() => { const { W, run, P } = __scurry; for (const e of W.enemies) if (e.pred) __scurry.kill(e); P.scent = false; run.weapons.push(...run.wHold); run.primT = 0; run.need = run.needHold2; });
});
await step('physics traps: cable into puddle, scaffold, brick pallet', async () => {
  const tc = await S(() => __scurry.trapCount());
  if (!tc.kinds.includes('cable') || !(tc.kinds.includes('scaffold') || tc.kinds.includes('debris'))) throw new Error('missing traps ' + JSON.stringify(tc));
  // Bait: a few tough mawlings standing where each trap lands.
  const bait = (x, z, tag) => S(([x, z, tag]) => { for (const e of __scurry.W.enemies) if (!e.boss && e.type !== 'nest' && !e.tag) __scurry.kill(e); for (let i = 0; i < 3; i++) { const e = __scurry.spawnEnemy('mawling', x + (i - 1) * 0.6, z, { hpMul: 40, plain: true }); if (e) { e.spd = 0; e.tag = tag; } } }, [x, z, tag]);
  // Cable: gnaw it for real.
  const c = await S(() => { const t = __scurry.W.traps.find(t => t.kind === 'cable' && !t.sprung); return { gx: t.gx, gz: t.gz, cx: t.cx, cz: t.cz }; });
  await bait(c.cx, c.cz, 'cable');
  await S(c => { const P = __scurry.P; P.x = c.gx; P.z = c.gz; P.y = 0; P.vx = P.vz = 0; __scurry.run.primT = 1e9; }, c);
  await until(() => __scurry.chewTarget() && __scurry.chewTarget().kind === 'trap', 3000);
  await page.keyboard.down('KeyE');
  const sprung = await until(() => __scurry.W.traps.some(t => t.kind === 'cable' && t.sprung), 6000);
  await page.keyboard.up('KeyE');
  if (!sprung) throw new Error('cable not gnawed through ' + (await S(() => { const { P, G } = __scurry, c = __scurry.chewTarget(); return JSON.stringify({ st: G.state, chewing: P.chewing, chewT: P.chewT, c: c && c.kind, sq: P.squeeze, x: P.x, z: P.z }); })));
  if (!(await until(() => __scurry.W.shocks.length, 3000))) throw new Error('puddle never electrified');
  if (!(await until(() => __scurry.W.enemies.some(e => e.tag === 'cable' && e.hp < e.maxHp), 4000))) throw new Error('shock hurt nothing');
  await shot('03g-trap-cable');
  // Brick pallet (if this district has one).
  if (tc.kinds.includes('debris')) {
  const d = await S(() => { const t = __scurry.W.traps.find(t => t.kind === 'debris' && !t.sprung); return { hx: t.hx, hz: t.hz }; });
  await bait(d.hx, d.hz, 'debris');
  await S(() => __scurry.springTrap(__scurry.W.traps.find(t => t.kind === 'debris' && !t.sprung)));
  if (!(await until(() => __scurry.W.enemies.filter(e => e.tag === 'debris').every(e => e.hp < e.maxHp) || !__scurry.W.enemies.some(e => e.tag === 'debris'), 5000))) throw new Error('pallet crushed nothing');
  }
  // Scaffold (if this district has one).
  if (tc.kinds.includes('scaffold')) {
  const f = await S(() => { const t = __scurry.W.traps.find(t => t.kind === 'scaffold' && !t.sprung); return { cx: t.cx, cz: t.cz }; });
  await bait(f.cx, f.cz, 'scaffold');
  await S(() => __scurry.springTrap(__scurry.W.traps.find(t => t.kind === 'scaffold' && !t.sprung)));
  if (!(await until(() => !__scurry.W.plats.some(p => p.scaffold && __scurry.W.traps.find(t => t.kind === 'scaffold' && t.sprung).plats.includes(p)) && __scurry.W.enemies.some(e => e.tag === 'scaffold' && e.hp < e.maxHp), 5000))) throw new Error('scaffold did not come down on anything');
  }
  await shot('03h-trap-scaffold');
  await S(() => { __scurry.run.primT = 0; for (const e of __scurry.W.enemies) if (e.tag) __scurry.kill(e); });
});
await step('squeeze network: crawl in, cutaway, mobs locked out, rival nests', async () => {
  const di = await S(() => __scurry.ductInfo());
  if (!di.nets || !di.first) throw new Error('no crawlspaces carved ' + JSON.stringify(di));
  // Stand on the street outside the first mouth, facing in, and walk.
  const mouth = await S(() => {
    const { M } = __scurry, a = __scurry.ductInfo().first.a, x = a % M.W, z = (a / M.W) | 0, toW = g => (g - M.W / 2 + 0.5) * 4;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = M.grid[(z + dz) * M.W + x + dx]; if (t === 1 || t === 9 || t === 10) return { sx: toW(x + dx), sz: toW(z + dz), dx: -dx, dz: -dz, ax: toW(x), az: toW(z) }; }
    return null;
  });
  if (!mouth) throw new Error('crawlspace mouth has no street');
  await S(m => { const { P, G, W } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); P.x = m.sx; P.z = m.sz; P.y = 0; P.vx = P.vz = 0; G.camYaw = Math.atan2(m.dx, m.dz); G.lockOn = null; }, mouth);
  await page.keyboard.down('KeyW');
  const inside = await until(() => __scurry.P.inDuct, 5000);
  await rawWait(300);
  await page.keyboard.up('KeyW');
  if (!inside) throw new Error('could not crawl in: ' + JSON.stringify(await S(() => ({ x: __scurry.P.x, z: __scurry.P.z, sq: __scurry.P.squeeze, t: __scurry.M.grid[Math.floor(__scurry.P.z / 4 + __scurry.M.H / 2) * __scurry.M.W + Math.floor(__scurry.P.x / 4 + __scurry.M.W / 2)] }))));
  const cut = await until(() => __scurry.cutY() < 5 && __scurry.cutY(), 3000) || await S(() => __scurry.cutY());
  if (!(cut < 5)) throw new Error('no cutaway inside the walls: ' + cut);
  await wait(400);
  await shot('03i-squeeze-network');
  // The horde can't follow: a mawling dropped at the mouth stays on the street.
  await S(m => { const e = __scurry.spawnEnemy('mawling', m.sx, m.sz, { plain: true }); if (e) e.tag = 'door'; }, mouth);
  await wait(1500);
  const leak = await S(() => { const { M, W } = __scurry, e = W.enemies.find(e => e.tag === 'door'); if (!e) return false; const k = Math.floor(e.z / 4 + M.H / 2) * M.W + Math.floor(e.x / 4 + M.W / 2); return M.grid[k] === 11; });
  if (leak) throw new Error('a mawling got into the crawlspace');
  // Out again: back on the street the cutaway lifts.
  await S(m => { const P = __scurry.P; P.x = m.sx; P.z = m.sz; P.y = 0; }, mouth);
  if (!(await until(() => __scurry.cutY() > 100, 3000))) throw new Error('cutaway stuck on');
  await S(() => { for (const e of __scurry.W.enemies) if (e.tag) __scurry.kill(e); });
});
await step('leveling: breakthrough trial, champion, rewards, crate, evolution', async () => {
  // Park any boss out of the way (trials wait while a boss is on top of you).
  await S(() => { const { W, G } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); G.testNoBusy = true; });
  await wait(200);
  // Top out level 4: the bar caps at the breakthrough and the overflow is banked.
  await S(() => { const r = __scurry.run; r.level = 4; r.need = __scurry.need(4); r.xp = 0; r.trial = null; r.trialCd = 0.5; r.btPick = 0; __scurry.gainXP(500); });
  const cap = await S(() => ({ lv: __scurry.run.level, xp: __scurry.run.xp, need: __scurry.run.need, bank: __scurry.run.xpBank }));
  if (cap.lv !== 4 || cap.xp !== cap.need || !(cap.bank > 0)) throw new Error('bar did not cap at the breakthrough ' + JSON.stringify(cap));
  const trial = await until(() => !!__scurry.run.trial && __scurry.run.trial.e.champion, 8000);
  if (!trial) throw new Error('no champion came ' + (await S(() => { const { run, G, P, M, W } = __scurry, b = G.boss; return JSON.stringify({ st: G.state, cd: run.trialCd, cue: run.trialCue, lv: run.level, xp: run.xp, need: run.need, tiles: M.spawnTiles.length, n: W.enemies.length, boss: b && { rev: b.revealed, d: Math.hypot(b.x - P.x, b.z - P.z) }, seen: Object.keys(run.seenMobs || {}) }); })));
  await shot('03j-champion');
  await S(() => __scurry.kill(__scurry.run.trial.e));
  const bt = await rawUntil(() => __scurry.G.state === 'levelup' && __scurry.run.btPick > 0 && [...document.querySelectorAll('.card .role')].map(r => r.textContent), 4000);
  if (!bt || !bt.includes('Keystone')) throw new Error('breakthrough offers ' + JSON.stringify(bt));
  await shot('03k-breakthrough');
  await page.keyboard.press('Digit1');
  await wait(300);
  const after = await S(() => ({ lv: __scurry.run.level, bt: __scurry.run.btPick, crates: __scurry.W.crates.length }));
  if (after.lv < 5 || after.bt !== 0 || !after.crates) throw new Error('after breakthrough ' + JSON.stringify(after));
  // Weapon crate: a free weapon level (or a new weapon).
  const w0 = await S(() => __scurry.run.weapons.reduce((a, w) => a + w.lvl, 0));
  await S(() => { const { P, W } = __scurry, c = W.crates.find(c => c.kind === 'crate'); P.x = c.x; P.z = c.z; P.y = c.y; P.vx = P.vz = 0; });
  if (!(await until(w0 => __scurry.run.weapons.reduce((a, w) => a + w.lvl, 0) > w0 || __scurry.st.dmg > 1.5, 3000, w0))) throw new Error('crate gave nothing');
  // Evolution: a level-5 weapon plus its tome evolves at the next breakthrough pick.
  await S(() => { const r = __scurry.run; let w = r.weapons.find(w => w.id === 'claw'); if (!w) { if (r.weapons.length >= 4) r.weapons.pop(); w = { id: 'claw', lvl: 5, t: 0 }; r.weapons.push(w); } w.lvl = 5; r.tomes.might = Math.max(1, r.tomes.might || 0); r.btPick = 1; r.pendingLv = 1; __scurry.openLevelUp(); });
  const evo = await S(() => [...document.querySelectorAll('.card .role')].findIndex(r => r.textContent === 'Evolution'));
  if (evo < 0) throw new Error('no evolution offered');
  await page.keyboard.press('Digit' + (evo + 1));
  await wait(200);
  if (!(await S(() => __scurry.run.weapons.find(w => w.id === 'claw').evo))) throw new Error('claws did not evolve');
  await S(() => { __scurry.G.testNoBusy = false; });
});
await step('perfect dodge, district events, contracts', async () => {
  await S(() => { const { W, G } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); G.testNoBusy = true; __scurry.run.sta = __scurry.st.staMax; __scurry.P.rollCd = 0; });
  // Roll, and get "hit" in the opening of the roll.
  await page.keyboard.press('ShiftLeft');
  const pd = await rawUntil(() => { const { P } = __scurry; if (P.roll > 0.1) { __scurry.hurtP(10, null); return { t: P.perfectT, slow: __scurry.G.slowMo }; } return null; }, 3000);
  if (!pd || !(pd.t > 0) || !(pd.slow > 0)) throw new Error('perfect dodge did not trigger ' + JSON.stringify(pd) + (await S(() => { const { P, run, G } = __scurry; return JSON.stringify({ st: G.state, roll: P.roll, cd: P.rollCd, sta: run.sta, sq: P.squeeze, chew: P.chewing }); })));
  for (const k of ['feast', 'stampede', 'fumigate', 'tide', 'bounty']) {
    await S(k => __scurry.forceEvent(k), k);
    const on = await until(k => __scurry.run.events.some(v => v.kind === k), 4000, k);
    if (!on) throw new Error('event did not start: ' + k);
    if (k === 'stampede' && !(await S(() => __scurry.W.enemies.some(e => e.stampede)))) throw new Error('no stampede cats');
    if (k === 'tide' && !(await until(() => (__scurry.run.events.find(v => v.kind === 'tide') || {}).got > 10, 6000))) throw new Error('no roach tide');
    if (k === 'feast') { await wait(600); await shot('03l-event-feast'); }
    if (k === 'bounty') {
      const c0 = await S(() => __scurry.W.crates.length);
      await S(() => __scurry.kill(__scurry.W.enemies.find(e => e.bounty)));
      if (!(await until(c0 => __scurry.W.crates.length > c0, 2000, c0))) throw new Error('bounty paid nothing');
    }
    await S(() => { __scurry.run.events.length = 0; __scurry.run.evT = 999; });
  }
  // Contracts complete and pay Dominance.
  await S(() => { const r = __scurry.run; r.contracts = [{ id: 'bins', p: 4, done: false }]; r.contractDom = 0; __scurry.contract('bins'); });
  const cd = await S(() => ({ d: __scurry.run.contractDom, done: __scurry.run.contracts[0].done }));
  if (!cd.done || !(cd.d > 0)) throw new Error('contract did not pay ' + JSON.stringify(cd));
  await S(() => { __scurry.G.testNoBusy = false; for (const e of __scurry.W.enemies) if (e.type === 'roach' || e.stampede) __scurry.kill(e); });
});
await step('district objectives: heist, rescue, beacon, thief', async () => {
  await S(() => { __scurry.G.testNoBusy = true; for (const e of __scurry.W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); });
  const tp = (x, z, y = null) => S(([x, z, y]) => { const P = __scurry.P; P.x = x; P.z = z; P.y = y ?? 0; P.vx = P.vz = 0; }, [x, z, y]);
  // Heist: grab the wheel, carry it home.
  await S(() => __scurry.forceObjective('heist'));
  const h = await S(() => { const o = __scurry.run.obj; return { x: o.x, z: o.z, hx: o.home.x, hz: o.home.z }; });
  await tp(h.x, h.z, 0);
  if (!(await until(() => __scurry.run.obj.carried, 3000))) throw new Error('could not pick up the cheese wheel');
  await shot('03m-heist');
  await tp(h.hx, h.hz, 0);
  if (!(await until(() => __scurry.run.obj.done && __scurry.objDone(), 3000))) throw new Error('wheel delivery did not complete');
  // Rescue: gnaw one cage for real, open the rest.
  await S(() => __scurry.forceObjective('rescue'));
  const c = await S(() => { const c = __scurry.run.obj.cages[0]; return { x: c.x, z: c.z, y: c.y, n: __scurry.run.obj.cages.length }; });
  await tp(c.x + 1, c.z, c.y);
  await until(() => __scurry.chewTarget() && __scurry.chewTarget().kind === 'cage', 3000);
  const opened = await gnawUntil(() => __scurry.run.obj.cages[0].open);
  if (!opened) throw new Error('cage did not open');
  await S(() => { for (const c of __scurry.run.obj.cages) if (!c.open) __scurry.openCage(c); });
  if (!(await S(() => __scurry.run.obj.done && __scurry.W.familiars.length >= 3))) throw new Error('rescue did not complete');
  // Beacon: stand in the ring; it lights.
  await S(() => __scurry.forceObjective('hold'));
  const b = await S(() => { const o = __scurry.run.obj; return { x: o.x, z: o.z, y: o.y }; });
  await tp(b.x, b.z, b.y);
  if (!(await until(() => __scurry.run.obj.p > 0.5, 4000))) throw new Error('beacon not charging');
  await S(() => { __scurry.run.obj.p = 34.8; });
  await tp(b.x, b.z, b.y);
  if (!(await until(() => __scurry.run.obj.done, 3000))) throw new Error('beacon never lit');
  // Thief: it spawns, runs, and three catches finish the job.
  await S(() => __scurry.forceObjective('hunt'));
  for (let i = 0; i < 3; i++) {
    if (!(await until(() => __scurry.run.obj.thief && !__scurry.run.obj.thief.dead, 12000))) throw new Error('no thief spawned ' + i);
    await S(() => __scurry.kill(__scurry.run.obj.thief));
  }
  if (!(await S(() => __scurry.run.obj.done))) throw new Error('thief hunt did not complete');
  await S(() => { __scurry.G.testNoBusy = false; });
});
await step('rule breakers and Scab the rival', async () => {
  await S(() => { const { P, G, M, W } = __scurry, r = G.startRoom; G.testNoBusy = true; for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); __scurry.applyRule('chain'); P.x = (r.cx - M.W / 2 + 0.5) * 4; P.z = (r.cy - M.H / 2 + 0.5) * 4; P.y = 0; P.vx = P.vz = 0; });
  await S(() => { const { P } = __scurry; for (let i = 0; i < 4; i++) { const e = __scurry.spawnEnemy('mawling', P.x + 6 + i * 0.5, P.z, { hpMul: 30, plain: true, force: true }); if (e) { e.spd = 0; e.tag = 'chain'; } } const f = __scurry.W.enemies.find(e => e.tag === 'chain'); if (f) __scurry.kill(f); });
  if (!(await until(() => __scurry.W.enemies.some(e => e.tag === 'chain' && !e.dead && e.hp < e.maxHp), 3000))) throw new Error('chain reaction did not burst');
  await S(() => { for (const e of __scurry.W.enemies) if (e.tag) __scurry.kill(e); const r = __scurry.run; r.scabSeen = false; r.scab = null; r.dStart = r.time - 40; });
  const scab = await until(() => __scurry.run.scab && !__scurry.run.scab.dead, 6000);
  if (!scab) throw new Error('Scab never showed (needs an unopened chest)');
  const c0 = await S(() => __scurry.W.crates.length);
  await S(() => { if (__scurry.run.scab) __scurry.kill(__scurry.run.scab); });
  if (!(await S(c0 => __scurry.run.scabLosses === 1 && __scurry.W.crates.length > c0, c0))) throw new Error('Scab dropped nothing');
  await S(() => { __scurry.G.testNoBusy = false; __scurry.run.scabSeen = true; });
});
await step('corrupted elites spawn and die', async () => {
  await S(() => { __scurry.G.testFreeze = false; });
  await S(() => { const { P } = __scurry; for (const c of ['fire', 'ward', 'split', 'volatile', 'leech', 'haste']) __scurry.spawnEnemy('mawling', P.x + 3, P.z + 3, { elite: true, corrupt: c }); });
  await wait(2000);
  await S(() => { for (const e of __scurry.W.enemies) if (e.corrupt) e.hp = 1; });
  await wait(2500);
});
await step('surface boss: three phases, death, exits', async () => {
  await S(() => __scurry.spawnBoss());
  await wait(300);
  const hidden = await rawUntil(() => { const b = __scurry.G.boss; return document.getElementById('bossWrap').style.display === 'none' || b.revealed; }, 1500);
  if (!hidden) throw new Error('boss UI shown before reveal');
  await S(() => { const { G, P } = __scurry; const b = G.boss; b.x = P.x + 8; b.z = P.z; __scurry.comboGain(100); });
  const ready = await S(() => __scurry.run.shriekReady);
  if (!ready) throw new Error('combo did not charge shriek');
  await page.keyboard.press('KeyX');
  await rawWait(150);
  const sw = await S(() => ({ n: __scurry.W.swarm.length, stun: __scurry.G.boss.stun || 0, ui: document.getElementById('bossWrap').style.display }));
  const want = await S(() => 8 + (__scurry.st.swarmPlus || 0));
  if (sw.n !== want || !(sw.stun > 0)) throw new Error('shriek ' + JSON.stringify(sw));
  await wait(2500);
  if (!(await S(() => __scurry.G.boss.revealed))) throw new Error('boss not revealed in arena');
  if (!(await S(() => document.getElementById('introCard').textContent.length > 5))) throw new Error('no boss intro card');
  // The brain has been watching; a burst of real hits breaks its poise.
  await S(() => { __scurry.G.boss.stun = 0; __scurry.G.boss.invuln = 0; });
  const br = await S(() => { const b = __scurry.G.boss.brain; return b && { range: b.range, budget: b.budget }; });
  if (!br || !isFinite(br.range)) throw new Error('boss has no brain ' + JSON.stringify(br));
  await S(() => __scurry.hitBoss(0.08));
  const stg = await S(() => ({ s: __scurry.G.boss.brain.stagger, label: document.getElementById('bossLabel').textContent }));
  if (!(stg.s > 0)) throw new Error('burst did not stagger the boss ' + JSON.stringify(stg));
  if (!(await rawUntil(() => document.getElementById('bossLabel').textContent.includes('STAGGERED'), 1500))) throw new Error('boss bar does not show the stagger');
  await shot('04-boss');
  await S(() => __scurry.hurtBoss(0.4));
  await wait(2500);
  await S(() => __scurry.hurtBoss(0.35));
  await wait(3000);
  const ph = await S(() => __scurry.G.boss && __scurry.G.boss.phase);
  if (ph !== 3) throw new Error('boss phase ' + ph);
  await S(() => __scurry.killBoss());
  await wait(1000);
  const s = await S(() => ({ exit: !!__scurry.G.exitD, boss: !!__scurry.G.boss, keys: __scurry.W.keys.length, routes: (__scurry.G.exits || []).map(e => e.route) }));
  if (!s.exit || s.boss) throw new Error(JSON.stringify(s));
  if (s.routes.length < 2 || s.routes.some(r => !r)) throw new Error('no route choice after the boss ' + JSON.stringify(s));
  const rk = await S(() => ({ n: (__scurry.run.ranks || []).length, stamp: document.getElementById('rankStamp').textContent }));
  if (!rk.n || !rk.stamp) throw new Error('no district rank ' + JSON.stringify(rk));
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
    const b = await S(() => __scurry.G.boss && { kind: __scurry.G.boss.kind, phase: __scurry.G.boss.phase, hp: __scurry.G.boss.hp, mus: __scurry.music.intensity, mk: __scurry.music.bossKind, mp: __scurry.music.bossPhase });
    if (b && (b.mus !== 3 || b.mk !== b.kind || b.mp !== 3)) throw new Error('boss score not playing ' + JSON.stringify(b));
    if (!b || b.phase !== 3) throw new Error('boss state ' + JSON.stringify(b) + ' game ' + (await S(() => __scurry.G.state + ' hp=' + __scurry.run.hp)));
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
  await S(() => { __scurry.run.rerolls = 1; __scurry.pendLevel(); });
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
  if (!(await S(() => !!document.getElementById('share') && /Score/.test(document.getElementById('overlay').textContent)))) throw new Error('death screen has no score or share card');
  if (!(await S(() => __scurry.meta.domTotal > 0))) throw new Error('no dominance banked');
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
  // Dominance shelf: a stat upgrade and a shortcut.
  await S(() => { __scurry.meta.dominance = 120; __scurry.meta.domTotal = Math.max(__scurry.meta.domTotal, 120); __scurry.renderNest(); });
  await wait(200);
  await page.click('[data-n="fang"]');
  await page.click('[data-n="drain"]');
  const n = await S(() => ({ fang: __scurry.meta.nest.fang, drain: __scurry.meta.nest.drain, at: __scurry.meta.startAt, dom: __scurry.meta.dominance }));
  if (n.fang !== 1 || n.drain !== 1 || n.at !== 'drain') throw new Error('dominance shop ' + JSON.stringify(n));
  await shot('10b-nest-dominance');
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
await step('daily run: seeded twist and board', async () => {
  await S(() => __scurry.menu());
  await wait(400);
  await page.click('#mD');
  await wait(200);
  await page.click('.card[data-k="brawler"]');
  await wait(800);
  const d = await S(() => ({ daily: __scurry.run.daily, twist: __scurry.run.twist, st: __scurry.G.state }));
  if (!d.daily || !d.twist) throw new Error('daily run did not start ' + JSON.stringify(d));
  await S(() => { __scurry.god(true); __scurry.run.scrap = 10; __scurry.die(); });
  await wait(300);
  if (!(await S(() => /today/.test(document.getElementById('overlay').textContent)))) throw new Error('daily score not recorded');
  await S(() => { __scurry.G.daily = false; __scurry.menu(); });
  await wait(400);
});
await step('sewer sneak: shortcut start, smoke bomb, ambush shiv', async () => {
  await S(() => { __scurry.G.mode = 'survival'; __scurry.meta.startAt = 'drain'; __scurry.startRun('sneak'); __scurry.god(true); });
  await rawWait(300);
  const s0 = await S(() => ({ st: __scurry.G.state, d: __scurry.run.district, lv: __scurry.run.level, pend: __scurry.run.pendingLv, scent: __scurry.st.scentMax, sq: __scurry.st.squeezeMul, prim: __scurry.st.primMul }));
  if (s0.st !== 'levelup' || s0.d !== 1 || s0.pend !== 3 || s0.scent !== 16 || !(s0.sq > 1) || !(s0.prim > 1)) throw new Error('sneak start ' + JSON.stringify(s0));
  await wait(400);
  await S(() => { const { W } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); __scurry.run.specT = 0; });
  await page.keyboard.press('KeyQ');
  const sm = await until(() => __scurry.W.smokes.length && __scurry.P.ambush > 0, 3000);
  if (!sm) throw new Error('smoke bomb did nothing');
  await S(() => { const { P } = __scurry; const e = __scurry.spawnEnemy('mawling', P.x + 1.5, P.z, { hpMul: 20, plain: true }); if (e) { e.spd = 0; e.tag = 'mark'; } });
  const amb = await until(() => __scurry.P.ambush === 0 && __scurry.W.enemies.some(e => e.tag === 'mark' && e.hp < e.maxHp), 4000);
  await shot('11b-sneak');
  if (!amb) throw new Error('ambush shiv never landed');
  await S(() => { __scurry.meta.startAt = 'row'; __scurry.menu(); });
  await wait(600);
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
await step('mob roles: guard, priest, mimic, lurker, flee, rivalry, pack rage', async () => {
  await S(() => { const s = __scurry; s.G.testNoRoles = false; s.G.mode = 'survival'; s.startRun('brawler'); s.G.testNoRoles = true; s.god(true); Object.assign(s.run, { expoCd: 1e9, evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 }); });
  await wait(600);
  const placed = await S(() => ({ lurk: __scurry.W.enemies.filter(e => e.type === 'lurker' && e.hidden).length, mimic: __scurry.W.enemies.filter(e => e.type === 'mimic' && e.disguise).length }));
  if (!placed.lurk || !placed.mimic) throw new Error('roles not placed ' + JSON.stringify(placed));
  const g = await S(() => {
    const s = __scurry, P = s.P;
    s.W.enemies.length = 0;
    const g = s.spawnEnemy('shieldrat', P.x + 3, P.z, { plain: true, force: true, hpMul: 50 });
    g.ang = Math.atan2(P.x - g.x, P.z - g.z); g.cd = 99; g.spd = 0;
    let h = g.hp; s.hit(g, 20, Math.atan2(g.x - P.x, g.z - P.z), 0, 'primary'); const front = h - g.hp;
    h = g.hp; s.hit(g, 20, Math.atan2(P.x - g.x, P.z - g.z), 0, 'primary'); const back = h - g.hp;
    g.dead = true;
    return { front, back };
  });
  if (!(g.back > g.front * 3)) throw new Error('lid did not block ' + JSON.stringify(g));
  // Priest heals a hurt ally.
  await S(() => {
    const s = __scurry, P = s.P;
    const pr = s.spawnEnemy('priest', P.x + 10, P.z, { plain: true, force: true }); pr.cd = 0; pr.spd = 0; pr.tag = 'pr';
    const m = s.spawnEnemy('mawling', P.x + 11, P.z + 1, { plain: true, force: true, hpMul: 10 }); m.spd = 0; m.cd = 99; m.hp = m.maxHp * 0.4; m.fled = true; m.tag = 'hurt';
  });
  const healed = await until(() => { const m = __scurry.W.enemies.find(e => e.tag === 'hurt'); return m && m.hp > m.maxHp * 0.55; }, 6000);
  if (!healed) throw new Error('priest never healed');
  // A mimic springs when rummaged.
  await S(() => {
    const s = __scurry, P = s.P;
    s.W.enemies.length = 0;
    const e = s.spawnEnemy('mimic', P.x + 1.6, P.z, { plain: true, force: true });
    Object.assign(e, { disguise: true, bar: false, tag: 'mim' });
    e.bin = { x: e.x, z: e.z, y: e.y, r: 0.6, kind: 'bin', done: false, mimic: e };
    s.W.bins.push(e.bin);
    P.facing = Math.atan2(e.x - P.x, e.z - P.z);
  });
  await page.keyboard.press('KeyE');
  const sprung = await until(() => { const m = __scurry.W.enemies.find(e => e.tag === 'mim'); return m && !m.disguise; }, 3000);
  if (!sprung) throw new Error('mimic stayed disguised');
  // A hidden lurker bursts out when the rat comes close.
  await S(() => {
    const s = __scurry, P = s.P;
    s.W.enemies.length = 0;
    const e = s.spawnEnemy('lurker', P.x + 9, P.z, { plain: true, force: true });
    Object.assign(e, { hidden: true, bar: false, tag: 'lurk' });
  });
  await rawWait(400);
  if (!(await S(() => __scurry.W.enemies.find(e => e.tag === 'lurk').hidden))) throw new Error('lurker revealed itself too early');
  await S(() => { const P = __scurry.P, e = __scurry.W.enemies.find(e => e.tag === 'lurk'); P.x = e.x - 3; P.z = e.z; P.vx = P.vz = 0; });
  if (!(await until(() => !__scurry.W.enemies.find(e => e.tag === 'lurk').hidden, 3000))) throw new Error('lurker never burst out');
  // Hurt fry flee; an elite's death enrages the pack; cats eat mawlings.
  const pack = await S(() => {
    const s = __scurry, P = s.P;
    s.W.enemies.length = 0;
    const m = s.spawnEnemy('mawling', P.x + 4, P.z, { plain: true, force: true, hpMul: 10 });
    s.hit(m, m.maxHp * 0.7 / (s.st.dmg * 3), Math.atan2(m.x - P.x, m.z - P.z), 0, 'event');
    const el = s.spawnEnemy('mawling', P.x - 6, P.z, { elite: true, force: true });
    const buddy = s.spawnEnemy('mawling', P.x - 7, P.z + 1, { plain: true, force: true });
    s.kill(el);
    return { flee: m.fleeT > 0 || m.hp <= 0 || m.hp > m.maxHp * 0.35, rage: buddy.rage > 0 };
  });
  if (!pack.rage) throw new Error('pack did not rage ' + JSON.stringify(pack));
  await S(() => {
    const s = __scurry, P = s.P;
    s.W.enemies.length = 0;
    const c = s.spawnEnemy('cat', P.x + 14, P.z, { plain: true, force: true }); c.cd = 0;
    const m = s.spawnEnemy('mawling', P.x + 16, P.z, { plain: true, force: true }); m.spd = 0; m.cd = 99; m.tag = 'snack';
  });
  const ate = await until(() => (__scurry.run.catMeals || 0) > 0, 6000);
  if (!ate) throw new Error('cat ignored the mawling');
  await shot('11c-roles');
  await S(() => __scurry.menu());
  await wait(400);
});
await step('class signature moves', async () => {
  const res = {};
  for (const k of ['brawler', 'plague', 'slinger', 'warlock', 'tank', 'sneak', 'roof']) {
    await S(k => { const s = __scurry; s.G.mode = 'survival'; s.startRun(k); s.god(true); Object.assign(s.run, { expoCd: 1e9, evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9 }); }, k);
    await wait(500);
    await S(k => {
      const s = __scurry, P = s.P;
      s.W.enemies.length = 0;
      const d = k === 'sneak' ? 6 : k === 'roof' ? 3 : k === 'warlock' ? 5 : 1.6;
      const e = s.spawnEnemy('mawling', P.x + Math.sin(P.facing) * d, P.z + Math.cos(P.facing) * d, { plain: true, force: true, hpMul: 30 });
      if (!e) throw new Error('no space for target');
      e.spd = 0; e.cd = 99; e.tag = 'sig'; e.fled = true;
      if (k === 'plague') { e.pT = 3; e.pD = 6; }
      s.run.sigT = 0;
    }, k);
    await page.keyboard.press('KeyG');
    if (k === 'tank') await S(() => { const s = __scurry; s.st.taken = 1; const h = s.run.hp; s.hurtP(30, s.W.enemies[0]); s.st.taken = 0; window.__parried = s.run.hp === h; });
    const ok = await until(k => {
      const s = __scurry, e = s.W.enemies.find(e => e.tag === 'sig'), P = s.P;
      if (k === 'slinger') return s.W.pproj.some(p => p.bounce > 0) || (e && e.hp < e.maxHp);
      if (k === 'tank') return window.__parried && (s.run.parries || 0) > 0;
      if (k === 'sneak') return e && Math.hypot(e.x - P.x, e.z - P.z) < 2.6 && P.ambush > 0;
      if (k === 'warlock') return e && (e.hexT > 0 || e.hp < e.maxHp);
      return !e || e.dead || e.hp < e.maxHp;
    }, 5000, k);
    res[k] = !!ok;
  }
  if (Object.values(res).some(v => !v)) throw new Error('signature failed ' + JSON.stringify(res));
  await S(() => __scurry.menu());
  await wait(400);
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
    for (let i = 0; i < 10 && (await tp.evaluate(() => __scurry.G.state)) === 'levelup'; i++) { await tp.tap('.card[data-i="0"]'); await tp.waitForTimeout(200); }
    await tp.evaluate(() => { __scurry.run.need = 1e9; __scurry.run.evT = 1e9; });
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
    const mid = await tp.evaluate(() => ({ active: document.querySelector('#tStick i').style.transform, p: [__scurry.P.x, __scurry.P.z], st: __scurry.G.state, lock: __scurry.P.lock, sq: __scurry.P.squeeze, y: __scurry.P.y, carry: !!__scurry.P.carry }));
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
