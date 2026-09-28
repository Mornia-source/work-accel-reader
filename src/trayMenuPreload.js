const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayMenu', {
  onItems: (fn) => ipcRenderer.on('trayMenu:items', (_e, items) => fn(items)),
  select: (id) => ipcRenderer.send('trayMenu:select', id),
  close: () => ipcRenderer.send('trayMenu:close'),
});
