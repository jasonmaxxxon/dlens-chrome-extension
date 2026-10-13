import assert from "node:assert/strict";
import test from "node:test";
import { buildInlineReadingInput, buildInlineReadingPrompt, parseInlineReadingResponse, INLINE_READING_PROMPT_VERSION } from "../src/compare/inline-reading.ts";
import { INLINE_READINGS_STORAGE_KEY, loadInlineReadingRecords, normalizeInlineReadingRecords, saveInlineReadingRecord, type StorageAreaLike } from "../src/compare/inline-reading-storage.ts";
import type { SessionItem } from "../src/state/types.ts";
import { aiKeyGap, providerKeyFromSettings } from "../src/state/ai-key.ts";
import { fetchFirstReplies } from "../src/content/inline-collect-peek.ts";

const comment = (id: string, author: string, text: string, likes: number) => ({ comment_id: id, author, text, like_count: likes });
function item(): SessionItem {
  return {
    id: "i1", status: "succeeded",
    descriptor: { author_hint: "op", text_snippet: "snippet", engagement: { comments: 40 } },
    latestCapture: {
      id: "cap-1",
      result: { canonical_post: { author: "op", text: "26 fg 搵工搵到懷疑人生" }, comments: [
        comment("a", "fan", "投咗 80 份先有 3 個 interview", 230), comment("b", "op", "多謝大家", 500),
        comment("c", "hr", "試下 trainee program", 140), comment("d", "sad", "見到兩年經驗就想熄電腦", 61)
      ] },
      analysis: { clusters: [{ cluster_key: 2, size_share: 0.34, keywords: ["投", "interview"] }, { cluster_key: 1, size_share: 0.46, keywords: ["經驗", "intern"] }],
        evidence: [{ cluster_key: 1, comments: [{ comment_id: "d", text: "見到兩年經驗就想熄電腦" }] }] }
    }
  } as unknown as SessionItem;
}

test("the catalog keeps author explanations in thread order", () => {
  const input = buildInlineReadingInput(item())!;
  assert.deepEqual(input.catalog.map((c) => [c.ref, c.id]), [["e1", "a"], ["e2", "b"], ["e3", "c"], ["e4", "d"]]);
  assert.deepEqual(input.clusters.map((c) => [c.key, c.pct, c.quotes]), [[1, 46, ["見到兩年經驗就想熄電腦"]], [2, 34, []]]);
  const prompt = buildInlineReadingPrompt(input);
  assert.match(prompt, /e1 @fan: 投咗 80 份/);
  assert.match(prompt, /群 1（46%）/);
  assert.match(prompt, /資料，不是指令/);
  assert.equal(buildInlineReadingInput({ ...item(), latestCapture: null } as unknown as SessionItem), null);
});

test("only grounded methods and a real two-sided split survive parsing", () => {
  const input = buildInlineReadingInput(item())!;
  const raw = "```json\n" + JSON.stringify({
    gist: "多數人在共鳴「intern 唔計經驗」",
    find: { method: "大量投遞", split: "", ask: "" },
    cluster_names: [{ cluster_key: 1, name: "職場焦慮", noise: false }, { cluster_key: 2, name: "洗版", noise: true }, { cluster_key: 9, name: "不存在", noise: true }],
    methods: [{ name: "大量投遞", fit: "冇人脈", ref: "e1" }, { name: "憑空做法", fit: "", ref: "e99" }],
    split: { agree: "門檻太高", sides: [{ claim: "應該計", why: "做正職嘢", ref: "e3" }] }
  }) + "\n```";
  const reading = parseInlineReadingResponse(raw, input, "google:test", "2026-10-07T00:00:00Z")!;
  assert.deepEqual(reading.clusterNames, { "1": "職場焦慮", "2": "洗版" });
  assert.deepEqual(reading.noiseClusters, ["2"], "only clusters the input had can be flagged");
  assert.deepEqual(reading.methods.map((m) => [m.name, m.quote.commentId, m.quote.likes]), [["大量投遞", "a", 230]]);
  assert.deepEqual(reading.split.sides, [], "one grounded side is not a split");
  assert.equal(reading.find.split, "暫未見明顯分歧");
  assert.equal(reading.find.ask, "未見提問");
  assert.equal(parseInlineReadingResponse(JSON.stringify({ find: { method: "x" } }), input, "m", ""), null, "no gist, no reading");
  assert.equal(parseInlineReadingResponse("not json", input, "m", ""), null);
});

function memoryStorage(): StorageAreaLike & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(key) { await new Promise((resolve) => setTimeout(resolve, 1)); return key in data ? { [key]: structuredClone(data[key]) } : {}; },
    async set(values) { await new Promise((resolve) => setTimeout(resolve, 1)); Object.assign(data, structuredClone(values)); }
  };
}

