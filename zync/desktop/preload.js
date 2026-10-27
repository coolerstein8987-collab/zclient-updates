const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zyncDesktop', {
  platform: process.platform,
  onPickSource: (cb) => {
    const fn = (_e, list) => cb(list);
    ipcRenderer.on('zync:pick-source', fn);
    return () => ipcRenderer.removeListener('zync:pick-source', fn);
  },
  pickSource: (id) => ipcRenderer.send('zync:source-picked', id),
  onShortcut: (cb) => {
    const fn = (_e, name) => cb(name);
    ipcRenderer.on('zync:shortcut', fn);
    return () => ipcRenderer.removeListener('zync:shortcut', fn);
  },
  setBadge: (n) => ipcRenderer.send('zync:badge', n),
  setIconPng: (dataUrl) => ipcRenderer.send('zync:icon', dataUrl),
  setServer: (url) => ipcRenderer.invoke('zync:set-server', url),
  getServer: () => ipcRenderer.invoke('zync:get-server'),
});
