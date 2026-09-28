// PlayStation-era look for characters: vertices snap to a coarse screen grid
// (the classic wobble) and textures map affinely (no perspective correction),
// so they swim slightly as models move. Applied to creature and rat materials.
import * as THREE from 'three';

export const ps1Snap = { value: new THREE.Vector2(240, 135) };

export function ps1(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.ps1Snap = ps1Snap;
    sh.vertexShader = 'uniform vec2 ps1Snap;\nvarying float vAffW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vAffW = 1.0;
      #ifdef USE_MAP
        vMapUv *= gl_Position.w;
        vAffW = gl_Position.w;
      #endif
      gl_Position.xy = floor(gl_Position.xy / gl_Position.w * ps1Snap + 0.5) / ps1Snap * gl_Position.w;`);
    sh.fragmentShader = 'varying float vAffW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv / vAffW );
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'ps1';
  return mat;
}
