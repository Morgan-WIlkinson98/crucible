// Spreadsheet conversions via SheetJS (xlsx). Covers xlsx/xls/ods/csv/tsv.
// -> PDF renders first sheet as an HTML table through the injected renderer.
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { outPath } = require('./util');
const { setPdfRenderer } = require('./documents'); // shares renderer via convertDocument path

let _htmlToPdf = null;
function setSheetPdfRenderer(fn) { _htmlToPdf = fn; }

async function convertSpreadsheet(srcPath, targetExt, { outDir: od = null } = {}) {
  const ext = targetExt.toLowerCase();
  const wb = XLSX.readFile(srcPath, { dense: false });
  const dst = outPath(srcPath, ext, { dir: od });

  if (ext === 'pdf') {
    if (!_htmlToPdf) throw new Error('PDF renderer not initialized');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif}table{border-collapse:collapse;font-size:11px}td,th{border:1px solid #bbb;padding:3px 8px}</style>
</head><body>` +
      wb.SheetNames.map((n) => `<h3>${n}</h3>` + XLSX.utils.sheet_to_html(wb.Sheets[n])).join('') +
      '</body></html>';
    fs.writeFileSync(dst, await _htmlToPdf(html));
    return dst;
  }

  switch (ext) {
    case 'csv': XLSX.writeFile(wb, dst, { bookType: 'csv' }); break;
    case 'tsv': {
      const ws = wb.Sheets[wb.SheetNames[0]];
      fs.writeFileSync(dst, XLSX.utils.sheet_to_csv(ws, { FS: '\t' }), 'utf8');
      break;
    }
    case 'xlsx': XLSX.writeFile(wb, dst, { bookType: 'xlsx' }); break;
    case 'xls': XLSX.writeFile(wb, dst, { bookType: 'biff8' }); break;
    case 'ods': XLSX.writeFile(wb, dst, { bookType: 'ods' }); break;
    default: throw new Error(`Unsupported spreadsheet output: ${ext}`);
  }
  return dst;
}

module.exports = { convertSpreadsheet, setSheetPdfRenderer };
