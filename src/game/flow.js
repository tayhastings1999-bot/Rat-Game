// Run lifecycle: stats, district generation, moving between the city and the
// sewer, skin unlocks and banking gold.
import { resetObj, unseedRng, $ } from '../core/util.js';
import { G, P, W, run, st, meta, saveMeta } from '../core/state.js';
import { dropCreature } from '../render/renderer.js';
import { clearFx } from '../fx/fx.js';
import { M, gi, toW, floorY } from '../world/grid.js';
import { genCity } from '../world/cityGen.js';
import { genSewer } from '../world/sewerGen.js';
import { carveDucts } from '../world/ducts.js';
import { buildWorld, populate, addExit } from '../world/build.js';
import { curD, dName, isSewer, MODS, levelSeed } from '../data/world.js';
import { PRIM } from '../combat/arsenal.js';
import { CLASSES, SKINS, DEFAULT_CLASS, liveClass } from '../data/classes.js';
import { zoneScaling, diffMods } from '../combat/combat.js';
import { need } from './progress.js';
import { setRat, FACE } from '../entities/rat.js';
import { banner, renderSlots, hud } from '../ui/hud.js';
import { renderMenu, hideOverlay } from '../ui/screens.js';
import { applyShop, shopGrowth } from './shop.js';
import { coop, coopStart, coopEnd } from './coop.js';
import { coldOpen } from './feel.js';
import { setupObjective } from './objectives.js';
import { storyBeat } from './personality.js';
import { onRunStart, onDistrict, forcedObjective, storyGoal } from './story.js';
import { districtStart } from './score.js';
import { placeRoles } from '../entities/roles.js';
import { setupSecret } from './secrets.js';
import { placePacks } from './nests.js';
import { TUNE } from '../tuning.js';
import { derive } from './stats.js';
import { setupFinds } from './finds.js';
import { showTally } from '../ui/tally.js';
import { placeRune } from './runes.js';
import { colony, colonyPlace } from './colony.js';

export function freshStats(k) {
  const C = CLASSES[k], melee = !!PRIM[C.prim].melee; // Gnash and Shiv
  return {
    ...derive(k), regen: 0, dmg: 1, area: C.area || 1,
    squeezeMul: 1,
    magnet: 2.6, crit: 0.05, critMul: 2, xp: 1, jumps: C.jumps || 0, multi: 0, range: 1, shotSpd: 1, tear: 1,
    homing: false, split: false, shotSize: 0, kb: 1, scentMax: 8,
    chew: 1, specCd: 1, foeSpd: 1, salvage: 1, foodMul: 1, healMul: 1,
    meleePrim: melee,
    primMag: PRIM[C.prim].mag || 0,
  };
}

export function setupWorld(seed) {
  for (const e of W.enemies) if (e.mesh && e.type !== 'nest') dropCreature(e.mesh);
  G.boss = null;
  G.lockOn = null;
  G.evMarker = null;
  if (run.events) run.events.length = 0;
  G.darkness = 0;
  $('bossWrap').style.display = 'none';
  const D = curD();
  const info = D.kind === 'city' ? genCity(seed, D) : genSewer(seed, D);
  info.ducts = carveDucts();
  run.mods = D.haz ? [D.haz] : []; // each zone has its own listed hazard; no random draws
  zoneScaling();
  buildWorld();
  populate(info);
  setupObjective(info, curD().secret ? 'nests' : forcedObjective()); // no side jobs in a secret zone
  setupSecret(info);
  setupFinds(info);
  placeRune(info);
  placePacks(info); // seeded, before the RNG is released
  unseedRng();
  clearFx();
  const s = info.startRoom;
  P.x = toW(s.cx); P.z = toW(s.cy); P.y = floorY(P.x, P.z);
  P.vx = P.vy = P.vz = 0;
  P.safe = { x: P.x, z: P.z, y: P.y };
  placeRoles(); // after the rat is at the start, so ambushers keep their distance
  colonyPlace(); // the swarm prototype (?swarm): the colony comes along
  P.poisonT = 0; P.roll = 0; P.rollCd = 0; P.scent = false; P.scentE = st.scentMax; P.carry = null; P.bulwark = 0;
  G.camPos.set(P.x, 12, P.z + 12);
  G.flowT = 0;
}

export function menu() {
  coopEnd();
  G.state = 'menu';
  $('hud').style.display = 'none';
  $('bossWrap').style.display = 'none';
  resetObj(run, { cls: DEFAULT_CLASS, tier: 0, time: 0, nests: 0, mods: [], level: 1, dmgBy: {}, layer: 'surface', district: 0, sewerIdx: 0 });
  resetObj(st, freshStats(DEFAULT_CLASS));
  setupWorld('MENU');
  colony.rats.length = 0; // no colony behind the menu
  setRat(CLASSES[DEFAULT_CLASS]);
  G.camDist = 11;
  G.camPitch = 0.55;
  P.scent = false;
  renderMenu();
}

