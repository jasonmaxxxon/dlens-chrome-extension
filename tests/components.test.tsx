import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import {
  ModeRail,
  PreviewCard,
  SCAN_ROW_HOVER_CSS,
  WorkspaceSurface,
  WorkspaceShell,
  UtilityEdge,
  scanRowStyle
} from "../src/ui/components.tsx";
import { BUILD_VERSION } from "../src/ui/version.ts";

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
  assert.ok(collectIndex >= 0);
  assert.ok(libraryIndex < collectIndex);
});

test("ModeRail keeps collect as the first topic-mode action", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModeRail, {
      activeMode: "collect",
      modes: ["collect", "casebook", "inbox", "compare", "library"],
      onSelect: () => undefined
    })
  );

  const collectIndex = html.indexOf('data-mode="collect"');
  const casebookIndex = html.indexOf('data-mode="casebook"');
  const inboxIndex = html.indexOf('data-mode="inbox"');

  assert.ok(collectIndex >= 0);
  assert.ok(casebookIndex > collectIndex);
  assert.ok(inboxIndex > casebookIndex);
});

test("ModeRail preserves Product mode order so action stays before collect", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModeRail, {
      activeMode: "actionable-filter",
      modes: ["saved-signals", "classification", "actionable-filter", "collect"],
      onSelect: () => undefined
    })
  );

  const savedIndex = html.indexOf('data-mode="saved-signals"');
  const classificationIndex = html.indexOf('data-mode="classification"');
  const actionIndex = html.indexOf('data-mode="actionable-filter"');
  const collectIndex = html.indexOf('data-mode="collect"');

  assert.ok(savedIndex >= 0);
  assert.ok(classificationIndex > savedIndex);
  assert.ok(actionIndex > classificationIndex);
  assert.ok(collectIndex > actionIndex);
});

test("ModeRail uses the design-system rail icon language", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModeRail, {
      activeMode: "collect",
      modes: ["inbox", "compare", "collect", "saved-signals", "classification", "actionable-filter"],
      onSelect: () => undefined
    })
  );

  assert.match(html, /m3 7 9 6 9-6/);
  assert.match(html, /M12 3v18/);
  assert.match(html, /M3 12h18/);
  assert.match(html, /M7 7l-4 5 4 5/);
  assert.match(html, /M17 7l4 5-4 5/);
  assert.match(html, /cx="12" cy="12" r="1.5"/);
  assert.match(html, /M8 9h8/);
  assert.match(html, /x="4" y="4" width="7" height="7"/);
  assert.match(html, /M3 4h18l-7 8v5l-4 2v-7z/);
  assert.doesNotMatch(html, /M7 5h3v14/);
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

test("scan row primitive stays flat and line-separated", () => {
  const style = scanRowStyle({ padding: "12px 4px" });

  assert.equal(style.background, "transparent");
  assert.equal(style.borderBottom, "1px solid rgba(27,26,23,0.10)");
  assert.equal(style.boxShadow, undefined);
  assert.equal(style.borderRadius, undefined);
  assert.equal(style.padding, "12px 4px");
  assert.match(SCAN_ROW_HOVER_CSS, /\[data-scan-list\] \[data-scan-row\]:hover/);
});

test("WorkspaceShell masthead exposes the extension build version", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "library",
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, new RegExp(`v${BUILD_VERSION.replaceAll(".", "\\.")}`));
  assert.match(html, /Folder: dlens-product-latest/);
});
