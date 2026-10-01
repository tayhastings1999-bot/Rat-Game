// Overlay screens: main menu, the Nest, pause, map, workbench, level-up,
// death and trial results.
import { fmt, fmtT, commas, hexs, pick, loadJSON, saveJSON, weekSeed, $ } from '../core/util.js';
import { G, run, st, meta, best, settings, saveMeta, saveSettings, saveBest } from '../core/state.js';
import { CLASSES, UNLOCK, SKINS, isUnl, skinOk } from '../data/classes.js';
import { MODS, dName } from '../data/world.js';
import { M } from '../world/grid.js';
import { ITEMS, MUTATIONS, CURSED, JUNK, AUG, NEST, DOMNEST, STARTS } from '../data/items.js';
import { WEAP, TOMES, RAR, PRIM, SPECIALS } from '../combat/arsenal.js';
import { addThreat } from '../combat/combat.js';
import { sfx, applyVolumes } from '../audio/audio.js';
import { PORT, refreshPortraits, setRat } from '../entities/rat.js';
import { startRun, checkUnlocks, bankSalvage, dominanceOf, menu } from '../game/flow.js';
import { giveCursed } from '../game/loot.js';
import { breakOffers, applyKeystone, evolve, EVO, KEYSTONES } from '../game/progress.js';
import { CONTRACTS } from '../game/contracts.js';
import { RULES, rulesLeft, applyRule } from '../game/rules.js';
import { epitaph } from '../game/personality.js';
import { runScore, recordDaily, shareCard, dailyKey, dailyBoard, todaysTwist } from '../game/score.js';
import { drawMap, renderSlots, hud, banner } from './hud.js';
import { ICON } from './icons.js';
import { SIGS } from '../game/signature.js';

const ov = $('overlay');
export function show(h) { ov.innerHTML = h; ov.classList.remove('hide'); ov.scrollTop = 0; }
export function hideOverlay() { ov.classList.add('hide'); document.activeElement?.blur(); }
export function resume() {
  hideOverlay();
  G.state = 'play';
  G.last = performance.now();
  if (run.pendingLv > 0) openLevelUp();
}

// ---------- main menu ----------
/** Nest shortcuts: pick where the run begins. */
function startsHTML() {
  const open = Object.entries(STARTS).filter(([, s]) => s.ok(meta));
  if (open.length < 2) return '';
  if (!STARTS[meta.startAt] || !STARTS[meta.startAt].ok(meta)) meta.startAt = 'row';
  return `<div class="btns"><span class="px" style="font-size:12px">Start in</span>${open.map(([k, s]) => `<button class="btn ${meta.startAt === k ? 'on' : 'ghost'}" data-at="${k}" style="font-size:11px;padding:8px 12px">${s.name}${s.domMul ? ` · +${Math.round((s.domMul - 1) * 100)}% Dominance` : ''}</button>`).join('')}</div>`;
}
function skinsHTML() {
  return `<div class="btns"><span class="px" style="font-size:12px">Fur</span>${SKINS.map((s, i) => {
    const ok = skinOk(i);
    return `<button class="btn ${meta.skin === i ? 'on' : 'ghost'}" data-s="${i}" style="font-size:11px;padding:8px 12px;${ok ? '' : 'opacity:.45;cursor:not-allowed'}">${ok ? s.name : s.name + ' · ' + s.txt}</button>`;
  }).join('')}</div>`;
}

