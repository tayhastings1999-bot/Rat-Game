// Damage in both directions, deaths, drops, XP and the threat engine.
import * as THREE from 'three';
import { rand, randi, TAU } from '../core/util.js';
import { G, P, W, run, st, meta, settings } from '../core/state.js';
import { world, scene } from '../render/renderer.js';
import { Cy } from '../render/models.js';
import { flameTex } from '../render/textures.js';
import { blood, spark, puff, boom, decal, gore, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { floorY } from '../world/grid.js';
import { isSewer } from '../data/world.js';
import { chain, shoot } from './arsenal.js';
import { puddle, warn } from './hazards.js';
import { spawnEnemy } from '../entities/mobs.js';
import { onBossDeath } from '../entities/bosses.js';
import { addChest } from '../world/build.js';
import { comboGain, comboBreak } from '../game/swarm.js';
import { buffOn } from '../game/forage.js';
import { junkHit } from '../game/junk.js';
import { rivalDeath } from '../world/ducts.js';
import { guardMul, maybeFlee, packRage } from '../entities/roles.js';
import { addXP, championDown, dropMusk, dropCrate } from '../game/progress.js';
import { onBossHit } from '../entities/brain.js';
import { tryPerfectDodge, perfectCrit } from '../game/feel.js';
import { contract } from '../game/contracts.js';
import { bountyKill } from '../game/events.js';
import { thiefDown } from '../game/objectives.js';
import { onKill } from '../game/rules.js';
import { scabDown } from '../game/personality.js';
import { banner } from '../ui/hud.js';
import { openLevelUp, die } from '../ui/screens.js';
import { tryParry } from '../game/signature.js';

// ---------- queries ----------
export const near = (x, y, z, R) => {
  const o = [];
  for (const e of W.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dz = e.z - z, rr = R + e.r;
    if (dx * dx + dz * dz < rr * rr && e.y < y + 2.6 && e.y + e.h > y - 2) o.push(e);
  }
  return o;
};
/** Enemies within R of the player, nearest first (patrolling predators are ignored until provoked). */
export const sorted = R => {
  const o = [];
  for (const e of W.enemies) {
    if (e.dead || (e.pred && e.mode === 'patrol' && !e.hurt) || e.hidden || e.disguise) continue;
    const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    if (d < R * R) o.push([d, e]);
  }
  return o.sort((a, b) => a[0] - b[0]).map(a => a[1]);
};
export const nearest = R => {
  let b = null, bd = R * R;
  for (const e of W.enemies) {
    if (e.dead || (e.pred && e.mode === 'patrol' && !e.hurt) || e.hidden) continue;
    const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    if (d < bd) { bd = d; b = e; }
  }
  return b;
};

const MELEE = new Set(['claw', 'whip', 'bite']);
const isMelee = src => MELEE.has(src) || (src === 'primary' && st.meleePrim);

// ---------- player → enemy ----------
export function hit(e, base, ang, kb, src, quiet, itemFx) {
  if (e.dead) return;
  if (e.invuln > 0) { if (!quiet) spark(e.x, e.y + e.h * 0.6, e.z, 0.8, 0x9ad0ff); return; }
  const melee = isMelee(src);
  kb = ((kb || 0) * 1.7 * st.kb * (st.mut.recoil ? 2.2 : 1)) / (e.mass || 1);
  if (kb > 6 && !e.heavy && !e.fly && !e.boss && ang != null && e.type !== 'nest') {
    e.vy = Math.max(e.vy || 0, kb * 0.45);
    e.bonk = 0.6;
    if (base >= 25) G.shake = Math.max(G.shake, 0.1 * settings.shake);
  }
  let d = base * st.dmg * (melee ? 1 + st.melee : 1) * (src === 'primary' ? st.primMul : 1) * (st.apex && (e.elite || e.boss || e.pred || e.champion) ? st.apex : 1);
  if (st.fury && run.hp < st.maxHp * 0.5) d *= 1.3;
  const crit = perfectCrit() || Math.random() < st.crit + (buffOn('glowcap') ? 0.25 : 0);
  e.lastSrc = src;
  if (crit) d *= st.critMul;
  if (e.ward > 0) d *= 0.4;
  const gm = guardMul(e, ang, base);
  if (gm < 1) { d *= gm; kb *= 0.2; }
  if (e.recov > 0 && !e.boss) { d *= 1.25; if (!e.openShown) { e.openShown = true; dnum(e.x, e.y + e.h + 0.6, e.z, 'OPEN', 'crit'); } } // punish the overextension
  if (e.boss) d *= onBossHit(e, d); // exposed bosses take more; bursts break their poise
  d = Math.max(1, Math.round(d));
  e.hp -= d;
  e.flash = 0.1;
  e.hitT = G.time;
  if (ang != null) e.hitA = ang;
  e.hurt = true;
  P.lastHitT = G.time;
  if (src !== 'swarm' && src !== 'dot') comboGain(Math.min(4, 0.6 + d / 12));
  sfx('hit');
  if (crit || d >= 40) G.hitStop = Math.max(G.hitStop, 0.035);
  run.dmgBy[src] = (run.dmgBy[src] || 0) + d;
  run.dmg += d;
  const chem = st.mut.chemfire ? 2 : 1;
  if (itemFx || st.poisonMul > 1) {
    if (st.poison) { e.pT = 3; e.pD = 4 * st.dmg * st.poisonMul * chem; }
    if (st.burn && itemFx) { e.bT = 2; e.bD = 7 * st.dmg * chem; }
  }
  if (kb && ang != null && !e.heavy) { e.kx += Math.sin(ang) * kb; e.kz += Math.cos(ang) * kb; }
  if (!quiet || crit) {
    blood(e.x, e.y + e.h * 0.6, e.z, e.blood, ang, crit ? 6 : 3);
    spark(e.x, e.y + e.h * 0.6, e.z, crit ? 1.4 : 0.8);
  }
  if (crit && st.mut.gutting) gore(e, 0.35);
  if (!quiet || crit || Math.random() < 0.3) dnum(e.x, e.y + e.h + 0.3, e.z, d, crit ? 'crit' : '');
  if (melee && st.meleeLeech) run.hp = Math.min(st.maxHp, run.hp + st.meleeLeech * st.healMul);
  junkHit(e, d, src);
  if (melee && st.mut.livewire && Math.random() < 0.35) chain(e, 2, d * 0.5, 'livewire', [e.x, e.y + e.h * 0.6, e.z], true);
  if (e.hp <= 0) kill(e);
  else maybeFlee(e);
}

export function aoe(x, y, z, R, dm, kb, src, slow, itemFx) {
  const m = 1 + 0.05 * (run.level - 1);
  for (const e of near(x, y, z, R)) {
    hit(e, dm * m, Math.atan2(e.x - x, e.z - z), kb, src, false, itemFx);
    if (slow) e.slow = slow;
  }
}

// ---------- enemy → player ----------
export function hurtP(d, from, raw) {
  if (G.state !== 'play') return;
  if (!raw && tryParry(from)) return;
  if (!raw && P.inv > 0) { tryPerfectDodge(); return; }
  if (!raw && G.boss && G.boss.revealed) run.bossHit = true;
  if (P.bulwark > 0) {
    d *= 0.3;
    if (from && from.hp != null && !from.dead) hit(from, 30, Math.atan2(from.x - P.x, from.z - P.z), 14, 'special');
  }
  if (from && from.hp != null) d *= st.guard; // melee classes brace against bites and swipes
  d = Math.max(1, Math.round(d * st.taken * (buffOn('ironmold') ? 0.6 : 1) * (1 + 0.1 * run.tier) - (raw ? 0 : st.armor)));
  run.hp -= d;
  run.dHurt = (run.dHurt || 0) + d;
  if (G.qa) G.qa.hurt(d, from, raw);
  if (!raw) P.inv = 0.6;
  G.flash = Math.max(G.flash, raw ? 0.35 : 1);
  G.shake = Math.max(G.shake, raw ? 0.08 : 0.25);
  if (from && P.slam !== 'sinker') {
    const dx = P.x - from.x, dz = P.z - from.z, l = Math.hypot(dx, dz) || 1;
    P.vx += dx / l * 6;
    P.vz += dz / l * 6;
    if (from.corrupt === 'leech' && !from.dead) { from.hp = Math.min(from.maxHp, from.hp + from.maxHp * 0.12); puff(from.x, from.y + from.h * 0.6, from.z, 0xd02040, 6, 2); }
    if (st.thorns && from.hp != null && !from.dead && (from.tT || 0) <= 0) { from.tT = 0.5; hit(from, st.thorns, Math.atan2(from.x - P.x, from.z - P.z), 6, 'thorns'); }
  }
  blood(P.x, P.y + 0.5, P.z, 0xa01010, null, raw ? 2 : 6);
  if (!raw) { dnum(P.x, P.y + 1.4, P.z, '-' + d, 'heal'); sfx('hurt'); G.hitStop = Math.max(G.hitStop, 0.05); comboBreak(); }
  if (run.hp < st.maxHp * 0.3 && !run.lowWarned) { run.lowWarned = true; banner('Rat needs cheese, badly!', 'Press F to sniff out a food cache'); }
  if (run.hp <= 0) {
    if (run.reactor) {
      run.reactor = false;
      run.hp = st.maxHp * 0.5;
      P.inv = 2;
      banner('Emergency Reactor', 'Back from the brink');
      boom(P.x, P.y + 0.5, P.z, 5, 0x9ad0ff);
      return;
    }
    die();
  }
}

// ---------- deaths & drops ----------
export function kill(e) {
  if (e.dead) return;
  e.dead = true;
  if (G.qa) G.qa.kill(e);
  run.kills++;
  run.spike = (run.spike || 0) + 0.025;
  meta.kills++;
  if (e.mini) run.minis = (run.minis || 0) + 1;
  comboGain(e.mini ? 20 : e.elite ? 8 : e.boss ? 0 : 3);
  sfx('kill');
  if (e.boss || e.pred || e.elite || e.type === 'brute' || e.type === 'nest') G.hitStop = Math.max(G.hitStop, e.boss ? 0.3 : 0.08);
  const big = e.boss || e.pred;
  blood(e.x, e.y + e.h * 0.5, e.z, e.blood, null, big ? 30 : 12, e.boss ? 8 : 5);
  puff(e.x, e.y + e.h / 2, e.z, e.col, e.boss ? 20 : 5, 3.5);
  boom(e.x, e.y + e.h * 0.5, e.z, (big ? 5 : 1.6) * (e.sc || 1), e.blood);
  decal(e.x, floorY(e.x, e.z) + 0.01, e.z, rand(1.2, 2.2) * (big ? 2.5 : 1) * (e.sc || 1), e.blood);
  // Small fry die with a short ragdoll tumble (sync.js) and lose a few chunks now.
  const rag = !e.boss && !e.pred && !e.mesh && !e.rival && e.type !== 'nest';
  gore(e, rag ? 0.6 : 1);
  if (rag && W.corpses.length < 60) {
    const a = e.hitA ?? e.ang + Math.PI, v = e.fly ? 2 : 3.5 + Math.min(6, Math.hypot(e.kx || 0, e.kz || 0) * 0.4);
    W.corpses.push({ type: e.type, x: e.x, y: e.y, z: e.z, ang: e.ang, sc: e.sc || 1, ph: e.ph || 0, vx: Math.sin(a) * v, vy: e.fly ? 0 : rand(3, 5.5), vz: Math.cos(a) * v, rx: 0, rz: 0, sx: rand(-9, 9), sz: rand(-9, 9), t: 0, life: e.fly ? 0.9 : 0.6, fly: e.fly, blood: e.blood, col: e.col, h: e.h, gph: e.gph || 0 });
  }
  if (st.leech) run.hp = Math.min(st.maxHp, run.hp + st.leech * st.healMul);
  if (st.carrion && !e.boss) run.hp = Math.min(st.maxHp, run.hp + st.maxHp * st.carrion * st.healMul);
  if (e.champion) championDown(e);
  if (e.lastSrc === 'trap') contract('traps');
  if (P.shadow && !e.boss) contract('shadow');
  if (e.elite && !e.champion) contract('elites');
  if (e.bounty) { contract('bounty'); bountyKill(e); }
  if (e.thief) thiefDown(e);
  packRage(e);
  if (e.type === 'mimic') { const gy = floorY(e.x, e.z); dropCrate(e.x, gy, e.z); for (let i = 0; i < 8; i++) scrapDrop(e.x, gy, e.z); if (e.bin) e.bin.done = true; }
  onKill(e);
  if (e.scab) scabDown(e);
  if (st.meleePrim && !e.boss) { run.blood = Math.min(6, (run.blood || 0) + 1); run.bloodT = 2.5; }
  if (st.shrap && !e.boss) W.shrapQ.push([e.x, e.y, e.z]);
  if (st.mut.nailbomb && !e.boss && run.nailT <= 0) {
    run.nailT = 0.08;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + rand(0, 1); shoot(e.x, e.y + 0.5, e.z, Math.sin(a), 0, Math.cos(a), 20, 9, 1, 'nailbomb', { col: 0xc8a080, life: 0.5, from: e }); }
  }
  if (st.mut.chemfire && e.bT > 0) puddle('pfire', e.x, e.z, 2, 4, 'p');
  if (e.corrupt) corruptDeath(e);
  if (e.mini) {
    const gy = floorY(e.x, e.z);
    addChest(e.x, gy, e.z, true);
    for (let i = 0; i < 12; i++) scrapDrop(e.x, gy, e.z);
    if (!isSewer() && !run.keys && !W.keys.length && Math.random() < 0.6) dropKey(e.x + 1.2, gy, e.z);
    banner(e.name + ' slain', 'Its hoard is yours');
    G.hitStop = Math.max(G.hitStop, 0.2);
  }

  if (e.rival) { rivalDeath(e, scrapDrop, dropGem); addThreat(0.3); contract('rival'); return; }
  if (e.type === 'nest') {
    world.remove(e.mesh);
    run.nests--;
    addThreat(0.8);
    for (let i = 0; i < 10; i++) scrapDrop(e.x, e.y, e.z);
    if (Math.random() < 0.6) dropFood(e.x, e.y, e.z);
    dnum(e.x, e.y + 2, e.z, 'Nest destroyed', 'info');
    G.shake = 0.35;
    return;
  }
  if (e.boss) { onBossDeath(e); return; }
  if (e.pred) {
    scene.remove(e.mesh);
    for (let i = 0; i < 15; i++) scrapDrop(e.x, e.y, e.z);
    dropFood(e.x, e.y, e.z);
    dnum(e.x, e.y + 2, e.z, 'Predator slain', 'info');
    return;
  }
  if (e.xp) dropGem(e.x, e.y, e.z, e.xp * (e.mut ? 1.5 : 1));
  if (Math.random() < (e.mut ? 0.55 : 0.3)) scrapDrop(e.x, e.y, e.z);
  // Food turns up more often when you're hurting.
  if (Math.random() < (run.hp < st.maxHp * 0.35 ? 0.05 : 0.012)) dropFood(e.x, e.y, e.z);
  if (e.elite && !e.champion && Math.random() < 0.08) dropMusk(e.x, floorY(e.x, e.z), e.z);
}

