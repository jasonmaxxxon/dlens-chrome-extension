import { DEEP_READING_MODELS } from "../compare/deep-reading";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { ExtensionSettings, FolderMode, LayoutPreferences, ProductContext, ProductProfile, ProductProfileContextFile } from "../state/types";
import {
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  Stamp,
  viewRootStyle
} from "./components";
import { useUiText } from "./i18n";
import { tokens } from "./tokens";


interface SettingsViewProps {
  sessionMode: FolderMode;
  draftBaseUrl: string;
  draftIngestApiToken?: string;
  hasIngestApiToken?: boolean;
  onDraftIngestApiTokenChange?: (value: string) => void;
  onClearIngestApiToken?: () => void;
  draftProvider: NonNullable<ExtensionSettings["oneLinerProvider"]> | "";
  draftOpenAiKey: string;
  draftClaudeKey: string;
  draftGoogleKey: string;
  draftDeepReadingModels?: ExtensionSettings["deepReadingModels"];
  onDraftDeepReadingModelsChange?: (provider: "google" | "claude" | "openai", model: string) => void;
  hasOpenAiKey?: boolean;
  hasClaudeKey?: boolean;
  hasGoogleKey?: boolean;
  draftLayoutPreferences: LayoutPreferences;
  draftProductProfile: ProductProfile;
  compiledProductContext?: ProductContext | null;
  storageUsage?: {
    bytesInUse: number;
    quotaBytes: number;
    unlimitedStorage: boolean;
  } | null;
  settingsSaveStatus?: { kind: "success" | "error"; message: string } | null;
  isSavingSettings?: boolean;
  /** Result of 儲存並測試 in the AI group. */
  aiKeyStatus?: { kind: "ok" | "error" | "testing"; message: string } | null;
  onSaveAndTestAi?: () => void;
  productProfileSeedText?: string;
  isInitializingProductProfile?: boolean;
  onDraftBaseUrlChange: (value: string) => void;
  onDraftProviderChange: (value: NonNullable<ExtensionSettings["oneLinerProvider"]> | "") => void;
  onDraftOpenAiKeyChange: (value: string) => void;
  onDraftClaudeKeyChange: (value: string) => void;
  onDraftGoogleKeyChange: (value: string) => void;
  onDraftLayoutPreferencesChange: (patch: Partial<LayoutPreferences>) => void;
  onDraftProductProfileChange: (patch: Partial<ProductProfile>) => void;
  onProductProfileSeedTextChange?: (value: string) => void;
  onInitProductProfile?: () => void;
  onClearProductCache?: () => void;
  createContextFileId: (kind: ProductProfileContextFile["kind"], name: string) => string;
  onSaveSettings: () => void;
}

