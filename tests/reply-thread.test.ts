import assert from "node:assert/strict";
import test from "node:test";
import { buildReplyThreads, selectReplyThreads, scanThreadTerms, classifyPostKind, renderReplyThreads, REPLY_CHARACTER_BUDGET, REPLY_HARD_CEILING, isReplyQuestion, classifyReplyQuestion, replyQuestionReason } from "../src/compare/reply-thread.ts";
import type { CrawlComment } from "../src/compare/inline-reading.ts";
const c = (id: string, author: string, text: string, extra: Partial<CrawlComment> = {}): CrawlComment => ({ id, author, text, parent: null, likes: 0, time: null, replies: null, ...extra });

test("roles normalize handles; explicit parent/source ids win over adjacency", () => {
  const rows = buildReplyThreads([c("q", "reader", "How does RAG work?", { sourceId: "s1" }), c("x", "other", "KG"), c("a", "@OP", "embedding", { parent: "q" }), c("b", "op", "rerank", { parentSourceId: "s1" }), c("z", "op", "missing", { parent: "missing" })], "op");
  assert.deepEqual(rows.map(r => r.role), ["reply", "reply", "op", "op", "op"]);
  assert.deepEqual(rows[0].answeredBy, ["a", "b"]);
  assert.equal(rows[2].answers, "q");
  assert.equal(rows[3].answers, "q");
  assert.equal(rows[4].answers, null);
  assert.equal(buildReplyThreads([c("a", "", "unknown")], "")[0].role, "unknown");
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

test("question intent accepts Cantonese, Chinese and English clauses without relying on punctuation", () => {
  const examples = [
    "可以分享做法嗎", "有冇教學？", "邊度買？", "RAG 點樣做", "可唔可以試下", "係咪要另外收費？", "咩事？", "用咩模型？", "點申請？",
    "如何建立索引", "請問有沒有教學", "怎麼設定？", "你有用過嗎？", "分享一下做法", "教我點樣做",
    "How does RAG work?", "why?", "Does it support Cantonese?", "Can I try this?", "Please share the method", "Any tutorials?",
  ];
  for (const text of examples) {
    const result = classifyReplyQuestion(text);
    assert.equal(result.isQuestion, true, text);
    assert.equal(isReplyQuestion(text), true, text);
    assert.equal(replyQuestionReason(text), result.reason, text);
  }
  assert.equal(replyQuestionReason("有冇教學？"), "yue_interrogative");
  assert.equal(replyQuestionReason("可以分享做法嗎"), "request_clause");
  assert.equal(replyQuestionReason("How does it work?"), "english_interrogative");
});

test("question detection strips URLs, code and quoted material while preserving original text", () => {
  const negative = [
    "", "?", "???", "？？？", "🤔???", "👍？", "hello?", "test？", "Interesting!", "What a great day!",
    "https://example.com/?what=how&why=when", "www.example.com/how?x=1", "/api?why=now", "看這個 https://example.com/?q=where",
    '`how does it work?`', '```js\nconst what = "why?";\n```', '~~~\n有冇教學？\n~~~', '<code>邊度買？</code>',
    '> How does it work?\n我已經理解了', '「點樣做？」', '『有冇教學？』', '“Where can I buy it?”', '"Can I try?"', "'How do I install it?'",
    '他說：「點樣做？」', '有人問 "Why?"，我已經答咗', 'I know why it works.', '我知道點樣做', '分享我點樣做',
  ];
  for (const text of negative) {
    const snapshot = text;
    assert.equal(classifyReplyQuestion(text).isQuestion, false, text);
    assert.equal(isReplyQuestion(text), false, text);
    assert.equal(text, snapshot);
  }
  for (const text of ['「別人點樣做？」我想問有冇教學', '> How do I install it?\n可以分享做法嗎', '`const q = "why?"`\n邊度買？', 'https://example.com/?what=how\nCan I try this?']) {
    assert.equal(isReplyQuestion(text), true, text);
  }
  assert.equal(replyQuestionReason("???"), "punctuation_only");
  assert.equal(replyQuestionReason('"How?"'), "non_prose_only");
});

test("unknown attribution remains context, and aliases preserve explicit parent provenance", () => {
  const comments = [
    c("q", "reader", "有冇教學？", { sourceId: "source-q", aliases: ["old-q"] }),
    c("a", "op", "有", { parent: "old-q" }),
    c("unknown", "", "有冇教學？"),
    c("unpaired", "op", "補充說明"),
  ];
  const before = structuredClone(comments);
  const rows = buildReplyThreads(comments, "op");
  assert.equal(rows[1].answers, "q");
  assert.equal(rows[1].pairing, "parent");
  assert.equal(rows[1].pairingReason, "explicit_parent");
  assert.equal(rows[2].role, "unknown");
  assert.equal(rows[3].answers, null, "unknown attribution does not become audience adjacency");
  assert.match(renderReplyThreads(rows), /歸屬未確認/);
  assert.deepEqual(comments, before);
  assert.ok(buildReplyThreads([c("x", "reader", "hello")], "").every(row => row.role === "unknown"));
});

test("a validated OP handle named author keeps its role without trusting UI labels as audience", () => {
  const rows = buildReplyThreads([
    c("question", "reader", "有冇教學？"),
    c("answer", "@AUTHOR", "有", { parent: "question" }),
    c("missing", "unknown", "未能確認"),
    c("ui", "follow", "普通 UI label"),
  ], "author");
  assert.deepEqual(rows.map(row => row.role), ["reply", "op", "unknown", "unknown"]);
  assert.equal(rows[1].answers, "question");
  assert.equal(rows[1].pairing, "parent");
  assert.deepEqual(rows[0].answeredBy, ["answer"]);
  assert.equal(buildReplyThreads([c("label", "author", "未經確認")], "other-op")[0].role, "unknown");
  for (const unknownOp of ["", "unknown", "null", "none", "anonymous"]) {
    assert.equal(buildReplyThreads([c("row", "reader", "內容")], unknownOp)[0].role, "unknown", unknownOp);
  }
});

test("an owned permalink plus retained code alias corroborates a real audience handle named like UI", () => {
  const rows = buildReplyThreads([
    { ...c("legacy", "pinned", "真實帳號", { aliases: ["OWN"] }), permalink: "https://www.threads.com/@pinned/post/OWN" },
    { ...c("UNKNOWN", "unknown", "也是實際帳號"), permalink: "/@unknown/post/UNKNOWN" },
    { ...c("wrong-host", "pinned", "錯誤網址", { aliases: ["OTHER"] }), permalink: "https://evil.test/@pinned/post/OTHER" },
    { ...c("wrong-code", "pinned", "其他貼文"), permalink: "/@pinned/post/UNRELATED" },
    { ...c("wrong-author", "pinned", "其他作者", { aliases: ["AUTHOR"] }), permalink: "/@someone/post/AUTHOR" },
    c("label", "pinned", "只有文字標籤"),
  ], "op");
  assert.deepEqual(rows.map(row => row.role), ["reply", "reply", "unknown", "unknown", "unknown", "unknown"]);
});

test("an eligibility parent conflict cannot be revived through adjacency", () => {
  const rows = buildReplyThreads([
    c("q", "reader", "有冇教學？"),
    c("bad", "op", "有", { parent: null, parentSourceId: null, parentConflict: true }),
    c("valid", "op", "這則有明確 parent", { parent: "q" }),
  ], "op");
  assert.equal(rows[1].answers, null);
  assert.equal(rows[1].pairing, null);
  assert.equal(rows[1].pairingReason, "conflicting_parent");
  assert.deepEqual(rows[0].answeredBy, ["valid"]);
});

test("self, conflicting, ambiguous and cyclic parent identities stay unresolved", () => {
  const rows = buildReplyThreads([
    c("p", "reader", "有冇教學？", { sourceId: "p-source", aliases: ["shared"] }),
    c("other", "reader2", "另一則", { aliases: ["shared"] }),
    c("self", "op", "自己", { parent: "self" }),
    c("conflict", "op", "衝突", { parent: "p", parentSourceId: "other" }),
    c("ambiguous", "op", "不確定", { parent: "shared" }),
    c("left", "reader", "循環一", { parent: "right" }),
    c("right", "op", "循環二", { parent: "left" }),
  ], "op");
  for (const row of rows.slice(2)) assert.equal(row.answers, null, row.id);
  assert.equal(rows[2].pairingReason, "self_parent");
  assert.equal(rows[3].pairingReason, "conflicting_parent");
  assert.equal(rows[4].pairingReason, "unresolved_parent");
  assert.equal(rows[5].pairingReason, "cycle");
  assert.equal(rows[6].pairingReason, "cycle");
});

test("an inferred adjacency cannot override or invalidate an explicit reverse-order parent", () => {
  const rows = buildReplyThreads([c("child", "reader", "追問", { parent: "op-answer" }), c("op-answer", "op", "原先解釋")], "op");
  assert.equal(rows[0].answers, "op-answer");
  assert.equal(rows[0].pairing, "parent");
  assert.equal(rows[1].answers, null);
  assert.deepEqual(rows[1].answeredBy, ["child"]);
});
