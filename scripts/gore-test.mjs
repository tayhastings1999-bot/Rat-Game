// Unit checks for combat gore pooling, caps, damage-scaled bursts, and the gore toggle.
// No GPU. Usage: node scripts/gore-test.mjs
import { spawnCapped, makePool } from '../src/fx/pool.js';
import { onFeelEvent, feelEvent } from '../src/fx/feelEvents.js';

let fail = 0;
const ok = (name, c) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${name}`); if (!c) fail++; };

// ---------- spawnCapped ----------
{
  const arr = [];
  const seen = new Set();
  for (let i = 0; i < 5; i++) spawnCapped(arr, 3, o => { o.i = i; seen.add(o); });
  ok('spawnCapped never exceeds cap', arr.length === 3);
  ok('spawnCapped evicts oldest first', arr[0].i === 2 && arr[1].i === 3 && arr[2].i === 4);
  ok('spawnCapped recycles objects (no extra alloc past cap)', seen.size === 3);
  const same = arr[0];
  spawnCapped(arr, 3, o => { o.i = 99; });
  ok('spawnCapped reuses the evicted object', arr[2] === same && same.i === 99);
  ok('spawnCapped cap 0 is a no-op', spawnCapped(arr, 0, o => { o.i = -1; }) === null && arr.length === 3);
}

// ---------- makePool ----------
{
  const pool = makePool(4, () => ({ n: 0 }));
  const a = pool.acquire(), b = pool.acquire();
  a.n = 1; b.n = 2;
  ok('makePool acquire grows live list', pool.length === 2 && pool.live[0] === a && pool.live[1] === b);
  const more = [];
  for (let i = 0; i < 5; i++) more.push(pool.acquire(4));
  ok('makePool evicts oldest at cap', pool.length === 4);
  ok('makePool first evicted is the first acquired', more[2] === a && a.n === 1);
  const keep = new Set(pool.live.slice(0, 2));
  pool.retain(o => keep.has(o));
  ok('makePool retain drops the rest', pool.length === 2 && pool.live.every(o => keep.has(o)));
  pool.clear();
  ok('makePool clear empties live', pool.length === 0);
  const c = pool.acquire();
  ok('makePool reuses stock after clear', c === a || c === b || more.includes(c));
  ok('makePool liveCap 0 returns null', pool.acquire(0) === null);
}

// ---------- goreOn / bloodCount (tuning + location stub, no renderer) ----------
globalThis.location = { search: '' };
const { TUNE, setTune } = await import('../src/tuning.js');
const { goreOn, bloodCount } = await import('../src/fx/gore.js');
ok('TUNE.gore defaults: on (force null), caps set', TUNE.gore.force == null && TUNE.gore.partCap === 700 && TUNE.gore.gibCap === 400 && TUNE.gore.decalCap === 140);
ok('TUNE.feel defaults: hit-stop, shake cap, lowHp', TUNE.feel.hitStopBoss === 0.3 && TUNE.feel.shakeCap === 1.2 && TUNE.feel.lowHp === 0.3);
ok('goreOn default (no settings) is on', goreOn() === true && goreOn({}) === true);
ok('goreOn respects settings.gore = false', goreOn({ gore: false }) === false);
ok('goreOn settings true stays on', goreOn({ gore: true }) === true);
ok('bloodCount scales with damage and caps', bloodCount(0) === TUNE.gore.bloodMin && bloodCount(1000) === TUNE.gore.bloodMax && bloodCount(1000, true) === TUNE.gore.bloodMax + TUNE.gore.bloodCrit);
ok('bloodCount mid-damage is between min and max', bloodCount(20) > TUNE.gore.bloodMin && bloodCount(20) < TUNE.gore.bloodMax);
ok('bloodCount crit adds bloodCrit', bloodCount(20, true) === bloodCount(20) + TUNE.gore.bloodCrit);
setTune('gore.bloodMin', 3);
ok('bloodCount reads live TUNE', bloodCount(0) === 3);
setTune('gore.bloodMin', 2);
TUNE.gore.force = false;
ok('goreOn force false wins over settings', goreOn({ gore: true }) === false);
TUNE.gore.force = true;
ok('goreOn force true wins over settings', goreOn({ gore: false }) === true);
TUNE.gore.force = null;

// ---------- feel events ----------
{
  const got = [];
  const off = onFeelEvent((type, data) => got.push([type, data]));
  feelEvent('heartbeat', { hp: 0.1 });
  feelEvent('killPop', { big: true });
  ok('feelEvent delivers type and payload', got.length === 2 && got[0][0] === 'heartbeat' && got[0][1].hp === 0.1 && got[1][0] === 'killPop');
  off();
  feelEvent('hit', { dmg: 1 });
  ok('feelEvent unsubscribe stops delivery', got.length === 2);
}

process.exit(fail ? 1 : 0);
