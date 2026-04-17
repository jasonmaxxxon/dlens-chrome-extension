import assert from "node:assert/strict";
import test from "node:test";

import { buildTechniqueReadingSnapshot, STATIC_TECHNIQUE_DEFINITIONS } from "../src/compare/technique-reading.ts";
import { loadTechniqueReadings, saveTechniqueReading } from "../src/compare/technique-reading-storage.ts";

test("loadTechniqueReadings returns the same saved casebook snapshots from storage", async () => {
  const bucket: Record<string, unknown> = {};
  const storageArea = {
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") {
        return { [key]: bucket[key] };
      }
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, items);
    }
  };

  const snapshot = buildTechniqueReadingSnapshot({
    sessionId: "session-1",
    itemId: "item-1",
    side: "A",
    clusterKey: "cap-a:0",
    detail: {
      captureId: "cap-a",
      clusterKey: 0,
      clusterTitle: "Support cluster",
      thesis: "Audience keeps framing the thread as practical and necessary.",
      supportLabel: "6 comments",
      supportMetrics: [],
      audienceEvidence: [{ commentId: "c-1", author: "u1", text: "this helps", likes: 4, comments: 1, reposts: 0, forwards: 0 }],
      authorStance: "Author stance",
      alignment: "Align",
      alignmentSummary: "Mostly aligned",
      relatedCluster: null
    },
    techniques: STATIC_TECHNIQUE_DEFINITIONS,
    now: "2026-04-04T10:32:00.000Z"
  });

  await saveTechniqueReading(storageArea, snapshot);
  const readings = await loadTechniqueReadings(storageArea);

  assert.equal(readings.length, 1);
  assert.equal(readings[0]?.id, snapshot.id);
  assert.equal(readings[0]?.clusterTitle, "Support cluster");
  assert.equal(readings[0]?.thesis, "Audience keeps framing the thread as practical and necessary.");
  assert.equal(readings[0]?.techniques.length, 5);
  assert.match(readings[0]?.techniques[0]?.clusterFit || "", /Support cluster|this helps|practical/i);
  assert.equal(readings[0]?.evidence.length, 1);
});
