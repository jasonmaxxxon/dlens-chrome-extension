import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import { buildSaveCurrentPreviewTarget } from "../state/action-target";
import { createPipelineRequestId, emitPipelineEvent, type PipelineEventInput } from "../state/pipeline-trace";
import {
  buildReconcileIgnoredEvent,
  createRequestReconciler,
  type RequestReconcileDecision,
  type RequestReconcileTarget,
  type RequestReconcileToken
} from "../state/request-reconcile";
import { DEFAULT_SESSION_NAME_BY_MODE, normalizePostUrl } from "../state/store-helpers";
import {
  createDefaultLayoutPreferences,
  createDefaultSettings,
  type ExtensionSnapshot,
  type FolderMode,
  type FolderSynthesis,
  type LayoutPreferences,
  type ProductContext,
  type ProductProfileContextFile,
  type ProductAgentTaskFeedback,
  type ProductSignalAnalysis,
  type SavedAnalysisSnapshot,
  type SessionRecord,
  type TechniqueReadingSnapshot,
} from "../state/types";
import { isDescriptorSavedInFolder } from "../state/ui-state";
import type {
  ExtensionMessage,
  ExtensionResponse,
  QueueItemsAndStartProcessingResponse,
  StartProcessingResponse
} from "../state/messages";
import type { SignalPacketExportFormat, SignalPacketExportResult } from "../compare/signal-packet-export";
import type { SignalReading } from "../compare/signal-reading-storage";
import type { PrCampaign, PrEvidenceRow } from "../state/pr-evidence-storage";
import { normalizePrCriteria, prCampaignToDraft } from "../state/pr-evidence-storage";
import { getProcessingFailureMessage, getProcessingFailureUiMessage } from "../state/processing-errors";
import {
  getItemReadinessStatus,
  getModeHomePage,
  guardPage,
  isProductSignalPage as isProductSignalWorkspacePage,
  summarizeSessionProcessing,
  type WorkerStatus
} from "../state/processing-state";
import { shouldBypassModeGuard } from "../state/page-registry";
import { addRuntimeMessageListener, getActiveItem, getActiveSession, sendExtensionMessage } from "./controller";
import {
  computeFlashPreviewStyle,
  flashPreviewMetrics,
  getLiveHoverDescriptor,
  HOVER_RECT_EVENT,
  OPTIMISTIC_SAVE_CONFIRMED_EVENT,
  OPTIMISTIC_SAVE_EVENT,
  OPTIMISTIC_SAVE_FAILED_EVENT,
  setLiveCollectionTarget,
  type HoverRect
} from "./inpage-helpers";
import {
  buildSettingsSaveMessages,
  createEmptyProductProfile
} from "./settings-save-messages";
import { useCompareDraftState } from "./useCompareDraftState";
import { usePopupKeyframes } from "./usePopupKeyframes";
import { usePopupWorkspaceState } from "./usePopupWorkspaceState";
import { useProcessingCoordinator } from "./useProcessingCoordinator";
import { useResultSurfaceState } from "./useResultSurfaceState";
import { useTopicAudit } from "./useTopicAudit";
import { useTopicState } from "./useTopicState";
import { createPrEvidenceResource, type PrEvidenceResourceState } from "./pr-evidence-resource";
import { readPrBriefFile } from "./pr-brief-upload";
import { downloadPrFileExport } from "./pr-summary-export";
import {
  buildPrEvidenceViewModel,
  summarizeAdvancedMetricsNotice,
  type PrEvidenceCommand,
  type PrEvidenceUiState
} from "../viewmodel/pr-evidence";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

type UseInPageCollectorAppStateArgs = {
  snapshot: ExtensionSnapshot | null;
  tabId: number | null;
  sendAndSync: SendAndSync;
};

const DEFAULT_PR_EVIDENCE_UI_STATE: PrEvidenceUiState = {
  activePane: "ledger",
  isSaving: false,
  isReadingBrief: false,
  isGeneratingCriteria: false,
  isMatching: false,
  isFetchingAdvancedMetrics: false,
  isGeneratingSummary: false
};

export function resolveEffectivePopupPage(page: ExtensionSnapshot["tab"]["popupPage"], activeFolderMode: FolderMode) {
  if (shouldBypassModeGuard(page)) {
    return page;
  }
  return guardPage(page, activeFolderMode);
}

export function resolveOptimisticSession(
  snapshot: ExtensionSnapshot | null,
  optimisticMode: FolderMode | null
): SessionRecord | null {
  if (!snapshot || optimisticMode === null) {
    return null;
  }
  return snapshot.global.sessions.find((session) => session.mode === optimisticMode) ?? null;
}

export function buildSessionModeChangeMessage(
  snapshot: ExtensionSnapshot | null,
  mode: FolderMode
): Extract<ExtensionMessage, { type: "session/set-mode" }> | Extract<ExtensionMessage, { type: "session/create" }> {
  const existingSession = snapshot?.global.sessions.find((session) => session.mode === mode) ?? null;
  if (existingSession) {
    return {
      type: "session/set-mode",
      sessionId: existingSession.id,
      mode
    };
  }
  return {
    type: "session/create",
    name: DEFAULT_SESSION_NAME_BY_MODE[mode],
    mode
  };
}

function readInteractionNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function readWallClockNowMs(): number {
  return Date.now();
}

function createContextFileId(kind: ProductProfileContextFile["kind"], name: string): string {
  return `ctx_${kind}_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${Date.now().toString(36)}`;
}

export function buildPreviewSaveMessage({
  activeFolderMode,
  sessionId,
  selectedTopicId,
  collectionTopicId,
  preview
}: {
  activeFolderMode: FolderMode;
  sessionId?: string | null;
  selectedTopicId?: string | null;
  collectionTopicId?: string | null;
  preview?: TargetDescriptor | null;
}): Extract<ExtensionMessage, { type: "session/save-current-preview" }> | null {
  const target = buildSaveCurrentPreviewTarget({
    activeFolderMode,
    sessionId,
    selectedTopicId,
    collectionTopicId
  });
  if (!target) {
    return null;
  }
  // Prefer the live hovered post (freshest) over the snapshot preview, which can lag
  // a fast cursor by a render frame and cause a save against the previous post.
  const descriptor = getLiveHoverDescriptor() ?? preview ?? null;
  return {
    type: "session/save-current-preview",
    target,
    ...(descriptor ? { descriptor } : {})
  };
}

export function shouldClearPrReconciledLoading(settled: RequestReconcileDecision | null): boolean {
  return settled === null || settled.accepted || settled.reason === "target-mismatch";
}

export function applyPrGenerateSummaryResult(
  current: PrEvidenceResourceState,
  response: ExtensionResponse,
  settled: RequestReconcileDecision
): PrEvidenceResourceState {
  if (!settled.accepted) {
    return current;
  }
  if (response.ok) {
    return {
      ...current,
      summary: response.prSummary || ""
    };
  }
  return {
    ...current,
    notice: response.error
  };
}

export function applyPrGeneratedCriteriaSaveResult(
  current: PrEvidenceResourceState,
  response: ExtensionResponse,
  settled: RequestReconcileDecision
): PrEvidenceResourceState {
  if (!settled.accepted) {
    return current;
  }
  if (!response.ok) {
    return {
      ...current,
      notice: response.error
    };
  }
  const active = response.prCampaigns?.[0] || null;
  if (!active) {
    return current;
  }
  return {
    ...current,
    campaign: prCampaignToDraft(active),
    setupCollapsed: true,
    notice: "條件已生成並儲存；批次判斷會使用這六個標籤。"
  };
}

type ProductHydrateTransition =
  | {
      kind: "request";
      requestKey: string;
      sessionId: string;
      signalIds: string[];
    }
  | {
      kind: "coalesce";
      requestKey: string;
    }
  | {
      kind: "skip";
      sessionId: string | undefined;
      shouldClearHydrating: true;
    };

type InPageHydrateSurface = "product" | "pr";
type HydrateTraceEventKind = "skip" | "request" | "response" | "error";

export function buildInPageHydrateTraceEvent({
  surface,
  event,
  sessionId,
  result,
  detail
}: {
  surface: InPageHydrateSurface;
  event: HydrateTraceEventKind;
  sessionId?: string;
  result: PipelineEventInput["result"];
  detail?: unknown;
}): PipelineEventInput {
  return {
    phase: "ui.ready",
    step: `popup.${surface}.hydrate.${event}`,
    target: { sessionId },
    result,
    ...(detail === undefined ? {} : { detail })
  };
}

export function buildInPageHydrateTraceTerminalSequence({
  surface,
  sessionId,
  terminal
}: {
  surface: InPageHydrateSurface;
  sessionId: string;
  terminal: "response" | "error";
}): PipelineEventInput[] {
  return [
    buildInPageHydrateTraceEvent({
      surface,
      event: "request",
      sessionId,
      result: "pending"
    }),
    buildInPageHydrateTraceEvent({
      surface,
      event: terminal,
      sessionId,
      result: terminal === "response" ? "ok" : "error"
    })
  ];
}

export function planProductHydrateTransition({
  popupOpen,
  activeFolderId,
  activeFolderMode,
  isProductSignalPage,
  page,
  signalIds,
  inFlightKey
}: {
  popupOpen: boolean;
  activeFolderId?: string | null;
  activeFolderMode: FolderMode;
  isProductSignalPage: boolean;
  page: ExtensionSnapshot["tab"]["popupPage"];
  signalIds: string[];
  inFlightKey: string | null;
}): ProductHydrateTransition {
  if (!popupOpen || !activeFolderId || activeFolderMode !== "product" || !isProductSignalPage) {
    return {
      kind: "skip",
      sessionId: activeFolderId ?? undefined,
      shouldClearHydrating: true
    };
  }
  const requestKey = [activeFolderId, page, ...signalIds].join("|");
  if (requestKey === inFlightKey) {
    return {
      kind: "coalesce",
      requestKey
    };
  }
  return {
    kind: "request",
    requestKey,
    sessionId: activeFolderId,
    signalIds
  };
}

function mergeAnalysesBySignalId(
  previous: ProductSignalAnalysis[],
  next: ProductSignalAnalysis[]
): ProductSignalAnalysis[] {
  const bySignalId = new Map(previous.map((analysis) => [analysis.signalId, analysis]));
  for (const analysis of next) {
    bySignalId.set(analysis.signalId, analysis);
  }
  return [...bySignalId.values()].sort((left, right) => right.analyzedAt.localeCompare(left.analyzedAt));
}

