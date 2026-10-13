// Overlay screens: save slots, the Nest (hub and shop), pause, map and death.
import { journalHTML, CHAPTERS, chapter } from '../game/story.js';
import { fmt, commas, $, loadJSON } from '../core/util.js';
import { G, run, meta, best, settings, saveMeta, saveSettings, saveBest, save, SLOTS, readSlot, loadSlot, deleteSlot } from '../core/state.js';
import { SHOP } from '../data/shop.js';
import { rank, price, buy, effectText, isPerm, cheatDeath, sellPrice, sell } from '../game/shop.js';
import { SHOP_TABS } from '../data/shop.js';
import { coop, coopDown, coopEnd, INPUTS } from '../game/coop.js';
import { CLASSES, SKINS, skinOk, liveClass, classOpen, pickerClasses, openClasses } from '../data/classes.js';
import { MODS, dName, levelTitle } from '../data/world.js';
import { M } from '../world/grid.js';
import { PRIM, SPECIALS } from '../combat/arsenal.js';
import { applyVolumes } from '../audio/audio.js';
import { PORT, refreshPortraits, setRat } from '../entities/rat.js';
import { playSting } from '../audio/stems.js';
import { startRun, checkUnlocks, bankSalvage, menu, realmLevels } from '../game/flow.js';
import { epitaph } from '../game/personality.js';
import { runScore, shareCard } from '../game/score.js';
import { drawMap, banner } from './hud.js';
import { SIGS } from '../game/signature.js';
import { BLASTS } from '../game/turbo.js';
import { STAT_KEYS, STAT_NAMES } from '../game/stats.js';
import { TUNE } from '../tuning.js';

const ov = $('overlay');
export function show(h) { ov.innerHTML = h; ov.classList.remove('hide'); ov.scrollTop = 0; }
export function hideOverlay() { ov.classList.add('hide'); document.activeElement?.blur(); }
export function resume() {
  hideOverlay();
  G.state = 'play';
  G.last = performance.now();
}

// ---------- main menu ----------
function skinsHTML() {
  return `<div class="btns"><span class="px" style="font-size:12px">Fur</span>${SKINS.map((s, i) => {
    const ok = skinOk(i);
    return `<button class="btn ${meta.skin === i ? 'on' : 'ghost'}" data-s="${i}" style="font-size:11px;padding:8px 12px;${ok ? '' : 'opacity:.45;cursor:not-allowed'}">${ok ? s.name : s.name + ' · ' + s.txt}</button>`;
  }).join('')}</div>`;
}

