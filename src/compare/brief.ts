export type CompareBriefSide = "left" | "right";
export type CompareBriefRiskSide = CompareBriefSide | "both" | "unclear";
export type CompareBriefConfidence = "low" | "medium" | "high";

export interface CompareBriefEvidenceCandidate {
  comment_id: string;
  text: string;
  like_count?: number | null;
}

export interface CompareBriefClusterRequestItem {
  clusterKey: number;
  keywords: string[];
  sizeShare: number;
  likeShare: number;
  evidenceCandidates: CompareBriefEvidenceCandidate[];
}

export interface CompareBriefSideRequest {
  captureId: string;
  analysisUpdatedAt: string;
  author: string;
  text: string;
  ageLabel: string;
  metricsCoverageLabel: string;
  sourceCommentCount: number;
  engagement: Record<string, number | null>;
  velocity: {
    likesPerHour: number | null;
    commentsPerHour: number | null;
    repostsPerHour: number | null;
    forwardsPerHour: number | null;
  };
  clusters: CompareBriefClusterRequestItem[];
}

export interface CompareBriefRequest {
  left: CompareBriefSideRequest;
  right: CompareBriefSideRequest;
}

export interface CompareBriefRiskSignal {
  label: string;
  reason: string;
  side: CompareBriefRiskSide;
}

export interface CompareBriefEvidenceReference {
  captureId: string;
  clusterKey: number;
  commentId: string;
  side: CompareBriefSide;
  reason: string;
}

export interface CompareBrief {
  source: "ai" | "fallback";
  headline: string;
  claimContrast: string;
  emotionContrast: string;
  riskSignals: CompareBriefRiskSignal[];
  representativeEvidence: CompareBriefEvidenceReference[];
  notes: string;
  confidence: CompareBriefConfidence;
}

