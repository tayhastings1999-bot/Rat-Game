// Leveling. XP income tracks the threat (a tougher horde pays more) with a
// gentle catch-up if you fall behind the pace, every level-up blasts a little
// breathing room around you, and every fifth level is a Breakthrough: the XP
// bar caps and a Champion comes for you. Kill it to break through and pick
// from evolutions, keystone perks and legendary tomes.
import * as THREE from 'three';
import { rand, pick, keep } from '../core/util.js';
import { G, P, W, run, st, meta } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { Bx, Cy } from '../render/models.js';
import { flameTex } from '../render/textures.js';
import { boom, fx, puff, spark, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, toW, floorY, tileAt } from '../world/grid.js';
import { isSewer } from '../data/world.js';
import { hit, near, need } from '../combat/combat.js';
import { WEAP, TOMES, tomeMax } from '../combat/arsenal.js';
import { spawnEnemy } from '../entities/mobs.js';
import { banner, renderSlots } from '../ui/hud.js';
import { openLevelUp } from '../ui/screens.js';
import { contract } from './contracts.js';
import { rulesLeft } from './rules.js';

export const BREAK_EVERY = 5;
export const TRIAL_TIME = 45;
export const isBreak = L => L % BREAK_EVERY === 0 && G.mode !== 'trial';

/** Evolutions: a level-5 weapon plus its paired tome evolves at a Breakthrough. */
export const EVO = {
  claw: { tome: 'might', name: "Butcher's Hooks", desc: 'Rakes in all four directions for 60% more damage, 30% faster.' },
  whip: { tome: 'swift', name: 'Barbed Scourge', desc: '30% wider lashes that slow, 50% more damage, 30% faster.' },
  aura: { tome: 'hunger', name: 'Black Death', desc: '35% wider cloud, 80% more damage, and it poisons.' },
  flask: { tome: 'reach', name: 'Plague Barrage', desc: 'Two extra flasks that leave burning sludge behind.' },
  sling: { tome: 'plenty', name: 'Gatling Sling', desc: 'Fires more than twice as fast; stones pierce two more foes.' },
  arc: { tome: 'cunning', name: 'Storm Crown', desc: 'Three extra chains, an extra strike, 40% more damage.' },
  orbit: { tome: 'hide', name: 'Ossuary Ring', desc: 'Three more teeth on a wider ring, 50% more damage.' },
};
/** Keystones: big unique perks, only offered at Breakthroughs. */
export const KEYSTONES = {
  pack: { name: 'Pack Leader', desc: 'The combo meter fills 40% faster and your shriek calls four more nest-mates.', ap: () => { st.comboMul = 1.4; st.swarmPlus = 4; } },
  second: { name: 'Second Wind', desc: 'Once per district, dropping below 30% HP makes you untouchable for 3s and heals 25%.', ap: () => { st.secondWind = true; } },
  carrion: { name: 'Carrion Feast', desc: 'Every kill heals 0.8% of your max HP.', ap: () => { st.carrion = 0.008; } },
  apex: { name: 'Apex Hunter', desc: '+30% damage to elites, champions, predators and bosses.', ap: () => { st.apex = 1.3; } },
  scrapper: { name: 'Scrapper', desc: '+50% salvage, and pickups come to you from 60% further.', ap: () => { st.salvage *= 1.5; st.magnet *= 1.6; } },
  growth: { name: 'Frenzied Growth', desc: '+20% XP and +10% move speed.', ap: () => { st.xp += 0.2; st.speed *= 1.1; } },
};

// ---------- XP ----------
/** The level an average player should be at after `t` seconds (the catch-up target). */
export const PACE = t => 1 + 3.2 * Math.pow(t / 60, 0.68);
/**
 * A tougher horde pays a little more (up to threat 10). The pace is rubber-banded:
 * falling behind pays up to 30% extra, racing ahead pays up to 60% less, so a strong
 * build stays near the curve instead of escaping it.
 */
