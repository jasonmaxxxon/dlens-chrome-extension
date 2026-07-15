import assert from "node:assert/strict";
import test from "node:test";

import type { EvidencePacket, TopicAuditEpisode, TopicAuditReport } from "../src/compare/topic-audit.ts";
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
  const auditEvidence = [
    buildAuditPacket(1, { signalId: "signal-ready", itemId: "item-ready" }),
    buildAuditPacket(2, { signalId: "signal-saved", itemId: "item-saved" })
  ];
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
    auditReport: {
      auditRunId: "audit-1",
      inputHash: "hash-1",
      sections: { overall: "現行 report", absence: "" }
    } as TopicAuditReport,
    auditEpisodes: [
      { id: "episode-1", auditRunId: "audit-1", inputHash: "hash-1", transition: "first" } as TopicAuditEpisode,
      { id: "episode-2", auditRunId: "audit-1", inputHash: "hash-1", transition: "advance" } as TopicAuditEpisode
    ],
    auditSummary: { reportStatus: "ready", analyzedCount: 9, queuedCount: 9, coverage: "9/18" },
    p1RunningSignalIds: ["signal-saved"]
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
  assert.equal(vm.audit.summary.coverage, "1/2");
  assert.equal(vm.audit.p1ReadyCount, 1);
  assert.equal(vm.audit.p1TotalCount, 2);
  assert.equal(vm.audit.sourceRows[0]?.readingStatus, "ready");
  assert.equal(vm.audit.sourceRows[1]?.readingStatus, "running");
  assert.deepEqual(vm.audit.themes, ["航班", "客服"]);
  assert.equal(vm.audit.lanes[0]?.label, "客服補救失速");
  assert.deepEqual(vm.audit.episodes.map((episode) => episode.id), ["episode-1", "episode-2"]);
  assert.equal(vm.audit.latestEpisode?.id, "episode-2");

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

test("Topic detail VM does not mix a published report episode with a different memo input", () => {
  const packet = buildAuditPacket(1);
  const memos = buildAuditMemos([packet]);
  const report = {
    auditRunId: "audit-older",
    inputHash: "hash-1",
    sections: { overall: "舊 report", absence: "舊 absence" }
  } as TopicAuditReport;
  const episode = { id: "episode-old", auditRunId: "audit-older", inputHash: "hash-1" } as TopicAuditEpisode;
  const vm = buildTopicDetailViewModel({
    topic,
    signals: [],
    pairs: [],
    auditEvidence: [packet],
    auditMemos: memos,
    auditReport: report,
    auditEpisodes: [episode]
  });

  assert.equal(vm.audit.hasAuditReport, false);
  assert.equal(vm.audit.latestEpisode, undefined);
  assert.doesNotMatch(vm.audit.headlineProse, /舊 report/);
});

test("Topic detail VM keeps an incompatible published report visible only when explicitly stale", () => {
  const packet = buildAuditPacket(1);
  const memos = buildAuditMemos([packet]);
  const report = {
    auditRunId: "audit-older",
    inputHash: "hash-1",
    sections: { overall: "舊 report", absence: "舊 absence", editorial: "舊 report" }
  } as TopicAuditReport;
  const episode = { id: "episode-old", auditRunId: "audit-older", inputHash: "hash-1" } as TopicAuditEpisode;
  const vm = buildTopicDetailViewModel({
    topic,
    signals: [],
    pairs: [],
    auditEvidence: [packet],
    auditMemos: memos,
    auditReport: report,
    auditEpisodes: [episode],
    auditSummary: { reportStatus: "stale", analyzedCount: 1, queuedCount: 0 }
  });

  assert.equal(vm.audit.hasAuditReport, true);
  assert.equal(vm.audit.latestEpisode?.id, "episode-old");
  assert.match(vm.audit.headlineProse, /舊 report/);
});

test("Topic detail VM exposes evidence-bound reaction patterns from display hints", () => {
  const auditEvidence = [
    buildAuditPacket(1, {
      commentCount: 342,
      replyFragments: [
        { ref: "S1.R1", author: "local-worker", text: "本地人已經好難搵工，仲要被壓價。", likes: 31, role: "audience" },
        { ref: "S1.R2", author: "policy-reader", text: "重點不是外勞，是制度沒有保障底線。", likes: 18, role: "audience" },
        { ref: "S1.R3", author: "employer", text: "有些工種真的請不到人，不能只說壓價。", likes: 9, role: "audience" }
      ]
    })
  ];
  const auditMemos = buildAuditMemos(auditEvidence);
  auditMemos.lensMemos.push({
    auditRunId: "audit-1",
    inputHash: "hash-1",
    topicId: "topic-1",
    stageName: "audience",
    prose: "legacy audience prose should not be the only UI contract.",
    evidenceRefs: ["S1.R1", "S1.R3"],
    caveats: [],
    displayHints: {
      reactionCoverage: {
        postCount: 1,
        capturedCommentCount: 342,
        readCommentCount: 342,
        usableAudienceCommentCount: 318
      },
      reactionPatterns: [{
        id: "reaction-local-labor-defense",
        label: "本地勞工身份防守",
        dynamicImplication: "留言把政策爭議推向身份與分配正義，而不是單純效率討論。",
        nComments: 118,
        nAuthors: 72,
        coverageDenominator: 342,
        supportRefs: ["S1.R1", "S1.R2"],
        counterRefs: ["S1.R3"],
        representativeRefs: ["S1.R1"],
        counterRepresentativeRefs: ["S1.R3"],
        icon: "users"
      }]
    } as never,
    promptVersion: "v1",
    model: "mock",
    generatedAt: "2026-05-23T00:00:00.000Z"
  });

  const vm = buildTopicDetailViewModel({
    topic,
    signals: [buildSignal("audit-signal-1", "audit-item-1")],
    pairs: [],
    auditEvidence,
    auditMemos,
    auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 }
  });
  const audit = vm.audit as typeof vm.audit & {
    reactionCoverage?: { readCommentCount: number; usableAudienceCommentCount: number };
    reactionPatterns?: Array<{ label: string; dynamicImplication: string; nComments: number; representativeRefs: string[]; counterRepresentativeRefs: string[] }>;
  };

  assert.equal(audit.reactionCoverage?.readCommentCount, 342);
  assert.equal(audit.reactionCoverage?.usableAudienceCommentCount, 318);
  assert.equal(audit.reactionPatterns?.[0]?.label, "本地勞工身份防守");
  assert.equal(audit.reactionPatterns?.[0]?.nComments, 118);
  assert.equal(audit.reactionPatterns?.[0]?.dynamicImplication, "留言把政策爭議推向身份與分配正義，而不是單純效率討論。");
  assert.deepEqual(audit.reactionPatterns?.[0]?.representativeRefs, ["S1.R1"]);
  assert.deepEqual(audit.reactionPatterns?.[0]?.counterRepresentativeRefs, ["S1.R3"]);
});

