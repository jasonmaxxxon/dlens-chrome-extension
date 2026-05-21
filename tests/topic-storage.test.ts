import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureSignalForSavedItem,
} from "../src/state/topic-handlers.ts";
import {
  deleteSignal,
  deleteTopic,
  loadSignals,
  loadTopics,
  normalizeSignal,
  normalizeTopic,
  normalizeTopicSynthesis,
  saveSignal,
  saveTopic,
  SIGNALS_STORAGE_KEY,
  TOPICS_STORAGE_KEY,
  triageSignal
} from "../src/state/topic-storage.ts";
import type { Signal, Topic } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { TOPIC_SYNTHESIS_VERSION } from "../src/compare/topic-synthesis.ts";

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

test("normalizeTopic returns null for incomplete records and fills defaults for partial data", () => {
  assert.equal(normalizeTopic(null), null);
  assert.equal(normalizeTopic({ id: "topic-1", sessionId: "session-1" }), null);
  assert.equal(normalizeTopic({ id: "topic-1", name: "Signals" }), null);

  const normalized = normalizeTopic({
    id: "topic-1",
    sessionId: "session-1",
    name: "Signals"
  });

  assert.deepEqual(normalized, {
    id: "topic-1",
    sessionId: "session-1",
    name: "Signals",
    description: "",
    status: "pending",
    tags: [],
    signalIds: [],
    pairIds: [],
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z"
  } satisfies Topic);
});

test("normalizeTopic preserves non-empty topic context and drops empty context", () => {
  assert.deepEqual(normalizeTopic({
    id: "topic-1",
    sessionId: "session-1",
    name: "Signals",
    context: {
      researchQuestion: "  Claude Code 用戶對 Agent 模式的真實抱怨是什麼？  ",
      lens: "  從產品開發者視角  ",
      nonGoals: "  不做泛泛情緒總結  "
    }
  })?.context, {
    researchQuestion: "Claude Code 用戶對 Agent 模式的真實抱怨是什麼？",
    lens: "從產品開發者視角",
    nonGoals: "不做泛泛情緒總結"
  });

  assert.equal(normalizeTopic({
    id: "topic-2",
    sessionId: "session-1",
    name: "Empty context",
    context: {
      researchQuestion: "   ",
      lens: "產品視角"
    }
  })?.context, null);
});

test("normalizeTopicSynthesis rejects records from older generator versions", () => {
  assert.equal(normalizeTopicSynthesis({
    observations: [],
    commonClusters: [],
    verbalTechniques: [],
    memes: [],
    sentimentNarrative: "",
    outliers: [],
    generatedFromCount: 2,
    totalSignalCount: 2,
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "deterministic",
    generatorVersion: "v1.deterministic"
  }), null);

  assert.deepEqual(normalizeTopicSynthesis({
    observations: [],
    commonClusters: [],
    verbalTechniques: [],
    memes: [],
    sentimentNarrative: "",
    outliers: [],
    generatedFromCount: 2,
    totalSignalCount: 2,
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "deterministic",
    generatorVersion: TOPIC_SYNTHESIS_VERSION
  }), {
    observations: [],
    commonClusters: [],
    verbalTechniques: [],
    memes: [],
    sentimentNarrative: "",
    outliers: [],
    generatedFromCount: 2,
    totalSignalCount: 2,
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "deterministic",
    generatorVersion: TOPIC_SYNTHESIS_VERSION
  });
});

test("normalizeSignal returns null for incomplete records and fills defaults for partial data", () => {
  assert.equal(normalizeSignal(null), null);
  assert.equal(normalizeSignal({ id: "signal-1", sessionId: "session-1" }), null);
  assert.equal(normalizeSignal({ id: "signal-1", source: "threads" }), null);

  const normalized = normalizeSignal({
    id: "signal-1",
    sessionId: "session-1",
    source: "threads"
  });

  assert.deepEqual(normalized, {
    id: "signal-1",
    sessionId: "session-1",
    itemId: undefined,
    source: "threads",
    inboxStatus: "unprocessed",
    topicId: undefined,
    suggestedTopicIds: [],
    capturedAt: "1970-01-01T00:00:00.000Z",
    triagedAt: undefined
  } satisfies Signal);
});

