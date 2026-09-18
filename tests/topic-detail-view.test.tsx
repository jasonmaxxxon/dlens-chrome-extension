import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TOPIC_SYNTHESIS_VERSION } from "../src/compare/topic-synthesis.ts";
import {
  NARRATIVE_LANE_ICONS,
  type NarrativeLaneIcon
} from "../src/compare/topic-audit-prompts.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import type { EvidencePacket, TopicAuditEpisode, TopicAuditReport } from "../src/compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../src/compare/topic-audit-validator.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";
import type { SavedAnalysisSnapshot, SessionItem, Signal, SignalTagsRecord, Topic, TopicSignalReading, TopicSynthesis } from "../src/state/types.ts";
import { TopicDetailView, topicDetailViewTestables } from "../src/ui/TopicDetailView.tsx";
import { TopicSourceSessionCard } from "../src/ui/TopicSourceSessionCard.tsx";
import { SignalDrawer } from "../src/ui/SignalDrawer.tsx";
import { tokens } from "../src/ui/tokens.ts";
import { pickPrimaryJudgmentPair } from "../src/ui/useTopicState.ts";
import {
  buildTopicDetailViewModel,
  type BuildTopicDetailViewModelInput,
  type TopicDetailCommand
} from "../src/viewmodel/topic-detail.ts";

const topic: Topic = {
  id: "topic-1",
  sessionId: "session-1",
  name: "航班爭議",
  description: "追蹤客服與航班調整的討論分流",
  status: "watching",
  tags: ["客服", "航班"],
  signalIds: ["signal-1"],
  pairIds: ["result-1"],
  createdAt: "2026-04-20T10:00:00.000Z",
  updatedAt: "2026-04-23T10:00:00.000Z"
};

const signals: Signal[] = [
  {
    id: "signal-1",
    sessionId: "session-1",
    itemId: "item-1",
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-1",
    suggestedTopicIds: [],
    capturedAt: "2026-04-23T08:00:00.000Z",
    triagedAt: "2026-04-23T09:00:00.000Z"
  }
];

const pairs: SavedAnalysisSnapshot[] = [
  {
    resultId: "result-1",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    sourceLabelA: "@alpha",
    sourceLabelB: "@beta",
    headline: "旅客把相同事件讀成客服與制度雙線問題",
    deck: "同一事件在留言區長出兩條判讀主線。",
    primaryTensionSummary: "客服失靈 vs 流程失靈",
    groupSummary: "2 群組",
    totalComments: 42,
    dateRangeLabel: "4/22–4/23",
    savedAt: "2026-04-23T10:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v7",
    briefSource: "ai"
  }
];

const synthesis: TopicSynthesis = {
  observations: [
    { text: "旅客把流程缺口讀成制度責任。", evidenceSignalIds: ["signal-1"] },
    { text: "客服回覆被視為延遲補救而不是即時處理。", evidenceSignalIds: ["signal-1"] }
  ],
  commonClusters: [
    { keyword: "航班改動焦慮", signalCount: 3, exampleSignalIds: ["signal-1"] },
    { keyword: "客服補救失速", signalCount: 2, exampleSignalIds: ["signal-1"] }
  ],
  verbalTechniques: ["用個案放大制度感", "把等待時間轉成信任成本"],
  memes: [
    { phrase: "等通知", occurrences: 4 },
    { phrase: "改到崩潰", occurrences: 2 }
  ],
  sentimentNarrative: "討論主線集中在航班改動後的等待感，以及客服回覆是否足夠承擔責任。",
  outliers: [
    { signalId: "signal-1", reason: "有一條材料更接近價格抱怨，暫時不進主線。" }
  ],
  generatedFromCount: 5,
  totalSignalCount: 6,
  generatedAt: "2026-04-23T10:30:00.000Z",
  generator: "deterministic",
  generatorVersion: TOPIC_SYNTHESIS_VERSION
};

const topicWithSynthesis: Topic = {
  ...topic,
  synthesis
};

const signalTagsByItemId: Record<string, SignalTagsRecord> = {
  "item-1": {
    itemId: "item-1",
    status: "complete",
    signalTags: ["求職", "外勞", "本地勞工"],
    signalGist: "這篇是在討論外勞招聘與本地求職者被壓價的衝突。",
    promptVersion: "v1",
    model: "google:test-model",
    generatedAt: "2026-05-21T00:00:00.000Z"
  }
};

const auditPacket: EvidencePacket = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  signalId: "signal-1",
  itemId: "item-1",
  shortCode: "S1",
  sourceUrl: "https://www.threads.net/@alpha/post/item-1",
  capturedAt: "2026-05-23T00:00:00.000Z",
  status: "succeeded",
  opAuthor: "alpha",
  opText: "航班改動後等不到客服",
  opLikes: 12,
  commentCount: 5,
  replyFragments: [{ ref: "S1.R1", author: "reader", text: "我也遇到", likes: 2, role: "audience" }],
  aiArtifacts: { tags: ["航班", "客服"], gist: "航班改動後的客服抱怨" },
  gaps: [],
  notes: []
};

const completedAuditReport: TopicAuditReport = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  topicName: "航班爭議",
  generatedFrom: ["signal-1"],
  coveragePerSection: {},
  sections: {
    overall: "整體判讀",
    lexicon: "詞彙",
    scaleOrTime: "尺度",
    narratives: "敘事",
    audience: "群眾反應",
    absence: "缺席",
    editorial: "總結"
  },
  limitations: [],
  promptVersion: "v1",
  model: "mock",
  generatedAt: "2026-05-23T00:00:00.000Z"
};

function buildAuditEpisode(transition: TopicAuditEpisode["transition"]): TopicAuditEpisode {
  const fingerprints = { evidence: "e-1", definition: "d-1", pipeline: "p-1" };
  const evidence = [{ anchorId: "a_1234567890abcdef", displayRef: "S1.R1", stability: "stable" as const }];
  const claims = transition === "rebase"
    ? []
    : [{
        id: "claim-1",
        statement: "讀者開始用個人反例收窄市場論",
        rationale: "本次新增可追蹤證據",
        trajectory: "new" as const,
        evidence
      }];
  return {
    version: "topic-audit-episode.v1",
    id: `episode-${transition}`,
    topicId: "topic-1",
    auditRunId: "audit-1",
    inputHash: "hash-1",
    generatedAt: "2026-07-11T10:00:00.000Z",
    transition,
    fingerprints,
    sourceCount: 6,
    capturedRange: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-11T00:00:00.000Z" },
    stateSnapshot: {
      version: "topic-narrative-state.v1",
      topicId: "topic-1",
      auditRunId: "audit-1",
      fingerprints,
      nextIds: { claim: 2, voice: 1, question: 1 },
      claims,
      voices: [],
      openQuestions: [],
      updatedAt: "2026-07-11T10:00:00.000Z"
    },
    delta: transition === "rebase"
      ? []
      : claims.map((claim) => ({
          claimId: claim.id,
          trajectory: claim.trajectory,
          statement: claim.statement,
          rationale: claim.rationale,
          evidence: claim.evidence
        })),
    reactionSnapshot: { patterns: [] }
  };
}

const auditMemos: TopicAuditMemoBundle = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  signalReadings: [{
    auditRunId: "audit-1",
    inputHash: "hash-1",
    topicId: "topic-1",
    signalId: "signal-1",
    shortCode: "S1",
    reading: "這篇聚焦客服補救。",
    evidenceRefs: ["S1.OP"],
    watchNotes: [],
    promptVersion: "v1",
    model: "mock",
    generatedAt: "2026-05-23T00:00:00.000Z"
  }],
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

const reactionAuditPacket: EvidencePacket = {
  ...auditPacket,
  commentCount: 342,
  replyFragments: [
    { ref: "S1.R1", author: "local-worker", text: "本地人已經好難搵工，仲要被壓價。", likes: 31, role: "audience" },
    { ref: "S1.R2", author: "policy-reader", text: "重點不是外勞，是制度沒有保障底線。", likes: 18, role: "audience" },
    { ref: "S1.R3", author: "employer", text: "有些工種真的請不到人，不能只說壓價。", likes: 9, role: "audience" }
  ]
};

const reactionAuditMemos: TopicAuditMemoBundle = {
  ...auditMemos,
  lensMemos: [
    ...auditMemos.lensMemos,
    {
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      stageName: "audience",
      prose: "legacy audience prose should be replaced by structured reaction patterns.",
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
          valence: 0.55,
          mode: 0.45,
          icon: "users"
        }]
      } as never,
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]
};

const signalAtlasEvidence: EvidencePacket[] = [
  reactionAuditPacket,
  ...Array.from({ length: 5 }, (_, index) => ({
    ...auditPacket,
    signalId: `signal-${index + 2}`,
    itemId: `item-${index + 2}`,
    shortCode: `S${index + 2}`,
    opAuthor: `author-${index + 2}`,
    opText: `來源貼文 ${index + 2}`,
    opLikes: 10 + index,
    commentCount: 12 + index,
    replyFragments: [{
      ref: `S${index + 2}.R1`,
      author: `reader-${index + 2}`,
      text: `這是第 ${index + 2} 篇的 raw audience comment，L0 不應直接顯示。`,
      likes: index + 1,
      role: "audience" as const
    }]
  }))
];

const signalAtlasMemos: TopicAuditMemoBundle = {
  ...reactionAuditMemos,
  signalReadings: signalAtlasEvidence.map((packet) => ({
    ...auditMemos.signalReadings[0]!,
    signalId: packet.signalId,
    shortCode: packet.shortCode,
    evidenceRefs: [`${packet.shortCode}.OP`]
  })),
  lensMemos: [
    {
      ...auditMemos.lensMemos[0]!,
      displayHints: {
        themeChips: ["航班", "客服"],
        narrativeLanes: [
          {
            id: "lane-cross",
            label: "跨帖服務焦慮",
            signalRefs: ["S1.R1", "S2.R1"],
            consensus: 0.81,
            beats: { setup: "工作焦慮浮現", tension: "制度底線受質疑", outcome: "責任回到保障設計" },
            trajectory: "carried"
          },
          { id: "lane-single", label: "單帖價格疑慮", signalRefs: ["S4.R1"], consensus: 0.73 }
        ]
      } as never
    },
    {
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      stageName: "audience",
      prose: "legacy audience prose should be replaced by structured reaction patterns.",
      evidenceRefs: ["S1.R1", "S1.R3"],
      caveats: [],
      displayHints: {
        reactionCoverage: {
          postCount: 6,
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
          valence: 0.55,
          mode: 0.45,
          icon: "users"
        }]
      } as never,
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    },
    {
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      stageName: "absence",
      prose: "觀望者聲音偏少，可靠性要標成行動派樣本。",
      evidenceRefs: ["S1.R2"],
      caveats: ["342/318 的 captured/read 母數存在口徑差。"],
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    },
    {
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      stageName: "final",
      prose: "民情主調是把政策爭議讀成身份與分配問題 [S1.R1] [S1.R2]。真正分歧在制度是否仍有保障底線 [S1.R3]。",
      evidenceRefs: ["S1.R1", "S1.R2", "S1.R3"],
      caveats: [],
      promptVersion: "v1",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]
};

