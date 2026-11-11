CREATE TABLE counters (
  id INTEGER PRIMARY KEY,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  visit INTEGER NOT NULL CHECK (visit BETWEEN 1 AND 9007199254740991),
  visitor INTEGER NOT NULL CHECK (visitor BETWEEN 0 AND visit),
  UNIQUE (namespace, name)
) STRICT;

CREATE TABLE visitors (
  counter_id INTEGER NOT NULL REFERENCES counters (id) ON DELETE CASCADE,
  fingerprint BLOB NOT NULL CHECK (length(fingerprint) = 32),
  PRIMARY KEY (counter_id, fingerprint)
) STRICT, WITHOUT ROWID;
