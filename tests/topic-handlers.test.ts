import assert from "node:assert/strict";
import test from "node:test";

import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { ensureSignalForSavedItem, ensureSignalsForSessionItems, ensureWorkspaceTopicForSession, handleTopicMessage } from "../src/state/topic-handlers.ts";
import { loadSignals, loadTopics, SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../src/state/topic-storage.ts";
import { FOLDER_SYNTHESIS_STORAGE_KEY, loadFolderSynthesis, saveFolderSynthesis } from "../src/compare/folder-synthesis-storage.ts";
import { FOLDER_SYNTHESIS_VERSION } from "../src/compare/folder-synthesis.ts";
import type { FolderSynthesis } from "../src/state/types.ts";

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
    engagement: { likes: 1, comments: 1, reposts: 0, forwards: 0, views: 12 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-04-23T08:00:00.000Z"
  };
}

test("ensureSignalForSavedItem creates one inbox signal for topic/product folders and dedupes by item", async () => {
  const storage = createStorageArea();
  const session = {
    ...createSessionRecord("Signals", "2026-04-23T08:00:00.000Z"),
    mode: "topic" as const
  };
  const item = createSessionItem(buildDescriptor("post-1"), "2026-04-23T08:00:00.000Z");

  await ensureSignalForSavedItem(storage, session, item);
  await ensureSignalForSavedItem(storage, session, item);

  const signals = await loadSignals(storage, session.id);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.itemId, item.id);
  assert.equal(signals[0]?.inboxStatus, "unprocessed");
});

test("ensureSignalsForSessionItems repairs missing Product signal rows from saved session items", async () => {
  const storage = createStorageArea({
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-existing",
        sessionId: "session-product",
        itemId: "item-existing",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  });
  const existingItem = {
    ...createSessionItem(buildDescriptor("existing"), "2026-04-23T08:00:00.000Z"),
    id: "item-existing"
  };
  const missingItem = {
    ...createSessionItem(buildDescriptor("missing"), "2026-04-23T08:00:00.000Z"),
    id: "item-missing"
  };
  const session = {
    ...createSessionRecord("Product workspace", "2026-04-23T08:00:00.000Z", "product"),
    id: "session-product",
    items: [existingItem, missingItem]
  };

  const signals = await ensureSignalsForSessionItems(storage, session);

  assert.equal(signals.length, 2);
  assert.equal(signals.filter((signal) => signal.itemId === "item-existing").length, 1);
  assert.equal(signals.filter((signal) => signal.itemId === "item-missing").length, 1);
});

test("ensureSignalForSavedItem leaves topic saves unassigned without an explicit topic target", async () => {
  const storage = createStorageArea();
  const session = createSessionRecord("work", "2026-04-23T08:00:00.000Z", "topic");
  const item = createSessionItem(buildDescriptor("work-post-1"), "2026-04-23T08:00:00.000Z");

  await ensureSignalForSavedItem(storage, session, item);

  const topics = await loadTopics(storage, session.id);
  const signals = await loadSignals(storage, session.id);
  assert.equal(topics.length, 0);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.inboxStatus, "unprocessed");
  assert.equal(signals[0]?.topicId, undefined);
});

test("ensureSignalForSavedItem assigns saves to the explicit topic target", async () => {
  const session = createSessionRecord("work", "2026-04-23T08:00:00.000Z", "topic");
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-work",
        sessionId: session.id,
        name: "work",
        description: "",
        status: "watching",
        tags: [],
        signalIds: [],
        pairIds: [],
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      },
      {
        id: "topic-love",
        sessionId: session.id,
        name: "love",
        description: "",
        status: "pending",
        tags: [],
        signalIds: [],
        pairIds: [],
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  });
  const item = createSessionItem(buildDescriptor("love-post-1"), "2026-04-23T08:00:00.000Z");

  await ensureSignalForSavedItem(storage, session, item, "topic-love");

  const topics = await loadTopics(storage, session.id);
  const signals = await loadSignals(storage, session.id);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.topicId, "topic-love");
  assert.equal(signals[0]?.inboxStatus, "assigned");
  assert.deepEqual(topics.find((topic) => topic.id === "topic-love")?.signalIds, [signals[0]?.id]);
  assert.deepEqual(topics.find((topic) => topic.id === "topic-work")?.signalIds, []);
});

test("ensureWorkspaceTopicForSession repairs existing unprocessed signals into the workspace topic", async () => {
  const session = createSessionRecord("work", "2026-04-23T08:00:00.000Z", "topic");
  const storage = createStorageArea({
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: session.id,
        itemId: "item-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      },
      {
        id: "signal-2",
        sessionId: session.id,
        itemId: "item-2",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  });

  const topic = await ensureWorkspaceTopicForSession(storage, session);
  const topics = await loadTopics(storage, session.id);
  const signals = await loadSignals(storage, session.id);

  assert.equal(topic?.name, "work");
  assert.equal(topics.length, 1);
  assert.deepEqual(topics[0]?.signalIds.sort(), ["signal-1", "signal-2"]);
  assert.deepEqual(signals.map((signal) => signal.inboxStatus), ["assigned", "assigned"]);
  assert.deepEqual(signals.map((signal) => signal.topicId), [topics[0]?.id, topics[0]?.id]);
});

test("ensureSignalForSavedItem skips archive folders", async () => {
  const storage = createStorageArea();
  const session = {
    ...createSessionRecord("Archive", "2026-04-23T08:00:00.000Z"),
    mode: "archive" as const
  };
  const item = createSessionItem(buildDescriptor("post-archive"), "2026-04-23T08:00:00.000Z");

  await ensureSignalForSavedItem(storage, session, item);

  const raw = await storage.get(SIGNALS_STORAGE_KEY);
  assert.equal(raw[SIGNALS_STORAGE_KEY], undefined);
});

test("handleTopicMessage updates partial topic fields without erasing existing required fields", async () => {
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Original topic",
        description: "",
        status: "watching",
        tags: ["support"],
        signalIds: [],
        pairIds: [],
        createdAt: "2026-04-23T08:00:00.000Z",
        updatedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  });

  await handleTopicMessage(storage, {
    type: "topic/update",
    id: "topic-1",
    patch: {
      name: undefined,
      status: undefined,
      tags: undefined,
      description: "Updated description"
    }
  });

  const topics = await loadTopics(storage, "session-1");
  assert.equal(topics[0]?.name, "Original topic");
  assert.equal(topics[0]?.status, "watching");
  assert.deepEqual(topics[0]?.tags, ["support"]);
  assert.equal(topics[0]?.description, "Updated description");
});

