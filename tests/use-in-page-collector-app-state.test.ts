import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import type { WorkerStatus } from "../src/state/processing-state.ts";
import { runAnalyzeItemsPipeline } from "../src/ui/useInPageCollectorAppState.ts";

test("runAnalyzeItemsPipeline queues selected items then starts worker and refreshes", async () => {
  const calls: ExtensionMessage[] = [];
  const statuses: WorkerStatus[] = [];
  const toasts: string[] = [];
  const sendAndSync = async <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> => {
    calls.push(message);
    if (message.type === "session/queue-items") {
      return { ok: true, queuedItemIds: message.itemIds, failedItemIds: [] } as T;
    }
    if (message.type === "worker/start-processing") {
      return { ok: true, processingStatus: "started" } as T;
    }
    if (message.type === "session/refresh-all") {
      return { ok: true } as T;
    }
    return { ok: false, error: `unexpected ${message.type}` } as T;
  };

  const result = await runAnalyzeItemsPipeline({
    folderId: "folder-1",
    itemIds: ["a", "b"],
    sendAndSync,
    setWorkerStatus: (status) => statuses.push(status),
    setDisplayToast: (toast) => toasts.push(toast.message)
  });

  assert.deepEqual(calls.map((call) => call.type), [
    "session/queue-items",
    "worker/start-processing",
    "session/refresh-all"
  ]);
  assert.equal((calls[0] as Extract<ExtensionMessage, { type: "session/queue-items" }>).sessionId, "folder-1");
  assert.deepEqual((calls[0] as Extract<ExtensionMessage, { type: "session/queue-items" }>).itemIds, ["a", "b"]);
  assert.deepEqual(statuses, ["draining"]);
  assert.deepEqual(result, { ok: true, failedCount: 0 });
  assert.match(toasts.at(-1) ?? "", /開始分析 2 篇/);
});

test("runAnalyzeItemsPipeline stops before worker start when queue fails", async () => {
  const calls: ExtensionMessage[] = [];
  const sendAndSync = async <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> => {
    calls.push(message);
    return { ok: false, error: "queue failed" } as T;
  };

  const result = await runAnalyzeItemsPipeline({
    folderId: "folder-1",
    itemIds: ["a", "b"],
    sendAndSync,
    setWorkerStatus: () => undefined,
    setDisplayToast: () => undefined
  });

  assert.deepEqual(calls.map((call) => call.type), ["session/queue-items"]);
  assert.deepEqual(result, { ok: false, failedCount: 2 });
});
