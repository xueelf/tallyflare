import { $ } from 'bun';
import { join } from 'node:path';

import {
  type V4WorkerOptionsShape,
  convertV4MiniflareOptions,
  Miniflare,
} from 'miniflare';
import {
  unstable_getMiniflareWorkerOptions,
  unstable_readConfig,
} from 'wrangler';

/**
 * 用 Miniflare 在 workerd 中启动 Worker。
 * Wrangler 的开发代理在 Bun 下不可用，所以这里绕开它。
 * 迁移、类型生成和部署仍由 Wrangler 负责。
 */
export async function startLocalWorker({
  persistTo,
  port,
}: {
  persistTo: string;
  port?: number;
}): Promise<Miniflare> {
  // 复用 Wrangler 配置，保持绑定和资源一致。
  const config = unstable_readConfig({ config: 'wrangler.jsonc' });
  const { main, define, workerOptions } = unstable_getMiniflareWorkerOptions(
    config,
    undefined,
  );
  const {
    assets,
    bindings,
    compatibilityDate,
    compatibilityFlags,
    d1Databases,
  } = workerOptions as Pick<
    V4WorkerOptionsShape,
    | 'assets'
    | 'bindings'
    | 'compatibilityDate'
    | 'compatibilityFlags'
    | 'd1Databases'
  >;
  const {
    outputs: [bundle],
  } = await Bun.build({
    entrypoints: [main!],
    target: 'browser',
    define,
  });

  await $`bun run db:migrate:local --persist-to ${persistTo}`.quiet();

  return new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1',
      port,
      // Wrangler 的本地迁移也写在这个目录。
      resourcePersistencePath: join(persistTo, 'v3'),
      workers: [
        {
          name: config.name,
          modules: true,
          script: await bundle!.text(),
          compatibilityDate,
          compatibilityFlags,
          assets,
          d1Databases,
          bindings,
          stripCfConnectingIp: false,
        },
      ],
    }),
    enableDevRegistry: false,
    telemetry: { enabled: false },
  });
}

if (import.meta.main) {
  // 不传 PORT 时由 Miniflare 自动选一个空闲端口。
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;

  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 0 || port > 65535)
  ) {
    throw new Error('PORT must be an integer between 0 and 65535');
  }

  const worker = await startLocalWorker({
    persistTo: '.wrangler/state',
    port,
  });

  try {
    console.log(`Tallyflare: ${await worker.ready}`);
    await new Promise<void>(resolve => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } finally {
    await worker.dispose();
  }
}
