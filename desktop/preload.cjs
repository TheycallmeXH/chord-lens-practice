const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('practiceDesktop', {
  platform: process.platform,
  pin: value => ipcRenderer.invoke('practice:pin', value),
  compact: value => ipcRenderer.invoke('practice:compact', value),
  theme: value => ipcRenderer.invoke('practice:theme', value),
  soundfontInfo: () => ipcRenderer.invoke('practice:soundfont-info'),
  soundfontLoad: () => ipcRenderer.invoke('practice:soundfont-load'),
  soundfontChoose: () => ipcRenderer.invoke('practice:soundfont-choose'),
  export: data => ipcRenderer.invoke('practice:export', data)
});
