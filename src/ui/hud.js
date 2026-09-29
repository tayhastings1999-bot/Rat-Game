// In-play HUD: bars, slots, threat, keys, objective, prompts, minimap, banners.
import { clamp, fmt, fmtT, commas, hexs, $ } from '../core/util.js';
import { G, P, W, run, st } from '../core/state.js';
import { M, T, gi, inG, toG, tileAt } from '../world/grid.js';
import { CLASSES } from '../data/classes.js';
import { MODS, isSewer, nextSurfaceName } from '../data/world.js';
import { ITEMS, MUTATIONS, CURSED, JUNK } from '../data/items.js';
import { OBJ } from '../data/props.js';
import { PRIM, SPECIALS, WEAP } from '../combat/arsenal.js';
import { threatTier } from '../combat/combat.js';
import { useTarget, grabTarget, chewTarget } from '../entities/player.js';
import { activeBuffs } from '../game/forage.js';
import { EVO, capped } from '../game/progress.js';
import { bossStatus } from '../entities/bosses.js';
import { ICON, IC_SCRAP, IC_KEY, IC_HEART, IC_BOLT, IC_EYE } from './icons.js';

export function initHudIcons() {
  $('icHeart').innerHTML = IC_HEART;
  $('icBolt').innerHTML = IC_BOLT;
  $('icEye').innerHTML = IC_EYE;
}

export function renderSlots() {
  if (!run.cls) return;
  const C = CLASSES[run.cls];
  $('slots').innerHTML =
    `<div class="slot prim" title="${PRIM[C.prim].name}">${ICON[C.prim]}</div>` +
    `<div class="slot spec" title="Q · ${SPECIALS[C.special].name}">${ICON[C.special]}<i class="cd" id="specCd"></i><em>Q</em></div>` +
    [0, 1, 2, 3].map(i => { const w = run.weapons[i]; return w ? `<div class="slot${w.evo ? ' evo' : ''}" title="${w.evo ? EVO[w.id].name : WEAP[w.id].name}">${ICON[w.id]}<em>${w.evo ? '★' : w.lvl}</em></div>` : '<div class="slot empty"></div>'; }).join('');
  $('items').innerHTML =
    run.items.map(id => `<i style="--c:${hexs(ITEMS[id].col)}" title="${ITEMS[id].name}${ITEMS[id].ing ? ' (ingredient)' : ''}"></i>`).join('') +
    run.muts.map(id => { const m = MUTATIONS.find(m => m.id === id); return `<span class="mut" style="--c:${m.col}" title="${m.name}: ${m.desc}">${ICON.dna}</span>`; }).join('') +
    run.cursed.map(id => `<span class="mut curse" title="${CURSED[id].name}: ${CURSED[id].up}; ${CURSED[id].dn}">${ICON.skull}</span>`).join('') +
    (run.junk || []).map(id => `<span class="mut junk" style="--c:${hexs(JUNK[id].col)}" title="${JUNK[id].name}: ${JUNK[id].up}; ${JUNK[id].dn}">${ICON.junk}</span>`).join('');
}

function objective() {
  if (run.trial) return `BREAKTHROUGH TRIAL · kill the Champion · ${Math.ceil(run.trial.t)}s`;
  if (G.mode === 'trial') return W.valves.every(v => v.done) ? 'Reach the drain' : `Turn the valves ${W.valves.filter(v => v.done).length}/3 · F to sniff the way`;
  const key = !isSewer() ? (run.keys ? ' · Manhole unlocked: descend for premium loot' : ' · Manhole locked') : '';
  if (G.exitD) return isSewer() ? 'A ladder leads up to the streets · F to sniff it out' : `The road to ${nextSurfaceName()} is open · F to sniff it out${run.keys ? ' · or take the manhole down' : ''}`;
  if (G.boss) return G.boss.revealed ? 'Boss awake' : 'Something big is awake · F to sniff it out';
  return `Nests left ${run.nests} · Boss wakes in ${fmt(Math.max(0, run.bossAt - (run.time - run.dStart)))}${key}`;
}

