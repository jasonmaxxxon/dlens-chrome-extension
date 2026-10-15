import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AttentionBeam,
  DLENS_BUTTON_CSS,
  ModeHeader,
  SCAN_ROW_HOVER_CSS,
  SearchingOrb,
  searchingOrbDotStyle,
  SectionHeader,
  StatusDot,
  StatusRail,
  SurfaceCard,
  WorkspaceSurface,
} from "../src/ui/components.tsx";
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

test("shared button motion CSS is scoped to the extension root", () => {
  assert.match(DLENS_BUTTON_CSS, /\[data-dlens-control="true"\] \[data-dlens-button\]/);
  assert.match(DLENS_BUTTON_CSS, /translateY\(-3px\)/);
  assert.match(DLENS_BUTTON_CSS, /scale\(0\.93\)/);
  assert.match(DLENS_BUTTON_CSS, /prefers-reduced-motion/);
  assert.match(DLENS_BUTTON_CSS, /animation: none !important/);
  assert.doesNotMatch(DLENS_BUTTON_CSS, /^\[data-dlens-button\]/m);
});

test("attention button beam is the sole hover transform owner", () => {
  assert.match(
    DLENS_BUTTON_CSS,
    /\[data-attention-button-beam="true"\]:hover\s*\{[^}]*transform:\s*translateY\(-3px\)/
  );
  assert.match(
    DLENS_BUTTON_CSS,
    /\[data-attention-button-beam="true"\]\s*>\s*\[data-attention-button-content="true"\]:not\(:disabled\):hover,[^{]*\{[^}]*transform:\s*none/
  );
  assert.match(
    DLENS_BUTTON_CSS,
    /prefers-reduced-motion:[\s\S]*\[data-attention-button-beam="true"\]:hover,[^{]*\{[^}]*transform:\s*none !important/
  );
});

test("SearchingOrb exposes one fixed-size shared CSS marker", () => {
  const html = renderToStaticMarkup(
    React.createElement(SearchingOrb, null)
  );

  assert.match(html, /data-searching-orb="true"/);
  assert.match(html, /width="16"/);
  assert.match(html, /height="16"/);
  assert.doesNotMatch(html, /data-searching-orb-size/);
  assert.doesNotMatch(html, /style=/);
  assert.doesNotMatch(html, /data-searching-orb-core/);
});

test("SearchingOrb dots use the ink token with a high-contrast alpha floor", () => {
  assert.deepEqual(searchingOrbDotStyle(0, 0), {
    fill: tokens.color.ink,
    alpha: 0.68
  });
  assert.deepEqual(searchingOrbDotStyle(1, 1), {
    fill: tokens.color.ink,
    alpha: 1
  });
});

test("AttentionBeam renders generating, actionable, and none states", () => {
  const generatingHtml = renderToStaticMarkup(
    React.createElement(
      AttentionBeam,
      { state: "generating", generatingLabel: "生成中" },
      "開始生成"
    )
  );
  assert.match(generatingHtml, /data-attention-beam="generating"/);
  assert.match(generatingHtml, /data-attention-beam-sweep="true"/);
  assert.match(generatingHtml, /data-searching-orb="true"/);
  assert.doesNotMatch(generatingHtml, /data-attention-beam-content/);
  assert.match(generatingHtml, /生成中/);
  assert.doesNotMatch(generatingHtml, /開始生成/);

  const actionableHtml = renderToStaticMarkup(
    React.createElement(
      AttentionBeam,
      { state: "actionable" },
      React.createElement("span", null, "查看完整分析")
    )
  );
  assert.match(actionableHtml, /data-attention-beam="actionable"/);
  assert.doesNotMatch(actionableHtml, /data-attention-beam-sweep="true"/);
  assert.doesNotMatch(actionableHtml, /data-searching-orb="true"/);

  const neutralHtml = renderToStaticMarkup(
    React.createElement(
      AttentionBeam,
      { state: "none" },
      React.createElement("span", null, "Neutral")
    )
  );
  assert.match(neutralHtml, /data-attention-beam="none"/);
  assert.doesNotMatch(neutralHtml, /data-attention-beam-sweep="true"/);
});

test("ModeHeader uses the Topic list intro grammar across modes", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModeHeader, {
      mode: "signals",
      kicker: "Product mode",
      title: "Saved Signals",
      deck: "Read the real inbox state."
    })
  );

  assert.match(html, /data-mode-header="signals"/);
  assert.match(html, /data-mode-intro="topic"/);
  assert.match(html, /padding:10px 4px 0/);
  assert.doesNotMatch(html, /data-mode-header="signals"[^>]*border-radius:20px/);
  assert.doesNotMatch(html, /data-mode-header="signals"[^>]*0 4px 14px -4px rgba\(27,26,23,0\.07\)/);
  assert.match(html, /Saved Signals<\/h2>/);
  assert.match(html, /font-weight:900/);
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
  assert.match(railHtml, /資料夾 1\/3 ready/);
  assert.match(railHtml, /title="Backend: Backend slow \| Work: Retry waiting · 2 tasks are backed off - Backend is waiting before retrying\. Not actively crawling\. \| Items: 資料夾 1\/3 ready"/);
  assert.match(railHtml, /aria-label="Backend: Backend slow \| Work: Retry waiting · 2 tasks are backed off - Backend is waiting before retrying\. Not actively crawling\. \| Items: 資料夾 1\/3 ready"/);
});

