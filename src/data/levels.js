// The level list: 22 levels. Each is a zone template (SURFACE / SEWER in
// world.js) plus a fixed seed, so a level has the same layout every time, and
// its own hazard, enemy families and boss. Night remixes and the deep sewer
// reuse a zone's look on a new layout with a different mix and a boss variant
// (BOSS_VARIANTS). Three secret zones are reached through hidden drains.
//
//   city  0–3  Cinder Row, Neon Market, Rust Yards, Hollow Heights
//   city  4–7  the same streets after dark
//   sewer 0–4  Undersewer, Flooded Cisterns, Butcher's Drain, Frozen Pipeworks, Toxic Refinery
//   sewer 5    Rat King's Court
//   sewer 6–10 the deep sewer: remixes of 0–4
//   secret     The Cheese Vault, The Rat Run, The Bone Garden
//
// `grave`: the Reaper sleeps in a grave in this level and rises when you come close.
// `secretTo`: a hidden drain here leads to that secret zone.

const night = { fog: 0x0a0a16, sky: 0x0c0a1c };
export const CITY_LEVELS = [
  { id: 'cinder', base: 0, seed: 'cinder', map: 92, blockGap: 14, hiddenExtra: 3, alleyOdds: 0.28 }, // try 1 knobs kept: median 9.3 was closer to ~11 than try 2's 7.9
  { id: 'neon', base: 1, seed: 'neon', map: 90, blockGap: 17, hiddenExtra: 3, alleyOdds: 0.16 }, // try 2: pull back from try 1 median 14.0 (target ~11)
  { id: 'rust', base: 2, seed: 'rust', hiddenExtra: 2, alleyOdds: 0.85 }, // longer B2 crane-yard loop + extra hidden yards (Rat 3: target ~12 min, no extra nests)
  { id: 'hollow', base: 3, seed: 'hollow', grave: true, secretTo: 'vault' },
  { id: 'cinder-n', base: 0, seed: 'cinder-night', title: 'Cinder Row · After Dark', night: true, haz: 'blackout', fam: ['prowl', 'vermin', 'wings'], boss: 'tabby', bossV: 'frenzied', map: 86, blockGap: 12, hiddenExtra: 2, alleyOdds: 0.28, darkStretches: 8, over: { ...night, lamp: 0x9ab0ff, neon: [0xff3a6a, 0x6a3aff] } }, // route length through Blackout dark stretches, not more enemies (PR 3b: target ~13)
  { id: 'neon-n', base: 1, seed: 'neon-night', title: 'Neon Market · Last Call', night: true, haz: 'cats', fam: ['wings', 'guard'], boss: 'murder', bossV: 'brood', grave: true, over: { ...night, lamp: 0xff60ff, neon: [0xff3ad0, 0x3affd0, 0xffe03a] } },
  { id: 'rust-n', base: 2, seed: 'rust-night', title: 'Rust Yards · Nightshift', night: true, haz: 'collapse', fam: ['guard', 'rot', 'prowl'], boss: 'exterm', bossV: 'armored', secretTo: 'run', over: { ...night, lamp: 0xffa040 } },
  { id: 'hollow-n', base: 3, seed: 'hollow-night', title: 'Hollow Heights · Moonrise', night: true, haz: 'bloodmoon', fam: ['prowl', 'wings', 'vermin'], boss: 'tabby', bossV: 'brood', grave: true, over: { ...night, lamp: 0xc0d0ff, neon: [0x9ad0ff] } },
];
const deep = { fog: 0x080608 };
export const SEWER_LEVELS = [
  { id: 'under', base: 0, seed: 'undersewer', sideRooms: 5, loops: 0, map: 87, spread: 5, spine: true, cuts: 0, pumpHall: true, pumpWrap: true }, // larger spine + unique rim pump-hall, no detour shortcuts; gentle first sewer (target ~11 min)
  { id: 'cistern', base: 1, seed: 'cisterns', loops: 2, map: 72, spread: 4, detour: true, pumpHall: true }, // pillar-cistern loop so the near exit still lands in 10–20
  { id: 'butcher', base: 2, seed: 'butchers-drain', grave: true, sideRooms: 8, loops: 2, map: 72, spread: 4, pumpHall: true }, // cold-store side rooms + one hook-gallery hall (target ~13 min; random detours were getting the bot lost)
  { id: 'frozen', base: 3, seed: 'frozen-pipeworks', secretTo: 'garden' },
  { id: 'toxic', base: 4, seed: 'toxic-refinery' },
  { id: 'court', base: 5, seed: 'rat-kings-court', grave: true },
  { id: 'under-d', base: 0, seed: 'deep-undersewer', title: 'The Deep Undersewer', haz: 'decay', fam: ['rot', 'prowl'], boss: 'maw', bossV: 'frenzied', over: { ...deep, lamp: 0xff8040 } },
  { id: 'cistern-d', base: 1, seed: 'undertow', title: 'Flooded Cisterns · Undertow', loops: 2, map: 72, spread: 4, detour: true, pumpHall: true, haz: 'currents', fam: ['wings', 'rot', 'vermin'], boss: 'brood', bossV: 'brood', over: { ...deep, lamp: 0x40c0ff } },
  { id: 'butcher-d', base: 2, seed: 'bloodworks', title: "Butcher's Drain · Bloodworks", haz: 'bloodmoon', fam: ['guard', 'vermin'], boss: 'ratking', bossV: 'armored', grave: true, rooms: 22, nests: 14, over: { ...deep, lamp: 0xff2a20 } }, // ceiling: ≤22 rooms, ≤14 nests (Rat 3); trim variant only if still over 20
  { id: 'frozen-d', base: 3, seed: 'black-ice', title: 'Frozen Pipeworks · Black Ice', haz: 'gravity', fam: ['wings', 'guard', 'prowl'], boss: 'maw', bossV: 'armored', over: { ...deep, lamp: 0x60a0ff } },
  { id: 'toxic-d', base: 4, seed: 'meltdown', title: 'Toxic Refinery · Meltdown', loops: 2, map: 72, spread: 4, detour: true, haz: 'tides', fam: ['rot', 'vermin', 'wings'], boss: 'brood', bossV: 'frenzied', over: { ...deep, lamp: 0xa0ff20 } },
];

