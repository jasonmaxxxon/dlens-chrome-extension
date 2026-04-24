import type {
  AnalysisClusterSnapshot,
  AnalysisEvidenceCommentSnapshot,
  AnalysisSnapshot,
} from "../contracts/ingest.ts";

export interface ClusterSummaryCard {
  captureId: string;
  rank: number;
  sourceCommentCount: number;
  supportCount: number;
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

export type ClusterToneVariant =
  | "primary"
  | "supportive"
  | "cautious"
  | "minor";

export interface ClusterMapNode {
  captureId: string;
  clusterKey: number;
  title: string;
  sizeShare: number;
  supportCount: number;
  likeShare: number;
  x: number;
  y: number;
  r: number;
  toneVariant: ClusterToneVariant;
  isMinorBucket: boolean;
}

export interface SelectedClusterEvidence {
  commentId?: string;
  author?: string;
  text?: string;
  likes?: number | null;
  comments?: number | null;
  reposts?: number | null;
  forwards?: number | null;
}

export interface SelectedClusterSupportMetric {
  kind: "captured" | "comments" | "replies" | "likes";
  label: string;
  value: string;
}

export interface SelectedClusterDetail {
  captureId: string;
  clusterKey: number;
  clusterTitle: string;
  thesis: string;
  supportLabel: string;
  supportMetrics: SelectedClusterSupportMetric[];
  audienceEvidence: SelectedClusterEvidence[];
  authorStance: string;
  alignment: "Align" | "Mixed" | "Oppose";
  alignmentSummary: string;
  relatedCluster: {
    side: "left" | "right";
    title: string;
    supportLabel: string;
  } | null;
}

export interface CompareHeroSummary {
  headline: string;
  relation: string;
  whyItMatters: string;
  creatorCue: string;
  cue: string;
  audienceAlignmentLeft: {
    badge: "Align" | "Mixed" | "Oppose";
    summary: string;
  };
  audienceAlignmentRight: {
    badge: "Align" | "Mixed" | "Oppose";
    summary: string;
  };
}
