// Combo meter: hits and kills fill a fast-draining meter; taking a hit empties
// it. (Phase 2 turns it into the 3-segment Turbo meter.)
import { G, run, st } from '../core/state.js';

export const COMBO_MAX = 100;

export function comboGain(v) {
  if (G.state !== 'play') return;
  run.combo = Math.min(COMBO_MAX, (run.combo || 0) + v * (st.comboMul || 1));
  run.comboT = 0;
}
/** Getting hurt breaks the combo. */
export function comboBreak() { run.combo = 0; }
export function comboTick(dt) {
  run.comboT = (run.comboT || 0) + dt;
  if (run.comboT > 1) run.combo = Math.max(0, (run.combo || 0) - (25 + (run.combo || 0) * 0.4) * dt);
}
