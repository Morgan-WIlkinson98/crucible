// Tool engine — executes file tools from the second wheel.
// Platform/host capabilities (OCR via agent, folder picking) are injected
// by main.js so this stays testable in plain Node.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const image = require('../converters/image');
const av = require('../converters/av');
const pdf = require('../converters/pdf');
const archives = require('../converters/archives');
const { outPath, isDir } = require('../converters/util');

let _helpers = {};
function setHelpers(h) { _helpers = h || {}; }

async function runTool(id, paths, options = {}, ctx = {}) {
  const opts = { ...options, outDir: ctx.outDir, onProgress: ctx.onProgress };
  const many = paths.length > 1;
  const run = async (fn) => {
    const outputs = [];
    const errors = [];
    for (const p of paths) {
      try { outputs.push(await fn(p)); } catch (e) { errors.push({ file: p, error: e.message }); }
    }
    return { outputs, errors };
  };

  switch (id) {
    case 'zip':
      return { outputs: [await archives.createArchive(paths, 'zip', opts)], errors: [] };
    case 'extract':
      return run((p) => archives.extractArchive(p, opts));
    case 'checksum':
      return run(async (p) => {
        const hash = crypto.createHash('sha256');
        await new Promise((res, rej) => fs.createReadStream(p).on('data', (d) => hash.update(d)).on('end', res).on('error', rej));
        const dst = outPath(p, 'sha256.txt', { dir: ctx.outDir });
        fs.writeFileSync(dst, `${hash.digest('hex')}  ${path.basename(p)}\n`);
        return dst;
      });
    case 'splitfile':
      return run(async (p) => {
        const sizeMB = Math.max(0.001, Number(options.sizeMB) || 10);
        const dir = path.dirname(p);
        const base = path.basename(p);
        const bufSize = Math.floor(sizeMB * 1024 * 1024);
        const fd = fs.openSync(p, 'r');
        const stat = fs.fstatSync(fd);
        const outs = [];
        let off = 0, n = 1;
        const buf = Buffer.alloc(bufSize);
        while (off < stat.size) {
          const bytesRead = fs.readSync(fd, buf, 0, bufSize, off);
          const part = path.join(dir, `${base}.part${String(n).padStart(3, '0')}`);
          fs.writeFileSync(part, buf.subarray(0, bytesRead));
          outs.push(part);
          off += bytesRead; n++;
        }
        fs.closeSync(fd);
        return outs[outs.length - 1];
      });
    case 'joinparts':
      return run(async (p) => {
        // p is any .partNNN file; gather siblings
        const dir = path.dirname(p);
        const base = path.basename(p).replace(/\.part\d+$/, '');
        const parts = fs.readdirSync(dir)
          .filter((f) => f.startsWith(path.basename(base) + '.part'))
          .sort().map((f) => path.join(dir, f));
        if (!parts.length) throw new Error('No .partNNN files found');
        const dst = outPath(path.join(dir, base), path.extname(base).slice(1) || 'bin',
          { suffix: '-joined', dir: ctx.outDir }).replace(/(\.[^.]*)?$/, path.extname(base));
        const w = fs.createWriteStream(dst);
        for (const part of parts) w.write(fs.readFileSync(part));
        await new Promise((res) => w.end(res));
        return dst;
      });
    case 'rename':
      return run(async (p) => {
        const name = (options.name || '').trim();
        if (!name) throw new Error('Empty name');
        const dst = path.join(path.dirname(p), name + path.extname(p));
        if (fs.existsSync(dst)) throw new Error('A file with that name already exists');
        fs.renameSync(p, dst);
        return dst;
      });

    // ---- images ----
    case 'img-compress': return run((p) => image.compressImage(p, opts));
    case 'img-resize':   return run((p) => image.resizeImage(p, { ...opts, scale: 0.5 }));
    case 'img-resize-w': return run((p) => image.resizeImage(p, { ...opts, width: Number(options.width) || 1024 }));
    case 'img-rotate':   return run((p) => image.rotateImage(p, { ...opts, degrees: 90 }));
    case 'img-flip':     return run((p) => image.flipImage(p, opts));
    case 'img-gray':     return run((p) => image.grayscaleImage(p, opts));
    case 'img-strip':    return run((p) => image.stripImageMeta(p, opts));
    case 'img-ocr':
      if (!_helpers.ocrImage) throw new Error('OCR requires macOS Vision agent');
      return run(async (p) => {
        const text = await _helpers.ocrImage(p);
        const dst = outPath(p, 'txt', { suffix: '-ocr', dir: ctx.outDir });
        fs.writeFileSync(dst, text, 'utf8');
        return dst;
      });

    // ---- video/audio ----
    case 'vid-compress': return run((p) => av.compressAV(p, opts));
    case 'vid-trim':     return run((p) => av.trimAV(p, { ...opts, start: options.start, end: options.end }));
    case 'vid-mute':     return run((p) => av.muteVideo(p, opts));
    case 'vid-audio':    return run((p) => av.extractAudio(p, opts));
    case 'vid-frames':   return run((p) => av.extractFrames(p, opts));
    case 'vid-speed':    return run((p) => av.changeSpeed(p, { ...opts, factor: options.factor }));
    case 'vid-merge':    return { outputs: [await av.mergeAV(paths, opts)], errors: [] };
    case 'aud-merge':    return { outputs: [await av.mergeAV(paths, opts)], errors: [] };
    case 'aud-norm':     return run((p) => av.normalizeAudio(p, opts));

    // ---- pdf ----
    case 'pdf-merge':   return { outputs: [await pdf.mergePdfs(paths, opts)], errors: [] };
    case 'pdf-split':   return run((p) => pdf.splitPdf(p, opts));
    case 'pdf-extract': return run((p) => pdf.extractPdfPages(p, { ...opts, range: options.range }));
    case 'pdf-rotate':  return run((p) => pdf.rotatePdf(p, opts));

    default: throw new Error(`Unknown tool: ${id}`);
  }
}

module.exports = { runTool, setHelpers };
