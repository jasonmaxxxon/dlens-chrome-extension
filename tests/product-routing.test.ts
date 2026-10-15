import assert from "node:assert/strict";
import test from "node:test";
import { ALLOWED_PAGES, getModeHomePage, getModeRailPages, guardPage } from "../src/state/processing-state.ts";
import { workspaceCollectionDestination } from "../src/viewmodel/workspace-destination.ts";

test("product and archive workspace entries select their collection chips", () => {
  for (const mode of ["product", "archive"] as const) {
    assert.deepEqual(workspaceCollectionDestination(mode), { tab: "collection", workspaceOpen: false, filter: mode });
    assert.equal(getModeHomePage(mode), "collection");
    assert.deepEqual(ALLOWED_PAGES[mode], ["collection", "settings"]);
    assert.deepEqual(getModeRailPages(mode), []);
    assert.equal(guardPage("library", mode), "collection");
  }
});
test("audience and PR retain their home and settings without collect", () => {
  for (const [mode, home] of [["topic", "topics"], ["pr-evidence", "pr-evidence"]] as const) {
    assert.deepEqual(workspaceCollectionDestination(mode), { tab: "workspaces", workspaceOpen: true, filter: "all" });
    assert.equal(getModeHomePage(mode), home);
    assert.deepEqual(getModeRailPages(mode), [home]);
    assert.deepEqual(ALLOWED_PAGES[mode], [home, "settings"]);
    assert.equal(guardPage("signals", mode), home);
  }
});
