import assert from "node:assert/strict";
import test from "node:test";

import { addRuntimeMessageListener, sendExtensionMessage } from "../src/ui/controller.tsx";

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
