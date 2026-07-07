import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { MainPage, PopupPage } from "../state/types";
import { CasebookView } from "./CasebookView";
import { CompareSetupView } from "./CompareSetupView";
import { CollectView } from "./CollectView";
import { DLENS_BUTTON_CSS, StatusRail, WorkspaceShell, WorkspaceSurface, ModeRail, UtilityEdge, type WorkspaceSwitcherMode } from "./components";
import { getModeHomePage, getModeRailPages } from "../state/processing-state";
import { getPageComponentKind, getPageWidth } from "../state/page-registry";
import { IS_PR_ONLY_BUILD } from "../build-variant";
import { LibraryView } from "./LibraryView";
import { ProcessingStrip } from "./ProcessingStrip";
import { ProductSignalView, type ProductSignalPageKind } from "./ProductSignalViews";
import { PrEvidenceView } from "./PrEvidenceViews";
import { SettingsView } from "./SettingsView";
import { TopicDetailView } from "./TopicDetailView";
import { TopicsListView } from "./TopicsListView";
import { tokens } from "./tokens";
import { buildProductSignalWorkspaceViewModel, type ProductSignalCommand } from "../viewmodel/product-signal";
import { buildTopicDetailViewModel, type TopicDetailCommand } from "../viewmodel/topic-detail";
import type { PrEvidenceCommand } from "../viewmodel/pr-evidence";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { InPageCollectorFolderControls } from "./InPageCollectorFolderControls";
import { InPageCollectorResultWorkspace } from "./InPageCollectorResultWorkspace";
import {
  buildPrEvidenceUiReadyEvent,
  buildProductUiReadyEvent,
  buildTopicUiReadyEvent,
  usePipelineUiReadyTrace
} from "./pipeline-ui-ready";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

const WORKSPACE_SWITCHER_MODES: ReadonlyArray<WorkspaceSwitcherMode> = IS_PR_ONLY_BUILD
  ? ["pr-evidence"]
  : ["topic", "product", "pr-evidence"];

