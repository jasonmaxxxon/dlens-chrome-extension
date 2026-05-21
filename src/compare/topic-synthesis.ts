import type {
  Signal,
  SessionItem,
  TopicSynthesis,
  TopicSynthesisCluster,
  TopicSynthesisMeme,
  TopicSynthesisObservation,
  TopicSynthesisOutlier
} from "../state/types.ts";
import { readItemSynthesisText } from "./synthesis-text.ts";

export const TOPIC_SYNTHESIS_VERSION = "v3.generic-keyword-lens";

/**
 * Minimum analyzed signals before a partial synthesis is allowed.
 * Below this threshold callers should keep the empty/locked state.
 */
export const TOPIC_SYNTHESIS_MIN_ANALYZED = 2;

/**
 * Threshold for considering a synthesis "stale" because more posts have been analyzed
 * since the last run. Coverage delta ≥ this triggers a "可更新" affordance.
 */
export const TOPIC_SYNTHESIS_STALE_DELTA = 3;

const MAX_OBSERVATIONS = 6;
const MAX_CLUSTERS = 8;
const MAX_MEMES = 6;
const MAX_OUTLIERS = 3;

export interface TopicSynthesisInputSignal {
  signal: Signal;
  item: SessionItem | undefined;
}

export interface TopicSynthesisInput {
  totalSignalCount: number;
  signals: TopicSynthesisInputSignal[];
  authorBySignalId?: Record<string, string>;
  generatedAt?: string;
}

interface AnalyzedSignalRow {
  signalId: string;
  author: string;
  text: string;
  clusters: Array<{
    keywords: string[];
    sizeShare: number;
    likeShare: number;
  }>;
  topKeyword: string;
  topSizeShare: number;
  topLikeShare: number;
}

interface KeywordGroup {
  keyword: string;
  signalIds: string[];
  totalSizeShare: number;
  totalLikeShare: number;
}

function pickAnalyzed(input: TopicSynthesisInput): AnalyzedSignalRow[] {
  const rows: AnalyzedSignalRow[] = [];
  for (const entry of input.signals) {
    const analysis = entry.item?.latestCapture?.analysis;
    if (!analysis || analysis.status !== "succeeded") continue;

    const clusters = (analysis.clusters || [])
      .map((cluster) => ({
        keywords: (cluster.keywords || []).map((keyword) => keyword.trim()).filter(Boolean),
        sizeShare: typeof cluster.size_share === "number" ? cluster.size_share : 0,
        likeShare: typeof cluster.like_share === "number" ? cluster.like_share : 0
      }))
      .filter((cluster) => cluster.keywords.length > 0);

    if (clusters.length === 0) continue;

    const sorted = [...clusters].sort((left, right) => right.sizeShare - left.sizeShare);
    const top = sorted[0]!;
    const author = (input.authorBySignalId?.[entry.signal.id]
      || entry.item?.descriptor?.author_hint
      || "unknown").trim() || "unknown";

    rows.push({
      signalId: entry.signal.id,
      author,
      text: readItemSynthesisText(entry.item),
      clusters: sorted,
      topKeyword: top.keywords[0] ?? "",
      topSizeShare: top.sizeShare,
      topLikeShare: top.likeShare
    });
  }
  return rows;
}

function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/\s+/g, " ").trim();
}

function sortedKeywordGroups(groups: Iterable<KeywordGroup>): KeywordGroup[] {
  return [...groups].sort((left, right) =>
    right.signalIds.length - left.signalIds.length
    || right.totalSizeShare - left.totalSizeShare
    || right.totalLikeShare - left.totalLikeShare
    || left.keyword.localeCompare(right.keyword));
}

function buildTopKeywordGroups(rows: AnalyzedSignalRow[]): KeywordGroup[] {
  const groups = new Map<string, KeywordGroup>();
  for (const row of rows) {
    const normalized = normalizeKeyword(row.topKeyword);
    if (!normalized) continue;
    const existing = groups.get(normalized);
    if (existing) {
      existing.signalIds.push(row.signalId);
      existing.totalSizeShare += row.topSizeShare;
      existing.totalLikeShare += row.topLikeShare;
      continue;
    }
    groups.set(normalized, {
      keyword: row.topKeyword,
      signalIds: [row.signalId],
      totalSizeShare: row.topSizeShare,
      totalLikeShare: row.topLikeShare
    });
  }
  return sortedKeywordGroups(groups.values());
}

