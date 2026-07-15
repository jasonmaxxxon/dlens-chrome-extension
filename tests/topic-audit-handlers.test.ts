import assert from "node:assert/strict";
import test from "node:test";

import type { AuditPromptEnvelope } from "../src/compare/topic-audit-prompts.ts";
import { TOPIC_SIGNAL_READINGS_STORAGE_KEY } from "../src/compare/topic-signal-reading-storage.ts";
import {
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_EPISODES_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  loadTopicAuditEvidence,
  loadTopicAuditEpisodes,
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
  const p1Prompts: string[] = [];
  const generator = async (stageName: string, prompt: string): Promise<AuditPromptEnvelope> => {
    calls.push(stageName);
    if (stageName === "p1-signal-reading") {
      p1Prompts.push(prompt);
    }
    return makeEnvelope(stageName);
  };

  const first = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: generator,
    model: "mock:model"
  });

  assert.deepEqual(calls, [
    "comment-shard-reading",
    "comment-shard-reading",
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
  assert.equal(first.auditMemos?.shardReadings?.length, 2);
  assert.equal(first.auditMemos?.shardReadings?.[0]?.reading, "comment-shard-reading prose");
  assert.match(p1Prompts[0] ?? "", /comment-shard-reading prose/);
  assert.doesNotMatch(p1Prompts[0] ?? "", /我同老公就是 app 識的。/);
  assert.equal((await loadTopicAuditMemos(storage, "topic-1"))?.lensMemos.length, 4);
  assert.equal((await loadTopicAuditMemos(storage, "topic-1"))?.shardReadings?.length, 2);
  assert.ok(await loadTopicAuditReport(storage, "topic-1"));
  assert.ok(storage.values[TOPIC_AUDIT_MEMOS_STORAGE_KEY]);
  assert.ok(storage.values[TOPIC_AUDIT_REPORTS_STORAGE_KEY]);

  const second = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: generator,
    model: "mock:model"
  });

  assert.equal(calls.length, 9);
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

  assert.deepEqual(calls, ["comment-shard-reading", "p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
  assert.equal(response.auditMemos?.shardReadings?.length, 1);
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

test("topic audit single P1 generates missing P0.5 shard readings before bounded post synthesis", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const calls: string[] = [];
  const prompts: string[] = [];

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName, prompt) => {
      calls.push(stageName);
      prompts.push(prompt);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(calls, ["comment-shard-reading", "p1-signal-reading"]);
  assert.equal(response.auditMemos?.shardReadings?.length, 1);
  assert.equal(response.auditMemos?.shardReadings?.[0]?.reading, "comment-shard-reading prose");
  assert.match(prompts[1] ?? "", /comment-shard-reading prose/);
  assert.doesNotMatch(prompts[1] ?? "", /我同老公就是 app 識的。/);
});

test("topic audit single P1 keeps the P0.5 checkpoint when post synthesis fails", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
      sessions: [makeSession()],
      generateEnvelope: async (stageName) => {
        if (stageName === "p1-signal-reading") {
          throw new Error("post synthesis timeout");
        }
        return makeEnvelope(stageName);
      },
      model: "mock:model"
    }),
    /post synthesis timeout/
  );

  const memos = await loadTopicAuditMemos(storage, "topic-1");
  assert.equal(memos?.shardReadings?.length, 1);
  assert.equal(memos?.shardReadings?.[0]?.reading, "comment-shard-reading prose");
  assert.equal(memos?.signalReadings.length, 0);
});

test("topic audit rejects unknown inline evidence refs before persisting or replaying prose", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
      sessions: [makeSession()],
      generateEnvelope: async (stageName) => stageName === "comment-shard-reading"
        ? { prose: "不存在的留言 [S9.R9]。", evidenceRefs: [], caveats: [] }
        : makeEnvelope(stageName),
      model: "mock:model"
    }),
    /Unknown inline evidence ref: S9\.R9/
  );

  assert.equal(await loadTopicAuditMemos(storage, "topic-1"), null);
});

