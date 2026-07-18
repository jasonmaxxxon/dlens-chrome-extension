import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import type { ReactionPattern } from "../src/compare/topic-audit.ts";
import { tokens } from "../src/ui/tokens.ts";

const patterns: ReactionPattern[] = [
  {
    id: "cautious", label: "審慎觀望與風險折衷", dynamicImplication: "討論要求先看制度成本，再決定是否支持。",
    nComments: 18, nAuthors: 14, coverageDenominator: 78, supportRefs: ["S1.R1"], counterRefs: [],
    representativeRefs: ["S1.R1"], counterRepresentativeRefs: [], valence: 0.1, mode: -0.2
  },
  {
    id: "doom", label: "行業悲觀與結構性焦慮", dynamicImplication: "留言把個別事件讀成整個行業正在失去安全感。",
    nComments: 24, nAuthors: 19, coverageDenominator: 78, supportRefs: ["S1.R2"], counterRefs: ["S2.R1"],
    representativeRefs: ["S1.R2"], counterRepresentativeRefs: ["S2.R1"], valence: -0.8, mode: 0.7
  },
  {
    id: "skeptic", label: "制度質疑與責任追問", dynamicImplication: "留言把焦點拉回制度責任與可驗證承諾。",
    nComments: 18, nAuthors: 12, coverageDenominator: 78, supportRefs: ["S2.R2"], counterRefs: [],
    representativeRefs: ["S2.R2"], counterRepresentativeRefs: [], valence: -0.5, mode: -0.5
  },
  {
    id: "hope", label: "改善期待與具體提案", dynamicImplication: "部分留言仍提出可以立即落地的改善路徑。",
    nComments: 12, nAuthors: 10, coverageDenominator: 78, supportRefs: ["S3.R1"], counterRefs: [],
    representativeRefs: ["S3.R1"], counterRepresentativeRefs: [], valence: 0.7, mode: -0.6
  },
  {
    id: "fringe", label: "邊緣玩笑與轉移話題", dynamicImplication: "少數回應以玩笑消解爭議，未形成主線。",
    nComments: 6, nAuthors: 6, coverageDenominator: 78, supportRefs: ["S3.R2"], counterRefs: [],
    representativeRefs: ["S3.R2"], counterRepresentativeRefs: [], valence: 0.4, mode: 0.2
  }
];

async function loadAtlasReactionMap() {
  try {
    return await import("../src/ui/AtlasReactionMap.tsx");
  } catch {
    return null;
  }
}

