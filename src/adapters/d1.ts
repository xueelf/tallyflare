import type {
  Counter,
  CounterKey,
  CounterStore,
  VisitorFingerprint,
} from '../core/counters';

import readCounterSql from './sql/read-counter.sql' with { type: 'text' };
import recordCounterSql from './sql/record-counter.sql' with { type: 'text' };
import rememberVisitorSql from './sql/remember-visitor.sql' with { type: 'text' };

/* 写入语句必须在同一个 batch 中执行；任一步失败都会回滚。 */

export function createD1CounterStore(db: D1Database): CounterStore {
  return {
    read({ namespace, name }: CounterKey) {
      return db.prepare(readCounterSql).bind(namespace, name).first<Counter>();
    },

    async record(
      { namespace, name }: CounterKey,
      visitor: VisitorFingerprint | null,
    ) {
      const statements: D1PreparedStatement[] = [
        db.prepare(recordCounterSql).bind(namespace, name, visitor),
      ];

      if (visitor !== null) {
        statements.push(
          db.prepare(rememberVisitorSql).bind(namespace, name, visitor),
        );
      }

      const [result] = await db.batch<Counter>(statements);
      const counter = result?.results[0];

      if (counter === undefined) {
        throw new Error('D1 did not return the recorded counter');
      }

      return counter;
    },
  };
}
