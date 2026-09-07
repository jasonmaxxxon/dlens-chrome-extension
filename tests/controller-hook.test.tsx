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
    ownerRenders: () => number;
    statusRequests: () => number;
    snapshot: () => ReturnType<typeof useExtensionSnapshot>["snapshot"];
    sendAndSync: ReturnType<typeof useExtensionSnapshot>["sendAndSync"];
    setWork: (workerStatus: WorkerStatus, workState: BackendWorkUiState) => void;
    setHealthReachable: (reachable: boolean) => void;
    setWorkerResponse: (response: (() => Promise<unknown>) | null) => void;
    setRefreshResponse: (response: (() => Promise<unknown>) | null) => void;
    state: () => ReturnType<typeof useProcessingCoordinator>;
    close: () => Promise<void>;
    delays: () => number[];
    fireTimer: (delay: number) => Promise<void>;
  }) => Promise<void>,
  options: { workerResponse?: () => Promise<unknown>; healthReachable?: boolean } = {}
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
    global: { ...createEmptyGlobalState(), activeSessionId: "folder-1" },
    tab: createEmptyTabState()
  };
  const listeners = new Set<(message: unknown) => void>();
  const scheduled = new Map<number, { callback: () => void; delay: number }>();
  let nextTimerId = 1;
  let statusRequests = 0;
  let consumerRenders = 0;
  let ownerRenders = 0;

  const backend = {
    workerStatus: "idle" as WorkerStatus,
    workState: { kind: "idle" } as BackendWorkUiState,
    healthReachable: options.healthReachable ?? true,
    workerResponse: options.workerResponse ?? null as (() => Promise<unknown>) | null,
    refreshResponse: null as (() => Promise<unknown>) | null
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
            if (backend.workerResponse) return backend.workerResponse();
            // A fresh object every poll mirrors the real projection, so identity
            // preservation must come from the coordinator, not the transport.
            return { ok: true, workerStatus: backend.workerStatus, backendWorkUiState: { ...backend.workState } };
          }
          if (message.type === "session/refresh-all") {
            if (backend.refreshResponse) return backend.refreshResponse();
            return { ok: true, tabId: 7, snapshot };
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

  const Consumer = React.memo(function Consumer(_props: {
    workState: BackendWorkUiState | null;
    reachability: BackendReachability;
  }) {
    consumerRenders += 1;
    return null;
  });

  let current: ReturnType<typeof useProcessingCoordinator>;
  let currentSnapshot: ReturnType<typeof useExtensionSnapshot>["snapshot"];
  let currentSync: ReturnType<typeof useExtensionSnapshot>["sendAndSync"];
  function Harness({ open = true }: { open?: boolean }) {
    ownerRenders += 1;
    const { sendAndSync, snapshot: hookSnapshot } = useExtensionSnapshot(false);
    currentSnapshot = hookSnapshot;
    currentSync = sendAndSync;
    const coordinator = useProcessingCoordinator({
      popupOpen: open,
      activeFolderId: "folder-1",
      hasInflight: false,
      sendAndSync
    });
    current = coordinator;
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
      ownerRenders: () => ownerRenders,
      statusRequests: () => statusRequests,
      snapshot: () => currentSnapshot,
      sendAndSync: currentSync!,
      setWork: (workerStatus, workState) => {
        backend.workerStatus = workerStatus;
        backend.workState = workState;
      },
      setHealthReachable: (reachable) => {
        backend.healthReachable = reachable;
      },
      setWorkerResponse: (response) => { backend.workerResponse = response; },
      setRefreshResponse: (response) => { backend.refreshResponse = response; },
      state: () => current,
      close: async () => { await act(async () => { root.render(<Harness open={false} />); await flushMicrotasks(); }); },
      delays: () => [...scheduled.values()].map((entry) => entry.delay),
      fireTimer: async (delay) => {
        const entry = [...scheduled.entries()].find(([, timer]) => timer.delay === delay);
        if (!entry) return;
        scheduled.delete(entry[0]);
        await act(async () => { entry[1].callback(); await flushMicrotasks(); });
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
    const ownerRendersAfterFirstResponse = ctx.ownerRenders();
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
    assert.equal(
      ctx.ownerRenders() - ownerRendersAfterFirstResponse,
      0,
      "identical idle polls must not re-render the coordinator owner"
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

const unavailableResponse = async () => ({ ok: false, error: '503 {"detail":"DB unavailable"}' });

test("first worker 503 stays unavailable while successful health stays reachable", async () => {
  await withCoordinatorHarness(async (ctx) => {
    assert.equal(ctx.state().workerStatus, null);
    assert.deepEqual(ctx.state().backendWorkUiState, { kind: "unavailable", lastVerifiedAt: null });
    assert.equal(ctx.state().backendReachability, "reachable");
  }, { workerResponse: unavailableResponse });
});

test("missing health and worker evidence never starts as reachable or idle", async () => {
  await withCoordinatorHarness(async (ctx) => {
    assert.equal(ctx.state().backendReachability, "unknown");
    assert.equal(ctx.state().backendWorkUiState?.kind, "unavailable");
  }, { workerResponse: unavailableResponse, healthReachable: false });
});

test("idle to 503 keeps only historical evidence and recovers on a successful response", async () => {
  await withCoordinatorHarness(async (ctx) => {
    assert.equal(ctx.state().backendWorkUiState?.kind, "idle");
    ctx.setWorkerResponse(unavailableResponse);
    await ctx.fireHeartbeat();
    assert.equal(ctx.state().workerStatus, null);
    assert.equal(ctx.state().backendWorkUiState?.kind, "unavailable");
    const failedState = ctx.state().backendWorkUiState;
    assert.ok(failedState?.kind === "unavailable" && failedState.lastVerifiedAt);
    assert.equal(ctx.state().lastVerifiedWorkerSnapshot?.workState.kind, "idle");
    const before = ctx.ownerRenders();
    await ctx.fireHeartbeat();
    assert.equal(ctx.state().backendWorkUiState, failedState);
    assert.equal(ctx.ownerRenders(), before, "identical failed polls must not repaint");
    ctx.setWorkerResponse(null);
    await ctx.fireHeartbeat();
    assert.equal(ctx.state().backendWorkUiState?.kind, "idle");
    assert.equal(ctx.state().workerError, null);
  });
});

for (const failure of ["throw", "response"] as const) {
  test(`worker success survives session refresh ${failure} without worker backoff`, async () => {
    await withCoordinatorHarness(async (ctx) => {
      ctx.setWork("draining", { kind: "draining" });
      ctx.setRefreshResponse(async () => {
        if (failure === "throw") throw new Error("refresh failed");
        return { ok: false, error: "refresh failed" };
      });
      await ctx.fireHeartbeat();
      assert.equal(ctx.state().workerStatus, "draining");
      assert.equal(ctx.state().backendWorkUiState?.kind, "draining");
      assert.equal(ctx.state().workerError, null);
      assert.equal(ctx.state().dataRefreshError, "refresh failed");
      assert.ok(ctx.delays().includes(4000), "refresh failure must retain healthy worker poll interval");
      ctx.setRefreshResponse(null);
      await ctx.fireHeartbeat();
      assert.equal(ctx.state().dataRefreshError, null);
    });
  });
}

test("closing the popup ignores a late worker response and schedules no new poll", async () => {
  let resolveResponse!: (response: unknown) => void;
  await withCoordinatorHarness(async (ctx) => {
    assert.equal(ctx.state().backendWorkUiState?.kind, "unknown");
    await ctx.close();
    await act(async () => { resolveResponse({ ok: true, workerStatus: "draining", backendWorkUiState: { kind: "draining" } }); });
    assert.equal(ctx.state().workerStatus, null);
    assert.equal(ctx.state().backendWorkUiState?.kind, "unknown");
    assert.deepEqual(ctx.delays(), []);
  }, { workerResponse: () => new Promise((resolve) => { resolveResponse = resolve; }) });
});

test("a stalled worker request expires current evidence and ignores its late response", async () => {
  let resolveResponse!: (response: unknown) => void;
  await withCoordinatorHarness(async (ctx) => {
    ctx.setWorkerResponse(() => new Promise((resolve) => { resolveResponse = resolve; }));
    await ctx.fireHeartbeat();
    await ctx.fireTimer(30000);
    assert.equal(ctx.state().workerStatus, null);
    assert.equal(ctx.state().backendWorkUiState.kind, "unavailable");
    ctx.setWorkerResponse(null);
    await act(async () => { ctx.state().retryProcessingStatus(); });
    assert.equal(ctx.state().backendWorkUiState.kind, "idle");
    await act(async () => { resolveResponse({ ok: true, workerStatus: "draining", backendWorkUiState: { kind: "draining" } }); });
    assert.equal(ctx.state().backendWorkUiState.kind, "idle");
  });
});

test("manual retry recovers a failed refresh even after worker becomes idle", async () => {
  await withCoordinatorHarness(async (ctx) => {
    ctx.setWork("draining", { kind: "draining" });
    ctx.setRefreshResponse(async () => ({ ok: false, error: "refresh failed" }));
    await ctx.fireHeartbeat();
    ctx.setWork("idle", { kind: "idle" });
    await ctx.fireHeartbeat();
    assert.equal(ctx.state().dataRefreshError, "refresh failed");
    ctx.setRefreshResponse(null);
    await act(async () => { ctx.state().retryProcessingStatus(); });
    assert.equal(ctx.state().dataRefreshError, null);
    assert.equal(ctx.state().backendWorkUiState.kind, "idle");
  });
});

test("confirmed start-processing activity replaces unavailable work before the next poll", async () => {
  await withCoordinatorHarness(async (ctx) => {
    await act(async () => { ctx.state().setWorkerStatus("draining"); });
    assert.equal(ctx.state().backendWorkUiState.kind, "draining");
    assert.equal(ctx.state().workerError, null);
  }, { workerResponse: unavailableResponse });
});

test("worker success is published before refresh completes and late refresh errors are ignored after closing", async () => {
  let rejectRefresh!: (reason: Error) => void;
  await withCoordinatorHarness(async (ctx) => {
    ctx.setWork("draining", { kind: "draining" });
    ctx.setRefreshResponse(() => new Promise((_, reject) => { rejectRefresh = reject; }));
    await ctx.fireHeartbeat();
    assert.equal(ctx.state().backendWorkUiState.kind, "draining");
    assert.equal(ctx.state().workerError, null);
    await ctx.close();
    await act(async () => { rejectRefresh(new Error("late refresh failure")); });
    assert.equal(ctx.state().workerError, null);
    assert.equal(ctx.state().dataRefreshError, null);
    assert.deepEqual(ctx.delays(), []);
  });
});

test("review repro: hanging refresh must not stop worker polling", async () => {
  await withCoordinatorHarness(async (ctx) => {
    ctx.setWork("draining", { kind: "draining" });
    await ctx.fireHeartbeat();
    ctx.setWork("idle", { kind: "idle" });
    let refreshRequests = 0;
    ctx.setRefreshResponse(() => { refreshRequests += 1; return new Promise(() => {}); });
    await ctx.fireHeartbeat();
    const before = ctx.statusRequests();
    for (let i = 0; i < 10; i += 1) await ctx.fireHeartbeat();
    assert.ok(ctx.statusRequests() > before, "worker polling must survive a pending refresh");
    assert.equal(refreshRequests, 1, "unsettled refreshes must not accumulate");
    assert.ok(ctx.state().dataRefreshError, "expired refresh must expose a retryable failure");
  });
});

for (const outcome of ["success", "failure"] as const) {
  test(`review repro: old status ${outcome} must not overwrite acknowledged start`, async () => {
    let finish!: (response: unknown) => void;
    await withCoordinatorHarness(async (ctx) => {
      await act(async () => { ctx.state().setWorkerStatus("draining"); });
      await act(async () => { finish(outcome === "success"
        ? { ok: true, workerStatus: "idle", backendWorkUiState: { kind: "idle" } }
        : { ok: false, error: "stale status failure" }); });
      assert.equal(ctx.state().backendWorkUiState.kind, "draining");
      assert.equal(ctx.state().workerError, null);
      assert.ok(ctx.delays().includes(4000), "a fresh worker observation must be scheduled without failure backoff");
      ctx.setWorkerResponse(null);
      ctx.setWork("idle", { kind: "idle" });
      await ctx.fireTimer(4000);
      assert.equal(ctx.state().backendWorkUiState.kind, "idle", "a newer observation can supersede the acknowledgement");
    }, { workerResponse: () => new Promise((resolve) => { finish = resolve; }) });
  });
}

test("expired refresh cannot replace newer snapshot or clear its error, and remains single-flight", async () => {
  let finish!: (response: unknown) => void;
  let refreshRequests = 0;
  await withCoordinatorHarness(async (ctx) => {
    ctx.setWork("draining", { kind: "draining" });
    ctx.setRefreshResponse(() => { refreshRequests += 1; return new Promise((resolve) => { finish = resolve; }); });
    await ctx.fireHeartbeat();
    const current = ctx.snapshot();
    await ctx.fireTimer(30000);
    const error = ctx.state().dataRefreshError;
    assert.ok(error);
    await act(async () => { ctx.state().retryProcessingStatus(); });
    assert.equal(refreshRequests, 1);
    await act(async () => { finish({ ok: true, tabId: 7, snapshot: { global: { ...createEmptyGlobalState(), activeSessionId: "stale" }, tab: createEmptyTabState() } }); });
    assert.equal(ctx.snapshot(), current, "expired refresh must be rejected before controller snapshot commit");
    assert.equal(ctx.state().dataRefreshError, error);
    ctx.setRefreshResponse(null);
    await ctx.fireHeartbeat();
    assert.equal(ctx.state().dataRefreshError, null, "a fresh successful refresh clears its own failure");
  });
});

test("closing rejects a pending refresh snapshot before the controller can commit it", async () => {
  let finish!: (response: unknown) => void;
  await withCoordinatorHarness(async (ctx) => {
    ctx.setWork("draining", { kind: "draining" });
    ctx.setRefreshResponse(() => new Promise((resolve) => { finish = resolve; }));
    await ctx.fireHeartbeat();
    const current = ctx.snapshot();
    await ctx.close();
    await act(async () => { finish({ ok: true, tabId: 7, snapshot: { global: { ...createEmptyGlobalState(), activeSessionId: "stale" }, tab: createEmptyTabState() } }); });
    assert.equal(ctx.snapshot(), current);
    assert.equal(ctx.state().dataRefreshError, null);
  });
});

test("sendAndSync checks the optional acceptance guard before applying snapshots and preserves its default", async () => {
  await withCoordinatorHarness(async (ctx) => {
    const initial = ctx.snapshot();
    const refreshed = { global: { ...createEmptyGlobalState(), activeSessionId: "folder-1" }, tab: createEmptyTabState() };
    ctx.setRefreshResponse(async () => ({ ok: true, tabId: 7, snapshot: refreshed }));
    await act(async () => { await ctx.sendAndSync({ type: "session/refresh-all", target: { sessionId: "folder-1" } }, () => false); });
    assert.equal(ctx.snapshot(), initial);
    await act(async () => { await ctx.sendAndSync({ type: "session/refresh-all", target: { sessionId: "folder-1" } }); });
    assert.equal(ctx.snapshot(), refreshed);
  });
});
