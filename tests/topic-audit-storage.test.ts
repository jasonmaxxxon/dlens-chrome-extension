import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket, LensMemo, SignalReading } from "../src/compare/topic-audit.ts";
import {
  CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY,
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  buildTopicAuditCacheKey,
  loadCrossTopicCalibration,
  loadTopicAuditEvidence,
  loadTopicAuditMemos,
  loadTopicAuditReport,
  saveCrossTopicCalibration,
  saveTopicAuditEvidence,
  saveTopicAuditMemos,
  saveTopicAuditReport
} from "../src/state/topic-audit-storage.ts";

class MemoryStorage {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values[key] };
  }

  async set(values: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...values };
  }
}

function makePacket(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  return {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-1",
    signalId: "signal-1",
    itemId: "item-1",
    shortCode: "S1",
    sourceUrl: "https://www.threads.net/@op/post/1",
    capturedAt: "2026-05-22T09:00:00.000Z",
    status: "succeeded",
    opAuthor: "op",
    opText: "root",
    opLikes: 12,
    commentCount: 2,
    replyFragments: [
      { ref: "S1.R1", author: "reader", text: "reply", likes: null, role: "audience" }
    ],
    gaps: [],
    notes: [],
    ...overrides
  };
}

test("topic audit storage roundtrips evidence by topic without mutating other topics", async () => {
  const storage = new MemoryStorage();
  const topicOnePackets = [makePacket()];
  const topicTwoPackets = [makePacket({ topicId: "topic-2", signalId: "signal-2", shortCode: "S1" })];

  await saveTopicAuditEvidence(storage, "topic-1", topicOnePackets);
  await saveTopicAuditEvidence(storage, "topic-2", topicTwoPackets);

  assert.deepEqual(await loadTopicAuditEvidence(storage, "topic-1"), topicOnePackets);
  assert.deepEqual(await loadTopicAuditEvidence(storage, "topic-2"), topicTwoPackets);
  assert.deepEqual(Object.keys(storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY] as Record<string, unknown>).sort(), [
    "topic-1",
    "topic-2"
  ]);
});

test("topic audit memos store signal readings and lens memos under the same audit run", async () => {
  const storage = new MemoryStorage();
  const signalReading: SignalReading = {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-1",
    signalId: "signal-1",
    shortCode: "S1",
    reading: "這篇先提出一個價值判斷，留言再校正框架。",
    evidenceRefs: ["S1.OP", "S1.R1"],
    watchNotes: ["reader 校正 OP"],
    promptVersion: "p1.v1",
    model: "google:test",
    generatedAt: "2026-05-22T09:10:00.000Z"
  };
  const memo: LensMemo = {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-1",
    stageName: "lexicon",
    prose: "量化語彙出現，但不是預設 finding。",
    evidenceRefs: ["S1.OP"],
    caveats: [],
    coverage: "1/1",
    promptVersion: "p2.v1",
    model: "google:test",
    generatedAt: "2026-05-22T09:11:00.000Z"
  };

  await saveTopicAuditMemos(storage, "topic-1", {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    signalReadings: [signalReading],
    lensMemos: [memo]
  });

  assert.deepEqual(await loadTopicAuditMemos(storage, "topic-1"), {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    signalReadings: [signalReading],
    lensMemos: [memo]
  });
  assert.ok(storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY]);
});

test("buildTopicAuditCacheKey changes on item status, updatedAt, prompt version, and stage", () => {
  const base = buildTopicAuditCacheKey({
    topicId: "topic-1",
    signalIds: ["signal-2", "signal-1"],
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:00:00.000Z", status: "succeeded" },
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "queued" }
    ],
    promptVersion: "p2.v1",
    stageName: "lexicon"
  });

  assert.equal(
    base,
    buildTopicAuditCacheKey({
      topicId: "topic-1",
      signalIds: ["signal-1", "signal-2"],
      itemStates: [
        { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "queued" },
        { itemId: "item-1", updatedAt: "2026-05-22T09:00:00.000Z", status: "succeeded" }
      ],
      promptVersion: "p2.v1",
      stageName: "lexicon"
    })
  );
  assert.notEqual(base, buildTopicAuditCacheKey({
    topicId: "topic-1",
    signalIds: ["signal-2", "signal-1"],
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:00:00.000Z", status: "succeeded" },
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "succeeded" }
    ],
    promptVersion: "p2.v1",
    stageName: "lexicon"
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    topicId: "topic-1",
    signalIds: ["signal-2", "signal-1"],
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:02:00.000Z", status: "succeeded" },
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "queued" }
    ],
    promptVersion: "p2.v1",
    stageName: "lexicon"
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    topicId: "topic-1",
    signalIds: ["signal-2", "signal-1"],
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:00:00.000Z", status: "succeeded" },
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "queued" }
    ],
    promptVersion: "p2.v2",
    stageName: "lexicon"
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    topicId: "topic-1",
    signalIds: ["signal-2", "signal-1"],
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:00:00.000Z", status: "succeeded" },
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "queued" }
    ],
    promptVersion: "p2.v1",
    stageName: "narrative"
  }));
});

test("topic audit storage roundtrips reports and cross-topic calibrations", async () => {
  const storage = new MemoryStorage();
  const report = {
    auditRunId: "audit-run-1",
    inputHash: "input-hash-1",
    topicId: "topic-1",
    topicName: "love",
    generatedFrom: ["p1", "lexicon"],
    coveragePerSection: { overall: "1/1" },
    sections: {
      overall: "整體判讀",
      lexicon: "共同用字",
      scaleOrTime: "無時間 arc",
      narratives: "敘事",
      audience: "觀眾",
      absence: "缺席",
      editorial: "語言生態"
    },
    limitations: ["sample small"],
    promptVersion: "p6.v1",
    model: "google:test",
    generatedAt: "2026-05-22T10:00:00.000Z"
  };
  const calibration = {
    id: "calibration-1",
    topicIds: ["work", "love"],
    topicsCompared: ["work", "love"],
    decompositions: [
      {
        findingFromTopic: "work: 無 future tense",
        perTopicResult: { work: "present", love: "absent" },
        verdict: "topic-specific" as const,
        strength: "strong" as const,
        caveats: []
      }
    ],
    promptVersion: "p8.v1",
    model: "google:test",
    generatedAt: "2026-05-22T11:00:00.000Z"
  };

  await saveTopicAuditReport(storage, report);
  await saveCrossTopicCalibration(storage, calibration);

  assert.deepEqual(await loadTopicAuditReport(storage, "topic-1"), report);
  assert.deepEqual(await loadCrossTopicCalibration(storage, "calibration-1"), calibration);
  assert.ok(storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY]);
  assert.ok(storage.values[CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY]);
});
