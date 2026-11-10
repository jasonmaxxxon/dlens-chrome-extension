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
  ({ key: url, name, url, domain: new URL(url).hostname.replace(/^www\./, ""), kind, mention_count, recommenders: ["dev_a"], total_likes, context: `${name} 描述`, in_post: false, mentioned_by_op: false, evidence });
const blocks = [
  { id: "noise_summary", type: "noise_summary", title_key: "blocks.noise_summary.title", order: 4, items: [], meta: {} },
  { id: "entity_list", type: "entity_list", title_key: "blocks.entity_list.title", order: 1, item_count: 3, total_count: 5, truncated: true, items: [
    entity("jo-duchan/tapflow", "https://github.com/jo-duchan/tapflow", 3, 54, "github_repo", [{ comment_id: "DQa1tapF0w1", author: "dev_a", like_count: 40, permalink: "https://www.threads.com/@dev_a/post/DQa1tapF0w1" }]),
    entity("Video", "https://www.youtube.com/watch?v=abc(1)", 1, 90, "video"),
    entity("Bad", "javascript:alert(1)", 2, 1, "web"),
  ] },
  { id: "mystery", type: "future_widget", order: 2, items: [{}] },
  { id: "top_comments", type: "top_comments", title_key: "blocks.top_comments.title", items: [{ comment_id: "DQa3ytdlp01", author: "kenji.tw", like_count: 31, evidence: [{ comment_id: "DQa3ytdlp01", author: "kenji.tw", like_count: 31 }] }] },
  { id: "qa_pairs", type: "qa_pairs", title_key: "blocks.qa_pairs.title", order: 3, items: [
    { status: "replies_not_captured", question: "點樣確定資料未過時？", evidence: [{ comment_id: "R7", author: "carol", like_count: 5 }] },
    { status: "weird_status", question: "其他？", evidence: [{ comment_id: "c-internal-88", author: "amy_ux" }] },
  ] },
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
  assert.deepEqual(model.blocks.map(b => b.type), ["entity_list", "qa_pairs", "noise_summary", "top_comments"]);
  assert.deepEqual(model.skipped, ["future_widget"]);
  assert.equal(model.postType, "resource");
  const entityBlock = model.blocks[0];
  assert.ok(entityBlock.type === "entity_list");
  assert.equal(entityBlock.truncated, true);
  assert.equal(entityBlock.total - entityBlock.shown, 2);
  // Full URL text is kept; only http(s) becomes a link.
  assert.equal(entityBlock.items[1].url, "https://www.youtube.com/watch?v=abc(1)");
  assert.equal(entityBlock.items[2].href, null);
  const qa = model.blocks[1];
  assert.ok(qa.type === "qa_pairs");
  assert.deepEqual(qa.items.map(i => i.status), ["replies_not_captured", "unknown"]);
  const top = model.blocks[3];
  assert.ok(top.type === "top_comments");
  assert.equal(top.items[0].text, "yt-dlp 係必備", "missing item text falls back to the captured comment");
  const noiseBlock = model.blocks[2];
  assert.ok(noiseBlock.type === "noise_summary");
  assert.deepEqual(noiseBlock.flags.map(f => [f.flag, f.count]), [["bookmark", 4], ["tag_friend", 1], ["emoji_only", 1]]);
});

test("evidence links prefer the permalink, then the captured URL, then a shortcode rebuild, else none", () => {
  const source = fixture(null);
  assert.equal(blockEvidenceHref({ comment_id: "x", author: "a", permalink: "https://www.threads.com/@dev_a/post/DQa1tapF0w1" }, source), "https://www.threads.com/@dev_a/post/DQa1tapF0w1");
  assert.equal(blockEvidenceHref({ comment_id: "R7", author: "carol" }, source), "https://www.threads.com/@carol/post/CAPTURED01");
  assert.equal(blockEvidenceHref({ comment_id: "DQa3ytdlp01", author: "@kenji.tw" }, source), "https://www.threads.com/@kenji.tw/post/DQa3ytdlp01");
  assert.equal(blockEvidenceHref({ comment_id: "c-internal-88", author: "amy_ux" }, source), null);
  assert.equal(blockEvidenceHref({ comment_id: "R1", author: "dev_a", permalink: "javascript:alert(1)" }, null), null);
});

