import assert from "node:assert/strict";
import test from "node:test";
import { buildReplyThreads, selectReplyThreads, scanThreadTerms, classifyPostKind, renderReplyThreads, REPLY_CHARACTER_BUDGET, REPLY_HARD_CEILING, isReplyQuestion } from "../src/compare/reply-thread.ts";
import type { CrawlComment } from "../src/compare/inline-reading.ts";
const c = (id: string, author: string, text: string, extra: Partial<CrawlComment> = {}): CrawlComment => ({ id, author, text, parent: null, likes: 0, time: null, replies: null, ...extra });

test("roles normalize handles; explicit parent/source ids win over adjacency", () => {
  const rows = buildReplyThreads([c("q", "reader", "How does RAG work?", { sourceId: "s1" }), c("x", "other", "KG"), c("a", "@OP", "embedding", { parent: "q" }), c("b", "op", "rerank", { parentSourceId: "s1" }), c("z", "op", "missing", { parent: "missing" })], "op");
  assert.deepEqual(rows.map(r => r.role), ["reply", "reply", "op", "op", "op"]);
  assert.deepEqual(rows[0].answeredBy, ["a", "b"]);
  assert.equal(rows[2].answers, "q");
  assert.equal(rows[3].answers, "q");
  assert.equal(rows[4].answers, null);
  assert.equal(buildReplyThreads([c("a", "", "unknown")], "")[0].role, "reply");
});

test("adjacency pairs only an author directly following an audience reply", () => {
  const rows = buildReplyThreads([c("q", "reader", "點樣做"), c("a", "op", "先做索引"), c("b", "op", "然後檢索"), c("c", "reader", "知道了")], "op");
  assert.equal(rows[1].answers, "q");
  assert.equal(rows[1].pairing, "adjacency");
  assert.equal(rows[2].answers, null);
  assert.equal(rows[3].answers, null);
  assert.ok(isReplyQuestion("可唔可以試下"));
});

test("selection reserves questions and authors, fills by likes then length then terms, keeps order", () => {
  const rows = buildReplyThreads([c("q", "reader", "why?"), c("a", "op", "RAG"), c("low", "reader", "x"), c("long", "reader", "longer detail"), c("liked", "reader", "y", { likes: 1 })], "op");
  const mandatoryCost = renderReplyThreads(rows.slice(0, 2)).length;
  const selected = selectReplyThreads(rows, scanThreadTerms("RAG", rows), mandatoryCost + 40);
  assert.ok(selected.some(r => r.id === "q"));
  assert.ok(selected.some(r => r.id === "a"));
  assert.ok(selected.some(r => r.id === "liked"));
  assert.ok(renderReplyThreads(selected).length <= mandatoryCost + 40);
  assert.deepEqual(selected.map(r => r.id), rows.filter(r => selected.includes(r)).map(r => r.id));
  assert.ok(REPLY_CHARACTER_BUDGET > 0);
  assert.deepEqual(selectReplyThreads(rows, [], 1), [], "a budget too small for anything selects nothing instead of throwing");
  const oversized = buildReplyThreads(Array.from({ length: REPLY_HARD_CEILING + 1 }, (_, i) => c(String(i), "op", "a", { likes: i })), "op");
  const kept = selectReplyThreads(oversized, []);
  assert.equal(kept.length, REPLY_HARD_CEILING, "more author replies than the ceiling keeps the ceiling's worth");
  assert.ok(!kept.some(r => r.id === "0"), "the least-liked mandatory reply is the one dropped");
});

test("term scan counts case-insensitively, keeps mixed tokens and adjacent CJK, drops filler and URLs", () => {
  const terms = scanThreadTerms("The RAG 向量 embedding and KG BM25 MCP F1 user @reader https://example.com", [c("a", "op", "rag rerank 知識圖譜 thanks the")]);
  assert.equal(terms.find(t => t.term === "RAG")?.count, 2);
  for (const term of ["embedding", "KG", "BM25", "MCP", "F1", "向量", "知識圖譜"]) assert.ok(terms.some(t => t.term === term), term);
  for (const term of ["the", "and", "thanks", "user", "reader", "https", "example", "com"]) assert.ok(!terms.some(t => t.term.toLowerCase() === term), term);
  assert.deepEqual(scanThreadTerms("知識圖譜同向量", []), []);
  assert.equal(classifyPostKind([]), "general");
  assert.equal(classifyPostKind([{ term: "RAG", count: 50 }]), "general");
  assert.equal(classifyPostKind([{ term: "RAG", count: 1 }, { term: "KG", count: 1 }, { term: "BM25", count: 1 }]), "general");
  assert.equal(classifyPostKind([{ term: "RAG", count: 2 }, { term: "KG", count: 1 }, { term: "BM25", count: 1 }]), "technical");
});

test("mostly-zero likes retain more than 30 mandatory replies without mutation", () => {
  const comments = Array.from({ length: 40 }, (_, i) => c(String(i), i % 2 ? "op" : "reader", i % 2 ? "BM25 索引" : "RAG 點樣做？"));
  const snapshot = structuredClone(comments);
  const rows = buildReplyThreads(comments, "op");
  const selected = selectReplyThreads(rows, scanThreadTerms("RAG", rows));
  assert.equal(selected.length, 40);
  assert.equal(selected.filter(r => r.role === "op").length, 20);
  assert.ok(renderReplyThreads(selected).length <= REPLY_CHARACTER_BUDGET);
  assert.deepEqual(comments, snapshot);
});

test("optional selection breaks zero-like ties by length then term hits", () => {
  const rows = buildReplyThreads([c("x", "user", "abc"), c("y", "user", "RAG"), c("z", "user", "longer")], "op");
  assert.deepEqual(selectReplyThreads(rows, [{ term: "RAG", count: 1 }], renderReplyThreads([rows[2]]).length).map(r => r.id), ["z"]);
  assert.deepEqual(selectReplyThreads(rows.slice(0, 2), [{ term: "RAG", count: 1 }], renderReplyThreads([rows[1]]).length).map(r => r.id), ["y"]);
  const generalTerms = scanThreadTerms("hello this is a good interview program thanks", []);
  assert.equal(classifyPostKind(generalTerms), "general");
});
