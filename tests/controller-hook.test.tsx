import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { createEmptyGlobalState, createEmptyTabState } from "../src/state/types.ts";
import type { BackendReachability, BackendWorkUiState, WorkerStatus } from "../src/state/processing-state.ts";
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

// Mounts the shared processing coordinator behind a memoized consumer so a test
// can count how many times a downstream UI surface actually re-renders. The
// consumer only re-renders when the backend work state OR reachability changes
// identity, which is exactly the "commit" we care about for idle poll dedupe.
async function withCoordinatorHarness(
  run: (ctx: {
    fireHeartbeat: () => Promise<void>;
    consumerRenders: () => number;
    statusRequests: () => number;
    setWork: (workerStatus: WorkerStatus, workState: BackendWorkUiState) => void;
    setHealthReachable: (reachable: boolean) => void;
  }) => Promise<void>
): Promise<void> {
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
  let consumerRenders = 0;

  const backend = {
    workerStatus: "idle" as WorkerStatus,
    workState: { kind: "idle" } as BackendWorkUiState,
    healthReachable: true
  };

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
          if (message.type === "backend/get-health") {
            return backend.healthReachable
              ? { ok: true, backendHealth: { reachable: true } }
              : { ok: true, backendHealth: { reachable: false, error: "down" } };
          }
          if (message.type === "worker/get-status") {
            statusRequests += 1;
            // A fresh object every poll mirrors the real projection, so identity
            // preservation must come from the coordinator, not the transport.
            return { ok: true, workerStatus: backend.workerStatus, backendWorkUiState: { ...backend.workState } };
          }
          if (message.type === "session/refresh-all") return { ok: true, tabId: 7, snapshot };
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

  const Consumer = React.memo(function Consumer(_props: {
    workState: BackendWorkUiState | null;
    reachability: BackendReachability;
  }) {
    consumerRenders += 1;
    return null;
  });

  function Harness() {
    const { sendAndSync } = useExtensionSnapshot(false);
    const coordinator = useProcessingCoordinator({
      popupOpen: true,
      activeFolderId: "folder-1",
      hasInflight: false,
      sendAndSync
    });
    return <Consumer workState={coordinator.backendWorkUiState} reachability={coordinator.backendReachability} />;
  }

  async function flushMicrotasks() {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  }

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  try {
    await act(async () => {
      root.render(<Harness />);
      await flushMicrotasks();
    });

    await run({
      fireHeartbeat: async () => {
        const callbacks = [...scheduled.values()];
        scheduled.clear();
        await act(async () => {
          callbacks.forEach((entry) => entry.callback());
          await flushMicrotasks();
        });
      },
      consumerRenders: () => consumerRenders,
      statusRequests: () => statusRequests,
      setWork: (workerStatus, workState) => {
        backend.workerStatus = workerStatus;
        backend.workState = workState;
      },
      setHealthReachable: (reachable) => {
        backend.healthReachable = reachable;
      }
    });
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
}

test("five identical idle worker responses commit backend work state exactly once", async () => {
  await withCoordinatorHarness(async (ctx) => {
    // The first idle response (during mount) is the only permitted commit.
    assert.equal(ctx.statusRequests(), 1);
    const rendersAfterFirstResponse = ctx.consumerRenders();
    assert.equal(
      rendersAfterFirstResponse,
      2,
      "initial mount plus the first idle response must render the consumer exactly twice"
    );

    // Four more identical idle polls — the whole point of the optimization.
    for (let poll = 0; poll < 4; poll += 1) {
      await ctx.fireHeartbeat();
    }

    assert.equal(ctx.statusRequests(), 5);
    assert.equal(
      ctx.consumerRenders() - rendersAfterFirstResponse,
      0,
      "identical idle polls must not re-render the backend work state consumer"
    );
  });
});

test("each backend work-state transition re-renders the consumer exactly once", async () => {
  await withCoordinatorHarness(async (ctx) => {
    const expectDelta = async (
      label: string,
      workerStatus: WorkerStatus,
      workState: BackendWorkUiState,
      delta: number
    ) => {
      ctx.setWork(workerStatus, workState);
      const before = ctx.consumerRenders();
      await ctx.fireHeartbeat();
      assert.equal(ctx.consumerRenders() - before, delta, label);
    };

    await expectDelta("idle -> draining", "draining", { kind: "draining" }, 1);
    // A repeated identical response between transitions is deduped.
    await expectDelta("draining -> draining (identical)", "draining", { kind: "draining" }, 0);
    await expectDelta("draining -> analysis_failed", "idle", { kind: "analysis_failed", count: 1 }, 1);
    await expectDelta(
      "analysis_failed -> retry_waiting",
      "idle",
      { kind: "retry_waiting", count: 1, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: null },
      1
    );
    // Same kind, changed field must still count as a transition.
    await expectDelta(
      "retry_waiting count bump",
      "idle",
      { kind: "retry_waiting", count: 2, earliestRetryAt: "2026-06-16T10:30:00.000Z", nextDueAt: null },
      1
    );
    await expectDelta("retry_waiting -> expired_running", "idle", { kind: "expired_running", count: 1 }, 1);
  });
});

test("backend reachability down and back up each re-render the consumer once", async () => {
  await withCoordinatorHarness(async (ctx) => {
    // First health failure is suppressed (one timeout tolerated), so reachability
    // stays "reachable" and nothing re-renders.
    ctx.setHealthReachable(false);
    let before = ctx.consumerRenders();
    await ctx.fireHeartbeat();
    assert.equal(ctx.consumerRenders() - before, 0, "first timeout suppressed");

    // Second failure -> slow.
    before = ctx.consumerRenders();
    await ctx.fireHeartbeat();
    assert.equal(ctx.consumerRenders() - before, 1, "escalate to slow");

    // Third failure -> unreachable.
    before = ctx.consumerRenders();
    await ctx.fireHeartbeat();
    assert.equal(ctx.consumerRenders() - before, 1, "escalate to unreachable");

    // Recovery -> reachable.
    ctx.setHealthReachable(true);
    before = ctx.consumerRenders();
    await ctx.fireHeartbeat();
    assert.equal(ctx.consumerRenders() - before, 1, "recover to reachable");
  });
});
