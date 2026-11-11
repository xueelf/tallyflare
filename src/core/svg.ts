interface Glyph {
  width: number;
  height: number;
  dataUri: string;
}

/** 主题图片，按数字字符和可选的 `_start`/`_end` 索引。 */
export type Theme = Record<string, Glyph>;

export interface ThemeSource {
  load(name: string): Promise<Theme | null>;
}

export const DEFAULT_THEME = 'moebooru';

export function renderCounter(
  visit: number,
  theme: Theme,
  padding = 7,
): string {
  if (!Number.isSafeInteger(visit) || visit < 0) {
    throw new RangeError('Visit count must be a nonnegative safe integer');
  }

  if (!Number.isInteger(padding) || padding < 0 || padding > 16) {
    throw new RangeError('Padding must be an integer between 0 and 16');
  }

  const characters = String(visit).padStart(padding, '0').split('');

  if (theme._start) {
    characters.unshift('_start');
  }

  if (theme._end) {
    characters.push('_end');
  }

  const definitions = new Map<string, string>();
  const instances: string[] = [];

  let width = 0;
  let height = 0;

  for (const character of characters) {
    const image = theme[character];

    if (!image) {
      throw new Error(`Missing counter character: ${character}`);
    }

    const id = `glyph-${character}`;

    if (!definitions.has(character)) {
      definitions.set(
        character,
        `<image id="${id}" width="${image.width}" height="${image.height}" href="${image.dataUri}"/>`,
      );
    }

    instances.push(`<use href="#${id}" x="${width}"/>`);
    width += image.width;
    height = Math.max(height, image.height);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="counter-title">`,
    `<title id="counter-title">Visits: ${visit}</title>`,
    '<style>svg{image-rendering:pixelated}@media(prefers-color-scheme:dark){svg{filter:brightness(.6)}}</style>',
    `<defs>${[...definitions.values()].join('')}</defs>`,
    `<g>${instances.join('')}</g>`,
    '</svg>',
  ].join('\n');
}
