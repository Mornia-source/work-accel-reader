const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const store = require('./store');
const textLoader = require('./textLoader');
const { createTrayIcon } = require('./trayIcon');

let win = null;
let settingsWin = null;
let tray = null;
let bossHidden = false;
let shortcutsSuspended = false; // 设置窗口录制快捷键时暂停全局快捷键
let settingsWasOpen = false; // 老板键隐藏前设置窗口是否开着

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;

if (!app.requestSingleInstanceLock()) app.quit();

// 命令行里传入的小说文件（启动测试.bat 用）
function fileFromArgv(argv) {
  return argv
    .slice(1)
    .find(
      (a) =>
        !a.startsWith('-') &&
        textLoader.SUPPORTED_EXTS.includes(path.extname(a).slice(1).toLowerCase()) &&
        fs.existsSync(a)
    );
}

// ---------- 阅读窗口 ----------

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

// 任何配置变化后统一刷新：阅读窗口、托盘菜单、设置窗口
function configChanged() {
  store.save();
  const cfg = store.get();
  send('style', cfg.style);
  applyAlwaysOnTop();
  applyClickThrough();
  refreshTrayMenu();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings:config', cfg);
}

// ---------- 设置窗口 ----------

function openSettings() {
  if (bossHidden) return;
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 420,
    minHeight: 400,
    title: '阅读器设置',
    backgroundColor: '#f3f3f3',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'settingsPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenu(null);
  // 阅读窗口是 screen-saver 级置顶，设置窗口同级才不会被压在下面
  settingsWin.setAlwaysOnTop(true, 'screen-saver');
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => {
    settingsWin = null;
    if (shortcutsSuspended) {
      shortcutsSuspended = false;
      registerShortcuts();
    }
  });
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
      { label: '打开文件…', accelerator: sc.openFile || undefined, click: openFileDialog },
      { label: '设置…', accelerator: sc.openSettings || undefined, click: openSettings },
      { type: 'separator' },
      { label: '始终置顶', type: 'checkbox', checked: cfg.alwaysOnTop, accelerator: sc.togglePin || undefined, click: togglePin },
      { label: '鼠标穿透', type: 'checkbox', checked: cfg.clickThrough, accelerator: sc.toggleClickThrough || undefined, click: toggleClickThrough },
      { label: '老板键隐藏', accelerator: sc.boss || undefined, click: toggleBoss },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  );
}

// ---------- 动作 ----------

function togglePin() {
  const cfg = store.get();
  cfg.alwaysOnTop = !cfg.alwaysOnTop;
  configChanged();
  toast(cfg.alwaysOnTop ? '置顶：开' : '置顶：关');
}

function toggleClickThrough() {
  const cfg = store.get();
  cfg.clickThrough = !cfg.clickThrough;
  configChanged();
  toast(cfg.clickThrough ? '鼠标穿透：开' : '鼠标穿透：关');
}

// 老板键：隐藏所有窗口 + 销毁托盘图标 + 只保留老板键
function toggleBoss() {
  bossHidden = !bossHidden;
  if (bossHidden) {
    win.hide();
    settingsWasOpen = !!(settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible());
    if (settingsWasOpen) settingsWin.hide();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  } else {
    win.showInactive(); // 不抢焦点，避免打断当前输入
    if (settingsWasOpen && settingsWin && !settingsWin.isDestroyed()) settingsWin.showInactive();
    createTray();
  }
  registerShortcuts();
}

function adjustStyle(key, delta, lo, hi, label, fmt) {
  const style = store.get().style;
  style[key] = round2(clamp(style[key] + delta, lo, hi));
  configChanged();
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
  openSettings,
};

