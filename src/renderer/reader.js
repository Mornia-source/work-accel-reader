// 只渲染当前位置附近的一段段落（窗口化），几十 MB 的 TXT 也不会卡
const WINDOW = 400; // 同时存在于 DOM 中的段落数
const MARGIN = 80; // 锚点离窗口边缘小于这个数就重新渲染

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const content = $('content');
const root = document.documentElement.style;

let book = null; // { path, title, paras, chapters: [{ title, para }] }
let chapterSet = new Set(); // 章节标题所在段落下标
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
    if (chapterSet.has(i)) p.className = 'chapter';
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
  const ch = book.chapters[chapterIndexAt(a.para)];
  $('status-chapter').textContent = ch ? ch.title : '';
  $('status-pct').textContent = pct + '%';
}

// ---------- 章节 ----------

// 当前段落所属章节下标（最后一个 para <= 当前段的章节），没有则 -1
function chapterIndexAt(para) {
  const chs = book.chapters;
  let lo = 0;
  let hi = chs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chs[mid].para <= para) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function jumpTo(para) {
  restoreAnchor({ para: Math.max(0, Math.min(para, book.paras.length - 1)), offset: 0 });
}

function jumpChapter(dir) {
  if (!book || !book.chapters.length) return toast('没有识别到章节');
  const a = currentAnchor();
  const i = chapterIndexAt(a.para);
  let target;
  if (dir > 0) {
    target = book.chapters[i + 1];
    if (!target) return toast('已经是最后一章');
  } else {
    // 已经读过本章开头就先回到本章开头，否则去上一章
    const cur = book.chapters[i];
    const atStart = cur && a.para === cur.para && a.offset === 0;
    target = cur && !atStart ? cur : book.chapters[i - 1];
    if (!target) return jumpTo(0);
  }
  jumpTo(target.para);
  toast(target.title);
}

// ---------- 目录 ----------

const toc = $('toc');
const tocList = $('toc-list');
const tocFilter = $('toc-filter');
let tocItems = []; // 当前筛选结果 [{ title, para, index }]
let tocActive = -1;

function tocIsOpen() {
  return toc.classList.contains('open');
}

function openToc() {
  if (!book) return toast('还没有打开书');
  if (!book.chapters.length) return toast('没有识别到章节');
  toc.classList.add('open');
  window.reader.tocOpen(true);
  tocFilter.value = '';
  renderToc();
  tocFilter.focus();
}

function closeToc() {
  if (!tocIsOpen()) return;
  toc.classList.remove('open');
  window.reader.tocOpen(false);
}

function renderToc() {
  const q = tocFilter.value.trim().toLowerCase();
  const cur = chapterIndexAt(currentAnchor().para);
  tocItems = book.chapters
    .map((c, index) => ({ ...c, index }))
    .filter((c) => !q || c.title.toLowerCase().includes(q));
  const frag = document.createDocumentFragment();
  tocItems.forEach((c, i) => {
    const li = document.createElement('li');
    li.textContent = c.title;
    if (c.index === cur) li.classList.add('current');
    li.addEventListener('click', () => pickToc(i));
    frag.appendChild(li);
  });
  tocList.replaceChildren(frag);
  $('toc-count').textContent = `${tocItems.length} / ${book.chapters.length}`;
  const curPos = tocItems.findIndex((c) => c.index === cur);
  setTocActive(curPos >= 0 ? curPos : 0, 'center');
}

function setTocActive(i, block = 'nearest') {
  if (!tocItems.length) return;
  tocActive = Math.max(0, Math.min(i, tocItems.length - 1));
  [...tocList.children].forEach((li, k) => li.classList.toggle('active', k === tocActive));
  tocList.children[tocActive].scrollIntoView({ block });
}

function pickToc(i) {
  const c = tocItems[i];
  if (!c) return;
  closeToc();
  jumpTo(c.para);
}

function onTocKey(e) {
  const page = Math.max(1, Math.floor(tocList.clientHeight / 26) - 1);
  const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
  if (e.key === 'Escape') closeToc();
  else if (e.key === 'Enter') pickToc(tocActive);
  else if (moves[e.key]) setTocActive(tocActive + moves[e.key]);
  else return;
  e.preventDefault();
}

tocFilter.addEventListener('input', renderToc);
$('toc-close').addEventListener('click', closeToc);

const NAV = {
  nextLine: () => scrollLines(1),
  prevLine: () => scrollLines(-1),
  nextPage: () => scrollLines(rows),
  prevPage: () => scrollLines(-rows),
  nextChapter: () => jumpChapter(1),
  prevChapter: () => jumpChapter(-1),
  toggleToc: () => (tocIsOpen() ? closeToc() : openToc()),
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
  closeToc();
  book = b;
  chapterSet = new Set(b.chapters.map((c) => c.para));
  $('title').textContent = b.title;
  document.title = b.title;
  renderFrom(b.progress.para - MARGIN);
  restoreAnchor({ para: Math.min(b.progress.para, b.paras.length - 1), offset: b.progress.offset });
});

window.addEventListener('resize', () => layout());

viewport.parentElement.addEventListener('wheel', (e) => {
  if (tocIsOpen()) return;
  scrollLines(e.deltaY > 0 ? 3 : -3);
});

// 窗口有焦点时的本地按键（不带 Alt）
window.addEventListener('keydown', (e) => {
  if (tocIsOpen()) return onTocKey(e);
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
$('btn-toc').addEventListener('click', () => NAV.toggleToc());
$('btn-settings').addEventListener('click', () => window.reader.openSettings());
$('btn-hide').addEventListener('click', () => window.reader.hide());

window.reader.ready();
