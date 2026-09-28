// Fungal foraging: eat mushrooms and molds for short buffs.
import { G, P, W, run, st } from '../core/state.js';
import { world } from '../render/renderer.js';
import { puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { aoe } from '../combat/combat.js';
import { FUNGI, FUNGUS_T } from '../data/fungi.js';
import { banner } from '../ui/hud.js';

export const buffOn = k => !!(run.buffs && run.buffs[k] > 0);

let sporeT = 0;
export function tickForage(dt) {
  const b = run.buffs || (run.buffs = {});
  for (const k in b) if (b[k] > 0) b[k] -= dt;
  for (const f of W.fungi) {
    if (f.taken) continue;
    f.g.rotation.y += dt * 0.3;
    if (Math.hypot(P.x - f.x, P.z - f.z) < 1 && Math.abs(P.y - f.y) < 1.2) eat(f);
  }
  if (buffOn('bloodmold')) run.hp = Math.min(st.maxHp, run.hp + 5 * dt);
  if (buffOn('sporecap') && (sporeT -= dt) <= 0) {
    sporeT = 0.8;
    puff(P.x, P.y + 0.4, P.z, FUNGI.sporecap.col, 8, 3);
    aoe(P.x, P.y, P.z, 3.6, 9, 0, 'dot');
  }
}

function eat(f) {
  const F = FUNGI[f.kind];
  f.taken = true;
  world.remove(f.g);
  run.buffs[f.kind] = FUNGUS_T;
  run.forage = (run.forage || 0) + 1;
  sfx('pickup');
  puff(f.x, f.y + 0.3, f.z, F.col, 10, 2.2);
  dnum(P.x, P.y + 1.6, P.z, F.name, 'info');
  if (G.state === 'play' && run.forage === 1) banner(F.name, F.desc + ' · 10s');
}

/** Active buffs for the HUD: [{ name, col, t }]. */
export function activeBuffs() {
  const o = [];
  for (const k in run.buffs || {}) if (run.buffs[k] > 0) o.push({ k, name: FUNGI[k].name, col: FUNGI[k].col, t: run.buffs[k] });
  return o;
}
