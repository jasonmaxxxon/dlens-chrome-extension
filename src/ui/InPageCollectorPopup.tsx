import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import type { FolderMode, PopupPage } from "../state/types";
import { CasebookView } from "./CasebookView";
import { CompareSetupView } from "./CompareSetupView";
import { CollectView } from "./CollectView";
import { DLENS_BUTTON_CSS, StatusRail, WorkspaceSurface, type WorkspaceMaterial } from "./components";
import { LanguageProvider } from "./i18n";
import { getModeHomePage } from "../state/processing-state";
import { getPageComponentKind, getPageWidth } from "../state/page-registry";
import { IS_PR_ONLY_BUILD } from "../build-variant";
import { LibraryView } from "./LibraryView";
import { ProcessingStrip } from "./ProcessingStrip";
import { ProductSignalView } from "./ProductSignalViews";
import { PrEvidenceView } from "./PrEvidenceViews";
import { SettingsView } from "./SettingsView";
import { TopicDetailView } from "./TopicDetailView";
import { TopicsListView } from "./TopicsListView";
import { tokens } from "./tokens";
import { OPEN_WORKSPACE_EVENT, consumeWorkspaceOpen } from "./inpage-helpers";
import { buildProductSignalWorkspaceViewModel, type ProductSignalCommand } from "../viewmodel/product-signal";
import { buildTopicDetailViewModel, type TopicDetailCommand } from "../viewmodel/topic-detail";
import type { PrEvidenceCommand } from "../viewmodel/pr-evidence";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { CollectionWorkspaceShell, type CollectionTab } from "./CollectionWorkspaceShell";
import { CollectionBrowser } from "./CollectionBrowser";
import { WorkspaceHomeView } from "./WorkspaceHomeView";
import { InPageCollectorResultWorkspace } from "./InPageCollectorResultWorkspace";
import {
  buildPrEvidenceUiReadyEvent,
  buildProductUiReadyEvent,
  buildTopicUiReadyEvent,
  usePipelineUiReadyTrace
} from "./pipeline-ui-ready";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";
import { useWorkspaceScrollMotion } from "./useWorkspaceScrollMotion";

interface ReadingNavigation {
  tab: CollectionTab;
  workspaceOpen: boolean;
  collecting: boolean;
  settingsOpen: boolean;
  query: string;
  selectedKey: string | null;
  returnPage?: PopupPage;
  workspaceSessionId?: string;
  workspacePage?: PopupPage;
  workspaceTopicId?: string;
}

// Reserved breathing room below the last card. This MUST be a real scrollable
// spacer element (see the bottom of the scroll viewport), NOT the container's
// `padding-bottom`: Chrome will not scroll into the padding-bottom of a flex
// column scroll container, so padding-bottom silently clips the last card /
// action button in every mode. Do not "simplify" this back into padding-bottom.
const POPUP_VIEWPORT_BOTTOM_PADDING = tokens.spacing.xl;
// One shared height keeps mode switching stable while trimming the empty canvas
// left by the earlier marketing-scale frame. Long workspaces still scroll.
const POPUP_VIEWPORT_HEIGHT = tokens.layout.workspacePopupHeight;
// Variant D's 28px frame radius is part of the glass silhouette. Keeping the
// scroll viewport on the same radius makes the bottom curve remain visible.
const POPUP_FRAME_RADIUS = 28;
const SETTINGS_WORKSPACE_SURFACE_STYLE: CSSProperties = {
  padding: 0,
  background: "transparent",
  boxShadow: "none",
  border: "none",
  overflow: "visible"
};

function shouldShowProcessingContextStrip(folderMode: string, page: PopupPage): boolean {
  if (folderMode === "product" || folderMode === "pr-evidence") {
    return false;
  }
  if (folderMode === "topic") {
    return page === "compare" || page === "result";
  }
  return page === "library" || page === "compare" || page === "result";
}

function workspaceMaterialForFolderMode(folderMode: string): WorkspaceMaterial {
  return folderMode === "topic" || folderMode === "product" || folderMode === "pr-evidence"
    ? "glass"
    : "paper";
}

function isProductSignalPage(page: PopupPage): boolean {
  return getPageComponentKind(page) === "product-signal";
}

