// Level clear-time bot. The QA bot plays every level headless with the 'clear' goal: smash the nests,
// kill the boss, pick up its key and walk out the exit. It reports a per-level clear time in sim
// minutes (game time, run.time). Deterministic: Math.random is seeded per level from --seed and the
// level id, and each level is simulated in one synchronous page call, so the render loop can't
// interleave and draw from the stream (see DESIGN_DECISIONS 2026-10-13 on seeding).
//
// Each level starts like a hub start (startRun): a fresh level-1 rat, tier = city idx or sewer idx + 1.
// Secret zones use the tier of the level whose drain leads there.
//
// Usage: node scripts/clear.mjs [--seed=1] [--cls=tank] [--profile=average] [--modes=god,mortal] [--max=40]
//                               [--only=cinder,garden] [--out=reports/pace] [--port=5196]
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
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
/** A fresh page and an empty save for every level, so nothing (module state, caches, runes the bot took) carries over. */
async function fresh() {
  await page.goto(`http://localhost:${PORT}/?debug`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* no storage */ } });
  await page.goto(`http://localhost:${PORT}/?debug`);
  await page.waitForFunction(() => window.__scurry, null, { timeout: 120000 });
  await page.evaluate(() => { const s = __scurry; s.G.testNoSave = true; if (s.G.state !== 'menu') s.menu(); });
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
const todo = ONLY ? levels.filter(l => ONLY.split(',').includes(l.id)) : levels;

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
    `**god** = invulnerable rat: route, nests, boss, key and exit, no deaths (the level's length). **mortal** = normal rules.`, '',
    '| level | tier | boss | nests | god: clear | boss up | boss dead | key | mortal | flag (god) |', '|---|---|---|---|---|---|---|---|---|---|',
    ...todo.map(lv => { const g = get(lv.id, 'god'), m = get(lv.id, 'mortal'), r = g || m; return r ? `| ${r.name} | ${r.tier} | ${r.boss || '-'} | ${r.nests} | ${cell(g)} | ${g ? g.at.boss ?? '-' : '-'} | ${g ? g.at.bossDead ?? '-' : '-'} | ${g ? g.at.key ?? '-' : '-'} | ${cell(m)} | ${g ? g.flag : '-'} |` : `| ${lv.id} | ${lv.tier} | - | - | - | - | - | - | - | pending |`; }),
  ].join('\n') + '\n';
  writeFileSync(`${OUT}.md`, md);
}


for (const mode of MODES) for (const lv of todo) {
  const GOD = mode === 'god';
  const t0 = Date.now();
  await fresh();
  const r = await page.evaluate(([lv, seed, cls, profile, god, max]) => {
    const s = __scurry, run = s.run, G = s.G, rnd0 = Math.random, now0 = performance.now;
    // A sim clock for the few wall-clock rate limits that draw from Math.random (announcer foodShot);
    // it starts far ahead of the page's own clock so no earlier timestamp blocks the first call.
    const base = 1e8;
    G.time = 0;
    performance.now = () => base + G.time * 1000;
    // mulberry32, seeded from a hash of --seed and the level id.
    let h = 1779033703; for (const c of seed + ':' + lv.id) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19);
    const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // One stream per call site. Cosmetic draws (three.js UUIDs for every object made, rain drops, idle
    // fidgets, particles) depend on caches, async loads and menu frames, not on play. On a shared stream they
    // reshuffled every crit and AI roll after them, so the same seed gave different clears. Keyed by the
    // calling line (util.js rand/pick/chance hop once to their caller), each site only sees its own draws.
    const sites = new Map(), lim = Error.stackTraceLimit;
    const hs = str => { let x = h; for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 2654435761); return x >>> 0; };
    Math.random = () => {
      Error.stackTraceLimit = 3; const st = new Error().stack.split('\n'); Error.stackTraceLimit = lim;
      const who = (st[2] && st[2].includes('/core/util.js') ? st[3] : st[2]) || '';
      const key = who.replace(/^\s*at\s+/, '').replace(/\?[^:)]*/, '');
      let f = sites.get(key);
      if (!f) sites.set(key, f = mul(hs(key)));
      return f();
    };
    try {
      s.qa.stop();
      Object.assign(G, { testNoTally: true, testNoTreasure: true, testNoSave: true });
      if (s.coop && s.coop.setup) s.coop.setup.n = 1;
      s.startRun(cls);
      // Load the level the way a transition does (flow.js transition), without the fade timer.
      Object.assign(run, { realm: lv.realm, layer: lv.layer, district: lv.district, sewerIdx: lv.sewerIdx, tier: lv.tier, secret: lv.secret,
        reaper: null, robber: null, reaperT: null, robT: null, bossDone: false, lvlBoss: false, evT: 45, scabSeen: false, nests: 0, surgeT: 75, keys: 0 });
      run.seed = s.levelSeed();
      s.setupWorld(run.seed);
      run.dStart = run.time;
      G.state = 'play';
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
      };
      s.qa.stop();
      return out;
    } finally { Math.random = rnd0; performance.now = now0; s.god(false); }
  }, [lv, SEED, CLS, PROFILE, GOD, MAX]);
  r.wallS = +((Date.now() - t0) / 1000).toFixed(1);
  r.flag = r.min == null ? 'NOT CLEARED' : r.min < LO ? 'short' : r.min > HI ? 'long' : 'ok';
  r.mode = mode;
  rows.push(r);
  const why = r.end !== 'cleared' ? `  tgt=${r.target ? r.target.kind : '-'} exit=${r.exit ? r.exit.kind + '@' + r.exit.d : '-'} key=${r.keyPos ? 'd' + r.keyPos.d : '-'} pos=${(r.pos || []).join(',')}` : '';
  console.log(`${mode.padEnd(6)} ${r.id.padEnd(10)} ${r.end.padEnd(9)} ${r.min == null ? '   -  ' : r.min.toFixed(2).padStart(6)} min  [${r.flag}]  nests ${r.nests} (left ${r.left.nests})  boss@${r.at.boss ?? '-'} dead@${r.at.bossDead ?? '-'} key@${r.at.key ?? '-'}  stuck ${r.stuck}  (${r.wallS}s)${why}`);
  save();
}

save();
console.log(`\nwrote ${OUT}.json and ${OUT}.md`);
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
await server.close();
