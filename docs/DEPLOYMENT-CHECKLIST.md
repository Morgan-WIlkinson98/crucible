# Deployment Checklist

## Release

`dev` reaches `main` only through a release branch. Every push, the
release PR, and the tag push require the user's explicit approval.

1. Cut the release branch from an up-to-date `dev`:
   ```bash
   git fetch --all --prune
   git switch dev && git pull --ff-only
   git switch -c release/<yyyy-mm-dd>
   ```
2. Bump the version on the release branch: `package.json` `version` and
   both `version` fields in `package-lock.json` (top level and
   `packages[""]`), e.g. `npm version <x.y.z> --no-git-tag-version`.
3. Compile the changelog: move each `changelog/unreleased/*.md` entry into
   the current year section of `CHANGELOG.md` as Approved, delete the
   compiled entry files, keep `changelog/unreleased/.gitkeep`. Commit
   `docs(changelog): compile release <yyyy-mm-dd>`.
4. Push the release branch and open the release PR to `main` — the only
   PR in the workflow. Its description lists every entry with its issue
   and `Changes` link (Summary / Why / Approach / How to test / Review
   focus / Checklist).
5. The user merges the release PR. Never merge it on the user's behalf.
6. Tag the squash commit on `main` and push the tag — this triggers
   `.github/workflows/release.yml`, which builds the `.dmg` (arm64 + x64)
   and `.exe` and publishes the GitHub Release. Tags are immutable, so
   confirm the commit and version before pushing:
   ```bash
   git fetch --all --prune
   git tag v<version> origin/main
   git push origin v<version>
   ```
7. Merge the release branch into `dev`, then `main` into `dev`, and push
   `dev`:
   ```bash
   git switch dev && git pull --ff-only
   git merge --no-ff release/<yyyy-mm-dd>
   git merge --no-ff origin/main
   git push origin dev
   ```
8. Confirm the GitHub Release has the `.dmg` and `.exe` attached.
9. Ask before deleting the merged release branch.
