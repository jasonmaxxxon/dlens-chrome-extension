import assert from "node:assert/strict";
import test from "node:test";

import { buildCompareOneLinerCacheKey, buildCompareOneLinerPrompt, type CompareOneLinerRequest } from "../src/compare/one-liner.ts";

function buildRequest(): CompareOneLinerRequest {
  return {
    left: {
      captureId: "cap-a",
      analysisUpdatedAt: "2026-03-27T10:00:00.000Z",
      author: "alpha",
      text: "post A",
      engagement: { likes: 10, comments: 5 },
      clusters: [{ cluster_key: 0, size_share: 0.6, like_share: 0.8, keywords: ["support", "policy"] }],
      evidence: [{ cluster_key: 0, comments: [{ comment_id: "c1", text: "support this policy", like_count: 7 }] }]
    },
    right: {
      captureId: "cap-b",
      analysisUpdatedAt: "2026-03-27T10:05:00.000Z",
      author: "beta",
      text: "post B",
      engagement: { likes: 8, comments: 3 },
      clusters: [{ cluster_key: 1, size_share: 0.5, like_share: 0.4, keywords: ["harmful", "terrible"] }],
      evidence: [{ cluster_key: 1, comments: [{ comment_id: "c2", text: "this is terrible", like_count: 4 }] }]
    }
  };
}

test("buildCompareOneLinerCacheKey changes when analysis version changes", () => {
  const request = buildRequest();
  const first = buildCompareOneLinerCacheKey(request, "openai", "v1");
  const second = buildCompareOneLinerCacheKey(
    {
      ...request,
      right: {
        ...request.right,
        analysisUpdatedAt: "2026-03-27T10:06:00.000Z"
      }
    },
    "openai",
    "v1"
  );

  assert.notEqual(first, second);
});

test("buildCompareOneLinerPrompt includes evidence text and cluster keywords from both sides", () => {
  const prompt = buildCompareOneLinerPrompt(buildRequest());

  assert.match(prompt, /support this policy/);
  assert.match(prompt, /this is terrible/);
  assert.match(prompt, /support, policy/);
  assert.match(prompt, /harmful, terrible/);
});
