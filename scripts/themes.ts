import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { type Theme } from '../src/core/svg';

type ImageExtension = 'png' | 'gif';

function imageSize(bytes: Uint8Array, extension: ImageExtension, file: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width: number;
  let height: number;

  if (
    extension === 'png' &&
    bytes.length >= 33 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10 &&
    view.getUint32(8) === 13 &&
    new TextDecoder().decode(bytes.subarray(12, 16)) === 'IHDR'
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (
    extension === 'gif' &&
    bytes.length >= 13 &&
    /^(GIF87a|GIF89a)$/.test(new TextDecoder().decode(bytes.subarray(0, 6)))
  ) {
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else {
    throw new Error(`Unsupported or invalid image: ${file}`);
  }

  if (width === 0 || height === 0) {
    throw new Error(`Image dimensions must be positive: ${file}`);
  }
  return { width, height };
}

async function list(cwd: string, pattern: string, onlyFiles: boolean) {
  const entries: string[] = [];

  for await (const entry of new Bun.Glob(pattern).scan({ cwd, onlyFiles })) {
    entries.push(entry);
  }
  return entries.sort((left, right) => left.localeCompare(right, 'en'));
}

export async function generateThemes(
  root = resolve(import.meta.dir, '..'),
  outdir = join(root, 'dist/themes'),
): Promise<string[]> {
  const source = join(root, 'themes');
  const themes = new Map<string, Theme>();

  for (const directory of await list(source, '*', false)) {
    const themePath = join(source, directory);
    const stats = await Bun.file(themePath).stat();

    if (!stats.isDirectory()) {
      continue;
    }
    const theme: Theme = {};

    for (const entry of await list(themePath, '*', true)) {
      const match = /^([0-9]|_start|_end)\.(png|gif)$/.exec(entry);

      if (!match) {
        continue;
      }
      const character = match[1]!;
      const extension = match[2] as ImageExtension;
      const file = join(themePath, entry);
      const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());

      theme[character] = {
        ...imageSize(bytes, extension, file),
        dataUri: `data:image/${extension};base64,${bytes.toBase64()}`,
      };
    }

    for (const digit of '0123456789') {
      if (!theme[digit]) {
        throw new Error(`Theme ${directory} is missing digit ${digit}`);
      }
    }
    themes.set(directory, theme);
  }
  await mkdir(outdir, { recursive: true });

  for (const file of await list(outdir, '*.json', true)) {
    if (!themes.has(file.slice(0, -5))) {
      await rm(join(outdir, file));
    }
  }

  for (const [name, theme] of themes) {
    await Bun.write(join(outdir, `${name}.json`), `${JSON.stringify(theme)}\n`);
  }
  return [...themes.keys()];
}

if (import.meta.main) {
  console.log(`Generated ${(await generateThemes()).length} counter themes.`);
}
