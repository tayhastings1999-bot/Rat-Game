// Volatile junk: rummaging bins, and the running effects (and curses) of
// each piece: electric trails and arcs, bleed stacks, the lead-sinker slam.
import { pick, rand, keep } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { spark, puff, boom, fx, dnum, bolt } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { hit, hurtP, aoe, scrapDrop, addThreat } from '../combat/combat.js';
import { chain } from '../combat/arsenal.js';
import { spawnEnemy } from '../entities/mobs.js';
import { JUNK } from '../data/items.js';
import { banner, renderSlots } from '../ui/hud.js';
import { contract } from './contracts.js';

export function giveJunk(id) {
  const pool = Object.keys(JUNK).filter(k => !run.junk.includes(k));
  if (!id) id = pool.length ? pick(pool) : null;
  if (!id) return false;
  const J = JUNK[id];
  run.junk.push(id);
  J.ap();
  banner('Junk · ' + J.name, J.up + ' — but ' + J.dn.toLowerCase());
  sfx('curse');
  fx('ring', P.x, P.y, P.z, 4, J.col, 0.6);
  addThreat(0.6);
  renderSlots();
  return true;
}

/** Dig through a dumpster, bin or sewer heap. Once each. */
export function rummage(b) {
  b.done = true;
  contract('bins');
  if (b.lid) b.lid.rotation.x = -1.2;
  puff(b.x, b.y + 1, b.z, 0x6a6258, 12, 2.5);
  sfx('chew');
  const r = Math.random(), junkP = b.kind === 'heap' ? 0.45 : 0.3;
  if (r < junkP && giveJunk()) return;
  if (r < junkP + 0.25) { for (let i = 0; i < 5; i++) scrapDrop(b.x, b.y + 0.5, b.z); dnum(P.x, P.y + 1.6, P.z, 'Salvage', 'info'); return; }
  if (r < junkP + 0.45) { const h = Math.round(st.maxHp * 0.12 * st.foodMul * st.healMul); run.hp = Math.min(st.maxHp, run.hp + h); dnum(P.x, P.y + 1.6, P.z, 'Scraps +' + h, 'heal'); return; }
  if (r < junkP + 0.6) { for (let i = 0; i < 3; i++) spawnEnemy('roach', b.x + rand(-1, 1), b.z + rand(-1, 1), { pack: 1, plain: true }); dnum(P.x, P.y + 1.6, P.z, 'Something lives in there', 'info'); return; }
  dnum(P.x, P.y + 1.6, P.z, 'Just trash', 'info');
}

/** Called from hit() for every landed player hit. */
export function junkHit(e, d, src) {
  if (src === 'dot' || src === 'volt' || src === 'swarm') return;
  if (st.bleed) { e.bleed = Math.min(8, (e.bleed || 0) + 1); e.bleedT = 3; }
  if (st.volt && Math.random() < 0.2) chain(e, 2, Math.max(6, d * 0.4), 'volt', [e.x, e.y + e.h * 0.6, e.z], true);
}

/** The sinker replaces Q: hop, then drive into the ground. Returns true if it handled Q. */
export function sinkerSlam() {
  if (!st.sinker) return false;
  if (P.onGround) { P.vy = 9; P.onGround = false; P.jumping = false; P.cut = true; }
  else P.vy = Math.min(P.vy, -18);
  P.vx *= 0.3; P.vz *= 0.3;
  P.slam = 'sinker';
  P.lock = 0.6;
  return true;
}
export function sinkerLand() {
  const R = 6.5 * st.area;
  aoe(P.x, P.y, P.z, R, 110, 18, 'special', 0.5, true);
  boom(P.x, P.y + 0.5, P.z, R * 1.5, 0x9a9aa8);
  fx('ring', P.x, P.y, P.z, R, 0xc8c8d8, 0.55);
  fx('ring', P.x, P.y, P.z, R * 0.6, 0xffffff, 0.35);
  G.shake = Math.max(G.shake, 1);
  G.hitStop = Math.max(G.hitStop, 0.06);
  puff(P.x, P.y + 0.2, P.z, 0x8a8278, 30, 7);
  sfx('boom');
}

let trailT = 0, trailTick = 0;
export function tickJunk(dt) {
  // Bleed: 2 damage a second per stack, stacks fall off after 3s without a fresh cut.
  if (st.bleed) for (const e of W.enemies) {
    if (!e.bleed || e.dead) continue;
    e.bleedT -= dt;
    e.bleedAcc = (e.bleedAcc || 0) + e.bleed * 2 * dt;
    if (e.bleedAcc >= 3) { hit(e, e.bleedAcc, null, 0, 'dot', true); e.bleedAcc = 0; if (Math.random() < 0.3) puff(e.x, e.y + e.h * 0.5, e.z, 0xa01a1a, 2, 1); }
    if (e.bleedT <= 0) e.bleed = 0;
  }
  if (!st.volt) return;
  // Electric trail from rolls.
  if (P.roll > 0 && (trailT -= dt) <= 0) { trailT = 0.06; W.volt.push({ x: P.x, y: P.y, z: P.z, t: 1.6 }); spark(P.x, P.y + 0.2, P.z, 0.8, 0xe8f0ff); }
  if ((trailTick -= dt) <= 0) {
    trailTick = 0.25;
    for (const v of W.volt) { aoe(v.x, v.y, v.z, 1.3, 6, 0, 'volt'); if (Math.random() < 0.35) spark(v.x, v.y + 0.15, v.z, 0.6, 0xc8e0ff); }
    if (W.volt.length > 1 && Math.random() < 0.5) { const a = W.volt[(Math.random() * W.volt.length) | 0], b = W.volt[(Math.random() * W.volt.length) | 0]; bolt([[a.x, a.y + 0.2, a.z], [b.x, b.y + 0.2, b.z]]); }
  }
  for (const v of W.volt) v.t -= dt;
  keep(W.volt, v => v.t > 0);
  // Curse: it shorts out if you stand still.
  const still = Math.hypot(P.vx, P.vz) < 0.4 && P.roll <= 0 && G.state === 'play';
  run.stillT = still ? (run.stillT || 0) + dt : 0;
  if (run.stillT > 2) {
    run.stillT = 0;
    hurtP(Math.max(1, st.maxHp * 0.05), null, true);
    spark(P.x, P.y + 0.6, P.z, 1.4, 0xe8f040);
    dnum(P.x, P.y + 1.6, P.z, 'Shorted out', 'info');
  }
}
