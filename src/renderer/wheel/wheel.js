const svg = document.getElementById('wheel');
const hubName = document.querySelector('#hub .name');
const hubCount = document.querySelector('#hub .count');
const tabsEl = document.getElementById('tabs');
const formEl = document.getElementById('form');
const toastEl = document.getElementById('toast');

const CX = 260, CY = 260, SO = 225, RI = 100;  // outer square half-size, hub circle radius
const WHEEL_ORDER = ['convert', 'tools', 'actions'];
const WHEEL_NAMES = { convert: 'Convert', tools: 'Tools', actions: 'Actions' };
const KEY_HINTS = { convert: '⇧', tools: '⌘', actions: '⌃' };

let data = null;           // {files, wheels, active}
let active = 'convert';
let wedges = [];           // [{pick, pathEl, t0, t1}]
let hotIndex = -1;

// point on a square boundary: t in [0,1) clockwise from the top-left corner,
// s = half-size of the square
function squarePoint(t, s) {
  const p = (((t % 1) + 1) % 1) * 4;
  const e = Math.floor(p) % 4, f = p - Math.floor(p);
  if (e === 0) return [CX - s + 2 * s * f, CY - s];   // top, L→R
  if (e === 1) return [CX + s, CY - s + 2 * s * f];   // right, T→B
  if (e === 2) return [CX + s - 2 * s * f, CY + s];   // bottom, R→L
  return [CX - s, CY + s - 2 * s * f];                // left, B→T
}

function cornersBetween(t0, t1) {
  return [0.25, 0.5, 0.75].filter((c) => c > t0 && c < t1);
}

// ring cell for perimeter range [t0, t1]: square outer boundary, radial
// sides, and a circular arc hugging the hub on the inside. The junctions
// between sides and arc are filleted (quadratic beziers) so cells flow
// into the circle instead of cornering sharply.
const pt = (a, r) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
const fmt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

function cellPath(t0, t1) {
  const corners = cornersBetween(t0, t1);
  const outer = [t0, ...corners, t1].map((t) => squarePoint(t, SO));
  const a0 = Math.atan2(outer[0][1] - CY, outer[0][0] - CX);
  const a1 = Math.atan2(outer[outer.length - 1][1] - CY, outer[outer.length - 1][0] - CX);
  let span = a1 - a0;
  while (span < 0) span += Math.PI * 2;

  const F = Math.min(16, span * RI * 0.3);   // fillet length along each side
  const dA = F / RI;                          // equivalent angle on the arc
  const i0 = pt(a0, RI), i1 = pt(a1, RI);             // sharp corners (bezier controls)
  const s0 = pt(a0, RI + F), s1 = pt(a1, RI + F);     // where straight sides end
  const e0 = pt(a0 + dA, RI), e1 = pt(a1 - dA, RI);   // where the arc begins/ends
  const large = (span - 2 * dA) > Math.PI ? 1 : 0;
  return 'M ' + outer.map(fmt).join(' L ') +
         ` L ${fmt(s1)} Q ${fmt(i1)} ${fmt(e1)}` +
         ` A ${RI} ${RI} 0 ${large} 0 ${fmt(e0)}` +
         ` Q ${fmt(i0)} ${fmt(s0)} Z`;
}

// word-wrap a label — never truncates; caller shrinks font until it fits
function wrapLabel(text, maxChars) {
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
  return lines;
}

// pick a font size whose wrapped label fits in maxLines lines
function fitLabel(text, segLen, baseSize, maxLines = 3) {
  let fontSize = baseSize;
  let lines = [];
  while (fontSize >= 8) {
    const maxChars = Math.max(5, Math.floor((segLen - 44) / (fontSize * 0.62)));
    lines = wrapLabel(text, maxChars);
    if (lines.length <= maxLines) break;
    fontSize -= 0.5;
  }
  return { fontSize, lines };
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
    t.setAttribute('x', CX); t.setAttribute('y', CY + RI + 60);
    t.setAttribute('class', 'wedge-label');
    t.textContent = 'No options for this selection';
    svg.appendChild(t);
    return;
  }

  const n = items.length;
  const segLen = (8 * SO) / n;         // cell width along the perimeter (px)
  const baseSize = n > 12 ? 10.5 : n > 8 ? 12 : 14;
  items.forEach((pick, i) => {
    const t0 = i / n, t1 = (i + 1) / n;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', cellPath(t0, t1));   // no gaps — shared borders
    p.setAttribute('class', 'wedge');
    svg.appendChild(p);

    const mid = (t0 + t1) / 2;
    const [ox, oy] = squarePoint(mid, SO);
    const am = Math.atan2(oy - CY, ox - CX);
    const lx = (ox + CX + RI * Math.cos(am)) / 2, ly = (oy + CY + RI * Math.sin(am)) / 2;
    const { fontSize, lines } = fitLabel(pick.label, segLen, baseSize);
    const lineH = fontSize + 3;
    const subH = pick.sub ? 12 : 0;   // reserve room so label+sub centers as a block
    const y0 = ly - ((lines.length - 1) * lineH + subH) / 2;
    lines.forEach((ln, k) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', lx); t.setAttribute('y', y0 + k * lineH);
      t.setAttribute('class', 'wedge-label');
      t.style.fontSize = `${fontSize}px`;
      t.setAttribute('dominant-baseline', 'middle');
      t.textContent = ln;
      svg.appendChild(t);
    });
    if (pick.sub) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      s.setAttribute('x', lx); s.setAttribute('y', y0 + lines.length * lineH);
      s.setAttribute('class', 'wedge-sub');
      s.setAttribute('dominant-baseline', 'middle');
      s.textContent = pick.sub;   // never truncated
      svg.appendChild(s);
    }

    // angular bounds for hit-testing (cell sides are radial)
    const p0 = squarePoint(t0, SO), p1 = squarePoint(t1, SO);
    const th0 = Math.atan2(p0[1] - CY, p0[0] - CX);
    let span = Math.atan2(p1[1] - CY, p1[0] - CX) - th0;
    while (span < 0) span += Math.PI * 2;

    p.addEventListener('mouseenter', () => setHot(i));
    p.addEventListener('click', () => choose(pick));
    wedges.push({ pick, pathEl: p, th0, span });
  });
  setHot(-1);
}

function setHot(i) {
  hotIndex = i;
  wedges.forEach((w, j) => w.pathEl.classList.toggle('hot', j === i));
  if (data && i >= 0 && wedges[i]) {
    const pick = wedges[i].pick;
    hubName.textContent = pick.label.replace(/^→\s*/, '');
    hubName.style.fontSize = '13px';
    hubCount.textContent = pick.sub || (pick.needsInput ? 'asks for options' : '');
  } else if (data) {
    hubName.textContent = WHEEL_NAMES[active];
    hubName.style.fontSize = '';
    hubCount.textContent = `${data.files.length} file${data.files.length > 1 ? 's' : ''}`;
  }
}

// pick cell at local coords (for dropat during global drag)
function wedgeAt(x, y) {
  const dx = x - CX, dy = y - CY;
  if (Math.abs(dx) > SO || Math.abs(dy) > SO) return null;   // outside outer square
  if (Math.hypot(dx, dy) < RI) return null;                  // inside hub circle
  const th = Math.atan2(dy, dx);
  const TAU = Math.PI * 2;
  return wedges.find((w) => ((th - w.th0 + TAU) % TAU) <= w.span) || null;
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
