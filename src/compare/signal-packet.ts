import type {
  CaptureSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type {
  ExtensionGlobalState,
  FolderMode,
  ProductAgentTaskFeedback,
  ProductAgentTaskSpec,
  ProductContext,
  ProductSignalAnalysis,
  ProductSignalEvidenceGrounding,
  ProductSignalVerdict,
  SessionItem,
  Signal,
  SignalInboxStatus,
  SignalSource,
  Topic,
  TopicStatus
} from "../state/types.ts";
import { loadAllSignals, loadAllTopics, type StorageAreaLike } from "../state/topic-storage.ts";
import { PRODUCT_CONTEXT_STORAGE_KEY } from "./product-context.ts";
import {
  buildProductContextHash,
  buildProductSignalEvidenceCatalogFromCapture,
  type ProductSignalEvidenceEntry
} from "./product-signal-analysis.ts";
import { listProductAgentTaskFeedback } from "./product-agent-task-feedback.ts";
import { listProductSignalAnalyses } from "./product-signal-storage.ts";
import {
  listSignalReadings,
  type SignalReading,
  type SignalReadingFeedbackEvent,
  type SignalReadingReviewState
} from "./signal-reading-storage.ts";
import type { SignalReadingSourcePacket } from "./signal-reading.ts";

export const DLENS_SIGNAL_PACKET_VERSION = "v3";
export const DLENS_SIGNAL_DECISION_TRACE_VERSION = "v1";

export interface DLensSignalImageEvidence {
  ref: string;
  sourceUrl?: string;
  ocrText?: string;
  visualSummary?: string;
  confidence?: number;
}

export interface DLensSignalPacketSource {
  signalId: string;
  source: SignalSource;
  sessionId: string;
  sessionName: string;
  sessionMode: FolderMode | null;
  itemId: string | null;
  itemStatus: SessionItem["status"] | null;
  url: string;
  pageUrl: string;
  author: string;
  textSnippet: string;
  capturedAt: string;
  captureId: string | null;
  canonicalTargetUrl: string | null;
}

export interface DLensSignalReadingBundle {
  latest: SignalReading | null;
  filed: SignalReading[];
  all: SignalReading[];
}

export interface DLensSignalReadingFeedback {
  cacheKey: string;
  reviewState: SignalReadingReviewState;
  generatedAt: string;
  events: SignalReadingFeedbackEvent[];
}

export type DLensSignalFeedbackTimelineEvent =
  | {
      kind: "reading";
      readingCacheKey: string;
      type: SignalReadingFeedbackEvent["type"];
      at: string;
      note?: string;
    }
  | {
      kind: "agent_task";
      taskPromptHash: string;
      feedback: ProductAgentTaskFeedback["feedback"];
      at: string;
      note?: string;
    };

export interface DLensSignalUserFeedback {
  currentReadingState: SignalReadingReviewState | null;
  readingFeedback: DLensSignalReadingFeedback[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
  feedbackTimeline: DLensSignalFeedbackTimelineEvent[];
}

export interface DLensSignalAgentHandoff {
  taskSpec: ProductAgentTaskSpec | null;
  targetAgent: ProductAgentTaskSpec["targetAgent"] | null;
  taskPrompt: string | null;
  requiredContext: string[];
}

export interface DLensSignalTopicSummary {
  id: string;
  name: string;
  status: TopicStatus;
  tags: string[];
}

export interface DLensSignalTopicContext {
  inboxStatus: SignalInboxStatus;
  topicId: string | null;
  suggestedTopicIds: string[];
  topics: DLensSignalTopicSummary[];
}

export interface DLensSignalEvidence {
  textEvidence: ProductSignalEvidenceEntry[];
  imageEvidence: DLensSignalImageEvidence[];
  sourcePacket: SignalReadingSourcePacket | null;
  assembledContent: string;
  citedInReadingRefs: Record<string, string[]>;
}

export interface DLensSignalDecisionTraceEvidence {
  ref: string;
  author?: string;
  text?: string;
  quoteSummary?: string;
  whyItMatters?: string;
  grounding?: ProductSignalEvidenceGrounding;
  reusablePattern?: string;
  tradeoff?: string;
}

export interface DLensSignalDecisionTraceDetails {
  summary: string;
  keyDecisions: string[];
  keyInsights: string[];
  tradeoffs: string[];
  uncertainties: string[];
}

export interface DLensSignalDecisionTraceStage {
  stage: "structured_judgment" | "free_reading";
  outputKind: "verdict_fields" | "interpretive_reading";
  generatedAt: string;
  promptVersion: string;
  model: string | null;
  modelKnown: boolean;
  reasoningDetails: DLensSignalDecisionTraceDetails;
  evidenceRefs: string[];
  evidence: DLensSignalDecisionTraceEvidence[];
}

export interface DLensSignalDecisionTrace {
  traceVersion: typeof DLENS_SIGNAL_DECISION_TRACE_VERSION;
  stages: DLensSignalDecisionTraceStage[];
}

export interface ProductContextSnapshot {
  hash: string;
  compiledAt: string;
  productPromise: string;
  targetAudience: string;
  agentRoles: string[];
  coreWorkflows: string[];
  currentCapabilities: string[];
  explicitConstraints: string[];
  nonGoals: string[];
  preferredTechDirection: string;
  evaluationCriteria: string[];
  unknowns: string[];
  sourceFileIds: string[];
  promptVersion: string;
}

export interface DLensSignalPacket {
  packetVersion: typeof DLENS_SIGNAL_PACKET_VERSION;
  source: DLensSignalPacketSource;
  evidence: DLensSignalEvidence;
  judgment: ProductSignalAnalysis | null;
  productContext: ProductContextSnapshot;
  reading: DLensSignalReadingBundle;
  userFeedback: DLensSignalUserFeedback;
  agentHandoff: DLensSignalAgentHandoff;
  topicContext: DLensSignalTopicContext;
  decisionTrace: DLensSignalDecisionTrace;
}

export interface SignalPacketIndexFilter {
  signalIds?: string[];
  sessionId?: string;
  inboxStatus?: SignalInboxStatus[];
  verdicts?: ProductSignalVerdict[];
}

interface SignalPacketIndexSource {
  globalState: ExtensionGlobalState;
  signals: Signal[];
  topics: Topic[];
  analyses: ProductSignalAnalysis[];
  productContext: ProductContext | null;
  readings: SignalReading[];
  agentTaskFeedback: ProductAgentTaskFeedback[];
}

async function loadSignalPacketIndexSource(
  storageArea: StorageAreaLike,
  globalState: ExtensionGlobalState
): Promise<SignalPacketIndexSource> {
  const [signals, topics, analyses, productContext, readings, agentTaskFeedback] = await Promise.all([
    loadAllSignals(storageArea),
    loadAllTopics(storageArea),
    listProductSignalAnalyses(storageArea),
    loadProductContext(storageArea),
    listSignalReadings(storageArea),
    listProductAgentTaskFeedback(storageArea)
  ]);

  return {
    globalState,
    signals,
    topics,
    analyses,
    productContext,
    readings,
    agentTaskFeedback
  };
}

async function loadProductContext(storageArea: StorageAreaLike): Promise<ProductContext | null> {
  const result = await storageArea.get(PRODUCT_CONTEXT_STORAGE_KEY);
  return normalizeProductContext(result[PRODUCT_CONTEXT_STORAGE_KEY]);
}

function normalizeProductContext(value: unknown): ProductContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<ProductContext>;
  const productPromise = readString(record.productPromise);
  if (!productPromise) {
    return null;
  }
  return {
    productPromise,
    targetAudience: readString(record.targetAudience),
    agentRoles: readStringArray(record.agentRoles),
    coreWorkflows: readStringArray(record.coreWorkflows),
    currentCapabilities: readStringArray(record.currentCapabilities),
    explicitConstraints: readStringArray(record.explicitConstraints),
    nonGoals: readStringArray(record.nonGoals),
    preferredTechDirection: readString(record.preferredTechDirection),
    evaluationCriteria: readStringArray(record.evaluationCriteria),
    unknowns: readStringArray(record.unknowns),
    compiledAt: readString(record.compiledAt),
    sourceFileIds: readStringArray(record.sourceFileIds),
    promptVersion: readString(record.promptVersion)
  };
}

export async function buildDLensSignalPacket(
  storageArea: StorageAreaLike,
  globalState: ExtensionGlobalState,
  signalId: string
): Promise<DLensSignalPacket | null> {
  const packets = await buildSignalPacketIndex(storageArea, globalState, { signalIds: [signalId] });
  return packets[0] ?? null;
}

export async function buildSignalPacketIndex(
  storageArea: StorageAreaLike,
  globalState: ExtensionGlobalState,
  filter: SignalPacketIndexFilter = {}
): Promise<DLensSignalPacket[]> {
  const source = await loadSignalPacketIndexSource(storageArea, globalState);
  return buildSignalPacketIndexFromSource(source, filter);
}

function buildSignalPacketIndexFromSource(
  source: SignalPacketIndexSource,
  filter: SignalPacketIndexFilter
): DLensSignalPacket[] {
  const sessionsById = new Map(source.globalState.sessions.map((session) => [session.id, session]));
  const analysisBySignalId = new Map(source.analyses.map((analysis) => [analysis.signalId, analysis]));
  const readingsBySignalId = groupBy(source.readings, (reading) => reading.signalId);
  const taskFeedbackBySignalId = groupBy(source.agentTaskFeedback, (feedback) => feedback.signalId);
  const topicById = new Map(source.topics.map((topic) => [topic.id, topic]));
  const filterSets = {
    signalIds: filter.signalIds?.length ? new Set(filter.signalIds) : null,
    inboxStatus: filter.inboxStatus?.length ? new Set(filter.inboxStatus) : null,
    verdicts: filter.verdicts?.length ? new Set(filter.verdicts) : null
  };

  return source.signals
    .map((signal) => {
      const session = sessionsById.get(signal.sessionId) ?? null;
      const item = signal.itemId ? session?.items.find((entry) => entry.id === signal.itemId) ?? null : null;
      const readings = sortReadings(readingsBySignalId.get(signal.id) ?? []);
      const analysis = analysisBySignalId.get(signal.id) ?? null;
      const taskFeedback = sortTaskFeedback(taskFeedbackBySignalId.get(signal.id) ?? []);
      const topics = collectTopicsForSignal(signal, source.topics, topicById);
      return buildPacket({ signal, session, item, analysis, productContext: source.productContext, readings, taskFeedback, topics });
    })
    .filter((packet) => matchesPacketFilter(packet, filter, filterSets))
    .sort(comparePackets);
}

function buildPacket({
  signal,
  session,
  item,
  analysis,
  productContext,
  readings,
  taskFeedback,
  topics
}: {
  signal: Signal;
  session: ExtensionGlobalState["sessions"][number] | null;
  item: SessionItem | null;
  analysis: ProductSignalAnalysis | null;
  productContext: ProductContext | null;
  readings: SignalReading[];
  taskFeedback: ProductAgentTaskFeedback[];
  topics: Topic[];
}): DLensSignalPacket {
  const latestReading = readings[0] ?? null;
  const textEvidence = buildTextEvidence(item?.latestCapture, latestReading);
  const sourcePacket = latestReading?.sourcePacket ?? buildSourcePacketFromCapture(
    item?.latestCapture ?? null,
    textEvidence,
    analysis?.promptVersion ?? ""
  );
  const taskSpec = analysis?.agentTaskSpec ?? null;

  return {
    packetVersion: DLENS_SIGNAL_PACKET_VERSION,
    source: buildPacketSource(signal, session, item, latestReading),
    evidence: {
      textEvidence,
      imageEvidence: [],
      sourcePacket,
      assembledContent: sourcePacket?.assembledContent || readCaptureAssembledContent(item?.latestCapture ?? null),
      citedInReadingRefs: buildCitedInReadingRefs(readings)
    },
    judgment: analysis,
    productContext: buildProductContextSnapshot(productContext, analysis),
    reading: {
      latest: latestReading,
      filed: readings.filter((reading) => reading.reviewState === "filed"),
      all: readings
    },
    userFeedback: {
      currentReadingState: latestReading?.reviewState ?? null,
      readingFeedback: readings.map((reading) => ({
        cacheKey: reading.cacheKey,
        reviewState: reading.reviewState,
        generatedAt: reading.generatedAt,
        events: reading.feedbackEvents
      })),
      agentTaskFeedback: taskFeedback,
      feedbackTimeline: buildFeedbackTimeline(readings, taskFeedback)
    },
    agentHandoff: {
      taskSpec,
      targetAgent: taskSpec?.targetAgent ?? null,
      taskPrompt: taskSpec?.taskPrompt ?? null,
      requiredContext: taskSpec?.requiredContext ?? []
    },
    topicContext: {
      inboxStatus: signal.inboxStatus,
      topicId: signal.topicId ?? null,
      suggestedTopicIds: signal.suggestedTopicIds ?? [],
      topics: topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        status: topic.status,
        tags: topic.tags
      }))
    },
    decisionTrace: buildDecisionTrace(analysis, readings, textEvidence)
  };
}

