// The story: Wick, the rat who ran, and Scab, the brother they left behind.
//
// Theme: running keeps you alive; going back is what makes you worth keeping.
// Wick survived the fire on Cinder Row by running and never looking back,
// and told the nest that their littermate Bram died under the beams. Bram
// didn't. He heard Wick run. He crawled into the sewer, was taken into the
// Rat King's Court, and learned the King sells whole colonies to the
// Exterminator so his Court stays fed. Bram, now Scab, lit the fire that
// drove Cinder Row out before the poison came. He saved them, and he
// hates them for leaving him. His answer is the Knot: bind every rat to
// every other by the tail, so no one is ever left behind again. Wick's
// flaw (run, alone) and Scab's (hold on, by force) are the same wound.
//
// Chapters unlock across runs as you hit milestones in play. Choices are
// saved, change how Scab fights you, and decide which endings you can reach:
// cutting Scab free needs a rat who has learned to go back for others
// (bonds: freed cages, Pip, sparing Scab, saying sorry).
import { G, run, st, meta, saveMeta } from '../core/state.js';
import { sfx } from '../audio/audio.js';
import { CLASSES } from '../data/classes.js';
import { FACE, facePortrait } from '../entities/rat.js';
import { banner } from '../ui/hud.js';

// ---------- the cast ----------
const LOOKS = {
  scab: { ...CLASSES.sneak, fur: 0x5a4a42, spike: 0x8a2a22, eye: 0xff3a20, gear: 0x4a2422, npc: true }, // a thief's hood
  king: { ...CLASSES.warlock, fur: 0x4a3c36, spike: 0x7a1a1a, eye: 0xff3a20, gear: 0xd8a830, npc: true }, // the cowl, gone gold
  moss: { ...CLASSES.plague, fur: 0xd0ccc4, spike: 0x8a8478, eye: 0x9ad0ff, gear: 0x6a5a48, npc: true },
  pip: { ...CLASSES.slinger, fur: 0xe0d0b8, spike: 0xb09878, eye: 0xffd070, gear: 0x7a5a3a, npc: true },
};
const WHO = {
  you: { name: 'Wick', col: '#f2b233' },
  scab: { name: 'Scab', col: '#ff5a3a' },
  king: { name: 'Scab, the Knotted King', col: '#ffd040' },
  moss: { name: 'Elder Moss', col: '#9ad0ff' },
  pip: { name: 'Pip', col: '#ffd070' },
  drone: { name: 'Unit 7 log', col: '#9be06a', mono: true },
  narr: { name: '', col: '#b3aab6' },
};
const faces = {};
const face = k => (k === 'you' ? FACE[run.cls] : LOOKS[k] ? (faces[k] ||= facePortrait(LOOKS[k])) : null);

// ---------- chapters ----------
// ch is the chapter in progress (0 = not started, 8 = the story is over).
export const CHAPTERS = [
  null,
  { t: 'Smoke', goal: 'Something is raiding the chests on the Row. Catch it.', sum: 'Cinder Row burned. Wick told the nest Bram died under the beams. Moss says the fire was set.' },
  { t: 'A Dead Rat Walking', goal: "Push on to the next district. Scab isn't done with you.", sum: 'The chest thief was Bram, alive, scarred, calling himself Scab. He heard Wick run.' },
  { t: 'Pip', goal: 'Free the caged rats. One of them is Pip.', sum: 'Scab took Pip to see if Wick would go back for anyone.' },
  { t: 'Pest Control', goal: 'Beat a boss in your third district or deeper (the Exterminator waits in Rust Yards).', sum: 'The Exterminator works from a list. Someone in the sewer writes it.' },
  { t: 'Below', goal: 'Take a manhole down into the sewer.', sum: 'The King sells colonies to the poison. Scab lit the fire to beat it there. He wants the King dead.' },
  { t: 'The Court of Tails', goal: "Find the Rat King deep in the sewer (Butcher's Drain).", sum: 'Under the city, rats are tied tail to tail: the Knot. Scab wants every rat in it.' },
  { t: 'Crown of Tails', goal: 'Scab wears the crown. Find him in the deep sewer.', sum: 'Every chest Scab let Wick win was to make them strong enough to kill the King for him.' },
];

