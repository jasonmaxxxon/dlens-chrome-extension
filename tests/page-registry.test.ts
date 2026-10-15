import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_REGISTRY, getPageComponentKind, isKnownPage, isPageComponentKind, shouldBypassModeGuard } from "../src/state/page-registry.ts";

test("registry contains only collection, discourse, PR and settings", () => {
  assert.deepEqual(PAGE_REGISTRY.map(entry => entry.key), ["collection", "topics", "pr-evidence", "settings"]);
  assert.equal(getPageComponentKind("topics"), "topics");
  assert.equal(getPageComponentKind("collection"), "collection");
  assert.equal(isPageComponentKind("signals", "collection"), false);
  assert.equal(isKnownPage("saved-signals"), false);
});
test("settings and global collection bypass the domain mode guard", () => {
  assert.equal(shouldBypassModeGuard("settings"), true);
  assert.equal(shouldBypassModeGuard("collection"), true);
  for (const page of ["result", "topic-detail", "audit-report", "collect"] as const) assert.equal(shouldBypassModeGuard(page), false);
});
