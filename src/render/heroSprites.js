// Hero sprites (RENDERER_MIGRATION_PLAN PR 9, wiring only). When TUNE.sprite.mode is 'mixed' or 'sprite'
// and the "heroes" atlas has frames for a class, that hero is drawn as a billboard sprite from one
// SpriteBatch and its procedural mesh is hidden. Anything missing (mode 'mesh', no atlas file, no frames
// for that class or action) leaves the mesh path exactly as it was.
import * as THREE from 'three';
import { TUNE } from '../tuning.js';
import { loadAtlas, getAtlas, has, dirOf, frameKey, applyMsProfile } from './atlas.js';
import { SpriteBatch, frameAt } from './sprites.js';
import { newJuiceState, stepJuice, cycleSec } from './heroJuice.js';

const GROUP = 'heroes', PREFIX = 'hero'; // atlas_heroes.json, frames hero_<id>_<action>_<dir>_<nn>
let batch = null, slot = 0;
const _col = new THREE.Color();
const juiceById = new Map(); // per-rat visual state; not sim state, no RNG

export const spritesOn = () => TUNE.sprite.mode === 'mixed' || TUNE.sprite.mode === 'sprite';

/** Boot-time preload. Resolves true when the atlas loaded; a missing file just means mesh fallback. */
export async function preloadHeroes(scene) {
  if (!spritesOn()) return false;
  const at = await loadAtlas(GROUP);
  if (!at) return false;
  applyMsProfile(at, TUNE.sprite.walkProfile, TUNE.sprite.walkMs);
  batch = new SpriteBatch(at, { cap: TUNE.sprite.heroCap, name: 'heroSprites' });
  // Art Director: painted heroes at 64 px/unit (88 px Sewer Rat → ~1.4 units).
  batch.material.uniforms.uPpu.value = TUNE.sprite.heroPpu;
  scene.add(batch.mesh);
  return true;
}

/** True when this class should draw as a sprite right now. */
export const heroSprite = cls => !!batch && spritesOn() && has(`${cls}_idle`, GROUP);

/** Start of a frame: forget last frame's instances. */
export function beginHeroes() { slot = 0; if (batch) batch.clear(); }

/**
 * Write one hero. s = heroAnimState() from player.js; screenAngle = facing in screen space (0 = right, CCW).
 * juiceCtx (optional): { dt, speed, id, right: {x,z} } — visual walk juice, no hitbox/speed writes.
 */
export function drawHero(cls, s, screenAngle, t, x, y, z, playerCol, flash = 0, sx = 1, sy = 1, juiceCtx = null) {
  const at = getAtlas(GROUP);
  if (!at || !batch) return false;
  // Moving heroes request 'walk' (heroAnimState); 'run' maps to walk until a distinct run set exists.
  let want = s.action === 'run' && at.actions[`${cls}_walk`] ? 'walk' : s.action;
  const walkAct = at.actions[`${cls}_walk`];
  let pose = null;
  if (juiceCtx && TUNE.sprite.juice && walkAct) {
    const id = juiceCtx.id ?? 0;
    if (!juiceById.has(id)) juiceById.set(id, newJuiceState());
    pose = stepJuice(juiceById.get(id), {
      dt: juiceCtx.dt || 0,
      speed: juiceCtx.speed || 0,
      cls, screenAngle, action: s.action,
      cycle: cycleSec(walkAct),
      juice: TUNE.sprite.juice,
    });
    // Hysteresis wins over the raw 0.15 cutoff in heroAnimState for walk/idle only.
    if (!s.action || s.action === 'walk' || s.action === 'idle') {
      want = pose.walking || pose.mode === 'start' || pose.mode === 'stop' && pose.mode !== 'idle' ? 'walk' : 'idle';
      if (pose.mode === 'idle') want = 'idle';
      if (pose.mode === 'walk' || pose.mode === 'start') want = walkAct ? 'walk' : 'idle';
    }
  }
  const action = at.actions[`${cls}_${want}`] ? want : 'idle', act = at.actions[`${cls}_${action}`];
  if (!act) return false;
  let { dir, flip } = dirOf(screenAngle);
  // South-only art: keep the left/right flip so a westward walk isn't a frozen front view.
  if (act.dirs && !act.dirs.includes(dir)) dir = act.dirs[0];
  // Juiced walks pick the frame from stride phase so atlas walkProfile / walkMs holds cannot override cadence.
  let n;
  if (pose && action === 'walk') {
    const nFr = act.frames || 1;
    const ph = ((pose.phase % 1) + 1) % 1;
    n = Math.min(nFr - 1, Math.floor(ph * nFr));
  } else {
    n = frameAt(act, t, act.loop !== false && action !== 'dead');
  }
  const f = at.frames.get(frameKey(PREFIX, cls, action, dir, n)) || at.frames.get(frameKey(PREFIX, cls, action, dir, 0));
  if (!f) return false;
  let px = x, py = y, pz = z, psx = sx, psy = sy, lean = 0;
  if (pose) {
    py += pose.bob;
    if (juiceCtx.right) { px += pose.sway * juiceCtx.right.x; pz += pose.sway * juiceCtx.right.z; }
    psx *= pose.sx; psy *= pose.sy;
    lean = pose.lean;
  }
  return batch.set(slot++, px, py, pz, f, !!flip, playerCol != null ? _col.set(playerCol) : null, flash, psx, psy, null, lean);
}

/** End of a frame: upload instances and face the camera. */
export function endHeroes(camera) { if (batch) batch.update(camera); }

/** Tests and level resets: drop per-rat juice clocks. */
export function resetHeroJuice() { juiceById.clear(); }
