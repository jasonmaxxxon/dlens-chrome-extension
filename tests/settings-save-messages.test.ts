import assert from "node:assert/strict";
import test from "node:test";

import { buildSettingsSaveMessages } from "../src/ui/settings-save-messages.ts";

test("buildSettingsSaveMessages persists product profile after runtime settings", () => {
  const messages = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "google",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "AIza-test",
    draftLayoutPreferences: {
      productSignalCardLayout: "marginalia",
      topicSynthesisLayout: "console",
      compareResultLayout: "chapters"
    },
    draftProductProfile: {
      name: " DLens ",
      category: " Creator analysis ",
      audience: " Threads creators ",
      contextText: "  README context  ",
      contextFiles: [
        {
          id: "file_readme",
          name: "README.md",
          kind: "readme",
          importedAt: "2026-04-27T00:00:00.000Z",
          charCount: 16
        }
      ]
    }
  });

  assert.deepEqual(messages, [
    { type: "settings/set-ingest-base-url", value: "http://127.0.0.1:8000", apiToken: "", clearApiToken: false },
    {
      type: "settings/set-one-liner-config",
      provider: "google",
      openaiApiKey: "",
      claudeApiKey: "",
      googleApiKey: "AIza-test"
    },
    {
      type: "settings/set-layout-preferences",
      layoutPreferences: {
        productSignalCardLayout: "marginalia",
        topicSynthesisLayout: "console",
        compareResultLayout: "chapters"
      }
    },
    {
      type: "settings/set-product-profile",
      productProfile: {
        name: "DLens",
        category: "Creator analysis",
        audience: "Threads creators",
        contextText: "README context",
        contextFiles: [
          {
            id: "file_readme",
            name: "README.md",
            kind: "readme",
            importedAt: "2026-04-27T00:00:00.000Z",
            charCount: 16
          }
        ]
      }
    }
  ]);
});

test("buildSettingsSaveMessages upgrades old three-field product profiles with empty context fields", () => {
  const messages = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftLayoutPreferences: {
      productSignalCardLayout: "marginalia",
      topicSynthesisLayout: "console",
      compareResultLayout: "parallel"
    },
    draftProductProfile: {
      name: "DLens",
      category: "Creator analysis",
      audience: "Threads creators"
    }
  });

  assert.deepEqual(messages[3], {
    type: "settings/set-product-profile",
    productProfile: {
      name: "DLens",
      category: "Creator analysis",
      audience: "Threads creators",
      contextText: "",
      contextFiles: []
    }
  });
});

test("buildSettingsSaveMessages preserves product context without profile metadata", () => {
  const messages = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftLayoutPreferences: {
      productSignalCardLayout: "marginalia",
      topicSynthesisLayout: "console",
      compareResultLayout: "parallel"
    },
    draftProductProfile: {
      name: " ",
      category: "",
      audience: "   ",
      contextText: "  README-only context  ",
      contextFiles: [
        {
          id: " readme_file ",
          name: " README.md ",
          kind: "readme",
          importedAt: " 2026-07-07T08:00:00.000Z ",
          charCount: 42.8
        }
      ]
    }
  });

  assert.deepEqual(messages[3], {
    type: "settings/set-product-profile",
    productProfile: {
      name: "",
      category: "",
      audience: "",
      contextText: "README-only context",
      contextFiles: [
        {
          id: "readme_file",
          name: "README.md",
          kind: "readme",
          importedAt: "2026-07-07T08:00:00.000Z",
          charCount: 42
        }
      ]
    }
  });
});

test("buildSettingsSaveMessages collapses an empty product profile to null", () => {
  const messages = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftLayoutPreferences: {
      productSignalCardLayout: "marginalia",
      topicSynthesisLayout: "console",
      compareResultLayout: "parallel"
    },
    draftProductProfile: {
      name: " ",
      category: "",
      audience: "   ",
      contextText: "   ",
      contextFiles: []
    }
  });

  assert.deepEqual(messages[3], {
    type: "settings/set-product-profile",
    productProfile: null
  });
});

test("buildSettingsSaveMessages persists layout preferences separately from provider settings", () => {
  const messages = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "google",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftLayoutPreferences: {
      productSignalCardLayout: "verdict",
      topicSynthesisLayout: "stack",
      compareResultLayout: "chapters"
    },
    draftProductProfile: {
      name: "",
      category: "",
      audience: "",
      contextText: "",
      contextFiles: []
    }
  });

  assert.deepEqual(messages[2], {
    type: "settings/set-layout-preferences",
    layoutPreferences: {
      productSignalCardLayout: "verdict",
      topicSynthesisLayout: "stack",
      compareResultLayout: "chapters"
    }
  });
});

test("buildSettingsSaveMessages clears the ingest token only when asked and the draft is blank", () => {
  const cleared = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftIngestApiToken: "  ",
    clearIngestApiToken: true,
    draftProvider: "",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftLayoutPreferences: {
      topicSynthesisLayout: "console",
      compareResultLayout: "parallel"
    },
    draftProductProfile: { name: "", category: "", audience: "" }
  });
  assert.deepEqual(cleared[0], {
    type: "settings/set-ingest-base-url",
    value: "http://127.0.0.1:8000",
    apiToken: "  ",
    clearApiToken: true
  });

  const replaced = buildSettingsSaveMessages({
    draftBaseUrl: "http://100.115.102.41:8000",
    draftIngestApiToken: "next-token",
    clearIngestApiToken: true,
    draftProvider: "",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftLayoutPreferences: {
      topicSynthesisLayout: "console",
      compareResultLayout: "parallel"
    },
    draftProductProfile: { name: "", category: "", audience: "" }
  });
  assert.equal(replaced[0]?.type, "settings/set-ingest-base-url");
  if (replaced[0]?.type === "settings/set-ingest-base-url") {
    assert.equal(replaced[0].clearApiToken, false);
    assert.equal(replaced[0].apiToken, "next-token");
  }
});
