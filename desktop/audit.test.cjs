const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {join} = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHORD_LENS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  try {
    const context = await browser.newContext({viewport:{width:1480,height:960}});
    await context.addInitScript(() => {
      const key = 'chord-lens-practice-v1';
      if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify({
        sessions:[null,{},'bad',{startedAt:'invalid',durationMs:0}],config:{mode:'free'},layout:null
      }));
      window.audioStarts = 0;
      const Audio = window.AudioContext;
      window.AudioContext = class extends Audio { constructor(...args) { super(...args); window.audioStarts++; } };
      const port = {id:'audit',name:'Audit MIDI',state:'connected',async open(){return this;}};
      const access = {inputs:new Map([[port.id,port]])};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access});
      window.midiAccess = access;
      window.sendMidi = data => access.inputs.get('audit')?.onmidimessage?.({data:new Uint8Array(data)});
      window.replacePort = (kind) => {
        const port = {id:'audit',name:kind,state:'connected',open() {
          if (kind === 'throw') throw new Error('Synchronous open failure');
          if (kind === 'pending') return new Promise((_,reject) => { window.rejectOldPort = reject; });
          return Promise.resolve(this);
        }};
        access.inputs.set('audit',port); access.onstatechange();
      };
      window.countAnalysis = () => {
        window.analysisCalls = 0;
        const create = ChordLens.createRecognizer;
        ChordLens.createRecognizer = (...args) => {
          const recognizer = create(...args), analyze = recognizer.analyze;
          recognizer.analyze = (...args) => { window.analysisCalls++; return analyze(...args); };
          return recognizer;
        };
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error => errors.push(error.message));
    // Instrument the engine before the renderer obtains its recognizer.
    await page.route('**/engine.js',async route => {
      const fs = require('node:fs/promises');
      const source = await fs.readFile(join(__dirname,'../midi-chords/engine.js'),'utf8');
      await route.fulfill({contentType:'application/javascript',body:source+'\nwindow.countAnalysis();'});
    });
    await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    assert.deepEqual(errors,[],'malformed history must not prevent startup');
    assert.equal(await page.locator('#recordCount').textContent(),'0');
    assert.equal(await page.locator('.target-panel').isVisible(),false);
    const geometry = () => page.locator('.performance').boundingBox();
    const before = await geometry();
    await page.locator('[data-mode="chords"]').click();
    assert.equal(await page.locator('.target-panel').isVisible(),true);
    await page.locator('[data-mode="free"]').click();
    assert.deepEqual(await geometry(),before,'mode changes keep the performance panel height');
    await page.evaluate(() => [60,64,67].forEach(midi=>sendMidi([144,midi,100])));
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#playedSymbol').textContent(),'C');
    await page.evaluate(() => {
      window.mutations = 0;
      window.observer = new MutationObserver(records=>window.mutations+=records.length);
      observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
    });
    const calls = await page.evaluate(() => analysisCalls);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>mutations),0,'idle interface must not repeatedly modify DOM');
    const pressure = await page.evaluate(() => {
      const start = performance.now();
      for(let i=0;i<10000;i++) sendMidi([176,64,i%64]);
      return performance.now()-start;
    });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>analysisCalls),calls,'unchanged MIDI controls must not repeat chord analysis');
    assert.equal(await page.evaluate(()=>mutations),0,'unchanged MIDI controls must not rebuild UI');
    await page.evaluate(() => {observer.disconnect();replacePort('throw');});
    await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent==='MIDI 打开失败');
    await page.evaluate(()=>midiAccess.onstatechange());
    assert.equal(await page.locator('#midiStatus').textContent(),'MIDI 打开失败');
    assert.equal(await page.locator('#noteCount').textContent(),'0','replacing a port clears old voices');
    await page.evaluate(()=>replacePort('pending'));
    await page.waitForTimeout(50);
    await page.evaluate(()=>replacePort('healthy'));
    await page.waitForTimeout(50);
    await page.evaluate(()=>rejectOldPort(new Error('Late failure')));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#midiStatus').textContent(),'1 MIDI 输入','stale open failure must not disable a replacement device');
    await page.evaluate(()=>[57,60,64].forEach(midi=>sendMidi([144,midi,100])));
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#playedSymbol').textContent(),'Am');
    assert.equal(await page.evaluate(()=>audioStarts),1,'default sound initializes one shared audio context');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,idleDomMutations:0,redundantAnalyses:0,controllerMessages:10000,controllerMs:Math.round(pressure),checks:'corrupt history, stable free layout, mute, synchronous/stale MIDI failures'}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
