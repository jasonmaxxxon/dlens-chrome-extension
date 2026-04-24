import type { ExtensionMessage } from "../state/messages.ts";
import type { ExtensionSettings, ProductProfile } from "../state/types.ts";

export interface SettingsDraftValues {
  draftBaseUrl: string;
  draftProvider: NonNullable<ExtensionSettings["oneLinerProvider"]> | "";
  draftOpenAiKey: string;
  draftClaudeKey: string;
  draftGoogleKey: string;
  draftProductProfile: ProductProfile;
}

export function createEmptyProductProfile(): ProductProfile {
  return {
    name: "",
    category: "",
    audience: ""
  };
}

export function normalizeProductProfileDraft(productProfile: ProductProfile | null | undefined): ProductProfile | null {
  if (!productProfile) {
    return null;
  }

  const normalized = {
    name: productProfile.name.trim(),
    category: productProfile.category.trim(),
    audience: productProfile.audience.trim()
  };

  return normalized.name || normalized.category || normalized.audience
    ? normalized
    : null;
}

export function buildSettingsSaveMessages({
  draftBaseUrl,
  draftProvider,
  draftOpenAiKey,
  draftClaudeKey,
  draftGoogleKey,
  draftProductProfile
}: SettingsDraftValues): ExtensionMessage[] {
  return [
    {
      type: "settings/set-ingest-base-url",
      value: draftBaseUrl
    },
    {
      type: "settings/set-one-liner-config",
      provider: draftProvider || null,
      openaiApiKey: draftOpenAiKey,
      claudeApiKey: draftClaudeKey,
      googleApiKey: draftGoogleKey
    },
    {
      type: "settings/set-product-profile",
      productProfile: normalizeProductProfileDraft(draftProductProfile)
    }
  ];
}
