import type { AnalysisClusterSnapshot, AnalysisEvidenceCommentSnapshot } from "../contracts/ingest.ts";
import { isWeakClusterLabel, validateClusterOneLinerPayload } from "../analysis/cluster-validation.ts";

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
  observation: string;
  reading: string;
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
  observation?: string;
  reading?: string;
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
  const label = keywords
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean)
    .filter((keyword) => !isWeakClusterLabel(keyword))
    .slice(0, 3)
    .join(" / ")
    .trim();
  return label || "回應主題待釐清";
}

function primaryKeyword(keywords: readonly string[]): string | null {
  const cleaned = keywords
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean)
    .filter((keyword) => !isWeakClusterLabel(keyword));
  return cleaned[0] || null;
}

export function clusterInterpretationKey(captureId: string, clusterKey: number): string {
  return `${captureId}:${clusterKey}`;
}

/**
 * Infer how an audience cluster is *responding* to content, based on engagement ratios.
 * Returns a label describing the reaction type, not just the topic.
 */
function inferClusterReactionType(sizeShare: number, likeShare: number): string {
  if (likeShare > sizeShare + 0.15) return "共鳴放大型";  // likes far exceed comment share
  if (sizeShare >= 0.5) return "集中回聲型";              // majority echoing same direction
  if (likeShare < sizeShare - 0.15) return "分歧探索型"; // many comments, low approval
  return "分散反應型";                                     // mid-range
}

function inferClusterStructure(sizeShare: number, likeShare: number): string {
  const concentration = sizeShare >= 0.55 ? "高度集中"
    : sizeShare >= 0.35 ? "中度集中"
    : "較分散";
  const engagement = likeShare > sizeShare + 0.12 ? "互動集中於少數高讚"
    : likeShare < sizeShare - 0.12 ? "互動偏均勻分散"
    : "互動與規模相符";
  return `${concentration}、${engagement}`;
}

export function buildDeterministicClusterInterpretation(cluster: AnalysisClusterSnapshot): ClusterInterpretation {
  const topicLabel = keywordsLabel(cluster.keywords || []);
  const sizePct = Math.round(cluster.size_share * 100);
  const likePct = Math.round(cluster.like_share * 100);
  const reactionType = inferClusterReactionType(cluster.size_share, cluster.like_share);
  const primaryTopic = primaryKeyword(cluster.keywords || []);
  const label = primaryTopic ? `${reactionType} · ${primaryTopic}` : reactionType;
  const lowSignal = !primaryTopic || topicLabel === "回應主題待釐清";
  const structureLabel = inferClusterStructure(cluster.size_share, cluster.like_share);

  const observation = lowSignal
    ? `這群留言以${reactionType}方式回應，但關鍵詞偏泛、主題仍待釐清；佔 ${sizePct}% 留言、${likePct}% 按讚。`
    : `這群留言以${reactionType}方式回應原文，聚焦在「${topicLabel}」；佔 ${sizePct}% 留言、${likePct}% 按讚。`;
  const reading = `結構偏${structureLabel}。`;
  const oneLiner = `${observation}${reading}`;

  return {
    captureId: "",
    clusterKey: cluster.cluster_key,
    label,
    observation,
    reading,
    oneLiner,
    evidenceIds: []
  };
}

export function pickClusterExampleEvidence(
  evidence: AnalysisEvidenceCommentSnapshot[],
  preferredEvidenceIds?: readonly string[] | null,
  limit = 2
): AnalysisEvidenceCommentSnapshot[] {
  const safeLimit = Math.max(0, limit);
  const preferred = new Set((preferredEvidenceIds || []).filter(Boolean));
  if (!preferred.size) {
    return evidence.slice(0, safeLimit);
  }

  const prioritized = evidence.filter((comment) => preferred.has(comment.comment_id));
  if (!prioritized.length) {
    return evidence.slice(0, safeLimit);
  }

  const remaining = evidence.filter((comment) => !preferred.has(comment.comment_id));
  return [...prioritized, ...remaining].slice(0, safeLimit);
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
    "每個 cluster 都要提供：capture_id、cluster_id、label、observation、reading、one_liner、label_style、evidence_ids。",
    "label_style 必須是 descriptive。",
    "label 的規格：",
    "  - 優先命名這群留言的討論姿態、立場方向或情緒語氣，不要只摘 topic keywords。",
    "  - 允許格式參考：「共鳴型：覺得很划算」、「焦慮擴散型：擔心合併後更難生活」。",
    "  - 禁止只回「賞錢」、「房市」、「教育」這種 topic noun。",
    "evidence_ids 必須從 allowed_evidence 中精選 2 個最能代表該 cluster 的 comment_id。",
    "observation 的規格：",
    "  - 說明這群留言在「怎麼回應」原文，必須包含反應型態（共鳴放大型 / 集中回聲型 / 分歧探索型 / 分散反應型）。",
    "  - 必須是可被 evidence 支撐的具體陳述，不能只重述 label 或 keywords。",
    "  - 禁止泛化：不能說「這群留言以一般方式回應」。",
    "reading 的規格：",
    "  - 基於 observation，給出一句輕量解讀：這個反應模式意味著什麼。",
    "  - 控制在一句話，不要長篇大論。",
    "one_liner 的規格：",
    "  - observation + reading 合成的單行摘要，格式參考：「這群留言以[反應型態]方式回應原文，[核心發現]；[結構特徵]，[輕量解讀]。」",
    "  - 禁止只重述 label 或 keywords。",
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

    const observation = String(payload.observation || "").trim();
    const reading = String(payload.reading || "").trim();
    const rawOneLiner = String(payload.one_liner || "").trim();
    // Synthesize one_liner from observation + reading if model omitted it — must happen before validation
    const oneLiner = rawOneLiner || (observation && reading ? `${observation}${reading}` : observation || reading);

    const allowedIds = requestItem.evidenceCandidates.map((comment) => comment.comment_id).filter(Boolean) as string[];
    const validation = validateClusterOneLinerPayload(
      {
        cluster_id: clusterKey,
        label: payload.label,
        one_liner: oneLiner,
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
      observation,
      reading,
      oneLiner,
      evidenceIds: (payload.evidence_ids || []).slice(0, 2)
    });
  }

  return interpretations;
}
