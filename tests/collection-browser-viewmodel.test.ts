import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionPosts, searchCollectionPosts, buildCollectionBrowserModel, buildWorkspaceCards, collectionRelativeTime } from "../src/viewmodel/collection-browser.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";

test("collection merges Threads host aliases and retains each saved identity across modes", () => {
  const older = item("old", { descriptor: descriptor({ post_url: "https://www.threads.net/@author/post/ABC/?ref=one#fragment" }), latestCapture: capture() });
  const newer = item("new", { savedAt: "2026-09-21T08:00:00Z", descriptor: descriptor({ author_hint: "latest-author", text_snippet: "new excerpt" }) });
  const sessions = [session("research", [older], "topic"), session("product", [newer], "product")];
  const original = structuredClone(sessions);
  const posts = buildCollectionPosts(sessions);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].descriptor, newer.descriptor);
  assert.equal(posts[0].author, "latest-author");
  assert.equal(posts[0].body, "完整原文第一段。\n原文第二段。");
  assert.equal(posts[0].bodySource, "capture");
  assert.deepEqual(posts[0].memberships.map(({ sessionId, itemId }) => [sessionId, itemId]).sort(), [["product", "new"], ["research", "old"]]);
  assert.deepEqual(buildCollectionPosts([...sessions].reverse()), posts);
  assert.deepEqual(sessions, original, "projection must never mutate stored sessions");
});

test("collection chooses captured original continuations and images without mixing AI or audience prose", () => {
  const source = capture({ images: ["https://images.example.com/1.jpg", "https://images.example.com/2.jpg", "javascript:alert(1)", "https://images.example.com/1.jpg"], summary: "AI invented summary" });
  source.result!.thread_read_model = {
    root_post: { text: "真實開頭" }, op_continuations: [{ text: "作者續文" }],
    discussion_replies: [{ text: "不屬於原文的回覆" }], assembled_content: "不得覆蓋已存在的原文片段"
  };
  const [post] = buildCollectionPosts([session("one", [item("first", { latestCapture: source })])]);
  assert.equal(post.body, "真實開頭\n\n作者續文");
  assert.deepEqual(post.imageUrls, ["https://images.example.com/1.jpg", "https://images.example.com/2.jpg"]);
  assert.equal(post.captureLimit, null);
});

test("collection ignores a crawler page sweep of avatars and sticker art and keeps the image saved from the post", () => {
  const sweep = capture({ images: [
    "https://scontent.xx.fbcdn.net/v/t1.6435-9/722635384_n.png",
    "https://scontent.cdninstagram.com/v/t51.82787-19/790081432_n.jpg",
    "https://scontent.cdninstagram.com/v/t51.82787-15/reply-photo_n.jpg"
  ] });
  const [saved] = buildCollectionPosts([session("one", [item("one", { latestCapture: sweep })])]);
  assert.deepEqual(saved.imageUrls, ["https://images.example.com/saved.jpg"]);
  const [textOnly] = buildCollectionPosts([session("one", [item("one", { latestCapture: sweep, descriptor: descriptor({ image_url: null }) })])]);
  assert.deepEqual(textOnly.imageUrls, [], "a text-only post shows no thumbnail rather than page art");
});

test("collection falls back to captured assembled text then the latest available original snippet", () => {
  const source = capture({ text: "" });
  source.result!.threadReadModel = { assembledContent: "已擷取的主帖與作者續文" };
  const [captured] = buildCollectionPosts([session("one", [item("one", { latestCapture: source })])]);
  assert.equal(captured.body, "已擷取的主帖與作者續文");
  const [saved] = buildCollectionPosts([session("one", [item("one")])]);
  assert.equal(saved.bodySource, "snippet");
  assert.equal(saved.body, "收藏時的原始文字");
  assert.ok(saved.captureLimit?.includes("收藏時"));
});

test("collection never merges missing post URLs by a shared feed URL and rejects unsafe links", () => {
  const invalid = descriptor({ post_url: "javascript:alert(1)", image_url: "data:image/png;base64,AAAA" });
  const posts = buildCollectionPosts([session("one", [item("same", { descriptor: invalid })]), session("two", [item("same", { descriptor: invalid })])]);
  assert.equal(posts.length, 2);
  assert.notEqual(posts[0].key, posts[1].key);
  assert.ok(posts.every((post) => post.postUrl === null && post.imageUrls.length === 0));
  assert.equal(buildCollectionPosts([session("one", [item("same", { descriptor: descriptor({ post_url: "https://user:secret@example.com/post/1" }) })])])[0].postUrl, null);
});

