import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SessionItem, Signal, Topic } from "../src/state/types.ts";
import { TopicsListView, topicsListViewTestables } from "../src/ui/TopicsListView.tsx";

function topic(id: string, name: string): Topic {
  return {
    id,
    sessionId: "session-1",
    name,
    status: "watching",
    tags: [],
    signalIds: [`${id}-signal-1`, `${id}-signal-2`, `${id}-signal-3`],
    pairIds: [],
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z"
  };
}

function signal(id: string, topicId: string, itemId: string): Signal {
  return {
    id,
    sessionId: "session-1",
    itemId,
    source: "threads",
    inboxStatus: "assigned",
    topicId,
    suggestedTopicIds: [],
    capturedAt: "2026-05-23T00:00:00.000Z",
    triagedAt: "2026-05-23T00:00:00.000Z"
  };
}

function item(id: string, status: SessionItem["status"]): SessionItem {
  const record = createSessionItem({
    target_type: "post",
    page_url: `https://www.threads.net/@alpha/post/${id}`,
    post_url: `https://www.threads.net/@alpha/post/${id}`,
    author_hint: "alpha",
    text_snippet: id,
    time_token_hint: "1h",
    dom_anchor: id,
    engagement: { likes: 0, comments: 0, reposts: 0, forwards: 0, views: 0 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-05-23T00:00:00.000Z"
  }, "2026-05-23T00:00:00.000Z");
  record.id = id;
  record.status = status;
  if (status === "succeeded") {
    record.latestCapture = {
      analysis: {
        id: "analysis-1",
        capture_id: `capture-${id}`,
        status: "succeeded",
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 1,
        clusters: [],
        evidence: [],
        metrics: {},
        generated_at: "2026-05-23T00:00:00.000Z",
        last_error: null,
        created_at: "2026-05-23T00:00:00.000Z",
        updated_at: "2026-05-23T00:00:00.000Z"
      }
    } as SessionItem["latestCapture"];
  }
  return record;
}

test("TopicsListView renders the five audit states with distinct status copy", () => {
  const topics = [
    topic("ready", "已完成議題"),
    topic("running", "生成中議題"),
    topic("none", "未生成議題"),
    topic("failed", "失敗議題"),
    topic("stale", "過期議題")
  ];

  const html = renderToStaticMarkup(
    React.createElement(TopicsListView, {
      topics,
      auditSummariesByTopicId: {
        ready: { reportStatus: "ready", analyzedCount: 3, queuedCount: 0 },
        running: { reportStatus: "running", analyzedCount: 1, queuedCount: 2, runningStage: 3 },
        none: { reportStatus: "none", analyzedCount: 0, queuedCount: 3 },
        failed: { reportStatus: "failed", analyzedCount: 1, queuedCount: 2, failedStage: 4 },
        stale: { reportStatus: "stale", analyzedCount: 3, queuedCount: 0, staleDelta: { added: 2, removed: 0 } }
      },
      onOpenTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /data-topics-list="audit"/);
  assert.match(html, /報告 已生成/);
  assert.match(html, /報告 生成中/);
  assert.match(html, /P3/);
  assert.match(html, /報告 未生成/);
  assert.match(html, /報告 失敗/);
  assert.match(html, /P4/);
  assert.match(html, /報告 過期/);
  assert.match(html, /\+2/);
  assert.match(html, /待處理/);
  assert.doesNotMatch(html, />queued</);
});

test("TopicsListView source metrics come from real session item readiness, not audit memo counts", () => {
  const currentTopic = topic("topic-1", "議題一");
  const html = renderToStaticMarkup(
    React.createElement(TopicsListView, {
      topics: [currentTopic],
      signals: [
        signal("topic-1-signal-1", "topic-1", "item-ready"),
        signal("topic-1-signal-2", "topic-1", "item-queued"),
        signal("topic-1-signal-3", "topic-1", "item-saved")
      ],
      sessionItems: [item("item-ready", "succeeded"), item("item-queued", "queued"), item("item-saved", "saved")],
      auditSummariesByTopicId: {
        "topic-1": { reportStatus: "failed", analyzedCount: 0, queuedCount: 3, failedStage: 1 }
      },
      onOpenTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /1\/3/);
  assert.match(html, /已完成/);
  assert.match(html, /處理中/);
  assert.match(html, /待處理/);
  assert.match(html, /報告 失敗/);
});

test("TopicsListView create action routes to collect triage", () => {
  let opened = "";
  let createCalls = 0;
  const card = topicsListViewTestables.TopicCard({
    topic: topic("topic-1", "議題一"),
    summary: { reportStatus: "ready", analyzedCount: 2, queuedCount: 1 },
    onOpenTopic: (topicId) => {
      opened = topicId;
    }
  });
  const button = topicsListViewTestables.NewTopicButton({
    onCreateTopic: () => {
      createCalls += 1;
    }
  });

  card.props.onClick();
  button.props.onClick();

  assert.equal(opened, "topic-1");
  assert.equal(createCalls, 1);
});
