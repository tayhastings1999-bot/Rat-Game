// Hero sprites (RENDERER_MIGRATION_PLAN PR 9, wiring only). When TUNE.sprite.mode is 'mixed' or 'sprite'
// and the "heroes" atlas has frames for a class, that hero is drawn as a billboard sprite from one
// SpriteBatch and its procedural mesh is hidden. Anything missing (mode 'mesh', no atlas file, no frames
// for that class or action) leaves the mesh path exactly as it was.
import * as THREE from 'three';
import { TUNE } from '../tuning.js';
import { loadAtlas, getAtlas, has, dirOf, frameKey } from './atlas.js';
import { SpriteBatch, frameAt } from './sprites.js';

const GROUP = 'heroes', PREFIX = 'hero'; // atlas_heroes.json, frames hero_<id>_<action>_<dir>_<nn>
let batch = null, slot = 0;
const _col = new THREE.Color();

export const spritesOn = () => TUNE.sprite.mode === 'mixed' || TUNE.sprite.mode === 'sprite';

/** Boot-time preload. Resolves true when the atlas loaded; a missing file just means mesh fallback. */
export async function preloadHeroes(scene) {
  if (!spritesOn()) return false;
  const at = await loadAtlas(GROUP);
  if (!at) return false;
  batch = new SpriteBatch(at, { cap: TUNE.sprite.heroCap, name: 'heroSprites' });
  // heroes_v2 frames are painted at 128×160; heroPpu sets their on-screen size (80 → 1.6 × 2 world units).
  batch.material.uniforms.uPpu.value = TUNE.sprite.heroPpu;
  scene.add(batch.mesh);
  return true;
}

/** True when this class should draw as a sprite right now. */
export const heroSprite = cls => !!batch && spritesOn() && has(`${cls}_idle`, GROUP);

/** Start of a frame: forget last frame's instances. */
export function beginHeroes() { slot = 0; if (batch) batch.clear(); }

/** Write one hero. s = heroAnimState() from player.js; screenAngle = facing in screen space (0 = right, CCW). */
export function drawHero(cls, s, screenAngle, t, x, y, z, playerCol, flash = 0, sx = 1, sy = 1) {
  const at = getAtlas(GROUP);
  if (!at || !batch) return false;
  const action = at.actions[`${cls}_${s.action}`] ? s.action : 'idle', act = at.actions[`${cls}_${action}`];
  if (!act) return false;
  let { dir, flip } = dirOf(screenAngle);
  if (act.dirs && !act.dirs.includes(dir)) { dir = act.dirs[0]; flip = 0; } // idle-only package: 's' only
  const n = frameAt(act, t, act.loop !== false && action !== 'dead');
  const f = at.frames.get(frameKey(PREFIX, cls, action, dir, n)) || at.frames.get(frameKey(PREFIX, cls, action, dir, 0));
  if (!f) return false;
  return batch.set(slot++, x, y, z, f, !!flip, playerCol != null ? _col.set(playerCol) : null, flash, sx, sy);
}

/** End of a frame: upload instances and face the camera. */
export function endHeroes(camera) { if (batch) batch.update(camera); }
