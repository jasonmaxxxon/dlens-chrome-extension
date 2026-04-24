import type { CrawlResultSnapshot } from "../contracts/ingest.ts";
import { buildClusterSummaries } from "../analysis/cluster-summary.ts";
import type { CompareBriefRequest } from "./brief.ts";
import type { SessionItem } from "../state/types.ts";

const METRIC_KEYS = ["likes", "comments", "reposts", "forwards", "views"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

interface PostData {
  author?: string;
  text?: string;
  url?: string;
  metrics?: Record<string, unknown>;
  metricPresent?: Record<MetricKey, boolean>;
  postedAt?: string | null;
  timeTokenHint?: string | null;
}

function getResult(item: SessionItem): CrawlResultSnapshot | null {
  return item.latestCapture?.result ?? null;
}

function getAnalysis(item: SessionItem) {
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

function metricValue(post: PostData, key: MetricKey): number | null {
  const raw = post.metrics?.[key];
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string") {
    const numeric = Number.parseFloat(raw);
    return Number.isNaN(numeric) ? null : numeric;
  }
  return null;
}

function metricCaptured(post: PostData, key: MetricKey): boolean {
  return post.metricPresent?.[key] ?? metricValue(post, key) !== null;
}

function parseTimeTokenToHours(token: string | null | undefined): number | null {
  if (!token) {
    return null;
  }
  const trimmed = token.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(mo|m|h|d|w|y)$/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1] || "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = match[2]?.toLowerCase();
  switch (unit) {
    case "m":
      return value / 60;
    case "h":
      return value;
    case "d":
      return value * 24;
    case "w":
      return value * 24 * 7;
    case "mo":
      return value * 24 * 30;
    case "y":
      return value * 24 * 365;
    default:
      return null;
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
  if (capturedCount === 0) {
    return "Not captured";
  }
  if (capturedCount < METRIC_KEYS.length) {
    return "Partial metrics only";
  }
  return "All core metrics captured";
}

function getVelocityMetricValue(post: PostData, key: Exclude<MetricKey, "views">): number | null {
  if (!metricCaptured(post, key)) {
    return null;
  }
  const value = metricValue(post, key);
  if (value === null) {
    return null;
  }
  const age = getPostAge(post);
  if (age.hours === null) {
    return null;
  }
  return value / Math.max(age.hours, 1 / 60);
}

export function buildCompareBriefRequest(left: SessionItem, right: SessionItem): CompareBriefRequest | null {
  const leftAnalysis = getAnalysis(left);
  const rightAnalysis = getAnalysis(right);
  if (!left.captureId || !right.captureId || !leftAnalysis || !rightAnalysis) {
    return null;
  }

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
        likesPerHour: getVelocityMetricValue(leftPost, "likes"),
        commentsPerHour: getVelocityMetricValue(leftPost, "comments"),
        repostsPerHour: getVelocityMetricValue(leftPost, "reposts"),
        forwardsPerHour: getVelocityMetricValue(leftPost, "forwards")
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
        likesPerHour: getVelocityMetricValue(rightPost, "likes"),
        commentsPerHour: getVelocityMetricValue(rightPost, "comments"),
        repostsPerHour: getVelocityMetricValue(rightPost, "reposts"),
        forwardsPerHour: getVelocityMetricValue(rightPost, "forwards")
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
