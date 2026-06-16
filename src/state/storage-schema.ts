export const CURRENT_STORAGE_SCHEMA_VERSION = 1;

export interface StorageSchemaMigration<TFrom = unknown, TTo = unknown> {
  key: string;
  from: number;
  to: number;
  migrate: (input: TFrom) => TTo;
}

export function defineMigration<TFrom, TTo>(
  spec: StorageSchemaMigration<TFrom, TTo>
): StorageSchemaMigration<TFrom, TTo> {
  if (spec.from < 0) {
    throw new Error(`migration for ${spec.key}: from (${spec.from}) must be >= 0`);
  }
  if (spec.to <= spec.from) {
    throw new Error(
      `migration for ${spec.key}: to (${spec.to}) must be greater than from (${spec.from})`
    );
  }
  return spec;
}

export function runMigrationsFor<T = unknown>(
  registry: ReadonlyArray<StorageSchemaMigration>,
  key: string,
  rawValue: unknown
): T {
  const entries = registry.filter((m) => m.key === key);
  if (entries.length === 0) {
    throw new Error(`no registered migration for key ${key}`);
  }
  const maxVersion = Math.max(...entries.map((e) => e.to));
  const currentVersion = readSchemaVersion(rawValue);
  if (currentVersion > maxVersion) {
    throw new Error(
      `payload for ${key} claims future schema version ${currentVersion} (registry max is ${maxVersion})`
    );
  }
  let value: unknown = rawValue;
  let version = currentVersion;
  while (version < maxVersion) {
    const next = entries.find((e) => e.from === version);
    if (!next) {
      throw new Error(
        `migration gap for ${key}: no entry from version ${version} (registry max is ${maxVersion})`
      );
    }
    value = next.migrate(value);
    version = next.to;
  }
  return stampSchemaVersion(value, version) as T;
}

function readSchemaVersion(value: unknown): number {
  if (typeof value !== "object" || value === null) {
    return 0;
  }
  const v = (value as Record<string, unknown>).schemaVersion;
  return typeof v === "number" ? v : 0;
}

function stampSchemaVersion(value: unknown, version: number): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return { schemaVersion: version };
  }
  return { ...(value as Record<string, unknown>), schemaVersion: version };
}
