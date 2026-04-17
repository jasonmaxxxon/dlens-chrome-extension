import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type {
  ActiveAnalysisResult,
  PopupPage,
  SavedAnalysisSnapshot,
  TechniqueReadingSnapshot
} from "../state/types";
import { isDescriptorSavedInFolder } from "../state/ui-state";
import type { ExtensionResponse, StartProcessingResponse, WorkerStatusMessageResponse } from "../state/messages";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { resolveAnalysisResultSurface } from "../state/analysis-result-state";
import {
  advancePopupWorkspaceState,
  DEFAULT_POPUP_WIDTH,
  EXPANDED_COMPARE_POPUP_WIDTH,
  getPollingDelayMs,
  resolveInitialPopupMode,
  summarizeSessionProcessing,
  type PopupWorkspaceState,
  type WorkerStatus
} from "../state/processing-state";
import { getActiveItem, getActiveSession, sendExtensionMessage, useExtensionSnapshot } from "./controller";
import { normalizePostUrl } from "../state/store-helpers";
import { buildDeterministicCompareBrief, type CompareBrief } from "../compare/brief";
import { CompareSetupView, type CompareSetupTeaser } from "./CompareSetupView";
import { CompareView, buildCompareBriefRequest } from "./CompareView";
import { CollectView } from "./CollectView";
import {
  IconButton,
  MetricChip,
  ModeRail,
  PreviewCard,
  PrimaryButton,
  SecondaryButton,
  TOKENS,
  UtilityEdge,
  WorkspaceShell,
  WorkspaceSurface,
  formatElapsed,
  lineClamp,
  processingTone,
  statusTheme,
  surfaceCardStyle
} from "./components";
import { tokens } from "./tokens";
import { LibraryView } from "./LibraryView";
import { ProcessingStrip } from "./ProcessingStrip";
import { SettingsView } from "./SettingsView";

const HOVER_RECT_EVENT = "dlens:hover-rect";
const OPTIMISTIC_SAVE_EVENT = "dlens:optimistic-save";
const OPTIMISTIC_SAVE_FAILED_EVENT = "dlens:optimistic-save-failed";

type HoverRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

function computeFlashPreviewStyle(rect: HoverRect | null): CSSProperties | null {
  if (!rect) {
    return null;
  }
  const width = 248;
  const gap = 14;
  const left = rect.right + width + gap < window.innerWidth ? rect.right + gap : Math.max(16, rect.left - width - gap);
  const top = Math.max(16, Math.min(rect.top, window.innerHeight - 220));
  return {
    position: "fixed",
    left,
    top,
    width,
    zIndex: 2147483646
  };
}

function flashPreviewMetrics(descriptor: TargetDescriptor | null | undefined) {
  if (!descriptor) {
    return [];
  }
  return [
    <MetricChip key="likes" kind="likes" value={descriptor.engagement.likes} present={descriptor.engagement_present.likes} />,
    <MetricChip
      key="comments"
      kind="comments"
      value={descriptor.engagement.comments}
      present={descriptor.engagement_present.comments}
    />,
    <MetricChip
      key="reposts"
      kind="reposts"
      value={descriptor.engagement.reposts}
      present={descriptor.engagement_present.reposts}
    />,
    <MetricChip
      key="forwards"
      kind="forwards"
      value={descriptor.engagement.forwards}
      present={descriptor.engagement_present.forwards}
    />
  ];
}

