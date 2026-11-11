import type { Counter, CounterStore } from '../../src/core/counters';
import { createCounterHandler } from '../../src/core/handler';
import {
  type Theme,
  type ThemeSource,
  DEFAULT_THEME,
} from '../../src/core/svg';

import { createMemoryStore } from './memory-store';

const ORIGIN = 'https://counter.example.com';
const DIGITS = [...'0123456789'];
const THEME = Object.fromEntries(
  DIGITS.map(digit => [
    digit,
    { width: 10, height: 20, dataUri: `data:image/gif;base64,${digit}` },
  ]),
) as Theme;

export function createThemes() {
  const loaded: string[] = [];
  const source: ThemeSource = {
    async load(name) {
      loaded.push(name);
      return name === 'test' || name === DEFAULT_THEME ? THEME : null;
    },
  };

  return { source, loaded };
}

export function identifyVisitor(request: Request): Promise<Uint8Array | null> {
  const visitor = request.headers.get('X-Visitor');

  return Promise.resolve(
    visitor === null ? null : new TextEncoder().encode(visitor),
  );
}

export function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

export interface CounterResponse extends Counter {
  digits: string;
}

export async function counter(response: Response): Promise<CounterResponse> {
  return (await response.json()) as CounterResponse;
}

export function digits(visit: number, padding = 7): string {
  return String(visit).padStart(padding, '0');
}

export function handler(
  store: CounterStore = createMemoryStore().store,
  themes: ThemeSource = createThemes().source,
) {
  return createCounterHandler({ store, themes, identifyVisitor });
}
