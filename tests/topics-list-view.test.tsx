import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SessionItem, Signal, Topic } from "../src/state/types.ts";
import { TopicsListView, topicsListViewTestables } from "../src/ui/TopicsListView.tsx";

function findTagWithAttribute(html: string, attribute: string): string {
  const attributeIndex = html.indexOf(attribute);
  assert.ok(attributeIndex >= 0, `${attribute} must exist`);
  const tagStart = html.lastIndexOf("<", attributeIndex);
  const tagEnd = html.indexOf(">", attributeIndex);
  assert.ok(tagStart >= 0 && tagEnd >= 0, `${attribute} tag must close`);
  return html.slice(tagStart, tagEnd + 1);
}

function styleFromTag(tag: string): string {
  const match = tag.match(/\sstyle="([^"]*)"/);
  assert.ok(match, `${tag} must include inline style`);
  return match[1];
}

function findElementWithProp(node: React.ReactNode, propName: string, value: string): React.ReactElement | null {
  if (!React.isValidElement(node)) {
    return null;
  }
  const props = node.props as Record<string, unknown> & { children?: React.ReactNode };
  if (props[propName] === value) {
    return node;
  }
  for (const child of React.Children.toArray(props.children)) {
    const match = findElementWithProp(child, propName, value);
    if (match) {
      return match;
    }
  }
  return null;
}

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
  assert.match(html, /data-mode-header="topics"/);
  assert.match(html, /data-mode-intro="topic"/);
  assert.match(html, /padding:10px 4px 0/);
  assert.match(html, /READY/);
  assert.match(html, /BUILDING/);
  assert.doesNotMatch(html, /P3/);
  assert.match(html, /QUEUED/);
  assert.match(html, /FAILED/);
  assert.doesNotMatch(html, /P4/);
  assert.match(html, /STALE/);
  assert.match(html, /\+2/);
  assert.match(html, /待處理/);
  assert.doesNotMatch(html, />queued</);
});

test("topic cards use one status slot and expose tactile/list motion hooks", () => {
  const topics = [topic("ready", "敘事穩"), topic("failed", "張力"), topic("none", "待補")];
  const html = renderToStaticMarkup(
    React.createElement(TopicsListView, {
      topics,
      auditSummariesByTopicId: {
        ready: { reportStatus: "ready", analyzedCount: 3, queuedCount: 0 },
        failed: { reportStatus: "failed", analyzedCount: 0, queuedCount: 1 },
        none: { reportStatus: "none", analyzedCount: 0, queuedCount: 2 }
      },
      onOpenTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.doesNotMatch(html, /data-topic-card-spine=/);
  assert.match(html, /data-topic-list-motion="causal"/);
  assert.match(html, /data-dlens-list-key="ready"/);
  assert.match(html, /data-topic-card="ready"[^>]*class="dlens-card-lift"/);
});

test("TopicsListView source metrics come from real session item readiness, not audit memo counts", () => {
  const currentTopic = {
    ...topic("topic-1", "議題一"),
    tags: ["客服", "航班"]
  };
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
  assert.match(html, /data-topic-source-progress="true"/);
  assert.match(html, /data-topic-source-progress-ready="true"/);
  assert.match(html, /data-topic-source-progress-processing="true"/);
  assert.match(html, /data-topic-completion-progress="true"/);
  assert.match(html, /data-topic-completion-label="true"/);
  assert.match(html, /已完成 1\/3/);
  assert.match(html, /data-topic-completion-bar-fill="true"[^>]*width:33\.33333333333333%/);
  assert.match(html, /data-topic-card-updated-at="true"/);
  assert.match(html, /更新 05-23/);
  assert.match(html, /data-topic-card-tag="客服"/);
  assert.match(html, /data-topic-card-tag="航班"/);
  assert.match(html, /data-topic-source-queue="pending"/);
  assert.match(html, /1 待處理/);
  assert.match(html, /FAILED/);
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

test("TopicsListView exposes a topic remove action without opening the topic", () => {
  let opened = "";
  let deleted = "";
  let propagationStopped = 0;
  const card = topicsListViewTestables.TopicCard({
    topic: topic("topic-1", "議題一"),
    summary: { reportStatus: "ready", analyzedCount: 2, queuedCount: 1 },
    onOpenTopic: (topicId) => {
      opened = topicId;
    },
    onDeleteTopic: (topicId) => {
      deleted = topicId;
    }
  });

  const deleteButton = findElementWithProp(card, "data-topic-delete-button", "true");

  assert.ok(deleteButton, "topic card must render a delete affordance");
  const deleteProps = deleteButton.props as { onClick: (event: { stopPropagation: () => void }) => void };
  deleteProps.onClick({
    stopPropagation: () => {
      propagationStopped += 1;
    }
  });

  assert.equal(deleted, "topic-1");
  assert.equal(opened, "");
  assert.equal(propagationStopped, 1);
});

test("TopicsListView keeps topic cards and delete actions inside the content width", () => {
  const html = renderToStaticMarkup(
    React.createElement(TopicsListView, {
      topics: [topic("topic-1", "一個很長很長的議題名稱用來檢查右側邊界")],
      auditSummariesByTopicId: {
        "topic-1": { reportStatus: "ready", analyzedCount: 2, queuedCount: 1 }
      },
      onOpenTopic: () => undefined,
      onCreateTopic: () => undefined,
      onDeleteTopic: () => undefined
    })
  );

  const cardStyle = styleFromTag(findTagWithAttribute(html, `data-topic-card="topic-1"`));
  const actionStyle = styleFromTag(findTagWithAttribute(html, `data-topic-card-actions="true"`));
  const deleteStyle = styleFromTag(findTagWithAttribute(html, `data-topic-delete-button="true"`));
  const newTopicStyle = styleFromTag(findTagWithAttribute(html, `data-new-topic-button="triage"`));

  assert.match(cardStyle, /box-sizing:border-box/);
  assert.match(cardStyle, /max-width:100%/);
  assert.match(cardStyle, /overflow:hidden/);
  assert.match(actionStyle, /min-width:0/);
  assert.doesNotMatch(deleteStyle, /position:absolute/);
  assert.match(newTopicStyle, /box-sizing:border-box/);
  assert.match(newTopicStyle, /max-width:100%/);
});
