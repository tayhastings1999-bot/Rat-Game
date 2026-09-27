// One simulation step of a running district.
import { rand, randi, clamp, angD, TAU } from '../core/util.js';
import { G, P, W, run, st, settings } from '../core/state.js';
import { world, scene } from '../render/renderer.js';
import { puff, spark, boom, bolt, dnum, auraG, orbs, orbState, shieldM } from '../fx/fx.js';
import { sfx, setMusic } from '../audio/audio.js';
import { M, G as GRAV, gi, inG, toG, toW, tAt, tileAt, topAt, floorY, solidFor, bfs, descend, nearOpen, OPEN, DRY } from '../world/grid.js';
import { syncObj, pitMat } from '../world/build.js';
import { isSewer } from '../data/world.js';
import { OBJ } from '../data/props.js';
import { WEAP, auraR, shoot, flasks } from '../combat/arsenal.js';
import { near, nearest, hit, kill, aoe, hurtP, gainXP, updThreat } from '../combat/combat.js';
import { puddle, tickHaz } from '../combat/hazards.js';
import { stepPlayer, primary, keys, chewTarget, doChew, tickInteractives } from '../entities/player.js';
import { spawnTick, updateEnemies } from '../entities/mobs.js';
import { spawnBoss } from '../entities/bosses.js';
import { exitRoad, exitLadder } from './flow.js';
import { collectCore } from './loot.js';
import { banner } from '../ui/hud.js';
import { finishTrial } from '../ui/screens.js';

let scentT = 0, seenT = 0;

function updateZones(dt) {
  P.gmul = 1;
  let dark = 0;
  for (const zn of W.zones) {
    zn.t -= dt;
    if (zn.type === 'vent') {
      if (zn.t <= 0) { zn.a = rand(0, TAU); zn.t = rand(5, 9); }
      zn.arrow.rotation.z = zn.up ? G.time * 3 : zn.a + Math.PI;
      if (Math.random() < 0.5) puff(zn.x + rand(-1, 1), floorY(zn.x, zn.z) + 0.3, zn.z + rand(-1, 1), 0xc8e8ff, 1, 1.2);
      const push = b => {
        const d = Math.hypot(b.x - zn.x, b.z - zn.z);
        if (d > zn.r || b.y > floorY(zn.x, zn.z) + 3.5) return;
        if (zn.up) b.vy = Math.min((b.vy || 0) + 46 * dt, 12);
        else { b.x += Math.sin(zn.a) * 7 * dt; b.z += Math.cos(zn.a) * 7 * dt; }
      };
      push(P);
      for (const e of W.enemies) if (!e.heavy) push(e);
    } else if (zn.type === 'grav') {
      if (zn.t <= 0) { zn.low = !zn.low; zn.t = 12; }
      zn.mt -= dt;
      if (zn.mt <= 0 && M.spawnTiles.length) {
        const k = M.spawnTiles[randi(0, M.spawnTiles.length - 1)];
        zn.x = toW(k % M.W); zn.z = toW((k / M.W) | 0);
        zn.g.position.set(zn.x, floorY(zn.x, zn.z) + 0.05, zn.z);
        zn.mt = 30;
      }
      const c = zn.low ? 0x9ad0ff : 0xc050ff;
      zn.ring.material.color.set(c);
      zn.disc.material.color.set(c);
      zn.ring.material.opacity = 0.4 + 0.25 * Math.sin(G.time * 4);
      if (Math.random() < 0.4) { const a = rand(0, TAU), r = rand(0, zn.r); W.parts.push({ x: zn.x + Math.sin(a) * r, y: floorY(zn.x, zn.z) + (zn.low ? 0.2 : 3), z: zn.z + Math.cos(a) * r, vx: 0, vy: zn.low ? 3 : -4, vz: 0, life: 0.7, c, s: 1, ng: true }); }
      if (Math.hypot(P.x - zn.x, P.z - zn.z) < zn.r) P.gmul = zn.low ? 0.35 : 1.9;
    } else if (zn.type === 'decay') {
      const nx = zn.x + zn.vx * dt * 1.3, nz = zn.z + zn.vz * dt * 1.3;
      if (OPEN(tileAt(nx, nz))) { zn.x = nx; zn.z = nz; } else { zn.vx *= -1; zn.vz *= -1; }
      if (Math.random() < 0.01) { zn.vx = rand(-1, 1); zn.vz = rand(-1, 1); }
      zn.g.position.set(zn.x, floorY(zn.x, zn.z) + 0.05, zn.z);
      zn.fog.forEach((f, i) => { f.material.opacity = 0.25 + 0.1 * Math.sin(G.time * 2 + i); });
      zn.tick -= dt;
      if (zn.tick <= 0) {
        zn.tick = 0.5;
        if (Math.hypot(P.x - zn.x, P.z - zn.z) < zn.r) hurtP(4, null, true);
        for (const e of W.enemies) if (!e.dead && !e.heavy && Math.hypot(e.x - zn.x, e.z - zn.z) < zn.r) { e.hp -= 7; e.pT = Math.max(e.pT, 0.6); if (e.hp <= 0) kill(e); }
      }
    } else if (zn.type === 'dark') {
      const d = Math.hypot(P.x - zn.x, P.z - zn.z);
      dark = Math.max(dark, clamp((zn.r - d) / 3, 0, 1));
    }
  }
  G.darkness += (dark - G.darkness) * Math.min(1, 3 * dt);
  if (scene.fog) {
    scene.fog.near = G.fogNear * (1 - G.darkness * 0.92);
    scene.fog.far = G.fogFar * (1 - G.darkness * 0.8);
  }
}

