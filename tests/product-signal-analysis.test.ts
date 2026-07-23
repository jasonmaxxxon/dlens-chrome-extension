import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA,
  PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
  buildProductContextHash,
  buildProductSignalEvidenceCatalogFromCapture,
  buildProductSignalAnalyzerInputFromCapture,
  buildProductSignalAnalyzerPrompt,
  collectQueueableProductSignalItemIds,
  deriveProductSignalVerdict,
  hasDrainableProductSignalItems,
  parseProductSignalAnalysisResponse,
  shouldDrainWorkerAfterProductSignalQueue,
  shouldAutoAnalyzeProductSignal
} from "../src/compare/product-signal-analysis.ts";
import type {
  ProductContext,
  ProductSignalConflictState,
  ProductSignalEvidenceState,
  ProductSignalJudgmentAxes,
  ProductSignalTestability,
  ProductSignalUsefulness,
  SessionRecord,
  Signal
} from "../src/state/types.ts";

const productContext: ProductContext = {
  productPromise: "把 Threads 訊號變成產品判斷。",
  targetAudience: "indie builders",
  agentRoles: ["collector", "judge"],
  coreWorkflows: ["save post", "classify signal"],
  currentCapabilities: ["topic mode"],
  explicitConstraints: ["local-first"],
  nonGoals: ["multi-tenant SaaS"],
  preferredTechDirection: "Chrome extension first",
  evaluationCriteria: ["reduces manual reading"],
  unknowns: ["mobile reader"],
  compiledAt: "2026-04-27T00:00:00.000Z",
  sourceFileIds: ["file_readme"],
  promptVersion: "v1"
};

const analyzerInput = {
  signalId: "signal-1",
  source: "threads" as const,
  rootText: "Root feature share\nOP continues with implementation details.",
  assembledContent: "Root feature share\n\nOP continues with implementation details.",
  discussionReplies: [
    {
      id: "c1",
      author: "bob",
      text: "This matches my workflow.",
      likeCount: 4,
      role: "audience" as const,
      isOrphan: false,
      parentId: null,
      resolvedParentId: null
    },
    {
      id: "c2",
      author: "cara",
      text: "How is this different from Productboard?",
      likeCount: 2,
      role: "audience" as const,
      isOrphan: false,
      parentId: null,
      resolvedParentId: null
    }
  ],
  productContext,
  productContextHash: buildProductContextHash(productContext)
};

test("buildProductSignalAnalyzerPrompt uses assembled content and no contentTypeHint", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);

  assert.match(prompt, /ProductSignalAnalyzer/);
  assert.match(prompt, /Root feature share/);
  assert.match(prompt, /OP continues with implementation details/);
  assert.match(prompt, /e1 role=audience orphan=false parent=none author=bob likes=4/);
  assert.match(prompt, /把 Threads 訊號變成產品判斷/);
  assert.match(prompt, /"usefulness": "useful\|uncertain\|none"/);
  assert.match(prompt, /product_reading/);
  assert.match(prompt, /不要輸出 verdict/);
  assert.doesNotMatch(prompt, /contentTypeHint/i);
});

test("buildProductSignalAnalyzerPrompt defines the v21 four-axis and Product Reading contract", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, "v21");
  assert.match(prompt, /product_reading/);
  assert.doesNotMatch(prompt, /application_suggestions/);
  assert.doesNotMatch(prompt, /watch_guidance/);
  assert.match(prompt, /低優先順序不等於 park/);
  assert.match(prompt, /external media\/repo\/link contents remain unverified/i);
  assert.match(prompt, /保留觀察|watch/);
});

test("ProductSignalAnalyzer v21 schema owns one nullable product reading", async () => {
  const { PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION } = await import("../src/compare/product-signal-analysis.ts");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, "v21");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION, "v21");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.type, "object");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.additionalProperties, false);
  const required = new Set(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.required);
  assert.equal(required.has("product_reading"), true);
  assert.equal(required.has("application_suggestions"), false);
  assert.equal(required.has("watch_guidance"), false);
  const props = PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties as Record<string, unknown>;
  assert.equal(props.application_suggestions, undefined);
  assert.equal(props.watch_guidance, undefined);
  assert.deepEqual(
    (props.product_reading as {
      type: readonly string[];
      additionalProperties: boolean;
      required: readonly string[];
    }).type,
    ["object", "null"]
  );
  assert.equal((props.product_reading as { additionalProperties: boolean }).additionalProperties, false);
  assert.deepEqual(
    [...(props.product_reading as { required: readonly string[] }).required].sort(),
    ["body", "headline", "support_refs"]
  );
  const supportRefs = (props.product_reading as {
    properties: { support_refs: { type: string; minItems: number; maxItems: number } };
  }).properties.support_refs;
  assert.deepEqual(supportRefs, {
    type: "array",
    minItems: 1,
    maxItems: 5,
    items: { type: "string" }
  });
  assert.ok("agent_task_spec" in PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.reference_type.enum, [
    "product_reference",
    "technical_learning",
    "workflow_pattern",
    "market_language",
    "general_learning",
    "no_direct_fit"
  ]);
  assert.ok(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.relevant_to.items.enum.includes("technicalLearning"));
  assert.ok(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.relevant_to.items.enum.includes("generalLearning"));
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.signal_type.enum, [
    "learning",
    "competitor",
    "demand",
    "technical",
    "marketing",
    "noise"
  ]);
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.verdict, undefined);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.usefulness.enum, [
    "useful",
    "uncertain",
    "none"
  ]);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.testability.enum, [
    "reversible_test",
    "not_yet_testable",
    "not_applicable"
  ]);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.evidence_state.enum, [
    "text_sufficient",
    "external_unverified",
    "insufficient"
  ]);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.conflict_state.enum, [
    "none",
    "explicit_constraint",
    "explicit_non_goal"
  ]);
});

