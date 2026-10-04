// Leveling: XP comes straight from kills; level-ups apply at once with a short
// banner and a shockwave, no pause. (Phase 3 adds per-class stat growth.)
import { rand } from '../core/util.js';
import { G, P, run, st } from '../core/state.js';
import { boom, fx } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { hit, near, scrapDrop, dropFood } from '../combat/combat.js';
import { TUNE } from '../tuning.js';
import { banner } from '../ui/hud.js';

/** XP needed for the next level (see TUNE.xp). */
export const need = L => { const X = TUNE.xp; return Math.round(X.base + X.lin * (L - 1) + X.mul * Math.pow(L - 1, X.exp)); };

/** XP for a kill. */
export function addXP(v) {
  if (!(v > 0) || run.level >= TUNE.xp.maxLevel) return;
  run.xp += v * (st.xp || 1);
  while (run.xp >= run.need && run.level < TUNE.xp.maxLevel) {
    run.xp -= run.need;
    run.level++;
    run.need = need(run.level);
    levelBurst();
    banner(`Level ${run.level}`, '');
    sfx('level');
  }
}

/** Every level: a shockwave that shoves the horde back and a beat of slow-mo. */
export function levelBurst() {
  const R = 4.2;
  for (const e of near(P.x, P.y, P.z, R)) hit(e, 6, Math.atan2(e.x - P.x, e.z - P.z), 11, 'level', true);
  fx('ring', P.x, P.y, P.z, R, 0x6ad0ff, 0.4);
  boom(P.x, P.y + 0.6, P.z, 2.6, 0x9ad8ff);
  G.hitStop = Math.max(G.hitStop, 0.06);
  G.flashGold = 0.4;
}

/** A small pile of loot: gold, and sometimes food. Replaces the old weapon crates. */
export function dropLoot(x, y, z, gold = 12, foodChance = 0.5) {
  for (let i = 0; i < gold; i++) scrapDrop(x + rand(-0.8, 0.8), y, z + rand(-0.8, 0.8));
  if (Math.random() < foodChance) dropFood(x, y, z);
  boom(x, y + 0.6, z, 2, 0xffd070);
}

export function tickProgress(dt) {
  if (G.flashGold) G.flashGold = Math.max(0, G.flashGold - dt * 1.5);
}
