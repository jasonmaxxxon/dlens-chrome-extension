import assert from "node:assert/strict";
import test from "node:test";

import {
  canGenerateTopicSynthesis,
  TOPIC_SYNTHESIS_VERSION,
  generateTopicSynthesis,
  TOPIC_SYNTHESIS_MIN_ANALYZED,
  TOPIC_SYNTHESIS_STALE_DELTA,
  topicSynthesisStaleReason
} from "../src/compare/topic-synthesis.ts";
import type { SessionItem, Signal } from "../src/state/types.ts";

function makeSignal(id: string, itemId?: string): Signal {
  return {
    id,
    sessionId: "session-1",
    itemId,
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-1",
    suggestedTopicIds: [],
    capturedAt: "2026-05-01T00:00:00.000Z"
  };
}

function makeItem(
  id: string,
  author: string,
  clusters: Array<{ keywords: string[]; size_share: number; like_share?: number }>,
  analysisStatus: "succeeded" | "running" | "failed" | "pending" = "succeeded",
  textSnippet = ""
): SessionItem {
  return {
    id,
    descriptor: {
      post_url: `https://example.com/${id}`,
      author_hint: author,
      text_snippet: textSnippet || undefined
    } as SessionItem["descriptor"],
    status: "succeeded",
    addedAt: "2026-05-01T00:00:00.000Z",
    latestCapture: {
      id: `capture-${id}`,
      source_type: "threads",
      capture_type: "post",
      source_page_url: "",
      source_post_url: "",
      canonical_target_url: "",
      author_hint: author,
      text_snippet: textSnippet || null,
      time_token_hint: null,
      dom_anchor: null,
      engagement: {},
      client_context: {},
      raw_payload: {},
      ingestion_status: "succeeded",
      captured_at: "2026-05-01T00:00:00.000Z",
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
      job: null,
      result: null,
      analysis: {
        id: `analysis-${id}`,
        capture_id: `capture-${id}`,
        status: analysisStatus,
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 10,
        clusters: clusters.map((cluster, index) => ({
          cluster_key: index + 1,
          size_share: cluster.size_share,
          like_share: cluster.like_share ?? 0,
          keywords: cluster.keywords
        })),
        evidence: [],
        metrics: {},
        generated_at: "2026-05-01T00:00:00.000Z",
        last_error: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z"
      }
    }
  } as SessionItem;
}

test("generateTopicSynthesis returns null when fewer than the minimum analyzed signals are available", () => {
  const input = {
    totalSignalCount: 1,
    signals: [
      { signal: makeSignal("sig-1", "item-1"), item: makeItem("item-1", "alpha", [{ keywords: ["裸辭"], size_share: 0.5 }]) }
    ]
  };
  assert.equal(canGenerateTopicSynthesis(input), false);
  assert.equal(generateTopicSynthesis(input), null);
});

test("generateTopicSynthesis aggregates clusters and produces sentiment narrative + memes + outliers", () => {
  const signals = [
    { signal: makeSignal("sig-1", "item-1"), item: makeItem("item-1", "alpha", [
        { keywords: ["裸辭", "工作"], size_share: 0.6, like_share: 0.5 },
        { keywords: ["薪水"], size_share: 0.4 }
      ], undefined, "90後初入職場日記（1） 你冇聽錯 我作為90尾 而家先開始入職場 ... 只係想裸辭下") },
    { signal: makeSignal("sig-2", "item-2"), item: makeItem("item-2", "beta", [
        { keywords: ["裸辭"], size_share: 0.7 }
      ], undefined, "屌，感覺而家搵工時勢真係好差 想返份工都難") },
    { signal: makeSignal("sig-3", "item-3"), item: makeItem("item-3", "gamma", [
        { keywords: ["裸辭", "工作"], size_share: 0.55 }
      ], undefined, "日頭做 PR 拆彈，工作壓力好大，表面望落好冷靜準備做嘢") },
    { signal: makeSignal("sig-4", "item-4"), item: makeItem("item-4", "delta", [
        { keywords: ["寵物"], size_share: 0.8 }
      ], undefined, "寵物") }
  ];

  const synthesis = generateTopicSynthesis({
    totalSignalCount: 5,
    signals,
    generatedAt: "2026-05-11T00:00:00.000Z"
  });

  assert.ok(synthesis, "expected synthesis to be produced");
  assert.equal(synthesis!.generatedFromCount, 4);
  assert.equal(synthesis!.totalSignalCount, 5);

  const quitCluster = synthesis!.commonClusters.find((cluster) => cluster.keyword === "想辭職與逃離工作");
  assert.ok(quitCluster, "expected 想辭職與逃離工作 cluster aggregated across signals");
  assert.equal(quitCluster!.signalCount, 3);

  // 寵物 appeared only once → not in memes (which require occurrences >= 2)
  assert.equal(synthesis!.memes.some((meme) => meme.phrase === "寵物"), false);
  // 只要重複出現就應該被拉進 meme / phrase 區
  assert.ok(synthesis!.memes.some((meme) => meme.phrase === "裸辭"));

  // Outliers: the 寵物 signal does not share clusters with the rest
  assert.ok(synthesis!.outliers.some((outlier) => outlier.signalId === "sig-4"));

  // Sentiment narrative mentions count and dominant keyword
  assert.match(synthesis!.sentimentNarrative, /工作如何令人想逃離/);
  assert.match(synthesis!.sentimentNarrative, /4/);
});

test("generateTopicSynthesis skips signals whose analysis is not succeeded", () => {
  const signals = [
    { signal: makeSignal("sig-1", "item-1"), item: makeItem("item-1", "alpha", [{ keywords: ["a"], size_share: 0.6 }], "running") },
    { signal: makeSignal("sig-2", "item-2"), item: makeItem("item-2", "beta", [{ keywords: ["a"], size_share: 0.7 }], "succeeded") },
    { signal: makeSignal("sig-3"), item: undefined }
  ];
  assert.equal(canGenerateTopicSynthesis({ totalSignalCount: 3, signals }), false);
});

test("topicSynthesisStaleReason marks synthesis stale once delta crosses the threshold", () => {
  const base = {
    observations: [],
    commonClusters: [],
    verbalTechniques: [],
    memes: [],
    sentimentNarrative: "x",
    outliers: [],
    generatedFromCount: 4,
    totalSignalCount: 10,
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "deterministic" as const,
    generatorVersion: TOPIC_SYNTHESIS_VERSION
  };
  assert.equal(topicSynthesisStaleReason(base, 4), "fresh");
  assert.equal(topicSynthesisStaleReason(base, 4 + TOPIC_SYNTHESIS_STALE_DELTA - 1), "fresh");
  assert.equal(topicSynthesisStaleReason(base, 4 + TOPIC_SYNTHESIS_STALE_DELTA), "stale");
  // deletion: negative delta must also trigger stale
  assert.equal(topicSynthesisStaleReason(base, 4 - TOPIC_SYNTHESIS_STALE_DELTA + 1), "fresh");
  assert.equal(topicSynthesisStaleReason(base, 4 - TOPIC_SYNTHESIS_STALE_DELTA), "stale");
  assert.equal(topicSynthesisStaleReason(null, 0), "absent");
  assert.equal(TOPIC_SYNTHESIS_MIN_ANALYZED >= 2, true);
});
