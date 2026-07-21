import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Activity, Quote } from "lucide-react";

import type {
  ProductSignalAnalysis,
  ProductSignalEvidenceNote,
  ProductSignalReferenceTarget,
  ProductSignalReferenceType,
  ProductSignalType,
  ProductSignalVerdict
} from "../state/types";
import { isProductContextSourceReady } from "../compare/product-context";
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
import {
  EvidenceSourceHero,
  Kicker,
  MetricIcon,
  ModeHeader,
  PrimaryButton,
  SCAN_ROW_HOVER_CSS,
  SecondaryButton,
  SectionHeader,
  Stamp,
  lineClamp,
  scanRowStyle,
  surfaceCardStyle,
  viewRootStyle
} from "./components";
import { useUiText } from "./i18n";
import { modeThemes, tokens, textStyles } from "./tokens";
import { useCausalListMotion } from "./useCausalListMotion";

export type ProductSignalPageKind = "saved-signals" | "classification" | "actionable-filter";

/* DLENS_MOTION_CSS now lives in ./motion (the single motion owner). Re-exported
 * here so the threads content script and existing imports/tests keep working. */
export { DLENS_MOTION_CSS } from "./motion";

const PAGE_COPY: Record<ProductSignalPageKind, { title: string; titleEn: string; deck: string; deckEn: string }> = {
  "saved-signals": {
    title: "已存訊號",
    titleEn: "Saved signals",
    deck: "先確認已儲存的 Threads post 是否完成抓取，再到行動頁整理可試 workflow。",
    deckEn: "Confirm the saved Threads posts finished crawling, then head to Actions to shape a workflow to try."
  },
  classification: {
    title: "分類整理",
    titleEn: "Classify",
    deck: "先把每則 Threads signal 放回正確範疇，再決定是否值得產品團隊處理。",
    deckEn: "Sort each Threads signal back into the right category, then decide if it's worth the product team's time."
  },
  "actionable-filter": {
    title: "行動簡報",
    titleEn: "Action brief",
    deck: "先審視模型判讀，再把已收錄 reading 組成可貼給 coding agent 的 brief。",
    deckEn: "Review the model's read, then compose the collected readings into a brief you can paste to a coding agent."
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

type ActionVerdictFilter = "try" | "watch" | "park" | "insufficient";

const ACTION_VERDICT_VISUAL_ORDER: ActionVerdictFilter[] = ["try", "park", "insufficient", "watch"];
const ACTION_VERDICT_DEFAULT_PRIORITY: ActionVerdictFilter[] = ["try", "watch", "park", "insufficient"];
const PRODUCT_ACTION_STAGE_PANEL_ID = "product-action-stage-panel";

function actionVerdictTabId(key: ActionVerdictFilter): string {
  return `product-action-verdict-${key}-tab`;
}

function verdictFilterKeyForAnalysis(analysis: ProductSignalAnalysis): ActionVerdictFilter {
  if (analysis.signalType === "noise" || analysis.verdict === "park") return "park";
  if (analysis.verdict === "insufficient_data") return "insufficient";
  return analysis.verdict;
}

const REASON_PANEL_LABEL: Record<ProductSignalVerdict, string> = {
  try: "實驗切入",
  watch: "觀察原因",
  park: "排除原因",
  insufficient_data: "資料缺口"
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

type AgentBriefCopyStatus = "idle" | "copied" | "error";

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
      return { label: "可分析", detail: "已有可用正文，可以執行 ProductSignalAnalyzer。", tone: "success" };
    case "missing_content":
      return { label: "未抽到正文", detail: "抓取完成但未抽到正文或留言。請重新處理，或回原貼確認 Threads 頁面是否可讀。", tone: "warning" };
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

const PRODUCT_SIGNAL_METRIC_KEYS: Array<keyof Pick<TargetDescriptor["engagement_present"], "likes" | "comments" | "reposts" | "forwards">> = [
  "likes",
  "comments",
  "reposts",
  "forwards"
];

const PRODUCT_SOURCE_TRUTH_LABELS: Record<(typeof PRODUCT_SIGNAL_METRIC_KEYS)[number], string> = {
  likes: "讚",
  comments: "回覆",
  reposts: "轉發",
  forwards: "分享"
};

function ProductSourceTruthStrip({
  analysis,
  descriptor,
  evidenceBySignalId,
  signalId
}: {
  analysis?: ProductSignalAnalysis;
  descriptor?: TargetDescriptor;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  signalId: string;
}) {
  const citations = analysis ? citationsForAnalysis(analysis, evidenceBySignalId) : [];
  const firstCitation = citations[0];
  const evidenceValue = firstCitation
    ? `${firstCitation.ref}${citations.length > 1 ? ` +${citations.length - 1}` : ""}`
    : "證據 ref 未提供";
  const metrics = PRODUCT_SIGNAL_METRIC_KEYS.map((key) => {
    const present = Boolean(descriptor?.engagement_present[key]) && Number.isFinite(descriptor?.engagement[key]);
    const value = present ? String(descriptor?.engagement[key]) : "未讀";
    return { key, value, label: PRODUCT_SOURCE_TRUTH_LABELS[key] };
  });
  const totalExact = PRODUCT_SIGNAL_METRIC_KEYS.every((key) => (
    Boolean(descriptor?.engagement_present[key]) && Number.isFinite(descriptor?.engagement[key])
  ));
  const total = totalExact
    ? PRODUCT_SIGNAL_METRIC_KEYS.reduce((sum, key) => sum + (descriptor?.engagement[key] ?? 0), 0)
    : "未讀";

  return (
    <span
      data-product-source-truth={signalId}
      role="group"
      aria-label="來源真相"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.spacing.xs,
        minWidth: 0,
        flexWrap: "wrap"
      }}
    >
      <span
        data-product-source-truth-metric="evidence"
        aria-label={firstCitation ? `證據 ref ${evidenceValue}` : evidenceValue}
        title={firstCitation ? `證據 ref ${evidenceValue}` : evidenceValue}
        style={sourceTruthMetricStyle(Boolean(firstCitation))}
      >
        <Quote aria-hidden size={12} strokeWidth={1.6} />
        <span>{evidenceValue}</span>
      </span>
      {metrics.map((metric) => (
        <span
          key={metric.key}
          data-product-source-truth-metric={metric.key}
          aria-label={`${metric.label} ${metric.value}`}
          title={`${metric.label} ${metric.value}`}
          style={sourceTruthMetricStyle(metric.value !== "未讀")}
        >
          <span aria-hidden><MetricIcon kind={metric.key} size={12} /></span>
          <span>{metric.value}</span>
        </span>
      ))}
      <span
        data-product-source-truth-metric="total"
        aria-label={`總互動 ${total}`}
        title={`總互動 ${total}`}
        style={sourceTruthMetricStyle(totalExact)}
      >
        <Activity aria-hidden size={12} strokeWidth={1.6} />
        <span>{total}</span>
      </span>
    </span>
  );
}

function sourceTruthMetricStyle(present: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacing.xs,
    minHeight: 20,
    padding: `${tokens.spacing.xs - 1}px ${tokens.spacing.sm}px`,
    borderRadius: tokens.radius.pill,
    border: `1px solid ${present ? tokens.color.cardEdge : tokens.color.glassBorder}`,
    background: present ? tokens.color.neutralSurfaceSoft : tokens.color.contextSurface,
    color: present ? tokens.color.subInk : tokens.color.softInk,
    fontFamily: tokens.font.mono,
    fontSize: 10,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1
  };
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

/** Translucent workspace glass for marquee product cards — same material as the
 *  atlas/readiness surfaces, so the action stage and inbox read as one system
 *  instead of flat opaque panels. */
function glassCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    display: "grid",
    gap: 9,
    padding: "12px 13px",
    borderRadius: tokens.radius.cardLg,
    border: `1px solid ${tokens.color.atlasEdge}`,
    background: tokens.color.atlasPaper,
    boxShadow: tokens.shadow.atlasCard,
    backdropFilter: tokens.effect.atlasBlur,
    WebkitBackdropFilter: tokens.effect.atlasBlur,
    ...extra
  };
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

