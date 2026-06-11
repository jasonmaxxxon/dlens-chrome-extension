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

test("generateTopicSynthesis groups non-work topics by repeated top keywords", () => {
  const signals = [
    { signal: makeSignal("sig-1", "item-1"), item: makeItem("item-1", "alpha", [
        { keywords: ["browser automation", "agent workflow"], size_share: 0.6, like_share: 0.5 },
        { keywords: ["mcp integration"], size_share: 0.4 }
      ], undefined, "Threads users compare browser automation and MCP tool calling for agent workflows.") },
    { signal: makeSignal("sig-2", "item-2"), item: makeItem("item-2", "beta", [
        { keywords: ["browser automation"], size_share: 0.7 },
        { keywords: ["recurring crawl"], size_share: 0.2 }
      ], undefined, "A builder wants browser automation to keep a recurring crawl alive.") },
    { signal: makeSignal("sig-3", "item-3"), item: makeItem("item-3", "gamma", [
        { keywords: ["recurring crawl"], size_share: 0.55 },
        { keywords: ["agent workflow"], size_share: 0.3 }
      ], undefined, "The thread is about recurring crawl jobs and scheduler recovery.") },
    { signal: makeSignal("sig-4", "item-4"), item: makeItem("item-4", "delta", [
        { keywords: ["prompt injection"], size_share: 0.8 }
      ], undefined, "Prompt injection shows up as a separate security concern.") }
  ];

  const synthesis = generateTopicSynthesis({
    totalSignalCount: 5,
    signals,
    generatedAt: "2026-05-11T00:00:00.000Z"
  });

  assert.ok(synthesis, "expected synthesis to be produced");
  assert.equal(synthesis!.generatedFromCount, 4);
  assert.equal(synthesis!.totalSignalCount, 5);
  assert.equal(synthesis!.generatorVersion, TOPIC_SYNTHESIS_VERSION);

  assert.equal(synthesis!.commonClusters[0]?.keyword, "browser automation");
  assert.equal(synthesis!.commonClusters[0]?.signalCount, 2);
  assert.deepEqual(synthesis!.commonClusters[0]?.exampleSignalIds, ["sig-1", "sig-2"]);

  assert.ok(synthesis!.observations.some((observation) =>
    observation.text.includes("browser automation") && observation.text.includes("2 篇")
  ));
  assert.ok(synthesis!.memes.some((meme) =>
    meme.phrase === "browser automation" && meme.occurrences === 2
  ));
  assert.equal(synthesis!.memes.some((meme) => meme.phrase === "prompt injection"), false);

  // Outliers: singleton top-keyword groups remain adjacent material, not forced into a domain bucket.
  assert.ok(synthesis!.outliers.some((outlier) => outlier.signalId === "sig-4"));
  assert.ok(synthesis!.outliers.some((outlier) =>
    outlier.signalId === "sig-4" && outlier.reason.includes("prompt injection")
  ));

  assert.deepEqual(synthesis!.verbalTechniques, []);
  assert.equal(synthesis!.sentimentNarrative, "");
  assert.equal(
    /辭職|上班|職場|薪水小偷|工作焦慮|想逃離/.test(JSON.stringify(synthesis)),
    false
  );
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
  assert.equal(topicSynthesisStaleReason({ ...base, generatorVersion: "v-old" }, 4), "stale");
  assert.equal(topicSynthesisStaleReason(null, 0), "absent");
  assert.equal(TOPIC_SYNTHESIS_MIN_ANALYZED >= 2, true);
});
