import type {
  Counter,
  CounterKey,
  CounterStore,
  VisitorFingerprint,
} from './counters';
import {
  type Theme,
  type ThemeSource,
  DEFAULT_THEME,
  renderCounter,
} from './svg';

export interface AppDependencies {
  store: CounterStore;
  themes: ThemeSource;
  /** 从请求中生成访客指纹。 */
  identifyVisitor(request: Request): Promise<VisitorFingerprint | null>;
}

interface JsonRequest {
  kind: 'json';
  key: CounterKey;
  padding: number;
}

interface SvgRequest {
  kind: 'svg';
  key: CounterKey;
  theme: string;
  padding: number;
}

interface BadgeRequest {
  kind: 'badge';
  visit: number;
  theme: string;
  padding: number;
}

type CounterRequest = JsonRequest | SvgRequest | BadgeRequest;

const JSON_PATH = /^\/counters\/([^/]+)\/([^/]+)$/;
const SVG_PATH = /^\/counters\/([^/]+)\/([^/]+)\/badge$/;
const BADGE_PATH = /^\/badges\/([^/]+)$/;
const JSON_QUERY_PARAMETERS = new Set(['padding']);
const IMAGE_QUERY_PARAMETERS = new Set(['theme', 'padding']);
const JSON_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);
const IMAGE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const JSON_ALLOW = 'GET, HEAD, POST, OPTIONS';
const IMAGE_ALLOW = 'GET, HEAD, OPTIONS';
const MAX_SEGMENT_LENGTH = 128;
const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Location',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function jsonHeaders(): Record<string, string> {
  return {
    ...BASE_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function svgHeaders(): Record<string, string> {
  return {
    ...BASE_HEADERS,
    'Content-Type': 'image/svg+xml; charset=utf-8',
  };
}

function badgeHeaders(): Record<string, string> {
  return {
    ...svgHeaders(),
    'Cache-Control': 'public, max-age=86400',
  };
}

function errorResponse(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: message },
    { status, headers: { ...jsonHeaders(), ...headers } },
  );
}

function parsePadding(value: string | null): number | Response {
  if (value === null) {
    return 7;
  }

  if (!/^\d+$/.test(value)) {
    return errorResponse(400, 'Invalid padding');
  }

  const padding = Number(value);

  if (!Number.isInteger(padding) || padding < 0 || padding > 16) {
    return errorResponse(400, 'Invalid padding');
  }

  return padding;
}

function jsonResponse(
  counter: Counter,
  padding = 7,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const payload = {
    ...counter,
    digits: String(counter.visit).padStart(padding, '0'),
  };

  return Response.json(payload, {
    status,
    headers: { ...jsonHeaders(), ...headers },
  });
}

async function requireTheme(
  themes: ThemeSource,
  name: string,
): Promise<Theme | Response> {
  const theme = await themes.load(name);
  return theme ?? errorResponse(400, 'Unknown theme');
}

function validSegment(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].length <= MAX_SEGMENT_LENGTH &&
    value.trim().length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !/[/\\\p{Cc}]/u.test(value)
  );
}

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function validateQuery(url: URL, allowed: Set<string>): Response | null {
  for (const parameter of url.searchParams.keys()) {
    if (
      !allowed.has(parameter) ||
      url.searchParams.getAll(parameter).length !== 1
    ) {
      return errorResponse(400, 'Unknown or repeated query parameter');
    }
  }

  return null;
}

function parseImageQuery(
  url: URL,
): { theme: string; padding: number } | Response {
  const invalid = validateQuery(url, IMAGE_QUERY_PARAMETERS);

  if (invalid) {
    return invalid;
  }

  const padding = parsePadding(url.searchParams.get('padding'));

  if (padding instanceof Response) {
    return padding;
  }

  return {
    theme: url.searchParams.get('theme') ?? DEFAULT_THEME,
    padding,
  };
}

/**
 * 解析计数器 URL。
 * 非计数器请求返回 `null`，非法请求返回错误响应。
 */
