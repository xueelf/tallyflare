import { expect, test } from 'bun:test';

import { DEFAULT_THEME } from '../../src/core/svg';
import { createThemes, handler, request } from '../helpers/core';
import { createMemoryStore } from '../helpers/memory-store';

test('GET 记录访问并渲染 SVG', async () => {
  const { store, counters } = createMemoryStore();
  const { source, loaded } = createThemes();
  const handle = handler(store, source);

  const recorded = await handle(
    request('/counters/site/badge/badge?theme=test'),
  );

  expect(recorded.status).toBe(200);
  expect(recorded.headers.get('Content-Type')).toBe(
    'image/svg+xml; charset=utf-8',
  );
  expect(await recorded.text()).toContain(
    '<title id="counter-title">Visits: 1</title>',
  );
  expect(loaded).toEqual(['test']);
  expect(counters.get('site\u0000badge')).toEqual({
    visit: 1,
    visitor: 0,
  });
});

test('未指定主题时使用默认主题', async () => {
  const { source, loaded } = createThemes();
  const response = await handler(
    createMemoryStore().store,
    source,
  )(request('/counters/site/badge/badge'));

  expect(response.status).toBe(200);
  expect(loaded).toEqual([DEFAULT_THEME]);
});

test('独立徽章不读写计数器', async () => {
  const { store, counters } = createMemoryStore();
  const { source, loaded } = createThemes();
  const response = await handler(
    store,
    source,
  )(request('/badges/1024?theme=test'));

  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe(
    'image/svg+xml; charset=utf-8',
  );
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  expect(await response.text()).toContain(
    '<title id="counter-title">Visits: 1024</title>',
  );
  expect(loaded).toEqual(['test']);
  expect(counters.size).toBe(0);
});

test('独立徽章的默认主题与 HEAD 响应', async () => {
  const { source, loaded } = createThemes();
  const handle = handler(createMemoryStore().store, source);

  const get = await handle(request('/badges/42'));
  expect(get.status).toBe(200);
  expect(await get.text()).toContain('Visits: 42');

  const head = await handle(request('/badges/42', { method: 'HEAD' }));
  expect(head.status).toBe(200);
  expect(head.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
  expect(await head.text()).toBe('');
  expect(loaded).toEqual([DEFAULT_THEME, DEFAULT_THEME]);
});

test('padding 控制前导零', async () => {
  const { source } = createThemes();
  const response = await handler(
    createMemoryStore().store,
    source,
  )(request('/badges/123456789?theme=test&padding=10'));
  const svg = await response.text();

  expect(response.status).toBe(200);
  expect(svg.match(/<use /g)).toHaveLength(10);
  expect(svg).toContain('<title id="counter-title">Visits: 123456789</title>');
});

test('拒绝非法参数和请求方法', async () => {
  const handle = handler();

  for (const path of [
    '/badges/abc',
    '/badges/1.5',
    '/badges/9007199254740992',
  ]) {
    const response = await handle(request(path));
    expect(response.status).toBe(400);
  }

  const unknownTheme = await handle(request('/badges/1?theme=missing'));
  expect(unknownTheme.status).toBe(400);
  expect(await unknownTheme.json()).toEqual({ error: 'Unknown theme' });

  for (const path of ['/badges/1?other=1', '/badges/1?theme=test&theme=test']) {
    const response = await handle(request(path));
    expect(response.status).toBe(400);
  }

  const post = await handle(request('/badges/1', { method: 'POST' }));
  expect(post.status).toBe(405);
  expect(post.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
});