// Offline e2e equivalent for OpenAI strict mode: no API call, but enforces every
// requirement OpenAI Structured Outputs documents for response_format.json_schema
// (every property in `required`, optionals as type+null union, nested objects also
// strict). Catches the failure mode Codex flagged without needing a key.
test("PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA satisfies OpenAI Structured Outputs strict mode", () => {
  const allowedKeywords = new Set([
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "enum",
    "minItems",
    "maxItems"
  ]);
  type SchemaNode = {
    type?: unknown;
    properties?: Record<string, SchemaNode>;
    required?: string[];
    additionalProperties?: boolean;
    items?: SchemaNode;
    enum?: unknown[];
    minItems?: number;
    maxItems?: number;
  };

  function walk(node: SchemaNode, path: string): void {
    for (const keyword of Object.keys(node)) {
      assert.ok(
        allowedKeywords.has(keyword),
        `${path}: unsupported OpenAI strict-schema keyword '${keyword}'`
      );
    }
    const types = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
    if (types.includes("object") || node.properties) {
      assert.equal(node.additionalProperties, false, `${path}: object must set additionalProperties=false`);
      const propKeys = Object.keys(node.properties ?? {});
      const required = node.required ?? [];
      assert.deepEqual(
        [...required].sort(),
        [...propKeys].sort(),
        `${path}: every declared property must appear in 'required' (strict mode)`
      );
      for (const key of propKeys) {
        walk(node.properties![key]!, `${path}.${key}`);
      }
    }
    if (types.includes("array") || node.items) {
      assert.ok(node.items, `${path}: array must declare items`);
      walk(node.items as SchemaNode, `${path}[]`);
    }
  }

  walk(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA as SchemaNode, "$");
});

test("strict schema keeps only the minimal current analyzer fields plus evidence notes", () => {
  const props = PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties as Record<string, any>;
  const experiment = props.experiment_hint as { type: unknown };
  assert.ok(Array.isArray(experiment.type) && experiment.type.includes("null"), "experiment_hint must be nullable");
  assert.equal(props.verdict, undefined, "raw verdict must not exist in v21 schema");
  assert.equal(props.audience_gap, undefined, "audience_gap is parsed from older/local records but omitted from strict schema");
  const required = PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.required as readonly string[];
  assert.equal(required.includes("audience_gap"), false, "audience_gap is optional and must not force a gap-shaped answer");
  for (const key of ["why_now", "validation_metric", "blockers"] as const) {
    assert.equal(props[key], undefined, `${key} is a legacy parser field, not part of the current strict schema`);
  }
  const agentTask = props.agent_task_spec as { type: unknown; required: string[] };
  assert.ok(Array.isArray(agentTask.type) && agentTask.type.includes("null"), "agent_task_spec must be nullable");
  assert.deepEqual([...agentTask.required].sort(), ["required_context", "target_agent", "task_prompt", "task_title"]);
  const evidenceNotes = props.evidence_notes as { items: { required: string[] } };
  assert.deepEqual([...evidenceNotes.items.required].sort(), [
    "grounding",
    "quote_summary",
    "ref",
    "reusable_pattern",
    "why_it_matters",
    "why_it_works"
  ]);
  const evidenceProps = evidenceNotes.items as unknown as { properties: Record<string, unknown> };
  assert.equal(evidenceProps.properties.copy_recipe_markdown, undefined);
  assert.equal(evidenceProps.properties.workflow_stack, undefined);
  assert.equal(evidenceProps.properties.copyable_template, undefined);
  assert.ok("product_reading" in props);
  assert.equal(props.application_suggestions, undefined);
  assert.equal(props.watch_guidance, undefined);
});

test("parseProductSignalAnalysisResponse only keeps agent task specs for try verdicts", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify({
      signal_type: "learning",
      signal_subtype: "agent_memory_pattern",
      content_type: "mixed",
      content_summary: "A reusable workflow pattern appears in the discussion.",
      relevance: 4,
      relevant_to: ["coreWorkflows"],
      why_relevant: "It maps to DLens product-mode decisions.",
      usefulness: "useful",
      testability: "not_yet_testable",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      reason: "Useful signal, but not concrete enough for a task yet.",
      experiment_hint: "",
      agent_task_spec: {
        target_agent: "codex",
        task_prompt: "You are helping test a workflow.",
        required_context: ["repo access"]
      },
      evidence_refs: ["e1"],
      evidence_notes: [{
        ref: "e1",
        quote_summary: "留言提出可以先保留觀察。",
        why_it_matters: "支撐先保留而不是直接 try。",
        grounding: "text_grounded",
        reusable_pattern: "先保留再驗證",
        why_it_works: "留言直接指出目前更適合先觀察。"
      }],
      product_reading: {
        headline: "先保留這條工作流方向",
        body: "文字證據顯示這個方向可能有價值，但目前還缺直接可做的小實驗。下一步應確認是否有第二個可重複案例。",
        support_refs: ["e1"]
      }
    }),
    analyzerInput,
    "2026-04-27T01:30:00.000Z"
  );

  assert.equal(parsed?.verdict, "watch");
  assert.equal(parsed?.agentTaskSpec, undefined);
});

function makeRawAnalysis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    signal_type: "learning",
    signal_subtype: "workflow_validation",
    content_type: "mixed",
    content_summary: "討論如何把產品假設收斂成小型驗證。",
    relevance: 5,
    relevant_to: ["coreWorkflows"],
    why_relevant: "留言提供可檢查的工作流觀察。",
    usefulness: "useful",
    testability: "reversible_test",
    evidence_state: "text_sufficient",
    conflict_state: "none",
    reason: "有明確文字證據可支持小型驗證。",
    experiment_hint: "先用一條已捕捉討論驗證流程。",
    agent_task_spec: null,
    evidence_refs: ["root", "e1", "e2"],
    evidence_notes: [
      {
        ref: "root",
        quote_summary: "主文分享一個具體功能。",
        why_it_matters: "直接支持產品判讀的來源描述。",
        grounding: "text_grounded",
        reusable_pattern: "先展示具體功能",
        why_it_works: "主文明確描述被分享的功能。"
      },
      {
        ref: "e1",
        quote_summary: "讀者表示流程符合實際工作。",
        why_it_matters: "直接支持產品流程假設。",
        grounding: "text_grounded",
        reusable_pattern: "先驗證再擴張",
        why_it_works: "讀者明確描述使用情境，足以形成有限驗證。"
      },
      {
        ref: "e2",
        quote_summary: "讀者追問與既有工具的差異。",
        why_it_matters: "支持先檢查產品定位差距。",
        grounding: "text_grounded",
        reusable_pattern: "比較定位差距",
        why_it_works: "追問直接揭示使用者需要辨識的差異。"
      }
    ],
    product_reading: {
      headline: "把產品假設收斂成小型驗證",
      body: "原文留言支持先驗證再擴張。對目前產品而言，可先以一條已捕捉討論測試分類流程，再決定是否擴大。",
      support_refs: ["e1", "e2"]
    },
    ...overrides
  };
}

