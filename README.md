# Scurry

A rat brawler in the browser, being rebuilt around arcade dungeon-crawler mechanics: hordes pouring out of nests on the surface, and a darker, meaner sewer below. Three.js, WebAudio, no assets. Everything (textures, models, music) is generated in code.

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

`npm run smoke` drives a real browser through the whole loop with zero tolerance for console errors. It covers the menu, a city run, XP and automatic level-ups, interactions (chests, gnawing boards, climbing, power lines, bins, key and manhole), corrupted elites, every boss through all three phases, the sewer and ladder, pause and map, death and gold banking, every class, a horde soak, and a phone-sized touch session. It uses `/opt/pw-browsers/chromium` by default; set `CHROMIUM=/path/to/chrome` to override. Screenshots land in `scripts/out/`. Headless Chromium runs the game at roughly half speed, so waits in the script are generous.

Add `?debug` to the URL (or run the dev server) to get `window.__scurry` for poking at state and the **Tune** panel for live-editing `src/tuning.js`.

## What's in the game

**Rebuild in progress.** Scurry is being rebuilt into a single-player dungeon brawler: a walkable hub, two realms of zones, a fixed camera, direct aim combat, constant health drain, generators (nests) that pour out one enemy family each, keys and treasure, and persistent heroes from level 1 to 99. The work lands in phases. **Phase 1** cut the roguelite layer (the threat engine, level-up picks, weapons and tomes, rule breakers, mutations, cursed loot, the Nest shop, the Daily Run, contracts, the shriek, stamina, the light meter and the road choice). **Phase 2 (this build)** added the combat core: a fixed camera that sees through walls, four class stats, the turbo meter and moves, Rot Vials, constant health drain with three sizes of food (some of it moldy, all of it breakable), tiered nests that each raise one enemy family, the Reaper, thieves and a low-health announcer. A follow-up pass added **22 fixed levels** (night and deep-sewer remixes with boss variants, and three secret zones), sleeping enemy packs, Reaper graves, thieves that take keys, a gentler first zone, a line-of-fire warning on food and per-class turbo visuals. **Phase 3 (this build)** adds levels and loot: climbing only at marked drainpipes and fire escapes (with rooftop caches), 3–6 secrets per level with a HUD counter and sniff pings, stacking keys that open locked gates and padlocked chests, eight 25-second power-ups, stat growth on every level-up and an exit tally with a grade; it also fixes collapsing floors, wading depth and things spawning inside props. Later phases add the hub, save slots, the shop and the new progression.

**Structure.** A run is a chain of city levels: a jittered street grid with sidewalks, alleys, buildings of different roof heights, parks, yards, parking lots, cars, street lamps, neon, rooftop clutter and power lines between roofs. **Smash every nest to wake the level's boss.** Killing it opens a single road to the next level and drops a **key**.

**22 levels.** Every level has a fixed seed (`src/data/levels.js`), so it has the same layout every time, and its own hazard, enemy families and boss. After the list runs out the run loops with a numeral (Cinder Row II) and fresh seeds.

| Realm | Levels |
|---|---|
| City (8) | Cinder Row, Neon Market, Rust Yards, Hollow Heights, then the same streets after dark: *Cinder Row · After Dark*, *Neon Market · Last Call*, *Rust Yards · Nightshift*, *Hollow Heights · Moonrise* |
| Sewer (11) | The Undersewer, Flooded Cisterns, Butcher's Drain, Frozen Pipeworks, Toxic Refinery, **Rat King's Court**, then the deep sewer: *The Deep Undersewer*, *Undertow*, *Bloodworks*, *Black Ice*, *Meltdown* |
| Secret (3) | The Cheese Vault, The Rat Run, The Bone Garden |

The remixes are new layouts under moonlight or deeper dark, with a different family mix and hazard, and a **boss variant**: *Unleashed* (faster, attacks 1.35× as often), *in Iron* (takes 0.8× damage, 1.15× HP) or *and Brood* (calls its families in when it wakes and at every phase). `TUNE.bossVariants`.

