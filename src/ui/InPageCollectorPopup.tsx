import { CompareSetupView } from "./CompareSetupView";
import { CompareView } from "./CompareView";
import { CollectView } from "./CollectView";
import { WorkspaceShell, WorkspaceSurface, ModeRail, UtilityEdge, PrimaryButton, SecondaryButton } from "./components";
import { DEFAULT_POPUP_WIDTH, EXPANDED_COMPARE_POPUP_WIDTH } from "../state/processing-state";
import { LibraryView } from "./LibraryView";
import { ProcessingStrip } from "./ProcessingStrip";
import { SettingsView } from "./SettingsView";
import { tokens } from "./tokens";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { buildDateRangeLabel } from "./inpage-helpers";
import { InPageCollectorFolderControls } from "./InPageCollectorFolderControls";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, page, popupOpen, activeFolder, resultSurface, resultItemA, resultItemB, resultSelection, compareTeaser } = app;

  if (!popupOpen) {
    return null;
  }

  return (
    <div
      ref={app.popupRef}
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
        <InPageCollectorFolderControls app={app} />

        <WorkspaceShell
          mode={page}
          header={(
            <>
              <ModeRail activeMode={app.primaryMode} onSelect={(mode) => void app.onNavigate(mode)} />
              <UtilityEdge active={page === "settings"} onSelect={() => void app.onNavigate("settings")} />
            </>
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
          {page === "library" ? (
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
              />
            </WorkspaceSurface>
          ) : null}

          {page === "collect" ? (
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

          {page === "compare" ? (
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

          {page === "result" ? (
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
                        <PrimaryButton onClick={() => void app.onSaveCurrentAnalysis()} disabled={!compareTeaser || Boolean(resultSelection?.saved)}>
                          {resultSelection?.saved ? "已儲存" : "儲存分析"}
                        </PrimaryButton>
                        <SecondaryButton onClick={() => void app.onNavigate("compare")}>返回比較</SecondaryButton>
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
                    onGoToLibrary={() => void app.onNavigate("library")}
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
                  <SecondaryButton onClick={() => void app.onNavigate("compare")}>回到比較</SecondaryButton>
                </div>
              )}
            </WorkspaceSurface>
          ) : null}

          {page === "settings" ? (
            <WorkspaceSurface tone="utility">
              <SettingsView
                draftBaseUrl={app.draftBaseUrl}
                draftProvider={app.draftProvider}
                draftOpenAiKey={app.draftOpenAiKey}
                draftClaudeKey={app.draftClaudeKey}
                draftGoogleKey={app.draftGoogleKey}
                onDraftBaseUrlChange={app.setDraftBaseUrl}
                onDraftProviderChange={app.setDraftProvider}
                onDraftOpenAiKeyChange={app.setDraftOpenAiKey}
                onDraftClaudeKeyChange={app.setDraftClaudeKey}
                onDraftGoogleKeyChange={app.setDraftGoogleKey}
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
