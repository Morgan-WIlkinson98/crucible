# Adopt dev/release workflow and changelog standard

- **Status:** Pending
- **Type:** Change
- **Issue:** _added once the issue is created_
- **Branch:** `feature/adopt-standards`

## What changed
Feature branches now start from and merge into `dev` without a PR; `dev` reaches `main` only through a `release/<yyyy-mm-dd>` branch and release PR. Adds `CHANGELOG.md`, `changelog/unreleased/` entries, and a Release section in `docs/DEPLOYMENT-CHECKLIST.md`.

## Why
`main` is protected by the org ruleset (PR required, squash/rebase only), so version bumps can no longer be committed directly to `main`, and changes need a reviewable changelog.
