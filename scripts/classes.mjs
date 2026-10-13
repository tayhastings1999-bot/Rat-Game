// Class balance probe for the final four (deterministic, no crits, front hits only).
// For each class / level / shop it builds the rat as a run would (shop ranks, level-up growth,
// the zone a player of that level is usually in, enemy power-following) and measures with the
// real combat code:
//   ttkMob / ttkElite – seconds of primary fire to kill a fresh mawling / elite mawling (single target)
//   hitsToDie         – mawling hits from full HP to 0 (armor, HP, power-following)
//   primDps           – primary damage per second on one target
//   burst             – one special + one signature on one target (Magic-scaled)
//   index             – ttkMob × hitsToDie⁻¹ style "safety": hitsToDie / ttkMob (higher = safer)
// Usage: npm run build && node scripts/classes.mjs [label]  -> scripts/out/classes/<label>.json/.md
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const L = process.argv[2] || 'classes', OUT = new URL('./out/classes/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await preview({ preview: { port: 5194, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5194/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('[data-slot]'), null, { timeout: 60000 });
await page.evaluate(() => __scurry.pickSlot(3));
const LEVELS = [1, 25, 50, 75, 99];
// Per-swing base damage and targets hit by one swing on a single enemy (from combat/arsenal.js).
const PRIM_BASE = { gnash: 30, shiv: 16, stone: 11, hex: 13 };
const SPEC_BASE = { bulwark: 22, volley: 18 * 2, blink: 35 * 2, smoke: 0 }; // volley: ~2 stones of the ring land on one target
const SIG_BASE = { tank: 14 + 40, slinger: 38, warlock: 42, sneak: 16 * 1.8 }; // parry shove + riposte; ricochet; hex mark; shadowstep → backstab
const rows = await page.evaluate(([LEVELS, PRIM_BASE, SPEC_BASE, SIG_BASE]) => {
  const s = __scurry, out = [], rnd = Math.random;
  const zoneFor = lv => Math.min(7, Math.floor((lv - 1) / 12));
  for (const cls of Object.keys(s.TUNE.classes)) for (const shop of [0, 1]) for (const lv of LEVELS) {
    s.meta.shop = shop ? { str: 3, arm: 3, spd: 3, mag: 3, hide: 5 } : {};
    s.meta.pack = {};
    s.startRun(cls);
    s.G.state = 'play'; s.god(false);
    Object.assign(s.run, { evT: 1e9, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 });
    for (const e of s.W.enemies) e.dead = true;
    for (let i = 1; i < lv; i++) { s.growStats(); s.run.level = i + 1; }
    s.run.tier = zoneFor(lv); s.run.layer = 'city'; s.run.secret = null; s.run.sewerIdx = 0;
    s.zoneScaling(); s.powerScaling();
    s.run.pu = {};
    Math.random = () => 0.999;
    const C = s.CLASSES[cls], PR = s.PRIM[C.prim];
    const dmgOf = (base, src) => { const e = s.spawnEnemy('mawling', s.P.x + 3, s.P.z + 1, { plain: true, force: true, hpMul: 1000 }); const h0 = e.hp; s.hit(e, base, null, 0, src, true); const d = h0 - e.hp; e.dead = true; return d; };
    const swing = dmgOf(PRIM_BASE[C.prim], 'primary'), rate = PR.cd * s.st.cd, primDps = swing / rate;
    const mob = s.spawnEnemy('mawling', s.P.x + 3, s.P.z + 1, { plain: true, force: true }), mobHp = mob.hp; mob.dead = true;
    const el = s.spawnEnemy('mawling', s.P.x + 3, s.P.z + 1, { elite: true, force: true }), eliteHp = el.hp; el.dead = true;
    const burst = (SPEC_BASE[C.special] ? dmgOf(SPEC_BASE[C.special], 'special') : 0) + dmgOf(SIG_BASE[cls], 'special');
    const probe = s.spawnEnemy('mawling', s.P.x + 3, s.P.z + 1, { plain: true, force: true });
    const hp0 = s.run.hp = s.st.maxHp; s.P.inv = 0; s.P.bulwark = 0;
    s.hurtP(probe.dmg, probe, true);
    const per = Math.max(1, hp0 - s.run.hp); probe.dead = true;
    Math.random = rnd;
    const hitsToDie = s.st.maxHp / per, ttkMob = mobHp / primDps;
    out.push({ cls, shop, lv, zone: s.run.tier, primDps: Math.round(primDps), ttkMob: +ttkMob.toFixed(2), ttkElite: +(eliteHp / primDps).toFixed(2), burst: Math.round(burst), burstMobs: +(burst / mobHp).toFixed(2), hitsToDie: +hitsToDie.toFixed(1), safety: +(hitsToDie / ttkMob).toFixed(1), rate: +rate.toFixed(3), primMul: +s.st.primMul.toFixed(2), magMul: +s.st.magMul.toFixed(2), powHp: +s.run.powHp.toFixed(2), powDmg: +s.run.powDmg.toFixed(2) });
    s.run.hp = s.st.maxHp;
  }
  return out;
}, [LEVELS, PRIM_BASE, SPEC_BASE, SIG_BASE]);
writeFileSync(`${OUT}${L}.json`, JSON.stringify(rows, null, 1));
const md = [`# Class probe · ${L}`, '', '| class | shop | lv | zone | prim DPS | TTK mob s | TTK elite s | burst (mobs) | hits to die | safety | rate s | prim× | mag× | foe HP× | foe dmg× |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.cls} | ${r.shop ? 'max' : '-'} | ${r.lv} | ${r.zone} | ${r.primDps} | ${r.ttkMob} | ${r.ttkElite} | ${r.burst} (${r.burstMobs}) | ${r.hitsToDie} | ${r.safety} | ${r.rate} | ${r.primMul} | ${r.magMul} | ${r.powHp} | ${r.powDmg} |`)].join('\n');
writeFileSync(`${OUT}${L}.md`, md);
console.log(md);
await browser.close();
await new Promise(r => server.httpServer.close(r));
