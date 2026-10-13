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
  { id: 'cinder', base: 0, seed: 'cinder' },
  { id: 'neon', base: 1, seed: 'neon' },
  { id: 'rust', base: 2, seed: 'rust' },
  { id: 'hollow', base: 3, seed: 'hollow', grave: true, secretTo: 'vault' },
  { id: 'cinder-n', base: 0, seed: 'cinder-night', title: 'Cinder Row · After Dark', night: true, haz: 'blackout', fam: ['prowl', 'vermin', 'wings'], boss: 'tabby', bossV: 'frenzied', over: { ...night, lamp: 0x9ab0ff, neon: [0xff3a6a, 0x6a3aff] } },
  { id: 'neon-n', base: 1, seed: 'neon-night', title: 'Neon Market · Last Call', night: true, haz: 'cats', fam: ['wings', 'guard'], boss: 'murder', bossV: 'brood', grave: true, over: { ...night, lamp: 0xff60ff, neon: [0xff3ad0, 0x3affd0, 0xffe03a] } },
  { id: 'rust-n', base: 2, seed: 'rust-night', title: 'Rust Yards · Nightshift', night: true, haz: 'collapse', fam: ['guard', 'rot', 'prowl'], boss: 'exterm', bossV: 'armored', secretTo: 'run', over: { ...night, lamp: 0xffa040 } },
  { id: 'hollow-n', base: 3, seed: 'hollow-night', title: 'Hollow Heights · Moonrise', night: true, haz: 'bloodmoon', fam: ['prowl', 'wings', 'vermin'], boss: 'tabby', bossV: 'brood', grave: true, over: { ...night, lamp: 0xc0d0ff, neon: [0x9ad0ff] } },
];
const deep = { fog: 0x080608 };
export const SEWER_LEVELS = [
  { id: 'under', base: 0, seed: 'undersewer' },
  { id: 'cistern', base: 1, seed: 'cisterns' },
  { id: 'butcher', base: 2, seed: 'butchers-drain', grave: true },
  { id: 'frozen', base: 3, seed: 'frozen-pipeworks', secretTo: 'garden' },
  { id: 'toxic', base: 4, seed: 'toxic-refinery' },
  { id: 'court', base: 5, seed: 'rat-kings-court', grave: true },
  { id: 'under-d', base: 0, seed: 'deep-undersewer', title: 'The Deep Undersewer', haz: 'decay', fam: ['rot', 'prowl'], boss: 'maw', bossV: 'frenzied', over: { ...deep, lamp: 0xff8040 } },
  { id: 'cistern-d', base: 1, seed: 'undertow', title: 'Flooded Cisterns · Undertow', haz: 'currents', fam: ['wings', 'rot', 'vermin'], boss: 'brood', bossV: 'brood', over: { ...deep, lamp: 0x40c0ff } },
  { id: 'butcher-d', base: 2, seed: 'bloodworks', title: "Butcher's Drain · Bloodworks", haz: 'bloodmoon', fam: ['guard', 'vermin'], boss: 'ratking', bossV: 'armored', grave: true, over: { ...deep, lamp: 0xff2a20 } },
  { id: 'frozen-d', base: 3, seed: 'black-ice', title: 'Frozen Pipeworks · Black Ice', haz: 'gravity', fam: ['wings', 'guard', 'prowl'], boss: 'maw', bossV: 'armored', over: { ...deep, lamp: 0x60a0ff } },
  { id: 'toxic-d', base: 4, seed: 'meltdown', title: 'Toxic Refinery · Meltdown', haz: 'tides', fam: ['rot', 'vermin', 'wings'], boss: 'brood', bossV: 'frenzied', over: { ...deep, lamp: 0xa0ff20 } },
];

/** Secret zones: no boss. The Vault and the Rat Run are timed loot dashes; the Bone Garden is a nest gauntlet. */
export const SECRET_LEVELS = {
  vault: { id: 'vault', kind: 'city', base: 1, seed: 'cheese-vault', title: 'The Cheese Vault', secret: 'vault', haz: null, fam: ['vermin'], over: { fog: 0x1e1408, sky: 0x2a1a08, lamp: 0xffd040, neon: [0xffd040, 0xffb020] } },
  run: { id: 'run', kind: 'city', base: 0, seed: 'rat-run', title: 'The Rat Run', secret: 'run', haz: null, fam: ['vermin'], over: { fog: 0x14100a, lamp: 0xffe080 } },
  treasure: { id: 'treasure', kind: 'city', base: 1, seed: 'treasure-room', title: 'Treasure Room', secret: 'treasure', haz: null, fam: ['vermin'], over: { fog: 0x2a1c06, sky: 0x3a2808, lamp: 0xffe060, neon: [0xffd040, 0xfff0a0] } },
  garden: { id: 'garden', kind: 'sewer', base: 2, seed: 'bone-garden', title: 'The Bone Garden', secret: 'garden', haz: null, fam: ['vermin', 'wings', 'rot', 'prowl', 'guard'], over: { fog: 0x0c0a0e, lamp: 0xe0d8c0 } },
};

/** Boss variants for the remixes: a new name and a twist on the same body (numbers in TUNE.bossVariants). */
export const BOSS_VARIANTS = {
  frenzied: { suffix: ', Unleashed', tint: 0xff6040, desc: 'faster, and attacks far more often' },
  armored: { suffix: ' in Iron', tint: 0x8090a0, desc: 'tougher hide: takes less damage, more HP' },
  brood: { suffix: ' and Brood', tint: 0x60ff60, desc: 'calls its family in at every phase' },
};

