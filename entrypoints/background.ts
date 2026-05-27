import { defineBackground } from "wxt/utils/define-background";
import { IS_PR_ONLY_BUILD } from "../src/build-variant";
import {
  fetchCapture,
  fetchJob,
  fetchThreadsAdvancedMetrics,
  fetchWorkerStatus,
  normalizeBaseUrl,
  submitCaptureTarget,
  triggerWorkerDrain
} from "../src/ingest/client";
import type { CaptureSnapshot, CaptureTargetResponse, JobSnapshot } from "../src/contracts/ingest";
import type { TargetDescriptor } from "../src/contracts/target-descriptor";
import type { ExtensionMessage, ExtensionResponse, StartProcessingResponse, WorkerStatusMessageResponse } from "../src/state/messages";
import { queueItemsSequential } from "../src/state/queue-items";
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
  PRODUCT_CONTEXT_STORAGE_KEY,
  resolveProductContextForAnalysis
} from "../src/compare/product-context";
import {
  buildProductContextHash,
  buildProductSignalAnalyzerInputFromCapture,
  collectQueueableProductSignalItemIds,
  hasDrainableProductSignalItems,
  PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
  shouldDrainWorkerAfterProductSignalQueue,
  shouldAutoAnalyzeProductSignal
} from "../src/compare/product-signal-analysis";
import {
  deleteProductSignalAnalysis,
  getProductSignalAnalysis,
  listProductSignalAnalyses,
  saveProductSignalAnalysis
} from "../src/compare/product-signal-storage";
import { listProductAgentTaskFeedback, saveProductAgentTaskFeedback } from "../src/compare/product-agent-task-feedback";
import { buildDLensSignalPacket, buildSignalPacketIndex } from "../src/compare/signal-packet";
import { exportSignalPackets } from "../src/compare/signal-packet-export";
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
  generatePrCriteriaMatches,
  generatePrCriteriaSuggestions,
  generatePrSummaryDraft,
  generateProductSignalAnalysis,
  generateSignalReading,
  generateSignalTags,
  generateTopicAuditEnvelope,
  generateTopicSignalReading
} from "../src/compare/provider";
import {
  buildExistingAnalysisSummary,
  selectSignalReadingRepresentativeRefs,
  buildSourcePacketHash,
  buildStoredSourcePacket,
  SIGNAL_READING_PROMPT_VERSION,
  type SignalReadingInput
} from "../src/compare/signal-reading";
import {
  appendSignalReadingReview,
  buildSignalReadingCacheKey,
  getSignalReading,
  listSignalReadings,
  saveSignalReading
} from "../src/compare/signal-reading-storage";
import { buildSignalTagsInputFromCapture } from "../src/compare/signal-tags";
import { listSignalTags, saveSignalTags } from "../src/compare/signal-tags-storage";
import { buildTopicSignalReadingInputFromCapture } from "../src/compare/topic-signal-reading";
import { listTopicSignalReadings, saveTopicSignalReading } from "../src/compare/topic-signal-reading-storage";
import {
  buildDeterministicPrCriteria,
  buildDeterministicPrCriteriaMatches,
  buildDeterministicPrSummary,
  buildPrSummaryFacts
} from "../src/compare/pr-evidence";
import { createLlmCallWrapper } from "../src/compare/llm-call-wrapper";
import {
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
  activateSessionForMode,
  applyStoredActiveSessionId,
  createSessionRecord,
  deleteSession,
  expireStaleInFlightItems,
  getActiveSession,
  getSessionById,
  markSessionItemQueued,
  mergeItemRefreshResultsIntoGlobal,
  mergeRefreshResults,
  needsCaptureRefresh,
  normalizeSessionRecord,
  reconcileSessionItem,
  renameSession,
  removeSessionItem,
  saveDescriptorToSession,
  setActiveSession,
  updateSessionItem,
  type ItemRefreshResult
} from "../src/state/store-helpers";
import { ensureSignalForSavedItem, ensureWorkspaceTopicForSession, handleTopicMessage } from "../src/state/topic-handlers";
import { handleTopicAuditMessage } from "../src/state/topic-audit-handlers";
import { deleteSignal, loadSignals, loadTopicById, loadTopics, saveTopic } from "../src/state/topic-storage";
import { generateTopicSynthesis } from "../src/compare/topic-synthesis";
import { generateFolderSynthesis } from "../src/compare/folder-synthesis";
import {
  clearFolderSynthesis,
  loadFolderSynthesis,
  saveFolderSynthesis
} from "../src/compare/folder-synthesis-storage";
import {
  loadActivePrCampaign,
  loadPrCampaigns,
  loadPrEvidenceRows,
  savePrCampaign,
  savePrEvidenceRow,
  toPrEvidenceRowFromSessionItem,
  type PrCampaign,
  type PrEvidenceRow
} from "../src/state/pr-evidence-storage";
import { mergeLayoutPreferences, mergeOneLinerSettings, normalizeExtensionSettings } from "../src/state/settings-storage";
import { buildRefreshFailureMessage } from "../src/state/refresh-errors";
import { createAsyncLock } from "../src/state/snapshot-lock";
import { applyHoveredPreview, createInlineToast, setCollectModeState } from "../src/state/ui-state";
import { getModeHomePage } from "../src/state/processing-state";

const GLOBAL_STORAGE_KEY = "dlens:v0:global-state";
const ACTIVE_SESSION_ID_STORAGE_KEY = "dlens:v1:active-session-id";
const TAB_STORAGE_KEY_PREFIX = "dlens:v0:tab-ui:";
const COMPARE_BRIEF_CACHE_KEY = "dlens:v1:compare-brief-cache";
const COMPARE_ONE_LINER_CACHE_KEY = "dlens:v1:compare-one-liner-cache";
const COMPARE_CLUSTER_SUMMARY_CACHE_KEY = "dlens:v1:compare-cluster-summary-cache";
const COMPARE_EVIDENCE_ANNOTATION_CACHE_KEY = "dlens:v1:compare-evidence-annotation-cache";
const COMPARE_JUDGMENT_CACHE_KEY = "dlens:v1:compare-judgment-cache";
const COMPARE_CACHE_MAX_ENTRIES = 50;
const productSignalAnalysisInFlight = new Map<string, Promise<ProductSignalAnalysis[]>>();
const prCriteriaMatchInFlight = new Map<string, Promise<PrEvidenceRow[]>>();