test("AtlasReactionMap renders complete bubbles and an accessible assignment distribution", async () => {
  const module = await loadAtlasReactionMap();
  assert.ok(module, "AtlasReactionMap module must exist");
  const html = renderToStaticMarkup(
    <module.AtlasReactionMap patterns={patterns} usableCount={72} selectedId={null} onSelect={() => undefined} />
  );

  assert.match(html, /data-atlas-assignment-distribution="true"/);
  assert.match(html, /data-atlas-assignment-total="78"/);
  assert.match(html, /data-atlas-assignment-row="doom"[^>]*data-assignment-percent="31"/);
  assert.match(html, /data-atlas-assignment-donut="true"[^>]*aria-hidden="true"/);
  assert.match(html, /data-signal-atlas-dot="doom"/);
  assert.match(html, />行業悲觀與結構性焦慮</);
  assert.doesNotMatch(html, /行業悲觀與結構性焦慮…/);

  const rowOrder = [...html.matchAll(/data-atlas-assignment-row="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(rowOrder, ["doom", "cautious", "skeptic", "hope", "fringe"]);
  assert.match(html, /data-atlas-assignment-row="doom"[^>]*data-atlas-palette-index="1"/);
  assert.match(html, /data-atlas-assignment-row="cautious"[^>]*data-atlas-palette-index="0"/);
  assert.match(html, /data-atlas-assignment-row="skeptic"[^>]*data-atlas-palette-index="2"/);
});

test("AtlasReactionMap bounds long visible labels at both compass edges without truncating accessible copy", async () => {
  const module = await loadAtlasReactionMap();
  assert.ok(module, "AtlasReactionMap module must exist");
  const leftLabel = "制度責任追問與長期結構風險需要持續公開驗證";
  const rightLabel = "具體改善提案與跨部門協作承諾需要持續追蹤落實";
  const edgePatterns: ReactionPattern[] = [
    { ...patterns[0]!, id: "left-long", label: leftLabel, valence: -1, mode: 0 },
    { ...patterns[1]!, id: "right-long", label: rightLabel, valence: 1, mode: 0 }
  ];
  const html = renderToStaticMarkup(
    <module.AtlasReactionMap patterns={edgePatterns} usableCount={42} selectedId={null} onSelect={() => undefined} />
  );
  const dom = new JSDOM(html);

  try {
    for (const [id, fullLabel] of [["left-long", leftLabel], ["right-long", rightLabel]] as const) {
      const bubble = dom.window.document.querySelector(`[data-signal-atlas-dot="${id}"]`);
      assert.ok(bubble);
      assert.match(bubble.getAttribute("aria-label") ?? "", new RegExp(fullLabel));

      const visibleLabel = bubble.querySelector(`[data-atlas-bubble-label="${id}"]`);
      assert.ok(visibleLabel);
      const lines = [...visibleLabel.querySelectorAll("tspan")].map((line) => line.textContent ?? "");
      assert.equal(lines.length, 2);
      assert.ok(lines.every((line) => Array.from(line).length <= 8));
      assert.match(lines.at(-1) ?? "", /…$/);
      assert.notEqual(lines.join(""), fullLabel);

      const row = dom.window.document.querySelector(`[data-atlas-assignment-row="${id}"]`);
      assert.ok(row);
      assert.match(row.textContent ?? "", new RegExp(fullLabel));
    }
  } finally {
    dom.window.close();
  }
});

test("AtlasReactionMap exposes the selected distribution row through aria-pressed", async () => {
  const module = await loadAtlasReactionMap();
  assert.ok(module, "AtlasReactionMap module must exist");
  const html = renderToStaticMarkup(
    <module.AtlasReactionMap patterns={patterns} usableCount={72} selectedId="doom" onSelect={() => undefined} />
  );
  const selectedRow = html.match(/<button[^>]*data-atlas-assignment-row="doom"[^>]*>/)?.[0] ?? "";
  const idleRow = html.match(/<button[^>]*data-atlas-assignment-row="cautious"[^>]*>/)?.[0] ?? "";

  assert.match(selectedRow, /aria-pressed="true"/);
  assert.match(idleRow, /aria-pressed="false"/);
});

test("AtlasReactionMap exposes real implications on hover/focus and activates bubbles with mouse or keyboard", async () => {
  const module = await loadAtlasReactionMap();
  assert.ok(module, "AtlasReactionMap module must exist");
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement,
    SVGElement: globalThis.SVGElement, Event: globalThis.Event, MouseEvent: globalThis.MouseEvent,
    FocusEvent: globalThis.FocusEvent, KeyboardEvent: globalThis.KeyboardEvent
  };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  const selected: string[] = [];
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
    FocusEvent: dom.window.FocusEvent, KeyboardEvent: dom.window.KeyboardEvent
  });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(<module.AtlasReactionMap patterns={patterns} usableCount={72} selectedId={null} onSelect={(id) => selected.push(id)} />);
    });
    const bubble = rootElement.querySelector<SVGGElement>('[data-signal-atlas-dot="doom"]');
    assert.ok(bubble);
    assert.match(bubble.getAttribute("aria-label") ?? "", /留言把個別事件讀成整個行業正在失去安全感/);

    await act(async () => bubble.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })));
    assert.match(rootElement.querySelector('[role="tooltip"]')?.textContent ?? "", /留言把個別事件讀成整個行業正在失去安全感/);
    await act(async () => {
      bubble.dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true }));
      bubble.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    });
    assert.match(rootElement.querySelector('[role="tooltip"]')?.textContent ?? "", /留言把個別事件讀成整個行業正在失去安全感/);
    await act(async () => {
      bubble.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      bubble.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      bubble.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    assert.deepEqual(selected, ["doom", "doom", "doom"]);
  } finally {
    await act(async () => root.unmount());
    actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("AtlasReactionMap keeps palette contrast and responsive values on the shared token contract", async () => {
  const module = await loadAtlasReactionMap();
  assert.ok(module, "AtlasReactionMap module must exist");
  const usesDarkText = module.atlasReactionMapTestables.bubbleUsesDarkText;
  assert.equal(usesDarkText(0, 5), true);
  assert.equal(usesDarkText(2, 5), true);
  assert.equal(usesDarkText(5, 5), true);
  assert.equal(usesDarkText(7, 5), true);
  assert.equal(usesDarkText(1, 5), false);
  assert.equal(usesDarkText(3, 5), false);
  assert.equal(usesDarkText(0, 0), false);

  const html = renderToStaticMarkup(
    <module.AtlasReactionMap patterns={patterns} usableCount={72} selectedId={null} onSelect={() => undefined} />
  );
  assert.match(html, new RegExp(`max-width: ${tokens.layout.atlasNarrowBreakpointPx}px`));
  assert.match(html, /data-atlas-assignment-layout="responsive"/);
});

test("AtlasReactionMap preserves the regeneration copy for audits without compass coordinates", async () => {
  const module = await loadAtlasReactionMap();
  assert.ok(module, "AtlasReactionMap module must exist");
  const legacyPatterns = patterns.map(({ valence: _valence, mode: _mode, ...pattern }) => pattern);
  const html = renderToStaticMarkup(
    <module.AtlasReactionMap patterns={legacyPatterns} usableCount={72} selectedId={null} onSelect={() => undefined} />
  );
  assert.match(html, /data-signal-atlas-compass-hint="true"/);
  assert.match(html, /此審計早於羅盤座標/);
});
