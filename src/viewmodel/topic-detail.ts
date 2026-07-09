import type { EvidencePacket, LensMemo, ReactionCoverage, ReactionPattern, SignalReading, TopicAuditStageName } from "../compare/topic-audit.ts";
import { buildTopicEvidencePackets } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import { projectCapturedPost, projectCapturedPostFromSources, type CapturedPostProjection } from "../state/captured-post.ts";
import type { LoadState } from "../state/load-state.ts";
import {
  getItemReadinessStatus,
  type BackendWorkUiState,
  type ItemReadinessStatus,
  type WorkerStatus
} from "../state/processing-state.ts";
import type { TopicAuditMemoBundle } from "../state/topic-audit-storage.ts";
import type {
  FolderMode,
  SavedAnalysisSnapshot,
  SessionItem,
  Signal,
  SignalTagsRecord,
  Topic,
  TopicSignalReading,
  TopicSynthesisLayout
} from "../state/types.ts";

export type TopicItemAnalysisState = ItemReadinessStatus | "queued";

export type TopicDetailCommand =
  | { kind: "back"; target: { sessionId: string; topicId: string } }
  | { kind: "openPair"; target: { sessionId: string; topicId: string; resultId: string } }
  | { kind: "updateTopic"; target: { sessionId: string; topicId: string }; patch: Partial<Topic> }
  | { kind: "analyzeItems"; target: { sessionId: string; topicId: string; itemIds: string[] } }
  | { kind: "analyzeItem"; target: { sessionId: string; topicId: string; signalId: string; itemId: string } }
  | { kind: "queueItem"; target: { sessionId: string; topicId: string; itemId: string } }
  | { kind: "queueSignalItem"; target: { sessionId: string; topicId: string; signalId: string; itemId: string } }
  | { kind: "startProcessing"; target: { sessionId: string; topicId: string } }
  | { kind: "openAnalysis"; target: { sessionId: string; topicId: string; resultId: string } }
  | { kind: "openSignalAnalysis"; target: { sessionId: string; topicId: string; signalId: string; itemId: string; resultId: string } }
  | { kind: "addToCompare"; target: { sessionId: string; topicId: string; itemId: string } }
  | { kind: "addSignalToCompare"; target: { sessionId: string; topicId: string; signalId: string; itemId: string } }
  | {
      kind: "saveJudgmentOverride";
      target: { sessionId: string; topicId: string; resultId: string };
      patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" };
    }
  | { kind: "generateSynthesis"; target: { sessionId: string; topicId: string } }
  | { kind: "generateSignalReading"; target: { sessionId: string; topicId: string; signalId: string } }
  | { kind: "deleteSignal"; target: { sessionId: string; topicId: string; signalId: string } }
  | { kind: "runAudit"; target: { sessionId: string; topicId: string }; fromStage?: TopicAuditStageName }
  | { kind: "runAuditP1"; target: { sessionId: string; topicId: string; signalId: string } }
  | { kind: "openAuditReport"; target: { sessionId: string; topicId: string }; stale?: boolean };

export type TopicSignalAction = Extract<
  TopicDetailCommand,
  | { kind: "analyzeItem" }
  | { kind: "queueSignalItem" }
  | { kind: "openSignalAnalysis" }
  | { kind: "addSignalToCompare" }
  | { kind: "generateSignalReading" }
  | { kind: "deleteSignal" }
>;

export interface TopicDetailCapabilities {
  analyzeItems?: boolean;
  queueItem?: boolean;
  startProcessing?: boolean;
  openAnalysis?: boolean;
  addToCompare?: boolean;
  saveJudgmentOverride?: boolean;
  generateSynthesis?: boolean;
  generateSignalReading?: boolean;
  deleteSignal?: boolean;
  runAudit?: boolean;
  runAuditP1?: boolean;
  openAuditReport?: boolean;
}

export interface SignalTagSummary {
  tag: string;
  count: number;
}

export type TopicAuditReportStatus = "none" | "running" | "ready" | "failed" | "stale";

