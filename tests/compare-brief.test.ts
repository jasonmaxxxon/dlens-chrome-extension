import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompareBriefCacheKey,
  buildCompareBriefPrompt,
  buildDeterministicCompareBrief,
  parseCompareBriefResponse,
  type CompareBriefRequest
} from "../src/compare/brief.ts";

function buildRequest(): CompareBriefRequest {
  return {
    left: {
      captureId: "cap-a",
      analysisUpdatedAt: "2026-04-02T08:00:00.000Z",
      author: "alpha",
      text: "Alpha says the policy should move forward now.",
      ageLabel: "Approx. 2h old",
      metricsCoverageLabel: "All core metrics captured",
      sourceCommentCount: 40,
      engagement: { likes: 120, comments: 30, reposts: 8, forwards: 4, views: 2400 },
      velocity: { likesPerHour: 60, commentsPerHour: 15, repostsPerHour: 4, forwardsPerHour: 2 },
      clusters: [
        {
          clusterKey: 1,
          keywords: ["support", "policy", "budget"],
          sizeShare: 0.58,
          likeShare: 0.7,
          evidenceCandidates: [
            { comment_id: "a-1", text: "Support this policy now", like_count: 10 },
            { comment_id: "a-2", text: "Budget impact is worth it", like_count: 8 }
          ]
        }
      ]
    },
    right: {
      captureId: "cap-b",
      analysisUpdatedAt: "2026-04-02T09:00:00.000Z",
      author: "beta",
      text: "Beta argues the policy is risky and badly timed.",
      ageLabel: "Approx. 3d old",
      metricsCoverageLabel: "Partial metrics only",
      sourceCommentCount: 52,
      engagement: { likes: 90, comments: 26, reposts: 3, forwards: null, views: 1800 },
      velocity: { likesPerHour: 1.2, commentsPerHour: 0.4, repostsPerHour: 0.1, forwardsPerHour: null },
      clusters: [
        {
          clusterKey: 4,
          keywords: ["risk", "timing", "harm"],
          sizeShare: 0.63,
          likeShare: 0.66,
          evidenceCandidates: [
            { comment_id: "b-1", text: "This timing is harmful", like_count: 11 },
            { comment_id: "b-2", text: "Too risky to launch now", like_count: 7 }
          ]
        }
      ]
    }
  };
}

test("buildCompareBriefCacheKey changes when either side analysis version changes", () => {
  const request = buildRequest();
  const first = buildCompareBriefCacheKey(request, "google", "v1");
  const second = buildCompareBriefCacheKey(
    {
      ...request,
      right: {
        ...request.right,
        analysisUpdatedAt: "2026-04-02T09:05:00.000Z"
      }
    },
    "google",
    "v1"
  );

  assert.notEqual(first, second);
});

test("buildCompareBriefPrompt includes metrics, velocity, and allowed evidence references", () => {
  const prompt = buildCompareBriefPrompt(buildRequest());

  assert.match(prompt, /claim_contrast/);
  assert.match(prompt, /emotion_contrast/);
  assert.match(prompt, /risk_signals/);
  assert.match(prompt, /likes_per_hour/);
  assert.match(prompt, /a-1/);
  assert.match(prompt, /b-1/);
});

test("parseCompareBriefResponse keeps only evidence ids that exist in the request", () => {
  const parsed = parseCompareBriefResponse(
    JSON.stringify({
      headline: "兩邊都引出鮮明分眾，但主張焦點不同。",
      claim_contrast: "A 的高互動留言集中在支持政策推進，B 則更聚焦風險與時機質疑。",
      emotion_contrast: "A 偏向動員與支持語氣，B 偏向警戒與質疑語氣。",
      risk_signals: [
        { label: "單一敘事集中", reason: "兩側 top cluster 都拿走過半留言。", side: "both" }
      ],
      representative_evidence: [
        { capture_id: "cap-a", cluster_id: 1, comment_id: "a-1", side: "left", reason: "代表支持政策的高互動樣本。" },
        { capture_id: "cap-b", cluster_id: 4, comment_id: "b-1", side: "right", reason: "代表風險質疑的高互動樣本。" },
        { capture_id: "cap-b", cluster_id: 4, comment_id: "missing", side: "right", reason: "無效 evidence。" }
      ],
      notes: "整體互動量接近，但短時動能差異明顯。",
      confidence: "medium"
    }),
    buildRequest()
  );

  assert.ok(parsed);
  assert.equal(parsed?.representativeEvidence.length, 2);
  assert.deepEqual(parsed?.representativeEvidence.map((item) => item.commentId), ["a-1", "b-1"]);
});

test("parseCompareBriefResponse accepts code-fenced JSON", () => {
  const parsed = parseCompareBriefResponse(
    [
      "```json",
      JSON.stringify({
        headline: "兩邊都引出鮮明分眾，但主張焦點不同。",
        claim_contrast: "A 的高互動留言集中在支持政策推進，B 則更聚焦風險與時機質疑。",
        emotion_contrast: "A 偏向動員與支持語氣，B 偏向警戒與質疑語氣。",
        risk_signals: [
          { label: "單一敘事集中", reason: "兩側 top cluster 都拿走過半留言。", side: "both" }
        ],
        representative_evidence: [
          { capture_id: "cap-a", cluster_id: 1, comment_id: "a-1", side: "left", reason: "代表支持政策的高互動樣本。" }
        ],
        notes: "整體互動量接近，但短時動能差異明顯。",
        confidence: "medium"
      }),
      "```"
    ].join("\n"),
    buildRequest()
  );

  assert.ok(parsed);
  assert.equal(parsed?.headline, "兩邊都引出鮮明分眾，但主張焦點不同。");
});

test("parseCompareBriefResponse rejects partial payloads", () => {
  const parsed = parseCompareBriefResponse(
    JSON.stringify({
      headline: "只有標題",
      claim_contrast: "只有主張差異"
    }),
    buildRequest()
  );

  assert.equal(parsed, null);
});

test("buildDeterministicCompareBrief produces a readable fallback brief", () => {
  const brief = buildDeterministicCompareBrief(buildRequest(), "AI summary unavailable.");

  assert.equal(brief.source, "fallback");
  assert.match(brief.headline, /support/);
  assert.match(brief.claimContrast, /risk/);
  assert.match(brief.emotionContrast, /互動/);
  assert.ok(brief.riskSignals.length >= 1);
  assert.equal(brief.representativeEvidence.length, 2);
});
