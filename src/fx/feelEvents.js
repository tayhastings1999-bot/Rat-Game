// Audio/feel hooks for combat juice. Visuals fire these; audio may subscribe.
// Types: 'heartbeat' {hp}, 'hit' {dmg,crit}, 'kill' {boss,elite}, 'killPop' {x,y,z,big}, 'bossDeath'.
const hooks = [];
/** Subscribe. Returns an unsubscribe function. */
export function onFeelEvent(fn) {
  hooks.push(fn);
  return () => { const i = hooks.indexOf(fn); if (i >= 0) hooks.splice(i, 1); };
}
export function feelEvent(type, data) { for (let i = 0; i < hooks.length; i++) hooks[i](type, data); }
