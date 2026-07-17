import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTick } from "node:timers/promises";

import type { CrossTopicCalibration, EvidencePacket, LensMemo, SignalReading, TopicAuditEpisode, TopicAuditReport } from "../src/compare/topic-audit.ts";
import type { TopicAuditRunStatus } from "../src/compare/topic-audit-envelope-contract.ts";
import {
  CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY,
  TOPIC_AUDIT_EPISODES_STORAGE_KEY,
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  TOPIC_AUDIT_RUNS_STORAGE_KEY,
  advanceTopicAuditRun,
  beginTopicAuditRun,
  buildTopicAuditCacheKey,
  clearTopicAuditStorageTopic,
  failTopicAuditRun,
  isTopicAuditPublicationCompatible,
  loadCrossTopicCalibration,
  loadTopicAuditEpisodes,
  loadTopicAuditEvidence,
  loadTopicAuditMemos,
  loadTopicAuditReport,
  loadTopicAuditRun,
  publishTopicAuditReportAndEpisodes,
  saveCrossTopicCalibration,
  saveTopicAuditEvidence,
  saveTopicAuditEpisodes,
  saveTopicAuditMemos,
  saveTopicAuditMemosForRun,
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

class RejectOnceStorage extends MemoryStorage {
  private shouldReject = true;

  constructor(private readonly rejectedKey: string) {
    super();
  }

  override async set(values: Record<string, unknown>): Promise<void> {
    if (this.shouldReject && this.rejectedKey in values) {
      this.shouldReject = false;
      throw new Error("synthetic run-cache write failure");
    }
    await super.set(values);
  }
}

class ControlledInterleavingStorage implements MemoryStorage {
  values: Record<string, unknown> = {};
  setCalls = 0;
  pendingGets: Array<{ key: string; snapshot: Record<string, unknown>; resolve: (value: Record<string, unknown>) => void }> = [];
  pendingSets: Array<{ values: Record<string, unknown>; resolve: () => void; reject: (error: unknown) => void }> = [];

  async get(key: string): Promise<Record<string, unknown>> {
    const snapshot = { [key]: this.values[key] };
    return await new Promise<Record<string, unknown>>((resolve) => {
      this.pendingGets.push({ key, snapshot, resolve });
    });
  }

  async set(values: Record<string, unknown>): Promise<void> {
    this.setCalls += 1;
    return await new Promise<void>((resolve, reject) => {
      this.pendingSets.push({ values, resolve, reject });
    });
  }

  releaseAllGets(): void {
    while (this.pendingGets.length > 0) {
      const pending = this.pendingGets.shift();
      pending?.resolve(pending.snapshot);
    }
  }

  releaseNextGet(): void {
    const pending = this.pendingGets.shift();
    pending?.resolve(pending.snapshot);
  }

  releaseNextSet(): void {
    const pending = this.pendingSets.shift();
    if (!pending) {
      return;
    }
    this.values = { ...this.values, ...pending.values };
    pending.resolve();
  }

  releaseAllSets(): void {
    while (this.pendingSets.length > 0) {
      this.releaseNextSet();
    }
  }

  rejectNextSet(error: unknown): void {
    const pending = this.pendingSets.shift();
    pending?.reject(error);
  }
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) {
      return;
    }
    await nextTick();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function driveTwoMutationRace(storage: ControlledInterleavingStorage): Promise<void> {
  await waitFor(() => storage.pendingGets.length >= 1, "first pending get");
  await nextTick();
  while (storage.pendingGets.length > 0) {
    storage.releaseNextGet();
  }
  await waitFor(() => storage.pendingSets.length >= 1, "first pending set");
  storage.releaseNextSet();
  await nextTick();
  while (storage.pendingGets.length > 0) {
    storage.releaseNextGet();
  }
  await waitFor(() => storage.pendingSets.length >= 1, "remaining pending set");
  storage.releaseAllSets();
}

async function finishPendingMutation(
  storage: ControlledInterleavingStorage,
  expectedGetCount: number,
  label: string
): Promise<void> {
  await waitFor(() => storage.pendingGets.length === expectedGetCount, `${label} gets`);
  storage.releaseAllGets();
  await waitFor(() => storage.pendingSets.length === 1, `${label} set`);
  storage.releaseNextSet();
}

function makeMemoBundle(topicId: string): {
  auditRunId: string;
  inputHash: string;
  signalReadings: SignalReading[];
  lensMemos: LensMemo[];
} {
  return {
    auditRunId: `audit-${topicId}`,
    inputHash: `input-${topicId}`,
    signalReadings: [{
      auditRunId: `audit-${topicId}`,
      inputHash: `input-${topicId}`,
      topicId,
      signalId: `signal-${topicId}`,
      shortCode: topicId.toUpperCase(),
      reading: `${topicId} reading`,
      evidenceRefs: [`${topicId.toUpperCase()}.OP`],
      watchNotes: [],
      promptVersion: "p1.v1",
      model: "mock:model",
      generatedAt: "2026-07-17T00:00:00.000Z"
    }],
    lensMemos: [{
      auditRunId: `audit-${topicId}`,
      inputHash: `input-${topicId}`,
      topicId,
      stageName: "audience",
      prose: `${topicId} memo`,
      evidenceRefs: [`${topicId.toUpperCase()}.OP`],
      caveats: [],
      coverage: "1/1",
      promptVersion: "p4.v1",
      model: "mock:model",
      generatedAt: "2026-07-17T00:00:00.000Z"
    }]
  };
}

function makeRunStatus(
  requestId: string,
  overrides: Partial<TopicAuditRunStatus> = {}
): TopicAuditRunStatus {
  return {
    sessionId: "session-1",
    topicId: "topic-1",
    requestId,
    state: "running",
    stage: "p1-signal-reading",
    startedAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T10:00:00.000Z",
    expiresAt: "2026-07-17T10:15:00.000Z",
    ...overrides
  };
}

function makeCalibration(id: string): CrossTopicCalibration {
  return {
    id,
    topicIds: ["topic-1", "topic-2"],
    topicsCompared: ["topic-1", "topic-2"],
    decompositions: [{
      findingFromTopic: `${id}: finding`,
      perTopicResult: { "topic-1": "present", "topic-2": "absent" },
      verdict: "topic-specific",
      strength: "strong",
      caveats: []
    }],
    promptVersion: "p8.v1",
    model: "mock:model",
    generatedAt: "2026-07-17T00:00:00.000Z"
  };
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

test("topic audit RMW mutations serialize concurrent saves across every audit storage map", async (t) => {
  await t.test("evidence", async () => {
    const storage = new ControlledInterleavingStorage();
    const firstSave = saveTopicAuditEvidence(storage, "topic-1", [makePacket()]);
    const secondSave = saveTopicAuditEvidence(storage, "topic-2", [makePacket({
      topicId: "topic-2",
      signalId: "signal-2",
      shortCode: "S2"
    })]);

    await driveTwoMutationRace(storage);
    await Promise.all([firstSave, secondSave]);

    assert.deepEqual(Object.keys(storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY] as Record<string, unknown>).sort(), [
      "topic-1",
      "topic-2"
    ]);
  });

  await t.test("memos", async () => {
    const storage = new ControlledInterleavingStorage();
    const firstSave = saveTopicAuditMemos(storage, "topic-1", makeMemoBundle("topic-1"));
    const secondSave = saveTopicAuditMemos(storage, "topic-2", makeMemoBundle("topic-2"));

    await driveTwoMutationRace(storage);
    await Promise.all([firstSave, secondSave]);

    assert.deepEqual(Object.keys(storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY] as Record<string, unknown>).sort(), [
      "topic-1",
      "topic-2"
    ]);
  });

  await t.test("reports", async () => {
    const storage = new ControlledInterleavingStorage();
    const firstSave = saveTopicAuditReport(storage, makeReportForEpisode(makeEpisode(1, "topic-1")));
    const secondSave = saveTopicAuditReport(storage, makeReportForEpisode(makeEpisode(1, "topic-2")));

    await driveTwoMutationRace(storage);
    await Promise.all([firstSave, secondSave]);

    assert.deepEqual(Object.keys(storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY] as Record<string, unknown>).sort(), [
      "topic-1",
      "topic-2"
    ]);
  });

  await t.test("episodes", async () => {
    const storage = new ControlledInterleavingStorage();
    const firstSave = saveTopicAuditEpisodes(storage, "topic-1", [makeEpisode(1, "topic-1")]);
    const secondSave = saveTopicAuditEpisodes(storage, "topic-2", [makeEpisode(1, "topic-2")]);

    await driveTwoMutationRace(storage);
    await Promise.all([firstSave, secondSave]);

    assert.deepEqual(Object.keys(storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY] as Record<string, unknown>).sort(), [
      "topic-1",
      "topic-2"
    ]);
  });

  await t.test("cross-topic calibrations", async () => {
    const storage = new ControlledInterleavingStorage();
    const firstSave = saveCrossTopicCalibration(storage, makeCalibration("calibration-1"));
    const secondSave = saveCrossTopicCalibration(storage, makeCalibration("calibration-2"));

    await driveTwoMutationRace(storage);
    await Promise.all([firstSave, secondSave]);

    assert.deepEqual(Object.keys(storage.values[CROSS_TOPIC_CALIBRATIONS_STORAGE_KEY] as Record<string, unknown>).sort(), [
      "calibration-1",
      "calibration-2"
    ]);
  });
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

