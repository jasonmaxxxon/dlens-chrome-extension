import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignalReadingPrompt,
  buildSourcePacketHash,
  buildStoredSourcePacket,
  type SignalReadingInput
} from "../src/compare/signal-reading.ts";
import {
  appendSignalReadingReview,
  buildSignalReadingCacheKey,
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
import { SIGNAL_READING_PROMPT_VERSION } from "../src/compare/signal-reading.ts";
import { generateSignalReading } from "../src/compare/provider.ts";
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
      { ref: "e1", author: "userA", text: "又一個記帳 App。" },
      { ref: "e2", author: "userB", text: "毒舌語氣很煩。" }
    ],
    productContext: { productPromise: "幫產品團隊讀社群訊號。" } as unknown as ProductContext,
    productContextHash: "ctx_1",
    analysisPromptVersion: "v16",
    existingAnalysisSummary: "判斷：watch / competitor",
    ...overrides
  };
}

test("buildSignalReadingPrompt 不含 JSON/schema 語言污染", () => {
  const prompt = buildSignalReadingPrompt(makeInput());
  for (const pollutant of [
    "json schema",
    "JSON schema",
    "回傳 JSON",
    "只回傳",
    "\"type\":",
    "additionalProperties",
    "response_format",
    "json_object",
    "snake_case",
    "enum"
  ]) {
    assert.ok(!prompt.includes(pollutant), `prompt 不應含 "${pollutant}"`);
  }
});

test("buildSignalReadingPrompt 帶入來源資料", () => {
  const prompt = buildSignalReadingPrompt(makeInput());
  assert.ok(prompt.includes("https://www.threads.net/@dev/post/abc"));
  assert.ok(prompt.includes("又一個記帳 App。"));
  assert.ok(prompt.includes("判斷：watch / competitor"));
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
});

test("signal reading cache 命中與失效", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading());
  const hit = await getSignalReading(storage, "sig_1::ctx_1::pkt_1::v1");
  assert.equal(hit?.reading, "這則訊號顯示市場疲勞。");
  const miss = await getSignalReading(storage, "sig_1::ctx_1::DIFFERENT::v1");
  assert.equal(miss, null);
  assert.ok(storage.data[SIGNAL_READINGS_STORAGE_KEY]);
});

test("save/load 新 record 保留 model / sourceRefs / sourcePacket", async () => {
  const storage = makeStorage();
  await saveSignalReading(storage, makeReading());
  const hit = await getSignalReading(storage, "sig_1::ctx_1::pkt_1::v1");
  assert.equal(hit?.model, "google:gemini-3.1-flash-lite-preview");
  assert.deepEqual(hit?.sourceRefs, ["e1", "e4"]);
  assert.equal(hit?.sourcePacket.postUrl, "https://www.threads.net/@dev/post/abc");
  assert.equal(hit?.sourcePacket.representativeComments[0]?.text, "又一個記帳 App。");
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
  const updated = await appendSignalReadingReview(storage, "sig_1::ctx_1::pkt_1::v1", "filed");
  assert.equal(updated?.reviewState, "filed");
  assert.equal(updated?.feedbackEvents.length, 1);
  assert.equal(updated?.feedbackEvents[0]?.type, "filed");
  const reloaded = await getSignalReading(storage, "sig_1::ctx_1::pkt_1::v1");
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

test("signalReadingStaleness 偵測兩個原因", () => {
  assert.deepEqual(signalReadingStaleness(makeReading(), SIGNAL_READING_PROMPT_VERSION).reasons, []);
  assert.deepEqual(
    signalReadingStaleness(makeReading({ promptVersion: "v0" }), SIGNAL_READING_PROMPT_VERSION).reasons,
    ["prompt_version"]
  );
  const noProvenance = signalReadingStaleness(makeReading({ model: "" }), SIGNAL_READING_PROMPT_VERSION);
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
    SIGNAL_READING_PROMPT_VERSION
  );
  assert.ok(brief.includes("已收錄的判讀內容。"));
  assert.ok(!brief.includes("不該出現的待看判讀。"));
  assert.ok(brief.includes("保留觀察"));

  const staleBrief = composeReadingBrief(
    [makeReading({ reviewState: "filed", promptVersion: "v0" })],
    new Map(),
    SIGNAL_READING_PROMPT_VERSION
  );
  assert.ok(staleBrief.includes("判讀版本過期"));
});

test("buildStoredSourcePacket 對長內容做保守裁切", () => {
  const packet = buildStoredSourcePacket(
    makeInput({
      assembledContent: "x".repeat(20000),
      representativeComments: [{ ref: "e1", author: "u", text: "y".repeat(2000) }]
    })
  );
  assert.equal(packet.assembledContent.length, 8000);
  assert.equal(packet.representativeComments[0]?.text.length, 500);
});

test("generateSignalReading 無 API key 時回明確錯誤", async () => {
  await assert.rejects(() => generateSignalReading("openai", "", makeInput()), /AI key/);
});

function makeReading(overrides: Partial<SignalReading> = {}): SignalReading {
  return {
    signalId: "sig_1",
    cacheKey: "sig_1::ctx_1::pkt_1::v1",
    productContextHash: "ctx_1",
    sourcePacketHash: "pkt_1",
    promptVersion: SIGNAL_READING_PROMPT_VERSION,
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
