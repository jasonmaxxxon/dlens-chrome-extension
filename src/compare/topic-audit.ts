import { projectCapturedPost, type CapturedPostFragment, type CapturedPostProjection } from "../state/captured-post.ts";
import type { SessionItem, Signal, SignalTagsRecord, Topic } from "../state/types.ts";

export type TopicAuditStatus = "succeeded" | "queued" | "failed";
export type ReplyFragmentRole = "op_continuation" | "audience" | "placeholder";
export type TopicAuditStageName = "p1-signal-reading" | "lexicon" | "narrative" | "audience" | "absence" | "final";

export interface ReplyFragment {
  ref: string;
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
  };
  promptVersion: string;
  model: string;
  generatedAt: string;
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
  if (role === "placeholder") {
    return `${shortCode}.P${index}`;
  }
  return `${shortCode}.R${index}`;
}

function buildReplyFragments(shortCode: string, capturedPost: CapturedPostProjection): ReplyFragment[] {
  const fragments: ReplyFragment[] = [];
  let opIndex = 0;
  let audienceIndex = 0;
  let placeholderIndex = 0;

  const pushFragment = (fragment: CapturedPostFragment) => {
    const role = fragment.role;
    const index = role === "op_continuation"
      ? ++opIndex
      : role === "placeholder"
        ? ++placeholderIndex
        : ++audienceIndex;
    fragments.push({
      ref: makeFragmentRef(shortCode, role, index),
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
