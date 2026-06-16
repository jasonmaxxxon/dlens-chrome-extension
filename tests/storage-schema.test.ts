import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_STORAGE_SCHEMA_VERSION,
  defineMigration,
  runMigrationsFor
} from "../src/state/storage-schema.ts";

test("CURRENT_STORAGE_SCHEMA_VERSION is a positive integer", () => {
  assert.equal(Number.isInteger(CURRENT_STORAGE_SCHEMA_VERSION), true);
  assert.ok(CURRENT_STORAGE_SCHEMA_VERSION >= 1);
});

test("defineMigration accepts valid spec", () => {
  const spec = defineMigration({
    key: "test:example",
    from: 0,
    to: 1,
    migrate: (input: { name?: string }) => ({ name: input.name ?? "default" })
  });
  assert.equal(spec.key, "test:example");
  assert.equal(spec.from, 0);
  assert.equal(spec.to, 1);
});

test("defineMigration rejects to <= from", () => {
  assert.throws(
    () =>
      defineMigration({
        key: "test:example",
        from: 1,
        to: 1,
        migrate: (x) => x
      }),
    /must be greater than from/
  );
  assert.throws(
    () =>
      defineMigration({
        key: "test:example",
        from: 2,
        to: 1,
        migrate: (x) => x
      }),
    /must be greater than from/
  );
});

test("defineMigration rejects negative from", () => {
  assert.throws(
    () =>
      defineMigration({
        key: "test:example",
        from: -1,
        to: 1,
        migrate: (x) => x
      }),
    /from \(-1\) must be >= 0/
  );
});

test("runMigrationsFor on a payload with no schemaVersion runs the v0→v1 migration and stamps schemaVersion", () => {
  const registry = [
    defineMigration({
      key: "test:example",
      from: 0,
      to: 1,
      migrate: (input: { name?: string }) => ({ name: input.name ?? "default" })
    })
  ];
  const result = runMigrationsFor(registry, "test:example", { name: "alice" });
  assert.deepEqual(result, { schemaVersion: 1, name: "alice" });
});

test("runMigrationsFor stamps schemaVersion when input is null / non-object", () => {
  const registry = [
    defineMigration({
      key: "test:example",
      from: 0,
      to: 1,
      migrate: () => ({ value: "from-null" })
    })
  ];
  const result = runMigrationsFor(registry, "test:example", null);
  assert.deepEqual(result, { schemaVersion: 1, value: "from-null" });
});

test("runMigrationsFor on a payload already at CURRENT version is a no-op", () => {
  const registry = [
    defineMigration({
      key: "test:example",
      from: 0,
      to: 1,
      migrate: (input: { name?: string }) => ({ name: input.name ?? "default" })
    })
  ];
  const result = runMigrationsFor(registry, "test:example", { schemaVersion: 1, name: "alice" });
  assert.deepEqual(result, { schemaVersion: 1, name: "alice" });
});

test("runMigrationsFor chains multi-step migrations v0→v1→v2", () => {
  const registry = [
    defineMigration({
      key: "test:chain",
      from: 0,
      to: 1,
      migrate: (input: { name?: string }) => ({ name: input.name ?? "default", added_at_v1: true })
    }),
    defineMigration({
      key: "test:chain",
      from: 1,
      to: 2,
      migrate: (input: { name: string; added_at_v1: boolean }) => ({
        displayName: input.name,
        upgradedAtV2: input.added_at_v1
      })
    })
  ];
  const result = runMigrationsFor(registry, "test:chain", { name: "bob" });
  assert.deepEqual(result, { schemaVersion: 2, displayName: "bob", upgradedAtV2: true });
});

test("runMigrationsFor resumes from intermediate version", () => {
  const registry = [
    defineMigration({
      key: "test:chain",
      from: 0,
      to: 1,
      migrate: () => ({ stage: "v1" })
    }),
    defineMigration({
      key: "test:chain",
      from: 1,
      to: 2,
      migrate: (input: { stage: string }) => ({ stage: input.stage + "-then-v2" })
    })
  ];
  const result = runMigrationsFor(registry, "test:chain", { schemaVersion: 1, stage: "manual" });
  assert.deepEqual(result, { schemaVersion: 2, stage: "manual-then-v2" });
});

test("runMigrationsFor with no registered migration for a key throws", () => {
  assert.throws(
    () => runMigrationsFor([], "test:absent", {}),
    /no registered migration for key test:absent/
  );
});

test("runMigrationsFor refuses to run when payload claims future schema version", () => {
  const registry = [
    defineMigration({
      key: "test:example",
      from: 0,
      to: 1,
      migrate: (x) => x
    })
  ];
  assert.throws(
    () => runMigrationsFor(registry, "test:example", { schemaVersion: 2 }),
    /future schema version 2/
  );
});

test("runMigrationsFor surfaces a migration gap as an explicit error", () => {
  const registry = [
    defineMigration({
      key: "test:gap",
      from: 0,
      to: 1,
      migrate: (x) => x
    }),
    // intentionally missing from=1→to=2; jump directly to from=2→to=3
    defineMigration({
      key: "test:gap",
      from: 2,
      to: 3,
      migrate: (x) => x
    })
  ];
  assert.throws(
    () => runMigrationsFor(registry, "test:gap", { schemaVersion: 1 }),
    /migration gap for test:gap: no entry from version 1/
  );
});

test("runMigrationsFor isolates by key", () => {
  const registry = [
    defineMigration({
      key: "test:a",
      from: 0,
      to: 1,
      migrate: () => ({ keyA: true })
    }),
    defineMigration({
      key: "test:b",
      from: 0,
      to: 1,
      migrate: () => ({ keyB: true })
    })
  ];
  const resultA = runMigrationsFor(registry, "test:a", {});
  const resultB = runMigrationsFor(registry, "test:b", {});
  assert.deepEqual(resultA, { schemaVersion: 1, keyA: true });
  assert.deepEqual(resultB, { schemaVersion: 1, keyB: true });
});
