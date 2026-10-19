// Audio/video conversions + tools via bundled ffmpeg.
const path = require('path');
const fs = require('fs');
const { outPath, outDir, run, ffmpegPath, ffprobe } = require('./util');

const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'wma', 'aac']);

// Codec choices per output container. Defaults favor compatibility.
function codecArgs(ext) {
  switch (ext) {
    case 'mp4': return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart'];
    case 'mov': return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac'];
    case 'mkv': return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac'];
    case 'webm': return ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus'];
    case 'avi': return ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', '-q:a', '4'];
    case 'wmv': return ['-c:v', 'wmv2', '-b:v', '2M', '-c:a', 'wmav2'];
    case 'gif': return ['-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0'];
    case 'm4a': return ['-vn', '-c:a', 'aac', '-b:a', '192k'];
    case 'mp3': return ['-vn', '-c:a', 'libmp3lame', '-q:a', '3'];
    case 'wav': return ['-vn', '-c:a', 'pcm_s16le'];
    case 'flac': return ['-vn', '-c:a', 'flac'];
    case 'ogg': return ['-vn', '-c:a', 'libvorbis', '-q:a', '5'];
    case 'opus': return ['-vn', '-c:a', 'libopus', '-b:a', '128k'];
    case 'aiff': return ['-vn', '-c:a', 'pcm_s16be'];
    case 'wma': return ['-vn', '-c:a', 'wmav2', '-b:a', '192k'];
    case 'aac': return ['-vn', '-c:a', 'aac', '-b:a', '192k'];
    default: return [];
  }
}

function isAudioOnly(ext) { return AUDIO_EXTS.has(ext); }

async function convertAV(srcPath, targetExt, { outDir: od = null, onProgress } = {}) {
  const ext = targetExt.toLowerCase();
  const dst = outPath(srcPath, ext, { dir: od });
  const args = ['-y', '-i', srcPath, ...codecArgs(ext), dst];
  await runFF(args, srcPath, onProgress);
  return dst;
}

// Parse ffmpeg time= progress from stderr.
async function runFF(args, srcPath, onProgress) {
  let duration = 0;
  if (onProgress) {
    try {
      const meta = await ffprobe(srcPath);
      duration = parseFloat(meta.format?.duration || 0);
    } catch { /* ignore */ }
  }
  await run(ffmpegPath(), args, {
    timeout: 30 * 60 * 1000,
    onStderr: onProgress ? (chunk) => {
      const m = chunk.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m && duration > 0) {
        const t = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
        onProgress(Math.min(t / duration, 0.99));
      }
    } : null,
  });
}

// ---- AV tools ----
async function compressAV(srcPath, { crf = 28, outDir: od = null, onProgress } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const dst = outPath(srcPath, ext, { suffix: '-compressed', dir: od });
  await runFF(['-y', '-i', srcPath, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '128k', dst], srcPath, onProgress);
  return dst;
}

function toSeconds(v) {
  if (v == null || v === '') return null;
  if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  const m = String(v).match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); // h:mm:ss or mm:ss
  if (m) return (+m[1] || 0) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  return null;
}

async function trimAV(srcPath, { start, end, outDir: od = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const dst = outPath(srcPath, ext, { suffix: '-trimmed', dir: od });
  const args = ['-y'];
  const s = toSeconds(start), e = toSeconds(end);
  if (s != null) args.push('-ss', String(s));
  args.push('-i', srcPath);
  if (e != null) args.push('-to', String(e - (s || 0)));
  args.push('-c', 'copy', dst);
  try {
    await run(ffmpegPath(), args);
  } catch {
    // stream copy can fail on keyframe boundaries — re-encode fallback
    const args2 = ['-y'];
    if (s != null) args2.push('-ss', String(s));
    args2.push('-i', srcPath);
    if (e != null) args2.push('-to', String(e - (s || 0)));
    args2.push(...codecArgs(ext === 'gif' ? 'mp4' : ext), dst);
    await run(ffmpegPath(), args2);
  }
  return dst;
}

async function muteVideo(srcPath, { outDir: od = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const dst = outPath(srcPath, ext, { suffix: '-muted', dir: od });
  await run(ffmpegPath(), ['-y', '-i', srcPath, '-c:v', 'copy', '-an', dst]);
  return dst;
}

async function extractAudio(srcPath, { outDir: od = null } = {}) {
  const dst = outPath(srcPath, 'mp3', { dir: od });
  await run(ffmpegPath(), ['-y', '-i', srcPath, '-vn', '-c:a', 'libmp3lame', '-q:a', '3', dst]);
  return dst;
}

async function extractFrames(srcPath, { fps = 1, outDir: od = null } = {}) {
  const base = path.basename(srcPath, path.extname(srcPath));
  const dir = outDir(srcPath, `${base}-frames`);
  await run(ffmpegPath(), ['-y', '-i', srcPath, '-vf', `fps=${fps}`,
    path.join(dir, 'frame-%04d.png')]);
  return dir;
}

async function changeSpeed(srcPath, { factor = 2, outDir: od = null, onProgress } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const f = Math.max(0.1, Math.min(100, Number(factor) || 2));
  const dst = outPath(srcPath, ext, { suffix: `-${f}x`, dir: od });
  // setpts for video; atempo accepts 0.5-100 per filter in modern ffmpeg
  const vf = `setpts=${(1 / f).toFixed(4)}*PTS`;
  const af = `atempo=${f.toFixed(4)}`;
  await runFF(['-y', '-i', srcPath, '-filter_complex', `[0:v]${vf}[v];[0:a]${af}[a]`,
    '-map', '[v]', '-map', '[a]', ...codecArgs(ext === 'gif' ? 'mp4' : ext).slice(0, -0), dst],
    srcPath, onProgress);
  return dst;
}

async function mergeAV(srcPaths, { outDir: od = null, onProgress } = {}) {
  // concat demuxer; re-encode for reliability across mismatched streams
  const ext = path.extname(srcPaths[0]).slice(1).toLowerCase();
  const listFile = path.join(require('os').tmpdir(), `crucible-concat-${Date.now()}.txt`);
  fs.writeFileSync(listFile, srcPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const dst = outPath(srcPaths[0], ext, { suffix: '-merged', dir: od });
  try {
    await runFF(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      ...codecArgs(ext), dst], srcPaths[0], onProgress);
  } finally {
    fs.rmSync(listFile, { force: true });
  }
  return dst;
}

async function normalizeAudio(srcPath, { outDir: od = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const dst = outPath(srcPath, ext, { suffix: '-normalized', dir: od });
  await run(ffmpegPath(), ['-y', '-i', srcPath, '-af', 'loudnorm', ...codecArgs(ext), dst]);
  return dst;
}

// Strip all container/stream metadata while copying streams untouched.
async function stripAVMeta(srcPath, { outDir: od = null } = {}) {
  const ext = path.extname(srcPath).slice(1).toLowerCase();
  const dst = outPath(srcPath, ext, { suffix: '-clean', dir: od });
  await run(ffmpegPath(), ['-y', '-i', srcPath, '-map_metadata', '-1',
    '-map_chapters', '-1', '-c', 'copy', dst]);
  return dst;
}

module.exports = {
  convertAV, compressAV, trimAV, muteVideo, extractAudio, extractFrames,
  changeSpeed, mergeAV, normalizeAudio, isAudioOnly, stripAVMeta,
};
