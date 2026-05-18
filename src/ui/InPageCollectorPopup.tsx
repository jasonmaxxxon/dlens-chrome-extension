import { useEffect, useRef } from "react";
import type { MainPage, PopupPage } from "../state/types";
import { CasebookView } from "./CasebookView";
import { CompareSetupView } from "./CompareSetupView";
import { CollectView } from "./CollectView";
import { DLENS_BUTTON_CSS, WorkspaceShell, WorkspaceSurface, ModeRail, UtilityEdge } from "./components";
import { ALLOWED_PAGES, getPopupWidth } from "../state/processing-state";
import { LibraryView } from "./LibraryView";
import { ProcessingStrip } from "./ProcessingStrip";
import { ProductSignalView } from "./ProductSignalViews";
import { PrEvidenceView } from "./PrEvidenceViews";
import { SettingsView } from "./SettingsView";
import { TopicDetailView } from "./TopicDetailView";
import { tokens } from "./tokens";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { InPageCollectorFolderControls } from "./InPageCollectorFolderControls";
import { InPageCollectorResultWorkspace } from "./InPageCollectorResultWorkspace";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

function shouldShowProcessingContextStrip(folderMode: string, page: PopupPage): boolean {
  if (folderMode === "product" || folderMode === "pr-evidence") {
    return false;
  }
  if (folderMode === "topic") {
    return page === "compare" || page === "result";
  }
  return page === "library" || page === "compare" || page === "result";
}

