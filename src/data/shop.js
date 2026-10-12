// Nest shop catalogue, in the spirit of an arcade dungeon-crawler's between-level shop.
// Three kinds of stock (numbers in TUNE.shop; effects applied by game/shop.js):
//  · upgrades  – permanent ranks, kept in the slot (stats, max HP, gold pickup)
//  · supplies  – consumables packed for the NEXT run only (vials, keys, food, a second tail)
//  · flasks    – a bottled power-up (powerups.js), uncorked the moment a boss wakes
// Names are Scurry's own; the shape (stat upgrades, potions, keys, timed items,
// an anti-death charm) follows the classic arcade shop Taylor asked for.
export const SHOP = {
  // upgrades
  str: { tab: 'up', name: 'Sharp Teeth', max: 3, base: 200, desc: r => `+${r} Strength`, kind: 'stat' },
  arm: { tab: 'up', name: 'Scarred Hide', max: 3, base: 200, desc: r => `+${r} Armor`, kind: 'stat' },
  spd: { tab: 'up', name: 'Quick Feet', max: 3, base: 200, desc: r => `+${r} Speed`, kind: 'stat' },
  mag: { tab: 'up', name: 'Rot Lore', max: 3, base: 200, desc: r => `+${r} Magic (specials, turbo, vials)`, kind: 'stat' },
  hide: { tab: 'up', name: 'Thick Fur', max: 5, base: 120, desc: r => `+${r} max HP`, kind: 'hp' },
  pack: { tab: 'up', name: 'Packrat', max: 3, base: 250, desc: r => `+${Math.round(r * 100)}% gold picked up`, kind: 'gold' },
  // supplies (max = how many you can pack for one run)
  vial: { tab: 'sup', name: 'Rot Vial', max: 3, base: 60, desc: () => 'One extra Rot Vial (Z) at the start', kind: 'stock' },
  key: { tab: 'sup', name: 'Skeleton Key', max: 2, base: 90, desc: () => 'Start holding a key', kind: 'stock' },
  cheese: { tab: 'sup', name: 'Wheel of Cheese', max: 2, base: 70, desc: () => 'Eaten by itself when HP drops below 25%: heals 40%', kind: 'stock' },
  tail: { tab: 'sup', name: 'Second Tail', max: 1, base: 300, desc: () => 'Cheat death once: get back up at half HP', kind: 'stock' },
  // flasks: bottled power-ups for the first boss of the run
  fSplit: { tab: 'flask', name: 'Flask of Splitclaw', max: 1, base: 110, pu: 'split', kind: 'flask' },
  fMirror: { tab: 'flask', name: 'Flask of Mirror Shell', max: 1, base: 110, pu: 'mirror', kind: 'flask' },
  fIron: { tab: 'flask', name: 'Flask of Iron Hide', max: 1, base: 130, pu: 'iron', kind: 'flask' },
  fQuick: { tab: 'flask', name: 'Flask of Quickpaw', max: 1, base: 100, pu: 'quick', kind: 'flask' },
};
export const SHOP_TABS = { up: 'Upgrades · permanent', sup: 'Supplies · next run only', flask: 'Flasks · uncorked when a boss wakes' };
