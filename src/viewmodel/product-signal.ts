import { isProductContextSourceReady } from "../compare/product-context.ts";
import {
  PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
  buildProductContextHash,
  buildProductSignalEvidenceCatalogFromCapture,
  type ProductSignalEvidenceEntry
} from "../compare/product-signal-analysis.ts";
import type { SignalReading } from "../compare/signal-reading-storage.ts";
import { normalizeAiOutputProvenance, aiOutputProvenanceFromModel, type AiOutputProvenance } from "../state/ai-provenance.ts";
import { projectCapturedPost, projectCapturedPostFromSources, type CapturedPostProjection } from "../state/captured-post.ts";
import { deriveDerivedRecordStaleness } from "../state/derived-record.ts";
import { deriveProductSignalLoadState, type LoadState } from "../state/load-state.ts";
import { buildSignalReadinessById, type SignalReadiness } from "../state/signal-readiness.ts";
import { getActiveSession } from "../state/store-helpers.ts";
import type {
  ExtensionSnapshot,
  ProductAgentTaskFeedback,
  ProductContext,
  ProductProfile,
  ProductSignalAnalysis,
  ProductSignalCardLayout,
  SessionItem,
  SessionRecord,
  Signal
} from "../state/types.ts";

export type AnalysisState = "missing" | "queued" | "ready" | "stale" | "failed";
export type Provenance = AiOutputProvenance;

export type ProductSignalAction =
  | { kind: "analyze"; target: { sessionId: string; signalId: string } }
  | { kind: "recrawl"; target: { sessionId: string; signalId: string } }
  | { kind: "generateReading"; target: { sessionId: string; signalId: string } }
  | { kind: "remove"; target: { sessionId: string; signalId: string } };

export type ProductSignalCommand =
  | { kind: "analyzeInbox"; target: { sessionId: string } }
  | { kind: "openActionable"; target: { sessionId: string } }
  | { kind: "remove"; target: { sessionId: string; signalId: string } }
  | { kind: "generateReading"; target: { sessionId: string; signalId: string }; force?: boolean }
  | { kind: "reviewReading"; target: { sessionId: string; signalId: string; cacheKey: string }; decision: "filed" | "deferred" | "rejected"; note?: string }
  | { kind: "exportSignalPackets"; target: { sessionId: string }; format: "html" | "jsonl" };

export interface EvidencePreview extends CapturedPostProjection {
  displayText: string;
  displayUrl: string;
}

export interface ProductSignalViewModel {
  signalId: string;
  sessionId: string;
  itemId: string | null;
  captureId: string | null;
  source: Signal["source"];
  title: string;
  sourcePreview: EvidencePreview;
  readiness: SignalReadiness;
  analysisState: AnalysisState;
  provenance: Provenance;
  analysis?: ProductSignalAnalysis;
  evidence: ProductSignalEvidenceEntry[];
  actions: ProductSignalAction[];
}