/** Realms the hub can start in (per burrow): every city level reached, and every sewer level reached. */
export function realmLevels() {
  const city = Array.from({ length: Math.max(0, meta.maxDistrict || 0) + 1 }, (_, i) => i);
  const sewer = Array.from({ length: Math.max(-1, meta.maxSewer == null ? -1 : meta.maxSewer) + 1 }, (_, i) => i);
  return { city, sewer };
}
const RUN_KEEP = ['realm', 'layer', 'district', 'sewerIdx', 'tier', 'level', 'xp', 'need', 'scrap', 'scrapSpent', 'kills', 'dmg', 'time', 'keys', 'bosses', 'minis', 'vials', 'turbo', 'hp', 'growth'];
/** Checkpoint the run at the start of every level, so the hub can offer Continue (cleared on death). */
export function checkpoint() {
  if (G.testNoSave) return;
  meta.cont = { cls: run.cls, run: Object.fromEntries(RUN_KEEP.map(k => [k, run[k]])), st: { ...st }, at: dName() };
  saveMeta();
}

/**
 * Start a run. opt.realm ('city' | 'sewer') with opt.idx picks a reached level from the hub; a sewer-realm run
 * stays underground (ladders lead to the next sewer level). opt.cont resumes meta.cont.
 */
export function startRun(k, opt = {}) {
  if (colony.on) coop.setup.n = 1; // the swarm prototype is solo for now
  const cont = opt.cont && meta.cont ? meta.cont : null;
  if (cont) k = cont.cls;
  k = liveClass(k); // locked, unknown or an old save, link or test naming a cut class gets its heir
  meta.cls = k; meta.coopCls = coop.setup.cls.map(liveClass); // remembered per burrow (save v3)
  const C = CLASSES[k];
  resetObj(run, {
    cls: k, tier: 0, level: 1, xp: 0, need: need(1), kills: 0, dmg: 0, scrap: 0, scrapSpent: 0, time: 0, dmgBy: {},
    specT: 0, primT: 0, lowWarned: false, hp: 0, nests: 0, mods: [], layer: 'surface', district: 0, sewerIdx: 0,
    dStart: 0, bossDone: false, tideT: 0, moonT: 0, moon: false, spawnT: 1.5, surgeT: 55, lullT: 0, seenMobs: {},
    players: Math.max(1, Math.min(4, coop.setup.n | 0)), growth: shopGrowth(), keys: 0, bosses: 0, minis: 0, turbo: 0, vials: Math.max(0, TUNE.vials.start + (diffMods().vials || 0)), evT: 50, events: [], lastEv: null, perfects: 0, bossHit: false, streak: 0, streakT: 0, buffs: {}, forage: 0,
  });
  resetObj(st, freshStats(k));
  applyShop();
  Object.assign(P, { sig: null, parry: 0, turboT: 0, turboArea: 1 });
  G.turboHeld = G.turboKey = false;
  G.turboArmT = 0;
  run.hp = st.maxHp;
  run.realm = 'city';
  const R = realmLevels();
  if (cont) { Object.assign(run, cont.run); Object.assign(st, cont.st); }
  else if (opt.realm === 'sewer' && R.sewer.length) { const i = Math.min(opt.idx | 0, R.sewer.length - 1); Object.assign(run, { realm: 'sewer', layer: 'sewer', sewerIdx: i, tier: i + 1 }); }
  else if (opt.realm === 'city') { const i = Math.min(opt.idx | 0, R.city.length - 1); Object.assign(run, { district: i, tier: i }); }
  meta.runs = (meta.runs || 0) + 1;
  saveMeta();
  const seed = levelSeed(); // every level has a fixed layout (data/levels.js)
  setupWorld(seed);
  run.seed = seed;
  setRat(C);
  G.state = 'play';
  G.camYaw = Math.PI; G.camPitch = TUNE.camera.pitch; G.camWidth = TUNE.camera.width;
  G.camOff.set(0, 0, 0);
  P.scent = false; P.carry = null; P.inv = 1;
  hideOverlay();
  $('hud').style.display = 'block';
  $('clsName').textContent = C.name;
  $('portrait').src = FACE[k];
  $('zoneName').textContent = dName();
  coopStart(freshStats, shopGrowth);
  renderSlots();
  hud();
  G.last = performance.now();
  banner(dName(), storyGoal() || storyBeat());
  onRunStart();
  districtStart();
  coldOpen();
  checkpoint();
}

