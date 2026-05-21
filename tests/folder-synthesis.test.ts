import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFolderSynthesisEligibility,
  folderSynthesisStaleReason,
  FOLDER_SYNTHESIS_MIN_ANALYZED,
  FOLDER_SYNTHESIS_MIN_TOPICS,
  FOLDER_SYNTHESIS_STALE_DELTA,
  FOLDER_SYNTHESIS_VERSION,
  generateFolderSynthesis,
  type FolderSynthesisInput
} from "../src/compare/folder-synthesis.ts";
import type { SessionItem, Signal, Topic } from "../src/state/types.ts";

function makeTopic(id: string, name: string, signalIds: string[]): Topic {
  return {
    id,
    sessionId: "session-1",
    name,
    description: "",
    status: "watching",
    tags: [],
    signalIds,
    pairIds: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    synthesis: null
  };
}

function makeSignal(id: string, itemId: string): Signal {
  return {
    id,
    sessionId: "session-1",
    itemId,
    source: "threads",
    inboxStatus: "assigned",
    topicId: undefined,
    suggestedTopicIds: [],
    capturedAt: "2026-05-01T00:00:00.000Z"
  };
}

function makeItem(
  id: string,
  author: string,
  clusters: Array<{ keywords: string[]; size_share: number }>,
  status: "succeeded" | "running" | "failed" = "succeeded",
  textSnippet = ""
): SessionItem {
  return {
    id,
    descriptor: { post_url: `https://x/${id}`, author_hint: author, text_snippet: textSnippet || undefined } as SessionItem["descriptor"],
    status: "succeeded",
    addedAt: "2026-05-01T00:00:00.000Z",
    latestCapture: {
      id: `c-${id}`,
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
        id: `a-${id}`,
        capture_id: `c-${id}`,
        status,
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 10,
        clusters: clusters.map((cluster, index) => ({
          cluster_key: index + 1,
          size_share: cluster.size_share,
          like_share: 0,
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

function buildInput(): FolderSynthesisInput {
  const itemsById = new Map<string, SessionItem>();
  itemsById.set("item-1", makeItem("item-1", "alpha", [
    { keywords: ["prompt caching", "token reuse"], size_share: 0.6 }
  ], "succeeded", "Builders compare prompt caching across Claude Code and other AI tools."));
  itemsById.set("item-2", makeItem("item-2", "beta", [
    { keywords: ["context window", "long context"], size_share: 0.5 }
  ], "succeeded", "Benchmark thread about context window limits in agent sessions."));
  itemsById.set("item-3", makeItem("item-3", "gamma", [
    { keywords: ["prompt caching", "cost control"], size_share: 0.7 }
  ], "succeeded", "Claude Code adoption discussion turns on prompt caching and cost control."));
  itemsById.set("item-4", makeItem("item-4", "delta", [
    { keywords: ["tool use latency", "agent workflow"], size_share: 0.9 }
  ], "succeeded", "Tool use latency makes agent workflows feel slower than expected."));
  return {
    sessionId: "session-1",
    topics: [
      { topic: makeTopic("topic-1", "AI tool benchmarking", ["sig-1", "sig-2"]), signals: [makeSignal("sig-1", "item-1"), makeSignal("sig-2", "item-2")] },
      { topic: makeTopic("topic-2", "Claude Code adoption", ["sig-3", "sig-4"]), signals: [makeSignal("sig-3", "item-3"), makeSignal("sig-4", "item-4")] }
    ],
    itemsById,
    generatedAt: "2026-05-11T00:00:00.000Z"
  };
}

test("evaluateFolderSynthesisEligibility blocks generation until both min thresholds are met", () => {
  const sparse: FolderSynthesisInput = {
    sessionId: "s",
    topics: [
      { topic: makeTopic("t-1", "A", ["sig-1"]), signals: [makeSignal("sig-1", "item-1")] }
    ],
    itemsById: new Map([["item-1", makeItem("item-1", "x", [{ keywords: ["a"], size_share: 0.5 }])]])
  };
  const sparseEval = evaluateFolderSynthesisEligibility(sparse);
  assert.equal(sparseEval.meetsAnalyzedMin, false);
  assert.equal(sparseEval.meetsTopicMin, false);
  assert.equal(generateFolderSynthesis(sparse), null);
  assert.ok(FOLDER_SYNTHESIS_MIN_ANALYZED >= 3);
  assert.ok(FOLDER_SYNTHESIS_MIN_TOPICS >= 2);
});

test("generateFolderSynthesis filters clusters to only those spanning multiple topics", () => {
  const input = buildInput();
  const synthesis = generateFolderSynthesis(input)!;
  assert.equal(synthesis.generatorVersion, FOLDER_SYNTHESIS_VERSION);
  assert.equal(synthesis.generatedFromCount, 4);
  assert.equal(synthesis.contributingTopicCount, 2);

  const cachingCluster = synthesis.commonClusters.find((cluster) => cluster.keyword === "prompt caching");
  assert.ok(cachingCluster, "expected prompt caching cluster spanning 2 topics");
  assert.equal(cachingCluster!.topicCount, 2);
  assert.equal(cachingCluster!.signalCount, 2);
  assert.deepEqual(cachingCluster!.topicIds, ["topic-1", "topic-2"]);

  assert.ok(synthesis.observations.some((observation) =>
    observation.text.includes("prompt caching") && observation.text.includes("橫跨 2 個主題")
  ));

  assert.deepEqual(synthesis.verbalTechniques, []);
  assert.equal(synthesis.sentimentNarrative, "");
  assert.equal(
    /工作|辭職|薪水|焦慮|裸辭|職場/.test(JSON.stringify(synthesis)),
    false
  );

  assert.equal(synthesis.topicCoverage.length, 2);
  const t1 = synthesis.topicCoverage.find((coverage) => coverage.topicId === "topic-1")!;
  assert.equal(t1.analyzedCount, 2);
  assert.equal(t1.totalCount, 2);
});

test("generateFolderSynthesis filters out single-topic keywords", () => {
  const synthesis = generateFolderSynthesis(buildInput())!;

  assert.equal(synthesis.commonClusters.some((cluster) => cluster.keyword === "context window"), false);
  assert.equal(synthesis.commonClusters.some((cluster) => cluster.keyword === "tool use latency"), false);
});

test("generateFolderSynthesis memes only include cross-topic keywords", () => {
  const synthesis = generateFolderSynthesis(buildInput())!;

  assert.ok(synthesis.memes.some((meme) =>
    meme.phrase === "prompt caching"
    && meme.occurrences === 2
    && meme.topicIds.length === 2
  ));
  assert.equal(synthesis.memes.some((meme) => meme.phrase === "context window"), false);
  assert.equal(synthesis.memes.some((meme) => meme.phrase === "tool use latency"), false);
});

test("folderSynthesisStaleReason marks synthesis stale once delta crosses the threshold", () => {
  const base = {
    sessionId: "s",
    observations: [],
    commonClusters: [],
    memes: [],
    verbalTechniques: [],
    sentimentNarrative: "x",
    topicCoverage: [],
    generatedFromCount: 4,
    totalSignalCount: 10,
    contributingTopicCount: 2,
    generatedAt: "2026-05-11T00:00:00.000Z",
    generator: "deterministic" as const,
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };
  assert.equal(folderSynthesisStaleReason(base, 4), "fresh");
  assert.equal(folderSynthesisStaleReason(base, 4 + FOLDER_SYNTHESIS_STALE_DELTA), "stale");
  // deletion: negative delta must also trigger stale
  assert.equal(folderSynthesisStaleReason(base, 4 - FOLDER_SYNTHESIS_STALE_DELTA + 1), "fresh");
  assert.equal(folderSynthesisStaleReason(base, 4 - FOLDER_SYNTHESIS_STALE_DELTA), "stale");
  assert.equal(folderSynthesisStaleReason(null, 0), "absent");
});