function updateMods(dt) {
  const hz = run.mods;
  if (hz.includes('tides')) {
    run.tideT += dt;
    const c = run.tideT % 50, lv = c < 30 ? 0 : c < 36 ? (c - 30) / 6 : c < 44 ? 1 : 1 - (c - 44) / 6;
    if (c >= 30 && c - dt < 30) banner(M.kind === 'city' ? 'The storm drains overflow' : 'The tide rises', 'Get high or get slow');
    G.tideY = -1 + lv * 1.45;
    if (G.tideMesh) { G.tideMesh.position.y = G.tideY; G.tideMesh.visible = lv > 0; }
  }
  if (hz.includes('bloodmoon')) {
    run.moonT += dt;
    const c = run.moonT % 150, on = c > 90 && c < 125;
    if (on && !run.moon) { banner('Blood Moon', 'The horde doubles'); sfx('boss'); }
    run.moon = on;
  }
  for (const b of W.baits) {
    if (b.gone) continue;
    b.m.rotation.y += dt * 2;
    if (Math.hypot(P.x - b.x, P.z - b.z) < 0.8 && P.y < 0.6) { b.gone = true; world.remove(b.m); P.poisonT = 4; dnum(P.x, P.y + 1.6, P.z, 'Poisoned', 'poison'); continue; }
    for (const e of W.enemies) {
      if (e.dead || e.fly || e.heavy) continue;
      if (Math.abs(e.x - b.x) < 0.7 && Math.abs(e.z - b.z) < 0.7) { b.gone = true; world.remove(b.m); e.pT = 8; e.pD = Math.max(10, e.maxHp * 0.2); puff(b.x, 0.4, b.z, 0x9be06a, 6, 2); break; }
    }
  }
  for (const [k, c] of W.cracks) {
    if (c.t < 0) {
      if (P.onGround && P.y > -0.1 && P.y < 0.2 && gi(toG(P.x), toG(P.z)) === k) { c.t = 0.75; G.shake = Math.max(G.shake, 0.15); puff(toW(k % M.W), 0.2, toW((k / M.W) | 0), 0x9a8a7a, 8, 2); }
    } else {
      c.t -= dt;
      c.m.position.y = 0.02 + Math.sin(G.time * 60) * 0.02;
      if (c.t <= 0) { M.grid[k] = 7; c.m.material = pitMat; G.flowT = 0; puff(toW(k % M.W), 0.2, toW((k / M.W) | 0), 0x6a5a4a, 20, 4); sfx('boom'); W.cracks.delete(k); }
    }
  }
}

