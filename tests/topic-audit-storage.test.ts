import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket, LensMemo, SignalReading, TopicAuditEpisode, TopicAuditReport } from "../src/compare/topic-audit.ts";
import {
  CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY,
  TOPIC_AUDIT_EPISODES_STORAGE_KEY,
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  buildTopicAuditCacheKey,
  isTopicAuditPublicationCompatible,
  loadCrossTopicCalibration,
  loadTopicAuditEpisodes,
  loadTopicAuditEvidence,
  loadTopicAuditMemos,
  loadTopicAuditReport,
  publishTopicAuditReportAndEpisodes,
  saveCrossTopicCalibration,
  saveTopicAuditEvidence,
  saveTopicAuditEpisodes,
  saveTopicAuditMemos,
  saveTopicAuditReport
} from "../src/state/topic-audit-storage.ts";

class MemoryStorage {
  values: Record<string, unknown> = {};
  setCalls = 0;

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values[key] };
  }

  async set(values: Record<string, unknown>): Promise<void> {
    this.setCalls += 1;
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

function makeEpisode(index: number, topicId = "topic-1"): TopicAuditEpisode {
  const fingerprints = { evidence: `e-${index}`, definition: "d-1", pipeline: "p-1" };
  return {
    version: "topic-audit-episode.v1",
    id: `episode-${index}`,
    topicId,
    auditRunId: `audit-${index}`,
    inputHash: `input-${index}`,
    generatedAt: `2026-07-${String(Math.min(index, 28)).padStart(2, "0")}T00:00:00.000Z`,
    transition: index === 1 ? "first" : "advance",
    ...(index > 1 ? { previousEpisodeId: `episode-${index - 1}` } : {}),
    fingerprints,
    sourceCount: index,
    stateSnapshot: {
      version: "topic-narrative-state.v1",
      topicId,
      auditRunId: `audit-${index}`,
      fingerprints,
      nextIds: { claim: 1, voice: 1, question: 1 },
      claims: [],
      voices: [],
      openQuestions: [],
      updatedAt: "2026-07-11T00:00:00.000Z"
    },
    delta: [],
    reactionSnapshot: { patterns: [] }
  };
}

function makeReportForEpisode(episode: TopicAuditEpisode): TopicAuditReport {
  return {
    auditRunId: episode.auditRunId,
    inputHash: episode.inputHash,
    topicId: episode.topicId,
    topicName: episode.topicId,
    generatedFrom: [],
    coveragePerSection: {},
    sections: {
      overall: "overall",
      lexicon: "",
      scaleOrTime: "",
      narratives: "",
      audience: "",
      absence: "",
      editorial: ""
    },
    limitations: [],
    narrativeState: episode.stateSnapshot,
    promptVersion: "p6",
    model: "mock:model",
    generatedAt: episode.generatedAt
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

test("buildTopicAuditCacheKey preserves signal order and changes on topic definition, model, item state, prompt, and stage", () => {
  const baseInput = {
    topicId: "topic-1",
    topicName: "love",
    signalIds: ["signal-2", "signal-1"],
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:00:00.000Z", status: "succeeded" },
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "queued" }
    ],
    promptVersion: "p2.v1",
    stageName: "lexicon",
    modelKey: "google:model-a"
  };
  const base = buildTopicAuditCacheKey(baseInput);

  assert.notEqual(
    base,
    buildTopicAuditCacheKey({
      ...baseInput,
      signalIds: ["signal-1", "signal-2"],
      itemStates: [...baseInput.itemStates].reverse()
    })
  );
  assert.notEqual(base, buildTopicAuditCacheKey({
    ...baseInput,
    topicName: "renamed love",
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    ...baseInput,
    modelKey: "google:model-b"
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    ...baseInput,
    itemStates: [
      baseInput.itemStates[0]!,
      { itemId: "item-2", updatedAt: "2026-05-22T09:01:00.000Z", status: "succeeded" }
    ]
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    ...baseInput,
    itemStates: [
      { itemId: "item-1", updatedAt: "2026-05-22T09:02:00.000Z", status: "succeeded" },
      baseInput.itemStates[1]!
    ]
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    ...baseInput,
    promptVersion: "p2.v2",
  }));
  assert.notEqual(base, buildTopicAuditCacheKey({
    ...baseInput,
    stageName: "narrative"
  }));
});

test("topic audit episode storage keeps the latest 24 per topic without touching other topics", async () => {
  const storage = new MemoryStorage();
  await saveTopicAuditEpisodes(storage, "topic-2", [makeEpisode(1, "topic-2")]);
  await saveTopicAuditEpisodes(storage, "topic-1", Array.from({ length: 25 }, (_, index) => makeEpisode(index + 1)));

  const topicOne = await loadTopicAuditEpisodes(storage, "topic-1");
  assert.equal(topicOne.length, 24);
  assert.equal(topicOne[0]?.id, "episode-2");
  assert.equal(topicOne[23]?.id, "episode-25");
  assert.equal((await loadTopicAuditEpisodes(storage, "topic-2"))[0]?.id, "episode-1");
  assert.ok(storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY]);
});

test("topic audit publishes report and episode ledger in one storage write", async () => {
  const storage = new MemoryStorage();
  const episode = makeEpisode(1);
  const report = makeReportForEpisode(episode);

  await publishTopicAuditReportAndEpisodes(storage, report, [episode]);

  assert.equal(storage.setCalls, 1);
  assert.deepEqual(await loadTopicAuditReport(storage, "topic-1"), report);
  assert.deepEqual(await loadTopicAuditEpisodes(storage, "topic-1"), [episode]);
});

test("concurrent topic publications do not lose another topic's report or episode ledger", async () => {
  const storage = new MemoryStorage();
  const first = makeEpisode(1, "topic-1");
  const second = makeEpisode(1, "topic-2");

  await Promise.all([
    publishTopicAuditReportAndEpisodes(storage, makeReportForEpisode(first), [first]),
    publishTopicAuditReportAndEpisodes(storage, makeReportForEpisode(second), [second])
  ]);

  assert.equal((await loadTopicAuditReport(storage, "topic-1"))?.topicId, "topic-1");
  assert.equal((await loadTopicAuditReport(storage, "topic-2"))?.topicId, "topic-2");
  assert.equal((await loadTopicAuditEpisodes(storage, "topic-1"))[0]?.topicId, "topic-1");
  assert.equal((await loadTopicAuditEpisodes(storage, "topic-2"))[0]?.topicId, "topic-2");
});

test("topic audit publication compatibility binds evidence, memos, and report to one revision", () => {
  const episode = makeEpisode(1);
  const report = makeReportForEpisode(episode);
  const memos = {
    auditRunId: report.auditRunId,
    inputHash: report.inputHash,
    signalReadings: [],
    lensMemos: []
  };
  const packets = [{ auditRunId: report.auditRunId, inputHash: report.inputHash }] as EvidencePacket[];

  assert.equal(isTopicAuditPublicationCompatible(report, memos, packets), true);
  assert.equal(isTopicAuditPublicationCompatible(report, { ...memos, auditRunId: "older-run" }, packets), false);
  assert.equal(isTopicAuditPublicationCompatible(report, memos, [{ ...packets[0], auditRunId: "newer-run" }]), false);
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