export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, page, popupOpen, activeFolder, resultItemA, resultItemB } = app;
  const activeFolderMode = activeFolder?.mode ?? "archive";
  type RailMode = Exclude<MainPage, "result">;
  const guardedPage = page as PopupPage;
  const guardedPrimaryMode: RailMode | null = guardedPage === "settings" || guardedPage === "result" ? null : guardedPage as RailMode;
  const allowedRailModes = ALLOWED_PAGES[activeFolderMode].filter((entry): entry is RailMode => entry !== "result");
  const homePage = ALLOWED_PAGES[activeFolderMode][0];
  const attachedTopicIds = app.activeSavedAnalysis
    ? app.topics.filter((topic) => topic.pairIds.includes(app.activeSavedAnalysis!.resultId)).map((topic) => topic.id)
    : [];

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [guardedPage]);

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
        width: getPopupWidth(guardedPage),
        height: "min(86vh, 860px)",
        maxHeight: "min(86vh, 860px)",
        overflow: "hidden",
        borderRadius: tokens.radius.lg + 2,
        border: `1px solid ${tokens.color.glassBorder}`,
        boxShadow: `${tokens.shadow.popup}, inset 0 1px 0 rgba(253,251,246,0.96)`,
        zIndex: 2147483640,
        color: tokens.color.ink,
        fontFamily: tokens.font.sans,
        animation: "dlens-slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
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
          paddingBottom: tokens.spacing.section + 8,
          display: "flex",
          flexDirection: "column",
          gap: tokens.spacing.md,
          scrollbarGutter: "stable both-edges"
        }}
      >
        <InPageCollectorFolderControls app={app} />

        <WorkspaceShell
          mode={guardedPage}
          folderMode={activeFolderMode}
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
            activeFolder && shouldShowProcessingContextStrip(activeFolderMode, guardedPage) ? (
              <ProcessingStrip
                workerStatus={app.workerStatus}
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
                folderAnalyzedCount={app.folderAnalyzedCount}
                folderContributingTopicCount={app.folderContributingTopicCount}
                onGenerateFolderSynthesis={() => void app.onGenerateFolderSynthesis()}
                onClearFolderSynthesis={() => void app.onClearFolderSynthesis()}
              />
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "casebook" ? (
            <WorkspaceSurface tone="utility">
              {app.activeTopic ? (
                <TopicDetailView
                  topic={app.activeTopic}
                  signals={app.activeTopicSignals}
                  pairs={app.activeTopicPairs}
                  sessionMode={app.activeFolderMode}
                  sessionItems={activeFolder?.items ?? []}
                  savedAnalyses={app.savedAnalyses}
                  signalPreviewById={app.signalPreviewById}
                  onBack={app.onBackFromTopicDetail}
                  onOpenPair={(resultId) => void app.onOpenTopicPair(resultId, app.activeTopic!.id)}
                  onUpdateTopic={(patch) => void app.onUpdateTopic(patch)}
                  onQueueItemById={(itemId) => void app.onQueueItemById(itemId)}
                  onAnalyzeItems={(itemIds) => app.onAnalyzeItems(itemIds)}
                  isBulkAnalyzing={app.bulkAnalyzingFolderId === activeFolder?.id}
                  optimisticQueuedItemIds={app.optimisticQueuedIds}
                  onOpenAnalysis={(resultId) => void app.onOpenSavedAnalysis(resultId)}
                  onAddToCompare={(itemId) => app.onAddToCompare(itemId)}
                  onSaveJudgmentOverride={(resultId, patch) => void app.onSaveJudgmentOverride(resultId, patch)}
                  onGenerateSynthesis={(topicId) => app.onGenerateTopicSynthesis(topicId)}
                  synthLayout={snapshot?.global.settings.layoutPreferences.topicSynthesisLayout}
                />
              ) : (
                <CasebookView
                  sessionId={activeFolder?.id || ""}
                  initialTopics={app.topics}
                  signals={app.signals}
                  signalPreviewById={app.signalPreviewById}
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
                folderName={activeFolder?.name || "No folder yet"}
                mode={activeFolderMode}
                isSaved={app.previewSaved}
                canSavePreview={activeFolderMode !== "pr-evidence" || Boolean(app.activePrCampaign)}
                disabledReason={activeFolderMode === "pr-evidence" && !app.activePrCampaign ? "先在 PR 頁建立 campaign，Collect 才能加入 evidence row。" : ""}
                selectionMode={Boolean(snapshot?.tab.selectionMode)}
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

          {guardedPage === "saved-signals" || guardedPage === "classification" || guardedPage === "actionable-filter" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <ProductSignalView
                kind={guardedPage}
                signals={app.signals}
                analyses={app.productSignalAnalyses}
                historicalAnalyses={app.historicalProductSignalAnalyses}
                agentTaskFeedback={app.productAgentTaskFeedback}
                signalReadings={app.signalReadings}
                productProfile={snapshot?.global.settings.productProfile ?? null}
                signalPreviewById={app.signalPreviewById}
                signalUrlById={app.signalUrlById}
                evidenceBySignalId={app.productSignalEvidenceById}
                signalReadinessById={app.productSignalReadinessById}
                aiProviderReady={app.productAiProviderReady}
                cardLayout={snapshot?.global.settings.layoutPreferences.productSignalCardLayout}
                analysisError={app.productSignalAnalysisError}
                analysisNotice={app.productSignalAnalysisNotice}
                isAnalyzing={app.isAnalyzingProductSignals}
                onAnalyze={() => void app.onAnalyzeProductSignals()}
                onSynthesizeSignalReading={app.onSynthesizeSignalReading}
                onReviewSignalReading={app.onReviewSignalReading}
                onGoToActionable={() => void app.onNavigate("actionable-filter")}
                onRemoveSignal={(signalId) => void app.onRemoveProductSignal(signalId)}
              />
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "pr-evidence" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <PrEvidenceView sessionId={activeFolder?.id || ""} />
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
            <WorkspaceSurface tone="utility">
              <SettingsView
                sessionMode={activeFolder?.mode ?? "topic"}
                canEditSessionMode
                draftBaseUrl={app.draftBaseUrl}
                draftProvider={app.draftProvider}
                draftOpenAiKey={app.draftOpenAiKey}
                draftClaudeKey={app.draftClaudeKey}
                draftGoogleKey={app.draftGoogleKey}
                draftLayoutPreferences={app.draftLayoutPreferences}
                draftProductProfile={app.draftProductProfile}
                compiledProductContext={app.compiledProductContext}
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
      </div>
    </div>
  );
}

export const inPageCollectorPopupTestables = {
  shouldShowProcessingContextStrip
};
