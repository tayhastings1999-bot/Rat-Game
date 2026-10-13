// Playable rats (the final four, all open from the start) and fur skins. HP and the four
// stats (Strength, Speed, Armor, Magic) live in TUNE.classes (src/tuning.js).
import { meta, RETIRED_CLASS, liveClassId } from '../core/state.js';

// rc: menu-card accent only, from the palette (players are identified by player colour, not class).
//
// Adding a class is data only: an entry here, its stats in TUNE.classes, a PRIM / SPECIALS entry
// (combat/arsenal.js), a SIGS entry (game/signature.js) and a BLASTS / FLOURISH entry (game/turbo.js).
// Unlockable rats (planned: secret rats earned by hidden objectives) add:
//   unlock: { req: meta => boolean, hint: 'shown on a locked card' }
//   secret: true   hidden from the picker entirely until unlocked (otherwise shown locked)
// Once req passes, meta['c_' + id] is set so the unlock sticks. Nothing uses this yet.
export const CLASSES = {
  tank: { name: 'Sewer Rat', call: 'Rat', role: 'Tank', rc: '#c9d4e8', blurb: 'Scarred, heavy and nearly unkillable. Gnashes and shoves the horde back by brute force.', prim: 'gnash', special: 'bulwark', fur: 0x5e5044, spike: 0x8a7a60, eye: 0xff6a2a, gear: 0x4a4640, bulk: 1.18 },
  slinger: { name: 'Sewer Slinger', call: 'Slinger', role: 'Ranged', rc: '#e8e4da', blurb: 'Quick feet, quicker stones. Kites the horde and never stops moving.', prim: 'stone', special: 'volley', fur: 0xa08870, spike: 0xa87a48, eye: 0xffc040, gear: 0x6a4a2c },
  warlock: { name: 'Rat Warlock', call: 'Warlock', role: 'Magic', rc: '#3BF2FF', blurb: 'Fragile, but the hex bolts find their mark. Blinks out of trouble.', prim: 'hex', special: 'blink', fur: 0x6e6874, spike: 0x8a6ab0, eye: 0xc080ff, gear: 0x2a2234 },
  sneak: { name: 'Sewer Sneak', call: 'Sneak', role: 'Evasive', rc: '#5c6474', blurb: 'Slight and quick. Stabs hardest from behind, chokes the horde in smoke, and steps through shadow to get there.', prim: 'shiv', special: 'smoke', fur: 0x4a5048, spike: 0x5a7a60, eye: 0x6affb0, gear: 0x2a3a30, bulk: 0.86 },
};

/** The class a new run, the menu and co-op seats start on. */
export const DEFAULT_CLASS = 'tank';
/** Cut classes (Oct 2026) and their heirs: Brawler → Sewer Rat, Plaguebearer → Warlock, Roof Rat → Slinger. */
export { RETIRED_CLASS };
/** True if class k exists and is playable in this slot (no unlock, or its unlock is earned). */
export function classOpen(k) {
  const C = CLASSES[k];
  if (!C) return false;
  if (!C.unlock || meta['c_' + k]) return true;
  if (C.unlock.req(meta)) { meta['c_' + k] = 1; return true; }
  return false;
}
/** Cards for the picker, in order: open classes, plus locked ones that are not secret. */
export const pickerClasses = () => Object.keys(CLASSES).filter(k => classOpen(k) || !CLASSES[k].secret);
/** Classes a run or a co-op seat may use right now. */
export const openClasses = () => Object.keys(CLASSES).filter(classOpen);
/** Any class id mapped onto a playable class (cut → heir; unknown or locked → the default). */
export const liveClass = k => { const h = liveClassId(k); return classOpen(h) ? h : DEFAULT_CLASS; };

export const SKINS = [
  { name: 'Sewer', over: {} },
  { name: 'Albino', over: { fur: 0xeeeae4, eye: 0xff2a3a }, req: m => m.kills >= 400, txt: '400 kills' },
  { name: 'Soot', over: { fur: 0x3e3a3c, spike: 0x6a6a70, eye: 0xffa020 }, req: m => m.kills >= 1500, txt: '1,500 kills' },
  { name: 'Frostbite', over: { fur: 0xa8c8dc, spike: 0xe0f0ff, eye: 0x60d0ff }, req: m => m.maxSewer >= 3, txt: 'Reach Frozen Pipeworks' },
  { name: 'Toxic', over: { fur: 0x8aa050, spike: 0xc0f040, eye: 0xd0ff40 }, req: m => m.maxSewer >= 4, txt: 'Reach Toxic Refinery' },
  { name: 'Royal', over: { fur: 0xd8a840, spike: 0xffe080, eye: 0xff4020 }, req: m => m.bosses >= 5, txt: 'Slay 5 bosses' },
];
export const skinOk = i => { const s = SKINS[i]; return !!s && (!s.req || s.req(meta)); };
