import assert from "node:assert/strict";
import test from "node:test";
import { blockEvidenceHref, buildAnalysisBlocks, entityCsv, entityMarkdown, sortEntityRows, type EntityExportLabels } from "../src/viewmodel/analysis-blocks.ts";
import { blockText } from "../src/ui/i18n.ts";
import { capture, descriptor, item } from "./collection-browser.fixtures.ts";
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

test("preserved notices, noise labels, entity sorting and export copy are bilingual", () => {
  for (const lang of ["zh", "en"] as const) {
    for (const key of ["opinion_overview", "entity_list", "qa_pairs", "top_comments", "noise_summary"]) assert.ok(blockText(lang, `blocks.${key}.title`));
    for (const type of ["discussion", "resource", "help", "news", "entertainment", "unknown"]) assert.ok(blockText(lang, `blocks.post_type.${type}`));
    for (const sort of ["mentions", "likes", "github"]) assert.ok(blockText(lang, `blocks.sort.${sort}`));
    for (const key of ["blocks.omitted.all_duplicate", "blocks.omitted.noise_only", "blocks.noise.flag.placeholder", "blocks.action.export_markdown", "blocks.action.export_csv"]) assert.ok(blockText(lang, key));
  }
  assert.equal(blockText("zh", "blocks.no.such.key"), "");
});

const blk = (type: string, extra: Record<string, unknown>) => ({ id: type, type, title_key: `blocks.${type}.title`, order: 1, priority: "primary", item_count: 1, total_count: 1, truncated: false, evidence_comment_ids: [], meta: {}, items: [], ...extra });
const ref = (comment_id: string, author: string, like_count = 1) => ({ comment_id, author, like_count, permalink: `https://www.threads.com/@${author}/post/${comment_id}` });

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

test("rev 2 opinion: AI name by cluster_key (items reordered), backend label, keywords, low_signal last, merged 其他留言, noise-only keys absent", () => {

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

test("Q&A reader groups: 3 groups, original post first, reply-structure line, post permalink used as-is (threads.net kept)", () => {

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
});

const topBlock = (ids: string[], extra: Record<string, unknown> = {}) => blk("top_comments", {
  item_count: ids.length, total_count: ids.length,
  items: ids.map(id => ({ comment_id: id, author: "reader", like_count: 1, text: `完整留言 ${id}`, reply_count: 0, evidence: [ref(id, "reader")] })),
  ...extra,
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

test("rev 2 tools keep their own description and original source link while top comments suppress the context quote", () => {

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

  test(`rev ${revision ?? 1} context summaries become empty without an alternative and render no empty secondary paragraph`, () => {

    const source = fixture({ blocks_version: "v1", ...(revision ? { blocks_revision: revision } : {}), blocks: [
      blk("entity_list", { items: [{ ...entity("tool", "https://github.com/a/tool", 1, 40, "github_repo", [ref("DQa1tapF0w1", "dev_a", 40)]), context: "原本引用熱門留言", ...(revision ? { context_comment_id: "DQa1tapF0w1", enrichment: { status: "ok", source: "github_api", description: null, stars: 12 } } : {}) }] }),
      topBlock(["DQa1tapF0w1"], { order: 2 }),
    ] });
    const model = buildAnalysisBlocks(source);
    const tools = model.blocks[0];
    assert.ok(tools.type === "entity_list");
    assert.deepEqual([tools.items[0].summary, tools.items[0].quote], ["", ""]);
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

test("rev 2 fallback tool summaries are not quoted again in expanded evidence", () => {

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
});

for (const revision of [undefined, 2]) {
  test(`rev ${revision ?? 1} tool extra evidence excludes text matching the summary or context quote`, () => {

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
});
}

for (const replies of [0, null, 3]) {
  test(`top comments render a reply count only for positive numbers: ${replies}`, () => {

    const source = fixture({ blocks_version: "v1", blocks: [topBlock(["REPLY_COUNT"], {
      items: [{ comment_id: "REPLY_COUNT", author: "reader", text: "一則熱門留言", like_count: 1, reply_count: replies, evidence: [ref("REPLY_COUNT", "reader")] }],
    })] });
    const model = buildAnalysisBlocks(source);
    const top = model.blocks[0];
    assert.ok(top.type === "top_comments");
    assert.equal(top.items[0].replies, replies, "the VM keeps zero and unknown values unchanged");
});
}

const opinionItem = (key: number, evidence: unknown[], extra: Record<string, unknown> = {}) => ({ cluster_key: key, label: `意見 ${key}`, keywords: ["關鍵字"], quant_keywords: ["備用關鍵字"], comment_count: 2, substantive_count: 2, noise_count: 0, size_share: 0.5, evidence, ...extra });

test("opinion representatives prefer a non-shown quote with text, then keep a quote even when every candidate is repeated", () => {

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

test("an opinion without any evidence text keeps its first source link and keyword secondary line", () => {

  const source = fixture({ blocks_version: "v1", blocks_revision: 2, blocks: [blk("opinion_overview", { items: [opinionItem(0, [ref("LINK_ONLY", "linked"), ref("ALSO_EMPTY", "empty")])] })] });
  const model = buildAnalysisBlocks(source);
  const opinions = model.blocks[0];
  assert.ok(opinions.type === "opinion_overview");
  assert.deepEqual([opinions.items[0].rep?.commentId, opinions.items[0].repText], ["LINK_ONLY", null]);
});

test("rev 2 null and same_as_context descriptions fall back once; every non-ok status hides enrichment facts and enums", () => {

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
});

test("a label cut from a comment is shown once as that comment; a condensed label stays a name over its quote", () => {

  const cut = { ...ref("CUT", "ervat", 219), text: "冇架啦 ，香港地 ，列左入邪惡軸心系列，只會越嚟越多野ban。" };
  const named = { ...ref("NAMED", "kelly", 26), text: "訂閱費用係最大限制，要計清楚。" };
  const source = fixture({ blocks_version: "v1", blocks_revision: 2, noise: { ...noise, audience_count: 57, noise_count: 2, noise_share: 0.035 }, blocks: [
    blk("opinion_overview", { item_count: 2, total_count: 2, items: [
      opinionItem(0, [cut], { label: "冇架啦，香港地，列左入邪惡軸心系列，只會越...", label_source: "representative_comment", label_comment_id: "CUT", comment_count: 21, size_share: 0.38 }),
      opinionItem(1, [named], { label: "訂閱費用太貴", label_source: "representative_comment", label_comment_id: "NAMED", comment_count: 6, size_share: 0.3 }),
    ] }),
    // The comment is also the top comment: the group still quotes its own label comment.
    topBlock(["CUT"], { order: 2, priority: "secondary" }),
  ] });
  const model = buildAnalysisBlocks(source);
  const opinions = model.blocks[0];
  assert.ok(opinions.type === "opinion_overview");
  assert.deepEqual(opinions.items.map(r => [r.quoteLabel, r.rep?.commentId]), [[true, "CUT"], [false, "NAMED"]]);
});
