import assert from "node:assert/strict";
import test from "node:test";

import type { Signal, Topic } from "../src/state/types.ts";
import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import {
  applyTopicListResponses,
  buildSignalPreviewById,
  filterSignalsWithBackingItems,
  findSignalsMissingBackingItems,
  navigateToTopicImmediately,
  resolveTopicCollectionTargetId
} from "../src/ui/useTopicState.ts";

const topic: Topic = {
  id: "topic-1",
  sessionId: "session-1",
  name: "work",
  description: "",
  status: "watching",
  tags: [],
  signalIds: [],
  pairIds: [],
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

const signal: Signal = {
  id: "signal-1",
  sessionId: "session-1",
  itemId: "item-1",
  source: "threads",
  inboxStatus: "assigned",
  topicId: "topic-1",
  capturedAt: "2026-05-10T00:00:00.000Z"
};

test("applyTopicListResponses keeps existing topic state when list calls fail", () => {
  const topicSets: Topic[][] = [];
  const signalSets: Signal[][] = [];

  applyTopicListResponses({
    topicsResponse: { ok: false, error: "topic read failed" },
    signalsResponse: { ok: false, error: "signal read failed" },
    setTopics: (topics) => topicSets.push(topics),
    setSignals: (signals) => signalSets.push(signals)
  });

  assert.deepEqual(topicSets, []);
  assert.deepEqual(signalSets, []);
});

test("applyTopicListResponses updates only successful slices", () => {
  const topicSets: Topic[][] = [];
  const signalSets: Signal[][] = [];

  applyTopicListResponses({
    topicsResponse: { ok: true, topics: [topic] },
    signalsResponse: { ok: false, error: "signal read failed" },
    setTopics: (topics) => topicSets.push(topics),
    setSignals: (signals) => signalSets.push(signals)
  });

  assert.deepEqual(topicSets, [[topic]]);
  assert.deepEqual(signalSets, []);
});

test("applyTopicListResponses applies both successful topic and signal lists", () => {
  const topicSets: Topic[][] = [];
  const signalSets: Signal[][] = [];

  applyTopicListResponses({
    topicsResponse: { ok: true, topics: [topic] },
    signalsResponse: { ok: true, signals: [signal] },
    setTopics: (topics) => topicSets.push(topics),
    setSignals: (signals) => signalSets.push(signals)
  });

  assert.deepEqual(topicSets, [[topic]]);
  assert.deepEqual(signalSets, [[signal]]);
});

test("buildSignalPreviewById falls back to author and URL instead of generic threads", () => {
  const session = createSessionRecord("work", "2026-05-22T00:00:00.000Z", "topic");
  const item = createSessionItem({
    target_type: "post",
    page_url: "https://www.threads.net/",
    post_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "",
    time_token_hint: "1h",
    dom_anchor: "card-1",
    engagement: {},
    engagement_present: {},
    captured_at: "2026-05-22T00:00:00.000Z"
  });
  session.items.push(item);

  const previewById = buildSignalPreviewById(session, [{ ...signal, itemId: item.id }]);

  assert.equal(previewById["signal-1"], "@alpha · https://www.threads.net/@alpha/post/abc");
});

test("buildSignalPreviewById labels signals with missing backing items instead of falling back to generic source", () => {
  const session = createSessionRecord("love", "2026-05-22T00:00:00.000Z", "topic");
  const previewById = buildSignalPreviewById(session, [{ ...signal, itemId: "missing-item" }]);

  assert.equal(previewById["signal-1"], "資料不完整的 Threads 訊號");
});

test("findSignalsMissingBackingItems detects item-backed orphan signals only", () => {
  const session = createSessionRecord("love", "2026-05-22T00:00:00.000Z", "topic");
  const item = createSessionItem({
    target_type: "post",
    page_url: "https://www.threads.net/",
    post_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "完整訊號",
    time_token_hint: "1h",
    dom_anchor: "card-1",
    engagement: {},
    engagement_present: {},
    captured_at: "2026-05-22T00:00:00.000Z"
  });
  session.items.push(item);

  const validSignal = { ...signal, id: "signal-valid", sessionId: session.id, itemId: item.id };
  const orphanSignal = { ...signal, id: "signal-orphan", sessionId: session.id, itemId: "missing-item" };
  const corruptItem = { ...item, id: "item-corrupt", descriptor: undefined };
  session.items.push(corruptItem as typeof item);
  const corruptSignal = { ...signal, id: "signal-corrupt", sessionId: session.id, itemId: corruptItem.id };
  const manualSignal = { ...signal, id: "signal-manual", sessionId: session.id, itemId: undefined, source: "manual" as const };

  assert.deepEqual(
    findSignalsMissingBackingItems(session, [validSignal, orphanSignal, corruptSignal, manualSignal]).map((entry) => entry.id),
    ["signal-orphan", "signal-corrupt"]
  );
});

test("findSignalsMissingBackingItems ignores stale signals from a previous active folder", () => {
  const topicSession = createSessionRecord("Topic workspace", "2026-06-10T00:00:00.000Z", "topic");
  const productSignal = {
    ...signal,
    id: "signal-product",
    sessionId: "product-session",
    itemId: "product-item"
  };

  assert.deepEqual(findSignalsMissingBackingItems(topicSession, [productSignal]), []);
});

test("filterSignalsWithBackingItems hides orphan rows from topic counts and lists", () => {
  const session = createSessionRecord("love", "2026-05-22T00:00:00.000Z", "topic");
  const item = createSessionItem({
    target_type: "post",
    page_url: "https://www.threads.net/",
    post_url: "https://www.threads.net/@alpha/post/abc",
    author_hint: "alpha",
    text_snippet: "完整訊號",
    time_token_hint: "1h",
    dom_anchor: "card-1",
    engagement: {},
    engagement_present: {},
    captured_at: "2026-05-22T00:00:00.000Z"
  });
  session.items.push(item);

  const validSignal = { ...signal, id: "signal-valid", sessionId: session.id, itemId: item.id };
  const orphanSignal = { ...signal, id: "signal-orphan", sessionId: session.id, itemId: "missing-item" };

  assert.deepEqual(
    filterSignalsWithBackingItems(session, [orphanSignal, validSignal]).map((entry) => entry.id),
    ["signal-valid"]
  );
});

test("filterSignalsWithBackingItems hides stale signals from a previous active folder without treating them as deletable orphans", () => {
  const topicSession = createSessionRecord("Topic workspace", "2026-06-10T00:00:00.000Z", "topic");
  const item = createSessionItem({
    target_type: "post",
    page_url: "https://www.threads.net/",
    post_url: "https://www.threads.net/@topic/post/abc",
    author_hint: "topic",
    text_snippet: "topic signal",
    time_token_hint: "1h",
    dom_anchor: "topic-card",
    engagement: {},
    engagement_present: {},
    captured_at: "2026-06-10T00:00:00.000Z"
  });
  topicSession.items.push(item);

  const validTopicSignal = { ...signal, id: "signal-topic", sessionId: topicSession.id, itemId: item.id };
  const staleProductSignal = {
    ...signal,
    id: "signal-product",
    sessionId: "product-session",
    itemId: "product-item"
  };

  assert.deepEqual(
    filterSignalsWithBackingItems(topicSession, [staleProductSignal, validTopicSignal]).map((entry) => entry.id),
    ["signal-topic"]
  );
});

test("resolveTopicCollectionTargetId persists the visible selected topic when storage target is missing", () => {
  const topics = [
    { ...topic, id: "topic-work", name: "work" },
    { ...topic, id: "topic-love", name: "love" }
  ];

  assert.equal(resolveTopicCollectionTargetId(topics, "topic-love", null), "topic-love");
});

test("resolveTopicCollectionTargetId does not silently choose from multiple topics without a visible selection", () => {
  const topics = [
    { ...topic, id: "topic-work", name: "work" },
    { ...topic, id: "topic-love", name: "love" }
  ];

  assert.equal(resolveTopicCollectionTargetId(topics, null, null), null);
});

test("navigateToTopicImmediately routes before the collection target storage write resolves", async () => {
  const calls: string[] = [];
  let resolvePersist: (() => void) | null = null;

  const navigation = navigateToTopicImmediately({
    topicId: "topic-love",
    setSelectedTopicId: (topicId) => calls.push(`select:${topicId}`),
    persistCollectionTarget: async (topicId) => {
      calls.push(`persist-start:${topicId}`);
      await new Promise<void>((resolve) => {
        resolvePersist = resolve;
      });
      calls.push(`persist-done:${topicId}`);
    },
    onNavigate: async (page) => {
      calls.push(`navigate:${page}`);
    }
  });

  assert.deepEqual(calls, ["select:topic-love", "persist-start:topic-love", "navigate:topic-detail"]);

  resolvePersist?.();
  await navigation;
  await Promise.resolve();

  assert.deepEqual(calls, [
    "select:topic-love",
    "persist-start:topic-love",
    "navigate:topic-detail",
    "persist-done:topic-love"
  ]);
});
