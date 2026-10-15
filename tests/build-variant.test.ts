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
  product: ["signals", "collect"],
  "pr-evidence": ["pr-evidence"]
};

test("normalizeBuildVariant only enables the explicit PR-only variant", () => {
  assert.equal(normalizeBuildVariant("pr-only"), "pr-only");
  assert.equal(normalizeBuildVariant(""), "full");
  assert.equal(normalizeBuildVariant("product"), "full");
  assert.equal(resolveBuildVariant({ VITE_DLENS_BUILD_VARIANT: "pr-only" }), "pr-only");
  assert.equal(resolveBuildVariant(undefined), "full");
});

test("resolveAllowedPagesForBuildVariant limits every folder mode to PR Evidence only", () => {
  assert.equal(resolveAllowedPagesForBuildVariant("full", defaultPages), defaultPages);
  assert.deepEqual(resolveAllowedPagesForBuildVariant("pr-only", defaultPages), {
    archive: ["pr-evidence"],
    topic: ["pr-evidence"],
    product: ["pr-evidence"],
    "pr-evidence": ["pr-evidence"]
  });
});
