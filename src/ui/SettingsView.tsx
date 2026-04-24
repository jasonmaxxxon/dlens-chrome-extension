import type { ReactNode } from "react";

import type { ExtensionSettings, FolderMode, ProductProfile } from "../state/types";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  Stamp,
  WorkspaceSurface,
  viewRootStyle
} from "./components";
import { tokens } from "./tokens";

interface SettingsViewProps {
  sessionMode: FolderMode;
  canEditSessionMode?: boolean;
  draftBaseUrl: string;
  draftProvider: NonNullable<ExtensionSettings["oneLinerProvider"]> | "";
  draftOpenAiKey: string;
  draftClaudeKey: string;
  draftGoogleKey: string;
  draftProductProfile: ProductProfile;
  productProfileSeedText?: string;
  isInitializingProductProfile?: boolean;
  onSessionModeChange: (mode: FolderMode) => void;
  onDraftBaseUrlChange: (value: string) => void;
  onDraftProviderChange: (value: NonNullable<ExtensionSettings["oneLinerProvider"]> | "") => void;
  onDraftOpenAiKeyChange: (value: string) => void;
  onDraftClaudeKeyChange: (value: string) => void;
  onDraftGoogleKeyChange: (value: string) => void;
  onDraftProductProfileChange: (patch: Partial<ProductProfile>) => void;
  onProductProfileSeedTextChange?: (value: string) => void;
  onInitProductProfile?: () => void;
  onSaveSettings: () => void;
}

const inputStyle = {
  borderRadius: 10,
  border: `1px solid ${tokens.color.line}`,
  padding: "10px 12px",
  background: tokens.color.elevated,
  color: tokens.color.ink,
  fontSize: 12,
  outline: "none",
  transition: tokens.motion.interactiveTransitionFast,
  width: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  fontFamily: tokens.font.sans
} as const;

