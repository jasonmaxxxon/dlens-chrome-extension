import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialPopupWorkspaceState,
  resolvePendingNavigationAfterSnapshot,
  syncPopupWorkspaceStateFromSnapshot
} from "../src/ui/usePopupWorkspaceState.ts";
import { resolveEffectivePopupPage } from "../src/ui/useInPageCollectorAppState.ts";

test("buildInitialPopupWorkspaceState starts from the persisted popup page when available", () => {
  const readySummary = {
    total: 2,
    ready: 2,
    crawling: 0,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: true,
    hasInflight: false
  };

  assert.deepEqual(buildInitialPopupWorkspaceState(readySummary, true, "topics"), {
    currentMode: "topics",
    popupOpen: true,
    modeLocked: true
  });
});

test("buildInitialPopupWorkspaceState defaults to collection even when two ready items are present", () => {
  const readySummary = {
    total: 2,
    ready: 2,
    crawling: 0,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: true,
    hasInflight: false
  };

  assert.deepEqual(buildInitialPopupWorkspaceState(readySummary, true), {
    currentMode: "collection",
    popupOpen: true,
    modeLocked: true
  });

  assert.deepEqual(buildInitialPopupWorkspaceState(readySummary, false), {
    currentMode: "collection",
    popupOpen: false,
    modeLocked: false
  });
});

test("syncPopupWorkspaceStateFromSnapshot lets persisted popup page override local mode", () => {
  const nextState = syncPopupWorkspaceStateFromSnapshot(
    {
      currentMode: "collection",
      popupOpen: true,
      modeLocked: true
    },
    "topics",
    true
  );

  assert.deepEqual(nextState, {
    currentMode: "topics",
    popupOpen: true,
    modeLocked: true
  });
});

test("syncPopupWorkspaceStateFromSnapshot ignores stale snapshots during pending navigation", () => {
  const currentState = {
    currentMode: "settings" as const,
    popupOpen: true,
    modeLocked: true
  };

  assert.deepEqual(
    syncPopupWorkspaceStateFromSnapshot(currentState, "topics", true, "settings"),
    currentState
  );
  assert.deepEqual(
    syncPopupWorkspaceStateFromSnapshot(currentState, "settings", true, "settings"),
    currentState
  );
});

test("pending popup navigation survives stale snapshots until the destination is confirmed", () => {
  assert.equal(
    resolvePendingNavigationAfterSnapshot("settings", "topics"),
    "settings"
  );
  assert.equal(
    resolvePendingNavigationAfterSnapshot("settings", "settings"),
    null
  );
});

test("resolveEffectivePopupPage preserves collection and settings for every workspace mode", () => {
  for (const mode of ["archive", "topic", "product", "pr-evidence"] as const) {
    assert.equal(resolveEffectivePopupPage("collection", mode), "collection");
    assert.equal(resolveEffectivePopupPage("settings", mode), "settings");
  }
});

test("resolveEffectivePopupPage sends retired workspace routes to the current mode home", () => {
  // Old stored routes must remain safe to reopen after their UI is removed.
  for (const retired of ["library", "collect", "compare", "result", "signals", "saved-signals", "classification", "actionable-filter", "inbox", "casebook", "audit-report"] as const) {
    assert.equal(resolveEffectivePopupPage(retired as never, "product"), "collection");
    assert.equal(resolveEffectivePopupPage(retired as never, "topic"), "topics");
    assert.equal(resolveEffectivePopupPage(retired as never, "archive"), "collection");
    assert.equal(resolveEffectivePopupPage(retired as never, "pr-evidence"), "pr-evidence");
  }
});
