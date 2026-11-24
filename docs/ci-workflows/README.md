# Workflows waiting to be installed

`nightly.yml`, `perf.yml` and `shots.yml` belong in `.github/workflows/`. They live here because the
bot's GitHub token can't create workflow files (it lacks the `workflow` scope). To install them:

    git mv docs/ci-workflows/*.yml .github/workflows/

and push with an account or token that has the `workflow` scope. `qa.yml` (lint + build +
test:boot on every PR) is already installed and is the required PR check.

## Art gate + art auto-merge (LOW_OVERSIGHT_SPEC §a)

`qa.yml` here is the full replacement for `.github/workflows/qa.yml` (it adds the
`0 · Changed files`, `art-gate` and `art-preview` jobs; boot/system/lab are unchanged), and
`art-automerge.yml` is new. Install both with an account or token that has the `workflow` scope:

    git mv -f docs/ci-workflows/qa.yml .github/workflows/qa.yml
    git mv docs/ci-workflows/art-automerge.yml .github/workflows/art-automerge.yml

Only PRs that touch nothing but `public/sprites/**` and/or `docs/art/**` can auto-merge.
`art/golden/**`, `allowed_changes.json`, code and workflow changes always wait for Taylor.
