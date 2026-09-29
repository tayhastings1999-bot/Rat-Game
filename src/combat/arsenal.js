// Player weapons: class primaries and specials, auto-weapons, tomes, and the
// projectiles they fire.
import * as THREE from 'three';
import { rand, randi, angD, TAU, PI2 } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { swipeFx, boom, fx, spark, bolt, orb, orbState, puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { solidFor, tileAt, topAt, toG } from '../world/grid.js';
import { near, sorted, nearest, hit, aoe } from './combat.js';
import { puddle } from './hazards.js';

/** Melee step-in: close most of the gap to a target just outside reach. */
function stepIn(t, R) {
  if (!t) return;
  const dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz);
  if (d > R * 0.75 && d < R + 2.5 && P.onGround) { const s = Math.min(12, (d - R * 0.6) * 5); P.vx += dx / d * s; P.vz += dz / d * s; P.lock = 0.08; }
}

export const auraR = w => 2.6 * st.area * (1 + 0.12 * (Math.min(5, w.lvl) - 1)) * (w.evo ? 1.35 : 1);

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
    homing: o.homing || (pr && st.homing), split: pr && st.split && !o.child, size: 1 + (pr ? st.shotSize : 0) * (o.child ? 0.5 : 1), fx: pr,
  });
  if (o.arc) { const p = W.pproj[W.pproj.length - 1]; p.vy += 2.2; p.g = 9; }
  if (pr) { spark(x + dx / d * 0.5, y, z + dz / d * 0.5, 0.6, o.col || 0xffffff); P.throwT = 0.26; sfx('shoot'); }
}

/** Enemy projectile. `g` makes it arc, `pud` leaves a puddle, `home` makes it seek. */
export function glob(x, y, z, vx, vy, vz, dmg, col = 0xff4a2a, slow = false) {
  const p = { x, y, z, vx, vy, vz, life: 4, dmg, col, slow, size: 1 };
  if (W.eproj.length < 320) W.eproj.push(p);
  return p;
}

