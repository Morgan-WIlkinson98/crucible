// Window management: orb (desktop-level drop target), wheel (transient
// radial overlay), settings, hidden print window for printToPDF,
// and float preview windows.
const path = require('path');
const { BrowserWindow, screen, app } = require('electron');

const R = (p) => path.join(app.getAppPath(), 'src', 'renderer', p);
const IS_MAC = process.platform === 'darwin';

let orbWin = null;
let wheelWin = null;
let settingsWin = null;
let printWin = null;
const floatWins = new Set();

function createOrb(pos) {
  if (orbWin) return orbWin;
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const x = pos?.x ?? width - 120;
  const y = pos?.y ?? height - 120;

  orbWin = new BrowserWindow({
    width: 96, height: 96, x, y,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: false,          // desktop-level: covered by app windows
    fullscreenable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false,
    focusable: true,
    visibleOnAllWorkspaces: false, // stays out of fullscreen spaces (mac)
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src', 'main', 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  orbWin.setMenu(null);
  orbWin.loadFile(R('orb/orb.html'));
  orbWin.on('closed', () => { orbWin = null; });
  return orbWin;
}

function createWheel() {
  if (wheelWin) return wheelWin;
  wheelWin = new BrowserWindow({
    width: 520, height: 520,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, fullscreenable: false,
    minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false, show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src', 'main', 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  wheelWin.setMenu(null);
  if (IS_MAC) wheelWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  wheelWin.loadFile(R('wheel/wheel.html'));
  wheelWin.on('closed', () => { wheelWin = null; });
  return wheelWin;
}

// Position + show the wheel centered on a screen point.
function showWheelAt(point, payload, { focus = true } = {}) {
  const w = createWheel();
  const size = 520;
  const display = screen.getDisplayNearestPoint(point);
  const wa = display.workArea;
  const x = Math.round(Math.min(Math.max(point.x - size / 2, wa.x), wa.x + wa.width - size));
  const y = Math.round(Math.min(Math.max(point.y - size / 2, wa.y), wa.y + wa.height - size));
  w.setBounds({ x, y, width: size, height: size });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.showInactive(); // don't steal focus mid-drag
  if (focus && !w.isFocused()) w.focus();
  if (w.webContents.isLoading()) {
    w.webContents.once('did-finish-load', () => w.webContents.send('wheel:data', payload));
  } else {
    w.webContents.send('wheel:data', payload);
  }
  return w;
}

function hideWheel() {
  if (wheelWin && !wheelWin.isDestroyed()) wheelWin.hide();
}

function sendToWheel(channel, data) {
  if (wheelWin && !wheelWin.isDestroyed()) wheelWin.webContents.send(channel, data);
}

function createSettings() {
  if (settingsWin) { settingsWin.focus(); return settingsWin; }
  settingsWin = new BrowserWindow({
    width: 480, height: 620,
    frame: false, transparent: true, resizable: false,
    minimizable: false, maximizable: false,
    title: 'Crucible Settings',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src', 'main', 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(R('settings/settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
  return settingsWin;
}

// Hidden window used purely for printToPDF on generated HTML.
function getPrintWindow() {
  if (printWin && !printWin.isDestroyed()) return printWin;
  printWin = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { sandbox: true },
  });
  printWin.on('closed', () => { printWin = null; });
  return printWin;
}

async function htmlToPdfBuffer(html) {
  const w = getPrintWindow();
  await w.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(html).toString('base64'));
  const buf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: false });
  return buf;
}

// "Float" action — small always-on-top preview window.
function floatPreview(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const w = new BrowserWindow({
    width: 420, height: 480,
    alwaysOnTop: true, resizable: true,
    title: path.basename(filePath),
    webPreferences: { sandbox: true },
  });
  w.setAlwaysOnTop(true, 'floating');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let body;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) {
    body = `<img src="file://${filePath}" style="max-width:100%;max-height:100%;object-fit:contain">`;
  } else if (['txt', 'md', 'srt', 'vtt', 'csv', 'tsv'].includes(ext)) {
    const fs = require('fs');
    body = `<pre style="white-space:pre-wrap;font:12px Menlo,monospace;color:#eee">${esc(fs.readFileSync(filePath, 'utf8').slice(0, 20000))}</pre>`;
  } else {
    body = `<div style="color:#eee;font:14px -apple-system;padding:2em;text-align:center">${esc(path.basename(filePath))}<br><br>No preview</div>`;
  }
  w.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(
    `<html><body style="margin:0;background:#1a1a1e;display:flex;align-items:center;justify-content:center;min-height:100vh">${body}</body></html>`
  ).toString('base64'));
  floatWins.add(w);
  w.on('closed', () => floatWins.delete(w));
  return w;
}

module.exports = {
  createOrb, createWheel, showWheelAt, hideWheel, sendToWheel,
  createSettings, getPrintWindow, htmlToPdfBuffer, floatPreview,
  get orb() { return orbWin; },
  get wheel() { return wheelWin; },
};
