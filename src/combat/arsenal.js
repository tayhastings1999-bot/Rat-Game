// Class kits: each class's primary and special, and the projectiles they fire.
import * as THREE from 'three';
import { angD, TAU } from '../core/util.js';
import { G, P, W, st } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { swipeFx, boom, fx, spark, bolt, puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { solidFor, tileAt, topAt, toG } from '../world/grid.js';
import { near, hit, aoe } from './combat.js';
import { TUNE } from '../tuning.js';
import { breakFoodAt } from '../game/food.js';
import { puOn } from '../game/powerups.js';
import { coop } from '../game/coop.js';

/** Melee step-in: close most of the gap to a target just outside reach. */
function stepIn(t, R) {
  if (!t || P.noStep) return;
  const dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz);
  if (d > R * 0.75 && d < R + 2.5 && P.onGround) { const s = Math.min(12, (d - R * 0.6) * 5); P.vx += dx / d * s; P.vz += dz / d * s; P.lock = 0.08; }
}

export function chain(cur, chains, dm, src, from, skipFirst = false) {
  const hs = new Set(), pts = [from];
  for (let c = 0; c <= chains && cur; c++) {
    hs.add(cur);
    pts.push([cur.x, cur.y + cur.h * 0.6, cur.z]);
    if (!(skipFirst && c === 0)) hit(cur, dm, null, 0, src);
    let b = null, bd = (6 * st.area) ** 2;
    for (const e of W.enemies) {
      if (e.dead || hs.has(e)) continue;
      const d = (e.x - cur.x) ** 2 + (e.z - cur.z) ** 2;
      if (d < bd) { bd = d; b = e; }
    }
    cur = b;
  }
  if (pts.length > 2 || !skipFirst) bolt(pts);
}

export const flasks = [];
export function lob(tx, ty, tz, R, dm, src) {
  let b = flasks.find(b => !b.on);
  if (!b) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xa9e06a }));
    scene.add(m);
    b = { m };
    flasks.push(b);
  }
  Object.assign(b, { on: true, sx: P.x, sy: P.y + 1, sz: P.z, tx, ty, tz, t: 0, R, dm, src });
  b.m.visible = true;
  P.atk = 0.2;
}

export function shoot(x, y, z, dx, dy, dz, spd, dmg, pierce, src, o = {}) {
  const d = Math.hypot(dx, dy, dz) || 1;
  if (W.pproj.length >= 320) return;
  const pr = src === 'primary';
  W.pproj.push({
    x, y, z, vx: dx / d * spd, vy: dy / d * spd, vz: dz / d * spd, spd,
    life: (o.life || 0.75) * (pr ? st.range : 1), dmg, pierce, src, hs: new Set(), col: o.col || 0xf4efe6,
    homing: o.homing || (pr && st.homing), split: pr && st.split && !o.child, size: o.size || 1 + (pr ? st.shotSize : 0) * (o.child ? 0.5 : 1), fx: pr, bounce: o.bounce || 0, who: coop.on ? coop.active : 0,
  });
  if (o.arc) { const p = W.pproj[W.pproj.length - 1]; p.vy += 2.2; p.g = 9; }
  // Splitclaw: every primary shot fans out three ways.
  if (pr && !o.child && puOn('split')) { const a = Math.atan2(dx, dz), s = TUNE.powerups.splitSpread; for (const k of [-s, s]) shoot(x, y, z, Math.sin(a + k), dy / d, Math.cos(a + k), spd, dmg * 0.7, pierce, src, { ...o, child: true }); }
  if (pr) { spark(x + dx / d * 0.5, y, z + dz / d * 0.5, 0.6, o.col || 0xffffff); P.throwT = 0.26; sfx('shoot'); }
}

/** Enemy projectile. `g` makes it arc, `pud` leaves a puddle, `home` makes it seek. */
export function glob(x, y, z, vx, vy, vz, dmg, col = 0xff4a2a, slow = false) {
  const p = { x, y, z, vx, vy, vz, life: 4, dmg, col, slow, size: 1 };
  if (W.eproj.length < 320) W.eproj.push(p);
  return p;
}

