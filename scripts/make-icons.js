// Generates build/icon.png (512) and build/trayTemplate.png (22, macOS template).
// Run once: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });

// --- app icon: molten orb in a dark squircle -------------------------------
function drawIcon(size) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  const s = size;
  // squircle-ish rounded rect background
  const r = s * 0.22;
  x.beginPath();
  x.moveTo(r, 0);
  x.arcTo(s, 0, s, s, r); x.arcTo(s, s, 0, s, r);
  x.arcTo(0, s, 0, 0, r); x.arcTo(0, 0, s, 0, r);
  x.closePath();
  const bg = x.createRadialGradient(s * .35, s * .3, s * .05, s / 2, s / 2, s * .75);
  bg.addColorStop(0, '#3a3a42'); bg.addColorStop(1, '#101014');
  x.fillStyle = bg; x.fill();

  // molten core
  const g = x.createRadialGradient(s * .42, s * .38, s * .04, s * .5, s * .52, s * .32);
  g.addColorStop(0, '#ffd9a8'); g.addColorStop(.45, '#ff8a3d');
  g.addColorStop(.8, '#f2541b'); g.addColorStop(1, 'rgba(194,63,14,0)');
  x.beginPath(); x.arc(s / 2, s * .52, s * .32, 0, Math.PI * 2);
  x.fillStyle = g; x.fill();
  // crucible rim — open arc
  x.beginPath(); x.arc(s / 2, s * .52, s * .36, Math.PI * .15, Math.PI * .85, false);
  x.strokeStyle = 'rgba(255,179,122,.9)'; x.lineWidth = s * .028; x.lineCap = 'round';
  x.stroke();
  return c.toBuffer('image/png');
}

// --- tray template: black shape, transparent bg (macOS template rules) -----
function drawTray(size) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  const s = size;
  x.fillStyle = '#000';
  x.beginPath(); x.arc(s / 2, s / 2, s * .3, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#000'; x.lineWidth = s * .1; x.lineCap = 'round';
  x.beginPath(); x.arc(s / 2, s / 2, s * .4, Math.PI * .15, Math.PI * .85); x.stroke();
  return c.toBuffer('image/png');
}

fs.writeFileSync(path.join(out, 'icon.png'), drawIcon(512));
fs.writeFileSync(path.join(out, 'trayTemplate.png'), drawTray(44));
fs.writeFileSync(path.join(out, 'trayTemplate@2x.png'), drawTray(88));
console.log('icons written to build/');
