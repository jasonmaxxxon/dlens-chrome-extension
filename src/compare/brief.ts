export type CompareBriefSide = "left" | "right";
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

export interface SupportingObservation {
  text: string;
  scope: "left" | "right" | "cross";
  evidenceIds: string[];
}

export interface CompareBrief {
  source: "ai" | "fallback";
  headline: string;
  relation: string;
  supportingObservations: SupportingObservation[];
  aReading: string;
  bReading: string;
  whyItMatters: string;
  creatorCue: string;
  keywords: string[];
  audienceAlignmentLeft: "Align" | "Mixed" | "Oppose";
  audienceAlignmentRight: "Align" | "Mixed" | "Oppose";
  confidence: CompareBriefConfidence;
}

/* ── internal helpers ── */

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAlignment(value: unknown, fallback: CompareBrief["audienceAlignmentLeft"]): CompareBrief["audienceAlignmentLeft"] {
  return value === "Align" || value === "Mixed" || value === "Oppose" ? value : fallback;
}

function readConfidence(value: unknown, fallback: CompareBriefConfidence): CompareBriefConfidence {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

interface CompareBriefResponsePayload {
  headline?: string;
  relation?: string;
  supporting_observations?: unknown;
  a_reading?: string;
  b_reading?: string;
  why_it_matters?: string;
  creator_cue?: string;
  keywords?: unknown;
  audience_alignment_left?: string;
  audience_alignment_right?: string;
  confidence?: string;
}

function stripCodeFence(value: string): string {
  const trimmed = readTrimmedString(value);
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function normalizeKeyword(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readKeywords(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const seen = new Set<string>();
  const keywords = value
    .map(normalizeKeyword)
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    })
    .slice(0, 5);
  return keywords.length >= 3 ? keywords : fallback;
}

function joinKeywords(keywords: readonly string[]): string {
  const text = keywords.filter(Boolean).slice(0, 3).join(" / ").trim();
  return text || "主題未定";
}

function roundPct(value: number): number {
  return Math.round(Math.max(0, value) * 100);
}

function strongestCluster(side: CompareBriefSideRequest): CompareBriefClusterRequestItem | null {
  return side.clusters[0] || null;
}

function bestEvidence(cluster: CompareBriefClusterRequestItem | null): CompareBriefEvidenceCandidate | null {
  if (!cluster) return null;
  return [...cluster.evidenceCandidates].sort((left, right) => (right.like_count ?? 0) - (left.like_count ?? 0))[0] || null;
}

function confidenceForRequest(request: CompareBriefRequest): CompareBriefConfidence {
  const labels = [request.left.metricsCoverageLabel, request.right.metricsCoverageLabel];
  if (labels.some((label) => label === "Not captured")) return "low";
  if (labels.some((label) => label === "Partial metrics only")) return "medium";
  return "medium";
}

function inferAlignment(cluster: CompareBriefClusterRequestItem | null): "Align" | "Mixed" | "Oppose" {
  if (!cluster) return "Mixed";
  if (cluster.sizeShare >= 0.5 && cluster.likeShare >= 0.5) return "Align";
  if (cluster.sizeShare < 0.2 || cluster.likeShare < 0.2) return "Oppose";
  return "Mixed";
}

/**
 * Infer a reaction type label from cluster engagement ratios — usable even without AI.
 * The goal is to describe *how* the audience is responding, not just what they're saying.
 * - 共鳴放大型: likes significantly outpace comment share → high resonance, few people driving most likes
 * - 集中回聲型: dominant cluster (≥50%) → majority echoing same direction
 * - 分歧探索型: likes significantly below comment share → many comments, but low approval signal
 * - 分散反應型: fallback for mid-range patterns
 */
function inferReactionType(sizeShare: number, likeShare: number): string {
  if (likeShare > sizeShare + 0.15) return "共鳴放大型";
  if (sizeShare >= 0.5) return "集中回聲型";
  if (likeShare < sizeShare - 0.15) return "分歧探索型";
  return "分散反應型";
}

function concentrationPhrase(cluster: CompareBriefClusterRequestItem | null): string {
  if (!cluster) return "主線仍不穩定";
  if (cluster.sizeShare >= 0.55) return "留言快速收斂到少數主線";
  if (cluster.sizeShare >= 0.35) return "留言先聚成幾條可辨識支線";
  return "留言重點仍偏分散";
}

function engagementPhrase(cluster: CompareBriefClusterRequestItem | null): string {
  if (!cluster) return "互動訊號仍偏弱";
  if (cluster.likeShare > cluster.sizeShare + 0.12) return "高讚集中在少數代表說法";
  if (cluster.likeShare < cluster.sizeShare - 0.12) return "參與很多，但認同沒有同步集中";
  return "留言規模與認同度大致同步";
}

function sanitizeFallbackReason(value: string): string {
  return value
    .replace(/ai\s*compare\s*brief\s*unavailable\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSingleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  const firstClause = normalized.split(/[；;。！？!?,，]/).map((part) => part.trim()).find(Boolean) || normalized;
  if (firstClause.length <= maxLength) {
    return firstClause.replace(/[，,：:]$/, "").trim();
  }
  return `${firstClause.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function deriveCompareKeywords(
  request: CompareBriefRequest,
  leftReactionType: string,
  rightReactionType: string
): string[] {
  const leftTop = strongestCluster(request.left);
  const rightTop = strongestCluster(request.right);
  const leftLead = normalizeKeyword(leftTop?.keywords?.[0] || "");
  const rightLead = normalizeKeyword(rightTop?.keywords?.[0] || "");
  return readKeywords([
    leftReactionType,
    rightReactionType,
    leftLead && rightLead && leftLead !== rightLead ? `${leftLead} vs ${rightLead}` : leftLead || rightLead,
    leftTop && rightTop
      ? Math.abs(leftTop.sizeShare - rightTop.sizeShare) >= 0.12
        ? leftTop.sizeShare > rightTop.sizeShare
          ? "A 較集中"
          : "B 較集中"
        : "互動結構分流"
      : "反應方向差異",
    request.left.metricsCoverageLabel === request.right.metricsCoverageLabel ? "創作啟示" : "資料覆蓋差異"
  ], ["反應差異", "互動結構", "創作啟示"]);
}

/* ── evidence catalog ── */

interface EvidenceCatalogEntry {
  alias: string;
  commentId: string;
  side: "A" | "B";
  clusterKey: number;
  likeCount: number;
  text: string;
}

function buildEvidenceCatalog(request: CompareBriefRequest): EvidenceCatalogEntry[] {
  const entries: EvidenceCatalogEntry[] = [];
  let n = 1;
  for (const cluster of request.left.clusters) {
    for (const ev of cluster.evidenceCandidates.slice(0, 5)) {
      entries.push({
        alias: `e${n++}`,
        commentId: ev.comment_id,
        side: "A",
        clusterKey: cluster.clusterKey,
        likeCount: ev.like_count ?? 0,
        text: ev.text
      });
    }
  }
  for (const cluster of request.right.clusters) {
    for (const ev of cluster.evidenceCandidates.slice(0, 5)) {
      entries.push({
        alias: `e${n++}`,
        commentId: ev.comment_id,
        side: "B",
        clusterKey: cluster.clusterKey,
        likeCount: ev.like_count ?? 0,
        text: ev.text
      });
    }
  }
  return entries;
}

/* ── public API ── */

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
  const catalog = buildEvidenceCatalog(request);
  const leftTop = strongestCluster(request.left);
  const rightTop = strongestCluster(request.right);

  const leftClusterLines = request.left.clusters.map((c) =>
    `- side=A cluster=${c.clusterKey} keywords=[${c.keywords.slice(0, 3).join(", ")}] size_share=${roundPct(c.sizeShare)}% like_share=${roundPct(c.likeShare)}%`
  ).join("\n");
  const rightClusterLines = request.right.clusters.map((c) =>
    `- side=B cluster=${c.clusterKey} keywords=[${c.keywords.slice(0, 3).join(", ")}] size_share=${roundPct(c.sizeShare)}% like_share=${roundPct(c.likeShare)}%`
  ).join("\n");

  const leftMetrics = leftTop
    ? [
        `left_top_cluster_size_share=${roundPct(leftTop.sizeShare)}%`,
        `left_top_cluster_like_share=${roundPct(leftTop.likeShare)}%`,
        `left_visible_clusters=${request.left.clusters.length}`,
        `left_likes_per_hour=${request.left.velocity.likesPerHour ?? "n/a"}`,
        `left_comments_per_hour=${request.left.velocity.commentsPerHour ?? "n/a"}`
      ]
    : ["left_top_cluster=none"];
  const rightMetrics = rightTop
    ? [
        `right_top_cluster_size_share=${roundPct(rightTop.sizeShare)}%`,
        `right_top_cluster_like_share=${roundPct(rightTop.likeShare)}%`,
        `right_visible_clusters=${request.right.clusters.length}`,
        `right_likes_per_hour=${request.right.velocity.likesPerHour ?? "n/a"}`,
        `right_comments_per_hour=${request.right.velocity.commentsPerHour ?? "n/a"}`
      ]
    : ["right_top_cluster=none"];

  const catalogLines = catalog
    .map((e) => `[${e.alias}] side=${e.side} cluster=${e.clusterKey} likes=${e.likeCount} text="${e.text}"`)
    .join("\n");

  const schema = JSON.stringify({
    headline: "string — 28字以內，格式「A 偏[型態]，B 偏[型態]」",
    relation: "string — 40字以內，說明兩邊留言如何把同一主題讀成不同方向",
    supporting_observations: [
      { text: "string", scope: "left|right|cross", evidence_ids: ["e1", "e2"] }
    ],
    a_reading: "string — A端具體讀法，引用evidence alias",
    b_reading: "string — B端具體讀法，引用evidence alias",
    why_it_matters: "string — 分析性洞察，不是客套話",
    creator_cue: "string — 24字以內，格式「要共鳴看 A」",
    keywords: ["string x3-5"],
    audience_alignment_left: "Align|Mixed|Oppose",
    audience_alignment_right: "Align|Mixed|Oppose",
    confidence: "low|medium|high"
  }, null, 2);

  return [
    "你是社群分析助手。",
    "請根據以下資料輸出一份繁體中文 compare insight。",
    "只回傳 JSON，不要加解釋。",
    "",
    "[POST A]",
    `author=${request.left.author}`,
    `post_text=${request.left.text}`,
    `age=${request.left.ageLabel}`,
    `metrics_coverage=${request.left.metricsCoverageLabel}`,
    `source_comment_count=${request.left.sourceCommentCount}`,
    "",
    "[POST B]",
    `author=${request.right.author}`,
    `post_text=${request.right.text}`,
    `age=${request.right.ageLabel}`,
    `metrics_coverage=${request.right.metricsCoverageLabel}`,
    `source_comment_count=${request.right.sourceCommentCount}`,
    "",
    "[CLUSTER SNAPSHOT]",
    leftClusterLines,
    rightClusterLines,
    "",
    "[MIN HARD METRICS]",
    ...leftMetrics,
    ...rightMetrics,
    "",
    "[EVIDENCE CATALOG]",
    catalogLines,
    "",
    "輸出規格：",
    "  headline: 必須同時說明 A 和 B 的反應型態（共鳴放大型 / 集中回聲型 / 分歧探索型 / 分散反應型），控制在 28 個中文字以內。",
    "  relation: 用一句話說明同一主題在兩邊留言區被讀成什麼差異方向，控制在 40 個中文字以內。",
    "  supporting_observations: 先輸出觀察再給解讀；每條觀察必須包含 evidence_ids，只能引用 EVIDENCE CATALOG 中的 alias；無法引用 evidence 的觀察直接省略。",
    "  a_reading / b_reading: 各端具體讀法，必須引用至少一條 evidence alias。",
    "  why_it_matters: 這兩邊差異對讀者意味著什麼，一個分析性洞察，不要說廢話。",
    "  creator_cue: 給創作者的短促行動提示，控制在 24 個中文字以內。",
    "  keywords: 3 到 5 個短語，可快速掃描的判斷錨點。",
    "  audience_alignment_left / right: 只能是 Align、Mixed、Oppose。",
    "  confidence: 只能是 low、medium、high。",
    "",
    "Output schema:",
    schema
  ].join("\n");
}

function readingContainsCitation(text: string, validAliases: Set<string>): boolean {
  const tokens = text.match(/\be\d+\b/g);
  if (!tokens) return false;
  return tokens.some((t) => validAliases.has(t));
}

export function parseCompareBriefResponse(raw: string, request: CompareBriefRequest): CompareBrief | null {
  let parsed: CompareBriefResponsePayload;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  const catalog = buildEvidenceCatalog(request);
  const validAliases = new Set(catalog.map((e) => e.alias));

  const headline = String(parsed.headline || "").trim();
  const relation = String(parsed.relation || "").trim();
  const aReading = String(parsed.a_reading || "").trim();
  const bReading = String(parsed.b_reading || "").trim();
  const whyItMatters = String(parsed.why_it_matters || "").trim();
  const creatorCue = String(parsed.creator_cue || "").trim();
  const keywords = readKeywords(parsed.keywords);
  const audienceAlignmentLeft = readAlignment(String(parsed.audience_alignment_left || "").trim(), "Mixed");
  const audienceAlignmentRight = readAlignment(String(parsed.audience_alignment_right || "").trim(), "Mixed");
  const confidence = readConfidence(String(parsed.confidence || "").trim(), "medium");

  const rawObservations = Array.isArray(parsed.supporting_observations) ? parsed.supporting_observations : [];
  const supportingObservations: SupportingObservation[] = rawObservations
    .map((obs: unknown): SupportingObservation | null => {
      if (!obs || typeof obs !== "object") return null;
      const o = obs as Record<string, unknown>;
      const text = String(o.text || "").trim();
      const scope = o.scope === "left" || o.scope === "right" || o.scope === "cross" ? o.scope : null;
      if (!text || !scope) return null;
      const ids = Array.isArray(o.evidence_ids)
        ? (o.evidence_ids as unknown[]).map((id) => String(id).trim()).filter((id) => validAliases.has(id))
        : [];
      if (ids.length === 0) return null;
      return { text, scope, evidenceIds: ids };
    })
    .filter((obs): obs is SupportingObservation => obs !== null);

  if (
    !headline
    || !relation
    || supportingObservations.length === 0
    || !aReading
    || !bReading
    || !whyItMatters
    || !creatorCue
    || keywords.length < 3
  ) {
    return null;
  }
  // Reject side readings that contain no evidence alias reference — they are uncited prose
  if (!readingContainsCitation(aReading, validAliases) || !readingContainsCitation(bReading, validAliases)) {
    return null;
  }
  if (!["low", "medium", "high"].includes(confidence)) return null;
  if (
    !["Align", "Mixed", "Oppose"].includes(audienceAlignmentLeft)
    || !["Align", "Mixed", "Oppose"].includes(audienceAlignmentRight)
  ) {
    return null;
  }

  return {
    source: "ai",
    headline,
    relation,
    supportingObservations,
    aReading,
    bReading,
    whyItMatters,
    creatorCue,
    keywords,
    audienceAlignmentLeft,
    audienceAlignmentRight,
    confidence
  };
}

export function normalizeCompareBrief(value: unknown, fallback: CompareBrief): CompareBrief {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const payload = value as Record<string, unknown>;

  const rawObservations = Array.isArray(payload.supportingObservations) ? payload.supportingObservations : [];
  const supportingObservations: SupportingObservation[] = rawObservations.filter(
    (obs): obs is SupportingObservation => {
      if (!obs || typeof obs !== "object") return false;
      const o = obs as Record<string, unknown>;
      return Boolean(o.text && o.scope && Array.isArray(o.evidenceIds));
    }
  );

  const whyItMatters =
    readTrimmedString(payload.whyItMatters)
    || readTrimmedString(payload.why_it_matters)
    || fallback.whyItMatters;
  const relation =
    readTrimmedString(payload.relation)
    || fallback.relation;
  const creatorCue =
    readTrimmedString(payload.creatorCue)
    || readTrimmedString(payload.creator_cue)
    || fallback.creatorCue;
  const aReading =
    readTrimmedString(payload.aReading)
    || readTrimmedString(payload.a_reading)
    || fallback.aReading;
  const bReading =
    readTrimmedString(payload.bReading)
    || readTrimmedString(payload.b_reading)
    || fallback.bReading;
  const keywords = readKeywords(payload.keywords, fallback.keywords);

  return {
    source: payload.source === "ai" ? "ai" : fallback.source,
    headline: readTrimmedString(payload.headline) || fallback.headline,
    relation,
    supportingObservations: supportingObservations.length > 0 ? supportingObservations : fallback.supportingObservations,
    aReading,
    bReading,
    whyItMatters,
    creatorCue,
    keywords,
    audienceAlignmentLeft: readAlignment(payload.audienceAlignmentLeft ?? payload.audience_alignment_left, fallback.audienceAlignmentLeft),
    audienceAlignmentRight: readAlignment(payload.audienceAlignmentRight ?? payload.audience_alignment_right, fallback.audienceAlignmentRight),
    confidence: readConfidence(payload.confidence, fallback.confidence)
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
  const audienceAlignmentLeft = inferAlignment(leftTop);
  const audienceAlignmentRight = inferAlignment(rightTop);

  const leftReactionType = leftTop
    ? inferReactionType(leftTop.sizeShare, leftTop.likeShare)
    : "反應型態不明";
  const rightReactionType = rightTop
    ? inferReactionType(rightTop.sizeShare, rightTop.likeShare)
    : "反應型態不明";

  const leftStructureText = leftTop
    ? `A 的主導群組（${roundPct(leftTop.sizeShare)}% 留言、${roundPct(leftTop.likeShare)}% 按讚）呈現${leftReactionType}，圍繞「${leftLabel}」`
    : "A 端目前沒有穩定的主導群組";
  const rightStructureText = rightTop
    ? `B 的主導群組（${roundPct(rightTop.sizeShare)}% 留言、${roundPct(rightTop.likeShare)}% 按讚）呈現${rightReactionType}，圍繞「${rightLabel}」`
    : "B 端目前沒有穩定的主導群組";

  const sameReactionType = leftReactionType === rightReactionType;
  const headline = sameReactionType
    ? compactSingleLine(`A 與 B 都偏${leftReactionType}，但聚焦不同。`, 28)
    : compactSingleLine(`A 偏${leftReactionType}，B 偏${rightReactionType}。`, 28);

  const creatorCueBase = sameReactionType
    ? "同型回應下，先看聚焦差異。"
    : leftReactionType.includes("共鳴") && rightReactionType.includes("分歧")
      ? "要共鳴看 A，要分歧看 B。"
      : "先選你要的回應型態。";

  const aReading = leftEvidence
    ? `A 端主要是${leftReactionType}：討論先往「${leftLabel}」收斂，再由像「${leftEvidence.text}」這種代表說法把氣氛定調。`
    : `A 的受眾以${leftReactionType}為主，但代表性留言仍偏少，判斷暫時保守。`;
  const bReading = rightEvidence
    ? `B 端主要是${rightReactionType}：討論被帶往「${rightLabel}」，而像「${rightEvidence.text}」這種留言負責把那個方向講得更明白。`
    : `B 的受眾以${rightReactionType}為主，但代表性留言仍偏少，判斷暫時保守。`;

  const whyItMatters = sameReactionType
    ? `兩邊都觸發了${leftReactionType}，但受眾抓住的判讀重點不同。A 這邊${concentrationPhrase(leftTop)}，而且${engagementPhrase(leftTop)}；B 這邊則${concentrationPhrase(rightTop)}，而且${engagementPhrase(rightTop)}。這代表相同主題被帶進了不同的討論入口。`
    : `兩邊不是在放大同一種回應。A 比較像${leftReactionType}，而且${engagementPhrase(leftTop)}；B 比較像${rightReactionType}，而且${engagementPhrase(rightTop)}。這說明兩篇貼文把同一議題推進了不同的互動機制。`;
  const relation = sameReactionType
    ? `同一議題都能聚攏反應，但 A 收向${leftLabel}，B 則帶往${rightLabel}。`
    : `同一議題在兩邊被啟動成不同互動：A 偏${leftLabel}，B 偏${rightLabel}。`;

  // Build alias map from the same evidence catalog grammar used by the AI path
  const catalog = buildEvidenceCatalog(request);
  const aliasMap = new Map(catalog.map((e) => [e.commentId, e.alias]));

  const supportingObservations: SupportingObservation[] = [];
  if (leftEvidence) {
    const alias = aliasMap.get(leftEvidence.comment_id);
    if (alias) {
      supportingObservations.push({
        text: leftStructureText,
        scope: "left",
        evidenceIds: [alias]
      });
    }
  }
  if (rightEvidence) {
    const alias = aliasMap.get(rightEvidence.comment_id);
    if (alias) {
      supportingObservations.push({
        text: rightStructureText,
        scope: "right",
        evidenceIds: [alias]
      });
    }
  }
  // If no aliased evidence is available, leave supportingObservations empty —
  // do not push a cross observation with evidenceIds: [], which breaks the alias grammar.

  const cleanedFallbackReason = sanitizeFallbackReason(fallbackReason);
  return {
    source: "fallback",
    headline,
    relation: compactSingleLine(relation, 40),
    supportingObservations,
    aReading,
    bReading,
    whyItMatters,
    creatorCue: compactSingleLine(`${cleanedFallbackReason ? `${cleanedFallbackReason} ` : ""}${creatorCueBase}`, 28),
    keywords: deriveCompareKeywords(request, leftReactionType, rightReactionType),
    audienceAlignmentLeft,
    audienceAlignmentRight,
    confidence: confidenceForRequest(request)
  };
}
