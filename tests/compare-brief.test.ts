import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompareBriefCacheKey,
  buildCompareBriefPrompt,
  buildDeterministicCompareBrief,
  normalizeCompareBrief,
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

test("buildCompareBriefPrompt uses structured format with evidence catalog and new field names", () => {
  const prompt = buildCompareBriefPrompt(buildRequest());

  // New output schema field names
  assert.match(prompt, /why_it_matters/);
  assert.match(prompt, /a_reading/);
  assert.match(prompt, /b_reading/);
  assert.match(prompt, /creator_cue/);
  assert.match(prompt, /supporting_observations/);
  assert.match(prompt, /keywords/);
  assert.match(prompt, /audience_alignment_left/);

  // Evidence catalog format — comment_ids become aliases, text content is present
  assert.match(prompt, /EVIDENCE CATALOG/);
  assert.match(prompt, /\[e1\]/);
  assert.match(prompt, /Support this policy now/);
  assert.match(prompt, /This timing is harmful/);
  assert.match(prompt, /side=A/);
  assert.match(prompt, /side=B/);

  // Velocity data still present
  assert.match(prompt, /likes_per_hour/);

  // Length constraints
  assert.match(prompt, /28 個中文字以內/);
  assert.match(prompt, /24 個中文字以內/);
});

test("parseCompareBriefResponse accepts the new observation-first contract", () => {
  const request = buildRequest();
  const parsed = parseCompareBriefResponse(
    JSON.stringify({
      headline: "A 偏集中回聲型，B 偏分歧探索型",
      supporting_observations: [
        { text: "A 的高互動留言集中在支持政策的聲音", scope: "left", evidence_ids: ["e1"] },
        { text: "B 的留言更常把焦點轉向時機與風險", scope: "right", evidence_ids: ["e3"] }
      ],
      a_reading: "A 的受眾形成強烈回聲，代表性留言如「e1」所示。",
      b_reading: "B 的受眾質疑時機，如「e3」所示。",
      why_it_matters: "A 在凝聚共識，B 在拓展討論邊界，兩者進入不同的說服路徑。",
      creator_cue: "要凝聚共識選 A，要引出分歧選 B。",
      keywords: ["集中回聲", "分歧探索", "說服路徑"],
      audience_alignment_left: "Align",
      audience_alignment_right: "Oppose",
      confidence: "medium"
    }),
    request
  );

  assert.ok(parsed);
  assert.equal(parsed?.headline, "A 偏集中回聲型，B 偏分歧探索型");
  assert.equal(parsed?.supportingObservations.length, 2);
  assert.equal(parsed?.supportingObservations[0]?.scope, "left");
  assert.deepEqual(parsed?.supportingObservations[0]?.evidenceIds, ["e1"]);
  assert.equal(parsed?.aReading, "A 的受眾形成強烈回聲，代表性留言如「e1」所示。");
  assert.equal(parsed?.whyItMatters, "A 在凝聚共識，B 在拓展討論邊界，兩者進入不同的說服路徑。");
  assert.equal(parsed?.creatorCue, "要凝聚共識選 A，要引出分歧選 B。");
  assert.equal(parsed?.audienceAlignmentLeft, "Align");
  assert.equal(parsed?.audienceAlignmentRight, "Oppose");
});

test("parseCompareBriefResponse accepts code-fenced JSON", () => {
  const request = buildRequest();
  const parsed = parseCompareBriefResponse(
    [
      "```json",
      JSON.stringify({
        headline: "A 偏集中回聲型，B 偏分歧探索型",
        supporting_observations: [
          { text: "A 的留言聚焦在支持聲音", scope: "left", evidence_ids: ["e1"] }
        ],
        a_reading: "A 聲音高度一致，如 e1 所示。",
        b_reading: "B 帶出更多批判聲音，如 e3 所示。",
        why_it_matters: "兩邊進入不同說服邏輯。",
        creator_cue: "要共識選 A。",
        keywords: ["集中回聲", "批判", "說服"],
        audience_alignment_left: "Align",
        audience_alignment_right: "Mixed",
        confidence: "medium"
      }),
      "```"
    ].join("\n"),
    request
  );

  assert.ok(parsed);
  assert.equal(parsed?.headline, "A 偏集中回聲型，B 偏分歧探索型");
});

