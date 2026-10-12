// Insane fairness check: strong vs weak bot policies try to clear the first zone (kill its boss)
// on each difficulty. "Brutal but accomplishable" = the expert clears Insane, the novice fails.
// Usage: npm run build && node scripts/insane.mjs [trials=3] [secs=600] -> scripts/out/insane/
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const GOAL = process.env.GOAL || 'boss';
const TRIALS = +(process.argv[2] || 3), SECS = +(process.argv[3] || 600), OUT = new URL('./out/insane/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const server = await preview({ preview: { port: 5194, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const S = (f, a) => page.evaluate(f, a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5194/?debug');
await page.waitForFunction(() => window.__scurry && document.querySelector('[data-slot]'), null, { timeout: 60000 });
const rows = [];
for (const diff of ['normal', 'insane']) for (const profile of ['expert', 'average', 'novice']) for (let t = 0; t < TRIALS; t++) {
  await S(([d, SHOPMAX]) => { const s = __scurry; s.qa.stop(); s.meta.difficulty = d; s.meta.shop = SHOPMAX ? { str: 3, arm: 3, spd: 3, mag: 3, hide: 5 } : {}; s.meta.pack = SHOPMAX ? { cheese: 2, fIron: 2, fSplit: 2, vial: 3 } : {}; s.startRun('tank'); s.god(false); s.run.scabSeen = true; s.G.testNoTally = true; }, [diff, !!process.env.SHOPMAX]);
  for (let i = 0; i < 80; i++) { if (await S(() => __scurry.G.state === 'play')) break; await sleep(80); }
  await S(([p, g]) => __scurry.qa.start({ profile: p, goal: g }), [profile, GOAL]);
  let left = SECS, status = 'ok';
  while (left > 0) {
    const c = Math.min(20, left);
    status = await S(c => __scurry.qa.sim(c), c);
    left -= c;
    if (status === "dead" || status === "goal" || (GOAL === "progress" && (await S(() => (__scurry.run.tier || 0) >= 1)))) { if (status !== "dead") status = "goal"; break; }
    if (status !== 'ok') await sleep(150);
  }
  const r = await S(() => { const s = __scurry, T = s.qa.telemetry(); return { simTime: Math.round(T.simTime), dmgTaken: Math.round(T.dmgTaken || 0), hurt: T.hurt, kills: Object.values(T.kills).reduce((a, b) => a + b, 0), deaths: T.deaths.length, unavoidable: T.anomalies.filter(a => /unavoid|untelegraph/.test(a.kind)).length }; });
  await S(() => __scurry.qa.stop());
  const row = { diff, profile, trial: t + 1, result: status === 'goal' ? 'CLEAR' : status === 'dead' ? 'died' : 'timeout', ...r };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const sum = {};
for (const r of rows) { const k = r.diff + '/' + r.profile; (sum[k] ||= { clears: 0, n: 0, dmg: 0, time: 0 }); sum[k].n++; sum[k].dmg += r.dmgTaken; sum[k].time += r.simTime; if (r.result === 'CLEAR') sum[k].clears++; }
const md = ['# Insane check', '', `${TRIALS} trial(s) each, first zone, goal = kill the boss, up to ${SECS}s sim time. Class: tank (Sewer Rat), no shop.`, '', '| difficulty / bot | clears | avg dmg taken | avg sim s |', '|---|---|---|---|',
  ...Object.entries(sum).map(([k, v]) => `| ${k} | ${v.clears}/${v.n} | ${Math.round(v.dmg / v.n)} | ${Math.round(v.time / v.n)} |`)].join('\n');
writeFileSync(OUT + 'insane.md', md); writeFileSync(OUT + 'insane.json', JSON.stringify(rows, null, 1));
console.log(md);
await browser.close();
await new Promise(r => server.httpServer.close(r));
