# Workflows waiting to be installed

`nightly.yml`, `perf.yml` and `shots.yml` belong in `.github/workflows/`. They live here because the
bot's GitHub token can't create workflow files (it lacks the `workflow` scope). To install them:

    git mv docs/ci-workflows/*.yml .github/workflows/

and push with an account or token that has the `workflow` scope. `qa.yml` (lint + build +
test:boot on every PR) is already installed and is the required PR check.
