import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { InPageCollectorOverlays, inPageCollectorOverlaysTestables } from "../src/ui/InPageCollectorOverlays.tsx";

function descriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/a",
    post_url: "https://www.threads.net/@alpha/post/a",
    author_hint: "alpha",
    text_snippet: "保存成功後應該顯示這篇貼文的摘要和真實互動數字。",
    time_token_hint: "1h",
    dom_anchor: "card-a",
    engagement: { likes: 18, comments: 4, reposts: null, forwards: 2, views: null },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: false },
    captured_at: "2026-05-23T00:00:00.000Z",
    ...overrides
  };
}

test("InPageCollectorOverlays renders a saved-post success popup with metric strip", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        snapshot: null,
        tabId: 1,
        hoverRect: null,
        hoverSaved: false,
        flashPreview: null,
        flashStyle: null,
        displayToast: {
          id: "saved-1",
          kind: "saved",
          message: "已儲存到：Signals"
        },
        successToastDescriptor: descriptor(),
        preview: null,
        popupOpen: true,
        onTogglePopup: () => undefined,
        onSavePreview: () => undefined,
        openPreview: () => undefined
      } as never
    })
  );

  assert.match(html, /data-collector-success-popup="true"/);
  assert.match(html, /data-collector-success-dot="true"/);
  assert.match(html, /data-collector-metric-strip="success"/);
  assert.match(html, /保存成功後應該顯示這篇貼文/);
  assert.match(html, />18</);
  assert.match(html, />4</);
  assert.match(html, />–</);
  assert.match(html, /dlens-success-pulse/);
});

test("InPageCollectorOverlays renders the hover preview with the collector metric strip", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        snapshot: {
          tab: {
            selectionMode: true,
            collectModeBannerVisible: false,
            hoveredTargetStrength: "strong"
          }
        },
        tabId: 1,
        hoverRect: null,
        hoverSaved: false,
        flashPreview: descriptor(),
        flashStyle: { position: "fixed", left: 24, top: 48, width: 248 },
        displayToast: null,
        successToastDescriptor: null,
        preview: null,
        popupOpen: false,
        onTogglePopup: () => undefined,
        onSavePreview: () => undefined,
        openPreview: () => undefined
      } as never
    })
  );

  assert.match(html, /data-collector-metric-strip="hover-preview"/);
  assert.match(html, /data-collector-metric="likes"/);
  assert.match(html, /data-collector-metric="comments"/);
  assert.match(html, /data-collector-metric="reposts"/);
  assert.match(html, /data-collector-metric="forwards"/);
  assert.match(html, /保存成功後應該顯示這篇貼文/);
});

test("InPageCollectorOverlays renders topic destination chips inside the hover preview", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        snapshot: {
          tab: {
            selectionMode: true,
            collectModeBannerVisible: false,
            hoveredTargetStrength: "strong",
            collectionTopicId: "topic-2"
          }
        },
        tabId: 1,
        activeFolderMode: "topic",
        hoverRect: null,
        hoverSaved: false,
        flashPreview: descriptor(),
        flashStyle: { position: "fixed", left: 24, top: 48, width: 320 },
        displayToast: null,
        successToastDescriptor: null,
        preview: null,
        popupOpen: false,
        topics: [
          { id: "topic-1", name: "航班爭議", signalIds: ["signal-1"] },
          { id: "topic-2", name: "機票促銷", signalIds: ["signal-2", "signal-3"] }
        ],
        signals: [
          { id: "signal-1", inboxStatus: "assigned", topicId: "topic-1" },
          { id: "signal-2", inboxStatus: "assigned", topicId: "topic-2" },
          { id: "signal-3", inboxStatus: "unprocessed" }
        ],
        selectedTopicId: null,
        collectTargetTopicId: "topic-2",
        onTogglePopup: () => undefined,
        onSavePreview: () => undefined,
        openPreview: () => undefined,
        onSelectTopicTarget: () => undefined,
        onCreateTopic: () => undefined
      } as never
    })
  );

  assert.match(html, /data-collector-topic-picker="true"/);
  assert.match(html, /data-collector-topic-chip="untriaged"/);
  assert.match(html, /data-collector-topic-chip="topic-1"/);
  assert.match(html, /data-collector-topic-chip="topic-2"/);
  assert.match(html, /data-collector-topic-chip-selected="topic-2"/);
  assert.match(html, /存入 · 機票促銷/);
  assert.match(html, /未分流/);
  assert.match(html, /＋新議題/);
});

