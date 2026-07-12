import { projectCapturedPost, type CapturedPostFragment, type CapturedPostProjection } from "../state/captured-post.ts";
import type { SessionItem, Signal, SignalTagsRecord, Topic } from "../state/types.ts";

export type TopicAuditStatus = "succeeded" | "queued" | "failed";
export type ReplyFragmentRole = "op_continuation" | "op_reply" | "audience" | "placeholder";
export type TopicAuditStageName = "comment-shard-reading" | "p1-signal-reading" | "lexicon" | "narrative" | "audience" | "absence" | "final";

export interface TopicAuditSignalIdentity {
  version: "topic-audit-signal.v1";
  contentHash: string;
  referenceHash: string;
}

export interface TopicAuditArtifactIdentity extends TopicAuditSignalIdentity {
  producerKey: string;
  upstreamHash?: string;
}

export type NarrativeTrajectory = "new" | "stable" | "strengthened" | "weakened" | "retired";

export interface NarrativeAnchorRef {
  anchorId: string;
  displayRef: string;
  stability: "stable" | "synthetic";
}

export interface NarrativeClaim {
  id: string;
  statement: string;
  rationale: string;
  trajectory: NarrativeTrajectory;
  evidence: NarrativeAnchorRef[];
}

export interface NarrativeVoice {
  id: string;
  label: string;
  position: string;
  evidence: NarrativeAnchorRef[];
}

export interface NarrativeOpenQuestion {
  id: string;
  question: string;
}

export interface TopicAuditFingerprints {
  evidence: string;
  definition: string;
  pipeline: string;
}

export interface TopicNarrativeState {
  version: "topic-narrative-state.v1";
  topicId: string;
  auditRunId: string;
  previousAuditRunId?: string;
  fingerprints: TopicAuditFingerprints;
  nextIds: { claim: number; voice: number; question: number };
  claims: NarrativeClaim[];
  voices: NarrativeVoice[];
  openQuestions: NarrativeOpenQuestion[];
  updatedAt: string;
}

export interface TopicAuditEpisodeDelta {
  claimId: string;
  trajectory: Exclude<NarrativeTrajectory, "stable">;
  statement: string;
  rationale: string;
  evidence: NarrativeAnchorRef[];
}

export interface TopicAuditEpisode {
  version: "topic-audit-episode.v1";
  id: string;
  topicId: string;
  auditRunId: string;
  inputHash: string;
  generatedAt: string;
  transition: "first" | "advance" | "rebase";
  previousEpisodeId?: string;
  fingerprints: TopicAuditFingerprints;
  sourceCount: number;
  capturedRange?: { from: string; to: string };
  stateSnapshot: TopicNarrativeState;
  delta: TopicAuditEpisodeDelta[];
  reactionSnapshot: {
    coverage?: ReactionCoverage;
    patterns: Array<{
      id: string;
      label: string;
      nComments: number;
      nAuthors: number;
      coverageDenominator: number;
    }>;
  };
}

export interface NarrativeContinuityReview {
  carriedClaims: Array<{
    claimId: string;
    outcome: Exclude<NarrativeTrajectory, "new">;
    statement: string;
    rationale: string;
    evidenceRefs: string[];
    notReobserved?: boolean;
  }>;
  newClaims: Array<{
    statement: string;
    rationale: string;
    evidenceRefs: string[];
  }>;
  voices: Array<{
    label: string;
    position: string;
    evidenceRefs: string[];
  }>;
  openQuestions: string[];
}

export interface ReplyFragment {
  ref: string;
  commentId?: string | null;
  commentIdSource?: "captured" | "fallback";
  sourceId?: string | null;
  parentId?: string | null;
  replyCount?: number | null;
  timeToken?: string | null;
  author: string;
  text: string;
  likes: number | null;
  role: ReplyFragmentRole;
}

export interface EvidencePacket {
  auditRunId: string;
  inputHash: string;
  topicId: string;
  signalId: string;
  itemId: string | null;
  shortCode: string;
  sourceUrl: string;
  capturedAt: string;
  status: TopicAuditStatus;
  opAuthor: string;
  opText: string;
  opLikes: number | null;
  commentCount: number | null;
  replyFragments: ReplyFragment[];
  aiArtifacts?: {
    gist?: string;
    tags?: string[];
  };
  gaps: string[];
  notes: string[];
  signalIdentity?: TopicAuditSignalIdentity;
}