test("topic audit keeps inline-ref validation strict for an empty audience shard", async () => {
  const storage = new MemoryStorage();
  await saveTopic(storage, { ...makeTopic(), signalIds: ["signal-1"] });
  await storage.set({ "dlens:v1:signals": [makeSignal("signal-1", "item-1")] });
  const session = makeSession();
  const emptyItem = {
    ...session.items[0]!,
    latestCapture: {
      ...session.items[0]!.latestCapture!,
      result: {
        ...session.items[0]!.latestCapture!.result!,
        thread_read_model: {
          ...session.items[0]!.latestCapture!.result!.thread_read_model!,
          discussion_replies: []
        }
      }
    }
  };

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
      sessions: [{ ...session, items: [emptyItem] }],
      generateEnvelope: async (stageName) => stageName === "comment-shard-reading"
        ? { prose: "空 shard 不應憑空引用 [S9.R9]。", evidenceRefs: [], caveats: [] }
        : makeEnvelope(stageName),
      model: "mock:model"
    }),
    /Unknown inline evidence ref: S9\.R9/
  );
});

test("topic audit merges valid inline prose refs into the structured evidenceRefs", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => stageName === "p1-signal-reading"
      ? { prose: "讀者以自身經驗校正 OP [S1.R1]。", evidenceRefs: [], caveats: [] }
      : makeEnvelope(stageName),
    model: "mock:model"
  });

  assert.deepEqual(response.auditMemos?.signalReadings[0]?.evidenceRefs, ["S1.R1"]);
});

test("topic audit rejects unknown inline refs hidden in display theme chips", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
      sessions: [makeSession()],
      generateEnvelope: async (stageName) => stageName === "lexicon"
        ? {
            ...makeEnvelope(stageName),
            displayHints: { themeChips: ["虛構來源 [S9.R9]"] }
          }
        : makeEnvelope(stageName),
      model: "mock:model"
    }),
    /Unknown inline evidence ref: S9\.R9/
  );

  assert.equal(
    (await loadTopicAuditMemos(storage, "topic-1"))?.lensMemos.some((memo) => memo.stageName === "lexicon"),
    false
  );
});

test("topic audit drops narrative lanes that have no valid structured refs", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => stageName === "narrative"
      ? {
          ...makeEnvelope(stageName),
          displayHints: {
            narrativeLanes: [{ id: "fake", label: "沒有證據", signalRefs: ["S9.R9"], consensus: 0.8 }]
          }
        }
      : makeEnvelope(stageName),
    model: "mock:model"
  });

  assert.deepEqual(
    response.auditMemos?.lensMemos.find((memo) => memo.stageName === "narrative")?.displayHints?.narrativeLanes,
    []
  );
});

test("topic audit run can resume from a later stage without rerunning completed stages", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const firstCalls: string[] = [];
  const first = await handleTopicAuditMessage(storage, {
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
  assert.equal(response.auditMemos?.shardReadings?.length, 2);
  assert.equal(response.auditMemos?.signalReadings.length, 2);
  assert.equal(response.auditMemos?.lensMemos[0]?.stageName, "lexicon");
  assert.equal(response.auditMemos?.lensMemos[1]?.prose, "resumed-narrative prose");
});

test("topic audit audience stage stores structured reaction patterns from P4", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);

  const response = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      if (stageName === "audience") {
        return {
          prose: "audience prose",
          evidenceRefs: ["S1.R1"],
          caveats: [],
          coverage: "2/2",
          displayHints: {
            reactionCoverage: {
              postCount: 2,
              capturedCommentCount: 4,
              readCommentCount: 2,
              usableAudienceCommentCount: 2
            },
            reactionPatterns: [{
              id: "reaction-personal-counter",
              label: "個人反例校正",
              dynamicImplication: "留言把 OP 的市場框架拉回個人差異。",
              nComments: 1,
              nAuthors: 1,
              coverageDenominator: 2,
              supportRefs: ["S1.R1"],
              counterRefs: ["S2.R1"],
              representativeRefs: ["S1.R1"],
              counterRepresentativeRefs: ["S2.R1"]
            }]
          }
        };
      }
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  const audienceMemo = response.auditMemos?.lensMemos.find((memo) => memo.stageName === "audience");
  assert.equal(audienceMemo?.displayHints?.reactionCoverage?.usableAudienceCommentCount, 2);
  assert.equal(audienceMemo?.displayHints?.reactionPatterns?.[0]?.label, "個人反例校正");
  assert.deepEqual(audienceMemo?.displayHints?.reactionPatterns?.[0]?.supportRefs, ["S1.R1"]);
});

