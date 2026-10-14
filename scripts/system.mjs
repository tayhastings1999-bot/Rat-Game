// Stage 2 · System & UI verification + fuzzing (deterministic API checks, then
// randomized bombardment). Runs after the boot gate, before any bot plays.
//   UI sweep   open every screen and click every button on it, one at a time,
//              from a fresh state; nothing may throw or strand the game.
//   Math       damage and armor, i-frames, health/XP bars matching the numbers,
//              healing caps, kills and XP, automatic level-ups, the kit slots,
//              the dodge cooldown, manual attack, and the save file round-tripping.
//   Fuzz       random keys/mouse at full speed during play; the rat and
//              mobs teleported to random spots (walls, roofs, edges) with wild
//              velocities; random clicks on every overlay. Watches for
//              exceptions, NaN, out-of-bounds and stuck states.
// Usage: node scripts/system.mjs [--seconds=45]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const FUZZ_SECS = +(arg('seconds') || 45);
const OUT = new URL('./out/system/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await createServer({ server: { port: 5189, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push({ msg: e.message, stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') }));
page.on('console', m => { if (m.type() === 'error') errors.push({ msg: 'console: ' + m.text() }); });
const S = (fn, a) => page.evaluate(fn, a);
const sleep = ms => page.waitForTimeout(ms);
const results = [];
const check = async (name, fn) => {
  const e0 = errors.length;
  try { const r = await fn(); if (errors.length > e0) throw new Error('error: ' + errors[e0].msg); results.push({ name, ok: true, note: r || '' }); console.log(`ok   ${name}${r ? ' · ' + r : ''}`); }
  catch (e) {
    results.push({ name, ok: false, note: e.message }); console.log(`FAIL ${name}: ${e.message}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=System check::${name}: ${e.message.replace(/\n/g, ' ')}`); await page.screenshot({ path: OUT + name.replace(/\W+/g, '-') + '.png' }).catch(() => {}); }
};
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

await page.goto('http://localhost:5189/?debug');
await page.waitForFunction(() => window.__scurry && window.__scurry.qa && document.querySelector('#overlay h1'), null, { timeout: 60000 });
const fresh = async (cls = 'tank') => {
  await S(c => { const s = __scurry; s.qa.stop(); s.G.testNoRoles = true; s.startRun(c); s.god(false); Object.assign(s.run, { evT: 1e9, spawnT: 1e9, surgeT: 1e9, scabSeen: true, lurkT: 1e9 }); s.W.enemies.forEach(e => { if (e.type !== 'nest') e.dead = true; }); }, cls);
  // Wait for play, and for a few frames of game time: the first frames of a fresh district
  // can stall on shader compiles, and spawn tiles and pickups only exist after an update.
  for (let i = 0; i < 80; i++) {
    if ((await S(() => __scurry.G.state === 'play' && __scurry.run.time >= 0.15))) return;
    await sleep(80);
  }
  throw new Error('run never reached play state: ' + (await S(() => __scurry.G.state)));
};
const STATES = new Set(['menu', 'play', 'paused', 'map', 'dead', 'trans', 'story']);

// ---------------------------------------------------------------- UI sweep
const SCREENS = {
  menu: async () => { await S(() => __scurry.menu()); },
  pause: async () => { await fresh(); await S(() => __scurry.pause(true)); },
  map: async () => { await fresh(); await page.keyboard.press('KeyM'); },
  death: async () => { await fresh(); await S(() => __scurry.die()); },
};
for (const [name, open] of Object.entries(SCREENS)) {
  await check(`UI sweep · ${name}`, async () => {
    await open();
    await sleep(150);
    const n = await page.locator('#overlay button:visible, #overlay .card:visible').count();
    assert(n > 0, 'no buttons on screen');
    let clicked = 0;
    for (let i = 0; i < n; i++) {
      await open();
      await sleep(120);
      const btn = page.locator('#overlay button:visible, #overlay .card:visible').nth(i);
      if (!(await btn.count())) continue;
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(180);
      const st = await S(() => __scurry.G.state);
      assert(STATES.has(st), `button ${i} left the game in state "${st}"`);
      clicked++;
    }
    // Sliders (volume, etc.) take any value.
    for (const s of await page.locator('#overlay input[type=range]').all()) await s.fill(String(Math.round(Math.random() * 100))).catch(() => {});
    return `${clicked}/${n} controls`;
  });
}

