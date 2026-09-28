const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  fonts: () => ipcRenderer.invoke('settings:fonts'),
  setStyle: (key, value) => ipcRenderer.send('settings:setStyle', key, value),
  setFlag: (key, value) => ipcRenderer.send('settings:setFlag', key, value),
  setShortcut: (name, accel) => ipcRenderer.invoke('settings:setShortcut', name, accel),
  suspendShortcuts: (on) => ipcRenderer.send('settings:suspendShortcuts', on),
  reset: (section) => ipcRenderer.send('settings:reset', section),
  onConfig: (fn) => ipcRenderer.on('settings:config', (_e, cfg) => fn(cfg)),
});