function flashPreviewAvatar(author: string | null | undefined) {
  const cleaned = (author || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "D";
}

function comparePairKey(itemAId: string, itemBId: string): string {
  return `${itemAId}::${itemBId}`;
}

function buildResultId(itemAId: string, itemBId: string): string {
  return `result_${comparePairKey(itemAId, itemBId)}_${Date.now().toString(36)}`;
}

function buildDateRangeLabel(leftHint: string | null | undefined, rightHint: string | null | undefined): string {
  const left = (leftHint || "").trim();
  const right = (rightHint || "").trim();
  if (left && right) {
    return `${left}–${right}`;
  }
  return left || right || "recent";
}

function buildCompareSetupTeaser(
  brief: CompareBrief,
  totalComments: number,
  groupCount: number,
  dateRangeLabel: string
): CompareSetupTeaser {
  return {
    headline: brief.headline,
    deck: brief.whyItMatters || brief.creatorCue,
    metadataLabel: `${totalComments} 則留言 · ${dateRangeLabel} · ${groupCount} 群組${brief.source === "fallback" ? " · fallback" : ""}`
  };
}

export function InPageCollectorApp() {
  const { snapshot, tabId, sendAndSync } = useExtensionSnapshot(false);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const hadReadyPairRef = useRef(false);
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
  const processingFailureCountRef = useRef(0);

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

  const compareItemA = readyCompareItems.find((item) => item.id === selectedCompareA) || null;
  const compareItemB = readyCompareItems.find((item) => item.id === selectedCompareB && item.id !== selectedCompareA) || null;

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
  }, [snapshot?.tab.popupOpen, activeFolder?.id, processingSummary.hasInflight]);

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
  }, [page, compareItemA?.id, compareItemB?.id, snapshot?.global.settings.oneLinerProvider, snapshot?.global.settings.openaiApiKey, snapshot?.global.settings.claudeApiKey, snapshot?.global.settings.googleApiKey]);

  // Clear optimistic saved state when folder changes
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
  }, [snapshot?.tab.popupOpen, snapshot?.tab.selectionMode, tabId]);

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
  }, [snapshot?.tab.selectionMode, snapshot?.tab.currentPreview?.post_url]);

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

  const flashStyle = computeFlashPreviewStyle(hoverRect);
  const processAllLabel =
    workerStatus === "draining"
      ? "Processing..."
      : isStartingProcessing
        ? "Starting..."
        : "Process All";
  const primaryMode = page === "settings" ? null : page;

  return (
    <>
      <button
        id="__dlens_extension_v0_launcher__"
        data-dlens-control="true"
        aria-label={snapshot?.tab.popupOpen ? "Close DLens popup" : "Open DLens popup"}
        onClick={() => {
          if (snapshot?.tab.popupOpen && tabId) {
            void sendAndSync({ type: "popup/close-tab", tabId });
            return;
          }
          void onOpenPopup();
        }}
        style={{
          position: "fixed",
          right: 24,
          top: 24,
          width: 48,
          height: 48,
          borderRadius: 16,
          border: `1px solid ${TOKENS.glassBorder}`,
          background: snapshot?.tab.popupOpen
            ? `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.accentMid})`
            : TOKENS.glassBg,
          backdropFilter: TOKENS.glassBlur,
          WebkitBackdropFilter: TOKENS.glassBlur,
          boxShadow: snapshot?.tab.popupOpen
            ? `0 8px 24px ${TOKENS.accentGlow}`
            : "0 4px 16px rgba(0,0,0,0.12)",
          color: snapshot?.tab.popupOpen ? "#fff" : TOKENS.accent,
          fontSize: 22,
          fontWeight: 700,
          zIndex: 2147483640,
          cursor: "pointer",
          transition: TOKENS.transition,
          display: "grid",
          placeItems: "center"
        }}
      >
        {snapshot?.tab.popupOpen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        )}
      </button>

      {snapshot?.tab.collectModeBannerVisible ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2147483646,
            padding: "10px 20px",
            borderRadius: 999,
            background: "rgba(15,23,42,0.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            boxShadow: "0 12px 40px rgba(15,23,42,0.28)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: TOKENS.accentMid, display: "inline-block", animation: "dlens-pulse 2s ease-in-out infinite" }} />
          Hover to preview
          <span style={{ opacity: 0.4 }}>|</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.15)", fontSize: 11 }}>S</kbd> save
          <span style={{ opacity: 0.4 }}>|</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.15)", fontSize: 11 }}>Esc</kbd> exit
        </div>
      ) : null}

      {snapshot?.tab.selectionMode && hoverRect ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            top: Math.max(12, hoverRect.top - 14),
            left: Math.max(12, hoverRect.right - 88),
            zIndex: 2147483646,
            padding: "4px 10px",
            borderRadius: 999,
            background: hoverSaved ? "rgba(5,150,105,0.12)" : "rgba(99,102,241,0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${hoverSaved ? "rgba(5,150,105,0.25)" : "rgba(99,102,241,0.25)"}`,
            color: hoverSaved ? TOKENS.success : TOKENS.accent,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            animation: "dlens-slide-in 150ms cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          {hoverSaved ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : null}
          {hoverSaved ? "Saved" : snapshot?.tab.hoveredTargetStrength === "soft" ? "Preview only" : "Ready"}
        </div>
      ) : null}

      {snapshot?.tab.selectionMode && flashPreview && flashStyle ? (
        <div data-dlens-control="true" style={flashStyle}>
          <div style={surfaceCardStyle({ padding: 12, display: "grid", gap: 10 })}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${TOKENS.accent}, ${TOKENS.accentMid})`,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0
                }}
              >
                {flashPreviewAvatar(flashPreview.author_hint)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{flashPreview.author_hint || "Unknown author"}</div>
                <div style={{ fontSize: 12, color: TOKENS.subInk, ...lineClamp(2) }}>{flashPreview.text_snippet || "No snippet"}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{flashPreviewMetrics(flashPreview)}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <PrimaryButton onClick={() => void onSavePreview()}>
                {hoverSaved ? "Saved" : "Save"}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  if (!flashPreview.post_url) {
                    return;
                  }
                  window.open(flashPreview.post_url, "_blank", "noopener,noreferrer");
                }}
              >
                Open
              </SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {displayToast ? (
        <div
          data-dlens-control="true"
          style={{
            position: "fixed",
            right: 24,
            top: snapshot?.tab.popupOpen ? 84 : 80,
            zIndex: 2147483647,
            padding: "10px 16px",
            borderRadius: TOKENS.pillRadius,
            background: displayToast.kind === "queued"
              ? "rgba(217,119,6,0.1)"
              : "rgba(5,150,105,0.1)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${displayToast.kind === "queued" ? "rgba(217,119,6,0.2)" : "rgba(5,150,105,0.2)"}`,
            color: displayToast.kind === "queued" ? TOKENS.queued : TOKENS.success,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.45,
            maxWidth: 360,
            boxShadow: "0 8px 24px rgba(15,23,42,0.1)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            animation: "dlens-slide-in 200ms cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            {displayToast.kind === "saved" ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 2v10l4 2" />}
          </svg>
          {displayToast.message}
        </div>
      ) : null}

      {snapshot?.tab.popupOpen ? (
        <div
          ref={popupRef}
          data-dlens-control="true"
          data-workspace-popup="shell"
          style={{
            position: "fixed",
            right: 24,
            top: 82,
            width: page === "compare" || page === "result" ? EXPANDED_COMPARE_POPUP_WIDTH : DEFAULT_POPUP_WIDTH,
            maxHeight: "min(80vh, 820px)",
            overflow: "hidden",
            borderRadius: tokens.radius.lg + 2,
            border: `1px solid ${tokens.color.glassBorder}`,
            boxShadow: `${tokens.shadow.popup}, inset 0 1px 0 rgba(255,255,255,0.96)`,
            zIndex: 2147483640,
            color: tokens.color.ink,
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            animation: "dlens-slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1)",
            transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)"
          }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {/* Blur backing layer — separated from overflow:hidden to avoid WebKit corner artefacts */}
          <div aria-hidden style={{
            position: "absolute",
            inset: 0,
            borderRadius: tokens.radius.lg + 2,
            background: tokens.color.canvas,
            backdropFilter: "blur(14px) saturate(112%)",
            WebkitBackdropFilter: "blur(14px) saturate(112%)",
            zIndex: 0,
            pointerEvents: "none"
          }} />
          <div
            data-workspace-popup-scroll="viewport"
            style={{
              position: "relative",
              zIndex: 1,
              maxHeight: "min(80vh, 820px)",
              overflowY: "auto",
              overflowX: "hidden",
              borderRadius: tokens.radius.lg + 2,
              padding: `${tokens.spacing.section}px`,
              paddingBottom: tokens.spacing.section + 8,
              display: "grid",
              gap: tokens.spacing.section,
              scrollbarGutter: "stable both-edges"
            }}
          >
          <div
            data-workspace-folder-strip="compact"
            style={surfaceCardStyle({
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 10,
              background: tokens.color.utilitySurface
            })}
          >
            <select
              value={snapshot?.global.activeSessionId || ""}
              onChange={(event) => {
                if (!event.target.value) {
                  return;
                }
                setIsRenamingFolder(false);
                void sendAndSync({
                  type: "session/set-active",
                  sessionId: event.target.value
                });
              }}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 999,
                border: `1px solid ${tokens.color.line}`,
                padding: "8px 12px",
                background: tokens.color.elevated,
                fontSize: 12,
                fontWeight: 600,
                color: tokens.color.ink,
                outline: "none",
                transition: tokens.motion.transitionFast
              }}
            >
              <option value="" disabled>
                {snapshot?.global.sessions.length ? "Select a folder" : "No folders yet"}
              </option>
              {snapshot?.global.sessions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name} ({folder.items.length})
                </option>
              ))}
            </select>
            {activeFolder ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: tokens.color.cyan,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: tokens.color.cyanSoft,
                  whiteSpace: "nowrap"
                }}
              >
                {activeFolder.items.length} saved
              </span>
            ) : null}
            <SecondaryButton onClick={() => setShowFolderPrompt((current) => !current)} style={{ padding: "7px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
              + New
            </SecondaryButton>
            <IconButton
              label="Rename folder"
              onClick={() => {
                setEditingFolderName(activeFolder?.name || "");
                setIsRenamingFolder((current) => !current);
              }}
              disabled={!activeFolder}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                <path d="m13 7 4 4" />
              </svg>
            </IconButton>
            <IconButton label="Delete folder" onClick={() => void onDeleteFolder()} disabled={!activeFolder}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </IconButton>
          </div>

          {isRenamingFolder && activeFolder ? (
            <div style={{ ...surfaceCardStyle({ display: "grid", gap: 8, background: tokens.color.elevated }) }}>
              <input
                value={editingFolderName}
                onChange={(event) => setEditingFolderName(event.target.value)}
                placeholder="Rename this folder"
                style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: tokens.color.elevated, color: tokens.color.ink, fontSize: 13, outline: "none", transition: TOKENS.transition }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <PrimaryButton onClick={() => void onRenameFolder()} disabled={!editingFolderName.trim()}>
                  Save name
                </PrimaryButton>
                <SecondaryButton onClick={() => setIsRenamingFolder(false)}>Cancel</SecondaryButton>
              </div>
            </div>
          ) : null}

          {showFolderPrompt ? (
            <div style={{ ...surfaceCardStyle({ display: "grid", gap: 8, background: tokens.color.elevated }) }}>
              <input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Name this folder"
                style={{ borderRadius: TOKENS.pillRadius, border: `1px solid ${TOKENS.glassBorder}`, padding: "9px 12px", background: tokens.color.elevated, color: tokens.color.ink, fontSize: 13, outline: "none", transition: TOKENS.transition }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <PrimaryButton onClick={() => void onCreateFolder(false)}>Create folder</PrimaryButton>
                <SecondaryButton onClick={() => void onCreateFolder(true)} disabled={!preview}>
                  Create + save
                </SecondaryButton>
              </div>
            </div>
          ) : null}

          <WorkspaceShell
            mode={page}
            header={(
              <>
                <ModeRail activeMode={primaryMode} onSelect={(mode) => void onNavigate(mode)} />
                <UtilityEdge active={page === "settings"} onSelect={() => void onNavigate("settings")} />
              </>
            )}
            contextStrip={
              activeFolder ? (
                <ProcessingStrip
                  workerStatus={workerStatus}
                  ready={processingSummary.ready}
                  total={processingSummary.total}
                  crawling={processingSummary.crawling}
                  analyzing={processingSummary.analyzing}
                  pending={processingSummary.pending}
                />
              ) : undefined
            }
          >
            {page === "library" ? (
              <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
                <LibraryView
                  activeFolder={activeFolder}
                  activeItem={activeItem}
                  optimisticQueuedIds={optimisticQueuedIds}
                  workerStatus={workerStatus}
                  isStartingProcessing={isStartingProcessing}
                  processAllLabel={processAllLabel}
                  processingSummary={processingSummary}
                  canPrev={canPrev}
                  canNext={canNext}
                  onSelectItem={(itemId) =>
                    void sendAndSync({
                      type: "session/select-item",
                      sessionId: activeFolder?.id || "",
                      itemId
                    })
                  }
                  onProcessAll={() => void onProcessAll()}
                  onMoveSelection={(direction) => void moveSelection(direction)}
                  onQueueItem={() => void onQueueItem()}
                  renderMetrics={flashPreviewMetrics}
                  techniqueReadings={techniqueReadings}
                  savedAnalyses={savedAnalyses}
                  onGoToCollect={() => void onNavigate("collect")}
                  onGoToCompare={() => void onNavigate("compare")}
                />
              </WorkspaceSurface>
            ) : null}

            {page === "collect" ? (
              <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
                <CollectView
                  preview={preview ?? null}
                  folderName={activeFolder?.name || "No folder yet"}
                  isSaved={previewSaved}
                  selectionMode={Boolean(snapshot?.tab.selectionMode)}
                  onSavePreview={() => void onSavePreview()}
                  onOpenPreview={openPreview}
                  onToggleCollectMode={() => void onToggleCollectMode()}
                />
              </WorkspaceSurface>
            ) : null}

            {page === "compare" ? (
              <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
                {activeFolder ? (
                  <CompareSetupView
                    readyItems={readyCompareItems}
                    selectedA={selectedCompareA}
                    selectedB={selectedCompareB}
                    teaserState={compareTeaserState}
                    teaser={compareTeaser}
                    onChangeA={setSelectedCompareA}
                    onChangeB={setSelectedCompareB}
                    onOpenResult={() => void onOpenCompareResult()}
                    onReset={onResetCompareSelection}
                  />
                ) : (
                  <div style={{ padding: 16, color: TOKENS.softInk, fontSize: 13, textAlign: "center" }}>
                    Create a folder and queue posts before comparing.
                  </div>
                )}
              </WorkspaceSurface>
            ) : null}

            {page === "result" ? (
              <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
                {resultSurface.mode === "empty" ? (
                  <div style={{ display: "grid", gap: 12, padding: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tokens.color.ink }}>尚未建立分析</div>
                    <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
                      先在「比較」選兩篇貼文，生成 teaser，再進入完整分析。
                    </div>
                    <PrimaryButton onClick={() => void onNavigate("compare")}>前往比較</PrimaryButton>
                  </div>
                ) : activeFolder && resultItemA && resultItemB ? (
                  <div style={{ display: "grid", gap: 10, paddingBottom: 24 }}>
                    {resultSurface.mode === "saved" && resultSurface.savedAnalysis ? (
                      <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 14px", display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#0071e3", background: "rgba(0,113,227,0.08)", borderRadius: 6, padding: "2px 8px" }}>
                            已儲存分析
                          </span>
                          <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }}>
                            {resultSurface.savedAnalysis.dateRangeLabel}
                          </span>
                        </div>
                        <div style={{ fontFamily: "-apple-system,'SF Pro Display',sans-serif", fontSize: 20, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.4px", color: "#1d1d1f" }}>
                          {resultSurface.savedAnalysis.headline}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}>
                          {resultSurface.savedAnalysis.deck}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
                          <PrimaryButton onClick={() => void onSaveCurrentAnalysis()} disabled={!compareTeaser || Boolean(resultSelection?.saved)}>
                            {resultSelection?.saved ? "已儲存" : "儲存分析"}
                          </PrimaryButton>
                          <SecondaryButton onClick={() => void onNavigate("compare")}>返回比較</SecondaryButton>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#34c759", background: "rgba(52,199,89,0.1)", borderRadius: 6, padding: "2px 8px" }}>
                            分析就緒
                          </span>
                          <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }}>
                            {buildDateRangeLabel(resultItemA.descriptor.time_token_hint, resultItemB.descriptor.time_token_hint)}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <PrimaryButton onClick={() => void onSaveCurrentAnalysis()} disabled={!compareTeaser}>
                            儲存分析
                          </PrimaryButton>
                          <SecondaryButton onClick={() => void onNavigate("compare")}>返回比較</SecondaryButton>
                        </div>
                      </div>
                    )}
                    <CompareView
                      session={activeFolder}
                      settings={snapshot?.global.settings || { ingestBaseUrl: draftBaseUrl, oneLinerProvider: "google", openaiApiKey: "", claudeApiKey: "", googleApiKey: "" }}
                      onGoToLibrary={() => void onNavigate("library")}
                      forcedSelection={{ itemAId: resultItemA.id, itemBId: resultItemB.id }}
                      hideSelector
                    />
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10, padding: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: tokens.color.ink }}>分析結果暫時不可用</div>
                    <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
                      對應貼文已不在目前資料庫，先回到比較或資料庫重新建立結果。
                    </div>
                    <SecondaryButton onClick={() => void onNavigate("compare")}>回到比較</SecondaryButton>
                  </div>
                )}
              </WorkspaceSurface>
            ) : null}

            {page === "settings" ? (
              <WorkspaceSurface tone="utility">
                <SettingsView
                  draftBaseUrl={draftBaseUrl}
                  draftProvider={draftProvider}
                  draftOpenAiKey={draftOpenAiKey}
                  draftClaudeKey={draftClaudeKey}
                  draftGoogleKey={draftGoogleKey}
                  onDraftBaseUrlChange={setDraftBaseUrl}
                  onDraftProviderChange={setDraftProvider}
                  onDraftOpenAiKeyChange={setDraftOpenAiKey}
                  onDraftClaudeKeyChange={setDraftClaudeKey}
                  onDraftGoogleKeyChange={setDraftGoogleKey}
                  onSaveSettings={() =>
                    void (async () => {
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
                    })()
                  }
                />
              </WorkspaceSurface>
            ) : null}
          </WorkspaceShell>

          {snapshot?.tab.error ? (
            <div style={{ marginTop: 12, color: TOKENS.failed, fontSize: 12 }}>
              <strong>Error:</strong> {getProcessingFailureMessage(snapshot.tab.error)}
            </div>
          ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
