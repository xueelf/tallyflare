import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLocalWorker } from './serve';

async function main(): Promise<void> {
  const persistTo = mkdtempSync(join(tmpdir(), 'tallyflare-smoke-'));
  let worker: Awaited<ReturnType<typeof startLocalWorker>> | undefined;

  try {
    // 和 `bun run dev` 用同一个本地启动器。
    worker = await startLocalWorker({ persistTo });
    const origin = await worker.ready;
    const request = (path: string, init?: RequestInit) =>
      fetch(new URL(path, origin), init);

    const created = await request('/counters/smoke/page', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '192.0.2.1' },
    });

    assert.equal(created.status, 201);
    assert.equal(created.headers.get('Location'), '/counters/smoke/page');
    assert.deepEqual(await created.json(), {
      visit: 1,
      visitor: 1,
      digits: '0000001',
    });

    const read = await request('/counters/smoke/page');

    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), {
      visit: 1,
      visitor: 1,
      digits: '0000001',
    });

    const badge = await request('/counters/smoke/page/badge?theme=moebooru', {
      headers: { 'CF-Connecting-IP': '192.0.2.2' },
    });
    const badgeBody = await badge.text();

    assert.equal(badge.status, 200);
    assert.match(badgeBody, /Visits: 2/);

    const legacyMode = await request('/counters/smoke/page/badge?mode=read');
    assert.equal(legacyMode.status, 400);

    const namedSvg = await request('/counters/smoke/foo.svg', {
      method: 'POST',
    });

    assert.equal(namedSvg.status, 201);

    const namedBadge = await request(
      '/counters/smoke/foo.svg/badge?theme=moebooru',
    );

    assert.equal(namedBadge.status, 200);

    const noAccidentalCounter = await request('/counters/smoke/foo');

    assert.equal(noAccidentalCounter.status, 404);

    const docs = await request('/en/');

    assert.equal(docs.status, 200);

    const removedApi = await request('/api/counters/smoke/page');

    assert.equal(removedApi.status, 404);

    console.log('Local Worker smoke passed.');
  } finally {
    await worker?.dispose();
    rmSync(persistTo, { recursive: true, force: true });
  }
}

await main();
