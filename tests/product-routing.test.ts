import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_PAGES, guardPage } from "../src/state/processing-state.ts";

test("product mode replaces topic routes with product intelligence stubs", () => {
  assert.deepEqual(ALLOWED_PAGES.product, [
    "collect",
    "classification",
    "actionable-filter"
  ]);
  assert.equal(guardPage("casebook", "product"), "collect");
  assert.equal(guardPage("classification", "product"), "classification");
});

test("topic mode keeps Library available without mounting product-only routes", () => {
  assert.deepEqual(ALLOWED_PAGES.topic, [
    "casebook",
    "inbox",
    "collect",
    "compare",
    "library"
  ]);
  assert.equal(guardPage("classification", "topic"), "casebook");
});
