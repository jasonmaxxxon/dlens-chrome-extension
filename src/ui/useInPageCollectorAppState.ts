import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildDeterministicCompareBrief, type CompareBrief } from "../compare/brief";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import { normalizePostUrl } from "../state/store-helpers";
import type {
  ActiveAnalysisResult,
  ExtensionSnapshot,
  PopupPage,
  SavedAnalysisSnapshot,
  TechniqueReadingSnapshot
} from "../state/types";
import { isDescriptorSavedInFolder } from "../state/ui-state";
import type { ExtensionMessage, ExtensionResponse, StartProcessingResponse, WorkerStatusMessageResponse } from "../state/messages";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { resolveAnalysisResultSurface } from "../state/analysis-result-state";
import {
  advancePopupWorkspaceState,
  getPollingDelayMs,
  resolveInitialPopupMode,
  summarizeSessionProcessing,
  type PopupWorkspaceState,
  type WorkerStatus
} from "../state/processing-state";
import { getActiveItem, getActiveSession, sendExtensionMessage } from "./controller";
import type { CompareSetupTeaser } from "./CompareSetupView";
import { buildCompareBriefRequest } from "./CompareView";
import {
  buildCompareSetupTeaser,
  buildDateRangeLabel,
  buildResultId,
  comparePairKey,
  computeFlashPreviewStyle,
  flashPreviewMetrics,
  HOVER_RECT_EVENT,
  OPTIMISTIC_SAVE_EVENT,
  OPTIMISTIC_SAVE_FAILED_EVENT,
  type HoverRect
} from "./inpage-helpers";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

type UseInPageCollectorAppStateArgs = {
  snapshot: ExtensionSnapshot | null;
  tabId: number | null;
  sendAndSync: SendAndSync;
};

