import { defineBackground } from "wxt/utils/define-background";
import {
  fetchCapture,
  fetchJob,
  fetchWorkerStatus,
  normalizeBaseUrl,
  submitCaptureTarget,
  triggerWorkerDrain
} from "../src/ingest/client";
import type { CaptureSnapshot, CaptureTargetResponse, JobSnapshot } from "../src/contracts/ingest";
import type { ExtensionMessage, ExtensionResponse, StartProcessingResponse, WorkerStatusMessageResponse } from "../src/state/messages";
import {
  buildCompareBriefCacheKey,
  buildDeterministicCompareBrief,
  normalizeCompareBrief,
  type CompareBrief,
  type CompareBriefRequest
} from "../src/compare/brief";
import { buildCompareBriefRequest } from "../src/compare/brief-request";
import { buildCompareOneLinerCacheKey, type CompareOneLinerRequest } from "../src/compare/one-liner";
import {
  buildCompareClusterSummaryCacheKey,
  type ClusterInterpretation,
  type CompareClusterSummaryRequest
} from "../src/compare/cluster-interpretation";
import {
  buildEvidenceAnnotationCacheKey,
  type EvidenceAnnotation,
  type EvidenceAnnotationRequest
} from "../src/compare/evidence-annotation";
import {
  buildDeterministicJudgment,
  buildJudgmentCacheKey,
  COMPARE_JUDGMENT_PROMPT_VERSION
} from "../src/compare/judgment";
import {
  loadSavedAnalyses,
  saveSavedAnalysis,
  saveSavedAnalysisJudgment
} from "../src/compare/saved-analysis-storage";
import { loadTechniqueReadings, saveTechniqueReading } from "../src/compare/technique-reading-storage";
import { generateProductProfileSuggestion } from "../src/compare/product-profile-init";
import {
  generateProductContext,
  isProductContextSourceReady,
  LEGACY_PRODUCT_CONTEXT_STORAGE_KEY,
  PRODUCT_CONTEXT_STORAGE_KEY
} from "../src/compare/product-context";
import {
  buildProductContextHash,
  buildProductSignalAnalyzerInputFromCapture,
  collectQueueableProductSignalItemIds,
  PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
  shouldAutoAnalyzeProductSignal
} from "../src/compare/product-signal-analysis";
import {
  getProductSignalAnalysis,
  listProductSignalAnalyses,
  saveProductSignalAnalysis
} from "../src/compare/product-signal-storage";
import { listProductAgentTaskFeedback, saveProductAgentTaskFeedback } from "../src/compare/product-agent-task-feedback";
import { buildProductSignalPreferenceExamples } from "../src/compare/product-signal-history";
import {
  COMPARE_CLUSTER_SUMMARY_PROMPT_VERSION,
  COMPARE_BRIEF_PROMPT_VERSION,
  COMPARE_ONE_LINER_PROMPT_VERSION,
  COMPARE_EVIDENCE_ANNOTATION_PROMPT_VERSION,
  generateCompareBrief,
  generateCompareClusterSummaries,
  generateCompareOneLiner,
  generateEvidenceAnnotations,
  generateJudgment,
  generateProductSignalAnalysis
} from "../src/compare/provider";
import { createLlmCallWrapper } from "../src/compare/llm-call-wrapper";
import {
  createDefaultSettings,
  createEmptyGlobalState,
  createEmptyTabState,
  type ExtensionGlobalState,
  type ExtensionSnapshot,
  type FolderMode,
  type ProductContext,
  type ProductSignalAnalysis,
  type SessionItem,
  type SessionRecord,
  type TabUiState
} from "../src/state/types";
import {
  createSessionRecord,
  deleteSession,
  expireStaleInFlightItems,
  getActiveSession,
  markSessionItemQueued,
  mergeItemRefreshResultsIntoGlobal,
  mergeRefreshResults,
  needsCaptureRefresh,
  normalizeSessionRecord,
  reconcileSessionItem,
  renameSession,
  saveDescriptorToSession,
  setActiveSession,
  updateSessionItem,
  type ItemRefreshResult
} from "../src/state/store-helpers";
import { ensureSignalForSavedItem, handleTopicMessage } from "../src/state/topic-handlers";
import { loadSignals } from "../src/state/topic-storage";
import { mergeOneLinerSettings } from "../src/state/settings-storage";
import { buildRefreshFailureMessage } from "../src/state/refresh-errors";
import { createAsyncLock } from "../src/state/snapshot-lock";
import { applyHoveredPreview, createInlineToast, setCollectModeState } from "../src/state/ui-state";

const GLOBAL_STORAGE_KEY = "dlens:v0:global-state";
const TAB_STORAGE_KEY_PREFIX = "dlens:v0:tab-ui:";
const COMPARE_BRIEF_CACHE_KEY = "dlens:v1:compare-brief-cache";
const COMPARE_ONE_LINER_CACHE_KEY = "dlens:v1:compare-one-liner-cache";
const COMPARE_CLUSTER_SUMMARY_CACHE_KEY = "dlens:v1:compare-cluster-summary-cache";
const COMPARE_EVIDENCE_ANNOTATION_CACHE_KEY = "dlens:v1:compare-evidence-annotation-cache";
const COMPARE_JUDGMENT_CACHE_KEY = "dlens:v1:compare-judgment-cache";
const COMPARE_CACHE_MAX_ENTRIES = 50;
const productSignalAnalysisInFlight = new Map<string, Promise<ProductSignalAnalysis[]>>();

// In-memory hover state per tab — never persisted to storage
const tabHoverCache = new Map<number, Pick<TabUiState, "hoveredTarget" | "hoveredTargetStrength" | "flashPreview" | "currentPreview">>();

// In-memory global state cache — survives within a single service worker lifetime.
// When the worker restarts, this is null and gets lazily reloaded from storage.
let globalStateCache: ExtensionGlobalState | null = null;
const withSnapshotLock = createAsyncLock();

interface OneLinerCacheValue {
  text: string;
  generatedAt: string;
}

interface CompareBriefCacheValue {
  brief: CompareBrief;
  generatedAt: string;
}

interface ClusterSummaryCacheValue {
  items: ClusterInterpretation[];
  generatedAt: string;
}

interface EvidenceAnnotationCacheValue {
  items: EvidenceAnnotation[];
  generatedAt: string;
}

interface JudgmentCacheValue {
  judgmentResult: NonNullable<Awaited<ReturnType<typeof loadSavedAnalyses>>[number]["judgmentResult"]>;
  generatedAt: string;
}

type CompareBriefCache = Record<string, CompareBriefCacheValue>;
type OneLinerCache = Record<string, OneLinerCacheValue>;
type ClusterSummaryCache = Record<string, ClusterSummaryCacheValue>;
type EvidenceAnnotationCache = Record<string, EvidenceAnnotationCacheValue>;
type JudgmentCache = Record<string, JudgmentCacheValue>;

function tabStorageKey(tabId: number): string {
  return `${TAB_STORAGE_KEY_PREFIX}${tabId}`;
}

function withTimestamp<T extends { updatedAt: string | null }>(value: T): T {
  return {
    ...value,
    updatedAt: new Date().toISOString()
  };
}

async function getActiveTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!tabId) {
    throw new Error("No active tab available");
  }
  return tabId;
}

async function resolveTabId(sender: chrome.runtime.MessageSender, explicitTabId?: number): Promise<number> {
  if (explicitTabId) {
    return explicitTabId;
  }
  if (sender.tab?.id) {
    return sender.tab.id;
  }
  return getActiveTabId();
}

async function loadGlobalState(): Promise<ExtensionGlobalState> {
  const raw = await chrome.storage.local.get(GLOBAL_STORAGE_KEY);
  const normalized = normalizeGlobalState(raw[GLOBAL_STORAGE_KEY] || createEmptyGlobalState());
  const expired = expireStaleInFlightItems(normalized);
  if (expired !== normalized) {
    await chrome.storage.local.set({ [GLOBAL_STORAGE_KEY]: expired });
  }
  return expired;
}

