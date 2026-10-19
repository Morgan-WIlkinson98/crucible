// Conversion dispatcher — routes (files, target) to the right engine.
// Platform-gated cells are already filtered upstream by the registry;
// engines here assume the request is valid for this platform.
const path = require('path');
const fs = require('fs');
const { categoryOf, canonExt } = require('../shared/formats');
const image = require('./image');
const av = require('./av');
const pdf = require('./pdf');
const docs = require('./documents');
const sheets = require('./spreadsheets');
const subs = require('./subtitles');
const archives = require('./archives');
const apple = require('./apple');

const IS_MAC = process.platform === 'darwin';
const { outPath } = require('./util');

// Some targets are reached by chaining through an intermediate format.
// e.g. pdf -> pages goes pdf -> docx -> Pages save.
async function convertOne(srcPath, targetExt, ctx) {
  const inExt = path.extname(srcPath).slice(1).toLowerCase();
  const cat = categoryOf(inExt);
  const opts = { outDir: ctx.outDir, onProgress: ctx.onProgress };

  // -- macOS Apple-format inputs --
  if (IS_MAC && inExt === 'pages') return apple.fromPages(srcPath, targetExt, opts);
  if (IS_MAC && inExt === 'numbers') return apple.fromNumbers(srcPath, targetExt, opts);
  if (IS_MAC && (inExt === 'key' || inExt === 'ppt' || inExt === 'pptx')) {
    if (apple.hasAppleApp('keynote')) return apple.fromKeynote(srcPath, targetExt, opts);
    if (inExt === 'key') throw new Error('Keynote.app required for .key files');
    // pptx w/o Keynote: only pptx targets remain, all darwin-gated anyway
    throw new Error('Slide conversion requires Keynote.app on macOS');
  }
  if (IS_MAC && ['doc', 'rtf', 'rtfd', 'textclipping'].includes(inExt)) {
    // textutil produces html/txt/docx; chain through documents for the rest
    if (['txt', 'html', 'docx', 'doc'].includes(targetExt)) {
      return apple.textutilConvert(srcPath, targetExt, opts);
    }
    const tmpHtml = path.join(require('os').tmpdir(), `crucible-tu-${Date.now()}.html`);
    try {
      await apple.textutilConvert(srcPath, 'html', { outDir: path.dirname(tmpHtml) });
      const produced = path.join(path.dirname(tmpHtml), path.basename(srcPath, path.extname(srcPath)) + '.html');
      const htmlFile = fs.existsSync(produced) ? produced : tmpHtml;
      return await docs.convertDocument(htmlFile, targetExt, { ...opts, outDir: ctx.outDir });
    } finally { fs.rmSync(tmpHtml, { force: true }); }
  }

  switch (cat) {
    case 'image': return image.convertImage(srcPath, targetExt, opts);
    case 'audio': case 'video': return av.convertAV(srcPath, targetExt, opts);
    case 'pdf': {
      switch (targetExt) {
        case 'epub': return pdf.pdfToEpub(srcPath, opts);
        case 'docx': return pdf.pdfToDocx(srcPath, opts);
        case 'pptx': return pdf.pdfToPptx(srcPath, opts);
        case 'xlsx': return pdf.pdfToXlsx(srcPath, opts);
        case 'jpg': case 'png': return pdf.pdfToImages(srcPath, targetExt, opts);
        case 'txt': return pdf.pdfToText(srcPath, { ...opts, md: false });
        case 'md': return pdf.pdfToText(srcPath, { ...opts, md: true });
        case 'pages': {
          if (!IS_MAC) throw new Error('.pages output requires macOS');
          const docxTmp = await pdf.pdfToDocx(srcPath, { outDir: require('os').tmpdir() });
          try { return await apple.toPages(docxTmp, opts); }
          finally { fs.rmSync(docxTmp, { force: true }); }
        }
        default: throw new Error(`PDF -> ${targetExt} unsupported`);
      }
    }
    case 'document': {
      if (targetExt === 'pages' && IS_MAC) {
        // open in Pages, save as native
        let intermediate = srcPath;
        if (inExt !== 'docx') {
          intermediate = await docs.convertDocument(srcPath, 'docx', { outDir: require('os').tmpdir() });
        }
        try { return await apple.toPages(intermediate, opts); }
        finally { if (intermediate !== srcPath) fs.rmSync(intermediate, { force: true }); }
      }
      return docs.convertDocument(srcPath, targetExt, opts);
    }
    case 'spreadsheet': {
      if (targetExt === 'numbers' && IS_MAC) {
        let intermediate = srcPath;
        if (inExt !== 'xlsx') {
          intermediate = await sheets.convertSpreadsheet(srcPath, 'xlsx', { outDir: require('os').tmpdir() });
        }
        try { return await apple.toNumbers(intermediate, opts); }
        finally { if (intermediate !== srcPath) fs.rmSync(intermediate, { force: true }); }
      }
      return sheets.convertSpreadsheet(srcPath, targetExt, opts);
    }
    case 'subtitle': return subs.convertSubtitle(srcPath, targetExt, opts);
    case 'archive': return archives.convertArchive(srcPath, targetExt, opts);
    default:
      throw new Error(`No conversion engine for .${inExt}`);
  }
}

// Convert a set of files to a target extension. Returns { outputs, errors }.
async function convert(paths, targetExt, ctx = {}) {
  const outputs = [];
  const errors = [];
  for (const p of paths) {
    try {
      const out = await convertOne(p, targetExt, ctx);
      if (Array.isArray(out)) outputs.push(...out); else outputs.push(out);
      ctx.onFileDone?.(p);
    } catch (e) {
      errors.push({ file: p, error: e.message });
    }
  }
  return { outputs, errors };
}

module.exports = { convert, convertOne };
