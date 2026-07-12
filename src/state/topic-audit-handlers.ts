import type { AuditPromptEnvelope } from "../compare/topic-audit-prompts.ts";
import { extractTopicEvidenceRefs } from "../compare/topic-audit-evidence.ts";
import {
  buildTopicAuditFingerprints,
  buildTopicAuditRunId,
  evolveTopicAuditEpisodes,
  materializeNarrativeState
} from "../compare/topic-audit-continuity.ts";
import {
  TOPIC_AUDIT_SHARD_POLICY_VERSION,
  buildTopicAuditArtifactProducerKey,
  buildTopicAuditShardSetHash,
  buildTopicAuditSignalIdentity,
  isTopicAuditArtifactReusable
} from "../compare/topic-audit-cache.ts";
import {
  TOPIC_AUDIT_PROMPT_VERSIONS,
  buildP0_5ShardReadingPrompt,
  buildP1SignalReadingPrompt,
  buildP2LexiconPrompt,
  buildP3NarrativePrompt,
  buildP4AudiencePrompt,
  buildP5AbsencePrompt,
  buildP6FinalReportPrompt,
  buildP8CrossTopicCalibrationPrompt
} from "../compare/topic-audit-prompts.ts";
import {
  buildTopicEvidencePackets,
  splitPacketIntoCommentShards,
  type CommentShardReading,
  type CrossTopicCalibration,
  type EvidencePacket,
  type LensMemo,
  type NarrativeContinuityReview,
  type ReplyFragment,
  type ShardPatternCandidate,
  type SignalReading,
  type TopicAuditArtifactIdentity,
  type TopicAuditEpisode,
  type TopicAuditFingerprints,
  type TopicAuditReport,
  type TopicNarrativeState,
  type TopicAuditStageName
} from "../compare/topic-audit.ts";
import {
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_EPISODES_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  buildTopicAuditCacheKey,
  loadTopicAuditEvidence,
  loadTopicAuditEpisodes,
  loadTopicAuditMemos,
  loadTopicAuditReport,
  isTopicAuditPublicationCompatible,
  publishTopicAuditReportAndEpisodes,
  saveCrossTopicCalibration,
  saveTopicAuditEvidence,
  saveTopicAuditMemos,
  type StorageAreaLike,
  type TopicAuditMemoBundle
} from "./topic-audit-storage.ts";
import { buildSignalReadinessById } from "./signal-readiness.ts";
import { loadSignals, loadTopics } from "./topic-storage.ts";
import { listSignalTags } from "../compare/signal-tags-storage.ts";
import { validateCrossTopicCalibrationDraft, validateTopicAuditDraft, type TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { SessionRecord, SessionItem, Signal, Topic } from "./types.ts";

export type TopicAuditHandlerMessage =
  | { type: "topic/audit/build-evidence"; sessionId: string; topicId: string }
  | { type: "topic/audit/run"; sessionId: string; topicId: string; fromStage?: TopicAuditStageName; force?: boolean }
  | { type: "topic/audit/p1-signal"; sessionId: string; topicId: string; signalId: string }
  | { type: "topic/audit/get"; topicId: string }
  | { type: "topic/audit/validate"; topicId: string }
  | { type: "topic/audit/clear"; topicId: string }
  | { type: "cross-topic/calibrate"; topicIds: string[] };

export interface TopicAuditHandlerResult {
  auditEvidence?: EvidencePacket[];
  auditReport?: TopicAuditReport | null;
  auditMemos?: TopicAuditMemoBundle | null;
  auditEpisodes?: TopicAuditEpisode[];
  auditValidatorFlags?: TopicAuditValidationFlag[];
  crossTopicCalibration?: CrossTopicCalibration | null;
}

export interface TopicAuditHandlerOptions {
  message: TopicAuditHandlerMessage;
  sessions: SessionRecord[];
  generateEnvelope?: (stageName: TopicAuditStageName, prompt: string) => Promise<AuditPromptEnvelope>;
  model?: string;
  now?: () => string;
}

function nowIso(options: TopicAuditHandlerOptions): string {
  return options.now?.() ?? new Date().toISOString();
}

let auditRunSequence = 0;

function nextAuditRunNonce(options: TopicAuditHandlerOptions): string {
  auditRunSequence += 1;
  return `${nowIso(options)}:${auditRunSequence}`;
}

function findSession(sessions: SessionRecord[], sessionId: string): SessionRecord {
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new Error("Folder not found");
  }
  return session;
}

async function findTopic(storageArea: StorageAreaLike, sessionId: string, topicId: string): Promise<Topic> {
  const topic = (await loadTopics(storageArea, sessionId)).find((entry) => entry.id === topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }
  return topic;
}

function itemStatesForTopic(topic: Topic, signals: Signal[], itemsById: Map<string, SessionItem>) {
  return topic.signalIds.flatMap((signalId) => {
    const signal = signals.find((entry) => entry.id === signalId);
    const item = signal?.itemId ? itemsById.get(signal.itemId) : null;
    if (!signal || !item) {
      return [];
    }
    return [{
      itemId: item.id,
      updatedAt: item.latestCapture?.updated_at ?? item.lastStatusAt ?? item.savedAt,
      status: item.status
    }];
  });
}

function buildInputHash(
  topic: Topic,
  signals: Signal[],
  itemsById: Map<string, SessionItem>,
  modelKey = "unknown"
): string {
  return buildTopicAuditCacheKey({
    topicId: topic.id,
    topicName: topic.name,
    signalIds: topic.signalIds,
    itemStates: itemStatesForTopic(topic, signals, itemsById),
    promptVersion: Object.values(TOPIC_AUDIT_PROMPT_VERSIONS).join("|"),
    stageName: "all",
    modelKey,
    shardPolicyVersion: TOPIC_AUDIT_SHARD_POLICY_VERSION
  });
}

function auditReadySignalIds(session: SessionRecord, signals: Signal[]): Set<string> {
  const readinessById = buildSignalReadinessById(session, signals);
  return new Set(
    Object.entries(readinessById)
      .filter(([, readiness]) => readiness.status === "ready")
      .map(([signalId]) => signalId)
  );
}

