// Run lifecycle: stats, district generation, moving between the city and the
// sewer, unlocks and banking salvage into the Nest.
import { pick, resetObj, unseedRng, shuffleR, weekSeed, loadJSON, $ } from '../core/util.js';
import { G, P, W, run, st, meta, saveMeta } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { clearFx } from '../fx/fx.js';
import { M, gi, toW, floorY } from '../world/grid.js';
import { genCity } from '../world/cityGen.js';
import { genSewer } from '../world/sewerGen.js';
import { buildWorld, populate, addExit } from '../world/build.js';
import { curD, dName, isSewer, MODS } from '../data/world.js';
import { CLASSES, UNLOCK, SKINS } from '../data/classes.js';
import { WEAP } from '../combat/arsenal.js';
import { need, addThreat } from '../combat/combat.js';
import { setRat, clearFamiliars, makeGhostRat, FACE } from '../entities/rat.js';
import { banner, renderSlots, hud } from '../ui/hud.js';
import { renderMenu, hideOverlay, openLevelUp } from '../ui/screens.js';
import { STARTS } from '../data/items.js';

export function freshStats(C) {
  const n = meta.nest;
  return {
    maxHp: C.hp + 12 * (n.hide || 0), regen: 0, armor: C.armor || 0, speed: C.speed, dmg: 1, area: C.area || 1, cd: (C.cd || 1) * (1 - 0.05 * (n.tempo || 0)), proj: 0,
    primMul: 1 + 0.08 * (n.fang || 0), squeezeMul: C.squeeze || 1,
    magnet: 2.6 * (1 + 0.25 * (n.nose || 0)), crit: 0.05, critMul: 2, xp: 1, jumps: C.jumps || 0, multi: 0, range: 1, shotSpd: 1, tear: 1,
    homing: false, poison: false, burn: false, split: false, shotSize: 0, thorns: 0, melee: 0, kb: 1,
    staMax: 100 + 10 * (n.lungs || 0), scentMax: C.scent || 8, staRegen: 28 * (1 + 0.15 * (n.wind || 0)), sprintMul: 1.45, sprintDrain: 22, climbCost: 20, metalClimb: false, glide: false,
    chew: 1, specCd: 1, taken: 1, shrap: false, foeSpd: 1, leech: 0, salvage: 1 + 0.15 * (n.scav || 0),
    mut: {}, rabid: false, noRegen: false, foodMul: 1, healMul: 1, volt: false, bleed: false, rag: false, toxImmune: false, sinker: false, noScramble: false, fury: false, poisonMul: 1, selfPoison: false,
    meleePrim: C.prim === 'rake' || C.prim === 'gnash',
    // Melee kit: heal a little per hit, shrug off 20% of bites and swipes.
    meleeLeech: C.prim === 'rake' || C.prim === 'gnash' ? 0.6 : 0, guard: C.prim === 'rake' || C.prim === 'gnash' ? 0.8 : 1,
  };
}

const ALL_MODS = Object.keys(MODS);

export function setupWorld(seed) {
  for (const e of W.enemies) if (e.mesh && e.type !== 'nest') scene.remove(e.mesh);
  G.boss = null;
  G.lockOn = null;
  G.darkness = 0;
  $('bossWrap').style.display = 'none';
  const D = curD();
  const info = D.kind === 'city' ? genCity(seed, D) : genSewer(seed, D);
  const pool = shuffleR(ALL_MODS.filter(m => m !== D.haz));
  run.mods = G.mode === 'trial' || !D.haz ? pool.slice(0, 2) : [D.haz, pool[0]];
  buildWorld();
  populate(info);
  unseedRng();
  clearFx();
  const s = info.startRoom;
  P.x = toW(s.cx); P.z = toW(s.cy); P.y = floorY(P.x, P.z);
  P.vx = P.vy = P.vz = 0;
  P.safe = { x: P.x, z: P.z, y: P.y };
  P.poisonT = 0; P.roll = 0; P.chain = 0; P.scramble = 0; P.scent = false; P.scentE = st.scentMax; P.carry = null; P.bulwark = 0; P.glideT = 0;
  G.camPos.set(P.x, 12, P.z + 12);
  G.flowT = 0;
  for (const f of W.familiars) { f.x = P.x; f.z = P.z; }
}

