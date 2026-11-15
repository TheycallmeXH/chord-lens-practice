import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(root, '../assets/synth');
await mkdir(target, {recursive:true});
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