export const WEAP = {
  claw: {
    name: 'Rending Claws', role: 'Melee', desc: 'Rake everything in front of you, automatically.', lv: ['+Damage, +reach', '+Damage', 'Also rakes behind you', '+Damage, +reach'], cd: w => 0.9 * (w.evo ? 0.7 : 1),
    fire(w) {
      const L = Math.min(5, w.lvl), R = 2.6 * st.area * (1 + 0.1 * (L - 1)), t = nearest(R + 3), a = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.facing, dm = 20 * (1 + 0.28 * (L - 1)) * (w.evo ? 1.6 : 1);
      for (const A of w.evo ? [a, a + PI2, a + Math.PI, a - PI2] : L >= 4 ? [a, a + Math.PI] : [a]) {
        swipeFx(A, R, 0xffd8c0);
        for (const e of near(P.x, P.y, P.z, R + 0.3)) if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), A)) < 1.25) hit(e, dm, A, 5, 'claw');
      }
    },
  },
  whip: {
    name: 'Tail Lash', role: 'Melee', desc: 'Spin and lash everything around you, hurling it back.', lv: ['+Damage', 'Faster, +radius', '+Damage', 'Faster, +radius'], cd: w => 1.9 * (1 - 0.08 * (Math.min(5, w.lvl) - 1)) * (w.evo ? 0.7 : 1),
    fire(w) {
      const L = Math.min(5, w.lvl), R = 3 * st.area * (1 + 0.08 * (L - 1)) * (w.evo ? 1.3 : 1), dm = 16 * (1 + 0.25 * (L - 1)) * (w.evo ? 1.5 : 1);
      for (let k = 0; k < 3; k++) swipeFx(k * TAU / 3 + G.time * 3, R, w.evo ? 0xff4a3a : 0xff9a7a, true);
      for (const e of near(P.x, P.y, P.z, R)) { hit(e, dm, Math.atan2(e.x - P.x, e.z - P.z), 9, 'whip'); if (w.evo) e.slow = 1; }
    },
  },
  aura: {
    name: 'Plague Cloud', role: 'Area', desc: 'A choking miasma that withers and slows nearby foes.', lv: ['+Radius', '+Damage', '+Radius, +damage', '+Damage, longer slow'], cd: () => 0.45,
    fire(w) {
      const L = Math.min(5, w.lvl), dm = 5 * (1 + 0.32 * (L - 1)) * (w.evo ? 1.8 : 1);
      for (const e of near(P.x, P.y, P.z, auraR(w))) { hit(e, dm, null, 0, 'aura', true); e.slow = L >= 5 ? 1.5 : 0.6; if (w.evo) { e.pT = Math.max(e.pT, 1.5); e.pD = Math.max(e.pD || 0, 6); } }
    },
  },
  flask: {
    name: 'Rot Flask', role: 'Area', desc: 'Lob flasks of rot that burst into a caustic splash.', lv: ['+Damage', '+1 flask', '+Radius, +damage', '+1 flask'], cd: () => 2.1,
    fire(w) {
      const L = Math.min(5, w.lvl), ts = sorted(14);
      if (!ts.length) return false;
      const n = 1 + (L >= 3) + (L >= 5) + Math.min(1, st.proj) + (w.evo ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const t = ts[randi(0, Math.min(ts.length, 6) - 1)], x = t.x + rand(-1, 1), z = t.z + rand(-1, 1);
        lob(x, t.y, z, 2.5 * st.area * (1 + 0.1 * (L - 1)), 28 * (1 + 0.28 * (L - 1)), 'flask');
        if (w.evo) setTimeout(() => puddle('sludge', x, z, 1.8, 4, 'p'), 600);
      }
    },
  },
  sling: {
    name: 'Sling Stones', role: 'Ranged', desc: 'Whip stones at the nearest threats, automatically.', lv: ['+1 stone', 'Stones pierce a foe', '+1 stone', 'Pierce two, +damage'], cd: w => 0.75 * (w.evo ? 0.45 : 1),
    fire(w) {
      const L = Math.min(5, w.lvl), n = 1 + (L >= 2) + (L >= 4) + st.proj, ts = sorted(18);
      if (!ts.length) return false;
      const pr = (L >= 5 ? 2 : L >= 3 ? 1 : 0) + (w.evo ? 2 : 0), dm = 13 * (1 + 0.2 * (L - 1)) * (L >= 5 ? 1.2 : 1);
      for (let i = 0; i < n; i++) {
        const t = ts[i % ts.length];
        shoot(P.x, P.y + 0.7, P.z, t.x - P.x, t.y + t.h / 2 - (P.y + 0.7), t.z - P.z, 26, dm, pr, 'sling', { col: 0xe8d8b0, arc: true });
      }
    },
  },
  arc: {
    name: 'Arc Lightning', role: 'Magic', desc: 'Lightning leaps from foe to foe.', lv: ['+1 chain', '+Damage', '+1 strike', '+2 chains'], cd: () => 1.4,
    fire(w) {
      const L = Math.min(5, w.lvl), ts = sorted(15);
      if (!ts.length) return false;
      const strikes = 1 + (L >= 4) + Math.floor(st.proj / 2) + (w.evo ? 1 : 0), chains = 2 + (L >= 2) + (L >= 5) * 2 + (w.evo ? 3 : 0), dm = 16 * (1 + 0.25 * (L - 1)) * (L >= 3 ? 1.2 : 1) * (w.evo ? 1.4 : 1);
      for (let s = 0; s < strikes; s++) chain(ts[s % ts.length], chains, dm, 'arc', [P.x, P.y + 1.3, P.z]);
    },
  },
  orbit: {
    name: 'Bone Halo', role: 'Magic', desc: 'Cursed teeth circle you, biting anything they touch.', lv: ['+1 tooth', '+Damage', '+1 tooth, +radius', '+1 tooth, +damage'],
    tick(w, dt) {
      const L = Math.min(5, w.lvl), n = 2 + L + (L >= 4) + (L >= 5) + st.proj - 1 + (w.evo ? 3 : 0), R = 2.3 * st.area * (L >= 4 ? 1.15 : 1) * (w.evo ? 1.2 : 1), dm = 10 * (1 + 0.25 * (L - 1)) * (L >= 5 ? 1.2 : 1) * (w.evo ? 1.5 : 1);
      w.a = (w.a || 0) + dt * 3.4;
      for (let i = 0; i < n; i++) {
        const o = orb(i), a = w.a + i * TAU / n, x = P.x + Math.sin(a) * R, z = P.z + Math.cos(a) * R, y = P.y + 0.7;
        o.visible = true;
        o.position.set(x, y, z);
        o.rotation.set(G.time * 4, a, 0);
        for (const e of W.enemies) {
          if (e.dead) continue;
          const dx = e.x - x, dz = e.z - z, rr = e.r + 0.35;
          if (dx * dx + dz * dz < rr * rr && y > e.y - 0.3 && y < e.y + e.h + 0.3 && G.time - (e.ot || 0) > 0.4) { e.ot = G.time; hit(e, dm, a + PI2, 3, 'orbit'); }
        }
      }
      orbState.n = Math.max(orbState.n, n);
    },
  },
};

