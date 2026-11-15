const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('practiceDesktop', {
  platform: process.platform,
  about: () => ipcRenderer.invoke('practice:about'),
  license: id => ipcRenderer.invoke('practice:license',id),
  repository: () => ipcRenderer.invoke('practice:repository'),
  chromiumLicense: () => ipcRenderer.invoke('practice:chromium-license'),
  pin: value => ipcRenderer.invoke('practice:pin', value),
  compact: value => ipcRenderer.invoke('practice:compact', value),
  theme: value => ipcRenderer.invoke('practice:theme', value),
  soundfontInfo: () => ipcRenderer.invoke('practice:soundfont-info'),
  soundfontURL: () => ipcRenderer.invoke('practice:soundfont-url'),
  soundfontChoose: () => ipcRenderer.invoke('practice:soundfont-choose'),
  export: data => ipcRenderer.invoke('practice:export', data)
});
