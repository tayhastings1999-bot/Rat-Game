// Class signature moves (G / the Sig button): one move per class that no
// other class has, each with its own animation (P.sig drives the pose in sync.js).
//   Slinger   Ricochet     — a heavy stone that banks off walls four times.
//   Warlock   Hex Marks    — mark up to five mobs ahead; the marks detonate.
//   Tank      Shield Parry — brace: the next hit is blocked, stuns and reflects.
//   Sneak     Shadowstep   — vanish and reappear behind a mob, facing its back.
import { rand, angD } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { puff, spark, boom, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { floorY, tileAt, solidFor } from '../world/grid.js';
import { hit, aoe, near, nearest } from '../combat/combat.js';
import { shoot } from '../combat/arsenal.js';
import { tryTurboMove } from './turbo.js';

const anim = (kind, dur) => { P.sig = { kind, t: dur, dur }; };

export const SIGS = {
  slinger: {
    name: 'Ricochet', cd: 4.5, desc: 'A heavy stone that pierces and banks off walls four times.',
    use() {
      const t = G.lockOn && !G.lockOn.dead ? G.lockOn : nearest(18), a = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.facing;
      shoot(P.x, P.y + 0.6, P.z, Math.sin(a), 0, Math.cos(a), 26, 38 * st.dmg, 6, 'special', { col: 0xffd070, life: 1.6, bounce: 4, size: 1.6 });
      anim('sling', 0.35);
      sfx('shoot');
      return true;
    },
  },
  warlock: {
    name: 'Hex Marks', cd: 7, desc: 'Mark up to five mobs ahead of you. The marks detonate two seconds later.',
    use() {
      const marks = W.enemies.filter(e => !e.dead && !e.hidden && !e.disguise && e.type !== 'nest' && Math.hypot(e.x - P.x, e.z - P.z) < 13)
        .sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).slice(0, 5);
      anim('cast', 0.55);
      sfx('curse');
      for (const e of marks) { e.hexT = 2; spark(e.x, e.y + e.h, e.z, 1, 0xc080ff); }
      if (!marks.length) dnum(P.x, P.y + 1.6, P.z, 'No one to curse', 'info');
      return true;
    },
  },
  tank: {
    name: 'Shield Parry', cd: 5, desc: 'Brace for half a second: the next hit is blocked, its attacker stunned and its shots thrown back.',
    use() {
      P.parry = 0.5;
      anim('brace', 0.5);
      sfx('clank');
      // A short shove on the way in.
      for (const e of near(P.x, P.y, P.z, 2.4)) if (Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), P.facing)) < 1.1) hit(e, 14, Math.atan2(e.x - P.x, e.z - P.z), 10, 'special');
      return true;
    },
  },
  sneak: {
    name: 'Shadowstep', cd: 6, desc: 'Vanish and reappear behind the nearest mob, facing its back for a backstab.',
    use() {
      const t = nearest(11);
      if (!t || t.boss && t.fly) return false;
      // Behind it if there's room, otherwise the nearest free side.
      let spot = null;
      for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
        for (const r of [1.6, 1.2, 2.2]) {
          const a = t.ang + Math.PI + off, x = t.x + Math.sin(a) * r, z = t.z + Math.cos(a) * r;
          if (solidFor(tileAt(x, z), false) || Math.abs(floorY(x, z) - t.y) > 1) continue;
          spot = { x, z };
          break;
        }
        if (spot) break;
      }
      if (!spot) return false;
      puff(P.x, P.y + 0.5, P.z, 0x1a1a22, 14, 2.5);
      P.x = spot.x; P.z = spot.z; P.y = Math.max(floorY(spot.x, spot.z), t.y); P.vx = P.vz = P.vy = 0;
      P.facing = Math.atan2(t.x - P.x, t.z - P.z);
      P.inv = Math.max(P.inv, 0.3);
      puff(P.x, P.y + 0.5, P.z, 0x1a1a22, 14, 2.5);
      anim('step', 0.35);
      sfx('roll');
      return true;
    },
  },
};