test("topic audit publishes a bounded narrative state and carries claim ids across runs", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const first = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => stageName === "final"
      ? {
          ...makeEnvelope(stageName),
          continuityReview: {
            carriedClaims: [],
            newClaims: [{
              statement: "讀者用個人反例收窄市場論",
              rationale: "首次建立可追蹤命題",
              evidenceRefs: ["S1.R1"]
            }],
            voices: [{ label: "反例者", position: "要求保留個人差異", evidenceRefs: ["S1.R1"] }],
            openQuestions: ["反例是否會跨貼文持續？"]
          }
        }
      : makeEnvelope(stageName),
    model: "mock:model"
  });
  assert.equal(first.auditReport?.narrativeState?.claims[0]?.id, "claim-1");
  assert.equal(first.auditReport?.narrativeState?.claims[0]?.trajectory, "new");
  assert.ok(JSON.stringify(first.auditReport?.narrativeState).length <= 4096);
  assert.equal(first.auditEpisodes?.length, 1);
  assert.equal(first.auditEpisodes?.[0]?.transition, "first");

  const prompts: string[] = [];
  const second = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1", force: true },
    sessions: [makeSession()],
    generateEnvelope: async (stageName, prompt) => {
      prompts.push(prompt);
      return stageName === "final"
        ? {
            ...makeEnvelope(stageName),
            continuityReview: {
              carriedClaims: [{
                claimId: "claim-1",
                outcome: "stable",
                statement: "讀者用個人反例收窄市場論",
                rationale: "本次仍有同一證據",
                evidenceRefs: ["S1.R1"]
              }],
              newClaims: [],
              voices: [],
              openQuestions: []
            }
          }
        : makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.equal(second.auditReport?.narrativeState?.claims[0]?.id, "claim-1");
  assert.equal(second.auditReport?.narrativeState?.claims[0]?.trajectory, "stable");
  assert.notEqual(second.auditReport?.auditRunId, first.auditReport?.auditRunId);
  assert.equal(second.auditMemos?.auditRunId, second.auditReport?.auditRunId);
  assert.equal(second.auditEpisodes?.length, 1);
  assert.equal(second.auditEpisodes?.[0]?.transition, "first");
  assert.equal(second.auditEpisodes?.[0]?.auditRunId, second.auditReport?.auditRunId);
  assert.ok(prompts.filter((prompt) => prompt.includes("claim-1")).length >= 3);
});