export interface TopicAuditViewSummary {
  reportStatus: TopicAuditReportStatus;
  analyzedCount: number;
  queuedCount: number;
  runningStage?: number;
  failedStage?: number;
  failedReason?: string;
  staleDelta?: { added: number; removed: number };
  generatedAt?: string;
  coverage?: string;
  flags?: TopicAuditValidationFlag[];
}

export interface TopicAuditNarrativeLaneHint {
  id: string;
  label: string;
  signalRefs: string[];
  consensus: number;
  icon?: string;
}

export type TopicAuditSourceReadingStatus = "ready" | "running" | "failed" | "pending" | "not_ready";

export interface TopicSourcePreview extends CapturedPostProjection {
  displayText: string;
  displayUrl: string;
}

export interface TopicSignalViewModel {
  signalId: string;
  sessionId: string;
  topicId: string;
  itemId: string | null;
  source: Signal["source"];
  capturedAt: string;
  sourcePreview: TopicSourcePreview;
  analysisState?: TopicItemAnalysisState;
  isReady: boolean;
  isProcessing: boolean;
  resultId?: string;
  tagRecord?: SignalTagsRecord;
  reading?: TopicSignalReading;
  actions: TopicSignalAction[];
}

export interface TopicAuditSourceViewModel {
  packet: EvidencePacket;
  readingStatus: TopicAuditSourceReadingStatus;
  tags?: string[];
  isRunningP1: boolean;
  reading?: SignalReading;
  actions: TopicDetailCommand[];
}

export interface TopicAuditViewModel {
  evidence: EvidencePacket[];
  sourceRows: TopicAuditSourceViewModel[];
  summary: TopicAuditViewSummary;
  validatorFlags: TopicAuditValidationFlag[];
  sourceTotal: number;
  p1ReadyCount: number;
  p1TotalCount: number;
  p1AllReady: boolean;
  themes: string[];
  lanes: TopicAuditNarrativeLaneHint[];
  reactionCoverage?: ReactionCoverage;
  reactionPatterns: ReactionPattern[];
  canRunAudit: boolean;
  blockedReason?: string;
}

export interface TopicAnalysisCounts {
  total: number;
  ready: number;
  saved: number;
  queued: number;
  crawling: number;
  analyzing: number;
  failed: number;
  missing: number;
  processing: number;
}

export interface TopicDetailViewModel {
  topic: Topic;
  sessionId: string;
  sessionMode: FolderMode;
  loadState: LoadState;
  synthLayout: TopicSynthesisLayout;
  pairs: SavedAnalysisSnapshot[];
  primaryJudgmentPair: SavedAnalysisSnapshot | null;
  signals: TopicSignalViewModel[];
  signalRows: TopicSignalViewModel[];
  /**
   * EvidencePacket per crawled signal, derived locally (no AI) so the per-post
   * drawer (OP 原文 + 留言 + 證據) is reachable right after the first crawl,
   * before the topic audit runs. Keyed by signalId; only crawled signals appear.
   */
  packetsBySignalId: Record<string, EvidencePacket>;
  analysisCounts: TopicAnalysisCounts;
  sourcePendingCount: number;
  unanalyzedItemIds: string[];
  signalTagSummaries: SignalTagSummary[];
  taggedSignalCount: number;
  audit: TopicAuditViewModel;
  workerStatus: WorkerStatus | null;
  backendWorkUiState: BackendWorkUiState | null;
  isBulkAnalyzing: boolean;
  isStartingProcessing: boolean;
  actions: TopicDetailCommand[];
}

