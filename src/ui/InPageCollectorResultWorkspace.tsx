import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MainPage } from "../state/types";
import { CompareView } from "./CompareView";
import type { CompareBrief } from "../compare/brief";
import type { ClusterInterpretation } from "../compare/cluster-interpretation";
import type { EvidenceAnnotation } from "../compare/evidence-annotation";
import { buildTechniqueReadingSnapshot } from "../compare/technique-reading";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace";
import {
  buildReconcileIgnoredEvent,
  createRequestReconciler,
  type RequestReconcileDecision,
  type RequestReconcileTarget,
  type RequestReconcileToken
} from "../state/request-reconcile";
import { buildCompareViewModel, type CompareCommand, type CompareFetchedState } from "../viewmodel/compare";
import { PrimaryButton, SecondaryButton, WorkspaceSurface, surfaceCardStyle } from "./components";
import { sendExtensionMessage } from "./controller";
import { buildDateRangeLabel } from "./inpage-helpers";
import { buildCompareUiReadyEvent, usePipelineUiReadyTrace } from "./pipeline-ui-ready";
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
          <CompareResultViewModelBoundary
            app={app}
            activeFolder={activeFolder}
            resultItemA={resultItemA}
            resultItemB={resultItemB}
            attachedTopicIds={attachedTopicIds}
            homePage={homePage}
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

function requestKey(value: unknown): string {
  return value ? JSON.stringify(value) : "";
}

type CompareBriefResponse =
  | { ok: true; compareBrief?: CompareBrief | null }
  | { ok: false; error: string };

type CompareClusterSummariesResponse =
  | { ok: true; clusterInterpretations?: ClusterInterpretation[] }
  | { ok: false; error: string };

type CompareEvidenceAnnotationsResponse =
  | { ok: true; evidenceAnnotations?: EvidenceAnnotation[] }
  | { ok: false; error: string };

type CompareAsyncCommand =
  | Extract<CompareCommand, { kind: "fetchBrief" }>
  | Extract<CompareCommand, { kind: "fetchClusterSummaries" }>
  | Extract<CompareCommand, { kind: "fetchEvidenceAnnotations" }>;

function compareCommandTarget(command: CompareAsyncCommand): RequestReconcileTarget {
  return {
    sessionId: command.target.sessionId,
    itemAId: command.target.itemAId,
    itemBId: command.target.itemBId
  };
}

export function applyCompareBriefResult(
  current: CompareFetchedState,
  response: CompareBriefResponse,
  settled: RequestReconcileDecision
): CompareFetchedState {
  if (!settled.accepted) {
    return current;
  }
  if (response.ok && response.compareBrief) {
    return {
      ...current,
      brief: response.compareBrief ?? null,
      briefState: response.compareBrief?.source === "ai" ? "ready" : "fallback"
    };
  }
  return {
    ...current,
    brief: null,
    briefState: "fallback"
  };
}

export function applyCompareClusterSummariesResult(
  current: CompareFetchedState,
  response: CompareClusterSummariesResponse,
  settled: RequestReconcileDecision
): CompareFetchedState {
  if (!settled.accepted) {
    return current;
  }
  if (response.ok && response.clusterInterpretations?.length) {
    return {
      ...current,
      clusterInterpretations: response.clusterInterpretations ?? [],
      clusterSummaryState: "ready"
    };
  }
  return {
    ...current,
    clusterInterpretations: [],
    clusterSummaryState: "idle"
  };
}

export function applyCompareEvidenceAnnotationsResult(
  current: CompareFetchedState,
  response: CompareEvidenceAnnotationsResponse,
  settled: RequestReconcileDecision
): CompareFetchedState {
  if (!settled.accepted) {
    return current;
  }
  if (response.ok && response.evidenceAnnotations?.length) {
    return {
      ...current,
      evidenceAnnotations: response.evidenceAnnotations ?? []
    };
  }
  return {
    ...current,
    evidenceAnnotations: []
  };
}

