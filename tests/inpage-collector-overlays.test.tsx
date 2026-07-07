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
