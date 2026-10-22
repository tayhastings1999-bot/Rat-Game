// Fixture tests for scripts/spritelint.mjs. Fixtures are generated into a temp dir at run time
// (flat test blocks, not art); nothing is committed. Usage: node scripts/spritelint-test.mjs
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, decodePng } from './lib/png.mjs';
import { lintDirs, PALETTE } from './spritelint.mjs';

const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
function img(W, H, fill) { const d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = fill(x, y); if (c) d.set([...rgb(c[0]), c[1] ?? 255], (y * W + x) * 4); } return d; }
const body = (W, H, col, x0 = 4, y0 = 4) => (x, y) => x >= x0 && y >= y0 && x < W - x0 && y < H - 2 ? [x === x0 || x === W - x0 - 1 ? PALETTE.void : col] : null;
let fail = 0;
const t = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fail++; };
const dir = mkdtempSync(join(tmpdir(), 'spritelint-'));
const put = (n, W, H, f) => writeFileSync(join(dir, n), encodePng(W, H, img(W, H, f)));
const run = (files) => { for (const k of Object.keys(files)) put(k, ...files[k]); const r = lintDirs([dir]); for (const k of Object.keys(files)) rmSync(join(dir, k)); return r; };
const fails = r => [...r.frames, ...r.atlases, ...r.names].flatMap(x => x.fails).concat(r.D6);

// PNG round trip
const rt = decodePng(encodePng(3, 2, img(3, 2, (x) => [PALETTE.bone, x ? 255 : 0])));
t('png round trip', rt.width === 3 && rt.data[3] === 0 && rt.data[7] === 255 && rt.data[4] === 0xe8);

