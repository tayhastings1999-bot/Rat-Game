// The announcer: short barks at the moments that matter, called by player colour
// and class in co-op ("Red Rat needs food badly!", "Yellow Slinger shot the food!").
// Three layers, in order:
//  1. Audio hooks. Every line carries a story/VO id from the sound manifest
//     (/workspace/scurry-sound/manifest.json, e.g. vo_announcer_lowhp_v01). When
//     recorded VO ships (TUNE.announcer.vo.on, pending Taylor's voice decision)
//     playVo() plays `${vo.path}${id}.ogg`. The Steam/desktop build never uses
//     browser speech; the web build may, behind the Voice setting.
//  2. The visual callout: the big line low on screen, tinted with the player's colour.
//  3. Story ids: callout kinds map to manifest id pools, so writers can swap text
//     without touching triggers. Lines with {rat} name who it's about.
import { pick, $ } from '../core/util.js';
import { G, run, st, settings } from '../core/state.js';
import { CLASSES } from '../data/classes.js';
import { sfx } from '../audio/audio.js';
import { TUNE } from '../tuning.js';
import { coop } from './coop.js';
import { css } from '../render/palette.js';

// ---------- 1. audio hooks ----------
/** Desktop (Electron/Steam) builds: no browser text-to-speech, ever. */
export const isDesktop = () => typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '');
const voCache = new Map();
/** Play a recorded line by manifest id, if VO is enabled and shipped. Returns true if it played. */
export function playVo(id) {
  const V = TUNE.announcer.vo;
  if (!id || !V || !V.on || typeof Audio === 'undefined') return false;
  try {
    let a = voCache.get(id);
    if (!a) { a = new Audio(V.path + id + '.ogg'); voCache.set(id, a); }
    a.currentTime = 0; a.volume = Math.min(1, settings.sfx + 0.2); a.play().catch(() => {});
    run.lastVo = id;
    return true;
  } catch { return false; }
}
function speak(text) {
  if (!settings.voice || isDesktop() || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 0.7; u.volume = Math.min(1, settings.sfx + 0.2);
    speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}

// ---------- 2. the visual callout ----------
let barkT;
/**
 * Show one line for `secs` seconds (default TUNE.announcer.showSecs). opt.vo is a manifest id (plays recorded
 * VO when shipped, else web-only speech); opt.color tints the line (a player's colour).
 */
export function bark(text, secs = TUNE.announcer.showSecs, opt = {}) {
  if (typeof secs === 'object') { opt = secs; secs = TUNE.announcer.showSecs; }
  const el = $('bark');
  if (el) {
    el.textContent = text;
    el.style.color = opt.color || '';
    el.classList.add('on');
    clearTimeout(barkT);
    barkT = setTimeout(() => el.classList.remove('on'), secs * 1000);
  }
  if (secs === TUNE.announcer.showSecs) sfx('bell'); // boss intro barks bring their own sting
  if (!playVo(opt.vo)) speak(text);
  run.barks = (run.barks || 0) + 1;
  run.lastBark = { text, vo: opt.vo || null, color: opt.color || null };
}
const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green'];
const clsOf = i => (coop.on && coop.players[i] && i !== coop.active ? coop.players[i].cls : run.cls) || run.cls;
/** Who a callout is about: "Red Rat" / "Blue Slinger" in co-op, the class name ("Sewer Rat") solo. */
export function callName(i = coop.on ? coop.active : 0) {
  const C = CLASSES[clsOf(i)] || { name: 'Rat' };
  return coop.on ? `${COLOR_NAMES[i] || 'P' + (i + 1)} ${C.call || C.name.split(' ').pop()}` : C.name;
}
export const ratName = () => callName();
const tint = i => (coop.on ? css(TUNE.coop.colors[i]) : '');

// ---------- 3. story ids → lines ----------
// [manifest id, text]. Ids without a recording are text-only (the manifest's fallback pools).
const LINES = {
  low: [['vo_announcer_lowhp_v02', '{rat} is running on empty!'], ['vo_announcer_lowhp_v03', 'Find some cheese, {rat}!'], ['vo_announcer_lowhp_v04', '{rat} is fading. Eat something!'], ['vo_announcer_lowhp_v01', "{rat}'s stomach is screaming!"], ['ann_coop_lowhp_01', '{rat} needs food badly!']],
  crit: [['vo_announcer_crithp_v01', '{rat} is about to drop!'], ['vo_announcer_crithp_v02', '{rat} is one bite from the gutter!'], ['vo_announcer_crithp_v03', 'Eat or die, {rat}!'], ['ann_coop_crithp_01', '{rat} is about to die!']],
  foodshot: [['ann_coop_foodshot_01', '{rat} shot the food!'], ['vo_announcer_story_foodshot_v01', 'That was dinner.'], ['vo_announcer_story_foodshot_v02', 'Cheese: 0. You: still hungry.']],
  down: [['vo_announcer_story_frienddowned_v01', '{rat} is down! Go back for them!'], ['vo_announcer_story_frienddowned_v03', '{rat} hit the gutter. You know what to do.']],
  revived: [['vo_announcer_story_friendrevived_v01', '{rat} is back on their paws!']],
  token: [['ann_coop_token_01', '{rat} spends a cheese token!']],
  out: [['ann_coop_out_01', '{rat} is out until the next level.']],
};
export const CALLOUTS = LINES;
/** Say a callout of `kind` about player i (default: the active rat). `extra` is appended. */
export function callout(kind, i = coop.on ? coop.active : 0, extra = '') {
  const pool = coop.on ? LINES[kind] : LINES[kind].filter(l => !/^ann_coop_/.test(l[0])) ;
  const [vo, t] = pick(pool.length ? pool : LINES[kind]);
  bark(t.replace('{rat}', callName(i)) + extra, { vo, color: tint(i) });
}

/** Called every step: bark once when health dips under each threshold; re-arm when it recovers. */
export function lowHealth() {
  if (G.state !== 'play' || !st.maxHp) return;
  const A = TUNE.announcer, f = run.hp / st.maxHp;
  if (f > A.rearm) { run.lowWarned = false; run.critWarned = false; }
  if (f < A.crit && !run.critWarned) { run.critWarned = run.lowWarned = true; callout('crit'); }
  else if (f < A.low && !run.lowWarned) { run.lowWarned = true; callout('low'); }
}
let foodT = 0;
/** A player's shot smashed food (rate-limited so a volley is one call). */
export function foodShot(i) {
  const now = performance.now();
  if (now - foodT < 4000) return;
  foodT = now;
  callout('foodshot', i == null ? (coop.on ? coop.active : 0) : i);
}