test("InPageCollectorOverlays does not render topic destination chips outside topic mode", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        snapshot: {
          tab: {
            selectionMode: true,
            collectModeBannerVisible: false,
            hoveredTargetStrength: "strong"
          }
        },
        tabId: 1,
        activeFolderMode: "product",
        hoverRect: null,
        hoverSaved: false,
        flashPreview: descriptor(),
        flashStyle: { position: "fixed", left: 24, top: 48, width: 248 },
        displayToast: null,
        successToastDescriptor: null,
        preview: null,
        popupOpen: false,
        topics: [{ id: "topic-1", name: "航班爭議", signalIds: ["signal-1"] }],
        signals: [],
        selectedTopicId: "topic-1",
        collectTargetTopicId: "topic-1",
        onTogglePopup: () => undefined,
        onSavePreview: () => undefined,
        openPreview: () => undefined,
        onSelectTopicTarget: () => undefined,
        onCreateTopic: () => undefined
      } as never
    })
  );

  assert.doesNotMatch(html, /data-collector-topic-picker="true"/);
});

test("InPageCollectorOverlays honors an explicit untriaged destination over a stale snapshot topic", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        snapshot: {
          tab: {
            selectionMode: true,
            collectModeBannerVisible: false,
            hoveredTargetStrength: "strong",
            collectionTopicId: "topic-2"
          }
        },
        tabId: 1,
        activeFolderMode: "topic",
        hoverRect: null,
        hoverSaved: false,
        flashPreview: descriptor(),
        flashStyle: { position: "fixed", left: 24, top: 48, width: 320 },
        displayToast: null,
        successToastDescriptor: null,
        preview: null,
        popupOpen: false,
        topics: [{ id: "topic-2", name: "機票促銷", signalIds: [] }],
        signals: [{ id: "signal-3", inboxStatus: "unprocessed" }],
        selectedTopicId: null,
        collectTargetTopicId: null,
        onTogglePopup: () => undefined,
        onSavePreview: () => undefined,
        openPreview: () => undefined,
        onSelectTopicTarget: () => undefined,
        onCreateTopic: () => undefined
      } as never
    })
  );

  assert.match(html, /data-collector-topic-chip-selected="untriaged"/);
  assert.match(html, /存入 · 未分流/);
  assert.doesNotMatch(html, /data-collector-topic-chip-selected="topic-2"/);
});

test("InPageCollectorOverlays preview card can render the inline saved success state", () => {
  const html = renderToStaticMarkup(
    inPageCollectorOverlaysTestables.renderFlashPreviewCard({
      descriptor: descriptor(),
      hoverSaved: false,
      mode: "topic",
      topics: [{ id: "topic-1", name: "航班爭議", signalIds: ["signal-1"] }],
      signals: [],
      selectedTopicId: "topic-1",
      collectionTopicId: null,
      success: {
        targetName: "航班爭議",
        detail: "已加入議題，下一步可在 Casebook 排程分析。"
      },
      onSave: () => undefined,
      onOpen: () => undefined,
      onSelectTopicTarget: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /data-collector-success-flip="true"/);
  assert.match(html, /✓ 已存入 · 航班爭議/);
  assert.match(html, /已加入議題/);
  assert.match(html, /data-collector-metric-strip="success-inline"/);
  assert.doesNotMatch(html, /data-collector-topic-picker="true"/);
});
