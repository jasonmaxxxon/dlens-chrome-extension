import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { BUILD_VERSION } from "../src/ui/version.ts";
import {
  DLENS_BUTTON_CSS,
  ModeHeader,
  ModeRail,
  PreviewCard,
  SCAN_ROW_HOVER_CSS,
  WorkspaceSurface,
  WorkspaceShell,
  UtilityEdge,
  scanRowStyle
} from "../src/ui/components.tsx";
import { tokens } from "../src/ui/tokens.ts";

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
  assert.match(SCAN_ROW_HOVER_CSS, /\[data-dlens-control="true"\] \[data-scan-list\] \[data-scan-row\]:hover/);
  assert.doesNotMatch(SCAN_ROW_HOVER_CSS, /^\[data-scan-list\]/m);
});

test("shared button motion CSS is scoped to the extension root", () => {
  assert.match(DLENS_BUTTON_CSS, /\[data-dlens-control="true"\] \[data-dlens-button\]/);
  assert.match(DLENS_BUTTON_CSS, /translateY\(-3px\)/);
  assert.match(DLENS_BUTTON_CSS, /scale\(0\.93\)/);
  assert.match(DLENS_BUTTON_CSS, /prefers-reduced-motion/);
  assert.match(DLENS_BUTTON_CSS, /animation: none !important/);
  assert.doesNotMatch(DLENS_BUTTON_CSS, /^\[data-dlens-button\]/m);
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

  assert.match(html, new RegExp(`v\\.${BUILD_VERSION.replaceAll(".", "\\.")}`));
  assert.match(html, /Folder: dlens-product-latest/);
  assert.match(html, /data-shell-frame="editorial"[^>]*align-items:start/);
  assert.match(html, /data-shell-header="workspace"[^>]*align-self:start/);
});

test("ModeHeader uses the Topic list intro grammar across modes", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModeHeader, {
      mode: "saved-signals",
      kicker: "Product mode",
      title: "Saved Signals",
      deck: "Read the real inbox state."
    })
  );

  assert.match(html, /data-mode-header="saved-signals"/);
  assert.match(html, /data-mode-intro="topic"/);
  assert.match(html, /padding:10px 4px 0/);
  assert.doesNotMatch(html, /data-mode-header="saved-signals"[^>]*border-radius:20px/);
  assert.doesNotMatch(html, /data-mode-header="saved-signals"[^>]*0 4px 14px -4px rgba\(27,26,23,0\.07\)/);
  assert.match(html, /Saved Signals<\/h2>/);
  assert.match(html, /font-weight:900/);
});

test("WorkspaceShell renders masthead WorkspaceSwitcher when onSwitchWorkspace is wired", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "saved-signals",
        folderMode: "product",
        onSwitchWorkspace: () => {},
        availableWorkspaceModes: ["topic", "product", "pr-evidence"] as const,
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, /data-workspace-switcher="segmented"/);
  assert.match(html, /data-workspace-switcher-mode="topic"/);
  assert.match(html, /data-workspace-switcher-mode="product"/);
  assert.match(html, /data-workspace-switcher-mode="pr-evidence"/);
  // Active button is marked aria-selected="true" — and it's the Product one
  assert.match(html, /aria-selected="true"\s+data-workspace-switcher-mode="product"/);
  assert.match(html, /data-workspace-switcher-motion="verdict"/);
  assert.match(html, /scale\(1\.04\)/);
  assert.match(html, /transition:transform 220ms/);
  // Static mode badge should not render alongside the switcher
  assert.doesNotMatch(html, /data-mode-badge="product"/);
});

test("WorkspaceShell WorkspaceSwitcher active tabs use each mode accent", () => {
  const topicHtml = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "topics",
        folderMode: "topic",
        onSwitchWorkspace: () => {},
        availableWorkspaceModes: ["topic", "product", "pr-evidence"] as const,
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );
  const prHtml = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "pr-evidence",
        folderMode: "pr-evidence",
        onSwitchWorkspace: () => {},
        availableWorkspaceModes: ["topic", "product", "pr-evidence"] as const,
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  const activeTopicTab = topicHtml.match(/aria-selected="true"[^>]+data-workspace-switcher-mode="topic"[^>]+/)?.[0];
  const activePrTab = prHtml.match(/aria-selected="true"[^>]+data-workspace-switcher-mode="pr-evidence"[^>]+/)?.[0];

  assert.ok(activeTopicTab);
  assert.ok(activePrTab);
  assert.match(activeTopicTab, new RegExp(`color:${tokens.color.cyan};background:${tokens.color.cyan}14;border:1px solid ${tokens.color.cyan}40`));
  assert.match(activePrTab, new RegExp(`color:${tokens.color.techniqueRose};background:${tokens.color.techniqueRose}14;border:1px solid ${tokens.color.techniqueRose}40`));
});

test("WorkspaceShell marks a pending workspace switch immediately", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "saved-signals",
        folderMode: "product",
        onSwitchWorkspace: () => {},
        availableWorkspaceModes: ["topic", "product", "pr-evidence"] as const,
        switchingWorkspaceMode: "pr-evidence",
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, /data-workspace-switcher-pending="pr-evidence"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-selected="true"[^>]+data-workspace-switcher-mode="pr-evidence"[^>]+disabled=""/);
  assert.match(html, /PR\.\.\./);
});

test("WorkspaceShell PR-only build renders WorkspaceSwitcher as a static PR badge", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "pr-evidence",
        folderMode: "pr-evidence",
        onSwitchWorkspace: () => {},
        availableWorkspaceModes: ["pr-evidence"] as const,
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, /data-workspace-switcher="static"/);
  assert.match(html, /data-workspace-switcher-mode="pr-evidence"/);
  assert.match(html, /PR MODE/);
  assert.doesNotMatch(html, /data-workspace-switcher-mode="topic"/);
  assert.doesNotMatch(html, /data-workspace-switcher-mode="product"/);
});

test("WorkspaceShell falls back to static mode badge when no switcher is wired", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "topics",
        folderMode: "topic",
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, /data-mode-badge="topic"/);
  assert.match(html, /TOPIC MODE/);
  assert.doesNotMatch(html, /data-workspace-switcher=/);
});

test("WorkspaceShell does not reserve an empty processing strip by default", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "topics",
        folderMode: "topic",
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.doesNotMatch(html, /data-shell-context-strip="processing"/);
  assert.doesNotMatch(html, /min-height:52px/);
});

test("WorkspaceShell can reserve the processing strip only when requested", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "compare",
        folderMode: "topic",
        reserveContextStrip: true,
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, /data-shell-context-strip="processing"/);
  assert.match(html, /data-strip-visible="false"/);
  assert.match(html, /min-height:52px/);
});