async function buildEvidence(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  auditRunId: string,
  inputHash: string
): Promise<EvidencePacket[]> {
  const signals = await loadSignals(storageArea, session.id);
  const itemIds = Array.from(new Set(signals.map((signal) => signal.itemId).filter((itemId): itemId is string => Boolean(itemId))));
  const signalTags = await listSignalTags(storageArea, itemIds);
  const signalTagsByItemId = Object.fromEntries(signalTags.map((record) => [record.itemId, record]));
  const packets = buildTopicEvidencePackets({
    topic,
    signals,
    items: session.items,
    signalTagsByItemId,
    auditRunId,
    inputHash
  });
  const identifiedPackets = await Promise.all(packets.map(async (packet) => ({
    ...packet,
    signalIdentity: await buildTopicAuditSignalIdentity(packet)
  })));
  return identifiedPackets;
}

async function buildAndSaveEvidence(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  auditRunId: string,
  inputHash: string
): Promise<EvidencePacket[]> {
  const identifiedPackets = await buildEvidence(storageArea, session, topic, auditRunId, inputHash);
  await saveTopicAuditEvidence(storageArea, topic.id, identifiedPackets);
  return identifiedPackets;
}

function allAllowedRefs(packets: EvidencePacket[]): Set<string> {
  const refs = new Set<string>();
  for (const packet of packets) {
    refs.add(`${packet.shortCode}.OP`);
    for (const fragment of packet.replyFragments) {
      refs.add(fragment.ref);
    }
  }
  return refs;
}

function modelKey(options: TopicAuditHandlerOptions): string {
  return options.model ?? "unknown";
}

function artifactIdentity(
  packet: EvidencePacket,
  producerKey: string,
  upstreamHash?: string
): TopicAuditArtifactIdentity {
  if (!packet.signalIdentity) {
    throw new Error(`Missing signal cache identity for ${packet.signalId}`);
  }
  return {
    ...packet.signalIdentity,
    producerKey,
    ...(upstreamHash ? { upstreamHash } : {})
  };
}

function expectedShardIdentity(
  packet: EvidencePacket,
  shardIndex: number,
  shardCount: number,
  options: TopicAuditHandlerOptions
): TopicAuditArtifactIdentity {
  return artifactIdentity(packet, buildTopicAuditArtifactProducerKey({
    stage: "comment-shard-reading",
    promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p0_5,
    modelKey: modelKey(options),
    partitionKey: `${shardIndex + 1}/${shardCount}`
  }));
}

async function expectedSignalReadingIdentity(
  packet: EvidencePacket,
  shardReadings: readonly CommentShardReading[],
  options: TopicAuditHandlerOptions
): Promise<TopicAuditArtifactIdentity> {
  return artifactIdentity(
    packet,
    buildTopicAuditArtifactProducerKey({
      stage: "p1-signal-reading",
      promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p1,
      modelKey: modelKey(options)
    }),
    await buildTopicAuditShardSetHash(shardReadings)
  );
}

function replayTextRefsAreAllowed(texts: readonly string[], allowedRefs: ReadonlySet<string>): boolean {
  return texts
    .flatMap(extractTopicEvidenceRefs)
    .every((ref) => allowedRefs.has(ref));
}

function storedShardReadingIsSafe(
  reading: CommentShardReading,
  allowedRefs: ReadonlySet<string>
): boolean {
  const candidates = reading.patternCandidates ?? [];
  const structuredRefs = [
    ...(reading.commentRefsInShard ?? []),
    ...candidates.flatMap((candidate) => [
      ...candidate.supportRefs,
      ...candidate.counterRefs,
      ...candidate.representativeRefs,
      ...candidate.counterRepresentativeRefs
    ])
  ];
  return structuredRefs.every((ref) => allowedRefs.has(ref))
    && replayTextRefsAreAllowed([
      reading.reading ?? "",
      ...(reading.lexiconCandidates ?? []),
      ...candidates.flatMap((candidate) => [
        candidate.label,
        candidate.gist,
        candidate.dynamicImplication,
        candidate.uncertainty
      ])
    ], allowedRefs);
}

function storedSignalReadingIsSafe(reading: SignalReading, allowedRefs: ReadonlySet<string>): boolean {
  return reading.evidenceRefs.every((ref) => allowedRefs.has(ref))
    && replayTextRefsAreAllowed([reading.reading, ...reading.watchNotes], allowedRefs);
}

function storedLensMemoIsSafe(memo: LensMemo, allowedRefs: ReadonlySet<string>): boolean {
  const lanes = memo.displayHints?.narrativeLanes ?? [];
  const patterns = memo.displayHints?.reactionPatterns ?? [];
  const structuredRefs = [
    ...memo.evidenceRefs,
    ...lanes.flatMap((lane) => lane.signalRefs),
    ...patterns.flatMap((pattern) => [
      ...pattern.supportRefs,
      ...pattern.counterRefs,
      ...pattern.representativeRefs,
      ...pattern.counterRepresentativeRefs
    ])
  ];
  return structuredRefs.every((ref) => allowedRefs.has(ref))
    && replayTextRefsAreAllowed([
      memo.prose,
      ...memo.caveats,
      memo.coverage ?? "",
      ...(memo.displayHints?.themeChips ?? []),
      ...lanes.map((lane) => lane.label),
      ...patterns.flatMap((pattern) => [pattern.label, pattern.dynamicImplication])
    ], allowedRefs);
}

function storedReportIsSafe(report: TopicAuditReport, allowedRefs: ReadonlySet<string>): boolean {
  return replayTextRefsAreAllowed([
    ...Object.values(report.sections),
    ...report.limitations
  ], allowedRefs);
}

function collectReusableShardReadings(
  packets: readonly EvidencePacket[],
  existingReadings: readonly CommentShardReading[],
  readySignalIds: ReadonlySet<string>,
  options: TopicAuditHandlerOptions
): CommentShardReading[] {
  const reusable: CommentShardReading[] = [];
  for (const packet of packets) {
    if (!readySignalIds.has(packet.signalId)) {
      continue;
    }
    const shards = splitPacketIntoCommentShards(packet);
    for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
      const allowedRefs = new Set((shards[shardIndex] ?? []).map((fragment) => fragment.ref));
      const expected = expectedShardIdentity(packet, shardIndex, shards.length, options);
      const reading = existingReadings.find((candidate) => (
        candidate.signalId === packet.signalId
        && candidate.shardIndex === shardIndex
        && candidate.shardCount === shards.length
        && isTopicAuditArtifactReusable(candidate.cacheIdentity, expected)
        && storedShardReadingIsSafe(candidate, allowedRefs)
      ));
      if (reading) {
        reusable.push(reading);
      }
    }
  }
  return reusable;
}

