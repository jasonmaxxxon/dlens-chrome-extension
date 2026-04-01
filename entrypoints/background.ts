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
import { buildCompareOneLinerCacheKey, type CompareOneLinerRequest } from "../src/compare/one-liner";
import {
  buildCompareClusterSummaryCacheKey,
  type ClusterInterpretation,
  type CompareClusterSummaryRequest
} from "../src/compare/cluster-interpretation";
import {
  COMPARE_CLUSTER_SUMMARY_PROMPT_VERSION,
  COMPARE_ONE_LINER_PROMPT_VERSION,
  generateCompareClusterSummaries,
  generateCompareOneLiner
} from "../src/compare/provider";
import {
  createDefaultSettings,
  createEmptyGlobalState,
  createEmptyTabState,
  type ExtensionGlobalState,
  type ExtensionSnapshot,
  type SessionItem,
  type SessionRecord,
  type TabUiState
} from "../src/state/types";
import {
  createSessionRecord,
  deleteSession,
  getActiveSession,
  markSessionItemQueued,
  needsCaptureRefresh,
  reconcileSessionItem,
  renameSession,
  saveDescriptorToSession,
  setActiveSession,
  updateSessionItem
} from "../src/state/store-helpers";
import { createAsyncLock } from "../src/state/snapshot-lock";
import { applyHoveredPreview, createInlineToast, setCollectModeState } from "../src/state/ui-state";

const GLOBAL_STORAGE_KEY = "dlens:v0:global-state";
const TAB_STORAGE_KEY_PREFIX = "dlens:v0:tab-ui:";
const COMPARE_ONE_LINER_CACHE_KEY = "dlens:v1:compare-one-liner-cache";
const COMPARE_CLUSTER_SUMMARY_CACHE_KEY = "dlens:v1:compare-cluster-summary-cache";

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

interface ClusterSummaryCacheValue {
  items: ClusterInterpretation[];
  generatedAt: string;
}

type OneLinerCache = Record<string, OneLinerCacheValue>;
type ClusterSummaryCache = Record<string, ClusterSummaryCacheValue>;

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
  return normalizeGlobalState(raw[GLOBAL_STORAGE_KEY] || createEmptyGlobalState());
}

async function loadTabState(tabId: number): Promise<TabUiState> {
  const raw = await chrome.storage.local.get(tabStorageKey(tabId));
  return raw[tabStorageKey(tabId)] || createEmptyTabState();
}

async function loadSnapshot(tabId: number): Promise<ExtensionSnapshot> {
  const [global, tab] = await Promise.all([loadGlobalState(), loadTabState(tabId)]);
  return { global, tab };
}

function normalizeGlobalState(state: ExtensionGlobalState): ExtensionGlobalState {
  return {
    ...state,
    settings: {
      ...createDefaultSettings(),
      ...(state?.settings || {})
    }
  };
}

async function loadOneLinerCache(): Promise<OneLinerCache> {
  const raw = await chrome.storage.local.get(COMPARE_ONE_LINER_CACHE_KEY);
  return (raw[COMPARE_ONE_LINER_CACHE_KEY] || {}) as OneLinerCache;
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

async function getOrGenerateOneLiner(global: ExtensionGlobalState, request: CompareOneLinerRequest): Promise<string | null> {
  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig) {
    return null;
  }
  const cacheKey = buildCompareOneLinerCacheKey(request, providerConfig.provider, COMPARE_ONE_LINER_PROMPT_VERSION);
  const cache = await loadOneLinerCache();
  if (cache[cacheKey]?.text) {
    return cache[cacheKey].text;
  }
  const text = (await generateCompareOneLiner(providerConfig.provider, providerConfig.apiKey, request)).trim();
  if (!text) {
    return null;
  }
  cache[cacheKey] = {
    text,
    generatedAt: new Date().toISOString()
  };
  await saveOneLinerCache(cache);
  return text;
}

async function getOrGenerateClusterSummaries(
  global: ExtensionGlobalState,
  request: CompareClusterSummaryRequest
): Promise<ClusterInterpretation[]> {
  const providerConfig = providerKeyForRequest(global);
  if (!providerConfig || !request.clusters.length) {
    return [];
  }

  const cacheKey = buildCompareClusterSummaryCacheKey(
    request,
    providerConfig.provider,
    COMPARE_CLUSTER_SUMMARY_PROMPT_VERSION
  );
  const cache = await loadClusterSummaryCache();
  if (cache[cacheKey]?.items?.length) {
    return cache[cacheKey].items;
  }

  const items = await generateCompareClusterSummaries(providerConfig.provider, providerConfig.apiKey, request);
  if (!items.length) {
    return [];
  }
  cache[cacheKey] = {
    items,
    generatedAt: new Date().toISOString()
  };
  await saveClusterSummaryCache(cache);
  return items;
}

