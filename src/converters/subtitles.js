// Subtitle conversions: SRT <-> VTT, either -> TXT.
const fs = require('fs');
const { outPath } = require('./util');

function srtToVtt(srt) {
  return 'WEBVTT\n\n' + srt
    .replace(/\r/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .split('\n')
    .filter((l) => !/^\d+$/.test(l.trim()))
    .join('\n');
}

function vttToSrt(vtt) {
  const lines = vtt.replace(/\r/g, '').split('\n')
    .filter((l) => !/^WEBVTT/.test(l.trim()) && !/^NOTE/.test(l.trim()));
  const out = [];
  let n = 0;
  for (const line of lines) {
    const fixed = line.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2')
      .replace(/(\d{2}:\d{2})\.(\d{3})/g, '00:$1,$2');
    if (/ --> /.test(fixed)) {
      n++;
      out.push(String(n), fixed);
    } else {
      out.push(fixed);
    }
  }
  return out.join('\n');
}

function subToTxt(content) {
  return content.replace(/\r/g, '').split('\n')
    .filter((l) => {
      const t = l.trim();
      return t && !/^\d+$/.test(t) && !/ --> /.test(t) && !/^WEBVTT/.test(t);
    })
    .map((l) => l.trim())
    .join('\n') + '\n';
}

async function convertSubtitle(srcPath, targetExt, { outDir: od = null } = {}) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const srcExt = srcPath.split('.').pop().toLowerCase();
  const ext = targetExt.toLowerCase();
  const dst = outPath(srcPath, ext, { dir: od });
  let out;
  if (ext === 'txt') out = subToTxt(src);
  else if (ext === 'vtt') out = srcExt === 'vtt' ? src : srtToVtt(src);
  else if (ext === 'srt') out = srcExt === 'srt' ? src : vttToSrt(src);
  else throw new Error(`Unsupported subtitle output: ${ext}`);
  fs.writeFileSync(dst, out, 'utf8');
  return dst;
}

module.exports = { convertSubtitle };
