import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { CollectionAudienceReading } from "../src/ui/CollectionAudienceReading.tsx";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { buildCollectionReaderModel } from "../src/viewmodel/collection-reader.ts";
import { blockEvidenceHref, buildAnalysisBlocks, entityCsv, entityMarkdown, sortEntityRows, type AnalysisBlocksModel, type EntityExportLabels } from "../src/viewmodel/analysis-blocks.ts";
import { tokens } from "../src/ui/tokens.ts";
import { AnalysisBlocksView } from "../src/ui/AnalysisBlocks.tsx";
import { blockText } from "../src/ui/i18n.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";
import type { SessionItem } from "../src/state/types.ts";

const comments = [
  { comment_id: "DQa1tapF0w1", author: "dev_a", text: "推薦 tapflow https://github.com/jo-duchan/tapflow", like_count: 40, parent_comment_id: "ROOT", reply_count: 0 },
  { comment_id: "DQa3ytdlp01", author: "kenji.tw", text: "yt-dlp 係必備", like_count: 31, parent_comment_id: "ROOT", reply_count: 0 },
  { comment_id: "R7", author: "carol", text: "點樣確定資料未過時？", like_count: 5, parent_comment_id: "ROOT", reply_count: 0, url: "https://www.threads.net/@Carol/post/CAPTURED01" },
  { comment_id: "c-internal-88", author: "amy_ux", text: "設計資源站", like_count: 8, parent_comment_id: "ROOT", reply_count: 0 },
];

function fixture(extra: Record<string, unknown> | null): SessionItem {
  const latest = capture({ post_id: "ROOT", url: "https://www.threads.com/@op/post/ROOT", author: "op", text: "原帖正文" });
  latest.result!.comments = comments;
  latest.analysis = { status: "succeeded", analysis_version: "v3", source_comment_count: comments.length,
    clusters: [{ cluster_key: 0, size_share: 1, like_share: 1, keywords: ["工具"], member_comment_ids: comments.map(c => c.comment_id), comment_count: comments.length, top_comment_id: "DQa1tapF0w1" }],
    evidence: [], metrics: {}, ...(extra ?? {}) } as never;
  return item("card", { status: "succeeded", descriptor: descriptor({ post_url: "https://www.threads.com/@op/post/ROOT", author_hint: "op" }), latestCapture: latest });
}

const entity = (name: string, url: string, mention_count: number, total_likes: number, kind = "github_repo", evidence: unknown[] = []) =>
  ({ key: url, name, url, domain: new URL(url).hostname.replace(/^www\./, ""), kind, mention_count, recommenders: ["dev_a"], total_likes, context: `${name} 描述`, in_post: false, mentioned_by_op: false, evidence, comment_ids: [] });
// Item shapes follow blocks-v1-contract.md: optional keys omitted, explicit nulls only where the contract says so.
const blocks = [
  { id: "noise_summary", type: "noise_summary", title_key: "blocks.noise_summary.title", order: 4, priority: "secondary", item_count: 3, total_count: 3, truncated: false, items: [
    { flag: "bookmark", count: 4, comment_ids: ["N1", "N2", "N3", "N4"] }, { flag: "tag_friend", count: 1, comment_ids: ["N5"] }, { flag: "emoji_only", count: 1, comment_ids: ["N6"] },
  ], evidence_comment_ids: [], meta: { audience_count: 13, noise_count: 6, noise_share: 0.4615, by_flag: { bookmark: 4, tag_friend: 1, emoji_only: 1 } } },
  { id: "entity_list", type: "entity_list", title_key: "blocks.entity_list.title", order: 1, priority: "primary", item_count: 3, total_count: 5, truncated: true, items: [
    entity("jo-duchan/tapflow", "https://github.com/jo-duchan/tapflow", 3, 54, "github_repo", [{ comment_id: "DQa1tapF0w1", author: "dev_a", like_count: 40, permalink: "https://www.threads.com/@dev_a/post/DQa1tapF0w1" }]),
    entity("Video", "https://www.youtube.com/watch?v=abc(1)", 1, 90, "video"),
    { ...entity("Bad", "javascript:alert(1)", 0, 0, "web"), in_post: true, context: null },
  ], meta: { by_kind: { github_repo: 1, video: 1, web: 1 }, source: "persisted_links" } },
  { id: "mystery", type: "future_widget", order: 2, items: [{}] },
  { id: "top_comments", type: "top_comments", title_key: "blocks.top_comments.title", items: [
    { comment_id: "R1", author: "dev_a", like_count: 40, permalink: "https://www.threads.com/@dev_a/post/R1", text: "推薦 tapflow，手機錄操作好方便", reply_count: null,
      links: [{ url: "https://github.com/jo-duchan/tapflow", text: "github.com/jo-ducha…", domain: "github.com", kind: "external" }],
      evidence: [{ comment_id: "R1", author: "dev_a", like_count: 40, permalink: "https://www.threads.com/@dev_a/post/R1" }] },
    { comment_id: "DQa3ytdlp01", author: null, like_count: 31, text: "yt-dlp 係必備", reply_count: 0, evidence: [{ comment_id: "DQa3ytdlp01", author: null, like_count: 31 }] },
  ], meta: { ranked_by: "like_count" } },
  { id: "qa_pairs", type: "qa_pairs", title_key: "blocks.qa_pairs.title", order: 3, priority: "primary", item_count: 4, total_count: 4, truncated: false, items: [
    { question: { comment_id: "R11", author: "u_ask", like_count: 6, permalink: "https://www.threads.com/@u_ask/post/R11", text: "有冇 Windows 版？" }, status: "answered_by_op",
      answers: [{ comment_id: "R12", author: "plush74", like_count: 3, permalink: "https://www.threads.com/@plush74/post/R12", is_op: true, text: "有，release 頁有 exe" }], answer_count: 1,
      evidence: [{ comment_id: "R11", author: "u_ask", like_count: 6, permalink: "https://www.threads.com/@u_ask/post/R11" }, { comment_id: "R12", author: "plush74", like_count: 3, permalink: "https://www.threads.com/@plush74/post/R12", is_op: true }] },
    { question: { comment_id: "R7", author: "carol", like_count: 5, text: "點樣確定資料未過時？" }, status: "replies_not_captured", answers: [], answer_count: 0, evidence: [{ comment_id: "R7", author: "carol", like_count: 5 }] },
    { question: { comment_id: "c-internal-88", author: "amy_ux", like_count: 8, text: "其他？" }, status: "weird_status", answers: [], answer_count: 0, evidence: [{ comment_id: "c-internal-88", author: "amy_ux", like_count: 8 }] },
    { question: { comment_id: null, is_post: true, author: "op", text: "四日工作週喺香港行唔行得通？", like_count: null, permalink: "https://www.threads.net/@op/post/RootCode2" }, status: "answered",
      answers: [1, 2, 3].map(n => ({ comment_id: `A${n}`, author: `ans${n}`, like_count: n, permalink: `https://www.threads.com/@ans${n}/post/A${n}`, text: `答案 ${n}` })), answer_count: 4,
      evidence: [{ comment_id: "A1", author: "ans1", like_count: 1, permalink: "https://www.threads.com/@ans1/post/A1" }] },
  ], evidence_comment_ids: [], meta: { status_counts: { answered_by_op: 1, answered: 1, unanswered: 0, replies_not_captured: 1, unknown: 1 }, reply_structure_known: true, post_is_question: true } },
  { id: "opinion_overview", type: "opinion_overview", title_key: "blocks.opinion_overview.title", order: 5, item_count: 3, total_count: 3, truncated: false, items: [
    { cluster_key: 0, label: null, keywords: ["四日", "工作", "作量", "哈哈"], size_share: 0.5, like_share: 0.45977, comment_count: 5, substantive_count: 4, noise_count: 1, noise_only: false, evidence: [{ comment_id: "D1", author: "a1", like_count: 50, permalink: "https://www.threads.com/@a1/post/D1" }] },
    { cluster_key: 1, label: null, keywords: ["general"], size_share: 0.3, like_share: 0.2, comment_count: 3, substantive_count: 3, noise_count: 0, noise_only: false, evidence: [] },
    { cluster_key: 2, label: null, keywords: ["general"], size_share: 0.2, like_share: 0.1, comment_count: 2, substantive_count: 0, noise_count: 2, noise_only: true, evidence: [] },
  ], evidence_comment_ids: [], meta: { membership: "complete", battlefield_enabled: false } },
];
const noise = { version: "noise-v1", audience_count: 13, noise_count: 6, noise_share: 0.4615, by_flag: { bookmark: 4, tag_friend: 1, emoji_only: 1 } };

test("an analysis without a blocks key stays on the legacy four-cell reading", () => {
  const model = buildAnalysisBlocks(fixture(null));
  assert.equal(model.mode, "legacy");
  assert.equal(model.postType, null);
  assert.equal(model.error, false);
  // post_type / noise alone never change the layout.
  const tagged = buildAnalysisBlocks(fixture({ post_type: { type: "help", confidence: 0.3 }, noise }));
  assert.equal(tagged.mode, "legacy");
  assert.equal(tagged.postType, "help");
});

