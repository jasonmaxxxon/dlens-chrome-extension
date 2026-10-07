import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { InPageCollectorOverlays } from "../src/ui/InPageCollectorOverlays.tsx";

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
  assert.match(html, /dlens-success-pop/);
});

test("InPageCollectorOverlays ignores legacy hover preview snapshots after inline collection replaces selection", () => {
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

  assert.doesNotMatch(html, /data-collector-metric-strip="hover-preview"/);
  assert.doesNotMatch(html, /保存成功後應該顯示這篇貼文/);
  assert.match(html, /__dlens_extension_v0_launcher__/);
});

test("InPageCollectorOverlays does not duplicate wheel destinations in a legacy topic hover card", () => {
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

  assert.doesNotMatch(html, /data-collector-topic-picker|data-collector-topic-chip/);
  assert.doesNotMatch(html, /存入 ·|＋新議題/);
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

test("InPageCollectorOverlays does not revive legacy destination controls from a stale topic selection", () => {
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

  assert.doesNotMatch(html, /data-collector-topic-chip-selected|存入 · 未分流/);
});

test("InPageCollectorOverlays removes the old selection banner and hovered-post badge", () => {
  const html = renderToStaticMarkup(React.createElement(InPageCollectorOverlays, {
    app: {
      snapshot: { tab: { selectionMode: true, collectModeBannerVisible: true } },
      hoverRect: { top: 50, right: 300 }, hoverSaved: true,
      flashPreview: descriptor(), flashStyle: { position: "fixed", left: 0, top: 0 },
      displayToast: null, popupOpen: false, onTogglePopup: () => undefined
    } as never
  }));
  assert.doesNotMatch(html, /Hover to preview|Preview only|>Saved<|>Ready<|data-collector-success-flip/);
  assert.match(html, /Open DLens popup/);
});

test("InPageCollectorOverlays offers undo inside the save toast while the window is open", () => {
  const baseApp = {
    snapshot: null,
    tabId: 1,
    hoverRect: null,
    hoverSaved: false,
    flashPreview: null,
    flashStyle: null,
    displayToast: { id: "saved-1", kind: "saved", message: "已儲存到：Signals" },
    successToastDescriptor: null,
    preview: null,
    popupOpen: true,
    onTogglePopup: () => undefined,
    onSavePreview: () => undefined,
    openPreview: () => undefined,
    onUndoSave: () => undefined
  };

  const withUndo = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        ...baseApp,
        pendingUndoSave: { toastId: "saved-1", sessionId: "session-1", itemId: "item-1" }
      } as never
    })
  );
  assert.match(withUndo, /data-collector-undo-save="true"/);
  assert.match(withUndo, /復原/);

  const withoutUndo = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, { app: { ...baseApp, pendingUndoSave: null } as never })
  );
  assert.doesNotMatch(withoutUndo, /data-collector-undo-save="true"/);
});

test("InPageCollectorOverlays keeps undo off a toast that is not a save", () => {
  const html = renderToStaticMarkup(
    React.createElement(InPageCollectorOverlays, {
      app: {
        snapshot: null,
        tabId: 1,
        hoverRect: null,
        hoverSaved: false,
        flashPreview: null,
        flashStyle: null,
        displayToast: { id: "queued-1", kind: "queued", message: "已加入隊列：Signals" },
        successToastDescriptor: null,
        pendingUndoSave: { toastId: "saved-1", sessionId: "session-1", itemId: "item-1" },
        preview: null,
        popupOpen: true,
        onTogglePopup: () => undefined,
        onSavePreview: () => undefined,
        openPreview: () => undefined,
        onUndoSave: () => undefined
      } as never
    })
  );
  assert.doesNotMatch(html, /data-collector-undo-save="true"/);
});
