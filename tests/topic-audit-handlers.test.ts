import assert from "node:assert/strict";
import test from "node:test";

import type { AuditPromptEnvelope } from "../src/compare/topic-audit-prompts.ts";
import { TOPIC_SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/topic-signal-reading-storage.ts";
import {
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  loadTopicAuditEvidence,
  loadTopicAuditMemos,
  loadTopicAuditReport,
  saveTopicAuditMemos,
  saveTopicAuditReport
} from "../src/state/topic-audit-storage.ts";
import { saveTopic } from "../src/state/topic-storage.ts";
import { handleTopicAuditMessage } from "../src/state/topic-audit-handlers.ts";
import type { SessionItem, SessionRecord, Signal, Topic } from "../src/state/types.ts";

class MemoryStorage {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values[key] };
  }

  async set(values: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...values };
  }
}

const TOPIC_SYNTHESIS_STORAGE_KEY = "dlens:test:topic-synthesis";

function makeTopic(): Topic {
  return {
    id: "topic-1",
    sessionId: "session-1",
    name: "love",
    status: "watching",
    tags: [],
    signalIds: ["signal-1", "signal-2"],
    pairIds: [],
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    context: null,
    synthesis: null
  };
}

function makeSignal(id: string, itemId: string): Signal {
  return {
    id,
    sessionId: "session-1",
    itemId,
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-1",
    capturedAt: "2026-05-22T00:00:00.000Z"
  };
}

function makeItem(id: string, author: string, text: string, replyText: string): SessionItem {
  return {
    id,
    descriptor: {
      target_type: "post",
      page_url: "https://www.threads.net/",
      post_url: `https://www.threads.net/@${author}/post/${id}`,
      author_hint: author,
      text_snippet: text,
      time_token_hint: "22/5",
      dom_anchor: "anchor",
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null },
      engagement_present: { likes: false, comments: false, reposts: false, forwards: false, views: false },
      captured_at: "2026-05-22T00:00:00.000Z"
    },
    status: "succeeded",
    selectedAt: "2026-05-22T00:00:00.000Z",
    savedAt: "2026-05-22T00:00:00.000Z",
    queuedAt: null,
    completedAt: "2026-05-22T00:01:00.000Z",
    captureId: `cap-${id}`,
    jobId: null,
    canonicalTargetUrl: `https://www.threads.net/@${author}/post/${id}`,
    latestJob: null,
    latestCapture: {
      id: `cap-${id}`,
      source_type: "threads",
      capture_type: "post",
      source_page_url: "https://www.threads.net/",
      source_post_url: `https://www.threads.net/@${author}/post/${id}`,
      canonical_target_url: `https://www.threads.net/@${author}/post/${id}`,
      author_hint: author,
      text_snippet: text,
      time_token_hint: "22/5",
      dom_anchor: "anchor",
      engagement: {},
      client_context: {},
      raw_payload: {},
      ingestion_status: "succeeded",
      captured_at: "2026-05-22T00:00:00.000Z",
      created_at: "2026-05-22T00:00:00.000Z",
      updated_at: "2026-05-22T00:01:00.000Z",
      job: null,
      result: {
        id: `result-${id}`,
        job_id: `job-${id}`,
        capture_id: `cap-${id}`,
        source_type: "threads",
        canonical_target_url: `https://www.threads.net/@${author}/post/${id}`,
        canonical_post: {},
        comments: [],
        thread_read_model: {
          assembled_content: `${text}\n\nOP 補充\n\n${replyText}`,
          root_post: { author, text, like_count: 10 },
          op_continuations: [{ comment_id: `op-${id}`, author, text: "OP 補充", like_count: 2 }],
          discussion_replies: [{ comment_id: `r-${id}`, author: "reader", text: replyText, like_count: 5 }]
        },
        crawl_meta: {},
        raw_payload: {},
        fetched_at: "2026-05-22T00:01:00.000Z",
        created_at: "2026-05-22T00:01:00.000Z"
      },
      analysis: {
        id: `analysis-${id}`,
        capture_id: `cap-${id}`,
        status: "succeeded",
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 2,
        clusters: [],
        evidence: [],
        metrics: {},
        generated_at: "2026-05-22T00:02:00.000Z",
        last_error: null,
        created_at: "2026-05-22T00:02:00.000Z",
        updated_at: "2026-05-22T00:02:00.000Z"
      }
    },
    commentsPreview: [],
    lastStatusAt: "2026-05-22T00:01:00.000Z",
    lastErrorKind: null,
    lastError: null
  };
}

