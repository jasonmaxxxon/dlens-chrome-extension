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

test("buildDeterministicClusterInterpretation produces observation, reading, and oneLiner", () => {
  const interpretation = buildDeterministicClusterInterpretation({
    cluster_key: 3,
    size_share: 0.6,
    like_share: 0.7,
    keywords: ["support", "policy", "budget"]
  });

  assert.equal(interpretation.label, "support / policy / budget");
  assert.ok(interpretation.observation.length > 0);
  assert.ok(interpretation.reading.length > 0);
  // oneLiner is observation + reading combined
  assert.ok(interpretation.oneLiner.includes(interpretation.observation));
  assert.match(interpretation.oneLiner, /60%/);
  assert.match(interpretation.oneLiner, /70%/);
  assert.match(interpretation.oneLiner, /support \/ policy \/ budget/);
});

test("buildDeterministicClusterInterpretation avoids weak generic labels", () => {
  const interpretation = buildDeterministicClusterInterpretation({
    cluster_key: 4,
    size_share: 0.17,
    like_share: 0.1,
    keywords: ["general"]
  });

  assert.doesNotMatch(interpretation.label, /^general$/i);
  assert.doesNotMatch(interpretation.oneLiner, /圍繞「general」/i);
});

test("buildCompareClusterSummaryPrompt includes observation and reading in output spec", () => {
  const prompt = buildCompareClusterSummaryPrompt(buildRequest());

  assert.match(prompt, /observation/);
  assert.match(prompt, /reading/);
  assert.match(prompt, /one_liner/);
  assert.match(prompt, /cluster_key/);
  assert.match(prompt, /a-1/);
  assert.match(prompt, /a-2/);
  assert.match(prompt, /support/);
  assert.match(prompt, /Alpha post text/);
});

test("parseCompareClusterSummaryResponse keeps only validated cluster summaries with observation and reading", () => {
  const parsed = parseCompareClusterSummaryResponse(
    JSON.stringify({
      clusters: [
        {
          capture_id: "cap-a",
          cluster_id: 3,
          label: "支持政策預算",
          observation: "這群留言以集中回聲型方式回應原文，聚焦在「支持政策預算」；佔 60% 留言、70% 按讚。",
          reading: "它更像情緒支持的集中入口，而不是問題拆解。",
          one_liner: "這群留言以集中回聲型方式回應原文，支持政策聲音高度一致。",
          label_style: "descriptive",
          evidence_ids: ["a-1", "a-2"]
        },
        {
          capture_id: "cap-a",
          cluster_id: 4,
          label: "無效輸出",
          observation: "不存在的 cluster。",
          reading: "無意義。",
          one_liner: "這筆 cluster 不存在。",
          label_style: "descriptive",
          evidence_ids: ["a-x", "a-y"]
        }
      ]
    }),
    buildRequest()
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.captureId, "cap-a");
  assert.equal(parsed[0]?.clusterKey, 3);
  assert.equal(parsed[0]?.label, "支持政策預算");
  assert.ok(parsed[0]?.observation.length > 0);
  assert.ok(parsed[0]?.reading.length > 0);
  assert.equal(parsed[0]?.oneLiner, "這群留言以集中回聲型方式回應原文，支持政策聲音高度一致。");
  assert.deepEqual(parsed[0]?.evidenceIds, ["a-1", "a-2"]);
});

test("parseCompareClusterSummaryResponse synthesizes oneLiner from observation+reading when one_liner missing", () => {
  const parsed = parseCompareClusterSummaryResponse(
    JSON.stringify({
      clusters: [
        {
          capture_id: "cap-a",
          cluster_id: 3,
          label: "支持政策預算",
          observation: "這群留言以集中回聲型方式回應原文。",
          reading: "它是情緒支持的入口。",
          one_liner: "",
          label_style: "descriptive",
          evidence_ids: ["a-1", "a-2"]
        }
      ]
    }),
    buildRequest()
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.oneLiner, "這群留言以集中回聲型方式回應原文。它是情緒支持的入口。");
});

test("parseCompareClusterSummaryResponse rejects weak generic AI labels", () => {
  const parsed = parseCompareClusterSummaryResponse(
    JSON.stringify({
      clusters: [
        {
          capture_id: "cap-a",
          cluster_id: 3,
          label: "一般回應",
          observation: "這群留言只是一般回應。",
          reading: "普通。",
          one_liner: "這群留言只是一般回應。",
          label_style: "descriptive",
          evidence_ids: ["a-1", "a-2"]
        }
      ]
    }),
    buildRequest()
  );

  assert.equal(parsed.length, 0);
});
