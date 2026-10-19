// PDF engine — extraction & rendering via pdfjs-dist + @napi-rs/canvas,
// structural ops via pdf-lib, office outputs via docx/pptxgenjs/xlsx,
// and PDF -> EPUB via the local epub writer.
const path = require('path');
const fs = require('fs');
const { outPath, outDir } = require('./util');
const { writeEpub } = require('./epub');

let _pdfjs = null;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  // pdfjs-dist v4 is ESM-only; legacy build runs under Node.
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const lib = mod.default || mod;
  // Node polyfills needed for rendering & font handling.
  const nc = require('@napi-rs/canvas');
  for (const k of ['DOMMatrix', 'Path2D', 'ImageData']) {
    if (!globalThis[k] && nc[k]) globalThis[k] = nc[k];
  }
  try {
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    lib.GlobalWorkerOptions.workerSrc = require('url').pathToFileURL(workerPath).href;
  } catch { /* fake worker fallback */ }
  _pdfjs = lib;
  return lib;
}

class CanvasFactory {
  constructor() { this.createCanvas = require('@napi-rs/canvas').createCanvas; }
  create(w, h) { const c = this.createCanvas(Math.ceil(w), Math.ceil(h)); return { canvas: c, context: c.getContext('2d') }; }
  reset(pair, w, h) { pair.canvas.width = Math.ceil(w); pair.canvas.height = Math.ceil(h); }
  destroy(pair) { pair.canvas.width = 0; pair.canvas.height = 0; }
}

async function loadDoc(srcPath) {
  const lib = await pdfjs();
  const data = new Uint8Array(fs.readFileSync(srcPath));
  return lib.getDocument({
    data, isEvalSupported: false, useSystemFonts: true,
    disableFontFace: true, canvasFactory: new CanvasFactory(),
  }).promise;
}

// --- extraction helpers --------------------------------------------------
async function extractTextPerPage(doc) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // group items into lines by y coordinate
    const lines = [];
    let curY = null, cur = [];
    for (const item of tc.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (curY === null || Math.abs(y - curY) > 2) {
        if (cur.length) lines.push(cur.join(' '));
        cur = [item.str]; curY = y;
      } else {
        cur.push(item.str);
      }
    }
    if (cur.length) lines.push(cur.join(' '));
    pages.push(lines.join('\n'));
  }
  return pages;
}

async function extractImages(doc, srcBase, dir) {
  const images = [];
  let n = 0;
  const seen = new Set();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    let ops;
    try { ops = await page.getOperatorList(); } catch { continue; }
    for (let j = 0; j < ops.fnArray.length; j++) {
      // OPS.paintImageXObject = 85, paintInlineImageXObject = 86 (approx — compare by name if needed)
      if (ops.fnArray[j] !== 85) continue;
      const name = ops.argsArray[j][0];
      if (seen.has(name)) continue;
      seen.add(name);
      try {
        const obj = await new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('img timeout')), 5000);
          page.objs.get(name, (o) => { clearTimeout(t); res(o); });
        });
        if (!obj || !obj.data || !obj.width || !obj.height) continue;
        n++;
        const fname = `${srcBase}-img${n}.png`;
        const { createCanvas } = require('@napi-rs/canvas');
        const canvas = createCanvas(obj.width, obj.height);
        const ctx = canvas.getContext('2d');
        const channels = obj.data.length / (obj.width * obj.height);
        let imgData;
        if (channels >= 4) {
          imgData = ctx.createImageData(obj.width, obj.height);
          imgData.data.set(obj.data.subarray(0, obj.width * obj.height * 4));
        } else if (channels === 3) {
          imgData = ctx.createImageData(obj.width, obj.height);
          for (let p = 0, q = 0; p < obj.width * obj.height; p++, q += 3) {
            imgData.data[p * 4] = obj.data[q];
            imgData.data[p * 4 + 1] = obj.data[q + 1];
            imgData.data[p * 4 + 2] = obj.data[q + 2];
            imgData.data[p * 4 + 3] = 255;
          }
        } else continue;
        ctx.putImageData(imgData, 0, 0);
        const buf = canvas.toBuffer('image/png');
        if (dir) fs.writeFileSync(path.join(dir, fname), buf);
        images.push({ id: `img${n}`, name: fname, data: buf, mediaType: 'image/png', page: i });
      } catch { /* skip unresolvable image */ }
    }
  }
  return images;
}

async function renderPagePng(page, scale = 2.0) {
  const viewport = page.getViewport({ scale });
  const factory = new CanvasFactory();
  const pair = factory.create(viewport.width, viewport.height);
  await page.render({ canvasContext: pair.context, viewport, canvasFactory: factory }).promise;
  return pair.canvas;
}

// --- conversions ---------------------------------------------------------
async function pdfToImages(srcPath, targetExt, { outDir: od = null, dpi = 150 } = {}) {
  const doc = await loadDoc(srcPath);
  const base = path.basename(srcPath, '.pdf');
  const scale = dpi / 72 * 2; // reasonable raster
  const dir = od || (doc.numPages > 1 ? outDir(srcPath, `${base}-pages`) : path.dirname(srcPath));
  const outputs = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const canvas = await renderPagePng(page, scale);
    const buf = targetExt === 'jpg' ? canvas.toBuffer('image/jpeg', 0.9) : canvas.toBuffer('image/png');
    const fname = doc.numPages > 1 ? `${base}-p${i}.${targetExt}` : `${base}.${targetExt}`;
    const fp = path.join(dir, fname);
    fs.writeFileSync(fp, buf);
    outputs.push(fp);
  }
  await doc.destroy();
  return outputs[0] && outputs.length === 1 ? outputs[0] : dir;
}