export const HOWTO = `<div class="howto">
      <div><h3 class="px">How to play</h3><p>You aim and attack yourself. Smash every nest in the zone to wake its boss, kill the boss and take the exit. Wind-ups glow <b style="color:#ff5a3a">red</b> for bites, <b style="color:#c070ff">purple</b> for shots and <b style="color:#ffc030">yellow</b> for area blasts: dodge through them, and dodge at the last moment for a counter bonus. Hit a mob right after it lunges for extra damage.</p>
        <p>Hitting things fills your <b style="color:#f2b233">turbo</b> meter (three segments). Tap <kbd>X</kbd> for your class turbo blast, which spends every full segment. Hold <kbd>X</kbd> and press <kbd>Q</kbd> or <kbd>G</kbd> for a turbo special or signature (one segment, no cooldown). <b style="color:#9be06a">Rot Vials</b> (<kbd>Z</kbd>, carry up to 9) burst around you and hurt everything nearby, nests included.</p>
        <p>Each rat has four stats: <b>Strength</b> (attack damage), <b>Speed</b> (movement and attack rate), <b>Armor</b> (damage taken) and <b>Magic</b> (specials, turbo and vials). Every level-up grows them, most where your class is strongest.</p>
        <p>Every level hides 3–6 <b style="color:#c080ff">secrets</b> (cracked walls, squeeze rooms, rooftop caches up the yellow-banded pipes); the HUD counts them and sniffing (<kbd>F</kbd>) pings the ones nearby. <b style="color:#ffd040">Keys</b> stack: spend one at a locked gate, a padlocked chest or the manhole. Glowing tokens are 25-second <b>power-ups</b>. Leaving a level shows a tally and a grade.</p></div>
      <div><h3 class="px">Keyboard &amp; mouse</h3><p><kbd>WASD</kbd> move · <kbd>Mouse</kbd> aim · <kbd>Left click</kbd> or <kbd>J</kbd> attack (hold to repeat) · <kbd>Shift</kbd> dodge · <kbd>Space</kbd> jump, hold at a marked (yellow-banded) pipe to climb · <kbd>Q</kbd> special · <kbd>G</kbd> signature · <kbd>X</kbd> turbo (tap: blast, hold + Q/G: turbo move) · <kbd>Z</kbd> Rot Vial · <kbd>V</kbd> uncork flask · <kbd>B</kbd> switch flask · <kbd>R</kbd> lock on · <kbd>E</kbd> use, hold to gnaw · <kbd>C</kbd> squeeze · <kbd>F</kbd> sniff · <kbd>M</kbd> map · <kbd>Wheel</kbd> zoom · <kbd>Esc</kbd> pause</p></div>
      <div><h3 class="px">Touch</h3><p>Left stick to move. Attack aims at the nearest enemy in front of you. Jump, Dodge, Special, Sig and Use sit on the right; hold Jump at a marked pipe to climb it. Tap Turbo for your blast; hold Turbo, let go, then tap Special or Sig for the turbo version. Vial throws a Rot Vial.</p></div>
    </div>`;

// ---------- save slots ----------
export function renderSlotSelect() {
  G.state = 'slots';
  const last = loadJSON('scurry.activeSlot', 0) || 0;
  const slot = i => {
    const d = readSlot(i);
    if (!d) return `<button class="card slot" data-slot="${i}"><div class="row"><span class="key px">${i}</span><span class="role">Empty</span></div><b>New rat</b><span class="d">Start fresh in this burrow.</span></button>`;
    const m = d.meta, ups = Object.values(m.shop || {}).reduce((a, b) => a + b, 0);
    return `<div class="slotw"><button class="card slot${i === last ? ' on' : ''}" data-slot="${i}"><div class="row"><span class="key px">${i}</span><span class="role">${d.at ? new Date(d.at).toLocaleDateString() : ''}</span></div>
      <b>Burrow ${i}</b><span class="s">${commas(m.salvage || 0)} gold · ${m.runs || 0} runs · ${ups} upgrades</span>
      <span class="s">Deepest zone ${(m.maxDistrict || 0) + 1}${d.best && d.best.time ? ` · best ${fmt(d.best.time)}` : ''}</span></button>
      <button class="btn ghost" data-del="${i}" style="font-size:11px;padding:6px 10px">Delete</button></div>`;
  };
  show(`<div class="panel frame">
    <div class="kick px">A rat brawler · Streets above, sewer below</div><h1>Scurry</h1>
    <p>Pick a burrow. Each one keeps its own gold, upgrades, furs and story.</p>
    <div class="cards">${Array.from({ length: SLOTS }, (_, j) => slot(j + 1)).join('')}</div>
    <p class="px" style="font-size:12px">Press 1–${SLOTS}</p></div>`);
  ov.querySelectorAll('[data-slot]').forEach(b => { b.onclick = () => pickSlot(+b.dataset.slot); });
  ov.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.del;
      if (b.dataset.arm) { deleteSlot(i); renderSlotSelect(); return; }
      b.dataset.arm = 1; b.textContent = 'Really delete?';
    };
  });
}
export function pickSlot(i) {
  if (i < 1 || i > SLOTS) return;
  loadSlot(i);
  if (Array.isArray(meta.coopCls)) coop.setup.cls = coop.setup.cls.map((c, j) => liveClass(meta.coopCls[j] || c));
  refreshPortraits();
  setRat(CLASSES[liveClass(meta.cls)]);
  renderMenu();
}

