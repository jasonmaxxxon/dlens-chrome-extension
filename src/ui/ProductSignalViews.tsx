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
  ProductSignalVerdict
} from "../state/types";
import { isProductContextSourceReady } from "../compare/product-context";
import { findSimilarHistoricalSignals, type SimilarHistoricalSignal } from "../compare/product-signal-history";
import type { ProductSignalEvidenceEntry } from "../compare/product-signal-analysis";
import type { SignalPacketExportFormat, SignalPacketExportResult } from "../compare/signal-packet-export";
import {
  latestReadingBySignalId,
  signalReadingStaleness,
  type SignalReading,
  type SignalReadingReviewState,
  type SignalReadingStaleness
} from "../compare/signal-reading-storage";
import { SIGNAL_READING_PROMPT_VERSION } from "../compare/signal-reading";
import { aiOutputProvenanceFromModel, describeAiOutputProvenance } from "../state/ai-provenance";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import { describeProcessingError, type ProcessingErrorClass, type ProcessingErrorView } from "../state/processing-errors";
import type { ProductSignalAction, ProductSignalCommand, ProductSignalViewModel, ProductSignalWorkspaceViewModel } from "../viewmodel/product-signal";
import type { SignalReadiness } from "../state/signal-readiness";
import { CollectorMetricStrip } from "./CollectorMetricStrip";
import {
  EvidenceSourceHero,
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
import { modeThemes, tokens, textStyles } from "./tokens";

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
  box-shadow: ${tokens.shadow.cardLiftHover} !important;
  border-color: ${tokens.color.lineHover} !important;
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
  background: ${tokens.color.inkWash};
}
[data-dlens-control="true"] .dlens-expand-trigger {
  transition: background 120ms ${tokens.motion.easing.standard}, border-color 120ms ${tokens.motion.easing.standard};
}
[data-dlens-control="true"] .dlens-details-summary:hover .dlens-expand-trigger {
  background: ${tokens.color.inkWashStrong};
  border-color: ${tokens.color.lineStrong};
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
  color: ${tokens.color.ink};
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
    title: "已存訊號",
    deck: "先確認已儲存的 Threads post 是否完成抓取，再到行動頁整理可試 workflow。"
  },
  classification: {
    title: "分類整理",
    deck: "先把每則 Threads signal 放回正確範疇，再決定是否值得產品團隊處理。"
  },
  "actionable-filter": {
    title: "行動簡報",
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
  competitor: { label: "競品分析", color: tokens.color.techniqueViolet, soft: tokens.color.techniqueVioletSoft },
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

const CONTENT_TYPE_LABELS: Record<ProductSignalAnalysis["contentType"], string> = {
  content: "內容片段",
  discussion_starter: "討論開場",
  mixed: "混合內容"
};

const SUBTYPE_LABELS: Record<string, string> = {
  agent_memory_pattern: "Agent 記憶模式",
  analysis_error: "分析錯誤",
  browser_automation: "瀏覽器自動化",
  ecommerce_platform_selection: "電商平台選型",
  mobile_share_extension: "行動分享入口",
  pm_document_generation: "PM 文件產出",
  productboard_gap: "Productboard 缺口",
  user_sentiment_reflection: "使用者情緒回饋"
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

const PRODUCT_MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.product})`;
const PRODUCT_MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.productMid})`;
const PRODUCT_MODE_ACCENT_SOFT = `var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`;
const PRODUCT_MODE_ACCENT_GLOW = `var(--dlens-mode-accent-glow, ${tokens.color.productGlow})`;
const PRODUCT_MODE_ACCENT_BUTTON_SHADOW = `var(--dlens-mode-accent-button-shadow, ${modeThemes.product.accentButtonShadow})`;
const DEFAULT_PRODUCT_ACTION_READINESS: SignalReadiness = { status: "ready", itemStatus: "succeeded" };

function analysisBySignalId(analyses: ProductSignalAnalysis[]): Map<string, ProductSignalAnalysis> {
  return new Map(analyses.map((analysis) => [analysis.signalId, analysis]));
}

type ReadinessLabel = {
  label: string;
  detail: string;
  tone: "success" | "warning" | "neutral";
  isTerminal?: boolean;
  errorClass?: ProcessingErrorClass;
};

function readinessLabel(readiness: SignalReadiness): ReadinessLabel {
  const processingError = describeProcessingError(readiness);
  if (processingError) {
    if (readiness.status === "failed" && processingError.isTerminal) {
      return {
        label: processingError.label,
        detail: processingError.detail,
        tone: "warning",
        isTerminal: true,
        errorClass: processingError.errorClass
      };
    }
    if (readiness.status === "crawling" && !processingError.isTerminal) {
      return {
        label: processingError.label,
        detail: processingError.detail,
        tone: "warning",
        errorClass: processingError.errorClass
      };
    }
  }
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
      return { label: "抓取失敗", detail: "請重新送出抓取後再分析。", tone: "warning", isTerminal: true };
    case "missing_item":
    default:
      return { label: "找不到貼文", detail: "signal 缺少對應的 saved item。", tone: "warning" };
  }
}

function ProductReadinessChip({ readiness }: { readiness: SignalReadiness }) {
  const copy = readinessLabel(readiness);
  const toneStyle = copy.tone === "success"
    ? { color: PRODUCT_MODE_ACCENT, background: PRODUCT_MODE_ACCENT_SOFT, borderColor: PRODUCT_MODE_ACCENT_GLOW }
    : copy.tone === "warning"
      ? { color: tokens.color.queued, background: tokens.color.queuedSoft, borderColor: tokens.color.queuedBorder }
      : { color: PRODUCT_MODE_ACCENT_MID, background: PRODUCT_MODE_ACCENT_SOFT, borderColor: PRODUCT_MODE_ACCENT_GLOW };

  return (
    <span
      data-product-readiness-chip="true"
      data-product-readiness-status={readiness.status}
      title={copy.detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "2px 7px",
        borderRadius: tokens.radius.round,
        border: `1px solid ${toneStyle.borderColor}`,
        background: toneStyle.background,
        color: toneStyle.color,
        fontSize: 10.5,
        lineHeight: 1.25,
        fontWeight: 760,
        whiteSpace: "nowrap"
      }}
    >
      {copy.label}
    </span>
  );
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
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    return "未分類訊號";
  }
  return SUBTYPE_LABELS[normalized] ?? "未分類訊號";
}

function formatContentType(value: ProductSignalAnalysis["contentType"]): string {
  return CONTENT_TYPE_LABELS[value] ?? "內容類型未分類";
}

function formatRelevanceScore(score: ProductSignalAnalysis["relevance"]): string {
  return `相關度 ${score}/5`;
}

