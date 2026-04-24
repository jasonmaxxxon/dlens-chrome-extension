import assert from "node:assert/strict";
import test from "node:test";

import type { CompareBrief } from "../src/compare/brief.ts";
import {
  buildDeterministicJudgment,
  buildJudgmentCacheKey,
  buildJudgmentPrompt,
  COMPARE_JUDGMENT_PROMPT_VERSION,
  parseJudgmentResponse
} from "../src/compare/judgment.ts";
import type { ProductProfile } from "../src/state/types.ts";

function buildCompareBrief(): CompareBrief {
  return {
    source: "ai",
    headline: "焦慮是主調，但理性聲音正在集結",
    relation: "同一議題在兩邊被讀成不同風險層級",
    supportingObservations: [
      {
        text: "A 端把焦點收在情緒承壓，B 端更在意制度後果。",
        scope: "cross",
        evidenceIds: ["e1", "e2"]
      }
    ],
    aReading: "A 端像是在替當事人喊痛，e1 把情緒往共鳴收。",
    bReading: "B 端更像把事件上升成制度失衡，e2 把討論往責任追問帶。",
    whyItMatters: "同一題材可被切成情緒入口或制度入口，產品切角會直接影響回應結構。",
    creatorCue: "要共鳴看 A，要擴散看 B",
    keywords: ["情緒入口", "制度風險", "回應分流"],
    audienceAlignmentLeft: "Align",
    audienceAlignmentRight: "Mixed",
    confidence: "medium"
  };
}

test("buildJudgmentPrompt grounds the judgment request in saved analysis and product profile", () => {
  const productProfile: ProductProfile = {
    name: "DLens",
    category: "Creator analysis",
    audience: "Threads creators"
  };

  const prompt = buildJudgmentPrompt(buildCompareBrief(), productProfile);

  assert.equal(COMPARE_JUDGMENT_PROMPT_VERSION, "v1");
  assert.match(prompt, /DLens/);
  assert.match(prompt, /Creator analysis/);
  assert.match(prompt, /Threads creators/);
  assert.match(prompt, /焦慮是主調，但理性聲音正在集結/);
  assert.match(prompt, /同一議題在兩邊被讀成不同風險層級/);
  assert.match(prompt, /\"relevance\": \"1\\|2\\|3\\|4\\|5\"/);
  assert.match(prompt, /\"recommended_state\": \"park\\|watch\\|act\"/);
  assert.match(prompt, /\"why_this_matters\": \"string\"/);
  assert.match(prompt, /\"action_cue\": \"string\"/);
});

test("parseJudgmentResponse accepts a strict JSON judgment payload", () => {
  const parsed = parseJudgmentResponse(`{
    "relevance": 4,
    "recommended_state": "act",
    "why_this_matters": "這種雙向分流很適合做受眾判讀產品，因為它同時暴露情緒入口與制度入口。",
    "action_cue": "先收進高優先"
  }`);

  assert.deepEqual(parsed, {
    relevance: 4,
    recommendedState: "act",
    whyThisMatters: "這種雙向分流很適合做受眾判讀產品，因為它同時暴露情緒入口與制度入口。",
    actionCue: "先收進高優先"
  });
});

test("parseJudgmentResponse rejects invalid relevance or state values", () => {
  const parsed = parseJudgmentResponse(`{
    "relevance": 8,
    "recommended_state": "ship",
    "why_this_matters": "bad payload",
    "action_cue": "bad payload"
  }`);

  assert.equal(parsed, null);
});

test("buildDeterministicJudgment returns a conservative fallback when AI judgment is unavailable", () => {
  const productProfile: ProductProfile = {
    name: "DLens",
    category: "Creator analysis",
    audience: "Threads creators"
  };

  const fallback = buildDeterministicJudgment(buildCompareBrief(), productProfile, "AI judgment unavailable.");

  assert.equal(fallback.relevance, 2);
  assert.equal(fallback.recommendedState, "park");
  assert.match(fallback.whyThisMatters, /Threads creators/);
  assert.match(fallback.actionCue, /先人工覆核|先暫放/);
});

test("buildJudgmentCacheKey combines prompt version with brief and product hashes", () => {
  const key = buildJudgmentCacheKey("brief_hash_123", "profile_hash_456", COMPARE_JUDGMENT_PROMPT_VERSION);

  assert.equal(key, "judgment|v1|brief_hash_123|profile_hash_456");
});
