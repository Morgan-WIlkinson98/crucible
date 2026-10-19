// Document conversions — DOCX (mammoth), MD (marked), TXT/HTML/RTF, EPUB.
// HTML -> PDF goes through an injected renderer (Electron printToPDF in the
// packaged app; a stub in CLI tests).
const path = require('path');
const fs = require('fs');
const { outPath } = require('./util');
const { writeEpub, readEpub, escapeXml } = require('./epub');

let _htmlToPdf = null;
function setPdfRenderer(fn) { _htmlToPdf = fn; }
async function htmlToPdf(html, destPath) {
  if (!_htmlToPdf) throw new Error('PDF renderer not initialized');
  fs.writeFileSync(destPath, await _htmlToPdf(html));
  return destPath;
}

// ---- minimal HTML -> Markdown / text -------------------------------------
function htmlToMd(html) {
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${t.trim()}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${t.trim()}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${t.trim()}\n\n`)
    .replace(/<h[456][^>]*>([\s\S]*?)<\/h[456]>/gi, (_, t) => `#### ${t.trim()}\n\n`)
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function textToHtml(text, title = '') {
  const paras = text.split(/\n{2,}/).map((p) =>
    `<p>${escapeXml(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:44em;margin:3em auto;padding:0 1em;line-height:1.55;color:#222}</style>
</head><body>${paras}</body></html>`;
}

function mdToHtml(md, title = '') {
  const { marked } = require('marked');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:44em;margin:3em auto;padding:0 1em;line-height:1.55;color:#222}pre,code{background:#f4f4f4;border-radius:4px}pre{padding:1em;overflow:auto}code{padding:.1em .3em}</style>
</head><body>${marked.parse(md)}</body></html>`;
}

// ---- loaders: any doc input -> {html, text, title} ------------------------
async function loadDocAs(srcPath) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const title = path.basename(srcPath, path.extname(srcPath));
  switch (ext) {
    case 'docx': {
      const mammoth = require('mammoth');
      const { value: html } = await mammoth.convertToHtml({ path: srcPath });
      return { html: wrapHtml(html, title), text: htmlToText(html), title };
    }
    case 'md': case 'markdown': {
      const md = fs.readFileSync(srcPath, 'utf8');
      return { html: mdToHtml(md, title), text: htmlToText(mdToHtml(md)), title };
    }
    case 'txt': {
      const t = fs.readFileSync(srcPath, 'utf8');
      return { html: textToHtml(t, title), text: t, title };
    }
    case 'html': case 'htm': {
      const html = fs.readFileSync(srcPath, 'utf8');
      return { html, text: htmlToText(html), title };
    }
    case 'epub': {
      const { title: t, chapters } = await readEpub(srcPath);
      const html = wrapHtml(chapters.map((c) => c.html).join('\n'), t);
      return { html, text: chapters.map((c) => c.text).join('\n\n'), title: t };
    }
    default:
      throw new Error(`Unsupported document input: ${ext}`);
  }
}

function wrapHtml(body, title) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:44em;margin:3em auto;padding:0 1em;line-height:1.55;color:#222}img{max-width:100%}pre,code{background:#f4f4f4}pre{padding:1em;overflow:auto}</style>
</head><body>${body}</body></html>`;
}

// ---- writers --------------------------------------------------------------
async function htmlToDocxBuffer(html, title) {
  const { Document, Packer, Paragraph, TextRun } = require('docx');
  const text = htmlToText(html);
  const doc = new Document({
    title,
    sections: [{
      children: text.split('\n').map((line) =>
        new Paragraph({ children: [new TextRun(line || ' ')] })),
    }],
  });
  return Packer.toBuffer(doc);
}

// Convert any supported doc input to target ext.
async function convertDocument(srcPath, targetExt, { outDir: od = null } = {}) {
  const ext = targetExt.toLowerCase();
  const { html, text, title } = await loadDocAs(srcPath);
  const dst = outPath(srcPath, ext, { dir: od });
  switch (ext) {
    case 'pdf':  return htmlToPdf(html, dst);
    case 'html': fs.writeFileSync(dst, html, 'utf8'); return dst;
    case 'txt':  fs.writeFileSync(dst, text, 'utf8'); return dst;
    case 'md':   fs.writeFileSync(dst, htmlToMd(html), 'utf8'); return dst;
    case 'docx': fs.writeFileSync(dst, await htmlToDocxBuffer(html, title)); return dst;
    case 'epub': {
      // split on h1/h2 into chapters where possible
      const parts = html.split(/<h[12][^>]*>/i).filter((s) => s.trim());
      const chapters = parts.map((p, i) => {
        const tEnd = p.indexOf('</h');
        let t = title, body = p;
        if (i > 0 && tEnd > -1) { t = p.slice(0, tEnd).replace(/<[^>]+>/g, '').trim(); body = p.slice(tEnd + 5); }
        return { title: t || `Part ${i + 1}`, html: i === 0 && tEnd === -1 ? body : body };
      });
      await writeEpub({ title, chapters }, dst);
      return dst;
    }
    default: throw new Error(`Unsupported document output: ${ext}`);
  }
}

module.exports = { convertDocument, setPdfRenderer, htmlToMd, htmlToText, mdToHtml, textToHtml, loadDocAs };
