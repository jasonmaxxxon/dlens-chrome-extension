import type { AnalysisClusterSnapshot, AnalysisEvidenceCommentSnapshot } from "../contracts/ingest.ts";
import { validateClusterOneLinerPayload } from "../analysis/cluster-validation.ts";

export interface CompareClusterSummaryRequestItem {
  captureId: string;
  analysisUpdatedAt: string;
  clusterKey: number;
  author: string;
  postText: string;
  sourceCommentCount: number;
  keywords: string[];
  sizeShare: number;
  likeShare: number;
  evidenceCandidates: AnalysisEvidenceCommentSnapshot[];
}

export interface CompareClusterSummaryRequest {
  clusters: CompareClusterSummaryRequestItem[];
}

export interface ClusterInterpretation {
  captureId: string;
  clusterKey: number;
  label: string;
  oneLiner: string;
  evidenceIds: string[];
}

export function buildCompareClusterSummaryCacheKey(
  request: CompareClusterSummaryRequest,
  provider: "openai" | "claude" | "google",
  promptVersion: string
): string {
  const parts = request.clusters.map((cluster) =>
    `${cluster.captureId}:${cluster.analysisUpdatedAt}:${cluster.clusterKey}`
  );
  return ["compare-clusters", promptVersion, provider, ...parts].join("|");
}

interface ClusterInterpretationPayload {
  capture_id?: string;
  cluster_id?: number;
  label?: string;
  one_liner?: string;
  label_style?: string;
  evidence_ids?: string[];
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function keywordsLabel(keywords: readonly string[]): string {
  const label = keywords.filter(Boolean).slice(0, 3).join(" / ").trim();
  return label || "主題未定";
}

export function clusterInterpretationKey(captureId: string, clusterKey: number): string {
  return `${captureId}:${clusterKey}`;
}

export function buildDeterministicClusterInterpretation(cluster: AnalysisClusterSnapshot): ClusterInterpretation {
  const label = keywordsLabel(cluster.keywords || []);
  const sizePct = Math.round(cluster.size_share * 100);
  const likePct = Math.round(cluster.like_share * 100);

  return {
    captureId: "",
    clusterKey: cluster.cluster_key,
    label,
    oneLiner: `這群回應主要圍繞「${label}」，約佔 ${sizePct}% 留言、拿走 ${likePct}% 按讚。`,
    evidenceIds: []
  };
}

export function pickClusterExampleEvidence(
  evidence: AnalysisEvidenceCommentSnapshot[],
  preferredEvidenceIds?: readonly string[] | null,
  limit = 2
): AnalysisEvidenceCommentSnapshot[] {
  const preferred = new Set((preferredEvidenceIds || []).filter(Boolean));
  if (!preferred.size) {
    return evidence.slice(0, Math.max(0, limit));
  }

  const selected = evidence.filter((comment) => preferred.has(comment.comment_id)).slice(0, Math.max(0, limit));
  return selected.length ? selected : evidence.slice(0, Math.max(0, limit));
}

export function buildCompareClusterSummaryPrompt(request: CompareClusterSummaryRequest): string {
  const clusterLines = request.clusters.map((cluster) => JSON.stringify({
    capture_id: cluster.captureId,
    cluster_key: cluster.clusterKey,
    author: cluster.author,
    post_text: cluster.postText,
    source_comment_count: cluster.sourceCommentCount,
    keywords: cluster.keywords,
    size_share: cluster.sizeShare,
    like_share: cluster.likeShare,
    allowed_evidence: cluster.evidenceCandidates.slice(0, 5).map((comment) => ({
      comment_id: comment.comment_id,
      like_count: comment.like_count ?? 0,
      text: comment.text
    }))
  }));

  return [
    "你是社群分析助手。",
    "請針對每個 cluster 回傳繁體中文 JSON。",
    "每個 cluster 都要提供：capture_id、cluster_id、label、one_liner、label_style、evidence_ids。",
    "label_style 必須是 descriptive。",
    "evidence_ids 必須從 allowed_evidence 中精選 2 個最能代表該 cluster 的 comment_id。",
    "one_liner 要用一句話說明這群留言在講什麼，以及它的互動特徵。",
    "只回傳 JSON，格式：{\"clusters\":[...]}。",
    "",
    ...clusterLines
  ].join("\n");
}

export function parseCompareClusterSummaryResponse(
  raw: string,
  request: CompareClusterSummaryRequest
): ClusterInterpretation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return [];
  }

  const payloads = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { clusters?: unknown[] })?.clusters)
      ? (parsed as { clusters: unknown[] }).clusters
      : [];

  const requestByKey = new Map(
    request.clusters.map((cluster) => [
      clusterInterpretationKey(cluster.captureId, cluster.clusterKey),
      cluster
    ])
  );

  const interpretations: ClusterInterpretation[] = [];

  for (const candidate of payloads) {
    const payload = candidate as ClusterInterpretationPayload;
    const captureId = String(payload.capture_id ?? "").trim();
    const clusterKey = Number(payload.cluster_id);
    if (!captureId || !Number.isFinite(clusterKey)) {
      continue;
    }

    const requestItem = requestByKey.get(clusterInterpretationKey(captureId, clusterKey));
    if (!requestItem) {
      continue;
    }

    const allowedIds = requestItem.evidenceCandidates.map((comment) => comment.comment_id).filter(Boolean) as string[];
    const validation = validateClusterOneLinerPayload(
      {
        cluster_id: clusterKey,
        label: payload.label,
        one_liner: payload.one_liner,
        label_style: payload.label_style,
        evidence_ids: Array.isArray(payload.evidence_ids) ? payload.evidence_ids.slice(0, 2) : []
      },
      allowedIds,
      []
    );
    if (!validation.ok) {
      continue;
    }

    interpretations.push({
      captureId,
      clusterKey,
      label: String(payload.label).trim(),
      oneLiner: String(payload.one_liner).trim(),
      evidenceIds: (payload.evidence_ids || []).slice(0, 2)
    });
  }

  return interpretations;
}