async function collectReusableSignalReadings(
  packets: readonly EvidencePacket[],
  existingReadings: readonly SignalReading[],
  shardReadings: readonly CommentShardReading[],
  readySignalIds: ReadonlySet<string>,
  options: TopicAuditHandlerOptions
): Promise<SignalReading[]> {
  const reusable: SignalReading[] = [];
  for (const packet of packets) {
    if (!readySignalIds.has(packet.signalId)) {
      continue;
    }
    const packetShards = shardReadings.filter((reading) => reading.signalId === packet.signalId);
    const expectedShardCount = splitPacketIntoCommentShards(packet).length;
    if (packetShards.length !== expectedShardCount) {
      continue;
    }
    const expected = await expectedSignalReadingIdentity(packet, packetShards, options);
    const allowedRefs = allAllowedRefs([packet]);
    const reading = existingReadings.find((candidate) => (
      candidate.signalId === packet.signalId
      && isTopicAuditArtifactReusable(candidate.cacheIdentity, expected)
      && storedSignalReadingIsSafe(candidate, allowedRefs)
    ));
    if (reading) {
      reusable.push(reading);
    }
  }
  return reusable;
}

async function canFastReturnAudit(input: {
  report: TopicAuditReport | null;
  memos: TopicAuditMemoBundle | null;
  episodes: readonly TopicAuditEpisode[];
  fingerprints: TopicAuditFingerprints;
  inputHash: string;
  packets: EvidencePacket[];
  readySignalIds: ReadonlySet<string>;
  options: TopicAuditHandlerOptions;
}): Promise<boolean> {
  const { report, memos, episodes, fingerprints, inputHash, packets, readySignalIds, options } = input;
  if (
    !report
    || !memos
    || report.inputHash !== inputHash
    || memos.inputHash !== inputHash
    || report.auditRunId !== memos.auditRunId
  ) {
    return false;
  }
  const stateFingerprints = report.narrativeState?.fingerprints;
  const latestEpisode = episodes.at(-1);
  if (
    !stateFingerprints
    || stateFingerprints.evidence !== fingerprints.evidence
    || stateFingerprints.definition !== fingerprints.definition
    || stateFingerprints.pipeline !== fingerprints.pipeline
    || !latestEpisode
    || latestEpisode.inputHash !== report.inputHash
    || latestEpisode.auditRunId !== report.auditRunId
    || latestEpisode.fingerprints.evidence !== fingerprints.evidence
    || latestEpisode.fingerprints.definition !== fingerprints.definition
    || latestEpisode.fingerprints.pipeline !== fingerprints.pipeline
  ) {
    return false;
  }
  const allowedRefs = allAllowedRefs(packets);
  if (!storedReportIsSafe(report, allowedRefs)) {
    return false;
  }
  const shardReadings = collectReusableShardReadings(
    packets,
    memos.shardReadings ?? [],
    readySignalIds,
    options
  );
  const expectedShardCount = packets
    .filter((packet) => readySignalIds.has(packet.signalId))
    .reduce((count, packet) => count + splitPacketIntoCommentShards(packet).length, 0);
  if (shardReadings.length !== expectedShardCount) {
    return false;
  }
  const signalReadings = await collectReusableSignalReadings(
    packets,
    memos.signalReadings,
    shardReadings,
    readySignalIds,
    options
  );
  if (signalReadings.length !== packets.filter((packet) => readySignalIds.has(packet.signalId)).length) {
    return false;
  }
  const requiredLensStages = new Set<TopicAuditStageName>(["lexicon", "narrative", "audience", "absence"]);
  const safeLensStages = new Set(
    memos.lensMemos
      .filter((memo) => storedLensMemoIsSafe(memo, allowedRefs))
      .map((memo) => memo.stageName)
  );
  return [...requiredLensStages].every((stageName) => safeLensStages.has(stageName));
}

function normalizeReactionPatterns(
  patterns: NonNullable<AuditPromptEnvelope["displayHints"]>["reactionPatterns"],
  allowedRefs: ReadonlySet<string>
) {
  if (!Array.isArray(patterns)) {
    return [];
  }
  return patterns.flatMap((pattern) => {
    const supportRefs = filterRefs(pattern.supportRefs, allowedRefs);
    const counterRefs = filterRefs(pattern.counterRefs, allowedRefs);
    const representativeRefs = filterRefs(pattern.representativeRefs, allowedRefs);
    const counterRepresentativeRefs = filterRefs(pattern.counterRepresentativeRefs, allowedRefs);
    if ([...supportRefs, ...counterRefs, ...representativeRefs, ...counterRepresentativeRefs].length === 0) {
      return [];
    }
    return [{
      ...pattern,
      supportRefs,
      counterRefs,
      representativeRefs,
      counterRepresentativeRefs
    }];
  });
}

function normalizeNarrativeLanes(
  lanes: NonNullable<AuditPromptEnvelope["displayHints"]>["narrativeLanes"],
  allowedRefs: ReadonlySet<string>
) {
  if (!Array.isArray(lanes)) {
    return [];
  }
  return lanes.flatMap((lane) => {
    const signalRefs = filterRefs(lane.signalRefs, allowedRefs);
    return signalRefs.length > 0 ? [{ ...lane, signalRefs }] : [];
  });
}

function normalizeContinuityRefs(
  refs: readonly string[],
  allowedRefs: ReadonlySet<string>
): string[] {
  const normalized = uniqueTrimmedStrings(refs);
  const unknownRef = normalized.find((ref) => !allowedRefs.has(ref));
  if (unknownRef) {
    throw new Error(`Unknown continuity evidence ref: ${unknownRef}`);
  }
  return normalized;
}

function normalizeContinuityReview(
  review: NarrativeContinuityReview | undefined,
  allowedRefs: ReadonlySet<string>
): NarrativeContinuityReview | undefined {
  if (!review) {
    return undefined;
  }
  return {
    carriedClaims: review.carriedClaims.map((claim) => ({
      ...claim,
      evidenceRefs: normalizeContinuityRefs(claim.evidenceRefs, allowedRefs)
    })),
    newClaims: review.newClaims.map((claim) => ({
      ...claim,
      evidenceRefs: normalizeContinuityRefs(claim.evidenceRefs, allowedRefs)
    })),
    voices: review.voices.map((voice) => ({
      ...voice,
      evidenceRefs: normalizeContinuityRefs(voice.evidenceRefs, allowedRefs)
    })),
    openQuestions: uniqueTrimmedStrings(review.openQuestions)
  };
}

