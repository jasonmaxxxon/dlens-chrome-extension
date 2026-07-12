import assert from "node:assert/strict";
import test from "node:test";

import type { CommentShardReading, EvidencePacket } from "../src/compare/topic-audit.ts";

interface SignalIdentity {
  version: string;
  contentHash: string;
  referenceHash: string;
}

interface ArtifactIdentity extends SignalIdentity {
  producerKey: string;
  upstreamHash?: string;
}

interface CacheModule {
  buildTopicAuditSignalIdentity(packet: EvidencePacket): Promise<SignalIdentity>;
  buildTopicAuditArtifactProducerKey(input: { stage: string; promptVersion: string; modelKey: string; partitionKey?: string }): string;
  buildTopicAuditShardSetHash(readings: readonly CommentShardReading[]): Promise<string>;
  isTopicAuditArtifactReusable(actual: ArtifactIdentity | undefined, expected: ArtifactIdentity): boolean;
}

async function loadCacheModule(): Promise<CacheModule | null> {
  const modulePath = "../src/compare/topic-audit-cache.ts";
  try {
    return await import(modulePath) as unknown as CacheModule;
  } catch {
    return null;
  }
}

function makePacket(shortCode = "S1", ref = "S1.R1", text = "reply"): EvidencePacket {
  return {
    auditRunId: "audit-1",
    inputHash: "input-1",
    topicId: "topic-1",
    signalId: "signal-1",
    itemId: "item-1",
    shortCode,
    sourceUrl: "https://www.threads.net/@op/post/1",
    capturedAt: "2026-07-11T00:00:00.000Z",
    status: "succeeded",
    opAuthor: "op",
    opText: "root",
    opLikes: 3,
    commentCount: 1,
    replyFragments: [{ ref, commentId: "comment-1", author: "reader", text, likes: 2, role: "audience" }],
    gaps: [],
    notes: []
  };
}

function makeShardReading(shardIndex: number, reading: string): CommentShardReading {
  return {
    auditRunId: "audit-1",
    inputHash: "input-1",
    topicId: "topic-1",
    signalId: "signal-1",
    shortCode: "S1",
    shardIndex,
    shardCount: 2,
    reading,
    commentRefsInShard: [`S1.R${shardIndex + 1}`],
    patternCandidates: [],
    lexiconCandidates: [],
    promptVersion: "p0.5.v1",
    model: "mock:model",
    generatedAt: "2026-07-11T00:00:00.000Z"
  };
}

test("signal cache identity separates content from positional reference layout", async () => {
  const cache = await loadCacheModule();
  assert.ok(cache, "topic-audit-cache module must exist");
  if (!cache) return;

  const first = await cache.buildTopicAuditSignalIdentity(makePacket());
  const moved = await cache.buildTopicAuditSignalIdentity(makePacket("S2", "S2.R4"));
  const changed = await cache.buildTopicAuditSignalIdentity(makePacket("S1", "S1.R1", "changed reply"));

  assert.equal(first.contentHash, moved.contentHash);
  assert.notEqual(first.referenceHash, moved.referenceHash);
  assert.notEqual(first.contentHash, changed.contentHash);
  assert.match(first.contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("artifact producer and upstream hashes invalidate only the layer whose input changed", async () => {
  const cache = await loadCacheModule();
  assert.ok(cache, "topic-audit-cache module must exist");
  if (!cache) return;

  const p05 = cache.buildTopicAuditArtifactProducerKey({ stage: "comment-shard-reading", promptVersion: "p0.5.v2", modelKey: "mock:a" });
  const p05ShardTwo = cache.buildTopicAuditArtifactProducerKey({ stage: "comment-shard-reading", promptVersion: "p0.5.v2", modelKey: "mock:a", partitionKey: "1/2" });
  const p1 = cache.buildTopicAuditArtifactProducerKey({ stage: "p1-signal-reading", promptVersion: "p1.v3", modelKey: "mock:a" });
  const otherModel = cache.buildTopicAuditArtifactProducerKey({ stage: "p1-signal-reading", promptVersion: "p1.v3", modelKey: "mock:b" });
  assert.notEqual(p05, p1);
  assert.notEqual(p05, p05ShardTwo);
  assert.notEqual(p1, otherModel);

  const ordered = await cache.buildTopicAuditShardSetHash([makeShardReading(0, "a"), makeShardReading(1, "b")]);
  const reversed = await cache.buildTopicAuditShardSetHash([makeShardReading(1, "b"), makeShardReading(0, "a")]);
  const changed = await cache.buildTopicAuditShardSetHash([makeShardReading(0, "a"), makeShardReading(1, "changed")]);
  assert.equal(ordered, reversed);
  assert.notEqual(ordered, changed);
});

test("artifact reuse requires exact signal, producer, and upstream identity", async () => {
  const cache = await loadCacheModule();
  assert.ok(cache, "topic-audit-cache module must exist");
  if (!cache) return;

  const expected: ArtifactIdentity = {
    version: "topic-audit-signal.v1",
    contentHash: "sha256:content",
    referenceHash: "sha256:refs",
    producerKey: "p1",
    upstreamHash: "sha256:shards"
  };
  assert.equal(cache.isTopicAuditArtifactReusable({ ...expected }, expected), true);
  assert.equal(cache.isTopicAuditArtifactReusable({ ...expected, referenceHash: "sha256:moved" }, expected), false);
  assert.equal(cache.isTopicAuditArtifactReusable({ ...expected, upstreamHash: "sha256:other" }, expected), false);
  assert.equal(cache.isTopicAuditArtifactReusable(undefined, expected), false);
});