function makeAxes(overrides: Partial<ProductSignalJudgmentAxes> = {}): ProductSignalJudgmentAxes {
  return {
    usefulness: "useful",
    testability: "reversible_test",
    evidenceState: "text_sufficient",
    conflictState: "none",
    ...overrides
  };
}

test("deriveProductSignalVerdict applies ordered policy and warning edges", () => {
  assert.deepEqual(
    deriveProductSignalVerdict({ signalType: "noise", judgmentAxes: makeAxes() }),
    { verdict: "park", warnings: [] }
  );
  assert.deepEqual(
    deriveProductSignalVerdict({
      signalType: "learning",
      judgmentAxes: makeAxes({ evidenceState: "insufficient", conflictState: "explicit_non_goal" })
    }),
    { verdict: "insufficient_data", warnings: [] }
  );
  assert.deepEqual(
    deriveProductSignalVerdict({
      signalType: "learning",
      judgmentAxes: makeAxes({ conflictState: "explicit_constraint" })
    }),
    { verdict: "park", warnings: [] }
  );
  assert.deepEqual(
    deriveProductSignalVerdict({
      signalType: "learning",
      judgmentAxes: makeAxes({ testability: "not_yet_testable" })
    }),
    { verdict: "watch", warnings: [] }
  );
  assert.deepEqual(
    deriveProductSignalVerdict({
      signalType: "learning",
      judgmentAxes: makeAxes({ usefulness: "none" })
    }),
    { verdict: "park", warnings: ["none_with_reversible_test"] }
  );
});

test("deriveProductSignalVerdict is total across all current axis combinations", () => {
  const usefulnessValues = ["useful", "uncertain", "none"] as const satisfies readonly ProductSignalUsefulness[];
  const testabilityValues = ["reversible_test", "not_yet_testable", "not_applicable"] as const satisfies readonly ProductSignalTestability[];
  const evidenceStateValues = ["text_sufficient", "external_unverified", "insufficient"] as const satisfies readonly ProductSignalEvidenceState[];
  const conflictStateValues = ["none", "explicit_constraint", "explicit_non_goal"] as const satisfies readonly ProductSignalConflictState[];

  let combinationCount = 0;
  let tryCount = 0;
  let insufficientCount = 0;
  let warnedCount = 0;

  for (const usefulness of usefulnessValues) {
    for (const testability of testabilityValues) {
      for (const evidenceState of evidenceStateValues) {
        for (const conflictState of conflictStateValues) {
          combinationCount += 1;
          const result = deriveProductSignalVerdict({
            signalType: "learning",
            judgmentAxes: {
              usefulness,
              testability,
              evidenceState,
              conflictState
            }
          });
          assert.ok(["try", "watch", "park", "insufficient_data"].includes(result.verdict));
          if (result.verdict === "try") {
            tryCount += 1;
          }
          if (result.verdict === "insufficient_data") {
            insufficientCount += 1;
          }
          if (result.warnings.includes("none_with_reversible_test")) {
            warnedCount += 1;
          }
        }
      }
    }
  }

  assert.equal(combinationCount, 81);
  assert.equal(tryCount, 1);
  assert.equal(insufficientCount, usefulnessValues.length * testabilityValues.length * conflictStateValues.length);
  assert.equal(warnedCount, 2);
});

test("v21 accepts a grounded complete reading for try and watch", () => {
  const tryParsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      product_reading: {
        headline: "用 hover 動畫回應可互動狀態",
        body: "原文展示 hover 觸發的動態回應。對目前產品而言，值得先在非核心按鈕做局部測試，並觀察流暢度與視覺一致性。",
        support_refs: ["root", "e1"]
      }
    })),
    analyzerInput
  );
  assert.equal(tryParsed?.verdict, "try");
  assert.deepEqual(tryParsed?.productReading?.supportRefs, ["root", "e1"]);

  const watchParsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      testability: "not_yet_testable",
      evidence_state: "external_unverified",
      productReading: {
        headline: "先保留互動方向並補足外部證據",
        body: "文字只描述互動效果，未檢查影片或外部連結。這可作為產品靈感，但應先確認實際動畫與現有介面是否相容。",
        supportRefs: ["e1"]
      }
    })),
    analyzerInput
  );
  assert.equal(watchParsed?.verdict, "watch");
  assert.deepEqual(watchParsed?.productReading?.supportRefs, ["e1"]);
});

test("v21 rejects actionable analysis without a complete reading", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      testability: "not_yet_testable",
      evidence_state: "external_unverified",
      product_reading: null
    })),
    analyzerInput
  );
  assert.equal(parsed, null);
});

test("v21 discards reading content for a non-actionable verdict", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      usefulness: "none",
      testability: "not_applicable",
      product_reading: {
        headline: "不應顯示",
        body: "這段不應形成高注意力內容。",
        support_refs: ["root"]
      }
    })),
    analyzerInput
  );
  assert.equal(parsed?.verdict, "park");
  assert.equal(parsed?.productReading, undefined);
});

