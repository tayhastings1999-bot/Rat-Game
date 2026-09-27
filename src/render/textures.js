// Procedural canvas textures: pixel-art surfaces for the sewer, the city and FX.
import * as THREE from 'three';
import { rand, randi, rgb, TAU } from '../core/util.js';

export function ctex(size, draw, { rep = [1, 1], srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  draw(x, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...rep);
  t.magFilter = THREE.NearestFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const noise = (x, s, n, lo, hi, w = 1, h = 1) => {
  for (let i = 0; i < n; i++) {
    const v = randi(lo, hi);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(randi(0, s - 1), randi(0, s - 1), w, randi(1, h));
  }
};
const shade = (r, g, b, k) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
const specks = (x, s, n, a0, a1) => {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(0,0,0,${rand(a0, a1)})`;
    x.fillRect(randi(0, s - 1), randi(0, s - 1), 1, 1);
  }
};

export const furTex = ctex(64, (x, s) => { x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, s, s); noise(x, s, 460, 175, 255, 1, 6); }, { srgb: false });
export const stoneTex = ctex(64, (x, s) => { x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, s, s); noise(x, s, 320, 170, 255, 2, 3); }, { srgb: false });
export const flameTex = ctex(64, x => {
  const g = x.createRadialGradient(32, 34, 2, 32, 34, 30);
  g.addColorStop(0, 'rgba(255,250,225,1)');
  g.addColorStop(0.3, 'rgba(255,200,110,.9)');
  g.addColorStop(0.7, 'rgba(255,100,40,.3)');
  g.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
});

export function tiles(col, grout, T = 16, crack = true) {
  const [r, g, b] = rgb(col);
  return ctex(64, (x, s) => {
    x.fillStyle = grout;
    x.fillRect(0, 0, s, s);
    for (let j = 0; j < s / T; j++) for (let i = 0; i < s / T; i++) {
      x.fillStyle = shade(r, g, b, rand(0.85, 1.12));
      x.fillRect(i * T + 1, j * T + 1, T - 2, T - 2);
    }
    specks(x, s, 300, 0.04, 0.18);
    if (crack) {
      x.strokeStyle = 'rgba(0,0,0,.3)';
      for (let n = 0; n < 3; n++) {
        x.beginPath();
        let px = rand(0, s), py = rand(0, s);
        x.moveTo(px, py);
        for (let q = 0; q < 4; q++) { px += rand(-6, 6); py += rand(-6, 6); x.lineTo(px, py); }
        x.stroke();
      }
    }
  });
}

export function mkBrick(col) {
  const [r, g, b] = rgb(col);
  return ctex(64, (x, s) => {
    x.fillStyle = '#3a2620';
    x.fillRect(0, 0, s, s);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
      const o = (j % 2) * 11;
      x.fillStyle = shade(r, g, b, rand(0.8, 1.15));
      x.fillRect((i * 22 + o) % s + 1, j * 13 + 1, 20, 11);
      if (o && i === 2) x.fillRect(1, j * 13 + 1, 9, 11);
    }
    specks(x, s, 240, 0.05, 0.2);
    x.fillStyle = 'rgba(80,110,50,.35)';
    for (let n = 0; n < 14; n++) x.fillRect(randi(0, s - 1), randi(40, s - 1), randi(1, 3), randi(2, 8));
  });
}

const texCache = {};
/** Floor ('f') or wall ('b') texture for a district, cached by name. */
export function texFor(kind, D) {
  const id = kind + D.name;
  if (!texCache[id]) texCache[id] = kind === 'f' ? tiles(D.floor, D.grout) : mkBrick(D.brick);
  return texCache[id];
}

export const crackTex = ctex(64, x => {
  x.strokeStyle = 'rgba(20,14,10,.9)';
  x.lineWidth = 2;
  for (let n = 0; n < 7; n++) {
    x.beginPath();
    let px = 32, py = 32;
    x.moveTo(px, py);
    for (let q = 0; q < 5; q++) { px += rand(-9, 9); py += rand(-9, 9); x.lineTo(px, py); }
    x.stroke();
  }
  x.strokeStyle = 'rgba(0,0,0,.45)';
  x.lineWidth = 3;
  x.strokeRect(2, 2, 60, 60);
});

export const metalTex = ctex(64, (x, s) => {
  x.fillStyle = '#6a7078'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 4; i++) {
    x.fillStyle = '#565c64'; x.fillRect(0, i * 16, s, 2);
    x.fillStyle = '#8a929a'; x.fillRect(0, i * 16 + 2, s, 1);
  }
  x.fillStyle = '#3a3e44';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) x.fillRect(i * 8 + 3, j * 16 + 7, 2, 2);
  noise(x, s, 120, 80, 120, 1, 1);
});

export const dryTex = ctex(64, (x, s) => {
  x.fillStyle = '#c8b894'; x.fillRect(0, 0, s, s);
  noise(x, s, 300, 150, 210, 2, 2);
  x.strokeStyle = '#8a7a5a'; x.lineWidth = 2; x.strokeRect(2, 2, s - 4, s - 4);
  x.fillStyle = '#6a5a3a';
  for (let i = 0; i < 6; i++) x.fillRect(randi(8, 56), randi(8, 56), randi(3, 8), 2);
  x.fillStyle = '#e0d4b0'; x.fillRect(10, 30, 44, 3);
});

export const plywoodTex = ctex(64, (x, s) => {
  x.fillStyle = '#a07a4a'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${randi(90, 140)},${randi(60, 90)},${randi(30, 50)},.5)`;
    x.fillRect(0, randi(0, s - 1), s, 1);
  }
  x.fillStyle = '#5a3e22';
  for (const k of [0, 21, 42]) x.fillRect(k, 0, 2, s);
  x.fillStyle = '#e8e0d0';
  x.fillRect(8, 20, 30, 6); x.fillRect(24, 36, 26, 5); // faded poster scraps
  x.fillStyle = '#d8342c'; x.fillRect(12, 44, 16, 3);
});

