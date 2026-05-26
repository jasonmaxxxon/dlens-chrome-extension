import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBuildVariant,
  resolveAllowedPagesForBuildVariant,
  resolveBuildVariant
} from "../src/build-variant.ts";
import type { FolderMode, PopupPage } from "../src/state/types.ts";

const defaultPages: Record<FolderMode, PopupPage[]> = {
  archive: ["library", "collect"],
  topic: ["collect", "topics", "settings"],
  product: ["saved-signals", "classification", "actionable-filter", "collect"],
  "pr-evidence": ["pr-evidence", "collect"]
};

test("normalizeBuildVariant only enables the explicit PR-only variant", () => {
  assert.equal(normalizeBuildVariant("pr-only"), "pr-only");
  assert.equal(normalizeBuildVariant(""), "full");
  assert.equal(normalizeBuildVariant("product"), "full");
  assert.equal(resolveBuildVariant({ VITE_DLENS_BUILD_VARIANT: "pr-only" }), "pr-only");
  assert.equal(resolveBuildVariant(undefined), "full");
});

test("resolveAllowedPagesForBuildVariant limits every folder mode to PR Evidence and Collect", () => {
  assert.equal(resolveAllowedPagesForBuildVariant("full", defaultPages), defaultPages);
  assert.deepEqual(resolveAllowedPagesForBuildVariant("pr-only", defaultPages), {
    archive: ["pr-evidence", "collect"],
    topic: ["pr-evidence", "collect"],
    product: ["pr-evidence", "collect"],
    "pr-evidence": ["pr-evidence", "collect"]
  });
});
