// Rule-breaking upgrades. Rarer than tomes, and each one changes how you
// play rather than adding a few percent: rolls that fire your weapons, kills
// that chain-explode, a shadow paw that hits a second target, and so on.
// Offered now and then on level-ups, and always on Breakthroughs.
import { P, W, run, st } from '../core/state.js';
import { boom, spark } from '../fx/fx.js';
import { near, hit } from '../combat/combat.js';
import { banner } from '../ui/hud.js';

export const RULES = {
  rollfire: { name: 'Ricochet Roll', desc: 'Every roll instantly fires all of your weapons.' },
  rollblade: { name: 'Razor Roll', desc: 'Rolls cost no stamina and slice through everything you roll past.' },
  chain: { name: 'Chain Reaction', desc: "Kills burst for a quarter of the victim's max HP. Bursts can set off more bursts." },
  shadow: { name: 'Shadow Paw', desc: 'A shadow copy of your primary attack strikes a second target for 60% damage.' },
  echo: { name: 'Echo', desc: 'Your special casts twice.' },
  glutton: { name: 'Glutton', desc: 'Every food pickup and cheese cache permanently adds 4% damage.' },
  frenzy: { name: 'Swarm Frenzy', desc: 'While your combo meter is over half full, all your attacks are 40% faster.' },
  jackpot: { name: 'Jackpot', desc: 'Chests give an extra item.' },
};
export const has = id => !!(run.rules && run.rules.includes(id));
export const rulesLeft = () => Object.keys(RULES).filter(k => !has(k));

export function applyRule(id) {
  (run.rules || (run.rules = [])).push(id);
  banner('Rule broken · ' + RULES[id].name, RULES[id].desc);
}

// ---------- hooks ----------
/** Roll started: Ricochet fires everything; Razor refunds the stamina. */
export function onRoll() {
  if (has('rollfire')) for (const w of run.weapons) w.t = 0;
  if (has('rollblade')) run.sta = Math.min(st.staMax, run.sta + 15);
}
let bladeT = 0;
const chainQ = [];
export function tickRules(dt) {
  if (has('rollblade') && P.roll > 0 && (bladeT -= dt) <= 0) {
    bladeT = 0.07;
    for (const e of near(P.x, P.y, P.z, 1.6)) hit(e, 18 + run.level, Math.atan2(e.x - P.x, e.z - P.z), 6, 'rule', true);
  }
  // Chain bursts, a few per frame so a big chain ripples instead of freezing the game.
  for (let i = 0; i < 6 && chainQ.length; i++) {
    const [x, y, z, d] = chainQ.shift();
    boom(x, y + 0.5, z, 2.6, 0xff8a3a);
    for (const e of near(x, y, z, 2.4)) hit(e, d, Math.atan2(e.x - x, e.z - z), 5, 'rule', true);
  }
}
export function onKill(e) {
  if (has('chain') && !e.boss && chainQ.length < 40) chainQ.push([e.x, e.y, e.z, Math.min(160, e.maxHp * 0.25 + 6)]);
}
export const attackRate = () => (has('frenzy') && (run.combo || 0) > 50) || (has('frenzy') && run.shriekReady) ? 1 / 1.4 : 1;
export function onFeast() {
  if (!has('glutton')) return;
  st.dmg += 0.04;
  spark(P.x, P.y + 1, P.z, 1.2, 0xffd040);
}
/** Shadow Paw: after the primary fires, strike the next-nearest target too. */
export function shadowPaw(PR, t) {
  if (!has('shadow') || !t) return;
  let b = null, bd = (PR.range * (PR.range > 6 ? st.range : 1)) ** 2;
  for (const e of W.enemies) {
    if (e === t || e.dead || e.hidden || e.type === 'nest') continue;
    const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    if (d < bd) { bd = d; b = e; }
  }
  if (!b) return;
  const dx = b.x - P.x, dz = b.z - P.z, l = Math.hypot(dx, dz) || 1, keep = st.dmg;
  st.dmg *= 0.6;
  P.noStep = true; // the shadow strikes; you don't lunge after it
  PR.fire(dx / l, dz / l, b);
  P.noStep = false;
  st.dmg = keep;
}
export const jackpot = () => has('jackpot');
export const echo = () => has('echo');
