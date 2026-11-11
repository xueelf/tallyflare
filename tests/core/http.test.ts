import { expect, spyOn, test } from 'bun:test';

import type { CounterStore } from '../../src/core/counters';
import { type ThemeSource, DEFAULT_THEME } from '../../src/core/svg';
import { createThemes, handler, request } from '../helpers/core';
import { createMemoryStore } from '../helpers/memory-store';

test('拒绝未知或重复的参数', async () => {
  const paths = [
    '/counters/site/page?theme=miku',
    '/counters/site/page/badge?other=1',
    '/counters/site/page/badge?theme=test&theme=test',
  ];

  for (const path of paths) {
    const { store, counters } = createMemoryStore();
    const response = await handler(store)(request(path));

    expect(response.status).toBe(400);
    expect(counters.size).toBe(0);
  }
});

test('拒绝非法路径段', async () => {
  const paths = [
    '/counters/%ZZ/page',
    '/counters/%20/page',
    '/counters/a%2Fb/page',
    `/counters/${'a'.repeat(129)}/page`,
  ];

  for (const path of paths) {
    const { store, counters } = createMemoryStore();
    const response = await handler(store)(request(path));

    expect(response.status).toBe(400);
    expect(counters.size).toBe(0);
  }
});

test('拒绝旧的 mode 参数', async () => {
  for (const path of [
    '/counters/site/page?mode=read',
    '/counters/site/page/badge?mode=read',
    '/badges/1?mode=read',
  ]) {
    const { store, counters } = createMemoryStore();
    const response = await handler(store)(request(path));

    expect(response.status).toBe(400);
    expect(counters.size).toBe(0);
  }
});

test('未知路由返回 404', async () => {
  const paths = [
    '/counters/site/page/extra',
    '/api/counters/site/page',
    '/counters/site/page/badge/extra',
  ];

  for (const path of paths) {
    const { store, counters } = createMemoryStore();
    const response = await handler(store)(request(path));

    expect(response.status).toBe(404);
    expect(counters.size).toBe(0);
  }
});

test('HEAD 不写入计数', async () => {
  const { store, counters } = createMemoryStore();
  const { source, loaded } = createThemes();
  const handle = handler(store, source);

  const missing = await handle(
    request('/counters/site/page', { method: 'HEAD' }),
  );

  expect(missing.status).toBe(404);
  expect(await missing.text()).toBe('');

  await handle(
    request('/counters/site/page', {
      method: 'POST',
      headers: { 'X-Visitor': 'alice' },
    }),
  );

  const json = await handle(request('/counters/site/page', { method: 'HEAD' }));
  const svg = await handle(
    request('/counters/site/page/badge', { method: 'HEAD' }),
  );
  const invalid = await handle(
    request('/counters/site/page/badge?theme=unknown', {
      method: 'HEAD',
    }),
  );

  expect(json.status).toBe(200);
  expect(await json.text()).toBe('');
  expect(json.headers.get('Content-Type')).toBe(
    'application/json; charset=utf-8',
  );
  expect(svg.status).toBe(200);
  expect(await svg.text()).toBe('');
  expect(svg.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
  expect(invalid.status).toBe(400);
  expect(await invalid.text()).toBe('');
  expect(counters.get('site\u0000page')).toEqual({
    visit: 1,
    visitor: 1,
  });
  expect(loaded).toEqual([DEFAULT_THEME, 'unknown']);
});

test.each([
  ['/counters/site/page', 'GET, HEAD, POST, OPTIONS'],
  ['/counters/site/page/badge', 'GET, HEAD, OPTIONS'],
])('%s 的 OPTIONS 与不支持方法', async (path, allow) => {
  const failingStore: CounterStore = {
    read: async () => {
      throw new Error('Database must not be read');
    },
    record: async () => {
      throw new Error('Database must not be written');
    },
  };
  const handle = handler(failingStore);
  const options = await handle(request(path, { method: 'OPTIONS' }));
  const rejected = await handle(request(path, { method: 'DELETE' }));

  expect(options.status).toBe(204);
  expect(await options.text()).toBe('');
  expect(options.headers.get('Allow')).toBe(allow);
  expect(options.headers.get('Access-Control-Allow-Methods')).toBe(allow);
  expect(rejected.status).toBe(405);
  expect(rejected.headers.get('Allow')).toBe(allow);
});

test('CORS 与缓存响应头', async () => {
  const { store } = createMemoryStore();
  const handle = handler(store);
  const created = await handle(
    request('/counters/site/page', { method: 'POST' }),
  );
  const read = await handle(request('/counters/site/page'));
  const svg = await handle(request('/counters/site/page/badge'));

  for (const response of [created, read, svg]) {
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  }

  expect(created.headers.get('Access-Control-Expose-Headers')).toBe('Location');
  expect(created.headers.get('Location')).toBe('/counters/site/page');
});

test('主题加载失败时不记录访问', async () => {
  const { store, counters } = createMemoryStore();
  const themes: ThemeSource = {
    load: async () => {
      throw new Error('theme asset is missing');
    },
  };
  const log = spyOn(console, 'error').mockImplementation(() => {});

  try {
    const response = await handler(
      store,
      themes,
    )(request('/counters/site/page/badge?theme=test'));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: 'Internal server error' });
    expect(body).not.toContain('theme asset');
    expect(counters.size).toBe(0);
  } finally {
    log.mockRestore();
  }
});

test('不泄露存储错误', async () => {
  const failingStore: CounterStore = {
    read: async () => {
      throw new Error('secret database detail');
    },
    record: async () => {
      throw new Error('secret database detail');
    },
  };
  const log = spyOn(console, 'error').mockImplementation(() => {});

  try {
    const response = await handler(failingStore)(
      request('/counters/site/page'),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: 'Internal server error' });
    expect(body).not.toContain('secret');
  } finally {
    log.mockRestore();
  }
});
