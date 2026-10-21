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

// ---- XHTML sanitization ------------------------------------------------
// Chapter bodies come from real-world HTML (unclosed tags, void elements
// written HTML-style, named entities XML doesn't know). EPUB readers parse
// chapters as strict XML, so normalize before embedding.
const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const NAMED_ENTITIES = {
  nbsp: 160, iexcl: 161, cent: 162, pound: 163, curren: 164, yen: 165, brvbar: 166, sect: 167,
  uml: 168, copy: 169, ordf: 170, laquo: 171, not: 172, shy: 173, reg: 174, macr: 175,
  deg: 176, plusmn: 177, sup2: 178, sup3: 179, acute: 180, micro: 181, para: 182, middot: 183,
  cedil: 184, sup1: 185, ordm: 186, raquo: 187, frac14: 188, frac12: 189, frac34: 190, iquest: 191,
  times: 215, divide: 247, szlig: 223, agrave: 224, aacute: 225, acirc: 226, atilde: 227, auml: 228,
  aring: 229, aelig: 230, ccedil: 231, egrave: 232, eacute: 233, ecirc: 234, euml: 235,
  igrave: 236, iacute: 237, icirc: 238, iuml: 239, eth: 240, ntilde: 241, ograve: 242, oacute: 243,
  ocirc: 244, otilde: 245, ouml: 246, oslash: 248, ugrave: 249, uacute: 250, ucirc: 251, uuml: 252,
  yacute: 253, thorn: 254, yuml: 255, Agrave: 192, Aacute: 193, Acirc: 194, Atilde: 195, Auml: 196,
  Aring: 197, Aelig: 198, Ccedil: 199, Egrave: 200, Eacute: 201, Ecirc: 202, Euml: 203,
  Igrave: 204, Iacute: 205, Icirc: 206, Iuml: 207, Ntilde: 209, Ograve: 210, Oacute: 211,
  Ocirc: 212, Otilde: 213, Ouml: 214, Oslash: 216, Ugrave: 217, Uacute: 218, Ucirc: 219, Uuml: 220,
  Yacute: 221, ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220,
  rdquo: 8221, bdquo: 8222, dagger: 8224, Dagger: 8225, bull: 8226, hellip: 8230, permil: 8240,
  prime: 8242, Prime: 8243, lsaquo: 8249, rsaquo: 8250, oline: 8254, frasl: 8260, euro: 8364,
  trade: 8482, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, minus: 8722, infin: 8734,
};

function fixEntities(s) {
  s = s.replace(/&(?:#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m) => {
    if (/^&#\d+;|^&#x[0-9a-fA-F]+;/.test(m)) return m;
    const name = m.slice(1).replace(/;$/, '');
    if (['amp', 'lt', 'gt', 'quot', 'apos'].includes(name)) return `&${name};`;
    if (NAMED_ENTITIES[name] != null) return `&#${NAMED_ENTITIES[name]};`;
    return `&amp;${name}${m.endsWith(';') ? ';' : ''}`;
  });
  return s.replace(/&(?!#?[a-zA-Z0-9]+;)/g, '&amp;');
}

// Balance tags: drop unmatched end tags, self-close void elements,
// auto-close anything left open. Not a parser — just keeps readers happy.
function toXhtml(html) {
  let s = String(html)
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  s = fixEntities(s);
  const TAG_RE = /<!--[\s\S]*?-->|<![^>]*>|<\?[\s\S]*?\?>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  const stack = [], out = [];
  let last = 0, m;
  while ((m = TAG_RE.exec(s))) {
    out.push(s.slice(last, m.index));
    last = TAG_RE.lastIndex;
    if (m[1]) {                              // end tag
      const name = m[1].toLowerCase();
      if (VOID_TAGS.has(name)) continue;
      const idx = stack.lastIndexOf(name);
      if (idx === -1) continue;              // stray end tag — drop
      while (stack.length > idx) out.push(`</${stack.pop()}>`);
    } else if (m[2]) {                       // start tag
      const name = m[2].toLowerCase();
      const attrs = m[3] || '';
      if (/\/\s*$/.test(attrs)) { out.push(`<${name}${attrs.slice(0, attrs.lastIndexOf('/'))}/>`); continue; }
      if (VOID_TAGS.has(name)) { out.push(`<${name}${attrs}/>`); continue; }
      stack.push(name);
      out.push(`<${name}${attrs}>`);
    } else {                                 // comment / doctype / PI
      const tok = m[0];
      if (tok.startsWith('<!--') && !/--/.test(tok.slice(4, -3))) out.push(tok);
      // drop DOCTYPEs and processing instructions — invalid mid-document
    }
  }
  out.push(s.slice(last));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
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
<body>${toXhtml(c.html)}</body></html>`);
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
