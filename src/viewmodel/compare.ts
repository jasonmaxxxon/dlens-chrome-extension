import type { AnalysisSnapshot, CrawlResultSnapshot } from "../contracts/ingest.ts";
import { buildClusterSummaries, getDominanceLabel } from "../analysis/cluster-summary.ts";
import type {
  ClusterMapNode,
  ClusterSummaryCard,
  ClusterToneVariant,
  CompareHeroSummary,
  SelectedClusterDetail,
  SelectedClusterSupportMetric
} from "../analysis/types.ts";
import {
  buildCompareBriefCacheKey,
  buildDeterministicCompareBrief,
  type CompareBrief,
  type CompareBriefRequest
} from "../compare/brief.ts";
import { buildCompareBriefRequest } from "../compare/brief-request.ts";
import {
  buildDeterministicClusterInterpretation,
  clusterInterpretationKey,
  pickClusterExampleEvidence,
  type ClusterInterpretation,
  type CompareClusterSummaryRequest
} from "../compare/cluster-interpretation.ts";
import type { EvidenceAnnotation, EvidenceAnnotationRequest } from "../compare/evidence-annotation.ts";
import { COMPARE_BRIEF_PROMPT_VERSION } from "../compare/provider.ts";
import { describeAiOutputProvenance, normalizeAiOutputProvenance, type AiOutputProvenance } from "../state/ai-provenance.ts";
import { deriveDerivedRecordStaleness, type DerivedRecordStaleness } from "../state/derived-record.ts";
import { deriveLoadState, type LoadState } from "../state/load-state.ts";
import { getItemReadinessStatus, pickCompareSelection, type ItemReadinessStatus } from "../state/processing-state.ts";
import type { CompareResultLayout, ExtensionSettings, SessionItem, SessionRecord, Topic } from "../state/types.ts";

export const COMPARE_METRIC_KEYS = ["likes", "comments", "reposts", "forwards", "views"] as const;
export type CompareMetricKey = (typeof COMPARE_METRIC_KEYS)[number];
export type CompareBriefSurfaceState = "idle" | "loading" | "ready" | "fallback";
export type ClusterSummaryLoadState = "idle" | "loading" | "ready" | "error";
export type CompareSide = "left" | "right";
export type ClusterAlignment = "Align" | "Mixed" | "Oppose";

export interface CommentData {
  comment_id?: string;
  author?: string;
  text?: string;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  forward_count?: number;
}

export interface PostData {
  author?: string;
  text?: string;
  url?: string;
  metrics?: Record<string, unknown>;
  metricPresent?: Record<CompareMetricKey, boolean>;
  postedAt?: string | null;
  timeTokenHint?: string | null;
}

export interface MetricDisplay {
  text: string;
  numeric: number | null;
  emphasized?: boolean;
}

export interface CompareAlert {
  type: "branch_emergence" | "temporal_shift" | "high_engagement_outlier" | "low_volume_high_like_share";
  title: string;
  detail: string;
}

export interface CompareBriefSurfaceViewModel {
  state: CompareBriefSurfaceState;
  loadState: LoadState;
  derivedRecord: DerivedRecordStaleness;
  provenance: AiOutputProvenance;
  provenanceLabel: string;
  provenanceDetail: string;
  visibleBrief: CompareBrief | null;
  fetchedBrief: CompareBrief | null;
  fallbackBrief: CompareBrief | null;
  request: CompareBriefRequest | null;
  heroSummary: CompareHeroSummary | null;
  showAlertRail: boolean;
  alerts: CompareAlert[];
}

export interface CompareReadinessViewModel {
  readyCount: number;
  analyzingCount: number;
  inflightCount: number;
  failedCount: number;
  pendingItem: ComparePendingItemViewModel | null;
  pendingStatus: ItemReadinessStatus | null;
  explanation: string;
}

export interface CompareSelectionRef {
  key: string;
}

export interface ComparePendingItemViewModel {
  id: string;
  authorLabel: string;
}

export interface ClusterSurface {
  key: string;
  side: CompareSide;
  summary: ClusterSummaryCard;
  title: string;
  thesis: string;
  supportLabel: string;
  provenance: AiOutputProvenance;
  provenanceLabel: string;
  provenanceDetail: string;
  audienceEvidence: CommentData[];
  alignment: ClusterAlignment;
  toneVariant: ClusterToneVariant;
}

export interface CompareClusterViewModel {
  summaryRequest: CompareClusterSummaryRequest | null;
  summaryState: ClusterSummaryLoadState;
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  leftNodes: ClusterMapNode[];
  rightNodes: ClusterMapNode[];
}

export interface CompareSelectionViewModel {
  selectedA: string;
  selectedB: string;
  itemA: CompareSelectedItemViewModel | null;
  itemB: CompareSelectedItemViewModel | null;
}

export interface CompareSelectedItemViewModel {
  id: string;
}

export interface CompareReadyItemOption {
  id: string;
  label: string;
}

export interface CompareAttachmentViewModel {
  fromTopicId?: string;
  fromTopicName?: string;
  activeResultId: string | null;
  topics: Topic[];
  attachedTopicIds: string[];
}

export type CompareCommand =
  | { kind: "goToLibrary"; target: { sessionId: string } }
  | { kind: "returnToTopic"; target: { sessionId: string; topicId: string } }
  | { kind: "selectPair"; target: { sessionId: string; itemAId: string; itemBId: string } }
  | { kind: "attachToTopic"; target: { sessionId: string; resultId: string; topicId: string } }
  | { kind: "fetchBrief"; target: { sessionId: string; itemAId: string; itemBId: string }; request: CompareBriefRequest }
  | { kind: "fetchClusterSummaries"; target: { sessionId: string; itemAId: string; itemBId: string }; request: CompareClusterSummaryRequest }
  | { kind: "fetchEvidenceAnnotations"; target: { sessionId: string; itemAId: string; itemBId: string }; request: EvidenceAnnotationRequest }
  | { kind: "saveTechniqueReading"; target: { sessionId: string; itemId: string; side: "A" | "B"; clusterKey: string }; detail: SelectedClusterDetail };

