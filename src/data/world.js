// Enemy stats, bosses, districts and hazard modifiers.
import { run } from '../core/state.js';

export const EN = {
  cat: { hp: 55, spd: 5.4, dmg: 13, r: 0.7, h: 1.4, xp: 5, col: 0xb8783a, blood: 0xa01010, sc: 0.8, mass: 1.5 },
  crow: { hp: 18, spd: 6.5, dmg: 10, r: 0.5, h: 0.6, xp: 3, col: 0x1a181e, blood: 0x7a0a0a, fly: true },
  moth: { hp: 24, spd: 4, dmg: 8, r: 0.6, h: 0.7, xp: 3, col: 0xd8ccb0, blood: 0xc0d060, fly: true },
  wasp: { hp: 15, spd: 5, dmg: 9, r: 0.4, h: 0.5, xp: 2, col: 0xe0b020, blood: 0xd0c040, fly: true },
  shade: { hp: 34, spd: 4.4, dmg: 14, r: 0.45, h: 1.3, xp: 4, col: 0x1a1024, blood: 0x6a1a8a },
  roach: { hp: 5, spd: 7.5, dmg: 4, r: 0.3, h: 0.3, xp: 0.5, col: 0x5a3418, blood: 0xc0a040 },
  mawling: { hp: 10, spd: 4.6, dmg: 8, r: 0.42, h: 0.7, xp: 1, col: 0x2e2434, blood: 0x8a0c0c },
  tick: { hp: 7, spd: 6.2, dmg: 6, r: 0.36, h: 0.5, xp: 1, col: 0x6a1616, blood: 0xc01818 },
  ghoul: { hp: 34, spd: 3.4, dmg: 12, r: 0.62, h: 1.3, xp: 3, col: 0x2a2028, blood: 0x5a0606, mass: 1.8 },
  bloat: { hp: 40, spd: 2.2, dmg: 10, r: 0.66, h: 1.3, xp: 3, col: 0x8e9a70, blood: 0x8ac030, mass: 2 },
  bat: { hp: 12, spd: 5.6, dmg: 7, r: 0.45, h: 0.55, xp: 2, col: 0x221c26, blood: 0xa01010, fly: true },
  brute: { hp: 140, spd: 3, dmg: 20, r: 0.9, h: 2.1, xp: 10, col: 0x5a2a20, blood: 0x9a0c0c, bar: true, mass: 3 },
};

/** Bosses: base HP is multiplied by district tier and live threat when they wake. */
export const BOSSES = {
  tabby: { name: 'The Horned Tabby', geo: 'brute', sc: 2.1, hp: 5200, spd: 4.4, col: 0x5a2a20, blood: 0x9a0c0c },
  murder: { name: 'The Murder King', geo: 'crow', sc: 4.2, hp: 4300, spd: 7.5, fly: true, col: 0x1a181e, blood: 0x7a0a0a },
  exterm: { name: 'The Exterminator', geo: 'drone', sc: 2.2, hp: 5600, spd: 5.5, fly: true, col: 0x4a4e54, blood: 0x9be06a },
  maw: { name: 'The Many-Mouthed', geo: 'ghoul', sc: 3, hp: 6000, spd: 3.8, col: 0x2a2028, blood: 0x5a0606 },
  brood: { name: 'The Brood Mother', geo: 'tick', sc: 4.4, hp: 5400, spd: 4.2, col: 0x6a1616, blood: 0xc01818 },
  ratking: { name: 'The Rat King', geo: 'ratking', sc: 2.6, hp: 7000, spd: 3.9, col: 0x6e6874, blood: 0x8a0c0c },
};

export const MODS = {
  currents: { name: 'Erratic Currents', desc: 'Vents shove you around, and some launch you skyward. Their direction keeps shifting.', col: '#9ad0ff' },
  gravity: { name: 'Shifting Gravity', desc: 'Zones flip between feather-light and crushing, then drift elsewhere.', col: '#c080ff' },
  decay: { name: 'Corrosive Decay', desc: 'Drifting fields of rot eat flesh. Lure the horde through them.', col: '#9be06a' },
  blackout: { name: 'Blackout', desc: 'The lamps are dead. Stay near your own light.', col: '#e0382c' },
  tides: { name: 'Flooding Tides', desc: 'The water rises every so often. Climb or get bogged down.', col: '#60d8c8' },
  cats: { name: 'Cat Patrols', desc: 'Big predator cats prowl set routes. Squeeze low to slip past.', col: '#ffb070' },
  collapse: { name: 'Collapsing Floors', desc: 'Cracked tiles give way a moment after you step on them.', col: '#a89468' },
  bait: { name: 'Poison Bait', desc: 'Green pellets poison whatever eats them. Lure the horde over.', col: '#9be06a' },
  bloodmoon: { name: 'Blood Moon', desc: 'Every few minutes the moon turns and the horde doubles.', col: '#ff4a3a' },
};

