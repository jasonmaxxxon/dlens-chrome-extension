import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { BUILD_VERSION } from "../src/ui/version.ts";
import {
  DLENS_BUTTON_CSS,
  EvidenceRow,
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
import { LanguageProvider } from "../src/ui/i18n.ts";
import { tokens } from "../src/ui/tokens.ts";

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

test("ModeRail rail labels stay 繁中 by default and switch to English under the language provider", () => {
  const railModes = ["collect", "topics", "inbox"] as const;
  const zhHtml = renderToStaticMarkup(
    React.createElement(ModeRail, { activeMode: "collect", modes: [...railModes], onSelect: () => undefined })
  );
  assert.match(zhHtml, /採集/);
  assert.match(zhHtml, /議題/);
  assert.doesNotMatch(zhHtml, /Collect/);

  const enHtml = renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      { value: "en" },
      React.createElement(ModeRail, { activeMode: "collect", modes: [...railModes], onSelect: () => undefined })
    )
  );
  assert.match(enHtml, /Collect/);
  assert.match(enHtml, /Topics/);
  assert.match(enHtml, /Inbox/);
  assert.doesNotMatch(enHtml, /採集/);
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
  assert.match(styleFromTag(findTagWithAttribute(html, `data-workspace-surface="content"`)), new RegExp(`border:1px solid ${tokens.color.cardEdge.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("WorkspaceSurface opaque tones retain the shared card edge", () => {
  for (const tone of ["utility", "focused"] as const) {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceSurface, { tone }, React.createElement("div", null, tone))
    );
    const style = styleFromTag(findTagWithAttribute(html, `data-workspace-surface="${tone}"`));
    assert.match(style, new RegExp(`border:1px solid ${tokens.color.cardEdge.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("scan row primitive stays flat and line-separated", () => {
  const style = scanRowStyle({ padding: "12px 4px" });

  assert.equal(style.background, "transparent");
  assert.equal(style.borderBottom, "1px solid rgba(27,26,23,0.10)");
  assert.equal(style.boxShadow, undefined);
  assert.equal(style.borderRadius, undefined);
  assert.equal(style.padding, "12px 4px");
  assert.equal(
    style.transition,
    undefined,
    "the scan-row primitive must not override tactile card transform and shadow transitions inline"
  );
  assert.match(SCAN_ROW_HOVER_CSS, /data-scan-row[^}]*transition:\s*background-color/);
  assert.match(SCAN_ROW_HOVER_CSS, /\[data-dlens-control="true"\] \[data-scan-list\] \[data-scan-row\]\[data-scan-action="true"\]:hover/);
  assert.doesNotMatch(SCAN_ROW_HOVER_CSS, /\[data-scan-row\]:hover/);
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
  assert.match(html, /data-shell-version="masthead"/);
  // Static mode badge should not render alongside the switcher
  assert.doesNotMatch(html, /data-mode-badge="product"/);
});

test("WorkspaceSwitcher sizes the sliding thumb from the same equal tracks as the tabs", () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkspaceSwitcher, {
      activeMode: "product",
      onChange: () => undefined
    })
  );

  const switcherTag = html.match(/<div[^>]+data-workspace-switcher="segmented"[^>]*>/)?.[0];
  const thumbTag = html.match(/<span[^>]+data-workspace-switcher-thumb="sliding"[^>]*>/)?.[0];
  const productTag = html.match(/<button[^>]+data-workspace-switcher-mode="product"[^>]*>/)?.[0];
  assert.ok(switcherTag);
  assert.ok(thumbTag);
  assert.ok(productTag);
  const switcherStyle = styleFromTag(switcherTag);
  const thumbStyle = styleFromTag(thumbTag);
  const productStyle = styleFromTag(productTag);

  assert.match(switcherStyle, /display:inline-grid/);
  assert.match(switcherStyle, /grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(thumbStyle, /width:calc\(\(100% - 8px\) \/ 3\)/);
  assert.match(thumbStyle, /transform:translateX\(calc\(100% \+ 2px\)\)/);
  assert.match(productStyle, /width:100%/);
});

test("WorkspaceSwitcher moves by keyboard arrow keys", async () => {
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const reactActGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
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
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(
        React.createElement(WorkspaceSwitcher, {
          activeMode: "topic",
          onChange: (mode) => calls.push(mode)
        })
      );
    });

    const tablist = rootElement.querySelector('[data-workspace-switcher="segmented"]');
    assert.ok(tablist);
    await act(async () => {
      tablist.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    assert.deepEqual(calls, ["product"]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    else reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

test("WorkspaceShell hides the stale body while workspace mode is switching", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "pr-evidence",
        folderMode: "pr-evidence",
        onSwitchWorkspace: () => undefined,
        switchingWorkspaceMode: "product",
        availableWorkspaceModes: ["topic", "product", "pr-evidence"] as const,
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Old PR Evidence body")
    )
  );

  assert.match(html, /data-workspace-switching="product"/);
  assert.match(html, /data-workspace-mode="product"/);
  assert.doesNotMatch(html, /Old PR Evidence body/);
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

test("WorkspaceShell exposes one shared glass material across masthead, rail, and main frame", () => {
  const glass = (tokens as unknown as {
    material?: { workspaceGlass?: { panel?: string; blur?: string } };
  }).material?.workspaceGlass;
  assert.ok(glass?.panel, "workspace glass panel token must exist");
  assert.ok(glass?.blur, "workspace glass blur token must exist");

  const html = renderToStaticMarkup(
    React.createElement(WorkspaceShell as unknown as React.ComponentType<Record<string, unknown>>, {
      mode: "topics",
      folderMode: "topic",
      material: "glass",
      header: React.createElement("div", null, "Topic rail"),
      children: React.createElement("div", null, "Topic body")
    })
  );

  assert.match(html, /data-workspace-material="glass"/);
  assert.match(html, /data-shell-masthead-material="glass"/);
  assert.match(html, /data-shell-rail-material="glass"/);
  assert.match(html, /data-shell-main-material="glass"/);
  assert.match(styleFromTag(findTagWithAttribute(html, `data-shell-masthead-material="glass"`)), /backdrop-filter:/);
  const mainStyle = styleFromTag(findTagWithAttribute(html, `data-shell-main-material="glass"`));
  assert.ok(mainStyle.includes(glass.panel), "main frame must keep the shared glass panel colour");
  assert.doesNotMatch(mainStyle, /backdrop-filter:/, "main must not create a containing block for fixed drawers");
});

test("WorkspaceSurface glass tone uses the shared material instead of the utility paper gradient", () => {
  const glass = (tokens as unknown as {
    material?: { workspaceGlass?: { panel?: string; blur?: string } };
  }).material?.workspaceGlass;
  assert.ok(glass?.panel, "workspace glass panel token must exist");
  assert.ok(glass.blur, "workspace glass blur token must exist");

  const html = renderToStaticMarkup(
    React.createElement(WorkspaceSurface as unknown as React.ComponentType<Record<string, unknown>>, {
      tone: "glass",
      children: React.createElement("div", null, "Glass content")
    })
  );

  const style = styleFromTag(findTagWithAttribute(html, `data-workspace-surface="glass"`));
  assert.match(style, /backdrop-filter:/);
  assert.ok(style.includes(glass.panel), "glass surface must use the shared panel material");
  assert.ok(style.includes(glass.blur), "glass surface must use the shared blur material");
  assert.doesNotMatch(style, new RegExp(tokens.color.utilitySurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

test("WorkspaceShell masthead omits nonessential shortcut and issue chrome in the compact popup", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      WorkspaceShell,
      {
        mode: "saved-signals",
        folderMode: "product",
        onSwitchWorkspace: () => {},
        availableWorkspaceModes: ["topic", "product", "pr-evidence"] as const,
        statusRail: React.createElement(StatusRail, {
          backendReachability: "reachable",
          backendWorkUiState: { kind: "idle" },
          ready: 8,
          total: 8
        }),
        header: React.createElement("div", null, "Header")
      },
      React.createElement("div", null, "Body")
    )
  );

  const statusStyle = styleFromTag(findTagWithAttribute(html, `data-shell-status-rail="masthead"`));
  const versionStyle = styleFromTag(findTagWithAttribute(html, `data-shell-version="masthead"`));

  assert.match(statusStyle, /min-width:0/);
  assert.match(statusStyle, /overflow:hidden/);
  assert.doesNotMatch(statusStyle, /min-width:150px/);
  assert.match(versionStyle, /flex-shrink:0/);
  assert.doesNotMatch(html, /data-shell-key-hints="idle"/);
  assert.doesNotMatch(html, />Mode</);
  assert.doesNotMatch(html, />Command</);
  assert.doesNotMatch(html, />VOL\.1</);
  assert.doesNotMatch(html, /Annotated Field Guide/);
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
  assert.match(html, /data-dlens-presence="card"/);
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
  assert.match(railHtml, /title="Backend: Backend slow \| Work: Retry waiting · 2 tasks are backed off - Backend is waiting before retrying\. Not actively crawling\. \| Items: 1\/3 ready"/);
  assert.match(railHtml, /aria-label="Backend: Backend slow \| Work: Retry waiting · 2 tasks are backed off - Backend is waiting before retrying\. Not actively crawling\. \| Items: 1\/3 ready"/);
});

test("StatusRail exposes an unreachable backend in its visible status copy", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatusRail, {
      backendReachability: "unreachable",
      backendWorkUiState: { kind: "idle" },
      workerStatus: "idle",
      ready: 7,
      total: 7
    })
  );

  assert.match(html, />Backend unreachable<\/span>/);
  assert.doesNotMatch(html, />idle<\/span>/);
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