async function loadTabState(tabId: number): Promise<TabUiState> {
  const raw = await chrome.storage.local.get(tabStorageKey(tabId));
  return normalizeTabState(raw[tabStorageKey(tabId)] || createEmptyTabState());
}

async function loadSnapshot(tabId: number): Promise<ExtensionSnapshot> {
  const [global, tab] = await Promise.all([loadGlobalState(), loadTabState(tabId)]);
  return { global, tab };
}

function normalizeGlobalState(state: ExtensionGlobalState): ExtensionGlobalState {
  return {
    ...state,
    sessions: Array.isArray(state?.sessions) ? state.sessions.map((session) => normalizeSessionRecord(session)) : [],
    settings: {
      ...createDefaultSettings(),
      ...(state?.settings || {})
    }
  };
}

function normalizeTabState(state: Partial<TabUiState> & { popupPage?: string | null }): TabUiState {
  const base = createEmptyTabState();
  const rawPopupPage: string = typeof state?.popupPage === "string" ? state.popupPage : "";
  const currentMainPage = state?.currentMainPage || (rawPopupPage === "settings" ? base.currentMainPage : (rawPopupPage as TabUiState["currentMainPage"] | undefined)) || base.currentMainPage;
  const popupPage = (rawPopupPage as TabUiState["popupPage"] | "") || currentMainPage;

  return {
    ...base,
    ...(state || {}),
    popupPage,
    currentMainPage
  };
}

async function loadOneLinerCache(): Promise<OneLinerCache> {
  const raw = await chrome.storage.local.get(COMPARE_ONE_LINER_CACHE_KEY);
  return (raw[COMPARE_ONE_LINER_CACHE_KEY] || {}) as OneLinerCache;
}

async function loadCompareBriefCache(): Promise<CompareBriefCache> {
  const raw = await chrome.storage.local.get(COMPARE_BRIEF_CACHE_KEY);
  return (raw[COMPARE_BRIEF_CACHE_KEY] || {}) as CompareBriefCache;
}

async function saveCompareBriefCache(cache: CompareBriefCache): Promise<void> {
  await chrome.storage.local.set({ [COMPARE_BRIEF_CACHE_KEY]: cache });
}

async function getCachedCompareBrief(request: CompareBriefRequest): Promise<{ brief: CompareBrief; cacheKey: string } | null> {
  const cache = await loadCompareBriefCache();
  const fallback = buildDeterministicCompareBrief(request, "AI compare brief unavailable.");

  for (const provider of ["google", "openai", "claude"] as const) {
    const cacheKey = buildCompareBriefCacheKey(request, provider, COMPARE_BRIEF_PROMPT_VERSION);
    const cachedBrief = cache[cacheKey]?.brief;
    if (!cachedBrief) {
      continue;
    }
    return {
      brief: normalizeCompareBrief(cachedBrief, fallback),
      cacheKey
    };
  }

  return null;
}

async function saveOneLinerCache(cache: OneLinerCache): Promise<void> {
  await chrome.storage.local.set({ [COMPARE_ONE_LINER_CACHE_KEY]: cache });
}

async function loadClusterSummaryCache(): Promise<ClusterSummaryCache> {
  const raw = await chrome.storage.local.get(COMPARE_CLUSTER_SUMMARY_CACHE_KEY);
  return (raw[COMPARE_CLUSTER_SUMMARY_CACHE_KEY] || {}) as ClusterSummaryCache;
}

async function saveClusterSummaryCache(cache: ClusterSummaryCache): Promise<void> {
  await chrome.storage.local.set({ [COMPARE_CLUSTER_SUMMARY_CACHE_KEY]: cache });
}

async function loadEvidenceAnnotationCache(): Promise<EvidenceAnnotationCache> {
  const raw = await chrome.storage.local.get(COMPARE_EVIDENCE_ANNOTATION_CACHE_KEY);
  return (raw[COMPARE_EVIDENCE_ANNOTATION_CACHE_KEY] || {}) as EvidenceAnnotationCache;
}

async function saveEvidenceAnnotationCache(cache: EvidenceAnnotationCache): Promise<void> {
  await chrome.storage.local.set({ [COMPARE_EVIDENCE_ANNOTATION_CACHE_KEY]: cache });
}

async function loadJudgmentCache(): Promise<JudgmentCache> {
  const raw = await chrome.storage.local.get(COMPARE_JUDGMENT_CACHE_KEY);
  return (raw[COMPARE_JUDGMENT_CACHE_KEY] || {}) as JudgmentCache;
}

async function saveJudgmentCache(cache: JudgmentCache): Promise<void> {
  await chrome.storage.local.set({ [COMPARE_JUDGMENT_CACHE_KEY]: cache });
}

async function saveProductContext(productContext: ProductContext | null): Promise<void> {
  await chrome.storage.local.set({ [PRODUCT_CONTEXT_STORAGE_KEY]: productContext });
  await chrome.storage.local.remove(LEGACY_PRODUCT_CONTEXT_STORAGE_KEY);
}

async function loadProductContext(): Promise<ProductContext | null> {
  const raw = await chrome.storage.local.get([
    PRODUCT_CONTEXT_STORAGE_KEY,
    LEGACY_PRODUCT_CONTEXT_STORAGE_KEY
  ]);
  const value = raw[PRODUCT_CONTEXT_STORAGE_KEY] ?? raw[LEGACY_PRODUCT_CONTEXT_STORAGE_KEY];
  if (value && typeof value === "object" && !raw[PRODUCT_CONTEXT_STORAGE_KEY]) {
    await chrome.storage.local.set({ [PRODUCT_CONTEXT_STORAGE_KEY]: value });
    await chrome.storage.local.remove(LEGACY_PRODUCT_CONTEXT_STORAGE_KEY);
  }
  return value && typeof value === "object" ? value as ProductContext : null;
}

function compactProviderError(error: unknown, apiKey?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
  return redacted.replace(/\s+/g, " ").trim().slice(0, 360) || "Unknown provider error";
}

function buildProductSignalErrorAnalysis({
  signalId,
  productContextHash,
  error,
  apiKey
}: {
  signalId: string;
  productContextHash: string;
  error: unknown;
  apiKey?: string;
}): ProductSignalAnalysis {
  const message = compactProviderError(error, apiKey);
  return {
    signalId,
    signalType: "noise",
    signalSubtype: "analysis_error",
    contentType: "mixed",
    contentSummary: "產品訊號分析失敗。",
    relevance: 1,
    relevantTo: [],
    whyRelevant: "這次分析沒有產生可信結果。",
    verdict: "insufficient_data",
    reason: message,
    evidenceRefs: [],
    productContextHash,
    promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
    analyzedAt: new Date().toISOString(),
    status: "error",
    error: message
  };
}

async function compileProductContextIfReady(global: ExtensionGlobalState): Promise<{ productContext: ProductContext | null; error: string | null }> {
  const productProfile = global.settings.productProfile;
  if (!productProfile || !isProductContextSourceReady(productProfile)) {
    await saveProductContext(null);
    return { productContext: null, error: null };
  }

  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    await saveProductContext(null);
    return { productContext: null, error: "尚未設定目前 AI provider 的 API key。" };
  }

  try {
    const productContext = await generateProductContext(
      providerConfig.provider,
      providerConfig.apiKey,
      productProfile
    );
    await saveProductContext(productContext);
    return { productContext, error: null };
  } catch (error) {
    console.error("[dlens] product context compile failed:", error instanceof Error ? error.message : error);
    await saveProductContext(null);
    return { productContext: null, error: compactProviderError(error, providerConfig.apiKey) };
  }
}

async function analyzeProductSignalsForSession(
  global: ExtensionGlobalState,
  sessionId: string,
  options: { allowMissingPrerequisites?: boolean } = {}
): Promise<ProductSignalAnalysis[]> {
  const inFlight = productSignalAnalysisInFlight.get(sessionId);
  if (inFlight) {
    return inFlight;
  }
  const run = analyzeProductSignalsForSessionUnlocked(global, sessionId, options);
  productSignalAnalysisInFlight.set(sessionId, run);
  try {
    return await run;
  } finally {
    productSignalAnalysisInFlight.delete(sessionId);
  }
}

