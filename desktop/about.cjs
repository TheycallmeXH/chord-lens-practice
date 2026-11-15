const {readFile} = require('node:fs/promises');
const {join} = require('node:path');
const entries = [
  {id:'project',name:'和弦镜 · 项目代码与原创图标',license:'MIT',paths:['LICENSE','licenses/APP-LICENSE.txt']},
  {id:'notices',name:'第三方组件声明',license:'Notices',paths:['THIRD_PARTY_NOTICES.md','licenses/THIRD_PARTY_NOTICES.md']},
  {id:'tonal',name:'Tonal',license:'MIT',paths:['midi-chords/vendor/tonal-LICENSE.txt']},
  {id:'lucide',name:'Lucide',license:'ISC',paths:['assets/lucide-LICENSE.txt']},
  {id:'jost',name:'Jost',license:'OFL 1.1',paths:['assets/Jost-LICENSE.txt','licenses/Jost-LICENSE.txt']},
  {id:'synth',name:'SpessaSynth lib / core',license:'Apache-2.0',paths:['assets/synth/SpessaSynth-LICENSE.txt','assets/synth/SpessaSynth-Core-LICENSE.txt'],combined:true},
  {id:'fflate',name:'fflate',license:'MIT',paths:['assets/synth/fflate-LICENSE.txt']},
  {id:'vorbis',name:'stb-vorbis',license:'Apache-2.0',paths:['assets/synth/stb-vorbis-LICENSE.txt']},
  {id:'electron',name:'Electron',license:'MIT',paths:['LICENSE'],runtime:true},
  {id:'chromium',name:'Chromium 与内置组件',license:'Third-party',external:true},
  {id:'soundfont',name:'SF2 音色库说明',license:'独立授权',paths:['soundfonts/README.md']}
];
function metadata(version) {
  return {version,author:'Katuria',repository:'https://github.com/TheycallmeXH/chord-lens-practice',
    licenses:entries.map(({id,name,license,external})=>({id,name,license,external:!!external}))};
}
async function readLicense(id,appRoot,runtimeRoot) {
  const entry = entries.find(item=>item.id===id);
  if (!entry || entry.external) throw new Error('未知的许可项目');
  const texts = [];
  for (const path of entry.paths) {
    try {
      texts.push(await readFile(join(entry.runtime?runtimeRoot:appRoot,path),'utf8'));
      if (!entry.combined) break;
    } catch (error) {if(error.code!=='ENOENT') throw error;}
  }
  if (!texts.length) throw new Error('未找到许可文件');
  return {name:entry.name,text:texts.join('\n\n')};
}
module.exports = {metadata,readLicense};