test("Topic detail VM derives narrative cross-post strength from evidence refs", () => {
  const auditEvidence = Array.from({ length: 6 }, (_, index) => buildAuditPacket(index + 1));
  const auditMemos = buildAuditMemos(auditEvidence);
  auditMemos.lensMemos[0] = {
    ...auditMemos.lensMemos[0]!,
    displayHints: {
      narrativeLanes: [
        { id: "lane-cross", label: "跨帖敘事", signalRefs: ["S1.OP", "S2.R1", "S5.OP"], consensus: 0.82 },
        { id: "lane-single", label: "單帖苗頭", signalRefs: ["S4.R1"], consensus: 0.74 }
      ]
    }
  } as never;

  const vm = buildTopicDetailViewModel({
    topic,
    signals: auditEvidence.map((packet) => buildSignal(packet.signalId, packet.itemId)),
    pairs: [],
    auditEvidence,
    auditMemos,
    auditSummary: { reportStatus: "ready", analyzedCount: 6, queuedCount: 0 }
  });

  const lanes = vm.audit.lanes as Array<{
    id: string;
    metricLabel?: string;
    crossPostCount?: number;
    postTotal?: number;
    isSinglePostObservation?: boolean;
  }>;
  assert.equal(lanes[0]?.crossPostCount, 3);
  assert.equal(lanes[0]?.postTotal, 6);
  assert.equal(lanes[0]?.metricLabel, "跨 3/6 篇");
  assert.equal(lanes[0]?.isSinglePostObservation, false);
  assert.equal(lanes[1]?.crossPostCount, 1);
  assert.equal(lanes[1]?.metricLabel, "單帖觀察 · 1/6 篇");
  assert.equal(lanes[1]?.isSinglePostObservation, true);
});

test("Topic detail VM exposes local evidence packets per crawled signal for pre-audit drill-in", () => {
  const vm = buildTopicDetailViewModel({
    topic,
    signals: [
      buildSignal("signal-ready", "item-ready"),
      buildSignal("signal-saved", "item-saved")
    ],
    pairs: [],
    sessionItems: [
      buildSessionItem("item-ready", "succeeded"),
      buildSessionItem("item-saved", "saved")
    ]
    // No auditEvidence / auditMemos: this is the state right after the first crawl,
    // before the topic audit runs.
  });

  // The audit has not run, yet the crawled signal already has a content-bearing
  // packet so the per-post drawer (OP 原文 + 留言) is reachable.
  assert.equal(vm.audit.evidence.length, 0);
  const readyPacket = vm.packetsBySignalId["signal-ready"];
  assert.ok(readyPacket, "crawled signal should have a locally-derived packet");
  assert.equal(readyPacket?.signalId, "signal-ready");
  assert.equal(readyPacket?.status, "succeeded");
  assert.equal(readyPacket?.opText, "signal text item-ready");
  // A not-yet-crawled signal is keyed but not "succeeded", so the drawer stays gated.
  assert.notEqual(vm.packetsBySignalId["signal-saved"]?.status, "succeeded");
});

test("Topic detail VM keeps an uncrawled topic source pending outside the completed audit evidence", () => {
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
    auditSummary: { reportStatus: "ready", analyzedCount: 15, queuedCount: 1, coverage: "15/16" }
  });

  assert.equal(vm.signalRows.length, 16);
  assert.equal(vm.audit.sourceRows.length, 15);
  assert.equal(vm.audit.sourceTotal, 16);
  assert.equal(vm.audit.summary.analyzedCount, 15);
  assert.equal(vm.audit.summary.queuedCount, 1);
  assert.equal(vm.audit.summary.coverage, "15/16");
  assert.equal(vm.audit.p1ReadyCount, 15);
  assert.equal(vm.audit.p1TotalCount, 15);
});

test("Topic detail VM excludes removed evidence from current inventory coverage", () => {
  const currentPacket = buildAuditPacket(1);
  const removedPacket = buildAuditPacket(2);
  const auditEvidence = [currentPacket, removedPacket];
  const auditMemos = buildAuditMemos(auditEvidence);
  const topicSignals = [
    buildSignal(currentPacket.signalId, currentPacket.itemId),
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
    auditSummary: { reportStatus: "stale", analyzedCount: 2, queuedCount: 0, coverage: "2/2" }
  });

  assert.equal(vm.audit.sourceTotal, 2);
  assert.equal(vm.audit.summary.analyzedCount, 1);
  assert.equal(vm.audit.summary.queuedCount, 1);
  assert.equal(vm.audit.summary.coverage, "1/2");
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
