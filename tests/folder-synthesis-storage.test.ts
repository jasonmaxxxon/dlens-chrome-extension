import assert from "node:assert/strict";
import test from "node:test";

import {
  clearFolderSynthesis,
  FOLDER_SYNTHESIS_STORAGE_KEY,
  loadFolderSynthesis,
  normalizeFolderSynthesis,
  saveFolderSynthesis
} from "../src/compare/folder-synthesis-storage.ts";
import { FOLDER_SYNTHESIS_VERSION } from "../src/compare/folder-synthesis.ts";
import type { FolderSynthesis } from "../src/state/types.ts";

function createStorageArea(bucket: Record<string, unknown> = {}) {
  return {
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") return { [key]: bucket[key] };
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, items);
    },
    bucket
  };
}

function makeSynthesis(sessionId: string, generatedAt: string): FolderSynthesis {
  return {
    sessionId,
    observations: [{ text: "obs", evidenceSignalIds: ["sig-1"] }],
    commonClusters: [{ keyword: "壓力", signalCount: 2, topicCount: 2, topicIds: ["t-1", "t-2"] }],
    memes: [{ phrase: "壓力", occurrences: 2, topicIds: ["t-1", "t-2"] }],
    verbalTechniques: [],
    sentimentNarrative: "narrative",
    topicCoverage: [{ topicId: "t-1", topicName: "A", analyzedCount: 1, totalCount: 2 }],
    generatedFromCount: 3,
    totalSignalCount: 5,
    contributingTopicCount: 2,
    generatedAt,
    generator: "deterministic",
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };
}

test("normalizeFolderSynthesis rejects records missing required fields", () => {
  assert.equal(normalizeFolderSynthesis(null), null);
  assert.equal(normalizeFolderSynthesis({ sessionId: "s" }), null);
  assert.equal(normalizeFolderSynthesis({ generatedAt: "x" }), null);
  assert.equal(normalizeFolderSynthesis({
    ...makeSynthesis("session-1", "2026-05-11T00:00:00.000Z"),
    generatorVersion: "v1.deterministic"
  }), null);
  assert.equal(normalizeFolderSynthesis({
    ...makeSynthesis("session-1", "2026-05-11T00:00:00.000Z"),
    contributingTopicCount: 1
  }), null);
});

test("saveFolderSynthesis upserts by sessionId and loadFolderSynthesis returns the latest record", async () => {
  const storage = createStorageArea();
  const first = makeSynthesis("session-1", "2026-05-11T01:00:00.000Z");
  await saveFolderSynthesis(storage, first);
  const second = makeSynthesis("session-1", "2026-05-11T02:00:00.000Z");
  await saveFolderSynthesis(storage, second);
  const sibling = makeSynthesis("session-2", "2026-05-11T01:00:00.000Z");
  await saveFolderSynthesis(storage, sibling);

  const loadedOne = await loadFolderSynthesis(storage, "session-1");
  assert.ok(loadedOne);
  assert.equal(loadedOne!.generatedAt, "2026-05-11T02:00:00.000Z");

  const entries = storage.bucket[FOLDER_SYNTHESIS_STORAGE_KEY];
  assert.equal(Array.isArray(entries) && entries.length, 2);

  await clearFolderSynthesis(storage, "session-1");
  assert.equal(await loadFolderSynthesis(storage, "session-1"), null);
  assert.ok(await loadFolderSynthesis(storage, "session-2"));
});
