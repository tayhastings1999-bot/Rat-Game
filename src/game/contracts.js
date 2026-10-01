// Contracts: three small jobs per run that pay Dominance (and some salvage on
// the spot). They push you into the systems that are easy to ignore: traps,
// crawlspaces, shadows, scent, perfect dodges, champions and bounties.
import { pick } from '../core/util.js';
import { G, P, run, st } from '../core/state.js';
import { fx, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { banner } from '../ui/hud.js';

export const CONTRACTS = {
  perfect: { name: 'Untouchable', desc: 'Land 5 perfect dodges (roll through an attack just before it hits)', n: 5, dom: 6 },
  traps: { name: 'Engineer', desc: 'Kill 8 enemies with traps or falling debris', n: 8, dom: 8 },
  duct: { name: 'In the Walls', desc: 'Crawl into the Squeeze Network 3 times', n: 3, dom: 5 },
  rival: { name: 'Turf War', desc: 'Clear 2 rival nests inside the walls', n: 2, dom: 7 },
  forage: { name: 'Forager', desc: 'Eat 4 mushrooms or molds', n: 4, dom: 4 },
  bins: { name: 'Dumpster Diver', desc: 'Rummage 5 dumpsters, bins or junk heaps', n: 5, dom: 4 },
  shadow: { name: 'Unseen', desc: 'Kill 15 enemies while hidden in shadow', n: 15, dom: 6 },
  shriek: { name: 'Pack Call', desc: 'Fill the combo meter and shriek twice', n: 2, dom: 5 },
  champ: { name: 'Breakthrough', desc: 'Defeat a Champion', n: 1, dom: 6 },
  bounty: { name: 'Bounty Hunter', desc: 'Kill a Wanted rat before it escapes', n: 1, dom: 6 },
  flawless: { name: 'Flawless', desc: 'Kill a boss without being hit during its fight', n: 1, dom: 12 },
  elites: { name: 'Elite Hunter', desc: 'Kill 6 elites', n: 6, dom: 5 },
};

/** Deal three contracts for a new run. */
export function dealContracts() {
  if (G.mode === 'trial') { run.contracts = []; return; }
  const pool = Object.keys(CONTRACTS), out = [];
  while (out.length < 3) { const id = pick(pool); if (!out.includes(id)) out.push(id); }
  run.contracts = out.map(id => ({ id, p: 0, done: false }));
  run.contractDom = 0;
}

/** Progress a contract (no-op if it isn't one of this run's). */
export function contract(id, n = 1) {
  for (const c of run.contracts || []) {
    if (c.id !== id || c.done) continue;
    const C = CONTRACTS[id];
    c.p = Math.min(C.n, c.p + n);
    if (c.p < C.n) continue;
    c.done = true;
    run.contractDom = (run.contractDom || 0) + C.dom;
    run.scrap += 15 * st.salvage;
    banner('Contract complete · ' + C.name, `+${C.dom} Dominance · +${Math.round(15 * st.salvage)} salvage`);
    sfx('key');
    fx('ring', P.x, P.y, P.z, 4, 0xc080ff, 0.6);
    dnum(P.x, P.y + 1.8, P.z, C.name, 'info');
  }
}

export function contractsHTML() {
  return (run.contracts || []).map(c => {
    const C = CONTRACTS[c.id];
    return `<div class="${c.done ? 'done' : ''}" title="${C.desc}">${c.done ? '✓' : '◇'} ${C.name} <b>${c.p}/${C.n}</b></div>`;
  }).join('');
}
