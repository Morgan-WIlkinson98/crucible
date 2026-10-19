const isMac = window.crucible.platform === 'darwin';
if (!isMac) document.querySelectorAll('.mac-only').forEach((el) => el.style.display = 'none');

const $ = (id) => document.getElementById(id);
let settings = {};

const KEYS = ['shift', 'cmd', 'ctrl', 'option'];
const KEY_LABELS = isMac
  ? { shift: '⇧ Shift', cmd: '⌘ Command', ctrl: '⌃ Control', option: '⌥ Option' }
  : { shift: 'Shift', cmd: 'Win', ctrl: 'Ctrl', option: 'Alt' };

async function load() {
  settings = await window.crucible.invoke('settings:get');
  $('orb').checked = settings.orbVisible;
  $('globalDrag').checked = settings.globalDrag;
  $('login').checked = settings.launchAtLogin;
  $('outdir').textContent = settings.outputDir || 'Same as source';
  for (const w of ['convert', 'tools', 'actions']) {
    const sel = $('k-' + w);
    sel.innerHTML = KEYS.map((k) =>
      `<option value="${k}" ${settings.wheelKeys[w] === k ? 'selected' : ''}>${KEY_LABELS[k]}</option>`).join('');
  }
  refreshPerm();
}

async function save(patch) {
  settings = await window.crucible.invoke('settings:set', patch);
}

async function refreshPerm() {
  const st = await window.crucible.invoke('agent:status');
  if (!st.available) return;
  $('perm').textContent = st.inputMonitoring ? 'granted' : 'not granted';
  $('perm').className = st.inputMonitoring ? 'ok' : 'warn';
}

$('orb').onchange = (e) => save({ orbVisible: e.target.checked });
$('globalDrag').onchange = (e) => save({ globalDrag: e.target.checked });
$('login').onchange = (e) => save({ launchAtLogin: e.target.checked });
$('close').onclick = () => window.crucible.invoke('settings:close');
$('grant').onclick = async () => {
  await window.crucible.invoke('agent:requestAccess');
  setTimeout(refreshPerm, 1500);
};
$('pick').onclick = async () => {
  const dir = await window.crucible.invoke('settings:pickDir');
  if (dir) { $('outdir').textContent = dir; save({ outputDir: dir }); }
};
for (const w of ['convert', 'tools', 'actions']) {
  $('k-' + w).onchange = (e) => save({ wheelKeys: { ...settings.wheelKeys, [w]: e.target.value } });
}

load();