test("blocks keep backend order, tolerate a missing order and skip unknown types", () => {
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", post_type: { type: "resource" }, noise, blocks }));
  assert.equal(model.mode, "blocks");
  assert.deepEqual(model.blocks.map(b => b.type), ["entity_list", "qa_pairs", "noise_summary", "opinion_overview", "top_comments"]);
  assert.deepEqual(model.skipped, ["future_widget"]);
  assert.equal(model.postType, "resource");
  const entityBlock = model.blocks[0];
  assert.ok(entityBlock.type === "entity_list");
  assert.equal(entityBlock.truncated, true);
  assert.equal(entityBlock.total - entityBlock.shown, 2);
  // Full URL text is kept; only http(s) becomes a link.
  assert.equal(entityBlock.items[1].url, "https://www.youtube.com/watch?v=abc(1)");
  assert.equal(entityBlock.items[2].href, null);
  assert.equal(entityBlock.items[2].context, "", "null context stays empty");
  const qa = model.blocks[1];
  assert.ok(qa.type === "qa_pairs");
  // The post-as-question sorts first and links to the post's own permalink (threads.net kept); unknown statuses read as unknown.
  assert.deepEqual(qa.items.map(i => i.status), ["answered", "answered_by_op", "replies_not_captured", "unknown"]);
  assert.equal(qa.items[0].question.isPost, true);
  assert.equal(qa.items[0].question.commentId, null);
  assert.equal(qa.items[0].question.likes, null);
  assert.equal(qa.items[0].question.href, "https://www.threads.net/@op/post/RootCode2");
  assert.equal(qa.items[0].answers.length, 3);
  assert.equal(qa.items[0].answerCount, 4);
  assert.equal(qa.items[1].answers[0].isOp, true);
  assert.deepEqual(qa.statusCounts, { answered_by_op: 1, answered: 1, unanswered: 0, replies_not_captured: 1, unknown: 1 });
  const top = model.blocks[4];
  assert.ok(top.type === "top_comments");
  assert.equal(top.items[0].replies, null, "reply_count null is unknown, not 0");
  assert.equal(top.items[1].replies, 0);
  assert.deepEqual(top.items[0].links, [{ url: "https://github.com/jo-duchan/tapflow", href: "https://github.com/jo-duchan/tapflow", kind: "external" }]);
  assert.deepEqual(top.items[1].links, []);
  assert.equal(top.items[1].author, "", "null author stays empty");
  const noiseBlock = model.blocks[2];
  assert.ok(noiseBlock.type === "noise_summary");
  assert.deepEqual(noiseBlock.flags.map(f => [f.flag, f.count]), [["bookmark", 4], ["tag_friend", 1], ["emoji_only", 1]]);
  const opinion = model.blocks[3];
  assert.ok(opinion.type === "opinion_overview");
  // The noise-only cluster is not a row any more; it is counted instead.
  assert.deepEqual(opinion.items.map(i => [i.label, i.generic, i.substantive, i.pct]), [["四日、工作、作量、哈哈", false, 4, 50], ["", true, 3, 30]]);
  assert.equal(opinion.noiseOnlyGroups, 1);
});

test("evidence links prefer the permalink, then the captured URL, then a shortcode rebuild, else none", () => {
  const source = fixture(null);
  assert.equal(blockEvidenceHref({ comment_id: "x", author: "a", permalink: "https://www.threads.com/@dev_a/post/DQa1tapF0w1" }, source), "https://www.threads.com/@dev_a/post/DQa1tapF0w1");
  assert.equal(blockEvidenceHref({ comment_id: "R7", author: "carol" }, source), "https://www.threads.com/@carol/post/CAPTURED01");
  assert.equal(blockEvidenceHref({ comment_id: "DQa3ytdlp01", author: "@kenji.tw" }, source), "https://www.threads.com/@kenji.tw/post/DQa3ytdlp01");
  assert.equal(blockEvidenceHref({ comment_id: "c-internal-88", author: "amy_ux" }, source), null);
  assert.equal(blockEvidenceHref({ comment_id: "R1", author: "dev_a", permalink: "javascript:alert(1)" }, null), null);
});

test("empty blocks show omitted types; blocks_error (a class name, no blocks keys) falls back to legacy", () => {
  const empty = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [], blocks_omitted: [{ type: "entity_list", reason: "empty" }, { type: "future_widget", reason: "empty" }] }));
  assert.equal(empty.mode, "empty");
  assert.deepEqual(empty.omitted, [{ type: "entity_list", reason: "empty" }]);
  const failed = buildAnalysisBlocks(fixture({ blocks_error: "ValueError" }));
  assert.equal(failed.mode, "legacy");
  assert.equal(failed.error, true);
  assert.equal(failed.postType, null);
});

test("entity sorting is local and exports carry full links in Markdown and CSV", () => {
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks }));
  const rows = model.blocks[0].type === "entity_list" ? model.blocks[0].items : [];
  assert.deepEqual(sortEntityRows(rows, "mentions").map(r => r.name), ["jo-duchan/tapflow", "Video", "Bad"]);
  assert.deepEqual(sortEntityRows(rows, "likes").map(r => r.name), ["Video", "jo-duchan/tapflow", "Bad"]);
  assert.deepEqual(sortEntityRows(rows, "github").map(r => r.name), ["jo-duchan/tapflow"]);
  const labels: EntityExportLabels = { mentions: "人提及", likes: "讚", by: "推介", columns: ["名稱", "連結", "網域", "提及人數", "讚數", "推介人", "描述"] };
  const md = entityMarkdown(rows, "推介工具", labels);
  assert.match(md, /^# 推介工具/);
  assert.match(md, /- \[jo-duchan\/tapflow\]\(https:\/\/github\.com\/jo-duchan\/tapflow\) — jo-duchan\/tapflow 描述 · 3 人提及 · 54 讚 · 推介 @dev_a/);
  assert.match(md, /watch\?v=abc%281%29\)/);
  const csv = entityCsv([{ ...rows[0], context: "=HYPERLINK(1)" }], labels).split("\n");
  assert.equal(csv[0], '"名稱","連結","網域","提及人數","讚數","推介人","描述"');
  assert.equal(csv[1], '"jo-duchan/tapflow","https://github.com/jo-duchan/tapflow","github.com","3","54","dev_a","\'=HYPERLINK(1)"');
});

test("every block-v1 title, group, sort, post-type, omitted and noise label is translated", () => {
  for (const key of ["opinion_overview", "entity_list", "qa_pairs", "top_comments", "noise_summary"]) assert.ok(blockText("zh", `blocks.${key}.title`));
  for (const group of ["answered", "unanswered", "unseen"]) assert.ok(blockText("zh", `blocks.qa.group.${group}`) && blockText("en", `blocks.qa.group.${group}`));
  for (const type of ["discussion", "resource", "help", "news", "entertainment", "unknown"]) assert.ok(blockText("zh", `blocks.post_type.${type}`));
  for (const key of ["blocks.omitted.all_duplicate", "blocks.omitted.noise_only", "blocks.noise.flag.placeholder", "blocks.fold.more"]) assert.ok(blockText("zh", key) && blockText("en", key));
  for (const sort of ["mentions", "likes", "github"]) assert.ok(blockText("zh", `blocks.sort.${sort}`) && blockText("en", `blocks.sort.${sort}`));
  assert.equal(blockText("zh", "blocks.truncated", { n: 2, total: 5 }), "仲有 2 項未列出（共 5 項）");
  assert.equal(blockText("zh", "blocks.fold.more", { n: 3 }), "再睇 3 個");
  assert.equal(blockText("zh", "blocks.no.such.key"), "");
});

async function mount(source: SessionItem, props: { copyStatus?: string; onCopy?: (text: string) => void; blocks?: AnalysisBlocksModel } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  const actGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const priorAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const sessions = [session("audience", [source], "topic")];
  const model = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0, "stance")!;
  const { blocks: projectedBlocks, ...viewProps } = props;
  if (projectedBlocks) model.blocks = projectedBlocks;
  await act(async () => root.render(<CollectionAudienceReading model={model} onMore={() => {}} onLens={() => {}} onAssign={() => {}} {...viewProps} />));
  const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
  /** Opens every folded block, 「再睇」 and row, repeating so newly mounted ones open too. */
  const openAll = async () => { for (let i = 0; i < 3; i++) for (const el of [...container.querySelectorAll('[data-block-fold], [data-block-more], [data-block-row-toggle]')]) if (el.getAttribute("aria-expanded") === "false") await click(el); };
  return { doc: container, click, openAll, done: async () => { await act(async () => root.unmount()); Object.assign(globalThis, old); actGlobal.IS_REACT_ACT_ENVIRONMENT = priorAct; dom.window.close(); } };
}
async function withReader(source: SessionItem, run: (r: Awaited<ReturnType<typeof mount>>) => Promise<void>, props: Parameters<typeof mount>[1] = {}) {
  const r = await mount(source, props);
  try { await run(r); } finally { await r.done(); }
}
const blk = (type: string, extra: Record<string, unknown>) => ({ id: type, type, title_key: `blocks.${type}.title`, order: 1, priority: "primary", item_count: 1, total_count: 1, truncated: false, evidence_comment_ids: [], meta: {}, items: [], ...extra });
const ref = (comment_id: string, author: string, like_count = 1) => ({ comment_id, author, like_count, permalink: `https://www.threads.com/@${author}/post/${comment_id}` });

