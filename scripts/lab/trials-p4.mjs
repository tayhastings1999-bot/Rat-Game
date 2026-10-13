// Phase 4 lab trials: save slots, the Nest shop and its economy, held flasks, difficulty,
// local co-op (with pad-bot partners), the single-player gamepad and the art pass's
// readability rules. Same shape as trials.mjs (t1 gate, t2 robustness, t3 bands, ab idea).
const CITY = i => ['surface', i, null];

const clearMobs = L => L.S(() => __scurry.W.enemies.forEach(e => { if (e.type !== 'nest') e.dead = true; }));
/** A ring of n mobs of one type around the rat (the art trial's crowd). */
const horde = (L, n, type = 'mawling') => L.S(([n, type]) => {
  const s = __scurry, P = s.P;
  for (let i = 0; i < n; i++) { const a = i / n * 6.283, r = 6 + (i % 3) * 2; const e = s.spawnEnemy(type, P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, { plain: true, force: true }); if (e) e.emT = 0; }
}, [n, type]);

export const TRIALS_P4 = [
  // ------------------------------------------------------------------ save slots
  {
    id: 'slots', since: 'P4', title: 'Three save slots, versioned, behind a storage layer',
    t1: [
      { name: 'picking a slot makes it active and writes a versioned save', async run(L) {
        await L.resetSaves();
        const r = await L.S(async () => { const st = await import('/src/core/state.js'); st.loadSlot(2); const d = st.readSlot(2); return { slot: st.save.slot, v: d && d.v, want: st.SAVE_VERSION }; });
        return { ok: r.slot === 2 && r.v === r.want, detail: JSON.stringify(r) };
      } },
      { name: 'each slot keeps its own gold and shop ranks', async run(L) {
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js'), s = __scurry;
          st.loadSlot(1); s.meta.salvage = 2000; s.shop.buy('hide'); st.saveMeta();
          st.loadSlot(2); const two = { gold: s.meta.salvage || 0, hide: s.shop.rank('hide') };
          st.loadSlot(1); const one = { gold: s.meta.salvage, hide: s.shop.rank('hide') };
          return { one, two };
        });
        return { ok: r.one.hide === 1 && r.two.hide === 0 && r.two.gold === 0 && r.one.gold < 2000, detail: JSON.stringify(r) };
      } },
      { name: 'deleting a slot clears that slot only', async run(L) {
        const r = await L.S(async () => { const st = await import('/src/core/state.js'); st.loadSlot(3); st.deleteSlot(3); return { three: st.readSlot(3), one: !!st.readSlot(1) }; });
        return { ok: r.three == null && r.one, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'a corrupted slot neither crashes the game nor blocks the slot screen', async run(L) {
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js');
          localStorage.setItem('scurry.slot3', '{"v":2,"meta":{"salvage":');
          let read = 'ok';
          try { read = st.readSlot(3); } catch (e) { read = 'threw ' + e.message; }
          __scurry.menu();
          const n = document.querySelectorAll('[data-slot]').length;
          localStorage.removeItem('scurry.slot3');
          return { read: read === null ? null : String(read), n };
        });
        return { ok: r.read === null && r.n === 3, detail: JSON.stringify(r) };
      } },
      { name: 'an older save version is brought up to date on load', async run(L) {
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js');
          localStorage.setItem('scurry.slot3', JSON.stringify({ v: 1, meta: { salvage: 55 }, best: { time: 10 }, at: 1 }));
          const d = st.readSlot(3);
          st.loadSlot(3);
          const out = { v: d && d.v, want: st.SAVE_VERSION, gold: __scurry.meta.salvage };
          st.deleteSlot(3);
          return out;
        });
        return { ok: r.v === r.want && r.gold === 55, detail: JSON.stringify(r) };
      } },
      { name: 'a storage backend that throws (full, blocked) never breaks play', async run(L) {
        const r = await L.S(async () => {
          const sto = await import('/src/core/storage.js'), st = await import('/src/core/state.js');
          const boom = () => { throw new Error('quota'); };
          sto.setStorageBackend({ get: boom, set: boom, remove: boom, keys: boom });
          let err = null;
          try { st.loadSlot(1); st.saveMeta(); __scurry.shop.buy('vial'); st.deleteSlot(2); } catch (e) { err = e.message; }
          sto.setStorageBackend(null);
          return { err };
        });
        return { ok: r.err == null, detail: r.err || 'saves quietly skipped' };
      } },
      { name: 'a full slot stays small and quick to save', async run(L) {
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js'), s = __scurry;
          st.loadSlot(1); s.meta.salvage = 1e6;
          for (const id of ['str', 'arm', 'spd', 'mag', 'hide', 'pack']) for (let i = 0; i < 6; i++) s.shop.buy(id);
          const t0 = performance.now(); for (let i = 0; i < 50; i++) st.saveMeta(); const ms = (performance.now() - t0) / 50;
          return { kb: +(localStorage.getItem('scurry.slot1').length / 1024).toFixed(2), ms: +ms.toFixed(3) };
        });
        await L.resetSaves();
        return { ok: r.kb < 16 && r.ms < 5, score: r.kb < 16 && r.ms < 5 ? 1 : 0.5, detail: `${r.kb} KB, ${r.ms} ms a save` };
      } },
    ],
  },

  // ------------------------------------------------------------------ the Nest shop and its economy
  {
    id: 'shop', since: 'P4', title: 'The Nest shop: upgrades, supplies, flasks, sell-back, and gold income',
    t1: [
      { name: 'buying spends exactly the price; no gold or a maxed item buys nothing', async run(L) {
        await L.resetSaves();
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js'), s = __scurry;
          st.loadSlot(1); s.meta.salvage = 10000;
          const p = s.shop.price('str'), ok = s.shop.buy('str'), spent = 10000 - s.meta.salvage;
          s.meta.salvage = 0; const broke = s.shop.buy('arm');
          s.meta.salvage = 1e6; while (s.shop.price('spd') != null) s.shop.buy('spd');
          const max = s.shop.rank('spd'), extra = s.shop.buy('spd');
          return { ok, spent, p, broke, max, extra };
        });
        return { ok: r.ok && r.spent === r.p && !r.broke && r.max === 3 && !r.extra, detail: JSON.stringify(r) };
      } },
      { name: 'upgrades and packed supplies apply at the next run start, and the pack empties', async run(L) {
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js'), s = __scurry, T = s.TUNE;
          st.loadSlot(1); s.meta.salvage = 1e6;
          for (const id of ['hide', 'pack', 'vial', 'key', 'cheese', 'tail', 'fIron']) s.shop.buy(id);
          s.startRun('tank');
          const out = { hp: s.st.maxHp, wantHp: T.classes.tank.hp + T.shop.hpPer, str: s.run.growth.str, wantStr: s.shop.rank('str') * T.shop.statPer, vials: s.run.vials, keys: s.run.keys, cheese: s.run.cheese, tails: s.run.tails, iron: s.run.flasks.iron, pack: Object.keys(s.meta.pack || {}).filter(k => s.meta.pack[k]).length };
          return out;
        });
        const ok = Math.abs(r.hp - r.wantHp) < 1e-6 && Math.abs(r.str - r.wantStr) < 1e-6 && r.keys >= 1 && r.cheese === 1 && r.tails === 1 && r.iron === 1 && r.pack === 0;
        return { ok, detail: JSON.stringify(r) };
      } },
      { name: 'packed items sell back at 75%; permanent upgrades can’t be sold', async run(L) {
        const r = await L.S(() => {
          const s = __scurry; s.meta.salvage = 1000; s.shop.buy('vial');
          const paid = 1000 - s.meta.salvage, back = s.shop.sellPrice('vial'), g = s.meta.salvage;
          const permSell = s.shop.sellPrice('str');
          return { paid, back, permSell, g };
        });
        return { ok: r.back === Math.floor(r.paid * 0.75) && r.permSell == null, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'every price follows goldPerLevel (one knob rebalances the shop)', async run(L) {
        const r = await L.S(async () => {
          const s = __scurry, sh = await import('/src/data/shop.js'), ids = Object.keys(sh.SHOP);
          const a = ids.map(id => s.shop.price(id)), old = s.TUNE.shop.goldPerLevel;
          s.setTune('shop.goldPerLevel', old * 2);
          const b = ids.map(id => s.shop.price(id));
          s.setTune('shop.goldPerLevel', old);
          const bad = ids.filter((id, i) => a[i] != null && Math.abs(b[i] - 2 * a[i]) > 10).map(id => `${id} ${a[ids.indexOf(id)]}→${b[ids.indexOf(id)]}`); // prices round to 5
          return { bad };
        });
        return { ok: !r.bad.length, detail: r.bad.join(', ') || 'all prices scale' };
      } },
      { name: 'gold pickup stacks Packrat with difficulty', async run(L) {
        const r = await L.S(async () => {
          const st = await import('/src/core/state.js'), s = __scurry, T = s.TUNE;
          st.loadSlot(2); s.meta.salvage = 1e6; s.shop.buy('pack'); s.shop.buy('pack');
          const out = {};
          for (const d of ['casual', 'insane']) { s.meta.difficulty = d; s.startRun('tank'); s.startRun('tank'); out[d] = s.st.salvage; }
          s.meta.difficulty = 'normal';
          const base = 1 * (1 + 2 * T.shop.goldPer);
          return { got: out, want: { casual: base * T.difficulty.casual.gold, insane: base * T.difficulty.insane.gold } };
        });
        await L.resetSaves();
        const ok = ['casual', 'insane'].every(d => Math.abs(r.got[d] - r.want[d]) / r.want[d] < 0.02);
        return { ok, detail: JSON.stringify(r) };
      } },
      { name: 'the Nest lists every item with a price and a working buy button', async run(L) {
        await L.resetSaves();
        await L.S(async () => { const s = __scurry; s.pickSlot(1); s.meta.salvage = 1e5; s.renderMenu(); });
        await L.sleep(200);
        const n = await L.S(async () => { const sh = await import('/src/data/shop.js'); return { cards: document.querySelectorAll('[data-buy]').length, items: Object.keys(sh.SHOP).length }; });
        const g0 = await L.S(() => __scurry.meta.salvage);
        await L.page.click('[data-buy="mag"]');
        const g1 = await L.S(() => __scurry.meta.salvage);
        await L.resetSaves();
        return { ok: n.cards >= n.items && g1 < g0, detail: `${n.cards} buy buttons for ${n.items} items; click spent ${g0 - g1}` };
      } },
    ],
    t3: {
      // Bots on Normal play whole levels: how much gold does a level bank (pickups plus the exit tally bonus),
      // and does TUNE.shop.goldPerLevel (an estimate, per the design log) match it? God mode keeps the zone boss
      // from ending the run early; gold comes from kills, loot and the tally, which it doesn't change (the
      // tally's health part does score full, so its bonus can run one grade high). A permanent stat costs 2×.
      async run(L) {
        let gold = 0, levels = 0, secs = 0;
        // Runs the average bot can finish: ranged bots stalled at an Undersewer nest behind a wall and took many
        // minutes over the Murder King (a flying boss) when this was written, so the tank carries the city runs.
        const runs = L.QUICK ? [[CITY(0), 'tank', 420]] : [[CITY(0), 'tank', 800], [CITY(0), 'slinger', 500], [CITY(2), 'tank', 600]];
        for (const [lv, cls, limit] of runs) {
          await L.fresh({ cls, level: lv, quiet: false, god: true });
          // Each exit tally pushes a rank: note the gold held at that moment (before the grade bonus is added).
          await L.S(() => { const s = __scurry, rk = []; rk.push = function (x) { x.goldAt = s.run.scrap || 0; return Array.prototype.push.call(this, x); }; s.run.ranks = rk; window.__gold0 = s.run.scrap || 0; });
          await L.play(limit, { profile: 'average', goal: 'progress' });
          const r = await L.S(() => {
            const s = __scurry, rk = s.run.ranks || [], last = rk[rk.length - 1];
            const bonus = rk.reduce((a, x) => a + (s.TUNE.tally['gold' + x.r] || 0), 0);
            return { n: rk.length, t: rk.reduce((a, x) => a + x.t, 0), gold: last ? last.goldAt - window.__gold0 + bonus : 0 };
          });
          gold += r.gold; levels += r.n; secs += r.t;
        }
        const T = await L.S(() => ({ gpl: __scurry.TUNE.shop.goldPerLevel }));
        const perLevel = gold / Math.max(1, levels), perMin = gold / Math.max(0.25, secs / 60);
        return { levelsDone: levels, goldPerLevel: Math.round(perLevel), minutesPerLevel: +(secs / 60 / Math.max(1, levels)).toFixed(1), perLevelVsEstimate: perLevel / T.gpl, minutesPerStat: 2 * T.gpl / Math.max(1, perMin) };
      },
      bands: { levelsDone: [1, 99, 0.5], goldPerLevel: [0, 1e4, 0], minutesPerLevel: [0, 99, 0], perLevelVsEstimate: [0.75, 1.33, 2], minutesPerStat: [4, 16] },
    },
    ab: { name: 'goldPerLevel 180 (cheaper shop)', set: { 'shop.goldPerLevel': 180 } },
  },

  // ------------------------------------------------------------------ held flasks
  {
    id: 'flasks', since: 'P4', title: 'Held flasks: V uncorks, corks and resumes; B cycles',
    t1: [
      { name: 'packed flasks are held at the start and shown on the HUD', async run(L) {
        await L.fresh({ god: true });
        await clearMobs(L);
        await L.S(() => { const s = __scurry; s.run.flasks = { iron: 1, quick: 1 }; s.run.flaskSel = 0; s.renderSlots(); });
        await L.sleep(300);
        const r = await L.S(() => ({ held: __scurry.shop.selFlask(), slot: document.querySelectorAll('#slots .slot.flask').length }));
        return { ok: !!r.held && r.slot >= 1, detail: JSON.stringify(r) };
      } },
      { name: 'V uncorks, V corks (time saved), V resumes where it left off', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, k = s.shop.selFlask();
          const a = s.shop.useFlask(); s.qa.stepRaw(5);
          const b = s.shop.useFlask(), saved = s.run.flaskT[k];
          s.qa.stepRaw(3);
          const c = s.shop.useFlask(), resumed = s.run.pu[k];
          return { k, a, b, c, saved: +saved.toFixed(2), resumed: +resumed.toFixed(2), left: s.run.flasks[k] };
        });
        return { ok: r.a === 'open' && r.b === 'cork' && r.c === 'resume' && Math.abs(r.saved - r.resumed) < 0.1 && r.saved > 18, detail: JSON.stringify(r) };
      } },
      { name: 'B cycles held flasks; one that wore off drops out of the list', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, first = s.shop.selFlask(), next = s.shop.cycleFlask();
          s.shop.useFlask(); const opened = s.run.flaskOn; s.qa.stepRaw(s.TUNE.powerups.dur + 1);
          return { first, next, opened, held: s.shop.selFlask() ? [s.shop.selFlask()] : [], stillHeld: !!s.run.flaskOn && s.run.pu[s.run.flaskOn] > 0 };
        });
        return { ok: r.first !== r.next && !r.held.includes(r.opened) && !r.stillHeld, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'a corked flask keeps its time through a level change', async run(L) {
        await L.fresh({ god: true });
        await L.S(() => { const s = __scurry; s.run.flasks = { mirror: 1 }; s.run.flaskSel = 0; s.shop.useFlask(); s.qa.stepRaw(4); s.shop.useFlask(); });
        const t0 = await L.S(() => __scurry.run.flaskT.mirror);
        await L.S(() => __scurry.exitRoad());
        await L.sleep(1500);
        const r = await L.S(() => ({ t: __scurry.run.flaskT.mirror, st: __scurry.G.state, name: __scurry.dName() }));
        return { ok: r.st === 'play' && Math.abs(r.t - t0) < 0.05, detail: `${t0.toFixed(1)}s → ${r.t.toFixed(1)}s in ${r.name}` };
      } },
      { name: 'V does nothing while paused', async run(L) {
        const r = await L.S(() => { const s = __scurry; s.run.flasks = { quick: 1 }; s.run.flaskSel = 0; s.G.state = 'paused'; const v = s.shop.useFlask(); s.G.state = 'play'; return { v, left: s.run.flasks.quick }; });
        return { ok: r.v == null && r.left === 1, detail: JSON.stringify(r) };
      } },
      { name: 'in co-op each rat has its own flasks', async run(L) {
        await L.fresh({ god: true, players: 2, padBots: false });
        const r = await L.S(() => { const s = __scurry; s.run.flasks = { iron: 2 }; s.run.flaskSel = 0; return { p1: s.shop.selFlask(), p2: s.asPlayer(1, () => s.shop.selFlask()) }; });
        await L.fresh({ god: true });
        return { ok: r.p1 === 'iron' && r.p2 == null, detail: JSON.stringify(r) };
      } },
      { name: 'touch has Flask and Swap buttons', async run(L) {
        const n = await L.S(() => document.querySelectorAll('[data-b="flask"], [data-b="swap"]').length);
        return { ok: n === 2, detail: `${n} buttons` };
      } },
    ],
    t3: {
      // The same scripted fight with and without a flask uncorked, three or five of each, by median: the rat holds
      // the right stick (aiming and firing) and stands its ground, so the only difference is the flask. (Free
      // bot fights swing 3× either way on who targets whom, and the QA bot ignores mobs that can't hurt it.)
      //  · Iron Hide: a sneak in a zone-4 ring (Cinder Row · After Dark) of mawlings and ticks that attack,
      //    6 s. Damage taken should drop by about TUNE.powerups.ironCut. (Not the tank: its Armor plus the
      //    flask reach the TUNE.balance.minTaken floor, so the flask cuts less for it.)
      //  · Splitclaw: a tank swinging at five brutes that stand still and never strike back, 6 s. Melee
      //    swipes hit ×TUNE.powerups.splitMelee; ranged shots split three ways instead.
      async run(L) {
        const n = L.QUICK ? 3 : 5, med = a => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
        let notOpened = 0;
        const fight = async (cls, k, spawn) => {
          await L.fresh({ cls, level: CITY(4) });
          await clearMobs(L);
          for (let i = 0; i < 40 && !(await L.S(() => __scurry.G.state === 'play')); i++) await L.sleep(100);
          const on = await L.S(([k, spawn]) => {
            const s = __scurry, P = s.P; window.__ring = [];
            if (spawn === 'ring') for (let j = 0; j < 18; j++) { const a = j / 18 * 6.283, r = 2.5 + (j % 2); const e = s.spawnEnemy(j % 3 ? 'mawling' : 'tick', P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, { plain: true, force: true }); if (e) e.emT = 0; }
            else for (let j = 0; j < 5; j++) { const e = s.spawnEnemy('brute', P.x + (j - 2) * 1.6, P.z + 3, { plain: true, force: true }); e.emT = 0; e.spd = 0; e.cd = e.atkCd = 1e9; window.__ring.push([e, e.hp]); }
            s.run.vials = 0; s.P.inv = 0;
            if (!k) return true;
            s.run.flasks = { [k]: 1 }; s.run.flaskSel = 0; s.shop.useFlask();
            return s.puOn(k);
          }, [k, spawn]);
          if (!on) notOpened++;
          // Right stick straight ahead (the camera looks down -z, so stick up is world +z): aim and fire.
          // Damage taken is per second survived: a rat that dies mid-fight would otherwise cap the count at its HP.
          return L.S(() => {
            const s = __scurry, h0 = s.run.dHurt || 0; let t = 0;
            s.fakePads[0] = { axes: [0, 0, 0, 1], buttons: [] };
            while (t < 6 && s.G.state === 'play') { s.qa.stepRaw(0.1); t += 0.1; }
            delete s.fakePads[0];
            return { hurt: Math.round(((s.run.dHurt || 0) - h0) / t), dealt: window.__ring.reduce((a, [e, hp0]) => a + hp0 - (e.dead ? 0 : Math.max(0, e.hp)), 0) };
          });
        };
        const hurt = { plain: [], iron: [] }, dealt = { plain: [], split: [] };
        for (let i = 0; i < n; i++) {
          for (const k of ['plain', 'iron']) hurt[k].push((await fight('sneak', k === 'plain' ? null : k, 'ring')).hurt);
          for (const k of ['plain', 'split']) dealt[k].push(Math.round((await fight('tank', k === 'plain' ? null : k, 'dummies')).dealt));
        }
        L.log(`    fights · hurt per second plain ${hurt.plain} iron ${hurt.iron} · damage dealt plain ${dealt.plain} split ${dealt.split}${notOpened ? ` · ${notOpened} flask(s) failed to open` : ''}`);
        return { ironHurtRatio: med(hurt.iron) / Math.max(1, med(hurt.plain)), splitDmgRatio: med(dealt.split) / Math.max(1, med(dealt.plain)), plainHurt: med(hurt.plain), flasksOpened: notOpened ? 0 : 1 };
      },
      bands: { ironHurtRatio: [0.25, 0.6], splitDmgRatio: [1.4, 2.6], plainHurt: [3, 1e4, 0.5], flasksOpened: [1, 1, 0.5] },
    },
  },

  // ------------------------------------------------------------------ difficulty
  {
    id: 'difficulty', since: 'P4', title: 'Casual / Normal / Insane',
    t1: [
      { name: 'each mode applies its multipliers to enemies, drain, food and gold', async run(L) {
        const bad = [];
        for (const d of ['casual', 'normal', 'insane']) {
          await L.fresh({ difficulty: d, god: true });
          const r = await L.S(d => { const s = __scurry, D = s.TUNE.difficulty[d]; return { D, hpM: s.run.hpM, dmgM: s.run.dmgM, spawnM: s.run.spawnM, drainM: s.run.drainM, foodM: s.run.foodM, gold: s.st.salvage }; }, d);
          for (const [k, want] of [['hpM', r.D.hp], ['dmgM', r.D.dmg], ['spawnM', r.D.spawn], ['drainM', r.D.drain], ['foodM', r.D.food]]) if (Math.abs(r[k] - want) > 1e-6) bad.push(`${d} ${k} ${r[k]} ≠ ${want}`);
          if (Math.abs(r.gold - r.D.gold) > 1e-6) bad.push(`${d} gold ${r.gold}`);
        }
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || 'all three match TUNE.difficulty' };
      } },
      { name: 'the mode is picked in the Nest and saved with the slot', async run(L) {
        await L.resetSaves();
        await L.S(() => { __scurry.pickSlot(1); __scurry.renderMenu(); });
        await L.sleep(200);
        await L.page.click('[data-diff="insane"]');
        const r = await L.S(async () => { const st = await import('/src/core/state.js'); return st.readSlot(1).meta.difficulty; });
        await L.resetSaves();
        return { ok: r === 'insane', detail: r };
      } },
    ],
    t2: [
      { name: 'the health drain follows the mode', async run(L) {
        const rate = {};
        for (const d of ['casual', 'insane', 'normal']) {
          await L.fresh({ difficulty: d });
          await clearMobs(L);
          rate[d] = await L.S(() => { const s = __scurry, h = s.run.hp; s.G.testNoRoles = true; s.qa.stepRaw(10); return (h - s.run.hp) / 10; });
        }
        const c = rate.casual / rate.normal, i = rate.insane / rate.normal;
        return { ok: Math.abs(c - 0.7) < 0.12 && Math.abs(i - 1.4) < 0.2, detail: `casual ×${c.toFixed(2)}, insane ×${i.toFixed(2)}` };
      } },
      { name: 'difficulty stacks with co-op party scaling', async run(L) {
        await L.fresh({ difficulty: 'insane', players: 3, padBots: false, god: true });
        const r = await L.S(() => { const s = __scurry, D = s.TUNE.difficulty.insane, PP = s.TUNE.coop.perPlayer; return { hpM: s.run.hpM, want: D.hp * (1 + 2 * PP.hp) }; });
        await L.fresh({ god: true });
        return { ok: Math.abs(r.hpM - r.want) < 1e-6, detail: JSON.stringify(r) };
      } },
      { name: 'an unknown mode falls back to Normal', async run(L) {
        const r = await L.S(() => { const s = __scurry; s.meta.difficulty = 'nightmare'; s.startRun('tank'); const hp = s.run.hpM; s.meta.difficulty = 'normal'; return hp; });
        return { ok: Math.abs(r - 1) < 1e-6, detail: `hpM ${r}` };
      } },
    ],
    t3: {
      // Per mode: the flask trial's scripted stand-and-fight (a sneak in a zone-4 ring of mawlings and ticks that
      // attack, holding the right stick to fight back, up to 6 s; damage per second survived, median of a few), which folds in each mode's damage,
      // attack speed and enemy HP; plus average bots on the first two levels for whether Normal and Casual are
      // survivable. (Free bot fights swing too much: means of four flipped Insane below Normal between runs.)
      async run(L) {
        const n = L.QUICK ? 3 : 5, med = a => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
        const hurt = {}, deaths = {};
        for (const d of ['casual', 'normal', 'insane']) {
          hurt[d] = [];
          for (let i = 0; i < n; i++) {
            await L.fresh({ cls: 'sneak', level: CITY(4), difficulty: d });
            await clearMobs(L);
            for (let k = 0; k < 40 && !(await L.S(() => __scurry.G.state === 'play')); k++) await L.sleep(100);
            hurt[d].push(await L.S(() => {
              const s = __scurry, P = s.P;
              for (let j = 0; j < 18; j++) { const a = j / 18 * 6.283, r = 2.5 + (j % 2); const e = s.spawnEnemy(j % 3 ? 'mawling' : 'tick', P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, { plain: true, force: true }); if (e) e.emT = 0; }
              s.run.vials = 0; P.inv = 0;
              // Damage per second survived: a rat that dies mid-fight would otherwise cap the count at its HP.
              const h0 = s.run.dHurt || 0; let t = 0;
              s.fakePads[0] = { axes: [0, 0, 0, 1], buttons: [] };
              while (t < 6 && s.G.state === 'play') { s.qa.stepRaw(0.1); t += 0.1; }
              delete s.fakePads[0];
              return Math.round(((s.run.dHurt || 0) - h0) / t);
            }));
          }
        }
        for (const d of ['casual', 'normal']) {
          deaths[d] = 0;
          const runs = [[CITY(0), 'tank'], [CITY(1), 'slinger']];
          for (const [lv, cls] of runs) {
            await L.fresh({ cls, level: lv, quiet: false, difficulty: d });
            deaths[d] += (await L.play(L.QUICK ? 90 : 160, { profile: 'average', goal: 'nests' })).deaths ? 1 / runs.length : 0;
          }
        }
        await L.fresh({});
        L.log(`    fights · hurt per second casual ${hurt.casual} normal ${hurt.normal} insane ${hurt.insane}`);
        const N = Math.max(1, med(hurt.normal));
        return { casualVsNormal: med(hurt.casual) / N, insaneVsNormal: med(hurt.insane) / N, normalHurt: N, normalDeaths: deaths.normal, casualDeaths: deaths.casual };
      },
      bands: { casualVsNormal: [0.35, 0.85], insaneVsNormal: [1.4, 2.8], normalHurt: [3, 1e4, 0.5], normalDeaths: [0, 0.5], casualDeaths: [0, 0.01] },
    },
    ab: { name: 'Insane hits ×1.4 instead of ×1.6', set: { 'difficulty.insane.dmg': 1.4 } },
  },

  // ------------------------------------------------------------------ local co-op
  {
    id: 'coop', since: 'P4', title: 'Local co-op for 2–4 rats',
    t1: [
      { name: '2, 3 and 4 rats start, each with its own HP, class, ring colour and glyph', async run(L) {
        const bad = [];
        for (const n of [2, 3, 4]) {
          await L.fresh({ players: n, padBots: false, god: true });
          const r = await L.S(async () => {
            const s = __scurry, pal = await import('/src/render/palette.js');
            return s.coop.players.map((p, i) => s.asPlayer(i, () => ({ hp: s.run.hp, cls: s.run.cls, glyph: !!(s.G.rat && s.G.rat.glyph), ring: (() => { let c = null; const b = i === 0 ? null : p.blob; if (b) b.traverse(o => { if (o.renderOrder === 20 && o.material) c = o.material.color.getHex(); }); return c; })(), want: pal.PLAYER[i] })));
          });
          if (r.length !== n) bad.push(`${n}p: ${r.length} rats`);
          r.forEach((p, i) => { if (!(p.hp > 0) || !p.glyph) bad.push(`${n}p rat ${i + 1}: ${JSON.stringify(p)}`); if (i > 0 && p.ring !== p.want) bad.push(`${n}p ring ${i + 1}`); });
        }
        return { ok: !bad.length, detail: bad.slice(0, 3).join('; ') || '2, 3 and 4 rats' };
      } },
      { name: 'party scaling matches TUNE.coop.perPlayer (HP and pressure up, damage not)', async run(L) {
        await L.fresh({ players: 4, padBots: false, god: true });
        const r = await L.S(() => { const s = __scurry, PP = s.TUNE.coop.perPlayer; return { hpM: s.run.hpM, dmgM: s.run.dmgM, spawnM: s.run.spawnM, want: { hp: 1 + 3 * PP.hp, dmg: 1 + 3 * PP.dmg, spawn: 1 + 3 * PP.spawn } }; });
        const ok = Math.abs(r.hpM - r.want.hp) < 1e-6 && Math.abs(r.dmgM - r.want.dmg) < 1e-6 && Math.abs(r.spawnM - r.want.spawn) < 1e-6;
        return { ok, detail: JSON.stringify(r) };
      } },
      { name: 'friendly fire is off: a Rot Vial next to player 2 leaves them whole', async run(L) {
        await L.fresh({ players: 2, padBots: false });
        await clearMobs(L);
        const r = await L.S(() => {
          const s = __scurry, P = s.P;
          s.asPlayer(1, () => { s.P.x = P.x + 1; s.P.z = P.z; s.P.inv = 0; });
          const h = s.asPlayer(1, () => s.run.hp);
          s.run.vials = 3; s.throwVial(); s.qa.stepRaw(1.5);
          return { before: Math.round(h), after: Math.round(s.asPlayer(1, () => s.run.hp)) };
        });
        return { ok: r.after >= r.before - 2, detail: JSON.stringify(r) };
      } },
      { name: 'enemies go for the nearest rat', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, P = s.P, x2 = P.x + 30, z2 = P.z;
          s.asPlayer(1, () => { s.P.x = x2; s.P.z = z2; });
          const e = s.spawnEnemy('mawling', x2 + 7, z2, { plain: true, force: true }); e.emT = 0;
          const d0 = Math.hypot(e.x - x2, e.z - z2);
          s.qa.stepRaw(1.5);
          return { d0: +d0.toFixed(1), d1: +Math.hypot(e.x - x2, e.z - z2).toFixed(1) };
        });
        return { ok: r.d1 < r.d0 - 2, detail: `${r.d0} → ${r.d1} from player 2` };
      } },
      { name: 'keys and gold are shared by the party', async run(L) {
        // Player 2 stands 15 away and the key drops at their feet. (The world is stepped outside asPlayer:
        // stepping inside it would run the co-op frame with player 2 swapped in as player 1.)
        const r = await L.S(() => {
          const s = __scurry, k0 = s.run.keys, x = s.P.x + 15, z = s.P.z;
          s.asPlayer(1, () => { s.P.x = x; s.P.z = z; });
          s.dropKey(x, s.P.y, z); s.qa.stepRaw(0.5);
          return { k0, k1: s.run.keys, p2: s.asPlayer(1, () => +Math.hypot(s.P.x - x, s.P.z - z).toFixed(1)) };
        });
        return { ok: r.k1 === r.k0 + 1, detail: JSON.stringify(r) };
      } },
      { name: 'a downed rat is revived by a partner standing next to it', async run(L) {
        await L.fresh({ players: 2, padBots: false });
        await clearMobs(L);
        const r = await L.S(() => {
          const s = __scurry, x = s.P.x + 0.6, z = s.P.z;
          s.asPlayer(1, () => { s.P.x = x; s.P.z = z; s.run.hp = 0; s.die(); });
          const down = s.asPlayer(1, () => !!s.P.downed);
          for (let i = 0; i < 40 && s.asPlayer(1, () => s.P.downed); i++) { s.asPlayer(1, () => { s.P.x = x; s.P.z = z; }); s.qa.stepRaw(0.1); }
          return { down, up: !s.asPlayer(1, () => s.P.downed), state: s.G.state, downs: s.run.downs };
        });
        return { ok: r.down && r.up && r.state === 'play' && r.downs === 1, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'the touch stick drives player 1 only', async run(L) {
        await L.fresh({ players: 2, padBots: false, god: true });
        await clearMobs(L);
        const r = await L.S(async () => {
          const s = __scurry, pl = await import('/src/entities/player.js'), p2 = () => s.asPlayer(1, () => [s.P.x, s.P.z]), a = p2();
          pl.stick.active = true; pl.stick.x = 1; pl.stick.y = 0;
          s.qa.stepRaw(1);
          pl.stick.active = false; pl.stick.x = 0;
          const b = p2();
          return +Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2);
        });
        return { ok: r < 0.3, detail: `player 2 moved ${r}` };
      } },
      { name: 'a level change brings every rat along and stands the downed back up', async run(L) {
        await L.fresh({ players: 3, padBots: false });
        await clearMobs(L);
        await L.S(() => { const s = __scurry; s.asPlayer(2, () => { s.run.hp = 0; s.die(); }); });
        await L.S(() => __scurry.exitRoad());
        await L.sleep(1500);
        await L.S(() => __scurry.qa.stepRaw(0.2));
        const r = await L.S(() => { const s = __scurry; return { st: s.G.state, name: s.dName(), rats: [1, 2].map(i => s.asPlayer(i, () => ({ d: +Math.hypot(s.P.x - s.coop.players[0].P.x, s.P.z - s.coop.players[0].P.z).toFixed(1), down: !!s.P.downed }))) }; });
        return { ok: r.st === 'play' && r.rats.every(p => p.d < 4 && !p.down), detail: JSON.stringify(r) };
      } },
      { name: 'four rats through 30 s of bot play: nobody lost, out of frame or broken', async run(L) {
        await L.fresh({ players: 4, level: CITY(1), quiet: false });
        const r = await L.play(L.QUICK ? 30 : 60, { profile: 'average', goal: 'nests' });
        const spread = await L.S(() => { const s = __scurry, ps = s.coop.players.map((p, i) => s.asPlayer(i, () => [s.P.x, s.P.z])); return Math.max(...ps.map(a => Math.hypot(a[0] - ps[0][0], a[1] - ps[0][1]))); });
        const bad = r.anomalies.filter(k => /nan|fell|inside/.test(k));
        return { ok: !bad.length && spread <= 24, score: Math.max(0, 1 - bad.length * 0.25 - (spread > 24 ? 0.5 : 0)), detail: `${bad.join(', ') || 'clean'}; widest spread ${spread.toFixed(1)}` };
      } },
      { name: 'going back to one rat cleans up the co-op rats', async run(L) {
        await L.fresh({ players: 4, padBots: false, god: true });
        await L.fresh({ god: true });
        const r = await L.S(() => { const s = __scurry; let glyphs = 0; s.scene.traverse(o => { if (o.isSprite && o.renderOrder === 21) glyphs++; }); return { on: s.coop.on, n: s.coop.players.length, glyphs }; });
        return { ok: !r.on && r.glyphs <= 1, detail: JSON.stringify(r) };
      } },
    ],
    t3: {
      // The QA bot as player 1 with pad-bot partners (Neon Market, plus Rust Yards in the full lab), 1, 2 and
      // 4 rats: the challenge per rat
      // should hold (damage taken per rat per minute) and nobody should spend the level on the floor.
      // The pad bots don't dodge, use specials or throw vials, so the partners' own downs weigh half, and
      // kills4v1 is reported but not scored: they deal roughly half the QA bot's damage, so with enemy HP ×2.8
      // for four rats the clear rate says more about the partners than about the scaling.
      async run(L) {
        const res = {};
        for (const n of [1, 2, 4]) {
          let hurt = 0, kills = 0, downs = 0, mins = 0;
          for (const lv of L.QUICK ? [CITY(1)] : [CITY(1), CITY(2)]) {
            await L.fresh({ players: n, level: lv, quiet: false });
            const r = await L.play(L.QUICK ? 90 : 140, { profile: 'average', goal: 'nests' });
            hurt += r.dmgTaken; kills += r.kills; downs += r.downs || 0; mins += Math.max(0.25, r.simTime / 60);
          }
          res[n] = { hurtPerRat: hurt / n / mins, killsPerMin: kills / mins, downsPerMin: downs / mins };
        }
        await L.fresh({});
        return { hurtPerRat4v1: res[4].hurtPerRat / Math.max(1, res[1].hurtPerRat), kills4v1: res[4].killsPerMin / Math.max(1, res[1].killsPerMin), downsPerMin4: res[4].downsPerMin };
      },
      bands: { hurtPerRat4v1: [0.5, 1.6], downsPerMin4: [0, 1.5, 0.5], kills4v1: [1.2, 3.5, 0] },
    },
    ab: { name: 'gentler party HP scaling (+40% a rat)', set: { 'coop.perPlayer.hp': 0.4 } },
  },

  // ------------------------------------------------------------------ single-player gamepad
  {
    id: 'gamepad', since: 'P4', title: 'Gamepad in single player',
    t1: [
      { name: 'the left stick moves the rat; a small tilt inside the deadzone doesn’t', async run(L) {
        await L.fresh({ god: true });
        await clearMobs(L);
        const r = await L.S(() => {
          const s = __scurry, P = s.P, at = [P.x, P.z];
          s.fakePads[0] = { axes: [0.2, 0, 0, 0], buttons: [] }; s.qa.stepRaw(0.8);
          const small = Math.hypot(P.x - at[0], P.z - at[1]);
          s.fakePads[0].axes = [0, -1, 0, 0]; s.qa.stepRaw(0.8);
          const full = Math.hypot(P.x - at[0], P.z - at[1]) - small;
          s.fakePads[0].axes = [0, 0, 0, 0]; s.qa.stepRaw(0.1);
          return { small: +small.toFixed(2), full: +full.toFixed(2) };
        });
        return { ok: r.small < 0.2 && r.full > 2, detail: JSON.stringify(r) };
      } },
      { name: 'A jumps, the right stick fires, the d-pad uncorks and switches flasks', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, P = s.P, pad = s.fakePads[0], b = i => { pad.buttons = []; pad.buttons[i] = { pressed: true }; }, none = () => { pad.buttons = []; };
          b(0); s.qa.stepRaw(0.1); const jumped = P.y > 0.3 || P.vy > 0; none(); s.qa.stepRaw(1);
          const n0 = s.W.pproj.length + (s.run.dmg || 0); s.run.primT = 0; pad.axes = [0, 0, 1, 0]; s.qa.stepRaw(0.4); pad.axes = [0, 0, 0, 0];
          const fired = s.W.pproj.length + (s.run.dmg || 0) > n0 || s.P.swing > 0 || s.run.primT > 0;
          s.run.flasks = { iron: 1, quick: 1 }; s.run.flaskSel = 0; const sel0 = s.shop.selFlask();
          b(13); s.qa.stepRaw(0.1); none(); s.qa.stepRaw(0.1); const sel1 = s.shop.selFlask();
          b(12); s.qa.stepRaw(0.1); none(); s.qa.stepRaw(0.1);
          return { jumped, fired, sel0, sel1, on: s.puOn(sel1) };
        });
        return { ok: r.jumped && r.fired && r.sel0 !== r.sel1 && r.on, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'unplugging the pad mid-push releases what it held (no runaway rat)', async run(L) {
        const r = await L.S(() => {
          const s = __scurry, P = s.P;
          s.fakePads[0] = { axes: [0, -1, 0, 0], buttons: [] }; s.qa.stepRaw(0.4);
          delete s.fakePads[0]; s.qa.stepRaw(0.3);
          const at = [P.x, P.z]; s.qa.stepRaw(1);
          return +Math.hypot(P.x - at[0], P.z - at[1]).toFixed(2);
        });
        return { ok: r < 0.3, detail: `drifted ${r} after unplugging` };
      } },
      { name: 'the keyboard still works with a pad connected', async run(L) {
        await L.S(() => { __scurry.fakePads[0] = { axes: [0, 0, 0, 0], buttons: [] }; });
        const a = await L.S(() => [__scurry.P.x, __scurry.P.z]);
        await L.page.keyboard.down('KeyD');
        await L.S(() => __scurry.qa.stepRaw(0.6));
        await L.page.keyboard.up('KeyD');
        const b = await L.S(() => { const p = [__scurry.P.x, __scurry.P.z]; delete __scurry.fakePads[0]; return p; });
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return { ok: d > 1, detail: `moved ${d.toFixed(2)}` };
      } },
    ],
  },

  // ------------------------------------------------------------------ art pass: can you find yourself?
  {
    id: 'art', since: 'P4', title: 'Readability: player colours reserved, rings and glyphs, find yourself in a horde',
    t1: [
      { name: 'no enemy body or glow uses a player hue', async run(L) {
        // Every pooled mob model (body + glow vertex colours, after the enemy grade) against the four player hues,
        // compared as seen on screen: vertex colours are linear, so they go to sRGB first.
        const r = await L.S(async () => {
          const pal = await import('/src/render/palette.js'), pools = await import('/src/render/pools.js');
          const hsl = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return { h: 0, s: 0, l }; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l }; };
          const srgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
          const hues = pal.PLAYER.map(h => hsl((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255).h);
          let checked = 0, hits = 0; const where = new Set();
          for (const [k, im] of [...Object.entries(pools.IMB), ...Object.entries(pools.IMG)]) {
            const a = im.geometry.attributes.color;
            if (!a) continue;
            for (let i = 0; i < a.count; i++) {
              const c = hsl(srgb(a.getX(i)), srgb(a.getY(i)), srgb(a.getZ(i)));
              checked++;
              if (c.s < 0.5 || c.l < 0.25 || c.l > 0.85) continue;
              if (hues.some(p => Math.min(Math.abs(c.h - p), 360 - Math.abs(c.h - p)) < 12)) { hits++; where.add(k); }
            }
          }
          return { checked, hits, where: [...where].slice(0, 4), pools: Object.keys(pools.IMB).length };
        });
        return { ok: r.checked > 1000 && r.hits === 0, detail: `${r.pools} mob models, ${r.checked} vertex colours, ${r.hits} in a player hue ${r.where.join(' ')}` };
      } },
      { name: 'rings draw on top in each player’s colour; heroes are 1.25× scale', async run(L) {
        await L.fresh({ players: 4, padBots: false, god: true });
        const r = await L.S(() => {
          const s = __scurry; const rings = [];
          s.scene.traverse(o => { if (o.renderOrder === 20 && o.material && o.material.depthTest === false) rings.push(o.material.color.getHex()); });
          return { rings: [...new Set(rings)].length, scale: s.TUNE.art.heroScale, bulk: s.G.rat && s.G.rat.bulk };
        });
        await L.fresh({ god: true });
        return { ok: r.rings >= 4 && r.scale === 1.25, detail: JSON.stringify(r) };
      } },
    ],
    t2: [
      { name: 'mob outlines switch off past the on-screen cap, and come back', async run(L) {
        await L.fresh({ god: true });
        await clearMobs(L);
        const r = await L.S(async () => {
          const s = __scurry, pools = await import('/src/render/pools.js'), cap = s.TUNE.art.outlineMaxMobs, P = s.P;
          const vis = () => Object.values(pools.IMO).some(m => m.visible && m.count > 0);
          for (let i = 0; i < cap + 20; i++) { const a = i * 2.4, r = 3 + (i % 9); const e = s.spawnEnemy('mawling', P.x + Math.sin(a) * r, P.z + Math.cos(a) * r, { plain: true, force: true }); if (e) { e.emT = 0; e.spd = 0; } }
          s.sync(1 / 30); const over = vis();
          s.W.enemies.forEach(e => { if (e.type !== 'nest') e.dead = true; }); s.qa.stepRaw(0.1);
          for (let i = 0; i < 20; i++) { const e = s.spawnEnemy('mawling', P.x + 4 + i % 5, P.z + (i / 5 | 0), { plain: true, force: true }); if (e) e.emT = 0; }
          s.qa.stepRaw(0.05); s.sync(1 / 30); const under = vis();
          return { over, under };
        });
        return { ok: !r.over && r.under, detail: JSON.stringify(r) };
      } },
    ],
    t3: {
      // The art review's bar: find yourself at a glance in a horde. A 320 px wide shot of the rat in a
      // 120-mob crowd: pixels in player 1's red near the rat (the ring and glyph) against red pixels
      // anywhere else (which would be enemies or effects stealing the colour).
      async run(L) {
        await L.fresh({ god: true });
        await clearMobs(L);
        await horde(L, 120);
        // No i-frames: the rat (and its glyph) blink while P.inv > 0, which would hide them from the shot.
        await L.S(() => { const s = __scurry; s.W.enemies.forEach(e => { e.spd = 0; e.cd = 99; }); s.P.inv = 0; });
        await L.sleep(1200);
        await L.S(() => { __scurry.P.inv = 0; });
        // Only the 3D view counts: the DOM HUD (P1's red panel and bars) and callouts are hidden for the shot.
        await L.S(() => { window.__hid = [...document.body.children].filter(e => e.id !== 'c' && e.tagName !== 'SCRIPT'); window.__hid.forEach(e => { e.dataset.vis = e.style.visibility; e.style.visibility = 'hidden'; }); });
        await L.sleep(100);
        const shot = (await L.page.screenshot({ type: 'png' })).toString('base64');
        await L.S(() => { window.__hid.forEach(e => { e.style.visibility = e.dataset.vis || ''; }); });
        const r = await L.S(async ([b64]) => {
          const s = __scurry, rr = await import('/src/render/renderer.js');
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const W = 320, H = Math.round(img.height * W / img.width), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const x = cv.getContext('2d'); x.drawImage(img, 0, 0, W, H);
          const d = x.getImageData(0, 0, W, H).data;
          const v = { x: s.P.x, y: s.P.y + 0.6, z: s.P.z }, cam = rr.camera;
          const THREE = cam.position.constructor;
          const p = new THREE(v.x, v.y, v.z).project(cam), cx = (p.x * 0.5 + 0.5) * W, cy = (-p.y * 0.5 + 0.5) * H;
          // Player red (and its shaded tones) has red ≥ 3× green; Hazard Orange enemy glows sit near 2×.
          const isRed = (r, g, b) => r > 120 && r > g * 3 && r > b * 3;
          let near = 0, far = 0;
          const rad = W * 0.06;
          for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
            const i = (y * W + x2) * 4;
            if (!isRed(d[i], d[i + 1], d[i + 2])) continue;
            if (Math.hypot(x2 - cx, y - cy) < rad) near++; else far++;
          }
          return { near, far, cx: Math.round(cx), cy: Math.round(cy) };
        }, [shot]);
        return { heroPixels: r.near, precision: r.near / Math.max(1, r.near + r.far) };
      },
      bands: { heroPixels: [8, 600], precision: [0.75, 1, 2] },
    },
    ab: { name: 'thinner ring (0.10)', set: { 'art.ringW': 0.1 } },
  },
];
