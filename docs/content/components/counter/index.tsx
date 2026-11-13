import type { ReactNode } from 'react';

import { useCounter } from '../../hooks/use-counter';

import './style.css';

export interface CounterProps {
  namespace?: string;
  name?: string;
  format?: 'json' | 'svg';
  theme?: string;
  padding?: number;
  alt?: string;
  fallback?: ReactNode;
  readonly?: boolean;
}

export function Counter({
  namespace = 'github',
  name = 'tallyflare',
  format = 'svg',
  theme = 'moebooru',
  padding = 7,
  alt = '',
  fallback = null,
  readonly = false,
}: CounterProps) {
  const { counter, status } = useCounter({
    namespace,
    name,
    padding,
    enabled: format === 'json' || readonly,
  });

  if (format === 'json') {
    if (status === 'loading') {
      return null;
    }

    if (!counter) {
      return fallback;
    }

    return (
      <pre>
        <code>{JSON.stringify(counter, null, 2)}</code>
      </pre>
    );
  }

  const query = new URLSearchParams({
    theme,
    padding: String(padding),
  });
  const path = `/counters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;

  if (!readonly) {
    return (
      <img
        className="counter-svg"
        src={`${path}/badge?${query.toString()}`}
        alt={alt}
      />
    );
  }

  if (status === 'loading') {
    return null;
  }

  if (!counter) {
    return fallback;
  }

  return (
    <img
      className="counter-svg"
      src={`/badges/${counter.visit}?${query.toString()}`}
      alt={alt}
    />
  );
}