async function analyzeProductSignalsForSessionUnlocked(
  global: ExtensionGlobalState,
  sessionId: string,
  options: { allowMissingPrerequisites?: boolean } = {}
): Promise<ProductSignalAnalysis[]> {
  const session = normalizeGlobalState(global).sessions.find((entry) => entry.id === sessionId) || null;
  if (!session || session.mode !== "product") {
    return [];
  }

  const productContext = await loadProductContext();
  if (!productContext) {
    if (!options.allowMissingPrerequisites) {
      throw new Error("ProductContext 尚未編譯。請先在 Settings 匯入並儲存產品文件。");
    }
    return listProductSignalAnalyses(chrome.storage.local);
  }

  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    if (!options.allowMissingPrerequisites) {
      throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
    }
    return listProductSignalAnalyses(chrome.storage.local);
  }

  const productContextHash = buildProductContextHash(productContext);
  const signals = await loadSignals(chrome.storage.local, sessionId);
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const [agentTaskFeedback, historicalAnalyses] = await Promise.all([
    listProductAgentTaskFeedback(chrome.storage.local),
    listProductSignalAnalyses(chrome.storage.local)
  ]);
  const feedbackExamples = buildProductSignalPreferenceExamples(agentTaskFeedback, historicalAnalyses);
  const touchedSignalIds: string[] = [];
  let skippedReadyWithoutContent = 0;

  for (const signal of signals) {
    if (!signal.itemId || signal.inboxStatus === "archived" || signal.inboxStatus === "rejected") {
      continue;
    }
    touchedSignalIds.push(signal.id);
    const existing = await getProductSignalAnalysis(chrome.storage.local, signal.id);

    const item = itemsById.get(signal.itemId) || null;
    if (!item) {
      continue;
    }
    if (!shouldAutoAnalyzeProductSignal({
      sessionMode: session.mode,
      itemStatus: item.status,
      capture: item.latestCapture,
      existingAnalysis: existing,
      productContextHash
    })) {
      if (item.status === "succeeded" && !existing) {
        skippedReadyWithoutContent += 1;
      }
      continue;
    }

    const input = buildProductSignalAnalyzerInputFromCapture({
      signalId: signal.id,
      source: signal.source,
      capture: item?.latestCapture,
      productContext,
      productContextHash,
      feedbackExamples
    });
    if (!input) {
      skippedReadyWithoutContent += 1;
      continue;
    }

    try {
      const analysis = await generateProductSignalAnalysis(
        providerConfig.provider,
        providerConfig.apiKey,
        input
      );
      await saveProductSignalAnalysis(chrome.storage.local, analysis);
    } catch (error) {
      console.error("[dlens] product signal analysis failed:", signal.id, error instanceof Error ? error.message : error);
      await saveProductSignalAnalysis(
        chrome.storage.local,
        buildProductSignalErrorAnalysis({
          signalId: signal.id,
          productContextHash,
          error,
          apiKey: providerConfig.apiKey
        })
      );
    }
  }

  if (skippedReadyWithoutContent > 0 && !options.allowMissingPrerequisites) {
    throw new Error("crawl 已完成，但沒有 assembled content 可分析。請重新處理該貼文。");
  }

  return listProductSignalAnalyses(chrome.storage.local, touchedSignalIds);
}

async function queueSavedProductSignalItemsForAnalysis(
  tabId: number,
  sessionId: string
): Promise<{ snapshot: ExtensionSnapshot; queued: number }> {
  let snapshot = await loadSnapshot(tabId);
  const session = snapshot.global.sessions.find((entry) => entry.id === sessionId) || null;
  if (!session || session.mode !== "product") {
    return { snapshot, queued: 0 };
  }

  const signals = await loadSignals(chrome.storage.local, sessionId);
  const queueableItemIds = collectQueueableProductSignalItemIds(session, signals);
  let queued = 0;

  for (const itemId of queueableItemIds) {
    const latest = await loadSnapshot(tabId);
    const latestSession = latest.global.sessions.find((entry) => entry.id === sessionId) || null;
    const latestItem = latestSession?.items.find((item) => item.id === itemId) || null;
    if (latestItem?.status !== "saved") {
      snapshot = latest;
      continue;
    }
    const result = await queueSessionItem(tabId, sessionId, itemId);
    snapshot = result.snapshot;
    queued += 1;
  }

  return { snapshot, queued };
}

function queueProductSignalAutoAnalysis(global: ExtensionGlobalState, sessionId: string): void {
  void analyzeProductSignalsForSession(global, sessionId, { allowMissingPrerequisites: true })
    .catch((error) => {
      console.error("[dlens] product signal auto analysis failed:", error instanceof Error ? error.message : error);
    });
}

function findSessionItems(
  sessions: SessionRecord[],
  itemAId: string,
  itemBId: string
): { itemA: SessionItem; itemB: SessionItem } | null {
  const itemLookup = new Map<string, SessionItem>();
  for (const session of sessions) {
    for (const item of session.items) {
      itemLookup.set(item.id, item);
    }
  }
  const itemA = itemLookup.get(itemAId) || null;
  const itemB = itemLookup.get(itemBId) || null;
  if (!itemA || !itemB) {
    return null;
  }
  return { itemA, itemB };
}

function providerKeyForRequest(global: ExtensionGlobalState): { provider: "openai" | "claude" | "google"; apiKey: string } | null {
  const settings = normalizeGlobalState(global).settings;
  if (settings.oneLinerProvider === "google" && settings.googleApiKey?.trim()) {
    return { provider: "google", apiKey: settings.googleApiKey.trim() };
  }
  if (settings.oneLinerProvider === "openai" && settings.openaiApiKey.trim()) {
    return { provider: "openai", apiKey: settings.openaiApiKey.trim() };
  }
  if (settings.oneLinerProvider === "claude" && settings.claudeApiKey.trim()) {
    return { provider: "claude", apiKey: settings.claudeApiKey.trim() };
  }
  return null;
}

const getOrGenerateOneLiner = createLlmCallWrapper<
  ExtensionGlobalState,
  CompareOneLinerRequest,
  string | null,
  OneLinerCacheValue,
  {}
>({
  maxEntries: COMPARE_CACHE_MAX_ENTRIES,
  resolveRequest: async (global) => {
    const providerConfig = providerKeyForRequest(global);
    if (!providerConfig) {
      return { kind: "return", value: null };
    }
    return { kind: "continue", providerConfig, context: {} };
  },
  buildCacheKey: (request, provider) => buildCompareOneLinerCacheKey(request, provider, COMPARE_ONE_LINER_PROMPT_VERSION),
  loadCache: loadOneLinerCache,
  saveCache: saveOneLinerCache,
  readCachedValue: (entry) => entry?.text || undefined,
  generate: async (providerConfig, request) => {
    const text = (await generateCompareOneLiner(providerConfig.provider, providerConfig.apiKey, request)).trim();
    return text || null;
  },
  buildCacheEntry: (result) => {
    if (!result) {
      return null;
    }
    return {
      text: result,
      generatedAt: new Date().toISOString()
    };
  }
});

const getOrGenerateCompareBrief = createLlmCallWrapper<
  ExtensionGlobalState,
  CompareBriefRequest,
  CompareBrief,
  CompareBriefCacheValue,
  { fallback: CompareBrief }
>({
  maxEntries: COMPARE_CACHE_MAX_ENTRIES,
  resolveRequest: async (global, request) => {
    const providerConfig = providerKeyForRequest(global);
    const fallback = buildDeterministicCompareBrief(
      request,
      providerConfig ? "AI compare brief unavailable." : "AI compare brief disabled."
    );
    if (!providerConfig) {
      return { kind: "return", value: fallback };
    }
    return {
      kind: "continue",
      providerConfig,
      context: { fallback }
    };
  },
  buildCacheKey: (request, provider) => buildCompareBriefCacheKey(request, provider, COMPARE_BRIEF_PROMPT_VERSION),
  loadCache: loadCompareBriefCache,
  saveCache: saveCompareBriefCache,
  readCachedValue: (entry, context) => {
    const cached = entry?.brief;
    if (cached?.source === "ai") {
      return normalizeCompareBrief(cached, context.context.fallback);
    }
    return undefined;
  },
  generate: async (providerConfig, request, context) => {
    const brief = await generateCompareBrief(providerConfig.provider, providerConfig.apiKey, request);
    return normalizeCompareBrief(brief, context.context.fallback);
  },
  buildCacheEntry: (result) => ({
    brief: result,
    generatedAt: new Date().toISOString()
  }),
  onError: async (error, context) => {
    console.error("[dlens] compare brief AI call failed:", error instanceof Error ? error.message : error);
    return context.context.fallback;
  }
});