test("v21 rejects malformed or ungrounded Product Readings", () => {
  const validReading = {
    headline: "先測試可檢查的流程",
    body: "原文提供具體文字證據。對目前產品而言，可先做一個有限、可停止的測試。",
    support_refs: ["e1"]
  };
  const invalidCases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ["blank headline", { headline: "   " }, {}],
    ["blank body", { body: "   " }, {}],
    ["zero refs", { support_refs: [] }, {}],
    ["more than five refs", { support_refs: ["root", "e1", "e2", "e3", "e4", "e5"] }, {}],
    ["duplicate refs", { support_refs: ["e1", "e1"] }, {}],
    ["empty ref", { support_refs: [""] }, {}],
    ["ref with whitespace", { support_refs: [" e1 "] }, {}],
    ["non-string ref", { support_refs: [1] }, {}],
    ["ref absent from evidence_refs", { support_refs: ["e2"] }, { evidence_refs: ["e1"] }],
    [
      "ref without text_grounded note",
      { support_refs: ["e1"] },
      {
        evidence_notes: [{
          ref: "e1",
          quote_summary: "只屬模型推論。",
          why_it_matters: "仍需驗證。",
          grounding: "model_inferred",
          reusable_pattern: "待驗證",
          why_it_works: "原文未直接支持。"
        }]
      }
    ],
    ["body over 1200 code points", { body: "判".repeat(1201) }, {}]
  ];

  for (const [label, readingOverrides, payloadOverrides] of invalidCases) {
    const parsed = parseProductSignalAnalysisResponse(
      JSON.stringify(makeRawAnalysis({
        product_reading: { ...validReading, ...readingOverrides },
        ...payloadOverrides
      })),
      analyzerInput
    );
    assert.equal(parsed, null, label);
  }
});

test("v21 accepts a grounded root-only Product Reading and caps the headline", () => {
  const rootOnlyInput = {
    ...analyzerInput,
    rootText: "作者說先展示可檢查結果，再要求採用。",
    discussionReplies: []
  };
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      evidence_refs: ["root"],
      evidence_notes: [{
        ref: "root",
        quote_summary: "主文說先展示可檢查結果。",
        why_it_matters: "支持以主文文字為根據的可測流程。",
        grounding: "text_grounded",
        reusable_pattern: "先展示再要求採用",
        why_it_works: "主文明確描述先讓使用者檢查結果再確認。"
      }],
      product_reading: {
        headline: "標".repeat(70),
        body: "主文明確描述先讓使用者檢查結果再確認，足以支持一項有限測試。",
        support_refs: ["root"]
      }
    })),
    rootOnlyInput
  );

  assert.equal(parsed?.productReading?.headline, "標".repeat(60));
  assert.deepEqual(parsed?.productReading?.supportRefs, ["root"]);
});

test("v21 does not fall back to retired proposal fields", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify(makeRawAnalysis({
      product_reading: null,
      application_suggestions: [{
        source_pattern: "舊版提案",
        fit_reason: "不應成為替代內容",
        small_test: "不應執行",
        product_context_target: "coreWorkflows",
        support_refs: ["e1"],
        verification_question: "不應讀取？"
      }],
      watch_guidance: {
        source_pattern: "舊版觀察",
        fit_reason: "不應成為替代內容",
        next_evidence: "不應讀取",
        support_refs: ["e1"]
      }
    })),
    analyzerInput
  );
  assert.equal(parsed, null);
});

test("parseProductSignalAnalysisResponse normalizes strict JSON and owns metadata", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify({
      signal_type: "competitor",
      signal_subtype: "productboard_gap",
      content_type: "mixed",
      content_summary: "A feature share that becomes a competitor comparison in replies.",
      relevance: 4,
      relevant_to: ["coreWorkflows", "evaluationCriteria", "technicalLearning", "not_a_field"],
      reference_type: "technical_learning",
      reference_label: "學習競品比較如何轉成分類隊列",
      reference_takeaway: "這不一定要變成新功能，但可學習如何把比較討論轉成 product decision queue。",
      why_relevant: "It touches how DLens should turn saved posts into product decisions.",
      usefulness: "useful",
      testability: "reversible_test",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      reason: "The comment thread exposes a concrete positioning gap.",
      experiment_hint: "Test a one-click classification queue.",
      agent_task_spec: {
        target_agent: "codex",
        task_prompt: "You are helping test a one-click classification queue.\n\nTask:\n1. Inspect the current product flow.\n2. Draft a small experiment.\n\nSuccess: one testable plan exists.\nStop condition: missing repo context.",
        required_context: ["repo access", "current product README"]
      },
      evidence_refs: ["e1", "e2", "missing"],
      evidence_notes: [
        {
          ref: "e1",
          quote_summary: "主文有具體流程。",
          why_it_matters: "支撐可逆驗證。",
          grounding: "text_grounded",
          reusable_pattern: "先驗證再擴張",
          why_it_works: "文字直接描述可檢查的流程。"
        },
        {
          ref: "e2",
          quote_summary: "回覆追問定位差距。",
          why_it_matters: "支撐第二條來源。",
          grounding: "text_grounded",
          reusable_pattern: "定位差距檢查",
          why_it_works: "回覆直接點出需要驗證的差異。"
        }
      ],
      product_reading: {
        headline: "先把定位比較收斂成單一步驟驗證",
        body: "主文與回覆顯示使用者需要先看見可檢查的分類結果，再決定是否採用。對目前產品而言，可先在一個入口測試單步分類驗證。",
        support_refs: ["e1", "e2"]
      }
    }),
    analyzerInput,
    "2026-04-27T01:00:00.000Z"
  );

  assert.deepEqual(parsed, {
    signalId: "signal-1",
    signalType: "competitor",
    signalSubtype: "productboard_gap",
    contentType: "mixed",
    contentSummary: "A feature share that becomes a competitor comparison in replies.",
    relevance: 4,
    relevantTo: ["coreWorkflows", "evaluationCriteria", "technicalLearning"],
    referenceType: "technical_learning",
    referenceLabel: "學習競品比較如何轉成分類隊列",
    referenceTakeaway: "這不一定要變成新功能，但可學習如何把比較討論轉成 product decision queue。",
    whyRelevant: "It touches how DLens should turn saved posts into product decisions.",
    verdict: "try",
    reason: "The comment thread exposes a concrete positioning gap.",
    experimentHint: "Test a one-click classification queue.",
    agentTaskSpec: {
      targetAgent: "codex",
      taskPrompt: "You are helping test a one-click classification queue.\n\nTask:\n1. Inspect the current product flow.\n2. Draft a small experiment.\n\nSuccess: one testable plan exists.\nStop condition: missing repo context.",
      requiredContext: ["repo access", "current product README"]
    },
    evidenceRefs: ["e1", "e2"],
    evidenceNotes: [
      {
        ref: "e1",
        quoteSummary: "主文有具體流程。",
        whyItMatters: "支撐可逆驗證。",
        grounding: "text_grounded",
        reusablePattern: "先驗證再擴張",
        whyItWorks: "文字直接描述可檢查的流程。"
      },
      {
        ref: "e2",
        quoteSummary: "回覆追問定位差距。",
        whyItMatters: "支撐第二條來源。",
        grounding: "text_grounded",
        reusablePattern: "定位差距檢查",
        whyItWorks: "回覆直接點出需要驗證的差異。"
      }
    ],
    productReading: {
      headline: "先把定位比較收斂成單一步驟驗證",
      body: "主文與回覆顯示使用者需要先看見可檢查的分類結果，再決定是否採用。對目前產品而言，可先在一個入口測試單步分類驗證。",
      supportRefs: ["e1", "e2"]
    },
    judgmentAxes: {
      usefulness: "useful",
      testability: "reversible_test",
      evidenceState: "text_sufficient",
      conflictState: "none"
    },
    warnings: [],
    productContextHash: analyzerInput.productContextHash,
    promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
    analyzedAt: "2026-04-27T01:00:00.000Z",
    status: "complete"
  });
});