function makeSession(): SessionRecord {
  return {
    id: "session-1",
    name: "love",
    mode: "topic",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    items: [
      makeItem("item-1", "op", "靚女玩 app 會遇到市場錯配。", "我同老公就是 app 識的。"),
      makeItem("item-2", "op2", "有人用收入衡量男友。", "點解用收入衡量一個男士？")
    ]
  };
}

function makeSessionWithSecondItemSaved(): SessionRecord {
  const session = makeSession();
  return {
    ...session,
    items: [
      session.items[0]!,
      {
        ...session.items[1]!,
        status: "saved",
        completedAt: null,
        captureId: null,
        latestCapture: null,
        commentsPreview: []
      }
    ]
  };
}

async function seedTopic(storage: MemoryStorage): Promise<void> {
  await saveTopic(storage, makeTopic());
  await storage.set({
    "dlens:v1:signals": [makeSignal("signal-1", "item-1"), makeSignal("signal-2", "item-2")]
  });
}

function makeEnvelope(label: string): AuditPromptEnvelope {
  return {
    prose: `${label} prose`,
    evidenceRefs: ["S1.OP"],
    caveats: [],
    coverage: "1/2"
  };
}

async function seedStoredAudit(storage: MemoryStorage, topicId: string, topicName: string): Promise<void> {
  await saveTopicAuditMemos(storage, topicId, {
    auditRunId: `audit-${topicId}`,
    inputHash: `hash-${topicId}`,
    signalReadings: [],
    lensMemos: [{
      auditRunId: `audit-${topicId}`,
      inputHash: `hash-${topicId}`,
      topicId,
      stageName: "absence",
      prose: `${topicName} absence memo`,
      evidenceRefs: [],
      caveats: [],
      promptVersion: "test",
      model: "mock:model",
      generatedAt: "2026-05-22T00:00:00.000Z"
    }]
  });
  await saveTopicAuditReport(storage, {
    auditRunId: `audit-${topicId}`,
    inputHash: `hash-${topicId}`,
    topicId,
    topicName,
    generatedFrom: [],
    coveragePerSection: {},
    sections: {
      overall: `${topicName} overall`,
      lexicon: "",
      scaleOrTime: "",
      narratives: "",
      audience: "",
      absence: `${topicName} absence`,
      editorial: `${topicName} editorial`
    },
    limitations: [],
    promptVersion: "test",
    model: "mock:model",
    generatedAt: "2026-05-22T00:00:00.000Z"
  });
}

test("topic audit build-evidence joins topic signals to session items and persists packets", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/build-evidence", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()]
  });

  assert.equal(response.auditEvidence?.length, 2);
  assert.deepEqual(response.auditEvidence?.[0]?.replyFragments.map((fragment) => fragment.role), [
    "op_continuation",
    "audience"
  ]);
  assert.deepEqual(await loadTopicAuditEvidence(storage, "topic-1"), response.auditEvidence);
  assert.ok(storage.values[TOPIC_AUDIT_EVIDENCE_STORAGE_KEY]);
});

test("topic audit run persists each stage and reuses cache on the same input", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const calls: string[] = [];
  const generator = async (stageName: string): Promise<AuditPromptEnvelope> => {
    calls.push(stageName);
    return makeEnvelope(stageName);
  };

  const first = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: generator,
    model: "mock:model"
  });

  assert.deepEqual(calls, [
    "p1-signal-reading",
    "p1-signal-reading",
    "lexicon",
    "narrative",
    "audience",
    "absence",
    "final"
  ]);
  assert.equal(first.auditReport?.topicId, "topic-1");
  assert.equal(first.auditValidatorFlags?.length, 0);
  assert.equal((await loadTopicAuditMemos(storage, "topic-1"))?.lensMemos.length, 4);
  assert.ok(await loadTopicAuditReport(storage, "topic-1"));
  assert.ok(storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY]);
  assert.ok(storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY]);

  const second = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: generator,
    model: "mock:model"
  });

  assert.equal(calls.length, 7);
  assert.equal(second.auditReport?.inputHash, first.auditReport?.inputHash);
});

