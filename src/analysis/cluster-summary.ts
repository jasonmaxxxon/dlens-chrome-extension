import type {
  AnalysisClusterSnapshot,
  AnalysisSnapshot,
} from "../contracts/ingest.ts";
import type { ClusterCompareRow, ClusterSummaryCard } from "./types.ts";
import { pickEvidenceComments } from "./evidence.ts";

function sortClusters(
  clusters: readonly AnalysisClusterSnapshot[],
): AnalysisClusterSnapshot[] {
  return [...clusters].sort((left, right) => {
    const sizeDelta = right.size_share - left.size_share;
    if (sizeDelta !== 0) return sizeDelta;

    const likeDelta = right.like_share - left.like_share;
    if (likeDelta !== 0) return likeDelta;

    return left.cluster_key - right.cluster_key;
  });
}

export function getDominanceLabel(
  dominanceRatioTop1: number | null | undefined,
): "高度集中" | "中度分散" | "高度分散" | "未定" {
  if (typeof dominanceRatioTop1 !== "number" || Number.isNaN(dominanceRatioTop1)) {
    return "未定";
  }
  if (dominanceRatioTop1 >= 0.65) return "高度集中";
  if (dominanceRatioTop1 >= 0.45) return "中度分散";
  return "高度分散";
}

export function buildClusterSummaries(
  analysis: AnalysisSnapshot | null,
  clusterLimit = 5,
  evidenceLimit = 3,
  captureId = analysis?.capture_id ?? "",
): ClusterSummaryCard[] {
  if (!analysis) return [];

  return sortClusters(analysis.clusters)
    .slice(0, Math.max(0, clusterLimit))
    .map((cluster, index) => ({
      captureId,
      rank: index + 1,
      cluster,
      evidence: pickEvidenceComments(analysis.evidence, cluster.cluster_key, evidenceLimit),
    }));
}

export function buildClusterCompareRows(
  left: AnalysisSnapshot | null,
  right: AnalysisSnapshot | null,
  clusterLimit = 5,
): ClusterCompareRow[] {
  const leftSummaries = buildClusterSummaries(left, clusterLimit, 5);
  const rightSummaries = buildClusterSummaries(right, clusterLimit, 5);
  const total = Math.max(clusterLimit, leftSummaries.length, rightSummaries.length);

  return Array.from({ length: total }, (_, index) => ({
    rank: index + 1,
    left: leftSummaries[index] ?? null,
    right: rightSummaries[index] ?? null,
  }));
}
