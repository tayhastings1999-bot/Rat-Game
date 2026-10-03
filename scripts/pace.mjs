// Leveling pace check: bots play fixed class/skill combos in fast-forward and
// print level, kills, threat, HP and total XP each game-minute, plus what killed
// them. Used to tune the XP curve (combat.js need), the pace rubber band
// (progress.js PACE/xpMul) and class balance.
// Usage: node scripts/pace.mjs [seconds=600] [profile:class,...] [portOffset=0]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const MAXT = +(process.argv[2] || 600), PORT = 5194 + (+process.argv[4] || 0);
const combos = (process.argv[3] || 'average:brawler,average:slinger,novice:brawler,expert:slinger').split(',').map(s => s.split(':'));
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' }); await server.listen();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto(`http://localhost:${PORT}/?debug`); await p.waitForFunction(() => window.__scurry);
for (const [prof, cls] of combos) {
  await p.evaluate(c => { const s = __scurry; s.qa.stop(); s.G.mode = 'survival'; s.meta.startAt = 'row'; s.startRun(c); }, cls);
  await p.waitForTimeout(400);
  await p.evaluate(pr => __scurry.qa.start({ profile: pr, goal: 'survive' }), prof);
  const rows = []; let next = 60, end = 'alive';
  for (;;) {
    const st = await p.evaluate(() => __scurry.qa.sim(10));
    if (st === 'trans') await p.waitForTimeout(800);
    const r = await p.evaluate(() => { const s = __scurry; return { t: Math.round(s.run.time), L: s.run.level, xp: Math.round(s.run.xpTotal || 0), k: s.run.kills, T: +(s.run.T || 0).toFixed(1), hp: Math.round(s.run.hp), mhp: s.st.maxHp, mobs: s.W.enemies.length, d: s.run.tier + 1, dmg: +s.st.dmg.toFixed(2), x: JSON.stringify({ rules: s.run.rules, keys: s.run.keystones, items: s.run.items.length, muts: s.run.muts, cursed: s.run.cursed, tb: +(s.run.threatBase||0).toFixed(1), dec: s.run.decisions, by: Object.entries(s.run.dmgBy).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>k+":"+Math.round(v)).join(" ") }) }; });
    if (st === 'dead') { end = `died ${r.t}s by ` + await p.evaluate(() => JSON.stringify({ deaths: __scurry.qa.telemetry().deaths.slice(-1), trial: !!__scurry.run.trial, cue: __scurry.run.trialCue, fails: __scurry.run.trialFails, near: __scurry.W.enemies.filter(e => Math.hypot(e.x - __scurry.P.x, e.z - __scurry.P.z) < 8).map(e => e.type + (e.champion ? '*' : e.elite ? '+' : '')).join(' ') })); rows.push(r); break; }
    if (r.t >= next) { rows.push(r); next += 60; }
    if (r.t >= MAXT) break;
  }
  console.log(`${prof} ${cls}: ${end}`);
  console.log('  ' + rows.map(r => `${(r.t / 60).toFixed(1)}m L${r.L} k${r.k} T${r.T} mobs${r.mobs} d${r.d} hp${r.hp}/${r.mhp} xp${r.xp} dmg${r.dmg}`).join('\n  '));
}
await b.close(); await server.close();