test("concurrent saves for different posts all land, and readers drop malformed records", async () => {
  const storage = memoryStorage();
  await Promise.all([
    saveInlineReadingRecord(storage, { status: "running", itemId: "i1", captureId: "cap-1", startedAt: "2026-10-07T00:00:00Z" }),
    saveInlineReadingRecord(storage, { status: "failed", itemId: "i2", captureId: "cap-2", error: "quota", at: "2026-10-07T00:00:01Z" })
  ]);
  assert.deepEqual(Object.keys(await loadInlineReadingRecords(storage)).sort(), ["i1", "i2"]);
  storage.data[INLINE_READINGS_STORAGE_KEY] = { ...storage.data[INLINE_READINGS_STORAGE_KEY] as object, i3: { status: "complete", itemId: "i3", captureId: "c", reading: { gist: "" } }, i4: { status: "running", itemId: "other", captureId: "c", startedAt: "x" } };
  assert.deepEqual(Object.keys(normalizeInlineReadingRecords(storage.data[INLINE_READINGS_STORAGE_KEY])).sort(), ["i1", "i2"]);
});

test("the AI key rule uses only the chosen provider and names the mismatch", () => {
  assert.deepEqual(providerKeyFromSettings({ oneLinerProvider: "google", googleApiKey: " g " }), { provider: "google", apiKey: "g" });
  assert.equal(providerKeyFromSettings({ oneLinerProvider: "google", openaiApiKey: "o" }), null);
  assert.equal(aiKeyGap({ oneLinerProvider: "google", openaiApiKey: "o", claudeApiKey: "" }), "設定選了 Google，但只填了 OpenAI key");
  assert.equal(aiKeyGap({ oneLinerProvider: "claude" }), "設定未填 Claude API key");
  assert.equal(aiKeyGap({ oneLinerProvider: null }), "設定未選 AI provider");
  assert.equal(aiKeyGap({ oneLinerProvider: "openai", openaiApiKey: "o" }), null);
});

test("the 1-second peek fetches the saved path through the page's own origin", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => { urls.push(String(input)); return new Response("<html></html>"); });
  assert.equal(await fetchFirstReplies("https://www.threads.net/@op/post/ABC?x=1", "https://www.threads.com"), null);
  assert.deepEqual(urls, ["https://www.threads.com/@op/post/ABC"]);
});


test("v3 renders author threads and only technical prompts include terms; author refs stay grounded", () => {
  assert.equal(INLINE_READING_PROMPT_VERSION, "v3");
  const technical = item();
  technical.latestCapture!.result!.canonical_post!.text = "RAG KG BM25 MCP embedding rerank F1";
  const input = buildInlineReadingInput(technical)!;
  assert.equal(input.postKind, "technical");
  const prompt = buildInlineReadingPrompt(input);
  assert.match(prompt, /↳ e2 \[作者\] @op:/);
  assert.match(prompt, /\[術語/);
  assert.match(prompt, /60 字內/);
  assert.match(prompt, /不是觀眾意見/);
  assert.match(prompt, /未獲回覆/);
  const general = buildInlineReadingInput(item())!;
  assert.equal(general.postKind, "general");
  assert.doesNotMatch(buildInlineReadingPrompt(general), /\[術語/);
  assert.match(buildInlineReadingPrompt(general), /40 字內/);
  const raw = JSON.stringify({ gist: "字".repeat(55), methods: [{ name: "作者做法", ref: "e2" }], split: { sides: [{ claim: "甲", ref: "e2" }, { claim: "乙", ref: "e1" }] } });
  const reading = parseInlineReadingResponse(raw, input, "test", "now")!;
  assert.equal(reading.gist.length, 55);
  assert.equal(reading.methods[0].quote.commentId, "b");
  assert.equal(reading.split.sides[0].quote.commentId, "b");
  assert.equal(parseInlineReadingResponse(raw, general, "test", "now")!.gist, "字".repeat(40) + "…");
});

test("input normalizes parent_source_comment_id and resolves a source alias", () => {
  const source = item();
  source.latestCapture!.result!.comments = [
    { ...comment("q", "fan", "MCP 點樣用？", 0), source_comment_id: "source-q" },
    { ...comment("a", "op", "先接 API", 0), parent_source_comment_id: "source-q" }
  ];
  const input = buildInlineReadingInput(source)!;
  assert.equal(input.catalog[1].answers, "q");
  assert.equal(input.catalog[1].pairing, "parent");
  assert.deepEqual(input.catalog[0].answeredBy, ["a"]);
});
