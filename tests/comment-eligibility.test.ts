import assert from "node:assert/strict";
import test from "node:test";
import { readCommentEligibility, readThreadsPostLocator } from "../src/compare/comment-eligibility.ts";
import type { SessionItem } from "../src/state/types.ts";

export const dirtyItem = (): SessionItem => ({
  id: "dirty", status: "succeeded", descriptor: { author_hint: "op", post_url: "https://www.threads.net/@op/post/ROOT", text_snippet: "root" },
  latestCapture: { id: "capture", result: {
    canonical_post: { post_id: "ROOT", url: "https://www.threads.com/@op/post/ROOT", author: "op", text: "root" },
    comments: [
      { comment_id: "ROOT", author: "", text: "root", like_count: 10000 },
      { comment_id: "continuation", author: "op", text: "My continuation", like_count: 900 },
      { comment_id: "q", source_comment_id: "source-q", author: "fan", text: "有冇教學？", like_count: 30, parent_comment_id: "ROOT" },
      { comment_id: "q-variant", source_comment_id: "source-q", author: "fan", text: "有冇教學？", like_count: 31, parent_source_comment_id: "ROOT" },
      { comment_id: "answer", author: "op", text: "先接 API", like_count: 500, parent_source_comment_id: "source-q" },
      { comment_id: "agree", author: "other", text: "Good approach", like_count: 20, parent_comment_id: "ROOT" },
      { comment_id: "agree-variant", author: "@OTHER", text: "  good   APPROACH ", like_count: 19, parent_comment_id: "ROOT" },
      { comment_id: "unknown", author: "", text: "unattributed", like_count: 1000 },
    ],
  }, analysis: { clusters: [], evidence: [] } },
} as unknown as SessionItem);

test("root and duplicate variants leave unique audience plus one genuine OP answer", () => {
  const result = readCommentEligibility(dirtyItem());
  assert.deepEqual(result.audience.map(row => row.id), ["q", "agree"]);
  assert.deepEqual(result.authorReplies.map(row => row.id), ["answer"]);
  assert.deepEqual(result.authorContinuations.map(row => row.id), ["continuation"]);
  assert.deepEqual(result.unknown.map(row => row.id), ["unknown"]);
  assert.equal(result.byId.get("q-variant"), result.byId.get("source-q"));
  assert.equal(result.byId.get("answer")?.parent, "q");
  assert.equal(result.byId.get("agree-variant"), result.byId.get("agree"));
  assert.equal(result.audience[0].likes, 31);
  assert.equal(result.all.some(row => row.id === "ROOT"), false);
  assert.deepEqual(result.excluded, { root: 1, duplicates: 2, op: 2, unknown: 1 });
  assert.equal(result.structureKnown, false);
});

test("root locator excludes an anonymous root even under a legacy synthetic comment id", () => {
  const item = dirtyItem();
  item.latestCapture!.result!.comments = [
    { comment_id: "legacy-root", text: "root", source_locator: "https://www.threads.net/@op/post/ROOT/media?x=1", author: "" },
    { comment_id: "fan", text: "reply", author: "fan", like_count: 1 },
  ] as any;
  item.latestCapture!.result!.canonical_post!.author = "";
  item.descriptor.author_hint = "";
  const result = readCommentEligibility(item);
  assert.equal(result.op, "op");
  assert.deepEqual(result.all.map(row => row.id), ["fan"]);
  assert.equal(readThreadsPostLocator("https://evil.test/@op/post/ROOT"), null);
});

test("unknown authors and unresolved or conflicting parents never qualify as OP answers", () => {
  const item = dirtyItem();
  item.latestCapture!.result!.comments = [
    { comment_id: "u", author: "Unknown", text: "question" },
    { comment_id: "a", author: "op", text: "answer", parent_comment_id: "u" },
    { comment_id: "fan", author: "fan", text: "known question" },
    { comment_id: "bad", author: "op", text: "conflicting", parent_comment_id: "fan", parent_source_comment_id: "missing" },
    { comment_id: "adjacent", author: "op", text: "not an explicit answer" },
  ] as any;
  const result = readCommentEligibility(item);
  assert.deepEqual(result.authorReplies, []);
  assert.deepEqual(result.audience.map(row => row.id), ["fan"]);
  assert.equal(result.byId.get("bad")?.parentConflict, true);
});

test("cyclic parent aliases are uncertain and a real pinned account remains valid", () => {
  const item = dirtyItem();
  item.latestCapture!.result!.comments = [
    { comment_id: "q", author: "fan", text: "question", parent_comment_id: "a" },
    { comment_id: "a", author: "op", text: "answer", parent_comment_id: "q" },
    { comment_id: "real", author: "pinned", text: "real account", url: "/@pinned/post/REAL" },
    { comment_id: "badge", author: "Pin icon", text: "unknown badge" },
  ] as any;
  const result = readCommentEligibility(item);
  assert.equal(result.authorReplies.length, 0);
  assert.equal(result.byId.get("a")?.parentConflict, true);
  assert.ok(result.audience.some(row => row.author === "pinned"));
  assert.ok(result.unknown.some(row => row.id === "badge"));
});

test("unknown OP identity keeps text inspectable without assigning an audience role", () => {
  const item = dirtyItem();
  item.descriptor = {} as any;
  item.latestCapture!.result!.canonical_post = { text: "root" } as any;
  const result = readCommentEligibility(item);
  assert.equal(result.op, "");
  assert.equal(result.audience.length, 0);
  assert.ok(result.all.length > 0);
});

test("legacy locators do not promote unknown or conflicting authors into audience evidence", () => {
  const item = dirtyItem();
  item.latestCapture!.result!.comments = [
    { comment_id: "unknown", author: "", text: "unknown identity", url: "/@fan/post/UNKNOWN" },
    { comment_id: "conflict", author: "fan", text: "conflicting identity", url: "/@op/post/CONFLICT" },
    { comment_id: "conflict", author: "fan", text: "conflicting identity" },
  ] as any;
  const result = readCommentEligibility(item);
  assert.equal(result.audience.length, 0);
  assert.deepEqual(result.unknown.map(row => row.id), ["unknown", "conflict"]);
});