export function renderMenu(m) {
  G.state = 'menu';
  const seed = weekSeed(), lb = loadJSON('scurry4.lb.' + seed, []), pb = loadJSON('scurry4.ghost.' + seed, null);
  show(`<div class="panel frame">
    <div class="kick px">A rat roguelike · Streets above, sewer below</div><h1>Scurry</h1>
    <p>An open neighbourhood crawling with hordes. Climb brick to the rooftops and walk the power lines, gnaw through boarded gaps, squeeze through cracks and sniff out cheese. Find a sewer key and take the manhole down — the sewer is darker, meaner and richer.</p>
    <div class="btns"><button class="btn ${m === 'survival' ? 'on' : 'ghost'}" id="mS">Survival</button><button class="btn ${m === 'daily' ? 'on' : 'ghost'}" id="mD">Daily Run</button><button class="btn ${m === 'trial' ? 'on' : 'ghost'}" id="mT">Ghost Trial</button><button class="btn ghost" id="mN">The Nest · ${commas(meta.salvage || 0)} salvage · ${meta.dominance || 0} dominance</button></div>
    ${m === 'trial' ? `<p>This week's map: <span class="px" style="font-size:13px">${seed}</span>. Turn three valves in the Undersewer, then dive down the drain. You race your best ghost, or a friend's if you paste their code.</p>
      <div class="lb">${lb.length ? lb.map((r, i) => `<span>${i + 1}</span><span>${CLASSES[r.c]?.name || r.c}</span><span>${fmtT(r.t)}</span>`).join('') : '<span></span><span>No times yet</span><span></span>'}</div>
      <textarea id="fg" placeholder="Paste a friend's ghost code here">${G.friendGhost ? '(friend ghost loaded: ' + fmtT(G.friendGhost.t) + ')' : ''}</textarea>`
    : m === 'daily' ? `<p>Today's run (<span class="px" style="font-size:13px">${dailyKey()}</span>): the same districts and the same twist for everyone. Pick any rat. Twist: <b style="color:var(--gold)">${todaysTwist().name}</b> · ${todaysTwist().desc}</p>
      <div class="lb">${dailyBoard().length ? dailyBoard().map((r, i) => `<span>${i + 1}</span><span>${CLASSES[r.c]?.name || r.c} · ${r.d} districts</span><span>${commas(r.s)}</span>`).join('') : '<span></span><span>No runs today yet</span><span></span>'}</div>`
    : '<p>Smash the nests or outlast the timer to wake the district boss. Every pick, chest and detour raises the threat, and the horde scales with it. Kill the boss to open the road, or spend a key on the manhole.</p>'}
    <div class="howto">
      <div><h3 class="px">How to play</h3><p>Your attacks aim and fire on their own. Keep moving, scoop up XP gems (blue, green, red, violet), and pick an upgrade each level. Every fifth level a Champion comes for you: kill it to break through. Stay out of the light: fill the eye meter and the owls come. Wind-ups glow <b style="color:#ff5a3a">red</b> for bites, <b style="color:#c070ff">purple</b> for shots and <b style="color:#ffc030">yellow</b> for area blasts; hit a mob right after it lunges for bonus damage.</p></div>
      <div><h3 class="px">Keyboard &amp; mouse</h3><p><kbd>WASD</kbd> move · <kbd>Space</kbd> jump, hold on a wall to climb · <kbd>Shift</kbd> roll, hold to sprint (sprint into a wall to run up it, jump off walls to chain bounces) · <kbd>Q</kbd> special · <kbd>G</kbd> class signature move · <kbd>X</kbd> shriek when the combo bar is full · <kbd>E</kbd> use, hold to gnaw · <kbd>F</kbd> sniff out loot · <kbd>M</kbd> map · <kbd>Esc</kbd> pause</p></div>
      <div><h3 class="px">Touch</h3><p>Left stick to move, drag anywhere else to look around. Jump, Roll, Special and Use sit on the right.</p></div>
    </div>
    <div class="kick px">Pick a rat to start</div>
    <div class="cards">${Object.entries(CLASSES).map(([k, C], i) => {
      const lk = !isUnl(k);
      return `<button class="card${lk ? ' off' : ''}" data-k="${k}" style="--rc:${C.rc}">
        <div class="row"><span class="key px">${i + 1}</span><span class="role">${C.role}</span></div><img class="por" src="${PORT[k]}" alt="" style="${lk ? 'filter:brightness(.08)' : ''}">
        <b>${lk ? 'Locked' : C.name}</b><span class="d">${lk ? UNLOCK[k].txt + (UNLOCK[k].cost ? ` · or ${UNLOCK[k].cost} salvage at the Nest` : UNLOCK[k].dom ? ` · or ${UNLOCK[k].dom} Dominance at the Nest` : '') : C.blurb}</span>
        <span class="s">${C.hp} HP · ${PRIM[C.prim].name}<br>Q: ${SPECIALS[C.special].name}<br>G: ${SIGS[k] ? SIGS[k].name : ''}</span></button>`;
    }).join('')}</div>${m === 'survival' ? startsHTML() : ''}${skinsHTML()}
    <p class="px" style="font-size:12px">${best.time ? `Best survival: ${fmt(best.time)} · ${best.kills} kills` : 'No runs yet'}${pb ? ` · Trial PB ${fmtT(pb.t)}` : ''}</p></div>`);
  G.mode = m === 'daily' ? 'survival' : m;
  G.daily = m === 'daily';
  $('mD').onclick = () => renderMenu('daily');
  $('mS').onclick = () => renderMenu('survival');
  $('mT').onclick = () => renderMenu('trial');
  $('mN').onclick = renderNest;
  const fg = $('fg');
  if (fg) fg.onchange = () => {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(fg.value.trim()))));
      if (d.s !== seed) throw 0;
      G.friendGhost = d;
      fg.value = '(friend ghost loaded: ' + fmtT(d.t) + ')';
    } catch (_) { fg.value = 'That code is for a different week or is damaged.'; }
  };
  ov.querySelectorAll('.card').forEach(b => { b.onclick = () => { if (isUnl(b.dataset.k)) startRun(b.dataset.k); }; });
  ov.querySelectorAll('[data-at]').forEach(b => { b.onclick = () => { meta.startAt = b.dataset.at; saveMeta(); renderMenu(m); }; });
  ov.querySelectorAll('[data-s]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.s;
      if (!skinOk(i)) return;
      meta.skin = i;
      saveMeta();
      refreshPortraits();
      setRat(CLASSES.brawler);
      renderMenu(m);
    };
  });
}

