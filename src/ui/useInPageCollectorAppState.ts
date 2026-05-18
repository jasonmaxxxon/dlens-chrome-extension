import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import { DEFAULT_SESSION_NAME_BY_MODE, normalizePostUrl } from "../state/store-helpers";
import {
  createDefaultLayoutPreferences,
  createDefaultSettings,
  type ExtensionSnapshot,
  type FolderMode,
  type FolderSynthesis,
  type LayoutPreferences,
  type ProductContext,
  type ProductAgentTaskFeedback,
  type ProductSignalAnalysis,
  type SavedAnalysisSnapshot,
  type TechniqueReadingSnapshot,
} from "../state/types";
import { isDescriptorSavedInFolder } from "../state/ui-state";
import type { ExtensionMessage, ExtensionResponse, StartProcessingResponse } from "../state/messages";
import type { SignalReading } from "../compare/signal-reading-storage";
import type { PrCampaign } from "../state/pr-evidence-storage";
import { getProcessingFailureMessage } from "../state/processing-errors";
import {
  getItemReadinessStatus,
  guardPage,
  isProductSignalPage as isProductSignalWorkspacePage,
  summarizeSessionProcessing,
  type WorkerStatus
} from "../state/processing-state";
import { addRuntimeMessageListener, getActiveItem, getActiveSession, sendExtensionMessage } from "./controller";
import {
  computeFlashPreviewStyle,
  flashPreviewMetrics,
  HOVER_RECT_EVENT,
  OPTIMISTIC_SAVE_EVENT,
  OPTIMISTIC_SAVE_FAILED_EVENT,
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
import { useTopicState } from "./useTopicState";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

type UseInPageCollectorAppStateArgs = {
  snapshot: ExtensionSnapshot | null;
  tabId: number | null;
  sendAndSync: SendAndSync;
};

export function resolveEffectivePopupPage(page: ExtensionSnapshot["tab"]["popupPage"], activeFolderMode: FolderMode) {
  if (page === "settings" || page === "result") {
    return page;
  }
  return guardPage(page, activeFolderMode);
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
  const queueResp = await sendAndSync({
    type: "session/queue-items",
    sessionId: folderId,
    itemIds
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

  const startResp = await sendAndSync<StartProcessingResponse>({ type: "worker/start-processing" });
  if (startResp.ok) {
    setWorkerStatus("draining");
    setDisplayToast({
      id: `bulk-analyze-${Date.now()}`,
      kind: "queued",
      message: failedCount
        ? `開始分析 ${queuedCount} 篇（${failedCount} 篇失敗）`
        : `開始分析 ${queuedCount} 篇`
    });
    await sendAndSync({ type: "session/refresh-all", sessionId: folderId });
    return { ok: true, failedCount };
  }

  setDisplayToast({
    id: `bulk-analyze-failed-${Date.now()}`,
    kind: "queued",
    message: getProcessingFailureMessage(startResp.error)
  });
  return { ok: false, failedCount };
}

export function useInPageCollectorAppState({ snapshot, tabId, sendAndSync }: UseInPageCollectorAppStateArgs) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const hadReadyPairRef = useRef(false);
  const refreshedOnOpenFolderRef = useRef<string | null>(null);
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
  const [activePrCampaign, setActivePrCampaign] = useState<PrCampaign | null>(null);
  const [folderSynthesis, setFolderSynthesis] = useState<FolderSynthesis | null>(null);
  const [isGeneratingFolderSynthesis, setIsGeneratingFolderSynthesis] = useState(false);
  const [folderSynthesisError, setFolderSynthesisError] = useState<string | null>(null);
  const [isAnalyzingProductSignals, setIsAnalyzingProductSignals] = useState(false);
  const [productSignalAnalysisError, setProductSignalAnalysisError] = useState<string | null>(null);
  const [productSignalAnalysisNotice, setProductSignalAnalysisNotice] = useState<string | null>(null);
  const [compiledProductContext, setCompiledProductContext] = useState<ProductContext | null>(null);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const activeFolder = useMemo(() => getActiveSession(snapshot), [snapshot]);
  const activeItem = useMemo(() => getActiveItem(snapshot), [snapshot]);
  const activeFolderMode: FolderMode = activeFolder?.mode ?? "archive";
  const popupOpen = Boolean(snapshot?.tab.popupOpen);
  const processingSummary = useMemo(
    () => summarizeSessionProcessing(activeFolder?.items || []),
    [activeFolder?.items]
  );
  const { workerStatus, setWorkerStatus } = useProcessingCoordinator({
    popupOpen,
    activeFolderId: activeFolder?.id,
    hasInflight: processingSummary.hasInflight,
    sendAndSync
  });
  const {
    workspaceState,
    setWorkspaceState,
    page: rawPage,
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
      (settings.oneLinerProvider === "google" && settings.googleApiKey.trim())
      || (settings.oneLinerProvider === "openai" && settings.openaiApiKey.trim())
      || (settings.oneLinerProvider === "claude" && settings.claudeApiKey.trim())
    );
  }, [
    snapshot?.global.settings.oneLinerProvider,
    snapshot?.global.settings.googleApiKey,
    snapshot?.global.settings.openaiApiKey,
    snapshot?.global.settings.claudeApiKey
  ]);

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
    void sendAndSync({ type: "session/refresh-all", sessionId: folderId }).catch((error: unknown) => {
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
    stateUpdatedAt: snapshot?.global.updatedAt,
    sendAndSync,
    onNavigate,
    onOpenSavedAnalysis: openSavedAnalysisBase
  });
  const savedToastMessage = useCallback((folderName: string): string => {
    if (activeFolderMode === "pr-evidence") {
      return "已加入 PR evidence";
    }
    if (activeFolderMode === "topic") {
      return "已加入主題";
    }
    return activeFolderMode === "product" ? "已加入產品訊號" : `Saved to ${folderName}`;
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
      return;
    }
    void sendExtensionMessage<{ ok: true; prCampaigns?: PrCampaign[] } | { ok: false; error: string }>({
      type: "pr/list-campaigns",
      sessionId: activeFolder.id
    })
      .then((response) => {
        if (!cancelled) {
          setActivePrCampaign(response.ok ? response.prCampaigns?.[0] ?? null : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActivePrCampaign(null);
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

  const isProductSignalPage = isProductSignalWorkspacePage(page);

  useEffect(() => {
    if (!popupOpen || !activeFolder?.id || activeFolderMode !== "product" || !isProductSignalPage) {
      return;
    }
    let cancelled = false;
    const signalIds = topicState.signals.map((signal) => signal.id);
    void Promise.all([
      sendExtensionMessage<{ ok: true; productSignalAnalyses?: ProductSignalAnalysis[] } | { ok: false; error: string }>({
        type: "product/list-signal-analyses",
        signalIds
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
        if (cancelled) {
          return;
        }
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
          const scopedSignalIds = new Set(signalIds);
          setSignalReadings((readingsResponse.signalReadings ?? []).filter((reading) => scopedSignalIds.has(reading.signalId)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProductSignalAnalyses([]);
          setHistoricalProductSignalAnalyses([]);
          setProductAgentTaskFeedback([]);
          setSignalReadings([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeFolder?.id,
    activeFolderMode,
    isProductSignalPage,
    popupOpen,
    snapshot?.global.updatedAt,
    snapshot?.tab.updatedAt,
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
      if (activeFolder?.name) {
        setDisplayToast({
          id: `saved-${Date.now()}`,
          kind: "saved",
          message: savedToastMessage(activeFolder.name)
        });
      }
    };
    const onOptimisticFailure = (event: Event) => {
      const failedUrl = normalizePostUrl(String((event as CustomEvent<string>).detail || ""));
      setOptimisticSavedUrl((current) => (current === failedUrl ? null : current));
    };
    window.addEventListener(OPTIMISTIC_SAVE_EVENT, onOptimisticSave as EventListener);
    window.addEventListener(OPTIMISTIC_SAVE_FAILED_EVENT, onOptimisticFailure as EventListener);
    return () => {
      window.removeEventListener(OPTIMISTIC_SAVE_EVENT, onOptimisticSave as EventListener);
      window.removeEventListener(OPTIMISTIC_SAVE_FAILED_EVENT, onOptimisticFailure as EventListener);
    };
  }, [activeFolder?.name, savedToastMessage]);

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
        void sendAndSync({ type: "session/save-current-preview" });
      }

      if (event.key.toLowerCase() === "o" && snapshot.tab.currentPreview?.post_url) {
        event.preventDefault();
        window.open(snapshot.tab.currentPreview.post_url, "_blank", "noopener,noreferrer");
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [sendAndSync, snapshot?.tab.selectionMode, snapshot?.tab.currentPreview?.post_url]);

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
    const response = await sendAndSync({ type: "session/save-current-preview" });
    if (!response.ok && normalized) {
      setOptimisticSavedUrl((current) => (current === normalized ? null : current));
    }
  }

  async function onCreateFolder(saveCurrentPreview = false) {
    if (!folderName.trim()) {
      return;
    }
    await sendAndSync({
      type: "session/create",
      name: folderName.trim(),
      saveCurrentPreview
    });
    setFolderName("");
    setShowFolderPrompt(false);
  }

  async function onSessionModeChange(mode: FolderMode) {
    if (activeFolder) {
      await topicState.onSessionModeChange(mode);
      return;
    }

    await sendAndSync({
      type: "session/create",
      name: DEFAULT_SESSION_NAME_BY_MODE[mode],
      mode
    });
    setShowFolderPrompt(false);
    setFolderName("");
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
    await sendAndSync({
      type: snapshot?.tab.selectionMode ? "selection/cancel-active-tab" : "selection/start-active-tab"
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
      message: `Queued from ${activeFolder.name}`
    });
    const response = await sendAndSync({
      type: "session/queue-item",
      sessionId: activeFolder.id,
      itemId
    });
    setOptimisticQueuedIds((current) => current.filter((id) => id !== itemId));
    if (!response.ok) {
      setDisplayToast({
        id: `queue-failed-${Date.now()}`,
        kind: "queued",
        message: "Queue failed"
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
        const queueResponse = await sendAndSync({
          type: "session/queue-all-pending",
          sessionId: activeFolder.id
        });
        setOptimisticQueuedIds((current) => current.filter((id) => !pendingIds.includes(id)));
        if (!queueResponse.ok) {
          setDisplayToast({
            id: `queue-all-failed-${Date.now()}`,
            kind: "queued",
            message: "Queue failed"
          });
          return;
        }
      }
      const response = await sendAndSync<StartProcessingResponse>({ type: "worker/start-processing" });
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
        await sendAndSync({ type: "session/refresh-all", sessionId: activeFolder?.id });
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
    setIsGeneratingFolderSynthesis(true);
    setFolderSynthesisError(null);
    try {
      const response = await sendAndSync({
        type: "folder/synthesis/generate",
        sessionId: activeFolder.id
      });
      if (response.ok) {
        setFolderSynthesis(response.folderSynthesis ?? null);
      } else {
        setFolderSynthesisError(response.error || "合成失敗");
      }
    } catch (error) {
      setFolderSynthesisError(error instanceof Error ? error.message : "合成失敗");
    } finally {
      setIsGeneratingFolderSynthesis(false);
    }
  }

  async function onClearFolderSynthesis() {
    if (!activeFolder?.id) return;
    setFolderSynthesisError(null);
    try {
      const response = await sendAndSync({
        type: "folder/synthesis/clear",
        sessionId: activeFolder.id
      });
      if (response.ok) {
        setFolderSynthesis(null);
      }
    } catch (error) {
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
    try {
      const response = await sendAndSync<{ ok: true; productSignalAnalyses?: ProductSignalAnalysis[]; productSignalAnalysisSummary?: { queued: number; analyzed: number; failed: number } } | { ok: false; error: string }>({
        type: "product/analyze-signals",
        sessionId: activeFolder.id
      });
      if (response.ok) {
        setProductSignalAnalyses(response.productSignalAnalyses ?? []);
        setHistoricalProductSignalAnalyses((previous) => mergeAnalysesBySignalId(previous, response.productSignalAnalyses ?? []));
        const queued = response.productSignalAnalysisSummary?.queued ?? 0;
        const analyzed = response.productSignalAnalysisSummary?.analyzed ?? 0;
        const failed = response.productSignalAnalysisSummary?.failed ?? 0;
        if (queued > 0) {
          setProductSignalAnalysisNotice(`已送出 ${queued} 條抓取，完成後請再按分析。`);
        } else if (failed > 0) {
          setProductSignalAnalysisError(`有 ${failed} 條產品訊號分析失敗；其他 ready signals 已繼續處理。`);
        } else if (analyzed > 0) {
          setProductSignalAnalysisNotice(`已完成 ${analyzed} 條產品訊號分析。`);
        } else {
          setProductSignalAnalysisNotice("沒有新的 ready signal 可分析。");
        }
        return;
      }
      setProductSignalAnalysisError(response.error);
    } catch (error) {
      setProductSignalAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAnalyzingProductSignals(false);
    }
  }

  async function onSynthesizeSignalReading(
    signalId: string,
    sessionId: string,
    force?: boolean
  ): Promise<{ ok: true; reading: string } | { ok: false; error: string }> {
    try {
      const response = await sendAndSync({
        type: "product/synthesize-signal-reading",
        signalId,
        sessionId,
        force
      });
      if (response.ok) {
        if (response.signalReading) {
          setSignalReadings((previous) => upsertSignalReading(previous, response.signalReading!));
          return { ok: true, reading: response.signalReading.reading };
        }
        return { ok: false, error: "沒有產生判讀。" };
      }
      return { ok: false, error: response.error };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function onReviewSignalReading(
    cacheKey: string,
    decision: "filed" | "deferred" | "rejected",
    note?: string
  ): Promise<{ ok: true; signalReading: SignalReading } | { ok: false; error: string }> {
    try {
      const response = await sendAndSync({
        type: "product/review-signal-reading",
        cacheKey,
        decision,
        ...(note ? { note } : {})
      });
      if (response.ok) {
        if (response.signalReading) {
          setSignalReadings((previous) => upsertSignalReading(previous, response.signalReading!));
          return { ok: true, signalReading: response.signalReading };
        }
        return { ok: false, error: "找不到這筆判讀。" };
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
    setProductSignalAnalysisError(response.error);
  }

  return {
    popupRef,
    snapshot,
    tabId,
    activeFolder,
    activeFolderMode,
    activeItem,
    popupOpen,
    page,
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
    techniqueReadings,
    savedAnalyses,
    productSignalAnalyses,
    historicalProductSignalAnalyses,
    productAgentTaskFeedback,
    signalReadings,
    isAnalyzingProductSignals,
    productSignalAnalysisError,
    productSignalAnalysisNotice,
    productAiProviderReady,
    activePrCampaign,
    topics: topicState.topics,
    signals: topicState.signals,
    selectedTopicId: topicState.selectedTopicId,
    activeTopic: topicState.activeTopic,
    activeTopicSignals: topicState.activeTopicSignals,
    activeTopicPairs: topicState.activeTopicPairs,
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
    onNavigateToTopic: topicState.onNavigateToTopic,
    onBackFromTopicDetail: topicState.onBackFromTopicDetail,
    onUpdateTopic: topicState.onUpdateTopic,
    onGenerateTopicSynthesis: topicState.onGenerateTopicSynthesis,
    folderSynthesis,
    isGeneratingFolderSynthesis,
    folderSynthesisError,
    folderAnalyzedCount: folderSynthesisCoverage.analyzedCount,
    folderContributingTopicCount: folderSynthesisCoverage.contributingTopicCount,
    onGenerateFolderSynthesis,
    onClearFolderSynthesis,
    onSignalTriaged: topicState.onSignalTriaged,
    onSignalDeleted: topicState.onSignalDeleted,
    onSaveJudgmentOverride,
    onInitProductProfile,
    onAnalyzeProductSignals,
    onSynthesizeSignalReading,
    onReviewSignalReading,
    onRemoveProductSignal,
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
    onAddToCompare,
    onProcessAll,
    onSetActiveSession,
    onSelectItem,
    onSaveSettings
  };
}

export type InPageCollectorAppModel = ReturnType<typeof useInPageCollectorAppState>;