function buildProductContextSnapshot(
  productContext: ProductContext | null,
  analysis: ProductSignalAnalysis | null
): ProductContextSnapshot {
  if (!productContext) {
    return {
      hash: analysis?.productContextHash ?? "",
      compiledAt: "",
      productPromise: "",
      targetAudience: "",
      agentRoles: [],
      coreWorkflows: [],
      currentCapabilities: [],
      explicitConstraints: [],
      nonGoals: [],
      preferredTechDirection: "",
      evaluationCriteria: [],
      unknowns: [],
      sourceFileIds: [],
      promptVersion: ""
    };
  }

  return {
    hash: buildProductContextHash(productContext),
    compiledAt: productContext.compiledAt,
    productPromise: productContext.productPromise,
    targetAudience: productContext.targetAudience,
    agentRoles: [...productContext.agentRoles],
    coreWorkflows: [...productContext.coreWorkflows],
    currentCapabilities: [...productContext.currentCapabilities],
    explicitConstraints: [...productContext.explicitConstraints],
    nonGoals: [...productContext.nonGoals],
    preferredTechDirection: productContext.preferredTechDirection,
    evaluationCriteria: [...productContext.evaluationCriteria],
    unknowns: [...productContext.unknowns],
    sourceFileIds: [...productContext.sourceFileIds],
    promptVersion: productContext.promptVersion
  };
}

