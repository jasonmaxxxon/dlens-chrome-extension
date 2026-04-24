import type { FolderMode, MainPage } from "../state/types";
import { CasebookView } from "./CasebookView";
import { CompareSetupView } from "./CompareSetupView";
import { CompareView } from "./CompareView";
import { CollectView } from "./CollectView";
import { InboxView } from "./InboxView";
import { WorkspaceShell, WorkspaceSurface, ModeRail, UtilityEdge, PrimaryButton, SecondaryButton, surfaceCardStyle } from "./components";
import { DEFAULT_POPUP_WIDTH, EXPANDED_COMPARE_POPUP_WIDTH } from "../state/processing-state";
import { LibraryView } from "./LibraryView";
import { ProcessingStrip } from "./ProcessingStrip";
import { SettingsView } from "./SettingsView";
import { TopicDetailView } from "./TopicDetailView";
import { tokens } from "./tokens";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { buildDateRangeLabel } from "./inpage-helpers";
import { InPageCollectorFolderControls } from "./InPageCollectorFolderControls";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

const ALLOWED_PAGES: Record<FolderMode, MainPage[]> = {
  archive: ["library", "collect"],
  topic: ["casebook", "inbox", "collect", "compare"],
  product: ["casebook", "inbox", "collect", "compare"]
};

function guardPage(page: MainPage, mode: FolderMode): MainPage {
  const allowed = ALLOWED_PAGES[mode];
  return allowed.includes(page) ? page : allowed[0]!;
}

