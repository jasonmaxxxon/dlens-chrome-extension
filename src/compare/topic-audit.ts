import type {
  CaptureSnapshot,
  ThreadReadModelPostSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
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
    laneLabels?: string[];
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

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readTextString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readThreadReadModel(capture: CaptureSnapshot | null | undefined): ThreadReadModelSnapshot | null {
  const result = capture?.result;
  return result?.threadReadModel ?? result?.thread_read_model ?? null;
}

function readRootPost(model: ThreadReadModelSnapshot | null): ThreadReadModelPostSnapshot | null {
  return model?.rootPost ?? model?.root_post ?? null;
}

function readOpContinuations(model: ThreadReadModelSnapshot | null): ThreadReadModelPostSnapshot[] {
  return model?.opContinuations ?? model?.op_continuations ?? [];
}

function readDiscussionReplies(model: ThreadReadModelSnapshot | null): ThreadReadModelPostSnapshot[] {
  return model?.discussionReplies ?? model?.discussion_replies ?? [];
}

function readPostText(post: ThreadReadModelPostSnapshot | null | undefined): string {
  return readTextString(post?.text);
}

function readPostAuthor(post: ThreadReadModelPostSnapshot | null | undefined): string {
  return readTrimmedString(post?.author);
}

function readPostLikes(post: ThreadReadModelPostSnapshot | null | undefined): number | null {
  return readNumberOrNull(post?.likeCount ?? post?.like_count);
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

function resolveOpAuthor(item: SessionItem, rootPost: ThreadReadModelPostSnapshot | null): string {
  return readPostAuthor(rootPost) || readTrimmedString(item.latestCapture?.author_hint) || readTrimmedString(item.descriptor.author_hint);
}

function resolveOpText(item: SessionItem, rootPost: ThreadReadModelPostSnapshot | null): string {
  return readPostText(rootPost)
    || readTextString(item.latestCapture?.text_snippet)
    || readTextString(item.descriptor.text_snippet);
}

function resolveSourceUrl(item: SessionItem): string {
  return readTrimmedString(item.latestCapture?.source_post_url)
    || readTrimmedString(item.latestCapture?.canonical_target_url)
    || readTrimmedString(item.canonicalTargetUrl)
    || readTrimmedString(item.descriptor.post_url);
}

function resolveCommentCount(item: SessionItem): number | null {
  const analysisCount = readNumberOrNull(item.latestCapture?.analysis?.source_comment_count);
  if (analysisCount !== null) {
    return analysisCount;
  }
  return readNumberOrNull(item.descriptor.engagement.comments);
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

function buildReplyFragments(shortCode: string, model: ThreadReadModelSnapshot | null, opAuthor: string): ReplyFragment[] {
  const fragments: ReplyFragment[] = [];
  let opIndex = 0;
  let audienceIndex = 0;
  let placeholderIndex = 0;
  const normalizedOpAuthor = opAuthor.toLowerCase();

  const pushFragment = (post: ThreadReadModelPostSnapshot, forcedRole?: ReplyFragmentRole) => {
    const text = readPostText(post);
    if (!text) {
      return;
    }
    const author = readPostAuthor(post);
    const role: ReplyFragmentRole = forcedRole
      ?? (!author ? "placeholder" : author.toLowerCase() === normalizedOpAuthor ? "op_continuation" : "audience");
    const index = role === "op_continuation"
      ? ++opIndex
      : role === "placeholder"
        ? ++placeholderIndex
        : ++audienceIndex;
    fragments.push({
      ref: makeFragmentRef(shortCode, role, index),
      author,
      text,
      likes: readPostLikes(post),
      role
    });
  };

  for (const post of readOpContinuations(model)) {
    pushFragment(post, "op_continuation");
  }
  for (const post of readDiscussionReplies(model)) {
    pushFragment(post);
  }
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
    const model = readThreadReadModel(item.latestCapture);
    const rootPost = readRootPost(model);
    const opAuthor = resolveOpAuthor(item, rootPost);
    const opText = resolveOpText(item, rootPost);
    const status = normalizeStatus(item);
    const gaps: string[] = [];
    if (status !== "succeeded") {
      gaps.push("capture not completed");
    }
    if (!model) {
      gaps.push("thread read model unavailable");
    }
    if (!opText) {
      gaps.push("op text unavailable");
    }

    packets.push({
      auditRunId: input.auditRunId ?? "",
      inputHash: input.inputHash ?? "",
      topicId: input.topic.id,
      signalId: signal.id,
      itemId: item.id,
      shortCode,
      sourceUrl: resolveSourceUrl(item),
      capturedAt: signal.capturedAt || item.savedAt || item.descriptor.captured_at,
      status,
      opAuthor,
      opText,
      opLikes: readPostLikes(rootPost) ?? readNumberOrNull(item.descriptor.engagement.likes),
      commentCount: status === "succeeded" ? resolveCommentCount(item) : null,
      replyFragments: status === "succeeded" ? buildReplyFragments(shortCode, model, opAuthor) : [],
      aiArtifacts: buildAiArtifacts(input.signalTagsByItemId?.[item.id]),
      gaps,
      notes: []
    });
  });

  return packets;
}
