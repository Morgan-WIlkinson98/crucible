# Dependency & Package Installation Security Policy

> Applies to every human and every AI agent working in this repository.
> **Never install, upgrade, or add a dependency without completing the vetting checklist below.**
> This policy follows the [OpenSSF Concise Guide for Evaluating Open Source Software](https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software.html),
> the [OpenSSF Package Manager Best Practices](https://github.com/ossf/package-manager-best-practices),
> and lessons from recent supply-chain campaigns (e.g. the 2025 "Shai-Hulud" npm worm waves).

This repo's dependency surface is **npm** — `package.json` /
`package-lock.json`. Because Crucible ships a packaged desktop app,
every dependency also lands inside the installers users run — the
blast radius is bigger than a server-side dep.

## Why this exists

`npm install` is a remote code execution primitive, not a harmless
convenience. Malicious `preinstall`/`postinstall` scripts, typosquatted
names, and compromised maintainer releases are the top open-source
attack vectors today. Every dependency is attack surface — treat adding
one as a security decision.

## Pre-Install Vetting Checklist

### 1. Necessity — build first
- [ ] Always try building the functionality in-repo first: standard
      library, an existing dependency, or a small amount of code. If the
      in-repo implementation works, do not install.
- [ ] Before adding any package, weigh build-yourself vs. third-party
      (implementation effort, maintenance burden, supply-chain surface,
      features gained) and present the comparison with a recommendation —
      proceed only after approval.
- [ ] Is the package's weight proportionate? (Avoid a 500-dependency tree
      for a one-line utility.)

### 2. Authenticity — defeat typosquatting
- [ ] The package name is verified **character-by-character** against the
      project's official documentation or repository — never guessed.
- [ ] The registry page links back to the same source repository you trust
      (bidirectional link check). Watch for attacker-controlled forks.
- [ ] Beware lookalike tricks: swapped letters, hyphens vs underscores,
      uppercase variants, and "first-come, first-served" org names.

### 3. Reputation & maintenance
- [ ] Download/dependent counts and repository stars/contributors are
      consistent with a real, adopted project.
- [ ] Meaningful commit activity and a release within the last 12 months.
- [ ] Prefer projects with more than one maintainer; treat
      single-maintainer packages with extra scrutiny.
- [ ] Project shows security-conscious practices: branch protection, CI
      tests, security policy, timely fix history.

### 4. Vulnerability status
- [ ] The exact version being installed has **no known unpatched Critical
      or High vulnerabilities** in [OSV](https://osv.dev) /
      [deps.dev](https://deps.dev).
- [ ] The package is not listed in the OSV malicious-packages dataset.

### 5. Freshness / provenance
- [ ] Prefer versions published more than **7–30 days** ago — fresh
      releases are peak worm-attack windows; justify anything newer.
- [ ] Where available, prefer packages with provenance attestations /
      Sigstore signatures / SLSA provenance.
- [ ] Check the project's OpenSSF Scorecard score on deps.dev; treat a
      score below ~5 as a red flag requiring justification.

### 6. Install-time behavior
- [ ] Check whether the package ships install scripts (`preinstall`,
      `install`, `postinstall`). Prefer installing with scripts disabled
      when the package works without them. (Note: `electron`,
      `ffmpeg-static`, `ffprobe-static`, `sharp`, and `@napi-rs/canvas`
      legitimately need their install scripts to fetch binaries — vet
      them individually, then use `npm approve-scripts`.)
- [ ] Reject packages whose install scripts fetch and execute remote code
      beyond a fixed binary download.

### 7. Determinism
- [ ] Pin **exact** versions — no floating `*`/`latest` ranges.
- [ ] Always commit the lockfile (`package.json` + `package-lock.json`
      together, never one without the other).

## Desktop-app specifics

- **Native/binary deps** (`ffmpeg-static`, `ffprobe-static`, `sharp`,
  `@napi-rs/canvas`) must be listed in `asarUnpack` in
  `electron-builder.yml`, and verified inside a packaged build
  (`npm run dist`, not just `npm start`) — bundled-binary paths break
  differently inside an app bundle.
- **ffmpeg licensing**: `ffmpeg-static` ships GPL-enabled builds
  (libx264 etc.). We run it as a separate child process — keep it that
  way; never link ffmpeg into the app binary.
- **Sideloaded binaries** (`crucible-agent`, anything in
  `extraResources`) must be built from in-repo source in CI — never
  commit opaque binaries.

## Automatic Reject Conditions

Reject the package outright, and stop, if **any** of these hold:

- The exact version has a known unpatched Critical/High vulnerability.
- The package appears in a malicious-packages database.
- The name or repository cannot be verified as authentic (typosquat).
- The "package" exists only as a personal fork masquerading as the original.
- Its install behavior requires remote-code-fetch to work.

## After Installing

- Run `npm audit` and record the result.
- Review the transitive dependency tree (`npm ls`, deps.dev).
- Commit manifest + lockfile together.
- Re-run `npm test`.

## Agent-Specific Rules

- **Report before installing**: short vetting summary — name, exact
  version, purpose, deps.dev result, vulnerability status, publish age —
  and get approval before any install not already in the
  manifest/lockfile. Routine `npm ci` of already-vetted deps doesn't
  need re-vetting.
- **Never bypass protections**: no `--no-save` side installs, no
  `curl | sh`, no `--audit=false`. (`--ignore-scripts` is allowed only
  as a protective measure, not to silence checks.)
- **No new registries/sources** without explicit approval — npmjs.com
  only.
