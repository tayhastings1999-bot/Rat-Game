// The Nest shop: spend banked gold (meta.salvage). Upgrades are permanent ranks in
// meta.shop; supplies and flasks are packed in meta.pack and spent by the next run.
import { G, P, meta, run, st, saveMeta } from '../core/state.js';
import { SHOP } from '../data/shop.js';
import { POWERUPS, grantPowerup } from './powerups.js';
import { TUNE } from '../tuning.js';

const perm = id => SHOP[id].kind === 'stat' || SHOP[id].kind === 'hp' || SHOP[id].kind === 'gold';
/** Owned ranks (upgrades) or packed count (supplies, flasks). */
export const rank = id => ((perm(id) ? meta.shop : meta.pack) || {})[id] || 0;
/** Price of the next one, or null when maxed / fully packed. */
export const price = id => {
  const S = SHOP[id], r = rank(id);
  if (r >= S.max) return null;
  return perm(id) ? Math.round(S.base * TUNE.shop.grow ** r) : S.base;
};
/** The effect at rank r, in display units (stat points, HP, gold fraction). */
export function amount(id, r = rank(id)) {
  const k = SHOP[id].kind, T = TUNE.shop;
  return k === 'stat' ? r * T.statPer : k === 'hp' ? r * T.hpPer : k === 'gold' ? r * T.goldPer : r;
}
export function effectText(id, r = rank(id)) {
  const S = SHOP[id];
  return S.kind === 'flask' ? `${POWERUPS[S.pu].desc} for ${TUNE.powerups.dur}s` : S.desc(amount(id, r));
}
export const isPerm = perm;

export function buy(id) {
  const c = price(id);
  if (c == null || (meta.salvage || 0) < c) return false;
  meta.salvage -= c;
  const o = perm(id) ? (meta.shop ||= {}) : (meta.pack ||= {});
  o[id] = (o[id] || 0) + 1;
  saveMeta();
  return true;
}

/** Starting stat growth for run.growth (stats.js derive reads it). */
export function shopGrowth() {
  return { str: amount('str'), spd: amount('spd'), arm: amount('arm'), mag: amount('mag'), hp: amount('hide') };
}

/** Called by startRun after run and st are reset: upgrades apply, the pack is unpacked. */
export function applyShop() {
  st.salvage *= 1 + amount('pack');
  const p = meta.pack || {};
  run.vials = Math.min(TUNE.vials.max, run.vials + (p.vial || 0));
  run.keys += p.key || 0;
  run.cheese = p.cheese || 0;
  run.tails = p.tail || 0;
  run.flasks = Object.keys(SHOP).filter(id => SHOP[id].kind === 'flask' && p[id]).map(id => SHOP[id].pu);
  meta.pack = {};
  saveMeta();
}

/** Combat hook: eat a packed cheese when HP falls low (before death is checked). */
export function onLowHp() {
  if (!run.cheese || run.hp <= 0 || run.hp > st.maxHp * TUNE.shop.cheeseAt) return;
  run.cheese--;
  run.hp = Math.min(st.maxHp, run.hp + st.maxHp * TUNE.shop.cheeseHeal);
}
/** Death hook: a Second Tail puts you back on your feet. True if death was cheated. */
export function cheatDeath() {
  if (!run.tails || run.abandon) return false;
  run.tails--;
  run.hp = st.maxHp * 0.5;
  P.inv = 1.5;
  return true;
}
/** Boss hook: uncork every packed flask. */
export function onBossWake() {
  if (!run.flasks || !run.flasks.length || !G.boss) return;
  for (const k of run.flasks) grantPowerup(k);
  run.flasks = [];
}
