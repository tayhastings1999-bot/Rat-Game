// Class signature moves (G / the Sig button): one move per class that no
// other class has, each with its own animation (P.sig drives the pose in sync.js).
//   Brawler   Grab & Hurl  — seize a mob and throw it into the pack.
//   Plague    Blight Burst — every poisoned mob near you bursts and spreads it.
//   Slinger   Ricochet     — a heavy stone that banks off walls four times.
//   Warlock   Hex Marks    — mark up to five mobs ahead; the marks detonate.
//   Tank      Shield Parry — brace: the next hit is blocked, stuns and reflects.
//   Sneak     Shadowstep   — vanish and reappear behind a mob, shiv ready.
//   Roof Rat  Dive Bomb    — leap high, then plunge onto the nearest mob.
import { rand, angD } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { fx, puff, spark, boom, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { floorY, tileAt, solidFor } from '../world/grid.js';
import { hit, aoe, near, nearest } from '../combat/combat.js';
import { shoot } from '../combat/arsenal.js';

const anim = (kind, dur) => { P.sig = { kind, t: dur, dur }; };

export const SIGS = {
  brawler: {
    name: 'Grab & Hurl', cd: 6, desc: 'Seize the nearest mob in front and hurl it into the pack.',
    use() {
      let b = null, bd = 3.2;
      for (const e of near(P.x, P.y, P.z, 3)) {
        if (e.boss || e.type === 'nest' || e.rival || e.pred || e.hidden || e.disguise) continue;
        const d = Math.hypot(e.x - P.x, e.z - P.z);
        if (d < bd && Math.abs(angD(Math.atan2(e.x - P.x, e.z - P.z), P.facing)) < 1.3) { bd = d; b = e; }
      }
      if (!b) return false;
      if (b.heavy || b.type === 'brute' || (b.mass || 1) > 2.5) {
        // Too big to lift: a two-handed shove instead.
        hit(b, 30, P.facing, 16, 'special');
        b.stun = 0.8;
        anim('shove', 0.3);
        sfx('slash');
        return true;
      }
      b.held = true;
      b.st = 'move'; b.act = null; b.tel = 0;
      P.grab = { e: b, t: 0.38 };
      anim('grab', 0.62);
      sfx('chew');
      return true;
    },
  },
  plague: {
    name: 'Blight Burst', cd: 8, desc: 'Every poisoned mob within 12 bursts, hurting and poisoning its neighbours.',
    use() {
      const hitList = W.enemies.filter(e => !e.dead && e.pT > 0 && Math.hypot(e.x - P.x, e.z - P.z) < 12);
      anim('blight', 0.5);
      sfx('mutation');
      fx('ring', P.x, P.y, P.z, 12, 0x9be06a, 0.5);
      if (!hitList.length) { dnum(P.x, P.y + 1.6, P.z, 'Nothing is rotting yet', 'info'); return true; }
      hitList.forEach((e, i) => setTimeout(() => {
        if (e.dead || G.state !== 'play') return;
        const dm = 20 + (e.pD || 4) * e.pT * 3;
        boom(e.x, e.y + e.h * 0.5, e.z, 2.6, 0x9be06a);
        for (const o of near(e.x, e.y, e.z, 3)) { hit(o, dm, Math.atan2(o.x - e.x, o.z - e.z), 5, 'special'); o.pT = Math.max(o.pT, 3); o.pD = Math.max(o.pD || 0, 4 * st.dmg * st.poisonMul); }
      }, i * 60));
      return true;
    },
  },
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
    name: 'Shadowstep', cd: 6, desc: 'Vanish and reappear behind the nearest mob with your ambush shiv ready.',
    use() {
      const t = nearest(11);
      if (!t || t.boss && t.fly) return false;
      puff(P.x, P.y + 0.5, P.z, 0x1a1a22, 14, 2.5);
      for (const r of [1.6, 1.2, 2.2]) {
        const x = t.x - Math.sin(t.ang) * r, z = t.z - Math.cos(t.ang) * r;
        if (solidFor(tileAt(x, z), false) || Math.abs(floorY(x, z) - t.y) > 1) continue;
        P.x = x; P.z = z; P.y = Math.max(floorY(x, z), t.y); P.vx = P.vz = P.vy = 0;
        break;
      }
      P.facing = Math.atan2(t.x - P.x, t.z - P.z);
      P.ambush = Math.max(P.ambush || 0, 2);
      P.inv = Math.max(P.inv, 0.3);
      puff(P.x, P.y + 0.5, P.z, 0x1a1a22, 14, 2.5);
      anim('step', 0.35);
      sfx('roll');
      return true;
    },
  },
  roof: {
    name: 'Dive Bomb', cd: 5.5, desc: 'Leap high, then plunge onto the nearest mob. The higher you fall from, the harder it hits.',
    use() {
      if (P.onGround) { P.vy = 15; P.onGround = false; P.jumping = false; P.cut = true; }
      P.diveArm = 1.2;
      P.diveY = P.y;
      anim('leap', 0.4);
      sfx('roll');
      return true;
    },
  },
};

export function useSig() {
  if (G.state !== 'play' || run.sigT > 0 || P.squeeze || P.grab) return;
  const S = SIGS[run.cls];
  if (!S) return;
  if (S.use() === false) { dnum(P.x, P.y + 1.6, P.z, 'Nothing in reach', 'info'); run.sigT = 0.4; return; }
  run.sigT = S.cd * st.cd;
  run.sigs = (run.sigs || 0) + 1;
}