async function getCompareBriefForJudgment(
  global: ExtensionGlobalState,
  request: CompareBriefRequest
): Promise<{ brief: CompareBrief; cacheKey: string }> {
  const cached = await getCachedCompareBrief(request);
  if (cached) {
    return cached;
  }

  const brief = await getOrGenerateCompareBrief(global, request);
  const provider = providerKeyForRequest(global)?.provider || normalizeGlobalState(global).settings.oneLinerProvider || "google";
  return {
    brief,
    cacheKey: buildCompareBriefCacheKey(request, provider, COMPARE_BRIEF_PROMPT_VERSION)
  };
}

const getOrGenerateClusterSummaries = createLlmCallWrapper<
  ExtensionGlobalState,
  CompareClusterSummaryRequest,
  ClusterInterpretation[],
  ClusterSummaryCacheValue,
  {}
>({
  maxEntries: COMPARE_CACHE_MAX_ENTRIES,
  resolveRequest: async (global, request) => {
    const providerConfig = providerKeyForRequest(global);
    if (!providerConfig || !request.clusters.length) {
      return { kind: "return", value: [] };
    }
    return { kind: "continue", providerConfig, context: {} };
  },
  buildCacheKey: (request, provider) =>
    buildCompareClusterSummaryCacheKey(request, provider, COMPARE_CLUSTER_SUMMARY_PROMPT_VERSION),
  loadCache: loadClusterSummaryCache,
  saveCache: saveClusterSummaryCache,
  readCachedValue: (entry) => (entry?.items?.length ? entry.items : undefined),
  generate: async (providerConfig, request) =>
    generateCompareClusterSummaries(providerConfig.provider, providerConfig.apiKey, request),
  buildCacheEntry: (result) => {
    if (!result.length) {
      return null;
    }
    return {
      items: result,
      generatedAt: new Date().toISOString()
    };
  }
});

const getOrGenerateEvidenceAnnotations = createLlmCallWrapper<
  ExtensionGlobalState,
  EvidenceAnnotationRequest,
  EvidenceAnnotation[],
  EvidenceAnnotationCacheValue,
  {}
>({
  maxEntries: COMPARE_CACHE_MAX_ENTRIES,
  resolveRequest: async (global, request) => {
    if (!request.quotes.length) {
      return { kind: "return", value: [] };
    }
    const providerConfig = providerKeyForRequest(global);
    if (!providerConfig) {
      return { kind: "return", value: [] };
    }
    return { kind: "continue", providerConfig, context: {} };
  },
  buildCacheKey: (request, provider) =>
    buildEvidenceAnnotationCacheKey(request, provider, COMPARE_EVIDENCE_ANNOTATION_PROMPT_VERSION),
  loadCache: loadEvidenceAnnotationCache,
  saveCache: saveEvidenceAnnotationCache,
  readCachedValue: (entry) => (entry?.items?.length ? entry.items : undefined),
  generate: async (providerConfig, request) =>
    generateEvidenceAnnotations(providerConfig.provider, providerConfig.apiKey, request),
  buildCacheEntry: (result) => {
    if (!result.length) {
      return null;
    }
    return {
      items: result,
      generatedAt: new Date().toISOString()
    };
  },
  onError: async (error) => {
    console.error("[dlens] evidence annotation AI call failed:", error instanceof Error ? error.message : error);
    return [];
  }
});

type JudgmentRequest = {
  brief: CompareBrief;
  productProfile: NonNullable<ExtensionGlobalState["settings"]["productProfile"]>;
  briefHash: string;
  profileHash: string;
};

type JudgmentOutcome = {
  judgmentResult: NonNullable<JudgmentCacheValue["judgmentResult"]>;
  judgmentSource: "ai" | "fallback";
};

const getOrGenerateJudgment = createLlmCallWrapper<
  ExtensionGlobalState,
  JudgmentRequest,
  JudgmentOutcome,
  JudgmentCacheValue,
  { fallback: JudgmentOutcome }
>({
  maxEntries: COMPARE_CACHE_MAX_ENTRIES,
  resolveRequest: async (global, request) => {
    const providerConfig = providerKeyForRequest(global);
    const fallback: JudgmentOutcome = {
      judgmentResult: buildDeterministicJudgment(
        request.brief,
        request.productProfile,
        providerConfig ? "AI judgment unavailable." : "AI judgment disabled."
      ),
      judgmentSource: "fallback"
    };
    if (!providerConfig) {
      return { kind: "return", value: fallback };
    }
    return {
      kind: "continue",
      providerConfig,
      context: { fallback }
    };
  },
  buildCacheKey: (request) => buildJudgmentCacheKey(
    request.briefHash,
    request.profileHash,
    COMPARE_JUDGMENT_PROMPT_VERSION
  ),
  loadCache: loadJudgmentCache,
  saveCache: saveJudgmentCache,
  readCachedValue: (entry) =>
    entry
      ? {
        judgmentResult: entry.judgmentResult,
        judgmentSource: "ai"
      }
      : undefined,
  generate: async (providerConfig, request) => ({
    judgmentResult: await generateJudgment(
      providerConfig.provider,
      providerConfig.apiKey,
      request.brief,
      request.productProfile
    ),
    judgmentSource: "ai"
  }),
  buildCacheEntry: (result) => {
    if (result.judgmentSource !== "ai") {
      return null;
    }
    return {
      judgmentResult: result.judgmentResult,
      generatedAt: new Date().toISOString()
    };
  },
  onError: async (error, context) => {
    console.error("[dlens] judgment AI call failed:", error instanceof Error ? error.message : error);
    return context.context.fallback;
  }
});

async function saveSnapshot(tabId: number, snapshot: ExtensionSnapshot): Promise<ExtensionSnapshot> {
  const nextSnapshot = {
    global: withTimestamp(snapshot.global),
    tab: withTimestamp(normalizeTabState(snapshot.tab))
  };
  // Invalidate global cache so next loadGlobalState() reads fresh data
  globalStateCache = nextSnapshot.global;
  await chrome.storage.local.set({
    [GLOBAL_STORAGE_KEY]: nextSnapshot.global,
    [tabStorageKey(tabId)]: nextSnapshot.tab
  });
  // Broadcast to the content script in this specific tab (avoids "Receiving end does not exist")
  await chrome.tabs
    .sendMessage(tabId, { type: "state/updated", tabId, snapshot: nextSnapshot } satisfies ExtensionMessage)
    .catch(() => undefined);
  return nextSnapshot;
}

/** Merge in-memory hover state into a snapshot for the UI without writing to storage */
function snapshotWithHover(tabId: number, snapshot: ExtensionSnapshot): ExtensionSnapshot {
  const hover = tabHoverCache.get(tabId);
  if (!hover) return snapshot;
  return {
    global: snapshot.global,
    tab: {
      ...snapshot.tab,
      hoveredTarget: hover.hoveredTarget,
      hoveredTargetStrength: hover.hoveredTargetStrength,
      flashPreview: hover.flashPreview,
      currentPreview: hover.currentPreview ?? snapshot.tab.currentPreview
    }
  };
}

async function patchSnapshot(
  tabId: number,
  patch: {
    global?: Partial<ExtensionGlobalState>;
    tab?: Partial<TabUiState>;
  }
): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  return saveSnapshot(tabId, {
    global: {
      ...current.global,
      ...(patch.global || {})
    },
    tab: {
      ...current.tab,
      ...(patch.tab || {})
    }
  });
}

async function broadcastToAllTabs(message: ExtensionMessage): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === "number")
      .map((tabId) => chrome.tabs.sendMessage(tabId, message).catch(() => undefined))
  );
}