function buildSessionItem(id = "item-1", status: SessionItem["status"] = "saved"): SessionItem {
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
  return item;
}

function buildReadySessionItem(id = "item-1"): SessionItem {
  const item = buildSessionItem(id, "succeeded");
  item.latestCapture = {
    analysis: {
      id: `analysis-${id}`,
      capture_id: `capture-${id}`,
      status: "succeeded",
      stage: "final",
      analysis_version: "v1",
      source_comment_count: 5,
      clusters: [],
      evidence: [],
      metrics: {},
      generated_at: "2026-05-01T00:00:00.000Z",
      last_error: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z"
    }
  } as SessionItem["latestCapture"];
  return item;
}

type LegacyTopicDetailViewProps = BuildTopicDetailViewModelInput & {
  signalPreviewById?: Record<string, string>;
  onBack?: () => void;
  onOpenPair?: (resultId: string) => void;
  onUpdateTopic?: (patch: Partial<Topic>) => void;
  onQueueItemById?: (itemId: string) => void;
  onAnalyzeItems?: (itemIds: string[]) => Promise<{ ok: boolean; failedCount: number }>;
  onStartProcessing?: () => void;
  onOpenAnalysis?: (resultId: string) => void;
  onAddToCompare?: (itemId: string) => void;
  onSaveJudgmentOverride?: (resultId: string, patch: { relevance: 1 | 2 | 3 | 4 | 5; recommendedState: "park" | "watch" | "act" }) => void;
  onGenerateSynthesis?: (topicId: string) => Promise<{ ok: boolean; error?: string }>;
  onGenerateSignalReading?: (signalId: string, topicId: string) => Promise<{ ok: boolean; error?: string }>;
  onSignalDeleted?: (signalId: string) => Promise<void>;
  onRunAudit?: (
    topicId: string,
    fromStage?: TopicDetailCommand extends { fromStage?: infer Stage } ? Stage : never,
    force?: boolean
  ) => void;
  onRunAuditP1?: (topicId: string, signalId: string) => void;
  onOpenAuditReport?: (topicId: string, stale?: boolean) => void;
};

function topicDetailViewElement({
  onBack,
  onOpenPair,
  onUpdateTopic,
  onQueueItemById,
  onAnalyzeItems,
  onStartProcessing,
  onOpenAnalysis,
  onAddToCompare,
  onSaveJudgmentOverride,
  onGenerateSynthesis,
  onGenerateSignalReading,
  onSignalDeleted,
  onRunAudit,
  onRunAuditP1,
  onOpenAuditReport,
  signalPreviewById,
  ...input
}: LegacyTopicDetailViewProps) {
  const sessionItems = input.sessionItems?.map((item) => {
    const signal = input.signals.find((entry) => entry.itemId === item.id);
    const preview = signal ? signalPreviewById?.[signal.id] : undefined;
    return preview
      ? { ...item, descriptor: { ...item.descriptor, text_snippet: preview } }
      : item;
  });
  const viewModel = buildTopicDetailViewModel({
    ...input,
    ...(sessionItems ? { sessionItems } : {}),
    capabilities: {
      analyzeItems: Boolean(onAnalyzeItems),
      queueItem: Boolean(onQueueItemById),
      startProcessing: Boolean(onStartProcessing),
      openAnalysis: Boolean(onOpenAnalysis),
      addToCompare: Boolean(onAddToCompare),
      saveJudgmentOverride: Boolean(onSaveJudgmentOverride),
      generateSynthesis: Boolean(onGenerateSynthesis),
      generateSignalReading: Boolean(onGenerateSignalReading),
      deleteSignal: Boolean(onSignalDeleted),
      runAudit: Boolean(onRunAudit),
      runAuditP1: Boolean(onRunAuditP1),
      openAuditReport: Boolean(onOpenAuditReport)
    }
  });
  const onCommand = (command: TopicDetailCommand): Promise<unknown> | unknown => {
    switch (command.kind) {
      case "back":
        return onBack?.();
      case "openPair":
        return onOpenPair?.(command.target.resultId);
      case "updateTopic":
        return onUpdateTopic?.(command.patch);
      case "analyzeItems":
        return onAnalyzeItems?.(command.target.itemIds);
      case "analyzeItem":
        return onAnalyzeItems?.([command.target.itemId]);
      case "queueItem":
      case "queueSignalItem":
        return onQueueItemById?.(command.target.itemId);
      case "startProcessing":
        return onStartProcessing?.();
      case "openAnalysis":
        return onOpenAnalysis?.(command.target.resultId);
      case "openSignalAnalysis":
        return onOpenAnalysis?.(command.target.resultId);
      case "addToCompare":
        return onAddToCompare?.(command.target.itemId);
      case "addSignalToCompare":
        return onAddToCompare?.(command.target.itemId);
      case "saveJudgmentOverride":
        return onSaveJudgmentOverride?.(command.target.resultId, command.patch);
      case "generateSynthesis":
        return onGenerateSynthesis?.(command.target.topicId);
      case "generateSignalReading":
        return onGenerateSignalReading?.(command.target.signalId, command.target.topicId);
      case "deleteSignal":
        return onSignalDeleted?.(command.target.signalId);
      case "runAudit":
        return onRunAudit?.(command.target.topicId, command.fromStage as never, command.force);
      case "runAuditP1":
        return onRunAuditP1?.(command.target.topicId, command.target.signalId);
      case "openAuditReport":
        return onOpenAuditReport?.(command.target.topicId, command.stale);
      default:
        return undefined;
    }
  };
  return React.createElement(TopicDetailView, { viewModel, onCommand });
}

test("TopicDetailView places one source-session owner between the breadcrumb and Atlas", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildSessionItem("item-1", "saved")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 })
    })
  );

  const breadcrumbIndex = html.indexOf("← 主題");
  const sessionIndex = html.indexOf('data-topic-source-session="needs_crawl"');
  const atlasIndex = html.indexOf('data-signal-atlas-canvas="true"');
  assert.ok(sessionIndex > breadcrumbIndex, "the session card follows the breadcrumb row");
  assert.ok(sessionIndex < atlasIndex, "the session card leads the previous Atlas");
});

test("TopicDetailView keeps the processing session and source inventory after all crawl items queue", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildSessionItem("item-1", "queued")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 })
    })
  );

  assert.match(html, /data-topic-source-session="processing"/);
  assert.match(html, /議題 0\/1 已完成/);
  assert.match(html, /data-topic-source-list="true"/);
  assert.ok(
    html.indexOf('data-topic-source-list="true"') > html.indexOf('data-signal-atlas-canvas="true"'),
    "the inspect/delete inventory remains below the Atlas"
  );
  assert.doesNotMatch(html, /data-topic-bulk-analyze="processing"/);
  assert.doesNotMatch(html, /data-topic-source-crawl="action"/);
});

test("TopicDetailView legacy branch keeps one source-session owner while crawl or processing is pending", () => {
  const renderLegacy = (item: SessionItem) => renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [item],
      signalPreviewById: { "signal-1": "保留的來源列" },
      workerStatus: "idle",
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onStartProcessing: () => undefined
    })
  );

  const needsCrawl = renderLegacy(buildSessionItem("item-1", "saved"));
  const processing = renderLegacy(buildSessionItem("item-1", "queued"));

  for (const [html, state] of [[needsCrawl, "needs_crawl"], [processing, "processing"]] as const) {
    assert.match(html, new RegExp(`data-topic-source-session="${state}"`));
    assert.doesNotMatch(html, /data-topic-bulk-analyze="(?:action|processing)"/);
    assert.match(html, /保留的來源列/);
  }
  assert.equal((needsCrawl.match(/開始爬取 1 篇/g) ?? []).length, 1);
  assert.equal((processing.match(/啟動處理/g) ?? []).length, 1);
  assert.doesNotMatch(processing, /worker 目前未在跑|重啟處理/);
});

test("TopicDetailView product stale state leaves regeneration solely to the source-session card", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildReadySessionItem("item-1")],
      auditSummary: { reportStatus: "stale", analyzedCount: 1, queuedCount: 0, staleDelta: { added: 1, removed: 0 } },
      onRunAudit: () => undefined,
      onOpenAuditReport: () => undefined
    })
  );

  assert.match(html, /data-topic-source-session="ready_to_generate"/);
  assert.equal((html.match(/data-topic-source-session=/g) ?? []).length, 1);
  assert.equal((html.match(/用 1 篇重新生成 Atlas/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.doesNotMatch(html, /先看舊版/);
});

test("TopicDetailView product failed state leaves retry and failure copy solely to the source-session card", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildReadySessionItem("item-1")],
      auditSummary: { reportStatus: "failed", analyzedCount: 1, queuedCount: 0, failedStage: 4, failedReason: "provider_error" },
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "failed", stage: "audience", failureKind: "provider_error",
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      },
      onRunAudit: () => undefined,
      onOpenAuditReport: () => undefined
    })
  );

  assert.match(html, /data-topic-source-session="generation_failed"/);
  assert.equal((html.match(/data-topic-source-session=/g) ?? []).length, 1);
  assert.equal((html.match(/重試生成/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.doesNotMatch(html, /從 P4 續跑|查看錯誤詳情|失敗於 P4|provider_error/);
});

test("TopicDetailView lets a running paid generation outrank a newly saved source", () => {
  const sessionSignals = Array.from({ length: 8 }, (_, index) => ({
    ...signals[0]!,
    id: `signal-${index + 1}`,
    itemId: `item-${index + 1}`
  }));
  const sessionItems = sessionSignals.map((signal, index) => index === 7 ? buildSessionItem(signal.itemId, "saved") : buildReadySessionItem(signal.itemId));
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: sessionSignals.map((signal) => signal.id) },
      signals: sessionSignals,
      pairs: [],
      sessionItems,
      auditRunStatus: {
        sessionId: "session-1",
        topicId: "topic-1",
        requestId: "run-1",
        state: "running",
        stage: "narrative",
        startedAt: "2026-07-17T09:00:00.000Z",
        updatedAt: "2026-07-17T09:01:00.000Z",
        expiresAt: "2026-07-17T09:16:00.000Z"
      },
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onRunAudit: () => undefined
    })
  );

  assert.match(html, /data-topic-source-session="generating"/);
  assert.match(html, /議題 7\/8 已完成/);
  assert.doesNotMatch(html, /data-topic-source-crawl="action"/);
  assert.doesNotMatch(html, /開始爬取 1 篇/);
  assert.doesNotMatch(html, /data-topic-audit-action="regenerate"/);
});

test("TopicDetailView keeps a prior typed generation failure secondary while source crawl is pending", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildSessionItem("item-1", "saved")],
      auditRunStatus: {
        sessionId: "session-1",
        topicId: "topic-1",
        requestId: "run-1",
        state: "failed",
        stage: "narrative",
        failureKind: "schema_mismatch",
        startedAt: "2026-07-17T09:00:00.000Z",
        updatedAt: "2026-07-17T09:01:00.000Z",
        expiresAt: "2026-07-17T09:16:00.000Z"
      },
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onRunAudit: () => undefined
    })
  );

  assert.match(html, /data-topic-source-session="needs_crawl"/);
  assert.match(html, /開始爬取 1 篇/);
  assert.match(html, /模型回傳格式不完整，已重試一次。/);
  assert.match(html, /敘事/);
  assert.doesNotMatch(html, /data-topic-audit-action="regenerate"/);
});