test("topic audit run cache normalizes malformed disposable payload without touching durable artifacts", async () => {
  const storage = new MemoryStorage();
  storage.values[TOPIC_AUDIT_RUNS_STORAGE_KEY] = ["not-a-map"];
  storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY] = { "topic-1": makeMemoBundle("topic-1") };

  assert.equal(await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:00:00.000Z"), null);
  assert.deepEqual(await loadTopicAuditMemos(storage, "topic-1"), makeMemoBundle("topic-1"));
});

test("topic audit run cache discards an unknown disposable schema version", async () => {
  const storage = new MemoryStorage();
  storage.values[TOPIC_AUDIT_RUNS_STORAGE_KEY] = {
    schemaVersion: 2,
    runs: { "topic-1": makeRunStatus("future-request") }
  };

  assert.equal(await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:00:00.000Z"), null);
});

test("topic audit run lease expires to interrupted and blocks late owner writes", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, {
    sessionId: "session-1",
    topicId: "topic-1",
    requestId: "request-old",
    state: "running",
    stage: "narrative",
    startedAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
    expiresAt: "2026-07-17T09:15:00.000Z"
  });

  const expired = await loadTopicAuditRun(storage, "topic-1", "2026-07-17T09:16:00.000Z");
  assert.equal(expired?.state, "failed");
  assert.equal(expired?.failureKind, "interrupted");
  await assert.rejects(
    () => saveTopicAuditMemosForRun(storage, { topicId: "topic-1", requestId: "request-old", now: "2026-07-17T09:16:01.000Z" }, makeMemoBundle("topic-1")),
    /no longer owns/i
  );
});