test("the reader renders blocks in order: primary open, secondary folded, with evidence links and no legacy lens bar", async () => {
  await withReader(fixture({ blocks_version: "v1", post_type: { type: "resource" }, noise, blocks }), async ({ doc, openAll, click }) => {
    assert.deepEqual([...doc.querySelectorAll("[data-analysis-block]")].map(e => e.getAttribute("data-analysis-block")), ["entity_list", "qa_pairs", "noise_summary", "opinion_overview", "top_comments"]);
    assert.deepEqual([...doc.querySelectorAll("[data-analysis-block]")].map(e => e.getAttribute("data-block-priority")), ["primary", "primary", "secondary", "secondary", "secondary"]);
    assert.equal(Boolean(doc.querySelector("[data-reader-entries]")), false);
    assert.equal(doc.querySelector("[data-post-type]")?.textContent, "資源");
    // Secondary blocks are one line until opened: nothing of their body is mounted yet.
    const fold = doc.querySelector<HTMLElement>('[data-analysis-block="top_comments"] [data-block-fold]')!;
    assert.equal(fold.getAttribute("aria-expanded"), "false");
    assert.match(fold.querySelector("[data-block-fold-line]")!.textContent!, /最高讚/);
    assert.equal(Boolean(doc.querySelector("[data-block-top]")), false);
    assert.ok(doc.querySelector("[data-block-lead]"), "a lead sentence is derived from the first primary block");
    assert.match(doc.querySelector("[data-block-lead]")!.textContent!, /最多人推介「jo-duchan\/tapflow」（3 人提）/);
    await click(fold);
    assert.equal(fold.getAttribute("aria-expanded"), "true");
    assert.ok(doc.querySelector("[data-block-top]"));
    await openAll();
    const urls = [...doc.querySelectorAll("[data-block-entity-url]")];
    // Default local sort is 最多人提.
    assert.deepEqual(urls.map(u => u.textContent), ["https://github.com/jo-duchan/tapflow", "https://www.youtube.com/watch?v=abc(1)", "javascript:alert(1)"]);
    assert.equal(urls[2].tagName, "SPAN", "non-http URLs are not links");
    const bad = doc.querySelector('[data-block-entity="javascript:alert(1)"]')!;
    assert.match(bad.textContent!, /帖文提及/);
    assert.doesNotMatch(bad.textContent!, /0 人提/);
    assert.ok(bad.querySelector("[data-block-row-toggle]"), "the full plain URL remains available in the row detail even without evidence");
    const link = doc.querySelector('[data-reading-ref-site="DQa1tapF0w1"]')!;
    assert.equal(link.textContent, "睇原留言 ↗");
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(doc.querySelector('[data-reading-ref-site="R7"]')?.getAttribute("href"), "https://www.threads.com/@carol/post/CAPTURED01");
    assert.match(doc.querySelector('[data-block-evidence-id="c-internal-88"]')!.textContent!, /c-internal-88/);
    assert.equal(doc.querySelector("[data-block-truncated]")?.textContent, "仲有 2 項未列出（共 5 項）");
    // Q&A: five statuses stay in the data, the reader shows three groups.
    assert.equal(doc.querySelector('[data-block-qa-status="replies_not_captured"]')?.textContent, "睇唔到回覆");
    assert.equal(doc.querySelector('[data-block-qa-status="unknown"]')?.textContent, "睇唔到回覆");
    assert.equal(doc.querySelector('[data-block-qa-status="answered_by_op"]')?.textContent, "有答");
    assert.equal(doc.querySelector("[data-block-qa-summary]")?.textContent, "有答 2 · 睇唔到回覆 2");
    const postQa = doc.querySelector("[data-block-qa]")!;
    assert.equal(postQa.getAttribute("data-block-qa"), "answered", "the post-as-question comes first");
    assert.match(postQa.textContent!, /原帖提問/);
    const postLink = postQa.querySelector('[data-reading-ref-site="post"]')!;
    assert.equal(postLink.textContent, "睇原帖 ↗");
    assert.equal(postLink.getAttribute("href"), "https://www.threads.net/@op/post/RootCode2");
    assert.equal(postQa.querySelector("[data-block-qa-more]")?.textContent, "+1 則答案未列出");
    assert.equal(postQa.querySelectorAll('[data-block-qa-person="answer"]').length, 3);
    assert.equal(doc.querySelector('[data-block-qa="answered_by_op"] [data-reading-ref-site="R12"]')?.textContent, "睇原留言 ↗");
    const comment = doc.querySelector('[data-block-comment-link="external"]')!;
    assert.equal(comment.textContent, "https://github.com/jo-duchan/tapflow", "the full URL, not the crawler's truncated text");
    assert.equal(comment.getAttribute("href"), "https://github.com/jo-duchan/tapflow");
    const opinions = [...doc.querySelectorAll("[data-block-opinion]")];
    assert.equal(opinions.length, 2, "the noise-only cluster is not drawn as a group");
    assert.match(opinions[0].textContent!, /四日、工作、作量、哈哈/);
    assert.match(opinions[0].textContent!, /4 則有內容 · 1 則標記/);
    assert.match(opinions[1].textContent!, /其他留言/);
    assert.match(doc.querySelector("[data-block-opinion-noise-groups]")!.textContent!, /另有 1 組只有標記類留言/);
    assert.doesNotMatch(doc.textContent!, /replies_not_captured|weird_status|tag_friend|future_widget|blocks\.|general/);
    assert.equal(doc.querySelectorAll("[data-block-noise] [data-reader-reply]").length, 0, "noise stays numbers only");
  });
});

test("rev 2 entities: own description, fallback to context, repo meta, status never raw, context link by id", () => {
  const e = (name: string, url: string, extra: Record<string, unknown>) => ({ ...entity(name, url, 2, 10, "github_repo", [ref("DQa1tapF0w1", "dev_a", 40), ref("DQa3ytdlp01", "kenji.tw", 31)]), ...extra });
  const enrichment = (extra: Record<string, unknown>) => ({ source: "github_api", status: "ok", fetched_at: "2026-11-11T08:00:00Z", cached: false, ...extra });
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("entity_list", { item_count: 4, total_count: 4, items: [
    e("a/own", "https://github.com/a/own", { context_comment_id: "DQa3ytdlp01", enrichment: enrichment({ title: "a/own", description: "官方描述 A", stars: 12400, language: "TypeScript", archived: false, pushed_at: "2026-10-30T01:00:00Z" }) }),
    e("b/dropped", "https://github.com/b/dropped", { enrichment: enrichment({ description: null, description_dropped: "same_as_context", stars: 8, language: "Go", archived: true }) }),
    e("c/gone", "https://github.com/c/gone", { enrichment: { source: "github_api", status: "not_found", reason: "repo_gone", description: "SHOULD NOT SHOW", stars: 999 } }),
    e("Example", "https://example.com/x", { kind: "web", enrichment: enrichment({ source: "og_meta", description: "網站描述", site_name: "Example Site" }) }),
  ], meta: { featured_comment_ids: ["DQa3ytdlp01"] } })] }));
  const rows = model.blocks[0].type === "entity_list" ? model.blocks[0].items : [];
  assert.deepEqual([rows[0].summary, rows[0].quote], ["官方描述 A", "a/own 描述"]);
  assert.deepEqual(rows[0].repo, { stars: "12.4k", language: "TypeScript", archived: false, pushed: "2026-10-30" });
  assert.equal(rows[0].link?.commentId, "DQa3ytdlp01", "context_comment_id drives the comment link");
  assert.deepEqual([rows[1].summary, rows[1].quote], ["b/dropped 描述", ""], "same_as_context falls back to the context and quotes nothing twice");
  assert.equal(rows[1].repo?.archived, true);
  assert.deepEqual([rows[2].summary, rows[2].repo], ["c/gone 描述", null], "a non-ok enrichment contributes nothing");
  assert.equal(rows[3].site, "Example Site");
  assert.equal(rows[3].summary, "網站描述");
});

test("rev 2 entity rows show the summary, repo facts and site, and never a raw enrichment status", async () => {
  const e = (name: string, extra: Record<string, unknown>) => ({ ...entity(name, `https://github.com/${name}`, 2, 10, "github_repo", [ref("DQa1tapF0w1", "dev_a", 40)]), ...extra });
  const src = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("entity_list", { item_count: 4, total_count: 4, items: [
    e("a/own", { enrichment: { source: "github_api", status: "ok", description: "官方描述 A", stars: 12400, language: "TypeScript", archived: false, pushed_at: "2026-10-30T01:00:00Z" } }),
    e("c/gone", { enrichment: { source: "github_api", status: "not_found", reason: "repo_gone", description: "SHOULD NOT SHOW" } }),
    e("d/old", { enrichment: { source: "github_api", status: "ok", description: "舊工具", archived: true } }),
    { ...e("Example", { kind: "web", enrichment: { source: "og_meta", status: "ok", description: "網站描述", site_name: "Example Site" } }), url: "https://example.com/x", domain: "example.com" },
  ] })] });
  await withReader(src, async ({ doc, click }) => {
    const text = () => doc.textContent!;
    assert.match(text(), /官方描述 A/);
    assert.match(doc.querySelector('[data-block-entity="https://github.com/a/own"] [data-block-entity-facts]')!.textContent!, /12\.4k 星 · TypeScript · 2026-10-30 更新/);
    assert.equal(doc.querySelectorAll("[data-block-entity]").length, 3, "first three rows");
    await click(doc.querySelector("[data-block-more]")!);
    assert.equal(doc.querySelectorAll("[data-block-entity]").length, 4, "「再睇 1 個」 reveals the rest in place");
    assert.match(doc.querySelector('[data-block-entity="https://github.com/d/old"] [data-block-entity-facts]')!.textContent!, /已封存/);
    assert.match(text(), /Example Site/);
    assert.doesNotMatch(text(), /not_found|repo_gone|same_as_context|SHOULD NOT SHOW|github_api|og_meta/);
  });
});

test("「再睇 N 個」 appears after the first three rows and folds back", async () => {
  const items = ["a", "b", "c", "d", "e"].map((n, i) => entity(n, `https://github.com/x/${n}`, 5 - i, 10, "github_repo", [ref("DQa1tapF0w1", "dev_a")]));
  await withReader(fixture({ blocks_version: "v1", blocks: [blk("entity_list", { item_count: 5, total_count: 5, items })] }), async ({ doc, click }) => {
    const more = doc.querySelector<HTMLElement>("[data-block-more]")!;
    assert.equal(more.textContent, "再睇 2 個");
    assert.equal(doc.querySelectorAll("[data-block-entity]").length, 3);
    await click(more);
    assert.equal(doc.querySelectorAll("[data-block-entity]").length, 5);
    assert.equal(more.textContent, "收起");
    assert.equal(more.getAttribute("aria-expanded"), "true");
  });
});

