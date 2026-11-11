-- 记住访客指纹，重复指纹不会重复计数。
INSERT INTO visitors (counter_id, fingerprint)
SELECT id, ?3
FROM counters
WHERE namespace = ?1 AND name = ?2
ON CONFLICT (counter_id, fingerprint) DO NOTHING;
