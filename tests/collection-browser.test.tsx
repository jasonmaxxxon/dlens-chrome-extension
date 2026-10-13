import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { CollectionBrowser, type CollectionBrowserProps } from "../src/ui/CollectionBrowser.tsx";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { tokens } from "../src/ui/tokens.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";

async function mount(props: Partial<CollectionBrowserProps> = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const prior = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, Element: globalThis.Element };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const priorAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const selected: Array<string | null> = [];
  const queries: string[] = [];
  const opened: string[] = [];
  let collected = 0;
  function Harness() {
    const [query, setQuery] = useState(props.query ?? "");
    const [sort, setSort] = useState(props.sort ?? "saved");
    const [selectedKey, setSelectedKey] = useState<string | null>(props.selectedKey ?? null);
    return <CollectionBrowser topics={props.topics} signals={props.signals} readings={props.readings} onAssignTopic={props.onAssignTopic} sessions={props.sessions ?? [session("one", [item("one")])]} isLoading={props.isLoading}
      sort={sort} onSortChange={setSort} nowMs={props.nowMs ?? 0} query={query} onQueryChange={(value) => { queries.push(value); setQuery(value); }}
      selectedKey={selectedKey} onSelect={(value) => { selected.push(value); setSelectedKey(value); }}
      onCollect={() => { collected++; }} onOpenWorkspace={(id) => opened.push(id)} />;
  }
  await act(async () => root.render(<Harness />));
  return {
    dom, container, selected, queries, opened, get collected() { return collected; },
    async click(selector: string) {
      const element = container.querySelector<HTMLElement>(selector);
      assert.ok(element, `expected ${selector}`);
      await act(async () => element.click());
    },
    async type(value: string) {
      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      assert.ok(input);
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    },
    async close() {
      await act(async () => root.unmount());
      Object.assign(globalThis, prior);
      actGlobal.IS_REACT_ACT_ENVIRONMENT = priorAct;
      dom.window.close();
    }
  };
}

test("collection shows one source-first row per post and controlled search remains after reading", async () => {
  const original = item("one", { latestCapture: capture({ text: "原始內容包含關鍵字 apple。\n下一段仍然是完整的原帖。" }) });
  const sessions = [session("one", [original]), session("two", [item("duplicate"), item("other", { descriptor: descriptor({ post_url: "https://threads.net/@pear/post/XYZ", text_snippet: "梨子" }) })])];
  const view = await mount({ sessions });
  try {
    assert.equal(view.container.querySelectorAll("h2").length, 0);
    assert.equal(view.container.querySelectorAll("[data-collection-sort]").length, 3);
    assert.equal(view.container.querySelectorAll("[data-collection-post]").length, 2);
    assert.equal(view.container.querySelectorAll('[data-collection-action="collect"]').length, 1);
    assert.equal(view.container.querySelector("[data-saved-signal-metric]"), null);
    assert.equal(view.container.querySelector("details"), null);
    await view.type("apple");
    assert.deepEqual(view.queries, ["apple"]);
    assert.equal(view.container.querySelectorAll("[data-collection-post]").length, 1);
    await view.click("[data-collection-post]");
    assert.equal(view.container.querySelectorAll("[data-collection-post]").length, 0);
    assert.equal(view.container.querySelector('[role="dialog"]'), null, "reader replaces the list in the panel");
    assert.equal(view.container.querySelector("[data-collection-reader-body]")?.textContent, "原始內容包含關鍵字 apple。\n下一段仍然是完整的原帖。");
    const details = view.container.querySelector("details");
    assert.ok(details);
    assert.equal(details.open, false);
    await view.click("summary");
    assert.equal(details.open, true);
    await view.click('[data-collection-workspace="two"]');
    assert.deepEqual(view.opened, ["two"]);
    await view.click('[data-collection-action="back"]');
    assert.equal(view.container.querySelector<HTMLInputElement>("input")?.value, "apple");
    assert.equal(view.container.querySelectorAll("[data-collection-post]").length, 1);
    assert.equal(view.selected.at(-1), null);
    await view.click('[data-collection-action="collect"]');
    assert.equal(view.collected, 1);
  } finally { await view.close(); }
});

test("collection empty, loading and no-results states keep search and one collect action", async () => {
  for (const props of [{ sessions: [] }, { sessions: [], isLoading: true }, { query: "不存在" }]) {
    const view = await mount(props);
    try {
      assert.ok(view.container.querySelector('input[type="search"]'));
      assert.equal(view.container.querySelectorAll('[data-collection-action="collect"]').length, 1);
      assert.equal(view.container.querySelectorAll("[data-collection-post]").length, 0);
      assert.match(view.container.textContent ?? "", props.isLoading ? /載入/ : props.query ? /找不到/ : /尚未收藏/);
    } finally { await view.close(); }
  }
});