test("malformed topic audit owner timestamps reject without rewriting durable artifacts or the run cache", async () => {
  const storage = new MemoryStorage();
  const run = makeRunStatus("request-1");
  const existingEpisode = makeEpisode(1);
  const replacementEpisode = makeEpisode(2);
  await beginTopicAuditRun(storage, run);
  storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY] = { "topic-1": makeMemoBundle("topic-1") };
  storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY] = { "topic-1": makeReportForEpisode(existingEpisode) };
  storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY] = { "topic-1": [existingEpisode] };
  const before = structuredClone(storage.values);
  storage.setCalls = 0;
  const malformedOwner = { topicId: run.topicId, requestId: run.requestId, now: "not-a-date" };

  await assert.rejects(
    () => saveTopicAuditMemosForRun(storage, malformedOwner, makeMemoBundle("topic-1")),
    /valid ISO timestamp/i
  );
  await assert.rejects(
    () => advanceTopicAuditRun(storage, malformedOwner, "narrative"),
    /valid ISO timestamp/i
  );
  await assert.rejects(
    () => failTopicAuditRun(storage, malformedOwner, "timeout"),
    /valid ISO timestamp/i
  );
  await assert.rejects(
    () => publishTopicAuditReportAndEpisodes(
      storage,
      makeReportForEpisode(replacementEpisode),
      [replacementEpisode],
      malformedOwner
    ),
    /valid ISO timestamp/i
  );

  assert.equal(storage.setCalls, 0);
  assert.deepEqual(storage.values, before);
});

