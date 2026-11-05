import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { CollectionBrowser, type CollectionBrowserProps } from "../src/ui/CollectionBrowser.tsx";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { tokens } from "../src/ui/tokens.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";
import { buildInlineReadingInput, inlineReadingInputHash, INLINE_READING_PROMPT_VERSION } from "../src/compare/inline-reading.ts";
import { COMMENT_ELIGIBILITY_VERSION } from "../src/compare/comment-eligibility.ts";

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
  function Harness() {
    const [query, setQuery] = useState(props.query ?? "");
    const [sort, setSort] = useState(props.sort ?? "saved");
    const [selectedKey, setSelectedKey] = useState<string | null>(props.selectedKey ?? null);
    return <CollectionBrowser readerBackLabel={props.readerBackLabel} onReaderBack={props.onReaderBack} settings={props.settings} productAnalyses={props.productAnalyses} productSignals={props.productSignals} productHasContext={props.productHasContext} requestedLens={props.requestedLens} topics={props.topics} signals={props.signals} readings={props.readings} onAssignTopic={props.onAssignTopic} onRecrawl={props.onRecrawl} openedError={props.openedError} sessions={props.sessions ?? [session("one", [item("one")])]} isLoading={props.isLoading}
      sort={sort} onSortChange={setSort} nowMs={props.nowMs ?? 0} query={query} onQueryChange={(value) => { queries.push(value); setQuery(value); }}
      selectedKey={selectedKey} onSelect={(value) => { selected.push(value); setSelectedKey(value); }}
      onOpenWorkspace={(id) => opened.push(id)} />;
  }
  await act(async () => root.render(<Harness />));
  return {
    dom, container, selected, queries, opened,
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
    assert.equal(view.container.querySelectorAll('[data-collection-action="collect"]').length, 0);
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

  } finally { await view.close(); }
});

test("collection empty, loading and no-results states keep search", async () => {
  for (const props of [{ sessions: [] }, { sessions: [], isLoading: true }, { query: "不存在" }]) {
    const view = await mount(props);
    try {
      assert.ok(view.container.querySelector('input[type="search"]'));
      assert.equal(view.container.querySelectorAll('[data-collection-action="collect"]').length, 0);
      assert.equal(view.container.querySelectorAll("[data-collection-post]").length, 0);
      assert.match(view.container.textContent ?? "", props.isLoading ? /載入緊收藏…/ : props.query ? /搵唔到「不存在」/ : /未有收藏/);
    } finally { await view.close(); }
  }
});

test("collection uses the compact square thumbnail and replaces expired media with a type tile", async () => {
  const view = await mount();
  try {
    const image = view.container.querySelector<HTMLImageElement>("[data-collection-thumbnail] img");
    assert.ok(image);
    assert.equal(image.style.width, `${tokens.panel.size.thumb}px`);
    assert.equal(image.style.height, `${tokens.panel.size.thumb}px`);
    await act(async () => image.dispatchEvent(new view.dom.window.Event("error")));
    assert.equal(view.container.querySelector("[data-collection-thumbnail] img"), null);
    const placeholder = view.container.querySelector<HTMLElement>("[data-collection-thumbnail]");
    assert.equal(placeholder?.style.width, `${tokens.panel.size.thumb}px`);
    assert.equal(placeholder?.querySelector("[data-collection-type-tile]")?.textContent, "A");
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
    assert.match(view.container.textContent ?? "", /圖片載入唔到，可以去原帖睇/);
    assert.ok(view.container.querySelector("[data-collection-reader-body]"));
  } finally { await view.close(); }
});

