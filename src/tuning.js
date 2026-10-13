// Every gameplay number in one place. The ?debug panel edits these live, and
// systems read them at the moment they need them, so a change takes effect at
// once. Values are grouped by system; each has a short note. New and rebuilt
// systems read from here; older numbers move in as their systems are rebuilt.
import { PLAYER } from './render/palette.js';

export const TUNE = {
  enemies: {
    cap: 200, // live enemies at once (nests pulse and hold at the cap)
  },
  zone: {
    // Enemy strength by zone (zone 0 = the first). Replaces the old threat engine.
    threatPerZone: 2, // the zone's difficulty index, per zone number
    hpPerThreat: 0.2, // enemy HP +20% per point
    dmgPerThreat: 0.075, // enemy damage +7.5% per point
    spdPerThreat: 0.03, // enemy speed +3% per point (max +55%)
    atkPerThreat: 0.07, // enemy attack rate +7% per point (max +140%)
    eliteBase: 0.02, // elite odds at zone 0, after the first minute
    elitePerThreat: 0.008,
    eliteMax: 0.2,
  },
  coop: {
    // Local co-op (game/coop.js): 2–4 rats on one screen. Friendly fire is off.
    // Party scaling, Gauntlet-style: each rat beyond the first adds these fractions on top of zone + difficulty
    // (so 4 rats = 1 + 3 × value). zoneScaling() in combat.js applies them.
    // HP and spawn pressure rise with the party, damage does not (uneven damage scaling is the top complaint in co-op reviews).
    perPlayer: { hp: 0.6, dmg: 0, spawn: 0.35, elite: 0.1, bossHp: 0.75, nestKids: 0.3 },
    // Downed rats: a teammate can revive them inside the window; when it runs out the party spends a shared
    // cheese token (a continue) to bring them back beside the lead, or they sit out until the next level.
    // Per difficulty: tokens per run and teammate revives per rat per level (-1 = unlimited).
    downTime: 15, // seconds a downed rat waits before a token is spent (or it sits out)
    tokenHp: 0.6, // HP fraction when a token brings a rat back
    rules: { casual: { tokens: -1, revives: -1 }, normal: { tokens: 3, revives: 2 }, insane: { tokens: 1, revives: 0 } },
    reviveR: 1.8, // a standing rat this close revives a downed one…
    reviveTime: 2.5, // …over this many seconds (the bar drains at half speed when nobody helps)
    reviveHp: 0.4, // back up with this fraction of max HP
    leash: 22, // soft leash so everyone stays in frame: a rat farther than this from the lead is pulled back beside it
    camPad: 3, // co-op framing: the box around every standing rat plus this padding, within camera.minWidth..maxWidth
    deadzone: 0.35, // gamepad stick deadzone
    colors: PLAYER, // player rings and HUD cards: red, blue, yellow, green (render/palette.js)
  },
  art: {
    // Look (art bible v1). Lights, fog, post and outlines; colours come from render/palette.js.
    sun: 2.2, sunCol: 0xfff2dc, hemi: 0.6, hemiSky: 0x6a7aa8,
    fogNear: 30, fogFar: 70, fogTint: 0.3, // fog to Void, tinted this far toward the zone's own fog colour
    grain: 0.01, vignette: 0.3, dither: 0.35, // post (were 0.03 / 0.55 / 0.9)
    edge: 0.9, edgeDepth: 0.06, // depth-edge outline strength and threshold (relative depth step)
    outline: 0.035, outlineHero: 0.045, outlineBoss: 0.06, outlinePlayer: 0.02, // inverted-hull widths, world units
    ring: 0.7, ringPulse: 0.08, // player ring radius and pulse
    outlineMaxMobs: 120,
    heroScale: 1.25, heroRim: 0.9, ringW: 0.16, glyph: 0.95, glyphY: 2.3, // hero identity (review #4)
    enemyTone: 0x4a4656, enemyDark: 0.8, // enemy bodies: one desaturated dark tone, 20% darker (review #4) // perf guard: mob outlines switch off while more mobs than this are on screen
  },
  difficulty: {
    // Casual / Normal / Insane, picked in the Nest and saved per slot (meta.difficulty).
    // Multipliers on top of zone scaling (and player-count scaling in co-op). zoneScaling() in combat.js applies them.
    // atk = enemy attack-rate × (cooldowns only: wind-up telegraphs are never shortened), spd = enemy move ×,
    // pu = street power-ups ×, vials = starting Rot Vials ±, bossDmg = boss damage × on top of dmg.
    casual: { hp: 0.75, dmg: 0.65, spawn: 0.8, elite: 0.6, bossHp: 0.8, drain: 0.7, food: 1.25, gold: 0.75, atk: 0.85, spd: 0.95, pu: 1, vials: 0 },
    normal: { hp: 1, dmg: 1, spawn: 1, elite: 1, bossHp: 1, drain: 1, food: 1, gold: 1, atk: 1, spd: 1, pu: 1, vials: 0 },
    // Insane: "brutal but accomplishable". Mistakes cost a lot (damage, faster follow-ups, less
    // food and fewer power-ups), but the rules and telegraphs are the same as Normal.
    insane: { hp: 1.3, dmg: 1.6, spawn: 1.3, elite: 2, bossHp: 1.15, bossDmg: 0.7, drain: 1.4, food: 0.6, gold: 1.75, atk: 1.25, spd: 1.08, pu: 0.5, vials: -1 },
  },
  camera: {
    // Fixed high 3/4 camera (art bible §9): FOV 35, ~62° pitch, ~22 world units across at 16:9
    // (Gauntlet shows the room, not just the hero). Walls in the way get a see-through hole.
    pitch: 1.08, // radians above the horizon (~62°)
    width: 22, // world units visible across at the target; the wheel zooms between minWidth and maxWidth
    minWidth: 18,
    maxWidth: 30,
    fov: 35,
    lead: 0.16, // look ahead by this × velocity…
    leadMax: 1.5, // …capped at this many units
    cutPitch: 1.32, // steeper look-down inside ducts and buildings (the cutaway)
    fade: true, // the see-through hole
    fadeRadius: 2.6, // hole radius around the rat, world units
    fadeOpacity: 0.92, // how open the hole's centre is (1 = fully clear)
  },
  player: {
    rollCd: 1.2, // seconds between dodges
    rollTime: 0.3, // dodge duration
    rollIframes: 0.34, // invulnerability during the dodge
    rollSpeed: 2.3, // dodge speed, × move speed
  },
  stats: {
    // Four class stats (1–10) turn into numbers: Strength → primary damage, Speed → move
    // speed and attack rate, Armor → damage taken, Magic → special, signature, turbo and
    // vial damage plus how fast the turbo meter fills.
    strBase: 0.7, strPer: 0.06, // primary damage × (strBase + strPer·STR)
    spdBase: 5.6, spdPer: 0.32, // move speed = spdBase + spdPer·SPD
    rateBase: 1.12, ratePer: 0.024, // attack and cooldown time × (rateBase − ratePer·SPD)
    armPer: 0.055, // damage taken × (1 − armPer·ARM)
    magBase: 0.7, magPer: 0.06, // special, turbo and vial damage × (magBase + magPer·MAG)
    gainBase: 0.6, gainPer: 0.08, // turbo fill × (gainBase + gainPer·MAG)
  },
  classes: {
    // Base HP, the four stats, and melee life-steal per hit.
    tank: { hp: 195, str: 6, spd: 3, arm: 8, mag: 4, leech: 0.5 },
    slinger: { hp: 115, str: 4, spd: 8, arm: 3, mag: 7, leech: 0 },
    warlock: { hp: 110, str: 3, spd: 5, arm: 2, mag: 10, leech: 0 },
    sneak: { hp: 90, str: 6, spd: 9, arm: 2, mag: 5, leech: 0 },
  },
  turbo: {
    // A 3-segment meter filled by damage you deal. Hold X + Q or X + G for the turbo
    // version of your special or signature; tap X alone for your class turbo blast.
    segments: 3,
    gainPerDmg: 0.002, // segments per point of damage dealt (×Magic)
    specialCost: 1, sigCost: 1,
    window: 1.5, // seconds a turbo special or signature stays boosted
    moveDmg: 2, // turbo special/signature damage ×
    moveArea: 1.5, // turbo special/signature radius ×
    blastMin: 1, // segments needed for a blast (it spends every full one)
    blastBase: 1, blastPerSeg: 0.75, // blast power × (base + perSeg·(segments − 1))
    tapTime: 0.35, // X released within this many seconds without Q/G = blast
    // Hit streak (replaces the combo meter): hits within `window` s of each other count;
    // past minHits each hit adds perHit to turbo gain, capped at +max. A hit taken resets it.
    streak: { window: 2.5, minHits: 5, perHit: 0.02, max: 0.2, killHits: 2, perfectHits: 4 },
    armTime: 1.5, // held longer and let go: turbo stays armed this long for the next Q or G
  },
  vials: {
    // Rot Vials (Z): burst around you, hitting everything in the radius. Damage × Magic.
    start: 1, // carried at the start of a run
    max: 9,
    radius: 11,
    dmg: 120, nestDmg: 90, bossDmg: 260, reaperDmg: 300,
    poison: 4, // seconds of rot on everything hit
    chestOdds: 0.3, binOdds: 0.08, eliteOdds: 0.1, // chance to drop one (premium chests always do)
  },
  nests: {
    // Three tiers. Damage knocks a nest down a tier once its HP falls below the next tier's.
    hp1: 160, hp2: 320, hp3: 560, // Litter Pile, Burrow, Warren (× zone and sewer scaling)
    every1: 4.5, every2: 3.2, every3: 2.2, // seconds between spawns while you're in range
    kids1: 6, kids2: 10, kids3: 14, // live children a nest keeps at most
    xp1: 15, xp2: 25, xp3: 40,
    range: 45, // nests only spawn while you're this close
    count: 7, countPerZone: 0.5, countMax: 12, // nests per zone
    warrenBase: 0.05, warrenPerZone: 0.1, warrenMax: 0.6, // chance a nest starts as a Warren
    warrenMinZone: 2, // no Warrens before this zone
    burrowBase: 0.35, burrowPerZone: 0.03, // ...or a Burrow (the rest start as Litter Piles)
    lowerOdds: 0.25, // chance a nest raises its family's lower-tier member instead
    ambient: 0, // street spawns between nests (zone families only), × the old rate; 0 = nests and packs only
    surges: 0, // 1 = periodic horde surges on top of the nests
  },
  bossVariants: {
    // Remixed levels field a variant of their boss (data/levels.js BOSS_VARIANTS).
    remixHp: 1.1, // every variant
    frenziedSpd: 1.12, frenziedRate: 1.35, // Unleashed: move speed ×, attack rate ×
    armoredTaken: 0.8, armoredHp: 1.15, // in Iron: damage taken ×, extra HP ×
    broodAdds: 5, // and Brood: family mobs called in at every phase change (and on waking)
  },
  secrets: {
    // Secrets in every level (game/finds.js): cracked walls, squeeze rooms, rooftop caches.
    min: 3, max: 6, // how many a level counts (the HUD's SECRETS n/m)
    findGold: 12, findXp: 60, // paid out for each one found
    pingR: 40, // F (sniff) pings secrets within this distance
    pingT: 6, // seconds their markers stay lit
    // Secret zones (game/secrets.js).
    vaultTime: 60, vaultChests: 8, vaultCaches: 6, vaultVials: 3, // The Cheese Vault
    runTime: 45, runGold: 120, runCaches: 3, // The Rat Run: gold piles of 3, and thieves
    gardenNests: 6, gardenChests: 4, // The Bone Garden: all Warrens; premium chests when they fall
  },
  climb: {
    // Only marked drainpipes (yellow bands, a paw mark at the foot) and fire escapes can be climbed.
    pipesCity: 10, // marked pipes per city level, each with a rooftop cache at the top
    pipesSewer: 4, // and per sewer level, up onto the wall tops
    maxH: 9.5, // tallest wall a pipe goes up
    spacing: 22, // minimum distance between pipes
    reach: 0.85, // how close to the pipe you must be to grab it
    speed: 6.5, // climbing speed
    topPush: 4.5, // the hand-up onto the roof at the top of a pipe
    hopUp: 2.2, // a roof this much higher than the one you're on is still reachable by a hop
  },
  balance: {
    // Power vs challenge (DESIGN_DECISIONS: "strong, never safe"). Stats past `softAt` grow at a
    // diminishing rate (half value at softAt + softR, asymptote softAt + softR). The total
    // damage-taken multiplier from Armor stops at armFloor and the full stack (Armor × Iron Hide × buffs) at minTaken, and the
    // player-side outgoing damage multiplier soft-caps past outAt. Enemies scale with the rat's
    // actual power: HP × (offense / start)^hpFollow, damage × (effective HP / start)^dmgFollow,
    // so growth always shows (exponents < 1) but never makes the game safe.
    softAt: 10, softR: 8,
    armFloor: 0.4, // Armor alone never cuts damage taken below this
    minTaken: 0.25, // Armor × Iron Hide × buffs never below this
    outAt: 2.5, outR: 2,
    hpFollow: 0.35, dmgFollow: 0.35,
  },
  growth: {
    // Stat growth on level-up (game/stats.js growStats): points split by the class's own stats.
    perLevel: 0.45, // stat points per level (Strength + Speed + Armor + Magic)
    hp: 4, // max HP per level
  },
  keys: {
    // Keys stack (HUD count) and open locks: locked chests, locked gates, the manhole.
    eliteOdds: 0.3, miniOdds: 0.7, chestOdds: 0.2, binOdds: 0.05, nestOdds: 0.15, // drop chances (bosses always drop one)
    lockedChests: 2, // chests per level with a padlock (premium loot and a power-up inside)
    gates: 1, // dead ends per level behind a locked gate (a vault: premium chest, power-up, cache)
    lockedGold: 1.5, // locked chests hold this × a premium chest's gold
  },
  powerups: {
    // Eight timed power-ups (game/powerups.js).
    dur: 25, // seconds each one lasts
    perLevel: 2, // tokens on the street per level (more wait in vaults, secrets and chests)
    chestOdds: 0.12, premiumOdds: 0.4, // chance a chest (or premium chest) holds one
    veilR: 5, veilSlow: 0.45, // Scent Veil: mobs farther than this lose your scent and wander at this × speed
    ironCut: 0.6, // Iron Hide: share of damage it takes away
    quickSpd: 1.35, quickRate: 1.3, // Quickpaw: move speed ×, attack rate ×
    splitMelee: 1.8, splitSpread: 0.22, // Splitclaw: melee damage ×; angle between split shots
    mirrorDmg: 1.5, // Mirror Shell: reflected shots hit for this × their damage
    emberT: 3, emberDps: 9, // Ember Breath: burn length and damage per second
    mothDmg: 16, mothEvery: 0.7, mothRange: 9, // Moth Familiar
  },
  tally: {
    // The exit tally (ui/tally.js): points per part (they add up to 100) and grade thresholds.
    wNests: 30, wBoss: 15, wSide: 10, wSecrets: 20, wHealth: 15, wTime: 10,
    hurtPar: 2, // taking this many × your max HP scores 0 for health
    parTime: 240, // seconds: at or under this scores full time points
    S: 90, A: 75, B: 60, C: 40,
    goldS: 60, goldA: 40, goldB: 20, goldC: 10, goldD: 0, // grade bonus
  },
  hazards: {
    // Collapsing Floors (the 'collapse' hazard): cracked tiles that drop away under you.
    collapseFrac: 0.035, // share of open floor tiles that are cracked (only tiles with open floor on all four sides)
    collapseWarn: 0.9, // seconds a crack shakes and glows red after you step on it before it drops
    collapseOpen: 8, // seconds the hole stays open before the floor knits back
    collapseRearm: 6, // seconds before a mended crack can drop again
    fallDmg: 12, // HP lost when you fall into a hole (you come back up where you last stood safely)
  },
  reaper: {
    // Rises when you linger in a zone; drains on touch; only vials and turbo blasts hurt it.
    minZone: 1, // first zone it can appear in (0 = the first zone)
    delay: 150, // seconds in a zone before it rises
    returnAfter: 90, // seconds before it comes back after leaving
    spd: 3.4, // glides through walls; slower than every rat
    reach: 1.4,
    dps: 22, // health drained per second while touching you
    drainCap: 120, // it leaves after draining this much
    hp: 360, // × (1 + 0.3 per zone); one or two Rot Vials
    staggerT: 0.35, // normal hits push it back for this long
    graveWake: 13, // a level's grave wakes the Reaper when you come this close
    spawnDist: 18,
    gold: 40, xp: 300,
  },
  thief: {
    // Snatches a Rot Vial (or gold) and runs. Kill it to get everything back.
    minZone: 0,
    first: 45, every: 80, // seconds until the first thief, then between thieves (±20%)
    speed: 1.6, // × a mawling's speed
    hpMul: 4,
    takesKeys: 1, // 1 = a key is the first thing a thief grabs
    goldFrac: 0.2, goldMin: 10, // share of carried gold taken when there's no key or vial
    escape: 12, // seconds of fleeing before it's gone for good
    bonus: 12, // extra gold when you catch it
  },
  packs: {
    // Sleeping packs of the zone's families placed in rooms (game/nests.js placePacks).
    perZone: 6, perZoneGrow: 0.5, max: 12, // packs per level
    size: 4, sizeGrow: 0.5, sizeMax: 9, // mobs per pack
    wake: 12, // a pack wakes when you come this close (or hurt one of it)
  },
  food: {
    // Health drains all the time; food is the only way back.
    drainBase: 0.5, drainPerZone: 0.1, // HP per second = drainBase + drainPerZone × zone (zone 0 first)
    drainZone0: 0.3, // the first zone drains gentler
    crumb: 25, wedge: 60, cache: 120, // HP each size restores
    mold: 0.12, moldSewer: 0.25, // chance a drop is moldy (surface, sewer)
    moldPoison: 5, // seconds of poison from eating moldy food
    dropGrace: 0.4, // seconds a fresh drop can't be destroyed by your attacks
    warn: true, // food in your line of fire flashes red while you attack
    warnWidth: 0.9, // half-width of the shot line that counts
    killOdds: 0.012, killOddsLow: 0.05, // crumb chance per kill (healthy / below 35% HP)
  },
  announcer: {
    low: 0.3, crit: 0.12, // bark below these fractions of max HP
    rearm: 0.5, // re-arm once health is back above this
    showSecs: 2.6,
    vo: { on: false, path: 'vo/' }, // recorded VO by manifest id (off until Taylor picks the voice source); desktop never uses browser speech
    bossSecs: 2.5, // a boss intro is this quick bark and nothing else: no card, no slow-mo, no pause
  },
  sneak: {
    backstab: 1.8, // Shiv damage × from behind
    smokeVuln: 1.3, // enemies in the Smoke Bomb take this × damage
    smokeTurboDps: 14, // a turbo Smoke Bomb also burns this much per second
  },
  combat: {
    meleeFlyReach: 6, // melee primaries swat flying enemies up to this far above the rat
  },
  aim: {
    maxRange: 18, // the mouse aim point is clamped to this distance
    touchCone: 1.0, // touch attack: radians either side of facing searched for a target
    touchRange: 14,
  },
  xp: {
    // XP to the next level: base + lin·(L−1) + mul·(L−1)^exp
    base: 12, lin: 9, mul: 2.2, exp: 1.7,
    maxLevel: 99,
  },
  shop: {
    // The Nest shop (game/shop.js): permanent upgrades bought with banked gold, kept per save slot.
    // Price = round(item.x × goldPerLevel), × grow^rank for Thick Fur and Packrat (stats stay flat, GDL-style).
    // Stat ranks feed run.growth at run start.
    goldPerLevel: 250, // ESTIMATE of average gold banked per level on Normal; measure with the lab bots and update
    sellBack: 0.75, // packed supplies and flasks sell back for this share of the price
    statPer: 0.5, // stat points per rank of Sharp Teeth / Quick Feet / Scarred Hide / Rot Lore
    hpPer: 10, // max HP per rank of Thick Hide
    goldPer: 0.1, // gold pickup +10% per rank of Packrat
    grow: 1.5, // Thick Fur / Packrat price × this per rank owned
    cheeseAt: 0.25, cheeseHeal: 0.4, // packed cheese: eaten below 25% HP, heals 40%
  },
};

/** Flat list of [path, value] for the debug panel. */
export function tuneEntries(o = TUNE, pre = '') {
  const out = [];
  for (const k in o) {
    const v = o[k], p = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object') out.push(...tuneEntries(v, p));
    else out.push([p, v]);
  }
  return out;
}
/** Systems that cache derived numbers (class stats) re-read them when a value changes. */
export const tuneHooks = [];
export function setTune(path, v) {
  const ks = path.split('.'), last = ks.pop();
  let o = TUNE;
  for (const k of ks) o = o[k];
  o[last] = typeof o[last] === 'number' ? +v : typeof o[last] === 'boolean' ? !!v : v;
  for (const h of tuneHooks) h(path);
}
