# Scurry

A rat roguelike in the browser: an open-world neighbourhood crawling with hordes on the surface, and a darker, meaner sewer below. Three.js, WebAudio, no assets. Everything (textures, models, music) is generated in code.

This is the production build of the **Scurry v5** design from Claude Design, plus the unfinished v6 overhaul from the design chat, now completed. The original prototypes and transcript are kept for reference in `project/` and `chats/`.

## Play it

**On GitHub Pages:** https://tayhastings1999-bot.github.io/Rat-Game/ (rebuilt automatically on every push to `main`).

Also hosted on claude.ai: https://claude.ai/artifact/Jfhgbb7RbS6iHANvSRPUoD (private to the owner until shared from the page's Share menu). Click a rat to start. Keyboard and mouse on desktop; on a phone or tablet, on-screen controls appear automatically (landscape works best).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (open with `npm run preview`, not file://)
npm run lint
npm run smoke      # headless end-to-end test (needs Chromium; see below)
npm run artifact   # build + package dist/artifact.html for hosting as a claude.ai Artifact
```

`npm run smoke` drives a real browser through the whole loop with zero tolerance for console errors. It covers the menu, a city run, interactions (chests, workbench, gnawing boards, climbing, power lines, key and manhole), corrupted elites, every boss through all three phases, the sewer and ladder, pause and map, death, the Nest, the new classes, a Ghost Trial finish, a horde soak, and a phone-sized touch session. It uses `/opt/pw-browsers/chromium` by default; set `CHROMIUM=/path/to/chrome` to override. Screenshots land in `scripts/out/`. Headless Chromium runs the game at roughly half speed, so waits in the script are generous.

Add `?debug` to the URL (or run the dev server) to get `window.__scurry` for poking at state.

## What's in the game

**Structure.** Each run starts in a procedural city district: a jittered street grid with sidewalks, alleys, buildings of different roof heights, parks, hedged yards, parking lots, cars, street lamps, neon, rooftop clutter and power lines between roofs. Smash the nests or outlast the timer to wake the district boss. Killing it opens a road to the next neighbourhood and drops a **sewer key**.

**The sewer (high-risk expansion).** Spend a key on the district's manhole to descend. Keys also drop from corrupted elites, and the Nest sells a starting key. Sewer layers are the six v5 districts (Undersewer → Rat King's Court). They have toxic water, zero-visibility pockets, mutated mobs (+50% HP, +25% damage, more elites), premium chests and cursed chests, and a big threat jump on entry. Beat the sewer boss and climb the ladder to the next surface district.

**Threat engine.** A volatile index that rises with time, depth, level, loot, cursed items and every decision (level-up picks, workbench installs, chests, mutations, entering the sewer). It spikes on kills and oscillates on its own. It scales enemy HP, damage, speed, attack rate, spawn rate, horde surges and elite odds.

**Pacing.** Mob types join the horde on a schedule (mawlings first, then roaches, bats, crows… shades last), each announced with a banner and fading in over a minute. Spawns ramp up with run time and threat, and every surge is followed by a short lull.

**Hidden places.** Cracked walls that look like plain brick hide secret passages (sniff with F to spot them; gnaw with E). Behind them: courtyards and pockets with premium loot, and each district's hidden **lair**, where a mini-boss (Alley Tom, Scrap Brute, Crow Matriarch, Bloated Queen, Ghoul Lord, Tick Hive) guards a premium hoard. Dead-end alleys always hold loot; fire escapes give a stamina-free way onto the roofs.

**Enemies.** Twelve types, each with several telegraphed attacks chosen by distance and sometimes by your HP. Flyers move erratically: bats weave on sine waves, screech and dive-bomb; crows orbit, reverse direction, swoop and fire feather volleys; moths drift in lissajous paths, drop poison clouds and blink; wasps dart. Big patrol cats hunt in packs. **Corrupted elites** have double HP plus a modifier: Burning (fire trail), Warding (shields allies), Frenzied, Brood-bloated (splits), Leeching or Volatile (explodes on death). They drop cores that give an item and salvage.

**Swarm combo.** Hits and kills fill a combo meter that drains fast and empties when you get hurt. Fill it to unlock the **territorial shriek** (X): eight nest-mates pour in for 10 seconds, biting everything nearby, staggering any boss within earshot and chewing through barricades. In a fight the controls hint and minimap fade out, and the boss bar only appears once you enter its arena.

**Bosses.** Six, each with three phases (at 66% and 33% HP) that add attacks and speed, plus erratic movement:

| Boss | Where | Signature |
|---|---|---|
| The Horned Tabby | Cinder Row | chained pounces, hairball fans, swipe combos, slowing roar |
| The Murder King | Neon Market, Hollow Heights | erratic flight, feather storms, crow flocks, dive-bomb chains, tornado spiral |
| The Exterminator | Rust Yards | poison spray, snap traps, missiles, machine gun, flamethrower, fumigation |
| The Many-Mouthed | sewer | chained charges, spit fans, burrow ambush, spiral |
| The Brood Mother | sewer | tick broods, web rings, hatching egg lobs, leaps, acid rain |
| The Rat King | sewer | ricocheting rolls, tail-whip rings, rat fans, vortex pull, prince adds |

**Builds.**
- *Mutations.* Mundane ingredient items fuse in pairs into ten synergies, such as Rusty Razor + Energy Drink → Livewire Claws, Lighter + Energy Drink → Napalm Trail, and Rubber Band + Fish Hook → Slingshot Recoil. Loot favours the partner of a half-finished recipe.
- *Cursed loot.* Six items with big upsides and permanent downsides, such as Rabid Bite: double damage, but you bleed out unless you keep hitting things.
- *Bonk physics.* Knocked-back mobs smash into each other and take fall damage off rooftops.

**Meta (the Nest).** On death, unspent salvage plus a quarter of what you spent is banked. At the Nest you buy permanent upgrades (HP, salvage, stamina, pickup reach, level-up rerolls, starting weapon, spare key) and hire rats.

**Classes.** Melee rats (Gutter Brawler, Sewer Rat) lunge into range, heal a little on every hit, take 20% less damage from bites and build **Bloodlust** (faster attacks and movement) from kills. Gutter Brawler, Plaguebearer, Sewer Slinger, Rat Warlock, and two new ones: the **Sewer Rat** (tank: Gnash plus a reflecting Bulwark) and the **Roof Rat** (nimble: double jump, Needle Darts, Updraft glide).

**Music.** A procedural soundtrack: a distorted boom-bap drum loop with stuttering trap hi-hat rolls and a discordant phrygian/tritone synth bass. Tempo and density climb from exploring (132 BPM) to crowded fights (148) to bosses (166, with a siren lead). Music and effects have separate volume sliders.

## Controls

WASD move · Space jump / hold on walls to climb · Shift tap to roll (i-frames), hold to sprint · C squeeze · Q special · X shriek (full combo) · E use / grab / hold to gnaw · R lock-on · F scent trails · M map · mouse look (V toggles) · wheel zoom · Esc pause.

**Touch:** left stick moves, drag anywhere else to orbit the camera. Jump (hold on walls to climb), Roll (hold to sprint), Special, Use (hold to gnaw), Shriek (when the combo is full), Lock and Sniff sit on the right; Map and Pause at the top. Attacks aim themselves, so that's the whole game.

## Code map

```
src/
  main.js            boot + frame loop
  core/              util (math, RNG, storage) and shared state singletons
  render/            renderer + pixel post shader, procedural textures, creature models, instancing pools
  data/              classes, enemies/bosses/districts/modifiers, items/mutations/cursed/augments/Nest/corruptions, props
  world/             tile grid + collision, sewer and city generators, mesh builder + population
  entities/          player, rat model/portraits, mobs (AI + spawning), bosses
  combat/            damage/deaths/drops/threat, weapons & specials, hazards (telegraphs, puddles)
  game/              run flow (districts, sewer, banking), loot, update step, render sync + camera, input
  audio/             SFX + music sequencer
  ui/                HUD, screens (menu, Nest, pause, level-up, bench, endings), icons
scripts/smoke.mjs    headless end-to-end test
```

Game state lives in a few mutable singletons (`G`, `P`, `W`, `run`, `st`, `meta` in `core/state.js`) that modules import and mutate in place. Saves go to `localStorage` under `scurry.*`. Ghost Trial codes and leaderboards keep the `scurry4.*` keys so existing ghosts still load.

## Known gaps

- Touch controls are tuned for landscape phones and tablets; portrait works but is cramped.
- Ghost Trial sharing is still copy-paste codes. There's no online leaderboard.
- Balance (threat curve, boss HP, drop rates) comes from design intent and automated runs, not playtesting.