test("rev 2 opinion: AI name by cluster_key (items reordered), backend label, keywords, low_signal last, merged 其他留言, noise-only keys absent", async () => {
  const cluster = (key: number, extra: Record<string, unknown>) => ({ cluster_key: key, label: null, keywords: ["general"], quant_keywords: ["general"], size_share: 0.1, like_share: 0.1, comment_count: 2, substantive_count: 2, noise_count: 0, noise_only: false, low_signal: false, evidence: [], ...extra });
  const src = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("opinion_overview", { item_count: 5, total_count: 5, items: [
    cluster(2, { label: "甲", keywords: ["a1", "a2"], quant_keywords: ["q1"], size_share: 0.4, comment_count: 5, evidence: [ref("DQa1tapF0w1", "dev_a", 40)] }),
    cluster(1, { label: "乙", keywords: ["b1"], evidence: [ref("DQa3ytdlp01", "kenji.tw", 31)] }),
    cluster(7, { label: "弱", low_signal: true, keywords: ["w"], evidence: [ref("DQa3ytdlp01", "kenji.tw", 31)] }),
    cluster(8, { evidence: [ref("R7", "carol", 5)] }),
    cluster(9, { comment_count: 3, size_share: 0.1, evidence: [ref("c-internal-88", "amy_ux", 8)] }),
  ], meta: { noise_only_cluster_keys: [3] } })] });
  // AI renames cluster 1 only; position 1 (cluster 1 here, but position 0 is cluster 2) must not be confused.
  const model = buildAnalysisBlocks(src, { "1": "AI 乙" });
  const op = model.blocks[0];
  assert.ok(op.type === "opinion_overview");
  assert.deepEqual(op.items.map(i => [i.label, i.generic, i.lowSignal]), [["甲", false, false], ["AI 乙", false, false], ["弱", false, true], ["", true, false]]);
  assert.deepEqual(op.items[0].keywords, ["a1", "a2", "q1"]);
  assert.deepEqual([op.items[3].count, op.items[3].pct, op.items[3].evidence.length], [5, 20, 2], "two catch-all groups merge");
  assert.equal(op.noiseOnlyGroups, 1);
  assert.match(op.items[0].repText!, /推薦 tapflow/, "the representative quote is looked up by comment_id in the capture");
  assert.equal(buildAnalysisBlocks(src, {}).blocks[0].type === "opinion_overview" && (buildAnalysisBlocks(src, {}).blocks[0] as { items: { label: string }[] }).items[1].label, "乙");
  await withReader(src, async ({ doc, click, openAll }) => {
    const fold = doc.querySelector("[data-block-fold]");
    if (fold) await click(fold);
    const labels = () => [...doc.querySelectorAll("[data-block-opinion]")].map(e => e.querySelector("b, [style]")?.textContent ?? "");
    assert.equal(doc.querySelectorAll("[data-block-opinion]").length, 3);
    assert.equal(Boolean(doc.querySelector("[data-block-low-signal]")), false, "low-signal rows wait behind 「再睇」");
    await openAll();
    const rows = [...doc.querySelectorAll("[data-block-opinion]")];
    assert.equal(rows.length, 4);
    assert.ok(rows[3].hasAttribute("data-block-low-signal"), "the low-signal row comes last");
    const lowLabel = [...rows[3].querySelectorAll<HTMLElement>("span")].find(el => el.textContent === "弱")!;
    const expectedColor = doc.ownerDocument.createElement("span");
    expectedColor.style.color = tokens.panel.ink3;
    assert.equal(lowLabel.style.color, expectedColor.style.color, "low-signal text uses the dimmed ink token");
    assert.equal(lowLabel.style.fontWeight, "500");
    assert.equal(rows.filter(r => /其他留言/.test(r.textContent!)).length, 1);
    assert.match(rows[0].textContent!, /甲/);
    assert.match(rows[1].textContent!, /AI 乙/);
    assert.ok(labels().length);
    assert.doesNotMatch(doc.textContent!, /general|low_signal|noise_only/);
  }, { blocks: model });
});

test("top comments keep tool context, featured and evidence ids in rev 1 and rev 2", () => {
  const top = (...ids: string[]) => blk("top_comments", { priority: "secondary", order: 2, item_count: ids.length, total_count: ids.length, items: ids.map(id => ({ comment_id: id, author: "u", like_count: 1, text: `text ${id}`, reply_count: 0, evidence: [ref(id, "u")] })) });
  const rev2 = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("t", "https://github.com/a/t", 1, 1, "github_repo", [ref("E2", "x")]), context_comment_id: "E2" }], meta: { featured_comment_ids: ["E1"] } }),
    { ...top("E1", "E2", "X9", "T1"), meta: { excluded_as_duplicate: [{ comment_id: "X9", block: "entity_list", entity_key: "k" }] } },
  ] }));
  const t2 = rev2.blocks.find(b => b.type === "top_comments");
  assert.ok(t2?.type === "top_comments");
  assert.deepEqual(t2.items.map(i => i.id), ["E1", "E2", "X9", "T1"], "backend duplicate metadata never removes a received top row");
  const all = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [entity("t", "https://github.com/a/t", 1, 1, "github_repo", [ref("E1", "x")])], meta: { featured_comment_ids: ["E1"] } }),
    top("E1"),
  ] }));
  assert.deepEqual(all.blocks.map(b => b.type), ["entity_list", "top_comments"]);
  assert.deepEqual(all.omitted, [], "the frontend never invents an all_duplicate note for top comments");
  const rev1 = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [
    blk("entity_list", { items: [entity("t", "https://github.com/a/t", 2, 1, "github_repo", [ref("L1", "x", 3), ref("H1", "y", 40)])] }),
    top("H1", "L1", "UNRELATED"),
  ] }));
  const t1 = rev1.blocks.find(b => b.type === "top_comments");
  assert.ok(t1?.type === "top_comments");
  assert.deepEqual(t1.items.map(i => i.id), ["H1", "L1", "UNRELATED"], "rev 1 context inference changes tool quoting, never the top rows");
});

test("omitted reasons and the placeholder flag read honestly", async () => {
  const empty = fixture({ blocks_version: "v1", blocks: [], blocks_omitted: [{ type: "qa_pairs", reason: "all_duplicate" }, { type: "entity_list", reason: "noise_only" }, { type: "top_comments", reason: "empty" }, { type: "opinion_overview", reason: "something_new" }] });
  await withReader(empty, async ({ doc }) => {
    assert.equal(doc.querySelector('[data-block-omitted="qa_pairs"]')?.textContent, "大家問咩：留言已喺上面顯示，唔重複");
    assert.equal(doc.querySelector('[data-block-omitted="entity_list"]')?.textContent, "推介工具：只有標記類留言，冇內容可引用");
    assert.equal(doc.querySelector('[data-block-omitted="top_comments"]')?.textContent, "熱門留言：未有內容");
    assert.equal(doc.querySelector('[data-block-omitted="opinion_overview"]')?.textContent, "大家點睇：未有內容", "unknown reasons read as empty");
    assert.doesNotMatch(doc.textContent!, /all_duplicate|noise_only|something_new/);
  });
  const withNotes = fixture({ blocks_version: "v1", noise: { ...noise, by_flag: { placeholder: 2 } }, blocks: [blk("entity_list", { items: [entity("t", "https://github.com/a/t", 1, 1)] }),
    blk("noise_summary", { priority: "secondary", order: 2, items: [{ flag: "placeholder", count: 2, comment_ids: ["P1", "P2"] }], meta: { audience_count: 13, noise_count: 2, noise_share: 0.15, by_flag: { placeholder: 2 } } })],
  blocks_omitted: [{ type: "opinion_overview", reason: "noise_only" }, { type: "qa_pairs", reason: "empty" }] });
  await withReader(withNotes, async ({ doc }) => {
    assert.equal(doc.querySelectorAll("[data-block-omitted-notes] li").length, 1, "only the informative reasons are listed next to blocks");
    assert.equal(doc.querySelector("[data-block-omitted-notes] li")?.textContent, "大家點睇：只有標記類留言，冇內容可引用");
    assert.match(doc.querySelector('[data-block-fold-line]')!.textContent!, /引用帖佔位 2/);
  });
});

test("Q&A reader groups: 3 groups, original post first, reply-structure line, post permalink used as-is (threads.net kept)", async () => {
  const src = fixture({ blocks_version: "v1", blocks: [blk("qa_pairs", { item_count: 4, total_count: 4, items: [
    { question: { comment_id: "R11", author: "u1", like_count: 1, permalink: "https://www.threads.com/@u1/post/R11", text: "有冇 Windows 版？" }, status: "answered", answers: [{ comment_id: "A1", author: "a", like_count: 1, text: "有" }], answer_count: 1, evidence: [] },
    { question: { comment_id: "R12", author: "u2", like_count: 1, permalink: "https://www.threads.com/@u2/post/R12", text: "第二條？" }, status: "unanswered", answers: [], answer_count: 0, evidence: [] },
    { question: { comment_id: "R13", author: "u3", like_count: 1, permalink: "https://www.threads.com/@u3/post/R13", text: "第三條？" }, status: "replies_not_captured", answers: [], answer_count: 0, evidence: [] },
    { question: { comment_id: null, is_post: true, author: "op", text: "原帖問題？", like_count: null }, status: "unanswered", answers: [], answer_count: 0, evidence: [] },
  ], meta: { status_counts: { answered_by_op: 0, answered: 1, unanswered: 2, replies_not_captured: 1, unknown: 0 }, reply_structure_known: false, post_is_question: true } })] });
  src.descriptor = { ...src.descriptor, post_url: "https://www.threads.net/@op/post/NETPOST0001" };
  const model = buildAnalysisBlocks(src);
  const qa = model.blocks[0];
  assert.ok(qa.type === "qa_pairs");
  assert.equal(qa.items[0].question.isPost, true);
  assert.equal(qa.items[0].question.href, "https://www.threads.net/@op/post/NETPOST0001", "the validated descriptor URL is used as-is; no threads.com rewrite");
  assert.equal(qa.replyStructureKnown, false);
  await withReader(src, async ({ doc }) => {
    assert.equal(doc.querySelector("[data-block-qa-summary]")?.textContent, "有答 1 · 未答 2 · 睇唔到回覆 1");
    assert.match(doc.querySelector("[data-block-qa-structure]")!.textContent!, /未有完整回覆結構/);
    assert.equal(doc.querySelector('[data-block-qa] [data-reading-ref-site="post"]')?.getAttribute("href"), "https://www.threads.net/@op/post/NETPOST0001");
    assert.doesNotMatch(doc.textContent!, /unanswered|replies_not_captured/);
  });
});

