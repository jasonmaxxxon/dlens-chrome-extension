import { useEffect, useMemo, useState } from "react";
import type {
  AnalysisSnapshot,
  CrawlResultSnapshot
} from "../contracts/ingest";
import type { ExtensionSettings, SessionItem, SessionRecord } from "../state/types";
import { getItemReadinessStatus, pickCompareSelection, type ItemReadinessStatus } from "../state/processing-state";
import { sendExtensionMessage } from "./controller";
import {
  buildDeterministicCompareBrief,
  type CompareBrief,
  type CompareBriefRequest
} from "../compare/brief.ts";
import { TOKENS, tokens } from "./tokens";
import {
  buildDeterministicClusterInterpretation,
  type CompareClusterSummaryRequest,
  clusterInterpretationKey,
  pickClusterExampleEvidence,
  type ClusterInterpretation
} from "../compare/cluster-interpretation.ts";
import { buildClusterCompareRows, buildClusterSummaries, getDominanceLabel } from "../analysis/cluster-summary.ts";
import type { ClusterCompareRow as ClusterCompareRowData, ClusterSummaryCard } from "../analysis/types.ts";
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

interface CompareViewProps {
  session: SessionRecord;
  settings: ExtensionSettings;
}

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
    return {
      author: typeof canonical.author === "string" ? canonical.author : item.descriptor.author_hint || undefined,
      text: typeof canonical.text === "string" ? canonical.text : item.descriptor.text_snippet || undefined,
      url: typeof canonical.url === "string" ? canonical.url : item.descriptor.post_url || undefined,
      metrics: (canonical.metrics as Record<string, unknown> | undefined) || (item.descriptor.engagement as unknown as Record<string, unknown>),
      metricPresent: item.descriptor.engagement_present,
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
  return {
    nClusters: typeof metrics.n_clusters === "number" ? metrics.n_clusters : null,
    dominance: typeof metrics.dominance_ratio_top1 === "number" ? metrics.dominance_ratio_top1 : null,
    gini: typeof metrics.gini_like_share === "number" ? metrics.gini_like_share : null
  };
}

