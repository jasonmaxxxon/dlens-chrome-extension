import assert from "node:assert/strict";
import test from "node:test";

import {
  touchRecordCacheEntry,
  upsertRecordCacheEntry
} from "../src/state/cache-helpers.ts";

test("upsertRecordCacheEntry evicts the least recently touched entry past the max size", () => {
  const cache = {
    alpha: { generatedAt: "2026-04-09T09:00:00.000Z", lastAccessedAt: "2026-04-09T09:00:00.000Z", value: "a" },
    beta: { generatedAt: "2026-04-09T10:00:00.000Z", lastAccessedAt: "2026-04-09T10:00:00.000Z", value: "b" }
  };

  const next = upsertRecordCacheEntry(
    cache,
    "gamma",
    { generatedAt: "2026-04-09T11:00:00.000Z", value: "c" },
    2,
    "2026-04-09T11:00:00.000Z"
  );

  assert.deepEqual(Object.keys(next).sort(), ["beta", "gamma"]);
  assert.equal(next.gamma?.lastAccessedAt, "2026-04-09T11:00:00.000Z");
});

test("touchRecordCacheEntry refreshes recency without mutating other entries", () => {
  const cache = {
    alpha: { generatedAt: "2026-04-09T09:00:00.000Z", lastAccessedAt: "2026-04-09T09:00:00.000Z", value: "a" },
    beta: { generatedAt: "2026-04-09T10:00:00.000Z", value: "b" }
  };

  const next = touchRecordCacheEntry(cache, "beta", "2026-04-09T12:00:00.000Z");

  assert.equal(next.beta?.lastAccessedAt, "2026-04-09T12:00:00.000Z");
  assert.equal(next.alpha?.lastAccessedAt, "2026-04-09T09:00:00.000Z");
});
