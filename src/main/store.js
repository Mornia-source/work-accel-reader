// 配置持久化：userData/config.json，加载时与默认值深合并，新增字段无需迁移
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  window: { x: undefined, y: undefined, width: 520, height: 300 },
  style: {
    bgColor: '#1e1e1e',
    bgOpacity: 0.6,
    textColor: '#d4d4d4',
    textOpacity: 1,
    fontSize: 16,
    fontFamily: 'Microsoft YaHei',
    lineHeight: 1.7,
  },
  alwaysOnTop: true,
  clickThrough: false,
  lastFile: null,
  // 每本书的进度：{ [文件路径]: { para, offset } }
  progress: {},
  shortcuts: {
    boss: 'Alt+Q',
    nextLine: 'Alt+Down',
    prevLine: 'Alt+Up',
    nextPage: 'Alt+PageDown',
    prevPage: 'Alt+PageUp',
    togglePin: 'Alt+T',
    toggleClickThrough: 'Alt+M',
    bgOpacityDown: 'Alt+1',
    bgOpacityUp: 'Alt+2',
    textOpacityDown: 'Alt+3',
    textOpacityUp: 'Alt+4',
    fontSmaller: 'Alt+-',
    fontLarger: 'Alt+=',
    openFile: 'Alt+O',
  },
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

const file = () => path.join(app.getPath('userData'), 'config.json');

let config = null;
let saveTimer = null;

function load() {
  try {
    config = deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(file(), 'utf8')));
  } catch {
    config = deepMerge(DEFAULTS, {});
  }
  return config;
}

function get() {
  return config || load();
}

// 进度/窗口位置变化频繁，合并写盘
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

function flush() {
  clearTimeout(saveTimer);
  if (!config) return;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(config, null, 2));
}

module.exports = { get, save, flush };
