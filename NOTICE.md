# Third-Party Notices

Crucible bundles the following components. Each remains the property of
its respective authors and is used under its own license.

## Executables (separate processes, not linked)

| Component | License | Purpose |
|---|---|---|
| ffmpeg (`ffmpeg-static`) | LGPL 2.1+ (GPL-enabled build) | Audio/video/GIF conversion and tools |
| ffprobe (`ffprobe-static`) | LGPL 2.1+ | Media stream inspection |

ffmpeg is invoked as a separate child process. Its source and license:
https://ffmpeg.org — https://ffmpeg.org/legal.html

## Node packages

| Package | License |
|---|---|
| Electron | MIT |
| sharp | Apache-2.0 |
| @napi-rs/canvas | MIT |
| pdfjs-dist | Apache-2.0 |
| pdf-lib | MIT |
| mammoth | BSD-2-Clause |
| marked | MIT |
| xlsx (SheetJS Community) | Apache-2.0 |
| jszip | MIT |
| docx | MIT |
| pptxgenjs | MIT |
| archiver | MIT |
| tar | ISC |
| extract-zip | BSD-2-Clause |
| node-unrar-js | MIT (uses unrar sources) |
| heic-convert | MIT |
| electron-builder | MIT |

## macOS system components

Pages.app, Numbers.app, Keynote.app, textutil, sips, and the Vision
framework are Apple system software invoked at runtime on the user's
machine — not distributed with Crucible.
