// Personality: boss intro cards, a story told one line per district, and Scab,
// the rival rat who keeps turning up to steal your loot.
import { rand, pick, $ } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { puff, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { gi, inG, toG, toW, tAt, floorY, bfs, OPEN, N8 } from '../world/grid.js';
import { scrapDrop } from '../combat/combat.js';
import { spawnEnemy, moveBody } from '../entities/mobs.js';
import { thiefAI } from './objectives.js';
import { dropLoot } from './progress.js';
import { banner } from '../ui/hud.js';
import { puddle } from '../combat/hazards.js';
import { scabMode, scabBark, scabLossLine, onScabCaught, tickStory } from './story.js';

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
  const L = b.lore || BOSS_LORE[b.kind] || ['', ''];
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
export const storyBeat = () => STORY[Math.min(STORY.length - 1, run.tier || 0)]; // used once the story (story.js) is finished
export const epitaph = () => pick(['The streets remember your name.', 'Somewhere, a nest-mate is still running.', 'Scab will tell everyone he did it.', 'The Rat King laughs, for now.', 'Rats always come back.']);

// ---------- Scab, the rival ----------
/** Scab turns up about half a minute into most districts, heading for a chest. */
function spawnScab() {
  const mode = scabMode();
  if (mode === 'gone') return;
  if (mode === 'ally') { scabGift(); return; }
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
  e.mode = mode;
  e.trailT = 1.5;
  // Refused him at the bargain: he brings a crew.
  if (mode === 'crew') for (let i = 0; i < 3; i++) spawnEnemy('mawling', e.x + rand(-2, 2), e.z + rand(-2, 2), { plain: true, elite: i === 0, force: true, name: "Scab's crew" });
  banner('Scab', `"${scabBark()}" · he's after a chest${mode === 'poison' ? ' · watch for his poison' : mode === 'crew' ? ' · and he brought friends' : ''} · catch him`);
  sfx('caw');
}
function scabAI(e, dt) {
  e.barkT -= dt;
  if (e.barkT <= 0) { e.barkT = rand(4, 7); dnum(e.x, e.y + 1.8, e.z, scabBark(), 'info'); }
  // From chapter 2 he lays the Exterminator's stolen poison behind him as he runs.
  if (e.mode !== 'thief') { e.trailT -= dt; if (e.trailT <= 0) { e.trailT = e.fleeT > 0 ? 1.1 : 2.2; puddle('poison', e.x, e.z, 1.6, 7, 'all'); } }
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
/** Allied with him (chapter 4-5): instead of robbing you, he leaves supplies and goes. */
function scabGift() {
  let x = P.x, z = P.z;
  for (let i = 0; i < 12; i++) { const a = rand(0, 6.3), r = rand(3, 6), tx = P.x + Math.sin(a) * r, tz = P.z + Math.cos(a) * r, t = tAt(toG(tx), toG(tz)); if (t === 1 || t === 9 || t === 10) { x = tx; z = tz; break; } }
  dropLoot(x, floorY(x, z), z);
  puff(x, floorY(x, z) + 0.5, z, 0x6a6a6a, 14, 3);
  banner('Scab was here', '"Don\'t make me regret this." · supplies');
}
/** Called from kill(). */
export function scabDown(e) {
  if (!e.scab) return;
  run.scab = null;
  run.scabLosses = (run.scabLosses || 0) + 1;
  const gy = floorY(e.x, e.z);
  for (let i = 0; i < (e.stolen ? 25 : 12); i++) scrapDrop(e.x, gy, e.z);
  dropLoot(e.x, gy, e.z);
  // The first time you catch him, the story takes the moment (and Robbing him pays out here).
  if (onScabCaught(e, () => { dropLoot(e.x + 1.4, gy, e.z); for (let i = 0; i < 20; i++) scrapDrop(e.x, gy, e.z); })) return;
  if (run.scabLosses >= 3 && !run.scabDone) {
    run.scabDone = true;
    dropLoot(e.x, gy, e.z, 30, 1);
    banner('Scab gives up', '"Fine! FINE! Take it, and leave me alone!" · his whole stash');
  } else banner('Scab drops the loot', `"${scabLossLine()}"`);
}

export function tickPersonality(dt, maxHp) {
  run.maxHpCache = maxHp;
  tickStory();
  const e = run.scab;
  if (e && !e.dead) scabAI(e, dt);
  if (run.scabDone) return;
  // Once per district.
  if (!run.scabSeen && !e && run.time - run.dStart > 32) { run.scabSeen = true; spawnScab(); }
}
