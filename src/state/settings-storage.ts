import {
  createDefaultLayoutPreferences,
  createDefaultSettings,
  type ExtensionSettings,
  type LayoutPreferences
} from "./types";

export interface OneLinerSettingsPatch {
  provider: ExtensionSettings["oneLinerProvider"];
  openaiApiKey: string;
  claudeApiKey: string;
  googleApiKey: string;
  deepReadingModels?: ExtensionSettings["deepReadingModels"];
}

export type LayoutPreferencesPatch = Partial<LayoutPreferences>;

function validTopicSynthesisLayout(value: unknown): value is LayoutPreferences["topicSynthesisLayout"] {
  return value === "stack" || value === "console";
}

function validCompareResultLayout(value: unknown): value is LayoutPreferences["compareResultLayout"] {
  return value === "reading" || value === "parallel" || value === "chapters";
}

function validUiLanguage(value: unknown): value is NonNullable<LayoutPreferences["language"]> {
  return value === "zh" || value === "en";
}

export function normalizeLayoutPreferences(raw: LayoutPreferencesPatch | null | undefined): LayoutPreferences {
  const defaults = createDefaultLayoutPreferences();
  return {
    topicSynthesisLayout: validTopicSynthesisLayout(raw?.topicSynthesisLayout)
      ? raw.topicSynthesisLayout
      : defaults.topicSynthesisLayout,
    compareResultLayout: validCompareResultLayout(raw?.compareResultLayout)
      ? raw.compareResultLayout
      : defaults.compareResultLayout,
    language: validUiLanguage(raw?.language) ? raw.language : defaults.language
  };
}

export const INGEST_API_TOKEN_MAX_LENGTH = 512;

export function normalizeIngestApiToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, INGEST_API_TOKEN_MAX_LENGTH);
}

/** A blank draft keeps the stored token. `clear` is the only way to remove it. */
export function mergeIngestApiToken(current: string | null | undefined, draft: string | null | undefined, clear: boolean): string {
  if (clear) return "";
  const next = normalizeIngestApiToken(draft);
  return next || normalizeIngestApiToken(current);
}

export function normalizeExtensionSettings(
  raw: (Partial<Omit<ExtensionSettings, "layoutPreferences">> & { layoutPreferences?: LayoutPreferencesPatch | null }) | null | undefined
): ExtensionSettings {
  return {
    ...createDefaultSettings(),
    ...(raw || {}),
    ingestApiToken: normalizeIngestApiToken(raw?.ingestApiToken),
    layoutPreferences: normalizeLayoutPreferences(raw?.layoutPreferences)
  };
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
    ...(patch.deepReadingModels === undefined ? {} : {
      deepReadingModels: Object.fromEntries(Object.entries(patch.deepReadingModels)
        .filter(([key, value]) => ["google", "claude", "openai"].includes(key) && typeof value === "string")
        .map(([key, value]) => [key, value.trim().slice(0, 120)]))
    }),
    openaiApiKey: mergeApiKey(current.openaiApiKey, patch.openaiApiKey),
    claudeApiKey: mergeApiKey(current.claudeApiKey, patch.claudeApiKey),
    googleApiKey: mergeApiKey(current.googleApiKey, patch.googleApiKey)
  };
}

export function mergeLayoutPreferences(
  current: ExtensionSettings,
  patch: LayoutPreferencesPatch
): ExtensionSettings {
  return {
    ...current,
    layoutPreferences: normalizeLayoutPreferences({
      ...current.layoutPreferences,
      ...patch
    })
  };
}