function buildPacketSource(
  signal: Signal,
  session: ExtensionGlobalState["sessions"][number] | null,
  item: SessionItem | null,
  latestReading: SignalReading | null
): DLensSignalPacketSource {
  const capture = item?.latestCapture ?? null;
  const descriptor = item?.descriptor ?? null;
  const url = descriptor?.post_url
    || capture?.source_post_url
    || capture?.canonical_target_url
    || latestReading?.sourcePacket.postUrl
    || "";

  return {
    signalId: signal.id,
    source: signal.source,
    sessionId: signal.sessionId,
    sessionName: session?.name ?? "",
    sessionMode: session?.mode ?? null,
    itemId: signal.itemId ?? null,
    itemStatus: item?.status ?? null,
    url,
    pageUrl: descriptor?.page_url || capture?.source_page_url || url,
    author: descriptor?.author_hint || capture?.author_hint || "",
    textSnippet: descriptor?.text_snippet || capture?.text_snippet || "",
    capturedAt: signal.capturedAt || descriptor?.captured_at || capture?.captured_at || "",
    captureId: item?.captureId || capture?.id || null,
    canonicalTargetUrl: item?.canonicalTargetUrl || capture?.canonical_target_url || null
  };
}

function buildTextEvidence(
  capture: CaptureSnapshot | null | undefined,
  latestReading: SignalReading | null
): ProductSignalEvidenceEntry[] {
  const captureEvidence = buildProductSignalEvidenceCatalogFromCapture(capture);
  const merged = [...captureEvidence];
  const seenRefs = new Set(merged.map((entry) => entry.ref));
  const readingComments = latestReading?.sourcePacket.representativeComments ?? [];

  for (const [index, comment] of readingComments.entries()) {
    const ref = comment.ref || `e${index + 1}`;
    if (seenRefs.has(ref)) {
      continue;
    }
    seenRefs.add(ref);
    merged.push({
      id: ref || `reading_${index + 1}`,
      ref,
      author: comment.author,
      text: comment.text,
      likeCount: typeof comment.likeCount === "number" && Number.isFinite(comment.likeCount) ? comment.likeCount : null,
      role: "audience",
      isOrphan: false,
      parentId: null,
      resolvedParentId: null
    });
  }

  return merged;
}

