import assert from "node:assert/strict";
import test from "node:test";

import { mergeIngestApiToken, mergeOneLinerSettings, normalizeExtensionSettings } from "../src/state/settings-storage.ts";
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

  assert.equal(settings.layoutPreferences.topicSynthesisLayout, "console");
  assert.equal(settings.layoutPreferences.compareResultLayout, "parallel");
  assert.equal(settings.layoutPreferences.language, "zh");
});

test("normalizeExtensionSettings preserves partial layoutPreferences and fills defaults", () => {
  const settings = normalizeExtensionSettings({
    layoutPreferences: {
      compareResultLayout: "chapters"
    }
  });

  assert.equal(settings.layoutPreferences.compareResultLayout, "chapters");
  assert.equal(settings.layoutPreferences.topicSynthesisLayout, "console");
});

test("normalizeExtensionSettings keeps a valid language and defaults the rest to zh", () => {
  const english = normalizeExtensionSettings({ layoutPreferences: { language: "en" } });
  assert.equal(english.layoutPreferences.language, "en");

  const missing = normalizeExtensionSettings({ layoutPreferences: {} });
  assert.equal(missing.layoutPreferences.language, "zh");

  const bogus = normalizeExtensionSettings({ layoutPreferences: { language: "fr" as unknown as "en" } });
  assert.equal(bogus.layoutPreferences.language, "zh");
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

test("normalizeExtensionSettings blanks a missing ingest token and trims a saved one", () => {
  assert.equal(normalizeExtensionSettings({}).ingestApiToken, "");
  assert.equal(normalizeExtensionSettings({ ingestApiToken: "  abc  " }).ingestApiToken, "abc");
  assert.equal(createDefaultSettings().ingestBaseUrl, "http://127.0.0.1:8000");
  assert.equal(createDefaultSettings().ingestApiToken, "");
});

test("mergeIngestApiToken keeps a stored token until the draft replaces it or clear is set", () => {
  assert.equal(mergeIngestApiToken("stored-token", "", false), "stored-token");
  assert.equal(mergeIngestApiToken("stored-token", " next-token ", false), "next-token");
  assert.equal(mergeIngestApiToken("stored-token", "next-token", true), "");
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
