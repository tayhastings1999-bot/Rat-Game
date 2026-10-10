// Food and the health drain. Your health ticks down all the time (faster in
// later zones), and food is the only thing that brings it back. Three sizes:
// crumbs, cheese wedges and whole caches (TUNE.food). Your own attacks destroy
// food, so watch where you aim. Some food is moldy: it looks the same, but
// eating it poisons you instead. Sniff (F) and moldy food shows green.
import * as THREE from 'three';
import { rand } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { world, bury } from '../render/renderer.js';
import { Cy } from '../render/models.js';
import { flameTex } from '../render/textures.js';
import { puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { isSewer } from '../data/world.js';
import { TUNE } from '../tuning.js';
import { lowHealth } from './announcer.js';
import { die } from '../ui/screens.js';

const cheese = new THREE.MeshLambertMaterial({ color: 0xe8b84a, emissive: 0x4a3000, flatShading: true });
const rind = new THREE.MeshLambertMaterial({ color: 0xc87a2a, emissive: 0x2a1000, flatShading: true });
const moldMat = new THREE.SpriteMaterial({ map: flameTex, color: 0x6aff4a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
const GEO = {
  crumb: Cy(0.16, 0.2, 0.16, 6),
  wedge: new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8, 1, false, 0, Math.PI * 0.6),
  cache: Cy(0.42, 0.42, 0.34, 12),
};
export const FOOD_KINDS = ['crumb', 'wedge', 'cache'];
const heal = kind => TUNE.food[kind] || TUNE.food.crumb;

/** Drop food. `kind` is crumb, wedge or cache (default crumb). */
export function dropFood(x, y, z, kind = 'crumb', opts = {}) {
  const F = TUNE.food, g = new THREE.Group();
  const m = new THREE.Mesh(GEO[kind] || GEO.crumb, cheese);
  g.add(m);
  if (kind === 'cache') { const r = new THREE.Mesh(Cy(0.44, 0.44, 0.08, 12), rind); r.position.y = 0.17; g.add(r); }
  const mold = opts.mold ?? Math.random() < (isSewer() ? F.moldSewer : F.mold);
  let ms = null;
  if (mold) { ms = new THREE.Sprite(moldMat); ms.scale.setScalar(kind === 'cache' ? 1.6 : 1.1); ms.position.y = 0.2; ms.visible = false; g.add(ms); }
  const fx0 = x + (opts.exact ? 0 : rand(-0.3, 0.3)), fz0 = z + (opts.exact ? 0 : rand(-0.3, 0.3));
  g.position.set(fx0, y + 0.4, fz0);
  world.add(g);
  const f = { x: fx0, y, z: fz0, m: g, kind, mold, ms, safe: F.dropGrace };
  W.foods.push(f);
  return f;
}

/** Your attacks smash food: anything within R of (x, z). Returns how many were destroyed. */
export function breakFoodAt(x, z, R, y = null) {
  let n = 0;
  for (let i = W.foods.length - 1; i >= 0; i--) {
    const f = W.foods[i];
    if (f.safe > 0 || Math.hypot(f.x - x, f.z - z) > R + 0.3 || (y != null && Math.abs(f.y - y) > 2.5)) continue;
    bury(f.m);
    W.foods.splice(i, 1);
    puff(f.x, f.y + 0.4, f.z, 0xe8b84a, 8, 2.5);
    dnum(f.x, f.y + 1.2, f.z, 'Food destroyed', 'info');
    run.foodLost = (run.foodLost || 0) + 1;
    n++;
  }
  for (const c of W.caches) {
    if (c.taken || Math.hypot(c.x - x, c.z - z) > R + 0.4 || (y != null && Math.abs(c.y - y) > 2.5)) continue;
    c.taken = true;
    bury(c.g);
    puff(c.x, c.y + 0.5, c.z, 0xe8b84a, 14, 3);
    dnum(c.x, c.y + 1.4, c.z, 'Cache destroyed', 'info');
    run.foodLost = (run.foodLost || 0) + 1;
    n++;
  }
  if (n) sfx('splat');
  return n;
}

function eat(kind, mold, x, y, z) {
  if (mold) {
    P.poisonT = Math.max(P.poisonT, TUNE.food.moldPoison);
    dnum(P.x, P.y + 1.6, P.z, 'Moldy! Poisoned', 'poison');
    puff(x, y + 0.4, z, 0x6aff4a, 10, 2);
    sfx('curse');
    run.moldEaten = (run.moldEaten || 0) + 1;
    return;
  }
  const h = Math.round(heal(kind) * st.foodMul * st.healMul);
  run.hp = Math.min(st.maxHp, run.hp + h);
  run.eaten = (run.eaten || 0) + 1;
  dnum(P.x, P.y + 1.6, P.z, '+' + h, 'heal');
  sfx('heal');
}

/** Pickups, mold that shows while sniffing, and the drain. */
export function tickFood(dt) {
  for (let i = W.foods.length - 1; i >= 0; i--) {
    const f = W.foods[i];
    f.safe -= dt;
    f.m.position.set(f.x, f.y + 0.4 + Math.sin(G.time * 3 + f.x) * 0.1, f.z);
    f.m.rotation.y += dt * 2;
    if (f.ms) f.ms.visible = !!P.scent;
    if (Math.hypot(P.x - f.x, P.z - f.z) < 1 && Math.abs(P.y - f.y) < 1.2) {
      bury(f.m);
      W.foods.splice(i, 1);
      eat(f.kind, f.mold, f.x, f.y, f.z);
    }
  }
  for (const c of W.caches) {
    if (c.taken) continue;
    c.g.rotation.y += dt;
    if (Math.hypot(P.x - c.x, P.z - c.z) < 1.2 && Math.abs(P.y - c.y) < 1.3) {
      c.taken = true;
      bury(c.g);
      eat('cache', false, c.x, c.y, c.z);
      for (let k = 0; k < 8; k++) W.scraps.push({ x: c.x + rand(-0.6, 0.6), y: c.y, z: c.z + rand(-0.6, 0.6), pull: false, s: 0, ph: rand(0, 6) });
    }
  }
  drain(dt);
}

/** Health drains all the time: TUNE.food.drainBase + drainPerZone × zone, in HP per second. */
export const drainRate = () => TUNE.food.drainBase + TUNE.food.drainPerZone * (run.tier || 0);
function drain(dt) {
  if (G.god || G.state !== 'play') return;
  run.hp -= drainRate() * dt;
  run.drained = (run.drained || 0) + drainRate() * dt;
  lowHealth();
  if (run.hp <= 0) { run.hp = 0; run.starved = true; die(); }
}