test("TopicDetailView keeps one manual ready-to-generate action and dispatches it only on click", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event
  });
  const calls: Array<{ topicId: string; force?: boolean }> = [];
  const rootElement = dom.window.document.getElementById("root")!;
  const root = createRoot(rootElement);

  try {
    flushSync(() => root.render(topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildReadySessionItem("item-1")],
      auditSummary: { reportStatus: "stale", analyzedCount: 1, queuedCount: 0, coverage: "1/1" },
      onRunAudit: (topicId, _fromStage, force) => calls.push({ topicId, force })
    })));
    const button = Array.from(rootElement.querySelectorAll("button")).find((candidate) => candidate.textContent === "用 1 篇重新生成 Atlas");
    assert.ok(button, "the session card owns the explicit paid-generation action");
    assert.deepEqual(calls, [], "rendering ready_to_generate must not dispatch a paid run");
    assert.equal(rootElement.querySelector('[data-topic-audit-action="regenerate"]'), null, "the Atlas toolbar yields this stale action to the session card");
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.deepEqual(calls, [{ topicId: "topic-1", force: true }]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicSourceSessionCard exposes determinate and indeterminate progress semantics", () => {
  const determinate = renderToStaticMarkup(
    <TopicSourceSessionCard
      state={{ kind: "needs_crawl", scope: "topic", total: 4, ready: 1, pending: 3, failed: 0 }}
      disabled={false}
      hasAuditReport={false}
      onAnalyze={() => undefined}
    />
  );
  const indeterminate = renderToStaticMarkup(
    <TopicSourceSessionCard
      state={{ kind: "generating", scope: "topic", total: 4, ready: 4 }}
      disabled={false}
      hasAuditReport={false}
    />
  );

  assert.match(determinate, /role="progressbar"[^>]*aria-label="來源處理進度"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="25"/);
  assert.match(indeterminate, /role="progressbar"[^>]*aria-label="來源處理進度"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"/);
  assert.doesNotMatch(indeterminate, /aria-valuenow=/);
});

test("TopicSourceSessionCard stays token-only and keeps status text separate from controls", () => {
  const componentPath = "src/ui/TopicSourceSessionCard.tsx";
  assert.ok(existsSync(componentPath), "the source-session card is a focused component");
  const source = readFileSync(componentPath, "utf8");
  assert.match(source, /import\s+\{[^}]*\btokens\b[^}]*\}\s+from/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-atomic="true"/);
});

test("TopicSourceSessionCard first-run provider and interruption failures never claim a previous Atlas", () => {
  for (const failureKind of ["provider_error", "interrupted"] as const) {
    const html = renderToStaticMarkup(
      <TopicSourceSessionCard
        state={{ kind: "generation_failed", scope: "topic", total: 1, ready: 1, stage: "final", failureKind }}
        disabled={false}
        hasAuditReport={false}
        onRunAudit={() => undefined}
      />
    );

    assert.match(html, /生成服務暫時無法完成|上次生成已中斷/);
    assert.doesNotMatch(html, /舊版 Atlas 仍保留/);
  }
});

test("TopicDetailView mirrors the audit popup surface in topic mode without legacy detail blocks", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs,
      sessionItems: [buildSessionItem("item-1", "saved")],
      signalTagsByItemId,
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /← 主題/);
  assert.match(html, /航班爭議/);
  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.match(html, /data-signal-atlas-canvas="true"/);
  assert.match(html, /data-signal-atlas-empty-state="true"/);
  assert.match(html, /data-signal-atlas-empty-state="true"[^>]*data-dlens-presence="card"/);
  assert.doesNotMatch(html, /data-signal-atlas-empty-state="true"[^>]*data-dlens-presence-motion=/);
  assert.match(html, /data-topic-source-session="needs_crawl"/);
  assert.match(html, /data-topic-audit-block="sources"/);
  assert.match(html, /data-topic-detail-surface="sources"[^>]*data-dlens-presence="card"/);
  assert.doesNotMatch(html, /data-topic-detail-surface="sources"[^>]*data-dlens-presence-motion=/);
  assert.match(html, /data-topic-source-row="signal-1"/);
  assert.match(html, /signal text item-1/);
  assert.doesNotMatch(html, /data-topic-signal-inventory="true"/);
  assert.doesNotMatch(html, /已採集貼文/);
  assert.match(html, /民情形狀、跨帖敘事與來源會在此展開/);
  assert.doesNotMatch(html, /Topic detail/);
  assert.doesNotMatch(html, /補充描述/);
  assert.doesNotMatch(html, /研究問題/);
  assert.doesNotMatch(html, /標籤雲/);
  assert.doesNotMatch(html, /AI 語意標籤/);
  assert.doesNotMatch(html, /全部訊號篇目/);
  assert.doesNotMatch(html, /關鍵詞統計/);
  assert.match(html, /P1 判讀 0\/1/);
  // Tab switcher is gone
  assert.doesNotMatch(html, /討論訊號/);
});

test("TopicDetailView exposes a remove action inside topic source rows", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "topic",
      sessionItems: [buildSessionItem("item-1", "saved")],
      signalPreviewById: { "signal-1": "待處理貼文" },
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onSignalDeleted: async () => undefined
    })
  );

  assert.match(html, /data-topic-audit-block="sources"/);
  assert.match(html, /開始爬取 1 篇/);
  assert.match(html, /待處理貼文/);
  assert.match(html, /data-topic-signal-remove="true"/);
  assert.match(html, /aria-label="移除此訊號"/);
  assert.match(html, />刪除</);
});

test("TopicDetailView exposes a remove action inside product signal rows", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      onSignalDeleted: async () => undefined
    })
  );

  assert.match(html, /data-topic-signal-remove="true"/);
  assert.match(html, /aria-label="移除此訊號"/);
});

test("TopicDetailView renders ready audit actions without the duplicate overview header", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildReadySessionItem("item-1")],
      auditEvidence: [auditPacket],
      auditMemos,
      auditReport: completedAuditReport,
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.match(html, /data-topic-audit-actions="ready"/);
  assert.match(html, /審查報告 ↗/);
  assert.match(html, /重新生成/);
  assert.match(html, /data-topic-audit-action="regenerate"[^>]*><svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html, /data-attention-beam=/);
  assert.doesNotMatch(html, /報告 已生成/);
  assert.doesNotMatch(html, /覆蓋 /);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /data-signal-atlas-hero="true"/);
  assert.match(html, /data-signal-atlas-hero="true"[^>]*data-dlens-presence="card"/);
  assert.doesNotMatch(html, /data-signal-atlas-hero="true"[^>]*data-dlens-presence-motion=/);
  assert.doesNotMatch(html, /data-topic-source-session=/);
  assert.doesNotMatch(html, /data-topic-audit-live=/);
  assert.match(html, /data-topic-audit-block="lanes"/);
  assert.match(html, /客服補救失速/);
  assert.match(html, /data-narrative-lane-metric="lane-1"/);
  assert.match(html, /單帖觀察/);
  assert.doesNotMatch(html, /共識\s*\d+%/);
  assert.doesNotMatch(html, /data-topic-audit-block="themes"/);
  assert.doesNotMatch(html, /data-topic-newsroom-ladder="true"/);
  assert.doesNotMatch(html, /我也遇到/);
  assert.match(html, /data-topic-audit-block="sources"/);
  assert.match(html, /data-topic-audit-source-list-style="audit-report"[^>]*data-dlens-presence="card"/);
  assert.doesNotMatch(html, /data-topic-audit-source-list-style="audit-report"[^>]*data-dlens-presence-motion=/);
  assert.match(html, /data-topic-audit-block="reliability"[^>]*data-dlens-presence="card"/);
  assert.doesNotMatch(html, /data-topic-audit-block="reliability"[^>]*data-dlens-presence-motion=/);
  assert.doesNotMatch(html, /data-narrative-lane="[^"]+"[^>]*data-dlens-presence=/);
});

test("TopicDetailView keeps the current Atlas visible while regeneration runs", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals: signalAtlasEvidence.map((packet) => ({
        ...signals[0]!,
        id: packet.signalId,
        itemId: packet.itemId,
        capturedAt: packet.capturedAt
      })),
      pairs: [],
      auditEvidence: signalAtlasEvidence,
      auditMemos: signalAtlasMemos,
      auditSummary: { reportStatus: "running", analyzedCount: 6, queuedCount: 0, runningStage: 2 },
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "running", stage: "narrative",
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-signal-atlas-canvas="true"/);
  assert.match(html, /data-signal-atlas-hero="true"/);
  assert.match(html, /data-topic-source-session="generating"/);
  assert.match(html, /正在重新生成 Atlas/);
  assert.match(html, /data-topic-audit-actions="running"/);
  assert.doesNotMatch(html, /data-topic-audit-action="regenerate"/);
  assert.doesNotMatch(html, /目前顯示上一版/);
  assert.match(html, /data-atlas-ledger-metric="已讀 342 · 可用 318"/);
  assert.doesNotMatch(html, /data-signal-atlas-empty-state/);
  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.doesNotMatch(html, /data-topic-detail-surface="overview"/);
  assert.doesNotMatch(html, /生成中 · P\d+\/6/);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
});

test("TopicDetailView uses the same Atlas glass frame for the first audit run", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: [],
      auditMemos: null,
      auditSummary: { reportStatus: "running", analyzedCount: 1, queuedCount: 0, runningStage: 2 },
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "running", stage: "narrative",
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-signal-atlas-canvas="true"/);
  assert.doesNotMatch(html, /data-signal-atlas-canvas="true" aria-busy=/);
  assert.match(html, /data-signal-atlas-content="true" aria-busy="true"/);
  assert.match(html, /data-signal-atlas-empty-state="true"/);
  assert.match(html, /data-topic-source-session="generating"/);
  assert.match(html, /正在重新生成 Atlas/);
  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.doesNotMatch(html, /data-topic-audit-placeholder="empty"/);
  assert.doesNotMatch(html, /data-signal-atlas-hero/);
  assert.doesNotMatch(html, /生成中 · P\d+\/6/);
});

