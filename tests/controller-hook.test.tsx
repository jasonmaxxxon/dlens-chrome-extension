import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { createEmptyGlobalState, createEmptyTabState } from "../src/state/types.ts";
import { useExtensionSnapshot } from "../src/ui/controller.tsx";
import { useProcessingCoordinator } from "../src/ui/useProcessingCoordinator.ts";

test("useExtensionSnapshot keeps sendAndSync stable across snapshot rerenders", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    chrome: globalThis.chrome
  };
  const snapshot = {
    global: createEmptyGlobalState(),
    tab: createEmptyTabState()
  };
  const listeners = new Set<(message: unknown) => void>();

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    chrome: {
      runtime: {
        sendMessage: async () => ({ ok: true, tabId: 7, snapshot }),
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
          removeListener: (listener: (message: unknown) => void) => listeners.delete(listener)
        }
      }
    }
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  const identities = new Set<unknown>();
  function Harness() {
    identities.add(useExtensionSnapshot(false).sendAndSync);
    return null;
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  try {
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    assert.equal(identities.size, 1);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});

test("in-page processing uses one idle poller and stays within five status requests per minute", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    chrome: globalThis.chrome
  };
  const snapshot = {
    global: createEmptyGlobalState(),
    tab: createEmptyTabState()
  };
  const listeners = new Set<(message: unknown) => void>();
  const scheduled = new Map<number, { callback: () => void; delay: number }>();
  let nextTimerId = 1;
  let statusRequests = 0;

  dom.window.setTimeout = ((callback: TimerHandler, delay?: number) => {
    const id = nextTimerId++;
    scheduled.set(id, { callback: callback as () => void, delay: delay ?? 0 });
    return id;
  }) as typeof dom.window.setTimeout;
  dom.window.clearTimeout = ((id?: number) => {
    if (id != null) scheduled.delete(id);
  }) as typeof dom.window.clearTimeout;

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    chrome: {
      runtime: {
        sendMessage: async (message: { type?: string }) => {
          if (message.type === "state/get-active-tab") return { ok: true, tabId: 7, snapshot };
          if (message.type === "backend/get-health") return { ok: true, backendHealth: { reachable: true } };
          if (message.type === "worker/get-status") {
            statusRequests += 1;
            return { ok: true, workerStatus: "idle", backendWorkUiState: { kind: "idle" } };
          }
          return { ok: false, error: `unexpected ${message.type}` };
        },
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
          removeListener: (listener: (message: unknown) => void) => listeners.delete(listener)
        }
      }
    }
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  function Harness() {
    const { sendAndSync } = useExtensionSnapshot(false);
    useProcessingCoordinator({
      popupOpen: true,
      activeFolderId: "folder-1",
      hasInflight: false,
      sendAndSync
    });
    return null;
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  try {
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(statusRequests, 1);

    for (let heartbeat = 0; heartbeat < 4; heartbeat += 1) {
      const callbacks = [...scheduled.values()];
      assert.equal(callbacks.length, 2);
      assert.deepEqual(callbacks.map((entry) => entry.delay), [12000, 12000]);
      scheduled.clear();
      await act(async () => {
        callbacks.forEach((entry) => entry.callback());
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    assert.equal(statusRequests, 5);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});
