import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SavedAnalysisSnapshot, SessionItem, Signal, Topic, TopicSynthesis } from "../src/state/types.ts";
import { TopicDetailView, topicDetailViewTestables } from "../src/ui/TopicDetailView.tsx";
import { pickPrimaryJudgmentPair } from "../src/ui/useTopicState.ts";

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
  generatorVersion: "v2.work-signal-lens"
};

const topicWithSynthesis: Topic = {
  ...topic,
  synthesis
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

test("TopicDetailView renders synthesis, header counts, and signals fold", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs,
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /← 主題/);
  assert.match(html, /航班爭議/);
  assert.match(html, /整體訊號/);
  assert.match(html, /比較結果/);
  assert.match(html, /0 已分析/);
  // Signals list demoted to folded details block
  assert.match(html, /data-topic-signals="folded"/);
  // Tab switcher is gone
  assert.doesNotMatch(html, /討論訊號/);
});

test("TopicSynthesisCard Stack layout renders five collapsed section triggers", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic: topicWithSynthesis,
      synthLayout: "stack",
      signals,
      pairs,
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-synthesis="card"/);
  assert.match(html, /討論主線集中在航班改動後的等待感/);
  assert.match(html, /data-testid="synthesis-observations"/);
  assert.match(html, /data-testid="synthesis-clusters"/);
  assert.match(html, /data-testid="synthesis-techniques"/);
  assert.match(html, /data-testid="synthesis-memes"/);
  assert.match(html, /data-testid="synthesis-outliers"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /5 訊號 ·/);
  assert.match(html, /v2\.work-signal-lens/);
  assert.doesNotMatch(html, /data-testid="synthesis-observations-body"/);
});

test("TopicSynthesisCard Console layout renders console wrapper and bar sections", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic: topicWithSynthesis,
      synthLayout: "console",
      signals,
      pairs,
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-synthesis="card"/);
  assert.match(html, /data-testid="synthesis-console"/);
  assert.match(html, /data-testid="synthesis-cluster-bars"/);
  assert.match(html, /data-testid="synthesis-meme-bars"/);
  assert.match(html, /data-testid="synthesis-techniques-rows"/);
  assert.match(html, /data-testid="synthesis-observation-rows"/);
  assert.match(html, /data-testid="synthesis-outlier-rows"/);
});

test("TopicSynthesisCard Console layout renders one bar per cluster and meme", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic: topicWithSynthesis,
      synthLayout: "console",
      signals,
      pairs,
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );
  const clusterBars = html.match(/data-testid="cluster-bar-\d+"/g) ?? [];
  const memeBars = html.match(/data-testid="meme-bar-\d+"/g) ?? [];

  assert.equal(clusterBars.length, synthesis.commonClusters.length);
  assert.equal(memeBars.length, synthesis.memes.length);
  assert.match(html, /60%/);
  assert.match(html, /80%/);
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
    React.createElement(TopicDetailView, {
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
    React.createElement(TopicDetailView, {
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
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs,
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
    React.createElement(TopicDetailView, {
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
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs: [],
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

test("TopicDetailView surfaces bulk analyze in the single overview", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs: [],
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
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs: [],
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
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs: [],
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

test("TopicDetailView keeps a visible processing state after bulk queueing", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs: [],
      sessionItems: [buildSessionItem("item-1", "queued")],
      onAnalyzeItems: async () => ({ ok: true, failedCount: 0 }),
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /data-topic-bulk-analyze="processing"/);
  assert.match(html, /正在分析 1 篇/);
  assert.match(html, /0\/1 已完成/);
  assert.doesNotMatch(html, /開始分析 1 篇/);
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
