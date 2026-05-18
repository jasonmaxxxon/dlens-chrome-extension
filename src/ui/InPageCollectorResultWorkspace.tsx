import type { MainPage } from "../state/types";
import { CompareView } from "./CompareView";
import { PrimaryButton, SecondaryButton, WorkspaceSurface, surfaceCardStyle } from "./components";
import { buildDateRangeLabel } from "./inpage-helpers";
import { tokens } from "./tokens";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

export function InPageCollectorResultWorkspace({
  app,
  activeFolder,
  resultItemA,
  resultItemB,
  attachedTopicIds,
  homePage
}: {
  app: InPageCollectorAppModel;
  activeFolder: InPageCollectorAppModel["activeFolder"];
  resultItemA: InPageCollectorAppModel["resultItemA"];
  resultItemB: InPageCollectorAppModel["resultItemB"];
  attachedTopicIds: string[];
  homePage: MainPage;
}) {
  const { resultSurface, resultSelection, compareTeaser } = app;
  return (
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
                <span style={{ fontSize: 11, color: tokens.color.softInk }}>{app.activeSavedAnalysis.dateRangeLabel}</span>
              </div>
              <div style={{ fontFamily: tokens.font.sans, fontSize: 20, lineHeight: 1.2, fontWeight: 700, letterSpacing: 0, color: tokens.color.ink }}>
                {app.activeSavedAnalysis.headline}
              </div>
              <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.6 }}>{app.activeSavedAnalysis.deck}</div>
              <div style={{ display: "grid", gap: 6, borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.line}`, background: tokens.color.surface, padding: "10px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: tokens.color.softInk, letterSpacing: 0 }}>Judgment</span>
                  {app.activeSavedAnalysis.judgmentResult ? (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: tokens.color.success, background: tokens.color.successSoft, borderRadius: 999, padding: "3px 8px" }}>
                      {app.activeSavedAnalysis.judgmentResult.recommendedState.toUpperCase()} · R{app.activeSavedAnalysis.judgmentResult.relevance}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>尚未產生</span>
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
                  {app.isGeneratingJudgment ? "判斷中…" : app.activeSavedAnalysis.judgmentResult ? "重新判斷" : app.canStartJudgment ? "產品判斷" : "先填產品資料"}
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
                <PrimaryButton onClick={() => void app.onSaveCurrentAnalysis()} disabled={!compareTeaser}>儲存分析</PrimaryButton>
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
            compareLayout={app.snapshot?.global.settings.layoutPreferences.compareResultLayout}
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
  );
}