test("TopicDetailView retains the previous Atlas for stale and failed states", () => {
  const atlasSignals = signalAtlasEvidence.map((packet) => ({
    ...signals[0]!,
    id: packet.signalId,
    itemId: packet.itemId,
    capturedAt: packet.capturedAt
  }));
  const failedRerunEvidence = signalAtlasEvidence.map((packet) => ({ ...packet, auditRunId: "audit-2" }));
  const failedRerunMemos: TopicAuditMemoBundle = {
    ...signalAtlasMemos,
    auditRunId: "audit-2",
    signalReadings: signalAtlasMemos.signalReadings.map((reading) => ({ ...reading, auditRunId: "audit-2" })),
    lensMemos: signalAtlasMemos.lensMemos.map((memo) => ({ ...memo, auditRunId: "audit-2" }))
  };
  const staleHtml = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals: atlasSignals,
      pairs: [],
      sessionItems: atlasSignals.map((signal) => buildReadySessionItem(signal.itemId)),
      auditEvidence: signalAtlasEvidence,
      auditMemos: signalAtlasMemos,
      auditSummary: { reportStatus: "stale", analyzedCount: 6, queuedCount: 0, staleDelta: { added: 1, removed: 0 } },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );
  const failedHtml = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals: atlasSignals,
      pairs: [],
      sessionItems: atlasSignals.map((signal) => buildReadySessionItem(signal.itemId)),
      auditEvidence: failedRerunEvidence,
      auditMemos: failedRerunMemos,
      auditReport: completedAuditReport,
      auditSummary: { reportStatus: "failed", analyzedCount: 6, queuedCount: 0, failedStage: 4, failedReason: "provider timeout" },
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "failed", stage: "audience", failureKind: "timeout",
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(staleHtml, /data-topic-source-session="ready_to_generate"/);
  assert.match(staleHtml, /用 6 篇重新生成 Atlas/);
  assert.doesNotMatch(staleHtml, /目前顯示上一版/);
  assert.match(staleHtml, /data-signal-atlas-hero="true"/);
  assert.match(staleHtml, /data-atlas-ledger-metric="已讀 342 · 可用 318"/);
  assert.doesNotMatch(staleHtml, /data-signal-atlas-empty-state/);
  assert.doesNotMatch(staleHtml, /data-topic-audit-block="overview"/);

  assert.match(failedHtml, /data-topic-source-session="generation_failed"/);
  assert.match(failedHtml, /生成逾時，舊版 Atlas 仍保留。/);
  assert.match(failedHtml, /重試生成/);
  assert.match(failedHtml, /data-signal-atlas-hero="true"/);
  assert.match(failedHtml, /data-atlas-ledger-metric="已讀 342 · 可用 318"/);
  assert.doesNotMatch(failedHtml, /data-signal-atlas-empty-state/);
  assert.doesNotMatch(failedHtml, /data-topic-audit-block="overview"/);
  assert.doesNotMatch(failedHtml, /從 P\d|失敗於 P\d/);
});

test("TopicDetailView keeps regenerate focus and dispatches one forced rerun while status changes", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  const calls: Array<{ topicId: string; fromStage?: unknown; force?: boolean }> = [];

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const atlasSignals = signalAtlasEvidence.map((packet) => ({
    ...signals[0]!,
    id: packet.signalId,
    itemId: packet.itemId,
    capturedAt: packet.capturedAt
  }));
  const renderStatus = (reportStatus: "ready" | "running") => topicDetailViewElement({
    topic,
    signals: atlasSignals,
    pairs: [],
    sessionItems: atlasSignals.map((signal) => buildReadySessionItem(signal.itemId)),
    auditEvidence: signalAtlasEvidence,
    auditMemos: signalAtlasMemos,
    auditSummary: { reportStatus, analyzedCount: 6, queuedCount: 0, ...(reportStatus === "running" ? { runningStage: 2 } : {}) },
    ...(reportStatus === "running" ? {
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "running" as const, stage: "narrative" as const,
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      }
    } : {}),
    auditValidatorFlags: [],
    onBack: () => undefined,
    onOpenPair: () => undefined,
    onUpdateTopic: () => undefined,
    onRunAudit: (topicId, fromStage, force) => calls.push({ topicId, ...(fromStage ? { fromStage } : {}), ...(typeof force === "boolean" ? { force } : {}) })
  });

  try {
    await act(async () => {
      root.render(renderStatus("ready"));
    });
    const regenerate = rootElement.querySelector<HTMLButtonElement>('[data-topic-audit-action="regenerate"]');
    assert.ok(regenerate);
    regenerate.focus();
    await act(async () => {
      regenerate.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(calls, [{ topicId: "topic-1", force: true }]);

    await act(async () => {
      root.render(renderStatus("running"));
    });
    const runningRegenerate = rootElement.querySelector<HTMLButtonElement>('[data-topic-audit-action="regenerate"]');
    assert.equal(runningRegenerate, null, "the generating session card owns the in-flight state");
    assert.match(rootElement.textContent ?? "", /正在重新生成 Atlas/);
    assert.equal(calls.length, 1, "the in-flight action must not queue a second run");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});

test("TopicDetailView forces a clean rerun after failure instead of pretending to resume a stale stage", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  const calls: Array<{ topicId: string; fromStage?: unknown; force?: boolean }> = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    flushSync(() => root.render(topicDetailViewElement({
      topic,
      signals: signalAtlasEvidence.map((packet) => ({ ...signals[0]!, id: packet.signalId, itemId: packet.itemId, capturedAt: packet.capturedAt })),
      pairs: [],
      sessionItems: signalAtlasEvidence.map((packet) => buildReadySessionItem(packet.itemId)),
      auditEvidence: signalAtlasEvidence,
      auditMemos: signalAtlasMemos,
      auditSummary: { reportStatus: "failed", analyzedCount: 6, queuedCount: 0, failedStage: 4, failedReason: "provider timeout" },
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "failed", stage: "audience", failureKind: "timeout",
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      onRunAudit: (topicId, fromStage, force) => calls.push({ topicId, ...(fromStage ? { fromStage } : {}), ...(typeof force === "boolean" ? { force } : {}) })
    })));
    const regenerate = Array.from(rootElement.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "重試生成");
    assert.ok(regenerate);
    regenerate.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.deepEqual(calls, [{ topicId: "topic-1", force: true }]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView can restart when a partial first run left evidence without an Atlas", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  const calls: Array<{ topicId: string; fromStage?: unknown; force?: boolean }> = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const renderStatus = (reportStatus: "none" | "running" | "failed") => topicDetailViewElement({
    topic,
    signals,
    pairs: [],
    sessionItems: [buildReadySessionItem("item-1")],
    auditEvidence: [auditPacket],
    auditMemos: null,
    auditReport: null,
    auditSummary: {
      reportStatus,
      analyzedCount: 0,
      queuedCount: 0,
      ...(reportStatus === "running" ? { runningStage: 1 } : {}),
      ...(reportStatus === "failed" ? { failedStage: 1, failedReason: "provider timeout" } : {})
    },
    ...(reportStatus === "running" ? {
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "running" as const, stage: "narrative" as const,
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      }
    } : reportStatus === "failed" ? {
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "failed" as const, stage: "narrative" as const, failureKind: "timeout" as const,
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      }
    } : {}),
    auditValidatorFlags: [],
    onBack: () => undefined,
    onOpenPair: () => undefined,
    onUpdateTopic: () => undefined,
    onRunAudit: (topicId, fromStage, force) => calls.push({ topicId, ...(fromStage ? { fromStage } : {}), ...(typeof force === "boolean" ? { force } : {}) })
  });

  try {
    flushSync(() => root.render(renderStatus("none")));
    const regenerate = Array.from(rootElement.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "用 1 篇重新生成 Atlas");
    assert.ok(regenerate, "partial evidence must never strand the Topic without a recovery action");
    regenerate.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.deepEqual(calls, [{ topicId: "topic-1", force: true }]);
    for (const reportStatus of ["running", "failed"] as const) {
      flushSync(() => root.render(renderStatus(reportStatus)));
      assert.equal(
        Array.from(rootElement.querySelectorAll("button")).some((button) => button.textContent?.includes("審查報告 ↗")),
        false,
        `${reportStatus} partial recovery must not expose a report that does not exist`
      );
      if (reportStatus === "failed") {
        assert.doesNotMatch(rootElement.textContent ?? "", /舊版 Atlas 仍保留/);
      }
    }
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView keeps first-run focus while an empty Atlas starts generating", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  const calls: Array<{ topicId: string; force?: boolean }> = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const readyItem = buildReadySessionItem("item-1");
  const renderStatus = (reportStatus: "none" | "running") => topicDetailViewElement({
    topic,
    signals,
    pairs: [],
    sessionItems: [readyItem],
    auditEvidence: [],
    auditMemos: null,
    auditSummary: { reportStatus, analyzedCount: reportStatus === "running" ? 1 : 0, queuedCount: 0, ...(reportStatus === "running" ? { runningStage: 1 } : {}) },
    ...(reportStatus === "running" ? {
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "running" as const, stage: "narrative" as const,
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      }
    } : {}),
    auditValidatorFlags: [],
    onBack: () => undefined,
    onOpenPair: () => undefined,
    onUpdateTopic: () => undefined,
    onRunAudit: (topicId, _fromStage, force) => calls.push({ topicId, ...(typeof force === "boolean" ? { force } : {}) })
  });

  try {
    await act(async () => {
      root.render(renderStatus("none"));
    });
    const generate = Array.from(rootElement.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "用 1 篇重新生成 Atlas");
    assert.ok(generate);
    await act(async () => {
      generate.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(calls, [{ topicId: "topic-1", force: true }]);

    await act(async () => {
      root.render(renderStatus("running"));
    });
    assert.equal(rootElement.querySelector('[data-topic-audit-action="generate"]'), null);
    assert.match(rootElement.textContent ?? "", /正在重新生成 Atlas/);
    assert.equal(calls.length, 1);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});

test("TopicDetailView renders the Signal Atlas L0 spine with only one exact representative audience quote", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals: signalAtlasEvidence.map((packet) => ({
        ...signals[0]!,
        id: packet.signalId,
        itemId: packet.itemId,
        capturedAt: packet.capturedAt
      })),
      pairs: [],
      auditEvidence: signalAtlasEvidence,
      auditMemos: signalAtlasMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 6, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  const heroIndex = html.indexOf("data-signal-atlas-hero=\"true\"");
  const laneIndex = html.indexOf("data-atlas-narrative-pager=\"true\"");
  const mapIndex = html.indexOf("data-atlas-assignment-distribution=\"true\"");
  const warnIndex = html.indexOf("data-topic-audit-block=\"reliability\"");
  const sourceIndex = html.indexOf("data-topic-audit-block=\"sources\"");
  assert.ok(heroIndex >= 0, "hero should render");
  assert.ok(heroIndex < laneIndex, "narrative stage should follow the hero verdict");
  assert.ok(laneIndex < mapIndex, "narrative stage should precede the compass panel");
  assert.match(html, /<\/section><section data-topic-audit-block="lanes"[^>]*data-atlas-narrative-pager="true"/);
  assert.ok(mapIndex < sourceIndex, "compass panel should precede the posts rail");
  assert.ok(sourceIndex < warnIndex, "posts rail should precede the reliability strip");
  assert.match(html, /data-atlas-assignment-distribution="true"[^>]*data-dlens-presence="card"/);
  assert.doesNotMatch(html, /data-signal-atlas-map="true"|dlens-atlas-legend-row/);
  assert.match(html, /data-atlas-assignment-row="reaction-local-labor-defense"[^>]*class="dlens-atlas-distribution-row"/);
  assert.doesNotMatch(html, /data-atlas-assignment-row="[^"]+"[^>]*class="[^"]*dlens-tactile-row/);
  // the old reaction card wall stays removed: the distribution is the only pattern list at L0
  assert.doesNotMatch(html, /data-topic-audit-block="reaction-patterns"/);

  assert.match(html, /342/);
  assert.match(html, /data-atlas-ledger-metric="已讀 342 · 可用 318"/);
  assert.match(html, /1 個形狀 · 118 次留言歸屬 · 可用 318 則/);
  assert.match(html, /6 篇貼文 · 擷取 342 · 可用 318 則/);
  assert.match(html, /data-atlas-ledger-metric="1 個形狀 · 6 篇來源"/);
  assert.match(html, /data-atlas-ledger-metric="1 條跨帖敘事 · 6 篇來源"/);
  assert.match(html, /118 次歸屬/);
  assert.match(html, /此篇 2 次證據引用歸屬，按形狀分佈/);
  assert.doesNotMatch(html, /data-atlas-ledger-metric="342\/318|118\/342|已歸類留言|反應構成/);
  assert.match(html, /反例 1/);
  assert.match(html, /<svg[^>]+role="group"[^>]+aria-label="民情羅盤/);
  assert.match(html, /data-signal-atlas-dot="reaction-local-labor-defense"[^>]+role="button"[^>]+aria-label="本地勞工身份防守，118 次留言歸屬。留言把政策爭議推向身份與分配正義，而不是單純效率討論。按 Enter 或空白鍵開啟詳情"/);
  assert.match(html, />質疑</);
  assert.match(html, />支持</);
  assert.doesNotMatch(html, /質疑・悲觀|支持・正面/);
  assert.match(html, /data-evidence-ref-chip="S1.R1"/);
  assert.match(html, /跨 2\/6 篇/);
  assert.match(html, /data-narrative-participation-fill="lane-cross"[^>]*width:33\.33333333333333%/);
  assert.doesNotMatch(html, /data-narrative-strength-cell/);
  assert.match(html, /單帖觀察/);
  assert.match(html, /data-narrative-representative-ref="S1\.R1"/);
  assert.equal((html.match(/data-narrative-representative-ref=/g) ?? []).length, 1);
  assert.match(html, /本地人已經好難搵工/);
  assert.doesNotMatch(html, /共識\s*\d+%/);
  assert.doesNotMatch(html, new RegExp("重" + "複用字"));
  assert.doesNotMatch(html, /有些工種真的請不到人/);
  assert.doesNotMatch(html, /raw audience comment/);
  assert.doesNotMatch(html, /data-topic-episode-strip=/);
});

test("TopicDetailView places the episode delta strip between the Atlas ledger and verdict", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals: signalAtlasEvidence.map((packet) => ({
        ...signals[0]!,
        id: packet.signalId,
        itemId: packet.itemId,
        capturedAt: packet.capturedAt
      })),
      pairs: [],
      auditEvidence: signalAtlasEvidence,
      auditMemos: signalAtlasMemos,
      auditReport: completedAuditReport,
      auditEpisodes: [buildAuditEpisode("advance")],
      auditSummary: { reportStatus: "ready", analyzedCount: 6, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  const ledgerIndex = html.indexOf("data-signal-atlas-ledger=\"true\"");
  const episodeIndex = html.indexOf("data-topic-episode-strip=\"advance\"");
  const lanesIndex = html.indexOf("data-topic-audit-block=\"lanes\"");
  assert.ok(ledgerIndex >= 0 && ledgerIndex < episodeIndex);
  assert.ok(episodeIndex < lanesIndex);
  assert.match(html, />本次</);
  assert.match(html, />自上次</);
  assert.match(html, /新出現 1/);
  assert.match(html, /data-topic-episode-delta-details="true"/);
  assert.match(html, /讀者開始用個人反例收窄市場論/);
  assert.match(html, /data-evidence-ref-chip="S1.R1"/);
  assert.match(html, /data-narrative-representative-ref="S1\.R1"/);
  assert.match(html, /本地人已經好難搵工/);
});

test("TopicDetailView labels first and rebase episodes without inventing ordinary delta", () => {
  const renderEpisode = (transition: TopicAuditEpisode["transition"]) => renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: [auditPacket],
      auditMemos,
      auditReport: completedAuditReport,
      auditEpisodes: [buildAuditEpisode(transition)],
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  const first = renderEpisode("first");
  assert.match(first, /data-topic-episode-strip="first"/);
  assert.match(first, /首次基線/);

  const rebase = renderEpisode("rebase");
  assert.match(rebase, /data-topic-episode-strip="rebase"/);
  assert.match(rebase, /基準已重設/);
  assert.doesNotMatch(rebase, /新出現 1/);
});

test("TopicDetailView frames single-post narrative lanes as compact L0 observations with source attribution", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: [auditPacket],
      auditMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-audit-spine="signal-atlas-l0"/);
  assert.match(html, /data-topic-audit-block="lanes"/);
  assert.doesNotMatch(html, /data-topic-newsroom-signal="true"/);
  // Single observations keep the source ref compact; representative quotes belong to cross-post pages.
  assert.match(html, /@alpha/);
  assert.match(html, /data-atlas-single-observation="lane-1"/);
  assert.doesNotMatch(html, /data-narrative-representative-ref=/);
  assert.doesNotMatch(html, /航班改動後等不到客服/);
});

test("TopicDetailView keeps single-observation evidence behind its chip or the drawer", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: [auditPacket],
      auditMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-evidence-ref-chip="S1.OP"/);
  assert.doesNotMatch(html, /data-narrative-representative-ref=/);
  assert.match(html, /data-audit-detail-drawer/);
  assert.doesNotMatch(html, /data-topic-newsroom-ladder="true"/);
  assert.doesNotMatch(html, /代表 quote/);
  assert.doesNotMatch(html, /航班改動後等不到客服/);
});

