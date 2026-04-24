import assert from "node:assert/strict";
import test from "node:test";

import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { ensureSignalForSavedItem, handleTopicMessage } from "../src/state/topic-handlers.ts";
import { loadSignals, loadTopics, SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../src/state/topic-storage.ts";

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
