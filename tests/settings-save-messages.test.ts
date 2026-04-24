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
    draftProductProfile: {
      name: " DLens ",
      category: " Creator analysis ",
      audience: " Threads creators "
    }
  });

  assert.deepEqual(messages, [
    { type: "settings/set-ingest-base-url", value: "http://127.0.0.1:8000" },
    {
      type: "settings/set-one-liner-config",
      provider: "google",
      openaiApiKey: "",
      claudeApiKey: "",
      googleApiKey: "AIza-test"
    },
    {
      type: "settings/set-product-profile",
      productProfile: {
        name: "DLens",
        category: "Creator analysis",
        audience: "Threads creators"
      }
    }
  ]);
});

test("buildSettingsSaveMessages collapses an empty product profile to null", () => {
  const messages = buildSettingsSaveMessages({
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "",
    draftProductProfile: {
      name: " ",
      category: "",
      audience: "   "
    }
  });

  assert.deepEqual(messages[2], {
    type: "settings/set-product-profile",
    productProfile: null
  });
});
