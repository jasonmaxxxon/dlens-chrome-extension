import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRODUCT_CONTEXT_STORAGE_KEY } from "../src/compare/product-context.ts";
import { TOPIC_AUDIT_RUNS_STORAGE_KEY } from "../src/state/topic-audit-storage.ts";
import { GLOBAL_STATE_STORAGE_KEY } from "../src/state/storage-keys.ts";
import { runMigrationsFor, STORAGE_MIGRATIONS } from "../src/state/storage-schema.ts";

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/storage/${name}`, import.meta.url), "utf8"));
}

test("global-state v0 fixture migrates through the full chain to expected v2 shape", () => {
  const v0 = readFixture("global-state-v0.json");
  const expectedV2 = readFixture("global-state-v2.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, GLOBAL_STATE_STORAGE_KEY, v0);
  assert.deepEqual(result, expectedV2);
});

test("global-state v1 fixture migrates to expected v2 shape", () => {
  const v1 = readFixture("global-state-v1.json");
  const expectedV2 = readFixture("global-state-v2.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, GLOBAL_STATE_STORAGE_KEY, v1);
  assert.deepEqual(result, expectedV2);
});

test("global-state v2 fixture round-trips unchanged through the migration", () => {
  const v2 = readFixture("global-state-v2.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, GLOBAL_STATE_STORAGE_KEY, v2);
  assert.deepEqual(result, v2);
});

test("global-state v1 migration strips backend-only raw payload mirrors and reaches v2", () => {
  const v1 = {
    schemaVersion: 1,
    settings: {},
    sessions: [{
      id: "session-1",
      items: [{
        id: "item-1",
        latestCapture: {
          id: "capture-1",
          raw_payload: { captureHtml: "large capture payload" },
          result: {
            id: "result-1",
            raw_payload: { resultHtml: "large crawl payload" },
            comments: [{ text: "must stay" }]
          }
        }
      }]
    }],
    activeSessionId: "session-1",
    updatedAt: "2026-07-24T00:00:00.000Z"
  };

  const result = runMigrationsFor<Record<string, any>>(
    STORAGE_MIGRATIONS,
    GLOBAL_STATE_STORAGE_KEY,
    v1
  );

  assert.equal(result.schemaVersion, 2);
  assert.equal("raw_payload" in result.sessions[0].items[0].latestCapture, false);
  assert.equal("raw_payload" in result.sessions[0].items[0].latestCapture.result, false);
  assert.deepEqual(
    result.sessions[0].items[0].latestCapture.result.comments,
    [{ text: "must stay" }]
  );
});

test("product-context v0 fixture migrates to expected v1 shape", () => {
  const v0 = readFixture("product-context-v0.json");
  const expectedV1 = readFixture("product-context-v1.json");
  const result = runMigrationsFor(STORAGE_MIGRATIONS, PRODUCT_CONTEXT_STORAGE_KEY, v0);
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

test("topic audit run cache remains outside the durable migration registry", () => {
  assert.equal(
    STORAGE_MIGRATIONS.map(({ key }) => key).includes(TOPIC_AUDIT_RUNS_STORAGE_KEY),
    false,
    "topic-audit-runs is a disposable leased cache, not an unregistered durable family"
  );
});

test("STORAGE_MIGRATIONS entries are forward-only and reach each durable key's current version", () => {
  for (const entry of STORAGE_MIGRATIONS) {
    assert.ok(entry.to > entry.from, `${entry.key}: to must be > from`);
    assert.ok(entry.from >= 0, `${entry.key}: from must be >= 0`);
  }
  const maxToByKey = new Map<string, number>();
  for (const entry of STORAGE_MIGRATIONS) {
    maxToByKey.set(entry.key, Math.max(maxToByKey.get(entry.key) ?? 0, entry.to));
  }
  assert.equal(maxToByKey.get(GLOBAL_STATE_STORAGE_KEY), 2);
  assert.equal(maxToByKey.get(PRODUCT_CONTEXT_STORAGE_KEY), 1);
});
