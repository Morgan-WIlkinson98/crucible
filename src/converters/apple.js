// macOS-only converters — Apple automation: Pages/Numbers/Keynote via
// AppleScript, textutil, sips. None of this file is reachable on Windows
// (formats.js gates the inputs/outputs by platform).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { run, outPath } = require('./util');

const IS_MAC = process.platform === 'darwin';
const APPS = {
  pages: '/Applications/Pages.app',
  numbers: '/Applications/Numbers.app',
  keynote: '/Applications/Keynote.app',
};

function hasAppleApp(kind) {
  return IS_MAC && APPS[kind] && fs.existsSync(APPS[kind]);
}

function q(p) { return `"${p.replace(/"/g, '\\"')}"`; }

// Pages export format names per Pages.sdef
const PAGES_FMT = {
  pdf: 'PDF', docx: 'Microsoft Word', epub: 'EPUB',
  txt: 'unformatted text', rtf: 'formatted text',
};
const NUMBERS_FMT = { pdf: 'PDF', csv: 'CSV', xlsx: 'Microsoft Excel' };
const KEYNOTE_FMT = { pdf: 'PDF', pptx: 'Microsoft PowerPoint' };

async function iworkExport(app, fmtMap, srcPath, targetExt, outDir) {
  const fmt = fmtMap[targetExt];
  if (!fmt) throw new Error(`${app} cannot export .${targetExt}`);
  const dir = outDir || path.dirname(srcPath);
  const dst = outPath(srcPath, targetExt, { dir });
  const tmp = path.join(os.tmpdir(), `crucible-iwork-${Date.now()}.${targetExt}`);
  const script = `
    tell application "${app}"
      set theDoc to open POSIX file ${q(srcPath)}
      delay 0.5
      export theDoc to POSIX file ${q(tmp)} as ${fmt}
      close theDoc saving no
    end tell`;
  await run('osascript', ['-e', script], { timeout: 120000 });
  fs.renameSync(tmp, dst);
  return dst;
}

// .pages/.docx etc -> .pages: open foreign doc in Pages, save as native.
async function toPages(srcPath, { outDir: od = null } = {}) {
  const dst = outPath(srcPath, 'pages', { dir: od });
  const script = `
    tell application "Pages"
      set theDoc to open POSIX file ${q(srcPath)}
      delay 0.5
      save theDoc in POSIX file ${q(dst)}
      close theDoc saving no
    end tell`;
  await run('osascript', ['-e', script], { timeout: 120000 });
  if (!fs.existsSync(dst)) throw new Error('Pages did not produce output');
  return dst;
}

async function fromPages(srcPath, targetExt, opts = {}) {
  if (targetExt === 'pages') return srcPath;
  return iworkExport('Pages', PAGES_FMT, srcPath, targetExt, opts.outDir);
}

async function fromNumbers(srcPath, targetExt, opts = {}) {
  return iworkExport('Numbers', NUMBERS_FMT, srcPath, targetExt, opts.outDir);
}

async function toNumbers(srcPath, { outDir: od = null } = {}) {
  const dst = outPath(srcPath, 'numbers', { dir: od });
  const script = `
    tell application "Numbers"
      set theDoc to open POSIX file ${q(srcPath)}
      delay 0.5
      save theDoc in POSIX file ${q(dst)}
      close theDoc saving no
    end tell`;
  await run('osascript', ['-e', script], { timeout: 120000 });
  if (!fs.existsSync(dst)) throw new Error('Numbers did not produce output');
  return dst;
}

// Keynote handles ppt/pptx/key -> pdf, pptx (from key), or images folder.
async function fromKeynote(srcPath, targetExt, { outDir: od = null } = {}) {
  if (targetExt === 'jpg' || targetExt === 'png') {
    // route through PDF export + pdfjs rendering (reliable across Keynote versions)
    const pdfTmp = path.join(os.tmpdir(), `crucible-key-${Date.now()}.pdf`);
    const script = `
      tell application "Keynote"
        set theDoc to open POSIX file ${q(srcPath)}
        delay 0.5
        export theDoc to POSIX file ${q(pdfTmp)} as PDF
        close theDoc saving no
      end tell`;
    await run('osascript', ['-e', script], { timeout: 180000 });
    const { pdfToImages } = require('./pdf');
    const result = await pdfToImages(pdfTmp, targetExt, { outDir: od || path.dirname(srcPath) });
    fs.rmSync(pdfTmp, { force: true });
    return result;
  }
  return iworkExport('Keynote', KEYNOTE_FMT, srcPath, targetExt, od);
}

// textutil: doc/docx/rtf/rtfd/txt/html/textclipping conversions
const TEXTUTIL_FMTS = { html: 'html', txt: 'txt', rtf: 'rtf', docx: 'docx', doc: 'doc' };

async function textutilConvert(srcPath, targetExt, { outDir: od = null } = {}) {
  const fmt = TEXTUTIL_FMTS[targetExt];
  if (!fmt) throw new Error(`textutil cannot produce .${targetExt}`);
  const dst = outPath(srcPath, targetExt, { dir: od });
  await run('textutil', ['-convert', fmt, srcPath, '-output', dst]);
  return dst;
}

// .textclipping / .rtfd -> plain text via textutil
async function clippingToText(srcPath, { outDir: od = null } = {}) {
  return textutilConvert(srcPath, 'txt', { outDir: od });
}

module.exports = {
  IS_MAC, hasAppleApp,
  fromPages, toPages, fromNumbers, toNumbers, fromKeynote,
  textutilConvert, clippingToText,
};