test("the lead sentence prefers the stored AI gist, else a template over the first primary block, else nothing", () => {
  const src = fixture({ blocks_version: "v1", noise, blocks });
  const templated = buildAnalysisBlocks(src);
  assert.deepEqual(templated.lead?.main, { kind: "entity", name: "jo-duchan/tapflow", mentions: 3, total: 5 });
  assert.equal(templated.lead?.sub?.kind, "qa");
  assert.equal(templated.lead?.ai, "");
  assert.equal(buildAnalysisBlocks(src, {}, " 先拆細任務。 ").lead?.ai, "先拆細任務。");
  assert.deepEqual(templated.source, { audience: 13, noiseShare: 0.4615 });
  // No data, no lead.
  assert.equal(buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [] })).lead, null);
  assert.equal(buildAnalysisBlocks(fixture(null)).lead, null);
});

test("entity export status is a view-local state; the shell's own message is appended, never compared", async () => {
  let copied = "";
  await withReader(fixture({ blocks_version: "v1", blocks }), async ({ doc, click }) => {
    assert.equal(Boolean(doc.querySelector("[data-block-export-preview]")), false);
    await click(doc.querySelector('[data-block-export="markdown"]')!);
    const status = doc.querySelector("[data-block-export-status]")!.textContent!;
    assert.match(status, /^Markdown（3 項）/);
    assert.match(status, /已複製$/);
    assert.match(copied, /^# 推介工具/);
    assert.equal(doc.querySelector("[data-block-export-preview]")?.getAttribute("data-block-export-preview"), "markdown");
  }, { copyStatus: "已複製", onCopy: (text: string) => { copied = text; } });
});

test("blocks motion is opacity/translateY only and exists only under the no-preference media query", () => {
  const motion = readFileSync(new URL("../src/ui/motion.ts", import.meta.url), "utf8");
  const media = motion.indexOf("@media (prefers-reduced-motion: no-preference)", motion.indexOf("export const DLENS_MOTION_CSS"));
  const rule = motion.indexOf("[data-block-arrival] { animation: dlens-block-rise");
  assert.ok(media > 0 && rule > media, "the arrival animation sits inside the no-preference block");
  assert.match(motion, /@keyframes dlens-block-rise \{ from \{ opacity: 0; transform: translateY\(\$\{tokens\.panel\.blocks\.risePx\}px\); \} to \{ opacity: 1; transform: none; \} \}/);
  const view = readFileSync(new URL("../src/ui/AnalysisBlocks.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /animation:|transition:|@keyframes/, "the component itself owns no motion");
});

test("the reader keeps the four-cell reading without blocks and explains empty or failed blocks", async () => {
  await withReader(fixture(null), async ({ doc }) => {
    assert.ok(doc.querySelector("[data-reader-entries]"));
    assert.equal(Boolean(doc.querySelector("[data-analysis-blocks]")), false);
    assert.equal(Boolean(doc.querySelector("[data-blocks-error], [data-blocks-empty], [data-post-type]")), false);
  });
  await withReader(fixture({ blocks_error: "ValueError" }), async ({ doc }) => {
    assert.ok(doc.querySelector("[data-blocks-error]"));
    assert.ok(doc.querySelector("[data-reader-entries]"));
    assert.doesNotMatch(doc.textContent!, /ValueError/);
  });
  await withReader(fixture({ blocks_version: "v1", blocks: [], blocks_omitted: [{ type: "qa_pairs", reason: "empty" }] }), async ({ doc }) => {
    assert.equal(Boolean(doc.querySelector("[data-reader-entries]")), false);
    assert.equal(doc.querySelector('[data-block-omitted="qa_pairs"]')?.textContent, "大家問咩：未有內容");
  });
});

const topBlock = (ids: string[], extra: Record<string, unknown> = {}) => blk("top_comments", {
  item_count: ids.length, total_count: ids.length,
  items: ids.map(id => ({ comment_id: id, author: "reader", like_count: 1, text: `完整留言 ${id}`, reply_count: 0, evidence: [ref(id, "reader")] })),
  ...extra,
});

test("top priority: the second lead sentence quotes the first top row and the same row stays in the block", () => {
  for (const revision of [undefined, 2]) {
    const source = fixture({ blocks_version: "v1", ...(revision ? { blocks_revision: revision } : {}), blocks: [
      blk("entity_list", { items: [entity("tool", "https://github.com/a/tool", 1, 1, "github_repo", [ref("ENTITY", "dev")])] }),
      topBlock(["ENTITY", "LEAD", "KEPT"], { order: 2 }),
    ] });
    const before = JSON.stringify(source);
    const model = buildAnalysisBlocks(source);
    assert.equal(JSON.stringify(source), before, "lead and dedup projection never mutate the captured input");
    assert.deepEqual(model.lead?.sub, { kind: "top", author: "reader", text: "完整留言 ENTITY", likes: 1 });
    const top = model.blocks.find(b => b.type === "top_comments");
    assert.ok(top?.type === "top_comments");
    assert.deepEqual(top.items.map(i => i.id), ["ENTITY", "LEAD", "KEPT"], "the lead deliberately repeats the first top row");
    assert.equal(model.omitted.some(o => o.type === "top_comments" && o.reason === "all_duplicate"), false);
    const dom = new JSDOM(renderToStaticMarkup(<AnalysisBlocksView model={model} />));
    try {
      assert.match(dom.window.document.querySelector("[data-block-lead-sub]")!.textContent!, /完整留言 ENTITY/);
      assert.match(dom.window.document.querySelector('[data-block-top="ENTITY"]')!.textContent!, /完整留言 ENTITY/);
      assert.equal(dom.window.document.querySelector('[data-block-omitted="top_comments"]'), null);
    } finally { dom.window.close(); }
  }
});

test("top priority: entity extra evidence excludes every shown top id while its original context link remains", async () => {
  for (const revision of [undefined, 2]) {
    const source = fixture({ blocks_version: "v1", ...(revision ? { blocks_revision: revision } : {}), blocks: [
      blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 3, 6, "github_repo", [
        { ...ref("MAIN", "dev", 5), text: "主要推介內容" },
        { ...ref("EXTRA", "extra", 1), text: "熱門補充內容" },
        { ...ref("SUMMARY", "summary", 0), text: "摘要使用嘅內容" },
        { ...ref("PRIVATE", "private", 0), text: "尚未顯示嘅補充內容" },
      ]), ...(revision ? { context_comment_id: "LINK_ONLY" } : {}) }] }),
      topBlock(["MAIN", "EXTRA", "LINK_ONLY", "KEPT"], { order: 2, priority: "secondary" }),
    ] });
    source.latestCapture!.result!.comments = [...comments, { comment_id: "LINK_ONLY", author: "linker", text: "只有 context id 嘅留言", like_count: 2, parent_comment_id: "ROOT", reply_count: 0, url: "https://www.threads.com/@linker/post/LINK_ONLY" }];
    const before = JSON.stringify(source);
    const model = buildAnalysisBlocks(source);
    assert.equal(JSON.stringify(source), before, "entity evidence projection never mutates the captured input");
    const top = model.blocks.find(b => b.type === "top_comments");
    assert.ok(top?.type === "top_comments");
    assert.deepEqual(top.items.map(i => i.id), ["MAIN", "EXTRA", "LINK_ONLY", "KEPT"]);
    const tools = model.blocks.find(b => b.type === "entity_list");
    assert.ok(tools?.type === "entity_list");
    assert.deepEqual(tools.items[0].extra.map(e => e.commentId), ["PRIVATE"], "the VM owns extra evidence suppression");
    const contextId = revision ? "LINK_ONLY" : "MAIN";
    assert.equal(tools.items[0].link?.commentId, contextId);
    await withReader(source, async ({ doc, click }) => {
      const tool = doc.querySelector('[data-block-entity="https://github.com/a/tool"]')!;
      assert.ok(tool.querySelector(`[data-reading-ref-site="${contextId}"]`), "a context source link is kept even when its quote yields");
      await click(tool.querySelector("[data-block-row-toggle]")!);
      const detail = tool.querySelector("[data-block-detail]")!;
      assert.deepEqual([...detail.querySelectorAll("[data-reading-ref-site]")].map(e => e.getAttribute("data-reading-ref-site")), ["PRIVATE"]);
      assert.doesNotMatch(detail.textContent!, /主要推介內容|熱門補充內容|只有 context id 嘅留言/);
    }, { blocks: model });
  }
});