test("ensureSignalForSavedItem does not create topic signals for PR Evidence sessions", async () => {
  const storage = createStorageArea({ [SIGNALS_STORAGE_KEY]: [] });
  const session = createSessionRecord("PR", "2026-05-06T10:00:00.000Z");
  session.mode = "pr-evidence";
  const item = createSessionItem({
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/a",
    post_url: "https://www.threads.net/@alpha/post/a",
    author_hint: "alpha",
    text_snippet: "A",
    time_token_hint: "1h",
    dom_anchor: "card-a",
    engagement: {},
    engagement_present: {},
    captured_at: "2026-05-06T10:00:00.000Z"
  });

  await ensureSignalForSavedItem(storage, session, item);

  assert.deepEqual(await loadSignals(storage, session.id), []);
});

test("loadTopics filters by session id and saveTopic upserts by id", async () => {
  const bucket: Record<string, unknown> = {
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-a",
        name: "Signals",
        status: "watching"
      },
      {
        id: "topic-2",
        sessionId: "session-b",
        name: "Other",
        status: "learning"
      }
    ]
  };
  const storage = createStorageArea(bucket);

  const initial = await loadTopics(storage, "session-a");
  assert.equal(initial.length, 1);
  assert.equal(initial[0]?.id, "topic-1");

  await saveTopic(storage, {
    ...initial[0]!,
    name: "Signals updated",
    updatedAt: "2026-04-23T10:00:00.000Z"
  });

  const saved = await loadTopics(storage, "session-a");
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.name, "Signals updated");
});

test("triageSignal assigns a signal to an existing topic and dedupes signalIds", async () => {
  const topicBucket: Record<string, unknown> = {
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Signals",
        status: "watching",
        signalIds: ["signal-1"]
      }
    ]
  };
  const signalBucket: Record<string, unknown> = {
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  };

  const result = await triageSignal(
    createStorageArea(signalBucket),
    createStorageArea(topicBucket),
    "signal-1",
    { kind: "assign", topicId: "topic-1" },
    "session-1"
  );

  assert.equal(result.signal.inboxStatus, "assigned");
  assert.equal(result.signal.topicId, "topic-1");
  assert.equal(result.topic?.signalIds.length, 1);
  assert.equal(result.topic?.signalIds[0], "signal-1");
  assert.ok(result.signal.triagedAt);
});

test("triageSignal removes stale membership when reassigning a signal", async () => {
  const topicBucket: Record<string, unknown> = {
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Old topic",
        status: "watching",
        signalIds: ["signal-1"]
      },
      {
        id: "topic-2",
        sessionId: "session-1",
        name: "New topic",
        status: "pending",
        signalIds: []
      }
    ]
  };
  const signalBucket: Record<string, unknown> = {
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "assigned",
        topicId: "topic-1",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  };
  const topicStorage = createStorageArea(topicBucket);

  await triageSignal(
    createStorageArea(signalBucket),
    topicStorage,
    "signal-1",
    { kind: "assign", topicId: "topic-2" },
    "session-1"
  );

  const topics = await loadTopics(topicStorage, "session-1");
  assert.deepEqual(topics.find((topic) => topic.id === "topic-1")?.signalIds, []);
  assert.deepEqual(topics.find((topic) => topic.id === "topic-2")?.signalIds, ["signal-1"]);
});

test("triageSignal clears topic membership when archiving an assigned signal", async () => {
  const topicBucket: Record<string, unknown> = {
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Signals",
        status: "watching",
        signalIds: ["signal-1"]
      }
    ]
  };
  const signalBucket: Record<string, unknown> = {
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "assigned",
        topicId: "topic-1",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  };
  const topicStorage = createStorageArea(topicBucket);

  const result = await triageSignal(
    createStorageArea(signalBucket),
    topicStorage,
    "signal-1",
    { kind: "archive" },
    "session-1"
  );

  const topics = await loadTopics(topicStorage, "session-1");
  assert.equal(result.signal.inboxStatus, "archived");
  assert.equal(result.signal.topicId, undefined);
  assert.deepEqual(topics[0]?.signalIds, []);
});

