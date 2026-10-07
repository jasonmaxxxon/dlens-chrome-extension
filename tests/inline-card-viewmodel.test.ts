import assert from "node:assert/strict";
import test from "node:test";
import { buildInlineCardViewModel } from "../src/viewmodel/inline-card.ts";
import { formatEta, renderInlineCard } from "../src/content/inline-collect-card.ts";
import { parseFirstReplies } from "../src/content/inline-collect-peek.ts";
import type { SessionItem } from "../src/state/types.ts";

function item(status: SessionItem["status"], comments: Array<Record<string, unknown>> = [], extra: Partial<SessionItem> = {}): SessionItem {
  return {
    id: "i1", status, selectedAt: "", savedAt: "", queuedAt: "2026-10-07T10:00:00Z", completedAt: null, captureId: null, jobId: null,
    canonicalTargetUrl: null, latestJob: null, commentsPreview: [], lastStatusAt: "2026-10-07T10:00:10Z", lastErrorKind: null, lastError: null,
    descriptor: { post_url: "https://www.threads.com/@op/post/A", author_hint: "op", text_snippet: "", engagement: { likes: 1, comments: 20, reposts: 0, forwards: 0, views: null } } as unknown as SessionItem["descriptor"],
    latestCapture: {
      result: { canonical_post: { author: "op" }, comments },
      analysis: { clusters: [{ cluster_key: 1, size_share: 0.3, like_share: 0.2, keywords: ["通勤", "時間"] }, { cluster_key: 0, size_share: 0.6, like_share: 0.7, keywords: ["生產力", "交付", "坐"] }],
        evidence: [{ cluster_key: 0, comments: [{ comment_id: "c1", text: "返 office 唔等於有生產力", author: "a", like_count: 90 }] }] }
    } as unknown as SessionItem["latestCapture"],
    ...extra
  };
}
const c = (id: string, author: string, text: string, likes: number, parent: string | null = null) => ({ comment_id: id, author, text, like_count: likes, parent_comment_id: parent });
const many = [
  c("c1", "a", "返 office 唔等於有生產力", 90), c("c2", "b", "可唔可以拒絕 WFO？", 40), c("c3", "op", "可以同 HR 傾", 5, "c2"),
  c("c4", "d", "幾時開始？", 12), c("c5", "e", "我覺得 hybrid 好啲", 30), c("c6", "f", "邊間公司？", 8), c("c7", "g", "我答你：銀行", 2, "c6"),
  c("c8", "h", "同意", 1), c("c9", "i", "通勤好辛苦", 25), c("c10", "j", "支持", 3), c("c11", "k", "冇意見", 0)
];

test("inline card phases follow the saved item status without crawl data", () => {
  assert.equal(buildInlineCardViewModel(item("saved"), "topic", "返工").phase, "saved");
  assert.deepEqual(buildInlineCardViewModel(item("queued"), "topic", "返工").eta, { from: "2026-10-07T10:00:00Z", seconds: 59, ahead: 0 });
  assert.deepEqual(buildInlineCardViewModel(item("running"), "topic", "返工").eta, { from: "2026-10-07T10:00:10Z", seconds: 59, ahead: 0 });
  assert.equal(buildInlineCardViewModel(item("failed", [], { lastError: "頁面載入異常" }), "topic", "返工").error, "頁面載入異常");
  assert.equal(buildInlineCardViewModel(item("succeeded", many), "archive", "收藏").entries.length, 0);
});

test("fewer than ten readable comments are listed, not grouped", () => {
  const vm = buildInlineCardViewModel(item("succeeded", many.slice(0, 3)), "topic", "返工");
  assert.equal(vm.few?.length, 3);
  assert.equal(vm.entries.length, 0);
});

test("the four no-AI entries come from clusters, likes and the reply chain", () => {
  const vm = buildInlineCardViewModel(item("succeeded", many), "topic", "返工");
  assert.deepEqual(vm.entries.map((e) => e.key), ["stance", "top", "op", "ask"]);
  assert.equal(vm.countLabel, "11 / 20 則");
  const stance = vm.answers.stance;
  assert.ok(stance && stance.kind === "clusters");
  assert.equal(stance.segments[0].label, "生產力 / 交付 / 坐");
  assert.equal(stance.segments[0].pct, 60);
  const top = vm.answers.top;
  assert.ok(top && top.kind === "quotes");
  assert.equal(top.rows[0].likes, 90);
  const op = vm.answers.op;
  assert.ok(op && op.kind === "op");
  assert.equal(op.rows[0].text, "可以同 HR 傾");
  const ask = vm.answers.ask;
  assert.ok(ask && ask.kind === "ask");
  // Unanswered first; an author reply and someone else's reply are kept apart.
  assert.equal(ask.rows[0].status, "none");
  assert.deepEqual(new Set(ask.rows.map((r) => r.status)), new Set(["none", "author", "other"]));
  assert.equal(vm.entries.find((e) => e.key === "ask")?.mark, "1 未回");
});

