import assert from "node:assert/strict";
import test from "node:test";

import {
  addRuntimeMessageListener,
  buildSnapshotReconcileDescriptor,
  resolveStateUpdatedSnapshot,
  sendExtensionMessage
} from "../src/ui/controller.tsx";
import { createEmptyGlobalState, createEmptyTabState, type ExtensionSnapshot } from "../src/state/types.ts";

test("sendExtensionMessage retries connection loss with staggered backoff delays", async () => {
  const originalChrome = globalThis.chrome;
  const originalSetTimeout = globalThis.setTimeout;

  const delays: number[] = [];
  let attempts = 0;

  globalThis.chrome = {
    runtime: {
      sendMessage: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        }
        return { ok: true };
      }
    }
  } as typeof chrome;

  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number) => {
    delays.push(delay ?? 0);
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const response = await sendExtensionMessage<{ ok: boolean }>({ type: "state/get-active-tab" });
    assert.deepEqual(response, { ok: true });
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [200, 600]);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("sendExtensionMessage does not retry unrelated runtime errors", async () => {
  const originalChrome = globalThis.chrome;

  let attempts = 0;
  globalThis.chrome = {
    runtime: {
      sendMessage: async () => {
        attempts += 1;
        throw new Error("Permission denied");
      }
    }
  } as typeof chrome;

  try {
    await assert.rejects(
      sendExtensionMessage<{ ok: boolean }>({ type: "state/get-active-tab" }),
      /Permission denied/,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("sendExtensionMessage returns an error response when extension context is invalidated", async () => {
  const originalChrome = globalThis.chrome;

  let attempts = 0;
  globalThis.chrome = {
    runtime: {
      sendMessage: async () => {
        attempts += 1;
        throw new Error("Extension context invalidated.");
      }
    }
  } as typeof chrome;

  try {
    const response = await sendExtensionMessage({ type: "state/get-active-tab" });
    assert.deepEqual(response, { ok: false, error: "Extension context invalidated." });
    assert.equal(attempts, 1);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("addRuntimeMessageListener ignores invalidated runtime listener setup", () => {
  const originalChrome = globalThis.chrome;
  const listener = (() => undefined) as Parameters<typeof chrome.runtime.onMessage.addListener>[0];

  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener: () => {
          throw new Error("Extension context invalidated.");
        },
        removeListener: () => {
          throw new Error("Extension context invalidated.");
        }
      }
    }
  } as typeof chrome;

  try {
    const dispose = addRuntimeMessageListener(listener);
    assert.doesNotThrow(dispose);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("addRuntimeMessageListener still throws unrelated listener setup errors", () => {
  const originalChrome = globalThis.chrome;
  const listener = (() => undefined) as Parameters<typeof chrome.runtime.onMessage.addListener>[0];

  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener: () => {
          throw new Error("Permission denied");
        },
        removeListener: () => undefined
      }
    }
  } as typeof chrome;

  try {
    assert.throws(() => addRuntimeMessageListener(listener), /Permission denied/);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

function makeControllerSnapshot(id: string): ExtensionSnapshot {
  return {
    global: {
      ...createEmptyGlobalState(),
      updatedAt: `2026-06-15T00:00:0${id}.000Z`
    },
    tab: createEmptyTabState()
  };
}

test("resolveStateUpdatedSnapshot adopts well-formed snapshots for the current tab", () => {
  const snapshot = makeControllerSnapshot("1");

  assert.deepEqual(
    resolveStateUpdatedSnapshot({ type: "state/updated", tabId: 7, snapshot }, 7),
    { tabId: 7, snapshot }
  );
});

test("resolveStateUpdatedSnapshot ignores state/updated without snapshot", () => {
  assert.equal(
    resolveStateUpdatedSnapshot({ type: "state/updated", tabId: 7 }, 7),
    null
  );
});

test("resolveStateUpdatedSnapshot ignores state/updated for a different tab", () => {
  assert.equal(
    resolveStateUpdatedSnapshot({ type: "state/updated", tabId: 99, snapshot: makeControllerSnapshot("2") }, 7),
    null
  );
});

test("resolveStateUpdatedSnapshot accepts the first well-formed update before tab id is known", () => {
  const snapshot = makeControllerSnapshot("3");

  assert.deepEqual(
    resolveStateUpdatedSnapshot({ type: "state/updated", tabId: 7, snapshot }, null),
    { tabId: 7, snapshot }
  );
});

test("buildSnapshotReconcileDescriptor only guards long async session-scoped writes", () => {
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "product/analyze-signals",
      sessionId: "session-1",
      requestId: "request-1"
    }),
    {
      lane: "snapshot.product/analyze-signals",
      target: { sessionId: "session-1" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/refresh-all",
      target: { sessionId: "session-2" }
    }),
    {
      lane: "snapshot.session/refresh-all",
      target: { sessionId: "session-2" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/queue-item",
      sessionId: "session-1",
      itemId: "item-1"
    }),
    {
      lane: "snapshot.session/queue-item",
      target: { sessionId: "session-1", itemId: "item-1" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/queue-selected",
      target: { sessionId: "session-2", itemId: "item-2" }
    }),
    {
      lane: "snapshot.session/queue-selected",
      target: { sessionId: "session-2", itemId: "item-2" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/queue-all-pending",
      target: { sessionId: "session-3" }
    }),
    {
      lane: "snapshot.session/queue-all-pending",
      target: { sessionId: "session-3" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/queue-items",
      sessionId: "session-4"
    }),
    {
      lane: "snapshot.session/queue-items",
      target: { sessionId: "session-4" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/refresh-item",
      sessionId: "session-5",
      itemId: "item-5"
    }),
    {
      lane: "snapshot.session/refresh-item",
      target: { sessionId: "session-5", itemId: "item-5" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "session/refresh-selected",
      target: { sessionId: "session-6", itemId: "item-6" }
    }),
    {
      lane: "snapshot.session/refresh-selected",
      target: { sessionId: "session-6", itemId: "item-6" }
    }
  );
  assert.deepEqual(
    buildSnapshotReconcileDescriptor({
      type: "folder/synthesis/generate",
      sessionId: "session-4"
    }),
    {
      lane: "snapshot.folder/synthesis/generate",
      target: { sessionId: "session-4" }
    }
  );
  assert.equal(
    buildSnapshotReconcileDescriptor({
      type: "session/set-active",
      sessionId: "session-3"
    }),
    null
  );
  assert.equal(
    buildSnapshotReconcileDescriptor({
      type: "pr/match-criteria",
      campaignId: "campaign-1"
    }),
    null
  );
});
