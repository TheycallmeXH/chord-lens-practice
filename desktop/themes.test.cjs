const assert = require('node:assert/strict');
const {chromium,_electron} = require('playwright');
const {join,resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {mkdir} = require('node:fs/promises');
const {choices} = require('./themes.js');

(async () => {
  const packaged = process.argv.includes('--packaged'), output = join(__dirname,'test-results');
  await mkdir(output,{recursive:true});
  let browser,app;
  try {
    let page,resize;
    if (packaged) {
      app = await _electron.launch({executablePath:resolve(__dirname,'../dist/和弦镜练琴版/和弦镜练琴版.exe'),args:['--practice-test']});
      page = await app.firstWindow();
      await app.evaluate(({BrowserWindow}) => {
        const win = BrowserWindow.getAllWindows()[0], original = win.setTitleBarOverlay.bind(win);
        win.setTitleBarOverlay = options => {win.testOverlay = options;original(options);};
        win.show();
      });
      resize = size => app.evaluate(({BrowserWindow},[width,height])=>BrowserWindow.getAllWindows()[0].setSize(width,height),size);
    } else {
      browser = await chromium.launch({headless:true,executablePath:process.env.CHORD_LENS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
      page = await browser.newPage({viewport:{width:1480,height:960}});
      await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
      resize = ([width,height]) => page.setViewportSize({width,height});
    }
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('[data-theme-value="live-dark"]',{state:'attached'});
    await page.evaluate(()=>localStorage.clear());
    await page.context().addInitScript(()=>{
      const port = {id:'theme-midi',name:'Theme MIDI',state:'connected',async open(){return this;}};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[port.id,port]])})});
      window.sendMidi = data => port.onmidimessage?.({data:new Uint8Array(data)});
      window.audioStarts = 0;
      const Audio = window.AudioContext;
      window.AudioContext = class extends Audio {constructor(...args){super(...args);window.audioStarts++;}};
      window.addEventListener('DOMContentLoaded',()=>document.querySelector('#soundButton').click());
    });
    await page.reload(); await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'live-dark');
    const settle = () => page.waitForTimeout(130);
    const fit = () => page.evaluate(()=>{
      const problems = [];
      for (const selector of ['.performance','.keyboard-section','.session-bar','.fifths-panel','.notes-panel','.attempt-panel','.next-panel','.sidebar','.inspector']) {
        const el = document.querySelector(selector);
        if (!el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if(r.top<0 || r.left<0 || r.right>innerWidth+1 || r.bottom>innerHeight+1) problems.push(selector+' outside');
      }
      for (const selector of ['.keyboard-heading','.titlebar','.session-bar','.fifths-legend']) {
        const el = document.querySelector(selector);
        if(el.checkVisibility() && el.scrollWidth>el.clientWidth+1) problems.push(selector+' overflow');
      }
      const ruler = document.querySelector('#intervals').getBoundingClientRect();
      const labels = [...document.querySelectorAll('.interval-label')].filter(el=>el.checkVisibility()).map(el=>el.getBoundingClientRect());
      labels.forEach((a,i)=>{
        if(a.top<ruler.top || a.bottom>ruler.bottom) problems.push('interval clipped');
        labels.slice(i+1).forEach(b=>{
          if(a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top) problems.push('interval overlap');
        });
      });
      return problems;
    });
    const stable = () => page.evaluate(()=>['.performance','.keyboard-section','#piano','.session-bar'].map(selector=>{
      const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];
    }));
    const contrast = () => page.evaluate(()=>{
      const rgb = text => text.match(/[\d.]+/g).slice(0,3).map(Number);
      const luminance = values => values.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const failures = [];
      for(const selector of ['#playedDescription','#moodText','#bassText','.fifths-key.minor','.keyboard-title .muted','.sidebar nav [aria-pressed="true"]','#compactDescription','#compactNotes','#compactBass','.compact-bass span','#compactMidiStatus']) {
        const el = document.querySelector(selector);
        if(!el?.checkVisibility() || !el.textContent.trim()) continue;
        let parent=el,bg;
        while(parent) {bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)') break;parent=parent.parentElement;}
        const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(rgb(bg));
        const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        if(ratio<4.5) failures.push([selector,Number(ratio.toFixed(2))]);
      }
      return failures;
    });
    const setChord = async values => {
      await page.locator('#clearButton').click();
      await page.evaluate(values=>values.forEach(midi=>sendMidi([144,midi,100])),values);
      await settle();
    };
    const modeCheck = async mode => {
      const free = mode==='free';
      for(const selector of ['.target-panel','.daily','#recordsButton','.session-bar','.attempt-panel','.next-panel']) {
        assert.equal(await page.locator(selector).isVisible(),!free,selector+' '+mode);
      }
      for(const selector of ['#keySelect','#ruleSelect','#countSelect','#hintsToggle']) {
        assert.equal(await page.locator(selector).isVisible(),!free,selector+' '+mode);
      }
      assert.equal(await page.locator('#planSelect').isVisible(),mode==='chords');
      assert.equal(await page.locator('#progressionSelect').isVisible(),mode==='progression');
      assert.equal(await page.locator('#latchToggle').isVisible(),true);
      assert.equal(await page.locator('#applyFifthsButton').isVisible(),!free);
      assert.equal(await page.locator('#previewButton').isVisible(),false,'muted preview hidden');
      assert.equal(await page.locator('#stopButton').isVisible(),false,'idle stop hidden');
      assert.equal(await page.locator('#skipButton').isVisible(),false,'idle skip hidden');
      await page.locator('#settingsButton').click();
      assert.equal(await page.locator('[data-settings-tab="practice"]').isVisible(),!free);
      if (!free) {
        await page.locator('[data-settings-tab="practice"]').click();
        assert.equal(await page.locator('#holdInput').isVisible(),true);
      }
      await page.locator('[data-settings-tab="midi"]').click();
      assert.equal(await page.locator('#channelSelect').isVisible(),true);
      await page.locator('#settingsDialog [data-close]').click();
    };
    const captures = [];
    for(const theme of choices) {
      await page.locator('#settingsButton').click();
      await page.locator('[data-settings-tab="display"]').click();
      await page.locator(`[data-theme-value="${theme.id}"]`).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme.id);
      assert.equal(await page.locator(`[data-theme-value="${theme.id}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('chord-lens-practice-v1')).config.theme),theme.id);
      await page.screenshot({path:join(output,`${packaged?'native':'browser'}-${theme.id}-settings.png`),scale:'css'});
      await page.locator('#settingsDialog [data-close]').click();
      if (app) {
        await settle();
        const native = await app.evaluate(({BrowserWindow,nativeTheme})=>{
          const win=BrowserWindow.getAllWindows()[0];return {background:win.getBackgroundColor(),overlay:win.testOverlay,source:nativeTheme.themeSource};
        });
        assert.ok(native.background.toLowerCase().endsWith(theme.background.slice(1)));
        assert.equal(native.overlay.color,theme.title);
        assert.equal(native.overlay.symbolColor,theme.symbol);
        assert.equal(native.source,theme.light?'light':'dark');
        assert.equal(await page.evaluate(()=>practiceDesktop.theme('invalid-theme')),false);
      }
      for(const mode of ['free','chords','progression']) {
        await page.locator(`[data-mode="${mode}"]`).click(); await settle();
        await modeCheck(mode);
        for(const size of [[1480,960],[1120,740],[1280,800],[1920,1080]]) {
          await resize(size);await settle();
          await setChord([60,64,67]);
          assert.equal(await page.locator('#playedSymbol').textContent(),'C');
          const piano=await page.locator('#piano').boundingBox(), baseline=await stable();
          assert.equal(Math.round(piano.height),size[1]<=820?104:128);
          assert.deepEqual(await fit(),[],theme.id+' '+mode+' '+size);
          assert.deepEqual(await contrast(),[],theme.id+' text contrast '+mode);
          if(size[0]===1480 || size[0]===1120) {
            const name=`${packaged?'native':'browser'}-${theme.id}-${mode}-${size[0]}.png`;
            await page.screenshot({path:join(output,name),scale:'css'});
            if(size[0]===1480) captures.push({theme:theme.id,mode,file:name});
          }
          await setChord(Array.from({length:36},(_,i)=>48+i));
          assert.deepEqual(await stable(),baseline,'dense MIDI must not resize panels');
          assert.deepEqual(await fit(),[],theme.id+' dense '+mode+' '+size);
        }
      }
      await page.reload(); await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme.id,'theme survives reload');
    }
    await resize([1480,960]);
    await page.locator('[data-mode="free"]').click();
    await page.locator('[data-collapse="played"]').click();
    await page.locator('[data-mode="chords"]').click();
    assert.equal(await page.locator('[data-collapse="played"]').getAttribute('aria-expanded'),'false');
    await page.locator('#resetLayoutButton').click();
    await page.locator('#clearButton').click();
    await page.locator('#startButton').click();
    assert.equal(await page.locator('#stopButton').isVisible(),true);
    assert.equal(await page.locator('#skipButton').isVisible(),true);
    assert.equal(await page.locator('#applyFifthsButton').isVisible(),false);
    await page.locator('#startButton').click();
    assert.equal(await page.locator('#skipButton').isVisible(),false,'paused skip hidden');
    await page.locator('#startButton').click();
    assert.equal(await page.locator('#skipButton').isVisible(),true,'resumed skip available');
    await page.evaluate(()=>sendMidi([144,61,100]));
    await page.waitForFunction(()=>document.querySelector('#noteCount').textContent==='1');
    const before = await page.locator('#targetSymbol').textContent();
    await page.locator('#settingsButton').click();
    await page.locator('[data-settings-tab="display"]').click();
    await page.locator('[data-theme-value="live-light"]').click();
    await page.locator('#settingsDialog [data-close]').click();
    assert.equal(await page.locator('#targetSymbol').textContent(),before,'theme does not rebuild active deck');
    assert.equal(await page.locator('#noteCount').textContent(),'1','theme does not clear MIDI');
    assert.equal(await page.locator('#completedText').textContent(),'0 / 12');
    await page.locator('#stopButton').click();
    assert.equal(await page.locator('#applyFifthsButton').isVisible(),true,'stopped practice restores key action');
    await page.locator('#clearButton').click();
    await page.locator('[data-mode="free"]').click();
    await page.locator('#latchToggle').uncheck();
    await page.locator('#latchToggle').check();
    await page.locator('[data-midi="60"]').click();
    await page.locator('[data-midi="64"]').click();
    await page.locator('[data-midi="67"]').click();
    await settle();
    assert.equal(await page.locator('#playedSymbol').textContent(),'C','virtual piano works in free mode');
    await page.locator('[data-interval="bass"]').click();
    assert.deepEqual(await page.locator('.interval-label').allTextContents(),['大三度','纯五度']);
    for(const theme of choices) {
      await page.locator('#settingsButton').click();
      await page.locator('[data-settings-tab="display"]').click();
      await page.locator(`[data-theme-value="${theme.id}"]`).click();
      await page.locator('#settingsDialog [data-close]').click();
      await page.locator('#compactModeButton').click();
      await page.waitForSelector('#compactView:not([hidden])');
      assert.equal(await page.locator('#compactSymbol').textContent(),'C');
      assert.deepEqual(await contrast(),[],theme.id+' compact contrast');
      await page.screenshot({path:join(output,`${packaged?'native':'browser'}-${theme.id}-compact.png`),scale:'css'});
      await page.locator('#exitCompactButton').click();
      await page.waitForSelector('.shell:visible');
    }
    await page.evaluate(()=>{
      const data=JSON.parse(localStorage.getItem('chord-lens-practice-v1'));data.config.theme='unknown';localStorage.setItem('chord-lens-practice-v1',JSON.stringify(data));
    });
    await page.reload();await settle();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'live-dark','invalid theme falls back safely');
    assert.equal(await page.evaluate(()=>audioStarts),1);
    assert.deepEqual(errors,[]);
    if(!packaged) {
      const sharp=require('sharp'), width=444,height=288;
      const images=await Promise.all(captures.map(async({file},i)=>({
        input:await sharp(join(output,file)).resize(width,height).png().toBuffer(),
        left:i%3*width,top:Math.floor(i/3)*height
      })));
      await sharp({create:{width:width*3,height:height*choices.length,channels:3,background:'#242424'}}).composite(images).png().toFile(join(output,'theme-overview.png'));
    }
    console.log(`${packaged?'Native':'Browser'}: five themes, three modes, four sizes, compact, contrast, persistence, corrupt preference, active practice and virtual piano passed.`);
  } finally {if(app)await app.close();if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
