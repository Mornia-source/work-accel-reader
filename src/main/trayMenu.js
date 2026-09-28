// 自绘托盘右键菜单：无边框小窗口代替系统原生菜单（原生菜单样式无法定制）
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

const WIDTH = 232;
const ITEM_H = 28;
const SEP_H = 9;
const PAD = 4; // 上下内边距
const BORDER = 1;

function createTrayMenu({ getItems, onSelect }) {
  let menuWin = null;
  let shownAt = 0;

  function ensureWindow() {
    if (menuWin && !menuWin.isDestroyed()) return menuWin;
    menuWin = new BrowserWindow({
      width: WIDTH,
      height: 100,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#2b2b2b',
      webPreferences: {
        preload: path.join(__dirname, '..', 'trayMenuPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    menuWin.setAlwaysOnTop(true, 'pop-up-menu');
    menuWin.loadFile(path.join(__dirname, '..', 'renderer', 'trayMenu.html'));
    // 点到菜单外面就收起
    menuWin.on('blur', () => {
      if (Date.now() - shownAt > 150) hide();
    });
    return menuWin;
  }

  function measure(items) {
    const inner = items.reduce((h, it) => h + (it.sep ? SEP_H : ITEM_H), 0);
    return inner + PAD * 2 + BORDER * 2;
  }

  async function show() {
    const w = ensureWindow();
    const items = getItems();
    const height = measure(items);
    const cursor = screen.getCursorScreenPoint();
    const wa = screen.getDisplayNearestPoint(cursor).workArea;
    // 默认出现在光标左上方（任务栏在底部时的习惯位置），放不下就翻到另一侧
    let x = cursor.x - WIDTH;
    let y = cursor.y - height;
    if (x < wa.x) x = cursor.x;
    if (y < wa.y) y = cursor.y;
    x = Math.min(Math.max(x, wa.x), wa.x + wa.width - WIDTH);
    y = Math.min(Math.max(y, wa.y), wa.y + wa.height - height);

    if (w.webContents.isLoading()) await new Promise((r) => w.webContents.once('did-finish-load', r));
    w.webContents.send('trayMenu:items', items);
    w.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height });
    shownAt = Date.now();
    w.show();
    w.focus();
  }

  function hide() {
    if (menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) menuWin.hide();
  }

  function refresh() {
    if (menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) {
      menuWin.webContents.send('trayMenu:items', getItems());
    }
  }

  ipcMain.on('trayMenu:select', (_e, id) => {
    hide();
    onSelect(id);
  });
  ipcMain.on('trayMenu:close', hide);

  return { show, hide, refresh, destroy: () => menuWin && !menuWin.isDestroyed() && menuWin.destroy() };
}

module.exports = { createTrayMenu };