// ---------- scenes ----------
// Lines are [speaker, text]. A choice ends a scene; each option can have its own reply lines.
const SCENES = {
  prologue: {
    lines: [
      ['narr', 'Cinder Row. The morning after.'],
      ['moss', 'Forty nests, Wick. Forty. Gone in one night.'],
      ['pip', "Where's Bram? Wick? You were with him. Where's Bram?"],
      ['you', '...He didn\'t make it out, Pip. The beams came down.'],
      ['moss', "Wet straw doesn't light itself. Somebody set that fire."],
      ['you', "Then I'll find them. Stay here. I'm faster alone."],
      ['moss', "Faster alone. You've always said that. And Wick? Something's been raiding the chests on the Row. Something that knows our ways."],
    ],
  },
  ghost: {
    lines: [
      ['scab', 'Easy. Easy! Hey, Wick. Miss me?'],
      ['you', "Bram...? No. You were under the beams. I saw them come down."],
      ['scab', 'You saw. You heard, too. I called your name until the smoke took my voice. And you ran.'],
      ['scab', "They call me Scab down below. It suits me better, don't you think?"],
      ['you', 'Did you set the fire?'],
      ['scab', 'Ask the thing in the yellow mask what it was bringing to Cinder Row. Then ask me again.'],
    ],
    choice: [
      { id: 'spare', label: 'Let him go', desc: 'He walks. You keep your hands clean.', reply: [['scab', 'Generous. You always were, once you were safe.']] },
      { id: 'strip', label: 'Take everything he has', desc: 'His stash of gold and food, right now.', reply: [['scab', "Go on, take it. You're good at taking. And at leaving."]] },
      { id: 'sorry', label: '"I heard you. I ran. I\'m sorry."', desc: 'Say the thing you never said.', reply: [['scab', "...Sorry doesn't lift beams, Wick."], ['scab', "But I'll remember you said it."]] },
    ],
  },
  pipGone: {
    lines: [
      ['moss', "Wick! Pip's gone. There are claw marks on the nest wall. Fresh ones."],
      ['narr', 'Scratched beside them, in a hand you know: "You left one behind. Let\'s see if you go back for this one. — B."'],
      ['you', 'Hold on, Pip. I\'m coming.'],
    ],
  },
  pipFound: {
    lines: [
      ['pip', "Wick! I knew you'd come. Bram said you wouldn't."],
      ['you', 'Bram... talked to you?'],
      ['pip', "He gave me his food. He coughs a lot. He said the King's men are coming with green dust, and that you never go back for anybody."],
      ['you', 'He was wrong.'],
      ['pip', "Can I come with you? I'm small, but I bite."],
    ],
  },
  bargain: {
    lines: [
      ['drone', 'UNIT 7. TARGET LIST SUPPLIED BY: THE CROWNED ONE. NEXT TARGET: CINDER ROW. STATUS: EVACUATED (FIRE). RE-TASKING.'],
      ['scab', 'Now you know. The King sells the streets to that thing, one nest at a time, so his Court stays fed.'],
      ['scab', "I heard them name Cinder Row. Nobody listens to a rat in a cage, so I lit the straw. Fire, you can run from. Poison, you can't."],
      ['you', 'You could have warned us!'],
      ['scab', "I did. Forty nests ran. Not one of them came back for me, either."],
      ['scab', 'The King dies. Then nobody sells anybody. Help me, or stay out of my way.'],
    ],
    choice: [
      { id: 'ally', label: 'Help him end the King', desc: 'Scab stops robbing you and leaves you supplies, until the King is dead.', reply: [['scab', "Finally, something we agree on. Don't make me regret it."]] },
      { id: 'refuse', label: '"Not your way. Never your way."', desc: 'He comes for your chests with a crew from now on.', reply: [['scab', "Then run, Wick. You're good at it."]] },
    ],
  },
  below: {
    lines: [
      ['narr', 'The tunnel opens into a hall of tails. Hundreds of rats, knotted together, breathing as one.'],
      ['scab', 'The Knot. Nobody here gets left under a beam. Nobody runs. Nobody is ever alone.'],
      ['you', "They can't move, Bram. That isn't a nest. It's a cage with fur."],
      ['scab', "It's a cage you can't fall out of. When I wear the crown, every rat in the city goes into the Knot. Pip. Moss. You."],
      ['scab', '...Me too. Especially me.'],
    ],
  },
  knot: {
    lines: [
      ['narr', 'The Rat King comes apart. Before you can reach the crown, someone else lifts it.'],
      ['scab', 'Steady... there. It\'s lighter than it looks.'],
      ['scab', "Every chest I let you catch me with. Every crate I dropped. I needed you strong enough to kill him. You were always going to be my claws, Wick."],
      ['you', 'You used me.'],
      ['scab', "I needed you. That's different. Ask Pip."],
      ['scab', "Go home. Next time we meet I'll be the Court, and the Court doesn't let go."],
    ],
  },
  finale: {
    lines: [
      ['king', 'Go on, then. Run. You always do.'],
      ['narr', 'The crown is cracked. The Knot that is Scab heaves around him, a hundred tails pulling every way at once. He is tied in deepest of all.'],
      ['you', '(Every instinct says run. Running is how you got this far.)'],
    ],
    choice: [
      { id: 'cut', label: 'Cut him out of the Knot', need: 'bonds', desc: 'Go back for him. This time.' },
      { id: 'leave', label: 'Leave him in the Knot', desc: 'Walk away. You never look back.' },
      { id: 'crown', label: 'Take the crown', desc: 'Someone has to hold the city together.' },
    ],
  },
  endCut: {
    lines: [
      ['narr', 'You gnaw through the first tail. Then the next. Then the next. The Knot comes apart one rat at a time, and every freed rat stays to help.'],
      ['king', '...You came back.'],
      ['you', "Late. But I came back."],
      ['narr', 'Bram lives in the Nest now. He limps, he coughs, and he can\'t sleep in the dark. Every night Pip makes him tell the story of the fire, and every night he tells it a little more kindly.'],
    ],
  },
  endLeave: {
    lines: [
      ['narr', 'You turn your back. Behind you the Knot screams your name, the way he did under the beams.'],
      ['narr', "You don't look back. You never do. The streets are yours now, and they are very quiet."],
    ],
  },
  endCrown: {
    lines: [
      ['narr', 'You lift the cracked crown. It is lighter than it looks.'],
      ['you', 'Just until it\'s safe.'],
      ['narr', 'You tie the first tail yourself. Pip watches you the way Bram used to watch the King.'],
      ['narr', 'Long live the King.'],
    ],
  },
};