test("TopicDetailView keeps one source footer for drill-in rows", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: [auditPacket],
      auditMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-audit-block="sources"/);
  assert.match(html, /data-topic-audit-source-list-style="audit-report"/);
  assert.match(html, /<details[^>]*data-atlas-source-disclosure="true"/);
  assert.doesNotMatch(html, /<details[^>]*data-atlas-source-disclosure="true"[^>]*open/);
  assert.match(html, /data-topic-source-list="true"/);
  assert.match(html, /貼文 · 點入單帖/);
  assert.match(html, /data-source-row="S1"/);
  assert.doesNotMatch(html, /data-topic-newsroom-ladder="true"/);
});

test("TopicDetailView keeps pre-Atlas source work visibly open", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildSessionItem("item-1", "saved")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 })
    })
  );

  assert.match(html, /<details[^>]*data-atlas-source-disclosure="true"[^>]*open/);
  assert.match(html, /收合 ▴/);
});

test("TopicDetailView keeps an evidence-only P1 source disclosure open before Atlas presentation exists", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildReadySessionItem("item-1")],
      auditEvidence: [auditPacket],
      auditMemos: null,
      auditReport: null,
      auditSummary: { reportStatus: "none", analyzedCount: 0, queuedCount: 0 },
      auditValidatorFlags: []
    })
  );

  assert.match(html, /data-signal-atlas-empty-state="true"/);
  assert.match(html, /<details[^>]*data-atlas-source-disclosure="true"[^>]*open/);
  assert.match(html, /data-source-row="S1"/);
});