export function hud() {
  $('hpFill').style.width = clamp(run.hp / st.maxHp * 100, 0, 100) + '%';
  $('hpTxt').textContent = Math.ceil(Math.max(0, run.hp)) + ' / ' + st.maxHp;
  $('enFill').style.width = clamp(run.sta / st.staMax * 100, 0, 100) + '%';
  $('enTxt').textContent = P.bulwark > 0 ? 'BULWARK' : P.roll > 0 ? 'ROLL' : P.climbing ? 'CLIMBING' : P.sprinting ? 'SPRINTING' : P.squeeze ? 'SQUEEZING' : P.glideT > 0 ? 'GLIDING' : 'STAMINA';
  const ex = run.expo || 0;
  $('exFill').style.width = ex + '%';
  $('exFill').parentElement.classList.toggle('lit', ex > 70);
  $('exTxt').textContent = P.shadow ? (ex > 1 ? 'IN SHADOW' : 'HIDDEN') : ex > 70 ? 'EXPOSED' : 'LIT';
  const S = SPECIALS[CLASSES[run.cls].special], cd = $('specCd');
  if (cd) cd.style.height = (run.specT / (S.cd * st.specCd * st.cd) * 100) + '%';
  $('xpFill').style.width = Math.min(100, run.xp / run.need * 100) + '%';
  $('top').classList.toggle('capped', capped());
  $('lvlBig').textContent = String(run.level).padStart(2, '0');
  const thr = run.T || 0, tl = threatTier(thr);
  $('res').innerHTML =
    `<div class="r"><span class="chip" style="--cc:${tl[1]}">THREAT ${thr.toFixed(1)} · ${tl[0]}${(run.spike || 0) > 1.2 ? ' ▲' : ''}</span></div>` +
    `<div class="r">${IC_SCRAP}<span>${Math.floor(run.scrap)}</span>${run.keys ? `<span class="keyc">${IC_KEY}<span>${run.keys}</span></span>` : ''}</div>` +
    (isSewer() && G.mode !== 'trial' ? '<span class="chip" style="--cc:#b070ff">SEWER · MUTATED HORDE</span>' : '') +
    run.mods.map(m => `<span class="chip" style="--cc:${MODS[m].col}">${MODS[m].name}</span>`).join('') +
    (run.blood > 0 ? `<span class="chip" style="--cc:#ff4a3a">BLOODLUST ×${run.blood}</span>` : '') +
    (P.scent ? `<span class="chip" style="--cc:#c8ff20">SCENT ${st.rag ? '∞' : Math.ceil(P.scentE) + 's'}</span>` : P.scentE < st.scentMax - 0.5 ? `<span class="chip" style="--cc:#6a7a4a">Nose ${Math.round(P.scentE / st.scentMax * 100)}%</span>` : '') +
    activeBuffs().map(b => `<span class="chip" style="--cc:${hexs(b.col)}">${b.name} ${Math.ceil(b.t)}s</span>`).join('') +
    (P.chain ? `<span class="chip" style="--cc:#ffd070">MOMENTUM ×${P.chain}</span>` : '') +
    (CLASSES[run.cls].prim === 'shiv' && P.ambush > 0 ? '<span class="chip" style="--cc:#6affb0">AMBUSH READY</span>' : '');
  $('dmgTotal').textContent = commas(run.dmg);
  $('kills').textContent = run.kills;
  $('clock').textContent = G.mode === 'trial' ? fmtT(run.time) : fmt(run.time);
  $('obj').textContent = objective();
  // Boss UI stays hidden until you enter its arena (or hit it).
  const b = G.boss;
  if (b && !b.revealed && (Math.hypot(b.x - P.x, b.z - P.z) < 24 || b.hp < b.maxHp)) { b.revealed = true; banner(b.name, 'Fight or flee'); }
  $('bossWrap').style.display = b && b.revealed ? 'flex' : 'none';
  if (b) { $('bossFill').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%'; $('bossLabel').textContent = (b.label || '') + bossStatus(b); }
  const cmb = $('combo'), ready = !!run.shriekReady;
  $('comboFill').style.width = (ready ? 100 : (run.combo || 0)) + '%';
  $('comboTxt').textContent = ready ? (G.touch ? 'SHRIEK READY' : 'SHRIEK READY · X') : 'COMBO';
  cmb.classList.toggle('ready', ready);
  const sb = document.querySelector('[data-b="shriek"]');
  if (sb) sb.hidden = !ready;
  if (G.mode === 'trial') {
    const gs = (G.ghost && G.ghost.data.sp) || [];
    $('splits').innerHTML = run.splits.map((t, i) => `Valve ${i + 1} ${fmtT(t)}${gs[i] != null ? ` <span style="color:${t < gs[i] ? '#6ad06a' : '#ff7a6a'}">${t < gs[i] ? '−' : '+'}${Math.abs(t - gs[i]).toFixed(1)}</span>` : ''}`).join('<br>') + (G.ghost ? `<br><span style="color:#9ad0ff">Ghost ${fmtT(G.ghost.data.t)}</span>` : '');
  } else $('splits').innerHTML = '';
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
  W.benches.forEach(b => dot(b, '#4aa3ff', 6));
  W.chests.filter(c => !c.open).forEach(c => dot(c, c.cursed ? '#ff3a3a' : '#ffa030', 5));
  W.caches.filter(c => !c.taken).forEach(c => dot(c, '#ffe070', 4));
  W.pipes.forEach(p => dot(p, '#b0b0b8', 5));
  W.fungi.forEach(f => { if (!f.taken) dot(f, '#8ad06a', 3); });
  W.bins.forEach(b => { if (!b.done) dot(b, '#8a9098', 3); });
  W.keys.forEach(k => dot(k, '#ffd040', 7));
  W.enemies.filter(e => e.type === 'nest').forEach(e => dot(e, '#ff3a20', 6));
  W.valves.filter(v => !v.done).forEach(v => dot(v, '#6ad06a', 6));
  if (G.manhole) dot(G.manhole, '#b070ff', 7);
  if (G.exitD) dot(G.exitD, '#ffffff', 7);
  if (G.boss) dot(G.boss, '#ff2a60', 8);
  // The pesticide rag's scent gives away every enemy, seen or not.
  if (st.rag) for (const e of W.enemies) if (!e.dead && e.type !== 'nest') { x.fillStyle = e.pred || e.boss ? '#ff2a60' : '#d04030'; x.fillRect(ox + (e.x / T + M.W / 2 - 0.5 - cx) * px - 1.5, oy + (e.z / T + M.H / 2 - 0.5 - cz) * px - 1.5, 3, 3); }
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