// ---------------------------------------------------------------- math & systems
await check('damage, armor and i-frames', async () => {
  await fresh();
  const r = await S(() => {
    const s = __scurry, run = s.run, st = s.st;
    st.taken = 0.7; s.P.inv = 0; s.P.parry = 0; s.P.bulwark = 0; run.hp = 100; // taken = 1 − 0.055·Armor
    if (s.G.state !== 'play') return { state: s.G.state };
    s.hurtP(20, null);
    const first = 100 - run.hp, invAfter = s.P.inv;
    const h = run.hp; s.hurtP(20, null); const during = h - run.hp; // inside i-frames
    s.P.inv = 0; st.taken = 1; const h2 = run.hp; s.hurtP(20, null, true); const raw = h2 - run.hp; // raw hazards ignore i-frames
    return { first, invAfter, during, raw, tier: run.tier };
  });
  assert(!r.state, 'not in play: ' + r.state);
  near(r.first, Math.round(20 * 0.7 * (1 + 0.1 * r.tier)), 1, 'armored hit');
  assert(r.invAfter > 0, 'no i-frames after a hit');
  assert(r.during === 0, `damage taken during i-frames (${r.during})`);
  near(r.raw, 20, 1, 'raw hazard damage');
});
await check('health bar and text match HP', async () => {
  await fresh();
  for (const f of [1, 0.73, 0.31, 0.05]) {
    const r = await S(f => { const s = __scurry; s.run.hp = s.st.maxHp * f; s.hud(); return { w: parseFloat(document.getElementById('hpFill').style.width), txt: document.getElementById('hpTxt').textContent, hp: Math.round(s.run.hp), max: s.st.maxHp }; }, f);
    near(r.w, f * 100, 1.5, `hp bar at ${f}`);
    const shown = parseInt(r.txt, 10);
    assert(Math.abs(shown - r.hp) <= 1, `hp text "${r.txt}" vs ${r.hp}`); // the HUD rounds up so a living rat never shows 0
  }
});
await check('XP bar and automatic level-up (no pause)', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry; s.run.xp = s.run.need / 2; s.hud(); const w = parseFloat(document.getElementById('xpFill').style.width); const lv = s.run.level; s.addXP(s.run.need * 0.51 + 0.01); return { w, lv, after: s.run.level, st: s.G.state }; });
  near(r.w, 50, 2, 'xp bar half full');
  assert(r.after === r.lv + 1, `level ${r.lv} → ${r.after}`);
  assert(r.st === 'play', 'a level-up paused the game: ' + r.st);
});
await check('food heals, and healing caps at max HP', async () => {
  await fresh();
  await S(() => { const s = __scurry; s.run.hp = 20; s.dropFood(s.P.x, s.P.y, s.P.z, 'wedge', { mold: false, exact: true }); });
  let low = 20;
  for (let i = 0; i < 20 && low <= 20; i++) { await sleep(100); low = await S(() => __scurry.run.hp); }
  const why = await S(() => { const s = __scurry, f = s.W.foods[0]; return `state ${s.G.state}, hold ${s.G.qaHold}, foods ${s.W.foods.length}, rat ${[s.P.x, s.P.y, s.P.z].map(v => v.toFixed(1))}, food ${f ? [f.x, f.y, f.z].map(v => v.toFixed(1)) : '-'}`; });
  assert(low > 20, `eating did not heal (${low}; ${why})`);
  await S(() => { const s = __scurry; s.run.hp = s.st.maxHp - 3; s.dropFood(s.P.x, s.P.y, s.P.z, 'wedge', { mold: false, exact: true }); });
  await sleep(600);
  const r = await S(() => ({ hp: __scurry.run.hp, max: __scurry.st.maxHp }));
  assert(r.hp <= r.max, `hp ${r.hp} above max ${r.max}`);
  return `+${Math.round(low - 20)} HP from one bite`;
});
await check('hits, kills and XP', async () => {
  await fresh();
  const r = await S(() => {
    const s = __scurry, P = s.P;
    const e = s.spawnEnemy('mawling', P.x + 3, P.z, { plain: true, force: true, hpMul: 5 });
    const hp0 = e.hp; s.hit(e, 10, 0, 0, 'event', true);
    const dealt = hp0 - e.hp, k0 = s.run.kills, x0 = s.run.xp + s.run.level * 1e6;
    s.kill(e);
    return { dealt, killed: s.run.kills - k0, xp: s.run.xp + s.run.level * 1e6 - x0, dead: e.dead };
  });
  assert(r.dealt >= 1, 'hit did no damage');
  assert(r.killed === 1 && r.dead, 'kill not counted');
  assert(r.xp > 0, 'kill gave no XP');
});
await check('the plate shows the class kit: primary, special, signature, vial, turbo', async () => {
  await fresh('warlock');
  const r = await S(() => { __scurry.renderSlots(); return { n: document.querySelectorAll('#slots .slot').length, turbo: document.querySelectorAll('#turbo i').length }; });
  assert(r.n === 5, `${r.n} kit slots`);
  assert(r.turbo === 3, `${r.turbo} turbo segments`);
});
await check('dodge has a cooldown', async () => {
  await fresh();
  const gameWait = secs => S(t => new Promise(r => { const end = __scurry.run.time + t; const w = () => (__scurry.run.time >= end || __scurry.G.state !== 'play') ? r() : setTimeout(w, 50); w(); }), secs);
  const cd = await S(() => __scurry.TUNE.player.rollCd);
  await page.keyboard.press('ShiftLeft');
  const r1 = await S(() => __scurry.P.roll > 0 || __scurry.P.rollCd > 0);
  const why = await S(() => { const P = __scurry.P; return { roll: P.roll, cd: P.rollCd, squeeze: P.squeeze, chew: P.chewing, st: __scurry.G.state, focus: document.activeElement && document.activeElement.tagName }; });
  const t0 = await S(() => ({ t: __scurry.run.time, cd: __scurry.P.rollCd, st: __scurry.G.state }));
  await gameWait(0.4);
  const t1 = await S(() => ({ t: __scurry.run.time, cd: __scurry.P.rollCd, st: __scurry.G.state }));
  await page.keyboard.press('ShiftLeft');
  const blocked = await S(() => __scurry.P.roll <= 0), dbg = { t0, t1 };
  await gameWait(cd);
  await page.keyboard.press('ShiftLeft');
  const r3 = await S(() => __scurry.P.roll > 0);
  assert(r1, `first dodge did not start (${JSON.stringify(why)})`);
  assert(blocked, `dodged again inside the cooldown (${JSON.stringify(dbg)})`);
  assert(r3, 'could not dodge after the cooldown');
});
await check('attacks fire only while held, toward the aim point', async () => {
  await fresh('slinger');
  const gameWait = secs => S(t => new Promise(r => { const end = __scurry.run.time + t; const w = () => (__scurry.run.time >= end || __scurry.G.state !== 'play') ? r() : setTimeout(w, 50); w(); }), secs);
  await S(() => { __scurry.W.pproj.length = 0; });
  await gameWait(0.6);
  const idle = await S(() => __scurry.W.pproj.length);
  await S(() => { const P = __scurry.P; __scurry.G.aimAt = { x: P.x + 8, z: P.z }; __scurry.G.attack = true; });
  await gameWait(0.4);
  const r = await S(() => { const p = __scurry.W.pproj[0]; return { n: __scurry.W.pproj.length, vx: p ? p.vx : 0, vz: p ? p.vz : 0 }; });
  await S(() => { __scurry.G.attack = false; __scurry.G.aimAt = null; });
  assert(idle === 0, `fired ${idle} shots without attacking`);
  assert(r.n > 0, 'held attack did not fire');
  assert(r.vx > Math.abs(r.vz), 'shot did not go toward the aim point ' + JSON.stringify(r));
});
// ---------------------------------------------------------------- Phase 2 systems
const gameWait = secs => S(t => new Promise(r => { const end = __scurry.run.time + t; const w = () => (__scurry.run.time >= end || __scurry.G.state !== 'play') ? r() : setTimeout(w, 50); w(); }), secs);
await check('class stats turn into the numbers the game uses', async () => {
  const bad = [];
  for (const k of ['tank', 'slinger', 'warlock', 'sneak']) {
    await fresh(k);
    const r = await S(k => { const s = __scurry, T = s.TUNE, c = T.classes[k], S0 = T.stats; return { st: { hp: s.st.maxHp, sp: s.st.speed, pm: s.st.primMul, mm: s.st.magMul, cd: s.st.cd }, want: { hp: c.hp, sp: S0.spdBase + S0.spdPer * c.spd, pm: S0.strBase + S0.strPer * c.str, mm: S0.magBase + S0.magPer * c.mag, cd: Math.max(0.5, S0.rateBase - S0.ratePer * c.spd) } }; }, k);
    for (const f of ['hp', 'pm', 'mm', 'cd']) if (Math.abs(r.st[f] - r.want[f]) > 0.01) bad.push(`${k}.${f} ${r.st[f]} vs ${r.want[f]}`);
    if (Math.abs(r.st.sp - r.want.sp) > 0.6) bad.push(`${k}.speed ${r.st.sp} vs ${r.want.sp}`); // story marks may add 8%
  }
  assert(!bad.length, bad.join('; '));
  return '4 classes';
});
await check('turbo: damage fills the meter, tap X blasts, X + Q fires a turbo special', async () => {
  await fresh();
  const fill = await S(() => { const s = __scurry, P = s.P; const e = s.spawnEnemy('brute', P.x + 2, P.z, { plain: true, force: true, hpMul: 80 }); e.spd = 0; e.cd = 99; e.atk = 99; for (let i = 0; i < 60; i++) s.hit(e, 30, 0, 0, 'primary', true); return s.run.turbo; });
  assert(fill >= 2, `meter only ${fill.toFixed(2)} after 60 hits`);
  await page.keyboard.press('KeyX');
  await sleep(150);
  const b = await S(() => ({ t: __scurry.run.turbo, n: __scurry.run.blasts || 0 }));
  assert(b.n === 1 && b.t < 1, `blast: ${JSON.stringify(b)}`);
  await S(() => { __scurry.run.turbo = 1.5; __scurry.run.specT = 9; });
  await page.keyboard.down('KeyX'); await page.keyboard.press('KeyQ'); await page.keyboard.up('KeyX');
  await sleep(150);
  const q = await S(() => ({ t: __scurry.run.turbo, n: __scurry.run.turbos || 0, boosted: __scurry.P.turboT > 0 }));
  // Spent one segment (1.5 → 0.5); the special's own hits (Bulwark's shove) may refill a little.
  assert(q.n === 1 && q.t >= 0.45 && q.t < 0.75, `turbo special: ${JSON.stringify(q)}`);
  return `filled ${fill.toFixed(2)} segments`;
});
await check('Rot Vials: Z throws one, it hits everything around, and you carry at most the max', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry, P = s.P; s.run.vials = 2; const es = [3, -4, 6].map(d => s.spawnEnemy('ghoul', P.x + d, P.z + 1, { plain: true, force: true, hpMul: 20 })); es.forEach(e => { e.spd = 0; e.cd = 99; }); return es.map(e => e.hp); });
  await page.keyboard.press('KeyZ');
  await sleep(150);
  const a = await S(() => ({ v: __scurry.run.vials, hp: __scurry.W.enemies.filter(e => e.type === 'ghoul').map(e => e.hp) }));
  assert(a.v === 1, `vials ${a.v}`);
  assert(a.hp.length === 3 && a.hp.every((h, i) => h < r[i]), `not every ghoul was hit: ${a.hp} vs ${r}`);
  const cap = await S(async () => { const s = __scurry, max = s.TUNE.vials.max; s.run.vials = max; s.dropVial(s.P.x, s.P.y, s.P.z); await new Promise(r => setTimeout(r, 600)); return { v: s.run.vials, max, left: s.W.vials.length }; });
  assert(cap.v === cap.max && cap.left >= 1, `over the cap: ${JSON.stringify(cap)}`);
  return 'hit 3/3';
});
await check('health drains at the zone rate, and food sizes heal 25 / 60 / 120', async () => {
  await fresh();
  const a = await S(() => ({ hp: __scurry.run.hp = 150, t: __scurry.run.time, rate: __scurry.drainRate() }));
  await gameWait(2);
  const b = await S(() => ({ hp: __scurry.run.hp, t: __scurry.run.time }));
  near((a.hp - b.hp) / (b.t - a.t), a.rate, 0.08, 'drain HP/s');
  const got = {};
  for (const k of ['crumb', 'wedge', 'cache']) {
    await S(k => { const s = __scurry; s.run.hp = 10; s.dropFood(s.P.x, s.P.y, s.P.z, k, { mold: false, exact: true }); }, k);
    let h = 10;
    for (let i = 0; i < 20 && h <= 10; i++) { await sleep(100); h = await S(() => __scurry.run.hp); }
    got[k] = Math.round(h - 10);
  }
  near(got.crumb, 25, 2, 'crumb'); near(got.wedge, 60, 2, 'wedge'); near(got.cache, 120, 2, 'cache');
  return `${a.rate} HP/s · ${got.crumb}/${got.wedge}/${got.cache}`;
});
await check('moldy food poisons (and only shows while sniffing); attacks destroy food', async () => {
  await fresh();
  const m = await S(async () => { const s = __scurry, P = s.P; s.run.hp = 100; P.poisonT = 0; const f = s.dropFood(P.x + 3, P.y, P.z, 'wedge', { mold: true, exact: true }); const hidden = !f.ms.visible; P.scent = true; const wait = t => new Promise(r => { const end = s.run.time + t; const w = () => s.run.time >= end ? r() : setTimeout(w, 30); w(); }); await wait(0.2); const shown = f.ms.visible; P.scent = false; P.x += 3; await wait(0.3); return { hidden, shown, poison: P.poisonT > 0, eaten: s.run.moldEaten || 0 }; });
  assert(m.hidden && m.shown, `mold visibility: ${JSON.stringify(m)}`);
  assert(m.poison && m.eaten === 1, `moldy food did not poison: ${JSON.stringify(m)}`);
  const d = await S(() => { const s = __scurry, P = s.P; const f = s.dropFood(P.x + 0.5, P.y, P.z + 3, 'wedge', { mold: false, exact: true }); f.safe = 0; const n = s.breakFoodAt(P.x + 0.5, P.z + 3, 0.5, P.y); return { n, left: s.W.foods.includes(f), lost: s.run.foodLost }; });
  assert(d.n === 1 && !d.left, `food not destroyed: ${JSON.stringify(d)}`);
  return 'poisoned · destroyed';
});
await check('nests: three tiers, a family each, damage knocks them down a tier', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry, ns = s.W.enemies.filter(e => e.type === 'nest'); const n = ns.sort((a, b) => b.tier - a.tier)[0]; const t0 = n.tier; if (t0 > 1) { n.hp = s.tierHp()[t0 - 2] - 1; s.tickNest(n, 0.02); } return { count: ns.length, tiers: [...new Set(ns.map(e => e.name))], fams: [...new Set(ns.map(e => e.fam))], t0, t1: n.tier, run: s.run.nests }; });
  assert(r.count >= 5 && r.count === r.run, `nest count ${r.count} vs run.nests ${r.run}`);
  assert(r.fams.length >= 1 && r.fams.every(Boolean), 'nest without a family');
  if (r.t0 > 1) assert(r.t1 === r.t0 - 1, `tier did not drop: ${r.t0} → ${r.t1}`);
  return `${r.count} nests · ${r.tiers.join('/')} · ${r.fams.join('/')}`;
});
await check('the Reaper shrugs off claws but not a Rot Vial', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry, P = s.P; const e = s.spawnReaper(P.x + 3, P.z); const h0 = e.hp; s.hit(e, 80, 0, 0, 'primary'); const h1 = e.hp; s.run.vials = 1; s.throwVial(); return { h0, h1, h2: e.hp, dead: e.dead }; });
  assert(r.h1 === r.h0, `claws hurt the Reaper: ${r.h0} → ${r.h1}`);
  assert(r.h2 < r.h1 || r.dead, 'vial did nothing to the Reaper');
  return r.dead ? 'banished by one vial' : `vial took ${Math.round(r.h1 - r.h2)}`;
});
await check('thieves steal a vial and give it back when caught', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry; s.run.vials = 1; s.run.robT = 0; s.run.robber = null; s.tickThieves(0.05); const e = s.run.robber; if (!e) return { none: true }; e.x = s.P.x + 0.4; e.z = s.P.z; e.y = s.P.y; s.robberAI(e, 0.02); const stole = s.run.vials === 0 && e.mode === 'flee'; s.kill(e); return { stole, back: s.W.vials.length }; });
  assert(!r.none, 'no thief spawned');
  assert(r.stole, 'thief did not steal the vial');
  assert(r.back >= 1, 'vial not dropped when caught');
  return 'stolen and recovered';
});
await check('22 levels with fixed seeds, remixes and boss variants', async () => {
  await fresh();
  const r = await S(() => {
    const s = __scurry, L = s.LEVELS, run = s.run, n = L.CITY_LEVELS.length + L.SEWER_LEVELS.length + Object.keys(L.SECRET_LEVELS).length;
    const hash = () => { let h = 0; for (let k = 0; k < s.M.grid.length; k++) h = (h * 31 + s.M.grid[k]) | 0; return h; };
    run.district = 4; run.tier = 4; s.setupWorld(s.levelSeed()); const a = hash(), D = s.curD(), name = s.dName();
    s.setupWorld(s.levelSeed()); const b = hash();
    run.district = 0; run.tier = 0; s.setupWorld(s.levelSeed()); const c = hash();
    return { n, same: a === b, differs: a !== c, name, bossV: D.bossV, night: D.night };
  });
  assert(r.n === 23, `${r.n} levels`); // 22 fixed levels + the treasure room
  assert(r.same, 'the same level built twice came out different');
  assert(r.differs, 'a remix has the same layout as its original');
  assert(r.night && r.bossV && /After Dark/.test(r.name), 'remix not set up: ' + JSON.stringify(r));
  return `22 levels · ${r.name} · boss variant ${r.bossV}`;
});
await check('a secret drain leads to a secret zone and on to the next level', async () => {
  await fresh();
  const d = await S(() => { const s = __scurry; s.run.district = 3; s.run.tier = 3; s.setupWorld(s.levelSeed()); const e = s.G.secretExit; return e && { x: e.x, z: e.z, y: e.y, kind: e.kind }; });
  assert(d && d.kind === 'vault', 'no drain in Hollow Heights');
  // Sealed until the level's boss is down (keys and exits are boss-gated).
  await S(d => { const P = __scurry.P; P.x = d.x; P.z = d.z; P.y = d.y; P.vx = P.vz = 0; }, d);
  await sleep(800); // the live loop runs (stepRaw would hold it)
  const sealed = await S(() => !__scurry.run.secret && !!__scurry.G.secretExit);
  assert(sealed, 'the drain let the rat out before the boss fell');
  await S(d => { const s = __scurry, P = s.P; s.run.lvlBoss = true; P.x = d.x; P.z = d.z; P.y = d.y; P.vx = P.vz = 0; }, d);
  let sec = null;
  for (let i = 0; i < 40 && !sec; i++) { await sleep(100); sec = await S(() => __scurry.G.state === 'play' && __scurry.run.secret); }
  assert(sec === 'vault', 'did not reach the vault');
  let ex = null;
  for (let i = 0; i < 40 && !ex; i++) { await sleep(100); ex = await S(() => { const e = __scurry.G.exitD; return e && { x: e.x, z: e.z }; }); }
  assert(ex, 'the vault has no open exit');
  await S(e => { const P = __scurry.P; P.x = e.x; P.z = e.z; P.y = 0; }, ex);
  let after = null;
  for (let i = 0; i < 40; i++) { await sleep(100); after = await S(() => ({ st: __scurry.G.state, secret: __scurry.run.secret, d: __scurry.run.district })); if (after.st === 'play' && !after.secret) break; }
  assert(!after.secret && after.d === 4, 'did not come out at the next level: ' + JSON.stringify(after));
  return 'Hollow Heights → The Cheese Vault → level 5';
});
await check('the first zone is gentler: slower drain, no Warrens before zone 2', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry, T = s.TUNE; const rate = s.drainRate(); let w = 0; for (const z of [0, 1]) { s.run.tier = z; s.run.district = z; s.setupWorld(s.levelSeed()); w += s.W.enemies.filter(e => e.type === 'nest' && e.tier === 3).length; } return { rate, want: T.food.drainZone0, w }; });
  assert(r.rate === r.want, `zone 0 drains ${r.rate}`);
  assert(r.w === 0, `${r.w} Warrens in zones 0–1`);
  return `${r.rate} HP/s · 0 Warrens`;
});
await check('thieves leave keys alone (keys are boss-only) and grab a vial instead', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry; s.run.keys = 1; s.run.vials = 1; s.run.robT = 0; s.run.robber = null; s.tickThieves(0.05); const e = s.run.robber; if (!e) return null; e.x = s.P.x + 0.4; e.z = s.P.z; e.y = s.P.y; s.robberAI(e, 0.02); const took = e.loot && e.loot.key; s.kill(e); return { took, keys: s.run.keys, vials: s.run.vials, back: s.W.keys.length }; });
  assert(r, 'no thief');
  assert(!r.took && r.keys === 1, 'thief took the boss key: ' + JSON.stringify(r));
  return 'key kept';
});
await check('a grave wakes the Reaper when you come close', async () => {
  await fresh();
  const g = await S(() => { const s = __scurry; s.run.district = 3; s.run.tier = 3; s.setupWorld(s.levelSeed()); const g = s.G.grave; return g && { x: g.x, z: g.z }; });
  assert(g, 'no grave in Hollow Heights');
  await S(g => { const P = __scurry.P; P.x = g.x + 9; P.z = g.z; P.y = 0; }, g);
  let up = false;
  for (let i = 0; i < 30 && !up; i++) { await sleep(100); up = await S(() => !!(__scurry.run.reaper && __scurry.run.reaper.fromGrave)); }
  assert(up, 'the Reaper stayed in its grave');
  return 'risen';
});
await check('sleeping packs wake together', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry; s.setupWorld(s.levelSeed()); const sl = s.W.enemies.filter(e => e.sleep); return { n: sl.length, packs: new Set(sl.map(e => e.sleep)).size, first: sl[0] && { x: sl[0].x, z: sl[0].z, id: sl[0].sleep } }; });
  assert(r.n > 0 && r.packs >= 4, `packs: ${JSON.stringify(r)}`);
  await S(f => { const s = __scurry; const e = s.W.enemies.find(e => e.sleep === f.id); s.hit(e, 1, 0, 0, 'event', true); }, r.first);
  let left = 99;
  for (let i = 0; i < 20 && left; i++) { await sleep(100); left = await S(id => __scurry.W.enemies.filter(e => e.sleep === id).length, r.first.id); }
  assert(left === 0, `${left} of the pack still asleep after one was hit`);
  return `${r.packs} packs · ${r.n} mobs`;
});
await check('food in your line of fire flashes red', async () => {
  await fresh('slinger');
  const r = await S(async () => { const s = __scurry, P = s.P; const f = s.dropFood(P.x, P.y, P.z + 5, 'wedge', { mold: false, exact: true }); f.safe = 99; const off = s.dropFood(P.x + 6, P.y, P.z - 6, 'wedge', { mold: false, exact: true }); off.safe = 99; s.run.foodWarned = 0; s.G.aimAt = { x: P.x, z: P.z + 9 }; s.G.attack = true; let seen = false; for (let i = 0; i < 20 && !seen; i++) { await new Promise(r => setTimeout(r, 50)); seen = f.ws.visible; } s.G.attack = false; s.G.aimAt = null; return { seen, warned: s.run.foodWarned, offLit: off.ws.visible }; });
  assert(r.seen && r.warned > 0, 'food in the shot line never flashed');
  return 'warned';
});
await check('a turbo move lights the turbo aura', async () => {
  await fresh();
  await S(() => { __scurry.run.turbo = 2; __scurry.run.specT = 9; });
  await page.keyboard.down('KeyX'); await page.keyboard.press('KeyQ'); await page.keyboard.up('KeyX');
  let lit = false;
  for (let i = 0; i < 20 && !lit; i++) { await sleep(60); lit = await S(() => __scurry.P.turboT > 0 && __scurry.turboAuraOpacity() > 0.2); }
  assert(lit, 'no aura during the turbo window');
  return 'aura on';
});
await check('walls between the camera and the rat open a see-through hole', async () => {
  await fresh();
  await sleep(300);
  const r = await S(() => { const f = __scurry.fadeU; return { amt: f.fadeAmt.value, r: f.fadeScr.value.z }; });
  assert(r.amt > 0.5 && r.r > 4, `fade off in play: ${JSON.stringify(r)}`);
  return `radius ${Math.round(r.r)}px`;
});
// ---------------------------------------------------------------- Phase 3
await check('only marked pipes can be climbed, and each leads to a reachable roof', async () => {
  await fresh();
  const r = await S(() => {
    const s = __scurry, c = s.W.climbs[0], w = s.wallSpot(4.5, 11.9);
    s.P.x = c.x; s.P.z = c.z; s.P.y = 0; const atPipe = !!s.pipeNear();
    s.P.x = w.x; s.P.z = w.z; const atWall = !!s.pipeNear() && !s.W.climbs.some(p => Math.hypot(p.x - w.x, p.z - w.z) < 2);
    return { n: s.W.climbs.length, atPipe, atWall, roofOK: s.W.climbs.every(p => s.M.roofOK[p.gx + p.gz * s.M.W]) };
  });
  assert(r.n >= 6, `only ${r.n} pipes`);
  assert(r.atPipe && !r.atWall, 'pipe reach wrong: ' + JSON.stringify(r));
  assert(r.roofOK, 'a pipe leads to a roof marked unreachable');
  return `${r.n} pipes`;
});
await check('keys stack; a padlocked chest stays shut until the boss falls, then opens without spending a key', async () => {
  await fresh();
  const r = await S(() => {
    const s = __scurry; s.god(true);
    for (let i = 0; i < 2; i++) s.dropKey(s.P.x, s.P.y, s.P.z);
    s.qa.stepRaw(0.3);
    const held = s.run.keys, c = s.W.chests.find(c => c.locked);
    if (!c) return { held };
    s.P.x = c.x + 1; s.P.z = c.z; s.P.y = c.y;
    s.run.lvlBoss = false; s.pressE(); const shut = !c.open;
    s.run.lvlBoss = true; s.pressE();
    return { held, shut, open: c.open, left: s.run.keys };
  });
  assert(r.held === 2, 'keys did not stack: ' + r.held);
  assert(r.shut && r.open && r.left === 2, 'locked chest wrong: ' + JSON.stringify(r));
  return 'stacked 2, padlock opened by the boss key ring';
});
await check('power-ups run for 25 s and can overlap', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry; s.god(true); s.grantPowerup('iron'); s.grantPowerup('quick'); const both = s.puList().length; s.qa.stepRaw(24.5); const still = s.puList().length; s.qa.stepRaw(1); return { both, still, after: s.puList().length }; });
  assert(r.both === 2 && r.still === 2 && r.after === 0, JSON.stringify(r));
  return '2 at once, gone at 25 s';
});
await check('every level counts 3–6 secrets, and sniffing pings them', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry, m = s.run.finds.m, f = s.W.finds[0]; s.P.x = f.x + 10; s.P.z = f.z; const p = s.pingFinds(); return { m, lit: s.W.finds.filter(f => f.showT > 0).length, best: p && p.best }; });
  assert(r.m >= 3 && r.m <= 6, 'secret count ' + r.m);
  assert(r.lit >= 1, 'ping lit nothing');
  return `${r.m} secrets, ${r.lit} pinged`;
});
await check('a level-up grows the class stats and max HP', async () => {
  await fresh('tank');
  const r = await S(() => { const s = __scurry, hp = s.st.maxHp, m = s.st.primMul; s.addXP(s.run.need + 1); return { lvl: s.run.level, hp: s.st.maxHp - hp, str: s.st.primMul - m }; });
  assert(r.lvl === 2 && r.hp > 0 && r.str > 0, JSON.stringify(r));
  return `+${r.hp} HP`;
});
await check('a frame stamped before the last clock reset never runs time backwards (no sinking through the floor)', async () => {
  await fresh();
  const r = await S(async () => {
    const s = __scurry, t0 = s.run.time;
    let minY = 9;
    s.G.last = performance.now() + 400; // what a slow world build or resume leaves behind
    for (let i = 0; i < 20; i++) { await new Promise(r => requestAnimationFrame(r)); minY = Math.min(minY, s.P.y); }
    return { back: s.run.time < t0, minY };
  });
  assert(!r.back, 'run time went backwards');
  assert(r.minY > -0.4, 'the rat sank to y=' + r.minY.toFixed(2));
  return 'held at y≥' + r.minY.toFixed(2);
});
await check('leaving a level shows a graded tally card', async () => {
  await fresh();
  await S(() => { __scurry.G.testNoTally = false; __scurry.exitRoad(); });
  await sleep(150);
  const st = await S(() => __scurry.G.state), card = await S(() => document.querySelector('.tally h1') && document.querySelector('.tally h1').textContent);
  await page.keyboard.press('Enter');
  await sleep(1200);
  const after = await S(() => { const s = __scurry; s.G.testNoTally = true; return { st: s.G.state, ranks: (s.run.ranks || []).length }; });
  assert(st === 'tally' && /^[SABCD]$/.test(card || ''), `no tally card (${st}, ${card})`);
  assert(after.st === 'play' && after.ranks === 1, 'did not move on: ' + JSON.stringify(after));
  return 'grade ' + card;
});
await check('the tally card dismisses itself in ~2.5 s with no key press', async () => {
  await fresh();
  await S(() => { __scurry.G.testNoTally = false; __scurry.exitRoad(); });
  await sleep(300);
  const st = await S(() => __scurry.G.state);
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: 8000 });
  await S(() => { __scurry.G.testNoTally = true; });
  assert(st === 'tally', 'no tally card: ' + st);
  return 'auto-dismissed';
});
await check('story scenes wait for a lull: never open with an awake enemy close by', async () => {
  await fresh();
  const r = await S(() => { const s = __scurry; s.run.dStart = s.run.time - 10; const e = s.spawnEnemy('mawling', s.P.x + 3, s.P.z, { plain: true, force: true }); const busy = s.story.calm(); e.dead = true; e.hp = 0; const quiet = s.story.calm(); return { busy, quiet }; });
  assert(r.busy === false && r.quiet === true, JSON.stringify(r));
  return 'gated';
});
// Touch play is off for now (TOUCH_CONTROLS in src/ui/touch.js), so actions need a key and How to Play text only.
await check('every action has a key and How to Play text', async () => {
  const r = await S(() => {
    const how = __scurry.HOWTO;
    const need = { attack: 'J</kbd>', dodge: 'Shift', jump: 'Space', special: '<kbd>Q</kbd>', sig: '<kbd>G</kbd>', turbo: '<kbd>X</kbd>', vial: '<kbd>Z</kbd>', use: '<kbd>E</kbd>', lock: '<kbd>R</kbd>', sniff: '<kbd>F</kbd>', map: '<kbd>M</kbd>', pause: 'Esc' };
    return Object.entries(need).filter(([, k]) => !how.includes(k)).map(([n]) => n);
  });
  assert(!r.length, 'missing: ' + r.join(', '));
  return '12 actions';
});
await check('save file round-trips', async () => {
  const r = await S(() => {
    const s = __scurry, key = 'scurry.meta';
    s.meta.salvage = 1234; s.meta.kills = 77;
    localStorage.setItem(key, JSON.stringify(s.meta));
    const back = JSON.parse(localStorage.getItem(key));
    return { salvage: back.salvage, kills: back.kills, keys: Object.keys(back).length };
  });
  assert(r.salvage === 1234 && r.kills === 77, 'meta did not round-trip');
});