test("malformed topic audit load timestamps reject without corrupting the disposable run cache", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, makeRunStatus("request-1"));
  const before = structuredClone(storage.values);
  storage.setCalls = 0;

  await assert.rejects(
    () => loadTopicAuditRun(storage, "topic-1", "not-a-date"),
    /valid ISO timestamp/i
  );

  assert.equal(storage.setCalls, 0);
  assert.deepEqual(storage.values, before);
});

test("topic audit run advances, checkpoints, and records an owned failure", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, makeRunStatus("request-1"));

  const owner = { topicId: "topic-1", requestId: "request-1", now: "2026-07-17T10:01:00.000Z" };
  const advanced = await advanceTopicAuditRun(storage, owner, "narrative");
  assert.deepEqual(advanced, makeRunStatus("request-1", {
    stage: "narrative",
    updatedAt: owner.now,
    expiresAt: "2026-07-17T10:16:00.000Z"
  }));

  await saveTopicAuditMemosForRun(storage, owner, makeMemoBundle("topic-1"));
  assert.deepEqual(await loadTopicAuditMemos(storage, "topic-1"), makeMemoBundle("topic-1"));

  const failed = await failTopicAuditRun(storage, { ...owner, now: "2026-07-17T10:02:00.000Z" }, "timeout");
  assert.equal(failed.state, "failed");
  assert.equal(failed.failureKind, "timeout");
  assert.equal((await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:02:00.000Z"))?.state, "failed");
});

test("a newer topic audit request prevents an older request from publishing late", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, makeRunStatus("request-old"));
  await beginTopicAuditRun(storage, makeRunStatus("request-new"));

  await assert.rejects(
    () => publishTopicAuditReportAndEpisodes(storage, makeReportForEpisode(makeEpisode(1)), [makeEpisode(1)], {
      topicId: "topic-1",
      requestId: "request-old",
      now: "2026-07-17T10:01:00.000Z"
    }),
    /no longer owns/i
  );
  assert.equal(await loadTopicAuditReport(storage, "topic-1"), null);
});

test("owned topic audit publication clears the run cache in its aggregate write", async () => {
  const storage = new MemoryStorage();
  const run = makeRunStatus("request-1");
  await beginTopicAuditRun(storage, run);
  storage.setCalls = 0;
  const episode = makeEpisode(1);

  await publishTopicAuditReportAndEpisodes(storage, makeReportForEpisode(episode), [episode], {
    topicId: run.topicId,
    requestId: run.requestId,
    now: "2026-07-17T10:01:00.000Z"
  });

  assert.equal(storage.setCalls, 1);
  assert.equal(await loadTopicAuditRun(storage, run.topicId, "2026-07-17T10:01:00.000Z"), null);
});

test("clearing a topic removes its disposable run cache entry", async () => {
  const storage = new MemoryStorage();
  await beginTopicAuditRun(storage, makeRunStatus("request-1"));

  await clearTopicAuditStorageTopic(storage, "topic-1");

  assert.equal(await loadTopicAuditRun(storage, "topic-1", "2026-07-17T10:01:00.000Z"), null);
});

test("a rejected run-cache write does not poison the shared mutation queue", async () => {
  const storage = new RejectOnceStorage(TOPIC_AUDIT_RUNS_STORAGE_KEY);
  await assert.rejects(() => beginTopicAuditRun(storage, makeRunStatus("request-fail")));
  await saveTopicAuditMemos(storage, "topic-2", makeMemoBundle("topic-2"));
  assert.ok(await loadTopicAuditMemos(storage, "topic-2"));
});

test("topic audit mutation queue recovers after one rejected write", async () => {
  const storage = new ControlledInterleavingStorage();
  const firstSave = saveTopicAuditEvidence(storage, "topic-1", [makePacket()]);

  await waitFor(() => storage.pendingGets.length === 1, "rejected save get");
  storage.releaseNextGet();
  await waitFor(() => storage.pendingSets.length === 1, "rejected save set");
  storage.rejectNextSet(new Error("storage write failed"));
  await assert.rejects(firstSave, /storage write failed/);

  const secondSave = saveTopicAuditEvidence(storage, "topic-2", [makePacket({
    topicId: "topic-2",
    signalId: "signal-2",
    shortCode: "S2"
  })]);

  await waitFor(() => storage.pendingGets.length === 1, "recovery save get");
  storage.releaseNextGet();
  await waitFor(() => storage.pendingSets.length === 1, "recovery save set");
  storage.releaseNextSet();
  await secondSave;

  assert.deepEqual(Object.keys(storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY] as Record<string, unknown>), ["topic-2"]);
});