export function useInPageCollectorAppState({ snapshot, tabId, sendAndSync }: UseInPageCollectorAppStateArgs) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const hadReadyPairRef = useRef(false);
  const processingFailureCountRef = useRef(0);

  const [showFolderPrompt, setShowFolderPrompt] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [editingFolderName, setEditingFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [draftBaseUrl, setDraftBaseUrl] = useState("http://127.0.0.1:8000");
  const [draftProvider, setDraftProvider] = useState<"openai" | "claude" | "google" | "">("google");
  const [draftOpenAiKey, setDraftOpenAiKey] = useState("");
  const [draftClaudeKey, setDraftClaudeKey] = useState("");
  const [draftGoogleKey, setDraftGoogleKey] = useState("");
  const [hoverRect, setHoverRect] = useState<HoverRect | null>(null);
  const [displayToast, setDisplayToast] = useState<{ id: string; kind: "saved" | "queued"; message: string } | null>(null);
  const [optimisticSavedUrl, setOptimisticSavedUrl] = useState<string | null>(null);
  const [optimisticQueuedIds, setOptimisticQueuedIds] = useState<string[]>([]);
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [techniqueReadings, setTechniqueReadings] = useState<TechniqueReadingSnapshot[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysisSnapshot[]>([]);
  const [selectedCompareA, setSelectedCompareA] = useState("");
  const [selectedCompareB, setSelectedCompareB] = useState("");
  const [compareTeaserState, setCompareTeaserState] = useState<"idle" | "loading" | "ready">("idle");
  const [compareTeaser, setCompareTeaser] = useState<CompareSetupTeaser | null>(null);

  const activeFolder = useMemo(() => getActiveSession(snapshot), [snapshot]);
  const activeItem = useMemo(() => getActiveItem(snapshot), [snapshot]);
  const popupOpen = Boolean(snapshot?.tab.popupOpen);
  const [workspaceState, setWorkspaceState] = useState<PopupWorkspaceState>(() => ({
    currentMode: popupOpen ? resolveInitialPopupMode(summarizeSessionProcessing(activeFolder?.items || [])) : "library",
    popupOpen,
    modeLocked: popupOpen
  }));
  const page = workspaceState.currentMode;
  const processingSummary = useMemo(
    () => summarizeSessionProcessing(activeFolder?.items || []),
    [activeFolder?.items]
  );
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

  useEffect(() => {
    if (document.getElementById("__dlens_popup_keyframes__")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "__dlens_popup_keyframes__";
    style.textContent = `
      @keyframes dlens-popup-pulse {
        0%, 100% { opacity: 0.55; transform: scale(0.92); }
        50% { opacity: 1; transform: scale(1); }
      }
      @keyframes dlens-popup-shimmer {
        0% { background-position: 200% 50%; }
        100% { background-position: -200% 50%; }
      }
      @keyframes dlens-popup-indeterminate {
        0% { transform: translateX(-115%); }
        100% { transform: translateX(240%); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  useLayoutEffect(() => {
    setWorkspaceState((currentState) => advancePopupWorkspaceState(processingSummary, currentState, popupOpen));
  }, [popupOpen, processingSummary]);

  useEffect(() => {
    if (!snapshot?.tab.popupPage) {
      return;
    }
    setWorkspaceState((currentState) =>
      currentState.currentMode === snapshot.tab.popupPage && currentState.popupOpen === popupOpen
        ? currentState
        : {
            currentMode: snapshot.tab.popupPage,
            popupOpen,
            modeLocked: popupOpen
          }
    );
  }, [snapshot?.tab.popupPage, popupOpen]);

  useEffect(() => {
    const draft = snapshot?.tab.activeCompareDraft;
    if (draft?.itemAId && draft?.itemBId) {
      setSelectedCompareA(draft.itemAId);
      setSelectedCompareB(draft.itemBId);
      return;
    }
    const first = readyCompareItems[0]?.id || "";
    const second = readyCompareItems.find((item) => item.id !== first)?.id || "";
    setSelectedCompareA(first);
    setSelectedCompareB(second);
  }, [snapshot?.tab.activeCompareDraft?.itemAId, snapshot?.tab.activeCompareDraft?.itemBId, readyCompareItems]);

  useEffect(() => {
    if (snapshot?.global.settings.ingestBaseUrl) {
      setDraftBaseUrl(snapshot.global.settings.ingestBaseUrl);
    }
    setDraftProvider(snapshot?.global.settings.oneLinerProvider || "");
    setDraftOpenAiKey(snapshot?.global.settings.openaiApiKey || "");
    setDraftClaudeKey(snapshot?.global.settings.claudeApiKey || "");
    setDraftGoogleKey(snapshot?.global.settings.googleApiKey || "");
  }, [
    snapshot?.global.settings.ingestBaseUrl,
    snapshot?.global.settings.oneLinerProvider,
    snapshot?.global.settings.openaiApiKey,
    snapshot?.global.settings.claudeApiKey,
    snapshot?.global.settings.googleApiKey
  ]);

  useEffect(() => {
    if (!snapshot?.tab.popupOpen) {
      setWorkerStatus(null);
      processingFailureCountRef.current = 0;
      return;
    }

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let lastKnownWorkerStatus: WorkerStatus = workerStatus ?? "idle";

    async function runCoordinator() {
      try {
        const workerResponse = await sendExtensionMessage<WorkerStatusMessageResponse>({ type: "worker/get-status" });
        if (!workerResponse.ok) {
          throw new Error(workerResponse.error);
        }
        if (cancelled) {
          return;
        }
        const nextWorkerStatus = workerResponse.workerStatus;
        lastKnownWorkerStatus = nextWorkerStatus;
        setWorkerStatus(nextWorkerStatus);
        if (processingSummary.hasInflight) {
          await sendAndSync({ type: "session/refresh-all", sessionId: activeFolder?.id });
        }
        if (cancelled) {
          return;
        }
        processingFailureCountRef.current = 0;
        const nextDelay = getPollingDelayMs({
          workerStatus: nextWorkerStatus,
          hasInflight: processingSummary.hasInflight,
          failureCount: 0
        });
        if (nextDelay != null) {
          timeoutHandle = window.setTimeout(() => {
            void runCoordinator();
          }, nextDelay);
        }
      } catch (error) {
        console.error("failed to coordinate processing state", error);
        if (cancelled) {
          return;
        }
        setWorkerStatus((current) => current);
        processingFailureCountRef.current += 1;
        const nextDelay = getPollingDelayMs({
          workerStatus: lastKnownWorkerStatus,
          hasInflight: processingSummary.hasInflight,
          failureCount: processingFailureCountRef.current
        });
        if (nextDelay != null) {
          timeoutHandle = window.setTimeout(() => {
            void runCoordinator();
          }, nextDelay);
        }
      }
    }

    void runCoordinator();
    return () => {
      cancelled = true;
      if (timeoutHandle != null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [snapshot?.tab.popupOpen, activeFolder?.id, processingSummary.hasInflight, sendAndSync, workerStatus]);

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

  const compareItemA = readyCompareItems.find((item) => item.id === selectedCompareA) || null;
  const compareItemB = readyCompareItems.find((item) => item.id === selectedCompareB && item.id !== selectedCompareA) || null;

  useEffect(() => {
    if (page !== "compare") {
      return;
    }
    if (!compareItemA || !compareItemB) {
      setCompareTeaser(null);
      setCompareTeaserState("idle");
      void sendExtensionMessage<ExtensionResponse>({
        type: "compare/set-active-draft",
        draft: null
      }).catch(() => undefined);
      return;
    }

    const request = buildCompareBriefRequest(compareItemA, compareItemB);
    if (!request) {
      setCompareTeaser(null);
      setCompareTeaserState("idle");
      return;
    }

    const teaserId = comparePairKey(compareItemA.id, compareItemB.id);
    const totalComments = request.left.sourceCommentCount + request.right.sourceCommentCount;
    const groupCount = request.left.clusters.length + request.right.clusters.length;
    const dateRangeLabel = buildDateRangeLabel(compareItemA.descriptor.time_token_hint, compareItemB.descriptor.time_token_hint);

    setCompareTeaserState("loading");
    void sendExtensionMessage<ExtensionResponse>({
      type: "compare/set-active-draft",
      draft: {
        itemAId: compareItemA.id,
        itemBId: compareItemB.id,
        teaserState: "loading",
        teaserId
      }
    }).catch(() => undefined);

    let cancelled = false;
    void sendExtensionMessage<{ ok: true; compareBrief?: CompareBrief | null } | { ok: false; error: string }>({
      type: "compare/get-brief",
      request
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const fallbackBrief = buildDeterministicCompareBrief(request);
        const brief = response.ok && response.compareBrief ? response.compareBrief : fallbackBrief;
        setCompareTeaser(buildCompareSetupTeaser(brief, totalComments, groupCount, dateRangeLabel));
        setCompareTeaserState("ready");
        void sendExtensionMessage<ExtensionResponse>({
          type: "compare/set-active-draft",
          draft: {
            itemAId: compareItemA.id,
            itemBId: compareItemB.id,
            teaserState: "ready",
            teaserId
          }
        }).catch(() => undefined);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        const fallbackBrief = buildDeterministicCompareBrief(request);
        setCompareTeaser(buildCompareSetupTeaser(fallbackBrief, totalComments, groupCount, dateRangeLabel));
        setCompareTeaserState("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [
    page,
    compareItemA?.id,
    compareItemB?.id,
    snapshot?.global.settings.oneLinerProvider,
    snapshot?.global.settings.openaiApiKey,
    snapshot?.global.settings.claudeApiKey,
    snapshot?.global.settings.googleApiKey
  ]);

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
    setDisplayToast({ id: toast.id, kind: toast.kind, message: toast.message });
  }, [snapshot?.tab.lastSavedToast]);

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
          message: `Saved to ${activeFolder.name}`
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
  }, [activeFolder?.name]);

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
  const resultSurface = useMemo(
    () => resolveAnalysisResultSurface({
      activeResult: snapshot?.tab.activeAnalysisResult ?? null,
      savedAnalyses
    }),
    [snapshot?.tab.activeAnalysisResult, savedAnalyses]
  );
  const resultSelection = resultSurface.mode === "active"
    ? resultSurface.activeResult
    : resultSurface.savedAnalysis
      ? {
          resultId: resultSurface.savedAnalysis.resultId,
          compareKey: resultSurface.savedAnalysis.compareKey,
          itemAId: resultSurface.savedAnalysis.itemAId,
          itemBId: resultSurface.savedAnalysis.itemBId,
          saved: true,
          viewedAt: resultSurface.savedAnalysis.savedAt
        }
      : null;
  const resultItemA = resultSelection && activeFolder
    ? activeFolder.items.find((item) => item.id === resultSelection.itemAId) || null
    : null;
  const resultItemB = resultSelection && activeFolder
    ? activeFolder.items.find((item) => item.id === resultSelection.itemBId) || null
    : null;
  const flashStyle = computeFlashPreviewStyle(hoverRect);
  const processAllLabel =
    workerStatus === "draining"
      ? "Processing..."
      : isStartingProcessing
        ? "Starting..."
        : "Process All";
  const primaryMode = page === "settings" ? null : page;

  async function onNavigate(pageValue: PopupPage) {
    setWorkspaceState((currentState) => ({
      ...currentState,
      currentMode: pageValue,
      popupOpen: true,
      modeLocked: true
    }));
    await sendAndSync({ type: "popup/navigate-active-tab", page: pageValue });
  }

  async function onOpenCompareResult() {
    if (!compareItemA || !compareItemB || compareTeaserState !== "ready") {
      return;
    }
    const result: ActiveAnalysisResult = {
      resultId: buildResultId(compareItemA.id, compareItemB.id),
      compareKey: comparePairKey(compareItemA.id, compareItemB.id),
      itemAId: compareItemA.id,
      itemBId: compareItemB.id,
      saved: false,
      viewedAt: new Date().toISOString()
    };
    setWorkspaceState((currentState) => ({
      ...currentState,
      currentMode: "result",
      popupOpen: true,
      modeLocked: true
    }));
    await sendAndSync({
      type: "compare/set-active-result",
      result
    });
  }

  function onResetCompareSelection() {
    const first = readyCompareItems[0]?.id || "";
    const second = readyCompareItems.find((item) => item.id !== first)?.id || "";
    setSelectedCompareA(first);
    setSelectedCompareB(second);
  }

  async function onSavePreview() {
    const normalized = normalizePostUrl(preview?.post_url || "");
    if (normalized) {
      setOptimisticSavedUrl(normalized);
      if (activeFolder?.name) {
        setDisplayToast({
          id: `saved-${Date.now()}`,
          kind: "saved",
          message: `Saved to ${activeFolder.name}`
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

  async function onSaveCurrentAnalysis() {
    if (!resultSelection || !compareTeaser || !activeFolder) {
      return;
    }
    const snapshotToSave: SavedAnalysisSnapshot = {
      resultId: resultSelection.resultId,
      compareKey: resultSelection.compareKey,
      itemAId: resultSelection.itemAId,
      itemBId: resultSelection.itemBId,
      sourceLabelA: resultItemA?.descriptor.author_hint ? `@${resultItemA.descriptor.author_hint}` : "@unknown",
      sourceLabelB: resultItemB?.descriptor.author_hint ? `@${resultItemB.descriptor.author_hint}` : "@unknown",
      headline: compareTeaser.headline,
      deck: compareTeaser.deck,
      primaryTensionSummary: compareTeaser.deck,
      groupSummary: compareTeaser.metadataLabel,
      totalComments: (resultItemA?.latestCapture?.analysis?.source_comment_count ?? 0) + (resultItemB?.latestCapture?.analysis?.source_comment_count ?? 0),
      dateRangeLabel: buildDateRangeLabel(resultItemA?.descriptor.time_token_hint, resultItemB?.descriptor.time_token_hint),
      savedAt: new Date().toISOString(),
      analysisVersion: "v1",
      briefVersion: "v5",
      briefSource: compareTeaser.metadataLabel.includes("fallback") ? "fallback" : "ai"
    };
    const response = await sendAndSync({
      type: "compare/save-analysis",
      snapshot: snapshotToSave
    });
    if (response.ok) {
      setSavedAnalyses(response.savedAnalyses ?? savedAnalyses);
    }
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
    setOptimisticQueuedIds((current) => Array.from(new Set([...current, activeItem.id])));
    setDisplayToast({
      id: `queued-${Date.now()}`,
      kind: "queued",
      message: `Queued from ${activeFolder.name}`
    });
    const response = await sendAndSync({
      type: "session/queue-item",
      sessionId: activeFolder.id,
      itemId: activeItem.id
    });
    setOptimisticQueuedIds((current) => current.filter((id) => id !== activeItem.id));
    if (!response.ok) {
      setDisplayToast({
        id: `queue-failed-${Date.now()}`,
        kind: "queued",
        message: "Queue failed"
      });
    }
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

  const compareViewSettings = snapshot?.global.settings || {
    ingestBaseUrl: draftBaseUrl,
    oneLinerProvider: "google" as const,
    openaiApiKey: "",
    claudeApiKey: "",
    googleApiKey: ""
  };

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

  async function onSaveSettings() {
    await sendAndSync({
      type: "settings/set-ingest-base-url",
      value: draftBaseUrl
    });
    await sendAndSync({
      type: "settings/set-one-liner-config",
      provider: draftProvider || null,
      openaiApiKey: draftOpenAiKey,
      claudeApiKey: draftClaudeKey,
      googleApiKey: draftGoogleKey
    });
  }

  return {
    popupRef,
    snapshot,
    tabId,
    activeFolder,
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
    hoverRect,
    displayToast,
    optimisticQueuedIds,
    isStartingProcessing,
    workerStatus,
    techniqueReadings,
    savedAnalyses,
    selectedCompareA,
    selectedCompareB,
    canPrev,
    canNext,
    resultSurface,
    resultSelection,
    resultItemA,
    resultItemB,
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
    setSelectedCompareA,
    setSelectedCompareB,
    onNavigate,
    onOpenCompareResult,
    onResetCompareSelection,
    onSavePreview,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onOpenPopup,
    onTogglePopup,
    onToggleCollectMode,
    openPreview,
    onSaveCurrentAnalysis,
    moveSelection,
    onQueueItem,
    onProcessAll,
    onSetActiveSession,
    onSelectItem,
    onSaveSettings
  };
}

export type InPageCollectorAppModel = ReturnType<typeof useInPageCollectorAppState>;