/** The Nest: spend banked salvage and Dominance on permanent upgrades, shortcuts and new rats. */
function upCards(list, cur, bank) {
  return list.map(u => {
    const r = meta.nest[u.id] || 0, max = u.costs.length, cost = u.costs[r], done = r >= max, poor = !done && bank < cost;
    return `<button class="card ${done ? 'own' : ''} ${poor ? 'off' : ''}" data-n="${u.id}" data-cur="${cur}" style="--rc:${done ? '#6ad06a' : cur === 'dom' ? '#c080ff' : '#f2b233'}">
      <div class="row"><span class="role">${done ? (u.shortcut ? 'Open' : 'Maxed') : cost + (cur === 'dom' ? ' dominance' : ' salvage')}</span><span class="key px">${r}/${max}</span></div><b>${u.name}</b><span class="d">${u.desc}</span></button>`;
  }).join('');
}
export function renderNest() {
  G.state = 'nest';
  const lockedCls = Object.keys(UNLOCK).filter(k => !isUnl(k));
  const sal = meta.salvage || 0, dom = meta.dominance || 0;
  show(`<div class="panel frame">
    <div class="kick px">Home base · ${commas(sal)} salvage · ${dom} dominance</div><h2>The Nest</h2>
    <p>Everything you carried dies with you, except what you bring home. Salvage comes from unspent scrap (plus a quarter of what you spent at workbenches). <b style="color:#c080ff">Dominance</b> is how hard you ruled the streets: kills, damage, bosses, hidden lairs and how deep you got.</p>
    <h3 class="px" style="margin:6px 0 0;font-size:14px;color:var(--gold)">Salvage</h3><div class="cards">${upCards(NEST, 'sal', sal)}</div>
    <h3 class="px" style="margin:6px 0 0;font-size:14px;color:#c080ff">Dominance · weapons, lungs and shortcuts</h3><div class="cards">${upCards(DOMNEST, 'dom', dom)}</div>
    ${lockedCls.length ? `<h3 class="px" style="margin:6px 0 0;font-size:14px;color:var(--gold)">Rats for hire</h3><div class="cards">${lockedCls.map(k => {
      const C = CLASSES[k], U = UNLOCK[k], dcur = !!U.dom, cost = dcur ? U.dom : U.cost, poor = (dcur ? dom : sal) < cost;
      return `<button class="card ${poor ? 'off' : ''}" data-c="${k}" style="--rc:${C.rc}"><div class="row"><span class="role">${C.role} · ${cost} ${dcur ? 'dominance' : 'salvage'}</span></div><img class="por" src="${PORT[k]}" alt=""><b>${C.name}</b><span class="d">${C.blurb}</span></button>`;
    }).join('')}</div>` : ''}
    <div class="btns"><button class="btn ghost" id="nb">Back (Esc)</button></div></div>`);
  $('nb').onclick = () => renderMenu('survival');
  ov.querySelectorAll('[data-n]').forEach(b => {
    b.onclick = () => {
      const dcur = b.dataset.cur === 'dom', u = (dcur ? DOMNEST : NEST).find(u => u.id === b.dataset.n), r = meta.nest[u.id] || 0, cost = u.costs[r], key = dcur ? 'dominance' : 'salvage';
      if (r >= u.costs.length || (meta[key] || 0) < cost) return;
      meta[key] -= cost;
      meta.nest[u.id] = r + 1;
      if (u.shortcut) meta.startAt = u.id;
      saveMeta();
      sfx('buy');
      renderNest();
    };
  });
  ov.querySelectorAll('[data-c]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.c, U = UNLOCK[k], key = U.dom ? 'dominance' : 'salvage', cost = U.dom || U.cost;
      if ((meta[key] || 0) < cost) return;
      meta[key] -= cost;
      meta.bought[k] = 1;
      saveMeta();
      sfx('buy');
      renderNest();
    };
  });
}