/** Secret zones. The Vault, the Rat Run and the Treasure Room are timed loot dashes with no boss (their exit is open
 *  from the start and the clock throws you out, so they cannot lock). The Bone Garden is a nest gauntlet with a boss:
 *  The Brood Mother (and Brood) wakes when the Warrens fall, and her key opens the way out. */
export const SECRET_LEVELS = {
  vault: { id: 'vault', kind: 'city', base: 1, seed: 'cheese-vault', title: 'The Cheese Vault', secret: 'vault', haz: null, fam: ['vermin'], over: { fog: 0x1e1408, sky: 0x2a1a08, lamp: 0xffd040, neon: [0xffd040, 0xffb020] } },
  run: { id: 'run', kind: 'city', base: 0, seed: 'rat-run', title: 'The Rat Run', secret: 'run', haz: null, fam: ['vermin'], over: { fog: 0x14100a, lamp: 0xffe080 } },
  treasure: { id: 'treasure', kind: 'city', base: 1, seed: 'treasure-room', title: 'Treasure Room', secret: 'treasure', haz: null, fam: ['vermin'], over: { fog: 0x2a1c06, sky: 0x3a2808, lamp: 0xffe060, neon: [0xffd040, 0xfff0a0] } },
  garden: { id: 'garden', kind: 'sewer', base: 2, seed: 'bone-garden', title: 'The Bone Garden', secret: 'garden', boss: 'brood', bossV: 'brood', haz: null, fam: ['vermin', 'wings', 'rot', 'prowl', 'guard'], over: { fog: 0x0c0a0e, lamp: 0xe0d8c0 } },
};

/** Boss variants for the remixes: a new name and a twist on the same body (numbers in TUNE.bossVariants). */
export const BOSS_VARIANTS = {
  frenzied: { suffix: ', Unleashed', tint: 0xff6040, desc: 'faster, and attacks far more often' },
  armored: { suffix: ' in Iron', tint: 0x8090a0, desc: 'tougher hide: takes less damage, more HP' },
  brood: { suffix: ' and Brood', tint: 0x60ff60, desc: 'calls its family in at every phase' },
};

