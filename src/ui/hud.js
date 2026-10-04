// In-play HUD: bars, slots, keys, objective, prompts, minimap, banners.
import { clamp, fmt, commas, hexs, $ } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { M, T, gi, inG, toG, tileAt } from '../world/grid.js';
import { CLASSES } from '../data/classes.js';
import { MODS, isSewer, nextSurfaceName } from '../data/world.js';
import { OBJ } from '../data/props.js';
import { PRIM, SPECIALS } from '../combat/arsenal.js';
import { useTarget, grabTarget, chewTarget } from '../entities/player.js';
import { activeBuffs } from '../game/forage.js';
import { bossStatus } from '../entities/bosses.js';
import { objText, objTargets } from '../game/objectives.js';
import { bossIntro } from '../game/personality.js';
import { ICON, IC_SCRAP, IC_KEY, IC_HEART } from './icons.js';
import { SIGS } from '../game/signature.js';

export function initHudIcons() {
  $('icHeart').innerHTML = IC_HEART;
}

/** The class kit on the plate: primary, special (Q), signature (G). */
export function renderSlots() {
  if (!run.cls) return;
  const C = CLASSES[run.cls];
  $('slots').innerHTML =
    `<div class="slot prim" title="${PRIM[C.prim].name}">${ICON[C.prim]}</div>` +
    `<div class="slot spec" title="Q · ${SPECIALS[C.special].name}">${ICON[C.special]}<i class="cd" id="specCd"></i><em>Q</em></div>` +
    (SIGS[run.cls] ? `<div class="slot sig" title="G · ${SIGS[run.cls].name}: ${SIGS[run.cls].desc}">${ICON.sig}<i class="cd" id="sigCd"></i><em>G</em></div>` : '');
  $('items').innerHTML = '';
}

function objective() {
  const key = !isSewer() ? (run.keys ? ' · Manhole unlocked: descend into the sewer' : ' · Manhole locked') : '';
  const ot = objText();
  if (G.exitD) return isSewer() ? 'A ladder leads up to the streets · F to sniff it out' : `The road to ${nextSurfaceName()} is open · F to sniff it out${run.keys ? ' · or take the manhole down' : ''}`;
  if (G.boss) return G.boss.revealed ? 'Boss awake' : 'Something big is awake · F to sniff it out';
  if (ot) return ot + ` · Nests left ${run.nests}`;
  return `Smash the nests · ${run.nests} left · clearing them wakes the boss${key}`;
}

