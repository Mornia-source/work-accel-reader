// 只渲染当前位置附近的一段段落（窗口化），几十 MB 的 TXT 也不会卡
const WINDOW = 400; // 同时存在于 DOM 中的段落数
const MARGIN = 80; // 锚点离窗口边缘小于这个数就重新渲染

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const content = $('content');
const root = document.documentElement.style;

let book = null; // { path, title, paras }
let start = 0; // 当前渲染窗口的第一段下标
let lineH = 27;
let rows = 1; // 一屏能放下的整行数
let saveTimer = null;

// ---------- 样式 ----------

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function applyStyle(s) {
  const anchor = book ? currentAnchor() : null;
  root.setProperty('--bg', hexToRgb(s.bgColor));
  root.setProperty('--bg-a', s.bgOpacity);
  root.setProperty('--fg', hexToRgb(s.textColor));
  root.setProperty('--fg-a', s.textOpacity);
  root.setProperty('--font-size', s.fontSize + 'px');
  root.setProperty('--font', `'${s.fontFamily}'`);
  lineH = Math.round(s.fontSize * s.lineHeight);
  root.setProperty('--line-h', lineH + 'px');
  layout(anchor);
}

// 视口高度取整到行高的整数倍
function layout(anchor = book ? currentAnchor() : null) {
  const avail = window.innerHeight - 6 - 16;
  rows = Math.max(1, Math.floor(avail / lineH));
  viewport.style.height = rows * lineH + 'px';
  if (anchor) restoreAnchor(anchor);
}

// ---------- 渲染窗口 ----------

function renderFrom(newStart) {
  start = Math.max(0, newStart);
  const frag = document.createDocumentFragment();
  const end = Math.min(book.paras.length, start + WINDOW);
  for (let i = start; i < end; i++) {
    const p = document.createElement('p');
    p.textContent = book.paras[i];
    frag.appendChild(p);
  }
  content.replaceChildren(frag);
}

function paraEl(i) {
  return content.children[i - start];
}

// 视口顶端落在哪一段、段内偏移多少；ratio 用于字号/窗口变化后按比例还原
function currentAnchor() {
  const top = viewport.scrollTop;
  const kids = content.children;
  let lo = 0;
  let hi = kids.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (kids[mid].offsetTop <= top) lo = mid;
    else hi = mid - 1;
  }
  const el = kids[lo];
  if (!el) return { para: 0, offset: 0, ratio: 0 };
  const offset = top - el.offsetTop;
  return { para: start + lo, offset, ratio: offset / (el.offsetHeight || 1) };
}

function restoreAnchor({ para, offset, ratio }) {
  if (para < start || para >= start + content.children.length || (para - start < MARGIN && start > 0)) {
    renderFrom(para - MARGIN);
  }
  const el = paraEl(para);
  if (!el) return;
  let off = ratio !== undefined ? ratio * el.offsetHeight : offset;
  off = Math.floor(off / lineH) * lineH; // 对齐到整行
  viewport.scrollTop = el.offsetTop + off;
  afterMove();
}

// ---------- 翻行 / 翻页 ----------

function scrollLines(n) {
  if (!book) return;
  const atBookEnd = start + content.children.length >= book.paras.length;
  let top = viewport.scrollTop + n * lineH;
  top = Math.max(0, top);
  if (atBookEnd) top = Math.min(top, Math.max(0, content.scrollHeight - rows * lineH));
  viewport.scrollTop = top;
  afterMove();
}

function afterMove() {
  const a = currentAnchor();
  const rel = a.para - start;
  const needDown = rel > WINDOW - MARGIN && start + WINDOW < book.paras.length;
  const needUp = rel < MARGIN && start > 0;
  if (needDown || needUp) {
    renderFrom(a.para - MARGIN);
    viewport.scrollTop = paraEl(a.para).offsetTop + a.offset;
  }
  updateStatus(a);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const cur = currentAnchor();
    window.reader.saveProgress({ path: book.path, para: cur.para, offset: cur.offset });
  }, 300);
}

function updateStatus(a) {
  const pct = ((a.para / Math.max(1, book.paras.length - 1)) * 100).toFixed(1);
  $('status').textContent = pct + '%';
}

const NAV = {
  nextLine: () => scrollLines(1),
  prevLine: () => scrollLines(-1),
  nextPage: () => scrollLines(rows),
  prevPage: () => scrollLines(-rows),
};

// ---------- 提示 ----------

let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1200);
}

// ---------- 事件 ----------

window.reader.on('style', applyStyle);
window.reader.on('toast', toast);
window.reader.on('nav', (type) => NAV[type] && NAV[type]());
window.reader.on('mode', ({ clickThrough }) => {
  document.body.classList.toggle('click-through', clickThrough);
});
window.reader.on('book', (b) => {
  book = b;
  $('title').textContent = b.title;
  document.title = b.title;
  renderFrom(b.progress.para - MARGIN);
  restoreAnchor({ para: Math.min(b.progress.para, b.paras.length - 1), offset: b.progress.offset });
});

window.addEventListener('resize', () => layout());

viewport.parentElement.addEventListener('wheel', (e) => {
  scrollLines(e.deltaY > 0 ? 3 : -3);
});

// 窗口有焦点时的本地按键（不带 Alt）
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey) return;
  const map = {
    ArrowDown: 'nextLine',
    ArrowUp: 'prevLine',
    PageDown: 'nextPage',
    PageUp: 'prevPage',
    ' ': 'nextPage',
  };
  if (map[e.key]) {
    e.preventDefault();
    NAV[map[e.key]]();
  }
});

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) window.reader.dropFile(f);
});

$('btn-open').addEventListener('click', () => window.reader.openFile());
$('btn-settings').addEventListener('click', () => window.reader.openSettings());
$('btn-hide').addEventListener('click', () => window.reader.hide());

window.reader.ready();
