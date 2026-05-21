import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNAL_TAGS_STORAGE_KEY,
  listSignalTags,
  loadSignalTags,
  saveSignalTags,
  signalTagsStorageTestables
} from "../src/compare/signal-tags-storage.ts";
import type { SignalTagsRecord } from "../src/state/types.ts";

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

function makeRecord(overrides: Partial<SignalTagsRecord> = {}): SignalTagsRecord {
  return {
    itemId: "item-1",
    status: "complete",
    signalTags: ["求職", "外勞", "本地勞工"],
    signalGist: "這篇是在討論外勞招聘與本地求職者被壓價的衝突。",
    promptVersion: "v1",
    model: "google:test-model",
    generatedAt: "2026-05-21T00:00:00.000Z",
    ...overrides
  };
}

test("saveSignalTags stores records by item id", async () => {
  const storage = makeStorage();
  await saveSignalTags(storage, makeRecord());

  const hit = await loadSignalTags(storage, "item-1");
  assert.equal(hit?.signalGist, "這篇是在討論外勞招聘與本地求職者被壓價的衝突。");
  assert.ok(storage.data[SIGNAL_TAGS_STORAGE_KEY]);
});

test("listSignalTags filters by item ids and sorts newest first", async () => {
  const storage = makeStorage();
  await saveSignalTags(storage, makeRecord({ itemId: "old", generatedAt: "2026-05-20T00:00:00.000Z" }));
  await saveSignalTags(storage, makeRecord({ itemId: "new", generatedAt: "2026-05-21T00:00:00.000Z" }));
  await saveSignalTags(storage, makeRecord({ itemId: "other", generatedAt: "2026-05-22T00:00:00.000Z" }));

  assert.deepEqual(
    (await listSignalTags(storage, ["new", "old"])).map((record) => record.itemId),
    ["new", "old"]
  );
  assert.equal((await listSignalTags(storage)).length, 3);
});

test("normalizeSignalTags preserves error records and drops duplicate tags", () => {
  const normalized = signalTagsStorageTestables.normalizeSignalTags({
    itemId: "item-error",
    status: "error",
    signalTags: ["求職", "求職", "外勞"],
    signalGist: "x",
    promptVersion: "v1",
    model: "",
    generatedAt: "2026-05-21T00:00:00.000Z",
    errorMessage: "provider failed"
  });

  assert.deepEqual(normalized, {
    itemId: "item-error",
    status: "error",
    signalTags: ["求職", "外勞"],
    signalGist: "x",
    promptVersion: "v1",
    model: "",
    generatedAt: "2026-05-21T00:00:00.000Z",
    errorMessage: "provider failed"
  });
});

test("normalizeSignalTags rejects missing required content", () => {
  assert.equal(
    signalTagsStorageTestables.normalizeSignalTags({
      itemId: "item-1",
      status: "complete",
      signalTags: [],
      signalGist: "x",
      promptVersion: "v1",
      generatedAt: "2026-05-21T00:00:00.000Z"
    }),
    null
  );
});