function corruptDeath(e) {
  for (let i = 0; i < 5; i++) scrapDrop(e.x, e.y, e.z);
  dropCore(e.x, e.y, e.z);
  if (!isSewer() && !run.keys && !W.keys.length && Math.random() < 0.22) dropKey(e.x, e.y, e.z);
  if (e.corrupt === 'split') {
    for (let i = 0; i < 3; i++) spawnEnemy(e.type, e.x + rand(-1, 1), e.z + rand(-1, 1), { plain: true, sc: 0.75 });
  }
  if (e.corrupt === 'volatile') warn(e.x, e.z, 3.4, 0.8, e.dmg * 1.4, { y: floorY(e.x, e.z), kb: 1, col: 0xff3a20 });
}

export function dropGem(x, y, z, v) {
  if (W.gems.length >= 580) { W.gems[randi(0, W.gems.length - 1)].v += v; return; }
  W.gems.push({ x, y, z, v, pull: false, s: 0, ph: rand(0, 6) });
}
export function scrapDrop(x, y, z) {
  if (W.scraps.length < 290) W.scraps.push({ x: x + rand(-0.6, 0.6), y, z: z + rand(-0.6, 0.6), pull: false, s: 0, ph: rand(0, 6) });
}
export function dropCore(x, y, z) {
  W.cores.push({ x, y: Math.max(y, floorY(x, z)), z, ph: rand(0, 6), s: 0, pull: false });
}
const foodMat = new THREE.MeshLambertMaterial({ color: 0xe8b84a, emissive: 0x4a3000, flatShading: true });
export function dropFood(x, y, z) {
  const m = new THREE.Mesh(Cy(0.35, 0.35, 0.25, 10), foodMat);
  m.castShadow = true;
  world.add(m);
  W.foods.push({ x, y, z, m });
}
const keyMat = new THREE.MeshBasicMaterial({ color: 0xffd040 });
export function dropKey(x, y, z) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 5, 10), keyMat);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), keyMat);
  shaft.position.z = 0.55;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.12), keyMat);
  bit.position.set(0, -0.12, 0.8);
  g.add(ring, shaft, bit);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffd040, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(2, 2, 1);
  g.add(glow);
  const gy = Math.max(y, floorY(x, z));
  g.position.set(x, gy + 0.8, z);
  world.add(g);
  W.keys.push({ x, y: gy, z, g });
  dnum(x, gy + 2, z, 'Sewer key!', 'info');
  sfx('key');
}

