const assert = require('node:assert/strict');
const {chromium,_electron} = require('playwright');
const {join,resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {mkdir} = require('node:fs/promises');

// Coverage: five difficulty levels, category and quality selection, voicing,
// delayed hints, register, pause/retry/advance, settings tabs, skins, minimum size,
// persistence, free mode, silence and a complete keyboard-driven answer.
(async () => {
  const local = process.argv.includes('--local'), output = join(__dirname,'test-results');
  await mkdir(output,{recursive:true});
  let browser,app;
  try {
    let page,resize;
    if (local) {
      app = await _electron.launch({executablePath:resolve(__dirname,'../../dist/和弦镜练琴版/和弦镜练琴版.exe'),args:['--practice-test']});
      page = await app.firstWindow();
      await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].show());
      resize = size => app.evaluate(({BrowserWindow},[w,h]) => BrowserWindow.getAllWindows()[0].setSize(w,h),size);
    } else {
      browser = await chromium.launch({headless:true,executablePath:process.env.CHORD_LENS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
      page = await browser.newPage({viewport:{width:1480,height:960}});
      await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
      resize = ([width,height]) => page.setViewportSize({width,height});
    }
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.waitForSelector('#levelSelect');
    await page.evaluate(() => localStorage.clear());
    await page.context().addInitScript(() => {
      const port = {id:'practice-test',name:'Practice MIDI',state:'connected',async open(){return this;}};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[port.id,port]])})});
      window.sendMidi = data => port.onmidimessage?.({data:new Uint8Array(data)});
      window.audioStarts = 0;
      const Audio = window.AudioContext;
      window.AudioContext = class extends Audio { constructor(...args) {super(...args);window.audioStarts++;} };
    });
    await page.reload(); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#monitorToggle').isChecked(),true);
    assert.equal(await page.locator('#levelSelect').inputValue(),'1');
    assert.equal(await page.locator('#targetNotes').textContent(),'');
    assert.equal(await page.locator('.piano-key.target').count(),0);
    let previous = 0;
    for (let level = 1; level <= 5; level++) {
      await page.locator('#levelSelect').selectOption(String(level));
      const count = await page.locator('#qualitySelect option').count();
      assert.ok(count > previous);previous = count;
    }
    assert.equal(previous,33);
    await page.locator('#planSelect').selectOption('alteredDominant');
    await page.locator('#qualitySelect').selectOption('sharp9');
    assert.equal(await page.locator('#targetSymbol').textContent(),'C7♯9');
    await page.locator('#settingsButton').click();
    assert.equal(await page.locator('#tab-practice').getAttribute('aria-selected'),'true');
    await page.locator('#voicingSelect').selectOption('mixed');
    await page.locator('#hintOctaveSelect').selectOption('4');
    await page.locator('#hintDelayInput').fill('1');
    await page.locator('#hintDelayInput').dispatchEvent('change');
    const baselineDialog = await page.locator('#settingsDialog').boundingBox();
    for (const id of ['display','audio','midi','practice']) {
      await page.locator(`[data-settings-tab="${id}"]`).click();
      assert.deepEqual(await page.locator('#settingsDialog').boundingBox(),baselineDialog,'tab switching keeps geometry');
      await page.screenshot({path:join(output,`practice-${local?'native':'browser'}-settings-${id}.png`),scale:'css'});
    }
    await page.locator('#tab-practice').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#tab-display').getAttribute('aria-selected'),'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#tab-about').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');
    await page.locator('#voicingSelect').selectOption('root');
    await page.locator('#settingsDialog [data-close]').click();
    await page.locator('#levelSelect').selectOption('1');
    await page.locator('#planSelect').selectOption('triads');
    await page.locator('#qualitySelect').selectOption('major');
    const geometry = () => page.evaluate(() => ['.performance','.keyboard-section','.session-bar'].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];
    }));
    const initial = await geometry();
    await page.locator('#startButton').click();
    assert.equal(await page.locator('#levelSelect').isDisabled(),true);
    await page.waitForTimeout(350);
    await page.keyboard.down('a');
    await page.waitForTimeout(80);
    assert.equal(await page.locator('#feedbackText').textContent(),'','no missing-note answer before hint');
    await page.keyboard.up('a');
    assert.equal(await page.locator('#targetNotes').textContent(),'');
    await page.locator('#startButton').click();
    await page.waitForTimeout(1150);
    assert.equal(await page.locator('.piano-key.target').count(),0,'pause excludes wall time');
    await page.locator('#startButton').click();
    await page.waitForSelector('.piano-key.target');
    assert.deepEqual(await page.locator('.piano-key.target').evaluateAll(keys => keys.map(key => Number(key.dataset.midi)).sort((a,b)=>a-b)),[60,64,67]);
    assert.deepEqual(await page.locator('#targetNotes span').allTextContents(),['C4','E4','G4']);
    assert.deepEqual(await geometry(),initial,'hint visibility keeps panel sizes');
    await page.screenshot({path:join(output,`practice-${local?'native':'browser'}-delayed-hint.png`),scale:'css'});
    await page.locator('#hintsToggle').uncheck();
    assert.equal(await page.locator('.piano-key.target').count(),0);
    await page.locator('#hintsToggle').check();
    await page.waitForSelector('.piano-key.target');
    await page.locator('#targetSymbol').click();
    await page.keyboard.down('a');await page.keyboard.down('d');await page.keyboard.down('g');
    await page.waitForFunction(() => document.querySelector('#completedText').textContent === '1 / 12');
    await page.keyboard.up('a');await page.keyboard.up('d');await page.keyboard.up('g');
    await page.waitForFunction(() => document.querySelector('#targetIndex').textContent === '2 / 12');
    assert.equal(await page.locator('.piano-key.target').count(),0,'next target resets delay');
    await page.locator('#stopButton').click();
    await page.locator('#settingsButton').click();
    await page.locator('#tab-practice').click();
    await page.locator('#hintDelayInput').fill('0');await page.locator('#hintDelayInput').dispatchEvent('change');
    await page.locator('#hintOctaveSelect').selectOption('5');
    await page.locator('#settingsDialog [data-close]').click();
    await page.locator('#octaveDown').click();await page.locator('#octaveDown').click();
    await page.locator('#startButton').click();
    await page.waitForSelector('.piano-key.target');
    assert.deepEqual(await page.locator('.piano-key.target').evaluateAll(keys => keys.map(key => Number(key.dataset.midi)).sort((a,b)=>a-b)),[72,76,79]);
    assert.match(await page.locator('#keyRange').textContent(),/C5/,'offscreen hints reveal their register');
    await page.locator('#stopButton').click();
    await page.reload();
    await page.locator('#settingsButton').click();
    await page.locator('#tab-practice').click();
    assert.equal(await page.locator('#hintOctaveSelect').inputValue(),'5');
    assert.equal(await page.locator('#hintDelayInput').inputValue(),'0');
    for (const size of [[1480,960],[1120,740]]) {
      await resize(size);
      for (const id of ['practice','display','audio','midi']) {
        await page.locator(`[data-settings-tab="${id}"]`).click();
        const overflow = await page.locator('#settingsDialog').evaluate(dialog => {
          const r = dialog.getBoundingClientRect();
          return r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight ||
            [...dialog.querySelectorAll('select,input,.theme-option,.preferences-nav button')].filter(el=>el.checkVisibility()).some(el=>{
              const b=el.getBoundingClientRect();return b.left<r.left||b.right>r.right||b.bottom>r.bottom;
            });
        });
        assert.equal(overflow,false,`${id} fits ${size}`);
      }
    }
    await page.locator('#settingsDialog [data-close]').click();
    await page.locator('[data-mode="free"]').click();
    await page.locator('#settingsButton').click();
    assert.equal(await page.locator('#tab-practice').isVisible(),false);
    assert.equal(await page.locator('#holdInput').isVisible(),false);
    await page.locator('#tab-midi').click();
    await page.locator('#channelSelect').selectOption('1');
    await page.locator('#channelSelect').selectOption('all');
    await page.locator('#settingsDialog [data-close]').click();
    assert.equal(await page.evaluate(() => audioStarts),1);
    assert.deepEqual(errors,[]);
    console.log('Practice UI passed: five levels, 32 qualities, category filter, tabs/keyboard, delayed register-specific hints, pause/retry/advance, persistence, minimum size, free mode and silence.');
  } finally {if(app)await app.close();if(browser)await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
