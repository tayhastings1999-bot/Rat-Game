// Hit streak (folded into turbo; the separate combo meter is gone). Landing hits and kills
// in quick succession builds a streak; past TUNE.turbo.streak.minHits every extra hit adds a
// small turbo-gain bonus, capped at streak.max. Taking a hit, or going streak.window seconds
// without landing one, resets it.
import { G, run } from '../core/state.js';
import { TUNE } from '../tuning.js';

/** A hit (1) or kill (streak.killHits) landed. */
export function streakHit(n = 1) {
  if (G.state !== 'play') return;
  run.streak = (run.streak || 0) + n;
  run.streakT = 0;
}
/** Getting hurt breaks the streak. */
export function streakBreak() { run.streak = 0; }
export function streakTick(dt) {
  run.streakT = (run.streakT || 0) + dt;
  if (run.streakT > TUNE.turbo.streak.window) run.streak = 0;
}
/** Turbo gain multiplier from the current streak: 1 .. 1 + streak.max. */
export function streakMul() {
  const S = TUNE.turbo.streak, over = (run.streak || 0) - S.minHits;
  return over > 0 ? 1 + Math.min(S.max, over * S.perHit) : 1;
}