export const waterTex = ctex(64, (x, s) => {
  x.fillStyle = '#3a6a5a'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 80; i++) {
    x.fillStyle = `rgba(${randi(120, 180)},${randi(200, 240)},${randi(170, 210)},${rand(0.15, 0.4)})`;
    x.fillRect(randi(0, s - 1), randi(0, s - 1), randi(2, 6), 1);
  }
});
export const acidTex = ctex(64, (x, s) => {
  x.fillStyle = '#7ab020'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${randi(200, 255)},255,${randi(60, 120)},${rand(0.2, 0.5)})`;
    x.fillRect(randi(0, s - 1), randi(0, s - 1), randi(1, 4), randi(1, 4));
  }
});

// ---------- city ----------
export const asphaltTex = ctex(64, (x, s) => {
  x.fillStyle = '#4c4a50'; x.fillRect(0, 0, s, s);
  noise(x, s, 520, 55, 105, 1, 1);
  x.strokeStyle = 'rgba(10,10,12,.55)';
  for (let n = 0; n < 4; n++) {
    x.beginPath();
    let px = rand(0, s), py = rand(0, s);
    x.moveTo(px, py);
    for (let q = 0; q < 5; q++) { px += rand(-8, 8); py += rand(-8, 8); x.lineTo(px, py); }
    x.stroke();
  }
  x.fillStyle = 'rgba(20,16,30,.35)';
  x.beginPath(); x.ellipse(rand(10, 54), rand(10, 54), rand(5, 10), rand(3, 7), rand(0, 3), 0, TAU); x.fill();
});
export const sidewalkTex = tiles(0x8e8a84, '#4a4744', 32, true);
export const grassTex = ctex(64, (x, s) => {
  x.fillStyle = '#3e5a2c'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgb(${randi(40, 90)},${randi(80, 130)},${randi(30, 60)})`;
    x.fillRect(randi(0, s - 1), randi(0, s - 1), 1, randi(1, 3));
  }
  x.fillStyle = 'rgba(90,70,40,.5)';
  for (let i = 0; i < 6; i++) x.fillRect(randi(0, 60), randi(0, 60), randi(2, 5), randi(2, 4));
});
export const roofTex = ctex(64, (x, s) => {
  x.fillStyle = '#2e2c30'; x.fillRect(0, 0, s, s);
  noise(x, s, 600, 30, 80, 1, 1);
  x.fillStyle = '#4a464e'; x.fillRect(0, 0, s, 3); x.fillRect(0, 0, 3, s);
  x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(40, 36, 14, 12);
});