interface CompareBriefResponsePayload {
  headline?: string;
  claim_contrast?: string;
  emotion_contrast?: string;
  risk_signals?: Array<{
    label?: string;
    reason?: string;
    side?: string;
  }>;
  representative_evidence?: Array<{
    capture_id?: string;
    cluster_id?: number;
    comment_id?: string;
    side?: string;
    reason?: string;
  }>;
  notes?: string;
  confidence?: string;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function joinKeywords(keywords: readonly string[]): string {
  const text = keywords.filter(Boolean).slice(0, 3).join(" / ").trim();
  return text || "主題未定";
}

function roundPct(value: number): number {
  return Math.round(Math.max(0, value) * 100);
}

function formatPerHour(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "未知";
  if (value >= 100) return `${value.toFixed(0)}/h`;
  if (value >= 10) return `${value.toFixed(1)}/h`;
  return `${value.toFixed(2)}/h`;
}

function strongestCluster(side: CompareBriefSideRequest): CompareBriefClusterRequestItem | null {
  return side.clusters[0] || null;
}

function bestEvidence(cluster: CompareBriefClusterRequestItem | null): CompareBriefEvidenceCandidate | null {
  if (!cluster) return null;
  return [...cluster.evidenceCandidates].sort((left, right) => (right.like_count ?? 0) - (left.like_count ?? 0))[0] || null;
}

function compareVelocity(left: number | null, right: number | null): CompareBriefSide | null {
  if (left === null || right === null) return null;
  const max = Math.max(left, right, 0.01);
  const min = Math.max(Math.min(left, right), 0.01);
  if (max / min < 2) return null;
  return left > right ? "left" : "right";
}

function confidenceForRequest(request: CompareBriefRequest): CompareBriefConfidence {
  const labels = [request.left.metricsCoverageLabel, request.right.metricsCoverageLabel];
  if (labels.some((label) => label === "Not captured")) return "low";
  if (labels.some((label) => label === "Partial metrics only")) return "medium";
  return "medium";
}

export function buildCompareBriefCacheKey(
  request: CompareBriefRequest,
  provider: "openai" | "claude" | "google",
  promptVersion: string
): string {
  return [
    "compare-brief",
    promptVersion,
    provider,
    request.left.captureId,
    request.left.analysisUpdatedAt,
    request.right.captureId,
    request.right.analysisUpdatedAt
  ].join("|");
}

export function buildCompareBriefPrompt(request: CompareBriefRequest): string {
  const toPromptSide = (side: CompareBriefSide, value: CompareBriefSideRequest) => ({
    side,
    capture_id: value.captureId,
    author: value.author,
    post_text: value.text,
    age_label: value.ageLabel,
    metrics_coverage_label: value.metricsCoverageLabel,
    source_comment_count: value.sourceCommentCount,
    raw_engagement: value.engagement,
    velocity: {
      likes_per_hour: value.velocity.likesPerHour,
      comments_per_hour: value.velocity.commentsPerHour,
      reposts_per_hour: value.velocity.repostsPerHour,
      forwards_per_hour: value.velocity.forwardsPerHour
    },
    clusters: value.clusters.map((cluster) => ({
      cluster_key: cluster.clusterKey,
      keywords: cluster.keywords,
      size_share: cluster.sizeShare,
      like_share: cluster.likeShare,
      allowed_evidence: cluster.evidenceCandidates.slice(0, 5)
    }))
  });

  return [
    "你是社群分析助手。",
    "請根據兩篇 Threads 貼文的留言分群、互動指標與代表性留言，輸出一份繁體中文 compare brief。",
    "只回傳 JSON，不要加解釋。",
    "必填欄位：headline、claim_contrast、emotion_contrast、risk_signals、representative_evidence、notes、confidence。",
    "risk_signals 陣列內每筆都要有 label、reason、side；side 只能是 left、right、both、unclear。",
    "representative_evidence 陣列內每筆都要有 capture_id、cluster_id、comment_id、side、reason。",
    "comment_id 只能從對應 cluster 的 allowed_evidence 中挑選。",
    "confidence 只能是 low、medium、high。",
    "",
    JSON.stringify({
      left: toPromptSide("left", request.left),
      right: toPromptSide("right", request.right)
    }, null, 2)
  ].join("\n");
}

export function parseCompareBriefResponse(raw: string, request: CompareBriefRequest): CompareBrief | null {
  let parsed: CompareBriefResponsePayload;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  const headline = String(parsed.headline || "").trim();
  const claimContrast = String(parsed.claim_contrast || "").trim();
  const emotionContrast = String(parsed.emotion_contrast || "").trim();
  const notes = String(parsed.notes || "").trim();
  const confidence = String(parsed.confidence || "").trim() as CompareBriefConfidence;

  if (!headline || !claimContrast || !emotionContrast || !notes) {
    return null;
  }
  if (!["low", "medium", "high"].includes(confidence)) {
    return null;
  }

  const allowedEvidence = new Map<string, { captureId: string; clusterKey: number; side: CompareBriefSide }>();
  for (const [side, sideRequest] of [["left", request.left], ["right", request.right]] as const) {
    for (const cluster of sideRequest.clusters) {
      for (const evidence of cluster.evidenceCandidates) {
        allowedEvidence.set(`${sideRequest.captureId}:${cluster.clusterKey}:${evidence.comment_id}`, {
          captureId: sideRequest.captureId,
          clusterKey: cluster.clusterKey,
          side
        });
      }
    }
  }

  const riskSignals = Array.isArray(parsed.risk_signals)
    ? parsed.risk_signals
        .map((item) => ({
          label: String(item?.label || "").trim(),
          reason: String(item?.reason || "").trim(),
          side: String(item?.side || "").trim() as CompareBriefRiskSide
        }))
        .filter((item) => item.label && item.reason && ["left", "right", "both", "unclear"].includes(item.side))
        .slice(0, 3)
    : [];

  const representativeEvidence = Array.isArray(parsed.representative_evidence)
    ? parsed.representative_evidence
        .map((item) => {
          const captureId = String(item?.capture_id || "").trim();
          const clusterKey = Number(item?.cluster_id);
          const commentId = String(item?.comment_id || "").trim();
          const side = String(item?.side || "").trim() as CompareBriefSide;
          const reason = String(item?.reason || "").trim();
          const allowed = allowedEvidence.get(`${captureId}:${clusterKey}:${commentId}`);
          if (!captureId || !Number.isFinite(clusterKey) || !commentId || !reason || !allowed) {
            return null;
          }
          if (!["left", "right"].includes(side) || allowed.side !== side) {
            return null;
          }
          return { captureId, clusterKey, commentId, side, reason };
        })
        .filter((item): item is CompareBriefEvidenceReference => Boolean(item))
        .slice(0, 4)
    : [];

  if (!riskSignals.length || !representativeEvidence.length) {
    return null;
  }

  return {
    source: "ai",
    headline,
    claimContrast,
    emotionContrast,
    riskSignals,
    representativeEvidence,
    notes,
    confidence
  };
}

export function buildDeterministicCompareBrief(
  request: CompareBriefRequest,
  fallbackReason = "AI compare brief unavailable."
): CompareBrief {
  const leftTop = strongestCluster(request.left);
  const rightTop = strongestCluster(request.right);
  const leftLabel = joinKeywords(leftTop?.keywords || []);
  const rightLabel = joinKeywords(rightTop?.keywords || []);
  const leftEvidence = bestEvidence(leftTop);
  const rightEvidence = bestEvidence(rightTop);

  const riskSignals: CompareBriefRiskSignal[] = [];
  if (leftTop && leftTop.sizeShare >= 0.55 && rightTop && rightTop.sizeShare >= 0.55) {
    riskSignals.push({
      label: "單一敘事集中",
      reason: `兩側 top cluster 都拿走超過一半留言（A ${roundPct(leftTop.sizeShare)}%，B ${roundPct(rightTop.sizeShare)}%），少數高互動聲音可能放大單一路線。`,
      side: "both"
    });
  }
  if ([request.left.metricsCoverageLabel, request.right.metricsCoverageLabel].some((label) => label !== "All core metrics captured")) {
    riskSignals.push({
      label: "互動資料不完整",
      reason: `目前 capture coverage 為 A「${request.left.metricsCoverageLabel}」、B「${request.right.metricsCoverageLabel}」，解讀 views / forwards 時要保守。`,
      side: "both"
    });
  }
  const fasterSide = compareVelocity(request.left.velocity.likesPerHour, request.right.velocity.likesPerHour);
  if (fasterSide) {
    riskSignals.push({
      label: "短時動能不對稱",
      reason: `${fasterSide === "left" ? "A" : "B"} 的 likes/hour 明顯較高（A ${formatPerHour(request.left.velocity.likesPerHour)}，B ${formatPerHour(request.right.velocity.likesPerHour)}），老帖與新帖不能只看 raw total。`,
      side: fasterSide
    });
  }
  if (!riskSignals.length) {
    riskSignals.push({
      label: "議題切割清楚",
      reason: `A 主要集中在「${leftLabel}」，B 主要集中在「${rightLabel}」，代表雙方留言重心已經分流。`,
      side: "both"
    });
  }

  const representativeEvidence: CompareBriefEvidenceReference[] = [];
  if (leftTop && leftEvidence) {
    representativeEvidence.push({
      captureId: request.left.captureId,
      clusterKey: leftTop.clusterKey,
      commentId: leftEvidence.comment_id,
      side: "left",
      reason: `左側最能代表「${leftLabel}」的高互動留言樣本。`
    });
  }
  if (rightTop && rightEvidence) {
    representativeEvidence.push({
      captureId: request.right.captureId,
      clusterKey: rightTop.clusterKey,
      commentId: rightEvidence.comment_id,
      side: "right",
      reason: `右側最能代表「${rightLabel}」的高互動留言樣本。`
    });
  }

  return {
    source: "fallback",
    headline: `A 的高互動重點偏向「${leftLabel}」，B 則更集中在「${rightLabel}」。`,
    claimContrast: `就主張重心來看，A 的 top cluster 約佔 ${roundPct(leftTop?.sizeShare || 0)}% 留言、拿走 ${roundPct(leftTop?.likeShare || 0)}% 按讚；B 的核心留言則圍繞「${rightLabel}」，約佔 ${roundPct(rightTop?.sizeShare || 0)}% 留言、拿走 ${roundPct(rightTop?.likeShare || 0)}% 按讚。`,
    emotionContrast: `在沒有額外 AI 判讀時，情緒對比先以互動結構近似：A 的注意力更集中在「${leftLabel}」，B 則更集中在「${rightLabel}」。實際語氣與情緒落點應回看代表性證據。`,
    riskSignals,
    representativeEvidence,
    notes: `${fallbackReason} This deterministic brief uses cluster concentration, engagement coverage, and top evidence only.`,
    confidence: confidenceForRequest(request)
  };
}
