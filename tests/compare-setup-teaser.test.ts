import assert from "node:assert/strict";
import test from "node:test";

import { buildCompareSetupTeaser } from "../src/ui/inpage-helpers.tsx";
import type { CompareBrief } from "../src/compare/brief.ts";

function buildCompareBrief(source: CompareBrief["source"]): CompareBrief {
  return {
    source,
    headline: "焦慮是主調，但理性聲音正在集結",
    relation: "兩邊都在同一議題上聚攏，但收束方向不同。",
    supportingObservations: [],
    aReading: "A 收向 support。",
    bReading: "B 收向 harmful。",
    whyItMatters: "兩篇貼文的留言區呈現截然不同的反應結構。",
    creatorCue: "先辨識哪邊是共鳴、哪邊是摩擦。",
    keywords: ["反應差異", "互動結構", "創作啟示"],
    audienceAlignmentLeft: "Align",
    audienceAlignmentRight: "Mixed",
    confidence: "medium"
  };
}

test("buildCompareSetupTeaser preserves semantic brief source separate from the metadata label", () => {
  const teaser = buildCompareSetupTeaser(buildCompareBrief("fallback"), 847, 3, "3/28–4/4");

  assert.equal(teaser.briefSource, "fallback");
  assert.match(teaser.metadataLabel, /fallback/);
});
