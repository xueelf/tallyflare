import { useEffect, useState } from 'react';

export interface Counter {
  visit: number;
  visitor: number;
  digits?: string;
}

export type CounterStatus = 'loading' | 'ready' | 'missing' | 'error';

export interface CounterState {
  counter: Counter | null;
  status: CounterStatus;
}

const cache = new Map<string, Promise<Counter | null>>();

function isCounter(value: unknown): value is Counter {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const counter = value as Partial<Counter>;
  return (
    typeof counter.visit === 'number' && typeof counter.visitor === 'number'
  );
}

function loadCounter(path: string): Promise<Counter | null> {
  const cached = cache.get(path);

  if (cached) {
    return cached;
  }

  const request = fetch(path, { cache: 'no-store' }).then(async response => {
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const data: unknown = await response.json();

    if (!isCounter(data)) {
      throw new Error('Invalid response');
    }

    return data;
  });

  cache.set(path, request);
  request.catch(() => cache.delete(path));
  return request;
}

export function useCounter({
  namespace = 'github',
  name = 'tallyflare',
  padding,
  enabled = true,
}: {
  namespace?: string;
  name?: string;
  padding?: number;
  enabled?: boolean;
} = {}): CounterState {
  const [state, setState] = useState<CounterState>({
    counter: null,
    status: 'loading',
  });
  const query =
    padding === undefined
      ? ''
      : `?padding=${encodeURIComponent(String(padding))}`;
  const path = `/counters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${query}`;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    setState({ counter: null, status: 'loading' });

    loadCounter(path)
      .then(counter => {
        if (active) {
          setState({
            counter,
            status: counter ? 'ready' : 'missing',
          });
        }
      })
      .catch(() => {
        if (active) {
          setState({ counter: null, status: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, path]);

  return state;
}
