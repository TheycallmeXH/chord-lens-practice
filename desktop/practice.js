(function (scope) {
  'use strict';
  const mod = n => ((n % 12) + 12) % 12;
  const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const qualities = {
    major: { suffix: '', name: '大三和弦' },
    minor: { suffix: 'm', name: '小三和弦' },
    dim: { suffix: 'dim', name: '减三和弦' },
    aug: { suffix: 'aug', name: '增三和弦' },
    sus2: { suffix: 'sus2', name: '挂二和弦' },
    sus4: { suffix: 'sus4', name: '挂四和弦' },
    sixth: { suffix: '6', name: '大六和弦' },
    m6: { suffix: 'm6', name: '小六和弦' },
    add9: { suffix: 'add9', name: '大三加九和弦' },
    madd9: { suffix: 'madd9', name: '小三加九和弦' },
    maj7: { suffix: 'maj7', name: '大七和弦' },
    m7: { suffix: 'm7', name: '小七和弦' },
    dom7: { suffix: '7', name: '属七和弦' },
    halfDim: { suffix: 'm7b5', name: '半减七和弦' },
    dim7: { suffix: 'dim7', name: '减七和弦' },
    minorMajor: { suffix: 'mMaj7', name: '小大七和弦' },
    sus7: { suffix: '7sus4', name: '属七挂四和弦' },
    maj9: { suffix: 'maj9', name: '大九和弦' },
    m9: { suffix: 'm9', name: '小九和弦' },
    dom9: { suffix: '9', name: '属九和弦' },
    dom11: { suffix: '11', name: '属十一和弦' },
    m11: { suffix: 'm11', name: '小十一和弦' },
    maj13: { suffix: 'maj13', name: '大十三和弦' },
    m13: { suffix: 'm13', name: '小十三和弦' },
    dom13: { suffix: '13', name: '属十三和弦' },
    flat9: { suffix: '7b9', name: '属七降九和弦' },
    sharp9: { suffix: '7#9', name: '属七升九和弦' },
    flat5: { suffix: '7b5', name: '属七降五和弦' },
    sharp5: { suffix: '7#5', name: '属七升五和弦' },
    sharp11: { suffix: '7#11', name: '属七升十一和弦' },
    augMajor: { suffix: 'maj7#5', name: '大七升五和弦' },
    lydian: { suffix: 'maj7#11', name: '大七升十一和弦' }
  };
  const levels = ['入门 · 三和弦', '基础 · 色彩和弦', '进阶 · 七和弦', '提高 · 扩展和弦', '挑战 · 变化和弦'];
  const categories = {
    triads: { name: '大小三和弦', level: 1, types: ['major', 'minor'] },
    alteredTriads: { name: '减 / 增三和弦', level: 2, types: ['dim', 'aug'] },
    suspended: { name: '挂二 / 挂四', level: 2, types: ['sus2', 'sus4'] },
    sixths: { name: '大六 / 小六', level: 2, types: ['sixth', 'm6'] },
    added: { name: '加九和弦', level: 2, types: ['add9', 'madd9'] },
    inversions: { name: '三和弦转位', level: 2, types: ['major', 'minor'] },
    sevenths: { name: '大七 / 小七 / 属七', level: 3, types: ['maj7', 'm7', 'dom7'] },
    diminished: { name: '半减七 / 减七', level: 3, types: ['halfDim', 'dim7'] },
    minorMajor: { name: '小大七', level: 3, types: ['minorMajor'] },
    suspended7: { name: '属七挂四', level: 3, types: ['sus7'] },
    ninths: { name: '大九 / 小九 / 属九', level: 4, types: ['maj9', 'm9', 'dom9'] },
    elevenths: { name: '小十一 / 属十一', level: 4, types: ['m11', 'dom11'] },
    thirteenths: { name: '大十三 / 小十三 / 属十三', level: 4, types: ['maj13', 'm13', 'dom13'] },
    alteredDominant: { name: '属七变化音', level: 5, types: ['flat9', 'sharp9', 'flat5', 'sharp5', 'sharp11'] },
    alteredMajor: { name: '大七变化音', level: 5, types: ['augMajor', 'lydian'] }
  };
  const progressions = {
    'ii-V-I': { name:'ii7 – V7 – Imaj7', group:'爵士', steps:[['2M','m7','ii7'],['5P','dom7','V7'],['1P','maj7','Imaj7']] },
    'I-vi-IV-V': { name:'I – vi – IV – V7', group:'流行', steps:[['1P','major','I'],['6M','minor','vi'],['4P','major','IV'],['5P','dom7','V7']] },
    'I-IV-V-I': { name:'I – IV – V – I', group:'流行', steps:[['1P','major','I'],['4P','major','IV'],['5P','major','V'],['1P','major','I']] },
    'I-V-vi-IV': { name:'I – V – vi – IV', group:'流行', steps:[['1P','major','I'],['5P','major','V'],['6M','minor','vi'],['4P','major','IV']] },
    'vi-IV-I-V': { name:'vi – IV – I – V', group:'流行', steps:[['6M','minor','vi'],['4P','major','IV'],['1P','major','I'],['5P','major','V']] },
    'I-V-ii-IV': { name:'I – V – ii – IV', group:'流行', steps:[['1P','major','I'],['5P','major','V'],['2M','minor','ii'],['4P','major','IV']] },
    'minor-cadence': { name:'iiø7 – V7 – i6', group:'小调', steps:[['2M','halfDim','iiø7'],['5P','dom7','V7'],['1P','m6','i6']] },
    'i-VI-III-VII': { name:'i – ♭VI – ♭III – ♭VII', group:'小调', steps:[['1P','minor','i'],['6m','major','♭VI'],['3m','major','♭III'],['7m','major','♭VII']] },
    'i-iv-V-i': { name:'i – iv – V7 – i', group:'小调', steps:[['1P','minor','i'],['4P','minor','iv'],['5P','dom7','V7'],['1P','minor','i']] },
    'andalusian': { name:'i – ♭VII – ♭VI – V7', group:'小调', steps:[['1P','minor','i'],['7m','major','♭VII'],['6m','major','♭VI'],['5P','dom7','V7']] },
    'turnaround': { name:'Imaj7 – vi7 – ii7 – V7', group:'爵士', steps:[['1P','maj7','Imaj7'],['6M','m7','vi7'],['2M','m7','ii7'],['5P','dom7','V7']] },
    'secondary-dominant': { name:'Imaj7 – VI7 – ii7 – V7', group:'爵士', steps:[['1P','maj7','Imaj7'],['6M','dom7','VI7'],['2M','m7','ii7'],['5P','dom7','V7']] },
    'backdoor': { name:'iv7 – ♭VII7 – Imaj7', group:'爵士', steps:[['4P','m7','iv7'],['7m','dom7','♭VII7'],['1P','maj7','Imaj7']] },
    'tritone': { name:'ii7 – ♭II7 – Imaj7', group:'爵士', steps:[['2M','m7','ii7'],['2m','dom7','♭II7'],['1P','maj7','Imaj7']] },
    'diatonic-fifths': { name:'顺阶五度循环', group:'爵士', steps:[['3M','m7','iii7'],['6M','m7','vi7'],['2M','m7','ii7'],['5P','dom7','V7'],['1P','maj7','Imaj7'],['4P','maj7','IVmaj7'],['7M','halfDim','viiø7']] },
    'dorian': { name:'i7 – IV7 · Dorian', group:'调式', steps:[['1P','m7','i7'],['4P','dom7','IV7']] },
    'blues': { name:'十二小节蓝调', group:'蓝调', steps:[['1P','dom7','I7'],['1P','dom7','I7'],['1P','dom7','I7'],['1P','dom7','I7'],['4P','dom7','IV7'],['4P','dom7','IV7'],['1P','dom7','I7'],['1P','dom7','I7'],['5P','dom7','V7'],['4P','dom7','IV7'],['1P','dom7','I7'],['5P','dom7','V7']] },
    'jazz-blues': { name:'十二小节爵士蓝调', group:'蓝调', steps:[['1P','dom7','I7'],['4P','dom7','IV7'],['1P','dom7','I7'],['1P','dom7','I7'],['4P','dom7','IV7'],['4A','dim7','♯iv°7'],['1P','dom7','I7'],['6M','dom7','VI7'],['2M','m7','ii7'],['5P','dom7','V7'],['1P','dom7','I7'],['5P','dom7','V7']] }
  };
  function availableTypes(level = 1) {
    return [...new Set(Object.values(categories).filter(item => item.level <= level).flatMap(item => item.types))];
  }
  function shuffle(list, random = Math.random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function createTarget(tonal, root, quality, inversion = 0, roman = '', spelling, octave = 3) {
    const shape = qualities[quality], rootName = spelling || roots[mod(root)];
    const intervals = [...tonal.ChordType.get(shape.suffix || 'major').intervals];
    const names = intervals.map(interval => tonal.Note.transpose(rootName, interval));
    const notes = intervals.map(interval => (octave + 1) * 12 + mod(root) + tonal.Interval.semitones(interval));
    // B# and Cb spellings can cross the written octave boundary.
    const rootOctave = octave + (mod(root) - tonal.Note.midi(rootName + octave) + (octave + 1) * 12) / 12;
    const noteNames = intervals.map(interval => tonal.Note.transpose(rootName + rootOctave, interval));
    inversion = Math.max(0, Math.min(notes.length - 1, Math.trunc(inversion)));
    for (let i = 0; i < inversion; i++) {
      let lifted = notes.shift(), name = noteNames.shift();
      do { lifted += 12; name = tonal.Note.transpose(name, '8P'); } while (lifted <= notes.at(-1));
      notes.push(lifted); noteNames.push(name);
    }
    return {
      root: mod(root), quality, inversion, roman,
      symbol: rootName + shape.suffix + (inversion ? '/' + names[inversion] : ''),
      name: shape.name, notes, noteNames, spellings: names, intervals,
      bass: notes[0], requireBass: inversion > 0
    };
  }
  function createDeck(tonal, { mode = 'chords', plan = 'triads', level = 5, quality = 'all', voicing = 'root',
    octave = 3, key = 'all', count = 12, progression = 'ii-V-I', voiceLeading = 'root' } = {}, random = Math.random) {
    if (mode === 'progression') {
      const tonic = key === 'all' ? 0 : Number(key);
      const steps = (progressions[progression] || progressions['ii-V-I']).steps;
      const targets = Array.from({ length: count }, (_, i) => {
        const [interval, type, roman] = steps[i % steps.length];
        return createTarget(tonal, tonic + tonal.Interval.semitones(interval), type, 0, roman, tonal.Note.transpose(roots[mod(tonic)], interval), octave);
      });
      if (voiceLeading === 'smooth') for (let i = 1; i < targets.length; i++) {
        const original = targets[i], previous = targets[i-1].notes, candidates = [];
        for (let inversion = 0; inversion < original.notes.length; inversion++) for (const shift of [-1,0,1]) {
          const target = createTarget(tonal,original.root,original.quality,inversion,original.roman,original.spellings[0],octave + shift);
          if (target.notes[0] < (octave + 1) * 12 - 12 || target.notes.at(-1) > (octave + 1) * 12 + 30) continue;
          const distance = (a,b) => a.reduce((sum,n) => sum + Math.min(...b.map(m => Math.abs(n-m))),0);
          candidates.push({target,score:distance(target.notes,previous)+distance(previous,target.notes)+Math.abs(target.bass-previous[0])*.25});
        }
        candidates.sort((a,b) => a.score-b.score);
        targets[i] = candidates[0]?.target || original;
        targets[i].requireBass = true;
      }
      return targets;
    }
    const eligible = availableTypes(level);
    const types = plan === 'mixed' ? eligible : (categories[plan]?.types || categories.triads.types).filter(type => eligible.includes(type));
    if (!types.length) types.push(...categories.triads.types);
    const selected = types.includes(quality) ? [quality] : types;
    const pool = key === 'all' ? shuffle(Array.from({ length: 12 }, (_, i) => i), random) : [Number(key)];
    let typePool = [];
    return Array.from({ length: count }, (_, i) => {
      const root = pool[i % pool.length];
      if (!typePool.length) typePool = shuffle(selected, random);
      const type = typePool.pop(), size = tonal.ChordType.get(qualities[type].suffix || 'major').intervals.length;
      const inversion = plan === 'inversions' ? i % 3 : voicing === 'mixed' ? i % size : Math.min(Number(voicing) || 0, size - 1);
      const target = createTarget(tonal, root, type, inversion, '', undefined, octave);
      if (plan === 'inversions' || voicing !== 'root') target.requireBass = true;
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
    constructor(deck, { rule = 'pitch', holdMs = 350, transition = 'release' } = {}) {
      this.deck = deck; this.rule = rule; this.holdMs = holdMs;
      this.state = 'idle'; this.index = 0; this.correct = 0; this.wrong = 0; this.skipped = 0;
      this.streak = 0; this.bestStreak = 0; this.attempts = [];
      this.accumulated = 0; this.questionStart = null; this.waiting = 'ready'; this.resetAttempt();
      this.transition = transition; this.acceptedNotes = '';
    }
    get target() { return this.deck[Math.min(this.index, this.deck.length - 1)]; }
    get accuracy() { const n = this.correct + this.wrong + this.skipped; return n ? this.correct / n : null; }
    elapsed(now) { return this.accumulated + (this.state === 'running' ? now - this.segmentStart : 0); }
    start(now) { this.state = 'running'; this.segmentStart = now; }
    hintDue(now, delayMs) {
      return this.state === 'running' && !this.waiting && this.matchedSince === null &&
        this.questionStart !== null && this.elapsed(now) - this.questionStart >= delayMs;
    }
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
        const connected = this.waiting === 'advance' && this.transition === 'connected' &&
          [...new Set(notes)].sort((a,b)=>a-b).join(',') !== this.acceptedNotes;
        if (notes.length && !connected) return 'release';
        if (this.waiting === 'advance') {
          this.index++;
          this.questionStart = null;
          if (this.index >= this.deck.length) { this.finish(now); return 'finished'; }
        }
        this.waiting = ''; this.resetAttempt();
        if (this.questionStart === null) this.questionStart = this.elapsed(now);
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
      this.acceptedNotes = [...new Set(notes)].sort((a,b)=>a-b).join(',');
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
  scope.PianoPractice = { qualities, categories, levels, progressions, availableTypes, createTarget, createDeck, evaluate, Session };
  if (typeof module !== 'undefined') module.exports = scope.PianoPractice;
})(globalThis);
