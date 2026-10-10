// Thieves: gold-tinted rats that sprint at you, snatch something and run.
// They take a Rot Vial if you carry one, otherwise a share of your gold, then
// flee along the streets and vanish if you let them go for long enough. Kill
// one to get it all back with interest. One at a time, every so often.
import { rand } from '../core/util.js';
import { G, P, run } from '../core/state.js';
import { dnum, puff } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, toW, floorY, flowDir } from '../world/grid.js';
import { spawnEnemy, moveBody } from '../entities/mobs.js';
import { scrapDrop } from '../combat/combat.js';
import { thiefAI } from './objectives.js';
import { dropVial } from './vials.js';
import { TUNE } from '../tuning.js';

/** Spawner: one thief at a time, never during a boss fight. */
export function tickThieves(dt) {
  const T = TUNE.thief;
  if ((run.tier || 0) < T.minZone || G.boss || !M.spawnTiles || !M.spawnTiles.length) return;
  if (run.robber && !run.robber.dead) return;
  run.robber = null;
  run.robT = (run.robT ?? T.first) - dt;
  if (run.robT > 0) return;
  run.robT = T.every * rand(0.8, 1.2);
  const k = M.spawnTiles[(Math.random() * M.spawnTiles.length) | 0];
  const e = spawnEnemy('mawling', toW(k % M.W), toW((k / M.W) | 0), { plain: true, sc: 1.15, hpMul: T.hpMul * (1 + (run.tier || 0) * 0.4), force: true });
  if (!e) return;
  Object.assign(e, { robber: true, mode: 'seek', spd: e.spd * T.speed, bar: true, name: 'Thief', xp: 6, fleeT: 0, loot: null });
  run.robber = e;
  dnum(e.x, e.y + 2, e.z, 'Thief!', 'crit');
  sfx('rattle');
}

/** Per-step AI (from updateEnemies). Seek: run at the rat. Flee: run away, then vanish. */
export function robberAI(e, dt) {
  if (e.mode === 'seek') {
    const [fx, fz] = flowDir(e) || [P.x - e.x, P.z - e.z];
    const l = Math.hypot(fx, fz) || 1, sp = e.spd * (e.slow > 0 ? 0.5 : 1);
    moveBody(e, dt, fx / l * sp, fz / l * sp);
    e.ang = Math.atan2(fx, fz);
    if (Math.hypot(P.x - e.x, P.z - e.z) < 1.1 && Math.abs(P.y - e.y) < 1.5 && G.state === 'play') steal(e);
    return;
  }
  thiefAI(e, dt); // flee along the flow field, away from you
  e.fleeT += dt;
  if (e.fleeT > TUNE.thief.escape) {
    e.dead = true;
    puff(e.x, e.y + 0.5, e.z, 0x6a5a40, 12, 2);
    dnum(P.x, P.y + 1.8, P.z, e.loot ? `The thief got away with ${e.loot.what}` : 'The thief got away', 'info');
    run.robber = null;
  }
}

function steal(e) {
  const T = TUNE.thief;
  if (run.vials > 0) { run.vials--; e.loot = { vial: 1, what: 'a Rot Vial' }; }
  else {
    const g = Math.min(run.scrap, Math.max(T.goldMin, Math.floor(run.scrap * T.goldFrac)));
    if (g <= 0) { e.loot = { what: 'nothing' }; }
    else { run.scrap -= g; e.loot = { gold: g, what: `${g} gold` }; }
  }
  e.mode = 'flee';
  e.fleeT = 0;
  dnum(P.x, P.y + 1.8, P.z, `Stolen: ${e.loot.what}!`, 'crit');
  sfx('rattle');
  run.stolen = (run.stolen || 0) + 1;
}

/** Called from kill(): everything comes back, plus a tip. */
export function robberDown(e) {
  run.robber = null;
  const gy = floorY(e.x, e.z), L = e.loot || {};
  if (L.vial) dropVial(e.x, gy, e.z);
  const n = Math.ceil((L.gold || 0) / 1) + TUNE.thief.bonus;
  for (let i = 0; i < Math.min(60, n); i++) scrapDrop(e.x + rand(-1, 1), gy, e.z + rand(-1, 1));
  if (n > 60) run.scrap += n - 60; // the rest straight into your pocket
  dnum(e.x, gy + 2, e.z, 'Thief caught', 'info');
}