test("StatusRail labels folder progress and exposes an active disclosure", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatusRail, {
      scopeLabel: "資料夾",
      backendWorkUiState: { kind: "draining", count: 3 },
      workerStatus: "draining",
      ready: 9,
      total: 20
    })
  );

  assert.match(html, /data-status-rail-active="true"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /資料夾 9\/20 ready/);
  assert.match(html, /data-status-rail-disclosure="true"/);
  assert.match(html, /data-status-rail-progress="true"/);
  assert.match(html, /width:45%/);
});

test("StatusRail keeps idle, retry, and error work states still and labelled", () => {
  const idleHtml = renderToStaticMarkup(
    React.createElement(StatusRail, {
      backendWorkUiState: { kind: "idle" },
      workerStatus: "idle",
      ready: 0,
      total: 0
    })
  );
  const retryHtml = renderToStaticMarkup(
    React.createElement(StatusRail, {
      backendWorkUiState: { kind: "retry_waiting", count: 2, earliestRetryAt: null, nextDueAt: null },
      workerStatus: "idle"
    })
  );
  const errorHtml = renderToStaticMarkup(
    React.createElement(StatusRail, {
      backendWorkUiState: { kind: "analysis_failed", count: 1 },
      workerStatus: "idle"
    })
  );

  assert.match(idleHtml, /data-status-rail-active="false"/);
  assert.doesNotMatch(idleHtml, /animation:/);
  assert.match(idleHtml, /width:0%/);
  assert.match(retryHtml, /data-status-rail-active="false"/);
  assert.match(retryHtml, /data-status-dot="warning"/);
  assert.match(retryHtml, /retry_waiting/);
  assert.doesNotMatch(retryHtml, /animation:/);
  assert.match(errorHtml, /data-status-rail-active="false"/);
  assert.match(errorHtml, /data-status-dot="danger"/);
  assert.match(errorHtml, /analysis_failed/);
  assert.doesNotMatch(errorHtml, /animation:/);
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

test("components.tsx module surface: tree-shaken dead exports are gone, live surface survives", async () => {
  const componentsModule: Record<string, unknown> = await import("../src/ui/components.tsx");

  // Retired — verified dead (declaration was the only mention anywhere in src/entrypoints/tests).
  assert.equal(componentsModule.statusTheme, undefined);
  assert.equal(componentsModule.hudLabel, undefined);
  assert.equal(componentsModule.formatElapsed, undefined);
  assert.equal(componentsModule.PageButton, undefined);

  // Retired rail exports are absent.
  assert.equal(componentsModule.ModeRailButton, undefined);

  // Public testables that must survive.
  assert.equal(componentsModule.ModeRail, undefined);
  assert.equal(typeof componentsModule.SurfaceCard, "function");
  assert.equal(typeof componentsModule.WorkspaceSurface, "function");
});