export interface CompareViewModel {
  sessionId: string;
  sessionName: string;
  compareLayout: CompareResultLayout;
  hideSelector: boolean;
  aiProviderConfigured: boolean;
  availability: { ready: boolean; reason: "ready" | "needs_two_ready_posts" };
  readiness: CompareReadinessViewModel;
  readyItemOptions: CompareReadyItemOption[];
  selection: CompareSelectionViewModel;
  postA: PostData | null;
  postB: PostData | null;
  commentsA: CommentData[];
  commentsB: CommentData[];
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedCommentCountA: number;
  capturedCommentCountB: number;
  ageA: { hours: number | null; label: string } | null;
  ageB: { hours: number | null; label: string } | null;
  brief: CompareBriefSurfaceViewModel;
  clusters: CompareClusterViewModel;
  evidenceAnnotationRequest: EvidenceAnnotationRequest | null;
  evidenceAnnotations: EvidenceAnnotation[];
  annotationByCommentId: Record<string, EvidenceAnnotation>;
  attachment: CompareAttachmentViewModel;
  actions: CompareCommand[];
}

export interface CompareFetchedState {
  brief?: CompareBrief | null;
  briefState?: CompareBriefSurfaceState;
  clusterInterpretations?: ClusterInterpretation[];
  clusterSummaryState?: ClusterSummaryLoadState;
  evidenceAnnotations?: EvidenceAnnotation[];
}

export interface BuildCompareViewModelInput {
  session: SessionRecord;
  settings: ExtensionSettings;
  selectedAId?: string;
  selectedBId?: string;
  forcedSelection?: { itemAId: string; itemBId: string } | null;
  hideSelector?: boolean;
  compareLayout?: CompareResultLayout;
  fromTopicId?: string;
  fromTopicName?: string;
  topics?: Topic[];
  activeResultId?: string | null;
  attachedTopicIds?: string[];
  fetched?: CompareFetchedState;
}

function safeArray<T>(value: T[] | readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function getResult(item: SessionItem): CrawlResultSnapshot | null {
  return item.latestCapture?.result ?? null;
}

export function getAnalysis(item: SessionItem): AnalysisSnapshot | null {
  return item.latestCapture?.analysis ?? null;
}

export function getPost(item: SessionItem): PostData {
  const result = getResult(item);
  if (result?.canonical_post) {
    const canonical = result.canonical_post as Record<string, unknown>;
    const canonicalMetrics = (canonical.metrics as Record<string, unknown> | undefined) || {};
    const localMetrics = item.descriptor.engagement as unknown as Record<string, unknown>;
    const mergedMetrics: Record<string, unknown> = { ...localMetrics, ...canonicalMetrics };
    const metricPresent = Object.fromEntries(
      COMPARE_METRIC_KEYS.map((key) => {
        const canonicalValue = canonicalMetrics[key];
        const localPresent = item.descriptor.engagement_present?.[key] ?? false;
        const canonicalPresent = canonicalValue !== null && canonicalValue !== undefined && canonicalValue !== "";
        if (!canonicalPresent && localMetrics[key] !== undefined) {
          mergedMetrics[key] = localMetrics[key];
        }
        return [key, canonicalPresent || localPresent];
      })
    ) as Record<CompareMetricKey, boolean>;

    return {
      author: typeof canonical.author === "string" ? canonical.author : item.descriptor.author_hint || undefined,
      text: typeof canonical.text === "string" ? canonical.text : item.descriptor.text_snippet || undefined,
      url: typeof canonical.url === "string" ? canonical.url : item.descriptor.post_url || undefined,
      metrics: mergedMetrics,
      metricPresent,
      postedAt: typeof canonical.posted_at === "string" ? canonical.posted_at : null,
      timeTokenHint: item.descriptor.time_token_hint || item.latestCapture?.time_token_hint || null
    };
  }
  return {
    author: item.descriptor.author_hint || undefined,
    text: item.descriptor.text_snippet || undefined,
    url: item.descriptor.post_url || undefined,
    metrics: item.descriptor.engagement as unknown as Record<string, unknown>,
    metricPresent: item.descriptor.engagement_present,
    postedAt: null,
    timeTokenHint: item.descriptor.time_token_hint || item.latestCapture?.time_token_hint || null
  };
}

export function getComments(item: SessionItem): CommentData[] {
  const result = getResult(item);
  if (result?.comments) {
    return result.comments.map((comment) => {
      const raw = comment as Record<string, unknown>;
      return {
        comment_id:
          typeof raw.comment_id === "string"
            ? raw.comment_id
            : typeof raw.id === "string"
              ? raw.id
              : undefined,
        author:
          typeof raw.author === "string"
            ? raw.author
            : typeof raw.author_username === "string"
              ? raw.author_username
              : undefined,
        text: typeof raw.text === "string" ? raw.text : undefined,
        like_count: typeof raw.like_count === "number" ? raw.like_count : undefined,
        reply_count: typeof raw.reply_count === "number" ? raw.reply_count : undefined,
        repost_count: typeof raw.repost_count === "number" ? raw.repost_count : undefined,
        forward_count: typeof raw.forward_count === "number" ? raw.forward_count : undefined
      };
    });
  }
  return item.commentsPreview.map((comment) => ({
    comment_id: comment.id,
    author: comment.author,
    text: comment.text,
    like_count: comment.likeCount ?? undefined
  }));
}

export function metricValue(post: PostData, key: CompareMetricKey): number | null {
  const raw = post.metrics?.[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const numeric = parseFloat(raw);
    return Number.isNaN(numeric) ? null : numeric;
  }
  return null;
}

export function metricCaptured(post: PostData, key: CompareMetricKey): boolean {
  return post.metricPresent?.[key] ?? metricValue(post, key) !== null;
}

export function fmtNum(value: number | null): string {
  if (value === null) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function fmtRate(value: number | null): string {
  if (value === null) return "-";
  if (value >= 100) return `${value.toFixed(0)}/h`;
  if (value >= 10) return `${value.toFixed(1)}/h`;
  return `${value.toFixed(2)}/h`;
}

export function diffColor(left: number | null, right: number | null, palette: { soft: string; success: string; fail: string }): string {
  if (left === null || right === null) return palette.soft;
  if (left > right) return palette.success;
  if (left < right) return palette.fail;
  return palette.soft;
}

export function parseTimeTokenToHours(token: string | null | undefined): number | null {
  if (!token) return null;
  const trimmed = token.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(mo|m|h|d|w|y)$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1] || "", 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2]?.toLowerCase();
  switch (unit) {
    case "m": return value / 60;
    case "h": return value;
    case "d": return value * 24;
    case "w": return value * 24 * 7;
    case "mo": return value * 24 * 30;
    case "y": return value * 24 * 365;
    default: return null;
  }
}

