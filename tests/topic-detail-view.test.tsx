import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TOPIC_SYNTHESIS_VERSION } from "../src/compare/topic-synthesis.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import type { EvidencePacket } from "../src/compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../src/compare/topic-audit-validator.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";
import type { SavedAnalysisSnapshot, SessionItem, Signal, SignalTagsRecord, Topic, TopicSignalReading, TopicSynthesis } from "../src/state/types.ts";
import { TopicDetailView, topicDetailViewTestables } from "../src/ui/TopicDetailView.tsx";
import { SignalDrawer } from "../src/ui/SignalDrawer.tsx";
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
  onRunAudit?: (topicId: string, fromStage?: TopicDetailCommand extends { fromStage?: infer Stage } ? Stage : never) => void;
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
        return onRunAudit?.(command.target.topicId, command.fromStage as never);
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
  assert.match(html, /data-topic-audit-block="overview"/);
  assert.match(html, /data-topic-audit-block="sources"/);
  assert.match(html, /data-topic-source-row="signal-1"/);
  assert.match(html, /signal text item-1/);
  assert.doesNotMatch(html, /data-topic-signal-inventory="true"/);
  assert.doesNotMatch(html, /已採集貼文/);
  assert.match(html, /主題與敘事尚未產出/);
  assert.doesNotMatch(html, /Topic detail/);
  assert.doesNotMatch(html, /補充描述/);
  assert.doesNotMatch(html, /研究問題/);
  assert.doesNotMatch(html, /標籤雲/);
  assert.doesNotMatch(html, /AI 語意標籤/);
  assert.doesNotMatch(html, /全部訊號篇目/);
  assert.doesNotMatch(html, /關鍵詞統計/);
  assert.match(html, /0\/1 已分析/);
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

test("TopicDetailView renders audit overview, themes, lanes, and representative quotes from displayHints", () => {
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

  assert.match(html, /data-topic-audit-block="overview"/);
  assert.match(html, /報告 已生成/);
  assert.match(html, /data-topic-audit-block="themes"/);
  assert.match(html, /航班/);
  assert.match(html, /data-topic-audit-block="lanes"/);
  assert.match(html, /客服補救失速/);
  assert.match(html, /data-narrative-lane-consensus="lane-1"/);
  assert.match(html, /data-narrative-lane-consensus-fill="lane-1"[^>]*width:70%/);
  assert.match(html, /共識 70%/);
  assert.match(html, /1 篇/);
  assert.match(html, /data-topic-newsroom-ladder="true"/);
  assert.match(html, /航班改動後等不到客服/);
  assert.doesNotMatch(html, /data-topic-audit-block="sources"/);
});

test("TopicDetailView frames narrative lanes as newsroom signals and keeps source attribution", () => {
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

  // Narrative lanes are reframed as newsroom signals (main narrative / counter-signal).
  assert.match(html, /data-topic-newsroom-signal="true"/);
  assert.match(html, /主敘事|反向訊號|待驗證/);
  // F4: the reshape must preserve real source attribution + original text, not erase it.
  assert.match(html, /@alpha/);
  assert.match(html, /航班改動後等不到客服/);
});

test("TopicDetailView renders a representative quote ladder from real audit sources", () => {
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

  assert.match(html, /data-topic-newsroom-ladder="true"/);
  assert.match(html, /data-topic-newsroom-ladder-detail="collapsed"/);
  assert.match(html, /代表 quote/);
  // Real original text + author attribution carried into the ladder.
  assert.match(html, /航班改動後等不到客服/);
  assert.match(html, /@alpha/);
});

test("TopicDetailView suppresses the duplicate source list when representative quotes cover the visible sources", () => {
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

  assert.match(html, /data-topic-newsroom-ladder="true"/);
  assert.match(html, /data-newsroom-ladder-quote="S1"/);
  assert.doesNotMatch(html, /data-topic-audit-source-list-style="audit-report"/);
  assert.doesNotMatch(html, /data-source-row="S1"/);
});

test("buildNewsroomLadder classifies counter quotes by low-consensus lane membership", async () => {
  const { buildNewsroomLadder } = await import("../src/ui/topic-audit-components.tsx");
  const ladder = buildNewsroomLadder(
    [
      { id: "lane-main", label: "主敘事", signalRefs: ["S1.OP", "S2.OP"], consensus: 0.8 },
      { id: "lane-counter", label: "反向", signalRefs: ["S3.OP"], consensus: 0.3 }
    ],
    [
      { shortCode: "S1", text: "主敘事原文 A", author: "op_a" },
      { shortCode: "S2", text: "主敘事原文 B", author: "op_b" },
      { shortCode: "S3", text: "反例原文 C", author: "op_c" }
    ]
  );

  assert.equal(ladder.length, 3);
  // Mains lead, a counter slot is reserved at the end.
  assert.deepEqual(ladder.map((quote) => quote.ordinal), ["主", "主", "反"]);
  assert.equal(ladder[2]?.shortCode, "S3");
  assert.equal(ladder[2]?.author, "op_c");
});

