import { createD1CounterStore } from './adapters/d1';
import { createThemeSource } from './adapters/themes';
import type { VisitorFingerprint } from './core/counters';
import { createCounterHandler } from './core/handler';

async function identifyVisitor(
  request: Request,
): Promise<VisitorFingerprint | null> {
  const ip = request.headers.get('CF-Connecting-IP');

  if (!ip) {
    return null;
  }

  // 只把 IP 的 SHA-256 哈希写入 D1，原始地址不进数据库。
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip),
  );

  return new Uint8Array(digest);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 计数路由之外的请求交给静态资源绑定，文档也在这里。
    if (
      !url.pathname.startsWith('/counters/') &&
      !url.pathname.startsWith('/badges/')
    ) {
      return env.ASSETS.fetch(request);
    }

    const handle = createCounterHandler({
      store: createD1CounterStore(env.DB),
      themes: createThemeSource(env.ASSETS, url.origin),
      identifyVisitor,
    });

    return handle(request);
  },
} satisfies ExportedHandler<Env>;
