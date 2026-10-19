// Format registry — the conversion matrix.
// Every entry declares which extensions it handles as INPUT and which
// extensions it can emit as OUTPUT, plus platform availability.
// `platforms` omitted = all platforms. 'darwin' = macOS only (Apple tech).

const IS_MAC = process.platform === 'darwin';

// Category ids
const CATEGORY = {
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  PDF: 'pdf',
  DOC: 'document',
  SLIDES: 'slides',
  SHEET: 'spreadsheet',
  SUB: 'subtitle',
  ARCHIVE: 'archive',
};

// ---- Format metadata -------------------------------------------------------
// key: extension (lowercase, no dot)
const FORMATS = {
  // images
  jpg:  { name: 'JPG',  cat: CATEGORY.IMAGE },
  jpeg: { name: 'JPEG', cat: CATEGORY.IMAGE, alias: 'jpg' },
  png:  { name: 'PNG',  cat: CATEGORY.IMAGE },
  webp: { name: 'WebP', cat: CATEGORY.IMAGE },
  heic: { name: 'HEIC', cat: CATEGORY.IMAGE },
  tiff: { name: 'TIFF', cat: CATEGORY.IMAGE },
  tif:  { name: 'TIFF', cat: CATEGORY.IMAGE, alias: 'tiff' },
  avif: { name: 'AVIF', cat: CATEGORY.IMAGE },
  bmp:  { name: 'BMP',  cat: CATEGORY.IMAGE },
  svg:  { name: 'SVG',  cat: CATEGORY.IMAGE },
  // audio
  mp3:  { name: 'MP3',  cat: CATEGORY.AUDIO },
  m4a:  { name: 'M4A',  cat: CATEGORY.AUDIO },
  wav:  { name: 'WAV',  cat: CATEGORY.AUDIO },
  flac: { name: 'FLAC', cat: CATEGORY.AUDIO },
  ogg:  { name: 'OGG',  cat: CATEGORY.AUDIO },
  opus: { name: 'Opus', cat: CATEGORY.AUDIO },
  aiff: { name: 'AIFF', cat: CATEGORY.AUDIO },
  aif:  { name: 'AIFF', cat: CATEGORY.AUDIO, alias: 'aiff' },
  wma:  { name: 'WMA',  cat: CATEGORY.AUDIO },
  aac:  { name: 'AAC',  cat: CATEGORY.AUDIO },
  // video
  mp4:  { name: 'MP4',  cat: CATEGORY.VIDEO },
  mov:  { name: 'MOV',  cat: CATEGORY.VIDEO },
  mkv:  { name: 'MKV',  cat: CATEGORY.VIDEO },
  webm: { name: 'WebM', cat: CATEGORY.VIDEO },
  avi:  { name: 'AVI',  cat: CATEGORY.VIDEO },
  wmv:  { name: 'WMV',  cat: CATEGORY.VIDEO },
  gif:  { name: 'GIF',  cat: CATEGORY.VIDEO },
  m4v:  { name: 'M4V',  cat: CATEGORY.VIDEO },
  // pdf
  pdf:  { name: 'PDF', cat: CATEGORY.PDF },
  // documents
  docx: { name: 'DOCX', cat: CATEGORY.DOC },
  doc:  { name: 'DOC',  cat: CATEGORY.DOC },
  pages:{ name: 'Pages', cat: CATEGORY.DOC, platforms: ['darwin'] },
  md:   { name: 'Markdown', cat: CATEGORY.DOC },
  txt:  { name: 'Text', cat: CATEGORY.DOC },
  html: { name: 'HTML', cat: CATEGORY.DOC },
  rtf:  { name: 'RTF',  cat: CATEGORY.DOC },
  rtfd: { name: 'RTFD', cat: CATEGORY.DOC, platforms: ['darwin'] },
  textclipping: { name: 'Text Clipping', cat: CATEGORY.DOC, platforms: ['darwin'] },
  epub: { name: 'EPUB', cat: CATEGORY.DOC },
  // slides
  pptx: { name: 'PPTX', cat: CATEGORY.SLIDES },
  ppt:  { name: 'PPT',  cat: CATEGORY.SLIDES },
  key:  { name: 'Keynote', cat: CATEGORY.SLIDES, platforms: ['darwin'] },
  // spreadsheets
  xlsx: { name: 'XLSX', cat: CATEGORY.SHEET },
  xls:  { name: 'XLS',  cat: CATEGORY.SHEET },
  ods:  { name: 'ODS',  cat: CATEGORY.SHEET },
  csv:  { name: 'CSV',  cat: CATEGORY.SHEET },
  tsv:  { name: 'TSV',  cat: CATEGORY.SHEET },
  numbers: { name: 'Numbers', cat: CATEGORY.SHEET, platforms: ['darwin'] },
  // subtitles
  srt:  { name: 'SRT', cat: CATEGORY.SUB },
  vtt:  { name: 'VTT', cat: CATEGORY.SUB },
  // archives
  zip:  { name: 'ZIP', cat: CATEGORY.ARCHIVE },
  tar:  { name: 'TAR', cat: CATEGORY.ARCHIVE },
  gz:   { name: 'GZip', cat: CATEGORY.ARCHIVE },
  rar:  { name: 'RAR', cat: CATEGORY.ARCHIVE },
};

