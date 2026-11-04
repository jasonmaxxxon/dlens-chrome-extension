import assert from "node:assert/strict";
import test from "node:test";
import { classifyCommentQuality, commentQualityLabel } from "../src/compare/comment-quality.ts";

test("bookmark patterns are exact, punctuation-normalized flags without deleting text", () => {
  for (const text of ["留己看", "留個位", "留個位～", " 留 個 位！ ", "留嚟睇👀", "留名", "收藏先", "蹲一個", "Bookmark!", "ｍａｒｋ"]) {
    const original = text;
    assert.deepEqual(classifyCommentQuality(text), { flag: "bookmark", reason: "bookmark_pattern" }, text);
    assert.equal(text, original);
  }
});

test("acknowledgment flags stay exact instead of deleting substantive short replies", () => {
  for (const text of ["多謝！", "謝謝", "收到～", "Thanks!", "OK", "有", "有！", "👍有"]) {
    assert.equal(classifyCommentQuality(text).flag, "acknowledgment", text);
  }
  for (const text of ["邊度買？", "有冇教學？", "可以分享做法嗎", "用 BM25", "每月 $20", "RAM 32GB", "有 bug", "有，用 BM25", "好用", "明白，先建立索引", "留低做法俾大家", "", "👍"]) {
    assert.equal(classifyCommentQuality(text).flag, null, text);
  }
});

test("a bare affirmative is substantive only with genuine yes/no parent context", () => {
  for (const parentText of ["有冇教學？", "你有用過嗎？", "Does it support Cantonese?", "Can I use this offline?"]) {
    for (const text of ["有", "有！", "Yes", "冇"]) {
      assert.deepEqual(classifyCommentQuality(text, { parentText }), { flag: null, reason: "contextual_yes_no_answer" }, `${text} ← ${parentText}`);
    }
  }
  for (const parentText of ["邊度買？", "點解要用 RAG？", '"有冇教學？"', "https://example.com/?can=try", "???", "我知道點樣做", ""]) {
    assert.deepEqual(classifyCommentQuality("有", { parentText }), { flag: "acknowledgment", reason: "bare_affirmation_without_context" }, parentText);
  }
  assert.equal(classifyCommentQuality("謝謝", { parentText: "有冇教學？" }).flag, "acknowledgment");
});

test("quiet flag labels are optional and do not call rows spam", () => {
  assert.equal(commentQualityLabel("bookmark"), "留位／收藏");
  assert.equal(commentQualityLabel("acknowledgment"), "簡短回應");
  assert.equal(commentQualityLabel(null), null);
  assert.equal(commentQualityLabel(undefined), null);
});
