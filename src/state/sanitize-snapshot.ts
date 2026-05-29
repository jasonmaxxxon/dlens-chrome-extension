import type { ExtensionSettings, ExtensionSnapshot } from "./types";

/**
 * Settings shape safe to expose to the content-script world (threads.net): raw API
 * keys are removed and only their presence is preserved as booleans, so in-page UI
 * can still gate AI features. AI calls run in the background service worker, so the
 * content script never needs the raw keys.
 */
export function sanitizeSettingsForContentScript(settings: ExtensionSettings): ExtensionSettings {
  return {
    ...settings,
    openaiApiKey: "",
    claudeApiKey: "",
    googleApiKey: "",
    hasOpenAiKey: Boolean(settings.openaiApiKey.trim()),
    hasClaudeKey: Boolean(settings.claudeApiKey.trim()),
    hasGoogleKey: Boolean(settings.googleApiKey.trim())
  };
}

/** Returns a copy of the snapshot with API keys stripped from global.settings. */
export function sanitizeSnapshotForContentScript(snapshot: ExtensionSnapshot): ExtensionSnapshot {
  return {
    ...snapshot,
    global: {
      ...snapshot.global,
      settings: sanitizeSettingsForContentScript(snapshot.global.settings)
    }
  };
}
