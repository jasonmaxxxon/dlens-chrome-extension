import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type {
  ProductAgentTaskFeedback,
  ProductAgentTaskFeedbackValue,
  ProductProfile,
  ProductSignalAnalysis,
  ProductSignalCardLayout,
  ProductSignalEvidenceNote,
  ProductSignalReferenceTarget,
  ProductSignalReferenceType,
  ProductSignalType,
  ProductSignalVerdict,
  Signal
} from "../state/types";
import { isProductContextSourceReady } from "../compare/product-context";
import { findSimilarHistoricalSignals, type SimilarHistoricalSignal } from "../compare/product-signal-history";
import type { ProductSignalEvidenceEntry } from "../compare/product-signal-analysis";
import { composeReadingBrief } from "../compare/signal-reading-brief";
import {
  latestReadingBySignalId,
  signalReadingStaleness,
  type SignalReading,
  type SignalReadingReviewState,
  type SignalReadingStaleness
} from "../compare/signal-reading-storage";
import { SIGNAL_READING_PROMPT_VERSION } from "../compare/signal-reading";
import type { ProductSignalReadiness } from "./product-signal-readiness";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SCAN_ROW_HOVER_CSS,
  SecondaryButton,
  Stamp,
  WorkspaceSurface,
  lineClamp,
  scanRowStyle,
  surfaceCardStyle,
  viewRootStyle
} from "./components";
import { tokens, textStyles } from "./tokens";

export type ProductSignalPageKind = "saved-signals" | "classification" | "actionable-filter";

/* Shared motion layer — injected globally by the threads content script.
 * Applies across every workspace mode; classes are opt-in so unstyled
 * elements are unaffected. `prefers-reduced-motion` neutralises all of it. */
export const DLENS_MOTION_CSS = `
[data-dlens-control="true"] .dlens-card-lift {
  transition: ${tokens.motion.preset.cardLift};
  will-change: transform;
  transform: translateY(0);
}
[data-dlens-control="true"] .dlens-card-lift:hover,
[data-dlens-control="true"] .dlens-card-lift:focus-within {
  transform: translateY(-4px);
  box-shadow: 0 18px 40px rgba(27, 26, 23, 0.16), 0 3px 10px rgba(27, 26, 23, 0.07) !important;
  border-color: rgba(27, 26, 23, 0.28) !important;
}
[data-dlens-control="true"] .dlens-card-lift:active {
  transform: translateY(-2px) scale(0.994);
  transition: transform 90ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-quote-row {
  transition: background 200ms ${tokens.motion.easing.standard};
  border-radius: 6px;
}
[data-dlens-control="true"] .dlens-quote-row:hover {
  background: rgba(27, 26, 23, 0.025);
}
[data-dlens-control="true"] .dlens-expand-trigger {
  transition: background 120ms ${tokens.motion.easing.standard}, border-color 120ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-details-summary:hover .dlens-expand-trigger {
  background: rgba(27, 26, 23, 0.06);
  border-color: rgba(27, 26, 23, 0.18);
}
[data-dlens-control="true"] .dlens-details-summary:hover [data-evidence-source-toggle="true"] {
  background: ${tokens.color.productSoft} !important;
  border-color: ${tokens.color.product} !important;
}
[data-dlens-control="true"] .dlens-details-smooth {
  display: grid;
}
[data-dlens-control="true"] .dlens-details-summary {
  transition: color 140ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-details-summary:hover {
  color: rgba(27, 26, 23, 0.85);
}
[data-dlens-control="true"] .dlens-details-chevron {
  display: inline-block;
  transition: transform 220ms ${tokens.motion.easing.spring};
}
[data-dlens-control="true"] [data-dlens-details-open="true"] > .dlens-details-summary .dlens-details-chevron {
  transform: rotate(180deg);
}
[data-dlens-control="true"] .dlens-details-panel {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  overflow: hidden;
  transition: grid-template-rows 240ms ${tokens.motion.easing.entrance}, opacity 160ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-dlens-details-open="true"] > .dlens-details-panel {
  grid-template-rows: 1fr;
  opacity: 1;
}
[data-dlens-control="true"] .dlens-details-panel-inner {
  min-height: 0;
  overflow: hidden;
}
[data-dlens-control="true"] [data-rail-icon] {
  transition: transform 220ms ${tokens.motion.easing.springSoft};
  will-change: transform;
}
[data-dlens-control="true"] [data-mode-style="rail"]:hover [data-rail-icon] {
  transform: translateY(-2px);
}
[data-dlens-control="true"] [data-mode-style="rail"]:active [data-rail-icon] {
  transform: translateY(0) scale(0.86);
  transition: transform 90ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-verdict-filter-plate] {
  transition: transform 280ms ${tokens.motion.easing.spring}, background-color 220ms ${tokens.motion.easing.standard}, border-color 220ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] [data-verdict-tile-count],
[data-dlens-control="true"] [data-verdict-tile-bar] {
  transition: transform 200ms ${tokens.motion.easing.springSoft}, background-color 220ms ${tokens.motion.easing.standard} 40ms;
}
[data-dlens-control="true"] [data-verdict-tile]:hover [data-verdict-tile-count] {
  transform: scale(1.1);
}
[data-dlens-control="true"] [data-verdict-tile]:active [data-verdict-tile-count] {
  transform: scale(0.96);
  transition: transform 90ms ${tokens.motion.easing.standard};
}
@media (prefers-reduced-motion: reduce) {
  [data-dlens-control="true"] [data-verdict-filter-plate],
  [data-dlens-control="true"] [data-verdict-tile-count],
  [data-dlens-control="true"] [data-verdict-tile-bar] {
    transition: none !important;
  }
  [data-dlens-control="true"] [data-verdict-tile]:hover [data-verdict-tile-count],
  [data-dlens-control="true"] [data-verdict-tile]:active [data-verdict-tile-count] {
    transform: none !important;
  }
  [data-dlens-control="true"] .dlens-card-lift,
  [data-dlens-control="true"] .dlens-quote-row,
  [data-dlens-control="true"] .dlens-details-summary,
  [data-dlens-control="true"] .dlens-details-chevron,
  [data-dlens-control="true"] .dlens-details-panel,
  [data-dlens-control="true"] .dlens-expand-trigger,
  [data-dlens-control="true"] [data-rail-icon] {
    transition: none !important;
  }
  [data-dlens-control="true"] .dlens-card-lift:hover,
  [data-dlens-control="true"] .dlens-card-lift:focus-within,
  [data-dlens-control="true"] .dlens-card-lift:active,
  [data-dlens-control="true"] .dlens-details-summary:hover,
  [data-dlens-control="true"] [data-mode-style="rail"]:hover [data-rail-icon],
  [data-dlens-control="true"] [data-mode-style="rail"]:active [data-rail-icon] {
    transform: none !important;
  }
  [data-dlens-control="true"] [data-bump-number="true"],
  [data-dlens-control="true"] [data-signal-reading-filed-flash="true"],
  [data-dlens-control="true"] [data-signal-reading-compose-flash="true"] {
    animation: none !important;
  }
  [data-dlens-control="true"] [data-button-shimmer="true"] {
    animation: none !important;
    opacity: 0 !important;
  }
}
`;

const PAGE_COPY: Record<ProductSignalPageKind, { title: string; deck: string }> = {
  "saved-signals": {
    title: "Saved Signals",
    deck: "先確認已儲存的 Threads post 是否完成抓取，再到行動頁整理可試 workflow。"
  },
  classification: {
    title: "分類整理",
    deck: "先把每則 Threads signal 放回正確範疇，再決定是否值得產品團隊處理。"
  },
  "actionable-filter": {
    title: "Agent Brief",
    deck: "先審視模型判讀，再把已收錄 reading 組成可貼給 coding agent 的 brief。"
  },
};

const SIGNAL_TYPE_LABELS: Record<ProductSignalType, string> = {
  learning: "學習資源",
  competitor: "競品分析",
  demand: "需求",
  technical: "技術討論",
  marketing: "行銷素材",
  noise: "噪音"
};

const SIGNAL_TYPE_META: Record<ProductSignalType, { label: string; color: string; soft: string }> = {
  demand: { label: "需求", color: tokens.color.success, soft: tokens.color.successSoft },
  technical: { label: "技術討論", color: tokens.color.running, soft: tokens.color.runningSoft },
  competitor: { label: "競品分析", color: tokens.color.techniqueViolet, soft: "rgba(94,75,115,0.10)" },
  learning: { label: "學習資源", color: tokens.color.techniqueTeal, soft: tokens.color.cyanSoft },
  marketing: { label: "行銷素材", color: tokens.color.product, soft: tokens.color.productSoft },
  noise: { label: "噪音", color: tokens.color.neutralText, soft: tokens.color.neutralSurfaceSoft }
};

const SIGNAL_TYPE_ORDER: ProductSignalType[] = ["demand", "technical", "marketing", "competitor", "learning", "noise"];

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

type ActionVerdictFilter = "try" | "park" | "insufficient" | "watch";
type AgentBriefCopyStatus = "idle" | "copied" | "error";

function verdictFilterKeyForAnalysis(analysis: ProductSignalAnalysis): ActionVerdictFilter {
  if (analysis.verdict === "park" || analysis.signalType === "noise") return "park";
  if (analysis.verdict === "insufficient_data") return "insufficient";
  return analysis.verdict;
}

const CONTEXT_FIELD_LABELS: Record<ProductSignalReferenceTarget, string> = {
  productPromise: "產品承諾",
  targetAudience: "目標受眾",
  agentRoles: "Agent 角色",
  coreWorkflows: "核心流程",
  currentCapabilities: "現有能力",
  explicitConstraints: "限制",
  nonGoals: "不做什麼",
  preferredTechDirection: "技術方向",
  evaluationCriteria: "評估標準",
  unknowns: "未知項",
  technicalLearning: "技術學習",
  workflowPattern: "流程模式",
  marketLanguage: "市場語言",
  productAnalogy: "產品類比",
  generalLearning: "一般學習",
  noDirectFit: "暫無直接關聯"
};

