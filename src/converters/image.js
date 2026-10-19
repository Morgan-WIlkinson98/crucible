// Image conversions — sharp core, heic-convert for HEIC input,
// sips (macOS) for HEIC output, ffmpeg fallback for BMP encode.
const path = require('path');
const fs = require('fs');
const { outPath, run, ffmpegPath } = require('./util');

const IS_MAC = process.platform === 'darwin';

async function loadSharp() { return require('sharp'); }

// Decode any supported input (incl. HEIC) to a sharp pipeline.
async function openImage(srcPath) {
  const sharp = await loadSharp();
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  if (ext === 'heic') {
    const heicConvert = require('heic-convert');
    const buf = await heicConvert({ buffer: fs.readFileSync(srcPath), format: 'PNG' });
    return sharp(Buffer.from(buf));
  }
  return sharp(srcPath, { animated: ext === 'gif' });
}

// Convert an image file to target format. Returns output path.
async function convertImage(srcPath, targetExt, { outDir = null, quality = 82 } = {}) {
  const ext = targetExt.toLowerCase();

  if (ext === 'heic') {
    // macOS only — sips can encode HEIF.
    if (!IS_MAC) throw new Error('HEIC output requires macOS (sips)');
    const dst = outPath(srcPath, 'heic', { dir: outDir });
    await run('sips', ['-s', 'format', 'heic', srcPath, '--out', dst]);
    return dst;
  }

  if (ext === 'bmp') {
    // sharp can't write BMP; use ffmpeg image2.
    const dst = outPath(srcPath, 'bmp', { dir: outDir });
    await run(ffmpegPath(), ['-y', '-i', srcPath, '-frames:v', '1', dst]);
    return dst;
  }

  if (ext === 'pdf') {
    // image wrapped in a single-page PDF via pdf-lib
    const { PDFDocument } = require('pdf-lib');
    const sharp = await loadSharp();
    const pngBuf = await openImage(srcPath).then((img) => img.png().toBuffer());
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(pngBuf);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    const dst = outPath(srcPath, 'pdf', { dir: outDir });
    fs.writeFileSync(dst, await doc.save());
    return dst;
  }

  const img = await openImage(srcPath);
  const dst = outPath(srcPath, ext, { dir: outDir });
  switch (ext) {
    case 'jpg': case 'jpeg': await img.jpeg({ quality, mozjpeg: true }).flatten({ background: '#ffffff' }).toFile(dst); break;
    case 'png':  await img.png({ compressionLevel: 9 }).toFile(dst); break;
    case 'webp': await img.webp({ quality }).toFile(dst); break;
    case 'tiff': await img.tiff({ quality }).toFile(dst); break;
    case 'avif': await img.avif({ quality }).toFile(dst); break;
    case 'gif':  await img.gif().toFile(dst); break;
    default: throw new Error(`Unsupported image output: ${ext}`);
  }
  return dst;
}

// ---- image tools ----
async function compressImage(srcPath, { quality = 60, outDir = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const target = (ext === 'png' || ext === 'svg') ? 'png' : (ext === 'heic' ? 'jpg' : ext);
  const img = await openImage(srcPath);
  const dst = outPath(srcPath, target === 'jpeg' ? 'jpg' : target, { suffix: '-compressed', dir: outDir });
  switch (target) {
    case 'png': await img.png({ compressionLevel: 9, palette: true }).toFile(dst); break;
    case 'webp': await img.webp({ quality }).toFile(dst); break;
    case 'avif': await img.avif({ quality }).toFile(dst); break;
    default: await img.jpeg({ quality, mozjpeg: true }).flatten({ background: '#fff' }).toFile(dst);
  }
  return dst;
}

async function resizeImage(srcPath, { scale = null, width = null, outDir = null } = {}) {
  const sharp = await loadSharp();
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const img = await openImage(srcPath);
  const meta = await img.metadata();
  const w = width || Math.round((meta.width || 800) * (scale || 0.5));
  const dst = outPath(srcPath, ext, { suffix: `-${w}w`, dir: outDir });
  await img.resize({ width: w }).toFile(dst);
  return dst;
}

async function rotateImage(srcPath, { degrees = 90, outDir = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const img = await openImage(srcPath);
  const dst = outPath(srcPath, ext, { suffix: `-rot${degrees}`, dir: outDir });
  await img.rotate(degrees).toFile(dst);
  return dst;
}

async function flipImage(srcPath, { outDir = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const img = await openImage(srcPath);
  const dst = outPath(srcPath, ext, { suffix: '-flipped', dir: outDir });
  await img.flop().toFile(dst);
  return dst;
}

async function grayscaleImage(srcPath, { outDir = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const img = await openImage(srcPath);
  const dst = outPath(srcPath, ext, { suffix: '-gray', dir: outDir });
  await img.grayscale().toFile(dst);
  return dst;
}

// Burn a text caption onto the image (bottom band, white on translucent black).
async function annotateImage(srcPath, { text, outDir = null } = {}) {
  const sharp = await loadSharp();
  const img = await openImage(srcPath);
  const meta = await img.metadata();
  const w = meta.width || 800, h = meta.height || 600;
  const fontSize = Math.max(16, Math.round(w / 28));
  const bandH = fontSize * 2.4;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${h - bandH}" width="${w}" height="${bandH}" fill="rgba(0,0,0,0.55)"/>
    <text x="${w / 2}" y="${h - bandH / 2 + fontSize * 0.35}" font-size="${fontSize}"
      font-family="Helvetica,Arial,sans-serif" fill="#fff" text-anchor="middle">${esc(text)}</text>
  </svg>`;
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const dst = outPath(srcPath, ext === 'heic' ? 'png' : ext, { suffix: '-annotated', dir: outDir });
  await img.composite([{ input: Buffer.from(svg) }]).toFile(dst);
  return dst;
}

async function stripImageMeta(srcPath, { outDir = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const img = await openImage(srcPath);
  const dst = outPath(srcPath, ext, { suffix: '-clean', dir: outDir });
  await img.withMetadata({ orientation: undefined }).toFile(dst);
  return dst;
}

module.exports = {
  convertImage, compressImage, resizeImage, rotateImage,
  flipImage, grayscaleImage, stripImageMeta, annotateImage,
};