function buildSourcePacketFromCapture(
  capture: CaptureSnapshot | null,
  textEvidence: ProductSignalEvidenceEntry[],
  analysisPromptVersion: string
): SignalReadingSourcePacket | null {
  const assembledContent = readCaptureAssembledContent(capture);
  const postUrl = capture?.source_post_url || capture?.canonical_target_url || "";
  if (!assembledContent && !postUrl && textEvidence.length === 0) {
    return null;
  }

  return {
    assembledContent,
    postUrl,
    representativeComments: textEvidence.map((entry) => ({
      ref: entry.ref,
      author: entry.author,
      text: entry.text
    })),
    analysisPromptVersion
  };
}

function buildCitedInReadingRefs(readings: SignalReading[]): Record<string, string[]> {
  const citedByRef: Record<string, string[]> = {};
  for (const reading of readings) {
    const refs = new Set(reading.sourceRefs.map((ref) => ref.trim()).filter(Boolean));
    for (const ref of refs) {
      citedByRef[ref] = [...(citedByRef[ref] ?? []), reading.cacheKey];
    }
  }
  return citedByRef;
}

function buildDecisionTrace(
  analysis: ProductSignalAnalysis | null,
  readings: SignalReading[],
  textEvidence: ProductSignalEvidenceEntry[]
): DLensSignalDecisionTrace {
  const stages: DLensSignalDecisionTraceStage[] = [];
  if (analysis) {
    stages.push(buildStructuredJudgmentTraceStage(analysis, textEvidence));
  }
  for (const reading of readings) {
    stages.push(buildFreeReadingTraceStage(reading, textEvidence));
  }
  return {
    traceVersion: DLENS_SIGNAL_DECISION_TRACE_VERSION,
    stages
  };
}

