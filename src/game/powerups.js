// Power-ups: eight timed boosts (TUNE.powerups.dur seconds each, 25 by
// default). They sit on the street as glowing tokens, a few per level, and
// turn up in locked chests, premium chests and secret areas. Picking one up
// starts (or refreshes) its clock; several can run at once, and the HUD shows
// each with a draining bar.
//   Scent Veil     the horde loses your scent: only mobs right on you keep chasing
//   Iron Hide      take far less damage
//   Quickpaw       move and attack faster
//   Splitclaw      shots split three ways; swipes land twice as hard
//   Mirror Shell   enemy shots bounce back off you
//   Glow Eyes      see hidden lurkers, moldy food, secret walls and nearby secrets
//   Ember Breath   your attacks set enemies alight
//   Moth Familiar  a moth circles you and zaps the nearest enemy
import * as THREE from 'three';
import { G, P, W, run } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { flameTex } from '../render/textures.js';
import { puff, spark, bolt, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { floorY } from '../world/grid.js';
import { hit } from '../combat/combat.js';
import { banner } from '../ui/hud.js';
import { TUNE } from '../tuning.js';

export const POWERUPS = {
  veil: { name: 'Scent Veil', col: 0x9ad0ff, desc: 'The horde loses your scent' },
  iron: { name: 'Iron Hide', col: 0xc8d0d8, desc: 'Take far less damage' },
  quick: { name: 'Quickpaw', col: 0x6aff9a, desc: 'Move and attack faster' },
  split: { name: 'Splitclaw', col: 0xff9a3a, desc: 'Shots split three ways, swipes land twice as hard' },
  mirror: { name: 'Mirror Shell', col: 0xe8e8ff, desc: 'Enemy shots bounce back' },
  glow: { name: 'Glow Eyes', col: 0xffe060, desc: 'See lurkers, mold and secrets' },
  ember: { name: 'Ember Breath', col: 0xff5a20, desc: 'Your attacks set enemies alight' },
  moth: { name: 'Moth Familiar', col: 0xd0b0ff, desc: 'A moth zaps the nearest enemy' },
};
export const PU_KEYS = Object.keys(POWERUPS);

/** Seconds left on a power-up (0 when off). */
export const puT = k => (run.pu && run.pu[k] > 0 ? run.pu[k] : 0);
export const puOn = k => puT(k) > 0;

// ---------- pickups ----------
const tokenGeo = new THREE.OctahedronGeometry(0.42, 0);
const mats = {};
const matFor = k => mats[k] || (mats[k] = new THREE.MeshBasicMaterial({ color: POWERUPS[k].col }));
/** Drop a power-up token (kind random if not given). */
export function dropPowerup(x, y, z, kind) {
  kind = kind || PU_KEYS[(Math.random() * PU_KEYS.length) | 0];
  const g = new THREE.Group(), gy = y ?? floorY(x, z);
  const core = new THREE.Mesh(tokenGeo, matFor(kind));
  core.position.y = 0.9;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: POWERUPS[kind].col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 }));
  halo.scale.setScalar(2.2);
  halo.position.y = 0.9;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: POWERUPS[kind].col, transparent: true, opacity: 0.6, depthWrite: false }));
  ring.position.y = 0.04;
  g.add(core, halo, ring);
  g.position.set(x, gy, z);
  world.add(g);
  const p = { kind, x, y: gy, z, g, core, halo };
  W.pups.push(p);
  return p;
}

/** Start or refresh a power-up. */
export function grantPowerup(kind) {
  const D = POWERUPS[kind];
  if (!D) return;
  if (!run.pu) run.pu = {};
  const fresh = !(run.pu[kind] > 0);
  run.pu[kind] = TUNE.powerups.dur;
  run.puTaken = (run.puTaken || 0) + 1;
  banner(D.name, D.desc + ` · ${TUNE.powerups.dur}s`);
  dnum(P.x, P.y + 1.8, P.z, D.name, 'crit');
  puff(P.x, P.y + 0.6, P.z, D.col, 16, 3);
  sfx('level');
  if (kind === 'moth' && fresh) moth.a = 0;
}

// ---------- the moth ----------
const moth = { s: null, a: 0, cd: 0 };
function mothSprite() {
  if (moth.s) return moth.s;
  moth.s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: POWERUPS.moth.col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  moth.s.scale.setScalar(0.9);
  return moth.s;
}
function tickMoth(dt) {
  const s = mothSprite();
  if (!puOn('moth') || G.state !== 'play') { if (s.parent) s.parent.remove(s); return; }
  if (!s.parent) world.add(s);
  moth.a += dt * 3.2;
  const x = P.x + Math.sin(moth.a) * 1.4, z = P.z + Math.cos(moth.a) * 1.4, y = P.y + 1.4 + Math.sin(moth.a * 2.3) * 0.25;
  s.position.set(x, y, z);
  moth.cd -= dt;
  if (moth.cd > 0) return;
  const R = TUNE.powerups.mothRange;
  let b = null, bd = R * R;
  for (const e of W.enemies) {
    if (e.dead || e.hidden || e.reaper) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd && Math.abs(e.y - P.y) < 4) { bd = d; b = e; }
  }
  if (!b) return;
  moth.cd = TUNE.powerups.mothEvery;
  bolt([[x, y, z], [b.x, b.y + (b.h || 1) * 0.6, b.z]]);
  spark(b.x, b.y + (b.h || 1) * 0.6, b.z, 0.8, POWERUPS.moth.col);
  hit(b, TUNE.powerups.mothDmg, Math.atan2(b.x - P.x, b.z - P.z), 2, 'moth', true);
}

/** Pickups, clocks, the moth. */
export function tickPowerups(dt) {
  const pu = run.pu || (run.pu = {});
  if (PU_KEYS.some(k => pu[k] > 0)) run.puUp = (run.puUp || 0) + dt;
  for (const k in pu) if (pu[k] > 0) { pu[k] -= dt; if (pu[k] <= 0) { pu[k] = 0; dnum(P.x, P.y + 1.8, P.z, POWERUPS[k].name + ' wore off', 'info'); } }
  for (let i = W.pups.length - 1; i >= 0; i--) {
    const p = W.pups[i];
    p.core.rotation.y += dt * 2.4;
    p.core.position.y = 0.9 + Math.sin(G.time * 3 + p.x) * 0.15;
    p.halo.material.opacity = 0.55 + 0.25 * Math.sin(G.time * 4 + p.z);
    if (Math.hypot(P.x - p.x, P.z - p.z) < 1.1 && Math.abs(P.y - p.y) < 1.6) {
      bury(p.g);
      W.pups.splice(i, 1);
      grantPowerup(p.kind);
    }
  }
  tickMoth(dt);
}

/** HUD: the running power-ups, longest first. */
export function puList() {
  const pu = run.pu || {};
  return PU_KEYS.filter(k => pu[k] > 0).map(k => ({ k, name: POWERUPS[k].name, col: POWERUPS[k].col, t: pu[k], f: pu[k] / TUNE.powerups.dur })).sort((a, b) => b.t - a.t);
}
