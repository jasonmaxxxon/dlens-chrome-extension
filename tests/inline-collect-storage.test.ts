import { loadFolderSynthesis, saveFolderSynthesis, FOLDER_SYNTHESIS_VERSION } from "./legacy-storage-fixtures.ts";
import { clearFolderSynthesis } from "../src/compare/folder-synthesis-storage.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { recordInlineCollectRemoval } from "../src/state/inline-collect-storage.ts";
import { deleteSignalStorageRecords } from "../src/state/session-signal-seam.ts";
import { loadSignals, loadTopics, saveSignal, saveTopic, type StorageAreaLike } from "../src/state/topic-storage.ts";
import { deleteProductAgentTaskFeedbackBySignalId, listProductAgentTaskFeedback, saveProductAgentTaskFeedback } from "../src/compare/product-agent-task-feedback.ts";
import { TOPIC_SYNTHESIS_VERSION } from "../src/compare/topic-synthesis.ts";
import type { FolderSynthesis, ProductAgentTaskFeedback, Topic } from "../src/state/types.ts";

function storage(): StorageAreaLike {
  const data: Record<string, unknown> = {};
  return {
    async get(key) { return typeof key === "string" ? { [key]: structuredClone(data[key]) } : structuredClone(data); },
    async set(values) { Object.assign(data, structuredClone(values)); }
  };
}
const stamp = "2026-10-07T00:00:00.000Z";
const feedback = (signalId: string, createdAt = stamp): ProductAgentTaskFeedback => ({ signalId, taskPromptHash: `task-${signalId}`, feedback: "adopted", createdAt });
const folder: FolderSynthesis = {
  sessionId: "s", observations: [{ text: "A and B", evidenceSignalIds: ["A", "B"] }], commonClusters: [], memes: [],
  verbalTechniques: [], sentimentNarrative: "", topicCoverage: [], generatedFromCount: 2, totalSignalCount: 2,
  contributingTopicCount: 2, generatedAt: stamp, generator: "deterministic", generatorVersion: FOLDER_SYNTHESIS_VERSION
};
const topic: Topic = {
  id: "t", sessionId: "s", name: "Topic", description: "", status: "pending", tags: [], signalIds: ["A", "B"], pairIds: [],
  createdAt: stamp, updatedAt: stamp, context: null,
  synthesis: {
    observations: [{ text: "A and B", evidenceSignalIds: ["A", "B"] }], commonClusters: [], verbalTechniques: [], memes: [],
    sentimentNarrative: "", outliers: [], generatedFromCount: 2, totalSignalCount: 2, generatedAt: stamp,
    generator: "deterministic", generatorVersion: TOPIC_SYNTHESIS_VERSION
  }
};
async function corpus() {
  const store = storage();
  for (const id of ["A", "B"]) await saveSignal(store, { id, sessionId: "s", itemId: `item-${id}`, source: "threads", inboxStatus: "assigned", topicId: "t", capturedAt: stamp });
  await saveTopic(store, topic);
  await saveFolderSynthesis(store, folder);
  return store;
}

test("removal undo restores feedback without id while retaining a later different feedback event", async () => {
  const store = storage();
  await saveProductAgentTaskFeedback(store, feedback("A"));
  const recorded = recordInlineCollectRemoval(store);
  await deleteProductAgentTaskFeedbackBySignalId(recorded.storage, "A");
  await saveProductAgentTaskFeedback(store, feedback("B", "2026-10-07T00:01:00.000Z"));
  await recorded.restore();
  assert.deepEqual((await listProductAgentTaskFeedback(store)).map(entry => entry.signalId).sort(), ["A", "B"]);
});

test("undo cannot restore a folder aggregate when a second signal was removed", async () => {
  const store = await corpus();
  const recorded = recordInlineCollectRemoval(store);
  await deleteSignalStorageRecords(recorded.storage, "A");
  await deleteSignalStorageRecords(store, "B");
  await recorded.restore();
  assert.deepEqual((await loadSignals(store, "s")).map(signal => signal.id), ["A"]);
  assert.equal(await loadFolderSynthesis(store, "s"), null);
});

test("undo restores only its topic membership when another removal changed the topic corpus", async () => {
  const store = await corpus();
  const recorded = recordInlineCollectRemoval(store);
  await deleteSignalStorageRecords(recorded.storage, "A");
  await deleteSignalStorageRecords(store, "B");
  await recorded.restore();
  const restored = (await loadTopics(store, "s"))[0];
  assert.deepEqual(restored.signalIds, ["A"]);
  assert.equal(restored.synthesis, null);
});

test("undo restores prior aggregates when their full original corpus is restored unchanged", async () => {
  const store = await corpus();
  const recorded = recordInlineCollectRemoval(store);
  await deleteSignalStorageRecords(recorded.storage, "A");
  await recorded.restore();
  assert.deepEqual((await loadTopics(store, "s"))[0].synthesis, topic.synthesis);
  assert.deepEqual(await loadFolderSynthesis(store, "s"), folder);
});

test("undo invalidates aggregates generated for the reduced corpus while the post was absent", async () => {
  const store = await corpus();
  const recorded = recordInlineCollectRemoval(store);
  await deleteSignalStorageRecords(recorded.storage, "A");
  await saveTopic(store, { ...topic, signalIds: ["B"], synthesis: { ...topic.synthesis!, observations: [{ text: "B only", evidenceSignalIds: ["B"] }] } });
  await saveFolderSynthesis(store, { ...folder, observations: [{ text: "B only", evidenceSignalIds: ["B"] }] });
  await recorded.restore();
  assert.equal((await loadTopics(store, "s"))[0].synthesis, null);
  assert.equal(await loadFolderSynthesis(store, "s"), null);
});

test("aggregate-only deletion without corpus provenance never resurrects the shared cache", async () => {
  const store = storage();
  await saveFolderSynthesis(store, folder);
  const recorded = recordInlineCollectRemoval(store);
  await clearFolderSynthesis(recorded.storage, "s");
  await clearFolderSynthesis(store, "s");
  await recorded.restore();
  assert.equal(await loadFolderSynthesis(store, "s"), null);
});
