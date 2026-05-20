import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDLensSignalPacket,
  buildSignalPacketIndex,
  DLENS_SIGNAL_PACKET_VERSION
} from "../src/compare/signal-packet.ts";
import { PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY } from "../src/compare/product-agent-task-feedback.ts";
import { PRODUCT_CONTEXT_STORAGE_KEY } from "../src/compare/product-context.ts";
import { buildProductContextHash } from "../src/compare/product-signal-analysis.ts";
import { PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY } from "../src/compare/product-signal-storage.ts";
import { SIGNAL_READINGS_STORAGE_KEY, type SignalReading } from "../src/compare/signal-reading-storage.ts";
import { SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../src/state/topic-storage.ts";
import { createDefaultSettings, type ExtensionGlobalState, type ProductContext, type ProductSignalAnalysis, type SessionItem } from "../src/state/types.ts";
import type { CaptureSnapshot } from "../src/contracts/ingest.ts";
import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  const getCalls: string[] = [];
  return {
    data,
    getCalls,
    async get(key: string) {
      getCalls.push(key);
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    }
  };
}

function makeDescriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@builder/post/abc",
    post_url: "https://www.threads.net/@builder/post/abc",
    author_hint: "builder",
    text_snippet: "A useful agent workflow pattern.",
    time_token_hint: "2h",
    dom_anchor: "article-1",
    engagement: { likes: 10, comments: 2, reposts: 1, forwards: 0, views: 100 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-05-19T08:00:00.000Z",
    ...overrides
  };
}

function makeCapture(overrides: Partial<CaptureSnapshot> = {}): CaptureSnapshot {
  return {
    id: "cap-1",
    source_type: "threads",
    capture_type: "post",
    source_page_url: "https://www.threads.net/@builder/post/abc",
    source_post_url: "https://www.threads.net/@builder/post/abc",
    canonical_target_url: "https://www.threads.net/@builder/post/abc",
    author_hint: "builder",
    text_snippet: "A useful agent workflow pattern.",
    time_token_hint: "2h",
    dom_anchor: "article-1",
    engagement: {},
    client_context: {},
    raw_payload: {},
    ingestion_status: "succeeded",
    captured_at: "2026-05-19T08:00:00.000Z",
    created_at: "2026-05-19T08:00:00.000Z",
    updated_at: "2026-05-19T08:05:00.000Z",
    job: null,
    result: {
      id: "result-1",
      job_id: "job-1",
      capture_id: "cap-1",
      source_type: "threads",
      canonical_target_url: "https://www.threads.net/@builder/post/abc",
      canonical_post: { text: "A useful agent workflow pattern." },
      comments: [],
      thread_read_model: {
        assembled_content: "Root post plus OP continuation.",
        discussion_replies: [
          { comment_id: "c1", author: "pm", text: "This could become a weekly agent handoff.", like_count: 9 },
          { comment_id: "c2", author: "eng", text: "Useful only if feedback is preserved.", like_count: 5 }
        ]
      },
      crawl_meta: {},
      raw_payload: {},
      fetched_at: "2026-05-19T08:04:00.000Z",
      created_at: "2026-05-19T08:04:00.000Z"
    },
    analysis: null,
    ...overrides
  };
}

function makeItem(id: string, descriptor = makeDescriptor()): SessionItem {
  return {
    id,
    descriptor,
    status: "succeeded",
    selectedAt: descriptor.captured_at,
    savedAt: descriptor.captured_at,
    queuedAt: "2026-05-19T08:01:00.000Z",
    completedAt: "2026-05-19T08:05:00.000Z",
    captureId: "cap-1",
    jobId: "job-1",
    canonicalTargetUrl: descriptor.post_url,
    latestJob: null,
    latestCapture: makeCapture(),
    commentsPreview: [],
    lastStatusAt: "2026-05-19T08:05:00.000Z",
    lastErrorKind: null,
    lastError: null
  };
}

