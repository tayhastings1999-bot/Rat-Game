// Handing out loot: items (with smart pity towards completing a mutation),
// mutation fusion, cursed items, chests and corrupted cores.
import { pick } from '../core/util.js';
import { P, run, st } from '../core/state.js';
import { ITEMS, MUTATIONS, CURSED } from '../data/items.js';
import { boom, fx } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { addThreat } from '../combat/combat.js';
import { banner, renderSlots } from '../ui/hud.js';

/** Draw an item you don't own. If you hold half a recipe, its partner is favoured. */
export function drawItem() {
  const owned = new Set(run.items);
  const partners = MUTATIONS.filter(m => !run.muts.includes(m.id) && owned.has(m.a) !== owned.has(m.b)).map(m => (owned.has(m.a) ? m.b : m.a)).filter(id => !owned.has(id));
  if (partners.length && Math.random() < 0.35) return pick(partners);
  const pool = Object.keys(ITEMS).filter(id => id !== 'cheese' && !owned.has(id));
  return pool.length ? pick(pool) : 'cheese';
}

export function giveItem(id, quiet = false) {
  const I = ITEMS[id];
  run.items.push(id);
  I.ap();
  if (!quiet) banner(I.name, I.flav + (I.ing ? ' · mutation ingredient' : ''));
  checkMutations();
  renderSlots();
}

export function checkMutations() {
  const owned = new Set(run.items);
  for (const m of MUTATIONS) {
    if (run.muts.includes(m.id) || !owned.has(m.a) || !owned.has(m.b)) continue;
    run.muts.push(m.id);
    st.mut[m.id] = true;
    if (m.id === 'razorwire') st.thorns += 30;
    if (m.id === 'overclock') st.specCd *= 0.65;
    setTimeout(() => banner('Mutation · ' + m.name, m.desc), 900);
    sfx('mutation');
    boom(P.x, P.y + 0.8, P.z, 4, parseInt(m.col.slice(1), 16));
    fx('ring', P.x, P.y, P.z, 5, parseInt(m.col.slice(1), 16), 0.6);
    addThreat(0.8);
  }
}

export function giveCursed(id) {
  const pool = Object.keys(CURSED).filter(k => !run.cursed.includes(k));
  if (!id) id = pool.length ? pick(pool) : null;
  if (!id) { giveItem(drawItem()); return; }
  const C = CURSED[id];
  run.cursed.push(id);
  C.ap();
  banner('Cursed · ' + C.name, C.up + ' — but ' + C.dn.toLowerCase());
  sfx('curse');
  fx('ring', P.x, P.y, P.z, 4, 0xff2a2a, 0.7);
  addThreat(1.2);
  renderSlots();
}

export function giveChest(c) {
  if (c.cursed) { giveCursed(); return; }
  giveItem(drawItem());
  if (c.premium) { setTimeout(() => giveItem(drawItem()), 1200); run.scrap += 10 * st.salvage; }
  addThreat(c.premium ? 0.5 : 0.3);
}

/** Corrupted cores dropped by elites: salvage and a free item. */
export function collectCore() {
  run.scrap += 10 * st.salvage;
  giveItem(drawItem());
  addThreat(0.3);
}