export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  const popupOpen = app.popupOpen;
  const [readingNavigation, setReadingNavigation] = useState<ReadingNavigation>({
    tab: IS_PR_ONLY_BUILD ? "workspaces" : "collection", workspaceOpen: IS_PR_ONLY_BUILD, collecting: false,
    settingsOpen: false, query: "", selectedKey: null
  });
  const navigationPending = useRef(false);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const scrollPositions = useRef(new Map<string, number>());
  // The motion hook also stays facade-owned so its same-route presence history
  // survives the DOM unmount. With active=false it returns before touching the
  // empty route key, so closing does not consume a second lead soft-pop.
  const scrollRef = useRef<HTMLDivElement>(null);
  const motionRouteKey = popupOpen
    ? [
        app.activeFolder?.mode ?? "archive",
        app.page,
        app.activeFolder?.id ?? "",
        app.activeTopic?.id ?? "",
        app.activeSavedAnalysis?.resultId ?? "",
        app.activePrCampaign?.id ?? ""
      ].join(":")
    : "";
  const scrollTrackRef = useWorkspaceScrollMotion(scrollRef, {
    active: popupOpen,
    routeKey: motionRouteKey
  });

  if (!popupOpen) {
    return null;
  }

  return (
    <OpenInPageCollectorPopup
      app={app}
      scrollRef={scrollRef}
      scrollTrackRef={scrollTrackRef}
      scrollPositions={scrollPositions.current}
      navigationControl={{ pending: navigationPending, busy: navigationBusy, setBusy: setNavigationBusy, error: navigationError, setError: setNavigationError }}
      readingNavigation={readingNavigation}
      setReadingNavigation={setReadingNavigation}
    />
  );
}