test("collection keeps post identity stable through capture enrichment and orders by latest save", () => {
  const first = item("first");
  const second = item("second", { savedAt: "2026-09-21T00:00:00Z", descriptor: descriptor({ post_url: "https://threads.com/@author/post/XYZ" }) });
  const before = buildCollectionPosts([session("one", [first, second])]);
  first.latestCapture = capture();
  const after = buildCollectionPosts([session("one", [first, second])]);
  assert.deepEqual(before.map((post) => post.key), after.map((post) => post.key));
  assert.equal(after[0].memberships[0].itemId, "second");
});

test("collection search uses full original text and author with AND tokens, never AI summary", () => {
  const posts = buildCollectionPosts([session("one", [item("one", { latestCapture: capture({ text: "原文談到 Local tools，完整文字可搜尋。", summary: "AI ghost keyword" }) })])]);
  assert.equal(searchCollectionPosts(posts, "@AUTHOR local").length, 1);
  assert.equal(searchCollectionPosts(posts, "完整文字").length, 1);
  assert.equal(searchCollectionPosts(posts, "ghost").length, 0);
  assert.equal(searchCollectionPosts(posts, "local missing").length, 0);
  assert.deepEqual(searchCollectionPosts(posts, "  "), posts);
});

test("collection cleans translation toolbar from descriptor fallback while preserving captured original text", () => {
  const dirty = "Translated from Chinese See original I want to learn.";
  const saved = item("one", { descriptor: descriptor({ text_snippet: dirty }) });
  const [fallback] = buildCollectionPosts([session("one", [saved])]);
  assert.equal(fallback.body, "I want to learn.");
  assert.equal(saved.descriptor.text_snippet, dirty, "display cleanup must not edit saved data");
  saved.latestCapture = capture({ text: dirty });
  const [captured] = buildCollectionPosts([session("one", [saved])]);
  assert.equal(captured.body, dirty, "canonical original text must not be cleaned as page chrome");
});


test("collection B sorts saves, post dates and comments without mutating source order", () => {
  const nowMs = new Date(2026, 9, 13, 12).getTime();
  const make = (id: string, saved: number, postedHours: string, comments: number) => item(id, {
    savedAt: new Date(nowMs - saved * 3600000).toISOString(),
    descriptor: descriptor({ post_url: `https://threads.com/@author/post/${id}`, captured_at: new Date(nowMs).toISOString(),
      time_token_hint: postedHours, engagement: { ...descriptor().engagement, comments } })
  });
  const posts = buildCollectionPosts([session("one", [make("a", 1, "20h", 4), make("b", 3, "1h", 20), make("c", 2, "5h", 10)])]);
  const before = posts.map(p => p.key);
  const ids = (sort: "saved" | "posted" | "comments") => buildCollectionBrowserModel(posts, "", sort, nowMs).rows.map(r => r.post.memberships[0].itemId);
  assert.deepEqual(ids("saved"), ["a", "c", "b"]);
  assert.deepEqual(ids("posted"), ["b", "c", "a"]);
  assert.deepEqual(ids("comments"), ["b", "c", "a"]);
  assert.deepEqual(posts.map(p => p.key), before);
  assert.ok(buildCollectionBrowserModel(posts, "", "comments", nowMs).rows.every(r => r.dayLabel === null));
});

