// Compare two perf probes from scripts/shots.mjs (base vs head) and flag regressions.
// Draw calls and triangles are deterministic, so they gate: more than LIMIT_COUNT growth fails.
// ms/frame on a software renderer is noisy, so it only warns past LIMIT_MS.
// Usage: node scripts/perf-compare.mjs base-perf.json head-perf.json [summary.md]
import { readFileSync, appendFileSync } from 'node:fs';

const [baseF, headF, out] = process.argv.slice(2);
if (!baseF || !headF) { console.error('usage: perf-compare base.json head.json [summary.md]'); process.exit(2); }
const base = JSON.parse(readFileSync(baseF, 'utf8')), head = JSON.parse(readFileSync(headF, 'utf8'));
const LIMIT_COUNT = +(process.env.PERF_LIMIT_COUNT || 0.2), LIMIT_MS = +(process.env.PERF_LIMIT_MS || 0.25);
const metrics = [['drawCalls', LIMIT_COUNT, true], ['triangles', LIMIT_COUNT, true], ['msPerFrame', LIMIT_MS, false], ['updMs', LIMIT_MS, false], ['syncMs', LIMIT_MS, false]];
const rows = ['| Scene | Metric | Base | Head | Change | |', '|---|---|---|---|---|---|'];
let fail = 0, warn = 0;
for (const scene of ['city', 'horde']) {
  for (const [m, lim, gate] of metrics) {
    const a = base[scene]?.[m], b = head[scene]?.[m];
    if (a == null || b == null) continue;
    const d = a ? (b - a) / a : 0, bad = d > lim;
    const flag = bad ? (gate ? 'FAIL' : 'warn') : 'ok';
    if (bad && gate) fail++; else if (bad) warn++;
    rows.push(`| ${scene} | ${m} | ${a} | ${b} | ${(d * 100).toFixed(1)}% | ${flag} |`);
    if (bad) console.log(`::${gate ? 'error' : 'warning'} title=Perf ${scene}.${m}::${a} -> ${b} (${(d * 100).toFixed(1)}%, limit ${lim * 100}%)`);
  }
}
const md = ['## Perf vs base', '', `Counts gate at +${LIMIT_COUNT * 100}%; frame times warn at +${LIMIT_MS * 100}% (SwiftShader, noisy).`, '', ...rows, '', fail ? `**${fail} regression(s)**` : warn ? `${warn} timing warning(s), no count regressions` : 'No regressions.'].join('\n');
console.log(md);
if (out) appendFileSync(out, md + '\n');
process.exit(fail ? 1 : 0);
