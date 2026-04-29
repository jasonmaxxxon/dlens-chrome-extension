import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type {
  ProductAgentTaskFeedback,
  ProductAgentTaskFeedbackValue,
  ProductContextField,
  ProductProfile,
  ProductSignalAnalysis,
  ProductSignalEvidenceNote,
  ProductSignalType,
  ProductSignalVerdict,
  Signal
} from "../state/types";
import { buildProductAgentTaskPromptHash } from "../compare/product-agent-task-feedback";
import { isProductContextSourceReady } from "../compare/product-context";
import { findSimilarHistoricalSignals, type SimilarHistoricalSignal } from "../compare/product-signal-history";
import type { ProductSignalEvidenceEntry } from "../compare/product-signal-analysis";
import type { ProductSignalReadiness } from "./product-signal-readiness";
import { sendExtensionMessage } from "./controller";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  Stamp,
  WorkspaceSurface,
  surfaceCardStyle,
  viewRootStyle
} from "./components";
import { tokens } from "./tokens";

export type ProductSignalPageKind = "classification" | "actionable-filter";

export const PRODUCT_SIGNAL_MOTION_CSS = `
[data-product-signal-view] .dlens-card-lift {
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 160ms cubic-bezier(0.4, 0, 0.2, 1), border-color 160ms ease;
  will-change: transform;
  transform: translateY(0);
}
[data-product-signal-view] .dlens-card-lift:hover,
[data-product-signal-view] .dlens-card-lift:focus-within {
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(27, 26, 23, 0.10), 0 2px 6px rgba(27, 26, 23, 0.04) !important;
  border-color: rgba(27, 26, 23, 0.18) !important;
}
[data-product-signal-view] .dlens-quote-row {
  transition: background 200ms ease;
  border-radius: 6px;
}
[data-product-signal-view] .dlens-quote-row:hover {
  background: rgba(27, 26, 23, 0.025);
}
[data-product-signal-view] [data-dlens-motion-button] {
  transition: transform 120ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease !important;
  transform: translateY(0) scale(1);
  touch-action: manipulation;
}
[data-product-signal-view] .dlens-feedback-btn {
  transition: transform 120ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease;
}
[data-product-signal-view] .dlens-feedback-btn:hover:not([disabled]) {
  transform: translateY(-1px);
}
[data-product-signal-view] .dlens-feedback-btn:active:not([disabled]) {
  transform: scale(0.96);
  transition-duration: 60ms !important;
}
[data-product-signal-view] .dlens-copy-btn {
  transition: transform 120ms ease, background 140ms ease, border-color 140ms ease;
}
[data-product-signal-view] .dlens-copy-btn:hover:not([disabled]) {
  transform: translateY(-1px) rotate(-2deg);
  border-color: rgba(27, 26, 23, 0.5);
}
[data-product-signal-view] .dlens-copy-btn:active:not([disabled]) {
  transform: scale(0.92);
  transition-duration: 60ms !important;
}
[data-product-signal-view] .dlens-expand-trigger {
  transition: background 120ms ease, border-color 120ms ease;
}
[data-product-signal-view] .dlens-details-summary:hover .dlens-expand-trigger {
  background: rgba(27, 26, 23, 0.06);
  border-color: rgba(27, 26, 23, 0.18);
}
[data-product-signal-view] .dlens-details-smooth {
  display: grid;
}
[data-product-signal-view] .dlens-details-summary {
  transition: color 140ms ease;
}
[data-product-signal-view] .dlens-details-summary:hover {
  color: rgba(27, 26, 23, 0.85);
}
[data-product-signal-view] .dlens-details-chevron {
  display: inline-block;
  transition: transform 160ms ease;
}
[data-product-signal-view] [data-dlens-details-open="true"] > .dlens-details-summary .dlens-details-chevron {
  transform: rotate(180deg);
}
[data-product-signal-view] .dlens-details-panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  overflow: hidden;
  transition: grid-template-rows 220ms ease, opacity 160ms ease;
}
[data-product-signal-view] [data-dlens-details-open="true"] > .dlens-details-panel {
  grid-template-rows: 1fr;
  opacity: 1;
}
[data-product-signal-view] .dlens-details-panel-inner {
  min-height: 0;
  overflow: hidden;
}
@media (prefers-reduced-motion: reduce) {
  [data-product-signal-view] .dlens-card-lift,
  [data-product-signal-view] .dlens-quote-row,
  [data-product-signal-view] .dlens-feedback-btn,
  [data-product-signal-view] .dlens-copy-btn,
  [data-product-signal-view] [data-dlens-motion-button],
  [data-product-signal-view] .dlens-details-summary,
  [data-product-signal-view] .dlens-details-chevron,
  [data-product-signal-view] .dlens-details-panel,
  [data-product-signal-view] .dlens-expand-trigger {
    transition: none !important;
  }
  [data-product-signal-view] .dlens-card-lift:hover,
  [data-product-signal-view] .dlens-card-lift:focus-within,
  [data-product-signal-view] .dlens-feedback-btn:hover,
  [data-product-signal-view] .dlens-copy-btn:hover,
  [data-product-signal-view] [data-dlens-motion-button]:active {
    transform: none !important;
  }
}
`;

const PAGE_COPY: Record<ProductSignalPageKind, { title: string; deck: string }> = {
  classification: {
    title: "分類整理",
    deck: "先把每則 Threads signal 放回正確範疇，再決定是否值得產品團隊處理。"
  },
  "actionable-filter": {
    title: "候選行動",
    deck: "先看討論串裡真正可試的 workflow，再決定是否存成產品建議。"
  },
};

const SIGNAL_TYPE_LABELS: Record<ProductSignalType, string> = {
  learning: "學習資源",
  competitor: "競品分析",
  demand: "需求",
  technical: "技術討論",
  noise: "噪音"
};

const SIGNAL_TYPE_META: Record<ProductSignalType, { label: string; color: string; soft: string }> = {
  demand: { label: "需求", color: tokens.color.success, soft: tokens.color.successSoft },
  technical: { label: "技術討論", color: tokens.color.running, soft: tokens.color.runningSoft },
  competitor: { label: "競品分析", color: tokens.color.techniqueViolet, soft: "rgba(94,75,115,0.10)" },
  learning: { label: "學習資源", color: tokens.color.techniqueTeal, soft: tokens.color.cyanSoft },
  noise: { label: "噪音", color: tokens.color.neutralText, soft: tokens.color.neutralSurfaceSoft }
};

const SIGNAL_TYPE_ORDER: ProductSignalType[] = ["demand", "technical", "competitor", "learning", "noise"];

const VERDICT_LABELS: Record<ProductSignalVerdict, string> = {
  try: "值得嘗試",
  watch: "保留觀察",
  park: "前提不符",
  insufficient_data: "資料不足"
};

const VERDICT_META: Record<ProductSignalVerdict, { label: string; color: string; soft: string }> = {
  try: { label: "值得嘗試", color: tokens.color.success, soft: tokens.color.successSoft },
  watch: { label: "保留觀察", color: tokens.color.running, soft: tokens.color.runningSoft },
  park: { label: "噪音 / 前提不符", color: tokens.color.neutralText, soft: tokens.color.neutralSurfaceSoft },
  insufficient_data: { label: "資料不足", color: tokens.color.queued, soft: tokens.color.queuedSoft }
};

const CONTEXT_FIELD_LABELS: Record<ProductContextField, string> = {
  productPromise: "產品承諾",
  targetAudience: "目標受眾",
  agentRoles: "Agent 角色",
  coreWorkflows: "核心流程",
  currentCapabilities: "現有能力",
  explicitConstraints: "限制",
  nonGoals: "不做什麼",
  preferredTechDirection: "技術方向",
  evaluationCriteria: "評估標準",
  unknowns: "未知項"
};

const AGENT_TASK_FEEDBACK_OPTIONS: Array<{
  value: ProductAgentTaskFeedbackValue;
  label: string;
  color: string;
  soft: string;
}> = [
  { value: "adopted", label: "已採用", color: tokens.color.success, soft: tokens.color.successSoft },
  { value: "needs_rewrite", label: "需要改寫", color: tokens.color.queued, soft: tokens.color.queuedSoft },
  { value: "irrelevant", label: "不相關", color: tokens.color.failed, soft: tokens.color.failedSoft },
  { value: "ignored", label: "先忽略", color: tokens.color.softInk, soft: tokens.color.neutralSurfaceSoft }
];

