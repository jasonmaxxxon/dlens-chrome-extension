import assert from "node:assert/strict";
import test from "node:test";

import {
  aiOutputProvenanceFromModel,
  describeAiOutputProvenance,
  normalizeAiOutputProvenance
} from "../src/state/ai-provenance.ts";

test("normalizeAiOutputProvenance collapses legacy unknown/null to missing", () => {
  assert.equal(normalizeAiOutputProvenance("ai"), "ai");
  assert.equal(normalizeAiOutputProvenance("fallback"), "fallback");
  assert.equal(normalizeAiOutputProvenance("missing"), "missing");
  assert.equal(normalizeAiOutputProvenance("unknown"), "missing");
  assert.equal(normalizeAiOutputProvenance(null), "missing");
  assert.equal(normalizeAiOutputProvenance(undefined), "missing");
  assert.equal(normalizeAiOutputProvenance(""), "missing");
  assert.equal(normalizeAiOutputProvenance("manual"), "missing");
});

test("aiOutputProvenanceFromModel treats a concrete model as AI and blank model as missing", () => {
  assert.equal(aiOutputProvenanceFromModel("google:gemini"), "ai");
  assert.equal(aiOutputProvenanceFromModel("  "), "missing");
  assert.equal(aiOutputProvenanceFromModel(undefined), "missing");
});

test("describeAiOutputProvenance gives honest display labels for every state", () => {
  assert.deepEqual(describeAiOutputProvenance("ai"), {
    label: "AI 生成",
    detail: "由已設定的模型產生",
    tone: "success"
  });
  assert.deepEqual(describeAiOutputProvenance("fallback"), {
    label: "本機 fallback",
    detail: "由 deterministic fallback 產生，不是模型判讀",
    tone: "warning"
  });
  assert.deepEqual(describeAiOutputProvenance("missing"), {
    label: "來源未標示",
    detail: "這筆輸出缺少 AI / fallback provenance",
    tone: "neutral"
  });
});
