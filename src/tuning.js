// Every gameplay number in one place. The ?debug panel edits these live, and
// systems read them at the moment they need them, so a change takes effect at
// once. Values are grouped by system; each has a short note. New and rebuilt
// systems read from here; older numbers move in as their systems are rebuilt.
export const TUNE = {
  enemies: {
    cap: 200, // live enemies at once (nests pulse and hold at the cap)
  },
  zone: {
    // Enemy strength by zone (zone 0 = the first). Replaces the old threat engine.
    threatPerZone: 2, // the zone's difficulty index, per zone number
    hpPerThreat: 0.2, // enemy HP +20% per point
    dmgPerThreat: 0.075, // enemy damage +7.5% per point
    spdPerThreat: 0.03, // enemy speed +3% per point (max +55%)
    atkPerThreat: 0.07, // enemy attack rate +7% per point (max +140%)
    eliteBase: 0.02, // elite odds at zone 0, after the first minute
    elitePerThreat: 0.008,
    eliteMax: 0.2,
  },
  camera: {
    // Fixed-angle follow camera. Walls between it and the rat get a dithered see-through hole.
    pitch: 0.9, // radians above the horizon
    dist: 13, // starting distance; the mouse wheel zooms between minDist and maxDist
    minDist: 8,
    maxDist: 20,
    fov: 55,
    lead: 0.16, // look ahead of the rat by this × its velocity
    cutPitch: 1.32, // steeper look-down inside ducts and buildings (the cutaway)
    fade: true, // the see-through hole
    fadeRadius: 2.6, // hole radius around the rat, world units
    fadeOpacity: 0.92, // how open the hole's centre is (1 = fully clear)
  },
  player: {
    rollCd: 1.2, // seconds between dodges
    rollTime: 0.3, // dodge duration
    rollIframes: 0.34, // invulnerability during the dodge
    rollSpeed: 2.3, // dodge speed, × move speed
  },
  combat: {
    meleeFlyReach: 6, // melee primaries swat flying enemies up to this far above the rat
  },
  aim: {
    maxRange: 18, // the mouse aim point is clamped to this distance
    touchCone: 1.0, // touch attack: radians either side of facing searched for a target
    touchRange: 14,
  },
  xp: {
    // XP to the next level: base + lin·(L−1) + mul·(L−1)^exp
    base: 12, lin: 9, mul: 2.2, exp: 1.7,
    maxLevel: 99,
  },
};

/** Flat list of [path, value] for the debug panel. */
export function tuneEntries(o = TUNE, pre = '') {
  const out = [];
  for (const k in o) {
    const v = o[k], p = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object') out.push(...tuneEntries(v, p));
    else out.push([p, v]);
  }
  return out;
}
export function setTune(path, v) {
  const ks = path.split('.'), last = ks.pop();
  let o = TUNE;
  for (const k of ks) o = o[k];
  o[last] = typeof o[last] === 'number' ? +v : typeof o[last] === 'boolean' ? !!v : v;
}