test("empty blocks show omitted reasons; a block error with nothing usable falls back to legacy", () => {
  const empty = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks: [], blocks_omitted: [{ type: "entity_list", reason: "no_links" }] }));
  assert.equal(empty.mode, "empty");
  assert.deepEqual(empty.omitted, [{ type: "entity_list", reason: "no_links" }]);
  const failed = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks_error: "boom" }));
  assert.equal(failed.mode, "legacy");
  assert.equal(failed.error, true);
  const partial = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks_error: "boom", blocks }));
  assert.equal(partial.mode, "blocks");
  assert.equal(partial.error, true);
});

test("entity sorting is local and exports carry full links in Markdown and CSV", () => {
  const model = buildAnalysisBlocks(fixture({ blocks_version: "v1", blocks }));
  const rows = model.blocks[0].type === "entity_list" ? model.blocks[0].items : [];
  assert.deepEqual(sortEntityRows(rows, "mentions").map(r => r.name), ["jo-duchan/tapflow", "Bad", "Video"]);
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
  assert.deepEqual([...doc.querySelectorAll("[data-analysis-block]")].map(e => e.getAttribute("data-analysis-block")), ["entity_list", "qa_pairs", "noise_summary", "top_comments"]);
  assert.equal(doc.querySelector("[data-reader-entries]"), null);
  assert.equal(doc.querySelector("[data-post-type]")?.textContent, "資源");
  const urls = [...doc.querySelectorAll("[data-block-entity-url]")];
  // Default local sort is 最多人提.
  assert.deepEqual(urls.map(u => u.textContent), ["https://github.com/jo-duchan/tapflow", "javascript:alert(1)", "https://www.youtube.com/watch?v=abc(1)"]);
  assert.equal(urls[1].tagName, "SPAN", "non-http URLs are not links");
  const link = doc.querySelector('[data-reading-ref-site="DQa1tapF0w1"]')!;
  assert.equal(link.textContent, "睇原留言 ↗");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(doc.querySelector('[data-reading-ref-site="R7"]')?.getAttribute("href"), "https://www.threads.com/@carol/post/CAPTURED01");
  assert.match(doc.querySelector('[data-block-evidence-id="c-internal-88"]')!.textContent!, /c-internal-88/);
  assert.equal(doc.querySelector("[data-block-truncated]")?.textContent, "仲有 2 項未列出（共 5 項）");
  assert.equal(doc.querySelector('[data-block-qa-status="replies_not_captured"]')?.textContent, "回覆可能未抓到");
  assert.doesNotMatch(doc.body.textContent!, /replies_not_captured|weird_status|tag_friend|future_widget|blocks\./);
  assert.equal(doc.querySelectorAll("[data-block-noise] [data-reader-reply]").length, 0, "noise stays numbers only");
});

test("the reader keeps the four-cell reading without blocks and explains empty or failed blocks", () => {
  const legacy = render(fixture(null));
  assert.ok(legacy.querySelector("[data-reader-entries]"));
  assert.equal(legacy.querySelector("[data-analysis-blocks]"), null);
  assert.equal(legacy.querySelector("[data-blocks-error], [data-blocks-empty], [data-post-type]"), null);
  const failed = render(fixture({ blocks_version: "v1", blocks_error: "boom" }));
  assert.ok(failed.querySelector("[data-blocks-error]"));
  assert.ok(failed.querySelector("[data-reader-entries]"));
  assert.doesNotMatch(failed.body.textContent!, /boom/);
  const empty = render(fixture({ blocks_version: "v1", blocks: [], blocks_omitted: [{ type: "qa_pairs", reason: "no_items" }] }));
  assert.equal(empty.querySelector("[data-reader-entries]"), null);
  assert.equal(empty.querySelector('[data-block-omitted="qa_pairs"]')?.textContent, "大家問咩：未有內容");
});
