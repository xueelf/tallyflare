import { expect, test } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateThemes } from '../scripts/themes';

test('缺少数字时构建失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'tallyflare-theme-'));
  const source = join(root, 'themes/moebooru');

  try {
    cpSync(new URL('../themes/moebooru', import.meta.url), source, {
      recursive: true,
    });
    unlinkSync(join(source, '9.gif'));

    expect(() => generateThemes(root)).toThrow(
      'Theme moebooru is missing digit 9',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
