// Secret zones. Some levels (`secretTo` in data/levels.js) hide a drain in a
// hidden courtyard or lair, behind a cracked wall. Drop in and you leave the
// level (skipping its boss) for a bonus zone, then come out at the next level:
//   The Cheese Vault  timed: chests, caches and vials everywhere; the exit is open
//   The Rat Run       timed: gold strewn down every street, and thieves after it
//   The Bone Garden   a ring of Warrens from every family; smash them all to get out
import * as THREE from 'three';
import { rand, fmt } from '../core/util.js';
import { G, P, run } from '../core/state.js';
import { world } from '../render/renderer.js';
import { flameTex } from '../render/textures.js';
import { fx, puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, toW, floorY, DRY, nearFree } from '../world/grid.js';
import { curD } from '../data/world.js';
import { addChest, addCache } from '../world/build.js';
import { scrapDrop } from '../combat/combat.js';
import { dropVial } from './vials.js';
import { banner } from '../ui/hud.js';
import { TUNE } from '../tuning.js';

/** The hidden drain: a dark hole ringed in violet, with a faint swirl. */
export function addSecretDrain(x, z, kind) {
  const g = new THREE.Group(), y = floorY(x, z);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.2, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050308 }));
  hole.position.y = 0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 6, 22).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb070ff }));
  ring.position.y = 0.08;
  const swirl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xb070ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  swirl.scale.setScalar(2.4);
  swirl.position.y = 0.7;
  g.add(hole, ring, swirl);
  g.position.set(x, y, z);
  world.add(g);
  G.secretExit = { x, z, y, kind, g, ring, swirl };
}

/** Pick the drain's spot: a hidden courtyard (not the lair) if there is one, else the lair. */
export function placeSecretDrain(hidden, kind) {
  const h = hidden.find(h => !h.lair) || hidden[0];
  if (!h) return false;
  const cx = toW(h.x + (h.w - 1) / 2), cz = toW(h.y + (h.h - 1) / 2);
  addSecretDrain(cx - 2, cz - 1.5, kind);
  return true;
}

/** Loot and timers for the secret zones (called at the end of world setup). */
export function setupSecret(info) {
  const D = curD(), S = TUNE.secrets;
  run.secretOpen = false;
  if (!D.secret) return;
  run.scabSeen = true; // Scab doesn't follow you down here
  run.secretsSeen = (run.secretsSeen || 0) + 1;
  const rooms = (info.byDist || []).slice(), at = i => { const r = rooms[i % Math.max(1, rooms.length)]; if (!r) return [P.x + rand(-8, 8), P.z + rand(-8, 8)]; const x = toW(r.cx), z = toW(r.cy); return nearFree(x, z, 0.8, 8) || [x, z]; }; // off any prop at the room centre (P24-4: buried chests)
  if (D.secret === 'vault') {
    run.secretT = S.vaultTime;
    for (let i = 0; i < S.vaultChests; i++) { const [x, z] = at(i); addChest(x, 0, z, true); }
    for (let i = 0; i < S.vaultCaches; i++) { const [x, z] = at(i + 3); addCache(x + 1.5, 0, z + 1); }
    for (let i = 0; i < S.vaultVials; i++) { const [x, z] = at(i + 5); dropVial(x - 1.5, 0, z); }
  } else if (D.secret === 'run') {
    run.secretT = S.runTime;
    const open = [];
    for (let k = 0; k < M.W * M.H; k++) if (DRY(M.grid[k]) && !M.inside[k]) open.push(k);
    for (let i = 0; i < S.runGold && open.length; i++) {
      const k = open[(Math.random() * open.length) | 0], x = toW(k % M.W), z = toW((k / M.W) | 0);
      for (let j = 0; j < 3; j++) scrapDrop(x, floorY(x, z), z);
    }
    for (let i = 0; i < S.runCaches; i++) { const [x, z] = at(i * 2); addCache(x, 0, z); }
    run.robT = 4; // thieves arrive almost at once
  } else if (D.secret === 'treasure') {
    // A short timed bonus room: gold everywhere, no enemies, no thieves. Grab and go.
    const T = TUNE.treasure;
    run.secretT = T.time;
    run.spawnT = run.surgeT = run.lurkT = 1e9;
    const open = [];
    for (let k = 0; k < M.W * M.H; k++) if (DRY(M.grid[k]) && !M.inside[k] && floorY(toW(k % M.W), toW((k / M.W) | 0)) < 0.5 && Math.hypot(toW(k % M.W) - P.x, toW((k / M.W) | 0) - P.z) < T.radius) open.push(k);
    for (let i = 0; i < T.piles && open.length; i++) {
      const k = open.splice((Math.random() * open.length) | 0, 1)[0], x = toW(k % M.W), z = toW((k / M.W) | 0);
      for (let j = 0; j < T.perPile; j++) scrapDrop(x, floorY(x, z), z);
    }
    for (let i = 0; i < T.chests; i++) { const [x, z] = at(i); addChest(x, 0, z, true); }
  } else run.secretT = 0; // the Bone Garden has no clock: the Warrens are the clock
}