// ---------- in-run screens ----------
export function pause(on) {
  if (!on) { resume(); return; }
  G.state = 'paused';
  const Wp = run.weapons.map(w => `<span>${WEAP[w.id].name} ${w.lvl}</span>`).join('');
  const Tm = Object.keys(run.tomes).map(k => `<span>${TOMES[k].name.replace('Tome of ', '')} ${run.tomes[k]}</span>`).join('');
  const It = run.items.map(i => `<span style="border-color:${hexs(ITEMS[i].col)}">${ITEMS[i].name}</span>`).join('');
  const Au = Object.keys(run.augs).map(i => `<span style="border-color:#4aa3ff">${AUG.find(a => a.id === i).name}</span>`).join('');
  const Mu = run.muts.map(id => { const m = MUTATIONS.find(m => m.id === id); return `<p><span class="chip" style="--cc:${m.col}">Mutation · ${m.name}</span> ${m.desc}</p>`; }).join('');
  const Ju = (run.junk || []).map(id => `<p><span class="chip" style="--cc:${hexs(JUNK[id].col)}">Junk · ${JUNK[id].name}</span> ${JUNK[id].up}; ${JUNK[id].dn.toLowerCase()}.</p>`).join('');
  const Cu = run.cursed.map(id => `<p><span class="chip" style="--cc:#ff3a3a">Cursed · ${CURSED[id].name}</span> ${CURSED[id].up}; ${CURSED[id].dn.toLowerCase()}.</p>`).join('');
  show(`<div class="panel narrow frame"><div class="kick px">${fmt(run.time)} · Lv ${run.level} · ${dName()}</div><h2>Paused</h2>
    ${run.mods.map(m => `<p><span class="chip" style="--cc:${MODS[m].col}">${MODS[m].name}</span> ${MODS[m].desc}</p>`).join('')}
    ${Mu}${Cu}${Ju}
    ${(run.contracts || []).length ? `<h3 class="px" style="margin:8px 0 2px;font-size:13px;color:#c080ff">Contracts</h3>${run.contracts.map(c => `<p>${c.done ? '✓' : '◇'} <b>${CONTRACTS[c.id].name}</b> · ${CONTRACTS[c.id].desc} · ${c.p}/${CONTRACTS[c.id].n} · +${CONTRACTS[c.id].dom} Dominance</p>`).join('')}` : ''}
    ${Wp ? `<div class="tags">${Wp}</div>` : ''}${Tm ? `<div class="tags">${Tm}</div>` : ''}${It ? `<div class="tags">${It}</div>` : ''}${Au ? `<div class="tags">${Au}</div>` : ''}
    <div class="sets px">
      <label>Screen shake<input type="range" id="sSh" min="0" max="1.5" step="0.1" value="${settings.shake}"></label>
      <label>Music<input type="range" id="sMu" min="0" max="1" step="0.05" value="${settings.music}"></label>
      <label>Effects<input type="range" id="sFx" min="0" max="1" step="0.05" value="${settings.sfx}"></label>
      <label>Mouse sensitivity<input type="range" id="sSe" min="0.2" max="2.5" step="0.1" value="${settings.sens}"></label>
    </div>
    <div class="btns"><button class="btn" id="resumeBtn">Resume</button><button class="btn ghost" id="fc">Mouse look: ${settings.mouse ? 'on' : 'off'}</button><button class="btn ghost" id="quit">Abandon run</button></div></div>`);
  $('resumeBtn').onclick = resume;
  $('fc').onclick = () => { settings.mouse = !settings.mouse; saveSettings(); pause(true); };
  $('sSh').oninput = e => { settings.shake = +e.target.value; saveSettings(); };
  $('sMu').oninput = e => { settings.music = +e.target.value; applyVolumes(); saveSettings(); };
  $('sFx').oninput = e => { settings.sfx = +e.target.value; applyVolumes(); saveSettings(); };
  $('sSe').oninput = e => { settings.sens = +e.target.value; saveSettings(); };
  $('quit').onclick = () => { G.state = 'play'; run.reactor = false; run.hp = 0; die(); };
}

