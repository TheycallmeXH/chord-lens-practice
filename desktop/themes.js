(function (scope) {
  'use strict';
  const choices = [
    {id:'live-dark',label:'Live 黑',title:'#414141',symbol:'#dededb',background:'#242424',swatches:['#343434','#89c9da','#ffb354'],light:false},
    {id:'live-light',label:'Live 白',title:'#a6a6a6',symbol:'#242424',background:'#c0c0c0',swatches:['#dedede','#8bd4ec','#ffc029'],light:true},
    {id:'fl-studio',label:'FL Studio',title:'#535f65',symbol:'#ecf1f2',background:'#29363e',swatches:['#3b4951','#a4d675','#ffad58'],light:false},
    {id:'cubase',label:'Cubase',title:'#494949',symbol:'#f0f1f2',background:'#191b1d',swatches:['#2a2d30','#76bce7','#d56872'],light:false},
    {id:'medly',label:'Medly',title:'#102239',symbol:'#eaf6ff',background:'#112b4e',swatches:['#235da8','#3be1b2','#f3de53'],light:false}
  ];
  const fields = [
    ['bg','背景'],['panel','面板'],['ink','文字'],['accent','强调'],
    ['cyan','按下'],['green','正确'],['red','错误'],['white','白键'],['black','黑键']
  ];
  let custom = [];
  const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16));
  const mix = (a,b,t) => '#'+rgb(a).map((n,i)=>Math.round(n*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
  const luminance = color => rgb(color).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const text = (bg,preferred) => preferred && contrast(bg,preferred)>=4.5 ? preferred :
    contrast(bg,'#ffffff')>=contrast(bg,'#111111') ? '#ffffff' : '#111111';
  function normalize(value) {
    if(!value || typeof value.id!=='string' || !/^custom-[a-z0-9-]{1,64}$/.test(value.id) || typeof value.label!=='string' ||
      !value.label.trim() || value.label.trim().length>32 || !value.colors) return null;
    const colors={};
    for(const [key] of fields) {
      if(typeof value.colors[key]!=='string' || !/^#[a-f\d]{6}$/i.test(value.colors[key])) return null;
      colors[key]=value.colors[key].toLowerCase();
    }
    return {id:value.id,label:value.label.trim(),colors};
  }
  function tokens(value) {
    const c=value.colors, ink=text(c.panel,c.ink), shade=luminance(c.panel)>.3?'#000000':'#ffffff';
    const out={...c,ink,heading:ink,soft:ink,muted:mix(c.panel,ink,.8),
      surface:mix(c.bg,c.panel,.5),performance:c.panel,title:mix(c.panel,shade,.12),
      control:mix(c.panel,shade,.12),raised:mix(c.panel,shade,.1),hover:mix(c.panel,shade,.22),
      line:mix(c.panel,shade,.28),rule:mix(c.panel,shade,.25),outline:mix(c.panel,ink,.65),
      'accent-hover':mix(c.accent,shade,.2),'accent-ink':text(c.accent),
      positive:text(c.panel,c.green),negative:text(c.panel,c.red),track:mix(c.panel,shade,.25),
      interval:mix(c.panel,c.cyan,.7),'interval-ink':text(c.panel,c.cyan),
      'white-ink':text(c.white),'white-edge':mix(c.white,c.black,.4),'white-hover':mix(c.white,c.cyan,.18),
      'black-ink':text(c.black),'black-hover':mix(c.black,c.white,.15),
      'active-ink':text(c.cyan),'active-black':mix(c.cyan,c.black,.2),
      'pedal':mix(c.accent,c.white,.35),'pedal-black':mix(c.accent,c.black,.3),
      'wrong-ink':text(c.red),'wrong-black':mix(c.red,c.black,.2),
      'correct-ink':text(c.green),'correct-black':mix(c.green,c.black,.2),
      fifths:mix(c.panel,shade,.07),'fifths-minor':c.panel,'fifths-center':c.bg,
      'fifths-current':mix(c.panel,c.cyan,.5),backdrop:'#101010a6'};
    for(const key of ['active-black','pedal','pedal-black','wrong-black','correct-black']) out[key+'-ink']=text(out[key]);
    return out;
  }
  function setCustom(values) {
    const ids=new Set();
    custom=(Array.isArray(values)?values.slice(0,24):[]).map(normalize).filter(v=>{
      if(!v || ids.has(v.id)) return false;
      ids.add(v.id);return true;
    }).slice(0,24);
    return custom;
  }
  function resolve(value) {
    const item=normalize(value);
    if(!item) return null;
    const vars=tokens(item);
    return {...item,title:vars.title,symbol:text(vars.title,item.colors.ink),background:vars.bg,
      swatches:[vars.panel,vars.cyan,vars.accent],light:luminance(vars.panel)>.3,vars};
  }
  const find = id => choices.find(theme => theme.id === id) || resolve(custom.find(theme=>theme.id===id));
  const apply = id => {
    const theme = typeof id==='object' ? resolve(id) || choices[0] : find(id) || choices[0];
    if (typeof document !== 'undefined') {
      const root=document.documentElement;
      root.dataset.theme=theme.id;
      let style=document.getElementById('customThemeStyle');
      if(!style) {style=document.createElement('style');style.id='customThemeStyle';document.head.append(style);}
      style.textContent=theme.vars ? `:root[data-theme="${theme.id}"]{color-scheme:${theme.light?'light':'dark'};`+
        Object.entries(theme.vars).map(([key,color])=>`--${key}:${color}`).join(';')+'}' : '';
    }
    return theme;
  };
  scope.PracticeThemes = {choices,find,apply,fields,normalize,setCustom,resolve,contrast};
  if (typeof module !== 'undefined') module.exports = scope.PracticeThemes;
  if (typeof document !== 'undefined') {
    let id;
    try {
      const saved=JSON.parse(localStorage.getItem('chord-lens-practice-v1'));
      setCustom(saved?.customThemes);id=saved?.config?.theme;
    } catch {}
    apply(id);
  }
})(globalThis);
