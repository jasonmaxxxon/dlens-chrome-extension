import type {
  CommentShardReading,
  EvidencePacket,
  TopicAuditArtifactIdentity,
  TopicAuditSignalIdentity
} from "./topic-audit.ts";

export const TOPIC_AUDIT_SHARD_POLICY_VERSION = "topic-audit-shards.v1-120-comments-18000-chars";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (entry) => entry.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function buildTopicAuditSignalIdentity(packet: EvidencePacket): Promise<TopicAuditSignalIdentity> {
  const contentPayload = {
    version: "topic-audit-signal-content.v1",
    signalId: packet.signalId,
    itemId: packet.itemId,
    status: packet.status,
    op: { author: packet.opAuthor, text: packet.opText, likes: packet.opLikes },
    commentCount: packet.commentCount,
    gaps: packet.gaps,
    fragments: packet.replyFragments.map((fragment) => ({
      role: fragment.role,
      commentId: fragment.commentId ?? null,
      sourceId: fragment.sourceId ?? null,
      parentId: fragment.parentId ?? null,
      author: fragment.author,
      text: fragment.text,
      likes: fragment.likes
    }))
  };
  const referencePayload = {
    version: "topic-audit-reference.v1",
    shortCode: packet.shortCode,
    opRef: `${packet.shortCode}.OP`,
    fragments: packet.replyFragments.map((fragment) => ({
      ref: fragment.ref,
      role: fragment.role,
      commentId: fragment.commentId ?? null,
      sourceId: fragment.sourceId ?? null
    }))
  };
  const [contentHash, referenceHash] = await Promise.all([
    sha256(JSON.stringify(contentPayload)),
    sha256(JSON.stringify(referencePayload))
  ]);
  return { version: "topic-audit-signal.v1", contentHash, referenceHash };
}

export function buildTopicAuditArtifactProducerKey(input: {
  stage: string;
  promptVersion: string;
  modelKey: string;
  partitionKey?: string;
}): string {
  return JSON.stringify({
    stage: input.stage,
    promptVersion: input.promptVersion,
    modelKey: input.modelKey,
    partitionKey: input.partitionKey,
    shardPolicyVersion: input.stage === "comment-shard-reading" ? TOPIC_AUDIT_SHARD_POLICY_VERSION : undefined
  });
}

export async function buildTopicAuditShardSetHash(readings: readonly CommentShardReading[]): Promise<string> {
  const payload = [...readings]
    .sort((left, right) => left.shardIndex - right.shardIndex)
    .map((reading) => ({
      shardIndex: reading.shardIndex,
      shardCount: reading.shardCount,
      reading: reading.reading ?? "",
      commentRefsInShard: reading.commentRefsInShard,
      patternCandidates: reading.patternCandidates,
      lexiconCandidates: reading.lexiconCandidates
    }));
  return sha256(JSON.stringify(payload));
}

export function isTopicAuditArtifactReusable(
  actual: TopicAuditArtifactIdentity | undefined,
  expected: TopicAuditArtifactIdentity
): boolean {
  return Boolean(
    actual
    && actual.version === expected.version
    && actual.contentHash === expected.contentHash
    && actual.referenceHash === expected.referenceHash
    && actual.producerKey === expected.producerKey
    && (actual.upstreamHash ?? "") === (expected.upstreamHash ?? "")
  );
}
