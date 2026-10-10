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
  stats: {
    // Four class stats (1–10) turn into numbers: Strength → primary damage, Speed → move
    // speed and attack rate, Armor → damage taken, Magic → special, signature, turbo and
    // vial damage plus how fast the turbo meter fills.
    strBase: 0.7, strPer: 0.06, // primary damage × (strBase + strPer·STR)
    spdBase: 5.6, spdPer: 0.32, // move speed = spdBase + spdPer·SPD
    rateBase: 1.12, ratePer: 0.024, // attack and cooldown time × (rateBase − ratePer·SPD)
    armPer: 0.055, // damage taken × (1 − armPer·ARM)
    magBase: 0.7, magPer: 0.06, // special, turbo and vial damage × (magBase + magPer·MAG)
    gainBase: 0.6, gainPer: 0.08, // turbo fill × (gainBase + gainPer·MAG)
  },
  classes: {
    // Base HP, the four stats, and melee life-steal per hit.
    brawler: { hp: 170, str: 8, spd: 5, arm: 6, mag: 3, leech: 0.3 },
    plague: { hp: 120, str: 4, spd: 4, arm: 4, mag: 8, leech: 0 },
    slinger: { hp: 120, str: 5, spd: 8, arm: 4, mag: 4, leech: 0 },
    warlock: { hp: 85, str: 3, spd: 5, arm: 2, mag: 10, leech: 0 },
    tank: { hp: 215, str: 6, spd: 3, arm: 9, mag: 4, leech: 0.6 },
    sneak: { hp: 90, str: 6, spd: 9, arm: 2, mag: 5, leech: 0 },
    roof: { hp: 80, str: 4, spd: 9, arm: 2, mag: 7, leech: 0 },
  },
  turbo: {
    // A 3-segment meter filled by damage you deal. Hold X + Q or X + G for the turbo
    // version of your special or signature; tap X alone for your class turbo blast.
    segments: 3,
    gainPerDmg: 0.002, // segments per point of damage dealt (×Magic)
    specialCost: 1, sigCost: 1,
    window: 1.5, // seconds a turbo special or signature stays boosted
    moveDmg: 2, // turbo special/signature damage ×
    moveArea: 1.5, // turbo special/signature radius ×
    blastMin: 1, // segments needed for a blast (it spends every full one)
    blastBase: 1, blastPerSeg: 0.75, // blast power × (base + perSeg·(segments − 1))
    tapTime: 0.35, // X released within this many seconds without Q/G = blast
    armTime: 1.5, // held longer and let go: turbo stays armed this long for the next Q or G
  },
  vials: {
    // Rot Vials (Z): burst around you, hitting everything in the radius. Damage × Magic.
    start: 1, // carried at the start of a run
    max: 9,
    radius: 11,
    dmg: 120, nestDmg: 90, bossDmg: 260,
    poison: 4, // seconds of rot on everything hit
    chestOdds: 0.3, binOdds: 0.08, eliteOdds: 0.1, // chance to drop one (premium chests always do)
  },
  food: {
    // Health drains all the time; food is the only way back.
    drainBase: 0.5, drainPerZone: 0.1, // HP per second = drainBase + drainPerZone × zone (zone 0 first)
    crumb: 25, wedge: 60, cache: 120, // HP each size restores
    mold: 0.12, moldSewer: 0.25, // chance a drop is moldy (surface, sewer)
    moldPoison: 5, // seconds of poison from eating moldy food
    dropGrace: 0.4, // seconds a fresh drop can't be destroyed by your attacks
    killOdds: 0.012, killOddsLow: 0.05, // crumb chance per kill (healthy / below 35% HP)
  },
  announcer: {
    low: 0.3, crit: 0.12, // bark below these fractions of max HP
    rearm: 0.5, // re-arm once health is back above this
    showSecs: 2.6,
  },
  sneak: {
    backstab: 1.8, // Shiv damage × from behind
    smokeVuln: 1.3, // enemies in the Smoke Bomb take this × damage
    smokeTurboDps: 14, // a turbo Smoke Bomb also burns this much per second
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
/** Systems that cache derived numbers (class stats) re-read them when a value changes. */
export const tuneHooks = [];
export function setTune(path, v) {
  const ks = path.split('.'), last = ks.pop();
  let o = TUNE;
  for (const k of ks) o = o[k];
  o[last] = typeof o[last] === 'number' ? +v : typeof o[last] === 'boolean' ? !!v : v;
  for (const h of tuneHooks) h(path);
}