export interface SignalReading {
  auditRunId: string;
  inputHash: string;
  topicId: string;
  signalId: string;
  shortCode: string;
  reading: string;
  evidenceRefs: string[];
  watchNotes: string[];
  promptVersion: string;
  model: string;
  generatedAt: string;
  cacheIdentity?: TopicAuditArtifactIdentity;
}

export interface LensMemo {
  auditRunId: string;
  inputHash: string;
  topicId: string;
  stageName: TopicAuditStageName;
  prose: string;
  evidenceRefs: string[];
  caveats: string[];
  coverage?: string;
  displayHints?: {
    themeChips?: string[];
    narrativeLanes?: Array<{
      id: string;
      label: string;
      signalRefs: string[];
      consensus: number;
      icon?: string;
    }>;
    reactionCoverage?: ReactionCoverage;
    reactionPatterns?: ReactionPattern[];
  };
  promptVersion: string;
  model: string;
  generatedAt: string;
}

export interface ReactionCoverage {
  postCount: number;
  capturedCommentCount: number;
  readCommentCount: number;
  usableAudienceCommentCount: number;
}

export interface ReactionPattern {
  id: string;
  label: string;
  dynamicImplication: string;
  nComments: number;
  nAuthors: number;
  coverageDenominator: number;
  supportRefs: string[];
  counterRefs: string[];
  representativeRefs: string[];
  counterRepresentativeRefs: string[];
  icon?: string;
  /** LLM-read compass placement, -1 質疑/悲觀 → +1 支持/正面; absent on pre-0.3.20 audits */
  valence?: number;
  /** LLM-read compass placement, -1 行動導向 → +1 情緒共鳴; absent on pre-0.3.20 audits */
  mode?: number;
}

export interface ShardPatternCandidate {
  label: string;
  gist: string;
  dynamicImplication: string;
  supportRefs: string[];
  counterRefs: string[];
  representativeRefs: string[];
  counterRepresentativeRefs: string[];
  nInShard: number;
  uncertainty: string;
}

export interface CommentShardReading {
  auditRunId: string;
  inputHash: string;
  topicId: string;
  signalId: string;
  shortCode: string;
  shardIndex: number;
  shardCount: number;
  /** Persisted P0.5 blank-read prose; optional for pre-0.3.34 memo compatibility. */
  reading?: string;
  commentRefsInShard: string[];
  patternCandidates: ShardPatternCandidate[];
  lexiconCandidates: string[];
  promptVersion: string;
  model: string;
  generatedAt: string;
  cacheIdentity?: TopicAuditArtifactIdentity;
}

export interface CommentShardSplitOptions {
  targetCommentsPerShard?: number;
  targetCharsPerShard?: number;
}

export interface PostReactionObservation {
  signalId: string;
  shortCode: string;
  label: string;
  gist: string;
  dynamicImplication: string;
  nComments: number;
  nAuthors: number;
  coverageDenominator: number;
  supportRefs: string[];
  counterRefs: string[];
  representativeRefs: string[];
  counterRepresentativeRefs: string[];
  uncertainty: string;
}

export interface TopicAuditReport {
  auditRunId: string;
  inputHash: string;
  topicId: string;
  topicName: string;
  generatedFrom: string[];
  coveragePerSection: Record<string, string>;
  sections: {
    overall: string;
    lexicon: string;
    scaleOrTime: string;
    narratives: string;
    audience: string;
    absence: string;
    editorial: string;
  };
  limitations: string[];
  narrativeState?: TopicNarrativeState;
  promptVersion: string;
  model: string;
  generatedAt: string;
}

export interface CrossTopicCalibration {
  id: string;
  topicIds: string[];
  topicsCompared: string[];
  decompositions: Array<{
    findingFromTopic: string;
    perTopicResult: Record<string, string>;
    verdict: "topic-specific" | "platform-affordance" | "cultural-pattern" | "undetermined";
    strength: "strong" | "medium" | "weak-inference";
    caveats: string[];
  }>;
  promptVersion: string;
  model: string;
  generatedAt: string;
}

export interface TopicEvidencePacketInput {
  topic: Topic;
  signals: Signal[];
  items: SessionItem[];
  signalTagsByItemId?: Record<string, SignalTagsRecord>;
  auditRunId?: string;
  inputHash?: string;
}

function normalizeStatus(item: SessionItem): TopicAuditStatus {
  if (item.status === "failed") {
    return "failed";
  }
  if (item.status === "succeeded") {
    return "succeeded";
  }
  return "queued";
}

