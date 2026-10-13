import assert from "node:assert/strict";
import test from "node:test";
import { clearFolderSynthesis, FOLDER_SYNTHESIS_STORAGE_KEY } from "../src/compare/folder-synthesis-storage.ts";
import { deleteTopicSignalReadingsBySignalId, TOPIC_SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/topic-signal-reading-storage.ts";
import { deleteSignalTagsByItemId, SIGNAL_TAGS_STORAGE_KEY } from "../src/compare/signal-tags-storage.ts";

test("explicit legacy cleanup preserves unrelated and unrecognized stored records", async () => {
  const bucket: Record<string, unknown> = {
    [FOLDER_SYNTHESIS_STORAGE_KEY]: [{ sessionId: "removed", oldField: true }, { sessionId: "kept", oldField: true }, null],
    [TOPIC_SIGNAL_READINGS_STORAGE_KEY]: { removed: { signalId: "removed" }, kept: { signalId: "kept", oldField: true }, unrecognized: "old-format" },
    [SIGNAL_TAGS_STORAGE_KEY]: { removed: { oldField: true }, kept: "old-format" },
    "dlens:v1:topic-audit-reports": { kept: "unread legacy report" }
  };
  const storage = {
    async get(key: string) { return { [key]: structuredClone(bucket[key]) }; },
    async set(values: Record<string, unknown>) { Object.assign(bucket, structuredClone(values)); }
  };
  await clearFolderSynthesis(storage, "removed");
  await deleteTopicSignalReadingsBySignalId(storage, "removed");
  await deleteSignalTagsByItemId(storage, "removed");
  assert.deepEqual(bucket[FOLDER_SYNTHESIS_STORAGE_KEY], [{ sessionId: "kept", oldField: true }, null]);
  assert.deepEqual(bucket[TOPIC_SIGNAL_READINGS_STORAGE_KEY], { kept: { signalId: "kept", oldField: true }, unrecognized: "old-format" });
  assert.deepEqual(bucket[SIGNAL_TAGS_STORAGE_KEY], { kept: "old-format" });
  assert.deepEqual(bucket["dlens:v1:topic-audit-reports"], { kept: "unread legacy report" });
});