export function compactAgeLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.max(1, Math.round(hours))}h`;
  if (hours < 24 * 30) return `${Math.max(1, Math.round(hours / 24))}d`;
  if (hours < 24 * 365) return `${Math.max(1, Math.round(hours / (24 * 30)))}mo`;
  return `${Math.max(1, Math.round(hours / (24 * 365)))}y`;
}

export function getPostAge(post: PostData): { hours: number | null; label: string } {
  if (post.postedAt) {
    const date = new Date(post.postedAt);
    const ageHours = (Date.now() - date.getTime()) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours > 0) {
      return {
        hours: ageHours,
        label: `${compactAgeLabel(ageHours)} old`
      };
    }
  }
  const hintHours = parseTimeTokenToHours(post.timeTokenHint);
  if (hintHours !== null) {
    return {
      hours: hintHours,
      label: `Approx. ${post.timeTokenHint?.trim() || compactAgeLabel(hintHours)} old`
    };
  }
  return { hours: null, label: "Age unknown" };
}

export function getMetricsCoverageLabel(post: PostData): string {
  const capturedCount = COMPARE_METRIC_KEYS.filter((key) => metricCaptured(post, key)).length;
  if (capturedCount === 0) return "Not captured";
  if (capturedCount < COMPARE_METRIC_KEYS.length) return "Partial metrics only";
  return "All core metrics captured";
}

export function getRawMetricDisplay(post: PostData, key: CompareMetricKey): MetricDisplay {
  if (!metricCaptured(post, key)) return { text: "Not captured", numeric: null };
  const value = metricValue(post, key);
  if (value === null) return { text: "Not captured", numeric: null };
  return { text: fmtNum(value), numeric: value, emphasized: true };
}

export function getVelocityMetricDisplay(post: PostData, key: Exclude<CompareMetricKey, "views">): MetricDisplay {
  if (!metricCaptured(post, key)) return { text: "Not captured", numeric: null };
  const value = metricValue(post, key);
  if (value === null) return { text: "Not captured", numeric: null };
  const age = getPostAge(post);
  if (age.hours === null) return { text: "Age unknown", numeric: null };
  const perHour = value / Math.max(age.hours, 1 / 60);
  return { text: fmtRate(perHour), numeric: perHour, emphasized: true };
}

export function buildCommentLookup(comments: CommentData[]): Map<string, CommentData> {
  return new Map(
    comments
      .filter((comment): comment is CommentData & { comment_id: string } => Boolean(comment.comment_id))
      .map((comment) => [comment.comment_id!, comment])
  );
}

export function getCapturedCommentCount(item: SessionItem, comments: CommentData[]): number {
  const sourceCommentCount = item.latestCapture?.analysis?.source_comment_count;
  if (typeof sourceCommentCount === "number" && sourceCommentCount >= 0) {
    return sourceCommentCount;
  }
  return comments.length;
}

export function clusterSupportLabel(summary: ClusterSummaryCard): string {
  const sizePct = Math.round(summary.cluster.size_share * 100);
  const likePct = Math.round(summary.cluster.like_share * 100);
  const totalComments = summary.sourceCommentCount > 0 ? summary.sourceCommentCount : null;
  if (totalComments) {
    return `${summary.supportCount}/${totalComments} comments · ${sizePct}% of replies · ${likePct}% of likes`;
  }
  return `${sizePct}% of replies · ${likePct}% of likes`;
}

export function surfacedEvidenceCount(summaries: readonly ClusterSummaryCard[]): number {
  return summaries.reduce((total, summary) => total + summary.evidence.length, 0);
}

export function hasConfiguredProviderKey(settings: ExtensionSettings): boolean {
  const provider = settings.oneLinerProvider;
  if (provider === "google") return settings.hasGoogleKey ?? Boolean(settings.googleApiKey?.trim());
  if (provider === "openai") return settings.hasOpenAiKey ?? Boolean(settings.openaiApiKey.trim());
  if (provider === "claude") return settings.hasClaudeKey ?? Boolean(settings.claudeApiKey.trim());
  return false;
}

function mergeEvidenceDetails(
  evidence: ClusterSummaryCard["evidence"][number],
  commentLookup: Map<string, CommentData>
): CommentData {
  const raw = evidence.comment_id ? commentLookup.get(evidence.comment_id) : null;
  return {
    comment_id: evidence.comment_id,
    author: raw?.author || evidence.author,
    text: raw?.text || evidence.text,
    like_count: raw?.like_count ?? evidence.like_count,
    reply_count: raw?.reply_count,
    repost_count: raw?.repost_count,
    forward_count: raw?.forward_count
  };
}

export function analysisMetrics(analysis: AnalysisSnapshot | null) {
  const metrics = analysis?.metrics || {};
  const clusterCount =
    analysis && Array.isArray(analysis.clusters)
      ? analysis.clusters.length
      : typeof metrics.n_clusters === "number"
        ? metrics.n_clusters
        : null;
  return {
    nClusters: clusterCount,
    dominance: typeof metrics.dominance_ratio_top1 === "number" ? metrics.dominance_ratio_top1 : null,
    gini: typeof metrics.gini_like_share === "number" ? metrics.gini_like_share : null
  };
}

export function buildClusterSummaryRequest(left: SessionItem, right: SessionItem): CompareClusterSummaryRequest | null {
  const leftAnalysis = getAnalysis(left);
  const rightAnalysis = getAnalysis(right);
  if (!left.captureId || !right.captureId || !leftAnalysis || !rightAnalysis) {
    return null;
  }

  const leftPost = getPost(left);
  const rightPost = getPost(right);
  const leftSummaries = buildClusterSummaries(leftAnalysis, 5, 5, left.captureId);
  const rightSummaries = buildClusterSummaries(rightAnalysis, 5, 5, right.captureId);

  return {
    clusters: [...leftSummaries, ...rightSummaries].map((summary) => ({
      captureId: summary.captureId,
      analysisUpdatedAt: (summary.captureId === left.captureId ? leftAnalysis.updated_at : rightAnalysis.updated_at) || "",
      clusterKey: summary.cluster.cluster_key,
      author: summary.captureId === left.captureId ? leftPost.author || "unknown" : rightPost.author || "unknown",
      postText: summary.captureId === left.captureId ? leftPost.text || "" : rightPost.text || "",
      sourceCommentCount: summary.captureId === left.captureId
        ? leftAnalysis.source_comment_count ?? 0
        : rightAnalysis.source_comment_count ?? 0,
      keywords: summary.cluster.keywords,
      sizeShare: summary.cluster.size_share,
      likeShare: summary.cluster.like_share,
      evidenceCandidates: summary.evidence.slice(0, 5)
    }))
  };
}

export function compareSelectionKey(captureId: string, clusterKey: number): string {
  return `${captureId}:${clusterKey}`;
}

export function clipSentence(text: string | undefined, limit = 78): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "作者原文資訊不足。";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}...`;
}