/** Marquee readiness strip — the same workspaceGlass hero material as the Collect capture stage. */
function heroPanelStyle(extra?: CSSProperties): CSSProperties {
  return {
    display: "grid",
    gap: 9,
    padding: "12px 14px",
    borderRadius: tokens.radius.cardLg,
    border: `1px solid ${tokens.color.atlasEdge}`,
    background: tokens.color.atlasPaper,
    boxShadow: tokens.shadow.atlasCard,
    backdropFilter: tokens.effect.atlasBlur,
    WebkitBackdropFilter: tokens.effect.atlasBlur,
    ...extra
  };
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
      data-product-pending-card="topic-card"
      data-dlens-presence="card"
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
      data-dlens-presence="card"
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
        data-dlens-presence="card"
        style={heroPanelStyle({
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
        data-dlens-presence="card"
        style={heroPanelStyle({
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
    <div data-dlens-presence="card" style={heroPanelStyle({ gap: hasResults ? 8 : 10 })}>
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
      data-scan-action="true"
      data-dlens-list-key={analysis.signalId}
      data-dlens-presence="row"
      className="dlens-tactile-row"
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
    <aside data-product-selected-aside="true" data-dlens-presence="card" style={cardStyle({ gap: 11, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" })}>
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

type SignalReadingEvidenceDisplay = {
  citation: EvidenceCitation;
  kind: "source" | "analysis-note";
  text: string;
};

function SignalReadingEvidenceDetails({ citations }: { citations: EvidenceCitation[] }) {
  const visibleCitations = citations.flatMap<SignalReadingEvidenceDisplay>((citation) => {
    const sourceText = citation.entry?.text?.trim();
    if (sourceText) {
      return [{ citation, kind: "source" as const, text: sourceText }];
    }
    const noteText = citation.note?.quoteSummary?.trim();
    if (noteText) {
      return [{ citation, kind: "analysis-note" as const, text: noteText }];
    }
    return [];
  });
  if (!visibleCitations.length) {
    return null;
  }
  const sourceCount = visibleCitations.filter((item) => item.kind === "source").length;
  const noteCount = visibleCitations.length - sourceCount;
  const summaryLabel = [
    sourceCount ? `來源引用 ${sourceCount} 則` : "",
    noteCount ? `AI 摘要 ${noteCount} 則${sourceCount ? "" : "（非逐字引文）"}` : ""
  ].filter(Boolean).join(" · ");

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
          <span>{summaryLabel}</span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
            {visibleCitations.map(({ citation, kind, text }) => {
              const author = citation.entry?.author || "來源作者未提供";
              const likeFragment = citation.entry?.likeCount != null ? ` · ${citation.entry.likeCount}♥` : "";
              const tooltip = kind === "source"
                ? `${author}${likeFragment}\n${text}`.slice(0, 280)
                : `AI 摘要（非逐字引文）\n${text}`.slice(0, 280);
              return (
                <span
                  key={citation.ref}
                  data-signal-reading-evidence-chip={citation.ref}
                  data-signal-reading-evidence-kind={kind}
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
        {visibleCitations.map(({ citation, kind, text }) => {
          return (
            <div
              key={citation.ref}
              data-signal-reading-evidence-row="true"
              data-signal-reading-evidence-kind={kind}
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
                  {kind === "source" && citation.entry?.author ? <span style={{ fontWeight: 400 }}> · {citation.entry.author}</span> : null}
                  {kind === "analysis-note" ? <span style={{ fontWeight: 400 }}> · AI 摘要（非逐字引文）</span> : null}
                </span>
                {kind === "source" && citation.entry?.likeCount != null ? (
                  <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>{citation.entry.likeCount} ♥</span>
                ) : null}
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk, overflowWrap: "anywhere" }}>
                {text || "—"}
              </p>
              {citation.note?.whyItMatters ? (
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: tokens.color.softInk }}>
                  {kind === "source" ? "AI 判讀：" : "判讀用途："}{citation.note.whyItMatters}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </SmoothDetails>
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
      data-dlens-presence={embedded ? undefined : "card"}
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
        匯出整個 Folder Packet；不受上方行動簡報的已選項目影響。
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

type SavedSignalLifecycleStage = "collected" | "ready" | "processing" | "complete";

type SavedSignalLifecycle = {
  stage: SavedSignalLifecycleStage;
  label: string;
  tone: ReadinessLabel["tone"];
};

function savedSignalLifecycle(signal: ProductSignalViewModel): SavedSignalLifecycle {
  if (signal.analysis?.status === "complete") {
    return { stage: "complete", label: "已完成", tone: "success" };
  }
  if (signal.analysis?.status === "pending" || signal.analysis?.status === "analyzing") {
    return { stage: "processing", label: "處理中", tone: "neutral" };
  }
  if (signal.analysis?.status === "error") {
    return signal.readiness.status === "ready"
      ? { stage: "ready", label: "分析失敗 · 可重試", tone: "warning" }
      : { stage: "collected", label: "分析失敗", tone: "warning" };
  }

  const readiness = readinessLabel(signal.readiness);
  if (signal.readiness.status === "ready") {
    return { stage: "ready", label: readiness.label, tone: readiness.tone };
  }
  if (signal.readiness.status === "crawling") {
    return { stage: "processing", label: readiness.label, tone: readiness.tone };
  }
  return { stage: "collected", label: readiness.label, tone: readiness.tone };
}

function SavedSignalsBoard({
  signals,
  pendingSignals,
  pendingErrorAggregate,
  onRemoveSignal,
  onAnalyze
}: {
  signals: ProductSignalViewModel[];
  pendingSignals: ProductSignalViewModel[];
  pendingErrorAggregate: ProcessingErrorAggregate | null;
  onRemoveSignal?: (signalId: string) => void;
  onAnalyze: () => void;
}) {
  if (!signals.length) {
    return null;
  }

  const lifecycles = signals.map(savedSignalLifecycle);
  const lifecycleBySignalId = new Map(signals.map((signal, index) => [signal.signalId, lifecycles[index]!]));
  const readyCount = lifecycles.filter((lifecycle) => lifecycle.stage === "ready").length;
  const processingCount = lifecycles.filter((lifecycle) => lifecycle.stage === "processing").length;
  const completedCount = lifecycles.filter((lifecycle) => lifecycle.stage === "complete").length;

  return (
    <section data-saved-signals-route="true" style={{ display: "grid", gap: 12 }}>
      <div data-saved-signals-frame="true" style={glassCardStyle({ gap: 10 })}>
        <SectionHeader title="分析收件匣" caption={`${signals.length} 則`} style={{ marginBottom: 0 }} />
        <section
          data-product-saved-pipeline="true"
          aria-label="訊號分析流程"
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          {([
            ["已收集", signals.length],
            ["可分析／重試", readyCount],
            ["處理中", processingCount],
            ["已完成", completedCount]
          ] as const).map(([label, value]) => {
            const active = label === "處理中" && value > 0;
            return (
              <span
                key={label}
                style={{
                  ...textStyles.metric,
                  flex: "1 1 92px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "7px 9px",
                  borderRadius: tokens.radius.card,
                  border: `1px solid ${active ? tokens.color.runningSoft : tokens.color.cardEdge}`,
                  background: active ? tokens.color.runningSoft : tokens.color.contextSurface,
                  color: active ? tokens.color.running : tokens.color.subInk,
                  whiteSpace: "nowrap"
                }}
              >
                {label} {value}
              </span>
            );
          })}
        </section>
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
        <details data-product-saved-management="collapsed" style={{ borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.line}`, background: tokens.color.contextSurface, padding: "8px 10px" }}>
          <summary style={{ cursor: "pointer", listStyle: "none", fontSize: 11.5, fontWeight: 750, color: tokens.color.subInk }}>
            管理收件匣 · {signals.length} 則
          </summary>
          <div style={{ display: "grid", marginTop: 8 }}>
          {signals.map((signal) => {
            const lifecycle = lifecycleBySignalId.get(signal.signalId)!;
            const dotColor = lifecycle.tone === "success"
              ? tokens.color.success
              : lifecycle.tone === "warning"
                ? tokens.color.queued
                : tokens.color.lineStrong;
            return (
              <div
                key={signal.signalId}
                data-saved-signal-row="management"
                data-saved-signal-lifecycle={lifecycle.stage}
                data-saved-signal-tone={lifecycle.tone}
                style={scanRowStyle({ display: "grid", gridTemplateColumns: `8px minmax(0, 1fr) auto${onRemoveSignal ? " 20px" : ""}`, gap: 10, alignItems: "center", padding: "9px 6px" })}
              >
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: dotColor, justifySelf: "center" }} />
                <span style={{ ...textStyles.bodyTight, color: tokens.color.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {excerpt(signal.sourcePreview.displayText || signal.title || signal.signalId, 72)}
                </span>
                <Stamp tone={lifecycle.tone}>{lifecycle.label}</Stamp>
                {onRemoveSignal ? (
                  <button
                    type="button"
                    aria-label="移除此訊號"
                    onClick={() => onRemoveSignal(signal.signalId)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 2px", lineHeight: 1, color: tokens.color.softInk, fontSize: 14, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >×</button>
                ) : null}
              </div>
            );
          })}
          </div>
        </details>
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
      <div data-dlens-presence="card" style={cardStyle({ gap: 10 })}>
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

function ProductActionBriefExport({
  signals,
  analyses,
  signalPreviewById,
  signalUrlById,
  selectedIds,
  evidenceBySignalId
}: {
  signals: ProductSignalViewModel[];
  analyses: ProductSignalAnalysis[];
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  selectedIds: string[];
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
}) {
  const [copyStatus, setCopyStatus] = useState<AgentBriefCopyStatus>("idle");
  const [briefMode, setBriefMode] = useState<AgentBriefMode>("original");
  const analysesBySignal = analysisBySignalId(analyses);
  const selectedSignals = signals.filter((signal) => selectedIds.includes(signal.signalId));
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
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <div data-product-action-brief-selected-summary="true" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {selectedSignals.length ? selectedSignals.map((signal) => (
          <span key={signal.signalId} style={{ ...textStyles.meta, maxWidth: "100%", padding: "4px 7px", borderRadius: tokens.radius.sm, border: `1px solid ${tokens.color.line}`, background: tokens.color.contextSurface, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {excerpt(signal.sourcePreview.displayText || signal.title, 72)}
          </span>
        )) : (
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>尚未選取；請從上方值得嘗試／保留觀察卡加入。</span>
        )}
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
            onClick={() => setBriefMode(value as AgentBriefMode)}
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
        data-product-action-brief-copy-status={copyStatus}
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
  const classificationListMotionRef = useCausalListMotion(
    `${selectedType}:${selectedItems.map((analysis) => analysis.signalId).join("|")}`
  );
  const selectedAnalysis = selectedItems.find((analysis) => analysis.signalId === selectedSignalId)
    ?? selectedItems[0]
    ?? categoryRows[0]?.items[0]
    ?? analyses[0];
  const maxCount = Math.max(1, ...categoryRows.map((row) => row.items.length));

  if (!analyses.length) {
    return null;
  }

  return (
    <div data-product-classification-board="true" style={{ display: "grid", gap: 12, minWidth: 0, overflow: "hidden" }}>
      <section data-dlens-presence="card" style={cardStyle({ gap: 10 })}>
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
        <section
          ref={classificationListMotionRef}
          data-scan-list="product-classification"
          data-product-list-motion="classification"
          style={{ display: "grid", minWidth: 0, overflow: "hidden" }}
        >
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

type ProductActionDirection = "forward" | "backward";

type VerdictFilterStat = {
  key: ActionVerdictFilter;
  label: string;
  count: number;
  color: string;
  soft: string;
};

function VerdictFilterTiles({
  stats,
  selectedKey,
  onSelect
}: {
  stats: VerdictFilterStat[];
  selectedKey: ActionVerdictFilter | null;
  onSelect: (key: ActionVerdictFilter) => void;
}) {
  const selectedIndex = stats.findIndex((stat) => stat.key === selectedKey);
  const active = selectedIndex >= 0 ? stats[selectedIndex] : undefined;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, key: ActionVerdictFilter) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    const enabled = stats.filter((stat) => stat.count > 0);
    if (!enabled.length) return;
    const currentIndex = Math.max(0, enabled.findIndex((stat) => stat.key === key));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabled.length - 1
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + enabled.length) % enabled.length
          : (currentIndex + 1) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    event.preventDefault();
    onSelect(next.key);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-action-verdict-filter="${next.key}"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <div
      className="dlens-verdict-tiles"
      data-verdict-filter-tiles="true"
      role="tablist"
      aria-label="行動判定類別"
    >
      {active ? (
        <div
          aria-hidden="true"
          data-verdict-filter-plate="true"
          data-verdict-plate-index={selectedIndex}
          style={{ background: active.soft, borderColor: active.color }}
        />
      ) : null}
      {stats.map((stat) => {
        const selected = selectedKey === stat.key;
        const disabled = stat.count === 0;
        return (
          <button
            key={stat.key}
            id={actionVerdictTabId(stat.key)}
            type="button"
            data-action-verdict-filter={stat.key}
            data-verdict-tile="true"
            role="tab"
            aria-selected={selected}
            aria-controls={PRODUCT_ACTION_STAGE_PANEL_ID}
            aria-pressed={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(stat.key)}
            onKeyDown={(event) => handleKeyDown(event, stat.key)}
            style={{
              position: "relative",
              zIndex: 1,
              display: "grid",
              gap: 4,
              minWidth: 0,
              minHeight: 44,
              padding: "10px 9px",
              placeItems: "center",
              textAlign: "center",
              borderRadius: tokens.radius.card,
              border: "1px solid transparent",
              background: "transparent",
              color: stat.color,
              opacity: disabled ? 0.45 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
              appearance: "none",
              font: "inherit"
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800 }}>{stat.label}</span>
            <span data-verdict-tile-count="true" style={{ fontFamily: tokens.font.mono, fontSize: 16, fontWeight: 850 }}>
              {stat.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProductActionReadingOperations({
  signal,
  reading,
  sourceUrl,
  citations,
  onSynthesizeSignalReading,
  onReviewSignalReading
}: {
  signal?: ProductSignalViewModel;
  reading?: SignalReading;
  sourceUrl: string;
  citations: EvidenceCitation[];
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  onReviewSignalReading?: ReviewSignalReading;
}) {
  const incomingReviewState = signalReadingReviewState(reading);
  const [localReading, setLocalReading] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reviewState, setReviewState] = useState<SignalReadingReviewState>(() => incomingReviewState);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayedReading = reading?.reading || localReading;
  const staleness = reading
    ? signalReadingStaleness(reading, SIGNAL_READING_PROMPT_VERSION)
    : { stale: false, reasons: [] };

  useEffect(() => {
    setReviewState(incomingReviewState);
    setLocalReading(null);
    setNotice(null);
    setError(null);
  }, [reading?.cacheKey, reading?.generatedAt, incomingReviewState]);

  const generate = (force: boolean) => {
    if (!signal || !onSynthesizeSignalReading || generating) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    void onSynthesizeSignalReading(signal.signalId, signal.sessionId, force).then((result) => {
      if (result.ok) {
        setLocalReading(result.reading);
        setNotice(force ? "判讀已重新生成。" : "判讀已生成。");
      } else {
        setError(result.error);
      }
      setGenerating(false);
    });
  };

  const review = (decision: SignalReadingReviewDecision) => {
    if (!reading || !onReviewSignalReading) return;
    setError(null);
    setNotice(null);
    void onReviewSignalReading(reading.cacheKey, decision).then((result) => {
      if (result.ok) {
        const nextState = signalReadingReviewState(result.signalReading);
        setReviewState(nextState);
        setNotice(nextState === "filed" ? "已收錄此判讀。" : nextState === "deferred" ? "已標記待看。" : "已退回此判讀。");
      } else {
        setError(result.error);
      }
    });
  };

  if (!signal || (!displayedReading && !onSynthesizeSignalReading)) {
    return null;
  }

  return (
    <section
      data-product-action-reading={reading ? "existing" : "missing"}
      style={{ display: "grid", gap: 10, paddingTop: 12, borderTop: `1px solid ${tokens.color.line}`, minWidth: 0 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...textStyles.fieldLabel, color: tokens.color.product }}>深度判讀</span>
        {reading ? <Stamp tone={SIGNAL_READING_REVIEW_TONES[reviewState]}>{SIGNAL_READING_REVIEW_LABELS[reviewState]}</Stamp> : null}
      </div>
      {displayedReading ? <SignalReadingBody reading={displayedReading} /> : (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk }}>
          尚未生成深度判讀；可直接從目前候選生成。
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!reading && onSynthesizeSignalReading ? (
          <PrimaryButton
            dataAttrs={{ "data-product-action-generate-reading": "true" }}
            onClick={() => generate(false)}
            disabled={generating}
            style={{ position: "relative", overflow: "hidden" }}
          >
            {generating ? <>生成中…<ButtonShimmer /></> : "生成深度判讀"}
          </PrimaryButton>
        ) : null}
        {reading && onSynthesizeSignalReading ? (
          <SecondaryButton
            dataAttrs={{ "data-product-action-regenerate-reading": "true" }}
            onClick={() => generate(true)}
            disabled={generating}
            style={{ position: "relative", overflow: "hidden" }}
          >
            {generating ? <>生成中…<ButtonShimmer /></> : "重新生成判讀"}
          </SecondaryButton>
        ) : null}
        {reading && onReviewSignalReading ? (
          <>
            <PrimaryButton
              dataAttrs={{ "data-product-action-review": "filed" }}
              disabled={reviewState === "filed"}
              onClick={() => review("filed")}
            >
              {reviewState === "filed" ? "已收錄" : "收錄此判讀"}
            </PrimaryButton>
            <SecondaryButton dataAttrs={{ "data-product-action-review": "deferred" }} onClick={() => review("deferred")}>待看</SecondaryButton>
            <SecondaryButton dataAttrs={{ "data-product-action-review": "rejected" }} onClick={() => review("rejected")}>退回</SecondaryButton>
          </>
        ) : null}
      </div>
      {notice ? <div data-product-action-reading-notice="true" role="status" aria-live="polite" style={{ fontSize: 12, color: tokens.color.success }}>{notice}</div> : null}
      {error ? <div data-product-action-reading-error="true" role="alert" style={{ fontSize: 12, color: tokens.color.queued }}>{error}</div> : null}
      {reading ? (
        <details data-product-action-reading-secondary="true" style={{ borderTop: `1px solid ${tokens.color.line}`, paddingTop: 8 }}>
          <summary className="dlens-expand-trigger" style={{ cursor: "pointer", ...textStyles.fieldLabel, color: tokens.color.softInk }}>
            來源、引用與新鮮度
          </summary>
          <div style={{ display: "grid", gap: 9, marginTop: 9, minWidth: 0 }}>
            {staleness.stale ? (
              <div data-product-action-reading-stale="true" style={{ fontSize: 12, lineHeight: 1.55, color: tokens.color.queued }}>
                判讀建議重新生成：{signalReadingStalenessCopy(staleness)}。
              </div>
            ) : null}
            <SignalReadingProvenanceRow
              sourceUrl={sourceUrl}
              reading={reading}
              sourceKind={signal.source}
              captureId={signal.captureId}
              itemStatus={signal.readiness.itemStatus}
            />
            <SignalReadingEvidenceDetails citations={citations} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ProductActionStage({
  analyses,
  signals,
  signalReadings,
  activeFolderId,
  exportFolders,
  evidenceBySignalId,
  signalPreviewById,
  signalUrlById,
  onSynthesizeSignalReading,
  onReviewSignalReading,
  onExportSignalPackets
}: {
  analyses: ProductSignalAnalysis[];
  signals: ProductSignalViewModel[];
  signalReadings: SignalReading[];
  activeFolderId?: string;
  exportFolders?: SignalPacketExportFolderOption[];
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  onSynthesizeSignalReading?: SynthesizeSignalReading;
  onReviewSignalReading?: ReviewSignalReading;
  onExportSignalPackets?: ExportSignalPackets;
}) {
  const completed = analyses.filter((analysis) => analysis.status === "complete");
  const itemsByFilter: Record<ActionVerdictFilter, ProductSignalAnalysis[]> = {
    try: [],
    watch: [],
    park: [],
    insufficient: []
  };
  for (const analysis of completed) {
    itemsByFilter[verdictFilterKeyForAnalysis(analysis)].push(analysis);
  }
  const statByFilter: Record<ActionVerdictFilter, VerdictFilterStat> = {
    try: { key: "try", label: "值得嘗試", count: itemsByFilter.try.length, color: VERDICT_META.try.color, soft: VERDICT_META.try.soft },
    watch: { key: "watch", label: "保留觀察", count: itemsByFilter.watch.length, color: VERDICT_META.watch.color, soft: VERDICT_META.watch.soft },
    park: { key: "park", label: "噪音 / 前提不符", count: itemsByFilter.park.length, color: VERDICT_META.park.color, soft: VERDICT_META.park.soft },
    insufficient: { key: "insufficient", label: "資料不足", count: itemsByFilter.insufficient.length, color: VERDICT_META.insufficient_data.color, soft: VERDICT_META.insufficient_data.soft }
  };
  const stats = ACTION_VERDICT_VISUAL_ORDER.map((key) => statByFilter[key]);
  const firstEnabledFilter = ACTION_VERDICT_DEFAULT_PRIORITY.find((key) => itemsByFilter[key].length > 0) ?? "try";
  const [activeFilter, setActiveFilter] = useState<ActionVerdictFilter>(() => firstEnabledFilter);
  const [activeSelectionByFilter, setActiveSelectionByFilter] = useState<Record<ActionVerdictFilter, { signalId: string | null; sourceIndex: number }>>(() => ({
    try: { signalId: itemsByFilter.try[0]?.signalId ?? null, sourceIndex: 0 },
    watch: { signalId: itemsByFilter.watch[0]?.signalId ?? null, sourceIndex: 0 },
    park: { signalId: itemsByFilter.park[0]?.signalId ?? null, sourceIndex: 0 },
    insufficient: { signalId: itemsByFilter.insufficient[0]?.signalId ?? null, sourceIndex: 0 }
  }));
  const resolvedFilter = itemsByFilter[activeFilter].length ? activeFilter : firstEnabledFilter;
  const activeItems = itemsByFilter[resolvedFilter];
  const activeSelection = activeSelectionByFilter[resolvedFilter];
  const [direction, setDirection] = useState<ProductActionDirection>("forward");
  const stageRef = useRef<HTMLElement | null>(null);
  const restoreStageFocusRef = useRef(false);
  const matchingIndex = activeSelection.signalId
    ? activeItems.findIndex((analysis) => analysis.signalId === activeSelection.signalId)
    : -1;
  const safeIndex = matchingIndex >= 0
    ? matchingIndex
    : Math.min(activeSelection.sourceIndex, Math.max(activeItems.length - 1, 0));
  const activeAnalysis = activeItems[safeIndex];
  const selectionWasRemoved = activeSelection.signalId !== null && matchingIndex < 0;
  const renderedDirection = selectionWasRemoved && safeIndex < activeSelection.sourceIndex
    ? "backward"
    : direction;
  const activeMeta = stats.find((stat) => stat.key === resolvedFilter) ?? stats[0]!;
  const activeIsActionable = resolvedFilter === "try" || resolvedFilter === "watch";
  const signalsById = new Map(signals.map((signal) => [signal.signalId, signal]));
  const eligibleBriefIds = completed
    .filter((analysis) => (
      analysis.signalType !== "noise"
      && (analysis.verdict === "try" || analysis.verdict === "watch")
      && signalsById.has(analysis.signalId)
    ))
    .map((analysis) => analysis.signalId);
  const eligibleBriefKey = eligibleBriefIds.join("|");
  const eligibleBriefIdSet = new Set(eligibleBriefIds);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const previousBriefSessionIdRef = useRef(activeFolderId);
  const readingsBySignalId = latestReadingBySignalId(signalReadings);

  useEffect(() => {
    if (activeFilter !== resolvedFilter) setActiveFilter(resolvedFilter);
  }, [activeFilter, resolvedFilter]);

  useEffect(() => {
    const nextSignalId = activeAnalysis?.signalId ?? null;
    if (activeSelection.signalId === nextSignalId && activeSelection.sourceIndex === safeIndex) return;
    if (selectionWasRemoved) setDirection(renderedDirection);
    setActiveSelectionByFilter((previous) => ({
      ...previous,
      [resolvedFilter]: { signalId: nextSignalId, sourceIndex: safeIndex }
    }));
  }, [activeAnalysis?.signalId, activeSelection.signalId, activeSelection.sourceIndex, renderedDirection, resolvedFilter, safeIndex, selectionWasRemoved]);

  useEffect(() => {
    if (!restoreStageFocusRef.current || !activeAnalysis) return;
    restoreStageFocusRef.current = false;
    stageRef.current?.focus({ preventScroll: true });
  }, [activeAnalysis?.signalId]);

  useEffect(() => {
    const sessionChanged = previousBriefSessionIdRef.current !== activeFolderId;
    previousBriefSessionIdRef.current = activeFolderId;
    const eligibleIds = new Set(eligibleBriefIds);
    setSelectedSignalIds((previous) => {
      if (sessionChanged) return [];
      const next = previous.filter((signalId) => eligibleIds.has(signalId));
      return next.length === previous.length ? previous : next;
    });
  }, [activeFolderId, eligibleBriefKey]);

  const moveTo = (nextIndex: number, restoreFocus = false) => {
    const clamped = Math.max(0, Math.min(nextIndex, activeItems.length - 1));
    const nextCandidate = activeItems[clamped];
    if (!nextCandidate || nextCandidate.signalId === activeAnalysis?.signalId) return;
    if (restoreFocus) restoreStageFocusRef.current = true;
    setDirection(clamped > safeIndex ? "forward" : "backward");
    setActiveSelectionByFilter((previous) => ({
      ...previous,
      [resolvedFilter]: { signalId: nextCandidate.signalId, sourceIndex: clamped }
    }));
  };

  const selectFilter = (nextFilter: ActionVerdictFilter) => {
    if (!itemsByFilter[nextFilter].length || nextFilter === resolvedFilter) return;
    setDirection(ACTION_VERDICT_VISUAL_ORDER.indexOf(nextFilter) > ACTION_VERDICT_VISUAL_ORDER.indexOf(resolvedFilter) ? "forward" : "backward");
    setActiveFilter(nextFilter);
  };

  const handleStageKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.currentTarget !== event.target) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = safeIndex - 1;
    if (event.key === "ArrowRight") nextIndex = safeIndex + 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = activeItems.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    moveTo(nextIndex, true);
  };

  const activeSignal = activeAnalysis ? signalsById.get(activeAnalysis.signalId) : undefined;
  const activeReading = activeAnalysis ? readingsBySignalId.get(activeAnalysis.signalId) : undefined;
  const citations = activeAnalysis ? citationsForAnalysis(activeAnalysis, evidenceBySignalId) : [];
  const exactCitation = citations.find((citation) => citation.entry?.text?.trim());
  const activeSourceUrl = activeAnalysis
    ? signalUrlById[activeAnalysis.signalId] || activeReading?.sourcePacket?.postUrl || activeSignal?.sourcePreview.sourceUrl || activeSignal?.sourcePreview.displayUrl || ""
    : "";
  const activeTitle = activeAnalysis
    ? activeAnalysis.referenceLabel?.trim() || activeAnalysis.contentSummary
    : "";
  const activeBriefEligible = Boolean(activeAnalysis && eligibleBriefIdSet.has(activeAnalysis.signalId));
  const activeBriefSelected = Boolean(activeAnalysis && selectedSignalIds.includes(activeAnalysis.signalId));

  const toggleActiveBriefSelection = () => {
    if (!activeAnalysis || !activeBriefEligible) return;
    setSelectedSignalIds((previous) => previous.includes(activeAnalysis.signalId)
      ? previous.filter((signalId) => signalId !== activeAnalysis.signalId)
      : [...previous, activeAnalysis.signalId]);
  };

  return (
    <div data-product-action-workspace="stage" style={{ display: "grid", gap: 12, minWidth: 0, overflow: "visible" }}>
      <style>{`
        .dlens-verdict-tiles,
        .dlens-verdict-tiles *,
        .dlens-verdict-tiles *::before,
        .dlens-verdict-tiles *::after { box-sizing: border-box; }
        .dlens-verdict-tiles {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          min-width: 0;
        }
        .dlens-verdict-tiles [data-verdict-filter-plate] {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: calc((100% - 24px) / 4);
          border: 1px solid;
          border-radius: ${tokens.radius.card}px;
          box-shadow: ${tokens.shadow.activeTab};
          pointer-events: none;
        }
        .dlens-verdict-tiles [data-verdict-plate-index="0"] { transform: translateX(0); }
        .dlens-verdict-tiles [data-verdict-plate-index="1"] { transform: translateX(calc(100% + 8px)); }
        .dlens-verdict-tiles [data-verdict-plate-index="2"] { transform: translateX(calc((100% + 8px) * 2)); }
        .dlens-verdict-tiles [data-verdict-plate-index="3"] { transform: translateX(calc((100% + 8px) * 3)); }
        @media (max-width: ${tokens.layout.atlasNarrowBreakpointPx}px) {
          .dlens-verdict-tiles {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: 1fr;
          }
          .dlens-verdict-tiles [data-verdict-filter-plate] {
            right: auto;
            bottom: auto;
            width: calc((100% - 8px) / 2);
            height: calc((100% - 8px) / 2);
          }
          .dlens-verdict-tiles [data-verdict-plate-index="0"] { transform: translate(0, 0); }
          .dlens-verdict-tiles [data-verdict-plate-index="1"] { transform: translate(calc(100% + 8px), 0); }
          .dlens-verdict-tiles [data-verdict-plate-index="2"] { transform: translate(0, calc(100% + 8px)); }
          .dlens-verdict-tiles [data-verdict-plate-index="3"] { transform: translate(calc(100% + 8px), calc(100% + 8px)); }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <Kicker>判定導覽</Kicker>
        <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{completed.length} 已評估</span>
      </div>
      <VerdictFilterTiles stats={stats} selectedKey={completed.length ? resolvedFilter : null} onSelect={selectFilter} />
      {activeAnalysis ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <Kicker>{activeMeta.label}</Kicker>
            <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{activeItems.length} 則</span>
          </div>
          <article
            key={`${activeAnalysis.signalId}:${renderedDirection}`}
            id={PRODUCT_ACTION_STAGE_PANEL_ID}
            ref={stageRef}
            data-product-action-stage={activeAnalysis.signalId}
            data-product-action-page={safeIndex + 1}
            data-direction={renderedDirection}
            tabIndex={0}
            role="tabpanel"
            aria-labelledby={actionVerdictTabId(resolvedFilter)}
            onKeyDown={handleStageKeyDown}
            aria-label={`${activeMeta.label} ${safeIndex + 1} / ${activeItems.length}`}
            style={glassCardStyle({ gap: 14, padding: 18, minWidth: 0, overflow: "visible", borderColor: tokens.color.productSoft, boxShadow: tokens.shadow.raised })}
          >
            <header style={{ display: "grid", gap: 7, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 800, color: tokens.color.product }}>{String(safeIndex + 1).padStart(2, "0")}</span>
                {activeIsActionable ? (
                  <ProductVerdictSoftPill verdict={activeAnalysis.verdict} />
                ) : (
                  <ScorePill color={activeMeta.color} soft={activeMeta.soft}>{activeMeta.label}</ScorePill>
                )}
                {activeSignal ? <ProductReadinessChip readiness={activeSignal.readiness} /> : null}
                <span style={{ fontSize: 11.5, color: tokens.color.softInk }}>{SIGNAL_TYPE_LABELS[activeAnalysis.signalType]} · {formatRelevanceScore(activeAnalysis.relevance)}</span>
              </div>
              <h2 style={{ margin: 0, fontFamily: tokens.font.serifCjk, fontSize: 22, lineHeight: 1.28, color: tokens.color.ink, overflowWrap: "anywhere" }}>
                {activeTitle}
              </h2>
              {activeAnalysis.contentSummary && activeAnalysis.contentSummary !== activeTitle ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: tokens.color.subInk, overflowWrap: "anywhere" }}>{activeAnalysis.contentSummary}</p> : null}
            </header>

            {activeBriefEligible ? (
              <button
                type="button"
                data-product-action-brief-toggle="true"
                aria-pressed={activeBriefSelected}
                onClick={toggleActiveBriefSelection}
                style={{
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 11px",
                  borderRadius: tokens.radius.card,
                  border: `1px solid ${activeBriefSelected ? tokens.color.product : tokens.color.line}`,
                  background: activeBriefSelected ? tokens.color.productSoft : tokens.color.contextSurface,
                  color: activeBriefSelected ? tokens.color.product : tokens.color.subInk,
                  font: "inherit",
                  fontSize: 12,
                  fontWeight: 750,
                  cursor: "pointer"
                }}
              >
                <span>{activeBriefSelected ? "已加入行動簡報" : "加入行動簡報"}</span>
                <span aria-hidden="true">{activeBriefSelected ? "✓" : "+"}</span>
              </button>
            ) : null}

            {activeIsActionable ? (
              <div data-product-action-sequence="true" style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
                {[
                  { key: "reason", label: "觀察原因", value: activeAnalysis.reason || activeAnalysis.whyRelevant },
                  { key: "takeaway", label: "新知保留", value: activeAnalysis.referenceTakeaway?.trim() || activeAnalysis.whyRelevant || activeAnalysis.reason },
                  { key: "next", label: "下一步", value: activeAnalysis.agentTaskSpec?.taskTitle?.trim() || activeAnalysis.experimentHint?.trim() || "尚未有可派發任務；先保留為觀察。" }
                ].map((beat) => (
                  <div key={beat.key} data-product-action-beat={beat.key} style={{ flex: "1 1 150px", minWidth: 0, display: "grid", alignContent: "start", gap: 5, padding: "10px 11px", borderRadius: tokens.radius.sm, border: `1px solid ${beat.key === "next" ? tokens.color.productSoft : tokens.color.line}`, background: beat.key === "next" ? tokens.color.productSoft : tokens.color.contextSurface }}>
                    <span style={{ ...textStyles.fieldLabel, color: beat.key === "next" ? tokens.color.product : tokens.color.softInk }}>{beat.label}</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk, overflowWrap: "anywhere" }}>{beat.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <section
                data-product-action-verdict-reason={resolvedFilter}
                style={{ display: "grid", gap: 5, padding: "10px 11px", borderRadius: tokens.radius.sm, border: `1px solid ${activeMeta.soft}`, background: activeMeta.soft }}
              >
                <span style={{ ...textStyles.fieldLabel, color: activeMeta.color }}>{resolvedFilter === "park" ? "排除原因" : "資料缺口"}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.color.subInk, overflowWrap: "anywhere" }}>{activeAnalysis.reason || activeAnalysis.whyRelevant}</span>
              </section>
            )}

            <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
              <span style={{ ...textStyles.fieldLabel, color: tokens.color.softInk }}>來源真相</span>
              <ProductSourceTruthStrip
                analysis={activeAnalysis}
                descriptor={activeSignal?.sourceDescriptor}
                evidenceBySignalId={evidenceBySignalId}
                signalId={activeAnalysis.signalId}
              />
            </div>
            {exactCitation?.entry?.text ? (
              <blockquote data-product-action-exact-quote="true" style={{ margin: 0, padding: "9px 11px", borderLeft: `3px solid ${tokens.color.product}`, color: tokens.color.subInk, fontFamily: tokens.font.serifCjk, fontSize: 13, lineHeight: 1.65, overflowWrap: "anywhere" }}>
                {exactCitation.entry.text}
                <footer style={{ marginTop: 5, fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk }}>
                  {exactCitation.ref}{exactCitation.entry.author ? ` · ${exactCitation.entry.author}` : ""}{exactCitation.entry.likeCount != null ? ` · ${exactCitation.entry.likeCount} ♥` : ""}
                </footer>
              </blockquote>
            ) : null}
            {activeIsActionable ? (
              <ProductActionReadingOperations
                signal={activeSignal}
                reading={activeReading}
                sourceUrl={activeSourceUrl}
                citations={citations}
                onSynthesizeSignalReading={onSynthesizeSignalReading}
                onReviewSignalReading={onReviewSignalReading}
              />
            ) : null}
          </article>
          <nav data-product-action-pager="text" aria-label={`${activeMeta.label}分頁`} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <SecondaryButton dataAttrs={{ "data-product-action-previous": "true" }} disabled={safeIndex === 0} onClick={() => moveTo(safeIndex - 1)} style={{ minHeight: 44 }}>← 上一則</SecondaryButton>
            <span data-product-action-live="true" role="status" aria-live="polite" style={{ minWidth: 36, fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk, textAlign: "center" }}>{safeIndex + 1} / {activeItems.length}</span>
            <SecondaryButton dataAttrs={{ "data-product-action-next": "true" }} disabled={safeIndex === activeItems.length - 1} onClick={() => moveTo(safeIndex + 1)} style={{ minHeight: 44 }}>下一則 →</SecondaryButton>
          </nav>
        </>
      ) : (
        <div id={PRODUCT_ACTION_STAGE_PANEL_ID} data-product-action-empty="true" role="tabpanel" style={mutedPanelStyle({ fontSize: 12.5, color: tokens.color.subInk })}>請先到訊號頁開始分析</div>
      )}
      {eligibleBriefIds.length ? (
        <details data-product-action-brief-export="true" style={{ borderTop: `1px solid ${tokens.color.line}`, paddingTop: 10 }}>
          <summary className="dlens-expand-trigger" style={{ cursor: "pointer", ...textStyles.fieldLabel, color: tokens.color.product }}>
            行動簡報匯出 · {selectedSignalIds.length} 已選
          </summary>
          <ProductActionBriefExport
            signals={signals}
            analyses={completed}
            signalPreviewById={signalPreviewById}
            signalUrlById={signalUrlById}
            selectedIds={selectedSignalIds}
            evidenceBySignalId={evidenceBySignalId}
          />
        </details>
      ) : null}
      {completed.length && onExportSignalPackets ? (
        <details data-product-action-export="true" style={{ borderTop: `1px solid ${tokens.color.line}`, paddingTop: 10 }}>
          <summary className="dlens-expand-trigger" style={{ cursor: "pointer", ...textStyles.fieldLabel, color: tokens.color.product }}>整個 Folder Packet 匯出（HTML / JSONL）</summary>
          <div style={{ marginTop: 10 }}>
            <SignalPacketHtmlExportSection
              activeFolderId={activeFolderId}
              exportFolders={exportFolders}
              onExportSignalPackets={onExportSignalPackets}
              embedded
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export const productSignalViewTestables = {
  buildAgentBrief,
  ProductActionBriefExport,
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
    signalPreviewById,
    signalUrlById,
    evidenceBySignalId,
    scopedSignalReadings,
    pendingSignals
  } = viewModel;
  const t = useUiText();
  const copy = PAGE_COPY[kind];
  const dispatchCommand = (command: ProductSignalCommand) => Promise.resolve(onCommand(command));
  const analyzeCommand = viewModel.actions.find((action) => action.kind === "analyzeInbox");
  const openActionableCommand = viewModel.actions.find((action) => action.kind === "openActionable");
  const hasReadingCommand = signals.some((signal) => signal.actions.some((action) => action.kind === "generateReading"));
  const pendingErrorAggregate = summarizeProcessingErrorAggregate(pendingSignals);

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
        title={t(copy.title, copy.titleEn)}
        deck={t(copy.deck, copy.deckEn)}
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
      <div data-product-signal-frame="true" style={{ display: "grid", gap: tokens.spacing.md, overflow: "visible", minWidth: 0 }}>
        {kind === "actionable-filter" ? (
          <div
            data-product-action-status="compact"
            data-dlens-presence="card"
            style={heroPanelStyle({ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", flexWrap: "wrap" })}
          >
            <Kicker>判讀狀態</Kicker>
            <Stamp tone={scopedAnalyses.length ? "success" : "neutral"}>{scopedAnalyses.length} analyses</Stamp>
            {pendingSignals.length ? <Stamp tone="warning">{pendingSignals.length} 處理中</Stamp> : null}
          </div>
        ) : (
          <ReadinessPanel
            viewModel={viewModel}
            onAnalyze={handleAnalyze}
          />
        )}
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
            data-dlens-presence="card"
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
                onRemoveSignal={signals.some((signal) => signal.actions.some((action) => action.kind === "remove")) ? handleRemoveSignal : undefined}
                onAnalyze={handleAnalyze}
              />
            </>
          )
        ) : kind === "actionable-filter" ? (
          <ProductActionStage
            key={viewModel.sessionId ?? "product-action-no-session"}
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
        ) : scopedAnalyses.length ? (
          <ClassificationBoard analyses={scopedAnalyses} signalPreviewById={signalPreviewById} />
        ) : viewModel.loadState === "loading" ? null : (
          <div data-dlens-presence="card" style={cardStyle()}>
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
      </div>
    </div>
  );
}