test("top priority: the only top row stays beside its lead and creates no all_duplicate note", () => {
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [topBlock(["ONLY"])] }));
  assert.equal(model.mode, "blocks", "the lead and its top comment remain renderable together");
  assert.equal(model.lead?.main?.kind, "top");
  assert.deepEqual(model.blocks.map(b => b.type), ["top_comments"]);
  assert.deepEqual(model.omitted, []);
  const dom = new JSDOM(renderToStaticMarkup(<AnalysisBlocksView model={model} />));
  try {
    const doc = dom.window.document;
    assert.match(doc.querySelector("[data-block-lead]")!.textContent!, /完整留言 ONLY/);
    assert.match(doc.querySelector('[data-block-top="ONLY"]')!.textContent!, /完整留言 ONLY/);
    assert.equal(doc.querySelector('[data-block-omitted="top_comments"]'), null);
  } finally { dom.window.close(); }
});

test("top priority: an AI gist keeps all top rows too", () => {
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [topBlock(["VISIBLE", "NEXT"])] }), {}, "AI 一句話");
  assert.equal(model.lead?.ai, "AI 一句話");
  const top = model.blocks[0];
  assert.ok(top.type === "top_comments");
  assert.deepEqual(top.items.map(i => i.id), ["VISIBLE", "NEXT"]);
});

test("rev 2 excluded top comments are restored from capture, sorted stably by likes with null last, and missing ids are skipped", () => {
  const received = [
    { ...ref("TIE_B", "reader", 20), text: "後端同讚 B", reply_count: 0, evidence: [ref("TIE_B", "reader", 20)] },
    { ...ref("TIE_A", "reader", 20), text: "後端同讚 A", reply_count: 0, evidence: [ref("TIE_A", "reader", 20)] },
    { ...ref("UNKNOWN", "reader"), like_count: null, text: "後端未知讚", evidence: [{ ...ref("UNKNOWN", "reader"), like_count: null }] },
    { ...ref("ZERO", "reader", 0), text: "零讚", reply_count: 0, evidence: [ref("ZERO", "reader", 0)] },
  ];
  const excluded = ["DQa1tapF0w1", "SOURCE00001", "DQa3ytdlp01", "c-unknown", "missing", "TIE_B"];
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("top_comments", {
    item_count: received.length, total_count: received.length, items: received,
    meta: { excluded_as_duplicate: excluded.map(comment_id => ({ comment_id, block: "entity_list", entity_key: "tool" })) },
  })] });
  source.latestCapture!.result!.comments = [
    { comment_id: "DQa1tapF0w1", author: "@dev_a", text: "capture 熱門甲", like_count: 40, reply_count: 0, is_op: true, permalink: "https://www.threads.com/@permalink/post/PERMALINK01", url: "https://www.threads.com/@ignored/post/IGNORED0001" },
    { comment_id: "c-source-alias", source_comment_id: "SOURCE00001", author: "@alias", text: "由 source id 找到", like_count: 31, url: "https://www.threads.net/@captured/post/CAPTURED02" },
    { comment_id: "DQa3ytdlp01", author: "@kenji.tw", text: "重建短碼網址", like_count: 31, reply_count: 3, is_op: false },
    { comment_id: "c-unknown", author: "@unknown", text: "未知讚嘅補回留言", like_count: null, is_op: "true" },
  ] as never;
  const before = JSON.stringify(source);
  const model = buildAnalysisBlocks(source);
  assert.equal(JSON.stringify(source), before, "restoring and sorting never mutate capture comments or backend items");
  const top = model.blocks[0];
  assert.ok(top?.type === "top_comments");
  assert.deepEqual(top.items.map(i => i.id), ["DQa1tapF0w1", "SOURCE00001", "DQa3ytdlp01", "TIE_B", "TIE_A", "ZERO", "UNKNOWN", "c-unknown"]);
  assert.deepEqual([top.shown, top.total, top.truncated], [8, 8, false], "only successfully restored, previously absent rows count");
  const restored = top.items.filter(i => excluded.includes(i.id) && i.id !== "TIE_B");
  assert.deepEqual(restored.map(i => [i.text, i.author, i.likes, i.replies, i.isOp, i.links]), [
    ["capture 熱門甲", "dev_a", 40, 0, true, []],
    ["由 source id 找到", "alias", 31, null, false, []],
    ["重建短碼網址", "kenji.tw", 31, 3, false, []],
    ["未知讚嘅補回留言", "unknown", null, null, false, []],
  ]);
  assert.deepEqual(restored.map(i => i.evidence.map(e => [e.commentId, e.href])), [
    [["DQa1tapF0w1", "https://www.threads.com/@permalink/post/PERMALINK01"]],
    [["SOURCE00001", "https://www.threads.com/@captured/post/CAPTURED02"]],
    [["DQa3ytdlp01", "https://www.threads.com/@kenji.tw/post/DQa3ytdlp01"]],
    [["c-unknown", null]],
  ]);
  assert.deepEqual(model.lead?.main, { kind: "top", author: "dev_a", text: "capture 熱門甲", likes: 40 }, "the gist uses the first merged and sorted row");
});

test("a restored top row clears a stale backend all_duplicate note; an unrecoverable backend note remains", () => {
  for (const found of [true, false]) {
    const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks_revision: 2,
      blocks: [topBlock([], { meta: { excluded_as_duplicate: [{ comment_id: found ? "DQa1tapF0w1" : "missing", block: "entity_list", entity_key: "tool" }] } })],
      blocks_omitted: [{ type: "top_comments", reason: "all_duplicate" }],
    }));
    assert.deepEqual(model.omitted, found ? [] : [{ type: "top_comments", reason: "all_duplicate" }]);
    assert.equal(model.blocks.some(b => b.type === "top_comments"), found);
  }
});

test("rev 2 tools keep their own description and original source link while top comments suppress the context quote", async () => {
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 40, "github_repo", [ref("DQa1tapF0w1", "dev_a", 40)]), context: "熱門留言嘅推介原句", context_comment_id: "DQa1tapF0w1", enrichment: { source: "github_api", status: "ok", description: "工具本身嘅描述", stars: 120, language: "Go" } }] }),
    topBlock(["DQa1tapF0w1"], { order: 2 }),
  ] });
  const model = buildAnalysisBlocks(source);
  const tools = model.blocks[0];
  assert.ok(tools.type === "entity_list");
  const row = tools.items[0];
  assert.deepEqual([row.summary, row.quote], ["工具本身嘅描述", ""]);
  assert.equal(row.link?.commentId, "DQa1tapF0w1");
  assert.equal(row.link?.href, "https://www.threads.com/@dev_a/post/DQa1tapF0w1");
  await withReader(source, async ({ doc, click }) => {
    const tool = doc.querySelector('[data-block-entity="https://github.com/a/tool"]')!;
    assert.equal(tool.querySelector("p")?.textContent, "工具本身嘅描述");
    assert.equal(tool.querySelector('[data-reading-ref-site="DQa1tapF0w1"]')?.textContent, "睇原留言 ↗");
    await click(tool.querySelector("[data-block-row-toggle]")!);
    assert.doesNotMatch(tool.querySelector("[data-block-detail]")!.textContent!, /推介原句|熱門留言嘅推介原句/);
  }, { blocks: model });
});

for (const revision of [undefined, 2]) {
  test(`rev ${revision ?? 1} context summaries yield to top comments and use the next non-shown evidence text`, () => {
    const alternative = revision ? ref("R7", "carol", 5) : { ...ref("R7", "carol", 5), text: "證據內嘅另一段文字" };
    const source = fixture({ blocks_version: "v1", ...(revision ? { blocks_revision: revision } : {}), blocks: [
      blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 2, 45, "github_repo", [alternative, ref("DQa1tapF0w1", "dev_a", 40)]), context: "原本引用熱門留言", ...(revision ? { context_comment_id: "DQa1tapF0w1", enrichment: { status: "ok", source: "github_api", description: null, description_dropped: "same_as_context" } } : {}) }] }),
      topBlock(["DQa1tapF0w1"], { order: 2 }),
    ] });
    const tools = buildAnalysisBlocks(source).blocks[0];
    assert.ok(tools.type === "entity_list");
    assert.deepEqual([tools.items[0].summary, tools.items[0].quote], [revision ? "點樣確定資料未過時？" : "證據內嘅另一段文字", ""]);
    assert.equal(tools.items[0].link?.commentId, "DQa1tapF0w1", "rev 1 uses the most-liked evidence, rev 2 uses context_comment_id, even when the evidence order differs");
  });

  test(`rev ${revision ?? 1} context summaries become empty without an alternative and render no empty secondary paragraph`, async () => {
    const source = fixture({ blocks_version: "v1", ...(revision ? { blocks_revision: revision } : {}), blocks: [
      blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 40, "github_repo", [ref("DQa1tapF0w1", "dev_a", 40)]), context: "原本引用熱門留言", ...(revision ? { context_comment_id: "DQa1tapF0w1", enrichment: { status: "ok", source: "github_api", description: null, stars: 12 } } : {}) }] }),
      topBlock(["DQa1tapF0w1"], { order: 2 }),
    ] });
    const model = buildAnalysisBlocks(source);
    const tools = model.blocks[0];
    assert.ok(tools.type === "entity_list");
    assert.deepEqual([tools.items[0].summary, tools.items[0].quote], ["", ""]);
    await withReader(source, async ({ doc, click }) => {
      const tool = doc.querySelector('[data-block-entity="https://github.com/a/tool"]')!;
      assert.equal(tool.querySelector("p"), null, "there is no empty secondary p while collapsed");
      assert.match(tool.textContent!, /tool|@dev_a/);
      assert.equal(tool.querySelector('[data-reading-ref-site="DQa1tapF0w1"]')?.textContent, "睇原留言 ↗");
      if (revision) assert.match(tool.querySelector("[data-block-entity-facts]")!.textContent!, /12 星/);
      await click(tool.querySelector("[data-block-row-toggle]")!);
      assert.equal(tool.querySelector("p"), null, "opening detail does not restore a suppressed context quote");
    }, { blocks: model });
  });
}