test("parseCompareBriefResponse rejects observations with no valid evidence aliases", () => {
  const request = buildRequest();
  // All observations have invalid aliases → filtered out → supportingObservations empty → null
  const parsed = parseCompareBriefResponse(
    JSON.stringify({
      headline: "A 偏集中回聲型，B 偏分歧探索型",
      supporting_observations: [
        { text: "Some claim", scope: "left", evidence_ids: ["x99", "z00"] }
      ],
      a_reading: "A reading with e1 citation.",
      b_reading: "B reading with e3 citation.",
      why_it_matters: "Some insight.",
      creator_cue: "Some cue.",
      keywords: ["集中回聲", "分歧", "說服"],
      audience_alignment_left: "Align",
      audience_alignment_right: "Mixed",
      confidence: "medium"
    }),
    request
  );

  assert.equal(parsed, null);
});

test("parseCompareBriefResponse rejects side readings with no evidence alias citation", () => {
  const request = buildRequest();
  // observations are valid, but a_reading has no alias → null
  const parsed = parseCompareBriefResponse(
    JSON.stringify({
      headline: "A 偏集中回聲型，B 偏分歧探索型",
      supporting_observations: [
        { text: "A 的留言聚焦在支持聲音", scope: "left", evidence_ids: ["e1"] }
      ],
      a_reading: "A 的留言非常集中，大家都在支持。",  // no alias → rejected
      b_reading: "B 的留言如 e3 所示，更分散。",
      why_it_matters: "兩邊進入不同說服邏輯。",
      creator_cue: "要共識選 A。",
      keywords: ["集中回聲", "批判", "說服"],
      audience_alignment_left: "Align",
      audience_alignment_right: "Mixed",
      confidence: "medium"
    }),
    request
  );

  assert.equal(parsed, null);
});

test("parseCompareBriefResponse rejects partial payloads", () => {
  const parsed = parseCompareBriefResponse(
    JSON.stringify({
      headline: "只有標題",
      keywords: ["只有一個詞"],
      why_it_matters: "只有洞察"
    }),
    buildRequest()
  );

  assert.equal(parsed, null);
});

test("buildDeterministicCompareBrief produces a valid fallback brief with catalog alias grammar", () => {
  const brief = buildDeterministicCompareBrief(buildRequest(), "AI summary unavailable.");

  assert.equal(brief.source, "fallback");
  assert.ok(Array.isArray(brief.keywords));
  assert.ok(brief.keywords.length >= 3);
  assert.ok(brief.keywords.length <= 5);
  assert.match(brief.headline, /A/);
  assert.match(brief.headline, /B/);
  assert.ok(Array.isArray(brief.supportingObservations));
  assert.ok(brief.supportingObservations.length > 0);
  assert.match(brief.whyItMatters, /留言|結構/);
  assert.match(brief.aReading, /A/);
  assert.match(brief.bReading, /B/);
  assert.ok(brief.creatorCue.length <= 28);
  assert.equal(brief.audienceAlignmentLeft, "Align");

  // evidenceIds must use catalog alias grammar (e1, e2, ...), not raw comment_ids
  for (const obs of brief.supportingObservations) {
    for (const id of obs.evidenceIds) {
      assert.match(id, /^e\d+$/);
    }
  }

  // no observation should have empty evidenceIds
  for (const obs of brief.supportingObservations) {
    assert.ok(obs.evidenceIds.length > 0, `observation scope=${obs.scope} has empty evidenceIds`);
  }
});

test("normalizeCompareBrief remaps new schema fields from stored payload", () => {
  const fallback = buildDeterministicCompareBrief(buildRequest(), "AI compare brief unavailable.");

  const normalized = normalizeCompareBrief(
    {
      source: "ai",
      headline: "測試標題",
      keywords: ["A", "B", "C"],
      supportingObservations: [
        { text: "觀察一", scope: "left", evidenceIds: ["e1"] }
      ],
      aReading: "A 端讀法",
      bReading: "B 端讀法",
      whyItMatters: "這個差異很重要",
      creatorCue: "要共鳴選 A",
      audienceAlignmentLeft: "Align",
      audienceAlignmentRight: "Mixed",
      confidence: "medium"
    },
    fallback
  );

  assert.equal(normalized.source, "ai");
  assert.equal(normalized.headline, "測試標題");
  assert.deepEqual(normalized.keywords, ["A", "B", "C"]);
  assert.equal(normalized.supportingObservations.length, 1);
  assert.equal(normalized.whyItMatters, "這個差異很重要");
  assert.equal(normalized.creatorCue, "要共鳴選 A");
  assert.equal(normalized.aReading, "A 端讀法");
  assert.equal(normalized.audienceAlignmentLeft, "Align");
  assert.equal(normalized.audienceAlignmentRight, "Mixed");
});
