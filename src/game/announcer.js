// The announcer: short barks at the moments that matter. For now that's low
// health; Phase 4 adds more. Barks show as a big line low on the screen, and
// if the Voice setting is on they're also spoken (the browser's built-in
// speechSynthesis, nothing downloaded). Every line is our own.
import { pick, $ } from '../core/util.js';
import { G, run, st, settings } from '../core/state.js';
import { CLASSES } from '../data/classes.js';
import { sfx } from '../audio/audio.js';
import { TUNE } from '../tuning.js';

const LOW = ['{rat} needs food. Now.', '{rat} is running on empty!', 'Find some cheese, {rat}!', '{rat} is fading. Eat something!', 'Your belly is talking, {rat}.'];
const CRIT = ['{rat} is about to drop!', '{rat} is one bite from the gutter!', 'Eat or die, {rat}!'];

let barkT;
/** Show (and optionally speak) one line. */
export function bark(text) {
  const el = $('bark');
  if (el) {
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(barkT);
    barkT = setTimeout(() => el.classList.remove('on'), TUNE.announcer.showSecs * 1000);
  }
  sfx('bell');
  if (settings.voice && typeof speechSynthesis !== 'undefined') {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 0.7; u.volume = Math.min(1, settings.sfx + 0.2);
      speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }
  run.barks = (run.barks || 0) + 1;
}
const line = list => pick(list).replace('{rat}', CLASSES[run.cls] ? CLASSES[run.cls].name : 'Rat');

/** Called every step: bark once when health dips under each threshold; re-arm when it recovers. */
export function lowHealth() {
  if (G.state !== 'play' || !st.maxHp) return;
  const A = TUNE.announcer, f = run.hp / st.maxHp;
  if (f > A.rearm) { run.lowWarned = false; run.critWarned = false; }
  if (f < A.crit && !run.critWarned) { run.critWarned = run.lowWarned = true; bark(line(CRIT)); }
  else if (f < A.low && !run.lowWarned) { run.lowWarned = true; bark(line(LOW)); }
}
