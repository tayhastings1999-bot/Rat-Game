// Soundtrack v3 ("Sewer Mass", /workspace/scurry-sound/music_v3/MUSIC_V3.md): a stem player.
// Every loop starts on one shared clock t0. Loops are 8/16/32 bars at 96 BPM (one bar = 2.5 s) and all divide
// 32 bars, so they stay phase-locked for good. Intensity is carried by layer gains, never tempo, and each
// layer fade is a short (~0.25 s) ramp that starts exactly on a bar line so the groove never smears. Boss
// phase changes snap to the next beat. settings.musicMode picks 'v3' (stems) or 'procedural' (the old
// synthesized score in audio.js); 'v2' isn't shipped in the repo and plays procedural. If anything fails
// to load or decode, the mode falls back to procedural on its own.
// Filenames are stable: Rat 5 swaps in new renders under the same ids.
import { settings } from '../core/state.js';

export const BAR = 2.5, BEAT = 0.625, FADE = 0.25;
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
const URL0 = id => `${BASE}music/v3/${id}.ogg`;
export const LOOPS = ['mus3_menu_loop', 'mus3_city_explore_loop', 'mus3_sewer_explore_loop', 'mus3_combat_layer_loop', 'mus3_boss_p1_loop', 'mus3_boss_p2_loop', 'mus3_boss_p3_loop'];
export const STINGS = { victory: 'mus3_sting_victory', death: 'mus3_sting_death', clear: 'mus3_sting_level_clear' };
const LAYER = { menu: 'mus3_menu_loop', city: 'mus3_city_explore_loop', sewer: 'mus3_sewer_explore_loop', combat: 'mus3_combat_layer_loop', p1: 'mus3_boss_p1_loop', p2: 'mus3_boss_p2_loop', p3: 'mus3_boss_p3_loop' };
// Full boss stacks run 1-2 LU hot (MUSIC_V3.md): trimmed here.
const TRIM = { menu: 1, city: 1, sewer: 1, combat: 1, p1: 0.85, p2: 0.85, p3: 0.85 };

export const stems = { state: 'idle', t0: 0, bufs: {}, gains: {}, srcs: [], target: {}, failed: null, mix: null };
let AC = null, bus = null;

/** Which music plays: 'v3' only once every stem decoded; otherwise the procedural score. */
export const musicMode = () => (settings.musicMode || 'v3');
export const stemsOn = () => musicMode() === 'v3' && stems.state === 'ready';

/** Start loading (once, after the AudioContext exists). Never throws; failure flips to procedural. */
export function initStems(ctx, musicBus) {
  if (AC || musicMode() !== 'v3') return;
  AC = ctx; bus = musicBus;
  if (typeof fetch === 'undefined') { stems.state = 'failed'; stems.failed = 'no fetch'; return; }
  stems.state = 'loading';
  const ids = [...LOOPS, ...Object.values(STINGS)];
  Promise.all(ids.map(id => fetch(URL0(id)).then(r => { if (!r.ok) throw new Error(id + ' ' + r.status); return r.arrayBuffer(); })
    .then(b => new Promise((ok, no) => AC.decodeAudioData(b, ok, no))).then(buf => { stems.bufs[id] = buf; })))
    .then(start)
    .catch(e => { stems.state = 'failed'; stems.failed = String(e && e.message || e); });
}
function start() {
  stems.mix = AC.createGain(); stems.mix.connect(bus);
  stems.t0 = AC.currentTime + 0.1;
  for (const [k, id] of Object.entries(LAYER)) {
    const g = AC.createGain(); g.gain.value = 0; g.connect(stems.mix);
    const s = AC.createBufferSource(); s.buffer = stems.bufs[id]; s.loop = true; s.connect(g); s.start(stems.t0);
    stems.gains[k] = g; stems.srcs.push(s); stems.target[k] = 0;
  }
  stems.state = 'ready';
}
/** The next bar line (or beat) at or after now, on the shared clock. */
export const nextBar = (now, unit = BAR) => stems.t0 + Math.ceil((now - stems.t0 - 1e-4) / unit) * unit;

/** Layer gains for a music state (MUSIC_V3.md mapping). */
export function mixFor(intensity, sewer, boss) {
  const m = { menu: 0, city: 0, sewer: 0, combat: 0, p1: 0, p2: 0, p3: 0 }, bed = sewer ? 'sewer' : 'city';
  if (intensity === 3) {
    const ph = boss ? boss.phase || 0 : 0;
    m.p1 = ph === 0 ? 0.5 : 1; m.p2 = ph >= 2 ? 1 : 0; m.p3 = ph >= 3 ? 1 : 0;
  } else if (intensity === 2) { m[bed] = 0.85; m.combat = 1; }
  else if (intensity === 1) { m[bed] = 1; m.combat = 0.6; }
  else if (intensity === 0 && boss === 'menu') m.menu = 1;
  else m[bed] = 1;
  return m;
}
/** Called from the music tick: move layers toward the wanted mix, each fade starting on a bar line. */
export function updateStems(intensity, sewer, boss, menu) {
  if (!stemsOn()) return;
  const want = mixFor(menu ? 0 : intensity, sewer, menu ? 'menu' : boss), now = AC.currentTime;
  for (const k of Object.keys(want)) {
    const v = want[k] * TRIM[k];
    if (Math.abs(v - stems.target[k]) < 1e-3) continue;
    // Boss phase entries snap to the next beat; everything else waits for the bar line.
    const unit = intensity === 3 && (k === 'p2' || k === 'p3') && v > stems.target[k] ? BEAT : BAR;
    const at = nextBar(now, unit), g = stems.gains[k].gain;
    // The bed and combat leaving for a boss fade over a whole bar; other moves are short.
    const len = intensity === 3 && (k === 'city' || k === 'sewer' || k === 'combat') ? BAR : FADE;
    g.cancelScheduledValues(at);
    g.setValueAtTime(stems.target[k], at);
    g.linearRampToValueAtTime(v, at + len);
    stems.target[k] = v;
    stems.last = { k, at, len };
  }
}
/** One-shot stinger ('victory' | 'death' | 'clear'), on the next beat, over the loops (which duck for it). */
export function playSting(kind) {
  if (!stemsOn() || !STINGS[kind]) return false;
  const now = AC.currentTime, at = nextBar(now, BEAT), b = stems.bufs[STINGS[kind]];
  const s = AC.createBufferSource(), g = AC.createGain(); g.gain.value = 0.9;
  s.buffer = b; s.connect(g); g.connect(bus); s.start(at);
  const m = stems.mix.gain; m.cancelScheduledValues(at); m.setValueAtTime(m.value, at); m.linearRampToValueAtTime(0.35, at + FADE); m.setValueAtTime(0.35, at + b.duration - 0.5); m.linearRampToValueAtTime(1, at + b.duration);
  stems.lastSting = kind;
  return true;
}
