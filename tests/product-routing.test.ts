import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_PAGES, guardPage } from "../src/state/processing-state.ts";

test("product mode opens Saved Signals before action filtering", () => {
  assert.deepEqual(ALLOWED_PAGES.product, [
    "saved-signals",
    "actionable-filter",
    "collect"
  ]);
  assert.equal(guardPage("casebook", "product"), "saved-signals");
  assert.equal(guardPage("saved-signals", "product"), "saved-signals");
  assert.equal(guardPage("classification", "product"), "saved-signals");
});

test("topic mode starts at Collect and merges Inbox into Topics", () => {
  assert.deepEqual(ALLOWED_PAGES.topic, [
    "collect",
    "library",
    "casebook",
    "compare"
  ]);
  assert.equal(guardPage("classification", "topic"), "collect");
  assert.equal(guardPage("inbox", "topic"), "collect");
});

test("PR Evidence mode mounts only the campaign evidence workspace and Collect", () => {
  assert.deepEqual(ALLOWED_PAGES["pr-evidence"], [
    "pr-evidence",
    "collect"
  ]);
  assert.equal(guardPage("library", "pr-evidence"), "pr-evidence");
  assert.equal(guardPage("saved-signals", "pr-evidence"), "pr-evidence");
  assert.equal(guardPage("pr-evidence", "pr-evidence"), "pr-evidence");
});
