'use strict';
importScripts('../assets/midi/midi-parser.min.js','../midi-chords/vendor/tonal.min.js','../midi-chords/engine.js','midi-import.js');
let sequence;
const recognizer = ChordLens.createRecognizer(Tonal);
self.onmessage = ({data}) => {
  try {
    if (data.type === 'load') {
      const bytes = new Uint8Array(data.bytes), header = new DataView(data.bytes);
      if (bytes.length < 14 || bytes.length > 16*1024*1024 || String.fromCharCode(...bytes.slice(0,4)) !== 'MThd' ||
        header.getUint32(4) !== 6 || header.getUint16(8)>1 || header.getUint16(12)&0x8000) {
        throw new Error('请选择标准 MIDI 文件（Format 0 / 1，每拍 ticks，最大 16 MB）');
      }
      sequence = MidiPracticeImport.readSequence(SpessaMIDI.BasicMIDI.fromArrayBuffer(data.bytes,data.name));
      self.postMessage({id:data.id,type:'loaded',tracks:sequence.tracks,bpm:sequence.bpm});
    } else if (data.type === 'extract') {
      if (!sequence) throw new Error('请先选择 MIDI 文件');
      self.postMessage({id:data.id,type:'extracted',...MidiPracticeImport.extractTargets(Tonal,recognizer,sequence,data.options)});
    }
  } catch (error) {self.postMessage({id:data.id,error:error.message || 'MIDI 解析失败'});}
};