function envelopeReplayText(envelope: AuditPromptEnvelope): string[] {
  const continuityReview = envelope.continuityReview;
  return [
    envelope.prose,
    ...envelope.caveats,
    envelope.coverage ?? "",
    ...(envelope.lexiconCandidates ?? []),
    ...(envelope.patternCandidates ?? []).flatMap((candidate) => [
      candidate.label,
      candidate.gist,
      candidate.dynamicImplication,
      candidate.uncertainty
    ]),
    ...(envelope.displayHints?.themeChips ?? []),
    ...(envelope.displayHints?.narrativeLanes ?? []).map((lane) => lane.label),
    ...(envelope.displayHints?.reactionPatterns ?? []).flatMap((pattern) => [
      pattern.label,
      pattern.dynamicImplication
    ]),
    ...(continuityReview?.carriedClaims ?? []).flatMap((claim) => [claim.statement, claim.rationale]),
    ...(continuityReview?.newClaims ?? []).flatMap((claim) => [claim.statement, claim.rationale]),
    ...(continuityReview?.voices ?? []).flatMap((voice) => [voice.label, voice.position]),
    ...(continuityReview?.openQuestions ?? [])
  ];
}

function normalizeEnvelope(
  envelope: AuditPromptEnvelope,
  allowedRefs: ReadonlySet<string>,
  strictInlineRefs = true
): AuditPromptEnvelope {
  const reactionPatterns = normalizeReactionPatterns(envelope.displayHints?.reactionPatterns, allowedRefs);
  const narrativeLanes = normalizeNarrativeLanes(envelope.displayHints?.narrativeLanes, allowedRefs);
  const continuityReview = normalizeContinuityReview(envelope.continuityReview, allowedRefs);
  const inlineRefs = uniqueTrimmedStrings(envelopeReplayText(envelope).flatMap(extractTopicEvidenceRefs));
  if (strictInlineRefs) {
    const unknownInlineRef = inlineRefs.find((ref) => !allowedRefs.has(ref));
    if (unknownInlineRef) {
      throw new Error(`Unknown inline evidence ref: ${unknownInlineRef}`);
    }
  }
  const displayHints = envelope.displayHints
    ? {
        ...envelope.displayHints,
        ...(envelope.displayHints.narrativeLanes ? { narrativeLanes } : {}),
        ...(envelope.displayHints.reactionPatterns ? { reactionPatterns } : {})
      }
    : undefined;
  return {
    prose: envelope.prose,
    evidenceRefs: uniqueTrimmedStrings([
      ...envelope.evidenceRefs.filter((ref) => allowedRefs.has(ref)),
      ...(strictInlineRefs ? inlineRefs : [])
    ]),
    caveats: envelope.caveats,
    ...(envelope.coverage ? { coverage: envelope.coverage } : {}),
    ...(displayHints ? { displayHints } : {}),
    ...(envelope.commentRefsInShard ? { commentRefsInShard: filterRefs(envelope.commentRefsInShard, allowedRefs) } : {}),
    ...(envelope.patternCandidates ? { patternCandidates: sanitizeShardPatternCandidates(envelope.patternCandidates, allowedRefs) } : {}),
    ...(envelope.lexiconCandidates ? { lexiconCandidates: uniqueTrimmedStrings(envelope.lexiconCandidates) } : {}),
    ...(continuityReview ? { continuityReview } : {})
  };
}

async function generateOrParseEnvelope(
  generateEnvelope: TopicAuditHandlerOptions["generateEnvelope"],
  stageName: TopicAuditStageName,
  prompt: string,
  allowedRefs: ReadonlySet<string>,
  strictInlineRefs = true
): Promise<AuditPromptEnvelope> {
  if (!generateEnvelope) {
    throw new Error("Audit LLM generator unavailable");
  }
  const raw = await generateEnvelope(stageName, prompt);
  return normalizeEnvelope(raw, allowedRefs, strictInlineRefs);
}

function signalReadingFromEnvelope(
  packet: EvidencePacket,
  envelope: AuditPromptEnvelope,
  options: TopicAuditHandlerOptions,
  inputHash: string,
  cacheIdentity: TopicAuditArtifactIdentity
): SignalReading {
  return {
    auditRunId: packet.auditRunId,
    inputHash,
    topicId: packet.topicId,
    signalId: packet.signalId,
    shortCode: packet.shortCode,
    reading: envelope.prose,
    evidenceRefs: envelope.evidenceRefs,
    watchNotes: envelope.caveats,
    promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p1,
    model: options.model ?? "unknown",
    generatedAt: nowIso(options),
    cacheIdentity
  };
}

function uniqueTrimmedStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function filterRefs(values: readonly string[], allowedRefs: ReadonlySet<string>): string[] {
  return uniqueTrimmedStrings(values).filter((ref) => allowedRefs.has(ref));
}

function sanitizeShardPatternCandidates(
  candidates: readonly ShardPatternCandidate[] = [],
  allowedRefs: ReadonlySet<string>
): ShardPatternCandidate[] {
  return candidates.flatMap((candidate) => {
    const label = candidate.label.trim();
    const gist = candidate.gist.trim();
    const dynamicImplication = candidate.dynamicImplication.trim();
    if (!label || !gist || !dynamicImplication) {
      return [];
    }
    const supportRefs = filterRefs(candidate.supportRefs, allowedRefs);
    const counterRefs = filterRefs(candidate.counterRefs, allowedRefs);
    const representativeRefs = filterRefs(candidate.representativeRefs, allowedRefs);
    const counterRepresentativeRefs = filterRefs(candidate.counterRepresentativeRefs, allowedRefs);
    if ([...supportRefs, ...counterRefs, ...representativeRefs, ...counterRepresentativeRefs].length === 0) {
      return [];
    }
    return [{
      label,
      gist,
      dynamicImplication,
      supportRefs,
      counterRefs,
      representativeRefs,
      counterRepresentativeRefs,
      nInShard: Math.max(0, Math.round(candidate.nInShard)),
      uncertainty: candidate.uncertainty.trim()
    }];
  });
}