test("TopicDetailView newsroom block surfaces an uncertainty line from validator flags", () => {
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
      auditEvidence: [auditPacket],
      auditMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
      auditValidatorFlags: [weakFlag],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-newsroom-uncertainty="true"/);
  assert.match(html, /待驗證/);
  assert.match(html, /證據偏薄/);
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
      auditEvidence,
      auditMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 4, queuedCount: 0 },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-detail-surface="overview"/);
  assert.match(html, /data-topic-detail-surface-style="audit-report"/);
  assert.match(html, /data-topic-detail-surface="themes"/);
  assert.match(html, /data-topic-detail-surface="lanes"/);
  assert.match(html, /data-topic-detail-surface="sources"/);
  assert.match(html, /data-topic-detail-rhythm="section"/);
  assert.match(html, /data-shared-surface-card="focused"/);
  assert.match(html, /data-shared-surface-card="utility"/);
  assert.match(html, /data-section-header="shared"/);
  assert.match(html, /var\(--dlens-mode-accent, #3f5a3b\)/);
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
      .find((button) => button.textContent?.includes("開啟審查報告"));
    assert.ok(cta);
    cta.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

    assert.deepEqual(calls, [{ topicId: "topic-1" }]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView reveals derived lane content (keywords, comments, voices) when a narrative lane is clicked", async () => {
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

  try {
    flushSync(() => {
      root.render(
        topicDetailViewElement({
          topic,
          signals,
          pairs: [],
          sessionMode: "topic",
          auditEvidence: [auditPacket],
          auditMemos,
          auditSummary: { reportStatus: "ready", analyzedCount: 1, queuedCount: 0 },
          auditValidatorFlags: [],
          onBack: () => undefined,
          onOpenPair: () => undefined,
          onUpdateTopic: () => undefined
        })
      );
    });

    // Before clicking, no lane detail is revealed.
    assert.equal(rootElement.querySelector("[data-narrative-lane-detail]"), null);

    const laneButton = rootElement.querySelector<HTMLButtonElement>("button[data-narrative-lane=\"lane-1\"]");
    assert.ok(laneButton, "narrative lane button should render");
    flushSync(() => {
      laneButton!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    const panel = rootElement.querySelector("[data-narrative-lane-detail=\"lane-1\"]");
    assert.ok(panel, "clicking a lane reveals its detail panel");
    // Real derived content, traceable to the captured packet — not decoration.
    assert.ok(panel!.querySelector("[data-lane-keyword]"), "recurring wording chips render");
    assert.match(panel!.textContent ?? "", /我也遇到/);
    assert.match(panel!.textContent ?? "", /reader/);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
});

test("TopicDetailView uses audit evidence as the denominator when topic signal pointers drift", () => {
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

  assert.match(html, /3 訊號/);
  assert.match(html, /3\/3 已分析/);
  assert.match(html, /覆蓋 3\/3/);
  assert.doesNotMatch(html, /3\/0 已分析/);
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

  assert.match(html, /15 訊號/);
  assert.match(html, /15\/15 已分析/);
  assert.match(html, /覆蓋 15\/15/);
  assert.doesNotMatch(html, /30 訊號/);
  assert.doesNotMatch(html, /15\/30 已分析/);
});

test("TopicDetailView keeps the B-14 audit count at 15/15 when a topic also has an uncrawled saved signal", () => {
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
      sessionItems: [buildSessionItem("saved-item", "saved")],
      auditEvidence,
      auditMemos: auditOnlyMemos,
      auditSummary: { reportStatus: "ready", analyzedCount: 15, queuedCount: 1, coverage: "15/15" },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /15 訊號/);
  assert.match(html, /15\/15 已分析/);
  assert.match(html, /覆蓋 15\/15/);
  assert.equal((html.match(/data-source-row="S\d+"/g) ?? []).length, 12);
  assert.doesNotMatch(html, /16 訊號/);
  assert.doesNotMatch(html, /15\/16 已分析/);
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

  assert.match(html, /4 訊號/);
  assert.match(html, /1\/4 已分析/);
  assert.match(html, /覆蓋 4\/4/);
  assert.equal((html.match(/data-source-row="S\d+"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-source-row="S1"/);
  assert.doesNotMatch(html, /data-source-row="S2"/);
  assert.doesNotMatch(html, /data-source-row="S3"/);
  assert.match(html, /data-source-row="S4"/);
  assert.doesNotMatch(html, /12 訊號/);
  assert.doesNotMatch(html, /5\/12 已分析/);
  assert.doesNotMatch(html, /覆蓋 5\/12/);
});

test("TopicDetailView failed audit state shows resume copy and failed reason", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      auditEvidence: [],
      auditMemos: null,
      auditSummary: { reportStatus: "failed", analyzedCount: 1, queuedCount: 0, failedStage: 3, failedReason: "provider timeout" },
      auditValidatorFlags: [],
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /報告 失敗/);
  assert.match(html, /從 P3 續跑/);
  assert.match(html, /provider timeout/);
  assert.match(html, /主題與敘事尚未產出/);
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

test("TopicDetailView renders bulk analyze as the primary signal action", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "saved")],
      signalPreviewById: { "signal-1": "待分析貼文" },
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-bulk-analyze="action"/);
  assert.match(html, /開始分析 1 篇/);
  assert.match(html, /1 篇未分析，完成後才可查看單篇分析或加入比較/);
  assert.match(html, /data-dlens-button="primary"/);
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

test("TopicDetailView surfaces bulk analyze in the single overview", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "saved")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-bulk-analyze="action"/);
  assert.match(html, /開始分析 1 篇/);
  assert.match(html, /訊號/);
});

