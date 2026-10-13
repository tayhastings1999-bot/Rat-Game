// Runes (one hidden per listed level, data/runes.js) and legendary class gear dropped by realm bosses.
import * as THREE from 'three';
import { G, P, W, run, meta, saveMeta } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { toW, floorY } from '../world/grid.js';
import { curD } from '../data/world.js';
import { RUNES, GEAR, runeCount, finalOpen, FINAL_LEVEL, FRAGMENTS, fragCount, greatRune } from '../data/runes.js';
import { banner } from '../ui/hud.js';
import { coop } from './coop.js';

/** Every rat in play (co-op: any of them can pick up runes and fragments; they're shared per save slot). */
const rats = () => coop.on ? coop.players.map(p => (p.i === coop.active ? P : p.P)).filter(q => q && !q.downed) : [P];

/** Place this level's rune (if it has one this burrow hasn't taken) in the room farthest from the start. */
export function placeRune(info) {
  W.runes = [];
  placeFragment(info);
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
    if (!rats().some(q => Math.hypot(q.x - o.x, q.z - o.z) <= 1.2 && Math.abs(q.y - o.y) <= 1.6)) continue;
    (o.frag ? takeFragment : takeRune)(o);
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

/** Where this level's fragment hides: a hidden courtyard (city), else a sewer pocket, else the farthest room. */
export function fragmentSpot(info) {
  const H = info.hidden || [], P0 = info.pockets || [];
  // Prefer a guarded lair courtyard (the secret drain takes an unguarded one), and stand off-centre so the two never overlap.
  const h = H.find(h => h.lair) || H[H.length - 1];
  if (h) return { tx: h.x + Math.min(h.w - 1, (h.w >> 1) + 1), ty: h.y + Math.min(h.h - 1, (h.h >> 1) + 1), hidden: true };
  const p = P0[P0.length - 1];
  if (p) { const c = p[Math.min(p.length - 1, 2)]; return { tx: c[0], ty: c[1], hidden: true }; }
  const r = (info.byDist || []).slice(-1)[0];
  return r ? { tx: r.cx, ty: r.cy, hidden: false } : null;
}
/** One fragment per regular level, unless this save slot already holds it. */
export function placeFragment(info) {
  const D = curD(), F = FRAGMENTS.find(f => f.level === D.level);
  if (!F || D.secret || (meta.fragments && meta.fragments[F.id])) return null;
  const sp = fragmentSpot(info);
  if (!sp) return null;
  const x = toW(sp.tx), z = toW(sp.ty), y = floorY(x, z);
  const g = new THREE.Mesh(new THREE.TetrahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xff5ad8 }));
  g.position.set(x, y + 1, z);
  world.add(g);
  const o = { id: F.id, name: 'Rune Fragment', frag: true, hidden: sp.hidden, x, y, z, g };
  W.runes.push(o);
  return o;
}
export function takeFragment(o) {
  bury(o.g);
  (meta.fragments || (meta.fragments = {}))[o.id] = true;
  saveMeta();
  puff(o.x, o.y + 1, o.z, 0xff5ad8, 30, 3);
  sfx('level');
  banner(greatRune(meta) ? 'The Great Rune' : 'Rune Fragment', greatRune(meta) ? 'The fragments fuse · something nameless waits beneath the Court' : `Fragments ${fragCount(meta)}/${FRAGMENTS.length}`);
}
/** The secret boss rises in the Court once the Great Rune is whole: after the King, or after The Crowned One when that fight is due. */
export const secretDue = (e) => e.kind === 'ratking' && curD().level === FINAL_LEVEL && greatRune(meta) && !run.secretDone && !run.secretUp && !finalDue(e.kind) && !e.secretBoss;