export function xpMul() {
  const off = PACE(run.time) - run.level;
  const band = off > 0 ? 1 + Math.min(0.3, off * 0.05) : Math.max(0.4, 1 + off * 0.08);
  return (1 + 0.03 * Math.min(10, run.T || 0)) * band;
}
export const capped = () => isBreak(run.level + 1) && run.xp >= run.need;

export function addXP(v, raw) {
  const gain = raw ? v : v * st.xp * xpMul();
  if (!raw) run.xpTotal = (run.xpTotal || 0) + gain;
  // While the bar waits on a Breakthrough, at most one level's worth banks up, so a long
  // stall doesn't turn into a burst of levels afterwards (found by the pace bots).
  const bankCap = () => need(run.level + 1);
  if (capped()) { run.xpBank = Math.min(bankCap(), (run.xpBank || 0) + gain); return; }
  run.xp += gain;
  while (run.xp >= run.need) {
    if (isBreak(run.level + 1)) {
      // The bar caps; the overflow is banked until you break through.
      run.xpBank = Math.min(bankCap(), (run.xpBank || 0) + (run.xp - run.need));
      run.xp = run.need;
      if (!run.trial && !run.trialCue) { run.trialCue = true; run.trialCd = Math.min(run.trialCd || 0, 1.5); banner('Breakthrough ready', 'A champion is coming for you'); }
      break;
    }
    run.xp -= run.need;
    run.level++;
    run.need = need(run.level);
    run.pendingLv++;
    levelBurst(false);
  }
}

/** Every level: a shockwave that shoves the horde back, a little heal, a beat of slow-mo. */
export function levelBurst(big) {
  const R = big ? 7 : 4.2;
  for (const e of near(P.x, P.y, P.z, R)) hit(e, big ? 45 + run.level * 2 : 6, Math.atan2(e.x - P.x, e.z - P.z), big ? 18 : 11, 'level', true);
  const h = st.maxHp * (big ? 0.3 : 0.05) * st.healMul;
  run.hp = Math.min(st.maxHp, run.hp + h);
  fx('ring', P.x, P.y, P.z, R, big ? 0xffd040 : 0x6ad0ff, big ? 0.7 : 0.4);
  boom(P.x, P.y + 0.6, P.z, big ? 6 : 2.6, big ? 0xffd040 : 0x9ad8ff);
  G.hitStop = Math.max(G.hitStop, big ? 0.3 : 0.06);
  G.flashGold = big ? 1 : 0.4;
  if (big) G.shake = Math.max(G.shake, 0.6);
}