const FEEDBACK_LABELS: Record<ProductAgentTaskFeedbackValue, string> = {
  adopted: "已採用",
  needs_rewrite: "需要改寫",
  irrelevant: "不相關",
  ignored: "先忽略"
};

function isProductProfileReady(productProfile: ProductProfile | null | undefined): boolean {
  return Boolean(productProfile?.name?.trim() && productProfile.category?.trim() && productProfile.audience?.trim());
}

function analysisBySignalId(analyses: ProductSignalAnalysis[]): Map<string, ProductSignalAnalysis> {
  return new Map(analyses.map((analysis) => [analysis.signalId, analysis]));
}

function visibleAnalyses(kind: ProductSignalPageKind, analyses: ProductSignalAnalysis[]): ProductSignalAnalysis[] {
  const complete = analyses.filter((analysis) => analysis.status === "complete");
  return complete;
}

function readSignalReadiness(signal: Signal, readinessById: Record<string, ProductSignalReadiness>): ProductSignalReadiness {
  return readinessById[signal.id] ?? { status: "missing_item" };
}

function hasQueueableSignals(signals: Signal[], readinessById: Record<string, ProductSignalReadiness>): boolean {
  return signals.some((signal) => readSignalReadiness(signal, readinessById).status === "saved");
}

function hasAnalyzableSignals(signals: Signal[], readinessById: Record<string, ProductSignalReadiness>): boolean {
  return signals.some((signal) => readSignalReadiness(signal, readinessById).status === "ready");
}

function hasInFlightSignals(signals: Signal[], readinessById: Record<string, ProductSignalReadiness>): boolean {
  return signals.some((signal) => readSignalReadiness(signal, readinessById).status === "crawling");
}

function canRunProductSignalAction({
  signals,
  productProfile,
  aiProviderReady,
  signalReadinessById
}: {
  signals: Signal[];
  productProfile: ProductProfile | null | undefined;
  aiProviderReady: boolean;
  signalReadinessById: Record<string, ProductSignalReadiness>;
}): boolean {
  return signals.length > 0
    && aiProviderReady
    && isProductProfileReady(productProfile)
    && isProductContextSourceReady(productProfile)
    && (hasQueueableSignals(signals, signalReadinessById) || hasAnalyzableSignals(signals, signalReadinessById));
}

function readinessCopy({
  signals,
  analyses,
  productProfile,
  aiProviderReady,
  signalReadinessById
}: {
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  aiProviderReady: boolean;
  signalReadinessById: Record<string, ProductSignalReadiness>;
}) {
  if (!signals.length) {
    return "Product mode 收件匣沒有 signal。先在 Collect 儲存一篇 Threads post。";
  }
  if (!aiProviderReady) {
    return "尚未設定 AI key。先到 Settings 設定 Google / OpenAI / Claude key。";
  }
  if (!isProductProfileReady(productProfile)) {
    return "先到 Settings 補產品名稱、類別和受眾。";
  }
  if (!isProductContextSourceReady(productProfile)) {
    return "先到 Settings 匯入 README / AGENTS / 產品文件，讓 ProductContext 可編譯。";
  }
  if (hasQueueableSignals(signals, signalReadinessById)) {
    return "有 signal 尚未抓取。按分析收件匣會先送出抓取請求，完成後再分析。";
  }
  if (hasInFlightSignals(signals, signalReadinessById)) {
    return "抓取正在進行；完成後會自動嘗試分析，也可以稍後再按分析。";
  }
  if (!analyses.length) {
    return hasAnalyzableSignals(signals, signalReadinessById)
      ? "已有 ready signal。按下分析收件匣後，這裡才會顯示真實 AI 結果。"
      : "目前沒有可分析的 ready signal。請先處理抓取失敗或內容不完整的項目。";
  }
  return "";
}

function readinessLabel(readiness: ProductSignalReadiness): { label: string; detail: string; tone: "success" | "warning" | "neutral" } {
  switch (readiness.status) {
    case "saved":
      return { label: "尚未抓取", detail: "按分析會先送出抓取請求。", tone: "warning" };
    case "crawling":
      return { label: "抓取中", detail: "等待 backend 完成 ThreadReadModel。", tone: "neutral" };
    case "ready":
      return { label: "可分析", detail: "已有 assembled content，可以執行 ProductSignalAnalyzer。", tone: "success" };
    case "missing_content":
      return { label: "內容不完整", detail: "crawl 完成但缺少 assembled content，請重新處理該貼文。", tone: "warning" };
    case "failed":
      return { label: "抓取失敗", detail: "請重新送出抓取後再分析。", tone: "warning" };
    case "missing_item":
    default:
      return { label: "找不到貼文", detail: "signal 缺少對應的 saved item。", tone: "warning" };
  }
}

function excerpt(value: string | null | undefined, maxLength = 150): string {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function splitFirstSentence(value: string | null | undefined, fallbackLength = 80): { lead: string; rest: string } {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { lead: "", rest: "" };
  const match = trimmed.match(/^([^。．.!?！？]+[。．.!?！？])\s*(.*)$/);
  if (match && match[1] && match[1].length >= 6 && match[1].length <= 120) {
    return { lead: match[1], rest: match[2] ?? "" };
  }
  if (trimmed.length <= fallbackLength) {
    return { lead: trimmed, rest: "" };
  }
  return { lead: `${trimmed.slice(0, fallbackLength - 1)}…`, rest: trimmed.slice(fallbackLength - 1) };
}

function formatSubtype(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .join(" ");
}

function contextLabels(fields: ProductContextField[]): string {
  const safeFields = Array.isArray(fields) ? fields : [];
  return safeFields.map((field) => CONTEXT_FIELD_LABELS[field]).filter(Boolean).join("、") || "ProductContext";
}

interface EvidenceCitation {
  ref: string;
  entry?: ProductSignalEvidenceEntry;
  note?: ProductSignalEvidenceNote;
}

function citationsForAnalysis(
  analysis: ProductSignalAnalysis,
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>
): EvidenceCitation[] {
  const evidence = Array.isArray(evidenceBySignalId[analysis.signalId]) ? evidenceBySignalId[analysis.signalId] : [];
  const entryByRef = new Map(evidence.map((entry) => [entry.ref, entry]));
  const evidenceNotes = Array.isArray(analysis.evidenceNotes) ? analysis.evidenceNotes : [];
  const evidenceRefs = Array.isArray(analysis.evidenceRefs) ? analysis.evidenceRefs : [];
  const noteByRef = new Map(evidenceNotes.map((note) => [note.ref, note]));
  return evidenceRefs
    .map((ref) => ({
      ref,
      entry: entryByRef.get(ref),
      note: noteByRef.get(ref)
    }))
    .filter((citation) => citation.entry || citation.note);
}

function cardStyle(extra?: CSSProperties): CSSProperties {
  return surfaceCardStyle({
    display: "grid",
    gap: 9,
    padding: "12px 13px",
    background: tokens.color.surface,
    boxShadow: "none",
    ...extra
  });
}

function mutedPanelStyle(extra?: CSSProperties): CSSProperties {
  return surfaceCardStyle({
    display: "grid",
    gap: 8,
    padding: "10px 12px",
    background: tokens.color.contextSurface,
    boxShadow: "none",
    ...extra
  });
}

type InsightTone = "relevance" | "timing" | "experiment" | "validation";

const INSIGHT_TONE: Record<InsightTone, { label: string; accent: string; soft: string }> = {
  relevance:  { label: "為什麼相關", accent: tokens.color.success,  soft: tokens.color.successSoft },
  timing:     { label: "為什麼現在", accent: tokens.color.running,  soft: tokens.color.runningSoft },
  experiment: { label: "可以試",     accent: tokens.color.accent,   soft: tokens.color.cyanSoft   },
  validation: { label: "驗證",       accent: tokens.color.subInk,   soft: tokens.color.neutralSurface }
};

function InsightSection({ tone, children, label }: { tone: InsightTone; children: ReactNode; label?: string }) {
  const meta = INSIGHT_TONE[tone];
  return (
    <div style={{ display: "grid", gap: 3, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            border: `1px solid ${meta.accent}`,
            background: meta.soft
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 800, color: meta.accent, letterSpacing: 0 }}>{label ?? meta.label}</span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk }}>{children}</div>
    </div>
  );
}

