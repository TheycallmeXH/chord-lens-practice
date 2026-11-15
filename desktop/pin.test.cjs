const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {resolve} = require('node:path');
const {_electron} = require('playwright');
const packaged = process.argv.includes('--packaged'), local = process.argv.includes('--local');
const snapshot = () => JSON.parse(execFileSync('powershell.exe',
  ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(__dirname,'window-order.ps1')],
  {encoding:'utf8',windowsHide:true}));
(async () => {
  const app = await _electron.launch({
    executablePath:packaged || local ? resolve(__dirname,local ? '../../dist/和弦镜练琴版/和弦镜练琴版.exe' : '../dist/和弦镜练琴版/和弦镜练琴版.exe') : require('electron'),
    args:packaged || local ? ['--practice-test','--practice-test-no-midi'] : [__dirname,'--practice-test','--practice-test-no-midi']
  });
  try {
    const page = await app.firstWindow();
    const handles = await app.evaluate(({BrowserWindow}) => {
      const main = BrowserWindow.getAllWindows()[0];
      const readHandle = win => {
        const data = win.getNativeWindowHandle();
        return Number(data.length === 8 ? data.readBigUInt64LE() : data.readUInt32LE());
      };
      global.pinPeers = Array.from({length:2},(_,i) => new BrowserWindow({
        title:`Window order test ${i}`,width:260,height:180,x:0,y:400+i*40,show:false
      }));
      global.pinPeers.forEach(win => win.showInactive());
      const setTopmost = main.setAlwaysOnTop.bind(main);
      global.pinCalls = [];
      main.setAlwaysOnTop = (...args) => {
        if (global.pinDropNextEnable && args[0]) {
          global.pinDropNextEnable = false;
          global.pinCalls.push({wanted:true,level:args[1],actual:main.isAlwaysOnTop(),focused:main.isFocused()});
          return;
        }
        setTopmost(...args);
        if (global.pinSimulateOrderLoss && !args[0]) {
          global.pinPeers.forEach(win => win.moveTop());
          global.pinPeers[0].focus();
        }
        global.pinCalls.push({wanted:args[0],level:args[1],actual:main.isAlwaysOnTop(),focused:main.isFocused()});
      };
      main.show();main.focus();
      return [main,...global.pinPeers].map(readHandle);
    });
    await page.waitForSelector('#pinButton');
    for (const compact of [false,true]) {
      if (compact) await page.locator('#compactModeButton').click();
      for (let cycle = 0; cycle < 4; cycle++) {
        await app.evaluate(({BrowserWindow},cycle) => {
          global.pinSimulateOrderLoss = cycle === 2;
          global.pinDropNextEnable = cycle === 3;
          global.pinPeers.forEach(win => win.moveTop());
          const main = BrowserWindow.getAllWindows().find(win => !global.pinPeers.includes(win));
          main.moveTop();main.focus();
        },cycle);
        for (const wanted of [true,false]) {
          await page.locator('#pinButton').click();
          await page.waitForFunction(wanted => document.querySelector('#pinButton').getAttribute('aria-pressed') === String(wanted),wanted);
          assert.equal(await app.evaluate(() => global.pinCalls.at(-1).level),'pop-up-menu','avoid taskbar-relative floating levels on Windows');
          assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(win=>!global.pinPeers.includes(win)).isFocused()),true,'switch restores app focus');
          const actual = snapshot(), index = actual.windows.findIndex(win => win.handle === handles[0]);
          assert.ok(index >= 0,'main window remains visible');
          assert.equal(actual.windows[index].topmost,wanted,'native topmost style agrees with button');
          for (const peer of handles.slice(1)) {
            assert.ok(index < actual.windows.findIndex(win => win.handle === peer),
              `pin=${wanted}, compact=${compact}, cycle=${cycle}: app must stay above normal windows; ${JSON.stringify({main:index,peer:actual.windows.findIndex(win => win.handle === peer)})}`);
          }
          assert.ok(!handles.slice(1).includes(actual.foreground),`pin=${wanted}, compact=${compact}, cycle=${cycle}: focus must not remain on a competing window`);
        }
      }
    }
    console.log('Pin passed: native window order and foreground retained across 16 toggles, including order loss and stale native levels, in full and compact modes.');
  } catch (error) {
    console.error(await app.evaluate(({BrowserWindow}) => ({
      calls:global.pinCalls,
      windows:BrowserWindow.getAllWindows().map(win=>({title:win.getTitle(),top:win.isAlwaysOnTop(),focused:win.isFocused()}))
    })));
    throw error;
  } finally {await app.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
