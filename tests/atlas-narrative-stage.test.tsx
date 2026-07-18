import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import type { EvidencePacket } from "../src/compare/topic-audit.ts";
import { AtlasNarrativeStage } from "../src/ui/AtlasNarrativeStage.tsx";
import { buildEvidenceFragmentLookup } from "../src/ui/EvidenceRefChip.tsx";
import type { NarrativeLaneHint } from "../src/ui/topic-audit-components.tsx";

const packets: EvidencePacket[] = [
  {
    auditRunId: "audit-stage",
    inputHash: "hash-stage",
    topicId: "topic-stage",
    signalId: "signal-1",
    itemId: "item-1",
    shortCode: "S1",
    sourceUrl: "https://www.threads.net/@alpha/post/1",
    capturedAt: "2026-07-18T00:00:00.000Z",
    status: "succeeded",
    opAuthor: "alpha",
    opText: "modern setup source",
    opLikes: 4,
    commentCount: 1,
    replyFragments: [{ ref: "S1.R1", author: "reader-one", text: "exact but quieter reply", likes: 8, role: "audience" }],
    aiArtifacts: { tags: [], gist: "" },
    gaps: [],
    notes: []
  },
  {
    auditRunId: "audit-stage",
    inputHash: "hash-stage",
    topicId: "topic-stage",
    signalId: "signal-2",
    itemId: "item-2",
    shortCode: "S2",
    sourceUrl: "https://www.threads.net/@beta/post/2",
    capturedAt: "2026-07-18T00:00:00.000Z",
    status: "succeeded",
    opAuthor: "beta",
    opText: "legacy source",
    opLikes: 3,
    commentCount: 2,
    replyFragments: [
      { ref: "S2.R1", author: "reader-two", text: "representative exact reply", likes: 21, role: "audience" },
      { ref: "S2.R2", author: "noise", text: "unrelated high-like reply", likes: 999, role: "audience" }
    ],
    aiArtifacts: { tags: [], gist: "" },
    gaps: [],
    notes: []
  },
  {
    auditRunId: "audit-stage",
    inputHash: "hash-stage",
    topicId: "topic-stage",
    signalId: "signal-3",
    itemId: "item-3",
    shortCode: "S3",
    sourceUrl: "https://www.threads.net/@gamma/post/3",
    capturedAt: "2026-07-18T00:00:00.000Z",
    status: "succeeded",
    opAuthor: "gamma",
    opText: "single observation source",
    opLikes: 2,
    commentCount: 1,
    replyFragments: [{ ref: "S3.R1", author: "reader-three", text: "single observation reply", likes: 2, role: "audience" }],
    aiArtifacts: { tags: [], gist: "" },
    gaps: [],
    notes: []
  }
];

const lanes: NarrativeLaneHint[] = [
  {
    id: "lane-modern",
    label: "現代跨帖敘事",
    signalRefs: ["S1.R1", "S2.R1"],
    consensus: 0.84,
    crossPostCount: 2,
    beats: { setup: "需求被提出", tension: "承諾受到質疑", outcome: "討論回到責任" },
    trajectory: "carried"
  },
  {
    id: "lane-legacy",
    label: "舊資料跨帖敘事",
    signalRefs: ["S1.OP", "S2.OP"],
    consensus: 0.71,
    crossPostCount: 2
  },
  {
    id: "lane-single",
    label: "單帖例外觀察",
    signalRefs: ["S3.R1"],
    consensus: 0.62,
    crossPostCount: 1,
    isSinglePostObservation: true
  }
];

const props = {
  lanes,
  packets,
  postTotal: 4,
  selectedLaneId: null,
  pinnedRef: null,
  fragmentLookup: buildEvidenceFragmentLookup(packets),
  onSelectLane: (_id: string) => undefined,
  onPinRef: (_ref: string) => undefined
};

test("AtlasNarrativeStage renders a modern page, exact evidence, and compact single observations", () => {
  const html = renderToStaticMarkup(<AtlasNarrativeStage {...props} />);

  assert.match(html, /data-atlas-narrative-page="lane-modern"/);
  assert.match(html, /data-narrative-participation="lane-modern"/);
  assert.match(html, /data-narrative-participation-fill="lane-modern"[^>]*width:50%/);
  assert.match(html, />起</);
  assert.match(html, />張力</);
  assert.match(html, />收束</);
  assert.match(html, /data-narrative-trajectory="carried"/);
  assert.match(html, /data-narrative-representative-ref="S2\.R1"/);
  assert.doesNotMatch(html, /unrelated high-like reply/);
  assert.match(html, /data-atlas-single-observation="lane-single"/);
  assert.doesNotMatch(html, /data-narrative-strength-cell/);
});

test("AtlasNarrativeStage pages through cross-post lanes without selecting from pager controls", async () => {
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://dlens.test" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  const selected: string[] = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent
  });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(<AtlasNarrativeStage {...props} onSelectLane={(id) => selected.push(id)} />);
    });
    assert.ok(rootElement.querySelector('[data-atlas-narrative-page="lane-modern"]'));
    assert.equal(rootElement.querySelector('[data-atlas-narrative-page="lane-legacy"]'), null);

    const next = rootElement.querySelector<HTMLButtonElement>("[data-atlas-narrative-next]");
    assert.ok(next);
    await act(async () => {
      next.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    assert.equal(rootElement.querySelector('[data-atlas-narrative-page="lane-modern"]'), null);
    assert.ok(rootElement.querySelector('[data-atlas-narrative-page="lane-legacy"]'));
    assert.equal(rootElement.querySelector('[aria-live="polite"]')?.textContent?.trim(), "2 / 2");
    assert.equal(next.disabled, true);
    assert.equal(rootElement.querySelector("[data-narrative-beats]"), null);
    assert.deepEqual(selected, []);

    const previousButton = rootElement.querySelector<HTMLButtonElement>("[data-atlas-narrative-previous]");
    assert.ok(previousButton);
    await act(async () => {
      previousButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(rootElement.querySelector('[aria-live="polite"]')?.textContent?.trim(), "1 / 2");
    assert.ok(rootElement.querySelector('[data-atlas-narrative-page="lane-modern"]'));
    assert.deepEqual(selected, []);

    await act(async () => {
      rootElement.querySelector<HTMLElement>('[data-atlas-narrative-page="lane-modern"]')
        ?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(selected, ["lane-modern"]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousActEnvironment === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
