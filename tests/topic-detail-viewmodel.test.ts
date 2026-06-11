import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket } from "../src/compare/topic-audit.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SavedAnalysisSnapshot, SessionItem, Signal, SignalTagsRecord, Topic } from "../src/state/types.ts";
import { buildTopicDetailViewModel } from "../src/viewmodel/topic-detail.ts";

const topic: Topic = {
  id: "topic-1",
  sessionId: "session-1",
  name: "航班爭議",
  description: "追蹤客服與航班調整的討論分流",
  status: "watching",
  tags: ["客服", "航班"],
  signalIds: ["signal-ready", "signal-saved"],
  pairIds: ["result-1"],
  createdAt: "2026-04-20T10:00:00.000Z",
  updatedAt: "2026-04-23T10:00:00.000Z"
};

function buildSessionItem(id: string, status: SessionItem["status"]): SessionItem {
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: `https://www.threads.net/@alpha/post/${id}`,
      post_url: `https://www.threads.net/@alpha/post/${id}`,
      author_hint: "alpha",
      text_snippet: `signal text ${id}`,
      time_token_hint: "1h",
      dom_anchor: id,
      engagement: { likes: 1, comments: 1, reposts: 0, forwards: 0, views: 10 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-04-23T08:00:00.000Z"
    },
    "2026-04-23T08:00:00.000Z"
  );
  item.id = id;
  item.status = status;
  if (status === "succeeded") {
    item.latestCapture = { analysis: { status: "succeeded" } } as SessionItem["latestCapture"];
  }
  return item;
}

function buildSignal(id: string, itemId: string): Signal {
  return {
    id,
    sessionId: "session-1",
    itemId,
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-1",
    suggestedTopicIds: [],
    capturedAt: "2026-04-23T08:00:00.000Z",
    triagedAt: "2026-04-23T09:00:00.000Z"
  };
}

function buildSavedAnalysis(overrides: Partial<SavedAnalysisSnapshot> = {}): SavedAnalysisSnapshot {
  return {
    resultId: "result-1",
    compareKey: "item-ready::item-other",
    itemAId: "item-ready",
    itemBId: "item-other",
    sourceLabelA: "@alpha",
    sourceLabelB: "@beta",
    headline: "旅客把相同事件讀成客服與制度雙線問題",
    deck: "同一事件在留言區長出兩條判讀主線。",
    primaryTensionSummary: "客服失靈 vs 流程失靈",
    groupSummary: "2 群組",
    totalComments: 42,
    dateRangeLabel: "4/22-4/23",
    savedAt: "2026-04-23T10:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v8",
    briefSource: "ai",
    judgmentResult: {
      relevance: 4,
      recommendedState: "watch",
      whyThisMatters: "客服補救被讀成制度責任。",
      actionCue: "追蹤補償話術。"
    },
    judgmentVersion: "v1",
    judgmentSource: "ai",
    ...overrides
  };
}

function buildAuditPacket(index: number, overrides: Partial<EvidencePacket> = {}): EvidencePacket {
  const signalId = `audit-signal-${index}`;
  const itemId = `audit-item-${index}`;
  const shortCode = `S${index}`;
  return {
    auditRunId: "audit-1",
    inputHash: "hash-1",
    topicId: "topic-1",
    signalId,
    itemId,
    shortCode,
    sourceUrl: `https://www.threads.net/@alpha/post/${itemId}`,
    capturedAt: "2026-05-23T00:00:00.000Z",
    status: "succeeded",
    opAuthor: "alpha",
    opText: `audit source ${index}`,
    opLikes: index,
    commentCount: index,
    replyFragments: [],
    aiArtifacts: { tags: ["航班"], gist: `audit gist ${index}` },
    gaps: [],
    notes: [],
    ...overrides
  };
}

function buildAuditMemos(packets: EvidencePacket[]): TopicAuditMemoBundle {
  return {
    auditRunId: "audit-1",
    inputHash: "hash-1",
    signalReadings: packets.map((packet) => ({
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      signalId: packet.signalId,
      shortCode: packet.shortCode,
      reading: `${packet.shortCode} 判讀`,
      evidenceRefs: [`${packet.shortCode}.OP`],
      watchNotes: [],
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    })),
    lensMemos: [{
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      stageName: "narrative",
      prose: "客服補救是一條主線。",
      evidenceRefs: ["S1.OP"],
      caveats: [],
      displayHints: {
        themeChips: ["航班", "客服"],
        narrativeLanes: [{ id: "lane-1", label: "客服補救失速", signalRefs: ["S1.OP"], consensus: 0.7 }]
      } as never,
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    }]
  };
}

