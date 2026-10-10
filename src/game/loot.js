// Chests and bins: gold, and sometimes food. (Phase 3 adds locked chests that take keys.)
import { rand } from '../core/util.js';
import { P } from '../core/state.js';
import { scrapDrop, dropFood } from '../combat/combat.js';
import { boom, puff, dnum } from '../fx/fx.js';
import { spawnEnemy } from '../entities/mobs.js';
import { rummageMimic } from '../entities/roles.js';
import { sfx } from '../audio/audio.js';
import { dropVial } from './vials.js';
import { TUNE } from '../tuning.js';

export function giveChest(c) {
  const n = c.premium ? 30 : c.cursed ? 18 : 12;
  for (let i = 0; i < n; i++) scrapDrop(c.x + rand(-0.8, 0.8), c.y, c.z + rand(-0.8, 0.8));
  if (c.premium || Math.random() < 0.4) dropFood(c.x + 1, c.y, c.z, c.premium ? 'cache' : 'wedge');
  if (c.premium || Math.random() < TUNE.vials.chestOdds) dropVial(c.x - 1, c.y, c.z);
  boom(c.x, c.y + 0.8, c.z, 2.4, 0xffd070);
  sfx('key');
}

/** Bins, dumpsters and junk heaps: gold, food, or something with teeth. (Keys join in Phase 3.) */
export function rummage(b) {
  if (rummageMimic(b)) return;
  b.done = true;
  if (b.lid) b.lid.rotation.x = -1.2;
  puff(b.x, b.y + 1, b.z, 0x6a6258, 12, 2.5);
  sfx('chew');
  const r = Math.random();
  if (r < 0.5) { for (let i = 0; i < (b.kind === 'heap' ? 8 : 5); i++) scrapDrop(b.x, b.y + 0.5, b.z); dnum(P.x, P.y + 1.6, P.z, 'Gold', 'info'); return; }
  if (r < 0.75) { dropFood(b.x, b.y + 0.3, b.z, Math.random() < 0.6 ? 'crumb' : 'wedge'); dnum(P.x, P.y + 1.6, P.z, 'Food', 'info'); return; }
  if (r < 0.75 + TUNE.vials.binOdds) { dropVial(b.x, b.y + 0.3, b.z); dnum(P.x, P.y + 1.6, P.z, 'A Rot Vial', 'info'); return; }
  if (r < 0.9) { for (let i = 0; i < 3; i++) spawnEnemy('roach', b.x + rand(-1, 1), b.z + rand(-1, 1), { pack: 1, plain: true }); dnum(P.x, P.y + 1.6, P.z, 'Something lives in there', 'info'); return; }
  dnum(P.x, P.y + 1.6, P.z, 'Just trash', 'info');
}
