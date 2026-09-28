// Foraged fungi: eat on contact for a 10-second buff. Molds grow flat on the
// ground by walls; mushrooms stand up. Sewers grow far more of them.
export const FUNGI = {
  puffcap: { name: 'Puffcap', desc: '+35% move speed', col: 0xd83a2a, spot: 0xf4e8d0, mold: false },
  glowcap: { name: 'Glowcap', desc: '+25% crit chance', col: 0x3ad0c8, spot: 0x9af8f0, mold: false, glow: true },
  sporecap: { name: 'Sporecap', desc: 'Toxic spores choke anything close', col: 0x8a4ad0, spot: 0xc8a0ff, mold: false },
  ironmold: { name: 'Iron Mold', desc: 'Take 40% less damage', col: 0x6a7a6a, mold: true },
  bloodmold: { name: 'Blood Mold', desc: 'Regenerate 5 HP a second', col: 0xa01a2a, mold: true },
  slime: { name: 'Slime Mold', desc: 'Sprinting and climbing cost no stamina', col: 0xe0c030, mold: true },
};
export const FUNGUS_T = 10;
