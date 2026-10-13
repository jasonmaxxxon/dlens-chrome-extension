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
