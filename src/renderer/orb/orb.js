const orb = document.getElementById('orb');
const fg = document.getElementById('fg');
const label = document.getElementById('label');
const CIRC = 2 * Math.PI * 42;

// ---- file drop ------------------------------------------------------------
orb.addEventListener('dragover', (e) => { e.preventDefault(); orb.classList.add('over'); });
orb.addEventListener('dragleave', () => orb.classList.remove('over'));
orb.addEventListener('drop', (e) => {
  e.preventDefault();
  orb.classList.remove('over');
  const paths = [...e.dataTransfer.files]
    .map((f) => window.crucible.getPathForFile(f))
    .filter(Boolean);
  if (paths.length) {
    window.crucible.invoke('orb:dropped', {
      paths, clientX: e.clientX + 8, clientY: e.clientY + 8,
    });
  }
});

// ---- drag the orb itself ----------------------------------------------------
let dragging = false;
let offX = 0, offY = 0;
orb.addEventListener('mousedown', (e) => {
  dragging = true;
  offX = e.screenX - window.screenX;
  offY = e.screenY - window.screenY;
});
window.addEventListener('mousemove', (e) => {
  if (dragging && e.buttons === 1) {
    window.crucible.invoke('orb:move', { x: e.screenX - offX, y: e.screenY - offY });
  }
});
window.addEventListener('mouseup', (e) => {
  if (dragging) {
    dragging = false;
    window.crucible.invoke('orb:moved', { x: e.screenX - offX, y: e.screenY - offY });
  }
});

// ---- job status -------------------------------------------------------------
let labelTimer = null;
function flashLabel(text, sticky = false) {
  label.textContent = text;
  label.classList.add('show');
  clearTimeout(labelTimer);
  if (!sticky) labelTimer = setTimeout(() => label.classList.remove('show'), 3000);
}

window.crucible.on('job:progress', (f) => {
  fg.style.strokeDashoffset = String(CIRC * (1 - f));
});
window.crucible.on('job:status', ({ state, label: l, n, errs }) => {
  orb.classList.toggle('busy', state === 'running');
  if (state === 'running') { fg.style.strokeDashoffset = String(CIRC); flashLabel(l, true); }
  else {
    fg.style.strokeDashoffset = String(CIRC);
    flashLabel(state === 'error' ? `✗ ${l}` : `✓ ${l}${n ? ` — ${n} file${n > 1 ? 's' : ''}` : ''}`);
  }
});
