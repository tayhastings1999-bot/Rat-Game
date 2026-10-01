// Route choice: after a boss falls there are up to three ways on, each one
// labelled with what waits at the start of the next district.
import * as THREE from 'three';
import { shuffleR } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { M, gi, toW, floorY } from '../world/grid.js';
import { addExit, addChest } from '../world/build.js';
import { dropFood } from '../combat/combat.js';
import { dropCrate } from './progress.js';
import { openLevelUp } from '../ui/screens.js';
import { banner } from '../ui/hud.js';

export const ROUTES = {
  hoard: { name: 'Hoard', desc: 'Start beside a premium chest', col: 0xffb040, css: '#ffb040' },
  armory: { name: 'Armory', desc: 'Start with a weapon crate', col: 0x6ad0ff, css: '#6ad0ff' },
  shrine: { name: 'Shrine', desc: 'A free Breakthrough-grade pick', col: 0xb35cff, css: '#b35cff' },
  safe: { name: 'Safe House', desc: 'Full heal and a food stash', col: 0x6ad06a, css: '#6ad06a' },
  blood: { name: 'Blood Road', desc: 'Threat +1.5 · +10% Dominance for the run · cursed chest', col: 0xff3a3a, css: '#ff3a3a' },
};

function label(text, sub, css) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,8,12,.75)'; x.fillRect(0, 0, 256, 96);
  x.strokeStyle = css; x.lineWidth = 4; x.strokeRect(2, 2, 252, 92);
  x.fillStyle = css; x.font = 'bold 34px monospace'; x.textAlign = 'center'; x.fillText(text, 128, 42);
  x.fillStyle = '#f4efe6'; x.font = '15px monospace'; x.fillText(sub.length > 30 ? sub.slice(0, 29) + '…' : sub, 128, 74);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(5, 1.9, 1);
  s.renderOrder = 10;
  return s;
}

/** Boss dead: open up to three labelled exits, far from the rat and from each other. */
export function openRoutes(kind) {
  const cand = W.rooms.map(r => ({ r, k: gi(r.cx, r.cy) })).filter(c => M.flow[c.k] >= 0).sort((a, b) => M.flow[b.k] - M.flow[a.k]);
  const spots = [];
  for (const c of cand) {
    const x = toW(c.r.cx), z = toW(c.r.cy);
    if (Math.hypot(x - P.x, z - P.z) < 16 || spots.some(s => Math.hypot(s.x - x, s.z - z) < 22)) continue;
    spots.push({ x, z });
    if (spots.length >= 3) break;
  }
  if (!spots.length) for (const r of W.rooms) { const x = toW(r.cx), z = toW(r.cy); if (Math.hypot(x - P.x, z - P.z) > 12) { spots.push({ x, z }); break; } }
  const kinds = shuffleR(Object.keys(ROUTES).slice());
  G.exits = [];
  spots.forEach((s, i) => {
    addExit(s.x, s.z, kind);
    const ex = G.exitD, R = ROUTES[kinds[i]];
    ex.route = kinds[i];
    ex.beam.material.color.setHex(R.col);
    const lb = label(R.name, R.desc, R.css);
    lb.position.set(0, 5, 0);
    ex.g.add(lb);
    G.exits.push(ex);
  });
  if (G.exits.length > 1) banner('Choose your road', G.exits.map(e => ROUTES[e.route].name).join(' · ') + ' · F to sniff them out');
}

/** Called just after arriving in a new district. */
export function applyRoute(r) {
  if (!r) return;
  const R = ROUTES[r], gy = floorY(P.x, P.z);
  if (r === 'hoard') addChest(P.x + 2, gy, P.z, true);
  else if (r === 'armory') dropCrate(P.x + 1.5, gy, P.z);
  else if (r === 'shrine') { run.btPick = (run.btPick || 0) + 1; run.pendingLv++; setTimeout(() => { if (G.state === 'play') openLevelUp(); }, 600); }
  else if (r === 'safe') { run.hp = st.maxHp; for (let i = 0; i < 2; i++) dropFood(P.x + 1.5 + i, gy, P.z); }
  else if (r === 'blood') { run.threatBase = (run.threatBase || 0) + 1.5; run.domMul = (run.domMul || 1) * 1.1; addChest(P.x + 2, gy, P.z, false, true); addChest(P.x - 2, gy, P.z, true); }
  banner(R.name, R.desc);
}