// ---------- Breakthrough trials ----------
const CHAMP_TYPES = ['brute', 'ghoul', 'cat', 'bloat', 'shade', 'crow', 'moth', 'mawling'];
function startTrial() {
  const L = run.level + 1;
  const seen = CHAMP_TYPES.filter(t => run.seenMobs && run.seenMobs[t]);
  const type = seen[0] || 'mawling';
  // Somewhere on the edge of the fight, not on top of you.
  const tiles = M.spawnTiles || [];
  let e = null;
  const opts = { elite: true, corrupt: pick(['haste', 'ward', 'fire', 'leech']), sc: 1.7, name: 'Champion', force: true };
  for (let i = 0; i < 16 && !e && tiles.length; i++) {
    const k = tiles[(Math.random() * tiles.length) | 0], x = toW(k % M.W), z = toW((k / M.W) | 0), d = Math.hypot(x - P.x, z - P.z);
    if (d < 10 || d > 44) continue;
    e = spawnEnemy(type, x, z, opts);
  }
  // Fallback: any open ground in a ring around you.
  for (let i = 0; i < 16 && !e; i++) {
    const a = rand(0, 6.3), r = rand(10, 16), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r, t = tileAt(x, z);
    if (t === 1 || t === 9 || t === 10) e = spawnEnemy(type, x, z, opts);
  }
  if (!e) { run.trialCd = 1; return; }
  // Scales with your level more than with the threat, so a run that levels slowly can still break through.
  // Each failed attempt sends a weaker champion (down to 40%), so no build gets stuck at a Breakthrough.
  const hp = 150 * (1 + L * 0.15) * (1 + (run.T || 0) * 0.1) * (isSewer() ? 1.3 : 1) * Math.max(0.4, Math.pow(0.8, run.trialFails || 0));
  Object.assign(e, { champion: true, hp, maxHp: hp, bar: true, dmg: e.dmg * 1.15, xp: 0 });
  run.trial = { L, e, t: TRIAL_TIME };
  run.trialCue = false;
  banner(`Breakthrough trial · level ${L}`, `Kill the Champion ${type === 'mawling' ? '' : type + ' '}within ${TRIAL_TIME}s`);
  sfx('phase');
  G.shake = Math.max(G.shake, 0.3);
  // It brings friends.
  for (let i = 0; i < 5; i++) spawnEnemy(type === 'brute' ? 'mawling' : type, e.x + rand(-3, 3), e.z + rand(-3, 3), { plain: true });
}
function failTrial() {
  const e = run.trial.e;
  run.trialFails = (run.trialFails || 0) + 1;
  if (!e.dead) { e.dead = true; puff(e.x, e.y + 1, e.z, 0x6a6a6a, 20, 4); }
  run.trial = null;
  run.trialCd = 18;
  run.trialCue = true;
  banner('The champion slinks away', 'It will be back, weaker · the bar stays full');
}
/** Called from kill(): the Champion is down. */
export function championDown(e) {
  if (!run.trial || run.trial.e !== e) return;
  run.trial = null;
  run.trialCd = 0;
  run.trialFails = 0;
  run.xp = 0;
  run.level++;
  run.need = need(run.level);
  run.pendingLv++;
  run.btPick = (run.btPick || 0) + 1;
  contract('champ');
  levelBurst(true);
  banner(`Breakthrough · level ${run.level}`, 'Choose your reward');
  sfx('level');
  dropCrate(e.x, floorY(e.x, e.z), e.z);
  dropMusk(e.x + 1.2, floorY(e.x, e.z), e.z);
  // Spend the banked overflow (it may carry you straight on towards the next level).
  const b = run.xpBank || 0;
  run.xpBank = 0;
  if (b) addXP(b, true);
}

export function tickProgress(dt) {
  if (G.flashGold) G.flashGold = Math.max(0, G.flashGold - dt * 1.5);
  const T = run.trial;
  if (T) {
    T.t -= dt;
    if (T.e.dead && run.trial) { run.trial = null; run.trialCd = 5; run.trialCue = true; } // killed by something odd (a pit): try again
    else if (T.t <= 0) failTrial();
  } else if (capped()) {
    run.trialCd = (run.trialCd ?? 1.5) - dt;
    // Not while a boss is right on top of you.
    const b = G.boss, busy = !G.testNoBusy && b && b.revealed && !b.dead && Math.hypot(b.x - P.x, b.z - P.z) < 30;
    if (run.trialCd <= 0 && !busy) startTrial();
  }
  // Second Wind keystone.
  if (st.secondWind && !run.windUsed && run.hp > 0 && run.hp < st.maxHp * 0.3) {
    run.windUsed = true;
    P.inv = Math.max(P.inv, 3);
    run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.25 * st.healMul);
    banner('Second Wind', '');
    fx('ring', P.x, P.y, P.z, 5, 0x9affc0, 0.6);
  }
  tickPickups(dt);
  if (run.pendingLv > 0 && G.state === 'play') openLevelUp();
}