export interface BuildTopicDetailViewModelInput {
  topic: Topic;
  signals: Signal[];
  pairs: SavedAnalysisSnapshot[];
  loadState?: LoadState;
  sessionMode?: FolderMode;
  sessionItems?: SessionItem[];
  savedAnalyses?: SavedAnalysisSnapshot[];
  signalReadingsBySignalId?: Record<string, TopicSignalReading>;
  signalTagsByItemId?: Record<string, SignalTagsRecord>;
  synthLayout?: TopicSynthesisLayout;
  auditEvidence?: EvidencePacket[];
  auditMemos?: TopicAuditMemoBundle | null;
  auditSummary?: TopicAuditViewSummary;
  auditValidatorFlags?: TopicAuditValidationFlag[];
  p1RunningSignalIds?: ReadonlyArray<string>;
  p1ErrorBySignalId?: Record<string, string>;
  optimisticQueuedItemIds?: ReadonlyArray<string>;
  isBulkAnalyzing?: boolean;
  isStartingProcessing?: boolean;
  workerStatus?: WorkerStatus | null;
  backendWorkUiState?: BackendWorkUiState | null;
  capabilities?: TopicDetailCapabilities;
}

function safeArray<T>(value: T[] | readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

function defaultCapabilities(input?: TopicDetailCapabilities): Required<TopicDetailCapabilities> {
  return {
    analyzeItems: input?.analyzeItems ?? true,
    queueItem: input?.queueItem ?? true,
    startProcessing: input?.startProcessing ?? true,
    openAnalysis: input?.openAnalysis ?? true,
    addToCompare: input?.addToCompare ?? true,
    saveJudgmentOverride: input?.saveJudgmentOverride ?? true,
    generateSynthesis: input?.generateSynthesis ?? true,
    generateSignalReading: input?.generateSignalReading ?? true,
    deleteSignal: input?.deleteSignal ?? true,
    runAudit: input?.runAudit ?? true,
    runAuditP1: input?.runAuditP1 ?? true,
    openAuditReport: input?.openAuditReport ?? true
  };
}

function itemById(items: SessionItem[]): Map<string, SessionItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function resultIdByItemId(savedAnalyses: SavedAnalysisSnapshot[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const analysis of savedAnalyses) {
    if (!map.has(analysis.itemAId)) map.set(analysis.itemAId, analysis.resultId);
    if (!map.has(analysis.itemBId)) map.set(analysis.itemBId, analysis.resultId);
  }
  return map;
}

function getTopicItemAnalysisState(
  item: SessionItem | undefined,
  optimisticQueuedSet?: Set<string>
): TopicItemAnalysisState | undefined {
  if (!item) return undefined;
  if (optimisticQueuedSet?.has(item.id) && (item.status === "saved" || item.status === "failed")) return "queued";
  if (item.status === "queued") return "queued";
  return getItemReadinessStatus(item);
}

function buildSignalTagSummaries(
  rows: TopicSignalViewModel[]
): SignalTagSummary[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const row of rows) {
    const record = row.tagRecord;
    if (!record || record.status !== "complete") continue;
    const seenInSignal = new Set<string>();
    for (const tag of record.signalTags) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized || seenInSignal.has(normalized)) continue;
      seenInSignal.add(normalized);
      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(normalized, { tag, count: 1 });
      }
    }
  }
  return [...counts.values()].sort((left, right) =>
    right.count - left.count
    || left.tag.localeCompare(right.tag)
  );
}

function pickPrimaryJudgmentPair(pairs: SavedAnalysisSnapshot[]): SavedAnalysisSnapshot | null {
  if (!pairs.length) {
    return null;
  }
  return [...pairs].sort((left, right) => {
    const relevanceDelta = (right.judgmentResult?.relevance ?? 0) - (left.judgmentResult?.relevance ?? 0);
    if (relevanceDelta !== 0) {
      return relevanceDelta;
    }
    return Date.parse(right.savedAt) - Date.parse(left.savedAt);
  })[0] ?? null;
}

function buildSourcePreview(item: SessionItem | undefined): TopicSourcePreview {
  const projection = item ? projectCapturedPost(item) : projectCapturedPostFromSources({});
  return {
    ...projection,
    displayText: projection.text || "",
    displayUrl: projection.sourceUrl || ""
  };
}