test("collection uses the compact square thumbnail and replaces expired media with a type tile", async () => {
  const view = await mount();
  try {
    const image = view.container.querySelector<HTMLImageElement>("[data-collection-thumbnail] img");
    assert.ok(image);
    assert.equal(image.style.width, `${tokens.layout.collectionThumbnailSize}px`);
    assert.equal(image.style.height, `${tokens.layout.collectionThumbnailSize}px`);
    await act(async () => image.dispatchEvent(new view.dom.window.Event("error")));
    assert.equal(view.container.querySelector("[data-collection-thumbnail] img"), null);
    const placeholder = view.container.querySelector<HTMLElement>("[data-collection-thumbnail]");
    assert.equal(placeholder?.style.width, `${tokens.layout.collectionThumbnailSize}px`);
    assert.equal(placeholder?.querySelector("[data-collection-type-tile]")?.textContent, "收");
    assert.doesNotMatch(view.container.textContent ?? "", /圖片.*失敗|圖片.*無法/);
    await view.click("[data-collection-post]");
    assert.ok(view.container.querySelector("[data-collection-reader-body]"));
  } finally { await view.close(); }
});

test("reader keeps images large, falls back after expiry and never turns unsafe URLs into links", async () => {
  const sessions = [session("one", [item("one", { descriptor: descriptor({ post_url: "javascript:alert(1)" }), latestCapture: capture({ images: ["https://images.example.com/full.jpg"] }, { source_post_url: "", canonical_target_url: "" }) })])];
  sessions[0].items[0].latestCapture!.result!.canonical_target_url = "";
  const view = await mount({ sessions, selectedKey: buildCollectionPosts(sessions)[0].key });
  try {
    const image = view.container.querySelector<HTMLImageElement>("[data-collection-reader-image] img");
    assert.ok(image);
    assert.equal(image.style.width, "100%");
    assert.equal(view.container.querySelector("a"), null);
    await act(async () => image.dispatchEvent(new view.dom.window.Event("error")));
    assert.equal(view.container.querySelector("[data-collection-reader-image] img"), null);
    assert.match(view.container.textContent ?? "", /圖片暫時無法載入/);
    assert.ok(view.container.querySelector("[data-collection-reader-body]"));
  } finally { await view.close(); }
});

test("reader with text-only source omits empty image frames and AI surfaces", async () => {
  const sessions = [session("one", [item("one", { descriptor: descriptor({ image_url: null }) })])];
  const view = await mount({ sessions, selectedKey: buildCollectionPosts(sessions)[0].key });
  try {
    assert.equal(view.container.querySelector("[data-collection-reader-image]"), null);
    assert.match(view.container.textContent ?? "", /收藏時/);
    assert.doesNotMatch(view.container.textContent ?? "", /AI|刪除|摘要|分析建議/);
    const link = view.container.querySelector<HTMLAnchorElement>("a");
    assert.ok(link);
    assert.equal(link.target, "_blank");
    assert.match(link.rel, /noopener/);
  } finally { await view.close(); }
});


test("collection B sort commands slide the knob, reorder rows and persist through the reader", async () => {
  const view = await mount({ sessions: [session("one", [item("one"), item("two", { savedAt: "2026-09-19T00:00:00Z", descriptor: descriptor({ post_url: "https://threads.com/@author/post/TWO", engagement: { ...descriptor().engagement, comments: 99 } }) })])] });
  try {
    await view.click('[data-collection-sort="comments"]');
    assert.match(view.container.querySelector("[data-collection-post]")?.textContent ?? "", /留言 99/);
    assert.equal(view.container.querySelector("[data-collection-day]"), null);
    assert.equal(view.container.querySelector<HTMLElement>("[data-collection-sort-knob]")?.style.transform, "translateX(200%)");
    await view.click("[data-collection-post]");
    await view.click('[data-collection-action="back"]');
    assert.equal(view.container.querySelector('[data-collection-sort="comments"]')?.getAttribute("aria-pressed"), "true");
  } finally { await view.close(); }
});


