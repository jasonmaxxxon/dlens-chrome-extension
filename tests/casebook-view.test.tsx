import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SessionItem, Signal, SignalTagsRecord, Topic } from "../src/state/types.ts";
import { CasebookView, casebookViewTestables } from "../src/ui/CasebookView.tsx";

function buildTopics(): Topic[] {
  return [
    {
      id: "topic-1",
      sessionId: "session-1",
      name: "航班爭議",
      description: "追蹤客服與航班改動討論",
      status: "watching",
      tags: ["客服", "航班", "延誤"],
      signalIds: ["signal-1", "signal-2"],
      pairIds: ["result-1"],
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-23T10:00:00.000Z"
    },
    {
      id: "topic-2",
      sessionId: "session-1",
      name: "機票促銷",
      description: "",
      status: "pending",
      tags: ["促銷"],
      signalIds: [],
      pairIds: [],
      createdAt: "2026-04-21T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z"
    }
  ];
}

function buildSignals(): Signal[] {
  return [
    {
      id: "signal-1",
      sessionId: "session-1",
      itemId: "item-1",
      source: "threads",
      inboxStatus: "assigned",
      topicId: "topic-1",
      capturedAt: "2026-05-08T04:00:00.000Z"
    },
    {
      id: "signal-2",
      sessionId: "session-1",
      itemId: "item-2",
      source: "threads",
      inboxStatus: "unprocessed",
      capturedAt: "2026-05-08T04:10:00.000Z"
    }
  ];
}

function buildSessionItem(id = "item-2", status: SessionItem["status"] = "saved"): SessionItem {
  const item = createSessionItem(
    {
      target_type: "post",
      page_url: `https://www.threads.net/@alpha/post/${id}`,
      post_url: `https://www.threads.net/@alpha/post/${id}`,
      author_hint: "alpha",
      text_snippet: `signal ${id}`,
      time_token_hint: "1h",
      dom_anchor: id,
      engagement: { likes: 1, comments: 1, reposts: 0, forwards: 0, views: 10 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-05-08T04:10:00.000Z"
    },
    "2026-05-08T04:10:00.000Z"
  );
  item.id = id;
  item.status = status;
  return item;
}

const signalTagsByItemId: Record<string, SignalTagsRecord> = {
  "item-1": {
    itemId: "item-1",
    status: "complete",
    signalTags: ["求職", "外勞", "本地勞工"],
    signalGist: "外勞招聘與本地求職者被壓價的衝突。",
    promptVersion: "v1",
    model: "google:test-model",
    generatedAt: "2026-05-21T00:00:00.000Z"
  },
  "item-2": {
    itemId: "item-2",
    status: "complete",
    signalTags: ["求職", "職位壓價", "外勞"],
    signalGist: "另一則求職討論。",
    promptVersion: "v1",
    model: "google:test-model",
    generatedAt: "2026-05-21T00:01:00.000Z"
  }
};

test("CasebookView renders the topic list and signal metadata", () => {
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: buildTopics(),
      pendingSignalCount: 3,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /data-mode-header="casebook"/);
  assert.match(html, /航班爭議/);
  assert.match(html, /客服/);
  assert.match(html, /2 則訊號/);
  assert.match(html, /新建主題/);
  assert.match(html, /AI 建議主題/);
});

test("CasebookView renders top semantic tags on topic cards", () => {
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: buildTopics(),
      signals: buildSignals().map((signal) => ({ ...signal, inboxStatus: "assigned", topicId: "topic-1" })),
      signalTagsByItemId,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /求職/);
  assert.match(html, /外勞/);
  assert.match(html, /本地勞工|職位壓價/);
});

test("CasebookView renders an empty state when there are no topics", () => {
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: [],
      pendingSignalCount: 0,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /尚無主題，新增一個開始追蹤/);
});

test("CasebookView shows topic cards with unassigned entry card", () => {
  const topics = buildTopics().map((topic) => (
    topic.id === "topic-1" ? { ...topic, signalIds: ["signal-1"] } : topic
  ));
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: topics,
      signals: buildSignals(),
      signalPreviewById: {
        "signal-1": "已分配到航班爭議的貼文",
        "signal-2": "還沒有主題的貼文"
      },
      pendingSignalCount: 1,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined,
      onSignalTriaged: () => undefined
    })
  );

  // Level 1: header + topic cards
  assert.match(html, /主題與貼文/);
  assert.match(html, /data-mode-header="casebook"/);
  // Topic cards visible at Level 1
  assert.match(html, /航班爭議/);
  assert.match(html, /機票促銷/);
  // Unassigned entry card
  assert.match(html, /data-topic-filter="unassigned"/);
  assert.match(html, /未分配貼文/);
  // Signal previews are NOT shown at Level 1 (they appear after drilling into unassigned)
  assert.doesNotMatch(html, /AI 建議主題/);
});

test("CasebookView unassigned rows read optimistic queued ids", () => {
  const topics = buildTopics().map((topic) => (
    topic.id === "topic-1" ? { ...topic, signalIds: ["signal-1"] } : topic
  ));
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: topics,
      signals: buildSignals(),
      initialUnassignedOpen: true,
      sessionItems: [buildSessionItem("item-2", "saved")],
      optimisticQueuedItemIds: ["item-2"],
      signalPreviewById: {
        "signal-2": "還沒有主題的貼文"
      },
      pendingSignalCount: 1,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined,
      onSignalTriaged: () => undefined
    })
  );

  assert.match(html, /還沒有主題的貼文/);
  assert.match(html, /排隊中/);
});

test("casebookViewTestables filters topics by status tab", () => {
  const topics = buildTopics();

  assert.equal(casebookViewTestables.filterTopics(topics, "all").length, 2);
  assert.equal(casebookViewTestables.filterTopics(topics, "watching").length, 1);
  assert.equal(casebookViewTestables.filterTopics(topics, "pending").length, 1);
});

test("casebookViewTestables topic row click routes to the topic detail", () => {
  const calls: string[] = [];
  const element = casebookViewTestables.TopicRow({
    topic: buildTopics()[0]!,
    onSelect: (topicId) => calls.push(topicId)
  });

  element.props.onClick();
  assert.deepEqual(calls, ["topic-1"]);
});
