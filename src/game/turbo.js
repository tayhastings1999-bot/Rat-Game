// Turbo: a 3-segment meter filled by the damage you deal (Magic fills it
// faster). Hold X (or the touch Turbo button) and press Q or G for the turbo
// version of your special or signature: one segment, no cooldown, double
// damage and a wider radius for a moment. Tap X on its own for your class
// turbo blast, which spends every full segment and grows with how many.
import * as THREE from 'three';
import { rand, TAU } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { boom, fx, puff, spark, bolt, dnum, decal, PART_CAP } from '../fx/fx.js';
import { scene } from '../render/renderer.js';
import { flameTex } from '../render/textures.js';
import { CLASSES } from '../data/classes.js';
import { sfx } from '../audio/audio.js';
import { floorY, tileAt, solidFor } from '../world/grid.js';
import { near, hit, sorted } from '../combat/combat.js';
import { shoot } from '../combat/arsenal.js';
import { TUNE } from '../tuning.js';

export const segs = () => Math.floor(run.turbo || 0);

/** Damage dealt fills the meter (not by turbo moves themselves). */
export function turboGain(d) {
  if (G.state !== 'play' || !(d > 0)) return;
  const T = TUNE.turbo, was = segs();
  run.turbo = Math.min(T.segments, (run.turbo || 0) + d * T.gainPerDmg * (st.turboGain || 1));
  if (segs() > was) { sfx('pickup'); G.turboFlash = 0.6; }
}
function spend(n) {
  if (segs() < n) return false;
  run.turbo -= n;
  return true;
}

// ---------- input: X is a hold modifier, and a tap on its own ----------
// Tap X: the blast. Hold X and press Q or G: a turbo move. Hold X and let go
// without pressing anything: turbo stays armed for a moment (TUNE.turbo.armTime)
// so a touch player can let go of Turbo and then tap Special or Sig.
export function turboDown() {
  if (G.turboKey) return;
  G.turboKey = true;
  G.turboHeld = true;
  G.turboUsed = false;
  G.turboArmT = 0;
  G.turboT0 = G.time;
}
export function turboUp() {
  if (!G.turboKey) return;
  G.turboKey = false;
  if (G.turboUsed) { G.turboHeld = false; return; }
  if (G.time - G.turboT0 <= TUNE.turbo.tapTime) { G.turboHeld = false; turboBlast(); return; }
  G.turboArmT = TUNE.turbo.armTime;
}

/** Called by useSpecial / useSig while turbo is held or armed. Returns true if it handled the press. */
export function tryTurboMove(kind, fire) {
  if (!G.turboHeld || G.state !== 'play') return false;
  G.turboUsed = true;
  if (!G.turboKey) G.turboHeld = false; // an armed turbo is one press
  const cost = kind === 'sig' ? TUNE.turbo.sigCost : TUNE.turbo.specialCost;
  if (!spend(cost)) { dnum(P.x, P.y + 1.6, P.z, 'Turbo meter empty', 'info'); return true; }
  boostOn();
  const ok = fire();
  if (ok === false) { run.turbo += cost; return true; } // nothing in reach: refund
  dnum(P.x, P.y + 1.9, P.z, 'TURBO', 'crit');
  fx('ring', P.x, P.y, P.z, 3, col(), 0.35);
  turboFlair(false);
  sfx('perfect');
  run.turbos = (run.turbos || 0) + 1;
  return true;
}
/** The turbo window: 'special' hits deal TUNE.turbo.moveDmg × (combat.js) and radii grow. */
function boostOn() {
  if (!(P.turboT > 0)) { P.turboArea = TUNE.turbo.moveArea; st.area *= P.turboArea; }
  P.turboT = TUNE.turbo.window;
}
export function tickTurbo(dt) {
  G.turboFlash = Math.max(0, (G.turboFlash || 0) - dt);
  if (G.turboArmT > 0) { G.turboArmT -= dt; if (G.turboArmT <= 0 && !G.turboKey) G.turboHeld = false; }
  if (P.turboT > 0) {
    P.turboT -= dt;
    if (Math.random() < dt * 30) spark(P.x + rand(-0.4, 0.4), P.y + rand(0.2, 1), P.z + rand(-0.4, 0.4), 0.5, 0xffd040);
    if (P.turboT <= 0) { st.area /= P.turboArea || 1; P.turboArea = 1; }
  }
  // Blinded by smoke: the mark wears off.
  for (const e of W.enemies) if (e.smokeT > 0) e.smokeT -= dt;
}

