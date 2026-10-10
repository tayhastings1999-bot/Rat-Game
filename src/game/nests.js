// Nests are where the horde comes from. Each one raises a single enemy
// family (FAMILIES in data/world.js) and comes in three tiers: a Litter Pile,
// a Burrow or a Warren. Bigger nests have more HP, spawn faster, keep more
// children alive and raise the family's tougher member. Damage knocks a nest
// down a tier once its HP falls below the next tier's, so a half-smashed
// Warren behaves like a Burrow. Smashing every nest wakes the zone's boss.
import { rand, rng } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { dnum, puff } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { FAMILIES, NEST_NAMES, curD, isSewer } from '../data/world.js';
import { INTRO, spawnEnemy } from '../entities/mobs.js';
import { banner } from '../ui/hud.js';
import { TUNE } from '../tuning.js';

const N = () => TUNE.nests;
const scale = () => (1 + (run.tier || 0) * 0.5) * (isSewer() ? 1.5 : 1);
/** HP at which a nest is each tier (index 0 = Litter Pile). */
export const tierHp = () => [N().hp1, N().hp2, N().hp3].map(h => h * scale());
export const tierName = t => NEST_NAMES[t - 1] || 'Nest';

/** How many nests this zone gets. */
export const nestCount = () => Math.min(N().countMax, Math.round(N().count + N().countPerZone * (run.tier || 0)));

/** Seeded tier and family for the i-th nest of the zone. */
export function rollNest(i) {
  const z = run.tier || 0, r = rng.next();
  const pw = Math.min(N().warrenMax, N().warrenBase + N().warrenPerZone * z), pb = N().burrowBase + N().burrowPerZone * z;
  const tier = r < pw ? 3 : r < pw + pb ? 2 : 1;
  const fams = curD().fam || ['vermin'];
  // The zone's first family is the most common: it gets every other nest.
  const fam = i % 2 === 0 ? fams[0] : fams[1 + ((i >> 1) % Math.max(1, fams.length - 1))] || fams[0];
  return { tier, fam };
}

/** Fill in a nest enemy's tier fields (called by addNest in build.js). */
export function initNest(e, tier, fam) {
  const H = tierHp();
  Object.assign(e, { tier, fam, hp: H[tier - 1], maxHp: H[tier - 1], name: tierName(tier), xp: N()['xp' + tier], kids: [], spawnT: rand(1, 4) });
  e.mesh.scale.setScalar(0.7 + 0.32 * (tier - 1));
}

/** Damage drops the tier; called every step for live nests (mobs.js). */
export function tickNest(e, dt) {
  const H = tierHp();
  while (e.tier > 1 && e.hp <= H[e.tier - 2]) {
    e.tier--;
    e.name = tierName(e.tier);
    e.xp = N()['xp' + e.tier];
    puff(e.x, 1, e.z, 0x5a4a3a, 18, 3);
    dnum(e.x, 2.6, e.z, `Down to a ${e.name}`, 'crit');
    sfx('boom');
  }
  const want = 0.7 + 0.32 * (e.tier - 1), s = e.mesh.scale.x;
  if (Math.abs(s - want) > 0.005) e.mesh.scale.setScalar(s + (want - s) * Math.min(1, dt * 6));
  e.core.scale.setScalar(1 + Math.sin(G.time * 5 + e.x) * 0.15 + (e.flash > 0 ? 0.4 : 0));
  e.spawnT -= dt;
  if (e.spawnT > 0 || Math.hypot(e.x - P.x, e.z - P.z) > N().range) return;
  e.spawnT = N()['every' + e.tier] / (1 + (run.T || 0) * 0.04) * (run.moon ? 0.6 : 1);
  e.kids = e.kids.filter(k => !k.dead);
  if (e.kids.length >= N()['kids' + e.tier] || W.enemies.length >= TUNE.enemies.cap) return;
  const F = FAMILIES[e.fam] || FAMILIES.vermin;
  const ti = Math.max(0, e.tier - 1 - (Math.random() < N().lowerOdds ? 1 : 0));
  const type = F.types[ti], a = rand(0, Math.PI * 2);
  const k = spawnEnemy(type, e.x + Math.sin(a) * 2, e.z + Math.cos(a) * 2);
  if (!k) return;
  k.nest = e;
  e.kids.push(k);
  introduce(type);
}

/** The first time a type turns up in a run, a banner says what it does. */
function introduce(type) {
  if (!run.seenMobs) run.seenMobs = {};
  if (run.seenMobs[type] || !INTRO[type]) return;
  run.seenMobs[type] = true;
  if ((run.introAt || -99) > run.time - 8) return; // one banner every few seconds at most
  run.introAt = run.time;
  banner('New threat · ' + INTRO[type][0], INTRO[type][1]);
}
