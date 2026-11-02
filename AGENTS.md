# Crucible — Agent Rules

## Documentation sync (required)

Any change to code, config, build behavior, or the supported-format
matrix MUST update the docs in the **same change** so they always match the
real state:

- `README.md` — feature summary, install steps, platform table
- `docs/FEATURES.md` — the conversion/tool/action matrix and platform
  availability markers (✅ / 🍎 / ❌) must mirror `src/shared/*.js`
  exactly — the registry is the source of truth
- `docs/TECH.md` — architecture, engines, packaging notes
- `docs/diagrams/*.d2` + rendered `.svg` — if architecture changed
- `AGENTS.md` — if rules/processes changed

Never leave docs describing removed formats, retired engines, or dead
build steps. If you notice stale docs while working, fix them.

## Workflow

See `CONTRIBUTING.md`. In short:

- `git fetch --all --prune` first; base everything off latest `dev`.
- Every feature starts from a **GitHub issue** — create it first, link
  it in the changelog entry and the release PR (`Closes #N`).
- Feature branches named `feature/<short-description-or-issue>`, cut
  from `dev` — never commit directly to `main`.
- Every change adds one Pending entry under `changelog/unreleased/`.
- Feature branches merge into `dev` **without a PR**, after the user
  approves the merge.
- Releases: cut `release/<yyyy-mm-dd>` from `dev`, bump the version and
  compile the changelog there, and open the release PR to `main` — the
  **only PR** in the workflow. Its description must stand alone
  (Summary / Why / Approach / How to test / Review focus / Checklist —
  drop items that genuinely don't apply).
- **Never merge to `main`** without the user's explicit instruction.
  Open the release PR, hand it over, stop.
- After the user merges the release PR: tag the squash commit on `main`
  `v<version>` and push the tag (CI builds the `.dmg` (arm64+x64) and
  `.exe` and publishes the GitHub Release), then merge the release
  branch into `dev`, then `main` into `dev`, and push `dev`. Full steps
  in `docs/DEPLOYMENT-CHECKLIST.md`.
- After a merge into `dev`, delete the local feature branch.

## Agent operating rules

- **Never steal focus on the user's machine** — no commands that open
  browser windows or GUI apps (`open`, `osascript … activate`, auth
  flows). If a browser step is required, print the URL and ask.
- **Never merge to `main`** — see above.
- **Diagrams: D2, not mermaid** — write diagrams in
  [D2](https://d2lang.com); `d2` is installed on this machine. Keep
  `.d2` sources under `docs/diagrams/` and commit the rendered `.svg`
  alongside them. ASCII art is fine inside code comments only.

## Package & dependency security (required)

**Never install, upgrade, or add a dependency without completing the
vetting checklist in [`docs/PACKAGE-SECURITY.md`](docs/PACKAGE-SECURITY.md).**
In short: build-first over install, character-by-character name
verification, no unpatched Critical/High, prefer 7–30+ day old releases,
pin exact versions, always commit `package.json` + `package-lock.json`
together, run `npm audit` after.

Dependencies that ship native binaries (`ffmpeg-static`, `sharp`,
`@napi-rs/canvas`, `ffprobe-static`) have extra packaging implications —
they must be in `asarUnpack` in `electron-builder.yml` and verified to
work inside a packaged build, not just `npm start`.

## Data safety — user files (CRITICAL)

This app **creates, moves, renames, splits, and trashes user files**.
Every operation must be safe by construction:

- **Never delete or overwrite a source file as part of a conversion** —
  outputs are always new files; collision avoidance (`outPath`) is
  mandatory.
- **Move/Trash are the only destructive actions** — Trash must use
  `shell.trashItem` (recoverable), never `fs.rm`.
- **Compound create-then-delete must be strictly ordered** — e.g.
  `joinparts` deletes nothing; `split` never removes the original. A
  failed conversion leaves the source byte-identical.
- **Verify output before reporting success** — the file must exist and
  parse/decode (tests cover this).
- If a rule can't be met, the operation doesn't ship.

## Repo context

- Electron + plain JS (no bundler); main process owns all conversion
  engines so they stay testable in plain Node (`npm test`).
- `crucible-agent` (Swift, `swift/`) is macOS-only — CGEventTap global
  drag detection, drag-pasteboard file capture, Vision OCR,
  NSSharingService. Compiled via `npm run build:agent`.
- Platform gating lives in `src/shared/` registries — never hardcode a
  `darwin` check outside the registry/converters boundary.
- Conversions must be 100% local — no network calls for file content,
  ever. That is the product's identity.
