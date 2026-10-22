// Sprite lint (PIXEL_STYLE_GUIDE v1.3 §11 drift checks; RENDERER_MIGRATION_PLAN PR 2).
// Usage: node scripts/spritelint.mjs [dir ...] [--json report.json] [--quiet]
//   dir: folders of exported frames named {group}_{id}_{action}_{dir}_{nn}{_n|_m}.png (guide §9)
//        and/or atlas frame tables atlas_<group>.json. Default: public/sprites.
// Checks (⚙ rows of §11):
//   D1  palette: every opaque albedo colour is in the 27-colour sprite palette (player hues never painted)
//   D2  canvas size per group (§4) incl. GAD exceptions: ghoul 48×48 [Q8], ghoulLord 192×192 [Q9]; atlas anchors
//   D3  alpha is 0/255 only; no orphan 1-px islands (eye/glint colours excepted)
//   D4  hero player-mask coverage ≥ 20% of opaque px, every frame; mask only on painted px (§2.3.2)
//   D6  value: hero max luminance > every mob max luminance (eyes and mask-G emissive excluded)
//   D11 no red / player hue in enemy, prop or world pixels; no player mask on mobs
//   D13 every atlas frame has ai (boolean) and aiTool (string when ai:true) — Steam disclosure (§9.1)
// D5 (frame counts) needs Rat 6's §5.2 table in machine form and is reported as "skipped" for now.
// Exit code 1 on any failure. No sprite content ships with this tool.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decodePng } from './lib/png.mjs';

export const PALETTE = {
  void: '0B0A10', slate: '1E2230', concrete: '3A4052', grime: '5C6474', bone: 'E8E4DA',
  lime: 'B6FF3B', purple: '7A3CFF', orange: 'FF7A1A', cyan: '3BF2FF', chromeHi: 'C9D4E8', chromeLo: '4A5470',
  slateS1: '191C28', concreteS1: '2E3242', concreteL1: '5D616D', grimeS1: '484E5B', grimeL1: '787E88', boneS1: 'B1AEA8',
  chromeHiS1: '9AA2B2', chromeLoS1: '3A4258', chromeLoL1: '6A7185', enemy: '4A4656', enemyS1: '3A3744', enemyL1: '6A6670',
  flesh: 'B0786C', // TD-8 default: yes, sprite-only
};
export const PLAYER = { p1: 'FF3B30', p2: '2F8CFF', p3: 'FFD21F', p4: '5CF2A0' };
const EYES = new Set([PALETTE.orange, PALETTE.purple, PALETTE.cyan, PALETTE.lime, PALETTE.bone]); // eyes, glints, pustules
export const CANVAS = { hero: [48, 64], mob: [32, 32], elite: [64, 64], boss: [128, 128], swarm: [16, 16], cast: [48, 64], ui: null, prop: null };
export const ANCHOR = { hero: [24, 60], mob: [16, 29], elite: [32, 61], boss: [64, 123], swarm: [8, 14], cast: [24, 60] };
const EXCEPT = { // GAD rulings: [canvas, anchor]
  mob_ghoul: [[48, 48], [24, 45]], // Q8 heavy-grunt exception
  boss_ghoulLord: [[192, 192], [96, 187]], // Q9
};
const NAME = /^(hero|mob|elite|boss|cast|swarm|prop|ui)_([A-Za-z0-9]+)_([A-Za-z0-9]+)_(s|se|e|ne|n)_(\d{2})(_n|_m)?\.png$/;
const hex = (r, g, b) => ((r << 16 | g << 8 | b) >>> 0).toString(16).toUpperCase().padStart(6, '0');
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const OK = new Set(Object.values(PALETTE)), PL = new Set(Object.values(PLAYER));
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
}
const reddish = (r, g, b) => { const [h, s, v] = hsv(r, g, b); return (h < 15 || h > 345) && s > 0.5 && v > 0.35; };
export const expectFor = (group, id) => EXCEPT[`${group}_${id}`] || [CANVAS[group], ANCHOR[group]];

