import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompareClusterSummaryPrompt,
  buildDeterministicClusterInterpretation,
  parseCompareClusterSummaryResponse,
  type CompareClusterSummaryRequest
} from "../src/compare/cluster-interpretation.ts";

function buildRequest(): CompareClusterSummaryRequest {
  return {
    clusters: [
      {
        captureId: "cap-a",
        analysisUpdatedAt: "2026-04-01T09:00:00.000Z",
        clusterKey: 3,
        author: "alpha",
        postText: "Alpha post text",
        sourceCommentCount: 24,
        keywords: ["support", "policy", "budget"],
        sizeShare: 0.6,
        likeShare: 0.7,
        evidenceCandidates: [
          { comment_id: "a-1", text: "Strongly support this plan", like_count: 9 },
          { comment_id: "a-2", text: "Budget impact looks worth it", like_count: 7 },
          { comment_id: "a-3", text: "This will help the team", like_count: 4 }
        ]
      }
    ]
  };
}

test("buildDeterministicClusterInterpretation turns keywords and shares into fallback copy", () => {
  const interpretation = buildDeterministicClusterInterpretation({
    cluster_key: 3,
    size_share: 0.6,
    like_share: 0.7,
    keywords: ["support", "policy", "budget"]
  });

  assert.equal(interpretation.label, "support / policy / budget");
  assert.match(interpretation.oneLiner, /60%/);
  assert.match(interpretation.oneLiner, /70%/);
  assert.match(interpretation.oneLiner, /support \/ policy \/ budget/);
});

test("buildCompareClusterSummaryPrompt includes cluster metrics and allowed evidence ids", () => {
  const prompt = buildCompareClusterSummaryPrompt(buildRequest());

  assert.match(prompt, /cluster_key/);
  assert.match(prompt, /a-1/);
  assert.match(prompt, /a-2/);
  assert.match(prompt, /support/);
  assert.match(prompt, /Alpha post text/);
});

test("parseCompareClusterSummaryResponse keeps only validated cluster summaries", () => {
  const parsed = parseCompareClusterSummaryResponse(
    JSON.stringify({
      clusters: [
        {
          capture_id: "cap-a",
          cluster_id: 3,
          label: "支持政策預算",
          one_liner: "這群回應主要支持政策與預算方向，互動也相對集中。",
          label_style: "descriptive",
          evidence_ids: ["a-1", "a-2"]
        },
        {
          capture_id: "cap-a",
          cluster_id: 4,
          label: "無效輸出",
          one_liner: "這筆 cluster 不存在。",
          label_style: "descriptive",
          evidence_ids: ["a-x", "a-y"]
        }
      ]
    }),
    buildRequest()
  );

  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], {
    captureId: "cap-a",
    clusterKey: 3,
    label: "支持政策預算",
    oneLiner: "這群回應主要支持政策與預算方向，互動也相對集中。",
    evidenceIds: ["a-1", "a-2"]
  });
});