export function openMap() {
  G.state = 'map';
  show(`<div class="panel narrow frame"><div class="kick px">Explored ${dName()}</div><canvas id="bigmap" width="520" height="520"></canvas>
    <p class="px" style="font-size:11px"><span style="color:#4aa3ff">■</span> workbench <span style="color:#ffa030">■</span> chest <span style="color:#ff3a3a">■</span> cursed chest <span style="color:#ffe070">■</span> cache <span style="color:#b0b0b8">■</span> pipe <span style="color:#ff3a20">■</span> nest <span style="color:#b070ff">■</span> manhole <span style="color:#ffd040">■</span> key <span style="color:#a89468">■</span> boards <span style="color:#8a5a44">■</span> crevice <span style="color:#7aa020">■</span> acid <span style="color:#8ad06a">■</span> fungus <span style="color:#8a9098">■</span> bin</p><div class="btns"><button class="btn ghost" id="mapX">Close (M)</button></div></div>`);
  drawMap($('bigmap'), 520 / M.W, 0);
  $('mapX').onclick = resume;
}

export function openBench() {
  G.state = 'bench';
  const col = br => AUG.filter(a => a.br === br).map(a => {
    const own = run.augs[a.id], req = a.req && !run.augs[a.req], poor = run.scrap < a.cost, off = own || req || poor;
    return `<button class="card ${own ? 'own' : ''} ${off && !own ? 'off' : ''}" data-id="${a.id}" style="--rc:${own ? '#6ad06a' : '#4aa3ff'}"><div class="row"><span class="role">${own ? 'Installed' : req ? 'Locked' : a.cost + ' salvage'}</span></div><b>${a.name}</b><span class="up">+ ${a.up}</span><span class="dn">− ${a.dn}</span></button>`;
  }).join('');
  show(`<div class="panel frame"><div class="kick px">Workbench · ${Math.floor(run.scrap)} salvage</div><h2>Augment your rat</h2><p>Every part has a price beyond salvage, and every install raises the threat. Each branch unlocks top to bottom.</p>
    <div class="tree">${['Mobility', 'Offense', 'Survival'].map(b => `<div class="col"><h3>${b}</h3>${col(b)}</div>`).join('')}</div><div class="btns"><button class="btn ghost" id="bx">Leave (Esc)</button></div></div>`);
  ov.querySelectorAll('.card').forEach(b => {
    b.onclick = () => {
      const a = AUG.find(a => a.id === b.dataset.id);
      if (run.augs[a.id] || (a.req && !run.augs[a.req]) || run.scrap < a.cost) return;
      run.scrap -= a.cost;
      run.scrapSpent += a.cost;
      run.augs[a.id] = 1;
      a.ap();
      addThreat(0.5);
      banner(a.name, 'Installed');
      sfx('buy');
      openBench();
    };
  });
  $('bx').onclick = resume;
}

