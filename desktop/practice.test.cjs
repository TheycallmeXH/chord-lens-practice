const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');
const box = {};
vm.runInNewContext(fs.readFileSync(join(__dirname, '../midi-chords/vendor/tonal.min.js'), 'utf8'), box);
const { qualities, categories, progressions, availableTypes, createTarget, createDeck, evaluate, Session } = require('./practice.js');
const C = createTarget(box.Tonal, 0, 'major');
test('decks cover twelve roots, correct inversions and transposed progressions', () => {
  const deck = createDeck(box.Tonal, { plan: 'inversions' }, () => 0.4);
  assert.equal(new Set(deck.map(target => target.root)).size, 12);
  assert.deepEqual(createTarget(box.Tonal, 0, 'major', 2).notes, [55, 60, 64]);
  assert.equal(createTarget(box.Tonal, 0, 'major', 1).symbol, 'C/E');
  const progression = createDeck(box.Tonal, { mode: 'progression', key: '2', count: 3 });
  assert.deepEqual(progression.map(target => target.symbol), ['Em7', 'A7', 'Dmaj7']);
  assert.deepEqual(createDeck(box.Tonal, { mode:'progression', key:'6', count:3 }).map(target => target.symbol), ['G#m7','C#7','F#maj7']);
  assert.deepEqual(createDeck(box.Tonal, { mode:'progression', key:'11', count:3 }).map(target => target.symbol), ['C#m7','F#7','Bmaj7']);
  for (const key of Array.from({ length:12 }, (_, i) => i)) {
    for (const target of createDeck(box.Tonal, { mode:'progression', key, count:3 })) {
      assert.deepEqual(target.noteNames.map(name => box.Tonal.Note.midi(name)), target.notes);
    }
  }
  assert.deepEqual(createTarget(box.Tonal, 0, 'major', 2).noteNames, ['G3','C4','E4']);
  assert.ok(createDeck(box.Tonal, { plan: 'sevenths', count: 24 }).every(target => target.notes.length === 4));
});
test('pitch matching tolerates octave doubling, exact mode and inversion enforce the target', () => {
  assert.equal(evaluate([60, 64, 67, 72], C).exact, true);
  assert.equal(evaluate([60, 64, 67], C, 'exact').exact, false);
  assert.equal(evaluate(C.notes, C, 'exact').exact, true);
  assert.deepEqual(evaluate([60, 64, 66], C).missing, [7]);
  assert.deepEqual(evaluate([60, 64, 66], C).extra, [6]);
  const inversion = createTarget(box.Tonal, 0, 'major', 1);
  assert.equal(evaluate([60, 64, 67], inversion).bassWrong, true);
  assert.equal(evaluate([64, 67, 72], inversion).exact, true);
});
test('stable correctness counts once and advances only after all notes release', () => {
  const session = new Session([C, C], { holdMs: 300 });
  session.start(0);
  assert.equal(session.update(C.notes, 0), 'release');
  session.update([], 1);
  session.update(C.notes, 20);
  assert.equal(session.update(C.notes, 319), 'holding');
  assert.equal(session.update(C.notes, 320), 'correct');
  assert.equal(session.update(C.notes, 900), 'release');
  assert.equal(session.correct, 1);
  assert.equal(session.index, 0);
  session.update([], 1000);
  assert.equal(session.index, 1);
});
test('partial landing is not penalized until release and corrections can succeed', () => {
  const session = new Session([C], { holdMs: 100 });
  session.start(0); session.update([], 0);
  session.update([48], 1); session.update([48, 52], 30);
  assert.equal(session.wrong, 0);
  session.update(C.notes, 50); session.update(C.notes, 151);
  assert.equal(session.correct, 1);
  assert.equal(session.wrong, 0);
  assert.equal(session.attempts[0].formationMs, 49);
  session.update([], 200);
  assert.equal(session.state, 'done');
});
test('wrong attempts, skips, pause, elapsed time and cancellation remain distinct', () => {
  const session = new Session([C, C]);
  session.start(0); session.update([], 0);
  session.update([49], 10); session.update([], 50);
  assert.equal(session.wrong, 1);
  session.update([48], 60); session.pause(100);
  assert.equal(session.elapsed(500), 100);
  session.resume(1000); session.update([], 1001);
  assert.equal(session.wrong, 1);
  session.skip([], 1100);
  assert.equal(session.index, 1);
  assert.equal(session.skipped, 1);
  session.update([48], 1110); session.cancelAttempt(); session.update([], 1200);
  assert.equal(session.wrong, 1);
  session.finish(1300);
  assert.equal(session.elapsed(9999), 400);
  assert.equal(session.accuracy, 0);
});
test('all 32 qualities have valid spelled notes and ordered extended inversions in every register and key', () => {
  assert.equal(Object.keys(qualities).length, 32);
  for (const quality of Object.keys(qualities)) for (let root = 0; root < 12; root++) {
    for (const octave of [2,3,4,5]) {
      const shape = createTarget(box.Tonal,root,quality,0,'',undefined,octave);
      assert.ok(shape.notes.length >= 3,quality);
      for (let inversion = 0; inversion < shape.notes.length; inversion++) {
        const target = createTarget(box.Tonal,root,quality,inversion,'',undefined,octave);
        assert.deepEqual(target.noteNames.map(name => box.Tonal.Note.midi(name)),target.notes,quality);
        assert.ok(target.notes.every((note,i) => Number.isInteger(note) && note >= 0 && note <= 127 && (!i || note > target.notes[i-1])),quality);
        assert.equal(evaluate(target.notes,target,'exact').exact,true);
        assert.equal(evaluate(target.notes.map(note => note - 12),target).exact,true);
        assert.equal(new Set(target.notes.map(note => note % 12)).size,target.notes.length);
      }
    }
  }
  const sharpBoundary = createTarget(box.Tonal,0,'minor',0,'','B#');
  assert.deepEqual(sharpBoundary.noteNames.map(name => box.Tonal.Note.midi(name)),sharpBoundary.notes);
});
test('difficulty unlocks cumulative categories and balanced mixed decks; specific quality and voicing remain selectable', () => {
  let previous = [];
  for (let level = 1; level <= 5; level++) {
    const types = availableTypes(level);
    assert.ok(types.length > previous.length);
    assert.ok(previous.every(type => types.includes(type)));
    const deck = createDeck(box.Tonal,{level,plan:'mixed',count:types.length,key:'all'});
    assert.deepEqual([...new Set(deck.map(target => target.quality))].sort(),[...types].sort());
    previous = types;
  }
  for (const [plan,item] of Object.entries(categories)) {
    const deck = createDeck(box.Tonal,{plan,level:item.level,count:item.types.length*6,voicing:'mixed'});
    assert.ok(deck.every(target => item.types.includes(target.quality)));
    assert.ok(deck.every(target => target.requireBass));
  }
  const deck = createDeck(box.Tonal,{level:5,plan:'alteredDominant',quality:'sharp9',voicing:'2',octave:4,count:12});
  assert.ok(deck.every(target => target.quality === 'sharp9' && target.inversion === 2 && target.notes[0] >= 60));
});
test('hint timing excludes pauses, survives retries and resets only when the next question is ready', () => {
  const session = new Session([C,C],{holdMs:100});
  session.start(0); session.update([],0);
  assert.equal(session.hintDue(999,1000),false);
  assert.equal(session.hintDue(1000,1000),true);
  session.update([49],300);session.update([],400);
  session.pause(500);
  assert.equal(session.hintDue(9999,1000),false);
  session.resume(10000);session.update([],10000);
  assert.equal(session.hintDue(10499,1000),false);
  assert.equal(session.hintDue(10500,1000),true);
  session.update(C.notes,10600);
  assert.equal(session.hintDue(10650,1000),false,'matching hold does not need hints');
  session.update(C.notes,10700);
  assert.equal(session.hintDue(12000,1000),false,'release gate hides hints');
  session.update([],13000);
  assert.equal(session.index,1);
  assert.equal(session.hintDue(13999,1000),false);
  assert.equal(session.hintDue(14000,1000),true);
  session.finish(14000);
  assert.equal(session.hintDue(15000,0),false);
});
test('18 progression templates transpose with correct note spelling and smooth voicing stays playable', () => {
  assert.equal(Object.keys(progressions).length,18);
  for (const [progression,item] of Object.entries(progressions)) for (let key = 0; key < 12; key++) {
    for (const voiceLeading of ['root','smooth']) {
      const targets = createDeck(box.Tonal,{mode:'progression',progression,key,voiceLeading,count:item.steps.length});
      for (const target of targets) {
        assert.deepEqual(target.noteNames.map(name=>box.Tonal.Note.midi(name)),target.notes,progression);
        assert.ok(target.notes.every((note,i)=>note>=36 && note<=90 && (!i || note>target.notes[i-1])));
        assert.equal(evaluate(target.notes,target,'exact').exact,true);
      }
      assert.equal(targets[0].roman,item.steps[0][2]);
    }
  }
  assert.deepEqual(createDeck(box.Tonal,{mode:'progression',progression:'minor-cadence',key:0,count:3}).map(item=>item.symbol),['Dm7b5','G7','Cm6']);
});
test('connected progression preserves common tones and requires a change before repeating the same target', () => {
  const next = createTarget(box.Tonal,0,'maj7');
  const session = new Session([C,next,next],{holdMs:100,transition:'connected'});
  session.start(0);session.update([],0);session.update(C.notes,1);session.update(C.notes,101);
  assert.equal(session.correct,1);
  session.update(C.notes,1000);
  assert.equal(session.index,0,'holding identical notes cannot advance or score twice');
  session.update(next.notes,1001);
  assert.equal(session.index,1);
  session.update(next.notes,1002);session.update(next.notes,1102);
  assert.equal(session.correct,2);
  session.update(next.notes,5000);
  assert.equal(session.index,1);
  session.update(next.notes.slice(0,-1),5001);
  assert.equal(session.index,2);
  session.update(next.notes,5002);session.update(next.notes,5102);session.update([],5103);
  assert.equal(session.correct,3);
  assert.equal(session.state,'done');
});
