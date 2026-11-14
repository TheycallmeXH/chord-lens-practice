/* Chord naming uses the MIT-licensed Tonal dictionary, vendored alongside this file. */
(function (scope) {
  'use strict';
  const mod = n => ((n % 12) + 12) % 12;
  const sharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const smart = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const pretty = s => String(s).replace(/#/g, '♯').replace(/b/g, '♭');
  function pitchName(pc, preference = 'auto') {
    return (preference === 'sharp' ? sharp : preference === 'flat' ? flat : smart)[mod(pc)];
  }
  function noteName(midi, preference = 'auto') {
    return pretty(pitchName(midi, preference)) + (Math.floor(midi / 12) - 1);
  }
  const typeNames = {
    major: '大三和弦', minor: '小三和弦', fifth: '五度和弦',
    diminished: '减三和弦', augmented: '增三和弦',
    'major seventh': '大七和弦', 'minor seventh': '小七和弦',
    'dominant seventh': '属七和弦', 'diminished seventh': '减七和弦',
    'half-diminished': '半减七和弦', 'minor/major seventh': '小大七和弦',
    sixth: '大六和弦', 'major sixth': '大六和弦', 'minor sixth': '小六和弦',
    'sixth added ninth': '六九和弦', 'minor augmented': '小三增五和弦',
    'suspended second': '挂二和弦', 'suspended fourth': '挂四和弦',
    'major ninth': '大九和弦', 'minor ninth': '小九和弦',
    'dominant ninth': '属九和弦', 'dominant thirteenth': '属十三和弦',
    'minor eleventh': '小十一和弦', 'major thirteenth': '大十三和弦',
    'major eleventh': '大十一和弦', 'minor thirteenth': '小十三和弦',
    'dominant flat ninth': '属七降九和弦', 'dominant sharp ninth': '属七升九和弦',
    'lydian dominant seventh': '属七升十一和弦', 'suspended fourth seventh': '属七挂四和弦',
    'minor/major ninth': '小大九和弦', 'augmented seventh': '增大七和弦',
    'seventh augmented fifth': '属七增五和弦', 'major sharp eleventh (lydian)': '大九升十一和弦',
    eleventh: '属十一和弦', altered: '变化属七和弦'
  };
  const intervalNames = {
    '1P': ['1', '根音'], '2m': ['♭2', '小二度'], '2M': ['2', '大二度'],
    '3m': ['♭3', '小三度'], '3M': ['3', '大三度'], '4P': ['4', '纯四度'],
    '4A': ['♯4', '增四度'], '5d': ['♭5', '减五度'], '5P': ['5', '纯五度'],
    '5A': ['♯5', '增五度'], '6m': ['♭6', '小六度'], '6M': ['6', '大六度'],
    '7d': ['♭♭7', '减七度'], '7m': ['♭7', '小七度'], '7M': ['7', '大七度'],
    '9m': ['♭9', '小九度'], '9M': ['9', '大九度'], '9A': ['♯9', '增九度'],
    '10m': ['♭10', '小十度'],
    '11P': ['11', '纯十一度'], '11A': ['♯11', '增十一度'],
    '13m': ['♭13', '小十三度'], '13M': ['13', '大十三度']
  };
  class MidiState {
    constructor() { this.channels = new Map(); }
    channel(source, channel) {
      const key = `${source}:${channel}`;
      if (!this.channels.has(key)) this.channels.set(key, { source, channel, sustain: false, sostenuto: false, voices: new Map() });
      return this.channels.get(key);
    }
    message(source, data) {
      if (!data || data.length < 3 || data[0] < 128 || data[0] > 239) return false;
      const command = data[0] & 240, number = data[1], value = data[2];
      if (![128, 144, 176].includes(command) || number > 127 || value > 127) return false;
      const state = this.channel(source, data[0] & 15);
      if (command === 144 && value > 0) {
        const previous = state.voices.get(number);
        state.voices.set(number, { held: (previous?.held || 0) + 1, sustained: false, latched: previous?.latched || false, velocity: value });
      } else if (command === 128 || command === 144) {
        const voice = state.voices.get(number);
        if (voice) { voice.held = Math.max(0, voice.held - 1); if (!voice.held) voice.sustained = state.sustain; }
      } else if (number === 64) {
        state.sustain = value >= 64;
        state.voices.forEach(voice => { if (!state.sustain) voice.sustained = false; else if (!voice.held) voice.sustained = true; });
      } else if (number === 66) {
        const down = value >= 64;
        if (down && !state.sostenuto) state.voices.forEach(voice => { if (voice.held) voice.latched = true; });
        if (!down) state.voices.forEach(voice => { voice.latched = false; });
        state.sostenuto = down;
      } else if (number === 120) {
        state.voices.clear();
      } else if (number === 123 || number >= 124 && number <= 127) {
        state.voices.forEach(voice => { voice.held = 0; voice.sustained = state.sustain; });
      } else if (number === 121) {
        state.sustain = state.sostenuto = false;
        state.voices.forEach(voice => { voice.sustained = voice.latched = false; });
      } else return false;
      state.voices.forEach((voice, key) => { if (!voice.held && !voice.sustained && !voice.latched) state.voices.delete(key); });
      return true;
    }
    clear(source) {
      if (source === undefined) this.channels.clear();
      else this.channels.forEach((state, key) => { if (state.source === source) this.channels.delete(key); });
    }
    notes(includePedal = true) {
      const result = new Map();
      this.channels.forEach(state => state.voices.forEach((voice, midi) => {
        if (!voice.held && !includePedal) return;
        const entry = result.get(midi) || { midi, held: false, velocity: 0, sources: [] };
        entry.held ||= voice.held > 0;
        entry.velocity = Math.max(entry.velocity, voice.velocity);
        entry.sources.push(state.source);
        result.set(midi, entry);
      }));
      return [...result.values()].sort((a, b) => a.midi - b.midi);
    }
    pedals() {
      return [...this.channels.values()].reduce((out, channel) => ({
        sustain: out.sustain || channel.sustain, sostenuto: out.sostenuto || channel.sostenuto
      }), { sustain: false, sostenuto: false });
    }
  }
  function createRecognizer(tonal) {
    if (!tonal?.ChordType) throw new Error('乐理字典未加载');
    const specialAliases = { major: '', minor: 'm', diminished: 'dim', augmented: 'aug' };
    const templates = tonal.ChordType.all().filter(type => type.intervals.length >= 2).map(type => ({
      ...type, suffix: specialAliases[type.name] ?? type.aliases[0],
      pitches: type.intervals.map(interval => mod(tonal.Interval.semitones(interval)))
    }));
    function candidate(type, root, bass, pcs, preference, missing) {
      const rootName = pitchName(root, preference);
      const spellings = type.intervals.map(interval => tonal.Note.transpose(rootName, interval));
      const bassIndex = type.pitches.indexOf(mod(bass - root));
      const bassName = bassIndex >= 0 ? spellings[bassIndex] : pitchName(bass, preference);
      const symbol = pretty(rootName + type.suffix + (mod(bass) !== root ? '/' + bassName : ''));
      let rank = (mod(bass) === root ? .8 : 0) - type.intervals.length * .025;
      if (type.name) rank += .3;
      if (['major', 'minor', 'major seventh', 'minor seventh', 'dominant seventh', 'sixth', 'minor sixth', 'major ninth', 'minor ninth', 'dominant ninth', 'suspended fourth', 'suspended second', 'diminished seventh', 'half-diminished'].includes(type.name)) rank += 1.6;
      if (type.suffix.includes('no') || type.suffix.includes('omit')) rank -= .7;
      rank -= missing.length * 3;
      const complete = missing.length === 0;
      return {
        id: `${root}:${type.suffix}:${missing.join(',')}`, symbol, root, rootName,
        bass, bassName: pretty(bassName), type: type.name || type.suffix, chinese: typeNames[type.name] || `色彩和弦 ${pretty(type.suffix)}`,
        suffix: type.suffix, quality: type.quality, intervals: [...type.intervals],
        spellings, pitches: type.pitches.map(pc => mod(root + pc)),
        missing, complete, rank,
        inversion: missing.includes(root) ? '无根音配置' : mod(bass) === root ? '根位' : bassIndex >= 0 && bassIndex <= 3 ? ['根位', '第一转位', '第二转位', '第三转位'][bassIndex] : '延伸音作低音',
        evidence: complete ? '音集完全匹配' : `省略${missing.map(pc => pc === root ? '根音' : '五音').join('、')}的推测`
      };
    }
    function analyze(input, options = {}) {
      const midis = [...new Set(input.map(note => typeof note === 'number' ? note : note.midi))].filter(n => Number.isInteger(n) && n >= 0 && n <= 127).sort((a, b) => a - b);
      const pcs = [...new Set(midis.map(mod))].sort((a, b) => a - b);
      const result = { midis, pcs, bass: midis[0], candidates: [], inferred: [], kind: pcs.length === 0 ? 'empty' : pcs.length === 1 ? 'single' : 'unmatched' };
      if (pcs.length < 2) return result;
      const seen = new Set();
      for (let root = 0; root < 12; root++) {
        const relative = pcs.map(pc => mod(pc - root));
        for (const type of templates) {
          if (relative.some(pc => !type.pitches.includes(pc))) continue;
          const absent = type.pitches.filter(pc => !relative.includes(pc));
          const exact = absent.length === 0;
          const seventh = type.intervals.some(i => ['7M', '7m'].includes(i));
          const third = type.intervals.some(i => ['3M', '3m'].includes(i));
          const omissionsAllowed = options.omissions !== false && pcs.length >= 3 && third && seventh;
          if (!exact && (!omissionsAllowed || absent.some(pc => pc !== 0 && !(pc === 7 && type.intervals.includes('5P'))) || absent.includes(0) && !options.rootless)) continue;
          if (absent.length > 2) continue;
          const missing = absent.map(pc => mod(root + pc));
          const item = candidate(type, root, midis[0], pcs, options.spelling || 'auto', missing);
          const signature = `${root}:${item.pitches.join(',')}:${item.missing.join(',')}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
          (exact ? result.candidates : result.inferred).push(item);
        }
      }
      result.candidates.sort((a, b) => b.rank - a.rank || a.symbol.localeCompare(b.symbol));
      result.inferred.sort((a, b) => b.rank - a.rank || a.symbol.localeCompare(b.symbol));
      result.kind = result.candidates.length ? 'chord' : result.inferred.length ? 'inferred' : pcs.length === 2 ? 'dyad' : 'unmatched';
      return result;
    }
    function describeNote(midi, chord, preference = 'auto', tuning = 440) {
      const index = chord?.pitches.indexOf(mod(midi)) ?? -1;
      const spelling = index >= 0 ? chord.spellings[index] : pitchName(midi, preference);
      const octave = Math.round((midi - tonal.Note.chroma(spelling)) / 12) - 1;
      // Cb and B# cross scientific-pitch octave boundaries.
      const accidentalOffset = tonal.Note.get(spelling).step === 0 && spelling.includes('b') ? 1
        : tonal.Note.get(spelling).step === 6 && spelling.includes('#') ? -1 : 0;
      const interval = index >= 0 ? chord.intervals[index] : '';
      const degree = intervalNames[interval] || [interval || '—', chord ? '和弦外音' : '实际输入'];
      return { midi, name: pretty(spelling) + (octave + accidentalOffset), pitch: pretty(spelling), interval, degree: degree[0], role: degree[1], frequency: tuning * 2 ** ((midi - 69) / 12) };
    }
    function describeInterval(from, to, chord, preference = 'auto') {
      const lower = describeNote(from, chord, preference).name;
      const upper = describeNote(to, chord, preference).name;
      const ascii = name => name.replace(/♯/g, '#').replace(/♭/g, 'b');
      let interval = tonal.Interval.get(tonal.Interval.distance(ascii(lower), ascii(upper)));
      const semitones = to - from;
      if (interval.empty || interval.semitones !== semitones) interval = tonal.Interval.get(tonal.Interval.fromSemitones(semitones));
      const qualities = { P: '纯', M: '大', m: '小', A: '增', AA: '倍增', d: '减', dd: '倍减' };
      const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      const number = Math.abs(interval.num);
      const numeral = number < 10 ? digits[number] : `${number >= 20 ? digits[Math.floor(number / 10)] : ''}十${digits[number % 10]}`;
      return {
        from, to, lower, upper, semitones, interval: interval.name,
        label: `${qualities[interval.q] || interval.q}${numeral}度`
      };
    }
    return { analyze, describeNote, describeInterval, templates };
  }
  function emotion(chord) {
    if (!chord) return { tags: [], title: '等待和声', text: '识别到和弦后，显示常见听感与和声色彩。', context: '' };
    const ints = chord.intervals;
    let data;
    if (ints.includes('5d')) data = ['紧绷的悬念', ['紧张', '不稳定', '期待移动'], '减五度带来不稳定色彩；减七和弦具有对称结构，根音判断尤其依赖前后和声。'];
    else if (ints.includes('5A')) data = ['悬浮的张力', ['悬浮', '暧昧', '不稳定'], '增五度削弱通常的大、小三和弦稳定感；相同音集可能对应多个根音。'];
    else if (ints.includes('4P') && !ints.includes('3M') && !ints.includes('3m') || ints.includes('2M') && !ints.includes('3M') && !ints.includes('3m')) data = ['开放，尚未定色', ['开放', '悬置', '中性'], '缺少决定大小性质的三音；挂留的解决方向需要从进行中判断。'];
    else if (ints.includes('3m') && ints.includes('7M')) data = ['内省中的不安', ['内省', '复杂', '紧张'], '小三度与大七度并置，可产生内向、悬疑的色彩；这是常见描述，并非普遍情绪结论。'];
    else if (ints.includes('3M') && ints.includes('7m')) data = ['有方向的张力', ['活跃', '期待', '张力'], '三音与小七音构成三全音；在调性语境中常产生趋向解决的感觉，也可能作为稳定的蓝调色彩。'];
    else if (ints.includes('3M') && ints.includes('7M')) data = ['明亮中的细腻', ['明亮', '柔和', '复杂'], '大三和弦保留明亮底色，大七音增加细腻与轻微张力；听感随音区和排列改变。'];
    else if (ints.includes('3m') && ints.includes('7m')) data = ['柔和，带一点内省', ['内省', '温和', '舒展'], '小三和弦的内向底色加入小七音，常被描述为柔和或含蓄；并不等同于必然悲伤。'];
    else if (ints.includes('3m')) data = ['偏暗的内省色彩', ['内省', '沉静', '偏暗'], '在许多西方调性音乐听者中，小三和弦较常关联负向效价；个人经验和文化会改变这种关联。'];
    else if (ints.includes('3M')) data = ['明亮而直接', ['明亮', '开阔', '稳定'], '在许多西方调性音乐听者中，大三和弦较常关联正向效价；力度、音色和上下文仍会改变感受。'];
    else data = ['开放的音程色彩', ['开放', '中性'], '缺少三音时，不能可靠判定大、小性质，也不能据此断言快乐或悲伤。'];
    const extensions = ints.some(i => /^(9|11|13)/.test(i)) ? ' 延伸音增加音集复杂度；“更复杂”不等同于“更不悦耳”。' : '';
    return { title: data[0], tags: data[1], text: data[2] + extensions, context: '听感倾向，不是情绪测量。未分析音色、节奏、调性与前后进行。' };
  }
  scope.ChordLens = { MidiState, createRecognizer, emotion, noteName, pitchName, pretty, mod };
  if (typeof module !== 'undefined') module.exports = scope.ChordLens;
})(globalThis);