function citationText(citation: EvidenceCitation, maxLength = 180): string {
  if (citation.entry?.text) {
    return excerpt(citation.entry.text, maxLength);
  }
  return excerpt(citation.note?.quoteSummary ?? "", maxLength);
}

function citationUseCase(citation: EvidenceCitation, maxLength = 120): string {
  return excerpt(citation.note?.quoteSummary || citation.entry?.text || "", maxLength);
}

const TOOL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Claude Skill", pattern: /Claude\s+Skill/i },
  { label: "Claude", pattern: /\bClaude\b/i },
  { label: "Slack", pattern: /\bSlack\b/i },
  { label: "Jira", pattern: /\bJira\b/i },
  { label: "GitLab", pattern: /\bGitLab\b/i },
  { label: "CI/CD", pattern: /\bCI\/CD\b|\bcicd\b/i },
  { label: "Metabase", pattern: /\bMetabase\b/i },
  { label: "Google Analytics", pattern: /\bGoogle\s+Analytics\b|\bGA\b/i },
  { label: "Confluence", pattern: /\bConfluence\b/i },
  { label: "Clarity", pattern: /\bClarity\b/i },
  { label: "SQL", pattern: /\bSQL\b/i },
  { label: "MCP", pattern: /\bMCP\b/i },
  { label: "crawler", pattern: /爬蟲|crawler/i }
];

function extractToolNames(value: string): string[] {
  const names: string[] = [];
  for (const tool of TOOL_PATTERNS) {
    if (tool.pattern.test(value) && !names.includes(tool.label)) {
      names.push(tool.label);
    }
  }
  return names.filter((name) => !(name === "Claude" && names.includes("Claude Skill"))).slice(0, 6);
}

function inferWorkflowPattern(citation: EvidenceCitation): {
  pattern: string;
  whyItWorks: string;
  copyableTemplate: string;
  recipeMarkdown: string;
  tradeoff: string;
  tools: string[];
} {
  const raw = [
    citation.entry?.text,
    citation.note?.quoteSummary,
    citation.note?.whyItMatters,
    citation.note?.reusablePattern,
    citation.note?.whyItWorks,
    citation.note?.copyableTemplate,
    citation.note?.copyRecipeMarkdown,
    citation.note?.tradeoff,
    ...(citation.note?.workflowStack ?? [])
  ].filter(Boolean).join(" ");
  const lower = raw.toLowerCase();
  const explicitStack = Array.isArray(citation.note?.workflowStack) ? citation.note.workflowStack.filter(Boolean).slice(0, 6) : [];
  const tools = explicitStack.length ? explicitStack : extractToolNames(raw);
  const explicitPattern = citation.note?.reusablePattern?.trim();
  const explicitWhy = citation.note?.whyItWorks?.trim();
  const explicitTemplate = citation.note?.copyableTemplate?.trim();
  const explicitRecipe = citation.note?.copyRecipeMarkdown?.trim();
  const explicitTradeoff = citation.note?.tradeoff?.trim();

  if (explicitPattern || explicitWhy || explicitTemplate || explicitRecipe || explicitTradeoff || explicitStack.length) {
    return {
      pattern: explicitPattern || citationUseCase(citation, 70) || "可重用工作流",
      whyItWorks: explicitWhy || citation.note?.whyItMatters || "這條留言把場景、工具和輸出連在一起。",
      copyableTemplate: explicitTemplate || "輸入來源 -> Agent 處理 -> 可交付輸出",
      recipeMarkdown: explicitRecipe || explicitTemplate || "輸入來源 -> Agent 處理 -> 可交付輸出",
      tradeoff: explicitTradeoff || "",
      tools
    };
  }

  if ((lower.includes("slack") || lower.includes("jira")) && (lower.includes("release") || lower.includes("confluence") || lower.includes("metabase") || lower.includes("sql"))) {
    return {
      pattern: "多來源工作流轉文件",
      whyItWorks: "它把資料來源、Agent 處理和可交付文件分清楚，團隊可替換自己的工具。",
      copyableTemplate: "Slack/Jira/資料庫 -> Claude Skill -> Release note / ticket / Confluence",
      recipeMarkdown: "- Input: Slack/Jira/資料庫\n- Process: Claude Skill 摘要與整理\n- Output: Release note / ticket / Confluence",
      tradeoff: "需要工具授權與資料讀取權限。",
      tools
    };
  }

  if (lower.includes("gitlab") || lower.includes("ci/cd") || lower.includes("cicd") || lower.includes("review")) {
    return {
      pattern: "工程回饋自動化",
      whyItWorks: "它讓 agent 進入既有 issue、CI 和 review 節點，不要求使用者重整上下文。",
      copyableTemplate: "Jira/GitLab issue -> CI/CD agent -> review/test feedback",
      recipeMarkdown: "- Input: Jira/GitLab issue\n- Process: CI/CD agent 讀取結果\n- Output: review/test feedback",
      tradeoff: "需要接入工程權限與測試結果。",
      tools
    };
  }

  if (lower.includes("search") || raw.includes("搜尋") || raw.includes("爬蟲") || lower.includes("crawler")) {
    return {
      pattern: "搜尋與爬蟲做市場雷達",
      whyItWorks: "它先自動過濾雜訊，再保留產品團隊需要追蹤的趨勢敏感度。",
      copyableTemplate: "creator/keyword -> crawler/search agent -> trend digest",
      recipeMarkdown: "- Input: creator/keyword\n- Process: crawler/search agent 定期掃描\n- Output: trend digest",
      tradeoff: "需要控制抓取頻率與來源品質。",
      tools
    };
  }

  return {
    pattern: citationUseCase(citation, 70) || "可重用工作流",
    whyItWorks: citation.note?.whyItMatters || "這條留言把抽象需求落到具體操作方式。",
    copyableTemplate: "輸入來源 -> Agent 處理 -> 可交付輸出",
    recipeMarkdown: "",
    tradeoff: "原文不足以推導完整做法。",
    tools
  };
}

function WorkflowEvidenceCard({ citation }: { citation: EvidenceCitation }) {
  const workflow = inferWorkflowPattern(citation);
  return (
    <div
      data-evidence-workflow-card="true"
      style={{
        display: "grid",
        gap: 9,
        padding: "11px 12px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.elevated
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 800, color: tokens.color.ink }}>
            {workflow.pattern}
          </div>
        </div>
        {workflow.tools.length ? (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }} aria-label="工具鏈">
            <span style={{ fontSize: 10.5, color: tokens.color.softInk, lineHeight: "20px" }}>Stack</span>
            {workflow.tools.map((tool) => (
              <span
                key={tool}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 20,
                  padding: "0 7px",
                  borderRadius: 999,
                  background: tokens.color.neutralSurfaceSoft,
                  border: `1px solid ${tokens.color.line}`,
                  color: tokens.color.subInk,
                  fontSize: 10.5,
                  fontWeight: 700
                }}
              >
                {tool}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        <div style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: 9, alignItems: "start" }}>
          <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 800 }}>如何照抄</span>
          <pre style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: tokens.color.ink, fontFamily: tokens.font.mono, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {workflow.recipeMarkdown || workflow.copyableTemplate}
          </pre>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: 9, alignItems: "start" }}>
          <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 800 }}>為什麼可以這樣做</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.subInk }}>
            {workflow.whyItWorks}
          </span>
        </div>
        {workflow.tradeoff ? (
          <div style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", gap: 9, alignItems: "start" }}>
            <span style={{ fontSize: 11, color: tokens.color.softInk, fontWeight: 800 }}>限制</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.subInk }}>
              {workflow.tradeoff}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function detailSummaryStyle(): CSSProperties {
  return {
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1.4,
    color: tokens.color.ink,
    fontWeight: 820,
    padding: "13px 0",
    borderTop: `1px solid ${tokens.color.line}`,
    paddingLeft: 0
  };
}

function compactActionButtonStyle(extra?: CSSProperties): CSSProperties {
  return {
    border: `1px solid ${tokens.color.lineStrong}`,
    borderRadius: tokens.radius.card,
    padding: "7px 12px",
    background: tokens.color.elevated,
    color: tokens.color.ink,
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    transition: tokens.motion.interactiveTransitionFast,
    ...extra
  };
}

function smoothDetailsSummaryStyle(extra?: CSSProperties): CSSProperties {
  return {
    border: 0,
    background: "transparent",
    width: "100%",
    textAlign: "left",
    fontFamily: tokens.font.sans,
    ...extra
  };
}

