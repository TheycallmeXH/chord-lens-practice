const assert = require('node:assert/strict');
const {chromium,_electron} = require('playwright');
const {join,resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {mkdir} = require('node:fs/promises');
const {version} = require('./package.json');

async function makeFile(arpeggio = false) {
  const {MIDIBuilder} = await import('spessasynth_core');
  const midi = new MIDIBuilder({format:1,name:'Practice import',timeDivision:480,initialTempo:120});
  midi.addTrack('<Piano & Test>');midi.addTrack('Melody');midi.addTrack('Drums');
  const chords = arpeggio ? [[60,64,67]] : [[60,64,67],[60,64,67,71],[60,64,65,69]];
  chords.forEach((notes,step)=>notes.forEach((pitch,i)=>{
    const tick = step*960 + (arpeggio ? i*120 : i*10);
    midi.noteOn(tick,1,0,pitch,90);midi.noteOff(tick+600,1,0,pitch);
  }));
  midi.noteOn(0,2,1,84,80);midi.noteOff(300,2,1,84);
  midi.noteOn(0,3,9,36,100);midi.noteOff(100,3,9,36);
  midi.flush();
  return {name:arpeggio?'Arpeggios.mid':'Chords.mid',mimeType:'audio/midi',buffer:Buffer.from(midi.writeMIDI())};
}
(async()=>{
  const local = process.argv.includes('--local'), packaged = process.argv.includes('--packaged'), output=join(__dirname,'test-results');
  const native = local || packaged;
  await mkdir(output,{recursive:true});
  let browser,app,page;
  try {
    let resize;
    if (native) {
      app=await _electron.launch({executablePath:resolve(__dirname,local?'../../dist/和弦镜练琴版/和弦镜练琴版.exe':'../dist/和弦镜练琴版/和弦镜练琴版.exe'),args:['--practice-test']});
      page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
      resize=([width,height])=>app.evaluate(({BrowserWindow},[w,h])=>BrowserWindow.getAllWindows()[0].setSize(w,h),[width,height]);
    } else {
      browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],executablePath:process.env.CHORD_LENS_BROWSER||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
      page=await browser.newPage({viewport:{width:1480,height:960}});
      await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
      resize=([width,height])=>page.setViewportSize({width,height});
    }
    page.setDefaultTimeout(10000);
    const errors=[],workers=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('worker',worker=>workers.push(worker));
    await page.waitForSelector('#levelSelect');
    await page.evaluate(()=>localStorage.clear());
    await page.context().addInitScript(()=>{
      const port={id:'progression-test',name:'Progression MIDI',state:'connected',async open(){return this;}};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[port.id,port]])})});
      window.sendMidi=data=>port.onmidimessage?.({data:new Uint8Array(data)});
    });
    await page.reload();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#monitorToggle').isChecked(),true);
    await page.locator('[data-mode="progression"]').click();
    assert.equal(await page.locator('#progressionSelect option').count(),18);
    await page.locator('#progressionSelect').selectOption('minor-cadence');
    assert.equal(await page.locator('#targetSymbol').textContent(),'Dm7♭5');
    await page.locator('#keySelect').selectOption('2');
    assert.equal(await page.locator('#targetSymbol').textContent(),'Em7♭5');
    await page.locator('#settingsButton').click();await page.locator('#tab-practice').click();
    assert.equal(await page.locator('#transitionSelect').inputValue(),'connected');
    await page.locator('#voiceLeadingSelect').selectOption('smooth');
    await page.locator('#settingsDialog [data-close]').click();
    await page.screenshot({path:join(output,`progression-${native?'native':'browser'}-minor.png`),scale:'css'});
    const choose = async file => {
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#importMidiButton').click();
      await (await chooser).setFiles(file);
      await page.waitForFunction(()=>document.querySelector('#midiImportStatus').textContent !== '正在读取 MIDI…');
    };
    await choose(await makeFile());
    await page.waitForSelector('[data-midi-track="1"]');
    assert.equal(await page.locator('#midiTrackList label').count(),2,'drum track omitted');
    assert.match(await page.locator('#midiTrackList label').first().textContent(),/<Piano & Test>/);
    assert.equal(await page.locator('#midiTrackList img').count(),0,'track names are escaped');
    await page.locator('[data-midi-track="2"]').uncheck();
    await page.waitForFunction(()=>document.querySelector('#applyMidiButton').disabled===false);
    assert.deepEqual(await page.locator('#midiPreview>span').allTextContents(),['C','Cmaj7','Fmaj7/C']);
    await page.screenshot({path:join(output,`progression-${native?'native':'browser'}-import.png`),scale:'css'});
    await page.locator('#applyMidiButton').click();
    assert.equal(await page.locator('#targetIndex').textContent(),'1 / 3');
    assert.equal(await page.locator('#keySelect').isVisible(),false);
    assert.equal(await page.locator('#countSelect').isVisible(),false);
    assert.equal(await page.locator('#midiSourceName').textContent(),'Chords.mid');
    await page.locator('#startButton').click();
    await page.evaluate(()=>[60,64,67].forEach(n=>sendMidi([144,n,90])));
    await page.waitForFunction(()=>document.querySelector('#completedText').textContent==='1 / 3');
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#completedText').textContent(),'1 / 3','holding cannot repeat score');
    await page.evaluate(()=>sendMidi([144,71,90]));
    await page.waitForFunction(()=>document.querySelector('#completedText').textContent==='2 / 3');
    assert.equal(await page.locator('#noteCount').textContent(),'4','common tones remain sounding');
    await page.evaluate(()=>{
      [67,71].forEach(n=>sendMidi([128,n,0]));
      [65,69].forEach(n=>sendMidi([144,n,90]));
    });
    await page.waitForFunction(()=>document.querySelector('#completedText').textContent==='3 / 3');
    await page.evaluate(()=>[60,64,65,69].forEach(n=>sendMidi([128,n,0])));
    await page.waitForFunction(()=>document.querySelector('#practiceState').textContent==='本轮完成');
    assert.equal(await page.locator('#accuracyText').textContent(),'100%');
    assert.equal(await page.locator('#startButton span').textContent(),'重练本轮');
    await page.locator('#startButton').click();
    assert.equal(await page.locator('#targetSymbol').textContent(),'C');
    assert.equal(await page.locator('#targetIndex').textContent(),'1 / 3');
    await page.locator('#stopButton').click();
    await choose({name:'Broken.mid',mimeType:'audio/midi',buffer:Buffer.from('broken')});
    await page.waitForFunction(()=>document.querySelector('#midiImportStatus').classList.contains('error'));
    assert.equal(await page.locator('#applyMidiButton').isDisabled(),true);
    await page.locator('#midiImportDialog [data-close]').click();
    assert.equal(await page.locator('#midiSourceName').textContent(),'Chords.mid','failed import preserves current exercise');
    await choose(await makeFile(true));
    await page.waitForSelector('[data-midi-track="1"]');
    await page.locator('[data-midi-track="2"]').uncheck();
    await page.waitForFunction(()=>document.querySelector('#midiImportStatus').classList.contains('error'));
    await page.locator('#midiGroupingSelect').selectOption('1');
    await page.waitForFunction(()=>document.querySelector('#applyMidiButton').disabled===false);
    assert.equal(await page.locator('#midiWindowField').isVisible(),false);
    assert.deepEqual(await page.locator('#midiPreview>span').allTextContents(),['C']);
    await page.locator('[data-midi-track="1"]').uncheck();
    await page.waitForFunction(()=>document.querySelector('#midiImportStatus').classList.contains('error'));
    assert.equal(await page.locator('#applyMidiButton').isDisabled(),true);
    await page.locator('#midiImportDialog [data-close]').click();
    await page.locator('#settingsButton').click();await page.locator('#tab-about').click();
    assert.equal(await page.locator('#aboutVersion').textContent(),version);
    assert.match(await page.locator('#settings-about').textContent(),/Katuria/);
    assert.equal(await page.locator('#repositoryLink').getAttribute('href'),'https://github.com/TheycallmeXH/chord-lens-practice');
    if (app) {
      await page.locator('[data-license="project"]').click();
      assert.match(await page.locator('#licenseText').textContent(),/MIT License/);
      await page.locator('#licenseDialog [data-close]').click();
      for (const id of ['notices','tonal','lucide','jost','synth','fflate','vorbis','electron','soundfont']) {
        const result=await page.evaluate(id=>practiceDesktop.license(id),id);
        assert.ok(result.text.length>50,id);
      }
      await app.evaluate(({shell})=>{
        shell.openExternal=async url=>{global.testRepositoryUrl=url;};
        shell.openPath=async path=>{global.testLicensePath=path;return '';};
      });
      await page.locator('#repositoryLink').click();
      assert.match(await app.evaluate(()=>global.testRepositoryUrl),/github.com\/TheycallmeXH\/chord-lens-practice$/);
      await page.locator('[data-license="chromium"]').click();
      assert.match(await app.evaluate(()=>global.testLicensePath),/LICENSES.chromium.html$/);
      assert.equal(await page.evaluate(async()=>{try{await practiceDesktop.license('../package.json');return false;}catch{return true;}}),true);
    }
    await page.screenshot({path:join(output,`progression-${native?'native':'browser'}-about.png`),scale:'css'});
    await page.locator('#settingsDialog [data-close]').click();
    for (const size of [[1480,960],[1120,740]]) {
      await resize(size);await page.locator('#helpButton').click();
      const fit=await page.locator('#helpDialog').evaluate(el=>{
        const r=el.getBoundingClientRect(),content=el.querySelector('.guide-content');
        return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&content.scrollWidth<=content.clientWidth;
      });
      assert.equal(fit,true);
      await page.locator('.guide-content').evaluate(el=>el.scrollTop=el.scrollHeight);
      await page.screenshot({path:join(output,`progression-${native?'native':'browser'}-help-${size[0]}.png`),scale:'css'});
      await page.locator('#helpDialog [data-close]').click();
    }
    assert.deepEqual(errors,[]);
    console.log('Progression UI passed: default audio, 18 templates, transposition, MIDI tracks/preview, common-tone answers, repeat, bad files, beat grouping, about/version/licenses and help layout.');
  } catch(error) {
    if(page) console.error(await page.evaluate(()=>({status:document.querySelector('#midiImportStatus')?.textContent,toast:document.querySelector('#toast')?.textContent})).catch(()=>({})));
    throw error;
  } finally {if(app)await app.close();if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
