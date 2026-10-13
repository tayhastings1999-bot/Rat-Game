// The exit tally. Leaving a level (the road, the ladder, the manhole or a
// secret drain) stops on a card that counts up what you did there: nests
// smashed, the boss, the side job, secrets found, damage taken, time. They
// add up to a score out of 100 and a grade (S, A, B, C or D, thresholds in
// TUNE.tally), and the grade pays a gold bonus. The card dismisses itself after
// TUNE.tally.autoSecs (Enter, Space, E or the button skips it sooner). Bots and test harnesses skip the card (G.qa / G.testNoTally).
import { fmt } from '../core/util.js';
import { G, W, run, st } from '../core/state.js';
import { show, hideOverlay } from './screens.js';
import { dName } from '../data/world.js';
import { sfx } from '../audio/audio.js';
import { TUNE } from '../tuning.js';

/** This level's numbers, its score out of 100 and its grade. */
export function tallyCalc() {
  const T = TUNE.tally, l = run.lv0 || { kills: 0, scrap: 0, time: 0, nests: 0, food: 0 };
  const left = W.enemies.filter(e => e.type === 'nest' && !e.dead).length, nests = Math.max(0, l.nests - left);
  const obj = run.obj && run.obj.kind !== 'nests' ? run.obj : null, f = run.finds || { n: 0, m: 0 };
  const s = {
    kills: (run.kills || 0) - l.kills, gold: Math.floor((run.scrap || 0) - l.scrap), hurt: Math.round(run.dHurt || 0),
    time: (run.time || 0) - l.time, nests, nestsAll: l.nests, boss: !!run.bossDone, side: obj ? (obj.done ? 'done' : 'missed') : null,
    secrets: f.n, secretsAll: f.m, foodLost: (run.foodLost || 0) - l.food,
  };
  const part = {
    nests: T.wNests * (s.nestsAll ? s.nests / s.nestsAll : 1),
    boss: T.wBoss * (s.boss || !s.nestsAll ? 1 : 0),
    side: T.wSide * (s.side === 'missed' ? 0 : 1),
    secrets: T.wSecrets * (s.secretsAll ? s.secrets / s.secretsAll : 1),
    health: T.wHealth * Math.max(0, 1 - s.hurt / Math.max(1, st.maxHp * T.hurtPar)),
    time: T.wTime * Math.min(1, T.parTime / Math.max(1, s.time)),
  };
  const score = Math.round(Object.values(part).reduce((a, b) => a + b, 0));
  const grade = score >= T.S ? 'S' : score >= T.A ? 'A' : score >= T.B ? 'B' : score >= T.C ? 'C' : 'D';
  return { ...s, part, score, grade, bonus: T['gold' + grade] || 0 };
}

const COL = { S: '#ffd040', A: '#9be06a', B: '#9ad0ff', C: '#d0b0ff', D: '#a89468' };
let pending = null, autoT = null;

/** Show the tally card, then call `next` (the level transition) when the player moves on. */
export function showTally(next) {
  const t = tallyCalc();
  (run.ranks || (run.ranks = [])).push({ n: dName(), r: t.grade, t: Math.round(t.time), score: t.score });
  run.scrap = (run.scrap || 0) + t.bonus;
  run.lastTally = t;
  if (G.qa || G.testNoTally) { next(); return t; }
  pending = next;
  G.state = 'tally';
  const row = (label, v, pts, max) => `<tr><td>${label}</td><td>${v}</td><td class="pts">${Math.round(pts)}<span>/${max}</span></td></tr>`;
  show(`<div class="panel narrow frame tally"><div class="kick px">Level cleared · ${dName()}</div>
    <h1 style="font-size:clamp(56px,8vw,104px);color:${COL[t.grade]}">${t.grade}</h1>
    <p class="px" style="margin-top:-8px">Score <b style="color:var(--gold)">${t.score}</b> / 100${t.bonus ? ` · <span style="color:#f2b233">+${t.bonus} gold</span>` : ''}</p>
    <table class="tallyt px">
      ${row('Nests smashed', `${t.nests}/${t.nestsAll}`, t.part.nests, TUNE.tally.wNests)}
      ${row('Boss', t.boss ? 'beaten' : t.nestsAll ? 'skipped' : '–', t.part.boss, TUNE.tally.wBoss)}
      ${row('Side job', t.side || '–', t.part.side, TUNE.tally.wSide)}
      ${row('Secrets', t.secretsAll ? `${t.secrets}/${t.secretsAll}` : '–', t.part.secrets, TUNE.tally.wSecrets)}
      ${row('Damage taken', t.hurt, t.part.health, TUNE.tally.wHealth)}
      ${row('Time', fmt(t.time), t.part.time, TUNE.tally.wTime)}
    </table>
    <p class="px" style="font-size:13px;color:var(--dim)">${t.kills} kills · ${t.gold} gold picked up${t.foodLost ? ` · ${t.foodLost} food destroyed` : ''}</p>
    <div class="tallybar" style="height:4px;background:#ffffff22;margin:8px 0"><i style="display:block;height:100%;background:var(--gold);width:100%;transition:width ${TUNE.tally.autoSecs}s linear"></i></div>
    <div class="btns"><button class="btn" id="tallyGo">Onward</button><span class="px" style="font-size:12px;color:var(--dim)">Enter skips</span></div></div>`);
  document.getElementById('tallyGo').onclick = tallyContinue;
  const bar = document.querySelector('.tallybar i'); requestAnimationFrame(() => requestAnimationFrame(() => { if (bar) bar.style.width = '0%'; }));
  clearTimeout(autoT); autoT = setTimeout(tallyContinue, TUNE.tally.autoSecs * 1000); // a beat to read it, never a wall
  sfx('level');
  return t;
}

/** Leave the tally card and run the transition it was holding. */
export function tallyContinue() {
  if (G.state !== 'tally' || !pending) return;
  const next = pending;
  pending = null;
  clearTimeout(autoT);
  hideOverlay();
  G.state = 'play';
  next();
}
