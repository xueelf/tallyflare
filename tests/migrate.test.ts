import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMigration, writeMigrationFiles } from '../scripts/migrate';

const schema = readFileSync(
  new URL('../migrations/0001_counters.sql', import.meta.url),
  'utf8',
);

function migrate(snapshot: Record<string, string | null>) {
  const database = new Database(':memory:');
  database.exec(schema);
  const result = buildMigration(snapshot);
  database.exec(result.sql);
  return { database, result };
}

test('生成 counters 和 visitors 数据，不写入原始 IP', () => {
  const { database, result } = migrate({
    'hits:github:readme:visit': '3',
    'hits:github:readme:visitor': '2',
    'hits:github:readme:ip:203.0.113.1': '1700000000000',
    'hits:github:readme:ip:2001:db8::1': '1700000000001',
  });

  expect(result.counters).toBe(1);
  expect(result.fingerprints).toBe(2);
  expect(database.query('SELECT visit, visitor FROM counters').get()).toEqual({
    visit: 3,
    visitor: 2,
  });
  expect(
    database.query('SELECT length(fingerprint) AS size FROM visitors').all(),
  ).toEqual([{ size: 32 }, { size: 32 }]);
  expect(result.sql).not.toContain('203.0.113.1');
  expect(result.sql).not.toContain('2001:db8::1');
});

test('保留旧 visitor，不用 IP 数量覆盖', () => {
  const { result, database } = migrate({
    'hits:github:readme:visit': '10',
    'hits:github:readme:visitor': '2',
    'hits:github:readme:ip:203.0.113.1': '1',
    'hits:github:readme:ip:203.0.113.2': '2',
  });

  expect(result.warnings.length).toBe(0);
  expect(result.fingerprints).toBe(2);
  expect(database.query('SELECT visit, visitor FROM counters').get()).toEqual({
    visit: 10,
    visitor: 2,
  });
});

test('拒绝缺少访问数的计数器', () => {
  expect(() => buildMigration({ 'hits:github:readme:visitor': '1' })).toThrow(
    'has no visit count',
  );
});

test('visitor 大于 visit 时截断到 visit', () => {
  const { result, database } = migrate({
    'hits:github:readme:visit': '1',
    'hits:github:readme:visitor': '2',
  });

  expect(result.warnings.length).toBe(1);
  expect(database.query('SELECT visit, visitor FROM counters').get()).toEqual({
    visit: 1,
    visitor: 1,
  });
});

test('转义计数器名称中的引号', () => {
  const { database } = migrate({
    "hits:github:readme's:visit": '1',
  });

  expect(database.query('SELECT namespace, name FROM counters').get()).toEqual({
    namespace: 'github',
    name: "readme's",
  });
});

test('每次转换使用独立输出目录', () => {
  const result = buildMigration({
    'hits:github:readme:visit': '1',
    'hits:github:readme:ip:203.0.113.1': '1',
  });
  const parent = mkdtempSync(join(tmpdir(), 'tally-migration-'));
  const directory = join(parent, 'out');

  try {
    const files = writeMigrationFiles(result, directory, 1);

    expect(files).toHaveLength(2);
    expect(readdirSync(directory).sort()).toEqual([
      'migration-001.sql',
      'migration-002.sql',
    ]);
    expect(() => writeMigrationFiles(result, directory, 1)).toThrow(
      'Output directory already exists',
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('参数错误时立即退出且不创建输出目录', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tally-cli-'));
  const input = join(directory, 'kv.json');
  const script = fileURLToPath(
    new URL('../scripts/migrate.ts', import.meta.url),
  );
  writeFileSync(
    input,
    JSON.stringify({
      'hits:github:readme:visit': '1',
    }),
  );

  try {
    const missingOutput = spawnSync(
      process.execPath,
      [script, 'convert', input, '--chunk-size', '1'],
      { cwd: directory, encoding: 'utf8' },
    );
    const missingChunk = spawnSync(
      process.execPath,
      [script, 'convert', input, join(directory, 'out'), '--chunk-size'],
      { cwd: directory, encoding: 'utf8' },
    );

    expect(missingOutput.status).not.toBe(0);
    expect(missingChunk.status).not.toBe(0);
    expect(existsSync(join(directory, '--chunk-size'))).toBe(false);
    expect(existsSync(join(directory, 'out'))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('超过 999 个分块时按编号顺序完整导入', () => {
  const snapshot: Record<string, string> = {};

  for (let index = 0; index < 500; index += 1) {
    snapshot[`hits:site:counter-${index}:visit`] = '1';
    snapshot[`hits:site:counter-${index}:ip:203.0.113.${index % 254}`] = '1';
  }

  const result = buildMigration(snapshot);
  const parent = mkdtempSync(join(tmpdir(), 'tally-chunks-'));
  const directory = join(parent, 'out');

  try {
    const files = writeMigrationFiles(result, directory, 1);

    expect(files).toHaveLength(1000);
    expect(files[0]).toEndWith('migration-0001.sql');
    expect(files[999]).toEndWith('migration-1000.sql');

    const database = new Database(':memory:');
    database.exec(schema);

    for (const file of readdirSync(directory).sort()) {
      database.exec(readFileSync(join(directory, file), 'utf8'));
    }

    expect(
      database.query('SELECT count(*) AS count FROM counters').get(),
    ).toEqual({ count: 500 });
    expect(
      database.query('SELECT count(*) AS count FROM visitors').get(),
    ).toEqual({ count: 500 });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
