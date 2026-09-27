// Entry point: fonts, styles, boot, and the frame loop.
import '@fontsource/pirata-one/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './style.css';

import { $ } from './core/util.js';
import { G, P, W, run, st, meta } from './core/state.js';
import { renderFrame } from './render/renderer.js';
import { setMusic } from './audio/audio.js';
import { refreshPortraits } from './entities/rat.js';
import { update } from './game/update.js';
import { sync, animate } from './game/sync.js';
import { menu } from './game/flow.js';
import { initInput } from './game/input.js';
import { hud, drawMap, initHudIcons } from './ui/hud.js';
import { initTouch } from './ui/touch.js';

initHudIcons();
refreshPortraits();
initInput();
initTouch();
menu();

let hudT = 0, mapT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - G.last) / 1000);
  document.body.classList.toggle('playing', G.state === 'play');
  G.last = now;
  G.time += dt;
  let sdt = dt;
  if (G.hitStop > 0) { G.hitStop -= dt; sdt = dt * 0.06; }
  if (G.state === 'play') {
    update(sdt);
    hudT -= dt;
    if (hudT <= 0 && G.state === 'play') { hudT = 0.08; hud(); }
    mapT -= dt;
    if (mapT <= 0) { mapT = 0.2; drawMap($('minimap'), 4.6, 20); }
  } else {
    if (G.state === 'menu' || G.state === 'nest') { G.camYaw += dt * 0.12; P.facing += dt * 0.4; }
    if (G.state === 'menu' || G.state === 'nest') setMusic(0, false);
  }
  sync(G.state === 'play' || G.state === 'menu' || G.state === 'nest' ? sdt : 0);
  animate(sdt);
  renderFrame();
}
requestAnimationFrame(loop);

// Debug handle for automated smoke tests (dev server, or any build with ?debug).
if (import.meta.env.DEV || location.search.includes('debug')) {
  import('./debug.js').then(m => { window.__scurry = m.debugApi({ G, P, W, run, st, meta }); });
}
