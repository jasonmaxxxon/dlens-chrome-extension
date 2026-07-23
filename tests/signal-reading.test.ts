import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSourcePacketHash,
  buildStoredSourcePacket,
  type SignalReadingInput
} from "../src/compare/signal-reading.ts";
import { materializeProductAnalysisReading } from "../src/compare/product-analysis-reading.ts";
import type { ProductSignalAnalyzerInput } from "../src/compare/product-signal-analysis.ts";
import {
  appendSignalReadingReview,
  buildSignalReadingCacheKey,
  deleteSignalReadingsBySignalId,
  getSignalReading,
  latestReadingBySignalId,
  listSignalReadings,
  saveSignalReading,
  signalReadingStaleness,
  signalReadingStorageTestables,
  SIGNAL_READINGS_STORAGE_KEY,
  type SignalReading
} from "../src/compare/signal-reading-storage.ts";
import { composeReadingBrief, selectFiledReadings } from "../src/compare/signal-reading-brief.ts";
import type { ProductContext, ProductSignalAnalysis } from "../src/state/types.ts";

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    }
  };
}

function makeInput(overrides: Partial<SignalReadingInput> = {}): SignalReadingInput {
  return {
    signalId: "sig_1",
    assembledContent: "原文：開發者推出毒舌記帳 App。",
    postUrl: "https://www.threads.net/@dev/post/abc",
    representativeComments: [
      { ref: "e1", author: "userA", text: "又一個記帳 App。", likeCount: 226 },
      { ref: "e2", author: "userB", text: "毒舌語氣很煩。", likeCount: 4 }
    ],
    productContext: { productPromise: "幫產品團隊讀社群訊號。" } as unknown as ProductContext,
    productContextHash: "ctx_1",
    analysisPromptVersion: "v16",
    existingAnalysisSummary: "判斷：watch / competitor",
    ...overrides
  };
}

const LEGACY_READING_PROMPT_VERSION = "v9";
const DEFAULT_READING_CACHE_KEY = `sig_1::ctx_1::pkt_1::${LEGACY_READING_PROMPT_VERSION}`;

