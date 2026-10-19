# Crucible

**The zero-click offline file converter.** Drop a file onto the orb — or, on macOS,
drag anywhere and tap a key — a wheel of conversions blooms under your cursor.
Everything runs locally. Your files never leave your machine.

![platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Windows-black)

## How it works

1. **Drag a file** onto the floating orb (or start a drag anywhere on macOS).
2. **Tap a key** — `⇧ Shift` convert · `⌘/⌃` tools · `⌃/Alt` actions.
3. **Drop on a wedge** (or click it). Output lands next to the source file.

- `Esc` cancels · arrow keys + `Enter` work too.
- Multi-file and folder drops supported.
- The orb lives at desktop level — it never floats over your apps or into
  fullscreen windows.

## What's inside

| | macOS | Windows |
|---|---|---|
| Conversion options | ~200 (incl. Pages/Numbers/Keynote) | ~180 |
| File tools | 22 + Vision OCR | 22 |
| File actions | 10 incl. AirDrop / Share sheet | 8 |
| Global drag-to-convert | ✅ via `crucible-agent` | orb only (v2) |

Full per-format matrix: **[docs/FEATURES.md](docs/FEATURES.md)**.
Architecture notes: **[docs/TECH.md](docs/TECH.md)**.

## Install

### macOS

Download `Crucible-*-mac.dmg` from [Releases](../../releases), drag Crucible to
Applications. The build is unsigned — on first launch: right-click → Open, or
`xattr -dr com.apple.quarantine /Applications/Crucible.app`.

For global drag-to-convert, grant **Input Monitoring** permission when prompted
(System Settings → Privacy & Security → Input Monitoring → Crucible), then
relaunch. Without it, the orb still works.

Apple-format conversions (.pages, .numbers, .key) require the corresponding
iWork app installed; macOS will ask permission to let Crucible control it once.

### Windows

Download `Crucible-*-win.exe` (NSIS installer). SmartScreen may warn on unsigned
builds — click *More info → Run anyway*.

## Development

```bash
npm install
node scripts/make-icons.js   # generates build/icon.png + tray icon
npm start                    # dev run
npm test                     # converter smoke tests (no Electron needed)
npm run dist                 # build installer for current OS
```

Releases are built by GitHub Actions on `v*` tags — the repo is public so
runner minutes are free. Tag → `.dmg` (arm64 + x64) + `.exe` land on a GitHub
Release automatically.

## Privacy

Every conversion runs on-device: bundled ffmpeg/sharp/pdfjs for media,
Apple's own apps for iWork formats, and the Vision framework for OCR.
There is no server, no upload, no telemetry.
