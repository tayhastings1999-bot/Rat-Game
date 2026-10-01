// Personality: boss intro cards, a story told one line per district, Scab
// the rival rat who keeps turning up to steal your loot, and chatter from
// the rats fighting beside you.
import { rand, pick, $ } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { gi, inG, toG, toW, tAt, floorY, bfs, OPEN, N8 } from '../world/grid.js';
import { scrapDrop } from '../combat/combat.js';
import { spawnEnemy, moveBody } from '../entities/mobs.js';
import { thiefAI } from './objectives.js';
import { dropCrate } from './progress.js';
import { banner } from '../ui/hud.js';

// ---------- boss intro cards ----------
export const BOSS_LORE = {
  tabby: ['Queen of Cinder Row', '"Little thing. I can hear your heart from here."'],
  murder: ['Lord of a Thousand Wings', '"Every rooftop is mine. Every crumb is mine."'],
  exterm: ['Pest Control Unit 7', '"TARGET: RODENT. PROTOCOL: ERADICATE."'],
  maw: ['Hunger of the Undersewer', '"...hungry... hungry... HUNGRY..."'],
  brood: ['Mother of the Cisterns', '"My children are so very hungry, little one."'],
  ratking: ['Crowned in Bone', '"You would climb to my throne? Then kneel on the way up."'],
};
let cardT = null;
export function bossIntro(b) {
  const L = BOSS_LORE[b.kind] || ['', ''];
  const el = $('introCard');
  el.innerHTML = `<div class="px kick">${L[0]}</div><h1>${b.name}</h1><p>${L[1]}</p>`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  $('banner').classList.remove('on'); // the card owns the screen for a moment
  G.slowMo = Math.max(G.slowMo || 0, 0.7);
  sfx('boss');
  clearTimeout(cardT);
  cardT = setTimeout(() => el.classList.remove('on'), 2600);
}

// ---------- the story, one beat per district ----------
const STORY = [
  'Cinder Row. Your nest burned last night, and it was no accident.',
  'The smoke smelled of bone and old crowns. Someone wants the streets cleared.',
  'Scab knows more than he says. He always does.',
  'The sewer whispers a name: the Rat King. Every district you take, he loses one.',
  'Deeper. The walls are warm here, like something is breathing behind them.',
  "The Court is close. Can you hear the throne creaking?",
  'Every street you take back is another nest that sleeps safe tonight.',
];
export const storyBeat = () => STORY[Math.min(STORY.length - 1, run.tier || 0)];
export const epitaph = () => pick(['The streets remember your name.', 'Somewhere, a nest-mate is still running.', 'Scab will tell everyone he did it.', 'The Rat King laughs, for now.', 'Rats always come back.']);

