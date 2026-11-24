// Level clear-time bot. The QA bot plays every level headless with the 'clear' goal: smash the nests,
// kill the boss, pick up its key and walk out the exit. It reports a per-level clear time in sim
// minutes (game time, run.time). Deterministic: Math.random is seeded per level from --seed and the
// level id, and each level is simulated in one synchronous page call, so the render loop can't
// interleave and draw from the stream (see DESIGN_DECISIONS 2026-10-13 on seeding). Each level gets
// its own fresh browser, so a level's time is the same alone or anywhere in a suite.
//
// Each level starts like a hub start (startRun): a fresh level-1 rat, tier = city idx or sewer idx + 1.
// Secret zones use the tier of the level whose drain leads there.
//
// Usage: node scripts/clear.mjs [--seed=1] [--cls=tank] [--profile=average] [--modes=god,mortal] [--max=40]
//                               [--only=cinder,garden] [--out=reports/pace] [--port=5196]
//   --only  run just these levels, in this order
//   god     invulnerable rat: the level's length (route, nests, boss, key, exit) with no deaths.
//   mortal  normal rules: can this fresh rat survive it, and how long when it does.
//   --max   give up after this many sim minutes on one level.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : process.argv.includes(`--${k}`) ? true : d; };
const SEED = String(arg('seed', '1')), CLS = arg('cls', 'tank'), PROFILE = arg('profile', 'average'), MODES = String(arg('modes', 'god,mortal')).split(',');
const MAX = +arg('max', 40), OUT = arg('out', 'reports/pace'), PORT = +arg('port', 5196), ONLY = arg('only', '');
const LO = 10, HI = 20; // Taylor's level-length target, minutes

