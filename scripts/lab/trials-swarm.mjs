// Lab trial for the swarm prototype (?swarm; src/game/colony.js): you are the rat king and the
// colony shields you, fights for you and is spent on the city. Same shape as trials.mjs.
const CITY = i => ['surface', i, null], SEWER = i => ['sewer', i, null];
const clearMobs = L => L.S(() => __scurry.W.enemies.forEach(e => { if (e.type !== 'nest') e.dead = true; }));
/** Set the colony to n rats around the king. */
const setRats = (L, n) => L.S(n => { const s = __scurry; s.colony.rats.length = 0; s.run.colonyN = n; s.colonyPlace(); }, n);

export const TRIALS_SWARM = [{
  id: 'swarm', since: 'P5', title: 'Swarm prototype: the colony shields, fights, breeds and is spent',
  t1: [
    { name: '?swarm starts a run with the colony gathered around the king, counted on the HUD', async run(L) {
      await L.fresh({ colony: true });
      await clearMobs(L);
      const r = await L.S(() => { const s = __scurry; return { n: s.ratCount(), want: s.TUNE.colony.start, near: s.colony.rats.filter(q => Math.hypot(q.x - s.P.x, q.z - s.P.z) < 5).length, hud: (document.querySelector('#colonyHud b') || {}).textContent }; });
      return { ok: r.n === r.want && r.near === r.n && r.hud === String(r.n), detail: JSON.stringify(r) };
    } },
    { name: 'the colony follows the king', async run(L) {
      const r = await L.S(() => { const s = __scurry; s.P.x += 6; s.qa.stepRaw(2); return { near: s.colony.rats.filter(q => Math.hypot(q.x - s.P.x, q.z - s.P.z) < 5).length, n: s.ratCount() }; });
      return { ok: r.near >= r.n * 0.9, detail: `${r.near} of ${r.n} within 5` };
    } },
    { name: 'attack surges the colony: rats latch on, pin, and bite it to death; let go and they come home', async run(L) {
      await L.fresh({ colony: true });
      await clearMobs(L);
      const r = await L.S(() => {
        const s = __scurry, P = s.P, e = s.spawnEnemy('ghoul', P.x, P.z + 6, { plain: true, force: true }); e.emT = 0;
        s.G.aimAt = { x: e.x, z: e.z }; s.G.attack = true;
        let latched = 0, pinned = false, t = 0;
        for (; t < 8 && !e.dead; t += 0.1) { s.G.aimAt = { x: e.x, z: e.z }; s.qa.stepRaw(0.1); latched = Math.max(latched, e.colN || 0); pinned = pinned || e.pinX != null; }
        s.G.attack = false; s.G.aimAt = null; s.qa.stepRaw(2);
        return { dead: e.dead, secs: +t.toFixed(1), latched, pinned, home: s.colony.rats.filter(q => q.mode === 'follow').length, n: s.ratCount() };
      });
      return { ok: r.dead && r.latched >= 4 && r.pinned && r.home === r.n, detail: JSON.stringify(r) };
    } },
    { name: 'kills and food breed rats', async run(L) {
      const r = await L.S(() => {
        const s = __scurry, P = s.P, n0 = s.ratCount();
        for (let i = 0; i < 4; i++) { const e = s.spawnEnemy('mawling', P.x + 3, P.z + i, { plain: true, force: true }); s.kill(e); }
        const n1 = s.ratCount();
        s.dropFood(P.x, P.y, P.z, 'wedge', { mold: false, exact: true }); s.run.hp = s.st.maxHp * 0.5; s.qa.stepRaw(0.5);
        return { n0, kills: n1, food: s.ratCount() };
      });
      return { ok: r.kills > r.n0 && r.food > r.kills, detail: JSON.stringify(r) };
    } },
    { name: 'rats near the king take his hits; with none near, he does', async run(L) {
      await L.fresh({ colony: true });
      await clearMobs(L);
      const r = await L.S(() => {
        const s = __scurry, h = s.run.hp, n = s.ratCount(), want = Math.ceil(25 / s.TUNE.colony.ratHp);
        s.P.inv = 0; s.hurtP(25, null);
        const a = { hpLost: h - s.run.hp, ratsLost: n - s.ratCount(), want };
        s.colony.rats.forEach(q => { q.x += 30; });
        s.P.inv = 0; s.hurtP(25, null);
        a.hpLostAlone = Math.round(h - s.run.hp);
        return a;
      });
      return { ok: r.hpLost === 0 && r.ratsLost === r.want && r.hpLostAlone > 0, detail: JSON.stringify(r) };
    } },
    { name: 'Q throws bait: an enemy on the king goes after it', async run(L) {
      await L.fresh({ colony: true });
      await clearMobs(L);
      // Through the real key: Q with the aim point to the king's left.
      await L.S(() => { const s = __scurry, P = s.P, e = s.spawnEnemy('mawling', P.x + 3, P.z, { plain: true, force: true }); e.emT = 0; window.__bait = { e, bx: P.x - 8, bz: P.z, n: s.ratCount() }; s.G.aimAt = { x: P.x - 8, z: P.z }; });
      await L.page.keyboard.press('KeyQ');
      const r = await L.S(() => {
        const s = __scurry, { e, bx, bz, n } = window.__bait; s.G.aimAt = null;
        const thrown = n - s.colony.rats.filter(q => q.mode !== 'bait').length, d0 = Math.hypot(e.x - bx, e.z - bz);
        s.qa.stepRaw(2.5);
        return { thrown, d0: +d0.toFixed(1), d1: +Math.hypot(e.x - bx, e.z - bz).toFixed(1) };
      });
      return { ok: r.thrown === 3 && r.d1 < r.d0 - 4, detail: JSON.stringify(r) };
    } },
    { name: 'E near a gnaw point sends rats to chew it through', async run(L) {
      const lv = await L.S(() => __scurry.W.traps.filter(q => !q.sprung).length);
      if (!lv) await L.fresh({ colony: true, level: CITY(2) });
      const r = await L.S(() => {
        const s = __scurry, t = s.W.traps.find(q => !q.sprung);
        if (!t) return { none: true };
        s.P.x = t.gx + 5.5; s.P.z = t.gz; s.P.y = t.gy; s.colonyPlace(); s.qa.stepRaw(0.5);
        const n = s.ratCount(); s.pressE(); s.qa.stepRaw(3);
        return { kind: t.kind, sprung: t.sprung, spent: n - s.ratCount(), want: s.TUNE.colony.gnaw };
      });
      return { ok: !r.none && r.sprung && r.spent >= r.want, detail: JSON.stringify(r) };
    } },
    { name: 'with the colony gone, the king fights with his own attack', async run(L) {
      await L.fresh({ colony: true });
      await clearMobs(L);
      const r = await L.S(() => {
        const s = __scurry, P = s.P; s.colony.rats.length = 0;
        const e = s.spawnEnemy('mawling', P.x, P.z + 2.5, { plain: true, force: true }); e.emT = 0; e.spd = 0; e.atkCd = 99;
        const hp = e.hp; s.G.aimAt = { x: e.x, z: e.z }; s.G.attack = true; s.qa.stepRaw(1.2); s.G.attack = false; s.G.aimAt = null;
        return { hurt: e.dead || e.hp < hp };
      });
      return { ok: r.hurt, detail: JSON.stringify(r) };
    } },
  ],
  t2: [
    { name: 'a full colony through bot play on three levels: no rat lost in a wall, out of the world, or left behind', async run(L) {
      const bad = [];
      for (const lv of [CITY(1), SEWER(1), CITY(5)]) {
        await L.fresh({ colony: true, level: lv, quiet: false });
        await setRats(L, 150);
        await L.play(L.QUICK ? 20 : 45, { profile: 'average', goal: 'nests' });
        const r = await L.S(async () => {
          const s = __scurry, g = await import('/src/world/grid.js'), T = s.TUNE.colony;
          const rats = s.colony.rats;
          return { n: rats.length, nan: rats.filter(q => !Number.isFinite(q.x + q.y + q.z)).length, inWall: rats.filter(q => g.solidFor(g.tileAt(q.x, q.z), false) && q.y < g.floorY(q.x, q.z) - 0.3).length, astray: rats.filter(q => q.mode === 'follow' && Math.hypot(q.x - s.P.x, q.z - s.P.z) > T.catchup + 5).length, where: s.dName() };
        });
        if (r.nan || r.inWall > 2 || r.astray > 2) bad.push(JSON.stringify(r));
      }
      return { ok: !bad.length, score: Math.max(0, 1 - bad.length / 3), detail: bad.join('; ') || 'clean on 3 levels' };
    } },
    { name: 'a level change brings the colony along, same size', async run(L) {
      await L.fresh({ colony: true, god: true });
      await clearMobs(L);
      await setRats(L, 40);
      await L.S(() => __scurry.exitRoad());
      await L.sleep(1500);
      await L.S(() => __scurry.qa.stepRaw(0.3));
      const r = await L.S(() => { const s = __scurry; return { st: s.G.state, n: s.ratCount(), near: s.colony.rats.filter(q => Math.hypot(q.x - s.P.x, q.z - s.P.z) < 8).length, where: s.dName() }; });
      return { ok: r.st === 'play' && r.n >= 38 && r.near >= r.n * 0.9, detail: JSON.stringify(r) };
    } },
    { name: 'the colony never grows past its cap', async run(L) {
      const r = await L.S(() => { const s = __scurry, P = s.P; for (let i = 0; i < 60; i++) { const e = s.spawnEnemy('brute', P.x + 3, P.z, { plain: true, force: true }); s.kill(e); } return { n: s.ratCount(), max: s.TUNE.colony.max }; });
      return { ok: r.n <= r.max, detail: JSON.stringify(r) };
    } },
    { name: '180 rats cost under 2 ms a frame', async run(L) {
      // 30 updates and 5 draws a second of game time; the extra time with 180 rats, per update.
      const r = await L.S(() => {
        const s = __scurry, t = n => { s.colony.rats.length = 0; s.run.colonyN = n; s.colonyPlace(); const t0 = performance.now(); for (let i = 0; i < 5; i++) { s.qa.stepRaw(0.2); s.sync(1 / 30); } return performance.now() - t0; };
        t(0); const base = t(0), full = t(180);
        return { base: +base.toFixed(1), full: +full.toFixed(1), perFrame: +((full - base) / 30).toFixed(2) };
      });
      return { ok: r.perFrame < 2, score: r.perFrame < 2 ? 1 : r.perFrame < 4 ? 0.5 : 0, detail: `${r.perFrame} ms a frame (${r.base} → ${r.full} ms per game second)` };
    } },
    { name: 'without ?swarm nothing changes: no rats, the class attack works', async run(L) {
      await L.fresh({});
      await clearMobs(L);
      const r = await L.S(() => {
        const s = __scurry, P = s.P, e = s.spawnEnemy('mawling', P.x, P.z + 2.5, { plain: true, force: true }); e.emT = 0; e.spd = 0; e.atkCd = 99;
        const hp = e.hp; s.G.aimAt = { x: e.x, z: e.z }; s.G.attack = true; s.qa.stepRaw(1.2); s.G.attack = false; s.G.aimAt = null; s.sync(1 / 30);
        return { rats: s.ratCount(), hurt: e.dead || e.hp < hp };
      });
      return { ok: r.rats === 0 && r.hurt, detail: JSON.stringify(r) };
    } },
    { name: 'a gamepad right stick surges the colony', async run(L) {
      await L.fresh({ colony: true });
      await clearMobs(L);
      const r = await L.S(() => { const s = __scurry; s.fakePads[0] = { axes: [0, 0, 0, 1], buttons: [] }; s.qa.stepRaw(0.6); const n = s.colony.rats.filter(q => q.mode === 'surge').length; delete s.fakePads[0]; s.qa.stepRaw(0.2); return { surging: n, of: s.ratCount() }; });
      return { ok: r.surging >= r.of * 0.8, detail: JSON.stringify(r) };
    } },
  ],
  t3: {
    // The QA bot leads the colony through Cinder Row (tank) and Neon Market (slinger). The swarm should
    // fight a real horde (kills per minute well past the hero game's 27–50), the colony should swing with
    // how the fight goes rather than sit at its cap, and the king should usually live.
    async run(L) {
      const secs = L.QUICK ? 150 : 240, samples = [];
      let kills = 0, mins = 0, deaths = 0, bred = 0, lost = 0;
      for (const [lv, cls] of [[CITY(0), 'tank'], [CITY(1), 'slinger']]) {
        await L.fresh({ colony: true, cls, level: lv, quiet: false });
        await L.S(() => __scurry.qa.start({ profile: 'average', goal: 'progress' }));
        let st = 'ok', t = 0;
        for (; t < secs && st !== 'dead'; t += 10) {
          st = await L.S(() => __scurry.qa.sim(10));
          samples.push(await L.S(() => __scurry.ratCount()));
          if (st === 'trans' || st === 'district') await L.sleep(1200);
        }
        const r = await L.S(() => { const s = __scurry, T = s.qa.telemetry(); return { kills: Object.values(T.kills).reduce((a, b) => a + b, 0), deaths: T.deaths.length, bred: s.run.ratsBred || 0, lost: s.run.ratsLost || 0, simTime: T.simTime }; });
        await L.S(() => __scurry.qa.stop());
        kills += r.kills; mins += r.simTime / 60; deaths += r.deaths ? 1 : 0; bred += r.bred; lost += r.lost;
      }
      const max = await L.S(() => __scurry.TUNE.colony.max);
      await L.fresh({});
      const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
      return { killsPerMin: kills / Math.max(0.25, mins), colonyMean: Math.round(mean), capShare: samples.filter(n => n >= max - 5).length / Math.max(1, samples.length), kingDeaths: deaths / 2, turnoverPerMin: Math.round((bred + lost) / Math.max(0.25, mins)) };
    },
    bands: { killsPerMin: [50, 160], colonyMean: [30, 140], capShare: [0, 0.25], kingDeaths: [0, 0.5], turnoverPerMin: [0, 1e4, 0] },
  },
  ab: { name: 'gentler hunger (upkeep 0.0025)', set: { 'colony.upkeep': 0.0025 } },
}];