function buildCompareBriefRequest(left: SessionItem, right: SessionItem): CompareBriefRequest | null {
  const leftAnalysis = getAnalysis(left);
  const rightAnalysis = getAnalysis(right);
  if (!left.captureId || !right.captureId || !leftAnalysis || !rightAnalysis) return null;
  const leftPost = getPost(left);
  const rightPost = getPost(right);
  const leftSummaries = buildClusterSummaries(leftAnalysis, 3, 5, left.captureId);
  const rightSummaries = buildClusterSummaries(rightAnalysis, 3, 5, right.captureId);
  const leftAge = getPostAge(leftPost);
  const rightAge = getPostAge(rightPost);

  return {
    left: {
      captureId: left.captureId,
      analysisUpdatedAt: leftAnalysis.updated_at || "",
      author: leftPost.author || "unknown",
      text: leftPost.text || "",
      ageLabel: leftAge.label,
      metricsCoverageLabel: getMetricsCoverageLabel(leftPost),
      sourceCommentCount: leftAnalysis.source_comment_count ?? 0,
      engagement: {
        likes: metricValue(leftPost, "likes"),
        comments: metricValue(leftPost, "comments"),
        reposts: metricValue(leftPost, "reposts"),
        forwards: metricValue(leftPost, "forwards"),
        views: metricValue(leftPost, "views")
      },
      velocity: {
        likesPerHour: getVelocityMetricDisplay(leftPost, "likes").numeric,
        commentsPerHour: getVelocityMetricDisplay(leftPost, "comments").numeric,
        repostsPerHour: getVelocityMetricDisplay(leftPost, "reposts").numeric,
        forwardsPerHour: getVelocityMetricDisplay(leftPost, "forwards").numeric
      },
      clusters: leftSummaries.map((summary) => ({
        clusterKey: summary.cluster.cluster_key,
        keywords: summary.cluster.keywords,
        sizeShare: summary.cluster.size_share,
        likeShare: summary.cluster.like_share,
        evidenceCandidates: summary.evidence.slice(0, 5)
      }))
    },
    right: {
      captureId: right.captureId,
      analysisUpdatedAt: rightAnalysis.updated_at || "",
      author: rightPost.author || "unknown",
      text: rightPost.text || "",
      ageLabel: rightAge.label,
      metricsCoverageLabel: getMetricsCoverageLabel(rightPost),
      sourceCommentCount: rightAnalysis.source_comment_count ?? 0,
      engagement: {
        likes: metricValue(rightPost, "likes"),
        comments: metricValue(rightPost, "comments"),
        reposts: metricValue(rightPost, "reposts"),
        forwards: metricValue(rightPost, "forwards"),
        views: metricValue(rightPost, "views")
      },
      velocity: {
        likesPerHour: getVelocityMetricDisplay(rightPost, "likes").numeric,
        commentsPerHour: getVelocityMetricDisplay(rightPost, "comments").numeric,
        repostsPerHour: getVelocityMetricDisplay(rightPost, "reposts").numeric,
        forwardsPerHour: getVelocityMetricDisplay(rightPost, "forwards").numeric
      },
      clusters: rightSummaries.map((summary) => ({
        clusterKey: summary.cluster.cluster_key,
        keywords: summary.cluster.keywords,
        sizeShare: summary.cluster.size_share,
        likeShare: summary.cluster.like_share,
        evidenceCandidates: summary.evidence.slice(0, 5)
      }))
    }
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

function buildCompareBriefEvidenceMap(request: CompareBriefRequest | null) {
  const evidenceMap = new Map<string, { side: "left" | "right"; text: string; reasonBase: string }>();
  if (!request) {
    return evidenceMap;
  }

  for (const [side, sideRequest] of [["left", request.left], ["right", request.right]] as const) {
    for (const cluster of sideRequest.clusters) {
      const label = cluster.keywords.filter(Boolean).slice(0, 3).join(" / ") || "主題未定";
      for (const evidence of cluster.evidenceCandidates) {
        evidenceMap.set(`${sideRequest.captureId}:${cluster.clusterKey}:${evidence.comment_id}`, {
          side,
          text: evidence.text,
          reasonBase: label
        });
      }
    }
  }

  return evidenceMap;
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
    <div style={{ fontSize: 11, fontWeight: 800, color: color || T.soft, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
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
    <div style={{ padding: "12px 14px", borderRadius: 14, background: color, border: `1.5px solid ${borderColor}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 6 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.soft, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginLeft: 8 }}>@{post.author || "unknown"}</span>
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
        {commentCount > 0 ? `${commentCount} comments crawled` : "No comments"}
      </div>
    </div>
  );
}

/* ── Engagement metric row with delta ── */

function MetricRow({ label, left, right }: { label: string; left: MetricDisplay; right: MetricDisplay }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 4, padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "capitalize" as const }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 12, fontWeight: left.emphasized ? 800 : 700, color: left.emphasized ? diffColor(left.numeric, right.numeric) : T.soft }}>
          {left.text}
        </span>
      </div>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 12, fontWeight: right.emphasized ? 800 : 700, color: right.emphasized ? diffColor(right.numeric, left.numeric) : T.soft }}>
          {right.text}
        </span>
      </div>
    </div>
  );
}

/* ── Cluster comparison card (full-width, A vs B side by side) ── */

function ClusterCompareRow({
  row,
  interpretations,
  leftCommentLookup,
  rightCommentLookup,
  summaryState
}: {
  row: ClusterCompareRowData;
  interpretations: Map<string, ClusterInterpretation>;
  leftCommentLookup: Map<string, CommentData>;
  rightCommentLookup: Map<string, CommentData>;
  summaryState: "idle" | "loading" | "ready" | "error";
}) {
  const left = row.left;
  const right = row.right;
  const leftInterpretation = left ? interpretations.get(clusterInterpretationKey(left.captureId, left.cluster.cluster_key)) : null;
  const rightInterpretation = right ? interpretations.get(clusterInterpretationKey(right.captureId, right.cluster.cluster_key)) : null;
  const leftFallback = left ? buildDeterministicClusterInterpretation(left.cluster) : null;
  const rightFallback = right ? buildDeterministicClusterInterpretation(right.cluster) : null;
  const leftExamples = left
    ? pickClusterExampleEvidence(left.evidence, leftInterpretation?.evidenceIds, 2).map((comment) => mergeEvidenceDetails(comment, leftCommentLookup))
    : [];
  const rightExamples = right
    ? pickClusterExampleEvidence(right.evidence, rightInterpretation?.evidenceIds, 2).map((comment) => mergeEvidenceDetails(comment, rightCommentLookup))
    : [];

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${T.line}`, background: "#fff", overflow: "hidden" }}>
      <div style={{
        padding: "8px 12px", background: T.bg, borderBottom: `1px solid ${T.line}`,
        display: "flex", justifyContent: "center", gap: 6, alignItems: "center"
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.sub }}>Cluster #{row.rank}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* Left: Post A cluster */}
        <div style={{ padding: 10, borderRight: `1px solid ${T.line}`, minWidth: 0 }}>
          {left ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, alignItems: "baseline" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>
                  {Math.round(left.cluster.size_share * 100)}% / {Math.round(left.cluster.like_share * 100)}% likes
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>
                {left.cluster.keywords.join(", ")}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.ink }}>
                {(leftInterpretation || leftFallback)?.label}
              </div>
              <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.45 }}>
                {(leftInterpretation || leftFallback)?.oneLiner}
                {summaryState === "loading" ? " Updating with AI summary..." : ""}
              </div>
              {leftExamples.map((c) => (
                <div key={c.comment_id} style={{
                  fontSize: 11, color: T.sub, background: T.accentSoft, borderRadius: 8,
                  padding: "6px 8px", lineHeight: 1.45,
                  display: "grid", gap: 6
                }}>
                  <div style={{
                    display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 3, overflow: "hidden"
                  }}>
                    {c.text}
                  </div>
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 700, color: T.accent }}>Evidence details</summary>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, color: T.sub }}>
                      <span>Likes {c.like_count ?? 0}</span>
                      <span>Comments {c.reply_count ?? 0}</span>
                      <span>Reposts {c.repost_count ?? 0}</span>
                      <span>Forwards {c.forward_count ?? 0}</span>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: T.soft, fontStyle: "italic" }}>No matching cluster</div>
          )}
        </div>
        {/* Right: Post B cluster */}
        <div style={{ padding: 10, minWidth: 0 }}>
          {right ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, alignItems: "baseline" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.warn }}>
                  {Math.round(right.cluster.size_share * 100)}% / {Math.round(right.cluster.like_share * 100)}% likes
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>
                {right.cluster.keywords.join(", ")}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.ink }}>
                {(rightInterpretation || rightFallback)?.label}
              </div>
              <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.45 }}>
                {(rightInterpretation || rightFallback)?.oneLiner}
                {summaryState === "loading" ? " Updating with AI summary..." : ""}
              </div>
              {rightExamples.map((c) => (
                <div key={c.comment_id} style={{
                  fontSize: 11, color: T.sub, background: T.warnSoft, borderRadius: 8,
                  padding: "6px 8px", lineHeight: 1.45,
                  display: "grid", gap: 6
                }}>
                  <div style={{
                    display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 3, overflow: "hidden"
                  }}>
                    {c.text}
                  </div>
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 700, color: T.warn }}>Evidence details</summary>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, color: T.sub }}>
                      <span>Likes {c.like_count ?? 0}</span>
                      <span>Comments {c.reply_count ?? 0}</span>
                      <span>Reposts {c.repost_count ?? 0}</span>
                      <span>Forwards {c.forward_count ?? 0}</span>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: T.soft, fontStyle: "italic" }}>No matching cluster</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Analysis summary strip ── */

