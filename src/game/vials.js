// Rot Vials (Z): a stoppered flask of sewer rot. Throw one and it bursts
// around you, hitting everything in a wide circle (nests too) for damage that
// scales with Magic. You carry up to TUNE.vials.max; they turn up in chests,
// bins and on elites, and sit on the floor as glowing green flasks.
import * as THREE from 'three';
import { rand } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { Cy } from '../render/models.js';
import { boom, fx, puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { near, hit } from '../combat/combat.js';
import { TUNE } from '../tuning.js';

const glassMat = new THREE.MeshBasicMaterial({ color: 0x9be06a, transparent: true, opacity: 0.85 });
const corkMat = new THREE.MeshBasicMaterial({ color: 0x6a4a2a });

export function dropVial(x, y, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(Cy(0.22, 0.28, 0.5, 8), glassMat);
  const cork = new THREE.Mesh(Cy(0.1, 0.1, 0.16, 6), corkMat);
  cork.position.y = 0.33;
  g.add(body, cork);
  g.position.set(x + rand(-0.4, 0.4), y + 0.4, z + rand(-0.4, 0.4));
  world.add(g);
  W.vials.push({ x: g.position.x, y, z: g.position.z, g });
}

/** Walk over a flask to pick it up (unless your bandolier is full). */
export function tickVials(dt) {
  for (let i = W.vials.length - 1; i >= 0; i--) {
    const v = W.vials[i];
    v.g.rotation.y += dt * 2;
    v.g.position.y = v.y + 0.45 + Math.sin(G.time * 3 + v.x) * 0.08;
    if (Math.hypot(P.x - v.x, P.z - v.z) > 1.1 || Math.abs(P.y - v.y) > 1.3) continue;
    if ((run.vials || 0) >= TUNE.vials.max) { if (!v.full) { v.full = true; dnum(P.x, P.y + 1.6, P.z, 'Vials full', 'info'); } continue; }
    bury(v.g);
    W.vials.splice(i, 1);
    run.vials = (run.vials || 0) + 1;
    dnum(P.x, P.y + 1.6, P.z, `Rot Vial ${run.vials}/${TUNE.vials.max}`, 'heal');
    sfx('pickup');
  }
}

export function throwVial() {
  if (G.state !== 'play') return;
  if (!(run.vials > 0)) { dnum(P.x, P.y + 1.6, P.z, 'No Rot Vials', 'info'); return; }
  run.vials--;
  run.vialsUsed = (run.vialsUsed || 0) + 1;
  const V = TUNE.vials, R = V.radius;
  for (const e of near(P.x, P.y, P.z, R, 6)) {
    const a = Math.atan2(e.x - P.x, e.z - P.z);
    hit(e, e.type === 'nest' ? V.nestDmg : e.boss ? V.bossDmg : V.dmg, a, e.boss ? 0 : 14, 'vial');
    e.pT = Math.max(e.pT || 0, V.poison);
    e.pD = Math.max(e.pD || 0, 6);
  }
  boom(P.x, P.y + 0.6, P.z, R * 1.2, 0x9be06a);
  fx('ring', P.x, P.y, P.z, R, 0x9be06a, 0.6);
  puff(P.x, P.y + 0.4, P.z, 0x9be06a, 50, 9);
  G.shake = Math.max(G.shake, 0.6);
  G.hitStop = Math.max(G.hitStop, 0.08);
  sfx('boom');
  dnum(P.x, P.y + 2, P.z, 'ROT VIAL', 'poison');
}
