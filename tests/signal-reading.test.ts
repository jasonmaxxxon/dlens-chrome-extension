import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignalReadingPrompt,
  selectSignalReadingRepresentativeRefs,
  buildSourcePacketHash,
  buildStoredSourcePacket,
  SIGNAL_READING_SYSTEM_PROMPT,
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

const DEFAULT_READING_CACHE_KEY = `sig_1::ctx_1::pkt_1::${SIGNAL_READING_PROMPT_VERSION}`;

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
  assert.ok(prompt.includes("e1（userA · 226 讚）：又一個記帳 App。"));
  assert.ok(prompt.indexOf("e1（userA · 226 讚）") < prompt.indexOf("e2（userB · 4 讚）"));
  assert.ok(prompt.includes("判斷：watch / competitor"));
});

test("buildSignalReadingPrompt 回到 v0.1.13 的自然自由判讀 prompt", () => {
  const prompt = buildSignalReadingPrompt(makeInput());

  assert.equal(SIGNAL_READING_PROMPT_VERSION, "v9");
  assert.equal(
    SIGNAL_READING_SYSTEM_PROMPT,
    "你是一個產品訊號的深度閱讀者。你的工作不是填表格，也不是替產品團隊下指令，而是把一則社群訊號讀懂，老實告訴一個產品開發者：這裡面有沒有真正值得注意的東西。"
  );
  assert.doesNotMatch(SIGNAL_READING_SYSTEM_PROMPT, /你直接說你讀到了什麼/);
  assert.doesNotMatch(SIGNAL_READING_SYSTEM_PROMPT, /不要 frame、不要 meta、不要鋪陳/);
  assert.match(prompt, /\[任務\]/);
  assert.match(prompt, /讀下面這則訊號，包括原文、原文連結、代表性觀眾留言、產品脈絡，以及既有結構化分析。/);
  assert.match(prompt, /請寫一段自由判讀，給一個會再審視你判讀的產品開發者或 agent 看。/);
  assert.match(prompt, /不要套固定結構。不要強行找 audience gap、workflow recipe、技術機制、定位風險或市場情緒。/);
  assert.match(prompt, /訊號是什麼形狀，就用什麼形狀寫；如果沒有值得行動或保留的東西，直接說。/);
  assert.match(prompt, /\[思考規則\]/);
  assert.match(prompt, /讓讀者看得出哪些是證據、哪些是推論、哪些是不確定。/);
  assert.match(prompt, /證據只能來自原文或觀眾留言；不能把既有結構化分析當證據。/);
  assert.match(prompt, /既有結構化分析只供參考。你可以同意、修正或反駁它，但不要被它的欄位形狀帶著走。/);
  assert.match(prompt, /寫給「會審視」的人，不是寫給「會直接照做」的人。請指出他應該自行驗證什麼。/);
  assert.match(prompt, /產品脈絡必須參考，但不要硬把訊號塞進產品。/);
  assert.match(prompt, /繁體中文自由文字。長度由內容決定，三句講得完就三句。不要 markdown 表格，不要 JSON。/);
  assert.doesNotMatch(prompt, /\[兩條規則\]/);
  assert.doesNotMatch(prompt, /\[長度\]/);
  assert.doesNotMatch(prompt, /\[只禁三個\]/);
  assert.doesNotMatch(prompt, /每段 <=100 字/);
  assert.doesNotMatch(prompt, /接下來 2-4 段/);
  assert.doesNotMatch(prompt, /每段可以針對的角度/);
  assert.doesNotMatch(prompt, /觀眾反應的主導訊號/);
  assert.doesNotMatch(prompt, /可以保留的用法/);
  assert.doesNotMatch(prompt, /不要替留言者補心理動機/);
  assert.doesNotMatch(prompt, /高互動批評可以推翻既有結構化分析/);
  assert.doesNotMatch(prompt, /上限 200 字/);
});

test("selectSignalReadingRepresentativeRefs unions analyzer refs with top-liked replies", () => {
  const replies = Array.from({ length: 20 }, (_, index) => ({
    id: `reply-${index + 1}`,
    author: `user-${index + 1}`,
    text: `reply ${index + 1}`,
    likeCount: 0
  }));
  replies[1] = { ...replies[1]!, likeCount: 226 };
  replies[2] = { ...replies[2]!, likeCount: 54 };
  replies[3] = { ...replies[3]!, likeCount: 20 };
  replies[4] = { ...replies[4]!, likeCount: 18 };
  replies[5] = { ...replies[5]!, likeCount: 16 };
  replies[6] = { ...replies[6]!, likeCount: 14 };
  replies[7] = { ...replies[7]!, likeCount: 2 };
  replies[9] = { ...replies[9]!, likeCount: 1 };

  const refs = selectSignalReadingRepresentativeRefs(replies, ["e1", "e8", "e10"]);

  assert.equal(refs.length, 15);
  assert.deepEqual(refs.slice(0, 6), ["e1", "e8", "e10", "e2", "e3", "e4"]);
  assert.ok(refs.includes("e5"));
  assert.ok(refs.includes("e6"));
  assert.ok(refs.includes("e7"));
});

test("selectSignalReadingRepresentativeRefs falls back to top-liked replies and ignores invalid analyzer refs", () => {
  const replies = [
    { id: "a", author: "a", text: "a", likeCount: 0 },
    { id: "b", author: "b", text: "b", likeCount: 10 },
    { id: "c", author: "c", text: "c", likeCount: 10 },
    { id: "d", author: "d", text: "d", likeCount: null }
  ];

  assert.deepEqual(selectSignalReadingRepresentativeRefs(replies, ["e99", "bad", "e2"], 3), ["e2", "e3", "e1"]);
  assert.deepEqual(selectSignalReadingRepresentativeRefs(replies, [], 3), ["e2", "e3", "e1"]);
});

test("buildSignalReadingPrompt renders audience like weight before free reading", () => {
  const prompt = buildSignalReadingPrompt(
    makeInput({
      representativeComments: [
        { ref: "e8", author: "low", text: "被串會有壓力。", likeCount: 4 },
        { ref: "e2", author: "royrekt", text: "記帳app 到底有咩咁大吸引力 😂", likeCount: 226 },
        { ref: "e3", author: "panghl1017", text: "第唔知幾多萬個記帳 AI Hello World project了", likeCount: 54 }
      ]
    })
  );

  assert.ok(prompt.indexOf("e2（royrekt · 226 讚）") < prompt.indexOf("e3（panghl1017 · 54 讚）"));
  assert.ok(prompt.indexOf("e3（panghl1017 · 54 讚）") < prompt.indexOf("e8（low · 4 讚）"));
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
      representativeComments: [{ ref: "e1", author: "u", text: "y".repeat(2000), likeCount: 12 }]
    })
  );
  assert.equal(packet.assembledContent.length, 8000);
  assert.equal(packet.representativeComments[0]?.text.length, 500);
  assert.equal(packet.representativeComments[0]?.likeCount, 12);
});

test("generateSignalReading 無 API key 時回明確錯誤", async () => {
  await assert.rejects(() => generateSignalReading("openai", "", makeInput()), /AI key/);
});

function makeReading(overrides: Partial<SignalReading> = {}): SignalReading {
  return {
    signalId: "sig_1",
    cacheKey: DEFAULT_READING_CACHE_KEY,
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
