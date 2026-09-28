// Instanced mesh pools for everything that exists in large numbers.
import * as THREE from 'three';
import { PI2 } from '../core/util.js';
import { scene } from './renderer.js';
import { GEO, MOB_GEOS, bodyMat, Bx } from './models.js';
import { atlasTex } from './textures.js';

export const dummy = new THREE.Object3D();
export const tmpC = new THREE.Color();
export const _v = new THREE.Vector3();
export const MOB_CAP = 160;

function mkIM(geo, mat, cap, col = true) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (col) m.setColorAt(0, new THREE.Color(1, 1, 1));
  m.frustumCulled = false;
  m.count = 0;
  scene.add(m);
  return m;
}

export const IMB = {}, IMG = {};
for (const k of MOB_GEOS) {
  IMB[k] = mkIM(GEO[k].body, bodyMat(), MOB_CAP); // no real-time shadows: mobs get PS1-style blob shadows
  IMG[k] = mkIM(GEO[k].glow, new THREE.MeshBasicMaterial({ vertexColors: true }), MOB_CAP, false);
}

export const gemIM = mkIM(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xff9a3a }), 600, false);
export const scrapIM = mkIM(new THREE.TorusGeometry(0.14, 0.06, 4, 6), new THREE.MeshLambertMaterial({ color: 0xa8b0b8, emissive: 0x202830, flatShading: true }), 300, false);
export const coreIM = mkIM(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial(), 40);
export const pprojIM = mkIM(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial(), 320);
export const eprojIM = mkIM(new THREE.IcosahedronGeometry(0.19, 0), new THREE.MeshBasicMaterial(), 320);
export const partIM = mkIM(Bx(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial(), 700);
export const gibIM = mkIM(Bx(0.2, 0.13, 0.13), new THREE.MeshLambertMaterial({ flatShading: true }), 400);
export const scentIM = mkIM(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }), 600);
/** Coloured ground rings under corrupted elites and warded allies. */
export const ringIM = mkIM(new THREE.RingGeometry(0.8, 1, 20).rotateX(-PI2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), 120);

export const DECAL_CAP = 140;
export const decals = [0, 1, 2, 3].map(i => {
  const m = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-PI2),
    new THREE.MeshBasicMaterial({ map: atlasTex(3, i), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    DECAL_CAP,
  );
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color());
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return { m, i: 0, n: 0 };
});
/** Soft dark discs under every creature (the PS1 way to do shadows cheaply). */
export const shadowIM = mkIM(new THREE.CircleGeometry(0.5, 8).rotateX(-PI2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.38, depthWrite: false }), 260, false);
