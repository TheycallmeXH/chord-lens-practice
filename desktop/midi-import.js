(function (scope) {
  'use strict';
  const mod = n => ((n % 12) + 12) % 12;
  function readSequence(midi) {
    if (midi.format === 2) throw new Error('暂不支持 Format 2，请导出为 Format 0 或 1');
    if (midi.timeDivision & 0x8000) throw new Error('请将 SMPTE 时间格式转换为每拍 ticks 后导入');
    if (!Number.isFinite(midi.timeDivision) || midi.timeDivision <= 0) throw new Error('MIDI 时间格式无效');
    const tracks = [], notes = [];
    let events = 0;
    midi.tracks.forEach((track,index) => {
      const pitches = [];
      for (const event of track.events) {
        if (++events > 250000) throw new Error('MIDI 事件过多，请先截取要练习的片段');
        if ((event.statusByte & 240) !== 144 || !event.data[1] || (event.statusByte & 15) === 9) continue;
        const pitch = event.data[0], ticks = event.ticks;
        if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127 || !Number.isFinite(ticks) || ticks < 0) continue;
        const time = midi.midiTicksToSeconds(ticks) * 1000;
        if (!Number.isFinite(time)) throw new Error('MIDI 速度信息无效');
        pitches.push(pitch);notes.push({pitch,ticks,time,track:index});
      }
      if (pitches.length) tracks.push({id:index,name:track.name || `音轨 ${index+1}`,count:pitches.length,
        min:pitches.reduce((min,n)=>Math.min(min,n),127),max:pitches.reduce((max,n)=>Math.max(max,n),0)});
    });
    if (!notes.length) throw new Error('文件中没有可练习的非鼓组音符');
    notes.sort((a,b)=>a.time-b.time || a.track-b.track || a.pitch-b.pitch);
    const firstTempo = [...midi.tempoChanges].sort((a,b)=>a.ticks-b.ticks).find(item=>item.tempo>0)?.tempo || 120;
    return {tracks,notes,ppq:midi.timeDivision,bpm:Math.round(firstTempo)};
  }
  function extractTargets(tonal, recognizer, sequence, {tracks = [], grouping = 'onset', windowMs = 80} = {}) {
    const selected = new Set(tracks), notes = sequence.notes.filter(note=>selected.has(note.track));
    const groups = [], beatSize = Number(grouping), window = Math.max(20,Math.min(300,Number(windowMs)||80));
    for (const note of notes) {
      const current = groups.at(-1), bucket = beatSize > 0 ? Math.floor(note.ticks / (sequence.ppq * beatSize)) : null;
      if (!current || (bucket === null ? note.time-current.time > window : bucket !== current.bucket)) {
        groups.push({bucket,time:note.time,ticks:note.ticks,notes:[note.pitch]});
      } else current.notes.push(note.pitch);
    }
    const targets = [];
    let skipped = 0, merged = 0;
    for (const group of groups) {
      const midis = [...new Set(group.notes)].sort((a,b)=>a-b), pcs = [...new Set(midis.map(mod))];
      if (pcs.length < 3) {skipped++;continue;}
      const signature = midis.join(',');
      if (targets.at(-1)?.signature === signature) {merged++;continue;}
      if (targets.length >= 2048) throw new Error('和弦超过 2048 组，请选择更少音轨或先截取 MIDI 片段');
      const analysis = recognizer.analyze(midis.map(midi=>({midi,velocity:88,held:true})));
      const chosen = analysis.candidates.find(item=>item.complete) || null;
      const noteNames = midis.map(midi=>chosen ? recognizer.describeNote(midi,chosen).name.replaceAll('♯','#').replaceAll('♭','b') : tonal.Note.fromMidi(midi));
      targets.push({
        symbol:chosen?.symbol || '音集',name:chosen?.chinese || `${pcs.length} 音音集`,quality:'imported',
        root:chosen?.root ?? pcs[0],intervals:chosen?.intervals || [],notes:midis,noteNames,
        bass:midis[0],requireBass:false,inversion:0,roman:`${Math.floor(group.ticks/sequence.ppq*100)/100} 拍`,
        sourceMs:Math.round(group.time),signature
      });
    }
    return {targets,skipped,merged};
  }
  scope.MidiPracticeImport = {readSequence,extractTargets};
  if (typeof module !== 'undefined') module.exports = scope.MidiPracticeImport;
})(globalThis);