// Reserved breathing room below the last card. This MUST be a real scrollable
// spacer element (see the bottom of the scroll viewport), NOT the container's
// `padding-bottom`: Chrome will not scroll into the padding-bottom of a flex
// column scroll container, so padding-bottom silently clips the last card /
// action button in every mode. Do not "simplify" this back into padding-bottom.
const POPUP_VIEWPORT_BOTTOM_PADDING = tokens.spacing.section + 48;
const SETTINGS_WORKSPACE_SURFACE_STYLE: CSSProperties = {
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

type RailMode = Exclude<MainPage, "result" | "topic-detail">;

function isRailMode(page: PopupPage): page is RailMode {
  return page !== "settings" && page !== "audit-report" && page !== "result" && page !== "topic-detail";
}

function isProductSignalPageKind(page: PopupPage): page is ProductSignalPageKind {
  return getPageComponentKind(page) === "product-signal";
}

export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, page, popupOpen, activeFolder, resultItemA, resultItemB } = app;
  const activeFolderMode = activeFolder?.mode ?? "archive";
  const productExportFolders = (snapshot?.global.sessions ?? [])
    .filter((session) => session.mode === "product")
    .map((session) => ({
      id: session.id,
      name: session.name,
      itemCount: session.items.length
    }));
  const productSignalViewModel = snapshot && isProductSignalPageKind(page)
    ? buildProductSignalWorkspaceViewModel({
        kind: page,
        snapshot,
        signals: app.signals,
        analyses: app.productSignalAnalyses,
        historicalAnalyses: app.historicalProductSignalAnalyses,
        agentTaskFeedback: app.productAgentTaskFeedback,
        signalReadings: app.signalReadings,
        productContext: app.compiledProductContext,
        aiProviderReady: app.productAiProviderReady,
        cardLayout: snapshot.global.settings.layoutPreferences.productSignalCardLayout,
        backendError: app.productBackendError,
        analysisError: app.productSignalAnalysisError,
        analysisNotice: app.productSignalAnalysisNotice,
        isHydrating: app.isHydratingProductSignals,
        isAnalyzing: app.isAnalyzingProductSignals
      })
    : null;
  const topicDetailViewModel = app.activeTopic
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
        auditSummary: app.activeTopicAudit?.summary,
        auditValidatorFlags: app.activeTopicAudit?.auditValidatorFlags,
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
      case "analyzeInbox":
        return app.onAnalyzeProductSignals();
      case "openActionable":
        return app.onNavigate("actionable-filter");
      case "remove":
        return app.onRemoveProductSignal(command.target.signalId);
      case "generateReading":
        return app.onSynthesizeSignalReading(command.target.signalId, command.target.sessionId, command.force);
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
        return app.onRunTopicAudit(command.target.topicId, command.fromStage);
      case "runAuditP1":
        return app.onRunTopicAuditP1(command.target.topicId, command.target.signalId);
      case "openAuditReport":
        return app.onOpenAuditReport(command.target.topicId, command.stale);
      default:
        return undefined;
    }
  }
  const guardedPage = page as PopupPage;
  const pageComponentKind = getPageComponentKind(guardedPage);
  const allowedRailModes = getModeRailPages(activeFolderMode).filter(isRailMode);
  const guardedPrimaryMode: RailMode | null = isRailMode(guardedPage) && allowedRailModes.includes(guardedPage)
    ? guardedPage
    : null;
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
  const showProcessingContextStrip = Boolean(activeFolder) && shouldShowProcessingContextStrip(activeFolderMode, guardedPage);

  usePipelineUiReadyTrace(popupOpen && productSignalViewModel
    ? buildProductUiReadyEvent(productSignalViewModel)
    : null);
  usePipelineUiReadyTrace(popupOpen && guardedPage === "topic-detail" && topicDetailViewModel
    ? buildTopicUiReadyEvent(topicDetailViewModel)
    : null);
  usePipelineUiReadyTrace(popupOpen && guardedPage === "pr-evidence"
    ? buildPrEvidenceUiReadyEvent(app.prEvidenceViewModel)
    : null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prBriefInputRef = useRef<HTMLInputElement>(null);
  const [switchingWorkspaceMode, setSwitchingWorkspaceMode] = useState<WorkspaceSwitcherMode | null>(null);

  // Reset before paint so mode switches do not flash at the prior scrollTop.
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [guardedPage]);

  useEffect(() => {
    if (switchingWorkspaceMode === activeFolderMode) {
      setSwitchingWorkspaceMode(null);
    }
  }, [activeFolderMode, switchingWorkspaceMode]);

  async function handleSwitchWorkspace(mode: WorkspaceSwitcherMode) {
    if (switchingWorkspaceMode || mode === activeFolderMode) {
      return;
    }
    const startedAt = app.readInteractionNowMs();
    setSwitchingWorkspaceMode(mode);
    try {
      const response = await app.onSessionModeChange(mode);
      const popupDurationMs = Math.round(app.readInteractionNowMs() - startedAt);
      const serverDurationMs = response && "serverDurationMs" in response
        ? (response.serverDurationMs ?? null)
        : null;
      const storageSetMs = response && "storageSetMs" in response
        ? (response.storageSetMs ?? null)
        : null;
      const setModePath = response && "setModePath" in response
        ? (response.setModePath ?? null)
        : null;
      const overheadMs = serverDurationMs != null
        ? popupDurationMs - serverDurationMs
        : null;
      const payload = {
        from: activeFolderMode,
        to: mode,
        popupDurationMs,
        serverDurationMs,
        storageSetMs,
        setModePath,
        overheadMs
      };
      // JSON.stringify so Chrome bridges that flatten object payloads
      // still surface the breakdown (popup vs background vs IPC+reconcile).
      console.info("[DLens] workspace switch " + JSON.stringify(payload));
      if (typeof window !== "undefined") {
        const w = window as typeof window & {
          __DLENS_LAST_SWITCH_PERF__?: typeof payload;
          __DLENS_SWITCH_PERF_LOG__?: Array<typeof payload>;
        };
        w.__DLENS_LAST_SWITCH_PERF__ = payload;
        const log = w.__DLENS_SWITCH_PERF_LOG__ ?? [];
        log.push(payload);
        if (log.length > 20) log.shift();
        w.__DLENS_SWITCH_PERF_LOG__ = log;
      }
    } catch (error) {
      console.error("[DLens] workspace switch failed", error);
    } finally {
      setSwitchingWorkspaceMode(null);
    }
  }

  function handlePrEvidenceCommand(command: PrEvidenceCommand) {
    if (command.kind === "requestBriefUpload") {
      prBriefInputRef.current?.click();
      return;
    }
    return app.onPrEvidenceCommand(command);
  }

  if (!popupOpen) {
    return null;
  }

  return (
    <div
      ref={app.popupRef}
      data-dlens-control="true"
      data-workspace-popup="shell"
      data-paper-grain="true"
      style={{
        position: "fixed",
        right: 24,
        top: 82,
        width: getPageWidth(guardedPage),
        height: "min(86vh, 860px)",
        maxHeight: "min(86vh, 860px)",
        overflow: "hidden",
        borderRadius: tokens.radius.lg + 2,
        border: `1px solid ${tokens.color.glassBorder}`,
        boxShadow: `${tokens.shadow.popup}, inset 0 1px 0 ${tokens.color.shellSurface}`,
        zIndex: 2147483640,
        color: tokens.color.ink,
        fontFamily: tokens.font.sans,
        animation: "dlens-slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: "auto",
        isolation: "isolate"
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <style>{DLENS_BUTTON_CSS}</style>
      <div aria-hidden style={{
        position: "absolute",
        inset: 0,
        borderRadius: tokens.radius.lg + 2,
        background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.canvas})`,
        zIndex: 0,
        pointerEvents: "none"
      }} />
      <div
        ref={scrollRef}
        data-workspace-popup-scroll="viewport"
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          maxHeight: "min(86vh, 860px)",
          overflowY: "auto",
          overflowX: "hidden",
          borderRadius: tokens.radius.lg + 2,
          padding: `${tokens.spacing.section}px`,
          paddingBottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: tokens.spacing.md,
          scrollbarGutter: "stable both-edges"
        }}
      >
        <InPageCollectorFolderControls app={app} />

        <WorkspaceShell
          mode={guardedPage === "audit-report" ? "topics" : guardedPage}
          folderMode={activeFolderMode}
          onSwitchWorkspace={(mode) => void handleSwitchWorkspace(mode)}
          availableWorkspaceModes={WORKSPACE_SWITCHER_MODES}
          switchingWorkspaceMode={switchingWorkspaceMode}
          reserveContextStrip={showProcessingContextStrip}
          statusRail={(
            <StatusRail
              backendReachability={app.backendReachability}
              backendWorkUiState={app.backendWorkUiState}
              workerStatus={app.workerStatus}
              ready={app.processingSummary.ready}
              total={app.processingSummary.total}
            />
          )}
          header={(
            <div style={{ display: "grid", gap: 10 }}>
              <ModeRail
                activeMode={guardedPrimaryMode}
                modes={allowedRailModes}
                badgeCounts={{ casebook: app.savedAnalyses?.length ?? 0 }}
                onSelect={(mode) => void app.onNavigate(mode)}
              />
              <UtilityEdge active={guardedPage === "settings"} onSelect={() => void app.onNavigate("settings")} />
            </div>
          )}
          contextStrip={
            showProcessingContextStrip ? (
              <ProcessingStrip
                workerStatus={app.workerStatus}
                backendWorkUiState={app.backendWorkUiState}
                backendReachability={app.backendReachability}
                ready={app.processingSummary.ready}
                total={app.processingSummary.total}
                crawling={app.processingSummary.crawling}
                analyzing={app.processingSummary.analyzing}
                pending={app.processingSummary.pending}
              />
            ) : undefined
          }
        >
          {guardedPage === "library" ? (
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

          {guardedPage === "topics" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <TopicsListView
                topics={app.topics}
                signals={app.signals}
                sessionItems={activeFolder?.items ?? []}
                auditSummariesByTopicId={Object.fromEntries(
                  Object.entries(app.topicAuditByTopicId).map(([topicId, audit]) => [topicId, audit.summary])
                )}
                onOpenTopic={(topicId) => void app.onNavigateToTopic(topicId)}
                onCreateTopic={() => void app.onNavigate("collect")}
                onDeleteTopic={(topicId) => void app.onDeleteTopic(topicId)}
              />
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "topic-detail" || guardedPage === "casebook" ? (
            <WorkspaceSurface tone="utility">
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
                  onQueueItemById={(itemId) => void app.onQueueItemById(itemId)}
                  optimisticQueuedItemIds={app.optimisticQueuedIds}
                  onOpenAnalysis={(resultId) => void app.onOpenSavedAnalysis(resultId)}
                  onAddToCompare={(itemId) => app.onAddToCompare(itemId)}
                />
              )}
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "collect" ? (
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
                onSavePreview={() => void app.onSavePreview()}
                onOpenPreview={app.openPreview}
                onToggleCollectMode={() => void app.onToggleCollectMode()}
              />
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "compare" ? (
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

          {pageComponentKind === "product-signal" && productSignalViewModel ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <ProductSignalView
                viewModel={productSignalViewModel}
                exportFolders={productExportFolders}
                onCommand={onProductSignalCommand}
              />
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "pr-evidence" ? (
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

          {guardedPage === "result" ? (
            <InPageCollectorResultWorkspace
              app={app}
              activeFolder={activeFolder}
              resultItemA={resultItemA}
              resultItemB={resultItemB}
              attachedTopicIds={attachedTopicIds}
              homePage={homePage}
            />
          ) : null}

          {guardedPage === "settings" ? (
            <WorkspaceSurface tone="utility" style={SETTINGS_WORKSPACE_SURFACE_STYLE}>
              <SettingsView
                sessionMode={activeFolder?.mode ?? "topic"}
                canEditSessionMode
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
                onSessionModeChange={(mode) => void app.onSessionModeChange(mode)}
                onClearProductCache={() => void app.onClearProductCache()}
                createContextFileId={app.createContextFileId}
                onSaveSettings={() => void app.onSaveSettings()}
              />
            </WorkspaceSurface>
          ) : null}
        </WorkspaceShell>

        {snapshot?.tab.error ? (
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
  );
}

export const inPageCollectorPopupTestables = {
  shouldShowProcessingContextStrip,
  popupViewportBottomPadding: POPUP_VIEWPORT_BOTTOM_PADDING,
  settingsWorkspaceSurfaceStyle: SETTINGS_WORKSPACE_SURFACE_STYLE
};
