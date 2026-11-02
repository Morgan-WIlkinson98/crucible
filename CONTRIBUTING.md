# Contributing

## Branches

| Branch | Purpose |
|---|---|
| `main` | Releases — tagged `v*` builds publish DMG/EXE via CI |
| `dev` | Integration — feature branches merge here without a PR |
| `release/<yyyy-mm-dd>` | Release prep — cut from `dev`, PR to `main` |
| `feature/*` | New work — one issue per branch |

## The flow

1. **Fetch latest, file an issue, branch off `dev`**
   ```bash
   git fetch --all --prune
   git checkout dev && git pull --ff-only
   gh issue create
   git checkout -b feature/my-thing
   ```
2. **Add a changelog entry** — one Pending file per change under
   `changelog/unreleased/` (`<yyyy-mm-dd>-<issue>-<slug>.md`).
3. **Test locally** — `npm test` (converter smoke tests) +
   `npm start` for UI flows; `npm run dist` for packaging changes.
4. **Merge into `dev`** without a PR once the user approves, then
   delete the local feature branch.
5. **Release**: cut `release/<yyyy-mm-dd>` from `dev`, bump the
   `package.json` / `package-lock.json` version and compile the
   changelog there, then open the release PR to `main` — the only PR.
   `main` is protected — the user squash-merges it. Then tag the merge
   commit `v<version>` and push the tag; CI publishes the Release with
   installers attached. Finally merge the release branch into `dev`,
   then `main` into `dev`. Full steps in
   [`docs/DEPLOYMENT-CHECKLIST.md`](docs/DEPLOYMENT-CHECKLIST.md).

## Rules

- **Docs stay in sync with the code.** Any change to code, config,
  build behavior, or the format matrix updates `README.md`,
  `docs/FEATURES.md`, `docs/TECH.md`, and `AGENTS.md` in the same change.
- Every feature branch maps to a GitHub issue — link it in the
  changelog entry and in the release PR body (`Closes #N`).
- Diagrams are **D2** (`docs/diagrams/*.d2` + committed `.svg`), never
  mermaid.
- New dependencies need the vetting checklist in
  [`docs/PACKAGE-SECURITY.md`](docs/PACKAGE-SECURITY.md) — approved
  before install, exact pins, lockfile committed.
- Secrets never go in the repo.
- Release PR descriptions stand alone: **Summary**, **Why**, **Approach**,
  **How to test**, **Review focus**, **Checklist** — drop sections that
  genuinely don't apply rather than leaving them empty.
