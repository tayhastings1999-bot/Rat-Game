// Boss brains. Every boss watches how you fight and adapts:
//  - it learns your preferred range, which way you circle and which way you
//    dodge-roll, and whether you're camping in one spot;
//  - it aims where you'll be (a real intercept, nudged toward your dodge side);
//  - it picks attacks that counter your style (gap-closers against kiters,
//    shoves and backsteps against huggers, punishes for standing still);
//  - it sidesteps your projectiles.
// Balance: an aggression budget forces recovery windows where the boss is
// EXPOSED (+25% damage taken), sustained damage breaks its poise into a
// stagger, and it eases off a little when you're nearly dead.
import { rand, clamp } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { dnum, puff } from '../fx/fx.js';

const EMA = (a, b, k) => a + (b - a) * k;

export function brainOf(e) {
  if (!e.brain) e.brain = { range: 8, strafe: 0, roll: 0, still: 0, budget: 8, poise: 0, stagger: 0, exposed: 0, dodgeCd: 1.5, staggerCd: 0, rolled: 0, lastRoll: 0 };
  return e.brain;
}
const mercy = () => run.hp < st.maxHp * 0.25;

/** Watch the rat for one frame. */
export function think(e, dt) {
  const b = brainOf(e), dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  const k = Math.min(1, dt * 0.6);
  b.range = EMA(b.range, d, k);
  // Lateral velocity around the boss: + = counter-clockwise from its view.
  const lat = (P.vx * dz - P.vz * dx) / d;
  if (Math.abs(lat) > 1) b.strafe = EMA(b.strafe, Math.sign(lat), Math.min(1, dt * 1.2));
  // Dodge tendency: which way the rat rolls when it rolls.
  if (P.roll > 0 && G.time - b.lastRoll > 0.4) {
    b.lastRoll = G.time;
    const rl = (P.rdx * dz - P.rdz * dx) / d;
    b.roll = EMA(b.roll, Math.sign(rl) || 0, 0.35);
    b.rolled = G.time;
  }
  b.still = Math.hypot(P.vx, P.vz) < 1.2 ? b.still + dt : 0;
  // Aggression budget and recovery.
  b.budget = Math.min(12, b.budget + dt * (2.4 + 0.5 * (e.phase - 1)) * (mercy() ? 0.7 : 1));
  b.poise = Math.max(0, b.poise - b.poise * dt / 3);
  b.dodgeCd -= dt;
  b.staggerCd -= dt;
  if (b.stagger > 0) b.stagger -= dt;
  if (b.exposed > 0) b.exposed -= dt;
}

/** Where the rat will be when something moving at `spd` arrives (plus the dodge the boss expects). */
export function lead(e, spd, bias = 0.6) {
  const b = brainOf(e), rx = P.x - e.x, rz = P.z - e.z;
  // Solve |r + v t| = spd t for the intercept time.
  const vv = P.vx * P.vx + P.vz * P.vz, a = vv - spd * spd, bq = 2 * (rx * P.vx + rz * P.vz), c = rx * rx + rz * rz;
  let t = Math.sqrt(c) / Math.max(1, spd);
  if (Math.abs(a) > 1e-3) { const disc = bq * bq - 4 * a * c; if (disc >= 0) { const s = Math.sqrt(disc), t1 = (-bq - s) / (2 * a), t2 = (-bq + s) / (2 * a), tt = Math.min(...[t1, t2].filter(x => x > 0)); if (isFinite(tt)) t = tt; } }
  t = clamp(t, 0.05, 1.6);
  let x = P.x + P.vx * t, z = P.z + P.vz * t;
  // Lean toward the side the rat usually dodges to.
  const d = Math.hypot(rx, rz) || 1, side = b.roll * bias * Math.min(2.5, t * 4);
  x += (-rz / d) * side; z += (rx / d) * side;
  return { x, z, t };
}

/** How attractive an attack is right now, given how the rat is fighting. */
export function weigh(e, a) {
  const b = brainOf(e);
  let m = 1;
  if (a.tag === 'gap') m *= b.range > 8 ? 2.2 : b.range < 4 ? 0.5 : 1;
  if (a.tag === 'zone') m *= b.range > 8 ? 1.5 : 1;
  if (a.tag === 'close') m *= b.range < 5 ? 2.4 : 0.6;
  if (a.tag === 'punish') m *= b.still > 1.2 ? 3 : 0.8;
  if (a.tag === 'summon') m *= b.range > 10 ? 1.4 : 1;
  if (mercy() && a.big) m *= 0.6;
  return m;
}
export const canAfford = (e, cost) => brainOf(e).budget >= cost;
export function spend(e, cost) { const b = brainOf(e); b.budget -= cost; if (b.budget < 2) { b.exposed = Math.max(b.exposed, 1.6); dnum(e.x, e.y + e.h + 1, e.z, 'EXPOSED', 'crit'); } }

/** Damage into the boss: exposed bosses take more; enough in a short burst breaks their poise. */
export function onBossHit(e, d) {
  const b = brainOf(e);
  b.poise += d;
  if (b.staggerCd <= 0 && b.poise > e.maxHp * 0.06 && !e.invuln) {
    b.poise = 0;
    b.stagger = 1.6;
    b.exposed = Math.max(b.exposed, 1.6);
    b.staggerCd = 7;
    e.seq.length = 0;
    e.st = 'move';
    dnum(e.x, e.y + e.h + 1, e.z, 'STAGGERED', 'crit');
    puff(e.x, e.y + e.h, e.z, 0xffe070, 10, 3);
  }
  return b.exposed > 0 ? 1.25 : 1;
}

/** Duck an incoming projectile: a quick sideways hop. Returns true if it moved. */
export function trySidestep(e) {
  const b = brainOf(e);
  if (b.dodgeCd > 0 || e.st !== 'move' || b.stagger > 0) return false;
  for (const p of W.pproj) {
    const rx = e.x - p.x, rz = e.z - p.z, dd = Math.hypot(rx, rz);
    if (dd > 6 || dd < 1) continue;
    const sp = Math.hypot(p.vx, p.vz) || 1, toward = (rx * p.vx + rz * p.vz) / (dd * sp);
    if (toward < 0.9) continue;
    // Ranged rats get read more often; the chance climbs with phase.
    const chance = (b.range > 7 ? 0.45 : 0.2) + 0.1 * (e.phase - 1);
    b.dodgeCd = mercy() ? 3.2 : 2.2;
    if (Math.random() > chance) return false;
    const s = Math.random() < 0.5 ? 1 : -1, px = -p.vz / sp * s, pz = p.vx / sp * s, pow = e.fly ? 16 : 13;
    e.kx += px * pow; e.kz += pz * pow;
    puff(e.x, e.y + 0.3, e.z, 0x9a8a7a, 5, 2);
    return true;
  }
  return false;
}

/** A random point on the far side of the rat from the boss, to flank it. */
export function flankPoint(e, dist = 4) {
  const f = Math.atan2(P.wx || Math.sin(P.facing), P.wz || Math.cos(P.facing)) + Math.PI + rand(-0.5, 0.5);
  return { x: P.x + Math.sin(f) * dist, z: P.z + Math.cos(f) * dist };
}