test("reader with text-only source omits empty image frames and AI surfaces", async () => {
  const sessions = [session("one", [item("one", { descriptor: descriptor({ image_url: null }) })])];
  const view = await mount({ sessions, selectedKey: buildCollectionPosts(sessions)[0].key });
  try {
    assert.equal(view.container.querySelector("[data-collection-reader-image]"), null);
    assert.ok(view.container.querySelector('[data-reader-detail="收藏"] time'));
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
    assert.equal(view.container.querySelector("[data-collection-post] [data-collection-comments]")?.textContent, "99");
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
    analysis: { status: "succeeded", source_comment_count: 12, clusters: [{ cluster_key: 0, size_share: 1, like_share: 1, keywords: ["Codex"],
      member_comment_ids: comments.map(comment=>comment.comment_id), comment_count: 12, top_comment_id: "c11" }],
      evidence: [{ cluster_key: 0, comments: comments.slice(0, 3).map(c => ({ ...c, comment_id: c.comment_id })) }] },
    result: { ...capture().result!, comments }
  }) });
  const sessions = [session("topic-workspace", [saved], "topic")];
  const assign: Array<[string, string | null]> = [];
  const inputHash = inlineReadingInputHash(buildInlineReadingInput(saved)!);
  const reading: import("../src/compare/inline-reading-storage.ts").InlineReadingRecord = { status: "complete", itemId: saved.id, captureId: "capture-1", reading: {
    itemId: saved.id, captureId: "capture-1", promptVersion: INLINE_READING_PROMPT_VERSION, inputHash, eligibilityVersion: COMMENT_ELIGIBILITY_VERSION,
    model: "test", generatedAt: "", gist: "支持工具", find: { method: "試下", split: "未見分歧", ask: "用法" },
    clusterNames: { "0": "支持" }, noiseClusters: [], methods: [], split: { agree: "同意", sides: [] }
  } };
  const h = await mount({ sessions, selectedKey: buildCollectionPosts(sessions)[0].key,
    topics: [{ id: "t1", sessionId: sessions[0].id, name: "工具", status: "pending", tags: [], signalIds: [], pairIds: [], createdAt: "", updatedAt: "" }],
    signals: [{ id: "s1", sessionId: sessions[0].id, itemId: saved.id, source: "threads", inboxStatus: "unprocessed", capturedAt: "" }],
    readings: { [saved.id]: reading }, onAssignTopic: (id, topicId) => assign.push([id, topicId]) });
  try {
    assert.deepEqual([...h.container.querySelectorAll("[data-reader-entry]")].map(e => e.getAttribute("data-reader-entry")), ["stance", "method", "split", "ask"]);
    assert.match(h.container.querySelector("[data-reader-answer]")!.textContent!, /支持.*約 12 則/);
    assert.equal(h.container.querySelector<HTMLDivElement>("[data-reader-entries]")!.style.gridTemplateColumns, "repeat(4,minmax(0,1fr))");
    assert.equal(h.container.querySelector("[data-reader-evidence-toggle]"),null);
    const header = h.container.querySelector<HTMLDivElement>("[data-reader-evidence-header]")!;
    assert.equal(header.style.display, "grid");
    assert.equal(header.children.length, 2);
    assert.equal(header.textContent, "支持約 12 則");
    assert.ok(h.container.querySelector("[data-reader-reply]"));
    await h.click('[data-reader-topic="t1"]');
    await h.click('[data-reader-topic=""]');
    assert.deepEqual(assign, [["s1", "t1"], ["s1", null]]);
    assert.equal(h.container.querySelector("select"), null);
    assert.ok(h.container.querySelector("[data-reader-evidence]"));
  } finally { await h.close(); }
});

test("recent readings sit below search without duplicate summaries, 讀完 chip filters finished posts and a strip row opens reader", async () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const completedAt = new Date(now - 60000).toISOString();
  const ready = item("done", { status: "succeeded", completedAt, latestCapture: capture({}, { analysis: { status: "succeeded", generated_at: completedAt, clusters: [], evidence: [] } as NonNullable<ReturnType<typeof capture>["analysis"]> }) });
  const waiting = item("waiting", { descriptor: descriptor({ post_url: "https://www.threads.com/@b/post/WAIT" }), status: "queued" });
  const view = await mount({ sessions: [session("one", [ready, waiting], "topic")], nowMs: now });
  try {
    const strip = view.container.querySelector("[data-reading-strip]")!;
    assert.match(strip.textContent!, /啱啱讀完.*@author · 讀完 1 分前/);
    assert.doesNotMatch(strip.textContent!, /種講法|則觀眾留言/);
    assert.ok(strip.compareDocumentPosition(view.container.querySelector("[data-collection-search]")!) & view.dom.window.Node.DOCUMENT_POSITION_PRECEDING);
    assert.equal(view.container.querySelectorAll('[data-collection-state="arc"]').length, 1);
    assert.equal(view.container.querySelectorAll('[data-collection-state="dot"]').length, 1);
    assert.equal(view.container.querySelector("[data-collection-finished-filter]"),null);
    await view.click('[data-collection-filter="finished"]');
    // Exiting rows remain briefly for the existing fold motion; only active rows are clickable.
    assert.equal(view.container.querySelectorAll('[data-collection-row]:not([data-collection-exiting="true"])').length, 1);
    await view.click("[data-reading-arrival]");
    assert.ok(view.container.querySelector('[data-collection-browser="reader"]'));
  } finally { await view.close(); }
});

