import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

import { type Theme, DEFAULT_THEME, renderCounter } from '../src/core/svg';

const names = readdirSync(new URL('../dist/themes', import.meta.url)).map(
  file => file.slice(0, -5),
);

function readTheme(name: string): Theme {
  return JSON.parse(
    readFileSync(
      new URL(`../dist/themes/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as Theme;
}

test('构建的主题包含完整数字图片', () => {
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain(DEFAULT_THEME);

  for (const name of names) {
    const theme = readTheme(name);

    expect(Object.keys(theme).length).toBeGreaterThanOrEqual(10);

    for (const character of Object.keys(theme)) {
      expect(character).toMatch(/^([0-9]|_start|_end)$/);
    }

    for (const digit of '0123456789') {
      expect(theme[digit]?.width).toBeGreaterThan(0);
      expect(theme[digit]?.height).toBeGreaterThan(0);
      expect(theme[digit]?.dataUri).toMatch(/^data:image\/(png|gif);base64,/);
    }
  }
});

test('重复数字在 SVG 中只定义一次', () => {
  const svg = renderCounter(111, readTheme(DEFAULT_THEME));

  expect(svg.match(/<image /g)).toHaveLength(2);
  expect(svg.match(/<use /g)).toHaveLength(7);
  expect(svg).toContain('id="glyph-0"');
  expect(svg).toContain('id="glyph-1"');
  expect(svg).toContain('data:image/gif;base64,');
  expect(svg).toContain('<title id="counter-title">Visits: 111</title>');
  expect(svg).not.toContain('xlink:');
});

test('padding 控制前导零', () => {
  const svg = renderCounter(123456789, readTheme(DEFAULT_THEME), 10);

  expect(svg.match(/<use /g)).toHaveLength(10);
  expect(svg).toContain('<title id="counter-title">Visits: 123456789</title>');

  expect(() => renderCounter(1, readTheme(DEFAULT_THEME), 17)).toThrow(
    RangeError,
  );
  expect(() => renderCounter(1, readTheme(DEFAULT_THEME), -1)).toThrow(
    RangeError,
  );
});

test('capoo-2 的起止装饰参与渲染', () => {
  const theme = readTheme('capoo-2');
  const svg = renderCounter(0, theme);
  const width = theme._start!.width + 7 * theme['0']!.width + theme._end!.width;
  const height = Math.max(
    theme._start!.height,
    theme['0']!.height,
    theme._end!.height,
  );

  expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
  expect(svg.match(/<image /g)).toHaveLength(3);
  expect(svg.match(/<use /g)).toHaveLength(9);
  expect(svg.indexOf('<use href="#glyph-_start"')).toBeLessThan(
    svg.indexOf('<use href="#glyph-0"'),
  );
  expect(svg.indexOf('<use href="#glyph-_end"')).toBeGreaterThan(
    svg.lastIndexOf('<use href="#glyph-0"'),
  );
});

test('不截断最大安全整数', () => {
  const visit = Number.MAX_SAFE_INTEGER;
  const svg = renderCounter(visit, readTheme(DEFAULT_THEME));

  expect(svg.match(/<use /g)).toHaveLength(String(visit).length);
  expect(svg).toContain(`Visits: ${visit}`);
});

test('拒绝非法计数和不完整主题', () => {
  const theme = readTheme(DEFAULT_THEME);

  for (const visit of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => renderCounter(visit, theme)).toThrow(RangeError);
  }

  delete theme['2'];
  expect(() => renderCounter(12, theme)).toThrow(
    'Missing counter character: 2',
  );
});