function shardReadingFromEnvelope(
  packet: EvidencePacket,
  shardIndex: number,
  shardCount: number,
  shardFragments: ReplyFragment[],
  envelope: AuditPromptEnvelope,
  options: TopicAuditHandlerOptions,
  inputHash: string,
  cacheIdentity: TopicAuditArtifactIdentity
): CommentShardReading {
  const shardRefs = shardFragments.map((fragment) => fragment.ref);
  const allowedRefs = new Set(shardRefs);
  const commentRefsInShard = filterRefs(envelope.commentRefsInShard ?? shardRefs, allowedRefs);
  return {
    auditRunId: packet.auditRunId,
    inputHash,
    topicId: packet.topicId,
    signalId: packet.signalId,
    shortCode: packet.shortCode,
    shardIndex,
    shardCount,
    reading: envelope.prose,
    commentRefsInShard: commentRefsInShard.length ? commentRefsInShard : shardRefs,
    patternCandidates: sanitizeShardPatternCandidates(envelope.patternCandidates, allowedRefs),
    lexiconCandidates: uniqueTrimmedStrings(envelope.lexiconCandidates ?? []),
    promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p0_5,
    model: options.model ?? "unknown",
    generatedAt: nowIso(options),
    cacheIdentity
  };
}

function lensMemoFromEnvelope(
  topicId: string,
  auditRunId: string,
  inputHash: string,
  stageName: TopicAuditStageName,
  envelope: AuditPromptEnvelope,
  promptVersion: string,
  options: TopicAuditHandlerOptions
): LensMemo {
  return {
    auditRunId,
    inputHash,
    topicId,
    stageName,
    prose: envelope.prose,
    evidenceRefs: envelope.evidenceRefs,
    caveats: envelope.caveats,
    ...(envelope.coverage ? { coverage: envelope.coverage } : {}),
    ...(envelope.displayHints ? { displayHints: envelope.displayHints } : {}),
    promptVersion,
    model: options.model ?? "unknown",
    generatedAt: nowIso(options)
  };
}

function reportMarkdown(report: TopicAuditReport): string {
  return [
    `# ${report.topicName}`,
    `§1 ${report.sections.overall}`,
    `§2 ${report.sections.lexicon}`,
    `§3 ${report.sections.scaleOrTime}`,
    `§4 ${report.sections.narratives}`,
    `§5 ${report.sections.audience}`,
    `§6 ${report.sections.absence}`,
    `§7 ${report.sections.editorial}`
  ].join("\n");
}

function buildReportFromEnvelope(
  topic: Topic,
  auditRunId: string,
  inputHash: string,
  envelope: AuditPromptEnvelope,
  signalReadings: SignalReading[],
  lensMemos: LensMemo[],
  options: TopicAuditHandlerOptions,
  narrativeState: TopicNarrativeState,
  generatedAt: string
): TopicAuditReport {
  const memoByStage = new Map(lensMemos.map((memo) => [memo.stageName, memo]));
  return {
    auditRunId,
    inputHash,
    topicId: topic.id,
    topicName: topic.name,
    generatedFrom: [
      ...signalReadings.map((reading) => `${reading.shortCode}:p1`),
      ...lensMemos.map((memo) => memo.stageName)
    ],
    coveragePerSection: {
      overall: envelope.coverage ?? "unknown",
      lexicon: memoByStage.get("lexicon")?.coverage ?? "unknown",
      scaleOrTime: envelope.coverage ?? "unknown",
      narratives: memoByStage.get("narrative")?.coverage ?? "unknown",
      audience: memoByStage.get("audience")?.coverage ?? "unknown",
      absence: memoByStage.get("absence")?.coverage ?? "unknown",
      editorial: envelope.coverage ?? "unknown"
    },
    sections: {
      overall: envelope.prose,
      lexicon: memoByStage.get("lexicon")?.prose ?? "",
      scaleOrTime: "",
      narratives: memoByStage.get("narrative")?.prose ?? "",
      audience: memoByStage.get("audience")?.prose ?? "",
      absence: memoByStage.get("absence")?.prose ?? "",
      editorial: envelope.prose
    },
    limitations: envelope.caveats,
    narrativeState,
    promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p6,
    model: options.model ?? "unknown",
    generatedAt
  };
}

async function saveMemos(
  storageArea: StorageAreaLike,
  topicId: string,
  auditRunId: string,
  inputHash: string,
  shardReadings: CommentShardReading[],
  signalReadings: SignalReading[],
  lensMemos: LensMemo[]
): Promise<void> {
  await saveTopicAuditMemos(storageArea, topicId, {
    auditRunId,
    inputHash,
    shardReadings,
    signalReadings,
    lensMemos
  });
}

async function generateMissingShardReadingsForPacket(
  packet: EvidencePacket,
  existingReadings: readonly CommentShardReading[],
  options: TopicAuditHandlerOptions,
  inputHash: string,
  onCheckpoint?: (generatedReadings: readonly CommentShardReading[]) => Promise<void>
): Promise<CommentShardReading[]> {
  const shards = splitPacketIntoCommentShards(packet);
  const generated: CommentShardReading[] = [];
  for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
    const expectedIdentity = expectedShardIdentity(packet, shardIndex, shards.length, options);
    const existing = existingReadings.find((reading) => (
      reading.signalId === packet.signalId
      && reading.shardIndex === shardIndex
      && reading.shardCount === shards.length
      && isTopicAuditArtifactReusable(reading.cacheIdentity, expectedIdentity)
    ));
    if (existing) {
      continue;
    }
    const shardFragments = shards[shardIndex] ?? [];
    const shardRefs = new Set(shardFragments.map((fragment) => fragment.ref));
    const envelope = await generateOrParseEnvelope(
      options.generateEnvelope,
      "comment-shard-reading",
      buildP0_5ShardReadingPrompt(packet, shardFragments),
      shardRefs
    );
    generated.push(shardReadingFromEnvelope(
      packet,
      shardIndex,
      shards.length,
      shardFragments,
      envelope,
      options,
      inputHash,
      expectedIdentity
    ));
    await onCheckpoint?.(generated);
  }
  return generated;
}

const AUDIT_STAGE_ORDER: TopicAuditStageName[] = [
  "comment-shard-reading",
  "p1-signal-reading",
  "lexicon",
  "narrative",
  "audience",
  "absence",
  "final"
];

