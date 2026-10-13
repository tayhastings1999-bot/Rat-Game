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
// Slow CI runners (software GL) can stall mid-check, so tests wait on game
// state, never on wall-clock sleeps alone.
const SLOW = 2; // timeout multiplier for CI
const T = ms => ms * SLOW;
/** Back to 'play' (from paused), polling the state. */
async function toPlay(ms = T(20000)) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const st = await S(() => __scurry.G.state);
    if (st === 'play') return;
    if (st === 'paused') await page.click('#resumeBtn').catch(() => {});
    await page.waitForTimeout(150);
  }
  throw new Error('never returned to play: ' + await S(() => __scurry.G.state));
}
/** Poll fn in the page until true, resuming if something paused the game. */
async function until(fn, ms = T(20000)) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return;
    const st = await S(() => __scurry.G.state);
    if (st === 'paused') await page.click('#resumeBtn').catch(() => {});
    await page.waitForTimeout(200);
  }
  throw new Error('timed out waiting for ' + String(fn).slice(0, 80));
}
/** Wait until the game has simulated at least dt more seconds of run time. */
async function simFor(dt, ms = T(20000)) {
  const t0 = await S(() => __scurry.run.time);
  await page.waitForFunction(([t0, dt]) => __scurry.run.time >= t0 + dt || __scurry.G.state !== 'play', [t0, dt], { timeout: ms });
}

