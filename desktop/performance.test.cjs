const {_electron}=require('playwright');
const {resolve,dirname}=require('node:path');
const {mkdir,writeFile,rm}=require('node:fs/promises');
const assert=require('node:assert/strict');

(async()=>{
  const local=process.argv.includes('--local'), baseline=process.argv.includes('--baseline');
  const options=local ? {
    executablePath:resolve(__dirname,'../../dist/和弦镜练琴版/和弦镜练琴版.exe'),
    args:['--practice-test','--practice-test-no-midi']
  } : {executablePath:require('electron'),args:[__dirname,'--practice-test','--practice-test-no-midi']};
  if(local) await rm(resolve(dirname(options.executablePath),'resources/app/desktop/.test-profile/soundfont.json'),{force:true});
  const app=await _electron.launch(options);
  try {
    const page=await app.firstWindow();
    await page.context().addInitScript(()=>{
      localStorage.clear();
      const port={id:'perf',name:'Performance MIDI',state:'connected',async open(){return this;}};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[port.id,port]])})});
      window.sendMidi=data=>port.onmidimessage?.({data:new Uint8Array(data)});
      const Audio=window.AudioContext;
      window.AudioContext=class extends Audio {constructor(...args){super(...args);window.testAudio=this;}};
      Object.defineProperty(window,'SoundfontPiano',{configurable:true,set(Class){
        Object.defineProperty(window,'SoundfontPiano',{configurable:true,value:class extends Class {
          async load(){window.testPiano=this;return super.load();}
        }});
      }});
    });
    await page.reload();
    await page.waitForFunction(()=>window.testPiano?.status==='ready',null,{timeout:25000});
    await page.waitForTimeout(4500);
    const measure=async(label)=>{
      await app.evaluate(({app})=>app.getAppMetrics());
      await page.waitForTimeout(3000);
      const processes=await app.evaluate(({app})=>app.getAppMetrics().map(p=>({
        type:p.type,cpu:p.cpu.percentCPUUsage,privateKB:p.memory.privateBytes,workingKB:p.memory.workingSetSize
      })));
      return {label,audio:await page.evaluate(()=>testAudio.state),
        cpu:processes.reduce((n,p)=>n+p.cpu,0),
        privateMB:processes.reduce((n,p)=>n+(p.privateKB||0),0)/1024,
        workingMB:processes.reduce((n,p)=>n+p.workingKB,0)/1024,processes};
    };
    const results=[await measure('idle')];
    if(!baseline) assert.equal(results[0].audio,'suspended','idle audio must sleep with sound still enabled');
    await page.evaluate(()=>[48,55,60,64,67,72].forEach(n=>sendMidi([144,n,100])));
    await page.waitForFunction(()=>testAudio.state==='running');
    results.push(await measure('held chord'));
    await page.evaluate(()=>[48,55,60,64,67,72].forEach(n=>sendMidi([128,n,0])));
    await page.waitForTimeout(4500);
    results.push(await measure('released'));
    if(!baseline) assert.equal(results[2].audio,'suspended');
    await page.evaluate(()=>sendMidi([144,67,100]));
    await page.waitForFunction(()=>testAudio.state==='running');
    await page.evaluate(()=>sendMidi([128,67,0]));
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'true');
    await mkdir(resolve(__dirname,'test-results'),{recursive:true});
    await writeFile(resolve(__dirname,`test-results/performance-${local?'local':'source'}-${baseline?'before':'after'}.json`),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results.map(({processes,...r})=>r),null,2));
  } finally {await app.close();}
})().catch(error=>{console.error(error);process.exit(1);});