test("collection B derives calendar day dividers and unicode type tiles from injected now", () => {
  const nowMs = new Date(2026, 9, 13, 0, 5).getTime();
  const dates = [new Date(2026, 9, 13, 0, 1), new Date(2026, 9, 12, 23, 59), new Date(2026, 9, 10, 12)];
  const posts = buildCollectionPosts([session("one", dates.map((d, i) => item(String(i), { savedAt: d.toISOString(), descriptor: descriptor({
    post_url: `https://threads.com/@author/post/${i}`, image_url: null, text_snippet: "  🧠想法", captured_at: d.toISOString(), time_token_hint: "0s"
  }) }))) ]);
  for (const sort of ["saved", "posted"] as const) {
    const rows = buildCollectionBrowserModel(posts, "", sort, nowMs).rows;
    assert.deepEqual(rows.map(r => r.dayLabel), ["今天", "昨天", "10月10日"]);
    assert.ok(rows.every(r => r.post.tileCharacter === "🧠"));
  }
  assert.equal(collectionRelativeTime(nowMs - 3 * 3600000, nowMs), "3h");
  assert.equal(collectionRelativeTime(nowMs - 2 * 86400000, nowMs), "2d");
  assert.equal(buildCollectionBrowserModel(posts, "想法", "saved", nowMs).count, 3);
});

test("collection B places unknown posted dates last and does not invent a day", () => {
  const known = item("known");
  const unknown = item("unknown", { savedAt: "", descriptor: descriptor({ captured_at: "", time_token_hint: null, post_url: "https://threads.com/@author/post/UNKNOWN", text_snippet: "" }) });
  const rows = buildCollectionBrowserModel(buildCollectionPosts([session("one", [unknown, known])]), "", "posted", 0).rows;
  assert.deepEqual(rows.map(r => r.post.memberships[0].itemId), ["known", "unknown"]);
  assert.equal(rows[1].dayLabel, null);
  assert.equal(rows[1].postedRelative, null);
  assert.equal(rows[1].post.tileCharacter, "？");
});

test("workspace cards project four latest sources, purpose and last save rather than update time", () => {
  const nowMs = new Date(2026, 9, 13, 12).getTime();
  const items = Array.from({ length: 6 }, (_, i) => item(String(i), { savedAt: new Date(nowMs - (i + 1) * 3600000).toISOString(), descriptor: descriptor({ post_url: `https://threads.com/@author/post/${i}` }) }));
  const cards = buildWorkspaceCards([session("one", items, "topic"), session("empty", [], "archive")], nowMs);
  assert.equal(cards[0].purpose, "睇大家點講、有咩分歧");
  assert.equal(cards[0].count, 6);
  assert.equal(cards[0].lastSavedRelative, "1h");
  assert.deepEqual(cards[0].previews.map(p => p.memberships[0].itemId), ["0", "1", "2", "3"]);
  assert.equal(cards[1].lastSavedRelative, null);
  assert.deepEqual(cards[1].previews, []);
});

import { buildCollectionRowStatus, buildCollectionInViewStatus } from "../src/viewmodel/collection-browser.ts";
import { readInlineReadingHash, INLINE_READING_PROMPT_VERSION } from "../src/compare/inline-reading.ts";
import { COMMENT_ELIGIBILITY_VERSION } from "../src/compare/comment-eligibility.ts";
import { PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION } from "../src/compare/product-signal-analysis.ts";
import { createDefaultSettings, type ProductSignalAnalysis, type Signal, type SessionItem } from "../src/state/types.ts";
import type { InlineReadingRecord } from "../src/compare/inline-reading-storage.ts";

const rowNow = Date.parse("2026-11-05T03:00:00Z");
function rowSource(count = 20, overrides: Partial<SessionItem> = {}) {
  const comments = Array.from({ length: count }, (_, index) => ({ comment_id: `c${index}`, author: `fan${index}`, text: `工具可以慳時間 ${index}`, like_count: index }));
  return item("row", { status: "succeeded", completedAt: "2026-11-05T02:00:00Z", latestCapture: capture({ author: "author" }, {
    analysis: { status: "succeeded", analysis_version: "v2", source_comment_count: count, clusters: [{ cluster_key: 0, size_share: 1, like_share: 1, keywords: ["工具"], member_comment_ids: comments.map(c => c.comment_id), comment_count: count }], evidence: [] } as NonNullable<ReturnType<typeof capture>["analysis"]>,
    result: { ...capture().result!, comments }
  }), ...overrides });
}
function rowReading(source: SessionItem): Extract<InlineReadingRecord, { status: "complete" }> {
  return { status: "complete", itemId: source.id, captureId: source.latestCapture!.id, reading: {
    itemId: source.id, captureId: source.latestCapture!.id, promptVersion: INLINE_READING_PROMPT_VERSION,
    eligibilityVersion: COMMENT_ELIGIBILITY_VERSION, inputHash: readInlineReadingHash(source)!, model: "fixture", generatedAt: "2026-11-05T02:05:00Z",
    gist: "工具幫到手", find: { method: "", split: "", ask: "" }, clusterNames: { "0": "工具慳時間" }, noiseClusters: [], methods: [], split: { agree: "", sides: [] }
  } };
}
function projectRow(source: SessionItem, readings: Record<string, InlineReadingRecord> = {}, now = rowNow) {
  const sessions = [session("topic-row", [source], "topic")];
  return buildCollectionRowStatus(buildCollectionPosts(sessions)[0], sessions, readings, {}, now);
}

