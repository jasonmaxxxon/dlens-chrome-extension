import type { ExtensionMessage } from "../state/messages.ts";
import type { ExtensionSettings, ProductProfile, ProductProfileContextFile } from "../state/types.ts";

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
    audience: "",
    contextText: "",
    contextFiles: []
  };
}

function normalizeContextFile(file: ProductProfileContextFile): ProductProfileContextFile | null {
  const id = String(file.id || "").trim();
  const name = String(file.name || "").trim();
  const importedAt = String(file.importedAt || "").trim();
  const charCount = Number.isFinite(file.charCount) ? Math.max(0, Math.floor(file.charCount)) : 0;
  const kind = file.kind === "readme" || file.kind === "agents" || file.kind === "ai-agents" || file.kind === "other"
    ? file.kind
    : "other";
  if (!id || !name || !importedAt) {
    return null;
  }
  return { id, name, kind, importedAt, charCount };
}

export function normalizeProductProfileDraft(productProfile: ProductProfile | null | undefined): ProductProfile | null {
  if (!productProfile) {
    return null;
  }

  const normalized = {
    name: productProfile.name.trim(),
    category: productProfile.category.trim(),
    audience: productProfile.audience.trim(),
    contextText: (productProfile.contextText ?? "").trim(),
    contextFiles: (productProfile.contextFiles ?? [])
      .map(normalizeContextFile)
      .filter((file): file is ProductProfileContextFile => Boolean(file))
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