test("card markup escapes comment text and only opens the selected answer", () => {
  const evil = [...many, c("c12", "x", "<img src=x onerror=alert(1)>？", 1)];
  const vm = buildInlineCardViewModel(item("succeeded", evil), "topic", "返工");
  const closed = renderInlineCard(vm, null, Date.parse("2026-10-07T10:01:00Z"));
  assert.ok(!closed.includes('class="answer"'));
  const open = renderInlineCard(vm, "ask", Date.parse("2026-10-07T10:01:00Z"));
  assert.ok(open.includes('class="answer"'));
  assert.ok(!open.includes("<img"));
  assert.ok(open.includes("&lt;img"));
});

test("a queued crawl waits behind the running one and every earlier queued one", () => {
  const mine = item("queued", [], { id: "mine", queuedAt: "2026-10-07T10:05:00Z" });
  const queue = [item("running", [], { id: "r" }), item("queued", [], { id: "early", queuedAt: "2026-10-07T10:01:00Z" }), item("queued", [], { id: "late", queuedAt: "2026-10-07T10:09:00Z" }), mine];
  const eta = buildInlineCardViewModel(mine, "topic", "返工", { queue }).eta;
  assert.deepEqual(eta, { from: "2026-10-07T10:05:00Z", seconds: 59 * 3, ahead: 2 });
  const text = renderInlineCard(buildInlineCardViewModel(mine, "topic", "返工", { queue }), null, Date.parse("2026-10-07T10:05:00Z")).replace(/<[^>]+>/g, "");
  assert.match(text, /排隊 · 前面 2 篇 · 約 2 分 57 秒/);
});

test("the estimate counts down and admits a long wait instead of going negative", () => {
  assert.equal(formatEta("2026-10-07T10:00:00Z", 84, Date.parse("2026-10-07T10:00:30Z")), "約 54 秒");
  assert.equal(formatEta("2026-10-07T10:00:00Z", 84, Date.parse("2026-10-07T10:02:00Z")), "比平常久");
});

test("a crawl request that never became a job reads as failed with its reason", () => {
  const vm = buildInlineCardViewModel(item("saved"), "topic", "返工", { startError: "後端未能建立抓取工作" });
  assert.equal(vm.phase, "failed");
  assert.equal(vm.error, "後端未能建立抓取工作");
  assert.equal(buildInlineCardViewModel(item("running"), "topic", "返工", { startError: "old" }).phase, "running");
});

test("the peek picks the most-liked first reply and disappears once the crawl is done", () => {
  const replies = [{ text: "一", author: "a", likes: 2 }, { text: "二", author: "b", likes: 30 }];
  assert.deepEqual(buildInlineCardViewModel(item("running"), "topic", "返工", { peek: { state: "ready", replies } }).peek, { state: "ready", total: 2, top: replies[1] });
  assert.equal(buildInlineCardViewModel(item("running"), "archive", "收藏", { peek: { state: "ready", replies } }).peek, null);
  assert.equal(buildInlineCardViewModel(item("succeeded", many), "topic", "返工", { peek: { state: "ready", replies } }).peek, null);
  assert.equal(buildInlineCardViewModel(item("running"), "topic", "返工", { peek: { state: "unavailable" } }).peek, null);
});

test("first replies come from thread_items, skipping the post and the author's own thread", () => {
  const post = (code: string, username: string, text: string, likes: number, isReply: boolean) =>
    ({ post: { code, user: { username }, caption: { text }, like_count: likes, text_post_app_info: { is_reply: isReply } } });
  const html = `<script type="application/json" data-sjs="">${JSON.stringify({ a: { thread_items: [post("ROOT", "op", "原帖", 9, false)] }, b: [{ thread_items: [post("S1", "op", "作者續寫", 5, true)] }, { thread_items: [post("R1", "fan", "讚", 4, true), post("R2", "op", "作者回覆", 1, true)] }, { thread_items: [post("R1", "fan", "讚", 4, true)] }] })}</script><script type="application/json">not json thread_items</script>`;
  assert.deepEqual(parseFirstReplies(html, "ROOT"), [{ text: "讚", author: "fan", likes: 4 }]);
  assert.equal(parseFirstReplies("<html>logged out</html>", "ROOT"), null);
});