const REFERENCE_TYPE_LABELS: Record<ProductSignalReferenceType, string> = {
  product_reference: "對產品可參考",
  technical_learning: "技術學習",
  workflow_pattern: "流程借用",
  market_language: "市場語言",
  general_learning: "新知保留",
  no_direct_fit: "暫無直接用途"
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

function contextLabels(fields: ProductSignalReferenceTarget[]): string {
  const safeFields = Array.isArray(fields) ? fields : [];
  return safeFields.map((field) => CONTEXT_FIELD_LABELS[field]).filter(Boolean).join("、") || "ProductContext";
}

function referenceTypeLabel(type: ProductSignalReferenceType | undefined): string {
  return type ? REFERENCE_TYPE_LABELS[type] : "對產品參考";
}

function referenceLabel(analysis: ProductSignalAnalysis | undefined): string {
  if (!analysis) return "尚未分析";
  const label = analysis.referenceLabel?.trim();
  if (label) return label;
  return analysis.signalType === "learning"
    ? `可學習：${analysis.contentSummary}`
    : `對產品參考：${analysis.contentSummary}`;
}

function referenceTakeaway(analysis: ProductSignalAnalysis | undefined): string {
  if (!analysis) return "先完成分析後再輸出 agent brief。";
  return analysis.referenceTakeaway?.trim() || analysis.whyRelevant || analysis.reason;
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
    boxShadow: tokens.shadow.card,
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
  grounding: ProductSignalEvidenceNote["grounding"];
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
  const explicitGrounding = citation.note?.grounding;

  if (explicitPattern || explicitWhy || explicitTemplate || explicitRecipe || explicitTradeoff || explicitStack.length) {
    return {
      pattern: explicitPattern || citationUseCase(citation, 70) || "可重用工作流",
      whyItWorks: explicitWhy || citation.note?.whyItMatters || "這條留言把場景、工具和輸出連在一起。",
      copyableTemplate: explicitTemplate || "輸入來源 -> Agent 處理 -> 可交付輸出",
      recipeMarkdown: explicitRecipe || explicitTemplate || "輸入來源 -> Agent 處理 -> 可交付輸出",
      tradeoff: explicitTradeoff || "",
      tools,
      grounding: explicitGrounding || (explicitRecipe ? "model_inferred" : "insufficient_detail")
    };
  }

  if ((lower.includes("slack") || lower.includes("jira")) && (lower.includes("release") || lower.includes("confluence") || lower.includes("metabase") || lower.includes("sql"))) {
    return {
      pattern: "多來源工作流轉文件",
      whyItWorks: "它把資料來源、Agent 處理和可交付文件分清楚，團隊可替換自己的工具。",
      copyableTemplate: "Slack/Jira/資料庫 -> Claude Skill -> Release note / ticket / Confluence",
      recipeMarkdown: "- Input: Slack/Jira/資料庫\n- Process: Claude Skill 摘要與整理\n- Output: Release note / ticket / Confluence",
      tradeoff: "需要工具授權與資料讀取權限。",
      tools,
      grounding: "model_inferred"
    };
  }

  if (lower.includes("gitlab") || lower.includes("ci/cd") || lower.includes("cicd") || lower.includes("review")) {
    return {
      pattern: "工程回饋自動化",
      whyItWorks: "它讓 agent 進入既有 issue、CI 和 review 節點，不要求使用者重整上下文。",
      copyableTemplate: "Jira/GitLab issue -> CI/CD agent -> review/test feedback",
      recipeMarkdown: "- Input: Jira/GitLab issue\n- Process: CI/CD agent 讀取結果\n- Output: review/test feedback",
      tradeoff: "需要接入工程權限與測試結果。",
      tools,
      grounding: "model_inferred"
    };
  }

  if (lower.includes("search") || raw.includes("搜尋") || raw.includes("爬蟲") || lower.includes("crawler")) {
    return {
      pattern: "搜尋與爬蟲做市場雷達",
      whyItWorks: "它先自動過濾雜訊，再保留產品團隊需要追蹤的趨勢敏感度。",
      copyableTemplate: "creator/keyword -> crawler/search agent -> trend digest",
      recipeMarkdown: "- Input: creator/keyword\n- Process: crawler/search agent 定期掃描\n- Output: trend digest",
      tradeoff: "需要控制抓取頻率與來源品質。",
      tools,
      grounding: "model_inferred"
    };
  }

  return {
    pattern: citationUseCase(citation, 70) || "可重用工作流",
    whyItWorks: citation.note?.whyItMatters || "這條留言把抽象需求落到具體操作方式。",
    copyableTemplate: "",
    recipeMarkdown: "",
    tradeoff: "原文不足以推導完整做法。",
    tools,
    grounding: "insufficient_detail"
  };
}

const GROUNDING_LABELS: Record<NonNullable<ProductSignalEvidenceNote["grounding"]>, string> = {
  text_grounded: "原文可還原",
  model_inferred: "AI 推斷，請交叉驗證原文",
  insufficient_detail: "原文不足"
};

const STACK_PILL_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  padding: "0 7px",
  borderRadius: 999,
  background: tokens.color.neutralSurfaceSoft,
  border: `1px solid ${tokens.color.line}`,
  color: tokens.color.subInk,
  fontSize: 10.5,
  fontWeight: 600
} as const;

type WorkflowSectionTone = "copy" | "why" | "tradeoff";

const WORKFLOW_SECTION_TONES: Record<WorkflowSectionTone, { accent: string; soft: string; border: string }> = {
  copy: {
    accent: tokens.color.success,
    soft: "rgba(63,90,59,0.095)",
    border: "rgba(63,90,59,0.28)"
  },
  why: {
    accent: tokens.color.accent,
    soft: "rgba(26,46,79,0.085)",
    border: "rgba(26,46,79,0.25)"
  },
  tradeoff: {
    accent: tokens.color.queued,
    soft: "rgba(161,106,23,0.105)",
    border: "rgba(161,106,23,0.30)"
  }
};

function workflowSectionPanelStyle(tone: WorkflowSectionTone): CSSProperties {
  const color = WORKFLOW_SECTION_TONES[tone];
  return {
    display: "grid",
    gap: 6,
    padding: "8px 10px 9px",
    borderRadius: 6,
    border: `1px solid ${color.border}`,
    borderLeft: `4px solid ${color.accent}`,
    background: `linear-gradient(90deg, ${color.soft}, ${tokens.color.elevated} 74%)`
  };
}

function workflowSectionLabelStyle(tone: WorkflowSectionTone): CSSProperties {
  const color = WORKFLOW_SECTION_TONES[tone];
  return {
    ...textStyles.fieldLabel,
    justifySelf: "start",
    display: "inline-flex",
    alignItems: "center",
    minHeight: 18,
    padding: "1px 6px",
    borderRadius: tokens.radius.round,
    border: `1px solid ${color.border}`,
    background: color.soft,
    color: color.accent,
    fontWeight: 700,
    letterSpacing: 0
  };
}

function StackTagRow({ tools, maxVisible = 4 }: { tools: string[]; maxVisible?: number }) {
  const visible = tools.slice(0, maxVisible);
  const overflow = tools.length - maxVisible;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "nowrap", alignItems: "center", overflow: "hidden" }} aria-label="工具鏈">
      <span style={{ ...textStyles.fieldLabel, lineHeight: "20px", flexShrink: 0 }}>Stack</span>
      {visible.map((tool) => (
        <span key={tool} style={{ ...STACK_PILL_STYLE, flexShrink: 0 }}>{tool}</span>
      ))}
      {overflow > 0 ? (
        <span
          title={tools.slice(maxVisible).join(", ")}
          style={{ ...STACK_PILL_STYLE, flexShrink: 0, color: tokens.color.softInk, fontWeight: 500, cursor: "default" }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function WorkflowEvidenceCard({
  citation,
  layout = "boxed"
}: {
  citation: EvidenceCitation;
  layout?: "boxed" | "flat";
}) {
  const workflow = inferWorkflowPattern(citation);
  const grounding = workflow.grounding || "model_inferred";
  const groundingLabel = GROUNDING_LABELS[grounding];
  const flatten = layout === "flat";
  const fieldLabelStyle: CSSProperties = flatten
    ? {
        ...textStyles.fieldLabel,
        color: tokens.color.softInk,
        letterSpacing: 0,
        textTransform: "none",
        fontWeight: 700
      }
    : workflowSectionLabelStyle("copy");
  const rowStyle = (isLast: boolean): CSSProperties => flatten
    ? {
        display: "grid",
        gap: 5,
        padding: "8px 0",
        borderBottom: isLast ? "none" : `1px dotted ${tokens.color.lineStrong}`
      }
    : {};
  return (
    <div
      data-evidence-workflow-card="true"
      data-workflow-card-layout={layout}
      style={{
        display: "grid",
        gap: flatten ? 7 : 9,
        padding: flatten ? "0" : "11px 12px",
        borderRadius: tokens.radius.card,
        border: flatten ? "none" : `1px solid ${tokens.color.line}`,
        background: flatten ? "transparent" : tokens.color.elevated
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ ...textStyles.cardTitle, color: tokens.color.ink }}>
            {workflow.pattern}
          </div>
        </div>
        <span
          data-workflow-grounding={grounding}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 20,
            padding: "0 7px",
            borderRadius: 999,
            border: `1px solid ${tokens.color.line}`,
            background: grounding === "text_grounded" ? tokens.color.successSoft : tokens.color.neutralSurfaceSoft,
            color: grounding === "text_grounded" ? tokens.color.success : tokens.color.softInk,
            fontSize: 10.5,
            fontWeight: 600
          }}
        >
          {groundingLabel}
        </span>
        {workflow.tools.length ? (
          <StackTagRow tools={workflow.tools} maxVisible={4} />
        ) : null}
      </div>
      <div style={{ display: "grid", gap: flatten ? 0 : 6 }}>
        <div data-workflow-section-tone="copy" data-workflow-row-layout={flatten ? "stacked" : "boxed"} style={flatten ? rowStyle(false) : workflowSectionPanelStyle("copy")}>
          <span data-workflow-field-label="copy" style={flatten ? fieldLabelStyle : workflowSectionLabelStyle("copy")}>如何照抄</span>
          <pre style={{ margin: 0, fontSize: flatten ? 12 : 12.5, lineHeight: 1.55, color: tokens.color.ink, fontFamily: tokens.font.mono, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {workflow.recipeMarkdown || workflow.copyableTemplate || "原文不足以推導完整做法。"}
          </pre>
        </div>
        <div data-workflow-section-tone="why" data-workflow-row-layout={flatten ? "stacked" : "boxed"} style={flatten ? rowStyle(!workflow.tradeoff) : workflowSectionPanelStyle("why")}>
          <span data-workflow-field-label="why" style={flatten ? fieldLabelStyle : workflowSectionLabelStyle("why")}>為什麼可以這樣做</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.subInk }}>
            {workflow.whyItWorks}
          </span>
        </div>
        {workflow.tradeoff ? (
          <div data-workflow-section-tone="tradeoff" data-workflow-row-layout={flatten ? "stacked" : "boxed"} style={flatten ? rowStyle(true) : workflowSectionPanelStyle("tradeoff")}>
            <span data-workflow-field-label="tradeoff" style={flatten ? fieldLabelStyle : workflowSectionLabelStyle("tradeoff")}>限制</span>
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
    <div data-testid="evidence-list" style={{ display: "grid", gap: 0, padding: "0 22px 4px" }}>
      <div
        data-evidence-section-label="true"
        style={{
          ...textStyles.label,
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
                  data-evidence-source-toggle="true"
                  className="dlens-expand-trigger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: tokens.color.productSoft,
                    border: `1px solid ${tokens.color.product}`,
                    fontSize: 11.5,
                    fontStyle: "italic",
                    color: tokens.color.product,
                    fontWeight: 700,
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

function RelevanceBars({ score, tone = "light" }: { score: ProductSignalAnalysis["relevance"]; tone?: "light" | "dark" }) {
  const active = tone === "light" ? "rgba(255,255,255,0.92)" : tokens.color.teal;
  const inactive = tone === "light" ? "rgba(255,255,255,0.24)" : tokens.color.lineStrong;
  const labelColor = tone === "light" ? "rgba(255,255,255,0.92)" : tokens.color.softInk;

  return (
    <div data-relevance-bars="true" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, lineHeight: 1.2, fontWeight: 800, color: labelColor }}>
        relevance {score}/5
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((bar) => (
          <span
            key={bar}
            aria-hidden="true"
            style={{
              height: 6,
              borderRadius: 999,
              background: bar <= score ? active : inactive
            }}
          />
        ))}
      </div>
    </div>
  );
}

function formatAnalyzedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

function PendingSignalCard({
  signal,
  preview,
  readiness,
  analysis,
  onRemove
}: {
  signal: Signal;
  preview?: string;
  readiness: ProductSignalReadiness;
  analysis?: ProductSignalAnalysis;
  onRemove?: () => void;
}) {
  const label = analysis?.status === "error"
    ? { label: "分析失敗", detail: analysis.error || analysis.reason || "這則訊號未能產生可信分析。", tone: "warning" as const }
    : readinessLabel(readiness);
  const isProcessing = analysis?.status === "pending" || analysis?.status === "analyzing" || (!analysis && readiness.status === "crawling");
  return (
    <div style={cardStyle({ padding: "10px 12px" })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Stamp tone={label.tone}>{label.label}</Stamp>
          {isProcessing ? (
            <span
              aria-hidden
              data-pending-signal-spinner="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: "1.5px solid currentColor",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "dlens-spin 0.8s linear infinite",
                opacity: 0.6,
                color: tokens.color.softInk
              }}
            />
          ) : null}
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>{analysis?.status === "error" ? "需重試" : "未分析"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>{signal.source}</span>
          {onRemove ? (
            <button
              type="button"
              aria-label="移除此訊號"
              onClick={onRemove}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", lineHeight: 1, color: tokens.color.softInk, fontSize: 14, borderRadius: 4, display: "flex", alignItems: "center" }}
            >×</button>
          ) : null}
        </div>
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

  /* Compact single-line status bar when everything is green */
  if (allGreen && !isAnalyzing && !analysisError) {
    return (
      <div
        style={mutedPanelStyle({
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          flexWrap: "wrap"
        })}
      >
        <Kicker>分析狀態</Kicker>
        <Stamp tone="success">✓ 已就緒</Stamp>
        <Stamp tone="neutral">{signals.length} signals · {completedCount} analyses</Stamp>
        <div style={{ flex: 1 }} />
        <SecondaryButton onClick={onAnalyze} disabled={!canAnalyze}>
          重新分析
        </SecondaryButton>
      </div>
    );
  }

  return (
    <div style={mutedPanelStyle({ gap: hasResults ? 8 : 10 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <Kicker>{hasResults ? "分析狀態" : "真實狀態"}</Kicker>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Stamp tone={signals.length ? "success" : "warning"}>{signals.length} signals</Stamp>
          <Stamp tone={completedCount ? "success" : "neutral"}>{completedCount} analyses</Stamp>
          <Stamp tone={aiProviderReady ? "success" : "warning"}>AI key</Stamp>
          <Stamp tone={isProductProfileReady(productProfile) ? "success" : "warning"}>ProductProfile</Stamp>
          <Stamp tone={isProductContextSourceReady(productProfile) ? "success" : "warning"}>ProductContext</Stamp>
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
  const verdictColor = analysis.signalType === "noise"
    ? tokens.color.lineStrong
    : analysis.verdict === "try"
      ? "var(--dlens-mode-accent)"
      : verdictMeta.color;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-scan-row="true"
      style={scanRowStyle({
        width: "100%",
        display: "grid",
        gridTemplateColumns: "10px minmax(0, 1fr)",
        alignItems: "center",
        gap: 9,
        padding: "10px 4px",
        textAlign: "left",
        cursor: "pointer",
        border: "none",
        background: selected ? typeMeta.soft : "transparent",
        color: tokens.color.ink,
        font: "inherit"
      })}
    >
      <span
        aria-hidden="true"
        data-classification-row-indicator="true"
        title={VERDICT_LABELS[analysis.verdict]}
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: verdictColor
        }}
      />
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 600, color: tokens.color.ink, ...lineClamp(1) }}>
          {excerpt(analysis.contentSummary, 120)}
        </div>
        <div style={{ fontSize: 11, color: tokens.color.softInk, ...lineClamp(1) }}>
          {formatSubtype(analysis.signalSubtype)} · {VERDICT_LABELS[analysis.verdict]}
        </div>
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
        <dt style={{ color: tokens.color.softInk }}>{referenceTypeLabel(analysis.referenceType)}</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk }}>{referenceLabel(analysis)}</dd>
        <dt style={{ color: tokens.color.softInk }}>可帶走</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk }}>{referenceTakeaway(analysis)}</dd>
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

type AgentBriefMode = "original" | "decision";
type SignalReadingReviewDecision = Exclude<SignalReadingReviewState, "pending">;
type ReviewSignalReading = (
  cacheKey: string,
  decision: SignalReadingReviewDecision,
  note?: string
) => Promise<{ ok: true; signalReading: SignalReading } | { ok: false; error: string }>;

const SIGNAL_READING_REVIEW_LABELS: Record<SignalReadingReviewState, string> = {
  pending: "待 review",
  filed: "已收錄",
  deferred: "待看",
  rejected: "已退回"
};

const SIGNAL_READING_REVIEW_TONES: Record<SignalReadingReviewState, "neutral" | "accent" | "success" | "warning"> = {
  pending: "neutral",
  filed: "accent",
  deferred: "warning",
  rejected: "neutral"
};

function signalReadingReviewState(reading: SignalReading | undefined): SignalReadingReviewState {
  return reading?.reviewState ?? "pending";
}

function signalReadingStalenessCopy(staleness: SignalReadingStaleness): string {
  const labels: Record<SignalReadingStaleness["reasons"][number], string> = {
    prompt_version: "prompt 版本較舊",
    missing_provenance: "缺 provenance"
  };
  return staleness.reasons.map((reason) => labels[reason]).join("、");
}

function renderEmphasizedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`em-${match.index}`} style={{ color: tokens.color.ink, fontWeight: 850 }}>
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length ? nodes : [text];
}

