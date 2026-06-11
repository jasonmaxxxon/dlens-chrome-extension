import assert from "node:assert/strict";
import test from "node:test";

import { FOLDER_SYNTHESIS_VERSION } from "../src/compare/folder-synthesis.ts";
import { FOLDER_SYNTHESIS_STORAGE_KEY, loadFolderSynthesis, saveFolderSynthesis } from "../src/compare/folder-synthesis-storage.ts";
import {
  applySignalDeletionToGlobalState,
  deleteSignalStorageRecords
} from "../src/state/session-signal-seam.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { loadSignals, SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../src/state/topic-storage.ts";
import { createEmptyGlobalState, type ExtensionGlobalState, type FolderSynthesis } from "../src/state/types.ts";

function createStorageArea(bucket: Record<string, unknown> = {}) {
  return {
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
}

function buildDescriptor(id: string) {
  return {
    target_type: "post" as const,
    page_url: `https://www.threads.net/@dlens/post/${id}`,
    post_url: `https://www.threads.net/@dlens/post/${id}`,
    author_hint: "dlens",
    text_snippet: `signal ${id}`,
    time_token_hint: "4月23日",
    dom_anchor: id,
    engagement: { likes: 1 },
    engagement_present: { likes: true },
    captured_at: "2026-04-23T08:00:00.000Z"
  };
}

test("deleteSignalStorageRecords deletes the signal and clears folder synthesis at the same seam", async () => {
  const fakeSynthesis: FolderSynthesis = {
    sessionId: "session-1",
    observations: [{ text: "obs", evidenceSignalIds: ["signal-1"] }],
    commonClusters: [{ keyword: "壓力", signalCount: 2, topicCount: 2, topicIds: ["topic-1", "topic-2"] }],
    memes: [{ phrase: "壓力", occurrences: 2, topicIds: ["topic-1", "topic-2"] }],
    verbalTechniques: [],
    sentimentNarrative: "x",
    topicCoverage: [{ topicId: "topic-1", topicName: "A", analyzedCount: 1, totalCount: 1 }],
    generatedFromCount: 2,
    totalSignalCount: 2,
    contributingTopicCount: 2,
    generatedAt: "2026-06-11T00:00:00.000Z",
    generator: "deterministic",
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };
  const storage = createStorageArea({
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        itemId: "item-1",
        source: "threads",
        inboxStatus: "assigned",
        topicId: "topic-1",
        capturedAt: "2026-06-11T00:00:00.000Z"
      }
    ],
    [TOPICS_STORAGE_KEY]: [
      { id: "topic-1", sessionId: "session-1", name: "A", signalIds: ["signal-1"], pairIds: [] }
    ],
    [FOLDER_SYNTHESIS_STORAGE_KEY]: [fakeSynthesis]
  });
  await saveFolderSynthesis(storage, fakeSynthesis);

  const result = await deleteSignalStorageRecords(storage, "signal-1");

  assert.equal(result.deleted.id, "signal-1");
  assert.deepEqual(await loadSignals(storage, "session-1"), []);
  assert.equal(await loadFolderSynthesis(storage, "session-1"), null);
});

test("applySignalDeletionToGlobalState removes an orphan backing item but preserves shared backing items", () => {
  const session = {
    ...createSessionRecord("Topic workspace", "2026-06-11T00:00:00.000Z", "topic"),
    id: "session-1",
    items: [
      { ...createSessionItem(buildDescriptor("one")), id: "item-1" },
      { ...createSessionItem(buildDescriptor("two")), id: "item-2" }
    ]
  };
  const globalState: ExtensionGlobalState = {
    ...createEmptyGlobalState(),
    sessions: [session],
    activeSessionId: session.id
  };

  const orphanResult = applySignalDeletionToGlobalState(globalState, {
    deleted: {
      id: "signal-1",
      sessionId: "session-1",
      itemId: "item-1",
      source: "threads",
      inboxStatus: "assigned",
      capturedAt: "2026-06-11T00:00:00.000Z"
    },
    signals: [
      {
        id: "signal-2",
        sessionId: "session-1",
        itemId: "item-2",
        source: "threads",
        inboxStatus: "assigned",
        capturedAt: "2026-06-11T00:00:00.000Z"
      }
    ]
  });

  assert.equal(orphanResult.removedItemId, "item-1");
  assert.deepEqual(orphanResult.globalState.sessions[0]?.items.map((item) => item.id), ["item-2"]);

  const sharedResult = applySignalDeletionToGlobalState(globalState, {
    deleted: {
      id: "signal-1",
      sessionId: "session-1",
      itemId: "item-1",
      source: "threads",
      inboxStatus: "assigned",
      capturedAt: "2026-06-11T00:00:00.000Z"
    },
    signals: [
      {
        id: "signal-2",
        sessionId: "session-1",
        itemId: "item-1",
        source: "threads",
        inboxStatus: "assigned",
        capturedAt: "2026-06-11T00:00:00.000Z"
      }
    ]
  });

  assert.equal(sharedResult.removedItemId, null);
  assert.deepEqual(sharedResult.globalState.sessions[0]?.items.map((item) => item.id), ["item-1", "item-2"]);
});
