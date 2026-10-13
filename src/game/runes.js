// Runes (one hidden per listed level, data/runes.js) and legendary class gear dropped by realm bosses.
import * as THREE from 'three';
import { G, P, W, run, meta, saveMeta } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { toW, floorY } from '../world/grid.js';
import { curD } from '../data/world.js';
import { RUNES, GEAR, runeCount, finalOpen, FINAL_LEVEL } from '../data/runes.js';
import { banner } from '../ui/hud.js';

/** Place this level's rune (if it has one this burrow hasn't taken) in the room farthest from the start. */
export function placeRune(info) {
  W.runes = [];
  const D = curD(), R = RUNES.find(r => r.level === D.level);
  if (!R || D.secret || (meta.runes && meta.runes[R.id])) return null;
  const rooms = info.byDist || [], r = rooms[rooms.length - 1];
  if (!r) return null;
  const x = toW(r.cx), z = toW(r.cy), y = floorY(x, z);
  const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: 0x8af0ff }));
  g.position.set(x, y + 1, z);
  world.add(g);
  const o = { id: R.id, name: R.name, x, y, z, g };
  W.runes.push(o);
  return o;
}
/** Spin, bob, and pick up on touch. */
export function tickRunes(dt) {
  for (let i = (W.runes || []).length - 1; i >= 0; i--) {
    const o = W.runes[i];
    o.g.rotation.y += dt * 2.5;
    o.g.position.y = o.y + 1 + Math.sin(G.time * 2.5) * 0.15;
    if (Math.hypot(P.x - o.x, P.z - o.z) > 1.2 || Math.abs(P.y - o.y) > 1.6) continue;
    takeRune(o);
    W.runes.splice(i, 1);
  }
}
export function takeRune(o) {
  bury(o.g);
  (meta.runes || (meta.runes = {}))[o.id] = true;
  saveMeta();
  puff(o.x, o.y + 1, o.z, 0x8af0ff, 24, 3);
  sfx('level');
  const n = runeCount(meta);
  banner(o.name, finalOpen(meta) ? `All ${RUNES.length} runes · the throne in the Rat King's Court will answer` : `Runes ${n}/${RUNES.length}`);
}
/** After a boss falls: the legendary gear it guards for your class (once per burrow). Returns the gear or null. */
export function bossGear(kind) {
  const L = GEAR[run.cls];
  if (!L || L.boss !== kind || (meta.gear && meta.gear[run.cls])) return null;
  (meta.gear || (meta.gear = {}))[run.cls] = true;
  saveMeta();
  dnum(P.x, P.y + 2.2, P.z, 'LEGENDARY: ' + L.name, 'crit');
  return L;
}
/** The final boss rises in the Court after the Rat King falls, once every rune is held. */
export const finalDue = kind => kind === 'ratking' && curD().level === FINAL_LEVEL && finalOpen(meta) && !run.finalDone && !run.finalUp;
