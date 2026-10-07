import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { startInlineCollectRuntime } from "../src/content/inline-collect-runtime.ts";
import { INLINE_COLLECT_MODES, INLINE_COLLECT_MODE_NAMES, type InlineCollectState } from "../src/state/inline-collect.ts";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import { consumeWorkspaceOpen, requestWorkspaceOpen } from "../src/ui/inpage-helpers.tsx";
import { GLOBAL_STATE_STORAGE_KEY } from "../src/state/storage-keys.ts";
import { createEmptyGlobalState, type ExtensionGlobalState } from "../src/state/types.ts";
import { readPipelineTrace } from "../src/state/pipeline-trace.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const base: InlineCollectState = {
  lastMode: "topic", saved: [], changed: false,
  destinations: INLINE_COLLECT_MODES.map((mode) => ({ mode, sessionId: mode, sessionName: INLINE_COLLECT_MODE_NAMES[mode] }))
};
function fixture(options: { deferSnapshot?: boolean } = {}) {
  const dom = new JSDOM(`<article><a href="/@author">author</a><a href="/@author/post/a">1h</a><p>The original source text.</p><div>${["Like", "Reply", "Repost", "Share"].map((title) => `<div role="button"><svg><title>${title}</title></svg></div>`).join("")}</div></article><div id="overlay"></div>`, { url: "https://www.threads.com/", pretendToBeVisual: true });
  const calls: { message: ExtensionMessage; resolve: (response: ExtensionResponse) => void; reject: (error: Error) => void }[] = [];
  const keys = ["window", "document", "Element", "HTMLElement", "Node", "MutationObserver", "CustomEvent", "chrome"] as const;
  const saved = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const storageListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  let releaseSnapshot: ((response: ExtensionResponse) => void) | null = null;
  const chrome = { storage: { onChanged: {
    addListener(listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) { storageListeners.add(listener); },
    removeListener(listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) { storageListeners.delete(listener); }
  } }, runtime: { sendMessage(message: ExtensionMessage) {
    if (message.type === "session/inline-collect" && message.action === "snapshot") return options.deferSnapshot
      ? new Promise<ExtensionResponse>(resolve => { releaseSnapshot = resolve; }) : Promise.resolve({ ok: true, inlineCollect: base });
    return new Promise<ExtensionResponse>((resolve, reject) => calls.push({ message, resolve, reject }));
  }, onMessage: { addListener() {}, removeListener() {} } } };
  keys.forEach((key) => Object.defineProperty(globalThis, key, { configurable: true, value: key === "chrome" ? chrome : dom.window[key] }));
  const runtime = startInlineCollectRuntime(dom.window.document.getElementById("overlay")!);
  const button = dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-button")!;
  const chip = dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-chip")!;
  const click = () => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 0 }));
  return { dom, runtime, calls, button, chip, click,
    emitGlobal(global: ExtensionGlobalState) { storageListeners.forEach(listener => listener({ [GLOBAL_STATE_STORAGE_KEY]: { newValue: global } }, "local")); },
    releaseSnapshot() { releaseSnapshot?.({ ok: true, inlineCollect: base }); },
    storageListenerCount: () => storageListeners.size,
    cleanup() { runtime.destroy(); dom.window.close(); keys.forEach((key, index) => saved[index] ? Object.defineProperty(globalThis, key, saved[index]!) : Reflect.deleteProperty(globalThis, key)); } };
}
const savedState: InlineCollectState = { ...base, changed: true, saved: [{ postKey: "threads-post:a", mode: "topic", sessionId: "topic", sessionName: "觀眾反應", itemId: "item-a" }] };

test("tap acknowledges synchronously while storage response is deferred", async () => {
  const s = fixture();
  try {
    await tick(); s.click();
    assert.equal(s.button.classList.contains("saved"), true);
    assert.equal(s.chip.hidden, false);
    assert.equal(s.chip.textContent, "✓ 觀眾反應");
    await tick();
    assert.equal(s.calls.length, 1);
    const message = s.calls[0].message;
    assert.equal(message.type, "session/inline-collect");
    assert.ok(message.type === "session/inline-collect" && message.action === "save");
    assert.doesNotMatch(message.descriptor.text_snippet, /觀眾反應|✓/);
    s.calls[0].resolve({ ok: true, inlineCollect: savedState }); await tick();
    assert.equal(s.dom.window.document.querySelector(".dlens-collect-toast.on"), null);
  } finally { s.cleanup(); }
});

