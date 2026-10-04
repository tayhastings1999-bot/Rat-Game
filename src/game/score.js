// Scoring: a rank for every district you clear (S to D), a run score and a
// shareable end-of-run card.
import { fmt, commas, $ } from '../core/util.js';
import { run, st } from '../core/state.js';
import { sfx } from '../audio/audio.js';
import { dName } from '../data/world.js';
import { CLASSES } from '../data/classes.js';
import { PORT } from '../entities/rat.js';

// ---------- district ranks ----------
const RANK_PTS = { S: 300, A: 200, B: 120, C: 60, D: 20 };
export function districtStart() { run.dHurt = 0; run.dPerf = run.perfects || 0; }
/** Called when a district's boss falls. */
export function rankDistrict() {
  const t = run.time - run.dStart, hurt = (run.dHurt || 0) / Math.max(1, st.maxHp);
  const perf = (run.perfects || 0) - (run.dPerf || 0);
  let s = 100 - Math.max(0, t - 150) / 3 - hurt * 30 + Math.min(20, perf * 4) + (run.obj && run.obj.done ? 10 : 0);
  s = Math.round(Math.max(0, s));
  const r = s >= 95 ? 'S' : s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : 'D';
  (run.ranks || (run.ranks = [])).push({ n: dName(), r, t: Math.round(t) });
  const el = $('rankStamp');
  el.innerHTML = `<b class="r${r}">${r}</b><span class="px">${dName()} · ${fmt(t)} · ${Math.round(hurt * 100)}% HP lost${perf ? ` · ${perf} perfect` : ''}</span>`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 3200);
  if (r === 'S') sfx('level');
  return r;
}

export function runScore() {
  const ranks = (run.ranks || []).reduce((a, r) => a + RANK_PTS[r.r], 0);
  return Math.round((run.kills || 0) + (run.dmg || 0) / 200 + (run.bosses || 0) * 500 + (run.tier || 0) * 300 + ranks + (run.level || 1) * 20);
}

// ---------- the shareable card ----------
export async function shareCard() {
  const W = 640, H = 360, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), C = CLASSES[run.cls];
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1420'); g.addColorStop(1, '#0b090c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = C.rc; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
  try { const im = new Image(); im.src = PORT[run.cls]; await im.decode(); x.drawImage(im, 24, 70, 170, 170); } catch (_) { /* portrait optional */ }
  x.fillStyle = '#f2b233'; x.font = 'bold 44px serif'; x.fillText('SCURRY', 24, 54);
  x.fillStyle = '#b3aab6'; x.font = '15px monospace'; x.fillText('A rat brawler', 210, 50);
  x.fillStyle = C.rc; x.font = 'bold 28px serif'; x.fillText(C.name, 210, 98);
  x.fillStyle = '#f4efe6'; x.font = '18px monospace';
  const lines = [`Score ${commas(runScore())}`, `Survived ${fmt(run.time)} · level ${run.level}`, `${run.kills} kills · ${commas(Math.round(run.dmg))} damage`, `${run.tier + 1} districts · ${run.bosses || 0} bosses`, `Died in ${dName()}`];
  lines.forEach((l, i) => x.fillText(l, 210, 136 + i * 28));
  const ranks = (run.ranks || []).map(r => r.r).join(' ');
  x.fillStyle = '#ffd040'; x.font = 'bold 30px monospace'; x.fillText(ranks || '—', 24, 300);
  x.fillStyle = '#b3aab6'; x.font = '14px monospace';
  x.fillText('District ranks', 24, 326);
  x.fillText('tayhastings1999-bot.github.io/Rat-Game', 210, 330);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'scurry-run.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'My Scurry run' }); return 'shared'; } } catch (_) { /* fall back to download */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scurry-run.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
