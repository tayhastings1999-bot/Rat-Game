// Hooks for automated smoke tests and manual debugging (window.__scurry).
import { startRun, checkpoint, realmLevels, menu, enterSewer, exitRoad, exitLadder, setupWorld } from './game/flow.js';
import { spawnBoss } from './entities/bosses.js';
import { spawnEnemy, pickType, addPred, mobState, moveBody, wait } from './entities/mobs.js';
import { angD } from './core/util.js';
import { scentInfo } from './game/scent.js';
import { trapCount, springTrap } from './game/traps.js';
import { ductInfo } from './world/ducts.js';
import { need, addXP } from './game/progress.js';
import { rummage } from './game/loot.js';
import { die, pause, HOWTO, pickSlot, renderMenu } from './ui/screens.js';
import { buy, rank, price, sellPrice, useFlask, cycleFlask, selFlask, refundOldKeys } from './game/shop.js';
import { coop, fakePads, asPlayer } from './game/coop.js';
import { save, loadSlot, readSlot, settings, saveMeta } from './core/state.js';
import { stems, mixFor, stemsOn, updateStems, nextBar, BAR } from './audio/stems.js';
import { callName, callout, foodShot, CALLOUTS } from './game/announcer.js';
import { placeRune, takeRune, bossGear, placeFragment, takeFragment, fragmentSpot } from './game/runes.js';
import { FRAGMENTS, fragCount, greatRune } from './data/runes.js';
import { dropKey, kill, hit, hurtP, zoneScaling, powerScaling } from './combat/combat.js';
import { CLASSES, liveClass } from './data/classes.js';
import { PRIM, SPECIALS } from './combat/arsenal.js';
import { SIGS } from './game/signature.js';
import { setupObjective, objDone, openCage } from './game/objectives.js';
import { M, T, tAt, topAt, toW, DRY, N4, freeSpot } from './world/grid.js';
import { audioReady, music, musicLevel } from './audio/audio.js';
import { renderer, scene, cutPlane, world } from './render/renderer.js';
import { update } from './game/update.js';
import { sync, animate } from './game/sync.js';
import { dropPowerup, grantPowerup, puOn, puList, POWERUPS } from './game/powerups.js';
import { pingFinds } from './game/finds.js';
import { tallyCalc, tallyContinue } from './ui/tally.js';
import { growStats } from './game/stats.js';
import { chewTarget, useTarget, grabTarget, dropCarry, pressE, unlockGate, pipeNear } from './entities/player.js';
import { streakHit, streakMul } from './game/swarm.js';
import { storyApi } from './game/story.js';
import { TUNE, tuneEntries, setTune } from './tuning.js';
import { initDebugPanel } from './ui/debugPanel.js';

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

import { qa } from './qa/bot.js';
import { hud, renderSlots } from './ui/hud.js';
import { dropFood } from './combat/combat.js';
import { staticChecks } from './qa/checks.js';
import { spawnReaper } from './game/reaper.js';
import { throwVial, dropVial, popVialsAt } from './game/vials.js';
import { tickThieves, robberAI } from './game/thieves.js';
import { turboBlast, turboGain, turboAuraOpacity } from './game/turbo.js';
import { breakFoodAt, drainRate } from './game/food.js';
import { tickNest, tierHp } from './game/nests.js';
import { fadeU } from './render/fade.js';
import { FAMILIES, curD, dName, levelSeed } from './data/world.js';
import { CITY_LEVELS, SEWER_LEVELS, SECRET_LEVELS } from './data/levels.js';

export function debugApi(state) {
  initDebugPanel();
  // Browser automation (the test harnesses) skips the exit tally card; a person on ?debug still sees it.
  if (navigator.webdriver) state.G.testNoTally = true;
  return {
    ...state, M, demoAI, qa: { ...qa, staticChecks }, hud, renderSlots, dropFood,
    CLASSES, liveClass, runes: { placeRune, takeRune, bossGear, placeFragment, takeFragment, fragmentSpot, FRAGMENTS, fragCount, greatRune }, announcer: { callName, callout, foodShot, CALLOUTS }, checkpoint, realmLevels, saveMeta, music3: { stems, mixFor, stemsOn, updateStems, nextBar, BAR, settings }, PRIM, SPECIALS, SIGS, startRun, menu, enterSewer, exitRoad, exitLadder, spawnBoss, spawnEnemy, pickType, TUNE, tuneEntries, setTune,
    hit, die, pause, pickSlot, renderMenu, save, loadSlot, readSlot, shop: { buy, rank, price, sellPrice, useFlask, cycleFlask, selFlask, refundOldKeys }, coop, fakePads, asPlayer, dropKey, freeSpot, pressE, unlockGate, pipeNear, dropPowerup, grantPowerup, puOn, puList, POWERUPS, pingFinds, tallyCalc, tallyContinue, growStats, fadeU, FAMILIES, setupWorld, curD, dName, levelSeed, LEVELS: { CITY_LEVELS, SEWER_LEVELS, SECRET_LEVELS }, HOWTO, spawnReaper, throwVial, dropVial, popVialsAt, tickThieves, robberAI, turboBlast, turboGain, turboAuraOpacity, breakFoodAt, drainRate, tickNest, tierHp, addXP, gainXP: addXP, chewTarget, useTarget, grabTarget, audioReady, music, musicLevel, renderer, scene, world, update, sync, animate, story: storyApi, streakHit, streakMul, dropCarry, kill, rummage, addPred, scentInfo, trapCount, springTrap, ductInfo,
    /** A marked drainpipe (the only climbable wall): stand point, outward normal, top. */
    climbSpot(minTop = 0) {
      const c = state.W.climbs.find(c => c.top >= minTop && c.gx > 3 && c.gz > 3 && c.gx < M.W - 4 && c.gz < M.H - 4);
      return c ? { x: c.x, z: c.z, nx: c.nx, nz: c.nz, top: c.top, cache: !!c.cache } : null;
    },
    /** A tall wall face next to open ground: stand point, outward normal, top. */
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
    hurtP, zoneScaling, powerScaling, objDone, openCage,
    forceObjective(k) { setupObjective(state.G.objInfo, k); },
    /** Fire a district event on the next tick. */
    forceEvent(k) { state.run.forceEv = k; state.run.evT = 0; state.run.events.length = 0; },
    need,
    god(on = true) { state.G.god = on; }, // hurtP, the drain and the Reaper check G.god; st.taken (Armor) is left alone
    hurtBoss(f = 0.35) { const b = state.G.boss; if (b) b.hp -= b.maxHp * f; },
    /** Real hits (through poise and exposure), totalling a share of the boss's max HP. */
    hitBoss(f = 0.07) { const b = state.G.boss; if (b) for (let i = 0; i < 5; i++) hit(b, b.maxHp * f / 5, 0, 0, 'primary', true); },
    killBoss() { const b = state.G.boss; if (b) kill(b); },
  };
}
