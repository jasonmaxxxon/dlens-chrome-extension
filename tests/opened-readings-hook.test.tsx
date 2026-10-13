import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { useOpenedReadings } from "../src/ui/useOpenedReadings";
import { OPENED_READING_PREFIX } from "../src/state/opened-readings-storage";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser";
import { capture, item, session } from "./collection-browser.fixtures";

test("opened storage changes reach the panel live; selected reader writes opened-at", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const keys = ["window", "document", "HTMLElement", "Element", "chrome", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const prior = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const values: Record<string, unknown> = {};
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const emit = (key: string, value: unknown) => listeners.forEach(listener => listener({ [key]: { newValue: value } }, "local"));
  const chromeStub = { storage: { local: { get: async () => ({ ...values }), set: async (v: Record<string, unknown>) => {
    Object.assign(values, v); for (const [key, value] of Object.entries(v)) emit(key, value);
  } }, onChanged: { addListener: (fn: Parameters<typeof listeners.add>[0]) => listeners.add(fn), removeListener: (fn: Parameters<typeof listeners.add>[0]) => listeners.delete(fn) } } };
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, value: key === "chrome" ? chromeStub : key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] }));
  const now = new Date(Date.now() - 1000).toISOString();
  const source = item("ready", { status: "succeeded", completedAt: now, latestCapture: capture({}, { analysis: { status: "succeeded", generated_at: now, clusters: [], evidence: [] } as NonNullable<ReturnType<typeof capture>["analysis"]> }) });
  const sessions = [session("s", [source], "topic")];
  const post = buildCollectionPosts(sessions)[0];
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  function Harness({ selected }: { selected: string | null }) {
    const state = useOpenedReadings(true, selected, sessions, {});
    return <output>{JSON.stringify(state.opened)}</output>;
  }
  try {
    await act(async () => root.render(<Harness selected={null} />));
    await act(async () => emit(OPENED_READING_PREFIX + "other", now));
    assert.deepEqual(JSON.parse(container.textContent!), { other: now });
    await act(async () => root.render(<Harness selected={post.key} />));
    assert.ok(values[OPENED_READING_PREFIX + "ready"]);
    assert.ok(JSON.parse(container.textContent!).ready);
    assert.ok(JSON.parse(container.textContent!).other);
  } finally {
    await act(async () => root.unmount());
    assert.equal(listeners.size, 0);
    keys.forEach((key, i) => prior[i] ? Object.defineProperty(globalThis, key, prior[i]!) : Reflect.deleteProperty(globalThis, key));
    dom.window.close();
  }
});