const inputStyle = {
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.line}`,
  padding: "10px 12px",
  background: tokens.color.surface,
  color: tokens.color.ink,
  fontSize: 12,
  outline: "none",
  transition: tokens.motion.interactiveTransitionFast,
  width: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  fontFamily: tokens.font.sans
} as const;

const MAX_CONTEXT_FILES = 3;
const MAX_CONTEXT_FILE_CHARS = 30000;
const MAX_CONTEXT_TOTAL_CHARS = 60000;
const KB = 1024;
const MB = 1024 * 1024;

const settingsDrawerStyle: CSSProperties = {
  display: "grid",
  gap: tokens.spacing.md,
  overflow: "visible"
};

// Flows at the end of the form (not sticky) so the preceding card's bottom
// border and button are never covered by a floating bar. The popup scroll
// viewport reserves bottom padding, so the Save button stays fully reachable.

function formatCompactCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }
  return String(count);
}

function formatStorageBytes(bytes: number): string {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  }
  if (bytes >= KB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatStorageUsage(storageUsage: NonNullable<SettingsViewProps["storageUsage"]>): string {
  if (storageUsage.unlimitedStorage) {
    return `${formatStorageBytes(storageUsage.bytesInUse)} · 不限額`;
  }
  return `${formatStorageBytes(storageUsage.bytesInUse)} / ${formatStorageBytes(storageUsage.quotaBytes)}`;
}

function SettingsGroup({
  name,
  title,
  caption,
  children
}: {
  name: "folder" | "layout" | "language" | "connection" | "ai" | "product";
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div
      data-settings-group={name}
      data-dlens-presence="card"
      style={{
        display: "grid",
        gap: 12,
        padding: "14px 16px",
        borderRadius: tokens.radius.cardLg,
        border: `1px solid ${tokens.color.cardEdge}`,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.topicCard
      }}
    >
      <SectionHeader title={title} caption={caption} style={{ marginBottom: 0 }} />
      {children}
    </div>
  );
}

function ProductContextSourceCard({
  sourceKey,
  title,
  description,
  file,
  onImport
}: {
  sourceKey: ProductProfileContextFile["kind"];
  title: string;
  description: string;
  file?: ProductProfileContextFile;
  onImport: () => void;
}) {
  const loaded = Boolean(file);
  return (
    <div
      data-product-context-source-card={sourceKey}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 8,
        padding: "10px 11px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${loaded ? tokens.color.successBorder : tokens.color.cardEdge}`,
        background: loaded ? tokens.color.successSoft : tokens.color.surface
      }}
    >
      <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: loaded ? tokens.color.success : tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title} {loaded ? "已載入" : "尚未載入"}
        </span>
        <span style={{ fontSize: 10.5, color: loaded ? tokens.color.subInk : tokens.color.softInk, lineHeight: 1.45, fontFamily: loaded ? tokens.font.mono : tokens.font.sans }}>
          {loaded && file ? `${file.kind} · ${formatCompactCount(file.charCount)} chars` : description}
        </span>
      </span>
      <SecondaryButton onClick={onImport} style={{ padding: "6px 10px", fontSize: 11, flexShrink: 0 }}>
        匯入 {title}
      </SecondaryButton>
    </div>
  );
}

function SavedKeyStatus({ provider, visible }: { provider: "openai" | "claude" | "google"; visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <span data-settings-key-status={provider}>
      <Stamp tone="success">已設定</Stamp>
    </span>
  );
}