test("panel row summary uses current reader stance and rejects stale capture, prompt, eligibility and input identities", () => {
  const source = rowSource(), record = rowReading(source);
  assert.deepEqual(projectRow(source, { row: record }), { summary: "「工具慳時間」 100% · 20 則觀眾留言", chip: { label: "讀完", tone: "success" }, mode: "topic", itemId: "row", error: false });
  for (const changed of [
    { ...record, captureId: "old-capture" },
    { ...record, reading: { ...record.reading, promptVersion: "old" } },
    { ...record, reading: { ...record.reading, eligibilityVersion: "old" } },
    { ...record, reading: { ...record.reading, inputHash: "old" } }
  ]) {
    assert.doesNotMatch(projectRow(source, { row: changed }).summary ?? "", /工具慳時間/);
    assert.match(projectRow(source, { row: changed }).summary ?? "", /工具可以慳時間 19/);
  }
});

test("panel row statuses distinguish few comments, backend grouping, current AI work and failed AI fallback", () => {
  assert.deepEqual(projectRow(rowSource(3)).chip, { label: "讀完", tone: "success" });
  assert.equal(projectRow(rowSource(3)).summary, "3 則觀眾留言 · 未夠歸納");
  const pending = rowSource(20, { completedAt: new Date(rowNow - 1000).toISOString() });
  pending.latestCapture = { ...pending.latestCapture!, analysis: null };
  assert.deepEqual(projectRow(pending).chip, { label: "分群整理中", tone: "running" });
  const source = rowSource(), identity = { itemId: source.id, captureId: source.latestCapture!.id, inputHash: readInlineReadingHash(source)!, promptVersion: INLINE_READING_PROMPT_VERSION, eligibilityVersion: COMMENT_ELIGIBILITY_VERSION };
  assert.deepEqual(projectRow(source, { row: { ...identity, status: "running", startedAt: "" } }).chip, { label: "AI 整理中", tone: "running" });
  const failed = projectRow(source, { row: { ...identity, status: "failed", error: "fixture-error", at: "" } });
  assert.deepEqual(failed.chip, { label: "讀完", tone: "success" });
  assert.doesNotMatch(failed.summary ?? "", /fixture-error|AI 整理失敗/);
});

test("panel queued and running rows derive queue and estimated ETA without inventing absent values", () => {
  const since = new Date(rowNow - 1000).toISOString();
  const queued = rowSource(0, { status: "queued", queuedAt: since });
  const ahead = item("ahead", { status: "running", descriptor: descriptor({ post_url: "https://www.threads.com/@other/post/AHEAD" }) });
  const sessions = [session("topic-row", [queued, ahead], "topic")], post = buildCollectionPosts(sessions).find(p => p.memberships.some(m => m.itemId === queued.id))!;
  assert.deepEqual(buildCollectionRowStatus(post, sessions, {}, {}, rowNow).chip, { label: "排隊中 · 前面 1 篇", tone: "warning" });
  assert.equal(buildCollectionRowStatus(post, sessions, {}, {}, rowNow).summary, null);
  const running = rowSource(0, { status: "running", lastStatusAt: since });
  assert.match(projectRow(running).chip!.label, /抓取中 · 約 \d+ 分/);
  assert.deepEqual(projectRow(running, {}, rowNow + 120000).chip, { label: "比平常久", tone: "warning" });
  assert.equal(projectRow(rowSource(0, { status: "running", lastStatusAt: null, queuedAt: null })).chip!.label, "抓取中");
  assert.equal(projectRow(rowSource(0, { status: "queued", queuedAt: null })).chip!.label, "排隊中");
  const runningSessions = [session("topic-row", [running], "topic")];
  assert.equal(buildCollectionRowStatus(buildCollectionPosts(runningSessions)[0], runningSessions, {}, {}, rowNow, { state: "ready", replies: [{ author: "fan", text: "已讀到的觀眾原句", likes: 2 }] }).summary, "已讀到的觀眾原句");
});