export const TOMES = {
  might: { name: 'Tome of Might', d: v => `+${Math.round(v * 15)}% damage`, ap: v => { st.dmg += 0.15 * v; } },
  reach: { name: 'Tome of Reach', d: v => `+${Math.round(v * 12)}% area`, ap: v => { st.area += 0.12 * v; } },
  haste: { name: 'Tome of Haste', d: v => `${Math.round(v * 8)}% faster attacks`, ap: v => { st.cd *= Math.pow(0.92, v); st.tear *= Math.pow(0.94, v); } },
  swift: { name: 'Tome of Swiftness', d: v => `+${Math.round(v * 8)}% move speed`, ap: v => { st.speed *= 1 + 0.08 * v; } },
  plenty: { name: 'Tome of Plenty', d: () => '+1 projectile, flask and tooth for weapons', ap: () => { st.proj++; }, max: 3, flat: true },
  wings: { name: 'Tome of Wings', d: () => '+1 jump in mid-air', ap: () => { st.jumps++; }, max: 2, flat: true },
  hide: { name: 'Tome of Hide', d: v => `+${Math.round(v * 20)} max HP`, ap: v => { st.maxHp += Math.round(20 * v); run.hp += Math.round(20 * v); } },
  hunger: { name: 'Tome of Hunger', d: v => `+${(v * 0.5).toFixed(1)} HP regen per second`, ap: v => { st.regen += 0.5 * v; } },
  lungs: { name: 'Tome of Lungs', d: v => `+${Math.round(v * 20)} max stamina`, ap: v => { st.staMax += Math.round(20 * v); } },
  cunning: { name: 'Tome of Cunning', d: v => `+${Math.round(v * 6)}% crit chance`, ap: v => { st.crit += 0.06 * v; } },
  greed: { name: 'Tome of Greed', d: v => `+${Math.round(v * 15)}% XP`, ap: v => { st.xp += 0.15 * v; } },
};
export const RAR = [{ n: 'Common', m: 1, c: '#9a96a0' }, { n: 'Rare', m: 1.5, c: '#4aa3ff' }, { n: 'Epic', m: 2, c: '#b35cff' }, { n: 'Legendary', m: 3, c: '#ffb020' }];

/** Overclock mutation: every special also releases a shock nova. */
function overclockNova() {
  if (!st.mut.overclock) return;
  const R = 5 * st.area;
  for (const e of near(P.x, P.y, P.z, R).slice(0, 12)) { bolt([[P.x, P.y + 1, P.z], [e.x, e.y + e.h * 0.6, e.z]]); hit(e, 30, Math.atan2(e.x - P.x, e.z - P.z), 8, 'overclock'); }
  fx('ring', P.x, P.y, P.z, R, 0x40ffd0, 0.4);
}

