const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('reader', {
  ready: () => ipcRenderer.send('reader:ready'),
  saveProgress: (p) => ipcRenderer.send('reader:progress', p),
  openFile: () => ipcRenderer.send('reader:openFile'),
  hide: () => ipcRenderer.send('reader:hide'),
  dropFile: (file) => ipcRenderer.send('reader:dropFile', webUtils.getPathForFile(file)),
  on: (channel, fn) => {
    if (!['style', 'mode', 'book', 'nav', 'toast'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
