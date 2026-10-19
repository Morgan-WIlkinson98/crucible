const svg = document.getElementById('wheel');
const hubName = document.querySelector('#hub .name');
const hubCount = document.querySelector('#hub .count');
const tabsEl = document.getElementById('tabs');
const formEl = document.getElementById('form');
const toastEl = document.getElementById('toast');

const CX = 260, CY = 260, R_OUT = 250, R_IN = 92;
const WHEEL_ORDER = ['convert', 'tools', 'actions'];
const WHEEL_NAMES = { convert: 'Convert', tools: 'Tools', actions: 'Actions' };
const KEY_HINTS = { convert: '⇧', tools: '⌘', actions: '⌃' };

let data = null;           // {files, wheels, active}
let active = 'convert';
let wedges = [];           // [{pick, pathEl, midAngle}]
let hotIndex = -1;

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function wedgePath(a0, a1, r0, r1) {
  const [x0, y0] = polar(CX, CY, r1, a0);
  const [x1, y1] = polar(CX, CY, r1, a1);
  const [x2, y2] = polar(CX, CY, r0, a1);
  const [x3, y3] = polar(CX, CY, r0, a0);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1}
          L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

// word-wrap a label to fit the wedge's chord width at the label radius
function wrapLabel(text, maxChars, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  while (lines.length > maxLines) {
    const last = lines.pop();
    const prev = lines.pop() || '';
    lines.push(`${(prev + ' ' + last).trim().slice(0, maxChars - 1)}…`);
  }
  return lines.map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
}

function render() {
  const items = data.wheels[active] || [];
  svg.innerHTML = '';
  wedges = [];
  hubName.textContent = WHEEL_NAMES[active];
  hubCount.textContent = `${data.files.length} file${data.files.length > 1 ? 's' : ''}`;
  tabsEl.innerHTML = WHEEL_ORDER.map((w) =>
    `<span class="${w === active ? 'on' : ''}">${KEY_HINTS[w]} ${WHEEL_NAMES[w]}</span>`).join('');

  if (!items.length) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', CX); t.setAttribute('y', CY + R_IN + 60);
    t.setAttribute('class', 'wedge-label');
    t.textContent = 'No options for this selection';
    svg.appendChild(t);
    return;
  }

  const n = items.length;
  const gap = n > 8 ? 2 : 4;
  items.forEach((pick, i) => {
    const a0 = (i * 360) / n + gap / 2;
    const a1 = ((i + 1) * 360) / n - gap / 2;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', wedgePath(a0, a1, R_IN, R_OUT));
    p.setAttribute('class', 'wedge');
    svg.appendChild(p);

    const mid = (a0 + a1) / 2;
    const rMid = (R_IN + R_OUT) / 2;
    const [lx, ly] = polar(CX, CY, rMid, mid);
    // available label width ≈ chord across the wedge at label radius
    const chord = 2 * rMid * Math.sin(((a1 - a0) / 2) * Math.PI / 180);
    const fontSize = n > 12 ? 11.5 : n > 8 ? 13 : 15;
    const maxChars = Math.max(6, Math.floor((chord - 14) / (fontSize * 0.55)));
    const lines = wrapLabel(pick.label, maxChars);
    const lineH = fontSize + 4;
    const y0 = ly - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, k) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', lx); t.setAttribute('y', y0 + k * lineH);
      t.setAttribute('class', 'wedge-label');
      t.setAttribute('font-size', fontSize);
      t.setAttribute('dominant-baseline', 'middle');
      t.textContent = ln;
      svg.appendChild(t);
    });
    if (pick.sub) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      s.setAttribute('x', lx); s.setAttribute('y', ly + (lines.length * lineH) / 2 + 8);
      s.setAttribute('class', 'wedge-sub');
      s.setAttribute('dominant-baseline', 'middle');
      s.textContent = pick.sub.length > maxChars ? `${pick.sub.slice(0, maxChars - 1)}…` : pick.sub;
      svg.appendChild(s);
    }

    p.addEventListener('mouseenter', () => setHot(i));
    p.addEventListener('click', () => choose(pick));
    wedges.push({ pick, pathEl: p, midAngle: mid, a0, a1 });
  });
  setHot(-1);
}

