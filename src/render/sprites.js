// Billboard sprite batcher (RENDERER_MIGRATION_PLAN v1.1 §2, PR 4 "feature/sprite-batcher").
// One SpriteBatch per atlas page: an InstancedMesh of a unit quad with a custom ShaderMaterial.
// Unlit only in this PR (lighting is PR 6). Nothing in the game uses it yet: it is plumbing behind
// TUNE.sprite.mode (default 'mesh'), exercised only by the dev-only /spritelab.html scene.
//
// Rulings applied (PIXEL_STYLE_GUIDE v1.3 / slice-1 README):
//   * Sprites sample with NearestFilter (atlas.js pixelTex). Sharp-bilinear is for world textures only [Q3].
//   * Vertical-equivalent depth [Q2]: the quad faces the camera, but each fragment writes the depth it
//     would have on an upright plane through the feet anchor, so tall sprites don't clip into north walls.
//     (This changes plan §2's "alpha-test + depth write"; alpha-test at 0.5 is kept.)
//   * aSquash is allowed only when snapped to whole sprite pixels [Q6]: quad corners are rounded to
//     integer sprite-pixel offsets from the anchor, so squash never produces half-pixels.
// Per-instance data lives in preallocated typed arrays; set() allocates nothing.
import * as THREE from 'three';

const PPU = 32; // sprite pixels per world unit (TUNE.sprite.ppu in the integration PR)

/** CPU mirror of the shader's corner math (used by tests): offset in sprite px of one quad corner. */
export function cornerPx(u, v, w, h, ax, ay, sx = 1, sy = 1, flip = false) {
  let dx = u * w - ax, dy = ay - (1 - v) * h; // v = 1 is the top edge
  if (flip) dx = -dx;
  return [Math.round(dx * sx), Math.round(dy * sy)];
}