test("TopicDetailView lets ready Atlas readers expand sources and keep source callbacks working", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  const rootElement = dom.window.document.getElementById("root")!;
  const root = createRoot(rootElement);
  const comparedItemIds: string[] = [];

  try {
    flushSync(() => {
      root.render(topicDetailViewElement({
        topic,
        signals,
        pairs: [],
        sessionItems: [buildReadySessionItem("item-1")],
        signalTagsByItemId,
        auditEvidence: [auditPacket],
        auditMemos,
        auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
        auditValidatorFlags: [],
        onAddToCompare: (itemId) => comparedItemIds.push(itemId)
      }));
    });

    const disclosure = rootElement.querySelector<HTMLDetailsElement>("details[data-atlas-source-disclosure]");
    const summary = disclosure?.querySelector("summary");
    assert.ok(disclosure);
    assert.ok(summary);
    assert.equal(disclosure.open, false);
    assert.match(summary.textContent ?? "", /展開 ▾/);

    flushSync(() => {
      summary!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(disclosure.open, true);
    assert.match(summary!.textContent ?? "", /收合 ▴/);

    const compare = rootElement.querySelector<HTMLButtonElement>("[data-source-row-compare=\"S1\"]");
    assert.ok(compare, "opening the disclosure must retain the existing SourceRow compare callback");
    flushSync(() => {
      compare!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(comparedItemIds, ["item-1"]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView resets an opened ready Atlas source disclosure when the ready topic changes", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  const rootElement = dom.window.document.getElementById("root")!;
  const root = createRoot(rootElement);
  const topicB: Topic = {
    ...topic,
    id: "topic-2",
    name: "住宿爭議",
    signalIds: ["signal-2"],
    pairIds: []
  };
  const signalB: Signal = {
    ...signals[0]!,
    id: "signal-2",
    itemId: "item-2",
    topicId: topicB.id
  };
  const auditPacketB: EvidencePacket = {
    ...auditPacket,
    topicId: topicB.id,
    signalId: signalB.id,
    itemId: signalB.itemId
  };
  const auditMemosB: TopicAuditMemoBundle = {
    ...auditMemos,
    signalReadings: auditMemos.signalReadings.map((reading) => ({
      ...reading,
      topicId: topicB.id,
      signalId: signalB.id
    })),
    lensMemos: auditMemos.lensMemos.map((memo) => ({ ...memo, topicId: topicB.id }))
  };
  const renderReadyTopic = (
    nextTopic: Topic,
    nextSignals: Signal[],
    nextItemId: string,
    nextEvidence: EvidencePacket[],
    nextMemos: TopicAuditMemoBundle
  ) => topicDetailViewElement({
    topic: nextTopic,
    signals: nextSignals,
    pairs: [],
    sessionItems: [buildReadySessionItem(nextItemId)],
    auditEvidence: nextEvidence,
    auditMemos: nextMemos,
    auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
    auditValidatorFlags: []
  });

  try {
    flushSync(() => {
      root.render(renderReadyTopic(topic, signals, "item-1", [auditPacket], auditMemos));
    });
    const topicADisclosure = rootElement.querySelector<HTMLDetailsElement>("details[data-atlas-source-disclosure]");
    const topicASummary = topicADisclosure?.querySelector("summary");
    assert.ok(topicADisclosure);
    assert.ok(topicASummary);
    assert.equal(topicADisclosure.open, false);

    flushSync(() => {
      topicASummary.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(topicADisclosure.open, true);

    flushSync(() => {
      root.render(renderReadyTopic(topicB, [signalB], "item-2", [auditPacketB], auditMemosB));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const topicBDisclosure = rootElement.querySelector<HTMLDetailsElement>("details[data-atlas-source-disclosure]");
    assert.ok(topicBDisclosure);
    assert.equal(topicBDisclosure.open, false);
    assert.match(topicBDisclosure.querySelector("summary")?.textContent ?? "", /展開 ▾/);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView folds the source manifest into the atlas post list", () => {
  const pendingSignal: Signal = {
    ...signals[0]!,
    id: "signal-2",
    itemId: "item-2",
    capturedAt: "2026-04-23T09:00:00.000Z"
  };
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: ["signal-1", "signal-2"] },
      signals: [...signals, pendingSignal],
      pairs: [],
      sessionItems: [buildReadySessionItem("item-1"), buildSessionItem("item-2", "saved")],
      signalTagsByItemId,
      auditEvidence: [auditPacket],
      auditMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 1 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onAddToCompare: () => undefined,
      onSignalDeleted: () => undefined
    })
  );

  // one merged surface — the legacy 源清單 section is gone
  assert.doesNotMatch(html, /源清單/);
  assert.equal((html.match(/data-topic-audit-block="sources"/g) ?? []).length, 1);
  // packet row carries the signal gist as its brief title plus the manifest actions
  assert.match(html, /data-source-row="S1"/);
  assert.match(html, /data-source-row-title="true"/);
  assert.match(html, /這篇是在討論外勞招聘與本地求職者被壓價的衝突。/);
  assert.match(html, /data-source-row-original="S1"/);
  assert.match(html, /data-source-row-compare="S1"/);
  assert.match(html, /data-topic-signal-remove="true"/);
  // the uncrawled signal joins the same list as a pending row with its crawl action
  assert.match(html, /data-topic-source-row="signal-2"/);
  assert.match(html, /data-pending-signal-crawl="signal-2"/);
});

test("TopicDetailView surfaces P5 absence and caveats in the reliability strip", () => {
  const weakFlag: TopicAuditValidationFlag = {
    severity: "WEAK",
    kind: "thin-evidence",
    section: "§2",
    claim: "客服補救是主線",
    reason: "僅一篇來源支撐",
    evidenceRefs: ["S1.OP"]
  };
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: signalAtlasEvidence,
      auditMemos: signalAtlasMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 6, queuedCount: 0 },
      auditValidatorFlags: [weakFlag],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-audit-block="reliability"/);
  // variant B splits the section into two labeled zones instead of one combined title
  assert.match(html, /data-reliability-zone="absence"/);
  assert.match(html, /缺席的聲音/);
  assert.match(html, /data-reliability-zone="caveats"/);
  assert.match(html, /可靠性限制/);
  assert.match(html, /觀望者聲音偏少，可靠性要標成行動派樣本。/);
  assert.match(html, /342\/318 的 captured\/read 母數存在口徑差。/);
  assert.doesNotMatch(html, /data-topic-newsroom-uncertainty="true"/);
});

test("SignalDrawer drill-in keeps the OP original text above the P1 judgment", () => {
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet: auditPacket,
      reading: auditMemos.signalReadings[0]!,
      topicName: topic.name,
      onClose: () => undefined
    })
  );

  assert.match(html, /@alpha/);
  const opIndex = html.indexOf("data-signal-drawer-block=\"op-card\"");
  const p1Index = html.indexOf("data-signal-drawer-block=\"p1\"");
  assert.ok(opIndex >= 0, "original post card should render");
  assert.ok(p1Index >= 0, "P1 judgment block should render");
  assert.ok(opIndex < p1Index, "original text must come before the AI judgment");
});

test("SignalDrawer presents the original post as the highest-weight serif SourceHero (Frame 07)", () => {
  const html = renderToStaticMarkup(
    React.createElement(SignalDrawer, {
      packet: auditPacket,
      reading: auditMemos.signalReadings[0]!,
      topicName: topic.name,
      onClose: () => undefined
    })
  );

  // Original post is marked + rendered as the source hero, above the AI reading.
  assert.match(html, /data-signal-drawer-source-kicker="true"/);
  assert.match(html, /原文 · 最高權重/);
  // The original quote is the prominent serif hero (16px), not 13.5px sans.
  assert.match(html, /font-size:16px;line-height:1.6;color:#1b1a17;white-space:pre-wrap/);
  const kickerIndex = html.indexOf("data-signal-drawer-source-kicker");
  const p1Index = html.indexOf("data-signal-drawer-block=\"p1\"");
  assert.ok(kickerIndex >= 0 && kickerIndex < p1Index, "source hero leads the AI reading");
});

test("TopicDetailView uses shared primitives and topic accent rhythm for audit mode surfaces", () => {
  const auditEvidence = Array.from({ length: 4 }, (_, index) => ({
    ...auditPacket,
    signalId: `audit-signal-${index + 1}`,
    itemId: `audit-item-${index + 1}`,
    shortCode: `S${index + 1}`,
    opText: `audit source ${index + 1}`
  }));
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildReadySessionItem("item-1")],
      auditEvidence,
      auditMemos,
      auditReport: completedAuditReport,
      auditSummary: { reportStatus: "ready", analyzedCount: 4, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-audit-actions="ready"/);
  assert.doesNotMatch(html, /data-topic-detail-surface="overview"/);
  assert.match(html, /data-signal-atlas-hero="true"/);
  assert.match(html, /data-topic-audit-block="lanes"/);
  assert.match(html, /data-topic-audit-block="sources"/);
  assert.match(html, /data-signal-atlas-ledger="true"/);
  assert.match(html, /審查報告 ↗/);
  assert.match(html, /重新生成/);
  assert.match(html, /data-topic-audit-source-list-style="audit-report"/);
  assert.doesNotMatch(html, /min-width:1320/);
});

test("TopicDetailView audit report CTA keeps command wiring after the surface reset", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  const calls: Array<{ topicId: string; stale?: boolean }> = [];

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    flushSync(() => {
      root.render(
        topicDetailViewElement({
          topic,
          signals,
          pairs: [],
          auditEvidence: [auditPacket],
          auditMemos,
          auditReport: completedAuditReport,
          auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
          auditValidatorFlags: [],
          onBack: () => undefined,
          onOpenPair: () => undefined,
          onUpdateTopic: () => undefined,
          onOpenAuditReport: (topicId, stale) => calls.push({ topicId, ...(typeof stale === "boolean" ? { stale } : {}) })
        })
      );
    });

    const cta = Array.from(rootElement.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("審查報告 ↗"));
    assert.ok(cta);
    cta.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

    assert.deepEqual(calls, [{ topicId: "topic-1" }]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView routes reaction, narrative, atlas dot, and source row into one detail drawer", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);
  const originalGetBoundingClientRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  let drawerProbeCount = 0;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.hasAttribute("data-audit-detail-drawer")) {
      drawerProbeCount += 1;
      const top = this.style.top === "0px" ? 82 : this.style.bottom === "0px" ? 800 : 154;
      const height = this.style.top === "0px" || this.style.bottom === "0px" ? 0 : 600;
      return {
        x: 0,
        y: top,
        top,
        right: 390,
        bottom: top + height,
        left: 0,
        width: 390,
        height,
        toJSON: () => ({})
      } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };

  try {
    flushSync(() => {
      root.render(
        topicDetailViewElement({
          topic,
          signals: signalAtlasEvidence.map((packet) => ({
            ...signals[0]!,
            id: packet.signalId,
            itemId: packet.itemId,
            capturedAt: packet.capturedAt
          })),
          pairs: [],
          sessionMode: "topic",
          auditEvidence: signalAtlasEvidence,
          auditMemos: signalAtlasMemos,
          auditSummary: { reportStatus: "ready", analyzedCount: 6, queuedCount: 0 },
          auditValidatorFlags: [],
          onBack: () => undefined,
          onOpenPair: () => undefined,
          onUpdateTopic: () => undefined
        })
      );
    });

    const drawers = rootElement.querySelectorAll("[data-audit-detail-drawer]");
    assert.equal(drawers.length, 1, "the audit page owns exactly one right-side drawer container");
    const drawer = drawers[0]!;
    assert.equal(drawer.getAttribute("data-open"), "false");
    assert.equal(drawer.style.position, "fixed");
    assert.equal(drawer.style.maxWidth, "calc(100% - 36px)");
    assert.equal(rootElement.querySelector<HTMLElement>("[data-audit-detail-scrim]")!.style.position, "fixed");
    assert.equal(rootElement.querySelector("[data-narrative-lane-detail]"), null);
    assert.equal(rootElement.querySelector("[data-reaction-pattern-detail]"), null);
    assert.equal(rootElement.querySelector("[data-signal-drawer]"), null);

    const patternButton = rootElement.querySelector<HTMLButtonElement>("button[data-atlas-assignment-row=\"reaction-local-labor-defense\"]");
    assert.ok(patternButton, "reaction pattern should be clickable");
    flushSync(() => {
      patternButton!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(drawer.getAttribute("data-open"), "true");
    assert.equal(drawer.getAttribute("data-detail-kind"), "reaction");
    assert.equal(drawer.getAttribute("data-detail-id"), "reaction-local-labor-defense");
    assert.equal(patternButton!.getAttribute("data-active"), "true");
    assert.equal(rootElement.querySelector('[data-signal-atlas-dot="reaction-local-labor-defense"]')?.getAttribute("data-active"), "true");
    assert.match(drawer.textContent ?? "", /本地勞工身份防守/);
    assert.match(drawer.textContent ?? "", /代表留言/);
    const probesAfterOpen = drawerProbeCount;
    const drawerTopBeforeHostScroll = drawer.style.top;
    flushSync(() => {
      dom.window.dispatchEvent(new dom.window.Event("scroll"));
    });
    assert.equal(drawerProbeCount, probesAfterOpen + 2, "host scroll must re-read the fixed shell bounds");
    assert.equal(drawer.style.top, drawerTopBeforeHostScroll, "a fixed popup must not drift when Threads scrolls");

    const laneButton = rootElement.querySelector<HTMLButtonElement>("button[data-narrative-lane=\"lane-cross\"]");
    assert.ok(laneButton, "narrative lane button should render");
    flushSync(() => {
      laneButton!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(drawer.getAttribute("data-detail-kind"), "narrative");
    assert.equal(drawer.getAttribute("data-detail-id"), "lane-cross");
    assert.equal(laneButton!.getAttribute("data-active"), "true");
    assert.match(drawer.textContent ?? "", /跨帖服務焦慮/);
    assert.match(drawer.textContent ?? "", /跨 2\/6 篇/);

    const atlasDot = rootElement.querySelector<SVGGElement>("[data-signal-atlas-dot=\"reaction-local-labor-defense\"]");
    assert.ok(atlasDot, "atlas dot should target a real reaction pattern");
    flushSync(() => {
      atlasDot!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(drawer.getAttribute("data-detail-kind"), "reaction");

    const sourceRow = rootElement.querySelector<HTMLElement>("[data-source-row=\"S1\"]");
    const sourceOpen = rootElement.querySelector<HTMLButtonElement>("[data-source-row-open=\"S1\"]");
    assert.ok(sourceRow, "source row should remain the active identity container");
    assert.ok(sourceOpen, "source detail should have one dedicated trigger");
    assert.equal(sourceRow.getAttribute("role"), null);
    assert.equal(sourceRow.classList.contains("dlens-tactile-row"), false);
    flushSync(() => {
      sourceOpen!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(drawer.getAttribute("data-detail-kind"), "source");
    assert.equal(drawer.getAttribute("data-detail-id"), "signal-1");
    assert.equal(sourceRow!.getAttribute("data-active"), "true");
    assert.match(drawer.textContent ?? "", /來源 S1/);
    assert.match(drawer.textContent ?? "", /留言串/);

    flushSync(() => {
      rootElement.querySelector<HTMLElement>("[data-audit-detail-scrim]")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(drawer.getAttribute("data-open"), "false");
    flushSync(() => {
      patternButton!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(drawer.getAttribute("data-open"), "false");
  } finally {
    flushSync(() => root.unmount());
    dom.window.HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView keeps stale Atlas evidence visible when current inventory pointers drift", () => {
  const driftedEvidence = Array.from({ length: 3 }, (_, index) => ({
    ...auditPacket,
    signalId: `orphan-signal-${index + 1}`,
    itemId: `orphan-item-${index + 1}`,
    shortCode: `S${index + 1}`,
    opText: `audit source ${index + 1}`
  }));
  const driftedMemos: TopicAuditMemoBundle = {
    ...auditMemos,
    signalReadings: driftedEvidence.map((packet) => ({
      ...auditMemos.signalReadings[0]!,
      signalId: packet.signalId,
      shortCode: packet.shortCode,
      evidenceRefs: [`${packet.shortCode}.OP`]
    }))
  };

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: [] },
      signals: [],
      pairs: [],
      auditEvidence: driftedEvidence,
      auditMemos: driftedMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 3, queuedCount: 0, coverage: "3/0" },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-audit-actions="ready"/);
  assert.match(html, /data-atlas-ledger-metric="已讀 15 · 可用 15"/);
  assert.equal((html.match(/data-source-row="S\d+"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /覆蓋 /);
  assert.doesNotMatch(html, /P1 判讀 3\/0/);
  assert.doesNotMatch(html, /覆蓋 3\/0/);
});

test("TopicDetailView ignores non-topic-scoped signals when audit sources are present", () => {
  const auditEvidence = Array.from({ length: 15 }, (_, index) => ({
    ...auditPacket,
    signalId: `audit-signal-${index + 1}`,
    itemId: `audit-item-${index + 1}`,
    shortCode: `S${index + 1}`,
    opText: `audit source ${index + 1}`
  }));
  const auditOnlySignals: Signal[] = Array.from({ length: 30 }, (_, index) => ({
    ...signals[0]!,
    id: `unscoped-signal-${index + 1}`,
    itemId: `unscoped-item-${index + 1}`
  }));
  const auditOnlyMemos: TopicAuditMemoBundle = {
    ...auditMemos,
    signalReadings: auditEvidence.map((packet) => ({
      ...auditMemos.signalReadings[0]!,
      signalId: packet.signalId,
      shortCode: packet.shortCode,
      evidenceRefs: [`${packet.shortCode}.OP`]
    }))
  };

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: ["audit-signal-1"] },
      signals: auditOnlySignals,
      pairs: [],
      auditEvidence,
      auditMemos: auditOnlyMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 15, queuedCount: 15, coverage: "15/15" },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-atlas-ledger-metric="已讀 75 · 可用 75"/);
  assert.equal((html.match(/data-source-row="S\d+"/g) ?? []).length, 15);
  assert.doesNotMatch(html, /覆蓋 /);
  assert.doesNotMatch(html, /30 訊號/);
  assert.doesNotMatch(html, /P1 判讀 15\/30/);
});

test("TopicDetailView keeps an uncrawled saved signal pending outside the 15-source Atlas", () => {
  const auditEvidence = Array.from({ length: 15 }, (_, index) => ({
    ...auditPacket,
    signalId: `audit-signal-${index + 1}`,
    itemId: `audit-item-${index + 1}`,
    shortCode: `S${index + 1}`,
    opText: `audit source ${index + 1}`
  }));
  const topicSignals: Signal[] = [
    ...auditEvidence.map((packet) => ({
      ...signals[0]!,
      id: packet.signalId,
      itemId: packet.itemId
    })),
    {
      ...signals[0]!,
      id: "saved-signal",
      itemId: "saved-item",
      capturedAt: "2026-04-23T11:00:00.000Z"
    }
  ];
  const auditOnlyMemos: TopicAuditMemoBundle = {
    ...auditMemos,
    signalReadings: auditEvidence.map((packet) => ({
      ...auditMemos.signalReadings[0]!,
      signalId: packet.signalId,
      shortCode: packet.shortCode,
      evidenceRefs: [`${packet.shortCode}.OP`]
    }))
  };

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: topicSignals.map((signal) => signal.id) },
      signals: topicSignals,
      pairs: [],
      sessionItems: topicSignals.map((signal) => signal.itemId === "saved-item"
        ? buildSessionItem(signal.itemId, "saved")
        : buildReadySessionItem(signal.itemId)),
      auditEvidence,
      auditMemos: auditOnlyMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 15, queuedCount: 1, coverage: "15/16" },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 })
    })
  );

  assert.match(html, /data-atlas-ledger-metric="已讀 75 · 可用 75"/);
  assert.doesNotMatch(html, /覆蓋 /);
  assert.equal((html.match(/data-source-row="S\d+"/g) ?? []).length, 15);
  assert.match(html, /data-topic-source-session="needs_crawl"/);
  assert.doesNotMatch(html, /data-topic-source-crawl="action"/);
  assert.match(html, /開始爬取 1 篇/);
  assert.match(html, /P1 判讀 15\/16/);
  assert.doesNotMatch(html, /覆蓋 15\/16/);
});

test("TopicDetailView derives audit header, coverage, and remaining source rows from the evidence list", () => {
  const auditEvidence = Array.from({ length: 4 }, (_, index) => ({
    ...auditPacket,
    signalId: `audit-signal-${index + 1}`,
    itemId: `audit-item-${index + 1}`,
    shortCode: `S${index + 1}`,
    opText: `audit source ${index + 1}`
  }));
  const oneReading: TopicAuditMemoBundle = {
    ...auditMemos,
    signalReadings: [{
      ...auditMemos.signalReadings[0]!,
      signalId: "audit-signal-1",
      shortCode: "S1",
      evidenceRefs: ["S1.OP"]
    }]
  };

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: ["audit-signal-1", "audit-signal-2", "stale-signal"] },
      signals: [
        { ...signals[0]!, id: "audit-signal-1", itemId: "audit-item-1" },
        { ...signals[0]!, id: "audit-signal-2", itemId: "audit-item-2" },
        { ...signals[0]!, id: "stale-signal", itemId: "stale-item" }
      ],
      pairs: [],
      auditEvidence,
      auditMemos: oneReading,
      auditSummary: { reportStatus: "ready", analyzedCount: 5, queuedCount: 7, coverage: "5/12" },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-atlas-ledger-metric="已讀 20 · 可用 20"/);
  assert.doesNotMatch(html, /覆蓋 /);
  assert.equal((html.match(/data-source-row="S\d+"/g) ?? []).length, 4);
  assert.match(html, /data-source-row="S1"/);
  assert.match(html, /data-source-row="S2"/);
  assert.match(html, /data-source-row="S3"/);
  assert.match(html, /data-source-row="S4"/);
  assert.doesNotMatch(html, /12 訊號/);
  assert.doesNotMatch(html, /P1 判讀 5\/12/);
  assert.doesNotMatch(html, /覆蓋 5\/12/);
});

