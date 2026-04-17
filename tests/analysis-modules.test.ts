import assert from "node:assert/strict";
import test from "node:test";

import type {
  AnalysisClusterSnapshot,
  AnalysisEvidenceSnapshot,
  AnalysisSnapshot,
} from "../src/contracts/ingest.ts";
import {
  buildClusterCompareRows,
  buildClusterSummaries,
  getDominanceLabel,
} from "../src/analysis/cluster-summary.ts";
import {
  buildEvidenceLookup,
  pickEvidenceComments,
} from "../src/analysis/evidence.ts";
import {
  buildClusterInterpretationSeed,
  selectContextCards,
  validateClusterOneLinerPayload,
} from "../src/analysis/experimental/cip.ts";
import {
  computeLikeShareMetrics,
  extractTopKeywords,
} from "../src/analysis/experimental/metrics.ts";

function buildAnalysis(overrides?: Partial<AnalysisSnapshot>): AnalysisSnapshot {
  const clusters: AnalysisClusterSnapshot[] = [
    { cluster_key: 0, size_share: 0.6, like_share: 0.7, keywords: ["support", "policy"] },
    { cluster_key: 1, size_share: 0.3, like_share: 0.2, keywords: ["anger", "harm"] },
    { cluster_key: 2, size_share: 0.1, like_share: 0.1, keywords: ["noise"] },
  ];
  const evidence: AnalysisEvidenceSnapshot[] = [
    {
      cluster_key: 0,
      comments: [
        { comment_id: "c3", text: "third quote", like_count: 4, author: "gamma" },
        { comment_id: "c1", text: "best quote", like_count: 9, author: "alpha" },
        { comment_id: "c2", text: "second quote", like_count: 9, author: "beta" },
      ],
    },
    {
      cluster_key: 1,
      comments: [{ comment_id: "c4", text: "counter quote", like_count: 3, author: "delta" }],
    },
  ];

  return {
    id: "analysis-1",
    capture_id: "cap-1",
    status: "succeeded",
    stage: "final",
    analysis_version: "v1",
    source_comment_count: 10,
    clusters,
    evidence,
    metrics: {
      n_clusters: 3,
      dominance_ratio_top1: 0.7,
      gini_like_share: 0.44,
    },
    generated_at: "2026-04-01T10:00:00Z",
    last_error: null,
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

test("pickEvidenceComments sorts by like_count desc with stable tie-breakers", () => {
  const analysis = buildAnalysis();
  const picked = pickEvidenceComments(analysis.evidence, 0, 2);

  assert.deepEqual(
    picked.map((comment) => comment.comment_id),
    ["c1", "c2"],
  );
});

test("buildEvidenceLookup groups comments by cluster_key", () => {
  const analysis = buildAnalysis();
  const lookup = buildEvidenceLookup(analysis.evidence);

  assert.equal(lookup.get(0)?.length, 3);
  assert.equal(lookup.get(1)?.[0]?.comment_id, "c4");
});

test("buildClusterSummaries ranks clusters and attaches top evidence", () => {
  const summaries = buildClusterSummaries(buildAnalysis(), 2);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.cluster.cluster_key, 0);
  assert.equal(summaries[0]?.evidence[0]?.comment_id, "c1");
  assert.equal(summaries[1]?.cluster.cluster_key, 1);
});

test("buildClusterSummaries suppresses low-signal micro-clusters and preserves the dominant discussion", () => {
  const summaries = buildClusterSummaries(
    buildAnalysis({
      source_comment_count: 6,
      clusters: [
        { cluster_key: 0, size_share: 0.67, like_share: 0.84, keywords: ["support", "policy"] },
        { cluster_key: 1, size_share: 0.17, like_share: 0.1, keywords: ["general"] },
        { cluster_key: 2, size_share: 0.16, like_share: 0.06, keywords: ["noise"] },
      ],
      evidence: [
        {
          cluster_key: 0,
          comments: [{ comment_id: "c1", text: "dominant evidence", like_count: 9, author: "alpha" }],
        },
        {
          cluster_key: 1,
          comments: [{ comment_id: "c2", text: "one-off reply", like_count: 1, author: "beta" }],
        },
        {
          cluster_key: 2,
          comments: [{ comment_id: "c3", text: "tiny reply", like_count: 1, author: "gamma" }],
        },
      ],
    }),
    5,
  );

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.cluster.cluster_key, 0);
});

test("getDominanceLabel maps dominance ratio into Chinese buckets", () => {
  assert.equal(getDominanceLabel(0.72), "高度集中");
  assert.equal(getDominanceLabel(0.55), "中度分散");
  assert.equal(getDominanceLabel(0.31), "高度分散");
  assert.equal(getDominanceLabel(null), "未定");
});

