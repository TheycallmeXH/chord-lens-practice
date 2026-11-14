import { cp, mkdir, readFile, writeFile, unlink, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIcons, brandExecutable } from './icons.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const exists = file => access(file).then(() => true, () => false);
const localFonts = !process.argv.includes('--public') &&
  (await Promise.all(['AbletonSans-Light.ttf','AbletonSansSmall-Bold.ttf'].map(file => exists(path.join(root,'../midi-chords/fonts',file))))).every(Boolean);
const icon = await buildIcons(new URL('./', import.meta.url));
const destination = path.join(root, '../dist/和弦镜练琴版');
await mkdir(destination, { recursive: true });
await cp(path.join(root, 'README.md'), path.join(destination, '使用说明.md'));
await cp(path.join(root, 'node_modules/electron/dist'), destination, { recursive: true });
await brandExecutable(path.join(destination, 'electron.exe'), path.join(destination, '和弦镜练琴版.exe'), icon, pkg);
await unlink(path.join(destination, 'electron.exe'));
const app = path.join(destination, 'resources/app');
await rm(app, {recursive:true,force:true});
await mkdir(path.join(app, 'desktop'), { recursive: true });
await cp(path.join(root, 'icons'), path.join(app, 'desktop/icons'), { recursive:true });
for (const file of ['main.cjs', 'preload.cjs', 'index.html', 'style.css', 'themes.css', 'themes.js', 'renderer.js', 'practice.js']) {
  await cp(path.join(root, file), path.join(app, 'desktop', file));
}
for (const file of ['engine.js', 'vendor/tonal.min.js', 'vendor/tonal-LICENSE.txt',
  ...(localFonts ? ['fonts/AbletonSans-Light.ttf', 'fonts/AbletonSansSmall-Bold.ttf'] : [])]) {
  await mkdir(path.dirname(path.join(app, 'midi-chords', file)), { recursive: true });
  await cp(path.join(root, '../midi-chords', file), path.join(app, 'midi-chords', file));
}
await mkdir(path.join(app, 'assets'), { recursive: true });
for (const file of ['lucide.min.js', 'lucide-LICENSE.txt', ...(!localFonts ? ['Jost.ttf','Jost-LICENSE.txt'] : [])]) {
  await cp(path.join(root, '../assets', file), path.join(app, 'assets', file));
}
if (!localFonts) {
  const cssPath = path.join(app,'desktop/style.css'), htmlPath = path.join(app,'desktop/index.html');
  const css = await readFile(cssPath,'utf8'), html = await readFile(htmlPath,'utf8');
  await writeFile(cssPath,css.replace(/^@font-face.*\r?\n@font-face.*\r?\n/,
    '@font-face { font-family: "Practice Ableton"; src: local("Ableton Sans"), url("../assets/Jost.ttf") format("truetype"); font-weight: 100 900; }\n'));
  await writeFile(htmlPath,html.replace('字体：Ableton Sans；','字体：Jost / 本机 Ableton Sans；'));
}
for (const file of ['LICENSE','THIRD_PARTY_NOTICES.md']) {
  const source = path.join(root,'..',file);
  if (await exists(source)) await cp(source,path.join(destination,file === 'LICENSE' ? 'APP-LICENSE.txt' : file));
}
delete pkg.devDependencies;
delete pkg.scripts;
pkg.main = 'desktop/main.cjs';
await writeFile(path.join(app, 'package.json'), JSON.stringify(pkg, null, 2));
console.log(`Built Windows desktop: ${path.join(destination, '和弦镜练琴版.exe')}`);