function parseRequest(url: URL): CounterRequest | Response | null {
  const badgePath = BADGE_PATH.exec(url.pathname);

  if (badgePath) {
    const rawVisit = badgePath[1]!;

    if (!/^\d+$/.test(rawVisit)) {
      return errorResponse(400, 'Invalid visit count');
    }

    const visit = Number(rawVisit);

    if (!Number.isSafeInteger(visit)) {
      return errorResponse(400, 'Invalid visit count');
    }

    const query = parseImageQuery(url);

    if (query instanceof Response) {
      return query;
    }

    return { kind: 'badge', visit, ...query };
  }

  const svgPath = SVG_PATH.exec(url.pathname);
  const jsonPath = svgPath ? null : JSON_PATH.exec(url.pathname);

  if (!jsonPath && !svgPath) {
    return null;
  }

  const match = (svgPath ?? jsonPath)!;
  const namespace = decodeSegment(match[1]!);
  const name = decodeSegment(match[2]!);

  if (namespace === null || name === null) {
    return errorResponse(400, 'Invalid URL encoding');
  }

  if (!validSegment(namespace) || !validSegment(name)) {
    return errorResponse(400, 'Invalid namespace or counter name');
  }

  const key = { namespace, name };

  if (jsonPath) {
    const invalid = validateQuery(url, JSON_QUERY_PARAMETERS);

    if (invalid) {
      return invalid;
    }

    const padding = parsePadding(url.searchParams.get('padding'));

    return padding instanceof Response
      ? padding
      : { kind: 'json', key, padding };
  }

  const query = parseImageQuery(url);

  return query instanceof Response ? query : { kind: 'svg', key, ...query };
}

async function handle(
  request: Request,
  dependencies: AppDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseRequest(url);

  if (parsed === null) {
    return errorResponse(404, 'Not found');
  }

  if (parsed instanceof Response) {
    return parsed;
  }

  const allow = parsed.kind === 'json' ? JSON_ALLOW : IMAGE_ALLOW;
  const methods = parsed.kind === 'json' ? JSON_METHODS : IMAGE_METHODS;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...BASE_HEADERS,
        Allow: allow,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': allow,
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (!methods.has(request.method)) {
    return errorResponse(405, 'Method not allowed', { Allow: allow });
  }

  if (request.method === 'HEAD') {
    if (parsed.kind === 'badge') {
      const theme = await requireTheme(dependencies.themes, parsed.theme);

      return theme instanceof Response
        ? theme
        : new Response(null, { headers: badgeHeaders() });
    }

    const counter = await dependencies.store.read(parsed.key);

    if (!counter) {
      return errorResponse(404, 'Counter not found');
    }

    if (parsed.kind === 'json') {
      return new Response(null, { status: 200, headers: jsonHeaders() });
    }

    const theme = await requireTheme(dependencies.themes, parsed.theme);

    return theme instanceof Response
      ? theme
      : new Response(null, { status: 200, headers: svgHeaders() });
  }

  if (parsed.kind === 'badge') {
    const theme = await requireTheme(dependencies.themes, parsed.theme);

    return theme instanceof Response
      ? theme
      : new Response(renderCounter(parsed.visit, theme, parsed.padding), {
          headers: badgeHeaders(),
        });
  }

  if (parsed.kind === 'json') {
    if (request.method === 'GET') {
      const counter = await dependencies.store.read(parsed.key);

      return counter
        ? jsonResponse(counter, parsed.padding)
        : errorResponse(404, 'Counter not found');
    }

    const counter = await dependencies.store.record(
      parsed.key,
      await dependencies.identifyVisitor(request),
    );
    const created = counter.visit === 1;

    return jsonResponse(
      counter,
      parsed.padding,
      created ? 201 : 200,
      created ? { Location: url.pathname } : {},
    );
  }

  const theme = await requireTheme(dependencies.themes, parsed.theme);

  if (theme instanceof Response) {
    return theme;
  }

  const counter = await dependencies.store.record(
    parsed.key,
    await dependencies.identifyVisitor(request),
  );

  return new Response(renderCounter(counter.visit, theme, parsed.padding), {
    headers: svgHeaders(),
  });
}

/**
 * 创建计数器 HTTP 处理器。
 * 平台相关依赖由 `dependencies` 传入。
 */
export function createCounterHandler(
  dependencies: AppDependencies,
): (request: Request) => Promise<Response> {
  return async request => {
    let response: Response;

    try {
      response = await handle(request, dependencies);
    } catch (error) {
      console.error('Counter request failed', error);
      response = errorResponse(500, 'Internal server error');
    }

    // HEAD 响应不带正文。
    return request.method === 'HEAD'
      ? new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      : response;
  };
}