test("topic audit carries claim ids while single-signal P1 regeneration preserves the stale report", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => stageName === "final"
      ? {
          ...makeEnvelope(stageName),
          continuityReview: {
            carriedClaims: [],
            newClaims: [{
              statement: "讀者用個人反例收窄市場論",
              rationale: "首次建立可追蹤命題",
              evidenceRefs: ["S1.R1"]
            }],
            voices: [],
            openQuestions: []
          }
        }
      : makeEnvelope(stageName),
    model: "mock:model"
  });
  const publishedBeforeP1 = await loadTopicAuditReport(storage, "topic-1");
  assert.equal(publishedBeforeP1?.narrativeState?.claims[0]?.id, "claim-1");

  // Regenerating one signal's P1 keeps the last complete publication available as stale.
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });
  assert.deepEqual(await loadTopicAuditReport(storage, "topic-1"), publishedBeforeP1);
  assert.equal((await loadTopicAuditEpisodes(storage, "topic-1")).length, 1);
  const memosAfterP1 = await loadTopicAuditMemos(storage, "topic-1");
  assert.deepEqual(memosAfterP1?.signalReadings.map((reading) => reading.signalId).sort(), ["signal-1", "signal-2"]);
  assert.equal(memosAfterP1?.lensMemos.length, 4);

  // The next full audit must recover the prior state from the surviving episode: claim-1 stays the
  // same proposition and the new proposition gets claim-2 — claim-1 is never reused for another claim.
  const prompts: string[] = [];
  const third = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1", force: true },
    sessions: [makeSession()],
    generateEnvelope: async (stageName, prompt) => {
      prompts.push(prompt);
      return stageName === "final"
        ? {
            ...makeEnvelope(stageName),
            continuityReview: {
              carriedClaims: [{
                claimId: "claim-1",
                outcome: "stable",
                statement: "讀者用個人反例收窄市場論",
                rationale: "本次仍有同一證據",
                evidenceRefs: ["S1.R1"]
              }],
              newClaims: [{
                statement: "第二個獨立命題",
                rationale: "新觀察",
                evidenceRefs: ["S1.R1"]
              }],
              voices: [],
              openQuestions: []
            }
          }
        : makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  const carried = third.auditReport?.narrativeState?.claims.find((claim) => claim.id === "claim-1");
  const fresh = third.auditReport?.narrativeState?.claims.find((claim) => claim.id === "claim-2");
  assert.equal(carried?.statement, "讀者用個人反例收窄市場論");
  assert.equal(carried?.trajectory, "stable");
  assert.equal(fresh?.statement, "第二個獨立命題");
  assert.equal(fresh?.trajectory, "new");
  assert.deepEqual(
    third.auditEpisodes?.[0]?.delta.map((entry) => ({
      claimId: entry.claimId,
      trajectory: entry.trajectory
    })),
    [
      { claimId: "claim-1", trajectory: "new" },
      { claimId: "claim-2", trajectory: "new" }
    ]
  );
  assert.ok(prompts.some((prompt) => prompt.includes("claim-1")));
});

test("topic audit does not replace the published report when continuity accounting is invalid", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => stageName === "final"
      ? {
          ...makeEnvelope(stageName),
          continuityReview: {
            carriedClaims: [],
            newClaims: [{ statement: "可追蹤命題", rationale: "首次建立", evidenceRefs: ["S1.R1"] }],
            voices: [],
            openQuestions: []
          }
        }
      : makeEnvelope(stageName),
    model: "mock:model"
  });
  const published = await loadTopicAuditReport(storage, "topic-1");
  const publishedEpisodes = await loadTopicAuditEpisodes(storage, "topic-1");
  assert.equal(published?.narrativeState?.claims[0]?.id, "claim-1");

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1", force: true },
      sessions: [makeSession()],
      generateEnvelope: async (stageName) => stageName === "final"
        ? {
            ...makeEnvelope(stageName),
            continuityReview: { carriedClaims: [], newClaims: [], voices: [], openQuestions: [] }
          }
        : makeEnvelope(stageName),
      model: "mock:model"
    }),
    /account for every active prior claim/
  );

  assert.deepEqual(await loadTopicAuditReport(storage, "topic-1"), published);
  assert.deepEqual(await loadTopicAuditEpisodes(storage, "topic-1"), publishedEpisodes);
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

test("topic audit append reuses unchanged per-signal P0.5 and P1 artifacts while rerunning topic lenses", async () => {
  const storage = new MemoryStorage();
  await saveTopic(storage, { ...makeTopic(), signalIds: ["signal-1"] });
  await storage.set({
    "dlens:v1:signals": [makeSignal("signal-1", "item-1"), makeSignal("signal-2", "item-2")]
  });
  const firstSession = makeSession();
  const firstCalls: string[] = [];
  const first = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [{ ...firstSession, items: [firstSession.items[0]!] }],
    generateEnvelope: async (stageName) => {
      firstCalls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });
  const originalS1 = first.auditMemos?.signalReadings.find((reading) => reading.signalId === "signal-1");
  assert.ok(originalS1);

  await saveTopic(storage, makeTopic());
  const secondCalls: string[] = [];
  const second = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      secondCalls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(firstCalls, ["comment-shard-reading", "p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
  assert.deepEqual(secondCalls, ["comment-shard-reading", "p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
  assert.equal(
    second.auditMemos?.signalReadings.find((reading) => reading.signalId === "signal-1")?.generatedAt,
    originalS1.generatedAt
  );
  assert.equal(second.auditEpisodes?.length, 2);
  assert.equal(second.auditEpisodes?.[1]?.transition, "advance");
});

test("topic audit topic-definition changes bypass fast return and publish a rebase episode", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });
  await saveTopic(storage, {
    ...makeTopic(),
    description: "新的研究定義",
    context: { researchQuestion: "這個敘事如何改變？" }
  });

  const calls: string[] = [];
  const result = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      calls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(calls, ["lexicon", "narrative", "audience", "absence", "final"]);
  assert.equal(result.auditEpisodes?.length, 2);
  assert.equal(result.auditEpisodes?.[1]?.transition, "rebase");
});