test("retired Product second-reading prompt and provider call are absent", () => {
  const signalReadingSource = readFileSync(new URL("../src/compare/signal-reading.ts", import.meta.url), "utf8");
  const providerSource = readFileSync(new URL("../src/compare/provider.ts", import.meta.url), "utf8");

  assert.doesNotMatch(signalReadingSource, /SIGNAL_READING_SYSTEM_PROMPT|buildSignalReadingPrompt|selectSignalReadingRepresentativeRefs|buildExistingAnalysisSummary/);
  assert.doesNotMatch(providerSource, /generateSignalReading\s*\(/);
});

test("buildSourcePacketHash 相同輸入穩定、不同輸入改變", () => {
  const base = makeInput();
  assert.equal(buildSourcePacketHash(base), buildSourcePacketHash(makeInput()));
  assert.notEqual(buildSourcePacketHash(base), buildSourcePacketHash(makeInput({ postUrl: "https://other" })));
  assert.notEqual(buildSourcePacketHash(base), buildSourcePacketHash(makeInput({ analysisPromptVersion: "v17" })));
  assert.notEqual(
    buildSourcePacketHash(base),
    buildSourcePacketHash(makeInput({ representativeComments: [{ ref: "e1", author: "x", text: "別的留言" }] }))
  );
  assert.notEqual(
    buildSourcePacketHash(base),
    buildSourcePacketHash(makeInput({ representativeComments: [{ ref: "e1", author: "x", text: "又一個記帳 App。", likeCount: 999 }] }))
  );
});

test("buildSignalReadingCacheKey 隨輸入改變", () => {
  const key = buildSignalReadingCacheKey({ signalId: "s", productContextHash: "c", sourcePacketHash: "p", promptVersion: "v1" });
  assert.equal(
    key,
    buildSignalReadingCacheKey({ signalId: "s", productContextHash: "c", sourcePacketHash: "p", promptVersion: "v1" })
  );
  assert.notEqual(
    key,
    buildSignalReadingCacheKey({ signalId: "s", productContextHash: "c2", sourcePacketHash: "p", promptVersion: "v1" })
  );
  assert.equal(
    key,
    buildSignalReadingCacheKey({
      signalId: "s",
      productContextHash: "c",
      sourcePacketHash: "p",
      promptVersion: "v1",
      contentHash: undefined
    })
  );
  assert.notEqual(
    key,
    buildSignalReadingCacheKey({
      signalId: "s",
      productContextHash: "c",
      sourcePacketHash: "p",
      promptVersion: "v1",
      contentHash: "content"
    })
  );
});

test("projected reading preserves explicit headline origin and root provenance", () => {
  const analyzerInput = makeAnalyzerInput();
  const reading = materializeProductAnalysisReading({
    analysis: makeAnalysisWithReading(),
    analyzerInput,
    postUrl: "https://www.threads.com/@author/post/abc"
  });

  assert.equal(reading?.headline, "值得注意的互動模式");
  assert.equal(reading?.origin, "product_analysis");
  assert.deepEqual(reading?.sourceRefs, ["root", "e1"]);
  assert.equal(reading?.sourcePacket.rootText, analyzerInput.rootText);
});

test("projected reading content identity is deterministic and changes with content", () => {
  const input = {
    analysis: makeAnalysisWithReading(),
    analyzerInput: makeAnalyzerInput(),
    postUrl: "https://www.threads.com/@author/post/abc"
  };
  const first = materializeProductAnalysisReading(input);
  const second = materializeProductAnalysisReading(input);
  const changed = materializeProductAnalysisReading({
    ...input,
    analysis: makeAnalysisWithReading({
      productReading: {
        headline: "另一個判讀",
        body: "另一段內容。",
        supportRefs: ["root", "e1"]
      }
    })
  });

  assert.equal(first?.cacheKey, second?.cacheKey);
  assert.notEqual(first?.cacheKey, changed?.cacheKey);
});

test("signal reading cache 命中與失效", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading());
  const hit = await getSignalReading(storage, DEFAULT_READING_CACHE_KEY);
  assert.equal(hit?.reading, "這則訊號顯示市場疲勞。");
  const miss = await getSignalReading(storage, "sig_1::ctx_1::DIFFERENT::v1");
  assert.equal(miss, null);
  assert.ok(storage.data[SIGNAL_READINGS_STORAGE_KEY]);
});

test("save/load 新 record 保留 model / sourceRefs / sourcePacket", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading());
  const hit = await getSignalReading(storage, DEFAULT_READING_CACHE_KEY);
  assert.equal(hit?.model, "google:gemini-3.1-flash-lite-preview");
  assert.deepEqual(hit?.sourceRefs, ["e1", "e4"]);
  assert.equal(hit?.sourcePacket.postUrl, "https://www.threads.net/@dev/post/abc");
  assert.equal(hit?.sourcePacket.representativeComments[0]?.text, "又一個記帳 App。");
  assert.equal(hit?.sourcePacket.representativeComments[0]?.likeCount, null);
  assert.deepEqual(hit?.feedbackEvents, []);
});

test("normalize 相容舊 record（無 model / sourcePacket / sourceRefs / feedbackEvents）", () => {
  const legacy = signalReadingStorageTestables.normalizeSignalReading({
    signalId: "sig_legacy",
    cacheKey: "sig_legacy::ctx::pkt::v1",
    productContextHash: "ctx",
    sourcePacketHash: "pkt",
    promptVersion: "v1",
    reading: "舊版判讀。",
    generatedAt: "2026-05-10T00:00:00.000Z"
  });
  assert.ok(legacy);
  assert.equal(legacy?.model, "");
  assert.deepEqual(legacy?.sourceRefs, []);
  assert.deepEqual(legacy?.feedbackEvents, []);
  assert.equal(legacy?.reviewState, "pending");
  assert.equal(legacy?.sourcePacket.assembledContent, "");
  assert.deepEqual(legacy?.sourcePacket.representativeComments, []);
});