test('product reader uses four lens tabs, reply fallback and folded source',async()=>{
 const {createDefaultSettings}=await import('../src/state/types.ts');
 const saved=item('product',{status:'succeeded',latestCapture:capture({author:'author'},{result:{...capture().result!,comments:[{comment_id:'r1',author:'author',text:'作者補充',like_count:3},{comment_id:'r2',author:'fan',text:'試過',like_count:5}]}})});
 const sessions=[session('product-workspace',[saved],'product')];
 const h=await mount({sessions,settings:createDefaultSettings(),selectedKey:buildCollectionPosts(sessions)[0].key});
 try{
  assert.deepEqual([...h.container.querySelectorAll('[data-reader-entry]')].map(e=>e.textContent?.trim()),['講咩—','啱唔啱你—','點試—','留言補充2 則']);
  assert.equal(h.container.querySelector('[data-reader-entry="add"]')?.getAttribute('aria-pressed'),'true');
  assert.match(h.container.querySelector('[data-reader-answer]')!.textContent!,/作者補充/);
  assert.equal(h.container.querySelector<HTMLDivElement>('[data-collection-reader-body]')!.style.webkitLineClamp,'6');
  await h.click('[data-reader-entry="fit"]');assert.match(h.container.textContent!,/未接 AI/);
 }finally{await h.close();}
});
test('reader evidence is present initially and 再睇 expands just one group',async()=>{
 const comments=Array.from({length:30},(_,i)=>({comment_id:`r${i}`,author:'fan',text:`回覆${i}`,like_count:i}));
 const saved=item('audience',{status:'succeeded',latestCapture:capture({}, {result:{...capture().result!,comments},analysis:{status:'succeeded',source_comment_count:30,clusters:[0,1].map(k=>({cluster_key:k,size_share:.5,like_share:.5,keywords:[k===0?'a':'b'],comment_count:15,member_comment_ids:comments.slice(k*15,k*15+15).map(c=>c.comment_id)})),evidence:[0,1].map(k=>({cluster_key:k,comments:comments.slice(k*15,k*15+15).map(c=>({...c,text:c.text}))}))}})});
 const sessions=[session('topic',[saved],'topic')];const h=await mount({sessions,selectedKey:buildCollectionPosts(sessions)[0].key});
 try{
  const count=()=>[...h.container.querySelectorAll('[data-reader-evidence] section')].map(g=>g.querySelectorAll('[data-reader-reply]').length);
  assert.deepEqual(count(),[4,3]);await h.click('[data-reader-more="cluster:0"]');assert.deepEqual(count(),[14,3]);
 }finally{await h.close();}
});

test('reader back label and action use the discourse origin while collection keeps its default',async()=>{
 let returned=0;
 const sessions=[session('audience',[item('one')],'topic')];
 const h=await mount({sessions,selectedKey:buildCollectionPosts(sessions)[0].key,readerBackLabel:'Codex',onReaderBack:()=>{returned++;}});
 try{assert.equal(h.container.querySelector('[data-collection-action="back"]')!.textContent?.trim(),'‹ Codex');await h.click('[data-collection-action="back"]');assert.equal(returned,1);assert.deepEqual(h.selected,[]);}finally{await h.close();}
 const collection=await mount({sessions,selectedKey:buildCollectionPosts(sessions)[0].key});
 try{assert.equal(collection.container.querySelector('[data-collection-action="back"]')!.textContent?.trim(),'‹ 收藏');}finally{await collection.close();}
});