// ---------- level-up ----------
let offers = [];
export const currentOffers = () => offers;
function makeOffers() {
  const pool = [];
  for (const w of run.weapons) if (w.lvl < 5) pool.push({ kind: 'up', id: w.id, wt: 3 });
  if (run.weapons.length < 4) for (const id in WEAP) if (!run.weapons.some(w => w.id === id)) pool.push({ kind: 'new', id, wt: 2.2 });
  for (const id in TOMES) if ((run.tomes[id] || 0) < (TOMES[id].max || 5)) pool.push({ kind: 'tome', id, wt: 2 });
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, b) => a + b.wt, 0);
    let r = Math.random() * tot, i = 0;
    for (; i < pool.length; i++) { r -= pool[i].wt; if (r <= 0) break; }
    const o = pool.splice(Math.min(i, pool.length - 1), 1)[0];
    // Rarer tomes turn up more often as you level.
    if (o.kind === 'tome' && !TOMES[o.id].flat) { const q = Math.random(), luck = Math.min(0.08, run.level * 0.004); o.rar = q < 0.03 + luck * 0.5 ? 3 : q < 0.13 + luck ? 2 : q < 0.4 + luck * 2 ? 1 : 0; } else o.rar = 0;
    out.push(o);
  }
  // Now and then a rule-breaker turns up.
  const rl = rulesLeft();
  if (rl.length && out.length > 1 && Math.random() < (run.luckyRules ? 0.35 : 0.16) + run.level * 0.004) out[0] = { kind: 'rule', id: pick(rl), rar: 3 };
  // Sometimes the devil offers a deal.
  const cursedLeft = Object.keys(CURSED).filter(k => !run.cursed.includes(k));
  if (cursedLeft.length && Math.random() < 0.12 && out.length) out[out.length - 1] = { kind: 'cursed', id: pick(cursedLeft), rar: 0 };
  if (!out.length) out.push({ kind: 'heal', rar: 0 });
  return out;
}

export function openLevelUp() {
  G.state = 'levelup';
  offers = run.btPick > 0 ? breakOffers() : makeOffers();
  sfx('level');
  renderLevelUp();
}
function renderLevelUp() {
  const bt = run.btPick > 0;
  show(`<div class="panel frame${bt ? ' breakthrough' : ''}"><div class="kick px">${bt ? 'Breakthrough · ' : ''}Level ${run.level}${run.pendingLv > 1 ? ` · ${run.pendingLv - 1} more to pick` : ''}</div><h2>${bt ? 'You earned this' : 'Choose a mutation'}</h2>
    <p class="px" style="font-size:12px;color:#ff7a6a">Every pick raises the threat · now ${(run.T || 0).toFixed(1)}</p>
    <div class="cards">${offers.map((o, i) => {
      if (o.kind === 'heal') return `<button class="card" data-i="${i}" style="--rc:#d8342c"><div class="row"><span class="key px">${i + 1}</span><span class="role">Heal</span></div><div class="ico">${ICON.heal}</div><b>Stale Cheese</b><span class="d">Restore half your HP.</span></button>`;
      if (o.kind === 'evo') { const E = EVO[o.id]; return `<button class="card" data-i="${i}" style="--rc:#ffd040"><div class="row"><span class="key px">${i + 1}</span><span class="role">Evolution</span></div><div class="ico">${ICON[o.id]}</div><b>${E.name}</b><span class="d">${WEAP[o.id].name} evolves. ${E.desc}</span></button>`; }
      if (o.kind === 'rule') { const R = RULES[o.id]; return `<button class="card" data-i="${i}" style="--rc:#ff4ad0"><div class="row"><span class="key px">${i + 1}</span><span class="role">Rule breaker</span></div><div class="ico">${ICON.dna}</div><b>${R.name}</b><span class="d">${R.desc}</span></button>`; }
      if (o.kind === 'key') { const K = KEYSTONES[o.id]; return `<button class="card" data-i="${i}" style="--rc:#ff9a3a"><div class="row"><span class="key px">${i + 1}</span><span class="role">Keystone</span></div><div class="ico">${ICON.dna}</div><b>${K.name}</b><span class="d">${K.desc}</span></button>`; }
      if (o.kind === 'cursed') { const C = CURSED[o.id]; return `<button class="card cursed" data-i="${i}" style="--rc:#ff2a2a"><div class="row"><span class="key px">${i + 1}</span><span class="role">Cursed deal</span></div><div class="ico">${ICON.skull}</div><b>${C.name}</b><span class="up">+ ${C.up}</span><span class="dn">− ${C.dn}</span></button>`; }
      const T = o.kind === 'tome' ? TOMES[o.id] : null, Wp = WEAP[o.id], R = RAR[o.rar], lvl = o.kind === 'up' ? run.weapons.find(w => w.id === o.id).lvl : 0;
      const rc = o.kind === 'new' ? '#ff6a3a' : o.kind === 'up' ? '#6ad06a' : R.c, label = o.kind === 'new' ? 'New weapon · ' + Wp.role : o.kind === 'up' ? 'Level ' + (lvl + 1) : R.n + ' tome';
      return `<button class="card" data-i="${i}" style="--rc:${rc}"><div class="row"><span class="key px">${i + 1}</span><span class="role">${label}</span></div><div class="ico">${T ? ICON.tome : ICON[o.id]}</div>
        <b>${T ? T.name : Wp.name}</b><span class="d">${T ? T.d(R.m) : o.kind === 'new' ? Wp.desc : Wp.lv[lvl - 1]}</span></button>`;
    }).join('')}</div>
    ${run.rerolls > 0 ? `<div class="btns"><button class="btn ghost" id="rr">${ICON.reroll} Reroll (${run.rerolls} left) · R</button></div>` : ''}</div>`);
  ov.querySelectorAll('.card').forEach(b => { b.onclick = () => choose(offers[+b.dataset.i]); });
  const rr = $('rr');
  if (rr) rr.onclick = reroll;
}
export function reroll() {
  if (!(run.rerolls > 0) || G.state !== 'levelup') return;
  run.rerolls--;
  offers = run.btPick > 0 ? breakOffers() : makeOffers();
  renderLevelUp();
}
export function choose(o) {
  addThreat(0.2);
  if (o.kind === 'new') run.weapons.push({ id: o.id, lvl: meta.nest.arms ? 2 : 1, t: 0 });
  else if (o.kind === 'up') run.weapons.find(w => w.id === o.id).lvl++;
  else if (o.kind === 'tome') { run.tomes[o.id] = (run.tomes[o.id] || 0) + 1; TOMES[o.id].ap(RAR[o.rar].m); }
  else if (o.kind === 'cursed') giveCursed(o.id);
  else if (o.kind === 'evo') evolve(o.id);
  else if (o.kind === 'key') applyKeystone(o.id);
  else if (o.kind === 'rule') applyRule(o.id);
  else run.hp = Math.min(st.maxHp, run.hp + st.maxHp * 0.5);
  if (run.btPick > 0) run.btPick--;
  run.pendingLv--;
  renderSlots();
  hud();
  if (run.pendingLv > 0) openLevelUp();
  else { hideOverlay(); G.state = 'play'; G.last = performance.now(); }
}

