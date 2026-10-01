// Telegraphed area attacks and lingering ground puddles (fire, poison, sludge).
import * as THREE from 'three';
import { keep } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { flameTex } from '../render/textures.js';
import { fx, boom } from '../fx/fx.js';
import { floorY } from '../world/grid.js';
import { hit, hurtP } from './combat.js';

const PUD_CAP = 90;
const pudSpr = [];
for (let i = 0; i < PUD_CAP; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.visible = false;
  scene.add(s);
  pudSpr.push(s);
}
/** kind → [colour, damage per tick]. Enemy-owned puddles ('e') hurt the rat; 'p' ones hurt the horde. */
const PUD = { fire: [0xff7a2a, 5], poison: [0x8ad040, 4], sludge: [0x6ab030, 9], pfire: [0xff9a3a, 12] };

export function puddle(kind, x, z, R, t, own) {
  if (W.puddles.length >= PUD_CAP) W.puddles.shift();
  W.puddles.push({ kind, x, z, y: floorY(x, z), R, t, max: t, own, tick: 0 });
}

/** Telegraph a circle on the ground, then hit whatever is still inside when it fires. */
export function warn(x, z, R, t, dmg, o = {}) {
  const y = o.y ?? floorY(x, z);
  fx('warn', x, y, z, R, o.col || 0xffb020, t, 0, 0.5);
  fx('ring', x, y, z, R, o.col || 0xffd040, t, 0, 0.9);
  W.hazQ.push({ x, y, z, R, t, dmg, o });
}

export function tickHaz(dt) {
  P.slowT = (P.slowT || 0) - dt;
  for (const h of W.hazQ) {
    h.t -= dt;
    if (h.t > 0) continue;
    h.done = true;
    if (h.dmg && Math.hypot(P.x - h.x, P.z - h.z) < h.R && Math.abs(P.y - h.y) < (h.o.tall || 2.6)) {
      hurtP(h.dmg, h.o.kb ? { x: h.x, z: h.z } : null);
      if (h.o.slow) P.slowT = 1.4;
      if (h.o.pull) { P.vy = Math.max(P.vy, 9); }
    }
    if (!h.o.silent) boom(h.x, h.y + 0.4, h.z, Math.min(h.R * 1.2, 6), h.o.col || 0xff6a3a);
    if (h.o.fn) h.o.fn();
  }
  keep(W.hazQ, h => !h.done);

  let i = 0;
  for (const p of W.puddles) {
    p.t -= dt;
    p.tick -= dt;
    const D = PUD[p.kind];
    if (p.tick <= 0) {
      p.tick = 0.45;
      if (p.own === 'e') {
        if (!(st.toxImmune && p.kind === 'poison') && Math.hypot(P.x - p.x, P.z - p.z) < p.R && Math.abs(P.y - p.y) < 1.2) hurtP(D[1] * (1 + (run.T || 0) * 0.06), null, true);
      } else {
        for (const e of W.enemies) {
          if (!e.dead && !e.fly && Math.hypot(e.x - p.x, e.z - p.z) < p.R + e.r && Math.abs(e.y - p.y) < 1.5) {
            hit(e, D[1], null, 0, p.kind === 'sludge' ? 'sludge' : 'fire', true);
            e.slow = 0.6;
            if (p.kind === 'sludge') { e.pT = Math.max(e.pT, 1.5); e.pD = Math.max(e.pD || 0, 4); }
          }
        }
      }
    }
    const sp = pudSpr[i++];
    if (sp) {
      sp.visible = true;
      sp.position.set(p.x, p.y + 0.35, p.z);
      const k = Math.max(0, Math.min(1, p.t, (p.max - p.t) * 4));
      sp.scale.set(p.R * 2.3 * k, p.R * 1.1 * k, 1);
      sp.material.color.setHex(D[0]);
      sp.material.opacity = 0.6 + 0.15 * Math.sin(G.time * 9 + p.x);
    }
  }
  for (; i < pudSpr.length; i++) pudSpr[i].visible = false;
  keep(W.puddles, p => p.t > 0);
}
