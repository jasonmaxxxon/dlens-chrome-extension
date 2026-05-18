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
  itemsById.set("item-1", makeItem("item-1", "alpha", [{ keywords: ["裸辭", "壓力"], size_share: 0.6 }], "succeeded", "90後初入職場日記（1） 只係想裸辭下，工作壓力好大"));
  itemsById.set("item-2", makeItem("item-2", "beta", [{ keywords: ["裸辭"], size_share: 0.5 }], "succeeded", "真係好想裸辭，搵工時勢真係好差"));
  itemsById.set("item-3", makeItem("item-3", "gamma", [{ keywords: ["壓力", "薪水"], size_share: 0.7 }], "succeeded", "日頭做 PR 拆彈，工作壓力爆煲"));
  itemsById.set("item-4", makeItem("item-4", "delta", [{ keywords: ["寵物"], size_share: 0.9 }]));
  return {
    sessionId: "session-1",
    topics: [
      { topic: makeTopic("topic-1", "工作", ["sig-1", "sig-2"]), signals: [makeSignal("sig-1", "item-1"), makeSignal("sig-2", "item-2")] },
      { topic: makeTopic("topic-2", "金錢", ["sig-3"]), signals: [makeSignal("sig-3", "item-3")] },
      { topic: makeTopic("topic-3", "生活", ["sig-4"]), signals: [makeSignal("sig-4", "item-4")] }
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
  assert.equal(synthesis.contributingTopicCount, 3);

  // 工作焦慮與耗竭 spans topic-1 (item-1) and topic-2 (item-3) → cross-topic, should appear
  const pressureCluster = synthesis.commonClusters.find((cluster) => cluster.keyword === "工作焦慮與耗竭");
  assert.ok(pressureCluster, "expected 工作焦慮與耗竭 cluster spanning 2 topics");
  assert.equal(pressureCluster!.topicCount, 2);
  assert.equal(pressureCluster!.signalCount, 3);

  // 想辭職與逃離工作 only in topic-1 → filtered out
  assert.equal(synthesis.commonClusters.some((cluster) => cluster.keyword === "想辭職與逃離工作"), false);

  // 寵物 only in topic-3 → filtered out
  assert.equal(synthesis.commonClusters.some((cluster) => cluster.keyword === "寵物"), false);

  // topicCoverage covers all topics
  assert.equal(synthesis.topicCoverage.length, 3);
  const t1 = synthesis.topicCoverage.find((coverage) => coverage.topicId === "topic-1")!;
  assert.equal(t1.analyzedCount, 2);
  assert.equal(t1.totalCount, 2);
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
