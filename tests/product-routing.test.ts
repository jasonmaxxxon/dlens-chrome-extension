import assert from "node:assert/strict";
import test from "node:test";

import { ALLOWED_PAGES, getModeHomePage, getModeRailPages, guardPage } from "../src/state/processing-state.ts";

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

test("mode switches land on the primary surface for each workspace", () => {
  assert.equal(getModeHomePage("archive"), "library");
  assert.equal(getModeHomePage("topic"), "topics");
  assert.equal(getModeHomePage("product"), "saved-signals");
  assert.equal(getModeHomePage("pr-evidence"), "pr-evidence");
});

test("mode rail pages are the build-aware visible subset of allowed pages", () => {
  assert.deepEqual(getModeRailPages("archive"), ["library", "collect"]);
  assert.deepEqual(getModeRailPages("topic"), ["collect", "topics"]);
  assert.deepEqual(getModeRailPages("product"), ["saved-signals", "actionable-filter", "collect"]);
  assert.deepEqual(getModeRailPages("pr-evidence"), ["pr-evidence", "collect"]);
});