function auditStageIndex(stageName: TopicAuditStageName): number {
  return AUDIT_STAGE_ORDER.indexOf(stageName);
}

async function runAuditPipeline(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  options: TopicAuditHandlerOptions,
  fromStage?: TopicAuditStageName,
  force?: boolean
): Promise<TopicAuditHandlerResult> {
  const signals = await loadSignals(storageArea, session.id);
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const readySignalIds = auditReadySignalIds(session, signals);
  const inputHash = buildInputHash(topic, signals, itemsById, modelKey(options));
  const provisionalAuditRunId = `audit_cache_${inputHash.replace(/^topic-audit:/, "")}`;
  const existingReport = await loadTopicAuditReport(storageArea, topic.id);
  const existingMemos = await loadTopicAuditMemos(storageArea, topic.id);
  const existingEpisodes = await loadTopicAuditEpisodes(storageArea, topic.id);
  let evidence = await buildEvidence(storageArea, session, topic, provisionalAuditRunId, inputHash);
  const validPriorNarrativeState = (candidate: TopicNarrativeState | undefined): TopicNarrativeState | null =>
    candidate?.version === "topic-narrative-state.v1" && candidate.topicId === topic.id ? candidate : null;
  // Report is deleted (not episodes) when a single signal's P1 is regenerated, so fall back to the
  // latest episode's snapshot — otherwise claim ids restart at claim-1 and Episode Explorer would draw
  // two unrelated narratives as one trajectory.
  const previousNarrativeState = validPriorNarrativeState(existingReport?.narrativeState)
    ?? validPriorNarrativeState(existingEpisodes[existingEpisodes.length - 1]?.stateSnapshot)
    ?? null;
  const fingerprints = await buildTopicAuditFingerprints({
    topic,
    packets: evidence,
    pipelineInputHash: inputHash,
    modelKey: modelKey(options),
    promptVersions: TOPIC_AUDIT_PROMPT_VERSIONS,
    shardPolicyVersion: TOPIC_AUDIT_SHARD_POLICY_VERSION
  });
  // force = explicit 重新生成 on unchanged sources: reuse P0.5/P1 memos below but re-run the lens stages,
  // otherwise a prompt change (e.g. P4 compass scalars) can never reach an already-audited topic
  if (!fromStage && !force && await canFastReturnAudit({
    report: existingReport,
    memos: existingMemos,
    episodes: existingEpisodes,
    fingerprints,
    inputHash,
    packets: evidence,
    readySignalIds,
    options
  })) {
    evidence = evidence.map((packet) => ({ ...packet, auditRunId: existingReport!.auditRunId }));
    return {
      auditEvidence: evidence,
      auditReport: existingReport,
      auditMemos: existingMemos,
      auditEpisodes: existingEpisodes,
      auditValidatorFlags: validateTopicAuditDraft({
        packets: evidence,
        reportMarkdown: reportMarkdown(existingReport!)
      })
    };
  }

  const auditRunId = buildTopicAuditRunId(fingerprints, nextAuditRunNonce(options));
  evidence = evidence.map((packet) => ({ ...packet, auditRunId }));
  await saveTopicAuditEvidence(storageArea, topic.id, evidence);

  const allowedRefs = allAllowedRefs(evidence);
  const resumeIndex = fromStage ? auditStageIndex(fromStage) : 0;
  const shardStageIndex = auditStageIndex("comment-shard-reading");
  const shardReadings: CommentShardReading[] = existingMemos && (!fromStage || resumeIndex > shardStageIndex)
    ? collectReusableShardReadings(
        evidence,
        existingMemos.shardReadings ?? [],
        readySignalIds,
        options
      )
    : [];
  const signalReadings: SignalReading[] = existingMemos
    ? await collectReusableSignalReadings(
        evidence,
        existingMemos.signalReadings,
        shardReadings,
        readySignalIds,
        options
      )
    : [];
  const lensMemos: LensMemo[] = fromStage && existingMemos?.inputHash === inputHash
    ? existingMemos.lensMemos.filter((memo) => (
        auditStageIndex(memo.stageName) < resumeIndex
        && storedLensMemoIsSafe(memo, allowedRefs)
      ))
    : [];
  const p1Failures: string[] = [];

  const shardEligiblePackets = evidence.filter((packet) => readySignalIds.has(packet.signalId));
  let upstreamChanged = false;
  for (const packet of shardEligiblePackets) {
    const generated = await generateMissingShardReadingsForPacket(
      packet,
      shardReadings,
      options,
      inputHash,
      async (checkpoint) => saveMemos(
        storageArea,
        topic.id,
        auditRunId,
        inputHash,
        [...shardReadings, ...checkpoint],
        signalReadings,
        lensMemos
      )
    );
    if (generated.length > 0) {
      shardReadings.push(...generated);
      upstreamChanged = true;
    }
  }

  if (existingMemos) {
    const additionallyReusable = await collectReusableSignalReadings(
      evidence,
      existingMemos.signalReadings,
      shardReadings,
      readySignalIds,
      options
    );
    const existingSignalIds = new Set(signalReadings.map((reading) => reading.signalId));
    signalReadings.push(...additionallyReusable.filter((reading) => !existingSignalIds.has(reading.signalId)));
  }

  const readingBySignalId = new Map(signalReadings.map((reading) => [reading.signalId, reading]));
  const missingPackets = evidence.filter((packet) => readySignalIds.has(packet.signalId) && !readingBySignalId.has(packet.signalId));
  if (missingPackets.length > 0) {
    upstreamChanged = true;
    for (const packet of missingPackets) {
      try {
        const envelope = await generateOrParseEnvelope(
          options.generateEnvelope,
          "p1-signal-reading",
          buildP1SignalReadingPrompt(
            packet,
            shardReadings.filter((reading) => reading.signalId === packet.signalId)
          ),
          allAllowedRefs([packet])
        );
        const packetShardReadings = shardReadings.filter((reading) => reading.signalId === packet.signalId);
        signalReadings.push(signalReadingFromEnvelope(
          packet,
          envelope,
          options,
          inputHash,
          await expectedSignalReadingIdentity(packet, packetShardReadings, options)
        ));
      } catch {
        p1Failures.push(packet.shortCode);
      }
    }
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, shardReadings, signalReadings, lensMemos);
  }

  if (upstreamChanged) {
    lensMemos.splice(0, lensMemos.length);
  }

  let lexiconMemo = lensMemos.find((memo) => memo.stageName === "lexicon") ?? null;
  if (!lexiconMemo) {
    const lexiconEnvelope = await generateOrParseEnvelope(
      options.generateEnvelope,
      "lexicon",
      buildP2LexiconPrompt({ topicName: topic.name, packets: evidence, signalReadings, shardReadings }),
      allowedRefs
    );
    if (p1Failures.length) {
      lexiconEnvelope.caveats = [...lexiconEnvelope.caveats, `P1 failures: ${p1Failures.join(", ")}`];
    }
    lexiconMemo = lensMemoFromEnvelope(topic.id, auditRunId, inputHash, "lexicon", lexiconEnvelope, TOPIC_AUDIT_PROMPT_VERSIONS.p2, options);
    lensMemos.push(lexiconMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, shardReadings, signalReadings, lensMemos);
  }

  if (!lensMemos.some((memo) => memo.stageName === "narrative")) {
    const narrativeMemo = lensMemoFromEnvelope(
      topic.id,
      auditRunId,
      inputHash,
      "narrative",
      await generateOrParseEnvelope(
        options.generateEnvelope,
        "narrative",
        buildP3NarrativePrompt({
          topicName: topic.name,
          packets: evidence,
          signalReadings,
          lexiconMemo,
          priorNarrativeState: previousNarrativeState
        }),
        allowedRefs
      ),
      TOPIC_AUDIT_PROMPT_VERSIONS.p3,
      options
    );
    lensMemos.push(narrativeMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, shardReadings, signalReadings, lensMemos);
  }

  if (!lensMemos.some((memo) => memo.stageName === "audience")) {
    const audienceMemo = lensMemoFromEnvelope(
      topic.id,
      auditRunId,
      inputHash,
      "audience",
      await generateOrParseEnvelope(
        options.generateEnvelope,
        "audience",
        buildP4AudiencePrompt({
          topicName: topic.name,
          packets: evidence,
          signalReadings,
          lensMemos,
          shardReadings,
          priorNarrativeState: previousNarrativeState
        }),
        allowedRefs
      ),
      TOPIC_AUDIT_PROMPT_VERSIONS.p4,
      options
    );
    lensMemos.push(audienceMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, shardReadings, signalReadings, lensMemos);
  }

  if (!lensMemos.some((memo) => memo.stageName === "absence")) {
    const absenceMemo = lensMemoFromEnvelope(
      topic.id,
      auditRunId,
      inputHash,
      "absence",
      await generateOrParseEnvelope(
        options.generateEnvelope,
        "absence",
        buildP5AbsencePrompt({ topicName: topic.name, packets: evidence, signalReadings, lensMemos, shardReadings }),
        allowedRefs
      ),
      TOPIC_AUDIT_PROMPT_VERSIONS.p5,
      options
    );
    lensMemos.push(absenceMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, shardReadings, signalReadings, lensMemos);
  }

  const finalEnvelope = await generateOrParseEnvelope(
    options.generateEnvelope,
    "final",
    buildP6FinalReportPrompt({
      topicName: topic.name,
      packets: evidence,
      signalReadings,
      lensMemos,
      priorNarrativeState: previousNarrativeState
    }),
    allowedRefs
  );
  const generatedAt = nowIso(options);
  const narrativeState = materializeNarrativeState({
    topicId: topic.id,
    auditRunId,
    packets: evidence,
    fingerprints,
    generatedAt,
    previousState: previousNarrativeState,
    review: finalEnvelope.continuityReview
  });
  const report = buildReportFromEnvelope(
    topic,
    auditRunId,
    inputHash,
    finalEnvelope,
    signalReadings,
    lensMemos,
    options,
    narrativeState,
    generatedAt
  );
  const flags = validateTopicAuditDraft({ packets: evidence, reportMarkdown: reportMarkdown(report) });
  const auditEpisodes = evolveTopicAuditEpisodes(existingEpisodes, {
    topicId: topic.id,
    auditRunId,
    inputHash,
    generatedAt,
    state: narrativeState,
    packets: evidence,
    audienceMemo: lensMemos.find((memo) => memo.stageName === "audience") ?? null
  });
  await publishTopicAuditReportAndEpisodes(storageArea, report, auditEpisodes);
  return {
    auditEvidence: evidence,
    auditMemos: { auditRunId, inputHash, shardReadings, signalReadings, lensMemos },
    auditReport: report,
    auditEpisodes,
    auditValidatorFlags: flags
  };
}

