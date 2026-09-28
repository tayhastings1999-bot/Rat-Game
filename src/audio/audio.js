// All sound is synthesized with WebAudio: one-shot SFX plus a procedural
// soundtrack — a distorted boom-bap drum loop with stuttering trap hi-hat
// rolls and a discordant synth bass. Intensity rises with combat and bosses.
import { rand, chance, pick } from '../core/util.js';
import { settings } from '../core/state.js';

let AC = null, master = null, sfxBus = null, musicBus = null, verb = null, noiseBuf = null, drumBus = null, bassBus = null, ambGain = null;
const sfxLast = {};

export const audioReady = () => !!AC && AC.state === 'running';

function shaper(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  const ws = AC.createWaveShaper();
  ws.curve = c;
  ws.oversample = '2x';
  return ws;
}

function makeVerb() {
  const len = AC.sampleRate * 1.6, buf = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const cv = AC.createConvolver();
  cv.buffer = buf;
  const out = AC.createGain();
  out.gain.value = 0.5;
  cv.connect(out);
  out.connect(master);
  return cv;
}

export function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try { AC = new Ctx(); } catch (_) { return; }
  master = AC.createGain();
  master.gain.value = 0.9;
  const lim = AC.createDynamicsCompressor();
  lim.threshold.value = -6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.2;
  master.connect(lim);
  lim.connect(AC.destination);
  sfxBus = AC.createGain(); sfxBus.connect(master);
  musicBus = AC.createGain(); musicBus.connect(master);
  applyVolumes();
  verb = makeVerb();

  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Music buses: drums and bass each get their own grit.
  const glue = AC.createDynamicsCompressor();
  glue.threshold.value = -18; glue.ratio.value = 4; glue.attack.value = 0.005; glue.release.value = 0.12;
  glue.connect(musicBus);
  drumBus = AC.createGain(); drumBus.gain.value = 0.9;
  const dDist = shaper(2.6); drumBus.connect(dDist); dDist.connect(glue);
  bassBus = AC.createGain(); bassBus.gain.value = 0.55;
  const bDist = shaper(3.4), bLp = AC.createBiquadFilter();
  bLp.type = 'lowpass'; bLp.frequency.value = 2400;
  bassBus.connect(bDist); bDist.connect(bLp); bLp.connect(glue);

  // Ambient bed: vinyl crackle + low room tone, and sewer drips.
  ambGain = AC.createGain(); ambGain.gain.value = 0.5; ambGain.connect(musicBus);
  const crackle = AC.createBuffer(1, AC.sampleRate * 3, AC.sampleRate), cd = crackle.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = Math.random() < 0.0009 ? rand(-0.8, 0.8) : (Math.random() * 2 - 1) * 0.012;
  const cs = AC.createBufferSource(); cs.buffer = crackle; cs.loop = true;
  const chp = AC.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 900;
  cs.connect(chp); chp.connect(ambGain); cs.start();
  const room = AC.createBufferSource(); room.buffer = noiseBuf; room.loop = true;
  const rlp = AC.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 130;
  const rg = AC.createGain(); rg.gain.value = 0.12;
  room.connect(rlp); rlp.connect(rg); rg.connect(ambGain); room.start();
  const drip = () => {
    if (AC.state === 'running' && music.sewer) {
      const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), f = rand(650, 1500);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.1, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(sfxBus); g.connect(verb); o.start(t); o.stop(t + 0.32);
    }
    setTimeout(drip, rand(600, 3000));
  };
  drip();
  music.nextT = AC.currentTime + 0.1;
  setInterval(scheduleMusic, 25);
}

