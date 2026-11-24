// Kill hit-stop is a render-only freeze: the sim keeps full dt, visuals hold.
// Non-kill hit-stop (heavy hits, the rat getting hurt) still slows sim time.
import { TUNE } from '../tuning.js';

/**
 * Start a render-only kill freeze of `dur` seconds (capped). A new kill during
 * an active freeze or its short cooldown cannot extend it past the original
 * length, so kill streaks never chain the freeze.
 */
export function applyKillHitStop(g, dur, F = TUNE.feel) {
  const want = Math.min(F.hitStopCap, Math.max(0, dur));
  if (want <= 0) return;
  if ((g.killStopCd || 0) > 0) return;
  if ((g.killStop || 0) > 0) {
    g.killStop = Math.min(g.killStopMax || want, Math.max(g.killStop, want));
  } else {
    g.killStopMax = want;
    g.killStop = want;
  }
  g.killStopCd = F.hitStopKillCd;
}

/** Tick the kill freeze on real time. The streak cooldown starts after the freeze ends, so a mid-freeze kill cannot refresh it. */
export function tickKillHitStop(g, dt) {
  if (g.killStop > 0) g.killStop = Math.max(0, g.killStop - dt);
  else {
    if (g.killStopCd > 0) g.killStopCd = Math.max(0, g.killStopCd - dt);
    g.feelTime = (g.feelTime || 0) + dt;
  }
}

/** Sim step length. Non-kill hit-stop and perfect-dodge slow-mo only; kill freeze is not applied here. */
export function simDt(g, dt) {
  if (g.hitStop > 0) { g.hitStop -= dt; return dt * 0.06; }
  if (g.slowMo > 0) { g.slowMo -= dt; return dt * 0.3; }
  return dt;
}

/** Visual step length: 0 while a kill freeze is holding frames, particles, gibs and the camera. */
export function feelDt(g, dt) {
  return g.killStop > 0 ? 0 : dt;
}

/** Visual clock used for sprite frames; pauses for the kill freeze. */
export function feelNow(g) {
  return g.feelTime || 0;
}

/**
 * Low-HP vignette intensity in 0..1. Snaps on at TUNE.feel.lowHp to
 * TUNE.feel.lowHpVig, then deepens to 1 at 0 HP.
 */
export function lowHpVignette(hp, maxHp, F = TUNE.feel) {
  if (!maxHp) return 0;
  const frac = hp / maxHp;
  if (frac > F.lowHp) return 0;
  const t = 1 - Math.max(0, frac) / F.lowHp;
  return F.lowHpVig + (1 - F.lowHpVig) * t;
}
