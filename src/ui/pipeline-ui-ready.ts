import { useEffect, useRef } from "react";

import {
  emitPipelineEvent,
  isQaTraceEnabled,
  type PipelineEventInput,
  type PipelineResult
} from "../state/pipeline-trace";
import type { LoadState } from "../state/load-state";
import type { CompareViewModel } from "../viewmodel/compare";
import type { PrEvidenceViewModel } from "../viewmodel/pr-evidence";
import type { ProductSignalWorkspaceViewModel } from "../viewmodel/product-signal";
import type { TopicDetailViewModel } from "../viewmodel/topic-detail";

type CountableState = string | null | undefined;

function resultFromLoadState(loadState: LoadState): PipelineResult {
  if (loadState === "loading") {
    return "pending";
  }
  if (loadState === "error") {
    return "error";
  }
  return "ok";
}

function countStates(states: CountableState[]): Record<string, number> {
  return states.reduce<Record<string, number>>((counts, state) => {
    if (!state) {
      return counts;
    }
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {});
}

function traceKey(event: PipelineEventInput): string {
  return JSON.stringify(event);
}

export function buildProductUiReadyEvent(viewModel: ProductSignalWorkspaceViewModel): PipelineEventInput {
  const result = viewModel.isAnalyzing ? "pending" : resultFromLoadState(viewModel.loadState);
  return {
    phase: "ui.ready",
    step: `popup.product.vm.${viewModel.loadState}`,
    target: viewModel.sessionId ? { sessionId: viewModel.sessionId } : {},
    result,
    detail: {
      surface: "product",
      kind: viewModel.kind,
      loadState: viewModel.loadState,
      signalCount: viewModel.signalCount,
      completedAnalysisCount: viewModel.completedAnalysisCount,
      isAnalyzing: viewModel.isAnalyzing,
      canAnalyze: viewModel.canAnalyze,
      analysisCounts: countStates(viewModel.signals.map((signal) => signal.analysisState))
    }
  };
}

export function buildTopicUiReadyEvent(viewModel: TopicDetailViewModel): PipelineEventInput {
  return {
    phase: "ui.ready",
    step: `popup.topic.vm.${viewModel.loadState}`,
    target: { sessionId: viewModel.sessionId },
    result: resultFromLoadState(viewModel.loadState),
    detail: {
      surface: "topic",
      topicId: viewModel.topic.id,
      loadState: viewModel.loadState,
      signalCount: viewModel.signalRows.length,
      analysisCounts: viewModel.analysisCounts,
      auditReportStatus: viewModel.audit.summary.reportStatus
    }
  };
}

export function buildCompareUiReadyEvent(viewModel: CompareViewModel): PipelineEventInput {
  const status = viewModel.availability.ready ? viewModel.brief.loadState : "empty";
  const itemAId = (viewModel.selection.itemA?.id ?? viewModel.selection.selectedA) || "";
  const itemBId = (viewModel.selection.itemB?.id ?? viewModel.selection.selectedB) || "";
  return {
    phase: "ui.ready",
    step: `popup.compare.vm.${status}`,
    target: itemAId
      ? { sessionId: viewModel.sessionId, itemId: itemAId }
      : { sessionId: viewModel.sessionId },
    result: resultFromLoadState(status),
    detail: {
      surface: "compare",
      availability: viewModel.availability.reason,
      itemAId,
      itemBId,
      briefState: viewModel.brief.state,
      briefLoadState: viewModel.brief.loadState,
      briefProvenance: viewModel.brief.provenance,
      clusterSummaryState: viewModel.clusters.summaryState,
      evidenceAnnotationCount: viewModel.evidenceAnnotations.length
    }
  };
}

function isPrEvidenceBusy(viewModel: PrEvidenceViewModel): boolean {
  return Boolean(
    viewModel.ui.isSaving
      || viewModel.ui.isReadingBrief
      || viewModel.ui.isGeneratingCriteria
      || viewModel.ui.isMatching
      || viewModel.ui.isFetchingAdvancedMetrics
      || viewModel.ui.isGeneratingSummary
  );
}

export function buildPrEvidenceUiReadyEvent(viewModel: PrEvidenceViewModel): PipelineEventInput {
  const busy = isPrEvidenceBusy(viewModel);
  const hasError = Boolean(viewModel.uploadError);
  return {
    phase: "ui.ready",
    step: `popup.pr-evidence.vm.${hasError ? "error" : busy ? "pending" : "ready"}`,
    target: viewModel.sessionId ? { sessionId: viewModel.sessionId } : {},
    result: hasError ? "error" : busy ? "pending" : "ok",
    detail: {
      surface: "pr-evidence",
      campaignId: viewModel.campaign.id,
      campaignSaved: viewModel.campaign.saved,
      rowCount: viewModel.rows.length,
      activePane: viewModel.workingArea.activePane,
      matchedCells: viewModel.workingArea.match.matchedCells,
      totalCells: viewModel.workingArea.match.totalCells,
      busy
    }
  };
}

export function usePipelineUiReadyTrace(event: PipelineEventInput | null | undefined): void {
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (!event) {
      lastKeyRef.current = "";
      return;
    }
    if (!isQaTraceEnabled()) {
      return;
    }
    const nextKey = traceKey(event);
    if (nextKey === lastKeyRef.current) {
      return;
    }
    lastKeyRef.current = nextKey;
    emitPipelineEvent(event);
  }, [event]);
}