// ---------- persistent state ----------
const S = () => (meta.story ||= { ch: 0, seen: {}, mercy: 0, spite: 0, bonds: 0, sorry: false, pip: false, ally: null, ending: null });
export const story = S;
export const chapter = () => S().ch;
const save = () => saveMeta();
/** Bonds: proof that Wick has learned to go back for others. The best ending needs three. */
export const BONDS_NEEDED = 8;
export function bond(n = 1) { S().bonds += n; save(); }

// ---------- the dialogue player ----------
const queue = [];
let cur = null;
/** Harness runs (?debug) resolve scenes instantly with the first choice, unless a test asks to see them. */
const silent = () => G.qa || ((location.search || '').includes('debug') && !G.testStory);
export function play(id, done) {
  if (S().seen[id] && !SCENES[id].repeat) { done && done(null); return; }
  if (silent()) { S().seen[id] = true; const c = SCENES[id].choice; const pickC = c ? c.find(o => available(o)) : null; save(); done && done(pickC ? pickC.id : null); return; }
  queue.push({ id, done });
}
/** Called every frame while playing: opens the next queued scene when the game is free. */
export function tickStory() {
  if (cur || !queue.length || G.state !== 'play') return;
  const q = queue.shift();
  open(q.id, q.done);
}
const available = o => o.need !== 'bonds' || S().bonds >= BONDS_NEEDED;
let el = null;
function box() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'story';
  el.addEventListener('click', e => { if (!e.target.closest('button')) advance(); });
  document.body.appendChild(el);
  return el;
}
function open(id, done) {
  const sc = SCENES[id];
  cur = { id, done, lines: sc.lines.slice(), i: 0, choice: sc.choice, typed: 0, timer: null, picked: null };
  G.state = 'story';
  box().classList.add('on');
  sfx('phase');
  show();
}
function show() {
  const [k, text] = cur.lines[cur.i], w = WHO[k], f = face(k);
  clearInterval(cur.timer);
  cur.typed = 0;
  box().innerHTML = `<div class="sbox frame">${f ? `<img class="sface" src="${f}" alt="">` : ''}<div class="sbody">${w.name ? `<div class="sname px" style="color:${w.col}">${w.name}</div>` : ''}<div class="stext${w.mono ? ' mono' : ''}${k === 'narr' ? ' narr' : ''}"></div><div class="shint px">${cur.i < cur.lines.length - 1 || cur.choice ? 'Space ›' : 'Space · done'} <span class="sskip">Esc skips</span></div></div></div>`;
  const t = el.querySelector('.stext');
  cur.timer = setInterval(() => { cur.typed += 2; t.textContent = text.slice(0, cur.typed); if (cur.typed >= text.length) clearInterval(cur.timer); }, 16);
}
function full() { const [, text] = cur.lines[cur.i]; return cur.typed >= text.length; }
export function advance() {
  if (!cur || cur.choosing) return;
  if (!full()) { clearInterval(cur.timer); cur.typed = 1e9; el.querySelector('.stext').textContent = cur.lines[cur.i][1]; return; }
  if (cur.i < cur.lines.length - 1) { cur.i++; show(); sfx('pickup'); return; }
  if (cur.choice && !cur.picked) return showChoice();
  close();
}
export function skip() {
  if (!cur || cur.choosing) return;
  clearInterval(cur.timer);
  if (cur.choice && !cur.picked) return showChoice();
  close();
}
function showChoice() {
  cur.choosing = true;
  const opts = cur.choice;
  box().innerHTML = `<div class="sbox frame schoice"><div class="sbody"><div class="sname px" style="color:var(--gold)">What do you do?</div>${opts.map((o, i) => {
    const ok = available(o);
    return `<button class="sopt${ok ? '' : ' locked'}" data-i="${i}" ${ok ? '' : 'disabled'}><span class="key px">${i + 1}</span><b>${o.label}</b><span class="d">${ok ? o.desc : `You haven't learned to go back for others. Not yet. (${S().bonds}/${BONDS_NEEDED} bonds: free caged rats, save Pip, spare Scab)`}</span></button>`;
  }).join('')}</div></div>`;
  el.querySelectorAll('.sopt').forEach(b => { b.onclick = () => choose(+b.dataset.i); });
}
export function choose(i) {
  if (!cur || !cur.choosing) return;
  const o = cur.choice[i];
  if (!o || !available(o)) return;
  cur.choosing = false;
  cur.picked = o.id;
  sfx('key');
  if (o.reply && o.reply.length) { cur.lines = o.reply.slice(); cur.i = 0; cur.choice = null; show(); return; }
  close();
}
function close() {
  clearInterval(cur.timer);
  const c = cur;
  cur = null;
  S().seen[c.id] = true;
  save();
  el.classList.remove('on');
  el.innerHTML = '';
  G.state = 'play';
  G.last = performance.now();
  c.done && c.done(c.picked);
}
export const inScene = () => !!cur;

