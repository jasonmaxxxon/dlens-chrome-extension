import assert from "node:assert/strict";
import test from "node:test";

import { mergeOneLinerSettings, normalizeExtensionSettings } from "../src/state/settings-storage.ts";
import { createDefaultSettings, type ExtensionSettings } from "../src/state/types.ts";

function buildSettings(): ExtensionSettings {
  return {
    ingestBaseUrl: "http://127.0.0.1:8000",
    oneLinerProvider: "google",
    openaiApiKey: "sk-existing",
    claudeApiKey: "sk-ant-existing",
    googleApiKey: "AIza-existing",
    productProfile: null,
    layoutPreferences: createDefaultSettings().layoutPreferences
  };
}

test("createDefaultSettings has layoutPreferences defaults", () => {
  const settings = createDefaultSettings();

  assert.equal(settings.layoutPreferences.productSignalCardLayout, "marginalia");
  assert.equal(settings.layoutPreferences.topicSynthesisLayout, "console");
  assert.equal(settings.layoutPreferences.compareResultLayout, "parallel");
});

test("normalizeExtensionSettings preserves partial layoutPreferences and fills defaults", () => {
  const settings = normalizeExtensionSettings({
    layoutPreferences: {
      compareResultLayout: "chapters"
    }
  });

  assert.equal(settings.layoutPreferences.compareResultLayout, "chapters");
  assert.equal(settings.layoutPreferences.productSignalCardLayout, "marginalia");
  assert.equal(settings.layoutPreferences.topicSynthesisLayout, "console");
});

test("mergeOneLinerSettings preserves existing API keys when incoming drafts are blank", () => {
  const next = mergeOneLinerSettings(buildSettings(), {
    provider: "google",
    openaiApiKey: "",
    claudeApiKey: "   ",
    googleApiKey: ""
  });

  assert.equal(next.oneLinerProvider, "google");
  assert.equal(next.openaiApiKey, "sk-existing");
  assert.equal(next.claudeApiKey, "sk-ant-existing");
  assert.equal(next.googleApiKey, "AIza-existing");
});

test("mergeOneLinerSettings replaces a key when the incoming draft has a value", () => {
  const next = mergeOneLinerSettings(buildSettings(), {
    provider: "openai",
    openaiApiKey: " sk-new ",
    claudeApiKey: "",
    googleApiKey: ""
  });

  assert.equal(next.oneLinerProvider, "openai");
  assert.equal(next.openaiApiKey, "sk-new");
  assert.equal(next.claudeApiKey, "sk-ant-existing");
  assert.equal(next.googleApiKey, "AIza-existing");
});
