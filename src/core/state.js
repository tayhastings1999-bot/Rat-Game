// Shared mutable game state. Objects are exported as singletons and mutated in
// place (never reassigned) so every module sees the same live data.
import { loadJSON, saveJSON } from './util.js';
import { storage } from './storage.js';

/** Scalars and single references that change during play. */
export const G = {
  state: 'menu',        // menu | play | paused | map | bench | trans | dead | done | nest
  time: 0,
  last: performance.now(),
  shake: 0,
  flash: 0,
  hitStop: 0,
  boss: null,
  lockOn: null,
  camYaw: Math.PI,
  camPitch: 0.9,
  camDist: 13,
  drag: 0,
  mX: innerWidth / 2,
  tideY: -5,
  tideMesh: null,
  exitD: null,          // gate to the next surface district (or trial drain)
  manhole: null,        // sewer entrance on the surface
  startRoom: null,
  rat: null,
  darkness: 0,          // 0..1, how deep the player is in a zero-visibility zone
  touch: false,         // on-screen controls in use
};

/** Per-map entity lists. Reset whenever a district is generated. */
export const W = {
  rooms: [], objs: [], plats: [], inter: [], chests: [], caches: [], pipes: [],
  lamps: [], zones: [], enemies: [], scraps: [], keys: [],
  pproj: [], eproj: [], parts: [], foods: [], scentPaths: [], baits: [], gibs: [], corpses: [], uses: [], washers: [],
  puddles: [], hazQ: [], lines: [], lairs: [], secrets: [], fungi: [], bins: [], volt: [], neons: [], prints: [], traps: [], falling: [], shocks: [], smokes: [], vials: [], ductWires: [], ductNets: [], crates: [],
  climbs: [], finds: [], pups: [], gates: [],
  cracks: new Map(),
};

export const P = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, coyote: 0, buffer: 0, air: 0, facing: Math.PI,
  inv: 0, slam: false, lock: 0, jumping: false, cut: false, wx: 0, wz: -1, fallV: 0, aim: 0, aimT: 0,
  roll: 0, rollCd: 0, rdx: 0, rdz: 1, safe: { x: 0, z: 0, y: 0 }, poisonT: 0, squeeze: false, carry: null,
  chewing: false, chewT: 0, climbing: false, wallT: 0, wallType: 0, wallTop: 0, wallNX: 0, wallNZ: 0, atk: 0, acidT: 0, scent: false,
  gmul: 1, slowT: 0, pTick: 0, bulwark: 0, lastHitT: 0,
};

/** Current run (reset per run). */
export const run = {};
/** Player stats derived from class + upgrades (reset per run). */
export const st = {};

export const settings = Object.assign(
  { shake: 1, music: 0.55, sfx: 0.7, voice: false, musicMode: 'v3' }, // musicMode: 'v3' stems | 'procedural' (v2 isn't shipped: plays procedural)
  loadJSON('scurry.settings', loadJSON('scurry5.settings', {})),
);
if (settings.vol != null && settings.sfx == null) settings.sfx = settings.vol;
export const saveSettings = () => saveJSON('scurry.settings', settings);

// ---------- save slots ----------
// Progress lives in three slots, `scurry.slot1..3`, each { v, meta, best, at }.
// `scurry.activeSlot` remembers the last one played. Settings stay global.
// Saves from before slots (`scurry.meta`, `scurry.best`, or the v5 keys) move
// into slot 1 the first time this build loads; the old keys are left in place.
export const SAVE_VERSION = 3;
export const SLOTS = 3;
const slotKey = i => 'scurry.slot' + i;
const META0 = () => ({ cls: 'tank', coopCls: ['tank', 'slinger', 'warlock', 'sneak'], kills: 0, bosses: 0, maxDistrict: 0, maxSewer: -1, sewers: 0, skin: 0, salvage: 0, runs: 0, shop: {}, difficulty: 'normal' });
const BEST0 = () => ({ time: 0, kills: 0, district: 0 });

// The final four classes (Oct 2026). Brawler, Plaguebearer and Roof Rat were cut; a save
// that still names one moves to the closest live role. Kept here (not in data/classes.js)
// because classes.js imports from this file.
// Saves only remap retired ids here; whether an id exists (and is unlocked) is checked at use
// by liveClass() in data/classes.js, so a save naming a future class survives a migration.
export const RETIRED_CLASS = { brawler: 'tank', plague: 'warlock', roof: 'slinger' };
export const liveClassId = k => (typeof k === 'string' && k ? RETIRED_CLASS[k] || k : 'tank');