test("reader 詳情 crawls a finished 觀眾反應 post again only on click and offers no second crawl meanwhile", async () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const analysis = { status: "succeeded", generated_at: "2026-10-25T00:00:00Z", clusters: [], evidence: [] } as NonNullable<ReturnType<typeof capture>["analysis"]>;
  const finished = item("legacy", { status: "succeeded", captureId: "capture-1", completedAt: "2026-10-25T00:00:00Z", latestCapture: capture({}, { analysis }) });
  const sessions = [session("audience", [finished], "topic")];
  const calls: Array<[string, string]> = [];
  let settle: (note: string | null) => void = () => undefined;
  const h = await mount({ sessions, nowMs: now, selectedKey: buildCollectionPosts(sessions)[0].key,
    onRecrawl: (sessionId, itemId) => { calls.push([sessionId, itemId]); return new Promise(resolve => { settle = resolve; }); } });
  const button = () => h.container.querySelector<HTMLButtonElement>('[data-collection-action="recrawl"]');
  try {
    assert.ok(button()?.closest("details"), "the control sits in the post's 詳情, not on the reading");
    assert.equal(calls.length, 0, "opening the reader never crawls");
    assert.equal(button()!.textContent, "重新抓取留言");
    assert.match(button()!.title, /AI/, "the cost is named before the click");
    assert.doesNotMatch(h.container.querySelector("details")!.textContent!, /原帖時間/, "the post time renders once, in the header");
    await h.click("summary");
    await h.click('[data-collection-action="recrawl"]');
    assert.deepEqual(calls, [["audience", "legacy"]]);
    assert.equal(button()!.disabled, true);
    assert.equal(button()!.textContent, "排緊隊…");
    await h.click('[data-collection-action="recrawl"]');
    await act(async () => settle("已排隊，但未能確認後端開始處理。請勿重複建單。"));
    // The panel can hold the old capture until its next sync; that capture must not offer a second crawl.
    assert.equal(button()!.textContent, "已排隊");
    assert.equal(button()!.disabled, true);
    assert.equal(h.container.querySelector('details [role="status"]')?.textContent, "已排隊，但未能確認後端開始處理。請勿重複建單。");
    await h.click('[data-collection-action="recrawl"]');
    assert.equal(calls.length, 1);
  } finally { await h.close(); }
});

test("a refused re-crawl says why and stays retryable; unfinished, settling and non-audience posts offer none", async () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const analysis = { status: "succeeded", generated_at: "2026-10-25T00:00:00Z", clusters: [], evidence: [] } as NonNullable<ReturnType<typeof capture>["analysis"]>;
  const finished = (id: string, overrides: Parameters<typeof item>[1] = {}) => item(id, { status: "succeeded", captureId: "capture-1", completedAt: "2026-10-25T00:00:00Z", latestCapture: capture({}, { analysis }), ...overrides });
  const refusedSessions = [session("audience", [finished("refused")], "topic")];
  const refused = await mount({ sessions: refusedSessions, nowMs: now, selectedKey: buildCollectionPosts(refusedSessions)[0].key,
    onRecrawl: async () => { throw new Error("後端未能建立抓取工作，請確認後端和資料庫已連上。"); } });
  try {
    await refused.click('[data-collection-action="recrawl"]');
    assert.equal(refused.container.querySelector('details [role="alert"]')?.textContent, "後端未能建立抓取工作，請確認後端和資料庫已連上。");
    const button = refused.container.querySelector<HTMLButtonElement>('[data-collection-action="recrawl"]')!;
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "重新抓取留言");
  } finally { await refused.close(); }
  const cases: Array<[string, ReturnType<typeof session>]> = [
    ["queued", session("audience", [finished("queued", { status: "queued" })], "topic")],
    ["failed", session("audience", [finished("failed", { status: "failed" })], "topic")],
    ["analysis still settling", session("audience", [finished("settling", { completedAt: new Date(now - 60_000).toISOString(), latestCapture: capture({}, { analysis: null }) })], "topic")],
    ["個人應用 only", session("product", [finished("product")], "product")],
    ["收藏整理 only", session("archive", [finished("archive")], "archive")]
  ];
  for (const [label, saved] of cases) {
    const view = await mount({ sessions: [saved], nowMs: now, selectedKey: buildCollectionPosts([saved])[0].key, onRecrawl: async () => null });
    try { assert.equal(view.container.querySelector('[data-collection-action="recrawl"]'), null, label); }
    finally { await view.close(); }
  }
});


