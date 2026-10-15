import type { ExtensionSettings } from "./types";

export type AiProvider = "openai" | "claude" | "google";
type KeySettings = Partial<Pick<ExtensionSettings, "oneLinerProvider" | "openaiApiKey" | "claudeApiKey" | "googleApiKey">>;

const NAME: Record<AiProvider, string> = { google: "Google", openai: "OpenAI", claude: "Claude" };
const keyOf = (settings: KeySettings, provider: AiProvider) =>
  (provider === "google" ? settings.googleApiKey : provider === "openai" ? settings.openaiApiKey : settings.claudeApiKey)?.trim() ?? "";

/** Every AI call uses the provider chosen in Settings, and only that provider's key. */
export function providerKeyFromSettings(settings: KeySettings): { provider: AiProvider; apiKey: string } | null {
  const provider = settings.oneLinerProvider;
  if (!provider) return null;
  const apiKey = keyOf(settings, provider);
  return apiKey ? { provider, apiKey } : null;
}

/** Why no AI call can run, in the user's words; null when one can. */
export function aiKeyGap(settings: KeySettings): string | null {
  if (providerKeyFromSettings(settings)) return null;
  const selected = settings.oneLinerProvider;
  const filled = (["google", "openai", "claude"] as const).filter((provider) => provider !== selected && keyOf(settings, provider));
  if (!selected) return "設定未選 AI provider";
  return filled.length
    ? `設定選了 ${NAME[selected]}，但只填了 ${filled.map((provider) => NAME[provider]).join("、")} key`
    : `設定未填 ${NAME[selected]} API key`;
}
