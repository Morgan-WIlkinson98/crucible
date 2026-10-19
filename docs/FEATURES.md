# Crucible feature matrix

Legend: ✅ both platforms · 🍎 macOS only · ❌ not supported

The matrix below is the source of truth — it is generated from the same
registry (`src/shared/formats.js`) that drives the wheel, minus platform
filtering.

## Conversions (Shift wheel)

### Images
| From | To | |
|---|---|---|
| JPG PNG WebP TIFF AVIF BMP HEIC SVG | JPG PNG WebP TIFF AVIF BMP PDF | ✅ |
| (any above) | HEIC | 🍎 via `sips` |

### Audio
| From | To | |
|---|---|---|
| MP3 M4A WAV FLAC OGG Opus AIFF WMA AAC | all of the same set | ✅ ffmpeg |

### Video
| From | To | |
|---|---|---|
| MP4 MOV MKV WebM AVI WMV GIF M4V | MP4 MOV MKV WebM AVI WMV GIF MP3 M4A WAV | ✅ ffmpeg |

### PDF
| To | |
|---|---|
| EPUB (text + embedded images) | ✅ |
| TXT, MD, DOCX, XLSX (best-effort table split), JPG, PNG | ✅ |
| PPTX (one rendered slide per page) | ✅ |
| Pages | 🍎 via Pages.app |

### Documents
| From | To | |
|---|---|---|
| DOCX MD TXT HTML EPUB | PDF HTML TXT MD DOCX EPUB | ✅ |
| DOCX MD TXT HTML | Pages | 🍎 via Pages.app |
| DOC RTF | PDF TXT HTML DOCX | 🍎 via `textutil` (Windows: planned) |
| RTFD, .textclipping | PDF TXT HTML DOCX | 🍎 via `textutil` |
| .pages | PDF DOCX EPUB TXT | 🍎 via Pages.app |

### Slides
| From | To | |
|---|---|---|
| PPT PPTX KEY | PDF, JPG, PNG | 🍎 via Keynote.app |
| KEY | PPTX | 🍎 via Keynote.app |
| PDF | PPTX (image slides) | ✅ |
| PPTX → editable text targets | | ❌ needs real slide rendering (v1.5: LibreOffice headless) |

### Spreadsheets
| From | To | |
|---|---|---|
| XLSX XLS ODS CSV TSV | XLSX XLS ODS CSV TSV PDF | ✅ SheetJS |
| XLSX XLS ODS CSV TSV | Numbers | 🍎 via Numbers.app |
| .numbers | XLSX CSV PDF | 🍎 via Numbers.app |

### Subtitles
| From | To | |
|---|---|---|
| SRT | VTT TXT | ✅ |
| VTT | SRT TXT | ✅ |

### Archives
| From | To | |
|---|---|---|
| ZIP TAR GZ | ZIP TAR GZ | ✅ |
| RAR | ZIP TAR GZ + Extract | ✅ (WASM unrar) |

## File tools (⌘/Ctrl wheel)

| Tool | Files | Platform |
|---|---|---|
| Compress to ZIP | any/files+folders | ✅ |
| Extract archive | zip tar gz rar | ✅ |
| SHA-256 checksum | any | ✅ |
| Split into parts / Join parts | any | ✅ |
| Rename / Batch rename (pattern: `{name} {n} {date} {ext}` + find/replace) | any | ✅ |
| Strip metadata (EXIF, tags, PDF info dict) | image video audio pdf | ✅ |
| Compress / Resize / Rotate / Flip / Grayscale | images | ✅ |
| Annotate text | images | ✅ |
| Extract text (OCR) | images | 🍎 Vision framework |
| Redact text | pdf | ✅ |
| Compress / Trim / Remove audio / Extract MP3 / Extract frames / Change speed / Merge | video | ✅ |
| Trim / Merge / Normalize | audio | ✅ |
| Merge / Split / Extract pages / Rotate | pdf | ✅ |

## File actions (Ctrl/Alt wheel)

| Action | Platform |
|---|---|
| Copy to… / Move to… / Copy path / Duplicate / Float preview / Trash | ✅ |
| Reveal in Finder / Explorer · Open Terminal here | ✅ |
| AirDrop | 🍎 `NSSharingService` |
| Share sheet | 🍎 `NSSharingServicePicker` |

## Deliberately out of scope (v1)

- **Pages/Numbers/Keynote as _output_ on Windows** — Apple proprietary formats;
  no cross-platform writers exist. macOS covers them via the iWork apps.
- **Editable PPTX output from PDF** — v1 emits image-per-slide decks.
- **OS-wide drag detection on Windows** — needs shell drop-source hooks; orb only.
- **Cloud/networked conversions** — never; everything is local.

## Roadmap

- **On-device transcription** (audio/video → text/SRT via whisper.cpp).
- **Watch folders** — auto-convert anything dropped in a watched directory.
- **RAW / PSD / JPEG XL / EXR** image inputs — needs libraw/vips extras.
- **PDF compression** — needs bundled Ghostscript (or qpdf + re-render).
- **Folder-tree preservation** — convert a whole directory and mirror structure.
- **Editable PPTX from PDF** — layout analysis; hard.
- **Global drag on Windows** — `SetWindowsHookEx` + COM drop-source hooks.
- **Notarized/signed releases** — Developer ID cert + SmartScreen cert.
- **Batch queue UI** — persisted job list with retry.
- **Custom scripts as wheel items** — user-defined shell tools on the wheel.
