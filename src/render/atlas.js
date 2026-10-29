// Sprite atlas loader and frame table (RENDERER_MIGRATION_PLAN v1.1 §3, PIXEL_STYLE_GUIDE §9).
// Plumbing only: no atlas content ships with this module. A group is
//   atlas_<group>.json + atlas_<group>_<page>.png (+ _n.png normal, _m.png mask; same layout)
// JSON (JSON-Hash):
//   { meta: { group, size:[w,h], pages:[...], ppu:32, provenance:{...} },
//     frames: { "<group>_<id>_<action>_<dir>_<nn>": { page, frame:{x,y,w,h}, sourceSize:{w,h},
//               spriteSourceSize:{x,y,w,h}, anchor:{x,y}, ai:false, aiTool:null } },
//     actions: { "<id>_<action>": { fps, hold:[...], dirs:['s','se','e','ne','n'], frames:n } } }
// Textures: NearestFilter, no mipmaps; albedo sRGB, normal/mask NoColorSpace; flipY off (UVs in the JSON
// are top-left pixel rects, converted here). A missing group or frame is not an error: callers check has()
// and fall back to the procedural mesh (plan §7), and each miss is logged once.
import * as THREE from 'three';

const groups = new Map(), warned = new Set();
const base = () => (import.meta.env?.BASE_URL || '/') + 'sprites/';
const warnOnce = msg => { if (!warned.has(msg)) { warned.add(msg); console.warn('[atlas] ' + msg); } };

