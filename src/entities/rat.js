// The player rat model (per class and fur skin), familiars, trial ghosts and
// the pre-rendered menu/HUD portraits.
import * as THREE from 'three';
import { rand, TAU, PI2 } from '../core/util.js';
import { G, P, W, run, meta } from '../core/state.js';
import { scene, renderer } from '../render/renderer.js';
import { furTex, stoneTex, flameTex } from '../render/textures.js';
import { Sp, Bx, Cy, Co } from '../render/models.js';
import { CLASSES, SKINS, skinOk } from '../data/classes.js';

function glow(col, s, par, x = 0, y = 0, z = 0, op = 0.8) {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
  g.scale.set(s, s, 1);
  g.position.set(x, y, z);
  par.add(g);
  return g;
}

export function makeRat(C) {
  if (skinOk(meta.skin)) C = { ...C, ...SKINS[meta.skin].over };
  const g = new THREE.Group(), L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
  const fur = L(C.fur, { map: furTex }), furD = L(new THREE.Color(C.fur).multiplyScalar(0.62).getHex(), { map: furTex }), spk = L(C.spike);
  const skin = L(0xb0786c), claw = L(0x1a1616), tooth = L(0xf0e8d8), gear = L(C.gear, { map: stoneTex }), metal = L(0x8a8690, { map: stoneTex });
  const eyeM = new THREE.MeshBasicMaterial({ color: C.eye }), mouthM = new THREE.MeshBasicMaterial({ color: 0x6a0e0e });
  const add = (geo, mat, x, y, z, par = g, r, s) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (r) m.rotation.set(...r);
    if (s) m.scale.set(...s);
    m.castShadow = true;
    par.add(m);
    return m;
  };
  const body = new THREE.Group();
  body.position.y = 0.52;
  g.add(body);
  add(Sp(0.45, 9, 7), fur, 0, 0, 0, body, null, [0.78, 0.72, 1.5]);
  add(Sp(0.34, 8, 6), furD, 0, -0.1, 0.3, body, null, [0.8, 0.7, 1]);
  for (let i = 0; i < 8; i++) add(Co(0.075 - i * 0.004, 0.44 - i * 0.02, 4), spk, 0, 0.28 - i * 0.012, 0.42 - i * 0.16, body, [-1.05, 0, 0]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) add(Co(0.05, 0.26, 4), spk, s * 0.17, 0.22, 0.36 - i * 0.2, body, [-1, 0, s * 0.55]);
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.66);
  g.add(head);
  add(Sp(0.27, 8, 6), fur, 0, 0, 0, head, null, [0.92, 0.82, 1.1]);
  add(Co(0.16, 0.52, 6), fur, 0, -0.03, 0.4, head, [PI2, 0, 0]);
  add(Sp(0.05, 5, 4), L(0x2a1a1a), 0, -0.03, 0.67, head);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.13, 0.12);
  jaw.rotation.x = 0.28;
  head.add(jaw);
  add(Bx(0.17, 0.06, 0.4), furD, 0, -0.03, 0.2, jaw);
  add(Bx(0.14, 0.05, 0.34), mouthM, 0, -0.09, 0.27, head);
  for (const s of [-1, 1]) {
    add(Co(0.028, 0.15, 3), tooth, s * 0.055, -0.14, 0.52, head, [Math.PI, 0, 0]);
    add(Co(0.022, 0.1, 3), tooth, s * 0.05, 0.03, 0.34, jaw);
    add(Sp(0.055, 6, 4), eyeM, s * 0.13, 0.07, 0.2, head);
    add(Co(0.04, 0.17, 3), spk, s * 0.14, 0.17, 0.13, head, [-0.9, 0, s * 0.4]);
    add(Cy(0.12, 0.12, 0.03, 8), skin, s * 0.18, 0.22, -0.06, head, [PI2, 0, s * 0.4]);
  }
  glow(C.eye, 0.6, head, 0, 0.08, 0.3, 0.75).scale.set(0.6, 0.35, 1);
  const legs = [];
  for (const [x, z] of [[-0.24, 0.42], [0.24, 0.42], [-0.26, -0.4], [0.26, -0.4]]) {
    const lg = new THREE.Group();
    lg.position.set(x, 0.42, z);
    g.add(lg);
    add(Cy(0.075, 0.055, 0.4, 5), furD, 0, -0.2, 0, lg);
    add(Sp(0.08, 6, 4), furD, 0, -0.4, 0.04, lg);
    for (let k = -1; k <= 1; k++) add(Co(0.02, 0.13, 3), claw, k * 0.04, -0.42, 0.14, lg, [PI2, 0, 0]);
    legs.push(lg);
  }
  const tail = [];
  let par = new THREE.Group();
  par.position.set(0, 0.5, -0.68);
  g.add(par);
  const tA = L(0xb88a78, { map: furTex }), tB = L(0x7a5248, { map: furTex });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Group();
    s.position.z = i ? -0.17 : 0;
    const r = 0.062 - i * 0.0036;
    const m = new THREE.Mesh(Cy(r * 0.85, r, 0.19, 6), i % 2 ? tB : tA);
    m.rotation.x = PI2;
    m.position.z = -0.085;
    m.castShadow = true;
    s.add(m);
    par.add(s);
    tail.push(s);
    par = s;
  }
  // Class gear.
  if (C.prim === 'rake') {
    add(Sp(0.22, 6, 4), metal, 0.28, 0.22, 0.35, body, null, [1, 0.6, 1.1]);
    add(Co(0.05, 0.25, 4), metal, 0.36, 0.4, 0.35, body, [0, 0, -0.5]);
    add(Co(0.05, 0.25, 4), metal, 0.3, 0.42, 0.2, body, [0, 0, -0.3]);
    for (const i of [0, 1]) { add(Bx(0.17, 0.15, 0.22), metal, 0, -0.33, 0.05, legs[i]); add(Co(0.03, 0.14, 3), metal, 0, -0.25, 0.18, legs[i], [PI2, 0, 0]); }
  }
  if (C.prim === 'blight' || C.prim === 'hex') {
    add(Co(0.34, C.prim === 'hex' ? 0.6 : 0.55, 8), gear, 0, 0.16, -0.08, head, [-0.5, 0, 0]);
    add(new THREE.SphereGeometry(0.5, 9, 6, 0, TAU, 0, Math.PI * 0.5), gear, 0, 0.05, -0.1, body, null, [0.9, 0.9, 1.4]);
  }
  if (C.prim === 'blight') {
    add(Cy(0.01, 0.01, 0.35, 4), metal, 0.36, 0.55, 0.52);
    add(Sp(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xa8e060 }), 0.36, 0.34, 0.52);
  }
  if (C.prim === 'hex') {
    add(Cy(0.03, 0.035, 1.7, 5), L(0x2e2218), 0.42, 0.85, 0.35);
    add(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xc890ff }), 0.42, 1.78, 0.35);
    glow(0xb46cff, 0.8, g, 0.42, 1.78, 0.35, 1);
  }
  if (C.prim === 'stone') {
    add(new THREE.TorusGeometry(0.4, 0.035, 4, 14), gear, 0, 0.1, 0.05, body, [0, PI2, 0.9]);
    add(Bx(0.26, 0.28, 0.16), gear, -0.32, 0.1, -0.15, body);
    add(Co(0.2, 0.2, 6), gear, 0, 0.2, -0.1, head, [-0.2, 0, 0]);
  }
  if (C.prim === 'gnash') {
    // Scrap-plate shoulders, a bolted jaw guard and a torn ear.
    for (const s of [-1, 1]) {
      add(Bx(0.36, 0.1, 0.46), metal, s * 0.3, 0.28, 0.3, body, [0, 0, s * 0.45]);
      add(Co(0.05, 0.2, 4), metal, s * 0.42, 0.42, 0.3, body, [0, 0, -s * 0.4]);
    }
    add(Bx(0.5, 0.12, 0.7), gear, 0, 0.36, -0.2, body);
    add(Bx(0.22, 0.08, 0.3), metal, 0, -0.07, 0.24, jaw);
    add(Bx(0.02, 0.18, 0.02), L(0x3a1a1a), 0.08, 0.02, 0.3, head, [0, 0, 0.5]);
  }
  if (C.prim === 'darts') {
    // Goggles, a flowing scarf and a dart bandolier.
    add(new THREE.TorusGeometry(0.08, 0.025, 4, 8), metal, -0.13, 0.08, 0.22, head, [0, 0.3, 0]);
    add(new THREE.TorusGeometry(0.08, 0.025, 4, 8), metal, 0.13, 0.08, 0.22, head, [0, -0.3, 0]);
    add(Bx(0.5, 0.04, 0.05), gear, 0, 0.13, 0.08, head);
    add(new THREE.TorusGeometry(0.3, 0.06, 4, 10), L(0x9ad8ff), 0, -0.12, -0.05, head, [PI2, 0, 0]);
    add(Bx(0.1, 0.02, 0.6), L(0x9ad8ff), 0.1, 0.3, -0.5, body, [-0.3, 0, 0.2]);
    add(new THREE.TorusGeometry(0.42, 0.04, 4, 14), gear, 0, 0.05, 0.1, body, [0, PI2, -0.8]);
    for (let i = 0; i < 5; i++) add(Co(0.02, 0.18, 3), L(0xd8e8ff), Math.sin(i * 0.4 - 0.8) * 0.4, 0.2 + Math.cos(i * 0.4 - 0.8) * 0.2, 0.1, body);
  }
  if (C.bulk) g.userData.bulk = C.bulk;
  return { g, body, head, legs, tail, jaw, bulk: C.bulk || 1 };
}

