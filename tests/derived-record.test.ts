import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDerivedRecordStaleness,
  type DerivedRecordStalenessReason
} from "../src/state/derived-record.ts";

test("deriveDerivedRecordStaleness returns absent for missing records", () => {
  const result = deriveDerivedRecordStaleness({
    record: null,
    currentGeneratorVersion: "v2"
  });
  assert.equal(result.state, "absent");
  assert.equal(result.stale, false);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.stalenessReason, null);
});

test("deriveDerivedRecordStaleness detects generator, source, delta, updated, and provenance drift", () => {
  const result = deriveDerivedRecordStaleness({
    record: {
      sourceHash: "source:a",
      generatedAt: "2026-06-10T00:00:00.000Z",
      generatorVersion: "v1"
    },
    currentSourceHash: "source:b",
    currentGeneratorVersion: "v2",
    sourceCount: 10,
    currentSourceCount: 12,
    sourceDeltaThreshold: 2,
    currentUpdatedAt: "2026-06-10T01:00:00.000Z",
    missingProvenance: true
  });

  assert.equal(result.state, "stale");
  assert.equal(result.stale, true);
  assert.deepEqual(result.reasons, [
    "source_hash",
    "generator_version",
    "source_delta",
    "updated_after_generated",
    "missing_provenance"
  ]);
  assert.equal(result.stalenessReason, "source_hash");
});

test("deriveDerivedRecordStaleness treats source-count deletion as stale at the same threshold", () => {
  const fresh = deriveDerivedRecordStaleness({
    record: { generatedAt: "2026-06-10T00:00:00.000Z", generatorVersion: "v1" },
    sourceCount: 10,
    currentSourceCount: 9,
    sourceDeltaThreshold: 2
  });
  const stale = deriveDerivedRecordStaleness({
    record: { generatedAt: "2026-06-10T00:00:00.000Z", generatorVersion: "v1" },
    sourceCount: 10,
    currentSourceCount: 8,
    sourceDeltaThreshold: 2
  });

  assert.equal(fresh.state, "fresh");
  assert.equal(stale.state, "stale");
  assert.deepEqual(stale.reasons, ["source_delta"]);
});

test("deriveDerivedRecordStaleness invariant: stale iff reasons are present", () => {
  const cases = [
    deriveDerivedRecordStaleness({
      record: { sourceHash: "a", generatedAt: "2026-06-10T00:00:00.000Z", generatorVersion: "v1" },
      currentSourceHash: "a",
      currentGeneratorVersion: "v1"
    }),
    deriveDerivedRecordStaleness({
      record: { sourceHash: "a", generatedAt: "2026-06-10T00:00:00.000Z", generatorVersion: "v1" },
      currentSourceHash: "b"
    }),
    deriveDerivedRecordStaleness({
      record: { generatedAt: "2026-06-10T00:00:00.000Z", generatorVersion: "v1" },
      missingProvenance: true
    })
  ];

  for (const result of cases) {
    assert.equal(result.stale, result.reasons.length > 0);
    assert.equal(result.state === "stale", result.reasons.length > 0);
    const firstReason: DerivedRecordStalenessReason | null = result.reasons[0] ?? null;
    assert.equal(result.stalenessReason, firstReason);
  }
});
