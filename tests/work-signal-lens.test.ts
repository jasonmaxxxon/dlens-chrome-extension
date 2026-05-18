import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkNarrative,
  collectWorkSignalHits,
  extractRepeatedWorkPhrases,
  type WorkSignalRow
} from "../src/compare/work-signal-lens.ts";

const rows: WorkSignalRow[] = [
  {
    signalId: "s1",
    author: "alice",
    text: "90後初入職場日記（1） 你冇聽錯 我作為90尾 而家先開始入職場 ... 融入唔到 只係想🤧下",
    keywords: ["初入職場", "新人", "工作"]
  },
  {
    signalId: "s2",
    author: "bob",
    text: "屌，感覺而家搵工時勢真係好差 想返份工都難",
    keywords: ["搵工", "返工", "壓力"]
  },
  {
    signalId: "s3",
    author: "carol",
    text: "日頭做 PR 拆彈，表面望落好冷靜準備做嘢，實際上只係爭取緊時間",
    keywords: ["壓力", "工作", "PR"]
  }
];

test("collectWorkSignalHits surfaces entry and quit themed work buckets", () => {
  const hits = collectWorkSignalHits(rows);

  assert.ok(hits.some((hit) => hit.bucket.id === "entry-anxiety"));
  assert.ok(hits.some((hit) => hit.bucket.id === "quit-escape"));
  assert.ok(hits.some((hit) => hit.bucket.id === "burnout-pressure"));
});

test("buildWorkNarrative emphasizes work escape and entry anxiety", () => {
  const hits = collectWorkSignalHits(rows);
  const narrative = buildWorkNarrative(rows, hits);

  assert.match(narrative, /工作如何令人想逃離或降低投入/);
  assert.match(narrative, /入職\/適應情境/);
});

test("extractRepeatedWorkPhrases prefers work phrases over generic nouns", () => {
  const phrases = extractRepeatedWorkPhrases(rows, 5);
  const labels = phrases.map((item) => item.phrase);

  assert.ok(labels.includes("初入職場"));
  assert.ok(labels.includes("返份工") || labels.includes("返工") || labels.includes("想辭職"));
  assert.ok(!labels.includes("自己"));
});
