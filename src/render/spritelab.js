// Dev-only lab for the sprite batcher: open /spritelab.html under `npm run dev`.
// 160 instances, one draw call, an ortho camera at the 62° bake-target pitch, and a wall to show
// vertical-equivalent depth. The atlas is a generated grey TEST PATTERN (canvas, no PNG, never shipped):
// provenance ai:true / aiTool 'scripted test pattern (Grok Bot)'. Not art; not for review as art.
import * as THREE from 'three';
import { buildFrames, registerAtlas, pixelTex } from './atlas.js';
import { SpriteBatch } from './sprites.js';

const AI = { ai: true, aiTool: 'scripted test pattern (Grok Bot)' };
function testAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const m = document.createElement('canvas'); m.width = m.height = 256;
  const x = c.getContext('2d'), y = m.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, 256, 256);
  // 48x64 hero-size block with a feet mark and a mask band; 32x32 grunt-size block.
  x.fillStyle = '#0b0a10'; x.fillRect(0, 0, 48, 64);
  x.fillStyle = '#5c6474'; x.fillRect(1, 1, 46, 62);
  x.fillStyle = '#e8e4da'; x.fillRect(22, 59, 4, 4); x.fillRect(4, 4, 8, 8);
  y.fillStyle = '#f00'; y.fillRect(1, 30, 46, 10);
  x.fillStyle = '#0b0a10'; x.fillRect(64, 0, 32, 32);
  x.fillStyle = '#3a4052'; x.fillRect(65, 1, 30, 30);
  const frames = {
    test_block_idle_s_00: { page: 0, frame: { x: 0, y: 0, w: 48, h: 64 }, anchor: { x: 24, y: 61 }, ...AI },
    test_small_idle_s_00: { page: 0, frame: { x: 64, y: 0, w: 32, h: 32 }, anchor: { x: 16, y: 29 }, ...AI },
  };
  const at = buildFrames({ meta: { group: 'test', size: [256, 256], ppu: 32 }, frames });
  at.pages = [{ albedo: pixelTex(new THREE.CanvasTexture(c), 'albedo'), mask: pixelTex(new THREE.CanvasTexture(m), 'mask') }];
  return registerAtlas('test', at);
}

const W = innerWidth, H = innerHeight, r = new THREE.WebGLRenderer();
r.setSize(W, H); r.setClearColor(0x1e2230); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(), zoom = 20, cam = new THREE.OrthographicCamera(-zoom / 2, zoom / 2, zoom / 2 * H / W, -zoom / 2 * H / W, 0.1, 100);
const pitch = 62 * Math.PI / 180;
cam.position.set(0, Math.sin(pitch) * 30, Math.cos(pitch) * 30); cam.lookAt(0, 0, 0);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2e3242 })));
const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 2.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x484e5b }));
wall.position.set(0, 1.25, -1.2); scene.add(wall);
const at = testAtlas(), batch = new SpriteBatch(at, { cap: 160 }); scene.add(batch.mesh);
const big = at.frames.get('test_block_idle_s_00'), small = at.frames.get('test_small_idle_s_00');
const P = [0xff3b30, 0x2f8cff, 0xffd21f, 0x5cf2a0].map(c => new THREE.Color(c));
const vertical = !location.search.includes('quad');
batch.material.uniforms.uVertical.value = vertical ? 1 : 0;
function frame(t) {
  batch.clear();
  for (let i = 0; i < 160; i++) {
    const hero = i < 4, gx = (i % 16) - 7.5, gz = Math.floor(i / 16) - 4;
    const x = hero ? -3 + i * 2 : gx * 1.1, z = hero ? -0.6 : gz * 0.9 + 1.5;
    const sq = 1 + 0.12 * Math.sin(t * 4 + i);
    batch.set(i, x, 0, z, hero ? big : small, i % 2 === 1, hero ? P[i] : null, i === 5 ? 0.6 : 0, sq, 2 - sq);
  }
  batch.update(cam); r.render(scene, cam);
  document.getElementById('info').textContent = `spritelab · 160 sprites · draw calls ${r.info.render.calls} · depth ${vertical ? 'vertical-equivalent' : 'quad'} · TEST PATTERN, not art`;
  requestAnimationFrame(() => frame(performance.now() / 1000));
}
frame(0);
