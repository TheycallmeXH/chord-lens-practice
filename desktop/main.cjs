const { app, BrowserWindow, session, ipcMain, dialog, Menu, screen, nativeTheme } = require('electron');
const themes = require('./themes.js');
const { join } = require('node:path');
const { writeFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const testMode = process.argv.includes('--practice-test');
if (testMode) app.setPath('userData', join(__dirname, '.test-profile'));
app.setName('和弦镜练琴版');
app.setAppUserModelId('cn.chordlens.practice');
const pageURL = pathToFileURL(join(__dirname, 'index.html')).href;
let window;
const ownsWindow = testMode || app.requestSingleInstanceLock();
if (!ownsWindow) app.quit();
app.on('second-instance', () => {
  if (window?.isMinimized()) window.restore();
  window?.show(); window?.focus();
});

if (ownsWindow) app.whenReady().then(() => {
  const trustedMidi = (contents, permission) => {
    // Chromium also routes sysex:false requests through the midiSysex permission.
    return contents === window?.webContents && contents.getURL().split('#')[0] === pageURL &&
      ['midi', 'midiSysex'].includes(permission);
  };
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(trustedMidi(contents, permission) && details.isMainFrame);
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => {
    return trustedMidi(contents, permission);
  });
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1480, height: 960, minWidth: 1120, minHeight: 740,
    title: '和弦镜 · 练琴', backgroundColor: '#242424', show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#414141', symbolColor: '#dededb', height: 42 },
    icon: join(__dirname, 'icons/app.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, backgroundThrottling: false
    }
  });
  window.once('ready-to-show', () => { if (!testMode) window.show(); });
  ipcMain.handle('practice:theme', (event, id) => {
    const theme = themes.find(id);
    if (event.sender !== window.webContents || !theme) return false;
    nativeTheme.themeSource = theme.light ? 'light' : 'dark';
    window.setBackgroundColor(theme.background);
    window.setTitleBarOverlay({color:theme.title,symbolColor:theme.symbol,height:42});
    return true;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== pageURL) event.preventDefault();
  });
  ipcMain.handle('practice:pin', async (event, value) => {
    if (event.sender !== window.webContents) return false;
    const wanted = Boolean(value);
    if (window.isAlwaysOnTop() === wanted) return wanted;
    for (let attempt = 0; attempt < 2; attempt++) {
      window.setAlwaysOnTop(wanted);
      for (let check = 0; check < 10; check++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        if (window.isDestroyed()) return false;
        if (window.isAlwaysOnTop() === wanted) return wanted;
      }
      // Windows may lose the topmost style while Electron retains its cached level.
      window.setAlwaysOnTop(false);
      await new Promise(resolve => setTimeout(resolve, 50));
      if (window.isDestroyed()) return false;
    }
    return window.isAlwaysOnTop();
  });
  let compact = false, fullBounds, fullMaximized = false, compactBounds;
  ipcMain.handle('practice:compact', (event, value) => {
    if (event.sender !== window.webContents || typeof value !== 'boolean') return compact;
    if (value === compact) return compact;
    if (value) {
      fullBounds = window.getNormalBounds(); fullMaximized = window.isMaximized();
      if (fullMaximized) window.unmaximize();
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      const bounds = compactBounds || { ...window.getBounds(), width:480, height:280 };
      window.setMinimumSize(380, 260);
      window.setBounds({
        width:Math.min(bounds.width, area.width), height:Math.min(bounds.height, area.height),
        x:Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
        y:Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))
      });
    } else {
      compactBounds = window.getNormalBounds();
      if (window.isMaximized()) window.unmaximize();
      window.setMinimumSize(1120, 740);
      window.setBounds(fullBounds);
      if (fullMaximized) window.maximize();
    }
    compact = value;
    return compact;
  });
  ipcMain.handle('practice:export', async (event, data) => {
    if (event.sender !== window.webContents || !data || !Array.isArray(data.sessions)) return false;
    const result = await dialog.showSaveDialog(window, {
      title: '导出练习记录', defaultPath: `和弦镜练习-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return false;
    await writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });
  window.loadFile(join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