function SignalReadingProvenanceRow({
  sourceUrl,
  reading
}: {
  sourceUrl: string;
  reading?: SignalReading;
}) {
  const model = reading?.model || "";
  return (
    <div
      data-signal-reading-provenance="true"
      data-signal-reading-provenance-layout="inline"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 12px",
        minWidth: 0,
        padding: "2px 0",
        color: tokens.color.softInk,
        fontSize: 11.5,
        lineHeight: 1.45,
        fontWeight: 700
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <span style={{ color: tokens.color.softInk }}>Source</span>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={sourceUrl}
            style={{ color: tokens.color.product, textDecoration: "none", fontWeight: 850 }}
          >
            原文連結 ↗
          </a>
        ) : (
          <span style={{ color: tokens.color.subInk }}>local</span>
        )}
      </span>
      <span
        data-signal-reading-model-hover="true"
        title={model ? `模型：${model}` : "模型：unknown"}
        style={{ color: tokens.color.softInk, cursor: model ? "help" : "default" }}
      >
        模型
      </span>
    </div>
  );
}

/** A number that replays a spring "bump" each time it changes — not on first mount. */
function BumpNumber({ value }: { value: number }) {
  const mounted = useRef(false);
  const [bumpKey, setBumpKey] = useState(0);
  useEffect(() => {
    if (mounted.current) {
      setBumpKey((key) => key + 1);
    } else {
      mounted.current = true;
    }
  }, [value]);
  return (
    <span
      key={bumpKey}
      data-bump-number="true"
      style={{ display: "inline-block", animation: bumpKey ? tokens.motion.keyframes.bump : undefined }}
    >
      {value}
    </span>
  );
}

/** A shimmer sweep overlay for a button in a loading state. The host button
 * must be position:relative + overflow:hidden. */
function ButtonShimmer() {
  return (
    <span
      aria-hidden="true"
      data-button-shimmer="true"
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%)",
        backgroundSize: "220% 100%",
        animation: tokens.motion.keyframes.shimmer,
        pointerEvents: "none"
      }}
    />
  );
}

function SignalReadingEvidenceDetails({ citations }: { citations: EvidenceCitation[] }) {
  if (!citations.length) {
    return null;
  }

  return (
    <SmoothDetails
      dataAttributes={{ "data-signal-reading-evidence": "true" }}
      summary={
        <span style={{ color: tokens.color.softInk, fontSize: 11.5, fontWeight: 600 }}>
          原文留言 {citations.length} 則 ▾
        </span>
      }
      summaryStyle={{ padding: "2px 0", cursor: "pointer", letterSpacing: 0 }}
    >
      <div style={{ display: "grid", gap: 0, marginTop: 6, borderTop: `1px solid ${tokens.color.line}` }}>
        {citations.map((citation) => {
          const text = citation.entry?.text?.trim() || citation.note?.quoteSummary || "";
          return (
            <div
              key={citation.ref}
              data-signal-reading-evidence-row="true"
              style={{
                display: "grid",
                gap: 3,
                padding: "7px 0",
                borderBottom: `1px solid ${tokens.color.line}`
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: tokens.color.softInk }}>
                  {citation.ref}
                  {citation.entry?.author ? <span style={{ fontWeight: 400 }}> · {citation.entry.author}</span> : null}
                </span>
                {citation.entry?.likeCount ? (
                  <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>{citation.entry.likeCount} ♥</span>
                ) : null}
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk, overflowWrap: "anywhere" }}>
                {text || "—"}
              </p>
              {citation.note?.whyItMatters ? (
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: tokens.color.softInk }}>
                  {citation.note.whyItMatters}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </SmoothDetails>
  );
}

type BriefFormatOption = {
  value: AgentBriefMode;
  label: string;
  deck: string;
  color: string;
  soft: string;
};

const BRIEF_FORMAT_OPTIONS: BriefFormatOption[] = [
  { value: "original", label: "判讀優先", deck: "判讀為主、原文為附", color: tokens.color.product, soft: tokens.color.productSoft },
  { value: "decision", label: "精簡決策", deck: "只給結論與行動建議", color: tokens.color.success, soft: tokens.color.successSoft }
];

function BriefFormatButton({
  option,
  selected,
  onSelect
}: {
  option: BriefFormatOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-brief-format-option={option.value}
      data-brief-format-tone={option.value}
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        border: `1px solid ${selected ? option.color : tokens.color.line}`,
        borderRadius: tokens.radius.card,
        background: selected ? option.soft : tokens.color.elevated,
        color: tokens.color.ink,
        padding: "10px 12px",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        display: "grid",
        gap: 3,
        boxShadow: selected ? `inset 4px 0 0 ${option.color}` : "none"
      }}
    >
      <strong style={{ fontSize: 13, color: selected ? option.color : tokens.color.ink }}>{option.label}</strong>
      <span style={{ fontSize: 11, color: tokens.color.subInk }}>{option.deck}</span>
    </button>
  );
}

function SignalReadingMarginaliaPanel({
  analysis
}: {
  analysis: ProductSignalAnalysis;
}) {
  const verdictMeta = VERDICT_META[analysis.verdict];
  const typeMeta = SIGNAL_TYPE_META[analysis.signalType];

  return (
    <div
      data-signal-reading-marginalia="true"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 138px",
        gap: 0,
        overflow: "hidden",
        border: `1px solid ${verdictMeta.color}`,
        borderRadius: tokens.radius.card,
        background: `linear-gradient(90deg, ${verdictMeta.soft}, ${tokens.color.elevated} 68%)`
      }}
    >
      <div style={{ display: "grid", gap: 10, padding: "13px 14px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <ScorePill color={verdictMeta.color} soft={tokens.color.elevated}>{VERDICT_LABELS[analysis.verdict]}</ScorePill>
          <ScorePill color={typeMeta.color} soft={tokens.color.elevated}>{typeMeta.label}</ScorePill>
          <span style={{ ...textStyles.meta, color: tokens.color.subInk }}>{referenceTypeLabel(analysis.referenceType)}</span>
        </div>
        <div
          data-signal-reading-reference-copy="full"
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: tokens.color.ink,
            fontWeight: 850,
            overflowWrap: "anywhere"
          }}
        >
          {referenceLabel(analysis)}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk }}>
          {referenceTakeaway(analysis)}
        </div>
      </div>
      <aside
        data-signal-reading-relevance-summary="true"
        style={{
          display: "grid",
          alignContent: "start",
          gap: 9,
          padding: "13px 12px",
          borderLeft: `1px solid ${tokens.color.line}`,
          background: "rgba(255,255,255,0.20)"
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 10, color: tokens.color.softInk, fontWeight: 850 }}>判斷</span>
          <span style={{ fontSize: 18, lineHeight: 1.1, color: verdictMeta.color, fontWeight: 900, fontFamily: tokens.font.serifCjk }}>
            {VERDICT_LABELS[analysis.verdict]}
          </span>
        </div>
        <RelevanceBars score={analysis.relevance} tone="dark" />
      </aside>
    </div>
  );
}

function buildSignalReadingAgentBrief({
  readings,
  analysesBySignal,
  signalPreviewById: _signalPreviewById,
  signalUrlById: _signalUrlById
}: {
  readings: SignalReading[];
  analysesBySignal: Map<string, ProductSignalAnalysis>;
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
}): string {
  return composeReadingBrief(readings, analysesBySignal, SIGNAL_READING_PROMPT_VERSION);
}