test("deleteSignal removes the signal and clears topic membership", async () => {
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Signals",
        status: "watching",
        signalIds: ["signal-1", "signal-2"],
        pairIds: [],
        synthesis: {
          sentimentNarrative: "舊合成不可在刪除後保留。",
          observations: [],
          commonClusters: [],
          verbalTechniques: [],
          memes: [],
          outliers: [],
          generatedFromCount: 2,
          totalSignalCount: 2,
          generatedAt: "2026-05-14T07:00:00.000Z",
          generator: "deterministic",
          generatorVersion: "v2.work-signal-lens"
        }
      }
    ],
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-05-14T07:00:00.000Z"
      },
      {
        id: "signal-2",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-05-14T07:05:00.000Z"
      }
    ]
  });

  const result = await deleteSignal(storage, "signal-1");

  assert.equal(result.deleted.id, "signal-1");
  assert.deepEqual((await loadSignals(storage, "session-1")).map((signal) => signal.id), ["signal-2"]);
  const topics = await loadTopics(storage, "session-1");
  assert.deepEqual(topics[0]?.signalIds, ["signal-2"]);
  assert.equal(topics[0]?.synthesis, null);
});

test("triageSignal can create a topic while assigning the signal", async () => {
  const topicBucket: Record<string, unknown> = {};
  const signalBucket: Record<string, unknown> = {
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  };

  const result = await triageSignal(
    createStorageArea(signalBucket),
    createStorageArea(topicBucket),
    "signal-1",
    { kind: "create-topic", name: "New topic", description: "Track this trend" },
    "session-1"
  );

  assert.equal(result.signal.inboxStatus, "assigned");
  assert.ok(result.signal.topicId);
  assert.equal(result.topic?.name, "New topic");
  assert.equal(result.topic?.description, "Track this trend");
  assert.deepEqual(result.topic?.signalIds, ["signal-1"]);
});

test("triageSignal archives a signal without mutating topics", async () => {
  const topicBucket: Record<string, unknown> = {
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Signals",
        status: "watching",
        signalIds: []
      }
    ]
  };
  const signalBucket: Record<string, unknown> = {
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  };

  const result = await triageSignal(
    createStorageArea(signalBucket),
    createStorageArea(topicBucket),
    "signal-1",
    { kind: "archive" },
    "session-1"
  );

  assert.equal(result.signal.inboxStatus, "archived");
  assert.equal(result.topic, undefined);
});

test("triageSignal rejects a signal and loadSignals can filter by inbox status", async () => {
  const signalBucket: Record<string, unknown> = {
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-04-23T08:00:00.000Z"
      }
    ]
  };
  const signalStorage = createStorageArea(signalBucket);

  await triageSignal(
    signalStorage,
    createStorageArea({}),
    "signal-1",
    { kind: "reject" },
    "session-1"
  );

  const rejected = await loadSignals(signalStorage, "session-1", "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]?.inboxStatus, "rejected");
});

