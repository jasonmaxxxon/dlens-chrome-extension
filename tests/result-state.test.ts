import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveAnalysisResult, SavedAnalysisSnapshot } from "../src/state/types.ts";
import { resolveAnalysisResultSurface } from "../src/state/analysis-result-state.ts";

function buildSavedAnalysis(overrides: Partial<SavedAnalysisSnapshot> = {}): SavedAnalysisSnapshot {
  return {
    resultId: "saved_result_1",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    sourceLabelA: "@openai_tw",
    sourceLabelB: "@tec_journalist",
    headline: "焦慮是主調，但理性聲音正在集結",
    deck: "兩篇貼文的留言區呈現截然不同的反應結構。",
    primaryTensionSummary: "A 群量大，B 群互動更高。",
    groupSummary: "3 群組",
    totalComments: 847,
    dateRangeLabel: "3/28–4/4",
    savedAt: "2026-04-13T13:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v5",
    briefSource: "ai",
    ...overrides
  };
}

function buildActiveResult(overrides: Partial<ActiveAnalysisResult> = {}): ActiveAnalysisResult {
  return {
    resultId: "active_result_1",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    saved: false,
    viewedAt: "2026-04-13T13:05:00.000Z",
    ...overrides
  };
}

test("resolveAnalysisResultSurface prefers the active result over saved analyses", () => {
  const saved = buildSavedAnalysis({ resultId: "saved_result_2" });
  const resolution = resolveAnalysisResultSurface({
    activeResult: buildActiveResult(),
    savedAnalyses: [saved]
  });

  assert.equal(resolution.mode, "active");
  assert.equal(resolution.activeResult?.resultId, "active_result_1");
  assert.equal(resolution.savedAnalysis?.resultId, "saved_result_2");
});

test("resolveAnalysisResultSurface falls back to the newest saved analysis when there is no active result", () => {
  const older = buildSavedAnalysis({ resultId: "saved_result_1", savedAt: "2026-04-13T11:00:00.000Z" });
  const newer = buildSavedAnalysis({ resultId: "saved_result_2", savedAt: "2026-04-13T12:00:00.000Z" });
  const resolution = resolveAnalysisResultSurface({
    activeResult: null,
    savedAnalyses: [older, newer]
  });

  assert.equal(resolution.mode, "saved");
  assert.equal(resolution.savedAnalysis?.resultId, "saved_result_2");
});

test("resolveAnalysisResultSurface returns empty when there is no active or saved analysis", () => {
  const resolution = resolveAnalysisResultSurface({
    activeResult: null,
    savedAnalyses: []
  });

  assert.equal(resolution.mode, "empty");
  assert.equal(resolution.activeResult, null);
  assert.equal(resolution.savedAnalysis, null);
});
