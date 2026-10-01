// Procedural animation for rat rigs (the player and nest-mate familiars):
// a distance-driven trot that breaks into a bounding gallop at a sprint,
// lifted feet, a spine that leans into turns, a tail that drags behind as a
// chain, a head that tracks threats, landing squash, idle fidgets (sniffing,
// grooming, scratching, rearing up to look around), a limp when badly hurt,
// hurt flinches and a victory rear-up after a boss falls.
import { clamp, angD, rand, pick } from '../core/util.js';

const TAU = Math.PI * 2;
export function newAnim() {
  return { gph: 0, gam: 0, lean: 0, pyaw: null, px: null, pz: null, ty: new Float32Array(16), tx: new Float32Array(16), sq: 0, sqv: 0, pvy: 0, wasGround: true, idleT: 0, act: null, actT: 0, actD: 1, hyaw: 0, hpitch: 0, hurt: 0, victory: 0, w: 0 };
}

const IDLES = ['sniff', 'groom', 'look', 'scratch', 'rear'];

/**
 * s: { x, y, z, onGround, vy, sprint, climbing, attacking (0..1), lookYaw
 *      (relative yaw to a threat or null), hurt01 (0 healthy .. 1 nearly
 *      dead), air (gliding), t }
 */
export function animateRat(rat, A, s, dt) {
  const t = s.t;
  if (A.px == null) { A.px = s.x; A.pz = s.z; A.pyaw = rat.g.rotation.y; }
  const step = Math.min(Math.hypot(s.x - A.px, s.z - A.pz), 1.5);
  A.px = s.x; A.pz = s.z;
  const sc = s.scale || 1, v = dt > 0 ? step / dt / sc : 0, stride = (s.sprint ? 1.7 : 1.05) * sc;
  if (s.onGround && !s.climbing) A.gph = (A.gph + step / stride * TAU) % (TAU * 1000);
  A.gam += (clamp(v / 5, 0, 1) * (s.onGround ? 1 : 0.2) - A.gam) * Math.min(1, dt * 10);
  const g = A.gam, gallop = s.sprint && g > 0.4;
  // Turning: lean into it, head leads it, tail swings out.
  const w = dt > 0 ? angD(rat.g.rotation.y, A.pyaw) / dt : 0;
  A.pyaw = rat.g.rotation.y;
  A.w += (w - A.w) * Math.min(1, dt * 8);
  A.lean += (clamp(-A.w * 0.05 * (0.3 + g), -0.35, 0.35) - A.lean) * Math.min(1, dt * 7);
  // Landing squash.
  if (s.onGround && !A.wasGround && A.pvy < -5) A.sqv -= Math.min(5, -A.pvy * 0.35);
  A.wasGround = s.onGround;
  A.pvy = s.vy;
  A.sqv += (-A.sq * 170 - A.sqv * 11) * dt;
  A.sq = clamp(A.sq + A.sqv * dt, -0.35, 0.3);
  A.hurt = Math.max(0, A.hurt - dt * 3);
  const limp = s.hurt01 > 0.7;

  // ---- legs ----
  rat.legs.forEach((l, i) => {
    const y0 = l.userData.y0 ?? (l.userData.y0 = l.position.y);
    if (s.climbing) { l.rotation.x = Math.sin(t * 18 + i * 1.6) * 0.9 - 1; l.position.y = y0; return; }
    if (!s.onGround) { l.rotation.x += ((i < 2 ? -0.7 : 0.75) - l.rotation.x) * Math.min(1, dt * 10); l.position.y = y0; return; }
    const off = gallop ? [0, 0.4, Math.PI, Math.PI + 0.4][i] : [0, Math.PI, Math.PI, 0][i], ph = A.gph + off;
    let sw = Math.sin(ph) * (gallop ? 1 : 0.72) * g;
    if (limp && i === 3) sw *= 0.3;
    l.rotation.x = sw;
    l.position.y = y0 + Math.max(0, -Math.cos(ph)) * (gallop ? 0.12 : 0.08) * g * (limp && i === 3 ? 0.3 : 1);
  });
  // ---- body ----
  const bob = s.onGround ? (gallop ? Math.abs(Math.sin(A.gph)) * 0.09 : Math.abs(Math.sin(A.gph)) * 0.045) * g : 0;
  rat.body.position.y = 0.52 + bob - (limp ? Math.max(0, Math.sin(A.gph + Math.PI)) * 0.04 * g : 0);
  rat.body.position.z = 0;
  rat.body.rotation.x = s.climbing ? -1.1 : s.onGround ? 0.06 * g + (gallop ? Math.sin(A.gph) * 0.14 : 0) : clamp(-s.vy * 0.02, -0.3, 0.25);
  rat.body.rotation.z = A.lean + (limp ? Math.sin(A.gph) * 0.07 * g : 0);
  rat.body.rotation.y = 0;
  // ---- head ----
  const look = s.lookYaw != null ? clamp(s.lookYaw, -0.75, 0.75) : 0;
  A.hyaw += (look + clamp(A.w * 0.06, -0.3, 0.3) - A.hyaw) * Math.min(1, dt * 7);
  rat.head.position.y = 0.78 + (s.onGround ? Math.sin(A.gph * 2) * 0.025 * g : 0.04) - (limp ? 0.05 : 0);
  rat.head.position.z = 0.66;
  rat.head.rotation.set(s.climbing ? -1 : (s.onGround ? 0 : 0.15) + (limp ? 0.12 : 0) - A.hurt * 0.5, A.hyaw, -A.lean * 0.5);
  rat.jaw.rotation.x = 0.22 + A.hurt * 0.5;
  // ---- tail: a lagging chain ----
  const n = rat.tail.length, sway = Math.sin(t * (2.6 + g * 5)) * (0.12 + g * 0.1) * (limp ? 0.5 : 1);
  A.ty[0] += (sway + clamp(A.w * 0.02, -0.25, 0.25) - A.ty[0]) * Math.min(1, dt * 12);
  A.tx[0] += ((s.onGround ? 0.2 + (gallop ? Math.sin(A.gph) * 0.1 : 0) : s.vy > 0 ? 0.35 : -0.05) - A.tx[0]) * Math.min(1, dt * 10);
  for (let i = 1; i < n; i++) {
    A.ty[i] += (A.ty[i - 1] * 0.85 - A.ty[i]) * Math.min(1, dt * (14 - i));
    A.tx[i] += ((s.onGround ? 0.08 : A.tx[i - 1] * 0.6) - A.tx[i]) * Math.min(1, dt * 9);
  }
  rat.tail.forEach((sg, i) => { sg.rotation.y = A.ty[i]; sg.rotation.x = A.tx[i]; });
  // ---- squash and stretch on the whole rat ----
  const sy = 1 + A.sq + (s.onGround ? 0 : clamp(s.vy * 0.012, -0.1, 0.13));
  rat.g.userData.sq = sy;

  // ---- idle fidgets ----
  if (g < 0.05 && s.onGround && !s.climbing && !s.attacking) A.idleT += dt;
  else { A.idleT = 0; A.act = null; }
  if (A.idleT > 2.2 && !A.act && Math.random() < dt * 0.9) { A.act = pick(IDLES); A.actT = 0; A.actD = A.act === 'rear' ? 2.2 : rand(1.2, 1.8); }
  if (A.act) {
    A.actT += dt;
    const u = A.actT / A.actD, env = Math.sin(clamp(u, 0, 1) * Math.PI);
    if (u >= 1) { A.act = null; A.idleT = 0.6; }
    else if (A.act === 'sniff') { rat.head.rotation.x = -0.35 * env + Math.sin(t * 32) * 0.05 * env; rat.head.position.z += 0.06 * env; }
    else if (A.act === 'groom') { rat.legs[0].rotation.x = -1.5 * env + Math.sin(t * 16) * 0.3 * env; rat.legs[1].rotation.x = -1.2 * env + Math.sin(t * 16 + 1) * 0.3 * env; rat.head.rotation.x = 0.35 * env; rat.head.rotation.z = 0.25 * env; rat.jaw.rotation.x = 0.22 + Math.abs(Math.sin(t * 16)) * 0.3 * env; }
    else if (A.act === 'look') { rat.head.rotation.y = Math.sin(u * TAU) * 0.85; rat.head.rotation.x = -0.15 * env; }
    else if (A.act === 'scratch') { rat.legs[3].rotation.x = (-1.1 + Math.sin(t * 42) * 0.35) * env; rat.body.rotation.z = 0.16 * env; rat.head.rotation.z = 0.3 * env; rat.head.rotation.x = 0.15 * env; }
    else if (A.act === 'rear') { rearUp(rat, env, t, false); }
  }
  if (A.victory > 0) { A.victory -= dt; rearUp(rat, Math.sin(clamp(1 - A.victory / 2.6, 0, 1) * Math.PI), t, true); }
}

/** Up on the hind legs: a lookout pose, or a roaring victory with paws up. */
function rearUp(rat, env, t, roar) {
  rat.body.rotation.x = -0.75 * env;
  rat.body.position.y += 0.2 * env;
  rat.body.position.z = -0.12 * env;
  rat.head.position.y += 0.42 * env;
  rat.head.position.z -= 0.28 * env;
  rat.head.rotation.x = (roar ? -0.45 : -0.2) * env;
  if (roar) rat.jaw.rotation.x = 0.22 + 0.9 * env;
  for (const i of [0, 1]) {
    const l = rat.legs[i];
    l.position.y = (l.userData.y0 ?? 0.42) + 0.35 * env;
    l.rotation.x = (roar ? -2.2 + Math.sin(t * 14 + i * Math.PI) * 0.5 : -1.0) * env;
  }
  rat.tail.forEach((s, i) => { s.rotation.x = (i ? -0.04 : -0.25) * env + s.rotation.x * (1 - env); });
}