export function authorStanceSummary(post: PostData | null, clusterTitle: string, sideLabel: "A" | "B"): string {
  if (!post) return `Post ${sideLabel} 的作者立場資料不足。`;
  return `Post ${sideLabel} 主要圍繞「${clusterTitle}」展開，作者原文聚焦於：${clipSentence(post.text, 42)}`;
}

export function alignmentSummary(alignment: ClusterAlignment): string {
  switch (alignment) {
    case "Align":
      return "目前主要回應大致順著作者原文方向延伸與放大。";
    case "Oppose":
      return "目前主要回應較常偏離原文主軸，較像逆向回應或另開戰場。";
    default:
      return "目前回應內部仍有分歧，既有順著原文延伸，也有明顯偏移。";
  }
}

export function visibleClusterCountLabel(count: number): string {
  if (count <= 0) return "No significant clusters yet";
  if (count <= 1) return "Showing 1 dominant cluster";
  return `Showing ${count} most significant clusters`;
}

export function hiddenClusterCountLabel(rawCount: number | null, visibleCount: number): string | null {
  if (rawCount === null || rawCount <= visibleCount) return null;
  const hidden = rawCount - visibleCount;
  if (hidden <= 0) return null;
  return `${hidden} additional low-signal clusters hidden`;
}

function normalizeOverlapTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[「」"'`.,/|]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function overlapScore(left: readonly string[], right: readonly string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.reduce((score, token) => score + (rightSet.has(token) ? 1 : 0), 0);
}

export type EvidenceKeywordFilter = "all" | "A" | "B";

function keywordMatchScore(keyword: string, candidates: readonly string[]): number {
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  if (!normalizedKeyword) return 0;
  const keywordTokens = normalizeOverlapTokens(normalizedKeyword);
  return candidates.reduce((score, candidate) => {
    const normalizedCandidate = String(candidate || "").trim().toLowerCase();
    if (!normalizedCandidate) return score;
    const tokenScore = overlapScore(keywordTokens, normalizeOverlapTokens(normalizedCandidate));
    const includesScore = normalizedCandidate.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedCandidate) ? 2 : 0;
    return score + tokenScore + includesScore;
  }, 0);
}

export function resolveEvidenceKeywordFilter(
  keyword: string | null,
  detailA: SelectedClusterDetail | null,
  detailB: SelectedClusterDetail | null,
  aDirection: string | null,
  bDirection: string | null
): EvidenceKeywordFilter {
  if (!keyword) return "all";
  const keywordTokens = normalizeOverlapTokens(keyword);
  const leftCandidates = detailA
    ? [
        detailA.clusterTitle,
        detailA.thesis,
        detailA.supportLabel,
        detailA.authorStance,
        detailA.alignmentSummary,
        aDirection || "",
        ...detailA.audienceEvidence.map((item) => item.text || "")
      ]
    : [];
  const rightCandidates = detailB
    ? [
        detailB.clusterTitle,
        detailB.thesis,
        detailB.supportLabel,
        detailB.authorStance,
        detailB.alignmentSummary,
        bDirection || "",
        ...detailB.audienceEvidence.map((item) => item.text || "")
      ]
    : [];
  const leftScore = keywordMatchScore(keyword, leftCandidates);
  const rightScore = keywordMatchScore(keyword, rightCandidates);
  if (leftScore <= 0 && rightScore <= 0) return "all";
  if (keywordTokens.length >= 2 && leftScore > 0 && rightScore > 0) return "all";
  if (leftScore === rightScore) return "all";
  return leftScore > rightScore ? "A" : "B";
}

