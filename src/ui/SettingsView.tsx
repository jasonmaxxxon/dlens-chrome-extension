import type { ExtensionSettings } from "../state/types";
import { PrimaryButton, TOKENS, WorkspaceSurface, hudLabel, viewRootStyle } from "./components";
import { tokens } from "./tokens";

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

const inputStyle = {
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.glassBorder}`,
  padding: "7px 10px",
  background: tokens.color.elevated,
  color: tokens.color.ink,
  fontSize: 12,
  outline: "none",
  transition: tokens.motion.interactiveTransitionFast,
  width: "100%",
  boxSizing: "border-box",
  minWidth: 0
} as const;

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
    <div style={viewRootStyle()}>
      <WorkspaceSurface
        tone="utility"
        style={{ display: "grid", gap: tokens.spacing.md, maxWidth: 420 }}
      >
        <div
          data-settings-surface="drawer"
          style={{ display: "grid", gap: tokens.spacing.md }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={hudLabel()}>Settings</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: tokens.color.subInk }}>
              Adjust runtime behavior without leaving the workspace.
            </p>
          </div>

          <div
            data-settings-group="connection"
            style={{
              display: "grid",
              gap: 14,
              paddingTop: 2,
              borderTop: `1px solid ${tokens.color.line}`
            }}
          >
            <div style={{ ...hudLabel() }}>Connection</div>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: tokens.color.subInk }}>
              Ingest base URL
              <input value={draftBaseUrl} onChange={(event) => onDraftBaseUrlChange(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: tokens.color.subInk }}>
              AI provider
              <select
                value={draftProvider}
                onChange={(event) => onDraftProviderChange(event.target.value as NonNullable<ExtensionSettings["oneLinerProvider"]> | "")}
                style={inputStyle}
              >
                <option value="">Disabled</option>
                <option value="google">Google (Gemini 3.1 Flash Lite)</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Claude</option>
              </select>
            </label>
          </div>

          <div
            data-settings-group="keys"
            style={{
              display: "grid",
              gap: 14,
              paddingTop: 2,
              borderTop: `1px solid ${tokens.color.line}`
            }}
          >
            <div style={{ ...hudLabel() }}>API Keys</div>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: tokens.color.subInk }}>
              OpenAI
              <input value={draftOpenAiKey} onChange={(event) => onDraftOpenAiKeyChange(event.target.value)} type="password" placeholder="sk-..." style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: tokens.color.subInk }}>
              Claude
              <input value={draftClaudeKey} onChange={(event) => onDraftClaudeKeyChange(event.target.value)} type="password" placeholder="sk-ant-..." style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: tokens.color.subInk }}>
              Google
              <input value={draftGoogleKey} onChange={(event) => onDraftGoogleKeyChange(event.target.value)} type="password" placeholder="AIza..." style={inputStyle} />
            </label>
            <p style={{ fontSize: 10, color: tokens.color.softInk, margin: 0, lineHeight: 1.5 }}>
              Keys are stored locally and never sent to our servers. When AI summaries are enabled, your key goes directly to the provider.
            </p>
          </div>

          <PrimaryButton onClick={onSaveSettings} style={{ width: "100%" }}>
            Save settings
          </PrimaryButton>
        </div>
      </WorkspaceSurface>
    </div>
  );
}