function activeSessionWithFallback(globalState: ExtensionGlobalState): SessionRecord {
  const session = getActiveSession(globalState);
  if (!session) {
    throw new Error("No active folder. Create one before saving.");
  }
  return session;
}

function ensureActiveItemId(session: SessionRecord, currentItemId: string | null): string | null {
  if (!session.items.length) {
    return null;
  }
  if (currentItemId && session.items.some((item) => item.id === currentItemId)) {
    return currentItemId;
  }
  return session.items[0].id;
}

async function openPopup(tabId: number): Promise<ExtensionSnapshot> {
  return patchSnapshot(tabId, {
    tab: {
      popupOpen: true
    }
  });
}

async function closePopup(tabId: number): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  if (current.tab.selectionMode) {
    await chrome.tabs.sendMessage(tabId, { type: "selection/cancel-tab", tabId } satisfies ExtensionMessage).catch(() => undefined);
  }
  return saveSnapshot(tabId, {
    global: current.global,
    tab: {
      ...setCollectModeState(current.tab, false),
      popupOpen: false
    }
  });
}

async function saveCurrentPreviewToSession(tabId: number): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  // In-memory hover cache always takes priority — storage may hold a stale preview
  // from a previous save, while the cache reflects the latest hover target
  const hover = tabHoverCache.get(tabId);
  if (hover?.currentPreview) {
    current.tab = { ...current.tab, currentPreview: hover.currentPreview };
  }
  if (!current.tab.currentPreview) {
    throw new Error("No current post preview to save.");
  }

  const session = getActiveSession(current.global);
  if (!session) {
    return saveSnapshot(tabId, {
      global: current.global,
      tab: {
        ...current.tab,
        popupOpen: true,
        popupPage: "library",
        currentMainPage: "library",
        error: null
      }
    });
  }

  const saved = saveDescriptorToSession(current.global, session.id, current.tab.currentPreview);
  await ensureSignalForSavedItem(chrome.storage.local, session, saved.item);
  return saveSnapshot(tabId, {
    global: saved.globalState,
    tab: {
      ...current.tab,
      activeItemId: saved.item.id,
      lastSavedToast: createInlineToast("saved", session.name),
      error: null
    }
  });
}

async function createSession(tabId: number, name: string, saveCurrentPreview = false, mode: FolderMode = "topic"): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Folder name is required.");
  }

  let globalState = current.global;
  const session = {
    ...createSessionRecord(trimmed),
    mode
  };
  globalState = {
    ...globalState,
    sessions: [...globalState.sessions, session],
    activeSessionId: session.id
  };

  // In-memory hover cache takes priority over stale storage
  const hover = tabHoverCache.get(tabId);
  if (hover?.currentPreview) {
    current.tab = { ...current.tab, currentPreview: hover.currentPreview };
  }

  let activeItemId = current.tab.activeItemId;
  let popupPage = current.tab.popupPage;
  let currentMainPage = current.tab.currentMainPage;
  let lastSavedToast = current.tab.lastSavedToast;
  if (saveCurrentPreview) {
    if (!current.tab.currentPreview) {
      throw new Error("No current post preview to save.");
    }
    const saved = saveDescriptorToSession(globalState, session.id, current.tab.currentPreview);
    globalState = saved.globalState;
    await ensureSignalForSavedItem(chrome.storage.local, session, saved.item);
    activeItemId = saved.item.id;
    popupPage = "library";
    currentMainPage = "library";
    lastSavedToast = createInlineToast("saved", session.name);
  }

  return saveSnapshot(tabId, {
    global: globalState,
    tab: {
      ...current.tab,
      activeItemId,
      popupPage,
      currentMainPage,
      lastSavedToast,
      error: null
    }
  });
}

async function renameExistingSession(tabId: number, sessionId: string, name: string): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  return saveSnapshot(tabId, {
    global: renameSession(current.global, sessionId, name),
    tab: {
      ...current.tab,
      error: null
    }
  });
}

async function deleteExistingSession(tabId: number, sessionId: string): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  const globalState = deleteSession(current.global, sessionId);
  const nextSession = getActiveSession(globalState);
  const nextItemId = nextSession ? ensureActiveItemId(nextSession, current.tab.activeItemId) : null;
  const nextItem = nextSession?.items.find((item) => item.id === nextItemId) || null;

  return saveSnapshot(tabId, {
    global: globalState,
    tab: {
      ...current.tab,
      activeItemId: nextItemId,
      currentPreview: nextItem?.descriptor || current.tab.hoveredTarget,
      popupPage: "library",
      currentMainPage: "library",
      error: null
    }
  });
}

async function setActiveSessionById(tabId: number, sessionId: string): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  const globalState = setActiveSession(current.global, sessionId);
  const activeSession = activeSessionWithFallback(globalState);
  const activeItemId = ensureActiveItemId(activeSession, current.tab.activeItemId);
  const activeItem = activeSession.items.find((item) => item.id === activeItemId) || null;
  return saveSnapshot(tabId, {
    global: globalState,
    tab: {
      ...current.tab,
      activeItemId,
      currentPreview: activeItem?.descriptor || current.tab.hoveredTarget,
      popupPage: "library",
      currentMainPage: "library",
      error: null
    }
  });
}

async function setActiveItem(tabId: number, sessionId: string, itemId: string): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  const globalState = current.global.activeSessionId === sessionId ? current.global : setActiveSession(current.global, sessionId);
  const session = globalState.sessions.find((candidate) => candidate.id === sessionId);
  const item = session?.items.find((candidate) => candidate.id === itemId) || null;
  return saveSnapshot(tabId, {
    global: globalState,
    tab: {
      ...current.tab,
      activeItemId: itemId,
      currentPreview: item?.descriptor || current.tab.currentPreview,
      error: null
    }
  });
}

async function queueSessionItem(
  tabId: number,
  sessionId: string,
  itemId: string
): Promise<{ snapshot: ExtensionSnapshot; submit: CaptureTargetResponse }> {
  return withSnapshotLock(async () => {
    const current = await loadSnapshot(tabId);
    const session = current.global.sessions.find((candidate) => candidate.id === sessionId);
    const item = session?.items.find((candidate) => candidate.id === itemId);
    if (!session || !item) {
      throw new Error("Saved post not found.");
    }

    const baseUrl = normalizeBaseUrl(current.global.settings.ingestBaseUrl);
    const submit = await submitCaptureTarget(baseUrl, item.descriptor, session.name);
    const initialJob = await fetchJob(baseUrl, submit.job_id).catch(() => null);

    let globalState = updateSessionItem(current.global, sessionId, itemId, (existing) =>
      markSessionItemQueued(existing, submit, initialJob)
    );

    if (initialJob) {
      const refreshedCapture = await fetchCapture(baseUrl, submit.capture_id).catch(() => null);
      globalState = updateSessionItem(globalState, sessionId, itemId, (existing) =>
        reconcileSessionItem(existing, initialJob, refreshedCapture)
      );
    }

    const nextSnapshot = await saveSnapshot(tabId, {
      global: globalState,
      tab: {
        ...current.tab,
        activeItemId: itemId,
        lastSavedToast: createInlineToast("queued", session.name),
        error: null
      }
    });
    if (session.mode === "product") {
      queueProductSignalAutoAnalysis(nextSnapshot.global, sessionId);
    }

    return {
      snapshot: nextSnapshot,
      submit
    };
  });
}

async function queueSelectedItem(tabId: number): Promise<{ snapshot: ExtensionSnapshot; submit: CaptureTargetResponse }> {
  const current = await loadSnapshot(tabId);
  const session = activeSessionWithFallback(current.global);
  const itemId = ensureActiveItemId(session, current.tab.activeItemId);
  if (!itemId) {
    throw new Error("No saved post selected.");
  }
  return queueSessionItem(tabId, session.id, itemId);
}