test("top priority recognizes comment_id and source_comment_id as aliases when suppressing a tool quote", () => {
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 9, "github_repo", [{ ...ref("c-alias", "alias", 9), text: "同一則留言" }]), context: "同一則留言", context_comment_id: "c-alias", enrichment: { status: "ok", source: "github_api", description: "工具描述" } }] }),
    topBlock(["SOURCE00001"], { order: 2 }),
  ] });
  source.latestCapture!.result!.comments = [{ comment_id: "c-alias", source_comment_id: "SOURCE00001", author: "alias", text: "同一則留言", like_count: 9 }] as never;
  const tools = buildAnalysisBlocks(source).blocks[0];
  assert.ok(tools.type === "entity_list");
  assert.equal(tools.items[0].quote, "");
  assert.deepEqual(tools.items[0].extra, []);
  assert.equal(tools.items[0].link?.commentId, "c-alias", "the original source link id is preserved");
});

test("rev 2 fallback tool summaries are not quoted again in expanded evidence", async () => {
  const summary = "Stirling-PDF 可以批次合併同壓縮 PDF，毋須上傳文件。";
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("Stirling-PDF", "https://github.com/Stirling-Tools/Stirling-PDF", 5, 49, "github_repo", [
      ref("DQa1tapF0w1", "dev_a", 40),
      { ...ref("SUMMARY", "pdf.celia", 5), text: summary },
      { ...ref("SUMMARY_COPY", "another", 2), text: `  ${summary}\n` },
      { ...ref("UNIQUE", "reader", 1), text: "另外仲可以分拆頁面。" },
      ref("LINK_EXTRA", "linker", 1),
    ]), context: "熱門留言嘅工具推介", context_comment_id: "DQa1tapF0w1", enrichment: { source: "github_api", status: "ok", description: null } }] }),
    topBlock(["DQa1tapF0w1"], { order: 2 }),
  ] });
  const model = buildAnalysisBlocks(source);
  const tools = model.blocks[0];
  assert.ok(tools.type === "entity_list");
  assert.deepEqual([tools.items[0].summary, tools.items[0].quote], [summary, ""]);
  assert.deepEqual(tools.items[0].extra.map(e => e.commentId), ["UNIQUE", "LINK_EXTRA"], "summary evidence and matching text are excluded; link-only evidence remains");
  assert.equal(tools.items[0].link?.commentId, "DQa1tapF0w1");
  await withReader(source, async ({ doc, click }) => {
    const tool = doc.querySelector('[data-block-entity="https://github.com/Stirling-Tools/Stirling-PDF"]')!;
    const originalLink = tool.querySelector('[data-reading-ref-site="DQa1tapF0w1"]')!;
    assert.equal(originalLink.textContent, "睇原留言 ↗");
    assert.equal(originalLink.getAttribute("href"), "https://www.threads.com/@dev_a/post/DQa1tapF0w1");
    await click(tool.querySelector("[data-block-row-toggle]")!);
    assert.equal(tool.textContent!.split(summary).length - 1, 1);
    assert.match(tool.querySelector("[data-block-detail]")!.textContent!, /另外仲可以分拆頁面。/);
    assert.equal(tool.querySelectorAll('[data-reading-ref-site="SUMMARY"], [data-reading-ref-site="SUMMARY_COPY"]').length, 0);
  }, { blocks: model });
});

for (const revision of [undefined, 2]) {
  test(`rev ${revision ?? 1} tool extra evidence excludes text matching the summary or context quote`, async () => {
    const context = "留言內嘅工具用法";
    const description = "工具本身嘅用途";
    const source = fixture({ blocks_version: "v1", ...(revision ? { blocks_revision: revision } : {}), blocks: [
      blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 4, 48, "github_repo", [
        { ...ref("CONTEXT", "dev", 40), text: context },
        { ...ref("CONTEXT_COPY", "copy", 5), text: `  ${context}\n` },
        ...(revision ? [{ ...ref("DESCRIPTION_COPY", "description", 2), text: `\n${description}  ` }] : []),
        { ...ref("UNIQUE", "reader", 1), text: "另一段有用嘅補充" },
      ]), context, ...(revision ? { context_comment_id: "CONTEXT", enrichment: { source: "github_api", status: "ok", description } } : {}) }] }),
    ] });
    const model = buildAnalysisBlocks(source);
    const tools = model.blocks[0];
    assert.ok(tools.type === "entity_list");
    assert.deepEqual([tools.items[0].summary, tools.items[0].quote], revision ? [description, context] : [context, ""]);
    assert.deepEqual(tools.items[0].extra.map(e => e.commentId), ["UNIQUE"]);
    assert.equal(tools.items[0].link?.commentId, "CONTEXT");
    await withReader(source, async ({ doc, click }) => {
      const tool = doc.querySelector('[data-block-entity="https://github.com/a/tool"]')!;
      await click(tool.querySelector("[data-block-row-toggle]")!);
      assert.equal(tool.textContent!.split(context).length - 1, 1);
      if (revision) assert.equal(tool.textContent!.split(description).length - 1, 1);
      assert.match(tool.querySelector("[data-block-detail]")!.textContent!, /另一段有用嘅補充/);
    }, { blocks: model });
  });
}

for (const replies of [0, null, 3]) {
  test(`top comments render a reply count only for positive numbers: ${replies}`, async () => {
    const source = fixture({ blocks_version: "v1", blocks: [topBlock(["REPLY_COUNT"], {
      items: [{ comment_id: "REPLY_COUNT", author: "reader", text: "一則熱門留言", like_count: 1, reply_count: replies, evidence: [ref("REPLY_COUNT", "reader")] }],
    })] });
    const model = buildAnalysisBlocks(source);
    const top = model.blocks[0];
    assert.ok(top.type === "top_comments");
    assert.equal(top.items[0].replies, replies, "the VM keeps zero and unknown values unchanged");
    await withReader(source, async ({ doc }) => {
      const row = doc.querySelector('[data-block-top="REPLY_COUNT"]')!;
      const count = row.querySelector(".lucide-message-circle")?.parentElement;
      assert.equal(Boolean(count), replies === 3);
      if (replies === 3) assert.equal(count?.textContent, "3");
    }, { blocks: model });
  });
}

const opinionItem = (key: number, evidence: unknown[], extra: Record<string, unknown> = {}) => ({ cluster_key: key, label: `意見 ${key}`, keywords: ["關鍵字"], quant_keywords: ["備用關鍵字"], comment_count: 2, substantive_count: 2, noise_count: 0, size_share: 0.5, evidence, ...extra });

test("opinion representatives prefer a non-shown quote with text, then keep a quote even when every candidate is repeated", async () => {
  const missing = ref("NO_TEXT", "missing");
  const top = { ...ref("TOP", "top"), text: "熱門內容" };
  const tool = { ...ref("TOOL", "tool"), text: "工具推介內容" };
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 1, "github_repo", [tool]), context: "工具推介內容", context_comment_id: "TOOL", enrichment: { source: "github_api", status: "ok", description: "工具描述" } }] }),
    topBlock(["TOP"], { order: 2 }),
    blk("opinion_overview", { order: 3, item_count: 2, total_count: 2, items: [
      opinionItem(0, [missing, top, tool, ref("R7", "carol", 5)]),
      opinionItem(1, [missing, top, tool]),
    ] }),
  ] });
  const model = buildAnalysisBlocks(source);
  const opinions = model.blocks.find(b => b.type === "opinion_overview");
  assert.ok(opinions?.type === "opinion_overview");
  assert.deepEqual(opinions.items.map(row => [row.rep?.commentId, row.repText]), [["R7", "點樣確定資料未過時？"], ["TOP", "熱門內容"]]);
  await withReader(source, async ({ doc }) => {
    assert.deepEqual([...doc.querySelectorAll("[data-block-opinion] > p")].map(e => e.textContent), ["「點樣確定資料未過時？」", "「熱門內容」"]);
  }, { blocks: model });
});

test("an unquoted tool context link does not exclude an opinion candidate that has text", () => {
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 1, "github_repo", [ref("LINK_ONLY", "linked")]), context: "", context_comment_id: "LINK_ONLY", enrichment: { status: "ok", source: "github_api", description: "工具描述" } }] }),
    blk("opinion_overview", { order: 2, items: [opinionItem(0, [{ ...ref("LINK_ONLY", "linked"), text: "意見裡先有嘅實際文字" }, { ...ref("OTHER", "other"), text: "另一則意見" }])] }),
  ] });
  const opinions = buildAnalysisBlocks(source).blocks[1];
  assert.ok(opinions.type === "opinion_overview");
  assert.deepEqual([opinions.items[0].rep?.commentId, opinions.items[0].repText], ["LINK_ONLY", "意見裡先有嘅實際文字"]);
});

test("an opinion without any evidence text keeps its first source link and keyword secondary line", async () => {
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("opinion_overview", { items: [opinionItem(0, [ref("LINK_ONLY", "linked"), ref("ALSO_EMPTY", "empty")])] })] });
  const model = buildAnalysisBlocks(source);
  const opinions = model.blocks[0];
  assert.ok(opinions.type === "opinion_overview");
  assert.deepEqual([opinions.items[0].rep?.commentId, opinions.items[0].repText], ["LINK_ONLY", null]);
  await withReader(source, async ({ doc }) => {
    const row = doc.querySelector("[data-block-opinion]")!;
    assert.equal(row.querySelector("p")?.textContent, "關鍵字、備用關鍵字");
    assert.equal(row.querySelector('[data-reading-ref-site="LINK_ONLY"]')?.textContent, "睇原留言 ↗");
  }, { blocks: model });
});

