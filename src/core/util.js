// Small math, formatting and RNG helpers shared by every module.
export const TAU = Math.PI * 2;
export const PI2 = Math.PI / 2;

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const chance = p => Math.random() < p;
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Signed shortest difference between two angles, in (-PI, PI]. */
export const angD = (a, b) => {
  const d = a - b;
  return ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
};

export const $ = id => document.getElementById(id);
export const hexs = h => '#' + h.toString(16).padStart(6, '0');
export const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

export const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
export const fmtT = s => fmt(s) + '.' + Math.floor((s % 1) * 10);
export const commas = n => Math.round(n).toLocaleString('en-US');

/** In-place filter: keeps the array identity so other modules' references stay valid. */
export function keep(arr, fn) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (fn(arr[i])) arr[j++] = arr[i];
  arr.length = j;
  return arr;
}

/** Replace every key of `obj` with the keys of `next` (for module-level singletons). */
export function resetObj(obj, next) {
  for (const k of Object.keys(obj)) delete obj[k];
  return Object.assign(obj, next);
}

export const hashS = s => {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
};

export function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seedable RNG used by map generation so trial maps are identical for everyone.
export const rng = { next: Math.random };
export const seedRng = seed => { rng.next = mulberry(hashS(seed)); };
export const unseedRng = () => { rng.next = Math.random; };
export const rr = (a, b) => a + rng.next() * (b - a);
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const shuffleR = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function weekSeed() {
  const d = new Date(), y = d.getUTCFullYear(), o = Date.UTC(y, 0, 1);
  const w = Math.ceil(((d - o) / 864e5 + new Date(o).getUTCDay() + 1) / 7);
  return `TRIAL-${y}-W${w}`;
}

export const loadJSON = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (_) {
    return fallback;
  }
};
export const saveJSON = (key, v) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* storage full or blocked */ }
};
