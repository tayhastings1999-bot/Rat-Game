// Ambient life that makes the districts feel inhabited: moths circling the
// nearest street lamps, steam curling out of the manhole, and drips falling
// from sewer ceilings.
import * as THREE from 'three';
import { rand } from '../core/util.js';
import { G, P, W } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { M } from '../world/grid.js';

const MOTHS = 36;
const mothIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.03, 0.09), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), MOTHS);
mothIM.frustumCulled = false;
mothIM.count = 0;
scene.add(mothIM);
const d = new THREE.Object3D();
let near = [], sortT = 0, steamT = 0, dripT = 0;

export function tickAmbient(dt) {
  if (G.state !== 'play' && G.state !== 'menu') return;
  sortT -= dt;
  if (sortT <= 0) {
    sortT = 0.6;
    near = W.lamps.map(l => [(l.x - P.x) ** 2 + (l.z - P.z) ** 2, l]).filter(a => a[0] < 900).sort((a, b) => a[0] - b[0]).slice(0, MOTHS / 3).map(a => a[1]);
  }
  let n = 0;
  const t = G.time;
  near.forEach((l, li) => {
    for (let k = 0; k < 3; k++) {
      const ph = li * 1.7 + k * 2.1, r = 0.45 + 0.25 * Math.sin(t * 1.3 + ph);
      d.position.set(l.x + Math.sin(t * (3 + k) + ph) * r, l.y - 0.2 + Math.sin(t * 5.3 + ph) * 0.25, l.z + Math.cos(t * (2.6 + k) + ph) * r);
      d.rotation.set(Math.sin(t * 30 + ph) * 0.8, t * 4 + ph, 0);
      d.updateMatrix();
      mothIM.setMatrixAt(n++, d.matrix);
    }
  });
  mothIM.count = n;
  mothIM.instanceMatrix.needsUpdate = true;
  // Steam from the manhole lid.
  const mh = G.manhole;
  steamT -= dt;
  if (mh && steamT <= 0 && Math.hypot(mh.x - P.x, mh.z - P.z) < 34) {
    steamT = 0.12;
    W.parts.push({ x: mh.x + rand(-0.9, 0.9), y: 0.2, z: mh.z + rand(-0.9, 0.9), vx: rand(-0.2, 0.2), vy: rand(0.7, 1.2), vz: rand(-0.2, 0.2), life: rand(1.2, 1.8), c: 0x8a8a90, s: rand(1.4, 2.2), ng: true });
  }
  // Drips in the sewer.
  dripT -= dt;
  if (M.kind === 'sewer' && dripT <= 0) {
    dripT = 0.18;
    W.parts.push({ x: P.x + rand(-12, 12), y: 4, z: P.z + rand(-12, 12), vx: 0, vy: -7, vz: 0, life: 0.55, c: 0x7aa0b0, s: 0.35 });
  }
}