function makeGlobalState(items: SessionItem[]): ExtensionGlobalState {
  return {
    settings: createDefaultSettings(),
    sessions: [{
      id: "session-1",
      name: "Product signals",
      mode: "product",
      createdAt: "2026-05-19T08:00:00.000Z",
      updatedAt: "2026-05-19T08:10:00.000Z",
      items
    }],
    activeSessionId: "session-1",
    updatedAt: "2026-05-19T08:10:00.000Z"
  };
}

function makeProductContext(overrides: Partial<ProductContext> = {}): ProductContext {
  return {
    productPromise: "把 Threads signal 變成 agent-readable product decisions.",
    targetAudience: "indie builders",
    agentRoles: ["collector", "judge"],
    coreWorkflows: ["save signal", "review reading"],
    currentCapabilities: ["Product signal analysis"],
    explicitConstraints: ["local-first"],
    nonGoals: ["multi-tenant SaaS"],
    preferredTechDirection: "Chrome extension first",
    evaluationCriteria: ["decision quality"],
    unknowns: ["mobile share"],
    compiledAt: "2026-05-19T08:00:00.000Z",
    sourceFileIds: ["file-1"],
    promptVersion: "v1",
    ...overrides
  };
}

function makeAnalysis(signalId: string, overrides: Partial<ProductSignalAnalysis> = {}): ProductSignalAnalysis {
  return {
    signalId,
    signalType: "learning",
    signalSubtype: "agent_handoff_workflow",
    contentType: "mixed",
    contentSummary: "把社群 signal 變成 agent handoff。",
    relevance: 5,
    relevantTo: ["coreWorkflows"],
    referenceType: "workflow_pattern",
    referenceLabel: "可借用 agent handoff",
    referenceTakeaway: "重點是保存用戶判斷，而不是只保存原文。",
    whyRelevant: "直接對應 DLens 的 service layer。",
    verdict: "try",
    reason: "可做成低風險 read-model。",
    experimentHint: "先輸出可索引 packet。",
    agentTaskSpec: {
      targetAgent: "codex",
      taskTitle: "寫 packet",
      taskPrompt: "1. 讀取 signal storage\n2. 組成 packet\n3. 輸出測試覆蓋",
      requiredContext: ["signal storage", "product signal analysis"]
    },
    evidenceRefs: ["e1"],
    evidenceNotes: [{
      ref: "e1",
      quoteSummary: "weekly agent handoff",
      whyItMatters: "直接支持 agent 可用輸出。"
    }],
    productContextHash: buildProductContextHash(makeProductContext()),
    promptVersion: "v16",
    model: "google:gemini-3.1-flash-lite-preview",
    analyzedAt: "2026-05-19T08:06:00.000Z",
    status: "complete",
    ...overrides
  };
}

function makeReading(overrides: Partial<SignalReading> = {}): SignalReading {
  return {
    signalId: "signal-1",
    cacheKey: "signal-1::ctx_1::pkt_1::v1",
    productContextHash: "ctx_1",
    sourcePacketHash: "pkt_1",
    promptVersion: "v1",
    reading: "這條 signal 的價值在於 agent handoff 直接可用。",
    generatedAt: "2026-05-19T08:07:00.000Z",
    model: "google:gemini",
    sourceRefs: ["e1"],
    sourcePacket: {
      assembledContent: "Root post plus OP continuation.",
      postUrl: "https://www.threads.net/@builder/post/abc",
      representativeComments: [{ ref: "e1", author: "pm", text: "This could become a weekly agent handoff." }],
      analysisPromptVersion: "v16"
    },
    reviewState: "filed",
    feedbackEvents: [
      { type: "deferred", at: "2026-05-19T08:08:00.000Z", note: "需要多一點 evidence。" },
      { type: "filed", at: "2026-05-19T08:09:00.000Z", note: "這個 pattern 可留。" }
    ],
    ...overrides
  };
}