async function runP1ForSingleSignal(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  signalId: string,
  options: TopicAuditHandlerOptions
): Promise<TopicAuditHandlerResult> {
  const signals = await loadSignals(storageArea, session.id);
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const readySignalIds = auditReadySignalIds(session, signals);
  const inputHash = buildInputHash(topic, signals, itemsById, modelKey(options));
  const auditRunId = `audit_${inputHash.replace(/^topic-audit:/, "")}`;

  const evidence = await buildAndSaveEvidence(storageArea, session, topic, auditRunId, inputHash);
  const targetPacket = evidence.find((packet) => packet.signalId === signalId);
  if (!targetPacket) {
    throw new Error("Signal not found in evidence for this topic");
  }
  if (!readySignalIds.has(targetPacket.signalId)) {
    throw new Error("Signal is not ready for audit; crawl it before generating a reading");
  }
  const existingMemos = await loadTopicAuditMemos(storageArea, topic.id);
  const shardReadings: CommentShardReading[] = existingMemos
    ? collectReusableShardReadings(
        evidence,
        existingMemos.shardReadings ?? [],
        readySignalIds,
        options
      )
    : [];
  const signalReadings: SignalReading[] = existingMemos
    ? (await collectReusableSignalReadings(
        evidence,
        existingMemos.signalReadings,
        shardReadings,
        readySignalIds,
        options
      )).filter((reading) => reading.signalId !== signalId)
    : [];
  const lensMemos: LensMemo[] = [];

  await deleteMapEntry(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, topic.id);

  const generatedShardReadings = await generateMissingShardReadingsForPacket(
    targetPacket,
    shardReadings,
    options,
    inputHash,
    async (checkpoint) => saveMemos(
      storageArea,
      topic.id,
      auditRunId,
      inputHash,
      [...shardReadings, ...checkpoint],
      signalReadings,
      lensMemos
    )
  );
  if (generatedShardReadings.length > 0) {
    shardReadings.push(...generatedShardReadings);
  }

  const envelope = await generateOrParseEnvelope(
    options.generateEnvelope,
    "p1-signal-reading",
    buildP1SignalReadingPrompt(
      targetPacket,
      shardReadings.filter((reading) => reading.signalId === targetPacket.signalId)
    ),
    allAllowedRefs([targetPacket])
  );
  const packetShardReadings = shardReadings.filter((reading) => reading.signalId === targetPacket.signalId);
  signalReadings.push(signalReadingFromEnvelope(
    targetPacket,
    envelope,
    options,
    inputHash,
    await expectedSignalReadingIdentity(targetPacket, packetShardReadings, options)
  ));
  await saveMemos(storageArea, topic.id, auditRunId, inputHash, shardReadings, signalReadings, lensMemos);
  await deleteMapEntry(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, topic.id);

  return {
    auditEvidence: evidence,
    auditMemos: { auditRunId, inputHash, shardReadings, signalReadings, lensMemos },
    auditReport: null
  };
}