export function applyVolumes() {
  if (!AC) return;
  sfxBus.gain.setTargetAtTime(settings.sfx, AC.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(settings.music * 0.8, AC.currentTime, 0.05);
}

// ---------- SFX ----------
function tone(f0, f1, dur, type, vol, wet, t = AC.currentTime) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus);
  if (wet) g.connect(verb);
  o.start(t); o.stop(t + dur + 0.05);
}
function nz(freq, q, dur, vol, type = 'bandpass', wet, t = AC.currentTime, out = sfxBus) {
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  if (wet) g.connect(verb);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

const GAP = { hit: 40, pickup: 45, shoot: 70, slash: 80, kill: 45, chew: 110, boom: 90, zap: 90, splat: 120 };
export function sfx(n) {
  if (!audioReady()) return;
  const now = performance.now();
  if (now - (sfxLast[n] || 0) < (GAP[n] || 0)) return;
  sfxLast[n] = now;
  switch (n) {
    case 'hit': nz(rand(800, 1300), 1.4, 0.07, 0.22); break;
    case 'kill': nz(rand(260, 420), 0.9, 0.18, 0.32); tone(170, 55, 0.16, 'square', 0.05); break;
    case 'slash': nz(2800, 0.6, 0.13, 0.14, 'highpass'); break;
    case 'shoot': tone(560, 260, 0.08, 'square', 0.035); break;
    case 'hurt': tone(210, 80, 0.25, 'sawtooth', 0.12); nz(420, 1, 0.16, 0.22); break;
    case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(f, f * 0.99, 0.4, 'triangle', 0.07, true, AC.currentTime + i * 0.08)); break;
    case 'boss': tone(72, 34, 1.6, 'sawtooth', 0.22, true); nz(160, 0.7, 1.3, 0.3, 'lowpass', true); break;
    case 'phase': tone(90, 30, 1.2, 'sawtooth', 0.25, true); tone(180, 60, 0.9, 'square', 0.08, true); nz(300, 0.6, 0.9, 0.35, 'lowpass', true); break;
    case 'roll': nz(600, 0.7, 0.2, 0.14, 'lowpass'); break;
    case 'chew': nz(rand(1600, 2600), 3, 0.045, 0.12); break;
    case 'pickup': tone(1300 + rand(0, 400), 2000, 0.05, 'sine', 0.035); break;
    case 'screech': tone(2400, 900, 0.35, 'sawtooth', 0.06, true); nz(3500, 4, 0.3, 0.1); break;
    case 'caw': tone(900, 500, 0.18, 'square', 0.06); tone(700, 420, 0.2, 'square', 0.05); break;
    case 'boom': nz(110, 0.6, 0.55, 0.4, 'lowpass', true); tone(85, 32, 0.45, 'sine', 0.22); break;
    case 'zap': nz(4200, 2, 0.12, 0.18, 'bandpass'); tone(1800, 300, 0.12, 'sawtooth', 0.05); break;
    case 'splat': nz(300, 0.8, 0.25, 0.3, 'lowpass'); tone(120, 40, 0.2, 'sine', 0.15); break;
    case 'key': [784, 1175, 1568].forEach((f, i) => tone(f, f, 0.25, 'triangle', 0.08, true, AC.currentTime + i * 0.06)); break;
    case 'mutation': tone(110, 440, 0.6, 'sawtooth', 0.1, true); tone(165, 660, 0.6, 'sawtooth', 0.08, true); nz(2000, 2, 0.5, 0.15, 'bandpass', true); break;
    case 'curse': tone(220, 55, 1.1, 'sawtooth', 0.14, true); tone(233, 58, 1.1, 'sawtooth', 0.12, true); break;
    case 'door': tone(60, 40, 0.8, 'square', 0.15, true); nz(200, 1, 0.7, 0.25, 'lowpass', true); break;
    case 'shriek': for (let i = 0; i < 5; i++) { tone(2200 + i * 300, 900 + i * 120, 0.35, 'sawtooth', 0.05, true, AC.currentTime + i * 0.05); } nz(3000, 3, 0.6, 0.2, 'bandpass', true); break;
    case 'sniff': nz(1600, 2, 0.09, 0.1); nz(2200, 2, 0.09, 0.08, 'bandpass', false, AC.currentTime + 0.12); break;
    case 'buy': tone(660, 990, 0.12, 'square', 0.06); tone(990, 1320, 0.14, 'square', 0.05, false, AC.currentTime + 0.08); break;
  }
}

// ---------- Music ----------
/**
 * intensity: 0 menu/nest, 1 exploring, 2 fighting a crowd, 3 boss.
 * The sequencer runs in 16th notes with boom-bap swing; tempo climbs with intensity.
 */
export const music = { intensity: 0, want: 0, step: 0, bar: 0, nextT: 0, bpm: 90, riff: 0, sewer: false };
const BPM = [90, 132, 148, 166];
const KICKS = [
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0],
];
// Bass riffs as semitone offsets from E1 (null = rest). Phrygian with tritone stabs.
const RIFFS = [
  [0, null, null, 0, null, null, 1, null, 0, null, null, null, 6, null, 5, null],
  [0, null, 0, null, null, 3, null, null, 1, null, null, null, 0, null, -2, null],
  [0, null, null, null, 6, null, null, null, 7, null, 6, null, 1, null, 0, null],
  [0, 0, null, 12, null, 1, null, 0, null, 6, null, 5, null, 1, 0, null],
];
const E1 = 41.2;
const fq = semi => E1 * Math.pow(2, semi / 12);

export function setMusic(intensity, sewer) {
  music.want = intensity;
  music.sewer = !!sewer;
}

