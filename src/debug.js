// Hooks for automated smoke tests and manual debugging (window.__scurry).
import { startRun, menu, enterSewer, exitRoad, exitLadder } from './game/flow.js';
import { spawnBoss } from './entities/bosses.js';
import { spawnEnemy, pickType, addPred, mobState, moveBody, wait } from './entities/mobs.js';
import { angD } from './core/util.js';
import { scentInfo } from './game/scent.js';
import { trapCount, springTrap } from './game/traps.js';
import { ductInfo } from './world/ducts.js';
import { need } from './combat/combat.js';
import { giveItem, giveCursed, collectCore } from './game/loot.js';
import { openLevelUp, renderNest, die, pause } from './ui/screens.js';
import { dropKey, gainXP, kill, hit, hurtP } from './combat/combat.js';
import { contract } from './game/contracts.js';
import { setupObjective, objDone, openCage } from './game/objectives.js';
import { applyRule } from './game/rules.js';
import { M, T, tAt, topAt, toW, DRY, N4 } from './world/grid.js';
import { audioReady, music, musicLevel } from './audio/audio.js';
import { renderer, scene, cutPlane } from './render/renderer.js';
import { chewTarget, useTarget, grabTarget, dropCarry } from './entities/player.js';
import { comboGain, shriek } from './game/swarm.js';
import { giveJunk, rummage } from './game/junk.js';
import { lightAt, spawnOwl } from './game/light.js';

/** Animation gallery: each demo creature walks a small loop and attacks every couple of seconds. */
function demoAI(e, dt) {
  e.dt0 = (e.dt0 ?? Math.random() * 3) + dt;
  if (mobState(e, dt, Math.sin(e.ang), Math.cos(e.ang))) return;
  const a = e.dt0 * 0.9 + e.ph, tx = e.ax + Math.sin(a) * 1.6, tz = e.az + Math.cos(a) * 1.6;
  if (e.fly) { e.x += (tx - e.x) * Math.min(1, dt * 3); e.z += (tz - e.z) * Math.min(1, dt * 3); e.ang = a + Math.PI / 2; return; }
  const dx = tx - e.x, dz = tz - e.z, l = Math.hypot(dx, dz) || 1, sp = e.spd * (Math.sin(e.dt0 * 0.7) > -0.3 ? 1 : 0);
  moveBody(e, dt, dx / l * sp, dz / l * sp);
  if (sp) e.ang += angD(Math.atan2(dx, dz), e.ang) * Math.min(1, dt * 8);
  if (e.dt0 % 3 < dt) wait(e, 0.5, e => { e.lunge = 0.2; }, 0, ['melee', 'shot', 'area'][(Math.random() * 3) | 0]);
}

export function debugApi(state) {
  return {
    ...state, M, demoAI,
    startRun, menu, enterSewer, exitRoad, exitLadder, spawnBoss, spawnEnemy, pickType, giveItem, giveCursed, collectCore,
    hit, openLevelUp, renderNest, die, pause, dropKey, gainXP, chewTarget, useTarget, grabTarget, audioReady, music, musicLevel, renderer, scene, comboGain, shriek, dropCarry, kill, giveJunk, rummage, lightAt, spawnOwl, addPred, scentInfo, trapCount, springTrap, ductInfo,
    /** A tall climbable wall face next to open ground: stand point, outward normal, top. */
    wallSpot(minTop = 4, maxTop = 99) {
      for (let k = 0; k < M.W * M.H; k++) {
        if (!DRY(M.grid[k])) continue;
        const gx = k % M.W, gz = (k / M.W) | 0;
        if (gx < 4 || gz < 4 || gx > M.W - 5 || gz > M.H - 5) continue; // the map border caps climbs
        for (const [dx, dz] of N4) {
          if (tAt(gx + dx, gz + dz) !== 0 || topAt(gx + dx, gz + dz) < minTop || topAt(gx + dx, gz + dz) > maxTop) continue;
          if (!DRY(tAt(gx - dx, gz - dz))) continue;
          const x = toW(gx) - dx * T * 0.1, z = toW(gz) - dz * T * 0.1;
          // Clear run-up: no props, cars or boxes between the stand point and the wall.
          const blocked = s => state.W.plats.some(p => !p.thin && Math.abs(p.x - (x + dx * s)) < p.w / 2 + 0.9 && Math.abs(p.z - (z + dz * s)) < p.d / 2 + 0.9);
          if ([-3, -2, -1, 0, 1, 2, 2.4].some(blocked) || !DRY(tAt(gx - dx * 2, gz - dz * 2)) || [1, -1].some(s => tAt(gx + dz * s, gz + dx * s) !== M.grid[k] && !DRY(tAt(gx + dz * s, gz + dx * s)))) continue;
          return { x, z, nx: -dx, nz: -dz, top: topAt(gx + dx, gz + dz) };
        }
      }
      return null;
    },
    cutY: () => cutPlane.constant,
    hurtP, contract, objDone, openCage,
    forceObjective(k) { setupObjective(state.G.objInfo, k); },
    applyRule,
    /** Fire a district event on the next tick. */
    forceEvent(k) { state.run.forceEv = k; state.run.evT = 0; state.run.events.length = 0; },
    need,
    /** Queue one ordinary level-up screen (tests that need a pick without touching XP). */
    pendLevel() { state.run.level++; state.run.pendingLv++; openLevelUp(); },
    god(on = true) { state.st.taken = on ? 0 : 1; },
    hurtBoss(f = 0.35) { const b = state.G.boss; if (b) b.hp -= b.maxHp * f; },
    /** Real hits (through poise and exposure), totalling a share of the boss's max HP. */
    hitBoss(f = 0.07) { const b = state.G.boss; if (b) for (let i = 0; i < 5; i++) hit(b, b.maxHp * f / 5, 0, 0, 'primary', true); },
    killBoss() { const b = state.G.boss; if (b) kill(b); },
  };
}
