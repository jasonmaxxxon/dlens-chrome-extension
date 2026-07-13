import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import type { Signal, SignalTagsRecord } from "../src/state/types.ts";
import { CollectView, collectViewTestables } from "../src/ui/CollectView.tsx";

const signals: Signal[] = [
  { id: "signal-1", sessionId: "session-1", itemId: "item-1", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-23T00:00:00.000Z" },
  { id: "signal-2", sessionId: "session-1", itemId: "item-2", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-23T00:00:00.000Z" },
  { id: "signal-3", sessionId: "session-1", itemId: "item-3", source: "threads", inboxStatus: "unprocessed", capturedAt: "2026-05-23T00:00:00.000Z" }
];

const tagsByItemId: Record<string, SignalTagsRecord> = {
  "item-1": { itemId: "item-1", status: "complete", signalTags: ["航班", "客服"], signalGist: "航班改動後的客服抱怨", promptVersion: "v1", model: "mock", generatedAt: "2026-05-23T00:00:00.000Z" },
  "item-2": { itemId: "item-2", status: "complete", signalTags: ["退款"], signalGist: "退款流程卡住", promptVersion: "v1", model: "mock", generatedAt: "2026-05-23T00:00:00.000Z" }
};

function descriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/a",
    post_url: "https://www.threads.net/@alpha/post/a",
    author_hint: "alpha",
    text_snippet: "AI 工具工作流需要一個可以快速保存、回看和交給 agent 的 collector。",
    time_token_hint: "1h",
    dom_anchor: "card-a",
    engagement: { likes: 10, comments: 5, reposts: 1, forwards: 0, views: null },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: false },
    captured_at: "2026-05-23T00:00:00.000Z",
    ...overrides
  };
}

test("CollectView shows topic triage rows for unprocessed signals", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: null,
      folderName: "Topics",
      mode: "topic",
      isSaved: false,
      selectionMode: false,
      untriagedSignals: signals,
      signalPreviewById: {
        "signal-1": "航班改動後等不到客服",
        "signal-2": "退款流程卡住",
        "signal-3": "沒有標籤的訊號"
      },
      signalTagsByItemId: tagsByItemId,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined,
      onCreateTopicFromSignals: () => undefined
    })
  );

  assert.match(html, /data-topic-triage="untriaged"/);
  assert.match(html, /data-untriaged-row="signal-1"[^>]*class="dlens-card-lift"/);
  assert.match(html, /未分流/);
  assert.match(html, /航班改動後等不到客服/);
  assert.match(html, /航班/);
  assert.match(html, /建立議題需要 ≥ 3/);
});

test("CollectView renders per-row and bulk delete for untriaged signals when onSignalDeleted is provided", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: null,
      folderName: "Topics",
      mode: "topic",
      isSaved: false,
      selectionMode: false,
      untriagedSignals: signals,
      signalPreviewById: { "signal-1": "航班改動後等不到客服" },
      signalTagsByItemId: tagsByItemId,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined,
      onCreateTopicFromSignals: () => undefined,
      onSignalDeleted: () => undefined
    })
  );

  assert.match(html, /data-untriaged-delete="signal-1"/);
  assert.match(html, /data-untriaged-delete-selected="true"/);
});

test("CollectView omits untriaged delete controls when onSignalDeleted is absent", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: null,
      folderName: "Topics",
      mode: "topic",
      isSaved: false,
      selectionMode: false,
      untriagedSignals: signals,
      signalPreviewById: {},
      signalTagsByItemId: tagsByItemId,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined,
      onCreateTopicFromSignals: () => undefined
    })
  );

  assert.doesNotMatch(html, /data-untriaged-delete=/);
  assert.doesNotMatch(html, /data-untriaged-delete-selected/);
});

test("CollectView folds collect mode controls into the collector panel header and footer", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView, {
      preview: descriptor(),
      folderName: "Signals",
      mode: "archive",
      isSaved: false,
      selectionMode: true,
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /data-collector-panel-header="true"/);
  assert.match(html, /data-collector-status="capturing"/);
  assert.match(html, /data-collector-target-chip="true"/);
  assert.match(html, /data-collector-mode-toggle="true"/);
  assert.match(html, /data-collector-key-hints="true"/);
  assert.match(html, /採集中/);
  assert.doesNotMatch(html, /收集模式：開啟/);
  // The masthead owns the wordmark; the collector hero must not restate it.
  assert.doesNotMatch(html, /DLens/);
});

test("CollectView renders recent captures with real descriptor metrics and missing markers", () => {
  const first = createSessionItem(descriptor({
    post_url: "https://www.threads.net/@alpha/post/recent-1",
    text_snippet: "最近保存的第一篇貼文，應該出現在 panel row。",
    engagement: { likes: 42, comments: 7, reposts: null, forwards: 3, views: null },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: false }
  }), "2026-05-23T00:03:00.000Z");
  first.id = "recent-1";
  const second = createSessionItem(descriptor({
    post_url: "https://www.threads.net/@alpha/post/recent-2",
    text_snippet: "第二篇保存貼文也需要列出真正的互動數字。",
    engagement: { likes: null, comments: null, reposts: 2, forwards: null, views: null },
    engagement_present: { likes: false, comments: false, reposts: true, forwards: false, views: false }
  }), "2026-05-23T00:02:00.000Z");
  second.id = "recent-2";

  const html = renderToStaticMarkup(
    React.createElement(CollectView as React.ComponentType<Record<string, unknown>>, {
      preview: descriptor(),
      folderName: "Signals",
      mode: "archive",
      isSaved: false,
      selectionMode: true,
      recentItems: [second, first],
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /data-collector-recent-captures="true"/);
  assert.match(html, /data-collector-recent-row="recent-1"/);
  assert.match(html, /data-collector-recent-row="recent-2"/);
  assert.match(html, /data-collector-metric-strip="recent-1"/);
  assert.match(html, /data-collector-metric="likes"/);
  assert.match(html, /data-collector-metric="comments"/);
  assert.match(html, /data-collector-metric="reposts"/);
  assert.match(html, /data-collector-metric="forwards"/);
  assert.match(html, />42</);
  assert.match(html, />7</);
  assert.match(html, />–</);
  assert.doesNotMatch(html, />999</);
});

test("CollectView renders a processing strip with a real n/m counter only while work is in flight", () => {
  const html = renderToStaticMarkup(
    React.createElement(CollectView as React.ComponentType<Record<string, unknown>>, {
      preview: descriptor(),
      folderName: "Signals",
      mode: "archive",
      isSaved: false,
      selectionMode: true,
      processingSummary: {
        total: 5,
        ready: 2,
        crawling: 1,
        analyzing: 1,
        pending: 1,
        failed: 0,
        hasReadyPair: false,
        hasInflight: true
      },
      onSavePreview: () => undefined,
      onOpenPreview: () => undefined,
      onToggleCollectMode: () => undefined
    })
  );

  assert.match(html, /data-collector-processing-strip="true"/);
  assert.match(html, /data-collector-processing-counter="true"/);
  assert.match(html, />2\/5</);
  assert.match(html, /dlens-popup-indeterminate/);
});

test("collect triage helper requires at least three selected signals", () => {
  assert.equal(collectViewTestables.canCreateTopicFromSelection(["signal-1", "signal-2"]), false);
  assert.equal(collectViewTestables.canCreateTopicFromSelection(["signal-1", "signal-2", "signal-3"]), true);
  assert.deepEqual(collectViewTestables.suggestTagsForSignal(signals[0]!, tagsByItemId), ["航班", "客服"]);
});
