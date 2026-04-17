import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SelectedClusterDetail } from "../src/analysis/types.ts";
import { TechniqueView } from "../src/ui/TechniqueView.tsx";

const detail: SelectedClusterDetail = {
  captureId: "cap-b",
  clusterKey: 1,
  clusterTitle: "航班調整原因",
  thesis: "討論香港快運航班調整的原因，包括淡季和燃油成本，並有人擔心影響前往沖繩的行程。",
  supportLabel: "6 comments",
  supportMetrics: [],
  audienceEvidence: [
    {
      commentId: "c-1",
      author: "stacy_201112",
      text: "淡季正常 加上燃油成本",
      likes: 13,
      comments: 0,
      reposts: 0,
      forwards: 0
    }
  ],
  authorStance: "作者指出香港快運調前減部分航線的運力，並提及可能的原因。",
  alignment: "Oppose",
  alignmentSummary: "目前這組留言更像是在補充或重寫原因。",
  relatedCluster: null
};

test("TechniqueView renders cluster-specific deeper reading notes instead of a generic glossary", () => {
  const html = renderToStaticMarkup(
    React.createElement(TechniqueView, {
      sideLabel: "B",
      detail,
      onBack: () => undefined,
      onSave: () => undefined,
      onJumpToCluster: () => undefined,
      saveState: "idle"
    })
  );

  assert.match(html, /data-technique-surface="reading-strip"/);
  assert.match(html, /data-technique-context="cluster-note"/);
  assert.match(html, /data-technique-evidence="case-note"/);
  assert.match(html, /data-technique-notes="cluster-specific"/);
  assert.match(html, /data-technique-carousel="swipe-cards"/);
  assert.match(html, /data-technique-card=/);
  assert.match(html, /Technique \/ Evidence/);
  assert.match(html, /Why this cluster matters/i);
  assert.match(html, /How Post B differs/i);
  assert.match(html, /在這個 cluster/i);
  assert.match(html, /焦點轉移|恐懼框架|常態化|回聲放大|敘事轉向/);
  assert.match(html, /享受假期的日常|航班調整原因/);
  assert.match(html, /Deflection|Fear framing|Normalization|Echo|Narrative shift/);
  assert.match(html, /為什麼值得注意/);
  assert.match(html, /data-evidence-metrics-row="single-line"/);
  assert.match(html, /data-evidence-metric="likes"/);
  assert.match(html, /data-evidence-metric="comments"/);
  assert.match(html, /data-evidence-metric="reposts"/);
  assert.match(html, /data-evidence-metric="forwards"/);
  assert.ok((html.match(/data-technique-card=/g) ?? []).length <= 2);
  assert.match(html, /data-technique-dots="visible"/);
});

test("TechniqueView keeps a visible fallback instead of disappearing when detail is missing", () => {
  const html = renderToStaticMarkup(
    React.createElement(TechniqueView, {
      sideLabel: "A",
      detail: null,
      onBack: () => undefined,
      onSave: () => undefined,
      onJumpToCluster: () => undefined,
      saveState: "idle"
    })
  );

  assert.match(html, /data-technique-view="missing-detail"/);
  assert.match(html, /Deeper reading is unavailable right now\./);
  assert.match(html, /Back to Compare/);
});