function buildAgentBrief({
  mode,
  selectedSignals,
  analysesBySignal,
  signalPreviewById,
  signalUrlById,
  evidenceBySignalId = {}
}: {
  mode: AgentBriefMode;
  selectedSignals: Signal[];
  analysesBySignal: Map<string, ProductSignalAnalysis>;
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  evidenceBySignalId?: Record<string, ProductSignalEvidenceEntry[]>;
}): string {
  const header = mode === "original"
    ? "# Product Action Brief - 原文優先"
    : "# Product Action Brief - 精簡決策";
  const usage = [
    "## 使用方式",
    "- 先處理 `值得嘗試`；這些可以轉成實驗、prototype 或 agent task。",
    "- `保留觀察` 只作產品學習或後續研究，不應直接排入開發。"
  ].join("\n");
  const sections = selectedSignals.map((signal, index) => {
    const analysis = analysesBySignal.get(signal.id);
    const preview = excerpt(signalPreviewById[signal.id] || analysis?.contentSummary || "", mode === "original" ? 900 : 420);
    const url = signalUrlById[signal.id] || "";
    const title = analysis?.contentSummary || `Signal ${index + 1}`;
    const task = analysis?.agentTaskSpec?.taskPrompt?.trim();
    const reference = referenceLabel(analysis);
    const takeaway = referenceTakeaway(analysis);
    const referenceKind = analysis ? referenceTypeLabel(analysis.referenceType) : "尚未分析";
    const contextTargets = analysis ? contextLabels(analysis.relevantTo) : "尚未分析";
    const requiredContext = analysis?.agentTaskSpec?.requiredContext?.length
      ? analysis.agentTaskSpec.requiredContext.join("、")
      : "";
    if (mode === "decision") {
      return [
        `## ${index + 1}. ${title}`,
        `- 原文訊號: ${preview || "無可用原文摘要"}`,
        ...(url ? [`- 原文連結: ${url}`] : []),
        `- 產品判斷: ${analysis ? VERDICT_LABELS[analysis.verdict] : "尚未分析"}${analysis ? ` / ${SIGNAL_TYPE_LABELS[analysis.signalType]}` : ""}`,
        `- ${referenceKind}: ${reference}`,
        `- 可帶走: ${takeaway}`,
        `- 相關欄位: ${contextTargets}`,
        `- 為什麼值得看: ${analysis?.whyRelevant || "尚未有 ProductSignalAnalyzer 結果"}`,
        `- 建議下一步: ${analysis?.experimentHint || analysis?.reason || "先完成抓取與分析"}`,
        ...(requiredContext ? [`- 需要上下文: ${requiredContext}`] : []),
        ...(task ? ["", "```text", `[SIGNAL]\n${preview}\n\n${task}`, "```"] : [])
      ].join("\n");
    }
    const evidenceNotes = analysis?.evidenceNotes ?? [];
    const evidenceByRef = new Map((evidenceBySignalId[signal.id] ?? []).map((entry) => [entry.ref, entry]));
    const evidenceLines = evidenceNotes
      .map((note) => {
        const entry = evidenceByRef.get(note.ref);
        const verbatim = entry?.text?.trim();
        const head = verbatim
          ? `  - [${note.ref}] ${entry?.author || "unknown"}：${excerpt(verbatim, 220)}`
          : `  - [${note.ref}] ${note.quoteSummary}`;
        return note.whyItMatters ? `${head}\n    ↳ 為何重要：${note.whyItMatters}` : head;
      })
      .filter(Boolean)
      .join("\n");
    return [
      `## ${index + 1}. ${title}`,
      `- 原文訊號: ${preview || "無可用原文摘要"}`,
      ...(url ? [`- 原文連結: ${url}`] : []),
      ...(evidenceLines ? [`- 觀眾反應 (${evidenceNotes.length} 則):\n${evidenceLines}`] : []),
      ...(analysis?.audienceGap ? [`- 預期落差: ${analysis.audienceGap}`] : []),
      `- 產品判斷: ${analysis ? VERDICT_LABELS[analysis.verdict] : "尚未分析"}`,
      `- ${referenceKind}: ${reference}`,
      `- 可帶走: ${takeaway}`,
      `- 相關欄位: ${contextTargets}`,
      `- AI 判讀: ${analysis?.reason || analysis?.whyRelevant || "尚未分析"}`,
      ...(task ? ["", "可複製任務:", "```text", `[SIGNAL]\n${preview}\n\n${task}`, "```"] : [])
    ].join("\n");
  });
  return [header, usage, ...sections].join("\n\n");
}