function buildSignalActions({
  row,
  capabilities
}: {
  row: Omit<TopicSignalViewModel, "actions">;
  capabilities: Required<TopicDetailCapabilities>;
}): TopicSignalAction[] {
  const target = {
    sessionId: row.sessionId,
    topicId: row.topicId,
    signalId: row.signalId
  };
  const actions: TopicSignalAction[] = [];
  if (row.itemId && !row.isProcessing) {
    if (row.isReady) {
      if (row.resultId && capabilities.openAnalysis) {
        actions.push({ kind: "openSignalAnalysis", target: { ...target, itemId: row.itemId, resultId: row.resultId } });
      }
      if (capabilities.addToCompare) {
        actions.push({ kind: "addSignalToCompare", target: { ...target, itemId: row.itemId } });
      }
      if (capabilities.generateSignalReading) {
        actions.push({ kind: "generateSignalReading", target });
      }
    } else if (capabilities.analyzeItems) {
      actions.push({ kind: "analyzeItem", target: { ...target, itemId: row.itemId } });
    } else if (capabilities.queueItem) {
      actions.push({ kind: "queueSignalItem", target: { ...target, itemId: row.itemId } });
    }
  }
  if (capabilities.deleteSignal) {
    actions.push({ kind: "deleteSignal", target });
  }
  return actions;
}

function buildSignalRows({
  topic,
  signals,
  sessionItems,
  savedAnalyses,
  signalReadingsBySignalId,
  signalTagsByItemId,
  optimisticQueuedSet,
  capabilities
}: {
  topic: Topic;
  signals: Signal[];
  sessionItems: SessionItem[];
  savedAnalyses: SavedAnalysisSnapshot[];
  signalReadingsBySignalId: Record<string, TopicSignalReading>;
  signalTagsByItemId: Record<string, SignalTagsRecord>;
  optimisticQueuedSet: Set<string>;
  capabilities: Required<TopicDetailCapabilities>;
}): TopicSignalViewModel[] {
  const items = itemById(sessionItems);
  const resultIds = resultIdByItemId(savedAnalyses);
  return signals.map((signal) => {
    const item = signal.itemId ? items.get(signal.itemId) : undefined;
    const analysisState = getTopicItemAnalysisState(item, optimisticQueuedSet);
    const rowWithoutActions: Omit<TopicSignalViewModel, "actions"> = {
      signalId: signal.id,
      sessionId: signal.sessionId || topic.sessionId,
      topicId: topic.id,
      itemId: signal.itemId ?? null,
      source: signal.source,
      capturedAt: signal.capturedAt,
      sourcePreview: buildSourcePreview(item),
      analysisState,
      isReady: analysisState === "ready",
      isProcessing: analysisState === "queued" || analysisState === "crawling" || analysisState === "analyzing",
      ...(item ? { resultId: resultIds.get(item.id) } : {}),
      ...(signal.itemId && signalTagsByItemId[signal.itemId] ? { tagRecord: signalTagsByItemId[signal.itemId] } : {}),
      ...(signalReadingsBySignalId[signal.id] ? { reading: signalReadingsBySignalId[signal.id] } : {})
    };
    return {
      ...rowWithoutActions,
      actions: buildSignalActions({ row: rowWithoutActions, capabilities })
    };
  });
}

function buildAnalysisCounts(rows: TopicSignalViewModel[]): TopicAnalysisCounts {
  const counts: TopicAnalysisCounts = {
    total: rows.length,
    ready: 0,
    saved: 0,
    queued: 0,
    crawling: 0,
    analyzing: 0,
    failed: 0,
    missing: 0,
    processing: 0
  };
  for (const row of rows) {
    switch (row.analysisState) {
      case "ready":
        counts.ready += 1;
        break;
      case "saved":
        counts.saved += 1;
        break;
      case "queued":
        counts.queued += 1;
        counts.processing += 1;
        break;
      case "crawling":
        counts.crawling += 1;
        counts.processing += 1;
        break;
      case "analyzing":
        counts.analyzing += 1;
        counts.processing += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      default:
        counts.missing += 1;
    }
  }
  return counts;
}

type AuditDisplayHints = {
  themeChips?: string[];
  narrativeLanes?: TopicAuditNarrativeLaneHint[];
  reactionCoverage?: ReactionCoverage;
  reactionPatterns?: ReactionPattern[];
};

