import assert from "node:assert/strict";
import test from "node:test";

import {
  saveProductAnalysisResult
} from "../src/compare/product-analysis-result-storage.ts";
import {
  materializeProductAnalysisReading
} from "../src/compare/product-analysis-reading.ts";
import type {
  ProductSignalAnalyzerInput
} from "../src/compare/product-signal-analysis.ts";
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

function makeAnalysis(
  overrides: Partial<ProductSignalAnalysis> = {}
): ProductSignalAnalysis {
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
    status: "complete",
    ...overrides
  };
}

function makeReading(overrides: Partial<SignalReading> = {}): SignalReading {
  return {
    ...materializeReading(makeAnalysis()),
    ...overrides
  };
}

function materializeReading(analysis: ProductSignalAnalysis): SignalReading {
  const reading = materializeProductAnalysisReading({
    analysis,
    analyzerInput: makeAnalyzerInput(),
    postUrl: "https://www.threads.com/@author/post/abc"
  });
  assert.ok(reading);
  return reading;
}

function makeAnalyzerInput(): ProductSignalAnalyzerInput {
  return {
    signalId: "sig_1",
    source: "threads",
    rootText: "原文展示互動模式。",
    assembledContent: "原文展示互動模式。\n\n留言認為值得驗證。",
    discussionReplies: [{
      id: "reply-1",
      author: "userA",
      text: "這值得有限驗證。",
      likeCount: 12,
      role: "audience",
      isOrphan: false,
      parentId: null,
      resolvedParentId: null
    }],
    productContext: {
      productPromise: "幫產品團隊讀懂社群訊號。"
    } as ProductSignalAnalyzerInput["productContext"],
    productContextHash: "ctx_1"
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
  const analysis = makeAnalysis();
  const reading = makeReading();
  const existing = {
    ...reading,
    reviewState: "filed",
    feedbackEvents: [{ type: "filed", at: "2026-07-23T00:00:00.000Z" }]
  } satisfies SignalReading;
  const storage = makeStorage({
    [SIGNAL_READINGS_STORAGE_KEY]: {
      [reading.cacheKey]: existing
    }
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
  assert.equal(storage.setCalls.length, 1);
});

test("fresh composite save resets caller review state and feedback", async () => {
  const storage = makeStorage();
  const analysis = makeAnalysis();
  const reading = makeReading();

  const result = await saveProductAnalysisResult(storage, analysis, {
    ...reading,
    reviewState: "filed",
    feedbackEvents: [{ type: "filed", at: "2026-07-23T00:00:00.000Z" }]
  });

  const stored = await getSignalReading(storage, reading.cacheKey);
  assert.equal(result.reading?.reviewState, "pending");
  assert.deepEqual(result.reading?.feedbackEvents, []);
  assert.equal(stored?.reviewState, "pending");
  assert.deepEqual(stored?.feedbackEvents, []);
  assert.equal(storage.setCalls.length, 1);
});

test("actionable analysis cannot publish without its projected reading", async () => {
  const storage = makeStorage();

  await assert.rejects(
    saveProductAnalysisResult(storage, makeAnalysis(), null),
    /requires a projected reading/
  );
  assert.equal(storage.setCalls.length, 0);
});

test("non-actionable analysis discards a supplied reading", async () => {
  const cases: Partial<ProductSignalAnalysis>[] = [
    { verdict: "park" },
    { verdict: "insufficient_data" },
    { signalType: "noise" }
  ];

  for (const overrides of cases) {
    const storage = makeStorage();
    const result = await saveProductAnalysisResult(
      storage,
      makeAnalysis(overrides),
      makeReading()
    );

    assert.equal(result.reading, null);
    assert.deepEqual(storage.data[SIGNAL_READINGS_STORAGE_KEY], {});
    assert.equal(storage.setCalls.length, 1);
  }
});

test("non-complete try and watch statuses do not require a projected reading", async () => {
  const statuses: ProductSignalAnalysis["status"][] = [
    "pending",
    "analyzing",
    "error"
  ];
  const verdicts: ProductSignalAnalysis["verdict"][] = ["try", "watch"];

  for (const status of statuses) {
    for (const verdict of verdicts) {
      const storage = makeStorage();
      const result = await saveProductAnalysisResult(
        storage,
        makeAnalysis({ status, verdict }),
        null
      );

      assert.equal(result.reading, null);
      assert.deepEqual(storage.data[SIGNAL_READINGS_STORAGE_KEY], {});
      assert.equal(storage.setCalls.length, 1);
    }
  }
});

test("non-complete try and watch statuses discard a supplied reading", async () => {
  const statuses: ProductSignalAnalysis["status"][] = [
    "pending",
    "analyzing",
    "error"
  ];
  const verdicts: ProductSignalAnalysis["verdict"][] = ["try", "watch"];

  for (const status of statuses) {
    for (const verdict of verdicts) {
      const storage = makeStorage();
      const analysis = makeAnalysis({ status, verdict });
      const result = await saveProductAnalysisResult(
        storage,
        analysis,
        materializeReading(analysis)
      );

      assert.equal(result.reading, null);
      assert.deepEqual(storage.data[SIGNAL_READINGS_STORAGE_KEY], {});
      assert.equal(storage.setCalls.length, 1);
    }
  }
});

test("projected reading identity must match its analysis and cache structure", async () => {
  const mismatches: Partial<SignalReading>[] = [
    { signalId: "sig_forged" },
    { productContextHash: "ctx_forged" },
    { promptVersion: "v999" },
    { sourcePacketHash: "packet_forged" },
    { cacheKey: "sig_1::ctx_1::forged::v21::forged" },
    { reading: "被置換的判讀內容。" },
    {
      sourcePacket: {
        ...makeReading().sourcePacket,
        assembledContent: "被置換的來源內容。"
      }
    }
  ];

  for (const mismatch of mismatches) {
    const storage = makeStorage();
    await assert.rejects(
      saveProductAnalysisResult(storage, makeAnalysis(), makeReading(mismatch)),
      /projected reading identity/
    );
    assert.equal(storage.setCalls.length, 0);
  }
});

test("same cache key with different stored identity does not inherit review", async () => {
  const incoming = makeReading();
  const forgedExisting: SignalReading = {
    ...incoming,
    reading: "不同內容卻偽造相同 cache key。",
    reviewState: "filed",
    feedbackEvents: [{ type: "filed", at: "2026-07-23T00:00:00.000Z" }]
  };
  const storage = makeStorage({
    [SIGNAL_READINGS_STORAGE_KEY]: {
      [incoming.cacheKey]: forgedExisting
    }
  });

  const result = await saveProductAnalysisResult(storage, makeAnalysis(), incoming);
  const stored = await getSignalReading(storage, incoming.cacheKey);

  assert.equal(result.reading?.reviewState, "pending");
  assert.deepEqual(result.reading?.feedbackEvents, []);
  assert.equal(stored?.reviewState, "pending");
  assert.deepEqual(stored?.feedbackEvents, []);
});

test("reordered support refs preserve the same filed reading identity", async () => {
  const firstAnalysis = makeAnalysis();
  const firstReading = materializeReading(firstAnalysis);
  const existing = {
    ...firstReading,
    reviewState: "filed",
    feedbackEvents: [{ type: "filed", at: "2026-07-23T00:00:00.000Z" }]
  } satisfies SignalReading;
  const storage = makeStorage({
    [SIGNAL_READINGS_STORAGE_KEY]: {
      [firstReading.cacheKey]: existing
    }
  });

  const reorderedAnalysis = makeAnalysis({
    productReading: {
      ...firstAnalysis.productReading!,
      supportRefs: ["e1", "root"]
    }
  });
  const reorderedReading = materializeReading(reorderedAnalysis);
  const result = await saveProductAnalysisResult(
    storage,
    reorderedAnalysis,
    reorderedReading
  );

  assert.deepEqual(reorderedReading.sourceRefs, ["root", "e1"]);
  assert.equal(reorderedReading.cacheKey, firstReading.cacheKey);
  assert.equal(result.reading?.reviewState, "filed");
  assert.equal(result.reading?.feedbackEvents.length, 1);
});
