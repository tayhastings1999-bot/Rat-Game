// Procedural, deterministic walk juice for hero sprites (visual only).
// No Math.random: the pace-clear bot's seeded stream must stay untouched.
// Collision, hitboxes and move speed live elsewhere and are not read-write here.

/** Class multipliers; missing keys are 1. */
export function heroMul(cls, juice) {
  const d = { bob: 1, squash: 1, stretch: 1, lean: 1, sway: 1, startAnticipation: 1, stopSettle: 1 };
  const h = juice?.heroes?.[cls];
  return h ? { ...d, ...h } : d;
}

/** Sticky walk/idle with hysteresis. `prev` is the last walking flag. */
export function movingState(prev, speed, juice) {
  const enter = juice.idleEnter, exit = juice.idleExit;
  return prev ? speed > exit : speed > enter;
}

/** Authored step length in world units (`TUNE.sprite.juice.heroes[cls].stride`). Not measured from south-facing frames. */
export function strideOf(cls, juice) {
  const s = juice?.heroes?.[cls]?.stride;
  return s > 0 ? s : 0;
}

/** Ground distance one 2-step walk cycle should cover, in world units. */
export function cycleDist(cls, juice) {
  return 2 * strideOf(cls, juice);
}

/**
 * Cycles per second from live ground speed: one cycle covers 2 × stride.
 * Independent of atlas walkProfile / walkMs holds. While there is motion, the
 * cycle is clamped to [cycleMin, cycleMax] seconds (defaults 0.35–0.9).
 */
export function cadenceRate(speed, juice, cls) {
  const d = cycleDist(cls, juice);
  if (!(d > 0)) return 0;
  const v = Math.max(0, speed);
  if (!(v > 0)) return 0;
  const rate = v / d;
  const tMin = juice.cycleMin ?? 0.35, tMax = juice.cycleMax ?? 0.9;
  const T = 1 / rate;
  const Tc = Math.min(tMax, Math.max(tMin, T));
  return 1 / Tc;
}

/** 0–1 phase. `clock` is cycle count when juicing; `cycleSec` is only a fallback. */
export function cyclePhase(clock, cycleSec) {
  if (cycleSec > 0 && cycleSec !== 1) {
    const t = clock % cycleSec;
    return (t < 0 ? t + cycleSec : t) / cycleSec;
  }
  const t = clock % 1;
  return t < 0 ? t + 1 : t;
}

/** Apparent foot speed (u/s) = cycles/s × 2 × stride. Equals ground speed when cadence is exact. */
export function footSpeed(speed, juice, cls) {
  return cadenceRate(speed, juice, cls) * cycleDist(cls, juice);
}

/** Seconds of one walk loop at rate 1, from an atlas action's fps/holds. */
export function cycleSec(action) {
  if (!action) return 0;
  const n = action.frames || 1, fps = action.fps || 10, hold = action.hold || [];
  let total = 0;
  for (let k = 0; k < n; k++) total += (hold[k] || 1) / fps;
  return total;
}

/** Mid-stride hop; 0 at the two footfalls (phase 0 and 0.5). */
export function bobOffset(phase, amp) {
  const s = Math.sin(phase * Math.PI * 2);
  return amp * s * s;
}

/**
 * Footfall squash and take-off stretch, volume-ish (sx / sy trade).
 * contact=1 at phase 0 and 0.5; take-off peaks just after each contact.
 */
export function squashXY(phase, squash, stretch) {
  const contact = 0.5 * (1 + Math.cos(phase * Math.PI * 4));
  const takeoff = Math.max(0, Math.sin(phase * Math.PI * 4));
  const sy = 1 - squash * contact + stretch * takeoff;
  const sx = 1 + squash * contact - stretch * takeoff;
  return { sx, sy };
}

/** Billboard lean (radians). Positive tilts the top to the left; rightward facing gets a negative angle. */
export function leanRad(screenAngle, speed, juice, mul = 1) {
  const ref = juice.refSpeed || 5.6;
  const amt = (juice.lean || 0) * mul * Math.min(1, Math.max(0, speed) / ref);
  return -amt * Math.cos(screenAngle);
}

/** Side-to-side offset in world units; opposite sign each step, 0 at footfall. */
export function swayX(phase, amp) {
  return amp * Math.sin(phase * Math.PI * 2);
}

/**
 * Advance per-hero juice state by `dt` (the same sim dt the game loop uses).
 * Returns pose offsets; never writes to the player body or the RNG.
 */
