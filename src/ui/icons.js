// Inline SVG icons for the HUD and menus.
const SV = (p, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

export const ICON = {
  rake: SV('<path d="M5 19 13 5"/><path d="M10 20 18 7"/><path d="M15 21 21 11"/>'),
  claw: SV('<path d="M4 18 12 4"/><path d="M9 20 17 6"/><path d="M14 21 20 10"/>'),
  gnash: SV('<path d="M3 8h18"/><path d="M5 8l2 5 2-5 2 5 2-5 2 5 2-5 2 5"/><path d="M3 17h18"/><path d="M6 17l2-4 2 4 2-4 2 4 2-4 2 4"/>'),
  blight: SV('<path d="M9 3h6"/><path d="M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>'),
  flask: SV('<path d="M9 3h6"/><path d="M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 14h10"/>'),
  stone: SV('<circle cx="15" cy="12" r="4"/><path d="M3 9h6M2 13h6M4 17h5"/>'),
  darts: SV('<path d="M3 7h13l3-2"/><path d="M3 12h15l3-2"/><path d="M3 17h13l3-2"/>'),
  sling: SV('<circle cx="15" cy="12" r="4"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/>'),
  hex: SV('<path d="M12 2 20 7v10l-8 5-8-5V7z"/><circle cx="12" cy="12" r="3"/>'),
  whip: SV('<path d="M12 12a3 3 0 1 1 3-3"/><path d="M15 9a6 6 0 1 1-6-6"/><path d="M3 21l6-6"/>'),
  aura: SV('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="10.5" stroke-dasharray="2 4"/>'),
  arc: SV('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  orbit: SV('<circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="18" cy="15.5" r="2" fill="currentColor"/><circle cx="6" cy="15.5" r="2" fill="currentColor"/>'),
  tome: SV('<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/>'),
  heal: SV('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3C14.8 3 13.5 3.5 12 5c-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>'),
  gear: SV('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  shiv: SV('<path d="M6 18 16 8l2-4-4 2L4 16z"/><path d="m5 15 4 4"/>'),
  smoke: SV('<circle cx="8" cy="14" r="4"/><circle cx="15" cy="12" r="5"/><circle cx="12" cy="7" r="3"/>'),
  slam: SV('<path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M3 20h18"/><path d="M6 17l-2 3M18 17l2 3"/>'),
  nova: SV('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>'),
  volley: SV('<circle cx="12" cy="12" r="2"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>'),
  blink: SV('<path d="M4 12h10"/><path d="m10 6 6 6-6 6"/><path d="M20 4v16"/>'),
  bulwark: SV('<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/>'),
  updraft: SV('<path d="M12 21V5"/><path d="m6 11 6-6 6 6"/><path d="M4 21h4M16 21h4"/>'),
  key: SV('<circle cx="7" cy="12" r="4"/><path d="M11 12h10M17 12v4M20 12v3"/>'),
  skull: SV('<path d="M12 3a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/><path d="M10 20v-2M14 20v-2"/>'),
  junk: SV('<path d="M7 6h10l-1 14H8z"/><path d="M5 6h14M10 3h4"/><path d="M10 10l1 6M14 10l-1 6"/>'),
  dna: SV('<path d="M7 3c0 6 10 6 10 12s-10 6-10 6"/><path d="M17 3c0 6-10 6-10 12"/><path d="M8 7h8M8 17h8"/>'),
  reroll: SV('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
};

export const IC_SCRAP = `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#8a929a" stroke="#000" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#2a2e34"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#000" stroke-width="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke="#b8c0c8" stroke-width="1.6"/></svg>`;
export const IC_KEY = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#ffd040" stroke="#000" stroke-width="2"><circle cx="7" cy="12" r="4.5"/><path d="M11 10.5h10v3h-2v3h-3v-3h-5z"/></svg>`;
export const IC_HEART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#d8342c" stroke="#000" stroke-width="2"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3C14.8 3 13.5 3.5 12 5c-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/></svg>`;
export const IC_EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#e0a020" stroke="#000" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="#000"/></svg>`;
export const IC_BOLT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#3a8fe0" stroke="#000" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
