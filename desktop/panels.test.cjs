const assert = require('node:assert/strict');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir } = require('node:fs/promises');

// Shared by the browser pass and the packaged native-window pass.
async function checkPanels(page, resize, label) {
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.waitForSelector('#modeHeading');
  await page.evaluate(() => localStorage.clear());
  await page.context().addInitScript(() => {
    const port = {id:'panels-test',name:'Panels Test MIDI',state:'connected',async open() {return this;}};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async () => ({inputs:new Map([[port.id,port]])})});
    window.sendMidi = data => port.onmidimessage?.({data:new Uint8Array(data)});
  });
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.fifths-key.minor');
  const settle = () => page.waitForTimeout(180);
  const setNotes = async notes => {
    await page.locator('#clearButton').click();
    await page.evaluate(notes => notes.forEach(midi => window.sendMidi([144,midi,100])),notes);
    await settle();
  };
  const geometry = () => page.evaluate(() => {
    const issues = [];
    for (const selector of ['.performance','.keyboard-section','.session-bar','.fifths-panel','.notes-panel','.attempt-panel','.next-panel']) {
      const el = document.querySelector(selector);
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.left < 0 || r.bottom > innerHeight+1 || r.right > innerWidth+1) issues.push(selector+' outside window');
    }
    for (const selector of ['.session-bar','.keyboard-heading','.fifths-legend','.titlebar']) {
      const el = document.querySelector(selector);
      if (el.checkVisibility() && el.scrollWidth > el.clientWidth+1) issues.push(selector+' content overflow');
    }
    const labels = [...document.querySelectorAll('.fifths-key')].filter(el => el.checkVisibility()).map(el => ({...el.getBoundingClientRect().toJSON(),name:el.textContent}));
    labels.forEach((a,i) => labels.slice(i+1).forEach(b => {
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) issues.push('fifths labels overlap '+a.name+' / '+b.name);
    }));
    for (const el of document.querySelectorAll('[data-collapse]')) {
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect(), parent = el.closest('[data-panel]').getBoundingClientRect();
      if (r.top < parent.top || r.bottom > parent.bottom+1) issues.push('inaccessible fold button');
    }
    return issues;
  });
  const snapshot = () => page.evaluate(() => ['.performance','.keyboard-section','.session-bar','.fifths-panel','.notes-panel','.attempt-panel','.next-panel']
    .map(selector => {const r=document.querySelector(selector).getBoundingClientRect();return [selector,r.x,r.y,r.width,r.height];}));
  const fold = async (name, collapsed) => {
    const button = page.locator(`[data-collapse="${name}"]`);
    if (await button.getAttribute('aria-expanded') === String(collapsed)) await button.click();
    assert.equal(await button.getAttribute('aria-expanded'),String(!collapsed));
    assert.equal(await page.locator(`[data-panel="${name}"]>[data-panel-body]`).first().isVisible(),!collapsed);
    await settle();
  };
  const roots = await page.locator('.fifths-key.major').evaluateAll(elements => elements.map(el => Number(el.dataset.pc)));
  assert.deepEqual(roots,[0,7,2,9,4,11,6,1,8,3,10,5]);
  assert.deepEqual(await page.locator('.fifths-key.minor').allTextContents(),['Am','Em','Bm','F♯m','C♯m','G♯m','D♯m','B♭m','Fm','Cm','Gm','Dm']);
  assert.equal(await page.locator('#fifthsPair').textContent(),'C / Am');
  await page.locator('.fifths-key.major[data-fifths-index="1"]').click();
  assert.equal(await page.locator('#fifthsPair').textContent(),'G / Em');
  assert.equal(await page.locator('#fifthsSignature').textContent(),'1 ♯');
  await page.locator('[data-mode="progression"]').click();
  await page.locator('#applyFifthsButton').click();
  assert.equal(await page.locator('#keySelect').inputValue(),'7');
  assert.equal(await page.locator('#targetSymbol').textContent(),'Am7');
  assert.equal(await page.locator('.fifths-key.target').getAttribute('data-pc'),'9');
  assert.equal(await page.locator('.fifths-key.target').getAttribute('data-fifths-ring'),'minor');
  await setNotes([60,64,67]);
  assert.equal(await page.locator('.fifths-key.current').getAttribute('data-pc'),'0');
  assert.equal(await page.locator('.fifths-key.current').getAttribute('data-fifths-ring'),'major');
  assert.equal(await page.locator('.fifths-tone.sounding').count(),3);
  await setNotes([57,60,64]);
  assert.equal(await page.locator('.fifths-key.current').getAttribute('data-pc'),'9');
  assert.equal(await page.locator('.fifths-key.current').getAttribute('data-fifths-ring'),'minor');
  await page.locator('#clearButton').click();
  assert.equal(await page.locator('.fifths-key.current').count(),0);
  await page.locator('#startButton').click();
  assert.equal(await page.locator('#applyFifthsButton').isDisabled(),true);
  await page.locator('.fifths-key.major[data-fifths-index="6"]').click();
  assert.equal(await page.locator('#targetSymbol').textContent(),'Am7','browsing fifths must not change a running exercise');
  assert.equal(await page.locator('#fifthsPair').textContent(),'F♯ / D♯m');
  await fold('target',true); await fold('notes',true);
  await setNotes([57,60,64,67]); await page.waitForTimeout(400);
  assert.equal(await page.locator('#completedText').textContent(),'1 / 12','folding does not stop MIDI or scoring');
  await page.locator('#clearButton').click();
  await page.locator('#stopButton').click();
  await page.locator('#resetLayoutButton').click();
  const names = await page.locator('[data-panel]').evaluateAll(elements => elements.map(el=>el.dataset.panel));
  for (const name of names) {await fold(name,true);await fold(name,false);}
  await page.locator('[data-collapse="fifths"]').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-collapse="fifths"]').getAttribute('aria-expanded'),'false');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-collapse="fifths"]').getAttribute('aria-expanded'),'true');

  await fold('fifths',true); await fold('attempts',true); await fold('config',true);
  await page.locator('#leftPanelButton').click();
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.sidebar').isVisible(),false);
  assert.equal(await page.locator('[data-collapse="fifths"]').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('[data-collapse="attempts"]').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#recordCount').textContent(),'1');
  await page.locator('#resetLayoutButton').click();
  assert.equal(await page.locator('.sidebar').isVisible(),true);
  assert.equal(await page.locator('[data-panel].collapsed').count(),0);
  assert.equal(await page.locator('#keySelect').inputValue(),'7','reset layout preserves practice configuration');
  await page.locator('[data-mode="free"]').click();
  assert.equal(await page.locator('[data-panel="target"]').isVisible(),false);
  assert.equal(await page.locator('.played-panel').evaluate(el => Math.abs(el.clientWidth - el.parentElement.clientWidth) < 1),true);

  for (const size of [[1480,960],[1120,740],[1280,800],[1920,1080]]) {
    await resize(size); await settle();
    const baseline = await snapshot();
    for (const values of [[60,64,67],Array.from({length:36},(_,i)=>48+i)]) {
      await setNotes(values);
      assert.deepEqual(await snapshot(),baseline,'MIDI must not resize panels');
      assert.deepEqual(await geometry(),[],label+' '+size);
    }
    await setNotes([60,64,67]);
    if ([1120,1480].includes(size[0])) await page.screenshot({path:join(__dirname,`test-results/${label}-fifths-${size[0]}.png`),scale:'css'});
    const before = await page.locator('.workspace').boundingBox();
    await page.locator('#leftPanelButton').click(); await page.locator('#rightPanelButton').click(); await settle();
    assert.equal(await page.locator('.inspector').isVisible(),false);
    assert.ok((await page.locator('.workspace').boundingBox()).width > before.width + 300);
    assert.deepEqual(await geometry(),[]);
    await page.locator('#resetLayoutButton').click();
    for (const name of ['played','sequence','keyboard','notes','attempts','next','daily','config']) await fold(name,true);
    assert.deepEqual(await geometry(),[],'only fifths expanded '+size);
    if (size[0]===1120) await page.screenshot({path:join(__dirname,`test-results/${label}-folded.png`),scale:'css'});
    await page.locator('#resetLayoutButton').click();
    assert.deepEqual(await geometry(),[]);
  }
  assert.deepEqual(errors,[]);
  console.log(label+': fifths mapping, MIDI roots, selection, all panel folds, keyboard access, persistence, layout reset and four sizes passed.');
}

module.exports = {checkPanels};
if (require.main === module) (async () => {
  const {chromium,_electron} = require('playwright');
  await mkdir(join(__dirname,'test-results'),{recursive:true});
  let browser, app;
  try {
    if (process.argv.includes('--packaged')) {
      app = await _electron.launch({executablePath:resolve(__dirname,'../dist/和弦镜练琴版/和弦镜练琴版.exe'),args:['--practice-test']});
      const page = await app.firstWindow();
      await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].show());
      await checkPanels(page, size => app.evaluate(({BrowserWindow},[width,height]) => BrowserWindow.getAllWindows()[0].setSize(width,height),size),'native');
    } else {
      browser = await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
      const page = await browser.newPage({viewport:{width:1480,height:960}});
      await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
      await checkPanels(page,([width,height])=>page.setViewportSize({width,height}),'browser');
    }
  } finally {if(app) await app.close();if(browser) await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
