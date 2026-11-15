const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {readSequence,extractTargets} = require('./midi-import.js');
const {createRecognizer} = require('../midi-chords/engine.js');
const {readLicense,metadata} = require('./about.cjs');
const box = {};
vm.runInNewContext(readFileSync(join(__dirname,'../midi-chords/vendor/tonal.min.js'),'utf8'),box);
const recognizer = createRecognizer(box.Tonal);
async function fixture() {
  const {MIDIBuilder,BasicMIDI} = await import('spessasynth_core');
  const midi = new MIDIBuilder({format:1,name:'Import test',initialTempo:120,timeDivision:480});
  midi.addTrack('Piano');midi.addTrack('Melody');midi.addTrack('Drums');
  for (const [start,notes] of [[0,[60,64,67]],[480,[60,64,67]],[960,[62,65,69]],[1440,[67,71,74]]]) {
    notes.forEach((note,i)=>{midi.noteOn(start+i*12,1,0,note,100);midi.noteOff(start+400,1,0,note);});
  }
  midi.noteOn(0,2,1,84,80);midi.noteOff(400,2,1,84);
  midi.noteOn(0,3,9,36,100);midi.noteOff(40,3,9,36);
  midi.setTempo(960,60);midi.flush();
  return BasicMIDI.fromArrayBuffer(midi.writeMIDI());
}
test('standard MIDI parsing preserves tracks and tempo changes, excludes drums and extracts actual voiced chord targets',async()=>{
  const sequence = readSequence(await fixture());
  assert.equal(sequence.tracks.length,2);
  assert.equal(sequence.notes.length,13);
  assert.equal(sequence.bpm,120);
  assert.equal(sequence.notes.find(note=>note.ticks===1440).time,2000);
  const result = extractTargets(box.Tonal,recognizer,sequence,{tracks:[1],windowMs:80});
  assert.equal(result.merged,1);
  assert.equal(result.targets.length,3);
  assert.deepEqual(result.targets.map(target=>target.symbol),['C','Dm','G']);
  assert.deepEqual(result.targets[1].notes,[62,65,69]);
  assert.deepEqual(result.targets[1].noteNames,['D4','F4','A4']);
  assert.equal(extractTargets(box.Tonal,recognizer,sequence,{tracks:[]}).targets.length,0);
  assert.equal(extractTargets(box.Tonal,recognizer,sequence,{tracks:[2]}).skipped,1);
});
test('beat aggregation handles arpeggios without guessing names for unrecognized pitch sets',()=>{
  const sequence={ppq:480,notes:[60,64,67].map((pitch,i)=>({pitch,track:0,ticks:i*120,time:i*125}))};
  assert.equal(extractTargets(box.Tonal,recognizer,sequence,{tracks:[0],grouping:'onset',windowMs:20}).targets.length,0);
  assert.equal(extractTargets(box.Tonal,recognizer,sequence,{tracks:[0],grouping:'1'}).targets[0].symbol,'C');
  const dense={ppq:480,notes:Array.from({length:12},(_,i)=>({pitch:60+i,track:0,ticks:0,time:0}))};
  const target=extractTargets(box.Tonal,recognizer,dense,{tracks:[0]}).targets[0];
  assert.equal(target.symbol,'音集');
  assert.equal(target.notes.length,12);
});
test('MIDI limits and unsupported time formats report clear errors',async()=>{
  const midi=await fixture();
  midi.format=2;assert.throws(()=>readSequence(midi),/Format 2/);
  midi.format=1;midi.timeDivision=0x8001;assert.throws(()=>readSequence(midi),/SMPTE/);
  assert.throws(()=>readSequence({format:0,timeDivision:480,tracks:[],tempoChanges:[]}),/没有/);
});
test('about metadata and license lookup use an explicit allowlist',async()=>{
  const info=metadata('test-preview');
  assert.equal(info.author,'Katuria');assert.equal(info.version,'test-preview');
  assert.ok(info.repository.endsWith('/chord-lens-practice'));
  assert.match((await readLicense('project',join(__dirname,'..'),__dirname)).text,/MIT License/);
  assert.match((await readLicense('tonal',join(__dirname,'..'),__dirname)).text,/Permission is hereby granted/);
  await assert.rejects(readLicense('../package.json',join(__dirname,'..'),__dirname),/未知/);
});
module.exports={fixture};
