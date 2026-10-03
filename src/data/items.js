// Loot: chest items, mutation ingredients & recipes, cursed items, workbench
// augments, Nest (meta) upgrades and elite corruptions.
import { run, st } from '../core/state.js';
import { addRunt } from '../entities/rat.js';

const giveOrbit = () => {
  const w = run.weapons.find(w => w.id === 'orbit');
  if (w) w.lvl = Math.min(5, w.lvl + 1);
  else if (run.weapons.length < 4) run.weapons.push({ id: 'orbit', lvl: 1, t: 0 });
  else st.dmg += 0.1;
};

/** Chest items. `ing` marks mundane mutation ingredients. */
export const ITEMS = {
  nail: { name: 'Rusty Nail', flav: 'Damage up', col: 0xb0704a, ing: true, ap: () => { st.dmg += 0.3; } },
  lens: { name: 'Cracked Lens', flav: 'Range and shot speed up', col: 0x9ad0ff, ap: () => { st.range += 0.4; st.shotSpd += 0.25; } },
  bile: { name: 'Sewer Bile', flav: 'Poison shots', col: 0x9be06a, ap: () => { st.poison = true; } },
  ember: { name: 'Ember Tooth', flav: 'Burning shots', col: 0xff8a3a, ap: () => { st.burn = true; } },
  twin: { name: 'Twin Tail', flav: 'Double shot', col: 0xe6c9a0, ap: () => { st.multi++; } },
  eye: { name: 'Third Eye', flav: 'Homing shots', col: 0xc080ff, ap: () => { st.homing = true; } },
  heart: { name: 'Rotten Heart', flav: 'Max HP up', col: 0xd8342c, ap: () => { st.maxHp += 30; run.hp += 30; } },
  wing: { name: 'Bat Wing', flav: 'Extra jump in mid-air', col: 0x5a4a60, ap: () => { st.jumps++; } },
  crown: { name: 'Bone Crown', flav: 'Cursed teeth circle you', col: 0xe8dcc0, ap: giveOrbit },
  runt: { name: 'The Runt', flav: 'A little rat fights beside you', col: 0xbab4a8, ap: () => addRunt() },
  rage: { name: 'Blood Frenzy', flav: 'Attack speed up', col: 0xff3a3a, ap: () => { st.tear *= 0.78; st.cd *= 0.92; } },
  paws: { name: 'Cloven Paws', flav: 'Speed up', col: 0x7a5a40, ap: () => { st.speed *= 1.12; } },
  shard: { name: 'Shard Heart', flav: 'Shots split on impact', col: 0x6ad0d0, ap: () => { st.split = true; } },
  lode: { name: 'Lodestone', flav: 'Pickups come to you', col: 0x8a8a9a, ap: () => { st.magnet *= 2; } },
  foot: { name: 'Rabbit Foot', flav: 'Crit chance up', col: 0xf2e0b0, ap: () => { st.crit += 0.1; } },
  gland: { name: 'Swollen Gland', flav: 'Bigger shots, bigger blasts', col: 0xa0b060, ap: () => { st.area += 0.25; st.shotSize += 0.5; } },
  barbs: { name: 'Barbed Hide', flav: 'Enemies that touch you bleed', col: 0x8a6a5a, ap: () => { st.thorns += 15; } },
  cheese: { name: 'Moldy Cheese', flav: 'Max HP up, a little', col: 0xe8b84a, ap: () => { run.cheese = (run.cheese || 0) + 1; if (run.cheese <= 5) st.maxHp += 15; run.hp = Math.min(st.maxHp, run.hp + 30); } }, // max HP only for the first five
  // ---- mundane ingredients: weak alone, wild in pairs ----
  razor: { name: 'Box Cutter', flav: 'Melee hits harder', col: 0x9a8a7a, ing: true, ap: () => { st.melee += 0.2; } },
  drink: { name: 'Spilled Energy Drink', flav: 'A little faster at everything', col: 0x3aff9a, ing: true, ap: () => { st.speed *= 1.05; st.cd *= 0.95; } },
  battery: { name: 'Watch Battery', flav: 'Special recharges faster', col: 0xe8d040, ing: true, ap: () => { st.specCd *= 0.9; } },
  wire: { name: 'Copper Wire', flav: 'Bigger area', col: 0xd0803a, ing: true, ap: () => { st.area += 0.1; } },
  lighter: { name: 'Cheap Lighter', flav: 'Burning hits', col: 0xff5a2a, ing: true, ap: () => { st.burn = true; } },
  bleach: { name: 'Bleach Bottle', flav: 'Poison hits', col: 0xd8f0ff, ing: true, ap: () => { st.poison = true; } },
  band: { name: 'Rubber Band', flav: 'Knockback up', col: 0xc05a3a, ing: true, ap: () => { st.kb *= 1.3; } },
  hook: { name: 'Fish Hook', flav: 'Crit chance up', col: 0xb8c0c8, ing: true, ap: () => { st.crit += 0.06; } },
};

