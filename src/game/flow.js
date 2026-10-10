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
import { curD, dName, isSewer, MODS } from '../data/world.js';
import { CLASSES, SKINS } from '../data/classes.js';
import { zoneScaling } from '../combat/combat.js';
import { need } from './progress.js';
import { setRat, FACE } from '../entities/rat.js';
import { banner, renderSlots, hud } from '../ui/hud.js';
import { renderMenu, hideOverlay } from '../ui/screens.js';
import { coldOpen } from './feel.js';
import { setupObjective } from './objectives.js';
import { storyBeat } from './personality.js';
import { onRunStart, onDistrict, forcedObjective, storyGoal } from './story.js';
import { districtStart } from './score.js';
import { placeRoles } from '../entities/roles.js';
import { TUNE } from '../tuning.js';

export function freshStats(C) {
  const melee = C.prim === 'rake' || C.prim === 'gnash';
  return {
    maxHp: C.hp, regen: 0, armor: C.armor || 0, speed: C.speed, dmg: 1, area: C.area || 1, cd: C.cd || 1,
    primMul: 1, squeezeMul: C.squeeze || 1, comboMul: 1,
    magnet: 2.6, crit: 0.05, critMul: 2, xp: 1, jumps: C.jumps || 0, multi: 0, range: 1, shotSpd: 1, tear: 1,
    homing: false, split: false, shotSize: 0, kb: 1, scentMax: C.scent || 8,
    chew: 1, specCd: 1, taken: 1, foeSpd: 1, salvage: 1, foodMul: 1, healMul: 1,
    meleePrim: melee,
    // Melee kit: heal a little per hit, shrug off 20% of bites and swipes.
    meleeLeech: melee ? 0.6 : 0, guard: melee ? 0.8 : 1,
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
  setupObjective(info, forcedObjective());
  unseedRng();
  clearFx();
  const s = info.startRoom;
  P.x = toW(s.cx); P.z = toW(s.cy); P.y = floorY(P.x, P.z);
  P.vx = P.vy = P.vz = 0;
  P.safe = { x: P.x, z: P.z, y: P.y };
  placeRoles(); // after the rat is at the start, so ambushers keep their distance
  P.poisonT = 0; P.roll = 0; P.rollCd = 0; P.scent = false; P.scentE = st.scentMax; P.carry = null; P.bulwark = 0;
  G.camPos.set(P.x, 12, P.z + 12);
  G.flowT = 0;
}

export function menu() {
  G.state = 'menu';
  $('hud').style.display = 'none';
  $('bossWrap').style.display = 'none';
  resetObj(run, { cls: 'brawler', tier: 0, time: 0, nests: 0, mods: [], level: 1, dmgBy: {}, layer: 'surface', district: 0, sewerIdx: 0 });
  resetObj(st, freshStats(CLASSES.brawler));
  G.mode = 'survival';
  setupWorld('MENU');
  setRat(CLASSES.brawler);
  G.camDist = 11;
  G.camPitch = 0.55;
  P.scent = false;
  renderMenu();
}

export function startRun(k) {
  const C = CLASSES[k];
  resetObj(run, {
    cls: k, tier: 0, level: 1, xp: 0, need: need(1), kills: 0, dmg: 0, scrap: 0, scrapSpent: 0, time: 0, dmgBy: {},
    specT: 0, primT: 0, lowWarned: false, hp: 0, nests: 0, mods: [], layer: 'surface', district: 0, sewerIdx: 0,
    dStart: 0, bossDone: false, tideT: 0, moonT: 0, moon: false, spawnT: 1.5, surgeT: 55, lullT: 0, seenMobs: {},
    keys: 0, bosses: 0, minis: 0, evT: 50, events: [], lastEv: null, perfects: 0, bossHit: false, combo: 0, comboT: 0, buffs: {}, forage: 0,
  });
  resetObj(st, freshStats(C));
  Object.assign(P, { sig: null, grab: null, parry: 0, diveArm: 0 });
  run.hp = st.maxHp;
  meta.runs = (meta.runs || 0) + 1;
  saveMeta();
  const seed = 'S' + Date.now();
  setupWorld(seed);
  run.seed = seed;
  setRat(C);
  G.state = 'play';
  G.camYaw = Math.PI; G.camPitch = TUNE.camera.pitch; G.camDist = TUNE.camera.dist;
  G.camOff.set(0, 0, 0);
  P.scent = false; P.carry = null; P.inv = 1;
  hideOverlay();
  $('hud').style.display = 'block';
  $('clsName').textContent = C.name;
  $('portrait').src = FACE[k];
  $('zoneName').textContent = dName();
  renderSlots();
  hud();
  G.last = performance.now();
  banner(dName(), storyGoal() || storyBeat());
  onRunStart();
  districtStart();
  coldOpen();
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
    run.bossDone = false;
    run.evT = 45;
    run.scabSeen = false;
    run.dStart = run.time;
    run.nests = 0;
    run.surgeT = 75;
    meta.maxDistrict = Math.max(meta.maxDistrict, run.district);
    if (isSewer()) meta.maxSewer = Math.max(meta.maxSewer, run.sewerIdx);
    const got = checkUnlocks();
    setupWorld('S' + Date.now());
    districtStart();
    onDistrict();
    run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.3);
    $('zoneName').textContent = dName();
    $('fade').style.opacity = 0;
    G.state = 'play';
    G.last = performance.now();
    banner(title(), got.length ? 'Unlocked: ' + got.join(', ') : storyGoal() || storyBeat());
  }, 450);
}
const hazName = () => run.mods.map(m => MODS[m].name).join(' · ');

/** Take the manhole: a harder, claustrophobic sewer layer. */
export function enterSewer() {
  meta.sewers = (meta.sewers || 0) + 1;
  transition(() => { run.layer = 'sewer'; run.tier++; }, () => 'Descending · ' + dName());
}
export function exitRoad() {
  transition(() => { run.district++; run.tier++; }, () => dName() + (hazName() ? ' · ' + hazName() : ''));
}
export function exitLadder() {
  transition(() => { run.layer = 'surface'; run.district++; run.sewerIdx++; run.tier++; }, () => 'Back on the streets · ' + dName());
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
