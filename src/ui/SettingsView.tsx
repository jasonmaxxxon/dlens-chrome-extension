import { useRef, useState, type ReactNode } from "react";

import type { ExtensionSettings, FolderMode, ProductContext, ProductProfile, ProductProfileContextFile } from "../state/types";
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
  compiledProductContext?: ProductContext | null;
  settingsSaveStatus?: { kind: "success" | "error"; message: string } | null;
  isSavingSettings?: boolean;
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

const MAX_CONTEXT_FILES = 3;
const MAX_CONTEXT_FILE_CHARS = 30000;
const MAX_CONTEXT_TOTAL_CHARS = 60000;

function formatCompactCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }
  return String(count);
}

function makeContextFileId(kind: ProductProfileContextFile["kind"], name: string): string {
  return `ctx_${kind}_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${Date.now().toString(36)}`;
}

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
        gap: 8,
        padding: "10px 11px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${loaded ? tokens.color.lineStrong : tokens.color.line}`,
        background: loaded ? tokens.color.contextSurface : tokens.color.surface
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title} {loaded ? "已載入" : "尚未載入"}
          </span>
          <span style={{ fontSize: 10.5, color: tokens.color.softInk, lineHeight: 1.45 }}>
            {loaded && file ? `${file.kind} · ${formatCompactCount(file.charCount)} chars` : description}
          </span>
        </span>
        <Stamp tone={loaded ? "success" : "neutral"}>{loaded ? "Loaded" : "Ready"}</Stamp>
      </div>
      <div>
        <SecondaryButton onClick={onImport}>
          匯入 {title}
        </SecondaryButton>
      </div>
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
  compiledProductContext = null,
  settingsSaveStatus = null,
  isSavingSettings = false,
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
  const [contextNotice, setContextNotice] = useState("");
  const readmeInputRef = useRef<HTMLInputElement | null>(null);
  const agentsInputRef = useRef<HTMLInputElement | null>(null);
  const aiAgentsInputRef = useRef<HTMLInputElement | null>(null);
  const contextFiles = draftProductProfile.contextFiles ?? [];
  const fileByKind = new Map(contextFiles.map((file) => [file.kind, file]));

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
      id: makeContextFileId(kind, file.name),
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
            </SettingsGroup>
          ) : null}

          <PrimaryButton onClick={onSaveSettings} disabled={isSavingSettings} style={{ width: "100%" }}>
            {isSavingSettings ? "Saving settings..." : "Save settings"}
          </PrimaryButton>
          {settingsSaveStatus ? (
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
          ) : null}
        </div>
      </WorkspaceSurface>
    </div>
  );
}
