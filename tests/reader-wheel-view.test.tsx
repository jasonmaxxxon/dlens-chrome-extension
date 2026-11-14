import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ReaderWheel } from "../src/ui/ReaderWheel.tsx";
import { CollectionAudienceReading } from "../src/ui/CollectionAudienceReading.tsx";
import { buildReaderWheel, type ReaderWheelModel } from "../src/viewmodel/reader-wheel.ts";
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
async function mounted(run: (doc: Element, click: (selector: string) => Promise<void>, key: (selector: string, key: string) => Promise<void>, copied: string[]) => Promise<void>, repo = true, make: () => ReaderWheelModel = () => model(repo)) {
  const dom = new JSDOM('<div id="root"></div>');
  const prior = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const doc = dom.window.document.querySelector("#root")!, root = createRoot(doc), copied: string[] = [];
  const click = async (selector: string) => { const el = doc.querySelector(selector); assert.ok(el, selector); await act(async () => (el as HTMLElement).click()); };
  const key = async (selector: string, value: string) => { await act(async () => doc.querySelector(selector)!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true }))); };
  try { await act(async () => root.render(<ReaderWheel model={make()} onCopy={text => copied.push(text)} />)); await run(doc, click, key, copied); }
  finally { await act(async () => root.unmount()); Object.assign(globalThis, prior); dom.window.close(); }
}
function unique(doc: Element) {
  const ids = [...doc.querySelectorAll("[data-wheel-comment]")].map(el => el.getAttribute("data-wheel-comment"));
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 0; i < 14; i++) assert.ok(doc.textContent!.split(`獨有留言內容第${i}則。`).length <= 2, `duplicate c${i}`);
}
const shown = (doc: Element) => [...doc.querySelectorAll("[data-wheel-comment]")].map(el => el.getAttribute("data-wheel-comment"));
const pane = (doc: Element) => doc.querySelector("[data-wheel-pane]")!.getAttribute("data-wheel-pane");

