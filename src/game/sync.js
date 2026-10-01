// Pushes simulation state into the scene every frame: instanced mobs,
// pickups, projectiles, particles, gibs, health bars, and the rat + camera.
import * as THREE from 'three';
import { rand, clamp, angD, keep, TAU, PI2, $ } from '../core/util.js';
import { G, P, W, run, st, settings } from '../core/state.js';
import { camera, sun, lantern, lampL, post } from '../render/renderer.js';
import { IMB, IMG, MOB_CAP, shadowIM, gemIM, scrapIM, coreIM, pprojIM, eprojIM, partIM, gibIM, scentIM, ringIM, dummy, tmpC, _v } from '../render/pools.js';
import { decal, tickFx, PART_CAP } from '../fx/fx.js';
import { M, G as GRAV, toW, floorY, segBlocked, forPlatsNear } from '../world/grid.js';
import { CORRUPT } from '../data/items.js';
import { isSewer } from '../data/world.js';
import { blob } from '../entities/rat.js';
import { syncScent } from './scent.js';

G.camPos = new THREE.Vector3(0, 12, 12);
G.camOff = new THREE.Vector3();
const camLook = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, 1), _dir = new THREE.Vector3();
const want = new THREE.Vector3(), tgt = new THREE.Vector3(), shakeV = new THREE.Vector3();
let camFix = 0; // 0..1: how much the camera has lifted/pulled in to see past buildings

const BAR_N = 16;
const barPool = [];
for (let i = 0; i < BAR_N; i++) {
  const d = document.createElement('div');
  d.className = 'ebar';
  d.innerHTML = '<i></i>';
  $('bars').appendChild(d);
  barPool.push(d);
}
const corruptCol = {};
for (const k in CORRUPT) corruptCol[k] = new THREE.Color(CORRUPT[k].col);

function mobColor(e) {
  const t = G.time;
  if (e.flash > 0) return tmpC.setScalar(3.5);
  if (e.thief) return tmpC.setRGB(2, 1.6, 0.3);
  if (e.wind > 0 || e.tel > 0) return tmpC.setRGB(2.4 + Math.sin(t * 40) * 0.6, 0.6, 0.45);
  if (P.scent) return tmpC.setRGB(2.4, 0.5, 0.4);
  if (e.bT > 0) return tmpC.setRGB(1.6, 0.8, 0.4);
  if (e.pT > 0) return tmpC.setRGB(0.7, 1.4, 0.6);
  if (e.corrupt) return tmpC.copy(corruptCol[e.corrupt]).multiplyScalar(0.9).addScalar(0.55 + 0.25 * Math.sin(t * 6 + e.ph));
  if (e.ward > 0) return tmpC.setRGB(0.7, 1, 1.6);
  if (e.mut) return tmpC.setRGB(0.95, 1.2, 0.8);
  if (e.slow > 0) return tmpC.setRGB(0.8, 0.9, 1.3);
  return tmpC.setScalar(1);
}