// ---- Conversion matrix -----------------------------------------------------
// INPUT ext -> array of OUTPUT exts. Entries may be { ext, platforms } for
// platform-gated cells. Only the input->output cells that are actually
// implemented by an engine belong here.
const IMAGE_OUTS = ['jpg', 'png', 'webp', 'tiff', 'avif', 'bmp', 'pdf',
                    { ext: 'heic', platforms: ['darwin'] }]; // via sips
const AUDIO_OUTS = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'wma', 'aac'];
const VIDEO_OUTS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'gif', 'mp3', 'm4a', 'wav'];

const MATRIX = {
  // -- images --
  jpg: IMAGE_OUTS, jpeg: IMAGE_OUTS, png: IMAGE_OUTS, webp: IMAGE_OUTS,
  tiff: IMAGE_OUTS, tif: IMAGE_OUTS, avif: IMAGE_OUTS, bmp: IMAGE_OUTS,
  svg: ['jpg', 'png', 'webp', 'tiff', 'avif', 'bmp', 'pdf'],
  heic: IMAGE_OUTS,
  // -- audio --
  mp3: AUDIO_OUTS, m4a: AUDIO_OUTS, wav: AUDIO_OUTS, flac: AUDIO_OUTS,
  ogg: AUDIO_OUTS, opus: AUDIO_OUTS, aiff: AUDIO_OUTS, aif: AUDIO_OUTS,
  wma: AUDIO_OUTS, aac: AUDIO_OUTS,
  // -- video --
  mp4: VIDEO_OUTS, mov: VIDEO_OUTS, mkv: VIDEO_OUTS, webm: VIDEO_OUTS,
  avi: VIDEO_OUTS, wmv: VIDEO_OUTS, gif: VIDEO_OUTS, m4v: VIDEO_OUTS,
  // -- pdf --
  pdf: ['epub', 'docx', 'pptx', 'xlsx', 'jpg', 'png', 'txt', 'md',
        { ext: 'pages', platforms: ['darwin'] }],
  // -- documents --
  docx: ['pdf', 'html', 'txt', 'md', 'epub',
         { ext: 'pages', platforms: ['darwin'] }],
  doc:  ['pdf', 'txt', 'docx'],            // via textutil on mac / word-extractor on win? -> textutil is mac-only; mark cells
  pages:['pdf', 'docx', 'epub', 'txt'],    // handled by Pages automation (darwin enforced below)
  md:   ['pdf', 'html', 'txt', 'docx', 'epub'],
  txt:  ['pdf', 'html', 'md', 'docx', 'epub'],
  html: ['pdf', 'txt', 'md', 'docx', 'epub'],
  rtf:  ['pdf', 'txt', 'html', 'docx'],
  rtfd: ['pdf', 'txt', 'html', 'docx'],
  textclipping: ['txt', 'md', 'pdf'],
  epub: ['pdf', 'txt', 'md', 'html', 'docx'],
  // -- slides (output side limited: real rendering needs Apple) --
  pptx: [{ ext: 'pdf', platforms: ['darwin'] }, 'pptx-img-notes',
         { ext: 'jpg', platforms: ['darwin'] }, { ext: 'png', platforms: ['darwin'] }],
  ppt:  [{ ext: 'pdf', platforms: ['darwin'] },
         { ext: 'jpg', platforms: ['darwin'] }, { ext: 'png', platforms: ['darwin'] }],
  key:  ['pdf', 'pptx', 'jpg', 'png'],
  // -- spreadsheets --
  xlsx: ['csv', 'tsv', 'ods', 'pdf', 'xls',
         { ext: 'numbers', platforms: ['darwin'] }],
  xls:  ['xlsx', 'csv', 'tsv', 'ods', 'pdf'],
  ods:  ['xlsx', 'csv', 'tsv', 'pdf'],
  csv:  ['xlsx', 'ods', 'tsv', 'pdf'],
  tsv:  ['xlsx', 'ods', 'csv', 'pdf'],
  numbers: ['xlsx', 'csv', 'pdf'],
  // -- subtitles --
  srt: ['vtt', 'txt'],
  vtt: ['srt', 'txt'],
  // -- archives (recompress; extraction is a Tool) --
  zip: ['tar', 'gz'],
  tar: ['zip', 'gz'],
  gz:  ['zip', 'tar'],
  rar: ['zip', 'tar', 'gz'],
};

