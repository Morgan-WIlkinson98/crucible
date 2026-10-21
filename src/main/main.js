const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, dialog, shell, clipboard, screen } = require('electron');

const windows = require('./windows');
const agent = require('./agent');
const { convert } = require('../converters');
const docs = require('../converters/documents');
const sheets = require('../converters/spreadsheets');
const { runTool, setHelpers: setToolHelpers } = require('../tools');
const { runAction, setHelpers: setActionHelpers } = require('../actions');
const { outputsForSet, categoryOf, formatInfo, IS_MAC } = require('../shared/formats');
const { toolsFor } = require('../shared/tools');
const { actionsFor } = require('../shared/actions');

const IS_WIN = process.platform === 'win32';
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');

let settings = null;
let tray = null;
let pendingDrag = null;   // {files, wheels} during a global (agent) drag
let activeWheel = null;   // 'convert' | 'tools' | 'actions'
let currentJob = null;

// ------------------------------------------------------------- settings
function loadSettings() {
  const def = {
    outputDir: '',              // '' = same folder as source
    orbVisible: true,
    orbPos: null,
    launchAtLogin: true,
    globalDrag: IS_MAC,         // macOS: system-wide drag interception
    wheelKeys: { convert: 'shift', tools: 'cmd', actions: 'ctrl' },
  };
  try {
    settings = { ...def, ...JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8')) };
  } catch { settings = def; }
  return settings;
}
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  fs.mkdirSync(path.dirname(SETTINGS_PATH()), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2));
  return settings;
}

// ------------------------------------------------------------- wheels
// Build the three wheel option sets for a dropped selection.
function buildWheels(filePaths) {
  const exts = [];
  const cats = new Set();
  let hasDirs = false;
  for (const p of filePaths) {
    if (fs.statSync(p).isDirectory()) { hasDirs = true; continue; }
    const ext = path.extname(p).slice(1).toLowerCase();
    exts.push(ext);
    const c = categoryOf(ext);
    if (c) cats.add(c);
  }

  const convertOpts = (!hasDirs && exts.length)
    ? outputsForSet(exts).map((o) => ({ id: `convert:${o.ext}`, label: `→ ${o.name}`, sub: `.${o.ext}` }))
    : [];

  let tools;
  if (hasDirs || !exts.length) {
    tools = toolsFor('*');
  } else if (cats.size === 1) {
    tools = toolsFor([...cats][0]);
  } else {
    tools = toolsFor('*');
  }
  const toolOpts = tools.map((t) => ({
    id: `tool:${t.id}`, label: t.label, needsInput: t.needsInput || null, multi: !!t.multi,
  }));

  const actionOpts = actionsFor().map((a) => ({ id: `action:${a.id}`, label: a.label }));

  return { convert: convertOpts, tools: toolOpts, actions: actionOpts };
}

// ------------------------------------------------------------- job runner
async function runJob(files, pick, options = {}) {
  const [kind, id] = pick.id.split(':');
  const ctx = {
    outDir: settings.outputDir || null,
    onProgress: (f) => windows.orb?.webContents.send('job:progress', f),
  };
  windows.orb?.webContents.send('job:status', { state: 'running', label: pick.label });
  try {
    let result;
    if (kind === 'convert') result = await convert(files, id, ctx);
    else if (kind === 'tool') result = await runTool(id, files, options, ctx);
    else result = await runAction(id, files, ctx);

    const n = result.outputs?.length || 0;
    const errs = result.errors?.length || 0;
    windows.orb?.webContents.send('job:status', { state: 'done', label: pick.label, n, errs });
    const body = errs
      ? `${pick.label}: ${n} succeeded, ${errs} failed — ${result.errors[0].error}`
      : `${pick.label}: ${n} output${n === 1 ? '' : 's'} written`;
    new Notification({ title: 'Crucible', body }).show();
    return result;
  } catch (e) {
    windows.orb?.webContents.send('job:status', { state: 'error', label: pick.label, error: e.message });
    new Notification({ title: 'Crucible', body: `${pick.label} failed: ${e.message}` }).show();
    return { outputs: [], errors: [{ file: files[0], error: e.message }] };
  }
}

// ------------------------------------------------------------- orb <-> wheel flow
function openWheel(point, filePaths, active = 'convert', opts = {}) {
  const wheels = buildWheels(filePaths);
  activeWheel = active;
  windows.showWheelAt(point, { files: filePaths, wheels, active }, opts);
}

