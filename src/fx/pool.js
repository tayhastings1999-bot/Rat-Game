// Fixed-cap object pools. Recycle the oldest live item when full so combat FX
// never allocate in a 4-player horde and never grow past the cap.
/** Recycle the oldest entry once `arr` hits `cap`. `init` fills the object. Returns it, or null if cap is 0. */
export function spawnCapped(arr, cap, init) {
  const limit = Math.max(0, cap | 0);
  if (limit <= 0) return null;
  let o;
  if (arr.length >= limit) {
    o = arr.shift();
    arr.push(o);
  } else {
    o = {};
    arr.push(o);
  }
  if (init) init(o);
  return o;
}

/** Preallocated pool with a hard cap. `acquire(liveCap)` evicts the oldest when full. */
export function makePool(cap, alloc = () => ({})) {
  const stock = Array.from({ length: cap }, alloc);
  const live = [];
  const free = stock.slice();
  const acquire = (liveCap = cap) => {
    const limit = Math.max(0, Math.min(cap, liveCap | 0));
    if (limit <= 0) return null;
    let o;
    if (live.length >= limit) {
      o = live.shift();
      live.push(o);
      return o;
    }
    o = free.pop() || alloc();
    live.push(o);
    return o;
  };
  const retain = pred => {
    let w = 0;
    for (let i = 0; i < live.length; i++) {
      if (pred(live[i])) live[w++] = live[i];
      else free.push(live[i]);
    }
    live.length = w;
  };
  const clear = () => { while (live.length) free.push(live.pop()); };
  return { cap, live, acquire, retain, clear, get length() { return live.length; } };
}
