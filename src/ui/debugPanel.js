// The ?debug tuning panel: every number and toggle in src/tuning.js, editable
// live. Loaded only with ?debug (or in the dev server), never in a normal page.
import { tuneEntries, setTune } from '../tuning.js';

export function initDebugPanel() {
  if (document.getElementById('tunePanel')) return;
  const css = document.createElement('style');
  css.textContent = `#tuneBtn{position:fixed;right:8px;top:50%;z-index:60;font:11px monospace;background:#221e26;color:#f2b233;border:1px solid #5e5868;padding:4px 8px;cursor:pointer}
#tunePanel{position:fixed;right:8px;top:8px;bottom:8px;width:300px;overflow:auto;z-index:61;background:rgba(19,16,21,.94);color:#f4efe6;border:1px solid #5e5868;font:12px monospace;padding:8px;display:none}
#tunePanel.on{display:block}#tunePanel h4{margin:10px 0 4px;color:#f2b233;font:bold 12px monospace;text-transform:uppercase}
#tunePanel label{display:grid;grid-template-columns:1fr 90px;gap:6px;align-items:center;margin:2px 0}
#tunePanel input[type=number]{width:84px;background:#0b090c;color:#f4efe6;border:1px solid #3a3540;font:12px monospace}`;
  document.head.appendChild(css);
  const btn = document.createElement('button');
  btn.id = 'tuneBtn';
  btn.textContent = 'Tune';
  const panel = document.createElement('div');
  panel.id = 'tunePanel';
  const groups = {};
  for (const [path, v] of tuneEntries()) {
    const g = path.split('.')[0];
    (groups[g] ||= []).push([path, v]);
  }
  panel.innerHTML = `<b>Tuning (live)</b> <button id="tuneX" style="float:right">×</button>` + Object.entries(groups).map(([g, rows]) => `<h4>${g}</h4>` + rows.map(([p, v]) => {
    const name = p.split('.').slice(1).join('.');
    return typeof v === 'boolean'
      ? `<label>${name}<input type="checkbox" data-p="${p}" ${v ? 'checked' : ''}></label>`
      : `<label>${name}<input type="number" step="any" data-p="${p}" value="${v}"></label>`;
  }).join('')).join('');
  document.body.append(btn, panel);
  btn.onclick = () => panel.classList.toggle('on');
  panel.querySelector('#tuneX').onclick = () => panel.classList.remove('on');
  panel.addEventListener('input', e => {
    const el = e.target, p = el.dataset.p;
    if (!p) return;
    setTune(p, el.type === 'checkbox' ? el.checked : el.value);
  });
  // Typing in the panel must not move the rat.
  panel.addEventListener('keydown', e => e.stopPropagation());
}