export function findRelatedCluster(surface: ClusterSurface, candidates: readonly ClusterSurface[]) {
  const titleTokens = normalizeOverlapTokens(surface.title);
  const keywordTokens = surface.summary.cluster.keywords.flatMap(normalizeOverlapTokens);
  const scored = candidates.map((candidate) => {
    const score = overlapScore(titleTokens, normalizeOverlapTokens(candidate.title)) * 2
      + overlapScore(keywordTokens, candidate.summary.cluster.keywords.flatMap(normalizeOverlapTokens));
    return { candidate, score };
  }).sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || best.score < 1) return null;
  return best.candidate;
}

export function inferClusterAlignment(summary: ClusterSummaryCard): ClusterAlignment {
  const { size_share: sizeShare, like_share: likeShare } = summary.cluster;
  if (sizeShare >= 0.5 && likeShare >= 0.5) return "Align";
  if (sizeShare < 0.2 || likeShare < 0.2) return "Oppose";
  return "Mixed";
}

export function toneVariantForSummary(summary: ClusterSummaryCard): ClusterToneVariant {
  const alignment = inferClusterAlignment(summary);
  if (summary.supportCount <= 2 || summary.cluster.size_share < 0.18) return "minor";
  if (alignment === "Align") return "primary";
  if (alignment === "Oppose") return "cautious";
  return "supportive";
}

export function resolveClusterSurface(
  summary: ClusterSummaryCard,
  side: CompareSide,
  interpretations: Map<string, ClusterInterpretation>,
  commentLookup: Map<string, CommentData>
): ClusterSurface {
  const interpretation = interpretations.get(clusterInterpretationKey(summary.captureId, summary.cluster.cluster_key)) ?? null;
  const fallback = buildDeterministicClusterInterpretation(summary.cluster);
  const selectedInterpretation = interpretation
    ? { ...interpretation, provenance: normalizeAiOutputProvenance(interpretation.provenance) }
    : fallback;
  const provenanceCopy = describeAiOutputProvenance(selectedInterpretation.provenance);
  const title = selectedInterpretation.label || "低訊號群組";
  const thesis = selectedInterpretation.oneLiner || "這個群組目前只有有限線索，仍需回看代表留言。";
  const audienceEvidence = pickClusterExampleEvidence(summary.evidence, interpretation?.evidenceIds, 4)
    .map((comment) => mergeEvidenceDetails(comment, commentLookup));

  return {
    key: compareSelectionKey(summary.captureId, summary.cluster.cluster_key),
    side,
    summary,
    title,
    thesis,
    supportLabel: clusterSupportLabel(summary),
    provenance: selectedInterpretation.provenance,
    provenanceLabel: provenanceCopy.label,
    provenanceDetail: provenanceCopy.detail,
    audienceEvidence,
    alignment: inferClusterAlignment(summary),
    toneVariant: toneVariantForSummary(summary)
  };
}

function bubbleRadius(sizeShare: number): number {
  return Math.max(24, Math.min(58, 22 + sizeShare * 68));
}

export function layoutClusterMapNodes(surfaces: readonly ClusterSurface[]): ClusterMapNode[] {
  const anchorsByCount: Record<number, Array<{ x: number; y: number; scale?: number }>> = {
    1: [{ x: 50, y: 50, scale: 1.45 }],
    2: [{ x: 34, y: 48, scale: 1.15 }, { x: 68, y: 44, scale: 1.08 }],
    3: [{ x: 28, y: 38, scale: 1.08 }, { x: 68, y: 34, scale: 1.04 }, { x: 48, y: 68, scale: 1 }],
    4: [{ x: 28, y: 34 }, { x: 66, y: 28 }, { x: 70, y: 64 }, { x: 30, y: 68 }],
    5: [{ x: 24, y: 28 }, { x: 60, y: 22 }, { x: 74, y: 54 }, { x: 40, y: 66 }, { x: 18, y: 64 }]
  };
  const anchors = anchorsByCount[Math.min(Math.max(surfaces.length, 1), 5)] || anchorsByCount[5]!;

  return surfaces.slice(0, anchors.length).map((surface, index) => ({
    captureId: surface.summary.captureId,
    clusterKey: surface.summary.cluster.cluster_key,
    title: surface.title,
    sizeShare: surface.summary.cluster.size_share,
    supportCount: surface.summary.supportCount,
    likeShare: surface.summary.cluster.like_share,
    x: anchors[index]!.x,
    y: anchors[index]!.y,
    r: bubbleRadius(surface.summary.cluster.size_share) * (anchors[index]!.scale || 1) * [1.18, 1, 0.86, 0.76, 0.68][index]!,
    toneVariant: surface.toneVariant,
    isMinorBucket: surface.toneVariant === "minor"
  }));
}