// In-memory hover state per tab — never persisted to storage
const tabHoverCache = new Map<number, Pick<TabUiState, "hoveredTarget" | "hoveredTargetStrength" | "flashPreview" | "currentPreview">>();

// In-memory global state cache — survives within a single service worker lifetime.
// When the worker restarts, this is null and gets lazily reloaded from storage.
let globalStateCache: ExtensionGlobalState | null = null;
// Per-tab UI state cache — lets the hover hot path skip a storage read on every move.
const tabStateCache = new Map<number, TabUiState>();
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
  const raw = await chrome.storage.local.get([GLOBAL_STORAGE_KEY, ACTIVE_SESSION_ID_STORAGE_KEY]);
  const normalized = normalizeGlobalState(raw[GLOBAL_STORAGE_KEY] || createEmptyGlobalState());
  const activeOverlaid = applyStoredActiveSessionId(normalized, raw[ACTIVE_SESSION_ID_STORAGE_KEY]);
  const expired = expireStaleInFlightItems(activeOverlaid);
  if (expired !== activeOverlaid) {
    await chrome.storage.local.set({ [GLOBAL_STORAGE_KEY]: expired });
  }
  return expired;
}

async function loadTabState(tabId: number): Promise<TabUiState> {
  const raw = await chrome.storage.local.get(tabStorageKey(tabId));
  const tab = normalizeTabState(raw[tabStorageKey(tabId)] || createEmptyTabState());
  tabStateCache.set(tabId, tab);
  return tab;
}

// Fast snapshot for the hover hot path: serves the warm in-memory caches and only
// touches storage on a cold worker. Global writes always refresh globalStateCache,
// and tab writes always refresh tabStateCache, so the cached view stays consistent.
async function loadSnapshotCached(tabId: number): Promise<ExtensionSnapshot> {
  const global = globalStateCache ?? (await loadGlobalState());
  globalStateCache = global;
  const tab = tabStateCache.get(tabId) ?? (await loadTabState(tabId));
  return { global, tab };
}

async function loadSnapshot(tabId: number): Promise<ExtensionSnapshot> {
  const [global, tab] = await Promise.all([loadGlobalState(), loadTabState(tabId)]);
  return { global, tab };
}

