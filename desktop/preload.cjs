const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('practiceDesktop', {
  platform: process.platform,
  pin: value => ipcRenderer.invoke('practice:pin', value),
  compact: value => ipcRenderer.invoke('practice:compact', value),
  theme: value => ipcRenderer.invoke('practice:theme', value),
  export: data => ipcRenderer.invoke('practice:export', data)
});
