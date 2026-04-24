import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisSnapshot,
  CrawlResultSnapshot
} from "../contracts/ingest";
import type { ExtensionSettings, SessionItem, SessionRecord, Topic } from "../state/types";
import { getItemReadinessStatus, pickCompareSelection, type ItemReadinessStatus } from "../state/processing-state";
import { sendExtensionMessage } from "./controller";
import {
  buildDeterministicCompareBrief,
  type CompareBrief
} from "../compare/brief.ts";
import { buildCompareBriefRequest } from "../compare/brief-request.ts";
import { TOKENS, tokens } from "./tokens";
import {
  buildDeterministicClusterInterpretation,
  type CompareClusterSummaryRequest,
  clusterInterpretationKey,
  pickClusterExampleEvidence,
  type ClusterInterpretation
} from "../compare/cluster-interpretation.ts";
import { buildClusterSummaries, getDominanceLabel } from "../analysis/cluster-summary.ts";
import { buildTechniqueReadingSnapshot } from "../compare/technique-reading.ts";
import type {
  ClusterMapNode,
  ClusterSummaryCard,
  ClusterToneVariant,
  CompareHeroSummary,
  SelectedClusterDetail,
  SelectedClusterSupportMetric
} from "../analysis/types.ts";
import { EvidenceMetricRow, PrimaryButton, skeletonBlockStyle } from "./components.tsx";
import { TechniqueView } from "./TechniqueView.tsx";
import type { EvidenceAnnotation, EvidenceAnnotationRequest } from "../compare/evidence-annotation.ts";
const ACCENT_BORDER = "rgba(99,102,241,0.18)";
const QUEUED_BORDER = "rgba(217,119,6,0.18)";
const T = {
  ink: TOKENS.ink,
  sub: TOKENS.subInk,
  soft: TOKENS.softInk,
  line: TOKENS.line,
  bg: tokens.color.neutralSurface,
  accent: TOKENS.accent,
  accentSoft: TOKENS.accentSoft,
  accentBorder: ACCENT_BORDER,
  success: TOKENS.success,
  successSoft: TOKENS.successSoft,
  warn: TOKENS.queued,
  warnSoft: TOKENS.queuedSoft,
  warnBorder: QUEUED_BORDER,
  fail: TOKENS.failed,
  failSoft: TOKENS.failedSoft,
  running: TOKENS.running,
  runningSoft: TOKENS.runningSoft
} as const;