async function queueAllPending(tabId: number, sessionId?: string): Promise<ExtensionSnapshot> {
  let snapshot = await loadSnapshot(tabId);
  const session = sessionId
    ? snapshot.global.sessions.find((candidate) => candidate.id === sessionId)
    : getActiveSession(snapshot.global);
  if (!session) {
    throw new Error("No active folder.");
  }

  const pending = session.items.filter((item) => item.status === "saved" || item.status === "failed");

  // Keep queueing sequential so each item sees the latest persisted snapshot.
  for (const item of pending) {
    try {
      const result = await queueSessionItem(tabId, session.id, item.id);
      snapshot = result.snapshot;
    } catch (error) {
      console.error("failed to queue session item", error);
    }
  }

  return snapshot;
}

async function refreshItem(
  tabId: number,
  sessionId: string,
  itemId: string
): Promise<{ snapshot: ExtensionSnapshot; job: JobSnapshot | null; capture: CaptureSnapshot | null }> {
  return withSnapshotLock(async () => {
    const current = await loadSnapshot(tabId);
    const session = current.global.sessions.find((candidate) => candidate.id === sessionId);
    const item = session?.items.find((candidate) => candidate.id === itemId);
    if (!session || !item) {
      throw new Error("Saved post not found.");
    }
    if (!item.jobId || !item.captureId) {
      return {
        snapshot: current,
        job: item.latestJob,
        capture: item.latestCapture
      };
    }

    const baseUrl = normalizeBaseUrl(current.global.settings.ingestBaseUrl);
    const [jobResult, captureResult] = await Promise.allSettled([
      fetchJob(baseUrl, item.jobId),
      fetchCapture(baseUrl, item.captureId)
    ]);
    const { job, capture } = mergeRefreshResults(item, jobResult, captureResult);

    const globalState = updateSessionItem(current.global, sessionId, itemId, (existing) =>
      reconcileSessionItem(existing, job, capture)
    );
    const snapshot = await saveSnapshot(tabId, {
      global: globalState,
      tab: {
        ...current.tab,
        error: null
      }
    });
    if (session.mode === "product") {
      queueProductSignalAutoAnalysis(snapshot.global, sessionId);
    }

    return { snapshot, job, capture };
  });
}

async function refreshSelectedItem(
  tabId: number
): Promise<{ snapshot: ExtensionSnapshot; job: JobSnapshot | null; capture: CaptureSnapshot | null }> {
  const current = await loadSnapshot(tabId);
  const session = activeSessionWithFallback(current.global);
  const itemId = ensureActiveItemId(session, current.tab.activeItemId);
  if (!itemId) {
    throw new Error("No saved post selected.");
  }
  return refreshItem(tabId, session.id, itemId);
}

