import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CollectionAudienceReading } from "../src/ui/CollectionAudienceReading.tsx";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { buildCollectionReaderModel } from "../src/viewmodel/collection-reader.ts";
import { blockEvidenceHref, buildAnalysisBlocks, entityCsv, entityMarkdown, sortEntityRows, type EntityExportLabels } from "../src/viewmodel/analysis-blocks.ts";
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
  { id: "entity_list", type: "entity_list", title_key: "blocks.entity_list.title", order: 1, item_count: 3, total_count: 5, truncated: true, items: [
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
  { id: "qa_pairs", type: "qa_pairs", title_key: "blocks.qa_pairs.title", order: 3, item_count: 4, total_count: 4, truncated: false, items: [
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
  assert.deepEqual(opinion.items.map(i => [i.label, i.generic, i.noiseOnly, i.substantive, i.pct]), [["四日、工作、作量、哈哈", false, false, 4, 50], ["", true, false, 3, 30], ["", true, true, 0, 20]]);
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

test("every block-v1 title, status, sort and post-type label is translated", () => {
  for (const key of ["opinion_overview", "entity_list", "qa_pairs", "top_comments", "noise_summary"]) assert.ok(blockText("zh", `blocks.${key}.title`));
  for (const status of ["answered_by_op", "answered", "unanswered", "replies_not_captured", "unknown"]) assert.ok(blockText("zh", `blocks.qa.status.${status}`) && blockText("en", `blocks.qa.status.${status}`));
  for (const type of ["discussion", "resource", "help", "news", "entertainment", "unknown"]) assert.ok(blockText("zh", `blocks.post_type.${type}`));
  assert.equal(blockText("zh", "blocks.truncated", { n: 2, total: 5 }), "仲有 2 項未列出（共 5 項）");
  assert.equal(blockText("zh", "blocks.no.such.key"), "");
});

function render(source: SessionItem) {
  const sessions = [session("audience", [source], "topic")];
  const model = buildCollectionReaderModel(buildCollectionPosts(sessions)[0], sessions, [], [], {}, 0, "stance")!;
  return new JSDOM(renderToStaticMarkup(<CollectionAudienceReading model={model} onMore={() => {}} onLens={() => {}} onAssign={() => {}} />)).window.document;
}

test("the reader renders blocks in order with evidence links and no legacy lens bar", () => {
  const doc = render(fixture({ blocks_version: "v1", post_type: { type: "resource" }, noise, blocks }));
  assert.deepEqual([...doc.querySelectorAll("[data-analysis-block]")].map(e => e.getAttribute("data-analysis-block")), ["entity_list", "qa_pairs", "noise_summary", "opinion_overview", "top_comments"]);
  assert.equal(doc.querySelector("[data-reader-entries]"), null);
  assert.equal(doc.querySelector("[data-post-type]")?.textContent, "資源");
  const urls = [...doc.querySelectorAll("[data-block-entity-url]")];
  // Default local sort is 最多人提.
  assert.deepEqual(urls.map(u => u.textContent), ["https://github.com/jo-duchan/tapflow", "https://www.youtube.com/watch?v=abc(1)", "javascript:alert(1)"]);
  assert.equal(urls[2].tagName, "SPAN", "non-http URLs are not links");
  const bad = doc.querySelector('[data-block-entity="javascript:alert(1)"]')!;
  assert.match(bad.textContent!, /帖文提及/);
  assert.doesNotMatch(bad.textContent!, /0 人提/);
  assert.equal(bad.querySelector("[data-block-entity-toggle]"), null, "no evidence, nothing to expand");
  const link = doc.querySelector('[data-reading-ref-site="DQa1tapF0w1"]')!;
  assert.equal(link.textContent, "睇原留言 ↗");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(doc.querySelector('[data-reading-ref-site="R7"]')?.getAttribute("href"), "https://www.threads.com/@carol/post/CAPTURED01");
  assert.match(doc.querySelector('[data-block-evidence-id="c-internal-88"]')!.textContent!, /c-internal-88/);
  assert.equal(doc.querySelector("[data-block-truncated]")?.textContent, "仲有 2 項未列出（共 5 項）");
  assert.equal(doc.querySelector('[data-block-qa-status="replies_not_captured"]')?.textContent, "有回覆，但未抓到內容");
  assert.equal(doc.querySelector('[data-block-qa-status="unknown"]')?.textContent, "未能確認有冇回覆");
  assert.equal(doc.querySelector("[data-block-qa-summary]")?.textContent, "作者答咗 1 · 有人答咗 1 · 有回覆，但未抓到內容 1 · 未能確認有冇回覆 1");
  const postQa = doc.querySelector("[data-block-qa]")!;
  assert.equal(postQa.getAttribute("data-block-qa"), "answered", "the post-as-question comes first");
  assert.match(postQa.querySelector("[data-block-qa-post]")!.textContent!, /原帖提問/);
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
  assert.match(opinions[0].textContent!, /四日、工作、作量、哈哈/);
  assert.match(opinions[0].textContent!, /4 則有內容 · 1 則標記/);
  assert.match(opinions[1].textContent!, /其他留言/);
  assert.doesNotMatch(opinions[1].textContent!, /general/);
  assert.ok(opinions[2].querySelector("[data-block-opinion-noise-only]"));
  assert.equal(opinions[2].querySelector("[data-reading-refs]"), null, "a noise-only cluster has nothing to link");
  assert.doesNotMatch(doc.body.textContent!, /replies_not_captured|weird_status|tag_friend|future_widget|blocks\.|general/);
  assert.equal(doc.querySelectorAll("[data-block-noise] [data-reader-reply]").length, 0, "noise stays numbers only");
});

test("the reader keeps the four-cell reading without blocks and explains empty or failed blocks", () => {
  const legacy = render(fixture(null));
  assert.ok(legacy.querySelector("[data-reader-entries]"));
  assert.equal(legacy.querySelector("[data-analysis-blocks]"), null);
  assert.equal(legacy.querySelector("[data-blocks-error], [data-blocks-empty], [data-post-type]"), null);
  const failed = render(fixture({ blocks_error: "ValueError" }));
  assert.ok(failed.querySelector("[data-blocks-error]"));
  assert.ok(failed.querySelector("[data-reader-entries]"));
  assert.doesNotMatch(failed.body.textContent!, /ValueError/);
  const empty = render(fixture({ blocks_version: "v1", blocks: [], blocks_omitted: [{ type: "qa_pairs", reason: "empty" }] }));
  assert.equal(empty.querySelector("[data-reader-entries]"), null);
  assert.equal(empty.querySelector('[data-block-omitted="qa_pairs"]')?.textContent, "大家問咩：未有內容");
});
