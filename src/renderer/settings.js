const api = window.settings;
const $$ = (sel) => document.querySelectorAll(sel);

const SHORTCUT_LABELS = {
  boss: '老板键',
  nextLine: '下一行',
  prevLine: '上一行',
  nextPage: '下一页',
  prevPage: '上一页',
  togglePin: '置顶开关',
  toggleClickThrough: '鼠标穿透开关',
  bgOpacityDown: '背景不透明度 −',
  bgOpacityUp: '背景不透明度 +',
  textOpacityDown: '文字不透明度 −',
  textOpacityUp: '文字不透明度 +',
  fontSmaller: '字号 −',
  fontLarger: '字号 +',
  openFile: '打开文件',
  openSettings: '打开设置',
};

let config = null;

// ---------- 外观 ----------

function fmtVal(key, v) {
  if (key === 'fontSize') return v + 'px';
  if (key === 'lineHeight') return Number(v).toFixed(1);
  return Math.round(v * 100) + '%';
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function renderStyle() {
  const s = config.style;
  $$('[data-style]').forEach((el) => {
    if (document.activeElement !== el) el.value = s[el.dataset.style];
  });
  $$('[data-style-hex]').forEach((el) => {
    if (document.activeElement !== el) el.value = s[el.dataset.styleHex];
  });
  $$('[data-val]').forEach((el) => (el.textContent = fmtVal(el.dataset.val, s[el.dataset.val])));
  $$('[data-flag]').forEach((el) => (el.checked = config[el.dataset.flag]));

  const pv = document.getElementById('preview');
  pv.style.boxShadow = `inset 0 0 0 999px rgba(${hexToRgb(s.bgColor)}, ${s.bgOpacity})`;
  const span = pv.firstElementChild;
  span.style.color = `rgba(${hexToRgb(s.textColor)}, ${s.textOpacity})`;
  span.style.fontFamily = `'${s.fontFamily}', sans-serif`;
  span.style.fontSize = s.fontSize + 'px';
}

$$('[data-style]').forEach((el) => {
  const key = el.dataset.style;
  const evt = el.type === 'text' ? 'change' : 'input';
  el.addEventListener(evt, () => {
    const v = el.type === 'range' ? Number(el.value) : el.value.trim();
    if (!v && v !== 0) return;
    api.setStyle(key, v);
  });
});

$$('[data-style-hex]').forEach((el) => {
  el.addEventListener('change', () => {
    let v = el.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) api.setStyle(el.dataset.styleHex, v.toLowerCase());
    else el.value = config.style[el.dataset.styleHex];
  });
});

$$('[data-flag]').forEach((el) => {
  el.addEventListener('change', () => api.setFlag(el.dataset.flag, el.checked));
});

$$('[data-reset]').forEach((el) => {
  el.addEventListener('click', () => api.reset(el.dataset.reset));
});

// ---------- 快捷键录制 ----------

const CODE_MAP = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End',
  Insert: 'Insert', Delete: 'Delete', Space: 'Space', Enter: 'Enter', Tab: 'Tab',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
};

function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'num' + code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  return CODE_MAP[code] || null;
}

function buildTable() {
  const table = document.getElementById('shortcuts');
  for (const [name, label] of Object.entries(SHORTCUT_LABELS)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td><input type="text" class="key" readonly data-sc="${name}" /><div class="key-msg"></div></td><td><button class="link" data-clear="${name}">清除</button></td>`;
    table.appendChild(tr);
  }

  $$('[data-sc]').forEach((el) => {
    const name = el.dataset.sc;
    const msg = el.nextElementSibling;
    const showMsg = (text) => {
      msg.textContent = text || '';
      el.classList.toggle('error', !!text);
    };

    el.addEventListener('focus', () => {
      el.classList.add('recording');
      el.value = '请按下组合键…';
      showMsg('');
      api.suspendShortcuts(true); // 否则按下的组合键会直接触发现有功能
    });
    el.addEventListener('blur', () => {
      el.classList.remove('recording');
      el.value = config.shortcuts[name] || '';
      api.suspendShortcuts(false);
    });
    el.addEventListener('keydown', async (e) => {
      e.preventDefault();
      if (e.key === 'Escape') return el.blur();
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        await api.setShortcut(name, '');
        return el.blur();
      }
      const key = keyFromCode(e.code);
      if (!key) return; // 只按了修饰键，继续等
      const mods = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Super');
      if (!mods.length && !/^F\d+$/.test(key)) {
        showMsg('至少要带一个 Ctrl / Alt / Shift（F1–F12 除外）');
        return;
      }
      const accel = [...mods, key].join('+');
      const res = await api.setShortcut(name, accel);
      if (res.ok) {
        el.blur();
      } else {
        const who = res.conflict ? `（${SHORTCUT_LABELS[res.conflict]}）` : '';
        showMsg(`${accel}：${res.error}${who}`);
      }
    });
  });

  $$('[data-clear]').forEach((el) => {
    el.addEventListener('click', () => api.setShortcut(el.dataset.clear, ''));
  });
}

function renderShortcuts() {
  $$('[data-sc]').forEach((el) => {
    if (document.activeElement !== el) el.value = config.shortcuts[el.dataset.sc] || '';
  });
}

// ---------- 初始化 ----------

function render() {
  renderStyle();
  renderShortcuts();
}

api.onConfig((cfg) => {
  config = cfg;
  render();
});

(async () => {
  ({ config } = await api.get());
  buildTable();
  render();
  fillFonts(await api.fonts());
})();

// 当前字体不在系统列表里（比如手改了配置）也要能显示出来
function fillFonts(fonts) {
  const sel = document.getElementById('font');
  const cur = config.style.fontFamily;
  if (!fonts.includes(cur)) fonts.unshift(cur);
  for (const f of fonts) {
    const o = document.createElement('option');
    o.value = o.textContent = f;
    sel.appendChild(o);
  }
  sel.value = cur;
}