async function refreshAllItems(tabId: number, sessionId?: string): Promise<ExtensionSnapshot> {
  let snapshot = await loadSnapshot(tabId);
  const session = sessionId
    ? snapshot.global.sessions.find((candidate) => candidate.id === sessionId)
    : getActiveSession(snapshot.global);
  if (!session) {
    throw new Error("No active folder.");
  }

  const refreshable = session.items.filter((item) => needsCaptureRefresh(item));
  let firstFailureMessage: string | null = null;

  // Keep refresh sequential so later saves cannot overwrite earlier item updates.
  for (const item of refreshable) {
    try {
      const result = await refreshItem(tabId, session.id, item.id);
      snapshot = result.snapshot;
    } catch (error) {
      console.error("failed to refresh session item", error);
      if (!firstFailureMessage) {
        const itemIndex = session.items.findIndex((candidate) => candidate.id === item.id);
        const itemLabel = `#${itemIndex + 1} ${item.descriptor.author_hint || "Unknown"}`;
        firstFailureMessage = buildRefreshFailureMessage(itemLabel, error);
      }
    }
  }

  return saveSnapshot(tabId, {
    global: snapshot.global,
    tab: {
      ...snapshot.tab,
      error: firstFailureMessage
    }
  });
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  });

  // --- P1-A: MV3 wake recovery ---
  // When service worker restarts, reload global state eagerly so first message isn't slow.
  // Also handles keepalive ports from content scripts.
  async function warmGlobalCache(): Promise<ExtensionGlobalState> {
    if (!globalStateCache) {
      globalStateCache = await loadGlobalState();
    }
    return globalStateCache;
  }

  // Eagerly warm cache on worker start
  void warmGlobalCache();

  // Handle keepalive connections from content scripts
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "dlens-keepalive") {
      // Port exists solely to keep the service worker alive.
      // On disconnect (tab close, navigation, or content script reload),
      // clean up if the tab is gone.
      port.onDisconnect.addListener(() => {
        const tabId = port.sender?.tab?.id;
        if (tabId) {
          // Check if tab still exists; if not, clean up
          chrome.tabs.get(tabId).catch(() => {
            tabHoverCache.delete(tabId);
            void chrome.storage.local.remove(tabStorageKey(tabId)).catch(() => undefined);
          });
        }
      });
    }
  });

  // On startup (worker wake), resume polling for any running/queued items
  async function resumeRunningPolls(): Promise<void> {
    const global = await warmGlobalCache();
    const hasInFlight = global.sessions.some((session) =>
      session.items.some((item) => needsCaptureRefresh(item))
    );
    if (hasInFlight && global.settings.ingestBaseUrl) {
      // Schedule a single background refresh pass
      // We don't know the tabId here, so we refresh global state only
      // The next UI interaction will pick up the updated state
      void backgroundRefreshInFlightItems(global);
    }
  }

  async function backgroundRefreshInFlightItems(global: ExtensionGlobalState): Promise<void> {
    const baseUrl = normalizeBaseUrl(global.settings.ingestBaseUrl);
    const refreshResults: ItemRefreshResult[] = [];

    for (const session of global.sessions) {
      const inFlight = session.items.filter((item) => needsCaptureRefresh(item));
      if (!inFlight.length) continue;

      const results = await Promise.allSettled(
        inFlight.map(async (item) => {
          const [jobResult, captureResult] = await Promise.allSettled([
            fetchJob(baseUrl, item.jobId!),
            fetchCapture(baseUrl, item.captureId!)
          ]);
          const { job, capture } = mergeRefreshResults(item, jobResult, captureResult);
          return { itemId: item.id, sessionId: session.id, job, capture };
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        refreshResults.push(result.value);
      }
    }

    if (refreshResults.length) {
      await withSnapshotLock(async () => {
        const latest = await loadGlobalState();
        const merged = mergeItemRefreshResultsIntoGlobal(latest, refreshResults);
        globalStateCache = withTimestamp(merged);
        await chrome.storage.local.set({ [GLOBAL_STORAGE_KEY]: globalStateCache });
        for (const session of globalStateCache.sessions) {
          if (session.mode === "product") {
            queueProductSignalAutoAnalysis(globalStateCache, session.id);
          }
        }
      });
    }
  }

  // Fire-and-forget resume on worker start
  void resumeRunningPolls();

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabHoverCache.delete(tabId);
    void chrome.storage.local.remove(tabStorageKey(tabId)).catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    void (async () => {
      try {
        switch (message.type) {
          case "state/get-active-tab": {
            const tabId = await getActiveTabId();
            sendResponse({ ok: true, tabId, snapshot: snapshotWithHover(tabId, await loadSnapshot(tabId)) } satisfies ExtensionResponse);
            return;
          }
          case "state/get-tab": {
            sendResponse({
              ok: true,
              tabId: message.tabId,
              snapshot: await loadSnapshot(message.tabId)
            } satisfies ExtensionResponse);
            return;
          }
          case "settings/set-ingest-base-url": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const snapshot = await saveSnapshot(tabId, {
              global: {
                ...current.global,
                settings: {
                  ...current.global.settings,
                  ingestBaseUrl: normalizeBaseUrl(message.value)
                }
              },
              tab: {
                ...current.tab,
                error: null
              }
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }
          case "settings/set-product-profile": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const nextGlobal = {
              ...current.global,
              settings: {
                ...current.global.settings,
                productProfile: message.productProfile
              }
            };
            const snapshot = await saveSnapshot(tabId, {
              global: nextGlobal,
              tab: {
                ...current.tab,
                error: null
              }
            });
            const compileResult = await compileProductContextIfReady(nextGlobal);
            sendResponse({
              ok: true,
              tabId,
              snapshot,
              productContext: compileResult.productContext,
              productContextError: compileResult.error
            } satisfies ExtensionResponse);
            return;
          }
          case "settings/init-product-profile": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const providerConfig = providerKeyForRequest(current.global);
            if (!providerConfig) {
              sendResponse({ ok: false, error: "Configure a Google, OpenAI, or Claude key first." } satisfies ExtensionResponse);
              return;
            }
            const productProfile = await generateProductProfileSuggestion(
              providerConfig.provider,
              providerConfig.apiKey,
              message.description
            );
            sendResponse({
              ok: true,
              tabId,
              productProfile
            } satisfies ExtensionResponse);
            return;
          }
          case "settings/set-one-liner-config": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const settings = mergeOneLinerSettings(current.global.settings, {
              provider: message.provider,
              openaiApiKey: message.openaiApiKey,
              claudeApiKey: message.claudeApiKey,
              googleApiKey: message.googleApiKey
            });
            const snapshot = await saveSnapshot(tabId, {
              global: {
                ...current.global,
                settings
              },
              tab: {
                ...current.tab,
                error: null
              }
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }
          case "popup/open-active-tab": {
            const tabId = await resolveTabId(sender);
            sendResponse({ ok: true, tabId, snapshot: await openPopup(tabId) } satisfies ExtensionResponse);
            return;
          }
          case "popup/close-tab": {
            sendResponse({
              ok: true,
              tabId: message.tabId,
              snapshot: await closePopup(message.tabId)
            } satisfies ExtensionResponse);
            return;
          }
          case "popup/navigate-active-tab": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await patchSnapshot(tabId, {
                tab: {
                  popupPage: message.page,
                  currentMainPage: message.page === "settings" ? current.tab.currentMainPage : message.page,
                  popupOpen: true,
                  error: null
                }
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "selection/start-active-tab": {
            const tabId = await getActiveTabId();
            const current = await loadSnapshot(tabId);
            const activeMode = getActiveSession(current.global)?.mode ?? "archive";
            await chrome.tabs.sendMessage(tabId, { type: "selection/start-tab", tabId, mode: activeMode } satisfies ExtensionMessage);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveSnapshot(tabId, {
                global: current.global,
                tab: {
                  ...setCollectModeState(current.tab, true),
                  hoveredTarget: null,
                  hoveredTargetStrength: null,
                  flashPreview: null,
                  error: null
                }
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "selection/cancel-active-tab": {
            const tabId = await getActiveTabId();
            await chrome.tabs.sendMessage(tabId, { type: "selection/cancel-tab", tabId } satisfies ExtensionMessage);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveSnapshot(tabId, {
                global: current.global,
                tab: {
                  ...setCollectModeState(current.tab, false),
                  error: null
                }
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "selection/hovered": {
            // Hot path — keep hover state in-memory only, no storage writes
            const tabId = await resolveTabId(sender);
            const descriptor = message.descriptor;
            const strength = message.strength || null;
            tabHoverCache.set(tabId, {
              hoveredTarget: descriptor,
              hoveredTargetStrength: strength,
              flashPreview: descriptor,
              currentPreview: descriptor
            });
            const current = await loadSnapshot(tabId);
            const merged = snapshotWithHover(tabId, current);
            sendResponse({
              ok: true,
              tabId,
              snapshot: merged
            } satisfies ExtensionResponse);
            // Broadcast to tab so the in-page popup also gets the hover update
            chrome.tabs
              .sendMessage(tabId, { type: "state/updated", tabId, snapshot: merged } satisfies ExtensionMessage)
              .catch(() => undefined);
            return;
          }
          case "selection/selected": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveSnapshot(tabId, {
                global: current.global,
                tab: {
                  ...applyHoveredPreview(setCollectModeState(current.tab, false), message.descriptor),
                  popupOpen: true,
                  popupPage: "library",
                  currentMainPage: "library",
                  error: null
                }
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "selection/mode-changed": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveSnapshot(tabId, {
                global: current.global,
                tab: setCollectModeState(current.tab, message.enabled)
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "session/create": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await createSession(tabId, message.name, message.saveCurrentPreview, message.mode)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/rename": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await renameExistingSession(tabId, message.sessionId, message.name)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/delete": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await deleteExistingSession(tabId, message.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/set-active": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await setActiveSessionById(tabId, message.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/set-mode": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const global = {
              ...current.global,
              sessions: current.global.sessions.map((session) =>
                session.id === message.sessionId
                  ? {
                      ...session,
                      mode: message.mode,
                      updatedAt: new Date().toISOString()
                    }
                  : session
              )
            };
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveSnapshot(tabId, {
                global,
                tab: {
                  ...current.tab,
                  error: null
                }
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "topic/list":
          case "topic/create":
          case "topic/update":
          case "topic/delete":
          case "topic/add-pair":
          case "topic/remove-pair":
          case "signal/list":
          case "signal/triage": {
            const tabId = await resolveTabId(sender);
            const topicResponse = await handleTopicMessage(chrome.storage.local, message);
            sendResponse({
              ok: true,
              tabId,
              ...topicResponse
            } satisfies ExtensionResponse);
            return;
          }
          case "product/list-signal-analyses": {
            const tabId = await resolveTabId(sender);
            const productSignalAnalyses = await listProductSignalAnalyses(chrome.storage.local, message.signalIds);
            sendResponse({
              ok: true,
              tabId,
              productSignalAnalyses
            } satisfies ExtensionResponse);
            return;
          }
          case "product/analyze-signals": {
            const tabId = await resolveTabId(sender);
            const queued = await queueSavedProductSignalItemsForAnalysis(tabId, message.sessionId);
            const current = queued.snapshot;
            const productSignalAnalyses = await analyzeProductSignalsForSession(current.global, message.sessionId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: current,
              productSignalAnalyses,
              productSignalAnalysisSummary: {
                queued: queued.queued,
                analyzed: productSignalAnalyses.filter((analysis) => analysis.status === "complete").length,
                failed: productSignalAnalyses.filter((analysis) => analysis.status === "error").length
              }
            } satisfies ExtensionResponse);
            return;
          }
          case "product/list-agent-task-feedback": {
            const tabId = await resolveTabId(sender);
            const productAgentTaskFeedback = await listProductAgentTaskFeedback(chrome.storage.local);
            sendResponse({
              ok: true,
              tabId,
              productAgentTaskFeedback
            } satisfies ExtensionResponse);
            return;
          }
          case "product/save-agent-task-feedback": {
            const tabId = await resolveTabId(sender);
            const saved = await saveProductAgentTaskFeedback(chrome.storage.local, message.feedback);
            if (!saved) {
              sendResponse({ ok: false, error: "Invalid product agent task feedback" } satisfies ExtensionResponse);
              return;
            }
            sendResponse({
              ok: true,
              tabId
            } satisfies ExtensionResponse);
            return;
          }
          case "product/get-context": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              productContext: await loadProductContext()
            } satisfies ExtensionResponse);
            return;
          }
          case "session/save-current-preview": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveCurrentPreviewToSession(tabId)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/select-item": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await setActiveItem(tabId, message.sessionId, message.itemId)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/queue-item": {
            const tabId = await resolveTabId(sender);
            const queued = await queueSessionItem(tabId, message.sessionId, message.itemId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: queued.snapshot,
              submit: queued.submit
            } satisfies ExtensionResponse);
            return;
          }
          case "session/queue-selected": {
            const tabId = await resolveTabId(sender);
            const queued = await queueSelectedItem(tabId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: queued.snapshot,
              submit: queued.submit
            } satisfies ExtensionResponse);
            return;
          }
          case "session/queue-all-pending": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await queueAllPending(tabId, message.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "session/refresh-item": {
            const tabId = await resolveTabId(sender);
            const refreshed = await refreshItem(tabId, message.sessionId, message.itemId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: refreshed.snapshot,
              job: refreshed.job || undefined,
              capture: refreshed.capture || undefined
            } satisfies ExtensionResponse);
            return;
          }
          case "session/refresh-selected": {
            const tabId = await resolveTabId(sender);
            const refreshed = await refreshSelectedItem(tabId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: refreshed.snapshot,
              job: refreshed.job || undefined,
              capture: refreshed.capture || undefined
            } satisfies ExtensionResponse);
            return;
          }
          case "session/refresh-all": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await refreshAllItems(tabId, message.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "worker/start-processing": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            try {
              const processing = await triggerWorkerDrain(normalizeBaseUrl(current.global.settings.ingestBaseUrl));
              const snapshot = await saveSnapshot(tabId, {
                global: current.global,
                tab: {
                  ...current.tab,
                  error: null
                }
              });
              sendResponse({
                ok: true,
                tabId,
                snapshot,
                processingStatus: processing.status
              } satisfies StartProcessingResponse);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              await saveSnapshot(tabId, {
                global: current.global,
                tab: {
                  ...current.tab,
                  error: message
                }
              }).catch(() => undefined);
              sendResponse({
                ok: false,
                error: message
              } satisfies StartProcessingResponse);
            }
            return;
          }
          case "worker/get-status": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            try {
              const worker = await fetchWorkerStatus(normalizeBaseUrl(current.global.settings.ingestBaseUrl));
              sendResponse({
                ok: true,
                tabId,
                snapshot: current,
                workerStatus: worker.status
              } satisfies WorkerStatusMessageResponse);
            } catch (error) {
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              } satisfies WorkerStatusMessageResponse);
            }
            return;
          }
          case "compare/get-one-liner": {
            const tabId = await resolveTabId(sender);
            const snapshot = await loadSnapshot(tabId);
            const oneLiner = await getOrGenerateOneLiner(snapshot.global, message.request);
            sendResponse({
              ok: true,
              tabId,
              oneLiner
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/get-brief": {
            const tabId = await resolveTabId(sender);
            const snapshot = await loadSnapshot(tabId);
            const compareBrief = await getOrGenerateCompareBrief(snapshot.global, message.request);
            sendResponse({
              ok: true,
              tabId,
              compareBrief
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/get-cluster-summaries": {
            const tabId = await resolveTabId(sender);
            const snapshot = await loadSnapshot(tabId);
            const clusterInterpretations = await getOrGenerateClusterSummaries(snapshot.global, message.request);
            sendResponse({
              ok: true,
              tabId,
              clusterInterpretations
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/get-evidence-annotations": {
            const tabId = await resolveTabId(sender);
            const snapshot = await loadSnapshot(tabId);
            const evidenceAnnotations = await getOrGenerateEvidenceAnnotations(snapshot.global, message.request);
            sendResponse({
              ok: true,
              tabId,
              evidenceAnnotations
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/get-technique-readings": {
            const tabId = await resolveTabId(sender);
            const techniqueReadings = await loadTechniqueReadings(chrome.storage.local);
            sendResponse({
              ok: true,
              tabId,
              techniqueReadings
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/save-technique-reading": {
            const tabId = await resolveTabId(sender);
            await saveTechniqueReading(chrome.storage.local, message.snapshot);
            sendResponse({
              ok: true,
              tabId
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/get-saved-analyses": {
            const tabId = await resolveTabId(sender);
            const savedAnalyses = await loadSavedAnalyses(chrome.storage.local);
            sendResponse({
              ok: true,
              tabId,
              savedAnalyses
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/save-analysis": {
            const tabId = await resolveTabId(sender);
            const savedAnalyses = await saveSavedAnalysis(chrome.storage.local, message.snapshot);
            const current = await loadSnapshot(tabId);
            const snapshot = await saveSnapshot(tabId, {
              global: current.global,
              tab: {
                ...current.tab,
                lastViewedResultId: message.snapshot.resultId,
                activeAnalysisResult: {
                  resultId: message.snapshot.resultId,
                  compareKey: message.snapshot.compareKey,
                  itemAId: message.snapshot.itemAId,
                  itemBId: message.snapshot.itemBId,
                  saved: true,
                  viewedAt: message.snapshot.savedAt
                },
                popupPage: "result",
                currentMainPage: "result",
                error: null
              }
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot,
              savedAnalyses
            } satisfies ExtensionResponse);
            return;
          }
          case "compare/set-active-draft": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const snapshot = await saveSnapshot(tabId, {
              global: current.global,
              tab: {
                ...current.tab,
                activeCompareDraft: message.draft,
                error: null
              }
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }
          case "compare/set-active-result": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const snapshot = await saveSnapshot(tabId, {
              global: current.global,
              tab: {
                ...current.tab,
                activeAnalysisResult: message.result,
                lastViewedResultId: message.result?.resultId || current.tab.lastViewedResultId,
                popupPage: message.result ? "result" : current.tab.popupPage,
                currentMainPage: message.result ? "result" : current.tab.currentMainPage,
                error: null
              }
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }
          case "judgment/start": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const productProfile = current.global.settings.productProfile;
            if (!productProfile) {
              sendResponse({ ok: true, tabId } satisfies ExtensionResponse);
              return;
            }

            const savedAnalyses = await loadSavedAnalyses(chrome.storage.local);
            const savedAnalysis = savedAnalyses.find((entry) => entry.resultId === message.resultId) || null;
            if (!savedAnalysis) {
              throw new Error("Saved analysis snapshot not found.");
            }

            const compareItems = findSessionItems(current.global.sessions, savedAnalysis.itemAId, savedAnalysis.itemBId);
            if (!compareItems) {
              throw new Error("Source posts for this saved analysis are no longer available in local storage.");
            }

            const briefRequest = buildCompareBriefRequest(compareItems.itemA, compareItems.itemB);
            if (!briefRequest) {
              throw new Error("This saved analysis no longer has enough data to rebuild the compare brief request.");
            }

            const compareBrief = await getCompareBriefForJudgment(current.global, briefRequest);

            const profileHash = [productProfile.name, productProfile.category, productProfile.audience].join("|");
            const judgment = await getOrGenerateJudgment(current.global, {
              brief: compareBrief.brief,
              productProfile,
              briefHash: compareBrief.cacheKey,
              profileHash
            });
            const nextSavedAnalyses = await saveSavedAnalysisJudgment(chrome.storage.local, {
              resultId: message.resultId,
              judgmentResult: judgment.judgmentResult,
              judgmentVersion: COMPARE_JUDGMENT_PROMPT_VERSION,
              judgmentSource: judgment.judgmentSource
            });
            const snapshot = await saveSnapshot(tabId, {
              global: current.global,
              tab: {
                ...current.tab,
                error: null
              }
            });
            await broadcastToAllTabs({
              type: "judgment/result",
              resultId: message.resultId,
              judgmentResult: judgment.judgmentResult,
              judgmentVersion: COMPARE_JUDGMENT_PROMPT_VERSION,
              judgmentSource: judgment.judgmentSource
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot,
              savedAnalyses: nextSavedAnalyses
            } satisfies ExtensionResponse);
            return;
          }
          case "judgment/result": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const savedAnalyses = await saveSavedAnalysisJudgment(chrome.storage.local, {
              resultId: message.resultId,
              judgmentResult: message.judgmentResult,
              judgmentVersion: message.judgmentVersion,
              judgmentSource: message.judgmentSource
            });
            const snapshot = await saveSnapshot(tabId, {
              global: current.global,
              tab: {
                ...current.tab,
                error: null
              }
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot,
              savedAnalyses
            } satisfies ExtensionResponse);
            return;
          }
          default: {
            sendResponse({ ok: false, error: "Unsupported message" } satisfies ExtensionResponse);
          }
        }
      } catch (error) {
        const tabId = await resolveTabId(sender).catch(() => undefined);
        if (tabId) {
          const current = await loadSnapshot(tabId).catch(() => null);
          if (current) {
            const snapshot = await saveSnapshot(tabId, {
              global: current.global,
              tab: {
                ...current.tab,
                error: error instanceof Error ? error.message : String(error)
              }
            }).catch(() => null);
            if (snapshot) {
              sendResponse({ ok: false, error: snapshot.tab.error || "Unknown error" } satisfies ExtensionResponse);
              return;
            }
          }
        }
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies ExtensionResponse);
      }
    })();

    return true;
  });
});
