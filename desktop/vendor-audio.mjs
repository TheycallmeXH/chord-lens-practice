import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {metadata} = require('./about.cjs');
const pkg = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(root,'app-info.js'),`globalThis.PracticeInfo = ${JSON.stringify(metadata(pkg.version))};\n`);
const target = path.join(root, '../assets/synth');
await mkdir(target, {recursive:true});
await mkdir(path.join(root,'../assets/midi'), {recursive:true});
await build({
  stdin:{contents:'export { BasicMIDI } from "spessasynth_core";',resolveDir:root},
  bundle:true,format:'iife',globalName:'SpessaMIDI',minify:true,
  outfile:path.join(root,'../assets/midi/midi-parser.min.js'),legalComments:'eof'
});
await build({
  stdin:{contents:'export { WorkletSynthesizer } from "spessasynth_lib";',resolveDir:root},
  bundle:true,format:'iife',globalName:'SpessaSynth',minify:true,
  outfile:path.join(target,'spessasynth.min.js'),legalComments:'eof'
});
for (const [source,destination] of [
  ['spessasynth_lib/dist/spessasynth_processor.min.js','processor.min.js'],
  ['spessasynth_lib/LICENSE','SpessaSynth-LICENSE.txt'],
  ['spessasynth_core/LICENSE','SpessaSynth-Core-LICENSE.txt'],
  ['fflate/LICENSE','fflate-LICENSE.txt'],
  ['stb-vorbis/LICENSE','stb-vorbis-LICENSE.txt']
]) await cp(path.join(root,'node_modules',source),path.join(target,destination));