/** Boss dead: open the way on. Surface → a road gate; sewer → a ladder up. */
export function openGate() {
  let bk = -1, bd = -1;
  for (const r of W.rooms) {
    const k = gi(r.cx, r.cy);
    if (M.flow[k] > bd) { bd = M.flow[k]; bk = k; }
  }
  // Walled in (e.g. inside a boarded slot): fall back to the farthest room as the crow flies.
  if (bk < 0) for (const r of W.rooms) { const d = Math.hypot(toW(r.cx) - P.x, toW(r.cy) - P.z); if (d > bd) { bd = d; bk = gi(r.cx, r.cy); } }
  if (bk < 0) return;
  addExit(toW(bk % M.W), toW((bk / M.W) | 0), isSewer() ? 'ladder' : 'road');
}

function transition(apply, title) {
  if (G.state !== 'play') return;
  G.state = 'trans';
  $('fade').style.opacity = 1;
  setTimeout(() => {
    apply();
    run.reaper = run.robber = null; // their meshes go with the old district
    run.reaperT = run.robT = null;
    run.bossDone = false;
    run.evT = 45;
    run.scabSeen = false;
    run.dStart = run.time;
    run.nests = 0;
    run.surgeT = 75;
    meta.maxDistrict = Math.max(meta.maxDistrict, run.district);
    if (isSewer()) meta.maxSewer = Math.max(meta.maxSewer, run.sewerIdx);
    const got = checkUnlocks();
    run.seed = levelSeed();
    setupWorld(run.seed);
    districtStart();
    onDistrict();
    run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.3);
    $('zoneName').textContent = dName();
    $('fade').style.opacity = 0;
    G.state = 'play';
    G.last = performance.now();
    checkpoint();
    banner(title(), got.length ? 'Unlocked: ' + got.join(', ') : storyGoal() || storyBeat());
  }, 450);
}
const hazName = () => run.mods.map(m => MODS[m].name).join(' · ');

/** Take the manhole: a harder, claustrophobic sewer layer. */
/** Leaving a level: the exit tally first (bots and tests skip it), then the transition. */
const leave = go => { if (G.state === 'play') showTally(go); };
export function enterSewer() {
  leave(() => { meta.sewers = (meta.sewers || 0) + 1; transition(() => { run.layer = 'sewer'; run.tier++; }, () => 'Descending · ' + dName()); });
}
/** Now and then, leaving a level drops you into a treasure room first (then on to the next level as normal). */
function treasureDetour() {
  const T = TUNE.treasure;
  if (run.secret || (run.tier || 0) < T.minZone || run.lastTreasure === run.tier || G.testNoTreasure || G.qa || Math.random() >= (G.forceTreasure ? 1 : T.odds)) return false;
  run.lastTreasure = run.tier;
  meta.treasures = (meta.treasures || 0) + 1;
  leave(() => transition(() => { run.secret = 'treasure'; }, () => 'Treasure room!'));
  return true;
}
export function exitRoad() {
  if (treasureDetour()) return;
  leave(() => transition(() => { run.district++; run.tier++; }, () => dName() + (hazName() ? ' · ' + hazName() : '')));
}
/** Drop through a hidden drain into a secret zone (the level's boss is skipped). */
export function enterSecret(kind) {
  leave(() => { meta.secrets = (meta.secrets || 0) + 1; transition(() => { run.secret = kind; }, () => 'Secret · ' + dName()); });
}
/** Out of a secret zone: on to the level after the one you left. */
export function exitSecret() {
  const sewer = run.layer === 'sewer';
  leave(() => transition(() => { run.secret = null; if (sewer) { run.layer = 'surface'; run.sewerIdx++; } run.district++; run.tier++; }, () => dName() + (hazName() ? ' · ' + hazName() : '')));
}
export function exitLadder() {
  // A sewer-realm run (started from the hub) stays underground: sewer progress no longer waits on city loops.
  if (run.realm === 'sewer') { leave(() => transition(() => { run.sewerIdx++; run.tier++; }, () => 'Deeper · ' + dName())); return; }
  if (treasureDetour()) return;
  leave(() => transition(() => { run.layer = 'surface'; run.district++; run.sewerIdx++; run.tier++; }, () => 'Back on the streets · ' + dName()));
}

/** Fur skins unlocked by milestones. (Every class is open from the start.) */
export function checkUnlocks() {
  const got = [];
  SKINS.forEach((s, i) => { if (s.req && s.req(meta) && !meta['s_' + i]) { meta['s_' + i] = 1; got.push(s.name + ' fur'); } });
  saveMeta();
  return got;
}

/** Unspent gold goes home with you. */
export function bankSalvage() {
  const amt = Math.floor(run.scrap || 0);
  meta.salvage = (meta.salvage || 0) + amt;
  saveMeta();
  return { salvage: amt };
}