function OpenInPageCollectorPopup({
  app,
  scrollRef,
  scrollTrackRef,
  scrollPositions,
  readingNavigation,
  setReadingNavigation,
  navigationControl
}: {
  app: InPageCollectorAppModel;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTrackRef: RefObject<HTMLDivElement | null>;
  scrollPositions: Map<string, number>;
  readingNavigation: ReadingNavigation;
  setReadingNavigation: Dispatch<SetStateAction<ReadingNavigation>>;
  navigationControl: { pending: RefObject<boolean>; busy: boolean; setBusy: Dispatch<SetStateAction<boolean>>; error: string | null; setError: Dispatch<SetStateAction<string | null>> };
}) {
  const { snapshot, page, activeFolder, resultItemA, resultItemB } = app;
  const productCrawlPendingRef = useRef(false);
  const { pending: navigationPending, busy: navigationBusy, setBusy: setNavigationBusy, error: navigationError, setError: setNavigationError } = navigationControl;
  const workspaceAllowed = !IS_PR_ONLY_BUILD || (activeFolder?.mode === "pr-evidence" && (page === "pr-evidence" || page === "collect" || page === "settings"));
  const domainPage = readingNavigation.settingsOpen ? "settings"
    : readingNavigation.collecting ? "collect"
    : readingNavigation.tab === "workspaces" && readingNavigation.workspaceOpen && workspaceAllowed ? page : null;
  const guardedPage = page as PopupPage;
  const activeFolderMode = activeFolder?.mode ?? "archive";
  const uiLang = snapshot?.global.settings.layoutPreferences.language ?? "zh";
  const workspaceMaterial = workspaceMaterialForFolderMode(activeFolderMode);
  const workspaceGlass = tokens.material.workspaceGlass;
  const productExportFolders = (snapshot?.global.sessions ?? [])
    .filter((session) => session.mode === "product")
    .map((session) => ({
      id: session.id,
      name: session.name,
      itemCount: session.items.length
    }));
  const productSignalViewModel = !IS_PR_ONLY_BUILD && snapshot && domainPage && isProductSignalPage(domainPage)
    ? buildProductSignalWorkspaceViewModel({
        snapshot,
        signals: app.signals,
        analyses: app.productSignalAnalyses,
        signalReadings: app.signalReadings,
        productContext: app.compiledProductContext,
        aiProviderReady: app.productAiProviderReady,
        backendError: app.productBackendError,
        analysisError: app.productSignalAnalysisError,
        analysisNotice: app.productSignalAnalysisNotice,
        isHydrating: app.isHydratingProductSignals,
        isAnalyzing: app.isAnalyzingProductSignals,
        isProcessing: app.isStartingProcessing || app.bulkAnalyzingFolderId === activeFolder?.id,
        optimisticQueuedItemIds: app.optimisticQueuedIds
      })
    : null;
  const topicDetailViewModel = domainPage === "topic-detail" && app.activeTopic
    ? buildTopicDetailViewModel({
        topic: app.activeTopic,
        signals: app.activeTopicSignals,
        pairs: app.activeTopicPairs,
        loadState: app.topicLoadState,
        sessionMode: app.activeFolderMode,
        sessionItems: activeFolder?.items ?? [],
        savedAnalyses: app.savedAnalyses,
        signalReadingsBySignalId: app.topicSignalReadingsBySignalId,
        signalTagsByItemId: app.signalTagsByItemId,
        synthLayout: snapshot?.global.settings.layoutPreferences.topicSynthesisLayout,
        auditEvidence: app.activeTopicAudit?.auditEvidence,
        auditMemos: app.activeTopicAudit?.auditMemos,
        auditReport: app.activeTopicAudit?.auditReport,
        auditEpisodes: app.activeTopicAudit?.auditEpisodes,
        auditSummary: app.activeTopicAudit?.summary,
        auditValidatorFlags: app.activeTopicAudit?.auditValidatorFlags,
        auditRunStatus: app.activeTopicAudit?.auditRunStatus,
        p1RunningSignalIds: app.activeTopic && app.topicAuditP1RunningBySignalId[app.activeTopic.id]
          ? Object.keys(app.topicAuditP1RunningBySignalId[app.activeTopic.id])
          : [],
        p1ErrorBySignalId: app.activeTopic ? app.topicAuditP1ErrorBySignalId[app.activeTopic.id] : undefined,
        optimisticQueuedItemIds: app.optimisticQueuedIds,
        isBulkAnalyzing: app.bulkAnalyzingFolderId === activeFolder?.id,
        isStartingProcessing: app.isStartingProcessing,
        workerStatus: app.workerStatus,
        backendWorkUiState: app.backendWorkUiState
      })
    : null;

  function onProductSignalCommand(command: ProductSignalCommand): Promise<unknown> | unknown {
    switch (command.kind) {
      case "crawlSources": {
        if (command.target.sessionId !== activeFolder?.id || productCrawlPendingRef.current) {
          return { ok: false };
        }
        productCrawlPendingRef.current = true;
        return Promise.resolve(app.onAnalyzeItems(command.target.itemIds))
          .finally(() => { productCrawlPendingRef.current = false; });
      }
      case "analyzeInbox":
        return app.onAnalyzeProductSignals();
      case "remove":
        return app.onRemoveProductSignal(command.target.signalId);
      case "reviewReading":
        return app.onReviewSignalReading(command.target.cacheKey, command.decision, command.note);
      case "exportSignalPackets":
        return app.onExportSignalPackets({ sessionId: command.target.sessionId, format: command.format });
      default:
        return undefined;
    }
  }

  function onTopicDetailCommand(command: TopicDetailCommand): Promise<unknown> | unknown {
    switch (command.kind) {
      case "back":
        return app.onBackFromTopicDetail();
      case "openPair":
        return app.onOpenTopicPair(command.target.resultId, command.target.topicId);
      case "updateTopic":
        return app.onUpdateTopic(command.patch);
      case "analyzeItems":
        return app.onAnalyzeItems(command.target.itemIds);
      case "analyzeItem":
        return app.onAnalyzeItems([command.target.itemId]);
      case "queueItem":
      case "queueSignalItem":
        return app.onQueueItemById(command.target.itemId);
      case "startProcessing":
        return app.onStartProcessing();
      case "openAnalysis":
        return app.onOpenSavedAnalysis(command.target.resultId);
      case "openSignalAnalysis":
        return app.onOpenSavedAnalysis(command.target.resultId);
      case "addToCompare":
        return app.onAddToCompare(command.target.itemId);
      case "addSignalToCompare":
        return app.onAddToCompare(command.target.itemId);
      case "saveJudgmentOverride":
        return app.onSaveJudgmentOverride(command.target.resultId, command.patch);
      case "generateSynthesis":
        return app.onGenerateTopicSynthesis(command.target.topicId);
      case "generateSignalReading":
        return app.onGenerateTopicSignalReading(command.target.signalId, command.target.topicId);
      case "deleteSignal":
        return app.onSignalDeleted(command.target.signalId);
      case "runAudit":
        return app.onRunTopicAudit(command.target.topicId, command.fromStage, command.force);
      case "runAuditP1":
        return app.onRunTopicAuditP1(command.target.topicId, command.target.signalId);
      case "openAuditReport":
        return app.onOpenAuditReport(command.target.topicId, command.stale);
      default:
        return undefined;
    }
  }
  const pageComponentKind = domainPage ? getPageComponentKind(domainPage) : null;
  const homePage = getModeHomePage(activeFolderMode);
  const attachedTopicIds = app.activeSavedAnalysis
    ? app.topics.filter((topic) => topic.pairIds.includes(app.activeSavedAnalysis!.resultId)).map((topic) => topic.id)
    : [];
  const collectTargetName = activeFolderMode === "topic"
    ? app.activeTopic?.name || "未選主題"
    : activeFolder?.name || "No folder yet";
  const collectionTopicId = app.selectedTopicId || snapshot?.tab.collectionTopicId || "";
  const collectCanSave = activeFolderMode === "topic"
    ? Boolean(collectionTopicId)
    : activeFolderMode !== "pr-evidence" || Boolean(app.activePrCampaign);
  const collectDisabledReason = activeFolderMode === "topic" && !collectionTopicId
    ? "先在上方選擇主題，Collect 才會寫入正確主題。"
    : activeFolderMode === "pr-evidence" && !app.activePrCampaign
      ? "先在 PR 頁建立 campaign，Collect 才能加入 evidence row。"
      : "";

  usePipelineUiReadyTrace(productSignalViewModel
    ? buildProductUiReadyEvent(productSignalViewModel)
    : null);
  usePipelineUiReadyTrace(domainPage === "topic-detail" && topicDetailViewModel
    ? buildTopicUiReadyEvent(topicDetailViewModel)
    : null);
  usePipelineUiReadyTrace(domainPage === "pr-evidence"
    ? buildPrEvidenceUiReadyEvent(app.prEvidenceViewModel)
    : null);

  const prBriefInputRef = useRef<HTMLInputElement>(null);

  const scrollKey = readingNavigation.settingsOpen ? "settings"
    : readingNavigation.collecting ? "collection-capture"
    : readingNavigation.tab === "collection" ? JSON.stringify(["collection", readingNavigation.selectedKey ?? "list"])
    : !readingNavigation.workspaceOpen || !workspaceAllowed ? "workspace-list"
    : JSON.stringify(["workspace", activeFolder?.id, guardedPage, app.activeTopic?.id ?? "", app.activeSavedAnalysis?.resultId ?? ""]);

  // Save on scroll, before a shorter route can clamp the viewport during DOM
  // replacement. The facade map survives closing the popup and unmounting this view.
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const target = scrollPositions.get(scrollKey) ?? 0;
    let restoring = true;
    let observer: ResizeObserver | undefined;
    const stopRestoring = () => {
      restoring = false;
      observer?.disconnect();
    };
    const restore = () => {
      if (!restoring) return;
      viewport.scrollTop = target;
      if (viewport.scrollTop >= target) stopRestoring();
    };
    const rememberScroll = () => {
      // A clamped programmatic scroll must not overwrite the requested offset.
      if (!restoring) scrollPositions.set(scrollKey, viewport.scrollTop);
    };
    const cancelRestoration = () => { stopRestoring(); rememberScroll(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancelRestoration();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === viewport) cancelRestoration();
    };
    restore();
    // Images can be shorter before load. Retry on real size changes only, and
    // yield immediately to user scrolling instead of pulling them back later.
    const ResizeObserverClass = viewport.ownerDocument.defaultView?.ResizeObserver;
    if (restoring && ResizeObserverClass && scrollTrackRef.current) {
      observer = new ResizeObserverClass(restore);
      observer.observe(scrollTrackRef.current);
    }
    viewport.addEventListener("scroll", rememberScroll, { passive: true });
    viewport.addEventListener("load", restore, true);
    viewport.addEventListener("wheel", cancelRestoration, { passive: true });
    viewport.addEventListener("touchstart", cancelRestoration, { passive: true });
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("pointerdown", onPointerDown);
    return () => {
      stopRestoring();
      viewport.removeEventListener("scroll", rememberScroll);
      viewport.removeEventListener("load", restore, true);
      viewport.removeEventListener("wheel", cancelRestoration);
      viewport.removeEventListener("touchstart", cancelRestoration);
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("pointerdown", onPointerDown);
    };
  }, [scrollKey, scrollPositions, scrollRef, scrollTrackRef]);

  useEffect(() => {
    if (navigationPending.current || !activeFolder || !workspaceAllowed || readingNavigation.tab !== "workspaces" || !readingNavigation.workspaceOpen || readingNavigation.settingsOpen || readingNavigation.collecting || page === "settings") return;
    setReadingNavigation((current) => {
      const topicId = app.activeTopic?.id;
      if (current.workspaceSessionId === activeFolder.id && current.workspacePage === page && current.workspaceTopicId === topicId) return current;
      return { ...current, workspaceSessionId: activeFolder.id, workspacePage: page, workspaceTopicId: topicId };
    });
  }, [activeFolder?.id, page, app.activeTopic?.id, readingNavigation.tab, readingNavigation.workspaceOpen, readingNavigation.settingsOpen, readingNavigation.collecting, workspaceAllowed]);

  async function selectPrimaryTab(tab: CollectionTab) {
    if (navigationPending.current) return;
    setNavigationError(null);
    if (tab === "workspaces" && readingNavigation.workspaceOpen && readingNavigation.workspaceSessionId) {
      navigationPending.current = true;
      setNavigationBusy(true);
      try {
        if (activeFolder?.id !== readingNavigation.workspaceSessionId) {
          const result = await app.onSetActiveSession(readingNavigation.workspaceSessionId);
          if (result && !result.ok) throw new Error("workspace unavailable");
        }
        if (readingNavigation.workspacePage === "topic-detail" && readingNavigation.workspaceTopicId) {
          await app.onNavigateToTopic(readingNavigation.workspaceTopicId);
        } else {
          await app.onNavigate(readingNavigation.workspacePage ?? readingNavigation.returnPage ?? getModeHomePage(activeFolderMode));
        }
      } catch { setNavigationError("未能返回工作區，請再試。"); return; }
      finally { navigationPending.current = false; setNavigationBusy(false); }
    }
    setReadingNavigation((current) => ({ ...current, tab, collecting: false, settingsOpen: false }));
  }

  async function openWorkspace(sessionId: string) {
    const session = snapshot?.global.sessions.find((item) => item.id === sessionId);
    if (!session || navigationPending.current || (IS_PR_ONLY_BUILD && session.mode !== "pr-evidence")) return;
    navigationPending.current = true;
    setNavigationBusy(true);
    setNavigationError(null);
    try {
      const result = await app.onSetActiveSession(sessionId);
      if (result && !result.ok) throw new Error("workspace unavailable");
      await app.onNavigate(getModeHomePage(session.mode));
      setReadingNavigation((current) => ({ ...current, tab: "workspaces", workspaceOpen: true, collecting: false, settingsOpen: false, workspaceSessionId: sessionId, workspacePage: getModeHomePage(session.mode), workspaceTopicId: undefined }));
    } catch {
      setNavigationError("未能開啟工作區，請再試。");
    } finally { navigationPending.current = false; setNavigationBusy(false); }
  }

  useEffect(() => {
    const listener = () => {
      if (navigationPending.current) return;
      const sessionId = consumeWorkspaceOpen(snapshot?.global.sessions.map((session) => session.id) ?? []);
      if (sessionId) void openWorkspace(sessionId);
    };
    window.addEventListener(OPEN_WORKSPACE_EVENT, listener);
    listener();
    return () => window.removeEventListener(OPEN_WORKSPACE_EVENT, listener);
  });

  async function createWorkspace(name: string, mode: FolderMode) {
    if (navigationPending.current || (IS_PR_ONLY_BUILD && mode !== "pr-evidence")) return { ok: false };
    navigationPending.current = true;
    setNavigationBusy(true);
    try {
      const result = await app.onCreateWorkspace(name, mode);
      if (!result.ok) return result;
      await app.onNavigate(getModeHomePage(mode));
      setReadingNavigation((current) => ({ ...current, tab: "workspaces", workspaceOpen: true, collecting: false, settingsOpen: false, workspaceSessionId: result.snapshot?.global.activeSessionId ?? undefined, workspacePage: getModeHomePage(mode), workspaceTopicId: undefined }));
      return result;
    } finally { navigationPending.current = false; setNavigationBusy(false); }
  }

  async function manageWorkspace(sessionId: string, action: "rename" | "delete", name = "") {
    const session = snapshot?.global.sessions.find((item) => item.id === sessionId);
    if (navigationPending.current || !session || (IS_PR_ONLY_BUILD && session.mode !== "pr-evidence")) return { ok: false as const };
    navigationPending.current = true;
    setNavigationBusy(true);
    setNavigationError(null);
    try {
      const response = action === "rename"
        ? await app.onRenameWorkspace(sessionId, name)
        : await app.onDeleteWorkspace(sessionId);
      if (!response.ok) throw new Error("workspace mutation failed");
      return response;
    } catch {
      setNavigationError(action === "rename" ? "未能重新命名工作區，請再試一次。" : "未能刪除工作區，請再試一次。");
      return { ok: false as const };
    } finally {
      navigationPending.current = false;
      setNavigationBusy(false);
    }
  }

  async function openCollectionCapture() {
    if (navigationPending.current) return;
    navigationPending.current = true;
    setNavigationBusy(true);
    setNavigationError(null);
    try {
      // The inline wheel chooses its destination; opening help keeps the current workspace.
      await app.onNavigate("collect");
      setReadingNavigation((current) => ({ ...current, tab: "collection", collecting: true, settingsOpen: false }));
    } catch { setNavigationError("未能開啟採集，請再試。"); }
    finally { navigationPending.current = false; setNavigationBusy(false); }
  }

  function handlePrEvidenceCommand(command: PrEvidenceCommand) {
    if (command.kind === "requestBriefUpload") {
      prBriefInputRef.current?.click();
      return;
    }
    return app.onPrEvidenceCommand(command);
  }

  return (
    <LanguageProvider value={uiLang}>
    <div
      ref={app.popupRef}
      data-dlens-control="true"
      data-workspace-popup="shell"
      data-workspace-popup-material={workspaceMaterial}
      style={{
        position: "fixed",
        right: 12,
        top: 82,
        width: getPageWidth(guardedPage),
        maxWidth: "calc(100vw - 24px)",
        height: POPUP_VIEWPORT_HEIGHT,
        maxHeight: "calc(100vh - 94px)",
        overflow: "hidden",
        borderRadius: POPUP_FRAME_RADIUS,
        border: `1px solid ${workspaceMaterial === "glass" ? workspaceGlass.edge : tokens.color.glassBorder}`,
        boxShadow: `${tokens.shadow.popup}, inset 0 1px 0 ${tokens.color.shellSurface}`,
        zIndex: 2147483640,
        color: tokens.color.ink,
        fontFamily: tokens.font.sans,
        animation: "dlens-slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: "auto",
        isolation: "isolate",
        transform: "translateZ(0)",
        contain: "paint"
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <style>{DLENS_BUTTON_CSS}</style>
      <div aria-hidden style={{
        position: "absolute",
        inset: 0,
        borderRadius: POPUP_FRAME_RADIUS,
        background: workspaceMaterial === "glass"
          ? workspaceGlass.canvas
          : `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.canvas})`,
        zIndex: 0,
        pointerEvents: "none"
      }} />
      {workspaceMaterial === "glass" ? (
        <>
          <div aria-hidden="true" data-workspace-aura="teal" style={{ position: "absolute", zIndex: 0, width: 320, height: 320, top: -120, right: -90, borderRadius: tokens.radius.round, background: workspaceGlass.auraTeal, filter: "blur(64px)", opacity: 0.55, pointerEvents: "none" }} />
          <div aria-hidden="true" data-workspace-aura="amber" style={{ position: "absolute", zIndex: 0, width: 280, height: 280, top: "38%", left: -130, borderRadius: tokens.radius.round, background: workspaceGlass.auraAmber, filter: "blur(68px)", opacity: 0.48, pointerEvents: "none" }} />
          <div aria-hidden="true" data-workspace-aura="violet" style={{ position: "absolute", zIndex: 0, width: 300, height: 300, bottom: -120, right: -80, borderRadius: tokens.radius.round, background: workspaceGlass.auraViolet, filter: "blur(70px)", opacity: 0.46, pointerEvents: "none" }} />
        </>
      ) : null}
      <div
        ref={scrollRef}
        data-workspace-popup-scroll="viewport"
        style={{
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
          height: "100%",
          maxHeight: POPUP_VIEWPORT_HEIGHT,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehaviorY: "contain",
          borderRadius: POPUP_FRAME_RADIUS,
          padding: `0 ${tokens.spacing.section}px`,
          paddingBottom: 0,
          display: "flex",
          flexDirection: "column",
          scrollbarGutter: "stable both-edges"
        }}
      >
        <div
          ref={scrollTrackRef}
          data-workspace-popup-scroll-track="true"
          style={{
            width: "100%",
            minWidth: 0,
            minHeight: "100%",
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
            gap: tokens.spacing.md
          }}
        >
          <CollectionWorkspaceShell
            tab={readingNavigation.tab}
            allowCollection={!IS_PR_ONLY_BUILD}
            busy={navigationBusy}
            onTabChange={selectPrimaryTab}
            onSettings={() => {
              if (navigationPending.current) return;
              setReadingNavigation((current) => ({ ...current, settingsOpen: true, collecting: false, returnPage: page }));
              void app.onNavigate("settings");
            }}
            diagnostics={<StatusRail scopeLabel="資料夾" backendReachability={app.backendReachability} backendWorkUiState={app.backendWorkUiState} workerStatus={app.workerStatus} ready={app.processingSummary.ready} total={app.processingSummary.total} />}
          >
            {navigationError && (domainPage || readingNavigation.tab !== "workspaces") ? <p role="alert" style={{ color: tokens.color.failed }}>{navigationError}</p> : null}
            {!domainPage && readingNavigation.tab === "collection" ? (
              <CollectionBrowser sessions={snapshot?.global.sessions ?? []} query={readingNavigation.query}
                onQueryChange={(query) => setReadingNavigation((current) => ({ ...current, query }))}
                selectedKey={readingNavigation.selectedKey}
                onSelect={(selectedKey) => setReadingNavigation((current) => ({ ...current, selectedKey }))}
                onCollect={() => void openCollectionCapture()} onOpenWorkspace={(id) => void openWorkspace(id)}
                isLoading={!snapshot} />
            ) : null}
            {!domainPage && readingNavigation.tab === "workspaces" ? (
              <WorkspaceHomeView sessions={IS_PR_ONLY_BUILD ? (snapshot?.global.sessions ?? []).filter((session) => session.mode === "pr-evidence") : snapshot?.global.sessions ?? []} activeSessionId={activeFolder?.id ?? null}
                onOpen={openWorkspace} onCreate={createWorkspace} onRename={(id, name) => manageWorkspace(id, "rename", name)} onDelete={(id) => manageWorkspace(id, "delete")} externalError={navigationError} busy={navigationBusy} allowedCreationModes={IS_PR_ONLY_BUILD ? ["pr-evidence"] : undefined} />
            ) : null}
            {domainPage && !readingNavigation.settingsOpen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.spacing.md }}>
                <button type="button" onClick={() => {
                  if (readingNavigation.collecting) selectPrimaryTab("collection");
                  else setReadingNavigation((current) => ({ ...current, workspaceOpen: false }));
                }} style={{ border: 0, background: "transparent", color: tokens.color.subInk, cursor: "pointer", padding: tokens.spacing.sm }}>
                  {readingNavigation.collecting ? "← 收藏" : "← 工作區"}
                </button>
                {!readingNavigation.collecting && domainPage !== "collect" ? <button type="button" onClick={() => void app.onNavigate("collect")} style={{ border: 0, background: "transparent", color: tokens.color.accent, cursor: "pointer", padding: tokens.spacing.sm }}>加入貼文</button> : null}
              </div>
            ) : null}
          {domainPage === "library" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <LibraryView
                activeFolder={activeFolder}
                activeItem={app.activeItem}
                optimisticQueuedIds={app.optimisticQueuedIds}
                workerStatus={app.workerStatus}
                isStartingProcessing={app.isStartingProcessing}
                processAllLabel={app.processAllLabel}
                processingSummary={app.processingSummary}
                canPrev={app.canPrev}
                canNext={app.canNext}
                onSelectItem={(itemId) => void app.onSelectItem(itemId)}
                onProcessAll={() => void app.onProcessAll()}
                onMoveSelection={(direction) => void app.moveSelection(direction)}
                onQueueItem={() => void app.onQueueItem()}
                renderMetrics={app.renderMetrics}
                techniqueReadings={app.techniqueReadings}
                savedAnalyses={app.savedAnalyses}
                topicSignalItemIds={activeFolderMode === "topic" ? app.signals.map((signal) => signal.itemId).filter((itemId): itemId is string => Boolean(itemId)) : undefined}
                topicInboxCount={app.signals.filter((signal) => signal.inboxStatus === "unprocessed").length}
                topicCount={app.topics.length}
                onGoToCollect={() => void app.onNavigate("collect")}
                onGoToCompare={() => void app.onNavigate("compare")}
                onOpenSavedAnalysis={(resultId) => void app.onOpenSavedAnalysis(resultId)}
                folderSynthesis={app.folderSynthesis}
                isGeneratingFolderSynthesis={app.isGeneratingFolderSynthesis}
                folderSynthesisError={app.folderSynthesisError}
                nowMs={app.readWallClockNowMs()}
                folderAnalyzedCount={app.folderAnalyzedCount}
                folderContributingTopicCount={app.folderContributingTopicCount}
                onGenerateFolderSynthesis={() => void app.onGenerateFolderSynthesis()}
                onClearFolderSynthesis={() => void app.onClearFolderSynthesis()}
              />
            </WorkspaceSurface>
          ) : null}

          {domainPage === "topics" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <TopicsListView
                topics={app.topics}
                signals={app.signals}
                sessionItems={activeFolder?.items ?? []}
                auditSummariesByTopicId={Object.fromEntries(
                  Object.entries(app.topicAuditByTopicId).map(([topicId, audit]) => [topicId, audit.summary])
                )}
                onOpenTopic={(topicId) => void app.onNavigateToTopic(topicId)}
                onCreateTopic={() => void app.onCreateTopic()}
                onDeleteTopic={(topicId) => void app.onDeleteTopic(topicId)}
              />
            </WorkspaceSurface>
          ) : null}

          {domainPage === "topic-detail" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              {topicDetailViewModel ? (
                <TopicDetailView
                  viewModel={topicDetailViewModel}
                  onCommand={onTopicDetailCommand}
                />
              ) : (
                <CasebookView
                  sessionId={activeFolder?.id || ""}
                  initialTopics={app.topics}
                  signals={app.signals}
                  signalPreviewById={app.signalPreviewById}
                  signalTagsByItemId={app.signalTagsByItemId}
                  sessionItems={activeFolder?.items ?? []}
                  savedAnalyses={app.savedAnalyses}
                  pendingSignalCount={app.signals.filter((signal) => signal.inboxStatus === "unprocessed").length}
                  onNavigateToTopic={(topicId) => void app.onNavigateToTopic(topicId)}
                  onCreateTopic={() => void app.onCreateTopic()}
                  onSignalTriaged={(signalId, action) => void app.onSignalTriaged(signalId, action)}
                  onSignalDeleted={(signalId) => void app.onSignalDeleted(signalId)}
                  onCreateTopicFromSignals={(signalIds) => void app.onCreateTopicFromSignals(signalIds)}
                  onQueueItemById={(itemId) => void app.onQueueItemById(itemId)}
                  optimisticQueuedItemIds={app.optimisticQueuedIds}
                  onOpenAnalysis={(resultId) => void app.onOpenSavedAnalysis(resultId)}
                  onAddToCompare={(itemId) => app.onAddToCompare(itemId)}
                />
              )}
            </WorkspaceSurface>
          ) : null}

          {domainPage === "collect" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <CollectView
                preview={app.preview ?? null}
                folderName={collectTargetName}
                mode={activeFolderMode}
                isSaved={app.previewSaved}
                canSavePreview={collectCanSave}
                disabledReason={collectDisabledReason}
                selectionMode={Boolean(snapshot?.tab.selectionMode)}
                recentItems={activeFolder?.items ?? []}
                processingSummary={app.processingSummary}
                untriagedSignals={app.signals}
                signalPreviewById={app.signalPreviewById}
                signalTagsByItemId={app.signalTagsByItemId}
                onCreateTopicFromSignals={(signalIds) => void app.onCreateTopicFromSignals(signalIds)}
                onSignalDeleted={(signalId) => void app.onSignalDeleted(signalId)}
                onSavePreview={() => void app.onSavePreview()}
                onOpenPreview={app.openPreview}
                onToggleCollectMode={() => void app.onToggleCollectMode()}
              />
            </WorkspaceSurface>
          ) : null}

          {domainPage === "compare" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              {activeFolder ? (
                <CompareSetupView
                  readyItems={app.readyCompareItems}
                  selectedA={app.selectedCompareA}
                  selectedB={app.selectedCompareB}
                  teaserState={app.compareTeaserState}
                  teaser={app.compareTeaser}
                  onChangeA={app.setSelectedCompareA}
                  onChangeB={app.setSelectedCompareB}
                  onOpenResult={() => void app.onOpenCompareResult()}
                  onReset={app.onResetCompareSelection}
                />
              ) : (
                <div style={{ padding: 16, color: tokens.color.subInk, fontSize: 13, textAlign: "center" }}>
                  Create a folder and queue posts before comparing.
                </div>
              )}
            </WorkspaceSurface>
          ) : null}

          {domainPage && pageComponentKind === "product-signal" && productSignalViewModel ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <ProductSignalView
                viewModel={productSignalViewModel}
                exportFolders={productExportFolders}
                onCommand={onProductSignalCommand}
              />
            </WorkspaceSurface>
          ) : null}

          {domainPage === "pr-evidence" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <input
                ref={prBriefInputRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void app.onPrEvidenceBriefFileSelected(file);
                  event.currentTarget.value = "";
                }}
              />
              <PrEvidenceView
                viewModel={app.prEvidenceViewModel}
                onCommand={handlePrEvidenceCommand}
              />
            </WorkspaceSurface>
          ) : null}

          {domainPage === "result" ? (
            <InPageCollectorResultWorkspace
              app={app}
              activeFolder={activeFolder}
              resultItemA={resultItemA}
              resultItemB={resultItemB}
              attachedTopicIds={attachedTopicIds}
              homePage={homePage}
            />
          ) : null}

          {domainPage === "settings" ? (
            <WorkspaceSurface style={SETTINGS_WORKSPACE_SURFACE_STYLE}>
              <SettingsView
                sessionMode={IS_PR_ONLY_BUILD ? "pr-evidence" : activeFolder?.mode ?? "topic"}
                draftBaseUrl={app.draftBaseUrl}
                draftProvider={app.draftProvider}
                draftOpenAiKey={app.draftOpenAiKey}
                draftClaudeKey={app.draftClaudeKey}
                draftGoogleKey={app.draftGoogleKey}
                hasOpenAiKey={app.hasOpenAiKey}
                hasClaudeKey={app.hasClaudeKey}
                hasGoogleKey={app.hasGoogleKey}
                draftLayoutPreferences={app.draftLayoutPreferences}
                draftProductProfile={app.draftProductProfile}
                compiledProductContext={app.compiledProductContext}
                storageUsage={app.storageUsage}
                settingsSaveStatus={app.settingsSaveStatus}
                isSavingSettings={app.isSavingSettings}
                productProfileSeedText={app.productProfileSeedText}
                isInitializingProductProfile={app.isInitializingProductProfile}
                onDraftBaseUrlChange={app.setDraftBaseUrl}
                onDraftProviderChange={app.setDraftProvider}
                onDraftOpenAiKeyChange={app.setDraftOpenAiKey}
                onDraftClaudeKeyChange={app.setDraftClaudeKey}
                onDraftGoogleKeyChange={app.setDraftGoogleKey}
                onDraftLayoutPreferencesChange={app.onDraftLayoutPreferencesChange}
                onDraftProductProfileChange={app.onDraftProductProfileChange}
                onProductProfileSeedTextChange={app.setProductProfileSeedText}
                onInitProductProfile={() => void app.onInitProductProfile()}
                onClearProductCache={() => void app.onClearProductCache()}
                createContextFileId={app.createContextFileId}
                onSaveSettings={() => void app.onSaveSettings()}
              />
            </WorkspaceSurface>
          ) : null}
          </CollectionWorkspaceShell>

          {domainPage && snapshot?.tab.error ? (
            <div style={{ marginTop: 12, color: tokens.color.failed, fontSize: 12 }}>
              <strong>Error:</strong> {getProcessingFailureMessage(snapshot.tab.error)}
            </div>
          ) : null}

          {/* Scrollable bottom spacer — keeps the last card + action button fully
              reachable. See POPUP_VIEWPORT_BOTTOM_PADDING for why this is an
              element and not the scroll container's padding-bottom. */}
          <div
            data-workspace-popup-bottom-spacer="true"
            aria-hidden="true"
            style={{ height: POPUP_VIEWPORT_BOTTOM_PADDING, flexShrink: 0 }}
          />
        </div>
      </div>
    </div>
    </LanguageProvider>
  );
}

export const inPageCollectorPopupTestables = {
  shouldShowProcessingContextStrip,
  workspaceMaterialForFolderMode,
  popupViewportBottomPadding: POPUP_VIEWPORT_BOTTOM_PADDING,
  popupViewportHeight: POPUP_VIEWPORT_HEIGHT,
  popupFrameRadius: POPUP_FRAME_RADIUS,
  settingsWorkspaceSurfaceStyle: SETTINGS_WORKSPACE_SURFACE_STYLE
};