function makeFragmentRef(shortCode: string, role: ReplyFragmentRole, index: number): string {
  if (role === "op_continuation") {
    return `${shortCode}.OPC${index}`;
  }
  if (role === "op_reply") {
    return `${shortCode}.OPR${index}`;
  }
  if (role === "placeholder") {
    return `${shortCode}.P${index}`;
  }
  return `${shortCode}.R${index}`;
}

function buildReplyFragments(shortCode: string, capturedPost: CapturedPostProjection): ReplyFragment[] {
  const fragments: ReplyFragment[] = [];
  let opIndex = 0;
  let opReplyIndex = 0;
  let audienceIndex = 0;
  let placeholderIndex = 0;

  const pushFragment = (fragment: CapturedPostFragment) => {
    const role = fragment.role;
    const index = role === "op_continuation"
      ? ++opIndex
      : role === "op_reply"
        ? ++opReplyIndex
        : role === "placeholder"
          ? ++placeholderIndex
          : ++audienceIndex;
    fragments.push({
      ref: makeFragmentRef(shortCode, role, index),
      commentId: fragment.id,
      commentIdSource: fragment.idSource,
      sourceId: fragment.sourceId,
      parentId: fragment.parentId,
      replyCount: fragment.replyCount,
      timeToken: fragment.timeToken,
      author: fragment.author,
      text: fragment.text,
      likes: fragment.likes,
      role
    });
  };

  const discussionFragments = new Set(capturedPost.discussionReplies);
  capturedPost.opContinuations
    .filter((fragment) => !discussionFragments.has(fragment))
    .forEach(pushFragment);
  capturedPost.discussionReplies.forEach(pushFragment);
  return fragments;
}

function buildAiArtifacts(record: SignalTagsRecord | undefined): EvidencePacket["aiArtifacts"] | undefined {
  if (!record || record.status !== "complete") {
    return undefined;
  }
  return {
    ...(record.signalGist ? { gist: record.signalGist } : {}),
    ...(record.signalTags.length > 0 ? { tags: record.signalTags } : {})
  };
}

export function getAudienceReplies(packet: EvidencePacket): ReplyFragment[] {
  return packet.replyFragments.filter((fragment) => fragment.role === "audience");
}