function PanelBadge({
  children,
  tone,
  dataAttrName,
  dataAttrValue
}: {
  children: string;
  tone: "experiment" | "agent";
  dataAttrName: string;
  dataAttrValue: string;
}) {
  const styleByTone = tone === "experiment"
    ? { color: tokens.color.accent, background: tokens.color.runningSoft, borderColor: tokens.color.accentGlow }
    : { color: tokens.color.subInk, background: tokens.color.neutralSurfaceSoft, borderColor: tokens.color.lineStrong };
  return (
    <span
      {...{ [dataAttrName]: dataAttrValue }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 20,
        padding: "0 7px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 750,
        letterSpacing: 0,
        border: `1px solid ${styleByTone.borderColor}`,
        color: styleByTone.color,
        background: styleByTone.background,
        whiteSpace: "nowrap",
        flexShrink: 0
      }}
    >
      {children}
    </span>
  );
}

function SmoothDetails({
  summary,
  children,
  defaultOpen = false,
  style,
  summaryStyle,
  dataAttributes
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  style?: CSSProperties;
  summaryStyle?: CSSProperties;
  dataAttributes?: Record<string, string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      {...dataAttributes}
      className="dlens-details-smooth"
      data-dlens-smooth-details="true"
      data-dlens-details-open={open ? "true" : "false"}
      style={style}
    >
      <button
        type="button"
        className="dlens-details-summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={smoothDetailsSummaryStyle(summaryStyle)}
      >
        {summary}
      </button>
      <div className="dlens-details-panel" data-dlens-details-panel="true">
        <div className="dlens-details-panel-inner">
          {children}
        </div>
      </div>
    </div>
  );
}

function primaryWorkflowTitle(citations: EvidenceCitation[], fallback: string): string {
  const primary = citations[0];
  if (!primary) {
    return excerpt(fallback, 110);
  }
  return excerpt(inferWorkflowPattern(primary).pattern, 110);
}