test("saveSignal upserts by id and deleteTopic removes only the targeted topic", async () => {
  const topicBucket: Record<string, unknown> = {
    [TOPICS_STORAGE_KEY]: [
      {
        id: "topic-1",
        sessionId: "session-1",
        name: "Signals",
        status: "watching"
      },
      {
        id: "topic-2",
        sessionId: "session-1",
        name: "Archive",
        status: "archived"
      }
    ]
  };
  const signalBucket: Record<string, unknown> = {};
  const topicStorage = createStorageArea(topicBucket);
  const signalStorage = createStorageArea(signalBucket);

  await saveSignal(signalStorage, {
    id: "signal-1",
    sessionId: "session-1",
    source: "threads",
    inboxStatus: "unprocessed",
    capturedAt: "2026-04-23T08:00:00.000Z",
    suggestedTopicIds: []
  });
  await saveSignal(signalStorage, {
    id: "signal-1",
    sessionId: "session-1",
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-1",
    capturedAt: "2026-04-23T08:00:00.000Z",
    triagedAt: "2026-04-23T09:00:00.000Z",
    suggestedTopicIds: []
  });

  const savedSignals = await loadSignals(signalStorage, "session-1");
  assert.equal(savedSignals.length, 1);
  assert.equal(savedSignals[0]?.inboxStatus, "assigned");

  const topics = await deleteTopic(topicStorage, "topic-1");
  assert.equal(topics.length, 1);
  assert.equal(topics[0]?.id, "topic-2");
});

test("deleteSignal removes the signal and scrubs it from all topics + clears synthesis", async () => {
  const fakeSynthesis = {
    observations: [],
    commonClusters: [],
    memes: [],
    verbalTechniques: [],
    sentimentNarrative: "x",
    outliers: [],
    generatedFromCount: 2,
    totalSignalCount: 2,
    generatedAt: "2026-05-12T00:00:00.000Z",
    generator: "deterministic",
    generatorVersion: TOPIC_SYNTHESIS_VERSION
  };
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [
      { id: "topic-1", sessionId: "session-1", name: "A", signalIds: ["signal-1", "signal-2"], pairIds: [], synthesis: fakeSynthesis },
      // orphan: signal-1 also appears in topic-2 (e.g. from stale data)
      { id: "topic-2", sessionId: "session-1", name: "B", signalIds: ["signal-1", "signal-3"], pairIds: [] }
    ],
    [SIGNALS_STORAGE_KEY]: [
      { id: "signal-1", sessionId: "session-1", source: "threads", inboxStatus: "assigned", topicId: "topic-1", capturedAt: "2026-05-12T00:00:00.000Z", suggestedTopicIds: [] },
      { id: "signal-2", sessionId: "session-1", source: "threads", inboxStatus: "assigned", topicId: "topic-1", capturedAt: "2026-05-12T00:01:00.000Z", suggestedTopicIds: [] },
      { id: "signal-3", sessionId: "session-1", source: "threads", inboxStatus: "assigned", topicId: "topic-2", capturedAt: "2026-05-12T00:02:00.000Z", suggestedTopicIds: [] }
    ]
  });

  await deleteSignal(storage, "signal-1");

  const signals = await loadSignals(storage, "session-1");
  assert.equal(signals.length, 2);
  assert.ok(signals.every((s) => s.id !== "signal-1"), "signal-1 must be removed");

  const topics = await loadTopics(storage, "session-1");
  const topic1 = topics.find((t) => t.id === "topic-1");
  const topic2 = topics.find((t) => t.id === "topic-2");

  // removed from topic-1 signalIds
  assert.ok(topic1?.signalIds.every((id) => id !== "signal-1"), "topic-1 must not reference signal-1");
  // synthesis cleared on affected topic
  assert.equal(topic1?.synthesis, null, "topic-1 synthesis must be cleared");
  // orphan in topic-2 also scrubbed
  assert.ok(topic2?.signalIds.every((id) => id !== "signal-1"), "topic-2 orphan must be scrubbed");
  assert.equal(topic2?.synthesis, null, "topic-2 synthesis must be cleared");
  // unrelated signal untouched
  assert.ok(topic2?.signalIds.includes("signal-3"), "signal-3 must remain in topic-2");
});

test("deleteSignal rejects unknown signalId", async () => {
  const storage = createStorageArea({
    [TOPICS_STORAGE_KEY]: [{ id: "topic-1", sessionId: "session-1", name: "A", signalIds: [], pairIds: [] }],
    [SIGNALS_STORAGE_KEY]: []
  });
  await assert.rejects(() => deleteSignal(storage, "does-not-exist"), /Signal not found/);
  const signals = await loadSignals(storage, "session-1");
  assert.equal(signals.length, 0);
});