**Secret zones.** Hollow Heights, Rust Yards · Nightshift and Frozen Pipeworks each hide a violet-ringed drain in a hidden courtyard or lair behind a cracked wall (sniff with F to find the wall). Drop in and you leave the level, skipping its boss, for a bonus zone, then come out at the next level:
- *The Cheese Vault*: 60 seconds among premium chests, caches and Rot Vials; the exit is open from the start.
- *The Rat Run*: 45 seconds of gold piled down every street, with thieves coming for it.
- *The Bone Garden*: six Warrens, one from each family; smash them all and a hoard of premium chests appears with the way out.

**The sewer.** Spend a key on a city level's manhole to descend. Each trip takes you to the next sewer level, with toxic water, zero-visibility pockets, mutated mobs (+50% HP, +25% damage, more elites) and premium and cursed chests. Beat the sewer boss and climb the ladder to the next surface district.

**Difficulty by zone.** Enemy strength comes from a per-zone table instead of the old threat engine: each zone has a difficulty index (`zone.threatPerZone` × zone number) that scales enemy HP, damage, speed, attack rate and elite odds. All of it lives in `src/tuning.js`.

**Nests and packs.** Nests are where the horde comes from. Between the start and the nests, each level also places **sleeping packs**: 6 groups (plus half a pack per zone, up to 12) of 4 or more mobs from the level's families, always in the same rooms. A pack stays still until you come within 12 or hurt one of it, then all of it wakes. Street spawns (`nests.ambient`) and horde surges (`nests.surges`) are off by default. Each nest raises one **family**, and zones list which families they draw from:

| Family | Litter Pile | Burrow | Warren |
|---|---|---|---|
| Vermin | roaches | ticks | mawlings |
| Wings | bats | wasps | crows |
| Rot | gob spitters | ghouls | bloats |
| Prowlers | feral cats | shades | moths |
| Guards | lidbearers | rot priests | brutes |

A **Litter Pile** (160 HP) spawns slowly and keeps 6 children; a **Burrow** (320) is faster and keeps 10; a **Warren** (560) spawns every ~2s and keeps 14. Damage knocks a nest down a tier as its HP falls (a half-smashed Warren is a Burrow), and each nest sometimes raises its family's weaker member. Later zones have more nests, more Warrens and more HP; no Warrens appear before the third zone. A type's first appearance gets a banner. At most 200 enemies are alive at once.

**Leveling.** Kills pay XP straight into your bar (nests 15/25/40 by tier, rivals 40, bosses 220). Level-ups are automatic: a banner, a shockwave that shoves the horde back and a small heal. There are no picks. Every level also **grows your stats**: 0.45 stat points split across Strength, Speed, Armor and Magic in proportion to your class's own stats (a Brawler grows mostly Strength and Armor), plus 4 max HP, healed at once (`TUNE.growth`). XP to the next level is `base + lin·(L−1) + mul·(L−1)^exp`, capped at level 99.

**Gold.** Chests, bins, bounties and kills drop **gold** (the old salvage). Chests are free to open. Gold you carry is banked when the run ends and shows on the menu; the shop that spends it arrives in Phase 4.

**Secrets.** Every level counts **3–6 secrets** (a fixed number per level), shown on the HUD as **SECRETS n/m**:
- *Cracked walls* that look like plain brick (sniff with F to spot them; gnaw with E). Behind them: courtyards and pockets with loot and a power-up, and each district's hidden **lair**, where a mini-boss (Alley Tom, Scrap Brute, Crow Matriarch, Bloated Queen, Ghoul Lord, Tick Hive) guards a hoard.
- *Squeeze rooms*: the chamber in the middle of a crawlspace network.
- *Rooftop caches* at the top of a marked drainpipe.

Reaching one pays 60 XP and gold. **Sniffing (F) pings**: every unfound secret within 40 flashes a violet marker for 6 seconds, and the two-note ping rises in pitch the closer the nearest one is (`TUNE.secrets`).

**Climbing.** Only **marked drainpipes** (yellow bands, a paw mark at the foot) can be climbed: stand at one and hold Space. Fire escapes are stairs you hop up. City levels have about 13 pipes and sewer levels 4–5, each with a cache waiting at the top; any rooftop chest or cache gets a pipe up its building, and the rooftop "hold the beacon" job only uses roofs you can reach (`TUNE.climb`).

