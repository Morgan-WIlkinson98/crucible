# Crucible — technical notes

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Electron main (src/main/main.js)                           │
│  ├─ tray, settings (userData/settings.json), job runner    │
│  ├─ orb window    — 96px transparent, NORMAL window level  │
│  │   (not always-on-top → sits on desktop, hidden by apps) │
│  ├─ wheel window  — 520px transparent overlay,             │
│  │   screen-saver level while shown, visibleOnFullScreen   │
│  ├─ settings window                                        │
│  ├─ hidden window — printToPDF for any HTML → PDF path     │
│  └─ crucible-agent bridge (macOS only) ────┐               │
└────────────────────────────────────────────│───────────────┘
                                             │ JSON lines
┌────────────────────────────────────────────▼───────────────┐
│ crucible-agent (Swift, macOS)                              │
│  CGEventTap → drag detection, modifier taps, drop coords   │
│  NSPasteboard(.drag) → file URLs mid-drag                  │
│  Vision OCR, NSSharingService (AirDrop/Share)              │
└────────────────────────────────────────────────────────────┘
```

## The two input flows

**Orb flow (macOS + Windows):** HTML5 drop on the orb → `orb:dropped` IPC with
resolved paths (`webUtils.getPathForFile`) → wheel opens at drop point → click
or continue-drag-and-release on a wedge → job runs.

**Global drag flow (macOS only):** the agent's listen-only `CGEventTap` detects
left-down + movement, reads `NSPasteboard(.drag)` for file URLs, and streams
events. `Shift`/`Cmd`/`Ctrl` taps arrive as `flagsChanged` while the button is
held → main opens/switches the wheel under the cursor; mouse-up sends drop
coordinates → wheel resolves the wedge under the point. Requires **Input
Monitoring** permission (requested on first run).

## Platform gating

`src/shared/formats.js` is the single source of truth for the conversion
matrix. Each format and each matrix cell can carry `platforms: ['darwin']`.
The wheel asks the registry for options at drop time, so Windows never sees
macOS-only cells and vice-versa. `tools.js`/`actions.js` use the same flag.

| macOS-only capability | Mechanism |
|---|---|
| .pages / .numbers / .key in & out | AppleScript export/save through the iWork apps (`osascript`) |
| PPT/PPTX → PDF/images | Keynote.app export → pdfjs rasterization |
| RTF/RTFD/DOC/.textclipping | `textutil` |
| HEIC output | `sips -s format heic` |
| OCR | Vision `VNRecognizeTextRequest` via agent |
| AirDrop / Share | `NSSharingService` via agent |
| Global drag | `CGEventTap` via agent — needs Input Monitoring |

Windows keeps the full cross-platform matrix (ffmpeg/sharp/pdfjs/SheetJS/
pdf-lib/docx/pptxgenjs/mammoth/jszip/node-unrar).

## Conversion routing

`src/converters/index.js` dispatches on input extension → engine:

- `image.js` — sharp (+ heic-convert decode, sips for HEIC encode, ffmpeg for BMP)
- `av.js` — bundled `ffmpeg-static`/`ffprobe-static` (unpacked from asar)
- `pdf.js` — pdfjs-dist (text, embedded images, page rasterization via
  @napi-rs/canvas), pdf-lib (merge/split/rotate/extract), pptxgenjs, docx
- `epub.js` — hand-rolled EPUB 3 reader/writer on jszip
- `documents.js` — mammoth (DOCX), marked (MD), HTML → PDF via printToPDF
- `spreadsheets.js` — SheetJS
- `subtitles.js`, `archives.js` — pure JS
- `apple.js` — everything above marked 🍎

Chained cells (e.g. `pdf → pages`) convert to an intermediate format in a temp
dir, then hand off to the platform engine.

## Building

| | Command | Notes |
|---|---|---|
| Dev | `npm start` | agent auto-compiles via `swiftc` if missing |
| Tests | `npm test` | pure-Node smoke tests, no Electron required |
| DMG | `npm run dist:mac` | arm64 + x64, unsigned |
| EXE | `npm run dist:win` | requires Windows or CI (NSIS needs no Wine on Windows runners) |
| CI | `.github/workflows/release.yml` | tag `v*` → dmg + exe on a GitHub Release |

Binaries are unsigned. macOS: hardened runtime + permissive entitlements are
set so the build survives ad-hoc signing; Gatekeeper bypass steps are in the
README.

## Packaging notes

- `asarUnpack` for `ffmpeg-static`, `ffprobe-static`, `sharp`, `@napi-rs/canvas`
  (native binaries can't load from inside asar). `util.js` rewrites
  `app.asar` → `app.asar.unpacked` when resolving ffmpeg paths.
- `crucible-agent` ships via `mac.extraResources` → `Contents/Resources/bin/`.
- pdfjs-dist v4 is ESM — loaded via dynamic `import()` with `@napi-rs/canvas`
  globals (`DOMMatrix`, `Path2D`, `ImageData`) shimmed onto `globalThis`.
