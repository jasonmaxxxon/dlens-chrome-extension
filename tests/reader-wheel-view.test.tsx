import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ReaderWheel } from "../src/ui/ReaderWheel.tsx";
import { CollectionAudienceReading } from "../src/ui/CollectionAudienceReading.tsx";
import { buildReaderWheel } from "../src/viewmodel/reader-wheel.ts";
import { buildAnalysisBlocks } from "../src/viewmodel/analysis-blocks.ts";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { buildCollectionReaderModel } from "../src/viewmodel/collection-reader.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";
import { LanguageProvider } from "../src/ui/i18n.ts";

function fixture(repo = true) {
  const latest = capture({ post_id: "ROOT", author: "op", text: "原帖" });
  latest.result!.comments = Array.from({ length: 14 }, (_, i) => ({ comment_id: `c${i}`, author: `u${i}`, text: `獨有留言內容第${i}則。`, like_count: 30 - i, reply_count: 1, parent_comment_id: "ROOT", url: `https://www.threads.com/@u${i}/post/COMMENT${String(i).padStart(4, "0")}` }));
  latest.result!.comments.push({ comment_id: "op1", author: "op", text: "作者獨有回應。", like_count: 1, reply_count: 0, parent_comment_id: "c0" });
  latest.analysis = { status: "succeeded", clusters: [0, 1].map(k => ({ cluster_key: k, size_share: .5, like_share: k ? .8 : .2, comment_count: 7, member_comment_ids: Array.from({ length: 7 }, (_, i) => `c${i + k * 7}`), keywords: [] })), evidence: [], metrics: {}, blocks: [
    { id: "noise", type: "noise_summary", items: [{ flag: "emoji_only", count: 1, comment_ids: ["c13"] }] },
    { id: "qa", type: "qa_pairs", items: [{ question: { comment_id: "c0", author: "u0", text: "問題" }, status: "answered_by_op", answers: [{ comment_id: "op1", author: "op", text: "答" }] }] },
    { id: "links", type: "entity_list", items: [{ key: "url", name: "工具甲", url: "https://example.com/tool", kind: repo ? "github_repo" : "web", mention_count: 1, context: "獨有留言內容第0則。", context_comment_id: "c0", evidence: [{ comment_id: "c0", author: "u0" }] }] }
  ] } as never;
  return item("wheel-view", { descriptor: descriptor({ author_hint: "op" }), latestCapture: latest });
}
function model(repo = true) {
  const source = fixture(repo);
  return buildReaderWheel(source, { gist: "AI 摘要", clusterNames: { "0": "甲話題" }, methods: [{ name: "方法甲", fit: "場景", quote: { commentId: "c0" } }, { name: "方法乙", fit: "別的場景", quote: { commentId: "c0" } }], split: { agree: "共同點", sides: [{ claim: "甲", why: "甲原因", quote: { commentId: "c0" } }, { claim: "乙", why: "乙原因", quote: { commentId: "c7" } }] } } as never, buildAnalysisBlocks(source))!;
}
async function mounted(run: (doc: Element, click: (selector: string) => Promise<void>, key: (selector: string, key: string) => Promise<void>, copied: string[]) => Promise<void>, repo = true) {
  const dom = new JSDOM('<div id="root"></div>');
  const prior = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const doc = dom.window.document.querySelector("#root")!, root = createRoot(doc), copied: string[] = [];
  const click = async (selector: string) => { const el = doc.querySelector(selector); assert.ok(el, selector); await act(async () => (el as HTMLElement).click()); };
  const key = async (selector: string, value: string) => { await act(async () => doc.querySelector(selector)!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true }))); };
  try { await act(async () => root.render(<ReaderWheel model={model(repo)} onCopy={text => copied.push(text)} />)); await run(doc, click, key, copied); }
  finally { await act(async () => root.unmount()); Object.assign(globalThis, prior); dom.window.close(); }
}
function unique(doc: Element) {
  const ids = [...doc.querySelectorAll("[data-wheel-comment]")].map(el => el.getAttribute("data-wheel-comment"));
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 0; i < 14; i++) assert.ok(doc.textContent!.split(`獨有留言內容第${i}則。`).length <= 2, `duplicate c${i}`);
}
test("observations switch evidence; sector keyboard selection, filtering and clearing work", async () => {
  await mounted(async (doc, click, key) => {
    assert.equal(doc.querySelector('[data-wheel-observation="react"]')!.getAttribute("aria-pressed"), "true");
    assert.match(doc.querySelector("[data-wheel-evidence]")!.textContent!, /唔使 AI.*未連留言出處/s);
    // 反應 reads the sectors themselves: the most liked topic stays lit, no evidence dots cover the percentage labels.
    assert.equal(doc.querySelectorAll("[data-wheel-sector] circle").length, 0);
    assert.equal((doc.querySelector('[data-wheel-sector="1"]') as HTMLElement).style.opacity, "1");
    assert.notEqual((doc.querySelector('[data-wheel-sector="0"]') as HTMLElement).style.opacity, "1");
    await click('[data-wheel-observation="topic"]');
    assert.equal(doc.querySelectorAll("[data-wheel-sector] circle").length, 0);
    await click('[data-wheel-observation="split"]');
    assert.ok(doc.querySelectorAll("[data-wheel-sector] circle").length > 0);
    for (const o of doc.querySelectorAll('[data-wheel-observation][aria-pressed="false"] span:last-child')) assert.notEqual((o as HTMLElement).style.whiteSpace, "nowrap");
    for (const o of ["split", "topic", "how", "link", "qa", "react"]) { await click(`[data-wheel-observation="${o}"]`); unique(doc); }
    await click('[data-wheel-observation="split"]');
    await key('[data-wheel-sector="0"]', "Enter");
    assert.ok(doc.querySelector("[data-wheel-clear]"));
    assert.equal(doc.querySelector('[data-wheel-comment="c7"]'), null);
    await click("[data-wheel-clear]");
    assert.ok(doc.querySelector('[data-wheel-comment="c7"]'));
    await key('[data-wheel-sector="1"]', " ");
    assert.equal(doc.querySelector('[data-wheel-comment="c0"]'), null);
    await click('[data-wheel-observation="topic"]');
    await click('[data-wheel-step="1"]');
    assert.ok(doc.querySelector('[data-wheel-comment="c7"]'));
    await click('[data-wheel-more="topic:1"]');
    assert.ok(doc.querySelector('[data-wheel-comment="c13"]'));
  });
});
test("raw chips toggle one pane, expand audience, preserve context and never repeat evidence", async () => {
  await mounted(async (doc, click) => {
    await click('[data-wheel-raw="all"]');
    assert.equal(doc.querySelectorAll("[data-wheel-rawpane] [data-wheel-comment]").length, 10);
    const rows = [...doc.querySelectorAll("[data-wheel-rawpane] [data-wheel-comment]")] as HTMLElement[];
    assert.equal(rows[0].style.borderTop, "");
    assert.notEqual(rows[1].style.borderTop, "");
    unique(doc);
    await click('[data-wheel-more="all"]');
    assert.equal(doc.querySelectorAll("[data-wheel-rawpane] [data-wheel-comment]").length, 14);
    await click('[data-wheel-raw="op"]');
    assert.match(doc.querySelector("[data-wheel-rawpane]")!.textContent!, /回應 @u0/);
    unique(doc);
    await click('[data-wheel-raw="noise"]');
    assert.match(doc.querySelector("[data-wheel-rawpane]")!.textContent!, /只有表情/);
    assert.doesNotMatch(doc.textContent!, /emoji_only|answered_by_op|github_repo/);
    unique(doc);
    await click('[data-wheel-raw="noise"]');
    assert.equal(doc.querySelector("[data-wheel-rawpane]"), null);
  });
});
test("link sort and exports retain hooks and call onCopy in observation and raw modes", async () => {
  for (const repo of [true, false]) await mounted(async (doc, click, _key, copied) => {
    await click(repo ? '[data-wheel-observation="link"]' : '[data-wheel-raw="link"]');
    await click('[data-block-entity-sort="likes"]');
    await click('[data-block-export="markdown"]');
    await click('[data-block-export="csv"]');
    assert.equal(copied.length, 2);
    assert.match(copied[0], /https:\/\/example.com\/tool/);
    assert.match(copied[1], /名稱/);
    unique(doc);
  }, repo);
});
test("wheel has bilingual copy and reduced motion guard, while legacy keeps its reader", () => {
  const html = renderToStaticMarkup(<LanguageProvider value="en"><ReaderWheel model={model()} /></LanguageProvider>);
  assert.match(html, /Observations/);
  assert.match(html, /prefers-reduced-motion: no-preference/);
  assert.doesNotMatch(html, /font-size:(?:[0-9]|10)px/);
  const source = fixture(); delete source.latestCapture!.analysis!.blocks;
  const sessions = [session("audience", [source], "topic")];
  const reader = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0, "stance")!;
  const legacy = renderToStaticMarkup(<CollectionAudienceReading model={reader} onMore={() => {}} onLens={() => {}} onAssign={() => {}} />);
  assert.match(legacy, /data-reader-answer/); assert.doesNotMatch(legacy, /data-reader-wheel/);
  assert.doesNotMatch(readFileSync("src/ui/CollectionAudienceReading.tsx", "utf8"), /AnalysisBlocksView|AiSupplement/);
});