function formatActionCue(verdict: ProductSignalVerdict): string {
  return verdict === "try" ? "排入小實驗" : "保留觀察";
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

function formatReferenceScore(score: ProductSignalAnalysis["relevance"]): string {
  return `參考度 ${score}/5`;
}

const PRODUCT_SIGNAL_METRIC_KEYS: Array<keyof Pick<TargetDescriptor["engagement_present"], "likes" | "comments" | "reposts" | "forwards">> = [
  "likes",
  "comments",
  "reposts",
  "forwards"
];

function hasDescriptorMetrics(descriptor: TargetDescriptor | null | undefined): descriptor is TargetDescriptor {
  if (!descriptor) return false;
  return PRODUCT_SIGNAL_METRIC_KEYS.some((key) => descriptor.engagement_present[key]);
}

function ProductSignalMetricStrip({
  descriptor,
  signalId
}: {
  descriptor?: TargetDescriptor;
  signalId: string;
}) {
  if (!hasDescriptorMetrics(descriptor)) {
    return null;
  }
  return <CollectorMetricStrip descriptor={descriptor} marker={`product-signal-${signalId}`} />;
}

function ProductSignalEyebrow({
  analysis,
  provenance
}: {
  analysis: ProductSignalAnalysis;
  provenance: ProductSignalViewModel["provenance"];
}) {
  const provenanceCopy = describeAiOutputProvenance(provenance);
  const provenanceColor = provenanceCopy.tone === "success"
    ? tokens.color.success
    : provenanceCopy.tone === "warning"
      ? tokens.color.queued
      : tokens.color.softInk;
  const chips = [
    formatContentType(analysis.contentType),
    formatSubtype(analysis.signalSubtype)
  ].filter(Boolean);
  return (
    <div
      data-product-card-eyebrow="true"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "baseline",
        flexWrap: "wrap",
        minWidth: 0,
        ...textStyles.label,
        color: SIGNAL_TYPE_META[analysis.signalType].color,
        letterSpacing: 0
      }}
    >
      <span>{SIGNAL_TYPE_LABELS[analysis.signalType]}</span>
      <span style={{ ...textStyles.metric, color: tokens.color.ink }}>{formatReferenceScore(analysis.relevance)}</span>
      <span title={provenanceCopy.detail} style={{ ...textStyles.metric, color: provenanceColor, fontWeight: 500 }}>
        {provenanceCopy.label}
      </span>
      {chips.map((chip) => (
        <span
          key={chip}
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "none",
            color: tokens.color.softInk,
            background: tokens.color.neutralSurfaceSoft,
            border: `1px solid ${tokens.color.line}`,
            borderRadius: tokens.radius.pill,
            padding: "1px 6px"
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function ProductVerdictSoftPill({ verdict }: { verdict: ProductSignalVerdict }) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      data-product-verdict-pill={verdict}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "0 9px",
        borderRadius: tokens.radius.pill,
        border: `1px solid ${meta.soft}`,
        background: meta.soft,
        color: meta.color,
        fontSize: 10.5,
        fontWeight: 800,
        whiteSpace: "nowrap"
      }}
    >
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

const PRODUCT_SIGNAL_KV_FIELDS: Array<{
  key: "whyRelevant" | "whyNow" | "experimentHint" | "validationMetric";
  label: string;
}> = [
  { key: "whyRelevant", label: "為何相關" },
  { key: "whyNow", label: "為何現在" },
  { key: "experimentHint", label: "可以試" },
  { key: "validationMetric", label: "驗證指標" }
];

function productSignalKvEntries(analysis: ProductSignalAnalysis) {
  return PRODUCT_SIGNAL_KV_FIELDS
    .map((field) => ({ ...field, value: analysis[field.key]?.trim() ?? "" }))
    .filter((field) => field.value);
}

function ProductSignalKvGrid({ analysis }: { analysis: ProductSignalAnalysis }) {
  const entries = productSignalKvEntries(analysis);
  if (!entries.length) {
    return null;
  }
  return (
    <dl
      data-product-kv-grid="signal"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(72px, auto) minmax(0, 1fr)",
        gap: "6px 10px",
        margin: 0,
        minWidth: 0,
        fontSize: 12,
        lineHeight: 1.55
      }}
    >
      {entries.map((entry) => (
        <div key={entry.key} data-product-kv={entry.key} style={{ display: "contents" }}>
          <dt style={{ ...textStyles.fieldLabel, color: tokens.color.softInk }}>{entry.label}</dt>
          <dd style={{ margin: 0, color: tokens.color.subInk, minWidth: 0, overflowWrap: "anywhere" }}>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
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
    borderRadius: tokens.radius.cardLg,
    background: tokens.color.elevated,
    boxShadow: tokens.shadow.topicCard,
    ...extra
  });
}

function mutedPanelStyle(extra?: CSSProperties): CSSProperties {
  return surfaceCardStyle({
    display: "grid",
    gap: 8,
    padding: "10px 12px",
    borderRadius: tokens.radius.cardLg,
    background: tokens.color.contextSurface,
    boxShadow: tokens.shadow.topicCard,
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

function inferWorkflowPattern(citation: EvidenceCitation): {
  pattern: string;
  whyItWorks: string;
  tradeoff: string;
  grounding: ProductSignalEvidenceNote["grounding"];
} {
  const raw = [
    citation.entry?.text,
    citation.note?.quoteSummary,
    citation.note?.whyItMatters,
    citation.note?.reusablePattern,
    citation.note?.whyItWorks,
    citation.note?.tradeoff
  ].filter(Boolean).join(" ");
  const lower = raw.toLowerCase();
  const explicitPattern = citation.note?.reusablePattern?.trim();
  const explicitWhy = citation.note?.whyItWorks?.trim();
  const explicitTradeoff = citation.note?.tradeoff?.trim();
  const explicitGrounding = citation.note?.grounding;

  if (explicitPattern || explicitWhy || explicitTradeoff) {
    return {
      pattern: explicitPattern || citationUseCase(citation, 70) || "可重用工作流",
      whyItWorks: explicitWhy || citation.note?.whyItMatters || "這條留言把場景、工具和輸出連在一起。",
      tradeoff: explicitTradeoff || "",
      grounding: explicitGrounding || "insufficient_detail"
    };
  }

  if ((lower.includes("slack") || lower.includes("jira")) && (lower.includes("release") || lower.includes("confluence") || lower.includes("metabase") || lower.includes("sql"))) {
    return {
      pattern: "多來源工作流轉文件",
      whyItWorks: "它把資料來源、Agent 處理和可交付文件分清楚，團隊可替換自己的工具。",
      tradeoff: "需要工具授權與資料讀取權限。",
      grounding: "model_inferred"
    };
  }

  if (lower.includes("gitlab") || lower.includes("ci/cd") || lower.includes("cicd") || lower.includes("review")) {
    return {
      pattern: "工程回饋自動化",
      whyItWorks: "它讓 agent 進入既有 issue、CI 和 review 節點，不要求使用者重整上下文。",
      tradeoff: "需要接入工程權限與測試結果。",
      grounding: "model_inferred"
    };
  }

  if (lower.includes("search") || raw.includes("搜尋") || raw.includes("爬蟲") || lower.includes("crawler")) {
    return {
      pattern: "搜尋與爬蟲做市場雷達",
      whyItWorks: "它先自動過濾雜訊，再保留產品團隊需要追蹤的趨勢敏感度。",
      tradeoff: "需要控制抓取頻率與來源品質。",
      grounding: "model_inferred"
    };
  }

  return {
    pattern: citationUseCase(citation, 70) || "可重用工作流",
    whyItWorks: citation.note?.whyItMatters || "這條留言把抽象需求落到具體操作方式。",
    tradeoff: "原文不足以推導完整做法。",
    grounding: "insufficient_detail"
  };
}

const GROUNDING_LABELS: Record<NonNullable<ProductSignalEvidenceNote["grounding"]>, string> = {
  text_grounded: "原文可還原",
  model_inferred: "AI 推斷，請交叉驗證原文",
  insufficient_detail: "原文不足"
};

type WorkflowSectionTone = "copy" | "why" | "tradeoff";

const WORKFLOW_SECTION_TONES: Record<WorkflowSectionTone, { accent: string; soft: string; border: string }> = {
  copy: {
    accent: tokens.color.success,
    soft: tokens.color.successSoft,
    border: tokens.color.successBorder
  },
  why: {
    accent: tokens.color.accent,
    soft: tokens.color.runningSoft,
    border: tokens.color.runningBorder
  },
  tradeoff: {
    accent: tokens.color.queued,
    soft: tokens.color.queuedSoft,
    border: tokens.color.queuedBorderStrong
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
      </div>
      <div style={{ display: "grid", gap: flatten ? 0 : 6 }}>
        <div data-workflow-section-tone="copy" data-workflow-row-layout={flatten ? "stacked" : "boxed"} style={flatten ? rowStyle(false) : workflowSectionPanelStyle("copy")}>
          <span data-workflow-field-label="copy" style={flatten ? fieldLabelStyle : workflowSectionLabelStyle("copy")}>可借用模式</span>
          <pre style={{ margin: 0, fontSize: flatten ? 12 : 12.5, lineHeight: 1.55, color: tokens.color.ink, fontFamily: tokens.font.mono, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {workflow.pattern}
          </pre>
        </div>
        <div data-workflow-section-tone="why" data-workflow-row-layout={flatten ? "stacked" : "boxed"} style={flatten ? rowStyle(!workflow.tradeoff) : workflowSectionPanelStyle("why")}>
          <span data-workflow-field-label="why" style={flatten ? fieldLabelStyle : workflowSectionLabelStyle("why")}>判讀依據</span>
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
  const active = tone === "light" ? tokens.color.inverseStrong : tokens.color.teal;
  const inactive = tone === "light" ? tokens.color.inverseTrack : tokens.color.lineStrong;
  const labelColor = tone === "light" ? tokens.color.inverseStrong : tokens.color.softInk;

  return (
    <div data-relevance-bars="true" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, lineHeight: 1.2, fontWeight: 800, color: labelColor }}>
        {formatRelevanceScore(score)}
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
  onRemove,
  suppressTerminalDetail = false
}: {
  signal: ProductSignalViewModel;
  onRemove?: () => void;
  suppressTerminalDetail?: boolean;
}) {
  const { analysis, readiness } = signal;
  const label: ReadinessLabel = analysis?.status === "error"
    ? { label: "分析失敗", detail: analysis.error || analysis.reason || "這則訊號未能產生可信分析。", tone: "warning" as const }
    : readinessLabel(readiness);
  const showDetail = !(suppressTerminalDetail && label.isTerminal);
  const isProcessing = (
    analysis?.status === "pending"
    || analysis?.status === "analyzing"
    || (!analysis && readiness.status === "crawling" && !label.isTerminal)
  );
  return (
    <div
      className="dlens-card-lift"
      data-product-pending-card="topic-card"
      style={cardStyle({
        padding: "14px 16px",
        border: "none",
        boxShadow: tokens.shadow.topicCard,
        gap: 10
      })}
    >
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
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{analysis?.status === "error" ? "需重試" : "未分析"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{signal.source}</span>
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
      {showDetail ? (
        <div style={{ ...textStyles.body, fontSize: 12.5, color: tokens.color.subInk }}>{label.detail}</div>
      ) : null}
      {signal.sourcePreview.displayText ? (
        <div style={{ ...textStyles.body, color: tokens.color.ink, ...lineClamp(2) }}>{signal.sourcePreview.displayText}</div>
      ) : null}
    </div>
  );
}

function PendingSignalsQueueSummary({ signals }: { signals: ProductSignalViewModel[] }) {
  const failedCount = signals.filter((signal) => {
    const label = signal.analysis?.status === "error"
      ? { isTerminal: true }
      : readinessLabel(signal.readiness);
    return Boolean(label.isTerminal);
  }).length;
  const processingCount = signals.filter((signal) => (
    signal.analysis?.status === "pending"
    || signal.analysis?.status === "analyzing"
    || (!signal.analysis && signal.readiness.status === "crawling" && !readinessLabel(signal.readiness).isTerminal)
  )).length;
  const waitingCount = Math.max(0, signals.length - failedCount - processingCount);
  const cells = [
    { label: "抓取/分析中", value: processingCount, tone: tokens.color.product },
    { label: "待補", value: waitingCount, tone: tokens.color.softInk },
    { label: "失敗", value: failedCount, tone: failedCount ? tokens.color.queued : tokens.color.softInk }
  ];

  return (
    <section
      data-product-action-queue-summary="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.neutralSurfaceSoft,
        minWidth: 0,
        flexWrap: "wrap"
      }}
    >
      <span style={{ ...textStyles.caption, color: tokens.color.subInk, fontWeight: 760 }}>
        {signals.length} 則訊號等待進入行動判讀
      </span>
      <span style={{ flex: 1 }} />
      {cells.map((cell, index) => (
        <span key={cell.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {index > 0 ? <span aria-hidden style={{ width: 1, height: 18, background: tokens.color.line }} /> : null}
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
            <b style={{ fontFamily: tokens.font.mono, fontSize: 13, color: tokens.color.ink }}>{cell.value}</b>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: cell.tone }}>{cell.label}</span>
          </span>
        </span>
      ))}
    </section>
  );
}

interface ProcessingErrorAggregate {
  errorClass: ProcessingErrorClass;
  count: number;
  error: ProcessingErrorView;
}

function summarizeProcessingErrorAggregate(signals: ProductSignalViewModel[]): ProcessingErrorAggregate | null {
  const groups = new Map<ProcessingErrorClass, { count: number; error: ProcessingErrorView }>();
  for (const signal of signals) {
    const error = describeProcessingError(signal.readiness);
    if (!error?.isTerminal) {
      continue;
    }
    const current = groups.get(error.errorClass);
    groups.set(error.errorClass, {
      count: (current?.count ?? 0) + 1,
      error
    });
  }
  const largest = [...groups.entries()]
    .map(([errorClass, value]) => ({ errorClass, ...value }))
    .filter((summary) => summary.count > 1)
    .sort((a, b) => b.count - a.count)[0];
  return largest ?? null;
}

function ProcessingErrorAggregateBanner({ summary }: { summary: ProcessingErrorAggregate }) {
  return (
    <div
      data-product-error-aggregate={summary.errorClass}
      style={{
        display: "grid",
        gap: 5,
        padding: "10px 12px",
        borderRadius: tokens.radius.sm,
        border: `1px solid ${tokens.color.queuedBorder}`,
        background: tokens.color.queuedSoft,
        color: tokens.color.queued
      }}
    >
      <div style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: 800 }}>
        {summary.error.aggregateTitle(summary.count)}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: tokens.color.subInk }}>
        {summary.error.aggregateDetail}
      </div>
    </div>
  );
}

function ReadinessPanel({
  viewModel,
  onAnalyze
}: {
  viewModel: ProductSignalWorkspaceViewModel;
  onAnalyze: () => void;
}) {
  const completedCount = viewModel.completedAnalysisCount;
  const hasResults = completedCount > 0;
  const visibleError = viewModel.visibleError;
  const copy = viewModel.readinessCopy;

  if (viewModel.loadState === "loading") {
    return (
      <div
        data-product-hydrating="true"
        style={mutedPanelStyle({
          display: "grid",
          gap: 9,
          padding: "10px 12px"
        })}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <Kicker>讀取狀態</Kicker>
          <Stamp tone="neutral">讀取中</Stamp>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
          正在讀取本地 Product signals 與分析結果。
        </div>
      </div>
    );
  }

  /* Compact single-line status bar when everything is green */
  if (viewModel.allGreen && !viewModel.isAnalyzing && !visibleError) {
    return (
      <div
        className="dlens-card-lift"
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
        <Stamp tone="neutral">{viewModel.signalCount} signals · {completedCount} analyses</Stamp>
        <div style={{ flex: 1 }} />
        <SecondaryButton onClick={onAnalyze} disabled={!viewModel.canAnalyze}>
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
          <Stamp tone={viewModel.signalCount ? "success" : "warning"}>{viewModel.signalCount} signals</Stamp>
          <Stamp tone={completedCount ? "success" : "neutral"}>{completedCount} analyses</Stamp>
          <Stamp tone={viewModel.aiProviderReady ? "success" : "warning"}>AI key</Stamp>
          <Stamp tone={viewModel.productProfile?.name && viewModel.productProfile.category && viewModel.productProfile.audience ? "success" : "warning"}>ProductProfile</Stamp>
          <Stamp tone={isProductContextSourceReady(viewModel.productProfile) ? "success" : "warning"}>ProductContext</Stamp>
        </div>
      </div>
      {copy ? <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>{copy}</div> : null}
      {visibleError ? (
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
          {visibleError}
        </div>
      ) : null}
      {viewModel.analysisNotice ? (
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
          {viewModel.analysisNotice}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <PrimaryButton onClick={onAnalyze} disabled={!viewModel.canAnalyze || viewModel.isAnalyzing} activateOnPointerDown>
          {viewModel.isAnalyzing ? "分析中" : hasResults ? "重新分析" : "分析收件匣"}
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
        minWidth: 0,
        overflow: "hidden",
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
  const wrapTextStyle: CSSProperties = { minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" };
  return (
    <aside data-product-selected-aside="true" style={cardStyle({ gap: 11, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Kicker>系統挑出的內容</Kicker>
        <Stamp tone="neutral">{formatContentType(analysis.contentType)}</Stamp>
      </div>
      <div style={mutedPanelStyle({ background: tokens.color.elevated, gap: 6, minWidth: 0 })}>
        <div style={{ fontSize: 10.5, color: tokens.color.softInk, fontWeight: 750 }}>討論串內容</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: tokens.color.ink, fontWeight: 700, ...wrapTextStyle }}>{lead}</div>
        {rest ? (
          <SmoothDetails
            summary={<><span className="dlens-details-chevron" aria-hidden>▾</span> 展開全文</>}
            summaryStyle={{ cursor: "pointer", fontSize: 11, color: tokens.color.softInk, listStyle: "none", display: "flex", gap: 4, alignItems: "center", padding: 0 }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk, marginTop: 6, ...wrapTextStyle }}>{rest}</div>
          </SmoothDetails>
        ) : null}
      </div>
      <div style={{ height: 1, background: tokens.color.line, opacity: 0.6 }} />
      <dl style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "5px 10px", margin: 0, fontSize: 12, lineHeight: 1.55, minWidth: 0 }}>
        <dt style={{ color: tokens.color.softInk }}>AI 建議分類</dt>
        <dd style={{ margin: 0, minWidth: 0 }}>
          <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill>
        </dd>
        <dt style={{ color: tokens.color.softInk }}>分類原因</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk, ...wrapTextStyle }}>{excerpt(analysis.whyRelevant, 130)}</dd>
        <dt style={{ color: tokens.color.softInk }}>{referenceTypeLabel(analysis.referenceType)}</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk, ...wrapTextStyle }}>{referenceLabel(analysis)}</dd>
        <dt style={{ color: tokens.color.softInk }}>可帶走</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk, ...wrapTextStyle }}>{referenceTakeaway(analysis)}</dd>
        <dt style={{ color: tokens.color.softInk }}>相關脈絡</dt>
        <dd style={{ margin: 0, color: tokens.color.subInk, ...wrapTextStyle }}>{contextLabels(analysis.relevantTo)}</dd>
        <dt style={{ color: tokens.color.softInk }}>後續判斷</dt>
        <dd style={{ margin: 0, minWidth: 0 }}>
          <ScorePill color={verdictMeta.color} soft={verdictMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill>
        </dd>
      </dl>
    </aside>
  );
}

