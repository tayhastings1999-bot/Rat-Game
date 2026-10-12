# Design decisions

A running log of decisions about Scurry's direction, with the reasons for them. Update it in every PR that changes direction.

| Date | Decision | Rationale |
|---|---|---|
| 2026-10-12 | **Target: Steam release in 6–12 months.** | Taylor's goal. It sets the priorities: a cohesive core loop first, then a vertical slice, content, polish, and Steam work (desktop wrapper, Steamworks, store page) in parallel near the end. |
| 2026-10-12 | **Feel: close to Gauntlet: Dark Legacy.** | Taylor's reference. It fits what the README rebuild already planned (fixed camera, nests that spawn enemies, health drain plus food, keys and locks, turbo). New systems should push toward that arcade dungeon-crawler feel rather than the old roguelite layer. |
| 2026-10-12 | **No trademarked names.** Shop items, power-ups and modes use Scurry's own names (Splitclaw, Mirror Shell, Rot Vial, Second Tail…). | We borrow the shape of GDL's systems, not its names, to stay safe for a commercial release. |
| 2026-10-12 | **Three save slots ("burrows"), versioned.** Old single saves move into slot 1; the old keys are kept. | Per-player progress, couch households, and safe save migrations as the format changes. Keeping the old keys means rolling back to an older build loses nothing. |
| 2026-10-12 | **The Nest is the hub between runs** (a menu screen for now). Gold is banked on death and spent there. | It closes the loop (hub → run → hub) and gives gold a purpose. A walkable hub is a later upgrade. |
| 2026-10-12 | **GDL-style shop with three kinds of stock:** permanent stat upgrades (Strength, Armor, Speed, Magic, HP, gold pickup), supplies for the next run (Rot Vials, keys, cheese, Second Tail), and flasks (bottled power-ups). | It mirrors GDL's stat upgrades, potions, keys and timed items while reusing Scurry's existing systems (Rot Vials, keys/locks, power-ups) instead of duplicating them. |
| 2026-10-12 | **Flasks are held items used with a button** (V to use, B to cycle; touch Flask/Swap; the gamepad's d-pad), with a HUD slot and timer. | Taylor's call, matching GDL. Timing a power-up is a player decision, not an automatic trigger. |
| 2026-10-12 | **Difficulty: Casual / Normal / Insane**, picked in the Nest and saved per slot. Gold ×0.75 / ×1 / ×1.75. All values are in `TUNE.difficulty`. | Wider audience on Casual, a reason to replay on Insane; the higher gold payout rewards the risk (Taylor confirmed). |
| 2026-10-12 | **Local co-op for 2–4 players** on a shared screen (keyboard split plus gamepads). The camera frames everyone. Enemies chase the nearest rat. Each rat has its own HP, class, turbo and flasks. Gold, keys and XP are shared. A downed rat is revived by standing next to it. | GDL is a 4-player co-op game at heart. Local first, because Steam Remote Play Together turns local co-op into online play without netcode. |
| 2026-10-12 | **Friendly fire off.** | Taylor's call. Keeps co-op chaotic but friendly. |
| 2026-10-12 | **Player-count scaling** (`TUNE.coop.perPlayer`): each extra rat adds enemy HP, damage, spawn rate, elite odds, boss HP and nest children. It stacks with difficulty. | Gauntlet-style: more players must still be challenged, or co-op gets trivial. |