const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const errors = [];
let browser, page;
async function launchBrowser() {
  if (browser) { try { await browser.close(); } catch { /* already gone */ } }
  browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push(e.message));
  // Hook timers and rAF before any page script runs, so we can cancel transition
  // timeouts and later park the game loop (menu rAF was mutating shared state
  // between levels with a wall-clock-dependent number of frames).
  await page.addInitScript(() => {
    const tos = new Set(), ivs = new Set();
    const _st = window.setTimeout.bind(window);
    const _si = window.setInterval.bind(window);
    const _ct = window.clearTimeout.bind(window);
    const _ci = window.clearInterval.bind(window);
    window.setTimeout = (fn, t, ...a) => { const id = _st(fn, t, ...a); tos.add(id); return id; };
    window.setInterval = (fn, t, ...a) => { const id = _si(fn, t, ...a); ivs.add(id); return id; };
    window.clearTimeout = id => { tos.delete(id); return _ct(id); };
    window.clearInterval = id => { ivs.delete(id); return _ci(id); };
    window.__scurryClearTimers = () => {
      for (const id of tos) _ct(id);
      for (const id of ivs) _ci(id);
      tos.clear(); ivs.clear();
    };
    const _raf = window.requestAnimationFrame.bind(window);
    const _caf = window.cancelAnimationFrame.bind(window);
    const parked = new Map();
    let rafI = 0;
    window.__scurryFreezeRAF = false;
    window.requestAnimationFrame = cb => {
      if (!window.__scurryFreezeRAF) return _raf(cb);
      const id = ++rafI;
      parked.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = id => { if (parked.delete(id)) return; _caf(id); };
    window.__scurryParkRAF = () => { window.__scurryFreezeRAF = true; };
  });
}
function resetMeta() {
  const m = __scurry.meta;
  if (!m) return;
  for (const k of Object.keys(m)) delete m[k];
  Object.assign(m, {
    cls: 'tank', coopCls: ['tank', 'slinger', 'warlock', 'sneak'], kills: 0, bosses: 0,
    maxDistrict: 0, maxSewer: -1, sewers: 0, skin: 0, salvage: 0, runs: 0, shop: {},
    difficulty: 'normal', runes: {}, fragments: {},
  });
}
function runClearLevel(lv, seed, cls, profile, god, max) {
  const s = __scurry, run = s.run, G = s.G, rnd0 = Math.random, now0 = performance.now, date0 = Date.now;
  if (window.__scurryClearTimers) window.__scurryClearTimers();
  // A sim clock for the few wall-clock rate limits (announcer foodShot). It starts far ahead of the
  // page's own clock so no earlier timestamp blocks the first call.
  const base = 1e8;
  G.time = 0;
  G.hitStop = 0;
  G.slowMo = 0;
  performance.now = () => base + G.time * 1000;
  Date.now = () => Math.floor(base + G.time * 1000);
  // One mulberry32 stream for the whole sim, re-seeded AFTER setupWorld so a variable number of
  // cosmetic draws during load (three.js UUIDs, particles) cannot shift later crit/AI rolls.
  // (Per-call-site streams keyed on Error.stack were themselves unstable: V8 stack lines vary,
  // so the same seed produced different clear times.)
  const hash = str => { let h = 1779033703; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19); return h >>> 0; };
  let a = hash(seed + ':' + lv.id);
  // P40-5: cosmetic draws get their own stream. Three.js draws 4 Math.random per new object for its UUID,
  // and procedural textures (src/render) roll their pixels, but only the first time: lazy caches that
  // whatever ran earlier in the page built (the boot menu builds Cinder Row) skip those draws. Served from
  // the main stream, a Cinder Row edit was shifting other levels' rolls. A short stack check names the caller.
  let u = hash(seed + ':' + lv.id + ':cosmetic');
  const cosRnd = () => { u |= 0; u = (u + 0x6D2B79F5) | 0; let t = Math.imul(u ^ (u >>> 15), 1 | u); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cosmetic = () => { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 4; const st = new Error().stack; Error.stackTraceLimit = lim; return st.includes('generateUUID') || st.includes('/src/render/'); };
  const rnd = () => { if (cosmetic()) return cosRnd(); a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  try {
    s.qa.stop();
    Object.assign(G, { testNoTally: true, testNoTreasure: true, testNoSave: true, qaFast: true });
    if (s.coop && s.coop.setup) s.coop.setup.n = 1;
    // P40-4: start the run on this level itself (as the hub does for a reached level), not on Cinder Row,
    // so lazy caches built during the start depend only on this level (a secret zone: the level whose
    // drain leads in). meta reach is raised just for the call and put back.
    const m = s.meta, reach = [m.maxDistrict, m.maxSewer];
    m.maxDistrict = s.LEVELS.CITY_LEVELS.length - 1; m.maxSewer = s.LEVELS.SEWER_LEVELS.length - 1;
    try { s.startRun(cls, lv.layer === 'sewer' ? { realm: 'sewer', idx: lv.sewerIdx } : { realm: 'city', idx: lv.district }); } finally { [m.maxDistrict, m.maxSewer] = reach; }
    // Load the level the way a transition does (flow.js transition), without the fade timer.
    Object.assign(run, { realm: lv.realm, layer: lv.layer, district: lv.district, sewerIdx: lv.sewerIdx, tier: lv.tier, secret: lv.secret,
      reaper: null, robber: null, reaperT: null, robT: null, bossDone: false, lvlBoss: false, evT: 45, scabSeen: false, nests: 0, surgeT: 75, keys: 0 });
    run.seed = s.levelSeed();
    // P40-3: startRun just built a level on this stream. Re-seed so this level's setup does not depend on
    // how many draws the start took (with the old Cinder Row start, a Cinder edit reshuffled every level).
    a = hash(seed + ':' + lv.id + ':setup');
    s.setupWorld(run.seed);
    // Hook is already in place so unseedRng() bound rng.next to rnd. Re-seed now for the sim itself.
    a = hash(seed + ':' + lv.id + ':sim');
    run.dStart = run.time;
    G.state = 'play';
    G.hitStop = 0;
    // startRun's coldOpen is for the default hub district, which setupWorld just replaced.
    G.slowMo = 0;
    G.camYaw = Math.PI;
    G.shake = 0; G.flash = 0; G.lockOn = null; G.attack = false; G.aimAt = null;
    // Menu rAF spins P.facing with real dt between levels; startRun does not reset it.
    Object.assign(s.P, {
      facing: Math.PI, vx: 0, vy: 0, vz: 0, inv: 1, slam: false, lock: 0, jumping: false, cut: false,
      wx: 0, wz: -1, fallV: 0, aim: 0, aimT: 0, roll: 0, rollCd: 0, onGround: true, coyote: 0, buffer: 0, air: 0,
      poisonT: 0, squeeze: false, carry: null, chewing: false, chewT: 0, climbing: false,
      atk: 0, acidT: 0, scent: false, gmul: 1, slowT: 0, pTick: 0, bulwark: 0, lastHitT: 0,
      perfectT: 0, pdCd: 0, turboT: 0, parry: 0, swing: 0, throwT: 0,
    });
    s.god(god);
    const name = s.dName(), D = s.curD();
    const nests0 = s.W.enemies.filter(e => e.type === 'nest' && !e.dead).length;
    s.qa.start({ profile, goal: 'clear the level' });
    const T0 = run.time, at = {};
    const mark = (k, c) => { if (c && at[k] == null) at[k] = +((run.time - T0) / 60).toFixed(2); };
    let end = 'timeout';
    while (run.time - T0 < max * 60) {
      const st = s.qa.sim(5);
      mark('nests', !s.W.enemies.some(e => e.type === 'nest' && !e.dead));
      mark('boss', G.boss && !G.boss.dead);
      mark('bossDead', run.lvlBoss || run.bossDone);
      mark('key', (run.keysGot || 0) > 0);
      mark('exitOpen', !!(G.exitD || (G.exits && G.exits.length)));
      if (st === 'trans') { end = 'cleared'; break; }
      if (st === 'dead') { end = 'died'; break; }
      if (st !== 'ok' && st !== 'goal' && st !== 'district') { end = 'state:' + st; break; }
    }
    const tel = s.qa.telemetry();
    const out = {
      id: lv.id, name, tier: lv.tier, secret: !!lv.secret, boss: D.boss || null, nests: nests0, end,
      min: end === 'cleared' ? +((run.time - T0) / 60).toFixed(2) : null, simMin: +((run.time - T0) / 60).toFixed(2),
      at, kills: run.kills, lvl: run.level, hp: Math.round(run.hp), stuck: tel.anomalies.filter(x => x.kind === 'stuck').length,
      anomalies: [...new Set(tel.anomalies.map(x => x.kind))], death: tel.deaths.slice(-1)[0] || null,
      left: { nests: s.W.enemies.filter(e => e.type === 'nest' && !e.dead).length, boss: !!(G.boss && !G.boss.dead), keys: s.W.keys.length },
      pos: [+s.P.x.toFixed(1), +s.P.y.toFixed(1), +s.P.z.toFixed(1)],
      target: s.qa.bot.target && { kind: s.qa.bot.target.kind, x: +s.qa.bot.target.x.toFixed(1), z: +s.qa.bot.target.z.toFixed(1) },
      exit: (G.exitD || null) && { x: +G.exitD.x.toFixed(1), z: +G.exitD.z.toFixed(1), kind: G.exitD.kind, d: +Math.hypot(s.P.x - G.exitD.x, s.P.z - G.exitD.z).toFixed(1) },
      keyPos: (s.W.keys[0] && { x: +s.W.keys[0].x.toFixed(1), y: +s.W.keys[0].y.toFixed(1), z: +s.W.keys[0].z.toFixed(1), d: +Math.hypot(s.P.x - s.W.keys[0].x, s.P.z - s.W.keys[0].z).toFixed(1) }) || null,
      keyTp: tel.keyTp || 0, keyTpSaved: tel.keyTpSaved || 0, keyTpAt: tel.keyTpAt || [],
    };
    s.qa.stop();
    // Drop the 450ms transition (and any other pending callbacks) before yielding the thread,
    // then park on the menu so the rAF loop cannot tick leftover play-state with native RNG.
    if (window.__scurryClearTimers) window.__scurryClearTimers();
    G.qaHold = true;
    try { s.menu(); } catch { G.state = 'menu'; }
    return out;
  } finally { Math.random = rnd0; performance.now = now0; Date.now = date0; s.god(false); }
}
async function loadPage() {
  await page.goto(`http://localhost:${PORT}/?debug`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__scurry, null, { timeout: 120000 });
  await page.evaluate(src => { eval(src); }, `window.__scurryResetMeta = (${resetMeta}); window.__scurryRunClear = (${runClearLevel});`);
  // Wait until fonts/audio/textures have settled so setupWorld always takes the same asset-ready path.
  await page.waitForTimeout(400);
  // Stop the menu rAF loop for the rest of the suite. The sim is stepped synchronously
  // and does not need frames; leaving the loop running mutated cam/facing/fx state
  // between levels with a variable number of real-time ticks.
  await page.evaluate(() => { if (window.__scurryParkRAF) window.__scurryParkRAF(); });
}
/** Reset storage, meta and the menu on the freshly loaded page. */
async function resetInPage() {
  await page.evaluate(() => {
    if (window.__scurryClearTimers) window.__scurryClearTimers();
    try { localStorage.clear(); } catch { /* no storage */ }
    const s = __scurry;
    s.qa && s.qa.stop();
    s.G.testNoSave = true;
    s.G.hitStop = 0;
    s.G.slowMo = 0;
    if (window.__scurryResetMeta) window.__scurryResetMeta();
    else if (s.meta) { s.meta.runes = {}; s.meta.fragments = {}; }
    if (s.G.state !== 'menu') s.menu();
  });
}
/** P40-2: every level runs in a brand-new browser and page, so no module state carries over.
 *  The leak was lazy module caches (powerup materials, district textures, ...): the first level to
 *  need one builds it, and each new Three.js object draws its UUID from Math.random, which is the
 *  seeded stream. A level run after another one skipped those draws, so the same seed rolled a
 *  different objective, packs and fights. Closing the browser each time also frees its memory
 *  (reloading one page 23 times was what ran out of memory before). */
async function fresh() {
  await launchBrowser();
  await loadPage();
  await resetInPage();
}
await fresh();

/** Every level: 19 regular (8 city, 11 sewer) + 4 secret zones. */
const levels = await page.evaluate(() => {
  const L = __scurry.LEVELS, out = [];
  L.CITY_LEVELS.forEach((l, i) => out.push({ id: l.id, layer: 'surface', realm: 'city', district: i, sewerIdx: 0, tier: i, secret: null }));
  L.SEWER_LEVELS.forEach((l, i) => out.push({ id: l.id, layer: 'sewer', realm: 'sewer', district: 0, sewerIdx: i, tier: i + 1, secret: null }));
  // Secret zones keep the tier of the level whose drain leads in (enterSecret doesn't change it).
  // Treasure has no drain (random detour); rust is a mid-city stand-in for its tier.
  const from = { treasure: ['surface', 'rust'] };
  L.CITY_LEVELS.forEach(l => { if (l.secretTo) from[l.secretTo] = ['surface', l.id]; });
  L.SEWER_LEVELS.forEach(l => { if (l.secretTo) from[l.secretTo] = ['sewer', l.id]; });
  for (const k of Object.keys(L.SECRET_LEVELS)) {
    const [layer, src] = from[k] || ['surface', 'cinder'];
    const i = (layer === 'sewer' ? L.SEWER_LEVELS : L.CITY_LEVELS).findIndex(l => l.id === src);
    out.push({ id: k, layer, realm: layer === 'sewer' ? 'sewer' : 'city', district: layer === 'sewer' ? 0 : i, sewerIdx: layer === 'sewer' ? i : 0, tier: layer === 'sewer' ? i + 1 : i, secret: k });
  }
  return out;
});
// --only runs in the order given, so a suite can start anywhere (e.g. --only=rust,neon,court).
const todo = ONLY ? ONLY.split(',').map(id => levels.find(l => l.id === id)).filter(Boolean) : levels;

const rows = [];
const meta = () => ({ seed: SEED, cls: CLS, profile: PROFILE, modes: MODES, maxMin: MAX, players: 1, start: 'hub start: fresh level-1 rat, tier = city idx / sewer idx + 1', target: [LO, HI], errors: errors.slice(0, 20) });
const cell = r => !r ? '-' : r.min != null ? String(r.min) : r.end === 'died' ? `died @${r.simMin}` : `${r.end} @${r.simMin}`;
function save() {
  mkdirSync(dirname(OUT) || '.', { recursive: true });
  writeFileSync(`${OUT}.json`, JSON.stringify({ meta: meta(), levels: rows }, null, 1) + '\n');
  const get = (id, m) => rows.find(r => r.id === id && r.mode === m);
  const md = [
    `# Level clear times (bot, sim minutes)`, '',
    `Generated by \`npm run pace:clear\`. Seed \`${SEED}\` · ${CLS} · ${PROFILE} bot · 1 player · hub start (fresh level-1 rat) · cap ${MAX} min · target ${LO}–${HI} min.`,
    `**god** = invulnerable rat: route, nests, boss, key and exit, no deaths (the level's length). **mortal** = normal rules.`,
    `**key tp** / **tp saved s**: stall-recovery teleports onto an unreachable boss key, and estimated sim seconds of travel those teleports skipped (distance / move speed). Recovery behavior is unchanged.`, '',
    '| level | tier | boss | nests | god: clear | boss up | boss dead | key | key tp | tp saved s | mortal | flag (god) |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...todo.map(lv => { const g = get(lv.id, 'god'), m = get(lv.id, 'mortal'), r = g || m; return r ? `| ${r.name} | ${r.tier} | ${r.boss || '-'} | ${r.nests} | ${cell(g)} | ${g ? g.at.boss ?? '-' : '-'} | ${g ? g.at.bossDead ?? '-' : '-'} | ${g ? g.at.key ?? '-' : '-'} | ${g ? g.keyTp || 0 : '-'} | ${g && g.keyTp ? g.keyTpSaved : '-'} | ${cell(m)} | ${g ? r.flag + (g.keyTp ? ' · key tp' : '') : '-'} |` : `| ${lv.id} | ${lv.tier} | - | - | - | - | - | - | - | - | - | pending |`; }),
  ].join('\n') + '\n';
  writeFileSync(`${OUT}.md`, md);
}

for (const mode of MODES) for (const lv of todo) {
  const GOD = mode === 'god';
  const t0 = Date.now();
  await fresh();
  let r;
  try {
    r = await page.evaluate(([lv, seed, cls, profile, god, max]) => window.__scurryRunClear(lv, seed, cls, profile, god, max), [lv, SEED, CLS, PROFILE, GOD, MAX]);
  } catch (e) {
    // Browser/page died mid-level: bring it back and retry this level once.
    await fresh();
    r = await page.evaluate(([lv, seed, cls, profile, god, max]) => window.__scurryRunClear(lv, seed, cls, profile, god, max), [lv, SEED, CLS, PROFILE, GOD, MAX]);
  }
  r.wallS = +((Date.now() - t0) / 1000).toFixed(1);
  r.flag = r.min == null ? 'NOT CLEARED' : r.min < LO ? 'short' : r.min > HI ? 'long' : 'ok';
  r.mode = mode;
  rows.push(r);
  const why = r.end !== 'cleared' ? `  tgt=${r.target ? r.target.kind : '-'} exit=${r.exit ? r.exit.kind + '@' + r.exit.d : '-'} key=${r.keyPos ? 'd' + r.keyPos.d : '-'} pos=${(r.pos || []).join(',')}` : '';
  const tp = r.keyTp ? `  keyTp ${r.keyTp} saved ${r.keyTpSaved}s` : '';
  console.log(`${mode.padEnd(6)} ${r.id.padEnd(10)} ${r.end.padEnd(9)} ${r.min == null ? '   -  ' : r.min.toFixed(2).padStart(6)} min  [${r.flag}${r.keyTp ? ' · key tp' : ''}]  nests ${r.nests} (left ${r.left.nests})  boss@${r.at.boss ?? '-'} dead@${r.at.bossDead ?? '-'} key@${r.at.key ?? '-'}  stuck ${r.stuck}${tp}  (${r.wallS}s)${why}`);
  save();
}

save();
console.log(`\nwrote ${OUT}.json and ${OUT}.md`);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
await server.close();
