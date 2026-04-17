import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceAnnotationCacheKey,
  buildEvidenceAnnotationPrompt,
  buildDeterministicEvidenceAnnotation,
  parseEvidenceAnnotationResponse,
  type EvidenceAnnotationQuoteItem,
  type EvidenceAnnotationRequest
} from "../src/compare/evidence-annotation.ts";

function makeQuote(overrides: Partial<EvidenceAnnotationQuoteItem> = {}): EvidenceAnnotationQuoteItem {
  return {
    commentId: "c-1",
    side: "A",
    postAuthor: "alice",
    postText: "政府應加速政策落地。",
    clusterLabel: "政策支持",
    clusterObservation: "這群留言以集中回聲型方式回應原文，聚焦在「政策支持」；佔 58% 留言、70% 按讚。",
    quoteText: "完全支持，早就該做了！",
    likeCount: 12,
    ...overrides
  };
}

function makeRequest(quotes: EvidenceAnnotationQuoteItem[] = [makeQuote()]): EvidenceAnnotationRequest {
  return { quotes };
}

/* ── cache key ── */

test("buildEvidenceAnnotationCacheKey includes provider and promptVersion", () => {
  const key = buildEvidenceAnnotationCacheKey(makeRequest(), "google", "v1");
  assert.match(key, /evidence-annotation/);
  assert.match(key, /v1/);
  assert.match(key, /google/);
});

test("buildEvidenceAnnotationCacheKey is order-independent across commentIds", () => {
  const q1 = makeQuote({ commentId: "c-1" });
  const q2 = makeQuote({ commentId: "c-2" });
  const k1 = buildEvidenceAnnotationCacheKey({ quotes: [q1, q2] }, "google", "v1");
  const k2 = buildEvidenceAnnotationCacheKey({ quotes: [q2, q1] }, "google", "v1");
  assert.equal(k1, k2);
});

test("buildEvidenceAnnotationCacheKey changes when commentIds differ", () => {
  const k1 = buildEvidenceAnnotationCacheKey(makeRequest([makeQuote({ commentId: "c-1" })]), "google", "v1");
  const k2 = buildEvidenceAnnotationCacheKey(makeRequest([makeQuote({ commentId: "c-99" })]), "google", "v1");
  assert.notEqual(k1, k2);
});

/* ── prompt ── */

test("buildEvidenceAnnotationPrompt contains quote block with fields", () => {
  const prompt = buildEvidenceAnnotationPrompt(makeRequest());
  assert.match(prompt, /QUOTE 1/);
  assert.match(prompt, /comment_id=c-1/);
  assert.match(prompt, /side=A/);
  assert.match(prompt, /完全支持，早就該做了！/);
  assert.match(prompt, /政策支持/);
});

test("buildEvidenceAnnotationPrompt instructs no mind-reading", () => {
  const prompt = buildEvidenceAnnotationPrompt(makeRequest());
  assert.match(prompt, /不要猜測/);
  assert.match(prompt, /writer_meaning/);
  assert.match(prompt, /discussion_function/);
  assert.match(prompt, /why_effective/);
  assert.match(prompt, /relation_to_cluster/);
  assert.match(prompt, /phrase_marks/);
});

test("buildEvidenceAnnotationPrompt includes all quotes", () => {
  const q2 = makeQuote({ commentId: "c-2", quoteText: "時機不對，有風險。", side: "B" });
  const prompt = buildEvidenceAnnotationPrompt(makeRequest([makeQuote(), q2]));
  assert.match(prompt, /QUOTE 1/);
  assert.match(prompt, /QUOTE 2/);
  assert.match(prompt, /時機不對/);
});

/* ── parse ── */