test("rapid tap-save then tap-unsave stays unsaved through the older response", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick(); s.click();
    assert.equal(s.button.classList.contains("saved"), false);
    s.calls[0].resolve({ ok: true, inlineCollect: savedState }); await tick();
    assert.equal(s.button.classList.contains("saved"), false);
    assert.equal(s.calls[1].message.type, "session/inline-collect");
    assert.ok(s.calls[1].message.type === "session/inline-collect" && s.calls[1].message.action === "remove");
    s.calls[1].resolve({ ok: true, inlineCollect: { ...base, changed: true, undoToken: "undo-a" } }); await tick();
    assert.equal(s.button.classList.contains("saved"), false);
    assert.equal(s.dom.window.document.querySelector(".dlens-collect-toast button")?.textContent, "復原");
  } finally { s.cleanup(); }
});

test("failed persistence rolls optimistic state back to the authoritative state", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick();
    s.calls[0].resolve({ ok: false, error: "test write failed" }); await tick();
    assert.equal(s.button.classList.contains("saved"), false);
    assert.equal(s.chip.hidden, true);
  } finally { s.cleanup(); }
});

test("a chip workspace request survives a closed popup and waits for session hydration", () => {
  const dom = new JSDOM("");
  try {
    const win = dom.window as unknown as Window;
    requestWorkspaceOpen("session-a", win);
    assert.equal(consumeWorkspaceOpen([], win), null);
    assert.equal(consumeWorkspaceOpen(["session-a"], win), "session-a");
    assert.equal(consumeWorkspaceOpen(["session-a"], win), null);
  } finally { dom.window.close(); }
});

test("a later tap invalidates the previous undo before its storage write starts", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick();
    s.calls[0].resolve({ ok: true, inlineCollect: savedState }); await tick();
    s.click(); await tick();
    s.calls[1].resolve({ ok: true, inlineCollect: { ...base, changed: true, undoToken: "old-undo" } }); await tick();
    const oldUndo = s.dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-toast button")!;
    s.click(); oldUndo.click(); await tick();
    assert.equal(s.calls.length, 3);
    assert.ok(s.calls.every(({ message }) => message.type !== "session/inline-collect" || message.action !== "undo"));
    s.calls[2].resolve({ ok: true, inlineCollect: savedState }); await tick();
  } finally { s.cleanup(); }
});

test("undo restores the saved button immediately while its inverse write is pending", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick();
    s.calls[0].resolve({ ok: true, inlineCollect: savedState }); await tick();
    s.click(); await tick();
    s.calls[1].resolve({ ok: true, inlineCollect: { ...base, changed: true, undoToken: "undo" } }); await tick();
    s.dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-toast button")!.click();
    assert.equal(s.button.classList.contains("saved"), true);
    await tick();
    assert.ok(s.calls[2].message.type === "session/inline-collect" && s.calls[2].message.action === "undo");
    s.calls[2].resolve({ ok: true, inlineCollect: savedState }); await tick();
  } finally { s.cleanup(); }
});