function upsertSignalReading(previous: SignalReading[], next: SignalReading): SignalReading[] {
  const byCacheKey = new Map(previous.map((reading) => [reading.cacheKey, reading]));
  byCacheKey.set(next.cacheKey, next);
  return [...byCacheKey.values()].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

type DisplayToastState = { id: string; kind: "saved" | "queued"; message: string };

export async function runAnalyzeItemsPipeline({
  folderId,
  itemIds,
  sendAndSync,
  setWorkerStatus,
  setDisplayToast
}: {
  folderId: string;
  itemIds: string[];
  sendAndSync: SendAndSync;
  setWorkerStatus: (status: WorkerStatus) => void;
  setDisplayToast: (toast: DisplayToastState) => void;
}): Promise<{ ok: boolean; failedCount: number }> {
  const queueRequestId = createPipelineRequestId("popup-bulk-queue");
  emitPipelineEvent({
    phase: "crawl.queued",
    step: "popup.bulk.queue-start.request",
    target: { sessionId: folderId },
    result: "pending",
    requestId: queueRequestId,
    detail: { itemCount: itemIds.length }
  });
  const queueResp = await sendAndSync<QueueItemsAndStartProcessingResponse>({
    type: "session/queue-items-and-start-processing",
    requestId: queueRequestId,
    sessionId: folderId,
    itemIds
  });
  emitPipelineEvent({
    phase: "crawl.queued",
    step: "popup.bulk.queue-start.response",
    target: { sessionId: folderId },
    result: queueResp.ok ? "ok" : "error",
    requestId: queueRequestId,
    detail: {
      ok: queueResp.ok,
      queuedCount: queueResp.ok ? queueResp.queuedItemIds?.length ?? null : null,
      failedCount: queueResp.ok ? queueResp.failedItemIds?.length ?? null : null,
      processingStatus: queueResp.ok ? queueResp.processingStatus ?? null : null
    }
  });
  if (!queueResp.ok) {
    setDisplayToast({
      id: `bulk-queue-failed-${Date.now()}`,
      kind: "queued",
      message: "加入隊列失敗"
    });
    return { ok: false, failedCount: itemIds.length };
  }

  const failedCount = queueResp.failedItemIds?.length ?? 0;
  const queuedCount = queueResp.queuedItemIds?.length ?? Math.max(itemIds.length - failedCount, 0);
  if (queuedCount <= 0) {
    setDisplayToast({
      id: `bulk-queue-empty-${Date.now()}`,
      kind: "queued",
      message: "沒有成功加入隊列的貼文"
    });
    return { ok: false, failedCount };
  }

  if (queueResp.processingStatus) {
    setWorkerStatus("draining");
    setDisplayToast({
      id: `bulk-analyze-${Date.now()}`,
      kind: "queued",
      message: failedCount
        ? `開始分析 ${queuedCount} 篇（${failedCount} 篇失敗）`
        : `開始分析 ${queuedCount} 篇`
    });
    const refreshRequestId = createPipelineRequestId("popup-bulk-refresh");
    emitPipelineEvent({
      phase: "capture.ready",
      step: "popup.bulk.refresh.request",
      target: { sessionId: folderId },
      result: "pending",
      requestId: refreshRequestId
    });
    const refreshResponse = await sendAndSync({
      type: "session/refresh-all",
      requestId: refreshRequestId,
      target: { sessionId: folderId }
    });
    emitPipelineEvent({
      phase: "capture.ready",
      step: "popup.bulk.refresh.response",
      target: { sessionId: folderId },
      result: refreshResponse.ok ? "ok" : "error",
      requestId: refreshRequestId,
      detail: { ok: refreshResponse.ok }
    });
    return { ok: true, failedCount };
  }

  setDisplayToast({
    id: `bulk-analyze-failed-${Date.now()}`,
    kind: "queued",
    message: getProcessingFailureMessage(queueResp.processingError || "已加入隊列，但未能啟動處理")
  });
  return { ok: false, failedCount };
}

export function useInPageCollectorAppState({ snapshot, tabId, sendAndSync }: UseInPageCollectorAppStateArgs) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const hadReadyPairRef = useRef(false);
  const refreshedOnOpenFolderRef = useRef<string | null>(null);
  const requestReconcilerRef = useRef(createRequestReconciler());
  const productHydrateInFlightKeyRef = useRef<string | null>(null);
  const productHydrateMountedRef = useRef(true);
  usePopupKeyframes();

  const [showFolderPrompt, setShowFolderPrompt] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [editingFolderName, setEditingFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [draftBaseUrl, setDraftBaseUrl] = useState("http://127.0.0.1:8000");
  const [draftProvider, setDraftProvider] = useState<"openai" | "claude" | "google" | "">("google");
  const [draftOpenAiKey, setDraftOpenAiKey] = useState("");
  const [draftClaudeKey, setDraftClaudeKey] = useState("");
  const [draftGoogleKey, setDraftGoogleKey] = useState("");
  const [draftLayoutPreferences, setDraftLayoutPreferences] = useState(createDefaultLayoutPreferences);
  const [draftProductProfile, setDraftProductProfile] = useState(createEmptyProductProfile);
  const [productProfileSeedText, setProductProfileSeedText] = useState("");
  const [isInitializingProductProfile, setIsInitializingProductProfile] = useState(false);
  const [hoverRect, setHoverRect] = useState<HoverRect | null>(null);
  const [displayToast, setDisplayToast] = useState<{ id: string; kind: "saved" | "queued"; message: string } | null>(null);
  const [optimisticSavedUrl, setOptimisticSavedUrl] = useState<string | null>(null);
  const [optimisticQueuedIds, setOptimisticQueuedIds] = useState<string[]>([]);
  const [bulkAnalyzingFolderId, setBulkAnalyzingFolderId] = useState<string | null>(null);
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [techniqueReadings, setTechniqueReadings] = useState<TechniqueReadingSnapshot[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysisSnapshot[]>([]);
  const [productSignalAnalyses, setProductSignalAnalyses] = useState<ProductSignalAnalysis[]>([]);
  const [historicalProductSignalAnalyses, setHistoricalProductSignalAnalyses] = useState<ProductSignalAnalysis[]>([]);
  const [productAgentTaskFeedback, setProductAgentTaskFeedback] = useState<ProductAgentTaskFeedback[]>([]);
  const [signalReadings, setSignalReadings] = useState<SignalReading[]>([]);
  const [isHydratingProductSignals, setIsHydratingProductSignals] = useState(false);
  const [activePrCampaign, setActivePrCampaign] = useState<PrCampaign | null>(null);
  const [prEvidenceResource, setPrEvidenceResource] = useState<PrEvidenceResourceState>(() => createPrEvidenceResource(""));
  const [prEvidenceUiState, setPrEvidenceUiState] = useState<PrEvidenceUiState>(DEFAULT_PR_EVIDENCE_UI_STATE);
  const [folderSynthesis, setFolderSynthesis] = useState<FolderSynthesis | null>(null);
  const [isGeneratingFolderSynthesis, setIsGeneratingFolderSynthesis] = useState(false);
  const [folderSynthesisError, setFolderSynthesisError] = useState<string | null>(null);
  const [isAnalyzingProductSignals, setIsAnalyzingProductSignals] = useState(false);
  const [productSignalAnalysisError, setProductSignalAnalysisError] = useState<string | null>(null);
  const [productSignalAnalysisNotice, setProductSignalAnalysisNotice] = useState<string | null>(null);
  const [compiledProductContext, setCompiledProductContext] = useState<ProductContext | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ bytesInUse: number; quotaBytes: number } | null>(null);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [optimisticSessionMode, setOptimisticSessionMode] = useState<FolderMode | null>(null);

  const snapshotActiveFolder = useMemo(() => getActiveSession(snapshot), [snapshot]);
  const optimisticFolder = useMemo(
    () => resolveOptimisticSession(snapshot, optimisticSessionMode),
    [optimisticSessionMode, snapshot]
  );
  const activeFolder = optimisticFolder ?? snapshotActiveFolder;
  const activeFolderIdRef = useRef(activeFolder?.id ?? "");
  const activePrCampaignIdRef = useRef(activePrCampaign?.id ?? prEvidenceResource.campaign.id ?? "");
  activeFolderIdRef.current = activeFolder?.id ?? "";
  activePrCampaignIdRef.current = activePrCampaign?.id ?? prEvidenceResource.campaign.id ?? "";
  const settleReconciledResponse = useCallback((
    token: RequestReconcileToken,
    currentTarget: RequestReconcileTarget
  ): RequestReconcileDecision => {
    const decision = requestReconcilerRef.current.complete(token, { currentTarget });
    if (!decision.accepted) {
      emitPipelineEvent(buildReconcileIgnoredEvent(token, decision));
    }
    return decision;
  }, []);
  const activeItem = useMemo(() => getActiveItem(snapshot), [snapshot]);
  const activeFolderMode: FolderMode = activeFolder?.mode ?? "archive";
  const popupOpen = Boolean(snapshot?.tab.popupOpen);
  const processingSummary = useMemo(
    () => summarizeSessionProcessing(activeFolder?.items || []),
    [activeFolder?.items]
  );
  const { workerStatus, workerError, backendWorkUiState, backendReachability, setWorkerStatus } = useProcessingCoordinator({
    popupOpen,
    activeFolderId: activeFolder?.id,
    hasInflight: processingSummary.hasInflight,
    ingestBaseUrl: snapshot?.global.settings.ingestBaseUrl,
    sendAndSync
  });
  const productBackendError = useMemo(
    () => activeFolderMode === "product" && workerError ? getProcessingFailureUiMessage(workerError) : null,
    [activeFolderMode, workerError]
  );
  const {
    workspaceState,
    setWorkspaceState,
    page: rawPage,
    beginPendingNavigation,
    clearPendingNavigation,
    onNavigate
  } = usePopupWorkspaceState({
    popupOpen,
    popupPage: snapshot?.tab.popupPage,
    processingSummary,
    sendAndSync
  });
  const page = resolveEffectivePopupPage(rawPage, activeFolderMode);
  const primaryMode = page === "settings" || page === "result" ? null : page;
  const flashPreview = snapshot?.tab.flashPreview;
  const preview = flashPreview || snapshot?.tab.currentPreview;
  const hoverNormalized = normalizePostUrl(flashPreview?.post_url || "");
  const hoverSaved = isDescriptorSavedInFolder(activeFolder, flashPreview || null) || (hoverNormalized !== "" && hoverNormalized === optimisticSavedUrl);
  const previewNormalized = normalizePostUrl(preview?.post_url || "");
  const previewSaved = isDescriptorSavedInFolder(activeFolder, preview || null) || (previewNormalized !== "" && previewNormalized === optimisticSavedUrl);
  const readyCompareItems = useMemo(
    () => (activeFolder?.items || []).filter((item) => item.status === "succeeded" && item.latestCapture?.analysis?.status === "succeeded"),
    [activeFolder?.items]
  );
  const productAiProviderReady = useMemo(() => {
    const settings = snapshot?.global.settings;
    if (!settings) {
      return false;
    }
    return Boolean(
      (settings.oneLinerProvider === "google" && (settings.hasGoogleKey ?? Boolean(settings.googleApiKey.trim())))
      || (settings.oneLinerProvider === "openai" && (settings.hasOpenAiKey ?? Boolean(settings.openaiApiKey.trim())))
      || (settings.oneLinerProvider === "claude" && (settings.hasClaudeKey ?? Boolean(settings.claudeApiKey.trim())))
    );
  }, [
    snapshot?.global.settings.oneLinerProvider,
    snapshot?.global.settings.hasGoogleKey,
    snapshot?.global.settings.hasOpenAiKey,
    snapshot?.global.settings.hasClaudeKey,
    snapshot?.global.settings.googleApiKey,
    snapshot?.global.settings.openaiApiKey,
    snapshot?.global.settings.claudeApiKey
  ]);

  useEffect(() => {
    return () => {
      productHydrateMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (optimisticSessionMode !== null && snapshotActiveFolder?.mode === optimisticSessionMode) {
      setOptimisticSessionMode(null);
    }
  }, [optimisticSessionMode, snapshotActiveFolder?.mode]);

  useEffect(() => {
    if (!popupOpen) {
      refreshedOnOpenFolderRef.current = null;
      return;
    }
    const folderId = activeFolder?.id;
    if (!folderId || refreshedOnOpenFolderRef.current === folderId) {
      return;
    }
    refreshedOnOpenFolderRef.current = folderId;
    void sendAndSync({ type: "session/refresh-all", target: { sessionId: folderId } }).catch((error: unknown) => {
      console.error("failed to refresh active folder on popup open", error);
    });
  }, [popupOpen, activeFolder?.id, sendAndSync]);
  const {
    selectedCompareA,
    setSelectedCompareA,
    selectedCompareB,
    setSelectedCompareB,
    compareItemA,
    compareItemB,
    compareTeaserState,
    compareTeaser,
    onResetCompareSelection
  } = useCompareDraftState({
    page,
    draft: snapshot?.tab.activeCompareDraft,
    readyCompareItems,
    settings: snapshot?.global.settings
  });
  const {
    resultSurface,
    resultSelection,
    resultItemA,
    resultItemB,
    activeSavedAnalysis,
    canStartJudgment,
    isGeneratingJudgment,
    onOpenCompareResult: openCompareResultBase,
    onOpenSavedAnalysis: openSavedAnalysisBase,
    onSaveCurrentAnalysis,
    onStartJudgment
  } = useResultSurfaceState({
    activeResult: snapshot?.tab.activeAnalysisResult,
    activeFolder,
    compareItemA,
    compareItemB,
    compareTeaser,
    compareTeaserState,
    productProfile: snapshot?.global.settings.productProfile,
    savedAnalyses,
    sendAndSync,
    setSavedAnalyses,
    setWorkspaceState
  });
  const topicState = useTopicState({
    popupOpen,
    activeFolder,
    activeFolderMode,
    savedAnalyses,
    activeSavedAnalysis,
    collectionTopicId: snapshot?.tab.collectionTopicId,
    stateUpdatedAt: snapshot?.global.updatedAt,
    sendAndSync,
    onNavigate,
    onOpenSavedAnalysis: openSavedAnalysisBase
  });
  const topicAuditState = useTopicAudit({
    popupOpen,
    activeFolder,
    topics: topicState.topics,
    sendAndSync
  });
  const savedToastMessage = useCallback((folderName: string): string => {
    if (activeFolderMode === "pr-evidence") {
      return "已加入 PR evidence";
    }
    if (activeFolderMode === "topic") {
      return "已加入主題";
    }
    return activeFolderMode === "product" ? "已加入產品訊號" : `已儲存到：${folderName}`;
  }, [activeFolderMode]);

  const folderSynthesisCoverage = useMemo(() => {
    if (activeFolderMode !== "topic" || !activeFolder) {
      return { analyzedCount: 0, contributingTopicCount: 0 };
    }
    const itemsById = new Map(activeFolder.items.map((item) => [item.id, item]));
    const analyzedTopicIds = new Set<string>();
    let analyzedCount = 0;
    for (const topic of topicState.topics) {
      const signalIds = new Set(topic.signalIds);
      for (const signal of topicState.signals) {
        if (!signalIds.has(signal.id) || !signal.itemId) continue;
        const item = itemsById.get(signal.itemId);
        if (item && getItemReadinessStatus(item) === "ready") {
          analyzedCount += 1;
          analyzedTopicIds.add(topic.id);
        }
      }
    }
    return { analyzedCount, contributingTopicCount: analyzedTopicIds.size };
  }, [activeFolder, activeFolderMode, topicState.topics, topicState.signals]);

  useEffect(() => {
    let cancelled = false;
    if (!popupOpen || !activeFolder?.id || activeFolderMode !== "pr-evidence") {
      setActivePrCampaign(null);
      const inactiveSessionId = activeFolder?.id || "";
      setPrEvidenceResource((current) => (
        current.campaign.sessionId === inactiveSessionId ? current : createPrEvidenceResource(inactiveSessionId)
      ));
      emitPipelineEvent(buildInPageHydrateTraceEvent({
        surface: "pr",
        event: "skip",
        sessionId: activeFolder?.id,
        result: "ok",
        detail: {
          popupOpen,
          mode: activeFolderMode
        }
      }));
      return;
    }
    const sessionId = activeFolder.id;
    emitPipelineEvent(buildInPageHydrateTraceEvent({
      surface: "pr",
      event: "request",
      sessionId,
      result: "pending",
      detail: {
        mode: activeFolderMode
      }
    }));
    void sendExtensionMessage<{ ok: true; prCampaigns?: PrCampaign[] } | { ok: false; error: string }>({
      type: "pr/list-campaigns",
      sessionId
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setActivePrCampaign(null);
          setPrEvidenceResource((current) => ({
            ...(current.campaign.sessionId === sessionId ? current : createPrEvidenceResource(sessionId)),
            notice: response.error
          }));
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "response",
            sessionId,
            result: "error",
            detail: {
              mode: activeFolderMode,
              campaignsOk: false,
              campaignCount: null,
              rowsOk: null,
              rowCount: null
            }
          }));
          return;
        }
        const active = response.prCampaigns?.[0] ?? null;
        if (!active) {
          setActivePrCampaign(null);
          setPrEvidenceResource(createPrEvidenceResource(sessionId));
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "response",
            sessionId,
            result: "ok",
            detail: {
              mode: activeFolderMode,
              campaignsOk: true,
              campaignCount: response.prCampaigns?.length ?? 0,
              rowsOk: null,
              rowCount: null
            }
          }));
          return;
        }
        setActivePrCampaign(active);
        setPrEvidenceResource((current) => ({
          campaign: prCampaignToDraft(active),
          rows: current.campaign.id === active.id ? current.rows : [],
          summary: current.campaign.id === active.id ? current.summary : "",
          notice: "",
          uploadError: "",
          setupCollapsed: true
        }));
        let rowResponse: { ok: true; prEvidenceRows?: PrEvidenceRow[] } | { ok: false; error: string };
        try {
          rowResponse = await sendExtensionMessage<{ ok: true; prEvidenceRows?: PrEvidenceRow[] } | { ok: false; error: string }>({
            type: "pr/list-evidence-rows",
            campaignId: active.id
          });
        } catch (error) {
          if (!cancelled) {
            setPrEvidenceResource((current) => ({
              ...current,
              campaign: prCampaignToDraft(active),
              rows: [],
              notice: error instanceof Error ? error.message : String(error)
            }));
            emitPipelineEvent(buildInPageHydrateTraceEvent({
              surface: "pr",
              event: "error",
              sessionId,
              result: "error",
              detail: {
                mode: activeFolderMode,
                campaignId: active.id
              }
            }));
          }
          return;
        }
        if (!cancelled) {
          setActivePrCampaign(active);
          setPrEvidenceResource({
            campaign: prCampaignToDraft(active),
            rows: rowResponse.ok ? rowResponse.prEvidenceRows ?? [] : [],
            summary: "",
            notice: rowResponse.ok ? "" : rowResponse.error,
            uploadError: "",
            setupCollapsed: true
          });
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "response",
            sessionId,
            result: rowResponse.ok ? "ok" : "error",
            detail: {
              mode: activeFolderMode,
              campaignId: active.id,
              campaignsOk: true,
              campaignCount: response.prCampaigns?.length ?? 0,
              rowsOk: rowResponse.ok,
              rowCount: rowResponse.ok ? rowResponse.prEvidenceRows?.length ?? 0 : null
            }
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActivePrCampaign(null);
          setPrEvidenceResource((current) => ({
            ...(current.campaign.sessionId === sessionId ? current : createPrEvidenceResource(sessionId)),
            notice: "PR campaign 讀取失敗。"
          }));
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "error",
            sessionId,
            result: "error",
            detail: {
              mode: activeFolderMode
            }
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolder?.id, activeFolderMode, popupOpen, snapshot?.global.updatedAt]);

  useEffect(() => {
    if (snapshot?.global.settings.ingestBaseUrl) {
      setDraftBaseUrl(snapshot.global.settings.ingestBaseUrl);
    }
    setDraftProvider(snapshot?.global.settings.oneLinerProvider || "");
    setDraftOpenAiKey(snapshot?.global.settings.openaiApiKey || "");
    setDraftClaudeKey(snapshot?.global.settings.claudeApiKey || "");
    setDraftGoogleKey(snapshot?.global.settings.googleApiKey || "");
    setDraftLayoutPreferences(snapshot?.global.settings.layoutPreferences ?? createDefaultLayoutPreferences());
    setDraftProductProfile(snapshot?.global.settings.productProfile ?? createEmptyProductProfile());
  }, [
    snapshot?.global.settings.ingestBaseUrl,
    snapshot?.global.settings.oneLinerProvider,
    snapshot?.global.settings.openaiApiKey,
    snapshot?.global.settings.claudeApiKey,
    snapshot?.global.settings.googleApiKey,
    snapshot?.global.settings.layoutPreferences,
    snapshot?.global.settings.productProfile
  ]);

  useEffect(() => {
    if (!popupOpen || page !== "library" || activeFolderMode !== "topic" || !activeFolder?.id) {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; folderSynthesis?: FolderSynthesis | null } | { ok: false; error: string }>({
      type: "folder/synthesis/get",
      sessionId: activeFolder.id
    })
      .then((response) => {
        if (cancelled) return;
        setFolderSynthesis(response.ok ? (response.folderSynthesis ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) setFolderSynthesis(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolder?.id, activeFolderMode, page, popupOpen, snapshot?.global.updatedAt]);

  useEffect(() => {
    if (page !== "library") {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; techniqueReadings?: TechniqueReadingSnapshot[] } | { ok: false; error: string }>({
      type: "compare/get-technique-readings"
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (response.ok) {
          setTechniqueReadings(response.techniqueReadings ?? []);
          return;
        }
        setTechniqueReadings([]);
      })
      .catch(() => {
        if (!cancelled) {
          setTechniqueReadings([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => {
    if (!popupOpen || page !== "settings" || activeFolderMode !== "product") {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; productContext?: ProductContext | null } | { ok: false; error: string }>({
      type: "product/get-context"
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setCompiledProductContext(response.ok ? (response.productContext ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setCompiledProductContext(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolderMode, page, popupOpen, snapshot?.global.updatedAt]);

  useEffect(() => {
    if (!popupOpen || page !== "settings") {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; bytesInUse?: number; quotaBytes?: number } | { ok: false; error: string }>({
      type: "storage/get-usage"
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (response.ok && typeof response.bytesInUse === "number" && typeof response.quotaBytes === "number") {
          setStorageUsage({
            bytesInUse: response.bytesInUse,
            quotaBytes: response.quotaBytes
          });
          return;
        }
        setStorageUsage(null);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageUsage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, popupOpen, snapshot?.global.updatedAt]);

  const isProductSignalPage = isProductSignalWorkspacePage(page);

  useEffect(() => {
    const signalIds = topicState.signals.map((signal) => signal.id);
    const transition = planProductHydrateTransition({
      popupOpen,
      activeFolderId: activeFolder?.id,
      activeFolderMode,
      isProductSignalPage,
      page,
      signalIds,
      inFlightKey: productHydrateInFlightKeyRef.current
    });

    if (transition.kind === "skip") {
      productHydrateInFlightKeyRef.current = null;
      setIsHydratingProductSignals(false);
      emitPipelineEvent(buildInPageHydrateTraceEvent({
        surface: "product",
        event: "skip",
        sessionId: transition.sessionId,
        result: "ok",
        detail: {
          popupOpen,
          mode: activeFolderMode,
          page,
          isProductSignalPage
        }
      }));
      return;
    }

    if (transition.kind === "coalesce") {
      return;
    }

    productHydrateInFlightKeyRef.current = transition.requestKey;
    setIsHydratingProductSignals(true);
    emitPipelineEvent(buildInPageHydrateTraceEvent({
      surface: "product",
      event: "request",
      sessionId: transition.sessionId,
      result: "pending",
      detail: {
        page,
        signalCount: transition.signalIds.length
      }
    }));
    void Promise.all([
      sendExtensionMessage<{ ok: true; productSignalAnalyses?: ProductSignalAnalysis[] } | { ok: false; error: string }>({
        type: "product/list-signal-analyses",
        signalIds: transition.signalIds
      }),
      sendExtensionMessage<{ ok: true; productSignalAnalyses?: ProductSignalAnalysis[] } | { ok: false; error: string }>({
        type: "product/list-signal-analyses"
      }),
      sendExtensionMessage<{ ok: true; productAgentTaskFeedback?: ProductAgentTaskFeedback[] } | { ok: false; error: string }>({
        type: "product/list-agent-task-feedback"
      }),
      sendExtensionMessage<{ ok: true; signalReadings?: SignalReading[] } | { ok: false; error: string }>({
        type: "product/list-signal-readings"
      })
    ])
      .then(([currentResponse, historicalResponse, feedbackResponse, readingsResponse]) => {
        if (!productHydrateMountedRef.current || productHydrateInFlightKeyRef.current !== transition.requestKey) {
          return;
        }
        productHydrateInFlightKeyRef.current = null;
        setIsHydratingProductSignals(false);
        const allOk = currentResponse.ok && historicalResponse.ok && feedbackResponse.ok && readingsResponse.ok;
        emitPipelineEvent(buildInPageHydrateTraceEvent({
          surface: "product",
          event: "response",
          sessionId: transition.sessionId,
          result: allOk ? "ok" : "error",
          detail: {
            page,
            signalCount: transition.signalIds.length,
            currentOk: currentResponse.ok,
            currentAnalysisCount: currentResponse.ok ? currentResponse.productSignalAnalyses?.length ?? 0 : null,
            historicalOk: historicalResponse.ok,
            historicalAnalysisCount: historicalResponse.ok ? historicalResponse.productSignalAnalyses?.length ?? 0 : null,
            feedbackOk: feedbackResponse.ok,
            feedbackCount: feedbackResponse.ok ? feedbackResponse.productAgentTaskFeedback?.length ?? 0 : null,
            readingsOk: readingsResponse.ok,
            readingCount: readingsResponse.ok ? readingsResponse.signalReadings?.length ?? 0 : null
          }
        }));
        if (currentResponse.ok) {
          setProductSignalAnalyses(currentResponse.productSignalAnalyses ?? []);
        }
        if (historicalResponse.ok) {
          setHistoricalProductSignalAnalyses(historicalResponse.productSignalAnalyses ?? []);
        }
        if (feedbackResponse.ok) {
          setProductAgentTaskFeedback(feedbackResponse.productAgentTaskFeedback ?? []);
        }
        if (readingsResponse.ok) {
          const scopedSignalIds = new Set(transition.signalIds);
          setSignalReadings((readingsResponse.signalReadings ?? []).filter((reading) => scopedSignalIds.has(reading.signalId)));
        }
      })
      .catch(() => {
        if (!productHydrateMountedRef.current || productHydrateInFlightKeyRef.current !== transition.requestKey) {
          return;
        }
        productHydrateInFlightKeyRef.current = null;
        setIsHydratingProductSignals(false);
        emitPipelineEvent(buildInPageHydrateTraceEvent({
          surface: "product",
          event: "error",
          sessionId: transition.sessionId,
          result: "error",
          detail: {
            page,
            signalCount: transition.signalIds.length
          }
        }));
        setProductSignalAnalyses([]);
        setHistoricalProductSignalAnalyses([]);
        setProductAgentTaskFeedback([]);
        setSignalReadings([]);
      });
  }, [
    activeFolder?.id,
    activeFolderMode,
    isProductSignalPage,
    page,
    popupOpen,
    snapshot,
    topicState.signals.map((signal) => signal.id).join("|")
  ]);

  useEffect(() => {
    if (!snapshot?.tab.popupOpen) {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; savedAnalyses?: SavedAnalysisSnapshot[] } | { ok: false; error: string }>({
      type: "compare/get-saved-analyses"
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSavedAnalyses(response.ok ? (response.savedAnalyses ?? []) : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSavedAnalyses([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot?.tab.popupOpen, page]);

  useEffect(() => {
    if (!popupOpen || typeof chrome === "undefined") {
      return;
    }
    const listener = (message: unknown) => {
      const typed = message as { type?: string };
      if (typed.type !== "judgment/result") {
        return;
      }
      void sendExtensionMessage<{ ok: true; savedAnalyses?: SavedAnalysisSnapshot[] } | { ok: false; error: string }>({
        type: "compare/get-saved-analyses"
      })
        .then((response) => {
          if (response.ok) {
            setSavedAnalyses(response.savedAnalyses ?? []);
          }
        })
        .catch(() => undefined);
    };
    return addRuntimeMessageListener(listener);
  }, [popupOpen]);

  useEffect(() => {
    setOptimisticSavedUrl(null);
  }, [activeFolder?.id]);

  useEffect(() => {
    if (!snapshot?.tab.popupOpen || !tabId) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (snapshot.tab.selectionMode) {
        return;
      }
      const target = event.target as Node | null;
      if (popupRef.current?.contains(target)) {
        return;
      }
      const launcher = document.getElementById("__dlens_extension_v0_launcher__");
      if (launcher?.contains(target)) {
        return;
      }
      void sendAndSync({ type: "popup/close-tab", tabId });
    };
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [sendAndSync, snapshot?.tab.popupOpen, snapshot?.tab.selectionMode, tabId]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<HoverRect | null>).detail;
      setHoverRect(detail || null);
    };
    window.addEventListener(HOVER_RECT_EVENT, listener as EventListener);
    return () => window.removeEventListener(HOVER_RECT_EVENT, listener as EventListener);
  }, []);

  useEffect(() => {
    if (snapshot?.tab.popupOpen && !activeFolder && snapshot.tab.currentPreview) {
      setShowFolderPrompt(true);
    }
  }, [snapshot?.tab.popupOpen, snapshot?.tab.currentPreview, activeFolder?.id]);

  useEffect(() => {
    const toast = snapshot?.tab.lastSavedToast;
    if (!toast) {
      return;
    }
    setDisplayToast({
      id: toast.id,
      kind: toast.kind,
      message: toast.kind === "saved" && activeFolder?.name ? savedToastMessage(activeFolder.name) : toast.message
    });
  }, [activeFolder?.name, savedToastMessage, snapshot?.tab.lastSavedToast]);

  useEffect(() => {
    if (!displayToast) {
      return;
    }
    const handle = window.setTimeout(() => {
      setDisplayToast((current) => (current?.id === displayToast.id ? null : current));
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [displayToast]);

  useEffect(() => {
    if (!processingSummary.hasReadyPair) {
      hadReadyPairRef.current = false;
      return;
    }
    if (hadReadyPairRef.current) {
      return;
    }
    hadReadyPairRef.current = true;
    setDisplayToast({
      id: `ready-pair-${Date.now()}`,
      kind: "saved",
      message: "2 posts ready to compare"
    });
  }, [processingSummary.hasReadyPair]);

  useEffect(() => {
    const onOptimisticSave = (event: Event) => {
      const descriptor = (event as CustomEvent<TargetDescriptor>).detail;
      const normalized = normalizePostUrl(descriptor?.post_url || "");
      if (!normalized) {
        return;
      }
      setOptimisticSavedUrl(normalized);
      const targetName = activeFolderMode === "topic" ? topicState.activeTopic?.name : activeFolder?.name;
      if (targetName) {
        setDisplayToast({
          id: `saved-${Date.now()}`,
          kind: "saved",
          message: activeFolderMode === "topic" ? `已儲存到：${targetName}` : savedToastMessage(targetName)
        });
      }
    };
    const onOptimisticConfirmed = () => {
      void sendAndSync({ type: "state/get-active-tab" });
    };
    const onOptimisticFailure = (event: Event) => {
      const failedUrl = normalizePostUrl(String((event as CustomEvent<string>).detail || ""));
      setOptimisticSavedUrl((current) => (current === failedUrl ? null : current));
    };
    window.addEventListener(OPTIMISTIC_SAVE_EVENT, onOptimisticSave as EventListener);
    window.addEventListener(OPTIMISTIC_SAVE_CONFIRMED_EVENT, onOptimisticConfirmed as EventListener);
    window.addEventListener(OPTIMISTIC_SAVE_FAILED_EVENT, onOptimisticFailure as EventListener);
    return () => {
      window.removeEventListener(OPTIMISTIC_SAVE_EVENT, onOptimisticSave as EventListener);
      window.removeEventListener(OPTIMISTIC_SAVE_CONFIRMED_EVENT, onOptimisticConfirmed as EventListener);
      window.removeEventListener(OPTIMISTIC_SAVE_FAILED_EVENT, onOptimisticFailure as EventListener);
    };
  }, [activeFolder?.name, activeFolderMode, savedToastMessage, sendAndSync, topicState.activeTopic?.name]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (!snapshot?.tab.selectionMode || isEditable) {
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        const message = buildPreviewSaveMessage({
          activeFolderMode,
          sessionId: activeFolder?.id,
          selectedTopicId: topicState.selectedTopicId,
          collectionTopicId: snapshot?.tab.collectionTopicId,
          preview: snapshot.tab.currentPreview
        });
        if (!message) {
          setDisplayToast({
            id: `folder-required-${Date.now()}`,
            kind: "saved",
            message: "先選擇資料夾"
          });
          return;
        }
        if (activeFolderMode === "topic" && !message.target.topicId) {
          setDisplayToast({
            id: `topic-required-${Date.now()}`,
            kind: "saved",
            message: "先選擇主題"
          });
          return;
        }
        const requestId = createPipelineRequestId("popup-collect-save");
        emitPipelineEvent({
          phase: "preview.confirmed",
          step: "popup.collect.save.request",
          target: { sessionId: message.target.sessionId },
          result: "pending",
          requestId,
          detail: {
            via: "keyboard",
            postUrl: message.descriptor?.post_url ?? null,
            topicId: message.target.topicId
          }
        });
        const saveStartedAt = performance.now();
        void sendAndSync({ ...message, requestId }).then((response) => {
          emitPipelineEvent({
            phase: "signal.saved",
            step: "popup.collect.save.response",
            target: { sessionId: message.target.sessionId },
            result: response.ok ? "ok" : "error",
            requestId,
            detail: {
              via: "keyboard",
              ok: response.ok,
              elapsedMs: Math.round((performance.now() - saveStartedAt) * 10) / 10
            }
          });
        });
      }

      if (event.key.toLowerCase() === "o" && snapshot.tab.currentPreview?.post_url) {
        event.preventDefault();
        window.open(snapshot.tab.currentPreview.post_url, "_blank", "noopener,noreferrer");
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activeFolder?.id, activeFolderMode, sendAndSync, snapshot?.tab.collectionTopicId, snapshot?.tab.selectionMode, snapshot?.tab.currentPreview?.post_url, topicState.selectedTopicId]);

  // Publish the folder/topic the popup is showing so the content-script click path
  // and keyboard save always target it, instead of the background's activeSessionId.
  useEffect(() => {
    setLiveCollectionTarget({
      sessionId: activeFolder?.id ?? null,
      topicId:
        activeFolderMode === "topic"
          ? topicState.selectedTopicId ?? snapshot?.tab.collectionTopicId ?? null
          : null
    });
  }, [activeFolder?.id, activeFolderMode, snapshot?.tab.collectionTopicId, topicState.selectedTopicId]);

  const canPrev = Boolean(activeFolder && activeItem && activeFolder.items.findIndex((item) => item.id === activeItem.id) > 0);
  const canNext = Boolean(
    activeFolder &&
      activeItem &&
      activeFolder.items.findIndex((item) => item.id === activeItem.id) < activeFolder.items.length - 1
  );
  const flashStyle = computeFlashPreviewStyle(hoverRect);
  const processAllLabel =
    workerStatus === "draining"
      ? "Processing..."
      : isStartingProcessing
        ? "Starting..."
        : "Process All";
  async function onSavePreview() {
    const targetTopicId = activeFolderMode === "topic" ? topicState.selectedTopicId || snapshot?.tab.collectionTopicId || "" : "";
    if (activeFolderMode === "topic" && !targetTopicId) {
      setDisplayToast({
        id: `topic-required-${Date.now()}`,
        kind: "saved",
        message: "先選擇主題"
      });
      return;
    }
    const message = buildPreviewSaveMessage({
      activeFolderMode,
      sessionId: activeFolder?.id,
      selectedTopicId: topicState.selectedTopicId,
      collectionTopicId: snapshot?.tab.collectionTopicId,
      preview
    });
    if (!message) {
      setDisplayToast({
        id: `folder-required-${Date.now()}`,
        kind: "saved",
        message: "先選擇資料夾"
      });
      return;
    }
    const normalized = normalizePostUrl(preview?.post_url || "");
    if (normalized) {
      setOptimisticSavedUrl(normalized);
      if (activeFolder?.name) {
        setDisplayToast({
          id: `saved-${Date.now()}`,
          kind: "saved",
          message: savedToastMessage(activeFolder.name)
        });
      }
    }
    const requestId = createPipelineRequestId("popup-collect-save");
    emitPipelineEvent({
      phase: "preview.confirmed",
      step: "popup.collect.save.request",
      target: { sessionId: message.target.sessionId },
      result: "pending",
      requestId,
      detail: {
        via: "button",
        postUrl: message.descriptor?.post_url ?? null,
        topicId: message.target.topicId
      }
    });
    const saveStartedAt = performance.now();
    const response = await sendAndSync({ ...message, requestId });
    emitPipelineEvent({
      phase: "signal.saved",
      step: "popup.collect.save.response",
      target: { sessionId: message.target.sessionId },
      result: response.ok ? "ok" : "error",
      requestId,
      detail: {
        via: "button",
        ok: response.ok,
        elapsedMs: Math.round((performance.now() - saveStartedAt) * 10) / 10
      }
    });
    if (!response.ok && normalized) {
      setOptimisticSavedUrl((current) => (current === normalized ? null : current));
    }
  }

  async function onCreateFolder(saveCurrentPreview = false) {
    if (!folderName.trim()) {
      return;
    }
    const descriptor = saveCurrentPreview ? getLiveHoverDescriptor() ?? snapshot?.tab.currentPreview ?? undefined : undefined;
    await sendAndSync({
      type: "session/create",
      name: folderName.trim(),
      saveCurrentPreview,
      ...(descriptor ? { descriptor } : {})
    });
    setFolderName("");
    setShowFolderPrompt(false);
  }

  async function onSessionModeChange(mode: FolderMode) {
    if (activeFolder) {
      const targetSession = snapshot?.global.sessions.find((session) => session.mode === mode) ?? null;
      if (targetSession && mode !== activeFolderMode) {
        setOptimisticSessionMode(mode);
        beginPendingNavigation(getModeHomePage(mode));
      }
      try {
        return await topicState.onSessionModeChange(mode, targetSession?.id);
      } catch (error) {
        setOptimisticSessionMode(null);
        clearPendingNavigation();
        setWorkspaceState((currentState) => ({
          ...currentState,
          currentMode: resolveEffectivePopupPage(snapshot?.tab.popupPage ?? currentState.currentMode, activeFolderMode),
          popupOpen: true,
          modeLocked: true
        }));
        throw error;
      }
    }

    const createResponse = await sendAndSync(buildSessionModeChangeMessage(snapshot, mode));
    setShowFolderPrompt(false);
    setFolderName("");
    return createResponse;
  }

  async function onRenameFolder() {
    if (!activeFolder || !editingFolderName.trim()) {
      return;
    }
    await sendAndSync({
      type: "session/rename",
      sessionId: activeFolder.id,
      name: editingFolderName.trim()
    });
    setIsRenamingFolder(false);
  }

  async function onDeleteFolder() {
    if (!activeFolder) {
      return;
    }
    if (!window.confirm(`Delete folder "${activeFolder.name}"?`)) {
      return;
    }
    await sendAndSync({
      type: "session/delete",
      sessionId: activeFolder.id
    });
    setIsRenamingFolder(false);
  }

  async function onOpenPopup() {
    await sendAndSync({ type: "popup/open-active-tab" });
  }

  async function onTogglePopup() {
    if (snapshot?.tab.popupOpen && tabId) {
      await sendAndSync({ type: "popup/close-tab", tabId });
      return;
    }
    await onOpenPopup();
  }

  async function onToggleCollectMode() {
    const nextType = snapshot?.tab.selectionMode ? "selection/cancel-active-tab" : "selection/start-active-tab";
    const startedAt = performance.now();
    emitPipelineEvent({
      phase: "signal.saved",
      step: "popup.collect.toggle.request",
      target: { sessionId: activeFolder?.id },
      result: "pending",
      detail: {
        type: nextType,
        activeFolderMode
      }
    });
    const response = await sendAndSync({
      type: nextType
    });
    emitPipelineEvent({
      phase: "signal.saved",
      step: "popup.collect.toggle.response",
      target: { sessionId: activeFolder?.id },
      result: response.ok ? "ok" : "error",
      detail: {
        ok: response.ok,
        elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
        selectionMode: response.ok ? response.snapshot?.tab.selectionMode ?? null : null
      }
    });
  }

  function openPreview() {
    if (!preview?.post_url) {
      return;
    }
    window.open(preview.post_url, "_blank", "noopener,noreferrer");
  }

  async function moveSelection(direction: -1 | 1) {
    if (!activeFolder || !activeItem) {
      return;
    }
    const index = activeFolder.items.findIndex((item) => item.id === activeItem.id);
    const next = activeFolder.items[index + direction];
    if (!next) {
      return;
    }
    await sendAndSync({
      type: "session/select-item",
      sessionId: activeFolder.id,
      itemId: next.id
    });
  }

  async function onQueueItem() {
    if (!activeFolder || !activeItem) {
      return;
    }
    await onQueueItemById(activeItem.id);
  }

  async function onQueueItemById(itemId: string) {
    if (!activeFolder) {
      return;
    }
    setOptimisticQueuedIds((current) => Array.from(new Set([...current, itemId])));
    setDisplayToast({
      id: `queued-${Date.now()}`,
      kind: "queued",
      message: `已加入隊列：${activeFolder.name}`
    });
    const requestId = createPipelineRequestId("popup-queue-item");
    emitPipelineEvent({
      phase: "crawl.queued",
      step: "popup.queue-item.request",
      target: { sessionId: activeFolder.id, itemId },
      result: "pending",
      requestId
    });
    const response = await sendAndSync({
      type: "session/queue-item",
      requestId,
      sessionId: activeFolder.id,
      itemId
    });
    emitPipelineEvent({
      phase: "crawl.queued",
      step: "popup.queue-item.response",
      target: { sessionId: activeFolder.id, itemId },
      result: response.ok ? "ok" : "error",
      requestId,
      detail: { ok: response.ok }
    });
    setOptimisticQueuedIds((current) => current.filter((id) => id !== itemId));
    if (!response.ok) {
      setDisplayToast({
        id: `queue-failed-${Date.now()}`,
        kind: "queued",
        message: "加入隊列失敗"
      });
    }
  }

  function onAddToCompare(itemId: string) {
    if (!selectedCompareA || selectedCompareA === itemId) {
      setSelectedCompareA(itemId);
    } else if (!selectedCompareB || selectedCompareB === itemId) {
      setSelectedCompareB(itemId);
    } else {
      setSelectedCompareA(itemId);
    }
    void onNavigate("compare");
  }

  async function onProcessAll() {
    if (!activeFolder) {
      return;
    }
    setIsStartingProcessing(true);
    try {
      const pendingIds = activeFolder.items
        .filter((item) => item.status === "saved" || item.status === "failed")
        .map((item) => item.id);
      if (pendingIds.length) {
        setOptimisticQueuedIds((current) => Array.from(new Set([...current, ...pendingIds])));
        const queueRequestId = createPipelineRequestId("popup-queue-all");
        emitPipelineEvent({
          phase: "crawl.queued",
          step: "popup.queue-all.request",
          target: { sessionId: activeFolder.id },
          result: "pending",
          requestId: queueRequestId,
          detail: { itemCount: pendingIds.length }
        });
        const queueResponse = await sendAndSync({
          type: "session/queue-all-pending",
          requestId: queueRequestId,
          target: {
            sessionId: activeFolder.id
          }
        });
        emitPipelineEvent({
          phase: "crawl.queued",
          step: "popup.queue-all.response",
          target: { sessionId: activeFolder.id },
          result: queueResponse.ok ? "ok" : "error",
          requestId: queueRequestId,
          detail: { ok: queueResponse.ok }
        });
        setOptimisticQueuedIds((current) => current.filter((id) => !pendingIds.includes(id)));
        if (!queueResponse.ok) {
          setDisplayToast({
            id: `queue-all-failed-${Date.now()}`,
            kind: "queued",
            message: "加入隊列失敗"
          });
          return;
        }
      }
      const startRequestId = createPipelineRequestId("popup-worker-start");
      emitPipelineEvent({
        phase: "crawl.queued",
        step: "popup.worker.start-processing.request",
        target: { sessionId: activeFolder.id },
        result: "pending",
        requestId: startRequestId
      });
      const response = await sendAndSync<StartProcessingResponse>({
        type: "worker/start-processing",
        requestId: startRequestId
      });
      emitPipelineEvent({
        phase: "crawl.queued",
        step: "popup.worker.start-processing.response",
        target: { sessionId: activeFolder.id },
        result: response.ok ? "ok" : "error",
        requestId: startRequestId,
        detail: {
          ok: response.ok,
          processingStatus: response.ok ? response.processingStatus ?? null : null
        }
      });
      if (response.ok) {
        setWorkerStatus("draining");
      }
      setDisplayToast({
        id: `processing-${Date.now()}`,
        kind: "queued",
        message: response.ok
          ? response.processingStatus === "already_running"
            ? "Processing already running"
            : "Processing started"
          : getProcessingFailureMessage(response.error)
      });
      if (response.ok) {
        const refreshRequestId = createPipelineRequestId("popup-process-refresh");
        emitPipelineEvent({
          phase: "capture.ready",
          step: "popup.process.refresh.request",
          target: { sessionId: activeFolder.id },
          result: "pending",
          requestId: refreshRequestId
        });
        const refreshResponse = await sendAndSync({
          type: "session/refresh-all",
          requestId: refreshRequestId,
          target: { sessionId: activeFolder.id }
        });
        emitPipelineEvent({
          phase: "capture.ready",
          step: "popup.process.refresh.response",
          target: { sessionId: activeFolder.id },
          result: refreshResponse.ok ? "ok" : "error",
          requestId: refreshRequestId,
          detail: { ok: refreshResponse.ok }
        });
      }
    } finally {
      setIsStartingProcessing(false);
    }
  }

  async function onStartProcessing() {
    if (!activeFolder) {
      return;
    }
    setIsStartingProcessing(true);
    try {
      const startRequestId = createPipelineRequestId("popup-worker-start");
      emitPipelineEvent({
        phase: "crawl.queued",
        step: "popup.worker.start-processing.request",
        target: { sessionId: activeFolder.id },
        result: "pending",
        requestId: startRequestId
      });
      const response = await sendAndSync<StartProcessingResponse>({
        type: "worker/start-processing",
        requestId: startRequestId
      });
      emitPipelineEvent({
        phase: "crawl.queued",
        step: "popup.worker.start-processing.response",
        target: { sessionId: activeFolder.id },
        result: response.ok ? "ok" : "error",
        requestId: startRequestId,
        detail: {
          ok: response.ok,
          processingStatus: response.ok ? response.processingStatus ?? null : null
        }
      });
      if (response.ok) {
        setWorkerStatus("draining");
      }
      setDisplayToast({
        id: `processing-restart-${Date.now()}`,
        kind: "queued",
        message: response.ok
          ? response.processingStatus === "already_running"
            ? "Processing already running"
            : "Processing started"
          : getProcessingFailureMessage(response.error)
      });
      if (response.ok) {
        const refreshRequestId = createPipelineRequestId("popup-process-refresh");
        emitPipelineEvent({
          phase: "capture.ready",
          step: "popup.process.refresh.request",
          target: { sessionId: activeFolder.id },
          result: "pending",
          requestId: refreshRequestId
        });
        const refreshResponse = await sendAndSync({
          type: "session/refresh-all",
          requestId: refreshRequestId,
          target: { sessionId: activeFolder.id }
        });
        emitPipelineEvent({
          phase: "capture.ready",
          step: "popup.process.refresh.response",
          target: { sessionId: activeFolder.id },
          result: refreshResponse.ok ? "ok" : "error",
          requestId: refreshRequestId,
          detail: { ok: refreshResponse.ok }
        });
      }
    } finally {
      setIsStartingProcessing(false);
    }
  }

  async function onAnalyzeItems(itemIds: string[]): Promise<{ ok: boolean; failedCount: number }> {
    if (!activeFolder || itemIds.length === 0) {
      return { ok: false, failedCount: 0 };
    }

    const folderId = activeFolder.id;
    const uniqueItemIds = Array.from(new Set(itemIds));
    setBulkAnalyzingFolderId(folderId);
    setOptimisticQueuedIds((current) => Array.from(new Set([...current, ...uniqueItemIds])));

    try {
      return await runAnalyzeItemsPipeline({
        folderId,
        itemIds: uniqueItemIds,
        sendAndSync,
        setWorkerStatus,
        setDisplayToast
      });
    } finally {
      setOptimisticQueuedIds((current) => current.filter((id) => !uniqueItemIds.includes(id)));
      setBulkAnalyzingFolderId(null);
    }
  }

  const compareViewSettings = snapshot?.global.settings || createDefaultSettings();

  async function onSetActiveSession(sessionId: string) {
    await sendAndSync({
      type: "session/set-active",
      sessionId
    });
  }

  async function onSelectItem(itemId: string) {
    await sendAndSync({
      type: "session/select-item",
      sessionId: activeFolder?.id || "",
      itemId
    });
  }

  async function onOpenCompareResult() {
    topicState.clearResultTopicContext();
    await openCompareResultBase();
  }

  async function onOpenSavedAnalysis(resultId: string) {
    topicState.clearResultTopicContext();
    await openSavedAnalysisBase(resultId);
  }

  async function onGenerateFolderSynthesis() {
    if (!activeFolder?.id || isGeneratingFolderSynthesis) {
      return;
    }
    const sessionId = activeFolder.id;
    const requestId = createPipelineRequestId("folder-synthesis-generate");
    const token = requestReconcilerRef.current.begin({
      lane: "folder.generateSynthesis",
      requestId,
      target: { sessionId }
    });
    setIsGeneratingFolderSynthesis(true);
    setFolderSynthesisError(null);
    let settled: RequestReconcileDecision | null = null;
    try {
      const response = await sendAndSync({
        type: "folder/synthesis/generate",
        requestId,
        sessionId
      });
      settled = settleReconciledResponse(token, { sessionId: activeFolderIdRef.current });
      if (!settled.accepted) {
        return;
      }
      if (response.ok) {
        setFolderSynthesis(response.folderSynthesis ?? null);
      } else {
        setFolderSynthesisError(response.error || "合成失敗");
      }
    } catch (error) {
      settled = settleReconciledResponse(token, { sessionId: activeFolderIdRef.current });
      if (!settled.accepted) {
        return;
      }
      setFolderSynthesisError(error instanceof Error ? error.message : "合成失敗");
    } finally {
      if (settled === null || settled.accepted || settled.reason === "target-mismatch") {
        setIsGeneratingFolderSynthesis(false);
      }
    }
  }

  async function onClearFolderSynthesis() {
    if (!activeFolder?.id) return;
    const sessionId = activeFolder.id;
    const requestId = createPipelineRequestId("folder-synthesis-clear");
    const token = requestReconcilerRef.current.begin({
      lane: "folder.clearSynthesis",
      requestId,
      target: { sessionId }
    });
    setFolderSynthesisError(null);
    try {
      const response = await sendAndSync({
        type: "folder/synthesis/clear",
        requestId,
        sessionId
      });
      const decision = settleReconciledResponse(token, { sessionId: activeFolderIdRef.current });
      if (!decision.accepted) {
        return;
      }
      if (response.ok) {
        setFolderSynthesis(null);
      }
    } catch (error) {
      const decision = settleReconciledResponse(token, { sessionId: activeFolderIdRef.current });
      if (!decision.accepted) {
        return;
      }
      setFolderSynthesisError(error instanceof Error ? error.message : "清除失敗");
    }
  }

  async function onSaveJudgmentOverride(
    resultId: string,
    patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" }
  ) {
    const pair = savedAnalyses.find((entry) => entry.resultId === resultId);
    if (!pair) {
      return;
    }
    const response = await sendAndSync({
      type: "judgment/result",
      resultId,
      judgmentResult: {
        relevance: patch.relevance,
        recommendedState: patch.recommendedState,
        whyThisMatters: pair.judgmentResult?.whyThisMatters || "人工調整 judgment。",
        actionCue: pair.judgmentResult?.actionCue || "人工覆核"
      },
      judgmentVersion: pair.judgmentVersion ?? "v1",
      judgmentSource: pair.judgmentSource ?? "fallback"
    });
    if (response.ok) {
      setSavedAnalyses(response.savedAnalyses ?? savedAnalyses);
    }
  }

  async function onSaveSettings() {
    if (isSavingSettings) {
      return;
    }
    setIsSavingSettings(true);
    setSettingsSaveStatus(null);
    try {
      let latestProductContext: ProductContext | null | undefined;
      let productContextError: string | null | undefined;
      for (const message of buildSettingsSaveMessages({
        draftBaseUrl,
        draftProvider,
        draftOpenAiKey,
        draftClaudeKey,
        draftGoogleKey,
        draftLayoutPreferences,
        draftProductProfile
      })) {
        const response = await sendAndSync(message);
        if (!response.ok) {
          setSettingsSaveStatus({ kind: "error", message: response.error });
          return;
        }
        if ("productContext" in response) {
          latestProductContext = response.productContext ?? null;
        }
        if ("productContextError" in response) {
          productContextError = response.productContextError ?? null;
        }
      }
      if (latestProductContext !== undefined) {
        setCompiledProductContext(latestProductContext);
      }
      if (productContextError) {
        setSettingsSaveStatus({
          kind: "error",
          message: `Settings 已儲存；ProductContext 編譯失敗：${productContextError}`
        });
        return;
      }
      setSettingsSaveStatus({
        kind: "success",
        message: latestProductContext ? "Settings 已儲存，ProductContext 已編譯。" : "Settings 已儲存。"
      });
    } catch (error) {
      setSettingsSaveStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function onClearProductCache() {
    setSettingsSaveStatus(null);
    try {
      const response = await sendAndSync({ type: "product/clear-cache" });
      if (!response.ok) {
        setSettingsSaveStatus({ kind: "error", message: response.error });
        return;
      }
      setProductSignalAnalyses([]);
      setHistoricalProductSignalAnalyses([]);
      setProductAgentTaskFeedback([]);
      setSignalReadings([]);
      setCompiledProductContext(null);
      setProductSignalAnalysisNotice("Product cache 已清除；保留已儲存 signals，請重新分析。");
      setSettingsSaveStatus({
        kind: "success",
        message: "Product cache 已清除。已儲存 signals、topics、PR evidence 不受影響。"
      });
    } catch (error) {
      setSettingsSaveStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function onDraftProductProfileChange(patch: Partial<typeof draftProductProfile>) {
    setDraftProductProfile((current) => ({
      ...current,
      ...patch
    }));
  }

  function onDraftLayoutPreferencesChange(patch: Partial<LayoutPreferences>) {
    setDraftLayoutPreferences((current) => ({
      ...current,
      ...patch
    }));
  }

  async function onInitProductProfile() {
    if (!productProfileSeedText.trim() || isInitializingProductProfile) {
      return;
    }
    setIsInitializingProductProfile(true);
    try {
      const response = await sendExtensionMessage<{ ok: true; productProfile?: typeof draftProductProfile | null } | { ok: false; error: string }>({
        type: "settings/init-product-profile",
        description: productProfileSeedText.trim()
      });
      if (response.ok && response.productProfile) {
        setDraftProductProfile(response.productProfile);
      }
    } finally {
      setIsInitializingProductProfile(false);
    }
  }

  async function onAnalyzeProductSignals() {
    if (!activeFolder?.id || isAnalyzingProductSignals) {
      return;
    }
    setIsAnalyzingProductSignals(true);
    setProductSignalAnalysisError(null);
    setProductSignalAnalysisNotice(null);
    const startedAt = performance.now();
    const requestId = createPipelineRequestId("product-analyze");
    const token = requestReconcilerRef.current.begin({
      lane: "product.analyzeSignals",
      requestId,
      target: { sessionId: activeFolder.id }
    });
    emitPipelineEvent({
      phase: "analysis.ready",
      step: "popup.product.analyze.request",
      target: { sessionId: activeFolder.id },
      result: "pending",
      requestId,
      detail: {
        signalCount: topicState.signals.length,
        analysisCount: productSignalAnalyses.length
      }
    });
    let settled: RequestReconcileDecision | null = null;
    try {
      const response = await sendAndSync({
        type: "product/analyze-signals",
        requestId,
        sessionId: activeFolder.id
      });
      settled = settleReconciledResponse(token, { sessionId: activeFolderIdRef.current });
      if (!settled.accepted) {
        return;
      }
      emitPipelineEvent({
        phase: "analysis.ready",
        step: "popup.product.analyze.response",
        target: { sessionId: activeFolder.id },
        result: response.ok ? "ok" : "error",
        requestId,
        detail: {
          ok: response.ok,
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          queued: response.ok ? response.productSignalAnalysisSummary?.queued ?? null : null,
          analyzed: response.ok ? response.productSignalAnalysisSummary?.analyzed ?? null : null,
          failed: response.ok ? response.productSignalAnalysisSummary?.failed ?? null : null,
          failureCount: response.ok ? response.productSignalAnalysisSummary?.failures?.length ?? 0 : null
        }
      });
      if (response.ok) {
        setProductSignalAnalyses(response.productSignalAnalyses ?? []);
        setHistoricalProductSignalAnalyses((previous) => mergeAnalysesBySignalId(previous, response.productSignalAnalyses ?? []));
        const queued = response.productSignalAnalysisSummary?.queued ?? 0;
        const analyzed = response.productSignalAnalysisSummary?.analyzed ?? 0;
        const failed = response.productSignalAnalysisSummary?.failed ?? 0;
        const firstFailure = response.productSignalAnalysisSummary?.failures?.[0] || null;
        if (queued > 0) {
          setProductSignalAnalysisNotice(`已送出 ${queued} 條抓取，完成後請再按分析。`);
        } else if (failed > 0) {
          setProductSignalAnalysisError(
            firstFailure
              ? `有 ${failed} 條產品訊號分析失敗；第一筆：${getProcessingFailureUiMessage(firstFailure.error)}`
              : `有 ${failed} 條產品訊號分析失敗；其他 ready signals 已繼續處理。`
          );
        } else if (analyzed > 0) {
          setProductSignalAnalysisNotice(`已完成 ${analyzed} 條產品訊號分析。`);
        } else {
          setProductSignalAnalysisNotice("沒有新的 ready signal 可分析。");
        }
        return;
      }
      setProductSignalAnalysisError(getProcessingFailureUiMessage(response.error));
    } catch (error) {
      settled = settleReconciledResponse(token, { sessionId: activeFolderIdRef.current });
      if (!settled.accepted) {
        return;
      }
      emitPipelineEvent({
        phase: "analysis.ready",
        step: "popup.product.analyze.throw",
        target: { sessionId: activeFolder.id },
        result: "error",
        requestId,
        detail: {
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      setProductSignalAnalysisError(getProcessingFailureUiMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      if (settled === null || settled.accepted || settled.reason === "target-mismatch") {
        setIsAnalyzingProductSignals(false);
      }
    }
  }

  async function onSynthesizeSignalReading(
    signalId: string,
    sessionId: string,
    force?: boolean
  ): Promise<{ ok: true; reading: string } | { ok: false; error: string }> {
    const requestId = createPipelineRequestId("product-signal-reading");
    const token = requestReconcilerRef.current.begin({
      lane: `product.synthesizeSignalReading:${signalId}`,
      requestId,
      target: { sessionId, signalId }
    });
    try {
      const response = await sendAndSync({
        type: "product/synthesize-signal-reading",
        requestId,
        signalId,
        sessionId,
        force
      });
      const decision = settleReconciledResponse(token, {
        sessionId: activeFolderIdRef.current,
        signalId
      });
      if (!decision.accepted) {
        return { ok: false, error: "已忽略過期的判讀結果。" };
      }
      if (response.ok) {
        if (response.signalReading) {
          setSignalReadings((previous) => upsertSignalReading(previous, response.signalReading!));
          return { ok: true, reading: response.signalReading.reading };
        }
        return { ok: false, error: "沒有產生判讀。" };
      }
      return { ok: false, error: response.error };
    } catch (error) {
      const decision = settleReconciledResponse(token, {
        sessionId: activeFolderIdRef.current,
        signalId
      });
      if (!decision.accepted) {
        return { ok: false, error: "已忽略過期的判讀結果。" };
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function onReviewSignalReading(
    cacheKey: string,
    decision: "filed" | "deferred" | "rejected",
    note?: string
  ): Promise<{ ok: true; signalReading: SignalReading } | { ok: false; error: string }> {
    const sessionId = activeFolder?.id ?? "";
    const requestId = createPipelineRequestId("product-review-reading");
    const token = requestReconcilerRef.current.begin({
      lane: `product.reviewSignalReading:${cacheKey}`,
      requestId,
      target: { sessionId, cacheKey }
    });
    try {
      const response = await sendAndSync({
        type: "product/review-signal-reading",
        requestId,
        cacheKey,
        decision,
        ...(note ? { note } : {})
      });
      const reconcileDecision = settleReconciledResponse(token, {
        sessionId: activeFolderIdRef.current,
        cacheKey
      });
      if (!reconcileDecision.accepted) {
        return { ok: false, error: "已忽略過期的判讀審核結果。" };
      }
      if (response.ok) {
        if (response.signalReading) {
          setSignalReadings((previous) => upsertSignalReading(previous, response.signalReading!));
          return { ok: true, signalReading: response.signalReading };
        }
        return { ok: false, error: "找不到這筆判讀。" };
      }
      return { ok: false, error: response.error };
    } catch (error) {
      const reconcileDecision = settleReconciledResponse(token, {
        sessionId: activeFolderIdRef.current,
        cacheKey
      });
      if (!reconcileDecision.accepted) {
        return { ok: false, error: "已忽略過期的判讀審核結果。" };
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function onExportSignalPackets({
    sessionId,
    format
  }: {
    sessionId: string;
    format: SignalPacketExportFormat;
  }): Promise<{ ok: true; exportResult: SignalPacketExportResult } | { ok: false; error: string }> {
    try {
      const response = await sendAndSync({
        type: "signal-packet/export",
        format,
        filter: { sessionId }
      });
      if (response.ok) {
        if (response.signalPacketExport) {
          return { ok: true, exportResult: response.signalPacketExport };
        }
        return { ok: false, error: "沒有產生 Signal Packet 匯出內容。" };
      }
      return { ok: false, error: response.error };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function onRemoveProductSignal(signalId: string) {
    setProductSignalAnalysisError(null);
    const response = await topicState.onRemoveSignal(signalId);
    if (response.ok) {
      setProductSignalAnalyses(response.productSignalAnalyses ?? productSignalAnalyses.filter((analysis) => analysis.signalId !== signalId));
      setHistoricalProductSignalAnalyses((previous) => previous.filter((analysis) => analysis.signalId !== signalId));
      setProductAgentTaskFeedback((previous) => previous.filter((feedback) => feedback.signalId !== signalId));
      setProductSignalAnalysisNotice("已移除 signal。");
      return;
    }
    setProductSignalAnalysisError(getProcessingFailureUiMessage(response.error));
  }

  const onPrEvidenceResourceChange = useCallback((resource: PrEvidenceResourceState) => {
    setPrEvidenceResource(resource);
  }, []);

  const onPrEvidenceActiveCampaignChange = useCallback((campaign: PrCampaign | null) => {
    setActivePrCampaign(campaign);
    if (campaign) {
      setPrEvidenceResource((current) => ({
        ...current,
        campaign: prCampaignToDraft(campaign),
        setupCollapsed: true
      }));
    }
  }, []);

  const prEvidenceViewModel = useMemo(() => buildPrEvidenceViewModel({
    sessionId: activeFolder?.id || prEvidenceResource.campaign.sessionId || "",
    resource: prEvidenceResource,
    uiState: prEvidenceUiState
  }), [activeFolder?.id, prEvidenceResource, prEvidenceUiState]);

  const onPrEvidenceCommand = useCallback(async (command: PrEvidenceCommand) => {
    const updateUiState = (patch: Partial<PrEvidenceUiState>) => {
      setPrEvidenceUiState((current) => ({ ...current, ...patch }));
    };
    const updateResource = (updater: (current: PrEvidenceResourceState) => PrEvidenceResourceState) => {
      setPrEvidenceResource(updater);
    };
    const beginPrRequest = (
      lane: string,
      target: RequestReconcileTarget,
      prefix: string
    ): { requestId: string; token: RequestReconcileToken } => {
      const requestId = createPipelineRequestId(prefix);
      return {
        requestId,
        token: requestReconcilerRef.current.begin({
          lane,
          requestId,
          target
        })
      };
    };
    const currentPrTarget = (campaignId: string): RequestReconcileTarget => ({
      sessionId: activeFolderIdRef.current,
      campaignId: activePrCampaignIdRef.current || campaignId
    });
    const saveDraft = async (draft: PrEvidenceCommand & { kind: "saveCampaign" }, successNotice: string) => {
      updateUiState({ isSaving: true });
      updateResource((current) => ({ ...current, notice: "" }));
      try {
        const response = await sendAndSync({
          type: "pr/save-campaign",
          sessionId: draft.target.sessionId,
          draft: draft.draft
        });
        if (response.ok) {
          const active = response.prCampaigns?.[0] || null;
          if (active) {
            setActivePrCampaign(active);
            updateResource((current) => ({
              ...current,
              campaign: prCampaignToDraft(active),
              setupCollapsed: true,
              notice: successNotice
            }));
          }
        } else {
          updateResource((current) => ({ ...current, notice: response.error }));
        }
      } catch (error) {
        updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
      } finally {
        updateUiState({ isSaving: false });
      }
    };
    const generateCriteria = async (campaignName: string, briefText: string) => {
      updateUiState({ isGeneratingCriteria: true });
      updateResource((current) => ({ ...current, notice: "" }));
      const campaignId = prEvidenceResource.campaign.id || "draft";
      const { requestId, token } = beginPrRequest(
        "pr.generateCriteria",
        { sessionId: command.target.sessionId, campaignId },
        "pr-generate-criteria"
      );
      let settled: RequestReconcileDecision | null = null;
      try {
        const response = await sendAndSync({
          type: "pr/generate-criteria",
          requestId,
          campaignName,
          briefText
        });
        settled = settleReconciledResponse(token, currentPrTarget(campaignId));
        if (!settled.accepted) {
          return;
        }
        if (response.ok && response.prCriteria?.length) {
          const nextDraft = {
            ...prEvidenceResource.campaign,
            name: campaignName,
            briefText,
            criteria: normalizePrCriteria(response.prCriteria)
          };
          updateResource((current) => ({ ...current, campaign: nextDraft }));
          if (campaignName.trim()) {
            const {
              requestId: saveRequestId,
              token: saveToken
            } = beginPrRequest(
              "pr.saveGeneratedCriteria",
              { sessionId: command.target.sessionId, campaignId },
              "pr-save-generated-criteria"
            );
            const saveResponse = await sendAndSync({
              type: "pr/save-campaign",
              requestId: saveRequestId,
              sessionId: command.target.sessionId,
              draft: {
                ...(nextDraft.id ? { id: nextDraft.id } : {}),
                name: nextDraft.name.trim(),
                briefText: nextDraft.briefText,
                criteria: nextDraft.criteria
              }
            });
            const saveSettled = settleReconciledResponse(saveToken, currentPrTarget(campaignId));
            settled = saveSettled;
            if (!saveSettled.accepted) {
              return;
            }
            if (saveResponse.ok) {
              const active = saveResponse.prCampaigns?.[0] || null;
              if (active) {
                setActivePrCampaign(active);
              }
            }
            updateResource((current) => applyPrGeneratedCriteriaSaveResult(current, saveResponse, saveSettled));
          } else {
            updateResource((current) => ({ ...current, notice: "條件已生成。請先填活動名稱，再執行批次判斷。" }));
          }
        } else if (!response.ok) {
          updateResource((current) => ({ ...current, notice: response.error }));
        }
      } catch (error) {
        settled = settleReconciledResponse(token, currentPrTarget(campaignId));
        if (!settled.accepted) {
          return;
        }
        updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
      } finally {
        if (shouldClearPrReconciledLoading(settled)) {
          updateUiState({ isGeneratingCriteria: false });
        }
      }
    };

    switch (command.kind) {
      case "updateDraft":
        updateResource((current) => ({
          ...current,
          campaign: {
            ...current.campaign,
            ...command.draft,
            sessionId: command.target.sessionId
          }
        }));
        return;
      case "setSetupCollapsed":
        updateResource((current) => ({ ...current, setupCollapsed: command.collapsed }));
        return;
      case "setPane":
        updateUiState({ activePane: command.pane });
        return;
      case "saveCampaign":
        await saveDraft(command, "活動已儲存；Collect 現在可以加入 evidence rows。");
        return;
      case "generateCriteria":
        await generateCriteria(command.campaignName, command.briefText);
        return;
      case "requestBriefUpload":
        return;
      case "matchCriteria":
        updateUiState({ isMatching: true });
        updateResource((current) => ({ ...current, notice: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.matchCriteria",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-match-criteria"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({ type: "pr/match-criteria", requestId, campaignId: command.target.campaignId });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            if (response.ok) {
              updateResource((current) => ({ ...current, rows: response.prEvidenceRows ?? [], notice: "條件判斷已更新。" }));
            } else {
              updateResource((current) => ({ ...current, notice: response.error }));
            }
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
            }
          } finally {
            if (settled === null || settled.accepted || settled.reason === "target-mismatch") {
              updateUiState({ isMatching: false });
            }
          }
        }
        return;
      case "fetchAdvancedMetrics":
        updateUiState({ isFetchingAdvancedMetrics: true });
        updateResource((current) => ({ ...current, notice: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.fetchAdvancedMetrics",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-fetch-metrics"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({ type: "pr/fetch-advanced-metrics", requestId, campaignId: command.target.campaignId });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            if (response.ok) {
              const nextRows = response.prEvidenceRows ?? [];
              updateResource((current) => ({
                ...current,
                rows: nextRows,
                notice: summarizeAdvancedMetricsNotice(response.prAdvancedMetricsSummary, nextRows)
              }));
            } else {
              updateResource((current) => ({ ...current, notice: response.error }));
            }
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
            }
          } finally {
            if (settled === null || settled.accepted || settled.reason === "target-mismatch") {
              updateUiState({ isFetchingAdvancedMetrics: false });
            }
          }
        }
        return;
      case "generateSummary":
        updateUiState({ isGeneratingSummary: true });
        updateResource((current) => ({ ...current, notice: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.generateSummary",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-generate-summary"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({ type: "pr/generate-summary", requestId, campaignId: command.target.campaignId });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            const acceptedSettled = settled;
            updateResource((current) => applyPrGenerateSummaryResult(current, response, acceptedSettled));
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
            }
          } finally {
            if (shouldClearPrReconciledLoading(settled)) {
              updateUiState({ isGeneratingSummary: false });
            }
          }
        }
        return;
      case "exportCsv":
      case "exportSummaryMarkdown":
      case "exportSummaryDocx":
        downloadPrFileExport(command.file);
        return;
      default:
        return;
    }
  }, [prEvidenceResource, sendAndSync]);

  const onPrEvidenceBriefFileSelected = useCallback(async (file: File) => {
    const updateUiState = (patch: Partial<PrEvidenceUiState>) => {
      setPrEvidenceUiState((current) => ({ ...current, ...patch }));
    };
    const sessionId = activeFolder?.id || prEvidenceResource.campaign.sessionId || "";
    updateUiState({ isReadingBrief: true });
    setPrEvidenceResource((current) => ({ ...current, uploadError: "" }));
    try {
      const result = await readPrBriefFile(file);
      const nextName = prEvidenceResource.campaign.name.trim() || result.inferredName;
      setPrEvidenceResource((current) => ({
        ...current,
        campaign: {
          ...current.campaign,
          name: nextName,
          briefText: result.text
        },
        notice: `已載入 ${file.name}${result.sourceKind === "pdf" ? " PDF" : ""}，正在用 brief 產生六項條件...`
      }));
      updateUiState({ isReadingBrief: false });
      await onPrEvidenceCommand({
        kind: "generateCriteria",
        target: { sessionId },
        campaignName: nextName,
        briefText: result.text
      });
    } catch (error) {
      setPrEvidenceResource((current) => ({ ...current, uploadError: error instanceof Error ? error.message : String(error) }));
    } finally {
      updateUiState({ isReadingBrief: false });
    }
  }, [activeFolder?.id, onPrEvidenceCommand, prEvidenceResource.campaign]);

  return {
    popupRef,
    snapshot,
    tabId,
    activeFolder,
    activeFolderMode,
    activeItem,
    popupOpen,
    page,
    readInteractionNowMs,
    readWallClockNowMs,
    createContextFileId,
    workspaceState,
    processingSummary,
    flashPreview,
    preview,
    hoverSaved,
    previewSaved,
    readyCompareItems,
    compareItemA,
    compareItemB,
    compareTeaserState,
    compareTeaser,
    showFolderPrompt,
    folderName,
    editingFolderName,
    isRenamingFolder,
    draftBaseUrl,
    draftProvider,
    draftOpenAiKey,
    draftClaudeKey,
    draftGoogleKey,
    draftLayoutPreferences,
    draftProductProfile,
    compiledProductContext,
    storageUsage,
    settingsSaveStatus,
    isSavingSettings,
    productProfileSeedText,
    isInitializingProductProfile,
    hoverRect,
    displayToast,
    optimisticQueuedIds,
    bulkAnalyzingFolderId,
    isStartingProcessing,
    workerStatus,
    backendWorkUiState,
    backendReachability,
    techniqueReadings,
    savedAnalyses,
    productSignalAnalyses,
    historicalProductSignalAnalyses,
    productAgentTaskFeedback,
    signalReadings,
    isHydratingProductSignals,
    isAnalyzingProductSignals,
    productSignalAnalysisError,
    productBackendError,
    productSignalAnalysisNotice,
    productAiProviderReady,
    activePrCampaign,
    prEvidenceResource,
    prEvidenceViewModel,
    topics: topicState.topics,
    signals: topicState.signals,
    selectedTopicId: topicState.selectedTopicId,
    activeTopic: topicState.activeTopic,
    activeTopicSignals: topicState.activeTopicSignals,
    activeTopicPairs: topicState.activeTopicPairs,
    topicLoadState: topicState.topicLoadState,
    topicHydrationError: topicState.topicHydrationError,
    topicAuditByTopicId: topicAuditState.auditByTopicId,
    activeTopicAudit: topicState.activeTopic ? topicAuditState.auditByTopicId[topicState.activeTopic.id] : undefined,
    signalPreviewById: topicState.signalPreviewById,
    signalUrlById: topicState.signalUrlById,
    productSignalEvidenceById: topicState.productSignalEvidenceById,
    productSignalReadinessById: topicState.productSignalReadinessById,
    topicJudgmentById: topicState.topicJudgmentById,
    resultTopicContext: topicState.resultTopicContext,
    selectedCompareA,
    selectedCompareB,
    canPrev,
    canNext,
    resultSurface,
    resultSelection,
    resultItemA,
    resultItemB,
    activeSavedAnalysis,
    canStartJudgment,
    isGeneratingJudgment,
    flashStyle,
    processAllLabel,
    primaryMode,
    compareViewSettings,
    renderMetrics: flashPreviewMetrics,
    setShowFolderPrompt,
    setFolderName,
    setEditingFolderName,
    setIsRenamingFolder,
    setDraftBaseUrl,
    setDraftProvider,
    setDraftOpenAiKey,
    setDraftClaudeKey,
    setDraftGoogleKey,
    onDraftLayoutPreferencesChange,
    setProductProfileSeedText,
    onDraftProductProfileChange,
    setSelectedCompareA,
    setSelectedCompareB,
    onNavigate,
    onSessionModeChange,
    onOpenCompareResult,
    onOpenSavedAnalysis,
    onOpenTopicPair: topicState.onOpenTopicPair,
    onReturnToTopic: topicState.onReturnToTopic,
    onAttachActiveResultToTopic: topicState.onAttachActiveResultToTopic,
    onResetCompareSelection,
    onSavePreview,
    onCreateTopic: topicState.onCreateTopic,
    onSelectTopicTarget: topicState.onSelectTopicTarget,
    onNavigateToTopic: topicState.onNavigateToTopic,
    onBackFromTopicDetail: topicState.onBackFromTopicDetail,
    onUpdateTopic: topicState.onUpdateTopic,
    onGenerateTopicSynthesis: topicState.onGenerateTopicSynthesis,
    topicSignalReadingsBySignalId: topicState.topicSignalReadingsBySignalId,
    signalTagsByItemId: topicState.signalTagsByItemId,
    onGenerateTopicSignalReading: topicState.onGenerateTopicSignalReading,
    onRunTopicAudit: topicAuditState.runTopicAudit,
    onRunTopicAuditP1: topicAuditState.runP1ForSignal,
    topicAuditP1RunningBySignalId: topicAuditState.p1RunningBySignalId,
    topicAuditP1ErrorBySignalId: topicAuditState.p1ErrorBySignalId,
    onOpenAuditReport: topicAuditState.openAuditReport,
    folderSynthesis,
    isGeneratingFolderSynthesis,
    folderSynthesisError,
    folderAnalyzedCount: folderSynthesisCoverage.analyzedCount,
    folderContributingTopicCount: folderSynthesisCoverage.contributingTopicCount,
    onGenerateFolderSynthesis,
    onClearFolderSynthesis,
    onSignalTriaged: topicState.onSignalTriaged,
    onCreateTopicFromSignals: topicState.onCreateTopicFromSignals,
    onSignalDeleted: topicState.onSignalDeleted,
    onSaveJudgmentOverride,
    onInitProductProfile,
    onAnalyzeProductSignals,
    onSynthesizeSignalReading,
    onReviewSignalReading,
    onExportSignalPackets,
    onRemoveProductSignal,
    onPrEvidenceResourceChange,
    onPrEvidenceActiveCampaignChange,
    onPrEvidenceCommand,
    onPrEvidenceBriefFileSelected,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onOpenPopup,
    onTogglePopup,
    onToggleCollectMode,
    openPreview,
    onSaveCurrentAnalysis,
    onStartJudgment,
    moveSelection,
    onQueueItem,
    onQueueItemById,
    onAnalyzeItems,
    onStartProcessing,
    onAddToCompare,
    onProcessAll,
    onSetActiveSession,
    onSelectItem,
    onSaveSettings,
    onClearProductCache
  };
}

export type InPageCollectorAppModel = ReturnType<typeof useInPageCollectorAppState>;