/** XP for the next level. Income scales with threat (see progress.js), so the pace stays even. */
// The first few levels come quickly so the opening minute has a pick in it.
export const need = L => Math.floor((8 + (L - 1) * 6 + Math.pow(L - 1, 1.6)) * (L === 1 ? 1 : Math.min(1, 0.7 + 0.1 * L)));
export function gainXP(v) {
  addXP(v);
  if (run.pendingLv && G.state === 'play') openLevelUp();
}

// ---------- threat engine ----------
/**
 * Threat is a volatile index: it climbs with time, depth, level, loot and every
 * risky choice, spikes on kills and decisions, and oscillates on its own. It
 * scales enemy HP, damage, speed, attack rate, spawn rate and elite odds.
 */
export function updThreat(dt) {
  run.spike = (run.spike || 0) * Math.exp(-dt / 20);
  const sewer = isSewer() ? 2.2 : 0;
  const TL = Math.max(0,
    (run.threatBase || 0) + run.time / 60 * 0.6 + run.tier * 1.8 + sewer + run.level * 0.1 + (run.decisions || 0) * 0.1 +
    run.items.length * 0.2 + run.cursed.length * 0.6 + run.spike + Math.sin(run.time * 0.23) * 0.3 + Math.sin(run.time * 0.061 + 1) * 0.45,
  ) * (G.mode === 'trial' ? 0.3 : 1);
  run.T = TL;
  run.hpM = 1 + TL * 0.3;
  run.dmgM = 1 + TL * 0.1;
  run.spdM = 1 + Math.min(0.55, TL * 0.03);
  run.atkM = 1 + Math.min(1.4, TL * 0.07);
}
export function addThreat(v) {
  run.threatBase = (run.threatBase || 0) + v * 0.5;
  run.spike = (run.spike || 0) + v * 0.8;
  run.decisions = (run.decisions || 0) + 1;
  if (v >= 0.3 && G.state === 'play') dnum(P.x, P.y + 2.1, P.z, '+THREAT', 'burn');
}
export const threatTier = T => (T < 3 ? ['CALM', '#9be06a'] : T < 6 ? ['UNEASY', '#f2b233'] : T < 10 ? ['HOSTILE', '#ff8a3a'] : T < 15 ? ['FERAL', '#e0382c'] : ['APOCALYPSE', '#ff3aa0']);
