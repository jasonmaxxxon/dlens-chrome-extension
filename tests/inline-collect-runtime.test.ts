import { OPENED_READING_PREFIX } from "../src/state/opened-readings-storage";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { startInlineCollectRuntime } from "../src/content/inline-collect-runtime.ts";
import { INLINE_COLLECT_MODES, INLINE_COLLECT_MODE_NAMES, type InlineCollectState } from "../src/state/inline-collect.ts";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import { consumeWorkspaceOpen, consumeReaderOpen, requestWorkspaceOpen } from "../src/ui/inpage-helpers.tsx";
import { GLOBAL_STATE_STORAGE_KEY } from "../src/state/storage-keys.ts";
import { createEmptyGlobalState, createEmptyTabState, type ExtensionGlobalState, type SessionItem } from "../src/state/types.ts";
import { readPipelineTrace } from "../src/state/pipeline-trace.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const base: InlineCollectState = {
  lastMode: "topic", saved: [], changed: false,
  destinations: INLINE_COLLECT_MODES.map((mode) => ({ mode, sessionId: mode, sessionName: INLINE_COLLECT_MODE_NAMES[mode] }))
};
function fixture(options: { deferSnapshot?: boolean; intervals?: (() => void)[]; fetch?: typeof fetch } = {}) {
  const dom = new JSDOM(`<article><a href="/@author">author</a><a href="/@author/post/a">1h</a><p>The original source text.</p><div>${["Like", "Reply", "Repost", "Share"].map((title) => `<div role="button"><svg><title>${title}</title></svg></div>`).join("")}</div></article><div id="overlay"></div>`, { url: "https://www.threads.com/", pretendToBeVisual: true });
  const calls: { message: ExtensionMessage; resolve: (response: ExtensionResponse) => void; reject: (error: Error) => void }[] = [];
  const keys = ["window", "document", "Element", "HTMLElement", "Node", "MutationObserver", "CustomEvent", "IntersectionObserver", "chrome", "fetch"] as const;
  const fetchStub = options.fetch ?? (() => Promise.reject(new Error("offline in tests")));
  const saved = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const storageListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  let releaseSnapshot: ((response: ExtensionResponse) => void) | null = null;
  const stored: Record<string, unknown> = {};
  let observer: IntersectionObserverCallback;
  class Observer {
    constructor(callback: IntersectionObserverCallback) { observer = callback; }
    observe() {} unobserve() {} disconnect() {}
  }
  const chrome = { storage: { local: { get: async () => ({ ...stored }), set: async (values: Record<string, unknown>) => { Object.assign(stored, values); } }, onChanged: {
    addListener(listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) { storageListeners.add(listener); },
    removeListener(listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) { storageListeners.delete(listener); }
  } }, runtime: { id: "test-extension", sendMessage(message: ExtensionMessage) {
    if (message.type === "session/inline-collect" && message.action === "snapshot") return options.deferSnapshot
      ? new Promise<ExtensionResponse>(resolve => { releaseSnapshot = resolve; }) : Promise.resolve({ ok: true, inlineCollect: base });
    return new Promise<ExtensionResponse>((resolve, reject) => calls.push({ message, resolve, reject }));
  }, onMessage: { addListener() {}, removeListener() {} } } };
  keys.forEach((key) => Object.defineProperty(globalThis, key, { configurable: true, value: key === "IntersectionObserver" ? Observer : key === "chrome" ? chrome : key === "fetch" ? fetchStub : dom.window[key] }));
  if (options.intervals) dom.window.setInterval = ((callback: () => void) => options.intervals!.push(callback)) as unknown as typeof dom.window.setInterval;
  const runtime = startInlineCollectRuntime(dom.window.document.getElementById("overlay")!);
  const button = dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-button")!;
  const chip = dom.window.document.querySelector<HTMLButtonElement>(".dlens-collect-chip")!;
  const click = () => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 0 }));
  return { dom, runtime, calls, button, chip, click, stored,
    intersect(element: Element) { observer([{ target: element, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); },
    emitGlobal(global: ExtensionGlobalState) { storageListeners.forEach(listener => listener({ [GLOBAL_STATE_STORAGE_KEY]: { newValue: global } }, "local")); },
    emitKey(key: string, value: unknown) { storageListeners.forEach(listener => listener({ [key]: { newValue: value } }, "local")); },
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

function readingGlobal(mode: "topic" | "archive", status: SessionItem["status"]): ExtensionGlobalState {
  const item = createSessionItem({
    target_type: "post", page_url: "https://www.threads.com/", post_url: "https://www.threads.com/@author/post/a",
    author_hint: "author", text_snippet: "The original source text.", time_token_hint: "1h", dom_anchor: "a",
    engagement: {}, engagement_present: {}, captured_at: "2026-10-07T00:00:00.000Z", image_url: null
  });
  item.id = "item-a"; item.status = status;
  return { ...createEmptyGlobalState(), sessions: [{ id: mode, mode, name: INLINE_COLLECT_MODE_NAMES[mode], createdAt: "2026-10-07T00:00:00.000Z", updatedAt: "2026-10-07T00:00:00.000Z", items: [item] }] };
}

test("saving into 觀眾反應 starts the reply crawl and the card polls it while it runs", async () => {
  const intervals: (() => void)[] = [];
  const s = fixture({ intervals });
  try {
    await tick(); s.click(); await tick();
    s.calls[0].resolve({ ok: true, inlineCollect: savedState, snapshot: { global: readingGlobal("topic", "saved"), tab: createEmptyTabState() } }); await tick();
    const queued = s.calls[1].message;
    assert.ok(queued.type === "session/queue-items-and-start-processing");
    assert.equal(queued.sessionId, "topic");
    assert.deepEqual(queued.itemIds, ["item-a"]);
    s.calls[1].resolve({ ok: true, processingStatus: "started", queuedItemIds: ["item-a"], failedItemIds: [] } as ExtensionResponse); await tick();
    s.emitGlobal(readingGlobal("topic", "running"));
    assert.ok(s.dom.window.document.querySelector(".dlens-save-line"));
    assert.equal(s.dom.window.document.querySelector(".dlens-card"), null, "save-time reading stays compact");
    intervals.forEach((poll) => poll()); await tick();
    const refresh = s.calls[2].message;
    assert.ok(refresh.type === "session/refresh-item" && refresh.itemId === "item-a");
    intervals.forEach((poll) => poll()); await tick();
    assert.equal(s.calls.length, 3, "one refresh in flight per item");
    s.calls[2].resolve({ ok: true }); await tick();
    const crawled = readingGlobal("topic", "succeeded");
    crawled.sessions[0].items[0].lastStatusAt = new Date().toISOString();
    s.emitGlobal(crawled);
    intervals.forEach((poll) => poll()); await tick();
    assert.ok(s.calls[3].message.type === "session/refresh-item", "the quant clusters land after the crawl, so polling continues");
    s.calls[3].resolve({ ok: true }); await tick();
    const analysed = readingGlobal("topic", "succeeded");
    analysed.sessions[0].items[0].latestCapture = { id: "cap-a", result: { comments: [] }, analysis: { status: "succeeded", clusters: [], evidence: [] } } as unknown as SessionItem["latestCapture"];
    s.emitGlobal(analysed);
    intervals.forEach((poll) => poll()); await tick();
    assert.equal(s.calls.length, 4, "a crawl with its analysis settled is not polled");
  } finally { s.cleanup(); }
});

test("a queued job whose worker start failed is a wait, not a failed crawl", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick();
    const archived: InlineCollectState = { ...base, changed: true, lastMode: "archive", saved: [{ ...savedState.saved[0], mode: "archive", sessionId: "archive", sessionName: "收藏整理" }] };
    s.calls[0].resolve({ ok: true, inlineCollect: archived, snapshot: { global: readingGlobal("archive", "saved"), tab: createEmptyTabState() } }); await tick();
    s.emitGlobal(readingGlobal("topic", "saved"));
    s.dom.window.document.querySelector<HTMLButtonElement>('.dlens-save-line [data-dlens-act="crawl"]')!.click(); await tick();
    s.calls[1].resolve({ ok: true, queuedItemIds: ["item-a"], failedItemIds: [], processingError: "drain down" }); await tick();
    const toast = s.dom.window.document.querySelector(".dlens-collect-toast")!.textContent!;
    assert.doesNotMatch(toast, /未能開始抓取/);
    assert.match(toast, /已排隊/);
  } finally { s.cleanup(); }
});

test("saving into 收藏整理 does not crawl, and a failed crawl start says so", async () => {
  const s = fixture();
  try {
    await tick(); s.click(); await tick();
    const archived: InlineCollectState = { ...base, changed: true, lastMode: "archive", saved: [{ ...savedState.saved[0], mode: "archive", sessionId: "archive", sessionName: "收藏整理" }] };
    s.calls[0].resolve({ ok: true, inlineCollect: archived, snapshot: { global: readingGlobal("archive", "saved"), tab: createEmptyTabState() } }); await tick();
    assert.equal(s.calls.length, 1);
    s.emitGlobal(readingGlobal("topic", "saved"));
    s.dom.window.document.querySelector<HTMLButtonElement>('.dlens-save-line [data-dlens-act="crawl"]')!.click(); await tick();
    s.calls[1].resolve({ ok: true, queuedItemIds: [], failedItemIds: ["item-a"] }); await tick();
    assert.match(s.dom.window.document.querySelector(".dlens-collect-toast")!.textContent!, /未能開始抓取/);
    const head = s.dom.window.document.querySelector(".dlens-save-line")!.textContent!;
    assert.match(head, /抓取失敗/, "a crawl that never became a job must not look untouched");
    assert.match(s.dom.window.document.querySelector(".dlens-save-line .save-text")!.textContent!, /資料庫/);
  } finally { s.cleanup(); }
});

test("the card shows the post page's top first reply while the crawl is pending", async () => {
  let release: (response: Response) => void = () => {};
  const html = `<script type="application/json">${JSON.stringify({ data: { thread_items: [
    { post: { code: "a", user: { username: "author" }, caption: { text: "root" }, like_count: 9, text_post_app_info: { is_reply: false } } },
    { post: { code: "r1", user: { username: "fan" }, caption: { text: "第一則" }, like_count: 3, text_post_app_info: { is_reply: true } } },
    { post: { code: "r2", user: { username: "critic" }, caption: { text: "最多讚" }, like_count: 40, text_post_app_info: { is_reply: true } } }
  ] } })}</script>`;
  const s = fixture({ fetch: (() => new Promise<Response>((resolve) => { release = resolve; })) as typeof fetch });
  try {
    await tick();
    s.click(); await tick();
    s.calls[0].resolve({ ok: true, inlineCollect: savedState, snapshot: { global: readingGlobal("topic", "running"), tab: createEmptyTabState() } }); await tick();
    assert.match(s.dom.window.document.querySelector(".dlens-save-line .save-text")!.textContent!, /睇緊第一批留言/);
    release(new Response(html)); await tick(); await tick(); await tick();
    const quote = s.dom.window.document.querySelector(".dlens-save-line .save-text")!.textContent!;
    assert.match(quote, /最多讚/);
    assert.match(quote, /♡ 40/);
  } finally { s.cleanup(); }
});

test("a read 觀眾反應 card asks once and hands the current lens to its side panel reader", async () => {
  const s = fixture();
  try {
    await tick();
    const global = readingGlobal("topic", "succeeded");
    const item = global.sessions[0].items[0];
    item.descriptor = { ...item.descriptor, engagement: { comments: 11 } } as typeof item.descriptor;
    item.latestCapture = {
      id: "cap-a",
      result: { canonical_post: { author: "author" }, comments: Array.from({ length: 11 }, (_, i) => ({ comment_id: `c${i}`, author: `fan${i}`, text: `留言 ${i}`, like_count: i })) },
      analysis: { status: "succeeded", clusters: [], evidence: [] }
    } as unknown as typeof item.latestCapture;
    const ensures = () => s.calls.filter(({ message }) => message.type === "inline-reading/ensure");
    const doc = s.dom.window.document;
    s.emitGlobal(global);
    await tick();
    assert.equal(ensures().length, 0, "without a key nothing is sent");
    assert.equal(doc.querySelector(".dlens-card"), null);
    doc.querySelector<HTMLButtonElement>('[data-dlens-act="toggle-card"]')!.click();
    await tick();
    assert.ok(s.stored[OPENED_READING_PREFIX + "item-a"], "opening the full card persists opened-at");
    assert.match(doc.querySelector(".dlens-card .head")!.textContent!, /未接 AI/);
    doc.querySelector<HTMLButtonElement>('.dlens-card [data-dlens-act="ai-key"]')!.click();
    assert.match(doc.querySelector(".dlens-collect-toast")!.textContent!, /設定未填 Google API key/);
    const keyed = { ...global, settings: { ...global.settings, oneLinerProvider: "google" as const, googleApiKey: "test-key" } };
    s.emitGlobal(keyed); await tick();
    assert.equal(ensures().length, 1, "saving a key starts the reading without a reload");
    ensures()[0].resolve({ ok: true, inlineReadingStatus: "started" }); await tick();
    assert.doesNotMatch(doc.querySelector(".dlens-card .head")!.textContent!, /未接 AI/);
    s.emitGlobal(keyed); await tick();
    assert.equal(ensures().length, 1, "not asked again on repaint");
    doc.querySelector<HTMLButtonElement>('[data-dlens-lens="ask"]')!.click();
    const foot=doc.querySelector<HTMLButtonElement>('[data-dlens-act="reader"]')!;
    assert.equal(foot.textContent,'側欄睇全部 →');foot.click();await tick();
    const open=s.calls.find(c=>c.message.type==='sidepanel/open')!.message;
    assert.deepEqual(open,{type:'sidepanel/open',sessionId:'topic',itemId:'item-a',lens:'ask'});
    assert.equal(doc.querySelector('.dlens-xp-window'),null);assert.equal(doc.querySelector('.dlens-card-slot .xp'),null);
    assert.equal(doc.querySelector('[data-dlens-act="evidence"]'),null);
  } finally { s.cleanup(); }
});

test("the button carries the crawl state and a dot for a result that arrived while the card was closed", async () => {
  const s = fixture();
  try {
    await tick();
    const doc = s.dom.window.document;
    s.emitGlobal(readingGlobal("topic", "queued"));
    assert.ok(s.button.classList.contains("busy") && s.button.classList.contains("queued"));
    assert.ok(doc.querySelector(".dlens-save-line"), "the compact line appears on save");
    s.emitGlobal(readingGlobal("topic", "running"));
    assert.ok(s.button.classList.contains("busy") && !s.button.classList.contains("queued"));
    assert.equal(doc.querySelector(".dlens-card"), null, "waiting never mounts the full card");
    s.chip.click();
    assert.equal(doc.querySelector(".dlens-card"), null);
    const done = readingGlobal("topic", "succeeded");
    done.sessions[0].items[0].latestCapture = { id: "cap-a", result: { comments: [] }, analysis: { status: "succeeded", clusters: [], evidence: [] } } as unknown as SessionItem["latestCapture"];
    s.emitGlobal(done);
    assert.ok(s.button.classList.contains("ready") && !s.button.classList.contains("busy"));
    s.chip.click();
    assert.ok(!s.button.classList.contains("ready"), "opening the card clears the unseen dot");
  } finally { s.cleanup(); }
});

test("a script cut off by an extension reload removes its controls and asks for a page refresh", async () => {
  const intervals: (() => void)[] = [];
  const s = fixture({ intervals });
  try {
    await tick();
    assert.ok(s.dom.window.document.querySelector(".dlens-collect-button"));
    (globalThis as unknown as { chrome: { runtime: { id?: string } } }).chrome.runtime.id = undefined;
    intervals.forEach((poll) => poll());
    assert.equal(s.dom.window.document.querySelector(".dlens-collect-button"), null, "the old build's button is gone");
    assert.match(s.dom.window.document.querySelector(".dlens-collect-toast.on")!.textContent!, /重新整理此頁/);
  } finally { s.cleanup(); }
});

test("a 觀眾反應 card sorts its post into a 話題 by hand and names where a sorted post sits", async () => {
  const s = fixture();
  try {
    await tick();
    const doc = s.dom.window.document;
    const global = readingGlobal("topic", "succeeded");
    global.sessions[0].items[0].latestCapture = { id: "cap-a", result: { comments: [{ text: "一則留言" }] }, analysis: { status: "succeeded", clusters: [], evidence: [] } } as unknown as SessionItem["latestCapture"];
    s.emitGlobal(global);
    const topic = (id: string, name: string, updatedAt: string) => ({ id, sessionId: "topic", name, status: "pending", tags: [], signalIds: [], pairIds: [], createdAt: updatedAt, updatedAt });
    s.emitKey("dlens:v1:topics", [topic("t-old", "香港拍拖", "2026-10-01T00:00:00Z"), topic("t-new", "AI 工具額度", "2026-10-07T00:00:00Z")]);
    s.emitKey("dlens:v1:signals", [{ id: "sig-a", sessionId: "topic", itemId: "item-a", source: "threads", inboxStatus: "unprocessed", capturedAt: "" }]);
    doc.querySelector<HTMLButtonElement>('[data-dlens-act="toggle-card"]')!.click();
    const picks = [...doc.querySelectorAll<HTMLButtonElement>('.dlens-card [data-dlens-act="topic-pick"]')];
    assert.deepEqual(picks.map((b) => b.textContent), ["AI 工具額度", "香港拍拖"], "most recently used 話題 first");
    picks[0].click(); await tick();
    const assign = s.calls.find(({ message }) => message.type === "signal/triage")!.message;
    assert.deepEqual(assign, { type: "signal/triage", signalId: "sig-a", action: { kind: "assign", topicId: "t-new" } });

    doc.querySelector<HTMLButtonElement>('.dlens-card [data-dlens-act="topic-new"]')!.click();
    const input = doc.querySelector<HTMLInputElement>(".dlens-card [data-dlens-topic-name]")!;
    assert.ok(input);
    input.value = "畢業生搵工";
    input.dispatchEvent(new s.dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await tick();
    const created = s.calls.filter(({ message }) => message.type === "signal/triage").at(-1)!.message;
    assert.deepEqual(created, { type: "signal/triage", signalId: "sig-a", action: { kind: "create-topic", name: "畢業生搵工" } });

    s.emitKey("dlens:v1:signals", [{ id: "sig-a", sessionId: "topic", itemId: "item-a", source: "threads", inboxStatus: "assigned", topicId: "t-new", capturedAt: "" }]);
    const line = doc.querySelector(".dlens-card .tl")!.textContent!;
    assert.match(line, /〈AI 工具額度〉內 1 篇/);
    doc.querySelector<HTMLButtonElement>('.dlens-card [data-dlens-act="topic-side"]')!.click(); await tick();
    const sent = s.calls.map(({ message }) => message.type);
    assert.ok(sent.includes("inline/in-view") && sent.includes("sidepanel/open"));
    const open=s.calls.find(c=>c.message.type==='sidepanel/open')!.message;
    assert.ok(open.type==='sidepanel/open');assert.equal(open.itemId,'item-a');
  } finally { s.cleanup(); }
});


test("a compact reading completed off-screen glows once on return and disclosure folds", async () => {
  const s = fixture();
  try {
    await tick();
    s.emitGlobal(readingGlobal("topic", "running"));
    const doc = s.dom.window.document;
    const slot = doc.querySelector<HTMLElement>(".dlens-card-slot")!;
    let visible = false;
    const rect = () => ({ top: visible ? 100 : -300, bottom: visible ? 150 : -200, right: 500 } as DOMRect);
    slot.getBoundingClientRect = rect;
    doc.querySelector<HTMLElement>("article")!.getBoundingClientRect = rect;
    const done = readingGlobal("topic", "succeeded");
    done.sessions[0].items[0].latestCapture = { id: "cap-a", result: { comments: [{ text: "完成留言" }] }, analysis: { status: "succeeded", clusters: [], evidence: [] } } as unknown as SessionItem["latestCapture"];
    s.emitGlobal(done);
    assert.equal(slot.classList.contains("return-glow"), false);
    visible = true; s.intersect(slot);
    assert.equal(slot.classList.contains("return-glow"), true);
    slot.classList.remove("return-glow");
    visible = false; s.emitGlobal(done); visible = true; s.intersect(slot);
    assert.equal(slot.classList.contains("return-glow"), false, "returning twice never replays it");
    doc.querySelector<HTMLButtonElement>('[data-dlens-act="toggle-card"]')!.click(); await tick();
    assert.ok(doc.querySelector(".dlens-card"));
    assert.ok(s.stored[OPENED_READING_PREFIX + "item-a"]);
    doc.querySelector<HTMLButtonElement>('[data-dlens-act="toggle-card"]')!.click();
    assert.equal(doc.querySelector(".dlens-card"), null);
    assert.ok(doc.querySelector(".dlens-save-line"));
  } finally { s.cleanup(); }
});

test("unfinished saved posts keep polling after Threads removes their card DOM", async () => {
  const intervals: (() => void)[] = [];
  const s = fixture({ intervals });
  try {
    await tick();
    s.emitGlobal(readingGlobal("topic", "running"));
    s.dom.window.document.querySelector("article")!.remove();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(s.dom.window.document.querySelector(".dlens-card-slot"), null);
    intervals.forEach(callback => callback()); await tick();
    assert.ok(s.calls.some(c => c.message.type === "session/refresh-item" && c.message.itemId === "item-a"));
    const done = readingGlobal("topic", "succeeded");
    done.settings = { ...done.settings, oneLinerProvider: "google", googleApiKey: "test-key" };
    done.sessions[0].items[0].latestCapture = {
      id: "cap-a", result: { comments: Array.from({ length: 10 }, (_, i) => ({ comment_id: `c${i}`, text: `留言 ${i}` })) },
      analysis: { status: "succeeded", clusters: [], evidence: [] }
    } as unknown as SessionItem["latestCapture"];
    s.emitGlobal(done); await tick();
    assert.equal(s.calls.filter(c => c.message.type === "inline-reading/ensure").length, 1, "the AI reading starts even without a feed card");
  } finally { s.cleanup(); }
});

function ringTopics(n = 7) {
  return Array.from({ length: n }, (_, i) => ({ id: `ring-${i}`, sessionId: "topic", name: `話題${i}`, status: "pending", tags: [], signalIds: [], pairIds: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: `2026-10-${String(13 - i).padStart(2, "0")}T00:00:00Z` }));
}
function ringPointer(s: ReturnType<typeof fixture>, type: string, x: number, y: number, target: EventTarget = s.dom.window) {
  const e = new s.dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, "pointerId", { value: 1 }); target.dispatchEvent(e);
}
async function releaseRing(s: ReturnType<typeof fixture>, more: boolean) {
  ringPointer(s, "pointerdown", 400, 400, s.button);
  ringPointer(s, "pointermove", 400, 240);
  const angle = (more ? -18 : -162) * Math.PI / 180;
  ringPointer(s, "pointermove", 400 + 160 * Math.cos(angle), 400 + 160 * Math.sin(angle));
  ringPointer(s, "pointerup", 400 + 160 * Math.cos(angle), 400 + 160 * Math.sin(angle));
  await tick();
}
test("ring save precedes exactly one triage assign when signal arrives later", async () => {
  const s = fixture();
  try {
    await tick(); s.emitKey("dlens:v1:topics", ringTopics());
    await releaseRing(s, false);
    assert.equal(s.calls[0].message.type, "session/inline-collect");
    assert.equal(s.calls.some(c => c.message.type === "signal/triage"), false);
    s.calls[0].resolve({ ok: true, inlineCollect: savedState, snapshot: { global: readingGlobal("topic", "running"), tab: createEmptyTabState() } });
    await tick();
    const sig = [{ id: "sig-a", sessionId: "topic", itemId: "item-a", source: "threads", inboxStatus: "unprocessed", capturedAt: "" }];
    s.emitKey("dlens:v1:signals", sig); await tick();
    const assignments = s.calls.filter(c => c.message.type === "signal/triage");
    assert.deepEqual(assignments[0]?.message, { type: "signal/triage", signalId: "sig-a", action: { kind: "assign", topicId: "ring-0" } });
    s.emitKey("dlens:v1:signals", sig); await tick();
    assert.equal(s.calls.filter(c => c.message.type === "signal/triage").length, 1);
    assignments[0].resolve({ ok: true }); await tick();
  } finally { s.cleanup(); }
});
for (const later of [false, true]) test(`other topics picker ${later ? "closes on later" : "assigns chip"}`, async () => {
  const s = fixture();
  try {
    await tick(); s.emitKey("dlens:v1:topics", ringTopics());
    await releaseRing(s, true);
    s.calls[0].resolve({ ok: true, inlineCollect: savedState, snapshot: { global: readingGlobal("topic", "running"), tab: createEmptyTabState() } }); await tick();
    s.emitKey("dlens:v1:signals", [{ id: "sig-a", sessionId: "topic", itemId: "item-a", source: "threads", inboxStatus: "unprocessed", capturedAt: "" }]);
    const doc = s.dom.window.document;
    const chips = [...doc.querySelectorAll<HTMLButtonElement>('.line-pick [data-dlens-act="topic-pick"]')];
    assert.equal(chips.length, 7);
    assert.deepEqual(chips.map(c => c.textContent), ringTopics().map(t => t.name));
    assert.equal(doc.querySelectorAll('.dlens-card [data-dlens-act="topic-pick"]').length, 0);
    if (later) doc.querySelector<HTMLButtonElement>('[data-dlens-act="topic-later"]')!.click();
    else chips[6].click();
    await tick();
    assert.equal(doc.querySelector(".line-pick"), null);
    const assign = s.calls.find(c => c.message.type === "signal/triage");
    if (later) assert.equal(assign, undefined);
    else { assert.deepEqual(assign?.message, { type: "signal/triage", signalId: "sig-a", action: { kind: "assign", topicId: "ring-6" } }); assign!.resolve({ ok: true }); await tick(); }
  } finally { s.cleanup(); }
});

for (const failure of ["save", "workspace"] as const) test(`topic ring avoids assignment on ${failure} failure`, async () => {
  const s = fixture();
  try {
    await tick(); s.emitKey("dlens:v1:topics", [...ringTopics(), { ...ringTopics(1)[0], id: "foreign", sessionId: "other", name: "錯誤工作區", updatedAt: "2026-12-01T00:00:00Z" }]);
    await releaseRing(s, false);
    assert.doesNotMatch(s.dom.window.document.querySelector(".topic-arc")!.textContent!, /錯誤工作區/);
    s.calls[0].resolve(failure === "save" ? { ok: false, error: "write failed" } : { ok: true, inlineCollect: { ...savedState, saved: [{ ...savedState.saved[0], sessionId: "other" }] } });
    await tick();
    s.emitKey("dlens:v1:signals", [{ id: "sig-a", sessionId: "other", itemId: "item-a", source: "threads", inboxStatus: "unprocessed", capturedAt: "" }]); await tick();
    assert.equal(s.calls.some(c => c.message.type === "signal/triage"), false);
  } finally { s.cleanup(); }
});

test('reader live and fresh-load requests stay pending until item hydration',()=>{
 const dom=new JSDOM('<div/>');const win=dom.window as unknown as Window;
 try {
  let event:any=null;win.addEventListener('dlens:open-workspace',e=>event=(e as CustomEvent).detail);
  requestWorkspaceOpen('product-session',win,{itemId:'p1',lens:'try'});
  assert.deepEqual(event,{sessionId:'product-session',itemId:'p1',lens:'try'});
  assert.equal(consumeReaderOpen([],win),null);assert.equal(consumeWorkspaceOpen(['product-session'],win),null);
  assert.deepEqual(consumeReaderOpen(['p1'],win),event);assert.equal(consumeReaderOpen(['p1'],win),null);
 }finally{dom.window.close();}
});
test('product content card is one line and opens its post, without an expansion',async()=>{
 const s=fixture();try{await tick();const global=readingGlobal('product','succeeded');global.sessions[0].items[0].completedAt='2026-10-13T00:00:00Z';global.sessions[0].items[0].latestCapture={id:'p-cap',result:{comments:[{text:'留言'}]}} as any;s.emitGlobal(global);await tick();
 const doc=s.dom.window.document;assert.match(doc.querySelector('.dlens-save-line')!.textContent!.replace(/\s+/g,' '),/已存入 個人應用.*讀完 · 1 則留言/);assert.equal(doc.querySelector('.dlens-card'),null);assert.equal(doc.querySelector('[data-dlens-act="toggle-card"]'),null);
 doc.querySelector<HTMLButtonElement>('[data-dlens-act="reader"]')!.click();await tick();const msg=s.calls.find(c=>c.message.type==='sidepanel/open')!.message;assert.ok(msg.type==='sidepanel/open');assert.equal(msg.itemId,'item-a');
 }finally{s.cleanup();}
});

test('product one-line verdict follows analysis storage updates and failure keeps retry',async()=>{
 const {PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY}=await import('../src/compare/product-signal-storage.ts');const {SIGNALS_STORAGE_KEY}=await import('../src/state/topic-storage.ts');
 const s=fixture();try{await tick();const global=readingGlobal('product','succeeded');global.sessions[0].items[0].latestCapture={id:'p-cap',result:{comments:[]}} as any;s.emitGlobal(global);
 s.emitKey(SIGNALS_STORAGE_KEY,[{id:'s1',sessionId:'product',itemId:'item-a',source:'threads',inboxStatus:'unprocessed',capturedAt:'2026-10-13T00:00:00Z'}]);
 s.emitKey(PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,{s1:{signalId:'s1',signalType:'learning',signalSubtype:'tool',contentType:'content',contentSummary:'summary',relevance:3,relevantTo:[],whyRelevant:'why',verdict:'try',reason:'reason',evidenceRefs:[],productContextHash:'hash',promptVersion:'v20',analyzedAt:'2026-10-13T00:00:00Z',status:'complete'}});await tick();
 assert.match(s.dom.window.document.querySelector('.dlens-save-line')!.textContent!,/讀完 · 值得試/);assert.equal(s.dom.window.document.querySelector('.dlens-card'),null);
 global.sessions[0].items[0].status='failed';global.sessions[0].items[0].lastError='backend';s.emitGlobal(global);await tick();
 assert.match(s.dom.window.document.querySelector('.dlens-save-line')!.textContent!,/抓取失敗.*backend/);assert.ok(s.dom.window.document.querySelector('.dlens-save-line [data-dlens-act="crawl"]'));
 }finally{s.cleanup();}
});
