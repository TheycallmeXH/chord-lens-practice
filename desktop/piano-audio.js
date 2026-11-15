(function () {
  'use strict';
  let library;
  async function bounded(promise,message) {
    let timer;
    try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),20000);})]);}
    finally {clearTimeout(timer);}
  }
  function loadLibrary() {
    if(!library) library=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='../assets/synth/spessasynth.min.js';
      script.onload=()=>resolve(window.SpessaSynth);
      script.onerror=()=>{script.remove();library=null;reject(new Error('钢琴引擎加载失败'));};
      document.head.append(script);
    });
    return library;
  }
  class SoundfontPiano {
    constructor(context,destination,read) {
      this.context=context;this.destination=destination;this.read=read;
      this.synth=null;this.loading=null;this.worklet=null;this.tuning=440;
    }
    async ready() {
      if(this.synth) return;
      if(!this.loading) this.loading=this.load().finally(()=>{this.loading=null;});
      return this.loading;
    }
    async reload() {
      await this.loading?.catch(()=>{});
      this.loading=this.load().finally(()=>{this.loading=null;});
      return this.loading;
    }
    async load() {
      this.status='reading';
      const [{WorkletSynthesizer},bytes]=await Promise.all([loadLibrary(),this.read()]);
      this.status='worklet';
      if(!this.worklet) this.worklet=this.context.audioWorklet.addModule('../assets/synth/processor.min.js')
        .catch(error=>{this.worklet=null;throw error;});
      await this.worklet;
      const synth=new WorkletSynthesizer(this.context,{eventsEnabled:false,decodedSampleBudget:32*1024*1024});
      try {
        synth.connect(this.destination);
        await bounded(synth.isReady,'钢琴引擎初始化超时');
        this.status='samples';
        await bounded(synth.soundBankManager.addSoundBank(bytes,'piano'),'SF2 音色加载超时');
        synth.setLogLevel(false,false,false);
        const presets=synth.presetList.filter(preset=>!preset.isDrum);
        const preset=presets.find(item=>item.bankMSB===0 && item.bankLSB===0 && item.program===0)||presets[0];
        if(!preset) throw new Error('SF2 没有可用的钢琴预设');
        synth.setSystemParameter('voiceCap',192);
        synth.setSystemParameter('effectsEnabled',false);
        for(const channel of [0,1]) {
          synth.controllerChange(channel,0,preset.bankMSB);
          synth.controllerChange(channel,32,preset.bankLSB);
          synth.programChange(channel,preset.program);
        }
        const previous=this.synth;
        this.synth=synth;this.preset=preset;
        this.tune(this.tuning);
        previous?.destroy();
        this.status='ready';
      } catch(error) {synth.destroy();throw error;}
    }
    start(midi,velocity,channel=0) {
      const synth=this.synth;
      synth.noteOn(channel,midi,Math.max(1,Math.min(127,velocity)));
      let stopped=false;
      return {stop:()=>{if(!stopped){stopped=true;if(this.synth===synth)synth.noteOff(channel,midi);}}};
    }
    tune(hz) {
      if(this.appliedTuning===hz && this.appliedSynth===this.synth) return;
      this.tuning=hz;
      const cents=1200*Math.log2(hz/440);
      for(const channel of [0,1]) this.synth?.midiChannels[channel].setSystemParameter('fineTune',cents);
      this.appliedTuning=hz;this.appliedSynth=this.synth;
    }
    silence() {this.synth?.stopAll(true);}
    destroy() {this.synth?.destroy();this.synth=null;}
  }
  window.SoundfontPiano=SoundfontPiano;
})();
