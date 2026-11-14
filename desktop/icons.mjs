import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as ResEdit from 'resedit';

export async function buildIcons(root) {
  const svg = await readFile(new URL('./icons/app.svg', root));
  await sharp(svg).png().toFile(fileURLToPath(new URL('./icons/app.png', root)));
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()));
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(images[i].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  const icon = Buffer.concat([directory, ...images]);
  await writeFile(new URL('./icons/app.ico', root), icon);
  return icon;
}

export async function brandExecutable(source, destination, icon, pkg) {
  const executable = ResEdit.NtExecutable.from(await readFile(source), { ignoreCert:true });
  const resource = ResEdit.NtExecutableResource.from(executable);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries);
  const images = ResEdit.Data.IconFile.from(icon).icons.map(item => item.data);
  for (const {id, lang} of groups.length ? groups : [{id:1, lang:1033}]) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resource.entries, id, lang, images);
  }
  for (const version of ResEdit.Resource.VersionInfo.fromEntries(resource.entries)) {
    version.setStringValues({lang:1033, codepage:1200}, {
      FileDescription:pkg.productName, ProductName:pkg.productName,
      InternalName:pkg.name, OriginalFilename:`${pkg.productName}.exe`
    });
    version.setFileVersion(pkg.version, 1033);
    version.setProductVersion(pkg.version, 1033);
    version.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(executable);
  await writeFile(destination, Buffer.from(executable.generate()));
}