test("TopicDetailView failed audit state stays in the Atlas frame and shows the reason", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionItems: [buildReadySessionItem("item-1")],
      auditEvidence: [],
      auditMemos: null,
      auditSummary: { reportStatus: "failed", analyzedCount: 1, queuedCount: 0, failedStage: 3, failedReason: "provider timeout" },
      auditRunStatus: {
        sessionId: "session-1", topicId: "topic-1", requestId: "run-1", state: "failed", stage: "narrative", failureKind: "timeout",
        startedAt: "2026-07-17T09:00:00.000Z", updatedAt: "2026-07-17T09:01:00.000Z", expiresAt: "2026-07-17T09:16:00.000Z"
      },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-signal-atlas-canvas="true"/);
  assert.match(html, /data-signal-atlas-empty-state="true"/);
  assert.match(html, /data-topic-source-session="generation_failed"/);
  assert.match(html, /生成逾時。/);
  assert.doesNotMatch(html, /舊版 Atlas 仍保留/);
  assert.match(html, /重試生成/);
  assert.doesNotMatch(html, /錯誤詳情/);
  assert.doesNotMatch(html, /data-topic-audit-block="overview"/);
  assert.doesNotMatch(html, /從 P3 續跑|失敗於 P3/);
});

test("TopicDetailView exposes the explicit Topic load state", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs,
      loadState: "recovering",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-load-state="recovering"/);
});

test("TopicDetailView renders the legacy research question editor only in product detail mode", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: {
        ...topic,
        context: {
          researchQuestion: "Claude Code 用戶對 Agent 模式的真實抱怨是什麼？"
        }
      },
      signals,
      pairs,
      sessionMode: "product",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /研究問題/);
  assert.match(html, /Claude Code 用戶對 Agent 模式的真實抱怨是什麼？/);
});

test("TopicDetailView signal row shows reading card when signalReadingsBySignalId provided", () => {
  const topicWithContext: Topic = {
    ...topic,
    context: { researchQuestion: "用戶對 AI 工具的真實抱怨是什麼？" }
  };
  const reading: TopicSignalReading = {
    signalId: "signal-1",
    topicId: "topic-1",
    status: "complete",
    stance: "central",
    reading: "這則帖子的核心是對自動化工具的信任問題。",
    audienceSignal: "留言普遍表達了類似的擔憂。",
    evidenceRefs: ["e1", "e2"],
    uncertainties: ["樣本不足，需驗證"],
    promptVersion: "v1",
    model: "gemini-1.5-flash",
    generatedAt: "2026-05-01T00:00:00.000Z"
  };

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: topicWithContext,
      signals,
      pairs: [],
      sessionMode: "product",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      signalReadingsBySignalId: { "signal-1": reading }
    })
  );

  assert.match(html, /data-topic-signal-reading="card"/);
  assert.match(html, /核心/);
  assert.match(html, /這則帖子的核心是對自動化工具的信任問題/);
  assert.match(html, /留言普遍表達了類似的擔憂/);
  assert.match(html, /待驗證：樣本不足，需驗證/);
});

test("TopicDetailView source rows render stance chips from topic signal readings", () => {
  const reading: TopicSignalReading = {
    signalId: "signal-1",
    topicId: "topic-1",
    status: "complete",
    stance: "central",
    reading: "這則帖子的核心是對自動化工具的信任問題。",
    audienceSignal: "留言普遍表達了類似的擔憂。",
    evidenceRefs: ["e1", "e2"],
    uncertainties: [],
    promptVersion: "v1",
    model: "gemini-1.5-flash",
    generatedAt: "2026-05-01T00:00:00.000Z"
  };

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "topic",
      sessionItems: [buildSessionItem("item-1", "saved")],
      signalReadingsBySignalId: { "signal-1": reading },
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-source-row="signal-1"/);
  assert.match(html, /data-topic-source-stance="central"/);
  assert.match(html, /核心/);
});

test("TopicDetailView signal row shows generate button without requiring a research question", () => {
  const readyItem = buildSessionItem("item-1", "succeeded");
  readyItem.latestCapture = {
    analysis: {
      id: "analysis-1",
      capture_id: "capture-item-1",
      status: "succeeded",
      stage: "final",
      analysis_version: "v1",
      source_comment_count: 5,
      clusters: [],
      evidence: [],
      metrics: {},
      generated_at: "2026-05-01T00:00:00.000Z",
      last_error: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z"
    }
  } as SessionItem["latestCapture"];

  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      sessionItems: [readyItem],
      signalReadingsBySignalId: {},
      onGenerateSignalReading: () => Promise.resolve({ ok: true })
    })
  );

  assert.match(html, /生成判讀/);
  assert.match(html, /data-attention-beam="actionable"/);
});

