import type {
  FolderSynthesis,
  FolderSynthesisCluster,
  FolderSynthesisMeme,
  FolderSynthesisTopicCoverage,
  SessionItem,
  Signal,
  Topic,
  TopicSynthesisObservation
} from "../state/types.ts";
import {
  buildWorkNarrative,
  buildWorkTechniqueLabels,
  collectWorkSignalHits,
  extractRepeatedWorkPhrases,
  readItemSynthesisText,
  type WorkSignalRow
} from "./work-signal-lens.ts";

export const FOLDER_SYNTHESIS_VERSION = "v2.work-signal-lens";
export const FOLDER_SYNTHESIS_MIN_ANALYZED = 3;
export const FOLDER_SYNTHESIS_MIN_TOPICS = 2;
export const FOLDER_SYNTHESIS_STALE_DELTA = 3;

const MAX_OBSERVATIONS = 8;
const MAX_CLUSTERS = 10;
const MAX_MEMES = 8;

export interface FolderSynthesisInputTopic {
  topic: Topic;
  signals: Signal[];
}

export interface FolderSynthesisInput {
  sessionId: string;
  topics: FolderSynthesisInputTopic[];
  itemsById: Map<string, SessionItem>;
  generatedAt?: string;
}

interface AnalyzedRow {
  topicId: string;
  topicName: string;
  signalId: string;
  topKeyword: string;
  topSizeShare: number;
  keywords: string[];
  author: string;
  text: string;
}

function collectRows(input: FolderSynthesisInput): AnalyzedRow[] {
  const rows: AnalyzedRow[] = [];
  for (const entry of input.topics) {
    for (const signal of entry.signals) {
      if (!signal.itemId) continue;
      const item = input.itemsById.get(signal.itemId);
      const analysis = item?.latestCapture?.analysis;
      if (!analysis || analysis.status !== "succeeded") continue;

      const clusters = (analysis.clusters || [])
        .map((cluster) => ({
          keywords: (cluster.keywords || []).map((keyword) => keyword.trim()).filter(Boolean),
          sizeShare: typeof cluster.size_share === "number" ? cluster.size_share : 0
        }))
        .filter((cluster) => cluster.keywords.length > 0);
      if (clusters.length === 0) continue;

      const sorted = [...clusters].sort((left, right) => right.sizeShare - left.sizeShare);
      const top = sorted[0]!;
      const allKeywords = Array.from(new Set(sorted.flatMap((cluster) => cluster.keywords)));
      const author = (item?.descriptor?.author_hint || "unknown").trim() || "unknown";

      rows.push({
        topicId: entry.topic.id,
        topicName: entry.topic.name,
        signalId: signal.id,
        topKeyword: top.keywords[0] ?? "",
        topSizeShare: top.sizeShare,
        keywords: allKeywords,
        author,
        text: readItemSynthesisText(item)
      });
    }
  }
  return rows;
}

function toWorkRows(rows: AnalyzedRow[]): WorkSignalRow[] {
  return rows.map((row) => ({
    signalId: row.signalId,
    author: row.author,
    text: row.text,
    keywords: row.keywords
  }));
}

function buildClusters(rows: AnalyzedRow[]): FolderSynthesisCluster[] {
  const topicIdsBySignalId = new Map(rows.map((row) => [row.signalId, row.topicId]));
  return collectWorkSignalHits(toWorkRows(rows))
    .map((hit) => {
      const topicIds = Array.from(new Set(hit.signalIds.map((signalId) => topicIdsBySignalId.get(signalId)).filter(Boolean))) as string[];
      return {
        keyword: hit.bucket.label,
        signalCount: hit.signalIds.length,
        topicCount: topicIds.length,
        topicIds
      };
    })
    .filter((cluster) => cluster.topicCount > 1)
    .slice(0, MAX_CLUSTERS);
}

function buildMemes(rows: AnalyzedRow[]): FolderSynthesisMeme[] {
  const topicIdsBySignalId = new Map(rows.map((row) => [row.signalId, row.topicId]));
  return extractRepeatedWorkPhrases(toWorkRows(rows), MAX_MEMES).map((phrase) => {
    const lower = phrase.phrase.toLowerCase();
    const topicIds = Array.from(new Set(rows
      .filter((row) => row.text.toLowerCase().includes(lower))
      .map((row) => topicIdsBySignalId.get(row.signalId))
      .filter(Boolean))) as string[];
    return { ...phrase, topicIds };
  });
}

