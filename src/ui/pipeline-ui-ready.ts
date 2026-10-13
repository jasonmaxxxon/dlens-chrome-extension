import { useEffect,useRef } from "react";

import {
emitPipelineEvent,
isQaTraceEnabled,
type PipelineEventInput
} from "../state/pipeline-trace";
import type { PrEvidenceViewModel } from "../viewmodel/pr-evidence";

function traceKey(event: PipelineEventInput): string {
  return JSON.stringify(event);
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