export interface ProductSignalWorkspaceViewModel {
  kind: "saved-signals" | "classification" | "actionable-filter";
  sessionId: string | null;
  productProfile: ProductProfile | null;
  cardLayout: ProductSignalCardLayout;
  signals: ProductSignalViewModel[];
  pendingSignals: ProductSignalViewModel[];
  scopedAnalyses: ProductSignalAnalysis[];
  historicalAnalyses: ProductSignalAnalysis[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  scopedSignalReadings: SignalReading[];
  signalCount: number;
  completedAnalysisCount: number;
  signalPreviewById: Record<string, string>;
  signalUrlById: Record<string, string>;
  evidenceBySignalId: Record<string, ProductSignalEvidenceEntry[]>;
  signalReadinessById: Record<string, SignalReadiness>;
  loadState: LoadState;
  canAnalyze: boolean;
  allGreen: boolean;
  readinessCopy: string;
  showSignalReadingReview: boolean;
  firstSynthesizableSignal: ProductSignalViewModel | null;
  visibleError: string | null;
  statusErrorLabel: string | null;
  analysisNotice: string | null;
  isAnalyzing: boolean;
  aiProviderReady: boolean;
  actions: ProductSignalCommand[];
}

export interface BuildProductSignalWorkspaceViewModelInput {
  kind: ProductSignalWorkspaceViewModel["kind"];
  snapshot: ExtensionSnapshot;
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  historicalAnalyses?: ProductSignalAnalysis[];
  agentTaskFeedback?: ProductAgentTaskFeedback[];
  signalReadings?: SignalReading[];
  productContext?: ProductContext | null;
  aiProviderReady?: boolean;
  cardLayout?: ProductSignalCardLayout;
  backendError?: string | null;
  analysisError?: string | null;
  analysisNotice?: string | null;
  isHydrating?: boolean;
  isAnalyzing?: boolean;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isProductProfileReady(productProfile: ProductProfile | null | undefined): boolean {
  return Boolean(productProfile?.name?.trim() && productProfile.category?.trim() && productProfile.audience?.trim());
}

function activeProductSession(snapshot: ExtensionSnapshot): SessionRecord | null {
  const session = getActiveSession(snapshot.global);
  return session?.mode === "product" ? session : null;
}

function itemById(session: SessionRecord | null): Map<string, SessionItem> {
  return new Map(session?.items.map((item) => [item.id, item]) ?? []);
}

function hasRenderableBackingItem(signal: Signal, session: SessionRecord | null, itemsById: Map<string, SessionItem>): boolean {
  if (!session?.id || signal.sessionId !== session.id) {
    return false;
  }
  if (!signal.itemId) {
    return true;
  }
  const descriptor = itemsById.get(signal.itemId)?.descriptor;
  if (!descriptor) {
    return false;
  }
  return Boolean(
    descriptor.text_snippet?.trim()
    || descriptor.post_url
    || descriptor.page_url
    || descriptor.author_hint?.trim()
  );
}

function descriptorPreview(item: SessionItem | null | undefined): { text: string; url: string } {
  const descriptor = item?.descriptor;
  const text = descriptor?.text_snippet?.trim() ?? "";
  const author = descriptor?.author_hint?.trim() ?? "";
  const url = descriptor?.post_url || descriptor?.page_url || "";
  if (text) {
    return { text, url };
  }
  if (author && url) {
    return { text: `@${author.replace(/^@/, "")} · ${url}`, url };
  }
  if (url) {
    return { text: url, url };
  }
  if (author) {
    return { text: `@${author.replace(/^@/, "")}`, url };
  }
  return { text: "", url };
}

function buildEvidencePreview(item: SessionItem | null | undefined): EvidencePreview {
  const projection = item ? projectCapturedPost(item) : projectCapturedPostFromSources({});
  const descriptor = descriptorPreview(item);
  const displayText = projection.text || descriptor.text;
  const displayUrl = projection.sourceUrl || descriptor.url;
  return {
    ...projection,
    displayText,
    displayUrl
  };
}

function analysisBySignalId(analyses: ProductSignalAnalysis[]): Map<string, ProductSignalAnalysis> {
  return new Map(analyses.map((analysis) => [analysis.signalId, analysis]));
}

function visibleAnalyses(analyses: ProductSignalAnalysis[]): ProductSignalAnalysis[] {
  return analyses.filter((analysis) => analysis.status === "complete");
}

function readSignalReadiness(signalId: string, readinessById: Record<string, SignalReadiness>): SignalReadiness {
  return readinessById[signalId] ?? { status: "missing_item" };
}

function hasQueueableSignals(signals: ProductSignalViewModel[]): boolean {
  return signals.some((signal) => signal.readiness.status === "saved");
}

function hasAnalyzableSignals(signals: ProductSignalViewModel[]): boolean {
  return signals.some((signal) => signal.readiness.status === "ready");
}

function hasInFlightSignals(signals: ProductSignalViewModel[]): boolean {
  return signals.some((signal) => signal.readiness.status === "crawling");
}

function canRunProductSignalAction({
  signals,
  productProfile,
  aiProviderReady
}: {
  signals: ProductSignalViewModel[];
  productProfile: ProductProfile | null | undefined;
  aiProviderReady: boolean;
}): boolean {
  return signals.length > 0
    && aiProviderReady
    && isProductProfileReady(productProfile)
    && isProductContextSourceReady(productProfile)
    && (hasQueueableSignals(signals) || hasAnalyzableSignals(signals));
}

function readinessCopy({
  signals,
  analyses,
  productProfile,
  aiProviderReady
}: {
  signals: ProductSignalViewModel[];
  analyses: ProductSignalAnalysis[];
  productProfile: ProductProfile | null | undefined;
  aiProviderReady: boolean;
}): string {
  if (!signals.length) {
    const visibleCount = analyses.filter((analysis) => analysis.status === "complete").length || analyses.length;
    if (visibleCount > 0) {
      return `已有 ${visibleCount} 筆既有分析，但目前 signal 清單是空的。先顯示已分析資料；新的貼文仍從 Collect 加入。`;
    }
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
  if (hasQueueableSignals(signals)) {
    return "有 signal 尚未抓取。按分析收件匣會先送出抓取請求，完成後再分析。";
  }
  if (hasInFlightSignals(signals)) {
    return "抓取正在進行；完成後會自動嘗試分析，也可以稍後再按分析。";
  }
  if (!analyses.length) {
    return hasAnalyzableSignals(signals)
      ? "已有 ready signal。按下分析收件匣後，這裡才會顯示真實 AI 結果。"
      : "目前沒有可分析的 ready signal。請先處理抓取失敗或內容不完整的項目。";
  }
  return "";
}

function deriveAnalysisState(
  analysis: ProductSignalAnalysis | undefined,
  productContext: ProductContext | null | undefined
): AnalysisState {
  if (!analysis) {
    return "missing";
  }
  if (analysis.status === "pending" || analysis.status === "analyzing") {
    return "queued";
  }
  if (analysis.status === "error") {
    return "failed";
  }
  if (analysis.status !== "complete") {
    return "missing";
  }
  if (!productContext) {
    return "ready";
  }
  const staleness = deriveDerivedRecordStaleness({
    record: {
      sourceHash: analysis.productContextHash,
      generatorVersion: analysis.promptVersion,
      generatedAt: analysis.analyzedAt
    },
    currentSourceHash: buildProductContextHash(productContext),
    currentGeneratorVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
    currentUpdatedAt: productContext.compiledAt
  });
  return staleness.stale ? "stale" : "ready";
}

function deriveProvenance(analysis: ProductSignalAnalysis | undefined): Provenance {
  if (!analysis) {
    return "missing";
  }
  return normalizeAiOutputProvenance(aiOutputProvenanceFromModel(analysis.model));
}

function buildActions({
  sessionId,
  signalId,
  readiness,
  analysis
}: {
  sessionId: string;
  signalId: string;
  readiness: SignalReadiness;
  analysis?: ProductSignalAnalysis;
}): ProductSignalAction[] {
  const actions: ProductSignalAction[] = [
    { kind: "analyze", target: { sessionId, signalId } }
  ];
  if (readiness.status === "saved" || readiness.status === "failed" || readiness.status === "missing_content") {
    actions.push({ kind: "recrawl", target: { sessionId, signalId } });
  }
  if (analysis?.status === "complete") {
    actions.push({ kind: "generateReading", target: { sessionId, signalId } });
  }
  actions.push({ kind: "remove", target: { sessionId, signalId } });
  return actions;
}

function buildSignalViewModels({
  activeFolder,
  signals,
  analyses,
  productContext
}: {
  activeFolder: SessionRecord | null;
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
  productContext?: ProductContext | null;
}): ProductSignalViewModel[] {
  const items = itemById(activeFolder);
  const scopedSignals = safeArray(signals).filter((signal) => hasRenderableBackingItem(signal, activeFolder, items));
  const readinessById = buildSignalReadinessById(activeFolder, scopedSignals);
  const analysesBySignal = analysisBySignalId(analyses);
  return scopedSignals.map((signal) => {
    const item = signal.itemId ? items.get(signal.itemId) : null;
    const sourcePreview = buildEvidencePreview(item);
    const analysis = analysesBySignal.get(signal.id);
    const readiness = readSignalReadiness(signal.id, readinessById);
    const title = sourcePreview.displayText || analysis?.contentSummary || signal.id;
    return {
      signalId: signal.id,
      sessionId: signal.sessionId,
      itemId: signal.itemId ?? null,
      captureId: item?.captureId || item?.latestCapture?.id || null,
      source: signal.source,
      title,
      sourcePreview,
      readiness,
      analysisState: deriveAnalysisState(analysis, productContext),
      provenance: deriveProvenance(analysis),
      ...(analysis ? { analysis } : {}),
      evidence: buildProductSignalEvidenceCatalogFromCapture(item?.latestCapture),
      actions: buildActions({ sessionId: signal.sessionId, signalId: signal.id, readiness, analysis })
    };
  });
}

function buildWorkspaceActions(sessionId: string | null, hasActionable: boolean): ProductSignalCommand[] {
  if (!sessionId) {
    return [];
  }
  const actions: ProductSignalCommand[] = [
    { kind: "analyzeInbox", target: { sessionId } },
    { kind: "exportSignalPackets", target: { sessionId }, format: "html" },
    { kind: "exportSignalPackets", target: { sessionId }, format: "jsonl" }
  ];
  if (hasActionable) {
    actions.push({ kind: "openActionable", target: { sessionId } });
  }
  return actions;
}

export function buildProductSignalWorkspaceViewModel({
  kind,
  snapshot,
  signals,
  analyses,
  historicalAnalyses,
  agentTaskFeedback,
  signalReadings,
  productContext = null,
  aiProviderReady = true,
  cardLayout,
  backendError = null,
  analysisError = null,
  analysisNotice = null,
  isHydrating = false,
  isAnalyzing = false
}: BuildProductSignalWorkspaceViewModelInput): ProductSignalWorkspaceViewModel {
  const activeFolder = activeProductSession(snapshot);
  const safeAnalyses = safeArray(analyses);
  const rows = buildSignalViewModels({
    activeFolder,
    signals,
    analyses: safeAnalyses,
    productContext
  });
  const analysesBySignal = analysisBySignalId(safeAnalyses);
  const signalScopedAnalyses = rows.length
    ? rows.map((signal) => analysesBySignal.get(signal.signalId)).filter((entry): entry is ProductSignalAnalysis => Boolean(entry))
    : safeAnalyses;
  const scopedAnalyses = visibleAnalyses(signalScopedAnalyses);
  const visibleError = analysisError || backendError || null;
  const statusErrorLabel = backendError ? "Backend 離線" : analysisError ? "部分失敗" : null;
  const loadState = deriveProductSignalLoadState({
    isHydrating,
    signalCount: rows.length,
    analysisCount: scopedAnalyses.length,
    hasError: Boolean(visibleError)
  });
  const safeSignalReadings = safeArray(signalReadings);
  const signalIdSet = new Set(rows.map((signal) => signal.signalId));
  const scopedSignalReadings = signalIdSet.size
    ? safeSignalReadings.filter((reading) => signalIdSet.has(reading.signalId))
    : [];
  const pendingSignals = rows.filter((signal) => signal.analysis?.status !== "complete");
  const firstSynthesizableSignal = rows.find((signal) => signal.analysis?.status === "complete") ?? null;
  const productProfile = snapshot.global.settings.productProfile ?? null;
  const canAnalyze = canRunProductSignalAction({
    signals: rows,
    productProfile,
    aiProviderReady
  });
  const completedAnalysisCount = scopedAnalyses.length;
  const allGreen = rows.length > 0
    && completedAnalysisCount > 0
    && aiProviderReady
    && isProductProfileReady(productProfile)
    && isProductContextSourceReady(productProfile);
  const signalPreviewById = Object.fromEntries(rows.map((signal) => [signal.signalId, signal.sourcePreview.displayText] as const));
  const signalUrlById = Object.fromEntries(rows.map((signal) => [signal.signalId, signal.sourcePreview.displayUrl] as const));
  const evidenceBySignalId = Object.fromEntries(rows.map((signal) => [signal.signalId, signal.evidence] as const));
  const signalReadinessById = Object.fromEntries(rows.map((signal) => [signal.signalId, signal.readiness] as const));

  return {
    kind,
    sessionId: activeFolder?.id ?? null,
    productProfile,
    cardLayout: cardLayout ?? snapshot.global.settings.layoutPreferences.productSignalCardLayout,
    signals: rows,
    pendingSignals,
    scopedAnalyses,
    historicalAnalyses: safeArray(historicalAnalyses).length ? safeArray(historicalAnalyses) : safeAnalyses,
    agentTaskFeedback: safeArray(agentTaskFeedback),
    scopedSignalReadings,
    signalCount: rows.length,
    completedAnalysisCount,
    signalPreviewById,
    signalUrlById,
    evidenceBySignalId,
    signalReadinessById,
    loadState,
    canAnalyze,
    allGreen,
    readinessCopy: readinessCopy({ signals: rows, analyses: scopedAnalyses, productProfile, aiProviderReady }),
    showSignalReadingReview: scopedSignalReadings.length > 0,
    firstSynthesizableSignal,
    visibleError,
    statusErrorLabel,
    analysisNotice,
    isAnalyzing,
    aiProviderReady,
    actions: buildWorkspaceActions(activeFolder?.id ?? null, scopedAnalyses.length > 0)
  };
}

export function buildProductSignalViewModels(input: BuildProductSignalWorkspaceViewModelInput): ProductSignalViewModel[] {
  return buildProductSignalWorkspaceViewModel(input).signals;
}
