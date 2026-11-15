const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHORD_LENS_BROWSER||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  try {
    const page=await browser.newPage({viewport:{width:1480,height:960}});
    await page.addInitScript(()=>{
      window.midiRequests=0;
      const port={id:'recovered',name:'Recovered MIDI',state:'connected',async open(){return this;}};
      window.recoveredAccess={inputs:new Map([[port.id,port]])};
      window.sendMidi=data=>port.onmidimessage?.({data:new Uint8Array(data)});
      Object.defineProperty(navigator,'requestMIDIAccess',{value:()=>{
        window.midiRequests++;
        if(midiRequests===1)return new Promise(resolve=>window.resolveStaleMidi=resolve);
        return Promise.resolve(recoveredAccess);
      }});
    });
    await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
    await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent==='MIDI 连接超时',null,{timeout:7500});
    assert.equal(await page.locator('#connectButton').isEnabled(),true,'timeout must allow retry');
    await page.locator('#connectButton').click();
    await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent==='1 MIDI 输入');
    await page.evaluate(()=>resolveStaleMidi({inputs:new Map()}));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#midiStatus').textContent(),'1 MIDI 输入','stale request cannot replace recovered access');
    await page.evaluate(()=>[60,64,67].forEach(midi=>sendMidi([144,midi,100])));
    await page.waitForFunction(()=>document.querySelector('#playedSymbol').textContent==='C');
    await page.locator('#connectButton').click();
    assert.equal(await page.evaluate(()=>midiRequests),2,'refresh reuses healthy access');
    await page.evaluate(()=>{
      const port={id:'recovered',name:'Blocked MIDI',state:'connected',open(){return new Promise(()=>{});}};
      recoveredAccess.inputs.set(port.id,port);recoveredAccess.onstatechange();
    });
    await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent==='MIDI 打开失败',null,{timeout:7500});
    console.log('MIDI connection: timeout, retry, late response, recovered chord input, healthy refresh and stuck port timeout passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
