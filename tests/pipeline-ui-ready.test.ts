import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompareUiReadyEvent,
  buildPrEvidenceUiReadyEvent,
  buildProductUiReadyEvent,
  buildTopicUiReadyEvent
} from "../src/ui/pipeline-ui-ready.ts";
import type { CompareViewModel } from "../src/viewmodel/compare.ts";
import type { PrEvidenceViewModel } from "../src/viewmodel/pr-evidence.ts";
import type { ProductSignalWorkspaceViewModel } from "../src/viewmodel/product-signal.ts";
import type { TopicDetailViewModel } from "../src/viewmodel/topic-detail.ts";

test("Product VM terminal state projects to a ui.ready pipeline event", () => {
  const event = buildProductUiReadyEvent({
    kind: "classification",
    sessionId: "session-product",
    loadState: "ready",
    signalCount: 2,
    completedAnalysisCount: 1,
    isAnalyzing: false,
    canAnalyze: true,
    visibleError: null,
    signals: [
      { analysisState: "ready" },
      { analysisState: "missing" }
    ]
  } as ProductSignalWorkspaceViewModel);

  assert.equal(event.phase, "ui.ready");
  assert.equal(event.step, "popup.product.vm.ready");
  assert.equal(event.result, "ok");
  assert.deepEqual(event.target, { sessionId: "session-product" });
  assert.deepEqual(event.detail, {
    surface: "product",
    kind: "classification",
    loadState: "ready",
    signalCount: 2,
    completedAnalysisCount: 1,
    isAnalyzing: false,
    canAnalyze: true,
    analysisCounts: {
      ready: 1,
      missing: 1
    }
  });
});

test("Topic VM terminal state keeps topic id in detail and session id in target", () => {
  const event = buildTopicUiReadyEvent({
    sessionId: "session-topic",
    loadState: "recovering",
    topic: { id: "topic-1", name: "航班爭議" },
    signalRows: [
      { analysisState: "ready" },
      { analysisState: "saved" },
      { analysisState: "queued" }
    ],
    analysisCounts: {
      total: 3,
      ready: 1,
      saved: 1,
      queued: 1,
      crawling: 0,
      analyzing: 0,
      failed: 0,
      missing: 0,
      processing: 1
    },
    audit: { summary: { reportStatus: "ready" } }
  } as TopicDetailViewModel);

  assert.equal(event.phase, "ui.ready");
  assert.equal(event.step, "popup.topic.vm.recovering");
  assert.equal(event.result, "ok");
  assert.deepEqual(event.target, { sessionId: "session-topic" });
  assert.deepEqual(event.detail, {
    surface: "topic",
    topicId: "topic-1",
    loadState: "recovering",
    signalCount: 3,
    analysisCounts: {
      total: 3,
      ready: 1,
      saved: 1,
      queued: 1,
      crawling: 0,
      analyzing: 0,
      failed: 0,
      missing: 0,
      processing: 1
    },
    auditReportStatus: "ready"
  });
});

test("Compare VM terminal state reflects async fetched brief and selection", () => {
  const event = buildCompareUiReadyEvent({
    sessionId: "session-compare",
    availability: { ready: true, reason: "ready" },
    selection: {
      selectedA: "item-a",
      selectedB: "item-b",
      itemA: { id: "item-a" },
      itemB: { id: "item-b" }
    },
    brief: {
      state: "fallback",
      loadState: "ready",
      provenance: "fallback"
    },
    clusters: {
      summaryState: "ready"
    },
    evidenceAnnotations: [{ commentId: "comment-1" }]
  } as CompareViewModel);

  assert.equal(event.phase, "ui.ready");
  assert.equal(event.step, "popup.compare.vm.ready");
  assert.equal(event.result, "ok");
  assert.deepEqual(event.target, { sessionId: "session-compare", itemId: "item-a" });
  assert.deepEqual(event.detail, {
    surface: "compare",
    availability: "ready",
    itemAId: "item-a",
    itemBId: "item-b",
    briefState: "fallback",
    briefLoadState: "ready",
    briefProvenance: "fallback",
    clusterSummaryState: "ready",
    evidenceAnnotationCount: 1
  });
});

test("Compare VM loading brief maps ui.ready result to pending", () => {
  const event = buildCompareUiReadyEvent({
    sessionId: "session-compare",
    availability: { ready: true, reason: "ready" },
    selection: {
      selectedA: "item-a",
      selectedB: "item-b",
      itemA: { id: "item-a" },
      itemB: { id: "item-b" }
    },
    brief: {
      state: "loading",
      loadState: "loading",
      provenance: "fallback"
    },
    clusters: {
      summaryState: "idle"
    },
    evidenceAnnotations: []
  } as CompareViewModel);

  assert.equal(event.step, "popup.compare.vm.loading");
  assert.equal(event.result, "pending");
});

test("PR Evidence VM terminal state projects resource readiness without id generation", () => {
  const event = buildPrEvidenceUiReadyEvent({
    sessionId: "session-pr",
    campaign: {
      id: "campaign-1",
      saved: true
    },
    rows: [
      { id: "row-1" },
      { id: "row-2" }
    ],
    workingArea: {
      activePane: "match",
      match: {
        matchedCells: 3,
        totalCells: 12
      }
    },
    uploadError: "",
    notice: "",
    ui: {
      isSaving: false,
      isReadingBrief: false,
      isGeneratingCriteria: false,
      isMatching: false,
      isFetchingAdvancedMetrics: false,
      isGeneratingSummary: false
    }
  } as PrEvidenceViewModel);

  assert.equal(event.phase, "ui.ready");
  assert.equal(event.step, "popup.pr-evidence.vm.ready");
  assert.equal(event.result, "ok");
  assert.deepEqual(event.target, { sessionId: "session-pr" });
  assert.deepEqual(event.detail, {
    surface: "pr-evidence",
    campaignId: "campaign-1",
    campaignSaved: true,
    rowCount: 2,
    activePane: "match",
    matchedCells: 3,
    totalCells: 12,
    busy: false
  });
});

test("PR Evidence busy UI maps ui.ready result to pending", () => {
  const event = buildPrEvidenceUiReadyEvent({
    sessionId: "session-pr",
    campaign: {
      id: null,
      saved: false
    },
    rows: [],
    workingArea: {
      activePane: "ledger",
      match: {
        matchedCells: 0,
        totalCells: 0
      }
    },
    uploadError: "",
    notice: "",
    ui: {
      isSaving: false,
      isReadingBrief: true,
      isGeneratingCriteria: false,
      isMatching: false,
      isFetchingAdvancedMetrics: false,
      isGeneratingSummary: false
    }
  } as PrEvidenceViewModel);

  assert.equal(event.step, "popup.pr-evidence.vm.pending");
  assert.equal(event.result, "pending");
});
