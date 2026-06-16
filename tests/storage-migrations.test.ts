import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRODUCT_CONTEXT_STORAGE_KEY } from "../src/compare/product-context.ts";
import { GLOBAL_STATE_STORAGE_KEY } from "../src/state/storage-keys.ts";
import { runMigrationsFor, STORAGE_MIGRATIONS } from "../src/state/storage-schema.ts";

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/storage/${name}`, import.meta.url), "utf8"));
}

test("global-state v0 fixture migrates to expected v1 shape", () => {
  const v0 = readFixture("global-state-v0.json");
  const expectedV1 = readFixture("global-state-v1.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, GLOBAL_STATE_STORAGE_KEY, v0);
  assert.deepEqual(result, expectedV1);
});

test("global-state v1 fixture round-trips unchanged through the migration", () => {
  const v1 = readFixture("global-state-v1.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, GLOBAL_STATE_STORAGE_KEY, v1);
  assert.deepEqual(result, v1);
});

test("product-context legacy fixture migrates to expected v1 shape", () => {
  const legacy = readFixture("product-context-legacy.json");
  const expectedV1 = readFixture("product-context-v1.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, PRODUCT_CONTEXT_STORAGE_KEY, legacy);
  assert.deepEqual(result, expectedV1);
});

test("product-context v1 fixture round-trips unchanged through the migration", () => {
  const v1 = readFixture("product-context-v1.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, PRODUCT_CONTEXT_STORAGE_KEY, v1);
  assert.deepEqual(result, v1);
});

test("STORAGE_MIGRATIONS covers both currently-registered keys", () => {
  const registeredKeys = new Set(STORAGE_MIGRATIONS.map((m) => m.key));
  assert.equal(registeredKeys.has(GLOBAL_STATE_STORAGE_KEY), true, "missing global-state migration");
  assert.equal(registeredKeys.has(PRODUCT_CONTEXT_STORAGE_KEY), true, "missing product-context migration");
});

test("STORAGE_MIGRATIONS entries are forward-only and reach version 1", () => {
  for (const entry of STORAGE_MIGRATIONS) {
    assert.ok(entry.to > entry.from, `${entry.key}: to must be > from`);
    assert.ok(entry.from >= 0, `${entry.key}: from must be >= 0`);
  }
  // Every registered key reaches at least v1 in this PR; future PRs may add v1→v2 entries.
  const maxToByKey = new Map<string, number>();
  for (const entry of STORAGE_MIGRATIONS) {
    maxToByKey.set(entry.key, Math.max(maxToByKey.get(entry.key) ?? 0, entry.to));
  }
  for (const [key, maxTo] of maxToByKey) {
    assert.ok(maxTo >= 1, `${key}: should reach at least version 1`);
  }
});
