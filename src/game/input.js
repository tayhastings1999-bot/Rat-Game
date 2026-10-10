// Keyboard and mouse. The mouse aims on the ground; left click or J attacks
// (hold to repeat). The camera is a fixed-angle follow; the wheel zooms.
import { advance as storyAdvance, skip as storySkip, choose as storyChoose } from './story.js';
import { clamp } from '../core/util.js';
import { G, P } from '../core/state.js';
import { canvas } from '../render/renderer.js';
import { audioInit } from '../audio/audio.js';
import { CLASSES } from '../data/classes.js';
import { keys, startRoll, toggleLock, useSpecial, pressE } from '../entities/player.js';
import { startRun, menu } from './flow.js';
import { toggleScent } from './scent.js';
import { pause, resume, openMap } from '../ui/screens.js';
import { useSig } from './signature.js';
import { TUNE } from '../tuning.js';
import { turboDown, turboUp } from './turbo.js';
import { throwVial } from './vials.js';

/** Attack is held while the mouse button, J or the touch button is down. */
const held = { mouse: false, key: false };
export const setTouchAttack = on => { G.touchAttack = on; syncAttack(); };
function syncAttack() { G.attack = held.mouse || held.key || !!G.touchAttack; }

export function initInput() {
  addEventListener('keydown', e => {
    audioInit();
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') && e.code !== 'Escape') return;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyJ') { held.key = true; syncAttack(); }
    if (e.code === 'KeyX' && G.state === 'play') turboDown();
    if (e.repeat) return;
    const s = G.state;
    if (s === 'play') {
      if (e.code === 'Space') P.buffer = 0.13;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') startRoll();
      if (e.code === 'KeyR') toggleLock();
      if (e.code === 'KeyQ') useSpecial();
      if (e.code === 'KeyG') useSig();
      if (e.code === 'KeyZ') throwVial();
      if (e.code === 'KeyE') pressE();
      if (e.code === 'KeyF') toggleScent();
      if (e.code === 'KeyM' || e.code === 'Tab') openMap();
      if (e.code === 'Escape' || e.code === 'KeyP') pause(true);
    } else if (s === 'paused' || s === 'map') {
      if (['Escape', 'KeyP', 'KeyM', 'Tab', 'Enter'].includes(e.code)) resume();
    } else if (s === 'menu') {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(e.code);
      const k = Object.keys(CLASSES)[i];
      if (i >= 0 && k) startRun(k);
    } else if (s === 'dead') {
      if (e.code === 'KeyR' || e.code === 'Enter') menu();
    } else if (s === 'story') {
      if (['Space', 'Enter', 'KeyE'].includes(e.code)) storyAdvance();
      if (e.code === 'Escape') storySkip();
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) storyChoose(i);
    }
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'KeyJ') { held.key = false; syncAttack(); }
    if (e.code === 'KeyX') turboUp();
    if (e.code === 'KeyE') { P.chewing = false; P.chewT = 0; }
  });
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    held.mouse = held.key = false;
    G.turboHeld = G.turboKey = false;
    syncAttack();
    if (G.state === 'play') pause(true);
  });
  // Left button attacks; the canvas never orbits the camera.
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return; // touch attacks with its own button
    if (e.button === 0) { held.mouse = true; syncAttack(); canvas.setPointerCapture(e.pointerId); }
  });
  const up = e => { if (e.pointerType !== 'touch' && e.button === 0) { held.mouse = false; syncAttack(); } };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { held.mouse = false; syncAttack(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { e.preventDefault(); G.camDist = clamp(G.camDist + e.deltaY * 0.012, TUNE.camera.minDist, TUNE.camera.maxDist); }, { passive: false });
  addEventListener('pointerdown', audioInit);
  addEventListener('mousemove', e => {
    if (G.touch) return;
    G.mX = e.clientX;
    G.mY = e.clientY;
  });
}
