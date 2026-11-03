# Changelog

Changes merged to `main`, newest first. Changes still in progress are in
[changelog/unreleased/](changelog/unreleased/) with status Pending.

**Archives:** none yet

## 2026

### 2026-11-02 — Adopt branch workflow and changelog standard

- **Status:** Approved
- **Type:** Change
- **Issue:** [#26](https://github.com/Morgan-WIlkinson98/crucible/issues/26)
- **Pull request:** [#27](https://github.com/Morgan-WIlkinson98/crucible/pull/27) · [Files changed](https://github.com/Morgan-WIlkinson98/crucible/pull/27/files)

**What changed:** Feature branches still start from `main` and ship by PR to `main` — singly from the feature branch, or several together via a `release/<yyyy-mm-dd>` branch cut from `main`. `dev` is added as a testing-only branch (features merged in without a PR, never merged into `main`) and is synced after each merge. App version bumps now go on the shipped branch instead of directly on `main`. Adds `CHANGELOG.md`, `changelog/unreleased/` entries, and a Ship to main section in `docs/DEPLOYMENT-CHECKLIST.md`.

**Why:** `main` is protected by the org ruleset (PR required, squash/rebase only), so version bumps can no longer be committed directly to `main`, and changes need a reviewable changelog.

