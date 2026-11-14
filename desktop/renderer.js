(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const { MidiState, createRecognizer, noteName, pitchName, pretty, mod, emotion } = ChordLens;
  const { Session, createDeck, evaluate } = PianoPractice;
  const recognizer = createRecognizer(Tonal), input = new MidiState();
  const measureContext = document.createElement('canvas').getContext('2d');
  const icons = () => lucide.createIcons();
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = () => performance.now();
  const formatTime = ms => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;
  const computerKeys = { KeyA:60, KeyW:61, KeyS:62, KeyE:63, KeyD:64, KeyF:65, KeyT:66, KeyG:67, KeyY:68, KeyH:69, KeyU:70, KeyJ:71, KeyK:72 };
  const plans = { triads:'大小三和弦', sevenths:'七和弦', inversions:'三和弦转位' };
  const storageKey = 'chord-lens-practice-v1';
  let saved = { sessions: [], config: {}, layout: {} };
  let layout = { collapsed:{}, leftHidden:false, rightHidden:false, fifthsIndex:0, fifthsRing:'major' };
  const fifthsNames = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
  const fifthsKeys = fifthsNames.map(name => Tonal.Key.majorKey(name));
  let toastTimer, access, connecting = false, device = 'all', channel = 'all', includePedal = true;
  let notes = [], analysis = recognizer.analyze([]), chosen = null, selectedId = null, octave = 3, intervalMode = 'adjacent';
  let mode = 'chords', deck, run = null, sessionMeta, recordedRun = null, latestEvent = '', analysisTimer;
  let firstAnalysisAt = 0, bpm = 80, beats = 4, metro = false, beatStart = 0, nextBeat = 0, lastVisualBeat = -1;
  let sound = false, audio, master, tuning = 440, audioGeneration = 0;
  let compact = false, switchingView = false;
  let theme = PracticeThemes.find(document.documentElement.dataset.theme) || PracticeThemes.choices[0];
  let tickTimer = null, feedbackKey = '', analysisKey = '', noteStateKey = '';
  const voices = new Map(), previewVoices = new Set(), metroVoices = new Set(), onsets = new Map(), computerDown = new Set(), pointers = new Map(), ports = new Map(), failedPorts = new Set();
  const portAttempts = new Map();
  function toast(text) {
    $('#toast').textContent = text; $('#toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
  }
  function readStorage() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (data && typeof data === 'object') {
        const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const valid = item => item && typeof item === 'object' &&
          typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt)) &&
          ['durationMs','correct','wrong','skipped','count'].every(key => Number.isFinite(item[key]) && item[key] >= 0) &&
          (item.key === 'all' || Number.isInteger(Number(item.key)) && Number(item.key) >= 0 && Number(item.key) < 12);
        saved = { sessions:Array.isArray(data.sessions) ? data.sessions.filter(valid).slice(0,100) : [],
          config:object(data.config), layout:object(data.layout) };
      }
    } catch { toast('练习记录读取失败'); }
  }
  function saveStorage() {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
    catch { toast('记录未能保存，请导出本轮数据'); }
  }
  function config() {
    return {
      mode, plan:$('#planSelect').value, key:$('#keySelect').value,
      rule:$('#ruleSelect').value, count:Number($('#countSelect').value),
      progression:$('#progressionSelect').value, bpm, beats,
      hints:$('#hintsToggle').checked, holdMs:Number($('#holdInput').value), theme:theme.id
    };
  }
  function persistConfig() { saved.config = config(); saveStorage(); }
  function persistLayout() { saved.layout = layout; saveStorage(); }
  function applyTheme(id, persist = true) {
    theme = PracticeThemes.apply(id);
    $$('[data-theme-value]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.themeValue === theme.id)));
    window.practiceDesktop?.theme(theme.id).catch(error => toast(error.message));
    if (persist) persistConfig();
  }
  function setupThemes() {
    $('#themeOptions').innerHTML = PracticeThemes.choices.map(item =>
      `<button type="button" class="theme-option" data-theme-value="${item.id}" aria-pressed="false" title="${escape(item.label)}"><span class="theme-swatches" aria-hidden="true">${item.swatches.map(color => `<i style="background:${color}"></i>`).join('')}</span>${escape(item.label)}<i class="theme-check" data-lucide="check" aria-hidden="true"></i></button>`).join('');
    $('#themeOptions').onclick = event => {
      const button = event.target.closest('[data-theme-value]');
      if (button) applyTheme(button.dataset.themeValue);
    };
    applyTheme(theme.id,false);
  }
  function setupPanels() {
    const restored = saved.layout;
    layout.leftHidden = restored.leftHidden === true; layout.rightHidden = restored.rightHidden === true;
    if (Number.isInteger(restored.fifthsIndex) && restored.fifthsIndex >= 0 && restored.fifthsIndex < 12) layout.fifthsIndex = restored.fifthsIndex;
    if (restored.fifthsRing === 'minor') layout.fifthsRing = 'minor';
    $$('[data-panel]').forEach(panel => {
      const name = panel.dataset.panel;
      layout.collapsed[name] = restored.collapsed?.[name] === true;
      const button = document.createElement('button');
      button.className = 'panel-toggle'; button.dataset.collapse = name;
      button.innerHTML = '<i data-lucide="chevron-down"></i>';
      const bodies = [...panel.children].filter(child => child.hasAttribute('data-panel-body'));
      bodies.forEach((body,i) => { if (!body.id) body.id = `panel-${name}-body-${i}`; });
      button.setAttribute('aria-controls', bodies.map(body => body.id).join(' '));
      panel.querySelector('.panel-heading').prepend(button);
      button.onclick = () => { layout.collapsed[name] = !layout.collapsed[name]; applyLayout(); persistLayout(); };
    });
    $('#leftPanelButton').onclick = () => { layout.leftHidden = !layout.leftHidden; applyLayout(); persistLayout(); };
    $('#rightPanelButton').onclick = () => { layout.rightHidden = !layout.rightHidden; applyLayout(); persistLayout(); };
    $('#resetLayoutButton').onclick = () => {
      layout.leftHidden = false; layout.rightHidden = false;
      Object.keys(layout.collapsed).forEach(name => layout.collapsed[name] = false);
      applyLayout(); persistLayout();
    };
    applyLayout();
  }
  function applyLayout() {
    $$('[data-panel]').forEach(panel => {
      const folded = layout.collapsed[panel.dataset.panel] === true;
      panel.classList.toggle('collapsed', folded);
      [...panel.children].filter(child => child.hasAttribute('data-panel-body')).forEach(body => body.hidden = folded);
      const button = panel.querySelector('[data-collapse]');
      button.setAttribute('aria-expanded', String(!folded));
      button.title = `${folded ? '展开' : '折叠'}${panel.dataset.panelName}`;
      button.setAttribute('aria-label',button.title);
    });
    $('.workspace').classList.toggle('performance-collapsed', (mode === 'free' || layout.collapsed.target) && layout.collapsed.played);
    for (const side of ['left','right']) {
      const hidden = layout[side + 'Hidden'], button = $('#' + side + 'PanelButton');
      $('.shell').classList.toggle(side + '-hidden',hidden);
      button.setAttribute('aria-expanded',String(!hidden));
      button.title = `${hidden ? '显示' : '隐藏'}${side === 'left' ? '左' : '右'}侧栏`;
      button.setAttribute('aria-label',button.title);
      const pointsLeft = side === 'left' ? !hidden : hidden;
      button.innerHTML = `<i data-lucide="${pointsLeft ? 'chevron-left' : 'chevron-right'}"></i>`;
    }
    icons();
    requestAnimationFrame(() => { fitSymbols(); renderIntervals(); });
  }
  function setupFifths() {
    const point = (radius,angle) => {
      const radians = angle * Math.PI / 180;
      return [110 + radius * Math.sin(radians),110 - radius * Math.cos(radians)];
    };
    const sector = (outer,inner,index) => {
      const a = index * 30 - 15, b = a + 30;
      return `M${point(outer,a)} A${outer},${outer} 0 0 1 ${point(outer,b)} L${point(inner,b)} A${inner},${inner} 0 0 0 ${point(inner,a)} Z`;
    };
    let paths = '', buttons = '', tones = '';
    fifthsKeys.forEach((key,index) => {
      const title = `${pretty(key.tonic)} 大调 / ${pretty(key.minorRelative)} 小调`;
      for (const ring of ['major','minor']) {
        const minor = ring === 'minor', name = minor ? key.minorRelative + 'm' : key.tonic;
        const pc = Tonal.Note.chroma(minor ? key.minorRelative : key.tonic);
        paths += `<path class="fifths-sector ${ring}" data-fifths-sector="${ring}-${index}" d="${sector(minor ? 82 : 108,minor ? 54 : 82,index)}"/>`;
        const [x,y] = point(minor ? 64 : 97,index * 30);
        buttons += `<button class="fifths-key ${ring}" data-fifths-index="${index}" data-fifths-ring="${ring}" data-pc="${pc}" style="left:${x/2.2}%;top:${y/2.2}%" title="${escape(title)}" aria-label="${escape(pretty(name) + (minor ? ' 小调' : ' 大调'))}" aria-pressed="false">${escape(pretty(name))}</button>`;
      }
      const [x,y] = point(105,index * 30);
      tones += `<circle class="fifths-tone" data-fifths-tone="${Tonal.Note.chroma(key.tonic)}" cx="${x}" cy="${y}" r="1.8"/>`;
    });
    $('#fifthsDiagram').innerHTML = `<svg viewBox="0 0 220 220" aria-hidden="true">${paths}${tones}<circle class="fifths-disc" cx="110" cy="110" r="51"/></svg>${buttons}<div class="fifths-center"><strong id="fifthsPair"></strong><span id="fifthsSignature"></span></div>`;
    $('#fifthsDiagram').onclick = event => {
      const button = event.target.closest('[data-fifths-index]');
      if (!button) return;
      layout.fifthsIndex = Number(button.dataset.fifthsIndex); layout.fifthsRing = button.dataset.fifthsRing;
      renderFifths(); persistLayout();
    };
    $('#applyFifthsButton').onclick = () => {
      if (busy() || mode === 'free') return;
      $('#keySelect').value = String(Tonal.Note.chroma(fifthsNames[layout.fifthsIndex]));
      buildDeck(); persistConfig();
    };
    renderFifths();
  }
  function renderFifths() {
    const selected = fifthsKeys[layout.fifthsIndex], wanted = mode === 'free' ? null : target();
    const targetRing = wanted && ['minor','m7'].includes(wanted.quality) ? 'minor' : 'major';
    const currentRing = chosen?.intervals.includes('3m') && !chosen.intervals.includes('3M') ? 'minor' : 'major';
    $$('[data-fifths-index]').forEach(button => {
      const index = Number(button.dataset.fifthsIndex), ring = button.dataset.fifthsRing, pc = Number(button.dataset.pc);
      const isTarget = !!wanted && wanted.root === pc && ring === targetRing;
      const isCurrent = !!chosen && chosen.root === pc && ring === currentRing;
      const isSelected = index === layout.fifthsIndex && ring === layout.fifthsRing;
      button.setAttribute('aria-pressed',String(isSelected));
      for (const element of [button,$(`[data-fifths-sector="${ring}-${index}"]`)]) {
        element.classList.toggle('current',isCurrent); element.classList.toggle('target',isTarget);
        element.classList.toggle('selected',isSelected);
      }
    });
    $$('[data-fifths-tone]').forEach(dot => dot.classList.toggle('sounding',analysis.pcs.includes(Number(dot.dataset.fifthsTone))));
    $('#fifthsPair').textContent = `${pretty(selected.tonic)} / ${pretty(selected.minorRelative)}m`;
    $('#fifthsSignature').textContent = selected.alteration ? `${Math.abs(selected.alteration)} ${selected.alteration > 0 ? '♯' : '♭'}` : '无升降号';
    $('#applyFifthsButton').disabled = busy() || mode === 'free';
    $('#applyFifthsButton').hidden = busy() || mode === 'free';
  }
  function busy() { return run && ['running', 'paused'].includes(run.state); }
  async function setCompact(value) {
    if (switchingView || value === compact) return;
    switchingView = true;
    try {
      if (window.practiceDesktop && await window.practiceDesktop.compact(value) !== value) throw new Error('窗口切换失败');
      if (value && run?.state === 'running') beginOrPause();
      releaseMomentary();
      compact = value;
      document.body.classList.toggle('compact', compact);
      $('#compactView').hidden = !compact;
      $('#exitCompactButton').hidden = !compact;
      $('#compactModeButton').setAttribute('aria-pressed', String(compact));
      (compact ? $('#exitCompactButton') : $('#compactModeButton')).focus();
      requestAnimationFrame(() => { fitSymbols(); renderIntervals(); });
    } catch (error) { toast(error.message); }
    finally { switchingView = false; }
  }
  function target() { return run ? run.target : deck?.[0]; }
  function buildDeck() {
    deck = createDeck(Tonal, config()); run = null; recordedRun = null; latestEvent = '';
    renderTarget(); renderSequence(); renderSession(); renderKeyboard(); paintKeys(); renderFeedback();
  }
  function updateMode(value) {
    if (busy()) return;
    mode = value; run = null;
    document.body.classList.toggle('free-mode', mode === 'free');
    $$('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
    $('#configHeading').textContent = mode === 'free' ? '输入' : '练习设置';
    $('[data-panel="config"]').dataset.panelName = $('#configHeading').textContent;
    applyLayout();
    $$('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    $('#modeHeading').textContent = mode === 'free' ? '自由分析' : mode === 'progression' ? '和弦进行' : '和弦练习';
    $('#keySelect option[value="all"]').disabled = mode === 'progression';
    $('#keySelect option[value="all"]').hidden = mode === 'progression';
    if (mode === 'progression' && $('#keySelect').value === 'all') $('#keySelect').value = '0';
    buildDeck(); persistConfig();
  }
  function renderControls() {
    const active = busy();
    $$('[data-mode], #planSelect, #progressionSelect, #keySelect, #ruleSelect, #countSelect, #holdInput').forEach(el => {
      el.disabled = active || (mode === 'free' && !el.dataset.mode);
    });
    $('#startButton').disabled = mode === 'free';
    $('#stopButton').disabled = !active;
    $('#stopButton').hidden = !active;
    $('#skipButton').disabled = run?.state !== 'running' || run.waiting === 'advance';
    $('#skipButton').hidden = $('#skipButton').disabled;
    const label = run?.state === 'running' ? '暂停' : run?.state === 'paused' ? '继续' : '开始练习';
    $('#startButton').innerHTML = `<i data-lucide="${run?.state === 'running' ? 'pause' : 'play'}"></i><span>${label}</span>`;
    $('#previewButton').disabled = !sound || mode === 'free';
    $('#previewButton').hidden = $('#previewButton').disabled;
    $('#applyFifthsButton').disabled = active || mode === 'free';
    $('#applyFifthsButton').hidden = $('#applyFifthsButton').disabled;
    icons();
  }
  function renderTarget() {
    const item = target(), free = mode === 'free';
    $('#targetSymbol').textContent = free ? '自由演奏' : pretty(item.symbol);
    $('#targetDescription').textContent = free ? '' : `${item.name}${item.requireBass ? ' · ' + ['根位','第一转位','第二转位'][item.inversion] : ''}${$('#ruleSelect').value === 'exact' ? ' · 指定音区' : ''}`;
    $('#targetNotes').innerHTML = free || !$('#hintsToggle').checked ? '' : item.noteNames.map(name =>
      `<span>${escape(pretty(name))}</span>`).join('');
    $('#targetIndex').textContent = free ? '' : `${Math.min((run?.index || 0) + 1, (run?.deck || deck).length)} / ${(run?.deck || deck).length}`;
    const sequence = run?.deck || deck, next = sequence[(run?.index || 0) + 1];
    $('#nextSymbol').textContent = free ? '—' : next ? pretty(next.symbol) : '结束';
    $('#nextDescription').textContent = !free && next ? next.name : '';
    fitSymbols(); renderControls(); renderFifths();
  }
  function fitSymbols() {
    for (const id of ['targetSymbol','playedSymbol','compactSymbol']) {
      const el = $('#' + id);
      if (!el.checkVisibility()) continue;
      el.style.fontSize = '';
      const style = getComputedStyle(el);
      measureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const width = measureContext.measureText(el.textContent).width;
      if (width > el.clientWidth) el.style.fontSize = `${parseFloat(style.fontSize) * el.clientWidth / width}px`;
    }
  }
  function renderSequence() {
    $('#sequenceLabel').textContent = mode === 'free' ? '候选' : '本轮';
    if (mode === 'free') {
      $('#sequenceList').innerHTML = [...analysis.candidates, ...analysis.inferred].slice(0, 8).map(item =>
        `<button data-candidate="${escape(item.id)}" title="${escape(item.evidence)}">${escape(item.symbol)}</button>`).join('');
      return;
    }
    const items = run?.deck || deck, index = run?.index || 0;
    $('#sequenceList').innerHTML = items.map((item, i) =>
      `<span class="sequence-item ${i === index && run?.state !== 'done' ? 'current' : i < index ? 'done' : ''}" data-step="${i}">${mode === 'progression' ? `<small>${escape(item.roman)}</small>` : ''}${escape(pretty(item.symbol))}</span>`).join('');
    const current = $(`[data-step="${index}"]`), list = $('#sequenceList');
    if (current) {
      const left = current.offsetLeft - list.offsetLeft;
      if (left < list.scrollLeft || left + current.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left;
    }
  }
  function renderSession() {
    const item = run, n = item ? item.correct + item.wrong + item.skipped : 0;
    $('#completedText').textContent = `${item?.correct || 0} / ${(item?.deck || deck).length}`;
    $('#streakText').textContent = String(item?.streak || 0);
    $('#accuracyText').textContent = n ? `${Math.round(item.correct / n * 100)}%` : '—';
    $('#attemptCount').textContent = String(n);
    $('#attemptList').innerHTML = (item?.attempts || []).slice(-40).reverse().map(attempt =>
      `<div class="attempt-row ${attempt.result}"><strong>${escape(pretty(attempt.target))}</strong><span>${{ correct:'成功', wrong:'重试', skipped:'跳过' }[attempt.result]}</span><small>${attempt.formationMs === null ? '—' : attempt.formationMs + ' ms'}</small></div>`).join('');
    renderControls();
  }
  function renderFeedback() {
    let state = mode === 'free' ? '实时分析' : '准备', detail = '', progress = 0;
    if (run) {
      if (run.state === 'paused') state = '已暂停';
      else if (run.state === 'done') { state = run.index >= run.deck.length ? '本轮完成' : '已保存'; detail = `${run.correct} 次成功 · ${run.wrong} 次重试`; }
      else if (run.waiting === 'advance') { state = latestEvent === 'skipped' ? '已跳过' : '正确'; detail = '松键进入下一题'; progress = latestEvent === 'skipped' ? 0 : 1; }
      else if (run.waiting === 'ready') { state = '请先松键'; }
      else if (run.matchedSince !== null) { state = '保持'; progress = Math.min(1, (clock() - run.matchedSince) / run.holdMs); }
      else if (run.feedback) {
        const feedback = run.feedback, name = midi => run.rule === 'exact' ? noteName(midi) : pretty(pitchName(midi));
        state = feedback.extra.length ? '检查错音' : feedback.bassWrong ? '检查低音' : '补齐音符';
        detail = [
          feedback.missing.length ? '缺 ' + feedback.missing.map(name).join(' ') : '',
          feedback.extra.length ? '多 ' + feedback.extra.map(name).join(' ') : '',
          feedback.bassWrong ? '低音 ' + pretty(pitchName(run.target.bass)) : ''
        ].filter(Boolean).join(' · ');
      } else { state = latestEvent === 'wrong' ? '再试一次' : '等待弹奏'; }
    }
    const key = JSON.stringify([state, detail, progress]);
    if (feedbackKey !== key) {
      feedbackKey = key;
      $('#practiceState').textContent = state;
      $('#feedbackText').textContent = detail; $('#feedbackText').title = detail;
      $('#holdProgress').style.width = `${progress * 100}%`;
    }
    const time = formatTime(run ? run.elapsed(clock()) : 0);
    if ($('#sessionTime').textContent !== time) $('#sessionTime').textContent = time;
    const active = run?.state === 'running' || metro;
    if (active && tickTimer === null) tickTimer = setTimeout(() => {
      tickTimer = null; updatePractice(); pumpMetro(); renderFeedback();
    }, 25);
    else if (!active && tickTimer !== null) { clearTimeout(tickTimer); tickTimer = null; }
  }
  function beginOrPause() {
    if (mode === 'free' || compact) return;
    if (run?.state === 'running') run.pause(clock());
    else if (run?.state === 'paused') run.resume(clock());
    else {
      if (run) deck = createDeck(Tonal, config());
      run = new Session(deck, config());
      run.start(clock()); recordedRun = null; latestEvent = '';
      sessionMeta = { startedAt:new Date().toISOString(), ...config() };
      run.update(notes.map(note => note.midi), clock());
    }
    renderTarget(); renderSequence(); renderSession(); renderFeedback(); paintKeys();
  }
  function saveRun() {
    if (!run || recordedRun === run) return;
    recordedRun = run;
    if (!run.attempts.length && run.elapsed(clock()) < 1000) return;
    const record = {
      ...sessionMeta, id:crypto.randomUUID(), finishedAt:new Date().toISOString(),
      durationMs:Math.round(run.elapsed(clock())), complete:run.index >= run.deck.length,
      correct:run.correct, wrong:run.wrong, skipped:run.skipped, bestStreak:run.bestStreak, attempts:run.attempts
    };
    saved.sessions.unshift(record); saved.sessions = saved.sessions.slice(0, 100);
    saveStorage(); renderDaily(); renderRecords();
  }
  function updatePractice() {
    if (run?.state !== 'running') return;
    const before = run.index, attempts = run.attempts.length;
    const result = run.update(notes.map(note => note.midi), clock());
    if (result && !['playing','holding','release'].includes(result)) latestEvent = result;
    if (run.index !== before) { renderTarget(); renderSequence(); paintKeys(); }
    if (run.attempts.length !== attempts) { renderSession(); paintKeys(); }
    if (result === 'finished') { saveRun(); renderSession(); renderTarget(); toast('本轮已保存'); }
  }
  function renderDaily() {
    const today = new Date().toLocaleDateString(), sessions = saved.sessions.filter(item => new Date(item.startedAt).toLocaleDateString() === today);
    $('#todayTime').textContent = formatTime(sessions.reduce((sum, item) => sum + item.durationMs, 0));
    $('#todayRounds').textContent = `${sessions.length} 轮`;
    $('#todayCorrect').textContent = `${sessions.reduce((sum, item) => sum + item.correct, 0)} 次成功`;
    $('#recordCount').textContent = String(saved.sessions.length);
  }
  function renderRecords() {
    $('#savedSessions').innerHTML = saved.sessions.length ? saved.sessions.map(item => {
      const total = item.correct + item.wrong + item.skipped;
      return `<div class="saved-session"><div>${new Date(item.startedAt).toLocaleDateString('zh-CN')}<small>${new Date(item.startedAt).toLocaleTimeString('zh-CN', {hour12:false})}</small></div><div>${escape(item.mode === 'progression' ? item.progression : plans[item.plan])}<small>${item.complete ? '完成' : '提前结束'} · ${item.correct}/${item.count} · ${item.key === 'all' ? '12 调' : escape(pretty(pitchName(Number(item.key))))}</small></div><span>${formatTime(item.durationMs)}</span><span>${total ? Math.round(item.correct / total * 100) : 0}%</span></div>`;
    }).join('') : '<div class="muted">—</div>';
    $('#exportButton').disabled = !saved.sessions.length;
  }
  async function connect() {
    if (connecting) return;
    if (!navigator.requestMIDIAccess) { setMidiStatus('MIDI 不可用', 'problem'); return; }
    connecting = true; $('#connectButton').disabled = true;
    try {
      access = await navigator.requestMIDIAccess({ sysex:false });
      failedPorts.forEach(id => { ports.delete(id); portAttempts.delete(id); }); failedPorts.clear();
      access.onstatechange = refreshDevices; refreshDevices();
    } catch (error) { setMidiStatus('MIDI 未授权', 'problem'); toast(error.message); }
    finally { connecting = false; $('#connectButton').disabled = false; }
  }
  function setMidiStatus(text, state = '') {
    for (const prefix of ['','compact']) {
      const status = prefix ? $('#compactMidiStatus') : $('#midiStatus');
      status.textContent = text; status.title = text;
      $(prefix ? '#compactMidiDot' : '#midiDot').className = `dot ${state}`;
    }
  }
  function refreshDevices() {
    const connected = [...access.inputs.values()].filter(port => port.state === 'connected');
    const ids = new Set(connected.map(port => port.id));
    const current = new Map(connected.map(port => [port.id,port]));
    ports.forEach((port, id) => {
      if (current.get(id) !== port) {
        run?.cancelAttempt(); input.clear(`midi:${id}`); port.onmidimessage = null;
        ports.delete(id); portAttempts.delete(id); failedPorts.delete(id); toast('MIDI 已断开');
      }
    });
    if (device !== 'all' && !ids.has(device)) { device = 'all'; clearInput(); }
    $('#deviceSelect').replaceChildren(new Option('所有输入', 'all'), ...connected.map(port => new Option(port.name || 'MIDI', port.id)));
    $('#deviceSelect').value = device;
    setMidiStatus(failedPorts.size ? 'MIDI 打开失败' : connected.length ? `${connected.length} MIDI 输入` : 'MIDI 未连接',
      failedPorts.size ? 'problem' : connected.length ? 'connected' : '');
    for (const port of connected) {
      if (failedPorts.has(port.id)) continue;
      port.onmidimessage = event => {
        const c = event.data[0] & 15;
        if ((device !== 'all' && device !== port.id) || (channel !== 'all' && c !== Number(channel)) || ($('#drumsToggle').checked && c === 9)) return;
        handleMessage(`midi:${port.id}`, event.data);
      };
      if (!ports.has(port.id)) {
        ports.set(port.id, port);
        const attempt = Symbol(); portAttempts.set(port.id,attempt);
        Promise.resolve().then(() => port.open()).catch(error => {
          if (portAttempts.get(port.id) !== attempt || ports.get(port.id) !== port || port.state !== 'connected') return;
          failedPorts.add(port.id); port.onmidimessage = null; input.clear(`midi:${port.id}`);
          refreshNotes(); setMidiStatus('MIDI 打开失败', 'problem'); toast(error.message);
        });
      }
    }
    refreshNotes();
  }
  function handleMessage(source, data) {
    const midi = data[1], attack = (data[0] & 240) === 144 && data[2] > 0;
    if (!input.message(source, data)) return;
    if (attack) onsets.set(`${source}:${data[0] & 15}:${midi}`, { source, channel:data[0] & 15, midi, time:clock() });
    refreshNotes(true);
  }
  function refreshNotes(follow = false) {
    notes = input.notes(includePedal);
    const held = notes.filter(note => note.held);
    for (const [key, value] of onsets) {
      if (!input.channels.get(`${value.source}:${value.channel}`)?.voices.get(value.midi)?.held) onsets.delete(key);
    }
    if (follow && notes.length && !notes.some(note => note.midi >= (octave + 1) * 12 && note.midi < (octave + 4) * 12)) {
      octave = Math.max(-1, Math.min(7, Math.floor(notes[0].midi / 12) - 1)); renderKeyboard();
    }
    const pedals = input.pedals();
    const times = [...onsets.values()].map(item => item.time);
    const stateKey = JSON.stringify([notes,pedals,times]);
    if (stateKey === noteStateKey) { updatePractice(); renderFeedback(); return; }
    noteStateKey = stateKey;
    $('#pedalStatus').textContent = pedals.sostenuto ? '选择延音 ●' : pedals.sustain ? '延音 ●' : '延音 −';
    $('#activeNames').textContent = notes.map(note => noteName(note.midi)).join(' ');
    $('#onsetSpread').textContent = times.length > 1 ? `${Math.round(Math.max(...times) - Math.min(...times))} ms` : '—';
    $('#velocitySpread').textContent = held.length > 1 ? String(Math.max(...held.map(n => n.velocity)) - Math.min(...held.map(n => n.velocity))) : '—';
    paintKeys(); syncAudio(); updatePractice(); renderFeedback();
    clearTimeout(analysisTimer);
    if (!notes.length) { firstAnalysisAt = 0; analyze(); return; }
    if (!firstAnalysisAt) firstAnalysisAt = clock();
    analysisTimer = setTimeout(() => { firstAnalysisAt = 0; analyze(); }, Math.min(65, Math.max(0, 200 - (clock() - firstAnalysisAt))));
  }
  function analyze() {
    const key = JSON.stringify([notes.map(note => [note.midi,note.held,note.velocity]),selectedId,tuning]);
    if (key === analysisKey) return;
    analysisKey = key;
    analysis = recognizer.analyze(notes);
    const candidates = [...analysis.candidates, ...analysis.inferred];
    chosen = candidates.find(item => item.id === selectedId) || candidates[0] || null;
    $('#playedSymbol').textContent = chosen?.symbol || (analysis.pcs.length === 1 ? noteName(analysis.midis[0]) : analysis.pcs.length ? '音集' : '—');
    $('#playedDescription').textContent = chosen ? `${chosen.chinese} · ${chosen.inversion}` : '';
    $('#matchType').textContent = chosen ? chosen.complete ? '完整' : '推测' : '';
    $('#bassText').textContent = notes.length ? recognizer.describeNote(notes[0].midi, chosen).name : '—';
    $('#compactSymbol').textContent = $('#playedSymbol').textContent;
    $('#compactDescription').textContent = chosen ? `${chosen.chinese} · ${chosen.inversion}${chosen.complete ? '' : ' · 推测'}` : '';
    $('#compactBass').textContent = $('#bassText').textContent;
    $('#compactNotes').innerHTML = notes.length ? notes.map(note =>
      `<span>${escape(recognizer.describeNote(note.midi, chosen).name)}</span>`).join('') : '—';
    $('#formulaText').textContent = chosen ? chosen.intervals.map((interval, i) => recognizer.describeNote(60 + chosen.pitches[i], chosen).degree).join(' · ') : '—';
    $('#moodText').textContent = chosen ? emotion(chosen).tags.join(' / ') : '';
    $('#noteCount').textContent = String(notes.length);
    $('#noteRows').innerHTML = notes.length ? notes.map(note => {
      const d = recognizer.describeNote(note.midi, chosen, 'auto', tuning);
      return `<tr><td title="${escape(d.role)} · MIDI ${note.midi} · ${d.frequency.toFixed(2)} Hz${note.held ? '' : ' · 踏板'}">${escape(d.name)}</td><td>${escape(d.degree)}</td><td><span class="velocity"><i style="width:${note.velocity / 127 * 100}%"></i></span>${note.velocity}</td></tr>`;
    }).join('') : '<tr><td colspan="3" class="table-empty">—</td></tr>';
    if (mode === 'free') renderSequence();
    fitSymbols(); renderIntervals(); renderFifths();
  }
  function clearInput() {
    input.clear(); onsets.clear(); pointers.clear(); computerDown.clear();
    run?.cancelAttempt(); refreshNotes();
  }
  function renderKeyboard() {
    const start = (octave + 1) * 12, end = Math.min(127, start + 35), whites = [];
    for (let midi = start; midi <= end; midi++) if (![1,3,6,8,10].includes(mod(midi))) whites.push(midi);
    let html = whites.map(midi => `<button class="piano-key" data-midi="${midi}" aria-label="${noteName(midi)}" aria-pressed="false"><span>${noteName(midi)}</span></button>`).join('');
    let position = 0;
    for (let midi = start; midi <= end; midi++) {
      if (![1,3,6,8,10].includes(mod(midi))) position++;
      else html += `<button class="piano-key black" data-midi="${midi}" aria-label="${noteName(midi)}" aria-pressed="false" style="left:${(position - .305) / whites.length * 100}%;width:${.61 / whites.length * 100}%"><span>${pretty(pitchName(midi))}</span></button>`;
    }
    $('#piano').innerHTML = html;
    $('#keyRange').textContent = `${noteName(start)} – ${noteName(end)}`;
    $('#octaveDown').disabled = octave <= -1; $('#octaveUp').disabled = octave >= 7;
    paintKeys(); renderIntervals();
  }
  function paintKeys() {
    const wanted = target(), map = new Map(notes.map(note => [note.midi, note]));
    const checking = mode !== 'free' && wanted && run?.state === 'running';
    const exact = $('#ruleSelect').value === 'exact';
    $$('[data-midi]').forEach(key => {
      const midi = Number(key.dataset.midi), note = map.get(midi);
      const desired = mode !== 'free' && wanted && (exact ? wanted.notes.includes(midi) : wanted.notes.some(n => mod(n) === mod(midi)));
      key.classList.toggle('target', !!desired && $('#hintsToggle').checked);
      key.classList.toggle('active', !!note?.held);
      key.classList.toggle('pedaled', !!note && !note.held);
      key.classList.toggle('wrong', !!note && !!checking && !desired);
      key.classList.toggle('correct', !!note && !!checking && run.waiting === 'advance' && latestEvent === 'correct');
      key.setAttribute('aria-pressed', String(!!note));
    });
  }
  function renderIntervals() {
    const ruler = $('#intervals'), roll = $('#pianoRoll'), scroll = $('#pianoScroll');
    if (!roll.clientWidth) return;
    const oldScroll = scroll.scrollLeft, keys = new Map($$('[data-midi]').map(key => [Number(key.dataset.midi), key]));
    roll.style.minWidth = '756px';
    const relations = analysis.midis.slice(1).map((to, i) => {
      const from = intervalMode === 'bass' ? analysis.midis[0] : analysis.midis[i];
      return keys.has(from) && keys.has(to) ? recognizer.describeInterval(from, to, chosen) : null;
    }).filter(Boolean);
    const measure = measureContext;
    measure.font = `10px ${getComputedStyle(document.body).fontFamily}`;
    let layout = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      const origin = roll.getBoundingClientRect().left, lanes = [];
      const positions = new Map([...keys].map(([midi,key]) => [midi,key.getBoundingClientRect()]));
      layout = relations.map(item => {
        const a = positions.get(item.from), b = positions.get(item.to);
        const left = a.left - origin + a.width / 2, right = b.left - origin + b.width / 2;
        const width = measure.measureText(item.label).width + 8, center = Math.max(width / 2, Math.min(roll.clientWidth - width / 2, (left + right) / 2));
        const range = [center - width / 2 - 3, center + width / 2 + 3];
        let lane = lanes.findIndex(occupied => occupied.every(r => range[1] <= r[0] || range[0] >= r[1]));
        if (lane < 0) { lane = lanes.length; lanes.push([]); }
        lanes[lane].push(range); return { ...item, left, right, center, lane };
      });
      if (lanes.length <= 4) break;
      roll.style.minWidth = `${Math.ceil(roll.clientWidth * 1.25)}px`;
    }
    ruler.innerHTML = layout.map(item => {
      const top = 13 + item.lane * 20, title = `${item.lower} → ${item.upper} · ${item.semitones} 半音`;
      return `<div class="interval-bracket" role="img" aria-label="${escape(title + ' · ' + item.label)}" style="left:${item.left}px;width:${item.right - item.left}px;top:${top}px;height:${92 - top}px"><span class="interval-label" title="${escape(title)}" style="left:${item.center - item.left}px">${escape(item.label)}</span></div>`;
    }).join('');
    scroll.scrollLeft = oldScroll;
  }
  async function ensureAudio() {
    if (!sound) return;
    if (!audio) {
      audio = new AudioContext(); master = audio.createGain(); master.gain.value = .26;
      const compressor = audio.createDynamicsCompressor(); compressor.threshold.value = -14; compressor.ratio.value = 8;
      master.connect(compressor); compressor.connect(audio.destination);
    }
    if (audio.state !== 'running') await audio.resume();
  }
  function makeVoice(midi, velocity = 88) {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.value = tuning * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, audio.currentTime); gain.gain.linearRampToValueAtTime(velocity / 127 * .14, audio.currentTime + .015);
    oscillator.connect(gain); gain.connect(master); oscillator.start();
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    return { oscillator, gain, stopped:false };
  }
  function stopVoice(voice) {
    if (voice.stopped) return; voice.stopped = true;
    voice.gain.gain.cancelScheduledValues(audio.currentTime); voice.gain.gain.setTargetAtTime(0, audio.currentTime, .025);
    voice.oscillator.stop(audio.currentTime + .16);
  }
  function syncAudio() {
    if (!sound || !audio || audio.state !== 'running') return;
    const audible = notes.filter(note => $('#monitorToggle').checked || note.sources.some(source => !source.startsWith('midi:')));
    voices.forEach((voice, midi) => { if (!audible.some(n => n.midi === midi)) { stopVoice(voice); voices.delete(midi); } });
    audible.forEach(note => { if (!voices.has(note.midi)) voices.set(note.midi, makeVoice(note.midi, note.velocity)); });
  }
  function unlockAudio() {
    if (!sound) return;
    const generation = audioGeneration;
    ensureAudio().then(() => { if (sound && generation === audioGeneration) syncAudio(); }).catch(error => toast(error.message));
  }
  function setSound(value) {
    sound = value; audioGeneration++;
    $('#soundButton').setAttribute('aria-pressed', String(sound));
    $('#soundButton').title = sound ? '关闭声音' : '开启声音';
    $('#soundButton').setAttribute('aria-label', $('#soundButton').title);
    $('#soundButton').innerHTML = `<i data-lucide="${sound ? 'volume-2' : 'volume-x'}"></i>`;
    if (audio) master.gain.setValueAtTime(sound ? .26 : 0, audio.currentTime);
    if (!sound) { voices.forEach(stopVoice); voices.clear(); previewVoices.forEach(stopVoice); previewVoices.clear(); stopMetroVoices(); }
    else unlockAudio();
    renderControls();
  }
  async function previewTarget() {
    if (!sound || mode === 'free') return;
    const generation = ++audioGeneration;
    await ensureAudio(); if (!sound || generation !== audioGeneration) return;
    previewVoices.forEach(stopVoice); previewVoices.clear();
    for (const midi of target().notes) previewVoices.add(makeVoice(midi));
    const group = [...previewVoices];
    setTimeout(() => group.forEach(voice => { stopVoice(voice); previewVoices.delete(voice); }), 1100);
  }
  function renderBeats() { $('#beatLights').innerHTML = Array.from({length:beats}, (_, i) => `<i class="${i === 0 ? 'accent' : ''}"></i>`).join(''); }
  function stopMetroVoices() { metroVoices.forEach(oscillator => oscillator.stop()); metroVoices.clear(); }
  function resetMetro() { stopMetroVoices(); beatStart = clock() + 100; nextBeat = 0; lastVisualBeat = -1; renderBeats(); }
  function clickAt(time, accent) {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(.35, time); gain.gain.exponentialRampToValueAtTime(.001, time + .045);
    oscillator.connect(gain); gain.connect(master); oscillator.start(time); oscillator.stop(time + .05);
    metroVoices.add(oscillator);
    oscillator.onended = () => { metroVoices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }
  function pumpMetro() {
    if (!metro) return;
    const now = clock(), interval = 60000 / bpm;
    if (now - (beatStart + nextBeat * interval) > interval * 2) {
      nextBeat = Math.ceil((now - beatStart) / interval);
    }
    while (beatStart + nextBeat * interval <= now + 90) {
      const at = beatStart + nextBeat * interval;
      if (sound && audio?.state === 'running' && at >= now) clickAt(audio.currentTime + (at - now) / 1000, nextBeat % beats === 0);
      nextBeat++;
    }
    const step = Math.floor((now - beatStart) / interval);
    if (step >= 0 && step !== lastVisualBeat) {
      $$('#beatLights i').forEach((light, i) => light.classList.toggle('on', i === step % beats));
      lastVisualBeat = step;
    }
  }
  function releaseMomentary() {
    computerDown.forEach(code => input.clear(`computer:${code}`)); computerDown.clear();
    pointers.forEach(source => input.clear(source)); pointers.clear(); refreshNotes();
  }
  readStorage();
  setupThemes(); setupPanels(); setupFifths();
  $('#keySelect').append(new Option('全部 12 调', 'all'), ...Array.from({length:12}, (_, i) => new Option(pretty(pitchName(i)), i)));
  $('#keySelect').value = '0';
  $('#channelSelect').append(...Array.from({length:16}, (_, i) => new Option(`第 ${i + 1} 通道`, i)));
  const restored = saved.config;
  for (const [id, field] of [['planSelect','plan'],['keySelect','key'],['ruleSelect','rule'],['countSelect','count'],['progressionSelect','progression']]) {
    if (restored[field] !== undefined && [...$('#' + id).options].some(option => option.value === String(restored[field]))) $('#' + id).value = String(restored[field]);
  }
  if (Number.isFinite(restored.bpm)) bpm = Math.max(40, Math.min(240, restored.bpm));
  if ([2,3,4,6].includes(restored.beats)) beats = restored.beats;
  if (typeof restored.hints === 'boolean') $('#hintsToggle').checked = restored.hints;
  if (Number.isFinite(restored.holdMs)) $('#holdInput').value = Math.max(100, Math.min(2000, restored.holdMs));
  $('#bpmInput').value = bpm; $('#meterSelect').value = beats;
  $$('[data-mode]').forEach(button => { button.onclick = () => updateMode(button.dataset.mode); });
  for (const id of ['planSelect','progressionSelect','keySelect','ruleSelect','countSelect']) {
    $('#' + id).onchange = () => { if (!busy()) { buildDeck(); persistConfig(); } };
  }
  $('#hintsToggle').onchange = () => { renderTarget(); paintKeys(); persistConfig(); };
  $('#startButton').onclick = beginOrPause;
  $('#compactModeButton').onclick = () => setCompact(true);
  $('#exitCompactButton').onclick = () => setCompact(false);
  $('#stopButton').onclick = () => { if (busy()) { run.finish(clock()); saveRun(); renderSession(); renderFeedback(); paintKeys(); } };
  $('#skipButton').onclick = () => {
    if (run?.state !== 'running') return;
    const result = run.skip(notes.map(note => note.midi), clock());
    latestEvent = 'skipped';
    if (result === 'finished') saveRun();
    renderTarget(); renderSequence(); renderSession(); renderFeedback(); paintKeys();
  };
  $('#clearButton').onclick = clearInput;
  $('#connectButton').onclick = connect;
  $('#deviceSelect').onchange = event => { device = event.target.value; clearInput(); refreshDevices(); };
  $('#channelSelect').onchange = event => { channel = event.target.value; clearInput(); };
  $('#drumsToggle').onchange = clearInput;
  $('#pedalToggle').onchange = event => { includePedal = event.target.checked; refreshNotes(); };
  $('#monitorToggle').onchange = () => { unlockAudio(); syncAudio(); };
  $('#latchToggle').onchange = () => {
    input.channels.forEach(state => { if (!state.source.startsWith('midi:')) input.clear(state.source); }); refreshNotes();
  };
  $('#holdInput').onchange = event => {
    event.target.value = Math.max(100, Math.min(2000, Number(event.target.value) || 350)); persistConfig();
  };
  $('#tuningInput').onchange = event => {
    tuning = Math.max(400, Math.min(480, Number(event.target.value) || 440)); event.target.value = tuning;
    voices.forEach((voice, midi) => voice.oscillator.frequency.setValueAtTime(tuning * 2 ** ((midi - 69) / 12), audio.currentTime)); analyze();
  };
  $('#soundButton').onclick = () => setSound(!sound);
  $('#previewButton').onclick = () => previewTarget().catch(error => toast(error.message));
  $('#metroButton').onclick = () => {
    metro = !metro; $('#metroButton').setAttribute('aria-pressed', String(metro)); resetMetro(); if (metro) unlockAudio(); renderFeedback();
  };
  $('#bpmInput').onchange = event => { bpm = Math.max(40, Math.min(240, Number(event.target.value) || 80)); event.target.value = bpm; resetMetro(); persistConfig(); };
  $('#meterSelect').onchange = event => { beats = Number(event.target.value); resetMetro(); persistConfig(); };
  $('#pinButton').disabled = !window.practiceDesktop;
  $('#pinButton').onclick = async () => {
    const button = $('#pinButton');
    button.disabled = true;
    try {
      const value = await window.practiceDesktop.pin(button.getAttribute('aria-pressed') !== 'true');
      button.setAttribute('aria-pressed', String(value));
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };
  for (const [button, dialog] of [['settingsButton','settingsDialog'],['helpButton','helpDialog'],['recordsButton','recordsDialog']]) {
    $('#' + button).onclick = () => { if (dialog === 'recordsDialog') renderRecords(); $('#' + dialog).showModal(); };
  }
  $$('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
  $('#exportButton').onclick = async () => {
    const data = { application:'和弦镜练琴版', version:1, exportedAt:new Date().toISOString(), sessions:saved.sessions };
    try {
      if (window.practiceDesktop) { if (await window.practiceDesktop.export(data)) toast('记录已导出'); }
      else {
        const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
        link.href = url; link.download = '和弦镜练习记录.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { toast(error.message); }
  };
  $('#sequenceList').onclick = event => {
    const button = event.target.closest('[data-candidate]');
    if (button) { selectedId = button.dataset.candidate; analyze(); }
  };
  $$('[data-interval]').forEach(button => {
    button.onclick = () => {
      intervalMode = button.dataset.interval;
      $$('[data-interval]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderIntervals();
    };
  });
  $('#octaveDown').onclick = () => { octave = Math.max(-1, octave - 1); renderKeyboard(); };
  $('#octaveUp').onclick = () => { octave = Math.min(7, octave + 1); renderKeyboard(); };
  $('#piano').addEventListener('pointerdown', event => {
    const key = event.target.closest('[data-midi]'); if (!key || event.button !== 0) return;
    const midi = Number(key.dataset.midi);
    if ($('#latchToggle').checked) {
      const exists = notes.some(note => note.midi === midi && note.sources.includes('virtual'));
      handleMessage('virtual', [exists ? 128 : 144, midi, exists ? 0 : 88]);
    } else {
      const source = `pointer:${event.pointerId}`; pointers.set(event.pointerId, source); handleMessage(source,[144,midi,88]);
    }
    unlockAudio();
  });
  $('#piano').addEventListener('click', event => {
    if (event.detail !== 0) return;
    const key = event.target.closest('[data-midi]'); if (!key) return;
    const midi = Number(key.dataset.midi), exists = notes.some(note => note.midi === midi && note.sources.includes('virtual'));
    handleMessage('virtual',[exists ? 128 : 144,midi,exists ? 0 : 88]); unlockAudio();
    if (!$('#latchToggle').checked && !exists) setTimeout(() => handleMessage('virtual',[128,midi,0]),400);
  });
  function releasePointer(event) {
    const source = pointers.get(event.pointerId);
    if (source) { input.clear(source); pointers.delete(event.pointerId); refreshNotes(); }
  }
  document.addEventListener('pointerup', releasePointer); document.addEventListener('pointercancel', releasePointer);
  document.addEventListener('keydown', event => {
    if ($$('dialog').some(dialog => dialog.open) || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.code === 'Space' && event.target.closest('button')) return;
    if (event.code === 'Space') { event.preventDefault(); beginOrPause(); return; }
    if (event.code === 'Escape') { clearInput(); return; }
    const midi = computerKeys[event.code]; if (midi === undefined) return;
    event.preventDefault(); computerDown.add(event.code); handleMessage(`computer:${event.code}`,[144,midi,88]); unlockAudio();
  });
  document.addEventListener('keyup', event => {
    if (!computerDown.has(event.code)) return;
    computerDown.delete(event.code); input.clear(`computer:${event.code}`); refreshNotes();
  });
  window.addEventListener('blur', releaseMomentary);
  window.addEventListener('beforeunload', () => {
    if (busy()) { run.finish(clock()); saveRun(); }
  });
  window.addEventListener('resize', () => { fitSymbols(); renderIntervals(); });
  document.fonts.ready.then(() => { fitSymbols(); renderIntervals(); });
  updateMode(['free','chords','progression'].includes(restored.mode) ? restored.mode : 'chords');
  renderDaily(); renderRecords(); renderBeats(); analyze(); connect(); icons();
  window.practiceDesktop?.compact().then(value => { if (value) setCompact(true); }).catch(error => toast(error.message));
})();