function SavedSignalsBoard({
  signals,
  analyses,
  signalPreviewById,
  signalReadinessById,
  selectedIds,
  onToggleSignal,
  onRemoveSignal
}: {
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  signalPreviewById: Record<string, string>;
  signalReadinessById: Record<string, ProductSignalReadiness>;
  selectedIds: string[];
  onToggleSignal: (signalId: string) => void;
  onRemoveSignal?: (signalId: string) => void;
}) {
  const analysesBySignal = analysisBySignalId(analyses);
  if (!signals.length) {
    return null;
  }

  return (
    <section data-saved-signals-route="true" style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle({ gap: 10 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Kicker>Saved Signals</Kicker>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{signals.length} saved</span>
        </div>
        <div data-scan-list="saved-signals" style={{ display: "grid" }}>
          {signals.map((signal) => {
            const analysis = analysesBySignal.get(signal.id);
            const readiness = readinessLabel(readSignalReadiness(signal, signalReadinessById));
            const checked = selectedIds.includes(signal.id);
            const typeMeta = analysis ? SIGNAL_TYPE_META[analysis.signalType] : null;
            return (
              <label
                key={signal.id}
                data-saved-signal-row="compact"
                data-scan-row="true"
                style={scanRowStyle({
                  display: "grid",
                  gridTemplateColumns: `18px minmax(0, 1fr) auto${onRemoveSignal ? " 20px" : ""}`,
                  gap: 9,
                  alignItems: "center",
                  padding: "9px 10px",
                  background: checked ? tokens.color.productSoft : "transparent",
                  cursor: "pointer"
                })}
              >
	                <input
	                  type="checkbox"
	                  checked={checked}
	                  onChange={() => onToggleSignal(signal.id)}
	                  aria-label={`選取 ${signal.id}`}
	                />
                <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                  <span style={{ ...textStyles.bodyTight, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {excerpt(signalPreviewById[signal.id] || analysis?.contentSummary || signal.id, 120)}
                  </span>
                  <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
                    {readiness.label} · {analysis ? `${SIGNAL_TYPE_LABELS[analysis.signalType]} · ${VERDICT_LABELS[analysis.verdict]}` : "尚未分析"}
                  </span>
                </span>
                {typeMeta ? (
                  <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill>
                ) : (
                  <Stamp tone={readiness.tone === "success" ? "success" : readiness.tone === "warning" ? "warning" : "neutral"}>{readiness.label}</Stamp>
                )}
                {onRemoveSignal ? (
                  <button
                    type="button"
                    aria-label="移除此訊號"
                    onClick={(e) => { e.preventDefault(); onRemoveSignal(signal.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 2px", lineHeight: 1, color: tokens.color.softInk, fontSize: 14, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >×</button>
                ) : null}
              </label>
            );
          })}
	        </div>
	      </div>
	    </section>
  );
}

type SynthesizeSignalReading = (
  signalId: string,
  sessionId: string,
  force?: boolean
) => Promise<{ ok: true; reading: string } | { ok: false; error: string }>;

function SignalReadingDisclosure({
  signal,
  onSynthesize
}: {
  signal: Signal;
  onSynthesize: SynthesizeSignalReading;
}) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && reading === null && !loading) {
      setLoading(true);
      setError(null);
      void onSynthesize(signal.id, signal.sessionId).then((result) => {
        if (result.ok) {
          setReading(result.reading);
        } else {
          setError(result.error);
        }
        setLoading(false);
      });
    }
  };

  return (
    <div style={{ padding: "4px 6px 9px 31px" }}>
      <button
        type="button"
        data-signal-reading-toggle="true"
        onClick={handleToggle}
        style={{
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${tokens.color.product}`,
          background: tokens.color.productSoft,
          cursor: "pointer",
          padding: "3px 10px",
          borderRadius: tokens.radius.sm,
          font: "inherit",
          fontSize: 11,
          fontWeight: 700,
          color: tokens.color.product
        }}
      >
        {open ? "▾ 深度判讀" : "▸ 深度判讀"}
        {loading ? <ButtonShimmer /> : null}
      </button>
      {open ? (
        <div
          data-signal-reading-body="true"
          style={{
            marginTop: 6,
            fontSize: 12,
            lineHeight: 1.65,
            color: tokens.color.subInk,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {loading
            ? "判讀中…"
            : error
              ? <span style={{ color: tokens.color.queued }}>{error}</span>
              : reading || "（沒有判讀內容）"}
        </div>
      ) : null}
    </div>
  );
}

function SignalReadingReviewWorkspace({
  signals,
  analyses,
  signalReadings,
  signalPreviewById,
  signalUrlById,
  evidenceBySignalId,
  briefMode,
  onBriefModeChange,
  onSynthesizeSignalReading,
  onReviewSignalReading
}: {
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  signalReadings: SignalReading[];
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  briefMode: AgentBriefMode;
  onBriefModeChange: (mode: AgentBriefMode) => void;
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  onReviewSignalReading?: ReviewSignalReading;
}) {
  const analysesBySignal = analysisBySignalId(analyses);
  const readingsBySignal = latestReadingBySignalId(signalReadings);
  const firstActiveSignalId = signals.find((signal) => signalReadingReviewState(readingsBySignal.get(signal.id)) === "pending")?.id
    ?? signals[0]?.id
    ?? null;
  const firstActiveAnalysis = firstActiveSignalId ? analysesBySignal.get(firstActiveSignalId) : undefined;
  const initialReviewFilter = firstActiveAnalysis ? verdictFilterKeyForAnalysis(firstActiveAnalysis) : "try";
  const [activeSignalId, setActiveSignalId] = useState<string | null>(firstActiveSignalId);
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<ActionVerdictFilter>(initialReviewFilter);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, SignalReadingReviewState>>({});
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [recentlyFiledSignalId, setRecentlyFiledSignalId] = useState<string | null>(null);
  const [regeneratingSignalId, setRegeneratingSignalId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<AgentBriefCopyStatus>("idle");
  const filedFlashTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (filedFlashTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(filedFlashTimeoutRef.current);
      }
    };
  }, []);
  const readingsWithReview = signalReadings.map((reading) => {
    const override = reviewOverrides[reading.cacheKey];
    return override ? ({ ...reading, reviewState: override } as SignalReading) : reading;
  });
  const filedReadings = readingsWithReview.filter((reading) => signalReadingReviewState(reading) === "filed");
  const pendingCount = signals.filter((signal) => signalReadingReviewState(readingsBySignal.get(signal.id)) === "pending").length;
  const analysesForSignals = signals
    .map((signal) => analysesBySignal.get(signal.id))
    .filter((analysis): analysis is ProductSignalAnalysis => Boolean(analysis));
  const reviewStats: Array<{ key: ActionVerdictFilter; label: string; color: string; soft: string; count: number }> = [
    { key: "try", ...VERDICT_META.try, count: analysesForSignals.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "try").length },
    { key: "park", ...VERDICT_META.park, count: analysesForSignals.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "park").length },
    { key: "insufficient", ...VERDICT_META.insufficient_data, count: analysesForSignals.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "insufficient").length },
    { key: "watch", ...VERDICT_META.watch, count: analysesForSignals.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "watch").length }
  ];
  const selectedReviewStat = reviewStats.find((stat) => stat.key === selectedReviewFilter) ?? reviewStats[0];
  const visibleReviewSignals = signals.filter((signal) => {
    const analysis = analysesBySignal.get(signal.id);
    return analysis ? verdictFilterKeyForAnalysis(analysis) === selectedReviewFilter : false;
  });
  const agentBrief = buildSignalReadingAgentBrief({
    readings: readingsWithReview,
    analysesBySignal,
    signalPreviewById,
    signalUrlById
  });
  const reviewNoticeForDecision = (decision: SignalReadingReviewDecision) => {
    if (decision === "filed") {
      return "已收錄到本機判讀庫，並加入下方 Brief Compose。";
    }
    if (decision === "deferred") {
      return "已標記待看；這則判讀暫時不會進 Brief。";
    }
    return "已退回；這則判讀不會進 Brief。";
  };

  const flashFiled = (signalId: string) => {
    setRecentlyFiledSignalId(signalId);
    if (typeof window !== "undefined") {
      if (filedFlashTimeoutRef.current !== null) {
        window.clearTimeout(filedFlashTimeoutRef.current);
      }
      filedFlashTimeoutRef.current = window.setTimeout(() => {
        setRecentlyFiledSignalId((current) => (current === signalId ? null : current));
        filedFlashTimeoutRef.current = null;
      }, 1000);
    }
  };

  const handleReview = (reading: SignalReading, decision: SignalReadingReviewDecision) => {
    setReviewError(null);
    setReviewNotice(null);
    if (!onReviewSignalReading) {
      setReviewOverrides((current) => ({ ...current, [reading.cacheKey]: decision }));
      setReviewNotice(reviewNoticeForDecision(decision));
      if (decision === "filed") flashFiled(reading.signalId);
      return;
    }
    void onReviewSignalReading(reading.cacheKey, decision).then((result) => {
      if (result.ok) {
        const nextState = signalReadingReviewState(result.signalReading);
        setReviewOverrides((current) => ({ ...current, [reading.cacheKey]: nextState }));
        if (nextState !== "pending") {
          setReviewNotice(reviewNoticeForDecision(nextState));
        }
        if (nextState === "filed") flashFiled(reading.signalId);
      } else {
        setReviewError(result.error);
      }
    });
  };
  const handleRegenerateReading = (signal: Signal) => {
    if (!onSynthesizeSignalReading || regeneratingSignalId) {
      return;
    }
    setReviewError(null);
    setRegeneratingSignalId(signal.id);
    void onSynthesizeSignalReading(signal.id, signal.sessionId, true).then((result) => {
      if (!result.ok) {
        setReviewError(result.error);
      }
      setRegeneratingSignalId(null);
    });
  };
  const copyBrief = () => {
    if (!agentBrief) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyStatus("error");
      return;
    }
    void navigator.clipboard.writeText(agentBrief).then(
      () => {
        setCopyStatus("copied");
        if (typeof window !== "undefined") {
          window.setTimeout(() => setCopyStatus("idle"), 1800);
        }
      },
      () => setCopyStatus("error")
    );
  };
  const copyStatusText = copyStatus === "copied" ? "已複製" : copyStatus === "error" ? "複製失敗" : " ";

  return (
    <div data-signal-reading-review-workspace="true" style={{ display: "grid", gap: 14, paddingBottom: 76 }}>
      <section data-signal-reading-verdict-summary="true" style={cardStyle({ gap: 12 })}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 850, color: tokens.color.ink }}>{analysesForSignals.length} 則訊號已評估</div>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
            {filedReadings.length} 收錄 · {signals.length - pendingCount}/{signals.length} reviewed
          </span>
        </div>
        <VerdictFilterTiles
          stats={reviewStats}
          selectedKey={selectedReviewFilter}
          onSelect={(key) => {
            setSelectedReviewFilter(key);
            const target = signals.find((signal) => {
              const analysis = analysesBySignal.get(signal.id);
              return analysis ? verdictFilterKeyForAnalysis(analysis) === key : false;
            });
            if (target) setActiveSignalId(target.id);
          }}
        />
      </section>
      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ ...textStyles.meta, color: tokens.color.product, fontWeight: 850 }}>§ 1</span>
            <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.2, letterSpacing: 0, color: tokens.color.ink }}>READING REVIEW</h2>
          </div>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
            顯示 {selectedReviewStat?.label ?? "訊號"} · {visibleReviewSignals.length} 則
          </span>
        </div>
        {reviewError ? (
          <div role="alert" style={mutedPanelStyle({ borderColor: tokens.color.queued, color: tokens.color.queued, fontSize: 12 })}>{reviewError}</div>
        ) : null}
        {reviewNotice ? (
          <div
            data-signal-reading-review-notice="true"
            role="status"
            aria-live="polite"
            style={mutedPanelStyle({ borderColor: tokens.color.success, color: tokens.color.success, fontSize: 12 })}
          >
            {reviewNotice}
          </div>
        ) : null}
        <div data-signal-reading-review-list-filter={selectedReviewFilter} style={{ display: "grid", gap: 10 }}>
          {visibleReviewSignals.length ? visibleReviewSignals.map((signal, index) => {
            const analysis = analysesBySignal.get(signal.id);
            const reading = readingsBySignal.get(signal.id);
            const reviewedReading = reading ? readingsWithReview.find((entry) => entry.cacheKey === reading.cacheKey) ?? reading : undefined;
            const reviewState = signalReadingReviewState(reviewedReading);
            const stateTone = SIGNAL_READING_REVIEW_TONES[reviewState];
            const title = analysis?.contentSummary || excerpt(signalPreviewById[signal.id] || signal.id, 96);
            const isActive = activeSignalId === signal.id;
            const verdictMeta = analysis ? VERDICT_META[analysis.verdict] : null;
            const typeMeta = analysis ? SIGNAL_TYPE_META[analysis.signalType] : null;
            const sourceUrl = signalUrlById[signal.id] || reading?.sourcePacket?.postUrl || "";
            const evidenceCitations = analysis ? citationsForAnalysis(analysis, evidenceBySignalId) : [];
            const staleness = reading
              ? signalReadingStaleness(reading, SIGNAL_READING_PROMPT_VERSION)
              : { stale: false, reasons: [] };
            return (
              <article
                key={signal.id}
                data-signal-reading-review-row="true"
                data-signal-reading-filed-flash={recentlyFiledSignalId === signal.id ? "true" : undefined}
                className={isActive ? undefined : "dlens-card-lift"}
                style={{
                  border: `1px solid ${tokens.color.cardEdge}`,
                  borderRadius: tokens.radius.card,
                  background: isActive ? tokens.color.elevated : tokens.color.surface,
                  boxShadow: isActive ? tokens.shadow.raised : tokens.shadow.card,
                  overflow: "hidden",
                  transition: tokens.motion.preset.cardLift,
                  animation: recentlyFiledSignalId === signal.id ? tokens.motion.keyframes.successPulse : undefined
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveSignalId(signal.id)}
                  style={{
                    appearance: "none",
                    border: 0,
                    width: "100%",
                    background: "transparent",
                    padding: "12px 14px",
                    display: "grid",
                    gridTemplateColumns: "42px minmax(0, 1fr) auto",
                    gap: 10,
                    alignItems: "center",
                    cursor: "pointer",
                    font: "inherit",
                    textAlign: "left"
                  }}
                >
                  <span style={{ color: tokens.color.softInk, fontWeight: 800, fontSize: 12 }}>{String(index + 1).padStart(2, "0")}</span>
                  <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 850, lineHeight: 1.35, color: tokens.color.ink, ...lineClamp(2) }}>{title}</span>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", ...textStyles.meta, color: tokens.color.softInk }}>
                      {analysis && verdictMeta ? <ScorePill color={verdictMeta.color} soft={verdictMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill> : null}
                      {analysis && typeMeta ? <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill> : null}
                      <span>{analysis ? `${referenceTypeLabel(analysis.referenceType)} · relevance ${analysis.relevance}/5` : "尚未分析"}</span>
                      <span>·</span>
                      <span>{reading ? `判讀 ${reading.promptVersion}` : "未生成"}</span>
                    </span>
                  </span>
                  <Stamp tone={stateTone}>{SIGNAL_READING_REVIEW_LABELS[reviewState]}</Stamp>
                </button>
                {isActive ? (
                  <div style={{ borderTop: `1px solid ${tokens.color.line}`, display: "grid", gap: 10, padding: "10px 12px 12px" }}>
                    <SignalReadingProvenanceRow sourceUrl={sourceUrl} reading={reading} />
                    {analysis ? (
                      <SignalReadingMarginaliaPanel
                        analysis={analysis}
                      />
                    ) : null}
                    <SignalReadingEvidenceDetails citations={evidenceCitations} />
                    {staleness.stale ? (
                      <div style={{ ...mutedPanelStyle({ borderColor: tokens.color.queued, color: tokens.color.queued, fontSize: 12 }), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span>判讀建議重新生成：{signalReadingStalenessCopy(staleness)}。</span>
                        {onSynthesizeSignalReading ? (
                          <SecondaryButton
                            onClick={() => handleRegenerateReading(signal)}
                            disabled={regeneratingSignalId === signal.id}
                            style={{
                              padding: "5px 9px",
                              whiteSpace: "nowrap",
                              position: "relative",
                              overflow: "hidden"
                            }}
                          >
                            {regeneratingSignalId === signal.id ? (
                              <>生成中…<ButtonShimmer /></>
                            ) : "重新生成判讀"}
                          </SecondaryButton>
                        ) : null}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 13.5, lineHeight: 1.75, color: tokens.color.subInk, whiteSpace: "pre-wrap" }}>
                      {reading?.reading ? renderEmphasizedText(reading.reading) : "尚未生成深度判讀。生成後才能收錄進本地判讀庫。"}
                    </div>
                    {reading ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <PrimaryButton
                          disabled={reviewState === "filed"}
                          onClick={() => handleReview(reading, "filed")}
                          style={{ padding: "7px 13px" }}
                        >
                          ✓ {reviewState === "filed" ? "已收錄" : "收錄此判讀"}
                        </PrimaryButton>
                        <SecondaryButton onClick={() => handleReview(reading, "deferred")} style={{ padding: "7px 13px" }}>
                          待看
                        </SecondaryButton>
                        <SecondaryButton onClick={() => handleReview(reading, "rejected")} style={{ padding: "7px 13px" }}>
                          退回
                        </SecondaryButton>
                      </div>
                    ) : onSynthesizeSignalReading ? (
                      <SignalReadingDisclosure signal={signal} onSynthesize={onSynthesizeSignalReading} />
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          }) : (
            <div style={mutedPanelStyle({ fontSize: 12.5, color: tokens.color.subInk })}>
              這個分類暫時沒有訊號。切換上方四格可以審視其他類型。
            </div>
          )}
        </div>
      </section>
      <section
        style={{
          display: "grid",
          gap: 10,
          paddingTop: 4,
          borderTop: `1px solid ${tokens.color.line}`
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ ...textStyles.meta, color: tokens.color.product, fontWeight: 850 }}>§ 2</span>
            <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.2, letterSpacing: 0, color: tokens.color.ink }}>BRIEF COMPOSE</h2>
          </div>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}><BumpNumber value={filedReadings.length} /> approved → brief</span>
        </div>
        {!filedReadings.length ? (
          <div style={mutedPanelStyle({ fontSize: 12.5, color: tokens.color.subInk })}>
            到上方 §1 為至少一則判讀按下「收錄此判讀」，這裡才會生出可貼的 Brief。
          </div>
        ) : !composeOpen ? (
          <div
            data-signal-reading-compose-flash={recentlyFiledSignalId ? "true" : undefined}
            style={{
              ...surfaceCardStyle(),
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              overflow: "visible",
              animation: recentlyFiledSignalId ? tokens.motion.keyframes.successPulse : undefined
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 14, color: tokens.color.ink }}><BumpNumber value={filedReadings.length} /> approved → brief</strong>
              <span style={{ fontSize: 12, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {filedReadings.map((reading) => analysesBySignal.get(reading.signalId)?.contentSummary || reading.signalId).join("、")}
              </span>
            </div>
            <div data-signal-reading-brief-copy-bar="inline" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span
                data-signal-reading-brief-copy-status={copyStatus}
                aria-live="polite"
                role="status"
                style={{
                  minWidth: 48,
                  fontSize: 11,
                  fontWeight: 750,
                  color: copyStatus === "copied" ? tokens.color.success : copyStatus === "error" ? tokens.color.queued : tokens.color.softInk,
                  opacity: copyStatus === "idle" ? 0 : 1
                }}
              >
                {copyStatusText}
              </span>
              <SecondaryButton onClick={() => setComposeOpen(true)} style={{ whiteSpace: "nowrap" }}>
                預覽 Brief
              </SecondaryButton>
              <PrimaryButton
                disabled={!filedReadings.length}
                onClick={copyBrief}
                style={{
                  padding: "7px 13px",
                  whiteSpace: "nowrap",
                  animation: copyStatus === "copied" ? tokens.motion.keyframes.bump : undefined
                }}
              >
                複製 Brief
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            <div style={cardStyle({ gap: 12 })}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Kicker>輸出格式</Kicker>
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  style={{ border: 0, background: "transparent", color: tokens.color.softInk, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 650 }}
                >
                  收合 ▲
                </button>
              </div>
              <div role="radiogroup" aria-label="Agent Brief 輸出格式" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {BRIEF_FORMAT_OPTIONS.map((option) => (
                  <BriefFormatButton
                    key={option.value}
                    option={option}
                    selected={briefMode === option.value}
                    onSelect={() => onBriefModeChange(option.value)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Stamp tone="accent">判讀</Stamp>
                <Stamp tone="accent">原文</Stamp>
                <Stamp tone="accent">留言 refs</Stamp>
              </div>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Kicker>預覽 · what gets copied</Kicker>
                <div style={{ height: 1, flex: 1, background: tokens.color.line }} />
                <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>~{agentBrief.length} chars · md</span>
              </div>
              <pre
                data-signal-reading-brief-preview="true"
                style={{
                  margin: 0,
                  maxHeight: 320,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  border: `1px solid ${tokens.color.line}`,
                  borderRadius: tokens.radius.card,
                  background: tokens.color.elevated,
                  padding: 14,
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  color: tokens.color.ink
                }}
              >
                {agentBrief}
              </pre>
              <div data-signal-reading-brief-copy-bar="inline" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <span
                  data-signal-reading-brief-copy-status={copyStatus}
                  aria-live="polite"
                  role="status"
                  style={{
                    minWidth: 48,
                    fontSize: 11,
                    fontWeight: 750,
                    color: copyStatus === "copied" ? tokens.color.success : copyStatus === "error" ? tokens.color.queued : tokens.color.softInk,
                    opacity: copyStatus === "idle" ? 0 : 1
                  }}
                >
                  {copyStatusText}
                </span>
                <PrimaryButton
                  disabled={!filedReadings.length}
                  onClick={copyBrief}
                  style={{
                    padding: "7px 13px",
                    whiteSpace: "nowrap",
                    animation: copyStatus === "copied" ? tokens.motion.keyframes.bump : undefined
                  }}
                >
                  複製 Brief
                </PrimaryButton>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SavedSignalsBatchExport({
  signals,
  analyses,
  signalPreviewById,
  signalUrlById,
  selectedIds,
  briefMode,
  onBriefModeChange,
  onToggleSignal,
  onSynthesizeSignalReading,
  evidenceBySignalId
}: {
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  selectedIds: string[];
  briefMode: AgentBriefMode;
  onBriefModeChange: (mode: AgentBriefMode) => void;
  onToggleSignal: (signalId: string) => void;
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
}) {
  const [copyStatus, setCopyStatus] = useState<AgentBriefCopyStatus>("idle");
  const analysesBySignal = analysisBySignalId(analyses);
  const selectedSignals = signals.filter((signal) => selectedIds.includes(signal.id));
  const agentBrief = selectedSignals.length
    ? buildAgentBrief({ mode: briefMode, selectedSignals, analysesBySignal, signalPreviewById, signalUrlById, evidenceBySignalId })
    : "";
  const copyBrief = () => {
    if (!agentBrief) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyStatus("error");
      return;
    }
    void navigator.clipboard.writeText(agentBrief).then(
      () => {
        setCopyStatus("copied");
        if (typeof window !== "undefined") {
          window.setTimeout(() => setCopyStatus("idle"), 1800);
        }
      },
      () => setCopyStatus("error")
    );
  };
  const copyStatusText = copyStatus === "copied" ? "已複製" : copyStatus === "error" ? "複製失敗" : " ";

  return (
    <div data-saved-signals-batch-export="true" style={cardStyle({ gap: 13, borderColor: tokens.color.product, background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.productSoft})` })}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <Kicker>Agent export</Kicker>
        <Stamp tone={selectedIds.length ? "accent" : "neutral"}>{selectedIds.length} selected</Stamp>
      </div>
      <div data-batch-export-selection-list="true" style={{ display: "grid", borderTop: `1px solid ${tokens.color.line}`, borderBottom: `1px solid ${tokens.color.line}`, maxHeight: 240, overflowY: "auto" }}>
        {signals.map((signal) => {
          const analysis = analysesBySignal.get(signal.id);
          const checked = selectedIds.includes(signal.id);
          const typeMeta = analysis ? SIGNAL_TYPE_META[analysis.signalType] : null;
          return (
            <div key={signal.id} style={{ background: checked ? tokens.color.surface : "transparent" }}>
              <label
                data-batch-export-selection-row="true"
                data-scan-row="true"
                style={scanRowStyle({
                  display: "grid",
                  gridTemplateColumns: "18px minmax(0, 1fr) auto",
                  gap: 9,
                  alignItems: "center",
                  padding: "9px 4px",
                  cursor: "pointer"
                })}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSignal(signal.id)}
                  aria-label={`選取 ${referenceLabel(analysis)}`}
                />
                <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                  <span style={{ ...textStyles.bodyTight, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {referenceLabel(analysis)}
                  </span>
                  <span style={{ ...textStyles.meta, color: tokens.color.softInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {referenceTypeLabel(analysis?.referenceType)} · {referenceTakeaway(analysis)}
                  </span>
                </span>
                {typeMeta ? (
                  <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{VERDICT_LABELS[analysis!.verdict]}</ScorePill>
                ) : (
                  <Stamp tone="neutral">未分析</Stamp>
                )}
              </label>
              {checked && onSynthesizeSignalReading ? (
                <SignalReadingDisclosure signal={signal} onSynthesize={onSynthesizeSignalReading} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div role="radiogroup" aria-label="Agent Brief 輸出格式" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["original", "原文優先"],
          ["decision", "精簡決策"]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={briefMode === value}
            onClick={() => onBriefModeChange(value as AgentBriefMode)}
            style={{
              border: `1px solid ${briefMode === value ? tokens.color.product : tokens.color.line}`,
              borderRadius: tokens.radius.sm,
              background: briefMode === value ? tokens.color.product : tokens.color.surface,
              boxShadow: briefMode === value ? "0 8px 18px rgba(35, 79, 122, 0.16)" : "none",
              color: briefMode === value ? "#fff" : tokens.color.subInk,
              padding: "6px 9px",
              font: "inherit",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <PrimaryButton onClick={copyBrief} disabled={!selectedIds.length}>複製 Agent Brief</PrimaryButton>
      <div
        data-agent-brief-copy-status={copyStatus}
        aria-live="polite"
        role="status"
        style={{
          minHeight: 20,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          justifySelf: "start",
          padding: copyStatus === "idle" ? "0 8px" : "3px 9px",
          borderRadius: 999,
          background: copyStatus === "copied" ? tokens.color.successSoft : copyStatus === "error" ? tokens.color.queuedSoft : "transparent",
          color: copyStatus === "copied" ? tokens.color.success : copyStatus === "error" ? tokens.color.queued : tokens.color.softInk,
          border: copyStatus === "idle" ? "1px solid transparent" : `1px solid ${copyStatus === "copied" ? tokens.color.success : tokens.color.queued}`,
          fontSize: 11.5,
          fontWeight: 750,
          opacity: copyStatus === "idle" ? 0 : 1
        }}
      >
        {copyStatusText}
      </div>
    </div>
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
    <div data-product-classification-board="true" style={{ display: "grid", gap: 12, paddingBottom: 76 }}>
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
        <section data-scan-list="product-classification" style={{ display: "grid" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Kicker>{SIGNAL_TYPE_LABELS[selectedType]} · {selectedItems.length} 則</Kicker>
            {selectedItems.length > 1 ? (
              <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>最新在前</span>
            ) : null}
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

type VerdictFilterStat = {
  key: ActionVerdictFilter;
  label: string;
  count: number;
  color: string;
  soft: string;
};

/** Four verdict tiles over a shared selection plate that slides between them. */
function VerdictFilterTiles({
  stats,
  selectedKey,
  onSelect
}: {
  stats: VerdictFilterStat[];
  selectedKey: ActionVerdictFilter;
  onSelect: (key: ActionVerdictFilter) => void;
}) {
  const count = stats.length;
  const selectedIndex = Math.max(0, stats.findIndex((stat) => stat.key === selectedKey));
  const active = stats[selectedIndex];
  return (
    <div
      data-verdict-filter-tiles="true"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        gap: 8
      }}
    >
      <div
        aria-hidden="true"
        data-verdict-filter-plate="true"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: `calc((100% - ${(count - 1) * 8}px) / ${count})`,
          transform: `translateX(calc((100% + 8px) * ${selectedIndex}))`,
          borderRadius: tokens.radius.card,
          background: active?.soft ?? tokens.color.surface,
          border: `1px solid ${active?.color ?? tokens.color.line}`,
          boxShadow: "0 6px 16px rgba(27, 26, 23, 0.08)",
          pointerEvents: "none"
        }}
      />
      {stats.map((stat) => (
        <ActionStatCard
          key={stat.key}
          filterKey={stat.key}
          label={stat.label}
          count={stat.count}
          color={stat.color}
          soft={stat.soft}
          selected={selectedKey === stat.key}
          onSelect={() => onSelect(stat.key)}
        />
      ))}
    </div>
  );
}

function ActionStatCard({
  filterKey,
  label,
  count,
  color,
  soft,
  selected,
  onSelect
}: {
  filterKey: ActionVerdictFilter;
  label: string;
  count: number;
  color: string;
  soft: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const isZero = count === 0;
  return (
    <button
      type="button"
      data-action-verdict-filter={filterKey}
      data-verdict-tile="true"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        position: "relative",
        zIndex: 1,
        display: "grid",
        gap: 3,
        padding: "10px 9px",
        placeItems: "center",
        textAlign: "center",
        borderRadius: tokens.radius.card,
        border: "1px solid transparent",
        background: "transparent",
        opacity: isZero && !selected ? 0.5 : 1,
        cursor: "pointer",
        appearance: "none",
        font: "inherit"
      }}
    >
      <div style={{ fontSize: 11, fontWeight: isZero ? 600 : 800, color }}>{label}</div>
      <div
        data-verdict-tile-count="true"
        style={{ display: "inline-block", fontSize: 24, fontWeight: isZero ? 600 : 850, lineHeight: 1, color }}
      >
        {count}
      </div>
      <div
        data-verdict-tile-bar="true"
        style={{ height: 3, width: "100%", borderRadius: 999, background: selected ? color : soft }}
      />
    </button>
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

type ActionableItemCardLayout = "verdict" | "marginalia";

function ActionableItemCard({
  analysis,
  index,
  evidenceBySignalId,
  historicalAnalyses,
  agentTaskFeedback,
  onRemove,
  layout = "verdict"
}: {
  analysis: ProductSignalAnalysis;
  index: number;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  onRemove?: () => void;
  layout?: ActionableItemCardLayout;
}) {
  const [cardHovered, setCardHovered] = useState(false);
  const subtypeMeta = SIGNAL_TYPE_META[analysis.signalType];
  const verdictMeta = VERDICT_META[analysis.verdict];
  const verdictPanelColor = analysis.signalType === "noise" ? tokens.color.neutralText : verdictMeta.color;
  const citations = citationsForAnalysis(analysis, evidenceBySignalId);
  const citationCount = citations.length;
  const title = primaryWorkflowTitle(citations, analysis.contentSummary);
  const primaryEvidenceReason = excerpt(citations[0]?.note?.whyItMatters ?? "", 130);
  const similarHistory = findSimilarHistoricalSignals(analysis, agentTaskFeedback, historicalAnalyses);
  const taskSlotCopy = analysis.agentTaskSpec?.taskTitle?.trim()
    || analysis.experimentHint?.trim()
    || "尚未有可派發任務；先保留為觀察。";
  const railReferenceCopy = analysis.referenceLabel?.trim() || referenceTypeLabel(analysis.referenceType);

  if (layout === "marginalia") {
    return (
      <article
        className="dlens-card-lift"
        data-dlens-motion-card="true"
        data-marginalia-layout="true"
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        style={cardStyle({
          gap: 0,
          padding: 0,
          borderColor: cardHovered ? "rgba(27, 26, 23, 0.18)" : tokens.color.line,
          boxShadow: cardHovered
            ? "0 14px 32px rgba(27, 26, 23, 0.10), 0 2px 6px rgba(27, 26, 23, 0.04)"
            : "none",
          overflow: "hidden",
          transform: cardHovered ? "translateY(-2px)" : undefined,
        })}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 168px", minWidth: 0 }}>
          <main
            data-testid="marginalia-main"
            style={{
              display: "grid",
              gap: 15,
              padding: "22px 24px 20px",
              minWidth: 0
            }}
          >
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", fontSize: 10.5, fontWeight: 750, color: tokens.color.softInk }}>
              <span
                data-dlens-number-badge="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-grid",
                  placeItems: "center",
                  fontSize: 12,
                  fontWeight: 500,
                  color: tokens.color.subInk,
                  background: tokens.color.elevated,
                  border: `1px solid ${tokens.color.lineStrong}`,
                  fontFamily: tokens.font.serifCjk,
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                {index + 1}
              </span>
              <span>{SIGNAL_TYPE_LABELS[analysis.signalType]}</span>
              <span>·</span>
              <span>{formatAnalyzedAt(analysis.analyzedAt)}</span>
            </div>

            <h3
              data-actionable-title="workflow"
              data-testid="marginalia-headline"
              style={{ margin: 0, fontSize: 25, fontWeight: 720, lineHeight: 1.24, color: tokens.color.ink, letterSpacing: 0, wordBreak: "break-word", fontFamily: tokens.font.serifCjk }}
            >
              {title}
            </h3>

            <div
              style={{
                fontSize: 13.5,
                lineHeight: 1.72,
                color: tokens.color.subInk,
                display: "block"
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  float: "left",
                  fontFamily: tokens.font.serifCjk,
                  fontSize: 46,
                  lineHeight: 0.86,
                  paddingRight: 7,
                  color: verdictPanelColor,
                  fontWeight: 700
                }}
              >
                {analysis.contentSummary.trim().charAt(0) || "訊"}
              </span>
              {analysis.contentSummary.trim().slice(1) || analysis.contentSummary}
            </div>

            {analysis.reason || primaryEvidenceReason ? (
              <div data-testid="marginalia-reason" style={{ display: "grid", gap: 7 }}>
                <div style={{ fontSize: 13, lineHeight: 1.65, color: tokens.color.subInk, fontStyle: "italic" }}>
                  {analysis.reason || primaryEvidenceReason}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {citations.slice(0, 4).map((citation) => (
                    <span
                      key={citation.ref}
                      style={{
                        fontFamily: tokens.font.mono,
                        fontSize: 10.5,
                        color: tokens.color.product,
                        background: tokens.color.productSoft,
                        border: `1px solid ${tokens.color.product}`,
                        borderRadius: 999,
                        padding: "2px 6px"
                      }}
                    >
                      {citation.ref}
                    </span>
                  ))}
                </div>
                {primaryEvidenceReason ? (
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.softInk }}>
                    引用理由：{primaryEvidenceReason}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              data-testid="marginalia-experiment"
              style={{
                borderTop: `1px solid ${tokens.color.line}`,
                borderBottom: `1px solid ${tokens.color.line}`,
                padding: "10px 0",
                display: "flex",
                gap: 9,
                alignItems: "baseline",
                color: analysis.verdict === "try" ? tokens.color.success : tokens.color.subInk
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 760 }}>
                {analysis.verdict === "try" ? "TRY experiment" : "Keep as observation"}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: tokens.color.subInk }}>
                {taskSlotCopy}
              </span>
            </div>

            <div data-testid="marginalia-footnotes" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", borderBottom: `1px solid ${tokens.color.line}`, paddingBottom: 8 }}>
                <span data-evidence-section-label="true" style={{ ...textStyles.label, color: tokens.color.softInk }}>
                  原文證據 · {citationCount} 則
                </span>
                <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>可借用 workflow</span>
              </div>
              {citations.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {citations.slice(0, 3).map((citation, footnoteIndex) => (
                    <div key={citation.ref} style={{ display: "grid", gap: 9 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
                        <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>{citation.ref}.</span>
                        <div style={{ display: "grid", gap: 3 }}>
                          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk }}>
                            {citationText(citation, 220)}
                          </div>
                          <div
                            data-evidence-quote-author="true"
                            style={{
                              fontStyle: "italic",
                              fontFamily: tokens.font.serifCjk,
                              fontSize: 13,
                              color: tokens.color.subInk,
                              letterSpacing: 0.1
                            }}
                          >
                            — {citation.entry?.author ?? citation.ref}{citation.entry?.likeCount ? ` ♡ ${citation.entry.likeCount}` : ""}
                          </div>
                        </div>
                      </div>
                      <WorkflowEvidenceCard citation={citation} layout="flat" />
                      {citation.entry?.text || citation.note?.whyItMatters ? (
                        <SmoothDetails
                          summary={
                            <span
                              data-evidence-source-toggle="true"
                              className="dlens-expand-trigger"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "3px 9px",
                                borderRadius: 999,
                                background: tokens.color.productSoft,
                                border: `1px solid ${tokens.color.product}`,
                                fontSize: 11.5,
                                fontStyle: "italic",
                                color: tokens.color.product,
                                fontWeight: 700,
                                letterSpacing: 0
                              }}
                            >
                              查看原文與模型判讀 →
                            </span>
                          }
                          summaryStyle={{ cursor: "pointer", padding: 0, letterSpacing: 0 }}
                        >
                          <div style={{ display: "grid", gap: 7, marginTop: 10, paddingBottom: footnoteIndex === citations.length - 1 ? 0 : 4 }}>
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
              ) : (
                <div style={mutedPanelStyle({ fontSize: 11.5, lineHeight: 1.55, color: tokens.color.softInk })}>
                  這則訊號暫時沒有可顯示的原文證據。
                </div>
              )}
            </div>
          </main>

          <aside
            data-testid="marginalia-rail"
            style={{
              background: tokens.color.contextSurface,
              borderLeft: `1px solid ${tokens.color.line}`,
              padding: "18px 14px",
              display: "grid",
              alignContent: "start",
              gap: 13,
              minWidth: 0
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: tokens.color.softInk, letterSpacing: "0.04em" }}>判讀</span>
              <span
                data-testid="rail-verdict"
                data-verdict-value={analysis.verdict}
                style={{ fontSize: 18, lineHeight: 1.12, color: verdictPanelColor, fontWeight: 850, fontFamily: tokens.font.serifCjk }}
              >
                {VERDICT_LABELS[analysis.verdict]}
              </span>
            </div>
            <div data-testid="rail-relevance" style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: tokens.color.softInk, letterSpacing: "0.04em" }}>相關度</span>
              <RelevanceBars score={analysis.relevance} tone="dark" />
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ color: tokens.color.softInk }}>分類</span>
                <span style={{ color: tokens.color.ink, fontWeight: 750 }}>{subtypeMeta.label}</span>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ color: tokens.color.softInk }}>子型</span>
                <span style={{ color: tokens.color.ink, fontWeight: 650 }}>{formatSubtype(analysis.signalSubtype)}</span>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ color: tokens.color.softInk }}>對到</span>
                <span style={{ color: tokens.color.ink, fontWeight: 650 }}>{railReferenceCopy}</span>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ color: tokens.color.softInk }}>證據</span>
                <span style={{ color: tokens.color.ink, fontWeight: 650 }}>{citationCount} 則</span>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ color: tokens.color.softInk }}>待解</span>
                <span style={{ color: tokens.color.ink, fontWeight: 650 }}>
                  {Array.isArray(analysis.blockers) && analysis.blockers.length ? `${analysis.blockers.length} 項` : "無明確阻礙"}
                </span>
              </div>
            </div>
            <div
              data-testid="rail-task"
              style={{
                marginTop: 4,
                background: tokens.color.ink,
                color: tokens.color.elevated,
                borderRadius: tokens.radius.card,
                padding: "11px 10px",
                display: "grid",
                gap: 6
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 850, letterSpacing: "0.06em" }}>TASK ›</span>
              <span style={{ fontSize: 12, lineHeight: 1.45, fontWeight: 650 }}>{taskSlotCopy}</span>
            </div>
          </aside>
        </div>
        <div style={{ display: "grid", gap: 10, padding: "0 24px 20px" }}>
          <SimilarHistoryBlock items={similarHistory} />
        </div>
      </article>
    );
  }

  return (
    <article
      className="dlens-card-lift"
      data-dlens-motion-card="true"
      data-verdict-layout="true"
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
      style={cardStyle({
        gap: 18,
        padding: 0,
        borderColor: cardHovered ? "rgba(27, 26, 23, 0.18)" : tokens.color.line,
        boxShadow: cardHovered
          ? "0 14px 32px rgba(27, 26, 23, 0.10), 0 2px 6px rgba(27, 26, 23, 0.04)"
          : "none",
        overflow: "hidden",
        transform: cardHovered ? "translateY(-2px)" : undefined,
      })}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.95fr) minmax(0, 2fr)", alignItems: "stretch" }}>
        <aside
          data-testid="verdict-panel"
          style={{
            background: verdictPanelColor,
            color: "#fff",
            padding: "22px 18px",
            display: "grid",
            alignContent: "space-between",
            gap: 20,
            minHeight: 230
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
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
                color: "rgba(255,255,255,0.94)",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.44)",
                fontFamily: tokens.font.serifCjk,
                fontVariantNumeric: "tabular-nums"
              }}
            >
              {index + 1}
            </span>
            <div style={{ display: "grid", gap: 5 }}>
              <div
                data-testid="verdict-label"
                data-verdict-value={analysis.verdict}
                style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 850, color: "#fff", fontFamily: tokens.font.serifCjk }}
              >
                {VERDICT_LABELS[analysis.verdict]}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.35, color: "rgba(255,255,255,0.76)", fontWeight: 700 }}>
                {analysis.verdict === "try" ? "可排入小實驗" : "先不要推進成實驗"}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <RelevanceBars score={analysis.relevance} />
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10.5, lineHeight: 1.2, textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                signal type
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.3, color: "#fff", fontWeight: 800 }}>
                {SIGNAL_TYPE_LABELS[analysis.signalType]}
              </span>
            </div>
          </div>
        </aside>
        <div style={{ minWidth: 0, display: "grid", gap: 14, padding: "24px 22px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
              <h3
                data-actionable-title="workflow"
                data-testid="insight-headline"
                style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.28, color: tokens.color.ink, letterSpacing: 0, wordBreak: "break-word", fontFamily: tokens.font.serifCjk }}
              >
                {title}
              </h3>
              <div
                data-product-reference-note="true"
                style={{
                  borderLeft: `3px solid ${tokens.color.product}`,
                  background: tokens.color.productSoft,
                  padding: "8px 10px",
                  display: "grid",
                  gap: 3
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: tokens.color.product }}>
                  {referenceTypeLabel(analysis.referenceType)} · {referenceLabel(analysis)}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: tokens.color.subInk }}>
                  {referenceTakeaway(analysis)}
                </div>
              </div>
            </div>
            {onRemove ? (
              <button
                type="button"
                aria-label="移除此訊號"
                onClick={onRemove}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", lineHeight: 1, color: tokens.color.softInk, fontSize: 16, borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
              >×</button>
            ) : null}
          </div>
          {analysis.reason ? (
            <div style={{ fontSize: 13, lineHeight: 1.65, color: tokens.color.subInk, fontStyle: "italic" }}>
              {analysis.reason}
            </div>
          ) : primaryEvidenceReason ? (
            <div style={{ fontSize: 13, lineHeight: 1.65, color: tokens.color.softInk, fontStyle: "italic" }}>
              {primaryEvidenceReason}
            </div>
          ) : null}
          {primaryEvidenceReason ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.softInk }}>
              引用理由：{primaryEvidenceReason}
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
            <div
              style={{
                borderRadius: tokens.radius.card,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.elevated,
                padding: "10px 11px",
                display: "grid",
                gap: 4
              }}
            >
              <span style={textStyles.fieldLabel}>Evidence</span>
              <span style={{ fontSize: 15, lineHeight: 1.2, color: tokens.color.ink, fontWeight: 800 }}>{citationCount} 則原文證據</span>
            </div>
            <div
              data-testid="task-slot"
              style={{
                borderRadius: tokens.radius.card,
                border: `1px solid ${tokens.color.product}`,
                background: tokens.color.productSoft,
                padding: "10px 11px",
                display: "grid",
                gap: 4
              }}
            >
              <span style={{ ...textStyles.fieldLabel, color: tokens.color.product }}>Task</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: tokens.color.ink, fontWeight: 650 }}>{taskSlotCopy}</span>
            </div>
          </div>
          <div
            data-testid="metadata-strip"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              paddingTop: 2,
              color: tokens.color.softInk,
              fontSize: 11.5,
              lineHeight: 1.5
            }}
          >
            <span>分類：{subtypeMeta.label}</span>
            <span>·</span>
            <span>Subtype：{formatSubtype(analysis.signalSubtype)}</span>
            <span>·</span>
            <span>Analyzed：{formatAnalyzedAt(analysis.analyzedAt)}</span>
            <span>·</span>
            <span>Prompt：{analysis.promptVersion}</span>
          </div>
        </div>
      </div>
      <EvidenceUseCaseList citations={citations} />
      <SimilarHistoryBlock items={similarHistory} />
    </article>
  );
}

