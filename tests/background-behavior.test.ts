import assert from "node:assert/strict";
import test from "node:test";

import background, { backgroundTestables } from "../entrypoints/background.ts";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import { createEmptyGlobalState, createEmptyTabState, type ExtensionGlobalState, type FolderMode, type SessionRecord } from "../src/state/types.ts";

type StorageState = Record<string, unknown>;

const TAB_ID = 1;

function makeSession(id: string, mode: FolderMode): SessionRecord {
  return {
    id,
    name: `${mode} workspace`,
    mode,
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    items: []
  };
}

function makeGlobal(sessions: SessionRecord[], activeSessionId: string): ExtensionGlobalState {
  return {
    ...createEmptyGlobalState(),
    sessions,
    activeSessionId
  };
}

function readStorageKeys(keys: string | string[] | Record<string, unknown> | null | undefined, state: StorageState): StorageState {
  if (keys == null) {
    return structuredClone(state);
  }
  if (typeof keys === "string") {
    return { [keys]: structuredClone(state[keys]) };
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, structuredClone(state[key] ?? fallback)])
  );
}

async function createHarness(
  initialState: StorageState,
  options: { blockStateUpdatedBroadcast?: boolean } = {}
): Promise<{
  dispatch: (message: ExtensionMessage) => Promise<ExtensionResponse>;
  state: StorageState;
  tabKey: string;
  tabMessages: ExtensionMessage[];
  writes: string[][];
}> {
  const state = structuredClone(initialState);
  const writes: string[][] = [];
  const tabMessages: ExtensionMessage[] = [];
  let listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] | null = null;
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);

  const storageArea = {
    QUOTA_BYTES: 10 * 1024 * 1024,
    get: async (keys?: string | string[] | Record<string, unknown> | null) => readStorageKeys(keys, state),
    getBytesInUse: async () => 0,
    remove: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete state[key];
      }
    },
    set: async (payload: Record<string, unknown>) => {
      writes.push(Object.keys(payload));
      Object.assign(state, structuredClone(payload));
    }
  };

  (globalThis as unknown as { chrome: typeof chrome }).chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://dlens/${path}`,
      onConnect: { addListener: () => undefined },
      onInstalled: { addListener: () => undefined },
      onMessage: {
        addListener: (callback: Parameters<typeof chrome.runtime.onMessage.addListener>[0]) => {
          listener = callback;
        }
      }
    },
    sidePanel: {
      setPanelBehavior: async () => undefined
    },
    storage: {
      local: storageArea
    },
    tabs: {
      create: async () => ({ id: TAB_ID }) as chrome.tabs.Tab,
      get: async () => ({ id: TAB_ID }) as chrome.tabs.Tab,
      onRemoved: { addListener: () => undefined },
      query: async () => [{ id: TAB_ID }] as chrome.tabs.Tab[],
      sendMessage: async (_tabId: number, message: ExtensionMessage) => {
        tabMessages.push(message);
        if (options.blockStateUpdatedBroadcast && message.type === "state/updated") {
          await new Promise(() => undefined);
        }
      }
    }
  } as typeof chrome;

  backgroundTestables.resetBackgroundTestState();
  background.main();
  await Promise.resolve();
  await Promise.resolve();
  writes.length = 0;

  assert.notEqual(listener, null, "background runtime listener must be registered");

  return {
    dispatch: (message: ExtensionMessage) => new Promise((resolve, reject) => {
      const originalInfo = console.info;
      console.info = () => undefined;
      const timeout = setTimeout(() => {
        console.info = originalInfo;
        reject(new Error(`No response for ${message.type}`));
      }, 1000);
      listener?.(message, { tab: { id: TAB_ID } } as chrome.runtime.MessageSender, (response: ExtensionResponse) => {
        clearTimeout(timeout);
        console.info = originalInfo;
        resolve(response);
      });
    }),
    state,
    tabKey,
    tabMessages,
    writes
  };
}

test("session/set-mode existing target mode writes only active-session and tab keys", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/set-mode", sessionId: product.id, mode: "product" });

  assert.equal(response.ok, true);
  assert.equal(response.setModePath, "fast");
  assert.deepEqual(harness.writes.map((keys) => keys.toSorted()), [[
    backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY,
    harness.tabKey
  ].toSorted()]);
  assert.equal(harness.state[backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY], product.id);
});

test("session/set-mode missing target mode persists the global key", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/set-mode", sessionId: topic.id, mode: "product" });
  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;

  assert.equal(response.ok, true);
  assert.equal(response.setModePath, "slow");
  assert.deepEqual(harness.writes.map((keys) => keys.toSorted()), [[
    backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY,
    backgroundTestables.GLOBAL_STORAGE_KEY,
    harness.tabKey
  ].toSorted()]);
  assert.equal(global.sessions.length, 2);
  assert.equal(global.sessions.some((session) => session.mode === "product"), true);
});

test("session/refresh-all with no refreshable work and unchanged error performs no storage writes", async () => {
  const topic = makeSession("topic-session", "topic");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  const response = await harness.dispatch({ type: "session/refresh-all", sessionId: topic.id });

  assert.equal(response.ok, true);
  assert.deepEqual(harness.writes, []);
});

test("state update broadcast does not block the set-mode response", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  }, { blockStateUpdatedBroadcast: true });

  const result = await Promise.race([
    harness.dispatch({ type: "session/set-mode", sessionId: product.id, mode: "product" }).then(() => "response"),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50))
  ]);

  assert.equal(result, "response");
  assert.equal(harness.tabMessages.some((message) => message.type === "state/updated"), true);
});

test("background mutateSnapshot serializes real snapshot writes", async () => {
  const topic = makeSession("topic-session", "topic");
  const product = makeSession("product-session", "product");
  const tabKey = backgroundTestables.tabStorageKey(TAB_ID);
  const harness = await createHarness({
    [backgroundTestables.GLOBAL_STORAGE_KEY]: makeGlobal([topic, product], topic.id),
    [backgroundTestables.ACTIVE_SESSION_ID_STORAGE_KEY]: topic.id,
    [tabKey]: createEmptyTabState()
  });

  await Promise.all([
    backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
      global: {
        ...current.global,
        sessions: current.global.sessions.map((session) =>
          session.id === topic.id ? { ...session, name: "topic-updated" } : session
        )
      },
      tab: current.tab
    })),
    backgroundTestables.mutateSnapshot(TAB_ID, (current) => ({
      global: {
        ...current.global,
        sessions: current.global.sessions.map((session) =>
          session.id === product.id ? { ...session, name: "product-updated" } : session
        )
      },
      tab: current.tab
    }))
  ]);

  const global = harness.state[backgroundTestables.GLOBAL_STORAGE_KEY] as ExtensionGlobalState;

  assert.equal(global.sessions.find((session) => session.id === topic.id)?.name, "topic-updated");
  assert.equal(global.sessions.find((session) => session.id === product.id)?.name, "product-updated");
});
