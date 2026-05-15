import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_PAGES, guardPage } from "../src/state/processing-state.ts";

test("product mode starts from Collect while keeping product analysis pages available", () => {
  assert.deepEqual(ALLOWED_PAGES.product, [
    "collect",
    "saved-signals",
    "classification",
    "actionable-filter"
  ]);
  assert.equal(guardPage("casebook", "product"), "collect");
  assert.equal(guardPage("collect", "product"), "collect");
  assert.equal(guardPage("saved-signals", "product"), "saved-signals");
  assert.equal(guardPage("classification", "product"), "classification");
  assert.equal(guardPage("actionable-filter", "product"), "actionable-filter");
});

test("archive and PR Evidence modes also start from Collect", () => {
  assert.deepEqual(ALLOWED_PAGES.archive, [
    "collect",
    "library"
  ]);
  assert.equal(guardPage("saved-signals", "archive"), "collect");
  assert.equal(guardPage("library", "archive"), "library");

  assert.deepEqual(ALLOWED_PAGES["pr-evidence"], [
    "collect",
    "pr-evidence"
  ]);
  assert.equal(guardPage("library", "pr-evidence"), "collect");
  assert.equal(guardPage("saved-signals", "pr-evidence"), "collect");
  assert.equal(guardPage("pr-evidence", "pr-evidence"), "pr-evidence");
});

test("topic mode keeps Library available without mounting product-only routes", () => {
  assert.deepEqual(ALLOWED_PAGES.topic, [
    "collect",
    "casebook",
    "inbox",
    "compare",
    "library"
  ]);
  assert.equal(guardPage("classification", "topic"), "collect");
});
