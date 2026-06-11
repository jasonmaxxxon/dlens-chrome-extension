import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyCandidateStrength,
  classifyMetric,
  inferThreadFollowersFromText,
  inferThreadViewsFromText,
  scoreCardCandidateSignals,
  threadsTargetingTestables,
  type CardCandidateSignals
} from "../src/targeting/threads.ts";

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

test("composer detection does not reject post detail wrappers with reply composers", () => {
  const postDetailWrapper = {
    querySelector(selector: string) {
      if (selector === "textarea, [contenteditable='true']") return {};
      if (selector === 'a[href*="/post/"]') return {};
      if (selector === "a[href^='/@'], a[href*='threads.net/@']") return {};
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === "svg[aria-label]") {
        return [
          { getAttribute: () => "Like" },
          { getAttribute: () => "Reply" }
        ];
      }
      return [];
    },
    innerText: "Follow sswirll 2d 第二次上樓 Like 1.8K Reply 86",
    textContent: "Follow sswirll 2d 第二次上樓 Like 1.8K Reply 86"
  };
  const pureComposer = {
    querySelector(selector: string) {
      if (selector === "textarea, [contenteditable='true']") return {};
      return null;
    },
    querySelectorAll: () => [],
    innerText: "Start a thread",
    textContent: "Start a thread"
  };

  assert.equal(threadsTargetingTestables.isComposerLike(postDetailWrapper as any), false);
  assert.equal(threadsTargetingTestables.isComposerLike(pureComposer as any), true);
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
  assert.equal(classifyMetric("觀看"), "views");
});

test("inferThreadViewsFromText extracts visible Threads view counts without matching view controls", () => {
  assert.equal(inferThreadViewsFromText("132 views seeor 今日嚟萬寧 BoostUP 好狀態嘉年華"), 132);
  assert.equal(inferThreadViewsFromText("1.5K views · BoostUP"), 1500);
  assert.equal(inferThreadViewsFromText("1.2萬瀏覽"), 12000);
  assert.equal(inferThreadViewsFromText("View replies"), null);
});

test("inferThreadFollowersFromText extracts visible profile-card follower counts", () => {
  assert.equal(inferThreadFollowersFromText("Charlene\ncharlene89tian\n756 followers\nFollow"), 756);
  assert.equal(inferThreadFollowersFromText("yrzhe\n12.4K followers\nFollow"), 12400);
  assert.equal(inferThreadFollowersFromText("創作者\n1.2萬 followers\nFollow"), 12000);
  assert.equal(inferThreadFollowersFromText("View followers"), null);
});

test("cleanBodyText keeps CJK post text even when it has no spaces", () => {
  assert.equal(
    threadsTargetingTestables.cleanBodyText("一張圖讓你知道現在的就業出路有多艱難\nLike\n7"),
    "一張圖讓你知道現在的就業出路有多艱難"
  );
});

test("findCardCandidate promotes depth-capped fragment wins to the enclosing post root", () => {
  const source = readFileSync(new URL("../src/targeting/threads.ts", import.meta.url), "utf8");

  const promoteStart = source.indexOf("function promoteCandidateToPostRoot(");
  assert.notEqual(promoteStart, -1, "promotion helper must exist");
  const promoteEnd = source.indexOf("\nexport function findCardCandidate", promoteStart);
  assert.notEqual(promoteEnd, -1, "promotion helper must precede findCardCandidate");
  const promoteBlock = source.slice(promoteStart, promoteEnd);

  // Walks past the depth budget to the real article root, and only promotes
  // when the root classifies at least as strongly as the fragment.
  assert.match(promoteBlock, /closest\("article, div\[role='article'\]"\)/);
  // Post-detail pages render posts without an article wrapper (run22
  // b10-hover.json: articles=[]), so promotion must fall back to the per-post
  // pressable container — article stays first so feed behavior is unchanged.
  assert.match(promoteBlock, /closest\("div\[data-pressable-container\]"\)/);
  assert.match(promoteBlock, /score >= candidate\.score/);

  const findStart = source.indexOf("export function findCardCandidate(");
  const findBlock = source.slice(findStart, source.indexOf("\nexport function findCardRoot", findStart));
  assert.match(findBlock, /return promoteCandidateToPostRoot\(best\);/);
});