function EvidenceUseCaseList({
  citations,
  maxItems = 3
}: {
  citations: EvidenceCitation[];
  maxItems?: number;
}) {
  if (!citations.length) {
    return (
      <div style={mutedPanelStyle({ fontSize: 11.5, lineHeight: 1.55, color: tokens.color.softInk })}>
        這則訊號暫時沒有可顯示的原文證據；先不要把 AI 摘要當成可行動結論。
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div
        data-evidence-section-label="true"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: tokens.color.softInk,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 14
        }}
      >
        可借用 workflow
      </div>
      {citations.slice(0, maxItems).map((citation, idx) => (
        <div
          key={citation.ref}
          data-evidence-quote="true"
          className="dlens-quote-row"
          style={{
            position: "relative",
            paddingLeft: 38,
            paddingTop: idx > 0 ? 18 : 4,
            paddingBottom: 4,
            marginTop: idx > 0 ? 18 : 0,
            borderTop: idx > 0 ? `1px solid ${tokens.color.line}` : undefined,
            display: "grid",
            gap: 12
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span
              data-evidence-quote-author="true"
              style={{
                fontStyle: "italic",
                fontFamily: tokens.font.serifCjk,
                fontSize: 13,
                color: tokens.color.subInk,
                letterSpacing: 0.1
              }}
            >
              — {citation.entry?.author ?? citation.ref}
            </span>
            {citation.entry?.likeCount ? (
              <span style={{ fontSize: 12, color: tokens.color.softInk }}>{citation.entry.likeCount} 按讚</span>
            ) : null}
          </div>
          <WorkflowEvidenceCard citation={citation} />
          {citation.entry?.text || citation.note?.whyItMatters ? (
            <SmoothDetails
              summary={
                <span
                  className="dlens-expand-trigger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: tokens.color.neutralSurface,
                    border: `1px solid ${tokens.color.line}`,
                    fontSize: 11.5,
                    fontStyle: "italic",
                    color: tokens.color.softInk,
                    fontWeight: 500,
                    letterSpacing: 0
                  }}
                >
                  查看原文與模型判讀 →
                </span>
              }
              summaryStyle={{ cursor: "pointer", padding: 0, letterSpacing: 0 }}
            >
              <div style={{ display: "grid", gap: 7, marginTop: 10, paddingBottom: 4 }}>
                {citation.entry?.text ? (
                  <div
                    style={{
                      background: tokens.color.contextSurface,
                      borderLeft: `2px solid ${tokens.color.lineStrong}`,
                      borderRadius: "0 4px 4px 0",
                      padding: "9px 13px"
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 750, color: tokens.color.softInk, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 5 }}>
                      原文
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
                      {citationText(citation, 260)}
                    </div>
                  </div>
                ) : null}
                {citation.note?.whyItMatters ? (
                  <div
                    style={{
                      background: tokens.color.elevated,
                      border: `1px solid ${tokens.color.line}`,
                      borderRadius: tokens.radius.card,
                      padding: "9px 13px"
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 750, color: tokens.color.softInk, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 5 }}>
                      模型判讀（輔助）
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
                      {citation.note.whyItMatters}
                    </div>
                  </div>
                ) : null}
              </div>
            </SmoothDetails>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AiJudgmentDetails({ analysis }: { analysis: ProductSignalAnalysis }) {
  if (!analysis.whyRelevant && !analysis.whyNow) {
    return null;
  }
  return (
    <SmoothDetails
      summary="AI 判斷依據（輔助）"
      summaryStyle={detailSummaryStyle()}
    >
      <div style={{ display: "grid", gap: 9, marginTop: 2, paddingBottom: 14 }}>
        {analysis.whyRelevant ? (
          <InsightSection tone="relevance" label="產品相關性">{excerpt(analysis.whyRelevant, 160)}</InsightSection>
        ) : null}
        {analysis.whyNow ? (
          <InsightSection tone="timing" label="時機判斷">{excerpt(analysis.whyNow, 160)}</InsightSection>
        ) : null}
        <ProductMatchFootnote relevantTo={analysis.relevantTo} reason={analysis.reason} />
      </div>
    </SmoothDetails>
  );
}

function AiExperimentDetails({ analysis, defaultOpen = false }: { analysis: ProductSignalAnalysis; defaultOpen?: boolean }) {
  const blockers = Array.isArray(analysis.blockers) ? analysis.blockers : [];
  const hasExperiment = Boolean(analysis.experimentHint || analysis.reason || analysis.validationMetric || blockers.length || analysis.agentTaskSpec);
  if (!hasExperiment) {
    return null;
  }
  return (
    <SmoothDetails
      summary={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <span>AI 實驗建議（輔助）</span>
          <PanelBadge tone="experiment" dataAttrName="data-product-panel-badge" dataAttrValue="experiment">試驗</PanelBadge>
        </div>
      }
      defaultOpen={defaultOpen}
      dataAttributes={{ "data-product-panel": "experiment" }}
      style={{
        background: tokens.color.elevated,
        border: `1px solid ${tokens.color.line}`,
        borderLeft: `2px solid ${tokens.color.accentGlow}`,
        borderRadius: tokens.radius.card,
        padding: "0 12px"
      }}
      summaryStyle={{ ...detailSummaryStyle(), borderTop: "none" }}
    >
      <div style={{ display: "grid", gap: 9, marginTop: 2, paddingBottom: 14 }}>
        {analysis.experimentHint || analysis.reason ? (
          <InsightSection tone="experiment" label="建議怎樣試">{excerpt(analysis.experimentHint || analysis.reason, 160)}</InsightSection>
        ) : null}
        {analysis.validationMetric ? (
          <InsightSection tone="validation" label="怎樣驗證">{excerpt(analysis.validationMetric, 160)}</InsightSection>
        ) : null}
        {blockers.length ? (
          <div style={mutedPanelStyle({ background: tokens.color.queuedSoft })}>
            <div style={{ fontSize: 11.5, color: tokens.color.queued, fontWeight: 800 }}>阻礙 · {blockers.length}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3, fontSize: 11.5, lineHeight: 1.5, color: tokens.color.subInk }}>
              {blockers.map((blocker, blockerIndex) => (
                <li key={blockerIndex}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SmoothDetails>
  );
}

function ProductMatchFootnote({ relevantTo, reason }: { relevantTo: ProductContextField[]; reason: string }) {
  const safeRelevantTo = Array.isArray(relevantTo) ? relevantTo : [];
  if (!safeRelevantTo.length && !reason) return null;
  const labels = contextLabels(safeRelevantTo);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", paddingLeft: 12, fontSize: 11, lineHeight: 1.55, color: tokens.color.softInk, fontStyle: "italic" }}>
      <span aria-hidden style={{ flexShrink: 0 }}>↳</span>
      <span>對應 {labels}{reason ? ` · ${excerpt(reason, 140)}` : ""}</span>
    </div>
  );
}

function ScorePill({ children, color, soft }: { children: string; color: string; soft: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${soft}`,
        background: soft,
        color,
        fontSize: 10.5,
        fontWeight: 800,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </span>
  );
}

function PendingSignalCard({
  signal,
  preview,
  readiness,
  analysis
}: {
  signal: Signal;
  preview?: string;
  readiness: ProductSignalReadiness;
  analysis?: ProductSignalAnalysis;
}) {
  const label = analysis?.status === "error"
    ? { label: "分析失敗", detail: analysis.error || analysis.reason || "這則訊號未能產生可信分析。", tone: "warning" as const }
    : readinessLabel(readiness);
  return (
    <div style={cardStyle({ padding: "10px 12px" })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Stamp tone={label.tone}>{label.label}</Stamp>
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>{analysis?.status === "error" ? "需重試" : "未分析"}</span>
        </div>
        <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>{signal.source}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: tokens.color.subInk }}>{label.detail}</div>
      {preview ? (
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: tokens.color.ink }}>{preview}</div>
      ) : null}
    </div>
  );
}

function ReadinessPanel({
  signals,
  analyses,
  productProfile,
  aiProviderReady,
  analysisError,
  analysisNotice,
  isAnalyzing,
  signalReadinessById,
  onAnalyze
}: {
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  aiProviderReady: boolean;
  analysisError?: string | null;
  analysisNotice?: string | null;
  isAnalyzing: boolean;
  signalReadinessById: Record<string, ProductSignalReadiness>;
  onAnalyze: () => void;
}) {
  const copy = readinessCopy({ signals, analyses, productProfile, aiProviderReady, signalReadinessById });
  const canAnalyze = canRunProductSignalAction({ signals, productProfile, aiProviderReady, signalReadinessById });
  const completedCount = analyses.filter((analysis) => analysis.status === "complete").length;
  const hasResults = completedCount > 0;
  const allGreen = signals.length > 0
    && completedCount > 0
    && aiProviderReady
    && isProductProfileReady(productProfile)
    && isProductContextSourceReady(productProfile);

  return (
    <div style={mutedPanelStyle({ gap: hasResults ? 8 : 10 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <Kicker>{hasResults ? "分析狀態" : "真實狀態"}</Kicker>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {allGreen ? (
            <>
              <Stamp tone="success">✓ 已就緒</Stamp>
              <Stamp tone="neutral">{signals.length} signals · {completedCount} analyses</Stamp>
            </>
          ) : (
            <>
              <Stamp tone={signals.length ? "success" : "warning"}>{signals.length} signals</Stamp>
              <Stamp tone={completedCount ? "success" : "neutral"}>{completedCount} analyses</Stamp>
              <Stamp tone={aiProviderReady ? "success" : "warning"}>AI key</Stamp>
              <Stamp tone={isProductProfileReady(productProfile) ? "success" : "warning"}>ProductProfile</Stamp>
              <Stamp tone={isProductContextSourceReady(productProfile) ? "success" : "warning"}>ProductContext</Stamp>
            </>
          )}
        </div>
      </div>
      {copy ? <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>{copy}</div> : null}
      {analysisError ? (
        <div
          style={{
            borderRadius: tokens.radius.card,
            border: `1px solid ${tokens.color.failedSoft}`,
            background: tokens.color.failedSoft,
            color: tokens.color.failed,
            padding: "9px 10px",
            fontSize: 11.5,
            lineHeight: 1.55
          }}
        >
          {analysisError}
        </div>
      ) : null}
      {analysisNotice ? (
        <div
          style={{
            borderRadius: tokens.radius.card,
            border: `1px solid ${tokens.color.line}`,
            background: tokens.color.surface,
            color: tokens.color.subInk,
            padding: "9px 10px",
            fontSize: 11.5,
            lineHeight: 1.55
          }}
        >
          {analysisNotice}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <PrimaryButton onClick={onAnalyze} disabled={!canAnalyze || isAnalyzing}>
          {isAnalyzing ? "分析中" : hasResults ? "重新分析" : "分析收件匣"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function ClassificationSignalRow({
  analysis,
  selected,
  onSelect
}: {
  analysis: ProductSignalAnalysis;
  selected: boolean;
  onSelect: () => void;
}) {
  const typeMeta = SIGNAL_TYPE_META[analysis.signalType];
  const verdictMeta = VERDICT_META[analysis.verdict];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        ...cardStyle({
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          borderColor: selected ? typeMeta.color : tokens.color.line,
          background: selected ? typeMeta.soft : tokens.color.surface,
          gap: 7
        }),
        font: "inherit"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill>
        <span style={{ fontSize: 11, color: tokens.color.softInk, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatSubtype(analysis.signalSubtype)}</span>
      </div>
      <div style={{ fontSize: 10.5, color: tokens.color.softInk, fontWeight: 750 }}>AI 摘要</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 750, color: tokens.color.ink }}>{excerpt(analysis.contentSummary, 120)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <ScorePill color={verdictMeta.color} soft={verdictMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill>
      </div>
    </button>
  );
}

function SelectedPostAside({
  analysis,
  preview
}: {
  analysis: ProductSignalAnalysis;
  preview?: string;
}) {
  const fullText = preview || analysis.contentSummary;
  const { lead, rest } = splitFirstSentence(fullText, 80);
  const typeMeta = SIGNAL_TYPE_META[analysis.signalType];
  const verdictMeta = VERDICT_META[analysis.verdict];
  return (
    <aside style={cardStyle({ gap: 11 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Kicker>系統挑出的內容</Kicker>
        <Stamp tone="neutral">{analysis.contentType}</Stamp>
      </div>
      <div style={mutedPanelStyle({ background: tokens.color.elevated, gap: 6 })}>
        <div style={{ fontSize: 10.5, color: tokens.color.softInk, fontWeight: 750 }}>討論串內容</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: tokens.color.ink, fontWeight: 700 }}>{lead}</div>
        {rest ? (
          <SmoothDetails
            summary={<><span className="dlens-details-chevron" aria-hidden>▾</span> 展開全文</>}
            summaryStyle={{ cursor: "pointer", fontSize: 11, color: tokens.color.softInk, listStyle: "none", display: "flex", gap: 4, alignItems: "center", padding: 0 }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk, marginTop: 6 }}>{rest}</div>
          </SmoothDetails>
        ) : null}
      </div>
      <div style={{ height: 1, background: tokens.color.line, opacity: 0.6 }} />
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 10px", margin: 0, fontSize: 12, lineHeight: 1.55 }}>
        <dt style={{ color: tokens.color.softInk }}>AI 建議分類</dt>
        <dd style={{ margin: 0 }}>
          <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill>
        </dd>
        <dt style={{ color: tokens.color.softInk }}>分類原因</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk }}>{excerpt(analysis.whyRelevant, 130)}</dd>
        <dt style={{ color: tokens.color.softInk }}>相關脈絡</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk }}>{contextLabels(analysis.relevantTo)}</dd>
        <dt style={{ color: tokens.color.softInk }}>後續判斷</dt>
        <dd style={{ margin: 0 }}>
          <ScorePill color={verdictMeta.color} soft={verdictMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill>
        </dd>
      </dl>
    </aside>
  );
}

function ClassificationBoard({
  analyses,
  signalPreviewById
}: {
  analyses: ProductSignalAnalysis[];
  signalPreviewById: Record<string, string>;
}) {
  const categoryRows = SIGNAL_TYPE_ORDER.map((type) => ({
    type,
    meta: SIGNAL_TYPE_META[type],
    items: analyses.filter((analysis) => analysis.signalType === type)
  })).filter((row) => row.items.length > 0);
  const initialType = categoryRows[0]?.type ?? "demand";
  const [selectedType, setSelectedType] = useState<ProductSignalType>(initialType);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(categoryRows[0]?.items[0]?.signalId ?? null);
  const selectedItems = analyses.filter((analysis) => analysis.signalType === selectedType);
  const selectedAnalysis = selectedItems.find((analysis) => analysis.signalId === selectedSignalId)
    ?? selectedItems[0]
    ?? categoryRows[0]?.items[0]
    ?? analyses[0];
  const maxCount = Math.max(1, ...categoryRows.map((row) => row.items.length));

  if (!analyses.length) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section style={cardStyle({ gap: 10 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Kicker>分類構成</Kicker>
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>AI 已分類 {analyses.length} 則 collected posts</span>
        </div>
        <div style={{ display: "grid", gap: 7 }}>
          {categoryRows.map((row) => (
            <button
              key={row.type}
              type="button"
              onClick={() => {
                setSelectedType(row.type);
                setSelectedSignalId(row.items[0]?.signalId ?? null);
              }}
              aria-pressed={selectedType === row.type}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(82px, auto) 38px minmax(80px, 1fr)",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${selectedType === row.type ? row.meta.color : tokens.color.line}`,
                borderRadius: tokens.radius.card,
                padding: "7px 9px",
                background: selectedType === row.type ? row.meta.soft : tokens.color.elevated,
                color: tokens.color.ink,
                cursor: "pointer",
                font: "inherit",
                textAlign: "left"
              }}
            >
              <ScorePill color={row.meta.color} soft={row.meta.soft}>{row.meta.label}</ScorePill>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: tokens.color.subInk }}>{row.items.length} 則</span>
              <span style={{ height: 5, borderRadius: 999, background: tokens.color.neutralSurface, overflow: "hidden" }}>
                <span style={{ display: "block", width: `${Math.max(8, (row.items.length / maxCount) * 100)}%`, height: "100%", borderRadius: 999, background: row.meta.color }} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.1fr) minmax(240px, 1fr)", gap: 14, alignItems: "start" }}>
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Kicker>{SIGNAL_TYPE_LABELS[selectedType]} · {selectedItems.length} 則</Kicker>
            <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>最新在前</span>
          </div>
          {selectedItems.map((analysis) => (
            <ClassificationSignalRow
              key={analysis.signalId}
              analysis={analysis}
              selected={selectedAnalysis?.signalId === analysis.signalId}
              onSelect={() => setSelectedSignalId(analysis.signalId)}
            />
          ))}
        </section>

        {selectedAnalysis ? (
          <SelectedPostAside
            analysis={selectedAnalysis}
            preview={signalPreviewById[selectedAnalysis.signalId]}
          />
        ) : null}
      </div>
    </div>
  );
}

function ActionStatCard({ label, count, color, soft }: { label: string; count: number; color: string; soft: string }) {
  const isZero = count === 0;
  return (
    <div style={cardStyle({ padding: "10px 9px", textAlign: "center", gap: 3, opacity: isZero ? 0.45 : 1 })}>
      <div style={{ fontSize: 11, fontWeight: isZero ? 600 : 800, color }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: isZero ? 600 : 850, lineHeight: 1, color }}>{count}</div>
      <div style={{ height: 3, borderRadius: 999, background: soft }} />
    </div>
  );
}

function AgentTaskPanel({
  analysis,
  defaultOpen = false,
  onFeedbackSaved
}: {
  analysis: ProductSignalAnalysis;
  defaultOpen?: boolean;
  onFeedbackSaved?: (feedback: ProductAgentTaskFeedback) => void;
}) {
  if (!analysis.agentTaskSpec) {
    return null;
  }
  return <AgentTaskPanelBody analysis={analysis} defaultOpen={defaultOpen} onFeedbackSaved={onFeedbackSaved} />;
}

function AgentTaskPanelBody({
  analysis,
  defaultOpen = false,
  onFeedbackSaved
}: {
  analysis: ProductSignalAnalysis;
  defaultOpen?: boolean;
  onFeedbackSaved?: (feedback: ProductAgentTaskFeedback) => void;
}) {
  const spec = analysis.agentTaskSpec!;
  const summary = spec.taskTitle || excerpt(spec.taskPrompt.split("\n")[0], 80);
  const requiredContext = Array.isArray(spec.requiredContext) ? spec.requiredContext : [];
  const taskPromptHash = buildProductAgentTaskPromptHash(spec.taskPrompt);
  const [selectedFeedback, setSelectedFeedback] = useState<ProductAgentTaskFeedbackValue | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copyHovered, setCopyHovered] = useState(false);
  const [copyActive, setCopyActive] = useState(false);
  const [feedbackHovered, setFeedbackHovered] = useState<string | null>(null);
  const [feedbackActive, setFeedbackActive] = useState<string | null>(null);
  const requiresNote = selectedFeedback === "needs_rewrite" || selectedFeedback === "irrelevant";
  const notePlaceholder = selectedFeedback === "irrelevant"
    ? "為什麼不相關？例如：超出目前 non-goals"
    : "哪裡需要調整？例如：加更多 context、改成 TypeScript";

  const submitFeedback = (feedback: ProductAgentTaskFeedbackValue, note = "") => {
    setSelectedFeedback(feedback);
    if (feedback !== "needs_rewrite" && feedback !== "irrelevant") {
      setNoteDraft("");
    }
    setSaveStatus("saving");
    const feedbackPayload: ProductAgentTaskFeedback = {
      signalId: analysis.signalId,
      taskPromptHash,
      feedback,
      ...(note.trim() ? { note: note.trim() } : {}),
      createdAt: new Date().toISOString()
    };
    void sendExtensionMessage({
      type: "product/save-agent-task-feedback",
      feedback: feedbackPayload
    }).then((response) => {
      if (response.ok) {
        onFeedbackSaved?.(feedbackPayload);
        setSaveStatus("saved");
        return;
      }
      setSaveStatus("error");
    }).catch(() => {
      setSaveStatus("error");
    });
  };
  const copyPrompt = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(spec.taskPrompt);
  };
  return (
    <SmoothDetails
      summary="Agent 任務（可複製）"
      defaultOpen={defaultOpen}
      summaryStyle={detailSummaryStyle()}
    >
      <div style={{ display: "grid", gap: 10, marginTop: 2, paddingBottom: 14 }}>
        <div
          data-agent-task-card="true"
          style={{
            border: `1px solid ${tokens.color.lineStrong}`,
            borderRadius: tokens.radius.card,
            background: tokens.color.contextSurface,
            padding: "16px 18px",
            display: "grid",
            gap: 12
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12.5, color: tokens.color.softInk }}>可直接貼到 Claude / Cursor / Codex</span>
              <div style={{ fontSize: 15, lineHeight: 1.45, color: tokens.color.ink, fontWeight: 820 }}>
                {summary}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <PanelBadge tone="agent" dataAttrName="data-agent-task-badge" dataAttrValue="true">{spec.targetAgent.toUpperCase()}</PanelBadge>
              <button
                type="button"
                className="dlens-copy-btn"
                data-dlens-motion-button="copy"
                onClick={copyPrompt}
                aria-label="複製 Agent 任務提示詞"
                onMouseEnter={() => setCopyHovered(true)}
                onMouseLeave={() => { setCopyHovered(false); setCopyActive(false); }}
                onMouseDown={() => setCopyActive(true)}
                onMouseUp={() => setCopyActive(false)}
                style={compactActionButtonStyle({
                  padding: "7px 9px",
                  transform: copyActive
                    ? "scale(0.92)"
                    : copyHovered
                      ? "translateY(-1px) rotate(-2deg)"
                      : undefined,
                  transition: "transform 120ms ease, background 140ms ease, border-color 140ms ease",
                  borderColor: copyHovered ? "rgba(27, 26, 23, 0.5)" : undefined,
                })}
              >
                ⧉
              </button>
            </div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: tokens.color.ink }}>
            <strong>任務：</strong>{spec.taskTitle || excerpt(spec.taskPrompt.split("\n")[0], 120)}
          </div>
          {requiredContext.length ? (
            <div style={{ fontSize: 12.5, color: tokens.color.softInk }}>需要準備：{requiredContext.join("、")}</div>
          ) : null}
          <pre
            style={{
              fontSize: 12,
              lineHeight: 1.75,
              color: tokens.color.ink,
              background: tokens.color.contextSurface,
              border: `1px solid ${tokens.color.line}`,
              borderRadius: tokens.radius.card,
              padding: "12px 14px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
              fontFamily: tokens.font.mono,
              maxWidth: 560
            }}
          >
            {spec.taskPrompt}
          </pre>
          <div
            data-agent-task-feedback-row="true"
            style={{
              display: "grid",
              gap: 8,
              paddingTop: 2
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: 11.5, color: tokens.color.softInk }}>
              <span>這個任務建議：</span>
              {AGENT_TASK_FEEDBACK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="dlens-feedback-btn"
                  data-dlens-motion-button="feedback"
                  aria-pressed={selectedFeedback === option.value}
                  onMouseEnter={() => setFeedbackHovered(option.value)}
                  onMouseLeave={() => { setFeedbackHovered(null); setFeedbackActive(null); }}
                  onMouseDown={() => setFeedbackActive(option.value)}
                  onMouseUp={() => setFeedbackActive(null)}
                  onClick={() => {
                    if (option.value === "needs_rewrite" || option.value === "irrelevant") {
                      setSelectedFeedback(option.value);
                      setSaveStatus("idle");
                      return;
                    }
                    submitFeedback(option.value);
                  }}
                  style={{
                    ...compactActionButtonStyle({
                      padding: "6px 9px",
                      borderColor: selectedFeedback === option.value ? option.color : `${option.color}66`,
                      color: option.color,
                      background: selectedFeedback === option.value ? option.soft : tokens.color.elevated,
                      transform: feedbackActive === option.value
                        ? "scale(0.96)"
                        : feedbackHovered === option.value
                          ? "translateY(-1px)"
                          : undefined,
                      transition: "transform 120ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease",
                    }),
                    minHeight: 30
                  }}
                >
                  {option.label}
                </button>
              ))}
              {saveStatus === "saved" ? <span style={{ color: tokens.color.success }}>已記錄</span> : null}
              {saveStatus === "error" ? <span style={{ color: tokens.color.failed }}>未能儲存</span> : null}
            </div>
            {requiresNote ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                <input
                  aria-label="補充 Agent 任務回饋"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={notePlaceholder}
                  style={{
                    minWidth: 0,
                    border: `1px solid ${tokens.color.line}`,
                    borderRadius: tokens.radius.card,
                    background: tokens.color.contextSurface,
                    color: tokens.color.ink,
                    padding: "7px 9px",
                    fontSize: 12,
                    fontFamily: tokens.font.sans
                  }}
                />
                <button
                  type="button"
                  onClick={() => selectedFeedback ? submitFeedback(selectedFeedback, noteDraft) : undefined}
                  disabled={saveStatus === "saving"}
                  style={compactActionButtonStyle({
                    padding: "7px 10px",
                    background: saveStatus === "saving" ? tokens.color.disabledSecondary : tokens.color.ink,
                    color: tokens.color.elevated,
                    borderColor: saveStatus === "saving" ? tokens.color.disabledSecondary : tokens.color.ink,
                    cursor: saveStatus === "saving" ? "not-allowed" : "pointer"
                  })}
                >
                  {saveStatus === "saving" ? "儲存中" : "送出"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SmoothDetails>
  );
}

