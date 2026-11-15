const { app, BrowserWindow, session, ipcMain, dialog, Menu, screen, nativeTheme, shell, protocol, net } = require('electron');
const {metadata,readLicense} = require('./about.cjs');
const themes = require('./themes.js');
const {createSoundfontStore} = require('./soundfont.cjs');
const { join, dirname } = require('node:path');
const { writeFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const testMode = process.argv.includes('--practice-test');
protocol.registerSchemesAsPrivileged([{scheme:'piano',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
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
    if(testMode && process.argv.includes('--practice-test-no-midi')) return false;
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
  ipcMain.handle('practice:about',event => event.sender===window.webContents ? metadata(app.getVersion()) : null);
  ipcMain.handle('practice:license',(event,id) => {
    if(event.sender!==window.webContents || typeof id!=='string') throw new Error('无效的许可请求');
    return readLicense(id,join(__dirname,'..'),dirname(process.execPath));
  });
  ipcMain.handle('practice:repository',event => {
    if(event.sender!==window.webContents) return false;
    return shell.openExternal(metadata(app.getVersion()).repository).then(()=>true);
  });
  ipcMain.handle('practice:chromium-license',event => {
    if(event.sender!==window.webContents) return false;
    return shell.openPath(join(dirname(process.execPath),'LICENSES.chromium.html'));
  });
  window.once('ready-to-show', () => { if (!testMode) window.show(); });
  const soundfont=createSoundfontStore(join(__dirname,'..'),app.getPath('userData'));
  protocol.handle('piano',async request=>{
    if(request.url!=='piano://soundfont/current' || request.method!=='GET') return new Response(null,{status:404});
    const response=await net.fetch(await soundfont.url());
    return new Response(response.body,{status:response.status,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  });
  ipcMain.handle('practice:soundfont-info',event=>{
    if(event.sender!==window.webContents) return null;
    return soundfont.info();
  });
  ipcMain.handle('practice:soundfont-url',event=>{
    if(event.sender!==window.webContents) throw new Error('无效的音色请求');
    return 'piano://soundfont/current';
  });
  ipcMain.handle('practice:soundfont-choose',async event=>{
    if(event.sender!==window.webContents) return null;
    const result=await dialog.showOpenDialog(window,{
      title:'选择钢琴音色',properties:['openFile'],filters:[{name:'SoundFont',extensions:['sf2']}]
    });
    if(result.canceled || !result.filePaths[0]) return null;
    return soundfont.choose(result.filePaths[0]);
  });
  ipcMain.handle('practice:theme', (event, id) => {
    const theme = typeof id==='string' ? themes.find(id) : themes.resolve(id);
    if (event.sender !== window.webContents || !theme) return false;
    nativeTheme.themeSource = theme.light ? 'light' : 'dark';
    window.setBackgroundColor(theme.background);
    window.setTitleBarOverlay({color:theme.title,symbolColor:theme.symbol,height:compact?32:42});
    return true;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== pageURL) event.preventDefault();
  });
  ipcMain.handle('practice:pin', async (event, value) => {
    if (event.sender !== window.webContents || typeof value !== 'boolean') return false;
    // Windows' default floating level reorders behind the taskbar and can sink
    // the window when the shell changes its own topmost state.
    window.setAlwaysOnTop(value, 'pop-up-menu');
    if (value && !window.isAlwaysOnTop()) {
      // Reset a stale native widget level without leaving the window behind.
      window.setAlwaysOnTop(false, 'pop-up-menu');
      window.moveTop();
      window.focus();
      window.setAlwaysOnTop(true, 'pop-up-menu');
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    if (window.isDestroyed()) return false;
    window.moveTop();
    window.focus();
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
      const bounds = compactBounds || { ...window.getBounds(), width:320, height:200 };
      window.setMinimumSize(280, 180);
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
    window.setTitleBarOverlay({height:compact?32:42});
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