export const SPECIALS = {
  slam: { name: 'Leap Slam', cd: 5, use() { P.vy = 15; P.jumping = false; P.cut = true; const s = st.speed * 1.2; P.vx = Math.sin(P.facing) * s; P.vz = Math.cos(P.facing) * s; P.slam = true; P.onGround = false; P.lock = 0.5; } },
  nova: { name: 'Plague Nova', cd: 7, use() { const R = 6 * st.area; aoe(P.x, P.y, P.z, R, 45, 14, 'special', 2.5, true); boom(P.x, P.y + 0.4, P.z, R * 1.4, 0xa9e06a); fx('ring', P.x, P.y, P.z, R, 0xa9e06a, 0.5); G.shake = 0.3; } },
  volley: { name: 'Stone Volley', cd: 4.5, use() { for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; shoot(P.x, P.y + 0.7, P.z, Math.sin(a), 0, Math.cos(a), 22, 18, 2, 'special', { col: 0xf2d090 }); } } },
  blink: {
    name: 'Blink', cd: 3.5,
    use() {
      aoe(P.x, P.y, P.z, 3 * st.area, 35, 8, 'special');
      boom(P.x, P.y + 0.5, P.z, 3, 0xc080ff);
      for (let s = 7; s > 0; s -= 0.5) {
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
      P.bulwark = 3;
      aoe(P.x, P.y, P.z, 3.6 * st.area, 22, 18, 'special');
      boom(P.x, P.y + 0.6, P.z, 4, 0xffb070);
      fx('ring', P.x, P.y, P.z, 3.6 * st.area, 0xffb070, 0.4);
      G.shake = 0.35;
    },
  },
  smoke: {
    // Smoke bomb: a cloud that hides you from predators and owls, slows the horde inside and primes an ambush.
    name: 'Smoke Bomb', cd: 8,
    use() {
      W.smokes.push({ x: P.x, z: P.z, R: 5 * st.area, t: 4.5 });
      puff(P.x, P.y + 0.5, P.z, 0x8a8a8a, 30, 6);
      run.expo = 0;
      P.ambush = 1;
      sfx('roll');
    },
  },
  updraft: {
    name: 'Updraft', cd: 6,
    use() {
      aoe(P.x, P.y, P.z, 3 * st.area, 25, 12, 'special');
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; shoot(P.x, P.y + 0.3, P.z, Math.sin(a), -0.05, Math.cos(a), 14, 10, 1, 'special', { col: 0x9ad8ff, life: 0.5 }); }
      puff(P.x, P.y + 0.2, P.z, 0xc8e8ff, 14, 4);
      P.vy = 19; P.onGround = false; P.jumping = false; P.cut = true; P.glideT = 2.4;
    },
  },
};
export function useSpecialFx() { overclockNova(); }

