// Toon shading and inverted-hull outlines (art bible §3–4).
// toon(): MeshToonMaterial on a shared 3-step ramp [0.35, 0.7, 1.0] (floors may use the
// 2-step ramp). outlineMat(): a back-face hull pushed out along the normal, in Void or a
// player colour. addOutline() gives every mesh in an object its hull as a child.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { ps1 } from './ps1.js';

function ramp(vals) {
  const d = new Uint8Array(vals.length * 4);
  vals.forEach((v, i) => { d.set([v * 255, v * 255, v * 255, 255], i * 4); });
  const t = new THREE.DataTexture(d, vals.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
export const RAMP3 = ramp([0.35, 0.7, 1.0]);
export const RAMP2 = ramp([0.55, 1.0]);

/** A toon material (same options as MeshLambertMaterial; flatShading is kept). */
export const toon = (o = {}, steps = 3) => new THREE.MeshToonMaterial({ ...o, gradientMap: steps === 2 ? RAMP2 : RAMP3 });

/** Back-face hull material: pushes vertices out by w along the normal. ps1 snap keeps it glued to its body. */
export function outlineMat(w, color = PAL.void) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  ps1(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    sh.uniforms.olW = { value: w };
    sh.vertexShader = 'uniform float olW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * olW;');
    prev(sh, r);
  };
  m.customProgramCacheKey = () => 'ol';
  m.userData.outline = true;
  return m;
}

/** Add a hull child to every mesh under obj (once). colors: extra outer layers, e.g. a player colour. */
export function addOutline(obj, w, outer = null, ow = 0.02, minR = 0.1) {
  const inner = outlineMat(w), outerM = outer != null ? outlineMat(w + ow, outer) : null, meshes = [];
  // Skip tiny parts (claws, teeth, whiskers): they add draw calls but no silhouette.
  const big = o => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.scale; return o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) >= minR; };
  obj.traverse(o => { if (o.isMesh && big(o) && !o.userData.hull && !(o.material && o.material.userData && o.material.userData.outline) && o.geometry && o.geometry.attributes.normal && !o.material.transparent) meshes.push(o); });
  for (const o of meshes) {
    for (const m of outerM ? [inner, outerM] : [inner]) {
      const h = new THREE.Mesh(o.geometry, m);
      h.userData.hull = true;
      h.castShadow = h.receiveShadow = false;
      h.raycast = () => {};
      o.add(h);
    }
  }
  return obj;
}