type AgentBriefMode = "original" | "decision";
type SignalPacketExportFolderOption = {
  id: string;
  name: string;
  itemCount: number;
};
type SignalPacketExportStatus = "idle" | "exporting" | "exported" | "error";
type SignalPacketUiExportFormat = Extract<SignalPacketExportFormat, "html" | "jsonl">;
type ExportSignalPackets = (options: {
  sessionId: string;
  format: SignalPacketUiExportFormat;
}) => Promise<{ ok: true; exportResult: SignalPacketExportResult } | { ok: false; error: string }>;
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

const SIGNAL_PACKET_EXPORT_FORMATS: Array<{
  value: SignalPacketUiExportFormat;
  label: string;
  deck: string;
  whatsInside: string;
}> = [
  {
    value: "html",
    label: "HTML Reading",
    deck: "給人閱讀、分享",
    whatsInside: "完整版面的判讀文檔，瀏覽器直接看"
  },
  {
    value: "jsonl",
    label: "JSONL Packet",
    deck: "給 agent / 搜尋工具",
    whatsInside: "每行一個 packet：原文 · 證據 · 判讀 · feedback · decisionTrace"
  }
];

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
  const pattern = /\*\*([^*]+)\*\*/g;
  // Measure how much of the text the author bolded. When most of a passage
  // is emphasized the marks carry no signal — they just make the block hard
  // to read — so fall back to flat text in that case.
  let emphasizedChars = 0;
  let measure: RegExpExecArray | null;
  while ((measure = pattern.exec(text)) !== null) {
    emphasizedChars += measure[1].trim().length;
  }
  const plainLength = text.replace(/\*\*/g, "").trim().length;
  const overEmphasized = plainLength > 0 && emphasizedChars / plainLength > 0.5;

  pattern.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      overEmphasized ? (
        match[1]
      ) : (
        <strong key={`em-${match.index}`} style={{ color: tokens.color.ink, fontWeight: 600 }}>
          {match[1]}
        </strong>
      )
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length ? nodes : [text];
}

function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
}

function splitReadingFirstSentence(text: string): { first: string; rest: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^([\s\S]*?[。！？!?])([\s\S]*)$/);
  if (!match) {
    return { first: trimmed, rest: "" };
  }
  return { first: match[1].trim(), rest: match[2].trim() };
}

function deriveReadingLeadTitle(sentence: string): string {
  const plain = stripMarkdownEmphasis(sentence);
  const quotedAfterContrast = plain.match(/而在於「([^」]{4,42})」/);
  if (quotedAfterContrast) {
    return quotedAfterContrast[1].trim();
  }
  const quotedAfterPivot = plain.match(/(?:在於|是|提醒了我們[:：]?)「([^」]{4,42})」/);
  if (quotedAfterPivot) {
    return quotedAfterPivot[1].trim();
  }
  const afterColon = plain.match(/[:：]\s*([^。！？!?]{6,42})/);
  if (afterColon) {
    return afterColon[1].trim();
  }
  return excerpt(plain, 34);
}

function createSignalReadingDisplayCopy(reading: string): { title: string; summary: string; body: string } {
  const normalized = reading.trim();
  if (!normalized) {
    return { title: "", summary: "", body: "" };
  }
  const paragraphs = normalized.split(/\n{2,}/);
  const { first, rest } = splitReadingFirstSentence(paragraphs[0] ?? normalized);
  const title = deriveReadingLeadTitle(first);
  const summary = first;
  const bodyParts = [
    rest,
    ...paragraphs.slice(1)
  ].map((part) => part.trim()).filter(Boolean);
  return { title, summary, body: bodyParts.join("\n\n") };
}