function readAuditDisplayHints(memos: LensMemo[]): AuditDisplayHints {
  const merged: AuditDisplayHints = {};
  for (const memo of memos) {
    const hints = memo.displayHints as AuditDisplayHints | undefined;
    if (!hints) continue;
    if (!merged.themeChips && hints.themeChips?.length) {
      merged.themeChips = hints.themeChips;
    }
    if (!merged.narrativeLanes && hints.narrativeLanes?.length) {
      merged.narrativeLanes = hints.narrativeLanes;
    }
    if (!merged.reactionCoverage && hints.reactionCoverage) {
      merged.reactionCoverage = hints.reactionCoverage;
    }
    if (!merged.reactionPatterns && hints.reactionPatterns?.length) {
      merged.reactionPatterns = hints.reactionPatterns;
    }
  }
  return merged;
}

function topicAuditSourceTotal({
  signalCount,
  auditEvidence,
  auditMemos,
  auditSummary
}: {
  signalCount: number;
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditViewSummary;
}): number {
  if (auditEvidence.length > 0) {
    return auditEvidence.length;
  }
  if (auditMemos?.signalReadings.length) {
    return auditMemos.signalReadings.length;
  }
  if (auditSummary) {
    return auditSummary.analyzedCount + auditSummary.queuedCount;
  }
  return signalCount;
}

function topicAuditAnalyzedCount({
  auditEvidence,
  auditMemos,
  auditSummary
}: {
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditViewSummary;
}): number {
  if (auditEvidence.length > 0) {
    const readSignalIds = new Set((auditMemos?.signalReadings ?? []).map((reading) => reading.signalId));
    return auditEvidence.filter((packet) => readSignalIds.has(packet.signalId)).length;
  }
  if (auditMemos?.signalReadings.length) {
    return auditMemos.signalReadings.length;
  }
  return auditSummary?.analyzedCount ?? 0;
}

function topicAuditCoverageLabel({
  auditEvidence,
  auditSummary,
  sourceTotal
}: {
  auditEvidence: EvidencePacket[];
  auditSummary?: TopicAuditViewSummary;
  sourceTotal: number;
}): string | undefined {
  if (auditEvidence.length > 0) {
    return `${auditEvidence.length}/${sourceTotal}`;
  }
  return auditSummary?.coverage;
}

function buildTopicAuditSummary({
  signalCount,
  auditEvidence,
  auditMemos,
  auditSummary
}: {
  signalCount: number;
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditViewSummary;
}): TopicAuditViewSummary {
  const sourceTotal = topicAuditSourceTotal({ signalCount, auditEvidence, auditMemos, auditSummary });
  const analyzedCount = topicAuditAnalyzedCount({ auditEvidence, auditMemos, auditSummary });
  if (auditSummary) {
    return {
      ...auditSummary,
      analyzedCount,
      queuedCount: sourceTotal - analyzedCount,
      coverage: topicAuditCoverageLabel({ auditEvidence, auditSummary, sourceTotal })
    };
  }
  return {
    reportStatus: auditMemos ? "ready" : "none",
    analyzedCount,
    queuedCount: sourceTotal - analyzedCount,
    coverage: topicAuditCoverageLabel({ auditEvidence, auditSummary, sourceTotal }),
    flags: []
  };
}

function readingStatusFor({
  packet,
  p1RunningSet,
  readSignalIdsSet,
  p1ErrorBySignalId
}: {
  packet: EvidencePacket;
  p1RunningSet: Set<string>;
  readSignalIdsSet: Set<string>;
  p1ErrorBySignalId: Record<string, string>;
}): TopicAuditSourceReadingStatus {
  if (p1RunningSet.has(packet.signalId)) return "running";
  if (readSignalIdsSet.has(packet.signalId)) return "ready";
  if (p1ErrorBySignalId[packet.signalId]) return "failed";
  if (packet.status !== "succeeded") return "not_ready";
  return "pending";
}

