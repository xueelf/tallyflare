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
}

export function Counter({
  namespace = 'github',
  name = 'tallyflare',
  format = 'svg',
  theme = 'moebooru',
  padding = 7,
  alt = '',
  fallback = null,
}: CounterProps) {
  const { counter, status } = useCounter({ namespace, name, padding });

  if (status === 'loading') {
    return null;
  }

  if (!counter) {
    return fallback;
  }

  if (format === 'json') {
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

  return (
    <img
      className="counter-svg"
      src={`/badges/${counter.visit}?${query.toString()}`}
      alt={alt}
    />
  );
}