function AnalysisSummaryStrip({ label, analysis, color }: { label: string; analysis: AnalysisSnapshot | null; color: string }) {
  const m = analysisMetrics(analysis);
  if (!analysis) return null;
  return (
    <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.5 }}>
      <span style={{ fontWeight: 800, color }}>{label}</span>{" "}
      {m.nClusters ?? "—"} clusters
      {m.dominance != null ? ` · ${getDominanceLabel(m.dominance)}(${(m.dominance * 100).toFixed(0)}%)` : ""}
      {" · "}{analysis.source_comment_count ?? "?"} comments
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
          padding: "7px 10px", borderRadius: 10, background: bgColor, fontSize: 11, lineHeight: 1.45
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, color: T.ink }}>@{comment.author || "anon"}</span>
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

/* ── Readiness Board (unchanged) ── */

function ReadinessBoard({ session }: { session: SessionRecord }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ padding: 16, borderRadius: 16, background: "#fff", border: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 6 }}>Waiting for 2 ready posts</div>
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6 }}>
          Compare unlocks after two posts finish crawl and deterministic analysis. You can keep this tab open while the worker drains.
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {session.items.map((item, index) => {
          const readiness = getItemReadinessStatus(item);
          const tone = statusTone(readiness);
          return (
            <div key={item.id} style={{ padding: 14, borderRadius: 16, background: "#fff", border: `1px solid ${T.line}`, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{itemLabel(item, index)}</div>
                  <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>{item.descriptor.text_snippet || "No preview text"}</div>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: tone.background, color: tone.color, fontSize: 11, fontWeight: 800 }}>
                  {statusLabel(readiness)}
                </span>
              </div>
              {(readiness === "crawling" || readiness === "analyzing") ? (
                <div style={{ fontSize: 12, color: T.sub }}>{statusLabel(readiness)} for {formatElapsed(elapsedAnchor(item, readiness))}</div>
              ) : null}
              {readiness === "failed" && item.lastError ? <div style={{ fontSize: 12, color: T.fail }}>{item.lastError}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main CompareView ── */

export function CompareView({ session, settings }: CompareViewProps) {
  const readyItems = useMemo(
    () => session.items.filter((item) => getItemReadinessStatus(item) === "ready"),
    [session.items]
  );
  const initialSelection = useMemo(() => pickCompareSelection(session.items, "", ""), [session.items]);
  const [selectedA, setSelectedA] = useState(initialSelection.selectedA);
  const [selectedB, setSelectedB] = useState(initialSelection.selectedB);
  const [compareBrief, setCompareBrief] = useState<CompareBrief | null>(null);
  const [compareBriefState, setCompareBriefState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [clusterInterpretations, setClusterInterpretations] = useState<Map<string, ClusterInterpretation>>(new Map());
  const [clusterSummaryState, setClusterSummaryState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const nextSelection = pickCompareSelection(session.items, selectedA, selectedB);
    if (nextSelection.selectedA !== selectedA) setSelectedA(nextSelection.selectedA);
    if (nextSelection.selectedB !== selectedB) setSelectedB(nextSelection.selectedB);
  }, [session.items, selectedA, selectedB]);

  const itemA = readyItems.find((item) => item.id === selectedA) || null;
  const itemB = readyItems.find((item) => item.id === selectedB && item.id !== selectedA) || null;

  const postA = itemA ? getPost(itemA) : null;
  const postB = itemB ? getPost(itemB) : null;
  const commentsA = itemA ? getComments(itemA) : [];
  const commentsB = itemB ? getComments(itemB) : [];
  const analysisA = itemA ? getAnalysis(itemA) : null;
  const analysisB = itemB ? getAnalysis(itemB) : null;
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
  const compareBriefEvidenceMap = useMemo(
    () => buildCompareBriefEvidenceMap(compareBriefRequest),
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

  if (readyItems.length < 2) {
    return <ReadinessBoard session={session} />;
  }

  const clusterRows = buildClusterCompareRows(analysisA, analysisB, 5);
  const ageA = postA ? getPostAge(postA) : null;
  const ageB = postB ? getPostAge(postB) : null;
  const showAiSummaryCard = aiProviderConfigured;
  const visibleCompareBrief = compareBrief ?? fallbackCompareBrief;

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* ① Selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", gap: 8, alignItems: "center" }}>
        <select
          value={selectedA}
          onChange={(e) => setSelectedA(e.target.value)}
          style={{ borderRadius: 10, border: `1.5px solid ${T.accentBorder}`, padding: "8px 10px", fontSize: 12, fontWeight: 700, background: T.accentSoft }}
        >
          {readyItems.filter((item) => item.id !== selectedB).map((item) => (
            <option key={item.id} value={item.id}>
              {itemLabel(item, session.items.findIndex((c) => c.id === item.id))}
            </option>
          ))}
        </select>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: T.soft }}>vs</div>
        <select
          value={selectedB}
          onChange={(e) => setSelectedB(e.target.value)}
          style={{ borderRadius: 10, border: `1.5px solid ${T.warnBorder}`, padding: "8px 10px", fontSize: 12, fontWeight: 700, background: T.warnSoft }}
        >
          {readyItems.filter((item) => item.id !== selectedA).map((item) => (
            <option key={item.id} value={item.id}>
              {itemLabel(item, session.items.findIndex((c) => c.id === item.id))}
            </option>
          ))}
        </select>
      </div>

      {/* ② Post headers (compact, side by side) */}
      {postA && postB ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <PostHeader post={postA} label="Post A" color={T.accentSoft} borderColor={T.accentBorder} commentCount={commentsA.length} />
          <PostHeader post={postB} label="Post B" color={T.warnSoft} borderColor={T.warnBorder} commentCount={commentsB.length} />
        </div>
      ) : null}

      {!aiProviderConfigured && settings.oneLinerProvider ? (
        <div style={{ fontSize: 11, color: T.sub, background: tokens.color.neutralSurfaceSoft, border: `1px solid ${T.line}`, borderRadius: TOKENS.pillRadius, padding: "8px 10px" }}>
          AI summaries are off. Add a Google, OpenAI, or Claude key in Settings to enable them.
        </div>
      ) : null}

      {/* ③ Compare brief */}
      {showAiSummaryCard ? (
        <div style={{ padding: "12px 14px", borderRadius: 14, background: "#fff", border: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <SectionLabel>Compare Brief</SectionLabel>
            {compareBriefState === "loading" ? (
              <div style={{ fontSize: 11, color: T.running, fontWeight: 700 }}>Updating with AI...</div>
            ) : compareBriefState === "fallback" ? (
              <div style={{ fontSize: 11, color: T.warn, fontWeight: 700 }}>Deterministic fallback</div>
            ) : compareBriefState === "ready" ? (
              <div style={{ fontSize: 11, color: T.success, fontWeight: 700 }}>AI brief ready</div>
            ) : null}
          </div>
          {visibleCompareBrief ? (
            <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, lineHeight: 1.6 }}>{visibleCompareBrief.headline}</div>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <SectionLabel color={T.ink}>Claim contrast</SectionLabel>
                  <div style={{ marginTop: 4, fontSize: 12, color: T.sub, lineHeight: 1.55 }}>{visibleCompareBrief.claimContrast}</div>
                </div>
                <div>
                  <SectionLabel color={T.ink}>Emotion contrast</SectionLabel>
                  <div style={{ marginTop: 4, fontSize: 12, color: T.sub, lineHeight: 1.55 }}>{visibleCompareBrief.emotionContrast}</div>
                </div>
                <div>
                  <SectionLabel color={T.ink}>Risk signals</SectionLabel>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {visibleCompareBrief.riskSignals.map((signal, index) => (
                      <div key={`${signal.label}-${index}`} style={{ borderRadius: 10, border: `1px solid ${T.line}`, background: T.bg, padding: "8px 10px" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: T.ink }}>{signal.label}</div>
                        <div style={{ marginTop: 3, fontSize: 11, color: T.sub, lineHeight: 1.5 }}>{signal.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel color={T.ink}>Representative evidence</SectionLabel>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {visibleCompareBrief.representativeEvidence.map((item) => {
                      const detail = compareBriefEvidenceMap.get(`${item.captureId}:${item.clusterKey}:${item.commentId}`);
                      return (
                        <div key={`${item.captureId}:${item.clusterKey}:${item.commentId}`} style={{ borderRadius: 10, border: `1px solid ${T.line}`, padding: "8px 10px", background: item.side === "left" ? T.accentSoft : T.warnSoft }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: T.ink }}>{item.side === "left" ? "Post A" : "Post B"}</div>
                            <div style={{ fontSize: 10, color: T.soft }}>Cluster {item.clusterKey}</div>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: T.sub, lineHeight: 1.5 }}>{item.reason}</div>
                          <div style={{ marginTop: 6, fontSize: 11, color: T.ink, lineHeight: 1.5 }}>
                            “{detail?.text || item.commentId}”
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: T.soft, lineHeight: 1.5 }}>
                {visibleCompareBrief.notes} Confidence: {visibleCompareBrief.confidence}.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12, color: T.sub }}>Waiting for analysis to complete...</div>
          )}
        </div>
      ) : null}

      {/* ④ Cluster comparison (CORE section) */}
      {(analysisA || analysisB) ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SectionLabel color={T.ink}>Audience Clusters</SectionLabel>
            {clusterSummaryState === "loading" ? (
              <div style={{ fontSize: 11, fontWeight: 700, color: T.running, background: T.runningSoft, borderRadius: 999, padding: "4px 8px" }}>
                Generating AI cluster summaries...
              </div>
            ) : clusterSummaryState === "error" ? (
              <div style={{ fontSize: 11, fontWeight: 700, color: T.warn, background: T.warnSoft, borderRadius: 999, padding: "4px 8px" }}>
                AI fallback active
              </div>
            ) : null}
          </div>

          {/* Analysis summary strip */}
          <div style={{ padding: "8px 12px", borderRadius: 10, background: T.bg, display: "grid", gap: 2 }}>
            <AnalysisSummaryStrip label="A:" analysis={analysisA} color={T.accent} />
            <AnalysisSummaryStrip label="B:" analysis={analysisB} color={T.warn} />
          </div>

          {/* Cluster rows, ranked by size */}
          {clusterRows.map((row) => (
            <ClusterCompareRow
              key={row.rank}
              row={row}
              interpretations={clusterInterpretations}
              leftCommentLookup={commentLookupA}
              rightCommentLookup={commentLookupB}
              summaryState={clusterSummaryState}
            />
          ))}
        </div>
      ) : null}

      {/* ⑤ Engagement compare */}
      <div style={{ padding: "12px 14px", borderRadius: 14, background: "#fff", border: `1px solid ${T.line}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 4, marginBottom: 6 }}>
          <SectionLabel>Engagement Compare</SectionLabel>
          <div style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: T.accent }}>POST A</div>
          <div style={{ textAlign: "right", fontSize: 10, fontWeight: 700, color: T.warn }}>POST B</div>
        </div>
        {postA && postB ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 4, paddingBottom: 8, borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.sub }}>Age</span>
              <div style={{ textAlign: "right", display: "grid", gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{ageA?.label}</span>
                <span style={{ fontSize: 10, color: T.soft }}>{getMetricsCoverageLabel(postA)}</span>
              </div>
              <div style={{ textAlign: "right", display: "grid", gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{ageB?.label}</span>
                <span style={{ fontSize: 10, color: T.soft }}>{getMetricsCoverageLabel(postB)}</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 2 }}>
              <SectionLabel color={T.ink}>Raw engagement</SectionLabel>
              {METRIC_KEYS.map((key) => (
                <MetricRow
                  key={`raw-${key}`}
                  label={key}
                  left={getRawMetricDisplay(postA, key)}
                  right={getRawMetricDisplay(postB, key)}
                />
              ))}
            </div>

            <div style={{ display: "grid", gap: 2 }}>
              <SectionLabel color={T.ink}>Age-adjusted velocity</SectionLabel>
              {(["likes", "comments", "reposts", "forwards"] as const).map((key) => (
                <MetricRow
                  key={`velocity-${key}`}
                  label={`${key}/hr`}
                  left={getVelocityMetricDisplay(postA, key)}
                  right={getVelocityMetricDisplay(postB, key)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ⑥ Top comments (collapsed by default) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <TopComments comments={commentsA} label="A Comments" bgColor={T.accentSoft} />
        <TopComments comments={commentsB} label="B Comments" bgColor={T.warnSoft} />
      </div>
    </div>
  );
}