**Keys and locks.** Keys **stack** (the HUD shows how many you hold). They drop from bosses (always), mini-bosses, corrupted elites, smashed nests, chests and the odd bin. Spend one on: a **locked gate** (one per level, across a dead-end vault holding a premium chest, a power-up and a cache), a **padlocked chest** (two per level: half again a premium chest's gold and always a power-up) or the manhole. Thieves still go for your keys first (`TUNE.keys`).

**Power-ups.** Glowing tokens, two on the street per level, more in vaults, padlocked and premium chests and behind cracked walls. Each lasts **25 seconds** and they can overlap; the HUD shows each with a draining bar (`TUNE.powerups`):

| Power-up | Effect |
|---|---|
| Scent Veil | Mobs more than 5 away lose your scent and mill about |
| Iron Hide | 60% less damage taken |
| Quickpaw | Move 35% and attack 30% faster |
| Splitclaw | Shots split three ways; swipes hit 1.8× as hard |
| Mirror Shell | Enemy shots bounce back off you at 1.5× damage |
| Glow Eyes | See hidden lurkers, moldy food, secret walls and nearby secrets |
| Ember Breath | Your attacks set enemies burning |
| Moth Familiar | A moth circles you and zaps the nearest enemy every 0.7s |

**Collapsing floors.** On the collapse levels (Rust Yards · Nightshift, Frozen Pipeworks) about 3.5% of open floor is cracked, never in a corridor. Step on a crack and it glows red and rattles for 0.9s, then drops into a hole for 8s before it knits back; anything in it falls (mobs die, bosses climb out). If you fall you come back up where you last stood safely, for 12 HP (`TUNE.hazards`).

**Exit tally.** Leaving a level (the road, the ladder, the manhole or a secret drain) stops on a card: nests smashed (30 points), the boss (15), the side job (10), secrets found (20), damage taken (15) and time (10, full at 4 minutes or less) add up to a score out of 100 and a grade, **S** (90+), **A** (75), **B** (60), **C** (40) or **D**, which pays 60 / 40 / 20 / 10 / 0 gold. Grades feed the run score and the share card (`TUNE.tally`).

**Enemies.** Twelve types, each with several telegraphed attacks chosen by distance and sometimes by your HP. Flyers move erratically: bats weave, screech and dive-bomb; crows orbit, swoop and fire feather volleys; moths drift, drop poison clouds and blink; wasps dart. Big patrol cats hunt in packs. **Corrupted elites** have double HP plus a modifier: Burning (fire trail), Warding (shields allies), Frenzied, Brood-bloated (splits), Leeching or Volatile (explodes on death).

**Combo.** Hits and kills fill a combo meter that drains fast and empties when you get hurt. In a fight the controls hint and minimap fade out, and the boss bar only appears once you enter its arena.

**Fungal foraging.** Mushrooms and molds grow against walls (far more in the sewer), shown as green dots on the minimap. Walk over one for a 10-second buff: Puffcap (+35% speed), Glowcap (+25% crit), Sporecap (toxic spore cloud), Iron Mold (−40% damage taken), Blood Mold (5 HP/s regen) or Slime Mold (faster climbing).

**Scent (F).** Sniffing drains the world to grey and lights up what your nose picks up: trails to the exit, keys and loot; predator **view cones** (magenta while patrolling, red once they're hunting you); **fresh footprints** left by predators, elites, mini-bosses and bosses; and pulsing rings on **gnaw points** (boards, hollow walls, ropes, live wires, traps, bins). Scent runs on an 8-second gauge that refills while your nose rests.

**Physics traps.** Gnaw (hold E) a structural weak point and let the world do the fighting:
- *Frayed cable* over water. It drops in and electrifies the water for ~9s: heavy damage and stuns to anything standing in it, including you.
- *Scaffolding* against tall walls. Climbable, but gnaw its pegs and it collapses on what's below.
- *Brick pallet* on a rooftop jib, with a ring on the ground where it'll land.
- The sewer's rope-hung paint cans.

Bosses take a capped share of trap damage (5% of max HP from a crush) plus a stagger.

**Squeeze Network.** Crawlspaces carved through building blocks link two streets whose walk-around is much longer than the crawl. Walk into the dark slots at the foot of a wall and you squeeze automatically; the camera cuts the buildings away so you can see the maze. Nothing on the streets can follow you, but *exposed live wires* arc every few seconds and *rival nests* in side chambers spit at you (clearing one pays gold and XP). Other chambers hold a cheese cache.

**Bosses.** Six, each with three phases (at 66% and 33% HP) that add attacks and speed. Every boss has a **brain** that learns your preferred range, circling direction and dodge side, leads its attacks with a real intercept, and counters your style (gap-closers against kiters, shoves against huggers). Attacks spend from an aggression budget: overextend and it's **EXPOSED** (+25% damage taken); burst about 6% of its max HP quickly and it **STAGGERs** for 1.6s. Melee rats can swat flying bosses up to `combat.meleeFlyReach` above them.

| Boss | Where | Signature |
|---|---|---|
| The Horned Tabby | Cinder Row | cut-off circling, chained predictive pounces, feints, rooftop drop-pounce, hairball fans, swipe combos, slowing roar |
| The Murder King | Neon Market, Hollow Heights | hovers ahead of you, feint swoops, crossfire volleys, feather storms, crow flocks, dive-bomb chains, tornado spiral |
| The Exterminator | Rust Yards | kites and jet-blinks away, tracking sniper laser, traps along your path, poison spray, missiles, machine gun, flamethrower, fumigation |
| The Many-Mouthed | sewer | lead-aimed charges, burrows and surfaces ahead of you, inhale pull, spit fans, spiral |
| The Brood Mother | sewer | skitters to your back, webs your escape line, tick broods, egg lobs, leaps, acid rain |
| The Rat King | sewer | ricocheting rolls, royal decrees along your path, tail-whip rings, rat fans, vortex pull, prince adds |

**Moment to moment.**
- *Perfect dodge.* Dodge through an attack in its first instant and time slows; you get two seconds of guaranteed crits and a chunk of combo. Dodges have a 1.2s cooldown.
- *District events* (about every 75–100s, never during a boss fight): **Food truck crash** (a loot pile the horde converges on), **Stampede** (cats charge through), **Fumigation sweep** (a wall of gas; get on a roof or into the walls), **Roach tide** (easy XP) and **Wanted** (a marked elite that pays gold and supplies if you catch it within 60s).

**Side objectives.** The first district is always "smash the nests". Later districts add a side job on top of the nests; finishing it pays a premium chest and gold:
- *The Cheese Heist.* Carry the giant glowing wheel back to the gold ring at your start. It slows you, and the horde spawns twice as fast while you have it.
- *Rescue the Caged Rats.* Gnaw open three cages. Freed rats run home; they don't fight.
- *Light the Beacon.* Stand in the ring until it lights while flyers come at you.
- *Catch the Thief.* A gold rat runs off with your gold. Catch it three times to get it back with interest.

**Characters, ranks and sharing.**
- *Boss intro barks*: a boss arrives with one quick announcer line (~2.5s, its name, title and a taunt). No card, no slow-mo, no scene: the game never pauses for an intro.
- *Scab*, your rival, shows up about half a minute into each district and runs for an unopened chest. Beat him three times and he gives up a stash of supplies.
- *Level grades* from the exit tally, a *run score*, and a **Share run card** PNG on the death screen.

**Classes and stats.** Four rats, all open from the start. Each has four stats from 1 to 10 (`TUNE.classes`), shown on its menu card: **Strength** scales primary attack damage (Sling Stone is half Strength, half Magic; Hex Bolt is all Magic), **Speed** sets move speed and attack and cooldown rate, **Armor** cuts damage taken (5.5% per point), and **Magic** scales specials, signatures, turbo and vials and fills the turbo meter faster.

| Rat | HP | STR | SPD | ARM | MAG | Kit |
|---|---|---|---|---|---|---|
| Sewer Rat | 195 | 6 | 3 | 8 | 4 | Gnash, Bulwark, Shield Parry, life-steal 0.5/hit, Bloodlust |
| Sewer Slinger | 115 | 4 | 8 | 3 | 7 | Sling Stone (½ STR, ½ MAG), Stone Volley, Ricochet |
| Rat Warlock | 110 | 3 | 5 | 2 | 10 | Hex Bolt (MAG), Blink, Hex Marks |
| Sewer Sneak | 90 | 6 | 9 | 2 | 5 | Shiv (1.8× from behind), Smoke Bomb, Shadowstep, Bloodlust |

Player colours and markers come from the player slot (P1 red triangle, and so on), never from the class. Gutter Brawler, Plaguebearer and Roof Rat were cut (Oct 2026); old saves that picked one start on Sewer Rat, Rat Warlock and Sewer Slinger respectively.

The Sewer Sneak no longer relies on stealth: its Smoke Bomb blinds the horde inside (they take 1.3× damage and are slowed) instead of hiding you from predators, and it has the standard scent gauge and squeeze.

**Turbo (X).** Damage you deal fills a three-segment turbo meter under your health (Magic fills it faster). **Tap X** for your class **turbo blast**, which spends every full segment and grows with how many (×1, ×1.75, ×2.5): Iron Wall (Sewer Rat), Stone Storm (Slinger), Hex Storm (Warlock) and Thousand Cuts (Sneak). **Hold X and press Q or G** for the turbo version of your special or signature: one segment, ignores the cooldown, double damage and a 1.5× radius, plus a twist (a second ring of stones, a burning smoke cloud, a longer Bulwark, a longer Blink). Hold X and let go without pressing anything and turbo stays armed for 1.5s, which is how touch players use it.

Turbo has its own look per class. While a turbo move is boosted the rat burns in its class colour (an aura and a turning ground ring), and armed turbo glows faintly gold. Every turbo move and blast rears the rat up with a class flourish: a shell of light (Sewer Rat), stones spiral out (Slinger), runes and lightning (Warlock) or afterimages (Sneak). The screen flashes gold.

**Rot Vials (Z).** Carry up to 9 (you start with 1). Throwing one bursts rot around you: heavy damage to everything within 11 units, nests and bosses included, plus poison. Vials turn up in chests (30%, premium always), bins and on corrupted elites, and lie on the floor as green flasks.

**Food and health drain.** Your health drains all the time: a gentle 0.3 HP/s in the first zone, then 0.5 + 0.1 per zone after. Run out and you starve. Food is the way back: **crumbs** (25 HP) from kills, **cheese wedges** (60) from nests, chests and bins, and whole **caches** (120) from premium chests, predators and hidden pockets. Your own shots, swipes and area attacks **destroy food** they touch (a shot stops there), so watch where you aim: while you attack, any food or cache in your shot line or swipe arc **flashes red**. Vials and turbo blasts don't destroy food. Some food is **moldy** (12% on the surface, 25% in the sewer): it looks the same, but eating it poisons you. Sniff (F) and moldy food glows green. When health dips below 30% and again below 12%, the **announcer** calls it out; its voice (your browser's built-in speech) can be turned on in the pause menu.

**The Reaper.** Some levels (Hollow Heights, Neon Market · Last Call, Hollow Heights · Moonrise, both Butcher's Drains and the Court) have a **grave** marked faint blue on the minimap; the Reaper climbs out when you come within 13. Elsewhere, from the second zone on, it rises if you're still in a zone after 150 seconds. It glides straight at you through walls, slower than any rat, and its touch drains 22 HP/s. Claws and shots only push it back; a **Rot Vial** or a **turbo blast** hurts it, and one vial usually banishes it (gold, a cache and 300 XP). If it drains 120 HP it fades, and comes back 90 seconds later if you're still dawdling.

**Thieves.** About every 80 seconds a gold-tinted thief sprints at you, snatches your **key** if you carry one (else a Rot Vial, else a fifth of your gold) and flees along the streets. It's gone for good after 12 seconds. Catch it to get everything back, plus a tip.

**Signature moves (G).** Shield Parry (Sewer Rat), Ricochet (Slinger), Hex Marks (Warlock) and Shadowstep (Sneak: reappear behind the nearest mob, facing its back).

**Camera.** A fixed-angle follow camera (`TUNE.camera`; the wheel zooms). It never moves to dodge buildings: anything between the camera and the rat gets a dithered see-through hole around the rat instead, so you're never hidden. Inside crawlspaces and buildings the camera tips over to look down into the cutaway.

**How things move.** Every creature runs on a lightweight vertex skeleton (body, head, four legs, tail, two wings), so the whole horde stays instanced while it moves like animals: strides follow distance covered, mobs lean into turns, coil before an attack and are briefly **OPEN** (+25% damage) after it. Wind-ups glow by attack kind: **red = melee, purple = projectile, yellow = area** (green = a priest's heal). Each class has its own silhouette.

**Mob roles.** *Lidbearers* block from the front (flank them); *Rot Priests* heal the pack (kill them first); *Lurkers* hide in cracks and pounce; *Bin Mimics* pose as trash cans and bite when rummaged; *Gob Spitters* keep their distance and spit acid. A third of mawlings circle behind you; hurt fry flee and come back enraged; cats eat mawlings.

**Places.** Enterable diners, garages, apartments and laundromats (whose washers shred the horde); Cinder Row's night tram; Neon Market stalls that can be robbed (the alarm brings a wave); Rust Yards' tower crane; Hollow Heights' guard dogs; rain; boss lairs marked by a red beam; rooftop plank bridges.

**Music.** A procedural soundtrack: boom-bap drums with trap hi-hat rolls and a discordant phrygian bass that climbs from 132 to 148 BPM in crowded fights. Each boss gets its own score (choir, FM bell, doom drums) that intensifies per phase. Music and effects have separate volume sliders.

**Tuning and the debug panel.** Every rebuilt number lives in `src/tuning.js` (`TUNE`): camera, stats and classes, stat growth, turbo, vials, nests, packs, boss variants, secrets and secret zones, climbing, keys, power-ups, hazards, the exit tally, the Reaper, thieves, food and the announcer among them. Open the game with `?debug` and a **Tune** button appears on the right edge: it lists every value by group and edits them live (class stat edits re-apply to your rat at once). Older numbers move into the file as their systems are rebuilt.

## The story

**Wick and Bram.** The night Cinder Row burned, Wick ran and told the nest that their littermate Bram died under the falling beams. Bram didn't die. He heard Wick run. He crawled into the sewer, was taken in by the Rat King's Court, and learned the King sells whole colonies to the Exterminator so his Court stays fed. Bram, now **Scab**, lit the fire on Cinder Row himself to drive the nest out before the poison came. He saved them, and he can't forgive them for leaving him. His answer is the Knot: tie every rat to every other by the tail so no one is ever left behind again.

The theme is the game's core verb. Running keeps you alive; going back is what makes you worth keeping. Wick's flaw (run, alone) and Scab's (hold on, by force) are the same wound. Scab is right about the threat and never lies to you. He feeds the Court's runts first, coughs from the smoke, and can't stand the dark. He is also the rat who steals your chests, lays poison in your path, takes Pip to see whether you'll go back, and spends the whole story making you strong enough to kill the King for him.

**Chapters** unlock across runs as you hit milestones in play, and are saved:

| # | Chapter | How it moves on |
|---|---|---|
| 1 | Smoke | Catch the chest thief |
| 2 | A Dead Rat Walking | Reach a second district |
| 3 | Pip | Free the caged rats; Pip is in the last cage |
| 4 | Pest Control | Beat a boss in your third district or deeper (the Exterminator in Rust Yards) |
| 5 | Below | Take a manhole into the sewer |
| 6 | The Court of Tails | Beat the Rat King in the deep sewer |
| 7 | Crown of Tails | Beat Scab, the Knotted King |

**Choices change play.** When you first catch Scab you can let him go, rob him (his supplies and gold, right now) or tell him you're sorry. After the Exterminator you can help him against the King (he stops robbing you and leaves supplies in each district) or refuse (he comes for your chests with a crew). From chapter 2 he lays stolen Exterminator poison as he runs. Once he's crowned he stops stealing; he's waiting for you as the final boss. (Phase 4 moves Pip and Bram into the hub; for now Pip no longer fights beside you.)

**Bonds and endings.** Every caged rat you free, saving Pip, sparing Scab (and owning what you did) is a bond: proof Wick has learned to go back. The finale offers three endings, and **cutting Scab free of the Knot needs 8 bonds**; freeing Pip alone won't get you there. Each ending leaves a mark on every run after it: *Going Back* (healing ×1.15), *Still Running* (+8% speed) or *Long Live the King* (+10% damage dealt, +10% damage taken).

Scenes pause the game. Space or a tap advances, Esc skips to the choice, 1–3 choose. The pause screen has a journal of chapters, choices and bonds. Harness runs (`?debug`) resolve scenes instantly so the bots and tests aren't interrupted.

## Controls

WASD move · mouse aims on the ground · left click or J attacks (hold to repeat) · Shift dodge (1.2s cooldown, i-frames) · Space jump (hold at a marked pipe to climb) · C squeeze · Q special · G class signature move · X turbo (tap: blast; hold + Q/G: turbo special or signature) · Z Rot Vial · E use / grab / hold to gnaw · R lock-on · F scent (8s gauge) · M map · wheel zoom · Esc pause. The camera follows at a fixed angle. The pause menu repeats all of this under **Controls**.

**Touch:** the left stick moves. Hold **Attack** to fire at the nearest enemy in a cone in front of you (no cone target: straight ahead). On the right: Lock, Sniff and Vial; Special, Sig and **Turbo** (tap for the blast; hold it, let go, then tap Special or Sig within 1.5s for the turbo version); Use (hold to gnaw), Dodge and Jump (hold at a marked pipe to climb). Map and Pause sit at the top.

## QA pipeline

Three stages, cheapest first. Stages 1 and 2 are deterministic regression checks; stage 3 is where bots play, and they only play to test something new.

| Stage | Command | Kind | Time | What it checks | Runs |
|---|---|---|---|---|---|
| 1 · Boot gate | `npm run build && npm run test:boot` | Deterministic | ~15s | Production bundle loads, menu and every class card render, a run starts from the real button, the loop advances and draws, pause and resume, no console errors. | Every push |
| 2 · System, UI, fuzz | `npm run smoke && npm run test:system` | Deterministic + fuzz | ~10 min | The whole loop end to end, every button on every screen, combat and economy math, every action's key / touch button / How to Play text, save round-trip, and random input with crash/NaN/out-of-bounds checks. | Every push |
| 3 · Feature lab | `npm run lab -- --quick` | Checks + bots, scored | ~10 min | One trial per new feature, level, mob or idea, scored out of 100 in three tiers (below). | Every push |

**Tiered scoring.** Each trial in `scripts/lab/trials.mjs` is scored:

| Tier | Points | Question | How |
|---|---|---|---|
| T1 Works | 40, gate | Does the feature exist and do its job? | Deterministic checks. One failure scores the trial 0 and fails the run. |
| T2 Holds up | 30 | Does it survive every level, class and edge case? | Robustness checks scored 0–1: all 22 levels (secret zones included), enemies and props around it, bot play with no stuck spots, falls out of the world or page errors. |
| T3 Plays well | 30 | Do its numbers land where the design wants them? | Bots (aiming and attacking manually, eating, using vials and turbo) play with the feature on; each metric scores 1 inside its target band and falls to 0 one band-width outside. Pure fixes with nothing to tune count T3 as full. |

A trial can carry an **A/B idea**: the bots play the same fixed-seed levels with the control tuning and with the idea's tuning, and the report names the winner (a gap under 3 points means "keep the control"). A trial passes at 60; CI fails on any T1 gate or a score under the floor, and posts the score table (`scripts/out/lab/SCORES.md`) to the run summary.

```mermaid
flowchart LR
  A[1 Boot gate] --> B[2 Smoke + system + fuzz] --> C[3 Feature lab]
  C --> T1[T1 Works · gate] --> T2[T2 Holds up] --> T3[T3 Plays well] --> AB[A/B idea vs control]
```

`.github/workflows/qa.yml` runs all three on every push and pull request; each stage only starts if the previous one passed. There is no nightly run, soak or open-ended exploration any more: when nothing new is being tested, no bots run. `npm run baseline` still captures the per-phase comparison.

The bots (`src/qa/bot.js`, only loaded with `?debug`) play through the same inputs a player uses. *Novice* reacts in about 0.65s and dodges 15% of attacks; *average* in 0.3s and half; *expert* in 0.12s and 90%, keeping range. Fast-forward steps the logic without drawing, roughly 25–100× real time. They measure stability and numbers; they can't tell whether movement feels good or a story beat lands.

## Performance

Everything that comes in large numbers (mobs, gold, projectiles, particles, gibs, blood decals, blob shadows) is drawn as instanced meshes, a few draw calls in total. The scene renders at a low PS1-like resolution that drops automatically when frames run long. Late in a run the cost is the horde itself, so:

- *AI level of detail.* Mobs more than 34 units away (off-screen) think every third frame and catch up on the time they skipped. Bosses, champions and patrolling predators always run at full rate.
- *Off-screen culling.* Mobs outside the camera view skip animation and GPU upload.
- *Caps.* At most 200 live enemies (`enemies.cap`); gold, particles and gibs have fixed pools.

Profiling a 7-minute late-game scene showed mob AI at 26µs per mob and 300+ nest-mates piling up; after these changes it's about 10µs per mob, and frame CPU fell by roughly a third with more mobs on screen.

## Code map

```
src/
  main.js            boot + frame loop
  core/              util (math, RNG, storage) and shared state singletons
  render/            renderer + pixel post shader, procedural textures, creature models, instancing pools, rig.js (vertex skeleton), fade.js (see-through hole)
  tuning.js          every rebuilt gameplay number (TUNE), edited live by the ?debug panel
  data/              classes, enemies/bosses/zone templates/modifiers, levels.js (the 22 levels, boss variants), corruptions, props
  world/             tile grid + collision, sewer and city generators, mesh builder + population, setpieces.js (interiors, tram, market, crane, gardens, lairs)
  entities/          player, rat model/portraits + ratAnim.js, mobs (AI + spawning), roles.js (new mob roles, pack behaviour), bosses
  combat/            damage/deaths/drops/zone scaling, primaries & specials, hazards (telegraphs, puddles)
  game/              run flow (districts, sewer, banking), progress (XP, levels, gold), stats (class stats, growth), turbo, vials, food (drain, sizes, mold), powerups, finds (secrets, pings), score,
                     nests (tiers, families, sleeping packs), reaper (and graves), thieves, secrets (drains, secret zones), announcer, loot, update step, render sync + camera, input, story.js
  audio/             SFX + music sequencer
  ui/                HUD, screens (menu, pause, map, death, endings), tally.js (exit tally), debugPanel.js, icons
scripts/boot.mjs     stage 1 boot gate; system.mjs stage 2 UI sweep, math checks, fuzzing
scripts/smoke.mjs    headless end-to-end test
scripts/lab.mjs      stage 3 feature lab; trials in scripts/lab/trials.mjs and trials-p4.mjs (src/qa/ holds the bots and level checks)
scripts/baseline.mjs per-phase baseline capture; pace.mjs leveling-pace tool
scripts/gallery.mjs  animation gallery + frame-cost probe; rats.mjs class line-up; places.mjs set-piece tour
```

Game state lives in a few mutable singletons (`G`, `P`, `W`, `run`, `st`, `meta` in `core/state.js`) that modules import and mutate in place. Saves go to `localStorage`: progress in three versioned slots `scurry.slot1..3` (old `scurry.meta`/`scurry.best` saves move into slot 1 on first load and are left in place), settings in `scurry.settings`. Phase 1 drops the old Nest purchases and the `scurry4.*` / `scurry.daily.*` keys on load; banked salvage carries over as gold.

## Known gaps

- Touch controls are tuned for landscape phones and tablets; portrait works but is cramped.
- Phase 4 first pass: three save slots, the Nest (a menu hub between runs) and its gold shop (permanent upgrades, supplies for the next run, power-up flasks). The Nest is a screen, not yet a walkable place.
- Turbo moves use the normal move's animation with an added pose, aura and class flourish; there are no fully bespoke turbo animations.
- The bots don't climb pipes or hunt secrets, so the lab measures those from level data and scripted checks rather than play.
- In the lab's co-op runs, players 2–4 are simple pad bots (they follow the lead, fight nearby mobs and nests, and back off when crowded), not full QA bots, so co-op numbers are a floor on what real partners would manage.
- Scent Veil stops the horde chasing you; ranged mobs that already see you can still shoot.
- Balance (zone table, boss HP, drop rates) comes from design intent and automated runs, not playtesting.