export function tickSig(dt) {
  run.sigT = (run.sigT || 0) - dt;
  if (P.sig) { P.sig.t -= dt; if (P.sig.t <= 0) P.sig = null; }
  P.parry = (P.parry || 0) - dt;
  // Brawler: hold the mob overhead, then hurl it.
  if (P.grab) {
    const g = P.grab, e = g.e;
    g.t -= dt;
    if (e.dead) { P.grab = null; return; }
    const lift = Math.min(1, (0.38 - g.t) / 0.2);
    e.x = P.x + Math.sin(P.facing) * 0.5 * (1 - lift);
    e.z = P.z + Math.cos(P.facing) * 0.5 * (1 - lift);
    e.y = P.y + 0.6 + lift * 1.1;
    e.vy = 0;
    e.roll = lift * 1.6;
    if (g.t <= 0) {
      P.grab = null;
      e.held = false;
      e.roll = 0;
      const s = 24 / Math.max(0.6, e.mass || 1);
      e.kx = Math.sin(P.facing) * s; e.kz = Math.cos(P.facing) * s; e.vy = 5;
      e.bonk = 1.4;
      e.stun = 0.6;
      hit(e, 34, P.facing, 0, 'special');
      sfx('slash');
      G.shake = Math.max(G.shake, 0.2);
    }
  }
  // Roof Rat: at the top of the leap, plunge at the nearest mob.
  if (P.diveArm > 0) {
    P.diveArm -= dt;
    if (P.vy <= 0 && !P.onGround) {
      P.diveArm = 0;
      const t = nearest(12), tx = t ? t.x : P.x + Math.sin(P.facing) * 3, tz = t ? t.z : P.z + Math.cos(P.facing) * 3;
      const dx = tx - P.x, dz = tz - P.z, l = Math.hypot(dx, dz) || 1;
      P.vx = dx / l * Math.min(18, l * 3); P.vz = dz / l * Math.min(18, l * 3); P.vy = -24;
      P.slam = 'dive';
      P.diveY = Math.max(P.diveY, P.y);
      P.facing = Math.atan2(dx, dz);
      anim('dive', 0.6);
      fx('ring', tx, floorY(tx, tz), tz, 3, 0x9ad8ff, 0.4);
    }
  }
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

/** Roof Rat dive landing (called from the player's landing check). */
export function diveLand() {
  const drop = Math.max(0, (P.diveY ?? P.y) - P.y), R = 3.2 * st.area, dm = 30 + drop * 7;
  aoe(P.x, P.y, P.z, R, dm, 12, 'special', 0, true);
  boom(P.x, P.y + 0.5, P.z, R * 1.5, 0x9ad8ff);
  fx('ring', P.x, P.y, P.z, R, 0x9ad8ff, 0.45);
  puff(P.x, P.y + 0.2, P.z, 0x9a8a7a, 18, 5);
  G.shake = Math.max(G.shake, 0.5);
  if (drop > 4) dnum(P.x, P.y + 1.8, P.z, `DIVE ${Math.round(drop)}m`, 'crit');
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
    case 'grab': {
      // Snatch with both forepaws, hoist overhead, then a whole-body hurl.
      const hurl = u > 0.6 ? Math.sin((u - 0.6) / 0.4 * Math.PI) : 0;
      L[0].rotation.x = L[1].rotation.x = -2.4 * Math.min(1, u * 3) + hurl * 2.2;
      rat.body.rotation.x = -0.5 * Math.min(1, u * 2.5) * (1 - hurl) + hurl * 0.35;
      rat.head.rotation.x = -0.4 * env + hurl * 0.3;
      rat.jaw.rotation.x = 0.22 + 0.6 * env;
      break;
    }
    case 'shove': L[0].rotation.x = L[1].rotation.x = -1.6 * env; rat.body.position.z += 0.25 * env; break;
    case 'blight': rat.head.rotation.x = -0.7 * env; rat.jaw.rotation.x = 0.22 + 0.8 * env; rat.body.rotation.x = -0.25 * env; break;
    case 'sling': L[1].rotation.x = u < 0.4 ? -2.6 * (u / 0.4) : -2.6 + 3.4 * ((u - 0.4) / 0.6); rat.body.rotation.y = 0.35 * env; break;
    case 'cast': rat.body.rotation.x = -0.4 * env; L[1].rotation.x = -2.2 * env; L[0].rotation.x = -1.2 * env; rat.head.rotation.x = -0.3 * env; break;
    case 'brace': rat.body.position.y -= 0.12 * env; rat.head.position.y -= 0.12 * env; rat.head.rotation.x = 0.35 * env; L[0].rotation.x = L[1].rotation.x = 0.5 * env; break;
    case 'step': rat.g.scale.multiplyScalar(0.6 + 0.4 * Math.abs(u * 2 - 1)); break;
    case 'leap': rat.body.rotation.x = -0.4 * env; L[2].rotation.x = L[3].rotation.x = 0.9 * env; break;
    case 'dive': rat.body.rotation.x = 1.0; rat.head.rotation.x = 0.4; L[0].rotation.x = L[1].rotation.x = -1.5; L[2].rotation.x = L[3].rotation.x = 1.2; break;
  }
}
