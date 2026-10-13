import { CITY_LEVELS, SEWER_LEVELS } from './levels.js';
// Runes and legendary gear (data only, so new realms, runes and class gear are one entry each).
// RUNES: one hidden rune per listed level. Collecting every rune unlocks the final boss (The Crowned One, who
// rises in the Rat King's Court after the King falls). Rune counts are also the hook for future secret rats:
// a class can say `unlock: { req: m => runeCount(m) >= RUNES.length, hint: '...' }` (see data/classes.js).
export const RUNES = [
  { id: 'r_neon', realm: 'city', level: 'neon', name: 'Rune of Neon' },
  { id: 'r_rust', realm: 'city', level: 'rust', name: 'Rune of Rust' },
  { id: 'r_hollow', realm: 'city', level: 'hollow', name: 'Rune of the Heights' },
  { id: 'r_cinder', realm: 'city', level: 'cinder-n', name: 'Rune of Embers' },
  { id: 'r_cistern', realm: 'sewer', level: 'cistern', name: 'Rune of Tides' },
  { id: 'r_butcher', realm: 'sewer', level: 'butcher', name: 'Rune of Blood' },
  { id: 'r_frozen', realm: 'sewer', level: 'frozen', name: 'Rune of Frost' },
  { id: 'r_toxic', realm: 'sewer', level: 'toxic', name: 'Rune of Rot' },
];
export const runeCount = (m, realm) => RUNES.filter(r => (!realm || r.realm === realm) && m.runes && m.runes[r.id]).length;
export const finalOpen = m => runeCount(m) >= RUNES.length;
export const FINAL_LEVEL = 'court';

// Legendary class gear, guarded by realm bosses: beating the boss in `boss` while playing `cls` drops it once
// per burrow. Bonuses are modest ("strong, never safe"): a stat point plus a small multiplier.
export const GEAR = {
  tank: { boss: 'exterm', name: 'Gutter King\'s Plate', stat: 'arm', add: 1, mul: { maxHp: 1.1 }, txt: '+1 Armor, +10% max HP' },
  slinger: { boss: 'murder', name: 'Crowfeather Sling', stat: 'spd', add: 1, mul: { dmg: 1.08 }, txt: '+1 Speed, +8% damage' },
  warlock: { boss: 'brood', name: 'Brood-Eye Focus', stat: 'mag', add: 1, mul: { dmg: 1.08 }, txt: '+1 Magic, +8% damage' },
  sneak: { boss: 'maw', name: 'Many-Fang Shiv', stat: 'str', add: 1, mul: { dmg: 1.08 }, txt: '+1 Strength, +8% damage' },
};

// Rune fragments: every regular (non-secret) level hides one fragment in a hidden area (a city courtyard
// behind a false wall, or a sewer pocket behind drywall). All of them form the Great Rune, which summons
// the secret boss (The Nameless Rat) in the Court after the Rat King and, if all runes are held, after
// The Crowned One too. Kept per save slot in meta.fragments. The list derives from the level tables, so
// a new level gets a fragment automatically.
export const FRAGMENTS = [...CITY_LEVELS, ...SEWER_LEVELS].filter(L => !L.secret).map(L => ({ id: 'f_' + L.id, level: L.id }));
export const fragCount = m => FRAGMENTS.filter(f => m.fragments && m.fragments[f.id]).length;
export const greatRune = m => fragCount(m) >= FRAGMENTS.length;
