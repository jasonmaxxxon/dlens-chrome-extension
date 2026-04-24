import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionMessage } from "../src/state/messages.ts";
import type { JudgmentResult, ProductProfile } from "../src/state/types.ts";

const productProfile = {
  name: "DLens",
  category: "Creator analysis",
  audience: "Threads creators"
} satisfies ProductProfile;

const judgmentResult = {
  relevance: 4,
  recommendedState: "act",
  whyThisMatters: "This topic maps cleanly onto the product's analyst workflow.",
  actionCue: "Move to priority review"
} satisfies JudgmentResult;

const judgmentMessages = [
  { type: "settings/set-product-profile", productProfile },
  { type: "judgment/start", resultId: "result_123" },
  {
    type: "judgment/result",
    resultId: "result_123",
    judgmentResult,
    judgmentVersion: "v1",
    judgmentSource: "ai"
  }
] satisfies ExtensionMessage[];

test("ExtensionMessage exposes product-profile and judgment contract seams", () => {
  assert.equal(judgmentMessages.length, 3);
  assert.equal(judgmentMessages[0].type, "settings/set-product-profile");
  assert.equal(judgmentMessages[1].type, "judgment/start");
  assert.equal(judgmentMessages[2].type, "judgment/result");
});
