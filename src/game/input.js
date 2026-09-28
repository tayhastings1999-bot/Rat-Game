// Keyboard and mouse.
import { clamp } from '../core/util.js';
import { G, P, run, settings, saveSettings } from '../core/state.js';
import { canvas } from '../render/renderer.js';
import { audioInit } from '../audio/audio.js';
import { dnum } from '../fx/fx.js';
import { CLASSES, isUnl } from '../data/classes.js';
import { keys, camBasis, startRoll, toggleLock, useSpecial, pressE } from '../entities/player.js';
import { startRun, menu } from './flow.js';
import { shriek } from './swarm.js';
import { toggleScent } from './scent.js';
import { pause, resume, openMap, renderMenu, renderNest, choose, currentOffers, reroll } from '../ui/screens.js';

export function initInput() {
  addEventListener('keydown', e => {
    audioInit();
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') && e.code !== 'Escape') return;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    const s = G.state;
    if (s === 'play') {
      if (e.code === 'Space') P.buffer = 0.13;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') startRoll();
      if (e.code === 'KeyR') toggleLock();
      if (e.code === 'KeyQ') useSpecial();
      if (e.code === 'KeyX') shriek();
      if (e.code === 'KeyE') pressE();
      if (e.code === 'KeyF') toggleScent();
      if (e.code === 'KeyV') { settings.mouse = !settings.mouse; saveSettings(); dnum(P.x, P.y + 1.6, P.z, settings.mouse ? 'Mouse look on' : 'Mouse look off', 'info'); }
      if (e.code === 'KeyM' || e.code === 'Tab') openMap();
      if (e.code === 'Escape' || e.code === 'KeyP') pause(true);
    } else if (s === 'paused' || s === 'map' || s === 'bench') {
      if (['Escape', 'KeyP', 'KeyM', 'Tab', 'Enter'].includes(e.code)) resume();
    } else if (s === 'menu') {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
      const k = Object.keys(CLASSES)[i];
      if (i >= 0 && k && isUnl(k)) startRun(k);
      if (e.code === 'KeyN') renderNest();
    } else if (s === 'nest') {
      if (e.code === 'Escape') renderMenu('survival');
    } else if (s === 'dead' || s === 'done') {
      if (e.code === 'KeyR' || e.code === 'Enter') menu();
    } else if (s === 'levelup') {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code), offers = currentOffers();
      if (i >= 0 && offers[i]) choose(offers[i]);
      if (e.code === 'KeyR' && run.rerolls > 0) reroll();
    }
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'KeyE') { P.chewing = false; P.chewT = 0; }
  });
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (G.state === 'play') pause(true);
  });
  // Drag to orbit (right-drag / shift-drag pans). Deltas are tracked per pointer so fingers work too.
  let dragId = null, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    if (dragId !== null) return;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    G.drag = e.button === 2 || e.shiftKey ? 2 : 1;
    canvas.setPointerCapture(e.pointerId);
  });
  const endDrag = e => { if (e.pointerId === dragId) { dragId = null; G.drag = 0; } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (!G.drag || e.pointerId !== dragId) return;
    const mx = e.clientX - lastX, my = e.clientY - lastY, touch = e.pointerType === 'touch' ? 1.4 : 1;
    lastX = e.clientX;
    lastY = e.clientY;
    if (G.drag === 1) {
      G.camYaw -= mx * 0.006 * touch;
      G.camPitch = clamp(G.camPitch + my * 0.005 * touch, 0.18, 1.42);
    } else {
      const { fx, fz, rx, rz } = camBasis(), k = G.camDist * 0.0016;
      G.camOff.x += (-rx * mx + fx * my) * k;
      G.camOff.z += (-rz * mx + fz * my) * k;
      const l = Math.hypot(G.camOff.x, G.camOff.z);
      if (l > 12) { G.camOff.x *= 12 / l; G.camOff.z *= 12 / l; }
    }
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); G.camDist = clamp(G.camDist + e.deltaY * 0.012, 6, 28); }, { passive: false });
  addEventListener('pointerdown', audioInit);
  addEventListener('mousemove', e => {
    if (G.touch) return; // taps also fire mouse events; touch uses drag-to-orbit only
    G.mX = e.clientX;
    if (G.state !== 'play' || G.drag || !settings.mouse || G.lockOn) return;
    G.camYaw -= e.movementX * 0.0042 * settings.sens;
    G.camPitch = clamp(G.camPitch + e.movementY * 0.0025 * settings.sens, 0.3, 1.3);
  });
  document.addEventListener('mouseleave', () => { G.mX = innerWidth / 2; });
}