function buildAuditSourceRows({
  topic,
  auditEvidence,
  auditMemos,
  signalTagsByItemId,
  p1RunningSet,
  p1ErrorBySignalId,
  capabilities
}: {
  topic: Topic;
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  signalTagsByItemId: Record<string, SignalTagsRecord>;
  p1RunningSet: Set<string>;
  p1ErrorBySignalId: Record<string, string>;
  capabilities: Required<TopicDetailCapabilities>;
}): TopicAuditSourceViewModel[] {
  const readingsBySignalId = new Map((auditMemos?.signalReadings ?? []).map((reading) => [reading.signalId, reading]));
  const readSignalIdsSet = new Set(readingsBySignalId.keys());
  return auditEvidence.map((packet) => {
    const target = { sessionId: topic.sessionId, topicId: topic.id, signalId: packet.signalId };
    return {
      packet,
      readingStatus: readingStatusFor({ packet, p1RunningSet, readSignalIdsSet, p1ErrorBySignalId }),
      tags: packet.itemId ? signalTagsByItemId[packet.itemId]?.signalTags : undefined,
      isRunningP1: p1RunningSet.has(packet.signalId),
      reading: readingsBySignalId.get(packet.signalId),
      actions: capabilities.runAuditP1 ? [{ kind: "runAuditP1", target }] : []
    };
  });
}

function buildAuditViewModel({
  topic,
  signalRows,
  auditEvidence,
  auditMemos,
  auditSummary,
  auditValidatorFlags,
  signalTagsByItemId,
  p1RunningSet,
  p1ErrorBySignalId,
  analysisCounts,
  capabilities
}: {
  topic: Topic;
  signalRows: TopicSignalViewModel[];
  auditEvidence: EvidencePacket[];
  auditMemos: TopicAuditMemoBundle | null | undefined;
  auditSummary?: TopicAuditViewSummary;
  auditValidatorFlags: TopicAuditValidationFlag[];
  signalTagsByItemId: Record<string, SignalTagsRecord>;
  p1RunningSet: Set<string>;
  p1ErrorBySignalId: Record<string, string>;
  analysisCounts: TopicAnalysisCounts;
  capabilities: Required<TopicDetailCapabilities>;
}): TopicAuditViewModel {
  const sourceTotal = topicAuditSourceTotal({
    signalCount: signalRows.length,
    auditEvidence,
    auditMemos,
    auditSummary
  });
  const summary = buildTopicAuditSummary({
    signalCount: signalRows.length,
    auditEvidence,
    auditMemos,
    auditSummary
  });
  const hints = readAuditDisplayHints(auditMemos?.lensMemos ?? []);
  const sourceRows = buildAuditSourceRows({
    topic,
    auditEvidence,
    auditMemos,
    signalTagsByItemId,
    p1RunningSet,
    p1ErrorBySignalId,
    capabilities
  });
  const p1ReadyCount = sourceRows.filter((row) => row.readingStatus === "ready").length;
  const canRunAudit = capabilities.runAudit && (analysisCounts.ready > 0 || auditEvidence.length > 0);
  return {
    evidence: auditEvidence,
    sourceRows,
    summary,
    validatorFlags: auditValidatorFlags,
    sourceTotal,
    p1ReadyCount,
    p1TotalCount: auditEvidence.length,
    p1AllReady: auditEvidence.length > 0 && p1ReadyCount === auditEvidence.length,
    themes: hints.themeChips ?? [],
    lanes: hints.narrativeLanes ?? [],
    reactionCoverage: hints.reactionCoverage,
    reactionPatterns: hints.reactionPatterns ?? [],
    canRunAudit,
    blockedReason: canRunAudit
      ? undefined
      : "先爬取至少 1 篇貼文，審查報告才有可讀內容；目前不會用空資料硬生成。"
  };
}