test("buildClusterCompareRows pairs ranked cluster summaries by row", () => {
  const left = buildAnalysis();
  const right = buildAnalysis({
    id: "analysis-2",
    capture_id: "cap-2",
    clusters: [
      { cluster_key: 9, size_share: 0.5, like_share: 0.45, keywords: ["skeptic"] },
      { cluster_key: 8, size_share: 0.2, like_share: 0.25, keywords: ["agree"] },
    ],
    evidence: [
      { cluster_key: 9, comments: [{ comment_id: "r1", text: "skeptical", like_count: 5 }] },
      { cluster_key: 8, comments: [{ comment_id: "r2", text: "agree mostly", like_count: 2 }] },
    ],
  });

  const rows = buildClusterCompareRows(left, right, 3);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.left?.cluster.cluster_key, 0);
  assert.equal(rows[0]?.right?.cluster.cluster_key, 9);
  assert.equal(rows[1]?.right?.cluster.cluster_key, 8);
});

test("extractTopKeywords keeps English tokens and CJK bigrams", () => {
  const keywords = extractTopKeywords(
    [
      "Support this policy now",
      "政策支持需要更多討論",
      "policy support matters",
    ],
    6,
  );

  assert.ok(keywords.includes("support"));
  assert.ok(keywords.includes("policy"));
  assert.ok(keywords.some((token) => token.includes("政策") || token.includes("支持")));
});

test("computeLikeShareMetrics returns cluster share, gini, and top1 dominance", () => {
  const metrics = computeLikeShareMetrics([
    { cluster_key: 0, likes: 70, size: 6 },
    { cluster_key: 1, likes: 20, size: 3 },
    { cluster_key: 2, likes: 10, size: 1 },
  ]);

  assert.equal(metrics.cluster_like_share[0]?.cluster_id, 0);
  assert.equal(metrics.cluster_like_share[0]?.share, 0.7);
  assert.equal(metrics.dominance_ratio_top1, 0.7);
  assert.ok(metrics.gini_like_share > 0);
});

test("selectContextCards follows role order and truncates oversized text", () => {
  const cards = selectContextCards({
    goldenDetail: {
      central: { comment_id: "c1" },
      leader: { comment_id: "c2" },
      radical: { comment_id: "c3" },
    },
    commentsById: {
      c1: { id: "c1", text: "a".repeat(260), like_count: 9, reply_count: 3, parent_comment_id: "p1" },
      c2: { id: "c2", text: "leader text", like_count: 7, reply_count: 1 },
      c3: { id: "c3", text: "radical text", like_count: 2, reply_count: 0 },
      p1: { id: "p1", text: "parent context" },
      s1: { id: "s1", text: "sibling context", like_count: 5, reply_count: 0 },
    },
    commentsByParent: {
      p1: [{ id: "c1", text: "a".repeat(260) }, { id: "s1", text: "sibling context", like_count: 5, reply_count: 0 }],
    },
    rootPostText: "root text",
    clusterMetrics: { size_share: 0.6, like_share: 0.7 },
    maxCards: 2,
  });

  assert.equal(cards.contextCards.length, 2);
  assert.deepEqual(cards.evidenceIds, ["c1", "c2"]);
  assert.match(cards.contextCards[0]?.focus_comment.text ?? "", /\.\.\.$/);
});

test("buildClusterInterpretationSeed shapes allowed and required evidence ids", () => {
  const seed = buildClusterInterpretationSeed({
    clusterKey: 7,
    clusterMetrics: { size_share: 0.4, like_share: 0.6 },
    contextCards: [{ focus_comment: { internal_id: "c1", text: "hello" }, root_post: { text: "root" }, siblings_sample: [], cluster_metrics: {}, context_integrity: "ok" }],
    evidenceIds: ["c1", "c2"],
  });

  assert.equal(seed.cluster_id, 7);
  assert.deepEqual(seed.allowed_evidence_ids, ["c1", "c2"]);
  assert.deepEqual(seed.required_evidence_ids, ["c1", "c2"]);
});

test("validateClusterOneLinerPayload enforces descriptive labels and required evidence ids", () => {
  const valid = validateClusterOneLinerPayload(
    {
      cluster_id: 0,
      label: "支持政策聲量",
      one_liner: "多數高互動留言傾向支持政策方向。",
      label_style: "descriptive",
      evidence_ids: ["c1", "c2"],
    },
    ["c1", "c2", "c3"],
    ["c1"],
  );
  const invalid = validateClusterOneLinerPayload(
    {
      cluster_id: 0,
      label: "Support cluster",
      one_liner: "Too generic",
      label_style: "vague",
      evidence_ids: ["c9"],
    },
    ["c1", "c2", "c3"],
    ["c1"],
  );

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("label_not_traditional_chinese"));
  assert.ok(invalid.errors.includes("evidence_id_not_allowed"));
});
