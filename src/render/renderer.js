// WebGL renderer, low-res pixel render target and the post-process pass.
import * as THREE from 'three';
import { $ } from '../core/util.js';
import { ps1Snap } from './ps1.js';

export const canvas = $('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = true;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 190);
/** Everything that belongs to the current district; cleared on regeneration. */
export const world = new THREE.Group();
scene.add(world);

// The scene is drawn at a low, PS1-like resolution into `rt`, then upscaled with nearest filtering.
const rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

export const post = new THREE.ShaderMaterial({
  uniforms: {
    t: { value: rt.texture }, time: { value: 0 }, res: { value: new THREE.Vector2(2, 2) },
    hurt: { value: 0 }, low: { value: 0 }, scent: { value: 0 }, moon: { value: 0 }, dark: { value: 0 }, toxic: { value: 0 },
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader: `uniform sampler2D t;uniform float time,hurt,low,scent,moon,dark,toxic;uniform vec2 res;varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec2 o=(vUv-.5)*.0016;
    vec3 c=vec3(texture2D(t,vUv+o).r,texture2D(t,vUv).g,texture2D(t,vUv-o).b);
    c=pow(max(c,0.),vec3(1./2.2));
    float l=dot(c,vec3(.3,.59,.11));c=mix(vec3(l),c,1.12);c=(c-.5)*1.06+.52;
    // Scent: the world drains to grey; only saturated, bright 'toxic' marks burn through.
    float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b));
    float tox=smoothstep(.42,.7,mx-mn)*smoothstep(.5,.8,mx);
    vec3 grey=vec3(l*.5,l*.54,l*.6);
    c=mix(c,mix(grey,c*1.3,tox),scent*.92);
    c=mix(c,c*vec3(1.35,.5,.45)+vec3(.05,0.,0.),moon*.7);
    c=mix(c,c*vec3(.75,1.15,.6),toxic*.35);
    c+=(hash(floor(vUv*res)+fract(time*7.)*vec2(37.,91.))-.5)*.03;
    vec2 q=vUv-.5;float v=dot(q,q);c*=1.-v*.55;
    c*=1.-dark*clamp(v*5.5+.25,0.,.97);
    c=mix(c,vec3(.7,.08,.05),clamp(hurt*.45+low*v*1.8*(.6+.4*sin(time*6.)),0.,.65));
    // PS1 15-bit colour (32 levels per channel) with a 4x4 ordered dither.
    vec2 pp=mod(floor(vUv*res),4.);
    float b=mod(pp.x*4.+pp.y*11.+pp.x*pp.y*7.,16.)/16.-.5;
    c=floor(clamp(c,0.,1.)*31.+.5+b*.9)/31.;
    gl_FragColor=vec4(c,1.);
  }`,
});
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

/**
 * Render at a PlayStation-like vertical resolution (default 300 lines) and let
 * it drop towards 216 lines automatically when frames run long, then climb
 * back when there is headroom. Upscaled with nearest filtering.
 */
export const res = { lines: 300, max: 300, min: 216, slowT: 0, fastT: 0 };
export function resize() {
  const h = Math.max(180, Math.min(Math.round(innerHeight * 0.6), res.lines)), w = Math.max(240, Math.round(h * innerWidth / Math.max(1, innerHeight)));
  renderer.setSize(w, h, false);
  rt.setSize(w, h);
  post.uniforms.res.value.set(w, h);
  ps1Snap.value.set(w * 0.5, h * 0.5);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
/** Called once per frame with the real frame time (seconds). */
export function adaptResolution(frameDt) {
  if (frameDt > 1 / 42) { res.slowT += frameDt; res.fastT = 0; } else if (frameDt < 1 / 57) { res.fastT += frameDt; res.slowT = 0; }
  if (res.slowT > 1.5 && res.lines > res.min) { res.lines = Math.max(res.min, res.lines - 28); res.slowT = 0; resize(); }
  else if (res.fastT > 6 && res.lines < res.max) { res.lines = Math.min(res.max, res.lines + 28); res.fastT = 0; resize(); }
}
addEventListener('resize', resize);
resize();

// ---------- lights ----------
export const hemi = new THREE.HemisphereLight(0xfff0dc, 0x4a3a32, 1.25);
export const sun = new THREE.DirectionalLight(0xfff0e0, 1.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0015;
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
sun.shadow.camera.updateProjectionMatrix();
/** The nearest street/sewer lamps get real point lights; the rest are glow sprites. */
export const lampL = [0, 1, 2, 3, 4].map(() => {
  const l = new THREE.PointLight(0xffb060, 4, 20, 1.3);
  scene.add(l);
  return l;
});
export const lantern = new THREE.PointLight(0xffd0a0, 1.8, 12, 1.4);
scene.add(hemi, sun, sun.target, lantern);

export function renderFrame() {
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}
