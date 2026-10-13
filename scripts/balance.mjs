// Balance probe: how power and challenge scale from level 1 to 99 (deterministic, no crits).
// For each class/level/loadout it builds the rat exactly as a run would (shop ranks, level-up
// growth, the zone a player of that level is usually in), then counts with the real combat code:
//   hitsMob / hitsElite – primary hits to kill a fresh mawling / elite mawling
//   hitsToDie           – mawling hits that take the rat from full HP to 0
// "pu" loadout = Splitclaw + Iron Hide active (the strongest stack from flasks/power-ups).
// Usage: npm run build && node scripts/balance.mjs [label]   -> scripts/out/balance/<label>.json/.md
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const L = process.argv[2] || 'balance', OUT = new URL('./out/balance/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await preview({ preview: { port: 5193, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5193/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('[data-slot]'), null, { timeout: 60000 });
const LEVELS = [1, 10, 25, 50, 75, 99];
const rows = await page.evaluate(LEVELS => {
  const s = __scurry, out = [], rnd = Math.random;
  const zoneFor = lv => Math.min(7, Math.floor((lv - 1) / 12)); // ~12 levels per zone (pace.mjs)
  for (const cls of ['tank', 'slinger']) for (const shop of [0, 1]) for (const pu of [0, 1]) for (const lv of LEVELS) {
    s.meta.shop = shop ? { str: 3, arm: 3, spd: 3, mag: 3, hide: 5 } : {};
    s.meta.pack = {};
    s.startRun(cls);
    s.G.state = 'play'; s.god(false);
    Object.assign(s.run, { evT: 1e9, spawnT: 1e9, surgeT: 1e9, lurkT: 1e9 });
    for (const e of s.W.enemies) e.dead = true;
    for (let i = 1; i < lv; i++) { s.growStats(); s.run.level = i + 1; }
    s.run.tier = zoneFor(lv); s.run.layer = 'city'; s.run.secret = null; s.run.sewerIdx = 0;
    s.zoneScaling();
    if (s.powerScaling) s.powerScaling();
    s.run.pu = {};
    if (pu) { s.grantPowerup('split'); s.grantPowerup('iron'); }
    Math.random = () => 0.999; // no crits, no random spread
    const kills = elite => { const e = s.spawnEnemy('mawling', s.P.x + 3, s.P.z + 1, { plain: !elite, elite, force: true }); if (!e) return null; let n = 0; while (!e.dead && e.hp > 0 && n < 5000) { s.hit(e, 1, null, 0, 'primary', true); n++; } e.dead = true; return n; };
    const hitsMob = kills(false), hitsElite = kills(true);
    const probe = s.spawnEnemy('mawling', s.P.x + 3, s.P.z + 1, { plain: true, force: true });
    const hp0 = s.run.hp = s.st.maxHp; s.P.inv = 0; s.P.bulwark = 0;
    s.hurtP(probe.dmg, probe, true);
    const per = Math.max(1, hp0 - s.run.hp); probe.dead = true;
    Math.random = rnd;
    out.push({ cls, shop, pu, lv, zone: s.run.tier, hitsMob, hitsElite, hitsToDie: +(s.st.maxHp / per).toFixed(1), maxHp: Math.round(s.st.maxHp), taken: +s.st.taken.toFixed(3), primMul: +s.st.primMul.toFixed(2) });
    s.run.hp = s.st.maxHp;
  }
  return out;
}, LEVELS);
writeFileSync(`${OUT}${L}.json`, JSON.stringify(rows, null, 1));
const md = [`# Balance probe · ${L}`, '', '| class | shop | pu | lv | zone | hits/mob | hits/elite | hits to die | maxHP | taken× | prim× |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.cls} | ${r.shop ? 'max' : '-'} | ${r.pu ? 'split+iron' : '-'} | ${r.lv} | ${r.zone} | ${r.hitsMob} | ${r.hitsElite} | ${r.hitsToDie} | ${r.maxHp} | ${r.taken} | ${r.primMul} |`)].join('\n');
writeFileSync(`${OUT}${L}.md`, md);
console.log(md);
await browser.close();
await new Promise(r => server.httpServer.close(r));