// ---------- the Nest shop ----------
function shopHTML() {
  const item = ([id, S]) => {
    const r = rank(id), c = price(id), can = c != null && (meta.salvage || 0) >= c, perm = isPerm(id);
    const info = perm ? `${r ? effectText(id) : 'Not owned'}${c != null ? ` → ${effectText(id, r + 1)}` : ''}` : effectText(id);
    return `<button class="card buy" data-buy="${id}" ${can ? '' : 'disabled'} style="${can ? '' : 'opacity:.55'}">
      <div class="row"><b>${S.name}</b><span class="role">${perm ? `${r}/${S.max}` : `packed ${r}/${S.max}`}</span></div>
      <span class="d">${info}</span><span class="s">${c == null ? (perm ? 'Maxed' : 'Pack full') : commas(c) + ' gold'}</span></button>`;
  };
  const sells = t => Object.entries(SHOP).filter(([id, S]) => S.tab === t && sellPrice(id) != null)
    .map(([id, S]) => `<button class="btn ghost" data-sell="${id}" style="font-size:11px;padding:6px 10px">Sell ${S.name} +${commas(sellPrice(id))}</button>`).join('');
  return Object.entries(SHOP_TABS).map(([t, label]) => `<div class="kick px" style="font-size:11px">${label}</div>
    <div class="shop">${Object.entries(SHOP).filter(([, S]) => S.tab === t).map(item).join('')}</div>${sells(t) ? `<div class="btns">${sells(t)}</div>` : ''}`).join('');
}

// ---------- local co-op setup ----------
function coopHTML() {
  const S = coop.setup;
  const row = i => `<div class="cprow px"><b>P${i + 1}</b>
    <button class="btn ghost" data-ccls="${i}" style="font-size:11px;padding:6px 10px">${CLASSES[liveClass(S.cls[i])].name}</button>
    <button class="btn ghost" data-cin="${i}" style="font-size:11px;padding:6px 10px">${INPUTS[S.input[i]]}</button></div>`;
  return `<div class="btns" id="coopBtns"><span class="px" style="font-size:12px">Players</span>${[1, 2, 3, 4].map(n => `<button class="btn ${S.n === n ? 'on' : 'ghost'}" data-pn="${n}" style="font-size:11px;padding:8px 12px">${n}</button>`).join('')}
    ${S.n > 1 ? `<span class="px" style="font-size:11px;color:var(--dim)">Shared screen · no friendly fire · enemies get tougher per rat</span>` : ''}</div>
    ${S.n > 1 ? `<div class="cpset">${Array.from({ length: S.n - 1 }, (_, j) => row(j + 1)).join('')}</div>` : ''}`;
}
function bindCoop() {
  const S = coop.setup, ks = openClasses(), ins = Object.keys(INPUTS).filter(k => k !== 'kb1');
  const again = () => { const y = ov.scrollTop; renderMenu(); ov.scrollTop = y; };
  ov.querySelectorAll('[data-pn]').forEach(b => { b.onclick = () => { S.n = +b.dataset.pn; again(); }; });
  ov.querySelectorAll('[data-ccls]').forEach(b => { b.onclick = () => { const i = +b.dataset.ccls; S.cls[i] = ks[(ks.indexOf(liveClass(S.cls[i])) + 1) % ks.length]; again(); }; });
  ov.querySelectorAll('[data-cin]').forEach(b => { b.onclick = () => { const i = +b.dataset.cin; S.input[i] = ins[(ins.indexOf(S.input[i]) + 1) % ins.length]; again(); }; });
}