function buildWorkspaceActions({
  topic,
  unanalyzedItemIds,
  audit,
  capabilities
}: {
  topic: Topic;
  unanalyzedItemIds: string[];
  audit: TopicAuditViewModel;
  capabilities: Required<TopicDetailCapabilities>;
}): TopicDetailCommand[] {
  const target = { sessionId: topic.sessionId, topicId: topic.id };
  const actions: TopicDetailCommand[] = [
    { kind: "back", target }
  ];
  if (unanalyzedItemIds.length > 0 && capabilities.analyzeItems) {
    actions.push({ kind: "analyzeItems", target: { ...target, itemIds: unanalyzedItemIds } });
  }
  if (capabilities.startProcessing) {
    actions.push({ kind: "startProcessing", target });
  }
  if (capabilities.generateSynthesis) {
    actions.push({ kind: "generateSynthesis", target });
  }
  if (audit.canRunAudit) {
    actions.push({ kind: "runAudit", target });
  }
  if (capabilities.openAuditReport) {
    actions.push({ kind: "openAuditReport", target });
  }
  return actions;
}

export function buildTopicDetailViewModel({
  topic,
  signals,
  pairs,
  loadState = "ready",
  sessionMode = "topic",
  sessionItems = [],
  savedAnalyses = [],
  signalReadingsBySignalId = {},
  signalTagsByItemId = {},
  synthLayout = "console",
  auditEvidence = [],
  auditMemos = null,
  auditSummary,
  auditValidatorFlags = [],
  p1RunningSignalIds = [],
  p1ErrorBySignalId = {},
  optimisticQueuedItemIds = [],
  isBulkAnalyzing = false,
  isStartingProcessing = false,
  workerStatus = null,
  backendWorkUiState = null,
  capabilities
}: BuildTopicDetailViewModelInput): TopicDetailViewModel {
  const resolvedCapabilities = defaultCapabilities(capabilities);
  const optimisticQueuedSet = new Set(optimisticQueuedItemIds);
  const signalRows = buildSignalRows({
    topic,
    signals: safeArray(signals),
    sessionItems: safeArray(sessionItems),
    savedAnalyses: safeArray(savedAnalyses),
    signalReadingsBySignalId,
    signalTagsByItemId,
    optimisticQueuedSet,
    capabilities: resolvedCapabilities
  });
  const packetsBySignalId: Record<string, EvidencePacket> = {};
  for (const packet of buildTopicEvidencePackets({
    topic,
    signals: safeArray(signals),
    items: safeArray(sessionItems),
    signalTagsByItemId
  })) {
    packetsBySignalId[packet.signalId] = packet;
  }
  const analysisCounts = buildAnalysisCounts(signalRows);
  const unanalyzedItemIds = signalRows
    .filter((row) => row.itemId && (row.analysisState === "saved" || row.analysisState === "failed"))
    .map((row) => row.itemId!);
  const p1RunningSet = new Set(p1RunningSignalIds);
  const audit = buildAuditViewModel({
    topic,
    signalRows,
    auditEvidence: safeArray(auditEvidence),
    auditMemos,
    auditSummary,
    auditValidatorFlags: safeArray(auditValidatorFlags),
    signalTagsByItemId,
    p1RunningSet,
    p1ErrorBySignalId,
    analysisCounts,
    capabilities: resolvedCapabilities
  });
  return {
    topic,
    sessionId: topic.sessionId,
    sessionMode,
    loadState,
    synthLayout,
    pairs: safeArray(pairs),
    primaryJudgmentPair: pickPrimaryJudgmentPair(safeArray(pairs)),
    signals: signalRows,
    signalRows,
    packetsBySignalId,
    analysisCounts,
    sourcePendingCount: analysisCounts.saved + analysisCounts.failed + analysisCounts.missing,
    unanalyzedItemIds,
    signalTagSummaries: buildSignalTagSummaries(signalRows),
    taggedSignalCount: signalRows.filter((row) => row.tagRecord?.status === "complete").length,
    audit,
    workerStatus,
    backendWorkUiState,
    isBulkAnalyzing,
    isStartingProcessing,
    actions: buildWorkspaceActions({
      topic,
      unanalyzedItemIds,
      audit,
      capabilities: resolvedCapabilities
    })
  };
}