function SavedExperimentsPanel({
  feedback,
  analyses
}: {
  feedback: ProductAgentTaskFeedback[];
  analyses: ProductSignalAnalysis[];
}) {
  const actionable = feedback.filter((f) => f.feedback === "adopted" || f.feedback === "needs_rewrite");
  if (!actionable.length) return null;

  const bySignal = analysisBySignalId(analyses);
  const adopted = actionable.filter((f) => f.feedback === "adopted");
  const needsRewrite = actionable.filter((f) => f.feedback === "needs_rewrite");

  function feedbackRow(f: ProductAgentTaskFeedback, tone: "adopted" | "needs_rewrite") {
    const analysis = bySignal.get(f.signalId);
    const title = analysis?.contentSummary || f.signalId;
    const meta = AGENT_TASK_FEEDBACK_OPTIONS.find((o) => o.value === tone);
    return (
      <div
        key={`${f.signalId}-${f.taskPromptHash}`}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          borderRadius: tokens.radius.sm,
          background: meta?.soft || tokens.color.neutralSurfaceSoft,
          border: `1px solid ${tokens.color.line}`
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 999, flexShrink: 0,
          background: meta?.color || tokens.color.softInk
        }} />
        <span style={{ ...textStyles.bodyTight, color: tokens.color.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {f.note ? (
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }} title={f.note}>📝</span>
        ) : null}
        <span style={{ ...textStyles.meta, color: tokens.color.softInk, flexShrink: 0 }}>
          {new Date(f.createdAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}
        </span>
      </div>
    );
  }

  return (
    <section style={cardStyle({ padding: "12px 14px", gap: 10 })}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ ...textStyles.cardTitle, color: tokens.color.ink }}>已儲存實驗</div>
        <Stamp tone="accent">{actionable.length}</Stamp>
      </div>
      {adopted.length ? (
        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ ...textStyles.label, color: tokens.color.success }}>已採用</div>
          {adopted.map((f) => feedbackRow(f, "adopted"))}
        </div>
      ) : null}
      {needsRewrite.length ? (
        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ ...textStyles.label, color: tokens.color.queued }}>需要改寫</div>
          {needsRewrite.map((f) => feedbackRow(f, "needs_rewrite"))}
        </div>
      ) : null}
    </section>
  );
}

