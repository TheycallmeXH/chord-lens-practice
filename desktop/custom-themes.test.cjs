const assert=require('node:assert/strict');
const {chromium,_electron}=require('playwright');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const {mkdir}=require('node:fs/promises');
const themes=require('./themes.js');
const colors={bg:'#242424',panel:'#303030',ink:'#dddddd',accent:'#f3d35a',cyan:'#56c9cf',green:'#91ba73',red:'#e77d85',white:'#c7c7c1',black:'#292929'};
const valid={id:'custom-test',label:'Test',colors};
assert.ok(themes.normalize(valid));
for(const item of [null,{}, {...valid,id:'custom-";body{'},{...valid,colors:{...colors,accent:'red;}'}}]) assert.equal(themes.normalize(item),null);
themes.setCustom([valid,valid,{id:'oops'}]);
assert.equal(themes.find(valid.id).label,'Test');
themes.setCustom(Array.from({length:40},(_,i)=>({...valid,id:'custom-'+i})));
assert.equal(themes.find('custom-24'),null,'saved palette count is bounded');
const tokens=themes.resolve({...valid,colors:{...colors,ink:colors.panel}}).vars;
assert.ok(themes.contrast(tokens.ink,tokens.panel)>=4.5,'automatic readable text');
themes.setCustom([]);

(async()=>{
  let browser,app;
  try {
    const local=process.argv.includes('--local'),packaged=process.argv.includes('--packaged');
    let page;
    if(local || packaged) {
      app=await _electron.launch({executablePath:resolve(__dirname,local?'../../dist/和弦镜练琴版/和弦镜练琴版.exe':'../dist/和弦镜练琴版/和弦镜练琴版.exe'),args:['--practice-test','--practice-test-no-midi']});
      page=await app.firstWindow();
      await app.evaluate(({BrowserWindow})=>{
        const win=BrowserWindow.getAllWindows()[0],original=win.setTitleBarOverlay.bind(win);
        win.setTitleBarOverlay=value=>{win.testOverlay=value;original(value);};win.show();
      });
    } else {
      browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
      page=await browser.newPage({viewport:{width:1120,height:740}});
      await page.goto(pathToFileURL(resolve(__dirname,'index.html')).href);
    }
    await page.evaluate(()=>localStorage.clear());
    await page.reload();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(app) {
      assert.equal(await page.evaluate(()=>practiceDesktop.theme({id:'custom-bad',label:'bad',colors:{panel:'red;}'}})),false);
      assert.equal(await page.evaluate(async()=> (await fetch('piano://soundfont/other')).status),404);
    }
    const open=async()=>{
      await page.locator('#settingsButton').click();
      await page.locator('[data-settings-tab="display"]').click();
      await page.locator('#themeCustomTab').click();
    };
    await open();
    await page.locator('#customThemeName').fill('我的配色');
    await page.locator('#hex-accent').fill('#f3d35a');
    assert.match(await page.locator('html').getAttribute('data-theme'),/^custom-/);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent')),'#f3d35a');
    await page.locator('#hex-cyan').fill('#56c9cf');
    await page.locator('#hex-bg').fill('oops');
    assert.equal(await page.locator('#saveThemeButton').isDisabled(),true);
    await page.locator('#hex-bg').fill('#242424');
    await page.evaluate(()=>{
      window.originalStorageWrite=Storage.prototype.setItem;
      Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};
    });
    await page.locator('#saveThemeButton').click();
    assert.equal(await page.locator('#themeSaveState').textContent(),'未保存');
    assert.equal(await page.locator('#customThemeSelect option').count(),1,'failed save must not create a phantom palette');
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageWrite;});
    await page.locator('#saveThemeButton').click();
    const id=await page.locator('html').getAttribute('data-theme');
    assert.equal(await page.locator('#themeSaveState').textContent(),'已保存');
    assert.equal(await page.locator('#deleteThemeButton').isDisabled(),false);
    if(app) assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].testOverlay.symbolColor),await page.evaluate(()=>PracticeThemes.find(document.documentElement.dataset.theme).symbol));
    await page.locator('#settingsDialog [data-close]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),id);
    await open();
    await page.locator('#hex-accent').fill('#66dd99');
    await page.locator('#settingsDialog [data-close]').click();
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent')),'#f3d35a','closing restores saved palette');
    await open();
    await page.locator('#newThemeButton').click();
    await page.locator('#customThemeName').fill('第二套');
    await page.locator('#saveThemeButton').click();
    assert.notEqual(await page.locator('html').getAttribute('data-theme'),id);
    assert.equal(await page.locator('#customThemeSelect option').count(),3);
    await page.locator('#customThemeSelect').selectOption(id);
    await page.locator('#customThemeName').fill('已修改');
    await page.locator('#hex-accent').fill('#66dd99');
    await page.locator('#saveThemeButton').click();
    assert.equal(await page.locator('#customThemeSelect option').count(),3,'edit replaces rather than duplicates');
    const fits=await page.evaluate(()=>{
      const pane=document.querySelector('.preferences-content'),r=pane.getBoundingClientRect();
      return [...document.querySelectorAll('#customThemeEditor input,#customThemeEditor button')].every(el=>{
        const b=el.getBoundingClientRect();return b.left>=r.left && b.right<=r.right && b.top>=r.top && b.bottom<=r.bottom;
      });
    });
    assert.equal(fits,true,'entire editor fits without scrolling');
    await mkdir(resolve(__dirname,'test-results'),{recursive:true});
    await page.screenshot({path:resolve(__dirname,`test-results/custom-theme-${local?'local':'browser'}.png`),scale:'css'});
    await page.locator('#deleteThemeButton').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'live-dark');
    assert.equal(await page.locator('#customThemeSelect option').count(),2);
    await page.locator('#themePresetTab').click();
    await page.locator('[data-theme-value="live-light"]').click();
    assert.equal(await page.evaluate(()=>document.querySelector('#customThemeStyle').textContent),'');
    await page.locator('#settingsDialog [data-close]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'live-light');
    assert.deepEqual(errors,[]);
    console.log('Custom themes: live preview, hex validation, readability, save/edit/copy/delete, persistence, native chrome and editor fit passed.');
  } finally {await app?.close();await browser?.close();}
})().catch(error=>{console.error(error);process.exit(1);});
