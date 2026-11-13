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
    // The AI gist heads the observations; it is not one of them and opens no evidence of its own.
    assert.equal(doc.querySelector('[data-wheel-observation="react"]'), null);
    assert.match(doc.querySelector("[data-wheel-headline]")!.textContent!, /AI 摘要.*|未連留言出處.*AI 摘要/s);
    assert.equal(doc.querySelector('[data-wheel-observation="topic"]')!.getAttribute("aria-pressed"), "true");
    assert.equal(doc.querySelectorAll("[data-wheel-sector] circle").length, 0);
    // Incomplete global membership cannot establish a denominator; local verified totals still render.
    assert.match(doc.querySelector("[data-wheel-evidence]")!.textContent!, /7 則留言 · 共 \d+ 讚/);
    assert.doesNotMatch(doc.textContent!, /佔比相若/);
    await click('[data-wheel-observation="split"]');
    assert.ok(doc.querySelectorAll("[data-wheel-sector] circle").length > 0);
    // 分歧: two cards side by side, the first side's marker and dots filled, the second's hollow.
    const sides = [...doc.querySelectorAll("[data-wheel-sides] > [data-wheel-side]")] as HTMLElement[];
    assert.equal(sides.length, 2);
    assert.match(sides[0].textContent!, /甲.*甲原因/s); assert.match(sides[1].textContent!, /乙.*乙原因/s);
    assert.ok(sides[0].querySelector('[data-wheel-comment="c0"]')); assert.ok(sides[1].querySelector('[data-wheel-comment="c7"]'));
    assert.equal(doc.querySelector('[data-wheel-sector="0"] circle')!.getAttribute("fill"), "#10243B");
    assert.equal(doc.querySelector('[data-wheel-sector="1"] circle')!.getAttribute("fill"), "#FFFFFF");
    for (const o of doc.querySelectorAll('[data-wheel-observation][aria-pressed="false"] span:last-child')) assert.notEqual((o as HTMLElement).style.whiteSpace, "nowrap");
    for (const o of ["split", "topic", "how", "link", "qa"]) { await click(`[data-wheel-observation="${o}"]`); unique(doc); }
    // A sector with no evidence is not a control: no button role, no tab stop, no pointer.
    await click('[data-wheel-observation="how"]');
    const bare = doc.querySelector('[data-wheel-sector="1"]') as HTMLElement;
    assert.equal(bare.getAttribute("role"), null); assert.equal(bare.getAttribute("tabindex"), null); assert.equal(bare.style.cursor, "default");
    assert.equal(doc.querySelector('[data-wheel-sector="0"]')!.getAttribute("tabindex"), "0");
    await click('[data-wheel-observation="split"]');
    await key('[data-wheel-sector="0"]', "Enter");
    assert.ok(doc.querySelector("[data-wheel-clear]"));
    assert.equal(doc.querySelector('[data-wheel-comment="c7"]'), null);
    assert.match(doc.querySelector('[data-wheel-side="1"]')!.textContent!, /呢個話題入面冇/);
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
test("a grounded AI gist heads the page without an ungrounded mark or a second evidence list", () => {
  const source = fixture();
  const grounded = buildReaderWheel(source, { gist: "AI 摘要", gistRefs: ["c0", "c7"], clusterNames: {}, methods: [], split: { agree: "", sides: [] } } as never, buildAnalysisBlocks(source))!;
  const doc = new JSDOM(renderToStaticMarkup(<ReaderWheel model={grounded} />)).window.document;
  const headline = doc.querySelector("[data-wheel-headline]")!;
  assert.match(headline.textContent!, /AI 摘要/);
  assert.doesNotMatch(headline.textContent!, /未連留言出處/);
  assert.equal(headline.querySelector("button, [role=button]"), null);
  assert.deepEqual([...doc.querySelectorAll("[data-wheel-observation]")].map(e => e.getAttribute("data-wheel-observation")), ["topic", "link", "qa"]);
  // Only the topic list renders comments: the gist's sources are not repeated as a separate reaction list.
  assert.equal(doc.querySelectorAll("[data-wheel-sector] circle").length, 0);
});

test("topic totals are shown only when the full membership can be verified", () => {
  for (const members of [undefined, ["c0"], ["c0", "c1", "c2", "c3", "c4", "c5", "c6"]]) {
    const source = fixture();
    source.latestCapture!.analysis!.clusters[0].member_comment_ids = members;
    const wheel = buildReaderWheel(source, null, buildAnalysisBlocks(source))!;
    const doc = new JSDOM(renderToStaticMarkup(<ReaderWheel model={wheel} />)).window.document;
    const evidence = doc.querySelector("[data-wheel-evidence]")!.textContent!;
    if (members?.length === 7) assert.match(evidence, /7 則留言 · 共 189 讚/);
    else assert.doesNotMatch(evidence, /\d+ 則留言 · 共 \d+ 讚/);
  }
});

test("a complete topic distinguishes unknown likes from a known zero total", () => {
  for (const likes of [undefined, null, 0]) {
    const source = fixture();
    for (const row of source.latestCapture!.result!.comments!.slice(0, 7)) row.like_count = likes;
    const wheel = buildReaderWheel(source, null, buildAnalysisBlocks(source))!;
    const doc = new JSDOM(renderToStaticMarkup(<ReaderWheel model={wheel} />)).window.document;
    const evidence = doc.querySelector("[data-wheel-evidence]")!.textContent!;
    if (likes === 0) assert.match(evidence, /7 則留言 · 共 0 讚/);
    else assert.doesNotMatch(evidence, /共 \d+ 讚/);
  }
});

test("dominant topics show one percentage and verified denominators without a coverage ring", () => {
  const source = fixture();
  const latest = source.latestCapture!;
  latest.result!.comments = latest.result!.comments!.filter(row => row.comment_id !== "c13");
  for (const row of latest.result!.comments!) {
    const n = Number(String(row.comment_id).slice(1));
    row.like_count = n === 0 ? 8 : n >= 1 && n <= 4 || n === 11 ? 1 : 0;
  }
  latest.analysis!.source_comment_count = 13;
  latest.analysis!.clusters = [11, 1, 1].map((count, k) => ({
    cluster_key: k, size_share: count / 13, like_share: [12 / 13, 1 / 13, 0][k],
    comment_count: count, member_comment_ids: k === 0 ? Array.from({ length: 11 }, (_, i) => `c${i}`) : [`c${k + 10}`], keywords: [],
  }));
  const ai = { gist: "示例摘要", clusterNames: { "0": "代理商服務", "1": "費用", "2": "修圖" }, methods: [], split: { agree: "", sides: [] } };
  const wheel = buildReaderWheel(source, ai as never, buildAnalysisBlocks(source))!;
  const doc = new JSDOM(renderToStaticMarkup(<ReaderWheel model={wheel} />)).window.document;
  assert.equal((doc.body.textContent!.match(/85%/g) ?? []).length, 1);
  assert.equal(doc.querySelectorAll("svg circle[stroke-dasharray]").length, 0);
  assert.match(doc.querySelector("[data-wheel-hub]")!.textContent!, /85%.*留言佔比/);
  assert.notEqual(doc.querySelector("[data-wheel-hub]")!.getAttribute("aria-hidden"), "true");
  assert.match(doc.querySelector("[data-wheel-evidence]")!.textContent!, /11／13 則已讀留言 · 12／13 讚/);
});
