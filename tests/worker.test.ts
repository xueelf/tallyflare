import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import worker from '../src/worker';

import { createTestDatabase } from './helpers/d1';

const ORIGIN = 'https://counter.example.com';

let database: ReturnType<typeof createTestDatabase>;
let env: Env;

beforeEach(() => {
  database = createTestDatabase();
  env = {
    DB: database.db,
    ASSETS: {
      async fetch(input: RequestInfo | URL) {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );

        if (url.pathname.startsWith('/themes/')) {
          try {
            return new Response(
              await readFile(
                new URL(`../dist${url.pathname}`, import.meta.url),
              ),
              { headers: { 'Content-Type': 'application/json' } },
            );
          } catch {
            return new Response('Not found', { status: 404 });
          }
        }

        return new Response('Documentation', {
          headers: { 'Content-Type': 'text/html' },
        });
      },
    } as unknown as Fetcher,
  } as Env;
});

afterEach(() => {
  database.sqlite.close();
});

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

test('Worker 连接 D1、主题和访客身份', async () => {
  const image = await worker.fetch(
    request('/counters/github/badge/badge?theme=capoo-2', {
      headers: { 'CF-Connecting-IP': '192.0.2.1' },
    }),
    env,
  );

  expect(image.status).toBe(200);
  expect(image.headers.get('Content-Type')).toStartWith('image/svg+xml');
  expect(await image.text()).toContain('Visits: 1');

  const read = await worker.fetch(request('/counters/github/badge'), env);

  expect(await read.json()).toEqual({
    visit: 1,
    visitor: 1,
    digits: '0000001',
  });

  const rows = database.sqlite
    .query<{ fingerprint: Uint8Array }, []>('SELECT fingerprint FROM visitors')
    .all();

  expect(rows).toHaveLength(1);
  expect(rows[0]?.fingerprint).toEqual(
    new Uint8Array(createHash('sha256').update('192.0.2.1').digest()),
  );
  expect(JSON.stringify(rows)).not.toContain('192.0.2.1');
});

test('POST 缺少客户端 IP 时仍返回 201', async () => {
  const created = await worker.fetch(
    request('/counters/github/json', { method: 'POST' }),
    env,
  );

  expect(created.status).toBe(201);
  expect(created.headers.get('Location')).toBe('/counters/github/json');
  expect(await created.json()).toEqual({
    visit: 1,
    visitor: 0,
    digits: '0000001',
  });

  const read = await worker.fetch(request('/counters/github/json'), env);

  expect(await read.json()).toEqual({
    visit: 1,
    visitor: 0,
    digits: '0000001',
  });
});

test('独立徽章不访问 D1', async () => {
  const image = await worker.fetch(request('/badges/1024?theme=capoo-2'), env);

  expect(image.status).toBe(200);
  expect(image.headers.get('Content-Type')).toStartWith('image/svg+xml');
  expect(await image.text()).toContain('Visits: 1024');
  expect(database.sqlite.query('SELECT * FROM counters').all()).toHaveLength(0);
});

test('HEAD 不增加计数，静态资源正常返回', async () => {
  const missing = await worker.fetch(
    request('/counters/github/head', { method: 'HEAD' }),
    env,
  );

  expect(missing.status).toBe(404);
  expect(await missing.text()).toBe('');

  await worker.fetch(request('/counters/github/head', { method: 'POST' }), env);

  const json = await worker.fetch(
    request('/counters/github/head', { method: 'HEAD' }),
    env,
  );
  const svg = await worker.fetch(
    request('/counters/github/head/badge', { method: 'HEAD' }),
    env,
  );

  expect(json.status).toBe(200);
  expect(await json.text()).toBe('');
  expect(svg.status).toBe(200);
  expect(await svg.text()).toBe('');

  const read = await worker.fetch(request('/counters/github/head'), env);

  expect(await read.json()).toEqual({
    visit: 1,
    visitor: 0,
    digits: '0000001',
  });

  const docs = await worker.fetch(request('/zh/'), env);

  expect(await docs.text()).toBe('Documentation');
});

test('未知主题不记录访问', async () => {
  const response = await worker.fetch(
    request('/counters/github/unknown/badge?theme=unknown'),
    env,
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Unknown theme' });
  expect(database.sqlite.query('SELECT * FROM counters').all()).toHaveLength(0);
});