// ---------- the Nest (hub between runs) ----------
// ---------- realm hub: level select + Continue ----------
/** Where a run picked from the cards starts: the realm/level chosen in the hub (clamped to what's reached). */
export function hubStart() {
  const R = realmLevels(), a = meta.startAt || { realm: 'city', idx: 0 };
  if (a.realm === 'sewer' && R.sewer.length) return { realm: 'sewer', idx: Math.min(a.idx, R.sewer.length - 1) };
  return { realm: 'city', idx: Math.min(a.realm === 'city' ? a.idx : 0, R.city.length - 1) };
}
function realmHTML() {
  const R = realmLevels(), a = hubStart();
  const btn = (r, i, n) => `<button class="btn ${a.realm === r && a.idx === i ? 'on' : 'ghost'}" data-realm="${r}:${i}" style="font-size:11px;padding:6px 10px">${n}</button>`;
  return `<div class="kick px">Where to? · the City${R.sewer.length ? ' or the Sewers' : ' (find a manhole to open the Sewers)'}</div>
    ${meta.cont ? `<div class="btns"><button class="btn" id="contBtn">Continue · ${CLASSES[liveClass(meta.cont.cls)].name} · ${meta.cont.at}</button></div>` : ''}
    <div class="btns" id="realmCity"><span class="px" style="font-size:12px">City</span>${R.city.map(i => btn('city', i, levelTitle(false, i))).join('')}</div>
    ${R.sewer.length ? `<div class="btns" id="realmSewer"><span class="px" style="font-size:12px">Sewers</span>${R.sewer.map(i => btn('sewer', i, levelTitle(true, i))).join('')}</div>` : ''}`;
}

export function renderMenu() {
  if (!save.slot) { renderSlotSelect(); return; }
  G.state = 'menu';
  show(`<div class="panel frame">
    <div class="kick px">Burrow ${save.slot} · The Nest</div><h1>Scurry</h1>
    <p>Back in the Nest. Spend the gold you dragged home, then pick a rat and head up to Cinder Row.</p>
    <details class="jwrap"><summary class="px">How to play</summary>${HOWTO}</details>
    <div class="kick px" id="hubGold">The Nest shop · ${commas(meta.salvage || 0)} gold banked</div>
    ${shopHTML()}
    <div class="btns" id="diffBtns"><span class="px" style="font-size:12px">Difficulty</span>${Object.keys(TUNE.difficulty).map(d => `<button class="btn ${(meta.difficulty || 'normal') === d ? 'on' : 'ghost'}" data-diff="${d}" style="font-size:11px;padding:8px 12px">${d[0].toUpperCase() + d.slice(1)} · gold ×${TUNE.difficulty[d].gold}</button>`).join('')}</div>
    ${coopHTML()}
    ${realmHTML()}
    <div class="kick px">Pick a rat to start${coop.setup.n > 1 ? ' (player 1)' : ''}</div>
    <div class="cards">${pickerClasses().map(k => [k, CLASSES[k]]).map(([k, C], i) => !classOpen(k) ? `<button class="card locked" data-locked="${k}" disabled style="--rc:${C.rc};opacity:.5">
        <div class="row"><span class="key px">${i + 1}</span><span class="role">Locked</span></div><b>${C.name}</b><span class="d">${C.unlock.hint || '???'}</span></button>` : `<button class="card" data-k="${k}" style="--rc:${C.rc}">
        <div class="row"><span class="key px">${i + 1}</span><span class="role">${C.role}</span></div><img class="por" src="${PORT[k]}" alt="">
        <b>${C.name}</b><span class="d">${C.blurb}</span>
        <span class="s">${TUNE.classes[k].hp} HP · ${PRIM[C.prim].name}</span>
        <span class="stats">${STAT_KEYS.map(sk => `<i title="${STAT_NAMES[sk]} ${TUNE.classes[k][sk]}/10"><em>${sk.toUpperCase()}</em><u><s style="width:${TUNE.classes[k][sk] * 10}%"></s></u></i>`).join('')}</span>
        <span class="s">Q: ${SPECIALS[C.special].name}<br>G: ${SIGS[k] ? SIGS[k].name : ''}<br>X: ${BLASTS[k] ? BLASTS[k].name : ''}</span></button>`).join('')}</div>${skinsHTML()}
    <p class="px" style="font-size:12px">${best.time ? `Longest run: ${fmt(best.time)} · ${best.kills} kills` : 'No runs yet'}</p>
    <div class="btns"><button class="btn ghost" id="slotsBtn">Change burrow</button></div></div>`);
  $('slotsBtn').onclick = renderSlotSelect;
  bindCoop();
  ov.querySelectorAll('[data-diff]').forEach(b => { b.onclick = () => { meta.difficulty = b.dataset.diff; saveMeta(); const y = ov.scrollTop; renderMenu(); ov.scrollTop = y; }; });
  ov.querySelectorAll('[data-sell]').forEach(b => { b.onclick = () => { if (sell(b.dataset.sell)) { const y = ov.scrollTop; renderMenu(); ov.scrollTop = y; } }; });
  ov.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => { if (buy(b.dataset.buy)) { const y = ov.scrollTop; renderMenu(); ov.scrollTop = y; } }; });
  ov.querySelectorAll('.card[data-k]').forEach(b => { b.onclick = () => startRun(b.dataset.k, hubStart()); });
  ov.querySelectorAll('[data-realm]').forEach(b => { b.onclick = () => { const [r, i] = b.dataset.realm.split(':'); meta.startAt = { realm: r, idx: +i }; saveMeta(); const y = ov.scrollTop; renderMenu(); ov.scrollTop = y; }; });
  const cb = $('contBtn'); if (cb) cb.onclick = () => startRun(meta.cont.cls, { cont: true });
  ov.querySelectorAll('[data-s]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.s;
      if (!skinOk(i)) return;
      meta.skin = i;
      saveMeta();
      refreshPortraits();
      setRat(CLASSES[liveClass(meta.cls)]);
      renderMenu();
    };
  });
}