function updatePlayerStatus(dt) {
  if (P.poisonT > 0) { P.poisonT -= dt; P.pTick -= dt; if (P.pTick <= 0) { P.pTick = 0.5; hurtP(3, null, true); } }
  const tp = tileAt(P.x, P.z);
  if (tp === 4 && P.y < -0.5) { P.acidT -= dt; if (P.acidT <= 0) { P.acidT = 0.5; hurtP(5, null, true); puff(P.x, P.y + 0.5, P.z, 0xb8f040, 4, 1.5); } }
  if (P.y < -3) {
    P.x = P.safe.x; P.z = P.safe.z; P.y = floorY(P.x, P.z, true) + 0.1;
    P.vx = P.vz = P.vy = 0;
    hurtP(12, null, true);
    P.inv = 1;
    dnum(P.x, P.y + 1.6, P.z, 'Fell', 'info');
  }
  // Cursed and mutation upkeep.
  if (st.rabid && G.time - P.lastHitT > 1.2) {
    run.hp -= st.maxHp * 0.035 * dt;
    if (Math.random() < dt * 4) puff(P.x, P.y + 0.6, P.z, 0xa01010, 1, 1);
    if (run.hp <= 0) hurtP(1, null, true);
  }
  if (st.selfPoison) { run.selfPoisonT -= dt; if (run.selfPoisonT <= 0) { run.selfPoisonT = 12; P.poisonT = Math.max(P.poisonT, 2); dnum(P.x, P.y + 1.6, P.z, 'Plague flares', 'poison'); } }
  if (st.mut.tesla) {
    run.teslaT -= dt;
    if (run.teslaT <= 0) {
      run.teslaT = 1.1;
      const ts = near(P.x, P.y, P.z, 9 * st.area).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).slice(0, 3);
      for (const e of ts) { bolt([[P.x, P.y + 1.2, P.z], [e.x, e.y + e.h * 0.6, e.z]]); hit(e, 22, null, 0, 'tesla'); }
    }
  }
  if (P.bulwark > 0) {
    P.bulwark -= dt;
    shieldM.visible = true;
    shieldM.position.set(P.x, P.y + 0.6, P.z);
    shieldM.rotation.y += dt * 2;
    for (const e of near(P.x, P.y, P.z, 1.6)) if (!e.heavy && (e.tT || 0) <= 0) { e.tT = 0.4; hit(e, 12, Math.atan2(e.x - P.x, e.z - P.z), 10, 'special', true); }
  } else shieldM.visible = false;
  if (P.glideT > 0) P.glideT -= dt;
}

function updateWeapons(dt) {
  auraG.visible = false;
  orbState.n = 0;
  for (const w of run.weapons) {
    const Wp = WEAP[w.id];
    if (Wp.tick) Wp.tick(w, dt);
    if (w.id === 'aura') {
      const R = auraR(w);
      auraG.visible = true;
      auraG.position.set(P.x, P.y + 0.05, P.z);
      auraG.scale.setScalar(R * (1 + Math.sin(G.time * 4) * 0.03));
    }
    if (Wp.fire && !P.squeeze) {
      const fury = st.fury && run.hp < st.maxHp * 0.5 ? 0.66 : 1;
      w.t -= dt;
      if (w.t <= 0) w.t = Wp.fire(w) === false ? 0.15 : Wp.cd(w) * st.cd * fury;
    }
  }
  for (let i = orbState.n; i < orbs.length; i++) orbs[i].visible = false;
  W.familiars.forEach((f, i) => {
    const a = P.facing + (i % 2 ? 0.8 : -0.8), bx = P.x - Math.sin(a) * 1.3, bz = P.z - Math.cos(a) * 1.3;
    f.x += (bx - f.x) * Math.min(1, 5 * dt);
    f.z += (bz - f.z) * Math.min(1, 5 * dt);
    f.y += (P.y - f.y) * Math.min(1, 6 * dt);
    f.t -= dt;
    const t = nearest(10);
    if (t) {
      f.a = Math.atan2(t.x - f.x, t.z - f.z);
      if (f.t <= 0) { f.t = 0.75 * st.tear; shoot(f.x, f.y + 0.4, f.z, t.x - f.x, t.y + t.h / 2 - (f.y + 0.4), t.z - f.z, 18, 5, 0, 'runt', { col: 0xffd070 }); }
    }
    f.r.g.position.set(f.x, f.y + Math.abs(Math.sin(G.time * 12 + i)) * 0.05, f.z);
    f.r.g.rotation.y = t ? f.a : P.facing;
  });
  if (P.carry) {
    const o = P.carry, f = P.facing, half = o.kind === 'swab' ? 2.4 : Math.max(OBJ[o.kind].w, OBJ[o.kind].d) / 2;
    o.x = P.x + Math.sin(f) * (0.45 + half);
    o.z = P.z + Math.cos(f) * (0.45 + half);
    o.y = P.y + 0.45 + o.th;
    o.mesh.position.set(o.x, o.y - o.th / 2, o.z);
    o.mesh.rotation.y = f;
  }
  if (P.chewing) {
    const c = keys.KeyE && chewTarget();
    if (!c) { P.chewing = false; P.chewT = 0; }
    else {
      P.chewT += dt * st.chew;
      sfx('chew');
      if (Math.random() < 0.35) puff(P.x + Math.sin(P.facing) * 0.8, P.y + 0.7, P.z + Math.cos(P.facing) * 0.8, c.kind === 'wire' ? 0x9ad0ff : 0xc8b894, 2, 2);
      if (P.chewT >= c.time) { doChew(c); P.chewing = false; P.chewT = 0; }
    }
  }
}