test("topic audit retries a missing P1 on the same input instead of fast-returning an incomplete report", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  let p1Calls = 0;
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      if (stageName === "p1-signal-reading") {
        p1Calls += 1;
        if (p1Calls === 1) throw new Error("first P1 timeout");
      }
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  const retryCalls: string[] = [];
  const retried = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      retryCalls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(retryCalls, ["p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
  assert.deepEqual(retried.auditMemos?.signalReadings.map((reading) => reading.signalId).sort(), ["signal-1", "signal-2"]);
});

test("topic audit restarts aggregate lenses when resume fills a previously missing P1", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  let p1Calls = 0;
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      if (stageName === "p1-signal-reading" && ++p1Calls === 1) {
        throw new Error("first P1 timeout");
      }
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  const calls: string[] = [];
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1", fromStage: "narrative" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      calls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(calls, ["p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
});

test("topic audit invalidates only the signal whose captured content changed", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  const first = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });

  const changedSession = makeSession();
  const item = changedSession.items[1]!;
  const capture = item.latestCapture!;
  const result = capture.result!;
  const thread = result.thread_read_model!;
  changedSession.items[1] = {
    ...item,
    latestCapture: {
      ...capture,
      result: {
        ...result,
        thread_read_model: {
          ...thread,
          discussion_replies: [{
            ...thread.discussion_replies[0]!,
            text: "第二個訊號的留言內容已經改變。"
          }]
        }
      }
    }
  };
  const calls: Array<{ stageName: string; prompt: string }> = [];
  const changed = await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [changedSession],
    generateEnvelope: async (stageName, prompt) => {
      calls.push({ stageName, prompt });
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(calls.map((call) => call.stageName), [
    "comment-shard-reading",
    "p1-signal-reading",
    "lexicon",
    "narrative",
    "audience",
    "absence",
    "final"
  ]);
  assert.match(calls[0]?.prompt ?? "", /S2\.OP/);
  assert.match(calls[1]?.prompt ?? "", /S2\.OP/);
  assert.notEqual(first.auditReport?.auditRunId, changed.auditReport?.auditRunId);
});

test("topic audit invalidates per-signal artifacts when signal order moves their evidence aliases", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });

  await saveTopic(storage, { ...makeTopic(), signalIds: ["signal-2", "signal-1"] });
  const calls: string[] = [];
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      calls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.equal(calls.filter((stageName) => stageName === "comment-shard-reading").length, 2);
  assert.equal(calls.filter((stageName) => stageName === "p1-signal-reading").length, 2);
});

test("topic audit refuses to replay a cache-valid memo containing an unknown inline ref", async () => {
  const storage = new MemoryStorage();
  await seedTopic(storage);
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });
  const bundle = await loadTopicAuditMemos(storage, "topic-1");
  assert.ok(bundle);
  if (!bundle) return;
  await saveTopicAuditMemos(storage, "topic-1", {
    ...bundle,
    signalReadings: bundle.signalReadings.map((reading) => reading.signalId === "signal-1"
      ? { ...reading, reading: "竄改的舊 memo [S9.R9]" }
      : reading)
  });

  const calls: string[] = [];
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [makeSession()],
    generateEnvelope: async (stageName) => {
      calls.push(stageName);
      return makeEnvelope(stageName);
    },
    model: "mock:model"
  });

  assert.deepEqual(calls, ["p1-signal-reading", "lexicon", "narrative", "audience", "absence", "final"]);
});