test("topic audit run only generates P1 readings for ready signals", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const calls: string[] = [];

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSessionWithSecondItemSaved()],
    generateEnvelope: async (stageName) => {
      calls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(calls, ["p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
  assert.deepEqual(response.auditMemos?.signalReadings.map((reading) => reading.signalId), ["signal-1"]);
  assert.deepEqual(response.auditReport?.generatedFrom.filter((entry) => entry.endsWith(":p1")), ["S1:p1"]);
});

test("topic audit single P1 refuses saved signals before generating an OP-only reading", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const calls: string[] = [];

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-2" },
      sessions: [makeSessionWithSecondItemSaved()],
      generateEnvelope: async (stageName) => {
        calls.push(stageName);
        return makeEnvelope(stageName);
      },
      model: "mock:model"
    }),
    /Signal is not ready for audit/
  );

  assert.deepEqual(calls, []);
  assert.equal((await loadTopicAuditMemos(storage, "topic-1"))?.signalReadings.length ?? 0, 0);
});

test("topic audit run can resume from a later stage without rerunning completed stages", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const firstCalls: string[] = [];
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      firstCalls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  const resumedCalls: string[] = [];
  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1", fromStage: "narrative" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      resumedCalls.push(stageName);
      return makeEnvelope(`resumed-${stageName}`);
    },
    model: "mock:model"
  });

  assert.deepEqual(resumedCalls, ["narrative", "audience", "absence", "final"]);
  assert.equal(response.auditMemos?.signalReadings.length, 2);
  assert.equal(response.auditMemos?.lensMemos[0]?.stageName, "lexicon");
  assert.equal(response.auditMemos?.lensMemos[1]?.prose, "resumed-narrative prose");
});

test("topic audit run keeps per-signal P1 failures isolated", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  let p1Calls = 0;
  const generator = async (stageName: string): Promise<AuditPromptEnvelope> => {
    if (stageName === "p1-signal-reading") {
      p1Calls += 1;
      if (p1Calls === 1) {
        throw new Error("model timeout");
      }
    }
    return makeEnvelope(stageName);
  };

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: generator,
    model: "mock:model"
  });

  assert.equal(response.auditReport?.topicId, "topic-1");
  const memos = await loadTopicAuditMemos(storage, "topic-1");
  assert.equal(memos?.signalReadings.length, 1);
  assert.match(memos?.lensMemos[0]?.caveats.join(" ") ?? "", /P1 failures: S1/);
});

test("topic audit get, validate, and clear do not touch synthesis or topic signal reading keys", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  storage.values[TOPIC_SYNTHESIS_STORAGE_KEY] = { "topic-1": { untouched: true } };
  storage.values[TOPIC_SIGNAL_READINGS_STORAGE_KEY] = { "topic-1::signal-1": { untouched: true } };
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });

  const getResponse = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/get", topicId: "topic-1" },
    sessions: [makeSession()]
  });
  assert.ok(getResponse.auditReport);

  const validateResponse = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/validate", topicId: "topic-1" },
    sessions: [makeSession()]
  });
  assert.ok(validateResponse.auditValidatorFlags);

  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/clear", topicId: "topic-1" },
    sessions: [makeSession()]
  });

  assert.deepEqual(await loadTopicAuditEvidence(storage, "topic-1"), []);
  assert.equal(await loadTopicAuditReport(storage, "topic-1"), null);
  assert.deepEqual(storage.values[TOPIC_SYNTHESIS_STORAGE_KEY], { "topic-1": { untouched: true } });
  assert.deepEqual(storage.values[TOPIC_SIGNAL_READINGS_STORAGE_KEY], { "topic-1::signal-1": { untouched: true } });
});

test("cross-topic calibration requires at least two audited topics", async () => {
  const storage = new MemoryStorage();
  await assert.rejects(
    handleTopicAuditMessage(storage, {
      message: { type: "cross-topic/calibrate", topicIds: ["topic-1"] },
      sessions: [makeSession()],
      generateEnvelope: async (stageName) => makeEnvelope(stageName),
      model: "mock:model"
    }),
    /at least 2 topics/
  );
});

test("cross-topic calibration stores a calibration when at least two reports exist", async () => {
  const storage = new MemoryStorage();
  await seedStoredAudit(storage, "topic-1", "work");
  await seedStoredAudit(storage, "topic-2", "love");

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "cross-topic/calibrate", topicIds: ["topic-1", "topic-2"] },
    sessions: [makeSession()],
    generateEnvelope: async () => ({
      prose: "two-topic calibration",
      evidenceRefs: [],
      caveats: ["hedged"],
      coverage: "2/2"
    }),
    model: "mock:model"
  });

  assert.deepEqual(response.crossTopicCalibration?.topicIds, ["topic-1", "topic-2"]);
  assert.deepEqual(response.crossTopicCalibration?.topicsCompared, ["work", "love"]);
  assert.equal(response.auditValidatorFlags?.length, 0);
});