export const SPECIALS = {
  volley: { name: 'Stone Volley', cd: 4.5, use() { const ring = o => { for (let i = 0; i < 20; i++) { const a = (i + o) / 20 * TAU; shoot(P.x, P.y + 0.7, P.z, Math.sin(a), 0, Math.cos(a), 22, 18, 2, 'special', { col: 0xf2d090 }); } }; ring(0); if (P.turboT > 0) setTimeout(() => { if (G.state === 'play') ring(0.5); }, 150); } },
  blink: {
    name: 'Blink', cd: 3.5,
    use() {
      aoe(P.x, P.y, P.z, 3 * st.area, 35, 8, 'special');
      boom(P.x, P.y + 0.5, P.z, 3, 0xc080ff);
      for (let s = P.turboT > 0 ? 10 : 7; s > 0; s -= 0.5) {
        const nx = P.x + P.wx * s, nz = P.z + P.wz * s, t = tileAt(nx, nz);
        if (!solidFor(t, true) || P.y >= topAt(toG(nx), toG(nz)) - 0.1) { P.x = nx; P.z = nz; break; }
      }
      P.inv = 0.5;
      aoe(P.x, P.y, P.z, 3 * st.area, 35, 8, 'special');
      boom(P.x, P.y + 0.5, P.z, 3, 0xc080ff);
    },
  },
  bulwark: {
    name: 'Bulwark', cd: 9,
    use() {
      P.bulwark = P.turboT > 0 ? 6 : 3;
      aoe(P.x, P.y, P.z, 3.6 * st.area, 22, 18, 'special');
      boom(P.x, P.y + 0.6, P.z, 4, 0xffb070);
      fx('ring', P.x, P.y, P.z, 3.6 * st.area, 0xffb070, 0.4);
      G.shake = 0.35;
    },
  },
  smoke: {
    // Smoke bomb: a choking cloud. The horde inside is slowed, off its rhythm and blinded,
    // so it takes extra damage (TUNE.sneak.smokeVuln). A turbo cloud also burns.
    name: 'Smoke Bomb', cd: 8,
    use() {
      W.smokes.push({ x: P.x, z: P.z, R: 5 * st.area, t: P.turboT > 0 ? 7 : 4.5, burn: P.turboT > 0 });
      puff(P.x, P.y + 0.5, P.z, 0x8a8a8a, 30, 6);
      sfx('roll');
    },
  },
};

export const PRIM = {
  gnash: {
    name: 'Gnash', range: 4, cd: 0.6, melee: true,
    fire(dx, dz, t) {
      const a = Math.atan2(dx, dz), R = 3 * st.area, n = 1 + st.multi;
      stepIn(t, R);
      for (let k = 0; k < n; k++) {
        const A = a + (k - (n - 1) / 2) * 0.7;
        swipeFx(A, R, 0xffc090, true);
        breakFoodAt(P.x + Math.sin(A) * R * 0.55, P.z + Math.cos(A) * R * 0.55, R * 0.55, P.y);
        for (const e of near(P.x, P.y, P.z, R + 0.3, TUNE.combat.meleeFlyReach)) if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), A)) < 1.3) hit(e, 30, A, 10, 'primary', false, true);
      }
      G.shake = Math.max(G.shake, 0.06);
    },
  },
  shiv: {
    // Quick stab: 1.8× from behind. Roll past a mob and stick it in the back.
    name: 'Shiv', range: 3.8, cd: 0.28, melee: true,
    fire(dx, dz, t) {
      const a = Math.atan2(dx, dz), R = 2.3 * st.area, n = 1 + st.multi;
      stepIn(t, R);
      let landed = 0;
      for (let k = 0; k < n; k++) {
        const A = a + (k - (n - 1) / 2) * 0.5;
        swipeFx(A, R, 0xd8f0e0);
        breakFoodAt(P.x + Math.sin(A) * R * 0.55, P.z + Math.cos(A) * R * 0.55, R * 0.55, P.y);
        for (const e of near(P.x, P.y, P.z, R + 0.3, TUNE.combat.meleeFlyReach)) {
          if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), A)) > 0.9) continue;
          const back = Math.abs(angD(Math.atan2(P.x - e.x, P.z - e.z), e.ang || 0)) > 2.1, m = back ? TUNE.sneak.backstab : 1;
          hit(e, 16 * m, A, 3, 'primary', false, true);
          if (back && landed === 0) dnum(e.x, e.y + e.h + 0.5, e.z, 'BACKSTAB', 'crit');
          landed++;
        }
      }
    },
  },
  stone: {
    // Half Strength, half Magic: a slinger's stones get luckier as it levels (fixes the late-game
    // fall-off when only Strength scaled it while enemies followed Strength and Magic).
    name: 'Sling Stone', range: 13, cd: 0.3, mag: 0.5,
    fire(dx, dz, t) {
      const n = 1 + st.multi, dy = t ? (t.y + t.h * 0.5 - (P.y + 0.7)) / Math.max(1, Math.hypot(t.x - P.x, t.z - P.z)) : 0;
      for (let k = 0; k < n; k++) { const A = Math.atan2(dx, dz) + (k - (n - 1) / 2) * 0.16; shoot(P.x, P.y + 0.7, P.z, Math.sin(A), dy, Math.cos(A), 20 * st.shotSpd, 11, 1, 'primary', { col: 0xf4efe6, arc: true }); }
    },
  },
  hex: {
    name: 'Hex Bolt', range: 13, cd: 0.5, mag: 1, // a spell: scales with Magic, not Strength
    fire(dx, dz) {
      const n = 1 + st.multi;
      for (let k = 0; k < n; k++) { const A = Math.atan2(dx, dz) + (k - (n - 1) / 2) * 0.3; shoot(P.x, P.y + 0.9, P.z, Math.sin(A), 0, Math.cos(A), 12 * st.shotSpd, 13, 0, 'primary', { homing: true, col: 0xb46cff, life: 1.5 }); }
    },
  },
};
