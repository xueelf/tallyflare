import { afterEach, beforeEach, expect, test } from 'bun:test';

import { createD1CounterStore } from '../src/adapters/d1';
import type { CounterKey } from '../src/core/counters';

import { createTestDatabase } from './helpers/d1';

const KEY: CounterKey = { namespace: 'site', name: 'page' };
const FIRST_IP = new Uint8Array(32).fill(1);
const SECOND_IP = new Uint8Array(32).fill(2);

let database: ReturnType<typeof createTestDatabase>;
let store: ReturnType<typeof createD1CounterStore>;

beforeEach(() => {
  database = createTestDatabase();
  store = createD1CounterStore(database.db);
});

afterEach(() => {
  database.sqlite.close();
});

test('读取不会创建计数器', async () => {
  expect(await store.read(KEY)).toBeNull();
  expect(database.sqlite.query('SELECT * FROM counters').all()).toEqual([]);
  expect(database.sqlite.query('SELECT * FROM visitors').all()).toEqual([]);
});

test('首次记录创建计数器', async () => {
  expect(await store.record(KEY, FIRST_IP)).toEqual({
    visit: 1,
    visitor: 1,
  });
  expect(await store.read(KEY)).toEqual({ visit: 1, visitor: 1 });
});

test('重复指纹只增加 visit', async () => {
  await store.record(KEY, FIRST_IP);

  expect(await store.record(KEY, new Uint8Array(FIRST_IP))).toEqual({
    visit: 2,
    visitor: 1,
  });
  expect(database.sqlite.query('SELECT * FROM visitors').all()).toHaveLength(1);
});

test('新指纹同时增加 visit 和 visitor', async () => {
  await store.record(KEY, FIRST_IP);

  expect(await store.record(KEY, SECOND_IP)).toEqual({
    visit: 2,
    visitor: 2,
  });
  expect(database.sqlite.query('SELECT * FROM visitors').all()).toHaveLength(2);
});

test('缺少指纹时只增加 visit', async () => {
  expect(await store.record(KEY, null)).toEqual({ visit: 1, visitor: 0 });
  expect(await store.record(KEY, null)).toEqual({ visit: 2, visitor: 0 });
  expect(database.sqlite.query('SELECT * FROM visitors').all()).toEqual([]);

  expect(await store.record(KEY, FIRST_IP)).toEqual({
    visit: 3,
    visitor: 1,
  });
});

test('不同计数器互不影响', async () => {
  await store.record(KEY, FIRST_IP);
  await store.record(KEY, FIRST_IP);

  expect(
    await store.record({ namespace: 'other', name: 'page' }, FIRST_IP),
  ).toEqual({ visit: 1, visitor: 1 });
  expect(
    await store.record({ namespace: 'site', name: 'other' }, FIRST_IP),
  ).toEqual({ visit: 1, visitor: 1 });
  expect(await store.read(KEY)).toEqual({ visit: 2, visitor: 1 });
});

test('访客写入失败时回滚计数', async () => {
  const first = { namespace: 'site', name: 'first' };
  const second = { namespace: 'site', name: 'second' };
  const third = { namespace: 'site', name: 'third' };

  await store.record(first, FIRST_IP);
  await store.record(second, SECOND_IP);
  database.sqlite.exec(
    'CREATE UNIQUE INDEX fail_duplicate_ip ON visitors (fingerprint)',
  );

  await expect(store.record(second, FIRST_IP)).rejects.toThrow();
  expect(await store.read(second)).toEqual({ visit: 1, visitor: 1 });

  await expect(store.record(third, FIRST_IP)).rejects.toThrow();
  expect(await store.read(third)).toBeNull();
  expect(database.sqlite.query('SELECT * FROM visitors').all()).toHaveLength(2);
});

test('拒绝超过安全整数范围', async () => {
  database.sqlite
    .query(
      'INSERT INTO counters (namespace, name, visit, visitor) VALUES (?, ?, ?, ?)',
    )
    .run('site', 'page', Number.MAX_SAFE_INTEGER, 0);

  await expect(store.record(KEY, null)).rejects.toThrow();
  expect(await store.read(KEY)).toEqual({
    visit: Number.MAX_SAFE_INTEGER,
    visitor: 0,
  });
});

test('表结构拒绝非法计数和访客记录', async () => {
  expect(() =>
    database.sqlite
      .query(
        'INSERT INTO counters (namespace, name, visit, visitor) VALUES (?, ?, ?, ?)',
      )
      .run('site', 'fraction', 1.5, 0),
  ).toThrow();

  await store.record(KEY, FIRST_IP);

  const row = database.sqlite
    .query<{ id: number }, []>('SELECT id FROM counters')
    .get()!;
  const insert = database.sqlite.query(
    'INSERT INTO visitors (counter_id, fingerprint) VALUES (?, ?)',
  );

  expect(() => insert.run(row.id, 'invalid')).toThrow();
  expect(() => insert.run(row.id, new Uint8Array(1))).toThrow();
  expect(() => insert.run(-1, SECOND_IP)).toThrow();
  expect(database.sqlite.query('SELECT * FROM visitors').all()).toHaveLength(1);
});
