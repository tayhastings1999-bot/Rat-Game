// Hooks for automated smoke tests and manual debugging (window.__scurry).
import { startRun, menu, enterSewer, exitRoad, exitLadder } from './game/flow.js';
import { spawnBoss } from './entities/bosses.js';
import { spawnEnemy } from './entities/mobs.js';
import { giveItem, giveCursed, collectCore } from './game/loot.js';
import { openLevelUp, renderNest, die, pause } from './ui/screens.js';
import { dropKey, gainXP, kill } from './combat/combat.js';
import { M } from './world/grid.js';
import { audioReady, music } from './audio/audio.js';
import { renderer, scene } from './render/renderer.js';
import { chewTarget, useTarget, grabTarget } from './entities/player.js';

export function debugApi(state) {
  return {
    ...state, M,
    startRun, menu, enterSewer, exitRoad, exitLadder, spawnBoss, spawnEnemy, giveItem, giveCursed, collectCore,
    openLevelUp, renderNest, die, pause, dropKey, gainXP, chewTarget, useTarget, grabTarget, audioReady, music, renderer, scene,
    god(on = true) { state.st.taken = on ? 0 : 1; },
    hurtBoss(f = 0.35) { const b = state.G.boss; if (b) b.hp -= b.maxHp * f; },
    killBoss() { const b = state.G.boss; if (b) kill(b); },
  };
}