test("buildDLensSignalPacket joins source, judgment, reading, feedback timeline, and agent handoff", async () => {
  const productContext = makeProductContext();
  const storage = makeStorage({
    [SIGNALS_STORAGE_KEY]: [{
      id: "signal-1",
      sessionId: "session-1",
      itemId: "item-1",
      source: "threads",
      inboxStatus: "assigned",
      topicId: "topic-1",
      capturedAt: "2026-05-19T08:00:00.000Z"
    }],
    [TOPICS_STORAGE_KEY]: [{
      id: "topic-1",
      sessionId: "session-1",
      name: "Agent workflows",
      status: "learning",
      tags: ["agent"],
      signalIds: ["signal-1"],
      pairIds: [],
      createdAt: "2026-05-19T08:00:00.000Z",
      updatedAt: "2026-05-19T08:10:00.000Z"
    }],
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": makeAnalysis("signal-1")
    },
    [SIGNAL_READINGS_STORAGE_KEY]: {
      "signal-1::ctx_1::pkt_1::v1": makeReading()
    },
    [PRODUCT_CONTEXT_STORAGE_KEY]: productContext,
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: [{
      signalId: "signal-1",
      taskPromptHash: "task_1",
      feedback: "adopted",
      createdAt: "2026-05-19T08:11:00.000Z"
    }]
  });

  const packet = await buildDLensSignalPacket(storage, makeGlobalState([makeItem("item-1")]), "signal-1");

  assert.ok(packet);
  assert.equal(packet.packetVersion, DLENS_SIGNAL_PACKET_VERSION);
  assert.equal(packet.source.signalId, "signal-1");
  assert.equal(packet.source.sessionName, "Product signals");
  assert.equal(packet.source.url, "https://www.threads.net/@builder/post/abc");
  assert.equal(packet.evidence.textEvidence[0]?.ref, "e1");
  assert.deepEqual(packet.evidence.imageEvidence, []);
  assert.equal(packet.judgment?.verdict, "try");
  assert.equal(packet.productContext.hash, buildProductContextHash(productContext));
  assert.equal(packet.productContext.productPromise, "把 Threads signal 變成 agent-readable product decisions.");
  assert.deepEqual(packet.productContext.coreWorkflows, ["save signal", "review reading"]);
  assert.equal(packet.productContext.compiledAt, "2026-05-19T08:00:00.000Z");
  assert.deepEqual(packet.productContext.sourceFileIds, ["file-1"]);
  assert.equal(packet.productContext.promptVersion, "v1");
  assert.equal(packet.reading.latest?.cacheKey, "signal-1::ctx_1::pkt_1::v1");
  assert.equal(packet.reading.filed.length, 1);
  assert.equal(packet.agentHandoff.taskSpec?.taskTitle, "寫 packet");
  assert.deepEqual(packet.agentHandoff.requiredContext, ["signal storage", "product signal analysis"]);
  assert.deepEqual(packet.topicContext.topics.map((topic) => topic.name), ["Agent workflows"]);
  assert.deepEqual(packet.userFeedback.feedbackTimeline.map((event) => event.kind), [
    "reading",
    "reading",
    "agent_task"
  ]);
  assert.equal(packet.userFeedback.readingFeedback[0]?.events.length, 2);
  assert.equal(packet.decisionTrace.traceVersion, "v1");
  assert.equal(packet.decisionTrace.stages.length, 2);
  const judgmentTrace = packet.decisionTrace.stages.find((stage) => stage.stage === "structured_judgment");
  assert.equal(judgmentTrace?.model, "google:gemini-3.1-flash-lite-preview");
  assert.equal(judgmentTrace?.promptVersion, "v16");
  assert.deepEqual(judgmentTrace?.evidenceRefs, ["e1"]);
  assert.match(judgmentTrace?.reasoningDetails.summary ?? "", /低風險 read-model/);
  assert.match(judgmentTrace?.reasoningDetails.keyInsights[0] ?? "", /service layer/);
  assert.match(judgmentTrace?.reasoningDetails.keyDecisions[0] ?? "", /service layer/);
  assert.match(judgmentTrace?.reasoningDetails.keyDecisions[1] ?? "", /保存用戶判斷/);
  assert.match(judgmentTrace?.evidence[0]?.whyItMatters ?? "", /agent 可用輸出/);
  const readingTrace = packet.decisionTrace.stages.find((stage) => stage.stage === "free_reading");
  assert.equal(readingTrace?.model, "google:gemini");
  assert.equal(readingTrace?.promptVersion, "v1");
  assert.deepEqual(readingTrace?.evidenceRefs, ["e1"]);
  assert.match(readingTrace?.reasoningDetails.summary ?? "", /agent handoff 直接可用/);
  assert.match(readingTrace?.reasoningDetails.keyInsights[0] ?? "", /agent handoff 直接可用/);
  assert.match(readingTrace?.reasoningDetails.keyDecisions[0] ?? "", /agent handoff 直接可用/);
});