test("overview: counted headline, AI gist, wheel, pills and one topic in focus", async () => {
  await mounted(async (doc, click, key) => {
    assert.deepEqual([...doc.querySelectorAll("[data-wheel-tab]")].map(el => el.getAttribute("data-wheel-tab")), ["overview", "split", "how", "qa", "link", "raw"]);
    assert.equal(doc.querySelector('[data-wheel-tab="overview"]')!.getAttribute("aria-selected"), "true");
    assert.equal(doc.querySelector("[data-wheel-observation]"), null);
    // The headline is counted; the AI sentence follows it, marked, and is not an entry of its own.
    assert.match(doc.querySelector("[data-wheel-kicker]")!.textContent!, /高讚 ≠ 多數.*由留言數同讚數計出/);
    assert.match(doc.querySelector("[data-wheel-headline]")!.textContent!, /最多讚嘅話題唔係最多人講嗰個，只佔 50% 留言。/);
    assert.match(doc.querySelector("[data-wheel-gist]")!.textContent!, /AI.*AI 摘要.*未連留言出處/s);
    // The headline's topic opens in focus: lit and pulled out on the wheel, pressed among the pills, one comment in the card.
    assert.equal(doc.querySelector('[data-wheel-sector="1"]')!.getAttribute("aria-pressed"), "true");
    assert.equal((doc.querySelector('[data-wheel-sector="1"]') as HTMLElement).style.opacity, "1");
    assert.notEqual((doc.querySelector('[data-wheel-sector="0"]') as HTMLElement).style.opacity, "1");
    assert.equal(doc.querySelectorAll("[data-wheel-sector] circle").length, 0);
    assert.match(doc.querySelector("[data-wheel-hub]")!.textContent!, /50%.*留言佔比/);
    assert.equal(doc.querySelector('[data-wheel-pill="1"]')!.getAttribute("aria-pressed"), "true");
    assert.doesNotMatch(doc.querySelector("[data-wheel-pills]")!.textContent!, /%/);
    assert.deepEqual(shown(doc), ["c7"]);
    assert.ok(doc.querySelector('[data-wheel-badge="liked"]')); assert.equal(doc.querySelector('[data-wheel-badge="discussed"]'), null);
    assert.ok(doc.querySelector("[data-wheel-evidence] [data-wheel-open]"));
    await click('[data-wheel-pill="0"]');
    assert.deepEqual(shown(doc), ["c0"]);
    assert.match(doc.querySelector('[data-wheel-pill="0"]')!.textContent!, /甲話題/);
    assert.ok(doc.querySelector('[data-wheel-badge="discussed"]'));
    await key('[data-wheel-sector="1"]', "Enter");
    assert.deepEqual(shown(doc), ["c7"]);
    await key('[data-wheel-sector="0"]', " ");
    assert.equal(doc.querySelector('[data-wheel-sector="0"]')!.getAttribute("aria-pressed"), "true");
    // The card leads into the comments with its topic kept as the filter.
    await click('[data-wheel-through="0"]');
    assert.equal(pane(doc), "raw");
    assert.equal(doc.querySelector('[data-wheel-raw="topic:0"]')!.getAttribute("aria-pressed"), "true");
    assert.deepEqual(shown(doc), ["c0", "c1", "c2", "c3", "c4", "c5", "c6"]);
    unique(doc);
  });
});
test("split: two claims side by side, the chosen side's comments below at full width", async () => {
  await mounted(async (doc, click) => {
    await click('[data-wheel-tab="split"]');
    assert.match(doc.querySelector("[data-wheel-pane]")!.textContent!, /AI.*同一個問題，兩種睇法.*共同前提：共同點/s);
    const sides = [...doc.querySelectorAll("[data-wheel-sides] > [data-wheel-side]")] as HTMLElement[];
    assert.equal(sides.length, 2);
    assert.match(sides[0].textContent!, /甲.*甲原因.*1 則留言/s); assert.match(sides[1].textContent!, /乙.*乙原因.*1 則留言/s);
    assert.equal((doc.querySelector("[data-wheel-sides]") as HTMLElement).style.gridTemplateColumns, "minmax(0, 1fr) minmax(0, 1fr)");
    // No comment sits inside the narrow claim cards, and nothing in this entry is set under body size.
    assert.equal(doc.querySelectorAll("[data-wheel-side] [data-wheel-comment]").length, 0);
    for (const el of doc.querySelectorAll("[data-wheel-side] span")) assert.ok(parseFloat((el as HTMLElement).style.fontSize) >= 12, (el as HTMLElement).style.fontSize);
    assert.equal((sides[0].querySelector("span") as HTMLElement).style.fontSize, "15px");
    assert.deepEqual([sides[0].getAttribute("aria-pressed"), sides[1].getAttribute("aria-pressed")], ["true", "false"]);
    assert.notEqual(sides[0].style.background, sides[1].style.background);
    assert.deepEqual(shown(doc), ["c0"]);
    await click('[data-wheel-side="1"]');
    assert.deepEqual(shown(doc), ["c7"]);
    assert.equal((doc.querySelector("[data-wheel-evidence] p") as HTMLElement).style.fontSize, "14px");
    unique(doc);
  });
});
test("methods, questions and links each open as their own entry without repeating a comment", async () => {
  await mounted(async (doc, click) => {
    await click('[data-wheel-tab="how"]');
    assert.match(doc.querySelector("[data-wheel-pane] h2")!.textContent!, /AI.*留言提出 2 個做法/);
    const methods = [...doc.querySelectorAll("[data-wheel-method]")];
    assert.match(methods[0].textContent!, /方法甲.*啱：場景/s); assert.match(methods[1].textContent!, /方法乙.*啱：別的場景/s);
    assert.deepEqual(shown(doc), ["c0"]);
    unique(doc);
    await click('[data-wheel-tab="qa"]');
    assert.match(doc.querySelector("[data-wheel-pane] h2")!.textContent!, /1 條問題，都有回覆/);
    assert.deepEqual(shown(doc), ["c0", "op1"]);
    assert.match(doc.querySelector("[data-wheel-question]")!.textContent!, /樓主答咗/);
    unique(doc);
    await click('[data-wheel-tab="link"]');
    assert.ok(doc.querySelector('[data-block-entity="url"]'));
    unique(doc);
    for (const tab of ["overview", "split", "how", "qa", "link", "raw"]) { await click(`[data-wheel-tab="${tab}"]`); assert.equal(pane(doc), tab); unique(doc); }
  });
});
test("counts-only hides every AI-written part; without AI text there is no switch", async () => {
  await mounted(async (doc, click) => {
    assert.equal(doc.querySelector('[data-wheel-mode="all"]')!.getAttribute("aria-pressed"), "true");
    await click('[data-wheel-tab="split"]');
    await click('[data-wheel-mode="counted"]');
    assert.deepEqual([...doc.querySelectorAll("[data-wheel-tab]")].map(el => el.getAttribute("data-wheel-tab")), ["overview", "qa", "link", "raw"]);
    assert.equal(pane(doc), "overview");
    assert.equal(doc.querySelector("[data-wheel-gist]"), null);
    assert.match(doc.querySelector('[data-wheel-pill="0"]')!.textContent!, /7 則類似留言/);
    for (const tab of ["overview", "qa", "link", "raw"]) { await click(`[data-wheel-tab="${tab}"]`); assert.doesNotMatch(doc.querySelector("[data-wheel-pane]")!.textContent!, /AI 摘要|甲話題|共同點|方法甲|甲原因/); }
    await click('[data-wheel-mode="all"]');
    assert.ok(doc.querySelector('[data-wheel-tab="split"]'));
  });
  const source = fixture();
  const plain = new JSDOM(renderToStaticMarkup(<ReaderWheel model={buildReaderWheel(source, null, buildAnalysisBlocks(source))!} />)).window.document;
  assert.equal(plain.querySelector("[data-wheel-mode]"), null);
  assert.deepEqual([...plain.querySelectorAll("[data-wheel-tab]")].map(el => el.getAttribute("data-wheel-tab")), ["overview", "qa", "link", "raw"]);
});
test("comments: chips filter one list, expand it, keep reply context and never repeat a comment", async () => {
  await mounted(async (doc, click) => {
    await click('[data-wheel-tab="raw"]');
    assert.deepEqual([...doc.querySelectorAll("[data-wheel-raw]")].map(el => el.getAttribute("data-wheel-raw")), ["all", "topic:0", "topic:1", "op", "noise", "link"]);
    assert.equal(doc.querySelectorAll("[data-wheel-rawpane] [data-wheel-comment]").length, 10);
    const rows = [...doc.querySelectorAll("[data-wheel-rawpane] [data-wheel-comment]")] as HTMLElement[];
    assert.equal(rows[0].style.borderTop, "");
    assert.notEqual(rows[1].style.borderTop, "");
    unique(doc);
    await click('[data-wheel-more="raw:all"]');
    assert.equal(doc.querySelectorAll("[data-wheel-rawpane] [data-wheel-comment]").length, 14);
    await click('[data-wheel-raw="topic:1"]');
    assert.deepEqual(shown(doc), ["c7", "c8", "c9", "c10", "c11", "c12", "c13"]);
    await click('[data-wheel-raw="op"]');
    assert.match(doc.querySelector("[data-wheel-rawpane]")!.textContent!, /回應 @u0/);
    unique(doc);
    await click('[data-wheel-raw="noise"]');
    assert.match(doc.querySelector("[data-wheel-rawpane]")!.textContent!, /只有表情/);
    assert.doesNotMatch(doc.textContent!, /emoji_only|answered_by_op|github_repo/);
    unique(doc);
  }, false);
});
test("a long comment is cut and opens in place; a short one is never cut", async () => {
  const make = () => { const source = fixture(); source.latestCapture!.result!.comments![1].text = "好長嘅留言。".repeat(40); return buildReaderWheel(source, null, buildAnalysisBlocks(source))!; };
  await mounted(async (doc, click) => {
    await click('[data-wheel-tab="raw"]');
    const text = () => (doc.querySelector('[data-wheel-comment="c1"] p:not([style*="background"])') as HTMLElement);
    assert.equal(text().style.overflow, "hidden");
    assert.equal(doc.querySelector('[data-wheel-comment="c0"] [data-wheel-expand]'), null);
    assert.equal((doc.querySelector('[data-wheel-comment="c0"] p') as HTMLElement).style.overflow, "");
    await click('[data-wheel-expand="c1"]');
    assert.equal(doc.querySelector('[data-wheel-expand="c1"]')!.getAttribute("aria-expanded"), "true");
    assert.equal(text().style.overflow, "");
  }, true, make);
});
test("link sort and exports retain hooks and call onCopy as an entry and as a comment filter", async () => {
  for (const repo of [true, false]) await mounted(async (doc, click, _key, copied) => {
    if (repo) await click('[data-wheel-tab="link"]'); else { await click('[data-wheel-tab="raw"]'); await click('[data-wheel-raw="link"]'); }
    await click('[data-block-entity-sort="likes"]');
    await click('[data-block-export="markdown"]');
    await click('[data-block-export="csv"]');
    assert.equal(copied.length, 2);
    assert.match(copied[0], /https:\/\/example.com\/tool/);
    assert.match(copied[1], /名稱/);
    unique(doc);
  }, repo);
});
test("reader has bilingual copy and a reduced motion guard, while a capture without blocks keeps the earlier reader", () => {
  const html = renderToStaticMarkup(<LanguageProvider value="en"><ReaderWheel model={model()} /></LanguageProvider>);
  assert.match(html, /Overview/); assert.match(html, /Counts only/);
  assert.match(html, /prefers-reduced-motion: no-preference/);
  assert.doesNotMatch(html, /font-size:(?:[0-9]|10)px/);
  const source = fixture(); delete source.latestCapture!.analysis!.blocks;
  const sessions = [session("audience", [source], "topic")];
  const reader = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0, "stance")!;
  const legacy = renderToStaticMarkup(<CollectionAudienceReading model={reader} onMore={() => {}} onLens={() => {}} onAssign={() => {}} />);
  assert.match(legacy, /data-reader-answer/); assert.doesNotMatch(legacy, /data-reader-wheel/);
  assert.doesNotMatch(readFileSync("src/ui/CollectionAudienceReading.tsx", "utf8"), /AnalysisBlocksView|AiSupplement/);
});
test("a post whose blocks all dropped out still reads in the tabbed reader, and the post type leads the entries", () => {
  const source = fixture();
  source.latestCapture!.analysis!.blocks = [];
  (source.latestCapture!.analysis as any).post_type = { type: "help" };
  const sessions = [session("audience", [source], "topic")];
  const reader = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0)!;
  const empty = new JSDOM(renderToStaticMarkup(<CollectionAudienceReading model={reader} onMore={() => {}} onLens={() => {}} onAssign={() => {}} />)).window.document;
  assert.ok(empty.querySelector("[data-blocks-empty]"));
  assert.deepEqual([...empty.querySelectorAll("[data-wheel-tab]")].map(el => el.getAttribute("data-wheel-tab")), ["overview", "raw"]);
  assert.ok(empty.querySelector('[data-reader-wheel] [data-post-type="help"]'));
  const help = fixture(); (help.latestCapture!.analysis as any).post_type = { type: "help" };
  const doc = new JSDOM(renderToStaticMarkup(<ReaderWheel model={buildReaderWheel(help, null, buildAnalysisBlocks(help))!} />)).window.document;
  assert.deepEqual([...doc.querySelectorAll("[data-wheel-tab]")].map(el => el.getAttribute("data-wheel-tab")), ["qa", "overview", "link", "raw"]);
  assert.equal(doc.querySelector("[data-wheel-pane]")!.getAttribute("data-wheel-pane"), "qa");
  // No topics and no blocks: the comments are the whole reading.
  const thin = fixture(); thin.latestCapture!.analysis!.clusters = []; thin.latestCapture!.analysis!.blocks = [];
  const bare = new JSDOM(renderToStaticMarkup(<ReaderWheel model={buildReaderWheel(thin, null, buildAnalysisBlocks(thin))!} />)).window.document;
  assert.deepEqual([...bare.querySelectorAll("[data-wheel-tab]")].map(el => el.getAttribute("data-wheel-tab")), ["raw"]);
  assert.match(bare.querySelector("[data-wheel-pane]")!.textContent!, /未有可顯示嘅觀察，先睇原文。/);
  assert.equal(bare.querySelector("svg"), null);
});
test("topic totals are shown only when the full membership can be verified", () => {
  for (const members of [undefined, ["c0"], ["c0", "c1", "c2", "c3", "c4", "c5", "c6"]]) {
    const source = fixture();
    source.latestCapture!.analysis!.clusters[0].member_comment_ids = members;
    source.latestCapture!.analysis!.clusters[1].like_share = .1;
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
    source.latestCapture!.analysis!.clusters[1].like_share = .1;
    const wheel = buildReaderWheel(source, null, buildAnalysisBlocks(source))!;
    const doc = new JSDOM(renderToStaticMarkup(<ReaderWheel model={wheel} />)).window.document;
    const evidence = doc.querySelector("[data-wheel-evidence]")!.textContent!;
    if (likes === 0) assert.match(evidence, /7 則留言 · 共 0 讚/);
    else assert.doesNotMatch(evidence, /共 \d+ 讚/);
  }
});