function normalizeGlobalState(state: ExtensionGlobalState): ExtensionGlobalState {
  return {
    ...state,
    sessions: Array.isArray(state?.sessions) ? state.sessions.map((session) => normalizeSessionRecord(session)) : [],
    settings: normalizeExtensionSettings(state?.settings)
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

  const productContext = await resolveProductContextForAnalysis({
    cachedContext: await loadProductContext(),
    productProfile: global.settings.productProfile,
    allowMissingPrerequisites: options.allowMissingPrerequisites,
    compileProductContext: () => compileProductContextIfReady(global)
  });
  if (!productContext) {
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

function queueProductSignalAutoAnalysis(tabId: number | null, global: ExtensionGlobalState, sessionId: string): void {
  void analyzeProductSignalsForSession(global, sessionId, { allowMissingPrerequisites: true })
    .then(async () => {
      if (tabId == null) {
        return;
      }
      const snapshot = await loadSnapshot(tabId);
      await saveSnapshot(tabId, snapshot);
    })
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function generatePrCriteriaForGlobal(
  global: ExtensionGlobalState,
  campaignName: string,
  briefText: string
): Promise<PrCampaign["criteria"]> {
  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    return buildDeterministicPrCriteria(campaignName, briefText);
  }
  return generatePrCriteriaSuggestions(providerConfig.provider, providerConfig.apiKey, campaignName, briefText);
}

async function matchPrCriteriaForCampaign(global: ExtensionGlobalState, campaignId: string): Promise<PrEvidenceRow[]> {
  const existing = prCriteriaMatchInFlight.get(campaignId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const campaigns = await loadPrCampaigns(chrome.storage.local, "");
    const campaign = campaigns.find((entry) => entry.id === campaignId)
      || (await Promise.all(global.sessions.map((session) => loadPrCampaigns(chrome.storage.local, session.id))))
        .flat()
        .find((entry) => entry.id === campaignId)
      || null;
    if (!campaign) {
      throw new Error("PR campaign not found.");
    }
    const rows = await loadPrEvidenceRows(chrome.storage.local, campaignId);
    if (!rows.length) {
      return rows;
    }
    const providerConfig = providerKeyForRequest(global);
    const now = new Date().toISOString();
    const nextRows: PrEvidenceRow[] = [];
    for (const batch of chunkArray(rows, 25)) {
      const matchesByRowId = providerConfig
        ? await generatePrCriteriaMatches(providerConfig.provider, providerConfig.apiKey, campaign, batch)
        : buildDeterministicPrCriteriaMatches(campaign, batch);
      for (const row of batch) {
        const nextRow = {
          ...row,
          criteriaMatches: matchesByRowId[row.id] || row.criteriaMatches,
          matchedAt: now
        };
        await savePrEvidenceRow(chrome.storage.local, nextRow);
        nextRows.push(nextRow);
      }
    }
    await savePrCampaign(chrome.storage.local, {
      ...campaign,
      lastMatchedAt: now,
      updatedAt: now
    });
    return loadPrEvidenceRows(chrome.storage.local, campaignId);
  })();

  prCriteriaMatchInFlight.set(campaignId, promise);
  try {
    return await promise;
  } finally {
    prCriteriaMatchInFlight.delete(campaignId);
  }
}

function readMetricNumber(metrics: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function mergeAdvancedMetrics(row: PrEvidenceRow, metrics: Record<string, unknown>, fetchedAt: string): PrEvidenceRow {
  const nextMetrics = {
    ...row.metrics
  };
  const likes = readMetricNumber(metrics, ["likes", "like_count", "likeCount"]);
  const comments = readMetricNumber(metrics, ["comments", "replies", "reply_count", "replyCount", "comment_count", "commentCount"]);
  const reposts = readMetricNumber(metrics, ["reposts", "repost_count", "repostCount"]);
  const views = readMetricNumber(metrics, ["views", "view_count", "viewCount"]);
  const followers = readMetricNumber(metrics, ["followers", "follower_count", "followerCount"]);
  if (likes !== undefined) {
    nextMetrics.likes = likes;
  }
  if (comments !== undefined) {
    nextMetrics.comments = comments;
  }
  if (reposts !== undefined) {
    nextMetrics.reposts = reposts;
  }
  if (views !== undefined) {
    nextMetrics.views = views;
  }
  if (followers !== undefined) {
    nextMetrics.followers = followers;
  }
  return {
    ...row,
    metrics: nextMetrics,
    advancedMetricsFetchedAt: fetchedAt,
    advancedMetricsError: undefined
  };
}

async function fetchAdvancedMetricsForPrCampaign(
  global: ExtensionGlobalState,
  campaignId: string
): Promise<{ rows: PrEvidenceRow[]; summary: { updated: number; failed: number } }> {
  const campaigns = await loadPrCampaigns(chrome.storage.local, "");
  const campaign = campaigns.find((entry) => entry.id === campaignId)
    || (await Promise.all(global.sessions.map((session) => loadPrCampaigns(chrome.storage.local, session.id))))
      .flat()
      .find((entry) => entry.id === campaignId)
    || null;
  if (!campaign) {
    throw new Error("PR campaign not found.");
  }

  const rows = await loadPrEvidenceRows(chrome.storage.local, campaignId);
  if (!rows.length) {
    return { rows, summary: { updated: 0, failed: 0 } };
  }

  const baseUrl = normalizeBaseUrl(global.settings.ingestBaseUrl);
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.postUrl.trim()) {
      failed += 1;
      await savePrEvidenceRow(chrome.storage.local, {
        ...row,
        advancedMetricsError: "Missing post URL."
      });
      continue;
    }
    try {
      const response = await fetchThreadsAdvancedMetrics(baseUrl, row.postUrl);
      const nextRow = mergeAdvancedMetrics(row, response.metrics || {}, response.fetched_at || new Date().toISOString());
      await savePrEvidenceRow(chrome.storage.local, nextRow);
      updated += 1;
    } catch (error) {
      failed += 1;
      await savePrEvidenceRow(chrome.storage.local, {
        ...row,
        advancedMetricsError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    rows: await loadPrEvidenceRows(chrome.storage.local, campaignId),
    summary: { updated, failed }
  };
}

async function generatePrSummaryForCampaign(global: ExtensionGlobalState, campaignId: string): Promise<string> {
  const campaign = (await Promise.all(global.sessions.map((session) => loadPrCampaigns(chrome.storage.local, session.id))))
    .flat()
    .find((entry) => entry.id === campaignId)
    || null;
  if (!campaign) {
    throw new Error("PR campaign not found.");
  }
  const rows = await loadPrEvidenceRows(chrome.storage.local, campaignId);
  const facts = buildPrSummaryFacts(campaign, rows);
  const fallback = buildDeterministicPrSummary(facts);
  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    return fallback;
  }
  try {
    return await generatePrSummaryDraft(providerConfig.provider, providerConfig.apiKey, facts);
  } catch (error) {
    console.error("[dlens] PR summary AI call failed:", error instanceof Error ? error.message : error);
    return fallback;
  }
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

// Last saveSnapshot storage.local.set duration. Service worker is single-
// threaded, so handlers can read this right after `await saveSnapshot(...)`
// to surface the storage cost in their response payload (popup-visible).
let lastSaveSnapshotStorageMs = 0;

interface SnapshotSaveOptions {
  persistActiveSessionId?: boolean;
}

function cacheSnapshot(tabId: number, snapshot: ExtensionSnapshot): void {
  globalStateCache = snapshot.global;
  tabStateCache.set(tabId, snapshot.tab);
}

function broadcastSnapshotUpdate(tabId: number, snapshot: ExtensionSnapshot): void {
  // Fire-and-forget broadcast: popup callers already receive the new snapshot
  // via the direct sendAndSync response; this broadcast is a safety net for
  // any listener that didn't originate the write. Awaiting the ack added
  // ~10-30ms per saveSnapshot for no correctness benefit on the caller side.
  void chrome.tabs
    .sendMessage(tabId, { type: "state/updated", tabId, snapshot } satisfies ExtensionMessage)
    .catch(() => undefined);
}

function logSlowSnapshotSave(label: string, snapshot: ExtensionSnapshot, storageSetMs: number): void {
  if (storageSetMs < 50) {
    return;
  }
  const sessions = snapshot.global.sessions;
  const itemTotal = sessions.reduce((sum, session) => sum + session.items.length, 0);
  console.info(label, {
    storageSetMs,
    sessionCount: sessions.length,
    itemTotal
  });
}

async function persistSnapshot(
  tabId: number,
  snapshot: ExtensionSnapshot,
  payload: Record<string, unknown>,
  logLabel: string
): Promise<ExtensionSnapshot> {
  cacheSnapshot(tabId, snapshot);

  const storageStart = performance.now();
  await chrome.storage.local.set(payload);
  const storageSetMs = Math.round(performance.now() - storageStart);
  lastSaveSnapshotStorageMs = storageSetMs;

  broadcastSnapshotUpdate(tabId, snapshot);
  logSlowSnapshotSave(logLabel, snapshot, storageSetMs);

  return snapshot;
}

async function saveSnapshot(tabId: number, snapshot: ExtensionSnapshot, options: SnapshotSaveOptions = {}): Promise<ExtensionSnapshot> {
  const global = options.persistActiveSessionId
    ? snapshot.global
    : applyStoredActiveSessionId(snapshot.global, globalStateCache?.activeSessionId);
  const nextSnapshot = {
    global: withTimestamp(global),
    tab: withTimestamp(normalizeTabState(snapshot.tab))
  };
  const payload: Record<string, unknown> = {
    [GLOBAL_STORAGE_KEY]: nextSnapshot.global,
    [tabStorageKey(tabId)]: nextSnapshot.tab
  };
  if (options.persistActiveSessionId) {
    payload[ACTIVE_SESSION_ID_STORAGE_KEY] = nextSnapshot.global.activeSessionId;
  }

  return persistSnapshot(tabId, nextSnapshot, payload, "[DLens] saveSnapshot");
}

async function saveActiveSessionSnapshot(tabId: number, snapshot: ExtensionSnapshot): Promise<ExtensionSnapshot> {
  const nextSnapshot = {
    global: withTimestamp(snapshot.global),
    tab: withTimestamp(normalizeTabState(snapshot.tab))
  };
  return persistSnapshot(
    tabId,
    nextSnapshot,
    {
      [ACTIVE_SESSION_ID_STORAGE_KEY]: nextSnapshot.global.activeSessionId,
      [tabStorageKey(tabId)]: nextSnapshot.tab
    },
    "[DLens] saveActiveSessionSnapshot"
  );
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
  if (IS_PR_ONLY_BUILD) {
    const current = await loadSnapshot(tabId);
    return saveSnapshot(tabId, {
      global: activateSessionForMode(current.global, "pr-evidence"),
      tab: {
        ...current.tab,
        popupOpen: true,
        popupPage: "pr-evidence",
        currentMainPage: "pr-evidence",
        error: null
      }
    }, { persistActiveSessionId: true });
  }
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

async function saveCurrentPreviewToSession(
  tabId: number,
  sessionId?: string,
  topicId?: string,
  descriptor?: TargetDescriptor
): Promise<ExtensionSnapshot> {
  return withSnapshotLock(async () => {
    const current = await loadSnapshot(tabId);
    let activeSessionRealigned = false;
    // The popup tells us exactly which folder it is showing. Honor it (and realign the
    // active session) so a drifted activeSessionId can't reroute the save to the wrong folder.
    if (sessionId && sessionId !== current.global.activeSessionId && getSessionById(current.global, sessionId)) {
      current.global = setActiveSession(current.global, sessionId);
      activeSessionRealigned = true;
    }
    if (descriptor) {
      current.tab = { ...current.tab, currentPreview: descriptor };
      tabHoverCache.set(tabId, {
        hoveredTarget: descriptor,
        hoveredTargetStrength: "hard",
        flashPreview: descriptor,
        currentPreview: descriptor
      });
    }
    // In-memory hover cache always takes priority — storage may hold a stale preview
    // from a previous save, while the cache reflects the latest hover target
    const hover = tabHoverCache.get(tabId);
    if (!descriptor && hover?.currentPreview) {
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

    const collectionTopicId = session.mode === "topic" ? topicId ?? current.tab.collectionTopicId ?? undefined : undefined;
    const saved = saveDescriptorToSession(current.global, session.id, current.tab.currentPreview);
    if (session.mode === "pr-evidence") {
      const campaign = await loadActivePrCampaign(chrome.storage.local, session.id);
      if (!campaign) {
        throw new Error("Create a PR campaign before collecting evidence.");
      }
      await savePrEvidenceRow(chrome.storage.local, toPrEvidenceRowFromSessionItem(campaign.id, saved.item));
    } else {
      await ensureSignalForSavedItem(chrome.storage.local, session, saved.item, collectionTopicId);
    }
    return saveSnapshot(tabId, {
      global: saved.globalState,
      tab: {
        ...current.tab,
        activeItemId: saved.item.id,
        lastSavedToast: createInlineToast("saved", session.name),
        error: null
      }
    }, { persistActiveSessionId: activeSessionRealigned });
  });
}

async function createSession(
  tabId: number,
  name: string,
  saveCurrentPreview = false,
  mode: FolderMode = "topic",
  descriptor?: TargetDescriptor
): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Folder name is required.");
  }
  if (descriptor) {
    current.tab = { ...current.tab, currentPreview: descriptor };
    tabHoverCache.set(tabId, {
      hoveredTarget: descriptor,
      hoveredTargetStrength: "hard",
      flashPreview: descriptor,
      currentPreview: descriptor
    });
  }

  let globalState = current.global;
  const session = createSessionRecord(trimmed, new Date().toISOString(), mode);
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
    if (session.mode === "pr-evidence") {
      const campaign = await loadActivePrCampaign(chrome.storage.local, session.id);
      if (!campaign) {
        throw new Error("Create a PR campaign before collecting evidence.");
      }
      await savePrEvidenceRow(chrome.storage.local, toPrEvidenceRowFromSessionItem(campaign.id, saved.item));
    } else {
      await ensureSignalForSavedItem(chrome.storage.local, session, saved.item);
    }
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
  }, { persistActiveSessionId: true });
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
  }, { persistActiveSessionId: true });
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
  }, { persistActiveSessionId: true });
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
  }, { persistActiveSessionId: globalState.activeSessionId !== current.global.activeSessionId });
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
      queueProductSignalAutoAnalysis(tabId, nextSnapshot.global, sessionId);
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