/** Building facades: brick or concrete with a 2x2 window grid. Returns [map, emissiveMap] (cached). */
const facadeCache = {};
export function facade(col, seed = 0) {
  const key = col + ':' + seed;
  return facadeCache[key] || (facadeCache[key] = makeFacade(col, seed));
}
function makeFacade(col, seed) {
  const [r, g, b] = rgb(col);
  const lit = [];
  const map = ctex(128, (x, s) => {
    x.fillStyle = shade(r, g, b, 0.55); x.fillRect(0, 0, s, s);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 4; i++) {
      const o = (j % 2) * 16;
      x.fillStyle = shade(r, g, b, rand(0.78, 1.12));
      x.fillRect((i * 34 + o) % s + 1, j * 13 + 1, 32, 11);
    }
    specks(x, s, 500, 0.05, 0.2);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const wx = 22 + i * 64, wy = 18 + j * 64;
      x.fillStyle = '#1a1820'; x.fillRect(wx - 3, wy - 3, 26, 34);
      const on = ((seed * 7 + i * 3 + j * 5) % 5) < 2;
      lit.push(on);
      x.fillStyle = on ? '#e8c070' : '#20242e'; x.fillRect(wx, wy, 20, 28);
      x.fillStyle = '#121016'; x.fillRect(wx + 9, wy, 2, 28); x.fillRect(wx, wy + 13, 20, 2);
      x.fillStyle = '#6a6470'; x.fillRect(wx - 4, wy + 30, 28, 3);
    }
  });
  const emissive = ctex(128, (x, s) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
    let n = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (lit[n++]) { x.fillStyle = '#ffd890'; x.fillRect(22 + i * 64, 18 + j * 64, 20, 28); }
    }
  });
  return [map, emissive];
}

export const glassTex = ctex(64, (x, s) => {
  x.fillStyle = '#2a3440'; x.fillRect(0, 0, s, s);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    x.fillStyle = Math.random() < 0.25 ? '#8ab8d8' : `rgb(${randi(40, 60)},${randi(60, 80)},${randi(80, 100)})`;
    x.fillRect(i * 16 + 1, j * 16 + 1, 14, 14);
  }
  x.fillStyle = '#6a7078';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 16, 0, 1, s); x.fillRect(0, i * 16, s, 1); }
});

export const chainTex = ctex(64, x => {
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = '#a8acb0'; x.lineWidth = 1.5;
  for (let i = -64; i < 128; i += 8) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke();
    x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke();
  }
  x.fillStyle = '#6a6e74'; x.fillRect(0, 0, 64, 3); x.fillRect(0, 0, 3, 64);
});

