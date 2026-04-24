import type { ExtensionSettings } from "./types";

export interface OneLinerSettingsPatch {
  provider: ExtensionSettings["oneLinerProvider"];
  openaiApiKey: string;
  claudeApiKey: string;
  googleApiKey: string;
}

function mergeApiKey(currentValue: string, draftValue: string): string {
  const nextValue = draftValue.trim();
  return nextValue || currentValue;
}

export function mergeOneLinerSettings(
  current: ExtensionSettings,
  patch: OneLinerSettingsPatch
): ExtensionSettings {
  return {
    ...current,
    oneLinerProvider: patch.provider,
    openaiApiKey: mergeApiKey(current.openaiApiKey, patch.openaiApiKey),
    claudeApiKey: mergeApiKey(current.claudeApiKey, patch.claudeApiKey),
    googleApiKey: mergeApiKey(current.googleApiKey, patch.googleApiKey)
  };
}
