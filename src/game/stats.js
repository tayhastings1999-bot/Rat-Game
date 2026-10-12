// Class stats: Strength, Speed, Armor and Magic (TUNE.classes, 1–10 each)
// turned into the numbers the rest of the game reads from `st`. Editing a
// class or stat value in the ?debug panel re-applies it to the rat at once.
import { G, P, run, st } from '../core/state.js';
import { coopGrow } from './coop.js';
import { TUNE, tuneHooks } from '../tuning.js';
import { powerScaling } from '../combat/combat.js';

export const STAT_KEYS = ['str', 'spd', 'arm', 'mag'];
export const STAT_NAMES = { str: 'Strength', spd: 'Speed', arm: 'Armor', mag: 'Magic' };
/** Diminishing returns past TUNE.balance.softAt: linear below, then x/(1+x/R) above (asymptote softAt+R). */
export function soft(v, at = TUNE.balance.softAt, R = TUNE.balance.softR) {
  if (v <= at) return v;
  const x = v - at;
  return at + x / (1 + x / R);
}

/** The class-driven part of `st` for class `k`, including what the current run's levels have grown. */
export function derive(k) {
  const S = TUNE.stats, c0 = TUNE.classes[k] || TUNE.classes.tank, g = run.cls === k && run.growth ? run.growth : null;
  const c = g ? { ...c0, str: soft(c0.str + g.str), spd: soft(c0.spd + g.spd), arm: soft(c0.arm + g.arm), mag: soft(c0.mag + g.mag) } : c0;
  return {
    maxHp: c0.hp + (g ? g.hp : 0),
    speed: S.spdBase + S.spdPer * c.spd,
    primMul: S.strBase + S.strPer * c.str,
    magMul: S.magBase + S.magPer * c.mag,
    taken: Math.max(TUNE.balance.armFloor, 1 - S.armPer * c.arm),
    cd: Math.max(0.5, S.rateBase - S.ratePer * c.spd),
    turboGain: S.gainBase + S.gainPer * c.mag,
    meleeLeech: c.leech || 0,
  };
}

/** Story marks (endings) that adjust stats on top of the class; set by story.js at run start. */
export const marks = { heal: 1, speed: 1, dmg: 0, taken: 1 };

/**
 * Stat growth on level-up (TUNE.growth): each level adds `perLevel` stat points,
 * split across the four stats in proportion to the class's own stats, so a
 * class grows along its strengths. Max HP grows too, and the gain is healed.
 * Returns the stats that grew most this level, for the banner.
 */
export function growStats() {
  const G2 = TUNE.growth, c = TUNE.classes[run.cls] || TUNE.classes.tank, sum = STAT_KEYS.reduce((a, s) => a + c[s], 0) || 1;
  const g = run.growth || (run.growth = { str: 0, spd: 0, arm: 0, mag: 0, hp: 0 });
  for (const s of STAT_KEYS) g[s] += G2.perLevel * c[s] / sum;
  g.hp += G2.hp;
  const hp0 = st.maxHp;
  reapply();
  run.hp = Math.min(st.maxHp, run.hp + (st.maxHp - hp0));
  coopGrow(growOne);
  return STAT_KEYS.slice().sort((a, b) => c[b] - c[a]).slice(0, 2).map(s => STAT_NAMES[s]);
}
/** Level growth for another co-op rat (no banner). */
function growOne() {
  const G2 = TUNE.growth, c = TUNE.classes[run.cls] || TUNE.classes.tank, sum = STAT_KEYS.reduce((a, s) => a + c[s], 0) || 1;
  const g = run.growth || (run.growth = { str: 0, spd: 0, arm: 0, mag: 0, hp: 0 });
  for (const s of STAT_KEYS) g[s] += G2.perLevel * c[s] / sum;
  g.hp += G2.hp;
  const hp0 = st.maxHp, down = P.downed, h = run.hp;
  reapply();
  run.hp = down ? h : Math.min(st.maxHp, run.hp + (st.maxHp - hp0));
}

/** Re-derive the live rat's class stats (debug edits, level growth), keeping its HP fraction. */
function reapply() {
  if (!run.cls || G.state === 'menu') return;
  const f = run.hp / st.maxHp, d = derive(run.cls);
  Object.assign(st, d);
  st.speed *= marks.speed;
  st.taken *= marks.taken;
  run.hp = Math.min(st.maxHp, Math.max(1, f * st.maxHp));
  powerScaling();
}
tuneHooks.push(path => { if (path.startsWith('classes.') || path.startsWith('stats.')) reapply(); });