test("parseProductSignalAnalysisResponse preserves legacy optional fields when present", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify({
      signal_type: "demand",
      signal_subtype: "pm_document_generation",
      content_type: "discussion_starter",
      content_summary: "PM 想把 Threads 討論轉成可交付文件。",
      relevance: 5,
      relevant_to: ["coreWorkflows"],
      why_relevant: "對應 product mode 的核心承諾。",
      usefulness: "useful",
      testability: "reversible_test",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      reason: "高互動 reply 都在問可交付格式。",
      audience_gap: "作者預期討論文件生成；觀眾實際追問怎樣接進既有 PM 流程。",
      experiment_hint: "做一個 release note 模板。",
      why_now: "競品上週剛 ship，現在試最不會被搶先。",
      validation_metric: "兩週內看是否有 3 位 PM 重複使用。",
      blockers: ["缺 Confluence webhook", "需要授權"],
      agent_task_spec: {
        target_agent: "codex",
        task_title: "競品 Release 監控",
        task_prompt: "You are helping monitor competitor releases.",
        required_context: ["RSS feed"]
      },
      evidence_refs: ["e1", "e2"],
      evidence_notes: [
        {
          ref: "e1",
          quote_summary: "提到 Claude Skill 取代 Slack。",
          why_it_matters: "直接驗證需求。",
          grounding: "text_grounded",
          reusable_pattern: "多來源工作流轉文件",
          why_it_works: "把資料來源、處理邏輯和交付物分清楚。",
          copyable_template: "Slack/Jira -> Claude Skill -> Release note",
          workflow_stack: ["Claude Skill", "Slack", "Jira"],
          copy_recipe_markdown: "- 讀取 Slack thread 與 Jira tickets\n- 交給 Claude Skill 摘要\n- 輸出 Release Note",
          tradeoff: "需要工具授權與資料讀取權限。"
        },
        {
          ref: "e2",
          quote_summary: "建議用 Metabase 做分析。",
          why_it_matters: "支撐自動化。",
          grounding: "text_grounded",
          reusable_pattern: "資料庫查詢轉產品洞察",
          why_it_works: "讓 agent 直接處理已存在的營運資料。",
          copyable_template: "Metabase/SQL -> Claude -> 分析摘要",
          workflow_stack: ["Metabase", "SQL", "Claude"],
          copy_recipe_markdown: "- 查詢 Metabase/SQL\n- 交給 Claude 解讀\n- 輸出產品分析摘要",
          tradeoff: "需要避免暴露敏感營運資料。"
        },
        {
          ref: "e9",
          quote_summary: "不在 evidence_refs。",
          why_it_matters: "應被丟棄。",
          reusable_pattern: "錯誤引用",
          why_it_works: "不應顯示。",
          copyable_template: "none",
          workflow_stack: [],
          copy_recipe_markdown: "",
          tradeoff: "不應顯示。"
        }
      ],
      product_reading: {
        headline: "把討論收斂成可交付文件模板",
        body: "兩則回覆提供了把資料來源轉成文件與分析摘要的具體工作流。對目前產品而言，可先用一個 release note 模板驗證 PM 是否重複使用。",
        support_refs: ["e1", "e2"]
      }
    }),
    analyzerInput,
    "2026-04-28T01:00:00.000Z"
  );

  assert.equal(parsed?.whyNow, "競品上週剛 ship，現在試最不會被搶先。");
  assert.equal(parsed?.validationMetric, "兩週內看是否有 3 位 PM 重複使用。");
  assert.deepEqual(parsed?.blockers, ["缺 Confluence webhook", "需要授權"]);
  assert.equal(parsed?.audienceGap, "作者預期討論文件生成；觀眾實際追問怎樣接進既有 PM 流程。");
  assert.equal(parsed?.agentTaskSpec?.taskTitle, "競品 Release 監");
  assert.deepEqual(parsed?.judgmentAxes, {
    usefulness: "useful",
    testability: "reversible_test",
    evidenceState: "text_sufficient",
    conflictState: "none"
  });
  assert.deepEqual(parsed?.warnings, []);
  assert.deepEqual(parsed?.productReading?.supportRefs, ["e1", "e2"]);
  assert.deepEqual(parsed?.evidenceNotes, [
    {
      ref: "e1",
      quoteSummary: "提到 Claude Skill 取代 Slack。",
      whyItMatters: "直接驗證需求。",
      grounding: "text_grounded",
      reusablePattern: "多來源工作流轉文件",
      whyItWorks: "把資料來源、處理邏輯和交付物分清楚。",
      copyableTemplate: "Slack/Jira -> Claude Skill -> Release note",
      workflowStack: ["Claude Skill", "Slack", "Jira"],
      copyRecipeMarkdown: "- 讀取 Slack thread 與 Jira tickets\n- 交給 Claude Skill 摘要\n- 輸出 Release Note",
      tradeoff: "需要工具授權與資料讀取權限。"
    },
    {
      ref: "e2",
      quoteSummary: "建議用 Metabase 做分析。",
      whyItMatters: "支撐自動化。",
      grounding: "text_grounded",
      reusablePattern: "資料庫查詢轉產品洞察",
      whyItWorks: "讓 agent 直接處理已存在的營運資料。",
      copyableTemplate: "Metabase/SQL -> Claude -> 分析摘要",
      workflowStack: ["Metabase", "SQL", "Claude"],
      copyRecipeMarkdown: "- 查詢 Metabase/SQL\n- 交給 Claude 解讀\n- 輸出產品分析摘要",
      tradeoff: "需要避免暴露敏感營運資料。"
    }
  ]);
});