function buildClusters(rows: AnalyzedSignalRow[]): TopicSynthesisCluster[] {
  return buildTopKeywordGroups(rows)
    .slice(0, MAX_CLUSTERS)
    .map((group) => ({
      keyword: group.keyword,
      signalCount: group.signalIds.length,
      exampleSignalIds: group.signalIds.slice(0, 4)
    }));
}

function buildObservations(rows: AnalyzedSignalRow[]): TopicSynthesisObservation[] {
  const groups = buildTopKeywordGroups(rows);
  const repeated = groups.filter((group) => group.signalIds.length > 1);
  const selected = repeated.length > 0 ? repeated : groups;
  return selected
    .slice(0, MAX_OBSERVATIONS)
    .map((group) => ({
      text: `「${group.keyword}」在 ${group.signalIds.length} 篇貼文中出現。`,
      evidenceSignalIds: group.signalIds.slice(0, 5)
    }));
}

function buildMemes(rows: AnalyzedSignalRow[]): TopicSynthesisMeme[] {
  const counts = new Map<string, { phrase: string; signalIds: Set<string> }>();
  for (const row of rows) {
    const seenInSignal = new Set<string>();
    for (const keyword of row.clusters.flatMap((cluster) => cluster.keywords)) {
      const normalized = normalizeKeyword(keyword);
      if (!normalized || seenInSignal.has(normalized)) continue;
      seenInSignal.add(normalized);
      const existing = counts.get(normalized);
      if (existing) {
        existing.signalIds.add(row.signalId);
      } else {
        counts.set(normalized, { phrase: keyword, signalIds: new Set([row.signalId]) });
      }
    }
  }
  return [...counts.values()]
    .filter((entry) => entry.signalIds.size > 1)
    .sort((left, right) =>
      right.signalIds.size - left.signalIds.size
      || left.phrase.localeCompare(right.phrase))
    .slice(0, MAX_MEMES)
    .map((entry) => ({ phrase: entry.phrase, occurrences: entry.signalIds.size }));
}

function buildOutliers(rows: AnalyzedSignalRow[]): TopicSynthesisOutlier[] {
  if (rows.length === 0) return [];
  const repeatedSignalIds = new Set(
    buildTopKeywordGroups(rows)
      .filter((group) => group.signalIds.length > 1)
      .flatMap((group) => group.signalIds)
  );
  return rows
    .filter((row) => !repeatedSignalIds.has(row.signalId))
    .slice(0, MAX_OUTLIERS)
    .map((row) => ({
      signalId: row.signalId,
      reason: `@${row.author} 的主要關鍵詞「${row.topKeyword || "未命名"}」暫時沒有和主要重複錨點合流，先保留為相鄰材料。`
    }));
}

export function canGenerateTopicSynthesis(input: TopicSynthesisInput): boolean {
  return pickAnalyzed(input).length >= TOPIC_SYNTHESIS_MIN_ANALYZED;
}

export function generateTopicSynthesis(input: TopicSynthesisInput): TopicSynthesis | null {
  const rows = pickAnalyzed(input);
  if (rows.length < TOPIC_SYNTHESIS_MIN_ANALYZED) return null;

  const clusters = buildClusters(rows);
  return {
    observations: buildObservations(rows),
    commonClusters: clusters,
    verbalTechniques: [],
    memes: buildMemes(rows),
    sentimentNarrative: "",
    outliers: buildOutliers(rows),
    generatedFromCount: rows.length,
    totalSignalCount: input.totalSignalCount,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generator: "deterministic",
    generatorVersion: TOPIC_SYNTHESIS_VERSION
  };
}

export function topicSynthesisStaleReason(
  synthesis: TopicSynthesis | null | undefined,
  currentAnalyzedCount: number
): "fresh" | "stale" | "absent" {
  if (!synthesis) return "absent";
  const delta = currentAnalyzedCount - synthesis.generatedFromCount;
  return Math.abs(delta) >= TOPIC_SYNTHESIS_STALE_DELTA ? "stale" : "fresh";
}
