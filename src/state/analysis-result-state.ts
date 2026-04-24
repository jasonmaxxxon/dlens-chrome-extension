import type { ActiveAnalysisResult, SavedAnalysisSnapshot } from "./types.ts";

export interface AnalysisResultSurfaceResolution {
  mode: "active" | "saved" | "empty";
  activeResult: ActiveAnalysisResult | null;
  savedAnalysis: SavedAnalysisSnapshot | null;
}

function pickNewestSavedAnalysis(savedAnalyses: SavedAnalysisSnapshot[]): SavedAnalysisSnapshot | null {
  if (!savedAnalyses.length) {
    return null;
  }
  return [...savedAnalyses].sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))[0] ?? null;
}

export function findSavedAnalysisByResultId(
  savedAnalyses: SavedAnalysisSnapshot[],
  resultId: string | null | undefined
): SavedAnalysisSnapshot | null {
  if (!resultId) {
    return null;
  }
  return savedAnalyses.find((entry) => entry.resultId === resultId) ?? null;
}

export function resolveAnalysisResultSurface({
  activeResult,
  savedAnalyses
}: {
  activeResult: ActiveAnalysisResult | null;
  savedAnalyses: SavedAnalysisSnapshot[];
}): AnalysisResultSurfaceResolution {
  const newestSaved = pickNewestSavedAnalysis(savedAnalyses);
  if (activeResult) {
    return {
      mode: "active",
      activeResult,
      savedAnalysis: newestSaved
    };
  }
  if (newestSaved) {
    return {
      mode: "saved",
      activeResult: null,
      savedAnalysis: newestSaved
    };
  }
  return {
    mode: "empty",
    activeResult: null,
    savedAnalysis: null
  };
}
