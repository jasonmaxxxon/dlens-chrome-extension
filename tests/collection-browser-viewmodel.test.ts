import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionPosts, searchCollectionPosts } from "../src/viewmodel/collection-browser.ts";
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