export function hud() {
  $('hpFill').style.width = clamp(run.hp / st.maxHp * 100, 0, 100) + '%';
  $('hpTxt').textContent = Math.ceil(Math.max(0, run.hp)) + ' / ' + st.maxHp;
  const S = SPECIALS[CLASSES[run.cls].special], cd = $('specCd');
  if (cd) cd.style.height = (run.specT / (S.cd * st.specCd * st.cd) * 100) + '%';
  const sc = $('sigCd'), SG = SIGS[run.cls];
  if (sc && SG) sc.style.height = Math.max(0, run.sigT / (SG.cd * st.cd) * 100) + '%';
  $('xpFill').style.width = Math.min(100, run.xp / run.need * 100) + '%';
  $('lvlBig').textContent = String(run.level).padStart(2, '0');
  $('res').innerHTML =
    `<div class="r">${IC_SCRAP}<span>${Math.floor(run.scrap)}</span>${run.keys ? `<span class="keyc">${IC_KEY}<span>${run.keys}</span></span>` : ''}</div>` +
    (isSewer() ? '<span class="chip" style="--cc:#b070ff">SEWER · MUTATED HORDE</span>' : '') +
    run.mods.map(m => `<span class="chip" style="--cc:${MODS[m].col}">${MODS[m].name}</span>`).join('') +
    (run.blood > 0 ? `<span class="chip" style="--cc:#ff4a3a">BLOODLUST ×${run.blood}</span>` : '') +
    (run.rain ? '<span class="chip" style="--cc:#8ab0e0">RAIN · SCENT FADES</span>' : '') +
    (P.scent ? `<span class="chip" style="--cc:#c8ff20">SCENT ${Math.ceil(P.scentE)}s</span>` : P.scentE < st.scentMax - 0.5 ? `<span class="chip" style="--cc:#6a7a4a">Nose ${Math.round(P.scentE / st.scentMax * 100)}%</span>` : '') +
    activeBuffs().map(b => `<span class="chip" style="--cc:${hexs(b.col)}">${b.name} ${Math.ceil(b.t)}s</span>`).join('') +
    (P.perfectT > 0 ? '<span class="chip" style="--cc:#9af0ff">PERFECT · GUARANTEED CRITS</span>' : '');
  $('dmgTotal').textContent = commas(run.dmg);
  $('kills').textContent = run.kills;
  $('clock').textContent = fmt(run.time);
  $('obj').textContent = objective();
  // Boss UI stays hidden until you enter its arena (or hit it).
  const b = G.boss;
  if (b && !b.revealed && (Math.hypot(b.x - P.x, b.z - P.z) < 24 || b.hp < b.maxHp)) { b.revealed = true; run.bossHit = false; bossIntro(b); }
  $('bossWrap').style.display = b && b.revealed ? 'flex' : 'none';
  if (b) { $('bossFill').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%'; $('bossLabel').textContent = (b.label || '') + bossStatus(b); }
  $('comboFill').style.width = (run.combo || 0) + '%';
  $('comboTxt').textContent = 'COMBO';
  const tip = $('tip');
  let lab = null, prog = null;
  if (P.carry) lab = 'E · Drop ' + OBJ[P.carry.kind].name;
  else {
    const u = useTarget();
    if (u) lab = 'E · ' + u.label;
    else {
      const o = grabTarget();
      if (o) lab = 'E · Grab ' + OBJ[o.kind].name;
      else {
        const c = chewTarget();
        if (c) { lab = 'Hold E · ' + c.label; if (P.chewing) prog = P.chewT / c.time; }
        else {
          const f = P.facing, t = tileAt(P.x + Math.sin(f) * 1.4, P.z + Math.cos(f) * 1.4);
          if (t === 5 && !P.squeeze) lab = 'Hold C · Squeeze through the crevice';
          else if (t === 11 && !P.squeeze && P.y < 1) lab = 'Walk in · Crawl into the Squeeze Network';
        }
      }
    }
  }
  if (lab) { tip.style.display = 'flex'; tip.innerHTML = `<b>${lab}</b>${prog != null ? `<div class="pb"><i style="width:${prog * 100}%"></i></div>` : ''}`; }
  else tip.style.display = 'none';
}

const MAPCOL = { 11: '#6a3a8a', 7: '#141014', 1: '#5e5866', 2: '#2e5a4a', 3: '#a89468', 4: '#7aa020', 5: '#8a5a44', 8: '#2e4a26', 9: '#3e5a2c', 10: '#3a383e' };
export function drawMap(cv, px, radius) {
  const x = cv.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, cv.width, cv.height);
  // The minimap follows the rat; the full map (radius 0) is centred on the district.
  const cx = radius ? toG(P.x) : M.W / 2 - 0.5, cz = radius ? toG(P.z) : M.H / 2 - 0.5, ox = cv.width / 2, oy = cv.height / 2, city = M.kind === 'city';
  for (let gz = 0; gz < M.H; gz++) for (let gx = 0; gx < M.W; gx++) {
    if (radius && (Math.abs(gx - cx) > radius || Math.abs(gz - cz) > radius)) continue;
    const k = gi(gx, gz);
    if (!M.seen[k]) continue;
    const t = M.grid[k];
    const c = MAPCOL[t] || (city && (t === 0 || t === 6) ? (M.hgt[k] >= 12 ? null : '#1c1a22') : null);
    if (!c) continue;
    x.fillStyle = c;
    x.fillRect(ox + (gx - cx - 0.5) * px, oy + (gz - cz - 0.5) * px, px, px);
  }
  const dot = (o, c, s = 4) => {
    const gx = toG(o.x), gz = toG(o.z);
    if (!inG(gx, gz) || !M.seen[gi(gx, gz)]) return;
    x.fillStyle = c;
    x.fillRect(ox + (o.x / T + M.W / 2 - 0.5 - cx) * px - s / 2, oy + (o.z / T + M.H / 2 - 0.5 - cz) * px - s / 2, s, s);
  };
  W.chests.filter(c => !c.open).forEach(c => dot(c, c.cursed ? '#ff3a3a' : '#ffa030', 5));
  W.caches.filter(c => !c.taken).forEach(c => dot(c, '#ffe070', 4));
  W.pipes.forEach(p => dot(p, '#b0b0b8', 5));
  W.fungi.forEach(f => { if (!f.taken) dot(f, '#8ad06a', 3); });
  W.bins.forEach(b => { if (!b.done) dot(b, '#8a9098', 3); });
  W.keys.forEach(k => dot(k, '#ffd040', 7));
  W.enemies.filter(e => e.type === 'nest').forEach(e => dot(e, '#ff3a20', 6));
  if (G.manhole) dot(G.manhole, '#b070ff', 7);
  if (G.exitD) dot(G.exitD, '#ffffff', 7);
  objTargets().forEach(t => dot(t, '#ffd040', 7));
  if (G.boss) dot(G.boss, '#ff2a60', 8);
  const em = G.evMarker;
  if (em) dot(em.e || em, em.col, 9);
  // The pesticide rag's scent gives away every enemy, seen or not.
  x.save();
  x.translate(ox + (P.x / T + M.W / 2 - 0.5 - cx) * px, oy + (P.z / T + M.H / 2 - 0.5 - cz) * px);
  x.rotate(-P.facing + Math.PI);
  x.fillStyle = '#fff';
  x.beginPath(); x.moveTo(0, -6); x.lineTo(4, 4); x.lineTo(-4, 4); x.fill();
  x.restore();
}

let bannerT;
export function banner(t, s) {
  const b = $('banner');
  b.innerHTML = `<b>${t}</b>${s ? `<span class="px">${s}</span>` : ''}`;
  b.classList.add('on');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('on'), 2600);
}
