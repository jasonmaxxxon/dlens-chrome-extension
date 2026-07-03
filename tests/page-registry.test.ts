import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PAGE_REGISTRY,
  getAllowedPagesForMode,
  getHomePageForMode,
  getPageComponentKind,
  getPageWidth,
  getRailPagesForMode,
  isPageComponentKind,
  shouldBypassModeGuard
} from "../src/state/page-registry.ts";

test("page registry owns the current allowed-page contract", () => {
  assert.deepEqual(getAllowedPagesForMode("archive"), ["library", "collect"]);
  assert.deepEqual(getAllowedPagesForMode("topic"), ["collect", "topics", "settings"]);
  assert.deepEqual(getAllowedPagesForMode("product"), ["saved-signals", "classification", "actionable-filter", "collect"]);
  assert.deepEqual(getAllowedPagesForMode("pr-evidence"), ["pr-evidence", "collect"]);
});

test("page registry derives home pages and rail-visible pages", () => {
  assert.equal(getHomePageForMode("archive"), "library");
  assert.equal(getHomePageForMode("topic"), "topics");
  assert.equal(getHomePageForMode("product"), "saved-signals");
  assert.equal(getHomePageForMode("pr-evidence"), "pr-evidence");

  assert.deepEqual(getRailPagesForMode("archive"), ["library", "collect"]);
  assert.deepEqual(getRailPagesForMode("topic"), ["collect", "topics"]);
  assert.deepEqual(getRailPagesForMode("product"), ["saved-signals", "actionable-filter", "collect"]);
  assert.deepEqual(getRailPagesForMode("pr-evidence"), ["pr-evidence", "collect"]);
});

test("page registry classifies component families and widths", () => {
  assert.equal(getPageComponentKind("library"), "library");
  assert.equal(getPageComponentKind("collect"), "collect");
  assert.equal(getPageComponentKind("topics"), "casebook");
  assert.equal(getPageComponentKind("topic-detail"), "casebook");
  assert.equal(getPageComponentKind("saved-signals"), "product-signal");
  assert.equal(getPageComponentKind("classification"), "product-signal");
  assert.equal(getPageComponentKind("actionable-filter"), "product-signal");
  assert.equal(getPageComponentKind("pr-evidence"), "pr-evidence");
  assert.equal(getPageComponentKind("result"), "result");
  assert.equal(getPageComponentKind("settings"), "settings");

  assert.equal(isPageComponentKind("classification", "product-signal"), true);
  assert.equal(isPageComponentKind("collect", "product-signal"), false);

  for (const page of PAGE_REGISTRY.map((entry) => entry.key)) {
    assert.equal(getPageWidth(page), 720);
  }
});

test("page registry owns contextual pages that bypass mode guard", () => {
  assert.equal(shouldBypassModeGuard("settings"), true);
  assert.equal(shouldBypassModeGuard("result"), true);
  assert.equal(shouldBypassModeGuard("topic-detail"), true);
  assert.equal(shouldBypassModeGuard("audit-report"), false);
  assert.equal(shouldBypassModeGuard("collect"), false);
});

test("popup consumes page registry instead of re-declaring page families", () => {
  const source = readFileSync(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\bALLOWED_PAGES\b/);
  assert.doesNotMatch(
    source,
    /guardedPage === "saved-signals"\s*\|\|\s*guardedPage === "classification"\s*\|\|\s*guardedPage === "actionable-filter"/
  );
  assert.match(source, /getModeRailPages/);
  assert.match(source, /getPageComponentKind/);
});
