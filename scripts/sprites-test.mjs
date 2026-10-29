// Unit checks for the sprite plumbing (atlas.js / sprites.js pure helpers). No GPU, no art.
// Usage: node scripts/sprites-test.mjs
import { buildFrames, checkAtlasJson, dirOf, frameKey } from '../src/render/atlas.js';
import { cornerPx, frameAt } from '../src/render/sprites.js';

let fail = 0;
const ok = (name, c) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${name}`); if (!c) fail++; };
const J = { meta: { group: 'test', size: [256, 256], ppu: 32 }, frames: {
  hero_tank_idle_s_00: { page: 0, frame: { x: 0, y: 0, w: 48, h: 64 }, anchor: { x: 24, y: 61 }, ai: false, aiTool: null },
} };
ok('valid atlas json passes', checkAtlasJson(J).length === 0);
ok('missing ai flag fails (D13)', checkAtlasJson({ meta: J.meta, frames: { a: { frame: { x: 0, y: 0, w: 1, h: 1 }, anchor: { x: 0, y: 0 } } } }).some(e => e.includes('D13')));
ok('ai:true without aiTool fails', checkAtlasJson({ meta: J.meta, frames: { a: { frame: { x: 0, y: 0, w: 1, h: 1 }, anchor: { x: 0, y: 0 }, ai: true, aiTool: null } } }).length === 1);
ok('rect outside page fails', checkAtlasJson({ meta: J.meta, frames: { a: { frame: { x: 250, y: 0, w: 48, h: 4 }, anchor: { x: 0, y: 0 }, ai: false, aiTool: null } } }).length === 1);
const f = buildFrames(J).frames.get('hero_tank_idle_s_00');
ok('hero 48x64 = 1.5 x 2 world units', f.size[0] === 1.5 && f.size[1] === 2);
ok('uv rect top-left origin', f.uv.x === 0 && f.uv.y === 0 && f.uv.z === 48 / 256 && f.uv.w === 0.25);
ok('frameKey naming', frameKey('hero', 'tank', 'run', 'se', 3) === 'hero_tank_run_se_03');
ok('dirOf east', dirOf(0).dir === 'e' && !dirOf(0).flip);
ok('dirOf west mirrors east', dirOf(Math.PI).dir === 'e' && dirOf(Math.PI).flip === 1);
ok('dirOf south', dirOf(-Math.PI / 2).dir === 's');
ok('dirOf sw mirrors se', dirOf(-3 * Math.PI / 4).dir === 'se' && dirOf(-3 * Math.PI / 4).flip === 1);
// Feet anchor (24,61) on a 48x64 hero: bottom-left corner is 24 px left, 3 px below the anchor.
ok('corner offsets from anchor', JSON.stringify(cornerPx(0, 0, 48, 64, 24, 61)) === '[-24,-3]' && JSON.stringify(cornerPx(1, 1, 48, 64, 24, 61)) === '[24,61]');
let whole = true;
for (const s of [0.83, 0.9, 1.07, 1.13, 1.2]) for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) for (const p of cornerPx(u, v, 48, 64, 24, 61, s, 2 - s)) if (!Number.isInteger(p)) whole = false;
ok('aSquash snaps to whole sprite pixels [Q6]', whole);
ok('flip mirrors around the anchor', cornerPx(1, 1, 48, 64, 20, 61, 1, 1, true)[0] === -28);
const act = { frames: 4, fps: 10, hold: [1, 3, 1, 1] };
ok('frameAt honours holds', frameAt(act, 0.05) === 0 && frameAt(act, 0.15) === 1 && frameAt(act, 0.35) === 1 && frameAt(act, 0.45) === 2);
ok('frameAt loops', frameAt(act, 0.6 + 0.05) === 0);
ok('frameAt clamps when not looping', frameAt(act, 9, false) === 3);

// TD-3 stepped zoom (render/camstep.js), heroes_v2 atlas format, tuning defaults.
const { pickStep, stepFrom, orthoRadiusPx } = await import('../src/render/camstep.js');
ok('pickStep smallest fitting step', pickStep(12, [20, 30]) === 20 && pickStep(24, [20, 30]) === 30 && pickStep(99, [20, 30]) === 30);
ok('pickStep hysteresis holds 30 until span < 85% of 20', pickStep(18, [20, 30], 30) === 30 && pickStep(16, [20, 30], 30) === 20);
ok('stepFrom wheel notches', stepFrom(20, [20, 30], 1) === 30 && stepFrom(30, [20, 30], -1) === 20 && stepFrom(30, [20, 30], 1) === 30);
ok('ortho fade radius px', orthoRadiusPx(2.6, 5.625, 360) === 2.6 / 5.625 * 180);
const { has, normalizeAtlasJson } = await import('../src/render/atlas.js');
ok('no heroes atlas loaded → has() false (mesh fallback)', !has('tank_idle', 'heroes') && !has('tank_idle'));
const { readFileSync } = await import('node:fs');
const HJ = normalizeAtlasJson(JSON.parse(readFileSync(new URL('../public/sprites/atlas_heroes.json', import.meta.url))));
ok('heroes_v2 atlas validates after normalize', checkAtlasJson(HJ).length === 0);
ok('heroes_v2 idle actions for all four classes', ['tank', 'slinger', 'warlock', 'sneak'].every(c => HJ.actions[`${c}_idle`]?.frames === 16 && HJ.actions[`${c}_idle`].dirs.join() === 's'));
ok('heroes_v2 idle loop 2.4 s', Math.abs(16 / HJ.actions.tank_idle.fps - 2.4) < 1e-9);
ok('heroes_v2 frame keys match frameKey', buildFrames(HJ).frames.has(frameKey('hero', 'sneak', 'idle', 's', 15)));
globalThis.location = { search: '' };
const { TUNE } = await import('../src/tuning.js');
ok('TUNE.sprite defaults: mesh, ppu 32', TUNE.sprite.mode === 'mesh' && TUNE.sprite.ppu === 32);
ok('TUNE.camera default (mesh): perspective, width 22, min 18', TUNE.camera.ortho === false && TUNE.camera.width === 22 && TUNE.camera.minWidth === 18);
globalThis.location = { search: '?sprites=1' };
const { TUNE: TS } = await import('../src/tuning.js?sprites');
ok('TUNE.camera TD-3 with ?sprites=1: ortho, width 20, steps 20/30, cine 18', TS.sprite.mode === 'mixed' && TS.camera.ortho === true && TS.camera.width === 20 && TS.camera.steps.join() === '20,30' && TS.camera.cineWidth === 18);
delete globalThis.location;
process.exit(fail ? 1 : 0);
