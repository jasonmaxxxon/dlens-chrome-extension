import type { AnalysisClusterSnapshot, AnalysisEvidenceSnapshot } from "../contracts/ingest.ts";

export interface CompareOneLinerSide {
  captureId: string;
  analysisUpdatedAt: string | null;
  author: string;
  text: string;
  engagement: Record<string, unknown>;
  clusters: AnalysisClusterSnapshot[];
  evidence: AnalysisEvidenceSnapshot[];
}

export interface CompareOneLinerRequest {
  left: CompareOneLinerSide;
  right: CompareOneLinerSide;
}

function stringifyEngagement(engagement: Record<string, unknown>): string {
  return Object.entries(engagement)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
}

export function buildCompareOneLinerCacheKey(
  request: CompareOneLinerRequest,
  provider: "openai" | "claude" | "google",
  promptVersion: string
): string {
  return [
    request.left.captureId,
    request.right.captureId,
    request.left.analysisUpdatedAt || "none",
    request.right.analysisUpdatedAt || "none",
    provider,
    promptVersion
  ].join("::");
}

export function buildCompareOneLinerPrompt(request: CompareOneLinerRequest): string {
  const sections = [
    ["Post A", request.left],
    ["Post B", request.right]
  ] as const;
  const lines = [
    "請用繁體中文寫一句 28 字以內的比較句，直接比較兩篇貼文留言的討論差異，不要列點，不要保留字眼。"
  ];
  for (const [label, side] of sections) {
    lines.push(`${label} author: ${side.author}`);
    lines.push(`${label} post: ${side.text}`);
    lines.push(`${label} engagement: ${stringifyEngagement(side.engagement)}`);
    lines.push(
      `${label} clusters: ${side.clusters
        .map((cluster) => `[k${cluster.cluster_key}] keywords=${cluster.keywords.join(", ")} size=${cluster.size_share} like=${cluster.like_share}`)
        .join(" | ")}`
    );
    lines.push(
      `${label} evidence: ${side.evidence
        .flatMap((group) => group.comments.map((comment) => `[k${group.cluster_key}] ${comment.text}`))
        .join(" | ")}`
    );
  }
  return lines.join("\n");
}