test("handleTopicMessage creates and updates topic context", async () => {
  const storage = createStorageArea();

  await handleTopicMessage(storage, {
    type: "topic/create",
    sessionId: "session-1",
    name: "Claude Code adoption",
    context: {
      researchQuestion: "  Claude Code 用戶對 Agent 模式的真實抱怨是什麼？  "
    }
  });

  let topics = await loadTopics(storage, "session-1");
  assert.equal(topics[0]?.context?.researchQuestion, "Claude Code 用戶對 Agent 模式的真實抱怨是什麼？");

  await handleTopicMessage(storage, {
    type: "topic/update",
    id: topics[0]!.id,
    patch: {
      context: {
        researchQuestion: "台灣 builder 社群對 AI 工具的採用障礙在哪？",
        lens: "從產品開發者視角"
      }
    }
  });

  topics = await loadTopics(storage, "session-1");
  assert.equal(topics[0]?.context?.researchQuestion, "台灣 builder 社群對 AI 工具的採用障礙在哪？");
  assert.equal(topics[0]?.context?.lens, "從產品開發者視角");

  await handleTopicMessage(storage, {
    type: "topic/update",
    id: topics[0]!.id,
    patch: {
      context: { researchQuestion: "   " }
    }
  });

  topics = await loadTopics(storage, "session-1");
  assert.equal(topics[0]?.context, null);
});

test("handleTopicMessage triages a signal and returns refreshed signal/topic lists", async () => {
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Topic",
        status: "pending",
        signalIds: [],
        pairIds: []
      }
    ],
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  });

  const response = await handleTopicMessage(storage, {
    type: "signal/triage",
    signalId: "signal-1",
    action: { kind: "assign", topicId: "topic-1" }
  });

  assert.equal(response.signals?.[0]?.inboxStatus, "assigned");
  assert.equal(response.signals?.[0]?.topicId, "topic-1");
  assert.deepEqual(response.topics?.[0]?.signalIds, ["signal-1"]);
});

test("handleTopicMessage unassigns every signal when deleting a topic", async () => {
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Topic",
        status: "pending",
        signalIds: ["signal-1", "signal-2"],
        pairIds: []
      }
    ],
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "assigned",
        topicId: "topic-1",
        capturedAt: "2026-04-23T08:00:00.000Z"
      },
      {
        id: "signal-2",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "assigned",
        topicId: "topic-1",
        capturedAt: "2026-04-23T08:05:00.000Z"
      }
    ]
  });

  await handleTopicMessage(storage, {
    type: "topic/delete",
    id: "topic-1"
  });

  const signals = await loadSignals(storage, "session-1");
  assert.equal(signals.length, 2);
  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.inboxStatus, signal.topicId]).sort(),
    [
      ["signal-1", "unprocessed", undefined],
      ["signal-2", "unprocessed", undefined]
    ]
  );
});

test("signal/delete handler removes the signal, clears topic synthesis, and clears folder synthesis", async () => {
  const fakeSynthesis: FolderSynthesis = {
    sessionId: "session-1",
    observations: [],
    commonClusters: [],
    memes: [],
    verbalTechniques: [],
    sentimentNarrative: "x",
    topicCoverage: [],
    generatedFromCount: 2,
    totalSignalCount: 2,
    contributingTopicCount: 2,
    generatedAt: "2026-05-12T00:00:00.000Z",
    generator: "deterministic",
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };

  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      { id: "topic-1", sessionId: "session-1", name: "A", signalIds: ["signal-1", "signal-2"], pairIds: [] }
    ],
    [SIGNALS_STORAGE_KEY]: [
      { id: "signal-1", sessionId: "session-1", source: "threads", inboxStatus: "assigned", topicId: "topic-1", capturedAt: "2026-05-12T00:00:00.000Z", suggestedTopicIds: [] },
      { id: "signal-2", sessionId: "session-1", source: "threads", inboxStatus: "assigned", topicId: "topic-1", capturedAt: "2026-05-12T00:01:00.000Z", suggestedTopicIds: [] }
    ],
    [FOLDER_SYNTHESIS_STORAGE_KEY]: [fakeSynthesis]
  });

  const response = await handleTopicMessage(storage, { type: "signal/delete", signalId: "signal-1" });

  const signals = await loadSignals(storage, "session-1");
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.id, "signal-2");
  assert.deepEqual(response.signals?.map((signal) => signal.id), ["signal-2"]);

  const topics = await loadTopics(storage, "session-1");
  assert.ok(topics[0]?.signalIds.every((id) => id !== "signal-1"), "signal-1 removed from topic");
  assert.equal(topics[0]?.synthesis, null, "topic synthesis cleared");
  assert.deepEqual(response.topics?.[0]?.signalIds, ["signal-2"]);

  const folderSynthesis = await loadFolderSynthesis(storage, "session-1");
  assert.equal(folderSynthesis, null, "folder synthesis cleared after delete");
});
