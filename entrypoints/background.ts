import { createTopicReadingRunner, selectTopicReadingItems } from "../src/state/topic-reading-run";
import { loadDeepReadingRecords } from "../src/compare/deep-reading-storage";
import { createDeepReadingRunner } from "../src/state/deep-reading-run";
import { defineBackground } from "wxt/utils/define-background";
import { getInlineCollectDestination, getInlineCollectLastMode, inlineCollectPostKey, INLINE_COLLECT_MODE_NAMES, isInlineCollectMode, projectInlineCollectState, type InlineCollectMessage, type InlineCollectState } from "../src/state/inline-collect";
import { recordInlineCollectRemoval } from "../src/state/inline-collect-storage";
import { IS_PR_ONLY_BUILD } from "../src/build-variant";
import {
  fetchBackendHealth,
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
import {
  createPipelineRequestId,
  emitPipelineEvent,
  setPipelineTraceMirrorTab,
  type PipelinePhase,
  type PipelineTarget
} from "../src/state/pipeline-trace";
import { queueItemsSequential } from "../src/state/queue-items";
import { generateProductProfileSuggestion } from "../src/compare/product-profile-init";
import {
  generateProductContext,
  isProductContextSourceReady,
  LEGACY_PRODUCT_CONTEXT_STORAGE_KEY,
  PRODUCT_CONTEXT_STORAGE_KEY,
  resolveProductContextForAnalysis
} from "../src/compare/product-context";
import { clearProductDerivedCache } from "../src/compare/product-cache-storage";
import {
  migrateLegacyProductContextStorage,
  writeProductContextStorage
} from "../src/compare/product-context-storage";
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
import { materializeProductAnalysisReading } from "../src/compare/product-analysis-reading";
import { saveProductAnalysisResult } from "../src/compare/product-analysis-result-storage";
import {
  listProductAgentTaskFeedback,
  saveProductAgentTaskFeedback
} from "../src/compare/product-agent-task-feedback";
import { buildDLensSignalPacket, buildSignalPacketIndex } from "../src/compare/signal-packet";
import { exportSignalPackets } from "../src/compare/signal-packet-export";
import { buildProductSignalPreferenceExamples } from "../src/compare/product-signal-history";
import { OPENAI_COMPARE_MODEL, CLAUDE_COMPARE_MODEL, GOOGLE_COMPARE_MODEL, generatePrCampaignSetupSuggestion, generatePrCriteriaMatches, generatePrNarrativePostReadings, generatePrNarrativeSynthesis, generatePrSummaryDraft, generateProductSignalAnalysis, generateInlineReading, testProviderKey } from "../src/compare/provider";
import { buildInlineReadingInput, INLINE_READING_PROMPT_VERSION, readCrawlComments } from "../src/compare/inline-reading";
import { aiKeyGap, providerKeyFromSettings } from "../src/state/ai-key";
import { loadInlineReadingRecords, saveInlineReadingRecord } from "../src/compare/inline-reading-storage";
import {
  appendSignalReadingReview,
  getSignalReading,
  listSignalReadings
} from "../src/compare/signal-reading-storage";
import { deleteSignalTagsByItemId } from "../src/compare/signal-tags-storage";
import {
  buildDeterministicPrCriteria,
  buildDeterministicPrCriteriaMatches,
  buildDeterministicPrSummary,
  buildPrSummaryFacts,
  type PrCampaignSetupSuggestion
} from "../src/compare/pr-evidence";
import {
  createEmptyGlobalState,
  createEmptyTabState,
  type ExtensionGlobalState,
  type ExtensionSettings,
  type ExtensionSnapshot,
  type FolderMode,
  type ProductContext,
  type ProductSignalAnalysis,
  type Signal,
  type SessionItem,
  type SessionRecord,
  type TabUiState,
  type Topic
} from "../src/state/types";
import {
  activateSessionForMode,
  applyStoredActiveSessionId,
  createSessionRecord,
  deleteSession,
  expireStaleInFlightItems,
  getActiveSession,
  getSessionById,
  getPostIdentity,
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
import { ensureSignalForSavedItem, ensureSignalsForSessionItems, handleTopicMessage } from "../src/state/topic-handlers";
import { loadAllSignals, loadSignals, loadTopicById, loadTopics, type StorageAreaLike } from "../src/state/topic-storage";
import { clearFolderSynthesis } from "../src/compare/folder-synthesis-storage";
import {
  deletePrEvidenceRowsByItemId,
  loadActivePrCampaign,
  loadPrCampaigns,
  loadPrEvidenceRows,
  savePrCampaign,
  savePrCampaignDraft,
  savePrEvidenceRow,
  toPrEvidenceRowFromSessionItem,
  EMPTY_PR_NARRATIVE_SETTINGS,
  type PrCampaign,
  type PrEvidenceRow
} from "../src/state/pr-evidence-storage";
import {
  getPrNarrativeReadState,
  PrNarrativeSourceChangedError,
  runPrNarrativeRead
} from "../src/state/pr-narrative-handlers";
import { mergeLayoutPreferences, mergeOneLinerSettings, normalizeExtensionSettings } from "../src/state/settings-storage";
import { buildRefreshFailureMessage } from "../src/state/refresh-errors";
import { createAsyncLock } from "../src/state/snapshot-lock";
import {
  requireSaveCurrentPreviewTarget,
  requireSessionActionTarget,
  requireSessionItemActionTarget,
  type SaveCurrentPreviewActionTarget
} from "../src/state/action-target";
import { applySignalDeletionToGlobalState, deleteSignalStorageRecords } from "../src/state/session-signal-seam";
import { createInlineToast } from "../src/state/ui-state";
import { getModeHomePage, projectBackendWorkStatus } from "../src/state/processing-state";
import { sanitizeSnapshotForContentScript } from "../src/state/sanitize-snapshot";
import {
  removeTabSnapshot,
  writeGlobalStateSnapshot,
  writeSnapshotPayload
} from "../src/state/snapshot-storage-seam";
import {
  buildReconcileIgnoredEvent,
  createRequestReconciler,
  type RequestReconcileTarget,
  type RequestReconcileToken
} from "../src/state/request-reconcile";
import { GLOBAL_STATE_STORAGE_KEY as GLOBAL_STORAGE_KEY } from "../src/state/storage-keys";
import { runMigrationsFor, STORAGE_MIGRATIONS } from "../src/state/storage-schema";
const ACTIVE_SESSION_ID_STORAGE_KEY = "dlens:v1:active-session-id";
const TAB_STORAGE_KEY_PREFIX = "dlens:v0:tab-ui:";
const DEFAULT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;
const productSignalAnalysisInFlight = new Map<string, Promise<ProductSignalAnalysis[]>>();
const prCriteriaMatchInFlight = new Map<string, Promise<PrEvidenceRow[]>>();

type ProductSignalFailureDetail = {
  signalId: string;
  itemId?: string;
  sourceUrl?: string;
  error: string;
  errorKind?: string | null;
};

// In-memory hover state per tab — never persisted to storage
const tabHoverCache = new Map<number, Pick<TabUiState, "hoveredTarget" | "hoveredTargetStrength" | "flashPreview" | "currentPreview">>();

// In-memory global state cache — survives within a single service worker lifetime.
// When the worker restarts, this is null and gets lazily reloaded from storage.
let globalStateCache: ExtensionGlobalState | null = null;
// Per-tab UI state cache — lets the hover hot path skip a storage read on every move.
const tabStateCache = new Map<number, TabUiState>();
const withSnapshotLock = createAsyncLock();
const backgroundRequestReconciler = createRequestReconciler();
// Last saveSnapshot/global-only storage.local.set duration. Service worker is
// single-threaded, so handlers can read this right after a persist call to
// surface the storage cost in their response payload (popup-visible).
let lastSaveSnapshotStorageMs = 0;

function tabStorageKey(tabId: number): string {
  return `${TAB_STORAGE_KEY_PREFIX}${tabId}`;
}

function withTimestamp<T extends { updatedAt: string | null }>(value: T): T {
  return {
    ...value,
    updatedAt: new Date().toISOString()
  };
}

async function persistGlobalStateOnly(global: ExtensionGlobalState, logLabel: string): Promise<ExtensionGlobalState> {
  const nextGlobal = withTimestamp(normalizeGlobalState(global));

  const storageStart = performance.now();
  await writeGlobalStateSnapshot(chrome.storage.local, GLOBAL_STORAGE_KEY, nextGlobal);
  const storageSetMs = Math.round(performance.now() - storageStart);
  globalStateCache = nextGlobal;
  lastSaveSnapshotStorageMs = storageSetMs;

  if (storageSetMs >= 50) {
    const itemTotal = nextGlobal.sessions.reduce((sum, session) => sum + session.items.length, 0);
    console.info(logLabel, {
      storageSetMs,
      sessionCount: nextGlobal.sessions.length,
      itemTotal
    });
  }

  return nextGlobal;
}

async function getActiveTabId(): Promise<number> {
  // With DevTools focused, "current window" is the DevTools window, which has no tabs.
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const normal = tabs[0]?.id ? tabs : await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: "normal" });
  const anyNormal = normal[0]?.id ? normal : await chrome.tabs.query({ active: true, windowType: "normal" });
  const tabId = anyNormal[0]?.id;
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

function readSenderTraceFlag(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url || sender.tab?.url || "";
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const searchValue = parsed.searchParams.get("dlensQaTrace");
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const hashValue = hashParams.get("dlensQaTrace");
    return searchValue === "1" || searchValue === "true" || searchValue === "yes"
      || hashValue === "1" || hashValue === "true" || hashValue === "yes";
  } catch {
    return false;
  }
}

function restorePipelineTraceMirrorFromSender(sender: chrome.runtime.MessageSender): void {
  const tabId = sender.tab?.id;
  if (typeof tabId === "number" && readSenderTraceFlag(sender)) {
    setPipelineTraceMirrorTab(tabId);
  }
}