/** Lint one albedo frame (+ optional mask). Returns { file, group, id, fails:[], stats }. */
export function lintFrame(file, img, mask) {
  const m = NAME.exec(basename(file)), [, group, id] = m, { width: W, height: H, data: a } = img, fails = [];
  const [can] = expectFor(group, id);
  if (can && (W !== can[0] || H !== can[1])) fails.push(`D2 canvas ${W}x${H} ≠ ${can[0]}x${can[1]}`);
  if (mask && (mask.width !== W || mask.height !== H)) { fails.push('mask size ≠ albedo size'); mask = null; }
  let off = 0, nonbin = 0, isl = 0, opq = 0, msk = 0, mskStray = 0, red = 0, mx = 0;
  const offCols = new Set(), A = (x, y) => x >= 0 && y >= 0 && x < W && y < H && a[(y * W + x) * 4 + 3] === 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = a[i], g = a[i + 1], b = a[i + 2], al = a[i + 3], c = hex(r, g, b);
    const mr = mask ? mask.data[i] > 127 : false, mg = mask ? mask.data[i + 1] > 127 : false;
    if (al !== 0 && al !== 255) nonbin++;
    if (al !== 255) { if (mr || mg) mskStray++; continue; }
    opq++;
    if (!OK.has(c)) { off++; if (offCols.size < 6) offCols.add('#' + c); }
    if (group !== 'hero' && group !== 'cast' && (PL.has(c) || reddish(r, g, b)) && !(group === 'prop' && c === PLAYER.p3)) red++;
    if (mr) msk++;
    if (!EYES.has(c) && !mg) mx = Math.max(mx, lum(r, g, b));
    if (!EYES.has(c) && !A(x + 1, y) && !A(x - 1, y) && !A(x, y + 1) && !A(x, y - 1)) isl++;
  }
  if (off) fails.push(`D1 ${off} off-palette px (${[...offCols].join(' ')})`);
  if (nonbin) fails.push(`D3 ${nonbin} px with partial alpha`);
  if (isl) fails.push(`D3 ${isl} orphan 1-px islands`);
  if (mskStray) fails.push(`D4 mask on ${mskStray} unpainted px (§2.3.2)`);
  const pct = opq ? msk / opq : 0;
  if (group === 'hero') { if (!mask) fails.push('D4 hero frame has no _m mask'); else if (pct < 0.2) fails.push(`D4 mask ${(pct * 100).toFixed(1)}% < 20%`); }
  else if (msk && !(group === 'swarm')) fails.push(`D11 player mask on a ${group} sprite`);
  if (red) fails.push(`D11 ${red} red/player-hue px on a ${group} sprite`);
  return { file: basename(file), group, id, fails, stats: { W, H, opaque: opq, maskPct: +(pct * 100).toFixed(1), maxLum: +mx.toFixed(3) } };
}

/** D13 + D2 anchors for an atlas frame table. */
export function lintAtlas(file, j) {
  const fails = [];
  if (!j?.frames) return { file: basename(file), fails: ['atlas JSON has no frames'] };
  for (const [k, f] of Object.entries(j.frames)) {
    if (typeof f.ai !== 'boolean') fails.push(`D13 ${k}: ai missing`);
    else if (f.ai && !f.aiTool) fails.push(`D13 ${k}: ai:true needs aiTool`);
    if (!('aiTool' in f)) fails.push(`D13 ${k}: aiTool missing`);
    const m = /^(hero|mob|elite|boss|cast|swarm|prop|ui)_([A-Za-z0-9]+)_/.exec(k);
    if (m && f.anchor) { const [, an] = expectFor(m[1], m[2]); if (an && (f.anchor.x !== an[0] || f.anchor.y !== an[1])) fails.push(`D2 ${k}: anchor (${f.anchor.x},${f.anchor.y}) ≠ (${an})`); }
  }
  return { file: basename(file), fails };
}

export function lintDirs(dirs) {
  const frames = [], atlases = [], bad = [];
  const files = dirs.flatMap(d => existsSync(d) ? (statSync(d).isDirectory() ? readdirSync(d).map(f => join(d, f)) : [d]) : []);
  for (const f of files) {
    const n = basename(f);
    if (/^atlas_.*\.json$/.test(n)) { atlases.push(lintAtlas(f, JSON.parse(readFileSync(f, 'utf8')))); continue; }
    if (!n.endsWith('.png') || n.startsWith('atlas_') || n.includes('TEMPLATE')) continue;
    const m = NAME.exec(n);
    if (!m) { bad.push({ file: n, fails: ['name does not follow guide §9'] }); continue; }
    if (m[6]) continue; // _n / _m read with their albedo
    const mf = f.replace(/\.png$/, '_m.png');
    frames.push(lintFrame(f, decodePng(readFileSync(f)), existsSync(mf) ? decodePng(readFileSync(mf)) : null));
  }
  const heroMax = Math.max(0, ...frames.filter(r => r.group === 'hero').map(r => r.stats.maxLum));
  const mobs = frames.filter(r => ['mob', 'elite', 'boss', 'swarm'].includes(r.group));
  const d6 = [];
  if (heroMax && mobs.length) for (const r of mobs) if (r.stats.maxLum >= heroMax) d6.push(`D6 ${r.file} max lum ${r.stats.maxLum} ≥ hero max ${heroMax}`);
  const all = [...frames, ...atlases, ...bad], failed = all.filter(r => r.fails.length).length + (d6.length ? 1 : 0);
  return { frames, atlases, names: bad, D6: d6, D5: 'skipped (needs the §5.2 frame table)', summary: { files: all.length, failed, heroMaxLum: heroMax } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), quiet = args.includes('--quiet');
  const out = ji >= 0 ? args[ji + 1] : null, dirs = args.filter((a, i) => !a.startsWith('--') && (ji < 0 || i !== ji + 1));
  const rep = lintDirs(dirs.length ? dirs : ['public/sprites']);
  if (out) writeFileSync(out, JSON.stringify(rep, null, 1));
  for (const r of [...rep.frames, ...rep.atlases, ...rep.names]) if (r.fails.length || !quiet) console.log(`${r.fails.length ? 'FAIL' : 'ok  '} ${r.file}${r.fails.length ? ': ' + r.fails.join('; ') : ''}`);
  for (const d of rep.D6) console.log('FAIL ' + d);
  console.log(`spritelint: ${rep.summary.files} file(s), ${rep.summary.failed} failing${rep.summary.files ? '' : ' (nothing to lint)'}; D5 ${rep.D5}`);
  process.exit(rep.summary.failed ? 1 : 0);
}
