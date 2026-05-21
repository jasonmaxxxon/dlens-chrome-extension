import assert from "node:assert/strict";
import test from "node:test";

import {
  TOPIC_SIGNAL_READINGS_STORAGE_KEY,
  listTopicSignalReadings,
  loadTopicSignalReading,
  saveTopicSignalReading,
  topicSignalReadingStorageTestables
} from "../src/compare/topic-signal-reading-storage.ts";
import type { TopicSignalReading } from "../src/state/types.ts";

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    }
  };
}

function makeReading(overrides: Partial<TopicSignalReading> = {}): TopicSignalReading {
  return {
    signalId: "sig-1",
    topicId: "topic-1",
    status: "complete",
    stance: "central",
    reading: "留言顯示人工 review 仍是採用門檻（e1）。",
    audienceSignal: "觀眾接受 agent，但仍要求人工覆核（e1）。",
    evidenceRefs: ["e1"],
    uncertainties: ["需要確認是否只限大型重構。"],
    promptVersion: "v1",
    model: "google:test-model",
    generatedAt: "2026-05-21T00:00:00.000Z",
    ...overrides
  };
}

test("saveTopicSignalReading loads by signalId and topicId", async () => {
  const storage = makeStorage();
  await saveTopicSignalReading(storage, makeReading());

  const hit = await loadTopicSignalReading(storage, "sig-1", "topic-1");
  assert.equal(hit?.reading, "留言顯示人工 review 仍是採用門檻（e1）。");
  assert.ok(storage.data[TOPIC_SIGNAL_READINGS_STORAGE_KEY]);
});

test("listTopicSignalReadings filters by topic id and sorts newest first", async () => {
  const storage = makeStorage();
  await saveTopicSignalReading(storage, makeReading({ signalId: "old", generatedAt: "2026-05-20T00:00:00.000Z" }));
  await saveTopicSignalReading(storage, makeReading({ signalId: "new", generatedAt: "2026-05-21T00:00:00.000Z" }));
  await saveTopicSignalReading(storage, makeReading({ signalId: "other", topicId: "topic-2", generatedAt: "2026-05-22T00:00:00.000Z" }));

  assert.deepEqual(
    (await listTopicSignalReadings(storage, "topic-1")).map((reading) => reading.signalId),
    ["new", "old"]
  );
  assert.equal((await listTopicSignalReadings(storage)).length, 3);
});

test("normalizeTopicSignalReading preserves error records and defaults optional arrays", () => {
  const normalized = topicSignalReadingStorageTestables.normalizeTopicSignalReading({
    signalId: "sig-error",
    topicId: "topic-1",
    status: "error",
    stance: "adjacent",
    reading: "x",
    audienceSignal: "y",
    promptVersion: "v1",
    model: "",
    generatedAt: "2026-05-21T00:00:00.000Z",
    errorMessage: "provider failed"
  });

  assert.deepEqual(normalized, {
    signalId: "sig-error",
    topicId: "topic-1",
    status: "error",
    stance: "adjacent",
    reading: "x",
    audienceSignal: "y",
    evidenceRefs: [],
    uncertainties: [],
    promptVersion: "v1",
    model: "",
    generatedAt: "2026-05-21T00:00:00.000Z",
    errorMessage: "provider failed"
  });
});

test("normalizeTopicSignalReading rejects missing required identity fields", () => {
  assert.equal(
    topicSignalReadingStorageTestables.normalizeTopicSignalReading({
      topicId: "topic-1",
      status: "complete",
      stance: "central",
      reading: "x",
      audienceSignal: "y",
      promptVersion: "v1",
      generatedAt: "2026-05-21T00:00:00.000Z"
    }),
    null
  );
});
