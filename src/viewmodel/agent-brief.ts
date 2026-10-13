import type { ProductSignalAnalysis, ProductSignalReferenceTarget, ProductSignalReferenceType, ProductSignalType, ProductSignalVerdict } from "../state/types";
import type { ProductSignalViewModel } from "./product-signal";
import type { ProductSignalEvidenceEntry } from "../compare/product-signal-analysis";
export type AgentBriefMode = "original" | "decision";
const SIGNAL_TYPE_LABELS: Record<ProductSignalType, string> = {
  learning: "學習資源",
  competitor: "競品分析",
  demand: "需求",
  technical: "技術討論",
  marketing: "行銷素材",
  noise: "噪音"
};

const VERDICT_LABELS: Record<ProductSignalVerdict, string> = {
  try: "值得嘗試",
  watch: "保留觀察",
  park: "不適合目前產品",
  insufficient_data: "資料不足"
};

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

function excerpt(value: string | null | undefined, maxLength = 150): string {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
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

export function buildAgentBrief({
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