test("pending save follows a replaced post node and settles on the current button", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick();
    const original = s.dom.window.document.querySelector("article")!;
    original.replaceWith(original.cloneNode(true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    s.calls[0].resolve({ ok: true, inlineCollect: savedState }); await tick();
    const replacement = s.dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-button")!;
    assert.notEqual(replacement, s.button);
    assert.equal(replacement.classList.contains("saved"), true);
    assert.equal(s.dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-chip")!.hidden, false);
  } finally { s.cleanup(); }
});

test("a recycled permalink cannot save the old button identity before the observer runs", async () => {
  const s = fixture();
  try {
    await tick();
    s.dom.window.document.querySelector<HTMLAnchorElement>('a[href*="/post/"]')!.href = "/@author/post/recycled";
    s.click(); await tick();
    assert.equal(s.calls.length, 0);
    assert.equal(s.dom.window.document.querySelector('[data-dlens-post-key="threads-post:recycled"]') !== null, true);
  } finally { s.cleanup(); }
});


function foreignGlobal(isSaved: boolean): ExtensionGlobalState {
  const item = createSessionItem({
    target_type: "post", page_url: "https://www.threads.com/", post_url: "https://www.threads.com/@author/post/a",
    author_hint: "author", text_snippet: "The original source text.", time_token_hint: "1h", dom_anchor: "a",
    engagement: {}, engagement_present: {}, captured_at: "2026-10-07T00:00:00.000Z", image_url: null
  });
  item.id = "foreign-item-a";
  return {
    ...createEmptyGlobalState(), lastCollectMode: "product", activeSessionId: "foreign-session",
    sessions: [{ id: "foreign-session", mode: "product", name: "外分頁產品工作區", createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:01:00.000Z", items: isSaved ? [item] : [] }]
  };
}

test("another tab save updates the button and makes the next tap remove that membership", async () => {
  const s = fixture();
  try {
    await tick();
    s.emitGlobal(foreignGlobal(true));
    assert.equal(s.button.classList.contains("saved"), true);
    assert.equal(s.chip.textContent, "✓ 外分頁產品工作區");
    s.click(); await tick();
    const message = s.calls[0].message;
    assert.ok(message.type === "session/inline-collect" && message.action === "remove");
    assert.equal(message.sessionId, "foreign-session");
    assert.equal(message.itemId, "foreign-item-a");
    s.calls[0].resolve({ ok: true, inlineCollect: { ...base, saved: [], lastMode: "product" } }); await tick();
  } finally { s.cleanup(); }
});

test("another tab removal refreshes last mode without dispatching foreign workspace navigation", async () => {
  const s = fixture();
  try {
    await tick();
    let navigationUpdates = 0;
    s.dom.window.addEventListener("dlens:optimistic-save-confirmed", () => navigationUpdates++);
    s.emitGlobal(foreignGlobal(true));
    s.emitGlobal(foreignGlobal(false));
    assert.equal(s.button.classList.contains("saved"), false);
    s.click();
    assert.equal(s.chip.textContent, "✓ 外分頁產品工作區");
    assert.equal(navigationUpdates, 0);
    await tick();
    assert.ok(s.calls[0].message.type === "session/inline-collect" && s.calls[0].message.action === "save");
    s.calls[0].resolve({ ok: true, inlineCollect: { ...base, lastMode: "product" } }); await tick();
  } finally { s.cleanup(); }
});

test("an older initial snapshot cannot overwrite a cross-tab storage change", async () => {
  const s = fixture({ deferSnapshot: true });
  try {
    s.emitGlobal(foreignGlobal(true));
    s.releaseSnapshot(); await tick();
    assert.equal(s.button.classList.contains("saved"), true);
    assert.equal(s.chip.textContent, "✓ 外分頁產品工作區");
    assert.equal(s.storageListenerCount(), 1);
    s.runtime.destroy();
    assert.equal(s.storageListenerCount(), 0);
  } finally { s.cleanup(); }
});

test("real save, remove and undo events share the requestId sent to the background", async (t) => {
  t.mock.method(console, "debug", () => {});
  const s = fixture();
  try {
    await tick();
    s.dom.window.history.replaceState(null, "", "/?dlensQaTrace=1");
    s.click(); await tick();
    s.calls[0].resolve({ ok: true, inlineCollect: savedState }); await tick();
    s.click(); await tick();
    s.calls[1].resolve({ ok: true, inlineCollect: { ...base, changed: true, undoToken: "traced-undo" } }); await tick();
    s.dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-toast button")!.click(); await tick();
    s.calls[2].resolve({ ok: true, inlineCollect: savedState }); await tick();
    const requestIds = new Set<string>();
    for (const [index, action] of ["save", "remove", "undo"].entries()) {
      const requestId = s.calls[index].message.requestId;
      assert.equal(typeof requestId, "string");
      assert.ok(requestId);
      requestIds.add(requestId);
      const events = readPipelineTrace().filter((event) => event.requestId === requestId);
      assert.deepEqual(events.map(({ step, result }) => [step, result]), [["content.inline-collect.request", "pending"], ["content.inline-collect.response", "ok"]]);
      assert.ok(events.every((event) => event.phase === "signal.saved" && (event.detail as { action: string }).action === action));
    }
    assert.equal(requestIds.size, 3);
    assert.ok(s.dom.window.document.getElementById("__dlens_qa_trace_json__"));
  } finally { s.cleanup(); }
});

test("rejected writes and transport failures emit a terminal failure with the same requestId", async (t) => {
  t.mock.method(console, "debug", () => {});
  const s = fixture();
  try {
    await tick();
    s.dom.window.history.replaceState(null, "", "/?dlensQaTrace=1");
    s.click(); await tick();
    s.calls[0].resolve({ ok: false, error: "storage write failed" }); await tick();
    s.click(); await tick();
    s.calls[1].reject(new Error("transport unavailable")); await tick();
    for (const [index, error] of ["storage write failed", "transport unavailable"].entries()) {
      const requestId = s.calls[index].message.requestId;
      assert.ok(requestId);
      const events = readPipelineTrace().filter((event) => event.requestId === requestId);
      assert.deepEqual(events.map(({ step, result }) => [step, result]), [["content.inline-collect.request", "pending"], ["content.inline-collect.failure", "error"]]);
      assert.equal((events[1].detail as { error: string }).error, error);
    }
  } finally { s.cleanup(); }
});
