// Overlay screens: main menu, pause, map and death.
import { journalHTML, CHAPTERS, chapter } from '../game/story.js';
import { fmt, commas, $ } from '../core/util.js';
import { G, run, meta, best, settings, saveMeta, saveSettings, saveBest } from '../core/state.js';
import { CLASSES, SKINS, skinOk } from '../data/classes.js';
import { MODS, dName } from '../data/world.js';
import { M } from '../world/grid.js';
import { PRIM, SPECIALS } from '../combat/arsenal.js';
import { applyVolumes } from '../audio/audio.js';
import { PORT, refreshPortraits, setRat } from '../entities/rat.js';
import { startRun, checkUnlocks, bankSalvage, menu } from '../game/flow.js';
import { epitaph } from '../game/personality.js';
import { runScore, shareCard } from '../game/score.js';
import { drawMap } from './hud.js';
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
        <p>Each rat has four stats: <b>Strength</b> (attack damage), <b>Speed</b> (movement and attack rate), <b>Armor</b> (damage taken) and <b>Magic</b> (specials, turbo and vials).</p></div>
      <div><h3 class="px">Keyboard &amp; mouse</h3><p><kbd>WASD</kbd> move · <kbd>Mouse</kbd> aim · <kbd>Left click</kbd> or <kbd>J</kbd> attack (hold to repeat) · <kbd>Shift</kbd> dodge · <kbd>Space</kbd> jump, hold on a wall to climb · <kbd>Q</kbd> special · <kbd>G</kbd> signature · <kbd>X</kbd> turbo (tap: blast, hold + Q/G: turbo move) · <kbd>Z</kbd> Rot Vial · <kbd>R</kbd> lock on · <kbd>E</kbd> use, hold to gnaw · <kbd>C</kbd> squeeze · <kbd>F</kbd> sniff · <kbd>M</kbd> map · <kbd>Wheel</kbd> zoom · <kbd>Esc</kbd> pause</p></div>
      <div><h3 class="px">Touch</h3><p>Left stick to move. Attack aims at the nearest enemy in front of you. Jump, Dodge, Special, Sig and Use sit on the right. Tap Turbo for your blast; hold Turbo, let go, then tap Special or Sig for the turbo version. Vial throws a Rot Vial.</p></div>
    </div>`;

export function renderMenu() {
  G.state = 'menu';
  show(`<div class="panel frame">
    <div class="kick px">A rat brawler · Streets above, sewer below</div><h1>Scurry</h1>
    <p>Cinder Row burned, and the streets are crawling. Smash the nests, find the keys and the food, and kill what rules each zone.</p>
    ${HOWTO}
    <div class="kick px">Pick a rat to start · ${commas(meta.salvage || 0)} gold banked</div>
    <div class="cards">${Object.entries(CLASSES).map(([k, C], i) => `<button class="card" data-k="${k}" style="--rc:${C.rc}">
        <div class="row"><span class="key px">${i + 1}</span><span class="role">${C.role}</span></div><img class="por" src="${PORT[k]}" alt="">
        <b>${C.name}</b><span class="d">${C.blurb}</span>
        <span class="s">${TUNE.classes[k].hp} HP · ${PRIM[C.prim].name}</span>
        <span class="stats">${STAT_KEYS.map(sk => `<i title="${STAT_NAMES[sk]} ${TUNE.classes[k][sk]}/10"><em>${sk.toUpperCase()}</em><u><s style="width:${TUNE.classes[k][sk] * 10}%"></s></u></i>`).join('')}</span>
        <span class="s">Q: ${SPECIALS[C.special].name}<br>G: ${SIGS[k] ? SIGS[k].name : ''}<br>X: ${BLASTS[k] ? BLASTS[k].name : ''}</span></button>`).join('')}</div>${skinsHTML()}
    <p class="px" style="font-size:12px">${best.time ? `Longest run: ${fmt(best.time)} · ${best.kills} kills` : 'No runs yet'}</p></div>`);
  G.mode = 'survival';
  ov.querySelectorAll('.card').forEach(b => { b.onclick = () => startRun(b.dataset.k); });
  ov.querySelectorAll('[data-s]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.s;
      if (!skinOk(i)) return;
      meta.skin = i;
      saveMeta();
      refreshPortraits();
      setRat(CLASSES.brawler);
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
    </div>
    <div class="btns"><button class="btn" id="resumeBtn">Resume</button><button class="btn ghost" id="quit">Abandon run</button></div></div>`);
  $('resumeBtn').onclick = resume;
  $('sSh').oninput = e => { settings.shake = +e.target.value; saveSettings(); };
  $('sMu').oninput = e => { settings.music = +e.target.value; applyVolumes(); saveSettings(); };
  $('sFx').oninput = e => { settings.sfx = +e.target.value; applyVolumes(); saveSettings(); };
  $('quit').onclick = () => { G.state = 'play'; run.hp = 0; die(); };
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
  G.state = 'dead';
  const got = checkUnlocks();
  const nb = run.time > best.time;
  if (nb) { Object.assign(best, { time: run.time, kills: run.kills, district: run.tier }); saveBest(); }
  const banked = bankSalvage(), score = runScore();
  show(`<div class="panel narrow frame"><div class="kick px">${nb ? 'New best' : 'Run over'} · ${dName()}</div><h1 style="font-size:clamp(64px,9vw,120px)">You died</h1><p style="font-style:italic;margin-top:-6px">${epitaph()}</p>
    <div class="stat px"><div><b>${fmt(run.time)}</b><span>Survived</span></div><div><b>${run.kills}</b><span>Kills</span></div><div><b>${run.level}</b><span>Level</span></div><div><b>${run.tier + 1}</b><span>Zones</span></div></div>
    <p class="px" style="font-size:15px">Score <b style="color:var(--gold)">${commas(score)}</b>${(run.ranks || []).length ? ` · ranks <span class="ranks">${run.ranks.map(r => r.r).join(' ')}</span>` : ''}</p>
    <p class="px" style="color:#9ad0ff;font-size:13px">+${banked.salvage} gold banked</p>
    ${got.length ? `<p class="px" style="color:#f2b233;font-size:13px">Unlocked: ${got.join(' · ')}</p>` : ''}${dmgTable()}
    <div class="btns"><button class="btn" id="again">Choose a rat</button><button class="btn ghost" id="share">Share run card</button><span class="px" style="font-size:12px;color:var(--dim)">or press R</span></div></div>`);
  $('again').onclick = menu;
  $('share').onclick = async () => { const b = $('share'); b.textContent = 'Making card…'; const r = await shareCard(); b.textContent = r === 'shared' ? 'Shared' : 'Card saved'; };
}
