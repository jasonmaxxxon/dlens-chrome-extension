import assert from "node:assert/strict";
import test from "node:test";

import { classifyCandidateStrength, classifyMetric, scoreCardCandidateSignals, type CardCandidateSignals } from "../src/targeting/threads.ts";

function makeSignals(overrides: Partial<CardCandidateSignals> = {}): CardCandidateSignals {
  return {
    isArticleLike: true,
    hasPermalink: true,
    isPressable: true,
    hasAuthorHint: true,
    hasEngagementRow: true,
    isComposer: false,
    isRecommendation: false,
    isFeedShell: false,
    widthRatio: 0.62,
    permalinkCount: 1,
    articleDescendants: 1,
    nestedPermalinkCount: 0,
    ...overrides
  };
}

test("scoreCardCandidateSignals marks strong post cards as hard candidates", () => {
  const score = scoreCardCandidateSignals(makeSignals());
  assert.equal(classifyCandidateStrength(score), "hard");
});

test("scoreCardCandidateSignals demotes oversized uncertain cards to soft candidates", () => {
  const score = scoreCardCandidateSignals(
    makeSignals({
      isArticleLike: false,
      hasPermalink: false,
      widthRatio: 0.88,
      hasEngagementRow: true,
      hasAuthorHint: true,
      isPressable: true
    })
  );

  assert.equal(classifyCandidateStrength(score), "soft");
});

test("scoreCardCandidateSignals rejects composer and feed shell blocks", () => {
  const composerScore = scoreCardCandidateSignals(
    makeSignals({
      isComposer: true,
      hasPermalink: false,
      hasEngagementRow: false
    })
  );
  const shellScore = scoreCardCandidateSignals(
    makeSignals({
      isFeedShell: true,
      permalinkCount: 4,
      articleDescendants: 4,
      widthRatio: 0.98
    })
  );

  assert.equal(classifyCandidateStrength(composerScore), null);
  assert.equal(classifyCandidateStrength(shellScore), null);
});

test("scoreCardCandidateSignals keeps quoted-post outer cards eligible", () => {
  const score = scoreCardCandidateSignals(
    makeSignals({
      isArticleLike: true,
      hasPermalink: true,
      hasAuthorHint: true,
      hasEngagementRow: true,
      widthRatio: 0.68,
      permalinkCount: 2,
      articleDescendants: 2,
      nestedPermalinkCount: 1,
      isFeedShell: false
    })
  );

  assert.equal(classifyCandidateStrength(score), "hard");
});

// classifyMetric tests

test("classifyMetric identifies likes from aria-label", () => {
  assert.equal(classifyMetric("2 likes"), "likes");
  assert.equal(classifyMetric("Like"), "likes");
  assert.equal(classifyMetric("1 like"), "likes");
});

test("classifyMetric identifies comments/replies", () => {
  assert.equal(classifyMetric("5 replies"), "comments");
  assert.equal(classifyMetric("Reply"), "comments");
  assert.equal(classifyMetric("3 comments"), "comments");
});

test("classifyMetric identifies reposts", () => {
  assert.equal(classifyMetric("Repost"), "reposts");
  assert.equal(classifyMetric("12 reposts"), "reposts");
});

test("classifyMetric identifies forwards/shares", () => {
  assert.equal(classifyMetric("Share"), "forwards");
  assert.equal(classifyMetric("Send"), "forwards");
});

test("classifyMetric uses word boundaries to avoid false positives", () => {
  assert.equal(classifyMetric("preview"), null);
  assert.equal(classifyMetric("overview"), null);
  assert.equal(classifyMetric("slideshow"), null);
});

test("classifyMetric supports Chinese labels", () => {
  assert.equal(classifyMetric("讚"), "likes");
  assert.equal(classifyMetric("回覆"), "comments");
  assert.equal(classifyMetric("轉發"), "reposts");
  assert.equal(classifyMetric("分享"), "forwards");
  assert.equal(classifyMetric("瀏覽"), "views");
});
