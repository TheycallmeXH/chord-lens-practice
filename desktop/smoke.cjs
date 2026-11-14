const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const { resolve, join } = require('node:path');
const { readFile, mkdir } = require('node:fs/promises');

const packaged = process.argv.includes('--packaged');
const executablePath = packaged
  ? resolve(__dirname, '../dist/和弦镜练琴版/和弦镜练琴版.exe')
  : require('electron');
const args = packaged ? ['--practice-test'] : [__dirname, '--practice-test'];
const output = join(__dirname, 'test-results');
let app;

(async () => {
  await mkdir(output, { recursive: true });
  app = await electron.launch({ executablePath, args, timeout: 60000 });
  const page = await app.firstWindow(), errors = [];
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].show());
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('#modeHeading');
  assert.equal(await page.evaluate(() => typeof navigator.requestMIDIAccess), 'function');
  assert.equal(await page.evaluate(() => typeof window.practiceDesktop?.pin), 'function');
  const realMidi = await page.evaluate(async () => {
    try {
      const access = await navigator.requestMIDIAccess({sysex:false});
      return {ok:true,inputs:access.inputs.size,sysexEnabled:access.sysexEnabled};
    } catch (error) { return {ok:false,error:error.message}; }
  });
  assert.equal(realMidi.ok,true,JSON.stringify(realMidi));
  assert.equal(realMidi.sysexEnabled,false);
  console.log('Native MIDI permission:',JSON.stringify(realMidi));
  await page.evaluate(() => localStorage.clear());
  await app.context().addInitScript(() => {
    const port = { id:'test', name:'Practice Test MIDI', state:'connected', async open() { return this; } };
    const access = { inputs:new Map([['test', port]]) };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value:async () => access });
    window.sendMidi = data => port.onmidimessage?.({ data:new Uint8Array(data) });
    window.disconnectMidi = () => { port.state = 'disconnected'; access.onstatechange(); };
    window.audioStarts = 0;
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) {
        super(...args); window.audioStarts++;
        const analyser = this.createAnalyser(); analyser.fftSize = 2048;
        const originalConnect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function(destination, ...rest) {
          if (destination === analyser.context.destination) {
            originalConnect.call(this, analyser);
          }
          return originalConnect.call(this, destination, ...rest);
        };
        window.outputPeak = () => {
          const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
          return Math.max(...data.map(Math.abs));
        };
      }
    };
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#midiStatus').textContent === '1 MIDI 输入');
  await page.evaluate(() => document.fonts.ready);
  if (process.argv.includes('--release-check')) {
    await page.locator('#startButton').click();
    for (let i=0;i<12;i++) await page.locator('#skipButton').click();
    assert.equal(await page.locator('#practiceState').textContent(),'本轮完成');
    assert.equal(await page.locator('#recordCount').textContent(),'1');
    const complete = await page.evaluate(() => JSON.parse(localStorage.getItem('chord-lens-practice-v1')).sessions[0]);
    assert.equal(complete.complete,true);
    assert.equal(complete.skipped,12);
    assert.deepEqual(errors,[]);
    console.log('Desktop release: native MIDI permission and automatic round completion/save passed.');
    return;
  }
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const send = async data => page.evaluate(data => window.sendMidi(data), data);
  const notesOn = async notes => { for (const midi of notes) await send([144,midi,100]); };
  const notesOff = async notes => { for (const midi of notes) await send([128,midi,0]); };
  const targetNotes = () => page.evaluate(() => [...document.querySelectorAll('#targetNotes span')]
    .map(el => Tonal.Note.midi(el.textContent.replaceAll('♯','#').replaceAll('♭','b'))));
  const snapshot = () => page.evaluate(() =>
    ['.performance','.sequence-band','.keyboard-section','#intervals','#piano','.session-bar','.notes-panel','.attempt-panel','.next-panel']
      .map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector,r.y,r.height]; }));
  const geometry = () => page.evaluate(() => {
    const issues = [], selectors = ['.performance','.sequence-band','.keyboard-section','.session-bar','.inspector','.sidebar'];
    for (const selector of selectors) {
      const r = document.querySelector(selector).getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1) issues.push(selector + ' outside window');
    }
    const labels = [...document.querySelectorAll('.interval-label')].map(el => el.getBoundingClientRect());
    labels.forEach((a,i) => labels.slice(i+1).forEach(b => {
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) issues.push('interval overlap');
    }));
    const ruler = document.querySelector('#intervals').getBoundingClientRect();
    if (labels.some(label => label.top < ruler.top || label.bottom > ruler.bottom)) issues.push('interval outside ruler');
    if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight) issues.push('page overflow');
    const bar = document.querySelector('.session-bar');
    if (bar.scrollWidth > bar.clientWidth + 2) issues.push('session controls overflow');
    return issues;
  });

  assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'), 'false');
  await page.locator('#metroButton').click();
  await settle(1000);
  assert.equal(await page.locator('#beatLights .on').count(), 1);
  assert.equal(await page.evaluate(() => audioStarts), 0, 'muted metronome must not create audio');
  await page.locator('#metroButton').click();
  await page.locator('#pinButton').click();
  await page.waitForFunction(() => document.querySelector('#pinButton').getAttribute('aria-pressed') === 'true');
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
  await page.locator('#pinButton').click();
  await page.waitForFunction(() => document.querySelector('#pinButton').getAttribute('aria-pressed') === 'false');
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), false);

  const baseline = await snapshot();
  await page.locator('#startButton').click();
  let notes = await targetNotes();
  await notesOn(notes);
  await settle(550);
  assert.equal(await page.locator('#completedText').textContent(), '1 / 12');
  await settle(450);
  assert.equal(await page.locator('#completedText').textContent(), '1 / 12');
  assert.equal(await page.locator('#targetIndex').textContent(), '1 / 12');
  assert.deepEqual(await snapshot(), baseline);
  await notesOff(notes); await settle();
  assert.equal(await page.locator('#targetIndex').textContent(), '2 / 12');
  notes = await targetNotes();
  const wrong = 48 + ((notes[0] + 1) % 12);
  await notesOn([wrong]); await notesOff([wrong]); await settle();
  assert.equal(await page.locator('#accuracyText').textContent(), '50%');
  assert.equal(await page.locator('.attempt-row.wrong').count(), 1);
  await notesOn(notes.slice(0,1)); await settle(100);
  assert.equal(await page.locator('.attempt-row.wrong').count(), 1);
  await notesOn(notes.slice(1)); await settle(550);
  assert.equal(await page.locator('#completedText').textContent(), '2 / 12');
  await send([176,64,127]); await notesOff(notes); await settle();
  assert.equal(await page.locator('#targetIndex').textContent(), '2 / 12');
  assert.match(await page.locator('#pedalStatus').textContent(), /●/);
  await send([176,64,0]); await settle();
  assert.equal(await page.locator('#targetIndex').textContent(), '3 / 12');
  await page.locator('#startButton').click();
  const pausedTime = await page.locator('#sessionTime').textContent();
  await settle(1200);
  assert.equal(await page.locator('#sessionTime').textContent(), pausedTime);
  await page.locator('#startButton').click();
  await page.locator('#skipButton').click();
  assert.equal(await page.locator('#targetIndex').textContent(), '4 / 12');
  await page.locator('#stopButton').click();
  assert.equal(await page.locator('#recordCount').textContent(), '1');
  await page.locator('#recordsButton').click();
  assert.equal(await page.locator('.saved-session').count(), 1);
  const exportPath = join(output, packaged ? 'packaged-records.json' : 'records.json');
  await app.evaluate(({ dialog }, filename) => {
    dialog.showSaveDialog = async () => ({ canceled:false, filePath:filename });
  }, exportPath);
  await page.locator('#exportButton').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === '记录已导出');
  const exported = JSON.parse(await readFile(exportPath, 'utf8'));
  assert.equal(exported.sessions[0].correct, 2);
  assert.equal(exported.sessions[0].wrong, 1);
  assert.equal(exported.sessions[0].skipped, 1);
  await page.locator('#recordsDialog [data-close]').click();

  await page.locator('[data-mode="progression"]').click();
  await page.locator('#keySelect').selectOption('2');
  assert.equal(await page.locator('#targetSymbol').textContent(), 'Em7');
  await page.locator('#ruleSelect').selectOption('exact');
  await page.locator('#startButton').click();
  notes = await targetNotes();
  await notesOn(notes.map(n => n + 12)); await settle(500);
  assert.equal(await page.locator('#completedText').textContent(), '0 / 12');
  await page.locator('#clearButton').click(); await notesOn(notes); await settle(500);
  assert.equal(await page.locator('#completedText').textContent(), '1 / 12');
  await notesOff(notes); await settle();
  assert.equal(await page.locator('#targetSymbol').textContent(), 'A7');
  await page.locator('#stopButton').click();

  await page.locator('#startButton').click();
  for (let i=0;i<12;i++) await page.locator('#skipButton').click();
  assert.equal(await page.locator('#practiceState').textContent(),'本轮完成');
  assert.equal(await page.locator('#recordCount').textContent(),'3');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('chord-lens-practice-v1')).sessions[0].complete),true);

  await page.locator('[data-mode="free"]').click();
  await page.locator('#ruleSelect').evaluate(el => el.value = 'pitch');
  for (const values of [[60,64,67], Array.from({length:36},(_,i) => 48+i), [48,60,64,67,70,74,77,81]]) {
    await page.locator('#clearButton').click(); await notesOn(values); await settle(350);
    assert.deepEqual(await snapshot(), baseline);
    assert.deepEqual(await geometry(), []);
  }
  await page.locator('#clearButton').click();
  await notesOn([60,64,67]); await settle(250);
  assert.deepEqual(await page.locator('.interval-label').allTextContents(), ['大三度','小三度']);
  await page.locator('[data-interval="bass"]').click();
  assert.deepEqual(await page.locator('.interval-label').allTextContents(), ['大三度','纯五度']);
  await page.screenshot({ path:join(output,'desktop-default.png') });
  for (const size of [[1120,740],[1280,800],[1920,1080]]) {
    await app.evaluate(({ BrowserWindow }, [width,height]) => BrowserWindow.getAllWindows()[0].setSize(width,height), size);
    await settle(200);
    assert.deepEqual(await geometry(), [], 'geometry at '+size);
    const fixed = await snapshot();
    await notesOn([61,62,63,65,66,68,69,70,71]); await settle(300);
    assert.deepEqual(await snapshot(), fixed);
    assert.deepEqual(await geometry(), [], 'dense geometry at '+size);
    if (size[0] === 1120) await page.screenshot({ path:join(output,'desktop-minimum.png') });
    await page.locator('#clearButton').click(); await notesOn([60,64,67]); await settle(200);
  }

  await page.locator('#soundButton').click();
  await page.locator('#settingsButton').click();
  await page.locator('#monitorToggle').check();
  await page.locator('#settingsDialog [data-close]').click(); await settle(300);
  assert.equal(await page.evaluate(() => audioStarts), 1);
  assert.ok(await page.evaluate(() => outputPeak()) > .005, 'enabled monitoring produces sound');
  await page.locator('#metroButton').click(); await settle(200);
  await page.locator('#soundButton').click(); await settle(250);
  assert.ok(await page.evaluate(() => outputPeak()) < .00001, 'master mute silences all voices');
  await page.locator('#metroButton').click();
  await page.locator('#clearButton').click();
  await page.reload(); await settle(300);
  assert.equal(await page.locator('#recordCount').textContent(), '3');
  assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#monitorToggle').isChecked(), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ packaged, assertions:'native bridge, practice, pedal, pause, exact octave, export, persistence, audio, intervals, stable layout', errors },null,2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
