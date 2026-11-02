# Contributing

## Branches

| Branch | Purpose |
|---|---|
| `main` | Releases — tagged `v*` builds publish DMG/EXE via CI |
| `dev` | Testing only — features merged in without a PR; never merged into `main` |
| `release/<yyyy-mm-dd>` | Ships several features — cut from `main`, PR to `main` |
| `feature/*` | New work — one issue per branch |

## The flow

1. **Fetch latest, file an issue, branch off `main`**
   ```bash
   git fetch --all --prune
   git checkout main && git pull
   gh issue create
   git checkout -b feature/my-thing
   ```
2. **Open a draft PR** targeting `main` as soon as work starts.
3. **Add a changelog entry** — one Pending file per change under
   `changelog/unreleased/` (`<yyyy-mm-dd>-<issue>-<slug>.md`).
4. **Test locally** — `npm test` (converter smoke tests) +
   `npm start` for UI flows; `npm run dist` for packaging changes.
   To test on `dev`, merge the feature branch into it without a PR once
   the user approves. Nothing branches from `dev`.
5. **Compile the changelog and mark ready for review** — on the feature
   branch, or on a `release/<yyyy-mm-dd>` branch cut from `main` with
   several features merged in. `main` is protected — squash-merge after
   review.
6. **Sync `dev`** — merge the shipped branch into `dev`, then `main`
   into `dev`; delete the branch.
7. **Release**: bump `package.json` version on the branch being shipped;
   after it merges, tag the squash commit on `main` `v<version>` and push
   the tag. CI publishes the Release with installers attached. Full steps
   in [`docs/DEPLOYMENT-CHECKLIST.md`](docs/DEPLOYMENT-CHECKLIST.md).

## Rules

- **Docs stay in sync with the code.** Any change to code, config,
  build behavior, or the format matrix updates `README.md`,
  `docs/FEATURES.md`, `docs/TECH.md`, and `AGENTS.md` in the same PR.
- Every feature branch maps to a GitHub issue — link both directions
  (`Closes #N` in the PR body).
- Diagrams are **D2** (`docs/diagrams/*.d2` + committed `.svg`), never
  mermaid.
- New dependencies need the vetting checklist in
  [`docs/PACKAGE-SECURITY.md`](docs/PACKAGE-SECURITY.md) — approved
  before install, exact pins, lockfile committed.
- Secrets never go in the repo.
- PR descriptions stand alone: **Summary**, **Why**, **Approach**,
  **How to test**, **Review focus**, **Checklist** — drop sections that
  genuinely don't apply rather than leaving them empty.
