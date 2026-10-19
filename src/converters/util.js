const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Resolve an output path next to the source, avoiding clobbering:
// "name.ext" -> "name.newext", or "name (2).newext" on collision.
function outPath(srcPath, newExt, { suffix = '', dir = null } = {}) {
  const srcDir = dir || path.dirname(srcPath);
  const base = path.basename(srcPath, path.extname(srcPath));
  let candidate = path.join(srcDir, `${base}${suffix}.${newExt}`);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(srcDir, `${base}${suffix} (${i}).${newExt}`);
    i++;
  }
  return candidate;
}

function outDir(srcPath, name) {
  const d = path.join(path.dirname(srcPath), name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// Run an external command, capturing stderr for error messages.
function run(cmd, args, { timeout = 300000, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = '';
    let stdout = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => {
      stderr += d;
      if (onStderr) onStderr(String(d));
    });
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`${path.basename(cmd)} timed out after ${timeout / 1000}s`));
    }, timeout);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

// ffmpeg/ffprobe resolve to bundled binaries; in packaged app they live
// in app.asar.unpacked.
function ffmpegPath() {
  let p = require('ffmpeg-static');
  return p ? p.replace('app.asar', 'app.asar.unpacked') : null;
}
function ffprobePath() {
  let p = require('ffprobe-static').path;
  return p ? p.replace('app.asar', 'app.asar.unpacked') : null;
}

async function ffprobe(file) {
  const { stdout } = await run(ffprobePath(), [
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  return JSON.parse(stdout);
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

module.exports = { outPath, outDir, run, ffmpegPath, ffprobePath, ffprobe, isDir };
