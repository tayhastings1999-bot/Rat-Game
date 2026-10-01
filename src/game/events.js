// District events: every minute and a half or so something happens that you
// have to react to. Never during a boss fight or a breakthrough trial.
//  - Food truck crash: a loot pile appears somewhere, and so does the horde.
//  - Stampede: a line of cats charges across the street. Get clear or get high.
//  - Fumigation sweep: a wall of gas rolls across the whole district. Get on a
//    roof or into the walls; it shreds the horde on its way.
//  - Roach tide: a flood of weak roaches pours in. A free XP feast.
//  - Wanted: a tough marked rat with a bounty. Catch it before it escapes.
import { rand, pick, keep } from '../core/util.js';
import { G, P, W, run } from '../core/state.js';
import { boom, puff, fx, dnum } from '../fx/fx.js';
import { sfx } from '../audio/audio.js';
import { M, toW, floorY, tileAt } from '../world/grid.js';
import { hit, hurtP, dropFood, dropGem, scrapDrop } from '../combat/combat.js';
import { spawnEnemy, chargeStart } from '../entities/mobs.js';
import { addChest } from '../world/build.js';
import { dropCrate } from './progress.js';
import { banner } from '../ui/hud.js';

const EVENTS = ['feast', 'stampede', 'fumigate', 'tide', 'bounty'];
const open = t => t === 1 || t === 9 || t === 10;

function siteNear(lo, hi) {
  const tiles = M.spawnTiles || [];
  for (let i = 0; i < 40 && tiles.length; i++) {
    const k = tiles[(Math.random() * tiles.length) | 0], x = toW(k % M.W), z = toW((k / M.W) | 0), d = Math.hypot(x - P.x, z - P.z);
    if (d >= lo && d <= hi) return { x, z };
  }
  for (let i = 0; i < 30; i++) {
    const a = rand(0, 6.3), r = rand(lo, hi), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    if (open(tileAt(x, z))) return { x, z };
  }
  return null;
}

const START = {
  feast() {
    const s = siteNear(14, 32);
    if (!s) return null;
    const gy = floorY(s.x, s.z);
    boom(s.x, gy + 1, s.z, 7, 0xffb040);
    puff(s.x, gy + 0.5, s.z, 0x8a7a6a, 30, 6);
    sfx('boom');
    addChest(s.x, gy, s.z);
    for (let i = 0; i < 3; i++) dropFood(s.x + rand(-2, 2), gy, s.z + rand(-2, 2));
    for (let i = 0; i < 16; i++) scrapDrop(s.x + rand(-2, 2), gy, s.z + rand(-2, 2));
    for (let i = 0; i < 18; i++) dropGem(s.x + rand(-3, 3), gy, s.z + rand(-3, 3), 3);
    G.evMarker = { x: s.x, z: s.z, col: '#ffb040' };
    banner('A food truck just crashed', 'Free loot · and every rat in the district smelled it');
    return { kind: 'feast', x: s.x, z: s.z, t: 30, spawned: 0, st: 0 };
  },
  stampede() {
    const a = rand(0, 6.3), dx = Math.sin(a), dz = Math.cos(a), px = -dz, pz = dx, head = a + Math.PI;
    let n = 0;
    for (let i = -3; i <= 3; i++) {
      const x = P.x + dx * 20 + px * i * 2.6, z = P.z + dz * 20 + pz * i * 2.6;
      if (!open(tileAt(x, z))) continue;
      const e = spawnEnemy('cat', x, z, { plain: true });
      if (!e) continue;
      e.stampede = true;
      chargeStart(e, 1.1, 18, 2.6, () => head);
      fx('warn', x, floorY(x, z), z, 1.6, 0xff2a1a, 1.1, 0, 0.45);
      n++;
    }
    if (!n) return null;
    sfx('screech');
    banner('Stampede!', 'Cats are charging through · get clear or get up high');
    return { kind: 'stampede', t: 5 };
  },
  fumigate() {
    const ax = Math.random() < 0.5 ? 'x' : 'z', dir = Math.random() < 0.5 ? 1 : -1;
    banner('Fumigation sweep', 'A wall of gas is rolling through · get on a roof or into the walls');
    sfx('phase');
    return { kind: 'fumigate', ax, dir, pos: -dir * (M.half + 4), delay: 4, t: 60, tick: 0 };
  },
  tide() {
    const a = rand(0, 6.3);
    banner('Roach tide', 'They just keep coming · easy XP');
    sfx('screech');
    return { kind: 'tide', a, t: 7, n: 0 };
  },
  bounty() {
    const s = siteNear(18, 40);
    if (!s) return null;
    const type = pick(['brute', 'ghoul', 'cat'].filter(t => run.seenMobs && run.seenMobs[t]).concat(['mawling']));
    const e = spawnEnemy(type, s.x, s.z, { elite: true, sc: 1.5, hpMul: 3, name: 'Wanted', force: true });
    if (!e) return null;
    Object.assign(e, { bounty: true, bar: true, xp: (e.xp || 1) * 3 });
    G.evMarker = { e, col: '#ffd040' };
    banner('Wanted', 'A marked rat with a bounty on its head · 60 seconds · F to sniff it out');
    sfx('key');
    return { kind: 'bounty', e, t: 60 };
  },
};

