import assert from "node:assert/strict";
import test from "node:test";

import { TECHNIQUE_READING_STORAGE_KEY, STATIC_TECHNIQUE_DEFINITIONS, buildTechniqueReadingSnapshot } from "../src/compare/technique-reading.ts";
import { loadTechniqueReadings, saveTechniqueReading } from "../src/compare/technique-reading-storage.ts";

test("saveTechniqueReading prepends the latest technique snapshot into local storage", async () => {
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

  const older = buildTechniqueReadingSnapshot({
    sessionId: "session-1",
    itemId: "item-1",
    side: "A",
    clusterKey: "cap-a:0",
    detail: {
      captureId: "cap-a",
      clusterKey: 0,
      clusterTitle: "Support cluster",
      thesis: "Audience frames the policy as practical.",
      supportLabel: "6 comments",
      supportMetrics: [],
      audienceEvidence: [{ commentId: "c-1", author: "u1", text: "keep going", likes: 3, comments: 1, reposts: 0, forwards: 0 }],
      authorStance: "Author stance",
      alignment: "Align",
      alignmentSummary: "Mostly aligned",
      relatedCluster: null
    },
    techniques: STATIC_TECHNIQUE_DEFINITIONS,
    now: "2026-04-04T09:00:00.000Z"
  });
  const newer = buildTechniqueReadingSnapshot({
    sessionId: "session-2",
    itemId: "item-2",
    side: "B",
    clusterKey: "cap-b:1",
    detail: {
      captureId: "cap-b",
      clusterKey: 1,
      clusterTitle: "Opposition cluster",
      thesis: "Audience pushes the thread toward harm framing.",
      supportLabel: "5 comments",
      supportMetrics: [],
      audienceEvidence: [{ commentId: "c-2", author: "u2", text: "this is harmful", likes: 7, comments: 2, reposts: 1, forwards: 0 }],
      authorStance: "Author stance",
      alignment: "Oppose",
      alignmentSummary: "Mostly opposed",
      relatedCluster: null
    },
    techniques: STATIC_TECHNIQUE_DEFINITIONS,
    now: "2026-04-04T10:00:00.000Z"
  });

  await saveTechniqueReading(storageArea, older);
  const saved = await saveTechniqueReading(storageArea, newer);
  const loaded = await loadTechniqueReadings(storageArea);

  assert.equal(Array.isArray(bucket[TECHNIQUE_READING_STORAGE_KEY]), true);
  assert.equal(saved.length, 2);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]?.id, newer.id);
  assert.equal(loaded[0]?.clusterTitle, "Opposition cluster");
  assert.equal(loaded[0]?.techniques.length, 5);
  assert.equal(loaded[0]?.techniques[0]?.title, "焦點轉移");
  assert.equal(loaded[0]?.techniques[0]?.alias, "Deflection");
  assert.match(loaded[0]?.techniques[0]?.clusterFit || "", /Opposition cluster|harmful|harm framing/i);
  assert.equal(loaded[0]?.evidence[0]?.text, "this is harmful");
  assert.equal(loaded[1]?.id, older.id);
});
