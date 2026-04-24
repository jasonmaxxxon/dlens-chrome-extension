import assert from "node:assert/strict";
import test from "node:test";

import { buildCompareBriefCacheKey } from "../src/compare/brief.ts";
import {
  buildDeterministicJudgment,
  buildJudgmentCacheKey,
  buildJudgmentPrompt,
  parseJudgmentResponse
} from "../src/compare/judgment.ts";
import { JUDGMENT_FIXTURES } from "./judgment-fixtures.ts";

test("judgment fixtures cover 18 golden cases across high, medium, and low relevance bands", () => {
  assert.equal(JUDGMENT_FIXTURES.length, 18);
  assert.equal(JUDGMENT_FIXTURES.filter((fixture) => fixture.label.startsWith("high-")).length, 6);
  assert.equal(JUDGMENT_FIXTURES.filter((fixture) => fixture.label.startsWith("mid-")).length, 6);
  assert.equal(JUDGMENT_FIXTURES.filter((fixture) => fixture.label.startsWith("low-")).length, 6);
});

test("buildJudgmentPrompt keeps product and compare brief structure intact for all fixtures", () => {
  for (const fixture of JUDGMENT_FIXTURES) {
    const prompt = buildJudgmentPrompt(fixture.brief, fixture.productProfile);

    assert.match(prompt, /\[PRODUCT_PROFILE\]/);
    assert.match(prompt, /\[COMPARE_BRIEF\]/);
    assert.match(prompt, /\[SUPPORTING_OBSERVATIONS\]/);
    assert.match(prompt, new RegExp(fixture.productProfile.name));
    assert.match(prompt, new RegExp(fixture.brief.headline));
  }
});

test("parseJudgmentResponse accepts the current JSON contract", () => {
  const parsed = parseJudgmentResponse(JSON.stringify({
    relevance: 4,
    recommended_state: "watch",
    why_this_matters: "這個留言結構直接映到產品決策。",
    action_cue: "先看高互動群"
  }));

  assert.deepEqual(parsed, {
    relevance: 4,
    recommendedState: "watch",
    whyThisMatters: "這個留言結構直接映到產品決策。",
    actionCue: "先看高互動群"
  });
});

test("buildDeterministicJudgment stays deterministic for fallback mode", () => {
  const fallback = buildDeterministicJudgment(
    JUDGMENT_FIXTURES[0]!.brief,
    JUDGMENT_FIXTURES[0]!.productProfile,
    "no provider"
  );

  assert.equal(fallback.relevance, 2);
  assert.equal(fallback.recommendedState, "park");
  assert.match(fallback.actionCue, /人工/);
});

test("buildJudgmentCacheKey changes when the brief or product hash changes", () => {
  const fixture = JUDGMENT_FIXTURES[0]!;
  const briefHashA = buildCompareBriefCacheKey(
    {
      left: {
        captureId: "cap-a",
        analysisUpdatedAt: "2026-04-23T08:00:00.000Z",
        author: "alpha",
        text: "text",
        ageLabel: "1h",
        metricsCoverageLabel: "Full",
        sourceCommentCount: 10,
        engagement: {},
        velocity: { likesPerHour: null, commentsPerHour: null, repostsPerHour: null, forwardsPerHour: null },
        clusters: []
      },
      right: {
        captureId: "cap-b",
        analysisUpdatedAt: "2026-04-23T08:00:00.000Z",
        author: "beta",
        text: "text",
        ageLabel: "1h",
        metricsCoverageLabel: "Full",
        sourceCommentCount: 10,
        engagement: {},
        velocity: { likesPerHour: null, commentsPerHour: null, repostsPerHour: null, forwardsPerHour: null },
        clusters: []
      }
    },
    "google",
    "v7"
  );
  const briefHashB = buildCompareBriefCacheKey(
    {
      left: {
        captureId: "cap-c",
        analysisUpdatedAt: "2026-04-23T08:00:00.000Z",
        author: "alpha",
        text: "text",
        ageLabel: "1h",
        metricsCoverageLabel: "Full",
        sourceCommentCount: 10,
        engagement: {},
        velocity: { likesPerHour: null, commentsPerHour: null, repostsPerHour: null, forwardsPerHour: null },
        clusters: []
      },
      right: {
        captureId: "cap-d",
        analysisUpdatedAt: "2026-04-23T08:00:00.000Z",
        author: "beta",
        text: "text",
        ageLabel: "1h",
        metricsCoverageLabel: "Full",
        sourceCommentCount: 10,
        engagement: {},
        velocity: { likesPerHour: null, commentsPerHour: null, repostsPerHour: null, forwardsPerHour: null },
        clusters: []
      }
    },
    "google",
    "v7"
  );

  const keyA = buildJudgmentCacheKey(briefHashA, `${fixture.productProfile.name}|${fixture.productProfile.category}|${fixture.productProfile.audience}`, "v1");
  const keyB = buildJudgmentCacheKey(briefHashB, `${fixture.productProfile.name}|${fixture.productProfile.category}|${fixture.productProfile.audience}`, "v1");
  const keyC = buildJudgmentCacheKey(briefHashA, "Other|Category|Audience", "v1");

  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyC);
});
