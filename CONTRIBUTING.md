# Contributing

## Branches

| Branch | Purpose |
|---|---|
| `main` | Releases — tagged `v*` builds publish DMG/EXE via CI |
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
3. **Test locally** — `npm test` (converter smoke tests) +
   `npm start` for UI flows; `npm run dist` for packaging changes.
4. **Mark ready for review.** `main` is protected — squash-merge after
   review, delete the branch.
5. **Release**: bump `package.json` version on `main`, push a `v*` tag.
   CI publishes the Release with installers attached.

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
