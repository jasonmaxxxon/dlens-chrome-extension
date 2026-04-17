import assert from "node:assert/strict";
import test from "node:test";

import { sendExtensionMessage } from "../src/ui/controller.tsx";

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
