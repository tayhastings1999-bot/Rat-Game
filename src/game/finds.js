// Secrets. Every level hides three to six (TUNE.secrets.min / max) of three kinds:
//   Cracked wall    a hidden courtyard or lair behind a gnawable wall
//   Squeeze room    the chamber in the middle of a crawlspace network
//   Rooftop cache   at the top of a marked drainpipe
// Finding one pays gold and XP and ticks the HUD's SECRETS n/m. Sniffing (F)
// sends out a ping: every unfound secret within TUNE.secrets.pingR flashes a
// marker for a few seconds, and the ping rises in pitch the nearer the
// closest one is. Glow Eyes keeps the nearby markers lit.
import * as THREE from 'three';
import { G, P, W, run } from '../core/state.js';
import { world } from '../render/renderer.js';
import { flameTex } from '../render/textures.js';
import { M, toG } from '../world/grid.js';
import { puff, dnum, fx } from '../fx/fx.js';
import { sfx, ping } from '../audio/audio.js';
import { scrapDrop } from '../combat/combat.js';
import { addXP } from './progress.js';
import { banner } from '../ui/hud.js';
import { curD } from '../data/world.js';
import { puOn } from './powerups.js';
import { TUNE } from '../tuning.js';
import { rng } from '../core/util.js';

export const FIND_LABEL = { wall: 'Cracked wall', squeeze: 'Squeeze room', roof: 'Rooftop cache' };
const markMat = new THREE.SpriteMaterial({ map: flameTex, color: 0xc080ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });

/** Every candidate this level offers, in a seeded order that mixes the kinds. */
function candidates(info) {
  const by = { wall: [], squeeze: [], roof: [] };
  // Sewer pockets behind a wall that looks like plain brick count as cracked walls too.
  for (const c of info.pockets || []) if (c.door && M.secret[(c.door[1]) * M.W + c.door[0]] === 1) { const xs = c.map(p => p[0]), ys = c.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys); by.wall.push({ kind: 'wall', x: (x0 + 0.5 - M.W / 2 + 0.5) * 4, z: (y0 + 0.5 - M.H / 2 + 0.5) * 4, y: 0, rect: [x0, y0, Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1] }); }
  for (const h of info.hidden || []) by.wall.push({ kind: 'wall', x: (h.x + (h.w - 1) / 2 - M.W / 2 + 0.5) * 4, z: (h.y + (h.h - 1) / 2 - M.H / 2 + 0.5) * 4, y: 0, rect: [h.x, h.y, h.w, h.h] });
  for (const n of W.ductNets || []) if (n.chamber) by.squeeze.push({ kind: 'squeeze', x: n.chamber.x, z: n.chamber.z, y: 0 });
  for (const c of W.climbs || []) if (c.cache) by.roof.push({ kind: 'roof', x: c.cache.x, z: c.cache.z, y: c.top });
  const out = [];
  for (let i = 0; out.length < 30; i++) {
    let any = false;
    for (const k of ['wall', 'squeeze', 'roof']) if (by[k][i]) { out.push(by[k][i]); any = true; }
    if (!any) break;
  }
  return out;
}

/** Register the level's secrets (called once the world is built). Secret zones have none. */
export function setupFinds(info) {
  W.finds = [];
  run.finds = { n: 0, m: 0 };
  if (curD().secret) return;
  // How many this level counts: seeded between min and max (fixed per level), as many as it can offer.
  const S = TUNE.secrets, want = S.min + Math.floor(rng.next() * (S.max - S.min + 1)), list = candidates(info).slice(0, want);
  for (const f of list) {
    const s = new THREE.Sprite(markMat);
    s.scale.setScalar(2.2);
    s.position.set(f.x, f.y + 2.4, f.z);
    s.visible = false;
    world.add(s);
    W.finds.push({ ...f, found: false, mark: s, showT: 0 });
  }
  run.finds.m = W.finds.length;
}

function found(f) {
  f.found = true;
  f.mark.visible = false;
  run.finds.n++;
  run.secretsTotal = (run.secretsTotal || 0) + 1;
  banner('Secret found', `${FIND_LABEL[f.kind]} · ${run.finds.n}/${run.finds.m}`);
  dnum(P.x, P.y + 2, P.z, 'SECRET ' + run.finds.n + '/' + run.finds.m, 'crit');
  puff(P.x, P.y + 0.8, P.z, 0xc080ff, 18, 3);
  fx('ring', P.x, P.y + 0.05, P.z, 4, 0xc080ff, 0.6);
  for (let i = 0; i < TUNE.secrets.findGold; i++) scrapDrop(P.x, P.y, P.z);
  addXP(TUNE.secrets.findXp);
  sfx('level');
}

/** Each step: spot the secrets you've reached, and fade the ping markers. */
export function tickFinds(dt) {
  if (!W.finds || !W.finds.length || G.state !== 'play') return;
  const gx = toG(P.x), gz = toG(P.z), glow = puOn('glow'), R = TUNE.secrets.pingR;
  for (const f of W.finds) {
    if (f.found) continue;
    const d = Math.hypot(f.x - P.x, f.z - P.z);
    let hit = false;
    if (f.kind === 'wall') { const [x, y, w, h] = f.rect; hit = gx >= x && gx < x + w && gz >= y && gz < y + h; }
    else if (f.kind === 'squeeze') hit = d < 2.6 && P.y < 1.5;
    else hit = d < 3 && P.y > f.y - 0.6;
    if (hit) { found(f); continue; }
    f.showT -= dt;
    f.mark.visible = f.showT > 0 || (glow && d < R * 0.6);
    if (f.mark.visible) f.mark.material.opacity = 0.6 + 0.3 * Math.sin(G.time * 6);
  }
}

/** Sniffing pings for secrets: nearby markers flash, and the tone says how close the nearest one is. */
export function pingFinds() {
  if (!W.finds || !W.finds.length) return null;
  const R = TUNE.secrets.pingR;
  let best = Infinity, shown = 0;
  for (const f of W.finds) {
    if (f.found) continue;
    const d = Math.hypot(f.x - P.x, f.z - P.z);
    best = Math.min(best, d);
    if (d < R) { f.showT = TUNE.secrets.pingT; shown++; }
  }
  if (best === Infinity) return null;
  const warm = Math.max(0, 1 - best / (R * 1.5));
  ping(warm);
  fx('ring', P.x, P.y + 0.05, P.z, R * 0.25, 0xc080ff, 0.8);
  dnum(P.x, P.y + 2.1, P.z, shown ? `${shown} secret${shown > 1 ? 's' : ''} nearby` : warm > 0.3 ? 'A secret is close…' : 'No secrets nearby', 'info');
  run.pings = (run.pings || 0) + 1;
  return { best, shown };
}

/** HUD counter text, or '' when the level has none. */
export const findsText = () => (run.finds && run.finds.m ? `SECRETS ${run.finds.n}/${run.finds.m}` : '');