async function deleteMapEntry(storageArea: StorageAreaLike, storageKey: string, key: string): Promise<void> {
  const raw = await storageArea.get(storageKey);
  const map = raw[storageKey] && typeof raw[storageKey] === "object" && !Array.isArray(raw[storageKey])
    ? { ...(raw[storageKey] as Record<string, unknown>) }
    : {};
  delete map[key];
  await storageArea.set({ [storageKey]: map });
}

export async function handleTopicAuditMessage(
  storageArea: StorageAreaLike,
  options: TopicAuditHandlerOptions
): Promise<TopicAuditHandlerResult> {
  const { message } = options;
  switch (message.type) {
    case "topic/audit/build-evidence": {
      const session = findSession(options.sessions, message.sessionId);
      const topic = await findTopic(storageArea, message.sessionId, message.topicId);
      const signals = await loadSignals(storageArea, session.id);
      const inputHash = buildInputHash(topic, signals, new Map(session.items.map((item) => [item.id, item])));
      const auditRunId = `audit_${inputHash.replace(/^topic-audit:/, "")}`;
      const auditEvidence = await buildAndSaveEvidence(storageArea, session, topic, auditRunId, inputHash);
      return { auditEvidence };
    }
    case "topic/audit/run": {
      const session = findSession(options.sessions, message.sessionId);
      const topic = await findTopic(storageArea, message.sessionId, message.topicId);
      return runAuditPipeline(storageArea, session, topic, options, message.fromStage, message.force);
    }
    case "topic/audit/p1-signal": {
      const session = findSession(options.sessions, message.sessionId);
      const topic = await findTopic(storageArea, message.sessionId, message.topicId);
      return runP1ForSingleSignal(storageArea, session, topic, message.signalId, options);
    }
    case "topic/audit/get": {
      const [auditEvidence, auditMemos, auditReport, auditEpisodes] = await Promise.all([
        loadTopicAuditEvidence(storageArea, message.topicId),
        loadTopicAuditMemos(storageArea, message.topicId),
        loadTopicAuditReport(storageArea, message.topicId),
        loadTopicAuditEpisodes(storageArea, message.topicId)
      ]);
      return {
        auditEvidence,
        auditMemos,
        auditReport,
        auditEpisodes,
        auditValidatorFlags: isTopicAuditPublicationCompatible(auditReport, auditMemos, auditEvidence)
          ? validateTopicAuditDraft({ packets: auditEvidence, reportMarkdown: reportMarkdown(auditReport!) })
          : []
      };
    }
    case "topic/audit/validate": {
      const [report, memos, packets] = await Promise.all([
        loadTopicAuditReport(storageArea, message.topicId),
        loadTopicAuditMemos(storageArea, message.topicId),
        loadTopicAuditEvidence(storageArea, message.topicId)
      ]);
      return {
        auditValidatorFlags: isTopicAuditPublicationCompatible(report, memos, packets)
          ? validateTopicAuditDraft({ packets, reportMarkdown: reportMarkdown(report!) })
          : []
      };
    }
    case "topic/audit/clear":
      await deleteMapEntry(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY, message.topicId);
      await deleteMapEntry(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY, message.topicId);
      await deleteMapEntry(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, message.topicId);
      await deleteMapEntry(storageArea, TOPIC_AUDIT_EPISODES_STORAGE_KEY, message.topicId);
      return { auditEvidence: [], auditMemos: null, auditReport: null, auditEpisodes: [] };
    case "cross-topic/calibrate": {
      if (message.topicIds.length < 2) {
        throw new Error("Need at least 2 topics for cross-topic calibration");
      }
      const reports = await Promise.all(message.topicIds.map(async (topicId) => {
        const report = await loadTopicAuditReport(storageArea, topicId);
        const memos = await loadTopicAuditMemos(storageArea, topicId);
        if (!report || !memos) {
          throw new Error(`Missing audit report for ${topicId}`);
        }
        const absenceMemo = memos.lensMemos.find((memo) => memo.stageName === "absence")?.prose ?? "";
        return {
          topicId,
          topicName: report.topicName,
          absenceMemo,
          finalSummary: reportMarkdown(report)
        };
      }));
      const prompt = buildP8CrossTopicCalibrationPrompt({ topicReports: reports });
      const envelope = await generateOrParseEnvelope(options.generateEnvelope, "final", prompt, new Set(), false);
      const calibration: CrossTopicCalibration = {
        id: `calibration_${Date.now().toString(36)}`,
        topicIds: message.topicIds,
        topicsCompared: reports.map((report) => report.topicName),
        decompositions: [{
          findingFromTopic: envelope.prose,
          perTopicResult: Object.fromEntries(reports.map((report) => [report.topicName, report.absenceMemo])),
          verdict: "undetermined",
          strength: "weak-inference",
          caveats: envelope.caveats
        }],
        promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p8,
        model: options.model ?? "unknown",
        generatedAt: nowIso(options)
      };
      await saveCrossTopicCalibration(storageArea, calibration);
      return {
        crossTopicCalibration: calibration,
        auditValidatorFlags: validateCrossTopicCalibrationDraft({
          topicCount: reports.length,
          calibrationMarkdown: envelope.prose
        })
      };
    }
    default:
      return {};
  }
}
