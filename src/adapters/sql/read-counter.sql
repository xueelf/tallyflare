-- 读取计数器，不创建也不递增。
SELECT visit, visitor
FROM counters
WHERE namespace = ?1 AND name = ?2;