export function setRat(C) {
  if (G.rat) scene.remove(G.rat.g);
  G.rat = makeRat(C);
  scene.add(G.rat.g);
}

export const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false }));
blob.rotation.x = -PI2;
scene.add(blob);

export function addRunt() {
  const r = makeRat(CLASSES[run.cls]);
  r.g.scale.setScalar(0.42);
  scene.add(r.g);
  W.familiars.push({ r, x: P.x, z: P.z, y: P.y, t: rand(0, 0.5), a: 0 });
}
export function clearFamiliars() {
  for (const f of W.familiars) scene.remove(f.r.g);
  W.familiars = [];
}

const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.35, depthWrite: false });
export function makeGhostRat(cls) {
  const r = makeRat(CLASSES[cls] || CLASSES.brawler);
  r.g.traverse(o => { if (o.isMesh) o.material = ghostMat; if (o.isSprite) o.visible = false; });
  scene.add(r.g);
  return r;
}

// ---------- portraits ----------
const pScene = new THREE.Scene();
pScene.add(new THREE.HemisphereLight(0xfff0e0, 0x402828, 1.5));
{
  const l = new THREE.DirectionalLight(0xffe0c0, 2.2);
  l.position.set(-2, 3, 4);
  pScene.add(l);
  const l2 = new THREE.PointLight(0xff5a30, 6, 6, 1);
  l2.position.set(1.5, 1, -1);
  pScene.add(l2);
}
const pCam = new THREE.PerspectiveCamera(30, 1.35, 0.1, 20), pRT = new THREE.WebGLRenderTarget(162, 120);
function portrait(C, close) {
  const r = makeRat(C);
  pScene.add(r.g);
  r.g.rotation.y = -0.55;
  pCam.aspect = close ? 1 : 1.35;
  pCam.updateProjectionMatrix();
  if (close) { pCam.position.set(-0.55, 1.0, 1.9); pCam.lookAt(0, 0.78, 0.55); }
  else { pCam.position.set(-1.1, 1.4, 3.2); pCam.lookAt(0, 0.62, 0); }
  const w = close ? 120 : 162, h = 120;
  pRT.setSize(w, h);
  renderer.setRenderTarget(pRT);
  renderer.setClearColor(0, 0);
  renderer.clear();
  renderer.render(pScene, pCam);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(pRT, 0, 0, w, h, buf);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0, 1);
  pScene.remove(r.g);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d'), img = x.createImageData(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const s = ((h - 1 - yy) * w + xx) * 4, d = (yy * w + xx) * 4;
    for (let c = 0; c < 3; c++) img.data[d + c] = Math.min(255, Math.pow(buf[s + c] / 255, 1 / 2.2) * 255);
    img.data[d + 3] = buf[s + 3];
  }
  x.putImageData(img, 0, 0);
  return cv.toDataURL();
}
export const PORT = {}, FACE = {};
export function refreshPortraits() {
  for (const k in CLASSES) { PORT[k] = portrait(CLASSES[k], false); FACE[k] = portrait(CLASSES[k], true); }
}