function SettingsGroup({
  name,
  kicker,
  children
}: {
  name: "folder" | "connection" | "keys" | "product";
  kicker: string;
  children: ReactNode;
}) {
  const stampByGroup = {
    folder: { tone: "accent" as const, label: "Folder" },
    connection: { tone: "accent" as const, label: "Live" },
    keys: { tone: "neutral" as const, label: "Local only" },
    product: { tone: "neutral" as const, label: "Product" }
  };
  const stamp = stampByGroup[name];

  return (
    <div
      data-settings-group={name}
      style={{
        display: "grid",
        gap: 14,
        padding: "14px 16px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.surface
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Kicker>{kicker}</Kicker>
        <Stamp tone={stamp.tone}>{stamp.label}</Stamp>
      </div>
      {children}
    </div>
  );
}

export function SettingsView({
  sessionMode,
  canEditSessionMode = false,
  draftBaseUrl,
  draftProvider,
  draftOpenAiKey,
  draftClaudeKey,
  draftGoogleKey,
  draftProductProfile,
  productProfileSeedText = "",
  isInitializingProductProfile = false,
  onSessionModeChange,
  onDraftBaseUrlChange,
  onDraftProviderChange,
  onDraftOpenAiKeyChange,
  onDraftClaudeKeyChange,
  onDraftGoogleKeyChange,
  onDraftProductProfileChange,
  onProductProfileSeedTextChange,
  onInitProductProfile,
  onSaveSettings
}: SettingsViewProps) {
  return (
    <div style={viewRootStyle()}>
      <ModeHeader
        mode="settings"
        kicker="Runtime settings"
        title="調整連線與模型入口"
        deck="連線設定與 API 金鑰存於本機，不會上傳。"
        stamp={<Stamp tone="neutral">Workspace</Stamp>}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md }}>
        <div data-settings-surface="drawer" style={{ display: "grid", gap: tokens.spacing.md }}>
          <SettingsGroup name="folder" kicker="Folder">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink }}>資料夾類型</div>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  {
                    mode: "archive" as const,
                    title: "封存（Archive）",
                    deck: "純儲存，無議題追蹤"
                  },
                  {
                    mode: "topic" as const,
                    title: "議題追蹤（Topic）",
                    deck: "啟用 Casebook 和收件匣"
                  },
                  {
                    mode: "product" as const,
                    title: "產品觀察（Product）",
                    deck: "啟用 Topic 流程並加上 Judgment"
                  }
                ].map((option) => {
                  const active = sessionMode === option.mode;
                  return (
                    <label
                      key={option.mode}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "16px minmax(0, 1fr)",
                        gap: 10,
                        alignItems: "start",
                        padding: "10px 12px",
                        borderRadius: tokens.radius.card,
                        border: `1px solid ${active ? tokens.color.lineStrong : tokens.color.line}`,
                        background: active ? tokens.color.elevated : tokens.color.surface,
                        opacity: canEditSessionMode ? 1 : 0.55
                      }}
                    >
                      <input
                        type="radio"
                        name="session-mode"
                        value={option.mode}
                        checked={active}
                        disabled={!canEditSessionMode}
                        onChange={() => onSessionModeChange(option.mode)}
                      />
                      <span style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink }}>{option.title}</span>
                        <span style={{ fontSize: 11, color: tokens.color.subInk }}>{option.deck}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup name="connection" kicker="Connection">
            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
              Ingest base URL
              <input value={draftBaseUrl} onChange={(event) => onDraftBaseUrlChange(event.target.value)} style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
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
          </SettingsGroup>

          <SettingsGroup name="keys" kicker="API keys">
            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
              OpenAI
              <input value={draftOpenAiKey} onChange={(event) => onDraftOpenAiKeyChange(event.target.value)} type="password" placeholder="sk-..." style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
              Claude
              <input value={draftClaudeKey} onChange={(event) => onDraftClaudeKeyChange(event.target.value)} type="password" placeholder="sk-ant-..." style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
              Google
              <input value={draftGoogleKey} onChange={(event) => onDraftGoogleKeyChange(event.target.value)} type="password" placeholder="AIza..." style={inputStyle} />
            </label>
          </SettingsGroup>

          {sessionMode === "product" ? (
            <SettingsGroup name="product" kicker="產品脈絡">
              <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
                產品名稱
                <input
                  value={draftProductProfile.name}
                  onChange={(event) => onDraftProductProfileChange({ name: event.target.value })}
                  placeholder="DLens"
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
                類別
                <input
                  value={draftProductProfile.category}
                  onChange={(event) => onDraftProductProfileChange({ category: event.target.value })}
                  placeholder="Creator analysis"
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
                目標受眾
                <input
                  value={draftProductProfile.audience}
                  onChange={(event) => onDraftProductProfileChange({ audience: event.target.value })}
                  placeholder="Threads creators"
                  style={inputStyle}
                />
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink }}>一鍵初始化</div>
                <textarea
                  value={productProfileSeedText}
                  onChange={(event) => onProductProfileSeedTextChange?.(event.target.value)}
                  rows={4}
                  placeholder="貼上 150 字產品說明，AI 幫你填"
                  style={{
                    ...inputStyle,
                    minHeight: 92,
                    resize: "vertical",
                    fontFamily: tokens.font.sans
                  }}
                />
                <SecondaryButton onClick={() => onInitProductProfile?.()} disabled={isInitializingProductProfile || !productProfileSeedText.trim()}>
                  {isInitializingProductProfile ? "取得建議中…" : "取得建議"}
                </SecondaryButton>
              </div>

              <div style={{ fontSize: 10.5, lineHeight: 1.6, color: tokens.color.softInk }}>
                Judgment 會讀這三欄，先做產品導向判斷，不在這裡解析自由文字。
              </div>
            </SettingsGroup>
          ) : null}

          <PrimaryButton onClick={onSaveSettings} style={{ width: "100%" }}>
            Save settings
          </PrimaryButton>
        </div>
      </WorkspaceSurface>
    </div>
  );
}
