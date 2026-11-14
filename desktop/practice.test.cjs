const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');
const box = {};
vm.runInNewContext(fs.readFileSync(join(__dirname, '../midi-chords/vendor/tonal.min.js'), 'utf8'), box);
const { createTarget, createDeck, evaluate, Session } = require('./practice.js');
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