/** Each step: open the way out once paths exist, count down, and leave when time is up. */
export function tickSecret(dt, openGate, exitSecret) {
  const D = curD();
  if (!D.secret) return;
  run.evT = Math.max(run.evT || 0, 999); // no street events in a secret zone
  if (!run.secretOpen && M.spawnTiles && M.spawnTiles.length && (D.secret !== 'garden' || run.bossDone)) {
    run.secretOpen = true;
    if (D.secret !== 'garden') openGate(); // the garden's way out opens from onBossDeath, like a regular level
    if (D.secret === 'garden') {
      for (let i = 0; i < TUNE.secrets.gardenChests; i++) addChest(P.x + Math.sin(i * 2.1) * 3, floorY(P.x, P.z), P.z + Math.cos(i * 2.1) * 3, true);
      banner('The garden is quiet', 'Take the hoard · the Brood Mother\'s key opens the way out');
      sfx('level');
    }
  }
  if (run.secretT > 0) {
    run.secretT -= dt;
    if (run.secretT <= 0) { banner('Time', 'The way closes behind you'); exitSecret(); }
  }
}

/** HUD objective line in a secret zone (null elsewhere). */
export function secretText() {
  const D = curD();
  if (!D.secret) return null;
  if (D.secret === 'garden') return run.nests > 0 ? `Secret · smash the Warrens · ${run.nests} left · then the Brood Mother wakes` : run.bossDone ? 'Secret · the way out is open' : 'Secret · kill the Brood Mother · she has the key';
  if (D.secret === 'treasure') return `Treasure room · grab the gold · ${fmt(Math.max(0, run.secretT || 0))}`;
  return `Secret · grab what you can · ${fmt(Math.max(0, run.secretT || 0))} · the exit is already open`;
}

/** The drain itself: step in to leave for the secret zone. */
export function tickSecretDrain(dt, enterSecret) {
  const s = G.secretExit;
  if (!s) return;
  s.ring.rotation.y += dt * 1.5;
  s.swirl.material.opacity = 0.45 + 0.25 * Math.sin(G.time * 3);
  // Every hidden drain is a level exit, so it stays sealed (dim) until this level's boss is down (Taylor, 2026-10-13:
  // no exit opens before the boss falls). It used to be a boss-skipping shortcut for all but treasure drains.
  const sealed = !run.lvlBoss;
  if (sealed) s.swirl.material.opacity = 0.12;
  if (!sealed && Math.hypot(P.x - s.x, P.z - s.z) < 1.3 && Math.abs(P.y - s.y) < 1) {
    puff(s.x, s.y + 0.4, s.z, 0xb070ff, 20, 3);
    fx('ring', s.x, s.y, s.z, 3, 0xb070ff, 0.5);
    dnum(P.x, P.y + 1.8, P.z, 'A hidden way down', 'info');
    const kind = s.kind;
    G.secretExit = null;
    enterSecret(kind);
  }
}