test("TopicDetailView bulk analyze loading state disables the CTA", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "saved")],
      isBulkAnalyzing: true,
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /正在加入隊列…/);
  assert.match(html, /disabled=""/);
  assert.match(html, /完成後可在脈絡或比較查看/);
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

test("TopicDetailView keeps a visible processing state after bulk queueing", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "queued")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-bulk-analyze="processing"/);
  assert.match(html, /已排隊 1 篇/);
  assert.match(html, /0\/1 已完成/);
  assert.doesNotMatch(html, /開始分析 1 篇/);
});

test("TopicDetailView shows processing status alongside remaining unanalyzed CTA", () => {
  const mixedTopic = { ...topic, signalIds: ["signal-1", "signal-2"] };
  const mixedSignals: Signal[] = [
    signals[0],
    {
      id: "signal-2",
      sessionId: "session-1",
      itemId: "item-2",
      source: "threads",
      inboxStatus: "assigned",
      topicId: "topic-1",
      suggestedTopicIds: [],
      capturedAt: "2026-04-23T08:05:00.000Z",
      triagedAt: "2026-04-23T09:05:00.000Z"
    }
  ];
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic: mixedTopic,
      signals: mixedSignals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "queued"), buildSessionItem("item-2", "saved")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /已排隊 1 篇/);
  assert.match(html, /開始分析 1 篇/);
});

test("TopicDetailView can restart queued topic processing when worker is idle", () => {
  const html = renderToStaticMarkup(
    topicDetailViewElement({
      topic,
      signals,
      pairs: [],
      sessionMode: "product",
      sessionItems: [buildSessionItem("item-1", "queued")],
      workerStatus: "idle",
      onStartProcessing: () => undefined,
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /已排隊 1 篇/);
  assert.match(html, /worker 目前未在跑/);
  assert.match(html, /啟動處理/);
});

test("topicDetailViewTestables bulk analyze CTA calls the supplied action", () => {
  let called = 0;
  const element = topicDetailViewTestables.BulkAnalyzeCta({
    count: 2,
    isBulkAnalyzing: false,
    disabled: false,
    onAnalyze: () => {
      called += 1;
    }
  });
  const children = React.Children.toArray(element.props.children);
  const button = children[0] as React.ReactElement<{ onClick: () => void }>;

  button.props.onClick();
  assert.equal(called, 1);
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

test("TopicProcessingStatus exposes restart processing when backend has expired running work", () => {
  const html = renderToStaticMarkup(
    React.createElement(topicDetailViewTestables.TopicProcessingStatus, {
      total: 3,
      ready: 1,
      queued: 0,
      crawling: 0,
      analyzing: 2,
      workerStatus: "draining",
      backendWorkUiState: { kind: "expired_running" as const, count: 1 },
      isStartingProcessing: false,
      onStartProcessing: () => undefined
    })
  );

  assert.match(html, /重啟處理|Restart/i);
  assert.match(html, /lease 過期|expired/i);
});

test("TopicProcessingStatus keeps existing queued-idle restart copy when no expired work", () => {
  const html = renderToStaticMarkup(
    React.createElement(topicDetailViewTestables.TopicProcessingStatus, {
      total: 3,
      ready: 1,
      queued: 2,
      crawling: 0,
      analyzing: 0,
      workerStatus: "idle",
      backendWorkUiState: null,
      isStartingProcessing: false,
      onStartProcessing: () => undefined
    })
  );

  assert.match(html, /啟動處理/);
  assert.doesNotMatch(html, /重啟處理/);
});