test("buildDLensSignalPacket keeps reading source refs resolvable in top-level evidence", async () => {
  const productContext = makeProductContext();
  const storage = makeStorage({
    [SIGNALS_STORAGE_KEY]: [{
      id: "signal-1",
      sessionId: "session-1",
      itemId: "item-1",
      source: "threads",
      inboxStatus: "assigned",
      capturedAt: "2026-05-19T08:00:00.000Z"
    }],
    [TOPICS_STORAGE_KEY]: [],
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": makeAnalysis("signal-1")
    },
    [SIGNAL_READINGS_STORAGE_KEY]: {
      "signal-1::ctx_1::pkt_1::v1": makeReading({
        sourceRefs: ["e1", "e3"],
        sourcePacket: {
          assembledContent: "Root post plus OP continuation.",
          postUrl: "https://www.threads.net/@builder/post/abc",
          representativeComments: [
            { ref: "e1", author: "pm", text: "This could become a weekly agent handoff.", likeCount: 9 },
            { ref: "e3", author: "reader", text: "The highest-signal objection was outside the capture catalog.", likeCount: 12 }
          ],
          analysisPromptVersion: "v16"
        }
      })
    },
    [PRODUCT_CONTEXT_STORAGE_KEY]: productContext,
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: []
  });
  const item = makeItem("item-1");
  item.latestCapture = makeCapture({
    result: {
      ...makeCapture().result!,
      thread_read_model: {
        assembled_content: "Root post plus OP continuation.",
        discussion_replies: [
          { comment_id: "c1", author: "pm", text: "This could become a weekly agent handoff.", like_count: 9 },
          { comment_id: "c2", author: "eng", text: "Useful only if feedback is preserved.", like_count: 5 }
        ]
      }
    }
  });

  const packet = await buildDLensSignalPacket(storage, makeGlobalState([item]), "signal-1");

  assert.ok(packet);
  assert.ok(packet.reading.latest?.sourceRefs.includes("e3"));
  const evidenceRefs = packet.evidence.textEvidence.map((entry) => entry.ref);
  assert.ok(evidenceRefs.includes("e3"));
  const e3 = packet.evidence.textEvidence.find((entry) => entry.ref === "e3");
  assert.equal(e3?.author, "reader");
  assert.equal(e3?.text, "The highest-signal objection was outside the capture catalog.");
  assert.equal(e3?.likeCount, 12);
  const readingTrace = packet.decisionTrace.stages.find((stage) => stage.stage === "free_reading");
  assert.match(readingTrace?.evidence.find((entry) => entry.ref === "e3")?.text ?? "", /highest-signal objection/);
});

