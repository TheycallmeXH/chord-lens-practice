(function (scope) {
  'use strict';
  const choices = [
    {id:'live-dark',label:'Live 黑',title:'#414141',symbol:'#dededb',background:'#242424',swatches:['#343434','#89c9da','#ffb354'],light:false},
    {id:'live-light',label:'Live 白',title:'#a6a6a6',symbol:'#242424',background:'#c0c0c0',swatches:['#dedede','#8bd4ec','#ffc029'],light:true},
    {id:'fl-studio',label:'FL Studio',title:'#535f65',symbol:'#ecf1f2',background:'#29363e',swatches:['#3b4951','#a4d675','#ffad58'],light:false},
    {id:'cubase',label:'Cubase',title:'#494949',symbol:'#f0f1f2',background:'#191b1d',swatches:['#2a2d30','#76bce7','#d56872'],light:false},
    {id:'medly',label:'Medly',title:'#102239',symbol:'#eaf6ff',background:'#112b4e',swatches:['#235da8','#3be1b2','#f3de53'],light:false}
  ];
  const find = id => choices.find(theme => theme.id === id);
  const apply = id => {
    const theme = find(id) || choices[0];
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme.id;
    return theme;
  };
  scope.PracticeThemes = {choices,find,apply};
  if (typeof module !== 'undefined') module.exports = scope.PracticeThemes;
  if (typeof document !== 'undefined') {
    let id;
    try {id = JSON.parse(localStorage.getItem('chord-lens-practice-v1'))?.config?.theme;} catch {}
    apply(id);
  }
})(globalThis);