test("collection list keeps search before scrollable chips and shows one reserved summary/status slot per card", async () => {
  const view = await mount({ sessions: [session("topic", [item("saved")], "topic"), session("archive", [])] });
  try {
    const search = view.container.querySelector("[data-collection-search]")!;
    const chips = view.container.querySelector<HTMLElement>("[data-collection-filter-scroll]")!;
    assert.ok(chips);
    assert.ok(search.compareDocumentPosition(chips) & view.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(chips.style.overflowX, "auto");
    assert.equal(chips.style.flexWrap, "nowrap");
    assert.equal(chips.querySelectorAll("[data-collection-filter]").length, 6);
    assert.equal(view.container.querySelector("[data-reading-strip]"), null, "empty recent copy is removed");
    assert.equal(view.container.querySelectorAll("[data-collection-summary]").length, 1);
    assert.equal(view.container.querySelector<HTMLElement>("[data-collection-summary]")?.style.minHeight, tokens.panel.type.bodySm.lineHeight);
    assert.equal(view.container.querySelector("[data-collection-status-chip]")?.textContent, "未抓取");
    assert.equal(view.container.querySelector("[data-collection-type-tile]")?.textContent, "A");
  } finally { await view.close(); }
});


test("reader separates the full-text action from source metadata and details label/value rows", async () => {
  const saved = item("reader-detail", { status: "succeeded", latestCapture: capture({}, { analysis: { status: "succeeded", analysis_version: "v2", clusters: [], evidence: [] } as never }) });
  const sessions = [session("audience", [saved], "topic")];
  const h = await mount({ sessions, selectedKey: buildCollectionPosts(sessions)[0].key, onRecrawl: async () => null });
  try {
    const body = h.container.querySelector<HTMLElement>('[data-collection-reader-body]')!;
    assert.equal(body.style.webkitLineClamp, "6");
    const full = h.container.querySelector<HTMLButtonElement>('[data-reader-full-text]')!;
    assert.ok(full);
    assert.equal(h.container.querySelector('[data-reader-source-meta]')!.contains(full), false);
    await h.click('[data-reader-full-text]');
    assert.equal(body.style.webkitLineClamp, "");
    assert.equal(full.getAttribute("aria-expanded"), "true");
    const details = h.container.querySelector('[data-reader-details]')!;
    assert.match(details.textContent!, /抓取.*收藏.*留言.*分析.*v2/s);
    assert.match(details.textContent!, /會用一次抓取同 AI 額度/);
    assert.equal(details.querySelectorAll('[data-reader-detail="分析"]').length, 1);
  } finally { await h.close(); }
});


test("collection loading reserves four real card geometries and exposes one hidden loading message", async () => {
  const h = await mount({ sessions: [], isLoading: true });
  try {
    assert.equal(h.container.querySelector('[data-collection-browser="list"]')!.getAttribute("aria-busy"), "true");
    const cards = [...h.container.querySelectorAll<HTMLElement>('[data-collection-loading-card]')];
    assert.equal(cards.length, 4);
    for (const card of cards) {
      const bars = [...card.querySelectorAll<HTMLElement>('[data-panel-skeleton]')];
      assert.deepEqual(bars.map(bar => bar.style.width), ["40%", "90%", "60%"]);
      assert.deepEqual(bars.map(bar => bar.style.height), ["12px", "10px", "10px"]);
      assert.equal(card.querySelectorAll("button, a, input").length, 0);
    }
    assert.equal(h.container.querySelector('[role="status"]')!.textContent, "載入緊收藏…");
    assert.equal(h.container.querySelector('[data-collection-empty]'), null);
  } finally { await h.close(); }
});

test("empty filters and searches recover through their existing callbacks", async () => {
  const h = await mount({ sessions: [session("archive", [item("one")], "archive")] });
  try {
    await h.click('[data-collection-filter="product"]');
    assert.match(h.container.querySelector('[data-collection-empty]')!.textContent!, /呢個分類未有帖文/);
    await h.click('[data-collection-clear-filter]');
    assert.equal(h.container.querySelector('[data-collection-filter="all"]')!.getAttribute("aria-pressed"), "true");
    assert.equal(h.container.querySelectorAll('[data-collection-post]').length, 1);
    await h.type("合成搜尋冇結果");
    assert.match(h.container.querySelector('[data-collection-empty]')!.textContent!, /搵唔到「合成搜尋冇結果」/);
    await h.click('[data-collection-clear-query]');
    assert.equal(h.queries.at(-1), "");
    assert.equal(h.container.querySelector<HTMLInputElement>('input[type="search"]')!.value, "");
    assert.equal(h.container.querySelectorAll('[data-collection-post]').length, 1);
  } finally { await h.close(); }
});

test("opened reading errors use the same readable alert on list and reader", async () => {
  const sessions = [session("archive", [item("one")], "archive")];
  for (const selectedKey of [null, buildCollectionPosts(sessions)[0].key]) {
    const h = await mount({ sessions, selectedKey, openedError: "合成讀取錯誤" });
    try {
      const banner = h.container.querySelector<HTMLElement>('[data-panel-error-banner]')!;
      assert.ok(banner);
      assert.equal(banner.getAttribute("role"), "alert");
      assert.equal(banner.textContent, "合成讀取錯誤");
    } finally { await h.close(); }
  }
});