const TICK = {
  feast(v, dt) {
    v.st -= dt;
    if (v.spawned < 12 && v.st <= 0) {
      v.st = 0.3;
      v.spawned++;
      const a = rand(0, 6.3);
      spawnEnemy(v.spawned % 4 ? 'mawling' : 'roach', v.x + Math.sin(a) * 9, v.z + Math.cos(a) * 9);
    }
  },
  fumigate(v, dt) {
    if (v.delay > 0) { v.delay -= dt; return; }
    v.pos += v.dir * 7 * dt;
    if (Math.abs(v.pos) > M.half + 6) { v.t = 0; return; }
    const along = v.ax === 'x' ? P.z : P.x;
    // Gas billows along the front, near you.
    for (let i = 0; i < 5; i++) {
      const o = along + rand(-28, 28), x = v.ax === 'x' ? v.pos + rand(-2, 2) : o, z = v.ax === 'x' ? o : v.pos + rand(-2, 2);
      W.parts.push({ x, y: floorY(x, z) + rand(0.2, 2.5), z, vx: 0, vy: 0.6, vz: 0, life: 1.2, c: 0x9be06a, s: 3, ng: true });
    }
    v.tick -= dt;
    if (v.tick > 0) return;
    v.tick = 0.5;
    const inGas = (x, y, z) => Math.abs((v.ax === 'x' ? x : z) - v.pos) < 3 && y < floorY(x, z) + 3;
    if (inGas(P.x, P.y, P.z) && !P.inDuct && P.y < 3.5) { hurtP(5, null, true); dnum(P.x, P.y + 1.6, P.z, 'Gassed', 'poison'); }
    for (const e of W.enemies) if (!e.dead && !e.boss && !e.fly && !e.rival && e.type !== 'nest' && inGas(e.x, e.y, e.z)) hit(e, 14 + (run.tier || 0) * 6, null, 0, 'event', true);
  },
  tide(v, dt) {
    v.acc = (v.acc || 0) + dt;
    while (v.acc > 0.12 && v.n < 45) {
      v.acc -= 0.12;
      v.n++;
      // Pour in from the street spawn points on one side of you.
      const tiles = M.spawnTiles || [];
      for (let i = 0; i < 10 && tiles.length; i++) {
        const k = tiles[(Math.random() * tiles.length) | 0], x = toW(k % M.W), z = toW((k / M.W) | 0);
        if (i < 9 && Math.cos(Math.atan2(x - P.x, z - P.z) - v.a) < 0.2) continue;
        if (spawnEnemy('roach', x + rand(-1, 1), z + rand(-1, 1), { pack: 1, plain: true })) v.got = (v.got || 0) + 1;
        break;
      }
    }
  },
  bounty(v) {
    if (v.e.dead) { v.t = 0; return; }
    if (v.t <= 0.05) { v.e.dead = true; puff(v.e.x, v.e.y + 1, v.e.z, 0x6a6a6a, 20, 4); banner('The Wanted rat got away', ''); }
  },
};

/** Called from kill(): the Wanted rat paid out. */
export function bountyKill(e) {
  const gy = floorY(e.x, e.z);
  for (let i = 0; i < 20; i++) scrapDrop(e.x, gy, e.z);
  dropCrate(e.x, gy, e.z);
  banner('Bounty collected', 'Salvage and a weapon crate');
  if (G.evMarker && G.evMarker.e === e) G.evMarker = null;
}

export function tickEvents(dt) {
  if (G.mode === 'trial') return;
  keep(run.events || (run.events = []), v => {
    v.t -= dt;
    if (TICK[v.kind]) TICK[v.kind](v, dt);
    if (v.t <= 0 && (v.kind === 'feast' || v.kind === 'bounty')) G.evMarker = null;
    return v.t > 0;
  });
  const bossOn = !G.testNoBusy && G.boss && G.boss.revealed;
  run.evT = (run.evT ?? 50) - dt;
  if (run.evT > 0 || bossOn || run.trial || run.events.length) return;
  const choices = EVENTS.filter(k => k !== run.lastEv);
  const k = run.forceEv || pick(choices);
  run.forceEv = null;
  const v = START[k]();
  run.evT = v ? (run.evFast ? rand(40, 55) : rand(70, 100)) : 5;
  if (v) { run.lastEv = k; run.events.push(v); }
}
