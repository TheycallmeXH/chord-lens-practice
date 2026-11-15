const {open,readFile,writeFile,stat} = require('node:fs/promises');
const {join,basename} = require('node:path');

function createSoundfontStore(appRoot,userData) {
  const preference = join(userData,'soundfont.json');
  const defaults = ['Equinox_Grand_Pianos.sf2','akai_steinway.sf2'].map(name=>join(appRoot,'soundfonts',name));
  let selected;
  async function inspect(file) {
    const info = await stat(file);
    if(!info.isFile() || info.size<12 || info.size>512*1024*1024) throw new Error('音色文件大小无效');
    const handle = await open(file,'r');
    try {
      const header=Buffer.alloc(12);
      await handle.read(header,0,12,0);
      if(header.toString('ascii',0,4)!=='RIFF' || header.toString('ascii',8,12)!=='sfbk' ||
        header.readUInt32LE(4)+8>info.size) throw new Error('请选择有效的 SF2 文件');
    } finally {await handle.close();}
    return {name:basename(file),bytes:info.size};
  }
  async function source() {
    if(selected) {
      try {await inspect(selected);return selected;} catch {selected=undefined;}
    }
    try {
      const stored=JSON.parse(await readFile(preference,'utf8'));
      if(typeof stored.path==='string') {await inspect(stored.path);selected=stored.path;return selected;}
    } catch {}
    for(const file of defaults) {
      try {await inspect(file);selected=file;return file;} catch {}
    }
    throw new Error('未找到钢琴音色，请在设置中选择 SF2 文件');
  }
  return {
    async info() {
      try {return {...await inspect(await source()),available:true};}
      catch {return {name:'选择 SF2',available:false};}
    },
    async load() {
      const file=await source();
      await inspect(file);
      const bytes=await readFile(file);
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    },
    async choose(file) {
      const info=await inspect(file);
      await writeFile(preference,JSON.stringify({path:file}),'utf8');
      selected=file;
      return {...info,available:true};
    }
  };
}
module.exports={createSoundfontStore};