export function compactHeroHeadline(value: string): string {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const reactionMatch = trimmed.match(/A(?:\s*的受眾)?以?([^，；。]+?)回應[，,]?\s*B(?:\s*的受眾)?以?([^，；。]+?)回應/);
  if (reactionMatch) {
    const left = reactionMatch[1]?.replace(/為主|偏向|主要|型$/, "").trim();
    const right = reactionMatch[2]?.replace(/為主|偏向|主要|型$/, "").trim();
    return `A ${left} · B ${right}`;
  }
  const compact = trimmed.split(/[；;。!?！？]/).map((part) => part.trim()).find(Boolean) || trimmed;
  return compact.length > 34 ? `${compact.slice(0, 33).trim()}...` : compact;
}

export function compactHeroCue(value: string): string {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 28) {
    return trimmed;
  }
  const matched =
    trimmed.match(/要[^，。；;]{0,24}[AB]/)?.[0]
    || trimmed.match(/[AB][^，。；;]{0,24}(更容易|更適合|偏向)[^，。；;]{0,16}/)?.[0]
    || trimmed.split(/[；;。!?！？]/).map((part) => part.trim()).find(Boolean)
    || trimmed;
  return matched.length > 28 ? `${matched.slice(0, 27).trim()}...` : matched;
}

export function buildHeroSummary(
  brief: CompareBrief,
  leftTop: ClusterSurface | null,
  rightTop: ClusterSurface | null
): CompareHeroSummary {
  const compactHeadline = compactHeroHeadline(
    String(brief.headline || "").trim()
      || `A 較靠近「${leftTop?.title || "主題未定"}」，B 較靠近「${rightTop?.title || "主題未定"}」。`
  );
  const creatorCue = String(brief.creatorCue || "").trim()
    || `A 較靠近「${leftTop?.title || "主題未定"}」，B 較靠近「${rightTop?.title || "主題未定"}」。`;
  return {
    headline: compactHeadline,
    relation: String(brief.relation || "").trim(),
    whyItMatters: String(brief.whyItMatters || "").trim(),
    creatorCue,
    cue: compactHeroCue(creatorCue),
    audienceAlignmentLeft: {
      badge: brief.audienceAlignmentLeft,
      summary: alignmentSummary(brief.audienceAlignmentLeft)
    },
    audienceAlignmentRight: {
      badge: brief.audienceAlignmentRight,
      summary: alignmentSummary(brief.audienceAlignmentRight)
    }
  };
}

export function divergenceDirection(detail: SelectedClusterDetail, sideLabel: "A" | "B"): string {
  return `Post ${sideLabel} 較靠近「${detail.clusterTitle}」：${detail.alignmentSummary}`;
}

export function itemLabel(item: SessionItem, index: number): string {
  return `#${index + 1} ${item.descriptor.author_hint || "Unknown"}`;
}

export function selectedClusterDetailFromSurface(
  surface: ClusterSurface | null,
  relatedSurface: ClusterSurface | null,
  authorStance: string
): SelectedClusterDetail | null {
  if (!surface) return null;
  const totalComments = surface.summary.sourceCommentCount > 0 ? surface.summary.sourceCommentCount : null;
  const supportMetrics: SelectedClusterSupportMetric[] = [
    { kind: "comments", label: "Comments", value: String(surface.summary.supportCount) },
    { kind: "replies", label: "Replies", value: `${Math.round(surface.summary.cluster.size_share * 100)}%` },
    { kind: "likes", label: "Likes", value: `${Math.round(surface.summary.cluster.like_share * 100)}%` }
  ];
  if (totalComments !== null) {
    supportMetrics.unshift({
      kind: "captured",
      label: "Captured",
      value: `${surface.summary.supportCount}/${totalComments}`
    });
  }
  return {
    captureId: surface.summary.captureId,
    clusterKey: surface.summary.cluster.cluster_key,
    clusterTitle: surface.title,
    thesis: surface.thesis,
    supportLabel: surface.supportLabel,
    supportMetrics,
    audienceEvidence: surface.audienceEvidence.map((item) => ({
      commentId: item.comment_id,
      author: item.author,
      text: item.text,
      likes: item.like_count ?? null,
      comments: item.reply_count ?? null,
      reposts: item.repost_count ?? null,
      forwards: item.forward_count ?? null
    })),
    authorStance,
    alignment: surface.alignment,
    alignmentSummary: alignmentSummary(surface.alignment),
    relatedCluster: relatedSurface
      ? {
          side: relatedSurface.side,
          title: relatedSurface.title,
          supportLabel: relatedSurface.supportLabel
        }
      : null
  };
}

function buildReadiness(session: SessionRecord): CompareReadinessViewModel {
  const readyCount = session.items.filter((item) => getItemReadinessStatus(item) === "ready").length;
  const analyzingCount = session.items.filter((item) => getItemReadinessStatus(item) === "analyzing").length;
  const inflightCount = session.items.filter((item) => {
    const readiness = getItemReadinessStatus(item);
    return readiness === "queued" || readiness === "crawling";
  }).length;
  const failedCount = session.items.filter((item) => getItemReadinessStatus(item) === "failed").length;
  const pendingItem =
    session.items.find((item) => getItemReadinessStatus(item) === "analyzing")
    || session.items.find((item) => {
      const readiness = getItemReadinessStatus(item);
      return readiness === "queued" || readiness === "crawling";
    })
    || null;
  const pendingStatus = pendingItem ? getItemReadinessStatus(pendingItem) : null;
  const explanation =
    analyzingCount > 0
      ? `You have ${readyCount} ready and ${analyzingCount} near-ready. Go to Library to watch analysis finish and choose the next pair.`
      : inflightCount > 0
        ? `You have ${readyCount} ready and ${inflightCount} still in progress. Go to Library to keep preparation moving.`
        : failedCount > 0
          ? `You have ${readyCount} ready and ${failedCount} failed items. Go to Library to review the queue and pick the next pair.`
          : `You need two ready posts before Compare becomes readable. Go to Library to choose or process the next pair.`;

  return {
    readyCount,
    analyzingCount,
    inflightCount,
    failedCount,
    pendingItem: pendingItem
      ? {
          id: pendingItem.id,
          authorLabel: pendingItem.descriptor.author_hint || "pending"
        }
      : null,
    pendingStatus,
    explanation
  };
}

