import { expect, test } from 'bun:test';

import {
  counter,
  createThemes,
  digits,
  handler,
  request,
} from '../helpers/core';
import { createMemoryStore } from '../helpers/memory-store';

test('POST 写入，GET 读取', async () => {
  const { store, counters } = createMemoryStore();
  const handle = handler(store);

  const created = await handle(
    request('/counters/site/page', {
      method: 'POST',
      headers: { 'X-Visitor': 'alice' },
    }),
  );

  expect(created.status).toBe(201);
  expect(created.headers.get('Location')).toBe('/counters/site/page');
  expect(await counter(created)).toEqual({
    visit: 1,
    visitor: 1,
    digits: digits(1),
  });

  const read = await handle(request('/counters/site/page'));

  expect(read.status).toBe(200);
  expect(await counter(read)).toEqual({
    visit: 1,
    visitor: 1,
    digits: digits(1),
  });
  expect(counters.size).toBe(1);

  const repeated = await handle(
    request('/counters/site/page', {
      method: 'POST',
      headers: { 'X-Visitor': 'alice' },
    }),
  );

  expect(repeated.status).toBe(200);
  expect(repeated.headers.has('Location')).toBe(false);
  expect(await counter(repeated)).toEqual({
    visit: 2,
    visitor: 1,
    digits: digits(2),
  });

  const other = await handle(
    request('/counters/site/page', {
      method: 'POST',
      headers: { 'X-Visitor': 'bob' },
    }),
  );

  expect(await counter(other)).toEqual({
    visit: 3,
    visitor: 2,
    digits: digits(3),
  });
});

test('返回补零后的 digits', async () => {
  const { store } = createMemoryStore();
  const handle = handler(store);

  const created = await handle(
    request('/counters/site/page?padding=7', { method: 'POST' }),
  );

  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({
    visit: 1,
    visitor: 0,
    digits: '0000001',
  });

  const read = await handle(request('/counters/site/page?padding=3'));

  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({
    visit: 1,
    visitor: 0,
    digits: '001',
  });

  const defaulted = await handle(request('/counters/site/page'));

  expect(await defaulted.json()).toEqual({
    visit: 1,
    visitor: 0,
    digits: '0000001',
  });

  for (const query of [
    'padding=17',
    'padding=x',
    'padding=1&padding=2',
    'unknown=1',
  ]) {
    const invalid = await handle(request(`/counters/site/page?${query}`));

    expect(invalid.status).toBe(400);
  }
});

test('GET 不存在的计数器返回 404', async () => {
  const { store, counters } = createMemoryStore();
  const response = await handler(store)(request('/counters/site/missing'));

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Counter not found' });
  expect(counters.size).toBe(0);
});

test('POST 不读取请求体', async () => {
  const { store } = createMemoryStore();
  const response = await handler(store)(
    request('/counters/site/page', {
      method: 'POST',
      body: JSON.stringify({ unexpected: true }),
    }),
  );

  expect(response.status).toBe(201);
  expect(await counter(response)).toEqual({
    visit: 1,
    visitor: 0,
    digits: digits(1),
  });
});

test('名称中的点号不会被特殊处理', async () => {
  const { store, counters } = createMemoryStore();
  const { source, loaded } = createThemes();
  const handle = handler(store, source);

  const created = await handle(
    request('/counters/site/foo.svg', {
      method: 'POST',
      headers: { 'X-Visitor': 'alice' },
    }),
  );

  expect(created.status).toBe(201);
  expect(await counter(created)).toEqual({
    visit: 1,
    visitor: 1,
    digits: digits(1),
  });
  expect(counters.has('site\u0000foo.svg')).toBe(true);
  expect(counters.has('site\u0000foo')).toBe(false);

  expect(
    await counter(await handle(request('/counters/site/foo.svg'))),
  ).toEqual({ visit: 1, visitor: 1, digits: digits(1) });
  expect(
    await counter(await handle(request('/counters/site/foo%2Esvg'))),
  ).toEqual({ visit: 1, visitor: 1, digits: digits(1) });

  const badge = await handle(
    request('/counters/site/foo.svg/badge?theme=test'),
  );

  expect(badge.status).toBe(200);
  expect(await badge.text()).toContain('Visits: 2');
  expect(counters.get('site\u0000foo.svg')).toEqual({
    visit: 2,
    visitor: 1,
  });
  expect(counters.has('site\u0000foo')).toBe(false);

  const encodedBadge = await handle(
    request('/counters/site/foo%2Esvg/badge?theme=test'),
  );

  expect(encodedBadge.status).toBe(200);
  expect(await encodedBadge.text()).toContain('Visits: 3');
  expect(loaded).toEqual(['test', 'test']);
});

test('长度按 Unicode 字符计算', async () => {
  const { store } = createMemoryStore();
  const namespace = '😀'.repeat(65);
  const response = await handler(store)(
    request(`/counters/${encodeURIComponent(namespace)}/page`, {
      method: 'POST',
    }),
  );

  expect(response.status).toBe(201);
});

test('路径只解码一次', async () => {
  const { store, counters } = createMemoryStore();
  const handle = handler(store);

  const created = await handle(
    request('/counters/site/literal%252Esvg', { method: 'POST' }),
  );

  expect(created.status).toBe(201);
  expect(counters.has('site\u0000literal%2Esvg')).toBe(true);
  expect(counters.has('site\u0000literal.svg')).toBe(false);

  expect(
    await counter(await handle(request('/counters/site/literal%252Esvg'))),
  ).toEqual({ visit: 1, visitor: 0, digits: digits(1) });

  const unicode = await handle(
    request('/counters/site/%E8%AE%A1%E6%95%B0', { method: 'POST' }),
  );

  expect(unicode.status).toBe(201);
  expect(counters.has('site\u0000计数')).toBe(true);
});

test('访客按计数器分别去重', async () => {
  const { store } = createMemoryStore();
  const handle = handler(store);
  const record = (visitor?: string) =>
    handle(
      request('/counters/site/page', {
        method: 'POST',
        ...(visitor ? { headers: { 'X-Visitor': visitor } } : {}),
      }),
    );

  expect(await counter(await record('alice'))).toEqual({
    visit: 1,
    visitor: 1,
    digits: digits(1),
  });
  expect(await counter(await record('alice'))).toEqual({
    visit: 2,
    visitor: 1,
    digits: digits(2),
  });
  expect(await counter(await record('bob'))).toEqual({
    visit: 3,
    visitor: 2,
    digits: digits(3),
  });
  expect(await counter(await record())).toEqual({
    visit: 4,
    visitor: 2,
    digits: digits(4),
  });
});