function ActionableInsightsBoard({
  analyses,
  productProfile,
  evidenceBySignalId,
  historicalAnalyses,
  agentTaskFeedback,
  cardLayout,
  onRemoveSignal
}: {
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  cardLayout: ProductSignalCardLayout;
  onRemoveSignal?: (signalId: string) => void;
}) {
  const [selectedFilter, setSelectedFilter] = useState<ActionVerdictFilter>("try");
  const tryItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "try").sort((a, b) => b.relevance - a.relevance);
  const parkItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "park");
  const insufficientItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "insufficient");
  const watchItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "watch");
  const stats: Array<{ key: ActionVerdictFilter; label: string; color: string; soft: string; count: number }> = [
    { key: "try", ...VERDICT_META.try, count: tryItems.length },
    { key: "park", ...VERDICT_META.park, count: parkItems.length },
    { key: "insufficient", ...VERDICT_META.insufficient_data, count: insufficientItems.length },
    { key: "watch", ...VERDICT_META.watch, count: watchItems.length }
  ];
  const itemsByFilter: Record<ActionVerdictFilter, ProductSignalAnalysis[]> = {
    try: tryItems,
    park: parkItems,
    insufficient: insufficientItems,
    watch: watchItems
  };
  const selectedItems = itemsByFilter[selectedFilter];
  const selectedStat = stats.find((stat) => stat.key === selectedFilter) ?? stats[0];
  const selectedSectionTitle = selectedFilter === "try" ? "可直接試的做法" : selectedStat.label;
  const emptyCopyByFilter: Record<ActionVerdictFilter, string> = {
    try: "目前沒有 verdict=try 的訊號。先看保留觀察或資料不足。",
    park: "目前沒有被判定為前提不符的訊號。",
    insufficient: "目前沒有資料不足的訊號。",
    watch: "目前沒有需要保留觀察的訊號。"
  };

  return (
    <div data-actionable-insights-board="true" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Stamp tone="accent">{productProfile?.name || "ProductProfile"}</Stamp>
        <Stamp tone="neutral">{productProfile?.audience || "目標受眾未填"}</Stamp>
        <Stamp tone={isProductContextSourceReady(productProfile) ? "success" : "warning"}>ProductContext</Stamp>
      </div>
      <section style={cardStyle({ gap: 12 })}>
        <div style={{ fontSize: 14, fontWeight: 850, color: tokens.color.ink }}>{analyses.length} 則訊號已評估</div>
        <VerdictFilterTiles stats={stats} selectedKey={selectedFilter} onSelect={setSelectedFilter} />
      </section>
      <SavedExperimentsPanel feedback={agentTaskFeedback} analyses={analyses} />
      <section style={{ display: "grid", gap: 10 }}>
        <Kicker>{selectedSectionTitle}</Kicker>
        {selectedItems.length ? selectedItems.map((analysis, index) => (
          <ActionableItemCard
            key={analysis.signalId}
            analysis={analysis}
            index={index}
            evidenceBySignalId={evidenceBySignalId}
            historicalAnalyses={historicalAnalyses}
            agentTaskFeedback={agentTaskFeedback}
            layout={cardLayout}
            onRemove={onRemoveSignal ? () => onRemoveSignal(analysis.signalId) : undefined}
          />
        )) : (
          <div style={mutedPanelStyle({ fontSize: 12.5, color: tokens.color.subInk })}>{emptyCopyByFilter[selectedFilter]}</div>
        )}
      </section>
    </div>
  );
}