test("appendSignalReadingReview 設 reviewState 並 append 事件", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading());
  const updated = await appendSignalReadingReview(storage, DEFAULT_READING_CACHE_KEY, "filed");
  assert.equal(updated?.reviewState, "filed");
  assert.equal(updated?.feedbackEvents.length, 1);
  assert.equal(updated?.feedbackEvents[0]?.type, "filed");
  const reloaded = await getSignalReading(storage, DEFAULT_READING_CACHE_KEY);
  assert.equal(reloaded?.reviewState, "filed");
});

test("appendSignalReadingReview 對不存在的 cacheKey 回 null", async () => {
  const storage = makeStorage();
  const result = await appendSignalReadingReview(storage, "no-such-key", "rejected");
  assert.equal(result, null);
});

test("listSignalReadings 與 latestReadingBySignalId", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading({ cacheKey: "sig_1::a", generatedAt: "2026-05-10T00:00:00.000Z" }));
  await saveSignalReading(storage, makeReading({ cacheKey: "sig_1::b", generatedAt: "2026-05-18T00:00:00.000Z" }));
  await saveSignalReading(storage, makeReading({ signalId: "sig_2", cacheKey: "sig_2::a", generatedAt: "2026-05-12T00:00:00.000Z" }));
  const all = await listSignalReadings(storage);
  assert.equal(all.length, 3);
  const latest = latestReadingBySignalId(all);
  assert.equal(latest.get("sig_1")?.cacheKey, "sig_1::b");
  assert.equal(latest.get("sig_2")?.cacheKey, "sig_2::a");
});

test("deleteSignalReadingsBySignalId 只刪目標 signal 的所有判讀", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading({ signalId: "sig_1", cacheKey: "sig_1::a" }));
  await saveSignalReading(storage, makeReading({ signalId: "sig_1", cacheKey: "sig_1::b", generatedAt: "2026-05-18T00:00:00.000Z" }));
  await saveSignalReading(storage, makeReading({ signalId: "sig_2", cacheKey: "sig_2::a", generatedAt: "2026-05-12T00:00:00.000Z" }));

  await deleteSignalReadingsBySignalId(storage, "sig_1");

  const readings = await listSignalReadings(storage);
  assert.deepEqual(readings.map((reading) => reading.cacheKey), ["sig_2::a"]);
});

test("signalReadingStaleness 偵測兩個原因", () => {
  assert.deepEqual(signalReadingStaleness(makeReading(), LEGACY_READING_PROMPT_VERSION).reasons, []);
  assert.deepEqual(
    signalReadingStaleness(makeReading({ promptVersion: "v0" }), LEGACY_READING_PROMPT_VERSION).reasons,
    ["prompt_version"]
  );
  const noProvenance = signalReadingStaleness(makeReading({ model: "" }), LEGACY_READING_PROMPT_VERSION);
  assert.equal(noProvenance.stale, true);
  assert.deepEqual(noProvenance.reasons, ["missing_provenance"]);
});

test("selectFiledReadings 只取 filed", () => {
  const readings = [
    makeReading({ cacheKey: "a", reviewState: "filed" }),
    makeReading({ cacheKey: "b", reviewState: "deferred" }),
    makeReading({ cacheKey: "c", reviewState: "rejected" }),
    makeReading({ cacheKey: "d", reviewState: "pending" })
  ];
  assert.deepEqual(
    selectFiledReadings(readings).map((reading) => reading.cacheKey),
    ["a"]
  );
});

test("composeReadingBrief 只組 filed、標示過期", () => {
  const analyses = new Map<string, ProductSignalAnalysis>([
    [
      "sig_1",
      { contentSummary: "毒舌記帳 App", verdict: "watch", relevance: 3, referenceLabel: "行銷素材" } as unknown as ProductSignalAnalysis
    ]
  ]);
  const brief = composeReadingBrief(
    [
      makeReading({ cacheKey: "filed", reviewState: "filed", reading: "已收錄的判讀內容。" }),
      makeReading({ cacheKey: "deferred", reviewState: "deferred", reading: "不該出現的待看判讀。" })
    ],
    analyses,
    LEGACY_READING_PROMPT_VERSION
  );
  assert.ok(brief.includes("已收錄的判讀內容。"));
  assert.ok(!brief.includes("不該出現的待看判讀。"));
  assert.ok(brief.includes("保留觀察"));

  const staleBrief = composeReadingBrief(
    [makeReading({ reviewState: "filed", promptVersion: "v0" })],
    new Map(),
    LEGACY_READING_PROMPT_VERSION
  );
  assert.ok(staleBrief.includes("判讀版本過期"));
});