const METRIC_KEYS = ["likes", "comments", "reposts", "forwards", "views"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

interface CommentData {
  comment_id?: string;
  author?: string;
  text?: string;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  forward_count?: number;
}

interface PostData {
  author?: string;
  text?: string;
  url?: string;
  metrics?: Record<string, unknown>;
  metricPresent?: Record<MetricKey, boolean>;
  postedAt?: string | null;
  timeTokenHint?: string | null;
}

interface CompareAlert {
  type: "branch_emergence" | "temporal_shift" | "high_engagement_outlier" | "low_volume_high_like_share";
  title: string;
  detail: string;
}

interface CompareBriefSurfaceState {
  compareBriefState: "idle" | "loading" | "ready" | "fallback";
  showAlertRail: boolean;
  alerts: CompareAlert[];
}

interface CompareViewProps {
  session: SessionRecord;
  settings: ExtensionSettings;
  onGoToLibrary?: () => void;
  forcedSelection?: { itemAId: string; itemBId: string } | null;
  hideSelector?: boolean;
  fromTopicId?: string;
  fromTopicName?: string;
  onReturnToTopic?: () => void;
  topics?: Topic[];
  activeResultId?: string | null;
  attachedTopicIds?: string[];
  onAttachToTopic?: (topicId: string) => void;
}

const WRAP_ANYWHERE = {
  minWidth: 0,
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const
};

/* ── data helpers ── */

function getResult(item: SessionItem): CrawlResultSnapshot | null {
  return item.latestCapture?.result ?? null;
}

function getAnalysis(item: SessionItem): AnalysisSnapshot | null {
  return item.latestCapture?.analysis ?? null;
}

function getPost(item: SessionItem): PostData {
  const result = getResult(item);
  if (result?.canonical_post) {
    const canonical = result.canonical_post as Record<string, unknown>;
    const canonicalMetrics = (canonical.metrics as Record<string, unknown> | undefined) || {};
    const localMetrics = item.descriptor.engagement as unknown as Record<string, unknown>;
    const mergedMetrics: Record<string, unknown> = { ...localMetrics, ...canonicalMetrics };
    const metricPresent = Object.fromEntries(
      METRIC_KEYS.map((key) => {
        const canonicalValue = canonicalMetrics[key];
        const localPresent = item.descriptor.engagement_present?.[key] ?? false;
        const canonicalPresent = canonicalValue !== null && canonicalValue !== undefined && canonicalValue !== "";
        if (!canonicalPresent && localMetrics[key] !== undefined) {
          mergedMetrics[key] = localMetrics[key];
        }
        return [key, canonicalPresent || localPresent];
      })
    ) as Record<MetricKey, boolean>;

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

function getComments(item: SessionItem): CommentData[] {
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

function metricValue(post: PostData, key: MetricKey): number | null {
  const raw = post.metrics?.[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const numeric = parseFloat(raw);
    return Number.isNaN(numeric) ? null : numeric;
  }
  return null;
}

function metricCaptured(post: PostData, key: MetricKey): boolean {
  return post.metricPresent?.[key] ?? metricValue(post, key) !== null;
}

function fmtNum(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function fmtRate(value: number | null): string {
  if (value === null) return "—";
  if (value >= 100) return `${value.toFixed(0)}/h`;
  if (value >= 10) return `${value.toFixed(1)}/h`;
  return `${value.toFixed(2)}/h`;
}

function diffColor(left: number | null, right: number | null): string {
  if (left === null || right === null) return T.soft;
  if (left > right) return T.success;
  if (left < right) return T.fail;
  return T.soft;
}

function parseTimeTokenToHours(token: string | null | undefined): number | null {
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

function compactAgeLabel(hours: number): string {
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m`;
  }
  if (hours < 48) {
    return `${Math.max(1, Math.round(hours))}h`;
  }
  if (hours < 24 * 30) {
    return `${Math.max(1, Math.round(hours / 24))}d`;
  }
  if (hours < 24 * 365) {
    return `${Math.max(1, Math.round(hours / (24 * 30)))}mo`;
  }
  return `${Math.max(1, Math.round(hours / (24 * 365)))}y`;
}

function getPostAge(post: PostData): { hours: number | null; label: string } {
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

function getMetricsCoverageLabel(post: PostData): string {
  const capturedCount = METRIC_KEYS.filter((key) => metricCaptured(post, key)).length;
  if (capturedCount === 0) return "Not captured";
  if (capturedCount < METRIC_KEYS.length) return "Partial metrics only";
  return "All core metrics captured";
}

interface MetricDisplay {
  text: string;
  numeric: number | null;
  emphasized?: boolean;
}

function getRawMetricDisplay(post: PostData, key: MetricKey): MetricDisplay {
  if (!metricCaptured(post, key)) {
    return { text: "Not captured", numeric: null };
  }
  const value = metricValue(post, key);
  if (value === null) {
    return { text: "Not captured", numeric: null };
  }
  return { text: fmtNum(value), numeric: value, emphasized: true };
}

function getVelocityMetricDisplay(post: PostData, key: Exclude<MetricKey, "views">): MetricDisplay {
  if (!metricCaptured(post, key)) {
    return { text: "Not captured", numeric: null };
  }
  const value = metricValue(post, key);
  if (value === null) {
    return { text: "Not captured", numeric: null };
  }
  const age = getPostAge(post);
  if (age.hours === null) {
    return { text: "Age unknown", numeric: null };
  }
  const perHour = value / Math.max(age.hours, 1 / 60);
  return { text: fmtRate(perHour), numeric: perHour, emphasized: true };
}

function buildCommentLookup(comments: CommentData[]): Map<string, CommentData> {
  return new Map(
    comments
      .filter((comment): comment is CommentData & { comment_id: string } => Boolean(comment.comment_id))
      .map((comment) => [comment.comment_id!, comment])
  );
}

function getCapturedCommentCount(item: SessionItem, comments: CommentData[]): number {
  const sourceCommentCount = item.latestCapture?.analysis?.source_comment_count;
  if (typeof sourceCommentCount === "number" && sourceCommentCount >= 0) {
    return sourceCommentCount;
  }
  return comments.length;
}

function clusterSupportLabel(summary: ClusterSummaryCard): string {
  const sizePct = Math.round(summary.cluster.size_share * 100);
  const likePct = Math.round(summary.cluster.like_share * 100);
  const totalComments = summary.sourceCommentCount > 0 ? summary.sourceCommentCount : null;
  if (totalComments) {
    return `${summary.supportCount}/${totalComments} comments · ${sizePct}% of replies · ${likePct}% of likes`;
  }
  return `${sizePct}% of replies · ${likePct}% of likes`;
}

function surfacedEvidenceCount(summaries: readonly ClusterSummaryCard[]): number {
  return summaries.reduce((total, summary) => total + summary.evidence.length, 0);
}

function hasConfiguredProviderKey(settings: ExtensionSettings): boolean {
  const provider = settings.oneLinerProvider;
  if (provider === "google") return Boolean(settings.googleApiKey?.trim());
  if (provider === "openai") return Boolean(settings.openaiApiKey.trim());
  if (provider === "claude") return Boolean(settings.claudeApiKey.trim());
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

function analysisMetrics(analysis: AnalysisSnapshot | null) {
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

function buildClusterSummaryRequest(left: SessionItem, right: SessionItem): CompareClusterSummaryRequest | null {
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

type CompareSide = "left" | "right";
type ClusterAlignment = "Align" | "Mixed" | "Oppose";

interface ClusterSelectionRef {
  key: string;
}

interface ClusterSurface {
  key: string;
  side: CompareSide;
  summary: ClusterSummaryCard;
  title: string;
  thesis: string;
  supportLabel: string;
  audienceEvidence: CommentData[];
  alignment: ClusterAlignment;
  toneVariant: ClusterToneVariant;
}

function compareSelectionKey(captureId: string, clusterKey: number): string {
  return `${captureId}:${clusterKey}`;
}

function clipSentence(text: string | undefined, limit = 78): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "作者原文資訊不足。";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}…`;
}

function authorStanceSummary(post: PostData | null, clusterTitle: string, sideLabel: "A" | "B"): string {
  if (!post) return `Post ${sideLabel} 的作者立場資料不足。`;
  return `Post ${sideLabel} 主要圍繞「${clusterTitle}」展開，作者原文聚焦於：${clipSentence(post.text, 42)}`;
}

function alignmentSummary(alignment: ClusterAlignment): string {
  switch (alignment) {
    case "Align":
      return "目前主要回應大致順著作者原文方向延伸與放大。";
    case "Oppose":
      return "目前主要回應較常偏離原文主軸，較像逆向回應或另開戰場。";
    default:
      return "目前回應內部仍有分歧，既有順著原文延伸，也有明顯偏移。";
  }
}

function visibleClusterCountLabel(count: number): string {
  if (count <= 0) return "No significant clusters yet";
  if (count <= 1) return "Showing 1 dominant cluster";
  return `Showing ${count} most significant clusters`;
}

function hiddenClusterCountLabel(rawCount: number | null, visibleCount: number): string | null {
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

type EvidenceKeywordFilter = "all" | "A" | "B";

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

function resolveEvidenceKeywordFilter(
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

function findRelatedCluster(surface: ClusterSurface, candidates: readonly ClusterSurface[]) {
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

function inferClusterAlignment(summary: ClusterSummaryCard): ClusterAlignment {
  const { size_share: sizeShare, like_share: likeShare } = summary.cluster;
  if (sizeShare >= 0.5 && likeShare >= 0.5) return "Align";
  if (sizeShare < 0.2 || likeShare < 0.2) return "Oppose";
  return "Mixed";
}

function toneVariantForSummary(summary: ClusterSummaryCard): ClusterToneVariant {
  const alignment = inferClusterAlignment(summary);
  if (summary.supportCount <= 2 || summary.cluster.size_share < 0.18) return "minor";
  if (alignment === "Align") return "primary";
  if (alignment === "Oppose") return "cautious";
  return "supportive";
}

function resolveClusterSurface(
  summary: ClusterSummaryCard,
  side: CompareSide,
  interpretations: Map<string, ClusterInterpretation>,
  commentLookup: Map<string, CommentData>
): ClusterSurface {
  const interpretation = interpretations.get(clusterInterpretationKey(summary.captureId, summary.cluster.cluster_key)) ?? null;
  const fallback = buildDeterministicClusterInterpretation(summary.cluster);
  const title = interpretation?.label || fallback.label || "低訊號群組";
  const thesis = interpretation?.oneLiner || fallback.oneLiner || "這個群組目前只有有限線索，仍需回看代表留言。";
  const audienceEvidence = pickClusterExampleEvidence(summary.evidence, interpretation?.evidenceIds, 4)
    .map((comment) => mergeEvidenceDetails(comment, commentLookup));

  return {
    key: compareSelectionKey(summary.captureId, summary.cluster.cluster_key),
    side,
    summary,
    title,
    thesis,
    supportLabel: clusterSupportLabel(summary),
    audienceEvidence,
    alignment: inferClusterAlignment(summary),
    toneVariant: toneVariantForSummary(summary)
  };
}

function bubbleRadius(sizeShare: number): number {
  return Math.max(24, Math.min(58, 22 + sizeShare * 68));
}

function layoutClusterMapNodes(surfaces: readonly ClusterSurface[]): ClusterMapNode[] {
  const anchorsByCount: Record<number, Array<{ x: number; y: number; scale?: number }>> = {
    1: [{ x: 50, y: 50, scale: 1.45 }],
    2: [{ x: 34, y: 48, scale: 1.15 }, { x: 68, y: 44, scale: 1.08 }],
    3: [{ x: 28, y: 38, scale: 1.08 }, { x: 68, y: 34, scale: 1.04 }, { x: 48, y: 68, scale: 1 }],
    4: [{ x: 28, y: 34 }, { x: 66, y: 28 }, { x: 70, y: 64 }, { x: 30, y: 68 }],
    5: [{ x: 24, y: 28 }, { x: 60, y: 22 }, { x: 74, y: 54 }, { x: 40, y: 66 }, { x: 18, y: 64 }]
  };
  const anchors = anchorsByCount[Math.min(Math.max(surfaces.length, 1), 5)] || anchorsByCount[5];

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

function buildHeroSummary(
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

function compactHeroHeadline(value: string): string {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const reactionMatch = trimmed.match(/A(?:\s*的受眾)?以?([^，；。]+?)回應[，,]?\s*B(?:\s*的受眾)?以?([^，；。]+?)回應/);
  if (reactionMatch) {
    const left = reactionMatch[1]?.replace(/為主|偏向|主要|型$/, "").trim();
    const right = reactionMatch[2]?.replace(/為主|偏向|主要|型$/, "").trim();
    return `A ${left} · B ${right}`;
  }
  const compact = trimmed.split(/[；;。!?！？]/).map((part) => part.trim()).find(Boolean) || trimmed;
  return compact.length > 34 ? `${compact.slice(0, 33).trim()}…` : compact;
}

function compactHeroCue(value: string): string {
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
  return matched.length > 28 ? `${matched.slice(0, 27).trim()}…` : matched;
}

function divergenceDirection(detail: SelectedClusterDetail, sideLabel: "A" | "B"): string {
  return `Post ${sideLabel} 較靠近「${detail.clusterTitle}」：${detail.alignmentSummary}`;
}

function selectedClusterDetailFromSurface(
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

/* ── readiness helpers ── */

function statusTone(status: ItemReadinessStatus) {
  switch (status) {
    case "ready": return { color: T.success, background: T.successSoft };
    case "analyzing": return { color: T.running, background: T.runningSoft };
    case "crawling": case "queued": return { color: T.warn, background: T.warnSoft };
    case "failed": return { color: T.fail, background: T.failSoft };
    default: return { color: T.sub, background: T.bg };
  }
}

function statusLabel(status: ItemReadinessStatus): string {
  switch (status) {
    case "saved": return "Saved";
    case "queued": return "Queued";
    case "crawling": return "Crawling";
    case "analyzing": return "Analyzing";
    case "ready": return "Ready";
    case "failed": return "Failed";
    default: return status;
  }
}

function elapsedAnchor(item: SessionItem, status: ItemReadinessStatus): string | null {
  if (status === "crawling") return item.latestJob?.started_at || item.queuedAt;
  if (status === "analyzing") return item.completedAt || item.latestJob?.finished_at || item.latestCapture?.updated_at || null;
  return item.lastStatusAt;
}

function formatElapsed(isoTime: string | null): string {
  if (!isoTime) return "just now";
  const diffMs = Date.now() - new Date(isoTime).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function itemLabel(item: SessionItem, index: number): string {
  return `#${index + 1} ${item.descriptor.author_hint || "Unknown"}`;
}

/* ── Section label ── */

function SectionLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontSize: 12,
      fontWeight: 600,
      color: color || T.soft,
      letterSpacing: "0.02em",
      lineHeight: 1.4
    }}>
      {children}
    </div>
  );
}

/* ── Compact Post Header (replaces old PostCard) ── */

function PostHeader({ post, label, color, borderColor, commentCount }: {
  post: PostData;
  label: string;
  color: string;
  borderColor: string;
  commentCount: number;
}) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: color, border: `1.5px solid ${borderColor}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 6, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.soft, letterSpacing: "0.02em", lineHeight: 1.4 }}>{label}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginLeft: 8, ...WRAP_ANYWHERE }}>@{post.author || "unknown"}</span>
        </div>
        <span style={{ fontSize: 11, color: T.soft, whiteSpace: "nowrap" as const }}>{getPostAge(post).label}</span>
      </div>
      <div style={{
        fontSize: 12, color: T.sub, lineHeight: 1.55,
        display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden"
      }}>
        {post.text || "No text available"}
      </div>
      <div style={{ fontSize: 11, color: T.soft, marginTop: 6 }}>
        {commentCount > 0 ? `${commentCount} comments captured` : "No comments captured"}
      </div>
    </div>
  );
}

/* ── Post context strip (what are these two posts about) ── */

function PostContextCard({
  post,
  side,
  captured,
  age
}: {
  post: PostData | null;
  side: "A" | "B";
  captured: number;
  age: string | null;
}) {
  const isA = side === "A";
  const accentColor = isA ? T.accent : T.warn;
  const softBg = isA ? T.accentSoft : T.warnSoft;
  const border = isA ? T.accentBorder : T.warnBorder;
  const totalComments = post?.metrics && typeof post.metrics["comments"] === "number"
    ? (post.metrics["comments"] as number)
    : null;
  const commentLabel = totalComments != null
    ? `${totalComments} comments`
    : captured > 0
      ? `${captured} captured`
      : null;

  return (
    <div style={{ padding: "10px 12px", borderRadius: tokens.radius.card, border: `1px solid ${border}`, background: softBg, display: "grid", gap: 5, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" as const, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: accentColor, whiteSpace: "nowrap" as const }}>{`Post ${side}`}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, ...WRAP_ANYWHERE }}>{`@${post?.author || "unknown"}`}</span>
      </div>
      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden", minWidth: 0 }}>
        {post?.text || "—"}
      </div>
      <div style={{ fontSize: 10, color: T.soft, display: "flex", gap: 4, flexWrap: "wrap" as const }}>
        {commentLabel ? <span>{commentLabel}</span> : null}
        {commentLabel && age ? <span>·</span> : null}
        {age ? <span>{age}</span> : null}
      </div>
    </div>
  );
}

function PostContextStrip({
  postA,
  postB,
  capturedA,
  capturedB,
  ageA,
  ageB
}: {
  postA: PostData | null;
  postB: PostData | null;
  capturedA: number;
  capturedB: number;
  ageA: string | null;
  ageB: string | null;
}) {
  if (!postA && !postB) return null;
  return (
    <div data-post-context-strip="visible" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <PostContextCard post={postA} side="A" captured={capturedA} age={ageA} />
      <PostContextCard post={postB} side="B" captured={capturedB} age={ageB} />
    </div>
  );
}

/* ── Engagement metric row with delta ── */

function MetricRow({ label, left, right }: { label: string; left: MetricDisplay; right: MetricDisplay }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 4, padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "capitalize" as const, minWidth: 0 }}>{label}</span>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: left.emphasized ? 800 : 700, color: left.emphasized ? diffColor(left.numeric, right.numeric) : T.soft }}>
          {left.text}
        </span>
      </div>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: right.emphasized ? 800 : 700, color: right.emphasized ? diffColor(right.numeric, left.numeric) : T.soft }}>
          {right.text}
        </span>
      </div>
    </div>
  );
}

/* ── Audience navigator ── */

function bubbleTone(node: ClusterMapNode, side: CompareSide) {
  // Single indigo scale for Post A, single amber scale for Post B.
  // Tone steps: primary > supportive > cautious > minor (near-neutral).
  const palette = side === "left"
    ? {
        primary:    { fill: "rgba(79,70,229,0.14)",  border: "rgba(79,70,229,0.50)",  text: "#4f46e5" },
        supportive: { fill: "rgba(99,102,241,0.09)", border: "rgba(99,102,241,0.34)", text: "#6366f1" },
        cautious:   { fill: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.22)", text: "#818cf8" },
        minor:      { fill: "rgba(15,23,42,0.04)",   border: T.line,                  text: T.soft }
      }
    : {
        primary:    { fill: "rgba(217,119,6,0.13)",  border: "rgba(217,119,6,0.48)",  text: "#d97706" },
        supportive: { fill: "rgba(245,158,11,0.09)", border: "rgba(245,158,11,0.34)", text: "#b45309" },
        cautious:   { fill: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.22)", text: "#ca8a04" },
        minor:      { fill: "rgba(15,23,42,0.04)",   border: T.line,                  text: T.soft }
      };
  if (node.toneVariant === "minor") {
    return {
      background: palette.minor.fill,
      border: `1px dashed ${palette.minor.border}`,
      color: palette.minor.text,
      glow: "none"
    };
  }
  const tone = node.toneVariant === "cautious"
    ? palette.cautious
    : node.toneVariant === "supportive"
      ? palette.supportive
      : palette.primary;
  return {
    background: tone.fill,
    border: `1px solid ${tone.border}`,
    color: tone.text,
    glow: `0 8px 20px ${tone.border}40`
  };
}

function clusterNavigatorLabel(node: ClusterMapNode): string {
  return `${node.title} · ${Math.round(node.sizeShare * 100)}%`;
}

function ClusterBubbleMap({
  side,
  label,
  nodes,
  countLabel,
  hiddenLabel,
  selectedKey,
  hoveredKey,
  onHover,
  onLeave,
  onSelect
}: {
  side: CompareSide;
  label: string;
  nodes: ClusterMapNode[];
  countLabel: string;
  hiddenLabel: string | null;
  selectedKey: string | null;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onLeave: () => void;
  onSelect: (key: string) => void;
}) {
  const previewNode = nodes.find((node) => compareSelectionKey(node.captureId, node.clusterKey) === hoveredKey) || null;
  const previewLeft = previewNode
    ? Math.min(212, Math.max(8, previewNode.x))
    : 0;
  const previewTop = previewNode
    ? Math.max(8, previewNode.y - previewNode.r / 2 - 30)
    : 0;

  return (
    <div
      data-cluster-map={side}
      style={{
        position: "relative",
        minHeight: 280,
        borderRadius: 12,
        border: `1px solid ${T.line}`,
        background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.92))",
        boxShadow: tokens.shadow.glass,
        overflow: "hidden"
      }}
    >
      <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel color={side === "left" ? T.accent : T.warn}>{label}</SectionLabel>
        <div style={{ fontSize: 11, color: T.soft, ...WRAP_ANYWHERE }}>{countLabel}</div>
      </div>
      {hiddenLabel ? (
        <div style={{ padding: "0 14px 8px", fontSize: 10, color: T.soft, ...WRAP_ANYWHERE }}>{hiddenLabel}</div>
      ) : null}
      <div style={{ position: "relative", height: 228, margin: "0 10px 10px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,252,0.72))" }}>
        {nodes.map((node) => {
          const key = compareSelectionKey(node.captureId, node.clusterKey);
          const selected = selectedKey === key;
          const tone = bubbleTone(node, side);
          return (
            <button
              key={key}
              type="button"
              data-cluster-node={key}
              data-cluster-selected={selected ? "true" : "false"}
              onMouseEnter={() => onHover(key)}
              onMouseLeave={onLeave}
              onClick={() => onSelect(key)}
              title={`${clusterNavigatorLabel(node)} · ${node.supportCount} comments`}
              style={{
                position: "absolute",
                left: `calc(${node.x}% - ${node.r / 2}px)`,
                top: `calc(${node.y}% - ${node.r / 2}px)`,
                width: node.r,
                height: node.r,
                borderRadius: "50%",
                border: tone.border,
                background: tone.background,
                color: tone.color,
                boxShadow: selected ? `0 0 0 3px ${side === "left" ? T.accentSoft : T.warnSoft}, ${tone.glow}` : tone.glow,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                transition: tokens.motion.transition
              }}
            >
              <span style={{ fontSize: node.r > 52 ? 12 : 10, fontWeight: 800 }}>{Math.round(node.sizeShare * 100)}%</span>
            </button>
          );
        })}
        {previewNode ? (
          <div
            data-cluster-preview="visible"
            style={{
              position: "absolute",
              left: `min(calc(${previewLeft}% - 72px), calc(100% - 184px))`,
              top: `max(8px, calc(${previewTop}% - 12px))`,
              minWidth: 144,
              maxWidth: 176,
              borderRadius: tokens.radius.card,
              background: tokens.color.elevated,
              border: `1px solid ${T.line}`,
              boxShadow: tokens.shadow.glass,
              padding: "8px 10px",
              zIndex: 2
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: T.ink, ...WRAP_ANYWHERE }}>{clusterNavigatorLabel(previewNode)}</div>
            <div style={{ marginTop: 4, fontSize: 10, color: T.sub, ...WRAP_ANYWHERE }}>
              {previewNode.supportCount} comments
            </div>
          </div>
        ) : (
          <div data-cluster-preview="hidden" />
        )}
      </div>
    </div>
  );
}

function supportMetricIcon(kind: SelectedClusterSupportMetric["kind"]): string {
  switch (kind) {
    case "captured": return "◫";
    case "comments": return "◌";
    case "replies": return "↺";
    case "likes": return "♥";
  }
}

function evidencePreview(text: string | undefined): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "No audience evidence text captured.";
  return value.length > 70 ? `${value.slice(0, 70).trimEnd()}…` : value;
}

function EvidenceFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: T.soft,
        letterSpacing: "0.06em",
        lineHeight: 1.4
      }}
    >
      {children}
    </span>
  );
}

function EvidenceFieldRow({
  label,
  children,
  borderTop = true
}: {
  label: string;
  children: React.ReactNode;
  borderTop?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px minmax(0, 1fr)",
        gap: 10,
        alignItems: "start",
        paddingTop: borderTop ? 8 : 0,
        borderTop: borderTop ? `1px solid ${T.line}` : "none",
        minWidth: 0
      }}
    >
      <EvidenceFieldLabel>{label}</EvidenceFieldLabel>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function CompareSelectorStrip({
  readyItems,
  session,
  selectedA,
  selectedB,
  onChangeA,
  onChangeB
}: {
  readyItems: SessionItem[];
  session: SessionRecord;
  selectedA: string;
  selectedB: string;
  onChangeA: (value: string) => void;
  onChangeB: (value: string) => void;
}) {
  const selectStyle = (side: "A" | "B") =>
    ({
      borderRadius: 999,
      border: `1px solid ${side === "A" ? T.accentBorder : T.warnBorder}`,
      padding: "8px 10px",
      fontSize: 12,
      fontWeight: 700,
      background: side === "A" ? T.accentSoft : T.warnSoft,
      minWidth: 0,
      boxSizing: "border-box"
    }) satisfies React.CSSProperties;

  return (
    <div
      data-compare-selector-strip="compact"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 28px 1fr",
        gap: 8,
        alignItems: "center"
      }}
    >
      <select value={selectedA} onChange={(e) => onChangeA(e.target.value)} style={selectStyle("A")}>
        {readyItems.filter((item) => item.id !== selectedB).map((item) => (
          <option key={item.id} value={item.id}>
            {itemLabel(item, session.items.findIndex((candidate) => candidate.id === item.id))}
          </option>
        ))}
      </select>
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: T.soft }}>vs</div>
      <select value={selectedB} onChange={(e) => onChangeB(e.target.value)} style={selectStyle("B")}>
        {readyItems.filter((item) => item.id !== selectedA).map((item) => (
          <option key={item.id} value={item.id}>
            {itemLabel(item, session.items.findIndex((candidate) => candidate.id === item.id))}
          </option>
        ))}
      </select>
    </div>
  );
}

function EvidenceReasonRow({
  sideLabel,
  detail,
  evidence,
  annotationMap
}: {
  sideLabel: "A" | "B";
  detail: SelectedClusterDetail;
  evidence: SelectedClusterDetail["audienceEvidence"][number];
  annotationMap: Map<string, EvidenceAnnotation>;
}) {
  const annotation = evidence.commentId ? annotationMap.get(evidence.commentId) : undefined;
  const emptyState = "（尚未個別分析此留言）";

  return (
    <div
      data-primary-evidence={`post-${sideLabel.toLowerCase()}`}
      style={{
        display: "grid",
        gridTemplateColumns: "84px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        padding: "12px 0",
        borderTop: `1px solid ${T.line}`,
        minWidth: 0
      }}
    >
      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "fit-content",
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            color: sideLabel === "A" ? T.accent : T.warn,
            background: sideLabel === "A" ? T.accentSoft : T.warnSoft,
            border: `1px solid ${sideLabel === "A" ? T.accentBorder : T.warnBorder}`
          }}
        >
          {`Post ${sideLabel}`}
        </span>
        <div style={{ fontSize: 10, color: T.soft, lineHeight: 1.5, ...WRAP_ANYWHERE }}>
          {detail.clusterTitle}
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        <blockquote
          style={{
            margin: 0,
            paddingLeft: 12,
            borderLeft: `3px solid ${sideLabel === "A" ? T.accentBorder : T.warnBorder}`,
            fontSize: 13,
            lineHeight: 1.65,
            color: T.ink
          }}
        >
          {evidence.text || "No audience evidence text captured."}
        </blockquote>
        <div style={{ display: "grid", gap: 8 }}>
          <EvidenceFieldRow label="Author" borderTop={false}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, ...WRAP_ANYWHERE }}>
              @{evidence.author || "anon"}
            </span>
          </EvidenceFieldRow>
          <EvidenceFieldRow label="Why matters">
            <span style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, ...WRAP_ANYWHERE }}>
              {annotation?.writerMeaning || emptyState}
            </span>
          </EvidenceFieldRow>
          <EvidenceFieldRow label="Relation">
            <span style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, ...WRAP_ANYWHERE }}>
              {annotation?.whyEffective || emptyState}
            </span>
          </EvidenceFieldRow>
        </div>
        <div style={{ paddingTop: 2 }}>
          <EvidenceMetricRow
            metrics={{
              likes: evidence.likes,
              comments: evidence.comments,
              reposts: evidence.reposts,
              forwards: evidence.forwards
            }}
          />
        </div>
      </div>
    </div>
  );
}


function CompareJudgmentSheet({
  heroSummary,
  briefKeywords,
  detailA,
  detailB,
  aDirection,
  bDirection,
  compareBriefState,
  aiProviderConfigured,
  showAlertRail,
  annotationMap,
  onOpenTechnique
}: {
  heroSummary: CompareHeroSummary | null;
  briefKeywords: string[];
  detailA: SelectedClusterDetail | null;
  detailB: SelectedClusterDetail | null;
  aDirection: string | null;
  bDirection: string | null;
  compareBriefState: CompareBriefSurfaceState["compareBriefState"];
  aiProviderConfigured: boolean;
  showAlertRail: boolean;
  annotationMap: Map<string, EvidenceAnnotation>;
  onOpenTechnique: (side: "A" | "B") => void;
}) {
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [focusedKeyword, setFocusedKeyword] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const evidenceA = detailA?.audienceEvidence[0] || null;
  const evidenceB = detailB?.audienceEvidence[0] || null;
  const showTechnique = Boolean((detailA && evidenceA) || (detailB && evidenceB));
  const evidenceFilter = resolveEvidenceKeywordFilter(focusedKeyword, detailA, detailB, aDirection, bDirection);

  return (
    <div
      data-compare-analysis="sheet"
      data-alert-rail={showAlertRail ? "visible" : "hidden"}
      style={{
        display: "grid",
        gap: 18,
        padding: "18px 16px 16px",
        borderRadius: tokens.radius.lg,
        border: `1px solid ${T.line}`,
        background: `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`,
        boxShadow: tokens.shadow.glass,
        overflow: "hidden"
      }}
    >
      {heroSummary ? (
        <div
          id="dlens-section-brief"
          data-compare-hero="summary"
          data-compare-brief-state={compareBriefState}
          style={{ display: "grid", gap: 10 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, lineHeight: 1.35 }}>
                {heroSummary.headline}
              </div>
              <div
                data-compare-implication="cue"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  justifySelf: "start",
                  padding: "5px 9px",
                  borderRadius: tokens.radius.pill,
                  background: tokens.color.neutralSurfaceSoft,
                  border: `1px solid ${T.line}`,
                  fontSize: 11,
                  color: T.sub,
                  lineHeight: 1.45,
                  maxWidth: "100%"
                }}
              >
                <span style={{ fontWeight: 700, color: T.soft, whiteSpace: "nowrap" }}>創作提示</span>
                <span style={WRAP_ANYWHERE}>{heroSummary.cue}</span>
              </div>
              <div data-compare-keywords="visible" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {briefKeywords.slice(0, 5).map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    data-keyword-pill-style="ghost"
                    onClick={() => {
                      setFocusedKeyword((current) => current === keyword ? null : keyword);
                      setBriefExpanded(true);
                    }}
                    aria-pressed={focusedKeyword === keyword}
                    style={{
                      border: `1px solid ${focusedKeyword === keyword ? T.accentBorder : T.line}`,
                      borderRadius: tokens.radius.pill,
                      background: focusedKeyword === keyword ? "rgba(79,70,229,0.06)" : "transparent",
                      color: focusedKeyword === keyword ? T.accent : T.sub,
                      padding: "4px 8px",
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: compareBriefState === "ready" ? T.success : compareBriefState === "loading" ? T.running : T.warn, whiteSpace: "nowrap" }}>
              {compareBriefState === "ready"
                ? "AI brief ready"
                : compareBriefState === "loading"
                  ? "Updating with AI..."
                  : aiProviderConfigured
                    ? "Deterministic fallback"
                    : "Local fallback"}
            </div>
          </div>

          <div data-author-stance-row="badge-row" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {([
              { label: "Post A", alignment: heroSummary.audienceAlignmentLeft, tone: T.accentSoft },
              { label: "Post B", alignment: heroSummary.audienceAlignmentRight, tone: T.warnSoft }
            ] as const).map((item) => (
              <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, padding: "7px 10px", borderRadius: tokens.radius.pill, background: item.tone, border: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: T.soft, letterSpacing: "0.03em", flexShrink: 0 }}>{item.label}</span>
                <span
                  title="Derived from visible cluster breadth and engagement concentration. This is a readable proxy, not a hard classifier."
                  data-alignment-badge-style="filled"
                  style={{ display: "inline-flex", alignItems: "center", padding: "3px 7px", borderRadius: tokens.radius.pill, fontSize: 10, fontWeight: 800, color: item.alignment.badge === "Align" ? T.success : item.alignment.badge === "Oppose" ? T.fail : T.warn, background: item.alignment.badge === "Align" ? T.successSoft : item.alignment.badge === "Oppose" ? T.failSoft : T.warnSoft, flexShrink: 0 }}
                >
                  {item.alignment.badge}
                </span>
              </div>
            ))}
          </div>

          <div data-compare-brief-body={briefExpanded ? "expanded" : "collapsed"} style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              onClick={() => setBriefExpanded((value) => !value)}
              style={{
                justifySelf: "start",
                border: `1px solid ${T.line}`,
                borderRadius: tokens.radius.pill,
                background: tokens.color.neutralSurfaceSoft,
                color: T.sub,
                padding: "5px 9px",
                fontSize: 10,
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              {briefExpanded ? "Hide full brief" : "Expand full brief"}
            </button>

            {briefExpanded ? (
              <div style={{ display: "grid", gap: 10 }}>
                {heroSummary.whyItMatters ? (
                  <div
                    data-compare-why-it-matters="visible"
                    style={{
                      borderLeft: `3px solid ${focusedKeyword ? T.accentSoft : T.line}`,
                      paddingLeft: 12,
                      fontSize: 12,
                      color: T.sub,
                      lineHeight: 1.6,
                      ...WRAP_ANYWHERE
                    }}
                  >
                    {heroSummary.whyItMatters}
                  </div>
                ) : null}
                <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
                  {detailA ? (
                    <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12 }}>
                      <SectionLabel color={T.accent}>A</SectionLabel>
                      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{aDirection || divergenceDirection(detailA, "A")}</div>
                    </div>
                  ) : null}
                  {detailB ? (
                    <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12 }}>
                      <SectionLabel color={T.warn}>B</SectionLabel>
                      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{bDirection || divergenceDirection(detailB, "B")}</div>
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>
                    {heroSummary.creatorCue}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        <SectionLabel color={T.ink}>Receipts</SectionLabel>
        <div
          data-compare-evidence-ledger="stacked"
          data-evidence-filter={evidenceFilter.toLowerCase()}
          style={{
            display: "grid",
            gap: 0
          }}
        >
          {detailA && evidenceA && evidenceFilter !== "B" ? <EvidenceReasonRow sideLabel="A" detail={detailA} evidence={evidenceA} annotationMap={annotationMap} /> : null}
          {detailB && evidenceB && evidenceFilter !== "A" ? <EvidenceReasonRow sideLabel="B" detail={detailB} evidence={evidenceB} annotationMap={annotationMap} /> : null}
        </div>
      </div>

      {showTechnique ? (
        <div data-technique-gate="conditional" style={{ display: "grid", gap: 8, marginTop: 20 }}>
          <SectionLabel color={T.ink}>Technique</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {detailA && evidenceA ? (
              <button
                type="button"
                onClick={() => onOpenTechnique("A")}
                style={{ borderRadius: tokens.radius.pill, border: `1px solid ${T.accentBorder}`, background: T.accentSoft, padding: "7px 11px", fontSize: 11, fontWeight: 700, color: T.accent, cursor: "pointer" }}
              >
                Open Post A reading
              </button>
            ) : null}
            {detailB && evidenceB ? (
              <button
                type="button"
                onClick={() => onOpenTechnique("B")}
                style={{ borderRadius: tokens.radius.pill, border: `1px solid ${T.warnBorder}`, background: T.warnSoft, padding: "7px 11px", fontSize: 11, fontWeight: 700, color: T.warn, cursor: "pointer" }}
              >
                Open Post B reading
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        <SectionLabel color={T.ink}>A/B divergence</SectionLabel>
        <div
          data-compare-divergence="visible"
          style={{
            display: "grid",
            gap: 0
          }}
        >
          {detailA ? (
            <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12, alignItems: "start", padding: "12px 0" }}>
              <SectionLabel color={T.accent}>A</SectionLabel>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{aDirection || divergenceDirection(detailA, "A")}</div>
            </div>
          ) : null}
          {detailB ? (
            <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12, alignItems: "start", padding: "12px 0", borderTop: `1px solid ${T.line}` }}>
              <SectionLabel color={T.warn}>B</SectionLabel>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{bDirection || divergenceDirection(detailB, "B")}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
        <button
          type="button"
          onClick={() => setExportMessage("Developing")}
          style={{
            borderRadius: tokens.radius.pill,
            border: `1px solid ${T.line}`,
            background: tokens.color.neutralSurfaceSoft,
            color: T.sub,
            padding: "7px 11px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Export full report
        </button>
        <span style={{ fontSize: 10, color: T.soft }}>
          {exportMessage || "Developing"}
        </span>
      </div>
    </div>
  );
}

function AudienceDetailPanel({
  detail,
  sideLabel,
  expandedEvidenceKeys,
  onToggleEvidence,
  onOpenTechnique,
  detailRef,
  highlighted
}: {
  detail: SelectedClusterDetail | null;
  sideLabel: "A" | "B" | null;
  expandedEvidenceKeys: Set<string>;
  onToggleEvidence: (key: string) => void;
  onOpenTechnique?: (() => void) | null;
  detailRef?: React.RefObject<HTMLDivElement | null>;
  highlighted?: boolean;
}) {
  if (!detail || !sideLabel) {
    return (
      <div data-cluster-detail="empty" style={{ padding: "18px 16px", borderRadius: 12, border: `1px solid ${T.line}`, background: tokens.color.elevated, boxShadow: tokens.shadow.glass }}>
        <SectionLabel>Select a cluster</SectionLabel>
        <div style={{ marginTop: 6, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>
          Hover 只做預覽；點擊 bubble 才會鎖定這個群組，先看 audience evidence，再看作者摘要與對側相近群組。
        </div>
      </div>
    );
  }

  return (
    <div
      ref={detailRef}
      id={`dlens-selected-cluster-${sideLabel.toLowerCase()}`}
      data-cluster-detail="selected"
      data-jump-highlight={highlighted ? "true" : "false"}
      style={{
        padding: "16px 16px 14px",
        borderRadius: 12,
        border: highlighted ? `1.5px solid ${sideLabel === "A" ? T.accentBorder : T.warnBorder}` : `1px solid ${T.line}`,
        background: tokens.color.elevated,
        boxShadow: highlighted
          ? `0 0 0 3px ${sideLabel === "A" ? T.accentSoft : T.warnSoft}, ${tokens.shadow.glass}`
          : tokens.shadow.glass,
        display: "grid",
        gap: 12,
        transition: tokens.motion.interactiveTransition
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ ...WRAP_ANYWHERE }}>
          <SectionLabel>{`Selected Cluster · Post ${sideLabel}`}</SectionLabel>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: T.ink, ...WRAP_ANYWHERE }}>{detail.clusterTitle}</div>
          <div style={{ marginTop: 5, fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{detail.thesis}</div>
        </div>
        {onOpenTechnique ? (
          <div>
            <button
              type="button"
              onClick={onOpenTechnique}
              style={{
                borderRadius: 999,
                border: `1px solid ${T.line}`,
                background: tokens.color.neutralSurfaceSoft,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                color: T.accent,
                cursor: "pointer"
              }}
            >
              Deeper reading →
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <SectionLabel>Audience evidence</SectionLabel>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <TopEvidenceStrip sideLabel={sideLabel} detail={detail} onJump={() => detailRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          {detail.audienceEvidence.length > 1 ? detail.audienceEvidence.slice(1, 4).map((evidence, index) => (
            (() => {
              const evidenceKey = `${sideLabel}:${evidence.commentId || index + 1}`;
              const expanded = expandedEvidenceKeys.has(evidenceKey);
              return (
                <button
                  key={evidence.commentId || index}
                  type="button"
                  onClick={() => onToggleEvidence(evidenceKey)}
                  data-evidence-card-layout="field-rows"
                  style={{
                    borderRadius: 12,
                    background: tokens.color.neutralSurfaceSoft,
                    border: `1px solid ${T.line}`,
                    padding: "11px 12px",
                    display: "grid",
                    gap: 8,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: tokens.motion.interactiveTransition
                  }}
                >
                  <EvidenceFieldRow label="Author" borderTop={false}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, ...WRAP_ANYWHERE }}>@{evidence.author || "anon"}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: T.soft, ...WRAP_ANYWHERE }}>{evidence.commentId || "evidence"}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>{expanded ? "Hide evidence" : "Show evidence"}</span>
                      </span>
                    </div>
                  </EvidenceFieldRow>
                  <EvidenceFieldRow label="Excerpt">
                    <span style={{ fontSize: 12, lineHeight: 1.55, color: T.ink, ...WRAP_ANYWHERE }}>
                      {expanded ? (evidence.text || "No audience evidence text captured.") : evidencePreview(evidence.text)}
                    </span>
                  </EvidenceFieldRow>
                  <div style={{ paddingTop: 6, borderTop: `1px solid ${T.line}` }}>
                    <EvidenceMetricRow
                      metrics={{
                        likes: evidence.likes,
                        comments: evidence.comments,
                        reposts: evidence.reposts,
                        forwards: evidence.forwards
                      }}
                    />
                  </div>
                </button>
              );
            })()
          )) : (
            detail.audienceEvidence.length === 0 ? (
              <div style={{ fontSize: 12, color: T.soft }}>Low-signal cluster. Not enough audience evidence yet.</div>
            ) : null
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {detail.supportMetrics.map((metric) => (
          <span
            key={`${metric.kind}:${metric.value}`}
            style={{
              fontSize: 11,
              color: T.sub,
              background: tokens.color.neutralSurfaceSoft,
              border: `1px solid ${T.line}`,
              borderRadius: 999,
              padding: "5px 9px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              ...WRAP_ANYWHERE
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: metric.kind === "likes" ? T.fail : metric.kind === "replies" ? T.accent : T.soft }}>
              {supportMetricIcon(metric.kind)}
            </span>
            <span style={{ fontWeight: 700, color: T.ink }}>{metric.value}</span>
            <span style={{ color: T.soft }}>{metric.label}</span>
          </span>
        ))}
      </div>

      {/* Compact meta strip — author stance · alignment · related cluster */}
      <div style={{ borderRadius: 8, border: `1px solid ${T.line}`, background: tokens.color.neutralSurfaceSoft, overflow: "hidden" }}>
        {/* Row 1: alignment badge + stance excerpt */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
          <span
            title="Derived from visible cluster breadth and engagement concentration. This is a readable proxy, not a hard classifier."
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 7px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              color: detail.alignment === "Align" ? T.success : detail.alignment === "Oppose" ? T.fail : T.warn,
              background: detail.alignment === "Align" ? T.successSoft : detail.alignment === "Oppose" ? T.failSoft : T.warnSoft
            }}
          >
            {detail.alignment}
          </span>
          <span style={{ fontSize: 11, color: T.sub, lineHeight: 1.5, ...WRAP_ANYWHERE }}>{detail.authorStance}</span>
        </div>
        {/* Divider */}
        <div style={{ height: 1, background: T.line }} />
        {/* Row 2: related cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.soft, letterSpacing: "0.02em", flexShrink: 0 }}>
            {`Post ${sideLabel === "A" ? "B" : "A"}`}
          </span>
          {detail.relatedCluster ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, ...WRAP_ANYWHERE }}>{detail.relatedCluster.title}</span>
              <span style={{ fontSize: 10, color: T.soft, flexShrink: 0 }}>· {detail.relatedCluster.supportLabel}</span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: T.soft }}>No clear related cluster</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CompareSectionRail({
  onScrollClusters,
  onScrollEngagement,
  onScrollComments
}: {
  onScrollClusters: () => void;
  onScrollEngagement: () => void;
  onScrollComments: () => void;
}) {
  const buttonStyle = {
    border: `1px solid ${T.line}`,
    borderRadius: 999,
    background: tokens.color.neutralSurfaceSoft,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 700,
    color: T.sub,
    cursor: "pointer"
  } satisfies React.CSSProperties;

  return (
    <div
      data-compare-section-rail="sticky"
      style={{
        position: "sticky",
        top: 8,
        zIndex: 3,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        padding: "10px 12px",
        borderRadius: 999,
        border: `1px solid ${T.line}`,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.glass,
        backdropFilter: "blur(8px)"
      }}
    >
      <button type="button" onClick={onScrollClusters} style={buttonStyle}>Clusters</button>
      <button type="button" onClick={onScrollEngagement} style={buttonStyle}>Engagement</button>
      <button type="button" onClick={onScrollComments} style={buttonStyle}>Comments</button>
    </div>
  );
}

function TopEvidenceStrip({
  sideLabel,
  detail,
  onJump
}: {
  sideLabel: "A" | "B";
  detail: SelectedClusterDetail | null;
  onJump: () => void;
}) {
  const evidence = detail?.audienceEvidence[0] || null;
  if (!detail || !evidence) return null;

  return (
    <button
      type="button"
      onClick={onJump}
      data-top-evidence={`post-${sideLabel.toLowerCase()}`}
      data-top-evidence-section="visible"
      data-evidence-card-layout="field-rows"
      style={{
        borderRadius: 12,
        border: `1px solid ${T.line}`,
        background: tokens.color.neutralSurfaceSoft,
        padding: "12px 13px",
        display: "grid",
        gap: 8,
        textAlign: "left",
        cursor: "pointer",
        transition: tokens.motion.interactiveTransition
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <SectionLabel color={sideLabel === "A" ? T.accent : T.warn}>{`Top evidence · Post ${sideLabel}`}</SectionLabel>
        <span style={{ fontSize: 10, color: T.soft }}>Jump to cluster</span>
      </div>
      <EvidenceFieldRow label="Author" borderTop={false}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, ...WRAP_ANYWHERE }}>{evidence.author ? `@${evidence.author}` : "@anon"}</span>
          <span style={{ fontSize: 10, color: T.soft, ...WRAP_ANYWHERE }}>{detail.clusterTitle}</span>
        </div>
      </EvidenceFieldRow>
      <EvidenceFieldRow label="Excerpt">
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>
          {evidencePreview(evidence.text)}
        </div>
      </EvidenceFieldRow>
      <EvidenceFieldRow label="Metrics">
        <EvidenceMetricRow
          metrics={{
            likes: evidence.likes,
            comments: evidence.comments,
            reposts: evidence.reposts,
            forwards: evidence.forwards
          }}
        />
      </EvidenceFieldRow>
    </button>
  );
}

/* ── Analysis summary strip ── */

function AnalysisSummaryStrip({
  label,
  analysis,
  color,
  visibleCount,
  evidenceCount
}: {
  label: string;
  analysis: AnalysisSnapshot | null;
  color: string;
  visibleCount: number;
  evidenceCount: number;
}) {
  const m = analysisMetrics(analysis);
  if (!analysis) return null;
  const countLabel = visibleClusterCountLabel(visibleCount);
  const hiddenLabel = hiddenClusterCountLabel(m.nClusters, visibleCount);
  return (
    <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.5, ...WRAP_ANYWHERE }}>
      <span style={{ fontWeight: 800, color }}>{label}</span>{" "}
      {countLabel}
      {m.dominance != null ? ` · ${getDominanceLabel(m.dominance)}(${(m.dominance * 100).toFixed(0)}%)` : ""}
      {" · "}{analysis.source_comment_count ?? "?"} comments captured
      {evidenceCount > 0 ? ` · ${evidenceCount} evidence surfaced` : ""}
      {hiddenLabel ? ` · ${hiddenLabel}` : ""}
    </div>
  );
}

/* ── Top comments expandable ── */

function TopComments({ comments, label, bgColor }: { comments: CommentData[]; label: string; bgColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? comments.slice(0, 10) : comments.slice(0, 2);
  if (comments.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <SectionLabel>{label} ({comments.length})</SectionLabel>
        {comments.length > 2 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none", border: "none", fontSize: 11, fontWeight: 700,
              color: T.accent, cursor: "pointer", padding: 0
            }}
          >
            {expanded ? "Show less" : `+${comments.length - 2} more`}
          </button>
        ) : null}
      </div>
      {shown.map((comment, i) => (
        <div key={comment.comment_id || i} style={{
          padding: "7px 10px",
          borderRadius: tokens.radius.card,
          overflow: "hidden",
          background: bgColor,
          fontSize: 11,
          lineHeight: 1.45
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: T.ink, ...WRAP_ANYWHERE }}>@{comment.author || "anon"}</span>
            {comment.like_count != null ? <span style={{ color: T.soft }}>{comment.like_count} ♥</span> : null}
          </div>
          <div style={{
            color: T.sub,
            display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden"
          }}>
            {comment.text || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompareUnavailableBridge({
  session,
  onGoToLibrary
}: {
  session: SessionRecord;
  onGoToLibrary?: () => void;
}) {
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

  return (
    <div
      data-compare-bridge="unavailable"
      style={{
        display: "grid",
        gap: 10,
        padding: "18px 16px 16px",
        borderRadius: 12,
        background: `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`,
        border: `1px solid ${T.line}`,
        boxShadow: tokens.shadow.glass
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <SectionLabel>Compare</SectionLabel>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, lineHeight: 1.4 }}>
          Compare needs two ready posts.
        </div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{explanation}</div>
      </div>

      <div
        data-result-hero-skeleton="visible"
        data-result-hero-pending-status={pendingStatus || "idle"}
        style={{
          display: "grid",
          gap: 12,
          padding: "15px 15px 14px",
          borderRadius: 12,
          background: AR.card,
          boxShadow: "0 2px 16px rgba(0,0,0,0.065)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: tokens.color.neutralSurfaceSoft, borderRadius: 999, padding: "4px 9px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: analyzingCount > 0 ? T.running : T.warn, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.sub }}>Result pending</span>
          </div>
          {pendingItem ? (
            <div style={{ fontSize: 10, color: T.soft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              @{pendingItem.descriptor.author_hint || "pending"}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span style={skeletonBlockStyle("72%", 16)} />
          <span style={skeletonBlockStyle("94%", 10)} />
          <span style={skeletonBlockStyle("86%", 10)} />
        </div>

        <div data-compare-bridge-skeleton="visible" style={{ display: "flex", gap: 8 }}>
          {["46%", "30%"].map((width, index) => (
            <span key={index} style={skeletonBlockStyle(width, 26, { borderRadius: 999 })} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: `2px solid ${T.line}`,
            borderTopColor: analyzingCount > 0 ? T.running : inflightCount > 0 ? T.warn : T.soft,
            animation: (analyzingCount > 0 || inflightCount > 0) ? "dlens-pulse 1.6s ease-in-out infinite" : undefined,
            flexShrink: 0
          }}
        />
        <div style={{ display: "grid", gap: 6, flex: 1 }}>
          {["64%", "52%"].map((width, index) => (
            <span
              key={index}
              style={skeletonBlockStyle(width, 6)}
            />
          ))}
        </div>
      </div>

      <div>
        <PrimaryButton onClick={() => onGoToLibrary?.()} style={{ minWidth: 132 }}>
          Go to Library
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   APPLE-STYLE RESULT READING VIEW
   ══════════════════════════════════════════════════════ */

const AR = {
  blue: tokens.color.accent,
  orange: tokens.color.queued,
  green: tokens.color.success,
  ink: tokens.color.ink,
  canvas: tokens.color.contentSurface,
  card: tokens.color.elevated,
  softInk: tokens.color.subInk,
  muteInk: tokens.color.softInk,
  dimInk: tokens.color.softInk,
  line: tokens.color.line,
  lineStrong: tokens.color.lineStrong,
} as const;

function ARSparkle({ color = AR.blue, size = 10 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2L13.8 9.2L21 11L13.8 12.8L12 20L10.2 12.8L3 11L10.2 9.2L12 2Z"/>
    </svg>
  );
}

function ARChevron({ open }: { open: boolean }) {
  return (
    <svg width="11" height="7" viewBox="0 0 11 7" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s" }}>
      <path d="M1 1L5.5 6L10 1" stroke="rgba(0,0,0,0.32)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Flowing Cluster Viz (copied from mockup) ── */

interface ARDot {
  id: number; cx: number; cy: number; r: number;
  cluster: "A" | "B" | "C"; mass: number;
  phaseX: number;
  phaseY: number;
  idleAmpX: number;
  idleAmpY: number;
  maxDrift: number;
}

const AR_BASE_DOTS: ARDot[] = [
  ...([...Array(22)].map((_, i) => ({
    id: i,
    cx: 38 + Math.cos(i * 0.62 + 0.3) * (8 + (i % 4) * 5.5) + (i % 3) * 1.5,
    cy: 50 + Math.sin(i * 0.62 + 0.3) * (7 + (i % 4) * 4.5),
    r: i < 3 ? 3.9 : i < 8 ? 3.1 : 2.05,
    cluster: "A" as const,
    mass: i < 3 ? 3 : i < 8 ? 2 : 1,
    phaseX: i * 0.41 + 0.3,
    phaseY: i * 0.27 + 1.1,
    idleAmpX: i < 3 ? 1.1 : i < 8 ? 1.5 : 1.8,
    idleAmpY: i < 3 ? 0.95 : i < 8 ? 1.3 : 1.55,
    maxDrift: i < 3 ? 3.1 : i < 8 ? 4.1 : 4.7,
  }))),
  ...([...Array(13)].map((_, i) => ({
    id: 22 + i,
    cx: 108 + Math.cos(i * 0.9 + 1) * (7 + (i % 3) * 5),
    cy: 45 + Math.sin(i * 0.9 + 1) * (6 + (i % 3) * 4.5),
    r: i < 2 ? 3.7 : i < 5 ? 2.9 : 1.95,
    cluster: "B" as const,
    mass: i < 2 ? 3 : i < 5 ? 2 : 1,
    phaseX: i * 0.36 + 0.9,
    phaseY: i * 0.22 + 2.2,
    idleAmpX: i < 2 ? 1 : i < 5 ? 1.45 : 1.75,
    idleAmpY: i < 2 ? 0.9 : i < 5 ? 1.2 : 1.55,
    maxDrift: i < 2 ? 3 : i < 5 ? 3.9 : 4.4,
  }))),
  ...([...Array(7)].map((_, i) => ({
    id: 35 + i,
    cx: 68 + (i % 4) * 16 + Math.cos(i * 1.4) * 5,
    cy: 82 + Math.sin(i * 1.4) * 6,
    r: 1.8,
    cluster: "C" as const,
    mass: 1,
    phaseX: i * 0.53 + 0.4,
    phaseY: i * 0.31 + 1.7,
    idleAmpX: 1.6,
    idleAmpY: 1.2,
    maxDrift: 4.2,
  }))),
];

const AR_CLUSTER_COLORS: Record<string, string> = {
  A: "rgba(0,113,227,0.6)",
  B: "rgba(255,149,0,0.65)",
  C: "rgba(52,199,89,0.55)",
};

function FlowingClusterViz() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [offsets, setOffsets] = useState<{ x: number; y: number }[]>(AR_BASE_DOTS.map(() => ({ x: 0, y: 0 })));
  const rafRef = useRef<number>(0);
  const currentOffsets = useRef(offsets);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const isReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const animate = useCallback(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const time = now / 1000;
    const pointer = pointerRef.current;
    const pointerActive = Boolean(pointer);

    const next = currentOffsets.current.map((cur, i) => {
      const dot = AR_BASE_DOTS[i]!;
      const idleX =
        Math.sin(time * 0.7 + dot.phaseX) * dot.idleAmpX
        + Math.cos(time * 0.33 + dot.phaseY) * (dot.idleAmpX * 0.35);
      const idleY =
        Math.cos(time * 0.62 + dot.phaseY) * dot.idleAmpY
        + Math.sin(time * 0.28 + dot.phaseX) * (dot.idleAmpY * 0.32);

      let interactionX = 0;
      let interactionY = 0;

      if (pointer) {
        const dx = dot.cx - pointer.x;
        const dy = dot.cy - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = dot.cluster === "C" ? 22 : 29;
        if (dist < radius && dist > 0.0001) {
          const force = Math.pow(1 - dist / radius, 2);
          const strength = (dot.cluster === "C" ? 5.8 : 8.2) * force / (0.9 + dot.mass * 0.75);
          interactionX = (dx / dist) * strength;
          interactionY = (dy / dist) * strength;
        }
      }

      let tx = idleX + interactionX;
      let ty = idleY + interactionY;
      const drift = Math.sqrt(tx * tx + ty * ty);
      if (drift > dot.maxDrift) {
        const scale = dot.maxDrift / drift;
        tx *= scale;
        ty *= scale;
      }

      const easing = pointerActive ? 0.14 : 0.075;
      return {
        x: cur.x + (tx - cur.x) * easing,
        y: cur.y + (ty - cur.y) * easing
      };
    });
    currentOffsets.current = next;
    setOffsets([...next]);
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isReduced) return;
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate, isReduced]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isReduced || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 168 / rect.width;
    const scaleY = 112 / rect.height;
    pointerRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, [isReduced]);

  const handleMouseLeave = useCallback(() => {
    pointerRef.current = null;
  }, []);

  return (
    <div style={{ background: AR.canvas, borderRadius: 12, padding: "10px 8px 6px", cursor: "crosshair" }}>
      <svg ref={svgRef} width="100%" viewBox="0 0 168 112" style={{ display: "block" }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        {AR_BASE_DOTS.map((d, i) => (
          <circle key={d.id}
            cx={d.cx + (offsets[i]?.x ?? 0)}
            cy={d.cy + (offsets[i]?.y ?? 0)}
            r={d.r}
            fill={AR_CLUSTER_COLORS[d.cluster] ?? AR_CLUSTER_COLORS["A"]!}
            style={{
              filter: d.r > 3.4 ? "drop-shadow(0 0.6px 1.8px rgba(0,0,0,0.1))" : "none",
              opacity: d.cluster === "C" ? 0.78 : 0.9
            }}
          />
        ))}
        <g transform="translate(11,94)">
          <rect width="34" height="10" rx="5" fill="rgba(0,113,227,0.08)" />
          <text x="17" y="7.1" textAnchor="middle" fontSize="7" fill="rgba(0,113,227,0.88)" fontWeight="700">群組 A</text>
        </g>
        <g transform="translate(103,94)">
          <rect width="34" height="10" rx="5" fill="rgba(255,149,0,0.1)" />
          <text x="17" y="7.1" textAnchor="middle" fontSize="7" fill="rgba(200,115,0,0.92)" fontWeight="700">群組 B</text>
        </g>
        <g transform="translate(59,94)">
          <rect width="22" height="10" rx="5" fill="rgba(52,199,89,0.1)" />
          <text x="11" y="7.1" textAnchor="middle" fontSize="6.8" fill="rgba(36,144,64,0.88)" fontWeight="700">其他</text>
        </g>
      </svg>
      <p style={{ fontSize: 9.5, color: AR.dimInk, textAlign: "center", margin: "2px 0 0", letterSpacing: 0 }}>
        每個點代表一則留言 · 平時慢速漂移，靠近時出現局部場域偏移
      </p>
    </div>
  );
}

/* ── Annotated Quote ── */

function AnnotatedQuote({ text, marks, side }: {
  text: string;
  marks: { phrase: string; label: string }[];
  side: "A" | "B";
}) {
  const hlColor = side === "A" ? "rgba(0,113,227,0.13)" : "rgba(255,149,0,0.14)";
  const tagColor = side === "A" ? AR.blue : "#c47300";
  const remaining_ref = { value: text };
  const parts: { text: string; highlight: boolean }[] = [];
  const sorted = [...marks].sort((a, b) => text.indexOf(a.phrase) - text.indexOf(b.phrase));
  let remaining = text;
  for (const m of sorted) {
    const idx = remaining.indexOf(m.phrase);
    if (idx === -1) continue;
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), highlight: false });
    parts.push({ text: m.phrase, highlight: true });
    remaining = remaining.slice(idx + m.phrase.length);
  }
  if (remaining) parts.push({ text: remaining, highlight: false });
  void remaining_ref;
  return (
    <div>
      <p style={{ fontSize: 13.5, lineHeight: 1.58, letterSpacing: 0, color: AR.ink, marginBottom: marks.length ? 9 : 0 }}>
        「{parts.map((p, i) => p.highlight
          ? <mark key={i} style={{ background: hlColor, borderRadius: 3, padding: "1px 2px", color: AR.ink, fontWeight: 600 }}>{p.text}</mark>
          : <span key={i}>{p.text}</span>
        )}」
      </p>
      {marks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 9 }}>
          {sorted.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: tagColor, fontFamily: "monospace" }}>「{m.phrase}」</span>
              <div style={{ flex: 1, borderTop: "1px dotted rgba(0,0,0,0.1)" }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: tagColor, background: side === "A" ? "rgba(0,113,227,0.09)" : "rgba(255,149,0,0.1)", borderRadius: 6, padding: "1.5px 7px" }}>{m.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Dictionary Card ── */

function BlankUserAvatar({ size = 22, dataAttr }: { size?: number; dataAttr?: string }) {
  const dataProps = dataAttr ? ({ [dataAttr]: "placeholder" } as Record<string, string>) : {};
  return (
    <span
      {...dataProps}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(180deg,#eef1f5,#e5e7eb)",
        border: "1px solid rgba(0,0,0,0.08)",
        color: "rgba(0,0,0,0.34)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)"
      }}
    >
      <svg width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.6" fill="currentColor" opacity="0.9" />
        <path d="M5.5 18.2c0-2.9 2.9-4.9 6.5-4.9s6.5 2 6.5 4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      </svg>
    </span>
  );
}

function CompoundLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: AR.muteInk, letterSpacing: 0, marginBottom: 2 }}>{label}</div>
      <p style={{ fontSize: 12, lineHeight: 1.55, letterSpacing: 0, color: AR.softInk, margin: 0 }}>{text}</p>
    </div>
  );
}

function DictionaryCard({ rank, handle, quote, likes, replies, side, marks, analysis, effectiveness }: {
  rank: number; handle: string; quote: string; likes?: number | null; replies?: number | null;
  side: "A" | "B"; marks: { phrase: string; label: string }[];
  analysis: string | null;
  effectiveness: { discussionFunction: string; relationToCluster: string; whyEffective: string } | null;
}) {
  const [exp, setExp] = useState(false);
  const cc = side === "A" ? AR.blue : "#c47300";
  const cb = side === "A" ? "rgba(0,113,227,0.09)" : "rgba(255,149,0,0.1)";
  const border = side === "A" ? AR.blue : AR.orange;
  const hasAnalysis = Boolean(analysis);
  const hasEffectiveness = effectiveness !== null
    && (effectiveness.discussionFunction.length > 0 || effectiveness.whyEffective.length > 0);
  return (
    <div style={{ background: AR.card, borderRadius: tokens.radius.card, overflow: "hidden", boxShadow: tokens.shadow.glass }}>
      <div style={{ padding: "12px 15px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `0.5px solid ${AR.line}` }}>
        <div style={{ width: 21, height: 21, borderRadius: "50%", background: cb, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: cc }}>#{rank}</span>
        </div>
        <BlankUserAvatar dataAttr="data-result-evidence-avatar" />
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 5 }}>
          <span style={{ fontSize: 11.5, color: AR.softInk, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{handle}</span>
          <EvidenceMetricRow
            metrics={{
              likes: likes ?? null,
              comments: replies ?? null,
              reposts: null,
              forwards: null
            }}
          />
        </div>
      </div>
      <div style={{ padding: hasAnalysis ? "12px 15px 0" : "12px 15px 12px" }}>
        <AnnotatedQuote text={quote} marks={marks} side={side} />
      </div>
      {hasAnalysis && (
        <div style={{ margin: "0 15px 12px", borderLeft: `2.5px solid ${border}`, paddingLeft: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: AR.muteInk, letterSpacing: 0, marginBottom: 4 }}>剖析</div>
          <p style={{ fontSize: 12, lineHeight: 1.55, letterSpacing: 0, color: AR.softInk, margin: 0 }}>{analysis}</p>
        </div>
      )}
      {hasEffectiveness && (
        <>
          <button onClick={() => setExp(e => !e)} style={{ width: "100%", background: "rgba(0,0,0,0.02)", border: "none", borderTop: `0.5px solid rgba(0,0,0,0.05)`, cursor: "pointer", padding: "8px 15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <ARSparkle color={cc} size={9} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: cc }}>為什麼被挑出來</span>
            </div>
            <ARChevron open={exp} />
          </button>
          {exp && effectiveness && (
            <div style={{ padding: "9px 15px 13px", background: "rgba(0,0,0,0.018)", display: "grid", gap: 8 }}>
              <CompoundLine label="在討論中" text={effectiveness.discussionFunction} />
              {effectiveness.relationToCluster && (
                <CompoundLine label="跟主群組" text={effectiveness.relationToCluster} />
              )}
              <CompoundLine label="修辭效果" text={effectiveness.whyEffective} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Result: Hero Reading Card ── */

function ResultHeroCard({
  heroSummary,
  brief,
  postA,
  postB,
  compareBriefState,
}: {
  heroSummary: CompareHeroSummary | null;
  brief: CompareBrief | null;
  postA: PostData | null;
  postB: PostData | null;
  compareBriefState: "idle" | "loading" | "ready" | "fallback";
}) {
  if (!heroSummary) return null;
  const briefBadgeColor = compareBriefState === "ready" ? AR.blue : compareBriefState === "loading" ? "#636366" : "#8e8e93";
  const confidenceLabel = brief?.confidence ? `CONF · ${String(brief.confidence).toUpperCase()}` : "CONF · MEDIUM";
  const briefLabel = compareBriefState === "loading" ? "生成中…" : `AI Brief · ${confidenceLabel}`;
  return (
    <div style={{ background: AR.card, borderRadius: 12, padding: "17px 17px 15px", boxShadow: "0 2px 16px rgba(0,0,0,0.065)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11, gap: 10, flexWrap: "wrap" as const, minWidth: 0 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,149,0,0.1)", borderRadius: 6, padding: "3px 9px" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: AR.orange }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#b06200" }}>
            {heroSummary.audienceAlignmentLeft.badge === "Align" && heroSummary.audienceAlignmentRight.badge === "Align" ? "共鳴放大型"
              : heroSummary.audienceAlignmentLeft.badge === "Oppose" || heroSummary.audienceAlignmentRight.badge === "Oppose" ? "分歧探索型"
              : "張力並存型"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
          <ARSparkle color={briefBadgeColor} />
          <span style={{ fontSize: 10.5, color: briefBadgeColor, fontWeight: 600 }}>
            {briefLabel}
          </span>
        </div>
      </div>
      {(postA || postB) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginBottom: 13, minWidth: 0 }}>
          {[
            { label: "A", post: postA, colors: [AR.blue, "#34aadc"] },
            { label: "B", post: postB, colors: [AR.orange, "#ffcc00"] },
          ].map(({ label, post, colors }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, background: AR.canvas, borderRadius: 8, padding: "7px 10px", minWidth: 0, overflow: "hidden" }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg,${colors[0]},${colors[1]})`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 9, color: tokens.color.elevated, fontWeight: 800 }}>貼{label}</span>
              </div>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: AR.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{post?.author || "—"}</div>
                <div style={{ fontSize: 9.5, color: AR.muteInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {post?.text ? `「${post.text.slice(0, 18)}…」` : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <h1 style={{ fontFamily: tokens.font.sans, fontSize: 23, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0, color: AR.ink, marginBottom: 12, ...WRAP_ANYWHERE }}>
        {heroSummary.headline}
      </h1>
      {heroSummary.relation ? (
        <div
          style={{
            display: "grid",
            gap: 4,
            padding: "10px 11px",
            borderRadius: 10,
            background: "rgba(26,46,79,0.035)",
            border: `1px solid ${AR.line}`,
            marginBottom: 12,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>
            判讀關係
          </span>
          <p style={{ fontSize: 12.5, lineHeight: 1.58, letterSpacing: 0, color: AR.softInk, margin: 0, ...WRAP_ANYWHERE }}>
            {heroSummary.relation}
          </p>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 7, paddingTop: 11, borderTop: `0.5px solid ${AR.line}`, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: AR.muteInk, paddingTop: 2, whiteSpace: "nowrap", letterSpacing: 0 }}>為何成立</span>
        <p style={{ fontSize: 12, lineHeight: 1.47, letterSpacing: 0, color: AR.softInk, margin: 0, ...WRAP_ANYWHERE }}>
          {heroSummary.creatorCue}
        </p>
      </div>
    </div>
  );
}

/* ── Result: Multi-Cluster Balance Card ── */

function ResultBalanceCard({
  leftSummaries,
  rightSummaries,
  leftSurfaces,
  rightSurfaces,
  capturedA,
  capturedB,
  activeTab,
  onTabChange,
}: {
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  capturedA: number;
  capturedB: number;
  activeTab: "A" | "B";
  onTabChange: (tab: "A" | "B") => void;
}) {
  const activeSummaries = (activeTab === "A" ? leftSummaries : rightSummaries).slice(0, 3);
  const activeSurfaces = activeTab === "A" ? leftSurfaces : rightSurfaces;
  if (activeSummaries.length === 0) return null;

  const clusterColors = [AR.blue, AR.orange, AR.green];
  const clusterNarrative = ["主流", "高互動", "分散"];

  // Use raw supportCount in flex so rounding never creates gaps
  const totalCount = activeSummaries.reduce((sum, s) => sum + s.supportCount, 0);
  const displayTotal = totalCount || (activeTab === "A" ? capturedA : capturedB);
  const bars = activeSummaries.map((s, i) => ({
    count: s.supportCount || 1,
    pct: totalCount > 0 ? Math.round((s.supportCount / totalCount) * 100) : Math.round(s.cluster.size_share * 100),
    color: clusterColors[i] ?? AR.blue,
  }));

  // Tension note: dominant vs. high-engagement cluster titles
  const tensionText = (() => {
    if (activeSummaries.length < 2) return "各群組互動模式呈現差異";
    const t0 = activeSurfaces[0]?.title || activeSummaries[0]!.cluster.keywords[0] || "群組 1";
    const t1 = activeSurfaces[1]?.title || activeSummaries[1]!.cluster.keywords[0] || "群組 2";
    const ratio0 = activeSummaries[0]!.cluster.like_share / (activeSummaries[0]!.cluster.size_share + 0.001);
    const ratio1 = activeSummaries[1]!.cluster.like_share / (activeSummaries[1]!.cluster.size_share + 0.001);
    const highEng = ratio0 > ratio1 ? t0 : t1;
    const dominant = activeSummaries[0]!.cluster.size_share >= activeSummaries[1]!.cluster.size_share ? t0 : t1;
    if (dominant === highEng) return `「${dominant}」在數量與互動上均佔主導`;
    return `「${dominant}」數量最多，但「${highEng}」的互動質量更高`;
  })();

  return (
    <div style={{ background: AR.card, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.065)" }}>
      {/* Header + toggle */}
      <div style={{ padding: "11px 14px 9px", borderBottom: `0.5px solid ${AR.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.22 }}>留言區聲量結構</span>
          <span style={{ fontSize: 10, color: AR.dimInk }}>{displayTotal} 則 · {activeSummaries.length} 群組</span>
        </div>
        <div style={{ display: "flex", background: "rgba(0,0,0,0.05)", borderRadius: 7, padding: 2 }}>
          {(["A", "B"] as const).map(t => (
            <button key={t} onClick={() => onTabChange(t)} style={{
              flex: 1, padding: "4px 0", borderRadius: 5, border: "none",
              background: activeTab === t ? AR.card : "transparent",
              boxShadow: activeTab === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              fontSize: 11, fontWeight: 600,
              color: activeTab === t ? (t === "A" ? AR.blue : "#b06200") : AR.muteInk,
              cursor: "pointer",
            }}>
              貼 {t}
            </button>
          ))}
        </div>
      </div>

      {/* Cluster columns */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${AR.line}` }}>
        {activeSummaries.map((s, i) => {
          const surface = activeSurfaces[i];
          const title = surface?.title || s.cluster.keywords.slice(0, 2).join("・") || "—";
          const cc = clusterColors[i] ?? AR.blue;
          return (
            <div key={i} style={{ flex: 1, padding: "8px 10px 12px", borderRight: i < activeSummaries.length - 1 ? `0.5px solid ${AR.line}` : "none", minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: cc, letterSpacing: 0, marginBottom: 4 }}>
                群 {i + 1}
              </div>
              <div style={{ fontFamily: tokens.font.sans, fontSize: 26, fontWeight: 700, color: AR.ink, lineHeight: 1, letterSpacing: 0 }}>
                {bars[i]?.pct ?? 0}<span style={{ fontSize: 13, fontWeight: 500 }}>%</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: AR.ink, marginTop: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: cc, fontWeight: 700, background: `${cc}14`, borderRadius: 4, padding: "1.5px 5px", display: "inline-block" }}>
                {clusterNarrative[i] ?? "分散"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Proportional segment bar using raw counts to avoid rounding gaps */}
      <div style={{ display: "flex", height: 4, overflow: "hidden" }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: b.count, background: b.color, opacity: 0.8, minWidth: 0 }} />
        ))}
      </div>

      {/* Tension note */}
      <div style={{ padding: "9px 17px 12px", minWidth: 0 }}>
        <p style={{ fontSize: 11, color: AR.softInk, lineHeight: 1.45, letterSpacing: 0, margin: 0, ...WRAP_ANYWHERE }}>
          <span style={{ fontWeight: 700, color: AR.ink }}>主要張力：</span>
          {tensionText}
        </p>
      </div>
    </div>
  );
}

/* ── Result: Evidence Tabs ── */

function ResultEvidenceSection({
  leftSurfaces,
  rightSurfaces,
  annotationMap,
  tab,
  onTabChange,
}: {
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  annotationMap: Map<string, EvidenceAnnotation>;
  tab: "A" | "B";
  onTabChange: (tab: "A" | "B") => void;
}) {
  const topA = leftSurfaces[0] || null;
  const topB = rightSurfaces[0] || null;
  const evidencesA = topA?.audienceEvidence.slice(0, 2) ?? [];
  const evidencesB = topB?.audienceEvidence.slice(0, 2) ?? [];

  if (evidencesA.length === 0 && evidencesB.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12, padding: "0 2px" }}>
        <span style={{ fontFamily: tokens.font.sans, fontSize: 18, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>代表性原文</span>
      </div>
      <div style={{ display: "flex", background: "rgba(0,0,0,0.06)", borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {(["A", "B"] as const).map(t => (
          <button key={t} onClick={() => onTabChange(t)} style={{ flex: 1, padding: "6px 0", borderRadius: tokens.radius.sm, border: "none", background: tab === t ? AR.card : "transparent", boxShadow: tab === t ? tokens.shadow.glass : "none", fontSize: 12, fontWeight: 600, color: tab === t ? (t === "A" ? AR.blue : AR.orange) : AR.muteInk, cursor: "pointer", letterSpacing: 0 }}>
            {t === "A" ? `${topA?.title || "貼 A 主群組"}` : `${topB?.title || "貼 B 主群組"}`}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultCardGap }}>
        {(tab === "A" ? evidencesA : evidencesB).map((e, i) => {
          const annotation = e.comment_id ? annotationMap.get(e.comment_id) : undefined;
          const analysisText = annotation?.writerMeaning || null;
          const effectivenessData = annotation
            ? {
                discussionFunction: annotation.discussionFunction,
                relationToCluster: annotation.relationToCluster,
                whyEffective: annotation.whyEffective,
              }
            : null;
          return (
            <DictionaryCard
              key={i}
              rank={i + 1}
              handle={e.author || "anon"}
              quote={e.text || "—"}
              likes={e.like_count ?? null}
              replies={e.reply_count ?? null}
              side={tab}
              marks={annotation?.phraseMarks ?? []}
              analysis={analysisText}
              effectiveness={effectivenessData}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Result: Why It Matters ── */

function ResultWhyCard({ brief }: { brief: CompareBrief | null }) {
  const text = brief?.whyItMatters;
  if (!text) return null;
  const readingStyle = { fontSize: 12, lineHeight: 1.52, letterSpacing: 0, color: AR.softInk, margin: 0, ...WRAP_ANYWHERE };
  return (
    <div style={{ background: AR.card, borderRadius: tokens.radius.card, padding: "16px 17px 15px", boxShadow: tokens.shadow.glass, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: AR.muteInk, letterSpacing: 0, display: "block", marginBottom: 10 }}>為什麼重要</span>
      <div style={{ borderLeft: `2.5px solid ${AR.blue}`, paddingLeft: 12, marginBottom: 12, minWidth: 0 }}>
        <p style={{ fontFamily: tokens.font.sans, fontSize: 16, fontWeight: 600, fontStyle: "italic", lineHeight: 1.5, letterSpacing: 0, color: AR.ink, margin: 0, ...WRAP_ANYWHERE }}>
          {text}
        </p>
      </div>
      {brief?.aReading && brief?.bReading && (
        <div style={{ paddingTop: 10, borderTop: `0.5px solid ${AR.line}`, display: "grid", gap: tokens.spacing.xs }}>
          <p style={readingStyle}><strong>A.</strong> {brief.aReading}</p>
          <p style={readingStyle}><strong>B.</strong> {brief.bReading}</p>
        </div>
      )}
    </div>
  );
}

/* ── Result: Trust Strip + Drawer ── */

function ResultTrustStrip({
  analysisA,
  analysisB,
  capturedA,
  capturedB,
  leftClusterNodes,
  rightClusterNodes,
  defaultOpen = false,
}: {
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedA: number;
  capturedB: number;
  leftClusterNodes: ClusterMapNode[];
  rightClusterNodes: ClusterMapNode[];
  defaultOpen?: boolean;
}) {
  const [drawer, setDrawer] = useState(defaultOpen);
  const mA = analysisMetrics(analysisA);
  const mB = analysisMetrics(analysisB);
  const kA = mA.nClusters ?? (leftClusterNodes.length || 2);
  const kB = mB.nClusters ?? (rightClusterNodes.length || 2);

  const badges = [
    ["◎", `k-means (k=${kA}/${kB})`],
    ["◌", `${capturedA + capturedB} 則留言`],
  ].filter(Boolean) as [string, string][];

  const coverageMetrics = [
    { label: "總留言", value: String(capturedA + capturedB), tint: "neutral" as const },
    { label: "A 貼文", value: String(capturedA), tint: "blue" as const },
    { label: "B 貼文", value: String(capturedB), tint: "orange" as const },
  ];
  const structureMetrics = [
    { label: "A 群組", value: String(leftClusterNodes.length), tint: "blue" as const },
    { label: "B 群組", value: String(rightClusterNodes.length), tint: "orange" as const },
    { label: "A 主導率", value: String(mA.dominance != null ? `${(mA.dominance * 100).toFixed(0)}%` : "—"), tint: "green" as const },
  ];

  const metricCardStyle = (tint: "neutral" | "blue" | "orange" | "green"): React.CSSProperties => {
    if (tint === "blue") {
      return {
        background: "rgba(0,113,227,0.045)",
        border: "1px solid rgba(0,113,227,0.05)",
        boxShadow: "inset 0 2px 0 rgba(0,113,227,0.18)"
      };
    }
    if (tint === "orange") {
      return {
        background: "rgba(255,149,0,0.055)",
        border: "1px solid rgba(255,149,0,0.06)",
        boxShadow: "inset 0 2px 0 rgba(255,149,0,0.2)"
      };
    }
    if (tint === "green") {
      return {
        background: "rgba(52,199,89,0.055)",
        border: "1px solid rgba(52,199,89,0.06)",
        boxShadow: "inset 0 2px 0 rgba(52,199,89,0.2)"
      };
    }
    return {
      background: "rgba(0,0,0,0.018)",
      border: "1px solid rgba(0,0,0,0.035)",
      boxShadow: "inset 0 2px 0 rgba(0,0,0,0.06)"
    };
  };

  return (
    <div style={{ background: AR.card, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.065)" }}>
      <div style={{ padding: "11px 15px", display: "flex", alignItems: "center", gap: 7, borderBottom: `0.5px solid ${AR.line}`, flexWrap: "wrap" as const }}>
        {badges.map(([icon, text]) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 4, background: AR.canvas, borderRadius: 6, padding: "4px 9px" }}>
            <span style={{ fontSize: 9.5, color: AR.muteInk }}>{icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: AR.softInk }}>{text}</span>
          </div>
        ))}
      </div>
      <button onClick={() => setDrawer(d => !d)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "11px 15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="5" height="5" rx="1.2" fill="rgba(0,0,0,0.22)"/><rect x="7.5" y="0.5" width="5" height="5" rx="1.2" fill="rgba(0,0,0,0.22)"/><rect x="0.5" y="7.5" width="5" height="5" rx="1.2" fill="rgba(0,0,0,0.22)"/><rect x="7.5" y="7.5" width="5" height="5" rx="1.2" fill="rgba(0,0,0,0.22)"/></svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: AR.softInk }}>驗證數據</span>
          <span style={{ fontSize: 10, color: AR.dimInk, background: AR.canvas, borderRadius: 6, padding: "1px 6px" }}>叢集圖・方法論</span>
        </div>
        <ARChevron open={drawer} />
      </button>
      {drawer && (
        <div style={{ borderTop: `0.5px solid ${AR.line}`, padding: "13px 15px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.3, marginBottom: 8 }}>叢集分佈圖</div>
          <FlowingClusterViz />
          <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>資料覆蓋</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {coverageMetrics.map((metric) => (
                  <div key={metric.label} style={{ ...metricCardStyle(metric.tint), borderRadius: 9, padding: "7px 9px 8px" }}>
                    <div style={{ fontSize: 9, color: AR.muteInk, marginBottom: 4 }}>{metric.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>結構特徵</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {structureMetrics.map((metric) => (
                  <div key={metric.label} style={{ ...metricCardStyle(metric.tint), borderRadius: 9, padding: "7px 9px 8px" }}>
                    <div style={{ fontSize: 9, color: AR.muteInk, marginBottom: 4 }}>{metric.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: AR.softInk, lineHeight: 1.52, background: AR.canvas, borderRadius: 8, padding: "9px 12px", ...WRAP_ANYWHERE }}>
            <span style={{ fontWeight: 700 }}>方法論：</span>k-means 叢集分析（k={kA}/{kB}），基於留言情緒向量、用詞模式、互動行為分組。
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Result Reading Body (replaces CompareJudgmentSheet) ── */

function ResultReadingBody({
  heroSummary,
  brief,
  postA,
  postB,
  leftSummaries,
  rightSummaries,
  leftSurfaces,
  rightSurfaces,
  analysisA,
  analysisB,
  capturedA,
  capturedB,
  leftClusterNodes,
  rightClusterNodes,
  compareBriefState,
  onOpenTechnique,
  annotationMap,
}: {
  heroSummary: CompareHeroSummary | null;
  brief: CompareBrief | null;
  postA: PostData | null;
  postB: PostData | null;
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedA: number;
  capturedB: number;
  leftClusterNodes: ClusterMapNode[];
  rightClusterNodes: ClusterMapNode[];
  compareBriefState: "idle" | "loading" | "ready" | "fallback";
  onOpenTechnique: (side: "A" | "B") => void;
  annotationMap: Map<string, EvidenceAnnotation>;
}) {
  void onOpenTechnique; // available for future technique entry point
  const [activeResultTab, setActiveResultTab] = useState<"A" | "B">("A");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultSectionGap }}>
      <ResultHeroCard
        heroSummary={heroSummary}
        brief={brief}
        postA={postA}
        postB={postB}
        compareBriefState={compareBriefState}
      />
      <ResultBalanceCard
        leftSummaries={leftSummaries}
        rightSummaries={rightSummaries}
        leftSurfaces={leftSurfaces}
        rightSurfaces={rightSurfaces}
        capturedA={capturedA}
        capturedB={capturedB}
        activeTab={activeResultTab}
        onTabChange={setActiveResultTab}
      />
      <ResultEvidenceSection
        leftSurfaces={leftSurfaces}
        rightSurfaces={rightSurfaces}
        annotationMap={annotationMap}
        tab={activeResultTab}
        onTabChange={setActiveResultTab}
      />
      <ResultWhyCard
        brief={brief}
      />
      <ResultTrustStrip
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedA}
        capturedB={capturedB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
      />
    </div>
  );
}

function resolveAnnotationRequestKey(
  lastRequestKey: string | null,
  request: EvidenceAnnotationRequest | null
): { requestKey: string | null; shouldRequest: boolean } {
  if (!request) {
    return { requestKey: null, shouldRequest: false };
  }
  const requestKey = request.quotes.map((q) => q.commentId).sort().join("|");
  return {
    requestKey,
    shouldRequest: lastRequestKey !== requestKey
  };
}

/* ── Main CompareView ── */

export const compareViewTestables = {
  getPost,
  buildClusterSummaries,
  layoutClusterMapNodes,
  analysisMetrics,
  visibleClusterCountLabel,
  hiddenClusterCountLabel,
  resolveClusterSurface,
  selectedClusterDetailFromSurface,
  resolveEvidenceKeywordFilter,
  ResultTrustStrip,
  SectionLabel,
  PostHeader,
  ClusterBubbleMap,
  DictionaryCard,
  ResultWhyCard,
  resolveAnnotationRequestKey
};

export function CompareView({
  session,
  settings,
  onGoToLibrary,
  forcedSelection = null,
  hideSelector = false,
  fromTopicId,
  fromTopicName,
  onReturnToTopic,
  topics = [],
  activeResultId = null,
  attachedTopicIds = [],
  onAttachToTopic
}: CompareViewProps) {
  const readyItems = useMemo(
    () => session.items.filter((item) => getItemReadinessStatus(item) === "ready"),
    [session.items]
  );
  const initialSelection = useMemo(
    () => pickCompareSelection(session.items, forcedSelection?.itemAId || "", forcedSelection?.itemBId || ""),
    [session.items, forcedSelection?.itemAId, forcedSelection?.itemBId]
  );
  const [selectedA, setSelectedA] = useState(initialSelection.selectedA);
  const [selectedB, setSelectedB] = useState(initialSelection.selectedB);
  const [compareBrief, setCompareBrief] = useState<CompareBrief | null>(null);
  const [compareBriefState, setCompareBriefState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [clusterInterpretations, setClusterInterpretations] = useState<Map<string, ClusterInterpretation>>(new Map());
  const [clusterSummaryState, setClusterSummaryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [annotationMap, setAnnotationMap] = useState<Map<string, EvidenceAnnotation>>(new Map());
  const lastAnnotationRequestKey = useRef<string | null>(null);
  const [selectedClusterA, setSelectedClusterA] = useState<ClusterSelectionRef | null>(null);
  const [selectedClusterB, setSelectedClusterB] = useState<ClusterSelectionRef | null>(null);
  const [hoveredClusterKey, setHoveredClusterKey] = useState<string | null>(null);
  const [expandedEvidenceKeys, setExpandedEvidenceKeys] = useState<Set<string>>(new Set());
  const [highlightedClusterPanel, setHighlightedClusterPanel] = useState<"A" | "B" | null>(null);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [engagementExpanded, setEngagementExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [comparePage, setComparePage] = useState<"compare" | "technique">("compare");
  const [techniqueSide, setTechniqueSide] = useState<"A" | "B">("A");
  const [selectedDetailSide, setSelectedDetailSide] = useState<"A" | "B">("A");
  const [techniqueSaveState, setTechniqueSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [attachTopicId, setAttachTopicId] = useState(topics[0]?.id || "");
  const clustersSectionRef = useRef<HTMLDivElement | null>(null);
  const engagementSectionRef = useRef<HTMLDivElement | null>(null);
  const commentsSectionRef = useRef<HTMLDivElement | null>(null);
  const detailRefA = useRef<HTMLDivElement | null>(null);
  const detailRefB = useRef<HTMLDivElement | null>(null);
  const detailPageRefA = useRef<HTMLDivElement | null>(null);
  const detailPageRefB = useRef<HTMLDivElement | null>(null);
  const clusterMapRefA = useRef<HTMLDivElement | null>(null);
  const clusterMapRefB = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (forcedSelection) {
      if (forcedSelection.itemAId !== selectedA) setSelectedA(forcedSelection.itemAId);
      if (forcedSelection.itemBId !== selectedB) setSelectedB(forcedSelection.itemBId);
      return;
    }
    const nextSelection = pickCompareSelection(session.items, selectedA, selectedB);
    if (nextSelection.selectedA !== selectedA) setSelectedA(nextSelection.selectedA);
    if (nextSelection.selectedB !== selectedB) setSelectedB(nextSelection.selectedB);
  }, [session.items, selectedA, selectedB, forcedSelection?.itemAId, forcedSelection?.itemBId]);

  useEffect(() => {
    if (!topics.length) {
      if (attachTopicId) {
        setAttachTopicId("");
      }
      return;
    }
    if (!attachTopicId || !topics.some((topic) => topic.id === attachTopicId)) {
      setAttachTopicId(topics[0]!.id);
    }
  }, [attachTopicId, topics]);

  const itemA = readyItems.find((item) => item.id === selectedA) || null;
  const itemB = readyItems.find((item) => item.id === selectedB && item.id !== selectedA) || null;

  const postA = itemA ? getPost(itemA) : null;
  const postB = itemB ? getPost(itemB) : null;
  const commentsA = itemA ? getComments(itemA) : [];
  const commentsB = itemB ? getComments(itemB) : [];
  const analysisA = itemA ? getAnalysis(itemA) : null;
  const analysisB = itemB ? getAnalysis(itemB) : null;
  const capturedCommentCountA = itemA ? getCapturedCommentCount(itemA, commentsA) : 0;
  const capturedCommentCountB = itemB ? getCapturedCommentCount(itemB, commentsB) : 0;
  const commentLookupA = useMemo(() => buildCommentLookup(commentsA), [commentsA]);
  const commentLookupB = useMemo(() => buildCommentLookup(commentsB), [commentsB]);
  const aiProviderConfigured = hasConfiguredProviderKey(settings);
  const compareBriefRequest = useMemo(
    () => (itemA && itemB ? buildCompareBriefRequest(itemA, itemB) : null),
    [itemA, itemB, analysisA?.updated_at, analysisB?.updated_at]
  );
  const fallbackCompareBrief = useMemo(
    () => (compareBriefRequest ? buildDeterministicCompareBrief(compareBriefRequest) : null),
    [compareBriefRequest]
  );

  useEffect(() => {
    if (!compareBriefRequest || !settings.oneLinerProvider || !aiProviderConfigured || analysisA?.status !== "succeeded" || analysisB?.status !== "succeeded") {
      setCompareBrief(null);
      setCompareBriefState("idle");
      return;
    }
    let cancelled = false;
    setCompareBriefState("loading");
    void sendExtensionMessage<{ ok: true; compareBrief?: CompareBrief | null } | { ok: false; error: string }>({
      type: "compare/get-brief",
      request: compareBriefRequest
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok && response.compareBrief) {
          setCompareBrief(response.compareBrief);
          setCompareBriefState(response.compareBrief.source === "ai" ? "ready" : "fallback");
          return;
        }
        setCompareBrief(null);
        setCompareBriefState("fallback");
      })
      .catch(() => {
        if (cancelled) return;
        setCompareBrief(null);
        setCompareBriefState("fallback");
      });
    return () => { cancelled = true; };
  }, [compareBriefRequest, analysisA?.status, analysisB?.status, settings.oneLinerProvider, settings.openaiApiKey, settings.claudeApiKey, settings.googleApiKey, aiProviderConfigured]);

  useEffect(() => {
    const request = itemA && itemB ? buildClusterSummaryRequest(itemA, itemB) : null;
    if (!request || !settings.oneLinerProvider || !aiProviderConfigured || analysisA?.status !== "succeeded" || analysisB?.status !== "succeeded") {
      setClusterInterpretations(new Map());
      setClusterSummaryState("idle");
      return;
    }

    let cancelled = false;
    setClusterSummaryState("loading");
    void sendExtensionMessage<{ ok: true; clusterInterpretations?: ClusterInterpretation[] } | { ok: false; error: string }>({
      type: "compare/get-cluster-summaries",
      request
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok && response.clusterInterpretations?.length) {
          setClusterInterpretations(new Map(
            response.clusterInterpretations.map((item) => [
              clusterInterpretationKey(item.captureId, item.clusterKey),
              item
            ])
          ));
          setClusterSummaryState("ready");
          return;
        }
        setClusterInterpretations(new Map());
        setClusterSummaryState("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setClusterInterpretations(new Map());
        setClusterSummaryState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [itemA?.id, itemB?.id, analysisA?.updated_at, analysisB?.updated_at, settings.oneLinerProvider, settings.openaiApiKey, settings.claudeApiKey, settings.googleApiKey]);

  const leftClusterSummaries = buildClusterSummaries(analysisA, 5, 4, itemA?.captureId ?? "");
  const rightClusterSummaries = buildClusterSummaries(analysisB, 5, 4, itemB?.captureId ?? "");

  const leftClusterSurfaces = leftClusterSummaries.map((summary) => resolveClusterSurface(summary, "left", clusterInterpretations, commentLookupA));
  const rightClusterSurfaces = rightClusterSummaries.map((summary) => resolveClusterSurface(summary, "right", clusterInterpretations, commentLookupB));
  const leftClusterNodes = layoutClusterMapNodes(leftClusterSurfaces);
  const rightClusterNodes = layoutClusterMapNodes(rightClusterSurfaces);

  // Build evidence annotation request: top 2 quotes per side from leading cluster
  const evidenceAnnotationRequest = useMemo((): EvidenceAnnotationRequest | null => {
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
    if (!quotes.length) return null;
    return { quotes };
  }, [
    itemA?.id, itemB?.id,
    leftClusterSurfaces[0]?.key, rightClusterSurfaces[0]?.key,
    leftClusterSurfaces[0]?.audienceEvidence.map(e => e.comment_id).join(","),
    rightClusterSurfaces[0]?.audienceEvidence.map(e => e.comment_id).join(",")
  ]);

  useEffect(() => {
    const resolvedRequest = resolveAnnotationRequestKey(lastAnnotationRequestKey.current, evidenceAnnotationRequest);
    if (!evidenceAnnotationRequest) {
      setAnnotationMap(new Map());
      lastAnnotationRequestKey.current = resolvedRequest.requestKey;
      return;
    }
    if (!resolvedRequest.shouldRequest) return;
    lastAnnotationRequestKey.current = resolvedRequest.requestKey;

    let cancelled = false;
    void sendExtensionMessage<{ ok: true; evidenceAnnotations?: EvidenceAnnotation[] } | { ok: false; error: string }>({
      type: "compare/get-evidence-annotations",
      request: evidenceAnnotationRequest
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok && response.evidenceAnnotations?.length) {
          setAnnotationMap(new Map(response.evidenceAnnotations.map((a) => [a.commentId, a])));
        } else {
          lastAnnotationRequestKey.current = null;
        }
      })
      .catch(() => {
        if (!cancelled) {
          lastAnnotationRequestKey.current = null;
        }
      });

    return () => { cancelled = true; };
  }, [evidenceAnnotationRequest]);

  const ageA = postA ? getPostAge(postA) : null;
  const ageB = postB ? getPostAge(postB) : null;
  const visibleCompareBrief = compareBrief ?? fallbackCompareBrief;
  const heroSummary = visibleCompareBrief
    ? buildHeroSummary(visibleCompareBrief, leftClusterSurfaces[0] || null, rightClusterSurfaces[0] || null)
    : null;
  const compareBriefSurface: CompareBriefSurfaceState = {
    compareBriefState,
    showAlertRail: false,
    alerts: []
  };
  const firstLeftCluster = leftClusterSurfaces[0] || null;
  const firstRightCluster = rightClusterSurfaces[0] || null;
  const selectedClusterKeyA = selectedClusterA?.key ?? firstLeftCluster?.key ?? null;
  const selectedClusterKeyB = selectedClusterB?.key ?? firstRightCluster?.key ?? null;
  const selectedClusterSurfaceA = leftClusterSurfaces.find((surface) => surface.key === selectedClusterKeyA) || null;
  const selectedClusterSurfaceB = rightClusterSurfaces.find((surface) => surface.key === selectedClusterKeyB) || null;
  const relatedClusterA = selectedClusterSurfaceA ? findRelatedCluster(selectedClusterSurfaceA, rightClusterSurfaces) : null;
  const relatedClusterB = selectedClusterSurfaceB ? findRelatedCluster(selectedClusterSurfaceB, leftClusterSurfaces) : null;
  const selectedClusterDetailA = selectedClusterDetailFromSurface(
    selectedClusterSurfaceA,
    relatedClusterA,
    authorStanceSummary(postA, selectedClusterSurfaceA?.title || "主題未定", "A")
  );
  const selectedClusterDetailB = selectedClusterDetailFromSurface(
    selectedClusterSurfaceB,
    relatedClusterB,
    authorStanceSummary(postB, selectedClusterSurfaceB?.title || "主題未定", "B")
  );

  useEffect(() => {
    if (!leftClusterSurfaces.length) {
      if (selectedClusterA !== null) setSelectedClusterA(null);
      return;
    }
    if (selectedClusterA && leftClusterSurfaces.some((surface) => surface.key === selectedClusterA.key)) return;
    setSelectedClusterA({ key: leftClusterSurfaces[0]!.key });
  }, [selectedClusterA, leftClusterSurfaces]);

  useEffect(() => {
    if (!rightClusterSurfaces.length) {
      if (selectedClusterB !== null) setSelectedClusterB(null);
      return;
    }
    if (selectedClusterB && rightClusterSurfaces.some((surface) => surface.key === selectedClusterB.key)) return;
    setSelectedClusterB({ key: rightClusterSurfaces[0]!.key });
  }, [selectedClusterB, rightClusterSurfaces]);

  const toggleEvidence = (key: string) => {
    setExpandedEvidenceKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!highlightedClusterPanel) return;
    const timeout = window.setTimeout(() => setHighlightedClusterPanel(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [highlightedClusterPanel]);

  useEffect(() => {
    if (selectedDetailSide === "A") {
      detailPageRefA.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      return;
    }
    detailPageRefB.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, [selectedDetailSide]);

  const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const selectClusterAndFocus = (side: "A" | "B", key: string) => {
    if (side === "A") {
      setSelectedClusterA({ key });
      setSelectedDetailSide("A");
      setComparePage("compare");
      setTechniqueSide("A");
      setTechniqueSaveState("idle");
      setHighlightedClusterPanel("A");
      window.requestAnimationFrame(() => {
        detailPageRefA.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        detailRefA.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    setComparePage("compare");
    setTechniqueSide("B");
    setTechniqueSaveState("idle");
    setSelectedDetailSide("B");
    setSelectedClusterB({ key });
    setHighlightedClusterPanel("B");
    window.requestAnimationFrame(() => {
      detailPageRefB.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      detailRefB.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openTechniqueView = (side: "A" | "B") => {
    setTechniqueSide(side);
    setTechniqueSaveState("idle");
    setComparePage("technique");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const jumpBackToCluster = () => {
    const side = techniqueSide;
    setComparePage("compare");
    setTechniqueSaveState("idle");
    setSupportExpanded(true);
    if (side === "A") {
      setHighlightedClusterPanel("A");
      scrollToRef(clusterMapRefA);
      return;
    }
    setHighlightedClusterPanel("B");
    scrollToRef(clusterMapRefB);
  };

  const currentTechniqueItem = techniqueSide === "A" ? itemA : itemB;
  const currentTechniqueDetail = techniqueSide === "A" ? selectedClusterDetailA : selectedClusterDetailB;

  const saveTechniqueReading = async () => {
    if (!currentTechniqueItem || !currentTechniqueDetail) {
      return;
    }
    setTechniqueSaveState("saving");
    try {
      const snapshot = buildTechniqueReadingSnapshot({
        sessionId: session.id,
        itemId: currentTechniqueItem.id,
        side: techniqueSide,
        clusterKey: compareSelectionKey(currentTechniqueDetail.captureId, currentTechniqueDetail.clusterKey),
        detail: currentTechniqueDetail
      });
      const response = await sendExtensionMessage<{ ok: true } | { ok: false; error: string }>({
        type: "compare/save-technique-reading",
        snapshot
      });
      setTechniqueSaveState(response.ok ? "saved" : "error");
    } catch {
      setTechniqueSaveState("error");
    }
  };

  if (readyItems.length < 2) {
    return <CompareUnavailableBridge session={session} onGoToLibrary={onGoToLibrary} />;
  }

  if (comparePage === "technique") {
    return (
      <TechniqueView
        sideLabel={techniqueSide}
        detail={currentTechniqueDetail}
        onBack={() => setComparePage("compare")}
        onSave={() => void saveTechniqueReading()}
        onJumpToCluster={jumpBackToCluster}
        saveState={techniqueSaveState}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0, overflowX: "hidden" }}>
      {fromTopicId && fromTopicName ? (
        <button
          type="button"
          onClick={() => onReturnToTopic?.()}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: T.sub,
            fontSize: 11,
            fontWeight: 700
          }}
        >
          <span>案例本</span>
          <span style={{ color: T.soft }}>›</span>
          <span>{fromTopicName}</span>
          <span style={{ color: T.soft }}>›</span>
          <span>成對檢視</span>
        </button>
      ) : null}

      {!hideSelector ? (
        <CompareSelectorStrip
          readyItems={readyItems}
          session={session}
          selectedA={selectedA}
          selectedB={selectedB}
          onChangeA={setSelectedA}
          onChangeB={setSelectedB}
        />
      ) : null}

      {!aiProviderConfigured && settings.oneLinerProvider ? (
        <div style={{ fontSize: 11, color: T.sub, background: tokens.color.neutralSurfaceSoft, border: `1px solid ${T.line}`, borderRadius: TOKENS.pillRadius, padding: "8px 10px" }}>
          AI summaries are off. Add a Google, OpenAI, or Claude key in Settings to enable them.
        </div>
      ) : null}

      <ResultReadingBody
        heroSummary={heroSummary}
        brief={visibleCompareBrief}
        postA={postA}
        postB={postB}
        leftSummaries={leftClusterSummaries}
        rightSummaries={rightClusterSummaries}
        leftSurfaces={leftClusterSurfaces}
        rightSurfaces={rightClusterSurfaces}
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedCommentCountA}
        capturedB={capturedCommentCountB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
        compareBriefState={compareBriefSurface.compareBriefState}
        onOpenTechnique={openTechniqueView}
        annotationMap={annotationMap}
      />

      {activeResultId && topics.length ? (
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: "12px 14px",
            borderRadius: tokens.radius.card,
            border: `1px solid ${T.line}`,
            background: tokens.color.surface
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>附加至案例</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={attachTopicId}
              onChange={(event) => setAttachTopicId(event.target.value)}
              style={{
                minWidth: 160,
                borderRadius: 10,
                border: `1px solid ${T.line}`,
                padding: "8px 10px",
                background: tokens.color.elevated,
                color: T.ink
              }}
            >
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
            <PrimaryButton
              onClick={() => attachTopicId && onAttachToTopic?.(attachTopicId)}
              disabled={!attachTopicId || attachedTopicIds.includes(attachTopicId)}
            >
              {attachTopicId && attachedTopicIds.includes(attachTopicId) ? "✓ 已附加" : "附加至案例"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