function setHot(i) {
  hotIndex = i;
  wedges.forEach((w, j) => w.pathEl.classList.toggle('hot', j === i));
}

// pick wedge at local coords (for dropat during global drag)
function wedgeAt(x, y) {
  const dx = x - CX, dy = y - CY;
  const r = Math.hypot(dx, dy);
  if (r < R_IN || r > R_OUT) return null;
  let deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  if (deg < 0) deg += 360;
  return wedges.find((w) => deg >= w.a0 && deg <= w.a1) || null;
}

// ---- selection ------------------------------------------------------------
function choose(pick) {
  const opt = data.wheels[active].find((w) => w.id === pick.id);
  if (opt && opt.needsInput) return showForm(opt);
  submit(opt || pick, {});
}

function submit(pick, options) {
  window.crucible.invoke('wheel:pick', { pick, files: data.files, options });
}

function showForm(pick) {
  formEl.style.display = 'block';
  formEl.querySelector('h4').textContent = pick.label;
  const fields = formEl.querySelector('.fields');
  fields.innerHTML = '';
  const inputs = {};
  for (const f of pick.needsInput) {
    const l = document.createElement('label');
    l.textContent = f.label;
    const inp = document.createElement('input');
    inp.type = f.type === 'number' ? 'number' : 'text';
    inp.value = f.def ?? '';
    inp.step = 'any';
    fields.appendChild(l); fields.appendChild(inp);
    inputs[f.key] = inp;
  }
  formEl.querySelector('.no').onclick = () => { formEl.style.display = 'none'; };
  formEl.querySelector('.go').onclick = () => {
    const options = {};
    for (const [k, inp] of Object.entries(inputs)) options[k] = inp.value;
    formEl.style.display = 'none';
    submit(pick, options);
  };
  const first = fields.querySelector('input');
  first?.focus();
  fields.onkeydown = (e) => {
    if (e.key === 'Enter') formEl.querySelector('.go').click();
    if (e.key === 'Escape') { e.stopPropagation(); formEl.style.display = 'none'; }
  };
}

// ---- drag-over highlight (mid-drag wheel on both OSes) ----------------------
let lastHot = -1;
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  const w = wedgeAt(e.clientX, e.clientY);
  setHot(w ? wedges.indexOf(w) : -1);
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const w = wedgeAt(e.clientX, e.clientY);
  if (w) choose(w.pick);
});

// ---- IPC ------------------------------------------------------------------
window.crucible.on('wheel:data', (d) => { data = d; active = d.active || 'convert'; render(); });
window.crucible.on('wheel:switch', ({ active: a }) => { active = a; render(); });
window.crucible.on('wheel:dropat', ({ x, y }) => {
  // coordinates arrive in window-local px
  const w = wedgeAt(x, y);
  if (w) choose(w.pick);
  else window.crucible.invoke('wheel:cancel');
});

// ---- keyboard -------------------------------------------------------------
const KEYMAP = { Shift: 'convert', Meta: 'tools', Control: 'actions', Alt: 'actions' };
window.addEventListener('keydown', (e) => {
  if (formEl.style.display === 'block') return;
  if (KEYMAP[e.key] && data) { active = KEYMAP[e.key]; render(); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setHot((hotIndex + 1) % wedges.length); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setHot((hotIndex - 1 + wedges.length) % wedges.length); }
  else if (e.key === 'Enter' && hotIndex >= 0) choose(wedges[hotIndex].pick);
  else if (e.key === 'Escape') window.crucible.invoke('wheel:cancel');
  else if (e.key === 'Tab') {
    const i = WHEEL_ORDER.indexOf(active);
    active = WHEEL_ORDER[(i + 1) % WHEEL_ORDER.length];
    render();
  }
});
