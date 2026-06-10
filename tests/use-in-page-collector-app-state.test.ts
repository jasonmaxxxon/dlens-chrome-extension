import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import type { WorkerStatus } from "../src/state/processing-state.ts";
import { createSessionRecord } from "../src/state/store-helpers.ts";
import { createEmptyTabState, type ExtensionSnapshot } from "../src/state/types.ts";
import { buildPreviewSaveMessage, buildSessionModeChangeMessage, resolveOptimisticSession, runAnalyzeItemsPipeline } from "../src/ui/useInPageCollectorAppState.ts";

const descriptor = {
  target_type: "post" as const,
  page_url: "https://www.threads.net/search?q=test",
  post_url: "https://www.threads.net/@alpha/post/abc",
  author_hint: "alpha",
  text_snippet: "alpha post",
  time_token_hint: "1h",
  dom_anchor: "card-1",
  engagement: { likes: 10 },
  engagement_present: { likes: true },
  captured_at: "2026-05-22T00:00:00.000Z"
};

test("buildPreviewSaveMessage sends the visible preview descriptor with the topic target", () => {
  const message = buildPreviewSaveMessage({
    activeFolderMode: "topic",
    selectedTopicId: "topic-love",
    collectionTopicId: "topic-work",
    preview: descriptor
  });

  assert.equal(message.type, "session/save-current-preview");
  assert.equal(message.topicId, "topic-love");
  assert.deepEqual(message.descriptor, descriptor);
});

test("resolveOptimisticSession returns an existing target-mode session without mutating active session", () => {
  const productSession = createSessionRecord("Product workspace", "2026-05-27T00:00:00.000Z", "product");
  const prSession = createSessionRecord("PR Evidence workspace", "2026-05-27T00:00:00.000Z", "pr-evidence");
  const snapshot: ExtensionSnapshot = {
    global: {
      version: 1,
      sessions: [productSession, prSession],
      activeSessionId: productSession.id,
      settings: { ingestBaseUrl: "http://127.0.0.1:8000" },
      updatedAt: "2026-05-27T00:00:00.000Z"
    },
    tab: createEmptyTabState()
  };

  assert.equal(resolveOptimisticSession(snapshot, "pr-evidence")?.id, prSession.id);
  assert.equal(resolveOptimisticSession(snapshot, "topic"), null);
  assert.equal(snapshot.global.activeSessionId, productSession.id);
});

test("buildSessionModeChangeMessage realigns to an existing product session when active session drifted null", () => {
  const productSession = createSessionRecord("Product workspace", "2026-05-27T00:00:00.000Z", "product");
  const topicSession = createSessionRecord("Topic workspace", "2026-05-27T00:00:00.000Z", "topic");
  const snapshot: ExtensionSnapshot = {
    global: {
      version: 1,
      sessions: [topicSession, productSession],
      activeSessionId: null,
      settings: { ingestBaseUrl: "http://127.0.0.1:8000" },
      updatedAt: "2026-05-27T00:00:00.000Z"
    },
    tab: createEmptyTabState()
  };

  const message = buildSessionModeChangeMessage(snapshot, "product");

  assert.deepEqual(message, {
    type: "session/set-mode",
    sessionId: productSession.id,
    mode: "product"
  });
});

test("runAnalyzeItemsPipeline queues selected items then starts worker and refreshes", async () => {
  const calls: ExtensionMessage[] = [];
  const statuses: WorkerStatus[] = [];
  const toasts: string[] = [];
  const sendAndSync = async <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> => {
    calls.push(message);
    if (message.type === "session/queue-items-and-start-processing") {
      return { ok: true, queuedItemIds: message.itemIds, failedItemIds: [], processingStatus: "started" } as T;
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
    "session/queue-items-and-start-processing",
    "session/refresh-all"
  ]);
  assert.equal((calls[0] as Extract<ExtensionMessage, { type: "session/queue-items-and-start-processing" }>).sessionId, "folder-1");
  assert.deepEqual((calls[0] as Extract<ExtensionMessage, { type: "session/queue-items-and-start-processing" }>).itemIds, ["a", "b"]);
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

  assert.deepEqual(calls.map((call) => call.type), ["session/queue-items-and-start-processing"]);
  assert.deepEqual(result, { ok: false, failedCount: 2 });
});
