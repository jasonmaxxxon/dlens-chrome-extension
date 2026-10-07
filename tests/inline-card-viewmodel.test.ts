import assert from "node:assert/strict";
import test from "node:test";
import { buildInlineCardViewModel } from "../src/viewmodel/inline-card.ts";
import { renderInlineCard } from "../src/content/inline-collect-card.ts";
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
  assert.equal(buildInlineCardViewModel(item("queued"), "topic", "返工").waitingSince, "2026-10-07T10:00:00Z");
  assert.equal(buildInlineCardViewModel(item("running"), "topic", "返工").waitingSince, "2026-10-07T10:00:10Z");
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
