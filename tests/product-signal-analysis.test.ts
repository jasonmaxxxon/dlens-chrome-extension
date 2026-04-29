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
  parseProductSignalAnalysisResponse,
  shouldAutoAnalyzeProductSignal
} from "../src/compare/product-signal-analysis.ts";
import type { ProductContext, SessionRecord, Signal } from "../src/state/types.ts";

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
  assembledContent: "Root feature share\n\nOP continues with implementation details.",
  discussionReplies: [
    { id: "c1", author: "bob", text: "This matches my workflow.", likeCount: 4 },
    { id: "c2", author: "cara", text: "How is this different from Productboard?", likeCount: 2 }
  ],
  productContext,
  productContextHash: buildProductContextHash(productContext)
};

test("buildProductSignalAnalyzerPrompt uses assembled content and no contentTypeHint", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);

  assert.match(prompt, /ProductSignalAnalyzer/);
  assert.match(prompt, /Root feature share/);
  assert.match(prompt, /OP continues with implementation details/);
  assert.match(prompt, /e1 author=bob likes=4/);
  assert.match(prompt, /把 Threads 訊號變成產品判斷/);
  assert.match(prompt, /"verdict": "try\\|watch\\|park\\|insufficient_data"/);
  assert.match(prompt, /mcp_integration/);
  assert.match(prompt, /不要提 cluster/);
  assert.doesNotMatch(prompt, /contentTypeHint/i);
});

test("ProductSignalAnalyzer exposes a strict JSON schema contract", () => {
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.type, "object");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.required, [
    "signal_type",
    "signal_subtype",
    "content_type",
    "content_summary",
    "relevance",
    "relevant_to",
    "why_relevant",
    "verdict",
    "reason",
    "experiment_hint",
    "agent_task_spec",
    "evidence_refs",
    "evidence_notes"
  ]);
  assert.ok("agent_task_spec" in PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.signal_type.enum, [
    "learning",
    "competitor",
    "demand",
    "technical",
    "noise"
  ]);
  assert.deepEqual(PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties.verdict.enum, [
    "try",
    "watch",
    "park",
    "insufficient_data"
  ]);
});

// Offline e2e equivalent for OpenAI strict mode: no API call, but enforces every
// requirement OpenAI Structured Outputs documents for response_format.json_schema
// (every property in `required`, optionals as type+null union, nested objects also
// strict). Catches the failure mode Codex flagged without needing a key.
test("PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA satisfies OpenAI Structured Outputs strict mode", () => {
  type SchemaNode = {
    type?: unknown;
    properties?: Record<string, SchemaNode>;
    required?: string[];
    additionalProperties?: boolean;
    items?: SchemaNode;
    enum?: unknown[];
  };

  function walk(node: SchemaNode, path: string): void {
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
  const props = PRODUCT_SIGNAL_ANALYSIS_JSON_SCHEMA.properties;
  const experiment = props.experiment_hint as { type: unknown };
  assert.ok(Array.isArray(experiment.type) && experiment.type.includes("null"), "experiment_hint must be nullable");
  for (const key of ["why_now", "validation_metric", "blockers"] as const) {
    assert.equal(props[key], undefined, `${key} is a legacy parser field, not part of the current strict schema`);
  }
  const agentTask = props.agent_task_spec as { type: unknown; required: string[] };
  assert.ok(Array.isArray(agentTask.type) && agentTask.type.includes("null"), "agent_task_spec must be nullable");
  assert.deepEqual([...agentTask.required].sort(), ["required_context", "target_agent", "task_prompt", "task_title"]);
  const evidenceNotes = props.evidence_notes as { items: { required: string[] } };
  assert.deepEqual([...evidenceNotes.items.required].sort(), [
    "copy_recipe_markdown",
    "copyable_template",
    "quote_summary",
    "ref",
    "reusable_pattern",
    "tradeoff",
    "why_it_matters",
    "why_it_works",
    "workflow_stack"
  ]);
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
      verdict: "watch",
      reason: "Useful signal, but not concrete enough for a task yet.",
      experiment_hint: "",
      agent_task_spec: {
        target_agent: "codex",
        task_prompt: "You are helping test a workflow.",
        required_context: ["repo access"]
      },
      evidence_refs: ["e1"]
    }),
    analyzerInput,
    "2026-04-27T01:30:00.000Z"
  );

  assert.equal(parsed?.verdict, "watch");
  assert.equal(parsed?.agentTaskSpec, undefined);
});