/** Two ingredients fuse into a mutation the moment you hold both. */
export const MUTATIONS = [
  { id: 'livewire', a: 'razor', b: 'drink', name: 'Livewire Claws', desc: 'Melee hits arc lightning into nearby foes.', col: '#9ad0ff' },
  { id: 'tesla', a: 'battery', b: 'wire', name: 'Tesla Coil', desc: 'Lightning lashes the nearest foes every second.', col: '#c8e0ff' },
  { id: 'napalm', a: 'lighter', b: 'drink', name: 'Napalm Trail', desc: 'Sprinting and rolling leave a trail of fire.', col: '#ff7a2a' },
  { id: 'sludge', a: 'bleach', b: 'battery', name: 'Toxic Sludge', desc: 'You leak sludge that poisons and slows anything following you.', col: '#9be06a' },
  { id: 'recoil', a: 'band', b: 'hook', name: 'Slingshot Recoil', desc: 'Huge knockback. Launched foes explode when they slam into anything.', col: '#ffb070' },
  { id: 'nailbomb', a: 'nail', b: 'band', name: 'Nail Bomb', desc: 'Kills burst into a ring of rusty nails.', col: '#c8a080' },
  { id: 'chemfire', a: 'lighter', b: 'bleach', name: 'Chemical Fire', desc: 'Burn and poison deal double. Burning foes die in a pool of fire.', col: '#ffd040' },
  { id: 'overclock', a: 'battery', b: 'drink', name: 'Overclock', desc: 'Special cooldown −35%. Every special releases a shock nova.', col: '#40ffd0' },
  { id: 'razorwire', a: 'razor', b: 'wire', name: 'Razor Wire', desc: 'Anything that touches you is shredded. Thorns +30.', col: '#d8c8b0' },
  { id: 'gutting', a: 'hook', b: 'razor', name: 'Gutting Hook', desc: 'Crits deal triple damage and blow foes apart.', col: '#ff4a4a' },
];

/** Cursed loot: big upside, a nasty permanent price. */
export const CURSED = {
  rabid: { name: 'Rabid Bite', up: 'Double damage', dn: 'You bleed out unless you keep hitting things', ap: () => { st.dmg *= 2; st.rabid = true; } },
  glass: { name: 'Glass Skull', up: '+25% crit chance, crits triple', dn: '−40% max HP', ap: () => { st.crit += 0.25; st.critMul = Math.max(st.critMul, 3); st.maxHp = Math.round(st.maxHp * 0.6); run.hp = Math.min(run.hp, st.maxHp); } },
  pact: { name: 'Blood Pact', up: 'Every kill heals 2 HP', dn: 'No regeneration, and food heals half', ap: () => { st.leech += 2; st.noRegen = true; st.foodMul *= 0.5; } },
  greed: { name: 'Greedy Gut', up: '+60% XP and salvage', dn: 'Threat +2, permanently', ap: () => { st.xp += 0.6; st.salvage += 0.6; run.threatBase = (run.threatBase || 0) + 2; } },
  fury: { name: 'Berserker Tail', up: 'Below half HP: +50% attack speed, +30% damage', dn: 'Take 30% more damage, always', ap: () => { st.fury = true; st.taken *= 1.3; } },
  plagueheart: { name: 'Plague Heart', up: 'Every hit poisons; your poison deals triple', dn: 'You are poisoned every 12 seconds', ap: () => { st.poison = true; st.poisonMul *= 3; st.selfPoison = true; } },
};

/** Volatile junk: rummaged out of dumpsters, bins and sewer heaps. Strong, and every piece bites back. */
export const JUNK = {
  volt: { name: 'Leaking 9-Volt Battery', col: 0xe8d040, up: 'Rolls leave an electric trail; attacks arc lightning', dn: 'Stand still for 2s and it shocks you for 5% HP', ap: () => { st.volt = true; } },
  blade: { name: 'Rusted Razor Blade', col: 0xb07a5a, up: 'Hits stack bleed on anything you cut', dn: '−40% max stamina', ap: () => { st.bleed = true; st.staMax = Math.round(st.staMax * 0.6); run.sta = Math.min(run.sta, st.staMax); } },
  rag: { name: 'Pesticide Soaked Rag', col: 0x9ad06a, up: 'Your scent reveals every enemy; immune to toxins', dn: 'Healing is 75% less effective', ap: () => { st.rag = true; st.toxImmune = true; st.healMul *= 0.25; } },
  sinker: { name: 'Heavy Lead Sinker', col: 0x7a7a88, up: 'Q becomes a massive, uninterruptible ground slam', dn: 'No Scramble; climbing costs double stamina', ap: () => { st.sinker = true; st.noScramble = true; st.climbCost *= 2; } },
};

