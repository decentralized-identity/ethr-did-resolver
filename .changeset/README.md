# Changesets

This folder contains [changesets](https://github.com/changesets/changesets) — the release management tool
used by this monorepo. Releases are versioned per package and published automatically from the `master`
branch via the Changesets GitHub Action.

## How to release

1. When you make a change that should reach consumers (a fix, feature or breaking change), run:

   ```sh
   pnpm changeset
   ```

   and answer the prompts: select the package(s) you changed and the semver bump
   (`patch` for fixes, `minor` for features, `major` for breaking changes).
   This creates a small markdown file in `.changeset/` that describes the change.

2. Commit the changeset file together with your change. The `changeset-bot`/
   CI may remind you if a changed package has no changeset.

3. When the PR merges, the Changesets Action opens a `chore(release): version packages` PR.
   Merging that PR bumps versions, updates per-package `CHANGELOG.md` files and — once merged —
   publishes the bumped packages to npm and creates GitHub releases.

> Changes that don't touch published behaviour (tests, docs, build tooling only) can add an
> **empty changeset** with `pnpm changeset --empty` so the release PR doesn't pick them up.

## Maintaining this config

See `.changeset/config.json` for options like `fixed`/`linked` groups (if packages must
always version together) and prerelease setup.