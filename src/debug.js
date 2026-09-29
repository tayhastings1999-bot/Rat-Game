// Hooks for automated smoke tests and manual debugging (window.__scurry).
import { startRun, menu, enterSewer, exitRoad, exitLadder } from './game/flow.js';
import { spawnBoss } from './entities/bosses.js';
import { spawnEnemy, pickType, addPred } from './entities/mobs.js';
import { scentInfo } from './game/scent.js';
import { trapCount, springTrap } from './game/traps.js';
import { giveItem, giveCursed, collectCore } from './game/loot.js';
import { openLevelUp, renderNest, die, pause } from './ui/screens.js';
import { dropKey, gainXP, kill } from './combat/combat.js';
import { M, T, tAt, topAt, toW, DRY, N4 } from './world/grid.js';
import { audioReady, music } from './audio/audio.js';
import { renderer, scene } from './render/renderer.js';
import { chewTarget, useTarget, grabTarget, dropCarry } from './entities/player.js';
import { comboGain, shriek } from './game/swarm.js';
import { giveJunk, rummage } from './game/junk.js';
import { lightAt, spawnOwl } from './game/light.js';

export function debugApi(state) {
  return {
    ...state, M,
    startRun, menu, enterSewer, exitRoad, exitLadder, spawnBoss, spawnEnemy, pickType, giveItem, giveCursed, collectCore,
    openLevelUp, renderNest, die, pause, dropKey, gainXP, chewTarget, useTarget, grabTarget, audioReady, music, renderer, scene, comboGain, shriek, dropCarry, kill, giveJunk, rummage, lightAt, spawnOwl, addPred, scentInfo, trapCount, springTrap,
    /** A tall climbable wall face next to open ground: stand point, outward normal, top. */
    wallSpot(minTop = 4, maxTop = 99) {
      for (let k = 0; k < M.W * M.H; k++) {
        if (!DRY(M.grid[k])) continue;
        const gx = k % M.W, gz = (k / M.W) | 0;
        if (gx < 3 || gz < 3 || gx > M.W - 4 || gz > M.H - 4) continue; // the map border caps climbs
        for (const [dx, dz] of N4) {
          if (tAt(gx + dx, gz + dz) !== 0 || topAt(gx + dx, gz + dz) < minTop || topAt(gx + dx, gz + dz) > maxTop) continue;
          if (!DRY(tAt(gx - dx, gz - dz))) continue;
          const x = toW(gx) - dx * T * 0.1, z = toW(gz) - dz * T * 0.1;
          // Clear run-up: no props, cars or boxes between the stand point and the wall.
          const blocked = s => state.W.plats.some(p => Math.abs(p.x - (x - dx * s)) < p.w / 2 + 1.2 && Math.abs(p.z - (z - dz * s)) < p.d / 2 + 1.2);
          if ([-3, -2, -1, 0, 1, 2, 2.4].some(blocked) || !DRY(tAt(gx - dx * 2, gz - dz * 2)) || [1, -1].some(s => tAt(gx + dz * s, gz + dx * s) !== M.grid[k] && !DRY(tAt(gx + dz * s, gz + dx * s)))) continue;
          return { x, z, nx: -dx, nz: -dz, top: topAt(gx + dx, gz + dz) };
        }
      }
      return null;
    },
    god(on = true) { state.st.taken = on ? 0 : 1; },
    hurtBoss(f = 0.35) { const b = state.G.boss; if (b) b.hp -= b.maxHp * f; },
    killBoss() { const b = state.G.boss; if (b) kill(b); },
  };
}