// extensions that only work on macOS regardless of cell annotation
// (doc/rtf use textutil; pages/numbers/key/rtfd/textclipping are Apple-native)
const MAC_ONLY_INPUTS = new Set(['pages', 'numbers', 'key', 'rtfd', 'textclipping', 'doc', 'rtf']);
// doc/rtf input works everywhere we can parse; rtf parse is textutil on mac, basic strip on win

function canonExt(ext) {
  ext = (ext || '').toLowerCase().replace(/^\./, '');
  const f = FORMATS[ext];
  return f && f.alias ? f.alias : ext;
}

function formatInfo(ext) {
  return FORMATS[(ext || '').toLowerCase().replace(/^\./, '')] || null;
}

function inputAvailable(ext, platform = process.platform) {
  ext = (ext || '').toLowerCase();
  const f = FORMATS[ext];
  if (!f) return false;
  if (f.platforms && !f.platforms.includes(platform)) return false;
  if (MAC_ONLY_INPUTS.has(ext) && platform !== 'darwin') return false;
  return true;
}

// Returns [{ext, name}] conversion outputs for an input ext on this platform.
function outputsFor(ext, platform = process.platform) {
  ext = (ext || '').toLowerCase().replace(/^\./, '');
  if (!inputAvailable(ext, platform)) return [];
  const cells = MATRIX[ext] || [];
  const out = [];
  for (const c of cells) {
    const e = typeof c === 'string' ? c : c.ext;
    const plats = typeof c === 'string' ? null : c.platforms;
    if (plats && !plats.includes(platform)) continue;
    if (e === ext) continue;
    if (e === 'pptx-img-notes') continue; // internal pseudo-format, listed via tools instead
    out.push({ ext: e, name: (FORMATS[e] || { name: e.toUpperCase() }).name });
  }
  return out;
}

// For a set of extensions (multi-select), intersect outputs.
function outputsForSet(exts, platform = process.platform) {
  if (!exts.length) return [];
  let lists = exts.map((e) => outputsFor(e, platform).map((o) => o.ext));
  if (lists.some((l) => !l.length)) return [];
  const common = lists.reduce((a, b) => a.filter((x) => b.includes(x)));
  return common.map((e) => ({ ext: e, name: (FORMATS[e] || { name: e.toUpperCase() }).name }));
}

function categoryOf(ext) {
  const f = formatInfo(ext);
  return f ? f.cat : null;
}

module.exports = {
  CATEGORY, FORMATS, MATRIX,
  canonExt, formatInfo, inputAvailable, outputsFor, outputsForSet, categoryOf,
  IS_MAC,
};