function buildStructuredJudgmentTraceStage(
  analysis: ProductSignalAnalysis,
  textEvidence: ProductSignalEvidenceEntry[]
): DLensSignalDecisionTraceStage {
  const evidenceNotes = analysis.evidenceNotes ?? [];
  const summary = compactText(`${analysis.contentSummary} Verdict ${analysis.verdict}: ${analysis.reason}`, 360);
  const keyInsights = uniqueNonEmpty([
    analysis.whyRelevant,
    analysis.referenceTakeaway,
    analysis.experimentHint,
    analysis.whyNow,
    analysis.validationMetric,
    ...evidenceNotes.map((note) => note.reusablePattern),
    ...evidenceNotes.map((note) => note.whyItWorks)
  ], 8);
  const tradeoffs = uniqueNonEmpty([
    ...(analysis.blockers ?? []),
    ...evidenceNotes.map((note) => note.tradeoff)
  ], 6);
  const uncertainties = uniqueNonEmpty([
    ...evidenceNotes
      .filter((note) => note.grounding && note.grounding !== "text_grounded")
      .map((note) => `${note.ref}: ${note.grounding}`),
    analysis.status === "error" && analysis.error ? analysis.error : ""
  ], 6);

  return {
    stage: "structured_judgment",
    outputKind: "verdict_fields",
    generatedAt: analysis.analyzedAt,
    promptVersion: analysis.promptVersion,
    model: analysis.model || null,
    modelKnown: Boolean(analysis.model),
    reasoningDetails: {
      summary,
      keyDecisions: keyInsights,
      keyInsights,
      tradeoffs,
      uncertainties
    },
    evidenceRefs: analysis.evidenceRefs,
    evidence: buildTraceEvidence(analysis.evidenceRefs, textEvidence, evidenceNotes)
  };
}

