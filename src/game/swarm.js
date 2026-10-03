// Swarm combo: hits and kills fill a fast-draining combo meter; taking a hit
// empties it. A full meter unlocks the territorial shriek, which summons
// nest-mates that swarm enemies, stagger bosses and chew through barricades.
import { rand, TAU } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { fx, puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, gi, toG, floorY, collideBody } from '../world/grid.js';
import { hit } from '../combat/combat.js';
import { openTile } from '../entities/player.js';
import { banner } from '../ui/hud.js';
import { contract } from './contracts.js';
import { scatterBirds } from '../entities/roles.js';

export const COMBO_MAX = 100;
const SWARM_N = 8, SWARM_LIFE = 10;

export function comboGain(v) {
  if (G.state !== 'play' || G.mode === 'trial') return;
  run.combo = Math.min(COMBO_MAX, (run.combo || 0) + v * (st.comboMul || 1));
  run.comboT = 0;
  if (run.combo >= COMBO_MAX && !run.shriekReady) {
    run.shriekReady = true;
    run.shriekT = 8;
    banner('Shriek ready', G.touch ? 'Tap SHRIEK to call the nest' : 'Press X to call the nest');
    sfx('key');
  }
}
/** Getting hurt breaks the combo (and a charged shriek). */
export function comboBreak() {
  run.combo = 0;
  run.shriekReady = false;
}
export function comboTick(dt) {
  run.comboT = (run.comboT || 0) + dt;
  if (run.shriekReady) { run.shriekT -= dt; if (run.shriekT <= 0) run.shriekReady = false; return; }
  if (run.comboT > 1) run.combo = Math.max(0, (run.combo || 0) - (25 + (run.combo || 0) * 0.4) * dt);
}

export function shriek() {
  if (!run.shriekReady || G.state !== 'play') return;
  run.shriekReady = false;
  run.combo = 0;
  contract('shriek');
  sfx('shriek');
  G.shake = Math.max(G.shake, 0.5);
  for (let i = 0; i < 3; i++) fx('ring', P.x, P.y, P.z, 6 + i * 5, 0xffd040, 0.5 + i * 0.15);
  banner('The nest answers', scatterBirds() ? 'The birds scatter' : '');
  const n = SWARM_N + (st.swarmPlus || 0);
  // At most two shrieks' worth of nest-mates: a new shriek sends the oldest home.
  // Without a cap, late-game combos stacked 300+ of them (found profiling the lag).
  const over = W.swarm.length + n - n * 2;
  if (over > 0) {
    W.swarm.sort((a, b) => a.life - b.life);
    for (const s of W.swarm.splice(0, over)) puff(s.x, s.y + 0.3, s.z, 0x8a8478, 3, 2);
  }
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, r = rand(1, 2.5);
    const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    W.swarm.push({ x, z, y: floorY(x, z), vx: 0, vy: 0, vz: 0, r: 0.3, h: 0.5, ang: a, life: SWARM_LIFE, bite: 0, retarget: 0, tgt: null, ph: rand(0, 6) });
    puff(x, P.y + 0.3, z, 0x8a8478, 4, 2);
  }
  // Stagger any boss close enough to hear it.
  for (const e of W.enemies) {
    if (!e.boss || e.dead || Math.hypot(e.x - P.x, e.z - P.z) > 26) continue;
    e.stun = 1.8;
    e.st = 'move';
    e.seq.length = 0;
    e.invuln = 0;
    dnum(e.x, e.y + e.h + 1, e.z, 'STAGGERED', 'crit');
  }
  // Chew through nearby barricades (boards, drywall, cracked walls).
  const cx = toG(P.x), cz = toG(P.z);
  for (let gz = cz - 3; gz <= cz + 3; gz++) for (let gx = cx - 3; gx <= cx + 3; gx++) {
    if (gx < 0 || gz < 0 || gx >= M.W || gz >= M.H) continue;
    if (M.grid[gi(gx, gz)] === 3) openTile(gx, gz);
  }
}

export function tickSwarm(dt) {
  for (const s of W.swarm) {
    s.life -= dt;
    s.retarget -= dt;
    s.bite -= dt;
    if (s.retarget <= 0 || !s.tgt || s.tgt.dead) {
      s.retarget = 0.3;
      let b = null, bd = 22 * 22;
      for (const e of W.enemies) {
        if (e.dead || e.hidden || (e.pred && e.mode === 'patrol')) continue;
        const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2;
        if (d < bd) { bd = d; b = e; }
      }
      s.tgt = b;
    }
    let tx = P.x + Math.sin(s.ph + G.time) * 2, tz = P.z + Math.cos(s.ph + G.time) * 2;
    if (s.tgt) { tx = s.tgt.x; tz = s.tgt.z; }
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz) || 1;
    const sp = d > 1 ? 11 : 0;
    s.vx += (dx / d * sp - s.vx) * Math.min(1, 10 * dt);
    s.vz += (dz / d * sp - s.vz) * Math.min(1, 10 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const py = s.y;
    s.vy -= 32 * dt;
    s.y += s.vy * dt;
    const g = collideBody(s, py, s.r, s.h, false);
    if (g && s.hw && s.tgt && s.tgt.y > s.y + 0.5) s.vy = 9; // scramble up after climbers
    s.ang = Math.atan2(s.vx, s.vz);
    if (s.tgt && d < s.tgt.r + 0.7 && Math.abs(s.tgt.y - s.y) < s.tgt.h + 1 && s.bite <= 0) {
      s.bite = 0.35;
      hit(s.tgt, (8 + run.level * 0.8) * (1 + 0.1 * (st.dmg - 1)), s.ang, 2, 'swarm', true);
      if (s.tgt.boss && Math.random() < 0.1) s.tgt.stun = Math.max(s.tgt.stun || 0, 0.4);
    }
    if (s.life <= 0) puff(s.x, s.y + 0.3, s.z, 0x8a8478, 5, 2);
  }
  if (W.swarm.some(s => s.life <= 0)) W.swarm = W.swarm.filter(s => s.life > 0);
}