// ------------------------------------------------------------- agent (macOS global drag)
function wireAgent() {
  if (!IS_MAC) return;
  agent.on('event', (ev) => {
    switch (ev.event) {
      case 'ready':
        agent.inputMonitoring = ev.inputMonitoring;
        windows.setSpaceFullscreen(!!ev.fullscreen);
        break;
      case 'space':
        windows.setSpaceFullscreen(!!ev.fullscreen);
        break;
      case 'dragstart':
        if (settings.globalDrag) pendingDrag = { files: ev.files || [] };
        break;
      case 'key': {
        if (!pendingDrag) break;
        const map = settings.wheelKeys;
        const target = Object.keys(map).find((w) => map[w] === ev.key);
        if (!target) break;
        if (windows.wheel?.isVisible()) {
          activeWheel = target;
          windows.sendToWheel('wheel:switch', { active: target });
        } else {
          openWheel(screen.getCursorScreenPoint(), pendingDrag.files, target, { focus: false });
        }
        break;
      }
      case 'drop':
        if (windows.wheel?.isVisible()) {
          const b = windows.wheel.getBounds();
          windows.sendToWheel('wheel:dropat', { x: ev.x - b.x, y: ev.y - b.y });
          windows.hideWheel();
        }
        pendingDrag = null;
        break;
      case 'cancel':
        windows.hideWheel();
        pendingDrag = null;
        break;
    }
  });
  agent.on('error', (e) => console.error('agent:', e));
  agent.start();   // always on macOS — also powers OCR, share, space detection
}

// ------------------------------------------------------------- helpers injection
function wireHelpers() {
  docs.setPdfRenderer(windows.htmlToPdfBuffer);
  sheets.setSheetPdfRenderer(windows.htmlToPdfBuffer);
  setToolHelpers({ ocrImage: (p) => agent.ocr(p) });
  setActionHelpers({
    pickFolder: async () => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    },
    copyToClipboard: (s) => clipboard.writeText(s),
    reveal: (p) => shell.showItemInFolder(p),
    openTerminal: (dir) => {
      const { spawn } = require('child_process');
      if (IS_MAC) spawn('open', ['-a', 'Terminal', dir]);
      else if (IS_WIN) spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], { cwd: dir, detached: true });
      else spawn('x-terminal-emulator', [], { cwd: dir, detached: true });
    },
    trash: (p) => shell.trashItem(p),
    floatPreview: (p) => windows.floatPreview(p),
    share: (files, o) => IS_MAC ? agent.share(files, o?.service) : Promise.reject(new Error('Share requires macOS')),
  });
}

// ------------------------------------------------------------- tray
function makeTray() {
  const iconPath = path.join(app.getAppPath(), 'build', 'trayTemplate.png');
  tray = new Tray(iconPath);
  const menu = Menu.buildFromTemplate([
    { label: 'Crucible', enabled: false },
    { type: 'separator' },
    {
      label: 'Show Orb', type: 'checkbox', checked: settings.orbVisible,
      click: (mi) => {
        saveSettings({ orbVisible: mi.checked });
        mi.checked ? windows.createOrb(settings.orbPos) : windows.orb?.close();
      },
    },
    ...(IS_MAC ? [{
      label: 'Global drag (Shift wheel)', type: 'checkbox', checked: settings.globalDrag,
      click: (mi) => saveSettings({ globalDrag: mi.checked }),
    }] : []),
    { label: 'Settings…', click: () => windows.createSettings() },
    { type: 'separator' },
    { label: 'Quit Crucible', click: () => app.quit() },
  ]);
  tray.setToolTip('Crucible — drag files onto the orb, or tap Shift mid-drag');
  tray.setContextMenu(menu);
}

// ------------------------------------------------------------- IPC
function wireIPC() {
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, patch) => {
    const s = saveSettings(patch);
    app.setLoginItemSettings({ openAtLogin: s.launchAtLogin });
    // globalDrag gates drag interception only; agent stays up for OCR/share/space
    if ('orbVisible' in patch) patch.orbVisible ? windows.createOrb(s.orbPos) : windows.orb?.close();
    return s;
  });

  ipcMain.handle('orb:dropped', (_e, { paths, clientX, clientY }) => {
    const b = windows.orb.getBounds();
    const pt = { x: b.x + clientX, y: b.y + clientY };
    openWheel(pt, paths, 'convert');
  });

  ipcMain.handle('orb:move', (_e, { x, y }) => {
    windows.orb?.setPosition(Math.round(x), Math.round(y));
  });
  ipcMain.handle('orb:moved', (_e, { x, y }) => saveSettings({ orbPos: { x, y } }));

  ipcMain.handle('wheel:pick', (_e, { pick, files, options }) => {
    windows.hideWheel();
    return runJob(files, pick, options || {});
  });
  ipcMain.handle('wheel:cancel', () => windows.hideWheel());
  ipcMain.handle('wheel:switch', (_e, { active }) => {
    activeWheel = active;
    windows.sendToWheel('wheel:switch', { active });
  });

  ipcMain.handle('settings:pickDir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('settings:close', () => BrowserWindow.getFocusedWindow()?.close());
  ipcMain.handle('agent:status', () => ({
    available: IS_MAC, running: !!agent.proc,
    inputMonitoring: !!agent.inputMonitoring,
  }));
  ipcMain.handle('agent:requestAccess', () => {
    if (IS_MAC) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
  });
}

// ------------------------------------------------------------- lifecycle
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

app.whenReady().then(() => {
  loadSettings();
  if (IS_MAC) app.dock?.hide();
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  wireHelpers();
  wireIPC();
  makeTray();
  if (settings.orbVisible) windows.createOrb(settings.orbPos);
  wireAgent();
});

app.on('window-all-closed', (e) => { /* tray app — stay alive */ });
app.on('before-quit', () => agent.stop());