test("topic audit checkpoints each completed shard before a later shard fails", async () => {
  const storage = new MemoryStorage();
  await saveTopic(storage, { ...makeTopic(), signalIds: ["signal-1"] });
  await storage.set({ "dlens:v1:signals": [makeSignal("signal-1", "item-1")] });
  const session = makeSession();
  const item = session.items[0]!;
  const capture = item.latestCapture!;
  const result = capture.result!;
  const thread = result.thread_read_model!;
  session.items = [{
    ...item,
    latestCapture: {
      ...capture,
      result: {
        ...result,
        thread_read_model: {
          ...thread,
          discussion_replies: [
            { comment_id: "long-1", author: "reader-1", text: "甲".repeat(10_000), like_count: 1 },
            { comment_id: "long-2", author: "reader-2", text: "乙".repeat(10_000), like_count: 1 }
          ]
        }
      }
    }
  }];
  let shardCalls = 0;

  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
      sessions: [session],
      generateEnvelope: async (stageName) => {
        if (stageName === "comment-shard-reading" && ++shardCalls === 2) {
          throw new Error("second shard timeout");
        }
        return makeEnvelope(stageName);
      },
      model: "mock:model"
    }),
    /second shard timeout/
  );

  const checkpoint = await loadTopicAuditMemos(storage, "topic-1");
  assert.equal(checkpoint?.shardReadings?.length, 1);
  assert.equal(checkpoint?.shardReadings?.[0]?.shardIndex, 0);
});

test("topic audit preserves the published report when a single-P1 checkpoint fails", async () => {
  const storage = new MemoryStorage();
  await saveTopic(storage, { ...makeTopic(), signalIds: ["signal-1"] });
  await storage.set({ "dlens:v1:signals": [makeSignal("signal-1", "item-1")] });
  const originalSession = makeSession();
  await handleTopicAuditMessage(storage, {
    message: { type: "topic/audit/run", sessionId: "session-1", topicId: "topic-1" },
    sessions: [{ ...originalSession, items: [originalSession.items[0]!] }],
    generateEnvelope: async (stageName) => makeEnvelope(stageName),
    model: "mock:model"
  });
  const publishedBeforeP1 = await loadTopicAuditReport(storage, "topic-1");
  assert.ok(publishedBeforeP1);

  const changedSession = makeSession();
  const item = changedSession.items[0]!;
  const capture = item.latestCapture!;
  const result = capture.result!;
  const thread = result.thread_read_model!;
  changedSession.items = [{
    ...item,
    latestCapture: {
      ...capture,
      result: {
        ...result,
        thread_read_model: {
          ...thread,
          discussion_replies: [
            { comment_id: "new-long-1", author: "reader-1", text: "甲".repeat(10_000), like_count: 1 },
            { comment_id: "new-long-2", author: "reader-2", text: "乙".repeat(10_000), like_count: 1 }
          ]
        }
      }
    }
  }];
  let shardCalls = 0;
  await assert.rejects(
    () => handleTopicAuditMessage(storage, {
      message: { type: "topic/audit/p1-signal", sessionId: "session-1", topicId: "topic-1", signalId: "signal-1" },
      sessions: [changedSession],
      generateEnvelope: async (stageName) => {
        if (stageName === "comment-shard-reading" && ++shardCalls === 2) {
          throw new Error("second shard timeout");
        }
        return makeEnvelope(stageName);
      },
      model: "mock:model"
    }),
    /second shard timeout/
  );

  assert.deepEqual(await loadTopicAuditReport(storage, "topic-1"), publishedBeforeP1);
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
  assert.equal(getResponse.auditEpisodes?.length, 1);

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
  assert.deepEqual(await loadTopicAuditEpisodes(storage, "topic-1"), []);
  assert.ok(storage.values[TOPIC_AUDIT_EPISODES_STORAGE_KEY]);
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