function buildFreeReadingTraceStage(
  reading: SignalReading,
  textEvidence: ProductSignalEvidenceEntry[]
): DLensSignalDecisionTraceStage {
  const readingRefs = reading.sourceRefs.length
    ? reading.sourceRefs
    : reading.sourcePacket.representativeComments.map((comment) => comment.ref);
  const commentsAsEvidence: ProductSignalEvidenceEntry[] = reading.sourcePacket.representativeComments.map((comment, index) => ({
    id: comment.ref || `reading_${index + 1}`,
    ref: comment.ref || `e${index + 1}`,
    author: comment.author,
    text: comment.text,
    likeCount: null,
    role: "audience",
    isOrphan: false,
    parentId: null,
    resolvedParentId: null
  }));
  const evidence = buildTraceEvidence(
    readingRefs,
    textEvidence.length ? textEvidence : commentsAsEvidence,
    []
  );
  const keyInsights = extractReadingKeyInsights(reading.reading);

  return {
    stage: "free_reading",
    outputKind: "interpretive_reading",
    generatedAt: reading.generatedAt,
    promptVersion: reading.promptVersion,
    model: reading.model || null,
    modelKnown: Boolean(reading.model),
    reasoningDetails: {
      summary: compactText(reading.reading, 520),
      keyDecisions: keyInsights,
      keyInsights,
      tradeoffs: [],
      uncertainties: extractReadingUncertainties(reading.reading)
    },
    evidenceRefs: readingRefs,
    evidence
  };
}

function buildTraceEvidence(
  refs: string[],
  textEvidence: ProductSignalEvidenceEntry[],
  evidenceNotes: NonNullable<ProductSignalAnalysis["evidenceNotes"]>
): DLensSignalDecisionTraceEvidence[] {
  const evidenceByRef = new Map(textEvidence.map((entry) => [entry.ref, entry]));
  const noteByRef = new Map(evidenceNotes.map((note) => [note.ref, note]));
  return refs.map((ref) => {
    const entry = evidenceByRef.get(ref);
    const note = noteByRef.get(ref);
    return {
      ref,
      ...(entry?.author ? { author: entry.author } : {}),
      ...(entry?.text ? { text: entry.text } : {}),
      ...(note?.quoteSummary ? { quoteSummary: note.quoteSummary } : {}),
      ...(note?.whyItMatters ? { whyItMatters: note.whyItMatters } : {}),
      ...(note?.grounding ? { grounding: note.grounding } : {}),
      ...(note?.reusablePattern ? { reusablePattern: note.reusablePattern } : {}),
      ...(note?.tradeoff ? { tradeoff: note.tradeoff } : {})
    };
  });
}

function readThreadReadModel(capture: CaptureSnapshot | null | undefined): ThreadReadModelSnapshot | null {
  const result = capture?.result;
  return result?.threadReadModel ?? result?.thread_read_model ?? null;
}

function readCaptureAssembledContent(capture: CaptureSnapshot | null | undefined): string {
  const threadReadModel = readThreadReadModel(capture);
  const assembledContent = readString(threadReadModel?.assembledContent ?? threadReadModel?.assembled_content);
  if (assembledContent) {
    return assembledContent;
  }
  return readString(capture?.result?.canonical_post?.text ?? capture?.text_snippet);
}