test("parseProductSignalAnalysisResponse drops whyNow/validationMetric for park verdict", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify({
      signal_type: "noise",
      signal_subtype: "off_topic_chatter",
      content_type: "content",
      content_summary: "閒聊。",
      relevance: 1,
      relevant_to: [],
      why_relevant: "弱關聯。",
      usefulness: "none",
      testability: "not_applicable",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      reason: "不符合產品方向。",
      experiment_hint: "",
      why_now: "should be dropped",
      validation_metric: "should be dropped",
      blockers: [],
      evidence_refs: [],
      evidence_notes: [],
      product_reading: null
    }),
    analyzerInput
  );

  assert.equal(parsed?.whyNow, undefined);
  assert.equal(parsed?.validationMetric, undefined);
  assert.equal(parsed?.blockers, undefined);
});

test("buildProductSignalAnalyzerPrompt enforces evidence-specific Product Reading and product-aware blocking", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);
  assert.match(prompt, /所有面向用戶的文字欄位用繁體中文/);
  assert.match(prompt, /reference_type/);
  assert.match(prompt, /reference_takeaway/);
  assert.match(prompt, /所有 schema keys 都必須出現/);
  assert.match(prompt, /四軸：usefulness、testability、evidence_state、conflict_state/);
  assert.match(prompt, /product_reading/);
  assert.match(prompt, /evidence|證據/i);
  assert.match(prompt, /inference|推論/i);
  assert.match(prompt, /uncertainty|不確定/i);
  assert.doesNotMatch(prompt, /why_now/);
  assert.doesNotMatch(prompt, /validation_metric/);
  assert.doesNotMatch(prompt, /blockers/);
  assert.match(prompt, /evidence_notes/);
  assert.match(prompt, /task_title/);
  assert.match(prompt, /support_refs/);
  assert.match(prompt, /text_grounded/);
  assert.match(prompt, /external media\/repo\/link contents remain unverified/i);
});

test("buildProductSignalAnalyzerPrompt defines a complete free-form reading without a hand-authored example", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);

  assert.match(prompt, /product_reading/);
  assert.doesNotMatch(prompt, /application_suggestions/);
  assert.doesNotMatch(prompt, /watch_guidance/);
  assert.match(prompt, /ProductContext/);
  assert.match(prompt, /evidence_refs/);
  assert.match(prompt, /text_grounded/);
  assert.match(prompt, /可逆|有限/);
  assert.match(prompt, /headline/);
  assert.match(prompt, /body/);
  assert.match(prompt, /support_refs/);
  for (const fixtureMarker of ["Focus Blur", "Stamp Arc", "刪除震動"]) {
    assert.doesNotMatch(prompt, new RegExp(fixtureMarker), `prompt must not contain G/G1 fixture marker: ${fixtureMarker}`);
  }
});

test("buildProductSignalAnalyzerPrompt gives enough room and examples for technical understanding", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);

  assert.match(prompt, /結構化欄位/);
  assert.match(prompt, /signal_type/);
  assert.match(prompt, /usefulness/);
  assert.match(prompt, /conflict_state/);
});

test("parseProductSignalAnalysisResponse keeps longer evidence explanations but caps task title to UI length", () => {
  const longWhy = "MCP 透過標準協議讓 host 動態發現 server 能力，不需要硬編碼每個 API；新工具加入時，agent 只需讀取工具描述與參數 schema，就能把資料來源、處理步驟和輸出格式串起來。它的關鍵不是省時間，而是把工具能力描述成可檢查的合約，讓模型每次都能根據目前可用工具重新規劃。額外文字會被截斷。";
  const longRecipe = [
    "1. 在 MCP server 宣告可讀取的資料來源、工具名稱與參數 schema，讓 host 能在啟動時動態 discovery。",
    "2. 在 Codex 或 Claude 裡要求 agent 先列出可用工具，再選擇和任務相符的資料來源，避免直接猜 API。",
    "3. 讓 agent 依工具回傳結果產出 markdown 摘要，並把來源連結、限制和待人工確認項目放在同一份交付物。",
    "4. 如果資料來源需要權限，先用 read-only token 測試，確認最小權限足以完成輸入、處理、輸出三段流程。",
    "5. 將這個流程記錄成 repo-local skill，下一次只替換資料來源和輸出格式，不重寫整段 prompt。"
  ].join("\n");

  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify({
      signal_type: "technical",
      signal_subtype: "mcp_integration",
      content_type: "mixed",
      content_summary: "討論 MCP 如何串接 agent 工具。",
      relevance: 5,
      relevant_to: ["coreWorkflows"],
      why_relevant: "對應產品把 Threads 訊號轉成 agent 工作流的方向。",
      usefulness: "useful",
      testability: "reversible_test",
      evidence_state: "text_sufficient",
      conflict_state: "none",
      reason: "留言提供了可複製的工程做法。",
      experiment_hint: "用 read-only MCP server 測一條資料流。",
      agent_task_spec: {
        target_agent: "codex",
        task_title: "超過十二字的任務標題會被截斷",
        task_prompt: "1. Inspect MCP config.\n2. Draft a read-only integration.\n3. Return risks.",
        required_context: ["repo access"]
      },
      evidence_refs: ["e1"],
      evidence_notes: [{
        ref: "e1",
        quote_summary: "用 MCP 串 agent 工具。",
        why_it_matters: "提供具體工程路徑。",
        grounding: "text_grounded",
        reusable_pattern: "MCP 工具發現流程",
        why_it_works: longWhy,
        copyable_template: "MCP server -> agent tool discovery -> markdown brief",
        workflow_stack: ["MCP", "Codex", "Claude"],
        copy_recipe_markdown: longRecipe,
        tradeoff: "需要控管 tool 權限。"
      }],
      product_reading: {
        headline: "用 read-only MCP 驗證單條資料流",
        body: "留言提供了工具發現與可檢查輸出的文字證據。對目前產品而言，可先接一條 read-only MCP 資料流並驗證能否穩定輸出摘要。",
        support_refs: ["e1"]
      }
    }),
    analyzerInput
  );

  assert.equal(parsed?.agentTaskSpec?.taskTitle.length, 12);
  assert.equal(parsed?.evidenceNotes?.[0]?.grounding, "text_grounded");
  assert.equal(parsed?.evidenceNotes?.[0]?.whyItWorks?.length, 150);
  assert.equal(parsed?.evidenceNotes?.[0]?.copyRecipeMarkdown, longRecipe);
});

