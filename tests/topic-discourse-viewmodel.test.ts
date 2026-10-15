import assert from "node:assert/strict";
import test from "node:test";
import { suggestTopic, buildCardTopicLine, buildTopicDiscourseViewModel, frameOf, postedAt } from "../src/viewmodel/topic-discourse.ts";
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

test("home does not auto-follow; list is newest first with question and today's additions", () => {
  const vm = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: null, inViewPostKey: "threads-post:b", now: NOW });
  assert.equal(vm.topic, null);
  assert.equal(vm.emptyLine, null);
  assert.deepEqual(vm.topicRows.map(c => [c.name, c.count, c.todayAdded, c.secondLine]), [["AI 工具額度", 5, 1, "未寫研究問題"], ["香港拍拖", 0, 0, "未寫研究問題"]]);
  const selected = buildTopicDiscourseViewModel({ topics, signals, items, selectedTopicId: "t1", inViewPostKey: "threads-post:f", now: NOW }).topic!;
  assert.deepEqual(selected.frames!.map(f => [f.name, f.posts.length]), [["grok / agent", 2], ["reset / 額度", 2]]);
  assert.equal(selected.posts.length, 5);
  assert.match(selected.coverage, /^5 篇 · 3 則留言 · 今日 \+1/);
  const empty = buildTopicDiscourseViewModel({ topics: [], signals: [], items: [], selectedTopicId: null, inViewPostKey: null, now: NOW });
  assert.equal(empty.emptyLine, "話題＝你想答嘅問題。建一個，之後轉盤外圈可以直接放。");
  const q = buildTopicDiscourseViewModel({ topics: [{...topics[0],context:{researchQuestion:'點用？'}}], signals,items,selectedTopicId:null,inViewPostKey:null,now:NOW });
  assert.equal(q.topicRows[0].secondLine, '想答：點用？');
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

 test("topic suggestion uses literal overlap, reports the shared word, and ignores weak matches", () => {
  const candidate = item("new", { author: "fan", text: "Codex 額度夠唔夠用", daysAgo: 0, likes: 0 });
  const named = topic("codex", "Codex 使用");
  assert.equal(suggestTopic(candidate, [named], [], [])?.reason, "都提到 Codex");
  assert.equal(suggestTopic(candidate, [topic("other", "香港拍拖")], [], []), null);
  candidate.descriptor.text_snippet = "AI";
  assert.equal(suggestTopic(candidate, [topic("weak", "AI 工具")], [], []), null);
  candidate.descriptor.text_snippet = "Codex";
  assert.equal(suggestTopic(candidate, [{ ...named, name: "工具", context: { researchQuestion: "Codex 點用？" } }], [], [])?.topicId, "codex");
  assert.equal(suggestTopic(candidate, [topic("t1", "工具")], signals, items) ?? null, null);
  assert.equal(suggestTopic(candidate, [topic("t1", "工具")], [signal("sa", "a", "t1")], [item("a", { author: "fan", text: "", daysAgo: 0, likes: 0, keywords: [["Codex"]] })])?.topicId, "t1");
});

test('inbox suggestions precede other topic picks', () => {
 const candidate = item('new',{author:'x',text:'Codex 額度',daysAgo:0,likes:0});
 const vm=buildTopicDiscourseViewModel({topics:[topic('a','香港'),topic('b','Codex')],signals:[signal('new','new')],items:[candidate],selectedTopicId:null,inViewPostKey:null,now:NOW});
 assert.deepEqual(vm.inbox[0].picks.map(p=>[p.id,p.suggested]),[['b',true],['a',false]]);
});
