// Advanced Scent (F). The world drains to grey (post shader) and only what a
// rat's nose picks up burns through in toxic colours: predator view cones,
// fresh footprints, gnaw points, and trails to loot and exits. Scent runs on a
// gauge that refills while your nose rests; the pesticide rag never runs dry.
import * as THREE from 'three';
import { PI2, keep } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { mkIM, dummy, tmpC } from '../render/pools.js';
import { dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, gi, inG, toG, toW, tAt, floorY, descend, nearOpen } from '../world/grid.js';
import { objTargets } from './objectives.js';
import { ROUTES } from './routes.js';

export const TOX = { cone: 0xff2ad8, print: 0xc8ff20, gnaw: 0x20ffc8, alert: 0xff3a20 };

// ---------- gauge ----------
export function toggleScent() {
  if (P.scent) { P.scent = false; return; }
  if (P.scentE < 1 && !st.rag) { dnum(P.x, P.y + 1.6, P.z, 'Nose needs a moment', 'info'); return; }
  P.scent = true;
  sfx('sniff');
}

// ---------- footprints ----------
const PRINT_CAP = 260, PRINT_LIFE = 22;
/** Big things leave tracks: predators, elites, mini-bosses and bosses. */
function trackPrints(dt) {
  for (const e of W.enemies) {
    if (e.dead || e.fly || !(e.pred || e.elite || e.mini || e.boss)) continue;
    if (e._px == null) { e._px = e.x; e._pz = e.z; e._pf = 0; continue; }
    const d = Math.hypot(e.x - e._px, e.z - e._pz), stride = e.boss ? 2.2 : e.pred ? 1.5 : 1.1;
    if (d < stride) continue;
    const a = Math.atan2(e.x - e._px, e.z - e._pz);
    e._pf = 1 - e._pf;
    const side = e._pf ? 1 : -1, off = (e.r || 0.5) * 0.35;
    if (W.prints.length >= PRINT_CAP) W.prints.shift();
    W.prints.push({ x: e.x + Math.cos(a) * off * side, z: e.z - Math.sin(a) * off * side, y: floorY(e.x, e.z), a, s: Math.min(2.2, 0.6 + (e.r || 0.5) * 0.6), t: PRINT_LIFE, pred: !!e.pred || !!e.boss });
    e._px = e.x; e._pz = e.z;
  }
  for (const p of W.prints) p.t -= dt;
  keep(W.prints, p => p.t > 0);
}

