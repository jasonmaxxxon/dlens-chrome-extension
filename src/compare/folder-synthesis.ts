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
import { deriveDerivedRecordStaleness } from "../state/derived-record.ts";

export const FOLDER_SYNTHESIS_VERSION = "v3.generic-keyword-lens";
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
  signalId: string;
  topKeyword: string;
  topSizeShare: number;
  keywords: string[];
}

interface KeywordGroup {
  keyword: string;
  signalIds: string[];
  topicIds: string[];
  totalSizeShare: number;
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

      rows.push({
        topicId: entry.topic.id,
        signalId: signal.id,
        topKeyword: top.keywords[0] ?? "",
        topSizeShare: top.sizeShare,
        keywords: allKeywords
      });
    }
  }
  return rows;
}

function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildKeywordGroups(rows: AnalyzedRow[]): KeywordGroup[] {
  const groups = new Map<string, KeywordGroup>();
  for (const row of rows) {
    const normalized = normalizeKeyword(row.topKeyword);
    if (!normalized) continue;
    const existing = groups.get(normalized);
    if (existing) {
      existing.signalIds.push(row.signalId);
      existing.totalSizeShare += row.topSizeShare;
      if (!existing.topicIds.includes(row.topicId)) {
        existing.topicIds.push(row.topicId);
      }
      continue;
    }
    groups.set(normalized, {
      keyword: row.topKeyword,
      signalIds: [row.signalId],
      topicIds: [row.topicId],
      totalSizeShare: row.topSizeShare
    });
  }
  return [...groups.values()].sort((left, right) =>
    right.topicIds.length - left.topicIds.length
    || right.signalIds.length - left.signalIds.length
    || right.totalSizeShare - left.totalSizeShare
    || left.keyword.localeCompare(right.keyword));
}

function buildClusters(rows: AnalyzedRow[]): FolderSynthesisCluster[] {
  return buildKeywordGroups(rows)
    .filter((group) => group.topicIds.length > 1)
    .slice(0, MAX_CLUSTERS)
    .map((group) => ({
      keyword: group.keyword,
      signalCount: group.signalIds.length,
      topicCount: group.topicIds.length,
      topicIds: group.topicIds
    }));
}

function buildMemes(rows: AnalyzedRow[]): FolderSynthesisMeme[] {
  const counts = new Map<string, { phrase: string; signalIds: Set<string>; topicIds: Set<string> }>();
  for (const row of rows) {
    const seenInSignal = new Set<string>();
    for (const keyword of row.keywords) {
      const normalized = normalizeKeyword(keyword);
      if (!normalized || seenInSignal.has(normalized)) continue;
      seenInSignal.add(normalized);
      const existing = counts.get(normalized);
      if (existing) {
        existing.signalIds.add(row.signalId);
        existing.topicIds.add(row.topicId);
      } else {
        counts.set(normalized, {
          phrase: keyword,
          signalIds: new Set([row.signalId]),
          topicIds: new Set([row.topicId])
        });
      }
    }
  }
  return [...counts.values()]
    .filter((entry) => entry.topicIds.size > 1)
    .sort((left, right) =>
      right.topicIds.size - left.topicIds.size
      || right.signalIds.size - left.signalIds.size
      || left.phrase.localeCompare(right.phrase))
    .slice(0, MAX_MEMES)
    .map((entry) => ({
      phrase: entry.phrase,
      occurrences: entry.signalIds.size,
      topicIds: [...entry.topicIds]
    }));
}

function buildObservations(rows: AnalyzedRow[]): TopicSynthesisObservation[] {
  return buildKeywordGroups(rows)
    .filter((group) => group.topicIds.length > 1)
    .slice(0, MAX_OBSERVATIONS)
    .map((group) => ({
      text: `「${group.keyword}」在 ${group.signalIds.length} 篇貼文中出現，橫跨 ${group.topicIds.length} 個主題。`,
      evidenceSignalIds: group.signalIds.slice(0, 5)
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
    observations: buildObservations(rows),
    commonClusters: clusters,
    memes: buildMemes(rows),
    verbalTechniques: [],
    sentimentNarrative: "",
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
  return deriveDerivedRecordStaleness({
    record: synthesis
      ? {
          generatedAt: synthesis.generatedAt,
          generatorVersion: synthesis.generatorVersion
        }
      : null,
    currentGeneratorVersion: FOLDER_SYNTHESIS_VERSION,
    sourceCount: synthesis?.generatedFromCount,
    currentSourceCount: currentAnalyzedCount,
    sourceDeltaThreshold: FOLDER_SYNTHESIS_STALE_DELTA
  }).state;
}