test("composeReadingBrief prefers the projected reading headline and keeps legacy title fallback", () => {
  const analyses = new Map<string, ProductSignalAnalysis>([
    [
      "sig_1",
      {
        contentSummary: "分析摘要不應取代明確標題",
        verdict: "watch",
        relevance: 4
      } as unknown as ProductSignalAnalysis
    ]
  ]);
  const projectedBrief = composeReadingBrief(
    [makeReading({
      reviewState: "filed",
      headline: "先把互動模式當成有限驗證",
      origin: "product_analysis"
    })],
    analyses,
    LEGACY_READING_PROMPT_VERSION
  );
  assert.match(projectedBrief, /## 1\. 先把互動模式當成有限驗證/);
  assert.doesNotMatch(projectedBrief, /## 1\. 分析摘要不應取代明確標題/);

  const legacyBrief = composeReadingBrief(
    [makeReading({ reviewState: "filed" })],
    analyses,
    LEGACY_READING_PROMPT_VERSION
  );
  assert.match(legacyBrief, /## 1\. 分析摘要不應取代明確標題/);
  assert.doesNotMatch(legacyBrief, /Origin:/);
});

test("buildStoredSourcePacket 對長內容做保守裁切", () => {
  const packet = buildStoredSourcePacket(
    makeInput({
      rootText: "原文 root provenance",
      assembledContent: "x".repeat(20000),
      representativeComments: [{ ref: "e1", author: "u", text: "y".repeat(2000), likeCount: 12 }]
    })
  );
  assert.equal(packet.rootText, "原文 root provenance");
  assert.equal(packet.assembledContent.length, 8000);
  assert.equal(packet.representativeComments[0]?.text.length, 500);
  assert.equal(packet.representativeComments[0]?.likeCount, 12);
});

function makeReading(overrides: Partial<SignalReading> = {}): SignalReading {
  return {
    signalId: "sig_1",
    cacheKey: DEFAULT_READING_CACHE_KEY,
    productContextHash: "ctx_1",
    sourcePacketHash: "pkt_1",
    promptVersion: LEGACY_READING_PROMPT_VERSION,
    reading: "這則訊號顯示市場疲勞。",
    generatedAt: "2026-05-17T00:00:00.000Z",
    model: "google:gemini-3.1-flash-lite-preview",
    sourceRefs: ["e1", "e4"],
    sourcePacket: {
      assembledContent: "原文內容",
      postUrl: "https://www.threads.net/@dev/post/abc",
      representativeComments: [{ ref: "e1", author: "userA", text: "又一個記帳 App。" }],
      analysisPromptVersion: "v16"
    },
    reviewState: "pending",
    feedbackEvents: [],
    ...overrides
  };
}

function makeAnalyzerInput(): ProductSignalAnalyzerInput {
  return {
    signalId: "sig_1",
    source: "threads",
    rootText: "原文展示一個值得注意的互動模式。",
    assembledContent: "原文展示一個值得注意的互動模式。\n\n留言認為這值得有限驗證。",
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
    productContext: { productPromise: "幫產品團隊讀懂社群訊號。" } as unknown as ProductContext,
    productContextHash: "ctx_1"
  };
}

function makeAnalysisWithReading(
  overrides: Partial<ProductSignalAnalysis> = {}
): ProductSignalAnalysis {
  return {
    signalId: "sig_1",
    signalType: "learning",
    signalSubtype: "interaction_pattern",
    contentType: "content",
    contentSummary: "一個互動模式。",
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
    productContextHash: "ctx_1",
    promptVersion: "v21",
    model: "google:gemini-3.1-flash-lite-preview",
    analyzedAt: "2026-07-23T00:00:00.000Z",
    status: "complete",
    ...overrides
  };
}
