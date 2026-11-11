import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { type Theme } from '../src/core/svg';

function imageSize(buffer: Buffer, extension: string, file: string) {
  let width: number;
  let height: number;

  if (
    extension === 'png' &&
    buffer.length >= 33 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.readUInt32BE(8) === 13 &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  ) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (
    extension === 'gif' &&
    buffer.length >= 13 &&
    /^(GIF87a|GIF89a)$/.test(buffer.toString('ascii', 0, 6))
  ) {
    width = buffer.readUInt16LE(6);
    height = buffer.readUInt16LE(8);
  } else {
    throw new Error(`Unsupported or invalid image: ${file}`);
  }

  if (width === 0 || height === 0) {
    throw new Error(`Image dimensions must be positive: ${file}`);
  }

  return { width, height };
}

export function generateThemes(
  root = resolve(import.meta.dir, '..'),
  outdir = join(root, 'dist/themes'),
): string[] {
  const source = join(root, 'themes');
  const themes = new Map<string, Theme>();

  for (const directory of readdirSync(source, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name, 'en'),
  )) {
    if (!directory.isDirectory()) {
      continue;
    }

    const theme: Theme = {};
    const themePath = join(source, directory.name);

    for (const entry of readdirSync(themePath, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name, 'en'),
    )) {
      const match = /^([0-9]|_start|_end)\.(png|gif)$/.exec(entry.name);

      if (!entry.isFile() || !match) {
        continue;
      }

      const character = match[1]!;
      const extension = match[2]!;
      const file = join(themePath, entry.name);
      const buffer = readFileSync(file);

      theme[character] = {
        ...imageSize(buffer, extension, file),
        dataUri: `data:image/${extension};base64,${buffer.toString('base64')}`,
      };
    }

    for (const digit of '0123456789') {
      if (!theme[digit]) {
        throw new Error(`Theme ${directory.name} is missing digit ${digit}`);
      }
    }

    themes.set(directory.name, theme);
  }

  mkdirSync(outdir, { recursive: true });

  for (const file of readdirSync(outdir)) {
    if (file.endsWith('.json') && !themes.has(file.slice(0, -5))) {
      unlinkSync(join(outdir, file));
    }
  }

  for (const [name, theme] of themes) {
    writeFileSync(join(outdir, `${name}.json`), `${JSON.stringify(theme)}\n`);
  }

  return [...themes.keys()];
}

if (import.meta.main) {
  console.log(`Generated ${generateThemes().length} counter themes.`);
}