// ---------- in-run screens ----------
const storyTitle = () => { const n = chapter(), c = CHAPTERS[n]; return c ? `Chapter ${n} · ${c.t}` : n >= 8 ? 'Complete' : 'Not started'; };
export function pause(on) {
  if (!on) { resume(); return; }
  G.state = 'paused';
  show(`<div class="panel narrow frame"><div class="kick px">${fmt(run.time)} · Lv ${run.level} · ${dName()}</div><h2>Paused</h2>
    ${run.mods.map(m => `<p><span class="chip" style="--cc:${MODS[m].col}">${MODS[m].name}</span> ${MODS[m].desc}</p>`).join('')}
    <details class="jwrap"><summary class="px">Controls</summary>${HOWTO}</details>
    <details class="jwrap"><summary class="px">Story · ${storyTitle()}</summary>${journalHTML()}</details>
    <div class="sets px">
      <label>Screen shake<input type="range" id="sSh" min="0" max="1.5" step="0.1" value="${settings.shake}"></label>
      <label>Music<input type="range" id="sMu" min="0" max="1" step="0.05" value="${settings.music}"></label>
      <label>Effects<input type="range" id="sFx" min="0" max="1" step="0.05" value="${settings.sfx}"></label>
      <label>Announcer voice<input type="checkbox" id="sVo" ${settings.voice ? 'checked' : ''}></label>
    </div>
    <div class="btns"><button class="btn" id="resumeBtn">Resume</button><button class="btn ghost" id="quit">Abandon run</button></div></div>`);
  $('resumeBtn').onclick = resume;
  $('sSh').oninput = e => { settings.shake = +e.target.value; saveSettings(); };
  $('sMu').oninput = e => { settings.music = +e.target.value; applyVolumes(); saveSettings(); };
  $('sFx').oninput = e => { settings.sfx = +e.target.value; applyVolumes(); saveSettings(); };
  $('sVo').onchange = e => { settings.voice = e.target.checked; saveSettings(); };
  $('quit').onclick = () => { G.state = 'play'; run.hp = 0; run.abandon = true; die(); };
}