test("panel failed and saved rows preserve mapped processing copy with one state slot", () => {
  const failed = projectRow(rowSource(0, { status: "failed", lastErrorKind: "empty_crawl_result", lastError: "empty" }));
  assert.deepEqual(failed.chip, { label: "抓取失敗", tone: "danger" });
  assert.match(failed.summary ?? "", /讀不到留言/);
  assert.equal(failed.error, true);
  assert.deepEqual(projectRow(item("saved")), { summary: null, chip: { label: "未抓取", tone: "neutral" }, mode: "topic", itemId: "saved", error: false });
});

test("panel row membership priority is audience then product then archive without source mutation", () => {
  const source = rowSource(3), sessions = [session("archive", [source]), session("product", [source], "product"), session("topic", [source], "topic")];
  const before = structuredClone(sessions), post = buildCollectionPosts(sessions)[0];
  assert.equal(buildCollectionRowStatus(post, sessions, {}, {}, rowNow).mode, "topic");
  const productOnly = sessions.slice(0, 2);
  assert.equal(buildCollectionRowStatus(buildCollectionPosts(productOnly)[0], productOnly, {}, {}, rowNow).mode, "product");
  const archive = sessions.slice(0, 1), row = buildCollectionRowStatus(buildCollectionPosts(archive)[0], archive, {}, {}, rowNow);
  assert.equal(row.summary, null); assert.equal(row.chip, null);
  assert.deepEqual(sessions, before);
});

test("panel product summary uses reader verdict and fences stale prompt, capture and signal identities", () => {
  const source = rowSource(3), sessions = [session("product", [source], "product")], post = buildCollectionPosts(sessions)[0];
  const signal = { id: "signal", itemId: source.id, sessionId: "product", source: "threads" } as Signal;
  const analysis = { signalId: signal.id, status: "complete", promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, productContextHash: "fixture-context", analyzedAt: "2026-11-05T02:05:00Z", verdict: "try", reason: "適合試一個小流程", productReading: { headline: "工具", body: "先試一個流程", supportRefs: ["root"] }, evidenceRefs: [] } as unknown as ProductSignalAnalysis;
  const inputs = { settings: createDefaultSettings(), hasContext: true, signals: [signal], analyses: { signal: analysis } };
  const valid = buildCollectionRowStatus(post, sessions, {}, inputs, rowNow);
  assert.deepEqual(valid.chip, { label: "值得試", tone: "accent" }); assert.equal(valid.summary, "適合試一個小流程");
  for (const changed of [{ ...analysis, promptVersion: "old" }, { ...analysis, signalId: "other" }, { ...analysis, analyzedAt: "2020-01-01T00:00:00Z" }, { ...analysis, productReading: undefined }]) {
    assert.deepEqual(buildCollectionRowStatus(post, sessions, {}, { ...inputs, analyses: { signal: changed } }, rowNow).chip, { label: "未分析", tone: "neutral" });
  }
  assert.equal(buildCollectionRowStatus(post, sessions, {}, { ...inputs, analyses: {} }, rowNow).summary, "3 則留言");
});

test("panel in-view sibling reuses the list row projection and leaves the legacy banner export unchanged", () => {
  const source = rowSource(3), sessions = [session("topic", [source], "topic")], posts = buildCollectionPosts(sessions);
  const banner = buildCollectionInViewStatus(posts, "threads-post:ABC", null, sessions, {}, {}, rowNow)!;
  assert.equal(banner.post, posts[0]);
  assert.deepEqual(banner.rowStatus, buildCollectionRowStatus(posts[0], sessions, {}, {}, rowNow));
  assert.equal(buildCollectionInViewStatus(posts, "threads-post:ABC", posts[0].key, sessions, {}, {}, rowNow), null);
  assert.equal(buildCollectionInViewStatus(posts, "threads-post:MISSING", null, sessions, {}, {}, rowNow), null);
});
