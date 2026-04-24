import assert from "node:assert/strict";
import test from "node:test";

import { COMPARE_BRIEF_PROMPT_VERSION } from "../src/compare/provider.ts";
import {
  buildSavedAnalysisSnapshot,
  loadSavedAnalyses,
  saveSavedAnalysisJudgment,
  SAVED_ANALYSES_STORAGE_KEY
} from "../src/compare/saved-analysis-storage.ts";

test("loadSavedAnalyses normalizes legacy snapshots to an unknown brief source", async () => {
  const bucket: Record<string, unknown> = {
    [SAVED_ANALYSES_STORAGE_KEY]: [
      {
        resultId: "result_123",
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
        briefVersion: "v5"
      }
    ]
  };
  const storageArea = {
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") {
        return { [key]: bucket[key] };
      }
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, items);
    }
  };

  const loaded = await loadSavedAnalyses(storageArea);

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.briefSource, "unknown");
  assert.equal(loaded[0]?.briefVersion, "v5");
  assert.equal(loaded[0]?.judgmentResult, null);
  assert.equal(loaded[0]?.judgmentVersion, null);
  assert.equal(loaded[0]?.judgmentSource, null);
});

test("buildSavedAnalysisSnapshot uses the current compare brief version and explicit semantic source", () => {
  const snapshot = buildSavedAnalysisSnapshot({
    resultId: "result_123",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    sourceLabelA: "@openai_tw",
    sourceLabelB: "@tec_journalist",
    headline: "焦慮是主調，但理性聲音正在集結",
    deck: "兩篇貼文的留言區呈現截然不同的反應結構。",
    groupSummary: "847 則留言 · 3/28–4/4 · 3 群組 · fallback",
    totalComments: 847,
    dateRangeLabel: "3/28–4/4",
    briefSource: "fallback",
    savedAt: "2026-04-13T13:00:00.000Z"
  });

  assert.equal(snapshot.briefVersion, COMPARE_BRIEF_PROMPT_VERSION);
  assert.equal(snapshot.briefSource, "fallback");
  assert.equal(snapshot.primaryTensionSummary, snapshot.deck);
  assert.equal(snapshot.judgmentResult, null);
  assert.equal(snapshot.judgmentVersion, null);
  assert.equal(snapshot.judgmentSource, null);
});

test("saveSavedAnalysisJudgment updates only the targeted saved analysis entry", async () => {
  const bucket: Record<string, unknown> = {
    [SAVED_ANALYSES_STORAGE_KEY]: [
      buildSavedAnalysisSnapshot({
        resultId: "result_123",
        compareKey: "item-a::item-b",
        itemAId: "item-a",
        itemBId: "item-b",
        sourceLabelA: "@openai_tw",
        sourceLabelB: "@tec_journalist",
        headline: "焦慮是主調，但理性聲音正在集結",
        deck: "兩篇貼文的留言區呈現截然不同的反應結構。",
        groupSummary: "3 群組",
        totalComments: 847,
        dateRangeLabel: "3/28–4/4",
        briefSource: "ai",
        savedAt: "2026-04-13T13:00:00.000Z"
      }),
      buildSavedAnalysisSnapshot({
        resultId: "result_456",
        compareKey: "item-c::item-d",
        itemAId: "item-c",
        itemBId: "item-d",
        sourceLabelA: "@other_a",
        sourceLabelB: "@other_b",
        headline: "另一份分析",
        deck: "另一份 deck",
        groupSummary: "2 群組",
        totalComments: 320,
        dateRangeLabel: "4/1–4/2",
        briefSource: "fallback",
        savedAt: "2026-04-14T13:00:00.000Z"
      })
    ]
  };
  const storageArea = {
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") {
        return { [key]: bucket[key] };
      }
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, items);
    }
  };

  const saved = await saveSavedAnalysisJudgment(storageArea, {
    resultId: "result_123",
    judgmentResult: {
      relevance: 4,
      recommendedState: "act",
      whyThisMatters: "這個討論結構很適合產品判斷。",
      actionCue: "先進高優先"
    },
    judgmentVersion: "v1",
    judgmentSource: "ai"
  });

  assert.equal(saved[0]?.resultId, "result_123");
  assert.equal(saved[0]?.judgmentResult?.relevance, 4);
  assert.equal(saved[0]?.judgmentVersion, "v1");
  assert.equal(saved[0]?.judgmentSource, "ai");
  assert.equal(saved[1]?.resultId, "result_456");
  assert.equal(saved[1]?.judgmentResult, null);
});