test("TopicDetailView hides legacy keyword synthesis even when storage still has it", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: topicWithSynthesis,
      signalTagsByItemId,
      signals,
      pairs,
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.doesNotMatch(html, /data-topic-synthesis="card"/);
  assert.doesNotMatch(html, /v3\.generic-keyword-lens/);
  assert.doesNotMatch(html, /航班改動焦慮/);
  assert.doesNotMatch(html, /標籤雲/);
});

test("TopicSynthesisCard Stack layout observation section expands when open", () => {
  const testables = topicDetailViewTestables as typeof topicDetailViewTestables & {
    SynthesisStackSection: (props: {
      testId: string;
      title: string;
      count: number;
      open: boolean;
      onToggle: () => void;
      children: React.ReactNode;
    }) => React.ReactElement;
  };
  let toggled = false;
  const closed = testables.SynthesisStackSection({
    testId: "synthesis-observations",
    title: "觀察",
    count: 2,
    open: false,
    onToggle: () => {
      toggled = true;
    },
    children: React.createElement("div", null, "旅客把流程缺口讀成制度責任。")
  });
  const closedChildren = React.Children.toArray(closed.props.children) as React.ReactElement[];
  const trigger = closedChildren.find((child) => child.type === "button") as React.ReactElement<{ onClick: () => void; "aria-expanded": boolean }>;

  assert.equal(trigger.props["aria-expanded"], false);
  assert.equal(trigger.props.onClick(), undefined);
  assert.equal(toggled, true);

  const openHtml = renderToStaticMarkup(
    testables.SynthesisStackSection({
      testId: "synthesis-observations",
      title: "觀察",
      count: 2,
      open: true,
      onToggle: () => undefined,
      children: React.createElement("div", null, "旅客把流程缺口讀成制度責任。")
    })
  );

  assert.match(openHtml, /aria-expanded="true"/);
  assert.match(openHtml, /data-testid="synthesis-observations-body"/);
  assert.match(openHtml, /旅客把流程缺口讀成制度責任/);
});

test("TopicDetailView empty pairs folds the compare-results section away", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: [], pairIds: [] },
      signals: [],
      pairs: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  // Compare results was demoted to a folded tool — when empty, no compare-section renders at all.
  assert.equal(/data-topic-pairs="folded"/.test(html), false);
});

test("TopicDetailView with no signals omits the signals fold entirely", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: { ...topic, signalIds: [], pairIds: [] },
      signals: [],
      pairs: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );
  assert.doesNotMatch(html, /data-topic-signals="folded"/);
});

test("TopicDetailView pairs render as a folded tool when present", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs,
      sessionMode: "product",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );
  assert.match(html, /data-topic-pairs="folded"/);
  assert.match(html, /比較結果（工具）/);
});

test("topicDetailViewTestables back action routes to casebook", () => {
  let called = false;
  const header = topicDetailViewTestables.Breadcrumb({
    topicName: topic.name,
    onBack: () => {
      called = true;
    }
  });

  header.props.onClick();
  assert.equal(called, true);
});

test("topicDetailViewTestables pair row opens the saved analysis", () => {
  const calls: string[] = [];
  const row = topicDetailViewTestables.PairRow({
    pair: pairs[0]!,
    onOpenPair: (resultId) => calls.push(resultId)
  });

  row.props.onClick();
  assert.deepEqual(calls, ["result-1"]);
  assert.equal(row.props["data-dlens-presence-motion"], undefined);
});

test("TopicDetailView renders the product judgment panel in product mode", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [
        {
          ...pairs[0]!,
          judgmentResult: {
            relevance: 4,
            recommendedState: "watch",
            whyThisMatters: "留言已經對應到產品的核心工作流。",
            actionCue: "先看反方聲音"
          },
          judgmentVersion: "v1",
          judgmentSource: "ai"
        }
      ],
      sessionMode: "product",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined,
      onSaveJudgmentOverride: () => undefined
    })
  );

  assert.match(html, /產品情境判斷/);
  assert.match(html, /相關性 4\/5/);
  assert.match(html, /WATCH/);
  assert.match(html, /人工調教/);
});

test("TopicDetailView single-row analysis action starts processing when available", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "saved")],
      signalPreviewById: { "signal-1": "待分析貼文" },
      onQueueItemById: () => undefined,
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /開始分析/);
  assert.doesNotMatch(html, /排隊分析/);
});

test("TopicDetailView optimistic queued ids immediately update row status", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "saved")],
      optimisticQueuedItemIds: ["item-1"],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /排隊中/);
  assert.doesNotMatch(html, /開始分析 1 篇/);
});

test("TopicDetailView lets real running status override optimistic queued rows", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "running")],
      optimisticQueuedItemIds: ["item-1"],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /捕捉中/);
  assert.match(html, /正在捕捉 1 篇/);
  assert.doesNotMatch(html, /已排隊 1 篇/);
});

test("topicDetailViewTestables single item action prefers queue-and-start over queue-only", () => {
  let analyzedIds: string[] = [];
  let queuedId: string | null = null;

  topicDetailViewTestables.runSingleAnalyzeAction({
    itemId: "item-1",
    onAnalyzeItems: async (itemIds) => {
      analyzedIds = itemIds;
      return { ok: true, failedCount: 0 };
    },
    onQueueItemById: (itemId) => {
      queuedId = itemId;
    }
  });

  assert.deepEqual(analyzedIds, ["item-1"]);
  assert.equal(queuedId, null);
  assert.equal(topicDetailViewTestables.singleAnalyzeActionLabel(true), "開始分析");
  assert.equal(topicDetailViewTestables.singleAnalyzeActionLabel(false), "排隊分析");
});

test("pickPrimaryJudgmentPair picks the highest-relevance judgment pair and breaks ties by latest saved date", () => {
  const olderHighRelevance = {
    ...pairs[0]!,
    resultId: "result-older-high",
    savedAt: "2026-04-23T08:00:00.000Z",
    judgmentResult: {
      relevance: 5 as const,
      recommendedState: "watch" as const,
      whyThisMatters: "older high relevance",
      actionCue: "watch"
    }
  };
  const newerHighRelevance = {
    ...pairs[0]!,
    resultId: "result-newer-high",
    savedAt: "2026-04-23T12:00:00.000Z",
    judgmentResult: {
      relevance: 5 as const,
      recommendedState: "act" as const,
      whyThisMatters: "newer high relevance",
      actionCue: "act"
    }
  };
  const latestLowRelevance = {
    ...pairs[0]!,
    resultId: "result-latest-low",
    savedAt: "2026-04-23T18:00:00.000Z",
    judgmentResult: {
      relevance: 2 as const,
      recommendedState: "park" as const,
      whyThisMatters: "latest but lower relevance",
      actionCue: "park"
    }
  };

  assert.equal(
    pickPrimaryJudgmentPair([
      olderHighRelevance,
      latestLowRelevance,
      newerHighRelevance
    ])?.resultId,
    "result-newer-high"
  );
});

test("topic-audit-components.tsx module surface: retired Newsroom family is gone, live surface survives", async () => {
  const topicAuditModule: Record<string, unknown> = await import("../src/ui/topic-audit-components.tsx");
  const componentSource = readFileSync(new URL("../src/ui/topic-audit-components.tsx", import.meta.url), "utf8");

  // Retired Newsroom family — verified dead (declaration was the only mention
  // anywhere in src/entrypoints/tests, aside from the absence-contract tests below).
  assert.equal(topicAuditModule.ReactionPatternDetailPanel, undefined);
  assert.equal(topicAuditModule.NewsroomLane, undefined);
  assert.equal(topicAuditModule.NewsroomLadder, undefined);
  assert.equal(topicAuditModule.NewsroomUncertainty, undefined);
  assert.equal(topicAuditModule.NarrativeLaneDetailPanel, undefined);
  assert.equal(topicAuditModule.buildNewsroomLadder, undefined);
  assert.equal(topicAuditModule.newsroomRoleForLane, undefined);

  // Dot and ReactionCoverageStrip keep their in-file callers but are no longer public exports.
  assert.equal(topicAuditModule.Dot, undefined);
  assert.equal(topicAuditModule.ReactionCoverageStrip, undefined);

  // Public testables that must survive.
  assert.equal(typeof topicAuditModule.TopicAuditStatusPill, "function");
  assert.equal(typeof topicAuditModule.AuditReportReactionPatterns, "function");
  assert.equal(typeof topicAuditModule.AuditReportNarrativeLanes, "function");
  assert.equal(typeof topicAuditModule.NarrativeLane, "function");
  assert.equal(topicAuditModule.ReactionPatternLane, undefined);
  assert.equal(typeof topicAuditModule.SourceRow, "function");

  const NarrativeLaneComponent = topicAuditModule.NarrativeLane as React.ComponentType<{
    lane: {
      id: string;
      label: string;
      signalRefs: string[];
      consensus: number;
      crossPostCount: number;
      postTotal: number;
    };
  }>;
  const laneHtml = renderToStaticMarkup(
    <NarrativeLaneComponent
      lane={{ id: "surface-lane", label: "仍可用的敘事線", signalRefs: ["S1.R1", "S2.R1"], consensus: 0.8, crossPostCount: 2, postTotal: 3 }}
    />
  );
  assert.match(laneHtml, /data-narrative-lane="surface-lane"/);
  assert.match(laneHtml, /data-narrative-lane-strength="surface-lane"/);
  assert.doesNotMatch(laneHtml, /data-reaction-pattern/);
  assert.doesNotMatch(componentSource, /kind\??:\s*"narrative"\s*\|\s*"reaction"|kind\s*=\s*"narrative"|data-reaction-pattern/);
});

async function renderNarrativeLaneIcon(icon: string): Promise<string> {
  const { NarrativeLane } = await import("../src/ui/topic-audit-components.tsx");
  return renderToStaticMarkup(
    <NarrativeLane
      lane={{
        id: "icon-lane",
        label: "敘事圖示",
        signalRefs: ["S1.R1", "S2.R1"],
        consensus: 0.8,
        crossPostCount: 2,
        postTotal: 3,
        icon
      }}
    />
  );
}

test("NarrativeLane covers every producer icon with semantic Lucide output", async () => {
  const expectedClasses = {
    heart: "lucide-heart",
    users: "lucide-users",
    "message-circle": "lucide-message-circle"
  } satisfies Record<NarrativeLaneIcon, string>;

  assert.deepEqual(Object.keys(expectedClasses), [...NARRATIVE_LANE_ICONS]);
  for (const icon of NARRATIVE_LANE_ICONS) {
    const html = await renderNarrativeLaneIcon(icon);
    assert.match(html, new RegExp(`class="lucide ${expectedClasses[icon]}"`), icon);
  }
});

test("NarrativeLane safely falls back for unknown and inherited object keys", async () => {
  for (const icon of ["not-in-producer-whitelist", "constructor", "__proto__", "toString"]) {
    const html = await renderNarrativeLaneIcon(icon);
    assert.match(html, /class="lucide lucide-message-circle"/, icon);
  }
});