const VERT = /* glsl */`
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform float uPpu; uniform float uVertical;
attribute vec3 aPos; attribute vec4 aFrame; attribute vec4 aGeom; // aGeom = w, h (px), anchor x, y (px)
attribute vec4 aFx;   // squashX, squashY, flipX, flash
attribute vec3 aPlayer; attribute vec3 aTint;
varying vec2 vUv; varying vec3 vPlayer; varying vec3 vTint; varying float vFlash; varying vec2 vZW;
void main() {
  float w = aGeom.x, h = aGeom.y;
  float dx = position.x * w - aGeom.z;
  float dy = aGeom.w - (1.0 - position.y) * h;
  if (aFx.z > 0.5) dx = -dx;
  dx = floor(dx * aFx.x + 0.5); dy = floor(dy * aFx.y + 0.5); // whole sprite pixels [Q6]
  vec3 world = aPos + (uRight * dx + uUp * dy) / uPpu;
  // Upright equivalent [Q2]: slide the corner along the (ortho) view ray onto the vertical plane through
  // the feet that faces the camera's ground heading, and take that point's depth. Linear in the corner,
  // so interpolating clip z/w across the quad is exact for the ortho camera.
  vec3 nh = normalize(vec3(uFwd.x, 0.0, uFwd.z));
  float t = dot(aPos - world, nh) / dot(uFwd, nh);
  vec4 vc = projectionMatrix * viewMatrix * vec4(world + uFwd * t, 1.0);
  vZW = vc.zw;
  float u = aFx.z > 0.5 ? 1.0 - position.x : position.x;
  vUv = vec2(aFrame.x + u * aFrame.z, aFrame.y + (1.0 - position.y) * aFrame.w);
  vPlayer = aPlayer; vTint = aTint; vFlash = aFx.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap; uniform sampler2D uMask; uniform float uHasMask; uniform float uPlayerGain;
uniform vec3 uFlashCol; uniform float uVertical;
varying vec2 vUv; varying vec3 vPlayer; varying vec3 vTint; varying float vFlash; varying vec2 vZW;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * vTint;
  if (uHasMask > 0.5 && dot(vPlayer, vPlayer) > 0.0) {
    float m = texture2D(uMask, vUv).r;
    col = mix(col, col * vPlayer * uPlayerGain, step(0.5, m));
  }
  col = mix(col, uFlashCol, vFlash);
  if (uVertical > 0.5) {
    gl_FragDepth = clamp((vZW.x / vZW.y) * 0.5 + 0.5, 0.0, 1.0); // exact for the ortho camera (TD-3)
  } else gl_FragDepth = gl_FragCoord.z;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class SpriteBatch {
  /** atlas: from atlas.js (loadAtlas / registerAtlas). opts: cap, page, vertical (depth mode), name. */
  constructor(atlas, { cap = 160, page = 0, vertical = true, name = 'sprites' } = {}) {
    this.atlas = atlas; this.cap = cap; this.count = 0;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const ia = (n, name) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.aPos = ia(3, 'aPos'); this.aFrame = ia(4, 'aFrame'); this.aGeom = ia(4, 'aGeom');
    this.aFx = ia(4, 'aFx'); this.aPlayer = ia(3, 'aPlayer'); this.aTint = ia(3, 'aTint');
    geo.instanceCount = 0;
    const pg = atlas.pages?.[page] || {};
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uMap: { value: pg.albedo || null }, uMask: { value: pg.mask || null }, uHasMask: { value: pg.mask ? 1 : 0 },
        uRight: { value: new THREE.Vector3(1, 0, 0) }, uFwd: { value: new THREE.Vector3(0, -1, -1).normalize() }, uUp: { value: new THREE.Vector3(0, 1, 0) },
        uPpu: { value: atlas.meta?.ppu || PPU }, uVertical: { value: vertical ? 1 : 0 },
        uPlayerGain: { value: 2.4 }, uFlashCol: { value: new THREE.Color(0xe8e4da) }, // Bone flash
      },
      depthWrite: true, depthTest: true, transparent: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; // instances move freely; culling is per batch
    this.mesh.name = name;
  }
  /** Shared billboard basis from the camera (yaw is locked, so one basis serves every sprite). */
  update(camera) {
    const e = camera.matrixWorld.elements, u = this.material.uniforms;
    u.uRight.value.set(e[0], e[1], e[2]).normalize();
    u.uUp.value.set(e[4], e[5], e[6]).normalize();
    u.uFwd.value.set(-e[8], -e[9], -e[10]).normalize();
    this.mesh.geometry.instanceCount = this.count;
    for (const a of [this.aPos, this.aFrame, this.aGeom, this.aFx, this.aPlayer, this.aTint]) a.needsUpdate = true;
  }
  /** Write instance i. f: a frame object from atlas.frames (look it up once, not per frame, to avoid GC).
   * player: THREE.Color or null; squash: snapped in the shader; flash 0–1; tint: THREE.Color or null. */
  set(i, x, y, z, f, flip = false, player = null, flash = 0, sx = 1, sy = 1, tint = null) {
    if (i >= this.cap) return false;
    this.aPos.setXYZ(i, x, y, z);
    this.aFrame.setXYZW(i, f.uv.x, f.uv.y, f.uv.z, f.uv.w);
    this.aGeom.setXYZW(i, f.px[0], f.px[1], f.anchor[0], f.anchor[1]);
    this.aFx.setXYZW(i, sx, sy, flip ? 1 : 0, flash);
    if (player) this.aPlayer.setXYZ(i, player.r, player.g, player.b); else this.aPlayer.setXYZ(i, 0, 0, 0);
    if (tint) this.aTint.setXYZ(i, tint.r, tint.g, tint.b); else this.aTint.setXYZ(i, 1, 1, 1);
    if (i >= this.count) this.count = i + 1;
    return true;
  }
  clear() { this.count = 0; }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/** Frame index for an action at time t (s), honouring the atlas fps and per-frame holds.
 * Hit-stop freezes the caller's t, not this function (addendum #4). Rat 6's animator (PR 5) replaces this. */
export function frameAt(action, t, loop = true) {
  if (!action) return 0;
  const n = action.frames || 1, fps = action.fps || 10, hold = action.hold || [];
  let total = 0;
  for (let k = 0; k < n; k++) total += (hold[k] || 1) / fps;
  let tt = loop ? t % total : Math.min(t, total - 1e-6);
  for (let k = 0; k < n; k++) { tt -= (hold[k] || 1) / fps; if (tt < 0) return k; }
  return n - 1;
}
