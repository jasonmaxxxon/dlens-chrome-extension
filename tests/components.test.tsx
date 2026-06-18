import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { BUILD_VERSION } from "../src/ui/version.ts";
import {
  DLENS_BUTTON_CSS,
  EvidenceRow,
  KeyHint,
  ModeHeader,
  ModeRail,
  PreviewCard,
  QuoteBlock,
  SCAN_ROW_HOVER_CSS,
  SectionHeader,
  StatusDot,
  StatusRail,
  SurfaceCard,
  WorkspaceSurface,
  WorkspaceShell,
  WorkspaceSwitcher,
  UtilityEdge,
  scanRowStyle,
  type WorkspaceSwitcherMode
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
  assert.match(html, /data-workspace-switcher-thumb="sliding"/);
  assert.match(html, /data-workspace-switcher-active-index="1"/);
  assert.match(html, /data-workspace-switcher-motion="verdict"/);
  assert.match(html, /scale\(1\.04\)/);
  assert.match(html, /transition:transform 220ms/);
  assert.match(html, /data-shell-key-hints="idle"/);
  // Static mode badge should not render alongside the switcher
  assert.doesNotMatch(html, /data-mode-badge="product"/);
});

test("WorkspaceSwitcher moves by keyboard arrow keys", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    KeyboardEvent: globalThis.KeyboardEvent
  };
  const calls: WorkspaceSwitcherMode[] = [];

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent
  });

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    flushSync(() => {
      root.render(
        React.createElement(WorkspaceSwitcher, {
          activeMode: "topic",
          onChange: (mode) => calls.push(mode)
        })
      );
    });

    const tablist = rootElement.querySelector('[data-workspace-switcher="segmented"]');
    assert.ok(tablist);
    tablist.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    assert.deepEqual(calls, ["product"]);
  } finally {
    flushSync(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    Object.assign(globalThis, previous);
  }
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

test("WorkspaceShell can mount a masthead status rail", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "library",
        folderMode: "archive",
        statusRail: React.createElement(StatusRail, {
          backendReachability: "slow",
          backendWorkUiState: { kind: "analysis_waiting", count: 2 },
          ready: 1,
          total: 4
        }),
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  assert.match(html, /data-shell-status-rail="masthead"/);
  assert.match(html, /data-status-rail="shared"/);
  assert.match(html, /data-backend-reachability="slow"/);
  assert.match(html, /1\/4 ready/);
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

test("SurfaceCard exposes shared utility surface geometry", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      SurfaceCard,
      { tone: "utility", dataAttrs: { "data-test-surface": "card" } },
      React.createElement("div", null, "Shared card")
    )
  );

  assert.match(html, /data-shared-surface-card="utility"/);
  assert.match(html, /data-test-surface="card"/);
  assert.match(html, /border-radius:20px/);
  assert.match(html, /overflow:hidden/);
});

test("SectionHeader keeps section title, caption, and action in one shared row", () => {
  const html = renderToStaticMarkup(
    React.createElement(SectionHeader, {
      title: "已儲存貼文",
      caption: "2 rows",
      action: React.createElement("button", { type: "button" }, "Run")
    })
  );

  assert.match(html, /data-section-header="shared"/);
  assert.match(html, /已儲存貼文/);
  assert.match(html, /2 rows/);
  assert.match(html, /Run/);
  assert.match(html, /Instrument Serif/);
});

test("EvidenceRow renders scan-safe columns without command handlers", () => {
  const html = renderToStaticMarkup(
    React.createElement(EvidenceRow, {
      leading: React.createElement("span", null, "source"),
      author: "alpha",
      body: "Evidence caption",
      metric: "12 likes",
      status: React.createElement("span", null, "C1"),
      meta: "today"
    })
  );

  assert.match(html, /data-shared-evidence-row="true"/);
  assert.match(html, /data-scan-row="true"/);
  assert.match(html, /grid-template-columns:28px minmax\(96px,\s*124px\) minmax\(0,\s*1fr\) minmax\(82px,\s*92px\) minmax\(62px,\s*78px\) 56px/);
  assert.match(html, /alpha/);
  assert.match(html, /Evidence caption/);
  assert.match(html, /12 likes/);
  assert.match(html, /today/);
  assert.doesNotMatch(html, /onClick/);
});

test("StatusDot and StatusRail map backend reachability and work states to DOM hooks", () => {
  const dotHtml = renderToStaticMarkup(
    React.createElement(StatusDot, {
      tone: "danger",
      label: "Backend unreachable"
    })
  );
  const railHtml = renderToStaticMarkup(
    React.createElement(StatusRail, {
      backendReachability: "slow",
      backendWorkUiState: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: null },
      workerStatus: "idle",
      ready: 1,
      total: 3
    })
  );

  assert.match(dotHtml, /data-status-dot="danger"/);
  assert.match(dotHtml, /Backend unreachable/);
  assert.match(railHtml, /data-status-rail="shared"/);
  assert.match(railHtml, /data-backend-reachability="slow"/);
  assert.match(railHtml, /data-backend-work-kind="retry_waiting"/);
  assert.match(railHtml, /1\/3 ready/);
});

test("KeyHint renders keyboard chips without layout prose", () => {
  const html = renderToStaticMarkup(
    React.createElement(KeyHint, {
      label: "Open",
      keys: ["⌘", "K"]
    })
  );

  assert.match(html, /data-key-hint="shared"/);
  assert.match(html, /<kbd/);
  assert.match(html, /⌘/);
  assert.match(html, /K/);
});

test("QuoteBlock uses the editorial quote text style", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      QuoteBlock,
      { cite: "alpha" },
      "This is a cited audience quote."
    )
  );

  assert.match(html, /data-quote-block="shared"/);
  assert.match(html, /font-style:italic/);
  assert.match(html, /This is a cited audience quote/);
  assert.match(html, /alpha/);
});
