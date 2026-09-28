// Shared mutable game state. Objects are exported as singletons and mutated in
// place (never reassigned) so every module sees the same live data.
import { loadJSON, saveJSON } from './util.js';

/** Scalars and single references that change during play. */
export const G = {
  state: 'menu',        // menu | play | paused | map | bench | levelup | trans | dead | done | nest
  mode: 'survival',     // survival | trial
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
  ghost: null,
  friendGhost: null,
  rat: null,
  darkness: 0,          // 0..1, how deep the player is in a zero-visibility zone
  touch: false,         // on-screen controls in use
};

/** Per-map entity lists. Reset whenever a district is generated. */
export const W = {
  rooms: [], objs: [], plats: [], inter: [], benches: [], chests: [], caches: [], pipes: [],
  lamps: [], valves: [], zones: [], enemies: [], gems: [], scraps: [], cores: [], keys: [],
  pproj: [], eproj: [], parts: [], foods: [], familiars: [], scentPaths: [], baits: [], gibs: [],
  puddles: [], hazQ: [], shrapQ: [], lines: [], lairs: [], secrets: [], swarm: [],
  cracks: new Map(),
};

export const P = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, coyote: 0, buffer: 0, air: 0, facing: Math.PI,
  inv: 0, slam: false, lock: 0, jumping: false, cut: false, wx: 0, wz: -1, fallV: 0, aim: 0, aimT: 0,
  roll: 0, rollCd: 0, rdx: 0, rdz: 1, safe: { x: 0, z: 0, y: 0 }, poisonT: 0, squeeze: false, carry: null,
  chewing: false, chewT: 0, climbing: false, wallT: 0, wallType: 0, wallTop: 0, atk: 0, acidT: 0, scent: false,
  sprinting: false, staT: 0, gmul: 1, slowT: 0, pTick: 0, glideT: 0, bulwark: 0, lastHitT: 0, trailT: 0,
};

/** Current run (reset per run). */
export const run = {};
/** Player stats derived from class + upgrades (reset per run). */
export const st = {};

export const settings = Object.assign(
  { shake: 1, music: 0.55, sfx: 0.7, sens: 1, mouse: true },
  loadJSON('scurry.settings', loadJSON('scurry5.settings', {})),
);
if (settings.vol != null && settings.sfx == null) settings.sfx = settings.vol;
export const saveSettings = () => saveJSON('scurry.settings', settings);

/** Persistent meta progression (the Nest). */
export const meta = Object.assign(
  { kills: 0, bosses: 0, maxDistrict: 0, maxSewer: -1, sewers: 0, skin: 0, salvage: 0, nest: {}, bought: {}, runs: 0 },
  loadJSON('scurry.meta', loadJSON('scurry5.meta', {})),
);
if (!meta.nest) meta.nest = {};
if (!meta.bought) meta.bought = {};
export const saveMeta = () => saveJSON('scurry.meta', meta);

export const best = loadJSON('scurry.best', loadJSON('scurry4.best', { time: 0, kills: 0, district: 0 }));
export const saveBest = () => saveJSON('scurry.best', best);