// ---------- FX atlas: 4 rows x 4 frames (slash, spark, explosion, blood decal) ----------
const hashN = (x, y, s) => { const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };
export const atlas = ctex(128, x => {
  const px = (X, Y, c) => { x.fillStyle = c; x.fillRect(X, Y, 1, 1); };
  for (let f = 0; f < 4; f++) {
    const ox = f * 32, w = [0.5, 1, 1.4, 1.5][f], r0 = [11, 10, 10, 12.5][f], r1 = [14, 15, 15, 15][f];
    for (let yy = 0; yy < 32; yy++) for (let xx = 0; xx < 32; xx++) {
      const dx = xx - 15.5, dy = yy - 24.5, d = Math.hypot(dx, dy), a = Math.atan2(dx, -dy);
      if (Math.abs(a) < w && d >= r0 && d <= r1) px(ox + xx, yy, f === 3 ? (d > r1 - 1.3 ? '#ffe8b8' : 'rgba(216,134,74,.55)') : d > r1 - 1.3 ? '#ffffff' : d > r1 - 2.6 ? '#ffe8b8' : '#d8864a');
      else if (f < 3 && Math.abs(a) < w + 0.14 && d >= r0 - 1 && d <= r1 + 1) px(ox + xx, yy, '#2a1008');
    }
  }
  for (let f = 0; f < 4; f++) {
    const ox = f * 32, oy = 32, L = [4, 7, 10, 11][f];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, len = k % 2 ? L * 0.6 : L;
      for (let r = f === 3 ? L * 0.6 : 0; r < len; r++) px(ox + Math.round(15.5 + Math.cos(a) * r), oy + Math.round(15.5 + Math.sin(a) * r), r < 2 ? '#ffffff' : r < len * 0.6 ? '#fff0a0' : '#ff9a3a');
    }
  }
  for (let f = 0; f < 4; f++) {
    const ox = f * 32, oy = 64, rd = [5, 9, 12, 14][f];
    for (let yy = 0; yy < 32; yy++) for (let xx = 0; xx < 32; xx++) {
      const d = Math.hypot(xx - 15.5, yy - 15.5) + (hashN(xx, yy, f) - 0.5) * 3;
      if (d > rd) continue;
      const k = d / rd;
      let c = null;
      if (f === 0) c = k < 0.6 ? '#ffffff' : '#fff0a0';
      else if (f === 1) c = k < 0.4 ? '#fff0a0' : k < 0.75 ? '#ffb040' : '#e0501c';
      else if (f === 2) c = k < 0.5 ? (hashN(xx, yy, 9) < 0.4 ? null : '#ff8030') : k < 0.85 ? '#c0301c' : '#5a1a14';
      else c = hashN(xx, yy, 3) < 0.55 ? null : k > 0.6 ? '#3a2a2a' : '#5a4040';
      if (c) px(ox + xx, oy + yy, c);
    }
  }
  for (let f = 0; f < 4; f++) {
    const ox = f * 32, oy = 96, bl = [[16, 16, 6 + f % 2]];
    for (let i = 0; i < 8 + f * 2; i++) {
      const a = hashN(i, f, 1) * TAU, d = 5 + hashN(i, f, 2) * 9;
      bl.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d, hashN(i, f, 3) * 2.2 + 0.7]);
    }
    for (let yy = 0; yy < 32; yy++) for (let xx = 0; xx < 32; xx++) {
      let ins = false, core = false;
      for (const [bx, by, br] of bl) {
        const d = Math.hypot(xx - bx, yy - by);
        if (d < br) { ins = true; if (d < br * 0.55) core = true; }
      }
      if (ins) px(ox + xx, oy + yy, core ? '#ffffff' : '#a8a8a8');
    }
  }
});
atlas.minFilter = THREE.NearestFilter;

export function atlasTex(row, col) {
  const t = atlas.clone();
  t.needsUpdate = true;
  t.repeat.set(0.25, 0.25);
  t.offset.set(col * 0.25, 1 - (row + 1) * 0.25);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}

export const arrowTex = ctex(32, x => {
  x.fillStyle = 'rgba(154,208,255,.95)';
  x.fillRect(13, 10, 6, 18);
  for (let i = 0; i < 9; i++) x.fillRect(16 - i, 2 + i, i * 2, 1);
});