// ---------- endings ----------
function dmgTable() {
  const C = CLASSES[run.cls];
  const names = {
    ...Object.fromEntries(Object.entries(WEAP).map(([k, w]) => [k, w.name])), primary: PRIM[C.prim].name, special: SPECIALS[C.special].name,
    dot: 'Poison, burn & bleed', rule: 'Rule breakers', event: 'District events', level: 'Level-up bursts', volt: '9-Volt Battery', swarm: 'Nest-mates', trap: 'Traps & falling debris', runt: 'The Runt', thorns: 'Thorns', shrapnel: 'Shrapnel', bonk: 'Bonks & splats', fire: 'Fire', sludge: 'Toxic sludge',
    livewire: 'Livewire Claws', tesla: 'Tesla Coil', nailbomb: 'Nail Bomb', recoil: 'Slingshot Recoil', overclock: 'Overclock',
  };
  const dmg = Object.entries(run.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 10), mx = dmg.length ? dmg[0][1] : 1;
  return `<div class="dbar">${dmg.map(([k, v]) => `<span>${names[k] || k}</span><i style="width:${v / mx * 100}%"></i><span style="text-align:right">${commas(v)}</span>`).join('')}</div>`;
}

export function die() {
  G.state = 'dead';
  const got = checkUnlocks();
  const nb = G.mode === 'survival' && run.time > best.time;
  if (nb) { Object.assign(best, { time: run.time, kills: run.kills, district: run.tier }); saveBest(); }
  const dm = dominanceOf(), banked = bankSalvage(), score = runScore(), place = recordDaily(score);
  show(`<div class="panel narrow frame"><div class="kick px">${nb ? 'New best' : 'Run over'} · ${dName()}</div><h1 style="font-size:clamp(64px,9vw,120px)">You died</h1><p style="font-style:italic;margin-top:-6px">${epitaph()}</p>
    <div class="stat px"><div><b>${fmt(run.time)}</b><span>Survived</span></div><div><b>${run.kills}</b><span>Kills</span></div><div><b>${run.level}</b><span>Level</span></div><div><b>${run.tier + 1}</b><span>Districts</span></div><div><b>${(run.T || 0).toFixed(1)}</b><span>Peak threat</span></div></div>
    <p class="px" style="font-size:15px">Score <b style="color:var(--gold)">${commas(score)}</b>${run.daily ? ` · Daily ${run.daily}${place ? ` · #${place} today` : ''}` : ''}${(run.ranks || []).length ? ` · ranks <span class="ranks">${run.ranks.map(r => r.r).join(' ')}</span>` : ''}</p>
    <p class="px" style="color:#9ad0ff;font-size:13px">+${banked.salvage} salvage · <span style="color:#c080ff">+${banked.dom} dominance</span> banked at the Nest</p>
    <p class="px" style="font-size:11px;color:var(--dim)">Dominance: kills ${dm.parts.kills.toFixed(1)} · damage ${dm.parts.damage.toFixed(1)} · bosses ${dm.parts.bosses} · lairs ${dm.parts.lairs} · depth ${dm.parts.depth} · contracts ${dm.parts.contracts}${dm.mul > 1 ? ` · shortcut ×${dm.mul}` : ''}</p>
    ${got.length ? `<p class="px" style="color:#f2b233;font-size:13px">Unlocked: ${got.join(' · ')}</p>` : ''}${dmgTable()}
    <div class="btns"><button class="btn" id="again">Choose a rat</button><button class="btn ghost" id="share">Share run card</button><button class="btn ghost" id="nest">The Nest</button><span class="px" style="font-size:12px;color:var(--dim)">or press R</span></div></div>`);
  $('again').onclick = menu;
  $('share').onclick = async () => { const b = $('share'); b.textContent = 'Making card…'; const r = await shareCard(); b.textContent = r === 'shared' ? 'Shared' : 'Card saved'; };
  $('nest').onclick = () => { menu(); renderNest(); };
}