function buildEvidenceAnnotationRequest({
  itemA,
  itemB,
  postA,
  postB,
  leftClusterSurfaces,
  rightClusterSurfaces
}: {
  itemA: SessionItem | null;
  itemB: SessionItem | null;
  postA: PostData | null;
  postB: PostData | null;
  leftClusterSurfaces: ClusterSurface[];
  rightClusterSurfaces: ClusterSurface[];
}): EvidenceAnnotationRequest | null {
  if (!itemA || !itemB || !postA || !postB) return null;
  const topA = leftClusterSurfaces[0] || null;
  const topB = rightClusterSurfaces[0] || null;
  const quotesA = (topA?.audienceEvidence.slice(0, 2) ?? []).map((e) => ({
    commentId: e.comment_id || "",
    side: "A" as const,
    postAuthor: postA.author || "",
    postText: postA.text || "",
    clusterLabel: topA?.title || "",
    clusterObservation: topA?.thesis || "",
    quoteText: e.text || "",
    likeCount: e.like_count ?? null
  })).filter((q) => q.commentId && q.quoteText);
  const quotesB = (topB?.audienceEvidence.slice(0, 2) ?? []).map((e) => ({
    commentId: e.comment_id || "",
    side: "B" as const,
    postAuthor: postB.author || "",
    postText: postB.text || "",
    clusterLabel: topB?.title || "",
    clusterObservation: topB?.thesis || "",
    quoteText: e.text || "",
    likeCount: e.like_count ?? null
  })).filter((q) => q.commentId && q.quoteText);
  const quotes = [...quotesA, ...quotesB];
  return quotes.length ? { quotes } : null;
}

function buildBriefState({
  briefState,
  fetchedBrief,
  fallbackBrief,
  compareBriefRequest,
  leftTop,
  rightTop,
  settings
}: {
  briefState: CompareBriefSurfaceState;
  fetchedBrief: CompareBrief | null;
  fallbackBrief: CompareBrief | null;
  compareBriefRequest: CompareBriefRequest | null;
  leftTop: ClusterSurface | null;
  rightTop: ClusterSurface | null;
  settings: ExtensionSettings;
}): CompareBriefSurfaceViewModel {
  const visibleBrief = fetchedBrief ?? fallbackBrief;
  const provenance = normalizeAiOutputProvenance(visibleBrief?.source ?? "missing");
  const provenanceCopy = describeAiOutputProvenance(provenance);
  const provider = settings.oneLinerProvider;
  const currentSourceHash = compareBriefRequest && provider
    ? buildCompareBriefCacheKey(compareBriefRequest, provider, COMPARE_BRIEF_PROMPT_VERSION)
    : null;
  const derivedRecord = deriveDerivedRecordStaleness({
    record: visibleBrief ? {
      sourceHash: currentSourceHash,
      generatedAt: null,
      generatorVersion: COMPARE_BRIEF_PROMPT_VERSION
    } : null,
    currentSourceHash,
    currentGeneratorVersion: COMPARE_BRIEF_PROMPT_VERSION,
    missingProvenance: visibleBrief ? provenance === "missing" : false
  });

  return {
    state: briefState,
    loadState: briefState === "loading"
      ? "loading"
      : deriveLoadState({
          isLoading: false,
          hasData: Boolean(visibleBrief),
          hasError: false
        }),
    derivedRecord,
    provenance,
    provenanceLabel: provenanceCopy.label,
    provenanceDetail: provenanceCopy.detail,
    visibleBrief,
    fetchedBrief,
    fallbackBrief,
    request: compareBriefRequest,
    heroSummary: visibleBrief ? buildHeroSummary(visibleBrief, leftTop, rightTop) : null,
    showAlertRail: false,
    alerts: []
  };
}

function buildActions({
  sessionId,
  itemA,
  itemB,
  aiProviderConfigured,
  settings,
  briefRequest,
  clusterSummaryRequest,
  evidenceAnnotationRequest,
  fromTopicId
}: {
  sessionId: string;
  itemA: SessionItem | null;
  itemB: SessionItem | null;
  aiProviderConfigured: boolean;
  settings: ExtensionSettings;
  briefRequest: CompareBriefRequest | null;
  clusterSummaryRequest: CompareClusterSummaryRequest | null;
  evidenceAnnotationRequest: EvidenceAnnotationRequest | null;
  fromTopicId?: string;
}): CompareCommand[] {
  const commands: CompareCommand[] = [{ kind: "goToLibrary", target: { sessionId } }];
  if (fromTopicId) {
    commands.push({ kind: "returnToTopic", target: { sessionId, topicId: fromTopicId } });
  }
  if (itemA && itemB && settings.oneLinerProvider && aiProviderConfigured && getAnalysis(itemA)?.status === "succeeded" && getAnalysis(itemB)?.status === "succeeded") {
    if (briefRequest) {
      commands.push({ kind: "fetchBrief", target: { sessionId, itemAId: itemA.id, itemBId: itemB.id }, request: briefRequest });
    }
    if (clusterSummaryRequest) {
      commands.push({ kind: "fetchClusterSummaries", target: { sessionId, itemAId: itemA.id, itemBId: itemB.id }, request: clusterSummaryRequest });
    }
  }
  if (itemA && itemB && evidenceAnnotationRequest) {
    commands.push({ kind: "fetchEvidenceAnnotations", target: { sessionId, itemAId: itemA.id, itemBId: itemB.id }, request: evidenceAnnotationRequest });
  }
  return commands;
}