export function menu() {
  G.state = 'menu';
  $('hud').style.display = 'none';
  $('bossWrap').style.display = 'none';
  clearFamiliars();
  if (G.ghost) { scene.remove(G.ghost.r.g); G.ghost = null; }
  resetObj(run, { cls: 'brawler', tier: 0, time: 0, nests: 0, mods: [], level: 1, dmgBy: {}, items: [], cursed: [], junk: [], muts: [], layer: 'surface', district: 0, sewerIdx: 0 });
  resetObj(st, freshStats(CLASSES.brawler));
  G.mode = 'survival';
  setupWorld('MENU');
  setRat(CLASSES.brawler);
  G.camDist = 11;
  G.camPitch = 0.55;
  P.scent = false;
  renderMenu('survival');
}

export function startRun(k) {
  const C = CLASSES[k];
  clearFamiliars();
  if (G.ghost) { scene.remove(G.ghost.r.g); G.ghost = null; }
  resetObj(run, {
    cls: k, tier: 0, level: 1, xp: 0, need: need(1), kills: 0, dmg: 0, scrap: 0, scrapSpent: 0, time: 0, weapons: [], items: [], cursed: [], junk: [], muts: [], tomes: {}, augs: {}, dmgBy: {},
    pendingLv: 0, specT: 0, primT: 0, lowWarned: false, hp: 0, sta: 100, nests: 0, mods: [], layer: 'surface', district: 0, sewerIdx: 0,
    dStart: 0, bossAt: 150, bossDone: false, tideT: 0, moonT: 0, moon: false, spawnT: 3, surgeT: 90, lullT: 0, seenMobs: {}, splits: [], rec: [], recT: 0, reactor: false,
    keys: meta.nest.key ? 1 : 0, bosses: 0, minis: 0, domMul: 1, combo: 0, comboT: 0, shriekReady: false, buffs: {}, forage: 0, expo: 0, expoCd: 0, rerolls: meta.nest.reroll || 0, nailT: 0, teslaT: 0, selfPoisonT: 12,
  });
  resetObj(st, freshStats(C));
  run.hp = st.maxHp;
  run.sta = st.staMax;
  meta.runs = (meta.runs || 0) + 1;
  saveMeta();
  const seed = G.mode === 'trial' ? weekSeed() : 'S' + Date.now();
  if (G.mode === 'trial') { run.layer = 'sewer'; run.sewerIdx = 0; }
  // Shortcuts from the Nest: start deeper, with a head start of level-up picks.
  const at = G.mode === 'trial' ? null : STARTS[meta.startAt] && STARTS[meta.startAt].ok(meta) && meta.startAt !== 'row' ? STARTS[meta.startAt] : null;
  if (at) {
    run.tier = 1;
    run.domMul = at.domMul;
    if (at.sewer) { run.layer = 'sewer'; run.sewerIdx = 0; } else run.district = at.district;
  }
  setupWorld(seed);
  run.seed = seed;
  setRat(C);
  if (G.mode === 'trial') {
    const d = G.friendGhost && G.friendGhost.s === seed ? G.friendGhost : loadJSON('scurry4.ghost.' + seed, null);
    if (d && d.d && d.d.length > 1) G.ghost = { data: d, i: 0, r: makeGhostRat(d.c) };
  }
  if (meta.nest.start && G.mode !== 'trial') { const id = pick(Object.keys(WEAP)); run.weapons.push({ id, lvl: meta.nest.arms ? 2 : 1, t: 0 }); }
  G.state = 'play';
  G.camYaw = Math.PI; G.camPitch = 0.9; G.camDist = 13;
  G.camOff.set(0, 0, 0);
  P.scent = false; P.carry = null; P.inv = 1;
  hideOverlay();
  $('hud').style.display = 'block';
  $('clsName').textContent = C.name;
  $('portrait').src = FACE[k];
  $('zoneName').textContent = G.mode === 'trial' ? 'Ghost Trial' : dName();
  renderSlots();
  hud();
  G.last = performance.now();
  banner(G.mode === 'trial' ? 'Ghost Trial' : dName(), at ? 'Shortcut · three free picks to catch up' : run.mods.map(m => MODS[m].name).join(' · '));
  if (at) {
    for (let i = 0; i < 3; i++) { run.level++; run.need = need(run.level); }
    run.pendingLv = 3;
    openLevelUp();
  }
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

function transition(apply, title, sub) {
  if (G.state !== 'play') return;
  G.state = 'trans';
  $('fade').style.opacity = 1;
  setTimeout(() => {
    apply();
    run.bossDone = false;
    run.dStart = run.time;
    run.nests = 0;
    run.surgeT = 75;
    run.rerolls = meta.nest.reroll || 0;
    meta.maxDistrict = Math.max(meta.maxDistrict, run.district);
    if (isSewer()) meta.maxSewer = Math.max(meta.maxSewer, run.sewerIdx);
    const got = checkUnlocks();
    setupWorld('S' + Date.now());
    run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.3);
    $('zoneName').textContent = dName();
    $('fade').style.opacity = 0;
    G.state = 'play';
    G.last = performance.now();
    banner(title(), got.length ? 'Unlocked: ' + got.join(', ') : sub());
  }, 450);
}