export function finishTrial() {
  G.state = 'done';
  checkUnlocks();
  const t = run.time, key = 'scurry4.ghost.' + run.seed, pb = loadJSON(key, null);
  const data = { s: run.seed, c: run.cls, t: +t.toFixed(2), sp: run.splits.map(x => +x.toFixed(2)), d: run.rec };
  const newPB = !pb || t < pb.t;
  if (newPB) saveJSON(key, data);
  const lb = loadJSON('scurry4.lb.' + run.seed, []);
  lb.push({ t, c: run.cls });
  lb.sort((a, b) => a.t - b.t);
  saveJSON('scurry4.lb.' + run.seed, lb.slice(0, 5));
  const banked = bankSalvage();
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const gh = G.ghost;
  show(`<div class="panel narrow frame"><div class="kick px">${newPB ? 'New personal best' : 'Trial complete'}</div><h2>Down the drain</h2>
    <div class="stat px"><div><b>${fmtT(t)}</b><span>Time</span></div>${gh ? `<div><b style="color:${t < gh.data.t ? '#6ad06a' : '#ff7a6a'}">${t < gh.data.t ? '−' : '+'}${Math.abs(t - gh.data.t).toFixed(1)}s</b><span>vs ghost</span></div>` : ''}<div><b>${run.kills}</b><span>Kills</span></div></div>
    <p class="px" style="color:#9ad0ff;font-size:13px">+${banked.salvage} salvage banked at the Nest</p>
    <p>Send this code to a friend. They paste it on the Ghost Trial screen to race your run this week.</p><textarea readonly id="code">${code}</textarea>
    <div class="btns"><button class="btn" id="cp">Copy ghost code</button><button class="btn ghost" id="again">Back to menu</button></div></div>`);
  $('cp').onclick = () => { const ta = $('code'); ta.select(); try { navigator.clipboard.writeText(code); } catch (_) { document.execCommand('copy'); } $('cp').textContent = 'Copied'; };
  $('again').onclick = menu;
}
