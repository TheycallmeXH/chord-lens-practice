const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const context = {};
vm.runInNewContext(readFileSync(join(__dirname, 'vendor/tonal.min.js'), 'utf8'), context);
const { MidiState, createRecognizer, emotion } = require('./engine.js');
const recognizer = createRecognizer(context.Tonal);
const analyze = (notes, options) => recognizer.analyze(notes, options);

test('all dictionary types, roots, inversions and octave doublings retain exact matches', () => {
  let cases = 0;
  for (const type of recognizer.templates) {
    for (let root = 0; root < 12; root++) {
      const pitches = [...new Set(type.pitches.map(pc => (pc + root) % 12))];
      for (const bass of pitches) {
        const notes = pitches.map(pc => 48 + pc + (pc < bass ? 12 : 0)).sort((a, b) => a - b);
        notes.push(notes[0] + 24);
        const result = analyze(notes);
        assert.ok(result.candidates.some(candidate => candidate.root === root && candidate.pitches.length === pitches.length), `${root} ${type.suffix} bass ${bass}`);
        assert.equal(result.bass, Math.min(...notes));
        cases++;
      }
    }
  }
  console.log(`Dictionary voicings verified: ${cases}`);
});
test('common chord names, slash bass and ambiguity', () => {
  for (const [notes, expected] of [
    [[60, 64, 67], 'C'], [[64, 67, 72], 'C/E'], [[60, 63, 67], 'Cm'],
    [[48, 55, 59, 62, 64], 'Cmaj9'], [[60, 64, 67, 70], 'C7'],
    [[60, 63, 66, 69], 'Cdim7'], [[60, 65, 67], 'Csus4'],
    [[60, 64, 67, 69], 'C6'], [[60, 64, 67, 70, 75], 'C7#9']
  ]) assert.equal(analyze(notes).candidates[0]?.symbol, expected.replace(/#/g, '♯'));
  assert.ok(analyze([60, 64, 67, 69]).candidates.some(candidate => candidate.symbol === 'Am7/C'));
  assert.equal(analyze([60, 63, 66, 69]).candidates.length, 4);
});
test('missing fifth and absent roots are explicit hypotheses', () => {
  assert.ok(analyze([60, 64, 70]).inferred.some(candidate => candidate.symbol === 'C7' && candidate.missing.includes(7)));
  assert.ok(!analyze([60, 64, 70], { omissions: false }).inferred.length);
  const voicing = [52, 55, 58, 62];
  assert.ok(!analyze(voicing).inferred.some(candidate => candidate.root === 0));
  assert.ok(analyze(voicing, { rootless: true }).inferred.some(candidate => candidate.root === 0 && candidate.missing.includes(0)));
  assert.equal(analyze(voicing, { rootless: true }).candidates[0].symbol, 'Em7♭5');
});
test('theoretical spelling, scientific octaves and reference frequency', () => {
  const dim = analyze([60, 63, 66, 69]).candidates[0];
  assert.equal(recognizer.describeNote(69, dim).name, 'B♭♭4');
  const altered = analyze([60, 64, 67, 70, 75]).candidates[0];
  assert.equal(recognizer.describeNote(75, altered).name, 'D♯5');
  assert.equal(recognizer.describeNote(69).frequency, 440);
  assert.equal(recognizer.describeNote(69, null, 'auto', 432).frequency, 432);
  const cb = analyze([59, 63, 66], { spelling: 'flat' }).candidates.find(item => item.root === 11);
  assert.equal(cb.symbol, 'B');
  const fs = analyze([54, 58, 61], { spelling: 'flat' }).candidates[0];
  assert.equal(recognizer.describeNote(58, fs).name, 'B♭3');
});
test('empty, octave, dyad, chromatic cluster and MIDI extremes', () => {
  assert.equal(analyze([]).kind, 'empty');
  assert.equal(analyze([48, 60, 72]).kind, 'single');
  assert.equal(analyze([60, 61]).kind, 'dyad');
  assert.equal(analyze([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]).kind, 'unmatched');
  assert.equal(analyze([0, 127]).midis.length, 2);
  assert.equal(analyze([-1, NaN, 128]).kind, 'empty');
});
test('interval relationships preserve spelling, inversions and compound distance', () => {
  const major = analyze([60, 64, 67]).candidates[0];
  assert.equal(recognizer.describeInterval(60, 64, major).label, '大三度');
  assert.equal(recognizer.describeInterval(64, 67, major).label, '小三度');
  assert.equal(recognizer.describeInterval(60, 67, major).label, '纯五度');
  assert.equal(recognizer.describeInterval(64, 72, major).label, '小六度');
  assert.equal(recognizer.describeInterval(60, 76, major).label, '大十度');
  assert.equal(recognizer.describeInterval(60, 84).label, '纯十五度');
  const dim = analyze([60, 63, 66, 69]).candidates[0];
  assert.equal(recognizer.describeInterval(60, 66, dim).label, '减五度');
  assert.equal(recognizer.describeInterval(60, 69, dim).label, '减七度');
  const lydian = analyze([60, 64, 67, 71, 74, 78]).candidates.find(item => item.root === 0);
  assert.equal(recognizer.describeInterval(60, 78, lydian).label, '增十一度');
  assert.equal(recognizer.describeInterval(60, 61).semitones, 1);
  assert.equal(recognizer.describeInterval(60, 72).label, '纯八度');
});
test('velocity zero, sustain, rearticulation and pedal-free view', () => {
  const state = new MidiState();
  state.message('p', [144, 60, 90]); state.message('p', [176, 64, 127]); state.message('p', [144, 60, 0]);
  assert.equal(state.notes()[0].held, false);
  assert.equal(state.notes(false).length, 0);
  state.message('p', [144, 60, 99]); state.message('p', [176, 64, 0]);
  assert.equal(state.notes()[0].velocity, 99);
  state.message('p', [128, 60, 0]); assert.equal(state.notes().length, 0);
});
test('sostenuto snapshots held notes, not later notes', () => {
  const state = new MidiState();
  state.message('p', [144, 60, 90]); state.message('p', [176, 66, 127]);
  state.message('p', [144, 64, 90]);
  state.message('p', [128, 60, 0]); state.message('p', [128, 64, 0]);
  assert.deepEqual(state.notes().map(note => note.midi), [60]);
  state.message('p', [176, 66, 0]); assert.equal(state.notes().length, 0);
});
test('sustain catches notes already sounding under sostenuto', () => {
  const state = new MidiState();
  state.message('p', [144, 60, 90]); state.message('p', [176, 66, 127]);
  state.message('p', [128, 60, 0]); state.message('p', [176, 64, 127]);
  state.message('p', [176, 66, 0]); assert.equal(state.notes().length, 1);
  state.message('p', [176, 64, 0]); assert.equal(state.notes().length, 0);
});
test('overlapping sources, channels, disconnect, CC120/121/123 and repeated Note On', () => {
  const state = new MidiState();
  state.message('a', [144, 60, 80]); state.message('a', [144, 60, 90]);
  state.message('a', [128, 60, 0]); assert.equal(state.notes()[0].held, true);
  state.message('b', [145, 60, 100]); state.clear('a'); assert.equal(state.notes().length, 1);
  state.message('b', [177, 64, 127]); state.message('b', [177, 123, 0]);
  assert.equal(state.notes()[0].held, false);
  state.message('b', [177, 121, 0]); assert.equal(state.notes().length, 0);
  state.message('b', [145, 60, 90]); state.message('b', [177, 120, 0]); assert.equal(state.notes().length, 0);
  assert.equal(state.message('b', [240]), false);
});
test('emotion text remains qualitative and acknowledges context', () => {
  const text = emotion(analyze([60, 64, 67]).candidates[0]);
  assert.ok(text.tags.includes('明亮'));
  assert.ok(text.context.includes('不是情绪测量'));
  assert.ok(!JSON.stringify(text).includes('%'));
});
