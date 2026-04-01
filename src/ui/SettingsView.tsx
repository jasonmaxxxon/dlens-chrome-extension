import type { ExtensionSettings } from "../state/types";
import { PrimaryButton, TOKENS, surfaceCardStyle } from "./components";

interface SettingsViewProps {
  draftBaseUrl: string;
  draftProvider: NonNullable<ExtensionSettings["oneLinerProvider"]> | "";
  draftOpenAiKey: string;
  draftClaudeKey: string;
  draftGoogleKey: string;
  onDraftBaseUrlChange: (value: string) => void;
  onDraftProviderChange: (value: NonNullable<ExtensionSettings["oneLinerProvider"]> | "") => void;
  onDraftOpenAiKeyChange: (value: string) => void;
  onDraftClaudeKeyChange: (value: string) => void;
  onDraftGoogleKeyChange: (value: string) => void;
  onSaveSettings: () => void;
}

export function SettingsView({
  draftBaseUrl,
  draftProvider,
  draftOpenAiKey,
  draftClaudeKey,
  draftGoogleKey,
  onDraftBaseUrlChange,
  onDraftProviderChange,
  onDraftOpenAiKeyChange,
  onDraftClaudeKeyChange,
  onDraftGoogleKeyChange,
  onSaveSettings
}: SettingsViewProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...surfaceCardStyle({ display: "grid", gap: 10 }) }}>
        <strong style={{ fontSize: 14 }}>Collector settings</strong>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: TOKENS.subInk }}>
          Ingest base URL
          <input
            value={draftBaseUrl}
            onChange={(event) => onDraftBaseUrlChange(event.target.value)}
            style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: "rgba(255,255,255,0.6)", fontSize: 13, outline: "none", transition: TOKENS.transition }}
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: TOKENS.subInk }}>
          One-liner provider
          <select
            value={draftProvider}
            onChange={(event) => onDraftProviderChange(event.target.value as NonNullable<ExtensionSettings["oneLinerProvider"]> | "")}
            style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: "rgba(255,255,255,0.6)", fontSize: 13, outline: "none", transition: TOKENS.transition }}
          >
            <option value="">Disabled</option>
            <option value="google">Google (Gemini 2.0 Flash)</option>
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: TOKENS.subInk }}>
          OpenAI API key
          <input
            value={draftOpenAiKey}
            onChange={(event) => onDraftOpenAiKeyChange(event.target.value)}
            type="password"
            placeholder="sk-..."
            style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: "rgba(255,255,255,0.6)", fontSize: 13, outline: "none", transition: TOKENS.transition }}
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: TOKENS.subInk }}>
          Claude API key
          <input
            value={draftClaudeKey}
            onChange={(event) => onDraftClaudeKeyChange(event.target.value)}
            type="password"
            placeholder="sk-ant-..."
            style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: "rgba(255,255,255,0.6)", fontSize: 13, outline: "none", transition: TOKENS.transition }}
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: TOKENS.subInk }}>
          Google API key
          <input
            value={draftGoogleKey}
            onChange={(event) => onDraftGoogleKeyChange(event.target.value)}
            type="password"
            placeholder="AIza..."
            style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: "rgba(255,255,255,0.6)", fontSize: 13, outline: "none", transition: TOKENS.transition }}
          />
        </label>
        <p style={{ fontSize: 11, color: TOKENS.softInk ?? "#94a3b8", margin: "4px 0 0 0", lineHeight: 1.4 }}>
          Your API keys are stored locally in this browser only and are never sent to any server.
        </p>
        <PrimaryButton onClick={onSaveSettings}>
          Save settings
        </PrimaryButton>
      </div>
    </div>
  );
}