/** Bring any stored slot up to SAVE_VERSION. */
function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  if (!d.v) d = { v: 1, meta: d, best: BEST0() }; // a bare meta object
  if (d.v < 2) { d.meta = { ...d.meta, shop: d.meta.shop || {} }; d.v = 2; }
  if (d.v < 3) {
    // v3: four classes. The picked class (and any older alias for it), the co-op seats and
    // per-class fur picks move onto a live class; unlock flags for a cut class carry over
    // to its heir rather than vanishing (the u_ sweep below clears them all anyway now
    // that every class is open, but a heir never ends up worse off than its cut class).
    const m = d.meta;
    m.cls = liveClassId(m.cls || m.lastCls || m.lastClass);
    delete m.lastCls; delete m.lastClass;
    if (Array.isArray(m.coopCls)) m.coopCls = m.coopCls.map(liveClassId);
    if (m.furs && typeof m.furs === 'object') { // { cls: skin index } from older builds: keep the heir's own pick
      const f = {};
      for (const [k, v] of Object.entries(m.furs)) { const h = liveClassId(k); if (f[h] == null || k === h) f[h] = v; }
      m.furs = f;
    }
    for (const [k, h] of Object.entries(RETIRED_CLASS)) if (m['u_' + k]) m['u_' + h] = 1;
    d.v = 3;
  }
  d.meta.cls = liveClassId(d.meta.cls);
  if (Array.isArray(d.meta.coopCls)) d.meta.coopCls = d.meta.coopCls.map(liveClassId);
  // Cut systems leave nothing behind in the save: Nest perks, shortcuts, bought classes,
  // dominance, class unlock flags, and the Daily Run / Ghost Trial boards and ghosts.
  for (const k of ['nest', 'bought', 'startAt', 'dominance', 'domTotal']) delete d.meta[k];
  for (const k of Object.keys(d.meta)) if (k.startsWith('u_')) delete d.meta[k];
  return d;
}
export const readSlot = i => migrate(loadJSON(slotKey(i), null));

(function migrateLegacy() {
  // Once only: the old keys are left in place, so without this flag deleting every slot
  // would bring the pre-slot save back into slot 1 on the next load.
  if (loadJSON('scurry.migrated', 0)) return;
  for (let i = 1; i <= SLOTS; i++) if (loadJSON(slotKey(i), null)) { saveJSON('scurry.migrated', 1); return; }
  const m = loadJSON('scurry.meta', loadJSON('scurry5.meta', null));
  if (!m) return;
  saveJSON(slotKey(1), migrate({ v: 1, meta: m, best: loadJSON('scurry.best', BEST0()), at: Date.now() }));
  saveJSON('scurry.activeSlot', 1);
  saveJSON('scurry.migrated', 1);
})();
for (const k of storage.keys()) if (/^scurry4\.|^scurry\.daily\./.test(k)) storage.remove(k);

/** Persistent meta progression for the active slot (story, skins, gold, shop). */
export const meta = META0();
export const best = BEST0();
/** The slot being played (1..SLOTS), or 0 before one is picked: nothing is saved then. */
export const save = { slot: 0 };

const reset = (o, v) => { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, v); };
const writeSlot = () => { if (save.slot) saveJSON(slotKey(save.slot), { v: SAVE_VERSION, meta, best, at: Date.now() }); };
export const saveMeta = writeSlot;
export const saveBest = writeSlot;

/** Make slot i active, creating it if empty. */
export function loadSlot(i) {
  const d = readSlot(i);
  reset(meta, { ...META0(), ...(d ? d.meta : {}) });
  reset(best, { ...BEST0(), ...(d ? d.best : {}) });
  save.slot = i;
  saveJSON('scurry.activeSlot', i);
  writeSlot();
}
export function deleteSlot(i) {
  storage.remove(slotKey(i));
  if (save.slot === i) { save.slot = 0; reset(meta, META0()); reset(best, BEST0()); }
  if (loadJSON('scurry.activeSlot', 0) === i) saveJSON('scurry.activeSlot', 0);
}
