# Deployment Checklist

## Ship to main

`dev` is a testing branch only — it is never merged into `main`. Every
push, every PR, merges into `dev`, and the tag push require the user's
explicit approval.

1. Choose the branch to ship:
   - **Single feature** — the feature branch, updated from `main`:
     ```bash
     git fetch --all --prune
     git switch feature/<name> && git merge --no-ff origin/main
     ```
   - **Several features** — a release branch cut from `main` with the
     chosen features merged in:
     ```bash
     git fetch --all --prune
     git switch -c release/<yyyy-mm-dd> --no-track origin/main
     git merge --no-ff feature/<name>   # repeat per feature
     ```
2. For an app release, bump the version on the shipped branch:
   `package.json` `version` and both `version` fields in
   `package-lock.json` (top level and `packages[""]`), e.g.
   `npm version <x.y.z> --no-git-tag-version`.
3. Compile the changelog on the shipped branch right before its PR:
   move each `changelog/unreleased/*.md` entry into the current year
   section of `CHANGELOG.md` as Approved, delete the compiled entry
   files, keep `changelog/unreleased/.gitkeep`. Commit
   `docs(changelog): compile <feature-name | release yyyy-mm-dd>`.
4. Push the branch and open the PR to `main` (or mark the draft ready).
   The description stands alone (Summary / Why / Approach / How to test
   / Review focus / Checklist); a release PR lists every entry with its
   issue. Replace the placeholder PR number in the compiled changelog
   links in a follow-up commit on the same branch.
5. The user merges the PR. Never merge it on the user's behalf.
6. For an app release, tag the squash commit on `main` and push the tag
   — this triggers `.github/workflows/release.yml`, which builds the
   `.dmg` (arm64 + x64) and `.exe` and publishes the GitHub Release.
   Tags are immutable, so confirm the commit and version before pushing:
   ```bash
   git fetch --all --prune
   git tag v<version> origin/main
   git push origin v<version>
   ```
7. Sync `dev`: merge the shipped branch into `dev`, then `main` into
   `dev`, and push `dev`:
   ```bash
   git switch dev && git pull --ff-only
   git merge --no-ff <feature/name | release/yyyy-mm-dd>
   git merge --no-ff origin/main
   git push origin dev
   ```
   Verify `git diff origin/main dev -- CHANGELOG.md` is empty first.
8. For an app release, confirm the GitHub Release has the `.dmg` and
   `.exe` attached.
9. Ask before deleting the shipped branch.
