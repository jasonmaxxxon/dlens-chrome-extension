import type { AnalysisSnapshot } from "../contracts/ingest.ts";
import type { CompareClusterSide } from "./types.ts";
import { buildClusterSummaries, getDominanceLabel } from "./cluster-summary.ts";

export function buildCompareClusterSide(
  captureId: string,
  analysis: AnalysisSnapshot | null,
  clusterLimit = 5,
): CompareClusterSide | null {
  if (!analysis) return null;

  const dominanceValue =
    typeof analysis.metrics?.dominance_ratio_top1 === "number"
      ? (analysis.metrics.dominance_ratio_top1 as number)
      : null;

  return {
    captureId,
    analysis,
    summaries: buildClusterSummaries(analysis, clusterLimit, 3),
    dominance: {
      ratio: dominanceValue,
      label: getDominanceLabel(dominanceValue),
    },
  };
}