// ---------- hooks from gameplay ----------
/** Run start: chapter card, carry-overs (Pip, the ending's mark), the prologue. */
export function onRunStart() {
  const s = S();
  G.scabKing = s.ch >= 7; // chapter 7: the Rat King in the deep sewer is Scab
  // The ending leaves a mark on every run after it.
  if (s.ending === 'cut') st.healMul *= 1.15;
  if (s.ending === 'leave') st.speed *= 1.08;
  if (s.ending === 'crown') { st.dmg += 0.1; st.taken *= 1.1; }
  if (s.ch === 0) play('prologue', () => { s.ch = 1; save(); chapterCard(); });
  else if ((s.ch === 2 || s.ch === 3) && run.obj && run.obj.kind === 'rescue' && run.tier >= 1) pipDistrict(); // a shortcut start lands straight in Pip's district
  else setTimeout(chapterCard, 2600);
}
function chapterCard() {
  const s = S(), c = CHAPTERS[s.ch];
  if (G.state !== 'play' || !c) return;
  banner(`Chapter ${s.ch} · ${c.t}`, c.goal);
}
/** The district subtitle: the current chapter's goal (or the old one-line beat when the story is done). */
export function storyGoal() { const c = CHAPTERS[S().ch]; return c ? c.goal : null; }

