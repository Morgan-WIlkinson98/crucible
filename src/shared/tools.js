// File tools registry — the second wheel (Cmd/Ctrl).
// appliesTo: array of categories or '*' for anything.
// needsInput: fields to prompt for before running.
const { CATEGORY } = require('./formats');

const TOOLS = [
  // ---- universal ----
  { id: 'zip',       label: 'Compress to ZIP',   appliesTo: '*', icon: 'archive' },
  { id: 'extract',   label: 'Extract archive',   appliesTo: [CATEGORY.ARCHIVE], icon: 'unarchive' },
  { id: 'checksum',  label: 'SHA-256 checksum',  appliesTo: '*', icon: 'hash' },
  { id: 'splitfile', label: 'Split into parts',  appliesTo: '*', icon: 'split',
    needsInput: [{ key: 'sizeMB', label: 'Part size (MB)', type: 'number', def: 10 }] },
  { id: 'joinparts', label: 'Join split parts',  appliesTo: '*', icon: 'join' },
  { id: 'rename',    label: 'Rename…',           appliesTo: '*', icon: 'rename',
    needsInput: [{ key: 'name', label: 'New name (no ext)', type: 'text', def: '' }] },

  // ---- images ----
  { id: 'img-compress', label: 'Compress image',   appliesTo: [CATEGORY.IMAGE], icon: 'compress' },
  { id: 'img-resize',   label: 'Resize 50%',       appliesTo: [CATEGORY.IMAGE], icon: 'resize' },
  { id: 'img-resize-w', label: 'Resize to width…', appliesTo: [CATEGORY.IMAGE], icon: 'resize',
    needsInput: [{ key: 'width', label: 'Width (px)', type: 'number', def: 1024 }] },
  { id: 'img-rotate',   label: 'Rotate 90°',       appliesTo: [CATEGORY.IMAGE], icon: 'rotate' },
  { id: 'img-flip',     label: 'Flip horizontal',  appliesTo: [CATEGORY.IMAGE], icon: 'flip' },
  { id: 'img-gray',     label: 'Grayscale',        appliesTo: [CATEGORY.IMAGE], icon: 'gray' },
  { id: 'img-strip',    label: 'Strip metadata',   appliesTo: [CATEGORY.IMAGE], icon: 'clean' },
  { id: 'img-ocr',      label: 'Extract text (OCR)', appliesTo: [CATEGORY.IMAGE], icon: 'ocr',
    platforms: ['darwin'] }, // Vision framework via crucible-agent

  // ---- video ----
  { id: 'vid-compress', label: 'Compress video',   appliesTo: [CATEGORY.VIDEO], icon: 'compress' },
  { id: 'vid-trim',     label: 'Trim…',            appliesTo: [CATEGORY.VIDEO, CATEGORY.AUDIO], icon: 'trim',
    needsInput: [
      { key: 'start', label: 'Start (s or mm:ss)', type: 'text', def: '0' },
      { key: 'end',   label: 'End (s or mm:ss)',   type: 'text', def: '' }] },
  { id: 'vid-mute',     label: 'Remove audio',     appliesTo: [CATEGORY.VIDEO], icon: 'mute' },
  { id: 'vid-audio',    label: 'Extract audio (MP3)', appliesTo: [CATEGORY.VIDEO], icon: 'audio' },
  { id: 'vid-frames',   label: 'Extract frames',   appliesTo: [CATEGORY.VIDEO], icon: 'frames' },
  { id: 'vid-speed',    label: 'Change speed…',    appliesTo: [CATEGORY.VIDEO], icon: 'speed',
    needsInput: [{ key: 'factor', label: 'Speed (e.g. 0.5, 2)', type: 'number', def: 2 }] },
  { id: 'vid-merge',    label: 'Merge videos',     appliesTo: [CATEGORY.VIDEO], icon: 'merge', multi: true },

  // ---- audio ----
  { id: 'aud-merge',    label: 'Merge audio',      appliesTo: [CATEGORY.AUDIO], icon: 'merge', multi: true },
  { id: 'aud-norm',     label: 'Normalize volume', appliesTo: [CATEGORY.AUDIO], icon: 'norm' },

  // ---- pdf ----
  { id: 'pdf-merge',    label: 'Merge PDFs',       appliesTo: [CATEGORY.PDF], icon: 'merge', multi: true },
  { id: 'pdf-split',    label: 'Split pages',      appliesTo: [CATEGORY.PDF], icon: 'split' },
  { id: 'pdf-extract',  label: 'Extract pages…',   appliesTo: [CATEGORY.PDF], icon: 'pages',
    needsInput: [{ key: 'range', label: 'Pages (e.g. 1-3,5)', type: 'text', def: '1' }] },
  { id: 'pdf-rotate',   label: 'Rotate pages 90°', appliesTo: [CATEGORY.PDF], icon: 'rotate' },
];

function toolsFor(category, platform = process.platform) {
  return TOOLS.filter((t) => {
    if (t.platforms && !t.platforms.includes(platform)) return false;
    return t.appliesTo === '*' || t.appliesTo.includes(category);
  });
}

module.exports = { TOOLS, toolsFor };