test("parseProductSignalAnalysisResponse normalizes strict JSON and owns metadata", () => {
  const parsed = parseProductSignalAnalysisResponse(
    JSON.stringify({
      signal_type: "competitor",
      signal_subtype: "productboard_gap",
      content_type: "mixed",
      content_summary: "A feature share that becomes a competitor comparison in replies.",
      relevance: 4,
      relevant_to: ["coreWorkflows", "evaluationCriteria", "not_a_field"],
      why_relevant: "It touches how DLens should turn saved posts into product decisions.",
      verdict: "try",
      reason: "The comment thread exposes a concrete positioning gap.",
      experiment_hint: "Test a one-click classification queue.",
      agent_task_spec: {
        target_agent: "codex",
        task_prompt: "You are helping test a one-click classification queue.\n\nTask:\n1. Inspect the current product flow.\n2. Draft a small experiment.\n\nSuccess: one testable plan exists.\nStop condition: missing repo context.",
        required_context: ["repo access", "current product README"]
      },
      evidence_refs: ["e1", "e2", "missing"]
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
    relevantTo: ["coreWorkflows", "evaluationCriteria"],
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
      verdict: "try",
      reason: "高互動 reply 都在問可交付格式。",
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
      ]
    }),
    analyzerInput,
    "2026-04-28T01:00:00.000Z"
  );

  assert.equal(parsed?.whyNow, "競品上週剛 ship，現在試最不會被搶先。");
  assert.equal(parsed?.validationMetric, "兩週內看是否有 3 位 PM 重複使用。");
  assert.deepEqual(parsed?.blockers, ["缺 Confluence webhook", "需要授權"]);
  assert.equal(parsed?.agentTaskSpec?.taskTitle, "競品 Release 監控");
  assert.deepEqual(parsed?.evidenceNotes, [
    {
      ref: "e1",
      quoteSummary: "提到 Claude Skill 取代 Slack。",
      whyItMatters: "直接驗證需求。",
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
      verdict: "park",
      reason: "不符合產品方向。",
      experiment_hint: "",
      why_now: "should be dropped",
      validation_metric: "should be dropped",
      blockers: [],
      evidence_refs: []
    }),
    analyzerInput
  );

  assert.equal(parsed?.whyNow, undefined);
  assert.equal(parsed?.validationMetric, undefined);
  assert.equal(parsed?.blockers, undefined);
});

test("buildProductSignalAnalyzerPrompt v8 enforces evidence-specific workflow recipes", () => {
  const prompt = buildProductSignalAnalyzerPrompt(analyzerInput);
  assert.match(prompt, /必須用繁體中文書寫/);
  assert.match(prompt, /具體 workflow \/ use case/);
  assert.match(prompt, /不要寫「PM 熱烈討論」「市場熱度高」/);
  assert.match(prompt, /所有 schema keys 都必須出現/);
  assert.match(prompt, /agent_task_spec: 只有 verdict=try 時填 object/);
  assert.doesNotMatch(prompt, /why_now/);
  assert.doesNotMatch(prompt, /validation_metric/);
  assert.doesNotMatch(prompt, /blockers/);
  assert.match(prompt, /evidence_notes/);
  assert.match(prompt, /quote_summary/);
  assert.match(prompt, /why_it_matters/);
  assert.match(prompt, /reusable_pattern/);
  assert.match(prompt, /why_it_works/);
  assert.match(prompt, /copyable_template/);
  assert.match(prompt, /workflow_stack/);
  assert.match(prompt, /copy_recipe_markdown/);
  assert.match(prompt, /tradeoff/);
  assert.match(prompt, /不要把 thread-level content_summary/);
  assert.match(prompt, /quote 太短/);
  assert.match(prompt, /如何照抄/);
  assert.match(prompt, /task_title/);
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

test("PROMPT_VERSION + CACHE_VERSION are v8 (evidence recipe prompt)", async () => {
  const { PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION } = await import("../src/compare/product-signal-analysis.ts");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_PROMPT_VERSION, "v8");
  assert.equal(PRODUCT_SIGNAL_ANALYSIS_CACHE_VERSION, "v8");
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
        verdict: "try",
        reason: "reason",
        evidence_refs: []
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
          assembled_content: "Root post plus OP continuation.",
          discussion_replies: [
            { comment_id: "c1", author: "reader", text: "I would use this.", like_count: 3 }
          ]
        }
      }
    } as any
  });

  assert.deepEqual(input, {
    signalId: "signal-1",
    source: "threads",
    assembledContent: "Root post plus OP continuation.",
    discussionReplies: [
      { id: "c1", author: "reader", text: "I would use this.", likeCount: 3 }
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
    { ref: "e1", id: "c1", author: "reader", text: "Recurring crawl would help.", likeCount: 5 },
    { ref: "e2", id: "c2", author: "pm", text: "Export this into a PM doc.", likeCount: 2 }
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