function CompareResultViewModelBoundary({
  app,
  activeFolder,
  resultItemA,
  resultItemB,
  attachedTopicIds,
  homePage
}: {
  app: InPageCollectorAppModel;
  activeFolder: NonNullable<InPageCollectorAppModel["activeFolder"]>;
  resultItemA: NonNullable<InPageCollectorAppModel["resultItemA"]>;
  resultItemB: NonNullable<InPageCollectorAppModel["resultItemB"]>;
  attachedTopicIds: string[];
  homePage: MainPage;
}) {
  const [selectedA, setSelectedA] = useState(resultItemA.id);
  const [selectedB, setSelectedB] = useState(resultItemB.id);
  const [fetched, setFetched] = useState<CompareFetchedState>({
    brief: null,
    briefState: "idle",
    clusterInterpretations: [],
    clusterSummaryState: "idle",
    evidenceAnnotations: []
  });
  const requestReconcilerRef = useRef(createRequestReconciler());

  useEffect(() => {
    setSelectedA(resultItemA.id);
    setSelectedB(resultItemB.id);
  }, [resultItemA.id, resultItemB.id]);

  const currentCompareTarget = useMemo<RequestReconcileTarget>(() => ({
    sessionId: activeFolder.id,
    itemAId: selectedA,
    itemBId: selectedB
  }), [activeFolder.id, selectedA, selectedB]);
  const currentCompareTargetRef = useRef(currentCompareTarget);
  currentCompareTargetRef.current = currentCompareTarget;

  const settleCompareResponse = useCallback((token: RequestReconcileToken): RequestReconcileDecision => {
    const decision = requestReconcilerRef.current.complete(token, {
      currentTarget: currentCompareTargetRef.current
    });
    if (!decision.accepted) {
      emitPipelineEvent(buildReconcileIgnoredEvent(token, decision));
    }
    return decision;
  }, []);

  const viewModel = useMemo(
    () => buildCompareViewModel({
      session: activeFolder,
      settings: app.compareViewSettings,
      selectedAId: selectedA,
      selectedBId: selectedB,
      forcedSelection: { itemAId: resultItemA.id, itemBId: resultItemB.id },
      fromTopicId: app.resultTopicContext?.topicId,
      fromTopicName: app.resultTopicContext?.topicName,
      topics: app.topics,
      activeResultId: app.activeSavedAnalysis?.resultId ?? null,
      attachedTopicIds,
      compareLayout: app.snapshot?.global.settings.layoutPreferences.compareResultLayout,
      hideSelector: true,
      fetched
    }),
    [
      activeFolder,
      app.compareViewSettings,
      app.resultTopicContext?.topicId,
      app.resultTopicContext?.topicName,
      app.topics,
      app.activeSavedAnalysis?.resultId,
      app.snapshot?.global.settings.layoutPreferences.compareResultLayout,
      attachedTopicIds,
      fetched,
      resultItemA.id,
      resultItemB.id,
      selectedA,
      selectedB
    ]
  );
  usePipelineUiReadyTrace(buildCompareUiReadyEvent(viewModel));

  const onCommand = useCallback(async (command: CompareCommand): Promise<unknown> => {
    switch (command.kind) {
      case "goToLibrary":
        await app.onNavigate(homePage);
        return undefined;
      case "returnToTopic":
        await app.onReturnToTopic();
        return undefined;
      case "selectPair":
        setSelectedA(command.target.itemAId);
        setSelectedB(command.target.itemBId);
        return undefined;
      case "attachToTopic":
        if (command.target.topicId) {
          await app.onAttachActiveResultToTopic(command.target.topicId);
        }
        return undefined;
      case "fetchBrief":
        return sendExtensionMessage<{ ok: true; compareBrief?: CompareBrief | null } | { ok: false; error: string }>({
          type: "compare/get-brief",
          request: command.request
        });
      case "fetchClusterSummaries":
        return sendExtensionMessage<{ ok: true; clusterInterpretations?: ClusterInterpretation[] } | { ok: false; error: string }>({
          type: "compare/get-cluster-summaries",
          request: command.request
        });
      case "fetchEvidenceAnnotations":
        return sendExtensionMessage<{ ok: true; evidenceAnnotations?: EvidenceAnnotation[] } | { ok: false; error: string }>({
          type: "compare/get-evidence-annotations",
          request: command.request
        });
      case "saveTechniqueReading": {
        const snapshot = buildTechniqueReadingSnapshot({
          sessionId: command.target.sessionId,
          itemId: command.target.itemId,
          side: command.target.side,
          clusterKey: command.target.clusterKey,
          detail: command.detail
        });
        const response = await sendExtensionMessage<{ ok: true } | { ok: false; error: string }>({
          type: "compare/save-technique-reading",
          snapshot
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
        return response;
      }
    }
  }, [app, homePage]);

  const fetchBriefAction = viewModel.actions.find((action): action is Extract<CompareCommand, { kind: "fetchBrief" }> => action.kind === "fetchBrief") ?? null;
  const fetchBriefKey = requestKey(fetchBriefAction?.request);
  useEffect(() => {
    if (!fetchBriefAction) {
      setFetched((current) => ({ ...current, brief: null, briefState: "idle" }));
      return;
    }
    let cancelled = false;
    const requestId = createPipelineRequestId("compare-brief");
    const token = requestReconcilerRef.current.begin({
      lane: "compare.fetchBrief",
      requestId,
      target: compareCommandTarget(fetchBriefAction)
    });
    setFetched((current) => ({ ...current, briefState: "loading" }));
    void sendExtensionMessage<{ ok: true; compareBrief?: CompareBrief | null } | { ok: false; error: string }>({
      type: "compare/get-brief",
      requestId,
      request: fetchBriefAction.request
    })
      .then((response) => {
        const settled = settleCompareResponse(token);
        if (cancelled) return;
        setFetched((current) => applyCompareBriefResult(current, response, settled));
      })
      .catch(() => {
        const settled = settleCompareResponse(token);
        if (!cancelled && settled.accepted) {
          setFetched((current) => ({ ...current, brief: null, briefState: "fallback" }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchBriefKey, settleCompareResponse]);

  const fetchClusterAction = viewModel.actions.find((action): action is Extract<CompareCommand, { kind: "fetchClusterSummaries" }> => action.kind === "fetchClusterSummaries") ?? null;
  const fetchClusterKey = requestKey(fetchClusterAction?.request);
  useEffect(() => {
    if (!fetchClusterAction) {
      setFetched((current) => ({ ...current, clusterInterpretations: [], clusterSummaryState: "idle" }));
      return;
    }
    let cancelled = false;
    const requestId = createPipelineRequestId("compare-cluster-summaries");
    const token = requestReconcilerRef.current.begin({
      lane: "compare.fetchClusterSummaries",
      requestId,
      target: compareCommandTarget(fetchClusterAction)
    });
    setFetched((current) => ({ ...current, clusterSummaryState: "loading" }));
    void sendExtensionMessage<{ ok: true; clusterInterpretations?: ClusterInterpretation[] } | { ok: false; error: string }>({
      type: "compare/get-cluster-summaries",
      requestId,
      request: fetchClusterAction.request
    })
      .then((response) => {
        const settled = settleCompareResponse(token);
        if (cancelled) return;
        setFetched((current) => applyCompareClusterSummariesResult(current, response, settled));
      })
      .catch(() => {
        const settled = settleCompareResponse(token);
        if (!cancelled && settled.accepted) {
          setFetched((current) => ({ ...current, clusterInterpretations: [], clusterSummaryState: "error" }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchClusterKey, settleCompareResponse]);

  const fetchAnnotationAction = viewModel.actions.find((action): action is Extract<CompareCommand, { kind: "fetchEvidenceAnnotations" }> => action.kind === "fetchEvidenceAnnotations") ?? null;
  const fetchAnnotationKey = requestKey(fetchAnnotationAction?.request);
  useEffect(() => {
    if (!fetchAnnotationAction) {
      setFetched((current) => ({ ...current, evidenceAnnotations: [] }));
      return;
    }
    let cancelled = false;
    const requestId = createPipelineRequestId("compare-evidence-annotations");
    const token = requestReconcilerRef.current.begin({
      lane: "compare.fetchEvidenceAnnotations",
      requestId,
      target: compareCommandTarget(fetchAnnotationAction)
    });
    void sendExtensionMessage<{ ok: true; evidenceAnnotations?: EvidenceAnnotation[] } | { ok: false; error: string }>({
      type: "compare/get-evidence-annotations",
      requestId,
      request: fetchAnnotationAction.request
    })
      .then((response) => {
        const settled = settleCompareResponse(token);
        if (cancelled) return;
        setFetched((current) => applyCompareEvidenceAnnotationsResult(current, response, settled));
      })
      .catch(() => {
        const settled = settleCompareResponse(token);
        if (!cancelled && settled.accepted) {
          setFetched((current) => ({ ...current, evidenceAnnotations: [] }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAnnotationKey, settleCompareResponse]);

  return <CompareView viewModel={viewModel} onCommand={onCommand} />;
}
