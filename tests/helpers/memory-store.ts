import type {
  Counter,
  CounterKey,
  CounterStore,
  VisitorFingerprint,
} from '../../src/core/counters';

function counterId({ namespace, name }: CounterKey): string {
  return `${namespace}\u0000${name}`;
}

function fingerprintId(fingerprint: VisitorFingerprint): string {
  return Array.from(fingerprint).join('.');
}

/**
 * HTTP 测试用的内存存储。不模拟故障，需要时由测试传入会抛错的 store。
 */
export function createMemoryStore() {
  const counters = new Map<string, Counter>();
  const visitors = new Map<string, Set<string>>();

  const store: CounterStore = {
    async read(key) {
      return counters.get(counterId(key)) ?? null;
    },

    async record(key, visitor) {
      const id = counterId(key);
      const current = counters.get(id) ?? { visit: 0, visitor: 0 };
      let visitorCount = current.visitor;

      if (visitor !== null) {
        const seen = visitors.get(id) ?? new Set<string>();
        const fingerprint = fingerprintId(visitor);

        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          visitors.set(id, seen);
          visitorCount += 1;
        }
      }

      const next = { visit: current.visit + 1, visitor: visitorCount };
      counters.set(id, next);
      return next;
    },
  };

  return { store, counters };
}
