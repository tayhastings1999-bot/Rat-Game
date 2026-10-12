// The feature lab: automatic QA for what's new. Every feature, level, mob or
// idea added to the game gets a trial (scripts/lab/trials.mjs), and every trial
// is scored out of 100 in three tiers:
//   T1 Works      40  the gate: deterministic checks that the feature exists and
//                     does its job. One failed T1 check scores the trial 0.
//   T2 Holds up   30  it survives every level, class and edge case: no errors,
//                     no stuck or broken states, nothing inside a wall.
//   T3 Plays well 30  bots play with it on and its numbers land in target bands
//                     (how often it fires, what it costs, what it pays).
// A trial can carry an A/B idea: the bots play the same fixed-seed levels with
// the control tuning and with the idea's tuning, and the report says which one
// scored higher in T3 (and by how much).
//
// Usage: node scripts/lab.mjs [--only=id,id] [--quick] [--no-ab]
// Writes scripts/out/lab/report.json and SCORES.md. Exits non-zero when a T1
// gate fails or a trial scores under its floor (TRIAL.floor, default 60).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { TRIALS } from './lab/trials.mjs';

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const NO_AB = args.includes('--no-ab');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const OUT = new URL('./out/lab/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const CI = !!process.env.GITHUB_ACTIONS;

const server = await createServer({ server: { port: 5193, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
const S = (fn, a) => page.evaluate(fn, a);
const sleep = ms => page.waitForTimeout(ms);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

await page.goto('http://localhost:5193/?debug');
await page.waitForFunction(() => window.__scurry && window.__scurry.qa && document.querySelector('#overlay h1'), null, { timeout: 60000 });

// ---------------------------------------------------------------- lab context
/** Every level in the game: [layer, index, secret]. */
const LV = await S(() => ({ c: __scurry.LEVELS.CITY_LEVELS.length, s: __scurry.LEVELS.SEWER_LEVELS.length, x: Object.keys(__scurry.LEVELS.SECRET_LEVELS) }));
const LEVELS = [
  ...Array.from({ length: LV.c }, (_, i) => ['surface', i, null]),
  ...Array.from({ length: LV.s }, (_, i) => ['sewer', i, null]),
  ...LV.x.map(k => [k === 'garden' ? 'sewer' : 'surface', 0, k]),
];
const L = {
  S, sleep, page, QUICK, LEVELS, log,
  errors: () => errors.length,
  /** Start a clean run (no events, no street spawns, no story), on a level if given. */
  async fresh({ cls = 'brawler', level = null, god = false, quiet = true } = {}) {
    await S(([c, g, q]) => {
      const s = __scurry;
      s.qa.stop();
      s.startRun(c);
      s.god(g);
      Object.assign(s.run, { scabSeen: true });
      if (q) { s.G.testNoRoles = true; Object.assign(s.run, { evT: 1e9, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 }); }
    }, [cls, god, quiet]);
    for (let i = 0; i < 80; i++) { if (await S(() => __scurry.G.state === 'play' && __scurry.run.time >= 0.15)) break; await sleep(80); }
    if (level) {
      await L.level(...level);
      // A rat dropped into a later zone gets the levels a player would have by then (about 2.5 a zone).
      await S(() => { const s = __scurry, want = Math.min(s.TUNE.xp.maxLevel, 1 + Math.round(2.5 * (s.run.tier || 0))); let g = 0; while (s.run.level < want && g++ < 60) s.addXP(s.run.need + 1); s.run.hp = s.st.maxHp; });
    }
  },
  /** Rebuild the world as one of the fixed levels ([layer, index, secret]); the rat stands at its start. */
  async level(layer, i, secret = null) {
    return S(([layer, i, secret]) => {
      const s = __scurry, r = s.run;
      r.layer = layer; r.secret = secret;
      if (layer === 'sewer') r.sewerIdx = i; else r.district = i;
      r.tier = i; r.nests = 0;
      r.seed = s.levelSeed();
      s.setupWorld(r.seed);
      return s.dName();
    }, [layer, i, secret]);
  },
  /** Let the bot play for `secs` of game time; returns its telemetry summary. */
  async play(secs, { profile = 'average', goal = 'progress' } = {}) {
    await S(([p, g]) => __scurry.qa.start({ profile: p, goal: g }), [profile, goal]);
    let left = secs, status = 'ok';
    while (left > 0) {
      const chunk = Math.min(20, left);
      status = await S(c => __scurry.qa.sim(c), chunk);
      left -= chunk;
      if (status === 'dead' || status === 'goal') break;
      if (status === 'trans' || status === 'district') { await sleep(1200); await S(() => { const s = __scurry; if (s.G.state === 'levelup') s.G.state = 'play'; }); }
      else if (status !== 'ok') await sleep(150);
    }
    const out = await S(() => {
      const s = __scurry, T = s.qa.telemetry();
      return { simTime: T.simTime, anomalies: T.anomalies.map(a => a.kind), hurt: T.hurt, dmgTaken: T.dmgTaken, deaths: T.deaths.length, kills: Object.values(T.kills).reduce((a, b) => a + b, 0), hp: s.run.hp, maxHp: s.st.maxHp, level: s.run.level, tier: s.run.tier };
    });
    await S(() => __scurry.qa.stop());
    return { ...out, status };
  },
  /** Set tuning values ({ 'group.key': value }); returns the old ones so they can be put back. */
  async tune(set) {
    return S(set => { const s = __scurry, old = {}; for (const [p, v] of Object.entries(set)) { old[p] = p.split('.').reduce((o, k) => o[k], s.TUNE); s.setTune(p, v); } return old; }, set);
  },
  /** Static checks on every level (or the ones given): a list of { where, issues }. */
  async staticAll(levels = LEVELS) {
    const out = [];
    for (const lv of levels) {
      const where = await L.level(...lv);
      out.push({ where, issues: await S(() => __scurry.qa.staticChecks().issues) });
    }
    return out;
  },
};

// ---------------------------------------------------------------- scoring
/** T3: each metric scores 1 inside its band and falls off to 0 one band-width outside. */
function bandScore(v, [lo, hi]) {
  if (v == null || Number.isNaN(v)) return 0;
  if (v >= lo && v <= hi) return 1;
  const w = Math.max(hi - lo, Math.abs(hi) * 0.25, 1e-6), d = v < lo ? lo - v : v - hi;
  return Math.max(0, 1 - d / w);
}
async function runChecks(list, tag) {
  const res = [];
  for (const c of list) {
    const e0 = errors.length;
    let r;
    try { r = await c.run(L); } catch (e) { r = { ok: false, detail: 'threw: ' + e.message }; }
    if (typeof r === 'boolean') r = { ok: r };
    const errs = errors.slice(e0);
    if (errs.length) r = { ...r, ok: false, score: 0, detail: (r.detail ? r.detail + ' · ' : '') + 'page errors: ' + errs.slice(0, 2).join(' | ') };
    const score = r.score ?? (r.ok ? 1 : 0);
    res.push({ name: c.name, ok: r.ok ?? score >= 0.999, score: +score.toFixed(3), detail: r.detail ?? '' });
    log(`  ${tag} ${r.ok ?? score >= 0.999 ? 'ok  ' : 'FAIL'} ${c.name}${r.detail ? ' · ' + r.detail : ''}`);
  }
  return res;
}
async function runT3(t, arm) {
  const old = arm.set ? await L.tune(arm.set) : null;
  let metrics;
  try { metrics = await t.t3.run(L, arm); } finally { if (old) await L.tune(old); }
  const bands = t.t3.bands, parts = {};
  let sum = 0, wsum = 0;
  for (const [k, b] of Object.entries(bands)) {
    const w = b[2] ?? 1, s = bandScore(metrics[k], b);
    parts[k] = { value: metrics[k] == null ? null : +(+metrics[k]).toFixed(3), band: [b[0], b[1]], score: +s.toFixed(3) };
    sum += s * w; wsum += w;
  }
  return { metrics: parts, score: wsum ? sum / wsum : 0 };
}

// ---------------------------------------------------------------- run
const report = { when: new Date().toISOString(), quick: QUICK, trials: [] };
let failed = 0;
for (const t of TRIALS.filter(t => !ONLY.length || ONLY.includes(t.id))) {
  log(`${t.id} · ${t.title}`);
  const r = { id: t.id, title: t.title, since: t.since, floor: t.floor ?? 60 };
  r.t1 = await runChecks(t.t1 || [], 'T1');
  r.gate = r.t1.every(c => c.ok);
  r.t2 = r.gate ? await runChecks(t.t2 || [], 'T2') : [];
  r.t3 = r.gate && t.t3 ? await runT3(t, { name: 'control' }) : null;
  if (r.t3) log(`  T3 ${Math.round(r.t3.score * 100)}% · ` + Object.entries(r.t3.metrics).map(([k, m]) => `${k} ${m.value} [${m.band}]`).join(' · '));
  if (r.gate && t.ab && !NO_AB) {
    const idea = await runT3(t, t.ab);
    const d = (idea.score - r.t3.score) * 30;
    r.ab = { idea: t.ab.name, set: t.ab.set, control: +(r.t3.score * 30).toFixed(1), variant: +(idea.score * 30).toFixed(1), metrics: idea.metrics, verdict: Math.abs(d) < 3 ? 'no clear difference: keep the control' : d > 0 ? `the idea wins by ${d.toFixed(1)}` : `the control wins by ${(-d).toFixed(1)}` };
    log(`  A/B ${t.ab.name}: control ${r.ab.control} vs idea ${r.ab.variant} → ${r.ab.verdict}`);
  }
  const avg = l => (l.length ? l.reduce((a, c) => a + c.score, 0) / l.length : 1);
  r.score = r.gate ? Math.round(40 + 30 * avg(r.t2) + 30 * (r.t3 ? r.t3.score : 1)) : 0;
  r.pass = r.gate && r.score >= r.floor;
  if (!r.pass) { failed++; if (CI) console.log(`::error title=Lab · ${t.id}::${r.gate ? `scored ${r.score} (floor ${r.floor})` : 'T1 gate failed: ' + r.t1.filter(c => !c.ok).map(c => c.name).join(', ')}`); }
  log(`  = ${r.score}/100 ${r.pass ? 'pass' : 'FAIL'}`);
  report.trials.push(r);
}
report.errors = errors.slice(0, 20);
report.pass = failed === 0;
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
const md = ['# Feature lab', '', `${report.when}${QUICK ? ' · quick' : ''} · ${report.trials.length} trials · ${failed} failing`, '',
  '| Trial | T1 Works (40) | T2 Holds up (30) | T3 Plays well (30) | Score | A/B idea |', '|---|---|---|---|---|---|',
  ...report.trials.map(r => `| ${r.title} | ${r.gate ? 'pass' : 'FAIL'} ${r.t1.filter(c => c.ok).length}/${r.t1.length} | ${r.t2.length ? Math.round(30 * r.t2.reduce((a, c) => a + c.score, 0) / r.t2.length) : '–'} | ${r.t3 ? Math.round(30 * r.t3.score) : '–'} | **${r.score}** | ${r.ab ? `${r.ab.idea}: ${r.ab.control} vs ${r.ab.variant} · ${r.ab.verdict}` : '–'} |`)];
writeFileSync(OUT + 'SCORES.md', md.join('\n') + '\n');
console.log('\n' + md.join('\n'));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