function SignalReadingBody({ reading }: { reading: string }) {
  const copy = createSignalReadingDisplayCopy(reading);
  if (!copy.title) {
    return null;
  }
  return (
    <div data-signal-reading-display-copy="true" style={{ display: "grid", gap: 9 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div
          data-signal-reading-lead-title="true"
          style={{
            fontSize: 15,
            lineHeight: 1.38,
            color: tokens.color.ink,
            fontWeight: 700,
            overflowWrap: "anywhere"
          }}
        >
          {copy.title}
        </div>
        <div
          data-signal-reading-lead-summary="true"
          style={{
            fontSize: 13,
            lineHeight: 1.72,
            color: tokens.color.subInk,
            overflowWrap: "anywhere"
          }}
        >
          {renderEmphasizedText(copy.summary)}
        </div>
      </div>
      {copy.body ? (
        <details
          data-signal-reading-full="true"
          style={{
            borderTop: `1px solid ${tokens.color.line}`,
            paddingTop: 8
          }}
        >
          <summary
            data-signal-reading-full-summary="true"
            className="dlens-expand-trigger"
            style={{
              cursor: "pointer",
              listStyle: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              ...textStyles.fieldLabel,
              color: tokens.color.product
            }}
          >
            <span aria-hidden>▸</span>完整判讀
          </summary>
          <div
            data-signal-reading-full-body="true"
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.72,
              color: tokens.color.subInk,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere"
            }}
          >
            {renderEmphasizedText(copy.body)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SignalReadingProvenanceRow({
  sourceUrl,
  reading,
  sourceKind,
  captureId,
  itemStatus
}: {
  sourceUrl: string;
  reading?: SignalReading;
  sourceKind?: ProductSignalViewModel["source"];
  captureId?: ProductSignalViewModel["captureId"];
  itemStatus?: ProductSignalViewModel["readiness"]["itemStatus"];
}) {
  const model = reading?.model || "";
  const provenance = aiOutputProvenanceFromModel(model);
  const provenanceCopy = describeAiOutputProvenance(provenance);
  const provenanceColor = provenanceCopy.tone === "success"
    ? tokens.color.success
    : provenanceCopy.tone === "warning"
      ? tokens.color.queued
      : tokens.color.softInk;
  const sourceMeta = [
    sourceKind ? `來源 ${sourceKind}` : "",
    captureId ? `capture ${captureId}` : "",
    itemStatus ? `item ${itemStatus}` : ""
  ].filter(Boolean);
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
      {sourceMeta.map((meta) => (
        <span
          key={meta}
          data-signal-reading-source-meta="true"
          title={meta}
          style={{ color: tokens.color.softInk }}
        >
          {meta}
        </span>
      ))}
      <span
        data-signal-reading-model-hover="true"
        title={model ? `模型：${model}` : provenanceCopy.detail}
        style={{ color: provenanceColor, cursor: model ? "help" : "default" }}
      >
        判讀來源：{provenanceCopy.label}
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
        background: `linear-gradient(100deg, transparent 35%, ${tokens.color.inverseShimmer} 50%, transparent 65%)`,
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
        <span
          style={{
            display: "inline-flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 6,
            color: tokens.color.softInk,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: 0
          }}
        >
          <span>引用留言 {citations.length} 則</span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
            {citations.map((citation) => {
              const text = citation.entry?.text?.trim() || citation.note?.quoteSummary || "";
              const author = citation.entry?.author || "unknown";
              const likeFragment = citation.entry?.likeCount ? ` · ${citation.entry.likeCount}♥` : "";
              const tooltip = `${author}${likeFragment}\n${text}`.slice(0, 280);
              return (
                <span
                  key={citation.ref}
                  data-signal-reading-evidence-chip={citation.ref}
                  title={tooltip}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 999,
                    border: `1px solid ${tokens.color.line}`,
                    background: tokens.color.surface,
                    color: tokens.color.subInk,
                    cursor: "help",
                    letterSpacing: 0
                  }}
                >
                  {citation.ref}
                </span>
              );
            })}
          </span>
          <span aria-hidden="true">▾</span>
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
        border: `1px solid ${PRODUCT_MODE_ACCENT_GLOW}`,
        borderRadius: tokens.radius.card,
        background: `linear-gradient(90deg, ${PRODUCT_MODE_ACCENT_SOFT}, ${tokens.color.elevated} 68%)`
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
            fontSize: 13.5,
            lineHeight: 1.5,
            color: tokens.color.ink,
            fontWeight: 700,
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
        data-signal-reading-marginalia-rail="true"
        data-product-drawer-accent-rail="true"
        data-signal-reading-relevance-summary="true"
        style={{
          display: "grid",
          alignContent: "start",
          gap: 9,
          padding: "13px 12px",
          borderLeft: `3px solid ${PRODUCT_MODE_ACCENT}`,
          background: `linear-gradient(180deg, ${PRODUCT_MODE_ACCENT_SOFT}, ${tokens.color.inversePanel})`,
          minWidth: 0
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

function buildAgentBrief({
  mode,
  selectedSignals,
  analysesBySignal,
  signalPreviewById,
  signalUrlById,
  evidenceBySignalId = {}
}: {
  mode: AgentBriefMode;
  selectedSignals: Array<ProductSignalViewModel | { id: string }>;
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
    const signalId = "signalId" in signal ? signal.signalId : signal.id;
    const analysis = ("analysis" in signal ? signal.analysis : undefined) ?? analysesBySignal.get(signalId);
    const previewSource = "sourcePreview" in signal ? signal.sourcePreview.displayText : signalPreviewById[signalId];
    const preview = excerpt(previewSource || analysis?.contentSummary || "", mode === "original" ? 900 : 420);
    const url = ("sourcePreview" in signal ? signal.sourcePreview.displayUrl : signalUrlById[signalId]) || "";
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
    const evidenceByRef = new Map((("evidence" in signal ? signal.evidence : evidenceBySignalId[signalId]) ?? []).map((entry) => [entry.ref, entry]));
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

function resolveDefaultSignalPacketExportFolderId(
  folders: SignalPacketExportFolderOption[],
  activeFolderId?: string
): string {
  if (activeFolderId && folders.some((folder) => folder.id === activeFolderId)) {
    return activeFolderId;
  }
  return folders[0]?.id || "";
}

function downloadSignalPacketExport(result: SignalPacketExportResult): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    throw new Error("This browser context cannot download files.");
  }
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SignalPacketHtmlExportSection({
  activeFolderId,
  exportFolders,
  onExportSignalPackets,
  embedded = false
}: {
  activeFolderId?: string;
  exportFolders?: SignalPacketExportFolderOption[];
  onExportSignalPackets?: ExportSignalPackets;
  embedded?: boolean;
}) {
  const safeExportFolders = Array.isArray(exportFolders) ? exportFolders : [];
  const exportFolderKey = safeExportFolders.map((folder) => folder.id).join("|");
  const defaultExportFolderId = resolveDefaultSignalPacketExportFolderId(safeExportFolders, activeFolderId);
  const [selectedExportFolderId, setSelectedExportFolderId] = useState(defaultExportFolderId);
  const [selectedExportFormat, setSelectedExportFormat] = useState<SignalPacketUiExportFormat>("html");
  const [exportStatus, setExportStatus] = useState<SignalPacketExportStatus>("idle");
  const [exportMessage, setExportMessage] = useState(" ");

  useEffect(() => {
    setSelectedExportFolderId((current) => {
      if (current && safeExportFolders.some((folder) => folder.id === current)) {
        return current;
      }
      return defaultExportFolderId;
    });
  }, [defaultExportFolderId, exportFolderKey]);

  const selectedExportFolder = safeExportFolders.find((folder) => folder.id === selectedExportFolderId) ?? null;
  const canExportPacket = Boolean(onExportSignalPackets && selectedExportFolder);
  const selectedFormatMeta = SIGNAL_PACKET_EXPORT_FORMATS.find((format) => format.value === selectedExportFormat) ?? SIGNAL_PACKET_EXPORT_FORMATS[0];
  const exportStatusText = exportStatus === "exporting"
    ? "匯出中"
    : exportStatus === "exported"
      ? exportMessage
      : exportStatus === "error"
        ? exportMessage
        : " ";

  const exportPacket = async () => {
    if (!onExportSignalPackets || !selectedExportFolder) return;
    setExportStatus("exporting");
    setExportMessage(" ");
    const response = await onExportSignalPackets({
      sessionId: selectedExportFolder.id,
      format: selectedExportFormat
    });
    if (!response.ok) {
      setExportStatus("error");
      setExportMessage(response.error);
      return;
    }
    try {
      downloadSignalPacketExport(response.exportResult);
      setExportStatus("exported");
      setExportMessage(`${response.exportResult.packetCount} packets · ${response.exportResult.filename}`);
    } catch (error) {
      setExportStatus("error");
      setExportMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section
      data-signal-packet-html-export="true"
      style={embedded
        ? {
            display: "grid",
            gap: 12,
            paddingTop: 12,
            borderTop: `1px solid ${tokens.color.line}`
          }
        : cardStyle({ gap: 12 })}
    >
      <p
        data-signal-packet-export-dek="true"
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.65,
          color: tokens.color.subInk,
          letterSpacing: 0
        }}
      >
        把這個 folder 已完成的判讀打包成可重讀的 packet — 給未來的你，或 agent。
      </p>
      <div role="radiogroup" aria-label="Signal Packet 匯出格式" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {SIGNAL_PACKET_EXPORT_FORMATS.map((format) => {
          const selected = selectedExportFormat === format.value;
          return (
            <button
              key={format.value}
              type="button"
              data-signal-packet-format-option={format.value}
              aria-pressed={selected}
              onClick={() => {
                setSelectedExportFormat(format.value);
                setExportStatus("idle");
                setExportMessage(" ");
              }}
              style={{
                border: `1px solid ${selected ? tokens.color.product : tokens.color.line}`,
                borderRadius: tokens.radius.sm,
                background: selected ? tokens.color.productSoft : tokens.color.surface,
                color: selected ? tokens.color.product : tokens.color.subInk,
                padding: "11px 13px",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
                display: "grid",
                gap: 5
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 750 }}>{format.label}</span>
              <span style={{ ...textStyles.meta, color: selected ? tokens.color.product : tokens.color.softInk }}>{format.deck}</span>
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.55,
                  color: selected ? tokens.color.product : tokens.color.softInk,
                  opacity: selected ? 0.95 : 0.85,
                  marginTop: 2,
                  paddingTop: 5,
                  borderTop: `1px dashed ${selected ? tokens.color.product : tokens.color.line}`
                }}
              >
                {format.whatsInside}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <PrimaryButton
          onClick={() => void exportPacket()}
          disabled={!canExportPacket || exportStatus === "exporting"}
        >
          {exportStatus === "exporting"
            ? "匯出中..."
            : selectedExportFormat === "jsonl"
              ? "匯出 JSONL Packet"
              : "匯出 HTML Reading"}
        </PrimaryButton>
        <span
          data-signal-packet-export-status={exportStatus}
          aria-live="polite"
          role="status"
          style={{
            minHeight: 20,
            display: "inline-flex",
            alignItems: "center",
            padding: exportStatus === "idle" ? "0 8px" : "3px 9px",
            borderRadius: 999,
            background: exportStatus === "exported" ? tokens.color.successSoft : exportStatus === "error" ? tokens.color.queuedSoft : "transparent",
            color: exportStatus === "exported" ? tokens.color.success : exportStatus === "error" ? tokens.color.queued : tokens.color.softInk,
            border: exportStatus === "idle" ? "1px solid transparent" : `1px solid ${exportStatus === "exported" ? tokens.color.success : tokens.color.queued}`,
            fontSize: 11.5,
            fontWeight: 750,
            opacity: exportStatus === "idle" ? 0 : 1
          }}
        >
          {exportStatusText}
        </span>
      </div>
    </section>
  );
}

type SavedSignalCategory = "unclassified" | "pending" | "classified";

function savedSignalCategory(signal: ProductSignalViewModel): SavedSignalCategory {
  if (signal.analysis) return "classified";
  if (signal.readiness.status === "ready") return "unclassified";
  return "pending";
}

const SAVED_FILTER_TABS: Array<{ key: "all" | SavedSignalCategory; label: string }> = [
  { key: "all", label: "全部" },
  { key: "unclassified", label: "未分類" },
  { key: "pending", label: "待處理" },
  { key: "classified", label: "已分類" }
];

const SAVED_LIST_VISIBLE_LIMIT = 6;

function SavedSignalsBoard({
  signals,
  pendingSignals,
  pendingErrorAggregate,
  selectedIds,
  onToggleSignal,
  onRemoveSignal,
  onAnalyze
}: {
  signals: ProductSignalViewModel[];
  pendingSignals: ProductSignalViewModel[];
  pendingErrorAggregate: ProcessingErrorAggregate | null;
  selectedIds: string[];
  onToggleSignal: (signalId: string) => void;
  onRemoveSignal?: (signalId: string) => void;
  onAnalyze: () => void;
}) {
  const [activeFilter, setActiveFilter] = useState<"all" | SavedSignalCategory>("all");
  const [showAll, setShowAll] = useState(false);

  if (!signals.length) {
    return null;
  }

  const counts: Record<"all" | SavedSignalCategory, number> = {
    all: signals.length,
    unclassified: 0,
    pending: 0,
    classified: 0
  };
  for (const signal of signals) {
    counts[savedSignalCategory(signal)] += 1;
  }
  const filteredSignals = activeFilter === "all"
    ? signals
    : signals.filter((signal) => savedSignalCategory(signal) === activeFilter);
  const isBounded = !showAll && filteredSignals.length > SAVED_LIST_VISIBLE_LIMIT;
  const visibleSignals = isBounded ? filteredSignals.slice(0, SAVED_LIST_VISIBLE_LIMIT) : filteredSignals;

  function savedRowTitle(signal: ProductSignalViewModel, analysis: ProductSignalAnalysis | undefined): string {
    const raw = signal.sourcePreview.displayText || analysis?.contentSummary || signal.signalId;
    const maxLength = /[\u3400-\u9fff]/.test(raw) ? 30 : 72;
    return excerpt(raw, maxLength);
  }

  function savedRowMeta(readiness: ReadinessLabel, analysis: ProductSignalAnalysis | undefined): string {
    if (analysis) {
      return VERDICT_LABELS[analysis.verdict];
    }
    return readiness.isTerminal ? readiness.label : "未分析";
  }

  function savedRowQuote(signal: ProductSignalViewModel, analysis: ProductSignalAnalysis): string {
    const raw = signal.sourcePreview.displayText || analysis.contentSummary;
    return excerpt(raw, /[\u3400-\u9fff]/.test(raw) ? 28 : 96);
  }

  return (
    <section data-saved-signals-route="true" style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle({ gap: 10 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Kicker>已存訊號</Kicker>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{signals.length}</span>
        </div>
        <div data-product-saved-filter-tabs="true" role="tablist" aria-label="已存訊號篩選" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SAVED_FILTER_TABS.map((tab) => {
            const active = activeFilter === tab.key;
            const count = counts[tab.key];
            const disabled = count === 0 && tab.key !== "all";
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-product-saved-filter={tab.key}
                data-active={active ? "true" : "false"}
                disabled={disabled}
                onClick={() => { setActiveFilter(tab.key); setShowAll(false); }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 11px",
                  borderRadius: tokens.radius.round,
                  border: `1px solid ${active ? tokens.color.product : tokens.color.line}`,
                  background: active ? tokens.color.productSoft : tokens.color.surface,
                  color: disabled ? tokens.color.softInk : active ? tokens.color.product : tokens.color.subInk,
                  fontFamily: tokens.font.sans,
                  fontSize: 11.5,
                  fontWeight: 750,
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.55 : 1
                }}
              >
                {tab.label}
                <span style={{ fontFamily: tokens.font.mono, fontSize: 10.5, fontWeight: 700, color: active ? tokens.color.product : tokens.color.softInk }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <MergedClassificationSummary signals={signals} />
        {pendingSignals.length ? (
          <details
            data-product-saved-pending-detail="collapsed"
            style={{
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.line}`,
              background: tokens.color.contextSurface,
              padding: "8px 10px"
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11.5,
                fontWeight: 750,
                color: tokens.color.subInk
              }}
            >
              <span>{pendingSignals.length} 則待補爬 / 未分析</span>
              <span style={{ marginLeft: "auto", color: tokens.color.product }}>重新處理</span>
            </summary>
            <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
              {pendingErrorAggregate ? <ProcessingErrorAggregateBanner summary={pendingErrorAggregate} /> : null}
              <div style={{ fontSize: 11.5, lineHeight: 1.55, color: tokens.color.softInk }}>
                尚未抓取的來源先收在這裡，不佔用已存訊號列表注意力。
              </div>
              <SecondaryButton onClick={onAnalyze} style={{ justifySelf: "start", padding: "5px 10px", fontSize: 11 }}>
                重新處理
              </SecondaryButton>
            </div>
          </details>
        ) : null}
        <div data-scan-list="saved-signals" style={{ display: "grid" }}>
          {visibleSignals.map((signal, index) => {
            const analysis = signal.analysis;
            const readiness = readinessLabel(signal.readiness);
            const checked = selectedIds.includes(signal.signalId);
            const rowTitle = savedRowTitle(signal, analysis);
            const rowMeta = savedRowMeta(readiness, analysis);
            const isFusionRow = Boolean(analysis);
            const isHeroRow = isFusionRow && index === 0;
            return (
              <label
                key={signal.signalId}
                data-saved-signal-row="compact"
                data-product-fusion-card={isFusionRow ? isHeroRow ? "hero" : "row" : undefined}
                data-scan-row="true"
                style={scanRowStyle({
                  display: "grid",
                  gridTemplateColumns: `18px minmax(0, 1fr)${!analysis ? " auto" : ""}${onRemoveSignal ? " 20px" : ""}`,
                  gap: isHeroRow ? 11 : 9,
                  alignItems: isFusionRow ? "start" : "center",
                  padding: isHeroRow ? "13px 12px" : "9px 10px",
                  background: checked ? tokens.color.productSoft : "transparent",
                  cursor: "pointer"
                })}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSignal(signal.signalId)}
                  aria-label={`選取 ${signal.signalId}`}
                  style={{ marginTop: isFusionRow ? 4 : 0 }}
                />
                {analysis ? (
                  <span style={{ minWidth: 0, display: "grid", gap: isHeroRow ? 9 : 7 }}>
                    <ProductSignalEyebrow analysis={analysis} provenance={signal.provenance} />
                    <span
                      data-saved-signal-title="compact"
                      data-product-card-title="true"
                      style={{
                        ...textStyles.h3,
                        color: tokens.color.ink,
                        fontSize: isHeroRow ? 19 : 16,
                        lineHeight: 1.25,
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word"
                      }}
                    >
                      {referenceLabel(analysis)}
                    </span>
                    <span
                      data-product-card-quote="true"
                      style={{
                        ...textStyles.quote,
                        display: "block",
                        margin: 0,
                        color: tokens.color.subInk,
                        fontSize: isHeroRow ? 14 : 13,
                        lineHeight: 1.55,
                        ...lineClamp(isHeroRow ? 3 : 2)
                      }}
                    >
                      {savedRowQuote(signal, analysis)}
                    </span>
                    <ProductSignalKvGrid analysis={analysis} />
                    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                      <ProductSignalMetricStrip descriptor={signal.sourceDescriptor} signalId={signal.signalId} />
                      <ProductVerdictSoftPill verdict={analysis.verdict} />
                    </span>
                  </span>
                ) : (
                  <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                    <span
                      data-saved-signal-title="compact"
                      style={{ ...textStyles.bodyTight, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {rowTitle}
                    </span>
                    <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
                      {rowMeta}
                    </span>
                  </span>
                )}
                {!analysis ? (
                  <Stamp tone={readiness.tone === "success" ? "success" : readiness.tone === "warning" ? "warning" : "neutral"}>{readiness.label}</Stamp>
                ) : null}
                {onRemoveSignal ? (
                  <button
                    type="button"
                    aria-label="移除此訊號"
                    onClick={(e) => { e.preventDefault(); onRemoveSignal(signal.signalId); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 2px", lineHeight: 1, color: tokens.color.softInk, fontSize: 14, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >×</button>
                ) : null}
              </label>
            );
          })}
          {filteredSignals.length === 0 ? (
            <div data-product-saved-empty={activeFilter} style={{ padding: "10px 4px", ...textStyles.meta, color: tokens.color.softInk }}>
              此分類目前沒有訊號。
            </div>
          ) : null}
        </div>
        {filteredSignals.length > SAVED_LIST_VISIBLE_LIMIT ? (
          <button
            type="button"
            data-product-saved-list-toggle={isBounded ? "collapsed" : "expanded"}
            onClick={() => setShowAll((value) => !value)}
            style={{ justifySelf: "start", background: "none", border: "none", cursor: "pointer", padding: "4px 2px", fontSize: 11, fontWeight: 700, color: tokens.color.product, fontFamily: tokens.font.sans }}
          >
            {isBounded ? `顯示全部 ${filteredSignals.length} 則 ▾` : "收起 ▴"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function MergedClassificationSummary({ signals }: { signals: ProductSignalViewModel[] }) {
  const analyzedSignals = signals.filter((signal) => signal.analysis);
  if (!analyzedSignals.length) {
    return null;
  }

  const categoryRows = SIGNAL_TYPE_ORDER.map((type) => ({
    type,
    meta: SIGNAL_TYPE_META[type],
    count: analyzedSignals.filter((signal) => signal.analysis?.signalType === type).length
  })).filter((row) => row.count > 0);
  const maxCount = Math.max(1, ...categoryRows.map((row) => row.count));

  return (
    <section
      data-product-merged-classification="true"
      style={{
        display: "grid",
        gap: 8,
        padding: "10px 12px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.line}`,
        background: tokens.color.neutralSurfaceSoft,
        minWidth: 0
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <Kicker>分類摘要</Kicker>
        <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
          AI 已分類 {analyzedSignals.length} / {signals.length}
        </span>
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {categoryRows.map((row) => (
          <div
            key={row.type}
            data-product-classification-bucket={row.type}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(82px, auto) 34px minmax(80px, 1fr)",
              gap: 8,
              alignItems: "center",
              minWidth: 0
            }}
          >
            <ScorePill color={row.meta.color} soft={row.meta.soft}>{row.meta.label}</ScorePill>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: tokens.color.subInk }}>{row.count}</span>
            <span style={{ height: 5, borderRadius: 999, background: tokens.color.neutralSurface, overflow: "hidden" }}>
              <span style={{ display: "block", width: `${Math.max(8, (row.count / maxCount) * 100)}%`, height: "100%", borderRadius: 999, background: row.meta.color }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecoveredAnalysesBoard({
  analyses,
  signalPreviewById
}: {
  analyses: ProductSignalAnalysis[];
  signalPreviewById: Record<string, string>;
}) {
  if (!analyses.length) {
    return null;
  }

  return (
    <section data-product-recovered-analyses="true" style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle({ gap: 10 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Kicker>已分析資料</Kicker>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{analyses.length} analyses · signal 清單是空的</span>
        </div>
        <div data-scan-list="recovered-product-analyses" style={{ display: "grid" }}>
          {analyses.map((analysis) => {
            const typeMeta = SIGNAL_TYPE_META[analysis.signalType];
            const preview = signalPreviewById[analysis.signalId] || analysis.contentSummary || "已分析資料";
            return (
              <div
                key={analysis.signalId}
                data-recovered-analysis-row="true"
                data-scan-row="true"
                style={scanRowStyle({
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 9,
                  alignItems: "center",
                  padding: "9px 10px"
                })}
              >
                <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                  <span style={{ ...textStyles.bodyTight, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {excerpt(preview, 120)}
                  </span>
                </span>
                <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill>
              </div>
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
  signal: ProductSignalViewModel;
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
      void onSynthesize(signal.signalId, signal.sessionId).then((result) => {
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

function FirstReadingCta({
  signal,
  analysisCount,
  onSynthesize
}: {
  signal: ProductSignalViewModel;
  analysisCount: number;
  onSynthesize: SynthesizeSignalReading;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    if (loading) {
      return;
    }
    setLoading(true);
    setError(null);
    void onSynthesize(signal.signalId, signal.sessionId).then((result) => {
      if (!result.ok) {
        setError(result.error);
      }
      setLoading(false);
    });
  };

  return (
    <section
      data-reading-first-run-cta="true"
      style={{
        display: "grid",
        gap: 8,
        padding: "12px 14px",
        borderRadius: tokens.radius.cardLg,
        border: `1px solid var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`,
        background: `var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`,
        boxShadow: tokens.shadow.topicCard
      }}
    >
      <Kicker>深度判讀 → 匯出</Kicker>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk }}>
        已完成 {analysisCount} 條分析。生成第一份深度判讀後，這裡會變成審核與匯出工作區（Signal Packet／行動簡報）。
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PrimaryButton onClick={handleGenerate} disabled={loading} activateOnPointerDown style={{ padding: "6px 14px", whiteSpace: "nowrap" }}>
          {loading ? "判讀中…" : "生成第一份深度判讀"}
        </PrimaryButton>
        {error ? <span style={{ fontSize: 12, color: tokens.color.queued }}>{error}</span> : null}
      </div>
    </section>
  );
}

function SignalReadingReviewWorkspace({
  signals,
  analyses,
  activeFolderId,
  exportFolders,
  signalReadings,
  signalPreviewById,
  signalUrlById,
  evidenceBySignalId,
  onSynthesizeSignalReading,
  onReviewSignalReading,
  onExportSignalPackets
}: {
  signals: ProductSignalViewModel[];
  analyses: ProductSignalAnalysis[];
  activeFolderId?: string;
  exportFolders?: SignalPacketExportFolderOption[];
  signalReadings: SignalReading[];
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  onReviewSignalReading?: ReviewSignalReading;
  onExportSignalPackets?: ExportSignalPackets;
}) {
  const analysesBySignal = analysisBySignalId(analyses);
  const readingsBySignal = latestReadingBySignalId(signalReadings);
  const firstActiveSignalId = signals.find((signal) => signalReadingReviewState(readingsBySignal.get(signal.signalId)) === "pending")?.signalId
    ?? signals[0]?.signalId
    ?? null;
  const firstActiveAnalysis = firstActiveSignalId ? analysesBySignal.get(firstActiveSignalId) : undefined;
  const initialReviewFilter = firstActiveAnalysis ? verdictFilterKeyForAnalysis(firstActiveAnalysis) : "try";
  const [activeSignalId, setActiveSignalId] = useState<string | null>(firstActiveSignalId);
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<ActionVerdictFilter>(initialReviewFilter);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, SignalReadingReviewState>>({});
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [recentlyFiledSignalId, setRecentlyFiledSignalId] = useState<string | null>(null);
  const [regeneratingSignalId, setRegeneratingSignalId] = useState<string | null>(null);
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
  const pendingCount = signals.filter((signal) => signalReadingReviewState(readingsBySignal.get(signal.signalId)) === "pending").length;
  const analysesForSignals = signals
    .map((signal) => analysesBySignal.get(signal.signalId))
    .filter((analysis): analysis is ProductSignalAnalysis => Boolean(analysis));
  const reviewStats = buildProductActionMacroStats(analysesForSignals);
  const selectedReviewStat = reviewStats.find((stat) => stat.key === selectedReviewFilter) ?? reviewStats[0];
  const visibleReviewSignals = signals.filter((signal) => {
    const analysis = analysesBySignal.get(signal.signalId);
    return analysis ? verdictFilterKeyForAnalysis(analysis) === selectedReviewFilter : false;
  });
  const reviewNoticeForDecision = (decision: SignalReadingReviewDecision) => {
    if (decision === "filed") {
      return "已收錄到本機判讀庫，會保留在 Signal Packet。";
    }
    if (decision === "deferred") {
      return "已標記待看；這則判讀仍保留在本機記錄。";
    }
    return "已退回；這則判讀會保留 feedback 記錄。";
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
  const handleRegenerateReading = (signal: ProductSignalViewModel) => {
    if (!onSynthesizeSignalReading || regeneratingSignalId) {
      return;
    }
    setReviewError(null);
    setRegeneratingSignalId(signal.signalId);
    void onSynthesizeSignalReading(signal.signalId, signal.sessionId, true).then((result) => {
      if (!result.ok) {
        setReviewError(result.error);
      }
      setRegeneratingSignalId(null);
    });
  };
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
              const analysis = analysesBySignal.get(signal.signalId);
              return analysis ? verdictFilterKeyForAnalysis(analysis) === key : false;
            });
            if (target) setActiveSignalId(target.signalId);
          }}
          dataAttrs={{ "data-product-macro-strip": "true" }}
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
            const analysis = analysesBySignal.get(signal.signalId);
            const reading = readingsBySignal.get(signal.signalId);
            const reviewedReading = reading ? readingsWithReview.find((entry) => entry.cacheKey === reading.cacheKey) ?? reading : undefined;
            const reviewState = signalReadingReviewState(reviewedReading);
            const stateTone = SIGNAL_READING_REVIEW_TONES[reviewState];
            const title = analysis?.contentSummary || excerpt(signal.sourcePreview.displayText || signalPreviewById[signal.signalId] || signal.signalId, 96);
            const isActive = activeSignalId === signal.signalId;
            const verdictMeta = analysis ? VERDICT_META[analysis.verdict] : null;
            const typeMeta = analysis ? SIGNAL_TYPE_META[analysis.signalType] : null;
            const sourceUrl = signal.sourcePreview.displayUrl || signalUrlById[signal.signalId] || reading?.sourcePacket?.postUrl || "";
            const sourceHeroText = (signal.sourcePreview.displayText || signalPreviewById[signal.signalId] || "").trim();
            const evidenceCitations = analysis ? citationsForAnalysis(analysis, evidenceBySignalId) : [];
            const staleness = reading
              ? signalReadingStaleness(reading, SIGNAL_READING_PROMPT_VERSION)
              : { stale: false, reasons: [] };
            return (
              <article
                key={signal.signalId}
                data-signal-reading-review-row="true"
                data-signal-reading-filed-flash={recentlyFiledSignalId === signal.signalId ? "true" : undefined}
                className="dlens-card-lift"
                style={{
                  border: `1px solid ${tokens.color.cardEdge}`,
                  borderRadius: tokens.radius.card,
                  background: isActive ? tokens.color.elevated : tokens.color.surface,
                  boxShadow: isActive ? tokens.shadow.raised : tokens.shadow.card,
                  overflow: "hidden",
                  transition: tokens.motion.preset.cardLift,
                  animation: recentlyFiledSignalId === signal.signalId ? tokens.motion.keyframes.successPulse : undefined
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveSignalId(signal.signalId)}
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
                    <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.38, color: tokens.color.ink, ...lineClamp(2) }}>{title}</span>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", ...textStyles.meta, color: tokens.color.softInk }}>
                      {analysis && verdictMeta ? <ScorePill color={verdictMeta.color} soft={verdictMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill> : null}
                      {analysis && typeMeta ? <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{typeMeta.label}</ScorePill> : null}
                      <span>{analysis ? `${referenceTypeLabel(analysis.referenceType)} · ${formatRelevanceScore(analysis.relevance)}` : "尚未分析"}</span>
                      <span>·</span>
                      <span>{reading ? `判讀 ${reading.promptVersion}` : "未生成"}</span>
                    </span>
                  </span>
                  <Stamp tone={stateTone}>{SIGNAL_READING_REVIEW_LABELS[reviewState]}</Stamp>
                </button>
                {isActive ? (
                  <div style={{ borderTop: `1px solid ${tokens.color.line}`, display: "grid", gap: 10, padding: "10px 12px 12px" }}>
                    {sourceHeroText ? (
                      <EvidenceSourceHero
                        tone="product"
                        author={productActionHandle(sourceUrl)}
                        meta={sourceUrl || undefined}
                      >
                        {sourceHeroText}
                      </EvidenceSourceHero>
                    ) : null}
                    {analysis ? (
                      <SignalReadingMarginaliaPanel
                        analysis={analysis}
                      />
                    ) : null}
                    {staleness.stale ? (
                      <div style={mutedPanelStyle({ borderColor: tokens.color.queued, color: tokens.color.queued, fontSize: 12 })}>
                        判讀建議重新生成：{signalReadingStalenessCopy(staleness)}。
                      </div>
                    ) : null}
                    {reading?.reading ? (
                      <SignalReadingBody reading={reading.reading} />
                    ) : (
                      <div style={{ fontSize: 13.5, lineHeight: 1.75, color: tokens.color.subInk }}>
                        尚未生成深度判讀。生成後才能收錄進本地判讀庫。
                      </div>
                    )}
                    {reading ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {onSynthesizeSignalReading ? (
                          <SecondaryButton
                            onClick={() => handleRegenerateReading(signal)}
                            disabled={regeneratingSignalId === signal.signalId}
                            style={{
                              padding: "7px 13px",
                              whiteSpace: "nowrap",
                              position: "relative",
                              overflow: "hidden"
                            }}
                          >
                            {regeneratingSignalId === signal.signalId ? (
                              <>生成中…<ButtonShimmer /></>
                            ) : "重新生成判讀"}
                          </SecondaryButton>
                        ) : null}
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
                    <details data-signal-reading-more="true" style={{ borderTop: `1px solid ${tokens.color.line}`, paddingTop: 10 }}>
                      <summary
                        data-signal-reading-more-summary="true"
                        className="dlens-expand-trigger"
                        style={{ cursor: "pointer", listStyle: "none", display: "inline-flex", alignItems: "center", gap: 6, ...textStyles.fieldLabel, color: tokens.color.softInk }}
                      >
                        <span aria-hidden>▸</span>來源與引用
                      </summary>
                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        <SignalReadingProvenanceRow
                          sourceUrl={sourceUrl}
                          reading={reading}
                          sourceKind={signal.source}
                          captureId={signal.captureId}
                          itemStatus={signal.readiness.itemStatus}
                        />
                        <SignalReadingEvidenceDetails citations={evidenceCitations} />
                      </div>
                    </details>
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
          gap: 12,
          paddingTop: 14,
          borderTop: `1px solid ${tokens.color.line}`
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ ...textStyles.meta, color: tokens.color.product, fontWeight: 850 }}>§ 2</span>
            <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.2, letterSpacing: 0, color: tokens.color.ink }}>PACKET EXPORT</h2>
          </div>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}><BumpNumber value={signals.length} /> signals → packet</span>
        </div>
        <SignalPacketHtmlExportSection
          activeFolderId={activeFolderId}
          exportFolders={exportFolders}
          onExportSignalPackets={onExportSignalPackets}
        />
      </section>
    </div>
  );
}

function SavedSignalsBatchExport({
  signals,
  analyses,
  activeFolderId,
  exportFolders,
  signalPreviewById,
  signalUrlById,
  selectedIds,
  briefMode,
  onBriefModeChange,
  onToggleSignal,
  onSynthesizeSignalReading,
  onExportSignalPackets,
  evidenceBySignalId
}: {
  signals: ProductSignalViewModel[];
  analyses: ProductSignalAnalysis[];
  activeFolderId?: string;
  exportFolders?: SignalPacketExportFolderOption[];
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  selectedIds: string[];
  briefMode: AgentBriefMode;
  onBriefModeChange: (mode: AgentBriefMode) => void;
  onToggleSignal: (signalId: string) => void;
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  onExportSignalPackets?: ExportSignalPackets;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
}) {
  const [copyStatus, setCopyStatus] = useState<AgentBriefCopyStatus>("idle");
  const analysesBySignal = analysisBySignalId(analyses);
  const exportableRows = signals
    .map((signal) => ({ signal, analysis: signal.analysis ?? analysesBySignal.get(signal.signalId) }))
    .filter((row): row is { signal: ProductSignalViewModel; analysis: ProductSignalAnalysis } => Boolean(row.analysis));
  const unanalyzedCount = signals.length - exportableRows.length;
  const selectedSignals = exportableRows
    .filter((row) => selectedIds.includes(row.signal.signalId))
    .map((row) => row.signal);
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
  const selectedBucketCount = new Set(selectedSignals.map((entry) => entry.analysis?.signalType).filter(Boolean)).size;
  const packetModeLabel = briefMode === "original" ? "original_first" : "decision_compact";
  const packetPayloadChars = agentBrief.length;

  return (
    <div data-saved-signals-batch-export="true" style={cardStyle({ gap: 13, borderColor: tokens.color.product, background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.productSoft})` })}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <Kicker>行動簡報匯出</Kicker>
        <Stamp tone={selectedSignals.length ? "accent" : "neutral"}>{selectedSignals.length} 已選</Stamp>
      </div>
      {selectedSignals.length ? (
        <div data-product-packet-ready="true" style={{ display: "grid", gap: 8 }}>
          <div
            data-product-agent-packet-card="ready"
            style={{
              display: "grid",
              gap: 10,
              padding: "12px 14px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.product}`,
              background: tokens.color.surface,
              minWidth: 0
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ ...textStyles.label, color: tokens.color.product, letterSpacing: 0 }}>agent packet</span>
              <span style={{ ...textStyles.metric, color: tokens.color.softInk }}>{selectedSignals.length} readings</span>
              <ProductVerdictSoftPill verdict="try" />
            </div>
            <div
              data-product-agent-packet-block="true"
              style={{
                display: "grid",
                gap: 3,
                padding: "10px 11px",
                borderRadius: tokens.radius.card,
                border: `1px solid ${tokens.color.line}`,
                background: tokens.color.contextSurface,
                color: tokens.color.subInk,
                fontFamily: tokens.font.mono,
                fontSize: 10.5,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere"
              }}
            >
              <span style={{ color: tokens.color.product, fontWeight: 800 }}>agent_packet.ready</span>
              <span data-product-agent-packet-field="signals">signals: {selectedSignals.length}</span>
              <span data-product-agent-packet-field="buckets">buckets: {selectedBucketCount}</span>
              <span data-product-agent-packet-field="mode">mode: {packetModeLabel}</span>
              <span data-product-agent-packet-field="payload">payload_chars: {packetPayloadChars}</span>
              <span data-product-agent-packet-field="formats">formats: html,jsonl</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { id: "html", name: "HTML Reading", desc: "人讀 · 含 quote ladder" },
              { id: "jsonl", name: "JSONL Packet", desc: "agent handoff · 逐行" }
            ].map((format) => (
              <div key={format.id} data-product-format-card={format.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 13px", borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.line}`, background: tokens.color.surface, minWidth: 0 }}>
                <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: tokens.color.ink }}>{format.name}</span>
                  <span style={{ fontSize: 10, color: tokens.color.softInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{format.desc}</span>
                </span>
                <span style={{ marginLeft: "auto", ...textStyles.label, fontFamily: tokens.font.mono, color: tokens.color.success, background: tokens.color.successSoft, padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap" }}>可用</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div data-batch-export-selection-list="true" style={{ display: "grid", borderTop: `1px solid ${tokens.color.line}`, borderBottom: `1px solid ${tokens.color.line}`, maxHeight: 240, overflowY: "auto" }}>
        {exportableRows.map(({ signal, analysis }) => {
          const checked = selectedIds.includes(signal.signalId);
          const typeMeta = SIGNAL_TYPE_META[analysis.signalType];
          return (
            <div key={signal.signalId} style={{ background: checked ? tokens.color.surface : "transparent" }}>
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
                  onChange={() => onToggleSignal(signal.signalId)}
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
                <ScorePill color={typeMeta.color} soft={typeMeta.soft}>{VERDICT_LABELS[analysis.verdict]}</ScorePill>
              </label>
              {checked && onSynthesizeSignalReading ? (
                <SignalReadingDisclosure signal={signal} onSynthesize={onSynthesizeSignalReading} />
              ) : null}
            </div>
          );
        })}
        {unanalyzedCount ? (
          <div
            data-batch-export-unanalysed-summary="true"
            data-scan-row="true"
            style={scanRowStyle({
              display: "grid",
              gridTemplateColumns: "18px minmax(0, 1fr) auto",
              gap: 9,
              alignItems: "center",
              padding: "9px 4px",
              color: tokens.color.softInk
            })}
          >
            <span aria-hidden="true" style={{ textAlign: "center", fontSize: 12 }}>•</span>
            <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
              <span style={{ ...textStyles.bodyTight, color: tokens.color.subInk }}>
                {unanalyzedCount} 個 signal 待分析後可生成 brief
              </span>
              <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>
                先完成分析後再輸出 agent brief。
              </span>
            </span>
            <Stamp tone="neutral">未分析</Stamp>
          </div>
        ) : null}
      </div>
      <div role="radiogroup" aria-label="行動簡報輸出格式" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
              boxShadow: briefMode === value ? PRODUCT_MODE_ACCENT_BUTTON_SHADOW : "none",
              color: briefMode === value ? tokens.color.inverse : tokens.color.subInk,
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
      <PrimaryButton onClick={copyBrief} disabled={!selectedSignals.length}>複製行動簡報</PrimaryButton>
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
      <SignalPacketHtmlExportSection
        activeFolderId={activeFolderId}
        exportFolders={exportFolders}
        onExportSignalPackets={onExportSignalPackets}
        embedded
      />
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
    <div data-product-classification-board="true" style={{ display: "grid", gap: 12, paddingBottom: 76, minWidth: 0, overflow: "hidden" }}>
      <section style={cardStyle({ gap: 10 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <Kicker>分類構成</Kicker>
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>AI 已分類 {analyses.length} 則訊號</span>
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

      <div data-product-classification-layout="responsive" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.12fr) minmax(0, 0.88fr)", gap: 14, alignItems: "start", minWidth: 0 }}>
        <section data-scan-list="product-classification" style={{ display: "grid", minWidth: 0, overflow: "hidden" }}>
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

function buildProductActionMacroStats(analyses: ProductSignalAnalysis[]): VerdictFilterStat[] {
  const tryCount = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "try").length;
  const parkCount = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "park").length;
  const insufficientCount = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "insufficient").length;
  const watchCount = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "watch").length;
  return [
    { key: "try", ...VERDICT_META.try, label: "信號重試", count: tryCount },
    { key: "park", ...VERDICT_META.park, label: "噪音不符", count: parkCount },
    { key: "insufficient", ...VERDICT_META.insufficient_data, count: insufficientCount },
    { key: "watch", ...VERDICT_META.watch, count: watchCount }
  ];
}

/** Four verdict tiles over a shared selection plate that slides between them. */
function VerdictFilterTiles({
  stats,
  selectedKey,
  onSelect,
  dataAttrs
}: {
  stats: VerdictFilterStat[];
  selectedKey: ActionVerdictFilter;
  onSelect: (key: ActionVerdictFilter) => void;
  dataAttrs?: Record<string, string>;
}) {
  const count = stats.length;
  const selectedIndex = Math.max(0, stats.findIndex((stat) => stat.key === selectedKey));
  const active = stats[selectedIndex];
  return (
    <div
      data-verdict-filter-tiles="true"
      {...dataAttrs}
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
          boxShadow: tokens.shadow.activeTab,
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

function isExcludedActionSignal(analysis: ProductSignalAnalysis): boolean {
  return analysis.verdict === "park" || analysis.signalType === "noise";
}

function productActionHandle(url: string | undefined): string {
  const match = url?.match(/@([A-Za-z0-9_.]+)/);
  return match ? `@${match[1]}` : "原文";
}

/* Frame 03 lead — original post quote first (SourceHero), analysis demoted to faint chips. */
function ProductActionBriefLead({
  analysis,
  sourceText,
  sourceUrl
}: {
  analysis: ProductSignalAnalysis;
  sourceText: string;
  sourceUrl?: string;
}) {
  const chips: Array<{ label: string; value: string }> = [
    { label: "分類", value: SIGNAL_TYPE_LABELS[analysis.signalType] }
  ];
  if (analysis.signalSubtype) {
    chips.push({ label: "子型", value: formatSubtype(analysis.signalSubtype) });
  }
  const reference = analysis.referenceLabel?.trim() || referenceTypeLabel(analysis.referenceType);
  if (reference) {
    chips.push({ label: "對到", value: reference });
  }
  chips.push({ label: "相關度", value: formatRelevanceScore(analysis.relevance) });

  return (
    <div data-product-action-lead="true" style={{ display: "grid", gap: 10, padding: "16px 18px 0" }}>
      <EvidenceSourceHero tone="product" author={productActionHandle(sourceUrl)} meta={sourceUrl || undefined}>
        {sourceText}
      </EvidenceSourceHero>
      <div data-product-action-faint-chips="true" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: tokens.color.softInk }}>分析</span>
        {chips.map((chip) => (
          <span
            key={chip.label}
            style={{ fontSize: 10, color: tokens.color.softInk, padding: "1.5px 8px", borderRadius: 99, border: `1px solid ${tokens.color.line}`, background: tokens.color.neutralSurfaceSoft }}
          >
            {chip.label} <b style={{ color: tokens.color.subInk, fontWeight: 500 }}>{chip.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionableItemCard({
  analysis,
  index,
  evidenceBySignalId,
  historicalAnalyses,
  agentTaskFeedback,
  onRemove,
  layout = "verdict",
  readiness = DEFAULT_PRODUCT_ACTION_READINESS,
  sourceText,
  sourceUrl
}: {
  analysis: ProductSignalAnalysis;
  index: number;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  onRemove?: () => void;
  layout?: ActionableItemCardLayout;
  readiness?: SignalReadiness;
  sourceText?: string;
  sourceUrl?: string;
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
  const excluded = isExcludedActionSignal(analysis);
  const primaryActionCard = index === 0;
  const baseActionCardShadow = primaryActionCard ? tokens.shadow.raised : tokens.shadow.card;

  if (excluded) {
    return (
      <article
        className="dlens-card-lift"
        data-dlens-motion-card="true"
        data-product-action-card="exclusion"
        data-product-action-card-primary={primaryActionCard ? "true" : "false"}
        data-exclusion-card="true"
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        style={cardStyle({
          gap: 14,
          padding: 18,
          minWidth: 0,
          borderColor: cardHovered ? tokens.color.lineStrong : tokens.color.line,
          boxShadow: cardHovered
            ? tokens.shadow.productActionCardHover
            : baseActionCardShadow,
          overflow: "hidden",
          transform: cardHovered ? "translateY(-2px)" : undefined
        })}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <span
                data-dlens-number-badge="true"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  display: "inline-grid",
                  placeItems: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: tokens.color.subInk,
                  background: tokens.color.neutralSurface,
                  border: `1px solid ${tokens.color.lineStrong}`,
                  fontFamily: tokens.font.serifCjk,
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                {index + 1}
              </span>
              <ScorePill color={tokens.color.neutralText} soft={tokens.color.neutralSurfaceSoft}>
                {VERDICT_META[analysis.verdict]?.label ?? VERDICT_LABELS[analysis.verdict]}
              </ScorePill>
              <ProductReadinessChip readiness={readiness} />
              <span style={{ fontSize: 11.5, color: tokens.color.softInk }}>{SIGNAL_TYPE_LABELS[analysis.signalType]}</span>
              <span style={{ fontSize: 11.5, color: tokens.color.softInk }}>{formatRelevanceScore(analysis.relevance)}</span>
            </div>
            <h3 style={{ margin: 0, fontSize: 22, lineHeight: 1.25, color: tokens.color.ink, fontWeight: 760, fontFamily: tokens.font.serifCjk }}>
              不納入行動清單
            </h3>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: tokens.color.subInk }}>
              {analysis.contentSummary}
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

        <div style={mutedPanelStyle({ gap: 7, background: tokens.color.neutralSurfaceSoft })}>
          <div style={{ ...textStyles.label, color: tokens.color.softInk }}>排除原因</div>
          <div style={{ fontSize: 13, lineHeight: 1.65, color: tokens.color.subInk }}>
            {analysis.reason || referenceTakeaway(analysis)}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ ...textStyles.fieldLabel, color: tokens.color.softInk }}>{referenceTypeLabel(analysis.referenceType)}</span>
            <span style={{ fontSize: 13, lineHeight: 1.55, color: tokens.color.ink, fontWeight: 650 }}>{referenceLabel(analysis)}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: tokens.color.subInk }}>{referenceTakeaway(analysis)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: tokens.color.softInk }}>
            <span>子型：{formatSubtype(analysis.signalSubtype)}</span>
            <span>證據：{citationCount} 則</span>
            <span>Analyzed：{formatAnalyzedAt(analysis.analyzedAt)}</span>
          </div>
        </div>

        {citations.length ? (
          <div style={{ display: "grid", gap: 7 }}>
            <span data-evidence-section-label="true" style={{ ...textStyles.label, color: tokens.color.softInk }}>
              原文證據 · {citationCount} 則
            </span>
            {citations.slice(0, 3).map((citation) => (
              <div key={citation.ref} style={{ display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>{citation.ref}.</span>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk }}>
                  {citationText(citation, 220)}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  if (layout === "marginalia") {
    return (
      <article
        className="dlens-card-lift"
        data-dlens-motion-card="true"
        data-product-action-card="marginalia"
        data-product-action-card-primary={primaryActionCard ? "true" : "false"}
        data-marginalia-layout="true"
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        style={cardStyle({
          gap: 0,
          padding: 0,
          minWidth: 0,
          borderColor: cardHovered ? tokens.color.lineStrong : tokens.color.line,
          boxShadow: cardHovered
            ? tokens.shadow.productActionCardHoverStrong
            : baseActionCardShadow,
          overflow: "hidden",
          transform: cardHovered ? "translateY(-2px)" : undefined,
        })}
      >
        <div data-product-action-card-grid="responsive" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(132px, 168px)", minWidth: 0 }}>
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
              <ProductReadinessChip readiness={readiness} />
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
                {formatActionCue(analysis.verdict)}
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
            data-product-drawer-accent-rail="true"
            style={{
              background: `linear-gradient(180deg, ${PRODUCT_MODE_ACCENT_SOFT}, ${tokens.color.contextSurface})`,
              borderLeft: `3px solid ${PRODUCT_MODE_ACCENT}`,
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
              <span style={{ fontSize: 10, fontWeight: 850, letterSpacing: "0.06em" }}>任務 ›</span>
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
      data-product-action-card="verdict"
      data-product-action-card-primary={primaryActionCard ? "true" : "false"}
      data-verdict-layout="true"
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
      style={cardStyle({
        gap: 18,
        padding: 0,
        minWidth: 0,
        borderColor: cardHovered ? tokens.color.lineStrong : tokens.color.line,
        boxShadow: cardHovered
          ? tokens.shadow.productActionCardHoverStrong
          : baseActionCardShadow,
        overflow: "hidden",
        transform: cardHovered ? "translateY(-2px)" : undefined,
      })}
    >
      {sourceText?.trim() ? (
        <ProductActionBriefLead analysis={analysis} sourceText={sourceText.trim()} sourceUrl={sourceUrl} />
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.95fr) minmax(0, 2fr)", alignItems: "stretch" }}>
        <aside
          data-testid="verdict-panel"
          style={{
            background: verdictPanelColor,
            color: tokens.color.inverse,
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
                color: tokens.color.inverseStrong,
                background: tokens.color.inverseWash,
                border: `1px solid ${tokens.color.inverseBorder}`,
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
                style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 850, color: tokens.color.inverse, fontFamily: tokens.font.serifCjk }}
              >
                {VERDICT_LABELS[analysis.verdict]}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.35, color: tokens.color.inverseSoft, fontWeight: 700 }}>
                {analysis.verdict === "try" ? "可排入小實驗" : "先不要推進成實驗"}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <RelevanceBars score={analysis.relevance} />
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10.5, lineHeight: 1.2, textTransform: "uppercase", letterSpacing: "0.04em", color: tokens.color.inverseMuted, fontWeight: 800 }}>
                訊號類型
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.3, color: tokens.color.inverse, fontWeight: 800 }}>
                {SIGNAL_TYPE_LABELS[analysis.signalType]}
              </span>
            </div>
          </div>
        </aside>
        <div style={{ minWidth: 0, display: "grid", gap: 14, padding: "24px 22px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
              <ProductReadinessChip readiness={readiness} />
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
            <span>子型：{formatSubtype(analysis.signalSubtype)}</span>
            <span>·</span>
            <span>Analyzed：{formatAnalyzedAt(analysis.analyzedAt)}</span>
            <span>·</span>
            <span>Prompt：{analysis.promptVersion}</span>
          </div>
        </div>
      </div>
      <EvidenceUseCaseList citations={citations} />
      <details data-product-action-more="true" style={{ margin: "0 22px 18px", borderTop: `1px solid ${tokens.color.line}`, paddingTop: 12 }}>
        <summary
          data-product-action-more-summary="true"
          className="dlens-expand-trigger"
          style={{ cursor: "pointer", listStyle: "none", display: "inline-flex", alignItems: "center", gap: 6, ...textStyles.fieldLabel, color: tokens.color.softInk }}
        >
          <span aria-hidden>▸</span>更多分析 · 任務與類似歷史
        </summary>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div
            data-testid="task-slot"
            style={{ borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.product}`, background: tokens.color.productSoft, padding: "10px 11px", display: "grid", gap: 4 }}
          >
            <span style={{ ...textStyles.fieldLabel, color: tokens.color.product }}>Task</span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: tokens.color.ink, fontWeight: 650 }}>{taskSlotCopy}</span>
          </div>
          <SimilarHistoryBlock items={similarHistory} />
        </div>
      </details>
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
  signalReadinessById,
  historicalAnalyses,
  agentTaskFeedback,
  cardLayout,
  signalPreviewById,
  signalUrlById,
  onRemoveSignal
}: {
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  signalReadinessById: Record<string, SignalReadiness>;
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  cardLayout: ProductSignalCardLayout;
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  onRemoveSignal?: (signalId: string) => void;
}) {
  const [selectedFilter, setSelectedFilter] = useState<ActionVerdictFilter>("try");
  const tryItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "try").sort((a, b) => b.relevance - a.relevance);
  const parkItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "park");
  const insufficientItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "insufficient");
  const watchItems = analyses.filter((analysis) => verdictFilterKeyForAnalysis(analysis) === "watch");
  const stats = buildProductActionMacroStats(analyses);
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
        <VerdictFilterTiles
          stats={stats}
          selectedKey={selectedFilter}
          onSelect={setSelectedFilter}
          dataAttrs={{ "data-product-macro-strip": "true" }}
        />
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
            readiness={signalReadinessById[analysis.signalId] ?? DEFAULT_PRODUCT_ACTION_READINESS}
            sourceText={signalPreviewById[analysis.signalId]}
            sourceUrl={signalUrlById[analysis.signalId]}
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
  ActionableItemCard,
  SavedSignalsBatchExport,
  createSignalReadingDisplayCopy
};

export function ProductSignalView({
  viewModel,
  onCommand,
  exportFolders = []
}: {
  viewModel: ProductSignalWorkspaceViewModel;
  onCommand: (command: ProductSignalCommand) => Promise<unknown> | unknown;
  exportFolders?: SignalPacketExportFolderOption[];
}) {
  const {
    kind,
    signals,
    scopedAnalyses,
    historicalAnalyses,
    agentTaskFeedback,
    signalPreviewById,
    signalUrlById,
    evidenceBySignalId,
    scopedSignalReadings,
    pendingSignals
  } = viewModel;
  const copy = PAGE_COPY[kind];
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [briefMode, setBriefMode] = useState<AgentBriefMode>("original");

  const dispatchCommand = (command: ProductSignalCommand) => Promise.resolve(onCommand(command));
  const analyzeCommand = viewModel.actions.find((action) => action.kind === "analyzeInbox");
  const openActionableCommand = viewModel.actions.find((action) => action.kind === "openActionable");
  const hasReadingCommand = signals.some((signal) => signal.actions.some((action) => action.kind === "generateReading"));
  const pendingErrorAggregate = summarizeProcessingErrorAggregate(pendingSignals);

  function toggleSelectedSignal(signalId: string) {
    setSelectedSignalIds((current) =>
      current.includes(signalId)
        ? current.filter((id) => id !== signalId)
        : [...current, signalId]
    );
  }

  function signalAction(signalId: string, kind: ProductSignalAction["kind"]): ProductSignalAction | null {
    return signals.find((signal) => signal.signalId === signalId)?.actions.find((action) => action.kind === kind) ?? null;
  }

  function handleAnalyze() {
    if (analyzeCommand) {
      void dispatchCommand(analyzeCommand);
    }
  }

  function handleGoToActionable() {
    if (openActionableCommand) {
      void dispatchCommand(openActionableCommand);
    }
  }

  function handleRemoveSignal(signalId: string) {
    if (!window.confirm("確認刪除此 signal？此操作無法復原。")) return;
    const action = signalAction(signalId, "remove");
    if (!action) return;
    setSelectedSignalIds((current) => current.filter((id) => id !== signalId));
    void dispatchCommand({ kind: "remove", target: action.target });
  }

  const synthesizeSignalReading: SynthesizeSignalReading | undefined = hasReadingCommand
    ? (signalId, sessionId, force) => {
        const action = signalAction(signalId, "generateReading");
        if (!action || action.target.sessionId !== sessionId) {
          return Promise.resolve({ ok: false, error: "這則 signal 目前尚未可生成判讀。" });
        }
        return dispatchCommand({ kind: "generateReading", target: action.target, force }) as Promise<{ ok: true; reading: string } | { ok: false; error: string }>;
      }
    : undefined;

  const reviewSignalReading: ReviewSignalReading = (cacheKey, decision, note) => {
    const reading = scopedSignalReadings.find((entry) => entry.cacheKey === cacheKey);
    if (!reading || !viewModel.sessionId) {
      return Promise.resolve({ ok: false, error: "找不到這筆 signal reading。" });
    }
    return dispatchCommand({
      kind: "reviewReading",
      target: { sessionId: viewModel.sessionId, signalId: reading.signalId, cacheKey },
      decision,
      ...(note ? { note } : {})
    }) as Promise<{ ok: true; signalReading: SignalReading } | { ok: false; error: string }>;
  };

  const exportSignalPackets: ExportSignalPackets | undefined = viewModel.actions.some((action) => action.kind === "exportSignalPackets")
    ? (options) =>
        dispatchCommand({
          kind: "exportSignalPackets",
          target: { sessionId: options.sessionId },
          format: options.format
        }) as Promise<{ ok: true; exportResult: SignalPacketExportResult } | { ok: false; error: string }>
    : undefined;

  return (
    <div style={viewRootStyle()} data-product-signal-view={kind} data-product-load-state={viewModel.loadState}>
      <style>{SCAN_ROW_HOVER_CSS}</style>
      <ModeHeader
        mode={kind}
        kicker="Product mode"
        title={copy.title}
        deck={copy.deck}
        stamp={
          viewModel.statusErrorLabel
            ? <Stamp tone="warning">{viewModel.statusErrorLabel}</Stamp>
            : viewModel.loadState === "loading"
              ? <Stamp tone="neutral">讀取中</Stamp>
            : <Stamp tone={viewModel.loadState === "ready" || viewModel.loadState === "recovering" ? "success" : "neutral"}>
                {viewModel.loadState === "ready" || viewModel.loadState === "recovering" ? "分析完成" : "尚無結果"}
              </Stamp>
        }
      />
      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md, overflow: "visible" }}>
        <ReadinessPanel
          viewModel={viewModel}
          onAnalyze={handleAnalyze}
        />
        {pendingSignals.length && kind !== "saved-signals" ? (
          kind === "actionable-filter" ? (
            <section style={{ display: "grid", gap: 8 }}>
              <PendingSignalsQueueSummary signals={pendingSignals} />
              {pendingErrorAggregate ? <ProcessingErrorAggregateBanner summary={pendingErrorAggregate} /> : null}
            </section>
          ) : (
            <section style={{ display: "grid", gap: 8 }}>
              <Kicker>等待處理的 signals</Kicker>
              {pendingErrorAggregate ? <ProcessingErrorAggregateBanner summary={pendingErrorAggregate} /> : null}
              {pendingSignals.map((signal) => (
                <PendingSignalCard
                  key={signal.signalId}
                  signal={signal}
                  onRemove={signal.actions.some((action) => action.kind === "remove") ? () => handleRemoveSignal(signal.signalId) : undefined}
                  suppressTerminalDetail={pendingErrorAggregate?.errorClass === readinessLabel(signal.readiness).errorClass}
                />
              ))}
            </section>
          )
        ) : null}
        {kind === "saved-signals" && scopedAnalyses.length > 0 && !viewModel.isAnalyzing && openActionableCommand ? (
          <div
            data-product-action-cta="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: tokens.radius.cardLg,
              border: `1px solid var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`,
              background: `var(--dlens-mode-accent-soft, ${tokens.color.productSoft})`,
              boxShadow: tokens.shadow.topicCard
            }}
          >
            <span style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.4 }}>
              分析完成，查看哪些 signal 值得行動
            </span>
            <PrimaryButton onClick={handleGoToActionable} activateOnPointerDown style={{ padding: "6px 14px", whiteSpace: "nowrap" }}>
              查看候選行動 →
            </PrimaryButton>
          </div>
        ) : null}
        {kind === "saved-signals" ? (
          viewModel.loadState === "recovering" ? (
            <RecoveredAnalysesBoard
              analyses={scopedAnalyses}
              signalPreviewById={signalPreviewById}
            />
          ) : (
            <>
              <SavedSignalsBoard
                signals={signals}
                pendingSignals={pendingSignals}
                pendingErrorAggregate={pendingErrorAggregate}
                selectedIds={selectedSignalIds}
                onToggleSignal={toggleSelectedSignal}
                onRemoveSignal={signals.some((signal) => signal.actions.some((action) => action.kind === "remove")) ? handleRemoveSignal : undefined}
                onAnalyze={handleAnalyze}
              />
              {scopedAnalyses.length ? (
                <SavedSignalsBatchExport
                  signals={signals}
                  analyses={scopedAnalyses}
                  activeFolderId={viewModel.sessionId ?? undefined}
                  exportFolders={exportFolders}
                  signalPreviewById={signalPreviewById}
                  signalUrlById={signalUrlById}
                  selectedIds={selectedSignalIds}
                  briefMode={briefMode}
                  onBriefModeChange={setBriefMode}
                  onToggleSignal={toggleSelectedSignal}
                  onSynthesizeSignalReading={synthesizeSignalReading}
                  onExportSignalPackets={exportSignalPackets}
                  evidenceBySignalId={evidenceBySignalId}
                />
              ) : null}
            </>
          )
        ) : scopedAnalyses.length ? (
          kind === "classification" ? (
            <ClassificationBoard analyses={scopedAnalyses} signalPreviewById={signalPreviewById} />
          ) : viewModel.showSignalReadingReview ? (
            <SignalReadingReviewWorkspace
              signals={signals}
              analyses={scopedAnalyses}
              activeFolderId={viewModel.sessionId ?? undefined}
              exportFolders={exportFolders}
              signalReadings={scopedSignalReadings}
              signalPreviewById={signalPreviewById}
              signalUrlById={signalUrlById}
              evidenceBySignalId={evidenceBySignalId}
              onSynthesizeSignalReading={synthesizeSignalReading}
              onReviewSignalReading={reviewSignalReading}
              onExportSignalPackets={exportSignalPackets}
            />
          ) : (
            <>
              {viewModel.firstSynthesizableSignal && synthesizeSignalReading ? (
                <FirstReadingCta
                  signal={viewModel.firstSynthesizableSignal}
                  analysisCount={scopedAnalyses.length}
                  onSynthesize={synthesizeSignalReading}
                />
              ) : null}
              <ActionableInsightsBoard
                analyses={scopedAnalyses}
                productProfile={viewModel.productProfile}
                evidenceBySignalId={evidenceBySignalId}
                signalReadinessById={viewModel.signalReadinessById}
                historicalAnalyses={historicalAnalyses}
                agentTaskFeedback={agentTaskFeedback}
                cardLayout={viewModel.cardLayout}
                signalPreviewById={viewModel.signalPreviewById}
                signalUrlById={viewModel.signalUrlById}
                onRemoveSignal={signals.some((signal) => signal.actions.some((action) => action.kind === "remove")) ? handleRemoveSignal : undefined}
              />
            </>
          )
        ) : viewModel.loadState === "loading" ? null : (
          <div style={cardStyle()}>
            <div style={{ fontSize: 14, fontWeight: 800, color: tokens.color.ink }}>
              尚未有 AI 分析結果
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
              這裡只顯示 storage 裡的真實分析；如果 AI 尚未跑完，不會顯示假分類、假數字或示範案例。
            </div>
            <div>
              <SecondaryButton onClick={handleAnalyze} disabled={!viewModel.canAnalyze || viewModel.isAnalyzing}>
                重新整理分析
              </SecondaryButton>
            </div>
          </div>
        )}
      </WorkspaceSurface>
    </div>
  );
}