export const productSignalViewTestables = {
  buildAgentBrief,
  buildSignalReadingAgentBrief,
  ActionableItemCard
};

export function ProductSignalView({
  kind,
  signals,
  analyses,
  productProfile,
  historicalAnalyses = analyses,
  agentTaskFeedback = [],
  signalPreviewById = {},
  signalUrlById = {},
  evidenceBySignalId = {},
  signalReadinessById = {},
  signalReadings = [],
  aiProviderReady = true,
  cardLayout = "marginalia",
  analysisError = null,
  analysisNotice = null,
  isAnalyzing = false,
  onAnalyze,
  onGoToActionable,
  onRemoveSignal,
  onSynthesizeSignalReading,
  onReviewSignalReading
}: {
  kind: ProductSignalPageKind;
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  historicalAnalyses?: ProductSignalAnalysis[];
  agentTaskFeedback?: ProductAgentTaskFeedback[];
  signalPreviewById?: Record<string, string>;
  signalUrlById?: Record<string, string>;
  evidenceBySignalId?: Record<string, ProductSignalEvidenceEntry[]>;
  signalReadinessById?: Record<string, ProductSignalReadiness>;
  signalReadings?: SignalReading[];
  aiProviderReady?: boolean;
  cardLayout?: ProductSignalCardLayout;
  analysisError?: string | null;
  analysisNotice?: string | null;
  isAnalyzing?: boolean;
  onAnalyze: () => void;
  onGoToActionable?: () => void;
  onRemoveSignal?: (signalId: string) => void;
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  onReviewSignalReading?: ReviewSignalReading;
}) {
  const copy = PAGE_COPY[kind];
  const safeSignals = Array.isArray(signals) ? signals : [];
  const safeAnalyses = Array.isArray(analyses) ? analyses : [];
  const safeHistoricalAnalyses = Array.isArray(historicalAnalyses) ? historicalAnalyses : safeAnalyses;
  const safeAgentTaskFeedback = Array.isArray(agentTaskFeedback) ? agentTaskFeedback : [];
  const safeSignalReadings = Array.isArray(signalReadings) ? signalReadings : [];
  const bySignal = analysisBySignalId(safeAnalyses);
  const scopedAnalyses = visibleAnalyses(kind, safeSignals.map((signal) => bySignal.get(signal.id)).filter((entry): entry is ProductSignalAnalysis => Boolean(entry)));
  const pendingSignals = safeSignals.filter((signal) => bySignal.get(signal.id)?.status !== "complete");
  const canAnalyze = canRunProductSignalAction({ signals: safeSignals, productProfile, aiProviderReady, signalReadinessById });
  const showSignalReadingReview = Boolean(onReviewSignalReading) || safeSignalReadings.length > 0;
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [briefMode, setBriefMode] = useState<AgentBriefMode>("original");

  function toggleSelectedSignal(signalId: string) {
    setSelectedSignalIds((current) =>
      current.includes(signalId)
        ? current.filter((id) => id !== signalId)
        : [...current, signalId]
    );
  }

  function handleRemoveSignal(signalId: string) {
    if (!window.confirm("確認刪除此 signal？此操作無法復原。")) return;
    setSelectedSignalIds((current) => current.filter((id) => id !== signalId));
    onRemoveSignal?.(signalId);
  }

  return (
    <div style={viewRootStyle()} data-product-signal-view={kind}>
      <style>{SCAN_ROW_HOVER_CSS}</style>
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
                onRemove={onRemoveSignal ? () => handleRemoveSignal(signal.id) : undefined}
              />
            ))}
          </section>
        ) : null}
        {kind === "saved-signals" && scopedAnalyses.length > 0 && !isAnalyzing && onGoToActionable ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: tokens.radius.card,
              border: `1px solid var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`,
              background: `var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`
            }}
          >
            <span style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.4 }}>
              分析完成，查看哪些 signal 值得行動
            </span>
            <PrimaryButton onClick={onGoToActionable} style={{ padding: "6px 14px", whiteSpace: "nowrap" }}>
              查看候選行動 →
            </PrimaryButton>
          </div>
        ) : null}
        {kind === "saved-signals" ? (
          <SavedSignalsBoard
            signals={safeSignals}
            analyses={scopedAnalyses}
            signalPreviewById={signalPreviewById}
            signalReadinessById={signalReadinessById}
            selectedIds={selectedSignalIds}
            onToggleSignal={toggleSelectedSignal}
            onRemoveSignal={onRemoveSignal ? handleRemoveSignal : undefined}
          />
        ) : scopedAnalyses.length ? (
          kind === "classification" ? (
            <ClassificationBoard analyses={scopedAnalyses} signalPreviewById={signalPreviewById} />
          ) : (
            <>
              {showSignalReadingReview ? (
                <SignalReadingReviewWorkspace
                  signals={safeSignals}
                  analyses={safeAnalyses}
                  signalReadings={safeSignalReadings}
                  signalPreviewById={signalPreviewById}
                  signalUrlById={signalUrlById}
                  evidenceBySignalId={evidenceBySignalId}
                  briefMode={briefMode}
                  onBriefModeChange={setBriefMode}
                  onSynthesizeSignalReading={onSynthesizeSignalReading}
                  onReviewSignalReading={onReviewSignalReading}
                />
              ) : (
                <>
                  <ActionableInsightsBoard
                    analyses={scopedAnalyses}
                    productProfile={productProfile}
                    evidenceBySignalId={evidenceBySignalId}
                    historicalAnalyses={safeHistoricalAnalyses}
                    agentTaskFeedback={safeAgentTaskFeedback}
                    cardLayout={cardLayout}
                    onRemoveSignal={handleRemoveSignal}
                  />
                  <SavedSignalsBatchExport
                    signals={safeSignals}
                    analyses={safeAnalyses}
                    signalPreviewById={signalPreviewById}
                    signalUrlById={signalUrlById}
                    selectedIds={selectedSignalIds}
                    briefMode={briefMode}
                    onBriefModeChange={setBriefMode}
                    onToggleSignal={toggleSelectedSignal}
                    onSynthesizeSignalReading={onSynthesizeSignalReading}
                    evidenceBySignalId={evidenceBySignalId}
                  />
                </>
              )}
            </>
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