export function buildCompareViewModel(input: BuildCompareViewModelInput): CompareViewModel {
  const session = input.session;
  const settings = input.settings;
  const fetched = input.fetched ?? {};
  const aiProviderConfigured = hasConfiguredProviderKey(settings);
  const readyItems = session.items.filter((item) => getItemReadinessStatus(item) === "ready");
  const readyItemOptions = readyItems.map((item) => ({
    id: item.id,
    label: itemLabel(item, session.items.findIndex((candidate) => candidate.id === item.id))
  }));
  const selectionSeed = input.forcedSelection
    ? { selectedA: input.forcedSelection.itemAId, selectedB: input.forcedSelection.itemBId }
    : pickCompareSelection(session.items, input.selectedAId || "", input.selectedBId || "");
  const selectedA = selectionSeed.selectedA;
  const selectedB = selectionSeed.selectedB;
  const itemA = readyItems.find((item) => item.id === selectedA) || null;
  const itemB = readyItems.find((item) => item.id === selectedB && item.id !== selectedA) || null;
  const postA = itemA ? getPost(itemA) : null;
  const postB = itemB ? getPost(itemB) : null;
  const commentsA = itemA ? getComments(itemA) : [];
  const commentsB = itemB ? getComments(itemB) : [];
  const analysisA = itemA ? getAnalysis(itemA) : null;
  const analysisB = itemB ? getAnalysis(itemB) : null;
  const commentLookupA = buildCommentLookup(commentsA);
  const commentLookupB = buildCommentLookup(commentsB);
  const compareBriefRequest = itemA && itemB ? buildCompareBriefRequest(itemA, itemB) : null;
  const fallbackBrief = compareBriefRequest ? buildDeterministicCompareBrief(compareBriefRequest) : null;
  const clusterSummaryRequest = itemA && itemB ? buildClusterSummaryRequest(itemA, itemB) : null;
  const clusterInterpretations = new Map(
    safeArray(fetched.clusterInterpretations).map((item) => [
      clusterInterpretationKey(item.captureId, item.clusterKey),
      item
    ])
  );
  const leftClusterSummaries = buildClusterSummaries(analysisA, 5, 4, itemA?.captureId ?? "");
  const rightClusterSummaries = buildClusterSummaries(analysisB, 5, 4, itemB?.captureId ?? "");
  const leftClusterSurfaces = leftClusterSummaries.map((summary) => resolveClusterSurface(summary, "left", clusterInterpretations, commentLookupA));
  const rightClusterSurfaces = rightClusterSummaries.map((summary) => resolveClusterSurface(summary, "right", clusterInterpretations, commentLookupB));
  const evidenceAnnotationRequest = buildEvidenceAnnotationRequest({
    itemA,
    itemB,
    postA,
    postB,
    leftClusterSurfaces,
    rightClusterSurfaces
  });
  const evidenceAnnotations = safeArray(fetched.evidenceAnnotations);
  const annotationByCommentId = Object.fromEntries(evidenceAnnotations.map((annotation) => [annotation.commentId, annotation]));
  const brief = buildBriefState({
    briefState: fetched.briefState ?? "idle",
    fetchedBrief: fetched.brief ?? null,
    fallbackBrief,
    compareBriefRequest,
    leftTop: leftClusterSurfaces[0] || null,
    rightTop: rightClusterSurfaces[0] || null,
    settings
  });
  const activeResultId = input.activeResultId ?? null;

  return {
    sessionId: session.id,
    sessionName: session.name,
    compareLayout: input.compareLayout ?? "parallel",
    hideSelector: input.hideSelector ?? false,
    aiProviderConfigured,
    availability: {
      ready: readyItems.length >= 2,
      reason: readyItems.length >= 2 ? "ready" : "needs_two_ready_posts"
    },
    readiness: buildReadiness(session),
    readyItemOptions,
    selection: {
      selectedA,
      selectedB,
      itemA: itemA ? { id: itemA.id } : null,
      itemB: itemB ? { id: itemB.id } : null
    },
    postA,
    postB,
    commentsA,
    commentsB,
    analysisA,
    analysisB,
    capturedCommentCountA: itemA ? getCapturedCommentCount(itemA, commentsA) : 0,
    capturedCommentCountB: itemB ? getCapturedCommentCount(itemB, commentsB) : 0,
    ageA: postA ? getPostAge(postA) : null,
    ageB: postB ? getPostAge(postB) : null,
    brief,
    clusters: {
      summaryRequest: clusterSummaryRequest,
      summaryState: fetched.clusterSummaryState ?? "idle",
      leftSummaries: leftClusterSummaries,
      rightSummaries: rightClusterSummaries,
      leftSurfaces: leftClusterSurfaces,
      rightSurfaces: rightClusterSurfaces,
      leftNodes: layoutClusterMapNodes(leftClusterSurfaces),
      rightNodes: layoutClusterMapNodes(rightClusterSurfaces)
    },
    evidenceAnnotationRequest,
    evidenceAnnotations,
    annotationByCommentId,
    attachment: {
      fromTopicId: input.fromTopicId,
      fromTopicName: input.fromTopicName,
      activeResultId,
      topics: safeArray(input.topics),
      attachedTopicIds: safeArray(input.attachedTopicIds)
    },
    actions: buildActions({
      sessionId: session.id,
      itemA,
      itemB,
      aiProviderConfigured,
      settings,
      briefRequest: compareBriefRequest,
      clusterSummaryRequest,
      evidenceAnnotationRequest,
      fromTopicId: input.fromTopicId
    })
  };
}

export { buildClusterSummaries, getDominanceLabel };
