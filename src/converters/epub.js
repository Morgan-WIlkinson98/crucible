// EPUB reader/writer — hand-rolled on jszip. EPUB 3 layout:
//   mimetype / META-INF/container.xml / OEBPS/content.opf + nav + chapters
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const { outPath } = require('./util');

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// Write an EPUB from {title, author, chapters: [{title, html}], images: [{id, name, data(Buffer), mediaType}]}
async function writeEpub({ title = 'Untitled', author = 'Crucible', chapters = [], images = [] }, destPath) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  const uid = `urn:uuid:crucible-${Date.now()}`;
  const imgManifest = images.map((im) =>
    `<item id="${im.id}" href="images/${im.name}" media-type="${im.mediaType}"/>`).join('\n    ');
  const chapManifest = chapters.map((c, i) =>
    `<item id="chap${i}" href="text/chap${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ');
  const spine = chapters.map((c, i) => `<itemref idref="chap${i}"/>`).join('\n    ');

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bid">${uid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${chapManifest}
    ${imgManifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`);

  const navLis = chapters.map((c, i) =>
    `<li><a href="text/chap${i}.xhtml">${escapeXml(c.title || `Chapter ${i + 1}`)}</a></li>`).join('\n      ');
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(title)}</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>
      ${navLis}
</ol></nav></body></html>`);

  chapters.forEach((c, i) => {
    zip.file(`OEBPS/text/chap${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(c.title || `Chapter ${i + 1}`)}</title></head>
<body>${c.html}</body></html>`);
  });
  images.forEach((im) => zip.file(`OEBPS/images/${im.name}`, im.data));

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

// Read an EPUB -> {title, chapters: [{title?, html, text}]}
async function readEpub(srcPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(srcPath));
  const container = await zip.file('META-INF/container.xml').async('string');
  const opfPath = container.match(/full-path="([^"]+)"/)[1];
  const opfDir = path.posix.dirname(opfPath);
  const opf = await zip.file(opfPath).async('string');

  const title = (opf.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/) || [])[1] || path.basename(srcPath, '.epub');
  const manifest = {};
  for (const m of opf.matchAll(/<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*\/>/g)) {
    manifest[m[1]] = m[2];
  }
  for (const m of opf.matchAll(/<item[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*\/>/g)) {
    manifest[m[2]] = m[1];
  }
  const spineIds = [...opf.matchAll(/<itemref[^>]*idref="([^"]+)"/g)].map((m) => m[1]);

  const chapters = [];
  for (const id of spineIds) {
    const href = manifest[id];
    if (!href || !/\.x?html?$/i.test(href)) continue;
    const filePath = opfDir === '.' ? href : `${opfDir}/${href}`;
    const file = zip.file(filePath);
    if (!file) continue;
    const html = await file.async('string');
    const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
    const text = body
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|div|h\d|li|br|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n').trim();
    const h1 = body.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    chapters.push({ title: h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : null, html: body, text });
  }
  return { title, chapters };
}

module.exports = { writeEpub, readEpub, escapeXml };