// ---------- trails + gnaw points ----------
let scanT = 0;
const gnaw = [];
function scan() {
  W.scentPaths = [];
  const tgt = (list, col) => {
    let b = null, bd = 1e9;
    for (const o of list) {
      const [gx, gz] = nearOpen(toG(o.x), toG(o.z)), d = M.flow[gi(gx, gz)];
      if (d >= 0 && d < bd) { bd = d; b = [gx, gz]; }
    }
    if (b) W.scentPaths.push({ col, p: descend(M.flow, b[0], b[1], 120) });
  };
  if (G.mode === 'survival' && G.exits && G.exits.length) for (const e of G.exits) tgt([e], ROUTES[e.route] ? ROUTES[e.route].col : 0x6ad06a);
  else if (G.mode === 'survival' && G.exitD) tgt([G.exitD], 0x6ad06a);
  { const ts = objTargets(); if (ts.length) tgt(ts, 0xffd040); }
  if (G.mode === 'survival' && G.manhole && run.keys) tgt([G.manhole], 0xb070ff);
  if (W.keys.length) tgt(W.keys, 0xffd040);
  if (G.boss && !G.boss.revealed) tgt([G.boss], 0xff2a60);
  if (G.evMarker) tgt([G.evMarker.e || G.evMarker], 0xffd040);
  tgt(W.caches.filter(c => !c.taken), 0xffe070);
  tgt(W.chests.filter(c => !c.open), 0xffa030);
  tgt(W.benches, 0x4aa3ff);
  if (G.mode === 'trial') { const v = W.valves.filter(v => !v.done); tgt(v.length ? v : [G.exitD], 0x6ad06a); }
  for (const e of W.enemies) if (e.pred && e.path) W.scentPaths.push({ col: TOX.alert, p: e.path.filter((_, i) => i % 2 === 0), loop: true });
  // Gnaw points: boards and hollow walls, ropes, live wires, traps, bins.
  gnaw.length = 0;
  const cx = toG(P.x), cz = toG(P.z), R = 12;
  for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
    if (!inG(x, z) || tAt(x, z) !== 3 || M.secret[gi(x, z)] === 2) continue;
    gnaw.push({ x: toW(x), y: 0.9, z: toW(z), s: M.secret[gi(x, z)] ? 1.5 : 1 });
  }
  for (const it of W.inter) if (!it.used && !(it.cd > 0) && Math.hypot(it.x - P.x, it.z - P.z) < 50) gnaw.push({ x: it.x, y: (it.y || 0) + 1, z: it.z, s: 1.2 });
  for (const t of W.traps || []) if (!t.sprung && Math.hypot(t.gx - P.x, t.gz - P.z) < 50) gnaw.push({ x: t.gx, y: t.gy + 0.4, z: t.gz, s: 1.4 });
  for (const b of W.bins) if (!b.done && Math.hypot(b.x - P.x, b.z - P.z) < 40) gnaw.push({ x: b.x, y: 1.3, z: b.z, s: 0.8 });
}

/** Smoke clouds (Sewer Sneak): you vanish inside; the horde inside is slowed and loses its rhythm. */
function tickSmoke(dt) {
  P.smoke = false;
  for (const s of W.smokes) {
    s.t -= dt;
    if (Math.random() < dt * 14) { const a = Math.random() * 6.3, r = Math.random() * s.R; W.parts.push({ x: s.x + Math.sin(a) * r, y: floorY(s.x, s.z) + 0.3, z: s.z + Math.cos(a) * r, vx: 0, vy: 0.8, vz: 0, life: 1.4, c: 0x8a8a8a, s: 3, ng: true }); }
    if (Math.hypot(P.x - s.x, P.z - s.z) < s.R) P.smoke = true;
    for (const e of W.enemies) {
      if (e.dead || e.boss || Math.hypot(e.x - s.x, e.z - s.z) > s.R) continue;
      e.slow = Math.max(e.slow || 0, 0.3);
      if (e.cd != null) e.cd = Math.max(e.cd, 0.25);
      if (e.pred && e.mode === 'hunt') e.lost = (e.lost || 0) + dt * 2;
    }
  }
  keep(W.smokes, s => s.t > 0);
  // Lurk in the dark (or smoke) for a second and your next strike is an ambush.
  if (P.shadow || P.smoke) { P.ambT = (P.ambT || 0) + dt; if (P.ambT > 1) P.ambush = 1; }
  else if (P.ambush > 0) { P.ambT = 0; P.ambush = Math.max(0, P.ambush - dt / 3); }
}

export function tickScent(dt) {
  tickSmoke(dt);
  if (P.scentE == null) P.scentE = st.scentMax;
  if (P.scent) {
    if (!st.rag) P.scentE -= dt * (run.rain ? 1.6 : 1); // rain washes scent away
    if (P.scentE <= 0) { P.scentE = 0; P.scent = false; dnum(P.x, P.y + 1.6, P.z, 'Scent fades', 'info'); }
  } else P.scentE = Math.min(st.scentMax, P.scentE + dt * 0.55 * st.scentMax / 8);
  trackPrints(dt);
  if (!P.scent) return;
  scanT -= dt;
  if (scanT <= 0) { scanT = 0.4; scan(); }
}