for (const type of ["entity_list", "opinion_overview", "qa_pairs", "top_comments"] as const) {
  test(`regression 3.1: ${type} offers one honest count while received rows are folded`, async () => {
    const received = type === "entity_list" ? 8 : 5;
    const rows = Array.from({ length: received }, (_, i) => type === "entity_list"
      ? entity(`tool-${i}`, `https://github.com/a/tool-${i}`, received - i, 1)
      : type === "opinion_overview"
        ? { cluster_key: i, label: `意見 ${i}`, keywords: ["詞"], comment_count: 1, substantive_count: 1, noise_count: 0, size_share: 1 / received, evidence: [] }
        : type === "top_comments"
          ? { ...ref(`TOP${i}`, "reader"), text: `熱門留言 ${i}`, reply_count: 0, evidence: [ref(`TOP${i}`, "reader")] }
          : { question: { ...ref(`Q${i}`, "asker"), text: `問題 ${i}？` }, status: "unanswered", answers: [], answer_count: 0, evidence: [] });
    const block = blk(type, { items: rows, item_count: received, total_count: received + 2, truncated: true });
    await withReader(fixture({ blocks_version: "v1", blocks: [block] }), async ({ doc, click }) => {
      const section = doc.querySelector(`[data-analysis-block="${type}"]`)!;
      const fold = section.querySelector("[data-block-fold]");
      if (fold) await click(fold);
      const more = section.querySelector<HTMLElement>("[data-block-more]");
      assert.ok(more, "every row block exposes its local fold button");
      assert.equal(more.textContent, `再睇 ${received - 3} 個`);
      if (type === "top_comments") {
        assert.equal(section.querySelectorAll("[data-block-top]").length, tokens.panel.blocks.firstItems);
        assert.equal(section.querySelector("header > span")?.textContent, String(received + 2));
      }
      assert.equal(section.querySelector("[data-block-truncated]")?.textContent, undefined, "a local more button owns the only hidden count");
      await click(more);
      assert.equal(more.textContent, "收起");
      assert.equal(section.querySelector("[data-block-truncated]")?.textContent, `仲有 2 項未列出（共 ${received + 2} 項）`);
      if (type === "top_comments") {
        assert.equal(section.querySelectorAll("[data-block-top]").length, received);
        assert.equal(section.querySelectorAll("[data-block-truncated]").length, 1, "only Rows renders the backend hidden count");
      }
      await click(more);
      if (type === "top_comments") assert.equal(section.querySelectorAll("[data-block-top]").length, tokens.panel.blocks.firstItems);
      assert.equal(section.querySelector("[data-block-truncated]")?.textContent, undefined, "folding restores a single local hidden count");
    });
  });
}

test("regression 3.1: backend truncation is visible immediately when every received row fits", async () => {
  await withReader(fixture({ blocks_version: "v1", blocks: [blk("entity_list", { item_count: 2, total_count: 5, truncated: true, items: [entity("a", "https://github.com/a/a", 1, 1), entity("b", "https://github.com/a/b", 1, 1)] })] }), async ({ doc }) => {
    assert.equal(Boolean(doc.querySelector("[data-block-more]")), false);
    assert.equal(doc.querySelector("[data-block-truncated]")?.textContent, "仲有 3 項未列出（共 5 項）");
  });
});

test("regression 3.1: a GitHub filter cannot imply every received entity is visible", async () => {
  const items = Array.from({ length: 8 }, (_, i) => entity(`tool-${i}`, i < 2 ? `https://github.com/a/tool-${i}` : `https://example.com/tool-${i}`, 8 - i, 1, i < 2 ? "github_repo" : "web"));
  await withReader(fixture({ blocks_version: "v1", blocks: [blk("entity_list", { item_count: 8, total_count: 10, truncated: true, items })] }), async ({ doc, click }) => {
    assert.equal(doc.querySelector("[data-block-more]")?.textContent, "再睇 5 個");
    assert.equal(Boolean(doc.querySelector("[data-block-truncated]")), false);
    await click(doc.querySelector('[data-block-entity-sort="github"]')!);
    assert.equal(doc.querySelectorAll("[data-block-entity]").length, 2);
    assert.equal(Boolean(doc.querySelector("[data-block-more]")), false);
    assert.equal(Boolean(doc.querySelector("[data-block-truncated]")), false, "filtered rows are not all received rows");
    await click(doc.querySelector('[data-block-entity-sort="mentions"]')!);
    await click(doc.querySelector("[data-block-more]")!);
    assert.equal(doc.querySelectorAll("[data-block-entity]").length, 8);
    assert.equal(doc.querySelector("[data-block-truncated]")?.textContent, "仲有 2 項未列出（共 10 項）");
  });
});

test("regression 3.3: full-width parentheses and their immediate comma stay in nowrap spans in both lead lines", () => {
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [
    blk("entity_list", { items: [entity("tool", "https://github.com/a/tool", 3, 1)] }),
    blk("entity_list", { id: "second-entity", order: 2, items: [entity("other", "https://github.com/a/other", 2, 1)] }),
  ] }), {}, "先睇（完整一句），再睇（第二句）及（第三句），");
  const doc = new JSDOM(renderToStaticMarkup(<AnalysisBlocksView model={model} />)).window.document;
  const lead = doc.querySelector("[data-block-lead]")!;
  const main = lead.querySelector("p")!;
  assert.equal(main.textContent, "先睇（完整一句），再睇（第二句）及（第三句），");
  assert.deepEqual([...main.querySelectorAll("span")].map(s => [s.textContent, s.style.whiteSpace]), [["（完整一句），", "nowrap"], ["（第二句）", "nowrap"], ["（第三句），", "nowrap"]]);
  assert.deepEqual([...lead.querySelectorAll("[data-block-lead-sub] span")].map(s => [s.textContent, (s as HTMLElement).style.whiteSpace]), [["（2 人提），", "nowrap"]]);
});

test("rev 2 null and same_as_context descriptions fall back once; every non-ok status hides enrichment facts and enums", async () => {
  const enrichmentCases = [
    { status: "ok", description: null },
    { status: "ok", description: "重複描述不應顯示", description_dropped: "same_as_context" },
    ...["not_found", "rate_limited", "error", "skipped"].map(status => ({ status, description: "失敗描述不應顯示", stars: 999, language: "失敗語言", site_name: "失敗網站", reason: "provider_reason" })),
  ];
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("entity_list", {
    item_count: enrichmentCases.length, total_count: enrichmentCases.length,
    items: enrichmentCases.map((enrichment, i) => ({ ...entity(`fallback-${i}`, `https://github.com/a/fallback-${i}`, 1, 1), context: `原留言內容 ${i}`, enrichment: { source: "github_api", ...enrichment } })),
  })] });
  const model = buildAnalysisBlocks(source);
  const block = model.blocks[0];
  assert.ok(block.type === "entity_list");
  assert.deepEqual(block.items.map(row => [row.summary, row.quote, row.repo, row.site]), enrichmentCases.map((_, i) => [`原留言內容 ${i}`, "", null, ""]));
  await withReader(source, async ({ doc, openAll }) => {
    await openAll();
    assert.equal(doc.querySelectorAll("[data-block-entity-facts]").length, 0);
    for (let i = 0; i < enrichmentCases.length; i++) {
      const row = doc.querySelector(`[data-block-entity="https://github.com/a/fallback-${i}"]`)!;
      assert.equal(row.textContent!.split(`原留言內容 ${i}`).length - 1, 1, "fallback quote is rendered once");
    }
    assert.doesNotMatch(doc.textContent!, /not_found|rate_limited|error|skipped|same_as_context|provider_reason|不應顯示|失敗語言|失敗網站|999/);
  });
});

test("rows clamp at two lines, expand full text with a token quote bar, and secondary blocks expand in place", async () => {
  const ownSummary = "工具本身嘅完整描述，展開後同樣保留。".repeat(5);
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [
    blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 1, "github_repo", [ref("DQa1tapF0w1", "dev_a")]), enrichment: { status: "ok", source: "github_api", description: ownSummary } }] }),
    topBlock(["TOP"], { order: 2, priority: "secondary" }),
  ] });
  await withReader(source, async ({ doc, click }) => {
    const row = doc.querySelector('[data-block-entity="https://github.com/a/tool"]')!;
    const summary = row.querySelector<HTMLParagraphElement>("p")!;
    assert.equal(summary.textContent, ownSummary);
    assert.equal(summary.style.webkitLineClamp, String(tokens.panel.blocks.clampLines));
    assert.equal(Boolean(row.querySelector("[data-block-detail]")), false);
    await click(row.querySelector("[data-block-row-toggle]")!);
    assert.equal(summary.style.webkitLineClamp, "", "expanded summary is not clamped");
    const detail = row.querySelector<HTMLElement>("[data-block-detail]")!;
    assert.equal(detail.style.borderLeftWidth, `${tokens.panel.blocks.quoteBar}px`);
    assert.match(detail.textContent!, /https:\/\/github.com\/a\/tool/);
    const secondary = doc.querySelector('[data-analysis-block="top_comments"]')!;
    const fold = secondary.querySelector("[data-block-fold]")!;
    assert.equal(secondary.querySelector<HTMLElement>("[data-block-fold-line]")?.style.whiteSpace, "nowrap");
    assert.equal(Boolean(secondary.querySelector("[data-block-top]")), false);
    await click(fold);
    assert.equal(secondary.querySelector("[data-block-top]")?.getAttribute("data-block-top"), "TOP");
    assert.ok(secondary.querySelector("[data-block-arrival]"));
    await click(fold);
    assert.equal(Boolean(secondary.querySelector("[data-block-top]")), false);
  });
});
