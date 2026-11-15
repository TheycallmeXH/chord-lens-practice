const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const {resolve,dirname}=require('node:path');
const {rm}=require('node:fs/promises');

(async()=>{
  const local=process.argv.includes('--local');
  const phase=message=>console.log(`SF2 ${local?'local':'distribution'}: ${message}`);
  const executablePath=resolve(__dirname,local?'../../dist/和弦镜练琴版/和弦镜练琴版.exe':'../dist/和弦镜练琴版/和弦镜练琴版.exe');
  await rm(resolve(dirname(executablePath),'resources/app/desktop/.test-profile/soundfont.json'),{force:true});
  const app=await _electron.launch({
    executablePath,args:['--practice-test','--practice-test-no-midi']
  });
  try {
    phase('launched');
    const page=await app.firstWindow({timeout:15000}),errors=[],consoleErrors=[];
    phase('window connected');
    page.setDefaultTimeout(15000);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
    phase('window shown');
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'){consoleErrors.push(message.text());console.error(message.text());}});
    await page.waitForSelector('#soundfontButton',{state:'attached'});
    phase('page loaded');
    await page.evaluate(()=>localStorage.clear());
    await page.locator('[data-mode="chords"]').click();
    phase('storage cleared');
    await page.context().addInitScript(()=>{
      const port={id:'sf2-midi',name:'SF2 MIDI',state:'connected',async open(){return this;}};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[port.id,port]])})});
      window.sendMidi=data=>port.onmidimessage?.({data:new Uint8Array(data)});
      window.audioStarts=0;window.oscillatorStarts=0;
      const Audio=window.AudioContext;
      window.AudioContext=class extends Audio {
        constructor(...args) {
          super(...args);window.audioStarts++;
          const analyser=this.createAnalyser();analyser.fftSize=4096;
          const connect=AudioNode.prototype.connect;
          AudioNode.prototype.connect=function(target,...rest) {
            if(target===analyser.context.destination)connect.call(this,analyser);
            return connect.call(this,target,...rest);
          };
          window.outputPeak=()=>{
            const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
            return Math.max(...data.map(Math.abs));
          };
          const create=this.createOscillator.bind(this);
          this.createOscillator=(...args)=>{window.oscillatorStarts++;return create(...args);};
        }
      };
      window.sf2Loads=0;window.sf2Notes=[];
      Object.defineProperty(window,'SoundfontPiano',{
        configurable:true,
        set(Class) {
          Object.defineProperty(window,'SoundfontPiano',{value:class extends Class {
            async load(){window.sf2Loads++;window.sf2Engine=this;const result=await super.load();window.sf2Preset=this.preset;return result;}
            start(...args){window.sf2Notes.push(args);return super.start(...args);}
          },configurable:true});
        }
      });
    });
    await page.reload();
    phase('instrumentation installed');
    await page.locator('#connectButton').click();
    await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent==='1 MIDI 输入');
    phase('MIDI ready');
    const info=await page.evaluate(()=>practiceDesktop.soundfontInfo());
    assert.equal(info.name,local?'Equinox_Grand_Pianos.sf2':'akai_steinway.sf2');
    assert.equal(info.available,true);
    assert.equal(await page.evaluate(()=>audioStarts),1,'default sound initializes the piano');
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#monitorToggle').isChecked(),true);
    await page.waitForFunction(()=>window.sf2Preset,null,{timeout:15000});
    phase('samples ready');
    assert.equal(await page.evaluate(()=>sf2Preset.program),0);
    await page.locator('#settingsButton').click();
    await page.locator('[data-settings-tab="audio"]').click();
    await page.screenshot({path:resolve(__dirname,`test-results/${local?'local-equinox':'native-akai'}-settings.png`),scale:'css'});
    await page.locator('#monitorToggle').check();
    await page.locator('#settingsDialog [data-close]').click();
    await page.evaluate(()=>sendMidi([144,60,110]));
    await page.waitForFunction(()=>outputPeak()>.003);
    assert.equal(await page.evaluate(()=>oscillatorStarts),0,'piano must play SF2 samples, not oscillators');
    const first=await page.evaluate(()=>sf2Notes.length);
    await page.evaluate(()=>sendMidi([144,60,70]));
    await page.waitForFunction(first=>sf2Notes.length>first,first);
    assert.equal(await page.evaluate(()=>sf2Notes.at(-1)[1]),70,'repeated note honors velocity');
    await page.evaluate(()=>{sendMidi([176,64,127]);sendMidi([128,60,0]);sendMidi([128,60,0]);});
    assert.equal(await page.locator('[data-midi="60"]').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>sendMidi([176,64,0]));
    assert.equal(await page.locator('[data-midi="60"]').getAttribute('aria-pressed'),'false');
    await page.locator('#settingsButton').click();
    await page.locator('#tuningInput').fill('442');
    await page.locator('#tuningInput').dispatchEvent('change');
    await page.locator('#settingsDialog [data-close]').click();
    assert.equal(await page.evaluate(()=>sf2Engine.tuning),442);
    await page.evaluate(()=>sendMidi([144,64,100]));
    await page.waitForFunction(()=>outputPeak()>.003);
    await page.locator('#soundButton').click();
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>outputPeak())<.00001,'mute is immediate and includes release tails');
    await page.locator('#soundButton').click();
    await page.waitForFunction(()=>outputPeak()>.003);
    assert.equal(await page.evaluate(()=>sf2Loads),1,'toggle reuses loaded sound bank');
    phase('notes and mute passed');
    await app.evaluate(({app,dialog})=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[app.getAppPath()+'/soundfonts/akai_steinway.sf2']});
    });
    await page.locator('#settingsButton').click();
    await page.locator('#soundfontButton').click();
    await page.waitForFunction(()=>sf2Loads===2 && sf2Engine.status==='ready');
    phase('replacement ready');
    await page.locator('#settingsDialog [data-close]').click();
    await page.waitForFunction(()=>outputPeak()>.003);
    assert.equal(await page.locator('#noteCount').textContent(),'1','replacing sound bank preserves MIDI state');
    await page.locator('#clearButton').click();
    await page.locator('#previewButton').click();
    await page.waitForFunction(()=>sf2Notes.some(note=>note[2]===1));
    await page.waitForFunction(()=>outputPeak()>.003);
    await page.locator('#soundButton').click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>sf2Engine.context.state),'suspended','muted engine does not keep rendering');
    await page.locator('#settingsButton').click();
    await page.locator('#soundfontButton').click();
    await page.waitForFunction(()=>sf2Loads===3 && sf2Engine.status==='ready' && sf2Engine.context.state==='suspended');
    phase('muted replacement ready');
    assert.equal(await page.evaluate(()=>outputPeak()),0,'switching sound bank while muted stays silent');
    await page.locator('#settingsDialog [data-close]').click();
    await page.reload();
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'true');
    assert.equal((await page.evaluate(()=>practiceDesktop.soundfontInfo())).name,'akai_steinway.sf2','chosen bank persists after restart');
    assert.deepEqual(errors,[]);
    assert.deepEqual(consoleErrors.filter(text=>!text.includes('ERR_FILE_NOT_FOUND')),[]);
    console.log(`SF2: ${local?'Equinox local':'Akai distribution'} default, real sampled output, velocity, retrigger, sustain, tuning, preview, replacement, mute, cache and enabled restart passed.`);
  } catch(error) {
    console.error('Renderer:',await (await app.firstWindow()).evaluate(()=>({
      toast:document.querySelector('#toast').textContent,loads:window.sf2Loads,
      audioStarts:window.audioStarts,preset:window.sf2Preset,notes:window.sf2Notes,
      status:window.sf2Engine?.status,audioState:window.sf2Engine?.context.state,audioTime:window.sf2Engine?.context.currentTime
    })));
    throw error;
  } finally {await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
