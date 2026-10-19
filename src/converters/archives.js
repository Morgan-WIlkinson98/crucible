// Archive conversions + extraction: ZIP/TAR/GZ create, ZIP/TAR/GZ/RAR input.
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { outPath, outDir } = require('./util');

// Create an archive of `paths` (files or dirs) as zip|tar|gz.
async function createArchive(paths, format, { outDir: od = null, destBase = null, srcDir = null } = {}) {
  const base = destBase || (paths.length === 1
    ? path.basename(paths[0]).replace(/\.[^.]*$/, '')
    : 'archive');
  const first = paths[0];
  const dir = od || srcDir || path.dirname(first);

  if (format === 'gz' && paths.length !== 1) format = 'tar'; // gz is single-file; tar bundle then gzip
  // collision-free destination built from destBase
  const mkDst = (ext) => {
    let c = path.join(dir, `${base}.${ext}`);
    let i = 2;
    while (fs.existsSync(c)) { c = path.join(dir, `${base} (${i}).${ext}`); i++; }
    return c;
  };
  const dst = format === 'zip' ? mkDst('zip') : format === 'gz' ? mkDst('tar.gz') : mkDst('tar');

  if (format === 'zip') {
    const archiver = require('archiver');
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dst);
      const arc = archiver('zip', { zlib: { level: 9 } });
      out.on('close', resolve); arc.on('error', reject);
      arc.pipe(out);
      for (const p of paths) {
        const st = fs.statSync(p);
        if (st.isDirectory()) arc.directory(p, path.basename(p));
        else arc.file(p, { name: path.basename(p) });
      }
      arc.finalize();
    });
  } else {
    const tar = require('tar');
    // gz format on a single file → plain .gz, not .tar.gz
    if (format === 'gz' && paths.length === 1 && fs.statSync(paths[0]).isFile()) {
      const gdst = mkDst('gz');
      await new Promise((res, rej) => fs.createReadStream(first)
        .pipe(zlib.createGzip({ level: 9 }))
        .pipe(fs.createWriteStream(gdst))
        .on('finish', res).on('error', rej));
      return gdst;
    }
    const cwd = srcDir || path.dirname(first);
    await tar.create(
      { gzip: format === 'gz', file: dst, cwd },
      paths.map((p) => path.basename(p)),
    );
    return dst;
  }
  return dst;
}

// Extract any supported archive to a sibling folder; returns folder path.
async function extractArchive(srcPath, { outDir: od = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const base = path.basename(srcPath).replace(/\.(tar\.gz|[^.]+)$/i, '');
  const dir = od || outDir(srcPath, base);

  if (ext === 'zip') {
    const extractZip = require('extract-zip');
    await extractZip(srcPath, { dir });
  } else if (ext === 'rar') {
    const unrar = require('node-unrar-js');
    const data = Uint8Array.from(fs.readFileSync(srcPath)).buffer;
    const extractor = await unrar.createExtractorFromData({ data, targetPath: dir });
    const extracted = extractor.extract();
    for (const f of extracted.files) {
      if (f.fileHeader.flags.directory) continue;
      const rel = f.fileHeader.name;
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (f.extraction) fs.writeFileSync(dest, Buffer.from(f.extraction));
    }
  } else if (ext === 'gz' && !srcPath.endsWith('.tar.gz')) {
    const dest = path.join(dir, path.basename(srcPath, '.gz'));
    await new Promise((res, rej) => fs.createReadStream(srcPath)
      .pipe(zlib.createGunzip()).pipe(fs.createWriteStream(dest))
      .on('finish', res).on('error', rej));
  } else {
    // tar / tar.gz / tgz
    const tar = require('tar');
    await tar.extract({ file: srcPath, cwd: dir });
  }
  return dir;
}

// Convert archive -> archive via temp extract + recompress.
async function convertArchive(srcPath, targetExt, { outDir: od = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-arc-'));
  try {
    const dir = await extractArchive(srcPath, { outDir: tmp });
    const entries = fs.readdirSync(dir).map((n) => path.join(dir, n));
    if (!entries.length) throw new Error('Archive was empty');
    const base = path.basename(srcPath).replace(/\.(tar\.gz|[^.]+)$/i, '');
    // extractArchive may return tmp itself or a subfolder inside it
    const srcDir = fs.statSync(dir).isDirectory() ? dir : tmp;
    const inner = fs.readdirSync(srcDir).map((n) => path.join(srcDir, n));
    return await createArchive(inner.length ? inner : entries, targetExt, {
      outDir: od || path.dirname(srcPath),
      destBase: base,
      srcDir: srcDir,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { createArchive, extractArchive, convertArchive };