test("buildSignalPacketIndex bulk-loads storage once per layer and filters packets", async () => {
  const productContext = makeProductContext();
  const storage = makeStorage({
    [SIGNALS_STORAGE_KEY]: [
      {
        id: "signal-1",
        sessionId: "session-1",
        itemId: "item-1",
        source: "threads",
        inboxStatus: "assigned",
        topicId: "topic-1",
        capturedAt: "2026-05-19T08:00:00.000Z"
      },
      {
        id: "signal-2",
        sessionId: "session-1",
        itemId: "item-2",
        source: "threads",
        inboxStatus: "unprocessed",
        capturedAt: "2026-05-19T08:03:00.000Z"
      }
    ],
    [TOPICS_STORAGE_KEY]: [],
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": makeAnalysis("signal-1", { verdict: "try" }),
      "signal-2": makeAnalysis("signal-2", { verdict: "watch", agentTaskSpec: undefined })
    },
    [SIGNAL_READINGS_STORAGE_KEY]: {
      "signal-1::ctx_1::pkt_1::v1": makeReading(),
      "signal-2::ctx_1::pkt_2::v1": makeReading({
        signalId: "signal-2",
        cacheKey: "signal-2::ctx_1::pkt_2::v1",
        sourcePacketHash: "pkt_2",
        reviewState: "pending",
        feedbackEvents: []
      })
    },
    [PRODUCT_CONTEXT_STORAGE_KEY]: productContext,
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: []
  });
  const item2 = makeItem("item-2", makeDescriptor({
    post_url: "https://www.threads.net/@builder/post/def",
    page_url: "https://www.threads.net/@builder/post/def"
  }));

  const packets = await buildSignalPacketIndex(storage, makeGlobalState([makeItem("item-1"), item2]), {
    sessionId: "session-1",
    verdicts: ["try"]
  });

  assert.deepEqual(packets.map((packet) => packet.source.signalId), ["signal-1"]);
  assert.equal(packets[0]?.productContext.hash, buildProductContextHash(productContext));
  assert.deepEqual(storage.getCalls.sort(), [
    PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY,
    PRODUCT_CONTEXT_STORAGE_KEY,
    PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,
    SIGNALS_STORAGE_KEY,
    SIGNAL_READINGS_STORAGE_KEY,
    TOPICS_STORAGE_KEY
  ].sort());
});

test("free reading trace prefers conclusion insights and avoids suggestion text as uncertainty", async () => {
  const storage = makeStorage({
    [SIGNALS_STORAGE_KEY]: [{
      id: "signal-1",
      sessionId: "session-1",
      itemId: "item-1",
      source: "threads",
      inboxStatus: "assigned",
      capturedAt: "2026-05-19T08:00:00.000Z"
    }],
    [TOPICS_STORAGE_KEY]: [],
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]: {
      "signal-1": makeAnalysis("signal-1")
    },
    [SIGNAL_READINGS_STORAGE_KEY]: {
      "signal-1::ctx_1::pkt_1::v1": makeReading({
        reading: [
          "第一句只是背景鋪陳，描述作者分享了一個工作流。",
          "第二句仍然是上下文，說明留言者有不同看法。",
          "真正的關鍵洞察是：專業用戶把雙重檢查視為可信工作流，而不是額外負擔。",
          "這對我們產品開發的啟示是：如果我們想讓 Agent 輸出更可靠，或許不需要追求單一模型，而應該在工作流中提供雙重檢查的選項。",
          "待確認的是這種流程是否會在非專業用戶身上形成高頻行為。"
        ].join("。")
      })
    },
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: []
  });

  const packet = await buildDLensSignalPacket(storage, makeGlobalState([makeItem("item-1")]), "signal-1");
  const readingTrace = packet?.decisionTrace.stages.find((stage) => stage.stage === "free_reading");

  assert.ok(readingTrace);
  assert.match(readingTrace.reasoningDetails.keyInsights[0] ?? "", /真正的關鍵洞察/);
  assert.doesNotMatch(readingTrace.reasoningDetails.keyInsights[0] ?? "", /背景鋪陳/);
  assert.deepEqual(readingTrace.reasoningDetails.uncertainties, [
    "待確認的是這種流程是否會在非專業用戶身上形成高頻行為"
  ]);
  assert.doesNotMatch(readingTrace.reasoningDetails.uncertainties.join("\n"), /或許不需要追求單一模型/);
});
