## What and why
<!-- One paragraph: what changes for the player, and why. Link the issue/review. -->

## Checklist
- [ ] `npm run lint`, `npm run build` and `npm run test:boot` pass locally
- [ ] Smoke (`npm run smoke`) run if gameplay/flow changed
- [ ] `docs/DESIGN_DECISIONS.md` updated (new row for every decision)
- [ ] Tunables live in `src/tuning.js`, not hard-coded
- [ ] No trademarked names or assets
- [ ] Render/UI change: screenshots attached or the Screenshots artifact checked; 320px thumbnail still reads
- [ ] Perf job checked (no count regression; timing warnings explained)
- [ ] Save format change: migration added in `src/core/state.js`
- [ ] Removed anything? Listed below with the reason

## Screenshots / perf
<!-- Before/after, perf table if relevant -->

## Removals
<!-- What was removed and why (or "none") -->
