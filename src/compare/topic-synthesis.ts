import type {
  Signal,
  SessionItem,
  TopicSynthesis,
  TopicSynthesisCluster,
  TopicSynthesisMeme,
  TopicSynthesisObservation,
  TopicSynthesisOutlier
} from "../state/types.ts";
import {
  buildWorkNarrative,
  buildWorkTechniqueLabels,
  collectWorkSignalHits,
  extractRepeatedWorkPhrases,
  readItemSynthesisText,
  type WorkSignalRow
} from "./work-signal-lens.ts";

export const TOPIC_SYNTHESIS_VERSION = "v2.work-signal-lens";

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

function toWorkRows(rows: AnalyzedSignalRow[]): WorkSignalRow[] {
  return rows.map((row) => ({
    signalId: row.signalId,
    author: row.author,
    text: row.text,
    keywords: Array.from(new Set(row.clusters.flatMap((cluster) => cluster.keywords)))
  }));
}

function buildClusters(rows: AnalyzedSignalRow[]): TopicSynthesisCluster[] {
  const workRows = toWorkRows(rows);
  return collectWorkSignalHits(workRows)
    .slice(0, MAX_CLUSTERS)
    .map((hit) => ({
      keyword: hit.bucket.label,
      signalCount: hit.signalIds.length,
      exampleSignalIds: hit.signalIds.slice(0, 4)
    }));
}

function buildObservations(rows: AnalyzedSignalRow[]): TopicSynthesisObservation[] {
  return collectWorkSignalHits(toWorkRows(rows))
    .slice(0, MAX_OBSERVATIONS)
    .map((hit) => ({
      text: hit.bucket.observation(hit.signalIds.length),
      evidenceSignalIds: hit.signalIds.slice(0, 5)
    }));
}

function buildMemes(rows: AnalyzedSignalRow[]): TopicSynthesisMeme[] {
  return extractRepeatedWorkPhrases(toWorkRows(rows), MAX_MEMES)
    .slice(0, MAX_MEMES)
    .map((phrase) => phrase);
}

function buildSentimentNarrative(rows: AnalyzedSignalRow[]): string {
  return buildWorkNarrative(toWorkRows(rows), collectWorkSignalHits(toWorkRows(rows)));
}

function buildOutliers(rows: AnalyzedSignalRow[], clusters: TopicSynthesisCluster[]): TopicSynthesisOutlier[] {
  if (rows.length === 0) return [];
  const classifiedIds = new Set(clusters.flatMap((cluster) => cluster.exampleSignalIds));
  return rows
    .filter((row) => !classifiedIds.has(row.signalId))
    .slice(0, MAX_OUTLIERS)
    .map((row) => ({
      signalId: row.signalId,
      reason: `@${row.author} 暫時未貼合工作/焦慮/辭職主線，較像相鄰材料。`
    }));
}

export function canGenerateTopicSynthesis(input: TopicSynthesisInput): boolean {
  return pickAnalyzed(input).length >= TOPIC_SYNTHESIS_MIN_ANALYZED;
}

export function generateTopicSynthesis(input: TopicSynthesisInput): TopicSynthesis | null {
  const rows = pickAnalyzed(input);
  if (rows.length < TOPIC_SYNTHESIS_MIN_ANALYZED) return null;

  const clusters = buildClusters(rows);
  const hits = collectWorkSignalHits(toWorkRows(rows));
  return {
    observations: buildObservations(rows),
    commonClusters: clusters,
    verbalTechniques: buildWorkTechniqueLabels(hits),
    memes: buildMemes(rows),
    sentimentNarrative: buildSentimentNarrative(rows),
    outliers: buildOutliers(rows, clusters),
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