async function loadGlobalState(): Promise<ExtensionGlobalState> {
  const raw = await chrome.storage.local.get([GLOBAL_STORAGE_KEY, ACTIVE_SESSION_ID_STORAGE_KEY]);
  const stored = raw[GLOBAL_STORAGE_KEY];
  // Storage migration registry stamps schemaVersion on stored payloads from
  // before the registry existed (`dlens:v0:global-state` written without a
  // schemaVersion field). Fresh installs use createEmptyGlobalState() which
  // already carries the current registry schema version.
  const migrated = stored
    ? runMigrationsFor<ExtensionGlobalState>(STORAGE_MIGRATIONS, GLOBAL_STORAGE_KEY, stored)
    : createEmptyGlobalState();
  const storedSchemaVersion = stored && typeof stored === "object"
    ? (stored as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  const migrationNeedsWrite = storedSchemaVersion !== migrated.schemaVersion;
  const normalized = normalizeGlobalState(migrated);
  const activeOverlaid = applyStoredActiveSessionId(normalized, raw[ACTIVE_SESSION_ID_STORAGE_KEY]);
  const expired = expireStaleInFlightItems(activeOverlaid);
  if (migrationNeedsWrite || expired !== activeOverlaid) {
    return persistGlobalStateOnly(expired, "[DLens] loadGlobalState");
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
  const sessions = Array.isArray(state?.sessions) ? state.sessions.map((session) => normalizeSessionRecord(session)) : [];
  const activeSessionId =
    typeof state?.activeSessionId === "string" && sessions.some((session) => session.id === state.activeSessionId)
      ? state.activeSessionId
      : sessions[0]?.id ?? null;
  return {
    ...state,
    sessions,
    activeSessionId,
    ...(isInlineCollectMode(state?.lastCollectMode) ? { lastCollectMode: state.lastCollectMode } : { lastCollectMode: undefined }),
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

async function saveProductContext(
  productContext: ProductContext | null,
  options: BackgroundReconcileOptions = {}
): Promise<void> {
  if (!shouldApplyBackgroundReconcile(options)) {
    return;
  }
  await writeProductContextStorage(chrome.storage.local, productContext);
}

async function loadProductContext(): Promise<ProductContext | null> {
  const raw = await chrome.storage.local.get([
    PRODUCT_CONTEXT_STORAGE_KEY,
    LEGACY_PRODUCT_CONTEXT_STORAGE_KEY
  ]);
  const value = raw[PRODUCT_CONTEXT_STORAGE_KEY] ?? raw[LEGACY_PRODUCT_CONTEXT_STORAGE_KEY];
  if (value && typeof value === "object" && !raw[PRODUCT_CONTEXT_STORAGE_KEY]) {
    await migrateLegacyProductContextStorage(chrome.storage.local, value);
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  // Vertical schema migration: stamps schemaVersion on payloads written before
  // the registry existed. Horizontal legacy key migration (the line above) is
  // a separate concern handled by migrateLegacyProductContextStorage.
  return runMigrationsFor<ProductContext>(STORAGE_MIGRATIONS, PRODUCT_CONTEXT_STORAGE_KEY, value);
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

function buildProductSignalFailureDetails({
  session,
  signals,
  analyses
}: {
  session: SessionRecord | null;
  signals: Signal[];
  analyses: ProductSignalAnalysis[];
}): ProductSignalFailureDetail[] {
  const itemById = new Map((session?.items || []).map((item) => [item.id, item]));
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const failures: ProductSignalFailureDetail[] = [];
  const seenSignalIds = new Set<string>();

  for (const signal of signals) {
    const item = signal.itemId ? itemById.get(signal.itemId) : null;
    if (!item || item.status !== "failed") {
      continue;
    }
    seenSignalIds.add(signal.id);
    failures.push({
      signalId: signal.id,
      itemId: item.id,
      sourceUrl: item.canonicalTargetUrl || item.descriptor.post_url || item.descriptor.page_url,
      error: item.lastError || "Backend processing failed.",
      errorKind: item.lastErrorKind
    });
  }

  for (const analysis of analyses) {
    if (analysis.status !== "error" || seenSignalIds.has(analysis.signalId)) {
      continue;
    }
    const signal = signalById.get(analysis.signalId);
    failures.push({
      signalId: analysis.signalId,
      ...(signal?.itemId ? { itemId: signal.itemId } : {}),
      error: analysis.error || analysis.reason || "Product signal analysis failed.",
      errorKind: "product_signal_analysis"
    });
  }

  return failures.slice(0, 5);
}

async function compileProductContextIfReady(
  global: ExtensionGlobalState,
  options: BackgroundReconcileOptions = {}
): Promise<{ productContext: ProductContext | null; error: string | null }> {
  const productProfile = global.settings.productProfile;
  if (!productProfile || !isProductContextSourceReady(productProfile)) {
    await saveProductContext(null, options);
    return { productContext: null, error: null };
  }

  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    await saveProductContext(null, options);
    return { productContext: null, error: "尚未設定目前 AI provider 的 API key。" };
  }

  try {
    const productContext = await generateProductContext(
      providerConfig.provider,
      providerConfig.apiKey,
      productProfile
    );
    await saveProductContext(productContext, options);
    return { productContext, error: null };
  } catch (error) {
    console.error("[dlens] product context compile failed:", error instanceof Error ? error.message : error);
    await saveProductContext(null, options);
    return { productContext: null, error: compactProviderError(error, providerConfig.apiKey) };
  }
}

async function analyzeProductSignalsForSession(
  global: ExtensionGlobalState,
  sessionId: string,
  options: { allowMissingPrerequisites?: boolean } & BackgroundReconcileOptions = {}
): Promise<ProductSignalAnalysis[]> {
  const inFlight = productSignalAnalysisInFlight.get(sessionId);
  if (inFlight && !options.reconcileToken) {
    return inFlight;
  }
  const run = analyzeProductSignalsForSessionUnlocked(global, sessionId, options);
  productSignalAnalysisInFlight.set(sessionId, run);
  try {
    return await run;
  } finally {
    if (productSignalAnalysisInFlight.get(sessionId) === run) {
      productSignalAnalysisInFlight.delete(sessionId);
    }
  }
}

async function analyzeProductSignalsForSessionUnlocked(
  global: ExtensionGlobalState,
  sessionId: string,
  options: { allowMissingPrerequisites?: boolean } & BackgroundReconcileOptions = {}
): Promise<ProductSignalAnalysis[]> {
  const storageArea = withDirectStorageReconcile(chrome.storage.local, options);
  const session = normalizeGlobalState(global).sessions.find((entry) => entry.id === sessionId) || null;
  if (!session || session.mode !== "product") {
    return [];
  }

  const productContext = await resolveProductContextForAnalysis({
    cachedContext: await loadProductContext(),
    productProfile: global.settings.productProfile,
    allowMissingPrerequisites: options.allowMissingPrerequisites,
    compileProductContext: () => compileProductContextIfReady(global, options)
  });
  if (!productContext) {
    return listProductSignalAnalyses(storageArea);
  }

  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    if (!options.allowMissingPrerequisites) {
      throw new Error("尚未設定 AI key。請先在 Settings 設定 Google / OpenAI / Claude key。");
    }
    return listProductSignalAnalyses(storageArea);
  }

  const productContextHash = buildProductContextHash(productContext);
  const signals = await loadSignals(storageArea, sessionId);
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const [agentTaskFeedback, historicalAnalyses] = await Promise.all([
    listProductAgentTaskFeedback(storageArea),
    listProductSignalAnalyses(storageArea)
  ]);
  const feedbackExamples = buildProductSignalPreferenceExamples(agentTaskFeedback, historicalAnalyses);
  const touchedSignalIds: string[] = [];
  let skippedReadyWithoutContent = 0;

  for (const signal of signals) {
    if (!signal.itemId || signal.inboxStatus === "archived" || signal.inboxStatus === "rejected") {
      continue;
    }
    touchedSignalIds.push(signal.id);
    const existing = await getProductSignalAnalysis(storageArea, signal.id);

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

    const commitIfLive = async (commit: () => Promise<void>): Promise<void> => {
      await withSnapshotLock(async () => {
        if (!shouldApplyBackgroundReconcile(options)) {
          return;
        }
        const [liveGlobal, liveSignals] = await Promise.all([
          loadGlobalState(),
          loadSignals(storageArea, session.id)
        ]);
        const liveSession = liveGlobal.sessions.find((entry) =>
          entry.id === session.id && entry.mode === "product"
        ) || null;
        const liveItem = liveSession?.items.find((entry) => entry.id === item.id) || null;
        const liveSignal = liveSignals.find((entry) =>
          entry.id === signal.id
          && entry.itemId === item.id
          && entry.inboxStatus !== "archived"
          && entry.inboxStatus !== "rejected"
        ) || null;
        if (!liveItem || !liveSignal) {
          return;
        }
        await commit();
      });
    };

    try {
      const analysis = await generateProductSignalAnalysis(
        providerConfig.provider,
        providerConfig.apiKey,
        input
      );
      const reading = materializeProductAnalysisReading({
        analysis,
        analyzerInput: input,
        postUrl: item.descriptor.post_url || item.descriptor.page_url || ""
      });
      await commitIfLive(async () => {
        await saveProductAnalysisResult(storageArea, analysis, reading);
      });
    } catch (error) {
      console.error("[dlens] product signal analysis failed:", signal.id, error instanceof Error ? error.message : error);
      const errorAnalysis = buildProductSignalErrorAnalysis({
        signalId: signal.id,
        productContextHash,
        error,
        apiKey: providerConfig.apiKey
      });
      await commitIfLive(async () => {
        await saveProductSignalAnalysis(storageArea, errorAnalysis);
      });
    }
  }

  if (skippedReadyWithoutContent > 0 && !options.allowMissingPrerequisites) {
    throw new Error("crawl 已完成，但沒有 assembled content 可分析。請重新處理該貼文。");
  }

  return listProductSignalAnalyses(storageArea, touchedSignalIds);
}

async function queueSavedProductSignalItemsForAnalysis(
  tabId: number,
  sessionId: string,
  options: BackgroundReconcileOptions = {}
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
    const result = await queueSessionItem(tabId, sessionId, itemId, {
      reconcileToken: options.reconcileToken
    });
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
      await mutateSnapshot(tabId, (snapshot) => snapshot);
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
  return providerKeyFromSettings(normalizeGlobalState(global).settings);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createPrCampaignStamp() {
  const random = Math.random().toString(36).slice(2, 10);
  return {
    id: `prcampaign_${random}_${Date.now().toString(36)}`,
    now: new Date().toISOString()
  };
}

async function generatePrSetupForGlobal(
  global: ExtensionGlobalState,
  campaignName: string,
  briefText: string
): Promise<PrCampaignSetupSuggestion> {
  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    return {
      criteria: buildDeterministicPrCriteria(campaignName, briefText),
      narrativeSettings: { ...EMPTY_PR_NARRATIVE_SETTINGS }
    };
  }
  return generatePrCampaignSetupSuggestion(providerConfig.provider, providerConfig.apiKey, campaignName, briefText);
}

async function findPrCampaignContext(
  storageArea: StorageAreaLike,
  global: ExtensionGlobalState,
  campaignId: string
): Promise<{ campaign: PrCampaign; rows: PrEvidenceRow[]; session: SessionRecord }> {
  for (const session of global.sessions) {
    const campaigns = await loadPrCampaigns(storageArea, session.id);
    const campaign = campaigns.find((entry) => entry.id === campaignId);
    if (campaign) {
      return {
        campaign,
        rows: await loadPrEvidenceRows(storageArea, campaign.id),
        session
      };
    }
  }
  throw new Error("PR campaign not found.");
}

function prNarrativeModel(provider: "openai" | "claude" | "google"): string {
  if (provider === "openai") return OPENAI_COMPARE_MODEL;
  if (provider === "claude") return CLAUDE_COMPARE_MODEL;
  return GOOGLE_COMPARE_MODEL;
}

async function matchPrCriteriaForCampaign(
  global: ExtensionGlobalState,
  campaignId: string,
  options: BackgroundReconcileOptions = {}
): Promise<PrEvidenceRow[]> {
  const storageArea = withDirectStorageReconcile(chrome.storage.local, options);
  const existing = prCriteriaMatchInFlight.get(campaignId);
  if (existing && !options.reconcileToken) {
    return existing;
  }

  const promise = (async () => {
    const campaigns = await loadPrCampaigns(storageArea, "");
    const campaign = campaigns.find((entry) => entry.id === campaignId)
      || (await Promise.all(global.sessions.map((session) => loadPrCampaigns(storageArea, session.id))))
        .flat()
        .find((entry) => entry.id === campaignId)
      || null;
    if (!campaign) {
      throw new Error("PR campaign not found.");
    }
    const rows = await loadPrEvidenceRows(storageArea, campaignId);
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
        await savePrEvidenceRow(storageArea, nextRow);
        nextRows.push(nextRow);
      }
    }
    await savePrCampaign(storageArea, {
      ...campaign,
      lastMatchedAt: now,
      updatedAt: now
    });
    return loadPrEvidenceRows(storageArea, campaignId);
  })();

  prCriteriaMatchInFlight.set(campaignId, promise);
  try {
    return await promise;
  } finally {
    if (prCriteriaMatchInFlight.get(campaignId) === promise) {
      prCriteriaMatchInFlight.delete(campaignId);
    }
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
  campaignId: string,
  options: BackgroundReconcileOptions = {}
): Promise<{ rows: PrEvidenceRow[]; summary: { updated: number; failed: number } }> {
  const storageArea = withDirectStorageReconcile(chrome.storage.local, options);
  const campaigns = await loadPrCampaigns(storageArea, "");
  const campaign = campaigns.find((entry) => entry.id === campaignId)
    || (await Promise.all(global.sessions.map((session) => loadPrCampaigns(storageArea, session.id))))
      .flat()
      .find((entry) => entry.id === campaignId)
    || null;
  if (!campaign) {
    throw new Error("PR campaign not found.");
  }

  const rows = await loadPrEvidenceRows(storageArea, campaignId);
  if (!rows.length) {
    return { rows, summary: { updated: 0, failed: 0 } };
  }

  const baseUrl = normalizeBaseUrl(global.settings.ingestBaseUrl);
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.postUrl.trim()) {
      failed += 1;
      await savePrEvidenceRow(storageArea, {
        ...row,
        advancedMetricsError: "Missing post URL."
      });
      continue;
    }
    try {
      const response = await fetchThreadsAdvancedMetrics(baseUrl, row.postUrl);
      const nextRow = mergeAdvancedMetrics(row, response.metrics || {}, response.fetched_at || new Date().toISOString());
      await savePrEvidenceRow(storageArea, nextRow);
      updated += 1;
    } catch (error) {
      failed += 1;
      await savePrEvidenceRow(storageArea, {
        ...row,
        advancedMetricsError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    rows: await loadPrEvidenceRows(storageArea, campaignId),
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

interface BackgroundReconcileOptions {
  reconcileToken?: RequestReconcileToken | null;
}

interface SnapshotSaveOptions extends BackgroundReconcileOptions {
  persistActiveSessionId?: boolean;
  /** Persist only the tab-state key. For mutations that leave the global
   * state untouched (e.g. selection toggles) this skips serializing and
   * rewriting the full session blob on the hot path (B-02). */
  tabOnly?: boolean;
}

function beginBackgroundSnapshotReconcile(
  lane: string,
  requestId: string,
  target: RequestReconcileTarget
): RequestReconcileToken {
  return backgroundRequestReconciler.begin({
    lane,
    requestId,
    target
  });
}

function shouldApplyBackgroundReconcile(options: BackgroundReconcileOptions): boolean {
  if (!options.reconcileToken) {
    return true;
  }
  const decision = backgroundRequestReconciler.check(options.reconcileToken, {
    currentTarget: options.reconcileToken.target
  });
  if (!decision.accepted) {
    emitPipelineEvent(buildReconcileIgnoredEvent(options.reconcileToken, decision));
    return false;
  }
  return true;
}

function isBackgroundReconcileCurrent(options: BackgroundReconcileOptions): boolean {
  if (!options.reconcileToken) {
    return true;
  }
  return backgroundRequestReconciler.check(options.reconcileToken, {
    currentTarget: options.reconcileToken.target
  }).accepted;
}

function shouldPersistSnapshot(options: SnapshotSaveOptions): boolean {
  return shouldApplyBackgroundReconcile(options);
}

function withDirectStorageReconcile(
  storageArea: StorageAreaLike,
  options: BackgroundReconcileOptions
): StorageAreaLike {
  return {
    get: storageArea.get.bind(storageArea),
    set: async (items) => {
      if (!shouldApplyBackgroundReconcile(options)) {
        return;
      }
      await storageArea.set(items);
    }
  };
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
    .sendMessage(tabId, { type: "state/updated", tabId, snapshot: sanitizeSnapshotForContentScript(snapshot) } satisfies ExtensionMessage)
    .catch(() => undefined);
}

function broadcastDirectStorageUpdate(
  tabId: number,
  snapshot: ExtensionSnapshot,
  options: BackgroundReconcileOptions
): void {
  if (!isBackgroundReconcileCurrent(options)) {
    return;
  }
  broadcastSnapshotUpdate(tabId, snapshot);
}

/** Strip raw API keys from any snapshot in a response bound for a content-script sender. */
function sanitizeResponseForContentScript(response: ExtensionResponse): ExtensionResponse {
  if (response.ok && response.snapshot) {
    return { ...response, snapshot: sanitizeSnapshotForContentScript(response.snapshot) };
  }
  return response;
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
  const storageStart = performance.now();
  await writeSnapshotPayload(chrome.storage.local, payload);
  const storageSetMs = Math.round(performance.now() - storageStart);
  cacheSnapshot(tabId, snapshot);
  lastSaveSnapshotStorageMs = storageSetMs;

  broadcastSnapshotUpdate(tabId, snapshot);
  logSlowSnapshotSave(logLabel, snapshot, storageSetMs);

  return snapshot;
}

// A null/dangling active-session pointer must never reach storage while sessions
// still exist: that is exactly the B-05 drift state where Product renders empty
// against populated storage. Fall back to the last cached pointer, then the
// first session, before accepting null (legitimate only when no sessions remain).
function resolvePersistableActiveSessionId(
  global: ExtensionGlobalState,
  fallbackId: string | null | undefined
): string | null {
  const isValid = (id: string | null | undefined): id is string =>
    typeof id === "string" && global.sessions.some((session) => session.id === id);
  if (isValid(global.activeSessionId)) {
    return global.activeSessionId;
  }
  if (isValid(fallbackId)) {
    return fallbackId;
  }
  return global.sessions[0]?.id ?? null;
}

function withPersistableActiveSessionId(global: ExtensionGlobalState): ExtensionGlobalState {
  const resolved = resolvePersistableActiveSessionId(global, globalStateCache?.activeSessionId);
  return resolved === global.activeSessionId ? global : { ...global, activeSessionId: resolved };
}

async function saveSnapshot(tabId: number, snapshot: ExtensionSnapshot, options: SnapshotSaveOptions = {}): Promise<ExtensionSnapshot> {
  const global = options.persistActiveSessionId
    ? withPersistableActiveSessionId(snapshot.global)
    : applyStoredActiveSessionId(snapshot.global, globalStateCache?.activeSessionId);
  const nextSnapshot = {
    global: options.tabOnly ? global : withTimestamp(global),
    tab: withTimestamp(normalizeTabState(snapshot.tab))
  };
  const payload: Record<string, unknown> = {
    [tabStorageKey(tabId)]: nextSnapshot.tab
  };
  if (!options.tabOnly) {
    payload[GLOBAL_STORAGE_KEY] = nextSnapshot.global;
  }
  if (options.persistActiveSessionId) {
    payload[ACTIVE_SESSION_ID_STORAGE_KEY] = nextSnapshot.global.activeSessionId;
  }

  if (!shouldPersistSnapshot(options)) {
    return nextSnapshot;
  }
  return persistSnapshot(tabId, nextSnapshot, payload, "[DLens] saveSnapshot");
}

async function saveActiveSessionSnapshot(tabId: number, snapshot: ExtensionSnapshot): Promise<ExtensionSnapshot> {
  const nextSnapshot = {
    global: withTimestamp(withPersistableActiveSessionId(snapshot.global)),
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

type SnapshotMutationResult = ExtensionSnapshot | {
  snapshot: ExtensionSnapshot;
  saveOptions?: SnapshotSaveOptions;
};

function isSnapshotMutationPayload(result: SnapshotMutationResult): result is Exclude<SnapshotMutationResult, ExtensionSnapshot> {
  return "snapshot" in result;
}

async function mutateSnapshot(
  tabId: number,
  mutate: (current: ExtensionSnapshot) => SnapshotMutationResult | Promise<SnapshotMutationResult>,
  options: SnapshotSaveOptions = {}
): Promise<ExtensionSnapshot> {
  return withSnapshotLock(async () => {
    const current = await loadSnapshot(tabId);
    const result = await mutate(current);
    const nextSnapshot = isSnapshotMutationPayload(result) ? result.snapshot : result;
    const saveOptions = isSnapshotMutationPayload(result) ? result.saveOptions ?? options : options;
    return saveSnapshot(tabId, nextSnapshot, saveOptions);
  });
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
  return mutateSnapshot(tabId, (current) => ({
    global: {
      ...current.global,
      ...(patch.global || {})
    },
    tab: {
      ...current.tab,
      ...(patch.tab || {})
    }
  }));
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

async function traceBackgroundPipeline<T>({
  phase,
  step,
  target,
  requestId,
  detail,
  responseDetail,
  run
}: {
  phase: PipelinePhase;
  step: string;
  target: PipelineTarget;
  requestId?: string;
  detail?: unknown;
  responseDetail?: (value: T) => unknown;
  run: () => Promise<T>;
}): Promise<T> {
  const resolvedRequestId = requestId ?? createPipelineRequestId(step);
  emitPipelineEvent({
    phase,
    step: `${step}.request`,
    target,
    result: "pending",
    requestId: resolvedRequestId,
    detail
  });
  try {
    const value = await run();
    emitPipelineEvent({
      phase,
      step: `${step}.response`,
      target,
      result: "ok",
      requestId: resolvedRequestId,
      detail: responseDetail ? responseDetail(value) : undefined
    });
    return value;
  } catch (error) {
    emitPipelineEvent({
      phase,
      step: `${step}.response`,
      target,
      result: "error",
      requestId: resolvedRequestId,
      detail: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
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

type InlineRemovalUndo = {
  tabId: number;
  postKey: string;
  version: number;
  sessionId: string;
  item: SessionItem;
  index: number;
  restore: () => Promise<void>;
};
const inlineMutationVersions = new Map<string, number>();
const inlineRemovalUndos = new Map<string, InlineRemovalUndo>();
let inlineUndoSerial = 0;

function invalidateInlineCollectUndo(descriptor: TargetDescriptor): number {
  const postKey = inlineCollectPostKey(descriptor);
  const version = (inlineMutationVersions.get(postKey) ?? 0) + 1;
  inlineMutationVersions.set(postKey, version);
  for (const [token, undo] of inlineRemovalUndos) {
    if (undo.postKey === postKey) inlineRemovalUndos.delete(token);
  }
  return version;
}

/** One save implementation shared by preview, create-with-save and inline collection. */
async function saveDescriptorAndDerived(
  global: ExtensionGlobalState,
  session: SessionRecord,
  descriptor: TargetDescriptor,
  topicId?: string
): Promise<ReturnType<typeof saveDescriptorToSession>> {
  const saved = saveDescriptorToSession(global, session.id, descriptor);
  if (session.mode === "pr-evidence") {
    const campaign = await loadActivePrCampaign(chrome.storage.local, session.id);
    if (!campaign) throw new Error("Create a PR campaign before collecting evidence.");
    await savePrEvidenceRow(chrome.storage.local, toPrEvidenceRowFromSessionItem(campaign.id, saved.item));
  } else {
    await ensureSignalForSavedItem(chrome.storage.local, session, saved.item, topicId);
  }
  invalidateInlineCollectUndo(descriptor);
  return saved;
}

async function saveCurrentPreviewToSession(
  tabId: number,
  target: SaveCurrentPreviewActionTarget,
  descriptor?: TargetDescriptor
): Promise<ExtensionSnapshot> {
  return mutateSnapshot(tabId, async (current) => {
    const session = getSessionById(current.global, target.sessionId);
    if (!session) {
      throw new Error("Target folder not found.");
    }
    let activeSessionRealigned = false;
    // The popup tells us exactly which folder it is showing. Honor it (and realign the
    // active session) so a drifted activeSessionId can't reroute the save to the wrong folder.
    if (target.sessionId !== current.global.activeSessionId) {
      current.global = setActiveSession(current.global, target.sessionId);
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

    const collectionTopicId = session.mode === "topic" ? target.topicId ?? undefined : undefined;
    const saved = await saveDescriptorAndDerived(current.global, session, current.tab.currentPreview, collectionTopicId);
    return {
      snapshot: {
        global: saved.globalState,
        tab: {
          ...current.tab,
          activeItemId: saved.item.id,
          lastSavedToast: createInlineToast(
            "saved",
            session.name,
            undefined,
            saved.created ? { sessionId: session.id, itemId: saved.item.id } : null
          ),
          error: null
        }
      },
      saveOptions: { persistActiveSessionId: activeSessionRealigned }
    };
  });
}

/**
 * Reverse of `saveCurrentPreviewToSession` for the 5-second undo window offered
 * by the save toast. Only an item the save actually created is undoable, so the
 * caller's `itemId` is the one stamped on `lastSavedToast.undo`. Every derived
 * record the save wrote (signal, product analysis, signal tags, PR evidence row)
 * is removed with the item so undo cannot leave an orphan behind.
 */
async function removeSavedItemFromSnapshot(
  current: ExtensionSnapshot,
  sessionId: string,
  itemId: string,
  storageArea: StorageAreaLike,
  derivedRef: { signals: Signal[]; topics: Topic[] }
): Promise<ExtensionSnapshot> {
  const session = getSessionById(current.global, sessionId);
  if (!session) {
    throw new Error("Target folder not found.");
  }
  const item = session.items.find((entry) => entry.id === itemId);
  if (!item) {
    throw new Error("Saved post is already gone.");
  }

  if (session.mode === "pr-evidence") {
    const campaign = await loadActivePrCampaign(storageArea, session.id);
    if (campaign) {
      await deletePrEvidenceRowsByItemId(storageArea, campaign.id, itemId);
    }
  } else if (session.mode !== "archive") {
    const signals = await loadSignals(storageArea, session.id);
    const signal = signals.find((entry) => entry.itemId === itemId);
    if (signal) {
      const deletion = await deleteSignalStorageRecords(storageArea, signal.id);
      await deleteProductSignalAnalysis(storageArea, signal.id);
      derivedRef.signals = deletion.signals.filter((entry) => entry.sessionId === session.id);
      derivedRef.topics = deletion.topics.filter((entry) => entry.sessionId === session.id);
    }
  }
  await deleteSignalTagsByItemId(storageArea, itemId);

  invalidateInlineCollectUndo(item.descriptor);
  const globalState = removeSessionItem(current.global, sessionId, itemId);
  const nextSession = getSessionById(globalState, sessionId);
  const nextActiveItemId = current.tab.activeItemId === itemId
    ? (nextSession ? ensureActiveItemId(nextSession, null) : null)
    : current.tab.activeItemId;
  const nextActiveItem = nextSession?.items.find((entry) => entry.id === nextActiveItemId) ?? null;
  return {
    global: globalState,
    tab: {
      ...current.tab,
      activeItemId: nextActiveItemId,
      currentPreview: current.tab.activeItemId === itemId
        ? nextActiveItem?.descriptor ?? current.tab.hoveredTarget
        : current.tab.currentPreview,
      lastSavedToast: null,
      error: null
    }
  };
}

async function undoSavedItem(
  tabId: number,
  sessionId: string,
  itemId: string
): Promise<{ snapshot: ExtensionSnapshot; signals: Signal[]; topics: Topic[] }> {
  const derivedRef: { signals: Signal[]; topics: Topic[] } = { signals: [], topics: [] };
  const snapshot = await mutateSnapshot(tabId, async (current) => {
    return removeSavedItemFromSnapshot(current, sessionId, itemId, chrome.storage.local, derivedRef);
  });
  return { snapshot, signals: derivedRef.signals, topics: derivedRef.topics };
}

async function createSession(
  tabId: number,
  name: string,
  saveCurrentPreview = false,
  mode: FolderMode = "topic",
  descriptor?: TargetDescriptor
): Promise<ExtensionSnapshot> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Folder name is required.");
  }
  return mutateSnapshot(tabId, async (current) => {
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
      const saved = await saveDescriptorAndDerived(globalState, session, current.tab.currentPreview);
      globalState = saved.globalState;
      activeItemId = saved.item.id;
      popupPage = "collection";
      currentMainPage = "collection";
      lastSavedToast = createInlineToast(
        "saved",
        session.name,
        undefined,
        saved.created ? { sessionId: session.id, itemId: saved.item.id } : null
      );
    }

    return {
      snapshot: {
        global: globalState,
        tab: {
          ...current.tab,
          activeItemId,
          popupPage,
          currentMainPage,
          lastSavedToast,
          error: null
        }
      },
      saveOptions: { persistActiveSessionId: true }
    };
  });
}

async function collectInline(
  tabId: number,
  message: InlineCollectMessage
): Promise<{ snapshot: ExtensionSnapshot; inlineCollect: InlineCollectState }> {
  if (message.action === "snapshot") {
    const snapshot = await loadSnapshot(tabId);
    return { snapshot, inlineCollect: projectInlineCollectState(snapshot.global) };
  }
  return withSnapshotLock(async () => {
    let changed = false;
    let undoToken: string | undefined;
    const current = await loadSnapshot(tabId);
    const next = await (async (): Promise<ExtensionSnapshot> => {
      if (message.action === "save") {
        if (message.mode !== undefined && !isInlineCollectMode(message.mode)) throw new Error("Unknown collection mode.");
        if (!inlineCollectPostKey(message.descriptor)) throw new Error("Missing post identity.");
        const mode = message.mode ?? getInlineCollectLastMode(current.global);
        let session = getInlineCollectDestination(current.global, mode);
        let global = current.global;
        if (!session) {
          session = createSessionRecord(INLINE_COLLECT_MODE_NAMES[mode], new Date().toISOString(), mode);
          global = { ...global, sessions: [...global.sessions, session] };
        }
        if (mode === "pr-evidence" && !await loadActivePrCampaign(chrome.storage.local, session.id)) {
          await savePrCampaignDraft(chrome.storage.local, {
            sessionId: session.id, name: session.name, briefText: "",
            criteria: ["c1", "c2", "c3", "c4", "c5", "c6"].map(id => ({ id, label: "" })) as PrCampaign["criteria"]
          });
        }
        const saved = await saveDescriptorAndDerived(global, session, message.descriptor);
        changed = true;
        return { global: { ...saved.globalState, lastCollectMode: mode }, tab: current.tab };
      }
      if (message.action === "remove") {
        const session = getSessionById(current.global, message.sessionId);
        const item = session?.items.find(entry => entry.id === message.itemId);
        if (!session || !item || inlineCollectPostKey(item.descriptor) !== inlineCollectPostKey(message.descriptor)) {
          return current;
        }
        const recorded = recordInlineCollectRemoval(chrome.storage.local);
        const removed = await removeSavedItemFromSnapshot(current, session.id, item.id, recorded.storage, { signals: [], topics: [] });
        const postKey = inlineCollectPostKey(item.descriptor);
        for (const [token, previous] of inlineRemovalUndos) {
          if (previous.tabId === tabId) inlineRemovalUndos.delete(token);
        }
        undoToken = `inline-undo-${++inlineUndoSerial}`;
        inlineRemovalUndos.set(undoToken, {
          tabId, postKey, version: inlineMutationVersions.get(postKey)!, sessionId: session.id,
          item: structuredClone(item), index: session.items.indexOf(item), restore: recorded.restore
        });
        changed = true;
        return { global: removed.global, tab: current.tab };
      }
      const undo = inlineRemovalUndos.get(message.token);
      if (!undo || inlineMutationVersions.get(undo.postKey) !== undo.version) return current;
      const session = getSessionById(current.global, undo.sessionId);
      if (!session || session.items.some(item => inlineCollectPostKey(item.descriptor) === undo.postKey)) {
        inlineRemovalUndos.delete(message.token);
        return current;
      }
      await undo.restore();
      const items = [...session.items];
      items.splice(Math.min(undo.index, items.length), 0, undo.item);
      invalidateInlineCollectUndo(undo.item.descriptor);
      changed = true;
      return {
        global: {
          ...current.global,
          sessions: current.global.sessions.map(entry => entry.id === session.id
            ? { ...entry, items, updatedAt: new Date().toISOString() } : entry)
        },
        tab: current.tab
      };
    })();
    const snapshot = changed ? await saveSnapshot(tabId, next) : current;
    return { snapshot, inlineCollect: { ...projectInlineCollectState(snapshot.global), changed, ...(undoToken ? { undoToken } : {}) } };
  });
}

async function renameExistingSession(tabId: number, sessionId: string, name: string): Promise<ExtensionSnapshot> {
  return mutateSnapshot(tabId, (current) => ({
    global: renameSession(current.global, sessionId, name),
    tab: {
      ...current.tab,
      error: null
    }
  }));
}

async function deleteExistingSession(tabId: number, sessionId: string): Promise<ExtensionSnapshot> {
  return mutateSnapshot(tabId, (current) => {
    const globalState = deleteSession(current.global, sessionId);
    const nextSession = getActiveSession(globalState);
    const nextItemId = nextSession ? ensureActiveItemId(nextSession, current.tab.activeItemId) : null;
    const nextItem = nextSession?.items.find((item) => item.id === nextItemId) || null;

    return {
      snapshot: {
        global: globalState,
        tab: {
          ...current.tab,
          activeItemId: nextItemId,
          currentPreview: nextItem?.descriptor || current.tab.hoveredTarget,
          popupPage: "collection",
          currentMainPage: "collection",
          error: null
        }
      },
      saveOptions: { persistActiveSessionId: true }
    };
  });
}

async function setActiveSessionById(tabId: number, sessionId: string): Promise<ExtensionSnapshot> {
  return mutateSnapshot(tabId, (current) => {
    const activated = setActiveSession(current.global, sessionId);
    const globalState = {
      ...activated,
      sessions: activated.sessions.map(session => session.id === sessionId
        ? { ...session, updatedAt: new Date().toISOString() } : session)
    };
    const activeSession = activeSessionWithFallback(globalState);
    const activeItemId = ensureActiveItemId(activeSession, current.tab.activeItemId);
    const activeItem = activeSession.items.find((item) => item.id === activeItemId) || null;
    return {
      snapshot: {
        global: globalState,
        tab: {
          ...current.tab,
          activeItemId,
          currentPreview: activeItem?.descriptor || current.tab.hoveredTarget,
          popupPage: "collection",
          currentMainPage: "collection",
          error: null
        }
      },
      saveOptions: { persistActiveSessionId: true }
    };
  });
}

async function setActiveItem(tabId: number, sessionId: string, itemId: string): Promise<ExtensionSnapshot> {
  return mutateSnapshot(tabId, (current) => {
    const globalState = current.global.activeSessionId === sessionId ? current.global : setActiveSession(current.global, sessionId);
    const session = globalState.sessions.find((candidate) => candidate.id === sessionId);
    const item = session?.items.find((candidate) => candidate.id === itemId) || null;
    return {
      snapshot: {
        global: globalState,
        tab: {
          ...current.tab,
          activeItemId: itemId,
          currentPreview: item?.descriptor || current.tab.currentPreview,
          error: null
        }
      },
      saveOptions: { persistActiveSessionId: globalState.activeSessionId !== current.global.activeSessionId }
    };
  });
}

async function queueSessionItem(
  tabId: number,
  sessionId: string,
  itemId: string,
  options: { reconcileToken?: RequestReconcileToken | null } = {}
): Promise<{ snapshot: ExtensionSnapshot; submit: CaptureTargetResponse }> {
  // Raw lock: this mutation returns ingest submit metadata in addition to the saved snapshot.
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
    }, { reconcileToken: options.reconcileToken });
    if (session.mode === "product") {
      queueProductSignalAutoAnalysis(tabId, nextSnapshot.global, sessionId);
    }

    return {
      snapshot: nextSnapshot,
      submit
    };
  });
}

async function queueAllPending(
  tabId: number,
  sessionId: string,
  options: { reconcileToken?: RequestReconcileToken | null } = {}
): Promise<ExtensionSnapshot> {
  let snapshot = await loadSnapshot(tabId);
  const session = snapshot.global.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("Target folder not found.");
  }

  const pending = session.items.filter((item) => item.status === "saved" || item.status === "failed");

  // Keep queueing sequential so each item sees the latest persisted snapshot.
  for (const item of pending) {
    try {
      const result = await queueSessionItem(tabId, session.id, item.id, {
        reconcileToken: options.reconcileToken
      });
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
  itemIds: string[],
  options: { reconcileToken?: RequestReconcileToken | null } = {}
): Promise<{ snapshot: ExtensionSnapshot; queuedItemIds: string[]; failedItemIds: string[] }> {
  const snapshot = await loadSnapshot(tabId);
  return queueItemsSequential({
    initialSnapshot: snapshot,
    itemIds,
    queueOne: async (itemId) => {
      const result = await queueSessionItem(tabId, sessionId, itemId, {
        reconcileToken: options.reconcileToken
      });
      return result.snapshot;
    }
  });
}

async function queueSessionItemsAndStartProcessing(
  tabId: number,
  sessionId: string,
  itemIds: string[],
  options: { reconcileToken?: RequestReconcileToken | null } = {}
): Promise<{
  snapshot: ExtensionSnapshot;
  queuedItemIds: string[];
  failedItemIds: string[];
  processingStatus?: "started" | "already_running";
  processingError?: string;
}> {
  const queued = await queueSessionItems(tabId, sessionId, itemIds, {
    reconcileToken: options.reconcileToken
  });
  if (queued.queuedItemIds.length <= 0) {
    return queued;
  }

  try {
    const processing = await triggerWorkerDrain(normalizeBaseUrl(queued.snapshot.global.settings.ingestBaseUrl));
    const snapshot = await mutateSnapshot(tabId, (current) => ({
      global: current.global,
      tab: {
        ...current.tab,
        error: null
      }
    }), { reconcileToken: options.reconcileToken });
    return {
      ...queued,
      snapshot,
      processingStatus: processing.status
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const snapshot = await mutateSnapshot(tabId, (current) => ({
      global: current.global,
      tab: {
        ...current.tab,
        error: message
      }
    }), { reconcileToken: options.reconcileToken }).catch(() => undefined);
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
  itemId: string,
  options: { reconcileToken?: RequestReconcileToken | null } = {}
): Promise<{ snapshot: ExtensionSnapshot; job: JobSnapshot | null; capture: CaptureSnapshot | null }> {
  // Raw lock: refresh returns job/capture metadata alongside the saved snapshot.
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
    }, { reconcileToken: options.reconcileToken });
    if (session.mode === "product") {
      queueProductSignalAutoAnalysis(tabId, snapshot.global, sessionId);
    }

    return { snapshot, job, capture };
  });
}

async function refreshAllItems(
  tabId: number,
  sessionId: string,
  options: { reconcileToken?: RequestReconcileToken | null } = {}
): Promise<ExtensionSnapshot> {
  let snapshot = await loadSnapshot(tabId);
  const session = snapshot.global.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("Target folder not found.");
  }

  const refreshable = session.items.filter((item) => needsCaptureRefresh(item));
  let firstFailureMessage: string | null = null;

  // Keep refresh sequential so later saves cannot overwrite earlier item updates.
  for (const item of refreshable) {
    try {
      const result = await refreshItem(tabId, session.id, item.id, {
        reconcileToken: options.reconcileToken
      });
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

  // Raw lock: this path may return the latest snapshot without writing when the error is unchanged.
  return withSnapshotLock(async () => {
    const latest = await loadSnapshot(tabId);
    if (latest.tab.error === firstFailureMessage) {
      return latest;
    }
    return saveSnapshot(tabId, {
      global: latest.global,
      tab: {
        ...latest.tab,
        error: firstFailureMessage
      }
    }, { reconcileToken: options.reconcileToken });
  });
}

function resetBackgroundTestState(): void {
  globalStateCache = null;
  deepReadingRunner = undefined;
  inlineMutationVersions.clear();
  inlineRemovalUndos.clear();
  tabStateCache.clear();
  tabHoverCache.clear();
  backgroundRequestReconciler.reset();
  lastSaveSnapshotStorageMs = 0;
}

export const backgroundTestables = {
  ACTIVE_SESSION_ID_STORAGE_KEY,
  GLOBAL_STORAGE_KEY,
  buildProductSignalFailureDetails,
  getLastSaveSnapshotStorageMs: () => lastSaveSnapshotStorageMs,
  loadSnapshotCached,
  mutateSnapshot,
  persistGlobalStateOnly,
  readSenderTraceFlag,
  resetBackgroundTestState,
  tabStorageKey
};

// 觀眾反應 cards ask for their AI pass; one run per item at a time. A "running" record older than this is a dead worker's.
const runDeepReading = (item: SessionItem, settings: ExtensionSettings) => {
  deepReadingRunner ??= createDeepReadingRunner(chrome.storage.local);
  return deepReadingRunner(item, settings);
};
let deepReadingRunner: ReturnType<typeof createDeepReadingRunner> | undefined;
let topicReadingRunner: ReturnType<typeof createTopicReadingRunner> | undefined;
const inlineReadingsInFlight = new Set<string>();
const INLINE_READING_STALE_MS = 3 * 60_000;
const INLINE_READING_MIN_COMMENTS = 10;

async function ensureInlineReading(tabId: number, sessionId: string, itemId: string, retry: boolean): Promise<"started" | "exists" | "no-key" | "not-ready"> {
  const current = await loadSnapshot(tabId);
  const session = getSessionById(current.global, sessionId);
  const item = session?.items.find((entry) => entry.id === itemId);
  if (!session || session.mode !== "topic" || !item || item.status !== "succeeded" || readCrawlComments(item).length < INLINE_READING_MIN_COMMENTS) return "not-ready";
  // The quant clusters land a few seconds after the crawl; reading before them would leave the clusters unnamed.
  const analysisStatus = item.latestCapture?.analysis?.status;
  if (analysisStatus === "pending" || analysisStatus === "running") return "not-ready";
  const input = buildInlineReadingInput(item);
  if (!input) return "not-ready";
  const providerConfig = providerKeyForRequest(current.global);
  if (!providerConfig) return "no-key";
  const existing = (await loadInlineReadingRecords(chrome.storage.local))[item.id];
  const stale = existing?.status === "running" && Date.now() - Date.parse(existing.startedAt) > INLINE_READING_STALE_MS;
  if (inlineReadingsInFlight.has(item.id)) return "exists";
  const outdated = existing?.status === "complete" && existing.reading.promptVersion !== INLINE_READING_PROMPT_VERSION;
  if (existing && existing.captureId === input.captureId && !stale && !outdated && !(retry && existing.status === "failed")) return "exists";
  inlineReadingsInFlight.add(item.id);
  const storage = chrome.storage.local;
  await saveInlineReadingRecord(storage, { status: "running", itemId: item.id, captureId: input.captureId, startedAt: new Date().toISOString() });
  void generateInlineReading(providerConfig.provider, providerConfig.apiKey, input)
    .then(
      (reading) => saveInlineReadingRecord(storage, { status: "complete", itemId: item.id, captureId: input.captureId, reading }),
      (error) => saveInlineReadingRecord(storage, { status: "failed", itemId: item.id, captureId: input.captureId, error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() })
    )
    .catch((error) => console.error("[dlens] inline reading could not be saved:", error))
    .finally(() => inlineReadingsInFlight.delete(item.id));
  return "started";
}

// The post in view per Threads tab, for a side panel that opens after the user stopped scrolling.
const inViewPostByTab = new Map<number, string | null>();

// The card's 開啟工作區 names a workspace before the side panel has loaded; the panel takes it once.
let pendingSidePanelWorkspace: { sessionId: string; itemId?:string; lens?:string; at: number } | null = null;

function configureActionSidePanel(): void {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
}

function openSidePanelFromAction(tab: chrome.tabs.Tab): void {
  if (typeof tab.id === "number") {
    void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
      if (typeof tab.windowId === "number") {
        void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
      }
    });
    return;
  }
  if (typeof tab.windowId === "number") {
    void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
}

export default defineBackground(() => {
  configureActionSidePanel();
  chrome.runtime.onInstalled.addListener(configureActionSidePanel);
  chrome.action.onClicked.addListener(openSidePanelFromAction);

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
            void removeTabSnapshot(chrome.storage.local, tabStorageKey(tabId)).catch(() => undefined);
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
      // Raw lock: worker wake has no tab context, so it persists a global-only snapshot.
      await withSnapshotLock(async () => {
        const latest = await loadGlobalState();
        const merged = mergeItemRefreshResultsIntoGlobal(latest, refreshResults);
        globalStateCache = await persistGlobalStateOnly(merged, "[DLens] backgroundRefreshInFlightItems");
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
    void removeTabSnapshot(chrome.storage.local, tabStorageKey(tabId)).catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponseRaw) => {
    restorePipelineTraceMirrorFromSender(sender);
    // Content-script senders (sender.tab is set) must never receive raw API keys.
    // Wrap the responder once so every handler below stays unchanged.
    const sendResponse: typeof sendResponseRaw = sender.tab
      ? (response) => sendResponseRaw(sanitizeResponseForContentScript(response))
      : sendResponseRaw;
    void (async () => {
      try {
        switch (message.type) {
          case "sidepanel/open": {
            // Before any await: Chrome only opens the side panel inside the click's user gesture.
            if (sender.tab) openSidePanelFromAction(sender.tab);
            pendingSidePanelWorkspace = { sessionId: message.sessionId, itemId:message.itemId, lens:message.lens, at: Date.now() };
            sendResponse({ ok: true } satisfies ExtensionResponse);
            return;
          }
          case "sidepanel/take-workspace-open": {
            const pending = pendingSidePanelWorkspace;
            pendingSidePanelWorkspace = null;
            sendResponse({ ok: true, workspaceSessionId: pending && Date.now() - pending.at < 15_000 ? pending.sessionId : null, ...(pending && Date.now()-pending.at < 15_000 ? {readerItemId:pending.itemId,readerLens:pending.lens} : {}) } satisfies ExtensionResponse);
            return;
          }
          case "settings/test-ai-key": {
            const tabId = await resolveTabId(sender);
            const settings = normalizeGlobalState((await loadSnapshot(tabId)).global).settings;
            const config = providerKeyFromSettings(settings);
            const aiKeyTest = config ? await testProviderKey(config.provider, config.apiKey) : { ok: false, message: aiKeyGap(settings) ?? "未設定 AI key" };
            sendResponse({ ok: true, tabId, aiKeyTest } satisfies ExtensionResponse);
            return;
          }
          case "inline/in-view": {
            if (typeof sender.tab?.id === "number") inViewPostByTab.set(sender.tab.id, message.postKey);
            sendResponse({ ok: true } satisfies ExtensionResponse);
            return;
          }
          case "inline/in-view-get": {
            const tabId = await resolveTabId(sender, message.tabId);
            sendResponse({ ok: true, tabId, inViewPostKey: inViewPostByTab.get(tabId) ?? null } satisfies ExtensionResponse);
            return;
          }
          case "topic-reading/run": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const topic = await loadTopicById(chrome.storage.local, message.topicId);
            if (!topic) throw new Error("找不到話題");
            const signals = await loadSignals(chrome.storage.local, topic.sessionId);
            const items = selectTopicReadingItems(topic, current.global.sessions, signals);
            const [inline, deep] = await Promise.all([loadInlineReadingRecords(chrome.storage.local), loadDeepReadingRecords(chrome.storage.local)]);
            topicReadingRunner ??= createTopicReadingRunner(chrome.storage.local);
            const topicReading = await topicReadingRunner(topic, items, current.global.settings, inline, deep);
            sendResponse({ ok: true, topicReading } satisfies ExtensionResponse);
            return;
          }
          case "deep-reading/run": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const item = current.global.sessions.flatMap(s => (s.mode === "topic" || s.mode === "product") ? s.items : []).find(i => i.id === message.itemId);
            if (!item) throw new Error("找不到已儲存帖子");
            const deepReading = await runDeepReading(item, current.global.settings);
            sendResponse({ ok: true, deepReading } satisfies ExtensionResponse);
            return;
          }
          case "inline-reading/ensure": {
            const tabId = await resolveTabId(sender);
            const inlineReadingStatus = await ensureInlineReading(tabId, message.sessionId, message.itemId, message.retry === true);
            sendResponse({ ok: true, tabId, inlineReadingStatus } satisfies ExtensionResponse);
            return;
          }
          case "pipeline-trace/enable-background": {
            const tabId = await resolveTabId(sender);
            setPipelineTraceMirrorTab(tabId);
            sendResponse({ ok: true, tabId } satisfies ExtensionResponse);
            return;
          }
          case "state/get-active-tab": {
            const tabId = await resolveTabId(sender);
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
          case "storage/get-usage": {
            const tabId = await resolveTabId(sender);
            const storageArea = chrome.storage.local as chrome.storage.StorageArea & { QUOTA_BYTES?: number };
            const [bytesInUse, unlimitedStorage] = await Promise.all([
              chrome.storage.local.getBytesInUse(),
              chrome.permissions.contains({ permissions: ["unlimitedStorage"] })
            ]);
            sendResponse({
              ok: true,
              tabId,
              bytesInUse,
              quotaBytes: storageArea.QUOTA_BYTES ?? DEFAULT_STORAGE_QUOTA_BYTES,
              unlimitedStorage
            } satisfies ExtensionResponse);
            return;
          }
          case "backend/get-health": {
            const baseUrl = normalizeBaseUrl(message.baseUrl);
            const checkedAt = new Date().toISOString();
            try {
              const health = await fetchBackendHealth(baseUrl);
              sendResponse({
                ok: true,
                backendHealth: {
                  reachable: true,
                  baseUrl,
                  checkedAt,
                  uptimeSeconds: health.uptime_seconds,
                  processId: health.process_id
                }
              } satisfies ExtensionResponse);
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              sendResponse({
                ok: true,
                backendHealth: { reachable: false, baseUrl, checkedAt, error: detail.replace(/\s+/g, " ").trim().slice(0, 200) }
              } satisfies ExtensionResponse);
            }
            return;
          }
          case "settings/set-ingest-base-url": {
            const tabId = await resolveTabId(sender);
            const snapshot = await mutateSnapshot(tabId, (current) => ({
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
            }));
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }
          case "settings/set-product-profile": {
            const tabId = await resolveTabId(sender);
            const snapshot = await mutateSnapshot(tabId, (current) => {
              const nextGlobal = {
                ...current.global,
                settings: {
                  ...current.global.settings,
                  productProfile: message.productProfile
                }
              };
              return {
                global: nextGlobal,
                tab: {
                  ...current.tab,
                  error: null
                }
              };
            });
            const compileResult = await compileProductContextIfReady(snapshot.global);
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
            const snapshot = await mutateSnapshot(tabId, (current) => {
              const settings = mergeOneLinerSettings(current.global.settings, {
                provider: message.provider,
                openaiApiKey: message.openaiApiKey,
                claudeApiKey: message.claudeApiKey,
                googleApiKey: message.googleApiKey,
                deepReadingModels: message.deepReadingModels
              });
              return {
                global: {
                  ...current.global,
                  settings
                },
                tab: {
                  ...current.tab,
                  error: null
                }
              };
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }
          case "settings/set-layout-preferences": {
            const tabId = await resolveTabId(sender);
            const snapshot = await mutateSnapshot(tabId, (current) => {
              const settings = mergeLayoutPreferences(current.global.settings, message.layoutPreferences);
              return {
                global: {
                  ...current.global,
                  settings
                },
                tab: {
                  ...current.tab,
                  error: null
                }
              };
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
            return;
          }

          case "popup/navigate-active-tab": {
            const tabId = await resolveTabId(sender);
            sendResponse({
              ok: true,
              tabId,
              snapshot: await mutateSnapshot(tabId, (current) => ({
                global: current.global,
                tab: {
                  ...current.tab,
                  popupPage: message.page,
                  currentMainPage: message.page === "settings" || message.page === "audit-report"
                    ? current.tab.currentMainPage
                    : message.page,
                  popupOpen: true,
                  error: null
                }
              }))
            } satisfies ExtensionResponse);
            return;
          }

          case "session/inline-collect": {
            const tabId = await resolveTabId(sender);
            const result = message.action === "snapshot"
              ? await collectInline(tabId, message)
              : await traceBackgroundPipeline({
                phase: "signal.saved",
                step: "background.session.inline-collect",
                target: message.action === "remove" ? { tabId, sessionId: message.sessionId, itemId: message.itemId } : { tabId },
                requestId: message.requestId,
                detail: { action: message.action, mode: message.action === "save" ? message.mode ?? null : null },
                responseDetail: (collected) => ({ action: message.action, mode: collected.inlineCollect.lastMode, changed: collected.inlineCollect.changed }),
                run: () => collectInline(tabId, message)
              });
            sendResponse({ ok: true, tabId, ...result } satisfies ExtensionResponse);
            return;
          }
          case "session/move-to-product": {
            const tabId = await resolveTabId(sender);
            const snapshot = await mutateSnapshot(tabId, async current => {
              if (IS_PR_ONLY_BUILD) throw new Error("此版本未提供個人應用。");
              const source = current.global.sessions.find(s => s.id === message.sessionId);
              const item = source?.items.find(i => i.id === message.itemId);
              if (!source || source.mode !== "topic" || !item) throw new Error("Saved audience post not found.");
              const destination = current.global.sessions.find(s => s.mode === "product")
                ?? createSessionRecord(INLINE_COLLECT_MODE_NAMES.product, new Date().toISOString(), "product");
              if (destination.items.some(i => i.id === item.id || getPostIdentity(i.descriptor.post_url) === getPostIdentity(item.descriptor.post_url))) throw new Error("呢篇已喺個人應用，未有搬移。");
              // Reuse signal cleanup seams; preserve the saved item and its crawl identity.
              for (const signal of await loadSignals(chrome.storage.local, source.id)) {
                if (signal.itemId === item.id) await deleteSignalStorageRecords(chrome.storage.local, signal.id);
              }
              await clearFolderSynthesis(chrome.storage.local, destination.id);
              const now = new Date().toISOString();
              const remaining = source.items.filter(i => i.id !== item.id);
              const moved = { ...destination, items: [...destination.items, item], updatedAt: now };
              const base = removeSessionItem(current.global, source.id, item.id).sessions;
              // An existing 個人應用 keeps its place in the workspace list.
              const sessions = base.some(s => s.id === destination.id) ? base.map(s => (s.id === destination.id ? moved : s)) : [...base, moved];
              const movingSelected = current.global.activeSessionId === source.id && current.tab.activeItemId === item.id;
              const nextActiveItemId = movingSelected ? ensureActiveItemId({ ...source, items: remaining }, null) : current.tab.activeItemId;
              invalidateInlineCollectUndo(item.descriptor);
              return { global: { ...current.global, sessions, updatedAt: now }, tab: {
                ...current.tab,
                activeItemId: nextActiveItemId,
                currentPreview: movingSelected ? remaining.find(i => i.id === nextActiveItemId)?.descriptor ?? current.tab.hoveredTarget : current.tab.currentPreview,
                lastSavedToast: null
              } };
            });
            sendResponse({ ok: true, tabId, snapshot } satisfies ExtensionResponse);
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
          case "session/undo-save": {
            const tabId = await resolveTabId(sender);
            const undone = await undoSavedItem(tabId, message.sessionId, message.itemId);
            sendResponse({
              ok: true,
              tabId,
              snapshot: undone.snapshot,
              signals: undone.signals,
              topics: undone.topics
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
            const requestedSession = getSessionById(current.global, message.sessionId);
            const global = requestedSession?.mode === message.mode
              ? setActiveSession(current.global, requestedSession.id)
              : activateSessionForMode(current.global, message.mode);
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
              nextSessionsLen: global.sessions.length,
              activeSessionIdBefore: current.global.activeSessionId,
              activeSessionIdAfter: global.activeSessionId
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

          case "signal/list":
          case "signal/triage": {
            const tabId = await resolveTabId(sender);
            if (message.type === "signal/list") {
              const current = await loadSnapshotCached(tabId);
              const session = current.global.sessions.find((entry) => entry.id === message.sessionId) ?? null;
              if (session?.mode === "product" && session.items.length > 0) {
                await ensureSignalsForSessionItems(chrome.storage.local, session);
              }
            }
            if (message.type === "topic/set-collection-target") {
              sendResponse({
                ok: true,
                tabId,
                snapshot: await mutateSnapshot(tabId, (current) => ({
                  global: current.global,
                  tab: {
                    ...current.tab,
                    collectionTopicId: message.topicId,
                    error: null
                  }
                }))
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
            const resultRef: {
              value: Awaited<ReturnType<typeof deleteSignalStorageRecords>> | null;
            } = { value: null };
            const snapshot = await mutateSnapshot(tabId, async (current) => {
              const deletion = await deleteSignalStorageRecords(chrome.storage.local, message.signalId);
              const deletedItem = current.global.sessions.flatMap(session => session.items).find(item => item.id === deletion.deleted.itemId);
              if (deletedItem) invalidateInlineCollectUndo(deletedItem.descriptor);
              resultRef.value = deletion;
              await deleteProductSignalAnalysis(chrome.storage.local, message.signalId);
              const applied = applySignalDeletionToGlobalState(current.global, deletion);
              if (applied.removedItemId) {
                await deleteSignalTagsByItemId(chrome.storage.local, applied.removedItemId);
              }
              const deletedActiveItem = applied.removedItemId !== null && current.tab.activeItemId === applied.removedItemId;
              const deletedSession = applied.globalState.sessions.find((session) => session.id === deletion.deleted.sessionId) ?? null;
              const nextActiveItemId = deletedActiveItem && deletedSession
                ? ensureActiveItemId(deletedSession, null)
                : deletedActiveItem
                  ? null
                  : current.tab.activeItemId;
              const nextActiveItem = deletedSession?.items.find((item) => item.id === nextActiveItemId) ?? null;
              return {
                global: applied.globalState,
                tab: {
                  ...current.tab,
                  activeItemId: nextActiveItemId,
                  currentPreview: deletedActiveItem ? nextActiveItem?.descriptor ?? current.tab.hoveredTarget : current.tab.currentPreview,
                  error: null
                }
              };
            });
            const deletion = resultRef.value;
            if (!deletion) {
              throw new Error("Signal deletion did not complete.");
            }
            const productSignalAnalyses = await listProductSignalAnalyses(
              chrome.storage.local,
              deletion.signals.map((signal) => signal.id)
            );
            sendResponse({
              ok: true,
              tabId,
              snapshot,
              signals: deletion.signals,
              topics: deletion.topics,
              productSignalAnalyses
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
            const prCampaigns = await savePrCampaignDraft(chrome.storage.local, {
              ...message.draft,
              sessionId: message.sessionId
            }, createPrCampaignStamp());
            sendResponse({
              ok: true,
              tabId,
              prCampaigns: prCampaigns.filter((campaign) => campaign.sessionId === message.sessionId)
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
            const suggestion = await generatePrSetupForGlobal(current.global, message.campaignName, message.briefText);
            sendResponse({
              ok: true,
              tabId,
              prCriteria: suggestion.criteria,
              prNarrativeSettings: suggestion.narrativeSettings
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/match-criteria": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const requestId = message.requestId ?? createPipelineRequestId("background.pr.match-criteria");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "pr.matchCriteria",
              requestId,
              { campaignId: message.campaignId, tabId }
            );
            const prEvidenceRows = await matchPrCriteriaForCampaign(current.global, message.campaignId, { reconcileToken });
            broadcastDirectStorageUpdate(tabId, current, { reconcileToken });
            sendResponse({
              ok: true,
              tabId,
              prEvidenceRows
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/fetch-advanced-metrics": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const requestId = message.requestId ?? createPipelineRequestId("background.pr.fetch-advanced-metrics");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "pr.fetchAdvancedMetrics",
              requestId,
              { campaignId: message.campaignId, tabId }
            );
            const result = await fetchAdvancedMetricsForPrCampaign(current.global, message.campaignId, { reconcileToken });
            broadcastDirectStorageUpdate(tabId, current, { reconcileToken });
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
          case "pr/get-narrative-read": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const context = await findPrCampaignContext(chrome.storage.local, current.global, message.campaignId);
            const narrative = await getPrNarrativeReadState({
              storageArea: chrome.storage.local,
              ...context
            });
            sendResponse({
              ok: true,
              tabId,
              prNarrativeRead: narrative.read,
              prNarrativeCurrentSourceHash: narrative.currentSourceHash,
              prNarrativeSettings: narrative.settings
            } satisfies ExtensionResponse);
            return;
          }
          case "pr/generate-narrative-read": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const requestId = message.requestId ?? createPipelineRequestId("background.pr.generate-narrative-read");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              `pr.generateNarrative:${tabId}:${message.campaignId}`,
              requestId,
              { campaignId: message.campaignId, tabId }
            );
            const providerConfig = providerKeyForRequest(current.global);
            if (!providerConfig) {
              throw new Error("A configured AI provider and API key are required for PR narrative reading.");
            }
            const storageArea = withDirectStorageReconcile(chrome.storage.local, { reconcileToken });
            const context = await findPrCampaignContext(storageArea, current.global, message.campaignId);
            let prNarrativeRead: Awaited<ReturnType<typeof runPrNarrativeRead>>;
            try {
              prNarrativeRead = await runPrNarrativeRead({
                storageArea,
                ...context,
                provider: providerConfig.provider,
                apiKey: providerConfig.apiKey,
                model: prNarrativeModel(providerConfig.provider),
                generatePostReadings: generatePrNarrativePostReadings,
                generateSynthesis: generatePrNarrativeSynthesis,
                verifyCurrentSourceHash: async (sourceHash) => {
                  const latestGlobal = await loadGlobalState();
                  const latestContext = await findPrCampaignContext(
                    chrome.storage.local,
                    latestGlobal,
                    message.campaignId
                  );
                  const latestNarrative = await getPrNarrativeReadState({
                    storageArea: chrome.storage.local,
                    ...latestContext
                  });
                  return latestNarrative.currentSourceHash === sourceHash;
                },
                now: new Date().toISOString(),
                requestId
              });
            } catch (error) {
              if (error instanceof PrNarrativeSourceChangedError) {
                sendResponse({ ok: false, error: error.message } satisfies ExtensionResponse);
                return;
              }
              throw error;
            }
            broadcastDirectStorageUpdate(tabId, current, { reconcileToken });
            sendResponse({
              ok: true,
              tabId,
              prNarrativeRead,
              prNarrativeCurrentSourceHash: prNarrativeRead.sourceHash,
              prNarrativeSettings: context.campaign.narrativeSettings ?? { ...EMPTY_PR_NARRATIVE_SETTINGS }
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
            const requestId = message.requestId ?? createPipelineRequestId("background.product.analyze-signals");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "product.analyzeSignals",
              requestId,
              { sessionId: message.sessionId, tabId }
            );
            const queued = await queueSavedProductSignalItemsForAnalysis(tabId, message.sessionId, { reconcileToken });
            const current = queued.snapshot;
            const session = current.global.sessions.find((entry) => entry.id === message.sessionId) || null;
            const signals = await loadSignals(chrome.storage.local, message.sessionId);
            const hasDrainableWork = session ? hasDrainableProductSignalItems(session, signals) : false;
            if (shouldDrainWorkerAfterProductSignalQueue(queued.queued, hasDrainableWork)) {
              await triggerWorkerDrain(normalizeBaseUrl(current.global.settings.ingestBaseUrl));
            }
            const productSignalAnalyses = await analyzeProductSignalsForSession(current.global, message.sessionId, { reconcileToken });
            broadcastDirectStorageUpdate(tabId, current, { reconcileToken });
            const failureDetails = buildProductSignalFailureDetails({
              session,
              signals,
              analyses: productSignalAnalyses
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot: current,
              productSignalAnalyses,
              productSignalAnalysisSummary: {
                queued: queued.queued,
                analyzed: productSignalAnalyses.filter((analysis) => analysis.status === "complete").length,
                failed: failureDetails.length,
                failures: failureDetails
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
          case "product/clear-cache": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            await clearProductDerivedCache(chrome.storage.local);
            broadcastSnapshotUpdate(tabId, current);
            sendResponse({ ok: true, tabId } satisfies ExtensionResponse);
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
            const requestId = message.requestId ?? createPipelineRequestId("background.product.review-signal-reading");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              `product.reviewSignalReading:${message.cacheKey}`,
              requestId,
              { cacheKey: message.cacheKey, tabId }
            );
            const updated = await withSnapshotLock(async () => {
              const storageArea = withDirectStorageReconcile(chrome.storage.local, { reconcileToken });
              const reading = await getSignalReading(storageArea, message.cacheKey);
              if (!reading) {
                return null;
              }
              const signalStillExists = (await loadAllSignals(chrome.storage.local))
                .some((signal) => signal.id === reading.signalId);
              if (!signalStillExists) {
                return null;
              }
              return appendSignalReadingReview(
                storageArea,
                message.cacheKey,
                message.decision,
                message.note
              );
            });
            if (!updated) {
              sendResponse({ ok: false, error: "找不到該判讀記錄。" } satisfies ExtensionResponse);
              return;
            }
            sendResponse({ ok: true, tabId, signalReading: updated } satisfies ExtensionResponse);
            return;
          }
          case "session/save-current-preview": {
            const tabId = await resolveTabId(sender);
            const target = requireSaveCurrentPreviewTarget(message.target);
            const snapshot = await traceBackgroundPipeline({
              phase: "signal.saved",
              step: "background.session.save-current-preview",
              target: { sessionId: target.sessionId, tabId },
              requestId: message.requestId,
              detail: {
                hasDescriptor: Boolean(message.descriptor),
                topicId: target.topicId ?? null
              },
              responseDetail: (nextSnapshot) => ({
                itemId: nextSnapshot.tab.activeItemId ?? null
              }),
              run: () => saveCurrentPreviewToSession(tabId, target, message.descriptor)
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot
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
            const requestId = message.requestId ?? createPipelineRequestId("background.session.queue-item");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.queue-item",
              requestId,
              { sessionId: message.sessionId, itemId: message.itemId, tabId }
            );
            const queued = await traceBackgroundPipeline({
              phase: "crawl.queued",
              step: "background.session.queue-item",
              target: { sessionId: message.sessionId, itemId: message.itemId, tabId },
              requestId,
              detail: { source: "session/queue-item" },
              responseDetail: (result) => ({
                jobId: result.submit.job_id,
                captureId: result.submit.capture_id
              }),
              run: () => queueSessionItem(tabId, message.sessionId, message.itemId, { reconcileToken })
            });
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
            const target = requireSessionItemActionTarget(message.target);
            const requestId = message.requestId ?? createPipelineRequestId("background.session.queue-item");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.queue-item",
              requestId,
              { sessionId: target.sessionId, itemId: target.itemId, tabId }
            );
            const queued = await traceBackgroundPipeline({
              phase: "crawl.queued",
              step: "background.session.queue-item",
              target: { sessionId: target.sessionId, itemId: target.itemId, tabId },
              requestId,
              detail: { source: "session/queue-selected" },
              responseDetail: (result) => ({
                jobId: result.submit.job_id,
                captureId: result.submit.capture_id
              }),
              run: () => queueSessionItem(tabId, target.sessionId, target.itemId, { reconcileToken })
            });
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
            const target = requireSessionActionTarget(message.target);
            const requestId = message.requestId ?? createPipelineRequestId("background.session.queue-all-pending");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.queue-all-pending",
              requestId,
              { sessionId: target.sessionId, tabId }
            );
            const snapshot = await traceBackgroundPipeline({
              phase: "crawl.queued",
              step: "background.session.queue-all-pending",
              target: { sessionId: target.sessionId, tabId },
              requestId,
              run: () => queueAllPending(tabId, target.sessionId, { reconcileToken })
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot
            } satisfies ExtensionResponse);
            return;
          }
          case "session/queue-items": {
            const tabId = await resolveTabId(sender);
            const requestId = message.requestId ?? createPipelineRequestId("background.session.queue-items");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.queue-items",
              requestId,
              { sessionId: message.sessionId, tabId }
            );
            const result = await traceBackgroundPipeline({
              phase: "crawl.queued",
              step: "background.session.queue-items",
              target: { sessionId: message.sessionId, tabId },
              requestId,
              detail: { itemCount: message.itemIds.length },
              responseDetail: (queued) => ({
                queuedCount: queued.queuedItemIds.length,
                failedCount: queued.failedItemIds.length
              }),
              run: () => queueSessionItems(tabId, message.sessionId, message.itemIds, { reconcileToken })
            });
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
              const requestId = message.requestId ?? createPipelineRequestId("background.session.queue-items-and-start-processing");
              const reconcileToken = beginBackgroundSnapshotReconcile(
                "background.session.queue-items-and-start-processing",
                requestId,
                { sessionId: message.sessionId, tabId }
              );
              const result = await traceBackgroundPipeline({
                phase: "crawl.queued",
                step: "background.session.queue-items-and-start-processing",
                target: { sessionId: message.sessionId, tabId },
                requestId,
                detail: { itemCount: message.itemIds.length },
                responseDetail: (queued) => ({
                  queuedCount: queued.queuedItemIds.length,
                  failedCount: queued.failedItemIds.length,
                  processingStatus: queued.processingStatus ?? null,
                  processingError: queued.processingError ?? null
                }),
                run: () => queueSessionItemsAndStartProcessing(tabId, message.sessionId, message.itemIds, { reconcileToken })
              });
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
            const requestId = message.requestId ?? createPipelineRequestId("background.session.refresh-item");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.refresh-item",
              requestId,
              { sessionId: message.sessionId, itemId: message.itemId, tabId }
            );
            const refreshed = await traceBackgroundPipeline({
              phase: "capture.ready",
              step: "background.session.refresh-item",
              target: { sessionId: message.sessionId, itemId: message.itemId, tabId },
              requestId,
              responseDetail: (result) => ({
                jobStatus: result.job?.status ?? null,
                hasCapture: Boolean(result.capture)
              }),
              run: () => refreshItem(tabId, message.sessionId, message.itemId, { reconcileToken })
            });
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
            const target = requireSessionItemActionTarget(message.target);
            const requestId = message.requestId ?? createPipelineRequestId("background.session.refresh-item");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.refresh-item",
              requestId,
              { sessionId: target.sessionId, itemId: target.itemId, tabId }
            );
            const refreshed = await traceBackgroundPipeline({
              phase: "capture.ready",
              step: "background.session.refresh-item",
              target: { sessionId: target.sessionId, itemId: target.itemId, tabId },
              requestId,
              detail: { source: "session/refresh-selected" },
              responseDetail: (result) => ({
                jobStatus: result.job?.status ?? null,
                hasCapture: Boolean(result.capture)
              }),
              run: () => refreshItem(tabId, target.sessionId, target.itemId, { reconcileToken })
            });
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
            const target = requireSessionActionTarget(message.target);
            const requestId = message.requestId ?? createPipelineRequestId("background.session.refresh-all");
            const reconcileToken = beginBackgroundSnapshotReconcile(
              "background.session.refresh-all",
              requestId,
              { sessionId: target.sessionId, tabId }
            );
            const snapshot = await traceBackgroundPipeline({
              phase: "capture.ready",
              step: "background.session.refresh-all",
              target: { sessionId: target.sessionId, tabId },
              requestId,
              run: () => refreshAllItems(tabId, target.sessionId, { reconcileToken })
            });
            sendResponse({
              ok: true,
              tabId,
              snapshot
            } satisfies ExtensionResponse);
            return;
          }
          case "worker/start-processing": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            try {
              const processing = await traceBackgroundPipeline({
                phase: "crawl.queued",
                step: "background.worker.start-processing",
                target: { tabId },
                requestId: message.requestId,
                responseDetail: (result) => ({ processingStatus: result.status }),
                run: () => triggerWorkerDrain(normalizeBaseUrl(current.global.settings.ingestBaseUrl))
              });
              const snapshot = await mutateSnapshot(tabId, (latest) => ({
                global: latest.global,
                tab: {
                  ...latest.tab,
                  error: null
                }
              }));
              sendResponse({
                ok: true,
                tabId,
                snapshot,
                processingStatus: processing.status
              } satisfies StartProcessingResponse);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              await mutateSnapshot(tabId, (latest) => ({
                global: latest.global,
                tab: {
                  ...latest.tab,
                  error: message
                }
              })).catch(() => undefined);
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
              const worker = await traceBackgroundPipeline({
                phase: "crawl.queued",
                step: "background.worker.get-status",
                target: { tabId },
                requestId: message.requestId,
                responseDetail: (result) => ({ workerStatus: result.status }),
                run: () => fetchWorkerStatus(normalizeBaseUrl(current.global.settings.ingestBaseUrl))
              });
              const backendWorkUiState = projectBackendWorkStatus(worker);
              sendResponse({
                ok: true,
                tabId,
                snapshot: current,
                workerStatus: worker.status,
                backendWorkUiState
              } satisfies WorkerStatusMessageResponse);
            } catch (error) {
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              } satisfies WorkerStatusMessageResponse);
            }
            return;
          }

          default: {
            sendResponse({ ok: false, error: "Unsupported message" } satisfies ExtensionResponse);
          }
        }
      } catch (error) {
        const tabId = await resolveTabId(sender).catch(() => undefined);
        if (tabId) {
          const snapshot = await mutateSnapshot(tabId, (current) => ({
            global: current.global,
            tab: {
              ...current.tab,
              error: error instanceof Error ? error.message : String(error)
            }
          })).catch(() => null);
          if (snapshot) {
            sendResponse({ ok: false, error: snapshot.tab.error || "Unknown error" } satisfies ExtensionResponse);
            return;
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
