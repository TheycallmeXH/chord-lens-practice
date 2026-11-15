const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {_electron}=require('playwright');
const {execFileSync}=require('node:child_process');

const within=(promise,ms,label)=>{
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(`${label} timed out after ${ms}ms`)),ms);
  })]).finally(()=>clearTimeout(timer));
};

(async()=>{
  const local=process.argv.includes('--local');
  const executablePath=resolve(__dirname,local?'../../dist/和弦镜练琴版/和弦镜练琴版.exe':'../dist/和弦镜练琴版/和弦镜练琴版.exe');
  const app=await _electron.launch({executablePath,args:['--practice-test'],timeout:15000});
  try {
    const page=await app.firstWindow({timeout:15000});
    await within(page.waitForSelector('#midiStatus',{state:'attached'}),8000,'MIDI page');
    const result=await within(page.evaluate(async()=>{
      const access=await navigator.requestMIDIAccess({sysex:false});
      const inputs=[];
      for(const port of access.inputs.values()){
        let error;
        try {await port.open();} catch(e){error=e.message;}
        inputs.push({name:port.name,state:port.state,connection:port.connection,error});
      }
      return {inputs,status:document.querySelector('#midiStatus').textContent,sysex:access.sysexEnabled};
    }),8000,'Real MIDI access');
    console.log(JSON.stringify(result,null,2));
    assert.equal(result.sysex,false);
    assert.ok(result.inputs.length>0,'No actual MIDI input detected');
    assert.ok(result.inputs.some(port=>port.connection==='open'),'No actual MIDI input opened');
  } finally {
    try {await within(app.close(),2000,'Test shutdown');}
    catch {
      if(process.platform==='win32'){
        try {execFileSync('taskkill',['/PID',String(app.process().pid),'/T','/F'],{windowsHide:true,timeout:5000,stdio:'ignore'});}
        catch {}
      }
      app.process().kill();
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