/**
 * Surface neighbourhoods (open city) and sewer layers (the high-risk expansion).
 * `palette` holds facade colours; `heights` the roof heights a building can roll.
 */
export const SURFACE = [
  { name: 'Cinder Row', kind: 'city', boss: 'tabby', haz: 'cats', floor: 0x8e8a84, grout: '#4a4744', brick: 0x8a5a44, fog: 0x151320, sky: 0x1a1628, lamp: 0xffb060,
    palette: [0x8a5a44, 0x7a4a3a, 0x9a6a50, 0x6a5048], metal: 0.12, heights: [4.5, 6, 7.5], park: 0.12, yard: 0.14, lot: 0.08, neon: [0xff3a6a, 0xffb040], water: 0.2 },
  { name: 'Neon Market', kind: 'city', boss: 'murder', haz: 'bloodmoon', floor: 0x7a7680, grout: '#3a3640', brick: 0x6a5a70, fog: 0x160f1e, sky: 0x1c1030, lamp: 0xff80d0,
    palette: [0x6a5a70, 0x5a4a5a, 0x7a6a6a, 0x4a4a5a], metal: 0.3, heights: [6, 7.5, 9, 11], park: 0.06, yard: 0.08, lot: 0.12, neon: [0xff3ad0, 0x3ad0ff, 0xb0ff3a, 0xffe03a], water: 0.25 },
  { name: 'Rust Yards', kind: 'city', boss: 'exterm', haz: 'bait', floor: 0x847a6a, grout: '#3e3428', brick: 0x7a5a3a, fog: 0x18140e, sky: 0x201810, lamp: 0xffc070,
    palette: [0x7a6a5a, 0x6a5a4a, 0x8a5a3a, 0x5a5048], metal: 0.45, heights: [4.5, 6, 7.5, 9], park: 0.03, yard: 0.2, lot: 0.18, neon: [0xffb040], water: 0.1, acid: 0.25 },
  { name: 'Hollow Heights', kind: 'city', boss: 'murder', haz: 'tides', floor: 0x8a8a80, grout: '#4a4a40', brick: 0x9a7a60, fog: 0x121822, sky: 0x141a2a, lamp: 0xd0e0ff,
    palette: [0x9a7a60, 0x8a8a7a, 0xa08a6a, 0x7a6a5a], metal: 0.06, heights: [4.5, 4.5, 6], park: 0.25, yard: 0.3, lot: 0.06, neon: [0x3ad0ff], water: 0.3 },
];
export const SEWER = [
  { name: 'The Undersewer', kind: 'sewer', boss: 'maw', floor: 0x8a8274, grout: '#3a342c', brick: 0x8a5a44, fog: 0x14100e, lamp: 0xffb060 },
  { name: 'Flooded Cisterns', kind: 'sewer', boss: 'brood', haz: 'tides', floor: 0x6e8680, grout: '#223430', brick: 0x587068, fog: 0x0e1816, lamp: 0x80e0d0, water: 0.45, acid: 0.1 },
  { name: "Butcher's Drain", kind: 'sewer', boss: 'ratking', haz: 'cats', floor: 0x8e6c66, grout: '#3a1612', brick: 0x7a3a30, fog: 0x1a0a08, lamp: 0xff6a40 },
  { name: 'Frozen Pipeworks', kind: 'sewer', boss: 'maw', haz: 'collapse', ice: true, floor: 0xa8bccc, grout: '#34424e', brick: 0x6a7e90, fog: 0x121a22, lamp: 0xa8d8ff, water: 0.1, acid: 0.1 },
  { name: 'Toxic Refinery', kind: 'sewer', boss: 'brood', haz: 'bait', floor: 0x7e8c52, grout: '#262e14', brick: 0x5e6c3a, fog: 0x121a08, lamp: 0xc8f040, water: 0.08, acid: 0.5 },
  { name: "Rat King's Court", kind: 'sewer', boss: 'ratking', haz: 'bloodmoon', floor: 0x8e7c5a, grout: '#2a2010', brick: 0x6a4a6a, fog: 0x160c16, lamp: 0xffd070 },
];

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI'];
export const curD = () => (run.layer === 'sewer' ? SEWER[(run.sewerIdx || 0) % SEWER.length] : SURFACE[(run.district || 0) % SURFACE.length]);
export const isSewer = () => run.layer === 'sewer';
export const dName = () => {
  if (run.layer === 'sewer') {
    const i = run.sewerIdx || 0;
    return SEWER[i % SEWER.length].name + ROMAN[Math.min(5, Math.floor(i / SEWER.length))];
  }
  const i = run.district || 0;
  return SURFACE[i % SURFACE.length].name + ROMAN[Math.min(5, Math.floor(i / SURFACE.length))];
};
export const nextSurfaceName = () => SURFACE[((run.district || 0) + 1) % SURFACE.length].name;