function buildObservations(rows: AnalyzedRow[], clusters: FolderSynthesisCluster[]): TopicSynthesisObservation[] {
  if (rows.length === 0) return [];
  const topicCountByLabel = new Map(clusters.map((cluster) => [cluster.keyword, cluster.topicCount]));
  return collectWorkSignalHits(toWorkRows(rows))
    .slice(0, MAX_OBSERVATIONS)
    .map((hit) => ({
      text: topicCountByLabel.get(hit.bucket.label) && topicCountByLabel.get(hit.bucket.label)! > 1
        ? `${hit.bucket.observation(hit.signalIds.length)} 橫跨 ${topicCountByLabel.get(hit.bucket.label)} 個主題。`
        : hit.bucket.observation(hit.signalIds.length),
      evidenceSignalIds: hit.signalIds.slice(0, 5)
    }));
}

function buildCoverage(input: FolderSynthesisInput, rows: AnalyzedRow[]): FolderSynthesisTopicCoverage[] {
  const analyzedByTopic = new Map<string, number>();
  for (const row of rows) {
    analyzedByTopic.set(row.topicId, (analyzedByTopic.get(row.topicId) ?? 0) + 1);
  }
  return input.topics.map((entry) => ({
    topicId: entry.topic.id,
    topicName: entry.topic.name,
    analyzedCount: analyzedByTopic.get(entry.topic.id) ?? 0,
    totalCount: entry.signals.length
  }));
}

function buildSentimentNarrative(rows: AnalyzedRow[], clusters: FolderSynthesisCluster[], contributingTopics: number): string {
  if (rows.length === 0) return "";
  const base = buildWorkNarrative(toWorkRows(rows), collectWorkSignalHits(toWorkRows(rows)));
  return contributingTopics > 1 ? `${base} 目前橫跨 ${contributingTopics} 個主題。` : base;
}

export interface FolderSynthesisEligibility {
  analyzedCount: number;
  contributingTopicCount: number;
  meetsAnalyzedMin: boolean;
  meetsTopicMin: boolean;
}

export function evaluateFolderSynthesisEligibility(input: FolderSynthesisInput): FolderSynthesisEligibility {
  const rows = collectRows(input);
  const topicSet = new Set(rows.map((row) => row.topicId));
  return {
    analyzedCount: rows.length,
    contributingTopicCount: topicSet.size,
    meetsAnalyzedMin: rows.length >= FOLDER_SYNTHESIS_MIN_ANALYZED,
    meetsTopicMin: topicSet.size >= FOLDER_SYNTHESIS_MIN_TOPICS
  };
}

export function generateFolderSynthesis(input: FolderSynthesisInput): FolderSynthesis | null {
  const rows = collectRows(input);
  const contributingTopics = new Set(rows.map((row) => row.topicId));
  if (rows.length < FOLDER_SYNTHESIS_MIN_ANALYZED) return null;
  if (contributingTopics.size < FOLDER_SYNTHESIS_MIN_TOPICS) return null;

  const clusters = buildClusters(rows);
  const totalSignalCount = input.topics.reduce((acc, entry) => acc + entry.signals.length, 0);

  return {
    sessionId: input.sessionId,
    observations: buildObservations(rows, clusters),
    commonClusters: clusters,
    memes: buildMemes(rows),
    verbalTechniques: buildWorkTechniqueLabels(collectWorkSignalHits(toWorkRows(rows))),
    sentimentNarrative: buildSentimentNarrative(rows, clusters, contributingTopics.size),
    topicCoverage: buildCoverage(input, rows),
    generatedFromCount: rows.length,
    totalSignalCount,
    contributingTopicCount: contributingTopics.size,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generator: "deterministic",
    generatorVersion: FOLDER_SYNTHESIS_VERSION
  };
}

export function folderSynthesisStaleReason(
  synthesis: FolderSynthesis | null | undefined,
  currentAnalyzedCount: number
): "fresh" | "stale" | "absent" {
  if (!synthesis) return "absent";
  return Math.abs(currentAnalyzedCount - synthesis.generatedFromCount) >= FOLDER_SYNTHESIS_STALE_DELTA ? "stale" : "fresh";
}
