-- 创建或递增计数器，并返回最新计数。
-- 仅当该访客指纹未出现过时，才增加 visitor。
INSERT INTO counters (namespace, name, visit, visitor)
VALUES (?1, ?2, 1, ?3 IS NOT NULL)
ON CONFLICT (namespace, name) DO UPDATE SET
  visit = counters.visit + 1,
  visitor = counters.visitor + (
    ?3 IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM visitors
      WHERE counter_id = counters.id AND fingerprint = ?3
    )
  )
RETURNING visit, visitor;