// ---------- how turbo looks ----------
// While a turbo move is boosted the rat burns in its class colour (an aura); armed turbo glows faintly gold. Every turbo move and blast
// rears the rat up and throws a flourish of its own, and the screen flashes gold.
const auraMat = new THREE.SpriteMaterial({ map: flameTex, color: 0xffd040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const aura = new THREE.Sprite(auraMat);
aura.scale.setScalar(2.6);
const domeMat = new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, wireframe: true });
const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), domeMat);
// The class-coloured turning ground ring was removed: it read as a red disc under the hero and
// hid the player ring (review #4). The aura still shows turbo.
scene.add(aura, dome);
let domeT = 0;
export const turboAuraOpacity = () => auraMat.opacity;
const col = () => new THREE.Color((CLASSES[run.cls] && CLASSES[run.cls].rc) || '#ffd040').getHex();
/** Called every frame from sync.js once the rat is placed. */
export function syncTurboFx(dt) {
  const boosted = P.turboT > 0 && G.state !== 'menu', armed = !!G.turboHeld && G.state === 'play';
  const want = boosted ? 0.85 : armed ? 0.35 + 0.15 * Math.sin(G.time * 10) : 0;
  auraMat.opacity += (want - auraMat.opacity) * Math.min(1, dt * 12);
  auraMat.color.setHex(boosted ? col() : 0xffd040);
  aura.position.set(P.x, P.y + 0.6, P.z);
  aura.scale.setScalar(2.4 + 0.25 * Math.sin(G.time * 14));
  aura.visible = auraMat.opacity > 0.02;
  if (domeT > 0) { domeT -= dt; const u = 1 - domeT / 0.45; dome.position.set(P.x, P.y + 0.5, P.z); dome.scale.setScalar(1 + u * 4); domeMat.opacity = 0.5 * (1 - u); dome.visible = true; } else dome.visible = false;
}
const part = p => { if (W.parts.length >= PART_CAP) W.parts.shift(); W.parts.push(p); };
/** Each class's turbo flourish, at the rat. `big` for blasts. */
const FLOURISH = {
  brawler(big) { // the street cracks under it
    const y = floorY(P.x, P.z);
    for (let i = 0; i < (big ? 9 : 5); i++) { const a = i / (big ? 9 : 5) * TAU + rand(-0.2, 0.2), r = rand(1.2, big ? 4 : 2.6); decal(P.x + Math.sin(a) * r, y + 0.02, P.z + Math.cos(a) * r, rand(0.5, 1.1), 0x1a1410); }
    for (let i = 0; i < (big ? 24 : 12); i++) { const a = rand(0, TAU), v = rand(3, 7); part({ x: P.x, y: y + 0.2, z: P.z, vx: Math.sin(a) * v, vy: rand(4, 8), vz: Math.cos(a) * v, life: 0.9, c: 0x8a7a6a, s: rand(0.8, 1.4), b: true }); }
    G.shake = Math.max(G.shake, big ? 0.9 : 0.45);
  },
  plague(big) { // a column of rot
    for (let i = 0; i < (big ? 50 : 26); i++) { const a = rand(0, TAU), r = rand(0, 1.4); part({ x: P.x + Math.sin(a) * r, y: P.y + 0.2, z: P.z + Math.cos(a) * r, vx: Math.sin(a) * 0.6, vy: rand(3, big ? 9 : 6), vz: Math.cos(a) * 0.6, life: rand(0.8, 1.4), c: i % 3 ? 0x9be06a : 0x4a8a2a, s: rand(1, 1.8), ng: true }); }
  },
  slinger(big) { // a spiralling halo of stones
    const n = big ? 24 : 14;
    for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 1.2; part({ x: P.x + Math.sin(a) * r, y: P.y + 0.8, z: P.z + Math.cos(a) * r, vx: Math.cos(a) * 6 + Math.sin(a) * 2, vy: 0.5, vz: -Math.sin(a) * 6 + Math.cos(a) * 2, life: 0.6, c: 0xf2d090, s: 1.1, ng: true }); }
  },
  warlock(big) { // runes underfoot and lightning from above
    fx('ring', P.x, P.y, P.z, 2.2, 0xb46cff, 0.6, G.time);
    fx('ring', P.x, P.y, P.z, 3.4, 0xc080ff, 0.8, -G.time);
    for (let i = 0; i < (big ? 4 : 2); i++) { const a = rand(0, TAU), r = rand(1, 3); bolt([[P.x + Math.sin(a) * r, P.y + 9, P.z + Math.cos(a) * r], [P.x + Math.sin(a) * r * 0.5, P.y + 4, P.z + Math.cos(a) * r * 0.5], [P.x, P.y + 0.6, P.z]]); }
  },
  tank() { domeT = 0.45; }, // a shell of light bursts outward
  sneak(big) { // afterimages trail behind
    for (let i = 1; i <= (big ? 6 : 4); i++) { const x = P.x - Math.sin(P.facing) * i * 0.6, z = P.z - Math.cos(P.facing) * i * 0.6; puff(x, P.y + 0.5, z, 0x1a2a22, 5, 1); spark(x, P.y + 0.7, z, 0.6, 0x5ad0a0); }
  },
  roof(big) { // feathers spiral up
    for (let i = 0; i < (big ? 36 : 20); i++) { const a = i * 0.55, r = 0.6 + i * 0.04; part({ x: P.x + Math.sin(a) * r, y: P.y + 0.2 + i * 0.05, z: P.z + Math.cos(a) * r, vx: Math.cos(a) * 2.5, vy: rand(3, 6), vz: -Math.sin(a) * 2.5, life: 1, c: i % 2 ? 0x9ad8ff : 0xe8f4ff, s: 0.9, ng: true }); }
  },
};
/** The shared turbo moment: pose, flourish, flash. */
export function turboFlair(big) {
  if (!P.sig) P.sig = { kind: 'turbo', t: 0.35, dur: 0.35 }; // a signature's own pose wins
  const f = FLOURISH[run.cls];
  if (f) f(big);
  G.flashGold = Math.max(G.flashGold || 0, big ? 0.9 : 0.5);
}