export const AUG = [
  { id: 'servo', br: 'Mobility', name: 'Claw Servos', cost: 20, up: 'Climbing costs 40% less and works on smooth metal and glass', dn: '−10 max stamina', ap: () => { st.climbCost *= 0.6; st.metalClimb = true; st.staMax -= 10; } },
  { id: 'burst', br: 'Mobility', req: 'servo', name: 'Burst Thrusters', cost: 35, up: 'Sprint 80% faster', dn: 'Sprinting drains stamina 50% faster', ap: () => { st.sprintMul = 1.8; st.sprintDrain *= 1.5; } },
  { id: 'glide', br: 'Mobility', req: 'burst', name: 'Glide Membrane', cost: 50, up: 'Hold Space mid-air to glide, +1 air jump', dn: '−15 max HP', ap: () => { st.glide = true; st.jumps++; st.maxHp -= 15; run.hp = Math.min(run.hp, st.maxHp); } },
  { id: 'incisor', br: 'Offense', name: 'Serrated Incisors', cost: 15, up: 'Gnaw twice as fast, +15% damage', dn: '−10 max HP', ap: () => { st.chew *= 2; st.dmg += 0.15; st.maxHp -= 10; run.hp = Math.min(run.hp, st.maxHp); } },
  { id: 'cap', br: 'Offense', req: 'incisor', name: 'Overcharged Capacitor', cost: 30, up: 'Special cooldown −40%', dn: 'Take 15% more damage', ap: () => { st.specCd *= 0.6; st.taken *= 1.15; } },
  { id: 'shrap', br: 'Offense', req: 'cap', name: 'Shrapnel Core', cost: 45, up: 'Kills burst into shrapnel', dn: 'Enemies move 10% faster', ap: () => { st.shrap = true; st.foeSpd *= 1.1; } },
  { id: 'plate', br: 'Survival', name: 'Scrap Plating', cost: 15, up: '+2 armor', dn: '−5% move speed', ap: () => { st.armor += 2; st.speed *= 0.95; } },
  { id: 'leech', br: 'Survival', req: 'plate', name: 'Leech Filter', cost: 30, up: 'Heal 1 HP per kill', dn: '−20 max stamina', ap: () => { st.leech += 1; st.staMax -= 20; } },
  { id: 'reactor', br: 'Survival', req: 'leech', name: 'Emergency Reactor', cost: 45, up: 'Once per run, survive a lethal hit at half HP', dn: 'Stamina regen −25%', ap: () => { run.reactor = true; st.staRegen *= 0.75; } },
];

/** Permanent upgrades bought at the Nest with banked salvage. */
export const NEST = [
  { id: 'hide', name: 'Thick Hide', desc: '+12 max HP per rank', costs: [60, 120, 200] },
  { id: 'scav', name: 'Scavenger', desc: '+15% salvage per rank', costs: [80, 160, 260] },
  { id: 'lungs', name: 'Stale Crumbs', desc: '+10 max stamina per rank', costs: [50, 110] },
  { id: 'nose', name: 'Keen Nose', desc: '+25% pickup reach per rank', costs: [50, 120] },
  { id: 'reroll', name: 'Lucky Whiskers', desc: '+1 level-up reroll per district per rank', costs: [120, 240] },
  { id: 'start', name: 'Head Start', desc: 'Begin each run with a random weapon', costs: [150] },
  { id: 'key', name: 'Spare Key', desc: 'Begin each run holding a sewer key', costs: [220] },
];

/** Bought with Dominance: earned by kills, damage, bosses and depth. */
export const DOMNEST = [
  { id: 'fang', name: 'Honed Fangs', desc: 'Your primary attack deals +8% damage per rank', costs: [8, 16, 28] },
  { id: 'tempo', name: 'Quick Paws', desc: 'All weapons fire 5% faster per rank', costs: [10, 22] },
  { id: 'wind', name: 'Deep Lungs', desc: 'Stamina regenerates 15% faster per rank', costs: [8, 18] },
  { id: 'arms', name: 'Scavenged Arsenal', desc: 'New weapons start one level higher', costs: [24] },
  { id: 'drain', name: 'Storm Drain Shortcut', desc: 'Start runs in Neon Market with 3 free picks · +25% Dominance', costs: [15], shortcut: true },
  { id: 'tunnel', name: 'Deep Tunnel Shortcut', desc: 'Start runs in the Undersewer with 3 free picks · +40% Dominance', costs: [30], shortcut: true },
];
/** Where a run can begin. Shortcuts need the matching Dominance upgrade. */
export const STARTS = {
  row: { name: 'Cinder Row', ok: () => true },
  drain: { name: 'Neon Market', ok: m => !!m.nest.drain, district: 1, domMul: 1.25 },
  tunnel: { name: 'The Undersewer', ok: m => !!m.nest.tunnel, sewer: true, domMul: 1.4 },
};

/** Elite corruptions: double HP, one nasty modifier, premium drops. */
export const CORRUPT = {
  fire: { name: 'Burning', col: 0xff6a2a, desc: 'leaves fire in its wake' },
  ward: { name: 'Warding', col: 0x6ad0ff, desc: 'shields nearby allies' },
  haste: { name: 'Frenzied', col: 0xffe040, desc: 'moves and attacks faster' },
  split: { name: 'Brood-bloated', col: 0x9be06a, desc: 'bursts into more on death' },
  leech: { name: 'Leeching', col: 0xd02040, desc: 'heals when it hurts you' },
  volatile: { name: 'Volatile', col: 0xff3a20, desc: 'explodes when it dies' },
};
