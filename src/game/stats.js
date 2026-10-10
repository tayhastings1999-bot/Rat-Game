// Class stats: Strength, Speed, Armor and Magic (TUNE.classes, 1–10 each)
// turned into the numbers the rest of the game reads from `st`. Editing a
// class or stat value in the ?debug panel re-applies it to the rat at once.
import { G, run, st } from '../core/state.js';
import { TUNE, tuneHooks } from '../tuning.js';

export const STAT_KEYS = ['str', 'spd', 'arm', 'mag'];
export const STAT_NAMES = { str: 'Strength', spd: 'Speed', arm: 'Armor', mag: 'Magic' };

/** The class-driven part of `st` for class `k`. */
export function derive(k) {
  const S = TUNE.stats, c = TUNE.classes[k] || TUNE.classes.brawler;
  return {
    maxHp: c.hp,
    speed: S.spdBase + S.spdPer * c.spd,
    primMul: S.strBase + S.strPer * c.str,
    magMul: S.magBase + S.magPer * c.mag,
    taken: Math.max(0.2, 1 - S.armPer * c.arm),
    cd: Math.max(0.5, S.rateBase - S.ratePer * c.spd),
    turboGain: S.gainBase + S.gainPer * c.mag,
    meleeLeech: c.leech || 0,
  };
}

/** Story marks (endings) that adjust stats on top of the class; set by story.js at run start. */
export const marks = { heal: 1, speed: 1, dmg: 0, taken: 1 };

/** Re-derive the live rat's class stats (debug edits), keeping its HP fraction. */
function reapply() {
  if (!run.cls || G.state === 'menu') return;
  const f = run.hp / st.maxHp, d = derive(run.cls);
  Object.assign(st, d);
  st.speed *= marks.speed;
  st.taken *= marks.taken;
  run.hp = Math.min(st.maxHp, Math.max(1, f * st.maxHp));
}
tuneHooks.push(path => { if (path.startsWith('classes.') || path.startsWith('stats.')) reapply(); });
