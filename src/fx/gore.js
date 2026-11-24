// Gore toggle and damage-scaled burst counts. No renderer imports (unit-tested).
// ?gore=0 / ?gore=1 is TUNE.gore.force; otherwise settings.gore (default on).
import { TUNE } from '../tuning.js';

export function goreOn(settings) {
  const f = TUNE.gore.force;
  if (f === true || f === false) return f;
  return !settings || settings.gore !== false;
}

/** How many blood particles a hit should spawn, scaled by damage and crit. */
export function bloodCount(dmg, crit = false, g = TUNE.gore) {
  const n = g.bloodMin + Math.min(g.bloodMax - g.bloodMin, (dmg || 0) * g.bloodPerDmg) + (crit ? g.bloodCrit : 0);
  return Math.max(0, Math.round(n));
}
