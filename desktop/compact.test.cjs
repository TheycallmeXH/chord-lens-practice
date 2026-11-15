const assert = require('node:assert/strict');
const { join, resolve } = require('node:path');
const { mkdir, readFile } = require('node:fs/promises');
const { _electron } = require('playwright');

// Native sizing, view restoration and uninterrupted MIDI are one cross-process contract.
(async () => {
  const app = await _electron.launch({
    executablePath:resolve(__dirname, '../dist/和弦镜练琴版/和弦镜练琴版.exe'),
    args:['--practice-test','--practice-test-no-midi']
  });
  try {
    const page = await app.firstWindow(), errors = [];
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#compactModeButton');
    await page.evaluate(() => localStorage.clear());
    await page.context().addInitScript(() => {
      const port = { id:'compact-midi', name:'Compact MIDI', state:'connected', async open() { return this; } };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value:async () => ({ inputs:new Map([[port.id, port]]) })
      });
      window.sendMidi = data => port.onmidimessage?.({ data:new Uint8Array(data) });
      window.audioCreations = 0;
      const RealAudioContext = window.AudioContext;
      window.AudioContext = class extends RealAudioContext {
        constructor(...args) { super(...args); window.audioCreations++; }
      };
    });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    const nativeState = () => app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { bounds:win.getBounds(), minimum:win.getMinimumSize(), maximized:win.isMaximized(), pinned:win.isAlwaysOnTop() };
    });
    const settle = () => page.waitForTimeout(160);
    const clear = () => page.keyboard.press('Escape');
    const send = data => page.evaluate(data => window.sendMidi(data), data);
    const chord = async notes => {
      await clear();
      await page.evaluate(notes => notes.forEach(midi => window.sendMidi([144, midi, 100])), notes);
      await settle();
    };
    const checkFit = async () => assert.deepEqual(await page.evaluate(() => {
      const issues = [];
      for (const selector of ['.titlebar','#compactView','#compactSymbol','#compactDescription','#compactNotes','.compact-footer','#exitCompactButton','#pinButton']) {
        const el = document.querySelector(selector), r = el.getBoundingClientRect();
        if (!el.checkVisibility() || r.top < 0 || r.left < 0 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) issues.push(selector);
        if (selector !== '#compactNotes' && el.scrollWidth > el.clientWidth + 1) issues.push(selector + ' overflow');
      }
      return issues;
    }), []);
    await mkdir(join(__dirname, 'test-results'), { recursive:true });
    await page.screenshot({ path:join(__dirname,'test-results/native-edge-layout.png'), scale:'css' });
    assert.equal(await page.locator('#compactModeButton').evaluate(el => el.previousElementSibling.dataset.mode), 'progression');
    assert.equal(await page.locator('.title-tools #leftPanelButton').count(), 0);
    for (const side of ['left','right']) {
      const button = page.locator(`#${side}PanelButton`);
      await button.click();
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      const r = await button.boundingBox();
      assert.ok(r.x >= 0 && r.y >= 0);
      assert.ok(await button.isVisible(), 'edge remains reachable when sidebar is hidden');
      await button.focus(); await page.keyboard.press('Space');
      assert.equal(await button.getAttribute('aria-expanded'), 'true');
    }
    await page.locator('#rightPanelButton').click();
    await page.locator('[data-collapse="target"]').click();
    await page.locator('#startButton').click();
    const full = await nativeState();
    await page.locator('#compactModeButton').click(); await settle();
    assert.equal(await page.locator('#compactView').isVisible(), true);
    assert.equal(await page.locator('.shell').isVisible(), false);
    assert.deepEqual((await nativeState()).minimum, [280, 180]);
    assert.equal((await nativeState()).bounds.width, 320);
    assert.ok(Math.abs((await nativeState()).bounds.height - 200) <= 1, 'Windows DPI rounding stays within one pixel');
    assert.equal(await page.locator('#practiceState').textContent(), '已暂停');
    assert.equal(await page.locator('#resetLayoutButton').isVisible(), false);
    await chord([60,64,67]);
    assert.equal(await page.locator('#compactSymbol').textContent(), 'C');
    assert.deepEqual(await page.locator('#compactNotes span').allTextContents(), ['C4','E4','G4']);
    assert.equal(await page.locator('#compactBass').textContent(), 'C4');
    assert.equal(await page.locator('#compactMidiStatus').textContent(), '1 MIDI 输入');
    await checkFit();
    await page.screenshot({ path:join(__dirname,'test-results/native-compact.png'), scale:'css' });
    await page.locator('#compactSymbol').click(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#practiceState').textContent(), '已暂停');
    await send([176,64,127]);
    for (const midi of [60,64,67]) await send([128,midi,0]);
    await settle();
    assert.equal(await page.locator('#compactSymbol').textContent(), 'C', 'pedal continues in compact view');
    await send([176,64,0]); await settle();
    assert.equal(await page.locator('#compactSymbol').textContent(), '—');
    await page.locator('#pinButton').click();
    await page.waitForFunction(() => document.querySelector('#pinButton').getAttribute('aria-pressed') === 'true');
    await settle();
    assert.equal((await nativeState()).pinned, true);
    await page.locator('#pinButton').click();
    await page.waitForFunction(() => document.querySelector('#pinButton').getAttribute('aria-pressed') === 'false');
    await settle();
    assert.equal((await nativeState()).pinned, false);
    await page.reload(); await page.waitForSelector('#compactView:not([hidden])');
    assert.equal((await nativeState()).bounds.width, 320, 'reload keeps native view and renderer in sync');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(280,180));
    const smallBounds = (await nativeState()).bounds;
    await chord([60,61,63,64,66,67,69,70]);
    await checkFit();
    await chord(Array.from({length:36}, (_, i) => 48 + i));
    await checkFit();
    await chord([59,60,64,67,71,74,78,81]);
    assert.equal(await page.locator('#compactSymbol').textContent(), 'CM13♯11/B');
    await checkFit();
    assert.deepEqual((await nativeState()).bounds, smallBounds, 'dense notes and long names cannot resize the window');
    await page.screenshot({ path:join(__dirname,'test-results/native-compact-minimum.png'), scale:'css' });
    await page.locator('#exitCompactButton').click(); await settle();
    assert.deepEqual((await nativeState()).bounds, full.bounds);
    assert.deepEqual((await nativeState()).minimum, [1120,740]);
    assert.equal(await page.locator('.inspector').isVisible(), false);
    assert.equal(await page.locator('[data-collapse="target"]').getAttribute('aria-expanded'), 'false');
    await page.locator('#resetLayoutButton').click();
    assert.equal(await page.locator('.inspector').isVisible(), true);
    assert.equal(await page.locator('[data-collapse="target"]').getAttribute('aria-expanded'), 'true');
    await page.locator('#compactModeButton').click(); await settle();
    assert.ok(Math.abs((await nativeState()).bounds.width - 280) <= 1, 'last compact size is remembered');
    await chord([57,60,64]);
    assert.equal(await page.locator('#compactSymbol').textContent(), 'Am');
    await page.locator('#exitCompactButton').click();
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]; win.show(); win.maximize();
    });
    await page.waitForTimeout(300);
    assert.equal((await nativeState()).maximized, true);
    await page.locator('#compactModeButton').click(); await settle();
    assert.equal((await nativeState()).maximized, false);
    await page.locator('#exitCompactButton').click(); await settle();
    assert.equal((await nativeState()).maximized, true, 'maximized window is restored');
    assert.equal(await page.evaluate(() => window.audioCreations), 0);
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);

    const ResEdit = await import('resedit');
    const image = ResEdit.NtExecutable.from(await readFile(resolve(__dirname,'../dist/和弦镜练琴版/和弦镜练琴版.exe')));
    const resources = ResEdit.NtExecutableResource.from(image);
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
    assert.ok(groups.length);
    for (const group of groups) {
      assert.deepEqual(group.icons.map(icon => icon.width), [16,20,24,32,40,48,64,128,0]);
    }
    console.log('Native compact: edge arrows, keyboard toggles, live MIDI, pedal, pause, pin, reload, minimum size, restore, maximize, silence and executable icon passed.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