test("parseEvidenceAnnotationResponse accepts valid payload", () => {
  const request = makeRequest();
  const raw = JSON.stringify({
    annotations: [{
      comment_id: "c-1",
      phrase_marks: [{ phrase: "早就該做了", label: "情緒共鳴" }],
      writer_meaning: "此留言在語言上表達強烈的支持認同。",
      discussion_function: "情緒共鳴入口",
      why_effective: "語氣直接，用「完全」強化立場。",
      relation_to_cluster: "具體延伸群組的支持回應型態。"
    }]
  });

  const result = parseEvidenceAnnotationResponse(raw, request);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.commentId, "c-1");
  assert.equal(result[0]?.phraseMarks.length, 1);
  assert.equal(result[0]?.phraseMarks[0]?.phrase, "早就該做了");
  assert.equal(result[0]?.phraseMarks[0]?.label, "情緒共鳴");
  assert.equal(result[0]?.writerMeaning, "此留言在語言上表達強烈的支持認同。");
  assert.equal(result[0]?.discussionFunction, "情緒共鳴入口");
  assert.equal(result[0]?.whyEffective, "語氣直接，用「完全」強化立場。");
  assert.equal(result[0]?.relationToCluster, "具體延伸群組的支持回應型態。");
});

test("parseEvidenceAnnotationResponse accepts code-fenced JSON", () => {
  const request = makeRequest();
  const raw = [
    "```json",
    JSON.stringify({
      annotations: [{
        comment_id: "c-1",
        phrase_marks: [],
        writer_meaning: "支持的聲音。",
        discussion_function: "直接回應",
        why_effective: "語氣肯定。",
        relation_to_cluster: "延伸。"
      }]
    }),
    "```"
  ].join("\n");

  const result = parseEvidenceAnnotationResponse(raw, request);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.commentId, "c-1");
});

test("parseEvidenceAnnotationResponse accepts top-level array", () => {
  const request = makeRequest();
  const raw = JSON.stringify([{
    comment_id: "c-1",
    phrase_marks: [],
    writer_meaning: "表達支持。",
    discussion_function: "正向回應",
    why_effective: "簡潔有力。",
    relation_to_cluster: ""
  }]);

  const result = parseEvidenceAnnotationResponse(raw, request);
  assert.equal(result.length, 1);
});

test("parseEvidenceAnnotationResponse rejects unknown commentIds", () => {
  const request = makeRequest();
  const raw = JSON.stringify({
    annotations: [{
      comment_id: "x-999",
      phrase_marks: [],
      writer_meaning: "表達支持。",
      discussion_function: "正向回應",
      why_effective: "簡潔有力。",
      relation_to_cluster: ""
    }]
  });

  const result = parseEvidenceAnnotationResponse(raw, request);
  assert.equal(result.length, 0);
});

test("parseEvidenceAnnotationResponse rejects entries missing required fields", () => {
  const request = makeRequest();
  // missing why_effective → rejected
  const raw = JSON.stringify({
    annotations: [{
      comment_id: "c-1",
      phrase_marks: [],
      writer_meaning: "表達支持。",
      discussion_function: "正向回應"
    }]
  });

  const result = parseEvidenceAnnotationResponse(raw, request);
  assert.equal(result.length, 0);
});

test("parseEvidenceAnnotationResponse caps phrase_marks at 2", () => {
  const request = makeRequest();
  const raw = JSON.stringify({
    annotations: [{
      comment_id: "c-1",
      phrase_marks: [
        { phrase: "早就", label: "A" },
        { phrase: "支持", label: "B" },
        { phrase: "做了", label: "C" }
      ],
      writer_meaning: "表達支持。",
      discussion_function: "正向回應",
      why_effective: "語氣肯定。",
      relation_to_cluster: ""
    }]
  });

  const result = parseEvidenceAnnotationResponse(raw, request);
  assert.equal(result[0]?.phraseMarks.length, 2);
});

test("parseEvidenceAnnotationResponse returns empty array on malformed JSON", () => {
  const result = parseEvidenceAnnotationResponse("not json at all", makeRequest());
  assert.equal(result.length, 0);
});

/* ── deterministic fallback ──
 * Contract: no per-quote content. Fallback returns null so callers cannot
 * accidentally ship cluster-level prose as a per-quote reading. */

test("buildDeterministicEvidenceAnnotation returns null (no fabricated per-quote copy)", () => {
  const quote = makeQuote();
  assert.equal(buildDeterministicEvidenceAnnotation(quote), null);
});