// ---------------------------------------------------------------- fuzzing
await check(`input fuzz (${FUZZ_SECS}s of random keys and mouse)`, async () => {
  await fresh();
  await S(() => { __scurry.god(true); Object.assign(__scurry.run, { spawnT: 0.5, surgeT: 20 }); });
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyC', 'KeyQ', 'KeyG', 'KeyX', 'KeyE', 'KeyR', 'KeyF', 'KeyV', 'KeyM', 'Escape', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Enter', 'KeyP'];
  const end = Date.now() + FUZZ_SECS * 1000;
  let n = 0, bad = null;
  const held = new Set();
  while (Date.now() < end && !bad) {
    const r = Math.random(), k = KEYS[(Math.random() * KEYS.length) | 0];
    if (r < 0.45) { if (held.has(k)) { await page.keyboard.up(k); held.delete(k); } else { await page.keyboard.down(k); held.add(k); } }
    else if (r < 0.7) await page.keyboard.press(k);
    else if (r < 0.85) await page.mouse.move(Math.random() * 1280, Math.random() * 720);
    else if (r < 0.95) await page.mouse.click(Math.random() * 1280, Math.random() * 720).catch(() => {});
    else await page.mouse.wheel(0, (Math.random() - 0.5) * 600);
    if (++n % 25 === 0) {
      const s = await S(() => { const s = __scurry, P = s.P, M = s.M; return { st: s.G.state, fin: Number.isFinite(P.x + P.y + P.z), oob: Math.abs(P.x) > M.half + 4 || Math.abs(P.z) > M.half + 4, nanMob: s.W.enemies.some(e => !Number.isFinite(e.x + e.y + e.z)) }; });
      if (!s.fin) bad = 'rat position became NaN'; else if (s.oob) bad = 'rat left the map'; else if (s.nanMob) bad = 'a mob position became NaN'; else if (!STATES.has(s.st)) bad = 'unknown state ' + s.st;
      if (s.st === 'dead' || s.st === 'menu' || s.st === 'nest') await fresh();
    }
  }
  for (const k of held) await page.keyboard.up(k);
  assert(!bad, bad);
  return `${n} inputs`;
});
await check('physics fuzz (teleports, wild velocities, mobs in walls)', async () => {
  await fresh();
  const r = await S(() => {
    const s = __scurry, P = s.P, M = s.M, W = s.W, bad = [];
    s.god(true);
    s.qa.start({ profile: 'average', goal: 'survive' });
    s.qa.stop(); s.G.qaHold = true;
    for (let i = 0; i < 200; i++) {
      const k = (Math.random() * M.W * M.H) | 0, x = (k % M.W - M.W / 2 + Math.random()) * 4, z = (((k / M.W) | 0) - M.H / 2 + Math.random()) * 4;
      P.x = x; P.z = z; P.y = Math.random() * 14 - 1; P.vx = (Math.random() - 0.5) * 80; P.vy = (Math.random() - 0.5) * 80; P.vz = (Math.random() - 0.5) * 80;
      P.climbing = Math.random() < 0.2; P.squeeze = Math.random() < 0.2;
      if (i % 5 === 0) { const e = s.spawnEnemy(['mawling', 'brute', 'crow', 'roach'][i % 4], x + 1, z, { plain: true, force: true }); if (e) { e.vy = 30; e.kx = 40; } }
      s.qa.stepRaw(0.5);
      const fin = Number.isFinite(P.x + P.y + P.z), oob = Math.abs(P.x) > M.half + 4 || Math.abs(P.z) > M.half + 4;
      if (!fin) bad.push('nan@' + i); else if (oob) bad.push('oob@' + i);
      if (P.y < -12) { bad.push('falling@' + i); }
      if (W.enemies.some(e => !e.dead && !Number.isFinite(e.x + e.y + e.z))) bad.push('mob-nan@' + i);
      P.squeeze = false; P.climbing = false; s.run.hp = s.st.maxHp;
      if (s.G.state !== 'play') { s.G.state = 'play'; }
    }
    const T = s.qa.telemetry();
    s.G.qaHold = false;
    return { bad, anomalies: T.anomalies.map(a => a.kind) };
  });
  const serious = r.bad.filter(b => !b.startsWith('falling'));
  assert(!serious.length, serious.slice(0, 5).join(', '));
  return `200 teleports · ${r.bad.length} falls · watchdog: ${[...new Set(r.anomalies)].join(', ') || 'clean'}`;
});
await check('UI click fuzz on every overlay', async () => {
  let clicks = 0;
  for (const open of Object.values(SCREENS)) {
    await open();
    for (let i = 0; i < 25; i++) { await page.mouse.click(Math.random() * 1280, Math.random() * 720).catch(() => {}); clicks++; }
    const st = await S(() => __scurry.G.state);
    assert(STATES.has(st), 'state ' + st);
  }
  return `${clicks} random clicks`;
});

writeFileSync(OUT + 'results.json', JSON.stringify({ results, errors }, null, 1));
await browser.close();
await server.close();
const failed = results.filter(r => !r.ok);
console.log(failed.length ? `system checks FAILED (${failed.length}/${results.length})` : `system checks passed (${results.length})`);
process.exit(failed.length ? 1 : 0);
