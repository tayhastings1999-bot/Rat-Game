#!/usr/bin/env bash
# One-shot art gate for Scurry (Rat-Game CI port of scurry-art/pipeline/gate.sh). Exit 0 = PASS, 1 = FAIL.
#   bash scripts/art/gate.sh            (from anywhere; CI job: art-gate)
# Runs: spritelint -> golden check -> bleed check -> budget check -> guard selftest, then prints a short
# PASS/FAIL summary and the "Exceptions for Taylor" list. Read-only on art. Reports go to scripts/out/art/.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
R="$REPO/scripts/out/art"; mkdir -p "$R"
LOG="$R/gate.log"; : > "$LOG"
: > "$R/rc.txt"
run () { # name, command...
  local name="$1"; shift
  echo "### $name" >> "$LOG"
  ( "$@" ) >> "$LOG" 2>&1; local rc=$?
  echo "$name=$rc" >> "$R/rc.txt"; return 0
}
run spritelint bash -c "cd '$REPO' && node scripts/spritelint.mjs public/sprites"
# Walk sprites: #39 ships them flat in public/sprites/ (hero_<hero>_walk_<dir>_NN.png). The pipeline's walk checks
# expect <hero>/frames/ + atlas_*_walk_*.json, so stage symlinks in that shape (assets are never moved) and point
# SCURRY_WALK_DIR at it. An explicitly set SCURRY_WALK_DIR is used as is; set-but-empty FAILS in budget_check.py.
if [ -z "${SCURRY_WALK_DIR+x}" ]; then
  rm -rf "$R/walk"
  "$PY" "$HERE/stage_walks.py" "$R/walk" >> "$LOG" 2>&1
  if compgen -G "$R/walk/*/frames/hero_*_walk_*.png" > /dev/null; then export SCURRY_WALK_DIR="$R/walk"; fi
fi
if [ -n "${SCURRY_WALK_DIR+x}" ]; then
  for d in "$SCURRY_WALK_DIR"/*/frames; do
    [ -d "$d" ] && run "spritelint_walk_$(basename "$(dirname "$d")")" bash -c "cd '$REPO' && node scripts/spritelint.mjs '$d'"
  done
fi
run golden     "$PY" "$HERE/golden.py" check  --json "$R/golden.json"
run bleed      "$PY" "$HERE/golden.py" bleed  --json "$R/bleed.json"
run budget     "$PY" "$HERE/budget_check.py"  --json "$R/budget.json"
run selftest   "$PY" "$HERE/golden.py" selftest
"$PY" "$HERE/gate_summary.py" "$R" | tee "$R/summary.txt"
exit "${PIPESTATUS[0]}"
