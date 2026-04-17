import type {
  AnalysisClusterSnapshot,
  AnalysisSnapshot,
} from "../contracts/ingest.ts";
import type { ClusterCompareRow, ClusterSummaryCard } from "./types.ts";
import { pickEvidenceComments } from "./evidence.ts";

const MIN_CLUSTER_SUPPORT_COUNT = 2;
const MIN_CLUSTER_SIZE_SHARE = 0.2;

function estimateSupportCount(cluster: AnalysisClusterSnapshot, sourceCommentCount: number): number {
  const rawSupport = cluster.size_share * Math.max(sourceCommentCount, 0);
  if (!Number.isFinite(rawSupport) || rawSupport <= 0) return 0;
  return Math.max(1, Math.round(rawSupport));
}

function keepVisibleClusters(
  clusters: readonly AnalysisClusterSnapshot[],
  sourceCommentCount: number,
): AnalysisClusterSnapshot[] {
  const ranked = sortClusters(clusters);
  const visible = ranked.filter((cluster) => {
    const supportCount = estimateSupportCount(cluster, sourceCommentCount);
    return supportCount >= MIN_CLUSTER_SUPPORT_COUNT || cluster.size_share >= MIN_CLUSTER_SIZE_SHARE;
  });

  return visible.length ? visible : ranked.slice(0, 1);
}

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
  const sourceCommentCount = analysis.source_comment_count ?? 0;

  return keepVisibleClusters(analysis.clusters, sourceCommentCount)
    .slice(0, Math.max(0, clusterLimit))
    .map((cluster, index) => ({
      captureId,
      rank: index + 1,
      sourceCommentCount,
      supportCount: estimateSupportCount(cluster, sourceCommentCount),
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
  const total = Math.max(leftSummaries.length, rightSummaries.length, 1);

  return Array.from({ length: total }, (_, index) => ({
    rank: index + 1,
    left: leftSummaries[index] ?? null,
    right: rightSummaries[index] ?? null,
  }));
}