// ---------- Scab, the rival ----------
const SCAB_BARKS = ['Ha! Too slow, nest-rat!', "Finders keepers!", "That chest? Mine now.", "You smell like a sewer. Wait, so do I.", 'Catch me if you can!', "I'm telling the King!"];
const SCAB_LOSS = ['Ow! OW! Fine, have it!', "This isn't over!", 'Next time, nest-rat. Next time.'];
/** Scab turns up about half a minute into most districts, heading for a chest. */
function spawnScab() {
  const chests = W.chests.filter(c => !c.open && !c.cursed && c.y < 0.5 && Math.hypot(c.x - P.x, c.z - P.z) > 15);
  if (!chests.length) return;
  const c = chests[(Math.random() * chests.length) | 0];
  // Start him a little way from the chest, on open ground.
  let e = null;
  for (let i = 0; i < 20 && !e; i++) {
    const a = rand(0, 6.3), r = rand(8, 14), x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r, t = tAt(toG(x), toG(z));
    if (t === 1 || t === 9 || t === 10) e = spawnEnemy('mawling', x, z, { plain: true, sc: 1.25, hpMul: (8 + run.tier * 3) * Math.pow(1.5, run.scabLosses || 0), force: true, name: 'Scab' });
  }
  if (!e) return;
  const gx = toG(c.x), gz = toG(c.z);
  Object.assign(e, { scab: true, bar: true, xp: 0, spd: e.spd * 1.35, goal: c, field: inG(gx, gz) ? bfs(gx, gz, OPEN) : null, barkT: 2, fleeT: 0 });
  run.scab = e;
  banner('Scab', `"${pick(SCAB_BARKS)}" · he's after a chest · catch him`);
  sfx('caw');
}
function scabAI(e, dt) {
  e.barkT -= dt;
  if (e.barkT <= 0) { e.barkT = rand(4, 7); dnum(e.x, e.y + 1.8, e.z, pick(SCAB_BARKS), 'info'); }
  if (e.fleeT > 0) {
    // Loot in his paws: run, and vanish if he gets away long enough.
    e.fleeT -= dt;
    thiefAI(e, dt);
    if (e.fleeT <= 0) { e.dead = true; puff(e.x, e.y + 0.5, e.z, 0x6a6a6a, 16, 3); banner('Scab got away', 'With your loot. He\'ll be back.'); run.scab = null; }
    return;
  }
  const c = e.goal;
  if (!c || c.open) { e.fleeT = 14; return; }
  if (Math.hypot(c.x - e.x, c.z - e.z) < 1.6) {
    c.open = true;
    if (c.lid) c.lid.rotation.x = -1.9;
    puff(c.x, c.y + 0.8, c.z, 0xffd070, 10, 2);
    dnum(e.x, e.y + 1.8, e.z, 'MINE!', 'crit');
    e.stolen = true;
    e.fleeT = 14;
    return;
  }
  // Walk the chest's distance field downhill.
  let dir = null;
  if (e.field) {
    const gx = toG(e.x), gz = toG(e.z);
    let bd = inG(gx, gz) ? e.field[gi(gx, gz)] : -1;
    for (const [dx, dz] of N8) {
      const X = gx + dx, Z = gz + dz;
      if (!inG(X, Z)) continue;
      const f = e.field[gi(X, Z)];
      if (f >= 0 && (bd < 0 || f < bd)) { bd = f; dir = [toW(X) - e.x, toW(Z) - e.z]; }
    }
    if (bd <= 1) dir = [c.x - e.x, c.z - e.z];
  }
  if (!dir) dir = [c.x - e.x, c.z - e.z];
  const l = Math.hypot(dir[0], dir[1]) || 1;
  moveBody(e, dt, dir[0] / l * e.spd, dir[1] / l * e.spd);
  e.ang = Math.atan2(dir[0], dir[1]);
}
/** Called from kill(). */
export function scabDown(e) {
  if (!e.scab) return;
  run.scab = null;
  run.scabLosses = (run.scabLosses || 0) + 1;
  const gy = floorY(e.x, e.z);
  for (let i = 0; i < (e.stolen ? 25 : 12); i++) scrapDrop(e.x, gy, e.z);
  dropCrate(e.x, gy, e.z);
  if (run.scabLosses >= 3 && !run.scabDone) {
    run.scabDone = true;
    run.btPick = (run.btPick || 0) + 1;
    run.pendingLv++;
    banner('Scab gives up', '"Fine! FINE! Take it, and leave me alone!" · a Breakthrough-grade pick');
  } else banner('Scab drops the loot', `"${pick(SCAB_LOSS)}"`);
}

// ---------- chatter from your rats ----------
const CHATTER = { boss: ['Big one!', 'That thing ate my cousin!', 'Stay behind it!'], low: ['You\'re bleeding!', 'Eat something!', 'Fall back!'], kill: ['Got one!', 'Ha!', 'For the nest!'], idle: ['Cheese... I smell cheese.', 'Which way now?', 'Scab was here. I can smell him.'] };
let chatT = 8;
function chatter(dt) {
  if (!W.familiars.length) return;
  chatT -= dt;
  if (chatT > 0) return;
  chatT = rand(12, 20);
  const f = pick(W.familiars), k = G.boss && G.boss.revealed ? 'boss' : run.hp < 0.3 * (run.maxHpCache || 100) ? 'low' : Math.random() < 0.5 ? 'kill' : 'idle';
  dnum(f.x, f.y + 1.2, f.z, pick(CHATTER[k]), 'info');
}

export function tickPersonality(dt, maxHp) {
  run.maxHpCache = maxHp;
  chatter(dt);
  const e = run.scab;
  if (e && !e.dead) scabAI(e, dt);
  if (G.mode === 'trial' || run.scabDone) return;
  // Once per district.
  if (!run.scabSeen && !e && run.time - run.dStart > 32) { run.scabSeen = true; spawnScab(); }
}
