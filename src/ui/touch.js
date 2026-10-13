// On-screen controls for phones and tablets: a movement stick on the left,
// action buttons on the right, pause/map at the top. Attack aims at the nearest
// enemy in a cone in front of you. Turbo: tap for the class blast; hold it,
// let go, then tap Special or Sig within a moment for the turbo version.
// Shown once a touch is detected, while TOUCH_CONTROLS is on (it is off for now).
import { $ } from '../core/util.js';
import { G, P } from '../core/state.js';
import { audioInit } from '../audio/audio.js';
import { keys, stick, startRoll, toggleLock, useSpecial, pressE } from '../entities/player.js';
import { pause, openMap } from './screens.js';
import { setTouchAttack } from '../game/input.js';
import { toggleScent } from '../game/scent.js';
import { useSig } from '../game/signature.js';
import { turboDown, turboUp } from '../game/turbo.js';
import { throwVial } from '../game/vials.js';
import { useFlask, cycleFlask } from '../game/shop.js';
import { renderSlots } from './hud.js';

const STICK_R = 52;
/** Touch play is off for now (Taylor's call, 2026-10-13). True brings the on-screen controls back. */
export const TOUCH_CONTROLS = false;

export function initTouch() {
  if (!TOUCH_CONTROLS) { touchOnlyNotice(); return; }
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="tStick" aria-label="Move"><i></i></div>
    <div id="tBtns">
      <button class="tb atk" data-b="atk" aria-label="Attack, hold to repeat">Attack</button>
      <button class="tb sm" data-b="lock" aria-label="Lock on">Lock</button>
      <button class="tb sm" data-b="scent" aria-label="Scent trails">Sniff</button>
      <button class="tb sm vial" data-b="vial" aria-label="Throw a Rot Vial">Vial</button>
      <button class="tb sm flask" data-b="flask" aria-label="Uncork the selected flask">Flask</button>
      <button class="tb sm flask" data-b="swap" aria-label="Switch flask">Swap</button>
      <button class="tb" data-b="spec" aria-label="Special">Special</button>
      <button class="tb sig" data-b="sig" aria-label="Signature move">Sig</button>
      <button class="tb turbo" data-b="turbo" aria-label="Turbo: tap for your turbo blast; hold, then Special or Sig for a turbo move">Turbo</button>
      <button class="tb" data-b="use" aria-label="Use, grab, hold to gnaw">Use</button>
      <button class="tb" data-b="roll" aria-label="Dodge">Dodge</button>
      <button class="tb jump" data-b="jump" aria-label="Jump, hold at a marked pipe to climb">Jump</button>
    </div>
    <div id="tTop">
      <button class="tb sm" data-b="map" aria-label="Map">Map</button>
      <button class="tb sm" data-b="pause" aria-label="Pause">II</button>
    </div>`;
  document.body.appendChild(root);

  const enable = () => { G.touch = true; document.body.classList.add('touch'); };
  if (matchMedia('(pointer: coarse)').matches) enable();
  addEventListener('touchstart', enable, { passive: true });

  // Movement stick.
  const base = $('tStick'), knob = base.firstElementChild;
  let id = null, cx = 0, cy = 0;
  const move = e => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    stick.x = dx / STICK_R;
    stick.y = -dy / STICK_R;
  };
  base.addEventListener('pointerdown', e => {
    e.preventDefault();
    audioInit();
    id = e.pointerId;
    base.setPointerCapture(id);
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    stick.active = true;
    move(e);
  });
  base.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    stick.active = false;
    stick.x = stick.y = 0;
    knob.style.transform = '';
  };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);

  // Buttons: press and release map onto the same inputs the keyboard uses.
  for (const b of root.querySelectorAll('[data-b]')) {
    const k = b.dataset.b;
    let held = false;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      audioInit();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      held = true;
      press(k);
    });
    const up = () => { if (!held) return; held = false; b.classList.remove('on'); release(k); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
}

/** On a device with no mouse or trackpad, say why nothing responds to touch. */
function touchOnlyNotice() {
  if (!matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: fine)').matches) return;
  const n = document.createElement('div');
  n.id = 'noTouch';
  n.className = 'px';
  n.textContent = 'Touch controls are off for now. Play with a keyboard and mouse or a gamepad.';
  document.body.appendChild(n);
}

function press(k) {
  if (G.state !== 'play') return;
  switch (k) {
    case 'jump': keys.Space = true; P.buffer = 0.13; break;
    case 'roll': keys.ShiftLeft = true; startRoll(); break;
    case 'spec': useSpecial(); break;
    case 'use': keys.KeyE = true; pressE(); break;
    case 'lock': toggleLock(); break;
    case 'scent': toggleScent(); break;
    case 'map': openMap(); break;
    case 'pause': pause(true); break;
    case 'atk': setTouchAttack(true); break;
    case 'sig': useSig(); break;
    case 'turbo': turboDown(); break;
    case 'vial': throwVial(); break;
    case 'flask': useFlask(); renderSlots(); break;
    case 'swap': cycleFlask(); renderSlots(); break;
  }
}
function release(k) {
  if (k === 'atk') setTouchAttack(false);
  if (k === 'turbo') turboUp();
  if (k === 'jump') keys.Space = false;
  if (k === 'roll') keys.ShiftLeft = false;
  if (k === 'use') { keys.KeyE = false; P.chewing = false; P.chewT = 0; }
}
