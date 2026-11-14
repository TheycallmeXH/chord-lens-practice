const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const { mkdir } = require('node:fs/promises');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath:process.env.CHORD_LENS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true
  });
  try {
    await mkdir(join(__dirname,'test-results'),{ recursive:true });
    const context = await browser.newContext({ viewport:{ width:1480,height:960 } });
    await context.addInitScript(() => {
      const port = { id:'test',name:'Test MIDI',state:'connected',async open() { return this; } };
      Object.defineProperty(navigator,'requestMIDIAccess',{ value:async () => ({ inputs:new Map([['test',port]]) }) });
      window.sendMidi = data => port.onmidimessage?.({ data:new Uint8Array(data) });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('#targetNotes span');
    const snapshot = () => page.evaluate(() => ['.performance','.keyboard-section','#intervals','#piano','.session-bar']
      .map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector,r.y,r.height]; }));
    for (const [width,height] of [[1480,960],[1120,740],[1280,800],[1920,1080]]) {
      await page.setViewportSize({width,height});
      const baseline = await snapshot();
      for (const notes of [[60,64,67],Array.from({length:36},(_,i)=>48+i)]) {
        await page.locator('#clearButton').click();
        await page.evaluate(notes => notes.forEach(midi => window.sendMidi([144,midi,100])),notes);
        await page.waitForTimeout(300);
        assert.deepEqual(await snapshot(),baseline);
        const issues = await page.evaluate(() => {
          const errors = [];
          for (const selector of ['.performance','.keyboard-section','.session-bar','.sidebar','.inspector']) {
            const r = document.querySelector(selector).getBoundingClientRect();
            if (r.bottom > innerHeight+1 || r.right > innerWidth+1) errors.push(selector);
          }
          const labels = [...document.querySelectorAll('.interval-label')].map(el => el.getBoundingClientRect());
          labels.forEach((a,i) => labels.slice(i+1).forEach(b => {
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) errors.push('overlapping intervals');
          }));
          const ruler = document.querySelector('#intervals').getBoundingClientRect();
          if (labels.some(label => label.top < ruler.top || label.bottom > ruler.bottom)) errors.push('outside ruler');
          if (document.querySelector('.session-bar').scrollWidth > document.querySelector('.session-bar').clientWidth+1) errors.push('control overflow');
          return errors;
        });
        assert.deepEqual(issues,[],`${width}x${height}`);
        if (notes.length===3 && [1120,1480].includes(width)) {
          await page.screenshot({path:join(__dirname,`test-results/browser-${width}.png`)});
        }
      }
    }
    assert.deepEqual(errors,[]);
    console.log('Browser layout: four window sizes, dense intervals and fixed panel geometry passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
