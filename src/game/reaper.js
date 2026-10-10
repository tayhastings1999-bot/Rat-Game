// The Reaper: a hooded thing that comes for rats who linger. From the second
// zone on, it rises once you've spent TUNE.reaper.delay seconds in a zone and
// glides straight at you, through walls. Its touch drains health fast. Claws
// and shots only stagger it: a Rot Vial or a turbo blast is what hurts it.
// Once it has drained its fill it leaves, and comes back later if you're
// still dawdling. Banish it for a big payout.
import * as THREE from 'three';
import { rand } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { scene, dropCreature } from '../render/renderer.js';
import { flameTex } from '../render/textures.js';
import { puff, spark, boom, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { floorY } from '../world/grid.js';
import { scrapDrop, dropFood } from '../combat/combat.js';
import { addXP } from './progress.js';
import { bark } from './announcer.js';
import { TUNE } from '../tuning.js';
import { die } from '../ui/screens.js';

function reaperMesh() {
  const g = new THREE.Group(), robe = new THREE.MeshLambertMaterial({ color: 0x141018, emissive: 0x0a0610, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 7, 1, true), robe);
  body.position.y = 1.3;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), robe);
  hood.position.y = 2.65;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), new THREE.MeshLambertMaterial({ color: 0xd8d0c0, emissive: 0x2a2620 }));
  skull.position.set(0, 2.6, 0.22);
  const eyeM = new THREE.SpriteMaterial({ map: flameTex, color: 0x9ad0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (const s of [-1, 1]) { const e = new THREE.Sprite(eyeM); e.scale.setScalar(0.35); e.position.set(s * 0.11, 2.65, 0.48); g.add(e); }
  const snath = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
  snath.position.set(0.8, 1.7, 0.1);
  snath.rotation.z = 0.25;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.25), new THREE.MeshLambertMaterial({ color: 0xa8b0b8, emissive: 0x20262a }));
  blade.position.set(0.25, 3.25, 0.1);
  blade.rotation.z = -0.35;
  g.add(body, hood, skull, snath, blade);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Spawn the Reaper near the edge of the screen (or at x, z). */
export function spawnReaper(x, z) {
  const R = TUNE.reaper, a = rand(0, Math.PI * 2);
  x ??= P.x + Math.sin(a) * R.spawnDist;
  z ??= P.z + Math.cos(a) * R.spawnDist;
  const mesh = reaperMesh();
  scene.add(mesh);
  const hp = R.hp * (1 + (run.tier || 0) * 0.3);
  const e = { type: 'reaper', reaper: true, mesh, x, y: floorY(x, z) + 0.2, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, hp, maxHp: hp, r: 0.8, h: 2.8, heavy: true, fly: true, bar: true, name: 'The Reaper', col: 0x141018, blood: 0x2a1a3a, flash: 0, slow: 0, ang: 0, pT: 0, bT: 0, dT: 0, tT: 0, ward: 0, stagger: 0, drained: 0, xp: 0 };
  W.enemies.push(e);
  run.reaper = e;
  puff(x, e.y + 1, z, 0x1a1020, 30, 4);
  sfx('curse');
  bark('The Reaper has come for you!');
  return e;
}

/** Zone timer: the Reaper rises if you dawdle. */
export function tickReaperSpawn(dt) {
  const R = TUNE.reaper;
  if ((run.tier || 0) < R.minZone || G.boss || (run.reaper && !run.reaper.dead)) return;
  run.reaperT = (run.reaperT ?? R.delay) - dt;
  if (run.reaperT <= 0) { run.reaperT = R.returnAfter; spawnReaper(); }
}

/** Per-step AI (from updateEnemies): glide at the rat through anything; drain on touch. */
export function reaperAI(e, dt) {
  const R = TUNE.reaper;
  e.pT = 0; e.bT = 0; // rot and fire don't take
  e.flash -= dt;
  e.stagger -= dt;
  const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  const sp = e.stagger > 0 ? -R.spd * 0.6 : R.spd;
  e.x += dx / d * sp * dt + e.kx * dt;
  e.z += dz / d * sp * dt + e.kz * dt;
  e.kx *= Math.exp(-4 * dt); e.kz *= Math.exp(-4 * dt);
  e.y += (floorY(e.x, e.z, true) + 0.2 + Math.sin(G.time * 2) * 0.15 - e.y) * Math.min(1, dt * 3);
  e.ang = Math.atan2(dx, dz);
  e.mesh.position.set(e.x, e.y, e.z);
  e.mesh.rotation.set(0, e.ang, Math.sin(G.time * 1.3) * 0.05);
  e.mesh.visible = true;
  if (Math.random() < dt * 12) puff(e.x + rand(-0.5, 0.5), e.y + 0.2, e.z + rand(-0.5, 0.5), 0x1a1020, 1, 0.8);
  // Its touch drains you (ignores dodges and armor).
  if (d < R.reach && Math.abs(P.y - e.y) < 2.5 && G.state === 'play') {
    const k = R.dps * dt;
    run.hp -= k;
    e.drained += k;
    P.slowT = Math.max(P.slowT || 0, 0.3);
    G.flash = Math.max(G.flash, 0.3);
    if (Math.random() < dt * 6) dnum(P.x, P.y + 1.4, P.z, '-' + Math.ceil(k * 6), 'heal');
    if (G.qa) G.qa.hurt(k, e, true);
    if (run.hp <= 0) { run.hp = 0; die(); return; }
  }
  if (e.drained >= R.drainCap) leave(e, 'The Reaper has fed, and fades away');
}

/** Normal attacks only stagger it; vials and turbo blasts hurt (combat.js). Returns true if the hit is blocked. */
export function reaperBlocks(e, src, ang) {
  if (src === 'vial' || src === 'turbo') return false;
  e.stagger = Math.max(e.stagger, TUNE.reaper.staggerT);
  if (ang != null) { e.kx += Math.sin(ang) * 6; e.kz += Math.cos(ang) * 6; }
  if (Math.random() < 0.3) { spark(e.x, e.y + 1.8, e.z, 1, 0x9ad0ff); dnum(e.x, e.y + 3.2, e.z, 'IMMUNE · use a vial or turbo', 'info'); }
  return true;
}

function leave(e, msg) {
  e.dead = true;
  run.reaper = null;
  puff(e.x, e.y + 1.2, e.z, 0x1a1020, 30, 4);
  dropCreature(e.mesh);
  if (msg) dnum(e.x, e.y + 3, e.z, msg, 'info');
}

/** Called from kill(): banished. */
export function reaperDown(e) {
  run.reaper = null;
  run.reapers = (run.reapers || 0) + 1;
  const gy = floorY(e.x, e.z);
  boom(e.x, gy + 1.2, e.z, 6, 0x9ad0ff);
  dropCreature(e.mesh);
  for (let i = 0; i < TUNE.reaper.gold; i++) scrapDrop(e.x, gy, e.z);
  dropFood(e.x, gy, e.z, 'cache', { mold: false });
  addXP(TUNE.reaper.xp);
  bark('The Reaper is banished!');
}
