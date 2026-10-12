// The shared palette (art bible v1, docs/ART_BIBLE in scurry-art). Every colour in the
// game should come from here. Environment: void/slate/concrete/grime only (plus warm
// lamp light). Player hues are reserved for players and UI; enemies never use them.
export const PAL = {
  void: 0x0b0a10, // outlines, fog, UI backing
  slate: 0x1e2230, // walls (dark side), deep floor
  concrete: 0x3a4052, // floor base, wall tops
  grime: 0x5c6474, // floor highlight, lit wall face, props
  bone: 0xe8e4da, // text, hit flash, highlights
  red: 0xff3b30, // P1
  blue: 0x2f8cff, // P2
  yellow: 0xffd21f, // P3, gold
  green: 0x33e07a, // P4, heal food
  lime: 0xb6ff3b, // nests, poison, spawn telegraph
  purple: 0x7a3cff, // enemy eyes, magic, secrets
  orange: 0xff7a1a, // enemy shots, traps, danger
  cyan: 0x3bf2ff, // keys, locks, exits
  chromeHi: 0xc9d4e8, // UI bevel top, metal
  chromeLo: 0x4a5470, // UI bevel bottom, panel body
};
/** Player colours in slot order (P1 red, P2 blue, P3 yellow, P4 green). */
export const PLAYER = [PAL.red, PAL.blue, PAL.yellow, PAL.green];
/** '#rrggbb' for CSS. */
export const css = c => '#' + c.toString(16).padStart(6, '0');
