import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_PAGES, guardPage } from "../src/state/processing-state.ts";

test("product mode opens Saved Signals before action filtering", () => {
  assert.deepEqual(ALLOWED_PAGES.product, [
    "saved-signals",
    "classification",
    "actionable-filter",
    "collect"
  ]);
  assert.equal(guardPage("casebook", "product"), "saved-signals");
  assert.equal(guardPage("saved-signals", "product"), "saved-signals");
  assert.equal(guardPage("classification", "product"), "classification");
  assert.equal(guardPage("actionable-filter", "product"), "actionable-filter");
});

test("topic mode narrows the popup IA to collect, topics, and settings", () => {
  assert.deepEqual(ALLOWED_PAGES.topic, [
    "collect",
    "topics",
    "settings"
  ]);
  assert.equal(guardPage("classification", "topic"), "collect");
  assert.equal(guardPage("topics", "topic"), "topics");
  assert.equal(guardPage("settings", "topic"), "settings");
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
