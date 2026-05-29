import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeSettingsForContentScript, sanitizeSnapshotForContentScript } from "../src/state/sanitize-snapshot.ts";
import { createDefaultSettings, createEmptyGlobalState, createEmptyTabState } from "../src/state/types.ts";

test("sanitizeSettingsForContentScript removes raw keys but keeps presence + other fields", () => {
  const settings = {
    ...createDefaultSettings(),
    ingestBaseUrl: "http://host:9000",
    openaiApiKey: "sk-secret",
    claudeApiKey: "",
    googleApiKey: "AIza-secret"
  };

  const safe = sanitizeSettingsForContentScript(settings);

  assert.equal(safe.openaiApiKey, "");
  assert.equal(safe.claudeApiKey, "");
  assert.equal(safe.googleApiKey, "");
  assert.equal(safe.hasOpenAiKey, true);
  assert.equal(safe.hasClaudeKey, false);
  assert.equal(safe.hasGoogleKey, true);
  // Non-secret settings survive so the content script still works.
  assert.equal(safe.ingestBaseUrl, "http://host:9000");
  // Original object is not mutated.
  assert.equal(settings.openaiApiKey, "sk-secret");
});

test("sanitizeSnapshotForContentScript strips keys inside snapshot.global.settings", () => {
  const snapshot = {
    global: {
      ...createEmptyGlobalState(),
      settings: { ...createDefaultSettings(), googleApiKey: "AIza-secret" }
    },
    tab: createEmptyTabState()
  };

  const safe = sanitizeSnapshotForContentScript(snapshot);

  assert.equal(safe.global.settings.googleApiKey, "");
  assert.equal(safe.global.settings.hasGoogleKey, true);
  // Original snapshot untouched.
  assert.equal(snapshot.global.settings.googleApiKey, "AIza-secret");
});