test("topic audit save and clear mutations obey call order on the same queue", async (t) => {
  await t.test("save then clear leaves the topic absent", async () => {
    const storage = new ControlledInterleavingStorage();
    const save = saveTopicAuditEvidence(storage, "topic-1", [makePacket()]);
    await waitFor(() => storage.pendingGets.length === 1, "save-before-clear get");

    const clear = clearTopicAuditStorageTopic(storage, "topic-1");
    await nextTick();
    assert.equal(storage.pendingGets.length, 1, "clear must not start reading before the prior save publishes");

    await finishPendingMutation(storage, 1, "save-before-clear save");
    await finishPendingMutation(storage, 5, "save-before-clear clear");
    await Promise.all([save, clear]);

    const evidence = storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY] as Record<string, unknown>;
    assert.equal(Object.hasOwn(evidence, "topic-1"), false);
  });

  await t.test("clear then save keeps the later save", async () => {
    const storage = new ControlledInterleavingStorage();
    storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY] = { "topic-1": [makePacket()] };
    const clear = clearTopicAuditStorageTopic(storage, "topic-1");
    await waitFor(() => storage.pendingGets.length === 5, "clear-before-save gets");

    const packets = [makePacket({ auditRunId: "audit-later" })];
    const save = saveTopicAuditEvidence(storage, "topic-1", packets);
    await nextTick();
    assert.equal(storage.pendingGets.length, 5, "save must not read before the prior clear publishes");

    await finishPendingMutation(storage, 5, "clear-before-save clear");
    await finishPendingMutation(storage, 1, "clear-before-save save");
    await Promise.all([clear, save]);

    const evidence = storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY] as Record<string, EvidencePacket[]>;
    assert.deepEqual(evidence["topic-1"], packets);
  });
});

test("topic audit publication and clear mutations obey call order on the same queue", async (t) => {
  await t.test("publication then clear leaves report and episodes absent", async () => {
    const storage = new ControlledInterleavingStorage();
    const episode = makeEpisode(1);
    const report = makeReportForEpisode(episode);
    const publication = publishTopicAuditReportAndEpisodes(storage, report, [episode]);
    await waitFor(() => storage.pendingGets.length === 2, "publication-before-clear gets");

    const clear = clearTopicAuditStorageTopic(storage, "topic-1");
    await nextTick();
    assert.equal(storage.pendingGets.length, 2, "clear must wait for the prior publication");

    await finishPendingMutation(storage, 2, "publication-before-clear publication");
    await finishPendingMutation(storage, 5, "publication-before-clear clear");
    await Promise.all([publication, clear]);

    const reports = storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY] as Record<string, unknown>;
    const episodes = storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY] as Record<string, unknown>;
    assert.equal(Object.hasOwn(reports, "topic-1"), false);
    assert.equal(Object.hasOwn(episodes, "topic-1"), false);
  });

  await t.test("clear then publication keeps the later report and episodes", async () => {
    const storage = new ControlledInterleavingStorage();
    const oldEpisode = makeEpisode(1);
    storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY] = { "topic-1": makeReportForEpisode(oldEpisode) };
    storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY] = { "topic-1": [oldEpisode] };
    const clear = clearTopicAuditStorageTopic(storage, "topic-1");
    await waitFor(() => storage.pendingGets.length === 5, "clear-before-publication gets");

    const laterEpisode = makeEpisode(2);
    const laterReport = makeReportForEpisode(laterEpisode);
    const publication = publishTopicAuditReportAndEpisodes(storage, laterReport, [laterEpisode]);
    await nextTick();
    assert.equal(storage.pendingGets.length, 5, "publication must wait for the prior clear");

    await finishPendingMutation(storage, 5, "clear-before-publication clear");
    await finishPendingMutation(storage, 2, "clear-before-publication publication");
    await Promise.all([clear, publication]);

    const reports = storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY] as Record<string, TopicAuditReport>;
    const episodes = storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY] as Record<string, TopicAuditEpisode[]>;
    assert.deepEqual(reports["topic-1"], laterReport);
    assert.deepEqual(episodes["topic-1"], [laterEpisode]);
  });
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
