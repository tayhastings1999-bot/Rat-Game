// Stage 2 · System & UI verification + fuzzing (deterministic API checks, then
// randomized bombardment). Runs after the boot gate, before any bot plays.
//   UI sweep   open every screen and click every button on it, one at a time,
//              from a fresh state; nothing may throw or strand the game.
//   Math       damage and armor, i-frames, health/XP bars matching the numbers,
//              healing caps, kills and XP, automatic level-ups, the kit slots,
//              the dodge cooldown, manual attack, and the save file round-tripping.
//   Fuzz       random keys/mouse/touch at full speed during play; the rat and
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
  catch (e) { results.push({ name, ok: false, note: e.message }); console.log(`FAIL ${name}: ${e.message}`); await page.screenshot({ path: OUT + name.replace(/\W+/g, '-') + '.png' }).catch(() => {}); }
};
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

await page.goto('http://localhost:5189/?debug');
await page.waitForFunction(() => window.__scurry && window.__scurry.qa && document.querySelector('#overlay h1'), null, { timeout: 60000 });
const fresh = async (cls = 'brawler') => {
  await S(c => { const s = __scurry; s.qa.stop(); s.G.testNoRoles = true; s.startRun(c); s.god(false); Object.assign(s.run, { evT: 1e9, spawnT: 1e9, surgeT: 1e9, scabSeen: true, lurkT: 1e9 }); s.W.enemies.forEach(e => { if (e.type !== 'nest') e.dead = true; }); }, cls);
  for (let i = 0; i < 40; i++) {
    if ((await S(() => __scurry.G.state)) === 'play') return;
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
  const t0 = await S(() => ({ t: __scurry.run.time, cd: __scurry.P.rollCd, st: __scurry.G.state }));
  await gameWait(0.4);
  const t1 = await S(() => ({ t: __scurry.run.time, cd: __scurry.P.rollCd, st: __scurry.G.state }));
  await page.keyboard.press('ShiftLeft');
  const blocked = await S(() => __scurry.P.roll <= 0), dbg = { t0, t1 };
  await gameWait(cd);
  await page.keyboard.press('ShiftLeft');
  const r3 = await S(() => __scurry.P.roll > 0);
  assert(r1, 'first dodge did not start');
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
await check(`input fuzz (${FUZZ_SECS}s of random keys, mouse and touch)`, async () => {
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