/** A new district. Chapter 2 → 3: Pip has been taken; this district's job is a rescue. */
export function onDistrict() {
  const s = S();
  if ((s.ch === 2 || s.ch === 3) && run.tier >= 1 && run.obj && run.obj.kind === 'rescue') pipDistrict();
  if (s.ch === 5 && run.layer === 'sewer') play('below', () => { s.ch = 6; save(); chapterCard(); });
}
/** Pip's district: the rescue job holds Pip in the last cage. */
function pipDistrict() {
  const s = S();
  run.pipHere = true;
  if (s.ch === 2) play('pipGone', () => { s.ch = 3; save(); chapterCard(); });
  else setTimeout(() => G.state === 'play' && banner('Pip is still caged', 'Free the caged rats · Pip is in one of them'), 2600);
}
/** setupWorld asks which objective to force: the rescue that holds Pip. */
export const forcedObjective = () => ((S().ch === 2 || S().ch === 3) && (run.tier || 0) >= 1 && G.mode !== 'trial' ? 'rescue' : null);
/** A cage gnawed open. Freeing rats is going back for them: a bond. The last cage in Pip's district holds Pip. */
export function onCage(o) {
  bond();
  const s = S();
  if (run.pipHere && s.ch === 3 && o.freed >= o.cages.length) {
    run.pipHere = false;
    play('pipFound', () => { s.pip = true; bond(); s.ch = 4; save(); chapterCard(); });
  }
}
/** Scab caught. Returns a banner subtitle when the story takes over the moment. */
export function onScabCaught(e, rewards) {
  const s = S();
  if (s.ch === 1) {
    play('ghost', pick => {
      if (pick === 'spare' || pick === 'sorry') { s.mercy++; bond(pick === 'sorry' ? 2 : 1); } // owning it counts double
      if (pick === 'sorry') s.sorry = true;
      if (pick === 'strip') { s.spite++; rewards(); }
      s.ch = 2; save(); chapterCard();
    });
    return true;
  }
  return false;
}
/** A boss down. Pest Control → Below, the King → the crown changes hands, Scab → the end. */
export function onBossDeath(b) {
  const s = S();
  if (s.ch === 4 && (b.kind === 'exterm' || run.tier >= 2)) {
    play('bargain', pick => { s.ally = pick === 'ally'; s.ch = 5; save(); chapterCard(); });
  } else if (s.ch === 6 && b.kind === 'ratking') {
    play('knot', () => { s.ch = 7; G.scabKing = true; save(); chapterCard(); });
  } else if (s.ch === 7 && b.kind === 'ratking' && b.scabKing) {
    play('finale', pick => {
      const end = { cut: 'endCut', leave: 'endLeave', crown: 'endCrown' }[pick] || 'endLeave';
      s.ending = pick || 'leave';
      s.ch = 8;
      save();
      play(end, () => banner('The end of the story', { cut: 'You went back. From now on, food heals you 15% more.', leave: 'You kept running. Every run from now on, you run a little faster.', crown: 'You took the crown. From now on you hit 10% harder, and take 10% more.' }[s.ending]));
    });
  }
}

