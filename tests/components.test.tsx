import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import {
  ModeRail,
  PreviewCard,
  WorkspaceSurface,
  UtilityEdge
} from "../src/ui/components.tsx";

function makeDescriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/abc",
    post_url: "https://www.threads.net/@alpha/post/abc?x=1#y",
    author_hint: "alpha",
    text_snippet: "alpha snippet",
    time_token_hint: "1h",
    dom_anchor: "card-1",
    engagement: {
      likes: 12,
      comments: 3,
      reposts: 2,
      forwards: 1,
      views: 100
    },
    engagement_present: {
      likes: true,
      comments: true,
      reposts: true,
      forwards: true,
      views: true
    },
    captured_at: "2026-03-25T10:00:00Z",
    ...overrides
  };
}

test("PreviewCard renders author, folder, saved badge, and metric chips", () => {
  const html = renderToStaticMarkup(
    React.createElement(PreviewCard, {
      descriptor: makeDescriptor(),
      folderName: "Signals",
      isSaved: true,
      onPrimary: () => undefined,
      onOpen: () => undefined
    })
  );

  assert.match(html, /Current post preview/);
  assert.match(html, /alpha/);
  assert.match(html, /Saved/);
  assert.match(html, /Signals/);
  assert.match(html, />12</);
  assert.match(html, />3</);
  assert.match(html, />2</);
  assert.match(html, />1</);
});

test("ModeRail renders only the allowed archive-mode items when a custom rail is supplied", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModeRail, {
      activeMode: "library",
      modes: ["library", "collect"],
      onSelect: () => undefined
    })
  );

  assert.match(html, /data-mode-rail="primary"/);
  assert.match(html, /data-mode="library"/);
  assert.match(html, /data-mode="collect"/);
  assert.doesNotMatch(html, /data-mode="compare"/);
  assert.doesNotMatch(html, /data-mode="casebook"/);
  assert.doesNotMatch(html, /data-mode="inbox"/);
  assert.doesNotMatch(html, /data-mode="result"/);
  assert.doesNotMatch(html, /Settings/);

  const libraryIndex = html.indexOf('data-mode="library"');
  const collectIndex = html.indexOf('data-mode="collect"');

  assert.ok(libraryIndex >= 0);
  assert.ok(libraryIndex < collectIndex);
});

test("UtilityEdge keeps settings outside the primary mode rail", () => {
  const html = renderToStaticMarkup(
    React.createElement(UtilityEdge, {
      active: true,
      onSelect: () => undefined
    })
  );

  assert.match(html, /data-utility-edge="workspace"/);
  assert.match(html, /data-utility-action="settings"/);
  assert.match(html, /設定/);
  assert.doesNotMatch(html, /data-mode-rail="primary"/);
});

test("WorkspaceSurface clips inner content so rounded cards stay rounded", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceSurface,
      null,
      React.createElement("div", null, "Inner content")
    )
  );

  assert.match(html, /data-workspace-surface="content"/);
  assert.match(html, /overflow:hidden/);
});