test("buildProductSignalAnalyzerPrompt includes local feedback examples only when provided", () => {
  const prompt = buildProductSignalAnalyzerPrompt({
    ...analyzerInput,
    feedbackExamples: [
      {
        signalId: "signal-adopted",
        signalSubtype: "pm_document_generation",
        contentSummary: "已採用：把 Threads 討論轉成 release note。",
        feedback: "adopted",
        taskTitle: "Release 文件",
        taskPrompt: "You are helping draft release notes from Threads evidence.",
        createdAt: "2026-04-28T03:00:00.000Z"
      },
      {
        signalId: "signal-rewrite",
        signalSubtype: "browser_automation",
        contentSummary: "需要改寫：自動抓資料但缺 repo context。",
        feedback: "needs_rewrite",
        note: "補 repo context。",
        taskTitle: "自動抓取",
        taskPrompt: "You are helping automate a browser crawl.",
        createdAt: "2026-04-28T04:00:00.000Z"
      }
    ]
  });
  const promptWithoutExamples = buildProductSignalAnalyzerPrompt(analyzerInput);

  assert.match(prompt, /\[USER_FEEDBACK_EXAMPLES\]/);
  assert.match(prompt, /feedback=adopted/);
  assert.match(prompt, /已採用：把 Threads 討論轉成 release note/);
  assert.match(prompt, /feedback=needs_rewrite/);
  assert.match(prompt, /補 repo context/);
  assert.doesNotMatch(promptWithoutExamples, /\[USER_FEEDBACK_EXAMPLES\]/);
});

test("PROMPT_VERSION + CACHE_VERSION are v21", async () => {
  const { PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION } = await import("../src/compare/product-signal-analysis.ts");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, "v21");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION, "v21");
});

test("parseProductSignalAnalysisResponse rejects incomplete or fake score payloads", () => {
  assert.equal(parseProductSignalAnalysisResponse("{}", analyzerInput), null);
  assert.equal(
    parseProductSignalAnalysisResponse(
      JSON.stringify({
        signal_type: "learning",
        signal_subtype: "x",
        content_type: "content",
        content_summary: "summary",
        relevance: 9,
        relevant_to: ["coreWorkflows"],
        why_relevant: "why",
        usefulness: "useful",
        testability: "reversible_test",
        evidence_state: "text_sufficient",
        conflict_state: "none",
        reason: "reason",
        evidence_refs: [],
        evidence_notes: [],
        product_reading: null
      }),
      analyzerInput
    ),
    null
  );
});

test("buildProductSignalAnalyzerInputFromCapture prefers backend thread_read_model", () => {
  const input = buildProductSignalAnalyzerInputFromCapture({
    signalId: "signal-1",
    source: "threads",
    productContext,
    productContextHash: analyzerInput.productContextHash,
    capture: {
      text_snippet: "legacy snippet",
      result: {
        thread_read_model: {
          root_post: { text: "Root post plus OP continuation." },
          assembled_content: "Root post plus OP continuation.",
          discussion_replies: [
            { comment_id: "c1", author: "reader", text: "I would use this.", like_count: 3 }
          ]
        }
      }
    } as any
  });

  assert.equal(input?.rootText, "Root post plus OP continuation.");
  assert.deepEqual(input, {
    signalId: "signal-1",
    source: "threads",
    rootText: "Root post plus OP continuation.",
    assembledContent: "Root post plus OP continuation.",
    discussionReplies: [
      {
        id: "c1",
        author: "reader",
        text: "I would use this.",
        likeCount: 3,
        role: "audience",
        isOrphan: false,
        parentId: null,
        resolvedParentId: null
      }
    ],
    productContext,
    productContextHash: analyzerInput.productContextHash
  });
});

test("buildProductSignalEvidenceCatalogFromCapture maps discussion replies to stable evidence refs", () => {
  const evidence = buildProductSignalEvidenceCatalogFromCapture({
    result: {
      thread_read_model: {
        assembled_content: "Root",
        discussion_replies: [
          { comment_id: "c1", author: "reader", text: "Recurring crawl would help.", like_count: 5 },
          { comment_id: "c2", author: "pm", text: "Export this into a PM doc.", like_count: 2 }
        ]
      }
    }
  } as any);

  assert.deepEqual(evidence, [
    {
      ref: "e1",
      id: "c1",
      author: "reader",
      text: "Recurring crawl would help.",
      likeCount: 5,
      role: "audience",
      isOrphan: false,
      parentId: null,
      resolvedParentId: null
    },
    {
      ref: "e2",
      id: "c2",
      author: "pm",
      text: "Export this into a PM doc.",
      likeCount: 2,
      role: "audience",
      isOrphan: false,
      parentId: null,
      resolvedParentId: null
    }
  ]);
});