// ---------- how Scab fights you, chapter by chapter ----------
/** What Scab does when he shows up in a district. */
export function scabMode() {
  const s = S();
  if (s.ch >= 7) return 'gone'; // he wears the crown now
  if (s.ch >= 5 && s.ally) return 'ally';
  return s.ch >= 5 ? 'crew' : s.ch >= 2 ? 'poison' : 'thief';
}
const BARKS = {
  1: ['Too slow!', 'Finders keepers!', 'That chest? Mine now.', 'Catch me if you can!'],
  2: ['Still running, Wick?', 'Did you tell Pip you heard me?', 'Mind the green stuff. I stole it fresh.', 'You never look back. I counted on that.'],
  3: ['Tick tock, Wick. Pip is waiting.', 'I left you a trail. Poison, mostly.', 'Faster alone, right?'],
  4: ["How's Pip? Did you go back this time?", 'Still think I set that fire for fun?', 'The man in the yellow mask says hello.'],
  5: ['Boys, say hello to my brother.', "You chose this, Wick.", 'Every chest you lose, the King gets fatter.'],
  6: ['The Knot is waiting.', 'You could still join us.', "I'm doing this for you, too."],
};
export const scabBark = () => { const b = BARKS[Math.min(6, Math.max(1, S().ch))]; return b[(Math.random() * b.length) | 0]; };
export const scabLossLine = () => (S().sorry ? "...You said sorry once. I haven't forgotten." : S().spite ? 'Take it, then. You always do.' : "This isn't over, Wick.");

// ---------- journal (pause menu) ----------
export function journalHTML() {
  const s = S();
  const rows = CHAPTERS.slice(1).map((c, i) => {
    const n = i + 1, done = s.ch > n, now = s.ch === n;
    return `<div class="jrow${done ? ' done' : now ? ' now' : ' lock'}"><b class="px">${n}</b><div><b>${done || now ? c.t : '???'}</b><span>${done ? c.sum : now ? 'Now: ' + c.goal : 'Locked'}</span></div></div>`;
  }).join('');
  const choices = [s.mercy ? `spared Scab` : '', s.spite ? `robbed Scab` : '', s.sorry ? 'said sorry' : '', s.ally === true ? 'helped Scab against the King' : s.ally === false ? 'refused Scab' : '', s.pip ? 'went back for Pip' : ''].filter(Boolean);
  const end = s.ending ? `<p class="px" style="color:var(--gold)">Ending: ${{ cut: 'Going Back', leave: 'Still Running', crown: 'Long Live the King' }[s.ending]}</p>` : '';
  return `<div class="journal">${rows}</div><p class="px" style="font-size:12px;color:var(--dim)">Bonds ${s.bonds}/${BONDS_NEEDED} (going back for others: free caged rats, save Pip, spare Scab)${choices.length ? ' · you ' + choices.join(' · ') : ''}</p>${end}`;
}
/** Start the story over (keeps nothing but the Nest). */
export function resetStory() { meta.story = null; S(); save(); }

/** Debug/test handle. */
export const storyApi = { play, advance, skip, choose, chapter, story: S, onBossDeath, onScabCaught, onCage, scabMode, inScene, resetStory, tickStory, setChapter(n) { S().ch = n; save(); } };