/** Configure a texture for pixel sprites. kind: 'albedo' | 'normal' | 'mask'. */
export function pixelTex(tex, kind = 'albedo') {
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Accept the art team's TexturePacker-style export too (heroes_v2, PIXEL_STYLE_GUIDE v1.9 §4.2):
 * meta.size {w,h} → [w,h]; meta.image/meta.mask → one page; actions "<grp>_<id>_<action>_<dir>" with a
 * frames list + ms[] → also "<id>_<action>" { fps, hold, dirs, frames } as this module expects. Pure. */
export function normalizeAtlasJson(j) {
  if (!j || !j.meta) return j;
  const m = j.meta;
  if (m.size && !Array.isArray(m.size)) m.size = [m.size.w, m.size.h];
  if (m.image && !m.files) m.files = { albedo: m.image, mask: m.mask || null };
  const acts = j.actions || {};
  for (const [k, a] of Object.entries({ ...acts })) {
    if (!Array.isArray(a.frames)) continue;
    const p = k.split('_'); if (p.length < 4) continue;
    const dir = p.pop(), action = p.pop(), id = p.slice(1).join('_'), key = `${id}_${action}`;
    const ms = a.ms || [], m0 = Math.min(...ms.filter(Boolean)), base = Number.isFinite(m0) ? m0 : 100;
    const prev = acts[key];
    acts[key] = { fps: 1000 / base, hold: ms.map(v => (v || base) / base), frames: a.frames.length, loop: a.loop !== false,
      dirs: [...new Set([...(prev?.dirs || []), dir])] };
  }
  j.actions = acts;
  return j;
}

/** Validate a frame table; returns a list of problems (empty = ok). Shared with scripts/spritelint.mjs. */
export function checkAtlasJson(j) {
  const errs = [];
  if (!j || !j.meta || !j.frames) return ['missing meta or frames'];
  const [W, H] = j.meta.size || [];
  if (!W || !H) errs.push('meta.size missing');
  for (const [k, f] of Object.entries(j.frames)) {
    if (!f.frame || !f.anchor) errs.push(`${k}: frame/anchor missing`);
    if (typeof f.ai !== 'boolean') errs.push(`${k}: ai flag missing (D13)`);
    if (!('aiTool' in f)) errs.push(`${k}: aiTool missing (D13)`);
    if (f.ai === true && !f.aiTool) errs.push(`${k}: ai:true needs aiTool`);
    if (f.frame && W && (f.frame.x + f.frame.w > W || f.frame.y + f.frame.h > H)) errs.push(`${k}: rect outside page`);
  }
  return errs;
}

/** Build the runtime frame table from parsed JSON (pure; testable without a GPU). */
export function buildFrames(j) {
  const [W, H] = j.meta.size, ppu = j.meta.ppu || 32, frames = new Map();
  for (const [k, f] of Object.entries(j.frames)) {
    const r = f.frame, ss = f.sourceSize || { w: r.w, h: r.h }, off = f.spriteSourceSize || { x: 0, y: 0, w: r.w, h: r.h };
    frames.set(k, {
      key: k, page: f.page || 0,
      uv: new THREE.Vector4(r.x / W, r.y / H, r.w / W, r.h / H), // top-left origin, flipY off
      px: [r.w, r.h],
      size: [r.w / ppu, r.h / ppu], // world units
      // anchor relative to the trimmed rect, in sprite pixels (feet pivot)
      anchor: [f.anchor.x - off.x, f.anchor.y - off.y], source: [ss.w, ss.h],
      ai: f.ai, aiTool: f.aiTool ?? null,
    });
  }
  return { meta: j.meta, frames, actions: j.actions || {} };
}

/** Load a group. Resolves to the group, or null when its files are missing (mesh fallback). */
export async function loadAtlas(group, { maps = ['albedo', 'mask'], url = base() } = {}) {
  if (groups.has(group)) return groups.get(group);
  let j;
  try {
    const res = await fetch(`${url}atlas_${group}.json`);
    if (!res.ok) throw new Error(res.status);
    j = await res.json();
  } catch { warnOnce(`no atlas for "${group}", using mesh fallback`); return null; }
  normalizeAtlasJson(j);
  const errs = checkAtlasJson(j);
  if (errs.length) { warnOnce(`atlas "${group}" invalid: ${errs.slice(0, 3).join('; ')}`); return null; }
  const at = buildFrames(j), loader = new THREE.TextureLoader(), sfx = { albedo: '', normal: '_n', mask: '_m' };
  const files = j.meta.files;
  at.pages = files ? [await (async () => {
    const page = {};
    for (const m of maps) if (files[m]) page[m] = pixelTex(await loader.loadAsync(url + files[m]), m);
    return page;
  })()] : await Promise.all((j.meta.pages || [0]).map(async p => {
    const page = {};
    for (const m of maps) page[m] = pixelTex(await loader.loadAsync(`${url}atlas_${group}_${p}${sfx[m]}.png`), m);
    return page;
  }));
  at.group = group;
  groups.set(group, at);
  return at;
}

/** Register an already-built atlas (tests, the ?spritelab debug scene, generated textures). */
export function registerAtlas(group, at) { at.group = group; groups.set(group, at); return at; }
export const getAtlas = group => groups.get(group) || null;
/** True when `key` (a frame key, or "<id>_<action>") has sprite data in a loaded group. */
export function has(key, group) {
  const list = group ? [groups.get(group)].filter(Boolean) : groups.values();
  for (const at of list) if (at.frames.has(key) || at.actions[key]) return true;
  return false;
}
/** Release a group's GPU textures (per-level groups are dropped on level change). */
export function releaseAtlas(group) {
  const at = groups.get(group);
  if (!at) return;
  for (const p of at.pages || []) for (const t of Object.values(p)) t.dispose();
  groups.delete(group);
}

// 8-way facing → exported dir + mirror (only s, se, e, ne, n are exported; §9).
const DIRS = [['e', 0], ['ne', 0], ['n', 0], ['ne', 1], ['e', 1], ['se', 1], ['s', 0], ['se', 0]];
/** Facing angle (radians, 0 = +x/east, CCW, screen space) → { dir, flip }. */
export function dirOf(angle) {
  const i = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return { dir: DIRS[i][0], flip: DIRS[i][1] };
}
/** Frame key per the naming rule: {group}_{id}_{action}_{dir}_{frame:02}. */
export const frameKey = (grp, id, action, dir, n) => `${grp}_${id}_${action}_${dir}_${String(n).padStart(2, '0')}`;