function SimilarHistoryBlock({ items }: { items: SimilarHistoricalSignal[] }) {
  if (!items.length) {
    return null;
  }
  const adoptedCount = items.filter((item) => item.feedback === "adopted").length;
  return (
    <SmoothDetails
      dataAttributes={{ "data-similar-history": "true" }}
      summary={`相似歷史 · ${items.length} 則（${adoptedCount} 次採用）`}
      summaryStyle={{ ...detailSummaryStyle(), color: tokens.color.softInk }}
      style={{
        borderTop: `1px solid ${tokens.color.line}`,
        paddingTop: 10,
        marginTop: -4
      }}
    >
      <div style={{ display: "grid", gap: 8, marginTop: 8, paddingLeft: 2 }}>
        {items.slice(0, 3).map((item) => (
          <div key={item.signalId} style={{ display: "grid", gridTemplateColumns: "14px minmax(0, 1fr)", gap: 7, alignItems: "start" }}>
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: item.feedback === "adopted" ? tokens.color.success : tokens.color.queued,
                marginTop: 6
              }}
            />
            <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.contentSummary}
              </div>
              <div style={{ fontSize: 10.5, lineHeight: 1.4, color: tokens.color.softInk }}>
                {FEEDBACK_LABELS[item.feedback]} · {formatSubtype(item.signalSubtype)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SmoothDetails>
  );
}

function ActionableItemCard({
  analysis,
  index,
  evidenceBySignalId,
  historicalAnalyses,
  agentTaskFeedback,
  onAgentTaskFeedbackSaved
}: {
  analysis: ProductSignalAnalysis;
  index: number;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  onAgentTaskFeedbackSaved?: (feedback: ProductAgentTaskFeedback) => void;
}) {
  const [cardHovered, setCardHovered] = useState(false);
  const subtypeMeta = SIGNAL_TYPE_META[analysis.signalType];
  const verdictMeta = VERDICT_META[analysis.verdict];
  const citations = citationsForAnalysis(analysis, evidenceBySignalId);
  const citationCount = citations.length;
  const title = primaryWorkflowTitle(citations, analysis.contentSummary);
  const primaryEvidenceReason = excerpt(citations[0]?.note?.whyItMatters ?? "", 130);
  const similarHistory = findSimilarHistoricalSignals(analysis, agentTaskFeedback, historicalAnalyses);
  return (
    <article
      className="dlens-card-lift"
      data-dlens-motion-card="true"
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
      style={cardStyle({
        gap: 28,
        padding: "26px 22px 20px",
        borderColor: cardHovered ? "rgba(27, 26, 23, 0.18)" : tokens.color.line,
        boxShadow: cardHovered
          ? "0 14px 32px rgba(27, 26, 23, 0.10), 0 2px 6px rgba(27, 26, 23, 0.04)"
          : "none",
        overflow: "visible",
        transform: cardHovered ? "translateY(-2px)" : undefined,
      })}
    >
      <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr) auto", gap: 16, alignItems: "start" }}>
        <span
          data-dlens-number-badge="true"
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            display: "inline-grid",
            placeItems: "center",
            fontSize: 28,
            fontWeight: 500,
            color: tokens.color.subInk,
            background: "transparent",
            border: `1px solid ${tokens.color.lineStrong}`,
            fontFamily: tokens.font.serifCjk,
            fontVariantNumeric: "tabular-nums",
            marginTop: 2
          }}
        >
          {index + 1}
        </span>
        <div style={{ minWidth: 0, display: "grid", gap: 12 }}>
          <h3 data-actionable-title="workflow" style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.28, color: tokens.color.ink, letterSpacing: -0.2, wordBreak: "break-word", fontFamily: tokens.font.serifCjk }}>{title}</h3>
          {primaryEvidenceReason ? (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: tokens.color.softInk }}>引用理由：{primaryEvidenceReason}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 14, lineHeight: 1.6, color: tokens.color.softInk }}>
            <ScorePill color={subtypeMeta.color} soft={subtypeMeta.soft}>{subtypeMeta.label}</ScorePill>
            <span>·</span>
            <span>{formatSubtype(analysis.signalSubtype)}</span>
            <span>·</span>
            <span>{citationCount} 則原文證據</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <ScorePill color={verdictMeta.color} soft={verdictMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill>
        </div>
      </div>
      <EvidenceUseCaseList citations={citations} />
      <AiExperimentDetails analysis={analysis} />
      <AgentTaskPanel analysis={analysis} onFeedbackSaved={onAgentTaskFeedbackSaved} />
      <SimilarHistoryBlock items={similarHistory} />
      <AiJudgmentDetails analysis={analysis} />
    </article>
  );
}