export function openMap() {
  G.state = 'map';
  show(`<div class="panel narrow frame"><div class="kick px">Explored ${dName()}</div><canvas id="bigmap" width="520" height="520"></canvas>
    <p class="px" style="font-size:11px"><span style="color:#ffa030">■</span> chest <span style="color:#ff3a3a">■</span> cursed chest <span style="color:#ffe070">■</span> cache <span style="color:#b0b0b8">■</span> pipe <span style="color:#ff3a20">■</span> nest <span style="color:#b070ff">■</span> manhole <span style="color:#ffd040">■</span> key <span style="color:#a89468">■</span> boards <span style="color:#8a5a44">■</span> crevice <span style="color:#7aa020">■</span> acid <span style="color:#8ad06a">■</span> fungus <span style="color:#8a9098">■</span> bin</p><div class="btns"><button class="btn ghost" id="mapX">Close (M)</button></div></div>`);
  drawMap($('bigmap'), 520 / M.W, 0);
  $('mapX').onclick = resume;
}

// ---------- endings ----------
function dmgTable() {
  const C = CLASSES[run.cls];
  const names = {
    primary: PRIM[C.prim].name, special: SPECIALS[C.special].name, sig: SIGS[run.cls] ? SIGS[run.cls].name : 'Signature',
    dot: 'Poison, burn & bleed', event: 'District events', level: 'Level-up bursts', trap: 'Traps & falling debris', bonk: 'Bonks & splats', fire: 'Fire', sludge: 'Toxic sludge',
  };
  const dmg = Object.entries(run.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 10), mx = dmg.length ? dmg[0][1] : 1;
  return `<div class="dbar">${dmg.map(([k, v]) => `<span>${names[k] || k}</span><i style="width:${v / mx * 100}%"></i><span style="text-align:right">${commas(v)}</span>`).join('')}</div>`;
}

export function die() {
  if (cheatDeath()) { banner('Second Tail', 'Back on your feet'); return; }
  if (coopDown()) return; // co-op: down until revived, while anyone still stands
  coopEnd();
  G.state = 'dead';
  if (!run.abandon) playSting('death'); // quitting from pause isn't a death
  if (meta.cont) { delete meta.cont; saveMeta(); } // Continue is a checkpoint for the live run, not a second life
  const got = checkUnlocks();
  const nb = run.time > best.time;
  if (nb) { Object.assign(best, { time: run.time, kills: run.kills, district: run.tier }); saveBest(); }
  const banked = bankSalvage(), score = runScore();
  show(`<div class="panel narrow frame"><div class="kick px">${nb ? 'New best' : 'Run over'} · ${dName()}</div><h1 style="font-size:clamp(64px,9vw,120px)">You died</h1><p style="font-style:italic;margin-top:-6px">${epitaph()}</p>
    <div class="stat px"><div><b>${fmt(run.time)}</b><span>Survived</span></div><div><b>${run.kills}</b><span>Kills</span></div><div><b>${run.level}</b><span>Level</span></div><div><b>${run.tier + 1}</b><span>Zones</span></div></div>
    <p class="px" style="font-size:15px">Score <b style="color:var(--gold)">${commas(score)}</b>${(run.ranks || []).length ? ` · ranks <span class="ranks">${run.ranks.map(r => r.r).join(' ')}</span>` : ''}</p>
    <p class="px" style="color:#9ad0ff;font-size:13px">+${banked.salvage} gold banked</p>
    ${got.length ? `<p class="px" style="color:#f2b233;font-size:13px">Unlocked: ${got.join(' · ')}</p>` : ''}${dmgTable()}
    <div class="btns"><button class="btn" id="again">Back to the Nest</button><button class="btn ghost" id="share">Share run card</button><span class="px" style="font-size:12px;color:var(--dim)">or press R</span></div></div>`);
  $('again').onclick = menu;
  $('share').onclick = async () => { const b = $('share'); b.textContent = 'Making card…'; const r = await shareCard(); b.textContent = r === 'shared' ? 'Shared' : 'Card saved'; };
}