function compactText(value: string | null | undefined, maxLength: number): string {
  const text = readString(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function uniqueNonEmpty(values: Array<string | null | undefined | false>, limit: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = compactText(value, 420);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function extractReadingKeyInsights(reading: string): string[] {
  const scored = splitReadingStatements(reading).map((text, index) => ({
    text,
    index,
    score: scoreReadingInsight(text)
  }));
  const ranked = [
    ...scored.filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score || left.index - right.index),
    ...scored.filter((entry) => entry.score <= 0).sort((left, right) => left.index - right.index)
  ];
  return uniqueNonEmpty(ranked.map((entry) => entry.text), 4);
}

function extractReadingUncertainties(reading: string): string[] {
  return uniqueNonEmpty(
    splitReadingStatements(reading).filter((line) =>
      /不確定|尚未|待確認|未知|仍需|需要(?:驗證|確認|觀察|更多|釐清|補充)|缺乏|不足|風險|不能確認|無法確認|however/i.test(line)
    ),
    4
  );
}

function scoreReadingInsight(statement: string): number {
  const positiveMatches = statement.match(/核心|關鍵|洞察|啟示|建議|值得|重點|意味|顯示|產品|工作流|驗證|信任|需求|痛點|機會|可行|判斷/g)?.length ?? 0;
  const contextMatches = statement.match(/背景|鋪陳|上下文|描述作者|第一句|第二句/g)?.length ?? 0;
  return positiveMatches - contextMatches * 2;
}

function splitReadingStatements(reading: string): string[] {
  return reading
    .split(/\n+|。|；|;/)
    .map((line) => line.replace(/^[-*#\d.\s]+/, "").trim())
    .filter((line) => line.length >= 8)
    .map((line) => compactText(line, 260));
}

function collectTopicsForSignal(signal: Signal, topics: Topic[], topicById: Map<string, Topic>): Topic[] {
  const collected = new Map<string, Topic>();
  if (signal.topicId) {
    const topic = topicById.get(signal.topicId);
    if (topic) {
      collected.set(topic.id, topic);
    }
  }
  for (const topicId of signal.suggestedTopicIds ?? []) {
    const topic = topicById.get(topicId);
    if (topic) {
      collected.set(topic.id, topic);
    }
  }
  for (const topic of topics) {
    if (topic.sessionId === signal.sessionId && topic.signalIds.includes(signal.id)) {
      collected.set(topic.id, topic);
    }
  }
  return [...collected.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function buildFeedbackTimeline(
  readings: SignalReading[],
  taskFeedback: ProductAgentTaskFeedback[]
): DLensSignalFeedbackTimelineEvent[] {
  const readingEvents: DLensSignalFeedbackTimelineEvent[] = readings.flatMap((reading) =>
    reading.feedbackEvents.map((event) => ({
      kind: "reading" as const,
      readingCacheKey: reading.cacheKey,
      type: event.type,
      at: event.at,
      ...(event.note ? { note: event.note } : {})
    }))
  );
  const taskEvents: DLensSignalFeedbackTimelineEvent[] = taskFeedback.map((feedback) => ({
    kind: "agent_task",
    taskPromptHash: feedback.taskPromptHash,
    feedback: feedback.feedback,
    at: feedback.createdAt,
    ...(feedback.note ? { note: feedback.note } : {})
  }));
  return [...readingEvents, ...taskEvents].sort((left, right) => left.at.localeCompare(right.at));
}

function matchesPacketFilter(
  packet: DLensSignalPacket,
  filter: SignalPacketIndexFilter,
  filterSets: {
    signalIds: Set<string> | null;
    inboxStatus: Set<SignalInboxStatus> | null;
    verdicts: Set<ProductSignalVerdict> | null;
  }
): boolean {
  if (filterSets.signalIds && !filterSets.signalIds.has(packet.source.signalId)) {
    return false;
  }
  if (filter.sessionId && packet.source.sessionId !== filter.sessionId) {
    return false;
  }
  if (filterSets.inboxStatus && !filterSets.inboxStatus.has(packet.topicContext.inboxStatus)) {
    return false;
  }
  if (filterSets.verdicts) {
    const verdict = packet.judgment?.verdict ?? null;
    if (!verdict || !filterSets.verdicts.has(verdict)) {
      return false;
    }
  }
  return true;
}

function comparePackets(left: DLensSignalPacket, right: DLensSignalPacket): number {
  const byCapturedAt = right.source.capturedAt.localeCompare(left.source.capturedAt);
  if (byCapturedAt !== 0) {
    return byCapturedAt;
  }
  return left.source.signalId.localeCompare(right.source.signalId);
}

function sortReadings(readings: SignalReading[]): SignalReading[] {
  return [...readings].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

function sortTaskFeedback(feedback: ProductAgentTaskFeedback[]): ProductAgentTaskFeedback[] {
  return [...feedback].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function groupBy<T>(values: T[], getKey: (value: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(value);
    } else {
      map.set(key, [value]);
    }
  }
  return map;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(readString).filter(Boolean);
}
