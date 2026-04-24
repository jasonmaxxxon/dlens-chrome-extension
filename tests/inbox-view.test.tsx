import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Signal, Topic } from "../src/state/types.ts";
import { InboxView, inboxViewTestables } from "../src/ui/InboxView.tsx";

const topics: Topic[] = [
  {
    id: "topic-1",
    sessionId: "session-1",
    name: "航班爭議",
    description: "",
    status: "watching",
    tags: ["客服"],
    signalIds: ["signal-2"],
    pairIds: ["result-1"],
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-23T10:00:00.000Z"
  }
];

const signals: Signal[] = [
  {
    id: "signal-1",
    sessionId: "session-1",
    itemId: "item-1",
    source: "threads",
    inboxStatus: "unprocessed",
    suggestedTopicIds: [],
    capturedAt: "2026-04-23T08:00:00.000Z"
  },
  {
    id: "signal-2",
    sessionId: "session-1",
    itemId: "item-2",
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-1",
    suggestedTopicIds: [],
    capturedAt: "2026-04-23T09:00:00.000Z",
    triagedAt: "2026-04-23T09:10:00.000Z"
  }
];

test("InboxView renders signal rows and available topic targets", () => {
  const html = renderToStaticMarkup(
    React.createElement(InboxView, {
      sessionId: "session-1",
      topics,
      initialSignals: signals,
      signalPreviewById: {
        "signal-1": "客服回覆太慢，情緒開始聚焦",
        "signal-2": "促銷活動被讀成補償方案"
      },
      onSignalTriaged: () => undefined
    })
  );

  assert.match(html, /data-mode-header="inbox"/);
  assert.match(html, /客服回覆太慢/);
  assert.match(html, /航班爭議/);
  assert.match(html, /Threads/);
  assert.match(html, /建立主題/);
});

test("InboxView renders an empty state when the inbox is empty", () => {
  const html = renderToStaticMarkup(
    React.createElement(InboxView, {
      sessionId: "session-1",
      topics: [],
      initialSignals: [],
      signalPreviewById: {},
      onSignalTriaged: () => undefined
    })
  );

  assert.match(html, /收件匣是空的/);
});

test("inboxViewTestables filters rows by inbox tab", () => {
  assert.equal(inboxViewTestables.filterSignals(signals, "all").length, 2);
  assert.equal(inboxViewTestables.filterSignals(signals, "unprocessed").length, 1);
  assert.equal(inboxViewTestables.filterSignals(signals, "marked").length, 1);
});

test("inboxViewTestables row actions support assign and create-topic triage", () => {
  const calls: Array<{ signalId: string; action: unknown }> = [];
  const row = inboxViewTestables.SignalRow({
    signal: signals[0]!,
    previewText: "客服回覆太慢",
    topics,
    onTriage: (signalId, action) => calls.push({ signalId, action })
  });

  row.props.onAssign("topic-1");
  row.props.onCreateTopic("新主題");

  assert.deepEqual(calls, [
    { signalId: "signal-1", action: { kind: "assign", topicId: "topic-1" } },
    { signalId: "signal-1", action: { kind: "create-topic", name: "新主題" } }
  ]);
});

test("InboxView shows product-mode relevance badges when a linked topic has judgment", () => {
  const html = renderToStaticMarkup(
    React.createElement(InboxView, {
      sessionId: "session-1",
      topics,
      initialSignals: signals,
      signalPreviewById: {
        "signal-1": "客服回覆太慢，情緒開始聚焦",
        "signal-2": "促銷活動被讀成補償方案"
      },
      showJudgmentBadges: true,
      judgmentByTopicId: {
        "topic-1": {
          relevance: 3,
          recommendedState: "watch"
        }
      },
      onSignalTriaged: () => undefined
    })
  );

  assert.match(html, /相關 3 WATCH/);
});
