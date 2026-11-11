import { $ } from 'bun';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Snapshot = Record<string, string | null>;

interface CounterMigration {
  namespace: string;
  name: string;
  visit: number;
  visitor: number;
  ips: Set<string>;
}

export interface MigrationResult {
  sql: string;
  statements: string[];
  counters: number;
  fingerprints: number;
  warnings: string[];
}

function parseCount(value: string | null | undefined, label: string): number {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing ${label}`);
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  const count = Number(value);

  if (!Number.isSafeInteger(count)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return count;
}

function splitKey(prefix: string): { namespace: string; name: string } {
  const rest = prefix.slice('hits:'.length);
  const separator = rest.indexOf(':');

  if (separator === -1 || separator === rest.length - 1) {
    throw new Error(`Invalid KV key: ${prefix}`);
  }

  return {
    namespace: rest.slice(0, separator),
    name: rest.slice(separator + 1),
  };
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function fingerprint(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').toUpperCase();
}

export function buildMigration(snapshot: Snapshot): MigrationResult {
  const counters = new Map<string, CounterMigration>();
  const ipKeys: { prefix: string; ip: string; key: string }[] = [];
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(snapshot)) {
    if (!key.startsWith('hits:')) {
      warnings.push(`Ignoring unknown key: ${key}`);
      continue;
    }

    if (key.endsWith(':visit') || key.endsWith(':visitor')) {
      const suffix = key.endsWith(':visit') ? ':visit' : ':visitor';
      const prefix = key.slice(0, -suffix.length);
      const parsed = splitKey(prefix);
      const counter =
        counters.get(prefix) ??
        ({
          ...parsed,
          visit: 0,
          visitor: 0,
          ips: new Set<string>(),
        } satisfies CounterMigration);

      if (suffix === ':visit') {
        counter.visit = parseCount(value, `visit for ${prefix}`);
      } else {
        counter.visitor = parseCount(value, `visitor for ${prefix}`);
      }

      counters.set(prefix, counter);
      continue;
    }

    const marker = key.lastIndexOf(':ip:');

    if (marker <= 'hits:'.length) {
      warnings.push(`Ignoring unknown key: ${key}`);
      continue;
    }

    ipKeys.push({
      prefix: key.slice(0, marker),
      ip: key.slice(marker + ':ip:'.length),
      key,
    });
  }

  for (const { prefix, ip, key } of ipKeys) {
    const counter = counters.get(prefix);

    if (!counter) {
      throw new Error(`IP key has no counter: ${key}`);
    }

    if (!ip) {
      throw new Error(`IP key has an empty address: ${key}`);
    }

    counter.ips.add(ip);
  }

  const statements: string[] = [];
  let fingerprints = 0;

  for (const counter of counters.values()) {
    if (counter.visit < 1) {
      throw new Error(
        `Counter ${counter.namespace}/${counter.name} has no visit count`,
      );
    }

    let visitor = counter.visitor;

    if (visitor > counter.visit) {
      warnings.push(
        `Counter ${counter.namespace}/${counter.name}: visitor ${visitor} clamped to visit ${counter.visit}`,
      );
      visitor = counter.visit;
    }

    statements.push(
      `INSERT OR IGNORE INTO counters (namespace, name, visit, visitor) VALUES (${quote(counter.namespace)}, ${quote(counter.name)}, ${counter.visit}, ${visitor});`,
    );

    for (const ip of counter.ips) {
      statements.push(
        `INSERT OR IGNORE INTO visitors (counter_id, fingerprint) SELECT id, X'${fingerprint(ip)}' FROM counters WHERE namespace = ${quote(counter.namespace)} AND name = ${quote(counter.name)};`,
      );
      fingerprints += 1;
    }
  }

  return {
    sql: `${statements.join('\n')}\n`,
    statements,
    counters: counters.size,
    fingerprints,
    warnings,
  };
}

function readSnapshot(value: unknown): Snapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('KV snapshot must be a JSON object');
  }

  const snapshot =
    'values' in value && typeof value.values === 'object' && value.values
      ? value.values
      : value;

  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('KV snapshot must be a JSON object');
  }

  const result: Snapshot = {};

  for (const [key, entry] of Object.entries(snapshot)) {
    if (typeof entry === 'string' || entry === null) {
      result[key] = entry;
      continue;
    }

    throw new Error(`Invalid value for KV key: ${key}`);
  }

  return result;
}

async function exportKv(namespaceId: string, output: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/i.test(namespaceId)) {
    throw new Error(`Invalid KV namespace ID: ${namespaceId}`);
  }

  const listed = JSON.parse(
    await $`bun run wrangler kv key list --namespace-id ${namespaceId} --remote`.text(),
  ) as { name: string }[];
  const keys = listed.map(entry => entry.name);
  const countKeys = keys.filter(
    key => key.endsWith(':visit') || key.endsWith(':visitor'),
  );
  const countSet = new Set(countKeys);
  const snapshot: Snapshot = {};

  // IP keys only need to exist; their values are timestamps.
  for (const key of keys) {
    if (!countSet.has(key)) {
      snapshot[key] = null;
    }
  }

  for (let index = 0; index < countKeys.length; index += 100) {
    const chunk = countKeys.slice(index, index + 100);
    const input = join(tmpdir(), `tallyflare-kv-${process.pid}-${index}.json`);
    writeFileSync(input, JSON.stringify(chunk));

    try {
      const values = readSnapshot(
        JSON.parse(
          await $`bun run wrangler kv bulk get ${input} --namespace-id ${namespaceId} --remote`.text(),
        ) as unknown,
      );
      Object.assign(snapshot, values);
    } finally {
      try {
        unlinkSync(input);
      } catch {
        // Temporary files are best-effort cleanup.
      }
    }
  }

  writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Exported ${keys.length} keys (${countKeys.length} values, ${keys.length - countKeys.length} IP keys).`,
  );
}

