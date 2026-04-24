import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SavedAnalysisSnapshot, Signal, Topic } from "../src/state/types.ts";
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

test("TopicDetailView renders overview, signal, and pair tabs", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic,
      signals,
      pairs,
      defaultTab: "overview",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /案例本/);
  assert.match(html, /航班爭議/);
  assert.match(html, /總覽/);
  assert.match(html, /討論訊號/);
  assert.match(html, /成對分析/);
});

test("TopicDetailView renders empty states for signals and pairs", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicDetailView, {
      topic: { ...topic, signalIds: [], pairIds: [] },
      signals: [],
      pairs: [],
      defaultTab: "pairs",
      onBack: () => undefined,
      onOpenPair: () => undefined,
      onUpdateTopic: () => undefined
    })
  );

  assert.match(html, /尚未加入成對分析/);
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
      defaultTab: "overview",
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