// ---------- pickups: weapon crates and rat musk ----------
const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6038, emissive: 0x3a2000, flatShading: true });
const muskMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a, emissive: 0x201008, flatShading: true });
function glowTo(g, col, s) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
  sp.scale.set(s, s, 1);
  sp.position.y = 0.5;
  g.add(sp);
}
export function dropCrate(x, y, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(Bx(0.8, 0.6, 0.6), crateMat);
  b.position.y = 0.3;
  g.add(b);
  const band = new THREE.Mesh(Bx(0.84, 0.12, 0.64), new THREE.MeshBasicMaterial({ color: 0xffd040 }));
  band.position.y = 0.3;
  g.add(band);
  glowTo(g, 0xffd040, 2.2);
  g.position.set(x, y, z);
  world.add(g);
  W.crates.push({ x, y, z, g, kind: 'crate' });
}
export function dropMusk(x, y, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(Cy(0.16, 0.22, 0.45, 6), muskMat);
  b.position.y = 0.25;
  g.add(b);
  glowTo(g, 0x9ad8ff, 1.4);
  g.position.set(x, y, z);
  world.add(g);
  W.crates.push({ x, y, z, g, kind: 'musk' });
}
/** Weapon crate: a level for a weapon that isn't maxed, or a new weapon if a slot is free. */
function openCrate() {
  const up = run.weapons.filter(w => w.lvl < 5);
  if (up.length) { const w = pick(up); w.lvl++; banner('Weapon crate', `${WEAP[w.id].name} → level ${w.lvl}`); }
  else if (run.weapons.length < 4) {
    const id = pick(Object.keys(WEAP).filter(k => !run.weapons.some(w => w.id === k)));
    run.weapons.push({ id, lvl: meta.nest.arms ? 2 : 1, t: 0 });
    banner('Weapon crate', WEAP[id].name);
  } else {
    // Everything maxed: patch up and salvage the crate (it used to add damage forever).
    run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.25 * st.healMul);
    run.scrap += 15 * st.salvage;
    banner('Weapon crate', 'Everything is maxed · patched up and salvaged');
  }
  renderSlots();
}
function tickPickups(dt) {
  keep(W.crates, c => {
    c.g.rotation.y += dt * 1.5;
    c.g.position.y = c.y + Math.sin(G.time * 3 + c.x) * 0.1;
    if (Math.hypot(P.x - c.x, P.z - c.z) > 1.3 || Math.abs(P.y - c.y) > 1.6) return true;
    bury(c.g);
    sfx('key');
    if (c.kind === 'crate') openCrate();
    else {
      // Rat musk: every gem on the map comes running.
      for (const g of W.gems) g.pull = true;
      dnum(P.x, P.y + 1.6, P.z, 'Rat musk!', 'info');
      spark(P.x, P.y + 1, P.z, 2, 0x9ad8ff);
    }
    return false;
  });
}

// ---------- Breakthrough offers ----------
export function breakOffers() {
  const out = [];
  for (const w of run.weapons) if (EVO[w.id] && w.lvl >= 5 && !w.evo && (run.tomes[EVO[w.id].tome] || 0) > 0) out.push({ kind: 'evo', id: w.id, rar: 3 });
  const rl = rulesLeft();
  if (rl.length) out.push({ kind: 'rule', id: rl[(Math.random() * rl.length) | 0], rar: 3 });
  const keys = Object.keys(KEYSTONES).filter(k => !(run.keystones || []).includes(k));
  for (let i = 0; i < 2 && keys.length; i++) out.push({ kind: 'key', id: keys.splice((Math.random() * keys.length) | 0, 1)[0], rar: 3 });
  const tomes = Object.keys(TOMES).filter(id => !TOMES[id].flat && (run.tomes[id] || 0) < tomeMax(id));
  while (out.length < 4 && tomes.length) out.push({ kind: 'tome', id: tomes.splice((Math.random() * tomes.length) | 0, 1)[0], rar: Math.random() < 0.4 ? 3 : 2 });
  // Everything taken (long runs): never open an empty screen, which would soft-lock the game. Found by the playtest bots.
  if (!out.length) out.push({ kind: 'heal', rar: 0 });
  return out.slice(0, 4);
}
export function applyKeystone(id) {
  run.keystones = run.keystones || [];
  run.keystones.push(id);
  KEYSTONES[id].ap();
  banner('Keystone · ' + KEYSTONES[id].name, KEYSTONES[id].desc);
}
export function evolve(id) {
  const w = run.weapons.find(w => w.id === id);
  if (!w) return;
  w.evo = true;
  w.lvl = 6;
  banner('Evolved · ' + EVO[id].name, EVO[id].desc);
  sfx('mutation');
  boom(P.x, P.y + 0.8, P.z, 5, 0xffd040);
}