export const PRIM = {
  rake: {
    name: 'Claw Rake', range: 4.8, cd: 0.38, melee: true,
    fire(dx, dz, t) {
      const a = Math.atan2(dx, dz), R = 2.8 * st.area, n = 1 + st.multi;
      stepIn(t, R);
      for (let k = 0; k < n; k++) {
        const A = a + (k - (n - 1) / 2) * 0.6;
        swipeFx(A, R, 0xffe8d0);
        for (const e of near(P.x, P.y, P.z, R + 0.3)) if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), A)) < 1.3) hit(e, 22, A, 4, 'primary', false, true);
      }
    },
  },
  gnash: {
    name: 'Gnash', range: 4, cd: 0.6, melee: true,
    fire(dx, dz, t) {
      const a = Math.atan2(dx, dz), R = 3 * st.area, n = 1 + st.multi;
      stepIn(t, R);
      for (let k = 0; k < n; k++) {
        const A = a + (k - (n - 1) / 2) * 0.7;
        swipeFx(A, R, 0xffc090, true);
        for (const e of near(P.x, P.y, P.z, R + 0.3)) if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), A)) < 1.3) hit(e, 30, A, 10, 'primary', false, true);
      }
      G.shake = Math.max(G.shake, 0.06);
    },
  },
  shiv: {
    // Quick single-target stab. Triple damage from ambush (after lurking in shadow or smoke, or on a cat that hasn't
    // noticed you), and 1.8× from behind: roll past a mob and stick it in the back.
    name: 'Shiv', range: 3.8, cd: 0.28, melee: true,
    fire(dx, dz, t) {
      const a = Math.atan2(dx, dz), R = 2.3 * st.area, amb = P.ambush > 0, n = 1 + st.multi;
      stepIn(t, R);
      let landed = 0;
      for (let k = 0; k < n; k++) {
        const A = a + (k - (n - 1) / 2) * 0.5;
        swipeFx(A, R, amb ? 0x6affb0 : 0xd8f0e0);
        for (const e of near(P.x, P.y, P.z, R + 0.3)) {
          if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), A)) > 0.9) continue;
          const back = Math.abs(angD(Math.atan2(P.x - e.x, P.z - e.z), e.ang || 0)) > 2.1, unaware = e.pred && e.mode === 'patrol';
          const m = (amb || unaware ? 3 : 1) * (back ? 1.8 : 1);
          hit(e, 16 * m, A, 3, 'primary', false, true);
          if (m > 1 && landed === 0) dnum(e.x, e.y + e.h + 0.5, e.z, amb || unaware ? 'AMBUSH' : 'BACKSTAB', 'crit');
          landed++;
        }
      }
      if (amb && landed) { P.ambush = 0; P.ambT = 0; sfx('slash'); }
    },
  },
  blight: {
    name: 'Blight Lob', range: 11, cd: 0.8,
    fire(dx, dz, t) {
      const n = 1 + st.multi, D = t ? Math.hypot(t.x - P.x, t.z - P.z) : 6.5 * st.range;
      for (let k = 0; k < n; k++) { const A = Math.atan2(dx, dz) + (k - (n - 1) / 2) * 0.3; lob(P.x + Math.sin(A) * D, t ? t.y : P.y, P.z + Math.cos(A) * D, 1.9 * st.area, 17, 'primary'); }
    },
  },
  stone: {
    name: 'Sling Stone', range: 13, cd: 0.3,
    fire(dx, dz, t) {
      const n = 1 + st.multi, dy = t ? (t.y + t.h * 0.5 - (P.y + 0.7)) / Math.max(1, Math.hypot(t.x - P.x, t.z - P.z)) : 0;
      for (let k = 0; k < n; k++) { const A = Math.atan2(dx, dz) + (k - (n - 1) / 2) * 0.16; shoot(P.x, P.y + 0.7, P.z, Math.sin(A), dy, Math.cos(A), 20 * st.shotSpd, 7, 0, 'primary', { col: 0xf4efe6, arc: true }); }
    },
  },
  darts: {
    name: 'Needle Darts', range: 12, cd: 0.34,
    fire(dx, dz, t) {
      const n = 3 + st.multi * 2, dy = t ? (t.y + t.h * 0.5 - (P.y + 0.7)) / Math.max(1, Math.hypot(t.x - P.x, t.z - P.z)) : 0;
      for (let k = 0; k < n; k++) { const A = Math.atan2(dx, dz) + (k - (n - 1) / 2) * 0.13; shoot(P.x, P.y + 0.7, P.z, Math.sin(A), dy, Math.cos(A), 26 * st.shotSpd, 4.5, 0, 'primary', { col: 0x9ad8ff, life: 0.6 }); }
    },
  },
  hex: {
    name: 'Hex Bolt', range: 13, cd: 0.5,
    fire(dx, dz) {
      const n = 1 + st.multi;
      for (let k = 0; k < n; k++) { const A = Math.atan2(dx, dz) + (k - (n - 1) / 2) * 0.3; shoot(P.x, P.y + 0.9, P.z, Math.sin(A), 0, Math.cos(A), 12 * st.shotSpd, 11, 0, 'primary', { homing: true, col: 0xb46cff, life: 1.5 }); }
    },
  },
};