// ---------- the class turbo blasts (X) ----------
const later = (ms, f) => setTimeout(() => { if (G.state === 'play') f(); }, ms);
const ring = (R, col) => { fx('ring', P.x, P.y, P.z, R, col, 0.5); boom(P.x, P.y + 0.5, P.z, R * 1.3, col); };
const foes = R => sorted(R).filter(e => !e.disguise && e.type !== 'nest');

export const BLASTS = {
  brawler: {
    name: 'Knuckle Quake', desc: 'Slam the street: a shockwave that flattens and stuns everything around you.',
    use(m) {
      const R = 6.5 * st.area;
      for (const e of near(P.x, P.y, P.z, R)) { hit(e, 70 * m, Math.atan2(e.x - P.x, e.z - P.z), 22, 'turbo'); e.stun = Math.max(e.stun || 0, e.boss ? 0.4 : 1.2); }
      ring(R, 0xff9a5a); later(120, () => fx('ring', P.x, P.y, P.z, R * 1.3, 0xffd040, 0.4));
      G.shake = 0.8;
    },
  },
  plague: {
    name: 'Plague Tide', desc: 'A rolling wave of blight that poisons everything in a wide circle.',
    use(m) {
      const R = 9 * st.area;
      for (const e of near(P.x, P.y, P.z, R)) { hit(e, 40 * m, Math.atan2(e.x - P.x, e.z - P.z), 8, 'turbo'); e.pT = Math.max(e.pT || 0, 6); e.pD = Math.max(e.pD || 0, 8 * m); }
      ring(R, 0x9be06a);
      puff(P.x, P.y + 0.4, P.z, 0x9be06a, 40, 8);
      G.shake = 0.4;
    },
  },
  slinger: {
    name: 'Stone Storm', desc: 'Three rings of piercing stones, one after another.',
    use(m) {
      for (let w = 0; w < 3; w++) later(w * 140, () => { for (let i = 0; i < 24; i++) { const a = (i + w * 0.33) / 24 * TAU; shoot(P.x, P.y + 0.7, P.z, Math.sin(a), 0, Math.cos(a), 24, 26 * m, 3, 'turbo', { col: 0xffd070 }); } });
      ring(4, 0xffd070);
    },
  },
  warlock: {
    name: 'Hex Storm', desc: 'Lightning leaps from you to up to eight enemies, and marks them to burst.',
    use(m) {
      const ts = foes(14).slice(0, 8);
      if (!ts.length) { ring(5, 0xb46cff); return; }
      ts.forEach((e, i) => later(i * 60, () => { if (e.dead) return; bolt([[P.x, P.y + 1, P.z], [e.x, e.y + e.h * 0.6, e.z]]); hit(e, 60 * m, null, 4, 'turbo'); e.hexT = Math.max(e.hexT || 0, 1.5); }));
      ring(5, 0xb46cff);
      sfx('zap');
    },
  },
  tank: {
    name: 'Iron Wall', desc: 'A long Bulwark and a shove that throws back everything around you.',
    use(m) {
      P.bulwark = Math.max(P.bulwark || 0, 3 + m);
      const R = 5 * st.area;
      for (const e of near(P.x, P.y, P.z, R)) hit(e, 40 * m, Math.atan2(e.x - P.x, e.z - P.z), 26, 'turbo');
      ring(R, 0xffb070);
      G.shake = 0.5;
    },
  },
  sneak: {
    name: 'Thousand Cuts', desc: 'Flicker from enemy to enemy, stabbing each one in the back.',
    use(m, n) {
      const ts = foes(12).slice(0, 2 + n);
      P.inv = Math.max(P.inv, 0.25 + ts.length * 0.12);
      ts.forEach((e, i) => later(i * 110, () => {
        if (e.dead) return;
        const a = (e.ang || 0) + Math.PI, x = e.x + Math.sin(a) * 1.2, z = e.z + Math.cos(a) * 1.2;
        if (!solidFor(tileAt(x, z), false) && Math.abs(floorY(x, z) - e.y) < 1) { puff(P.x, P.y + 0.5, P.z, 0x1a1a22, 8, 2); P.x = x; P.z = z; P.y = Math.max(floorY(x, z), e.y); P.vx = P.vz = 0; }
        P.facing = Math.atan2(e.x - P.x, e.z - P.z);
        hit(e, 45 * m * TUNE.sneak.backstab, P.facing, 6, 'turbo');
        dnum(e.x, e.y + e.h + 0.5, e.z, 'BACKSTAB', 'crit');
      }));
      ring(3, 0x5ad0a0);
    },
  },
  roof: {
    name: 'Sky Rain', desc: 'A storm of darts falls on everything around you.',
    use(m, n) {
      const ts = foes(10), k = 6 + n * 6;
      for (let i = 0; i < k; i++) later(i * 55, () => {
        const t = ts.length ? ts[i % ts.length] : null, x = t && !t.dead ? t.x + rand(-0.8, 0.8) : P.x + rand(-7, 7), z = t && !t.dead ? t.z + rand(-0.8, 0.8) : P.z + rand(-7, 7), y = floorY(x, z);
        for (const e of near(x, y, z, 1.8)) hit(e, 30 * m, null, 4, 'turbo', true);
        boom(x, y + 0.3, z, 1.6, 0x9ad8ff);
        spark(x, y + 2, z, 0.8, 0x9ad8ff);
      });
      ring(8, 0x9ad8ff);
    },
  },
};

export function turboBlast() {
  if (G.state !== 'play') return;
  const B = BLASTS[run.cls], T = TUNE.turbo, n = segs();
  if (!B) return;
  if (n < T.blastMin) { dnum(P.x, P.y + 1.6, P.z, 'Turbo meter empty', 'info'); return; }
  run.turbo -= n;
  const m = T.blastBase + T.blastPerSeg * (n - 1);
  P.sig = null;
  turboFlair(true);
  B.use(m, n);
  dnum(P.x, P.y + 2, P.z, `${B.name.toUpperCase()} ×${n}`, 'crit');
  sfx('boss');
  G.hitStop = Math.max(G.hitStop, 0.06);
  run.blasts = (run.blasts || 0) + 1;
}