/** Take the manhole: a harder, claustrophobic sewer layer with premium loot. */
export function enterSewer() {
  meta.sewers = (meta.sewers || 0) + 1;
  addThreat(2);
  transition(() => { run.layer = 'sewer'; run.tier++; }, () => 'Descending · ' + dName(), () => 'Mutated horde · zero-visibility pockets · premium loot');
}
export function exitRoad() {
  transition(() => { run.district++; run.tier++; }, dName, () => run.mods.map(m => MODS[m].name).join(' · '));
}
export function exitLadder() {
  transition(() => { run.layer = 'surface'; run.district++; run.sewerIdx++; run.tier++; }, () => 'Back on the streets · ' + dName(), () => run.mods.map(m => MODS[m].name).join(' · '));
}

export function checkUnlocks() {
  const got = [];
  for (const k in UNLOCK) if (UNLOCK[k].req && UNLOCK[k].req(meta) && !meta['u_' + k]) { meta['u_' + k] = 1; got.push(CLASSES[k].name); }
  SKINS.forEach((s, i) => { if (s.req && s.req(meta) && !meta['s_' + i]) { meta['s_' + i] = 1; got.push(s.name + ' fur'); } });
  saveMeta();
  return got;
}

/** Dominance: how hard you ruled the streets this run. */
export function dominanceOf() {
  const parts = {
    kills: (run.kills || 0) / 30, damage: (run.dmg || 0) / 10000, bosses: (run.bosses || 0) * 8, lairs: (run.minis || 0) * 3, depth: (run.tier || 0) * 2,
  };
  const raw = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total: Math.floor(raw * (run.domMul || 1)), parts, mul: run.domMul || 1 };
}
/** Unspent salvage (and a quarter of what you spent) plus Dominance go home to the Nest. */
export function bankSalvage() {
  const amt = Math.floor((run.scrap || 0) + (run.scrapSpent || 0) * 0.25);
  const dom = G.mode === 'trial' ? { total: 0 } : dominanceOf();
  meta.salvage = (meta.salvage || 0) + amt;
  meta.dominance = (meta.dominance || 0) + dom.total;
  meta.domTotal = (meta.domTotal || 0) + dom.total;
  saveMeta();
  return { salvage: amt, dom: dom.total };
}