export function sync(dt) {
  const cnt = {};
  for (const k in IMB) cnt[k] = 0;
  let rings = 0;
  for (const e of W.enemies) {
    if (e.mesh) {
      if (e.type === 'nest' || e.rival) continue;
      e.mesh.visible = !e.hidden;
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.rotation.set(e.pitch || 0, e.ang, e.roll || 0);
      const em = e.invuln > 0 ? 0.4 + 0.3 * Math.sin(G.time * 30) : e.flash > 0 ? 0.5 : (e.st === 'wind' || e.tel > 0 || e.wind > 0) ? 0.3 + 0.2 * Math.sin(G.time * 40) : e.pred && e.mode === 'hunt' ? 0.12 : 0;
      if (e.brain && (e.brain.exposed > 0 || e.brain.stagger > 0)) e.mesh.material.emissive.setRGB(0.45 + 0.25 * Math.sin(G.time * 16), 0.35, 0.05);
      else e.mesh.material.emissive.setScalar(em);
      continue;
    }
    const i = cnt[e.type]++;
    if (i >= MOB_CAP) continue;
    const lg = e.lunge > 0 ? Math.sin(e.lunge / 0.2 * Math.PI) * 0.35 : 0, sq = e.flash > 0 ? 0.82 : e.wind > 0 || e.st === 'wind' ? 1.12 : 1;
    dummy.position.set(e.x + Math.sin(e.ang) * lg, e.y + (e.fly ? Math.sin(G.time * 6 + e.ph) * 0.15 : Math.abs(Math.sin(G.time * 12 + e.ph)) * 0.05), e.z + Math.cos(e.ang) * lg);
    dummy.rotation.set(e.pitch || 0, e.ang, (e.fly ? Math.sin(G.time * 10 + e.ph) * 0.25 : 0) + (e.roll || 0));
    dummy.scale.set(e.sc / Math.sqrt(sq), e.sc * sq * (e.fly ? 1 : 1 + Math.sin(G.time * 12 + e.ph) * 0.04), e.sc / Math.sqrt(sq));
    dummy.updateMatrix();
    IMB[e.type].setMatrixAt(i, dummy.matrix);
    IMG[e.type].setMatrixAt(i, dummy.matrix);
    IMB[e.type].setColorAt(i, mobColor(e));
    if ((e.corrupt || e.ward > 0) && rings < 120) {
      const gy = e.fly ? floorY(e.x, e.z) : e.y;
      dummy.position.set(e.x, gy + 0.08, e.z);
      dummy.rotation.set(0, G.time * 2, 0);
      dummy.scale.setScalar(e.r * (e.champion ? 2.6 : 1.8) * (1 + 0.08 * Math.sin(G.time * 8 + e.ph)));
      dummy.updateMatrix();
      ringIM.setMatrixAt(rings, dummy.matrix);
      ringIM.setColorAt(rings, e.champion ? tmpC.setHex(0xffd040) : e.corrupt ? corruptCol[e.corrupt] : tmpC.setHex(0x6ad0ff));
      rings++;
    }
  }
  // Blob shadows under every creature.
  let sh = 0;
  for (const e of W.enemies) {
    if (e.dead || e.hidden || e.type === 'nest' || sh >= 260) continue;
    const gy = floorY(e.x, e.z), hgt = Math.max(0, e.y - gy);
    dummy.position.set(e.x, (e.y >= gy - 0.2 ? gy : e.y) + 0.04, e.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(e.r * 2.4 * Math.max(0.35, 1 - hgt * 0.08) * (e.boss ? 1.2 : 1));
    dummy.updateMatrix();
    shadowIM.setMatrixAt(sh++, dummy.matrix);
  }
  shadowIM.count = sh;
  shadowIM.instanceMatrix.needsUpdate = true;
  ringIM.count = rings;
  ringIM.instanceMatrix.needsUpdate = true;
  if (ringIM.instanceColor) ringIM.instanceColor.needsUpdate = true;
  // Summoned nest-mates.
  for (const s of W.swarm) {
    const i = cnt.ratling++;
    if (i >= MOB_CAP) break;
    dummy.position.set(s.x, s.y + Math.abs(Math.sin(G.time * 18 + s.ph)) * 0.08, s.z);
    dummy.rotation.set(0, s.ang, 0);
    dummy.scale.setScalar(s.life < 0.5 ? s.life * 2 : 1);
    dummy.updateMatrix();
    IMB.ratling.setMatrixAt(i, dummy.matrix);
    IMG.ratling.setMatrixAt(i, dummy.matrix);
    IMB.ratling.setColorAt(i, tmpC.setScalar(1));
  }
  for (const k in IMB) {
    const n = Math.min(MOB_CAP, cnt[k]);
    IMB[k].count = IMG[k].count = n;
    IMB[k].instanceMatrix.needsUpdate = IMG[k].instanceMatrix.needsUpdate = true;
    if (IMB[k].instanceColor) IMB[k].instanceColor.needsUpdate = true;
  }
  let n = 0;
  for (const g of W.gems) {
    if (n >= 600) break;
    dummy.position.set(g.x, g.y + 0.35 + Math.sin(G.time * 3 + g.ph) * 0.08, g.z);
    dummy.rotation.set(0, G.time * 2 + g.ph, 0);
    // Tiers: blue < 3, green < 10, red < 30, violet beyond.
    const s = g.v >= 30 ? 2.4 : g.v >= 10 ? 1.9 : g.v >= 3 ? 1.35 : 1;
    dummy.scale.set(s, s * 1.7, s);
    dummy.updateMatrix();
    gemIM.setMatrixAt(n, dummy.matrix);
    gemIM.setColorAt(n++, tmpC.setHex(g.v >= 30 ? 0xc080ff : g.v >= 10 ? 0xff4a6a : g.v >= 3 ? 0x6aff6a : 0x4ad0ff));
  }
  gemIM.count = n;
  gemIM.instanceMatrix.needsUpdate = true;
  if (gemIM.instanceColor) gemIM.instanceColor.needsUpdate = true;
  n = 0;
  for (const g of W.scraps) {
    if (n >= 300) break;
    dummy.position.set(g.x, g.y + 0.3 + Math.sin(G.time * 3 + g.ph) * 0.06, g.z);
    dummy.rotation.set(PI2 * 0.6, G.time * 2 + g.ph, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    scrapIM.setMatrixAt(n++, dummy.matrix);
  }
  scrapIM.count = n;
  scrapIM.instanceMatrix.needsUpdate = true;
  n = 0;
  for (const c of W.cores) {
    if (n >= 40) break;
    dummy.position.set(c.x, c.y + 0.7 + Math.sin(G.time * 4 + c.ph) * 0.15, c.z);
    dummy.rotation.set(G.time * 1.5, G.time * 2.3, 0);
    dummy.scale.setScalar(1 + 0.15 * Math.sin(G.time * 8 + c.ph));
    dummy.updateMatrix();
    coreIM.setMatrixAt(n, dummy.matrix);
    coreIM.setColorAt(n, tmpC.setHSL((G.time * 0.3 + c.ph) % 1, 0.9, 0.6));
    n++;
  }
  coreIM.count = n;
  coreIM.instanceMatrix.needsUpdate = true;
  if (coreIM.instanceColor) coreIM.instanceColor.needsUpdate = true;
  // Projectiles: player shots are stretched along their flight path; enemy globs tumble.
  const putP = (im, arr, streak) => {
    let n = 0;
    for (const p of arr) {
      if (n >= 320) break;
      dummy.position.set(p.x, p.y, p.z);
      if (streak) {
        const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
        _dir.set(p.vx / sp, p.vy / sp, p.vz / sp);
        dummy.quaternion.setFromUnitVectors(_fwd, _dir);
        const s = p.size || 1;
        dummy.scale.set(s * 0.8, s * 0.8, s * Math.min(3, 1 + sp * 0.07));
      } else {
        dummy.rotation.set(G.time * 5, G.time * 3, 0);
        dummy.scale.setScalar(p.size || 1);
      }
      dummy.updateMatrix();
      im.setMatrixAt(n, dummy.matrix);
      im.setColorAt(n, tmpC.setHex(p.col));
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };
  putP(pprojIM, W.pproj, true);
  putP(eprojIM, W.eproj, false);
  for (const p of W.parts) {
    p.life -= dt;
    if (!p.ng) p.vy -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const gy = floorY(p.x, p.z);
    if (p.y <= gy && p.vy < 0) { if (p.b && Math.random() < 0.35) decal(p.x, gy, p.z, rand(0.35, 0.8), p.c); p.life = 0; }
  }
  keep(W.parts, p => p.life > 0);
  n = 0;
  for (const p of W.parts) {
    if (n >= PART_CAP) break;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(p.b ? p.s : Math.min(1, p.life * 2.5) * p.s);
    dummy.updateMatrix();
    partIM.setMatrixAt(n, dummy.matrix);
    partIM.setColorAt(n, tmpC.setHex(p.c));
    n++;
  }
  partIM.count = n;
  partIM.instanceMatrix.needsUpdate = true;
  if (partIM.instanceColor) partIM.instanceColor.needsUpdate = true;
  n = 0;
  for (const g of W.gibs) {
    g.life -= dt;
    if (!g.rest) {
      g.vy -= GRAV * dt;
      const ox = g.x, oz = g.z;
      g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; g.rx += g.sp * dt;
      const gy = floorY(g.x, g.z) + 0.06;
      if (g.y < gy) {
        if (gy - g.y > 1.5) { g.x = ox; g.z = oz; g.vx *= -0.4; g.vz *= -0.4; }
        else {
          g.y = gy;
          if (!g.hit) { g.hit = true; decal(g.x, gy - 0.05, g.z, rand(0.4, 0.9), g.c === 0x5a0808 ? 0x7a0808 : g.c); }
          if (Math.abs(g.vy) < 1.8) g.rest = true;
          else { g.vy *= -0.3; g.vx *= 0.55; g.vz *= 0.55; g.sp *= 0.5; }
        }
      }
    }
    if (n < 400) {
      dummy.position.set(g.x, g.y, g.z);
      dummy.rotation.set(g.rx, g.ry, 0);
      const k = Math.min(1, g.life) * g.s;
      dummy.scale.set(k * g.l, k, k);
      dummy.updateMatrix();
      gibIM.setMatrixAt(n, dummy.matrix);
      gibIM.setColorAt(n, tmpC.setHex(g.c));
      n++;
    }
  }
  keep(W.gibs, g => g.life > 0);
  gibIM.count = n;
  gibIM.instanceMatrix.needsUpdate = true;
  if (gibIM.instanceColor) gibIM.instanceColor.needsUpdate = true;
  tickFx(dt);
  n = 0;
  if (P.scent && G.state === 'play') for (const sp of W.scentPaths) {
    const L = sp.p.length;
    for (let i = 0; i < L && n < 600; i++) {
      const k = sp.p[i], x = toW(k % M.W), z = toW((k / M.W) | 0), w = Math.max(0, Math.sin(i * 0.8 + G.time * (sp.loop ? 3 : -6)));
      dummy.position.set(x, floorY(x, z) + 0.45 + w * 0.25, z);
      dummy.rotation.set(0, G.time, 0);
      dummy.scale.setScalar(i === L - 1 && !sp.loop ? 2.4 : 0.5 + w * 0.9);
      dummy.updateMatrix();
      scentIM.setMatrixAt(n, dummy.matrix);
      scentIM.setColorAt(n, tmpC.setHex(sp.col));
      n++;
    }
  }
  scentIM.count = n;
  scentIM.instanceMatrix.needsUpdate = true;
  if (scentIM.instanceColor) scentIM.instanceColor.needsUpdate = true;
  syncScent();
  post.uniforms.scent.value += ((P.scent && G.state !== 'menu' ? 1 : 0) - post.uniforms.scent.value) * Math.min(1, 6 * dt);
  // Health bars over big and elite enemies.
  let bi = 0;
  if (G.state === 'play') for (const e of W.enemies) {
    if (!e.bar || e.boss || e.dead || e.hidden || bi >= BAR_N) continue;
    if (Math.hypot(e.x - P.x, e.z - P.z) > 26) continue;
    _v.set(e.x, e.y + e.h * (e.pred ? 1.45 : 1) + 0.25, e.z).project(camera);
    if (_v.z > 1) continue;
    const el = barPool[bi++];
    el.style.display = 'block';
    el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`;
    el.firstChild.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
    el.firstChild.style.background = e.corrupt ? '#' + CORRUPT[e.corrupt].col.toString(16).padStart(6, '0') : '#d8342c';
  }
  for (; bi < BAR_N; bi++) barPool[bi].style.display = 'none';
  // Real point lights on the nearest lamps.
  const blackout = run.mods && run.mods.includes('blackout');
  const ls = W.lamps.map(l => [(l.x - P.x) ** 2 + (l.z - P.z) ** 2, l]).sort((a, b) => a[0] - b[0]);
  lampL.forEach((L, i) => {
    const l = ls[i];
    if (!l || blackout) { L.visible = false; return; }
    L.visible = true;
    L.position.set(l[1].x, l[1].y, l[1].z);
    L.intensity = (3.6 + Math.sin(G.time * 9 + i * 3) * 0.4) * (1 - G.darkness * 0.9);
  });
  const lr = $('lockRet'), lk = G.lockOn;
  if (lk && G.state === 'play' && !lk.hidden) {
    _v.set(lk.x, lk.y + lk.h * 0.55, lk.z).project(camera);
    lr.style.display = 'block';
    lr.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%) rotate(${G.time * 90}deg)`;
  } else lr.style.display = 'none';
}

export function animate(dt) {
  const rat = G.rat;
  if (!rat) return;
  const mv = Math.hypot(P.vx, P.vz), r01 = Math.min(1, mv / 5), t = G.time, bulk = rat.bulk || 1;
  rat.g.position.set(P.x, P.y, P.z);
  rat.g.rotation.y += angD(P.facing, rat.g.rotation.y) * (1 - Math.exp(-18 * dt));
  const at = P.atk > 0 ? Math.sin(P.atk / 0.22 * Math.PI) : 0, chew = P.chewing ? Math.abs(Math.sin(t * 22)) : 0;
  rat.body.position.y = 0.52 + (P.onGround ? Math.abs(Math.sin(t * 16)) * 0.05 * r01 : 0);
  rat.body.position.z = at * 0.18;
  rat.body.rotation.x = P.climbing ? -1.1 : P.onGround ? 0.06 * r01 + at * 0.15 : -0.12;
  rat.head.position.y = 0.78 + (P.onGround ? Math.sin(t * 16) * 0.025 * r01 : 0.04);
  rat.head.position.z = 0.66 + at * 0.2;
  rat.head.rotation.x = P.climbing ? -1 : chew * 0.2;
  rat.jaw.rotation.x = 0.22 + at * 0.7 + chew * 0.6 + (P.carry ? 0.5 : 0);
  let sx = 1, sy = P.onGround ? 1 : clamp(1 + P.vy * 0.012, 0.88, 1.15), sz = 1;
  if (P.squeeze) { sy = 0.55; sx = 0.72; sz = 1.25; }
  rat.g.scale.set(sx / Math.sqrt(sy) * bulk, sy * bulk, sz / Math.sqrt(sy) * bulk);
  rat.legs.forEach((l, i) => {
    l.rotation.x = P.climbing ? Math.sin(t * 18 + i * 1.6) * 0.9 - 1 : P.onGround ? Math.sin(t * 16 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * r01 + (i < 2 ? -at * 1.4 : 0) : (i < 2 ? -0.6 : 0.6);
  });
  rat.tail.forEach((s, i) => {
    s.rotation.y = Math.sin(t * (3 + r01 * 5) - i * 0.8) * (0.16 + r01 * 0.1);
    s.rotation.x = i ? 0.1 + (P.onGround ? 0 : 0.03) + (P.glideT > 0 ? -0.05 : 0) : 0.2;
  });
  // Melee swing: wind-up twist, a fast strike with the leading forepaw and a bite, then follow-through.
  if (P.swing > 0) {
    const len = P.swingHeavy ? 0.3 : 0.24, u = 1 - P.swing / len, side = P.swingSide || 1;
    const strike = Math.sin(clamp((u - 0.18) / 0.5, 0, 1) * Math.PI);
    const tw = u < 0.2 ? -side * 0.45 * (u / 0.2) : side * 0.6 * Math.sin(clamp((u - 0.2) / 0.4, 0, 1) * Math.PI / 2) * (1 - clamp((u - 0.65) / 0.35, 0, 1));
    rat.body.rotation.y = tw;
    rat.head.rotation.y = tw * 0.8;
    rat.body.position.z = strike * 0.22;
    rat.head.position.z = 0.66 + strike * 0.26;
    rat.jaw.rotation.x = 0.22 + strike * 0.9;
    const paw = rat.legs[side > 0 ? 1 : 0];
    paw.rotation.x = -1.9 * strike;
    paw.rotation.z = side * 0.9 * strike;
    rat.tail.forEach((s, i) => { s.rotation.y -= tw * 0.25 * (1 - i / rat.tail.length); });
  } else if (P.throwT > 0) {
    // Ranged throw: rear back, whip the forepaw over, a little recoil through the body.
    const u = 1 - P.throwT / 0.26, paw = rat.legs[1];
    paw.rotation.x = u < 0.35 ? -2.4 * (u / 0.35) : -2.4 + 3.0 * ((u - 0.35) / 0.65);
    paw.rotation.z = 0.35 * Math.sin(u * Math.PI);
    rat.body.position.z = -0.12 * Math.sin(u * Math.PI);
    rat.head.rotation.x = -0.25 * Math.sin(u * Math.PI);
    rat.body.rotation.y = 0.2 * Math.sin(u * Math.PI);
  } else {
    rat.body.rotation.y *= Math.max(0, 1 - dt * 12);
    rat.head.rotation.y *= Math.max(0, 1 - dt * 12);
    rat.legs.forEach(l => { l.rotation.z *= Math.max(0, 1 - dt * 12); });
  }
  rat.g.visible = P.inv > 0 && P.roll <= 0 && G.state === 'play' ? Math.floor(t * 24) % 2 === 0 : true;
  rat.head.visible = P.roll <= 0;
  if (P.roll > 0) { const u = 1 - P.roll / 0.3; rat.body.rotation.x = -u * TAU; rat.body.position.y = 0.42; rat.g.scale.set(bulk, 0.8 * bulk, 0.9 * bulk); }
  let gy = floorY(P.x, P.z, true);
  if (gy > P.y + 0.05) gy = P.y;
  forPlatsNear(P.x, P.z, 0, p => { if (!p.carried && Math.abs(P.x - p.x) < p.w / 2 && Math.abs(P.z - p.z) < p.d / 2 && p.y <= P.y + 0.05 && p.y > gy) gy = p.y; });
  blob.position.set(P.x, gy + 0.03, P.z);
  blob.scale.setScalar(clamp(1 - (P.y - gy) * 0.08, 0.4, 1));

  // Camera: orbit the rat; if a building would hide it, lift the camera and then pull it in.
  tgt.set(P.x + G.camOff.x, P.y + 1, P.z + G.camOff.z);
  const place = (pitch, dist) => want.set(tgt.x - Math.sin(G.camYaw) * dist * Math.cos(pitch), tgt.y + dist * Math.sin(pitch), tgt.z - Math.cos(G.camYaw) * dist * Math.cos(pitch));
  let fix = 0;
  if (P.inDuct) fix = 0.55; // cutaway: look down on the maze
  else if (G.state === 'play' || G.state === 'menu') {
    for (let s = 0; s <= 10; s++) {
      const f = s / 10;
      place(G.camPitch + (1.38 - G.camPitch) * Math.min(1, f * 1.6), G.camDist * (1 - Math.max(0, f - 0.6) * 1.5));
      if (!segBlocked(tgt.x, tgt.y, tgt.z, want.x, want.y, want.z)) { fix = f; break; }
      fix = f;
    }
  }
  camFix += (fix - camFix) * Math.min(1, (fix > camFix ? 8 : 2.5) * dt);
  place(G.camPitch + (1.38 - G.camPitch) * Math.min(1, camFix * 1.6), G.camDist * (1 - Math.max(0, camFix - 0.6) * 1.5));
  G.camPos.lerp(want, 1 - Math.exp(-10 * dt));
  camLook.lerp(tgt, 1 - Math.exp(-14 * dt));
  G.shake = Math.max(0, G.shake - dt * 1.6);
  camera.position.copy(G.camPos).add(shakeV.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(G.shake * 0.45 * settings.shake));
  camera.lookAt(camLook);
  sun.position.set(P.x + 10, P.y + 26, P.z + 8);
  sun.target.position.set(P.x, P.y, P.z);
  lantern.position.set(P.x, P.y + 2.4, P.z);
  G.flash = Math.max(0, G.flash - dt * 3);
  const U = post.uniforms;
  U.hurt.value = G.flash;
  U.gold.value = G.flashGold || 0;
  U.time.value = G.time;
  U.low.value = G.state === 'play' && run.hp < st.maxHp * 0.3 ? 1 : 0;
  U.moon.value += ((run.moon && G.state !== 'menu' ? 1 : 0) - U.moon.value) * Math.min(1, 2 * dt);
  U.dark.value = G.darkness;
  U.toxic.value += ((isSewer() && G.state !== 'menu' ? 1 : 0) - U.toxic.value) * Math.min(1, 2 * dt);
}
