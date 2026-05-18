import assert from "node:assert/strict";
import test from "node:test";

import type { Signal, Topic } from "../src/state/types.ts";
import { applyTopicListResponses } from "../src/ui/useTopicState.ts";

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
