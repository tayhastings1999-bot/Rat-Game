// Stepped zoom for the TD-3 orthographic camera. Pure helpers (tested in scripts/sprites-test.mjs).

/** Smallest step that fits `need` world units. Hysteresis: from the current step `cur`, only drop to a
 * smaller step once `need` fits within hyst × that smaller step, so co-op framing doesn't flicker. */
export function pickStep(need, steps, cur = null, hyst = 0.85) {
  let pick = steps[steps.length - 1];
  for (const s of steps) if (need <= s) { pick = s; break; }
  if (cur != null && pick < cur && need > pick * hyst) return cur;
  return pick;
}

/** The step one notch in `dir` (+1 out, -1 in) from the step nearest `cur`. */
export function stepFrom(cur, steps, dir) {
  let i = 0;
  for (let k = 1; k < steps.length; k++) if (Math.abs(steps[k] - cur) < Math.abs(steps[i] - cur)) i = k;
  return steps[Math.max(0, Math.min(steps.length - 1, i + Math.sign(dir)))];
}

/** Ortho screen-space radius in pixels of `r` world units, for a frustum `halfH` world units tall (half). */
export const orthoRadiusPx = (r, halfH, screenH) => r / halfH * (screenH / 2);
