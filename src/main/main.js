const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog } = require('electron');
const path = require('path');
const store = require('./store');
const textLoader = require('./textLoader');
const { createTrayIcon } = require('./trayIcon');

let win = null;
let tray = null;
let bossHidden = false;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- 窗口 ----------

function createWindow() {
  const cfg = store.get();
  win = new BrowserWindow({
    ...cfg.window,
    minWidth: 160,
    minHeight: 60,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  applyAlwaysOnTop();
  applyClickThrough();

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    store.get().window = win.getBounds();
    store.save();
  };
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
}

function applyAlwaysOnTop() {
  win.setAlwaysOnTop(store.get().alwaysOnTop, 'screen-saver');
}

function applyClickThrough() {
  const on = store.get().clickThrough;
  win.setIgnoreMouseEvents(on, { forward: true });
  send('mode', { clickThrough: on, alwaysOnTop: store.get().alwaysOnTop });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function toast(text) {
  send('toast', text);
}

// ---------- 托盘 ----------

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('阅读器');
  tray.on('click', () => {
    if (win.isVisible()) win.focus();
    else win.show();
  });
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const cfg = store.get();
  const sc = cfg.shortcuts;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开文件…', accelerator: sc.openFile, click: openFileDialog },
      { type: 'separator' },
      { label: '始终置顶', type: 'checkbox', checked: cfg.alwaysOnTop, accelerator: sc.togglePin, click: togglePin },
      { label: '鼠标穿透', type: 'checkbox', checked: cfg.clickThrough, accelerator: sc.toggleClickThrough, click: toggleClickThrough },
      { label: '老板键隐藏', accelerator: sc.boss, click: toggleBoss },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  );
}

// ---------- 动作 ----------

function togglePin() {
  const cfg = store.get();
  cfg.alwaysOnTop = !cfg.alwaysOnTop;
  store.save();
  applyAlwaysOnTop();
  refreshTrayMenu();
  toast(cfg.alwaysOnTop ? '置顶：开' : '置顶：关');
}

function toggleClickThrough() {
  const cfg = store.get();
  cfg.clickThrough = !cfg.clickThrough;
  store.save();
  applyClickThrough();
  refreshTrayMenu();
  toast(cfg.clickThrough ? '鼠标穿透：开' : '鼠标穿透：关');
}

// 老板键：隐藏窗口 + 销毁托盘图标 + 注销除老板键外的全部快捷键
function toggleBoss() {
  bossHidden = !bossHidden;
  if (bossHidden) {
    win.hide();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    registerShortcuts();
  } else {
    win.showInactive(); // 不抢焦点，避免打断当前输入
    createTray();
    registerShortcuts();
  }
}

function adjustStyle(key, delta, lo, hi, label, fmt) {
  const style = store.get().style;
  style[key] = round2(clamp(style[key] + delta, lo, hi));
  store.save();
  send('style', style);
  toast(`${label}：${fmt(style[key])}`);
}

const pct = (v) => Math.round(v * 100) + '%';

const ACTIONS = {
  boss: toggleBoss,
  nextLine: () => send('nav', 'nextLine'),
  prevLine: () => send('nav', 'prevLine'),
  nextPage: () => send('nav', 'nextPage'),
  prevPage: () => send('nav', 'prevPage'),
  togglePin,
  toggleClickThrough,
  bgOpacityDown: () => adjustStyle('bgOpacity', -0.05, 0, 1, '背景不透明度', pct),
  bgOpacityUp: () => adjustStyle('bgOpacity', 0.05, 0, 1, '背景不透明度', pct),
  textOpacityDown: () => adjustStyle('textOpacity', -0.05, 0.05, 1, '文字不透明度', pct),
  textOpacityUp: () => adjustStyle('textOpacity', 0.05, 0.05, 1, '文字不透明度', pct),
  fontSmaller: () => adjustStyle('fontSize', -1, 8, 72, '字号', (v) => v + 'px'),
  fontLarger: () => adjustStyle('fontSize', 1, 8, 72, '字号', (v) => v + 'px'),
  openFile: openFileDialog,
};

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const [name, accel] of Object.entries(store.get().shortcuts)) {
    if (!accel || !ACTIONS[name]) continue;
    if (bossHidden && name !== 'boss') continue;
    try {
      if (!globalShortcut.register(accel, ACTIONS[name])) failed.push(accel);
    } catch {
      failed.push(accel);
    }
  }
  if (failed.length) toast('快捷键被占用：' + failed.join('、'));
}

// ---------- 文件 ----------

async function openFileDialog() {
  if (bossHidden) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '打开小说',
    properties: ['openFile'],
    filters: [{ name: '小说', extensions: textLoader.SUPPORTED_EXTS }],
  });
  if (!canceled && filePaths[0]) openBook(filePaths[0]);
}

function openBook(filePath) {
  let paras;
  try {
    paras = textLoader.load(filePath);
  } catch (e) {
    toast('打开失败：' + e.message);
    return;
  }
  if (!paras.length) {
    toast('文件是空的');
    return;
  }
  const cfg = store.get();
  cfg.lastFile = filePath;
  store.save();
  send('book', {
    path: filePath,
    title: path.basename(filePath, path.extname(filePath)),
    paras,
    progress: cfg.progress[filePath] || { para: 0, offset: 0 },
  });
}

// ---------- IPC ----------

ipcMain.on('reader:ready', () => {
  const cfg = store.get();
  send('style', cfg.style);
  send('mode', { clickThrough: cfg.clickThrough, alwaysOnTop: cfg.alwaysOnTop });
  if (cfg.lastFile) openBook(cfg.lastFile);
});

ipcMain.on('reader:progress', (_e, { path: p, para, offset }) => {
  store.get().progress[p] = { para, offset };
  store.save();
});

ipcMain.on('reader:openFile', openFileDialog);
ipcMain.on('reader:dropFile', (_e, p) => openBook(p));
ipcMain.on('reader:hide', () => win.hide());

// ---------- 生命周期 ----------

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();
});

app.on('second-instance', () => {
  if (bossHidden) return;
  win.show();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  store.flush();
});

app.on('window-all-closed', () => app.quit());
