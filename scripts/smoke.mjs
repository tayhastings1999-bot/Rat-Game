// Headless smoke test. Starts the Vite dev server, drives a full loop of the game through window.__scurry and
// real key presses, and fails on any console error or page exception.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, existsSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined); // else Playwright's own download (CI)

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
  catch (e) { errors.push(`step "${name}": ${e.message}`); console.log(`FAIL ${name}: ${e.message}`); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Smoke test::${name}: ${e.message.replace(/\n/g, ' ').slice(0, 600)}`); }
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
    // Mobs piling in over a long session knock the rat off its target; clear the ones close by.
    await S(() => { const P = __scurry.P; for (const e of __scurry.W.enemies) if (!e.boss && !e.tag && !e.mesh && e.type !== 'nest' && !e.rival && Math.hypot(e.x - P.x, e.z - P.z) < 10) e.dead = true; });
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
  if (!(await S(() => __scurry.run.coldOpen))) throw new Error('no cold open');
  await S(() => { __scurry.run.evT = 1e9; __scurry.run.scabSeen = true; }); // no district events or Scab mid-script
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
await step('XP from kills: auto level-up, no pause', async () => {
  const L0 = await S(() => __scurry.run.level);
  await S(() => { const s = __scurry; s.addXP(s.need(s.run.level) * 2.5); });
  const r = await S(() => ({ L: __scurry.run.level, st: __scurry.G.state }));
  if (r.L <= L0 || r.st !== 'play') throw new Error('level-up ' + JSON.stringify(r));
  await shot('03-levelup');
  const x0 = await S(() => __scurry.run.xp + __scurry.run.level * 1e6);
  await S(() => { const { P } = __scurry, e = __scurry.spawnEnemy('mawling', P.x + 2, P.z, { plain: true, force: true }); if (e) __scurry.kill(e); });
  if (!(await S(x0 => __scurry.run.xp + __scurry.run.level * 1e6 > x0, x0))) throw new Error('kill gave no XP');
});
await step('city interactions: chest, boards, climb, power line, key, manhole', async () => {
  const tp = (x, z, y) => S(([x, z, y]) => { const P = __scurry.P; P.x = x; P.z = z; P.y = y ?? 0; P.vx = P.vz = P.vy = 0; }, [x, z, y]);
  // Chest
  const chest = await S(() => { const c = __scurry.W.chests.find(c => !c.open && c.y < 1); return c && { x: c.x, z: c.z, y: c.y }; });
  if (chest) {
    const n0 = await S(() => __scurry.run.scrap + __scurry.W.scraps.length);
    await tp(chest.x + 1, chest.z, chest.y); await wait(200);
    await page.keyboard.press('KeyE'); await wait(300);
    const n1 = await S(() => __scurry.run.scrap + __scurry.W.scraps.length);
    if (n1 <= n0) throw new Error('chest gave no gold');
  }
  // Gnaw through boards
  const board = await S(() => {
    const { M } = __scurry;
    for (let k = 0; k < M.W * M.H; k++) if (M.grid[k] === 3 && M.secret[k] !== 2) { // not a bolted back door
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
  await S(w => { const { P, G } = __scurry; P.x = w.x + w.nx * 1.6; P.z = w.z + w.nz * 1.6; P.y = 0; P.vx = P.vz = 0; G.camYaw = Math.atan2(-w.nx, -w.nz); }, wall);
  await page.keyboard.down('KeyW'); await wait(120); await page.keyboard.press('Space'); await page.keyboard.down('Space');
  await until(h => __scurry.P.y >= h - 0.2, 7000, wall.h);
  const py = await S(() => __scurry.P.y);
  await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  if (py < wall.h - 0.2) throw new Error(`climb reached y=${py.toFixed(2)} of roof ${wall.h} ` + (await S(() => { const P = __scurry.P; return JSON.stringify({ st: __scurry.G.state, x: P.x, z: P.z, wt: P.wallType, carry: !!P.carry, sq: P.squeeze }); })) + ' ' + JSON.stringify(wall));
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
  await S(() => { __scurry.startRun('brawler'); __scurry.god(true); __scurry.run.evT = 1e9; __scurry.run.scabSeen = true; });
  await wait(600);
  // Early on only mawlings spawn; later types unlock on schedule with a banner.
  const early = await S(() => { const s = new Set(); for (let i = 0; i < 200; i++) s.add(__scurry.pickType()); return [...s]; });
  if (early.length !== 1 || early[0] !== 'mawling') throw new Error('early roster ' + early);
  await S(() => { __scurry.run.time = 170; });
  const seen = (await until(() => Object.keys(__scurry.run.seenMobs).includes('roach') && Object.keys(__scurry.run.seenMobs), 5000)) || await S(() => Object.keys(__scurry.run.seenMobs));
  if (!seen.includes('roach')) throw new Error('roster intros not firing: ' + seen);
  await S(() => { __scurry.run.time = 5; });
  // Secret wall: gnaw it open.
  const sec = await S(() => { const { M } = __scurry; for (let k = 0; k < M.W * M.H; k++) if (M.secret[k] === 1 && M.grid[k] === 3) { const gx = k % M.W, gz = (k / M.W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = M.grid[(gz + dz) * M.W + gx + dx]; if ((n === 1 || n === 10 || n === 9) && M.flow[(gz + dz) * M.W + gx + dx] >= 0) return { k, gx, gz, dx, dz }; } } return null; });
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
await step('foraging', async () => {
  await S(() => { __scurry.G.testFreeze = true; __scurry.W.zones.length = 0; }); // hold any boss still, and no vents shoving the rat, through the scripted steps
  const f = await S(() => { const f = __scurry.W.fungi.find(f => !f.taken); return f && { x: f.x, y: f.y, z: f.z, k: f.kind }; });
  if (!f) throw new Error('no fungi in district');
  await S(f => { const P = __scurry.P; P.x = f.x; P.z = f.z; P.y = f.y; P.vx = P.vz = 0; }, f);
  const t = await until(k => (__scurry.run.buffs || {})[k] || 0, 4000, f.k);
  if (!(t > 8)) throw new Error('fungus buff ' + f.k + ' = ' + t);
  await shot('03b-forage');
});
await step('rummaging bins', async () => {
  const bin = await S(() => { const b = __scurry.W.bins.find(b => !b.done); return b && { x: b.x, z: b.z, r: b.r }; });
  if (!bin) throw new Error('no bins to rummage');
  await S(b => { const P = __scurry.P; P.x = b.x + b.r + 0.6; P.z = b.z; P.y = 0; P.vx = P.vz = 0; }, bin);
  await until(() => { const u = __scurry.useTarget(); return u && u.kind === 'bin'; }, 3000);
  for (let i = 0; i < 5 && !(await S(b => __scurry.W.bins.find(o => o.x === b.x && o.z === b.z).done, bin)); i++) { await page.keyboard.press('KeyE'); await wait(200); }
  if (!(await S(b => __scurry.W.bins.find(o => o.x === b.x && o.z === b.z).done, bin))) throw new Error('rummage did nothing');
});
await step('advanced scent: gauge, prints, gnaw points, view cones', async () => {
  await S(() => { const { P, G, M, W, st } = __scurry, r = G.startRoom; P.x = (r.cx - M.W / 2 + 0.5) * 4; P.z = (r.cy - M.H / 2 + 0.5) * 4; P.y = 0; P.vx = P.vz = 0; P.scent = false; P.scentE = st.scentMax; for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); });
  await page.keyboard.press('KeyF');
  await until(() => __scurry.P.scent && __scurry.scentInfo().paths > 0 && __scurry.P.scentE < __scurry.st.scentMax - 0.3, 5000);
  const a = await S(() => ({ on: __scurry.P.scent, e: __scurry.P.scentE, max: __scurry.st.scentMax, ...__scurry.scentInfo() }));
  if (!a.on || !(a.e < a.max - 0.3) || !a.paths || !a.gnaw) throw new Error('scent ' + JSON.stringify(a));
  // An elite on the move leaves fresh prints.
  await S(() => { const { P } = __scurry, e = __scurry.spawnEnemy('mawling', P.x + 3, P.z, { elite: true }); if (e) { e.spd = 0; e.tag = 'walker'; } });
  for (let i = 0; i < 6; i++) { await S(() => { const e = __scurry.W.enemies.find(e => e.tag === 'walker'); if (e) e.x += 1.3; }); await rawWait(80); }
  // A cat facing +z: stand behind it (unseen), then in front of it (seen). The rat holds its attack so
  // nothing wakes the cat but its eyes.
  const cat = await S(() => {
    const { P, M, W, run } = __scurry;
    for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e);
    run.primT = 1e9;
    const gx = Math.round(P.x / 4 + M.W / 2 - 0.5), gz = Math.round(P.z / 4 + M.H / 2 - 0.5), k = (gz + 4) * M.W + gx;
    __scurry.addPred([k, k]);
    const e = W.enemies[W.enemies.length - 1];
    e.spd = 0; e.x = (gx - M.W / 2 + 0.5) * 4; e.z = P.z + 1; e.ang = 0; P.x = e.x;
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
  if (behind !== 'patrol' || front !== 'hunt') throw new Error(`cat vision: behind=${behind} front=${front} ` + (await S(() => { const { P } = __scurry, e = __scurry.W.enemies.find(e => e.pred && e.type !== 'owl'); return JSON.stringify({ det: e.det, look: e.look, ang: e.ang, d: Math.hypot(P.x - e.x, P.z - e.z), dy: P.y - e.y, hurt: e.hurt, ex: e.x, ez: e.z, px: P.x, pz: P.z }); })));
  if (!info.prints || !info.cones) throw new Error('scent overlay ' + JSON.stringify(info));
  await S(() => { const { W, run, P } = __scurry; for (const e of W.enemies) if (e.pred) __scurry.kill(e); P.scent = false; run.primT = 0; });
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
  if (!(await until(() => __scurry.cutY() > 100 || (__scurry.P.inBldg && __scurry.cutY() > 2), 3000))) throw new Error('cutaway stuck on'); // a crawlspace can open into a building
  await S(() => { for (const e of __scurry.W.enemies) if (e.tag) __scurry.kill(e); });
});
await step('perfect dodge, district events', async () => {
  await S(() => { const { W, G } = __scurry; for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); G.testNoBusy = true; __scurry.P.rollCd = 0; });
  // Roll, and get "hit" in the opening of the roll.
  await page.keyboard.press('ShiftLeft');
  const pd = await rawUntil(() => { const { P } = __scurry; if (P.roll > 0.1) { __scurry.hurtP(10, null); return { t: P.perfectT, slow: __scurry.G.slowMo }; } return null; }, 3000);
  if (!pd || !(pd.t > 0) || !(pd.slow > 0)) throw new Error('perfect dodge did not trigger ' + JSON.stringify(pd) + (await S(() => { const { P, G } = __scurry; return JSON.stringify({ st: G.state, roll: P.roll, cd: P.rollCd, sq: P.squeeze, chew: P.chewing }); })));
  for (const k of ['feast', 'stampede', 'fumigate', 'tide', 'bounty']) {
    await S(k => __scurry.forceEvent(k), k);
    const on = await until(k => __scurry.run.events.some(v => v.kind === k), 4000, k);
    if (!on) throw new Error('event did not start: ' + k);
    if (k === 'stampede' && !(await S(() => __scurry.W.enemies.some(e => e.stampede)))) throw new Error('no stampede cats');
    if (k === 'tide' && !(await until(() => (__scurry.run.events.find(v => v.kind === 'tide') || {}).got > 10, 6000))) throw new Error('no roach tide');
    if (k === 'feast') { await wait(600); await shot('03l-event-feast'); }
    if (k === 'bounty') {
      const c0 = await S(() => __scurry.W.scraps.length);
      await S(() => __scurry.kill(__scurry.W.enemies.find(e => e.bounty)));
      if (!(await until(c0 => __scurry.W.scraps.length > c0, 2000, c0))) throw new Error('bounty paid nothing');
    }
    await S(() => { __scurry.run.events.length = 0; __scurry.run.evT = 999; });
  }
  await S(() => { __scurry.G.testNoBusy = false; for (const e of __scurry.W.enemies) if (e.type === 'roach' || e.stampede) __scurry.kill(e); });
});
await step('district objectives: heist, rescue, beacon, thief', async () => {
  await S(() => { __scurry.G.testNoBusy = true; Object.assign(__scurry.run, { spawnT: 1e9, surgeT: 1e9 }); for (const e of __scurry.W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); });
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
  if (!opened) throw new Error('cage did not open ' + JSON.stringify(await S(() => { const s = __scurry, P = s.P, c = s.run.obj.cages[0], ct = s.chewTarget(), u = s.useTarget(); return { d: Math.hypot(P.x - c.x, P.z - c.z).toFixed(2), dy: (P.y - c.y).toFixed(2), ch: P.chewing, t: P.chewT, ct: ct && ct.kind, u: u && u.kind + ':' + u.label, st: s.G.state, carry: !!P.carry, inv: P.inv }; })));
  await S(() => { for (const c of __scurry.run.obj.cages) if (!c.open) __scurry.openCage(c); });
  if (!(await S(() => __scurry.run.obj.done))) throw new Error('rescue did not complete');
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
await step('Scab the rival', async () => {
  await S(() => { const { P, G, M, W } = __scurry, r = G.startRoom; G.testNoBusy = true; Object.assign(__scurry.run, { spawnT: 1e9, surgeT: 1e9 }); for (const e of W.enemies) if (!e.boss && e.type !== 'nest' && !e.rival) __scurry.kill(e); P.x = (r.cx - M.W / 2 + 0.5) * 4; P.z = (r.cy - M.H / 2 + 0.5) * 4; P.y = 0; P.vx = P.vz = 0; });
  await S(() => { for (const e of __scurry.W.enemies) if (e.tag) __scurry.kill(e); const r = __scurry.run; r.scabSeen = false; r.scab = null; r.dStart = r.time - 40; });
  const scab = await until(() => __scurry.run.scab && !__scurry.run.scab.dead, 6000);
  if (!scab) throw new Error('Scab never showed (needs an unopened chest)');
  const c0 = await S(() => __scurry.W.scraps.length);
  await S(() => { if (__scurry.run.scab) __scurry.kill(__scurry.run.scab); });
  if (!(await S(c0 => __scurry.run.scabLosses === 1 && __scurry.W.scraps.length > c0, c0))) throw new Error('Scab dropped nothing');
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
  await S(() => { const { G, P } = __scurry; const b = G.boss; b.x = P.x + 8; b.z = P.z; });
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
  const s = await S(() => ({ exit: !!__scurry.G.exitD, boss: !!__scurry.G.boss, keys: __scurry.W.keys.length }));
  if (!s.exit || s.boss) throw new Error(JSON.stringify(s));
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
await step('death banks gold', async () => {
  const before = await S(() => __scurry.meta.salvage);
  await S(() => { __scurry.run.scrap = 120; __scurry.die(); });
  await wait(400);
  const after = await S(() => __scurry.meta.salvage);
  if (after < before + 120) throw new Error(`salvage ${before} -> ${after}`);
  if (!(await S(() => !!document.getElementById('share') && /Score/.test(document.getElementById('overlay').textContent)))) throw new Error('death screen has no score or share card');
  await shot('09-dead');
});
await step('new classes play', async () => {
  for (const k of ['tank', 'roof']) {
    await S(k => { __scurry.startRun(k); __scurry.god(true); }, k);
    await wait(600);
    await page.keyboard.press('KeyQ');
    await hold('KeyW', 800);
    await wait(1200);
    await S(() => __scurry.menu());
    await wait(800);
  }
});
await step('sewer sneak: open from the start, smoke bomb, backstab shiv', async () => {
  await S(() => __scurry.menu());
  await wait(400);
  await page.click('.card[data-k="sneak"]');
  await rawWait(600);
  const s0 = await S(() => ({ st: __scurry.G.state, scent: __scurry.st.scentMax, sq: __scurry.st.squeezeMul }));
  if (s0.st !== 'play' || s0.scent !== 16 || !(s0.sq > 1)) throw new Error('sneak start ' + JSON.stringify(s0));
  await S(() => { const { W } = __scurry; __scurry.god(true); for (const e of W.enemies) if (!e.boss && e.type !== 'nest') __scurry.kill(e); __scurry.run.specT = 0; });
  await page.keyboard.press('KeyQ');
  if (!(await until(() => __scurry.W.smokes.length, 3000))) throw new Error('smoke bomb did nothing');
  // Stand behind a mob facing away and stab: a backstab.
  await S(() => { const { P } = __scurry; const e = __scurry.spawnEnemy('mawling', P.x, P.z + 1.4, { hpMul: 20, plain: true, force: true }); if (e) { e.spd = 0; e.cd = 99; e.ang = 0; e.tag = 'mark'; } __scurry.G.aimAt = { x: P.x, z: P.z + 1.4 }; __scurry.G.attack = true; });
  const hit = await until(() => __scurry.W.enemies.some(e => e.tag === 'mark' && e.hp < e.maxHp), 4000);
  await S(() => { __scurry.G.attack = false; __scurry.G.aimAt = null; });
  await shot('11b-sneak');
  if (!hit) throw new Error('shiv never landed');
  await S(() => __scurry.menu());
  await wait(600);
});
await step('mob roles: guard, priest, mimic, lurker, flee, rivalry, pack rage', async () => {
  await S(() => { const s = __scurry; s.G.testNoRoles = false; s.startRun('brawler'); s.G.testNoRoles = true; s.god(true); Object.assign(s.run, { evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 }); });
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
    await S(k => { const s = __scurry; s.startRun(k); s.god(true); Object.assign(s.run, { evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9 }); }, k);
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
      if (k === 'sneak') return e && Math.hypot(e.x - P.x, e.z - P.z) < 2.6;
      if (k === 'warlock') return e && (e.hexT > 0 || e.hp < e.maxHp);
      return !e || e.dead || e.hp < e.maxHp;
    }, 5000, k);
    res[k] = !!ok;
  }
  if (Object.values(res).some(v => !v)) throw new Error('signature failed ' + JSON.stringify(res));
  await S(() => __scurry.menu());
  await wait(400);
});
await step('set pieces: interior cutaway, back door, tram, crane, stall, washer', async () => {
  await S(() => { const s = __scurry; s.startRun('brawler'); s.god(true); Object.assign(s.run, { evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9 }); });
  await wait(600);
  const tp = (x, z) => S(([x, z]) => { const P = __scurry.P; P.x = x; P.z = z; P.y = 0; P.vx = P.vz = P.vy = 0; }, [x, z]);
  // Interiors: step in and the walls are cut away.
  const room = await S(() => { const M = __scurry.M; for (let k = 0; k < M.inside.length; k++) if (M.inside[k] && M.grid[k] === 1) return { x: (k % M.W - M.W / 2 + 0.5) * 4, z: (((k / M.W) | 0) - M.H / 2 + 0.5) * 4 }; return null; });
  if (!room) throw new Error('no enterable building');
  await tp(room.x, room.z);
  const cut = await until(() => __scurry.P.inBldg && __scurry.cutY() < 4, 3000);
  if (!cut) throw new Error('no interior cutaway');
  // A back door, if there is one: unbolt it from inside.
  const door = await S(() => { const M = __scurry.M; for (let k = 0; k < M.secret.length; k++) if (M.secret[k] === 2) { const gx = k % M.W, gz = (k / M.W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (gz + dz) * M.W + gx + dx; if (M.inside[j] && M.grid[j] === 1) return { k, x: (gx + dx - M.W / 2 + 0.5) * 4, z: (gz + dz - M.H / 2 + 0.5) * 4 }; } } return null; });
  if (door) {
    await tp(door.x, door.z);
    await wait(200);
    await page.keyboard.press('KeyE');
    if (!(await until(k => __scurry.M.grid[k] === 1, 2000, door.k))) throw new Error('back door stayed bolted');
  }
  // Tram: put a mawling on the rails and call the tram.
  const tram = await S(() => !!__scurry.W.tram);
  if (tram) {
    await S(() => { const s = __scurry, t = s.W.tram, P = s.P; P.x = t.axis === 'z' ? t.c + 8 : P.x; P.z = t.axis === 'z' ? P.z : t.c + 8; P.y = 0; const x = t.axis === 'z' ? t.c : P.x, z = t.axis === 'z' ? P.z : t.c; const e = s.spawnEnemy('mawling', x, z, { plain: true, force: true }); e.spd = 0; e.cd = 99; e.tag = 'rail'; t.state = 'idle'; t.t = 0; t.forced = true; });
    if (!(await until(() => { const e = __scurry.W.enemies.find(e => e.tag === 'rail'); return !e || e.dead; }, 30000))) throw new Error('the tram missed ' + JSON.stringify(await S(() => { const t = __scurry.W.tram, e = __scurry.W.enemies.find(e => e.tag === 'rail'); return { st: t.state, pos: t.pos, c: t.c, axis: t.axis, e: e && [e.x, e.z, e.y] }; })));
  }
  // Washers, stalls and the crane, whichever this district has.
  const sp = await S(() => {
    const s = __scurry, W = s.W, out = {};
    const w = W.washers[0];
    if (w) { W.uses.find(u => u.label.startsWith('Start a spin')).act(); out.washer = w.spin > 0; }
    const st = W.uses.find(u => u.label.startsWith('Rob'));
    if (st) { const n = W.enemies.length; st.act(); out.stall = W.enemies.length > n && st.done; }
    if (W.crane) {
      const c = W.crane;
      for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, -6], [6, -6], [-6, 6]]) { let n = 0; for (let i = 0; i < 4; i++) { const e = s.spawnEnemy('mawling', c.x + ox + i * 0.5, c.z + oz, { plain: true, force: true, hpMul: 30 }); if (e) { e.spd = 0; e.cd = 99; e.tag = 'crane'; n++; } } if (n) break; }
      out.craneArmed = W.uses.find(u => u.label.startsWith('Work the crane')).act();
    }
    return out;
  });
  if (sp.washer === false || sp.stall === false || sp.craneArmed === false) throw new Error('set piece did nothing ' + JSON.stringify(sp));
  if (sp.craneArmed && !(await until(() => __scurry.W.enemies.some(e => e.tag === 'crane' && (e.dead || e.hp < e.maxHp)), 12000))) throw new Error('crane drop missed');
  console.log('     set pieces:', JSON.stringify(sp));
  await S(() => __scurry.menu());
  await wait(400);
});
await step('story: prologue, Scab\'s choice, chapters, locked ending, journal', async () => {
  const st = () => S(() => __scurry.G.state);
  const through = async () => { for (let i = 0; i < 40 && (await st()) === 'story'; i++) { await page.keyboard.press('Space'); await rawWait(60); } };
  await S(() => { const s = __scurry; s.G.testStory = true; s.story.resetStory(); s.startRun('brawler'); s.god(true); Object.assign(s.run, { evT: 1e9, scabSeen: true, spawnT: 1e9, surgeT: 1e9 }); });
  if (!(await rawUntil(() => __scurry.G.state === 'story', 6000))) throw new Error('no prologue');
  await shot('12a-prologue');
  await through();
  if ((await S(() => __scurry.story.chapter())) !== 1) throw new Error('prologue did not start chapter 1');
  // First catch: three choices; "I'm sorry" is mercy, two bonds.
  await S(() => __scurry.story.onScabCaught({}, () => {}));
  if (!(await rawUntil(() => __scurry.G.state === 'story', 3000))) throw new Error('no Scab scene');
  await page.keyboard.press('Escape');
  const opts = await S(() => document.querySelectorAll('#story .sopt').length);
  if (opts !== 3) throw new Error(`${opts} choices`);
  await shot('12b-scab-choice');
  await page.keyboard.press('Digit3');
  await through();
  const s1 = await S(() => JSON.parse(JSON.stringify(__scurry.story.story())));
  if (s1.ch !== 2 || !s1.sorry || s1.bonds !== 2 || s1.mercy !== 1) throw new Error('choice not recorded ' + JSON.stringify(s1));
  // Scab escalates by chapter: poison from chapter 2, a crew after refusing him, gifts if allied, gone once crowned.
  const modes = await S(() => { const s = __scurry.story, o = []; for (const [c, a] of [[1, null], [2, null], [5, false], [5, true], [7, null]]) { s.setChapter(c); s.story().ally = a; o.push(s.scabMode()); } return o.join(','); });
  if (modes !== 'thief,poison,crew,ally,gone') throw new Error('scab modes ' + modes);
  // The finale: without enough bonds, cutting him free is locked.
  await S(() => { const s = __scurry.story; s.setChapter(7); s.story().bonds = 2; s.onBossDeath({ kind: 'ratking', scabKing: true }); });
  if (!(await rawUntil(() => __scurry.G.state === 'story', 3000))) throw new Error('no finale');
  await page.keyboard.press('Escape');
  const locked = await S(() => document.querySelector('#story .sopt.locked') !== null);
  if (!locked) throw new Error('cut-free ending not locked at 2 bonds');
  await shot('12c-finale');
  await page.keyboard.press('Digit1');
  if ((await st()) !== 'story') throw new Error('a locked ending was taken');
  await page.keyboard.press('Digit2');
  await through();
  await rawUntil(() => __scurry.G.state === 'play', 3000);
  const end = await S(() => ({ ch: __scurry.story.chapter(), e: __scurry.story.story().ending }));
  if (end.ch !== 8 || end.e !== 'leave') throw new Error('ending ' + JSON.stringify(end));
  await S(() => __scurry.pause(true));
  if (!(await S(() => document.querySelectorAll('.journal .jrow.done').length === 7))) throw new Error('journal');
  await S(() => { __scurry.G.testStory = false; __scurry.story.resetStory(); __scurry.pause(false); });
});
await step('soak: 20s of live horde', async () => {
  await S(() => { __scurry.startRun('slinger'); __scurry.god(true); });
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
    await tp.waitForTimeout(2500);
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
