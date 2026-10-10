// See-through hole: anything standing between the camera and the rat is cut
// away in a dithered circle around the rat on screen, so walls never hide
// you and the camera never has to move. The hole only removes fragments
// that are nearer the camera than the rat and above its feet, so the floor
// or roof you stand on stays solid. Applied to every district material
// except floors and water (see applyCutaway in ducts.js).
import * as THREE from 'three';

export const fadeU = {
  fadeRat: { value: new THREE.Vector3() }, // the rat's chest, world space
  fadeCam: { value: new THREE.Vector3() }, // camera position, world space
  fadeScr: { value: new THREE.Vector3(0, 0, 0) }, // rat on screen: x, y (render-target pixels), radius (pixels)
  fadeAmt: { value: 0 }, // 0 = off, 1 = fully open at the centre
};

const VERT_HEAD = 'varying vec3 vFadeW;\n';
const VERT_BODY = `#include <project_vertex>
  #ifdef USE_INSTANCING
    vFadeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vFadeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`;
const FRAG_HEAD = `varying vec3 vFadeW;
uniform vec3 fadeRat, fadeCam, fadeScr;
uniform float fadeAmt;
float fadeBayer(vec2 p) {
  // 4x4 ordered dither threshold in [0, 1).
  float x = mod(p.x, 4.0), y = mod(p.y, 4.0);
  float a = mod(x, 2.0) * 2.0 + mod(y, 2.0), b = floor(x / 2.0) * 2.0 + floor(y / 2.0);
  float ia = a == 0.0 ? 0.0 : a == 1.0 ? 2.0 : a == 2.0 ? 3.0 : 1.0;
  float ib = b == 0.0 ? 0.0 : b == 1.0 ? 2.0 : b == 2.0 ? 3.0 : 1.0;
  return (ia * 4.0 + ib + 0.5) / 16.0;
}
`;
const FRAG_BODY = `#include <clipping_planes_fragment>
  if (fadeAmt > 0.0 && fadeScr.z > 0.0) {
    float r = length(gl_FragCoord.xy - fadeScr.xy) / fadeScr.z;
    if (r < 1.0 && vFadeW.y > fadeRat.y - 0.35 && distance(vFadeW, fadeCam) < distance(fadeRat, fadeCam) - 0.8) {
      float a = (1.0 - smoothstep(0.45, 1.0, r)) * fadeAmt;
      if (a > fadeBayer(floor(gl_FragCoord.xy))) discard;
    }
  }`;

/** Patch a material so it opens the see-through hole. Keeps any earlier onBeforeCompile. */
export function applyFade(mat) {
  if (mat.userData.fade || mat.isShaderMaterial || mat.isSpriteMaterial) return;
  mat.userData.fade = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    // Sprites and custom shaders don't share the standard chunks: leave them solid.
    if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <clipping_planes_fragment>')) return;
    Object.assign(sh.uniforms, fadeU);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <clipping_planes_fragment>', FRAG_BODY);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (key ? key() : '') + '|fade';
  mat.needsUpdate = true;
}