function SideVerdictPanel({
  title,
  items,
  emptyCopy
}: {
  title: string;
  items: ProductSignalAnalysis[];
  emptyCopy: string;
}) {
  const sample = items[0];
  return (
    <div style={cardStyle({ padding: "11px 12px" })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 850, color: tokens.color.ink }}>{title}</div>
        <Stamp tone={items.length ? "neutral" : "warning"}>{items.length}</Stamp>
      </div>
      {sample ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={mutedPanelStyle({ background: tokens.color.elevated, fontSize: 11.5, lineHeight: 1.5, color: tokens.color.subInk })}>{excerpt(sample.contentSummary, 120)}</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: tokens.color.softInk }}>{excerpt(sample.reason, 120)}</div>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: tokens.color.softInk }}>{emptyCopy}</div>
      )}
    </div>
  );
}

function ActionableInsightsBoard({
  analyses,
  productProfile,
  evidenceBySignalId,
  historicalAnalyses,
  agentTaskFeedback,
  onAgentTaskFeedbackSaved
}: {
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  onAgentTaskFeedbackSaved?: (feedback: ProductAgentTaskFeedback) => void;
}) {
  const tryItems = analyses.filter((analysis) => analysis.verdict === "try").sort((a, b) => b.relevance - a.relevance);
  const parkItems = analyses.filter((analysis) => analysis.verdict === "park" || analysis.signalType === "noise");
  const insufficientItems = analyses.filter((analysis) => analysis.verdict === "insufficient_data");
  const watchItems = analyses.filter((analysis) => analysis.verdict === "watch");
  const stats = [
    { key: "try", ...VERDICT_META.try, count: tryItems.length },
    { key: "park", ...VERDICT_META.park, count: parkItems.length },
    { key: "insufficient", ...VERDICT_META.insufficient_data, count: insufficientItems.length },
    { key: "watch", ...VERDICT_META.watch, count: watchItems.length }
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Stamp tone="accent">{productProfile?.name || "ProductProfile"}</Stamp>
        <Stamp tone="neutral">{productProfile?.audience || "目標受眾未填"}</Stamp>
        <Stamp tone={isProductContextSourceReady(productProfile) ? "success" : "warning"}>ProductContext</Stamp>
      </div>
      <section style={cardStyle({ gap: 12 })}>
        <div style={{ fontSize: 14, fontWeight: 850, color: tokens.color.ink }}>{analyses.length} 則訊號已評估</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {stats.map((stat) => (
            <ActionStatCard key={stat.key} label={stat.label} count={stat.count} color={stat.color} soft={stat.soft} />
          ))}
        </div>
      </section>
      {parkItems.length || insufficientItems.length || watchItems.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.4fr) minmax(220px, 1fr)", gap: 14, alignItems: "start" }}>
          <section style={{ display: "grid", gap: 10 }}>
            <Kicker>可直接試的做法</Kicker>
            {tryItems.length ? tryItems.map((analysis, index) => (
              <ActionableItemCard
                key={analysis.signalId}
                analysis={analysis}
                index={index}
                evidenceBySignalId={evidenceBySignalId}
                historicalAnalyses={historicalAnalyses}
                agentTaskFeedback={agentTaskFeedback}
                onAgentTaskFeedbackSaved={onAgentTaskFeedbackSaved}
              />
            )) : (
              <div style={mutedPanelStyle({ fontSize: 12.5, color: tokens.color.subInk })}>目前沒有 verdict=try 的訊號。先看保留觀察或資料不足。</div>
            )}
          </section>
          <aside style={{ display: "grid", gap: 9 }}>
            {parkItems.length ? <SideVerdictPanel title="噪音樣本" items={parkItems} emptyCopy="目前沒有被判定為前提不符的訊號。" /> : null}
            {insufficientItems.length ? <SideVerdictPanel title="資料不足" items={insufficientItems} emptyCopy="目前沒有資料不足的訊號。" /> : null}
            {watchItems.length ? <SideVerdictPanel title="保留觀察" items={watchItems} emptyCopy="目前沒有需要保留觀察的訊號。" /> : null}
          </aside>
        </div>
      ) : (
        <section style={{ display: "grid", gap: 10 }}>
          <Kicker>可直接試的做法</Kicker>
          {tryItems.length ? tryItems.map((analysis, index) => (
            <ActionableItemCard
              key={analysis.signalId}
              analysis={analysis}
              index={index}
              evidenceBySignalId={evidenceBySignalId}
              historicalAnalyses={historicalAnalyses}
              agentTaskFeedback={agentTaskFeedback}
              onAgentTaskFeedbackSaved={onAgentTaskFeedbackSaved}
            />
          )) : (
            <div style={mutedPanelStyle({ fontSize: 12.5, color: tokens.color.subInk })}>目前沒有 verdict=try 的訊號。先看保留觀察或資料不足。</div>
          )}
        </section>
      )}
    </div>
  );
}