// 返回注册失败的快捷键名列表
function registerShortcuts() {
  globalShortcut.unregisterAll();
  const failed = [];
  if (shortcutsSuspended) return failed;
  for (const [name, accel] of Object.entries(store.get().shortcuts)) {
    if (!accel || !ACTIONS[name]) continue;
    if (bossHidden && name !== 'boss') continue;
    try {
      if (!globalShortcut.register(accel, ACTIONS[name])) failed.push(name);
    } catch {
      failed.push(name);
    }
  }
  if (failed.length && !bossHidden) {
    const sc = store.get().shortcuts;
    toast('快捷键被占用：' + failed.map((n) => sc[n]).join('、'));
  }
  return failed;
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

// 系统字体列表：PowerShell 脚本源码保持纯 ASCII，输出强制 UTF-8，避免中文字体名乱码
let fontCache = null;
function listFonts() {
  if (fontCache) return fontCache;
  const script =
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
    'Add-Type -AssemblyName System.Drawing;' +
    '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }';
  fontCache = new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }, (err, out) => {
      if (err) {
        fontCache = null;
        return resolve([]);
      }
      resolve(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    });
  });
  return fontCache;
}

// ---------- IPC：阅读窗口 ----------

let startupFile = fileFromArgv(process.argv);

ipcMain.on('reader:ready', () => {
  const cfg = store.get();
  send('style', cfg.style);
  send('mode', { clickThrough: cfg.clickThrough, alwaysOnTop: cfg.alwaysOnTop });
  const file = startupFile || cfg.lastFile;
  startupFile = null;
  if (file) openBook(file);
});

ipcMain.on('reader:progress', (_e, { path: p, para, offset }) => {
  store.get().progress[p] = { para, offset };
  store.save();
});

ipcMain.on('reader:openFile', openFileDialog);
ipcMain.on('reader:openSettings', openSettings);
ipcMain.on('reader:dropFile', (_e, p) => openBook(p));
ipcMain.on('reader:hide', () => win.hide());

// ---------- IPC：设置窗口 ----------

const STYLE_LIMITS = {
  bgOpacity: [0, 1],
  textOpacity: [0.05, 1],
  fontSize: [8, 72],
  lineHeight: [1, 3],
};

ipcMain.handle('settings:get', () => ({ config: store.get(), defaults: store.defaults() }));
ipcMain.handle('settings:fonts', () => listFonts());

ipcMain.on('settings:setStyle', (_e, key, value) => {
  const style = store.get().style;
  if (!(key in style)) return;
  if (STYLE_LIMITS[key]) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    value = clamp(n, ...STYLE_LIMITS[key]);
  }
  style[key] = value;
  configChanged();
});

ipcMain.on('settings:setFlag', (_e, key, value) => {
  if (key !== 'alwaysOnTop' && key !== 'clickThrough') return;
  store.get()[key] = !!value;
  configChanged();
});

// 设置快捷键：查重 + 试注册，失败则回滚
ipcMain.handle('settings:setShortcut', (_e, name, accel) => {
  const sc = store.get().shortcuts;
  if (!(name in sc)) return { ok: false, error: '未知动作' };
  if (accel) {
    const dup = Object.entries(sc).find(([n, a]) => n !== name && a && a.toLowerCase() === accel.toLowerCase());
    if (dup) return { ok: false, error: '与已有快捷键重复', conflict: dup[0] };
  }
  const old = sc[name];
  sc[name] = accel;
  const wasSuspended = shortcutsSuspended;
  shortcutsSuspended = false;
  const failed = registerShortcuts();
  if (failed.includes(name)) {
    sc[name] = old;
    registerShortcuts();
    shortcutsSuspended = wasSuspended;
    if (wasSuspended) globalShortcut.unregisterAll();
    return { ok: false, error: '被其他程序占用或格式无效' };
  }
  shortcutsSuspended = wasSuspended;
  if (wasSuspended) globalShortcut.unregisterAll();
  configChanged();
  return { ok: true };
});

ipcMain.on('settings:suspendShortcuts', (_e, on) => {
  shortcutsSuspended = !!on;
  registerShortcuts();
});

ipcMain.on('settings:reset', (_e, section) => {
  const cfg = store.get();
  const def = store.defaults();
  if (section === 'style') cfg.style = def.style;
  if (section === 'shortcuts') {
    cfg.shortcuts = def.shortcuts;
    registerShortcuts();
  }
  configChanged();
});

// ---------- 生命周期 ----------

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();
});

app.on('second-instance', (_e, argv) => {
  if (bossHidden) return;
  win.show();
  const file = fileFromArgv(argv);
  if (file) openBook(file);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  store.flush();
});

app.on('window-all-closed', () => app.quit());
