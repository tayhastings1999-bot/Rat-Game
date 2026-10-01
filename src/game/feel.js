// Moment-to-moment feel: perfect dodges and the cold open.
import { rand } from '../core/util.js';
import { G, P, run, st } from '../core/state.js';
import { fx, dnum, spark } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { tileAt } from '../world/grid.js';
import { spawnEnemy } from '../entities/mobs.js';
import { comboGain } from './swarm.js';
import { contract } from './contracts.js';
import { banner } from '../ui/hud.js';

/** Window at the start of a roll (seconds) in which a hit you slip through counts as perfect. */
export const PERFECT_WINDOW = 0.24;

/**
 * Called by hurtP when an attack lands during roll i-frames. If it was in the
 * opening window of the roll: slow-mo, a two-second guaranteed-crit window,
 * the roll's stamina back, and a chunk of combo.
 */
export function tryPerfectDodge() {
  if (!(P.roll > 0) || 0.3 - P.roll > PERFECT_WINDOW || (P.pdCd || 0) > G.time) return;
  P.pdCd = G.time + 0.5;
  P.perfectT = 2;
  G.slowMo = 0.45;
  run.sta = Math.min(st.staMax, run.sta + 18);
  comboGain(12);
  run.perfects = (run.perfects || 0) + 1;
  contract('perfect');
  dnum(P.x, P.y + 1.8, P.z, 'PERFECT', 'crit');
  fx('ring', P.x, P.y, P.z, 3.5, 0x9af0ff, 0.45);
  spark(P.x, P.y + 0.6, P.z, 2, 0x9af0ff);
  G.flashGold = Math.max(G.flashGold || 0, 0.35);
  sfx('perfect');
}
export const perfectCrit = () => (P.perfectT || 0) > 0;
export function tickFeel(dt) { if (P.perfectT > 0) P.perfectT -= dt; }

/** Runs open mid-chase: a pack is already on your tail. */
export function coldOpen() {
  const fwd = G.camYaw;
  let n = 0;
  for (let i = 0; i < 24 && n < 8; i++) {
    const a = fwd + Math.PI + rand(-1, 1), r = rand(9, 13), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r, t = tileAt(x, z);
    if (t !== 1 && t !== 9 && t !== 10) continue;
    if (spawnEnemy('mawling', x, z, { plain: true })) n++;
  }
  if (n) banner('Run!', 'They smelled you first · fight back or scatter');
  run.coldOpen = true;
  return n;
}