function kick(t, v) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(165, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  o.connect(g); g.connect(drumBus);
  o.start(t); o.stop(t + 0.4);
  nz(3200, 1, 0.012, v * 0.25, 'highpass', false, t, drumBus);
}
function snare(t, v) {
  nz(1900, 0.7, 0.17, v * 0.7, 'bandpass', music.sewer, t, drumBus);
  nz(5200, 0.5, 0.09, v * 0.3, 'highpass', false, t, drumBus);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  g.gain.setValueAtTime(v * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  o.connect(g); g.connect(drumBus);
  o.start(t); o.stop(t + 0.15);
}
function hat(t, v, open = false, pitch = 1) {
  nz(7200 * pitch, 0.8, open ? 0.14 : 0.028, v * 0.22, 'highpass', false, t, drumBus);
}
function bass(t, f, dur, v) {
  const g = AC.createGain(), lp = AC.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 7;
  lp.frequency.setValueAtTime(160, t);
  lp.frequency.exponentialRampToValueAtTime(300 + 900 * v, t + 0.03);
  lp.frequency.exponentialRampToValueAtTime(170, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.006);
  g.gain.setValueAtTime(v * 0.5, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g); g.connect(bassBus);
  for (const [type, mul, det] of [['sawtooth', 1, -11], ['sawtooth', 1, 11], ['square', 0.5, 0]]) {
    const o = AC.createOscillator();
    o.type = type; o.frequency.value = f * mul; o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.02);
  }
}
function stab(t, freqs, dur, v) {
  const g = AC.createGain(), lp = AC.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1500;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(g); g.connect(musicBus); g.connect(verb);
  for (const f of freqs) for (const d of [-14, 14]) {
    const o = AC.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.02);
  }
}
function siren(t, dur) {
  const o = AC.createOscillator(), g = AC.createGain(), bp = AC.createBiquadFilter(), lfo = AC.createOscillator(), lg = AC.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(fq(36), t);
  o.frequency.exponentialRampToValueAtTime(fq(42), t + dur * 0.5);
  o.frequency.exponentialRampToValueAtTime(fq(37), t + dur);
  lfo.frequency.value = 6.5; lg.gain.value = 9;
  lfo.connect(lg); lg.connect(o.frequency);
  bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(bp); bp.connect(g); g.connect(musicBus); g.connect(verb);
  o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
}
function pad(t, dur) {
  stab(t, [fq(24), fq(25), fq(31)], dur, 0.035);
}

function playStep(s, t, stepLen) {
  const I = music.intensity, bar = music.bar;
  const kp = KICKS[(bar >> 1) % KICKS.length];
  if (I === 0) {
    if (s === 0) { kick(t, 0.6); if (bar % 2 === 0) pad(t, stepLen * 30); }
    if (s === 10 && bar % 2) kick(t, 0.45);
    if (s === 8) snare(t, 0.25);
    if (s % 4 === 2) hat(t, 0.35);
    if (s === 0 && bar % 4 === 0) bass(t, fq(0), stepLen * 6, 0.5);
    return;
  }
  if (kp[s]) kick(t, s === 0 ? 1 : 0.85);
  if (s === 4 || s === 12) snare(t, 1);
  if (I >= 2 && (s === 7 || s === 15) && chance(0.35)) snare(t, 0.3);
  // Hats: 8ths with accents, stuttering trap rolls that get denser with intensity.
  const rollP = [0, 0.12, 0.28, 0.45][I];
  if (s % 2 === 0 || I >= 2) {
    if (chance(rollP) && s % 4 !== 0) {
      const n = pick([2, 3, 4, 6]), dt = stepLen / n, rise = chance(0.5);
      for (let k = 0; k < n; k++) hat(t + k * dt, 0.5 + 0.5 * (k / n), false, rise ? 0.8 + 0.4 * (k / n) : 1);
    } else hat(t, s % 4 === 0 ? 0.9 : 0.55, s === 14 && chance(0.3));
  }
  // Discordant bass riff, two bars per riff.
  const R = RIFFS[music.riff], note = R[s];
  if (note != null) {
    let len = 1;
    while (s + len < 16 && R[s + len] == null && len < 4) len++;
    bass(t, fq(note), stepLen * len * 0.95, I >= 3 ? 1 : 0.8);
    if (I >= 3 && chance(0.25)) bass(t, fq(note + 1), stepLen * len * 0.6, 0.4); // minor-second grind
  }
  if (I >= 2 && s === 0 && bar % 2 === 0) stab(t, [fq(28), fq(29), fq(34)], stepLen * 3, 0.06);
  if (I >= 2 && s === 8 && bar % 4 === 3) stab(t, [fq(34), fq(35)], stepLen * 2, 0.05);
  if (I >= 3 && s === 0 && bar % 2 === 1) siren(t, stepLen * 14);
}

function scheduleMusic() {
  if (!AC || AC.state !== 'running') return;
  if (music.nextT < AC.currentTime - 0.5) music.nextT = AC.currentTime + 0.05;
  while (music.nextT < AC.currentTime + 0.14) {
    const stepLen = 60 / music.bpm / 4;
    const swing = music.step % 2 ? stepLen * (music.intensity === 0 ? 0.18 : 0.1) : 0;
    playStep(music.step, music.nextT + swing, stepLen);
    music.nextT += stepLen;
    music.step++;
    if (music.step >= 16) {
      music.step = 0;
      music.bar++;
      if (music.bar % 2 === 0) music.riff = chance(0.6) ? music.riff : Math.floor(Math.random() * RIFFS.length);
      if (music.intensity !== music.want) { music.intensity = music.want; music.bpm = BPM[music.intensity]; }
    }
  }
}