export function writeMigrationFiles(
  result: MigrationResult,
  outputDir: string,
  chunkSize = 10000,
): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('chunk size must be a positive integer');
  }

  try {
    mkdirSync(outputDir);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`Output directory already exists: ${outputDir}`, {
        cause: error,
      });
    }

    throw error;
  }

  const header = [
    '-- Generated from a Cloudflare KV snapshot.',
    '-- Apply after the D1 schema migration.',
    '',
  ];
  const files: string[] = [];
  const chunks = Math.ceil(result.statements.length / chunkSize);
  const width = Math.max(3, String(chunks).length);

  for (let index = 0; index < result.statements.length; index += chunkSize) {
    const name = `migration-${String(files.length + 1).padStart(width, '0')}.sql`;
    const body = result.statements.slice(index, index + chunkSize);
    const file = join(outputDir, name);
    writeFileSync(file, `${header.join('\n')}\n${body.join('\n')}\n`);
    files.push(file);
  }

  return files;
}

function usage(): never {
  console.error(`Usage:
  bun scripts/migrate.ts export --namespace-id <id> --output <kv.json>
  bun scripts/migrate.ts convert <kv.json> <output-dir> [--chunk-size 10000]

Local application:
  for file in <output-dir>/migration-*.sql; do
    bun run wrangler d1 execute DB --local --file="$file" || exit 1
  done

Remote application:
  for file in <output-dir>/migration-*.sql; do
    bun run wrangler d1 execute DB --remote --file="$file" || exit 1
  done`);
  process.exit(1);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  return value && !value.startsWith('--') ? value : undefined;
}

if (import.meta.main) {
  const [command, ...args] = Bun.argv.slice(2);

  try {
    if (command === 'export') {
      const namespaceId = option(args, '--namespace-id');
      const output = option(args, '--output');

      if (!namespaceId || !output) {
        usage();
      }

      await exportKv(namespaceId, output);
    } else if (command === 'convert') {
      const input = args[0];
      const output = args[1];

      if (
        !input ||
        !output ||
        input.startsWith('--') ||
        output.startsWith('--')
      ) {
        usage();
      }

      const chunkIndex = args.indexOf('--chunk-size');
      let chunkSize = 10000;

      if (chunkIndex !== -1) {
        const value = args[chunkIndex + 1];

        if (!value || value.startsWith('--')) {
          throw new Error('--chunk-size requires a value');
        }

        chunkSize = Number(value);
      }

      if (!Number.isInteger(chunkSize) || chunkSize < 1) {
        throw new Error('--chunk-size must be a positive integer');
      }

      const snapshot = readSnapshot(
        JSON.parse(readFileSync(input, 'utf8')) as unknown,
      );
      const result = buildMigration(snapshot);
      const files = writeMigrationFiles(result, output, chunkSize);

      for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`);
      }

      console.log(
        `Wrote ${result.counters} counters and ${result.fingerprints} fingerprints to ${files.length} file(s).`,
      );
      for (const file of files) {
        console.log(file);
      }
    } else {
      usage();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