// ---------- rendering ----------
const printGeo = (() => {
  // A paw: one pad and four toes, flat on the ground.
  const parts = [new THREE.CircleGeometry(0.16, 6).scale(1, 1.2, 1)];
  for (const [x, y] of [[-0.15, 0.2], [-0.05, 0.27], [0.05, 0.27], [0.15, 0.2]]) parts.push(new THREE.CircleGeometry(0.055, 5).translate(x, y, 0));
  const g = new THREE.BufferGeometry(), pos = [];
  for (const p of parts) { const n = p.toNonIndexed(); pos.push(...n.attributes.position.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g.rotateX(-PI2);
})();
const addMat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const printIM = mkIM(printGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), PRINT_CAP);
const gnawIM = mkIM(new THREE.TorusGeometry(0.42, 0.07, 4, 10), new THREE.MeshBasicMaterial({ color: TOX.gnaw, transparent: true, opacity: 0.9, depthWrite: false }), 200, false);
const CONES = [];
for (let i = 0; i < 10; i++) {
  const m = new THREE.Group();
  const fan = new THREE.Mesh(new THREE.CircleGeometry(1, 16, -0.9, 1.8).rotateX(-PI2), addMat(TOX.cone, 0.28));
  const near = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.3, 24).rotateX(-PI2), addMat(TOX.cone, 0.5));
  m.add(fan, near);
  m.visible = false;
  scene.add(m);
  CONES.push({ m, fan, near });
}

export function syncScent() {
  const on = P.scent && G.state === 'play';
  let n = 0;
  if (on) for (const p of W.prints) {
    const f = p.t / PRINT_LIFE;
    dummy.position.set(p.x, p.y + 0.05, p.z);
    dummy.rotation.set(0, p.a, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    printIM.setMatrixAt(n, dummy.matrix);
    // Fresh prints burn bright; old ones fade to embers.
    printIM.setColorAt(n, tmpC.setHex(p.pred ? TOX.alert : TOX.print).multiplyScalar(0.25 + 0.75 * f));
    n++;
  }
  printIM.count = n;
  printIM.instanceMatrix.needsUpdate = true;
  if (printIM.instanceColor) printIM.instanceColor.needsUpdate = true;
  n = 0;
  if (on) for (const g of gnaw) {
    if (n >= 200) break;
    dummy.position.set(g.x, g.y + Math.sin(G.time * 3 + g.x) * 0.1, g.z);
    dummy.rotation.set(0, G.time * 2 + g.z, 0);
    dummy.scale.setScalar(g.s * (1 + 0.15 * Math.sin(G.time * 6 + g.x)));
    dummy.updateMatrix();
    gnawIM.setMatrixAt(n++, dummy.matrix);
  }
  gnawIM.count = n;
  gnawIM.instanceMatrix.needsUpdate = true;
  // View cones: how far and how wide each predator can see you right now.
  let c = 0;
  if (on) for (const e of W.enemies) {
    if (c >= CONES.length) break;
    if (e.dead || !e.pred || !e.det) continue;
    if (Math.hypot(e.x - P.x, e.z - P.z) > 45) continue;
    const C = CONES[c++], hunting = e.mode === 'hunt';
    C.m.visible = true;
    C.m.position.set(e.x, floorY(e.x, e.z) + 0.07, e.z);
    C.m.rotation.y = (e.look ?? e.ang) - PI2;
    C.fan.scale.setScalar(e.det);
    C.near.scale.setScalar(e.det * 0.3 / 0.29);
    const col = hunting ? TOX.alert : TOX.cone;
    C.fan.material.color.setHex(col);
    C.near.material.color.setHex(col);
    C.fan.material.opacity = hunting ? 0.38 + 0.12 * Math.sin(G.time * 10) : 0.26;
  }
  for (; c < CONES.length; c++) CONES[c].m.visible = false;
}

/** For tests: how much the nose currently picks up. */
export const scentInfo = () => ({ gnaw: gnaw.length, prints: W.prints.length, paths: W.scentPaths.length, cones: CONES.filter(c => c.m.visible).length });
