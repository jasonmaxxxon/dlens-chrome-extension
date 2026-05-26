import test from "node:test";
import assert from "node:assert/strict";

import { createSessionRecord } from "../src/state/store-helpers.ts";
import { buildSelectionModeMessage, resolveSelectionModeFromSnapshot } from "../src/state/selection-mode-messages.ts";
import { createEmptyTabState, type ExtensionSnapshot } from "../src/state/types.ts";

test("buildSelectionModeMessage returns a disable message for manual cancel", () => {
  assert.deepEqual(buildSelectionModeMessage(false, "manual-cancel"), {
    type: "selection/mode-changed",
    enabled: false
  });
});

test("buildSelectionModeMessage suppresses disable messages after a completed selection", () => {
  assert.equal(buildSelectionModeMessage(false, "selection-complete"), null);
});

test("buildSelectionModeMessage suppresses remote cancel echoes", () => {
  assert.equal(buildSelectionModeMessage(false, "remote-sync"), null);
});

test("resolveSelectionModeFromSnapshot rehydrates active collect mode after content reload", () => {
  const topicSession = createSessionRecord("love", "2026-05-22T00:00:00.000Z", "topic");
  const snapshot: ExtensionSnapshot = {
    global: {
      version: 1,
      sessions: [topicSession],
      activeSessionId: topicSession.id,
      settings: {
        ingestBaseUrl: "http://127.0.0.1:8000"
      },
      updatedAt: "2026-05-22T00:00:00.000Z"
    },
    tab: {
      ...createEmptyTabState(),
      selectionMode: true,
      collectModeBannerVisible: true
    }
  };

  assert.equal(resolveSelectionModeFromSnapshot(snapshot), "topic");
});

test("resolveSelectionModeFromSnapshot stays idle when collect mode is off", () => {
  const session = createSessionRecord("love", "2026-05-22T00:00:00.000Z", "topic");
  assert.equal(
    resolveSelectionModeFromSnapshot({
      global: {
        version: 1,
        sessions: [session],
        activeSessionId: session.id,
        settings: {
          ingestBaseUrl: "http://127.0.0.1:8000"
        },
        updatedAt: "2026-05-22T00:00:00.000Z"
      },
      tab: createEmptyTabState()
    }),
    null
  );
});