export function splitPacketIntoCommentShards(
  packet: EvidencePacket,
  options: CommentShardSplitOptions = {}
): ReplyFragment[][] {
  const audienceReplies = getAudienceReplies(packet);
  const targetComments = Math.max(1, Math.round(options.targetCommentsPerShard ?? 120));
  const targetChars = Math.max(1, Math.round(options.targetCharsPerShard ?? 18000));
  const totalChars = audienceReplies.reduce((sum, fragment) => sum + fragment.text.length, 0);
  if (audienceReplies.length <= targetComments && totalChars <= targetChars) {
    return [audienceReplies];
  }

  const shards: ReplyFragment[][] = [];
  let current: ReplyFragment[] = [];
  let currentChars = 0;
  for (const fragment of audienceReplies) {
    const nextChars = currentChars + fragment.text.length;
    const shouldCut = current.length > 0 && (current.length >= targetComments || nextChars > targetChars);
    if (shouldCut) {
      shards.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(fragment);
    currentChars += fragment.text.length;
  }
  if (current.length > 0) {
    shards.push(current);
  }
  return shards.length ? shards : [[]];
}

function uniqueStrings(values: string[]): string[] {
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

function reactionKey(label: string): string {
  return label
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function fragmentCountKey(fragment: ReplyFragment | undefined, ref: string): string {
  return fragment?.commentId ? `comment:${fragment.commentId}` : `ref:${ref}`;
}

function distinctAudienceCommentCount(fragments: ReplyFragment[]): number {
  return new Set(fragments.map((fragment) => fragmentCountKey(fragment, fragment.ref))).size;
}

export function mergeShardReadingsByPost(
  packet: EvidencePacket,
  shardReadings: CommentShardReading[]
): PostReactionObservation[] {
  const audienceReplies = getAudienceReplies(packet);
  const fragmentByRef = new Map(packet.replyFragments.map((fragment) => [fragment.ref, fragment]));
  const byKey = new Map<string, {
    signalId: string;
    shortCode: string;
    label: string;
    gist: string;
    dynamicImplication: string;
    supportRefs: string[];
    counterRefs: string[];
    representativeRefs: string[];
    counterRepresentativeRefs: string[];
    supportCommentKeys: Set<string>;
    supportAuthors: Map<string, string>;
    uncertainty: string[];
  }>();

  for (const reading of shardReadings.filter((entry) => entry.signalId === packet.signalId)) {
    for (const candidate of reading.patternCandidates) {
      const key = reactionKey(candidate.label);
      if (!key) {
        continue;
      }
      const existing = byKey.get(key) ?? {
        signalId: packet.signalId,
        shortCode: packet.shortCode,
        label: candidate.label,
        gist: candidate.gist,
        dynamicImplication: candidate.dynamicImplication,
        supportRefs: [],
        counterRefs: [],
        representativeRefs: [],
        counterRepresentativeRefs: [],
        supportCommentKeys: new Set<string>(),
        supportAuthors: new Map<string, string>(),
        uncertainty: []
      };
      existing.supportRefs.push(...candidate.supportRefs);
      existing.counterRefs.push(...candidate.counterRefs);
      existing.representativeRefs.push(...candidate.representativeRefs);
      existing.counterRepresentativeRefs.push(...candidate.counterRepresentativeRefs);
      if (candidate.uncertainty.trim()) {
        existing.uncertainty.push(candidate.uncertainty);
      }
      for (const ref of candidate.supportRefs) {
        const fragment = fragmentByRef.get(ref);
        if (!fragment || fragment.role !== "audience") {
          continue;
        }
        const commentKey = fragmentCountKey(fragment, ref);
        existing.supportCommentKeys.add(commentKey);
        if (!existing.supportAuthors.has(commentKey)) {
          existing.supportAuthors.set(commentKey, fragment.author.trim() || commentKey);
        }
      }
      byKey.set(key, existing);
    }
  }

  return [...byKey.values()]
    .map((entry) => ({
      signalId: entry.signalId,
      shortCode: entry.shortCode,
      label: entry.label,
      gist: entry.gist,
      dynamicImplication: entry.dynamicImplication,
      nComments: entry.supportCommentKeys.size,
      nAuthors: new Set(entry.supportAuthors.values()).size,
      coverageDenominator: distinctAudienceCommentCount(audienceReplies),
      supportRefs: uniqueStrings(entry.supportRefs),
      counterRefs: uniqueStrings(entry.counterRefs),
      representativeRefs: uniqueStrings(entry.representativeRefs),
      counterRepresentativeRefs: uniqueStrings(entry.counterRepresentativeRefs),
      uncertainty: uniqueStrings(entry.uncertainty).join(" / ")
    }))
    .filter((entry) => entry.nComments > 0);
}

export function getOpContinuations(packet: EvidencePacket): ReplyFragment[] {
  return packet.replyFragments.filter((fragment) => fragment.role === "op_continuation");
}

export function getPlaceholderReplies(packet: EvidencePacket): ReplyFragment[] {
  return packet.replyFragments.filter((fragment) => fragment.role === "placeholder");
}

export function buildTopicEvidencePackets(input: TopicEvidencePacketInput): EvidencePacket[] {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const signalById = new Map(input.signals.map((signal) => [signal.id, signal]));
  const packets: EvidencePacket[] = [];

  input.topic.signalIds.forEach((signalId, index) => {
    const signal = signalById.get(signalId);
    if (!signal?.itemId) {
      return;
    }
    const item = itemById.get(signal.itemId);
    if (!item) {
      return;
    }

    const shortCode = `S${index + 1}`;
    const capturedPost = projectCapturedPost(item);
    const status = normalizeStatus(item);
    const gaps: string[] = [];
    if (status !== "succeeded") {
      gaps.push("capture not completed");
    }
    if (!capturedPost.hasThreadReadModel) {
      gaps.push("thread read model unavailable");
    }
    if (!capturedPost.text) {
      gaps.push("op text unavailable");
    }

    packets.push({
      auditRunId: input.auditRunId ?? "",
      inputHash: input.inputHash ?? "",
      topicId: input.topic.id,
      signalId: signal.id,
      itemId: item.id,
      shortCode,
      sourceUrl: capturedPost.sourceUrl,
      capturedAt: signal.capturedAt || item.savedAt || item.descriptor.captured_at,
      status,
      opAuthor: capturedPost.author,
      opText: capturedPost.text,
      opLikes: capturedPost.likes,
      commentCount: status === "succeeded" ? capturedPost.commentCount : null,
      replyFragments: status === "succeeded" ? buildReplyFragments(shortCode, capturedPost) : [],
      aiArtifacts: buildAiArtifacts(input.signalTagsByItemId?.[item.id]),
      gaps,
      notes: []
    });
  });

  return packets;
}