export function ProductSignalView({
  kind,
  signals,
  analyses,
  productProfile,
  historicalAnalyses = analyses,
  agentTaskFeedback = [],
  signalPreviewById = {},
  evidenceBySignalId = {},
  signalReadinessById = {},
  aiProviderReady = true,
  analysisError = null,
  analysisNotice = null,
  isAnalyzing = false,
  onAgentTaskFeedbackSaved,
  onAnalyze
}: {
  kind: ProductSignalPageKind;
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  historicalAnalyses?: ProductSignalAnalysis[];
  agentTaskFeedback?: ProductAgentTaskFeedback[];
  signalPreviewById?: Record<string, string>;
  evidenceBySignalId?: Record<string, ProductSignalEvidenceEntry[]>;
  signalReadinessById?: Record<string, ProductSignalReadiness>;
  aiProviderReady?: boolean;
  analysisError?: string | null;
  analysisNotice?: string | null;
  isAnalyzing?: boolean;
  onAgentTaskFeedbackSaved?: (feedback: ProductAgentTaskFeedback) => void;
  onAnalyze: () => void;
}) {
  const copy = PAGE_COPY[kind];
  const safeSignals = Array.isArray(signals) ? signals : [];
  const safeAnalyses = Array.isArray(analyses) ? analyses : [];
  const safeHistoricalAnalyses = Array.isArray(historicalAnalyses) ? historicalAnalyses : safeAnalyses;
  const safeAgentTaskFeedback = Array.isArray(agentTaskFeedback) ? agentTaskFeedback : [];
  const bySignal = analysisBySignalId(safeAnalyses);
  const scopedAnalyses = visibleAnalyses(kind, safeSignals.map((signal) => bySignal.get(signal.id)).filter((entry): entry is ProductSignalAnalysis => Boolean(entry)));
  const pendingSignals = safeSignals.filter((signal) => bySignal.get(signal.id)?.status !== "complete");
  const canAnalyze = canRunProductSignalAction({ signals: safeSignals, productProfile, aiProviderReady, signalReadinessById });

  return (
    <div style={viewRootStyle()} data-product-signal-view={kind}>
      <ModeHeader
        mode={kind}
        kicker="Product mode"
        title={copy.title}
        deck={copy.deck}
        stamp={<Stamp tone={scopedAnalyses.length ? "success" : "neutral"}>{scopedAnalyses.length ? "AI enabled" : "No result"}</Stamp>}
      />
      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md, overflow: "visible" }}>
        <ReadinessPanel
          signals={safeSignals}
          analyses={safeAnalyses}
          productProfile={productProfile}
          aiProviderReady={aiProviderReady}
          analysisError={analysisError}
          analysisNotice={analysisNotice}
          isAnalyzing={isAnalyzing}
          signalReadinessById={signalReadinessById}
          onAnalyze={onAnalyze}
        />
        {pendingSignals.length ? (
          <section style={{ display: "grid", gap: 8 }}>
            <Kicker>等待處理的 signals</Kicker>
            {pendingSignals.map((signal) => (
              <PendingSignalCard
                key={signal.id}
                signal={signal}
                preview={signalPreviewById[signal.id]}
                readiness={readSignalReadiness(signal, signalReadinessById)}
                analysis={bySignal.get(signal.id)}
              />
            ))}
          </section>
        ) : null}
        {scopedAnalyses.length ? (
          kind === "classification" ? (
            <ClassificationBoard analyses={scopedAnalyses} signalPreviewById={signalPreviewById} />
          ) : (
            <ActionableInsightsBoard
              analyses={scopedAnalyses}
              productProfile={productProfile}
              evidenceBySignalId={evidenceBySignalId}
              historicalAnalyses={safeHistoricalAnalyses}
              agentTaskFeedback={safeAgentTaskFeedback}
              onAgentTaskFeedbackSaved={onAgentTaskFeedbackSaved}
            />
          )
        ) : (
          <div style={cardStyle()}>
            <div style={{ fontSize: 14, fontWeight: 800, color: tokens.color.ink }}>
              尚未有 AI 分析結果
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
              這裡只顯示 storage 裡的真實分析；如果 AI 尚未跑完，不會顯示假分類、假數字或示範案例。
            </div>
            <div>
              <SecondaryButton onClick={onAnalyze} disabled={!canAnalyze || isAnalyzing}>
                重新整理分析
              </SecondaryButton>
            </div>
          </div>
        )}
      </WorkspaceSurface>
    </div>
  );
}
