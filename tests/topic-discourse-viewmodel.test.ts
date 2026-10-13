import assert from "node:assert/strict";
import test from "node:test";
import { buildCardTopicLine, buildTopicDiscourseViewModel, frameOf, postedAt } from "../src/viewmodel/topic-discourse.ts";
import type { SessionItem, Signal, Topic } from "../src/state/types.ts";

const NOW = Date.parse("2026-10-08T12:00:00+08:00");
const day = 86_400_000;
function item(id: string, opts: { author: string; text: string; daysAgo: number; likes: number; keywords?: string[][]; comments?: Array<Record<string, unknown>> }): SessionItem {
  const captured = new Date(NOW - opts.daysAgo * day).toISOString();
  return {
    id, status: "succeeded", savedAt: captured, lastStatusAt: captured,
    descriptor: { post_url: `https://www.threads.net/@${opts.author}/post/${id}`, author_hint: opts.author, text_snippet: opts.text, time_token_hint: "1h", captured_at: captured, engagement: { likes: opts.likes, comments: 10 } },
    latestCapture: {
      id: `cap-${id}`,
      result: { canonical_post: { author: opts.author }, comments: opts.comments ?? [] },
      analysis: opts.keywords ? { status: "succeeded", clusters: opts.keywords.map((keywords, i) => ({ cluster_key: i, size_share: 0.6 - i * 0.2, like_share: 0, keywords })), evidence: [] } : null
    }
  } as unknown as SessionItem;
}
const topic = (id: string, name: string, updatedAt = "2026-10-07T00:00:00Z"): Topic => ({ id, sessionId: "s", name, status: "pending", tags: [], signalIds: [], pairIds: [], createdAt: updatedAt, updatedAt } as Topic);
const signal = (id: string, itemId: string, topicId?: string): Signal => ({ id, sessionId: "s", itemId, source: "threads", inboxStatus: topicId ? "assigned" : "unprocessed", ...(topicId ? { topicId } : {}), capturedAt: "" } as Signal);

const ask = (id: string, text: string, parent: string | null = null, author = "fan") => ({ comment_id: id, author, text, like_count: 1, parent_comment_id: parent });
const items = [
  item("a", { author: "prompt_case", text: "今天 Codex 應該會 Reset 了", daysAgo: 1, likes: 50, keywords: [["reset", "額度"]], comments: [ask("a1", "積分點樣計？")] }),
  item("b", { author: "jth_0508", text: "突然就被重置了", daysAgo: 2, likes: 12, keywords: [["Reset", "重置"]], comments: [ask("b1", "積分點樣計?"), ask("b2", "我答你", "b1", "helper")] }),
  item("c", { author: "grok_fan", text: "Grok Bot 真的超級好用", daysAgo: 20, likes: 352, keywords: [["grok", "agent"]] }),
  item("d", { author: "monkey1sai", text: "我剩下6%", daysAgo: 25, likes: 20, keywords: [["grok", "替代"]] }),
  item("e", { author: "newbie", text: "未抓", daysAgo: 0, likes: 3 }),
  item("f", { author: "anna", text: "香港有咩調情好地方？", daysAgo: 0, likes: 837, keywords: [["地方"]] })
];
const topics = [topic("t1", "AI 工具額度", "2026-10-07T00:00:00Z"), topic("t2", "香港拍拖", "2026-10-01T00:00:00Z")];
const signals = [signal("sa", "a", "t1"), signal("sb", "b", "t1"), signal("sc", "c", "t1"), signal("sd", "d", "t1"), signal("se", "e", "t1"), signal("sf", "f")];

test("a post's date comes from Threads' relative time at capture", () => {
  const it = item("x", { author: "x", text: "", daysAgo: 0, likes: 0 });
  it.descriptor.time_token_hint = "3d";
  assert.equal(postedAt(it), Date.parse(it.descriptor.captured_at) - 3 * day);
  it.descriptor.time_token_hint = "10/05/26";
  assert.equal(new Date(postedAt(it)!).getDate(), 5);
});

test("a post joins the 講法 of its largest comment cluster that the AI did not flag as noise", () => {
  const spam = item("s", { author: "x", text: "", daysAgo: 0, likes: 0, keywords: [["cindy2387", "ends"], ["南丫", "丫島"]] });
  assert.equal(frameOf(spam)?.name, "cindy2387 / ends");
  const reading = { status: "complete", itemId: "s", captureId: "cap-s", reading: { noiseClusters: ["0"] } } as never;
  assert.equal(frameOf(spam, reading)?.name, "南丫 / 丫島");
});

test("the workspace view groups a topic's posts into 講法 and follows the post in view", () => {
  const vm = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: null, inViewPostKey: null, now: NOW });
  assert.equal(vm.postCount, 6);
  assert.deepEqual(vm.chips.map((c) => [c.name, c.count, c.selected]), [["AI 工具額度", 5, true], ["香港拍拖", 0, false]]);
  assert.deepEqual(vm.inbox.map((r) => r.author), ["anna"]);
  const t = vm.topic!;
  assert.deepEqual(t.frames!.map((f) => [f.name, f.posts.length, f.isNew]), [["grok / agent", 2, false], ["reset / 額度", 2, true]]);
  assert.deepEqual(t.loose.map((p) => p.author), ["newbie"], "a post without comment analysis waits outside the 講法");
  assert.match(t.coverage, /^5 篇貼文 · 已抓留言 3 則/);
  assert.equal(t.meme?.phrase, "grok");

  const inView = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: "t2", inViewPostKey: "threads-post:b", now: NOW });
  assert.equal(inView.topic!.id, "t2", "a topic the user chose wins over the post in view");
  const follow = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: null, inViewPostKey: "threads-post:b", now: NOW });
  assert.deepEqual(follow.topic!.inView, { kind: "here", author: "jth_0508", text: "突然就被重置了", frameName: "Reset / 重置" });
  assert.equal(follow.topic!.frames!.find((f) => f.key === "reset")!.inView, true);
  const loose = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: "t1", inViewPostKey: "threads-post:f", now: NOW });
  assert.deepEqual(loose.topic!.inView, { kind: "unassigned", author: "anna", signalId: "sf" });
});

test("發現 fill fixed templates with counts: a new 講法, likes per post and a question asked under two posts", () => {
  const t = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: "t1", inViewPostKey: null, now: NOW }).topic!;
  const [trend, like, asked] = t.findings;
  assert.ok(trend.kind === "trend" && trend.text.startsWith("〈reset / 額度〉係新講法") && trend.weeks[3].hot);
  assert.ok(like.kind === "like" && like.text.startsWith("〈grok / agent〉平均每篇 186 讚") && like.rows[0].hot);
  assert.ok(asked.kind === "ask");
  assert.equal(asked.text, "「積分點樣計？」喺 2 篇貼文都有人問，只有 1 篇有人回覆。");
});

test("the card line offers recent topics for an unsorted post and names the 講法 of a sorted one", () => {
  assert.deepEqual(buildCardTopicLine("f", topics, signals, items), { kind: "unassigned", signalId: "sf", picks: [{ id: "t1", name: "AI 工具額度" }, { id: "t2", name: "香港拍拖" }] });
  assert.deepEqual(buildCardTopicLine("a", topics, signals, items), { kind: "assigned", topicId: "t1", topicName: "AI 工具額度", frameName: "reset / 額度", count: 5 });
  assert.equal(buildCardTopicLine("zzz", topics, signals, items), null);
});