export function stepJuice(st, { dt, speed, cls, screenAngle, action, cycle: _cycle, juice: J }) {
  const mul = heroMul(cls, J);
  const was = !!st.walking;
  st.walking = movingState(was, speed, J);
  const startDur = (J.startAnticipation || 0) * (mul.startAnticipation || 1);
  const stopDur = (J.stopSettle || 0) * (mul.stopSettle || 1);

  if (st.walking && !was) {
    st.mode = 'start';
    st.startT = startDur;
    st.clock = 0;
    st.cadenceSpeed = speed; // snap on start so the first step is not lagged from 0
  } else if (!st.walking && was) {
    st.mode = 'stop';
    st.stopT = stopDur;
  }

  if (st.mode === 'start') {
    st.startT -= dt;
    if (st.startT <= 0) { st.mode = 'walk'; st.startT = 0; }
  } else if (st.mode === 'stop') {
    st.stopT -= dt;
    if (st.stopT <= 0) { st.mode = 'idle'; st.stopT = 0; }
  } else if (st.walking) {
    st.mode = 'walk';
  } else {
    st.mode = st.mode || 'idle';
  }

  // Smooth the speed used for cadence when live velocity changes (not on the start snap).
  const k = J.cadenceSmooth ?? 14;
  if (st.cadenceSpeed == null) st.cadenceSpeed = speed;
  else if (was) st.cadenceSpeed += (speed - st.cadenceSpeed) * (1 - Math.exp(-k * Math.max(0, dt)));
  else st.cadenceSpeed = speed;
  // Rate is cycles/s from live velocity and the per-hero stride constant — not atlas holds, walkProfile, or walkMs.
  // `cycle` is ignored here so applyMsProfile cannot change foot speed.
  const rate = cadenceRate(st.cadenceSpeed, J, cls);
  if (st.mode === 'start' && startDur > 0) {
    const u = 1 - Math.max(0, st.startT) / startDur;
    st.clock += dt * rate * u * u;
  } else if (st.mode === 'walk') {
    st.clock += dt * rate;
  }

  const special = action && action !== 'walk' && action !== 'idle';
  const phase = cyclePhase(st.clock, 1);
  const walkAmt = st.mode === 'walk' ? 1 : st.mode === 'start' ? 0.25 : st.mode === 'stop' && stopDur > 0 ? Math.max(0, st.stopT / stopDur) : 0;

  let bob = bobOffset(phase, (J.bob || 0) * mul.bob) * (st.mode === 'walk' ? 1 : walkAmt * 0.5);
  let { sx, sy } = squashXY(phase, (J.squash || 0) * mul.squash, (J.stretch || 0) * mul.stretch);
  if (st.mode !== 'walk') { sx = 1 + (sx - 1) * walkAmt; sy = 1 + (sy - 1) * walkAmt; }

  if (st.mode === 'start' && startDur > 0) {
    const u = Math.max(0, st.startT) / startDur; // 1 at onset, 0 when released
    const ant = (J.startSquash || 0) * u;
    sy *= 1 - ant;
    sx *= 1 + ant;
  }
  if (st.mode === 'stop' && stopDur > 0) {
    const u = 1 - Math.max(0, st.stopT) / stopDur; // 0 at onset, 1 when settled
    const dip = (J.stopOvershoot || 0) * Math.sin(u * Math.PI);
    sy *= 1 - dip;
    sx *= 1 + dip;
    bob += (J.bob || 0) * mul.bob * 0.35 * Math.sin(u * Math.PI);
  }

  // Jump / land: procedural stretch or squash on whatever frame is showing (no new art).
  if (special && action === 'jump') { sy *= 1 + 0.08 * (mul.stretch || 1); sx *= 1 - 0.05 * (mul.stretch || 1); }
  if (special && (action === 'attack' || action === 'special')) { sy *= 1 - 0.04 * (mul.squash || 1); sx *= 1 + 0.04 * (mul.squash || 1); }

  const lean = (st.mode === 'walk' || st.mode === 'start') ? leanRad(screenAngle, speed, J, mul.lean) * (st.mode === 'start' ? 0.4 : 1) : 0;
  const sway = swayX(phase, (J.sway || 0) * mul.sway) * (st.mode === 'walk' ? 1 : 0);

  return { sx, sy, bob, lean, sway, phase, mode: st.mode, walking: st.walking };
}

export function newJuiceState() {
  return { walking: false, mode: 'idle', clock: 0, startT: 0, stopT: 0, cadenceSpeed: 0 };
}