async function pdfToText(srcPath, { md = false, outDir: od = null } = {}) {
  const doc = await loadDoc(srcPath);
  const pages = await extractTextPerPage(doc);
  await doc.destroy();
  const ext = md ? 'md' : 'txt';
  const body = md
    ? `# ${path.basename(srcPath, '.pdf')}\n\n` + pages.map((p, i) => `## Page ${i + 1}\n\n${p}`).join('\n\n')
    : pages.join('\n\n---\n\n');
  const dst = outPath(srcPath, ext, { dir: od });
  fs.writeFileSync(dst, body, 'utf8');
  return dst;
}

async function pdfToEpub(srcPath, { outDir: od = null } = {}) {
  const doc = await loadDoc(srcPath);
  const pages = await extractTextPerPage(doc);
  const base = path.basename(srcPath, '.pdf');
  const images = await extractImages(doc, base, null);
  await doc.destroy();

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const chapters = pages.map((text, i) => ({
    title: `Page ${i + 1}`,
    html: `<h1>Page ${i + 1}</h1>` +
      text.split(/\n{2,}|\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('\n') +
      images.filter((im) => im.page === i + 1)
        .map((im) => `<p><img src="../images/${im.name}" alt=""/></p>`).join('\n'),
  })).filter((c) => c.html.length > 20);

  const dst = outPath(srcPath, 'epub', { dir: od });
  await writeEpub({ title: base, chapters, images }, dst);
  return dst;
}

async function pdfToDocx(srcPath, { outDir: od = null } = {}) {
  const doc = await loadDoc(srcPath);
  const pages = await extractTextPerPage(doc);
  await doc.destroy();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = require('docx');
  const children = [];
  pages.forEach((p, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    p.split('\n').forEach((line) =>
      children.push(new Paragraph({ children: [new TextRun(line || ' ')] })));
  });
  const d = new Document({ sections: [{ children }], title: path.basename(srcPath, '.pdf') });
  const dst = outPath(srcPath, 'docx', { dir: od });
  fs.writeFileSync(dst, await Packer.toBuffer(d));
  return dst;
}

async function pdfToXlsx(srcPath, { outDir: od = null } = {}) {
  const doc = await loadDoc(srcPath);
  const pages = await extractTextPerPage(doc);
  await doc.destroy();
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  pages.forEach((p, i) => {
    const aoa = p.split('\n').map((l) => l.split(/\s{2,}|\t/).map((s) => s.trim()));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `Page ${i + 1}`);
  });
  const dst = outPath(srcPath, 'xlsx', { dir: od });
  XLSX.writeFile(wb, dst);
  return dst;
}

async function pdfToPptx(srcPath, { outDir: od = null } = {}) {
  const doc = await loadDoc(srcPath);
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const canvas = await renderPagePng(page, 2.0);
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: canvas.toDataURL(), x: 0, y: 0, w: '100%', h: '100%' });
  }
  await doc.destroy();
  const dst = outPath(srcPath, 'pptx', { dir: od });
  await pptx.writeFile({ fileName: dst });
  return dst;
}

// --- structural tools (pdf-lib) ------------------------------------------
const { PDFDocument, degrees } = require('pdf-lib');

async function mergePdfs(srcPaths, { outDir: od = null } = {}) {
  const out = await PDFDocument.create();
  for (const p of srcPaths) {
    const src = await PDFDocument.load(fs.readFileSync(p), { ignoreEncryption: true });
    (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg));
  }
  const dst = outPath(srcPaths[0], 'pdf', { suffix: '-merged', dir: od });
  fs.writeFileSync(dst, await out.save());
  return dst;
}

async function splitPdf(srcPath, { outDir: od = null } = {}) {
  const src = await PDFDocument.load(fs.readFileSync(srcPath), { ignoreEncryption: true });
  const base = path.basename(srcPath, '.pdf');
  const dir = od || outDir(srcPath, `${base}-split`);
  const outs = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const d = await PDFDocument.create();
    const [pg] = await d.copyPages(src, [i]);
    d.addPage(pg);
    const fp = path.join(dir, `${base}-p${i + 1}.pdf`);
    fs.writeFileSync(fp, await d.save());
    outs.push(fp);
  }
  return dir;
}

function parseRange(range, max) {
  const idx = new Set();
  for (const part of String(range).split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.min(Math.max(a, b), max); i++) idx.add(i - 1);
  }
  return [...idx].sort((x, y) => x - y);
}

async function extractPdfPages(srcPath, { range = '1', outDir: od = null } = {}) {
  const src = await PDFDocument.load(fs.readFileSync(srcPath), { ignoreEncryption: true });
  const idx = parseRange(range, src.getPageCount());
  if (!idx.length) throw new Error('No valid pages in range');
  const d = await PDFDocument.create();
  (await d.copyPages(src, idx)).forEach((pg) => d.addPage(pg));
  const dst = outPath(srcPath, 'pdf', { suffix: `-pages${range.replace(/[^\d,-]/g, '')}`, dir: od });
  fs.writeFileSync(dst, await d.save());
  return dst;
}

async function rotatePdf(srcPath, { deg = 90, outDir: od = null } = {}) {
  const doc = await PDFDocument.load(fs.readFileSync(srcPath), { ignoreEncryption: true });
  doc.getPages().forEach((p) => p.setRotation(degrees((p.getRotation().angle + deg) % 360)));
  const dst = outPath(srcPath, 'pdf', { suffix: `-rot${deg}`, dir: od });
  fs.writeFileSync(dst, await doc.save());
  return dst;
}

module.exports = {
  pdfToImages, pdfToText, pdfToEpub, pdfToDocx, pdfToXlsx, pdfToPptx,
  mergePdfs, splitPdf, extractPdfPages, rotatePdf,
  extractTextPerPage, loadDoc,
};