async function queueSessionItems(
  tabId: number,
  sessionId: string,
  itemIds: string[]
): Promise<{ snapshot: ExtensionSnapshot; queuedItemIds: string[]; failedItemIds: string[] }> {
  const snapshot = await loadSnapshot(tabId);
  return queueItemsSequential({
    initialSnapshot: snapshot,
    itemIds,
    queueOne: async (itemId) => {
      const result = await queueSessionItem(tabId, sessionId, itemId);
      return result.snapshot;
    }
  });
}

async function queueSessionItemsAndStartProcessing(
  tabId: number,
  sessionId: string,
  itemIds: string[]
): Promise<{
  snapshot: ExtensionSnapshot;
  queuedItemIds: string[];
  failedItemIds: string[];
  processingStatus?: "started" | "already_running";
  processingError?: string;
}> {
  const queued = await queueSessionItems(tabId, sessionId, itemIds);
  if (queued.queuedItemIds.length <= 0) {
    return queued;
  }

  try {
    const processing = await triggerWorkerDrain(normalizeBaseUrl(queued.snapshot.global.settings.ingestBaseUrl));
    const snapshot = await saveSnapshot(tabId, {
      global: queued.snapshot.global,
      tab: {
        ...queued.snapshot.tab,
        error: null
      }
    });
    return {
      ...queued,
      snapshot,
      processingStatus: processing.status
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const snapshot = await saveSnapshot(tabId, {
      global: queued.snapshot.global,
      tab: {
        ...queued.snapshot.tab,
        error: message
      }
    }).catch(() => undefined);
    return {
      ...queued,
      snapshot: snapshot || queued.snapshot,
      processingError: message
    };
  }
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
      queueProductSignalAutoAnalysis(tabId, snapshot.global, sessionId);
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

  return withSnapshotLock(async () => {
    const latest = await loadSnapshot(tabId);
    return saveSnapshot(tabId, {
      global: latest.global,
      tab: {
        ...latest.tab,
        error: firstFailureMessage
      }
    });
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
            tabStateCache.delete(tabId);
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
            queueProductSignalAutoAnalysis(null, globalStateCache, session.id);
          }
        }
      });
    }
  }

  // Fire-and-forget resume on worker start
  void resumeRunningPolls();

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabHoverCache.delete(tabId);
    tabStateCache.delete(tabId);
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
          case "settings/set-layout-preferences": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const settings = mergeLayoutPreferences(current.global.settings, message.layoutPreferences);
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
                  currentMainPage: message.page === "settings" || message.page === "audit-report"
                    ? current.tab.currentMainPage
                    : message.page,
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
            const current = await loadSnapshotCached(tabId);
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
              snapshot: await createSession(tabId, message.name, message.saveCurrentPreview, message.mode, message.descriptor)
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
            const startedAt = performance.now();
            const tabId = await resolveTabId(sender);
            // Cached read: hot path post-pending UI. saveSnapshot invalidates the
            // global cache on every write, so cached read is safe for the active
            // tab. Saves ~10–50ms vs the parallel storage round-trip in loadSnapshot.
            const current = await loadSnapshotCached(tabId);
            const global = activateSessionForMode(current.global, message.mode);
            const activeSession = getActiveSession(global);
            const modeHomePage = getModeHomePage(message.mode);
            const nextSnapshotInput = {
              global,
              tab: {
                ...current.tab,
                activeItemId: activeSession ? ensureActiveItemId(activeSession, current.tab.activeItemId) : null,
                popupPage: modeHomePage,
                currentMainPage: modeHomePage,
                error: null
              }
            };
            const sessionsRefEqual = global.sessions === current.global.sessions;
            const setModePath: "fast" | "slow" = sessionsRefEqual ? "fast" : "slow";
            const snapshot = sessionsRefEqual
              ? await saveActiveSessionSnapshot(tabId, nextSnapshotInput)
              : await saveSnapshot(tabId, nextSnapshotInput, { persistActiveSessionId: true });
            const serverDurationMs = Math.round(performance.now() - startedAt);
            const storageSetMs = lastSaveSnapshotStorageMs;
            console.info("[DLens] session/set-mode", {
              mode: message.mode,
              sessionCount: global.sessions.length,
              durationMs: serverDurationMs,
              storageSetMs,
              path: setModePath,
              currentSessionsLen: current.global.sessions.length,
              nextSessionsLen: global.sessions.length
            });
            sendResponse({
              ok: true,
              tabId,
              serverDurationMs,
              storageSetMs,
              setModePath,
              snapshot
            } satisfies ExtensionResponse);
            return;
          }
          case "topic/list":
          case "topic/create":
          case "topic/update":
          case "topic/delete":
          case "topic/set-collection-target":
          case "topic/add-pair":
          case "topic/remove-pair":
          case "signal/list":
          case "signal/triage": {
            const tabId = await resolveTabId(sender);
            if (message.type === "topic/set-collection-target") {
              const current = await loadSnapshot(tabId);
              sendResponse({
                ok: true,
                tabId,
                snapshot: await saveSnapshot(tabId, {
                  global: current.global,
                  tab: {
                    ...current.tab,
                    collectionTopicId: message.topicId,
                    error: null
                  }
                })
              } satisfies ExtensionResponse);
              return;
            }
            const topicResponse = await handleTopicMessage(chrome.storage.local, message);
            sendResponse({
              ok: true,
              tabId,
              ...topicResponse
            } satisfies ExtensionResponse);
            return;
          }
          case "signal/delete": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const result = await deleteSignal(chrome.storage.local, message.signalId);
            await deleteProductSignalAnalysis(chrome.storage.local, message.signalId);
            await clearFolderSynthesis(chrome.storage.local, result.deleted.sessionId);
            const shouldRemoveBackingItem = Boolean(result.deleted.itemId)
              && !result.signals.some((signal) => signal.itemId === result.deleted.itemId);
            const global = shouldRemoveBackingItem && result.deleted.itemId
              ? removeSessionItem(current.global, result.deleted.sessionId, result.deleted.itemId)
              : current.global;
            const deletedActiveItem = Boolean(result.deleted.itemId) && current.tab.activeItemId === result.deleted.itemId;
            const deletedSession = global.sessions.find((session) => session.id === result.deleted.sessionId) ?? null;
            const nextActiveItemId = deletedActiveItem && deletedSession
              ? ensureActiveItemId(deletedSession, null)
              : deletedActiveItem
                ? null
                : current.tab.activeItemId;
            const nextActiveItem = deletedSession?.items.find((item) => item.id === nextActiveItemId) ?? null;
            const snapshot = await saveSnapshot(tabId, {
              global,
              tab: {
                ...current.tab,
                activeItemId: nextActiveItemId,
                currentPreview: deletedActiveItem ? nextActiveItem?.descriptor ?? current.tab.hoveredTarget : current.tab.currentPreview,
                error: null
              }
            });
            const productSignalAnalyses = await listProductSignalAnalyses(
              chrome.storage.local,
              result.signals.map((signal) => signal.id)
            );
            sendResponse({
              ok: true,
              tabId,
              snapshot,
              signals: result.signals,
              topics: result.topics,
              productSignalAnalyses
            } satisfies ExtensionResponse);
            return;
          }
          case "topic/synthesis/generate": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const topic = await loadTopicById(chrome.storage.local, message.topicId);
            if (!topic) {
              sendResponse({ ok: false, error: "Topic not found" } satisfies ExtensionResponse);
              return;
            }
            const session = current.global.sessions.find((entry) => entry.id === topic.sessionId) ?? null;
            const signals = await loadSignals(chrome.storage.local, topic.sessionId);
            const topicSignals = signals.filter((signal) => topic.signalIds.includes(signal.id));
            const itemsById = new Map((session?.items ?? []).map((item) => [item.id, item]));
            const synthesis = generateTopicSynthesis({
              totalSignalCount: topic.signalIds.length,
              signals: topicSignals.map((signal) => ({
                signal,
                item: signal.itemId ? itemsById.get(signal.itemId) : undefined
              })),
              generatedAt: new Date().toISOString()
            });
            if (!synthesis) {
              sendResponse({
                ok: false,
                error: "Need at least 2 analyzed signals to synthesize."
              } satisfies ExtensionResponse);
              return;
            }
            await saveTopic(chrome.storage.local, {
              ...topic,
              synthesis,
              updatedAt: new Date().toISOString()
            });
            sendResponse({
              ok: true,
              tabId,
              topics: await loadTopics(chrome.storage.local, topic.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "topic/synthesis/clear": {
            const tabId = await resolveTabId(sender);
            const topic = await loadTopicById(chrome.storage.local, message.topicId);
            if (!topic) {
              sendResponse({ ok: false, error: "Topic not found" } satisfies ExtensionResponse);
              return;
            }
            await saveTopic(chrome.storage.local, {
              ...topic,
              synthesis: null,
              updatedAt: new Date().toISOString()
            });
            sendResponse({
              ok: true,
              tabId,
              topics: await loadTopics(chrome.storage.local, topic.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "extension/open-page": {
            const tabId = await resolveTabId(sender);
            const sanitized = message.path.replace(/^\/+/, "");
            const url = chrome.runtime.getURL(sanitized);
            await chrome.tabs.create({ url });
            sendResponse({ ok: true, tabId } satisfies ExtensionResponse);
            return;
          }
          case "topic/audit/build-evidence":
          case "topic/audit/get":
          case "topic/audit/validate":
          case "topic/audit/clear": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const result = await handleTopicAuditMessage(chrome.storage.local, {
              message,
              sessions: current.global.sessions
            });
            sendResponse({
              ok: true,
              tabId,
              ...result
            } satisfies ExtensionResponse);
            return;
          }
          case "topic/audit/run":
          case "topic/audit/p1-signal":
          case "cross-topic/calibrate": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const providerConfig = providerKeyForRequest(current.global);
            if (!providerConfig) {
              sendResponse({ ok: false, error: "尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。" } satisfies ExtensionResponse);
              return;
            }
            const result = await handleTopicAuditMessage(chrome.storage.local, {
              message,
              sessions: current.global.sessions,
              generateEnvelope: async (_stageName, prompt) => generateTopicAuditEnvelope(
                providerConfig.provider,
                providerConfig.apiKey,
                prompt
              ),
              model: providerConfig.provider
            });
            sendResponse({
              ok: true,
              tabId,
              ...result
            } satisfies ExtensionResponse);
            return;
          }
          case "topic/generate-signal-reading": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const topic = await loadTopicById(chrome.storage.local, message.topicId);
            if (!topic) {
              sendResponse({ ok: false, error: "Topic not found" } satisfies ExtensionResponse);
              return;
            }
            const researchQuestion = topic.context?.researchQuestion?.trim() || "";
            const signals = await loadSignals(chrome.storage.local, topic.sessionId);
            const signal = signals.find((entry) => entry.id === message.signalId) || null;
            if (!signal || !topic.signalIds.includes(signal.id)) {
              sendResponse({ ok: false, error: "找不到該 topic 裡的 signal。" } satisfies ExtensionResponse);
              return;
            }
            const session = current.global.sessions.find((entry) => entry.id === topic.sessionId) || null;
            const item = signal.itemId && session
              ? session.items.find((entry) => entry.id === signal.itemId) || null
              : null;
            if (!item) {
              sendResponse({ ok: false, error: "找不到該 signal 對應的貼文。" } satisfies ExtensionResponse);
              return;
            }
            const input = buildTopicSignalReadingInputFromCapture({
              signalId: signal.id,
              topicId: topic.id,
              researchQuestion,
              capture: item.latestCapture
            });
            if (!input) {
              sendResponse({ ok: false, error: "Signal 尚未完成採集，無法生成判讀。" } satisfies ExtensionResponse);
              return;
            }
            const providerConfig = providerKeyForRequest(current.global);
            if (!providerConfig) {
              sendResponse({ ok: false, error: "尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。" } satisfies ExtensionResponse);
              return;
            }
            try {
              const reading = await generateTopicSignalReading(
                providerConfig.provider,
                providerConfig.apiKey,
                input
              );
              await saveTopicSignalReading(chrome.storage.local, reading);
              sendResponse({ ok: true, tabId, topicSignalReading: reading } satisfies ExtensionResponse);
            } catch (error) {
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              } satisfies ExtensionResponse);
            }
            return;
          }
          case "topic/list-signal-readings": {
            const readings = await listTopicSignalReadings(chrome.storage.local, message.topicId);
            sendResponse({ ok: true, topicSignalReadings: readings } satisfies ExtensionResponse);
            return;
          }
          case "signal/list-tags": {
            const signalTags = await listSignalTags(chrome.storage.local, message.itemIds);
            sendResponse({ ok: true, signalTags } satisfies ExtensionResponse);
            return;
          }
          case "topic/generate-missing-signal-tags": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const topic = await loadTopicById(chrome.storage.local, message.topicId);
            if (!topic) {
              sendResponse({ ok: false, error: "Topic not found" } satisfies ExtensionResponse);
              return;
            }
            const session = current.global.sessions.find((entry) => entry.id === topic.sessionId) || null;
            if (!session) {
              sendResponse({ ok: false, error: "Folder not found" } satisfies ExtensionResponse);
              return;
            }
            const signals = await loadSignals(chrome.storage.local, topic.sessionId);
            const topicSignals = signals.filter((signal) => topic.signalIds.includes(signal.id));
            const itemIds = Array.from(new Set(topicSignals.map((signal) => signal.itemId).filter((itemId): itemId is string => Boolean(itemId))));
            const existing = await listSignalTags(chrome.storage.local, itemIds);
            const taggedItemIds = new Set(existing.map((record) => record.itemId));
            const providerConfig = providerKeyForRequest(current.global);
            if (!providerConfig) {
              sendResponse({ ok: true, tabId, signalTags: existing } satisfies ExtensionResponse);
              return;
            }

            const itemsById = new Map(session.items.map((item) => [item.id, item]));
            for (const itemId of itemIds) {
              if (taggedItemIds.has(itemId)) {
                continue;
              }
              const item = itemsById.get(itemId);
              const input = buildSignalTagsInputFromCapture({
                itemId,
                capture: item?.latestCapture
              });
              if (!input) {
                continue;
              }
              try {
                const tags = await generateSignalTags(providerConfig.provider, providerConfig.apiKey, input);
                await saveSignalTags(chrome.storage.local, tags);
                taggedItemIds.add(itemId);
              } catch {
                // Tagging is an auxiliary reading aid; keep Topic Detail usable if one item fails.
              }
            }

            sendResponse({
              ok: true,
              tabId,
              signalTags: await listSignalTags(chrome.storage.local, itemIds)
            } satisfies ExtensionResponse);
            return;
          }
          case "folder/synthesis/get": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              folderSynthesis: await loadFolderSynthesis(chrome.storage.local, message.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "folder/synthesis/generate": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const session = current.global.sessions.find((entry) => entry.id === message.sessionId) ?? null;
            if (!session) {
              sendResponse({ ok: false, error: "Folder not found" } satisfies ExtensionResponse);
              return;
            }
            const topics = await loadTopics(chrome.storage.local, message.sessionId);
            const signals = await loadSignals(chrome.storage.local, message.sessionId);
            const signalsByTopic = new Map<string, typeof signals>();
            for (const topic of topics) {
              signalsByTopic.set(topic.id, signals.filter((signal) => topic.signalIds.includes(signal.id)));
            }
            const itemsById = new Map(session.items.map((item) => [item.id, item]));
            const synthesis = generateFolderSynthesis({
              sessionId: message.sessionId,
              topics: topics.map((topic) => ({
                topic,
                signals: signalsByTopic.get(topic.id) ?? []
              })),
              itemsById,
              generatedAt: new Date().toISOString()
            });
            if (!synthesis) {
              sendResponse({
                ok: false,
                error: "Need at least 3 analyzed signals spread across 2 topics."
              } satisfies ExtensionResponse);
              return;
            }
            await saveFolderSynthesis(chrome.storage.local, synthesis);
            sendResponse({
              ok: true,
              tabId,
              folderSynthesis: synthesis
            } satisfies ExtensionResponse);
            return;
          }
          case "folder/synthesis/clear": {
            const tabId = await resolveTabId(sender);
            await clearFolderSynthesis(chrome.storage.local, message.sessionId);
            sendResponse({
              ok: true,
              tabId,
              folderSynthesis: null
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/list-campaigns": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              prCampaigns: await loadPrCampaigns(chrome.storage.local, message.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/save-campaign": {
            const tabId = await resolveTabId(sender);
            const prCampaigns = await savePrCampaign(chrome.storage.local, message.campaign);
            sendResponse({
              ok: true,
              tabId,
              prCampaigns: prCampaigns.filter((campaign) => campaign.sessionId === message.campaign.sessionId)
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/list-evidence-rows": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              prEvidenceRows: await loadPrEvidenceRows(chrome.storage.local, message.campaignId)
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/save-evidence-row": {
            const tabId = await resolveTabId(sender);
            await savePrEvidenceRow(chrome.storage.local, message.row);
            sendResponse({
              ok: true,
              tabId,
              prEvidenceRows: await loadPrEvidenceRows(chrome.storage.local, message.row.campaignId)
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/generate-criteria": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              prCriteria: await generatePrCriteriaForGlobal(current.global, message.campaignName, message.briefText)
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/match-criteria": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              prEvidenceRows: await matchPrCriteriaForCampaign(current.global, message.campaignId)
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/fetch-advanced-metrics": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const result = await fetchAdvancedMetricsForPrCampaign(current.global, message.campaignId);
            sendResponse({
              ok: true,
              tabId,
              prEvidenceRows: result.rows,
              prAdvancedMetricsSummary: result.summary
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/generate-summary": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            sendResponse({
              ok: true,
              tabId,
              prSummary: await generatePrSummaryForCampaign(current.global, message.campaignId)
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
            const session = current.global.sessions.find((entry) => entry.id === message.sessionId) || null;
            const signals = await loadSignals(chrome.storage.local, message.sessionId);
            const hasDrainableWork = session ? hasDrainableProductSignalItems(session, signals) : false;
            if (shouldDrainWorkerAfterProductSignalQueue(queued.queued, hasDrainableWork)) {
              await triggerWorkerDrain(normalizeBaseUrl(current.global.settings.ingestBaseUrl));
            }
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
          case "product/synthesize-signal-reading": {
            const tabId = await resolveTabId(sender);
            const global = await loadGlobalState();
            const session = normalizeGlobalState(global).sessions.find((entry) => entry.id === message.sessionId) || null;
            const signals = await loadSignals(chrome.storage.local, message.sessionId);
            const signal = signals.find((entry) => entry.id === message.signalId) || null;
            const item = session && signal?.itemId
              ? session.items.find((entry) => entry.id === signal.itemId) || null
              : null;
            if (!session || !signal || !item) {
              sendResponse({ ok: false, error: "找不到該 signal 或對應的貼文。" } satisfies ExtensionResponse);
              return;
            }
            const productContext = await resolveProductContextForAnalysis({
              cachedContext: await loadProductContext(),
              productProfile: global.settings.productProfile,
              allowMissingPrerequisites: true,
              compileProductContext: () => compileProductContextIfReady(global)
            });
            if (!productContext) {
              sendResponse({ ok: false, error: "尚未設定 ProductContext。請先在 Settings 完成產品設定。" } satisfies ExtensionResponse);
              return;
            }
            const productContextHash = buildProductContextHash(productContext);
            const analyzerInput = buildProductSignalAnalyzerInputFromCapture({
              signalId: signal.id,
              source: signal.source,
              capture: item.latestCapture,
              productContext,
              productContextHash
            });
            if (!analyzerInput) {
              sendResponse({ ok: false, error: "這則貼文還沒有可分析的內容。請先完成抓取。" } satisfies ExtensionResponse);
              return;
            }
            const analysis = await getProductSignalAnalysis(chrome.storage.local, signal.id);
            const replies = analyzerInput.discussionReplies;
            const repRefs = selectSignalReadingRepresentativeRefs(replies, analysis?.evidenceRefs ?? []);
            const representativeComments = repRefs
              .map((ref) => {
                const index = Number(ref.replace(/^e/, "")) - 1;
                const reply = replies[index];
                return reply ? { ref, author: reply.author, text: reply.text, likeCount: reply.likeCount ?? null } : null;
              })
              .filter((comment): comment is { ref: string; author: string; text: string; likeCount: number | null } => comment !== null);
            const readingInput: SignalReadingInput = {
              signalId: signal.id,
              assembledContent: analyzerInput.assembledContent,
              postUrl: item.descriptor.post_url || item.descriptor.page_url || "",
              representativeComments,
              productContext,
              productContextHash,
              analysisPromptVersion: analysis?.promptVersion || "",
              existingAnalysisSummary: analysis ? buildExistingAnalysisSummary(analysis) : ""
            };
            const sourcePacketHash = buildSourcePacketHash(readingInput);
            const cacheKey = buildSignalReadingCacheKey({
              signalId: signal.id,
              productContextHash,
              sourcePacketHash,
              promptVersion: SIGNAL_READING_PROMPT_VERSION
            });
            const cached = await getSignalReading(chrome.storage.local, cacheKey);
            if (cached && !message.force) {
              sendResponse({ ok: true, tabId, signalReading: cached } satisfies ExtensionResponse);
              return;
            }
            const providerConfig = providerKeyForRequest(global);
            if (!providerConfig) {
              sendResponse({ ok: false, error: "尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。" } satisfies ExtensionResponse);
              return;
            }
            try {
              const { reading, model } = await generateSignalReading(
                providerConfig.provider,
                providerConfig.apiKey,
                readingInput
              );
              const saved = await saveSignalReading(chrome.storage.local, {
                signalId: signal.id,
                cacheKey,
                productContextHash,
                sourcePacketHash,
                promptVersion: SIGNAL_READING_PROMPT_VERSION,
                reading,
                generatedAt: new Date().toISOString(),
                model,
                sourceRefs: readingInput.representativeComments.map((comment) => comment.ref),
                sourcePacket: buildStoredSourcePacket(readingInput),
                reviewState: "pending",
                feedbackEvents: []
              });
              sendResponse({ ok: true, tabId, signalReading: saved } satisfies ExtensionResponse);
            } catch (error) {
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              } satisfies ExtensionResponse);
            }
            return;
          }
          case "product/list-signal-readings": {
            const tabId = await resolveTabId(sender);
            const signalReadings = await listSignalReadings(chrome.storage.local);
            sendResponse({ ok: true, tabId, signalReadings } satisfies ExtensionResponse);
            return;
          }
          case "signal-packet/get": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const signalPacket = await buildDLensSignalPacket(chrome.storage.local, current.global, message.signalId);
            sendResponse({ ok: true, tabId, signalPacket } satisfies ExtensionResponse);
            return;
          }
          case "signal-packet/index": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const signalPackets = await buildSignalPacketIndex(chrome.storage.local, current.global, message.filter);
            sendResponse({ ok: true, tabId, signalPackets } satisfies ExtensionResponse);
            return;
          }
          case "signal-packet/export": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const signalPackets = await buildSignalPacketIndex(chrome.storage.local, current.global, message.filter);
            const signalPacketExport = exportSignalPackets(signalPackets, { format: message.format, filter: message.filter });
            sendResponse({ ok: true, tabId, signalPacketExport } satisfies ExtensionResponse);
            return;
          }
          case "product/review-signal-reading": {
            const tabId = await resolveTabId(sender);
            const updated = await appendSignalReadingReview(
              chrome.storage.local,
              message.cacheKey,
              message.decision,
              message.note
            );
            if (!updated) {
              sendResponse({ ok: false, error: "找不到該判讀記錄。" } satisfies ExtensionResponse);
              return;
            }
            sendResponse({ ok: true, tabId, signalReading: updated } satisfies ExtensionResponse);
            return;
          }
          case "session/save-current-preview": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await saveCurrentPreviewToSession(tabId, message.sessionId, message.topicId, message.descriptor)
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
          case "session/queue-items": {
            const tabId = await resolveTabId(sender);
            const result = await queueSessionItems(tabId, message.sessionId, message.itemIds);
            sendResponse({
              ok: true,
              tabId,
              snapshot: result.snapshot,
              queuedItemIds: result.queuedItemIds,
              failedItemIds: result.failedItemIds
            } satisfies ExtensionResponse);
            return;
          }
          case "session/queue-items-and-start-processing": {
            const tabId = await resolveTabId(sender);
            try {
              const result = await queueSessionItemsAndStartProcessing(tabId, message.sessionId, message.itemIds);
              sendResponse({
                ok: true,
                tabId,
                snapshot: result.snapshot,
                queuedItemIds: result.queuedItemIds,
                failedItemIds: result.failedItemIds,
                processingStatus: result.processingStatus,
                processingError: result.processingError
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              sendResponse({
                ok: false,
                error: message
              });
            }
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
