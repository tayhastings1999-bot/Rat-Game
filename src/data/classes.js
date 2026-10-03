// Playable rats, unlock rules and fur skins.
import { meta } from '../core/state.js';

export const CLASSES = {
  brawler: { name: 'Gutter Brawler', role: 'Melee', rc: '#ff6a3a', blurb: 'Iron-knuckled and stubborn. Lunges into the swarm, heals on every hit and gets faster with each kill.', hp: 170, speed: 7.2, armor: 3, prim: 'rake', special: 'slam', fur: 0xbab4a8, spike: 0xc9a860, eye: 0xffa040, gear: 0x6a6672 },
  plague: { name: 'Plaguebearer', role: 'Area', rc: '#9be06a', blurb: 'Lobs blight and bursts it. Anything close starts to rot.', hp: 120, speed: 6.7, area: 1.2, prim: 'blight', special: 'nova', fur: 0x9a9e8a, spike: 0x8a9a50, eye: 0xc8f060, gear: 0x3e4a2c },
  slinger: { name: 'Sewer Slinger', role: 'Ranged', rc: '#f2b233', blurb: 'Quick feet, quicker stones. Kites the horde and never stops moving.', hp: 120, speed: 7.8, armor: 1, prim: 'stone', special: 'volley', fur: 0xa08870, spike: 0xa87a48, eye: 0xffc040, gear: 0x6a4a2c },
  warlock: { name: 'Rat Warlock', role: 'Magic', rc: '#b46cff', blurb: 'Fragile, but the hex bolts find their mark. Blinks out of trouble.', hp: 85, speed: 7, cd: 0.9, prim: 'hex', special: 'blink', fur: 0x6e6874, spike: 0x8a6ab0, eye: 0xc080ff, gear: 0x2a2234 },
  tank: { name: 'Sewer Rat', role: 'Tank', rc: '#d08a4a', blurb: 'Scarred, heavy and nearly unkillable. Gnashes and shoves the horde back by brute force.', hp: 215, speed: 6.2, armor: 5, prim: 'gnash', special: 'bulwark', fur: 0x5e5044, spike: 0x8a7a60, eye: 0xff6a2a, gear: 0x4a4640, bulk: 1.18 },
  sneak: { name: 'Sewer Sneak', role: 'Stealth', rc: '#5ad0a0', blurb: 'Slight and silent. A longer nose, a faster squeeze, and a shiv that triples on anything that never saw it coming.', hp: 70, speed: 7.6, prim: 'shiv', special: 'smoke', scent: 16, squeeze: 1.7, fur: 0x4a5048, spike: 0x5a7a60, eye: 0x6affb0, gear: 0x2a3a30, bulk: 0.86 },
  roof: { name: 'Roof Rat', role: 'Nimble', rc: '#7ad0ff', blurb: 'Light, fast and born on the rooftops. Double-jumps and rains darts from above.', hp: 80, speed: 8.6, jumps: 1, prim: 'darts', special: 'updraft', fur: 0x3a3438, spike: 0x6a6070, eye: 0x9ad8ff, gear: 0x2a3a4a, bulk: 0.9 },
};

/** Locked classes open by an achievement or by spending salvage at the Nest. */
export const UNLOCK = {
  plague: { req: m => m.sewers >= 1, txt: 'Descend into the sewer once', cost: 150 },
  warlock: { req: m => m.bosses >= 3, txt: 'Slay 3 bosses', cost: 250 },
  tank: { txt: 'Buy at the Nest', cost: 200 },
  roof: { txt: 'Buy at the Nest', cost: 200 },
  sneak: { req: m => (m.domTotal || 0) >= 60, txt: 'Earn 60 Dominance', dom: 30 },
};
export const isUnl = k => !UNLOCK[k] || !!meta.bought[k] || !!(UNLOCK[k].req && UNLOCK[k].req(meta));

export const SKINS = [
  { name: 'Sewer', over: {} },
  { name: 'Albino', over: { fur: 0xeeeae4, eye: 0xff2a3a }, req: m => m.kills >= 400, txt: '400 kills' },
  { name: 'Soot', over: { fur: 0x3e3a3c, spike: 0x6a6a70, eye: 0xffa020 }, req: m => m.kills >= 1500, txt: '1,500 kills' },
  { name: 'Frostbite', over: { fur: 0xa8c8dc, spike: 0xe0f0ff, eye: 0x60d0ff }, req: m => m.maxSewer >= 3, txt: 'Reach Frozen Pipeworks' },
  { name: 'Toxic', over: { fur: 0x8aa050, spike: 0xc0f040, eye: 0xd0ff40 }, req: m => m.maxSewer >= 4, txt: 'Reach Toxic Refinery' },
  { name: 'Royal', over: { fur: 0xd8a840, spike: 0xffe080, eye: 0xff4020 }, req: m => m.bosses >= 5, txt: 'Slay 5 bosses' },
];
export const skinOk = i => { const s = SKINS[i]; return !!s && (!s.req || s.req(meta)); };