test("Topic detail VM composes source rows, audit state, and command targets", () => {
  const signals = [
    buildSignal("signal-ready", "item-ready"),
    buildSignal("signal-saved", "item-saved")
  ];
  const auditEvidence = [buildAuditPacket(1), buildAuditPacket(2)];
  const auditMemos = buildAuditMemos([auditEvidence[0]!]);
  const signalTagsByItemId: Record<string, SignalTagsRecord> = {
    "item-ready": {
      itemId: "item-ready",
      status: "complete",
      signalTags: ["航班", "客服"],
      signalGist: "航班改動後的客服抱怨",
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    }
  };

  const vm = buildTopicDetailViewModel({
    topic,
    signals,
    pairs: [buildSavedAnalysis()],
    sessionMode: "product",
    sessionItems: [
      buildSessionItem("item-ready", "succeeded"),
      buildSessionItem("item-saved", "saved")
    ],
    savedAnalyses: [buildSavedAnalysis()],
    signalTagsByItemId,
    auditEvidence,
    auditMemos,
    auditSummary: { reportStatus: "ready", analyzedCount: 9, queuedCount: 9, coverage: "9/18" },
    p1RunningSignalIds: ["audit-signal-2"]
  });

  assert.equal(vm.topic.id, "topic-1");
  assert.equal(vm.sessionId, "session-1");
  assert.equal(vm.signals.length, 2);
  assert.equal(vm.signalRows[0]?.sourcePreview.displayText, "signal text item-ready");
  assert.equal(vm.signalRows[0]?.analysisState, "ready");
  assert.equal(vm.signalRows[0]?.resultId, "result-1");
  assert.deepEqual(vm.signalRows[0]?.tagRecord?.signalTags, ["航班", "客服"]);
  assert.equal(vm.signalRows[1]?.analysisState, "saved");
  assert.deepEqual(vm.unanalyzedItemIds, ["item-saved"]);
  assert.deepEqual(vm.analysisCounts, {
    total: 2,
    ready: 1,
    saved: 1,
    queued: 0,
    crawling: 0,
    analyzing: 0,
    failed: 0,
    missing: 0,
    processing: 0
  });

  assert.equal(vm.audit.summary.reportStatus, "ready");
  assert.equal(vm.audit.sourceTotal, 2);
  assert.equal(vm.audit.summary.analyzedCount, 1);
  assert.equal(vm.audit.summary.queuedCount, 1);
  assert.equal(vm.audit.summary.coverage, "2/2");
  assert.equal(vm.audit.p1ReadyCount, 1);
  assert.equal(vm.audit.p1TotalCount, 2);
  assert.equal(vm.audit.sourceRows[0]?.readingStatus, "ready");
  assert.equal(vm.audit.sourceRows[1]?.readingStatus, "running");
  assert.deepEqual(vm.audit.themes, ["航班", "客服"]);
  assert.equal(vm.audit.lanes[0]?.label, "客服補救失速");

  const bulkAction = vm.actions.find((action) => action.kind === "analyzeItems");
  assert.deepEqual(bulkAction, {
    kind: "analyzeItems",
    target: { sessionId: "session-1", topicId: "topic-1", itemIds: ["item-saved"] }
  });
  for (const row of vm.signalRows) {
    for (const action of row.actions) {
      assert.equal(action.target.sessionId, "session-1");
      assert.equal(action.target.topicId, "topic-1");
      assert.equal(action.target.signalId, row.signalId);
    }
  }
});

test("Topic detail VM keeps audit denominator on evidence when saved signals drift", () => {
  const auditEvidence = Array.from({ length: 15 }, (_, index) => buildAuditPacket(index + 1));
  const auditMemos = buildAuditMemos(auditEvidence);
  const topicSignals = [
    ...auditEvidence.map((packet) => buildSignal(packet.signalId, packet.itemId)),
    buildSignal("saved-signal", "saved-item")
  ];

  const vm = buildTopicDetailViewModel({
    topic: { ...topic, signalIds: topicSignals.map((signal) => signal.id) },
    signals: topicSignals,
    pairs: [],
    sessionMode: "topic",
    sessionItems: [buildSessionItem("saved-item", "saved")],
    auditEvidence,
    auditMemos,
    auditSummary: { reportStatus: "ready", analyzedCount: 15, queuedCount: 1, coverage: "15/15" }
  });

  assert.equal(vm.signalRows.length, 16);
  assert.equal(vm.audit.sourceRows.length, 15);
  assert.equal(vm.audit.sourceTotal, 15);
  assert.equal(vm.audit.summary.analyzedCount, 15);
  assert.equal(vm.audit.summary.queuedCount, 0);
  assert.equal(vm.audit.summary.coverage, "15/15");
  assert.equal(vm.audit.p1ReadyCount, 15);
  assert.equal(vm.audit.p1TotalCount, 15);
});

test("Topic detail VM blocks audit commands when no source is readable", () => {
  const vm = buildTopicDetailViewModel({
    topic,
    signals: [buildSignal("signal-missing", "missing-item")],
    pairs: [],
    sessionMode: "topic",
    sessionItems: [],
    auditEvidence: []
  });

  assert.equal(vm.audit.canRunAudit, false);
  assert.match(vm.audit.blockedReason ?? "", /至少 1 篇/);
  assert.equal(vm.actions.some((action) => action.kind === "runAudit"), false);
});