const solidAt = (x, y, z) => {
  const gx = toG(x), gz = toG(z);
  if (solidFor(tAt(gx, gz), false) && y < topAt(gx, gz)) return true;
  return W.plats.some(p => !p.carried && !p.thin && Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2 && y < p.y && y > p.y - p.th);
};

function updateProjectiles(dt) {
  if (W.shrapQ.length) {
    const q = W.shrapQ;
    W.shrapQ = [];
    for (const [x, y, z] of q.slice(0, 12)) {
      for (const e of near(x, y, z, 2)) hit(e, 10, Math.atan2(e.x - x, e.z - z), 4, 'shrapnel', true);
      spark(x, y + 0.5, z, 1.4, 0xffb070);
    }
  }
  run.nailT -= dt;
  for (const p of W.pproj) {
    p.life -= dt;
    if (p.homing) {
      let b = null, bd = 64;
      for (const e of W.enemies) { if (e.dead || p.hs.has(e) || e.hidden) continue; const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; b = e; } }
      if (b) {
        const dx = b.x - p.x, dy = b.y + b.h * 0.5 - p.y, dz = b.z - p.z, l = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, 6 * dt);
        p.vx += (dx / l * p.spd - p.vx) * k; p.vy += (dy / l * p.spd - p.vy) * k; p.vz += (dz / l * p.spd - p.vz) * k;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (Math.random() < 0.3) W.parts.push({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.2, c: p.col, s: 0.6, ng: true });
    if (p.y < floorY(p.x, p.z) - 0.1 || solidAt(p.x, p.y, p.z)) { p.life = 0; spark(p.x, p.y, p.z, 0.7, p.col); continue; }
    for (const e of W.enemies) {
      if (e.dead || p.hs.has(e) || e.hidden) continue;
      const dx = e.x - p.x, dz = e.z - p.z, rr = e.r + 0.22 * p.size;
      if (dx * dx + dz * dz < rr * rr && p.y > e.y - 0.2 && p.y < e.y + e.h + 0.3) {
        p.hs.add(e);
        const a = Math.atan2(p.vx, p.vz);
        hit(e, p.dmg, a, 3, p.src, false, p.fx);
        if (p.split) { for (const s of [-0.7, 0.7]) shoot(p.x, p.y, p.z, Math.sin(a + s), 0, Math.cos(a + s), p.spd * 0.8, p.dmg * 0.5, 0, 'primary', { col: p.col, child: true, life: 0.4 }); p.split = false; }
        if (p.pierce-- <= 0) { p.life = 0; break; }
      }
    }
  }
  if (W.pproj.some(p => p.life <= 0)) W.pproj = W.pproj.filter(p => p.life > 0);
  for (const p of W.eproj) {
    p.life -= dt;
    if (p.g) p.vy -= p.g * dt;
    if (p.home) { const dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1, k = Math.min(1, 2.5 * dt); p.vx += (dx / l * 7 - p.vx) * k; p.vz += (dz / l * 7 - p.vz) * k; }
    if (p.y < floorY(p.x, p.z) - 0.1) {
      p.life = 0;
      if (p.pud) puddle(p.pud, p.x, p.z, 1.6, 4, 'e');
      if (p.onLand) p.onLand(p.x, p.z);
      spark(p.x, p.y + 0.2, p.z, 1, p.col);
      continue;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const dx = P.x - p.x, dy = P.y + 0.5 - p.y, dz = P.z - p.z, hr = 0.45 + (p.size > 1 ? (p.size - 1) * 0.3 : 0);
    if (dx * dx + dy * dy + dz * dz < hr) { hurtP(p.dmg); if (p.slow) P.slowT = 1.5; p.life = 0; spark(p.x, p.y, p.z, 1, p.col); continue; }
    if (solidAt(p.x, p.y, p.z)) { p.life = 0; spark(p.x, p.y, p.z, 0.8, p.col); if (p.onLand) p.onLand(p.x - p.vx * 0.05, p.z - p.vz * 0.05); }
  }
  if (W.eproj.some(p => p.life <= 0)) W.eproj = W.eproj.filter(p => p.life > 0);
  for (const b of flasks) {
    if (!b.on) continue;
    b.t += dt;
    const u = Math.min(1, b.t / 0.6);
    b.m.position.set(b.sx + (b.tx - b.sx) * u, b.sy + (b.ty - b.sy) * u + Math.sin(Math.PI * u) * 3.2, b.sz + (b.tz - b.sz) * u);
    b.m.rotation.x += dt * 10;
    if (u >= 1) {
      b.on = false;
      b.m.visible = false;
      aoe(b.tx, b.ty, b.tz, b.R, b.dm, 6, b.src, 1, b.src === 'primary');
      boom(b.tx, b.ty + 0.6, b.tz, b.R * 1.5, 0xa9e06a);
    }
  }
}

function updateObjects(dt) {
  for (const o of W.objs) {
    if (o.carried) continue;
    let sup = -10;
    for (const [sx, sz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = o.x + sx * (o.w / 2 - 0.1), pz = o.z + sz * (o.d / 2 - 0.1), gx = toG(px), gz = toG(pz), t = tAt(gx, gz);
      sup = Math.max(sup, solidFor(t, false) ? (o.y - o.th >= topAt(gx, gz) - 0.15 ? topAt(gx, gz) : -10) : floorY(px, pz, false));
    }
    for (const p of W.plats) {
      if (p === o || p.carried || p.thin) continue;
      if (Math.abs(p.x - o.x) < (p.w + o.w) / 2 - 0.05 && Math.abs(p.z - o.z) < (p.d + o.d) / 2 - 0.05 && p.y <= o.y - o.th + 0.06) sup = Math.max(sup, p.y);
    }
    const bot = o.y - o.th;
    if (bot > sup + 0.001) {
      o.vy -= GRAV * dt;
      o.y += o.vy * dt;
      if (o.y - o.th <= sup) { o.y = sup + o.th; if (o.vy < -8) puff(o.x, sup, o.z, 0x9a8a7a, 6, 2); o.vy = 0; }
      syncObj(o);
    } else if (bot < sup - 0.001 && sup - bot < 0.7) { o.y = sup + o.th; syncObj(o); }
  }
}

function updatePickups(dt) {
  const mr = st.magnet * st.magnet;
  const pull = g => {
    const dx = P.x - g.x, dy = P.y + 0.5 - g.y, dz = P.z - g.z, d2 = dx * dx + dy * dy + dz * dz;
    if (!g.pull && d2 < mr) g.pull = true;
    if (g.pull) { g.s = Math.min(30, (g.s || 6) + 40 * dt); const d = Math.sqrt(d2) || 1, s = Math.min(d, g.s * dt); g.x += dx / d * s; g.y += dy / d * s; g.z += dz / d * s; }
    return d2 < 0.36;
  };
  W.gems = W.gems.filter(g => { if (pull(g)) { gainXP(g.v); sfx('pickup'); return false; } return true; });
  W.scraps = W.scraps.filter(g => { if (pull(g)) { run.scrap += st.salvage; return false; } return true; });
  W.cores = W.cores.filter(c => {
    const d = Math.hypot(P.x - c.x, P.z - c.z);
    if (d < 1.4 && Math.abs(P.y - c.y) < 1.6) { collectCore(); sfx('key'); return false; }
    return true;
  });
  W.keys = W.keys.filter(k => {
    k.g.rotation.y += dt * 2;
    k.g.position.y = k.y + 0.8 + Math.sin(G.time * 3) * 0.15;
    if (Math.hypot(P.x - k.x, P.z - k.z) < 1.4 && Math.abs(P.y - k.y) < 1.6) {
      world.remove(k.g);
      run.keys++;
      sfx('key');
      banner('Sewer key', 'The manhole will open for you · M to find it');
      return false;
    }
    return true;
  });
  W.foods = W.foods.filter(f => {
    f.m.position.set(f.x, f.y + 0.4 + Math.sin(G.time * 3) * 0.1, f.z);
    f.m.rotation.y += dt * 2;
    if (Math.hypot(P.x - f.x, P.z - f.z) < 1 && Math.abs(P.y - f.y) < 1.2) {
      world.remove(f.m);
      const h = Math.round(st.maxHp * 0.3 * st.foodMul);
      run.hp = Math.min(st.maxHp, run.hp + h);
      dnum(P.x, P.y + 1.6, P.z, '+' + h, 'heal');
      return false;
    }
    return true;
  });
  for (const c of W.caches) {
    if (c.taken) continue;
    c.g.rotation.y += dt;
    if (Math.hypot(P.x - c.x, P.z - c.z) < 1.2 && Math.abs(P.y - c.y) < 1.3) {
      c.taken = true;
      world.remove(c.g);
      const h = Math.round(st.maxHp * 0.4 * st.foodMul);
      run.hp = Math.min(st.maxHp, run.hp + h);
      for (let i = 0; i < 8; i++) W.scraps.push({ x: c.x + rand(-0.6, 0.6), y: c.y, z: c.z + rand(-0.6, 0.6), pull: false, s: 0, ph: rand(0, 6) });
      dnum(P.x, P.y + 1.6, P.z, 'Cheese cache +' + h, 'heal');
    }
  }
}

function updateScent(dt) {
  if (!P.scent) return;
  scentT -= dt;
  if (scentT > 0) return;
  scentT = 0.4;
  W.scentPaths = [];
  const tgt = (list, col) => {
    let b = null, bd = 1e9;
    for (const o of list) {
      const [gx, gz] = nearOpen(toG(o.x), toG(o.z)), d = M.flow[gi(gx, gz)];
      if (d >= 0 && d < bd) { bd = d; b = [gx, gz]; }
    }
    if (b) W.scentPaths.push({ col, p: descend(M.flow, b[0], b[1], 120) });
  };
  if (G.mode === 'survival' && G.exitD) tgt([G.exitD], 0x6ad06a);
  if (G.mode === 'survival' && G.manhole && run.keys) tgt([G.manhole], 0xb070ff);
  if (W.keys.length) tgt(W.keys, 0xffd040);
  tgt(W.caches.filter(c => !c.taken), 0xffe070);
  tgt(W.chests.filter(c => !c.open), 0xffa030);
  tgt(W.benches, 0x4aa3ff);
  if (G.mode === 'trial') { const v = W.valves.filter(v => !v.done); tgt(v.length ? v : [G.exitD], 0x6ad06a); }
  for (const e of W.enemies) if (e.pred) W.scentPaths.push({ col: 0xff3a20, p: e.path.filter((_, i) => i % 2 === 0), loop: true });
}

export function update(dt) {
  run.time += dt;
  P.inv = Math.max(0, P.inv - dt);
  P.aimT -= dt;
  P.atk -= dt;
  run.specT = Math.max(0, run.specT - dt);
  if (!st.noRegen) run.hp = Math.min(st.maxHp, run.hp + st.regen * dt);
  if (run.hp > st.maxHp * 0.5) run.lowWarned = false;
  updateZones(dt);
  stepPlayer(dt / 2);
  stepPlayer(dt / 2);
  primary(dt);
  updThreat(dt);
  tickHaz(dt);
  if (P.onGround && Math.abs(P.y - floorY(P.x, P.z, true)) < 0.1 && DRY(tileAt(P.x, P.z)) && !W.cracks.has(gi(toG(P.x), toG(P.z)))) { P.safe.x = P.x; P.safe.z = P.z; }
  updateMods(dt);
  updatePlayerStatus(dt);
  if (G.state !== 'play') return;
  updateWeapons(dt);
  G.flowT -= dt;
  if (G.flowT <= 0) {
    G.flowT = 0.25;
    const [gx, gz] = nearOpen(toG(P.x), toG(P.z));
    M.flow = bfs(gx, gz, OPEN);
    const lo = 6, hi = M.kind === 'city' ? 13 : 11;
    M.spawnTiles = [];
    for (let k = 0; k < M.flow.length; k++) if (M.flow[k] >= lo && M.flow[k] <= hi && DRY(M.grid[k])) M.spawnTiles.push(k);
  }
  const cap = spawnTick(dt * (G.boss ? 0.6 : 1));
  if (G.mode !== 'trial' && !run.bossDone && !G.boss && (run.time - run.dStart >= run.bossAt || run.nests <= 0) && M.spawnTiles.length) spawnBoss();
  updateEnemies(dt, cap);
  if (G.state !== 'play') return;
  updateProjectiles(dt);
  updateObjects(dt);
  tickInteractives(dt);
  updatePickups(dt);
  const ex = G.exitD;
  if (ex && Math.hypot(P.x - ex.x, P.z - ex.z) < 1.8 && Math.abs(P.y - floorY(ex.x, ex.z)) < 0.8) {
    if (G.mode === 'trial') { if (W.valves.every(v => v.done)) finishTrial(); }
    else if (ex.kind === 'road') exitRoad();
    else if (ex.kind === 'ladder') exitLadder();
  }
  seenT -= dt;
  if (seenT <= 0) {
    seenT = 0.2;
    const gx = toG(P.x), gz = toG(P.z), r = M.kind === 'city' ? 8 : 6;
    for (let y = gz - r; y <= gz + r; y++) for (let x = gx - r; x <= gx + r; x++) if (inG(x, y) && (x - gx) ** 2 + (y - gz) ** 2 <= r * r + 4) M.seen[gi(x, y)] = 1;
  }
  if (G.mode === 'trial') {
    run.recT -= dt;
    if (run.recT <= 0) { run.recT = 0.1; run.rec.push([+run.time.toFixed(2), +P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), +P.facing.toFixed(2)]); }
  }
  const gh = G.ghost;
  if (gh) {
    const D = gh.data.d;
    while (gh.i < D.length - 2 && D[gh.i + 1][0] <= run.time) gh.i++;
    const a = D[gh.i], b = D[Math.min(gh.i + 1, D.length - 1)], u = b[0] > a[0] ? clamp((run.time - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    gh.r.g.visible = run.time <= D[D.length - 1][0];
    gh.r.g.position.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
    gh.r.g.rotation.y = a[4] + angD(b[4], a[4]) * u;
  }
  updateScent(dt);
  if (G.lockOn && (G.lockOn.dead || Math.hypot(G.lockOn.x - P.x, G.lockOn.z - P.z) > 34)) G.lockOn = null;
  if (G.lockOn && !G.drag) G.camYaw += angD(Math.atan2(G.lockOn.x - P.x, G.lockOn.z - P.z), G.camYaw) * Math.min(1, 4 * dt);
  else if (settings.mouse && !G.drag) {
    const ex2 = G.mX / innerWidth;
    if (ex2 < 0.04) G.camYaw += 1.8 * dt * settings.sens;
    else if (ex2 > 0.96) G.camYaw -= 1.8 * dt * settings.sens;
  }
  if (!G.drag) { const k = Math.min(1, 1.5 * dt); G.camOff.x -= G.camOff.x * k; G.camOff.z -= G.camOff.z * k; }
  // Music: boss > crowded fight > exploring.
  let close = 0;
  for (const e of W.enemies) if (!e.dead && Math.abs(e.x - P.x) < 12 && Math.abs(e.z - P.z) < 12) close++;
  setMusic(G.boss ? 3 : close > 8 || (run.T || 0) > 8 ? 2 : 1, isSewer());
}