async function saveSnapshot(tabId: number, snapshot: ExtensionSnapshot): Promise<ExtensionSnapshot> {
  const nextSnapshot = {
    global: withTimestamp(snapshot.global),
    tab: withTimestamp(snapshot.tab)
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
        popupPage: "collect",
        error: null
      }
    });
  }

  const saved = saveDescriptorToSession(current.global, session.id, current.tab.currentPreview);
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

async function createSession(tabId: number, name: string, saveCurrentPreview = false): Promise<ExtensionSnapshot> {
  const current = await loadSnapshot(tabId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Folder name is required.");
  }

  let globalState = current.global;
  const session = createSessionRecord(trimmed);
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
  let lastSavedToast = current.tab.lastSavedToast;
  if (saveCurrentPreview) {
    if (!current.tab.currentPreview) {
      throw new Error("No current post preview to save.");
    }
    const saved = saveDescriptorToSession(globalState, session.id, current.tab.currentPreview);
    globalState = saved.globalState;
    activeItemId = saved.item.id;
    popupPage = "collect";
    lastSavedToast = createInlineToast("saved", session.name);
  }

  return saveSnapshot(tabId, {
    global: globalState,
    tab: {
      ...current.tab,
      activeItemId,
      popupPage,
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
      popupPage: nextSession ? "library" : "collect",
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
      popupPage: "library",
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
    const submit = await submitCaptureTarget(baseUrl, item.descriptor);
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
        popupPage: "library",
        lastSavedToast: createInlineToast("queued", session.name),
        error: null
      }
    });

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
    const [job, capture] = await Promise.all([
      fetchJob(baseUrl, item.jobId),
      fetchCapture(baseUrl, item.captureId)
    ]);

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

  // Keep refresh sequential so later saves cannot overwrite earlier item updates.
  for (const item of refreshable) {
    try {
      const result = await refreshItem(tabId, session.id, item.id);
      snapshot = result.snapshot;
    } catch (error) {
      console.error("failed to refresh session item", error);
    }
  }

  return snapshot;
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
    let updated = false;
    let nextGlobal = global;

    for (const session of nextGlobal.sessions) {
      const inFlight = session.items.filter((item) => needsCaptureRefresh(item));
      if (!inFlight.length) continue;

      const results = await Promise.allSettled(
        inFlight.map(async (item) => {
          const [job, capture] = await Promise.all([
            fetchJob(baseUrl, item.jobId!),
            fetchCapture(baseUrl, item.captureId!)
          ]);
          return { itemId: item.id, sessionId: session.id, job, capture };
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { itemId, sessionId, job, capture } = result.value;
        nextGlobal = updateSessionItem(nextGlobal, sessionId, itemId, (existing) =>
          reconcileSessionItem(existing, job, capture)
        );
        updated = true;
      }
    }

    if (updated) {
      globalStateCache = withTimestamp(nextGlobal);
      await chrome.storage.local.set({ [GLOBAL_STORAGE_KEY]: globalStateCache });
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
          case "settings/set-one-liner-config": {
            const tabId = await resolveTabId(sender);
            const current = await loadSnapshot(tabId);
            const snapshot = await saveSnapshot(tabId, {
              global: {
                ...current.global,
                settings: {
                  ...current.global.settings,
                  oneLinerProvider: message.provider,
                  openaiApiKey: message.openaiApiKey.trim(),
                  claudeApiKey: message.claudeApiKey.trim(),
                  googleApiKey: message.googleApiKey.trim()
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
            sendResponse({
              ok: true,
              tabId,
              snapshot: await patchSnapshot(tabId, {
                tab: {
                  popupPage: message.page,
                  popupOpen: true,
                  error: null
                }
              })
            } satisfies ExtensionResponse);
            return;
          }
          case "selection/start-active-tab": {
            const tabId = await getActiveTabId();
            await chrome.tabs.sendMessage(tabId, { type: "selection/start-tab", tabId } satisfies ExtensionMessage);
            const current = await loadSnapshot(tabId);
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
                  popupPage: "collect",
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
              snapshot: await createSession(tabId, message.name, message.saveCurrentPreview)
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
              sendResponse({
                ok: true,
                tabId,
                snapshot: current,
                processingStatus: processing.status
              } satisfies StartProcessingResponse);
            } catch (error) {
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
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
