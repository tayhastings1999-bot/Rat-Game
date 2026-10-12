// Enemy colour grade (art bible §3/§4, review of PR #4). Enemies never use player hues:
// bodies collapse to ONE desaturated dark tone (keeping each model's light/dark detail),
// ~20% darker than before; glowing accents (eyes, mouths, lights) become Enemy Purple or
// Hazard Orange only. Teeth/bone and near-black details are left alone.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { TUNE } from '../tuning.js';

const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
const TONE = new THREE.Color(), PURPLE = new THREE.Color(PAL.purple), ORANGE = new THREE.Color(PAL.orange), BONE = new THREE.Color(PAL.bone);
const lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

function eachColor(geo, fn) {
  const a = geo.attributes.color;
  if (!a) return;
  for (let i = 0; i < a.count; i++) { c.fromBufferAttribute(a, i); fn(c); a.setXYZ(i, c.r, c.g, c.b); }
  a.needsUpdate = true;
}
/** Body: one dark desaturated tone, brightness follows the original luminance. */
export function gradeBody(geo) {
  const A = TUNE.art;
  TONE.setHex(A.enemyTone);
  eachColor(geo, col => {
    col.getHSL(hsl);
    if (hsl.l > 0.75 && hsl.s < 0.35) return; // teeth, bone, claws
    const L = lum(col);
    col.copy(TONE).multiplyScalar(A.enemyDark * (0.55 + 1.6 * Math.sqrt(L)));
  });
}
/** Glow: warm hues (red/orange/yellow) -> Hazard Orange, everything else -> Enemy Purple. */
export function gradeGlow(geo) {
  eachColor(geo, col => {
    col.getHSL(hsl);
    if (hsl.s < 0.25) { if (hsl.l > 0.6) col.copy(BONE); return; } // bone teeth, black pupils
    const warm = hsl.h < 0.17 || hsl.h > 0.92;
    const dim = Math.min(1, lum(col) * 3 + 0.35);
    col.copy(warm ? ORANGE : PURPLE).multiplyScalar(dim);
  });
}