export function useSig() {
  if (G.state !== 'play' || P.squeeze) return;
  const S = SIGS[run.cls];
  if (!S) return;
  if (tryTurboMove('sig', () => S.use())) return; // X held: the turbo version, no cooldown
  if (run.sigT > 0) return;
  if (S.use() === false) { dnum(P.x, P.y + 1.6, P.z, 'Nothing in reach', 'info'); run.sigT = 0.4; return; }
  run.sigT = S.cd * st.cd;
  run.sigs = (run.sigs || 0) + 1;
}

export function tickSig(dt) {
  run.sigT = (run.sigT || 0) - dt;
  if (P.sig) { P.sig.t -= dt; if (P.sig.t <= 0) P.sig = null; }
  P.parry = (P.parry || 0) - dt;
  // Hex marks tick down and detonate.
  for (const e of W.enemies) {
    if (!(e.hexT > 0)) continue;
    e.hexT -= dt;
    if (e.hexT > 0 && !e.dead) continue;
    e.hexT = 0;
    boom(e.x, e.y + e.h * 0.5, e.z, 3, 0xb46cff);
    sfx('zap');
    aoe(e.x, e.y, e.z, 2.6, 42 + (e.dead ? 0 : e.maxHp * 0.1 / Math.max(1, st.dmg)), 6, 'special');
  }
}

/** Tank parry: returns true if the hit was parried. */
export function tryParry(from) {
  if (!(P.parry > 0)) return false;
  P.parry = 0;
  sfx('clank');
  sfx('perfect');
  G.hitStop = Math.max(G.hitStop, 0.08);
  spark(P.x + Math.sin(P.facing) * 0.7, P.y + 0.7, P.z + Math.cos(P.facing) * 0.7, 1.6, 0xffe0a0);
  dnum(P.x, P.y + 1.8, P.z, 'PARRIED', 'crit');
  if (from && from.hp != null && !from.dead) { from.stun = from.boss ? 0.8 : 1.6; hit(from, 40, Math.atan2(from.x - P.x, from.z - P.z), from.boss ? 0 : 14, 'special'); }
  // Throw back every enemy shot close by.
  for (const p of W.eproj) {
    if (Math.hypot(p.x - P.x, p.z - P.z) > 3.5) continue;
    p.life = 0;
    const a = Math.atan2(-p.vx, -p.vz) + rand(-0.1, 0.1);
    shoot(p.x, p.y, p.z, Math.sin(a), 0, Math.cos(a), 22, Math.max(20, p.dmg * 2.5), 2, 'special', { col: 0xffe0a0, life: 1 });
  }
  run.parries = (run.parries || 0) + 1;
  return true;
}

/** Pose overlay for the signature move (called from animate in sync.js). */
export function sigPose(rat) {
  const s = P.sig;
  if (!s) return;
  const u = 1 - s.t / s.dur, env = Math.sin(Math.min(1, u) * Math.PI);
  const L = rat.legs;
  switch (s.kind) {
    case 'sling': L[1].rotation.x = u < 0.4 ? -2.6 * (u / 0.4) : -2.6 + 3.4 * ((u - 0.4) / 0.6); rat.body.rotation.y = 0.35 * env; break;
    case 'cast': rat.body.rotation.x = -0.4 * env; L[1].rotation.x = -2.2 * env; L[0].rotation.x = -1.2 * env; rat.head.rotation.x = -0.3 * env; break;
    case 'brace': rat.body.position.y -= 0.12 * env; rat.head.position.y -= 0.12 * env; rat.head.rotation.x = 0.35 * env; L[0].rotation.x = L[1].rotation.x = 0.5 * env; break;
    case 'step': rat.g.scale.multiplyScalar(0.6 + 0.4 * Math.abs(u * 2 - 1)); break;
    case 'turbo': rat.body.rotation.x = -0.6 * env; rat.head.rotation.x = -0.5 * env; L[0].rotation.x = L[1].rotation.x = -2 * env; rat.jaw.rotation.x = 0.22 + 0.7 * env; break; // rear up and roar
  }
}
