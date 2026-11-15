(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.setupMidiImport = function ({onApply,canImport}) {
    const dialog = $('#midiImportDialog'), fileInput = $('#midiFileInput');
    let worker, timer, debounce, revision = 0, requestId = 0, pending, result, fileName = '', tempo = 120;
    function dispose() {
      revision++;
      pending?.reject(new Error('导入已取消'));
      clearTimeout(timer);clearTimeout(debounce);worker?.terminate();worker = null;pending = null;
    }
    function status(text,error = false) {
      $('#midiImportStatus').textContent = text;
      $('#midiImportStatus').classList.toggle('error',error);
    }
    function request(type,data = {},transfer = []) {
      const id = ++requestId;
      pending?.reject(new Error('请求已更新'));
      clearTimeout(timer);
      return new Promise((resolve,reject) => {
        pending = {id,resolve,reject};
        timer = setTimeout(() => {
          pending = null;worker?.terminate();worker = null;
          reject(new Error('MIDI 处理超时，请截取更短的文件后重试'));
        },10000);
        worker.postMessage({id,type,...data},transfer);
      });
    }
    function connectWorker() {
      worker = new Worker('midi-worker.js');
      worker.onmessage = ({data}) => {
        if (pending?.id !== data.id) return;
        clearTimeout(timer);const task = pending;pending = null;
        if (data.error) task.reject(new Error(data.error));else task.resolve(data);
      };
      worker.onerror = event => {
        const message = event.message || 'MIDI 处理失败';
        pending?.reject(new Error(message));dispose();status(message,true);
      };
    }
    async function extract() {
      if (!worker) return;
      const current = ++revision;
      result = null;$('#applyMidiButton').disabled = true;$('#midiPreview').replaceChildren();$('#midiImportSummary').textContent = '';
      status('正在提取和弦…');
      try {
        const data = await request('extract',{options:{
          tracks:[...document.querySelectorAll('[data-midi-track]:checked')].map(input=>Number(input.dataset.midiTrack)),
          grouping:$('#midiGroupingSelect').value,windowMs:Number($('#midiWindowInput').value)
        }});
        if (current !== revision) return;
        result = data;
        $('#midiPreview').innerHTML = data.targets.slice(0,32).map(target=>`<span title="${escape(target.noteNames.join(' '))}">${escape(target.symbol)}</span>`).join('');
        const detail = [data.skipped ? `跳过 ${data.skipped} 个单音 / 双音组` : '',data.merged ? `合并 ${data.merged} 个重复组` : ''].filter(Boolean).join(' · ');
        status(data.targets.length ? detail || '已生成练习序列' : '没有三音以上的组合，请调整音轨或提取方式',!data.targets.length);
        $('#midiImportSummary').textContent = `${data.targets.length} 组 · ${tempo} BPM${data.targets.length > 32 ? ' · 预览前 32 组' : ''}`;
        $('#applyMidiButton').disabled = !data.targets.length;
      } catch(error) {if (current === revision) status(error.message,true);}
    }
    async function load(file) {
      if (!file || !canImport()) return;
      dispose();result = null;fileName = file.name;
      $('#midiFileName').textContent = fileName;$('#midiFileName').title = fileName;
      $('#midiTrackList').replaceChildren();$('#midiPreview').replaceChildren();$('#midiImportSummary').textContent = '';
      $('#applyMidiButton').disabled = true;status('正在读取 MIDI…');
      const current = revision;
      try {
        if (file.size > 16*1024*1024) throw new Error('MIDI 最大支持 16 MB，请先截取片段');
        const bytes = await file.arrayBuffer();
        if (current !== revision) return;
        connectWorker();
        const data = await request('load',{bytes,name:fileName},[bytes]);
        if (current !== revision) return;
        tempo = data.bpm;
        $('#midiTrackList').innerHTML = data.tracks.map(track=>
          `<label><input type="checkbox" data-midi-track="${track.id}" checked><span>${escape(track.name)}</span><small>${track.count} 音 · ${ChordLens.noteName(track.min)}–${ChordLens.noteName(track.max)}</small></label>`).join('');
        await extract();
      } catch(error) {if (current === revision) status(error.message,true);}
    }
    const queueExtract = () => {
      revision++;result = null;
      clearTimeout(debounce);$('#applyMidiButton').disabled = true;
      debounce = setTimeout(extract,100);
    };
    $('#midiTrackList').onchange = queueExtract;
    $('#midiGroupingSelect').onchange = () => {
      $('#midiWindowField').hidden = $('#midiGroupingSelect').value !== 'onset';queueExtract();
    };
    $('#midiWindowInput').onchange = event => {
      event.target.value = Math.max(20,Math.min(300,Number(event.target.value)||80));queueExtract();
    };
    $('#chooseMidiFileButton').onclick = () => {fileInput.value = '';fileInput.click();};
    fileInput.onchange = () => load(fileInput.files[0]);
    $('#applyMidiButton').onclick = () => {
      if (!result?.targets.length || !canImport()) return;
      onApply({targets:result.targets,name:fileName,bpm:tempo});dialog.close();
    };
    dialog.addEventListener('close',dispose);
    return {open() {
      if (!canImport()) return;
      $('#midiFileName').textContent = '未选择文件';$('#midiFileName').title = '';
      $('#midiTrackList').replaceChildren();$('#midiPreview').replaceChildren();$('#midiImportSummary').textContent = '';
      $('#applyMidiButton').disabled = true;status('选择要练习的 MIDI 文件');
      dialog.showModal();fileInput.value = '';fileInput.click();
    }};
  };
})();
