(function (scope) {
  'use strict';
  const mod = n => ((n % 12) + 12) % 12;
  const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const qualities = {
    major: { suffix: '', intervals: ['1P', '3M', '5P'], name: '大三和弦' },
    minor: { suffix: 'm', intervals: ['1P', '3m', '5P'], name: '小三和弦' },
    maj7: { suffix: 'maj7', intervals: ['1P', '3M', '5P', '7M'], name: '大七和弦' },
    m7: { suffix: 'm7', intervals: ['1P', '3m', '5P', '7m'], name: '小七和弦' },
    dom7: { suffix: '7', intervals: ['1P', '3M', '5P', '7m'], name: '属七和弦' }
  };
  function shuffle(list, random = Math.random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function createTarget(tonal, root, quality, inversion = 0, roman = '', spelling) {
    const shape = qualities[quality], rootName = spelling || roots[mod(root)];
    const names = shape.intervals.map(interval => tonal.Note.transpose(rootName, interval));
    const notes = shape.intervals.map(interval => 48 + mod(root) + tonal.Interval.semitones(interval));
    const noteNames = shape.intervals.map(interval => tonal.Note.transpose(rootName + '3', interval));
    for (let i = 0; i < inversion; i++) {
      notes.push(notes.shift() + 12);
      noteNames.push(tonal.Note.transpose(noteNames.shift(), '8P'));
    }
    return {
      root: mod(root), quality, inversion, roman,
      symbol: rootName + shape.suffix + (inversion ? '/' + names[inversion] : ''),
      name: shape.name, notes, noteNames, spellings: names, intervals: shape.intervals,
      bass: notes[0], requireBass: inversion > 0
    };
  }
  function createDeck(tonal, { mode = 'chords', plan = 'triads', key = 'all', count = 12, progression = 'ii-V-I' } = {}, random = Math.random) {
    if (mode === 'progression') {
      const tonic = key === 'all' ? 0 : Number(key);
      const steps = progression === 'I-vi-IV-V'
        ? [[0, 'major', 'I', '1P'], [9, 'minor', 'vi', '6M'], [5, 'major', 'IV', '4P'], [7, 'dom7', 'V7', '5P']]
        : [[2, 'm7', 'ii7', '2M'], [7, 'dom7', 'V7', '5P'], [0, 'maj7', 'Imaj7', '1P']];
      return Array.from({ length: count }, (_, i) => {
        const [offset, type, roman, interval] = steps[i % steps.length];
        return createTarget(tonal, tonic + offset, type, 0, roman, tonal.Note.transpose(roots[mod(tonic)], interval));
      });
    }
    const types = plan === 'sevenths' ? ['maj7', 'm7', 'dom7'] : ['major', 'minor'];
    const pool = key === 'all' ? shuffle(Array.from({ length: 12 }, (_, i) => i), random) : [Number(key)];
    return Array.from({ length: count }, (_, i) => {
      const root = pool[i % pool.length];
      const type = types[Math.floor(random() * types.length)];
      const inversion = plan === 'inversions' ? i % 3 : 0;
      const target = createTarget(tonal, root, type, inversion);
      if (plan === 'inversions') target.requireBass = true;
      return target;
    });
  }
  function evaluate(notes, target, rule = 'pitch') {
    const values = [...new Set(notes)].sort((a, b) => a - b);
    const wanted = rule === 'exact' ? target.notes : [...new Set(target.notes.map(mod))];
    const actual = rule === 'exact' ? values : [...new Set(values.map(mod))];
    const missing = wanted.filter(note => !actual.includes(note));
    const extra = actual.filter(note => !wanted.includes(note));
    const bassWrong = rule !== 'exact' && target.requireBass && values.length > 0 && mod(values[0]) !== mod(target.bass);
    return { exact: values.length > 0 && !missing.length && !extra.length && !bassWrong, missing, extra, bassWrong };
  }
  class Session {
    constructor(deck, { rule = 'pitch', holdMs = 350 } = {}) {
      this.deck = deck; this.rule = rule; this.holdMs = holdMs;
      this.state = 'idle'; this.index = 0; this.correct = 0; this.wrong = 0; this.skipped = 0;
      this.streak = 0; this.bestStreak = 0; this.attempts = [];
      this.accumulated = 0; this.waiting = 'ready'; this.resetAttempt();
    }
    get target() { return this.deck[Math.min(this.index, this.deck.length - 1)]; }
    get accuracy() { const n = this.correct + this.wrong + this.skipped; return n ? this.correct / n : null; }
    elapsed(now) { return this.accumulated + (this.state === 'running' ? now - this.segmentStart : 0); }
    start(now) { this.state = 'running'; this.segmentStart = now; }
    resetAttempt() { this.hadNotes = false; this.trialStart = null; this.matchedSince = null; this.feedback = null; }
    record(result, now) {
      this.attempts.push({
        target: this.target.symbol, notes: [...this.target.notes], result,
        elapsedMs: Math.round(this.elapsed(now)),
        formationMs: result === 'correct' ? Math.max(0, Math.round(this.matchedSince - this.trialStart)) : null
      });
      this.resetAttempt();
    }
    update(notes, now) {
      if (this.state !== 'running') return '';
      if (this.waiting) {
        if (notes.length) return 'release';
        if (this.waiting === 'advance') {
          this.index++;
          if (this.index >= this.deck.length) { this.finish(now); return 'finished'; }
        }
        this.waiting = ''; this.resetAttempt();
        return 'ready';
      }
      if (!notes.length) {
        if (this.hadNotes) {
          this.wrong++; this.streak = 0; this.record('wrong', now);
          return 'wrong';
        }
        return '';
      }
      this.hadNotes = true;
      if (this.trialStart === null) this.trialStart = now;
      this.feedback = evaluate(notes, this.target, this.rule);
      if (!this.feedback.exact) { this.matchedSince = null; return 'playing'; }
      if (this.matchedSince === null) this.matchedSince = now;
      if (now - this.matchedSince < this.holdMs) return 'holding';
      this.correct++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.record('correct', now); this.waiting = 'advance';
      return 'correct';
    }
    skip(notes, now) {
      if (this.state !== 'running' || this.waiting === 'advance') return '';
      this.skipped++; this.streak = 0; this.record('skipped', now); this.waiting = 'advance';
      return this.update(notes, now);
    }
    pause(now) {
      if (this.state !== 'running') return;
      this.accumulated = this.elapsed(now); this.state = 'paused';
      if (this.waiting !== 'advance') { this.waiting = 'ready'; this.resetAttempt(); }
    }
    resume(now) { if (this.state === 'paused') { this.state = 'running'; this.segmentStart = now; } }
    finish(now) { this.accumulated = this.elapsed(now); this.state = 'done'; }
    cancelAttempt() { this.resetAttempt(); if (this.waiting !== 'advance') this.waiting = 'ready'; }
  }
  scope.PianoPractice = { createTarget, createDeck, evaluate, Session };
  if (typeof module !== 'undefined') module.exports = scope.PianoPractice;
})(globalThis);