const heroOK = { 'hero_tank_idle_s_00.png': [48, 64, body(48, 64, PALETTE.grimeL1)], 'hero_tank_idle_s_00_m.png': [48, 64, (x, y) => x > 4 && x < 43 && y > 20 && y < 40 ? ['FF0000'] : ['000000']] };
const mobOK = { 'mob_roach_move_e_00.png': [32, 32, body(32, 32, PALETTE.enemy, 8, 18)] };
t('clean hero + mob pass', fails(run({ ...heroOK, ...mobOK })).length === 0);
t('D1 off-palette fails', fails(run({ ...heroOK, 'mob_roach_move_e_00.png': [32, 32, body(32, 32, '123456', 8, 18)] })).some(f => f.startsWith('D1')));
const eyed = (W, H, col) => (x, y) => x === 14 && y === 22 ? ['9EAE2C'] : body(W, H, col, 8, 18)(x, y);
t('Bile Eye on a mob passes', !fails(run({ 'mob_roach_move_e_00.png': [32, 32, eyed(32, 32, PALETTE.enemy)] })).some(f => f.startsWith('D1')));
t('Bile Eye on a hero fails', fails(run({ 'hero_tank_idle_s_00.png': [48, 64, (x, y) => x === 20 && y === 20 ? ['9EAE2C'] : body(48, 64, PALETTE.grimeL1)(x, y)], 'hero_tank_idle_s_00_m.png': heroOK['hero_tank_idle_s_00_m.png'] })).some(f => f.startsWith('D1')));
t('old enemy tone #4A4656 now off-palette', fails(run({ 'mob_roach_move_e_00.png': [32, 32, body(32, 32, '4A4656', 8, 18)] })).some(f => f.startsWith('D1')));
const warnsOf = r => r.frames.flatMap(x => x.warns || []);
const amber = (x, y) => (x === 14 || x === 17) && y === 22 ? ['FFB020'] : body(32, 32, PALETTE.enemy, 8, 18)(x, y);
{ const r = run({ 'mob_roach_move_e_00.png': [32, 32, amber] }); t('W2 amber eyes warn, not fail', fails(r).length === 0 && warnsOf(r).some(w => w.startsWith('W2'))); }
{ const r = run({ 'mob_roach_move_e_00.png': [32, 32, (x, y) => body(32, 32, PALETTE.enemy, 8, 18)(x, y) ? ['FF5A1A'] : null] }); t('warm colour over 3% still fails', fails(r).some(f => f.startsWith('D1'))); }
{ const r = run({ 'mob_roach_move_e_00.png': [32, 32, (x, y) => x >= 8 && x < 24 && y >= 18 && y < 30 ? [PALETTE.enemy] : null] }); t('W1 missing enemy outline warns, not fail', fails(r).length === 0 && warnsOf(r).some(w => w.startsWith('W1'))); }
{ const r = run({ 'horde_mawling_move_e_00.png': [48, 56, body(48, 56, PALETTE.enemy, 8, 18)] }); t('W3 horde 48x56 warns, not fail', fails(r).length === 0 && warnsOf(r).some(w => w.startsWith('W3'))); }
{ const r = run({ 'mob_roach_move_e_00.png': [48, 60, body(48, 60, PALETTE.enemy, 8, 18)] }); t('mob canvas over 48x56 still fails', fails(r).some(f => f.startsWith('D2'))); }
t('D2 wrong canvas fails (elite)', fails(run({ 'elite_mawling_move_e_00.png': [60, 64, body(60, 64, PALETTE.enemy, 8, 18)] })).some(f => f.startsWith('D2')));
t('D2 ghoul 48x48 exception passes [Q8]', !fails(run({ 'mob_ghoul_move_e_00.png': [48, 48, body(48, 48, PALETTE.enemy, 8, 8)] })).some(f => f.startsWith('D2')));
t('D3 partial alpha fails', fails(run({ 'mob_roach_move_e_00.png': [32, 32, (x, y) => body(32, 32, PALETTE.enemy, 8, 18)(x, y) ? [PALETTE.enemy, 128] : null] })).some(f => f.includes('partial alpha')));
t('D3 orphan pixel fails', fails(run({ 'mob_roach_move_e_00.png': [32, 32, (x, y) => x === 2 && y === 2 ? [PALETTE.enemy] : body(32, 32, PALETTE.enemy, 8, 18)(x, y)] })).some(f => f.includes('islands')));
const maskRows = n => [48, 64, (x, y) => x > 4 && x < 43 && y >= 20 && y < 20 + n ? ['FF0000'] : ['000000']];
t('D4 hero mask 14.7% passes (≥12%, guide v1.4)', !fails(run({ ...heroOK, 'hero_tank_idle_s_00_m.png': maskRows(9) })).some(f => f.startsWith('D4')));
t('D4 hero mask 8.2% fails (<12%)', fails(run({ ...heroOK, 'hero_tank_idle_s_00_m.png': maskRows(5) })).some(f => f.includes('< 12%')));
t('D4 missing hero mask fails', fails(run({ 'hero_tank_idle_s_00.png': heroOK['hero_tank_idle_s_00.png'] })).some(f => f.includes('no _m')));
t('D6 mob brighter than hero fails', fails(run({ 'hero_tank_idle_s_00.png': [48, 64, body(48, 64, PALETTE.slate)], 'hero_tank_idle_s_00_m.png': heroOK['hero_tank_idle_s_00_m.png'], 'mob_roach_move_e_00.png': [32, 32, body(32, 32, PALETTE.chromeHi, 8, 18)] })).some(f => f.startsWith('D6')));
t('D11 player red on a mob fails', fails(run({ 'mob_roach_move_e_00.png': [32, 32, body(32, 32, 'FF3B30', 8, 18)] })).some(f => f.startsWith('D11')));
t('bad file name fails', fails(run({ 'roach.png': [32, 32, body(32, 32, PALETTE.enemy, 8, 18)] })).some(f => f.includes('§9')));
const atl = (frames) => { writeFileSync(join(dir, 'atlas_t.json'), JSON.stringify({ meta: { size: [64, 64] }, frames })); const r = lintDirs([dir]); rmSync(join(dir, 'atlas_t.json')); return r; };
t('D13 atlas with ai fields passes', fails(atl({ hero_tank_idle_s_00: { frame: { x: 0, y: 0, w: 48, h: 64 }, anchor: { x: 24, y: 60 }, ai: false, aiTool: null } })).length === 0);
t('D13 missing ai fails', fails(atl({ hero_tank_idle_s_00: { anchor: { x: 24, y: 60 } } })).some(f => f.startsWith('D13')));
t('D13 ai:true without tool fails', fails(atl({ hero_tank_idle_s_00: { anchor: { x: 24, y: 60 }, ai: true, aiTool: null } })).some(f => f.includes('needs aiTool')));
t('D2 hero anchor (24,60) kept', !fails(atl({ hero_tank_idle_s_00: { anchor: { x: 24, y: 60 }, ai: false, aiTool: null } })).some(f => f.startsWith('D2')));
t('D2 atlas anchor mismatch fails', fails(atl({ hero_tank_idle_s_00: { anchor: { x: 24, y: 58 }, ai: false, aiTool: null } })).some(f => f.startsWith('D2')));
t('empty dir passes (nothing to lint)', lintDirs([join(dir, 'nope')]).summary.failed === 0);
rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
