import type {
  AnalysisClusterSnapshot,
  AnalysisEvidenceCommentSnapshot,
  AnalysisSnapshot,
} from "../contracts/ingest.ts";

export interface ClusterSummaryCard {
  captureId: string;
  rank: number;
  cluster: AnalysisClusterSnapshot;
  evidence: AnalysisEvidenceCommentSnapshot[];
}

export interface ClusterCompareRow {
  rank: number;
  left: ClusterSummaryCard | null;
  right: ClusterSummaryCard | null;
}

export interface DominanceSummary {
  ratio: number | null;
  label: "高度集中" | "中度分散" | "高度分散" | "未定";
}

export interface CompareClusterSide {
  captureId: string;
  analysis: AnalysisSnapshot;
  summaries: ClusterSummaryCard[];
  dominance: DominanceSummary;
}