test("collection search folds removed rows in place, survives rapid changes and settles immediately for reduced motion", async () => {
  const view = await mount({ sessions: [session("one", [
    item("a", { descriptor: descriptor({ text_snippet: "apple", post_url: "https://threads.com/@author/post/A" }) }),
    item("b", { descriptor: descriptor({ text_snippet: "banana", post_url: "https://threads.com/@author/post/B" }) })
  ])] });
  const preference = { matches: true, addEventListener: (_: string, fn: () => void) => { changed = fn; }, removeEventListener: () => {} };
  let changed = () => {};
  Object.defineProperty(view.dom.window, "matchMedia", { value: () => preference });
  try {
    await view.type("banana");
    assert.equal(view.container.querySelectorAll('[data-collection-exiting="true"]').length, 1);
    const keys = [...view.container.querySelectorAll("[data-collection-row]")].map(row => row.getAttribute("data-collection-row"));
    assert.match(keys[0]!, /post\/A/);
    assert.equal(view.container.querySelector('[data-collection-exiting="true"]')?.hasAttribute("inert"), true);
    await view.type("apple");
    assert.equal(view.container.querySelectorAll('[data-collection-exiting="true"]').length, 1);
    assert.equal(view.container.querySelectorAll("[data-collection-row]").length, 2);
    await act(async () => { preference.matches = false; changed(); });
    assert.equal(view.container.querySelectorAll("[data-collection-row]").length, 1);
    assert.equal(view.container.querySelector('[data-collection-exiting="true"]'), null);
    assert.match(view.container.querySelector("[data-collection-post]")?.textContent ?? "", /apple/);
  } finally { await view.close(); }
});

test("audience reader reuses four entries, horizontal evidence headers and topic chips", async () => {
  const comments = Array.from({ length: 12 }, (_, i) => ({ comment_id: `c${i}`, author: `fan${i}`, text: i === 3 ? "點樣用？" : `留言 ${i}`, like_count: i }));
  const saved = item("audience", { status: "succeeded", latestCapture: capture({}, {
    analysis: { status: "succeeded", clusters: [{ cluster_key: 0, size_share: 1, like_share: 1, keywords: ["Codex"] }],
      evidence: [{ cluster_key: 0, comments: comments.slice(0, 3).map(c => ({ ...c, comment_id: c.comment_id })) }] },
    result: { ...capture().result!, comments }
  }) });
  const sessions = [session("topic-workspace", [saved], "topic")];
  const assign: Array<[string, string | null]> = [];
  const reading: import("../src/compare/inline-reading-storage.ts").InlineReadingRecord = { status: "complete", itemId: saved.id, captureId: "capture-1", reading: {
    itemId: saved.id, captureId: "capture-1", promptVersion: "v2", model: "test", generatedAt: "", gist: "支持工具", find: { method: "試下", split: "未見分歧", ask: "用法" },
    clusterNames: { "0": "支持" }, noiseClusters: [], methods: [], split: { agree: "同意", sides: [] }
  } };
  const h = await mount({ sessions, selectedKey: buildCollectionPosts(sessions)[0].key,
    topics: [{ id: "t1", sessionId: sessions[0].id, name: "工具", status: "pending", tags: [], signalIds: [], pairIds: [], createdAt: "", updatedAt: "" }],
    signals: [{ id: "s1", sessionId: sessions[0].id, itemId: saved.id, source: "threads", inboxStatus: "unprocessed", capturedAt: "" }],
    readings: { [saved.id]: reading }, onAssignTopic: (id, topicId) => assign.push([id, topicId]) });
  try {
    assert.deepEqual([...h.container.querySelectorAll("[data-reader-entry]")].map(e => e.getAttribute("data-reader-entry")), ["stance", "method", "split", "ask"]);
    assert.match(h.container.querySelector("[data-reader-answer]")!.textContent!, /支持工具/);
    assert.equal(h.container.querySelector<HTMLDivElement>("[data-reader-entries]")!.style.gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
    await h.click("[data-reader-evidence-toggle]");
    const header = h.container.querySelector<HTMLDivElement>("[data-reader-evidence-header]")!;
    assert.equal(header.style.display, "grid");
    assert.equal(header.children.length, 3);
    assert.equal(header.textContent, "支持100%");
    assert.ok(h.container.querySelector("[data-reader-reply]"));
    await h.click('[data-reader-topic="t1"]');
    await h.click('[data-reader-topic=""]');
    assert.deepEqual(assign, [["s1", "t1"], ["s1", null]]);
    assert.equal(h.container.querySelector("select"), null);
    await h.click("[data-reader-evidence-toggle]");
    assert.equal(h.container.querySelector("[data-reader-evidence]"), null);
  } finally { await h.close(); }
});
