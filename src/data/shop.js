// Nest shop catalogue, in the spirit of an arcade dungeon-crawler's between-level shop.
// Three kinds of stock (numbers in TUNE.shop; effects applied by game/shop.js):
//  · upgrades  – permanent ranks, kept in the slot (stats, max HP, gold pickup)
//  · supplies  – consumables packed for the NEXT run only (vials, food, a second tail)
//  · flasks    – a bottled power-up (powerups.js), carried and uncorked with V (cycle with B)
// Prices are multiples (x) of TUNE.shop.goldPerLevel, GDL's spread: cheap supplies (~0.1–0.25×),
// flasks (~0.7–1.2×), permanent stats (2×, flat like GDL's +10 stat). Packed items sell back at TUNE.shop.sellBack.
// Names are Scurry's own; the shape (stat upgrades, potions, keys, timed items,
// an anti-death charm) follows the classic arcade shop Taylor asked for.
export const SHOP = {
  // upgrades
  str: { tab: 'up', name: 'Sharp Teeth', max: 3, x: 2, desc: r => `+${r} Strength`, kind: 'stat' },
  arm: { tab: 'up', name: 'Scarred Hide', max: 3, x: 2, desc: r => `+${r} Armor`, kind: 'stat' },
  spd: { tab: 'up', name: 'Quick Feet', max: 3, x: 2, desc: r => `+${r} Speed`, kind: 'stat' },
  mag: { tab: 'up', name: 'Rot Lore', max: 3, x: 2, desc: r => `+${r} Magic (specials, turbo, vials)`, kind: 'stat' },
  hide: { tab: 'up', name: 'Thick Fur', max: 5, x: 1.2, desc: r => `+${r} max HP`, kind: 'hp' },
  pack: { tab: 'up', name: 'Packrat', max: 3, x: 2, desc: r => `+${Math.round(r * 100)}% gold picked up`, kind: 'gold' },
  // supplies (max = how many you can pack for one run)
  vial: { tab: 'sup', name: 'Rot Vial', max: 3, x: 0.25, desc: () => 'One extra Rot Vial (Z) at the start', kind: 'stock' },
  cheese: { tab: 'sup', name: 'Wheel of Cheese', max: 2, x: 0.15, desc: () => 'Eaten by itself when HP drops below 25%: heals 40%', kind: 'stock' },
  tail: { tab: 'sup', name: 'Second Tail', max: 1, x: 1.5, desc: () => 'Cheat death once: get back up at half HP', kind: 'stock' },
  // flasks: bottled power-ups, held and used on demand (max = how many you can pack)
  fSplit: { tab: 'flask', name: 'Flask of Splitclaw', max: 2, x: 1.1, pu: 'split', kind: 'flask' },
  fMirror: { tab: 'flask', name: 'Flask of Mirror Shell', max: 2, x: 0.8, pu: 'mirror', kind: 'flask' },
  fIron: { tab: 'flask', name: 'Flask of Iron Hide', max: 2, x: 1.2, pu: 'iron', kind: 'flask' },
  fQuick: { tab: 'flask', name: 'Flask of Quickpaw', max: 2, x: 0.7, pu: 'quick', kind: 'flask' },
};
export const SHOP_TABS = { up: 'Upgrades · permanent', sup: 'Supplies · next run only', flask: 'Flasks · carry into the run, V uncorks (press again to cork and save the rest)' };
