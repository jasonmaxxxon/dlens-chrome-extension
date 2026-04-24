import { useMemo, useState } from "react";

import { buildSavedAnalysisSnapshot } from "../compare/saved-analysis-storage";
import { findSavedAnalysisByResultId, resolveAnalysisResultSurface } from "../state/analysis-result-state";
import type { PopupWorkspaceState } from "../state/processing-state";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type {
  ActiveAnalysisResult,
  ProductProfile,
  SavedAnalysisSnapshot,
  SessionItem,
  SessionRecord
} from "../state/types";
import type { CompareSetupTeaser } from "./CompareSetupView";
import { buildDateRangeLabel, buildResultId, comparePairKey } from "./inpage-helpers";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

export function buildActiveResultFromSavedAnalysis(
  savedAnalysis: SavedAnalysisSnapshot,
  viewedAt: string
): ActiveAnalysisResult {
  return {
    resultId: savedAnalysis.resultId,
    compareKey: savedAnalysis.compareKey,
    itemAId: savedAnalysis.itemAId,
    itemBId: savedAnalysis.itemBId,
    saved: true,
    viewedAt
  };
}

export function buildActiveResultFromCompareItems(
  itemAId: string,
  itemBId: string,
  viewedAt: string
): ActiveAnalysisResult {
  return {
    resultId: buildResultId(itemAId, itemBId),
    compareKey: comparePairKey(itemAId, itemBId),
    itemAId,
    itemBId,
    saved: false,
    viewedAt
  };
}

export function useResultSurfaceState({
  activeResult,
  activeFolder,
  compareItemA,
  compareItemB,
  compareTeaser,
  compareTeaserState,
  productProfile,
  savedAnalyses,
  sendAndSync,
  setSavedAnalyses,
  setWorkspaceState
}: {
  activeResult: ActiveAnalysisResult | null | undefined;
  activeFolder: SessionRecord | null;
  compareItemA: SessionItem | null;
  compareItemB: SessionItem | null;
  compareTeaser: CompareSetupTeaser | null;
  compareTeaserState: "idle" | "loading" | "ready";
  productProfile: ProductProfile | null | undefined;
  savedAnalyses: SavedAnalysisSnapshot[];
  sendAndSync: SendAndSync;
  setSavedAnalyses: (value: SavedAnalysisSnapshot[]) => void;
  setWorkspaceState: React.Dispatch<React.SetStateAction<PopupWorkspaceState>>;
}) {
  const [isGeneratingJudgment, setIsGeneratingJudgment] = useState(false);
  const resultSurface = useMemo(
    () => resolveAnalysisResultSurface({ activeResult: activeResult ?? null, savedAnalyses }),
    [activeResult, savedAnalyses]
  );

  const resultSelection = resultSurface.mode === "active"
    ? resultSurface.activeResult
    : resultSurface.savedAnalysis
      ? buildActiveResultFromSavedAnalysis(resultSurface.savedAnalysis, resultSurface.savedAnalysis.savedAt)
      : null;

  const resultItemA = resultSelection && activeFolder
    ? activeFolder.items.find((item) => item.id === resultSelection.itemAId) || null
    : null;
  const resultItemB = resultSelection && activeFolder
    ? activeFolder.items.find((item) => item.id === resultSelection.itemBId) || null
    : null;
  const activeSavedAnalysis = useMemo(
    () => findSavedAnalysisByResultId(savedAnalyses, resultSelection?.saved ? resultSelection.resultId : null),
    [resultSelection?.resultId, resultSelection?.saved, savedAnalyses]
  );

  async function onOpenCompareResult() {
    if (!compareItemA || !compareItemB || compareTeaserState !== "ready") {
      return;
    }
    const result = buildActiveResultFromCompareItems(compareItemA.id, compareItemB.id, new Date().toISOString());
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

  async function onOpenSavedAnalysis(resultId: string) {
    const saved = savedAnalyses.find((entry) => entry.resultId === resultId);
    if (!saved) {
      return;
    }
    const result = buildActiveResultFromSavedAnalysis(saved, new Date().toISOString());
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

  async function onSaveCurrentAnalysis() {
    if (!resultSelection || !compareTeaser || !activeFolder) {
      return;
    }
    const snapshotToSave: SavedAnalysisSnapshot = buildSavedAnalysisSnapshot({
      resultId: resultSelection.resultId,
      compareKey: resultSelection.compareKey,
      itemAId: resultSelection.itemAId,
      itemBId: resultSelection.itemBId,
      sourceLabelA: resultItemA?.descriptor.author_hint ? `@${resultItemA.descriptor.author_hint}` : "@unknown",
      sourceLabelB: resultItemB?.descriptor.author_hint ? `@${resultItemB.descriptor.author_hint}` : "@unknown",
      headline: compareTeaser.headline,
      deck: compareTeaser.deck,
      groupSummary: compareTeaser.metadataLabel,
      totalComments: (resultItemA?.latestCapture?.analysis?.source_comment_count ?? 0) + (resultItemB?.latestCapture?.analysis?.source_comment_count ?? 0),
      dateRangeLabel: buildDateRangeLabel(resultItemA?.descriptor.time_token_hint, resultItemB?.descriptor.time_token_hint),
      savedAt: new Date().toISOString(),
      briefSource: compareTeaser.briefSource
    });
    const response = await sendAndSync({
      type: "compare/save-analysis",
      snapshot: snapshotToSave
    });
    if (response.ok) {
      setSavedAnalyses(response.savedAnalyses ?? savedAnalyses);
    }
  }

  async function onStartJudgment() {
    if (!activeSavedAnalysis || isGeneratingJudgment) {
      return;
    }
    setIsGeneratingJudgment(true);
    try {
      const response = await sendAndSync({
        type: "judgment/start",
        resultId: activeSavedAnalysis.resultId
      });
      if (response.ok) {
        setSavedAnalyses(response.savedAnalyses ?? savedAnalyses);
      }
    } finally {
      setIsGeneratingJudgment(false);
    }
  }

  return {
    resultSurface,
    resultSelection,
    resultItemA,
    resultItemB,
    activeSavedAnalysis,
    canStartJudgment: Boolean(activeSavedAnalysis && productProfile),
    isGeneratingJudgment,
    onOpenCompareResult,
    onOpenSavedAnalysis,
    onSaveCurrentAnalysis,
    onStartJudgment
  };
}