await check('page loads and the menu renders', async () => {
  await page.goto('http://localhost:5190/?debug', { waitUntil: 'domcontentloaded', timeout: T(30000) });
  await page.waitForSelector('#overlay h1', { timeout: T(20000) });
  const title = await page.textContent('#overlay h1');
  if (!/Scurry/i.test(title)) throw new Error('menu title is ' + title);
  await page.waitForFunction(() => window.__scurry, null, { timeout: T(15000) });
});
await check('save slot screen lists every slot', async () => {
  const n = await page.locator('[data-slot]').count();
  if (n !== 3) throw new Error(`${n} slots`);
  if ((await S(() => __scurry.G.state)) !== 'slots') throw new Error('not on the slot screen');
});
await check('picking a slot opens the Nest with its shop', async () => {
  await page.click('[data-slot="1"]');
  await page.waitForSelector('.card[data-k]', { timeout: T(5000) });
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
  await page.click('[data-buy="cheese"]');
  const g1 = await S(() => __scurry.meta.salvage), back = await S(() => __scurry.shop.sellPrice('cheese')), paid = await S(() => Math.round(__scurry.TUNE.shop.goldPerLevel * 0.15 / 5) * 5);
  if (back !== Math.floor(paid * 0.75)) throw new Error(`sell price ${back} for ${paid}`);
  await page.click('[data-sell="cheese"]');
  if ((await S(() => __scurry.meta.salvage)) !== g1 + back || (await S(() => __scurry.shop.rank('cheese'))) !== 0) throw new Error('sell-back failed');
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
  const ks = await page.$$eval('.card[data-k]', els => els.map(e => e.dataset.k).join(','));
  if (n !== 4 || ks !== 'tank,slinger,warlock,sneak') throw new Error(`${n} class cards: ${ks}`);
});
await check('class unlock hook: secret rats stay hidden, locked rats show locked and cannot start', async () => {
  const r = await S(() => {
    const s = __scurry, C = s.CLASSES;
    C.testrat = { ...C.tank, name: 'Test Rat', unlock: { req: () => false, hint: 'Find the thing' }, secret: true };
    s.renderMenu();
    const hidden = !document.querySelector('[data-locked="testrat"],[data-k="testrat"]');
    C.testrat.secret = false; s.renderMenu();
    const locked = !!document.querySelector('.card.locked[data-locked="testrat"]') && !document.querySelector('[data-k="testrat"]');
    const ran = s.liveClass('testrat');
    delete C.testrat; s.renderMenu();
    return { hidden, locked, ran };
  });
  if (!r.hidden || !r.locked || r.ran !== 'tank') throw new Error(JSON.stringify(r));
  await page.waitForSelector('.card[data-k="tank"]');
});
await check('realm hub: pick any reached city/sewer level; sewer runs stay underground; Continue resumes', async () => {
  const r = await S(() => {
    const s = __scurry, m = s.meta, keep = { d: m.maxDistrict, w: m.maxSewer, pack: JSON.stringify(m.pack || {}) };
    m.maxDistrict = 2; m.maxSewer = 1; delete m.cont; s.renderMenu();
    const city = document.querySelectorAll('#realmCity [data-realm]').length, sewer = document.querySelectorAll('#realmSewer [data-realm]').length;
    document.querySelector('[data-realm="sewer:1"]').click();
    document.querySelector('.card[data-k="tank"]').click();
    const at = { layer: s.run.layer, idx: s.run.sewerIdx, realm: s.run.realm, cont: !!m.cont };
    s.run.level = 7; s.checkpoint(); s.menu();
    const btn = !!document.getElementById('contBtn');
    document.getElementById('contBtn').click();
    const back = { layer: s.run.layer, idx: s.run.sewerIdx, level: s.run.level };
    s.menu(); delete m.cont; delete m.startAt; m.maxDistrict = keep.d; m.maxSewer = keep.w; m.pack = JSON.parse(keep.pack); s.saveMeta(); s.renderMenu();
    return { city, sewer, at, btn, back };
  });
  if (r.city !== 3 || r.sewer !== 2 || r.at.layer !== 'sewer' || r.at.idx !== 1 || r.at.realm !== 'sewer' || !r.at.cont || !r.btn || r.back.layer !== 'sewer' || r.back.level !== 7) throw new Error(JSON.stringify(r));
  await page.waitForSelector('.card[data-k="tank"]');
});
await check('start a run from the menu', async () => {
  await page.click('.card[data-k="tank"]');
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: T(15000) });
  if ((await S(() => __scurry.M.kind)) !== 'city') throw new Error('not in the city');
  const u = await S(() => ({ hp: __scurry.st.maxHp, base: __scurry.TUNE.classes.tank.hp, add: __scurry.TUNE.shop.hpPer, vials: __scurry.run.vials, v0: __scurry.TUNE.vials.start }));
  if (u.hp !== u.base + u.add) throw new Error(`max HP ${u.hp}, wanted ${u.base + u.add}`);
  if (u.vials !== u.v0 + 1) throw new Error(`vials ${u.vials}`);
  if (Object.keys(await S(() => __scurry.readSlot(1).meta.pack)).length) throw new Error('supplies were not used up');
});
await check('the game loop advances and draws', async () => {
  const t0 = await S(() => __scurry.run.time);
  await simFor(0.5);
  const s = await S(() => ({ t: __scurry.run.time, x: __scurry.P.x, ok: Number.isFinite(__scurry.P.x + __scurry.P.y + __scurry.P.z), calls: __scurry.renderer.info.render.calls }));
  if (!(s.t > t0)) throw new Error('run time did not advance');
  if (!s.ok) throw new Error('rat position is not finite');
  if (!s.calls) throw new Error('nothing drawn');
  const png = await page.screenshot();
  if (png.length < 20000) throw new Error('screen looks blank');
});
await check('pause and resume', async () => {
  // A slow runner may have levelled up by now: pick upgrades until back in play.
  await toPlay();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => __scurry.G.state === 'paused', null, { timeout: T(5000) });
  await page.click('#resumeBtn');
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: T(5000) });
});
await check('single player: a gamepad moves the rat and Start pauses', async () => {
  await toPlay();
  const p0 = await S(() => ({ x: __scurry.P.x, z: __scurry.P.z }));
  await S(() => { __scurry.fakePads[0] = { axes: [0, -1, 0, 0], buttons: [] }; });
  await until(`Math.hypot(__scurry.P.x - ${p0.x}, __scurry.P.z - ${p0.z}) >= 0.5`, T(15000));
  await S(() => { __scurry.fakePads[0].axes = [0, 0, 0, 0]; });
  await toPlay();
  // Hold Start until the game sees it (a slow frame can miss a short tap), then release.
  await S(() => { __scurry.fakePads[0].buttons = []; __scurry.fakePads[0].buttons[9] = { pressed: true }; });
  await page.waitForFunction(() => __scurry.G.state === 'paused', null, { timeout: T(10000) });
  await S(() => { __scurry.fakePads[0].buttons[9] = { pressed: false }; });
  await page.waitForTimeout(300); // let the menu poll the release edge
  await S(() => { __scurry.fakePads[0].buttons[9] = { pressed: true }; });
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: T(10000) });
  await S(() => { __scurry.fakePads[0].buttons[9] = { pressed: false }; delete __scurry.fakePads[0]; });
});
await check('held flasks show on the HUD, cycle with B and uncork with V', async () => {
  await toPlay();
  if (!(await page.locator('#slots .slot.flask').count())) throw new Error('no flask slot on the HUD');
  const held = await S(() => Object.keys(__scurry.run.flasks).filter(k => __scurry.run.flasks[k] > 0));
  if (held.length < 2) throw new Error('need two flask types held, have ' + held);
  await toPlay(); // B only works in play
  const a = await S(() => __scurry.shop.selFlask());
  await page.keyboard.press('KeyB');
  await page.waitForFunction(a => __scurry.shop.selFlask() !== a, a, { timeout: T(3000) }).catch(() => {});
  const b = await S(() => __scurry.shop.selFlask());
  if (!a || !b || a === b) throw new Error(`cycle ${a} -> ${b}`);
  await toPlay(); await page.keyboard.press('KeyV');
  const r = await page.evaluate(k => ({ on: __scurry.puOn(k), left: __scurry.run.flasks[k] }), b);
  if (!r.on || r.left !== 0) throw new Error('use ' + JSON.stringify(r));
  await toPlay(); await page.keyboard.press('KeyV'); // cork it: the rest of the timer is saved
  const c = await page.evaluate(k => ({ on: __scurry.puOn(k), left: __scurry.run.flaskT[k] }), b);
  if (c.on || !(c.left > 0)) throw new Error('cork ' + JSON.stringify(c));
  await toPlay(); await page.keyboard.press('KeyV'); // uncork where it left off
  if (!(await page.evaluate(k => __scurry.puOn(k), b))) throw new Error('resume failed');
});
await check('a Second Tail cheats death once', async () => {
  await S(() => { __scurry.run.tails = 1; __scurry.run.hp = 0; __scurry.die(); });
  const r = await S(() => ({ st: __scurry.G.state, hp: __scurry.run.hp, tails: __scurry.run.tails }));
  if (r.st === 'dead' || !(r.hp > 0) || r.tails !== 0) throw new Error(JSON.stringify(r));
});
await check('packed cheese is eaten when the drain takes HP under the threshold', async () => {
  await toPlay();
  const r = await S(() => { const s = __scurry; s.run.cheese = 1; s.run.hp = s.st.maxHp * s.TUNE.shop.cheeseAt * 0.9; return s.run.hp; });
  await page.waitForFunction(() => __scurry.run.cheese === 0 || __scurry.G.state !== 'play', null, { timeout: T(8000) });
  const after = await S(() => ({ cheese: __scurry.run.cheese, hp: __scurry.run.hp }));
  if (after.cheese !== 0 || !(after.hp > r)) throw new Error('cheese ' + JSON.stringify(after));
});
await check('death returns to the Nest with gold banked', async () => {
  await S(() => { __scurry.run.scrap = 77; });
  const g0 = await S(() => __scurry.meta.salvage);
  await S(() => { __scurry.run.hp = 0; __scurry.die(); });
  await page.click('#again');
  await page.waitForFunction(() => __scurry.G.state === 'menu' && document.querySelector('[data-buy]'), null, { timeout: T(8000) });
  const g = await S(() => __scurry.readSlot(1).meta.salvage);
  if (g !== g0 + 77) throw new Error(`banked ${g}, wanted ${g0 + 77}`);
});
await check('soundtrack v3: stems load (or fall back), bar-locked fades, MUSIC_V3 mapping, musicMode fallback', async () => {
  const m = await S(() => { const M = __scurry.music3; return { boss2: M.mixFor(3, false, { phase: 2 }), boss0: M.mixFor(3, true, { phase: 0 }), c1: M.mixFor(1, true, null), c2: M.mixFor(2, false, null), menu: M.mixFor(0, false, 'menu') }; });
  if (m.boss2.p1 !== 1 || m.boss2.p2 !== 1 || m.boss2.p3 !== 0 || m.boss2.city || m.boss0.p1 !== 0.5 || m.c1.sewer !== 1 || m.c1.combat !== 0.6 || m.c2.city !== 0.85 || m.c2.combat !== 1 || m.menu.menu !== 1 || m.menu.city) throw new Error('mapping ' + JSON.stringify(m));
  await page.waitForFunction(() => ['ready', 'failed'].includes(__scurry.music3.stems.state) || __scurry.music3.stems.state === 'idle' && !__scurry.audioReady(), null, { timeout: T(30000) });
  const r = await S(() => { const M = __scurry.music3, st = M.stems.state; if (st !== 'ready') return { st, why: M.stems.failed };
    M.updateStems(2, false, null, false); const L = M.stems.last, k = (L.at - M.stems.t0) / M.BAR;
    M.settings.musicMode = 'procedural'; const off = !M.stemsOn(); M.settings.musicMode = 'v3';
    return { st, onBar: Math.abs(k - Math.round(k)) < 1e-6, len: L.len, off }; });
  if (r.st === 'ready' && (!r.onBar || r.len > 0.3 || !r.off)) throw new Error(JSON.stringify(r));
  if (r.st === 'failed') throw new Error('stems failed to load: ' + r.why);
});
await check('drop-in/drop-out co-op: F6 adds a keyboard rat at the lead mid-run, scaling follows, F6 again removes it', async () => {
  await S(() => { __scurry.startRun('tank'); __scurry.god(true); });
  await toPlay();
  const before = await S(() => ({ hpM: __scurry.run.hpM, n: __scurry.run.players }));
  await page.keyboard.press('F6');
  const mid = await S(() => { const s = __scurry, q = s.asPlayer(1, () => ({ x: s.P.x, z: s.P.z })); return { on: s.coop.on, n: s.coop.players.length, players: s.run.players, hpM: s.run.hpM, d: Math.hypot(q.x - s.P.x, q.z - s.P.z) }; });
  await page.keyboard.press('F6');
  const after = await S(() => ({ on: __scurry.coop.on, players: __scurry.run.players, hpM: __scurry.run.hpM, st: __scurry.G.state }));
  await S(() => { __scurry.god(false); __scurry.menu(); });
  if (!mid.on || mid.n !== 2 || mid.players !== 2 || !(mid.hpM > before.hpM) || mid.d > 3) throw new Error('join ' + JSON.stringify({ before, mid }));
  if (after.on || after.players !== 1 || Math.abs(after.hpM - before.hpM) > 1e-6 || after.st !== 'play') throw new Error('leave ' + JSON.stringify(after));
});
await check('co-op: two rats, a gamepad moves player 2, party scaling applies', async () => {
  await page.click('[data-pn="2"]');
  for (let i = 0; i < 6 && !/Gamepad 1/.test(await page.textContent('[data-cin="1"]')); i++) await page.click('[data-cin="1"]');
  await S(() => { __scurry.fakePads[0] = { axes: [0, 0, 0, 0], buttons: [] }; });
  await page.click('.card[data-k="tank"]');
  await page.waitForFunction(() => __scurry.G.state === 'play', null, { timeout: T(15000) });
  await toPlay();
  const s0 = await S(() => ({ on: __scurry.coop.on, n: __scurry.coop.players.length, rp: __scurry.run.players, boss: __scurry.run.bossHpM, want: 1 + __scurry.TUNE.coop.perPlayer.bossHp, x: __scurry.asPlayer(1, () => __scurry.P.x), z: __scurry.asPlayer(1, () => __scurry.P.z), hp: __scurry.asPlayer(1, () => __scurry.run.hp) }));
  if (!s0.on || s0.n !== 2 || s0.rp !== 2) throw new Error('co-op not on ' + JSON.stringify(s0));
  if (Math.abs(s0.boss - s0.want) > 1e-6) throw new Error('boss HP scale ' + s0.boss);
  if (!(s0.hp > 0)) throw new Error('player 2 has no HP');
  await S(() => { __scurry.fakePads[0].axes = [1, 0, 0, 0]; });
  await page.waitForFunction(s0 => __scurry.G.state !== 'play' || Math.hypot(__scurry.asPlayer(1, () => __scurry.P.x) - s0.x, __scurry.asPlayer(1, () => __scurry.P.z) - s0.z) >= 0.5, s0, { timeout: T(15000) }).catch(() => {});
  await S(() => { __scurry.fakePads[0].axes = [0, 0, 0, 0]; });
  const s1 = await S(() => ({ x: __scurry.asPlayer(1, () => __scurry.P.x), z: __scurry.asPlayer(1, () => __scurry.P.z), ok: Number.isFinite(__scurry.P.x) }));
  if (Math.hypot(s1.x - s0.x, s1.z - s0.z) < 0.5) throw new Error('player 2 did not move');
  if (!s1.ok) throw new Error('player 1 position broke');
  if ((await page.locator("#pbar .pp.on").count()) !== 2) throw new Error('co-op HUD missing');
});
await check('co-op: the lead rat revive count resets on a new map', async () => {
  await toPlay();
  await S(() => { __scurry.P.revUsed = 2; __scurry.run.seed = __scurry.run.seed + '-test'; }); // a seed change = a new map for leash()
  await page.waitForFunction(() => !__scurry.P.revUsed, null, { timeout: T(5000) });
});
await check('co-op callouts name the player colour + class, tint the line, and carry a manifest id', async () => {
  const r = await S(() => { const s = __scurry, A = s.announcer; A.callout('crit', 1); const b = { ...s.run.lastBark }; A.foodShot(2); const f = { ...s.run.lastBark }; return { b, f, n0: A.callName(0) }; });
  // The name can sit anywhere in the line ("Eat or die, Blue Rat!"); lines are picked at random.
  if (!/\bBlue (Rat|Slinger|Warlock|Sneak)\b/.test(r.b.text) || !r.b.color || !/^(vo|ann)_/.test(r.b.vo || '')) throw new Error('crit ' + JSON.stringify(r.b));
  if (!/^(vo|ann)_/.test(r.f.vo || '') || !r.f.color) throw new Error('food ' + JSON.stringify(r.f));
  if (!/^Red (Rat|Slinger|Warlock|Sneak)$/.test(r.n0)) throw new Error('name ' + r.n0);
});
await check('co-op: only the lead takes the manhole; a pipe moves only the rat that used it, with no fade', async () => {
  await toPlay();
  const m = await S(() => { const s = __scurry, mh = s.G.manhole; if (!mh) return 'no manhole'; s.run.keys = 1; const layer = s.run.layer; s.asPlayer(1, () => { s.P.x = mh.x; s.P.z = mh.z; s.P.y = 0; s.pressE(); }); return { layer: s.run.layer === layer, keys: s.run.keys, st: s.G.state }; });
  if (typeof m === 'string' || !m.layer || m.keys !== 1 || m.st !== 'play') throw new Error('player 2 took the manhole ' + JSON.stringify(m));
  const p = await S(() => { const s = __scurry, pipe = s.W.pipes.find(p => p.link); if (!pipe) return null;
    s.asPlayer(1, () => { s.P.x = pipe.x; s.P.z = pipe.z; s.P.y = 0; s.pressE(); });
    const far = Math.hypot(pipe.link.ex - s.P.x, pipe.link.ez - s.P.z) > s.TUNE.coop.leash;
    const p1 = { x: s.P.x, z: s.P.z };
    return { p1, far, ex: pipe.link.ex, ez: pipe.link.ez, st: s.G.state, fade: document.getElementById('fade').style.opacity }; });
  if (!p) return; // no linked pipe on this map
  if (p.st !== 'play' || p.fade === '1') throw new Error('pipe froze or blanked the shared screen ' + JSON.stringify(p));
  await page.waitForFunction(p => { const s = __scurry, q = s.asPlayer(1, () => ({ x: s.P.x, z: s.P.z }));
    return Math.hypot(q.x - p.ex, q.z - p.ez) < 1.5 && (p.far ? Math.hypot(s.P.x - p.ex, s.P.z - p.ez) < 2.5 : Math.hypot(s.P.x - p.p1.x, s.P.z - p.p1.z) < 0.5); }, p, { timeout: T(5000) });
});
await check('co-op: a downed rat is revived by a partner, and the run ends only when all are down', async () => {
  await S(() => { __scurry.god(false); __scurry.asPlayer(1, () => { __scurry.run.hp = 0; __scurry.die(); }); });
  const d = await S(() => ({ st: __scurry.G.state, down: __scurry.asPlayer(1, () => !!__scurry.P.downed) }));
  if (d.st !== 'play' || !d.down) throw new Error('not downed ' + JSON.stringify(d));
  await S(() => { const s = __scurry, x = s.P.x + 0.6, z = s.P.z; s.asPlayer(1, () => { s.P.x = x; s.P.z = z; }); });
  // Keep the partner parked next to the downed rat (enemies can shove it) until revived.
  await until(() => { const s = __scurry; const x = s.P.x + 0.6, z = s.P.z; return !s.asPlayer(1, () => { if (s.P.downed) { s.P.x = x; s.P.z = z; } return s.P.downed; }); }, T(30000));
  const t0 = await S(() => __scurry.run.tokens);
  await S(() => { const s = __scurry; s.asPlayer(1, () => { s.run.hp = 0; s.die(); s.P.x += 40; s.P.downT = s.TUNE.coop.downTime - 0.2; }); });
  await until(() => !__scurry.asPlayer(1, () => __scurry.P.downed), T(20000));
  if ((await S(() => __scurry.run.tokens)) !== t0 - 1) throw new Error('no cheese token spent');
  await S(() => { __scurry.asPlayer(1, () => { __scurry.run.hp = 0; __scurry.die(); }); __scurry.run.hp = 0; __scurry.die(); });
  if ((await S(() => __scurry.G.state)) !== 'dead') throw new Error('run did not end');
  if (await S(() => __scurry.coop.on)) throw new Error('co-op still on after the run');
  await page.click('#again');
  await page.waitForSelector('[data-pn="1"]');
  await page.click('[data-pn="1"]');
});
await check('old single-slot saves move into slot 1', async () => {
  // Park the main page so it is not burning the runner's CPU while the second page loads.
  await page.goto('about:blank');
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('pageerror (migrate): ' + e.message));
  await p2.addInitScript(() => { if (!localStorage.getItem('mig')) { localStorage.setItem('mig', 1); localStorage.setItem('scurry.meta', JSON.stringify({ salvage: 321, runs: 4, nest: { x: 1 } })); localStorage.setItem('scurry.best', JSON.stringify({ time: 90, kills: 12, district: 1 })); } });
  await p2.goto('http://localhost:5190/?debug', { waitUntil: 'domcontentloaded', timeout: T(30000) });
  await p2.waitForSelector('[data-slot="1"]', { timeout: T(20000) });
  const d = await p2.evaluate(() => JSON.parse(localStorage.getItem('scurry.slot1')));
  if (!d || d.v !== 3 || d.meta.salvage !== 321 || d.best.time !== 90 || d.meta.nest) throw new Error('slot1 ' + JSON.stringify(d));
  await p2.click('[data-slot="1"]');
  await p2.waitForSelector('#hubGold');
  if (!/321 gold/.test(await p2.textContent('#hubGold'))) throw new Error('hub gold wrong');
  // v2 → v3: cut classes move to their heirs (Brawler → Sewer Rat, Plaguebearer → Warlock, Roof Rat → Slinger).
  const m2 = await p2.evaluate(() => { localStorage.setItem('scurry.slot2', JSON.stringify({ v: 2, meta: { salvage: 50, cls: 'brawler', coopCls: ['plague', 'roof', 'tank', 'brawler'], furs: { roof: 3, slinger: 1, plague: 2 }, u_plague: 1, shop: {} }, best: { time: 1, kills: 1, district: 0 } })); return __scurry.readSlot(2).meta; });
  if (m2.cls !== 'tank' || m2.coopCls.join() !== 'warlock,slinger,tank,tank' || m2.furs.slinger !== 1 || m2.furs.warlock !== 2 || 'roof' in m2.furs || m2.u_plague) throw new Error('slot2 migration ' + JSON.stringify(m2));
  const ran = await p2.evaluate(() => { __scurry.startRun('roof'); const k = __scurry.run.cls; __scurry.menu(); return k; });
  if (ran !== 'slinger') throw new Error('startRun(roof) ran ' + ran);
  // Deleting the slot must not bring the old save back on the next load (one-time migration).
  await p2.evaluate(() => localStorage.removeItem('scurry.slot1'));
  await p2.reload({ waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('[data-slot="1"]', { timeout: T(20000) });
  if (await p2.evaluate(() => localStorage.getItem('scurry.slot1'))) throw new Error('deleted slot came back from the legacy save');
  await ctx.close();
});
await check('no errors during boot', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

await browser.close();
await new Promise(r => server.httpServer.close(r));
const failed = checks.filter(c => c[1] !== 'ok');
console.log(failed.length ? `boot gate FAILED (${failed.length})` : 'boot gate passed');
process.exit(failed.length ? 1 : 0);