test("dominant topics: the percentage sits in the headline and the centre only, with verified denominators and no coverage ring", () => {
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
  // Verified like totals let the headline carry the like percentage; no pill, sector or card repeats a percentage.
  assert.match(doc.querySelector("[data-wheel-kicker]")!.textContent!, /集中一個話題/);
  assert.match(doc.querySelector("[data-wheel-headline]")!.textContent!, /^85% 留言同 92% 讚都落喺同一個話題。$/);
  assert.equal((doc.body.textContent!.match(/85%/g) ?? []).length, 2);
  assert.doesNotMatch(doc.querySelector("[data-wheel-pills]")!.textContent! + doc.querySelector("[data-wheel-evidence]")!.textContent!, /%/);
  assert.equal(doc.querySelectorAll("svg circle[stroke-dasharray]").length, 0);
  assert.match(doc.querySelector("[data-wheel-hub]")!.textContent!, /85%.*留言佔比/);
  assert.notEqual(doc.querySelector("[data-wheel-hub]")!.getAttribute("aria-hidden"), "true");
  assert.match(doc.querySelector("[data-wheel-evidence]")!.textContent!, /11／13 則已讀留言 · 12／13 讚/);
  assert.deepEqual([...doc.querySelectorAll("[data-wheel-badge]")].map(el => el.getAttribute("data-wheel-badge")), ["liked", "discussed"]);
});
test("nothing in the reader can push past its box", async () => {
  await mounted(async (doc, click) => {
    for (const tab of ["overview", "split", "how", "qa", "link", "raw"]) {
      await click(`[data-wheel-tab="${tab}"]`);
      for (const el of doc.querySelectorAll("[data-reader-wheel] *")) {
        const style = (el as HTMLElement).style;
        // Text on one line is allowed only inside a strip that scrolls, or where its length is fixed by design.
        if (style?.whiteSpace === "nowrap") assert.ok(el.closest("[data-scroll-x], [data-bounded]"), `${tab}: unbounded nowrap on ${el.outerHTML.slice(0, 80)}`);
        if (style?.width && /^\d+px$/.test(style.width)) assert.ok(parseFloat(style.width) <= 200, `${tab}: fixed width ${style.width}`);
      }
      for (const el of doc.querySelectorAll("[data-wheel-comment] > p, [data-wheel-pane] h2, [data-wheel-pane] h3")) assert.equal((el as HTMLElement).style.overflowWrap, "anywhere", `${tab}: ${el.tagName}`);
      for (const el of doc.querySelectorAll("[data-wheel-comment] > div")) if ((el as HTMLElement).style.display === "flex") assert.equal((el as HTMLElement).style.flexWrap || "nowrap", el.querySelector("i") && !el.querySelector("a") ? "nowrap" : "wrap");
    }
    const svg = doc.querySelector('[data-wheel-tab="overview"]') && (await click('[data-wheel-tab="overview"]'), doc.querySelector("[data-wheel-plot] svg") as SVGElement);
    assert.equal((svg as unknown as HTMLElement).style.overflow, "hidden");
    assert.ok((doc.querySelector("[data-wheel-plot]") as HTMLElement).style.maxWidth);
  });
});
