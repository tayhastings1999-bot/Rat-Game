// The Nest shop: spend banked gold (meta.salvage). Upgrades are permanent ranks in
// meta.shop; supplies and flasks are packed in meta.pack and spent by the next run.
import { G, P, meta, run, st, saveMeta } from '../core/state.js';
import { SHOP } from '../data/shop.js';
import { POWERUPS, grantPowerup } from './powerups.js';
import { TUNE } from '../tuning.js';
import { diffMods } from '../combat/combat.js';

const perm = id => SHOP[id].kind === 'stat' || SHOP[id].kind === 'hp' || SHOP[id].kind === 'gold';
/** Owned ranks (upgrades) or packed count (supplies, flasks). */
export const rank = id => ((perm(id) ? meta.shop : meta.pack) || {})[id] || 0;
/** Price of the next one, or null when maxed / fully packed. */
export const price = id => {
  const S = SHOP[id], r = rank(id);
  if (r >= S.max) return null;
  const T = TUNE.shop, g = S.kind === 'hp' || S.kind === 'gold' ? T.grow ** r : 1;
  return Math.round(S.x * T.goldPerLevel * g / 5) * 5;
};
/** What one packed supply or flask sells back for (null for permanent upgrades or nothing packed). */
export const sellPrice = id => {
  if (perm(id) || !rank(id)) return null;
  return Math.floor(Math.round(SHOP[id].x * TUNE.shop.goldPerLevel / 5) * 5 * TUNE.shop.sellBack);
};
export function sell(id) {
  const c = sellPrice(id);
  if (c == null) return false;
  meta.pack[id]--;
  meta.salvage = (meta.salvage || 0) + c;
  saveMeta();
  return true;
}
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
  st.salvage *= (1 + amount('pack')) * diffMods().gold;
  const p = meta.pack || {};
  run.vials = Math.min(TUNE.vials.max, run.vials + (p.vial || 0));
  run.keys += p.key || 0;
  run.cheese = p.cheese || 0;
  run.tails = p.tail || 0;
  run.flasks = {}; // power-up key → count held
  for (const id of Object.keys(SHOP)) if (SHOP[id].kind === 'flask' && p[id]) run.flasks[SHOP[id].pu] = (run.flasks[SHOP[id].pu] || 0) + p[id];
  run.flaskSel = 0;
  run.flaskT = {};
  run.flaskOn = null;
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
// ---------- held flasks ----------
// Bound to V (use) and B (cycle) on the keyboard and the Flask / Swap touch buttons.
// useFlask and cycleFlask take no arguments, so a gamepad binding can call them directly.
/** Flask types held, in a stable order. */
export const heldFlasks = () => Object.keys(run.flasks || {}).filter(k => run.flasks[k] > 0 || (run.flaskT && run.flaskT[k] > 0) || (run.flaskOn === k));
/** The selected flask's power-up key, or null when none are held. */
export function selFlask() {
  const h = heldFlasks();
  if (!h.length) return null;
  run.flaskSel = ((run.flaskSel || 0) % h.length + h.length) % h.length;
  return h[run.flaskSel];
}
export function cycleFlask() {
  const h = heldFlasks();
  if (h.length > 1) run.flaskSel = ((run.flaskSel || 0) + 1) % h.length;
  return selFlask();
}
/**
 * V on the selected flask, GDL-style toggle: uncork a fresh one, cork an open one (its
 * remaining time is saved in run.flaskT), or uncork a corked one where it left off.
 * Returns 'open' | 'cork' | 'resume' | null.
 */
export function useFlask() {
  const k = selFlask();
  if (!k || G.state !== 'play') return null;
  const T = run.flaskT || (run.flaskT = {}), pu = run.pu || (run.pu = {});
  if (run.flaskOn === k && pu[k] > 0) { T[k] = pu[k]; pu[k] = 0; run.flaskOn = null; return 'cork'; }
  if (T[k] > 0) { grantPowerup(k); pu[k] = T[k]; T[k] = 0; run.flaskOn = k; return 'resume'; }
  if (!(run.flasks[k] > 0)) return null;
  run.flasks[k]--;
  grantPowerup(k);
  run.flaskOn = k;
  selFlask();
  return 'open';
}
