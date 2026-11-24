# Art goldens (CI copy of scurry-art/pipeline)

Used by the `art-gate` CI job (`bash scripts/art/gate.sh`, also runnable locally:
`pip install -r scripts/art/requirements.txt` first).

| File | What |
|---|---|
| `golden_manifest.json` | sha256 + pixel hash + snapshot / cloth-mask paths per approved file (export entries of the art-side manifest; paths mapped `sprites/heroes_v2/export/X` → `X`, `pipeline/golden/` → `art/golden/`) |
| `snapshots/`, `masks/` | lossless approved pixels and approved cloth masks |
| `budgets.json` | frame counts, ms, canvas 128×160, anchor (64,150), heights, feet row, mask coverage, atlas limits |
| `allowed_changes.json` | pre-approved pixel regions (file, region, reason, date, requested_by); remove once approved |

Rules
- Any changed approved sprite fails the gate unless every changed pixel is inside an `allowed_changes.json` region.
- Any PNG in `public/sprites/` without a golden fails (unapproved art).
- `scripts/spritelint.mjs` is sha-pinned here, so the lint can't be weakened silently.
- Refresh goldens only after Taylor approves: `python3 scripts/art/golden.py approve <files>`.
- PRs touching anything in `art/golden/` (including `allowed_changes.json`) are **never** auto-merged; Taylor merges them.
  Only PRs that touch nothing but `public/sprites/**` and/or `docs/art/**` can auto-merge (`.github/workflows/art-automerge.yml`).