export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, page, popupOpen, activeFolder, resultSurface, resultItemA, resultItemB, resultSelection, compareTeaser } = app;
  const activeFolderMode = activeFolder?.mode ?? "archive";
  const guardedPage = page === "settings" ? "settings" : guardPage(page, activeFolderMode);
  const guardedPrimaryMode = guardedPage === "settings" || guardedPage === "result" ? null : guardedPage;
  const allowedRailModes = ALLOWED_PAGES[activeFolderMode].filter((entry): entry is Exclude<MainPage, "result"> => entry !== "result");
  const homePage = ALLOWED_PAGES[activeFolderMode][0];
  const attachedTopicIds = app.activeSavedAnalysis
    ? app.topics.filter((topic) => topic.pairIds.includes(app.activeSavedAnalysis!.resultId)).map((topic) => topic.id)
    : [];

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
        width: guardedPage === "compare" || guardedPage === "result" ? EXPANDED_COMPARE_POPUP_WIDTH : DEFAULT_POPUP_WIDTH,
        maxHeight: "min(80vh, 820px)",
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
      <div aria-hidden style={{
        position: "absolute",
        inset: 0,
        borderRadius: tokens.radius.lg + 2,
        background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.canvas})`,
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
          gap: tokens.spacing.md,
          scrollbarGutter: "stable both-edges"
        }}
      >
        <InPageCollectorFolderControls app={app} />

        <WorkspaceShell
          mode={guardedPage}
          header={(
            <div style={{ display: "grid", gap: 10 }}>
              <ModeRail activeMode={guardedPrimaryMode} modes={allowedRailModes} onSelect={(mode) => void app.onNavigate(mode)} />
              <UtilityEdge active={guardedPage === "settings"} onSelect={() => void app.onNavigate("settings")} />
            </div>
          )}
          contextStrip={
            activeFolder ? (
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
                onGoToCollect={() => void app.onNavigate("collect")}
                onGoToCompare={() => void app.onNavigate("compare")}
                onOpenSavedAnalysis={(resultId) => void app.onOpenSavedAnalysis(resultId)}
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
                  onBack={app.onBackFromTopicDetail}
                  onOpenPair={(resultId) => void app.onOpenTopicPair(resultId, app.activeTopic!.id)}
                  onUpdateTopic={(patch) => void app.onUpdateTopic(patch)}
                  onSaveJudgmentOverride={(resultId, patch) => void app.onSaveJudgmentOverride(resultId, patch)}
                />
              ) : (
                <CasebookView
                  sessionId={activeFolder?.id || ""}
                  initialTopics={app.topics}
                  pendingSignalCount={app.signals.filter((signal) => signal.inboxStatus === "unprocessed").length}
                  onNavigateToTopic={(topicId) => void app.onNavigateToTopic(topicId)}
                  onCreateTopic={() => void app.onCreateTopic()}
                />
              )}
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "inbox" ? (
            <WorkspaceSurface tone="utility">
              <InboxView
                sessionId={activeFolder?.id || ""}
                topics={app.topics}
                initialSignals={app.signals}
                signalPreviewById={app.signalPreviewById}
                showJudgmentBadges={app.activeFolderMode === "product"}
                judgmentByTopicId={app.topicJudgmentById}
                onSignalTriaged={(signalId, action) => void app.onSignalTriaged(signalId, action)}
              />
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "collect" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <CollectView
                preview={app.preview ?? null}
                folderName={activeFolder?.name || "No folder yet"}
                isSaved={app.previewSaved}
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

          {guardedPage === "result" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              {resultSurface.mode === "empty" ? (
                <div style={{ display: "grid", gap: 12, padding: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: tokens.color.ink }}>尚未建立分析</div>
                  <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
                    先在「比較」選兩篇貼文，生成 teaser，再進入完整分析。
                  </div>
                  <PrimaryButton onClick={() => void app.onNavigate("compare")}>前往比較</PrimaryButton>
                </div>
              ) : activeFolder && resultItemA && resultItemB ? (
                <div style={{ display: "grid", gap: 10, paddingBottom: 24 }}>
                  {app.activeSavedAnalysis ? (
                    <div style={surfaceCardStyle({ padding: "12px 14px", display: "grid", gap: 8, boxShadow: tokens.shadow.glass, background: tokens.color.elevated })}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tokens.color.accent, background: tokens.color.accentSoft, borderRadius: tokens.radius.sm, padding: "2px 8px" }}>
                          已儲存分析
                        </span>
                        <span style={{ fontSize: 11, color: tokens.color.softInk }}>
                          {app.activeSavedAnalysis.dateRangeLabel}
                        </span>
                      </div>
                      <div style={{ fontFamily: tokens.font.sans, fontSize: 20, lineHeight: 1.2, fontWeight: 700, letterSpacing: 0, color: tokens.color.ink }}>
                        {app.activeSavedAnalysis.headline}
                      </div>
                      <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
                        {app.activeSavedAnalysis.deck}
                      </div>
                      <div style={{ display: "grid", gap: 6, borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.line}`, background: tokens.color.surface, padding: "10px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: tokens.color.softInk, letterSpacing: 0 }}>
                            Judgment
                          </span>
                          {app.activeSavedAnalysis.judgmentResult ? (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: tokens.color.success, background: tokens.color.successSoft, borderRadius: 999, padding: "3px 8px" }}>
                              {app.activeSavedAnalysis.judgmentResult.recommendedState.toUpperCase()} · R{app.activeSavedAnalysis.judgmentResult.relevance}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>
                              尚未產生
                            </span>
                          )}
                        </div>
                        {app.activeSavedAnalysis.judgmentResult ? (
                          <>
                            <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.55 }}>
                              {app.activeSavedAnalysis.judgmentResult.whyThisMatters}
                            </div>
                            <div style={{ fontSize: 11, color: tokens.color.softInk, lineHeight: 1.5 }}>
                              下一步：{app.activeSavedAnalysis.judgmentResult.actionCue}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11.5, color: tokens.color.softInk, lineHeight: 1.55 }}>
                            先用產品資料補一層 relevance / action 判斷，再決定這份分析要不要往前推。
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
                        <PrimaryButton onClick={() => void app.onSaveCurrentAnalysis()} disabled={!compareTeaser || Boolean(resultSelection?.saved)}>
                          {resultSelection?.saved ? "已儲存" : "儲存分析"}
                        </PrimaryButton>
                        <SecondaryButton onClick={() => void app.onStartJudgment()} disabled={!app.canStartJudgment || app.isGeneratingJudgment}>
                          {app.isGeneratingJudgment
                            ? "判斷中…"
                            : app.activeSavedAnalysis.judgmentResult
                              ? "重新判斷"
                              : app.canStartJudgment
                                ? "產品判斷"
                                : "先填產品資料"}
                        </SecondaryButton>
                        <SecondaryButton onClick={() => void app.onNavigate("compare")}>返回比較</SecondaryButton>
                      </div>
                    </div>
                  ) : (
                    <div style={surfaceCardStyle({ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", boxShadow: tokens.shadow.glass, background: tokens.color.elevated })}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tokens.color.success, background: tokens.color.successSoft, borderRadius: tokens.radius.sm, padding: "2px 8px" }}>
                          分析就緒
                        </span>
                        <span style={{ fontSize: 11, color: tokens.color.softInk }}>
                          {buildDateRangeLabel(resultItemA.descriptor.time_token_hint, resultItemB.descriptor.time_token_hint)}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <PrimaryButton onClick={() => void app.onSaveCurrentAnalysis()} disabled={!compareTeaser}>
                          儲存分析
                        </PrimaryButton>
                        <SecondaryButton onClick={() => void app.onNavigate("compare")}>返回比較</SecondaryButton>
                      </div>
                    </div>
                  )}
                  <CompareView
                    session={activeFolder}
                    settings={app.compareViewSettings}
                    onGoToLibrary={() => void app.onNavigate(homePage)}
                    forcedSelection={{ itemAId: resultItemA.id, itemBId: resultItemB.id }}
                    fromTopicId={app.resultTopicContext?.topicId}
                    fromTopicName={app.resultTopicContext?.topicName}
                    onReturnToTopic={() => void app.onReturnToTopic()}
                    topics={app.topics}
                    activeResultId={app.activeSavedAnalysis?.resultId ?? null}
                    attachedTopicIds={attachedTopicIds}
                    onAttachToTopic={(topicId) => void app.onAttachActiveResultToTopic(topicId)}
                    hideSelector
                  />
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, padding: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: tokens.color.ink }}>分析結果暫時不可用</div>
                  <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>
                    對應貼文已不在目前資料庫，先回到比較或資料庫重新建立結果。
                  </div>
                  <SecondaryButton onClick={() => void app.onNavigate("compare")}>回到比較</SecondaryButton>
                </div>
              )}
            </WorkspaceSurface>
          ) : null}

          {guardedPage === "settings" ? (
            <WorkspaceSurface tone="utility">
              <SettingsView
                sessionMode={activeFolder?.mode ?? "topic"}
                canEditSessionMode={Boolean(activeFolder)}
                draftBaseUrl={app.draftBaseUrl}
                draftProvider={app.draftProvider}
                draftOpenAiKey={app.draftOpenAiKey}
                draftClaudeKey={app.draftClaudeKey}
                draftGoogleKey={app.draftGoogleKey}
                draftProductProfile={app.draftProductProfile}
                productProfileSeedText={app.productProfileSeedText}
                isInitializingProductProfile={app.isInitializingProductProfile}
                onDraftBaseUrlChange={app.setDraftBaseUrl}
                onDraftProviderChange={app.setDraftProvider}
                onDraftOpenAiKeyChange={app.setDraftOpenAiKey}
                onDraftClaudeKeyChange={app.setDraftClaudeKey}
                onDraftGoogleKeyChange={app.setDraftGoogleKey}
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
