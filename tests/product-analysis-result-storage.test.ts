import assert from "node:assert/strict";
import test from "node:test";

import {
  saveProductAnalysisResult
} from "../src/compare/product-analysis-result-storage.ts";
import {
  PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY
} from "../src/compare/product-signal-storage.ts";
import {
  getSignalReading,
  SIGNAL_READINGS_STORAGE_KEY,
  type SignalReading
} from "../src/compare/signal-reading-storage.ts";
import type { ProductSignalAnalysis } from "../src/state/types.ts";

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  const setCalls: Record<string, unknown>[] = [];
  return {
    data,
    setCalls,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      setCalls.push(values);
      Object.assign(data, values);
    }
  };
}

function makeAnalysis(): ProductSignalAnalysis {
  return {
    signalId: "sig_1",
    signalType: "learning",
    signalSubtype: "interaction_pattern",
    contentType: "content",
    contentSummary: "一個值得注意的互動模式。",
    relevance: 4,
    relevantTo: ["coreWorkflows"],
    whyRelevant: "可作有限驗證。",
    verdict: "watch",
    reason: "值得保留觀察。",
    evidenceRefs: ["root", "e1"],
    evidenceNotes: [
      {
        ref: "root",
        quoteSummary: "原文展示互動模式。",
        whyItMatters: "支持判讀。",
        grounding: "text_grounded"
      },
      {
        ref: "e1",
        quoteSummary: "留言認為值得驗證。",
        whyItMatters: "支持判讀。",
        grounding: "text_grounded"
      }
    ],
    productReading: {
      headline: "值得注意的互動模式",
      body: "原文與留言共同顯示這個互動模式值得有限驗證。",
      supportRefs: ["root", "e1"]
    },
    judgmentAxes: {
      usefulness: "uncertain",
      testability: "not_yet_testable",
      evidenceState: "text_sufficient",
      conflictState: "none"
    },
    warnings: [],
    productContextHash: "ctx_1",
    promptVersion: "v21",
    model: "google:gemini-3.1-flash-lite-preview",
    analyzedAt: "2026-07-23T00:00:00.000Z",
    status: "complete"
  };
}

function makeReading(overrides: Partial<SignalReading> = {}): SignalReading {
  return {
    signalId: "sig_1",
    cacheKey: "sig_1::ctx_1::packet::v21::content",
    productContextHash: "ctx_1",
    sourcePacketHash: "packet",
    promptVersion: "v21",
    headline: "值得注意的互動模式",
    reading: "原文與留言共同顯示這個互動模式值得有限驗證。",
    generatedAt: "2026-07-23T00:00:00.000Z",
    model: "google:gemini-3.1-flash-lite-preview",
    sourceRefs: ["root", "e1"],
    sourcePacket: {
      rootText: "原文展示互動模式。",
      assembledContent: "原文展示互動模式。\n\n留言認為值得驗證。",
      postUrl: "https://www.threads.com/@author/post/abc",
      representativeComments: [{
        ref: "e1",
        author: "userA",
        text: "這值得有限驗證。",
        likeCount: 12
      }],
      analysisPromptVersion: "v21"
    },
    origin: "product_analysis",
    reviewState: "pending",
    feedbackEvents: [],
    ...overrides
  };
}

test("analysis and projected reading use one storage set", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis();
  const reading = makeReading();

  const result = await saveProductAnalysisResult(storage, analysis, reading);

  assert.equal(storage.setCalls.length, 1);
  assert.deepEqual(
    Object.keys(storage.setCalls[0]!).sort(),
    [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY, SIGNAL_READINGS_STORAGE_KEY].sort()
  );
  assert.equal(result.reading?.cacheKey, reading.cacheKey);
  assert.deepEqual(
    (storage.data[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY] as Record<string, unknown>)[analysis.signalId],
    analysis
  );
});

test("idempotent materialization preserves review state and feedback", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis();
  const reading = makeReading();

  await saveProductAnalysisResult(storage, analysis, {
    ...reading,
    reviewState: "filed",
    feedbackEvents: [{ type: "filed", at: "2026-07-23T00:00:00.000Z" }]
  });
  await saveProductAnalysisResult(storage, analysis, {
    ...reading,
    reviewState: "pending",
    feedbackEvents: []
  });

  const stored = await getSignalReading(storage, reading.cacheKey);
  assert.equal(stored?.headline, "值得注意的互動模式");
  assert.equal(stored?.origin, "product_analysis");
  assert.equal(stored?.sourcePacket.rootText, "原文展示互動模式。");
  assert.equal(stored?.reviewState, "filed");
  assert.equal(stored?.feedbackEvents.length, 1);
  assert.equal(storage.setCalls.length, 2);
});

test("actionable analysis cannot publish without its projected reading", async () => {
  const storage = makeStorage();

  await assert.rejects(
    saveProductAnalysisResult(storage, makeAnalysis(), null),
    /requires a projected reading/
  );
  assert.equal(storage.setCalls.length, 0);
});
