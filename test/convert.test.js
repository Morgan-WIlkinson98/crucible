// Smoke test — exercises real conversions end-to-end in plain Node.
// Run: node test/convert.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-test-'));
process.chdir(TMP);
console.log('fixtures in', TMP);

// stub the Electron printToPDF renderer so doc->pdf paths run in Node
const docs = require('../src/converters/documents');
const sheets = require('../src/converters/spreadsheets');
const { PDFDocument } = require('pdf-lib');
const fakePdf = async (html) => {
  const d = await PDFDocument.create();
  const p = d.addPage([612, 792]);
  p.drawText('stub pdf render', { x: 40, y: 700, size: 18 });
  return Buffer.from(await d.save());
};
docs.setPdfRenderer(fakePdf);
sheets.setSheetPdfRenderer(fakePdf);

const { convert } = require('../src/converters');
const { runTool } = require('../src/tools');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '—', e.message); }
}

async function exists(p) { assert.ok(p && fs.existsSync(p), `missing ${p}`); }

(async () => {
  const sharp = require('sharp');
  const fixtures = {};

  // --- fixtures ---
  await t('fixture: png', async () => {
    fixtures.png = path.join(TMP, 'sample.png');
    await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 80, b: 30 } } })
      .png().toFile(fixtures.png);
  });
  await t('fixture: wav tone', async () => {
    fixtures.wav = path.join(TMP, 'tone.wav');
    const { run, ffmpegPath } = require('../src/converters/util');
    await run(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', fixtures.wav]);
    await exists(fixtures.wav);
  });
  await t('fixture: mp4', async () => {
    fixtures.mp4 = path.join(TMP, 'clip.mp4');
    const { run, ffmpegPath } = require('../src/converters/util');
    await run(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixtures.mp4]);
    await exists(fixtures.mp4);
  });
  await t('fixture: pdf', async () => {
    fixtures.pdf = path.join(TMP, 'doc.pdf');
    const d = await PDFDocument.create();
    const p1 = d.addPage([612, 792]); p1.drawText('Hello PDF world. First line.\nSecond line here.', { x: 40, y: 700, size: 16 });
    const p2 = d.addPage([612, 792]); p2.drawText('Page two content.', { x: 40, y: 700, size: 16 });
    fs.writeFileSync(fixtures.pdf, await d.save());
  });
  await t('fixture: text docs', async () => {
    fixtures.md = path.join(TMP, 'note.md');
    fs.writeFileSync(fixtures.md, '# Title\n\nA paragraph with **bold**.\n\n## Sub\n\nMore text.');
    fixtures.csv = path.join(TMP, 'data.csv');
    fs.writeFileSync(fixtures.csv, 'name,age\nada,36\nbob,41\n');
    fixtures.srt = path.join(TMP, 'subs.srt');
    fs.writeFileSync(fixtures.srt, '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:05,500\nSecond line\n');
    fixtures.txt = path.join(TMP, 'plain.txt');
    fs.writeFileSync(fixtures.txt, 'just some plain text\n');
  });

  // --- image conversions ---
  for (const ext of ['jpg', 'webp', 'bmp', 'pdf', 'tiff', 'avif']) {
    await t(`png -> ${ext}`, async () => {
      const r = await convert([fixtures.png], ext);
      assert.deepStrictEqual(r.errors, []);
      await exists(r.outputs[0]);
    });
  }

  // --- audio/video ---
  for (const [src, ext] of [['wav', 'mp3'], ['wav', 'flac'], ['mp4', 'gif'], ['mp4', 'mp3'], ['mp4', 'webm']]) {
    await t(`${src} -> ${ext}`, async () => {
      const r = await convert([fixtures[src]], ext);
      assert.deepStrictEqual(r.errors, []);
      await exists(r.outputs[0]);
    });
  }

  // --- pdf ---
  for (const ext of ['epub', 'txt', 'md', 'docx', 'xlsx', 'png']) {
    await t(`pdf -> ${ext}`, async () => {
      const r = await convert([fixtures.pdf], ext);
      assert.deepStrictEqual(r.errors, []);
      await exists(Array.isArray(r.outputs[0]) ? r.outputs[0][0] : r.outputs[0]);
      if (ext === 'epub') {
        const magic = fs.readFileSync(r.outputs[0]).slice(0, 4).toString();
        assert.ok(magic.startsWith('PK'), 'epub should be a zip');
      }
    });
  }

  // --- documents ---
  for (const ext of ['html', 'txt', 'docx', 'epub', 'pdf']) {
    await t(`md -> ${ext}`, async () => {
      const r = await convert([fixtures.md], ext);
      assert.deepStrictEqual(r.errors, []);
      await exists(r.outputs[0]);
    });
  }

  // --- spreadsheets ---
  for (const ext of ['xlsx', 'ods', 'tsv', 'pdf']) {
    await t(`csv -> ${ext}`, async () => {
      const r = await convert([fixtures.csv], ext);
      assert.deepStrictEqual(r.errors, []);
      await exists(r.outputs[0]);
    });
  }

  // --- subtitles ---
  for (const ext of ['vtt', 'txt']) {
    await t(`srt -> ${ext}`, async () => {
      const r = await convert([fixtures.srt], ext);
      assert.deepStrictEqual(r.errors, []);
      const out = fs.readFileSync(r.outputs[0], 'utf8');
      if (ext === 'vtt') assert.ok(out.startsWith('WEBVTT'));
      if (ext === 'txt') assert.ok(out.includes('Hello world') && !out.includes('-->'));
    });
  }

  // --- archives ---
  await t('tool: zip', async () => {
    const r = await runTool('zip', [fixtures.md, fixtures.txt]);
    assert.deepStrictEqual(r.errors, []);
    await exists(r.outputs[0]);
    fixtures.zip = r.outputs[0];
  });
  await t('tool: extract zip', async () => {
    const r = await runTool('extract', [fixtures.zip]);
    assert.deepStrictEqual(r.errors, []);
    assert.ok(fs.statSync(r.outputs[0]).isDirectory());
  });
  await t('zip -> tar', async () => {
    const r = await convert([fixtures.zip], 'tar');
    assert.deepStrictEqual(r.errors, []);
    await exists(r.outputs[0]);
  });

  // --- tools ---
  await t('tool: checksum', async () => {
    const r = await runTool('checksum', [fixtures.png]);
    assert.deepStrictEqual(r.errors, []);
    assert.ok(/[0-9a-f]{64}/.test(fs.readFileSync(r.outputs[0], 'utf8')));
  });
  await t('tool: img-compress', async () => {
    const r = await runTool('img-compress', [fixtures.png]);
    assert.deepStrictEqual(r.errors, []);
    await exists(r.outputs[0]);
  });
  await t('tool: vid-trim', async () => {
    const r = await runTool('vid-trim', [fixtures.mp4], { start: '0', end: '0.5' });
    assert.deepStrictEqual(r.errors, []);
    await exists(r.outputs[0]);
  });
  await t('tool: pdf-split', async () => {
    const r = await runTool('pdf-split', [fixtures.pdf]);
    assert.deepStrictEqual(r.errors, []);
    assert.ok(fs.statSync(r.outputs[0]).isDirectory());
    assert.ok(fs.readdirSync(r.outputs[0]).length === 2);
  });
  await t('tool: pdf-merge', async () => {
    const r = await runTool('pdf-merge', [fixtures.pdf, fixtures.pdf]);
    assert.deepStrictEqual(r.errors, []);
    const merged = await PDFDocument.load(fs.readFileSync(r.outputs[0]));
    assert.strictEqual(merged.getPageCount(), 4);
  });
  await t('tool: splitfile + joinparts', async () => {
    const r = await runTool('splitfile', [fixtures.mp4], { sizeMB: 0.0005 });
    assert.deepStrictEqual(r.errors, []);
    const jr = await runTool('joinparts', [r.outputs[0]]);
    assert.deepStrictEqual(jr.errors, []);
    assert.strictEqual(fs.statSync(jr.outputs[0]).size, fs.statSync(fixtures.mp4).size);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