export function SettingsView({
  sessionMode,
  draftBaseUrl,
  draftIngestApiToken = "",
  hasIngestApiToken = false,
  onDraftIngestApiTokenChange,
  onClearIngestApiToken,
  draftProvider,
  draftOpenAiKey,
  draftClaudeKey,
  draftGoogleKey,
  draftDeepReadingModels,
  onDraftDeepReadingModelsChange,
  hasOpenAiKey = false,
  hasClaudeKey = false,
  hasGoogleKey = false,
  draftLayoutPreferences,
  draftProductProfile,
  compiledProductContext = null,
  storageUsage = null,
  settingsSaveStatus = null,
  isSavingSettings = false,
  aiKeyStatus = null,
  onSaveAndTestAi,
  productProfileSeedText = "",
  isInitializingProductProfile = false,
  onDraftBaseUrlChange,
  onDraftProviderChange,
  onDraftOpenAiKeyChange,
  onDraftClaudeKeyChange,
  onDraftGoogleKeyChange,
  onDraftLayoutPreferencesChange,
  onDraftProductProfileChange,
  onProductProfileSeedTextChange,
  onInitProductProfile,
  onClearProductCache,
  createContextFileId,
  onSaveSettings
}: SettingsViewProps) {
  const t = useUiText();
  const activeLanguage = draftLayoutPreferences.language ?? "zh";
  const [contextNotice, setContextNotice] = useState("");
  const readmeInputRef = useRef<HTMLInputElement | null>(null);
  const agentsInputRef = useRef<HTMLInputElement | null>(null);
  const aiAgentsInputRef = useRef<HTMLInputElement | null>(null);
  const contextFiles = draftProductProfile.contextFiles ?? [];
  const fileByKind = new Map(contextFiles.map((file) => [file.kind, file]));
  const showOpenAiSavedKey = hasOpenAiKey && !draftOpenAiKey.trim();
  const showClaudeSavedKey = hasClaudeKey && !draftClaudeKey.trim();
  const showGoogleSavedKey = hasGoogleKey && !draftGoogleKey.trim();
  const savedKeyPlaceholder = "已儲存金鑰 · 輸入以覆寫";
  // Each group saves itself (side panel A); the result shows in the group that asked.
  const [savedFrom, setSavedFrom] = useState<"ai" | "connection" | "language" | "product">("ai");
  const saveFrom = (group: typeof savedFrom) => { setSavedFrom(group); onSaveSettings(); };
  const saveStatus = (group: typeof savedFrom) => settingsSaveStatus && savedFrom === group ? (
    <div
      data-settings-save-status={settingsSaveStatus.kind}
      style={{
        fontSize: 11,
        lineHeight: 1.55,
        color: settingsSaveStatus.kind === "error" ? tokens.color.failed : tokens.color.success,
        padding: "8px 10px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${settingsSaveStatus.kind === "error" ? tokens.color.failedSoft : tokens.color.successSoft}`,
        background: settingsSaveStatus.kind === "error" ? tokens.color.failedSoft : tokens.color.successSoft
      }}
    >
      {settingsSaveStatus.message}
    </div>
  ) : null;
  const providers = [
    { id: "google" as const, name: "Google", filled: hasGoogleKey || !!draftGoogleKey.trim(), draft: draftGoogleKey, onChange: onDraftGoogleKeyChange, saved: showGoogleSavedKey, hint: "AIza..." },
    { id: "openai" as const, name: "OpenAI", filled: hasOpenAiKey || !!draftOpenAiKey.trim(), draft: draftOpenAiKey, onChange: onDraftOpenAiKeyChange, saved: showOpenAiSavedKey, hint: "sk-..." },
    { id: "claude" as const, name: "Claude", filled: hasClaudeKey || !!draftClaudeKey.trim(), draft: draftClaudeKey, onChange: onDraftClaudeKeyChange, saved: showClaudeSavedKey, hint: "sk-ant-..." }
  ];
  const chosen = providers.find((provider) => provider.id === draftProvider) ?? null;

  async function importContextFile(kind: ProductProfileContextFile["kind"], file: File | null) {
    if (!file) {
      return;
    }

    const currentFiles = draftProductProfile.contextFiles ?? [];
    if (currentFiles.length >= MAX_CONTEXT_FILES) {
      setContextNotice("最多匯入 3 份文件。");
      return;
    }

    const rawText = await file.text();
    const fileText = rawText.slice(0, MAX_CONTEXT_FILE_CHARS);
    const existingText = (draftProductProfile.contextText ?? "").trim();
    const nextBlock = [`[${file.name}]`, fileText.trim()].filter(Boolean).join("\n");
    const combined = [existingText, nextBlock].filter(Boolean).join("\n\n").slice(0, MAX_CONTEXT_TOTAL_CHARS);
    const truncated = rawText.length > MAX_CONTEXT_FILE_CHARS || [existingText, nextBlock].filter(Boolean).join("\n\n").length > MAX_CONTEXT_TOTAL_CHARS;
    const contextFile: ProductProfileContextFile = {
      id: createContextFileId(kind, file.name),
      name: file.name,
      kind,
      importedAt: new Date().toISOString(),
      charCount: fileText.length
    };

    onDraftProductProfileChange({
      contextText: combined,
      contextFiles: [...currentFiles, contextFile]
    });
    setContextNotice(truncated ? "文件已截斷（最多 60k 字元）。" : `${file.name} 已加入產品脈絡。`);
  }

  return (
    <div style={viewRootStyle()}>
      <ModeHeader
        mode="settings"
        kicker="Runtime settings"
        title={t("調整連線與模型入口", "Tune connections and model access")}
        deck={t("AI 金鑰只存在這部電腦。Ingest token 只會送到你設定的後端。", "AI keys stay on this device. The ingest token is sent only to the backend you configure.")}
      />

      <div data-settings-surface="drawer" style={settingsDrawerStyle}>
          <SettingsGroup name="ai" title="AI" caption="用你自己的 key，只存在這部電腦">
            <div style={{ fontSize: 11, lineHeight: 1.55, color: tokens.color.softInk }}>
              觀眾反應的「有咩做法 / 有咩分歧」和個人應用，都用這裡選的一家。
            </div>
            <div
              role="radiogroup"
              aria-label="AI provider"
              data-settings-provider-switch="true"
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: 3, borderRadius: tokens.radius.lg, background: tokens.color.contextSurface }}
            >
              {providers.map((provider) => {
                const active = draftProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-settings-provider-option={provider.id}
                    data-active={active ? "true" : "false"}
                    onClick={() => onDraftProviderChange(provider.id)}
                    style={{
                      display: "grid",
                      gap: 1,
                      padding: "7px 0",
                      border: 0,
                      borderRadius: tokens.radius.xs,
                      background: active ? tokens.color.elevated : "transparent",
                      boxShadow: active ? tokens.shadow.card : "none",
                      color: active ? tokens.color.ink : tokens.color.subInk,
                      fontFamily: tokens.font.sans,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer"
                    }}
                  >
                    {provider.name}
                    <small style={{ fontSize: 10.5, fontWeight: 400, color: tokens.color.softInk }}>{provider.filled ? "已填" : "未填"}</small>
                  </button>
                );
              })}
            </div>
            {chosen ? (
              <>
                <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    {chosen.name} API key
                    <SavedKeyStatus provider={chosen.id} visible={chosen.saved} />
                  </span>
                  <span style={{ display: "flex", gap: 8 }}>
                    <input
                      value={chosen.draft}
                      onChange={(event) => chosen.onChange(event.target.value)}
                      type="password"
                      placeholder={chosen.saved ? savedKeyPlaceholder : chosen.hint}
                      aria-label={`${chosen.name} API key`}
                      data-settings-ai-key={chosen.id}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    />
                    <PrimaryButton onClick={() => { setSavedFrom("ai"); (onSaveAndTestAi ?? onSaveSettings)(); }} disabled={isSavingSettings} dataAttrs={{ "data-settings-save": "ai" }}>
                      {isSavingSettings ? "儲存中…" : "儲存並測試"}
                    </PrimaryButton>
                  </span>
                </label>
                <label style={{ display: "grid", gap: tokens.spacing.sm, color: tokens.color.subInk }}>
                  深入解讀模型
                  <input aria-label={`${chosen.name} 深入解讀模型`} data-settings-deep-model={chosen.id} value={draftDeepReadingModels?.[chosen.id] ?? DEEP_READING_MODELS[chosen.id]} placeholder={DEEP_READING_MODELS[chosen.id]} onChange={event => onDraftDeepReadingModelsChange?.(chosen.id, event.target.value)} style={inputStyle} />
                </label>
                <button type="button" onClick={() => onDraftProviderChange("")} style={{ justifySelf: "start", border: 0, background: "none", padding: 0, fontSize: 11, color: tokens.color.softInk, cursor: "pointer" }}>
                  不用 AI
                </button>
              </>
            ) : (
              <div style={{ fontSize: 11, lineHeight: 1.55, color: tokens.color.softInk }}>未選 AI：觀眾反應只顯示不用 AI 的四個入口。選一家並填 key 即可開始。</div>
            )}
            {aiKeyStatus ? (
              <div
                data-settings-ai-status={aiKeyStatus.kind}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: aiKeyStatus.kind === "ok" ? tokens.color.success : aiKeyStatus.kind === "error" ? tokens.color.failed : tokens.color.softInk }}
              >
                <i style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />{aiKeyStatus.message}
              </div>
            ) : null}
            {saveStatus("ai")}
          </SettingsGroup>

          <SettingsGroup name="connection" title="連線" caption="Connection">
            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
              Ingest base URL
              <input
                value={draftBaseUrl}
                onChange={(event) => onDraftBaseUrlChange(event.target.value)}
                placeholder="http://127.0.0.1:8000"
                aria-label="Ingest base URL"
                data-settings-ingest-url="true"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                Ingest API token
                {hasIngestApiToken && !draftIngestApiToken.trim() ? <Stamp tone="success">已設定</Stamp> : null}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <input
                  value={draftIngestApiToken}
                  onChange={(event) => onDraftIngestApiTokenChange?.(event.target.value)}
                  type="password"
                  placeholder={hasIngestApiToken && !draftIngestApiToken.trim() ? "已儲存 token · 輸入以覆寫" : "貼上 ingest API token"}
                  aria-label="Ingest API token"
                  data-settings-ingest-token="true"
                  autoComplete="off"
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
                {hasIngestApiToken || draftIngestApiToken.trim() ? (
                  <SecondaryButton onClick={() => onClearIngestApiToken?.()} disabled={isSavingSettings} dataAttrs={{ "data-settings-ingest-token-clear": "true" }}>
                    清除
                  </SecondaryButton>
                ) : null}
              </span>
            </label>
            <div data-settings-ingest-help="true" style={{ fontSize: 11, lineHeight: 1.55, color: tokens.color.softInk }}>
              預設 http://127.0.0.1:8000，token 留空就不會送 Authorization。連 lam 的 Tailscale 時，網址改成 http://100.115.102.41:8000，貼上那台機器的 ingest API token 再儲存。Token 只存在這部瀏覽器，有填才會以 Authorization: Bearer 送到該後端。
            </div>

            <div
              data-settings-storage-usage="true"
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: tokens.color.softInk,
                fontVariantNumeric: "tabular-nums"
              }}
            >
              Storage 用量：{storageUsage ? formatStorageUsage(storageUsage) : "讀取中"}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <SecondaryButton onClick={() => saveFrom("connection")} disabled={isSavingSettings}>儲存</SecondaryButton>
            </div>
            {saveStatus("connection")}
          </SettingsGroup>

          <SettingsGroup name="language" title="語言" caption="Language">
            <div
              data-settings-language-switch="true"
              role="radiogroup"
              aria-label="Interface language"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
            >
              {(["zh", "en"] as const).map((lang) => {
                const active = activeLanguage === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-settings-language-option={lang}
                    data-active={active ? "true" : "false"}
                    onClick={() => onDraftLayoutPreferencesChange({ language: lang })}
                    style={{
                      padding: "9px 12px",
                      borderRadius: tokens.radius.lg,
                      border: `1px solid ${active ? tokens.color.accent : tokens.color.line}`,
                      background: active ? tokens.color.accent : tokens.color.surface,
                      color: active ? tokens.color.inverse : tokens.color.subInk,
                      fontFamily: tokens.font.sans,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      transition: tokens.motion.interactiveTransitionFast
                    }}
                  >
                    {lang === "zh" ? "中文" : "English"}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, lineHeight: 1.55, color: tokens.color.softInk }}>
              {t("切換介面外殼（模式標題、導覽列）的語言；深層內容暫時維持繁中。儲存後生效。", "Switches the shell chrome (mode headers, nav rail) language; deeper content stays 繁中 for now. Applies after saving.")}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <SecondaryButton onClick={() => saveFrom("language")} disabled={isSavingSettings}>儲存</SecondaryButton>
            </div>
            {saveStatus("language")}
          </SettingsGroup>

          {sessionMode === "product" ? (
            <SettingsGroup name="product" title="產品脈絡" caption="Product">
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

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink }}>產品文件</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <ProductContextSourceCard
                    sourceKey="readme"
                    title="README.md"
                    description="產品功能與使用情境"
                    file={fileByKind.get("readme")}
                    onImport={() => readmeInputRef.current?.click()}
                  />
                  <ProductContextSourceCard
                    sourceKey="agents"
                    title="AGENTS.md"
                    description="工程邊界與工作規則"
                    file={fileByKind.get("agents")}
                    onImport={() => agentsInputRef.current?.click()}
                  />
                  <ProductContextSourceCard
                    sourceKey="ai-agents"
                    title="AI agents 檔案"
                    description="Agent 角色與實作偏好"
                    file={fileByKind.get("ai-agents")}
                    onImport={() => aiAgentsInputRef.current?.click()}
                  />
                </div>
                <input
                  ref={readmeInputRef}
                  type="file"
                  accept=".md,.txt"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    void importContextFile("readme", event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={agentsInputRef}
                  type="file"
                  accept=".md,.txt"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    void importContextFile("agents", event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={aiAgentsInputRef}
                  type="file"
                  accept=".md,.txt"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    void importContextFile("ai-agents", event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
                <div style={{ fontSize: 10.5, lineHeight: 1.6, color: tokens.color.softInk }}>
                  {contextFiles.length}/3 files · {(draftProductProfile.contextText ?? "").length}/60000 chars
                  {contextNotice ? ` · ${contextNotice}` : ""}
                </div>
              </div>

              <div style={{ fontSize: 10.5, lineHeight: 1.6, color: tokens.color.softInk }}>
                儲存後會用這些資料編譯 ProductContext；Product AI 頁面只在 Phase B 啟用後產生結論。
              </div>

              {compiledProductContext ? (
                <div
                  data-product-context-preview="ready"
                  style={{
                    display: "grid",
                    gap: 9,
                    padding: "11px 12px",
                    borderRadius: tokens.radius.card,
                    border: `1px solid ${tokens.color.line}`,
                    background: tokens.color.contextSurface
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: tokens.color.ink }}>系統理解</span>
                    <Stamp tone="success">ProductContext</Stamp>
                  </div>
                  <div style={{ display: "grid", gap: 7, fontSize: 11.5, lineHeight: 1.55, color: tokens.color.subInk }}>
                    <div><strong style={{ color: tokens.color.ink }}>Promise：</strong>{compiledProductContext.productPromise}</div>
                    <div><strong style={{ color: tokens.color.ink }}>Workflows：</strong>{compiledProductContext.coreWorkflows.join("、") || "未列出"}</div>
                    <div><strong style={{ color: tokens.color.ink }}>Constraints：</strong>{compiledProductContext.explicitConstraints.join("、") || "未列出"}</div>
                  </div>
                </div>
              ) : (
                <div
                  data-product-context-preview="missing"
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: tokens.color.softInk,
                    padding: "9px 10px",
                    borderRadius: tokens.radius.card,
                    border: `1px dashed ${tokens.color.lineStrong}`,
                    background: tokens.color.contextSurface
                  }}
                >
                  系統理解尚未編譯；儲存 Settings 後才會產生可檢查的 ProductContext。
                </div>
              )}

              <div
                data-product-cache-reset="true"
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "10px 11px",
                  borderRadius: tokens.radius.card,
                  border: `1px solid ${tokens.color.line}`,
                  background: tokens.color.surface
                }}
              >
                <div style={{ display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: tokens.color.ink }}>清除 Product cache</span>
                  <span style={{ fontSize: 10.5, lineHeight: 1.55, color: tokens.color.softInk }}>
                    只會移除 Product 分析、判讀與編譯脈絡；已儲存的 signals、topics、PR evidence 不會被刪除。
                  </span>
                </div>
                <div>
                  <SecondaryButton onClick={() => onClearProductCache?.()}>
                    清除 Product cache
                  </SecondaryButton>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <PrimaryButton onClick={() => saveFrom("product")} disabled={isSavingSettings}>{isSavingSettings ? "儲存中…" : "儲存產品資料"}</PrimaryButton>
              </div>
              {saveStatus("product")}
            </SettingsGroup>
          ) : null}

      </div>
    </div>
  );
}