test("buildProductSignalEvidenceCatalogFromCapture preserves OP reply and orphan metadata", () => {
  const evidence = buildProductSignalEvidenceCatalogFromCapture({
    result: {
      thread_read_model: {
        root_post: { author: "op", text: "Root" },
        assembled_content: "Root",
        discussion_replies: [
          { comment_id: "op-r1", author: "op", text: "OP replies to a reader.", like_count: 2 },
          { comment_id: "c2", author: "reader", text: "Orphaned child.", parent_comment_id: "missing", like_count: 1 }
        ],
        orphan_replies: [
          {
            comment_id: "c2",
            parent_comment_id: "missing",
            parent_source_comment_id: null,
            reason: "parent_not_found_in_comments_or_root"
          }
        ],
        reply_edges: []
      }
    }
  } as any);

  assert.deepEqual(evidence.map((entry) => [entry.ref, entry.id, entry.role, entry.isOrphan]), [
    ["e1", "op-r1", "op_reply", false],
    ["e2", "c2", "audience", true]
  ]);
});

test("shouldAutoAnalyzeProductSignal only schedules ready product-mode captures", () => {
  assert.equal(
    shouldAutoAnalyzeProductSignal({
      sessionMode: "product",
      itemStatus: "succeeded",
      capture: {
        result: {
          thread_read_model: {
            assembled_content: "Root plus continuation",
            discussion_replies: []
          }
        }
      } as any,
      existingAnalysis: null,
      productContextHash: analyzerInput.productContextHash
    }),
    true
  );

  assert.equal(
    shouldAutoAnalyzeProductSignal({
      sessionMode: "topic",
      itemStatus: "succeeded",
      capture: {
        result: {
          thread_read_model: {
            assembled_content: "Root",
            discussion_replies: []
          }
        }
      } as any,
      existingAnalysis: null,
      productContextHash: analyzerInput.productContextHash
    }),
    false
  );

  assert.equal(
    shouldAutoAnalyzeProductSignal({
      sessionMode: "product",
      itemStatus: "succeeded",
      capture: {
        text_snippet: "Extension capture text can still seed a product judgment.",
        result: {
          thread_read_model: {
            assembled_content: "",
            discussion_replies: []
          }
        }
      } as any,
      existingAnalysis: null,
      productContextHash: analyzerInput.productContextHash
    }),
    true
  );

  assert.equal(
    shouldAutoAnalyzeProductSignal({
      sessionMode: "product",
      itemStatus: "succeeded",
      capture: {
        result: {
          thread_read_model: {
            assembled_content: "",
            discussion_replies: []
          }
        }
      } as any,
      existingAnalysis: null,
      productContextHash: analyzerInput.productContextHash
    }),
    false
  );

  assert.equal(
    shouldAutoAnalyzeProductSignal({
      sessionMode: "product",
      itemStatus: "succeeded",
      capture: {
        result: {
          thread_read_model: {
            assembled_content: "Root",
            discussion_replies: []
          }
        }
      } as any,
      existingAnalysis: {
        signalId: "signal-1",
        signalType: "learning",
        signalSubtype: "agent_memory_pattern",
        contentType: "content",
        contentSummary: "summary",
        relevance: 4,
        relevantTo: ["coreWorkflows"],
        whyRelevant: "why",
        verdict: "watch",
        reason: "reason",
        evidenceRefs: [],
        productContextHash: analyzerInput.productContextHash,
        promptVersion: PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION,
        analyzedAt: "2026-04-27T01:00:00.000Z",
        status: "complete"
      },
      productContextHash: analyzerInput.productContextHash
    }),
    false
  );
});

test("collectQueueableProductSignalItemIds returns saved backing items only once", () => {
  const session = {
    id: "session-product",
    mode: "product",
    items: [
      { id: "item-saved", status: "saved" },
      { id: "item-queued", status: "queued" },
      { id: "item-failed", status: "failed" }
    ]
  } as SessionRecord;
  const signals = [
    {
      id: "signal-1",
      sessionId: "session-product",
      itemId: "item-saved",
      source: "threads",
      inboxStatus: "unprocessed",
      capturedAt: "2026-04-27T00:00:00.000Z"
    },
    {
      id: "signal-2",
      sessionId: "session-product",
      itemId: "item-saved",
      source: "threads",
      inboxStatus: "unprocessed",
      capturedAt: "2026-04-27T00:00:01.000Z"
    },
    {
      id: "signal-3",
      sessionId: "session-product",
      itemId: "item-queued",
      source: "threads",
      inboxStatus: "unprocessed",
      capturedAt: "2026-04-27T00:00:02.000Z"
    },
    {
      id: "signal-4",
      sessionId: "session-product",
      itemId: "item-failed",
      source: "threads",
      inboxStatus: "rejected",
      capturedAt: "2026-04-27T00:00:03.000Z"
    }
  ] satisfies Signal[];

  assert.deepEqual(collectQueueableProductSignalItemIds(session, signals), ["item-saved"]);
});

test("product signal analysis starts the backend worker after queueing saved signals", () => {
  assert.equal(shouldDrainWorkerAfterProductSignalQueue(0, false), false);
  assert.equal(shouldDrainWorkerAfterProductSignalQueue(0, true), true);
  assert.equal(shouldDrainWorkerAfterProductSignalQueue(1, false), true);
  assert.equal(shouldDrainWorkerAfterProductSignalQueue(3, false), true);
});

test("hasDrainableProductSignalItems detects already queued product signal work", () => {
  const session = {
    id: "session-product",
    mode: "product",
    items: [
      { id: "item-saved", status: "saved" },
      { id: "item-queued", status: "queued" }
    ]
  } as SessionRecord;
  const signals = [
    {
      id: "signal-queued",
      sessionId: "session-product",
      itemId: "item-queued",
      source: "threads",
      inboxStatus: "unprocessed",
      capturedAt: "2026-04-27T00:00:02.000Z"
    }
  ] satisfies Signal[];

  assert.equal(hasDrainableProductSignalItems(session, signals), true);
});
